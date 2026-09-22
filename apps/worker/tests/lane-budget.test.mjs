/** Cross-file guard: every product run mode must fit inside its configured provider ceiling. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const GATEWAY = readFileSync(join(SRC, 'gateway.ts'), 'utf8');
const SESSION = readFileSync(join(SRC, 'do', 'session.ts'), 'utf8');

function gatewayLanes() {
  const out = {};
  for (const m of GATEWAY.matchAll(/^\s*(plan|agent):\s*\{\s*id:\s*'([^']+)'[^}]*maxTokens:\s*(\d+)/gm)) {
    out[m[1]] = { id: m[2], maxTokens: Number(m[3]) };
  }
  return out;
}

function sessionBudgets() {
  const m = /MODE_BASE_TOKENS: Record<ProductMode, number> = \{([^}]*)\}/.exec(SESSION);
  assert.ok(m, 'MODE_BASE_TOKENS is no longer one literal — re-read this guard');
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*(\d+)/g)].map((x) => [x[1], Number(x[2])]));
}

const HIGH_MULTIPLIER = 1.25;

test('the provider and session tables contain exactly Plan and Agent', () => {
  assert.deepEqual(Object.keys(gatewayLanes()).sort(), ['agent', 'plan']);
  assert.deepEqual(Object.keys(sessionBudgets()).sort(), ['agent', 'plan']);
});

test('no product run mode asks for more output than its provider route allows', () => {
  const gateway = gatewayLanes();
  for (const [mode, base] of Object.entries(sessionBudgets())) {
    const asked = Math.round(base * HIGH_MULTIPLIER);
    assert.ok(asked <= gateway[mode].maxTokens,
      `${mode} asks for ${asked} at high effort but the gateway caps it at ${gateway[mode].maxTokens}`);
  }
});

test('Plan and Agent use the measured shared foundation', () => {
  const gateway = gatewayLanes();
  assert.equal(gateway.plan.id, gateway.agent.id);
  assert.match(gateway.agent.id, /glm-5\.3-flash/i);
});

test('gatewayModelFor routes by product mode and never invents a third mode', () => {
  const body = /function gatewayModelFor\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(SESSION)?.[1] ?? '';
  assert.match(body, /return mode/);
  assert.doesNotMatch(body, /return ['"][^'"]+['"]/);
});
