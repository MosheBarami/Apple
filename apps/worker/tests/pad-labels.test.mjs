/**
 * The hub's two pad names must not land on each other (round 3, 2026-10-04: from the hub's edge "SHOP" and "REBIRTH" printed as
 * "SHOPREBIRTH"; the labels were a fixed 240x70 PIXELS at one height, so no spacing of the pads could separate them).
 *
 * The property is measured, not asserted from the numbers: both labels are projected through a Roblox-sized camera (70 degrees
 * vertical, a 1200x623 window, eye height 6 studs) from every 4 studs of the plaza, looking at the hub's centre and at each pad,
 * and no two label rectangles may meet from any spot that can show both (each label shows only within its own MaxDistance).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'pad-labels-'));
const bundle = (entry, name) => {
  const out = join(tmp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const H = await bundle('hub-layout.ts', 'hub');
const M = await bundle('studded-map.ts', 'map');
const P = await bundle('compose-plotsim.ts', 'plotsim');

const FOV = (70 * Math.PI) / 180, ASPECT = 1200 / 623, EYE = 6;
const tanV = Math.tan(FOV / 2), tanH = tanV * ASPECT;
const PAD_TOP = 1.1; // a pad brick's centre height: the BillboardGui's StudsOffset is measured from it

/** Whether the two labels, each { x, z, y, w, h, range }, are both on screen from `cam` looking along `yaw` and their rectangles meet. */
function meet(cam, yaw, labels) {
  const fwd = [Math.sin(yaw), Math.cos(yaw)], right = [Math.cos(yaw), -Math.sin(yaw)];
  const rects = [];
  for (const l of labels) {
    const dx = l.x - cam[0], dz = l.z - cam[1];
    const dist = Math.hypot(dx, dz);
    if (dist > l.range) return false; // this label is not shown from here (MaxDistance)
    if (dist < 8) return false;       // a camera does not stand inside a label
    const depth = dx * fwd[0] + dz * fwd[1];
    if (depth < 2) return false;
    const sx = (dx * right[0] + dz * right[1]) / depth, sy = (l.y - EYE) / depth;
    if (Math.abs(sx) > tanH || Math.abs(sy) > tanV) return false;
    rects.push({ sx, sy, hw: l.w / 2 / depth, hh: l.h / 2 / depth });
  }
  const [a, b] = rects;
  return Math.abs(a.sx - b.sx) < a.hw + b.hw && Math.abs(a.sy - b.sy) < a.hh + b.hh;
}

/** How many (spot, direction) pairs on the plaza show the two labels touching. */
function collisions(hub, labels) {
  let bad = 0;
  const aim = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
  for (let cx = -hub.radius; cx <= hub.radius; cx += 4) for (let cz = -hub.radius; cz <= hub.radius; cz += 4) {
    for (const target of [hub.center, hub.shopPad, hub.sellPad]) if (meet([cx, cz], aim([cx, cz], target), labels)) bad++;
  }
  return bad;
}

const SEEDS = [1, 7, 42, 99, 1234, 2026, 31337];
const HEROES = [null, [88, 41], [30, 30], [120, 60]];
const asLabels = (hub) => M.padLabels(hub).map((l) => ({ x: l.at[0], z: l.at[1], y: PAD_TOP + l.rise, w: l.width, h: l.height, range: l.range }));

test('pad labels: from no spot on the plaza do the two names touch, for any player count, seed or hero', () => {
  let checked = 0;
  for (const seed of SEEDS) for (let n = 2; n <= 8; n++) for (const hero of HEROES) {
    const hub = H.hubLayout(seed, n, hero ? { hero } : {}).hub;
    const bad = collisions(hub, asLabels(hub));
    assert.equal(bad, 0, `seed ${seed}, ${n} players${hero ? `, hero ${hero}` : ''}: the two names touch from ${bad} views of the plaza`);
    checked++;
  }
  assert.equal(checked, SEEDS.length * 7 * HEROES.length);
});

test('pad labels: the check can fail (the round 3 design, one height and a range past the pads, collides)', () => {
  let found = 0;
  for (const seed of SEEDS) for (let n = 2; n <= 8; n++) {
    const hub = H.hubLayout(seed, n).hub;
    const old = asLabels(hub).map((l) => ({ ...l, y: PAD_TOP + 6, range: 140 }));
    found += collisions(hub, old);
  }
  assert.ok(found > 100, `the old arrangement collided from only ${found} views: this test would not notice a regression`);
});

test('pad labels: spacing, stagger and range hold as numbers too', () => {
  for (const seed of SEEDS) for (let n = 2; n <= 8; n++) for (const hero of HEROES) {
    const hub = H.hubLayout(seed, n, hero ? { hero } : {}).hub;
    const [shop, sell] = M.padLabels(hub);
    const gap = Math.hypot(shop.at[0] - sell.at[0], shop.at[1] - sell.at[1]);
    const tag = `seed ${seed}, ${n} players${hero ? `, hero ${hero}` : ''}`;
    assert.ok(gap >= shop.width + 12, `${tag}: pads ${gap.toFixed(1)} studs apart for ${shop.width}-stud names`);
    assert.ok(Math.abs(shop.rise - sell.rise) >= shop.height + 3, `${tag}: the names stand at nearly one height`);
    assert.ok(shop.range < gap && sell.range < gap, `${tag}: a name shows past the gap between the pads (${shop.range} vs ${gap.toFixed(1)})`);
    assert.ok(shop.range >= M.PAD_LABEL.minRange, `${tag}: a name is hidden from the pad's own doorstep`);
  }
});

test('pad labels: the map the composer writes carries exactly those labels, sized in studs (scale), not pixels', () => {
  const GIVEN = { title: 'T', subject: 'gem', currency: 'Gems', machines: [{ name: 'A', price: 5, income: 1, from: 'Workspace.Thing' }], upgrades: [{ label: 'U', kind: 'perPress', amount: 1, cost: 5 }] };
  for (const players of [2, 4, 6]) {
    const read = P.readPlotSim({ ...GIVEN, players }, 11, false);
    assert.ok(!('error' in read), JSON.stringify(read));
    const map = P.plotSimSteps(read.recipe).find((s) => s.kind === 'create' && s.parent === 'game.Workspace');
    const walk = (list, out = []) => { for (const i of list) { out.push(i); walk(i.children ?? [], out); } return out; };
    const nodes = walk(map.items);
    const layout = H.hubLayout(11, players, { plotTiles: P.PLOT_TILES, tile: P.PLOT_TILE });
    for (const want of M.padLabels(layout.hub)) {
      const padItem = nodes.find((i) => i.name === want.name);
      const sign = padItem.children.find((c) => c.className === 'BillboardGui').props;
      assert.deepEqual(sign.Size.v, [want.width, 0, want.height, 0], `${want.name}: a size in studs (scale), never pixels`);
      assert.deepEqual(sign.StudsOffset.v, [0, want.rise, 0]);
      assert.equal(sign.MaxDistance, want.range);
    }
  }
});
