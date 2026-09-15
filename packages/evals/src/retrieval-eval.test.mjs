// A retrieval score measured against an index nobody filled is not a low score. It is not a score.
//
// WHAT THIS GUARDS. Recall@k, MRR and precision@1 are all computable against an empty index, and
// two of the three look ordinary when it is empty:
//
//   - every NEGATIVE query passes, because an empty index returns nothing for everything;
//   - recall comes back 0.0, which reads as a retriever to tune rather than a table to fill.
//
// Both numbers are then copied into a report and compared with last week's. So the run is refused
// instead of scored, and these tests feed the scorer an actual empty-index run and watch it refuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRetrievalScore, runRetrievalEval, scoreRetrieval, validateGoldSet } from './retrieval-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const ok = (certain = true) => ({ kind: 'hits', certain });
const missOutcome = (certain = true) => ({ kind: 'miss', certain });
const hit = (url) => ({ url });

const pos = (id, urls, expect, outcome = ok()) => ({ id, expectUrls: expect, hits: urls.map(hit), outcome });
const neg = (id, urls, outcome) => ({ id, negative: true, expectUrls: [], hits: urls.map(hit), outcome });

/* ============================= the arithmetic =============================================== */

test('a retriever that puts the right page first scores perfectly', () => {
  const s = scoreRetrieval([pos('a', ['https://x/1'], ['https://x/1']), pos('b', ['https://x/2'], ['https://x/2'])], { k: 5 });
  assert.equal(s.known, true);
  assert.deepEqual([s.positives.recallAtK, s.positives.mrr, s.positives.precisionAt1], [1, 1, 1]);
});

test('rank is what MRR measures, and it is not recall', () => {
  // The right page is third: found (recall 1) but not first (P@1 0), and MRR says how far down.
  const s = scoreRetrieval([pos('a', ['https://x/9', 'https://x/8', 'https://x/1'], ['https://x/1'])], { k: 5 });
  assert.equal(s.positives.recallAtK, 1);
  assert.equal(s.positives.precisionAt1, 0);
  assert.equal(s.positives.mrr, round3(1 / 3));
  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }
});

test('k truncates: a page below the cut was not retrieved', () => {
  const results = [pos('a', ['https://x/9', 'https://x/8', 'https://x/1'], ['https://x/1'])];
  const at5 = scoreRetrieval(results, { k: 5 });
  const at2 = scoreRetrieval(results, { k: 2 });
  assert.equal(at5.positives.recallAtK, 1);
  assert.equal(at2.positives.recallAtK, 0, 'a hit at rank 3 must not count as recall@2');
  // The RELATIONSHIP is the claim: recall can only fall as k shrinks.
  assert.ok(at2.positives.recallAtK <= at5.positives.recallAtK);
});

test('a page that never came back is a miss, and the miss is named', () => {
  const s = scoreRetrieval([pos('a', ['https://x/9'], ['https://x/1'])], { k: 5 });
  assert.equal(s.positives.recallAtK, 0);
  assert.deepEqual(s.positives.misses, ['a'], 'a score with no per-query detail cannot be acted on');
});

/* ============================= the refusal ================================================== */

test('A RUN AGAINST AN EMPTY INDEX IS NOT SCORED', () => {
  // THE DEFECT THIS FILE EXISTS FOR. Every query returns nothing because there is nothing to
  // return. Left to the arithmetic: recall 0.0 and every negative "correct" — a table that looks
  // like a bad retriever and a healthy negative set.
  const emptyIndex = { kind: 'empty-index', certain: true };
  const s = scoreRetrieval(
    [pos('a', [], ['https://x/1'], emptyIndex), pos('b', [], ['https://x/2'], emptyIndex), neg('n1', [], emptyIndex)],
    { k: 5 },
  );
  assert.equal(s.known, false, 'an empty index produced a score');
  assert.equal(s.positives, null, 'no recall number may be published from a run that never searched');
  assert.equal(s.negatives, null, 'and the negatives must not be credited for an index that answers nothing');
  assert.match(s.why, /empty-index/);
  assert.match(formatRetrievalScore(s), /NOT MEASURED/);

  // THE CONTROL, and it is the assertion that matters: the same hits and the same misses, over an
  // index that is genuinely populated, ARE a measurement — recall 0 and negatives held.
  const real = scoreRetrieval(
    [pos('a', [], ['https://x/1'], missOutcome()), pos('b', [], ['https://x/2'], missOutcome()), neg('n1', [], missOutcome())],
    { k: 5 },
  );
  assert.equal(real.known, true);
  assert.equal(real.positives.recallAtK, 0);
  assert.equal(real.negatives.correct, 1);
  assert.notEqual(s.known, real.known, 'the two runs returned identical hits and must not score identically');
});

test('an index with rows and no vectors is refused too', () => {
  const s = scoreRetrieval([pos('a', [], ['https://x/1'], { kind: 'unembedded-index', certain: true })], { k: 5 });
  assert.equal(s.known, false);
  assert.match(s.why, /unembedded-index/);
});

test('a backend outage is refused, not averaged in', () => {
  const s = scoreRetrieval(
    [pos('a', ['https://x/1'], ['https://x/1']), pos('b', [], ['https://x/2'], { kind: 'unavailable', certain: true })],
    { k: 5 },
  );
  assert.equal(s.known, false, 'one unreachable query must not be diluted by the ones that worked');
  assert.deepEqual(s.faults, [{ id: 'b', kind: 'unavailable' }]);
});

test('a negative the retriever could not PROVE is not credited', () => {
  // Nothing came back and the retriever could not confirm it searched anything. That empty result
  // is byte-identical to a correct refusal, and crediting it is how an outage becomes a green bar.
  const s = scoreRetrieval([neg('n1', [], missOutcome(false)), neg('n2', [], missOutcome(true))], { k: 5 });
  assert.equal(s.known, true, 'an uncertain miss is not a fault — the retriever did answer');
  assert.equal(s.negatives.correct, 1);
  assert.equal(s.negatives.unproven, 1);
  assert.deepEqual(s.negatives.unprovenIds, ['n1']);
  assert.equal(s.negatives.known, false, 'a negative score with an unproven member is not a score');
  assert.match(formatRetrievalScore(s), /negatives NOT MEASURED/);
});

test('a negative that DID return something is simply wrong', () => {
  const s = scoreRetrieval([neg('n1', ['https://x/1'], ok())], { k: 5 });
  assert.equal(s.negatives.wrong, 1);
  assert.equal(s.negatives.known, true, 'a wrong answer is a measurement; an unproven one is not');
});

test('a result with no outcome at all is not a measurement', () => {
  const s = scoreRetrieval([{ id: 'a', expectUrls: ['https://x/1'], hits: [] }], { k: 5 });
  assert.equal(s.known, false);
  assert.match(s.why, /no retrieval outcome/i);
});

test('an empty gold set does not score 1.0, or 0.0, or anything', () => {
  const s = scoreRetrieval([], { k: 5 });
  assert.equal(s.known, false);
  assert.equal(s.positives, null);
});

test('k must be a usable number', () => {
  assert.throws(() => scoreRetrieval([pos('a', [], ['u'])], { k: 0 }), /positive integer/);
  assert.throws(() => scoreRetrieval([pos('a', [], ['u'])], { k: NaN }), /positive integer/);
});

/* ============================= the gold set ================================================= */

test('a malformed gold set is refused before it can flatter anything', () => {
  assert.throws(() => validateGoldSet([{ id: 'a', query: 'x' }]), /never fail/, 'a positive with no expected URL always passes');
  assert.throws(() => validateGoldSet([{ id: 'a', query: 'x', negative: true, expectUrls: ['u'] }]), /cannot expect/);
  assert.throws(() => validateGoldSet([{ id: 'a', query: 'x', expectUrls: ['u'] }, { id: 'a', query: 'y', expectUrls: ['v'] }]), /duplicate/);
  assert.throws(() => validateGoldSet([{ id: 'a', query: '   ', expectUrls: ['u'] }]), /non-empty/);
});

test('the shipped gold set is well formed and carries real negatives', () => {
  const gold = JSON.parse(readFileSync(join(HERE, '..', 'tasks', 'retrieval-gold.json'), 'utf8')).queries;
  validateGoldSet(gold);
  const negatives = gold.filter((q) => q.negative === true);
  assert.ok(negatives.length >= 3, 'a gold set with no negatives cannot detect a retriever that returns everything');
  assert.ok(gold.length - negatives.length >= 10, 'too few positives to mean anything');
});

test('the driver records what each query actually returned', async () => {
  const gold = [
    { id: 'a', query: 'welding', expectUrls: ['https://x/1'] },
    { id: 'n', query: 'kubernetes', negative: true },
  ];
  const score = await runRetrievalEval(gold, async (q) =>
    q === 'welding' ? { hits: [hit('https://x/1')], outcome: ok() } : { hits: [], outcome: missOutcome() },
  );
  assert.equal(score.known, true);
  assert.equal(score.positives.recallAtK, 1);
  assert.equal(score.negatives.correct, 1);
});
