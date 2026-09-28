/**
 * The customer picks no work mode (V3 gate G01). Autonomy never becomes a ProductMode, and the one
 * step ceiling every run has is disclosed on /pricing — never a fixed step budget per tier or mode.
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

function productModes() {
  const match = /export type ProductMode\s*=\s*([^;]+);/.exec(shared);
  assert.ok(match, 'THIS GUARD IS BROKEN: ProductMode is no longer readable from packages/shared');
  const values = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(values.length > 0, 'THIS GUARD IS BROKEN: ProductMode parsed to no values');
  return values;
}

test('autonomy stays outside the ProductMode union', () => {
  assert.ok(!productModes().includes('autonomous'), 'Autonomous became a ProductMode');
  assert.doesNotMatch(shared, /GolemMode/, 'the retired mode alias has returned');
});

test('every run has exactly the requested 1000-step ceiling and no wall-clock cutoff', () => {
  assert.doesNotMatch(session, /STEP_LIMITS/);
  assert.doesNotMatch(session, /maxStepsFor/);
  assert.doesNotMatch(session, /RUN_WALL_MS/);
  assert.match(session, /export const MAX_RUN_STEPS\s*=\s*1000\s*;/);
  assert.match(session, /agent\.step\s*>=\s*MAX_RUN_STEPS/);
});

test('pricing discloses the one 1000-step ceiling and offers no Autonomous option', () => {
  const text = visibleText(pricing);
  assert.match(text, /\b1000\s+steps?\b/i, 'pricing.astro does not disclose the 1000-step ceiling');
  assert.doesNotMatch(text, /\bAutonomous\b/, 'pricing.astro offers Autonomous as a customer option');
});

test('the step-ceiling guard has teeth', () => {
  assert.doesNotMatch(visibleText('<li>Up to 3 steps per request</li>'), /1000 steps/i,
    'the guard no longer distinguishes the requested ceiling from an obsolete one');
});
