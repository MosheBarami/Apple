// The checker that catches the cheap ways to turn a signal green.
//
// A checker nobody has watched fail is indistinguishable from `exit 0`. Every detector below is
// driven against a PLANTED violation in a scratch copy of the repository, and against the clean
// tree as its positive control, so "clean" means something.
//
// §6.3 requires the planted violation to sit in the LAST directory of the walk order, because a
// checker that stops early reports clean over everything it never reached. The plants here go into
// the real tracked tree of a temporary clone, at whatever position git's own ordering gives them,
// and the denominator assertion catches short-walking independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = 'scripts/check-escape-hatches.mjs';

/**
 * A throwaway git repo holding the repository's tracked files.
 *
 * A real clone rather than a fixture directory: the checker's denominator comes from
 * `git ls-files`, so a fixture with no git history would give it nothing to examine and every
 * assertion below would pass vacuously.
 */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'escape-hatch-'));
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  for (const rel of files) {
    const dest = join(dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    try { cpSync(join(ROOT, rel), dest); } catch { /* a path that vanished mid-copy */ }
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: dir });
  return dir;
}

function run(dir) {
  const proc = spawnSync('node', [join(dir, CHECKER)], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
  return { exit: proc.status, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
}

/** Plant a violation, run, and restore. Returns the checker's verdict on the planted tree. */
function withPlant(dir, rel, mutate) {
  const path = join(dir, rel);
  const before = readFileSync(path, 'utf8');
  writeFileSync(path, mutate(before));
  execFileSync('git', ['add', '-A'], { cwd: dir });
  try { return run(dir); } finally {
    writeFileSync(path, before);
    execFileSync('git', ['add', '-A'], { cwd: dir });
  }
}

let DIR;
test('a scratch clone of the tracked tree is clean', () => {
  DIR = scratch();
  const r = run(DIR);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /ESCAPE HATCHES CLEAN/);
});

/* ------------------------------------------------------------- denominator --- */

test('the denominator matches the tracked source surface minus the exceptions', () => {
  // §6.3: a checker whose denominator is below the real surface is a forged oracle — it reports
  // clean because it did not look. This is the assertion that catches a short walk.
  const r = run(DIR);
  const printed = Number(/DENOMINATOR (\d+) files/.exec(r.out)[1]);
  const tracked = execFileSync(
    'git',
    ['ls-files', '*.ts', '*.tsx', '*.mjs', '*.js', '*.jsx', '*.luau', '*.astro', '*.py'],
    { cwd: DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ).split('\n').filter(Boolean);
  const exceptions = tracked.filter((f) => f === CHECKER || f.includes('node_modules/') || f.startsWith('.claude/worktrees/'));
  assert.equal(printed, tracked.length - exceptions.length);
  assert.ok(printed > 300, `a real denominator, not a token one: ${printed}`);
});

test('the DENOMINATOR is the FIRST line of stdout', () => {
  const proc = spawnSync('node', [join(DIR, CHECKER)], { cwd: DIR, encoding: 'utf8', timeout: 120_000 });
  assert.match(proc.stdout.split('\n')[0], /^DENOMINATOR \d+ files; EXCEPTIONS \d+:/);
});

/* -------------------------------------------------------- each detector fails --- */

test('it catches a test file emptied of tests', () => {
  // The cheapest way to turn a red gate green: delete the tests, leave the file, and `node --test`
  // still prints `fail 0` and exits 0.
  const r = withPlant(DIR, 'tests/workspace-coverage.test.mjs', () => '// nothing here any more\n');
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /a test file with no tests in it/);
});

test('it catches a test file where everything is skipped', () => {
  const r = withPlant(DIR, 'tests/workspace-coverage.test.mjs', () =>
    "import test from 'node:test';\ntest.skip('a', () => {});\ntest.skip('b', () => {});\n");
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /all 2 test\(s\) are skipped/);
});

test('it catches `|| true` on any script, not only typecheck', () => {
  const r = withPlant(DIR, 'apps/web/package.json', (s) => {
    const p = JSON.parse(s);
    p.scripts.test = `${p.scripts.test} || true`;
    return JSON.stringify(p, null, 2);
  });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /a script that cannot fail: test/);
});

test('it catches a package with TypeScript sources and no typecheck', () => {
  const r = withPlant(DIR, 'apps/worker/package.json', (s) => {
    const p = JSON.parse(s);
    delete p.scripts.typecheck;
    return JSON.stringify(p, null, 2);
  });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /no typecheck script/);
});

test('it catches a gate marked [~]', () => {
  const r = withPlant(DIR, 'GATES.md', (s) => s.replace(/^- \[x\] /m, '- [~] '));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /a gate marked \[~\]/);
});

test('it catches an ABANDON: at column 1', () => {
  const r = withPlant(DIR, 'GATES.md', (s) => `ABANDON: G1 too hard\n\n${s}`);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /an ABANDON: at column 1/);
});

test('it catches a CHECK that spawns nothing', () => {
  const r = withPlant(DIR, 'GATES.md', (s) =>
    `${s}\n\n- [ ] G-FAKE-1: a gate that proves nothing\n    CHECK: test -f README.md\n    EXPECT: ok\n`);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /a CHECK that spawns nothing/);
});

test('it catches a CHECK that is a bare grep', () => {
  // The canonical unfalsifiable gate: source text matching a pattern is not the behaviour the gate
  // describes, and a comment mentioning the right words satisfies it.
  const r = withPlant(DIR, 'GATES.md', (s) =>
    `${s}\n\n- [ ] G-FAKE-2: a grep pretending to be a gate\n    CHECK: grep -q normaliseOutput scripts/gate-check.mjs\n    EXPECT: \n`);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /a CHECK that is a bare grep/);
});

test('it catches a ticked gate with no FALSIFIED record', () => {
  const r = withPlant(DIR, 'GATES.md', (s) => s.split('\n').filter((l) => !/^ {2}FALSIFIED:/.test(l)).join('\n'));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /ticked with no FALSIFIED record/);
});

test('it catches an evidence line stripped of the fields a claim cannot fake', () => {
  const r = withPlant(DIR, 'GATES.md', (s) => s.replace(/git-sha=[0-9a-f]+; /g, ''));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /evidence lacks git-sha=/);
});

test('it catches a control byte in a source file', () => {
  // grep reports NOTHING over such a file and exits 1, which a naive check reads as "no matches".
  const r = withPlant(DIR, 'packages/evals/src/run.mjs', (s) => s.replace('\\0', String.fromCharCode(0)));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /containing a control byte/);
});

test('it catches a deferral with no row id', () => {
  const r = withPlant(DIR, 'docs/PASS-LOG.md', (s) => `${s}\n- I will fix the checkout flow later.\n`);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /a deferral with no row id/);
});

test('but a deferral WITH a row id is allowed, because that is a schedule', () => {
  // The positive control for the test above. Without it, the detector could be flagging every
  // sentence containing "will", which would make the ledger unwritable.
  const r = withPlant(DIR, 'docs/PASS-LOG.md', (s) => `${s}\n- w12 | I will fix the checkout flow | SCHEDULED pass 3\n`);
  assert.equal(r.exit, 0, r.out);
});

test('and past-tense prose is not a deferral', () => {
  // The false positive that made this detector unusable at line granularity: a 700-character table
  // row containing "later the same day" and, four clauses away, the word "update".
  const r = withPlant(DIR, 'docs/PASS-LOG.md', (s) =>
    `${s}\n| 18 | something | the frame arrived later the same day; see below, which supersedes it | we update nothing here |\n`);
  assert.equal(r.exit, 0, r.out);
});

/* ------------------------------------------------------ the owner's stop works --- */

test('an owner HALT: is reported and is NEVER a failure', () => {
  // The one legitimate way to stop the loop. A checker that failed on it would make stopping
  // impossible, which is the opposite of what any of this is for.
  const r = withPlant(DIR, 'WORKLIST.md', (s) => `HALT: owner says stop\n\n${s}`);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /OWNER HALT PRESENT — HALT: owner says stop/);
});

/* --------------------------------------------------------- it skips its own text --- */

test('the checker does not flag itself for naming the patterns it forbids', () => {
  // This file and the checker both contain every string they hunt for. A checker that examined
  // itself would be permanently red, and the fix everyone reaches for is to weaken the pattern.
  const r = run(DIR);
  assert.equal(r.exit, 0, r.out);
  assert.doesNotMatch(r.out, /check-escape-hatches\.mjs:/);
});

test('a fenced example in a ledger is not a violation', () => {
  const r = withPlant(DIR, 'docs/PASS-LOG.md', (s) => `${s}\n\n\`\`\`\nABANDON: this is an example\n\`\`\`\n`);
  assert.equal(r.exit, 0, r.out);
});

test('an HTML-commented example is not a violation either', () => {
  const r = withPlant(DIR, 'GATES.md', (s) => `${s}\n<!-- - [~] G-EXAMPLE: what an abandoned gate would look like -->\n`);
  assert.equal(r.exit, 0, r.out);
});

test('the scratch clone is removed', () => {
  rmSync(DIR, { recursive: true, force: true });
});
