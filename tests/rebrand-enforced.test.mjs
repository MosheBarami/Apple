// The rename has an enforcer. Does anything CALL it?
//
// scripts/check-rebrand.mjs exited 1 from the day it was written and no gate, no npm script and no
// CI job invoked it. A checker nobody runs is not enforcement — it is a second opinion nobody asks
// for — and drift landed on 2026-09-19 with every green light lit. The owner has asked for the old
// name to be gone more times than he has asked for anything else in this repository.
//
// So this file does not check the rename. It checks that the two things which can FAIL A BUILD
// still invoke the program that checks it, and that its denominator still contains the clients a
// stranger is actually handed. Both are one tidy-up away from being true of nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE_SUITE = readFileSync(join(ROOT, 'scripts/gate-suite.mjs'), 'utf8');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

/**
 * The lines of a file with every commented-out line removed.
 *
 * THIS IS THE WHOLE POINT OF THE FILE. gate-suite.mjs and ci.yml are both more comment than code,
 * and both comment ABOUT check-rebrand at length — a plain `includes('check-rebrand')` would have
 * passed on the tree as it stood yesterday, where the only mentions were prose explaining that
 * nothing ran it. A grep that matches its own documentation measures nothing.
 */
const executable = (text, commentPrefixes) => text
  .split('\n')
  .filter((l) => !commentPrefixes.some((p) => l.trimStart().startsWith(p)))
  .join('\n');

const gateSuiteCode = executable(GATE_SUITE, ['//', '*', '/*']);
const ciCode = executable(CI, ['#']);

test('the extractor ignores a mention that is only a comment', () => {
  // The aim, pinned on a fixture rather than on whatever the two files happen to say today. This
  // assertion is what makes the two below evidence instead of a coincidence.
  assert.equal(
    executable('// we should run scripts/check-rebrand.mjs one day\nconst x = 1;\n', ['//']).includes('check-rebrand'),
    false,
    'a commented-out invocation still counts as an invocation — the two tests below prove nothing',
  );
  assert.equal(
    executable('        # run: node scripts/check-rebrand.mjs\n        run: node scripts/other.mjs\n', ['#']).includes('check-rebrand'),
    false,
  );
});

test('the gate suite runs the rebrand checker', () => {
  assert.match(gateSuiteCode, /run\('node', \['scripts\/check-rebrand\.mjs', '--offline'\]\)/,
    'scripts/gate-suite.mjs no longer invokes the rebrand checker, so SUITE GREEN says nothing about the name');
  // …and a part that fails still turns the suite red. An invocation whose exit code is discarded
  // is the same dead end one level in.
  assert.match(gateSuiteCode, /const broken = parts\.filter\(\(p\) => !p\.ok\)/);
  assert.match(gateSuiteCode, /process\.exit\(1\)/);
});

test('CI runs the rebrand checker', () => {
  assert.match(ciCode, /run: node scripts\/check-rebrand\.mjs --offline/,
    '.github/workflows/ci.yml no longer invokes the rebrand checker');
  // --offline, DELIBERATELY. The full run fetches the live origin to date its capture; a CI job
  // that needs the network goes red for reasons that are not about the code, and a flaky gate is
  // a gate that gets disabled. If someone widens this to the network, this is where they argue it.
  assert.doesNotMatch(ciCode, /run: node scripts\/check-rebrand\.mjs --deployed/,
    'CI now fetches the live origin — that makes a red mean "the network was down"');
});

test('the mutation lands: removing either invocation reddens the two tests above', () => {
  // Falsification, in-process, because the two assertions above are greps and a grep that has
  // never been watched to fail is a wish. Each mutation is applied to the real text and the real
  // extractor is re-run over it.
  // Each mutation is asserted against the SAME pattern the live test uses, not against the bare
  // word: gate-suite labels its part 'check-rebrand', so the name survives the invocation's
  // removal, and a mutation checked with /check-rebrand/ would look like it had failed to land.
  const withoutGate = gateSuiteCode.replace(/run\('node', \['scripts\/check-rebrand\.mjs', '--offline'\]\)/, "run('node', ['scripts/check-copy.mjs'])");
  assert.notEqual(withoutGate, gateSuiteCode, 'the gate-suite mutation did not land — re-aim it before trusting the test');
  assert.doesNotMatch(withoutGate, /run\('node', \['scripts\/check-rebrand\.mjs', '--offline'\]\)/);

  const withoutCi = ciCode.replace(/run: node scripts\/check-rebrand\.mjs --offline/, 'run: node scripts/check-copy.mjs');
  assert.notEqual(withoutCi, ciCode, 'the ci.yml mutation did not land — re-aim it before trusting the test');
  assert.doesNotMatch(withoutCi, /run: node scripts\/check-rebrand\.mjs --offline/);
});

/*
 * NOT THE NAME — THE DEPLOYMENT. These two are one test's worth of the same defect.
 *
 * Five scripts held their own copy of the hostname and all five held the pre-rename one. For
 * probe-s1.mjs and check-pixels.mjs that meant writing a stale origin into an evidence file. For
 * import-assets.mjs, unimport-assets.mjs and ingest-assets.mjs it meant something worse: the
 * legacy host's redirect deliberately exempts /api/*, so an admin POST was not redirected — it
 * was served, by a deployment 38 commits behind, and the operator read a success count.
 */
// TRACKED **AND** PRESENT. `git ls-files` lists a path that another session has deleted in the
// working tree but not yet committed — it happened to ten scripts while this file was being
// written — and readFileSync on one of those throws, which turns a guard about hostnames into a
// crash about housekeeping. The count is asserted below so that "skip what is missing" can never
// quietly become "skip everything".
const scriptFiles = () => execFileSync('git', ['ls-files', 'scripts/*.mjs', 'scripts/lib/*.mjs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
  .split('\n').filter(Boolean).filter((rel) => existsSync(join(ROOT, rel)));

test('no script sends a request to the legacy worker', () => {
  const { LEGACY_PRODUCT_HOST } = { LEGACY_PRODUCT_HOST: 'golem.moshe-barami111.workers.dev' };
  // A SCHEME IS WHAT MAKES IT A TARGET. probe-s1.mjs legitimately holds the bare hostname as a
  // token it EXEMPTS while reading a page, and confusing "names the host" with "sends to the
  // host" is how a guard ends up either blind or crying wolf.
  const target = new RegExp(`https?://${LEGACY_PRODUCT_HOST.replace(/\./g, '\\.')}`);
  const scanned = scriptFiles();
  assert.ok(scanned.length > 20, `only ${scanned.length} script(s) were scanned — the enumeration has gone blind`);
  const offenders = scanned.filter((rel) => target.test(executable(readFileSync(join(ROOT, rel), 'utf8'), ['//', '*', '/*'])));
  assert.deepEqual(offenders, [], `these scripts still address the pre-rename deployment: ${offenders.join(', ')}`);

  // The extractor sees a planted offender, and does not see the same string in a comment.
  assert.ok(target.test(executable("const B = 'https://golem.moshe-barami111.workers.dev';\n", ['//'])),
    'the scan cannot see a legacy target at all — the empty result above means nothing');
  assert.equal(target.test(executable('// it used to be https://golem.moshe-barami111.workers.dev\n', ['//'])), false,
    'the scan flags a comment, so it would fail on any script that explains this history');
});

test('the product origin is derived from the shared package, with no fallback to a literal', async () => {
  const mod = await import(join(ROOT, 'scripts/lib/product-origin.mjs'));
  assert.equal(mod.PRODUCT_ORIGIN, 'https://apple.moshe-barami111.workers.dev');
  const src = readFileSync(join(ROOT, 'scripts/lib/product-origin.mjs'), 'utf8');
  // A DEFAULT IS HOW THE STALE COPY SURVIVES THE NEXT RENAME: read the declaration, fail to find
  // it, quietly use the value typed here, and every script is back to holding its own copy with
  // nothing to say so. So this module may not contain a URL literal at all.
  assert.doesNotMatch(executable(src, ['//', '*', '/*']), /'https?:\/\//,
    'product-origin.mjs now carries a hard-coded origin, which is the thing it exists to remove');
  assert.match(src, /throw new Error/, 'a missing declaration must throw, not fall back');
});

/*
 * THE DENOMINATOR, WHICH IS THE OTHER HALF OF ENFORCEMENT.
 *
 * A checker that runs everywhere and looks at two thirds of the product still prints a headline
 * over ground it never walked. packages/sdk ships three language clients and a CLI; the Luau one
 * is a .luau and was scanned, and the JavaScript (.mjs) and Python (.py) ones were not in any
 * glob — so `apple --help` printed the old product name to everyone who ran it while the checker
 * reported the tree clean.
 */
test('the shipped SDK clients are inside the denominator', () => {
  const lsFiles = (globs) => execFileSync('git', ['ls-files', ...globs], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\n').filter(Boolean);
  const shipped = lsFiles(['packages/sdk/src/*.mjs', 'packages/sdk/bin/*.mjs', 'packages/sdk/python/apple_sdk/*.py']);
  // The clients a stranger is handed, named one by one rather than by count: a count agrees with
  // itself when a file is deleted.
  for (const rel of ['packages/sdk/src/wire.mjs', 'packages/sdk/src/cli-args.mjs', 'packages/sdk/bin/apple.mjs', 'packages/sdk/python/apple_sdk/client.py']) {
    assert.ok(shipped.includes(rel), `${rel} is no longer matched by the shipped-client globs`);
  }
  const expected = new Set([...lsFiles(['*.ts', '*.tsx', '*.astro', '*.luau']), ...shipped]);
  expected.delete('scripts/check-rebrand.mjs');

  const p = spawnSync('node', [join(ROOT, 'scripts/check-rebrand.mjs'), '--offline'], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  const out = `${p.stdout ?? ''}${p.stderr ?? ''}`;
  // NOT an assertion on the exit code. This test is about what the program LOOKS AT; whether the
  // tree is currently clean is the program's own business, and coupling the two would make this
  // file red for somebody else's drift and teach the next person to ignore it.
  const denominator = /DENOMINATOR (\d+) files/.exec(out);
  assert.ok(denominator, `check-rebrand printed no denominator line:\n${out.slice(0, 400)}`);
  assert.equal(Number(denominator[1]), expected.size,
    'the checker is scanning a different file set than the globs it declares — the shipped clients may have dropped out');
  assert.match(out, /SELFTEST \d+ properties/, 'the scanner no longer selftests, so its file count is not evidence');
});
