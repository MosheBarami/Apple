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
import { once } from 'node:events';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  // The two fields the hand-written evidence in this repo never carried, and the two that say
  // whether the measurement is worth anything: WHICH code was measured, and whether it was
  // committed code at all.
  assert.ok('git' in fields, 'evidence must name the commit it was measured at');
  assert.match(fields.tree, /^(clean|dirty)$/, 'evidence must say whether the tree was dirty');
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
    '  EVIDENCE: exit=0; git=abc1234; tree=clean; EXPECT=matched; output-sha256=deadbeef; output-bytes=2\n';
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
    '  EVIDENCE: exit=0; git=abc1234; tree=clean; EXPECT=MISSED; output-sha256=deadbeef; output-bytes=2\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /records EXPECT=MISSED/);
});

test('--lint fails a gate ticked over a non-zero exit', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  EVIDENCE: exit=2; git=abc1234; tree=clean; EXPECT=matched; output-sha256=deadbeef; output-bytes=2\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /non-zero exit/);
});

test('--lint rejects evidence that was written by hand rather than measured', () => {
  // `git=` and `tree=` are the two fields nobody can write from memory: which commit was measured,
  // and whether the code was committed at all. Requiring them is what makes a hand-written
  // evidence line FAIL — not hypothetical, it happened three times in this repository's ledger,
  // twice after the checker existed to prevent it.
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  EVIDENCE: exit=0; EXPECT=matched; output-sha256=deadbeef; output-bytes=2\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 1);
  assert.match(r.out, /missing git=/);
  assert.match(r.out, /missing tree=/);
});

test('--lint passes a well-formed ledger, so it is not just a failure machine', () => {
  const ledger =
    '- [x] G1: fixture gate\n    CHECK: true\n    EXPECT: x\n' +
    '  EVIDENCE: exit=0; git=abc1234; tree=clean; EXPECT=matched; output-sha256=deadbeef; output-bytes=2\n' +
    '\n- [ ] G2: an honest open gate\n    CHECK: false\n    EXPECT: y\n';
  const r = check(ledger, ['--lint']);
  assert.equal(r.exit, 0);
  assert.match(r.out, /LEDGER WELL-FORMED/);
});

test('--lint passes this repository\'s own ledger', () => {
  const proc = spawnSync('node', [CHECKER, '--lint'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(proc.status, 0, `${proc.stdout}${proc.stderr}`);
  assert.match(proc.stdout, /LEDGER WELL-FORMED/);
});

/* ------------------------------------------------- it reads the real ledger --- */

test('it parses this repository\'s own GATES.md without error', () => {
  // The parser is regex-driven, so the thing most likely to break it is the real file changing
  // shape. Running one real gate proves the whole file still parses.
  const proc = spawnSync('node', [CHECKER, '--gate', 'G91'], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
  assert.notEqual(proc.status, 2, `GATES.md failed to parse:\n${proc.stderr}`);
  assert.match(`${proc.stdout}${proc.stderr}`, /G91/);
});
