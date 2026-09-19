#!/usr/bin/env node
/**
 * Falsify the diagnostic against defects the frozen development checks can miss.
 * Only executes first-party reference modules and explicitly labelled mutations locally.
 * Never edits examples, splits, historical checks, saved responses, weights, or reports.
 *
 * A check already rejecting a mutant is an improvement, not a test failure. What must remain
 * true is that the reference passes and the supplementary assertion rejects the wrong result.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fence = source => '```luau\n' + source + '\n```';
export const DIAG_MISMATCH = 'APPLE-GAP-MISMATCH actual=';

function compactGapResult(result) {
  const stderr = result.stderr.replace(/[^\s]*[\\/]program\.luau/g, 'program.luau').slice(0, 2000);
  const wrongResult = stderr.includes(DIAG_MISMATCH);
  return { passed: result.passed, reason: result.reason, exitCode: result.exitCode,
    classification: result.passed ? 'pass' : wrongResult ? 'wrong-result' : 'assertion-failure',
    observed: wrongResult ? stderr.split(DIAG_MISMATCH)[1].split('\n')[0] : null,
    stderr, engineVerified: false };
}

function counterexampleChecks(mutation) {
  const expected = mutation.expected === null ? 'nil' : String(mutation.expected);
  return `local actual = ${mutation.expression}\nassert(actual == ${expected}, "${DIAG_MISMATCH}" .. tostring(actual))`;
}

// Unique-site replacements are deliberate review tripwires: a changed reference must not silently
// turn a semantic mutation into an inert edit or a mutation at a different site. Not SFT records.
export const EVALUATION_GAP_MUTATIONS = Object.freeze([
  Object.freeze({
    id: 'weighted-integer-only-weights', family: 'weighted-selection', probeId: 'fractional-weights',
    expression: 'candidate({0.5, 1.5}, 0.25)', expected: 1,
    before: 'total += weight',
    after: 'if weight % 1 ~= 0 then return nil end\n        total += weight',
    violatedRequirement: 'Finite nonnegative weights may be fractional; they are not restricted to integers.',
  }),
  Object.freeze({
    id: 'weighted-metatable-accepted', family: 'weighted-selection', probeId: 'metatable-array',
    expression: 'candidate(setmetatable({1, 2}, {}), 0)', expected: null,
    before: ' or getmetatable(value) ~= nil', after: '',
    violatedRequirement: 'A plain array must not have a metatable.',
  }),
  Object.freeze({
    id: 'team-capacity-type-only', family: 'team-balance', probeId: 'fractional-capacity',
    expression: 'candidate({0, 1}, 3.5)', expected: null,
    before: 'not integer(capacity)', after: 'type(capacity) ~= "number"',
    violatedRequirement: 'Capacity must be a positive safe integer, not merely a positive number.',
  }),
]);

export function mutateDiagnosticReference(source, mutation) {
  if (typeof source !== 'string' || typeof mutation?.before !== 'string' || !mutation.before
    || typeof mutation.after !== 'string' || mutation.before === mutation.after) {
    throw new Error('a source and a non-inert explicit mutation are required');
  }
  if (source.split(mutation.before).length !== 2) throw new Error('diagnostic mutation requires exactly one reviewed site');
  return source.replace(mutation.before, () => mutation.after);
}

function measured(result, label) {
  // A timeout, missing interpreter, policy refusal, malformed result, or output-protocol error is
  // not a behavioral observation. In particular a nonzero exit without an assertion proves nothing
  // about coverage: the mutant might simply have stopped parsing.
  if (!result || typeof result.passed !== 'boolean' || result.reason !== 'exit'
    || !Number.isInteger(result.exitCode) || typeof result.stderr !== 'string'
    || (result.passed && (result.exitCode !== 0 || result.stderr !== ''))
    || (!result.passed && (result.exitCode <= 0 || !(/assertion failed/i.test(result.stderr) || result.stderr.includes(DIAG_MISMATCH))))) {
    throw new Error(`${label}: behavioral execution unverified`);
  }
  return result;
}

export async function auditPilotEvaluationGaps({ check = checkCandidate } = {}) {
  if (typeof check !== 'function') throw new Error('local checker required');
  const observations = [];
  for (const mutation of EVALUATION_GAP_MUTATIONS) {
    const example = ALL_GAME_LOGIC_CURRICULUM.find(row => row.id === mutation.family);
    if (!example) throw new Error(`missing reviewed reference: ${mutation.family}`);
    const probe = { id: mutation.probeId, expression: mutation.expression, expected: mutation.expected,
      checks: counterexampleChecks(mutation) };
    const mutatedSource = mutateDiagnosticReference(example.source, mutation);
    const diagnosticExample = { ...example, checks: probe.checks };

    const referenceOriginal = measured(await check(example, fence(example.source)), `${mutation.id}: reference original`);
    const referenceDiagnostic = measured(await check(diagnosticExample, fence(example.source)), `${mutation.id}: reference diagnostic`);
    if (!referenceOriginal.passed || !referenceDiagnostic.passed) throw new Error(`${mutation.id}: reference did not pass both checks`);

    const mutantOriginal = measured(await check(example, fence(mutatedSource)), `${mutation.id}: mutant original`);
    const mutantDiagnostic = measured(await check(diagnosticExample, fence(mutatedSource)), `${mutation.id}: mutant diagnostic`);
    if (mutantDiagnostic.passed || !mutantDiagnostic.stderr.includes(DIAG_MISMATCH)) {
      throw new Error(`${mutation.id}: supplemental assertion did not reject the wrong result`);
    }
    observations.push({
      id: mutation.id, family: mutation.family, violatedRequirement: mutation.violatedRequirement,
      referenceSourceSha256: hash(example.source), mutantSourceSha256: hash(mutatedSource),
      originalChecksSha256: hash(example.checks), diagnosticChecksSha256: hash(probe.checks),
      counterexample: { id: probe.id, expression: probe.expression, expected: probe.expected },
      originalCheckMissesMutant: mutantOriginal.passed,
      supplementalAssertionRejectsMutant: true,
      referenceOriginal: compactGapResult(referenceOriginal),
      referenceDiagnostic: compactGapResult(referenceDiagnostic),
      mutantOriginal: compactGapResult(mutantOriginal),
      mutantDiagnostic: compactGapResult(mutantDiagnostic),
    });
  }
  return {
    schema: 'apple-pilot-evaluation-gap-audit-v1',
    kind: 'supplemental-evaluation-falsification-not-training',
    reviewedMutations: observations.length,
    originalCoverageGapsObserved: observations.filter(row => row.originalCheckMissesMutant).length,
    supplementalMutationRejections: observations.length,
    observations,
    trainingStarted: false, providerSpendUsd: 0, productionPromotion: false, studioVerified: false,
    limitations: [
      'original composite checks and held-out family assignments remain unchanged',
      'these are exposed development counterexamples, not new training examples or independent holdouts',
      'coverage gaps do not invalidate the observed semantic failures or turn either pilot into a pass',
      'local reference/mutant execution only; no model generation, weight reload, or inference-quality claim',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error('usage: pilot-evaluation-gap-audit.mjs (no arguments; local execution only)');
  console.log(JSON.stringify(await auditPilotEvaluationGaps(), null, 2));
}
