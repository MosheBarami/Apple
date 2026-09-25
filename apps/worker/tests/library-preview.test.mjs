import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'library-preview-')), 'p.mjs');
execFileSync(join(root, 'node_modules', '.bin', 'esbuild'),
  [join(root, 'src', 'library-preview.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=neutral', '--outfile=' + out],
  { cwd: root, stdio: 'pipe' });
const { robloxThumbnailUrl } = await import(`file://${out}`);

test('only the requested completed Roblox CDN thumbnail is accepted', () => {
  const data = { data: [
    { targetId: 7, state: 'Completed', imageUrl: 'https://evil.example/asset.png' },
    { targetId: 8, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/wrong/420/420/Model/Png/noFilter' },
    { targetId: 7, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/good/420/420/Model/Png/noFilter' },
  ] };
  assert.equal(robloxThumbnailUrl(data, 7), null, 'the first matching row was hostile');
  assert.equal(robloxThumbnailUrl({ data: [{ targetId: 7, state: 'Pending', imageUrl: 'https://tr.rbxcdn.com/pending' }] }, 7), null);
  assert.equal(robloxThumbnailUrl({ data: [{ targetId: 7, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/good' }] }, 7), 'https://tr.rbxcdn.com/good');
  assert.equal(robloxThumbnailUrl({ data: [{ targetId: 8, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/wrong' }] }, 7), null);
});
