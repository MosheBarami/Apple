import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMatrix } from './ai-model-matrix.mjs';
const model = { id: 'fixture', provider: 'huggingface', inputCostPer1M: 0.2, outputCostPer1M: 0.5 };
test('matrix budget prevents inference; no skipped probe becomes a pass', async () => {
  let calls = 0;
  const result = await evaluateMatrix({ model, budgetUsd: 0.000001, block: { params: {} }, compiler: '/unused',
    validateParams: () => ({ ok: true }), invoke: async () => { calls++; } });
  assert.equal(calls, 0); assert.equal(result.requested, 5); assert.equal(result.measured, 0);
  assert.equal(result.outcomes.every((outcome) => outcome.status === 'not_run' && outcome.passed === undefined), true);
});
test('unknown price is not zero or an unlimited test budget', async () => {
  await assert.rejects(evaluateMatrix({ model: { ...model, inputCostPer1M: null }, budgetUsd: 0.1 }), /known catalog price/);
});
test('billing/auth failures end the batch without a second call or fabricated cost', async () => {
  let calls = 0;
  const result = await evaluateMatrix({ model, budgetUsd: 0.1, block: { params: {} }, compiler: '/unused',
    validateParams: () => ({ ok: true }), invoke: async () => { calls++; throw Object.assign(new Error('private details'), { code: 'billing' }); } });
  assert.equal(calls, 1); assert.equal(result.measured, 0); assert.equal(result.outcomes[0].code, 'billing');
  assert.equal(result.measuredCostUsd, null); assert.equal(result.usageComplete, false);
  assert.equal(JSON.stringify(result).includes('private details'), false);
});
