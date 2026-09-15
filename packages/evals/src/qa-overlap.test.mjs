// THE PROOF THAT THE ROBLOXQA GATE IS ACTUALLY HELD OUT.
//
// WHAT THIS FILE IS FOR. `packages/evals/data/robloxqa/gate.jsonl` is proposed as a pre-release
// knowledge regression gate, and `headroom.jsonl` as untouched material for future tuning. That
// arrangement is worth exactly as much as the guarantee that no question appears in both. The
// dataset's own card asserts the guarantee. This file measures it.
//
// WHY THE ASSERTION IS NOT ENOUGH. Train/eval overlap is the single most common way an evaluation
// reports a number that means nothing, and it has no symptom: the score simply comes out higher,
// which is indistinguishable from the model having improved. The instrument and the thing it
// measures become the same object and nobody sees it happen.
//
// §1-§4 test the MECHANISM against fixtures, including the case it exists to catch. A detector
// that never fires would pass a file full of "assert no overlap" tests while proving nothing, so
// every negative assertion here has a positive twin that forces the detector to fire.
//
// §5 runs the mechanism over the REAL harvested splits. It reads the COMMITTED key index
// (`question-keys.json`), so it still measures something when the derived .jsonl files are absent
// — and when they ARE present it recomputes the keys from the rows and requires them to match, so
// a hand-edited index is caught rather than believed. There is no path through §5 that reports
// "clean" because it could not see.
//
// RED-FIRST RECORD. `fixtures/qa-overlap/headroom.jsonl` was first written WITH two planted
// collisions — an exact copy of the gate's IKControl question, and a reworded copy of its
// EvaluateStateMachine question. §2 and §3 went red naming both:
//
//     ✖ §2 THE CONTROL ... cleaned fixtures still collide: 7e0ef70d878c4072
//     ✖ §3 THE CONTROL ... [{"shingle":"in the roblox engine which property of ikcontrol", ...}]
//
// The red run found a THIRD thing nobody planted. §3's control also reported
// `"in the roblox engine what is the primary"` between two questions with nothing in common: the
// fixture had been written in RobloxQA's own house style, where most questions open with the same
// stock stem. At six rows that stem's document frequency is 2, under `DF_MAX`, so the filter that
// handles it on real data cannot help. The fixture questions were therefore rephrased to open
// differently — which is the honest fix, since the stem case has its own test below, sized so the
// threshold actually applies. The planted rows are reconstructed in-memory (`PLANTED_*`) so the
// red state is reproducible without corrupting the fixture again.
//
// NO NETWORK. Fixtures and committed files only.
//
// Run: node --test packages/evals/src/qa-overlap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normaliseQuestion, questionKey, shingles, findOverlap, findShingleOverlap, findNearDuplicates,
  loadQuestions, loadKeyIndex, SHINGLE_N, DF_MAX, NEAR_DUP_THRESHOLD,
} from './qa-overlap.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = join(HERE, '..', 'fixtures', 'qa-overlap');
const DATA = join(HERE, '..', 'data', 'robloxqa');

const fixture = (name) => loadQuestions(join(FIX, name));
const qs = (rows) => rows.map((r) => r.question);

const gatePath = join(DATA, 'gate.jsonl');
const headPath = join(DATA, 'headroom.jsonl');
const rowsPresent = () => existsSync(gatePath) && existsSync(headPath);

/**
 * Say which check did NOT run, and why, in the test's own output.
 *
 * The derived .jsonl rows are gitignored, so on a fresh checkout some of §5 cannot execute. That
 * is a failure to observe, and the one thing it must never look like is a clean result — so it is
 * printed by name rather than skipped silently. The checks that read the COMMITTED index still run
 * in that state, so §5 is never entirely blind.
 */
function announceRowsAbsent(what) {
  console.log(
    `  !  gate.jsonl/headroom.jsonl absent (derived, gitignored) — ${what} this run. ` +
    'Run `node scripts/harvest-hf.mjs` to enable it. This is NOT a clean result.',
  );
}

/** The two rows deliberately planted to drive the first red run; see the header. */
const PLANTED_EXACT =
  'Which property of IKControl determines the endpoint that the chain attempts to reach?';
const PLANTED_REWORDED =
  'In Roblox, what does setting Humanoid.EvaluateStateMachine to false do to an NPC?';

// ==============================================================================================
// §1 — the normaliser and the key
// ==============================================================================================

test('§1 normalisation collapses case and punctuation, which is what makes two spellings one question', () => {
  assert.equal(normaliseQuestion('In Luau, what does `table.freeze` return?'), 'in luau what does table freeze return');
  assert.equal(
    normaliseQuestion('IN LUAU  what  does table.freeze RETURN???'),
    normaliseQuestion('In Luau, what does `table.freeze` return?'),
  );
});

test('§1 the key is stable across those spellings and different for a different question', () => {
  assert.equal(questionKey('What is Humanoid.Health?'), questionKey('what is  humanoid health'));
  assert.notEqual(questionKey('What is Humanoid.Health?'), questionKey('What is Humanoid.MaxHealth?'));
  assert.match(questionKey('anything'), /^[0-9a-f]{16}$/);
});

test('§1 the shingle window is the same 8 words build-dataset.mjs uses against the eval tasks', () => {
  // Stated so the two contamination thresholds in this repository cannot drift apart silently.
  assert.equal(SHINGLE_N, 8);
  assert.deepEqual([...shingles('a b c d', 2)], ['a b', 'b c', 'c d']);
  assert.deepEqual([...shingles('a b c', 8)], [], 'text shorter than the window yields nothing');
});

// ==============================================================================================
// §2 — the exact detector. The planted verbatim duplicate is the case it exists for.
// ==============================================================================================

test('§2 THE PLANTED VERBATIM DUPLICATE IS CAUGHT — the case this detector exists for', () => {
  const gate = qs(fixture('gate.jsonl'));
  const contaminated = [...qs(fixture('headroom.jsonl')), PLANTED_EXACT];
  const r = findOverlap(gate.map(questionKey), contaminated.map(questionKey));
  assert.equal(r.shared.length, 1, 'an exact copy of a gate question must be reported');
  assert.equal(r.shared[0], questionKey(PLANTED_EXACT));
});

test('§2 it is caught through punctuation and case changes too, not just byte equality', () => {
  const disguised = PLANTED_EXACT.toUpperCase().replace(/,/g, '') + '!!';
  const r = findOverlap([questionKey(PLANTED_EXACT)], [questionKey(disguised)]);
  assert.equal(r.shared.length, 1);
});

test('§2 THE CONTROL — the cleaned fixtures have no exact overlap', () => {
  // Without this, a detector that returned "overlap" for everything would pass the test above.
  const r = findOverlap(qs(fixture('gate.jsonl')).map(questionKey), qs(fixture('headroom.jsonl')).map(questionKey));
  assert.deepEqual(r.shared, [], `cleaned fixtures still collide: ${r.shared.join(', ')}`);
  assert.equal(r.aCount, 4);
  assert.equal(r.bCount, 5);
});

// ==============================================================================================
// §3 — the shingle detector, which exists because §2 is too easy to evade
// ==============================================================================================

test('§3 THE PLANTED REWORDING IS CAUGHT BY SHINGLES AND MISSED BY THE EXACT KEY', () => {
  // This pair is the whole argument for having two detectors. One word changed at each end and the
  // sha256 is completely different; the middle of the sentence is untouched.
  const gate = qs(fixture('gate.jsonl'));
  const contaminated = [...qs(fixture('headroom.jsonl')), PLANTED_REWORDED];

  const exact = findOverlap(gate.map(questionKey), contaminated.map(questionKey));
  assert.deepEqual(exact.shared, [], 'a rewording is invisible to the exact key — that is why §3 exists');

  const near = findShingleOverlap(gate, contaminated);
  assert.equal(near.total, 1, 'the reworded duplicate must be reported');
  assert.match(near.hits[0].shingle, /humanoid evaluatestatemachine/);
});

test('§3 THE CONTROL — the cleaned fixtures have no distinctive shingle overlap', () => {
  const near = findShingleOverlap(qs(fixture('gate.jsonl')), qs(fixture('headroom.jsonl')));
  assert.equal(near.total, 0, `cleaned fixtures still share a distinctive window: ${JSON.stringify(near.hits)}`);
});

test('§3 A STOCK QUESTION STEM IS NOT A DUPLICATE — the false positive that set DF_MAX', () => {
  // Discovered on real data: "in the roblox engine what is the primary" matched questions with
  // nothing in common, because RobloxQA's generator opens thousands of questions that way. A
  // window that appears in more than DF_MAX of the other side's own questions is template, not
  // fingerprint. Both counts are reported so the weakening stays visible.
  const stem = 'In the Roblox engine, what is the primary purpose of';
  const b = Array.from({ length: DF_MAX + 2 }, (_, i) => `${stem} Service${i} being cached at startup?`);
  const a = [`${stem} the Workspace.StreamingEnabled property?`];

  const filtered = findShingleOverlap(a, b);
  assert.equal(filtered.total, 0, 'a shared stem must not be reported as an overlap');
  assert.equal(filtered.rawTotal, 1, 'but the raw hit is still counted and reported, not hidden');
  assert.ok(filtered.stemsIgnored > 0, 'and the offending stem is named');
});

test('§3 the stem filter does NOT swallow a real duplicate that happens to share a stem', () => {
  // The falsification of the fix above: if DF_MAX suppressed genuine collisions it would be worse
  // than the false positive it removed.
  const stem = 'In the Roblox engine, what is the primary purpose of';
  const real = `${stem} the Workspace.StreamingEnabled property when memory is constrained?`;
  const b = [...Array.from({ length: DF_MAX + 2 }, (_, i) => `${stem} Service${i} being cached at startup?`), real];
  const near = findShingleOverlap([real], b);
  assert.equal(near.total, 1, 'a genuine duplicate must survive the stem filter');
});

// ==============================================================================================
// §3b — the near-duplicate detector, which replaced §3 for the real corpus
// ==============================================================================================

test('§3b THE PLANTED REWORDING RANKS FIRST BY A WIDE MARGIN — the property that travels', () => {
  // Deliberately NOT asserted against NEAR_DUP_THRESHOLD. idf is computed from the corpus being
  // compared, so in a ten-question fixture "what" and "does" are still rare enough to carry
  // weight and every score is depressed: this pair scores 0.484 here and 0.655 against the real
  // 7,614-question corpus. Discovered by this very test going red at 0 !== 1. The separation is
  // what generalises, so the separation is what is pinned; the absolute cut is exercised in the
  // padded test below.
  const gate = qs(fixture('gate.jsonl'));
  const contaminated = [...qs(fixture('headroom.jsonl')), PLANTED_REWORDED];
  const r = findNearDuplicates(gate, contaminated, { threshold: 0 });
  assert.equal(contaminated[r.flagged[0].bIndex], PLANTED_REWORDED, 'the planted rewording must rank first');
  assert.ok(
    r.flagged[0].score > 5 * r.flagged[1].score,
    `separation collapsed: top ${r.flagged[0].score} vs runner-up ${r.flagged[1].score}`,
  );
});

test('§3b AT CORPUS SCALE THE ABSOLUTE THRESHOLD APPLIES — the padded case', () => {
  // Same planted pair, but with enough house-style filler that the stock words are actually
  // common and lose their weight. This is the regime NEAR_DUP_THRESHOLD is calibrated for.
  // The filler must dilute the words the two questions DIFFER on — in, roblox, a, an, character,
  // npc — while leaving the words they SHARE rare. Filler that also repeated "setting/false/do"
  // pushed the score down instead of up, which is the mechanism working: a shared word that
  // everything contains is not evidence of anything.
  const filler = Array.from({ length: 60 }, (_, i) =>
    `In Roblox, how does an NPC character react to a nearby Widget${i} object?`,
  );
  const gate = qs(fixture('gate.jsonl'));
  const r = findNearDuplicates(gate, [...qs(fixture('headroom.jsonl')), ...filler, PLANTED_REWORDED]);
  assert.equal(r.flagged.length, 1, `expected exactly the planted row, got ${JSON.stringify(r.flagged)}`);
  assert.ok(r.flagged[0].score >= NEAR_DUP_THRESHOLD);
});

test('§3b THE CONTROL — the cleaned fixtures flag nothing', () => {
  const r = findNearDuplicates(qs(fixture('gate.jsonl')), qs(fixture('headroom.jsonl')));
  assert.deepEqual(r.flagged, [], `cleaned fixtures flagged: ${JSON.stringify(r.flagged)}`);
});

test('§3b A SHARED STEM SCORES NEAR ZERO — the failure mode that retired the shingle detector', () => {
  // The same pair that defeats an 8-word window: identical framing, different subject. idf gives
  // the stem almost no weight because both splits are full of it.
  const a = ['In the Roblox engine, what is the primary purpose of the Workspace.StreamingEnabled property?'];
  const b = [
    'In the Roblox engine, what is the primary purpose of the SoundService.AmbientReverb property?',
    'In the Roblox engine, what is the primary purpose of the Lighting.ClockTime property?',
    'In the Roblox engine, what is the primary purpose of the Players.CharacterAutoLoads property?',
  ];
  assert.ok(findShingleOverlap(a, b).rawTotal > 0, 'the window detector does fire on the stem — that is the problem');
  assert.deepEqual(findNearDuplicates(a, b).flagged, [], 'weighted Jaccard must not');
});

// ==============================================================================================
// §4 — fail-closed. A comparison that could not happen must not report "clean".
// ==============================================================================================

test('§4 AN EMPTY SIDE THROWS rather than reporting every question held out', () => {
  // The shape this repository keeps finding. build-dataset.mjs's `contaminated()` returns false
  // for everything when handed an empty eval set and relies on its caller to print the
  // denominator; this refuses instead, because the caller might not.
  assert.throws(() => findOverlap(['a'], []), /EMPTY side/);
  assert.throws(() => findOverlap([], ['a']), /EMPTY side/);
  assert.throws(() => findShingleOverlap(['a b c d e f g h'], []), /EMPTY side/);
  assert.throws(() => findNearDuplicates(['a b c'], []), /EMPTY side/);
});

test('§4 A MISSING SPLIT FILE THROWS rather than being read as an empty split', () => {
  assert.throws(() => loadQuestions(join(FIX, 'no-such-file.jsonl')), /is absent/);
  assert.throws(() => loadKeyIndex(join(FIX, 'no-such-index.json')), /is absent/);
});

// ==============================================================================================
// §5 — the real harvested splits
// ==============================================================================================

test('§5 THE REAL GATE AND HEADROOM SPLITS SHARE NO QUESTION VERBATIM', () => {
  const idx = loadKeyIndex(join(DATA, 'question-keys.json'));
  const gate = idx.splits.gate.keys;
  const headroom = idx.splits.headroom.keys;

  assert.equal(gate.length, 3000, 'the gate split is the 3,000-row RobloxQA test split');
  assert.equal(headroom.length, 4614, 'headroom is the 4,614-row RobloxQA train split');

  const r = findOverlap(gate, headroom);
  assert.deepEqual(r.shared, [], `${r.shared.length} question(s) appear in BOTH splits: ${r.shared.slice(0, 5).join(', ')}`);

  // Duplicates WITHIN a split would not corrupt the held-out property but would silently reweight
  // the score, so they are pinned here too.
  assert.equal(r.aUnique, gate.length, 'the gate split contains a duplicated question');
  assert.equal(r.bUnique, headroom.length, 'the headroom split contains a duplicated question');
});

test('§5 the committed key index IS the harvested rows — recomputed, not trusted', () => {
  // Without this, §5 above proves only that a JSON file is internally consistent. Whoever edits
  // the index can make the overlap vanish. When the derived rows are present the keys are rebuilt
  // from them and must match exactly.
  if (!rowsPresent()) { announceRowsAbsent('the key index could NOT be re-derived'); return; }
  const idx = loadKeyIndex(join(DATA, 'question-keys.json'));
  for (const [name, path] of [['gate', gatePath], ['headroom', headPath]]) {
    const rebuilt = loadQuestions(path).map((r) => questionKey(r.question));
    assert.deepEqual(rebuilt, idx.splits[name].keys, `${name}: the committed key index does not match the rows on disk`);
  }
});

test('§5 BUT THEY DO SHARE RESTATEMENTS — and the exclusion list accounts for every one', () => {
  // The finding that makes the exclusion list necessary. The dataset card says dedup ran before
  // the split; it ran on strings. 60 of 3,000 gate questions restate a headroom question, four of
  // them above 0.9. Asserted as an EQUALITY against the recomputed set rather than as a count, so
  // a row that starts restating tomorrow is a red test and not a silently-larger number.
  const excluded = JSON.parse(readFileSync(join(DATA, 'excluded-gate-rows.json'), 'utf8'));
  assert.ok(excluded.rows.length > 0, 'an empty exclusion list means either a clean dataset or a detector that never ran');

  if (!rowsPresent()) {
    const card = JSON.parse(readFileSync(join(DATA, 'dataset-card.json'), 'utf8'));
    assert.equal(
      card.overlap.gateVsHeadroom.nearDuplicate.flaggedRows, excluded.rows.length,
      'the card and the exclusion list disagree about how many gate rows restate headroom',
    );
    announceRowsAbsent('the near-duplicate set could NOT be recomputed');
    return;
  }
  const r = findNearDuplicates(qs(loadQuestions(gatePath)), qs(loadQuestions(headPath)));
  assert.deepEqual(
    r.flagged.map((h) => h.aIndex).sort((a, b) => a - b),
    excluded.rows.map((h) => h.gateRowIdx).sort((a, b) => a - b),
    'the committed exclusion list is not the set the detector finds today',
  );
});

test('§5 THE SCORED GATE — what survives exclusion restates nothing in headroom', () => {
  // This is the invariant the whole arrangement rests on, and it is the one that cannot rot:
  // whatever the upstream dedup did, the rows the scorer actually uses are held out.
  if (!rowsPresent()) { announceRowsAbsent('the post-exclusion gate could NOT be rebuilt'); return; }
  const excluded = new Set(
    JSON.parse(readFileSync(join(DATA, 'excluded-gate-rows.json'), 'utf8')).rows.map((r) => r.gateRowIdx),
  );
  const gate = qs(loadQuestions(gatePath)).filter((_, i) => !excluded.has(i));
  const headroom = qs(loadQuestions(headPath));
  assert.equal(gate.length, 3000 - excluded.size);

  assert.deepEqual(findOverlap(gate.map(questionKey), headroom.map(questionKey)).shared, []);
  const near = findNearDuplicates(gate, headroom);
  assert.deepEqual(near.flagged, [], `the scored gate still restates headroom: ${JSON.stringify(near.flagged.slice(0, 3))}`);
});

test('§5 the 8-word window finding is on the record, and marked as not used', () => {
  // The measurement that retired the inherited detector. If this stops being recorded, the next
  // person re-derives the same 209 false positives and has to rediscover why they are false.
  const card = JSON.parse(readFileSync(join(DATA, 'dataset-card.json'), 'utf8'));
  const sh = card.overlap.gateVsHeadroom.shingle;
  assert.ok(sh.flaggedRows > 0, 'the shingle detector fired on this corpus; that fact is the finding');
  assert.match(sh.verdict, /NOT USED/);
  if (rowsPresent()) {
    const recomputed = findShingleOverlap(qs(loadQuestions(gatePath)), qs(loadQuestions(headPath)));
    assert.equal(recomputed.total, sh.flaggedRows, 'the recorded shingle count is not what the rows produce');
  }
});

test('§5 the gate contains no Luau to leak into a model that is later graded on writing Luau', () => {
  // The card offers this dataset as training data. The reason it must not be used that way is a
  // measurement, not a preference: there is no code in it.
  const card = JSON.parse(readFileSync(join(DATA, 'dataset-card.json'), 'utf8'));
  assert.equal(card.codeContent.withFencedCode, 0);
  assert.equal(card.codeContent.withNewlineInsideAField, 0);
  assert.equal(card.licence, 'MIT');
  assert.equal(card.revision.length, 40, 'the harvested revision must be pinned to a commit sha');
});
