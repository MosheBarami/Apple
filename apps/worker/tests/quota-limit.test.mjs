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

// ---- the clamps (review cycle 3, finding 7). Each has a mutation in the report that turns exactly these red. ----

test('CLAMP: a day AND a month both overspent are both at zero, which is a tie, and a tie names the month', () => {
  // Without Math.max(0, ...) the figures are -30 (day) and -20 (month), -20 <= -30 is false, and the DAY is named:
  // "refills at midnight UTC" for a person whose month is just as empty, so tomorrow's midnight refills nothing.
  for (const [day, month] of [[780, 4520], [850, 4550]]) { // the day over by 30 and the month by 20; the day over by 100 and the month by 50
    const l = quotaLimit(wire({ creditsUsedToday: day, creditsUsedThisMonth: month }), NOW);
    assert.equal(l.period, 'month', `used ${day} of 750 today and ${month} of 4500 this month`);
    assert.equal(l.refillWhen, 'on 1 November at 00:00 UTC');
  }
  // The other order of overspend gives the same answer, so the rule is "both empty", not "which is further over".
  assert.equal(quotaLimit(wire({ creditsUsedToday: 760, creditsUsedThisMonth: 4600 }), NOW).period, 'month');
});

test('CLAMP: one limit overspent and the other not names the one that is empty', () => {
  assert.equal(quotaLimit(wire({ creditsUsedToday: 800, creditsUsedThisMonth: 1000 }), NOW).period, 'day', 'the day is over, the month has room');
  assert.equal(quotaLimit(wire({ creditsUsedToday: 100, creditsUsedThisMonth: 4600 }), NOW).period, 'month', 'the month is over, the day has room');
});

test('CLAMP: a figure that is not a finite number is unreadable, and an unreadable half means the day is named', () => {
  const ok = { creditsDaily: 750, creditsUsedToday: 0, creditsMonthly: 4500, creditsUsedThisMonth: 4500 };
  assert.equal(quotaLimit(ok, NOW).period, 'month', 'control: the same figures, all readable, name the month');
  for (const bad of [Infinity, -Infinity, NaN, '4500', null, undefined]) {
    assert.equal(quotaLimit({ ...ok, creditsUsedThisMonth: bad }, NOW).period, 'day', `creditsUsedThisMonth ${String(bad)}`);
    assert.equal(quotaLimit({ ...ok, creditsMonthly: bad }, NOW).period, 'day', `creditsMonthly ${String(bad)}`);
    assert.equal(quotaLimit({ ...ok, creditsUsedToday: bad }, NOW).period, 'day', `creditsUsedToday ${String(bad)}`);
  }
});

test('CLAMP: the daily refill is the NEXT UTC midnight, also at the last millisecond and at midnight itself', () => {
  assert.equal(quotaLimit({}, Date.UTC(2026, 9, 5, 23, 59, 59, 999)).resetsAtIso, '2026-10-06T00:00:00.000Z');
  assert.equal(quotaLimit({}, Date.UTC(2026, 9, 6, 0, 0, 0, 0)).resetsAtIso, '2026-10-07T00:00:00.000Z', 'at midnight the person was just refilled: the next lift is a day away');
  assert.equal(quotaLimit({ resetsAtIso: '' }, NOW).resetsAtIso, '2026-10-06T00:00:00.000Z', 'an empty wire reset is not echoed');
});
