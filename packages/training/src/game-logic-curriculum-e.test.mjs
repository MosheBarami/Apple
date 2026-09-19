import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_LOGIC_CURRICULUM_E } from './game-logic-curriculum-e.mjs';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_EXTENSION } from './game-logic-curriculum-extension.mjs';
import { UI_LOGIC_CURRICULUM } from './ui-logic-curriculum.mjs';
import { CONTRACT_GENERALIZATION_CURRICULUM } from './contract-generalization-curriculum.mjs';
import { buildGameLogic, verifyExample } from './build-game-logic.mjs';

const priorExamples = [
  ...GAME_LOGIC_CURRICULUM,
  ...GAME_LOGIC_CURRICULUM_EXTENSION,
  ...UI_LOGIC_CURRICULUM,
  ...CONTRACT_GENERALIZATION_CURRICULUM,
];

test('curriculum E is at least twenty-four interface, contract and data-shaping families', () => {
  assert.ok(GAME_LOGIC_CURRICULUM_E.length >= 24, `only ${GAME_LOGIC_CURRICULUM_E.length} examples`);
  const families = new Set(GAME_LOGIC_CURRICULUM_E.map((example) => example.family));
  assert.equal(families.size, GAME_LOGIC_CURRICULUM_E.length, 'every example must carry its own family');
});

test('no id, family or answer collides with an existing curriculum or with a sibling', () => {
  const priorIds = new Set(priorExamples.map((example) => example.id));
  const priorFamilies = new Set(priorExamples.map((example) => example.family));
  const priorSources = new Set(priorExamples.map((example) => example.source));
  const ids = new Set();
  const families = new Set();
  const sources = new Set();
  for (const example of GAME_LOGIC_CURRICULUM_E) {
    assert.match(example.id, /^[a-z][a-z0-9-]+$/, example.id);
    assert.match(example.family, /^[a-z][a-z0-9-]+$/, example.family);
    assert.equal(priorIds.has(example.id), false, `${example.id} duplicates an existing id`);
    assert.equal(priorFamilies.has(example.family), false, `${example.family} duplicates an existing family`);
    assert.equal(priorSources.has(example.source), false, `${example.id} duplicates an existing answer`);
    assert.equal(ids.has(example.id), false, `${example.id} is repeated`);
    assert.equal(families.has(example.family), false, `${example.family} is repeated`);
    assert.equal(sources.has(example.source), false, `${example.id} repeats a sibling answer`);
    ids.add(example.id);
    families.add(example.family);
    sources.add(example.source);
  }
});

test('every prompt states the module contract and disclaims engine execution', () => {
  for (const example of GAME_LOGIC_CURRICULUM_E) {
    assert.match(example.prompt, /^Write a standalone Luau module returning [a-zA-Z]+\(/, example.id);
    assert.match(example.prompt, /not a RemoteEvent handler or persistent save/, example.id);
    assert.match(example.prompt, /returns? nil/i, `${example.id} must document its invalid-input value`);
    assert.match(example.checks, /candidate\(/, example.id);
  }
});

test('every answer executes in Luau and its one-site mutant is rejected by an assertion', () => {
  for (const example of GAME_LOGIC_CURRICULUM_E) {
    const [before, after] = example.mutation;
    assert.notEqual(before, after, example.id);
    assert.equal(example.source.split(before).length, 2, `${example.id}: mutation site is not unique`);
    const evidence = verifyExample(example);
    assert.equal(evidence.executor, 'local-luau-cli', example.id);
    assert.equal(evidence.scope, 'engine-independent-game-logic', example.id);
    assert.equal(evidence.behaviorPassed, true, example.id);
    assert.equal(evidence.mutationRejected, true, example.id);
    assert.equal(evidence.studioVerified, false, example.id);
  }
});

test('a check that asserts nothing behavioural cannot buy a passing verification', () => {
  for (const example of GAME_LOGIC_CURRICULUM_E.slice(0, 3)) {
    assert.throws(() => verifyExample({ ...example, checks: 'assert(true)' }), /mutation was not detected/, example.id);
  }
  assert.throws(
    () => verifyExample(GAME_LOGIC_CURRICULUM_E[0], { binary: '/does-not-exist/apple-luau' }),
    /executable checks failed/,
  );
});

test('curriculum E assembles against the evaluation guard with no public-task overlap', () => {
  const dataset = buildGameLogic({ examples: GAME_LOGIC_CURRICULUM_E });
  assert.equal(dataset.card.examples, GAME_LOGIC_CURRICULUM_E.length);
  assert.equal(Object.keys(dataset.card.families).length, GAME_LOGIC_CURRICULUM_E.length);
  assert.equal(dataset.card.customerData, false);
  assert.equal(dataset.card.studioTrajectories, 0);
  assert.equal(dataset.card.productionTrainingReady, false);
  assert.equal(dataset.card.trainedModel, false);
  const total = Object.values(dataset.card.splitSizes).reduce((sum, size) => sum + size, 0);
  assert.equal(total, GAME_LOGIC_CURRICULUM_E.length);
  for (const size of Object.values(dataset.card.splitSizes)) assert.ok(size > 0);
});

test('curriculum E extends the combined curriculum without disturbing existing families', () => {
  const old = buildGameLogic({ examples: priorExamples });
  const newFamilySplits = Object.fromEntries(
    GAME_LOGIC_CURRICULUM_E.map((example, index) => [example.family, ['train', 'train', 'train', 'val', 'test'][index % 5]]),
  );
  const current = buildGameLogic({
    examples: [...priorExamples, ...GAME_LOGIC_CURRICULUM_E],
    previousCard: old.card,
    newFamilySplits,
  });
  assert.equal(current.card.examples, old.card.examples + GAME_LOGIC_CURRICULUM_E.length);
  assert.equal(current.card.lineage.previousDigest, old.card.digest);
  for (const [family, split] of Object.entries(old.card.families)) {
    assert.equal(current.card.families[family], split, family);
  }
  for (const [family, split] of Object.entries(newFamilySplits)) {
    assert.equal(current.card.families[family], split, family);
  }
  for (const split of ['train', 'val', 'test']) {
    for (const row of old.splits[split]) {
      assert.deepEqual(current.splits[split].find((r) => r.meta.id === row.meta.id), row, row.meta.id);
    }
  }
});
