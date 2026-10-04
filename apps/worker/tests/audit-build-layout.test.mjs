/**
 * audit_build REPORTS THE LAYOUT FLAGS (F3): the trees it already reads, no further read, the flags beside the defects.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'abl-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

const part = (name, at, size) => ({
  path: `game.Workspace.${name}`, name, class: 'Part', attributes: {}, children: [],
  props: {
    Position: { t: 'Vector3', v: at }, Size: { t: 'Vector3', v: size }, Material: { t: 'EnumItem', v: 'Enum.Material.Slate' },
    Color: { t: 'Color3', v: [0.3, 0.4, 0.7] }, Anchored: { t: 'bool', v: true }, Transparency: { t: 'number', v: 0 },
  },
});
const cluster = (name, x, z) => ({ path: `game.Workspace.${name}`, name, class: 'Model', attributes: {}, props: {}, children: [part(`${name}_a`, [x, 2, z], [3, 4, 3]), part(`${name}_b`, [x + 1, 5, z], [1, 3, 1])] });
const tree = (children) => ({ root: { path: 'game.Workspace', name: 'Workspace', class: 'Workspace', attributes: {}, props: {}, children } });
const darkRig = { root: { path: 'game.Lighting', class: 'Lighting', attributes: {}, children: [], props: { Brightness: { t: 'number', v: 0.3 }, ClockTime: { t: 'number', v: 0 }, Ambient: { t: 'Color3', v: [0.03, 0.03, 0.1] } } } };

function studio(workspace, lighting, voxels = 0) {
  const ops = [];
  const ctx = {
    env: {}, studioConnected: () => true, addMemoryFact: async () => {}, request: 'Make deeper caves with crystals',
    execStudioOp: async (o) => {
      ops.push(o.op);
      if (o.op === 'get_tree') return { ok: true, data: o.root === 'game.Lighting' ? lighting : workspace };
      if (o.op === 'terrain_read') return { ok: true, data: { voxels: 1000, solidVoxels: voxels, materials: [] } };
      if (o.op === 'spatial_query') return { ok: true, data: { flat: [], sampled: 0, hits: 0 } };
      return { ok: false, error: 'unsupported' };
    },
  };
  return { ctx, ops };
}

test('a mirrored-grid place with no terrain and a dark rig gets its layout flags, from reads audit_build already makes', async () => {
  const nodes = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) nodes.push(cluster(`Node_${r * 8 + c}`, -70 + c * 20, -30 + r * 20));
  const { ctx, ops } = studio(tree(nodes), darkRig);
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.equal(res.error, undefined, JSON.stringify(res).slice(0, 300));
  assert.deepEqual(ops, ['get_tree', 'get_tree', 'terrain_read', 'spatial_query'], 'the flags added no read');
  assert.ok(Array.isArray(res.layoutFlags), 'no layoutFlags in the result');
  const joined = res.layoutFlags.join('\n');
  assert.match(joined, /repeated_grid/);
  assert.match(joined, /dark_lighting/);
  assert.match(joined, /open_flat_map/);
  assert.match(joined, /high open_flat_map/, 'the request names caves, so the open flat map is high');
  assert.ok(res.layoutFlags.length <= 3 && res.layoutFlags.every((l) => l.length < 230), 'each flag is one measured sentence');
  const { layoutFlags, ...rest } = res;
  // The tool loop cuts a result at 3,000 characters and a cut result is not JSON; the audit's own result is already near it on a big place.
  assert.ok(JSON.stringify(res).length - JSON.stringify(rest).length < 700, 'the flags may add at most ~700 characters to the result');
});

test('a place with terrain, a natural layout and a lit rig has no layoutFlags key at all', async () => {
  const nodes = Array.from({ length: 12 }, (_, i) => cluster(`Rock_${i}`, ((i * 37) % 91) * 3 - 120, ((i * 53) % 97) * 3 - 140));
  const lit = { root: { path: 'game.Lighting', class: 'Lighting', attributes: {}, children: [], props: { Brightness: { t: 'number', v: 3 }, ClockTime: { t: 'number', v: 14 }, Ambient: { t: 'Color3', v: [0.5, 0.5, 0.5] } } } };
  const { ctx } = studio(tree(nodes), lit, 5000);
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.equal(res.error, undefined);
  assert.equal('layoutFlags' in res, false);
});
