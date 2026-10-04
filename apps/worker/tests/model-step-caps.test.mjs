/**
 * THE ENGINE'S PRICE AND STEP CAP (D-VISION-1, narrowed to one engine by V3 gate G01).
 *
 * Three properties, each one a way a bill escapes or the engine is silently unusable:
 *
 *   1. The engine has a price row. `neuronsFor` used to price an unknown id at the dearest row in
 *      the table, which under-prices any model dearer than that row, so an unknown id now throws
 *      instead of being guessed.
 *   2. Its `maxNeuronsPerStep` admits the step the product actually sends — a ~64k-token prompt at
 *      the full output ceiling — at the engine's OWN price.
 *   3. …and is not wildly above it, so a cap cannot quietly become "no cap".
 *
 * The caps are hand-written in packages/shared/src/models.ts (the registry is data the browser
 * reads too); this file derives them back from the price table, so a price change that outgrows a
 * cap turns this red rather than refusing customers in production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_REGISTRY } from '@studpilot/shared';
import {
  MAX_NEURONS_PER_REQUEST,
  MODEL_PRICES,
  UnpricedModelError,
  estimateNeurons,
  maxNeuronsPerStepFor,
  neuronsFor,
  routeForModelId,
} from '../src/pricing.ts';

const REFERENCE_PROMPT_TOKENS = 64_000;

test('the registry is the one engine, StudPilot, so nothing below is vacuous', () => {
  assert.deepEqual(MODEL_REGISTRY.map((m) => m.id), ['apple']);
});

test('every registry model has a price row', () => {
  for (const m of MODEL_REGISTRY) {
    assert.ok(Object.prototype.hasOwnProperty.call(MODEL_PRICES, m.providerModelId), `${m.id} (${m.providerModelId}) has no price`);
  }
});

test('an unpriced model throws instead of being priced by analogy', () => {
  assert.throws(() => neuronsFor('openai/gpt-7-imaginary', 1000, 1000), UnpricedModelError);
  assert.throws(() => estimateNeurons('no-such-model', 3500, 100), UnpricedModelError);
  // The prototype is not a price table.
  assert.throws(() => neuronsFor('constructor', 1, 1), UnpricedModelError);
});

test('each model admits a reference step at its own price, and its cap is not a disguised "no cap"', () => {
  for (const m of MODEL_REGISTRY) {
    const step = neuronsFor(m.providerModelId, REFERENCE_PROMPT_TOKENS, m.maxOutputTokens);
    assert.ok(m.maxNeuronsPerStep >= step, `${m.id}: cap ${m.maxNeuronsPerStep} refuses a reference step of ${step}`);
    assert.ok(m.maxNeuronsPerStep <= Math.ceil(step * 1.1), `${m.id}: cap ${m.maxNeuronsPerStep} is more than 10% above a reference step of ${step}`);
    assert.equal(maxNeuronsPerStepFor(m.providerModelId), m.maxNeuronsPerStep, m.id);
  }
});

test('StudPilot keeps the historical per-request cap; unlisted models keep the global one', () => {
  for (const m of MODEL_REGISTRY) assert.equal(m.maxNeuronsPerStep, MAX_NEURONS_PER_REQUEST, m.id);
  assert.equal(maxNeuronsPerStepFor('@cf/qwen/qwen3-30b-a3b-fp8'), MAX_NEURONS_PER_REQUEST);
  assert.equal(maxNeuronsPerStepFor('@cf/black-forest-labs/flux-1-schnell'), MAX_NEURONS_PER_REQUEST);
});

test('a third-party id is routed to the third-party wallet even when the registry does not list it', () => {
  assert.equal(routeForModelId('openai/some-model'), 'unified-billing');
  assert.equal(routeForModelId('anthropic/some-future-model'), 'unified-billing');
  assert.equal(routeForModelId('@cf/zai-org/glm-5.3-flash'), 'workers-ai');
  assert.equal(routeForModelId('m'), 'workers-ai');
});
