/** Sources a run used: read from tool results, never invented; numbered once per run (sources.ts). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'src-')), 's.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'sources.ts'), '--bundle', '--format=esm', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

test('docs pages and Creator Store items a tool returned become sources; anything else does not', () => {
  const docs = S.sourcesIn('search_docs', [{ citation: 1, title: 'TweenService', url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService', excerpt: 'x' }, { title: 'Evil', url: 'https://evil.example/docs' }]);
  assert.deepEqual(docs.map((d) => d.kind), ['docs']);
  const sounds = S.sourcesIn('find_sound', { results: [{ assetId: 4612375051, name: 'coin_pickup_3' }] });
  assert.equal(sounds[0].url, 'https://create.roblox.com/store/asset/4612375051');
  assert.equal(sounds[0].kind, 'creator_store');
  assert.deepEqual(S.sourcesIn('create_instances', { assetId: 5, name: 'x' }), [], 'only searches cite store items');
});

test('a run numbers each source once, in the order first used', () => {
  const list = [];
  const a = { title: 'A', url: 'https://create.roblox.com/docs/a', kind: 'docs' }, b = { title: 'B', url: 'https://create.roblox.com/docs/b', kind: 'docs' };
  assert.deepEqual(S.addSources(list, [a, b]), [1, 2]);
  assert.deepEqual(S.addSources(list, [b]), [2]);
  assert.equal(list.length, 2);
});
