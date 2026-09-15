// The admission rules for numbers that came from somewhere else.
//
// Each case here is a value `??` would have let through. The point of the suite is that the
// violating input comes FROM THE TEST — there is no way to make a live worker send a
// `waitMs` of Infinity on demand, and a suite that only ever saw well-formed numbers would
// pass against a guard that had been deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { finiteInt, finiteNumber, isFiniteNumber, retryAfterSeconds } from '../src/numbers.mjs';

test('isFiniteNumber rejects every shape `??` would have accepted', () => {
  for (const bad of [NaN, Infinity, -Infinity, '12', '', null, undefined, {}, [], true, 10n]) {
    assert.equal(isFiniteNumber(bad), false, `${String(bad)} must not count as a number`);
  }
  for (const good of [0, -1, 1.5, 1e9]) assert.equal(isFiniteNumber(good), true);
});

test('finiteNumber replaces non-numbers with the fallback rather than using them', () => {
  assert.equal(finiteNumber(NaN, 2000), 2000);
  assert.equal(finiteNumber('5000', 2000), 2000, 'a numeric STRING is not a number');
  assert.equal(finiteNumber(Infinity, 2000), 2000);
  assert.equal(finiteNumber(undefined, 2000), 2000);
  assert.equal(finiteNumber(0, 2000), 0, 'a real zero is a real value, not a missing one');
});

test('finiteNumber clamps a real number that is out of range, and never inverts the range', () => {
  assert.equal(finiteNumber(-5, 2000, { min: 200, max: 10_000 }), 200);
  assert.equal(finiteNumber(999_999, 2000, { min: 200, max: 10_000 }), 10_000);
  // The relationship, not the literal: whatever the inputs, the answer stays inside.
  for (const v of [-1e9, -1, 0, 1, 250, 9_999, 1e9]) {
    const out = finiteNumber(v, 2000, { min: 200, max: 10_000 });
    assert.ok(out >= 200 && out <= 10_000, `${v} -> ${out} escaped the range`);
  }
});

test('finiteInt truncates, so a fractional attempt count cannot become a fractional cap', () => {
  assert.equal(finiteInt(3.9, 1), 3);
  assert.equal(finiteInt(-3.9, 1), -3);
  assert.equal(finiteInt('3', 1), 1);
});

test('retryAfterSeconds reads both legal forms and refuses the illegal ones', () => {
  assert.equal(retryAfterSeconds('120'), 120);
  assert.equal(retryAfterSeconds('  7 '), 7);
  assert.equal(retryAfterSeconds('not-a-date'), null);
  assert.equal(retryAfterSeconds(''), null);
  assert.equal(retryAfterSeconds(null), null);
  assert.equal(retryAfterSeconds(undefined), null);
  // An HTTP-date in the past means "now", never a negative delay that a later Math.min picks.
  assert.equal(retryAfterSeconds(new Date(Date.now() - 60_000).toUTCString()), 0);
  const future = retryAfterSeconds(new Date(Date.now() + 30_000).toUTCString());
  assert.ok(future > 25 && future <= 31, `expected ~30s, got ${future}`);
});
