import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extractJson, judge, TOPICS } from './synthesize-game-logic.mjs';
import { loadEvalGuard } from './audit-dataset.mjs';

const guard = loadEvalGuard();
const good = {
  prompt: 'Write a standalone Luau module returning add(a, b) for finite numbers; return nil otherwise.',
  source: 'return function(a, b)\n  if type(a) ~= "number" or type(b) ~= "number" then return nil end\n  return a + b\nend',
  checks: 'assert(candidate(2, 3) == 5)\nassert(candidate("x", 1) == nil)',
  mutation: ['a + b', 'a - b'],
};

test('the evaluation guard is loaded, or the overlap gate checks nothing', () => {
  assert.ok(guard.taskCount > 0);
  assert.ok(TOPICS.length >= 50);
});

test('extractJson finds the object inside prose and fences, and refuses broken JSON', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a": "}{", "b": {"c": 1}}\n```'), { a: '}{', b: { c: 1 } });
  assert.equal(extractJson('no object here'), null);
  assert.equal(extractJson('{"a": 1,}'), null);
});

test('a real luau-verified example is accepted; each gate rejects its own defect', () => {
  assert.equal(judge(good, guard), null);
  assert.equal(judge({ ...good, checks: undefined }, guard), 'missing_fields');
  assert.equal(judge({ ...good, mutation: ['a + b'] }, guard), 'bad_mutation_shape');
  assert.equal(judge({ ...good, checks: 'print(candidate(1, 2))' }, guard), 'no_asserts');
  assert.equal(judge({ ...good, source: 'return function(a, b) return a + b + undefinedCounter end' }, guard), 'context_dependent');
  // A mutation no assert catches is a check that does not pin the behaviour.
  assert.match(judge({ ...good, checks: 'assert(candidate("x", 1) == nil)' }, guard), /^verify:/);
});

test('a draft copying an evaluation task is dropped before it is executed', () => {
  const task = [...guard.shingles][0];
  assert.ok(task, 'guard has no shingles');
  let executed = false;
  const reason = judge({ ...good, prompt: `${good.prompt} ${task}` }, guard, () => { executed = true; });
  assert.equal(reason, 'evaluation_overlap');
  assert.equal(executed, false);
});

// The data directories are gitignored (.gitignore: packages/training/data/*/*); the set itself is in
// the private HF dataset moshebarami/apple-roblox-corpus. A checkout without it has nothing to re-verify.
const SYNTH = new URL('../data/game-logic-synth-v1/examples.json', import.meta.url);
test('every accepted synthetic example still passes the gate it was admitted by', { skip: !existsSync(SYNTH) && 'synthetic set not present in this checkout' }, () => {
  const accepted = JSON.parse(readFileSync(SYNTH, 'utf8'));
  assert.ok(accepted.length > 0);
  for (const ex of accepted) assert.equal(judge(ex, guard), null, ex.id);
});
