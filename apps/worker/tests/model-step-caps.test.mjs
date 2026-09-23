/**
 * PER-MODEL PRICES AND STEP CAPS (D-VISION-1, rollout step 2).
 *
 * Three properties, each one a way a bill escapes or a paid model is silently unusable:
 *
 *   1. Every model the registry can run has a price row. `neuronsFor` used to price an unknown id at
 *      the dearest row in the table — a safe guess only while every model was a Workers AI model.
 *      The dearest row (qwen2.5-coder, $0.66/$1.00) prices GPT-5.6 Sol at a thirtieth of its output
 *      rate, so an unknown id now throws instead of being guessed.
 *   2. Each model's `maxNeuronsPerStep` admits the step the product actually sends — a ~64k-token
 *      prompt at the full output ceiling — at that model's OWN price. A single global cap of 1,200
 *      refuses every Sol and every Gemini step.
 *   3. …and is not wildly above it, so a cap cannot quietly become "no cap".
 *
 * The caps are hand-written in packages/shared/src/models.ts (the registry is data the browser
 * reads too); this file derives them back from the price table, so a price change that outgrows a
 * cap turns this red rather than refusing customers in production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_REGISTRY } from '@golem/shared';
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

test('the registry is non-empty, so nothing below is vacuous', () => {
  assert.ok(MODEL_REGISTRY.length >= 5, `registry has ${MODEL_REGISTRY.length} models`);
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

test('the third-party prices are the catalogue figures, and Sol is reserved at the dearer standard rate', () => {
  assert.deepEqual(
    { ...MODEL_PRICES['google/gemini-3.8-flash'] },
    { id: 'google/gemini-3.8-flash', usdPerMInput: 0.75, usdPerMOutput: 3.75, usdPerMCachedInput: 0.075 },
  );
  assert.deepEqual(
    { ...MODEL_PRICES['openai/gpt-5.6-luna'] },
    { id: 'openai/gpt-5.6-luna', usdPerMInput: 0.2, usdPerMOutput: 1.2, usdPerMCachedInput: 0.02 },
  );
  // $5/$30 (changelog standard) and not the catalogue's $2/$10 until a live bill says otherwise.
  assert.equal(MODEL_PRICES['openai/gpt-5.6-sol'].usdPerMInput, 5);
  assert.equal(MODEL_PRICES['openai/gpt-5.6-sol'].usdPerMOutput, 30);
});

test('each model admits a reference step at its own price, and its cap is not a disguised "no cap"', () => {
  for (const m of MODEL_REGISTRY) {
    const step = neuronsFor(m.providerModelId, REFERENCE_PROMPT_TOKENS, m.maxOutputTokens);
    assert.ok(m.maxNeuronsPerStep >= step, `${m.id}: cap ${m.maxNeuronsPerStep} refuses a reference step of ${step}`);
    assert.ok(m.maxNeuronsPerStep <= Math.ceil(step * 1.1), `${m.id}: cap ${m.maxNeuronsPerStep} is more than 10% above a reference step of ${step}`);
    assert.equal(maxNeuronsPerStepFor(m.providerModelId), m.maxNeuronsPerStep, m.id);
  }
});

test('the Apple lanes keep the historical per-request cap; unlisted models keep the global one', () => {
  for (const m of MODEL_REGISTRY.filter((x) => x.route === 'workers-ai')) assert.equal(m.maxNeuronsPerStep, MAX_NEURONS_PER_REQUEST, m.id);
  assert.equal(maxNeuronsPerStepFor('@cf/qwen/qwen3-30b-a3b-fp8'), MAX_NEURONS_PER_REQUEST);
  assert.equal(maxNeuronsPerStepFor('@cf/black-forest-labs/flux-1-schnell'), MAX_NEURONS_PER_REQUEST);
});

test('a third-party id is routed to the third-party wallet even when the registry does not list it', () => {
  assert.equal(routeForModelId('openai/gpt-5.6-sol'), 'unified-billing');
  assert.equal(routeForModelId('anthropic/some-future-model'), 'unified-billing');
  assert.equal(routeForModelId('@cf/zai-org/glm-5.3-flash'), 'workers-ai');
  assert.equal(routeForModelId('m'), 'workers-ai');
});
