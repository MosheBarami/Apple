import test from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompts.ts';

const base = {
  studioConnected: true,
  placeName: 'Place1',
  projectName: 'proj',
  memorySummary: null,
  memoryFacts: [],
  fenceId: 'f1xtur3a',
};

const PRODUCT_NAME = { plan: 'Plan', agent: 'Agent' };

test('the system prompt introduces exactly the selected product mode', () => {
  for (const [mode, product] of Object.entries(PRODUCT_NAME)) {
    const prompt = systemPrompt({ ...base, mode });
    const line = /^Mode: .*$/m.exec(prompt);
    assert.ok(line, `${mode}: the prompt has no Mode line`);
    assert.ok(line[0].startsWith(`Mode: ${product}`), `${mode}: wrong mode line: ${line[0]}`);
  }
});

test('Autonomous changes Agent instructions without becoming another mode', () => {
  const normal = systemPrompt({ ...base, mode: 'agent', autonomous: false });
  const autonomous = systemPrompt({ ...base, mode: 'agent', autonomous: true });
  const plan = systemPrompt({ ...base, mode: 'plan', autonomous: true });
  assert.doesNotMatch(normal, /Autonomous is ON/);
  assert.match(autonomous, /Autonomous is ON/);
  assert.doesNotMatch(plan, /Autonomous is ON/, 'Plan must ignore the Agent-only autonomy flag');
});
