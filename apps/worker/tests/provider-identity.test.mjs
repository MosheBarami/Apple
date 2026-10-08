import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'provider-identity-'));
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, 'src/providers/registry.ts'),
  '--bundle', '--format=esm', `--outfile=${join(dir, 'registry.mjs')}`], { stdio: 'pipe' });
const { adapterForModelId, allModels } = await import(`file://${join(dir, 'registry.mjs')}`);
after(() => rmSync(dir, { recursive: true, force: true }));

test('registered legacy platform ids retain their explicit transport', () => {
  assert.ok(allModels().length > 0);
  for (const model of allModels()) assert.equal(adapterForModelId(model.id).id, model.provider);
});

test('unknown and external model ids never fall through to Workers AI', () => {
  for (const id of ['openai/new-model', '@cf/unknown/typo', '', 'mimo-v2.6-flash-free']) {
    assert.throws(() => adapterForModelId(id), /Unknown platform model/);
  }
});
