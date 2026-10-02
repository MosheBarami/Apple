// Putting imported library models where a player finds them: on the ground, near the spawn or on the plots, resting on a
// surface, touching nothing else, never inside a wall. The maths is tested on its own and the whole loop against a
// stand-in Studio that answers the way the plugin's spatial_query / transform_instances / clone_instances do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fakeStudio } from './fixtures/fake-studio.mjs';

const esbuild = await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'library-placement-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
await esbuild.build({ entryPoints: ['src/library-placement.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'p.mjs'), alias: { '@apple/shared': '../../packages/shared/src/index.ts' } });
const P = await import(pathToFileURL(join(dir, 'p.mjs')).href);

const TREE = { name: 'Tree', class: 'Model', center: [300, -40, 300], size: [4, 8, 4] };
const bottomOf = (n) => n.center[1] - n.size[1] / 2;
const importTree = (f, root = TREE) => { const path = 'game.Workspace.' + root.name; f.world.add(path, { class: root.class, center: root.center && [...root.center], size: root.size }); return path; };
const placedNodes = (f) => [...f.world.nodes.values()].filter((n) => n.path.startsWith('game.Workspace.Tree'));
const FAR = () => Date.now() + 10 * 60_000;

test('spiralPoint: stays between the radii, is deterministic, and spreads neighbours apart', () => {
  const pts = Array.from({ length: 24 }, (_, i) => P.spiralPoint(10, -5, 14, 80, i, 24, 0));
  for (const [x, z] of pts) { const r = Math.hypot(x - 10, z + 5); assert.ok(r >= 14 - 1e-9 && r <= 80 + 1e-9, `radius ${r}`); }
  assert.deepEqual(pts, Array.from({ length: 24 }, (_, i) => P.spiralPoint(10, -5, 14, 80, i, 24, 0)));
  assert.notDeepEqual(pts[3], P.spiralPoint(10, -5, 14, 80, 3, 24, 1), 'another phase (seed) gives other spots');
  let nearest = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) nearest = Math.min(nearest, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  assert.ok(nearest > 6, `the closest two of 24 spots are ${nearest.toFixed(1)} studs apart`);
});

test('restingMove puts the box bottom on the ground and its centre over the wanted spot', () => {
  const box = { center: [300, -40, 300], size: [4, 8, 4], bottomY: -44, topY: -36 };
  for (const [x, z, groundY] of [[10, 20, 0], [-33, 4.5, 7.25], [0, 0, -12]]) {
    const m = P.restingMove(box, x, z, groundY);
    assert.equal(box.center[0] + m[0], x); assert.equal(box.center[2] + m[2], z);
    assert.ok(Math.abs(box.bottomY + m[1] - groundY) < 1e-9, 'bottom on the hit');
  }
});

test('footprints: a spot is crowded when it comes within both radii and a gap of a placed model', () => {
  assert.ok(Math.abs(P.footprintRadius([6, 9, 8]) - 5) < 1e-9, 'half the diagonal, whatever the height');
  const placed = [{ x: 0, z: 0, r: 3 }];
  assert.equal(P.crowded(8.5, 0, 3, placed), false); // 3 + 3 + a gap of 2 = 8
  assert.equal(P.crowded(7.9, 0, 3, placed), true);
  assert.equal(P.crowded(0, 0, 1, []), false);
});

test('standable: flat ground near the level of the area only; not a roof, a wall side, a pit or nothing', () => {
  const hit = (y, up = 1) => ({ hit: true, position: [0, y, 0], normal: [0, up, 0] });
  assert.equal(P.standable(hit(0.4), 0), true);
  assert.equal(P.standable(hit(11), 0), true);
  assert.equal(P.standable(hit(30), 0), false, 'a roof');
  assert.equal(P.standable(hit(-40), 0), false, 'a pit');
  assert.equal(P.standable(hit(0, 0.3), 0), false, 'a steep side');
  assert.equal(P.standable({ hit: false }, 0), false);
  assert.equal(P.standable(undefined, 0), false);
  assert.equal(P.standable({ hit: true, position: 'x', normal: [0, 1, 0] }, 0), false, 'junk is not ground');
});

test('fitCounts cuts a plan down to the cap together, never below one each', () => {
  assert.deepEqual(P.fitCounts([3, 4, 5], 60), [3, 4, 5]);
  const cut = P.fitCounts([40, 40, 40, 1], 60);
  assert.ok(cut.reduce((a, b) => a + b, 0) <= 60 && cut.every((c) => c >= 1), JSON.stringify(cut));
  assert.deepEqual(P.fitCounts([1, 1, 1], 2).length, 3);
});

test('placeModels: every copy rests on the ground, none overlaps another, none stands in a wall or a zone', async () => {
  const f = fakeStudio({
    walls: [{ center: [40, 15, 0], size: [20, 30, 60] }],           // a tall wall east of the spawn
    ghosts: [{ center: [-30, 4, -30], size: [30, 8, 30] }],          // an invisible trigger zone
  });
  const path = importTree(f);
  const out = await P.placeModels(f.ctx, [path], { count: 6, on: 'ground', spread: 90 }, P.newPlaceState(), 7, FAR());
  assert.equal(out.placed, 6); assert.equal(out.stopped, undefined);
  const trees = placedNodes(f);
  assert.equal(trees.length, 6, 'the import plus five copies, nothing left over');
  for (const t of trees) assert.ok(Math.abs(bottomOf(t) - 0) < 1e-6, `${t.path} rests on the ground (bottom ${bottomOf(t)})`);
  for (const t of trees) {
    assert.ok(!(t.center[0] > 30 && t.center[0] < 50 && Math.abs(t.center[2]) < 30), `${t.path} is in the wall`);
    assert.ok(!(Math.abs(t.center[0] + 30) < 15 && Math.abs(t.center[2] + 30) < 15), `${t.path} is in the zone`);
    assert.ok(Math.hypot(t.center[0], t.center[2]) <= 91, `${t.path} is within the spread`);
    assert.ok(Math.hypot(t.center[0], t.center[2]) >= 14 - 1e-6, `${t.path} keeps off the spawn's doorstep`);
  }
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
    assert.ok(Math.hypot(trees[i].center[0] - trees[j].center[0], trees[i].center[2] - trees[j].center[2]) > 2, `${trees[i].path} and ${trees[j].path} touch`);
  }
  assert.equal(f.ops('clone_instances').length, 5);
  assert.equal(f.ops('delete_instances').length, 0);
  assert.ok(f.log.every((op) => op.op !== 'move_instances' && op.op !== 'rename_instance'), 'a placed original is never re-parented or renamed');
  const raycast = f.ops('spatial_query').filter((op) => op.action === 'find_ground');
  assert.ok(raycast.length >= 6 && raycast.every((op) => op.position[1] > 30 && op.exclude.length <= 20), 'rays start above the area and exclude no more than the plugin allows');
});

test('placeModels: the same seed lays out the same way, another seed differently', async () => {
  const layout = async (seed) => {
    const f = fakeStudio();
    const path = importTree(f);
    await P.placeModels(f.ctx, [path], { count: 5, on: 'ground', spread: 70 }, P.newPlaceState(), seed, FAR());
    return placedNodes(f).map((n) => n.center.map((c) => Math.round(c * 100) / 100)).sort();
  };
  assert.deepEqual(await layout(3), await layout(3));
  assert.notDeepEqual(await layout(3), await layout(4));
});

test('placeModels: a spot inside a zone is tried again elsewhere; with no room at all the model is removed, not left inside something', async () => {
  const blockedFirst = fakeStudio({ ghosts: [{ center: [0, 4, 0], size: [400, 8, 400] }] });
  const path = importTree(blockedFirst);
  const out = await P.placeModels(blockedFirst.ctx, [path], { count: 3, on: 'ground', spread: 60 }, P.newPlaceState(), 1, FAR());
  assert.deepEqual([out.placed, out.stopped], [0, 'no_room']);
  assert.equal(placedNodes(blockedFirst).length, 0, 'the import and its copies are all removed');
  assert.equal(blockedFirst.ops('delete_instances').length, 3);
});

test('placeModels does not spend a ray or a move on a spot already known to be crowded', async () => {
  const f = fakeStudio();
  const path = importTree(f);
  const state = P.newPlaceState();
  state.placed.push({ x: 0, z: 0, r: 1000 });   // something huge stands on every candidate
  const out = await P.placeModels(f.ctx, [path], { count: 2, on: 'ground', spread: 60 }, state, 1, FAR());
  assert.deepEqual([out.placed, out.stopped], [0, 'no_room']);
  assert.equal(f.ops('spatial_query').filter((o) => o.action === 'find_ground').length, 0);
  assert.equal(f.ops('transform_instances').length, 0);
});

test('placeModels: copies are spread over the whole area asked for, not bunched round the spawn', async () => {
  const f = fakeStudio();
  const path = importTree(f);
  const out = await P.placeModels(f.ctx, [path], { count: 20, on: 'ground', spread: 200 }, P.newPlaceState(), 3, FAR());
  assert.equal(out.placed, 20);
  const radii = placedNodes(f).map((n) => Math.hypot(n.center[0], n.center[2])).sort((a, b) => a - b);
  assert.ok(radii.at(-1) > 150, `the furthest is ${radii.at(-1).toFixed(0)} studs out of 200`);
  assert.ok(radii.filter((r) => r < 60).length <= 6, `${radii.filter((r) => r < 60).length} of 20 are within 60 studs of the spawn`);
  assert.ok(radii.filter((r) => r > 100).length >= 8, 'and a fair share is in the outer half');
});

test('placeModels: a model that finds no room on its plot ends up on the open ground near the spawn instead of being dropped', async () => {
  const f = fakeStudio();
  f.world.add('game.Workspace.Plot1', { class: 'Model', center: [0, 2, 120], size: [12, 4, 12] });   // room for one
  const path = importTree(f);
  const out = await P.placeModels(f.ctx, [path], { count: 4, on: 'plots', spread: 60 }, P.newPlaceState(), 2, FAR());
  assert.equal(out.placed, 4);
  const trees = placedNodes(f);
  assert.ok(trees.some((t) => Math.abs(bottomOf(t) - 4) < 1e-6), 'one stands on the plot');
  assert.ok(trees.filter((t) => Math.abs(bottomOf(t) - 0) < 1e-6).length >= 1, 'the others are on the ground');
});

test('placeModels: on plots a model stands on each plot, on top of it', async () => {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'] });
  for (const [i, x] of [[1, -100], [2, 0], [3, 100]]) f.world.add('game.Workspace.Plot' + i, { class: 'Model', center: [x, 2, 60], size: [24, 4, 24] });
  const path = importTree(f, { ...TREE, size: [6, 6, 6] });
  const out = await P.placeModels(f.ctx, [path], { count: 3, on: 'plots', spread: 40 }, P.newPlaceState(), 5, FAR());
  assert.equal(out.placed, 3);
  const trees = placedNodes(f);
  const xs = trees.map((t) => Math.round(t.center[0])).sort((a, b) => a - b);
  for (const [i, t] of [-100, 0, 100].entries()) assert.ok(Math.abs(xs[i] - t) <= 15, `a model stands on the plot at x=${t} (found ${xs})`);
  for (const t of trees) assert.ok(Math.abs(bottomOf(t) - 4) < 1e-6, `it rests on the plot's top at 4, not the ground (bottom ${bottomOf(t)})`);
});

test('placeModels: with no plots it falls back to open ground; a Folder that has no box is left where it is', async () => {
  const f = fakeStudio();
  const path = importTree(f);
  assert.equal((await P.placeModels(f.ctx, [path], { count: 2, on: 'plots', spread: 40 }, P.newPlaceState(), 1, FAR())).placed, 2);
  const g = fakeStudio();
  g.world.add('game.Workspace.Pack', { class: 'Folder' });
  const out = await P.placeModels(g.ctx, ['game.Workspace.Pack'], { count: 4, on: 'ground', spread: 40 }, P.newPlaceState(), 1, FAR());
  assert.deepEqual([out.placed, out.stopped], [0, 'not_arrangeable']);
  assert.ok(g.world.nodes.has('game.Workspace.Pack'), 'nothing was deleted');
  assert.equal(g.ops('delete_instances').length, 0);
});

test('placeModels: several imported roots are each placed once; later components keep clear of earlier ones', async () => {
  const f = fakeStudio();
  const a = importTree(f, { ...TREE, name: 'TreeA' }), b = importTree(f, { ...TREE, name: 'TreeB', center: [-300, -40, 300] });
  const state = P.newPlaceState();
  const first = await P.placeModels(f.ctx, [a, b], { count: 9, on: 'ground', spread: 60 }, state, 2, FAR());
  assert.deepEqual([first.wanted, first.placed], [2, 2], 'count is ignored when several roots came in');
  const c = importTree(f, { ...TREE, name: 'TreeC' });
  await P.placeModels(f.ctx, [c], { count: 4, on: 'ground', spread: 60 }, state, 2, FAR());
  const trees = [...f.world.nodes.values()].filter((n) => /^game\.Workspace\.Tree/.test(n.path));
  assert.equal(trees.length, 6);
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) assert.ok(Math.hypot(trees[i].center[0] - trees[j].center[0], trees[i].center[2] - trees[j].center[2]) > 2);
});

test('placeModels stops for time (removing the import it never got to place) and for a Studio that went away', async () => {
  const f = fakeStudio();
  const path = importTree(f);
  const late = await P.placeModels(f.ctx, [path], { count: 3, on: 'ground', spread: 60 }, P.newPlaceState(), 1, 1000, () => 2000);
  assert.deepEqual([late.placed, late.stopped], [0, 'time']);
  assert.equal(f.world.nodes.has(path), false, 'an import that was never placed does not stay underground');
  const g = fakeStudio({ fail: (op) => (op.op === 'spatial_query' && op.action === 'find_ground' ? { ok: false, error: 'Studio is not connected', failure: 'transport' } : null) });
  const p2 = importTree(g);
  const gone = await P.placeModels(g.ctx, [p2], { count: 3, on: 'ground', spread: 60 }, P.newPlaceState(), 1, FAR());
  assert.equal(gone.stopped, 'disconnected');
  assert.equal(g.ops('spatial_query').filter((o) => o.action === 'find_ground').length, 1, 'it stops asking');
});

test('settleGroup moves a group together, by one offset, until its lowest point rests on the ground it now stands in', async () => {
  const f = fakeStudio();
  f.world.add('game.Workspace.PlotA', { class: 'Model', center: [50, 14, 0], size: [20, 4, 20] });   // floating: bottom at 12
  f.world.add('game.Workspace.PlotB', { class: 'Model', center: [80, 20, 0], size: [20, 4, 20] });   // bottom at 18
  const out = await P.settleGroup(f.ctx, ['game.Workspace.PlotA', 'game.Workspace.PlotB'], P.newPlaceState());
  assert.equal(out, 'moved');
  const a = f.world.nodes.get('game.Workspace.PlotA'), b = f.world.nodes.get('game.Workspace.PlotB');
  assert.ok(Math.abs(bottomOf(a) - 0) < 1e-6, 'the lowest piece rests on the ground');
  assert.ok(Math.abs((b.center[1] - a.center[1]) - 6) < 1e-6, 'and the pieces keep their layout');
  assert.equal(await P.settleGroup(f.ctx, ['game.Workspace.PlotA', 'game.Workspace.PlotB'], P.newPlaceState()), 'fine');
  const roof = fakeStudio({ walls: [{ center: [50, 58, 0], size: [200, 4, 200] }] });   // a slab whose top is at 60
  roof.world.add('game.Workspace.PlotA', { class: 'Model', center: [50, 72, 0], size: [20, 4, 20] });
  assert.equal(await P.settleGroup(roof.ctx, ['game.Workspace.PlotA'], P.newPlaceState()), 'skipped', 'it never settles a group onto a surface far from the spawn\'s level');
  assert.equal(roof.ops('transform_instances').length, 0);
});

test('moveBy moves pieces together by exactly the offset; a Folder moves through its models and parts; what cannot move is counted', async () => {
  const f = fakeStudio();
  f.world.add('game.Workspace.Base', { class: 'Part', center: [960, 1.5, -1040], size: [4, 1, 4] });
  f.world.add('game.Workspace.Base2', { class: 'Part', center: [960, 1.5, -1020], size: [4, 1, 4] });
  const all = await P.moveBy(f.ctx, ['game.Workspace.Base', 'game.Workspace.Base2'], [-1153, -1, 1024]);
  assert.deepEqual(all, { moved: 2, failed: 0, gone: false });
  assert.deepEqual(f.world.nodes.get('game.Workspace.Base').center, [960 - 1153, 0.5, -1040 + 1024]);
  assert.deepEqual(f.world.nodes.get('game.Workspace.Base2').center, [960 - 1153, 0.5, -1020 + 1024]);
  assert.equal(f.ops('transform_instances').length, 1, 'one call when they can all move');
  f.world.add('game.Workspace.Doors', { class: 'Folder' });
  f.world.add('game.Workspace.Doors.A', { class: 'Model', center: [10, 5, 10], size: [2, 10, 2] });
  f.world.add('game.Workspace.Doors.B', { class: 'MeshPart', center: [20, 5, 10], size: [2, 10, 2] });
  f.world.add('game.Workspace.Doors.Note', { class: 'Script' });
  f.world.add('game.Workspace.Giver', { class: 'Script' });
  const mixed = await P.moveBy(f.ctx, ['game.Workspace.Doors', 'game.Workspace.Giver'], [100, 0, 0]);
  assert.deepEqual([mixed.moved, mixed.failed], [1, 1]);
  assert.deepEqual([f.world.nodes.get('game.Workspace.Doors.A').center[0], f.world.nodes.get('game.Workspace.Doors.B').center[0]], [110, 120]);
  const away = fakeStudio({ fail: (op) => (op.op === 'transform_instances' ? { ok: false, error: 'gone', failure: 'transport' } : null) });
  assert.equal((await P.moveBy(away.ctx, ['game.Workspace.X'], [1, 0, 0])).gone, true);
});

test('a map with no SpawnLocation is played around its middle, not around the origin; one with a spawn keeps using the spawn', async () => {
  const f = fakeStudio({ workspace: [] });
  for (const [i, x] of [1500, 1800, 2000, 2200, 2500].entries()) f.world.add('game.Workspace.Piece' + i, { class: 'Model', center: [x, 2, 300 + i * 10], size: [100, 4, 100] });
  f.world.add('game.Workspace.Sky', { class: 'Folder' });
  f.world.add('game.Workspace.Sky.Far', { class: 'Part', center: [-9000, 2, 50], size: [10, 4, 10] });   // one outlier does not drag the middle away
  const tree = importTree(f);
  const out = await P.placeModels(f.ctx, [tree], { count: 4, on: 'ground', spread: 120 }, P.newPlaceState(), 3, FAR());
  assert.equal(out.placed, 4);
  for (const n of placedNodes(f)) assert.ok(Math.abs(n.center[0] - 2000) < 200 && Math.abs(n.center[2] - 320) < 200, `${n.path} is around the middle of the map (${n.center})`);
  const spawned = fakeStudio();
  const t2 = importTree(spawned);
  await P.placeModels(spawned.ctx, [t2], { count: 2, on: 'spawn', spread: 40 }, P.newPlaceState(), 1, FAR());
  assert.equal(spawned.ops('get_tree').length, 0, 'the spawn is enough; the map is not measured');
});

test('placeGroup: a system\'s world pieces move together onto open ground near the spawn and keep their layout', async () => {
  const f = fakeStudio({ walls: [{ center: [40, 15, 0], size: [20, 30, 60] }] });
  const board = 'game.Workspace.DonationBoard', stand = 'game.Workspace.DonationStand';
  f.world.add(board, { class: 'Model', center: [500, -40, 500], size: [10, 10, 2] });
  f.world.add(stand, { class: 'Model', center: [510, -42, 500], size: [4, 6, 4] });
  const out = await P.placeGroup(f.ctx, [board, stand], P.newPlaceState(), 3, FAR());
  assert.equal(out, 'placed');
  const b = f.world.nodes.get(board), s = f.world.nodes.get(stand);
  assert.ok(Math.abs(Math.min(bottomOf(b), bottomOf(s))) < 1e-6, 'the group rests on the ground, not under the map');
  assert.ok(Math.abs(s.center[0] - b.center[0] - 10) < 1e-6 && Math.abs(s.center[2] - b.center[2]) < 1e-6, 'the pieces keep their layout');
  assert.ok(Math.hypot(b.center[0], b.center[2]) < 200, 'near the play area');
  assert.ok(!(b.center[0] > 25 && b.center[0] < 55 && Math.abs(b.center[2]) < 35), 'not in the wall');
});

test('groupClear: the group\'s own pieces overlapping each other do not block it; a wall, a model already there or an unanswered check do', async () => {
  const f = fakeStudio({ walls: [{ center: [500, -38, 500], size: [4, 4, 4] }] });
  const plaza = 'game.Workspace.Plaza', fountain = 'game.Workspace.Fountain';
  f.world.add(plaza, { class: 'Model', center: [100, 1, 100], size: [30, 2, 30] });
  f.world.add(fountain, { class: 'Model', center: [100, 3, 100], size: [8, 6, 8] });   // stands in the plaza: their boxes overlap
  assert.equal(await P.groupClear(f.ctx, [plaza, fountain]), 'clear');
  f.world.add('game.Workspace.Statue', { class: 'Model', center: [105, 3, 100], size: [4, 6, 4] });
  assert.equal(await P.groupClear(f.ctx, [plaza, fountain]), 'blocked', 'a model that is not in the group is in the way');
  f.world.nodes.delete('game.Workspace.Statue');
  f.world.add('game.Workspace.Hut', { class: 'Model', center: [500, -38, 500], size: [4, 4, 4] });
  assert.equal(await P.groupClear(f.ctx, ['game.Workspace.Hut']), 'blocked', 'a wall is in the way');
  assert.equal(await P.groupClear(f.ctx, ['game.Workspace.Nowhere']), 'blocked', 'a check that cannot be made is not a pass');
  const gone = fakeStudio({ fail: (op) => (op.op === 'spatial_query' ? { ok: false, error: 'gone', failure: 'transport' } : null) });
  gone.world.add(plaza, { class: 'Model', center: [100, 1, 100], size: [30, 2, 30] });
  assert.equal(await P.groupClear(gone.ctx, [plaza]), 'disconnected');
});

test('placeGroup: a group whose pieces overlap each other (a plaza and the fountain on it) is placed as one', async () => {
  const f = fakeStudio();
  const plaza = 'game.Workspace.Plaza', fountain = 'game.Workspace.Fountain';
  f.world.add(plaza, { class: 'Model', center: [500, -40, 500], size: [30, 2, 30] });
  f.world.add(fountain, { class: 'Model', center: [500, -38.5, 500], size: [8, 6, 8] });
  assert.equal(await P.placeGroup(f.ctx, [plaza, fountain], P.newPlaceState(), 1, FAR()), 'placed');
  const p = f.world.nodes.get(plaza), q = f.world.nodes.get(fountain);
  assert.ok(Math.abs(q.center[0] - p.center[0]) < 1e-6 && Math.abs(q.center[1] - p.center[1] - 1.5) < 1e-6, 'and keeps its layout');
});

test('placeRegion: goes where the design\'s offset says when that spot is free and rests on the ground; otherwise finds open ground; with none it removes the region', async () => {
  const region = (f) => { f.world.add('game.Workspace.Fountain', { class: 'Model', center: [300, -40, 300], size: [10, 10, 10] }); return ['game.Workspace.Fountain']; };
  const free = fakeStudio();
  assert.equal(await P.placeRegion(free.ctx, region(free), [150, 0, 0], P.newPlaceState(), 1, FAR()), 'placed');
  const at = free.world.nodes.get('game.Workspace.Fountain');
  assert.deepEqual([at.center[0], at.center[1] - at.size[1] / 2, at.center[2]], [450, 0, 300], 'moved by the offset, bottom on the ground');
  const s2 = fakeStudio(); const st2 = P.newPlaceState();
  await P.placeRegion(s2.ctx, region(s2), [150, 0, 0], st2, 1, FAR());
  assert.equal(st2.placed.length, 1, 'its footprint is remembered so the next piece keeps clear');
  const taken = fakeStudio({ walls: [{ center: [450, 5, 300], size: [40, 40, 40] }] });
  assert.equal(await P.placeRegion(taken.ctx, region(taken), [150, 0, 0], P.newPlaceState(), 1, FAR()), 'placed');
  assert.notEqual(taken.world.nodes.get('game.Workspace.Fountain').center[0], 450, 'the planned spot was taken: it looked elsewhere');
  const none = fakeStudio({ walls: Array.from({ length: 40 }, (_, i) => ({ center: [Math.cos(i) * 40, 20, Math.sin(i) * 40], size: [1000, 60, 1000] })) });
  assert.equal(await P.placeRegion(none.ctx, region(none), undefined, P.newPlaceState(), 1, FAR()), 'no_room');
  assert.equal(none.world.nodes.has('game.Workspace.Fountain'), false, 'a region with no room is deleted');
});
