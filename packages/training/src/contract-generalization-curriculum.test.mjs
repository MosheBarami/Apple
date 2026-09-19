import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONTRACT_GENERALIZATION_CURRICULUM, CONTRACT_GENERALIZATION_SPLITS } from './contract-generalization-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_EXTENSION } from './game-logic-curriculum-extension.mjs';
import { UI_LOGIC_CURRICULUM } from './ui-logic-curriculum.mjs';
import { buildGameLogic, verifyExample, ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';

const priorExamples = [...GAME_LOGIC_CURRICULUM, ...GAME_LOGIC_CURRICULUM_EXTENSION, ...UI_LOGIC_CURRICULUM];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('the bounded extension contains two train and two untouched transfer families', () => {
  assert.equal(CONTRACT_GENERALIZATION_CURRICULUM.length, 4);
  assert.deepEqual(Object.values(CONTRACT_GENERALIZATION_SPLITS).sort(), ['test', 'test', 'train', 'train']);
  const priorIds = new Set(priorExamples.map((example) => example.id));
  const priorFamilies = new Set(priorExamples.map((example) => example.family));
  for (const example of CONTRACT_GENERALIZATION_CURRICULUM) {
    assert.equal(priorIds.has(example.id), false, example.id);
    assert.equal(priorFamilies.has(example.family), false, example.family);
    assert.equal(verifyExample(example).behaviorPassed, true, example.id);
  }
});

test('v4 preserves every reviewed-v3 row and keeps new transfer answers outside train', () => {
  const priorCard = JSON.parse(readFileSync(new URL('../data/game-logic-seeds-v3-reviewed/dataset-card.json', import.meta.url), 'utf8'));
  const current = buildGameLogic({ previousCard: priorCard, newFamilySplits: CONTRACT_GENERALIZATION_SPLITS });
  // PRESERVATION, NOT SIZE. These were `examples === 28` and `splitSizes === {20,3,5}` — the
  // shape of the v4 build on the day it was written. They went red the moment the curriculum
  // grew, which is what this repository keeps asking it to do; a guard that fires because the
  // dataset got bigger is measuring the wrong thing. The claim in the test's own name is that
  // v4's rows are PRESERVED, so that is what is asserted now: nothing the aggregate curriculum
  // contains is dropped, and the families v4 froze still split exactly 20/3/5 however many
  // families are added beside them. True at 28, true at 53, true at 500.
  assert.equal(current.card.examples, ALL_GAME_LOGIC_CURRICULUM.length, 'the build dropped an example');
  const v4Families = new Set([...Object.keys(priorCard.families), ...Object.keys(CONTRACT_GENERALIZATION_SPLITS)]);
  const v4Sizes = Object.fromEntries(Object.entries(current.splits).map(
    ([split, rows]) => [split, rows.filter((row) => v4Families.has(row.meta.family)).length]));
  assert.deepEqual(v4Sizes, { train: 20, val: 3, test: 5 }, 'v4\'s own rows moved between splits');
  assert.equal(current.card.lineage.previousDigest, priorCard.digest);
  assert.equal(current.card.lineage.preservedFamilies, 24);
  for (const [family, split] of Object.entries(priorCard.families)) assert.equal(current.card.families[family], split, family);
  for (const [family, split] of Object.entries(CONTRACT_GENERALIZATION_SPLITS)) assert.equal(current.card.families[family], split, family);

  const trainIds = new Set(current.splits.train.map((row) => row.meta.id));
  const testIds = new Set(current.splits.test.map((row) => row.meta.id));
  assert.equal(trainIds.has('session-window'), true);
  assert.equal(trainIds.has('dense-sample-mean'), true);
  assert.equal(trainIds.has('meter-band'), false);
  assert.equal(trainIds.has('compact-under-ceiling'), false);
  assert.equal(testIds.has('meter-band'), true);
  assert.equal(testIds.has('compact-under-ceiling'), true);
});

test('the new train and transfer families contain no identical prompt or answer text', () => {
  const train = CONTRACT_GENERALIZATION_CURRICULUM.filter((example) => CONTRACT_GENERALIZATION_SPLITS[example.family] === 'train');
  const testRows = CONTRACT_GENERALIZATION_CURRICULUM.filter((example) => CONTRACT_GENERALIZATION_SPLITS[example.family] === 'test');
  for (const heldOut of testRows) {
    for (const trained of train) {
      assert.notEqual(heldOut.prompt, trained.prompt);
      assert.notEqual(heldOut.source, trained.source);
      assert.notEqual(heldOut.checks, trained.checks);
    }
  }
});

test('the preregistration freezes the dataset and holdout before any model training', () => {
  const preregistration = JSON.parse(readFileSync(new URL('../data/apple-max-contract-v4-preregistration-2026-09-18.json', import.meta.url), 'utf8'));
  const dataDirectory = new URL('../data/game-logic-seeds-v4-contract/', import.meta.url);
  assert.equal(preregistration.stateAtRegistration.trainingStarted, false);
  assert.equal(preregistration.intervention.datasetDigest, '1dbac25f80c5f0852d5a196d601f7dc48a8ce62bbd31528e9b992d8ef4f22e75');
  assert.deepEqual(preregistration.splitSizes, { train: 20, val: 3, test: 5 });
  for (const [name, expected] of Object.entries(preregistration.datasetFiles)) {
    assert.equal(sha256(readFileSync(new URL(name, dataDirectory))), expected, name);
  }

  const rows = readFileSync(new URL('test.jsonl', dataDirectory), 'utf8').trim().split('\n').map(JSON.parse);
  const byId = new Map(rows.map((row) => [row.meta.id, row]));
  assert.equal(byId.size, 5);
  for (const frozen of preregistration.holdout.rows) {
    const row = byId.get(frozen.id);
    assert.ok(row, frozen.id);
    assert.equal(row.meta.family, frozen.family, frozen.id);
    assert.equal(sha256(JSON.stringify(row)), frozen.rowSha256, frozen.id);
    assert.equal(sha256(row.messages.at(-2).content), frozen.promptSha256, frozen.id);
    assert.equal(sha256(row.messages.at(-1).content), frozen.answerSha256, frozen.id);
    assert.equal(row.meta.evidence.sourceSha256, frozen.sourceSha256, frozen.id);
    assert.equal(row.meta.evidence.checksSha256, frozen.checksSha256, frozen.id);
  }
  assert.equal(preregistration.developmentCandidateCriteria.productionPromotion, false);
  assert.equal(preregistration.budget.newAllocationMicros, 0);
});
