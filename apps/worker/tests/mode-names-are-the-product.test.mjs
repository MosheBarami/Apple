import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE_INFO } from '@golem/shared';
import { systemPrompt } from '../src/prompts.ts';

// V3 G01 / Q25: there are no Plan, Agent or Autonomous modes. One behaviour answers every request,
// and `agent` survives only as the wire value of that behaviour.

const base = {
  studioConnected: true,
  placeName: 'Place1',
  projectName: 'proj',
  memorySummary: null,
  memoryFacts: [],
  fenceId: 'f1xtur3a',
};

test('shared carries one request kind and no mode vocabulary', async () => {
  const shared = await import('@golem/shared');
  assert.deepEqual(Object.keys(MODE_INFO), ['agent']);
  assert.equal('PRODUCT_MODES' in shared, false);
  assert.equal('PRODUCT_MODE_INFO' in shared, false);
});

test('the system prompt names no mode, and every request gets the finish-the-work rules', () => {
  for (const studioConnected of [true, false]) {
    const prompt = systemPrompt({ ...base, studioConnected, mode: 'agent' });
    assert.doesNotMatch(prompt, /^Mode: /m, 'no Mode line');
    assert.doesNotMatch(prompt, /\b(Plan|Agent|Autonomous) mode\b/, 'no product mode is named');
    assert.doesNotMatch(prompt, /Autonomous is ON/);
    assert.match(prompt, /carry the requested work to a\s+finished, verified state/);
  }
});

test('a legacy autonomous option cannot change the prompt', () => {
  const plain = systemPrompt({ ...base, mode: 'agent' });
  assert.equal(systemPrompt({ ...base, mode: 'agent', autonomous: true }), plain);
  assert.equal(systemPrompt({ ...base, mode: 'agent', autonomous: false }), plain);
});

test('a mode the prompt does not know is still a programmer error, not a silent default', () => {
  assert.throws(() => systemPrompt({ ...base, mode: 'plan' }));
});
