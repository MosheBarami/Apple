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

// 2026-10-02: ready-made models from the owner library stand in the place, numbered; the user picks one of three.
test('a numbered model standing in the place is an option, and its snapshot is a same-origin project image only', async () => {
  const { visualSnapshot } = await import(`file://${out}`);
  const detail = { kind: 'asset_choices', image: '/api/projects/p-1/images/i-2', options: [
    { index: 1, name: 'Butter', where: 'ASMR Pack' }, { index: 2, name: 'Vanilla Donut' }, { index: 7, name: 'Out of range' }, { name: 'No number' },
  ] };
  const tool = { tool: 'find_library_model', ok: true, detail };
  assert.deepEqual(visualOptions([tool]).map((o) => o.name), ['Butter', 'Vanilla Donut']);
  assert.equal(visualSnapshot([tool]), '/api/projects/p-1/images/i-2');
  for (const image of ['https://evil.example/x.png', 'javascript:alert(1)', '/api/projects/p/images/../../x', 42]) {
    assert.equal(visualSnapshot([{ ...tool, detail: { ...detail, image } }]), null, String(image));
  }
});
