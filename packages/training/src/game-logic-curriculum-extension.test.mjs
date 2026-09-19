import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_EXTENSION } from './game-logic-curriculum-extension.mjs';
import { buildGameLogic, verifyExample } from './build-game-logic.mjs';

test('the extension has ten new, independent game-logic families', () => {
  assert.equal(GAME_LOGIC_CURRICULUM_EXTENSION.length, 10);
  const originalIds = new Set(GAME_LOGIC_CURRICULUM.map((example) => example.id));
  const originalFamilies = new Set(GAME_LOGIC_CURRICULUM.map((example) => example.family));
  const ids = new Set();
  const families = new Set();
  for (const example of GAME_LOGIC_CURRICULUM_EXTENSION) {
    assert.match(example.id, /^[a-z][a-z0-9-]+$/);
    assert.match(example.family, /^[a-z][a-z0-9-]+$/);
    assert.equal(originalIds.has(example.id), false, `${example.id} duplicates an original id`);
    assert.equal(originalFamilies.has(example.family), false, `${example.family} duplicates an original family`);
    assert.equal(ids.has(example.id), false, `${example.id} is repeated`);
    assert.equal(families.has(example.family), false, `${example.family} is repeated`);
    ids.add(example.id);
    families.add(example.family);
  }
});

test('every extension answer runs in Luau and its semantic mutant fails an assertion', () => {
  for (const example of GAME_LOGIC_CURRICULUM_EXTENSION) {
    const evidence = verifyExample(example);
    assert.equal(evidence.executor, 'local-luau-cli', example.id);
    assert.equal(evidence.scope, 'engine-independent-game-logic', example.id);
    assert.equal(evidence.behaviorPassed, true, example.id);
    assert.equal(evidence.mutationRejected, true, example.id);
    assert.equal(evidence.studioVerified, false, example.id);
  }
});

test('the extension cannot be accepted with a non-behavioral check or a missing executor', () => {
  const example = GAME_LOGIC_CURRICULUM_EXTENSION[0];
  assert.throws(() => verifyExample({ ...example, checks: 'assert(true)' }), /mutation was not detected/);
  assert.throws(() => verifyExample(example, { binary: '/does-not-exist/apple-luau' }), /executable checks failed/);
});

test('the extension assembles against the evaluation guard without public-task overlap', () => {
  const dataset = buildGameLogic({ examples: GAME_LOGIC_CURRICULUM_EXTENSION });
  assert.equal(dataset.card.examples, 10);
  assert.equal(dataset.card.productionTrainingReady, false);
  assert.deepEqual(dataset.card.splitSizes, { train: 8, val: 1, test: 1 });
  assert.equal(dataset.card.customerData, false);
  assert.equal(dataset.card.studioTrajectories, 0);
});
