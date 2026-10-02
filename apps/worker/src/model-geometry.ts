/**
 * Plain 3D maths for reading a placed model: a CFrame as the 12 numbers `CFrame:GetComponents()` gives (x, y, z, then the
 * rotation matrix by rows, so a local axis is a COLUMN), boxes, and the hinge arithmetic the AppleBehave runtime uses.
 *
 * `swingComponents` here and `AppleBehave.swingComponents` in packages/components/behave/AppleBehave.luau are the same
 * formula written twice, because the worker predicts what the runtime will do (which way a positive angle opens a part)
 * and the runtime does it. tests/model-geometry.test.mjs runs the Luau one in the luau CLI and compares the two, so they
 * cannot drift apart without a red test.
 *
 * Pure: no I/O, no Roblox types, nothing here knows what a model is.
 */

export type Vec3 = [number, number, number];
/** x, y, z, R00, R01, R02, R10, R11, R12, R20, R21, R22. */
export type CF = number[];

export const IDENTITY: CF = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
export const AXES: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
export const AXIS_NAMES = ['x', 'y', 'z'] as const;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function isCF(v: unknown): v is CF {
  return Array.isArray(v) && v.length === 12 && v.every(finite);
}

/** A typed property as get_tree reports it ({ t: 'CFrame', v: [12] }), or the bare array. */
export function cframeOf(raw: unknown): CF | null {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { v?: unknown }).v : raw;
  return isCF(v) ? v : null;
}

export function vec3Of(raw: unknown): Vec3 | null {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { v?: unknown }).v : raw;
  return Array.isArray(v) && v.length === 3 && v.every(finite) ? [v[0] as number, v[1] as number, v[2] as number] : null;
}

export function vectorToWorld(c: CF, v: Vec3): Vec3 {
  return [
    c[3]! * v[0] + c[4]! * v[1] + c[5]! * v[2],
    c[6]! * v[0] + c[7]! * v[1] + c[8]! * v[2],
    c[9]! * v[0] + c[10]! * v[1] + c[11]! * v[2],
  ];
}

export function pointToWorld(c: CF, v: Vec3): Vec3 {
  const w = vectorToWorld(c, v);
  return [c[0]! + w[0], c[1]! + w[1], c[2]! + w[2]];
}

/** The inverse: a world point in the frame's own coordinates (the rotation is orthonormal, so its inverse is its transpose). */
export function pointToLocal(c: CF, p: Vec3): Vec3 {
  const d: Vec3 = [p[0] - c[0]!, p[1] - c[1]!, p[2] - c[2]!];
  return [
    c[3]! * d[0] + c[6]! * d[1] + c[9]! * d[2],
    c[4]! * d[0] + c[7]! * d[1] + c[10]! * d[2],
    c[5]! * d[0] + c[8]! * d[1] + c[11]! * d[2],
  ];
}

/** The world point at `frac` (each -1..1 of the half-size) of a box. */
export function boxPoint(box: CF, size: Vec3, frac: Vec3): Vec3 {
  return pointToWorld(box, [(frac[0] * size[0]) / 2, (frac[1] * size[1]) / 2, (frac[2] * size[2]) / 2]);
}

/** The frame turned `degrees` about the line through `pivot` along `axis` (world, any length), right-hand rule. */
export function swingComponents(c: CF, pivot: Vec3, axis: Vec3, degrees: number): CF {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-9 || degrees === 0) return [...c];
  const [x, y, z] = [axis[0] / len, axis[1] / len, axis[2] / len];
  const th = (degrees * Math.PI) / 180;
  const s = Math.sin(th), co = Math.cos(th), t = 1 - co;
  const r00 = co + x * x * t, r01 = x * y * t - z * s, r02 = x * z * t + y * s;
  const r10 = y * x * t + z * s, r11 = co + y * y * t, r12 = y * z * t - x * s;
  const r20 = z * x * t - y * s, r21 = z * y * t + x * s, r22 = co + z * z * t;
  const px = c[0]! - pivot[0], py = c[1]! - pivot[1], pz = c[2]! - pivot[2];
  const out: CF = [
    pivot[0] + r00 * px + r01 * py + r02 * pz,
    pivot[1] + r10 * px + r11 * py + r12 * pz,
    pivot[2] + r20 * px + r21 * py + r22 * pz,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];
  for (let col = 0; col < 3; col++) {
    const a = c[3 + col]!, b = c[6 + col]!, d = c[9 + col]!;
    out[3 + col] = r00 * a + r01 * b + r02 * d;
    out[6 + col] = r10 * a + r11 * b + r12 * d;
    out[9 + col] = r20 * a + r21 * b + r22 * d;
  }
  return out;
}

/** Distance from a world point to a box (0 inside or on it). */
export function pointToBoxDistance(p: Vec3, box: CF, size: Vec3): number {
  const l = pointToLocal(box, p);
  const dx = Math.max(Math.abs(l[0]) - size[0] / 2, 0);
  const dy = Math.max(Math.abs(l[1]) - size[1] / 2, 0);
  const dz = Math.max(Math.abs(l[2]) - size[2] / 2, 0);
  return Math.hypot(dx, dy, dz);
}

/** One of a box's twelve edges: runs along local axis `axis`, at ±1 of the half-size on the other two. */
export interface BoxEdge {
  axis: 'x' | 'y' | 'z';
  /** The edge's midpoint as -1..1 of each half-size; the `axis` component is 0. This is a hinge `pivot` for AppleBehave. */
  pivot: Vec3;
}

export function boxEdges(): BoxEdge[] {
  const out: BoxEdge[] = [];
  for (let a = 0; a < 3; a++) {
    const [b, c] = [0, 1, 2].filter((i) => i !== a) as [number, number];
    for (const sb of [-1, 1]) for (const sc of [-1, 1]) {
      const pivot: Vec3 = [0, 0, 0];
      pivot[b] = sb; pivot[c] = sc;
      out.push({ axis: AXIS_NAMES[a]!, pivot });
    }
  }
  return out;
}

/** The two ends and the middle of an edge, in world space. */
export function edgeSamples(box: CF, size: Vec3, edge: BoxEdge): Vec3[] {
  const a = AXIS_NAMES.indexOf(edge.axis);
  return [-1, 0, 1].map((k) => {
    const f: Vec3 = [...edge.pivot];
    f[a] = k;
    return boxPoint(box, size, f);
  });
}

/** The world axis a vector points mostly along, as '+x', '-y' …; null when it has no length. */
export function dominantAxis(v: Vec3): string | null {
  const m = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  if (m < 1e-9) return null;
  const i = Math.abs(v[0]) === m ? 0 : Math.abs(v[1]) === m ? 1 : 2;
  return `${v[i]! < 0 ? '-' : '+'}${AXIS_NAMES[i]}`;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Which way a POSITIVE angle about this hinge carries a part's centre: the centre's velocity is axis × (centre - pivot).
 * The sign the agent needs for "open upward" or "swing outward" is then a reading, not a guess. null when the centre lies on
 * the axis (nothing swings).
 */
export function positiveCarries(pivot: Vec3, axis: Vec3, centre: Vec3): string | null {
  return dominantAxis(cross(axis, [centre[0] - pivot[0], centre[1] - pivot[1], centre[2] - pivot[2]]));
}

export const round = (n: number, places = 3): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};
export const round3 = (v: readonly number[]): Vec3 => [round(v[0]!), round(v[1]!), round(v[2]!)];
