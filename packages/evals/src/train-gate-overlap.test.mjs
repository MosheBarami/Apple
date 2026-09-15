// THE PROOF THAT THE KNOWLEDGE GATE IS HELD OUT FROM THE ROWS WE TRAIN ON.
//
// `qa-overlap.test.mjs` proves the gate does not overlap `headroom`, the other half of the same
// Hugging Face dataset. This file proves the thing that would actually corrupt this product's
// numbers: that no gate question restates an instruction in `packages/training/data/*.jsonl`, the
// SFT rows `build-dataset.mjs` builds out of licensed Luau and the local LoRA is trained on.
//
// It had never been measured. `packages/evals/data/robloxqa/dataset-card.json` said so in as many
// words — `"gateVsRepoTrainingRows": {"status": "NOT MEASURED ... This is not a clean result."}` —
// which is the right thing to write and is still a claim with no number behind it.
//
// EVERY NEGATIVE ASSERTION HERE HAS A POSITIVE TWIN. A file of "assert no overlap" tests passes
// just as green when the detector is pointed at the wrong field and fires on nothing forever. So
// §2 and §3 plant the collisions and require them to be caught, §4 is fail-closed behaviour, and
// §5's real-data check asserts a MARGIN rather than a zero.
//
// RED-FIRST RECORD. `fixtures/train-gate-overlap/train.jsonl` was first written WITH two planted
// collisions against `fixtures/qa-overlap/gate.jsonl`: row 4's instruction was a verbatim copy of
// the gate's IKControl question, and row 5's was a rewording of its EvaluateStateMachine question.
// §2's and §3's controls went red naming both, 4 failed of 16:
//
//     ✖ §2 THE CONTROL — the cleaned fixture shares no instruction with the gate verbatim
//       AssertionError: the cleaned fixture still collides with the gate: 1c1da81c582f0953
//     ✖ §3 THE CONTROL — the cleaned fixture shares no distinctive window with the gate
//       AssertionError: still shares a window: [{"aIndex":0,"bIndex":3,"shingle":"which property
//         of ikcontrol determines the endpoint that","bDocFrequency":1},{"aIndex":2,"bIndex":4,
//         "shingle":"what does setting humanoid evaluatestatemachine to false do","bDocFrequency":1}]
//
// The two positive tests went red as collateral in the same run — §3's rewording case asserts the
// exact key sees NOTHING, and the verbatim plant still on disk meant it saw something — which is
// itself the useful signal that the fixture, not the detector, was wrong. The planted rows are now
// reconstructed in memory (`PLANTED_*`) so the red state stays reproducible without leaving a
// corrupt fixture on disk.
//
// NO NETWORK, NO PROVIDER. Fixtures and local files only.
//
// Run: node --test packages/evals/src/train-gate-overlap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INSTRUCTION_SUFFIX, TRAINING_SPLITS, TRAINING_DIR, GATE_DIR,
  instructionOf, loadTrainingInstructions, loadGateQuestions, measureGateVsTraining,
} from './train-gate-overlap.mjs';
import { questionKey, findOverlap, findShingleOverlap, findNearDuplicates, NEAR_DUP_THRESHOLD } from './qa-overlap.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = join(HERE, '..', 'fixtures');
const FIX_TRAIN = join(FIX, 'train-gate-overlap');

const gateFixture = () => readFileSync(join(FIX, 'qa-overlap', 'gate.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l).question);

const fixtureInstructions = () => loadTrainingInstructions(FIX_TRAIN, { splits: ['train'] }).instructions;

/** The two rows deliberately planted to drive the first red run; see the header. */
const PLANTED_VERBATIM = 'Which property of IKControl determines the endpoint that the chain attempts to reach?';
const PLANTED_REWORDED = 'What does setting Humanoid.EvaluateStateMachine to false do to an NPC character?';

// ==============================================================================================
// §1 — reading a training row, and the tail that has to come off before anything is compared
// ==============================================================================================

test('§1 the instruction is the user turn with the shared tail removed', () => {
  const row = { messages: [{ role: 'user', content: `Returns the elapsed time.${INSTRUCTION_SUFFIX}` }] };
  assert.equal(instructionOf(row), 'Returns the elapsed time.');
});

test('§1 A ROW WITHOUT THE TAIL THROWS rather than being compared with the tail still on it', () => {
  // The silent-no-op this exists to prevent: `.replace()` on a literal that has drifted strips
  // nothing, every instruction then ends in the same eight words, and idf reweights around the
  // boilerplate. Nothing crashes and every score moves.
  assert.throws(
    () => instructionOf({ messages: [{ role: 'user', content: 'Returns the elapsed time.' }] }, 'row 1'),
    /does not end with/,
  );
  assert.throws(() => instructionOf({ messages: [{ role: 'system', content: 'x' }] }), /no user message/);
  assert.throws(() => instructionOf({}), /no user message/);
});

test('§1 AN INSTRUCTION THAT IS ACTUALLY LUAU THROWS — the check the margin could not make', () => {
  // FALSIFICATION RECORD. Rewiring `instructionOf` to return the ASSISTANT turn left every count at
  // zero and RAISED maxScore from 0.1985 to 0.2173, so no bound on the margin distinguishes the two.
  // This does, because a doc comment produced by cleanComment() is one line of prose with no fence,
  // and the assistant turn is a fenced Luau block. Measured over the real 404 rows: 0 newlines,
  // 0 fences.
  const asCode = { messages: [{ role: 'user', content: '```luau\nlocal x = 1\n```' + INSTRUCTION_SUFFIX }] };
  assert.throws(() => instructionOf(asCode, 'row 9'), /not a doc comment|almost certainly the assistant turn/);
  assert.throws(
    () => instructionOf({ messages: [{ role: 'user', content: `two\nlines${INSTRUCTION_SUFFIX}` }] }),
    /newline or a code fence/,
  );
});

test('§1 THE TAIL IS THE ONE build-dataset.mjs ACTUALLY WRITES — pinned against its source', () => {
  // Without this the constant above is a guess that happens to be right today. build-dataset.mjs
  // is the only writer of these files; if its template changes, this reddens here rather than
  // silently at §5.
  const src = readFileSync(join(HERE, '..', '..', 'training', 'src', 'build-dataset.mjs'), 'utf8');
  assert.match(src, /content: `\$\{ex\.doc\}\\n\\nWrite the Luau implementation\.`/);
  assert.equal(INSTRUCTION_SUFFIX, '\n\nWrite the Luau implementation.');
});

test('§1 every training split is compared, not just train.jsonl', () => {
  // test.jsonl is the SFT set's held-out split, which is a different held-out than this gate.
  // Leaving it out would compare the gate against 81% of the rows and report the same words.
  assert.deepEqual(TRAINING_SPLITS, ['train', 'val', 'test']);
});

// ==============================================================================================
// §2 — the exact detector, and the verbatim row planted to make it fire
// ==============================================================================================

test('§2 A TRAINING INSTRUCTION THAT COPIES A GATE QUESTION IS CAUGHT — the case this exists for', () => {
  const gate = gateFixture();
  const contaminated = [...fixtureInstructions(), PLANTED_VERBATIM];
  const r = findOverlap(gate.map(questionKey), contaminated.map(questionKey));
  assert.equal(r.shared.length, 1, 'a verbatim copy of a gate question in the training set must be reported');
  assert.equal(r.shared[0], questionKey(PLANTED_VERBATIM));
});

test('§2 THE CONTROL — the cleaned fixture shares no instruction with the gate verbatim', () => {
  const r = findOverlap(gateFixture().map(questionKey), fixtureInstructions().map(questionKey));
  assert.deepEqual(r.shared, [], `the cleaned fixture still collides with the gate: ${r.shared.join(', ')}`);
});

// ==============================================================================================
// §3 — the window detector, for the rewording the exact key cannot see
// ==============================================================================================

test('§3 A REWORDED GATE QUESTION IN THE TRAINING SET IS CAUGHT BY THE WINDOW, NOT THE KEY', () => {
  const gate = gateFixture();
  const contaminated = [...fixtureInstructions(), PLANTED_REWORDED];

  assert.deepEqual(
    findOverlap(gate.map(questionKey), contaminated.map(questionKey)).shared, [],
    'a rewording is invisible to the exact key — which is why the window detector is also run',
  );
  const near = findShingleOverlap(gate, contaminated);
  assert.equal(near.total, 1, 'the reworded duplicate must be reported');
  assert.match(near.hits[0].shingle, /humanoid evaluatestatemachine/);
});

test('§3 THE CONTROL — the cleaned fixture shares no distinctive window with the gate', () => {
  const near = findShingleOverlap(gateFixture(), fixtureInstructions());
  assert.equal(near.total, 0, `still shares a window: ${JSON.stringify(near.hits)}`);
});

test('§3 the window detector is the RIGHT instrument on this side, unlike gate-vs-headroom', () => {
  // qa-overlap.mjs retired the 8-word window for gate-vs-headroom because both sides are
  // generator-templated prose and the window lands inside the template. Here the other side is
  // hand-written doc comments with no house style, so a shared window is evidence again. Stated as
  // a test so the reasoning is checkable: the fixture's doc comments produce no stem at all.
  const near = findShingleOverlap(gateFixture(), fixtureInstructions());
  assert.equal(near.stemsIgnored, 0, 'doc comments should contribute no stock stem');
  assert.equal(near.rawTotal, 0, 'and no raw hit either, so the stem filter is not doing the work');
});

// ==============================================================================================
// §4 — fail-closed. A comparison that could not happen must not report "clean".
// ==============================================================================================

test('§4 A MISSING TRAINING SPLIT THROWS and names the files, rather than measuring what is there', () => {
  assert.throws(
    () => loadTrainingInstructions(FIX_TRAIN),                       // fixture has only train.jsonl
    /val\.jsonl, test\.jsonl absent/,
  );
  assert.throws(() => loadTrainingInstructions(join(FIX, 'no-such-dir')), /train\.jsonl.*absent/s);
});

test('§4 A MISSING GATE THROWS rather than being read as an empty gate', () => {
  assert.throws(() => loadGateQuestions(join(FIX, 'no-such-dir')), /is absent/);
});

test('§4 AN EMPTY SIDE THROWS — every detector, not just the first one', () => {
  assert.throws(() => measureGateVsTraining(['a b c'], []), /EMPTY side/);
  assert.throws(() => measureGateVsTraining([], ['a b c']), /EMPTY side/);
});

// ==============================================================================================
// §5 — the real gate against the real training rows
// ==============================================================================================

/** Say which check did NOT run, and why, in the test's own output. A skip must not read as a pass. */
function announceAbsent(what, why) {
  console.log(
    `  !  ${what} — ${why} Run \`node packages/training/src/build-dataset.mjs\` ` +
    '(it needs the pinned checkouts under packages/corpus/raw). This is NOT a clean result.',
  );
}

const realDataPresent = () =>
  existsSync(join(GATE_DIR, 'gate.jsonl')) && TRAINING_SPLITS.every((s) => existsSync(join(TRAINING_DIR, `${s}.jsonl`)));

test('§5 THE REAL GATE RESTATES NO REAL TRAINING INSTRUCTION — and the margin proves the detector ran', () => {
  if (!realDataPresent()) { announceAbsent('the real gate-vs-training measurement could NOT run', 'the derived splits are absent.'); return; }

  const m = measureGateVsTraining(loadGateQuestions(), loadTrainingInstructions().instructions);

  assert.equal(m.exactShared, 0, 'a gate question appears verbatim among the training instructions');
  assert.equal(m.shingle.flaggedRows, 0, 'a gate question shares a distinctive 8-word window with a training instruction');
  assert.equal(m.nearDuplicate.flaggedRows, 0, 'a gate question restates a training instruction');

  // THE LINE THAT MAKES THE THREE ZEROES ABOVE MEAN SOMETHING. A detector reading the wrong field
  // reports maxScore 0; a real comparison over 3,000 x 404 rows lands well above zero and well
  // below the cut. Both bounds are asserted.
  assert.ok(m.nearDuplicate.maxScore > 0.05, `maxScore ${m.nearDuplicate.maxScore} is too low to be a real comparison — is the detector reading anything?`);
  assert.ok(m.nearDuplicate.margin > 0, `no margin left: max ${m.nearDuplicate.maxScore} vs threshold ${m.nearDuplicate.threshold}`);
  assert.equal(m.clean, true);
});

test('§5 the committed evidence file IS what the detector finds today — recomputed, not trusted', () => {
  const p = join(GATE_DIR, 'train-overlap.json');
  if (!existsSync(p)) { announceAbsent('the committed evidence file is absent', 'nothing has written it.'); return; }
  const rec = JSON.parse(readFileSync(p, 'utf8'));

  // Readable without the derived rows: these are the numbers a reviewer sees on a fresh checkout.
  assert.equal(rec.exactShared, 0);
  assert.equal(rec.shingle.flaggedRows, 0);
  assert.equal(rec.nearDuplicate.flaggedRows, 0);
  assert.ok(rec.nearDuplicate.maxScore > 0.05, 'the recorded measurement has no margin evidence in it');
  assert.equal(rec.instructionSuffixStripped, INSTRUCTION_SUFFIX);

  if (!realDataPresent()) { announceAbsent('the evidence file could NOT be re-derived', 'the derived splits are absent.'); return; }
  const m = measureGateVsTraining(loadGateQuestions(), loadTrainingInstructions().instructions);
  assert.equal(m.gateRows, rec.gateRows, 'the evidence file was written against a different gate');
  assert.equal(m.trainingRows, rec.trainingRows, 'the evidence file was written against a different training set');
  assert.equal(m.nearDuplicate.maxScore, rec.nearDuplicate.maxScore, 'the recorded margin is not the one the rows produce');
});

test('§5 THE GATE CARRIES NO LUAU, so the only channel into the training set is the prose side', () => {
  // Why this file compares instructions and not code: there is no code in the gate to compare.
  // Measured in the harvester and pinned here so the scope of the measurement is justified rather
  // than assumed.
  const cardPath = join(GATE_DIR, 'dataset-card.json');
  if (!existsSync(cardPath)) { announceAbsent('the gate dataset card is absent', 'the harvester has not run.'); return; }
  const card = JSON.parse(readFileSync(cardPath, 'utf8'));
  assert.equal(card.codeContent.withFencedCode, 0);
  assert.equal(card.codeContent.withNewlineInsideAField, 0);
});

test('§5 the threshold used here is the one qa-overlap calibrated, not a second opinion', () => {
  const m = measureGateVsTraining(gateFixture(), fixtureInstructions());
  assert.equal(m.nearDuplicate.threshold, NEAR_DUP_THRESHOLD);
  assert.ok(findNearDuplicates(gateFixture(), fixtureInstructions(), { threshold: 0 }).flagged.length > 0,
    'the near-duplicate detector returns a best score for every gate row, which is where the margin comes from');
});
