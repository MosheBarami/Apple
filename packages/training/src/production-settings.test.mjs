import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EFFORT_SCALE, GATEWAY_CEILING, GATEWAY_MODEL_ID, MODE_BASE_TOKENS,
  effortFor, gatewayFor, resolveSettings, tokensForEffort,
} from './production-settings.mjs';

/**
 * A MIRROR IS ONLY SAFE WHILE SOMETHING CHECKS IT AGAINST WHAT IT MIRRORS.
 *
 * production-settings.mjs copies four tables out of apps/worker/src. A copy that nobody compares
 * is a copy that silently goes stale, and a stale copy here does not break a build — it produces
 * an eval that reports a real number for settings production stopped using. That is exactly how
 * `PRODUCTION_BUDGET.clay = 6500` survived a whole revision after MODE_BASE_TOKENS.clay moved from
 * 5200 to 4400.
 *
 * So these tests READ THE WORKER'S OWN SOURCE. They do not import it — the worker is TypeScript
 * with Cloudflare types and importing it from here would need a bundler for no benefit — they
 * parse the literal out of the file and compare. When the worker moves, this goes red and names
 * the number that moved.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_SRC = resolve(HERE, '..', '..', '..', 'apps', 'worker', 'src');
const read = (rel) => readFileSync(resolve(WORKER_SRC, rel), 'utf8');

test('MODE_BASE_TOKENS matches apps/worker/src/do/session.ts', () => {
  const src = read('do/session.ts');
  const m = /const MODE_BASE_TOKENS: Record<GolemMode, number> = \{([^}]*)\}/.exec(src);
  assert.ok(m, 'MODE_BASE_TOKENS is no longer declared the way this guard reads it');
  const found = Object.fromEntries([...m[1].matchAll(/(\w+):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]));
  assert.deepEqual(found, { ...MODE_BASE_TOKENS });
});

test('gatewayModelFor still maps both Apple lanes the way this package assumes', () => {
  const src = read('do/session.ts');
  const body = /export function gatewayModelFor\([^)]*\): string \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(body, 'gatewayModelFor is no longer declared the way this guard reads it');
  // The free lane is pinned to stone; MAX passes its mode through except for clay.
  assert.match(body[1], /productModel === 'apple'\)\s*return 'stone'/);
  assert.match(body[1], /productModel === 'apple-max'\)\s*return mode === 'clay' \? 'stone' : mode/);
  assert.equal(gatewayFor('stone', 'apple'), 'stone');
  assert.equal(gatewayFor('clay', 'apple-max'), 'stone');
  assert.equal(gatewayFor('rune', 'apple-max'), 'rune');
  // Both product lanes land on the same model. That is the fact that decides everything about
  // training in this package: there is no lesser production lane a fine-tune could improve.
  assert.equal(GATEWAY_MODEL_ID[gatewayFor('stone', 'apple')], GATEWAY_MODEL_ID[gatewayFor('stone', 'apple-max')]);
});

test('the effort multipliers and entitlement floor match apps/worker/src/reasoning.ts', () => {
  const src = read('reasoning.ts');
  assert.match(src, /const BASELINE: Record<GolemMode, Effort> = \{ clay: 'low', stone: 'high', rune: 'high' \}/);
  assert.match(src, /const ENTITLEMENT_FLOOR: Record<ProductModel, Effort> = \{ apple: 'low', 'apple-max': 'high' \}/);
  // tokensForEffort scales with a ternary, not a table, so the ternary itself is what is pinned.
  const scale = /const scale = effort === 'high' \? ([\d.]+) : effort === 'medium' \? ([\d.]+) : ([\d.]+);/.exec(src);
  assert.ok(scale, 'tokensForEffort no longer scales the way this guard reads it');
  assert.deepEqual(
    { high: Number(scale[1]), medium: Number(scale[2]), low: Number(scale[3]) },
    { high: EFFORT_SCALE.high, medium: EFFORT_SCALE.medium, low: EFFORT_SCALE.low },
  );
  //[[ 5500 -> 8800. `high` used to scale by 1.25 and now scales by 2, so it asks PAST every
  //   model ceiling and gateway.ts clamps it down. That is free: the clamp runs before the
  //   neuron reservation, so the request resolves to exactly what the model will give. The old
  //   1.25 made the hardest effort tier ask for less room than `medium`, and a 16-step build
  //   died on step 1 at "the model reached its output limit". ]]
  assert.equal(tokensForEffort(4400, 'high'), 8800);
});

test('the gateway ceilings and model ids match apps/worker/src/gateway.ts', () => {
  const src = read('gateway.ts');
  for (const [key, ceiling] of Object.entries(GATEWAY_CEILING)) {
    const line = new RegExp(`^\\s*${key}: \\{ id: '([^']+)'.*maxTokens: (\\d+)`, 'm').exec(src);
    assert.ok(line, `gateway.ts has no ${key} config`);
    assert.equal(line[1], GATEWAY_MODEL_ID[key], `${key} model id drifted`);
    assert.equal(Number(line[2]), ceiling, `${key} ceiling drifted`);
  }
});

test('an Apple MAX Agent request resolves to the settings the worker would send', () => {
  const s = resolveSettings({ lane: 'apple-max', mode: 'agent' });
  assert.equal(s.gateway, 'stone');
  assert.equal(s.modelId, '@cf/zai-org/glm-5.3-flash');
  assert.equal(s.effort, 'high');
  assert.equal(s.baseTokens, 4400);
  assert.equal(s.requestedTokens, 8800);          // 4400 x 2
  assert.equal(s.gatewayCeiling, 6500);
  assert.equal(s.effectiveTokens, 6500);          // asked past the ceiling; the clamp resolves it
  assert.equal(s.clampedByCeiling, true);
  assert.equal(s.effortIsAFloor, true);
});

test('the free lane in Super Agent is clamped by the ceiling, and the run says so', () => {
  // The free lane is pinned to `stone` whatever mode it is in, so a rune-sized request meets
  // stone's smaller ceiling. A run that printed only the request would name a number the provider
  // never saw.
  const s = resolveSettings({ lane: 'apple', mode: 'super-agent' });
  assert.equal(s.gateway, 'stone');
  assert.equal(s.requestedTokens, tokensForEffort(MODE_BASE_TOKENS.rune, effortFor('rune', 'apple')));
  assert.equal(s.requestedTokens, 10400);         // 5200 x 2
  assert.equal(s.effectiveTokens, 6500);
  assert.equal(s.clampedByCeiling, true);
});

test('an explicit effort is no longer a floor, and an explicit budget overrides the arithmetic', () => {
  const s = resolveSettings({ lane: 'apple-max', mode: 'agent', effort: 'low', maxTokens: 900 });
  assert.equal(s.effort, 'low');
  assert.equal(s.effortIsAFloor, false);
  assert.equal(s.requestedTokens, 900);
  assert.equal(s.effectiveTokens, 900);
});
