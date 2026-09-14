// The checker that decides whether every other gate is met.
//
// WHY THIS FILE EXISTS. `GATES.md` said its evidence was "verified by gate-check.mjs --approve,
// which executed every CHECK: itself and recorded exit status, EXPECT: match and an output
// fingerprint per gate" — and `git log --all -- '*gate-check*'` was EMPTY. The program did not
// exist and never had. Every EVIDENCE line in the ledger was a claim about a measurement nothing
// had taken, inside the one document whose entire purpose is to stop claims standing in for
// measurements.
//
// So the checker was written. A verifier with no test of its own is the same unbacked claim one
// level down, which is what this file closes. Each case below is a way the checker could report
// GREEN over something broken; every one of them is a way the ledger has already been wrong.
//
// These run the real binary against fixture ledgers in a temp directory. Nothing here touches the
// repository's own GATES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'gate-check.mjs');

/** Write a fixture ledger and run the checker over it. */
function check(gates, flags = []) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-check-'));
  const file = join(dir, 'GATES.md');
  writeFileSync(file, `# fixture\n\n## Open\n\n${gates}\n`);
  const proc = spawnSync('node', [CHECKER, '--file', file, ...flags], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return {
    exit: proc.status,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    ledger: () => readFileSync(file, 'utf8'),
  };
}

const gate = (id, cmd, expect, mark = ' ') =>
  `- [${mark}] ${id}: fixture gate\n    CHECK: ${cmd}\n    EXPECT: ${expect}\n`;

/* ------------------------------------------------------------- it can pass --- */

test('a gate whose command succeeds and whose EXPECT appears is met', () => {
  const r = check(gate('G1', 'echo hello world', 'hello'));
  assert.match(r.out, /GATES GREEN/);
  assert.equal(r.exit, 0);
});

/* ------------------------------------------------------------- it can fail --- */

test('a non-zero exit is unmet, and the process says so in its own exit status', () => {
  const r = check(gate('G1', 'echo nope; exit 3', 'nope'));
  assert.match(r.out, /GATES RED/);
  assert.equal(r.exit, 1, 'a RED ledger must fail the process, or CI cannot use this');
});

test('EXIT ZERO IS NOT ENOUGH — a missing EXPECT is unmet', () => {
  // The case the whole EXPECT: field exists for. `pnpm -r test` can exit 0 while a package
  // reports failures, which is why gate-suite.mjs sums `fail N` rather than grepping for success.
  const r = check(gate('G1', 'echo all good', 'fail 0'));
  assert.match(r.out, /GATES RED/);
  assert.equal(r.exit, 1);
  assert.match(r.out, /EXPECT "fail 0" not in output/);
});

test('EXPECT is matched against stderr too', () => {
  // tsc writes its errors to stderr. A checker reading only stdout would call a failing
  // typecheck met, and that is the gate guarding every package in the repo.
  const r = check(gate('G1', 'echo oops 1>&2', 'oops'));
  assert.match(r.out, /GATES GREEN/);
});

test('a hung command is a failure, not a hang', () => {
  const r = check(gate('G1', 'sleep 30', 'never'), ['--timeout', '1200']);
  assert.match(r.out, /GATES RED/);
  assert.match(r.out, /timed out/);
});

/* -------------------------------------------------- it cannot be talked into it --- */

test('a gate already marked [x] is re-run, not believed', () => {
  // The failure this prevents is a checkbox that is true because it was true once. Evidence
  // decays: the code under it changes and the tick does not.
  const r = check(gate('G1', 'echo ran; exit 1', 'ran', 'x'));
  assert.match(r.out, /GATES RED/, 'a checked box must not exempt a gate from running');
});

test('--approve UNCHECKS a gate that no longer passes', () => {
  const r = check(gate('G1', 'echo ran; exit 1', 'ran', 'x'), ['--approve']);
  assert.match(r.ledger(), /^- \[ \] G1:/m, 'a gate that stopped passing must lose its tick');
});

test('an EMPTY EXPECT is malformed too — a gate that asserts nothing is not a gate', () => {
  // Found by writing the fixtures for this file: `EXPECT:` with nothing after it parses as absent,
  // which is the right answer. A gate whose only requirement is "exit 0" is the success-only
  // oracle this repo already caught itself shipping once.
  const r = check('- [ ] G1: fixture gate\n    CHECK: true\n    EXPECT: \n');
  assert.equal(r.exit, 2);
});

test('a gate missing a CHECK or EXPECT is a hard error, never a silent skip', () => {
  // A gate this parser cannot see is a gate that can never fail — the most dangerous shape in the
  // file, because the ledger still counts it in the total.
  const r = check('- [ ] G1: fixture gate with no check\n');
  assert.equal(r.exit, 2);
  assert.match(r.out, /missing a CHECK: or EXPECT:/);
});

test('two gates with the same id is a hard error', () => {
  // Not tidiness. `--gate G19` runs both, the ledger counts one id twice, and --approve writes a
  // tick onto whichever the parser saw first — so a gate can be ticked by its namesake passing.
  // Two sessions appended a G19 to this repository's ledger within minutes of each other, and
  // nothing noticed until a single-gate run reported "2 run".
  const r = check(gate('G1', 'echo a', 'a') + '\n' + gate('G1', 'echo b', 'b'));
  assert.equal(r.exit, 2);
  assert.match(r.out, /duplicate gate ids/);
});

test('asking for a gate that does not exist is an error, not an empty pass', () => {
  const r = check(gate('G1', 'echo hi', 'hi'), ['--gate', 'G99']);
  assert.equal(r.exit, 2);
  assert.doesNotMatch(r.out, /GREEN/);
});

/* ---------------------------------------------------------- the evidence --- */

test('--approve records what was measured, including things a claim cannot fake', () => {
  const r = check(gate('G1', 'echo measured', 'measured'), ['--approve']);
  const ledger = r.ledger();
  const line = /^ {2}EVIDENCE: (.+)$/m.exec(ledger);
  assert.ok(line, 'no EVIDENCE line was written');

  const fields = Object.fromEntries(
    line[1].split('; ').map((pair) => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );

  assert.equal(fields.exit, '0');
  assert.equal(fields.EXPECT, 'matched');
  assert.match(fields['output-sha256'], /^[0-9a-f]{64}$/);
  assert.equal(fields['output-bytes'], String(Buffer.byteLength('measured\n')));
  // The fields the hand-written evidence in this repo never carried, and the ones that say whether
  // the measurement is worth anything: WHICH code was measured, whether it was committed code at
  // all, and WHICH TOOLCHAINS were present — a Luau gate recorded with luau=ABSENT proved nothing,
  // because the runner skipped and exited 0, which `node --test` reports as `fail 0`.
  assert.ok('git-sha' in fields, 'evidence must name the commit it was measured at');
  assert.match(fields['tree-clean'], /^(yes|no)$/, 'evidence must say whether the tree was dirty');
  assert.match(fields.node, /^v\d+/, 'evidence must name the node that ran it');
  assert.ok('luau' in fields, 'evidence must say whether a Luau toolchain was present');
  assert.ok('playwright' in fields, 'evidence must say whether Playwright was present');
  assert.match(fields.at, /^\d{4}-\d{2}-\d{2}T/, 'evidence must be dated, so a stale record reads as stale');
});

test('the fingerprint tracks the output, so a changed test set cannot reuse old evidence', () => {
  const a = check(gate('G1', 'echo one', 'one'), ['--approve']).ledger();
  const b = check(gate('G1', 'echo two', 'two'), ['--approve']).ledger();
  const sha = (l) => /output-sha256=([0-9a-f]{64})/.exec(l)[1];
  assert.notEqual(sha(a), sha(b));
});

test('a failing gate is not given an evidence line it did not earn', () => {
  const r = check(gate('G1', 'echo boom; exit 1', 'boom'), ['--approve']);
  assert.doesNotMatch(r.ledger(), /EVIDENCE:/, 'an unmet gate with no prior evidence must record none');
});

test('--approve does not clobber a gate that appeared while the run was executing', async () => {
  // The ledger is shared and a full run takes minutes. Two sessions appended to this repository's
  // GATES.md within the same afternoon; writing back the copy read at startup would have deleted
  // whichever landed second.
  const dir = mkdtempSync(join(tmpdir(), 'gate-check-race-'));
  const file = join(dir, 'GATES.md');
  writeFileSync(file, `# fixture\n\n## Open\n\n${gate('G1', 'sleep 1; echo slow', 'slow')}\n`);

  const child = spawn('node', [CHECKER, '--file', file, '--approve'], { cwd: ROOT, stdio: 'ignore' });
  // Lands while G1 is still sleeping inside the checker.
  const appended = new Promise((resolve) => {
    setTimeout(() => {
      appendFileSync(file, `${gate('G2', 'echo late', 'late')}\n`);
      resolve();
    }, 300);
  });
  await appended;
  await once(child, 'close');

  const after = readFileSync(file, 'utf8');
  assert.match(after, /^- \[x\] G1:/m, 'the measured gate must be recorded');
  assert.match(after, /EVIDENCE:/, 'and must still get its evidence');
  assert.match(after, /G2:/, 'the gate that landed mid-run must survive the write-back');
});

test('two gates running the IDENTICAL command is a hard error', () => {
  // The id check cannot see this: the ids differ, so nothing complains, and the total at the foot
  // of the ledger reads higher for no extra coverage — the ledger padding itself. It happened:
  // two sessions each wrote a drafts gate against tests/draft.test.mjs, and GATES.md reported 31
  // gates while proving 30 things.
  const r = check(gate('G1', 'echo same', 'same') + '\n' + gate('G2', 'echo same', 'same'));
  assert.equal(r.exit, 2);
  assert.match(r.out, /duplicating a CHECK/);
});

/* ---------------------------------------------------------------- --status --- */

test('--status executes nothing and names the gates that need work', () => {
  const r = check(gate('G1', 'exit 9', 'never', 'x'), ['--status']);
  assert.doesNotMatch(r.out, /GATES (GREEN|RED)/, '--status must not execute');
  assert.match(r.out, /need\(s\) work/);
  assert.equal(r.exit, 1, 'a gate needing work must fail the process so a hook can act on it');
});

test('--status flags a CHECK that names a file which does not exist', () => {
  // How a gate gets written for a test nobody wrote. Until something runs it, it is
  // indistinguishable from a real gate — and it sat open in this ledger exactly that way.
  const r = check(gate('G1', 'cd apps/web && node --test tests/never-written.test.mjs', 'fail 0', 'x'), ['--status']);
  assert.match(r.out, /CHECK names a file that does not exist/);
  assert.match(r.out, /never-written\.test\.mjs/);
});

test('--status reports a clean ledger as needing no work', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: echo hi\n    EXPECT: hi\n' +
    '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--status']);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /0 need\(s\) work/);
});

test('--status distinguishes measured evidence from hand-written', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: echo hi\n    EXPECT: hi\n' +
    '  EVIDENCE: exit=0; EXPECT=matched; output-sha256=deadbeef\n';
  const r = check(ledger, ['--status']);
  assert.match(r.out, /hand-written/);
});

/* ------------------------------------------------------------------ --lint --- */

test('--lint executes nothing', () => {
  // The whole point: cheap enough for CI on every push. If it ran the commands it would be the
  // same ten minutes as a full pass and would be turned off.
  const r = check(gate('G1', 'exit 7', 'never', 'x'), ['--lint']);
  assert.doesNotMatch(r.out, /GATES (GREEN|RED)/, '--lint must not report an execution result');
  assert.match(r.out, /LEDGER/);
});

test('--lint fails a gate that is ticked with no evidence under it', () => {
  // The shape every defect in this ledger has had: a claim with no measurement beneath it.
  const r = check(gate('G1', 'true', 'x', 'x'), ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /ticked with no EVIDENCE/);
  assert.match(r.out, /LEDGER MALFORMED/);
});

test('--lint fails a gate whose own evidence contradicts its tick', () => {
  // A ticked box above `EXPECT=MISSED` is worse than an untested gate, because it reads as proof.
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=unmatched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /records an unmatched EXPECT/);
});

test('--lint fails a gate ticked over a non-zero exit', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  EVIDENCE: exit=2; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /non-zero exit/);
});

test('--lint rejects evidence that was written by hand rather than measured', () => {
  // `git-sha=`, `tree-clean=` and `at=` are the fields nobody can write from memory: which commit
  // was measured, whether the code was committed at all, and when. Requiring them is what makes a
  // hand-written evidence line FAIL — not hypothetical, it happened three times in this
  // repository's ledger, twice after the checker existed to prevent it.
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  EVIDENCE: exit=0; EXPECT=matched; output-sha256=deadbeef; output-bytes=2\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /missing git-sha=/);
  assert.match(r.out, /missing tree-clean=/);
  assert.match(r.out, /missing at=/);
});

test('--lint passes a well-formed ledger, so it is not just a failure machine', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '\n- [ ] G2: an honest open gate\n    CHECK: false\n    EXPECT: y\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 0);
  assert.match(r.out, /LEDGER WELL-FORMED/);
});

test('--lint reports this repository\'s own ledger without crashing', () => {
  // Deliberately NOT asserting the repo ledger is well-formed. It is red by design while the
  // red-first back-fill is in progress, and a test that demanded otherwise would be a test of the
  // backlog rather than of the checker — and the cheapest way to pass it would be to weaken the
  // lint. What is asserted is that lint REACHES a verdict on the real file: exit 0 or 1, never the
  // exit-2 that means the parser fell over.
  const proc = spawnSync('node', [CHECKER, '--lint'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.notEqual(proc.status, 2, `GATES.md failed to parse:\n${proc.stdout}${proc.stderr}`);
  assert.match(proc.stdout, /LEDGER (WELL-FORMED|MALFORMED) — \d+ gates/);
});

/* ------------------------------------------------- it reads the real ledger --- */

test('it parses this repository\'s own GATES.md without error', () => {
  // The parser is regex-driven, so the thing most likely to break it is the real file changing
  // shape. Running one real gate proves the whole file still parses.
  const proc = spawnSync('node', [CHECKER, '--gate', 'G91'], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.notEqual(proc.status, 2, `GATES.md failed to parse:\n${proc.stderr}`);
  assert.match(`${proc.stdout}${proc.stderr}`, /G91/);
});

/* ------------------------------------------------------- --reverify (§6.1) --- */
//
// WHY THESE FOUR EXIST. `node scripts/gate-check.mjs --reverify GATES.md` is the first command of
// the verification block, and for the life of this repository it was a silent no-op: flags were
// parsed with `args.includes()`, so an unrecognised `--reverify` fell through to an ordinary
// verify and printed a green summary. Every pass that "re-verified fingerprints" had done nothing
// of the kind, and the terminal condition's first clause was vacuously satisfiable.
//
// Each case below is one way the ledger could read GREEN over something that is not true.

/** A fixture whose EVIDENCE fingerprint does not match what the CHECK actually produces. */
const staleLedger = (sha) =>
  '- [x] G1: fixture gate\n    CHECK: echo hi\n    EXPECT: hi\n' +
  '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
  `  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=${sha}; output-bytes=3; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n`;

test('--reverify marks a gate UNMET when its stored fingerprint does not reproduce', () => {
  // The gate still PASSES — `echo hi` exits 0 and matches. What changed is the world the evidence
  // described. Evidence that no longer reproduces is not evidence, and the checkbox is what a
  // reader trusts, so the checkbox is what must change.
  const r = check(staleLedger('0'.repeat(64)), ['--reverify']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /QUARANTINED G1/);
  assert.match(r.out, /output-sha256 does not reproduce/);
  assert.match(r.ledger(), /^- \[ \] G1:/m, 'the checkbox must be cleared IN THE FILE, not merely reported');
});

test('--reverify leaves a gate met when its fingerprint does reproduce', () => {
  // The positive control. Without it the test above passes on a --reverify that quarantines
  // everything unconditionally, which would be a different way of telling the reader nothing.
  const sha = createHash('sha256').update('hi\n').digest('hex');
  const r = check(staleLedger(sha), ['--reverify']);
  assert.equal(r.exit, 0, r.out);
  assert.doesNotMatch(r.out, /QUARANTINED/);
  assert.match(r.ledger(), /^- \[x\] G1:/m);
});

test('--reverify marks a gate UNMET when it carries EVIDENCE but no FALSIFIED record', () => {
  // A gate nobody has watched fail is a gate that may be incapable of failing. `node --test`
  // prints `fail 0` and exits 0 for a file with zero tests, so "green" is not evidence that the
  // assertion ran — only a recorded red is.
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: echo hi\n    EXPECT: hi\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=3; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--reverify']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /no FALSIFIED record/);
  assert.match(r.ledger(), /^- \[ \] G1:/m);
});

test('--reverify marks a gate UNMET when its CHECK names a path git does not track', () => {
  // A gate over an untracked file is green on this laptop and absent everywhere else. It is the
  // exact shape of a proof that does not survive leaving the machine that wrote it.
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: node --test tests/not-in-git.test.mjs\n    EXPECT: fail 0\n' +
    '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--reverify']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /untracked path/);
  assert.match(r.ledger(), /^- \[ \] G1:/m);
});

test('an unrecognised flag exits 2 rather than running something else', () => {
  // THE DEFECT THIS FILE WAS WRITTEN FOR. `--reverify` used to land here, silently, and the caller
  // believed fingerprints had been checked.
  const proc = spawnSync('node', [CHECKER, '--nonsense-flag'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(proc.status, 2, `${proc.stdout}${proc.stderr}`);
  assert.match(`${proc.stdout}${proc.stderr}`, /unrecognised flag --nonsense-flag/);
  assert.doesNotMatch(`${proc.stdout}${proc.stderr}`, /GATES (GREEN|RED)/, 'it must not run the gates anyway');
});

test('a flag that wants a value and is given none exits 2', () => {
  for (const flag of ['--gate', '--file', '--timeout', '--break-sha']) {
    const proc = spawnSync('node', [CHECKER, flag], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    assert.equal(proc.status, 2, `${flag}: ${proc.stdout}${proc.stderr}`);
  }
});

test('--lint fails when the typed summary disagrees with the checkbox count', () => {
  // A prose tally is a number a human wrote, and a reader trusts the sentence over counting thirty
  // boxes. So it is compared, never used: the authority is always the checkboxes.
  const ledger =
    '**9 gates, 9 met, 0 unmet** — measured, allegedly\n\n' +
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /typed summary says 9 gates; the file has 1/);
  assert.match(r.out, /typed summary says 9 met; 1 boxes are ticked/);
});

test('--falsify refuses to record a green gate as falsified', () => {
  // The red-first discipline in one assertion: if the gate passes with the shipping call site
  // removed, it was never measuring the shipping call site.
  const r = check(gate('G1', 'echo hi', 'hi'), ['--falsify', '--gate', 'G1']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /is GREEN — it cannot be falsified/);
  assert.doesNotMatch(r.ledger(), /FALSIFIED:/, 'nothing may be recorded for a gate that did not fail');
});

test('--falsify records a red gate, carrying the sha of the break', () => {
  const r = check(gate('G1', 'echo nope; exit 1', 'hi'), ['--falsify', '--gate', 'G1', '--break-sha', 'cafe123']);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.ledger(), /^ {2}FALSIFIED: .*break-sha=cafe123/m);
  assert.match(r.ledger(), /EXPECT=unmatched/);
});

test('--falsify takes exactly one gate, because a batch is not a falsification', () => {
  const proc = spawnSync('node', [CHECKER, '--falsify'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(proc.status, 2, `${proc.stdout}${proc.stderr}`);
  assert.match(`${proc.stdout}${proc.stderr}`, /exactly one --gate/);
});

test('--lint rejects a FALSIFIED and an EVIDENCE that share one sha', () => {
  // If the "break" commit and the fixed commit are the same commit, nothing was broken and the red
  // run measured the same tree as the green one.
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  FALSIFIED: exit=1; git-sha=abc1234; break-sha=abc1234; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /share one sha — the break changed nothing/);
});

test('--lint rejects a Luau gate recorded with no Luau toolchain', () => {
  // The runner prints SKIPPED and exits 0 when `luau` is absent, which `node --test` reports as
  // `fail 0`. A gate over the plugin recorded that way proved nothing at all.
  const ledger =
    '- [x] G1: a plugin gate\n    CHECK: node apps/plugin/tests/run.mjs src/door.luau\n    EXPECT: fail 0\n' +
    '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=0.6; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=yes; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /gates Luau but was recorded with luau=ABSENT/);
});

test('--lint rejects evidence recorded against a dirty tree', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  FALSIFIED: exit=1; git-sha=bad0000; break-sha=bad0000; tree-clean=yes; EXPECT=unmatched; output-sha256=f00d; output-bytes=1; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n' +
    '  EVIDENCE: exit=0; git-sha=abc1234; tree-clean=no; EXPECT=matched; output-sha256=deadbeef; output-bytes=2; node=v26; luau=ABSENT; playwright=ABSENT; at=2026-09-14T00:00:00.000Z\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /recorded against a dirty tree/);
});

test('the parser can see a gate whose id is not a number', () => {
  // G-ORACLE-1 and G-TOOLCHAIN-1 are the gates on the checker itself. A parser keyed to `G\\d+`
  // could not see them, which would put the checks on the checker outside the ledger — exactly the
  // blind spot they exist to close.
  const r = check('- [ ] G-ORACLE-1: the checker checks itself\n    CHECK: echo ok\n    EXPECT: ok\n', ['--status']);
  assert.match(r.out, /G-ORACLE-1/);
});

test('the parser reads a station tag without losing the title', () => {
  const r = check('- [ ] G7 [S4]: a station-tagged gate\n    CHECK: echo ok\n    EXPECT: ok\n', ['--status']);
  assert.match(r.out, /a station-tagged gate/);
  assert.doesNotMatch(r.out, /\[S4\]: a station/, 'the tag must be parsed, not left in the title');
});

/* ------------------------------------------------ the fingerprint reproduces --- */
//
// THE DEFECT. `output-sha256` was taken over the raw stream, and `node --test` prints a duration on
// every line. Two identical runs of an unchanged file produced different fingerprints, so the first
// real `--reverify` quarantined EVERY test gate in the ledger — not because anything was wrong, but
// because the check as written could never pass. An oracle that always fires is as useless as one
// that never does, and the tempting repair is to stop comparing fingerprints at all.

test('two runs of an unchanged gate produce the same fingerprint', () => {
  // Without this the whole --reverify mechanism is decorative: it would quarantine every test gate
  // on every pass, and the obvious "fix" would be to stop comparing fingerprints at all.
  //
  // The fixture is a real `node --test` run over a file written for this test — a real runner
  // printing real per-test durations — rather than one of the repository's own suites, which would
  // make this test's result depend on that suite's health.
  const dir = mkdtempSync(join(tmpdir(), 'gate-check-timing-'));
  const spec = join(dir, 'timing.test.mjs');
  writeFileSync(spec, "import test from 'node:test';\ntest('a', () => {});\ntest('b', () => {});\n");

  const sha = (l) => {
    const m = /output-sha256=([0-9a-f]{64})/.exec(l);
    assert.ok(m, `no EVIDENCE line was written:\n${l}`);
    return m[1];
  };
  const g = `- [ ] G1: timing noise\n    CHECK: node --test ${spec}\n    EXPECT: pass 2\n`;
  const a = check(g, ['--approve']).ledger();
  const b = check(g, ['--approve']).ledger();
  assert.equal(sha(a), sha(b), 'per-test durations must not change the fingerprint');
});

test('but a CHANGED test set still changes the fingerprint', () => {
  // The positive control for the test above. Normalising away noise is only safe if it leaves the
  // signal — a fingerprint that ignores everything would also "reproduce" perfectly.
  const sha = (l) => /output-sha256=([0-9a-f]{64})/.exec(l)[1];
  const a = check(gate('G1', 'echo alpha', 'alpha'), ['--approve']).ledger();
  const b = check(gate('G1', 'echo beta', 'beta'), ['--approve']).ledger();
  assert.notEqual(sha(a), sha(b));
});

test('a failing assertion still changes the fingerprint, durations notwithstanding', () => {
  // The case that matters most: normalisation must not swallow the DIFF text a failure prints.
  const sha = (l) => /output-sha256=([0-9a-f]{64})/.exec(l)[1];
  const a = check(gate('G1', 'echo "expected 1 got 1"', 'expected'), ['--approve']).ledger();
  const b = check(gate('G1', 'echo "expected 1 got 2"', 'expected'), ['--approve']).ledger();
  assert.notEqual(sha(a), sha(b));
});

test('output-bytes is NOT normalised, so a truncated run stays visible', () => {
  // Byte count is the one field that must reflect the raw stream: normalisation would hide a run
  // that died halfway through and happened to normalise to the same text.
  const r = check(gate('G1', 'echo measured', 'measured'), ['--approve']).ledger();
  assert.match(r, new RegExp(`output-bytes=${Buffer.byteLength('measured\n')}`));
});

test('no tracked source file contains a raw control byte', () => {
  // A file with a NUL in it is BINARY to grep, to `file(1)`, and to every source-walking checker in
  // this repository: `grep -c e` over such a file prints nothing at all and exits 1, which a naive
  // check reads as "no matches" rather than "I could not look".
  //
  // Three tracked files had raw NUL bytes, all using NUL as an intentional delimiter or — in
  // safe-redirect.test.mjs — as a real open-redirect attack vector. The fix is to write the ESCAPE
  // (`\0`, two characters) rather than the raw byte: identical at runtime, and the file stays text.
  // DELETING the NUL from safe-redirect.test.mjs would destroy a security test, so a future pass
  // must escape, never strip.
  const tracked = spawnSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs', '*.js', '*.luau', '*.astro', '*.py'], {
    cwd: ROOT, encoding: 'utf8',
  }).stdout.split('\n').filter(Boolean);
  assert.ok(tracked.length > 300, `expected a real denominator, got ${tracked.length} files`);

  const offenders = [];
  for (const rel of tracked) {
    const buf = readFileSync(join(ROOT, rel));
    for (const byte of buf) {
      if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) { offenders.push(rel); break; }
    }
  }
  assert.deepEqual(offenders, [], `these are binary to every grep-based check: ${offenders.join(', ')}`);
});

test('the checker refuses to verify a tree the caller is not standing in', () => {
  // ROOT is derived from gate-check.mjs's OWN path, so invoking it by absolute path from another
  // tree runs every CHECK against the checker's tree while the caller believes it is testing theirs.
  // Falsification fails safe that way (the break is absent, the gate is green, the record refused),
  // but --reverify does not: it would stamp EVIDENCE describing the wrong tree, carrying the wrong
  // tree's git sha, with nothing in the record to show the mix-up. This happened while recording G5.
  const scratch = mkdtempSync(join(tmpdir(), 'gate-check-othertree-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: scratch });
    const elsewhere = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gate-check.mjs'), '--status', join(ROOT, 'GATES.md')], {
      cwd: scratch, encoding: 'utf8',
    });
    assert.equal(elsewhere.status, 2, 'a run from another tree must refuse, not verify the wrong one');
    assert.match(elsewhere.stderr, /you are standing in/);

    // POSITIVE CONTROL. Without this the assertion above would also pass if the checker were broken
    // outright and exited 2 on everything.
    const athome = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gate-check.mjs'), '--status', join(ROOT, 'GATES.md')], {
      cwd: ROOT, encoding: 'utf8',
    });
    assert.notEqual(athome.status, 2, 'the same command from the checker\'s own tree must still run');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
