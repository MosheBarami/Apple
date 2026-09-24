//[[ RESTATED 2026-09-24 (owner decision D-THINK-1). This held the cost in the Reasoning header, outside
//   the disclosure. The disclosure is gone; the cost now sits in the one live status line, beside the
//   words. Same properties: always visible while the run is live, worker data only, never hidden on a
//   narrow screen. The rendered "3 Credits" is checked in tests/live-status.test.mjs. ]]
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const JSX = strip(readFileSync(new URL('../src/components/ws/thinking.tsx', import.meta.url), 'utf8'));
const CSS = strip(readFileSync(new URL('../src/components/ws/thinking.css', import.meta.url), 'utf8'));

test('run cost stays in the live status line, beside the words', () => {
  const line = JSX.slice(JSX.indexOf('<p className="apple-status__line">'), JSX.indexOf('</p>'));
  assert.ok(line.length > 50, 'the live line was not found — this test would check nothing');
  assert.match(line, /<MorphingWords\b/);
  assert.match(line, /className="apple-status__cost"/, 'the cost is not in the live line');
  assert.equal((JSX.match(/apple-status__cost/g) ?? []).length, 1, 'the cost is said once');
});

test('the visible cost is worker data with singular/plural copy, never a client estimate', () => {
  assert.match(JSX, /const credits = status\?\.creditsSpent;/);
  assert.match(JSX, /credits === 1 \? 'Credit' : 'Credits'/);
  assert.doesNotMatch(JSX, /NEURONS_PER_CREDIT|creditsFor|Math\.ceil\([^)]*neuron/i);
});

test('a narrow screen never hides the cost', () => {
  assert.match(CSS, /\.apple-status__cost \{/, 'the rule this checks is missing');
  assert.doesNotMatch(CSS, /apple-status__cost[^{]*\{[^}]*display\s*:\s*none/);
});
