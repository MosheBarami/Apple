import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetIngestBatches } from '../scripts/lib/asset-ingest-batches.mjs';

const rows = (count, seed, offset = 0) => Array.from({ length: count }, (_, i) => ({
  a: { id: `asset-${offset + i}` }, seed, status: seed ? 'pending_ingest' : 'active',
}));

for (const scrapeFirst of [false, true]) {
  test(`non-aligned lifecycle boundary preserves every asset (scrapeFirst=${scrapeFirst})`, () => {
    const queue = [...rows(503, !scrapeFirst), ...rows(511, scrapeFirst, 503)];
    const batches = [...assetIngestBatches(queue)];
    assert.deepEqual(batches.flatMap((batch) => batch.assets), queue.map((row) => row.a));
    assert.deepEqual(batches.map((batch) => batch.assets.length), [500, 3, 500, 11]);
    assert.deepEqual(batches.map((batch) => batch.from), [0, 500, 503, 1003]);
    for (const batch of batches) {
      assert.ok(batch.assets.length <= 500);
      for (const row of queue.slice(batch.from, batch.from + batch.assets.length)) {
        assert.equal(row.seed, batch.seed);
        assert.equal(row.status, batch.status);
      }
    }
  });
}

test('empty, single, and exact-boundary queues are lossless', () => {
  for (const length of [0, 1, 500, 1000]) {
    const queue = rows(length, true);
    assert.deepEqual([...assetIngestBatches(queue)].flatMap((batch) => batch.assets), queue.map((row) => row.a));
  }
});

test('status differences split batches even when seed matches', () => {
  const queue = rows(2, true);
  queue[1].status = 'quarantined';
  assert.equal([...assetIngestBatches(queue)].length, 2);
});

test('invalid sizes fail instead of hanging or dropping records', () => {
  for (const size of [0, -1, 0.5, Infinity, NaN]) {
    assert.throws(() => [...assetIngestBatches(rows(1, true), size)], RangeError);
  }
});
