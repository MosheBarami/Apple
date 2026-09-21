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
//   node scripts/ci-parity.mjs --with-build  also install and build IN THE CLONE, which turns on
//                                           the five checks that need a built site, and the one
//                                           test file that needs node_modules. Minutes, and it
//                                           needs the network.
//   node scripts/ci-parity.mjs --keep       leave the clone behind for inspection
//
// exit 0  every covered check passed
// exit 1  a covered check failed
// exit 2  the instrument could not run: no git, the clone failed, the workflow could not be read,
//         or a command in ci.yml matches no rule below. Zero checks out of zero is not a pass.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const withBuild = args.includes('--with-build');
for (const a of args) {
  if (a !== '--keep' && a !== '--with-build') {
    console.error(`ci-parity: unrecognised flag ${a}. It takes --keep, --with-build, or nothing.`);
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
  ['pnpm ', 'needs `pnpm install`; without --with-build this tool does not install, so the answer would be about a tree that is not the one CI builds'],
  ['npx ', 'fetches a package over the network'],
  ['rojo ', 'needs the Luau toolchain the workflow installs in an earlier step'],
  ['curl ', 'network'],
  ['sudo ', 'changes the machine'],
];

//[[ WHAT --with-build CHANGES ABOUT THE pnpm STEPS, and why each one is what it is.
//
//   Three of them the tool RUNS ITSELF, as the prerequisite for everything else; listing those as
//   "not covered, needs an install" after having just run them would be a false line in a report,
//   which is the one thing this file is not allowed to print.
//
//   Two more become runnable once node_modules exists and are worth the minute they cost.
//
//   The rest stay out with a reason that is true WITH the install in place, rather than the
//   no-install reason above, which would no longer be the truth. ]]
const PREREQUISITE_COMMANDS = new Set([
  'pnpm install --frozen-lockfile',
  'pnpm --filter @golem/site build',
  'pnpm --filter @golem/web build',
]);
const RUN_WITH_BUILD = new Set([
  'pnpm -r typecheck',
  'pnpm --filter @golem/evals check',
]);
const SKIP_WITH_BUILD = new Map([
  ['pnpm -r test', 'the whole workspace suite; it is the longest step in CI and three of its packages drive a browser. Run it yourself in the clone --keep leaves behind.'],
  ['pnpm exec playwright install --with-deps chromium', 'downloads a browser and its system libraries'],
  ['pnpm exec playwright test', 'needs that browser'],
]);
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
  ['tests/check-offer.test.mjs', { needs: 'install', why: "imports apps/worker/src/pricing.ts, which imports the workspace package `@golem/shared`; with no node_modules the FILE does not load — ERR_MODULE_NOT_FOUND — and its 21 tests do not exist rather than failing" }],
  // A browser binary is not node_modules. CI installs it in a step of its own
  // (`pnpm exec playwright install --with-deps chromium`), so --with-build does not bring this one
  // back: an install is not the thing it is missing.
  ['tests/check-pixels.test.mjs', { needs: 'browser', why: 'runs scripts/check-pixels.mjs, which drives Chromium; nine of its tests report the module is not found' }],
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
  if (SKIP_EXACT.has(bare)) return { run: withBuild, cmd: bare, why: SKIP_EXACT.get(bare) };
  if (withBuild && PREREQUISITE_COMMANDS.has(bare)) return { run: false, prerequisite: true, cmd: bare, why: 'run by --with-build, in the clone, before anything below' };
  if (withBuild && RUN_WITH_BUILD.has(bare)) return { run: true, cmd: bare };
  if (withBuild && SKIP_WITH_BUILD.has(bare)) return { run: false, cmd: bare, why: SKIP_WITH_BUILD.get(bare) };
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

//[[ EVERY EXIT AFTER THE CLONE GOES THROUGH HERE, and it exists because of a real leak.
//
//   `process.exit()` does NOT run a `finally` block. Both exit-2 paths below sit inside the try
//   whose finally removes the clone, so each one left the whole checkout in the OS temp directory:
//   107 MB for a bare clone and 793 MB once --with-build had installed node_modules. Found by
//   listing $TMPDIR after a falsification run, not by reading the code — the happy path cleans up
//   correctly and the leak only happens on the paths nobody re-runs.
//
//   --keep still keeps it, on every path, because the reason to keep a clone is usually that
//   something went wrong in it. ]]
const bail = (code, ...message) => {
  if (message.length) console.error(...message);
  if (keep) console.log(`clone kept at ${clone}`);
  else rmSync(clone, { recursive: true, force: true });
  process.exit(code);
};

let failures = 0;
try {
  try {
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '--shared', ROOT, clone], { stdio: 'pipe' });
    execFileSync('git', ['-C', clone, 'checkout', '--quiet', head], { stdio: 'pipe' });
  } catch (e) {
    bail(2, `ci-parity: the clone failed, so nothing was measured: ${e.message}`);
  }

  //[[ --with-build. The install and the builds happen INSIDE THE CLONE, never in the repository:
  //   this repository's standing rule is that nothing installs into an in-repo worktree, and a
  //   scratch clone under the OS temp directory is not one.
  //
  //   A failure here is exit 2, not exit 1. If the install or the build did not finish then the
  //   five checks below were never run, and reporting that as "a check failed" would be the same
  //   error this whole file exists to avoid — a failure to observe rendering as an observation. ]]
  if (withBuild) {
    for (const step of [
      ['pnpm', ['install', '--frozen-lockfile']],
      ['pnpm', ['--filter', '@golem/site', 'build']],
      ['pnpm', ['--filter', '@golem/web', 'build']],
    ]) {
      process.stdout.write(`  ...${step[0]} ${step[1].join(' ')}\n`);
      const r = spawnSync(step[0], step[1], { cwd: clone, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      if (r.status !== 0) {
        const log = join(tmpdir(), 'ci-parity-with-build.log');
        writeFileSync(log, `$ ${step[0]} ${step[1].join(' ')}\n\n${r.stdout ?? ''}${r.stderr ?? ''}`);
        bail(2, `ci-parity: --with-build could not ${step[0]} ${step[1].join(' ')} (exit ${r.status ?? -1}), `
          + `so the checks that need it were not run and nothing is claimed about them. Full output: ${log}`);
      }
    }
  }

  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).length;
  console.log(`CI PARITY — a clean clone of ${head.slice(0, 7)}, ${withBuild ? 'installed and built in the clone' : 'no install, no build'}`);
  console.log(`  the working tree has ${dirty} uncommitted path(s) and NONE of them are in this clone\n`);

  for (const { cmd } of toRun) {
    let actual = cmd;
    if (cmd === 'node --test tests/*.test.mjs') {
      const all = readdirSync(join(clone, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
      for (const declared of TEST_FILES_NEEDING_AN_INSTALL.keys()) {
        if (!all.includes(declared.replace('tests/', ''))) {
          bail(2, `ci-parity: ${declared} is declared as needing an install and is not in the suite. `
            + 'A declaration that outlives its file is a rule about nothing.');
        }
      }
      const kept = all.map((f) => `tests/${f}`).filter((f) => {
        const d = TEST_FILES_NEEDING_AN_INSTALL.get(f);
        return !d || (withBuild && d.needs === 'install');
      });
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
      //[[ WHAT THE MACHINE WAS DOING, printed beside every red.
      //
      //   This is a SHARED checkout: several sessions build, install and run suites in it at once,
      //   and some of the tests here spawn real work under a real budget — tests/gate-check.test.mjs
      //   line 325 runs `gate-check --gate G91`, which is a full `pnpm -r typecheck`, with a
      //   300_000 ms cap. On an idle runner that is generous. On this Mac at load 7 it has gone over
      //   twice tonight and failed at 300,05x ms, which is the cap and not a defect.
      //
      //   A duration within a whisker of a round number, on a loaded machine, is the signature. The
      //   tool cannot tell those apart from a real failure, so it prints what a reader needs to tell
      //   them apart instead of picking one. Re-run the named file on its own before believing it. ]]
      console.log(`          | load ${loadavg().map((n) => n.toFixed(2)).join(' ')} on ${cpus().length} cpus — `
        + 'a red here on a busy shared machine may be a timeout; re-run the named file alone to tell');
    }
  }

  const prereqs = skipped.filter((v) => v.prerequisite);
  const notCovered = skipped.filter((v) => !v.prerequisite);
  if (prereqs.length > 0) {
    console.log(`\nRAN AS A PREREQUISITE — ${prereqs.length} step(s), in the clone, before the checks above:`);
    for (const { cmd } of prereqs) console.log(`  +     ${cmd}`);
  }
  console.log(`\nNOT COVERED — ${notCovered.length} step(s) CI runs that this tool did not:`);
  for (const { cmd, why } of notCovered) console.log(`  -     ${cmd}\n        ${why}`);
  for (const [file, d] of TEST_FILES_NEEDING_AN_INSTALL) {
    if (withBuild && d.needs === 'install') continue;
    console.log(`  -     ${file}  (removed from the root suite above)\n        ${d.why}`);
  }
  console.log('\nSo a pass here is NOT a green CI run. It is the narrower statement that these '
    + `${toRun.length} check(s) do not depend on anything that exists only on this machine.`);
} finally {
  if (keep) console.log(`\nclone kept at ${clone}`);
  else rmSync(clone, { recursive: true, force: true });
}

process.exit(failures > 0 ? 1 : 0);
