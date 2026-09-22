import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODE_INFO,
  PRODUCT_MODE_INFO,
  PRODUCT_MODES,
} from '@golem/shared';

test('Plan and Agent are the complete product and wire mode vocabulary', () => {
  assert.deepEqual(PRODUCT_MODES, ['plan', 'agent']);
  assert.deepEqual(Object.keys(MODE_INFO).sort(), ['agent', 'plan']);
  assert.deepEqual(Object.keys(PRODUCT_MODE_INFO).sort(), ['agent', 'plan']);
});

test('customer-facing mode labels are exactly Plan and Agent', () => {
  assert.equal(MODE_INFO.plan.name, 'Plan');
  assert.equal(MODE_INFO.agent.name, 'Agent');
  assert.equal(PRODUCT_MODE_INFO.plan.name, 'Plan');
  assert.equal(PRODUCT_MODE_INFO.agent.name, 'Agent');
});
