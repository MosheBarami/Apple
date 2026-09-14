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


/* ============================================================================================
 * THE EIGHT DETECTORS A REFUTER FOUND UNPROTECTED
 * ============================================================================================
 *
 * An adversarial refuter disabled each `fail()` site in turn and recorded which tests went red.
 * Eight could be deleted with nothing failing — which means eight of this checker's claims rested
 * on nobody having tried. The refuter then bought a green signal with the gap: the floor was 20
 * and the suite was 22, so deleting the denominator guard and the bare-grep guard left the gate
 * passing at exactly 20.
 *
 * The transferable lesson is about the FALSIFICATION, not the tests. Stubbing `fail()` neuters
 * every detector at once, so it proves the harness is connected and cannot distinguish a covered
 * detector from an uncovered one. A red-first record has to break the narrowest path the gate's
 * sentence claims.
 */

test('it catches an unparseable package manifest', () => {
  // Every checker that reads package.json JSON.parses it inside a try. A manifest that throws is
  // therefore skipped SILENTLY by all of them at once — the package simply stops being checked.
  const r = withPlant(DIR, 'apps/web/package.json', (s) => `${s.slice(0, -2)},,,`);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /an unparseable package manifest/);
});

test('it catches GATES.md having been emptied', () => {
  // §12.1 calls deleting a ledger the worst failure available. An empty file is the same act with
  // a smaller diff, and every gate count derived from it reads zero-of-zero rather than missing.
  const r = withPlant(DIR, 'GATES.md', () => '');
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /(GATES\.md is missing|a CHECK|no gates)/);
});

test('it catches an ABANDON: in WORKLIST.md, not only in GATES.md', () => {
  // The Stop hook reads WORKLIST.md. An ABANDON: there is the more direct mechanical release of
  // the two, and it was the untested one.
  const r = withPlant(DIR, 'WORKLIST.md', (s) => `ABANDON: w12 too hard\n\n${s}`);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /WORKLIST\.md:\d+: an ABANDON: at column 1/);
});

test('it reports an owner HALT: in GATES.md too, and still exits 0', () => {
  // Only the WORKLIST.md path was tested. A HALT the checker does not report is one the reader
  // never learns about; a HALT it FAILS on would make stopping impossible.
  const r = withPlant(DIR, 'GATES.md', (s) => `HALT: owner says stop\n\n${s}`);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /OWNER HALT PRESENT — HALT: owner says stop/);
});

test('it catches a ticked gate with no EVIDENCE line at all', () => {
  // Distinct from the missing-FALSIFIED case: this is a tick with no measurement of any kind under
  // it, which is the oldest shape of defect this ledger has had.
  const r = withPlant(DIR, 'GATES.md', (s) => s.split('\n').filter((l) => !/^ {2}EVIDENCE:/.test(l)).join('\n'));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /is ticked with no EVIDENCE/);
});

test('it catches evidence stripped of tree-clean, not only of git-sha', () => {
  // Only git-sha was tested. tree-clean is the field that says whether the measurement was taken
  // against committed code at all, which is the difference between a record and a decoration.
  const r = withPlant(DIR, 'GATES.md', (s) => s.replace(/tree-clean=(yes|no); /g, ''));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /evidence lacks tree-clean=/);
});

test('it catches WORKLIST.md having been untracked', () => {
  // An untracked ledger vanishes with no trace in git log — §12.1's other mechanical release.
  const dir = scratch();
  try {
    execFileSync('git', ['rm', '--cached', '-q', 'WORKLIST.md'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'untrack'], { cwd: dir });
    const r = run(dir);
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /WORKLIST\.md is not tracked/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('it says out loud when the EXPECT-CHANGE detector could not run', () => {
  // THE INERT DETECTOR. It diffs against HEAD~1, and the only context CI runs this checker in is a
  // single-commit scratch clone where HEAD~1 does not exist — so the error was swallowed and the
  // empty result read as "nothing changed". A detector that cannot fire where it runs is not a
  // detector, and it looked exactly like a passing one.
  const r = run(DIR);
  assert.match(r.out, /no HEAD~1 in this checkout, so the EXPECT-CHANGE detector could not run/);
});

test('it catches an EXPECT changed with no adjacent EXPECT-CHANGE line, where it CAN look', () => {
  // The positive control for the test above: in a repo with history, the detector fires.
  //
  // It fires even though the ledger ALREADY contains an EXPECT-CHANGE line elsewhere, which is the
  // point — a global substring search meant one note anywhere excused every change in the file
  // forever, turning the note into a permission slip rather than a record of one strengthening.
  const dir = scratch();
  try {
    const gates = join(dir, 'GATES.md');
    // Planted on a gate that has NO adjacent EXPECT-CHANGE line, chosen rather than assumed. This
    // used to take the FIRST EXPECT in the file, which silently stopped testing anything the day
    // that gate gained a legitimate EXPECT-CHANGE — the plant became an excused change and the
    // detector was right not to fire, so a green test meant the fixture had rotted, not that the
    // detector worked.
    const before = readFileSync(gates, 'utf8').split('\n');
    // The predicate has to be the DETECTOR'S: it scans the whole gate BLOCK for an EXPECT-CHANGE
    // line, not the line immediately after the EXPECT. A first fix here checked only the next
    // line, which is a different question and picked gates the detector would rightly excuse.
    const heads = [...before.keys()].filter((i) => /^- \[[ xX~]\] G[\w-]+/.test(before[i]));
    const blockOf = (i) => before.slice(i, heads.find((h) => h > i) ?? before.length);
    const target = heads
      .filter((h) => !blockOf(h).some((l) => /^\s*EXPECT-CHANGE:/.test(l)))
      .map((h) => blockOf(h).findIndex((l) => /^ {4}EXPECT: /.test(l)) + h)
      .find((i) => i > 0);
    assert.ok(target !== undefined, 'every gate block carries an EXPECT-CHANGE line; this plant can no longer isolate the rule');
    before[target] = '    EXPECT: loosened';
    writeFileSync(gates, before.join('\n'));
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'loosen'], { cwd: dir });
    const r = run(dir);
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /EXPECT changed with no adjacent EXPECT-CHANGE line/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the three deferral words §6.4 names are all present', () => {
  // `once`, `after` and `carried` were dropped when the detector was narrowed to stop false
  // positives. The narrowing was right; dropping the words was not, and a refuter demonstrated
  // three real deferrals that passed while they were missing.
  for (const [word, sentence] of [
    ['after', '- Wire the payout route after the key rotation.'],
    ['once', '- Revisit the critic thresholds once the corpus lands.'],
    ['carried', '- Carried: implement the missing typecheck.'],
  ]) {
    const r = withPlant(DIR, 'docs/PASS-LOG.md', (s) => `${s}\n${sentence}\n`);
    assert.equal(r.exit, 1, `"${word}" was not caught:\n${r.out}`);
    assert.match(r.out, /a deferral with no row id/);
  }
});


test('a CONFESSION repeated three times is a stall; a HANDOFF repeated is not', () => {
  // §6.4 says "any row-id appearing in three consecutive PASS-LOG confessions". §13.1 says the
  // handoff table is REGENERATED every pass. Scanning the whole record conflated the two, and the
  // detector reported OH-1 and OH-2 as stalls for doing exactly what a handoff row is for —
  // "I have not done this" and "this is blocked on someone else" are opposite statements about
  // whose move it is.
  const record = (n, notDone) =>
    `\nPASS ${n}  HEAD abc${n}\nSTATION: none\nHANDOFFS OPEN: OH-1 — approve-by x — flips 1 row\nNOT DONE:\n${notDone}\nNEXT: something\n`;

  const stalled = withPlant(DIR, 'docs/PASS-LOG.md', () =>
    [7, 8, 9].map((n) => record(n, '  w42 | still not done | SCHEDULED next')).join(''));
  assert.equal(stalled.exit, 1, stalled.out);
  assert.match(stalled.out, /w42 has been confessed in three consecutive passes/);

  // The positive control: the same three records, with the id only in the handoff line.
  const handoff = withPlant(DIR, 'docs/PASS-LOG.md', () =>
    [7, 8, 9].map((n) => record(n, '  nothing outstanding')).join(''));
  assert.equal(handoff.exit, 0, handoff.out);
  assert.doesNotMatch(handoff.out, /OH-1 has been confessed/);
});

/* ---------------------------------------------- assertions that cannot fail --- */

test('it catches `assert.ok(X || true)`, the assertion that asserts nothing', () => {
  // Two of these shipped on main and were found by a peer session, not by this checker. One sat on
  // top of the product's only prompt-injection boundary while the fence emitted a constant id
  // underneath it. The line reads as care, which is exactly why nothing caught it for so long.
  const r = withPlant(DIR, 'apps/worker/tests/prompt-fence.test.mjs', (src) =>
    src.replace("import test from 'node:test';", "import test from 'node:test';\n// planted\nconst PLANT = () => assert.ok(1 === 2 || true);"));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /an assertion that cannot fail/);
  assert.match(r.out, /`X \|\| true` is `true`/);
});

test('it catches the mirror forms — `&& false` under a negation, and a bare literal', () => {
  const andFalse = withPlant(DIR, 'apps/worker/tests/prompt-fence.test.mjs', (src) =>
    src.replace("import test from 'node:test';", "import test from 'node:test';\nconst PLANT = () => assert.ok(!(1 === 2 && false));"));
  assert.equal(andFalse.exit, 1, andFalse.out);
  assert.match(andFalse.out, /an assertion that cannot fail/);

  const literal = withPlant(DIR, 'apps/worker/tests/prompt-fence.test.mjs', (src) =>
    src.replace("import test from 'node:test';", "import test from 'node:test';\nconst PLANT = () => assert.ok(true, 'nothing measured here');"));
  assert.equal(literal.exit, 1, literal.out);
  assert.match(literal.out, /a literal `true` is not a measurement/);
});

test('it does NOT fire on `|| true` inside a string, or this file could not name the pattern', () => {
  // The negative control. A detector that matches its own description makes itself unmentionable
  // in comments, test names and documentation — and the usual repair for that is to delete the
  // detector. Strings and comments are stripped before the scan for exactly this reason.
  const quoted = withPlant(DIR, 'apps/worker/tests/prompt-fence.test.mjs', (src) =>
    src.replace("import test from 'node:test';", "import test from 'node:test';\n// a comment naming X || true\nconst PLANT = 'assert.ok(x || true)';"));
  assert.equal(quoted.exit, 0, quoted.out);
  assert.doesNotMatch(quoted.out, /an assertion that cannot fail/);
});

test('the scratch clone is removed', () => {
  rmSync(DIR, { recursive: true, force: true });
});
