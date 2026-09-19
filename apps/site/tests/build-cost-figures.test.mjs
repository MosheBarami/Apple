import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The pricing page quoted TWO costs for one build and never said they were different builds.
 *
 * "One Credit is 30 neurons" and "a full Agent build … measured 511 neurons" sat three lines under
 * an allowance denominated in 77 Credits. 77 × 30 = 2,310, so a reader who divides finds the page
 * out by 4.5×. Both numbers were real: 511 is the build-blind path from docs/COST-MODEL.md, 2,300
 * is the same build with the visual critique, and only the second is what the allowance buys.
 *
 * The rule this pins is not "do not mention 511". It is that the cheap figure may only appear
 * beside the one being priced, so the sentence has to explain the gap rather than leave it.
 */

const page = readFileSync(new URL('../src/pages/pricing.astro', import.meta.url), 'utf8');

function check(text, blind, gated) {
  if (!text.includes(String(blind))) return; // not quoted at all is fine
  assert.ok(
    text.includes(String(gated)) || /BUILD_NEURONS\.qualityGated/.test(text),
    `the page quotes the build-blind figure ${blind} without the quality-gated ${gated} beside it`,
  );
}

test('the allowance arithmetic closes: credits per build × neurons per credit ≈ the measured build', async () => {
  const shared = await import('../../../packages/shared/src/index.ts');
  const { CREDITS_PER_BUILD, NEURONS_PER_CREDIT, BUILD_NEURONS } = shared;

  assert.equal(CREDITS_PER_BUILD, Math.ceil(BUILD_NEURONS.qualityGated / NEURONS_PER_CREDIT));
  // Rounding up one build's neurons must not drift more than a Credit's worth from the measurement.
  const implied = CREDITS_PER_BUILD * NEURONS_PER_CREDIT;
  assert.ok(
    implied - BUILD_NEURONS.qualityGated < NEURONS_PER_CREDIT,
    `77 Credits implies ${implied} neurons against a measured ${BUILD_NEURONS.qualityGated}`,
  );
  // The whole reason the page contradicted itself: these two are far apart and easy to swap.
  assert.ok(BUILD_NEURONS.buildBlind * 4 < BUILD_NEURONS.qualityGated, 'the two build costs converged — re-read the cost model before trusting this guard');
});

test('the build-blind figure never appears without the figure being priced', async () => {
  const { BUILD_NEURONS } = await import('../../../packages/shared/src/index.ts');
  check(page, BUILD_NEURONS.buildBlind, BUILD_NEURONS.qualityGated);
});

test('the guard fails on the sentence that shipped', async () => {
  const { BUILD_NEURONS } = await import('../../../packages/shared/src/index.ts');
  const shipped =
    "A full Agent build — read the tree, edit scripts, create instances, verify — measured 511 neurons, about $0.0056.";
  assert.ok(shipped.includes(String(BUILD_NEURONS.buildBlind)), 'the mutation lost the figure it is about');
  assert.throws(() => check(shipped, BUILD_NEURONS.buildBlind, BUILD_NEURONS.qualityGated));
});
