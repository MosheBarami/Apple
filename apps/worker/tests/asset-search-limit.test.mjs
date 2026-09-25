import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'asset-search-limit-'));
const entry = join(temp, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(worker, 'src', 'asset-search-limit.ts'))};\n`);
execFileSync(join(worker, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', `--outfile=${join(temp, 'out.mjs')}`], { cwd: worker, stdio: 'pipe' });
const { explicitAssetSearchLimit, assetSearchLimitReached } = await import(pathToFileURL(join(temp, 'out.mjs')).href);
rmSync(temp, { recursive: true, force: true });

test('the measured two-query request stops a third model search', () => {
  const request = 'Search at most two plain noun queries. Show up to three real previews and wait for my choice.';
  assert.equal(explicitAssetSearchLimit(request), 2);
  const trace = [{ tool: 'find_library_model' }, { tool: 'find_library_model' }];
  assert.equal(assetSearchLimitReached(request, trace, 'find_library_model'), true);
  assert.equal(assetSearchLimitReached(request, trace, 'find_verified_asset'), true);
  assert.equal(assetSearchLimitReached(request, trace.slice(0, 1), 'find_library_model'), false);
  assert.equal(assetSearchLimitReached(request, trace, 'read_script'), false);
});

test('other explicit forms work without mistaking preview counts for search limits', () => {
  assert.equal(explicitAssetSearchLimit('Use at most 4 asset searches, 6 insertions and 1 audit_build.'), 4);
  assert.equal(explicitAssetSearchLimit('Limit yourself to one library search.'), 1);
  assert.equal(explicitAssetSearchLimit('Show three previews before inserting one model.'), null);
  assert.equal(explicitAssetSearchLimit('Find assets for a full game.'), null);
});
