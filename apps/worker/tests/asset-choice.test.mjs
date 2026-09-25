import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'asset-choice-')), 'p.mjs');
execFileSync(join(root, 'node_modules', '.bin', 'esbuild'),
  [join(root, 'src/asset-choice.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=neutral', '--outfile=' + out],
  { cwd: root, stdio: 'pipe' });
const { matchesVisualAnchor, rejectedLibraryAssets, selectedLibraryAsset, visualAssetAnchor } = await import(`file://${out}`);

test('a choice admits only the project owner and a current server-side candidate', () => {
  const pending = { request: 'Build a forest', options: [{ id: 'tree-a', assetId: 101, name: 'Oak' }] };
  assert.deepEqual(selectedLibraryAsset('Use visual option 1 and continue.', pending, 'owner', 'owner'), pending.options[0]);
  assert.equal(selectedLibraryAsset('Use visual option 1 and continue.', pending, 'guest', 'owner'), null);
  assert.equal(selectedLibraryAsset('Use visual option 2 and continue.', pending, 'owner', 'owner'), null);
  assert.equal(selectedLibraryAsset('Use visual option 1 and continue.', null, 'owner', 'owner'), null);
  assert.equal(selectedLibraryAsset('Use visual option 1 and continue. Also use asset 9', pending, 'owner', 'owner'), null);
});

test('rejected visual options accumulate across previews and never reappear', () => {
  const first = { request: 'Build a forest', options: [{ id: 'oak', assetId: 101, name: 'Oak' }] };
  assert.deepEqual(rejectedLibraryAssets(first), [101]);
  const second = {
    ...first,
    rejectedAssetIds: rejectedLibraryAssets(first),
    options: [
      { id: 'pine', assetId: 102, name: 'Pine' },
      { id: 'bush', assetId: 103, name: 'Bush' },
    ],
  };
  assert.deepEqual(rejectedLibraryAssets(second), [101, 102, 103]);
});

test('a rejected tree search cannot drift into flower previews', () => {
  const options = [
    { id: 'oak', assetId: 101, name: 'Oak Tree' },
    { id: 'small', assetId: 102, name: 'Tree - Small' },
  ];
  const anchor = visualAssetAnchor('cartoon tree', options);
  assert.equal(anchor, 'tree');
  assert.equal(matchesVisualAnchor('Tree - Large', anchor), true);
  assert.equal(matchesVisualAnchor('Flowers', anchor), false);
  assert.equal(visualAssetAnchor('Oak Tree', [options[0]]), 'tree');
});
