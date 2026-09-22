/**
 * ProductMode is the work-mode contract. It has exactly Plan and Agent; Autonomous is a boolean
 * option on Agent runs and must never grow into a third mode or a fixed step budget in site copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');

const stripTs = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const session = stripTs(readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8'));
const shared = stripTs(readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8'));
const pricing = readFileSync(join(SITE, 'src', 'pages', 'pricing.astro'), 'utf8');
const modesPage = readFileSync(join(SITE, 'src', 'pages', 'docs', 'modes.astro'), 'utf8');

function productModes() {
  const match = /export type ProductMode\s*=\s*([^;]+);/.exec(shared);
  assert.ok(match, 'THIS GUARD IS BROKEN: ProductMode is no longer readable from packages/shared');
  const values = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(values.length > 0, 'THIS GUARD IS BROKEN: ProductMode parsed to no values');
  return values;
}

test('ProductMode is exactly Plan and Agent, with autonomy outside the union', () => {
  assert.deepEqual(productModes(), ['plan', 'agent']);
  assert.doesNotMatch(shared, /GolemMode/, 'the retired mode alias has returned');
  assert.match(shared, /autonomous\?:\s*boolean/,
    'autonomy is no longer represented as a separate boolean option');
});

test('autonomous Agent runs have exactly the requested 1000-step ceiling and no wall-clock cutoff', () => {
  assert.doesNotMatch(session, /STEP_LIMITS/);
  assert.doesNotMatch(session, /maxStepsFor/);
  assert.doesNotMatch(session, /RUN_WALL_MS/);
  assert.match(session, /export const MAX_RUN_STEPS\s*=\s*1000\s*;/);
  assert.match(session, /agent\.step\s*>=\s*MAX_RUN_STEPS/);
});

test('pricing and docs describe the two modes and Autonomous as an Agent toggle', () => {
  for (const [name, src] of [['pricing.astro', pricing], ['docs/modes.astro', modesPage]]) {
    const text = visibleText(src);
    for (const mode of productModes()) {
      const display = mode[0].toUpperCase() + mode.slice(1);
      assert.match(text, new RegExp(`\\b${display}\\b`), `${name} does not name ${display}`);
    }
    assert.match(text, /Autonomous\s+is\s+(?:an\s+Agent\s+toggle|a\s+toggle\s+on\s+Agent)/i,
      `${name} does not make Autonomous an Agent toggle`);
    assert.match(text, /\b1000\s+steps?\b/i, `${name} does not disclose the 1000-step ceiling`);
  }
});

test('the step-ceiling guard has teeth', () => {
  assert.doesNotMatch(visibleText('<li>Up to 3 steps per request</li>'), /1000 steps/i,
    'the guard no longer distinguishes the requested ceiling from an obsolete one');
});
