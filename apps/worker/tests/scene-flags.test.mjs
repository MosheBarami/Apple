/**
 * THE LAYOUT FLAGS (F3): a model-free look at the place's geometry that names what a render would show.
 *
 * Measured 2026-10-04 (t1 round 1): a mirrored 32-node grid of identical clusters, caves beyond the outer wall, no terrain,
 * near-black lighting. The flags are facts with their numbers; the agent decides. Pinned here: each flag fires on the
 * pattern it names, stays quiet on a natural layout, and the request is read only for the class of space.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneFlags, flagLines, MIN_REPEATS } from '../src/scene-flags.ts';

const part = (name, at, size, extra = {}) => ({
  path: `game.Workspace.${name}`, name, class: 'Part', attributes: {}, children: [],
  props: { Position: { t: 'Vector3', v: at }, Size: { t: 'Vector3', v: size }, Transparency: { t: 'number', v: 0 }, ...extra },
});
const model = (name, parts, attributes = {}) => ({ path: `game.Workspace.${name}`, name, class: 'Model', attributes, props: {}, children: parts });
const tree = (children, truncated = false) => ({ truncated, root: { path: 'game.Workspace', name: 'Workspace', class: 'Workspace', attributes: {}, props: {}, children } });
const cluster = (name, [x, z], scale = 1) => model(name, [part(`${name}_a`, [x, 2 * scale, z], [3 * scale, 4 * scale, 3 * scale]), part(`${name}_b`, [x + 1, 5 * scale, z], [1, 3 * scale, 1])]);
const kinds = (r) => r.flags.map((f) => f.kind);
// a deterministic scatter: no lattice, no mirror
const scatter = (n) => Array.from({ length: n }, (_, i) => [((i * 37) % 91) * 3 - 120 + (i % 3) * 0.7, ((i * 53) % 97) * 3 - 140 + (i % 5) * 1.3]);

test('many identical models on a regular grid are flagged, with the grid and the size measured', () => {
  const nodes = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) nodes.push(cluster(`CrystalNode_${r * 8 + c + 1}`, [-70 + c * 20, -30 + r * 20]));
  const res = sceneFlags({ workspace: tree(nodes) });
  const f = res.flags.find((x) => x.kind === 'repeated_grid');
  assert.ok(f, kinds(res).join());
  assert.equal(f.severity, 'high');
  assert.match(f.text, /32 identical objects/);
  assert.match(f.text, /8 x 4 grid/);
  assert.match(f.text, /2 parts each/);
});

test('identical models in a line at an even spacing are flagged, at an uneven spacing they are not', () => {
  const even = Array.from({ length: 8 }, (_, i) => cluster(`Post_${i}`, [i * 12, 0]));
  assert.ok(kinds(sceneFlags({ workspace: tree(even) })).includes('repeated_grid'));
  const gaps = [0, 9, 23, 30, 52, 61, 80, 93];
  const uneven = gaps.map((x, i) => cluster(`Post_${i}`, [x, 0]));
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(uneven) })), []);
});

test('identical models laid out as mirror images are flagged as a mirror, not a grid', () => {
  const half = [[-60, -35], [-47, 12], [-33, -70], [-21, 41], [-14, -8], [-9, 77]];
  const nodes = [...half.map(([x, z], i) => cluster(`L${i}`, [x, z])), ...half.map(([x, z], i) => cluster(`R${i}`, [-x, z]))];
  const res = sceneFlags({ workspace: tree(nodes) });
  assert.deepEqual(kinds(res), ['mirrored']);
  assert.match(res.flags[0].text, /100% have a reflected twin/);
});

test('a natural scatter, a few copies and varied sizes raise nothing', () => {
  const positions = scatter(24);
  const nodes = positions.map(([x, z], i) => cluster(`Rock_${i}`, [x, z], 1 + (i % 4) * 0.35));
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(nodes) })), []);
  const few = Array.from({ length: MIN_REPEATS - 1 }, (_, i) => cluster(`Lamp_${i}`, [i * 10, 0]));
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(few) })), []);
});

const wall = (name, at, size) => part(name, at, size);
const walls = (half = 80) => [
  wall('WallN', [0, 7, -half], [2 * half, 14, 2]), wall('WallS', [0, 7, half], [2 * half, 14, 2]),
  wall('WallW', [-half, 7, 0], [2, 14, 2 * half]), wall('WallE', [half, 7, 0], [2, 14, 2 * half]),
];

test('objects outside the walls they belong to are flagged, named, with the span of the walls', () => {
  const inside = scatter(10).map(([x, z], i) => part(`Inner_${i}`, [x * 0.4, 2, z * 0.4], [4, 4, 4 + (i % 3)]));
  const outside = [part('CaveJade', [0, 3, -160], [10, 6, 10]), part('CaveVoid', [10, 3, -220], [12, 6, 12])];
  const res = sceneFlags({ workspace: tree([...walls(), ...inside, ...outside]) });
  const f = res.flags.find((x) => x.kind === 'outside_walls');
  assert.ok(f, kinds(res).join());
  assert.match(f.text, /2 of 12 objects stand outside the walls that enclose the map \(CaveJade, CaveVoid\)/);
  assert.match(f.text, /x -81\.\.81, z -81\.\.81/);
});

test('with no walls, objects beyond the ground plates are flagged; objects on them are not', () => {
  const ground = part('Ground', [0, -1, 0], [120, 2, 120]);
  const on = scatter(8).map(([x, z], i) => part(`Prop_${i}`, [x * 0.3, 2, z * 0.3], [3, 3 + i, 3]));
  assert.deepEqual(kinds(sceneFlags({ workspace: tree([ground, ...on]) })), []);
  const res = sceneFlags({ workspace: tree([ground, ...on, part('Stray', [0, 2, 200], [4, 4, 4])]) });
  assert.match(res.flags.find((x) => x.kind === 'outside_walls').text, /outside the ground the map stands on \(Stray\)/);
  // A lone ground plate beside the build (most things outside it) is not a boundary that was broken.
  assert.deepEqual(kinds(sceneFlags({ workspace: tree([part('Ground', [500, -1, 500], [60, 2, 60]), ...on]) })), []);
});

const flatPlace = () => scatter(26).map(([x, z], i) => part(`Slab_${i}`, [x, 1, z], [10, 2, 8 + (i % 4)]));

test('no terrain, no enclosure and nothing standing up: information, and high when the request describes an enclosed space', () => {
  const info = sceneFlags({ workspace: tree(flatPlace()), terrainSolidVoxels: 0, request: 'a farm with a barn' });
  assert.deepEqual(info.flags.map((f) => [f.kind, f.severity]), [['open_flat_map', 'info']]);
  for (const request of ['deeper caves under the mountain', 'a dungeon with rooms', 'the interior of a spaceship']) {
    const hi = sceneFlags({ workspace: tree(flatPlace()), terrainSolidVoxels: 0, request });
    assert.deepEqual(hi.flags.map((f) => [f.kind, f.severity]), [['open_flat_map', 'high']], request);
    assert.match(hi.flags[0].text, /request describes an enclosed space/);
  }
});

test('terrain, walls, height or an unread terrain each keep the open-flat flag quiet', () => {
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(flatPlace()), terrainSolidVoxels: 5000, request: 'caves' })), []);
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(flatPlace()), request: 'caves' })), [], 'a terrain read that was not made says nothing');
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(flatPlace()), terrainSolidVoxels: null, request: 'caves' })), []);
  assert.deepEqual(kinds(sceneFlags({ workspace: tree([...flatPlace(), ...walls()]), terrainSolidVoxels: 0, request: 'caves' })).filter((k) => k === 'open_flat_map'), []);
  assert.deepEqual(kinds(sceneFlags({ workspace: tree([...flatPlace(), part('Tower', [0, 30, 0], [8, 60, 8])]), terrainSolidVoxels: 0 })), []);
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(flatPlace().slice(0, 10)), terrainSolidVoxels: 0, request: 'caves' })), [], 'a handful of parts is not a map');
});

const lighting = (props) => ({ root: { path: 'game.Lighting', class: 'Lighting', attributes: {}, children: [], props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { t: Array.isArray(v) ? 'Color3' : 'number', v }])) } });

test('near-black lighting is flagged with its numbers; a readable rig and a lit scene are not', () => {
  const dark = sceneFlags({ workspace: tree([part('Floor', [0, 0, 0], [20, 1, 20])]), lighting: lighting({ Brightness: 0.4, ClockTime: 0, Ambient: [0.04, 0.04, 0.12], OutdoorAmbient: [0.04, 0.04, 0.12], ExposureCompensation: 0 }) });
  assert.deepEqual(kinds(dark), ['dark_lighting']);
  assert.match(dark.flags[0].text, /ambient 31\/255, brightness 0\.4, time 0h, exposure 0, and 0 light\(s\)/);
  const day = sceneFlags({ workspace: tree([part('Floor', [0, 0, 0], [20, 1, 20])]), lighting: lighting({ Brightness: 3, ClockTime: 14, Ambient: [0.5, 0.5, 0.5], OutdoorAmbient: [0.5, 0.5, 0.5], ExposureCompensation: 0 }) });
  assert.deepEqual(kinds(day), []);
  const brightNight = sceneFlags({ workspace: tree([part('Floor', [0, 0, 0], [20, 1, 20])]), lighting: lighting({ Brightness: 0.4, ClockTime: 0, Ambient: [0.04, 0.04, 0.12], ExposureCompensation: 1.5 }) });
  assert.deepEqual(kinds(brightNight), [], 'raised exposure reads the scene');
  const lit = [part('Floor', [0, 0, 0], [20, 1, 20]), ...Array.from({ length: 5 }, (_, i) => ({ ...part(`Lamp${i}`, [i * 4, 3, 0], [1, 1, 1]), children: [{ path: 'x', name: 'L', class: 'PointLight', props: {}, attributes: {}, children: [] }] }))];
  assert.deepEqual(kinds(sceneFlags({ workspace: tree(lit), lighting: lighting({ Brightness: 0.4, ClockTime: 0, Ambient: [0.04, 0.04, 0.12] }) })), [], 'five lights light a route');
  assert.deepEqual(kinds(sceneFlags({ workspace: tree([]), lighting: { root: { props: {} } } })), [], 'a rig that cannot be read says nothing');
});

test('an unreadable tree is null, a cut-off tree says so', () => {
  const nodes = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) nodes.push(cluster(`N${r * 8 + c}`, [c * 20, r * 20]));
  assert.equal(sceneFlags({ workspace: { nothing: true } }), null);
  assert.equal(sceneFlags({ workspace: tree(nodes, true) }).truncated, true);
  assert.match(flagLines(sceneFlags({ workspace: tree(nodes) }))[0], /^\[high\] repeated_grid: 32 identical objects/);
});
