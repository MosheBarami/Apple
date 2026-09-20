/**
 * THE DOOR HAS TO OPEN ON THE WAY PEOPLE ACTUALLY WRITE.
 *
 * knowledge-reach.json measured the defect against the Worker's own bundle: a contract-phrased query
 * finds its verified module 80/80 at rank one; a customer-phrased query finds it 49/80. The library
 * is not missing knowledge — the lookup is indexed on function-signature vocabulary and searched in
 * teenage-Roblox vocabulary.
 *
 * need-index-search.ts answers that with a customer-voice vocabulary generated per module and BM25F
 * over it. These tests pin the two things that make the answer trustworthy rather than impressive:
 *
 *   1. THE FLOOR IS A MEASUREMENT, NOT A HOPE. A retrieval change is one bad refactor away from
 *      silently returning to 61%, and nothing downstream would notice — the model would just start
 *      writing the logic by hand again, which is the 0/8 this whole library exists to remove. The
 *      floor below is the number packages/training/runs/knowledge-reach-need-index.json recorded,
 *      asserted here so a regression fails a test instead of shipping.
 *
 *   2. A MISS STILL MISSES. The failure this repository keeps meeting is a confident wrong answer,
 *      and a scorer with real-valued scores can produce one for a query with no business matching
 *      anything. The worked cases below are the ones the shipped scorer got wrong for a REASON that
 *      is recorded in the diagnosis, so each is a named defect rather than a lucky example.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');

const dir = mkdtempSync(join(tmpdir(), 'apple-need-index-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'bits.mjs');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(WORKER, 'src', 'need-index-search.ts'))};`,
  `export { searchVerifiedModules, searchVerifiedModulesByContract } from ${JSON.stringify(join(WORKER, 'src', 'verified-modules.ts'))};`,
].join('\n'));
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out],
  { stdio: 'pipe', cwd: WORKER });
const {
  searchVerifiedModulesByNeed, rankByNeed, makeRanker, NEED_INDEX_COVERAGE, DEFAULT_WEIGHTS,
  searchVerifiedModules,
  searchVerifiedModulesByContract,
} = await import(out);

const CUSTOMER = JSON.parse(readFileSync(join(ROOT, 'packages/training/runs/knowledge-reach.json'), 'utf8'))
  .customer.rows.map((r) => ({ id: r.id, query: r.query }));

/**
 * THE RECORDED RESULT THIS DEFENDS.
 * packages/training/runs/knowledge-reach-need-index.json, retrieval only, limit 5, the same 80
 * customer-phrased queries as the 61% baseline. Raise these when a run beats them; never lower one
 * without saying in the commit message which measurement replaced which.
 */
const FLOOR = { top1: 73, inTop5: 79 };
const SHIPPED_BASELINE = { top1: 49, inTop5: 67 };

function score(search) {
  let top1 = 0, inTop5 = 0;
  for (const { id, query } of CUSTOMER) {
    const got = search(query, 5).map((m) => m.id);
    if (got[0] === id) top1++;
    if (got.includes(id)) inTop5++;
  }
  return { top1, inTop5 };
}

test('every verified module has customer vocabulary — a gap here is a module the door cannot find', () => {
  assert.equal(NEED_INDEX_COVERAGE.withNeedText, NEED_INDEX_COVERAGE.modules,
    `${NEED_INDEX_COVERAGE.modules - NEED_INDEX_COVERAGE.withNeedText} modules have no need entry`);
  assert.ok(NEED_INDEX_COVERAGE.generatedBy?.servedBy, 'the index does not record which model produced it');
});

//[[ RE-AIMED WHEN THE DOOR WAS REPLACED, AND THE OLD ASSERTION WAS RIGHT UNTIL THAT MOMENT.
//
//   This read `assert.deepEqual(score(searchVerifiedModules), {49, 67})` as a CONTROL: it proved
//   the comparison below was being made against the same shipped scorer the 61% baseline came from.
//   That is a good control and it is kept — but on 2026-09-20 `searchVerifiedModules` was changed
//   to delegate to the need ranker, because the bake-off in docs/retrieval-bakeoff.md chose it.
//   From that commit the control was asserting that the NEW door still behaves like the OLD one,
//   which is the opposite of what shipping the improvement means. It failed, correctly, and its
//   message named the right cause: "a baseline that moved".
//
//   The original scorer was not deleted — it is preserved and still exported as
//   `searchVerifiedModulesByContract`, because it is 80/80 on contract phrasing and that is worth
//   keeping. So the control now points at it, where 49/67 is still the true reading, and a second
//   assertion covers the thing that actually matters now: the door a CUSTOMER reaches must clear
//   the floor, not merely the ranker behind it. Nothing was weakened; one assertion was added. ]]
test('customer-phrased retrieval clears the recorded floor', () => {
  const control = score(searchVerifiedModulesByContract);
  assert.deepEqual(control, SHIPPED_BASELINE,
    'the ORIGINAL contract scorer no longer reproduces 49/80 and 67/80 — the baseline every number '
    + 'in docs/retrieval-bakeoff.md is quoted against has moved, so the comparison below is void');

  const got = score(searchVerifiedModulesByNeed);
  assert.ok(got.top1 >= FLOOR.top1, `top-1 fell to ${got.top1}/80; the recorded floor is ${FLOOR.top1}/80`);
  assert.ok(got.inTop5 >= FLOOR.inTop5, `in-top-5 fell to ${got.inTop5}/80; the recorded floor is ${FLOOR.inTop5}/80`);

  // THE ONE THAT WOULD HAVE CAUGHT A WIN THAT NEVER SHIPPED. A ranker measured at 91% that the
  // product does not call is worth exactly nothing, and this repository has shipped that shape of
  // defect more than once. This asserts the PUBLIC entry point — the one the model reaches through
  // askVerifiedModule — and not the implementation behind it.
  const shipped = score(searchVerifiedModules);
  assert.ok(shipped.top1 >= FLOOR.top1,
    `the ranker clears the floor but the SHIPPED door returns ${shipped.top1}/80. The improvement is `
    + 'built and not wired, which is the defect this codebase keeps repeating.');
});

test('contract-phrased retrieval does not pay for it', () => {
  // The shipped scorer is perfect on contract phrasing — 80/80 — and an approach that buys customer
  // recall by losing that has moved the failure rather than fixed it.
  const bundle = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/verified-modules.json'), 'utf8'));
  let top1 = 0;
  for (const m of bundle.modules) {
    if (searchVerifiedModulesByNeed(m.contract, 5)[0]?.id === m.id) top1++;
  }
  assert.ok(top1 >= 78, `contract-phrased top-1 fell to ${top1}/80`);
});

test('the worked failure from the diagnosis now returns the right module', () => {
  // Recorded in docs/knowledge-retrieval-diagnosis.md: this query did not return purchase-transaction
  // AT ALL under the shipped scorer — not in the top five. It returned trade-offer-check and
  // cooldown-clock, because "check" is a substring of trade-offer-CHECK and ordered-CHECKpoints.
  const got = searchVerifiedModulesByNeed(
    'when a player buys something take the coins off them but only if they can afford it and do not already own it', 5,
  ).map((m) => m.id);
  assert.equal(got[0], 'purchase-transaction', `got ${got.join(', ')}`);
});

test('a word inside a compound id no longer scores as if it were a token of it', () => {
  // M1 in the diagnosis: `id.includes(w)` at +3 fires mid-word. 39 of the 348 distinct query words
  // land inside some id without being one of its hyphen-delimited tokens; grid-rOUTe-cost alone
  // decided three separate wrong answers on the word "out".
  const scored = rankByNeed('out');
  const bad = scored.find((r) => r.m.id === 'grid-route-cost');
  assert.equal(bad, undefined, '"out" still scores for grid-route-cost — substring matching survived');
});

test('a query with nothing to match returns nothing, rather than something confident', () => {
  assert.deepEqual(searchVerifiedModulesByNeed('', 5), []);
  assert.deepEqual(searchVerifiedModulesByNeed('the and of to my me', 5), []);
});

test('ranking is deterministic across calls', () => {
  const q = 'stop the player using an ability too often';
  const a = searchVerifiedModulesByNeed(q, 5).map((m) => m.id);
  const b = searchVerifiedModulesByNeed(q, 5).map((m) => m.id);
  assert.deepEqual(a, b);
});

test('the localeCompare tie-break has stopped being load-bearing', () => {
  // Under the shipped integer scheme 11 of 80 queries were decided by a tie at the top score, and
  // the correct module was inside that tie in 9 of them — winning 4 and losing 5. Roughly one query
  // in nine carried no retrieval information at all. The tie-break stays, because a deterministic
  // order is worth keeping; what must change is how often it decides anything.
  let tied = 0;
  for (const { query } of CUSTOMER) {
    const r = rankByNeed(query);
    if (r.length > 1 && r[0].score === r[1].score) tied++;
  }
  assert.ok(tied <= 2, `${tied}/80 queries are still decided by a tie at the top score`);
});

test('the field weights sit on a plateau, not a spike', () => {
  // The four weights were chosen by judgement before anything was measured, and the sweep afterwards
  // finds a slightly better cell that was deliberately not adopted. Either way the claim that makes
  // the result belong to the idea rather than to four constants is that the neighbours do nearly as
  // well — measured across a 5x5 grid as 72..75 top-1. If a neighbour fell off a cliff, the number
  // would be a property of the constants and this test is where that shows up.
  const base = score((q, l) => makeRanker().search(q, l)).top1;
  for (const id of [DEFAULT_WEIGHTS.id * 0.8, DEFAULT_WEIGHTS.id * 1.2]) {
    for (const need of [DEFAULT_WEIGHTS.need * 0.7, DEFAULT_WEIGHTS.need * 1.4]) {
      const r = makeRanker({ weights: { id, need } });
      const got = score((q, l) => r.search(q, l)).top1;
      assert.ok(base - got <= 4,
        `weights id=${id.toFixed(2)} need=${need.toFixed(2)} scores ${got}/80 against ${base}/80 — the tuned point is a spike`);
    }
  }
});
