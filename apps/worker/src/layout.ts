// Layout analysis — composition measured from geometry, with no model call.
//
// The failure this closes: a plaza built with 725 parts across 10 materials and 5 lights passed
// every property check and every pixel check, and still read as a flat plate with props scattered
// round the rim. Part count went up 40x; composition did not move. Nothing measured spacing,
// repetition or density, so nothing could say so.
//
// This mirrors packages/evals/src/layout-metrics.mjs, which is the calibrated reference
// implementation and carries the tests. Kept in sync deliberately: the eval version grades stored
// fixtures offline, this one runs in the request path against a live capture.
import type { SceneLayout } from '@golem/shared';

interface P {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Provisional bands, from docs/research/visual-eval-design.md §7.8-7.10. */
export const LAYOUT_BANDS = {
  gridCloneLattice: 0.8,
  gridCloneRotationEntropy: 0.2,
  mechanicalSpacingCV: 0.15,
};

export interface LayoutReport {
  props: number;
  structural: number;
  neighbourSpacingCV: number | null;
  latticeScore: number | null;
  rotationEntropy: number | null;
  flags: string[];
}

/**
 * Analyse a capture. Returns null when there is not enough geometry to say anything — a handful of
 * parts has no meaningful spacing distribution, and inventing one would be worse than silence.
 */
export function analyseLayout(layout: SceneLayout | undefined, boundsSize: [number, number, number]): LayoutReport | null {
  if (!layout?.parts?.length || layout.parts.length < 6) return null;
  const all: P[] = layout.parts.map((a) => ({ x: a[0]!, y: a[1]!, z: a[2]!, sx: a[3]!, sy: a[4]!, sz: a[5]!, yaw: a[6]! }));

  const radius = Math.max(Math.hypot(...boundsSize) / 2, 1);
  const baseY = Math.min(...all.map((p) => p.y - p.sy / 2));
  const height = boundsSize[1];

  // Ground, walls and paving are structure. Counting every paving tile as a prop makes a
  // well-dressed floor look like clutter — measured, and corrected by the flat-on-floor test.
  const props: P[] = [];
  let structural = 0;
  for (const p of all) {
    const big = Math.max(p.sx, p.sy, p.sz) > 0.4 * radius;
    const flat = p.sy <= 1.5 && p.sy < 0.35 * Math.min(p.sx, p.sz);
    const onFloor = p.y + p.sy / 2 - baseY <= Math.max(2, 0.08 * height);
    if (big || (flat && onFloor)) structural++;
    else props.push(p);
  }
  if (props.length < 4) return null;

  // nearest-neighbour spacing in the XZ plane; layout is a plan problem
  const d1: number[] = [];
  for (let i = 0; i < props.length; i++) {
    let best = Infinity;
    for (let j = 0; j < props.length; j++) {
      if (i === j) continue;
      const d = (props[i]!.x - props[j]!.x) ** 2 + (props[i]!.z - props[j]!.z) ** 2;
      if (d < best) best = d;
    }
    if (best < Infinity) d1.push(Math.sqrt(best));
  }
  const mean = d1.reduce((a, b) => a + b, 0) / d1.length;
  const cv = mean === 0 ? 0 : round3(Math.sqrt(d1.reduce((a, b) => a + (b - mean) ** 2, 0) / d1.length) / mean);

  let lattice = 0;
  for (let g = 2; g <= 32; g += 0.5) {
    const tol = 0.05 * g;
    let hits = 0;
    for (const p of props) {
      const dx = Math.abs(p.x / g - Math.round(p.x / g)) * g;
      const dz = Math.abs(p.z / g - Math.round(p.z / g)) * g;
      if (dx <= tol && dz <= tol) hits++;
    }
    lattice = Math.max(lattice, hits / props.length);
  }
  lattice = round3(lattice);

  const bins = new Array(24).fill(0);
  for (const p of props) bins[Math.min(23, Math.floor((((p.yaw % 360) + 360) % 360) / 15))]++;
  let h = 0;
  for (const b of bins) {
    if (!b) continue;
    const q = b / props.length;
    h -= q * Math.log2(q);
  }
  const entropy = round3(h / Math.log2(24));

  const flags: string[] = [];
  if (lattice > LAYOUT_BANDS.gridCloneLattice && entropy < LAYOUT_BANDS.gridCloneRotationEntropy) {
    flags.push(
      `grid clone: ${Math.round(lattice * 100)}% of props sit on one grid pitch and nearly all face the same way — stamped out rather than placed`,
    );
  }
  if (cv < LAYOUT_BANDS.mechanicalSpacingCV) {
    flags.push(`mechanical spacing: nearest-neighbour variation ${cv} — props evenly spaced like fence posts`);
  }
  const span = Math.max(boundsSize[0], boundsSize[2]);
  if (boundsSize[1] < 0.12 * span && span > 40) {
    flags.push(`flat: spans ${Math.round(span)} studs but only ${boundsSize[1].toFixed(1)} tall — no vertical variation, so it reads as a plate`);
  }

  return { props: props.length, structural, neighbourSpacingCV: cv, latticeScore: lattice, rotationEntropy: entropy, flags };
}
