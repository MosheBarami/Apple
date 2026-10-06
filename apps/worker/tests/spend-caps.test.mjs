// The spend caps are a wallet bound, so they are checked in dollars (StudPilot handoff task 0.5).
//
// On 2026-09-29 the caps were lifted to figures that never bind ($11,000 a day, $330,000 a month).
// The plan restores them to the planner's defaults, pending the owner's approval (task X3). If the
// owner approves other figures, change OWNER_APPROVED_* here in the same commit as pricing.ts and say
// so in the message: this file is where the approved figure is written down.
//
// The price is restated rather than imported, so the test cannot agree with whatever the source says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BILLABLE_NEURONS_PER_DAY, BILLABLE_NEURONS_PER_MONTH, USD_PER_NEURON } from '../src/pricing.ts';

const USD_PER_1000_NEURONS = 0.011; // Cloudflare Workers AI list price
const OWNER_APPROVED_USD_PER_MONTH = 25;
const OWNER_APPROVED_USD_PER_DAY = 3.3; // owner decision X3, 2026-10-06 (was 1.65)

test('the price the caps are computed with is the Workers AI list price', () => {
  assert.equal(USD_PER_NEURON, USD_PER_1000_NEURONS / 1000);
});

test('the monthly cap is at most the approved monthly figure', () => {
  const usd = (BILLABLE_NEURONS_PER_MONTH * USD_PER_1000_NEURONS) / 1000;
  assert.ok(usd <= OWNER_APPROVED_USD_PER_MONTH, `monthly cap allows $${usd.toFixed(2)}, approved $${OWNER_APPROVED_USD_PER_MONTH}`);
});

test('the daily cap is at most the approved daily figure', () => {
  const usd = (BILLABLE_NEURONS_PER_DAY * USD_PER_1000_NEURONS) / 1000;
  assert.ok(usd <= OWNER_APPROVED_USD_PER_DAY + 1e-9, `daily cap allows $${usd.toFixed(2)}, approved $${OWNER_APPROVED_USD_PER_DAY}`);
});

test('CONTROL: the caps are not zero, so the product can still build', () => {
  // A cap of 0 passes both bounds above and refuses every build, which is the failure of 2026-09-20.
  // One agent step measured 125-718 neurons; a day must hold at least a hundred of them.
  assert.ok(BILLABLE_NEURONS_PER_DAY >= 100 * 1_200, `daily cap ${BILLABLE_NEURONS_PER_DAY} holds fewer than 100 max-size steps`);
  assert.ok(BILLABLE_NEURONS_PER_MONTH >= BILLABLE_NEURONS_PER_DAY, 'the month must hold at least one full day');
});
