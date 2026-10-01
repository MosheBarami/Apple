/**
 * THE MAP OF A PLOT SIMULATOR: a square hub in the middle (where players appear, with a shop pad, a sell pad and a spot
 * for the hero), one plot per player evenly round it on a ring (the whole ring turned by the seed), and a straight
 * spoke road from the hub to each plot. There is no enemy lane: `lane` is empty, which is how studded-map.ts knows to
 * draw a hub instead of a gate and a plaza.
 *
 * Everything lives on the ground plane (x, z) with the hub at the origin. Pure and deterministic: the same seed,
 * players and plot size always give the same layout (tests/hub-layout.test.mjs holds it to that and to the geometry:
 * no overlaps, every plot reached by a spoke, props off the roads).
 *
 * A spoke is [start, end]: `start` is where its centre line leaves the hub square, `end` where it meets the edge of its
 * plot's frame, so a road never runs under a plot or across the hub.
 */
import { LANE_WIDTH, TILE, rng, segDist, type Layout, type P2 } from './compose';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** Studs between two neighbouring plot frames at the closest. */
const PLOT_GAP = 12;
/** The shortest stretch of road between the hub and a plot frame. */
const SPOKE_MIN = 22;
/** Pads are squares this many studs on a side; the spawn pad is 10. */
export const PAD = 10;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The players the map is made for, kept to what fits (2..8; a number that is not one gives 4). */
export function clampPlayers(players: number): number {
  if (!Number.isFinite(players)) return 4;
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(players)));
}

export function hubLayout(seed: number, players: number, opts: { plotTiles?: number } = {}): Layout {
  const n = clampPlayers(players);
  const tiles = Number.isFinite(opts.plotTiles) ? Math.max(1, Math.min(8, Math.round(opts.plotTiles!))) : 4;
  const r = rng(seed);
  const frameHalf = (tiles * TILE) / 2 + 1; // the plot's wooden frame is one stud wider than its tiles
  const hubHalf = 24 + 3 * n;               // the hub square runs this far from its centre to each edge

  // The ring: far enough that neighbouring frames keep PLOT_GAP between them (the chord between neighbours is at least
  // sqrt(2) times the gap that axis-aligned squares need), and that every spoke is at least SPOKE_MIN long even where
  // the hub's corner and the frame's corner point at each other.
  const byNeighbours = ((2 * frameHalf + PLOT_GAP) * Math.SQRT2) / (2 * Math.sin(Math.PI / n));
  const bySpoke = Math.SQRT2 * (hubHalf + frameHalf) + SPOKE_MIN;
  const ring = Math.ceil(Math.max(byNeighbours, bySpoke) / 2) * 2;

  const base = r() * Math.PI * 2;
  const dirs: P2[] = Array.from({ length: n }, (_, i) => {
    const a = base + (Math.PI * 2 * i) / n;
    return [Math.cos(a), Math.sin(a)] as P2;
  });
  const plots = dirs.map(([dx, dz]) => [round1(dx * ring), round1(dz * ring)] as P2);
  const spokes = dirs.map(([dx, dz], i) => {
    const m = Math.max(Math.abs(dx), Math.abs(dz)); // scales a direction to the edge of an axis-aligned square
    const [px, pz] = plots[i]!;
    return [
      [round2(dx * (hubHalf / m)), round2(dz * (hubHalf / m))] as P2,
      [round2(px - dx * (frameHalf / m)), round2(pz - dz * (frameHalf / m))] as P2,
    ];
  });

  // On the hub: the hero at the centre, the shop and sell pads between spokes (opposite each other), and the spawn out
  // along the first spoke's axis, near its mouth.
  const between = (k: number): P2 => {
    const a = base + Math.PI / n + (Math.PI * 2 * k) / n;
    return [round1(Math.cos(a) * hubHalf * 0.52), round1(Math.sin(a) * hubHalf * 0.52)];
  };
  const shopPad = between(0), sellPad = between(Math.floor(n / 2));
  const spawn: P2 = [round1(dirs[0]![0] * hubHalf * 0.8), round1(dirs[0]![1] * hubHalf * 0.8)];
  const heroSpot: P2 = [0, 0];

  const extent = Math.ceil(ring + frameHalf * Math.SQRT2 + 48);
  const ground = { center: [0, 0] as P2, size: [extent * 2, extent * 2] as P2 };

  // Props: anywhere on the ground, off every road, plot and the hub, spread apart.
  const scatter: P2[] = [];
  const clear = (p: P2, room: number) => {
    if (Math.max(Math.abs(p[0]), Math.abs(p[1])) < hubHalf + room) return false;
    if (spokes.some(([a, b]) => segDist(p, a!, b!) < LANE_WIDTH / 2 + room)) return false;
    if (plots.some(([x, z]) => Math.max(Math.abs(p[0] - x), Math.abs(p[1] - z)) < frameHalf + room)) return false;
    return true;
  };
  for (let tries = 0; scatter.length < 80 && tries < 8000; tries++) {
    const p: P2 = [-extent + 8 + r() * (extent * 2 - 16), -extent + 8 + r() * (extent * 2 - 16)];
    if (!clear(p, 6)) continue;
    if (scatter.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 9)) continue;
    scatter.push([round1(p[0]), round1(p[1])]);
  }

  const border: { at: P2; along: 'x' | 'z' }[] = [];
  const step = 12; // FENCE (compose.ts)
  for (let x = -extent + step / 2; x < extent; x += step) border.push({ at: [x, -extent + 2], along: 'x' }, { at: [x, extent - 2], along: 'x' });
  for (let z = -extent + step / 2; z < extent; z += step) border.push({ at: [-extent + 2, z], along: 'z' }, { at: [extent - 2, z], along: 'z' });

  return {
    lane: [], plots, spawn, ground, scatter, rows: [], border,
    plotTiles: tiles,
    hub: { center: [0, 0], radius: hubHalf, shopPad, sellPad, heroSpot, spokes },
  };
}
