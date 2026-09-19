import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_EXTENSION } from './game-logic-curriculum-extension.mjs';
import { UI_LOGIC_CURRICULUM } from './ui-logic-curriculum.mjs';
import { CONTRACT_GENERALIZATION_CURRICULUM } from './contract-generalization-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_D } from './game-logic-curriculum-d.mjs';
import { buildGameLogic, verifyExample } from './build-game-logic.mjs';

const PRIOR = [
  ...GAME_LOGIC_CURRICULUM,
  ...GAME_LOGIC_CURRICULUM_EXTENSION,
  ...UI_LOGIC_CURRICULUM,
  ...CONTRACT_GENERALIZATION_CURRICULUM,
];

test('curriculum D adds at least twenty-four families disjoint from every existing curriculum', () => {
  assert.ok(GAME_LOGIC_CURRICULUM_D.length >= 24, `only ${GAME_LOGIC_CURRICULUM_D.length} examples`);
  const priorIds = new Set(PRIOR.map((example) => example.id));
  const priorFamilies = new Set(PRIOR.map((example) => example.family));
  const priorSources = new Set(PRIOR.map((example) => example.source));
  const ids = new Set();
  const families = new Set();
  for (const example of GAME_LOGIC_CURRICULUM_D) {
    assert.match(example.id, /^[a-z][a-z0-9-]+$/);
    assert.match(example.family, /^[a-z][a-z0-9-]+$/);
    assert.equal(priorIds.has(example.id), false, `${example.id} duplicates an existing id`);
    assert.equal(priorFamilies.has(example.family), false, `${example.family} duplicates an existing family`);
    assert.equal(priorSources.has(example.source), false, `${example.id} duplicates an existing answer`);
    assert.equal(ids.has(example.id), false, `${example.id} is repeated`);
    assert.equal(families.has(example.family), false, `${example.family} is repeated`);
    ids.add(example.id);
    families.add(example.family);
  }
  assert.equal(families.size, GAME_LOGIC_CURRICULUM_D.length, 'every example must carry its own family');
});

test('every curriculum D example states its contract and its validation in the prompt', () => {
  for (const example of GAME_LOGIC_CURRICULUM_D) {
    assert.match(example.prompt, /^Write a standalone Luau module returning [a-z][A-Za-z]*\(/, example.id);
    assert.match(example.prompt, /not a RemoteEvent handler or persistent save\.$/, example.id);
    // Every answer documents a return value for rejected input rather than erroring on it.
    assert.match(example.prompt, /returns? nil|returns? false/i, example.id);
    assert.equal(example.mutation.length, 2, example.id);
    assert.notEqual(example.mutation[0], example.mutation[1], example.id);
    assert.equal(example.source.split(example.mutation[0]).length, 2, `${example.id}: mutation site is not unique`);
  }
});

test('every curriculum D answer runs in Luau and its semantic mutant fails an assertion', () => {
  for (const example of GAME_LOGIC_CURRICULUM_D) {
    const evidence = verifyExample(example);
    assert.equal(evidence.executor, 'local-luau-cli', example.id);
    assert.equal(evidence.scope, 'engine-independent-game-logic', example.id);
    assert.equal(evidence.behaviorPassed, true, example.id);
    assert.equal(evidence.mutationRejected, true, example.id);
    assert.equal(evidence.studioVerified, false, example.id);
  }
});

test('curriculum D cannot be accepted with a non-behavioral check or a missing executor', () => {
  for (const example of GAME_LOGIC_CURRICULUM_D) {
    // A green run above is only evidence if a weakened check would have been caught here.
    assert.throws(() => verifyExample({ ...example, checks: 'assert(true)' }), /mutation was not detected/, example.id);
  }
  assert.throws(
    () => verifyExample(GAME_LOGIC_CURRICULUM_D[0], { binary: '/does-not-exist/apple-luau' }),
    /executable checks failed/,
  );
});

test('curriculum D assembles against the evaluation guard without public-task overlap', () => {
  const dataset = buildGameLogic({ examples: GAME_LOGIC_CURRICULUM_D });
  assert.equal(dataset.card.examples, GAME_LOGIC_CURRICULUM_D.length);
  assert.equal(dataset.card.productionTrainingReady, false);
  assert.equal(dataset.card.trainedModel, false);
  assert.equal(dataset.card.customerData, false);
  assert.equal(dataset.card.studioTrajectories, 0);
  const sizes = dataset.card.splitSizes;
  assert.equal(sizes.train + sizes.val + sizes.test, GAME_LOGIC_CURRICULUM_D.length);
  for (const split of ['train', 'val', 'test']) assert.ok(sizes[split] > 0, `${split} split is empty`);
});

test('curriculum D assembles alongside every existing curriculum', () => {
  const dataset = buildGameLogic({ examples: [...PRIOR, ...GAME_LOGIC_CURRICULUM_D] });
  assert.equal(dataset.card.examples, PRIOR.length + GAME_LOGIC_CURRICULUM_D.length);
  assert.equal(Object.keys(dataset.card.families).length, PRIOR.length + GAME_LOGIC_CURRICULUM_D.length
    - (PRIOR.length - new Set(PRIOR.map((example) => example.family)).size));
});
