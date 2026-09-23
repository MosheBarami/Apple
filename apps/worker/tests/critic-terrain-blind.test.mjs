// 2026-09-23: the renderer drew no Terrain, so critiques of terrain islands said "flat slab, no underside"
// and the model rebuilt islands that were fine. Old plugins stay in the field until the next publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'crit-')), 'c.mjs');
const entry = join(mkdtempSync(join(tmpdir(), 'crit-e-')), 'e.ts');
import { writeFileSync } from 'node:fs';
writeFileSync(entry, `export * from '${join(WORKER, 'src', 'critic.ts')}'; export { criticInputFromRender } from '${join(WORKER, 'src', 'critic-input.ts')}';`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const C = await import(`file://${out}`);

const view = (terrainCells) => ({ name: 'hero', rgbBase64: '', meta: { width: 64, height: 48, partsConsidered: 40, partsVisible: 40, partsOffCamera: 0, subjectCoverage: 0.4, distinctColours: 6, materials: [], ...(terrainCells === undefined ? {} : { terrainCells }) } });
const result = (terrainCells) => ({ subject: 'Workspace', boundsSize: [100, 60, 100], views: [view(terrainCells)] });

test('an old renderer is known to be blind to Terrain, a new one is not', () => {
  assert.equal(C.criticInputFromRender(result(undefined), 'a floating island').terrainInvisible, true);
  assert.equal(C.criticInputFromRender(result(120), 'a floating island').terrainInvisible, false);
});

test('a blind render tells every critic, and a "missing landform" finding is deleted', () => {
  const blind = { ...C.criticInputFromRender(result(undefined), 'a floating sky island with a waterfall'), requestedElements: ['island underside', 'waterfall', 'crystals'] };
  assert.match(C.buildLensPrompt('composition', blind).system, /CANNOT SHOW ROBLOX TERRAIN/);
  const missing = (element) => ({ subject: 'x', claim: `the ${element} is not there at all`, severity: 'major', evidence: { kind: 'missing', element, searchedIn: ['hero'] }, fix: 'build it' });
  assert.match(C.rejectionReason(missing('island underside'), blind, C.DEFAULT_RULE ?? { maxRegionArea: 0.6, measureTolerance: 0.05 }) ?? '', /Terrain/);
  const seeing = { ...blind, terrainInvisible: false };
  assert.doesNotMatch(C.buildLensPrompt('composition', seeing).system, /CANNOT SHOW ROBLOX TERRAIN/);
});
