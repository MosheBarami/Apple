/**
 * WHICH LIMIT STOPPED A PERSON, AND WHEN IT LIFTS (quotaLimit, packages/shared).
 *
 * quotaState spends min(dayLeft, monthLeft), so Free's 30 credits a month are used up in six full days and from
 * then on the day is not what stops anybody. Every surface that says "used up" or "refills" reads this one rule;
 * the surfaces have their own tests (run-refund, discord-commands, voice-transcribe, usage-meter).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaLimit } from '@studpilot/shared';

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0); // 5 October 2026, 12:00 UTC
const wire = (over = {}) => ({ creditsDaily: 750, creditsUsedToday: 0, creditsMonthly: 4500, creditsUsedThisMonth: 0, resetsAtIso: '2026-10-06T00:00:00.000Z', ...over });

test('the day binds while it has less left than the month, and lifts at the next UTC midnight', () => {
  const l = quotaLimit(wire({ creditsUsedToday: 750, creditsUsedThisMonth: 750 }), NOW);
  assert.deepEqual([l.period, l.label, l.window, l.refillWhen, l.resetsAtIso], ['day', 'Daily', 'today', 'at midnight UTC', '2026-10-06T00:00:00.000Z']);
});

test('the month binds when it has less left than the day, and lifts at the first instant of next month', () => {
  const l = quotaLimit(wire({ creditsUsedThisMonth: 4440 }), NOW); // 60 left this month, 750 today
  assert.deepEqual([l.period, l.label, l.window, l.refillWhen, l.resetsAtIso], ['month', 'Monthly', 'this month', 'on 1 November at 00:00 UTC', '2026-11-01T00:00:00.000Z']);
});

test('a tie names the month: tomorrow\'s midnight would refill nothing', () => {
  assert.equal(quotaLimit(wire({ creditsUsedToday: 0, creditsUsedThisMonth: 3750 }), NOW).period, 'month'); // 750 left in each
});

test('December lifts into January of the next year', () => {
  const l = quotaLimit(wire({ creditsUsedThisMonth: 4500 }), Date.UTC(2026, 11, 20));
  assert.equal(l.refillWhen, 'on 1 January at 00:00 UTC');
  assert.equal(l.resetsAtIso, '2027-01-01T00:00:00.000Z');
});

test('a state without the figures reads as the day, and never invents a month', () => {
  for (const q of [null, undefined, {}, { creditsDaily: 750 }, { creditsDaily: NaN, creditsUsedToday: 0, creditsMonthly: 4500, creditsUsedThisMonth: 4500 }]) {
    assert.equal(quotaLimit(q, NOW).period, 'day');
  }
  assert.equal(quotaLimit({}, NOW).resetsAtIso, '2026-10-06T00:00:00.000Z', 'no wire reset: the next UTC midnight is computed');
  assert.equal(quotaLimit({ resetsAtIso: 'tomorrow-ish' }, NOW).resetsAtIso, '2026-10-06T00:00:00.000Z', 'an unreadable wire reset is not echoed');
});
