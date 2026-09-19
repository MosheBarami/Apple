import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { auditPilotEvaluationGaps, EVALUATION_GAP_MUTATIONS, mutateDiagnosticReference, DIAG_MISMATCH } from './pilot-evaluation-gap-audit.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const pass = () => ({ passed: true, reason: 'exit', exitCode: 0, stderr: '', durationMs: 123, engineVerified: false });
const mismatch = () => ({ passed: false, reason: 'exit', exitCode: 1,
  stderr: `program.luau:12: ${DIAG_MISMATCH}1\nstacktrace`, durationMs: 234, engineVerified: false });
const originalRejection = () => ({ passed: false, reason: 'exit', exitCode: 1,
  stderr: 'program.luau:12: assertion failed!\nstacktrace', durationMs: 234, engineVerified: false });

test('each deliberate mutation changes one reviewed reference and cannot be inert', () => {
  for (const mutation of EVALUATION_GAP_MUTATIONS) {
    const source = ALL_GAME_LOGIC_CURRICULUM.find(row => row.id === mutation.family).source;
    assert.notEqual(hash(mutateDiagnosticReference(source, mutation)), hash(source));
    assert.throws(() => mutateDiagnosticReference(source + '\n' + mutation.before, mutation), /exactly one/);
    assert.throws(() => mutateDiagnosticReference('', mutation), /exactly one/);
    assert.throws(() => mutateDiagnosticReference(source, { ...mutation, after: mutation.before }), /non-inert/);
  }
  assert.throws(() => mutateDiagnosticReference('source', { before: '', after: 'replacement' }), /non-inert/);
});

test('local references pass; supplemental assertions reject every executable semantic mutant', async () => {
  const report = await auditPilotEvaluationGaps();
  assert.ok(report.reviewedMutations > 0);
  assert.equal(report.supplementalMutationRejections, report.reviewedMutations);
  assert.equal(report.originalCoverageGapsObserved, report.observations.filter(row => row.originalCheckMissesMutant).length);
  for (const row of report.observations) {
    assert.equal(row.referenceOriginal.passed, true);
    assert.equal(row.referenceDiagnostic.passed, true);
    assert.equal(row.mutantDiagnostic.passed, false);
    assert.equal(row.mutantDiagnostic.classification, 'wrong-result');
    assert.equal(row.mutantDiagnostic.exitCode, 1);
    assert.ok(row.mutantDiagnostic.observed !== null);
    assert.notEqual(row.referenceSourceSha256, row.mutantSourceSha256);
    // Do NOT pin originalCheckMissesMutant=true: fixing the old checker must stay green.
    assert.equal(typeof row.originalCheckMissesMutant, 'boolean');
  }
  assert.equal(report.productionPromotion, false);
  assert.equal(report.trainingStarted, false);
  assert.equal(report.providerSpendUsd, 0);
  assert.equal(report.studioVerified, false);
});

test('reference failure prevents any coverage claim', async () => {
  await assert.rejects(auditPilotEvaluationGaps({ check: async () => originalRejection() }), /reference did not pass/);
});

test('missing interpreter, resource limits, refusal and invalid result cannot mint behavioral evidence', async () => {
  for (const result of [
    null, {}, { ...pass(), reason: 'spawn_failed' }, { ...pass(), reason: 'wall_clock' },
    { ...pass(), reason: 'memory' }, { ...pass(), reason: 'output_limit' },
    { ...pass(), reason: 'refused:policy' }, { ...pass(), exitCode: 1 },
    { ...pass(), stderr: 'unexplained output' }, { ...pass(), passed: false },
  ]) {
    let calls = 0;
    await assert.rejects(auditPilotEvaluationGaps({ check: async () => { calls++; return result; } }), /unverified/);
    assert.equal(calls, 1);
  }
});

test('a killed mutant is not a rejected semantic mutation', async () => {
  let calls = 0;
  await assert.rejects(auditPilotEvaluationGaps({ check: async () => {
    calls++;
    return calls === 4 ? { ...mismatch(), reason: 'wall_clock' } : pass();
  } }), /unverified/);
  assert.equal(calls, 4);
});

test('a passing mutant makes its diagnostic fail, not a fabricated closure', async () => {
  let calls = 0;
  await assert.rejects(auditPilotEvaluationGaps({ check: async () => { calls++; return pass(); } }), /did not reject/);
  assert.equal(calls, 4);
});

test('a parse/runtime error in a mutant is not proof that the assertion detected the defect', async () => {
  let calls = 0;
  await assert.rejects(auditPilotEvaluationGaps({ check: async () => {
    calls++;
    return calls === 4 ? { ...mismatch(), stderr: 'program.luau:1: expected an expression' } : pass();
  } }), /unverified/);
  assert.equal(calls, 4);
});

test('an unrelated failing assertion cannot stand in for the named diagnostic', async () => {
  let calls = 0;
  await assert.rejects(auditPilotEvaluationGaps({ check: async () => {
    calls++;
    return calls === 4 ? originalRejection() : pass();
  } }), /did not reject/);
  assert.equal(calls, 4);
});

test('strengthening the original evaluator is an improvement, not a regression', async () => {
  let calls = 0;
  const report = await auditPilotEvaluationGaps({ check: async () => {
    calls++;
    return calls % 4 === 0 ? mismatch() : calls % 4 === 3 ? originalRejection() : pass();
  } });
  assert.equal(report.originalCoverageGapsObserved, 0);
  assert.equal(report.supplementalMutationRejections, EVALUATION_GAP_MUTATIONS.length);
  assert.equal(calls, EVALUATION_GAP_MUTATIONS.length * 4);
});

test('actual local gap reports are deterministic and make no fetch calls', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('network is prohibited'); };
  try {
    const first = await auditPilotEvaluationGaps();
    const second = await auditPilotEvaluationGaps();
    assert.deepEqual(first, second);
    assert.equal(calls, 0);
    assert.doesNotMatch(JSON.stringify(first), /apple-sandbox-|durationMs/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('CLI rejects training and other unexpected arguments before local evaluation', () => {
  const result = spawnSync(process.execPath, [new URL('./pilot-evaluation-gap-audit.mjs', import.meta.url).pathname, '--train'],
    { encoding: 'utf8', timeout: 10_000, maxBuffer: 16_384 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage:/);
  assert.equal(result.stdout, '');
});
