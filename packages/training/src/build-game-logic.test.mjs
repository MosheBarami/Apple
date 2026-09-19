import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { ALL_GAME_LOGIC_CURRICULUM, buildGameLogic, verifyExample, writeGameLogic } from './build-game-logic.mjs';
import { loadEvalGuard } from './audit-dataset.mjs';

test('every original answer executes and its behavioral defect is caught', () => {
  assert.ok(GAME_LOGIC_CURRICULUM.length >= 10);
  for (const example of GAME_LOGIC_CURRICULUM) {
    const result = verifyExample(example);
    assert.equal(result.behaviorPassed, true, example.id);
    assert.equal(result.mutationRejected, true, example.id);
    assert.equal(result.studioVerified, false, example.id);
  }
});

test('a wrong answer, inert tests and absent executor cannot mint verification', () => {
  const example = GAME_LOGIC_CURRICULUM[0];
  assert.throws(() => verifyExample({ ...example, source: example.source.replace(...example.mutation), mutation: ['return balance - price', 'return balance + price'] }), /executable checks failed/);
  assert.throws(() => verifyExample({ ...example, checks: 'assert(true)' }), /mutation was not detected/);
  assert.throws(() => verifyExample(example, { binary: '/does-not-exist/apple-luau' }), /executable checks failed/);
});

test('unresolved dependencies and nonunique mutations are refused', () => {
  const example = GAME_LOGIC_CURRICULUM[0];
  assert.throws(() => verifyExample({ ...example, source: 'return function() return secretState.balance end' }), /missing context/);
  assert.throws(() => verifyExample({ ...example, mutation: ['nothing here', 'replacement'] }), /unique site/);
});

test('seed splits are family-disjoint, deterministic and explicitly not production training', () => {
  const first = buildGameLogic();
  const second = buildGameLogic();
  assert.deepEqual(first, second);
  assert.equal(first.card.examples, ALL_GAME_LOGIC_CURRICULUM.length);
  assert.equal(first.card.productionTrainingReady, false);
  assert.equal(first.card.customerData, false);
  assert.equal(first.card.studioTrajectories, 0);
  const families = new Map();
  for (const [split, rows] of Object.entries(first.splits)) {
    assert.ok(rows.length, split);
    for (const row of rows) {
      assert.ok(!families.has(row.meta.family) || families.get(row.meta.family) === split);
      families.set(row.meta.family, split);
      assert.equal(row.messages.map((m) => m.role).join(','), 'system,user,assistant');
      assert.equal(row.meta.evidence.studioVerified, false);
      assert.doesNotMatch(JSON.stringify(row.messages), /APPLE-CURRICULUM-PASS/);
    }
  }
});

test('missing or polluted evaluation guard refuses generation', () => {
  const guard = loadEvalGuard();
  assert.throws(() => buildGameLogic({ guard: { ...guard, shingles: new Set() } }), /evaluation guard/);
  assert.throws(() => buildGameLogic({ guard: { ...guard, parseErrors: ['bad task file'] } }), /evaluation guard/);
  const needle = GAME_LOGIC_CURRICULUM[0].prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
  assert.throws(() => buildGameLogic({ guard: { ...guard, shingles: new Set([...guard.shingles, needle]) } }), /overlap/);
});

test('duplicate examples and unproven or stale evidence fail closed', () => {
  assert.throws(() => buildGameLogic({ examples: [...GAME_LOGIC_CURRICULUM, GAME_LOGIC_CURRICULUM[0]] }), /duplicate/);
  assert.throws(() => buildGameLogic({ verify: () => ({ behaviorPassed: true }) }), /mismatched execution evidence/);
  const proof = verifyExample(GAME_LOGIC_CURRICULUM[0]);
  assert.throws(() => buildGameLogic({ verify: () => proof }), /mismatched execution evidence/);
  assert.throws(() => buildGameLogic({ verify: (example) => ({ ...verifyExample(example), studioVerified: true }) }), /mismatched execution evidence/);
});

test('artifacts preserve exact messages, provenance and refuse overwrite', () => {
  const parent = mkdtempSync(join(tmpdir(), 'apple-curriculum-output-test-'));
  try {
    const dataset = buildGameLogic();
    const output = writeGameLogic(join(parent, 'new-output'), dataset);
    for (const split of ['train', 'val', 'test']) {
      const stored = readFileSync(join(output, `${split}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(stored, dataset.splits[split]);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'dataset-card.json'), 'utf8')), dataset.card);
    assert.throws(() => writeGameLogic(output, dataset), /EEXIST/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
