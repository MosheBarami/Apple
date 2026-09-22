import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const JSX = readFileSync(new URL('../src/components/ws/thinking.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/components/ws/reasoning.css', import.meta.url), 'utf8');

test('run cost stays in the always-visible reasoning header, outside disclosure details', () => {
  //[[ RESTATED 2026-09-22 (A2): the disclosed body is now `ExecutionSurface` (the ReasoningContent's
  //   child), not `ReasoningDetails`. Same property. The rendered markup — the cost span outside both
  //   the trigger and the collapsible content — is checked in tests/thinking-surface.test.mjs. ]]
  const cost = JSX.indexOf('className="apple-reasoning__cost"');
  const details = JSX.indexOf('function ExecutionSurface');
  const header = JSX.indexOf('function ReasoningHeader');
  assert.ok(header >= 0 && details >= 0 && cost > header, 'reasoning header cost is missing');
  const headerSource = JSX.slice(header, JSX.indexOf('function Thinking', header));
  const detailSource = JSX.slice(details, JSX.indexOf('function thinkingMessage', details));
  assert.ok(detailSource.length > 200, 'the disclosed body was not found — this test would check nothing');
  assert.match(headerSource, /creditsSpent !== undefined && creditsSpent > 0/);
  assert.match(headerSource, /className="apple-reasoning__cost"/);
  assert.doesNotMatch(detailSource, /creditsSpent/, 'disclosed details must not restate run cost');
});

test('the visible cost is worker data with singular/plural copy, never a client estimate', () => {
  assert.match(JSX, /creditsSpent=\{status\?\.creditsSpent\}/);
  assert.match(JSX, /creditsSpent === 1 \? 'Credit' : 'Credits'/);
  assert.doesNotMatch(JSX, /NEURONS_PER_CREDIT|creditsFor|Math\.ceil\([^)]*neuron/i);
});

test('narrow-screen reasoning never hides the cost', () => {
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(stripped, /apple-reasoning__cost[^{]*\{[^}]*display\s*:\s*none/);
});
