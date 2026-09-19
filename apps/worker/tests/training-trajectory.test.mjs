/**
 * The future trajectory capture is deliberately tested as an isolated prerequisite.
 * It has no SessionDO hook, no database access, and no production rows; these tests only prove
 * the boundaries a trusted consent/export integration will have to satisfy later.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MAX_CONSENT_AGE_MS,
  TRAJECTORY_LIMITS,
  TrajectoryStartError,
  createTrajectoryLedger,
} from '../src/training-trajectory.ts';

const OWNER = 'user_123';
const PROJECT = 'project_123';
const RUN = 'run_123';
const START = '2026-09-18T00:00:00.000Z';
const CALL_AT = '2026-09-18T00:00:01.000Z';
const FINISH = '2026-09-18T00:00:02.000Z';
const OBSERVED = '2026-09-18T00:00:03.000Z';

function grant(over = {}) {
  return {
    source: 'training_consent_events',
    trusted: true,
    grantId: 'grant_123',
    ownerId: OWNER,
    projectId: PROJECT,
    runId: RUN,
    optedIn: true,
    current: true,
    status: 'active',
    policyVersion: 'training-opt-in-v1',
    verifiedAt: START,
    checkedAt: START,
    ...over,
  };
}

function ledger(over = {}) {
  return createTrajectoryLedger({
    ownerId: OWNER,
    projectId: PROJECT,
    runId: RUN,
    startedAt: START,
    consentGrant: grant(),
    ...over,
  });
}

function call(over = {}) {
  return {
    callId: 'call_1',
    name: 'get_tree',
    arguments: { depth: 2 },
    result: { nodes: 1 },
    ok: true,
    observedAt: CALL_AT,
    durationMs: 12,
    ...over,
  };
}

function successfulOutcome(over = {}) {
  return {
    status: 'succeeded',
    complete: true,
    observed: true,
    verified: true,
    observedAt: OBSERVED,
    evidence: {
      source: 'studio-plugin',
      checks: ['post-run tree read matched the requested change'],
      details: { observedBy: 'typed-plugin-check' },
    },
    verifiedBy: 'studio-plugin',
    ...over,
  };
}

test('starting requires a fresh trusted grant bound to owner, project, and run', () => {
  assert.throws(
    () => createTrajectoryLedger({ ownerId: OWNER, projectId: PROJECT, runId: RUN, startedAt: START, consentGrant: undefined }),
    (error) => error instanceof TrajectoryStartError && error.code === 'consent_required',
  );
  assert.throws(
    () => ledger({ consentGrant: grant({ projectId: 'another_project' }) }),
    (error) => error instanceof TrajectoryStartError && error.code === 'consent_mismatch',
  );
  assert.throws(
    () => ledger({ consentGrant: grant({ verifiedAt: '2026-09-16T00:00:00.000Z', checkedAt: '2026-09-16T00:00:00.000Z' }) }),
    (error) => error instanceof TrajectoryStartError && error.code === 'consent_stale',
  );
  assert.throws(
    () => ledger({ consentGrant: grant({ expiresAt: START }) }),
    (error) => error instanceof TrajectoryStartError && error.code === 'consent_invalid',
  );
  assert.equal(DEFAULT_MAX_CONSENT_AGE_MS, 24 * 60 * 60 * 1000);
});

test('accepted calls are ordered, structured, explicit, and defensively copied', () => {
  const trajectory = ledger();
  const argumentsValue = { path: 'Workspace', includeProperties: true };
  const resultValue = { instances: [{ className: 'Part' }] };
  const accepted = trajectory.recordToolCall(call({ arguments: argumentsValue, result: resultValue }));
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.deepEqual(accepted.call, {
    index: 0,
    callId: 'call_1',
    name: 'get_tree',
    arguments: argumentsValue,
    result: resultValue,
    ok: true,
    observed: true,
    observedAt: CALL_AT,
    durationMs: 12,
  });
  argumentsValue.path = 'mutated-after-capture';
  resultValue.instances[0].className = 'Changed';
  accepted.call.arguments.path = 'mutated-return-value';
  const second = trajectory.recordToolCall(call({ callId: 'call_2', observedAt: '2026-09-18T00:00:01.500Z', ok: false, result: { error: 'not found' } }));
  assert.equal(second.ok, true);
  const snapshot = trajectory.snapshot();
  assert.equal(snapshot.toolTrace.length, 2);
  assert.equal(snapshot.toolTrace[0].index, 0);
  assert.equal(snapshot.toolTrace[1].index, 1);
  assert.equal(snapshot.toolTrace[0].arguments.path, 'Workspace');
  assert.equal(snapshot.toolTrace[0].result.instances[0].className, 'Part');
  assert.equal(snapshot.toolTrace[0].observed, true);
  assert.equal(snapshot.trainingReady, false);
});

test('finish requires explicit verifier evidence and never promotes assistant prose', () => {
  const noBoolean = ledger();
  assert.equal(noBoolean.recordToolCall(call()).ok, true);
  const inferred = noBoolean.finish({ finishedAt: FINISH, outcome: { ...successfulOutcome(), verified: undefined, assistantText: 'done' } });
  assert.equal(inferred.ok, false);
  if (!inferred.ok) assert.equal(inferred.code, 'outcome_invalid');
  assert.equal(noBoolean.snapshot().trainingReady, false);

  const assistantVerifier = ledger();
  assert.equal(assistantVerifier.recordToolCall(call()).ok, true);
  const unsafe = assistantVerifier.finish({ finishedAt: FINISH, outcome: successfulOutcome({ verifiedBy: 'assistant' }) });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) assert.equal(unsafe.code, 'outcome_invalid');

  const complete = ledger();
  assert.equal(complete.recordToolCall(call()).ok, true);
  const finished = complete.finish({ finishedAt: FINISH, outcome: successfulOutcome() });
  assert.equal(finished.ok, true);
  if (!finished.ok) return;
  assert.equal(finished.snapshot.closed, true);
  assert.equal(finished.snapshot.outcome?.verified, true);
  assert.equal(finished.snapshot.outcome?.verifiedBy, 'studio-plugin');
  assert.equal(finished.snapshot.trainingReady, false);
});

test('oversized structured input fails closed and marks the record truncated', () => {
  const trajectory = ledger();
  const tooLarge = trajectory.recordToolCall(call({ arguments: { source: 'x'.repeat(TRAJECTORY_LIMITS.maxTextChars + 1) } }));
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) {
    assert.equal(tooLarge.truncated, true);
    assert.equal(tooLarge.captureFailed, true);
  }
  const snapshot = trajectory.snapshot();
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.captureFailed, true);
  assert.equal(snapshot.closed, true);
  const later = trajectory.recordToolCall(call());
  assert.equal(later.ok, false);
  if (!later.ok) assert.equal(later.code, 'ledger_truncated');
  const finish = trajectory.finish({ finishedAt: FINISH, outcome: successfulOutcome() });
  assert.equal(finish.ok, false);
  if (!finish.ok) assert.equal(finish.code, 'ledger_truncated');
});

test('the final outcome is included in the size bound before the ledger closes', () => {
  const trajectory = ledger();
  const payload = 'x'.repeat(2200);
  for (let index = 0; index < 110; index += 1) {
    const observedAt = new Date(Date.parse(START) + (index + 1) * 1000).toISOString();
    const accepted = trajectory.recordToolCall(call({
      callId: `call_${index + 1}`,
      observedAt,
      arguments: { payload },
      result: { payload },
    }));
    assert.equal(accepted.ok, true, `bounded call ${index + 1} should fit before final evidence`);
  }
  const details = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`part${index}`, 'y'.repeat(30_000)]));
  const finished = trajectory.finish({
    finishedAt: '2026-09-18T00:02:00.000Z',
    outcome: successfulOutcome({ observedAt: '2026-09-18T00:02:01.000Z', evidence: { source: 'studio-plugin', checks: ['post-run check'], details } }),
  });
  assert.equal(finished.ok, false);
  if (!finished.ok) {
    assert.equal(finished.code, 'limit_exceeded');
    assert.equal(finished.truncated, true);
  }
  assert.equal(trajectory.snapshot().closed, true);
  assert.equal(trajectory.snapshot().truncated, true);
});

test('unsafe tools, non-finite JSON, duplicate IDs, and out-of-order observations are refused', () => {
  const unsafe = ledger();
  const unsafeResult = unsafe.recordToolCall(call({ name: 'run_code' }));
  assert.equal(unsafeResult.ok, false);
  if (!unsafeResult.ok) assert.equal(unsafeResult.code, 'unsafe_tool');

  const nonFinite = ledger();
  const nonFiniteResult = nonFinite.recordToolCall(call({ arguments: { value: Number.NaN } }));
  assert.equal(nonFiniteResult.ok, false);
  if (!nonFiniteResult.ok) assert.equal(nonFiniteResult.code, 'structured_value_invalid');

  const duplicate = ledger();
  assert.equal(duplicate.recordToolCall(call()).ok, true);
  const duplicateResult = duplicate.recordToolCall(call({ observedAt: '2026-09-18T00:00:01.500Z' }));
  assert.equal(duplicateResult.ok, false);
  if (!duplicateResult.ok) assert.equal(duplicateResult.code, 'duplicate_call');

  const ordered = ledger();
  assert.equal(ordered.recordToolCall(call()).ok, true);
  const outOfOrder = ordered.recordToolCall(call({ callId: 'call_2', observedAt: '2026-09-18T00:00:00.500Z' }));
  assert.equal(outOfOrder.ok, false);
  if (!outOfOrder.ok) assert.equal(outOfOrder.code, 'timestamp_order');
});
