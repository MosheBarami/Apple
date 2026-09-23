// Terrain recipes (2026-09-23): the sky-island mission's landforms, built by arithmetic instead of by the
// model's own ball placement (a flat slab, a water tube, a rock ball on the Baseplate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandTerrainRecipe, ISLAND_RADIUS } from '../src/terrain-recipes.ts';

// The plugin's own budget (Commands.luau terrainCellBudget / terrainRegion): cells per axis are
// ceil(size / 4); a region is budgeted with two extra cells per axis.
const LIMIT = 65536;
const cells = (sx, sy, sz) => Math.max(1, Math.ceil(sx / 4)) * Math.max(1, Math.ceil(sy / 4)) * Math.max(1, Math.ceil(sz / 4));
function budget(op) {
  if (op.action === 'fill_ball') return cells(op.radius * 2, op.radius * 2, op.radius * 2);
  if (op.action === 'fill_block') return cells(...op.size);
  if (op.action === 'replace_material' || op.action === 'fill_region') {
    const d = op.max.map((v, i) => v - op.min[i] + 8);
    return cells(...d);
  }
  throw new Error(`unexpected action ${op.action}`);
}

test('a floating island stays inside the plugin voxel ceiling at every radius it accepts', () => {
  for (const radius of [ISLAND_RADIUS.min, 40, ISLAND_RADIUS.max]) {
    const out = expandTerrainRecipe('floating_island', { center: [0, 150, 0], radius });
    assert.ok(!('error' in out), JSON.stringify(out));
    assert.ok(out.operations.length >= 6);
    for (const op of out.operations) assert.ok(budget(op) <= LIMIT, `${op.action} at radius ${radius} spans ${budget(op)} voxels`);
  }
});

test('the island tapers downward, has a flat grass top, and reports where that top is', () => {
  const out = expandTerrainRecipe('floating_island', { center: [10, 150, -20], radius: 40 });
  const balls = out.operations.filter((o) => o.action === 'fill_ball');
  for (let i = 1; i < balls.length; i++) {
    assert.ok(balls[i].center[1] < balls[i - 1].center[1], 'each underside ball is lower than the one above');
    assert.ok(balls[i].radius < balls[i - 1].radius, 'and smaller');
  }
  const cut = out.operations.find((o) => o.action === 'fill_block' && o.material === 'Enum.Material.Air');
  assert.ok(cut, 'the top is cut flat');
  assert.equal(cut.center[1] - cut.size[1] / 2, out.facts.surfaceY, 'the cut starts exactly at the surface it reports');
  assert.ok(out.operations.some((o) => o.targetMaterial === 'Enum.Material.Grass'), 'grass on the top');
});

test('a recipe refuses sizes it cannot build and names the fields it needs', () => {
  assert.match(expandTerrainRecipe('floating_island', { center: [0, 0, 0], radius: 200 }).error, /radius/);
  assert.match(expandTerrainRecipe('floating_island', { radius: 40 }).error, /center/);
  assert.match(expandTerrainRecipe('waterfall', { top: [0, 100, 0], height: 1000 }).error, /height/);
  assert.match(expandTerrainRecipe('volcano', {}).error, /floating_island, waterfall/);
});

test('a waterfall is a thin sheet that reaches a pool when asked', () => {
  const out = expandTerrainRecipe('waterfall', { top: [30, 160, 0], height: 80, width: 10, endsIn: 'pool' });
  const sheet = out.operations[0];
  assert.equal(sheet.size[2], 4, 'four studs deep: a curtain, not a column');
  assert.equal(sheet.center[1] + sheet.size[1] / 2, 160, 'it starts at the edge it pours over');
  assert.ok(out.operations.some((o) => o.action === 'fill_ball' && o.material === 'Enum.Material.Water'), 'the pool');
  for (const op of out.operations) assert.ok(budget(op) <= LIMIT);
});

test('edit_terrain expands a recipe and returns its facts', () => {
  const src = readFileSync(new URL('../src/tools.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('async function runTerrainEdits'), src.indexOf('async function runTerrainEdits') + 700);
  assert.match(body, /expandTerrainRecipe\(a\.recipe, a\)/, 'edit_terrain does not expand recipes');
  assert.match(body, /\.\.\.expanded\.facts/, 'the model is not told where the island top is');
});
