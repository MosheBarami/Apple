/**
 * D-MODELLIB-2, restated in phase 1 (2026-10-02): the library is PREFERRED, never forced.
 *
 * The 13-item benchmark showed the harness holding a list of nouns (tree, lamp, chest, pet, coin...) and refusing any
 * create_instances / run_luau / edit_script that made a part "named as a prop", a ball, a mesh or a Model of parts, then
 * telling the agent to build with one tool or search with another. That is the harness deciding what the agent may make,
 * by words. Now:
 *   - create_instances, run_luau and edit_script build what they are asked to; nothing is refused by a noun, a shape or a
 *     name; create_instances says what the library holds when a Model of parts is named like a row (libraryAdvice);
 *   - what stays closed is the AI 3D generator (generate_model, generate_model_external), a different thing;
 *   - plain structure and functional parts pass as they always did; the scene kit lays terrain only.
 *
 * Run with:  node --test tests/model-only.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

test('create_instances builds every shape that used to be refused as a hand-made prop: nothing is refused by a noun, a ball or a mesh', async () => {
  for (const items of [
    [{ className: 'Model', name: 'Thing', children: [{ className: 'Part', name: 'A' }, { className: 'Part', name: 'B' }] }],
    [{ className: 'Part', name: 'PalmTree_3' }],
    [{ className: 'Part', name: 'Carrot' }],
    [{ className: 'WedgePart', name: 'Roof', parent: 'game.Workspace' }],
    [{ className: 'Part', name: 'Plank', parent: 'game.Workspace.Fences' }],
    [{ className: 'Folder', name: 'MarketStalls', children: [{ className: 'Part', name: 'Top' }] }],
    [{ className: 'Part', name: 'Blob', props: { Shape: { t: 'enum', v: 'Enum.PartType.Ball' } } }],
    [{ className: 'MeshPart', name: 'Rock' }],
    [{ className: 'Part', name: 'Base', children: [{ className: 'SpecialMesh', name: 'M' }] }],
  ]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(!refused(r), JSON.stringify(items) + '\n' + JSON.stringify(r));
    assert.equal(s.calls.length, 1, 'it reached Studio: ' + JSON.stringify(items));
  }
});

test('nothing about consent, sources or offered tools changes that: the same build goes through', async () => {
  for (const assetSources of [undefined, { allow: [] }, { allow: ['from_scratch'] }]) {
    for (const offeredTools of [undefined, new Set(['create_instances'])]) {
      const s = studio();
      s.ctx.assetSources = assetSources;
      s.ctx.offeredTools = offeredTools;
      const r = await T.TOOLS.create_instances.run(s.ctx, {
        items: [{ className: 'Part', name: 'AppleTree', parent: 'game.Workspace' }],
      });
      assert.ok(!refused(r), JSON.stringify(r));
      assert.equal(s.calls.length, 1);
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

test('run_luau runs Luau that assembles parts, comments or not; the library is advice, not a gate', async () => {
  for (const code of [
    'local m = Instance.new("Model")\nlocal p = Instance.new("Part")\np.Parent = m',
    'local p = Instance.new("Part")\np.Name = "OakTree"',
    "local p = Instance.new('Part')\np.Shape = Enum.PartType.Ball",
    'local p = Instance.new("Part")\np.Name = "Floor"\np.Size = Vector3.new(100, 1, 100)',
    '-- local m = Instance.new("Model") local p = Instance.new("Part") p.Name = "Tree"\nprint(#workspace:GetChildren())',
  ]) {
    const s = studio();
    const r = await T.TOOLS.run_luau.run(s.ctx, { code });
    assert.ok(!refused(r), `${code}\n${JSON.stringify(r)}`);
  }
});

test('edit_script keeps a script that builds a Model from parts; the model rule no longer scans scripts', async () => {
  const existing = 'print("garden")\n';
  const handmade = 'local crop = Instance.new("Model")\ncrop.Name = "CropVisual"\nlocal body = Instance.new("Part")\nbody.Parent = crop\n';
  const scriptStudio = (before) => {
    const calls = [];
    return {
      calls,
      ctx: {
        env: {},
        execStudioOp: async (operation) => {
          calls.push(operation);
          return { id: 'x', ok: true, data: operation.op === 'read_script' ? { source: before } : { ok: true } };
        },
      },
    };
  };
  for (const args of [
    { source: existing + handmade },
    { edits: [{ find: existing, replace: existing + handmade }] },
  ]) {
    const s = scriptStudio(existing);
    const result = await T.TOOLS.edit_script.run(s.ctx, { path: 'game.ServerScriptService.GardenMain', ...args });
    assert.ok(!refused(result), JSON.stringify(result));
    assert.equal(s.calls.filter((call) => call.op === 'edit_script').length, 1);
  }
});

test('generate_model and generate_model_external stay closed: they refuse, send nothing, and point at the library and build_object', async () => {
  for (const tool of ['generate_model', 'generate_model_external']) {
    const s = studio();
    const r = await T.TOOLS[tool].run({ ...s.ctx, userId: 'u', projectId: 'p' }, { prompt: 'a tree' });
    assert.ok(refused(r), JSON.stringify(r));
    assert.ok(namesLibrary(r), r.error);
    assert.match(r.error, /build_object/, 'building from parts is named as the alternative');
    assert.match(r.error, /does not use an AI 3D generator/);
    assert.equal(s.calls.length, 0);
  }
});

test('the model rule holds no word list: no noun, shape or name decides anything', () => {
  const src = readFileSync(join(WORKER, 'src', 'model-rule.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  for (const gone of ['PROP_WORDS', 'FUNCTION_WORDS', 'propWordIn', 'refuseHandMadeModel', 'refuseNewHandMadeModelLuau', 'SUGGEST', 'HAND_MESH']) assert.equal(src.includes(gone), false, `${gone} is back`);
  assert.equal(/'tree'|'chest'|'lamp'|'pet'/.test(src), false);
});

test('the floating-island tool builds only plain terrain and leaves detailed props to the library', async () => {
  const s = studio();
  const r = await T.TOOLS.build_scene.run(s.ctx, { kit: 'floating_island', center: [0, 150, 0] });
  assert.ok(!refused(r), JSON.stringify(r).slice(0, 400));
  assert.equal(r.complete, false);
  assert.match(r.next, /find_library_model/);
  assert.equal(s.calls.filter((call) => call.op === 'create_instances').length, 0, 'the kit hand-built a prop');
});
