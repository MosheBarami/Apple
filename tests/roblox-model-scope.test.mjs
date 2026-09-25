import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../packages/asset-library/', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const manifest = JSON.parse(read('models/manifest.json'));
const index = JSON.parse(read('models/index.json'));
const packs = new Map(read('sources/models-packs.jsonl').split('\n').filter(Boolean).map((line) => {
  const pack = JSON.parse(line);
  return [pack.id, pack];
}));

test('the model downloader refuses a generic CC0 pack before any network request', async () => {
  const { refusal } = await import('../packages/asset-library/models/fetch.mjs');
  assert.match(refusal({ source: 'polyhaven', licence: 'CC0-1.0', download: 'https://polyhaven.com/file.zip' }), /Roblox/i);
});

test('every downloaded model offered by Apple comes from an explicitly Roblox-native pack', () => {
  const byId = new Map(manifest.rows.map((row) => [row.id, row]));
  assert.ok(index.rows.length > 0, 'the Roblox model index is empty');
  for (const entry of index.rows) {
    const row = byId.get(entry[0]);
    assert.ok(row, `${entry[0]} is not in the manifest`);
    if (typeof entry[5] === 'string') {
      assert.equal(packs.get(row.pack)?.robloxSpecific, true, `${row.id} came from a general 3D pack`);
    } else {
      assert.equal(row.format, 'creator-store', `${row.id} is not a Roblox Creator Store asset`);
    }
  }
});

test('the published model manifest contains only Roblox-native models', () => {
  for (const row of manifest.rows) {
    if (row.path) assert.equal(packs.get(row.pack)?.robloxSpecific, true, `${row.id} came from a general 3D pack`);
    else assert.equal(row.format, 'creator-store', `${row.id} is not a Roblox Creator Store asset`);
  }
});
