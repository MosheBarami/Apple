/**
 * D-MODELLIB-2: Apple never makes a model from scratch. Plain structure (floors, paths, walls, pads)
 * is still built from Parts; every prop comes from find_library_model + insert_library_model.
 *
 * What this file holds the worker to:
 *   - create_instances refuses a Model assembled from Parts, a part named as a prop (or inside
 *     something named as one), a ball-shaped part and a hand-made mesh; sends nothing; names the
 *     library tools;
 *   - run_luau refuses the same shapes in Luau; comments are not code;
 *   - generate_model and generate_model_external refuse and send nothing;
 *   - plain structure, functional parts (ShopTrigger, CoinPad) and the vetted scene kit still pass.
 *
 * Run with:  node --test tests/model-only.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'model-only-'));
const outfile = join(temp, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`], { cwd: WORKER, stdio: 'pipe' });
const T = await import(pathToFileURL(outfile).href);
rmSync(temp, { recursive: true, force: true });

function studio() {
  const calls = [];
  // The rule stands with the library available (the project allows the Creator Store), as D-MODELLIB-1.
  return { calls, ctx: { env: {}, assetSources: { allow: ['creator_store'] }, execStudioOp: async (op) => (calls.push(op), { id: 'x', ok: true, data: { ok: true, created: ['x'] } }) } };
}
const refused = (r) => r && typeof r === 'object' && typeof r.error === 'string' && /D-MODELLIB-2/.test(r.error);
const namesLibrary = (r) => /find_library_model/.test(r.error) && /insert_library_model/.test(r.error);

test('create_instances refuses every hand-made prop shape, sends nothing, and names the library tools', async () => {
  for (const items of [
    [{ className: 'Model', name: 'Thing', children: [{ className: 'Part', name: 'A' }, { className: 'Part', name: 'B' }] }],
    [{ className: 'Part', name: 'PalmTree_3' }],
    [{ className: 'WedgePart', name: 'Roof', parent: 'game.Workspace' }],
    [{ className: 'Part', name: 'Plank', parent: 'game.Workspace.Fences' }],
    [{ className: 'Folder', name: 'MarketStalls', children: [{ className: 'Part', name: 'Top' }] }],
    [{ className: 'Part', name: 'Blob', props: { Shape: { t: 'enum', v: 'Enum.PartType.Ball' } } }],
    [{ className: 'MeshPart', name: 'Rock' }],
    [{ className: 'Part', name: 'Base', children: [{ className: 'SpecialMesh', name: 'M' }] }],
  ]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(refused(r), JSON.stringify(items) + '\n' + JSON.stringify(r));
    assert.ok(namesLibrary(r), r.error);
    assert.equal(s.calls.length, 0, 'nothing may reach Studio');
  }
});

test('the prop ban holds while asset consent is owed or the library tool is unavailable', async () => {
  for (const assetSources of [undefined, { allow: [] }, { allow: ['from_scratch'] }]) {
    for (const offeredTools of [undefined, new Set(['create_instances'])]) {
      const s = studio();
      s.ctx.assetSources = assetSources;
      s.ctx.offeredTools = offeredTools;
      const r = await T.TOOLS.create_instances.run(s.ctx, {
        items: [{ className: 'Part', name: 'AppleTree', parent: 'game.Workspace' }],
      });
      assert.ok(refused(r), `a prop reached Studio without a library source: ${JSON.stringify({ assetSources, offeredTools: [...(offeredTools ?? [])], r })}`);
      assert.equal(s.calls.length, 0, 'a hand-built prop reached Studio');
    }
  }
});

test('create_instances still lays plain structure and functional parts', async () => {
  for (const items of [
    [{ className: 'Part', name: 'Floor', props: { Size: { t: 'Vector3', v: [200, 1, 200] } } }],
    [{ className: 'Folder', name: 'Obby', children: [{ className: 'Part', name: 'Stage1' }, { className: 'Part', name: 'Stage2' }, { className: 'SpawnLocation', name: 'Spawn' }] }],
    [{ className: 'Part', name: 'ShopTrigger', parent: 'game.Workspace.ShopBuilding' }],
    [{ className: 'Part', name: 'CoinPad' }],
    [{ className: 'Part', name: 'Path', props: { Shape: { t: 'enum', v: 'Enum.PartType.Cylinder' } } }],
    [{ className: 'PointLight', name: 'Glow', parent: 'game.Workspace.Lamp' }],
  ]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(!refused(r), JSON.stringify(items) + '\n' + JSON.stringify(r));
    assert.equal(s.calls.length, 1);
  }
});

test('run_luau refuses Luau that assembles a prop, and lets plain structure and comments through', async () => {
  for (const code of [
    'local m = Instance.new("Model")\nlocal p = Instance.new("Part")\np.Parent = m',
    'local p = Instance.new("Part")\np.Name = "OakTree"',
    "local p = Instance.new('Part')\np.Shape = Enum.PartType.Ball",
    'local m = Instance.new("MeshPart")',
  ]) {
    const s = studio();
    const r = await T.TOOLS.run_luau.run(s.ctx, { code });
    assert.ok(refused(r), `${code}\n${JSON.stringify(r)}`);
    assert.equal(s.calls.length, 0);
  }
  for (const code of [
    'local p = Instance.new("Part")\np.Name = "Floor"\np.Size = Vector3.new(100, 1, 100)',
    '-- local m = Instance.new("Model") local p = Instance.new("Part") p.Name = "Tree"\nprint(#workspace:GetChildren())',
  ]) {
    const s = studio();
    const r = await T.TOOLS.run_luau.run(s.ctx, { code });
    assert.ok(!refused(r), `${code}\n${JSON.stringify(r)}`);
  }
});

test('generate_model and generate_model_external refuse, send nothing, and point at the library', async () => {
  for (const tool of ['generate_model', 'generate_model_external']) {
    const s = studio();
    const r = await T.TOOLS[tool].run({ ...s.ctx, userId: 'u', projectId: 'p' }, { prompt: 'a tree' });
    assert.ok(refused(r), JSON.stringify(r));
    assert.ok(namesLibrary(r), r.error);
    assert.equal(s.calls.length, 0);
  }
});

test('the vetted floating-island kit still builds through build_scene', async () => {
  const s = studio();
  const r = await T.TOOLS.build_scene.run(s.ctx, { kit: 'floating_island', center: [0, 150, 0] });
  assert.ok(!refused(r), JSON.stringify(r).slice(0, 400));
});
