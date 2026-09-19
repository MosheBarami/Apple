import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_TRAJECTORY_CURRICULUM_B } from './tool-trajectory-curriculum-b.mjs';
import { TOOL_TRAJECTORY_CURRICULUM } from './tool-trajectory-curriculum.mjs';
import { loadRegistry, verifyTrajectory, applyMutation } from './tool-trajectory-verify.mjs';

/**
 * Batch B's standing proof, and the reason the second test is not optional.
 *
 * "Every seed verifies" is a sentence a validator that returns `ok` for everything would also
 * satisfy, which is why the mutation test is here: it requires every seed's declared mutation to
 * turn the validator red, so a green first test means the validator was watched failing on this
 * exact data rather than merely watched passing.
 *
 * Two tests exist here that batch A has no need of. Batch B was written because the registry
 * offers fifty-nine tools and batch A exercises seventeen of them, so the thing that would make
 * this file pointless is B quietly restating A — the same families under new ids. That is checked
 * rather than asserted in a comment. And the mutation kinds are counted, because eighteen seeds
 * all mutated the same way would prove one arm of the validator eighteen times and the rest not
 * at all.
 */

const registry = await loadRegistry();

test('every batch B seed verifies against the live tool registry', async () => {
  const failures = [];
  for (const seed of TOOL_TRAJECTORY_CURRICULUM_B) {
    const result = await verifyTrajectory(seed, { registry });
    if (!result.ok) failures.push(`${seed.id}: ${result.problems.join('; ')}`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  assert.ok(TOOL_TRAJECTORY_CURRICULUM_B.length >= 16, `batch B has ${TOOL_TRAJECTORY_CURRICULUM_B.length} seeds`);
});

test('every batch B mutation turns the validator red', async () => {
  const silent = [];
  for (const seed of TOOL_TRAJECTORY_CURRICULUM_B) {
    const mutant = applyMutation(seed); // throws if the mutation does not land on an existing site
    const result = await verifyTrajectory(mutant, { registry });
    if (result.ok) silent.push(seed.id);
  }
  assert.deepEqual(silent, [], `these mutations proved nothing: ${silent.join(', ')}`);
});

test('batch B adds families and ids that batch A does not already have', () => {
  const aFamilies = new Set(TOOL_TRAJECTORY_CURRICULUM.map((s) => s.family));
  const aIds = new Set(TOOL_TRAJECTORY_CURRICULUM.map((s) => s.id));
  const repeatedFamilies = [];
  const repeatedIds = [];
  const seen = new Set();
  for (const seed of TOOL_TRAJECTORY_CURRICULUM_B) {
    if (aFamilies.has(seed.family)) repeatedFamilies.push(seed.family);
    if (aIds.has(seed.id)) repeatedIds.push(seed.id);
    assert.ok(!seen.has(seed.family), `${seed.id}: family "${seed.family}" appears twice inside batch B`);
    seen.add(seed.family);
  }
  assert.deepEqual(repeatedFamilies, [], 'batch B restates a family batch A already teaches');
  assert.deepEqual(repeatedIds, [], 'batch B reuses a batch A id');
});

test('batch B reaches tools batch A never calls', () => {
  const calledIn = (curriculum) => new Set(curriculum.flatMap((s) => s.trajectory.map((t) => t.tool)));
  const a = calledIn(TOOL_TRAJECTORY_CURRICULUM);
  const b = calledIn(TOOL_TRAJECTORY_CURRICULUM_B);
  const fresh = [...b].filter((tool) => !a.has(tool));
  // The point of the batch. A number rather than a boolean so that a future edit which quietly
  // narrows B back onto A's vocabulary fails here instead of passing as "still some overlap".
  assert.ok(fresh.length >= 15, `batch B only adds ${fresh.length} previously untrained tools: ${fresh.join(', ')}`);
});

test('the mutations exercise more than one arm of the validator', async () => {
  // Grouped by the validator's own wording, because that is the arm each one reaches. A batch
  // where every mutation produced "is not one of ..." would have tested the enum check eighteen
  // times and the plan reader, the spec executor and the typed-envelope check zero times.
  const arm = (problem) => {
    if (/is not one of/.test(problem)) return 'bad enum';
    if (/is blank/.test(problem)) return 'blank required string';
    if (/expected \w+, got/.test(problem)) return 'wrong type';
    if (/is not in the tool's schema/.test(problem)) return 'undeclared argument';
    if (/does not parse/.test(problem)) return 'broken Luau';
    // A spec case that cannot be COMPILED is its own arm, and saying so is the point. This test
    // went red when `runSpecCase` learned to tell a syntax error from a failed assert — the guard
    // firing because the code got better, which is the tell. The arm was added rather than the
    // assertion loosened: a reason this classifier cannot name is exactly what it must refuse.
    if (/does not compile/.test(problem)) return 'spec case that does not compile';
    if (/its own assertions fail/.test(problem)) return 'spec assertion that cannot hold';
    if (/plan validator refused it/.test(problem)) return 'plan the product refuses';
    if (/the trajectory never calls it/.test(problem)) return 'plan promising an uncalled tool';
    if (/typed envelope/.test(problem)) return 'broken property envelope';
    return 'other';
  };
  const arms = new Set();
  for (const seed of TOOL_TRAJECTORY_CURRICULUM_B) {
    const result = await verifyTrajectory(applyMutation(seed), { registry });
    for (const problem of result.problems) arms.add(arm(problem));
  }
  assert.ok(arms.size >= 8, `only ${arms.size} kinds of failure were provoked: ${[...arms].join(', ')}`);
  assert.ok(!arms.has('other'), 'a mutation failed for a reason this test cannot name — read it before trusting it');
});

test('every batch B plan ends in one of the five checks the product accepts', () => {
  const VERIFIERS = new Set(['run_and_check', 'run_spec', 'audit_build', 'check_composition', 'inspect_visually']);
  for (const seed of TOOL_TRAJECTORY_CURRICULUM_B) {
    const called = seed.trajectory.map((s) => s.tool);
    assert.ok(called.some((t) => VERIFIERS.has(t)), `${seed.id}: the run itself never checks its own work`);
  }
});

test('every batch B seed carries the fields a training row is built from', () => {
  const ids = new Set();
  for (const seed of TOOL_TRAJECTORY_CURRICULUM_B) {
    assert.ok(seed.id && !ids.has(seed.id), `duplicate or missing id: ${seed.id}`);
    ids.add(seed.id);
    assert.ok(seed.family, `${seed.id}: no family`);
    assert.ok(seed.mutation, `${seed.id}: no mutation, so its verification is unfalsifiable`);
    assert.ok(seed.prompt && seed.prompt.trim().length >= 12, `${seed.id}: prompt is not a real request`);
    assert.ok(seed.reply && seed.reply.trim().length >= 12, `${seed.id}: reply is missing or too short`);
  }
});
