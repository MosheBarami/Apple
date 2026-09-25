import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'asset-choice-')), 'p.mjs');
execFileSync(join(root, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(root, 'src/components/ws/asset-choice-model.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=neutral', '--outfile=' + out],
  { cwd: root, stdio: 'pipe' });
const { visualOptions } = await import(`file://${out}`);

test('the choice surface shows only three validated options from the library search', () => {
  const row = (assetId, name) => ({ assetId, name });
  const tool = { tool: 'find_library_model', ok: true, detail: { kind: 'asset_choices', options: [
    row(10, 'Oak'), row(20, 'Pine'), row(30, 'Palm'), row(40, 'Extra'),
  ] } };
  assert.deepEqual(visualOptions([tool]), [row(10, 'Oak'), row(20, 'Pine'), row(30, 'Palm')]);
  assert.deepEqual(visualOptions([{ ...tool, detail: { kind: 'asset_choices', options: [row(-1, 'Bad'), row(20, 'Pine')] } }]), [row(20, 'Pine')]);
  assert.deepEqual(visualOptions([{ ...tool, tool: 'other' }]), []);
});
