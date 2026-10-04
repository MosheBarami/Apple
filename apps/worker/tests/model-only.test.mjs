/**
 * D-MODELLIB-2, restated in phase 1 and revised 2026-10-02: the library is PREFERRED and the ASSET ORDER (library,
 * Creator Store, adapt or combine, then build from Parts in full detail) is an order, not a ban.
 *
 * The 13-item benchmark showed the harness holding a list of nouns and refusing any create_instances / run_luau /
 * edit_script that made a part "named as a prop", a ball, a mesh or a Model of parts, then telling the agent to build with
 * one tool or search with another: the harness deciding what the agent may make, by words. Before that was lifted a Model
 * of Parts was refused whatever the run had tried, so step 4 of the owner's order was unreachable. Now:
 *   - a Model assembled from Parts is held back until the run has TRIED the library (a search with no hit,
 *     an insert that failed, or an insert that worked), at most twice per run, and never when the library
 *     is not on offer or the project's sources rule it out;
 *   - hand-made meshes cannot be created by StudPilot's plugin, so they are refused whatever the run did;
 *   - NO NAME DECIDES ANYTHING: a part called PalmTree_3 is a part, and a renamed Model is the same Model.
 *     The module exports no word list, which a guard below enforces; create_instances says what the library holds when
 *     a Model of parts is named like a row (libraryAdvice), as information;
 *   - run_luau and edit_script follow the same gate; legacy scripts keep working;
 *   - generate_model and generate_model_external are still closed and point at the order.
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
const bundle = (rel, name) => {
  const outfile = join(temp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`], { cwd: WORKER, stdio: 'pipe' });
  return pathToFileURL(outfile).href;
};
const T = await import(bundle('tools.ts', 'tools'));
const R = await import(bundle('model-rule.ts', 'model-rule'));
rmSync(temp, { recursive: true, force: true });

function studio(over = {}) {
  const calls = [];
  // The library is on offer and the project allows the Creator Store: the order gate applies.
  return { calls, ctx: { env: {}, assetSources: { allow: ['creator_store'] }, execStudioOp: async (op) => (calls.push(op), { id: 'x', ok: true, data: { ok: true, created: ['x'] } }), ...over } };
}
const orderRefused = (r) => r && typeof r === 'object' && typeof r.error === 'string' && /Order: library first/.test(r.error);
const refused = (r) => r && typeof r === 'object' && typeof r.error === 'string' && /D-MODELLIB-2/.test(r.error);
const namesLibrary = (r) => /find_library_model/.test(r.error) && /insert_library_model/.test(r.error);
const part = (name) => ({ className: 'Part', name });
const stall = [{ className: 'Model', name: 'MarketStall', children: [part('Counter'), part('Awning'), part('PostL'), part('PostR')] }];
const arch = [{ className: 'Model', name: 'StoneArch', parent: 'game.Workspace', children: [{ className: 'Model', name: 'Pier', children: [part('Block1')] }, part('Keystone')] }];
const hedge = [{ className: 'Model', name: 'HedgeRow', children: [part('Seg1'), part('Seg2')] }];

test('a Model of Parts is held back before any library step: "library first", nothing sent, tools named', async () => {
  for (const items of [stall, arch, hedge, [{ className: 'Model', name: 'Thing', children: [part('A'), part('B')] }]]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(orderRefused(r), JSON.stringify(items) + '\n' + JSON.stringify(r));
    assert.ok(refused(r) && namesLibrary(r), r.error);
    assert.match(r.error, /call create_instances again with this same batch/, 'the refusal does not say how to proceed');
    assert.equal(s.calls.length, 0, 'nothing may reach Studio');
  }
});

test('the same batch goes through after the library was TRIED, whatever the outcome was', async () => {
  for (const outcome of ['no_hit', 'insert_failed', 'inserted']) {
    const s = studio({ libraryRun: { outcome } });
    const r = await T.TOOLS.create_instances.run(s.ctx, { items: stall });
    assert.ok(!refused(r), `${outcome}: ${JSON.stringify(r)}`);
    assert.equal(s.calls.length, 1, `${outcome}: the build did not reach Studio`);
  }
  // Candidates were found but nothing was inserted: the search is not the end of the library step.
  const s = studio({ libraryRun: { outcome: 'hits', candidates: ['a'] } });
  const r = await T.TOOLS.create_instances.run(s.ctx, { items: stall });
  assert.ok(orderRefused(r), JSON.stringify(r));
  assert.match(r.error, /already returned candidates: call insert_library_model/);
});

test('the gate is bounded: it can refuse at most twice per run, then the batch goes through', async () => {
  const s = studio();
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await T.TOOLS.create_instances.run(s.ctx, { items: stall }));
  assert.deepEqual(results.map(orderRefused), [true, true, false, false], 'a gate that never opens is the deadlock this replaced');
  assert.equal(s.calls.length, 2);
  assert.ok(R.ORDER_GATE_LIMIT >= 1 && R.ORDER_GATE_LIMIT <= 3, 'the bound moved');
});

test('the gate does not apply when the library is not on offer or the project rules it out', async () => {
  for (const over of [
    { assetSources: undefined },
    { assetSources: { allow: [] } },
    { assetSources: { allow: ['from_scratch'] } },
    { offeredTools: new Set(['create_instances']) },
  ]) {
    const s = studio(over);
    const r = await T.TOOLS.create_instances.run(s.ctx, { items: stall });
    assert.ok(!refused(r), `a Model of Parts was held back with no library to try: ${JSON.stringify({ over: Object.keys(over), r })}`);
    assert.equal(s.calls.length, 1);
  }
});

test('NO NAME DECIDES ANYTHING: parts named like objects pass, and every Model is gated the same whatever it is called', async () => {
  for (const items of [
    [part('PalmTree_3')], [part('Carrot')], [{ className: 'WedgePart', name: 'Roof', parent: 'game.Workspace' }],
    [{ className: 'Part', name: 'Plank', parent: 'game.Workspace.Fences' }],
    [{ className: 'Folder', name: 'MarketStalls', children: [part('Top')] }],
    [{ className: 'Part', name: 'Blob', props: { Shape: { t: 'enum', v: 'Enum.PartType.Ball' } } }],
  ]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(!refused(r), JSON.stringify(items) + '\n' + JSON.stringify(r));
    assert.equal(s.calls.length, 1);
  }
  for (const name of ['Thing', 'Zork', 'Floor', 'ShopTrigger', 'Tree']) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items: [{ className: 'Model', name, children: [part('A'), part('B')] }] });
    assert.ok(orderRefused(r), `a Model named "${name}" was treated differently: ${JSON.stringify(r)}`);
  }
});

test('model-rule.ts exports no word list and no function that reads a name', () => {
  assert.deepEqual(Object.keys(R).sort(), [
    'ASSET_ORDER', 'MODEL_DECISION', 'ORDER_GATE_LIMIT', 'orderApplies', 'refuseGeneratedModel', 'refuseHandMadeModel', 'refuseHandMadeModelLuau', 'refuseNewHandMadeModelLuau',
  ], 'the exports changed: a word list or a name reader must not come back (a new export needs a review)');
  const src = readFileSync(join(WORKER, 'src', 'model-rule.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /PROP_WORDS|FUNCTION_WORDS|propWordIn/, 'the subject recogniser is back');
  // The only sets left are Roblox CLASS names. Anything with common nouns in it is a subject list.
  const sets = [...src.matchAll(/new Set\(\[([^\]]*)\]\)/g)].map((m) => m[1]);
  assert.ok(sets.length >= 2, 'the class sets are gone, so this check would examine nothing');
  for (const body of sets) {
    for (const word of body.match(/'([A-Za-z]+)'/g) ?? []) {
      assert.match(word, /'(Part|WedgePart|CornerWedgePart|TrussPart|MeshPart|UnionOperation|Seat|VehicleSeat|SpawnLocation|SpecialMesh|BlockMesh|CylinderMesh)'/, `${word} is not a Roblox class name: a subject word list?`);
    }
  }
});

test('hand-made meshes are refused whatever the run has tried, and the reason is the plugin', async () => {
  for (const items of [
    [{ className: 'MeshPart', name: 'Rock' }],
    [{ className: 'Part', name: 'Base', children: [{ className: 'SpecialMesh', name: 'M' }] }],
    [{ className: 'UnionOperation', name: 'U' }],
  ]) {
    for (const libraryRun of [undefined, { outcome: 'no_hit' }]) {
      const s = studio({ libraryRun });
      const r = await T.TOOLS.create_instances.run(s.ctx, { items });
      assert.ok(refused(r) && !orderRefused(r), JSON.stringify(r));
      assert.match(r.error, /cannot create meshes/);
      assert.ok(namesLibrary(r), r.error);
      assert.equal(s.calls.length, 0);
    }
  }
});

test('create_instances still lays plain structure and functional parts without any library step', async () => {
  for (const items of [
    [{ className: 'Part', name: 'Floor', props: { Size: { t: 'Vector3', v: [200, 1, 200] } } }],
    [{ className: 'Folder', name: 'Obby', children: [part('Stage1'), part('Stage2'), { className: 'SpawnLocation', name: 'Spawn' }] }],
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

test('run_luau: a Model assembled from Parts waits for the library; meshes never pass; names and balls are not rules; comments are not code', async () => {
  const assembled = 'local m = Instance.new("Model")\nlocal p = Instance.new("Part")\np.Parent = m';
  const s0 = studio();
  const first = await T.TOOLS.run_luau.run(s0.ctx, { code: assembled });
  assert.ok(orderRefused(first) && /same code/.test(first.error), JSON.stringify(first));
  assert.equal(s0.calls.length, 0);
  const tried = studio({ libraryRun: { outcome: 'insert_failed' } });
  assert.ok(!refused(await T.TOOLS.run_luau.run(tried.ctx, { code: assembled })), 'the library was tried and Luau was still refused');
  const mesh = studio({ libraryRun: { outcome: 'no_hit' } });
  assert.ok(refused(await T.TOOLS.run_luau.run(mesh.ctx, { code: 'local m = Instance.new("MeshPart")' })));
  for (const code of [
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

test('edit_script: a newly assembled Model waits for the library; legacy code and library clones are untouched', async () => {
  const existing = 'print("garden")\n';
  const handmade = 'local crop = Instance.new("Model")\ncrop.Name = "CropVisual"\nlocal body = Instance.new("Part")\nbody.Parent = crop\n';
  const scriptStudio = (before, over = {}) => {
    const calls = [];
    return {
      calls,
      ctx: {
        env: {},
        assetSources: { allow: ['creator_store'] },
        ...over,
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
    assert.ok(orderRefused(result), JSON.stringify(result));
    assert.equal(s.calls.filter((call) => call.op === 'edit_script').length, 0);
    // Once the library was tried, the same edit is step 4 of the order.
    const after = scriptStudio(existing, { libraryRun: { outcome: 'no_hit' } });
    const ok = await T.TOOLS.edit_script.run(after.ctx, { path: 'game.ServerScriptService.GardenMain', ...args });
    assert.ok(!refused(ok), JSON.stringify(ok));
    assert.equal(after.calls.filter((call) => call.op === 'edit_script').length, 1);
  }
});

test('generate_model and generate_model_external refuse, send nothing, and point at the order and build_object', async () => {
  for (const tool of ['generate_model', 'generate_model_external']) {
    const s = studio();
    const r = await T.TOOLS[tool].run({ ...s.ctx, userId: 'u', projectId: 'p' }, { prompt: 'a tree' });
    assert.ok(refused(r), JSON.stringify(r));
    assert.ok(namesLibrary(r), r.error);
    assert.match(r.error, /asset order/);
    assert.match(r.error, /build_object/, 'building from parts is named as the alternative');
    assert.match(r.error, /does not use an AI 3D generator/);
    assert.equal(s.calls.length, 0);
  }
});

test('the model rule holds no noun list: no noun, shape or name decides anything', () => {
  const src = readFileSync(join(WORKER, 'src', 'model-rule.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  for (const gone of ['PROP_WORDS', 'FUNCTION_WORDS', 'propWordIn', 'SUGGEST']) assert.equal(src.includes(gone), false, `${gone} is back`);
  assert.equal(/'tree'|'chest'|'lamp'|'pet'/.test(src), false);
});

test('the floating-island tool builds only plain terrain and leaves detailed props to the asset order', async () => {
  const s = studio();
  const r = await T.TOOLS.build_scene.run(s.ctx, { kit: 'floating_island', center: [0, 150, 0] });
  assert.ok(!refused(r), JSON.stringify(r).slice(0, 400));
  assert.equal(r.complete, false);
  assert.match(r.next, /find_library_model/);
  assert.doesNotMatch(r.next, /Never hand-build/i, 'the kit still forbids the order\'s last step');
  assert.equal(s.calls.filter((call) => call.op === 'create_instances').length, 0, 'the kit hand-built a prop');
});
