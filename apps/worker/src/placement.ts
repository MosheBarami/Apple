// Where the copies of one piece go, decided by the harness from a few numbers the model gives it.
//
// Owner benchmark 2026-10-02 (a canyon map): the model spent 131 s and 155 s of thinking hand-computing coordinates for ~75
// parts, and the forest map's scatter and clone calls failed repeatedly. Placement is arithmetic, not judgement: the model
// says WHERE in the three shapes below (explicit points, a line, an area) and how the copies vary, and this module produces
// the positions, deterministically for a given seed, with no knowledge of what is being placed.
//
// Pure: no Studio, no clock, no Math.random.

export type Vec3 = [number, number, number];

export interface CopyPlan {
  at: Vec3;
  /** Degrees about the vertical. */
  yaw: number;
  /** Uniform scale factor (1 = the template's own size), when the caller asked for one. */
  scale?: number;
}

export interface PlacementRequest {
  /** Explicit positions (bottom-centre of each copy). */
  at?: unknown;
  /** A polyline with a spacing or a count: copies stand along it. */
  along?: unknown;
  /** A rectangle or polygon on the ground plane with a count: copies stand inside it, apart from each other. */
  within?: unknown;
  /** Degrees about the vertical: a number, or [min, max] for a different yaw per copy. Default 0 (the template's own). */
  yaw?: unknown;
  /** A factor, or [min, max] for a different one per copy. */
  scale?: unknown;
  /** Studs of random offset on the ground plane added to every copy. */
  jitter?: unknown;
  /** Same seed, same positions. Default 1. */
  seed?: unknown;
}

export const MAX_COPIES = 1000;

/** mulberry32: small, fast, and the same sequence for the same seed on every machine. */
export function seeded(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const vec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);
const vec2 = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(finite);

/** A number, or a [min, max] pair, as a sampler. */
function range(v: unknown, label: string, lo: number, hi: number): { error: string } | { pick: (rand: () => number) => number } | null {
  if (v === undefined) return null;
  if (finite(v)) {
    if (v < lo || v > hi) return { error: `${label} must be between ${lo} and ${hi}.` };
    return { pick: () => v };
  }
  if (vec2(v) && v[0] <= v[1] && v[0] >= lo && v[1] <= hi) {
    const [a, b] = v;
    return { pick: (rand) => a + (b - a) * rand() };
  }
  return { error: `${label} must be a number or [min, max] between ${lo} and ${hi}.` };
}

/** Points at equal arc length along a polyline, with y interpolated. `spacing` studs apart, or `count` points end to end. */
export function sampleAlong(points: readonly Vec3[], opts: { spacing?: number; count?: number }): Vec3[] {
  const legs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1], points[i]![2] - points[i - 1]![2]);
    legs.push(d);
    total += d;
  }
  const n = opts.count !== undefined ? opts.count : Math.floor(total / (opts.spacing as number)) + 1;
  const at = (dist: number): Vec3 => {
    let left = dist;
    for (let i = 0; i < legs.length; i++) {
      if (left <= legs[i]! || i === legs.length - 1) {
        const t = legs[i]! > 0 ? Math.min(1, left / legs[i]!) : 0;
        const a = points[i]!;
        const b = points[i + 1]!;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
      left -= legs[i]!;
    }
    return points[points.length - 1]!;
  };
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const dist = n === 1 ? total / 2 : opts.count !== undefined ? (total * i) / (n - 1) : i * (opts.spacing as number);
    out.push(at(Math.min(dist, total)));
  }
  return out;
}

function inPolygon(x: number, z: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Up to `count` points inside the shape, at least `minSpacing` apart; fewer when the area cannot hold them. */
export function sampleWithin(shape: { min: [number, number]; max: [number, number] } | { polygon: [number, number][] }, count: number, minSpacing: number, rand: () => number): [number, number][] {
  const poly = 'polygon' in shape ? shape.polygon : null;
  const rect = 'polygon' in shape ? null : shape;
  const xs = poly ? poly.map((p) => p[0]) : [rect!.min[0], rect!.max[0]];
  const zs = poly ? poly.map((p) => p[1]) : [rect!.min[1], rect!.max[1]];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
  const out: [number, number][] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const x = x0 + (x1 - x0) * rand();
    const z = z0 + (z1 - z0) * rand();
    if (poly && !inPolygon(x, z, poly)) continue;
    if (minSpacing > 0 && out.some((p) => Math.hypot(p[0] - x, p[1] - z) < minSpacing)) continue;
    out.push([x, z]);
  }
  return out;
}

export interface PlannedCopies {
  copies: CopyPlan[];
  /** True when some positions have no ground height yet (`within` without a `y`): the caller measures it once. */
  needsGround: boolean;
  /** Said back to the model when fewer copies than asked fit. */
  note?: string;
}

/**
 * The copies a request describes, or the one sentence that says what is wrong with it. Exactly one of at / along / within.
 * `limit` is the world-coordinate bound the plugin enforces.
 */
export function planCopies(req: PlacementRequest, limit: number): PlannedCopies | { error: string } {
  const shapes = (['at', 'along', 'within'] as const).filter((k) => req[k] !== undefined);
  if (shapes.length !== 1) return { error: 'Give exactly one of at, along or within to place copies.' };
  const within = (v: Vec3) => v.every((n) => Math.abs(n) <= limit);
  const rand = seeded(finite(req.seed) ? req.seed : 1);

  const jitter = req.jitter === undefined ? 0 : req.jitter;
  if (!finite(jitter) || jitter < 0 || jitter > 1000) return { error: 'jitter must be 0-1000 studs.' };
  const yaw = range(req.yaw, 'yaw', -360, 360);
  if (yaw && 'error' in yaw) return yaw;
  const scale = range(req.scale, 'scale', 0.05, 50);
  if (scale && 'error' in scale) return scale;

  let positions: Vec3[] = [];
  let needsGround = false;
  let note: string | undefined;
  if (req.at !== undefined) {
    if (!Array.isArray(req.at) || req.at.length < 1 || req.at.length > MAX_COPIES || !req.at.every(vec3)) return { error: `at must list 1-${MAX_COPIES} positions [x, y, z].` };
    if (!req.at.every(within)) return { error: 'at holds a position outside the world.' };
    positions = req.at as Vec3[];
  } else if (req.along !== undefined) {
    const a = req.along as { points?: unknown; spacing?: unknown; count?: unknown } | null;
    if (!a || typeof a !== 'object' || !Array.isArray(a.points) || a.points.length < 2 || a.points.length > 64 || !a.points.every(vec3)) return { error: 'along.points must list 2-64 positions [x, y, z].' };
    if (!(a.points as Vec3[]).every(within)) return { error: 'along.points holds a position outside the world.' };
    if ((a.spacing === undefined) === (a.count === undefined)) return { error: 'along needs exactly one of spacing (studs apart) or count.' };
    if (a.spacing !== undefined && (!finite(a.spacing) || a.spacing < 0.5)) return { error: 'along.spacing must be at least 0.5 studs.' };
    if (a.count !== undefined && (!Number.isInteger(a.count) || (a.count as number) < 1 || (a.count as number) > MAX_COPIES)) return { error: `along.count must be a whole number 1-${MAX_COPIES}.` };
    positions = sampleAlong(a.points as Vec3[], { spacing: a.spacing as number | undefined, count: a.count as number | undefined });
    if (positions.length > MAX_COPIES) return { error: `along would place ${positions.length} copies; the limit is ${MAX_COPIES}. Use a larger spacing.` };
  } else {
    const w = req.within as { rect?: { min?: unknown; max?: unknown }; polygon?: unknown; count?: unknown; minSpacing?: unknown; y?: unknown } | null;
    if (!w || typeof w !== 'object') return { error: 'within must be {rect:{min:[x,z],max:[x,z]} or polygon:[[x,z],...], count, minSpacing?, y?}.' };
    if (!Number.isInteger(w.count) || (w.count as number) < 1 || (w.count as number) > MAX_COPIES) return { error: `within.count must be a whole number 1-${MAX_COPIES}.` };
    if (w.minSpacing !== undefined && (!finite(w.minSpacing) || w.minSpacing < 0 || w.minSpacing > 1000)) return { error: 'within.minSpacing must be 0-1000 studs.' };
    if (w.y !== undefined && (!finite(w.y) || Math.abs(w.y) > limit)) return { error: 'within.y must be a height in studs.' };
    let shape: Parameters<typeof sampleWithin>[0];
    if (w.polygon !== undefined) {
      if (!Array.isArray(w.polygon) || w.polygon.length < 3 || w.polygon.length > 32 || !w.polygon.every(vec2)) return { error: 'within.polygon must list 3-32 corners [x, z].' };
      shape = { polygon: w.polygon as [number, number][] };
    } else if (w.rect && vec2(w.rect.min) && vec2(w.rect.max) && w.rect.min[0] < w.rect.max[0] && w.rect.min[1] < w.rect.max[1]) {
      shape = { min: w.rect.min, max: w.rect.max };
    } else return { error: 'within needs rect {min:[x,z], max:[x,z]} (min below max) or polygon [[x,z],...].' };
    const flat = sampleWithin(shape, w.count as number, (w.minSpacing as number | undefined) ?? 0, rand);
    if (flat.some(([x, z]) => Math.abs(x) > limit || Math.abs(z) > limit)) return { error: 'within reaches outside the world.' };
    if (flat.length < (w.count as number)) note = `Only ${flat.length} of ${w.count} copies fit with minSpacing ${(w.minSpacing as number | undefined) ?? 0}; use a larger area or a smaller spacing for more.`;
    if (w.y === undefined) needsGround = true;
    positions = flat.map(([x, z]) => [x, (w.y as number | undefined) ?? 0, z] as Vec3);
  }

  const copies = positions.map((p) => {
    const dx = jitter ? (rand() * 2 - 1) * jitter : 0;
    const dz = jitter ? (rand() * 2 - 1) * jitter : 0;
    const copy: CopyPlan = { at: [p[0] + dx, p[1], p[2] + dz], yaw: yaw ? yaw.pick(rand) : 0 };
    if (scale) copy.scale = scale.pick(rand);
    return copy;
  });
  return { copies, needsGround, ...(note ? { note } : {}) };
}
