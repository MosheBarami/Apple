/**
 * THE WORLD-BUILDING TOOLS, THROUGH THE REAL REGISTRY.
 *
 * Extensions of tools the agent already has, so nothing new is registered:
 *   clone_instances   at / along / within: many copies at model-chosen positions in one call (place_copies ops, <= 200 each)
 *   create_instances  origin / group: build a structure in local space, then place it
 *   edit_terrain      action "path": a river, road, trench or tunnel along a line
 *   set_mood          overrides: any hour or feel after the nearest preset
 *   audit_build       scene: terrain, lighting and structure as measurements, so a terrain map is not "no geometry"
 *   scatter_instances a bare Workspace.X template path now works, like every other Studio tool
 * Subjects here are a hedge row, a stone arch and a pier; the tools know no subject.
 *
 * Run with:  node --test tests/world-building-tools.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'world-tools-'));
const outfile = join(temp, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`], { cwd: WORKER, stdio: 'pipe' });
const T = await import(pathToFileURL(outfile).href);
rmSync(temp, { recursive: true, force: true });

const ctxWith = (answer, over = {}) => {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true, addMemoryFact: async () => 'refused', execStudioOp: async (op) => { ops.push(op); return answer(op, ops); }, ...over } };
};
const run = async (ctx, name, args) => {
  const r = await T.runTool(ctx, name, JSON.stringify(args));
  return { ...r, data: JSON.parse(r.resultForLlm) };
};
const sp = (op) => op.op === 'spatial_query';

// ------------------------------------------------------------------------------------- clone_instances
const cloneStub = (over = {}) => (op) => {
  if (op.op === 'place_copies') return over.place ? over.place(op) : { ok: true, data: { placed: op.items.map((i) => `${i.parent}.${i.name}`), failed: [] } };
  if (op.op === 'get_tree') return { ok: true, data: { root: { name: 'Workspace', class: 'Workspace', children: over.children ?? [] } } };
  if (sp(op) && op.action === 'bounds') return { ok: true, data: { size: [4, 10, 4], center: [0, 5, 0], bottomY: 0 } };
  if (sp(op) && op.action === 'find_ground') return over.ground ?? { ok: true, data: { action: 'find_ground', result: { hit: true, position: [0, 7, 0] } } };
  return { ok: true, data: { created: [] } };
};
const placeOps = (ops) => ops.filter((o) => o.op === 'place_copies');

test('clone_instances at: one call places every copy at its position, named uniquely, in one place_copies op', async () => {
  const { ctx, ops } = ctxWith(cloneStub());
  const r = await run(ctx, 'clone_instances', { paths: ['Workspace.Pier'], at: [[0, 1, 0], [20, 1, 0], [40, 1, 0]], yaw: 90 });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.equal(r.data.placedCount, 3);
  const items = placeOps(ops)[0].items;
  assert.deepEqual(items.map((i) => i.at), [[0, 1, 0], [20, 1, 0], [40, 1, 0]]);
  assert.deepEqual(items.map((i) => i.name), ['Pier_1', 'Pier_2', 'Pier_3']);
  assert.ok(items.every((i) => i.from === 'game.Workspace.Pier' && i.parent === 'game.Workspace' && i.yaw === 90), 'the bare template path was not rooted, or the yaw was lost');
  assert.equal(r.mutatedProject, true);
});

test('clone_instances along: copies stand at equal spacing on the line; the same seed gives the same call', async () => {
  const a = ctxWith(cloneStub()); const b = ctxWith(cloneStub());
  const args = { paths: ['game.Workspace.Hedge'], along: { points: [[0, 0, 0], [60, 0, 0]], spacing: 15 }, jitter: 1, yaw: [0, 360], seed: 5 };
  await run(a.ctx, 'clone_instances', args);
  await run(b.ctx, 'clone_instances', args);
  assert.deepEqual(placeOps(a.ops), placeOps(b.ops), 'a fixed seed must give the same placement');
  const xs = placeOps(a.ops)[0].items.map((i) => Math.round(i.at[0]));
  assert.equal(xs.length, 5);
  xs.forEach((x, i) => assert.ok(Math.abs(x - i * 15) <= 1, `copy ${i} is at ${x}`));
});

test('clone_instances within: counts and minSpacing hold, and the ground is measured ONCE at the centre and said so', async () => {
  const { ctx, ops } = ctxWith(cloneStub());
  const r = await run(ctx, 'clone_instances', { paths: ['game.Workspace.Stone'], within: { rect: { min: [0, 0], max: [80, 80] }, count: 25, minSpacing: 8 }, seed: 2 });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.equal(ops.filter((o) => sp(o) && o.action === 'find_ground').length, 1, 'the ground was probed per copy');
  const items = placeOps(ops)[0].items;
  assert.equal(items.length, 25);
  assert.ok(items.every((i) => i.at[1] === 7), 'the measured ground height was not used');
  assert.match(r.data.notes.join(' '), /Ground height was measured once, at the centre of the area \(y 7\)/);
  // With y given there is no probe.
  const given = ctxWith(cloneStub());
  await run(given.ctx, 'clone_instances', { paths: ['game.Workspace.Stone'], within: { rect: { min: [0, 0], max: [80, 80] }, count: 5, y: 3 } });
  assert.equal(given.ops.filter((o) => sp(o) && o.action === 'find_ground').length, 0);
});

test('201 copies go as two place_copies ops (200 + 1), and a Folder wrapper is the template as it is', async () => {
  const { ctx, ops } = ctxWith(cloneStub());
  const r = await run(ctx, 'clone_instances', { paths: ['game.ServerStorage.Kit'], parent: 'game.Workspace.Row', along: { points: [[0, 0, 0], [400, 0, 0]], count: 201 } });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.deepEqual(placeOps(ops).map((o) => o.items.length), [200, 1]);
  assert.equal(r.data.placedCount, 201);
  assert.ok(placeOps(ops)[0].items.every((i) => i.from === 'game.ServerStorage.Kit' && i.parent === 'game.Workspace.Row'), 'the wrapper path was changed');
  assert.equal(r.data.placed.length, 20, 'the result carries only the head of the placed paths');
  assert.equal(r.data.placedMore, 181);
  assert.ok(r.resultForLlm.length < 3000);
});

test('names continue after what the parent already holds, so a second call does not collide', async () => {
  const { ctx, ops } = ctxWith(cloneStub({ children: [{ name: 'Post_1' }, { name: 'Post_7' }, { name: 'Postern' }] }));
  await run(ctx, 'clone_instances', { paths: ['game.Workspace.Post'], at: [[0, 0, 0], [5, 0, 0]] });
  assert.deepEqual(placeOps(ops)[0].items.map((i) => i.name), ['Post_8', 'Post_9']);
});

test('scale becomes a height from the template\'s measured height; several templates are cycled', async () => {
  const { ctx, ops } = ctxWith(cloneStub());
  await run(ctx, 'clone_instances', { paths: ['game.Workspace.A', 'game.Workspace.B'], at: [[0, 0, 0], [5, 0, 0], [10, 0, 0]], scale: 1.5 });
  const items = placeOps(ops)[0].items;
  assert.deepEqual(items.map((i) => i.from), ['game.Workspace.A', 'game.Workspace.B', 'game.Workspace.A']);
  assert.ok(items.every((i) => i.height === 15), 'a scale of 1.5 on a 10-stud template is a 15-stud height');
  assert.equal(ops.filter((o) => sp(o) && o.action === 'bounds').length, 2, 'each template is measured once');
});

test('clone_instances refuses what it cannot place, without sending a place_copies op', async () => {
  for (const [args, re] of [
    [{ paths: ['game.Workspace.A'], at: [[0, 0, 0]], along: { points: [[0, 0, 0], [1, 0, 0]], count: 2 } }, /exactly one of at, along or within/],
    [{ paths: ['game.Workspace.A'], along: { points: [[0, 0, 0]], count: 2 } }, /along\.points/],
    [{ paths: Array.from({ length: 9 }, (_, i) => `game.Workspace.T${i}`), at: [[0, 0, 0]] }, /at most 8 template paths/],
  ]) {
    const { ctx, ops } = ctxWith(cloneStub());
    const r = await run(ctx, 'clone_instances', args);
    assert.match(r.data.error, re);
    assert.equal(placeOps(ops).length, 0);
  }
  const noGround = ctxWith(cloneStub({ ground: { ok: true, data: { action: 'find_ground', result: { hit: false } } } }));
  assert.match((await run(noGround.ctx, 'clone_instances', { paths: ['game.Workspace.A'], within: { rect: { min: [0, 0], max: [9, 9] }, count: 2 } })).data.error, /no ground under its centre/);
});

test('a plugin without place_copies says so and names the way round it; a failure part-way says what landed', async () => {
  const old = ctxWith(cloneStub({ place: () => ({ ok: false, error: 'unknown Studio operation: place_copies', failure: 'refused' }) }));
  const r = await run(old.ctx, 'clone_instances', { paths: ['game.Workspace.A'], at: [[0, 0, 0]] });
  assert.match(r.data.error, /cannot place copies at positions yet \(it does not know place_copies\); update the StudPilot plugin/);
  assert.match(r.data.error, /clone_instances with only `paths`/);
  let calls = 0;
  const half = ctxWith(cloneStub({ place: (op) => (++calls === 2 ? { ok: false, error: 'Studio is busy', failure: 'internal' } : { ok: true, data: { placed: op.items.map((i) => i.name), failed: [] } }) }));
  const h = await run(half.ctx, 'clone_instances', { paths: ['game.Workspace.A'], along: { points: [[0, 0, 0], [400, 0, 0]], count: 300 } });
  assert.match(h.data.error, /Studio is busy after 200 of 300 copies were placed/);
  assert.equal(h.mutatedProject, true);
  assert.equal(h.data.placedCount, 200);
});

test('failed copies are reported with their index and the rest stand', async () => {
  const { ctx } = ctxWith(cloneStub({ place: (op) => ({ ok: true, data: { placed: op.items.slice(1).map((i) => i.name), failed: [{ index: 1, error: 'Workspace already has a Post_1' }] } }) }));
  const r = await run(ctx, 'clone_instances', { paths: ['game.Workspace.Post'], at: [[0, 0, 0], [5, 0, 0]] });
  assert.equal(r.data.placedCount, 1);
  assert.deepEqual(r.data.failed, [{ index: 0, error: 'Workspace already has a Post_1' }]);
});

test('plain clone_instances is unchanged', async () => {
  const { ctx, ops } = ctxWith(() => ({ ok: true, data: { created: ['game.Workspace.A2'], count: 1 } }));
  await run(ctx, 'clone_instances', { paths: ['Workspace.A'], parent: 'Workspace.Group' });
  assert.deepEqual(ops, [{ op: 'clone_instances', paths: ['game.Workspace.A'], parent: 'game.Workspace.Group' }]);
});

test('scatter_instances reads a bare Workspace.X template path, as every Studio tool now does', async () => {
  const { ctx, ops } = ctxWith(() => ({ ok: true, data: { placed: 3 } }));
  await run(ctx, 'scatter_instances', { template: 'Workspace.Hedge', count: 3, region: { min: [0, 0, 0], max: [40, 10, 40] } });
  assert.equal(ops[0].template, 'game.Workspace.Hedge');
});

test('scatter_instances states its parent: the template\'s own when it is inside Workspace, else Workspace, as the description says', async () => {
  const region = { min: [0, 0, 0], max: [40, 10, 40] };
  const inside = ctxWith(() => ({ ok: true, data: { placed: 1 } }));
  await run(inside.ctx, 'scatter_instances', { template: 'game.Workspace.Garden.Hedge', count: 1, region });
  assert.equal(inside.ops[0].parent, 'game.Workspace.Garden');
  const stored = ctxWith(() => ({ ok: true, data: { placed: 1 } }));
  await run(stored.ctx, 'scatter_instances', { template: 'game.ServerStorage.Hedge', count: 1, region });
  assert.equal(stored.ops[0].parent, 'game.Workspace', 'copies were sent to ServerStorage, where nothing sees them');
  const given = ctxWith(() => ({ ok: true, data: { placed: 1 } }));
  await run(given.ctx, 'scatter_instances', { template: 'game.Workspace.Hedge', count: 1, region, parent: 'game.Workspace.Row' });
  assert.equal(given.ops[0].parent, 'game.Workspace.Row');
  assert.match(T.TOOLS.scatter_instances.def.description, /default: the template's parent if inside Workspace, else Workspace/);
  // The example path is a neutral placeholder (no subject); the property is that the template's description shows a Workspace path.
  assert.match(T.TOOLS.scatter_instances.def.parameters.properties.template.description, /game\.Workspace\.Template/);
});

// ------------------------------------------------------------------------------------- create_instances origin / group
const created = (op) => ({ ok: true, data: { created: op.items?.map((i) => `${i.parent}.${i.name}`) ?? [] } });
const post = (name, pos) => ({ className: 'Part', name, parent: 'game.Workspace', props: { Position: pos, Size: [2, 8, 2] } });

test('create_instances with origin sends world coordinates: the local batch turned and moved, nothing else touched', async () => {
  const { ctx, ops } = ctxWith(created);
  const r = await run(ctx, 'create_instances', { items: [post('PierL', [-6, 4, 0]), post('PierR', [6, 4, 0])], origin: { at: [100, 2, 50], yaw: 90 } });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  const [l, rr] = ops[0].items;
  assert.deepEqual(l.props.Position, { t: 'Vector3', v: [100, 6, 56] });
  assert.deepEqual(rr.props.Position, { t: 'Vector3', v: [100, 6, 44] });
  assert.deepEqual(l.props.Size, { t: 'Vector3', v: [2, 8, 2] });
});

test('origin refuses what it cannot move, naming the property, and sends nothing', async () => {
  const { ctx, ops } = ctxWith(created);
  const r = await run(ctx, 'create_instances', { items: [{ className: 'Part', name: 'Odd', props: { WorldPivot: { t: 'CFrame', v: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } } }], origin: { at: [0, 0, 0] } });
  assert.match(r.data.error, /Nothing was created\. origin cannot place this batch: items\[0\]\.props\.WorldPivot/);
  assert.equal(ops.length, 0);
  assert.match((await run(ctx, 'create_instances', { items: [post('A', [0, 0, 0])], origin: { at: [1, 2] } })).data.error, /origin\.at must be/);
});

test('group wraps what the call created in one Model; PrimaryPart is set; a group over 120 items is refused first', async () => {
  const { ctx, ops } = ctxWith((op) => (op.op === 'group_instances' ? { ok: true, data: { path: 'game.Workspace.Arch' } } : created(op)));
  const r = await run(ctx, 'create_instances', { items: [post('PierL', [-6, 4, 0]), post('PierR', [6, 4, 0])], group: { className: 'Model', name: 'Arch', primaryPart: 'PierL' } });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.deepEqual(ops.map((o) => o.op), ['create_instances', 'group_instances', 'set_props']);
  assert.deepEqual(ops[1], { op: 'group_instances', paths: ['game.Workspace.PierL', 'game.Workspace.PierR'], name: 'Arch' });
  assert.deepEqual(ops[2].props.PrimaryPart, { t: 'Instance', v: 'game.Workspace.Arch.PierL' });
  assert.equal(r.data.group, 'game.Workspace.Arch');
  const big = ctxWith(created);
  const tooMany = await run(big.ctx, 'create_instances', { items: Array.from({ length: 121 }, (_, i) => post(`P${i}`, [i, 0, 0])), group: { className: 'Model', name: 'Wall' } });
  assert.match(tooMany.data.error, /holds at most 120 items per call/);
  assert.equal(big.ops.length, 0);
});

test('a group that fails after the items landed says the items are there', async () => {
  const { ctx } = ctxWith((op) => (op.op === 'group_instances' ? { ok: false, error: 'a sibling already uses that name', failure: 'conflict' } : created(op)));
  const r = await run(ctx, 'create_instances', { items: [post('PierL', [0, 0, 0])], group: { className: 'Model', name: 'Arch' } });
  assert.equal(r.data.error, undefined, 'the build itself succeeded');
  assert.match(r.data.groupWarning, /created but could not be grouped \(a sibling already uses that name\)/);
});

test('a Folder group is a Folder: made, then the items moved into it', async () => {
  const { ctx, ops } = ctxWith(created);
  const r = await run(ctx, 'create_instances', { items: [post('A', [0, 0, 0]), post('B', [5, 0, 0])], group: { className: 'Folder', name: 'Pier Set' } });
  assert.equal(r.data.group, 'game.Workspace["Pier Set"]');
  assert.deepEqual(ops.map((o) => o.op), ['create_instances', 'create_instances', 'move_instances']);
  assert.deepEqual(ops[1].items, [{ className: 'Folder', name: 'Pier Set', parent: 'game.Workspace' }]);
  assert.deepEqual(ops[2].moves.map((m) => m.newParent), ['game.Workspace["Pier Set"]', 'game.Workspace["Pier Set"]']);
});

test('the items of a group must share one parent', async () => {
  const { ctx, ops } = ctxWith(created);
  const r = await run(ctx, 'create_instances', { items: [post('A', [0, 0, 0]), { ...post('B', [1, 0, 0]), parent: 'game.Lighting' }], group: { className: 'Model', name: 'Mixed' } });
  assert.match(r.data.error, /share one parent/);
  assert.equal(ops.length, 0);
});

// ------------------------------------------------------------------------------------- edit_terrain path
const terrainOk = (op) => ({ ok: true, data: { filled: true } });
const fills = (ops) => ops.filter((o) => o.op === 'terrain_edit');

test('edit_terrain path: a river is one call, expanded into the existing fill_block operation', async () => {
  const { ctx, ops } = ctxWith(terrainOk);
  const r = await run(ctx, 'edit_terrain', { action: 'path', points: [[0, 20, 0], [100, 20, 0]], width: 16, depth: 8, fill: 'Water' });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.equal(fills(ops).length, 26, '13 carves then 13 water blocks');
  assert.ok(fills(ops).every((o) => o.action === 'fill_block' && o.size[0] === 16));
  assert.equal(r.data.operations, 26);
  assert.equal(r.data.completed, 26);
  assert.equal(r.mutatedProject, true);
});

test('edit_terrain path: chunked at 32, and a failure says where, how many ran and that the ground changed', async () => {
  const long = ctxWith(terrainOk);
  const r = await run(long.ctx, 'edit_terrain', { action: 'path', points: [[0, 10, 0], [300, 10, 0]], width: 8, depth: 8 });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.equal(fills(long.ops).length, 76, '300 studs at a 4-stud step is 76 blocks');
  let n = 0;
  const failing = ctxWith((op) => (++n === 40 ? { ok: false, error: 'terrain is busy', failure: 'internal' } : terrainOk(op)));
  const f = await run(failing.ctx, 'edit_terrain', { action: 'path', points: [[0, 10, 0], [300, 10, 0]], width: 8, depth: 8 });
  assert.match(f.data.error, /terrain is busy/);
  assert.equal(f.data.failedAt, 39);
  assert.equal(f.data.completed, 39);
  assert.equal(f.mutatedProject, true);
});

test('edit_terrain path among operations is expanded in place; a path over the cap is refused with the number', async () => {
  const { ctx, ops } = ctxWith(terrainOk);
  const r = await run(ctx, 'edit_terrain', { operations: [
    { action: 'fill_ball', center: [0, 0, 0], radius: 10, material: 'Enum.Material.Grass' },
    { action: 'path', points: [[0, 10, 0], [40, 10, 0]], width: 8, depth: 6 },
  ] });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.deepEqual(fills(ops).map((o) => o.action), ['fill_ball', ...Array(11).fill('fill_block')]);
  const huge = await run(ctxWith(terrainOk).ctx, 'edit_terrain', { action: 'path', points: [[0, 0, 0], [3000, 0, 0]], width: 8, depth: 8 });
  assert.match(huge.data.error, /the limit is 256 per call/);
  assert.match((await run(ctxWith(terrainOk).ctx, 'edit_terrain', { action: 'path', points: [[0, 0, 0]], width: 8, depth: 8 })).data.error, /points: 2-32/);
});

// ------------------------------------------------------------------------------------- set_mood overrides
const moodStub = (op) => {
  if (op.op === 'get_tree') return { ok: true, data: { root: { name: 'Lighting', class: 'Lighting', path: 'game.Lighting', children: [] } } };
  return { ok: true, data: { created: [], set: [] } };
};

test('set_mood overrides are applied after the preset: a night village is the nearest preset plus ClockTime and fog', async () => {
  const { ctx, ops } = ctxWith(moodStub);
  const r = await run(ctx, 'set_mood', { mood: 'night', overrides: { lighting: { ClockTime: 1.5, Brightness: 0.4, FogEnd: 400, FogColor: [10, 12, 30] }, atmosphere: { Density: 0.5 }, colorCorrection: { Saturation: -0.2 } } });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  const sets = ops.filter((o) => o.op === 'set_props');
  const lastLighting = sets.filter((o) => o.path === 'game.Lighting').at(-1);
  assert.deepEqual(lastLighting.props.ClockTime, { t: 'number', v: 1.5 });
  assert.deepEqual(lastLighting.props.FogColor, { t: 'Color3', v: [10 / 255, 12 / 255, 30 / 255] });
  assert.ok(ops.map((o) => o.op).lastIndexOf('set_props') > ops.map((o) => o.op).indexOf('create_instances'), 'overrides must come after the preset\'s instances');
  assert.ok(sets.some((o) => o.path === 'game.Lighting.Atmosphere' && o.props.Density.v === 0.5));
  assert.ok(sets.some((o) => o.path === 'game.Lighting.ColorCorrectionEffect' && o.props.Saturation.v === -0.2));
  assert.deepEqual(r.data.overrides.sort(), ['atmosphere.Density', 'colorCorrection.Saturation', 'lighting.Brightness', 'lighting.ClockTime', 'lighting.FogColor', 'lighting.FogEnd']);
});

test('a bad override is refused BEFORE anything changes, naming the property and what is allowed', async () => {
  for (const [overrides, re] of [
    [{ lighting: { Neutral: true } }, /overrides\.lighting\.Neutral cannot be set here.*Allowed: ClockTime/],
    [{ lighting: { ClockTime: 30 } }, /ClockTime must be a number from 0 to 24/],
    [{ lighting: { Ambient: [300, 0, 0] } }, /Ambient must be a colour \[r, g, b\] with each channel 0-255/],
    [{ lighting: { GlobalShadows: 'yes' } }, /GlobalShadows must be true or false/],
    [{ sky: {} }, /is not a group/],
    ['night', /overrides must be/],
  ]) {
    const { ctx, ops } = ctxWith(moodStub);
    const r = await run(ctx, 'set_mood', { mood: 'day', overrides });
    assert.match(r.data.error, re, JSON.stringify(overrides));
    assert.equal(ops.length, 0, 'a refused override must leave the place untouched');
  }
});

test('a group of overrides that fails is reported and the mood stands', async () => {
  const { ctx } = ctxWith((op) => (op.op === 'set_props' && op.path === 'game.Lighting.Atmosphere' ? { ok: false, error: 'Atmosphere is not in this place', failure: 'not_found' } : moodStub(op)));
  const r = await run(ctx, 'set_mood', { mood: 'day', overrides: { atmosphere: { Density: 0.1 } } });
  assert.equal(r.data.applied, 'day');
  assert.match(r.data.overridesFailed[0], /^atmosphere: Atmosphere is not in this place/);
});

// ------------------------------------------------------------------------------------- audit_build scene
const sceneStub = (opts = {}) => (op) => {
  if (op.op === 'get_tree' && op.root === 'game.Workspace') return { ok: true, data: { truncated: false, root: { name: 'Workspace', class: 'Workspace', children: opts.children ?? [] } } };
  if (op.op === 'get_tree') return { ok: true, data: { root: { name: 'Lighting', class: 'Lighting', props: { Brightness: { t: 'number', v: 0.4 }, ClockTime: { t: 'number', v: 1.5 }, Ambient: { t: 'Color3', v: [0.1, 0.1, 0.2] } }, children: [{ class: 'Atmosphere', name: 'Atmosphere' }] } } };
  if (op.op === 'terrain_read') return opts.terrain ?? { ok: true, data: { voxels: 65536, solidVoxels: 16384, materials: [{ material: 'Enum.Material.Grass', voxels: 12000 }, { material: 'Enum.Material.Rock', voxels: 4384 }] } };
  if (sp(op) && op.action === 'find_flat') return opts.flat ?? { ok: true, data: { sampled: 256, hits: 250, flat: [[0, 12, 0], [4, 18, 4], [8, 9, 8]] } };
  return { ok: false, error: `unexpected ${op.op}` };
};
const partNode = (name, pos) => ({ name, class: 'Part', props: { Position: { t: 'Vector3', v: pos }, Size: { t: 'Vector3', v: [4, 1, 4] }, Material: { t: 'EnumItem', v: 'Enum.Material.Grass' }, Color: { t: 'Color3', v: [0.3, 0.7, 0.3] }, Anchored: { t: 'bool', v: true } } });

test('audit_build on a terrain-only map reports what was measured instead of "no geometry"', async () => {
  const { ctx } = ctxWith(sceneStub());
  const r = await run(ctx, 'audit_build', {});
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.equal(r.data.partsAudited, 0);
  assert.equal(r.data.confirmed, 0);
  const t = r.data.scene.terrain;
  assert.equal(t.solidVoxels, 16384);
  assert.equal(t.fillRatio, 0.25);
  assert.deepEqual(t.materials.map((m) => m.material), ['Enum.Material.Grass', 'Enum.Material.Rock']);
  assert.deepEqual(t.groundProbe, { raysCast: 256, raysHit: 250, sampledHeights: { min: 9, max: 18, count: 3 } });
  assert.match(r.data.text, /Nothing was judged/);
});

test('audit_build with parts adds the scene: lighting as numbers, groups and models with meshes', async () => {
  const children = [
    { name: 'Village', class: 'Folder', childCount: 14, children: [{ name: 'Hut', class: 'Model', children: [{ name: 'Walls', class: 'MeshPart' }] }, { name: 'Well', class: 'Model', children: [partNode('Ring', [0, 1, 0])] }] },
    { name: 'Lone', class: 'Model', childCount: 2, children: [] },
    partNode('Ground', [0, 0, 0]),
  ];
  const { ctx } = ctxWith(sceneStub({ children }));
  const r = await run(ctx, 'audit_build', {});
  assert.equal(r.data.error, undefined, r.resultForLlm);
  const scene = r.data.scene;
  assert.equal(scene.lighting.clockTime, 1.5);
  assert.equal(scene.lighting.brightness, 0.4);
  assert.equal(scene.lighting.atmospherePresent, true);
  assert.deepEqual(scene.structure.topLevel.groups[0], { name: 'Village', className: 'Folder', children: 14 });
  assert.equal(scene.structure.topLevel.count, 3);
  assert.equal(scene.structure.modelsWithMeshes, 1, 'only the Model holding a MeshPart is evidence of an inserted model');
  assert.ok(r.data.partsAudited >= 1);
});

test('a terrain or ground read that fails is said, not rendered as an empty scene', async () => {
  const { ctx } = ctxWith(sceneStub({ children: [partNode('Ground', [0, 0, 0])], terrain: { ok: false, error: 'terrain is not readable here', failure: 'refused' }, flat: { ok: false, error: 'no ray' } }));
  const r = await run(ctx, 'audit_build', {});
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.match(r.data.scene.terrain.terrainUnavailable, /terrain is not readable here/);
  assert.match(r.data.scene.terrain.groundProbeUnavailable, /no ray/);
  const none = await run(ctxWith(sceneStub({ terrain: { ok: true, data: { voxels: 100, solidVoxels: 0, materials: [] } } })).ctx, 'audit_build', {});
  assert.match(none.data.error, /no geometry in Workspace to audit yet/, 'an empty place with no terrain is still "build something first"');
});

// ------------------------------------------------------------------------------------- the plugin's own allowlist
test('every property set_mood overrides can set is one the plugin\'s PROPERTY_ALLOW writes (the live plugin once refused names its source accepted)', () => {
  const luau = readFileSync(join(WORKER, '..', 'studpilot-plugin', 'src', 'Commands.luau'), 'utf8');
  const start = luau.indexOf('local PROPERTY_ALLOW = {');
  assert.ok(start > 0, 'the plugin allowlist moved — re-aim this test');
  const block = luau.slice(start, luau.indexOf('\n}\n', start));
  const allowed = new Set([...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*) = true,/gm)].map((m) => m[1]));
  assert.ok(allowed.size > 50, 'the allowlist was not read');
  const description = T.TOOLS.set_mood.def.parameters.properties.overrides.description;
  const groups = [...description.matchAll(/(lighting|atmosphere|colorCorrection)\?: \{([^}]*)\}/g)];
  assert.equal(groups.length, 3, 'the override groups are not named in the description');
  for (const [, group, names] of groups) {
    const list = names.split(',').map((n) => n.trim()).filter(Boolean);
    assert.ok(list.length >= 4, `${group} lists too few properties to mean anything`);
    for (const name of list) assert.ok(allowed.has(name), `${group}.${name} is offered by set_mood but the plugin's allowlist does not write it`);
  }
});
