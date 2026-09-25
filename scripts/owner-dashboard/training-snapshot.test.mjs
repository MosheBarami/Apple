import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trainingSnapshot } from './training-snapshot.mjs';

test('the training view distinguishes a valid best, unfinished work and invalid scores', () => {
  const repo = mkdtempSync(join(tmpdir(), 'apple-training-view-'));
  const dir = join(repo, 'packages/training/runs/forever');
  mkdirSync(dir, { recursive: true });
  const state = {
    best: { version: 5, scores: { trajectory: 17, gameLogic: 0, finish: 3, total: 20,
      n: { trajectory: 23, gameLogic: 8, finish: 7 } } },
    history: [
      { version: 5, status: 'seed', promoted: true, scores: stateBestScore() },
      { version: 20, status: 'eval_invalid', scores: { total: 24 } },
      { version: 22, status: 'started' },
    ],
  };
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
  const view = trainingSnapshot(repo);
  assert.deepEqual(view.best, { version: 5, passed: 20, total: 38 });
  assert.deepEqual(view.versions.map((v) => [v.version, v.status, v.passed]), [
    [22, 'started', null], [20, 'eval_invalid', null], [5, 'seed', 20],
  ]);
  assert.equal(view.versions[0].label, 'התחילה, טרם נמדדה');
  assert.equal(view.versions[1].label, 'מדידה לא תקפה');
  assert.equal(view.versions[2].label, 'נמדדה');

  state.history[2].adapterPath = 'adapters/apple-v22-best';
  state.history[2].valLoss = 0.807;
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
  const trained = trainingSnapshot(repo).versions[0];
  assert.equal(trained.label, 'האימון הסתיים, ציון בהמתנה');
  assert.equal(trained.passed, null, 'a validation loss is not a benchmark score');

  state.best = { version: 20, scores: { trajectory: 20, gameLogic: 1, finish: 3, total: 24,
    n: { trajectory: 23, gameLogic: 8, finish: 7 } } };
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
  assert.equal(trainingSnapshot(repo).best, null,
    'an invalid version cannot appear as the current best even if state.best points to it');
});

function stateBestScore() {
  return { trajectory: 17, gameLogic: 0, finish: 3, total: 20,
    n: { trajectory: 23, gameLogic: 8, finish: 7 } };
}

test('a missing or malformed supervisor state is unknown, never an invented zero', () => {
  const repo = mkdtempSync(join(tmpdir(), 'apple-training-view-'));
  assert.equal(trainingSnapshot(repo), null);
  const dir = join(repo, 'packages/training/runs/forever');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), '{broken');
  assert.equal(trainingSnapshot(repo), null);
});

test('an active training version shows its last fresh step, never a benchmark score', () => {
  const repo = mkdtempSync(join(tmpdir(), 'apple-training-view-'));
  const dir = join(repo, 'packages/training/runs/forever');
  mkdirSync(dir, { recursive: true });
  const state = {
    best: { version: 5, scores: stateBestScore() },
    history: [
      { version: 5, status: 'seed', promoted: true, scores: stateBestScore() },
      { version: 23, status: 'started' },
    ],
  };
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
  writeFileSync(join(repo, 'packages/training/lora-apple-v23.yaml'), 'iters: 400\n');
  const log = join(dir, 'v23-train.log');
  writeFileSync(log, 'Iter 10: Train loss 1.0\nIter 125: Val loss 0.88\nIter 130: Train loss 0.45\n');
  const current = trainingSnapshot(repo).versions[0];
  assert.equal(current.label, 'דווח צעד 130 מתוך 400; הציון טרם נמדד');
  assert.equal(current.passed, null);

  const old = new Date(Date.now() - 20 * 60_000);
  utimesSync(log, old, old);
  assert.equal(trainingSnapshot(repo).versions[0].label, 'התחילה, טרם נמדדה');
});
