/**
 * EVERY PHASE THE WORKER CAN ANNOUNCE READS AS PLAIN WORDS.
 *
 * The header falls back to the raw phase id when a label is missing (`PHASE_LABEL[p] ?? p`), so a
 * phase the worker learns before the web does would show a customer `composing` or `writing_luau`.
 * F-007 added `composing` (the model writing its next step) and brought `verifying` and
 * `rebuilding` to life; this pins that each has a label a young reader understands.
 *
 * The phase list is read from the shared union itself, not written out here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { headerHint } from '../src/components/ws/thinking-model.ts';
import { kindForPhase } from '../src/components/ws/activity-model.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
const union = /export type AgentPhase =([^;]*);/.exec(shared);
assert.ok(union, 'the AgentPhase union was not found');
const PHASES = [...union[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

const live = (phase) =>
  headerHint({ intent: null, tools: [], plannedSteps: [], gates: [], status: { phase, creditsSpent: 1 }, streaming: true }, false);

test('the phase list was read', () => {
  assert.ok(PHASES.length >= 10, `only ${PHASES.length} phases found — this test would check nothing`);
  for (const p of ['composing', 'verifying', 'rebuilding']) assert.ok(PHASES.includes(p), `${p} is not an AgentPhase`);
});

test('the header never shows a raw phase id', () => {
  for (const p of PHASES.filter((x) => x !== 'done')) {
    const label = live(p);
    assert.notEqual(label, p, `phase ${p} is shown to the customer as its raw id`);
    assert.doesNotMatch(label, /_/, `phase ${p} reads as an identifier: ${label}`);
  }
});

test('the three phases F-007 brought to life say what is happening, in a few plain words', () => {
  for (const p of ['composing', 'verifying', 'rebuilding']) {
    const label = live(p);
    assert.ok(label.split(' ').length <= 6, `too long for the header: ${label}`);
    assert.doesNotMatch(label, /\b(compos|verif|critiqu|iterat|render)/i, `jargon in ${p}: ${label}`);
    assert.ok(kindForPhase(p), `phase ${p} has no activity state, so the activity list drops it`);
  }
});
