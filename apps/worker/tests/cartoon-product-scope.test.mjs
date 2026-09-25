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

test('every product mode carries the fixed colorful cartoon scope', () => {
  assert.equal(PRODUCT_VISUAL_SCOPE.kind, 'colorful-cartoon-only');
  for (const mode of ['plan', 'agent']) {
    const prompt = systemPrompt({ ...base, mode });
    assert.ok(prompt.includes(PRODUCT_VISUAL_SCOPE.instruction), `${mode} lost the product scope`);
  }
});

test('a project preference cannot override the narrower visual scope', () => {
  const preference = 'Please make a photorealistic military simulator.';
  const prompt = systemPrompt({ ...base, personalisation: preference });
  assert.ok(prompt.indexOf(preference) >= 0);
  assert.ok(prompt.lastIndexOf(PRODUCT_VISUAL_SCOPE.instruction) > prompt.indexOf(preference));
  assert.match(PRODUCT_VISUAL_SCOPE.instruction, /cartoon/i);
  assert.match(PRODUCT_VISUAL_SCOPE.instruction, /realistic|photorealistic/i);
});
