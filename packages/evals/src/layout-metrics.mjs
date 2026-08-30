// Layout metrics — composition, measured from geometry with no model call.
//
// The gap these close, measured: a plaza built with 725 parts across 10 materials and 5 lights
// passed every property check, and still read as a flat plate with props scattered round the rim.
// Part count went up 40x; composition did not move. Nothing in the system could say so, because
// nothing measured spacing, repetition or density.
//
// Specified in docs/research/visual-eval-design.md §7.8-7.10. That document defined them and
// nothing implemented them; this is the implementation. Positions, sizes and rotations are already
// in the scene description, so this is pure arithmetic — no capture, no render, no inference.
//
// Every threshold is marked [PROV] in the source document: provisional, reasoned rather than
// calibrated against human ranking. They are reported beside the numbers so a caller can disagree
// with a band without disagreeing with the measurement.

const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000);

/** Yaw in radians from a row-major 3x3 rotation matrix (identity when absent). */
function yawOf(part) {
  const r = part.rot;
  return r ? Math.atan2(r[2], r[8]) : 0;
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2; // XZ plane; layout is a plan problem

/**
 * Structural parts are ground, walls, floors and ceilings — anything spanning a large fraction of
 * the scene. They are excluded from prop statistics, or one big floor slab dominates every spacing
 * measurement and the numbers describe the slab instead of the composition.
 */
function partition(parts, radius, baseY, sceneHeight) {
  const structural = [];
  const props = [];
  for (const p of parts) {
    const big = Math.max(p.size[0], p.size[1], p.size[2]) > 0.4 * radius;
    // Paving is structural too. A tiled floor is many small parts, so the size test alone counts
    // every tile as a prop — measured, that put the improved plaza at 94 props per 1000 stud² and
    // flagged a well-dressed scene as cluttered. A part that is flat and lying on the floor is
    // ground, however small each piece is.
    const top = p.pos[1] + p.size[1] / 2;
    const flat = p.size[1] <= 1.5 && p.size[1] < 0.35 * Math.min(p.size[0], p.size[2]);
    const onFloor = top - baseY <= Math.max(2, 0.08 * sceneHeight);
    (big || (flat && onFloor) ? structural : props).push(p);
  }
  return { structural, props };
}

/** §7.8 — nearest-neighbour spacing coefficient of variation. */
export function neighbourSpacingCV(props) {
  if (props.length < 3) return null;
  const d1 = [];
  for (let i = 0; i < props.length; i++) {
    let best = Infinity;
    for (let j = 0; j < props.length; j++) {
      if (i === j) continue;
      const d = dist2(props[i].pos, props[j].pos);
      if (d < best) best = d;
    }
    if (best < Infinity) d1.push(Math.sqrt(best));
  }
  if (!d1.length) return null;
  const mean = d1.reduce((a, b) => a + b, 0) / d1.length;
  if (mean === 0) return 0;
  return round3(Math.sqrt(d1.reduce((a, b) => a + (b - mean) ** 2, 0) / d1.length) / mean);
}

/**
 * §7.8 — the largest fraction of props that snap to any single grid pitch. High means the scene was
 * stamped out on a grid, which is the generated-content signature.
 */
export function latticeScore(props) {
  if (props.length < 4) return null;
  let best = 0;
  for (let g = 2; g <= 32; g += 0.5) {
    const tol = 0.05 * g;
    let hits = 0;
    for (const p of props) {
      const dx = Math.abs(p.pos[0] / g - Math.round(p.pos[0] / g)) * g;
      const dz = Math.abs(p.pos[2] / g - Math.round(p.pos[2] / g)) * g;
      if (dx <= tol && dz <= tol) hits++;
    }
    best = Math.max(best, hits / props.length);
  }
  return round3(best);
}

/** §7.8 — Shannon entropy of yaw in 15° bins, normalised. Low means everything faces the same way. */
export function rotationEntropy(props) {
  if (props.length < 4) return null;
  const bins = new Array(24).fill(0);
  for (const p of props) {
    const deg = (((((yawOf(p) * 180) / Math.PI) % 360) + 360) % 360);
    bins[Math.min(23, Math.floor(deg / 15))]++;
  }
  let h = 0;
  for (const b of bins) {
    if (!b) continue;
    const p = b / props.length;
    h -= p * Math.log2(p);
  }
  return round3(h / Math.log2(24));
}

/** §7.9 — mirror symmetry about X through the centroid. Task-conditional, not universally good. */
export function symmetryX(props, radius) {
  if (props.length < 4) return null;
  const cx = props.reduce((a, p) => a + p.pos[0], 0) / props.length;
  const tol = 0.05 * radius;
  let matched = 0;
  for (const p of props) {
    const mx = 2 * cx - p.pos[0];
    if (
      props.some(
        (q) =>
          q !== p &&
          Math.hypot(q.pos[0] - mx, q.pos[2] - p.pos[2]) <= tol &&
          q.size.every((s, i) => Math.abs(s - p.size[i]) <= 0.1 * Math.max(s, p.size[i], 0.001)),
      )
    ) {
      matched++;
    }
  }
  return round3(matched / props.length);
}

/** §7.10 — props per 1000 stud² of footprint. */
export function propDensity(props, footprintStuds2) {
  return footprintStuds2 ? round3((1000 * props.length) / footprintStuds2) : null;
}

/**
 * Provisional bands from §7.8-7.10, reported with the numbers so they can be argued with.
 *
 * MEASURED CONFIDENCE, so these are not all weighted equally:
 *
 *   grid clone (lattice + rotation entropy) — WORKS. On the rejected plaza: lattice 1.0, rotation
 *     entropy 0.0, flagged. On the rule-built plaza: 0.047 and 0.667, not flagged. This is the
 *     "identical props at identical spacing" failure, caught arithmetically.
 *   spacing CV — WORKS. Rejected 3.606 (clustered then scattered); rule-built 0.937, inside the
 *     healthy 0.35-1.2 band.
 *   prop density — SENSITIVE TO CLASSIFICATION, treat as a hint. It depends entirely on what counts
 *     as a prop. Tiled paving was miscounted until the flat-on-floor rule was added (94 -> 74 per
 *     1000 stud²), and a 60-segment curb ring is still counted as 60 props when it is really one
 *     piece of trim. The rule-built plaza is flagged "cluttered" largely because of that ring.
 *     A repeated-trim detector would fix it and has not been written.
 */
export const LAYOUT_BANDS = {
  gridClone: { lattice: 0.8, rotationEntropy: 0.2 },
  mechanicalSpacingCV: 0.15,
  healthySpacingCV: [0.35, 1.2],
  propDensity: { plaza: [5, 25], outdoor: [5, 25], interior: [25, 90], shop: [25, 90], obby: [2, 15] },
};

/** Anything this big in plan is a baseplate-style ground plane — excluded from framing, as in the renderer. */
const GROUND_PLANE_STUDS = 600;

/**
 * Full layout report for a scene description (the shape render-scene.mjs consumes).
 * `kind` selects the prop-density band; an unknown kind skips that check rather than inventing one.
 */
export function layoutMetrics(scene, { kind = 'plaza' } = {}) {
  const parts = (scene.parts ?? []).filter((p) => (p.transparency ?? 0) < 0.95);
  if (!parts.length) return { error: 'no renderable parts' };

  const framed = parts.filter((p) => p.size[0] <= GROUND_PLANE_STUDS && p.size[2] <= GROUND_PLANE_STUDS);
  if (framed.length < 2) return { error: 'not enough geometry to measure layout' };

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of framed) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p.pos[i] - p.size[i] / 2);
      hi[i] = Math.max(hi[i], p.pos[i] + p.size[i] / 2);
    }
  }
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const radius = Math.max(Math.hypot(...size) / 2, 1);
  const footprint = Math.max(size[0] * size[2], 1);

  const { structural, props } = partition(framed, radius, lo[1], size[1]);
  const cv = neighbourSpacingCV(props);
  const lattice = latticeScore(props);
  const entropy = rotationEntropy(props);
  const density = propDensity(props, footprint);

  const flags = [];
  if (lattice != null && entropy != null && lattice > LAYOUT_BANDS.gridClone.lattice && entropy < LAYOUT_BANDS.gridClone.rotationEntropy) {
    flags.push(`grid clone: ${Math.round(lattice * 100)}% of props snap to one grid pitch and nearly all face the same way — stamped out, not placed`);
  }
  if (cv != null && cv < LAYOUT_BANDS.mechanicalSpacingCV) {
    flags.push(`mechanical spacing: nearest-neighbour CV ${cv} (below ${LAYOUT_BANDS.mechanicalSpacingCV}) — props evenly spaced like fence posts`);
  }
  const band = LAYOUT_BANDS.propDensity[kind];
  if (band && density != null) {
    if (density < band[0]) flags.push(`sparse: ${density} props per 1000 stud² (a ${kind} wants ${band[0]}-${band[1]}) — the space is under-dressed`);
    if (density > band[1]) flags.push(`cluttered: ${density} props per 1000 stud² (a ${kind} wants ${band[0]}-${band[1]})`);
  }
  // The plaza signature: a huge footprint whose height barely rises off the ground.
  if (size[1] < 0.12 * Math.max(size[0], size[2]) && Math.max(size[0], size[2]) > 40) {
    flags.push(`flat: spans ${Math.round(Math.max(size[0], size[2]))} studs across but only ${size[1].toFixed(1)} tall — no vertical variation, so it reads as a plate`);
  }

  return {
    parts: framed.length,
    props: props.length,
    structural: structural.length,
    footprintStuds2: Math.round(footprint),
    sizeStuds: size.map((v) => Math.round(v * 10) / 10),
    neighbourSpacingCV: cv,
    latticeScore: lattice,
    rotationEntropy: entropy,
    symmetryX: symmetryX(props, radius),
    propDensity: density,
    flags,
  };
}
