/**
 * Ready-made models for the agent to look at, choose and place; presentation only when asked (owner, 2026-10-02).
 *
 * The 2026-10-02 benchmark (13 items, matches mean 0.38 out of 2) showed the harness choosing by NAME and adding the same
 * kit to everything: a knife for a treasure chest, a Doge head for a robot pet, party balloons for a hot air balloon.
 * The contract now: the run starts with the model; the agent searches with its own words, previews candidates here
 * (evidence, off the place), chooses in its own loop, places, and dresses only what it decides to. Capability, not taste:
 * nothing here judges whether something is pretty or fits.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'library-object-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export * from '${join(WORKER, 'src', 'library-object.ts')}';\nexport * from '${join(WORKER, 'src', 'dress-object.ts')}';\nexport { TOOLS } from '${join(WORKER, 'src', 'tools.ts')}';\n`);
const out = join(dir, 'l.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
const L = await import(`file://${out}`);
const src = (f) => readFileSync(join(WORKER, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ------------------------------------------------------------------------------------------ a fake Studio ---

const part = (x, y, z, sx, sy, sz, color = [1, 0, 0]) => ({ class: 'Part', name: 'P', props: { Size: { v: [sx, sy, sz] }, CFrame: { v: [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, Color: { v: color } }, children: [] });
const tree = (kids, name = 'Piece') => ({ root: { class: 'Model', name, children: kids } });
/** Studio as the harness sees it: records every op, remembers what exists, answers each op the way the plugin does. */
function studio(init = {}) {
  const ops = [];
  const exists = new Set(init.exists ?? []);
  const ctx = {
    env: {}, studioConnected: () => true,
    createCheckpoint: async () => ({ id: 'cp' }),
    execStudioOp: async (op) => {
      ops.push(op);
      switch (op.op) {
        case 'get_instance': return exists.has(op.path) ? { ok: true, data: { path: op.path } } : { ok: false, error: `instance not found at ${op.path}` };
        case 'create_instances': for (const i of op.items) exists.add(`${i.parent}.${i.name}`); return { ok: true, data: {} };
        case 'delete_instances': for (const p of op.paths) for (const e of [...exists]) if (e === p || e.startsWith(`${p}.`)) exists.delete(e); return { ok: true, data: {} };
        case 'import_owner_library': return init.importFails ? { ok: false, error: 'game not found' } : { ok: true, data: {} };
        case 'get_tree': if (init.absent?.includes(op.root)) return { ok: false, error: 'instance not found' }; return { ok: true, data: init.trees?.(op.root) ?? tree([part(0, 3, 0, 6, 6, 6), { class: 'Script', name: 'S', children: [] }, { class: 'Sound', name: 'Snd', children: [] }]) };
        case 'place_copies': for (const i of op.items) exists.add(`${i.parent}.${i.name}`); return { ok: true, data: { placed: op.items.map((i) => `${i.parent}.${i.name}`), failed: [] } };
        case 'spatial_query': return op.action === 'overlap' ? { ok: true, data: { parts: [], count: 0 } } : { ok: true, data: { center: [0, 3, -26], size: init.size ?? [6, 6, 6], bottomY: 0 } };
        case 'capture_studio_viewport': return init.noShot ? { ok: false, error: 'screenshots are not permitted' } : { ok: true, data: { source: 'studio_viewport', encoding: 'rgb24', rgbBase64: 'AAAA', width: 1, height: 1 } };
        default: return { ok: true, data: {} };
      }
    },
  };
  return { ctx, ops, exists };
}
const GAME = 'a1b2c3d4e5f6';
const created = (ops) => ops.filter((o) => o.op === 'create_instances').flatMap((o) => o.items.map((i) => `${i.parent}.${i.name}`));
const allText = (ops) => JSON.stringify(ops);
const writes = (ops) => ops.filter((o) => !['get_instance', 'get_tree', 'spatial_query'].includes(o.op));

// -------------------------------------------------------------------------------------------------- names ---

test('a name may be in any language; dots, brackets and control characters are taken out; nothing is derived from the request', () => {
  assert.equal(L.safeObjectName('ברווז גומי'), 'ברווז גומי');
  assert.equal(L.safeObjectName('Treasure Chest'), 'Treasure Chest');
  assert.equal(L.safeObjectName('a.b[c]"d\n'), 'a b c d');
  assert.equal(L.safeObjectName('x'.repeat(100)).length, 40);
  assert.equal(L.safeObjectName(undefined), '');
  assert.equal(L.safeObjectName('...'), '');
  const lib = src('library-object.ts');
  assert.equal(/MyObject/.test(lib), false, 'no shared default name');
});

test('a Hebrew name is allocated as itself and does not collide with another Hebrew name (no shared default)', async () => {
  const { ctx } = studio({ exists: ['game.Workspace.ברווז גומי'] });
  const free = await L.allocateName(ctx, 'כלב רובוט', undefined);
  assert.deepEqual(free, { name: 'כלב רובוט', path: 'game.Workspace.כלב רובוט' });
  const other = await L.allocateName(ctx, 'מנורה', undefined);
  assert.notEqual(other.name, free.name);
  const taken = await L.allocateName(ctx, 'ברווז גומי', undefined);
  assert.match(taken.error, /already exists/);
  assert.match(taken.error, /another name/, 'the error tells the agent how to resolve it');
});

test('a taken name is an error the agent resolves; it is replaced only when it says so, and only that path is deleted', async () => {
  const { ctx, ops } = studio({ exists: ['game.Workspace.Chest'] });
  assert.match((await L.allocateName(ctx, 'Chest', 'Fallback')).error, /already exists/);
  assert.equal(ops.some((o) => o.op === 'delete_instances'), false, 'nothing is deleted unasked');
  const replaced = await L.allocateName(ctx, 'Chest', 'Fallback', true);
  assert.equal(replaced.path, 'game.Workspace.Chest');
  assert.deepEqual(ops.filter((o) => o.op === 'delete_instances').map((o) => o.paths), [['game.Workspace.Chest']]);
});

test('with no name from the agent the piece\'s own name is used, never request words', async () => {
  const { ctx } = studio();
  assert.equal((await L.allocateName(ctx, undefined, 'Old Lamp')).name, 'Old Lamp');
  assert.match((await L.allocateName(ctx, undefined, undefined)).error, /name the object/);
});

// ------------------------------------------------------------------------------------------- candidates ---

test('a candidate is named back as { id } or { gameId, path }, and refused otherwise', () => {
  assert.deepEqual(L.candidateOf({ id: 'lib:abc' }), { source: 'store', name: 'Model', id: 'lib:abc' });
  const own = L.candidateOf({ gameId: GAME, path: '/Workspace/Lamp#2', game: 'Some Game' });
  assert.equal(own.source, 'owner');
  assert.equal(own.name, 'Lamp');
  assert.match(L.candidateOf({ gameId: 'zz', path: '/Workspace/X' }).error, /library game id/);
  assert.match(L.candidateOf({ gameId: GAME, path: 'Workspace/X' }).error, /path/);
  assert.match(L.candidateOf({}).error, /id|gameId/);
  assert.match(L.candidateOf('x').error, /object/);
});

test('copyability is annotated per row with its reason; nothing is dropped, ranked or de-duplicated', () => {
  const item = (name, game, extra = {}) => ({ gameId: GAME, game, kind: 'model', name, className: 'Model', path: `/Workspace/${name}`, parts: 5, instances: 9, ...extra });
  const rows = [item('Alpha', 'G1'), item('Alpha', 'G1', { path: '/Workspace/Alpha#2' }), item('Person', 'G2', { contains: ['Humanoid'] }),
    item('Huge', 'G3', { parts: 900 }), item('Empty', 'G4', { parts: 0 }), item('Sound', 'G5', { kind: 'sound' }), item('Gui', 'G6', { className: 'ScreenGui' })];
  const out = L.annotateModels(rows);
  assert.equal(out.length, rows.length, 'every row stays');
  assert.deepEqual(out.map((r) => r.copyable), [true, true, false, false, false, false, false]);
  assert.match(out[2].notCopyableBecause, /Humanoid/);
  assert.match(out[3].notCopyableBecause, /900 parts.*too big/);
  assert.match(out[4].notCopyableBecause, /no parts/);
  assert.match(out[5].notCopyableBecause, /not a model/);
  assert.match(out[6].notCopyableBecause, /ScreenGui/);
  assert.equal(out[0].name, 'Alpha');
  assert.equal(out[1].name, 'Alpha', 'a second row from one game is not hidden');
});

test('a models search through browse_owner_library carries the annotation, other kinds are returned as the plugin gave them', async () => {
  const { ctx } = studio();
  const items = [{ gameId: GAME, kind: 'model', name: 'Alpha', className: 'Model', path: '/Workspace/Alpha', parts: 5, instances: 9 }];
  const seen = [];
  ctx.localOwnerGateway = true; ctx.userId = 'u';
  ctx.execStudioOp = async (op) => { seen.push(op); return { ok: true, data: { items } }; };
  const models = await L.TOOLS.browse_owner_library.run(ctx, { kind: 'model', q: 'chest' });
  assert.equal(models.error, undefined);
  assert.equal(models.items[0].copyable, true);
  const ui = await L.TOOLS.browse_owner_library.run(ctx, { kind: 'ui', q: 'x' });
  assert.equal('copyable' in (ui.items?.[0] ?? {}), false);
});

// ------------------------------------------------------------------------------------------ the preview ---

test('preview_library_models is registered, a read-style tool the agent calls with its own candidates', () => {
  const def = L.TOOLS.preview_library_models.def;
  assert.equal(def.name, 'preview_library_models');
  assert.match(def.description, /nothing is placed or chosen for you/);
  assert.deepEqual(def.parameters.required, ['models']);
  assert.equal(L.TOOLS.preview_library_models.mutatesProject, undefined, 'it leaves nothing behind');
  assert.equal(L.TOOLS.cool_library_model, undefined, 'the baked-in cooler is gone');
});

test('a preview stages in ServerStorage only, measures, strips scripts, and cleans up; nothing reaches Workspace', async () => {
  const { ctx, ops, exists } = studio();
  const r = await L.previewLibraryModels(ctx, [{ gameId: GAME, path: '/Workspace/Chest', name: 'Chest', game: 'Pirates' }, { gameId: GAME, path: '/Workspace/Barrel' }]);
  assert.equal(r.previews.length, 2);
  const first = r.previews[0];
  assert.equal(first.name, 'Chest');
  assert.equal(first.game, 'Pirates');
  assert.deepEqual(first.size, [6, 6, 6]);
  assert.match(first.sizeNote, /about 6 studs at its longest \(1\.2 player heights; a player is 5 studs tall\)/);
  assert.equal(first.dominantColourName, 'red');
  assert.equal(first.scriptsAndSoundsLeftOut, 2);
  assert.equal(first.parts, 1);
  assert.ok(first.gameId && first.path, 'the agent gets the reference back to place it');
  for (const path of created(ops)) assert.match(path, /^game\.ServerStorage\./, `a preview wrote to ${path}`);
  assert.ok(ops.some((o) => o.op === 'strip_descendants' && o.root.startsWith('game.ServerStorage.AppleParts.ApplePreview') && o.classes.includes('Script')), 'scripts and sounds are stripped');
  assert.equal(ops.some((o) => o.op === 'place_copies' || o.op === 'camera_focus' || o.op === 'capture_studio_viewport'), false, 'no snapshot, no row, no camera');
  assert.deepEqual([...exists].filter((p) => p.startsWith('game.ServerStorage') || p.startsWith('game.Workspace')), [], 'everything staged is taken away again');
  assert.equal(r.snapshot, undefined);
  assert.match(r.note, /nothing chosen|Nothing is placed and nothing is chosen/i);
});

test('a preview reports what blocks a piece as a fact and lists candidates that could not be staged, choosing none', async () => {
  const withPerson = studio({ trees: () => tree([part(0, 3, 0, 2, 6, 2), { class: 'Humanoid', name: 'H', children: [] }]) });
  const r = await L.previewLibraryModels(withPerson.ctx, [{ gameId: GAME, path: '/Workspace/Person' }]);
  assert.match(r.previews[0].blockedBecause, /Humanoid/);
  const broken = studio({ importFails: true });
  const f = await L.previewLibraryModels(broken.ctx, [{ gameId: GAME, path: '/Workspace/Gone', name: 'Gone' }]);
  assert.deepEqual(f.previews, []);
  assert.match(f.failed[0].because, /could not be imported/);
  assert.match((await L.previewLibraryModels(broken.ctx, [])).error, /1 to 6/);
  assert.match((await L.previewLibraryModels(broken.ctx, [{}])).error, /id|gameId/);
});

test('a preview with a snapshot stands the row in Workspace for one picture and takes it down, even when Studio gives no pixels', async () => {
  for (const noShot of [false, true]) {
    const { ctx, ops, exists } = studio({ noShot });
    const frames = [];
    ctx.emitFrame = (f) => frames.push(f);
    const r = await L.previewLibraryModels(ctx, [{ gameId: GAME, path: '/Workspace/A', name: 'A' }, { gameId: GAME, path: '/Workspace/B', name: 'B' }], { snapshot: true });
    assert.ok(created(ops).includes('game.Workspace.ApplePreviewLineup'), 'a row was stood up for the picture');
    assert.ok(ops.some((o) => o.op === 'capture_studio_viewport'));
    assert.equal(frames.length, noShot ? 0 : 1, 'the picture goes to the user');
    assert.match(r.snapshot.note, noShot ? /no viewport pixels/ : /taken down/);
    assert.deepEqual([...exists].filter((p) => p.startsWith('game.Workspace') || p.startsWith('game.ServerStorage')), [], 'the row and the staging are gone');
    assert.equal(r.previews.length, 2, 'the measured evidence stands either way');
  }
});

// ------------------------------------------------------------------------------------------ placing ---

test('placing is pure placement: no stage, no wobble, no counter, no light, no ground or spawn change, no camera, no mood', async () => {
  const { ctx, ops } = studio();
  const r = await L.placeLibraryPiece(ctx, L.candidateOf({ gameId: GAME, path: '/Workspace/Chest', name: 'Chest' }), { name: 'Treasure Chest' });
  assert.equal(r.object, 'game.Workspace.Treasure Chest');
  assert.deepEqual(r.size, [6, 6, 6]);
  assert.match(r.sizeNote, /player heights/);
  const text = allText(writes(ops));
  for (const banned of ['Stage', 'AppleBody', 'AppleAnimations', 'StarterGui', 'Baseplate', 'SpawnLocation', 'Lighting']) assert.equal(text.includes(banned), false, `placement touched ${banned}`);
  assert.equal(ops.some((o) => ['camera_focus', 'rig_model', 'edit_script', 'set_props', 'apply_surface'].includes(o.op)), false);
  assert.match(r.note, /nothing else added/i);
  const place = ops.find((o) => o.op === 'place_copies' && o.items[0].parent === 'game.Workspace');
  assert.equal(place.items[0].name, 'Treasure Chest');
  assert.equal('length' in place.items[0] || 'height' in place.items[0], false, 'its own size unless the agent asked for another');
  assert.ok(ops.some((o) => o.op === 'strip_descendants'), 'script-free');
});

test('the size is the agent\'s: size, height or scale, one of them, and a scale needs a measured piece', async () => {
  const run = async (size, init) => { const s = studio(init); const r = await L.placeLibraryPiece(s.ctx, L.candidateOf({ gameId: GAME, path: '/Workspace/X', name: 'X' }), { name: 'X', size }); return { r, place: s.ops.find((o) => o.op === 'place_copies' && o.items[0].parent === 'game.Workspace')?.items[0] }; };
  assert.equal((await run({ size: 30 })).place.length, 30);
  assert.equal((await run({ height: 9 })).place.height, 9);
  assert.equal((await run({ scale: 2 })).place.length, 12, 'twice its own 6 studs');
  assert.deepEqual(L.placeSizeOf({ size: 5, scale: 2 }), { error: 'give one of size (longest side in studs), height or scale, not several' });
  assert.match(L.placeSizeOf({ scale: 0 }).error, /scale must be/);
  assert.deepEqual(L.placeSizeOf({}), {});
  const big = await run({ scale: 2 }, { trees: () => ({ truncated: true, root: { class: 'Model', children: [] } }) });
  assert.match(big.r.error, /scale needs the size/);
});

test('a placed model goes where the agent says, or beside what is there; a character is never placed; a taken name is refused', async () => {
  const at = studio();
  await L.placeLibraryPiece(at.ctx, L.candidateOf({ gameId: GAME, path: '/Workspace/X', name: 'X' }), { name: 'X', at: [10, 0, 20] });
  assert.deepEqual(at.ops.find((o) => o.op === 'place_copies' && o.items[0].parent === 'game.Workspace').items[0].at, [10, 0, 20]);
  const beside = studio();
  await L.placeLibraryPiece(beside.ctx, L.candidateOf({ gameId: GAME, path: '/Workspace/X', name: 'X' }), { name: 'X' });
  assert.ok(beside.ops.some((o) => o.op === 'spatial_query' && o.action === 'overlap'), 'the free lane is looked for when no place is given');
  const person = studio({ trees: () => tree([part(0, 3, 0, 2, 6, 2), { class: 'Humanoid', name: 'H', children: [] }]) });
  assert.match((await L.placeLibraryPiece(person.ctx, L.candidateOf({ gameId: GAME, path: '/Workspace/P', name: 'P' }), { name: 'P' })).error, /Humanoid/);
  const taken = studio({ exists: ['game.Workspace.X'] });
  const refused = await L.placeLibraryPiece(taken.ctx, L.candidateOf({ gameId: GAME, path: '/Workspace/X', name: 'X' }), { name: 'X' });
  assert.match(refused.error, /already exists/);
  assert.equal(taken.ops.some((o) => o.op === 'delete_instances' && o.paths[0] === 'game.Workspace.X'), false, 'it did not delete what it did not make');
});

test('insert_library_model places an owner-library piece by { gameId, path } with the same pure placement, and refuses a bad size', async () => {
  const { ctx, ops } = studio();
  const r = await L.TOOLS.insert_library_model.run(ctx, { gameId: GAME, path: '/Workspace/Lamp', name: 'Lamp', size: 8 });
  assert.equal(r.object, 'game.Workspace.Lamp');
  assert.equal(ops.find((o) => o.op === 'place_copies' && o.items[0].parent === 'game.Workspace').items[0].length, 8);
  assert.match((await L.TOOLS.insert_library_model.run(ctx, { gameId: GAME, path: '/Workspace/Lamp', size: 8, height: 3 })).error, /not several/);
  assert.match((await L.TOOLS.insert_library_model.run(ctx, {})).error, /give \{ id \}/);
  const params = L.TOOLS.insert_library_model.def.parameters.properties;
  for (const k of ['id', 'gameId', 'path', 'name', 'size', 'height', 'scale', 'replace']) assert.ok(k in params, k);
  assert.deepEqual(L.TOOLS.insert_library_model.def.parameters.required ?? [], []);
});

// ---------------------------------------------------------------------------------------------- dressing ---

test('an empty dress_object call is an error that asks the agent to choose; nothing is added by default', async () => {
  const { ctx, ops } = studio();
  const r = await L.dressObject(ctx, { target: 'game.Workspace.Chest' });
  assert.match(r.error, /choose at least one/);
  assert.equal(ops.length, 0, 'it did not even look at the place');
  assert.match((await L.dressObject(ctx, { target: 'game.Workspace.Chest', click: false })).error, /choose at least one/);
  assert.match((await L.dressObject(ctx, { stage: true })).error, /target must be/);
  const gone = studio({ absent: ['game.Workspace.Missing'] });
  assert.match((await L.dressObject(gone.ctx, { target: 'game.Workspace.Missing', stage: true })).error, /not in the place/);
});

test('dress_object adds only what is asked for: a stage alone makes no click response, counter or text', async () => {
  const { ctx, ops } = studio({ exists: ['game.Workspace.Chest'] });
  const r = await L.dressObject(ctx, { target: 'game.Workspace.Chest', stage: { color: '#4f8cff', height: 2 } });
  assert.equal(r.changed, true);
  assert.match(r.added[0], /stage 2 studs high under it/);
  assert.match(r.notAdded, /click, counter, attach, light, effect/);
  const text = allText(writes(ops));
  for (const banned of ['AppleBody', 'AppleAnimations', 'StarterGui', 'Click it', 'wobble', 'squish', 'Baseplate', 'Lighting']) assert.equal(text.includes(banned), false, `a stage-only call wrote ${banned}`);
  assert.deepEqual(ops.find((o) => o.op === 'transform_instances').move, [0, 2, 0], 'the object is raised to stand on it');
  assert.ok(created(ops).includes('game.Workspace.ChestStage'));
});

test('click is the agent\'s motion with the agent\'s sound; an unknown motion is an error, never a silent wobble', async () => {
  const { ctx, ops } = studio({ exists: ['game.Workspace.Chest'] });
  const bad = await L.dressObject(ctx, { target: 'game.Workspace.Chest', click: {} });
  assert.match(bad.error, /click\.motion must be one of/);
  const r = await L.dressObject(ctx, { target: 'game.Workspace.Chest', click: { motion: 'spin' } });
  assert.equal(r.changed, true, JSON.stringify(r));
  assert.match(r.added[0], /spins when clicked or walked into \(no sound \(none asked for\)\)/);
  const script = ops.find((o) => o.op === 'edit_script' && /AppleAnimations/.test(o.path));
  assert.match(script.source, /AppleBody\.spin/);
  assert.equal(/sound/.test(script.source), false, 'no sound the agent did not choose');
  assert.equal(allText(ops).includes('Click it'), false);
  assert.equal(created(ops).some((p) => /HUD/.test(p)), false, 'no counter unless asked');
  const withSound = studio({ exists: ['game.Workspace.Chest'] });
  const s = await L.dressObject(withSound.ctx, { target: 'game.Workspace.Chest', click: { motion: 'pop', sound: 123456 } });
  assert.match(withSound.ops.find((o) => o.op === 'edit_script' && /AppleAnimations/.test(o.path)).source, /rbxassetid:\/\/123456/);
  assert.match(s.added[0], /sound id 123456/);
});

test('a counter needs the click it counts, and is drawn only when asked for, in the user\'s own words', async () => {
  const { ctx } = studio({ exists: ['game.Workspace.Chest'] });
  assert.match((await L.dressObject(ctx, { target: 'game.Workspace.Chest', counter: { label: 'x' } })).error, /ask for click in the same call/);
  const both = studio({ exists: ['game.Workspace.חזה'] });
  const r = await both.ctx.execStudioOp ? await L.dressObject(both.ctx, { target: 'game.Workspace.חזה', click: { motion: 'bob' }, counter: { label: 'פתיחות', hint: 'לחצו עליו' } }) : null;
  assert.equal(r.changed, true, JSON.stringify(r));
  assert.ok(r.added.some((a) => /counter "פתיחות"/.test(a)));
  const hudScript = both.ops.find((o) => o.op === 'edit_script' && /HUDScript/.test(o.path));
  assert.ok(hudScript, 'the screen script is written');
  assert.match(hudScript.path, /חזהHUDScript/);
});

test('light and effect go where the agent says; an unknown effect is an error that lists the choices, not a substitute', async () => {
  const { ctx, ops } = studio({ exists: ['game.Workspace.Chest', 'game.Workspace.Chest.Lid'] });
  const noWhere = await L.dressObject(ctx, { target: 'game.Workspace.Chest', light: {} });
  assert.match(noWhere.error, /name the part it goes on/);
  const r = await L.dressObject(ctx, { target: 'game.Workspace.Chest', light: { on: 'game.Workspace.Chest.Lid', color: '#ffcc00' }, effect: { preset: 'no_such_preset', on: 'game.Workspace.Chest.Lid' } });
  assert.match(r.added[0], /light on Chest\.Lid/);
  assert.match(r.problems.find((p) => /^effect/.test(p)), /unknown preset "no_such_preset"\. Choose one of/);
  assert.equal(allText(ops).includes('sparkle_shimmer'), false, 'no silent replacement');
  assert.equal(allText(ops).includes('CoolOrb'), false);
});

test('dress_object is registered with its own label, phase and MCP note, and cool_library_model is gone everywhere', () => {
  assert.equal(L.TOOLS.dress_object.def.name, 'dress_object');
  assert.deepEqual(L.TOOLS.dress_object.def.parameters.required, ['target']);
  for (const f of ['tools.ts', 'mcp.ts', 'run-idle.ts', 'do/session.ts']) assert.equal(/cool_library_model|coolLibraryObject|coolChoice/.test(src(f)), false, f);
  const shared = readFileSync(join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.equal(/cool_library_model/.test(shared), false);
  for (const tool of ['dress_object', 'preview_library_models']) {
    assert.ok(shared.includes(`'${tool}'`), `${tool} is in the shared registry`);
    assert.ok(src('mcp.ts').includes(`${tool}:`), `${tool} has its MCP exclusion note`);
  }
  assert.ok(src('run-idle.ts').includes('dress_object:'), 'run-idle names it');
});

// ------------------------------------------------------------------------------------ the run starts with the model ---

test('no library step runs before the first model call, and nothing in the run loop picks, offers or forces', () => {
  const session = src('do/session.ts');
  assert.equal(/libraryObjectStep|offerLibraryObjects|placeChosenObject|pickPrompt|pickedIndex|clearLineup|pendingObjectChoice|staleLineup/.test(session), false);
  assert.ok(session.search(/\bllmChat\(/) > 0, 'the loop still calls the model');
  for (const f of ['library-object.ts', 'dress-object.ts']) {
    const s = src(f);
    assert.equal(/objectQueries|rankCatalog|storeCandidates|objectWords|objectNameOf|libraryFit|sizeFactor/.test(s), false, `${f} matches by name again`);
  }
});

test('previewing and placing never decorate: the files hold no motion, stage, counter, mood or crown outside dress_object', () => {
  const lib = src('library-object.ts');
  for (const word of ['wobble', 'AppleBody', 'writeObjectHud', 'set_mood', 'groundAndSpawn', 'contrastStage', 'Baseplate', 'SpawnLocation', 'camera_focus']) {
    if (word === 'camera_focus') continue; // the snapshot row's own framing, inside the preview only
    assert.equal(lib.includes(word), false, `library-object.ts holds ${word}`);
  }
});
