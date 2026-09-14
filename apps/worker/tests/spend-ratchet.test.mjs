// The admin spend route must only ever ratchet DOWN.
//
// WHY THIS MATTERS MORE THAN IT DID. `/api/admin/spend-limits` clamped at 2,000,000 neurons/day
// and 20,000,000/month — $22/day and $220/month at $0.011 per 1,000 — against compiled defaults of
// 15,000/day and 460,000/month. A single static secret could therefore raise the bill ~22x, on a
// route that is exempt from user auth (index.ts:74) and throttled only by a best-effort
// per-isolate limiter.
//
// The AI Gateway is on STANDARD billing (owner-confirmed 2026-09-14): overage bills with no
// platform ceiling, and Cloudflare's budget alerts neither pause usage nor fire promptly. BudgetDO
// is the only thing between a runaway loop and the invoice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUDGET = readFileSync(join(HERE, '..', 'src', 'do', 'budget.ts'), 'utf8');
const PRICING = readFileSync(join(HERE, '..', 'src', 'pricing.ts'), 'utf8');

const USD_PER_NEURON = 0.011 / 1000;

function compiled(name) {
  const m = new RegExp(`export const ${name} = ([0-9_]+);`).exec(PRICING);
  assert.ok(m, `${name} must exist in pricing.ts`);
  return Number(m[1].replace(/_/g, ''));
}

test('the runtime ceiling is the compiled default, not a wider number', () => {
  const block = BUDGET.slice(BUDGET.indexOf('const next: Limits = {'), BUDGET.indexOf('await this.ctx.storage.put(LIMITS_KEY'));
  for (const field of ['billableNeuronsPerDay', 'billableNeuronsPerMonth', 'maxNeuronsPerRequest']) {
    assert.match(
      block,
      new RegExp(`${field}:\\s*clamp\\([^)]*DEFAULT_LIMITS\\.${field}\\)`),
      `${field} must clamp to DEFAULT_LIMITS.${field} so the route cannot raise it`,
    );
  }
});

test('the old 22x headroom is gone', () => {
  for (const literal of ['2_000_000', '20_000_000', '50_000']) {
    assert.equal(
      new RegExp(`clamp\\([^)]*,\\s*${literal}\\)`).test(BUDGET),
      false,
      `a runtime clamp at ${literal} re-opens the ratchet`,
    );
  }
});

test('the ceiling a compromised ADMIN_KEY could reach stays bounded', () => {
  // The point of the change: the worst case a secret can produce is the compiled budget, not $220.
  const perMonth = compiled('BILLABLE_NEURONS_PER_MONTH');
  const worstCase = perMonth * USD_PER_NEURON;
  assert.ok(worstCase < 50, `a compromised admin key could still reach $${worstCase.toFixed(2)}/month`);
});

test('lowering is still allowed, and zero is reachable', () => {
  // Lowering must stay instant — it is what you do in a hurry. Zero is the emergency stop.
  const block = BUDGET.slice(BUDGET.indexOf('const next: Limits = {'), BUDGET.indexOf('await this.ctx.storage.put(LIMITS_KEY'));
  assert.match(block, /billableNeuronsPerDay:\s*clamp\([^)]*,\s*0\s*,/, 'the day floor must be 0');
  assert.match(block, /billableNeuronsPerMonth:\s*clamp\([^)]*,\s*0\s*,/, 'the month floor must be 0');
});
