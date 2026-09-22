import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const dir = mkdtempSync(join(tmpdir(), 'asset-typed-tree-'));
const bundle = join(dir, 'assets.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'assets.ts'),
  '--bundle', '--platform=node', '--format=esm', '--target=es2022', `--outfile=${bundle}`,
], { cwd: WORKER, stdio: 'pipe' });
const A = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });

test('summariseTree reads geometry from the current Apple get_tree props contract', () => {
  const tree = {
    root: {
      path: 'game.Workspace.Asset',
      name: 'Asset',
      class: 'Model',
      children: [
        {
          path: 'game.Workspace.Asset.Body',
          name: 'Body',
          class: 'MeshPart',
          props: {
            Position: { t: 'Vector3', v: [10, 4, -3] },
            Size: { t: 'Vector3', v: [6, 8, 2] },
          },
          children: [
            { path: 'game.Workspace.Asset.Body.Decal', name: 'Decal', class: 'Decal' },
          ],
        },
      ],
    },
  };

  const summary = A.summariseTree(tree, 'game.Workspace.Asset');
  assert.deepEqual(summary.bounds, [6, 8, 2]);
  assert.deepEqual(summary.center, [10, 4, -3]);
  assert.deepEqual(summary.spatial, [{
    path: 'game.Workspace.Asset.Body',
    className: 'MeshPart',
    size: [6, 8, 2],
    position: [10, 4, -3],
  }]);
  assert.deepEqual(summary.textures, ['game.Workspace.Asset.Body.Decal']);
});

test('summariseTree keeps legacy top-level geometry only as a compatibility fallback', () => {
  const summary = A.summariseTree({
    name: 'Part',
    class: 'Part',
    pos: { t: 'Vector3', v: [1, 2, 3] },
    size: { t: 'Vector3', v: [2, 4, 6] },
  }, 'game.Workspace.Part');
  assert.deepEqual(summary.bounds, [2, 4, 6]);
  assert.deepEqual(summary.center, [1, 2, 3]);
});
