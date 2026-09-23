import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinTrajectorySplits } from './build-mlx-dataset.mjs';

// v5 adds trajectory families. The greedy splitter assigns every family against the running
// totals, so adding one moves others; without pinning, a v4 TEST family could land in v5 TRAIN and
// the base / v4 / v5 comparison on v4's held-out rows would be contaminated.
test('families v4 already placed keep their split; new families are split among themselves', () => {
  const rows = [];
  const add = (family, n) => { for (let i = 0; i < n; i++) rows.push({ family, step: i }); };
  add('old-a', 4); add('old-b', 3); add('old-c', 2);
  for (let f = 0; f < 12; f++) add(`new-${f}`, 4);
  const pinned = { 'old-a': 'test', 'old-b': 'train', 'old-c': 'val' };
  const { splits } = pinTrajectorySplits(rows, pinned);
  const where = (family) => ['train', 'val', 'test'].filter((s) => splits[s].some((r) => r.family === family));
  assert.deepEqual(where('old-a'), ['test']);
  assert.deepEqual(where('old-b'), ['train']);
  assert.deepEqual(where('old-c'), ['val']);
  for (let f = 0; f < 12; f++) assert.equal(where(`new-${f}`).length, 1, `new-${f} is on exactly one side`);
  const fresh = (s) => splits[s].filter((r) => r.family.startsWith('new-')).length;
  assert.ok(fresh('test') > 0 && fresh('train') > fresh('test'), JSON.stringify({ train: fresh('train'), val: fresh('val'), test: fresh('test') }));
  assert.equal(splits.train.length + splits.val.length + splits.test.length, rows.length);
});
