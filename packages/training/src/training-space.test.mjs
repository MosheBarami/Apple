import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderTrainingSpace } from './training-space.mjs';
import { promotedSpaceSnapshot } from './train-forever.mjs';

const template = readFileSync(fileURLToPath(new URL('../hf-space/index.html', import.meta.url)), 'utf8');
const snapshot = {
  version: 22,
  previousVersion: 5,
  scores: { trajectory: 17, gameLogic: 1, finish: 6, total: 24, n: { trajectory: 23, gameLogic: 8, finish: 7 } },
  previousScores: { trajectory: 17, gameLogic: 0, finish: 1, total: 18, n: { trajectory: 23, gameLogic: 8, finish: 7 } },
  measuredAt: '2026-09-25T03:42:00.000Z',
};

test('a promoted paired result renders a complete Space page without frontier or serving claims', () => {
  const html = renderTrainingSpace(snapshot, template);
  assert.match(html, /v22/);
  assert.match(html, /24 \/ 38/);
  assert.match(html, /18 \/ 38/);
  assert.match(html, /17\/23/);
  assert.match(html, /1\/8/);
  assert.match(html, /6\/7/);
  assert.match(html, /apple-lora\/tree\/main\/v22/);
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.match(html, /אינו ציון Frontier/);
});

test('the page advances when a new measured version is promoted', () => {
  const html = renderTrainingSpace({
    ...snapshot,
    version: 23,
    previousVersion: 22,
    scores: { ...snapshot.scores, trajectory: 18, total: 25 },
    previousScores: snapshot.scores,
  }, template);
  assert.match(html, /v23/);
  assert.match(html, /25 \/ 38/);
  assert.match(html, /v22 באותה הרצה/);
  assert.match(html, /apple-lora\/tree\/main\/v23/);
});

test('Space rendering rejects inconsistent or unmeasured scores', () => {
  assert.throws(() => renderTrainingSpace({ ...snapshot, scores: { ...snapshot.scores, total: 25 } }, template), /sum/);
  assert.throws(() => renderTrainingSpace({ ...snapshot, previousVersion: 22 }, template), /previous version/);
  assert.throws(() => renderTrainingSpace({ ...snapshot, scores: { ...snapshot.scores, gameLogic: 9 } }, template), /range/);
});

test('only a published promotion with matching paired rows can become a Space snapshot', () => {
  const n = { trajectory: 1, gameLogic: 1, finish: 1 };
  const tally = (trajectory) => ({
    adapter: {
      trajectory: { ok: trajectory, n: 1 },
      'game-logic': { ok: 0, n: 1 },
      finish: { ok: 1, n: 1 },
    },
    base: {
      trajectory: { ok: 0, n: 1 },
      'game-logic': { ok: 0, n: 1 },
      finish: { ok: 0, n: 1 },
    },
  });
  const rows = ['trajectory', 'game-logic', 'finish'].map((kind, i) => ({
    id: `row-${i}`, family: kind, kind, base: { passed: false },
  }));
  const candidate = { tally: tally(1), perRow: structuredClone(rows) };
  const best = { tally: tally(0), perRow: structuredClone(rows) };
  const entry = {
    version: 23, bestVersionAtRun: 22, status: 'done', promoted: true,
    scores: { trajectory: 1, gameLogic: 0, finish: 1, total: 2 },
    bestTotalAtRun: 1,
    publish: 'https://huggingface.co/moshebarami/apple-lora/tree/main/v23',
  };
  const state = { best: { version: 23 }, evalSet: { n } };
  const result = promotedSpaceSnapshot(entry, state, candidate, best, '2026-09-25T04:00:00Z');
  assert.equal(result.version, 23);
  assert.equal(result.previousScores.total, 1);
  assert.throws(() => promotedSpaceSnapshot({ ...entry, promoted: false }, state, candidate, best), /promotion/);
  assert.throws(() => promotedSpaceSnapshot({ ...entry, publish: entry.publish.replace('v23', 'v22') }, state, candidate, best), /published/);
  best.perRow[1].base.passed = true;
  assert.throws(() => promotedSpaceSnapshot(entry, state, candidate, best), /paired/);
});
