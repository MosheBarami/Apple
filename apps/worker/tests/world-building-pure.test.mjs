/**
 * THE ARITHMETIC OF WORLD-BUILDING, WITH NO SUBJECT IN IT.
 *
 * placement.ts (where copies go), local-space.ts (a structure built around its own origin, then placed) and terrain-path.ts
 * (a channel cut along a line) are pure: numbers in, numbers out. The tests use a hedge row, a stone arch and a pier because the
 * modules know no subject; nothing here may depend on what is being placed.
 *
 * Run with:  node --test tests/world-building-pure.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planCopies, sampleAlong, sampleWithin, seeded, MAX_COPIES } from '../src/placement.ts';
import { applyOrigin, readOrigin, sharedParent } from '../src/local-space.ts';
import { expandTerrainPath, TERRAIN_PATH_OP_CAP, TERRAIN_VOXEL_CAP } from '../src/terrain-path.ts';

const LIMIT = 100_000;
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// ------------------------------------------------------------------------------------------------ placement
test('the same seed gives the same layout, a different seed another, on every run', () => {
  const within = { rect: { min: [0, 0], max: [100, 40] }, count: 30, minSpacing: 5, y: 0 };
  const a = planCopies({ within, seed: 7, yaw: [0, 360], scale: [0.8, 1.2] }, LIMIT);
  const b = planCopies({ within, seed: 7, yaw: [0, 360], scale: [0.8, 1.2] }, LIMIT);
  const c = planCopies({ within, seed: 8, yaw: [0, 360], scale: [0.8, 1.2] }, LIMIT);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.copies, c.copies);
  assert.equal(a.copies.length, 30);
  assert.ok(a.copies.every((p) => p.scale >= 0.8 && p.scale <= 1.2 && p.yaw >= 0 && p.yaw <= 360));
  const r = seeded(1);
  assert.deepEqual([r(), r(), r()], [seeded(1)(), (() => { const s = seeded(1); s(); return s(); })(), (() => { const s = seeded(1); s(); s(); return s(); })()]);
});

test('along: copies stand at equal arc length on the line, with y following it', () => {
  const hedge = planCopies({ along: { points: [[0, 0, 0], [30, 0, 0], [30, 10, 40]], spacing: 10 } }, LIMIT);
  // length 30 + sqrt(10^2 + 40^2) = 30 + 41.23 = 71.23 -> 8 copies at 0,10,...,70
  assert.equal(hedge.copies.length, 8);
  assert.deepEqual(hedge.copies[0].at, [0, 0, 0]);
  assert.deepEqual(hedge.copies[3].at, [30, 0, 0]);
  near(hedge.copies[7].at[2], 40 * ((70 - 30) / Math.hypot(10, 40)), 0.01);
  assert.ok(hedge.copies[5].at[1] > 0 && hedge.copies[5].at[1] < 10, 'y did not follow the line');
  const byCount = sampleAlong([[0, 0, 0], [100, 0, 0]], { count: 5 });
  assert.deepEqual(byCount.map((p) => p[0]), [0, 25, 50, 75, 100]);
  assert.deepEqual(sampleAlong([[0, 0, 0], [10, 0, 0]], { count: 1 }), [[5, 0, 0]]);
});

test('within: a polygon holds every copy, minSpacing is kept, and an area that cannot hold them says so', () => {
  const tri = [[0, 0], [100, 0], [0, 100]];
  const r = planCopies({ within: { polygon: tri, count: 40, minSpacing: 6, y: 0 }, seed: 3 }, LIMIT);
  for (const { at } of r.copies) assert.ok(at[0] >= 0 && at[2] >= 0 && at[0] + at[2] <= 100, `a copy fell outside the polygon: ${at}`);
  for (let i = 0; i < r.copies.length; i++) for (let j = i + 1; j < r.copies.length; j++) {
    assert.ok(Math.hypot(r.copies[i].at[0] - r.copies[j].at[0], r.copies[i].at[2] - r.copies[j].at[2]) >= 6 - 1e-9, 'two copies are closer than minSpacing');
  }
  const full = planCopies({ within: { rect: { min: [0, 0], max: [10, 10] }, count: 200, minSpacing: 5, y: 0 } }, LIMIT);
  assert.ok(full.copies.length < 200);
  assert.match(full.note, /Only \d+ of 200 copies fit/);
  assert.equal(planCopies({ within: { rect: { min: [0, 0], max: [10, 10] }, count: 5 } }, LIMIT).needsGround, true, 'without y the ground still has to be measured');
  assert.equal(sampleWithin({ min: [0, 0], max: [10, 10] }, 5, 0, seeded(1)).length, 5);
});

test('jitter moves copies on the ground plane only, and never changes how many there are', () => {
  const base = planCopies({ at: [[0, 3, 0], [10, 3, 0]], seed: 2 }, LIMIT);
  const jittered = planCopies({ at: [[0, 3, 0], [10, 3, 0]], jitter: 2, seed: 2 }, LIMIT);
  assert.equal(jittered.copies.length, 2);
  jittered.copies.forEach((c, i) => {
    assert.equal(c.at[1], 3, 'jitter changed the height');
    assert.ok(Math.abs(c.at[0] - base.copies[i].at[0]) <= 2 && Math.abs(c.at[2] - base.copies[i].at[2]) <= 2);
  });
});

test('planCopies refuses the unusable, in one sentence each', () => {
  for (const [req, re] of [
    [{}, /exactly one of at, along or within/],
    [{ at: [[0, 0, 0]], along: { points: [[0, 0, 0], [1, 0, 0]], count: 2 } }, /exactly one of at, along or within/],
    [{ at: [] }, /at must list 1-1000/],
    [{ at: [[0, 0]] }, /at must list/],
    [{ at: [[0, 0, 1e9]] }, /outside the world/],
    [{ along: { points: [[0, 0, 0]], count: 2 } }, /along\.points/],
    [{ along: { points: [[0, 0, 0], [1, 0, 0]] } }, /exactly one of spacing/],
    [{ along: { points: [[0, 0, 0], [1, 0, 0]], spacing: 0.1 } }, /at least 0\.5/],
    [{ along: { points: [[0, 0, 0], [5000, 0, 0]], spacing: 1 } }, /would place \d+ copies; the limit is 1000/],
    [{ within: { rect: { min: [5, 5], max: [0, 0] }, count: 3 } }, /rect/],
    [{ within: { rect: { min: [0, 0], max: [5, 5] }, count: 0 } }, /within\.count/],
    [{ at: [[0, 0, 0]], yaw: 'north' }, /yaw must be/],
    [{ at: [[0, 0, 0]], scale: [2, 1] }, /scale must be/],
    [{ at: [[0, 0, 0]], jitter: -1 }, /jitter/],
  ]) assert.match(planCopies(req, LIMIT).error ?? 'accepted', re, JSON.stringify(req));
  assert.equal(MAX_COPIES, 1000);
});

// ------------------------------------------------------------------------------------------------ local space
const part = (name, props = {}, extra = {}) => ({ className: 'Part', name, parent: 'game.Workspace', props, ...extra });
const v3 = (v) => ({ t: 'Vector3', v });

test('a local-space batch is turned about the vertical and moved: world positions are the rotated local ones', () => {
  const arch = [
    part('PierL', { Position: v3([-6, 4, 0]), Size: v3([2, 8, 2]) }),
    part('PierR', { Position: v3([6, 4, 0]), Size: v3([2, 8, 2]) }),
    part('Keystone', { Position: v3([0, 9, 0]), Orientation: v3([0, 30, 0]) }),
  ];
  const out = applyOrigin(arch, { at: [100, 2, 50], yaw: 90 });
  assert.equal(out.error, undefined);
  const p = (i) => out.items[i].props;
  // yaw 90: x' = 0*x + 1*z + ax, z' = -1*x + 0*z + az  ->  PierL (-6,4,0) -> (100, 6, 56); PierR (6,4,0) -> (100, 6, 44)
  assert.deepEqual(p(0).Position.v, [100, 6, 56]);
  assert.deepEqual(p(1).Position.v, [100, 6, 44]);
  assert.deepEqual(p(2).Position.v, [100, 11, 50]);
  assert.deepEqual(p(0).Size.v, [2, 8, 2], 'size is independent of where the structure stands');
  assert.deepEqual(p(2).Orientation.v, [0, 120, 0], 'a world yaw adds to the Y of Roblox\'s YXZ Orientation');
  assert.deepEqual(p(0).Orientation.v, [0, 90, 0], 'a part with no Orientation is turned with the structure');
  assert.deepEqual(arch[0].props.Position.v, [-6, 4, 0], 'the input must not be mutated');
});

test('with no yaw only the position moves; a part with no Position stands at the origin; Orientation wraps', () => {
  const out = applyOrigin([part('Plain'), part('Turned', { Orientation: v3([10, 170, 0]) })], { at: [5, 0, 5] });
  assert.deepEqual(out.items[0].props.Position.v, [5, 0, 5]);
  assert.equal(out.items[0].props.Orientation, undefined);
  const wrapped = applyOrigin([part('Turned', { Orientation: v3([10, 170, 0]) })], { at: [0, 0, 0], yaw: 40 });
  assert.deepEqual(wrapped.items[0].props.Orientation.v, [10, -150, 0]);
});

test('a CFrame is rotated as a whole: position and the 3x3 together', () => {
  const identity = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const out = applyOrigin([part('C', { CFrame: { t: 'CFrame', v: [4, 1, 0, ...identity.slice(3)] } })], { at: [0, 0, 0], yaw: 90 });
  const v = out.items[0].props.CFrame.v;
  near(v[0], 0); near(v[1], 1); near(v[2], -4);
  // Ry(90) = [[0,0,1],[0,1,0],[-1,0,0]]
  [v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11]].forEach((n, i) => near(n, [0, 0, 1, 0, 1, 0, -1, 0, 0][i]));
  assert.equal(out.items[0].props.Position, undefined, 'a part written with a CFrame carries its position there');
});

test('only base parts are transformed; children are reached; what cannot be moved is refused by name', () => {
  const batch = [{ className: 'Model', name: 'Gate', parent: 'game.Workspace', children: [
    part('Post', { Position: v3([2, 0, 0]) }),
    { className: 'Attachment', name: 'Hook', props: { Position: v3([1, 1, 1]) } },
    { className: 'PointLight', name: 'Glow' },
  ] }];
  const ok = applyOrigin(batch, { at: [10, 0, 0] });
  assert.deepEqual(ok.items[0].children[0].props.Position.v, [12, 0, 0]);
  assert.deepEqual(ok.items[0].children[1].props.Position.v, [1, 1, 1], 'an Attachment\'s Position is relative to its parent: left alone');
  const bad = applyOrigin([part('X', { WorldPivot: { t: 'CFrame', v: identityCF() } })], { at: [0, 0, 0] });
  assert.match(bad.error, /items\[0\]\.props\.WorldPivot names a place in the world/);
  assert.match(applyOrigin([part('X', { Position: { t: 'Color3', v: [1, 1, 1] } })], { at: [0, 0, 0] }).error, /Position must be a Vector3/);
  assert.match(applyOrigin([part('X', { CFrame: { t: 'CFrame', v: [1, 2, 3] } })], { at: [0, 0, 0] }).error, /CFrame must be a CFrame of 12 numbers/);
});
function identityCF() { return [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]; }

test('origin and group arguments are read strictly; a group needs one home', () => {
  assert.deepEqual(readOrigin({ at: [1, 2, 3], yaw: 45 }, LIMIT), { at: [1, 2, 3], yaw: 45 });
  for (const bad of [null, [], { at: [1, 2] }, { at: [1, 2, 'x'] }, { at: [1e9, 0, 0] }, { at: [0, 0, 0], yaw: 'up' }]) assert.ok(readOrigin(bad, LIMIT).error, JSON.stringify(bad));
  assert.equal(sharedParent([{ parent: 'game.Workspace' }, { parent: 'game.Workspace' }]), 'game.Workspace');
  assert.match(sharedParent([{ parent: 'game.Workspace' }, { parent: 'game.Lighting' }]).error, /share one parent/);
});

test('local-space.ts and placement.ts know no subject: no noun list, no name check', () => {
  for (const file of ['placement.ts', 'local-space.ts', 'terrain-path.ts']) {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(src.length > 500, `${file} was not read`);
    assert.doesNotMatch(src, /\b(tree|rock|house|village|canyon|forest|river|cave|stall|hedge)\b/i, `${file} mentions a subject`);
  }
});

// ------------------------------------------------------------------------------------------------ terrain path
test('a path expands into fill_block operations along the line, carved from the surface down', () => {
  const r = expandTerrainPath({ points: [[0, 20, 0], [100, 20, 0]], width: 16, depth: 8 });
  assert.equal(r.error, undefined);
  // step = width/2 = 8 -> 13 samples along 100 studs
  assert.equal(r.operations.length, 13);
  assert.deepEqual(r.facts, { samples: 13, lengthStuds: 100, stepStuds: 8, operations: 13 });
  assert.deepEqual(r.operations[0], { action: 'fill_block', center: [0, 16, 0], size: [16, 8, 16], material: 'Enum.Material.Air' });
  assert.deepEqual(r.operations[12].center, [96, 16, 0]);
});

test('water carves everything first, then fills the lower three quarters; a material fill uses that material', () => {
  const water = expandTerrainPath({ points: [[0, 20, 0], [40, 20, 0]], width: 8, depth: 12, fill: 'Water' });
  const n = water.operations.length / 2;
  assert.equal(water.operations.slice(0, n).every((o) => o.material === 'Enum.Material.Air'), true, 'a water block comes before a later carve');
  assert.equal(water.operations.slice(n).every((o) => o.material === 'Enum.Material.Water'), true);
  assert.deepEqual(water.operations[n].size, [8, 9, 8]);
  assert.deepEqual(water.operations[n].center, [0, 8 + 4.5, 0]);
  const road = expandTerrainPath({ points: [[0, 5, 0], [0, 5, 30]], width: 12, depth: 4, fill: 'material', material: 'Enum.Material.Sand' });
  assert.equal(road.operations.every((o) => o.material === 'Enum.Material.Sand'), true);
});

test('a path that is too long, too big or malformed is refused with the number', () => {
  const long = expandTerrainPath({ points: [[0, 0, 0], [3000, 0, 0]], width: 8, depth: 8 });
  assert.match(long.error, new RegExp(`the limit is ${TERRAIN_PATH_OP_CAP} per call`));
  assert.match(expandTerrainPath({ points: [[0, 0, 0], [10, 0, 0]], width: 200, depth: 200 }).error, new RegExp(`the limit is ${TERRAIN_VOXEL_CAP} per operation`));
  for (const [p, re] of [
    [{ points: [[0, 0, 0]], width: 8, depth: 4 }, /points: 2-32/],
    [{ points: [[0, 0, 0], [1, 0, 0]], width: 1, depth: 4 }, /width must be 4-200/],
    [{ points: [[0, 0, 0], [1, 0, 0]], width: 8, depth: 0 }, /depth must be 1-200/],
    [{ points: [[0, 0, 0], [1, 0, 0]], width: 8, depth: 4, fill: 'Lava' }, /fill must be/],
    [{ points: [[0, 0, 0], [1, 0, 0]], width: 8, depth: 4, fill: 'material' }, /needs path\.material/],
    [{ points: [[0, 0, 0], [1e9, 0, 0]], width: 8, depth: 4 }, /outside the world/],
  ]) assert.match(expandTerrainPath(p).error ?? 'accepted', re, JSON.stringify(p));
});
