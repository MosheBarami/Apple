import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStorageOutcomeShard, STORAGE_OUTCOME_EXAMPLES } from './build-storage-outcome-shard.mjs';
import { readVerifiedShard } from './train-forever.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const relative = 'data/storage-outcome-seeds-v1/shard-1.jsonl';
const file = join(here, '..', relative);
const bytes = readFileSync(file);
const digest = createHash('sha256').update(bytes).digest('hex');

test('storage outcome lessons execute, catch mutations, and match the pinned shard bytes', () => {
  const rows = buildStorageOutcomeShard();
  assert.equal(rows.length, STORAGE_OUTCOME_EXAMPLES.length);
  assert.ok(rows.length >= 4, 'do not silently reduce this experiment to one example');
  assert.equal(new Set(rows.map((row) => row.meta.family)).size, rows.length);
  assert.ok(rows.every((row) => row.meta.evidence.behaviorPassed && row.meta.evidence.mutationRejected));
  assert.equal(bytes.toString('utf8'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
});

test('the training supervisor accepts the shard using its production identity and execution checks', async () => {
  const rows = await readVerifiedShard(relative, digest);
  assert.equal(rows.length, STORAGE_OUTCOME_EXAMPLES.length);
  assert.ok(rows.every((row) => row.meta.kind === 'game-logic'));
  await assert.rejects(readVerifiedShard(relative, '0'.repeat(64)), /changed/);
});
