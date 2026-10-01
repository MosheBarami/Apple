/**
 * The map of a plot simulator: a hub, one plot per player on a ring, a spoke road from the hub to each plot
 * (src/hub-layout.ts), and how studded-map.ts draws it (a hub instead of a gate, a lane and a plaza). The lane-defense
 * map must stay exactly what it was: a recorded fingerprint of five seeds, below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'hub-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(WORKER, 'src', 'hub-layout.ts'))};`,
  `export * from ${JSON.stringify(join(WORKER, 'src', 'studded-map.ts'))};`,
  `export { laneLayout, plotTiles, rng, segDist, TILE, PLOT_TILES, LANE_WIDTH } from ${JSON.stringify(join(WORKER, 'src', 'compose.ts'))};`,
].join('\n'));
const out = join(dir, 'bundle.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const M = await import(`file://${out}`);

const SEEDS = [1, 2, 7, 20260930, 99];
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const frameHalf = (L) => (L.plotTiles * M.TILE) / 2 + 1;
const hubHalf = (L) => L.hub.radius;
const insideBox = (p, c, half, tol = 0) => cheb(p, c) < half - tol;
const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

test('hub layout: one plot per player, players clamped to 2..8', () => {
  for (let n = 2; n <= 8; n++) assert.equal(M.hubLayout(1, n).plots.length, n);
  assert.equal(M.hubLayout(1, 1).plots.length, 2);
  assert.equal(M.hubLayout(1, 0).plots.length, 2);
  assert.equal(M.hubLayout(1, -5).plots.length, 2);
  assert.equal(M.hubLayout(1, 99).plots.length, 8);
  assert.equal(M.hubLayout(1, 3.6).plots.length, 4);
  assert.equal(M.hubLayout(1, NaN).plots.length, 4, 'a number that is not one gives the default');
  assert.equal(M.hubLayout(1, 4).plotTiles, 4, 'plots are 4 x 4 tiles by default');
});

test('hub layout: no enemy lane, and the fields the other consumers read are all there', () => {
  const L = M.hubLayout(5, 4);
  assert.deepEqual(L.lane, []);
  assert.ok(Array.isArray(L.rows) && Array.isArray(L.border) && L.border.length > 40);
  assert.ok(L.hub && L.hub.spokes.length === 4);
  assert.deepEqual(L.hub.center, [0, 0]);
  assert.ok(L.ground.size[0] > 0 && L.ground.size[1] > 0);
  assert.ok(L.scatter.length >= 40, `room for props (${L.scatter.length})`);
});

test('hub layout: plots clear each other, the hub and every road but their own', () => {
  let checked = 0;
  for (const seed of SEEDS) for (let n = 2; n <= 8; n++) for (const plotTiles of [3, 4, 5]) {
    const L = M.hubLayout(seed, n, { plotTiles });
    const fh = frameHalf(L), hh = hubHalf(L), w = M.LANE_WIDTH / 2;
    const tag = `seed ${seed}, ${n} players, ${plotTiles} tiles`;
    for (let i = 0; i < n; i++) {
      // the plot's frame does not touch the hub
      assert.ok(cheb(L.plots[i], L.hub.center) >= hh + fh + 15, `${tag}: plot ${i} is too close to the hub`);
      for (let j = i + 1; j < n; j++) assert.ok(cheb(L.plots[i], L.plots[j]) >= 2 * fh + 10, `${tag}: plots ${i} and ${j} are too close`);
      // no other plot's frame touches this road (with the road's own width)
      L.hub.spokes.forEach((spoke, k) => {
        if (k === i) return;
        for (let t = 0; t <= 1; t += 0.02) {
          const p = along(spoke[0], spoke[1], t);
          assert.ok(cheb(p, L.plots[i]) >= fh + w - 0.5, `${tag}: road ${k} runs through plot ${i}`);
        }
      });
      // a road meets its own plot only at its end, and the hub only at its start
      const [start, end] = L.hub.spokes[i];
      for (let t = 0; t < 0.99; t += 0.01) {
        const p = along(start, end, t);
        assert.ok(cheb(p, L.plots[i]) >= fh - 0.05, `${tag}: road ${i} enters its plot before its end (t=${t.toFixed(2)})`);
      }
      for (let t = 0.02; t <= 1; t += 0.01) {
        assert.ok(cheb(along(start, end, t), L.hub.center) >= hh - 0.05, `${tag}: road ${i} runs inside the hub (t=${t.toFixed(2)})`);
      }
      checked++;
    }
  }
  assert.ok(checked > 500, `the loop must have checked something (${checked})`);
});

test('hub layout: every plot is reached by a road that runs hub edge to plot edge', () => {
  for (const seed of SEEDS) for (let n = 2; n <= 8; n++) {
    const L = M.hubLayout(seed, n);
    const fh = frameHalf(L), hh = hubHalf(L);
    assert.equal(L.hub.spokes.length, n);
    L.hub.spokes.forEach(([start, end], i) => {
      assert.ok(Math.abs(cheb(start, L.hub.center) - hh) < 0.05, `seed ${seed}/${n}: road ${i} does not start at the hub's edge`);
      assert.ok(Math.abs(cheb(end, L.plots[i]) - fh) < 0.05, `seed ${seed}/${n}: road ${i} does not end at its plot's edge`);
      assert.ok(Math.hypot(end[0] - start[0], end[1] - start[1]) >= 20, `seed ${seed}/${n}: road ${i} is too short to be a road`);
      // straight: start, plot centre and the hub centre are on one line
      const cross = (end[0] - start[0]) * (L.plots[i][1] - start[1]) - (end[1] - start[1]) * (L.plots[i][0] - start[0]);
      assert.ok(Math.abs(cross) < 40, `seed ${seed}/${n}: road ${i} does not point at its plot`);
    });
  }
});

test('hub layout: the spawn, the pads and the hero spot are on the hub, apart from each other', () => {
  for (const seed of SEEDS) for (let n = 2; n <= 8; n++) {
    const L = M.hubLayout(seed, n);
    const tag = `seed ${seed}, ${n} players`, h = L.hub;
    const spots = { spawn: L.spawn, shopPad: h.shopPad, sellPad: h.sellPad, heroSpot: h.heroSpot };
    for (const [name, p] of Object.entries(spots)) assert.ok(insideBox(p, h.center, h.radius, 5), `${tag}: ${name} is not on the hub`);
    const names = Object.keys(spots);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const d = Math.hypot(spots[names[i]][0] - spots[names[j]][0], spots[names[i]][1] - spots[names[j]][1]);
      assert.ok(d >= 12, `${tag}: ${names[i]} and ${names[j]} are ${d.toFixed(1)} apart`);
    }
    for (const [name, p] of [['shopPad', h.shopPad], ['sellPad', h.sellPad]]) {
      for (const [start] of h.spokes) assert.ok(Math.hypot(p[0] - start[0], p[1] - start[1]) >= 14, `${tag}: ${name} sits in a road's mouth`);
    }
  }
});

test('hub layout: props are on the ground and clear of roads, plots and the hub', () => {
  for (const seed of SEEDS) for (const n of [2, 5, 8]) {
    const L = M.hubLayout(seed, n);
    const fh = frameHalf(L), [gx, gz] = L.ground.center, [sx, sz] = L.ground.size;
    assert.ok(L.scatter.length >= 40, `seed ${seed}/${n}: ${L.scatter.length} props`);
    for (const p of L.scatter) {
      assert.ok(Math.abs(p[0] - gx) < sx / 2 && Math.abs(p[1] - gz) < sz / 2, `${p} is off the ground`);
      assert.ok(cheb(p, L.hub.center) >= L.hub.radius + 6 - 0.2, `${p} is on the hub`);
      for (const [a, b] of L.hub.spokes) assert.ok(M.segDist(p, a, b) >= M.LANE_WIDTH / 2 + 6 - 0.2, `${p} is on a road`);
      for (const plot of L.plots) assert.ok(cheb(p, plot) >= fh + 6 - 0.2, `${p} is on a plot`);
    }
    // the plots and the whole ring are on the ground too
    for (const plot of L.plots) assert.ok(Math.abs(plot[0] - gx) + fh < sx / 2 && Math.abs(plot[1] - gz) + fh < sz / 2, 'a plot is off the ground');
  }
});

test('hub layout: the same seed gives the same layout, another seed another one', () => {
  assert.equal(JSON.stringify(M.hubLayout(11, 5)), JSON.stringify(M.hubLayout(11, 5)));
  assert.notEqual(JSON.stringify(M.hubLayout(11, 5).plots), JSON.stringify(M.hubLayout(12, 5).plots), 'the ring turns with the seed');
  assert.notEqual(JSON.stringify(M.hubLayout(11, 5).scatter), JSON.stringify(M.hubLayout(12, 5).scatter));
});

// ------------------------------------------------------------------------------------------------ the drawn map

const hubMap = (L, words = { plot: 'Free plot' }) => M.studdedMap({ layout: L, tile: M.TILE, plotTiles: M.plotTiles, plotHalf: (M.TILE * M.PLOT_TILES) / 2, laneWidth: M.LANE_WIDTH, words, seed: M.rng(3) });
const byName = (items, name) => items.filter((i) => i.name === name);
const walk = (items, f) => { for (const i of items) { f(i); if (i.children) walk(i.children, f); } };

test('hub map: a hub, roads, the two pads, plots with their tiles and signs, and none of the lane map', () => {
  for (const n of [2, 4, 8]) for (const plotTiles of [3, 4, 5]) {
    const L = M.hubLayout(9, n, { plotTiles });
    const items = hubMap(L);
    const names = items.map((i) => i.name);
    for (const gone of ['Gate', 'Lanes', 'Guide']) assert.ok(!names.includes(gone), `a hub map has no ${gone}`);
    for (const must of ['Island', 'Water', 'Hub', 'Road', 'ShopPad', 'SellPad', 'Plots', 'Spawn']) assert.equal(byName(items, must).length, 1, `${must} is drawn once`);
    // the pads sit where the layout says
    const shop = byName(items, 'ShopPad')[0], sell = byName(items, 'SellPad')[0];
    assert.deepEqual([shop.props.Position[0], shop.props.Position[2]], L.hub.shopPad);
    assert.deepEqual([sell.props.Position[0], sell.props.Position[2]], L.hub.sellPad);
    assert.equal(shop.className, 'Part');
    // a road brick and two curbs for every spoke
    const road = byName(items, 'Road')[0].children;
    assert.equal(road.filter((p) => /^Spoke\d+$/.test(p.name)).length, n);
    assert.equal(road.filter((p) => /Curb[ab]$/.test(p.name)).length, 2 * n);
    // the plots, with the same names the systems read
    const plots = byName(items, 'Plots')[0].children;
    assert.deepEqual(plots.map((p) => p.name), Array.from({ length: n }, (_, i) => `Plot${i + 1}`));
    for (const plot of plots) {
      const tiles = plot.children.filter((c) => c.attributes?.AppleTags === 'AppleTile');
      assert.equal(tiles.length, plotTiles * plotTiles, `${plot.name} has ${plotTiles} x ${plotTiles} tiles`);
      let labels = 0;
      walk(plot.children, (i) => { if (i.className === 'TextLabel' && i.name === 'OwnerName') labels++; });
      assert.equal(labels, 2, 'the sign has its owner name on both faces');
      assert.ok(plot.children.some((c) => c.name === 'Frame'));
    }
  }
});

test('hub map: the road bricks lie along their spokes, turned to run along them', () => {
  const L = M.hubLayout(4, 6);
  const road = byName(hubMap(L), 'Road')[0].children;
  L.hub.spokes.forEach(([a, b], i) => {
    const brick = road.find((p) => p.name === `Spoke${i + 1}`);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    assert.ok(Math.abs(brick.props.Size[2] - len) < 1e-6 && brick.props.Size[0] === M.LANE_WIDTH);
    assert.ok(Math.abs(brick.props.Position[0] - (a[0] + b[0]) / 2) < 1e-6 && Math.abs(brick.props.Position[2] - (a[1] + b[1]) / 2) < 1e-6);
    // the brick's own Z axis points along the spoke: (sin yaw, cos yaw) is its unit direction
    const yaw = brick.props.Orientation[1] * Math.PI / 180;
    assert.ok(Math.abs(Math.sin(yaw) - (b[0] - a[0]) / len) < 1e-3 && Math.abs(Math.cos(yaw) - (b[1] - a[1]) / len) < 1e-3, `spoke ${i + 1} is turned the wrong way`);
  });
});

test('hub map: no bare terrace slabs (the owner read them as junk; library scenery takes their place)', () => {
  const L = M.hubLayout(2, 5, { plotTiles: 5 });
  const island = byName(hubMap(L), 'Island')[0].children;
  assert.ok(island.length > 0, 'the island is there');
  assert.equal(island.filter((p) => /^Terrace/.test(p.name)).length, 0);
});

test('hub map: a big hero gets a hub that holds it, with the pads and the spawn off it', () => {
  const hero = [82, 41];
  const L = M.hubLayout(7, 4, { plotTiles: 4, hero });
  const r = Math.hypot(hero[0], hero[1]) / 2;
  for (const [name, p] of [['shop', L.hub.shopPad], ['sell', L.hub.sellPad], ['spawn', L.spawn]]) {
    assert.ok(Math.hypot(p[0], p[1]) >= r + 4, `the ${name} pad is on the hero`);
    assert.ok(Math.max(Math.abs(p[0]), Math.abs(p[1])) + 5 <= L.hub.radius, `the ${name} pad hangs off the hub`);
  }
  assert.ok(L.hub.radius >= r + 10, 'the hub is smaller than the hero');
  assert.ok(M.hubLayout(7, 4, { plotTiles: 4 }).hub.radius < L.hub.radius, 'a small place keeps a small hub');
});

test('hub map: deterministic', () => {
  assert.equal(JSON.stringify(hubMap(M.hubLayout(6, 4))), JSON.stringify(hubMap(M.hubLayout(6, 4))));
});

test('lane map: still exactly what it was before the hub (a TRIPWIRE: re-record only after reading the diff of the map)', () => {
  // Fingerprints taken from the map of five seeds before hub mode existed. Any change to the lane-defense map moves them;
  // when one moves, look at what changed in the map and decide, do not just paste the new value.
  const WANT = { 1: '12dff1ff1c9e9154', 2: 'ce0cd68d23af559e', 3: '508dea05d220a49d', 20260930: '64c9b9893106213a', 99: '4268343684718d13' };
  assert.equal(Object.keys(WANT).length, 5);
  for (const [seed, want] of Object.entries(WANT)) {
    const layout = M.laneLayout(Number(seed));
    assert.ok(layout.lane.length > 4 && !layout.hub && layout.plotTiles === undefined, 'a lane layout has no hub fields');
    const map = M.studdedMap({ layout, tile: M.TILE, plotTiles: M.plotTiles, plotHalf: (M.TILE * M.PLOT_TILES) / 2, laneWidth: M.LANE_WIDTH, words: { gate: 'Zombie Gate', plot: 'Free plot' }, seed: M.rng(Number(seed) ^ 0x51ed) });
    assert.equal(createHash('sha256').update(JSON.stringify(map)).digest('hex').slice(0, 16), want, `the lane map of seed ${seed} changed`);
    const names = map.map((i) => i.name);
    for (const must of ['Gate', 'Lanes', 'Road', 'Plaza', 'Guide']) assert.ok(names.includes(must), `the lane map keeps its ${must}`);
    assert.ok(!names.includes('ShopPad') && !names.includes('Hub'));
  }
});

test('plotTiles keeps its old output and takes an optional size', () => {
  assert.equal(M.plotTiles([0, 0]).length, 9);
  assert.equal(M.plotTiles([0, 0], 4).length, 16);
  assert.deepEqual(M.plotTiles([10, 20], 3), M.plotTiles([10, 20]));
});
