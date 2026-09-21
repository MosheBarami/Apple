#!/usr/bin/env node
// Run the checks CI runs, against a CLEAN CLONE of HEAD, on this machine.
//
// WHY THIS EXISTS. Two separate failures, one night, 2026-09-21.
//
// GitHub Actions stopped running this repository at 02:58 — "the job was not started because
// recent account payments have failed". Six jobs, `steps: []`, one to seven seconds each, all
// reported as `failure`. The runner is the only place this repository has ever measured itself in
// the state a customer would get, and it is dark until somebody with a payment method fixes it.
// See docs/backlog/CI-IS-BLOCKED-ON-GITHUB-BILLING-2026-09-21.md.
//
// And separately, four times in one night, a test passed here and failed there. The corpus test
// read a 10 MB gitignored artefact (1567734). `App.tsx` opened on a Mac and was ENOENT on the
// runner (ace0773). Three more tests in apps/worker needed files that are in no clone (fa2b900).
// The guidance test resolved paths with `existsSync` and so was green on every developer machine
// and red on every runner (9ffba9f). Every one of them was invisible locally BECAUSE the local
// tree is not the tree that ships: it carries build output, secrets, caches and other lanes'
// uncommitted edits.
//
// So: clone HEAD into a scratch directory outside the repository, and run there. What passes in
// that clone is what will pass in a fresh checkout. Nothing else on this machine can tell you.
//
// WHAT IT DELIBERATELY DOES NOT SEE. It measures HEAD, not the working tree. An uncommitted fix is
// invisible to it, and that is the point — `check-rebrand` printed REBRAND COMPLETE four times in a
// row over a fix that was never staged while CI failed on every run. It also runs no install, so
// every step that needs node_modules, a built site or a browser is SKIPPED BY NAME and printed. A
// green from this tool is not a green CI run and the report says so in as many words.
//
//   node scripts/ci-parity.mjs              clone HEAD, run what can run, report
//   node scripts/ci-parity.mjs --keep       leave the clone behind for inspection
//
// exit 0  every covered check passed
// exit 1  a covered check failed
// exit 2  the instrument could not run: no git, the clone failed, the workflow could not be read,
//         or a command in ci.yml matches no rule below. Zero checks out of zero is not a pass.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
for (const a of args) {
  if (a !== '--keep') {
    console.error(`ci-parity: unrecognised flag ${a}. It takes --keep or nothing.`);
    process.exit(2);
  }
}

//[[ WHY A COMMAND IS SKIPPED, stated per command rather than remembered.
//
//   A prefix here is a claim that the command cannot run in a checkout with no node_modules. It is
//   NOT a claim that the command is unimportant — these are the steps that build the product, and
//   they are exactly the ones this tool cannot stand in for.
//
//   An `exact` entry is a command that WOULD run and whose answer would be a lie: it needs
//   something an earlier step in its own job built. Each was measured in a bare clone on
//   2026-09-21 and the observed exit code is recorded beside it. ]]
const SKIP_PREFIX = [
  ['pnpm ', 'needs `pnpm install`; this tool never installs, so the answer would be about a tree that is not the one CI builds'],
  ['npx ', 'fetches a package over the network'],
  ['rojo ', 'needs the Luau toolchain the workflow installs in an earlier step'],
  ['curl ', 'network'],
  ['sudo ', 'changes the machine'],
];
//[[ TEST FILES THAT CANNOT RUN WITHOUT AN INSTALL, declared by name with the reason.
//
//   `node --test tests/*.test.mjs` is a whole suite, and two of its files reach a bare specifier
//   that only `pnpm install` can resolve. Excluding the FILE rather than allowing named tests
//   inside it to fail is deliberate: an allowed failure is a place a real regression can hide,
//   while an excluded file is simply not claimed. Both exclusions are printed with everything else
//   this tool did not cover.
//
//   Measured in a bare clone of 9ffba9f on 2026-09-21: the whole suite is 496 run / 10 failed, and
//   every one of the ten is one of these two files. Without them it is 504 / 0.
//
//   A declaration whose file is gone is a stale declaration and exits 2, so this list cannot
//   quietly outlive what it describes. ]]
const TEST_FILES_NEEDING_AN_INSTALL = new Map([
  ['tests/check-offer.test.mjs', "imports apps/worker/src/pricing.ts, which imports the workspace package `@golem/shared`; with no node_modules the FILE does not load — ERR_MODULE_NOT_FOUND — and its 21 tests do not exist rather than failing"],
  ['tests/check-pixels.test.mjs', 'runs scripts/check-pixels.mjs, which needs Playwright; nine of its tests report the module is not found'],
]);

const SKIP_EXACT = new Map([
  ['node scripts/check-site-links.mjs', 'needs apps/site/dist (bare clone: exit 1, "apps/site/dist is missing")'],
  ['node scripts/check-site-semantics.mjs', 'needs the built site and its dependencies (bare clone: exit 1, a Node stack)'],
  ['node scripts/check-app-bundle.mjs', 'needs apps/web/dist (bare clone: exit 1, "no build found")'],
  ['node scripts/check-landing-budget.mjs', 'needs apps/site/dist (bare clone: exit 1, "no build found")'],
  ['node scripts/check-asset-wall.mjs', 'needs the built site (bare clone: exit 2, "did not see one")'],
]);

/** Every `run:` command in the workflow, single-line and block alike, in file order. */
function workflowCommands(yaml) {
  const out = [];
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const inline = /^(\s*)run:\s+(?!\|)(\S.*)$/.exec(lines[i]);
    if (inline) { out.push(inline[2].trim()); continue; }
    const block = /^(\s*)run:\s*\|\s*$/.exec(lines[i]);
    if (!block) continue;
    //[[ A block scalar is a multi-line shell script — the Luau and Rojo toolchain installs, and
    //   the tracked-env-file assertion. It is one unit to the workflow and there is no honest way
    //   to run a line of it, so it is recorded as one step, named by the `name:` above it so the
    //   skip report says something a reader can find in the file. ]]
    let label = 'a multi-line shell step';
    for (let j = i - 1; j >= 0 && j > i - 12; j -= 1) {
      const n = /^\s*-?\s*name:\s*(.+?)\s*$/.exec(lines[j]);
      if (n) { label = n[1].replace(/^['"]|['"]$/g, ''); break; }
    }
    out.push(`# shell block: ${label}`);
  }
  return out;
}

function classify(cmd) {
  // A workflow step may carry `|| echo "::warning::..."`; the tolerated half is not a check.
  const bare = cmd.replace(/\s*\|\|\s*echo\s+.*$/, '').trim();
  if (SKIP_EXACT.has(bare)) return { run: false, cmd: bare, why: SKIP_EXACT.get(bare) };
  if (bare.startsWith('# shell block: ')) {
    return { run: false, cmd: bare.replace('# shell block: ', ''), why: 'a multi-line shell script; the workflow runs it as one unit and there is no honest way to run a line of it here' };
  }
  for (const [prefix, why] of SKIP_PREFIX) if (bare.startsWith(prefix)) return { run: false, cmd: bare, why };
  if (/^(node|python3) /.test(bare)) return { run: true, cmd: bare };
  return null; // unclassified — refused rather than ignored
}

let head;
try {
  head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch (e) {
  console.error(`ci-parity: could not read HEAD, so nothing was measured: ${e.message}`);
  process.exit(2);
}

let yaml;
try {
  yaml = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
} catch (e) {
  console.error(`ci-parity: could not read .github/workflows/ci.yml, so nothing was measured: ${e.message}`);
  process.exit(2);
}

const commands = [...new Set(workflowCommands(yaml))];
if (commands.length === 0) {
  console.error('ci-parity: the workflow declares no `run:` step. A checker that finds nothing to check must not report that as clean.');
  process.exit(2);
}

const toRun = [];
const skipped = [];
for (const cmd of commands) {
  const verdict = classify(cmd);
  if (verdict === null) {
    console.error(`ci-parity: ci.yml runs a command this tool has no rule for:\n    ${cmd}\n`
      + 'Add it to SKIP_PREFIX or SKIP_EXACT with the reason, or let it run. An unclassified '
      + 'command is refused rather than silently dropped, because a step nobody decided about is '
      + 'a step nobody is measuring.');
    process.exit(2);
  }
  (verdict.run ? toRun : skipped).push(verdict);
}
if (toRun.length === 0) {
  console.error('ci-parity: every command was skipped. Zero checks out of zero is not a pass.');
  process.exit(2);
}

const clone = mkdtempSync(join(tmpdir(), 'ci-parity-'));
let failures = 0;
try {
  try {
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '--shared', ROOT, clone], { stdio: 'pipe' });
    execFileSync('git', ['-C', clone, 'checkout', '--quiet', head], { stdio: 'pipe' });
  } catch (e) {
    console.error(`ci-parity: the clone failed, so nothing was measured: ${e.message}`);
    process.exit(2);
  }

  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).length;
  console.log(`CI PARITY — a clean clone of ${head.slice(0, 7)}, no install, no build`);
  console.log(`  the working tree has ${dirty} uncommitted path(s) and NONE of them are in this clone\n`);

  for (const { cmd } of toRun) {
    let actual = cmd;
    if (cmd === 'node --test tests/*.test.mjs') {
      const all = readdirSync(join(clone, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
      for (const declared of TEST_FILES_NEEDING_AN_INSTALL.keys()) {
        if (!all.includes(declared.replace('tests/', ''))) {
          console.error(`ci-parity: ${declared} is declared as needing an install and is not in the suite. `
            + 'A declaration that outlives its file is a rule about nothing.');
          process.exit(2);
        }
      }
      const kept = all.map((f) => `tests/${f}`).filter((f) => !TEST_FILES_NEEDING_AN_INSTALL.has(f));
      actual = `node --test ${kept.join(' ')}`;
    }
    const [bin, ...rest] = actual.split(/\s+/);
    const r = spawnSync(bin, rest, { cwd: clone, encoding: 'utf8', shell: false, maxBuffer: 256 * 1024 * 1024 });
    const code = r.status ?? -1;
    const ok = code === 0;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  exit ${String(code).padStart(2)}  ${cmd}`);
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (!ok) {
      const named = [...new Set(text.split('\n').filter((l) => l.startsWith('\u2716 ') && !l.includes('failing tests')))];
      const lines = named.length > 0 ? named.slice(0, 15) : text.split('\n').filter(Boolean).slice(-12);
      for (const line of lines) console.log(`          | ${line}`);
      // The summary above is a pointer, not the evidence. A reader who has to guess at the rest
      // will guess, so the whole of it is written down and the path is printed.
      const log = join(tmpdir(), `ci-parity-${cmd.split(/\s+/)[1].replace(/[^a-z0-9]/gi, '-')}.log`);
      writeFileSync(log, `$ ${actual}\n\n${text}`);
      console.log(`          | full output: ${log}`);
    }
  }

  console.log(`\nNOT COVERED — ${skipped.length} step(s) CI runs that this tool did not:`);
  for (const { cmd, why } of skipped) console.log(`  -     ${cmd}\n        ${why}`);
  for (const [file, why] of TEST_FILES_NEEDING_AN_INSTALL) {
    console.log(`  -     ${file}  (removed from the root suite above)\n        ${why}`);
  }
  console.log('\nSo a pass here is NOT a green CI run. It is the narrower statement that these '
    + `${toRun.length} check(s) do not depend on anything that exists only on this machine.`);
} finally {
  if (keep) console.log(`\nclone kept at ${clone}`);
  else rmSync(clone, { recursive: true, force: true });
}

process.exit(failures > 0 ? 1 : 0);
