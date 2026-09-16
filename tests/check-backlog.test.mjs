// The test of the checker that makes FEATURES.json cost something to lie in.
//
// The file it guards had 1,249 rows that no program read, so `sed -i 's/"not-started"/"done"/g'`
// closed 1,084 of them and passed every check in the repository. A checker written against that
// needs its own tests for the same reason every other oracle here does: its failure mode is a quiet
// pass, and a quiet pass over a backlog is indistinguishable from a finished product.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-backlog.mjs');

/** A scratch repo holding only the two backlog files, so fixtures cannot touch the real ones. */
function scratch(sections, mdBody) {
  const dir = mkdtempSync(join(tmpdir(), 'check-backlog-'));
  mkdirSync(join(dir, 'docs', 'backlog'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'check-backlog.mjs'), readFileSync(CHECKER, 'utf8'));
  const data = {
    capturedAt: '2026-01-01',
    source: 'fixture',
    sectionCount: sections.length,
    itemCount: sections.reduce((n, s) => n + s.items.length, 0),
    sections: sections.map((s) => ({ ...s, count: s.items.length })),
  };
  writeFileSync(join(dir, 'docs', 'backlog', 'FEATURES.json'), JSON.stringify(data, null, 2));
  writeFileSync(join(dir, 'docs', 'backlog', 'FEATURES.md'), mdBody);
  // A ledger with one MET gate, so a fixture can cite something runnable. Without this the only
  // evidence a fixture could offer was prose, and the gate-citation path — the one a real closed
  // row is supposed to use — had no test at all.
  writeFileSync(join(dir, 'GATES.md'), [
    '- [x] G1: a met gate',
    '    CHECK: echo hi',
    '    EXPECT: hi',
    '  EVIDENCE: exit=0; tree-clean=yes; EXPECT=matched',
    '',
    '- [ ] G2: an unmet gate',
    '    CHECK: echo hi',
    '    EXPECT: hi',
    '',
  ].join('\n'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function run(dir, ...args) {
  const p = spawnSync(process.execPath, [join(dir, 'scripts', 'check-backlog.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
}

const bucket = (name, count, done = 0, partial = 0) => `### ${name} — ${count} items  (done ${done}, partial ${partial})\n`;
const CLEAN = [{ section: 'A', items: [{ id: 'f-1', name: 'one', status: 'not-started', evidence: null }] }];

let DIRS = [];
const keep = (d) => { DIRS.push(d); return d; };

/* ------------------------------------------------------------ it can pass --- */

test('a backlog whose rows are all not-started has nothing to prove and passes', () => {
  const r = run(keep(scratch(CLEAN, bucket('A', 1))));
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /BACKLOG HONEST/);
});

/* ---------------------------------------------- the sed that started this --- */

test('THE SED. Flipping every row to done without evidence fails', () => {
  // `sed -i 's/"not-started"/"done"/g'` — one keystroke, 1,084 rows closed, every existing check
  // still green. This is the assertion that costs that keystroke something.
  const sed = [{ section: 'A', items: [{ id: 'f-1', name: 'one', status: 'done', evidence: null }] }];
  const r = run(keep(scratch(sed, bucket('A', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /is "done" with no evidence at all/);
});

test('prose is not evidence, however true the prose is', () => {
  // Every one of the 165 closed rows in the real file cites prose. Some of it is accurate. None of
  // it can be run, and a status nobody can re-derive is a status that decays silently.
  const prose = [{ section: 'A', items: [{ id: 'f-1', name: 'one', status: 'done', evidence: 'the billing webhook verifies signatures' }] }];
  const r = run(keep(scratch(prose, bucket('A', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /citing prose, not a runnable thing/);
});

/* ---------------------------------------------------------- double counting --- */

test('one feature closed in two sections on identical evidence is counted twice', () => {
  // The real file does this seven times — "Unit tests", "Webhooks", "Model routing" and four more.
  // A backlog that counts one piece of work twice reports progress it has not made.
  const dup = [
    { section: 'A', items: [{ id: 'f-1', name: 'Webhooks', status: 'done', evidence: 'POST /api/billing/webhook' }] },
    { section: 'B', items: [{ id: 'f-2', name: 'Webhooks', status: 'done', evidence: 'POST /api/billing/webhook' }] },
  ];
  const r = run(keep(scratch(dup, bucket('A', 1, 1) + bucket('B', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /closed in 2 sections citing identical evidence/);
});

test('the same NAME in two sections is fine when the work is genuinely different', () => {
  // THE CONTROL, and the reason the rule is not "no duplicate names". 25 such pairs exist in the
  // real file — "Webhooks" under integrations and under the developer platform are different
  // features. Forbidding the name outright would produce 25 findings nobody can act on, and a
  // checker whose findings cannot be acted on gets muted.
  const legit = [
    { section: 'A', items: [{ id: 'f-1', name: 'Webhooks', status: 'not-started', evidence: null }] },
    { section: 'B', items: [{ id: 'f-2', name: 'Webhooks', status: 'not-started', evidence: null }] },
  ];
  const r = run(keep(scratch(legit, bucket('A', 1) + bucket('B', 1))));
  assert.equal(r.exit, 0, r.out);
});

test('a repeated name WITHIN one section is always wrong', () => {
  const same = [{ section: 'A', items: [
    { id: 'f-1', name: 'one', status: 'not-started', evidence: null },
    { id: 'f-2', name: 'one', status: 'not-started', evidence: null },
  ] }];
  const r = run(keep(scratch(same, bucket('A', 2))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /appears twice in "A"/);
});

test('two rows sharing an id is an error — an id must address one row', () => {
  const clash = [{ section: 'A', items: [
    { id: 'f-1', name: 'one', status: 'not-started', evidence: null },
    { id: 'f-1', name: 'two', status: 'not-started', evidence: null },
  ] }];
  const r = run(keep(scratch(clash, bucket('A', 2))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /share the id f-1/);
});

/* ------------------------------------------------ the two files must agree --- */

test('a bucket in the markdown with no section in the JSON fails', () => {
  const r = run(keep(scratch(CLEAN, bucket('A', 1) + bucket('Ghost', 3))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /"Ghost" is a bucket in FEATURES\.md with no section in the JSON/);
});

test('a section in the JSON with no bucket in the markdown fails', () => {
  const extra = [...CLEAN, { section: 'Hidden', items: [{ id: 'f-9', name: 'x', status: 'not-started', evidence: null }] }];
  const r = run(keep(scratch(extra, bucket('A', 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /"Hidden" is a section in the JSON with no bucket in FEATURES\.md/);
});

test('a hand-written tally that disagrees with the JSON fails', () => {
  // Both halves of the real file were wrong in OPPOSITE directions: the markdown said "done 0"
  // for a section whose JSON held 12. The human-readable half under-reported while the
  // machine-readable half over-claimed, and neither could correct the other.
  const r = run(keep(scratch(CLEAN, bucket('A', 1, 5))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /says done 5, the JSON has 0/);
});

/* ------------------------------------------------------ the checker's shape --- */

test('a count the file states about itself must be derived, not typed', () => {
  const dir = keep(scratch(CLEAN, bucket('A', 1)));
  const p = join(dir, 'docs', 'backlog', 'FEATURES.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));
  data.itemCount = 999;
  writeFileSync(p, JSON.stringify(data, null, 2));
  const r = run(dir);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /itemCount says 999, the file has 1/);
});

test('the DENOMINATOR is printed, and names how many rows cite something runnable', () => {
  // §6.3: a checker that does not publish what it examined can shrink its own scope silently.
  const r = run(keep(scratch(CLEAN, bucket('A', 1))));
  assert.match(r.out, /^DENOMINATOR 1 rows across 1 sections; 0 claim a status \(0 of them declared duplicates[^)]*\), 0 cite something runnable/m);
});

test('an unrecognised flag is refused rather than ignored', () => {
  const dir = keep(scratch(CLEAN, bucket('A', 1)));
  const p = spawnSync(process.execPath, [join(dir, 'scripts', 'check-backlog.mjs'), '--force'], { cwd: dir, encoding: 'utf8' });
  assert.equal(p.status, 2);
});

/* ------------------------------------------------ the cross-taxonomy pointer --- */

const pair = (secStatus, extra = {}) => ([
  { section: 'A', items: [{ id: 'f-1', name: 'Model routing', status: 'done', evidence: 'proven by G1' }] },
  { section: 'B', items: [{ id: 'f-2', name: 'Model routing', status: secStatus, evidence: 'same work as f-1', duplicateOf: 'f-1', ...extra }] },
]);

test('a declared duplicate is listed for the reader and NOT counted', () => {
  // Six of the seven collisions in the real file are genuine: "Model routing" is both an AI Models
  // concern and an Infrastructure one, and a reader looking in either place should find it. Listing
  // it twice is useful; counting it twice is not, and while the only signal was an identical
  // evidence string the two were indistinguishable.
  const r = run(keep(scratch(pair('done'), bucket('A', 1, 1) + bucket('B', 1, 0))));
  assert.equal(r.exit, 0, r.out);
  // done 0 in bucket B is the point: the duplicate does not raise the tally. And it needs no
  // citation of its own — requiring one would push whoever closes it to paste the primary's
  // evidence string back in, which is the double-counting signature the pointer replaced.
});

test('counting a declared duplicate in the tally is still an error', () => {
  // The inverse control. If the tally included duplicates, the fix for double-counting would read
  // as a permanent tally error and the obvious response would be to undo the fix.
  const r = run(keep(scratch(pair('done'), bucket('A', 1, 1) + bucket('B', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /says done 1, the JSON has 0/);
});

test('a duplicate pointing at nothing is a pointer to nothing', () => {
  const r = run(keep(scratch(pair('done', { duplicateOf: 'f-missing' }), bucket('A', 1, 1) + bucket('B', 1, 0))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /which is not a row here/);
});

test('a duplicate of a duplicate is refused — the primary must be the real row', () => {
  const chain = [
    { section: 'A', items: [{ id: 'f-1', name: 'x', status: 'done', evidence: 'proven by G1', duplicateOf: 'f-2' }] },
    { section: 'B', items: [{ id: 'f-2', name: 'x', status: 'done', evidence: 'proven by G1', duplicateOf: 'f-1' }] },
  ];
  const r = run(keep(scratch(chain, bucket('A', 1, 0) + bucket('B', 1, 0))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /which is itself a duplicate/);
});

test('a duplicate cannot be further along than the work it duplicates', () => {
  // Otherwise `duplicateOf` becomes a way to close a row by pointing at an open one.
  const ahead = [
    { section: 'A', items: [{ id: 'f-1', name: 'x', status: 'not-started', evidence: null }] },
    { section: 'B', items: [{ id: 'f-2', name: 'x', status: 'done', evidence: 'same work as f-1', duplicateOf: 'f-1' }] },
  ];
  const r = run(keep(scratch(ahead, bucket('A', 1, 0) + bucket('B', 1, 0))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /but the row it duplicates is not-started/);
});

test('a duplicate must name the same feature, and live in another section', () => {
  const renamed = [
    { section: 'A', items: [{ id: 'f-1', name: 'x', status: 'done', evidence: 'proven by G1' }] },
    { section: 'B', items: [{ id: 'f-2', name: 'SOMETHING ELSE', status: 'done', evidence: 's', duplicateOf: 'f-1' }] },
  ];
  const r = run(keep(scratch(renamed, bucket('A', 1, 1) + bucket('B', 1, 0))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /duplicates a row with a different name/);

  const sameSection = [{ section: 'A', items: [
    { id: 'f-1', name: 'x', status: 'done', evidence: 'proven by G1' },
    { id: 'f-2', name: 'x', status: 'done', evidence: 's', duplicateOf: 'f-1' },
  ] }];
  const r2 = run(keep(scratch(sameSection, bucket('A', 2, 1))));
  assert.equal(r2.exit, 1, r2.out);
  assert.match(r2.out, /duplicates a row in its own section/);
});

test('a row citing a MET gate is proven; citing an unmet one is not', () => {
  // This is what "exists in the repo and passes" means in this repository's own vocabulary: a met
  // gate carries a CHECK that ran and EVIDENCE whose fingerprint reproduced. Until the fixtures
  // carried a ledger, this path — the one every legitimately closed row is supposed to use — had
  // no test, and the checker could only ever have been observed rejecting things.
  const proven = [{ section: 'A', items: [{ id: 'f-1', name: 'x', status: 'done', evidence: 'proven by G1' }] }];
  const ok = run(keep(scratch(proven, bucket('A', 1, 1))));
  assert.equal(ok.exit, 0, ok.out);
  assert.match(ok.out, /1 cite something runnable/);

  const unmet = [{ section: 'A', items: [{ id: 'f-1', name: 'x', status: 'done', evidence: 'proven by G2' }] }];
  const bad = run(keep(scratch(unmet, bucket('A', 1, 1))));
  assert.equal(bad.exit, 1, bad.out);
  //[[ THIS ASSERTION USED TO READ /citing prose, not a runnable thing/, AND IT WAS WRONG IN THE
  //   SAME WAY THE CHECKER WAS.
  //
  //   G2 is in the ledger and carries a CHECK. It is not prose; it is a gate that is red. Two real
  //   rows cited G90 that way, and the finding told whoever read it to fix the sentence — which
  //   would not have moved the finding by one line, because the thing that is wrong is a gate.
  //   A test that pins a misleading message is what keeps the message misleading. ]]
  assert.match(bad.out, /cites G2, which the ledger does not mark met/);
  assert.match(bad.out, /close the gate or reopen the row/);
  assert.doesNotMatch(bad.out, /citing prose/, 'a named gate is never prose');
});

test('...and a gate id the ledger has never heard of IS prose, which is the control', () => {
  // The separation only means something if the other branch still fires. `G404` is not in the
  // fixture ledger at all, so nothing in the repository runs when someone writes it down — which
  // is exactly what "prose, not a runnable thing" is for, and the only shape it should cover now.
  const invented = [{ section: 'A', items: [{ id: 'f-1', name: 'x', status: 'done', evidence: 'proven by G404, obviously' }] }];
  const r = run(keep(scratch(invented, bucket('A', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /citing prose, not a runnable thing/);
  assert.doesNotMatch(r.out, /does not mark met/);
});

/* ------------------------------ a status its own evidence contradicts --- */

const one = (item) => [{ section: 'A', items: [item] }];

test('THE STRONGEST NEW RULE — a "done" row whose evidence opens NOT ATTEMPTED', () => {
  // Two SECURITY rows — Authorization and Tenant isolation — were marked done with evidence
  // beginning "NOT ATTEMPTED". Nothing caught it, because the old rule only asked whether a
  // citation was runnable and never whether the prose contradicted the status it hung on.
  //
  // A row is at its most dangerous when it is honest in the evidence field and wrong in the status
  // field: a reader scanning statuses sees done, and the truth is one column over.
  const r = run(keep(scratch(one({
    id: 'f-1', name: 'authorization', status: 'done',
    evidence: 'NOT ATTEMPTED — the docker daemon is not running, so RLS is unproven',
  }), bucket('A', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /is "done" and its own evidence says otherwise/);
  assert.match(r.out, /change the status, not the sentence/);
});

test('...anchored, because an unanchored version matched the word "not" in ordinary prose', () => {
  // The first draft flagged `231 Credits/day, not the 60 this row claimed` — a row whose evidence is
  // a correct citation containing ordinary English. Fifth over-broad negative match this session.
  // The positive control above is what makes this absence check mean anything.
  const r = run(keep(scratch(one({
    id: 'f-1', name: 'quota', status: 'done',
    // Cites the met gate rather than a path: an UNTRACKED path is not a citation, which the
    // fixture repo makes true of every path. The subject here is the prose, not the citation.
    evidence: 'G1 — the ladder grants 231 Credits/day, not the 60 this row claimed',
  }), bucket('A', 1, 1))));
  assert.equal(r.exit, 0, r.out);
  assert.doesNotMatch(r.out, /its own evidence says otherwise/);
});

/* ------------------------------- what a qualified status owes --- */

test('a blocked row owes a stated gap, and owes it INSTEAD of a citation it cannot have', () => {
  // The citation rule used to apply to every non-not-started row, which asked a BLOCKED row to cite
  // a passing test for work that by definition is not built. That is not a high standard, it is an
  // impossible one — and an impossible rule gets satisfied by writing prose SHAPED like a citation,
  // which is the exact failure this checker exists to catch, induced by the checker.
  const r = run(keep(scratch(one({
    id: 'f-1', name: 'open cloud upload', status: 'blocked',
    evidence: 'blocked on an Open Cloud credential that does not exist yet',
  }), bucket('A', 1))));
  assert.equal(r.exit, 0, r.out);
});

test('...but a qualified row that neither cites nor explains is still a finding', () => {
  const r = run(keep(scratch(one({
    id: 'f-1', name: 'half a thing', status: 'partial', evidence: 'we did some of this',
  }), `${bucket('A', 1, 0, 1)}`)));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /neither cites nor explains/);
});

test('a "done" row still owes a RUNNABLE citation — the rule was scoped, not relaxed', () => {
  // The guard against reading that scoping as a loosening. `done` is the status that claims the
  // work is finished, and it is the one the original rule was written for.
  const r = run(keep(scratch(one({
    id: 'f-1', name: 'billing', status: 'done', evidence: 'the billing webhook verifies signatures',
  }), bucket('A', 1, 1))));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /prose/);
});

/* --------------------------------------- the floor under the success token --- */

test('THE FLOOR. A backlog with nothing closed does not satisfy a floor of one', () => {
  // `BACKLOG HONEST` says only that nothing was found, and an emptied checker prints it faster and
  // just as green — the same shape as `node --test` reporting `fail 0` over a file with no tests
  // left. Without this, the gate naming this checker could not be made red by removing the path it
  // names, and a gate that cannot go red certifies nothing.
  const r = run(keep(scratch(CLEAN, bucket('A', 1))), '--floor-cited', '1');
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /only 0 closed row\(s\) redeemed a citation, below the floor of 1/);
  assert.match(r.out, /citations went missing rather than red/);
  assert.doesNotMatch(r.out, /BACKLOG HONEST/);
});

test('...and a redeemed citation clears it, so the floor measures verification, not rows', () => {
  // The control. A row that actually redeems its citation — against the MET gate in the fixture
  // ledger — counts, which is what makes the failure above mean "nothing was verified" rather than
  // "the flag always fails".
  const r = run(keep(scratch(
    [{ section: 'A', items: [{ id: 'f-1', name: 'one', status: 'done', evidence: 'G1 — the gate the ledger says is met' }] }],
    bucket('A', 1, 1),
  )), '--floor-cited', '1');
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /1 citations redeemed \(floor 1\)/);
});

test('a floor that is not a positive integer is a usage error, not a floor of zero', () => {
  const r = run(keep(scratch(CLEAN, bucket('A', 1))), '--floor-cited', 'lots');
  assert.equal(r.exit, 2, r.out);
  assert.match(r.out, /needs a positive integer/);
});

test('the scratch clones are removed', () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true });
  DIRS = [];
});
