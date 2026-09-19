import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_TRAJECTORY_CURRICULUM } from './tool-trajectory-curriculum.mjs';
import { loadRegistry, verifyTrajectory, applyMutation, runSpecCase, schemaProblems } from './tool-trajectory-verify.mjs';

/**
 * The trajectory track's standing proof.
 *
 * Both halves are here on purpose. "Every seed verifies" alone is the shape of assertion this
 * repository keeps getting caught by: it is equally true of a validator that returns `ok` for
 * everything. The second test is the one that makes the first mean something — it requires every
 * seed's declared mutation to actually turn the validator red, and it caught three seeds where it
 * did not, which is how the blank-argument rule and the spec-case executor came to exist.
 */

const registry = await loadRegistry();

test('every trajectory seed verifies against the live tool registry', async () => {
  const failures = [];
  for (const seed of TOOL_TRAJECTORY_CURRICULUM) {
    const result = await verifyTrajectory(seed, { registry });
    if (!result.ok) failures.push(`${seed.id}: ${result.problems.join('; ')}`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  assert.ok(TOOL_TRAJECTORY_CURRICULUM.length > 0, 'the curriculum is empty');
});

test('every seed mutation turns the validator red', async () => {
  const silent = [];
  for (const seed of TOOL_TRAJECTORY_CURRICULUM) {
    const mutant = applyMutation(seed); // throws if the mutation does not land on an existing site
    const result = await verifyTrajectory(mutant, { registry });
    if (result.ok) silent.push(seed.id);
  }
  assert.deepEqual(silent, [], `these mutations proved nothing: ${silent.join(', ')}`);
});

test('a mutation aimed at a path that is not there is refused rather than passing silently', () => {
  const seed = { id: 'x', mutation: { step: 0, path: 'items.0.nope', value: 1 }, trajectory: [{ tool: 'create_instances', args: { items: [{ className: 'Part' }] } }] };
  assert.throws(() => applyMutation(seed), /does not resolve to an existing value/);
});

test('the registry is the product\'s own, so an invented tool name cannot be built', async () => {
  const seed = {
    id: 'invented', prompt: 'do the thing please', reply: 'I did the thing, and here is what I saw.',
    trajectory: [{ tool: 'make_a_platform', args: {} }],
  };
  const result = await verifyTrajectory(seed, { registry });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /not in the live registry/);
});

test('a plan that promises a tool the run never calls is refused', async () => {
  const seed = {
    id: 'broken-promise', prompt: 'build me a platform please', reply: 'Built it and checked it.',
    trajectory: [
      { tool: 'propose_plan', args: { steps: [
        { title: 'A platform', tool: 'create_instances' },
        { title: 'Check it', tool: 'run_and_check' },
      ] } },
      { tool: 'run_and_check', args: { seconds: 5 } },
    ],
  };
  const result = await verifyTrajectory(seed, { registry });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /promises "create_instances" and the trajectory never calls it/);
});

test('a plan with no verification step is refused by the product\'s own validator', async () => {
  const seed = {
    id: 'no-check', prompt: 'build me a platform please', reply: 'Built it.',
    trajectory: [
      { tool: 'propose_plan', args: { steps: [{ title: 'A platform', tool: 'create_instances' }] } },
      { tool: 'create_instances', args: { items: [{ className: 'Part', name: 'P', parent: 'game.Workspace' }] } },
    ],
  };
  const result = await verifyTrajectory(seed, { registry });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /never checks its own work/);
});

test('a spec case is executed, not merely parsed', () => {
  const holds = runSpecCase('assert(1 + 1 == 2)');
  assert.deepEqual({ ran: holds.ran, passed: holds.passed }, { ran: true, passed: true });

  // Parses perfectly, cannot hold. Before the executor existed this was accepted as proof.
  const fails = runSpecCase('local function f(x) return x end\nassert(f(-5) == 0)');
  assert.deepEqual({ ran: fails.ran, passed: fails.passed }, { ran: true, passed: false });
});

test('a failure to run a spec case is not reported as a failing spec case', () => {
  const missing = runSpecCase('assert(true)', 'luau-definitely-not-installed');
  assert.equal(missing.ran, false);
  assert.equal(missing.passed, undefined, 'a case that never ran has no pass/fail verdict to report');
});

test('an argument the schema does not declare is refused', () => {
  const schema = { type: 'object', properties: { seconds: { type: 'number' } }, required: [] };
  assert.deepEqual(schemaProblems(schema, { seconds: 5 }, 'w'), []);
  assert.match(schemaProblems(schema, { seconds: 5, forever: true }, 'w').join(' '), /"forever" is not in the tool's schema/);
});

test('a blank required string is treated as not supplied, except where deletion means it', () => {
  const schema = { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] };
  assert.match(schemaProblems(schema, { fact: '   ' }, 'w').join(' '), /required argument "fact" is blank/);

  const edit = { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] };
  assert.deepEqual(schemaProblems(edit, { find: 'old line', replace: '' }, 'w.edits[0]'), [], 'an empty replace is how a line is deleted');
});

test('every seed carries the fields a training row is built from', () => {
  const ids = new Set();
  for (const seed of TOOL_TRAJECTORY_CURRICULUM) {
    assert.ok(seed.id && !ids.has(seed.id), `duplicate or missing id: ${seed.id}`);
    ids.add(seed.id);
    assert.ok(seed.family, `${seed.id}: no family`);
    assert.ok(seed.mutation, `${seed.id}: no mutation, so its verification is unfalsifiable`);
  }
});
