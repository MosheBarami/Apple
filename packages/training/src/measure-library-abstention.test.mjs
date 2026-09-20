import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confidence, measure, THRESHOLDS } from './measure-library-abstention.mjs';

//[[ ONE MEASUREMENT, SHARED. It runs 160 Luau processes and takes ~2s; running it per test would
//   turn a cheap suite into a slow one and would measure the same thing five times.
const out = await measure();

/**
 * THE STATISTIC HAS TO BE SCALE-FREE OR IT IS NOT A CONFIDENCE.
 *
 * This is the finding the whole file rests on, so it is pinned as arithmetic rather than left to
 * the measurement to imply. An absolute BM25 total grows with the number of query terms, so a long
 * uncovered request outscores a short covered one; the 16 engine-facing prompts in the run below
 * have a HIGHER median top-1 score than the covered set does, which is why an absolute floor lets
 * exactly the wrong requests through. Dividing the gap by the top score removes that dependence.
 */
test('the confidence is a relative margin, so multiplying every score leaves it unchanged', () => {
  const ranked = [{ score: 20 }, { score: 12 }, { score: 4 }];
  assert.equal(confidence(ranked), 0.4);
  const tenTimesLonger = ranked.map((r) => ({ score: r.score * 10 }));
  assert.equal(confidence(tenTimesLonger), 0.4, 'a longer query must not read as a more confident one');
  assert.equal(confidence([{ score: 9 }, { score: 9 }]), 0, 'a tie at the top is no confidence at all');
  assert.equal(confidence([{ score: 9 }]), 1, 'nothing else scored, so nothing else is competing');
  assert.equal(confidence([]), 0, 'no hits must not read as certainty');
});

/**
 * THE HARNESS REPRODUCES THE TWO NUMBERS THAT ARE ALREADY ON RECORD.
 *
 * 73/80 is the shipped door's top-1 in docs/frontier-for-roblox.md §4.1, and 80/80 is the library
 * sanity the comparator establishes by running every module. A harness that cannot reproduce a
 * number somebody else already measured is not a harness; measure-embedding-retrieval.mjs makes
 * the same check against 49/80 for the same reason.
 */
test('the harness reproduces the recorded door and library numbers', () => {
  assert.equal(out.librarySanity, '80/80 verified modules pass the curriculum\'s own checks when executed');
  assert.equal(out.shippedDoorTop1, '73/80');
  assert.equal(out.covered.length, 80);
  assert.equal(out.loo.length, 80);
  assert.equal(out.modelCalls, 0, 'this measurement spends nothing and must not start');
});

/**
 * THE 0/80 MUST BE A VERDICT, NOT A FAILURE TO LOOK.
 *
 * This is the guard that matters most here. If `luau` were missing, every hand-over would come back
 * `harness_unavailable:no luau binary`, `passedAnyway` would be false for all eighty, and the run
 * would report the identical headline — "an uncovered hand-over never passes" — on the strength of
 * never having executed one. That is this repository's observation-failure pattern exactly, and it
 * is the reason score-eval keeps `ran` and `passed` apart in the first place.
 *
 * So the reasons are read, not just the count: every row must carry a reason the interpreter
 * produced by RUNNING the module.
 */
test('every uncovered hand-over was executed, and the verdict is the module being wrong', () => {
  const executed = ['fails_own_checks', 'does_not_compile', 'does_not_parse', 'not_standalone', 'no_code_block'];
  for (const row of out.loo) {
    assert.ok(row.handedOver, `${row.id}: the door returned nothing, so nothing was tested`);
    if (row.passedAnyway) continue;
    assert.ok(
      executed.includes(row.reason),
      `${row.id}: "${row.reason}" is not a verdict about the module — the harness did not run`,
    );
  }
  const ran = out.loo.filter((r) => r.reason === 'fails_own_checks' || r.passedAnyway).length;
  assert.ok(ran >= 70, `only ${ran}/80 hand-overs reached execution; a 0/80 built on that is not a measurement`);
  assert.equal(out.uncoveredHandOverPassedAnyway, '0/80');
});

/** A policy that hands over MORE as it gets stricter is a policy with the sign backwards. */
test('raising the floor never widens the set the door hands over', () => {
  assert.deepEqual(out.sweep.map((s) => s.threshold), THRESHOLDS);
  for (let i = 1; i < out.sweep.length; i++) {
    const prev = out.sweep[i - 1];
    const here = out.sweep[i];
    assert.ok(here.covered.handedOver <= prev.covered.handedOver, `covered rose at t=${here.threshold}`);
    assert.ok(here.uncoveredLoo.handedOver <= prev.uncoveredLoo.handedOver, `uncovered rose at t=${here.threshold}`);
    assert.ok(here.offCorpus.handedOver <= prev.offCorpus.handedOver, `off-corpus rose at t=${here.threshold}`);
  }
});

/**
 * t=0 IS THE SHIPPED DOOR, AND IT MUST SCORE WHAT THE SHIPPED DOOR SCORES.
 *
 * Nothing abstains at a floor of zero, so no generation happens and every arm's hybrid must
 * collapse to the door's own 73. If a fallback ever leaked into the t=0 row, every improvement
 * further down the sweep would be measured against an inflated baseline.
 */
test('a floor of zero is the door as it ships today, with no generation anywhere in it', () => {
  const zero = out.sweep[0];
  assert.equal(zero.threshold, 0);
  assert.equal(zero.covered.abstained, 0);
  assert.equal(zero.covered.handedOverAndRight, 73);
  assert.equal(zero.uncoveredLoo.handedOver, 80, 'the shipped door hands over on every uncovered request');
  assert.equal(zero.offCorpus.handedOver, 16, 'including all sixteen engine-facing requests it has no module for');
  for (const [arm, n] of Object.entries(zero.hybridOutOf80)) {
    assert.equal(n, 73, `${arm} leaked a generated answer into the no-abstention row`);
  }
});

/**
 * ABSTAIN ON EVERYTHING AND THE POLICY MUST *BE* THE ARM.
 *
 * WRITTEN BECAUSE A MUTATION TURNED NOTHING RED. Replacing the per-prompt join with
 * `right + abstained.length` — crediting every abstention as a success the generator did not
 * actually produce — inflated every cell in the table and the five tests above all stayed green.
 * A guard nobody has seen fail is not a guard, so this is the one that sees it: at a floor nothing
 * can clear, the hybrid has to collapse onto each arm's own recorded total, counted from the same
 * rows by a different expression. Those totals are the seven numbers in
 * docs/frontier-for-roblox.md §4.1, so this also pins the table to the runs it was written from.
 */
test('abstaining on every request scores exactly what that arm scores alone', () => {
  const all = out.sweep.at(-1);
  assert.equal(all.threshold, 1, 'the last row must be the unreachable floor');
  assert.equal(all.covered.handedOver, 0);
  assert.equal(all.covered.abstained, 80);
  assert.deepEqual(all.hybridOutOf80, out.armTotals, 'the fallback is not being joined prompt by prompt');
  assert.deepEqual(out.armTotals, {
    baseline: 53, fewshot: 74, fewshotcustomer: 68, fewshotrandom: 67, secondpass: 62, specrepair: 58, oracle: 63,
  }, 'the recorded arms are no longer the seven runs docs/frontier-for-roblox.md 4.1 reports');
});

/**
 * THE RESULT IS THE PLATEAU, NOT THE PEAK CELL.
 *
 * The threshold is swept over the same eighty queries it is reported on, so the best cell is a
 * measurement of the grid — the argument need-index-search.ts already makes about its own field
 * weights. What survives that objection is a WIDE band in which the answer does not change, so the
 * band is what is asserted: across the middle of the sweep the hybrid beats the shipped door for
 * the shippable no-retrieval fallback, and does so at every threshold in it.
 */
test('the improvement belongs to the idea, not to one lucky threshold', () => {
  const band = out.sweep.filter((s) => s.threshold >= 0.1 && s.threshold <= 0.4);
  assert.ok(band.length >= 6, 'the band under test is too narrow to be a plateau');
  for (const s of band) {
    assert.ok(
      s.hybridOutOf80.fewshotrandom > 73,
      `t=${s.threshold} scores ${s.hybridOutOf80.fewshotrandom}/80, at or below the shipped door's 73/80`,
    );
  }
});
