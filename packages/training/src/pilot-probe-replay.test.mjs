import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { PILOT_DIAGNOSTIC_CASES as registry } from './pilot-diagnostic-cases.mjs';
import { probeSavedResponse, verifyProbeReference, stableExecution } from './pilot-probe-replay.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
const example = id => ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === id);
const fenced = source => '```luau\n' + source + '\n```';
const probes = (family, ...ids) => ids.map(id => registry[family].find(p => p.id === id));
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'mutation needs one unique site');
  return source.replace(before, after);
}

test('all 60 independent probes pass their unchanged authored references in Luau', async () => {
  let total = 0;
  for (const [id, cases] of Object.entries(registry)) total += (await verifyProbeReference(example(id), cases)).passed;
  assert.equal(total, 60); // Reviewed probe inventory, not a model performance target.
});

test('incorrect probe expectation fails the reference-control gate', async () => {
  const [p] = probes('weighted-selection', 'lower-endpoint');
  await assert.rejects(verifyProbeReference(example('weighted-selection'), [{ ...p, expected: 2 }]), /probe reference failed/);
});

test('boundary mutant fails both internal boundary and zero-weight cases; restoration passes', async () => {
  const e = example('weighted-selection');
  const cases = probes(e.id, 'first-internal-boundary', 'zero-weight-prefix');
  const bad = await probeSavedResponse(fenced(replaceOnce(e.source, ...e.mutation)), cases);
  assert.equal(bad.counts['wrong-result'], 2);
  assert.equal((await probeSavedResponse(fenced(e.source), cases)).counts.pass, 2);
});

test('removing the below-capacity predicate produces a measured wrong value', async () => {
  const e = example('team-balance');
  const source = replaceOnce(e.source, 'load < capacity and (chosen == nil', '(chosen == nil');
  const cases = probes(e.id, 'all-full');
  const bad = await probeSavedResponse(fenced(source), cases);
  assert.equal(bad.cases[0].outcome, 'wrong-result');
  assert.equal(bad.cases[0].actual, 'number:1');
  assert.equal((await probeSavedResponse(fenced(e.source), cases)).counts.pass, 1);
});

test('frozen weighted checks miss integer-only weights; the supplemental probe closes that coverage gap', async () => {
  const e = example('weighted-selection');
  const mutant = replaceOnce(e.source, 'or weight < 0 then return nil end',
    'or weight < 0 or weight % 1 ~= 0 then return nil end');
  // The historical contract stays frozen. This passing mutant demonstrates an actual blind spot.
  assert.equal((await checkCandidate(e, fenced(mutant))).passed, true);
  const cases = probes(e.id, 'fractional-weights');
  const bad = await probeSavedResponse(fenced(mutant), cases);
  assert.equal(bad.cases[0].outcome, 'wrong-result');
  assert.equal(bad.cases[0].actual, 'nil:nil');
  assert.equal((await probeSavedResponse(fenced(e.source), cases)).counts.pass, 1);
});

test('frozen team checks miss unsafe capacity; the supplemental probe closes that coverage gap', async () => {
  const e = example('team-balance');
  const mutant = replaceOnce(e.source, ' and math.abs(value) <= 9007199254740991', '');
  assert.equal((await checkCandidate(e, fenced(mutant))).passed, true);
  const cases = probes(e.id, 'unsafe-capacity');
  const bad = await probeSavedResponse(fenced(mutant), cases);
  assert.equal(bad.cases[0].outcome, 'wrong-result');
  assert.equal(bad.cases[0].actual, 'number:1');
  assert.equal((await probeSavedResponse(fenced(e.source), cases)).counts.pass, 1);
});

test('a wrong value and an exception cannot suppress later cases', async () => {
  const source = 'return function(weights) if type(weights) ~= "table" then error("invalid type") end return 1 end';
  const result = await probeSavedResponse(fenced(source), probes('weighted-selection', 'first-internal-boundary', 'number-array', 'lower-endpoint'));
  assert.deepEqual(result.cases.map(c => c.outcome), ['wrong-result', 'runtime-error', 'pass']);
  assert.equal(result.complete, true);
});

test('each probe runs in a fresh process with fresh module state', async () => {
  const [p] = probes('weighted-selection', 'lower-endpoint');
  const source = 'local count = 0\nreturn function() count += 1 return count end';
  const result = await probeSavedResponse(fenced(source), [p, { ...p, id: 'fresh-state' }]);
  assert.equal(result.counts.pass, 2);
});

test('format/context rejection, module type failure and unexpected stdout remain failures', async () => {
  const cases = probes('weighted-selection', 'lower-endpoint');
  for (const [response, outcome] of [
    ['not code', 'format'], [fenced('return function() return unknownState end'), 'parse-or-context'],
    [fenced('return {}'), 'runtime-error'], [fenced('print("unexpected")\nreturn function() return 1 end'), 'unobserved'],
  ]) assert.equal((await probeSavedResponse(response, cases)).cases[0].outcome, outcome);
});

test('refusal, missing runtime, kill and truncated execution cannot produce observations', async () => {
  const cases = probes('weighted-selection', 'lower-endpoint');
  for (const reason of ['refused:policy', 'spawn_failed', 'wall_clock', 'memory', 'output_limit', 'unknown']) {
    const result = await probeSavedResponse('', cases, async () => ({ passed: false, reason, exitCode: null }));
    assert.equal(result.cases[0].outcome, 'unobserved');
    assert.equal(result.cases[0].actual, null);
    assert.equal(result.complete, false);
  }
  assert.equal(stableExecution({ passed: true, reason: 'wall_clock', exitCode: null }).passed, false);
  assert.equal(stableExecution({ passed: true }).passed, false);
});

test('finite probe limits and scalar expectations fail closed before executing', async () => {
  const [p] = probes('weighted-selection', 'lower-endpoint');
  const never = async () => { throw Error('must not execute'); };
  for (const cases of [[], Array(65).fill(p), [p, p]]) await assert.rejects(probeSavedResponse('', cases, never), /bounded unique/);
  for (const expected of [undefined, {}, Infinity, NaN, 'code']) await assert.rejects(probeSavedResponse('', [{ ...p, expected }], never), /invalid probe/);
});

test('repeat replay preserves deterministic values while excluding volatile paths/timing', async () => {
  const source = fenced('return function(weights) local n = #weights return 1 end');
  const cases = probes('weighted-selection', 'first-internal-boundary', 'number-array');
  assert.deepEqual(await probeSavedResponse(source, cases), await probeSavedResponse(source, cases));
});
