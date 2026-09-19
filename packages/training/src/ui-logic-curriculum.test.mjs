import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UI_LOGIC_CURRICULUM } from './ui-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { GAME_LOGIC_CURRICULUM_EXTENSION } from './game-logic-curriculum-extension.mjs';
import { verifyExample, buildGameLogic, preserveFamilySplits } from './build-game-logic.mjs';

test('all UI math references execute and their semantic mutants fail', () => {
  assert.equal(UI_LOGIC_CURRICULUM.length, 4);
  for (const example of UI_LOGIC_CURRICULUM) assert.equal(verifyExample(example).behaviorPassed, true);
});

test('UI data extends the verified curriculum without moving old train/validation/test families', () => {
  const old = buildGameLogic({ examples: [...GAME_LOGIC_CURRICULUM, ...GAME_LOGIC_CURRICULUM_EXTENSION] });
  const current = buildGameLogic({ examples: [...GAME_LOGIC_CURRICULUM, ...GAME_LOGIC_CURRICULUM_EXTENSION, ...UI_LOGIC_CURRICULUM],
    previousCard: old.card, newFamilySplits: {
    'ui-aspect-fitting': 'train', 'ui-grid-capacity': 'train',
    'ui-richtext-escaping': 'val', 'ui-viewport-window': 'test',
  } });
  assert.equal(current.card.examples, old.card.examples + UI_LOGIC_CURRICULUM.length);
  assert.deepEqual(current.card.splitSizes, { train: 18, val: 3, test: 3 });
  assert.equal(current.card.lineage.previousDigest, old.card.digest);
  assert.equal(current.card.lineage.preservedFamilies, Object.keys(old.card.families).length);
  for (const [family, split] of Object.entries(old.card.families)) assert.equal(current.card.families[family], split);
  for (const split of ['train', 'val', 'test']) {
    for (const row of old.splits[split]) assert.deepEqual(current.splits[split].find(r => r.meta.id === row.meta.id), row);
  }
  assert.equal(current.card.productionTrainingReady, false);
  assert.equal(current.card.studioTrajectories, 0);
});

test('previous holdouts cannot be reassigned, silently omitted, or given invalid split names', () => {
  const card = { digest: 'test', families: { prior: 'test' } };
  assert.throws(() => preserveFamilySplits({ prior: 1, added: 1 }, card, { prior: 'train' }), /cannot reassign/);
  assert.throws(() => preserveFamilySplits({ added: 1 }, card), /disappeared/);
  assert.throws(() => preserveFamilySplits({ prior: 1 }, { ...card, families: { prior: 'all' } }), /invalid previous split/);
  assert.throws(() => preserveFamilySplits({ prior: 1 }, {}), /invalid previous dataset card/);
  assert.throws(() => preserveFamilySplits({ prior: 1 }, card, { missing: 'test' }), /invalid new family/);
  assert.throws(() => preserveFamilySplits({ prior: 1, added: 1 }, card, { added: 'all' }), /invalid new family/);
});

test('the unfrozen control really contaminates the old holdout; explicit preservation prevents it', () => {
  const old = buildGameLogic({ examples: [...GAME_LOGIC_CURRICULUM, ...GAME_LOGIC_CURRICULUM_EXTENSION] });
  const fresh = buildGameLogic();
  assert.equal(old.card.families['team-balance'], 'test');
  assert.notEqual(fresh.card.families['team-balance'], old.card.families['team-balance'],
    'The regression control must actually move a held-out family');
  const preserved = buildGameLogic({ previousCard: old.card });
  assert.equal(preserved.card.families['team-balance'], 'test');
  assert.equal(preserved.card.families['weighted-selection'], old.card.families['weighted-selection']);
});

test('CLI never silently creates a fresh partition when history was omitted', () => {
  const path = fileURLToPath(new URL('./build-game-logic.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [path], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Choose exactly one: --previous-card/);
});
