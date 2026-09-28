import test from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompts.ts';
import { PRODUCT_VISUAL_SCOPE } from '../src/product-scope.ts';

const base = {
  mode: 'agent',
  studioConnected: true,
  placeName: 'Cartoon Test',
  projectName: 'Cartoon Test',
  memorySummary: null,
  memoryFacts: [],
  fenceId: 'cartoon-scope-test',
};

test('every request carries the owner-directed all-genre scope', () => {
  assert.equal(PRODUCT_VISUAL_SCOPE.kind, 'all-roblox-genres');
  // One behaviour (V3 G01), paired or not.
  for (const studioConnected of [true, false]) {
    const prompt = systemPrompt({ ...base, mode: 'agent', studioConnected });
    assert.ok(prompt.includes(PRODUCT_VISUAL_SCOPE.instruction), `studioConnected=${studioConnected} lost the product scope`);
  }
});

test('requested art direction is retained and owner-first source guidance applies', () => {
  const preference = 'Please make a photorealistic military simulator.';
  const prompt = systemPrompt({ ...base, personalisation: preference });
  assert.ok(prompt.indexOf(preference) >= 0);
  assert.ok(prompt.lastIndexOf(PRODUCT_VISUAL_SCOPE.instruction) > prompt.indexOf(preference));
  assert.match(PRODUCT_VISUAL_SCOPE.instruction, /every Roblox genre/);
  assert.match(PRODUCT_VISUAL_SCOPE.instruction, /owner-attested/);
});
