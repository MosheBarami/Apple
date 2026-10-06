/**
 * SELF_CHECK: the one switch for the self-check before answering (M1 of docs/autonomy/PHASE-3-4-PLAN.md).
 *
 * Property under test: the switch has three documented values, an explicit value always wins, and with no
 * value the default follows the environment (on everywhere except the deployed production worker, which stays
 * exactly as it was until the owner gives the Q21 line and turns it on).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { selfCheckMode, SELF_CHECK_LIMITS } from '../src/self-check.ts';

test('an explicit value always wins, in every environment', () => {
  for (const environment of [undefined, 'production', 'staging', 'test']) {
    assert.equal(selfCheckMode({ SELF_CHECK: 'off', ENVIRONMENT: environment }), 'off');
    assert.equal(selfCheckMode({ SELF_CHECK: 'on', ENVIRONMENT: environment }), 'on');
    assert.equal(selfCheckMode({ SELF_CHECK: 'full', ENVIRONMENT: environment }), 'full');
  }
});

test('the spellings people actually write are read as the switch they mean', () => {
  for (const off of ['0', 'false', 'OFF', ' off ', 'no']) assert.equal(selfCheckMode({ SELF_CHECK: off }), 'off', off);
  for (const on of ['1', 'true', 'ON', 'yes']) assert.equal(selfCheckMode({ SELF_CHECK: on }), 'on', on);
  assert.equal(selfCheckMode({ SELF_CHECK: 'FULL' }), 'full');
});

test('no value: on in tests and local development, off in the deployed production worker', () => {
  assert.equal(selfCheckMode({}), 'on');
  assert.equal(selfCheckMode({ ENVIRONMENT: 'development' }), 'on');
  assert.equal(selfCheckMode({ ENVIRONMENT: 'production' }), 'off');
});

test('a value nobody defined fails to the environment default, not to a guess', () => {
  assert.equal(selfCheckMode({ SELF_CHECK: 'maybe' }), 'on');
  assert.equal(selfCheckMode({ SELF_CHECK: 'maybe', ENVIRONMENT: 'production' }), 'off');
  assert.equal(selfCheckMode({ SELF_CHECK: '' , ENVIRONMENT: 'production' }), 'off');
});

test('the bounds are the plan\'s numbers and are frozen', () => {
  // A tripwire, on purpose: each of these is a cost and honesty decision, so changing one needs a review.
  // REVIEWED in M4 (no vision): the three look bounds (forcedLooks 1, repairRounds 2, looksPerRun 6) went with the look; only the
  // audit's two rounds remain, and a look bound must not come back under another name.
  assert.deepEqual({ ...SELF_CHECK_LIMITS }, { auditRounds: 2 });
  assert.ok(Object.isFrozen(SELF_CHECK_LIMITS));
});
