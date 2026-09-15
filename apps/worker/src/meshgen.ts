// THE 3D PIPELINE: a part spec goes in, geometry and a bill come out.
//
// WHAT THIS IS THE PRODUCTISED VERSION OF. The design prototype ("Apple App.dc.html") drives a
// live three.js stage from a literal table of parts — `{ g: ['cyl', 1.1, 1.3, 0.5], p: [0, .25, 0],
// c: 0x2a3040, m: { rough: .8 } }` — and offers OBJ and GLB buttons beside it. That table is the
// right idea and the wrong artefact: the shapes are hard-coded, the exporters are decoration, the
// numbers under "Triangles / Materials / Bounding box" are strings typed by a designer, and none of
// it can be charged for. This module is the same idea with the fiction removed. Every number the
// panel shows is computed here from the geometry that would actually be written to the file.
//
// WHY THE GEOMETRY IS BUILT IN THE WORKER AND NOT IN THE BROWSER.
// Three consumers need the same triangles and must not each derive their own:
//   * the web viewport, which draws them,
//   * the exporters, which are the artefact the customer keeps,
//   * the QC gates in assets.ts, which decide whether the thing is a plausible crate.
// A browser-side mesh would leave the server judging a model it never saw, which is the same shape
// as the failure docs/FAILURES.md is about: the check would run, pass, and have measured nothing.
//
// WHAT IS DELIBERATELY REUSED RATHER THAN RESTATED.
//   * assets.ts owns the stud envelopes, the pivot tolerances and the triangle ceilings. This
//     module imports them; it does not keep a second copy that can drift.
//   * composition.ts owns AABB clustering. Collision decimation and print-support analysis are
//     both "which parts read as one mass", which is the question clusterMasses already answers.
//   * pricing.ts owns the Credit. A mesh charge is expressed in neurons and converted by the one
//     function that already converts everything else.
//   * packages/evals/src/glb-inspect.mjs is the reader for what exportGlb writes. It was written
//     for downloaded assets and knows nothing about this writer, which is exactly what makes it an
//     oracle rather than an echo.
//
// EVERY BOUNDARY IS VALIDATED WITH AN ALLOWLIST AND A FINITENESS TEST, NOT WITH `??`.
// A part spec arrives from a language model. `spec.size[0] ?? 1` defends undefined and passes NaN,
// "4" and Infinity straight through into a bounding box, and every downstream `>` comparison then
// fails open. So numbers are read through `finite()`, kinds and materials through a Set, and a
// refusal names the field it refused.
import {
  QC_THRESHOLDS,
  checkScale,
  pivotToleranceStuds,
  lateralPivotToleranceStuds,
  type ScaleCheck,
} from './assets';
import { clusterMasses, type ScenePart } from './composition';
import { creditsForNeurons, CREDITS_PER_BUILD } from './pricing';

export { creditsForNeurons, CREDITS_PER_BUILD };

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

/**
 * The shapes the pipeline can actually build. The prototype's five (`box`, `sphere`, `cyl`,
 * `cone`, `torus`) plus `wedge`, because a wedge is how a roof, a ramp and a chamfer stop being a
 * staircase of boxes — docs/research/3d-asset-pipeline.md §B3.2 rates it the cheapest silhouette
 * win available from primitives.
 */
export const PRIMITIVE_KINDS = ['box', 'wedge', 'cylinder', 'cone', 'sphere', 'torus'] as const;
export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/** Membership is asked of a Set, never of an object: `MATERIAL_PBR['constructor']` answers. */
const PRIMITIVE_KIND_SET: ReadonlySet<string> = new Set<string>(PRIMITIVE_KINDS);

/**
 * Roblox material -> the two PBR numbers a glTF/OBJ consumer needs, plus whether the engine treats
 * it as self-lit.
 *
 * The NAMES are the same vocabulary as the offline renderer's MATERIAL_LOOK table
 * (packages/evals/src/render-scene.mjs) and the plugin's Render.luau. A material the renderer knows
 * and this table does not would export as default plastic while previewing as stone, so
 * tests/meshgen.test.mjs reads the renderer's table and asserts this one covers it.
 */
export const MATERIAL_PBR: Readonly<Record<string, { roughness: number; metalness: number; emissive: number }>> = {
  Plastic: { roughness: 0.5, metalness: 0.0, emissive: 0 },
  SmoothPlastic: { roughness: 0.4, metalness: 0.0, emissive: 0 },
  Neon: { roughness: 1.0, metalness: 0.0, emissive: 1 },
  ForceField: { roughness: 0.9, metalness: 0.0, emissive: 0.6 },
  Glass: { roughness: 0.1, metalness: 0.0, emissive: 0 },
  Metal: { roughness: 0.25, metalness: 0.9, emissive: 0 },
  DiamondPlate: { roughness: 0.35, metalness: 0.85, emissive: 0 },
  Foil: { roughness: 0.15, metalness: 1.0, emissive: 0 },
  CorrodedMetal: { roughness: 0.75, metalness: 0.7, emissive: 0 },
  Concrete: { roughness: 0.92, metalness: 0.0, emissive: 0 },
  Slate: { roughness: 0.85, metalness: 0.0, emissive: 0 },
  Brick: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Cobblestone: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Rock: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Basalt: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Limestone: { roughness: 0.85, metalness: 0.0, emissive: 0 },
  Marble: { roughness: 0.3, metalness: 0.05, emissive: 0 },
  Granite: { roughness: 0.7, metalness: 0.02, emissive: 0 },
  Sand: { roughness: 0.95, metalness: 0.0, emissive: 0 },
  Grass: { roughness: 0.95, metalness: 0.0, emissive: 0 },
  LeafyGrass: { roughness: 0.95, metalness: 0.0, emissive: 0 },
  Ground: { roughness: 0.95, metalness: 0.0, emissive: 0 },
  Mud: { roughness: 0.95, metalness: 0.0, emissive: 0 },
  Snow: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Ice: { roughness: 0.2, metalness: 0.0, emissive: 0 },
  Water: { roughness: 0.15, metalness: 0.0, emissive: 0 },
  Wood: { roughness: 0.8, metalness: 0.0, emissive: 0 },
  WoodPlanks: { roughness: 0.8, metalness: 0.0, emissive: 0 },
  Fabric: { roughness: 1.0, metalness: 0.0, emissive: 0 },
  Glacier: { roughness: 0.55, metalness: 0.0, emissive: 0 },
  Asphalt: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Pebble: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Salt: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Sandstone: { roughness: 0.9, metalness: 0.0, emissive: 0 },
  Plaster: { roughness: 0.92, metalness: 0.0, emissive: 0 },
  CrackedLava: { roughness: 0.85, metalness: 0.0, emissive: 0.35 },
};

const MATERIAL_SET: ReadonlySet<string> = new Set(Object.keys(MATERIAL_PBR));

export const DEFAULT_MATERIAL = 'Plastic';

/** Roblox's minimum part dimension. Below it the engine clamps and the measurement is a fiction. */
export const MIN_PART_STUDS = QC_THRESHOLDS.minStud;
/** Roblox's maximum part dimension. A "size" above it cannot be built, so it cannot be accepted. */
export const MAX_PART_STUDS = 2048;

/** Hard numbers the pipeline enforces, all sourced from the QC table rather than invented here. */
export const MESH_LIMITS = {
  /** EditableMesh's documented ceiling. Past this the geometry cannot be realised in Studio. */
  hardTriangleCeiling: QC_THRESHOLDS.hardTriangleCeiling,
  /** Past this we are paying for detail Roblox will not show at normal viewing distance. */
  softTriangleWarn: QC_THRESHOLDS.softTriangleWarn,
  /** A "prop" with more parts than this is a scene that should have been built, not generated. */
  maxParts: 512,
  minStud: MIN_PART_STUDS,
} as const;

// ---------------------------------------------------------------------------------------------
// Part specs — the trust boundary
// ---------------------------------------------------------------------------------------------

export interface PartSpec {
  name?: string;
  kind: PrimitiveKind;
  /** Stud dimensions of the axis-aligned box the primitive is inscribed in. */
  size: [number, number, number];
  /** Centre of that box, in studs. */
  pos: [number, number, number];
  /** Euler XYZ in radians, applied X then Y then Z. */
  rot: [number, number, number];
  /** 0-255 per channel, as Roblox reports colour. */
  color: [number, number, number];
  material: string;
  transparency: number;
}

/** What a model sends before validation: every field is unknown until it is read. */
export type PartSpecInput = Record<string, unknown>;

export interface SpecProblem {
  /** The field that was refused, e.g. `size[1]` or `parts[3].kind`. */
  field: string;
  detail: string;
}

export interface SpecResult<T> {
  ok: boolean;
  spec: T | null;
  problems: SpecProblem[];
}

/** The only way a number enters this module. `??` would let NaN, "4" and Infinity through. */
function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readTriple(raw: unknown, field: string, problems: SpecProblem[]): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) {
    problems.push({ field, detail: `expected three numbers, got ${JSON.stringify(raw)}` });
    return null;
  }
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const v = raw[i];
    if (!finite(v)) {
      problems.push({ field: `${field}[${i}]`, detail: `${JSON.stringify(v)} is not a finite number` });
      return null;
    }
    out.push(v);
  }
  return [out[0]!, out[1]!, out[2]!];
}

/**
 * Validate one part.
 *
 * `prefix` lets an assembly report `parts[3].kind` rather than `kind`, so a refusal points at the
 * part that caused it instead of making the caller guess.
 */
export function validatePartSpec(raw: unknown, prefix = ''): SpecResult<PartSpec> {
  const problems: SpecProblem[] = [];
  const f = (name: string) => `${prefix}${name}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, spec: null, problems: [{ field: prefix.replace(/\.$/, '') || 'part', detail: 'not an object' }] };
  }
  const src = raw as PartSpecInput;

  const kind = src.kind;
  if (typeof kind !== 'string' || !PRIMITIVE_KIND_SET.has(kind)) {
    problems.push({ field: f('kind'), detail: `${JSON.stringify(kind)} is not one of ${PRIMITIVE_KINDS.join(', ')}` });
  }

  const size = readTriple(src.size, f('size'), problems);
  if (size) {
    for (let i = 0; i < 3; i++) {
      const s = size[i]!;
      if (s < MIN_PART_STUDS) problems.push({ field: f('size'), detail: `axis ${i} is ${s} studs, under the ${MIN_PART_STUDS} engine minimum` });
      else if (s > MAX_PART_STUDS) problems.push({ field: f('size'), detail: `axis ${i} is ${s} studs, over the ${MAX_PART_STUDS} part maximum` });
    }
    // A torus is the one primitive whose parameters can contradict each other: the ring radius is
    // (outer - tube), so a tube thicker than the ring turns the surface inside out. Refusing here
    // is cheaper than exporting a solid with negative volume.
    if (kind === 'torus') {
      if (Math.abs(size[0] - size[2]) > 1e-9) {
        problems.push({ field: f('size'), detail: `a torus must be circular in plan: x ${size[0]} and z ${size[2]} differ` });
      }
      if (size[1] >= size[0]) {
        problems.push({ field: f('size'), detail: `a torus tube of ${size[1]} studs leaves no ring inside an outer diameter of ${size[0]}` });
      }
    }
  }

  const pos = readTriple(src.pos, f('pos'), problems);
  let rot: [number, number, number] | null = [0, 0, 0];
  if (src.rot !== undefined) rot = readTriple(src.rot, f('rot'), problems);

  const colorRaw = src.color;
  let color: [number, number, number] | null = null;
  if (!Array.isArray(colorRaw) || colorRaw.length !== 3) {
    problems.push({ field: f('color'), detail: `expected three 0-255 channels, got ${JSON.stringify(colorRaw)}` });
  } else {
    const ch: number[] = [];
    for (let i = 0; i < 3; i++) {
      const v = colorRaw[i];
      if (!finite(v) || !Number.isInteger(v) || v < 0 || v > 255) {
        problems.push({ field: f('color'), detail: `channel ${i} is ${JSON.stringify(v)}, not a whole number in 0-255` });
        break;
      }
      ch.push(v);
    }
    if (ch.length === 3) color = [ch[0]!, ch[1]!, ch[2]!];
  }

  let material = DEFAULT_MATERIAL;
  if (src.material !== undefined) {
    if (typeof src.material !== 'string' || !MATERIAL_SET.has(src.material)) {
      problems.push({ field: f('material'), detail: `${JSON.stringify(src.material)} is not a Roblox material this pipeline can shade` });
    } else {
      material = src.material;
    }
  }

  let transparency = 0;
  if (src.transparency !== undefined) {
    if (!finite(src.transparency) || src.transparency < 0 || src.transparency > 1) {
      problems.push({ field: f('transparency'), detail: `${JSON.stringify(src.transparency)} is not a number in 0..1` });
    } else {
      transparency = src.transparency;
    }
  }

  let name: string | undefined;
  if (src.name !== undefined) {
    if (typeof src.name !== 'string') problems.push({ field: f('name'), detail: 'name must be a string' });
    else name = src.name;
  }

  if (problems.length || !size || !pos || !rot || !color) return { ok: false, spec: null, problems };
  return {
    ok: true,
    spec: { name, kind: kind as PrimitiveKind, size, pos, rot, color, material, transparency },
    problems: [],
  };
}

export interface AssemblySpec {
  id: string;
  name: string;
  /** The noun the model claims this is. Feeds the stud envelopes in assets.ts. */
  intent?: string;
  parts: PartSpec[];
  /** Present when this assembly came out of `variantOf`. */
  seed?: number;
}

export function validateAssemblySpec(raw: unknown): SpecResult<AssemblySpec> {
  const problems: SpecProblem[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, spec: null, problems: [{ field: 'assembly', detail: 'not an object' }] };
  }
  const src = raw as Record<string, unknown>;
  const id = typeof src.id === 'string' && src.id.length ? src.id : null;
  if (!id) problems.push({ field: 'id', detail: 'an assembly needs a non-empty id' });
  const name = typeof src.name === 'string' && src.name.length ? src.name : null;
  if (!name) problems.push({ field: 'name', detail: 'an assembly needs a non-empty name' });

  if (!Array.isArray(src.parts)) {
    problems.push({ field: 'parts', detail: `expected an array of parts, got ${typeof src.parts}` });
    return { ok: false, spec: null, problems };
  }
  if (src.parts.length === 0) problems.push({ field: 'parts', detail: 'an assembly with no parts is not a model' });
  if (src.parts.length > MESH_LIMITS.maxParts) {
    problems.push({ field: 'parts', detail: `${src.parts.length} parts is over the ${MESH_LIMITS.maxParts} ceiling for one asset` });
  }

  const parts: PartSpec[] = [];
  src.parts.forEach((p, i) => {
    const r = validatePartSpec(p, `parts[${i}].`);
    if (r.ok && r.spec) parts.push(r.spec);
    else problems.push(...r.problems);
  });

  let seed: number | undefined;
  if (src.seed !== undefined) {
    if (!Number.isSafeInteger(src.seed)) problems.push({ field: 'seed', detail: `${JSON.stringify(src.seed)} is not a whole number` });
    else seed = src.seed as number;
  }
  let intent: string | undefined;
  if (src.intent !== undefined) {
    if (typeof src.intent !== 'string') problems.push({ field: 'intent', detail: 'intent must be a string' });
    else intent = src.intent;
  }

  if (problems.length || !id || !name) return { ok: false, spec: null, problems };
  return { ok: true, spec: { id, name, intent, parts, seed }, problems: [] };
}

// ---------------------------------------------------------------------------------------------
// Tessellation
// ---------------------------------------------------------------------------------------------

export interface TriMesh {
  /** xyz triples in the space the mesh was built in. */
  positions: number[];
  /** Unit normals, one per position. */
  normals: number[];
  /** uv pairs, one per position, inside the 0..1 atlas. */
  uvs: number[];
  /** Triangle corner indices into `positions`. */
  indices: number[];
}

export const QUALITY_TIERS = ['low', 'standard', 'high'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

/**
 * Segment counts per tier.
 *
 * `radial` is divisible by four at every tier on purpose: it puts a vertex on each of +X, -X, +Z
 * and -Z, so a tessellated cylinder's bounding box is exactly the size that was asked for rather
 * than 0.98 of it. A silhouette that shrinks with quality would make every bounding-box check
 * tier-dependent, and the scale gates in assets.ts would then mean different things at different
 * tiers.
 */
export const TIER_SEGMENTS: Readonly<Record<QualityTier, { radial: number; rings: number; tubular: number }>> = {
  low: { radial: 8, rings: 4, tubular: 6 },
  standard: { radial: 16, rings: 8, tubular: 10 },
  high: { radial: 48, rings: 24, tubular: 24 },
};

/** The most triangles one part may cost at the low tier. Asserted, not aspirational. */
export const LOW_POLY_TRIANGLES_PER_PART = 128;

/**
 * Atlas padding, as a fraction of a cell.
 *
 * The box unwrap packs six faces into a 3x2 atlas. Without a margin the faces share their edge
 * texels, and a mip-mapped texture bleeds one face into the next — the classic seam. The margin
 * also makes "each face owns one cell" a statement that can be measured.
 */
const ATLAS_PADDING = 0.02;

const TIER_INDEX: Readonly<Record<QualityTier, number>> = { low: 0, standard: 1, high: 2 };

function isTier(v: unknown): v is QualityTier {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIER_INDEX, v);
}

class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  vertex(p: readonly [number, number, number], n: readonly [number, number, number], uv: readonly [number, number]): number {
    const i = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    this.normals.push(n[0] / len, n[1] / len, n[2] / len);
    this.uvs.push(uv[0], uv[1]);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  build(): TriMesh {
    return { positions: this.positions, normals: this.normals, uvs: this.uvs, indices: this.indices };
  }
}

/** Map a face-local 0..1 pair into cell (col,row) of the 3x2 box atlas, inset by the padding. */
function atlasUv(face: number, s: number, t: number): [number, number] {
  const col = face % 3;
  const row = Math.floor(face / 3);
  const u = (col + ATLAS_PADDING + s * (1 - 2 * ATLAS_PADDING)) / 3;
  const v = (row + ATLAS_PADDING + t * (1 - 2 * ATLAS_PADDING)) / 2;
  return [u, v];
}

/** Six faces as (normal, tangent, bitangent) with tangent x bitangent = normal, so winding is CCW. */
const BOX_FACES: readonly { n: 0 | 1 | 2; sign: 1 | -1; t: 0 | 1 | 2; b: 0 | 1 | 2 }[] = [
  { n: 0, sign: 1, t: 1, b: 2 }, // +X : Y x Z = X
  { n: 0, sign: -1, t: 2, b: 1 }, // -X : Z x Y = -X
  { n: 1, sign: 1, t: 2, b: 0 }, // +Y : Z x X = Y
  { n: 1, sign: -1, t: 0, b: 2 }, // -Y : X x Z = -Y
  { n: 2, sign: 1, t: 0, b: 1 }, // +Z : X x Y = Z
  { n: 2, sign: -1, t: 1, b: 0 }, // -Z : Y x X = -Z
];

function boxMesh(size: readonly [number, number, number]): TriMesh {
  const m = new MeshBuilder();
  const half = [size[0] / 2, size[1] / 2, size[2] / 2] as const;
  BOX_FACES.forEach((face, faceIndex) => {
    const n: [number, number, number] = [0, 0, 0];
    n[face.n] = face.sign;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const idx = corners.map(([cs, cb], k) => {
      const p: [number, number, number] = [0, 0, 0];
      p[face.n] = face.sign * half[face.n]!;
      p[face.t] += cs * half[face.t]!;
      p[face.b] += cb * half[face.b]!;
      const uv = atlasUv(faceIndex, (corners[k]![0] + 1) / 2, (corners[k]![1] + 1) / 2);
      return m.vertex(p, n, uv);
    });
    m.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
  });
  return m.build();
}

/**
 * A Roblox WedgePart: full height at -Z, sloping down to the floor at +Z.
 *
 * Written out by hand rather than derived, because the two triangular sides and the slope each
 * need their own normals, and a wedge built by collapsing a box's vertices gets a bent normal on
 * the slope that shades as a crease.
 */
function wedgeMesh(size: readonly [number, number, number]): TriMesh {
  const m = new MeshBuilder();
  const [x, y, z] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const A: [number, number, number] = [-x, -y, -z];
  const B: [number, number, number] = [x, -y, -z];
  const C: [number, number, number] = [x, -y, z];
  const D: [number, number, number] = [-x, -y, z];
  const E: [number, number, number] = [-x, y, -z];
  const F: [number, number, number] = [x, y, -z];

  // bottom (-Y)
  const b0 = m.vertex(A, [0, -1, 0], [0, 0]);
  const b1 = m.vertex(B, [0, -1, 0], [1, 0]);
  const b2 = m.vertex(C, [0, -1, 0], [1, 1]);
  const b3 = m.vertex(D, [0, -1, 0], [0, 1]);
  m.tri(b0, b1, b2);
  m.tri(b0, b2, b3);

  // back (-Z), the full-height face
  const k0 = m.vertex(A, [0, 0, -1], [0, 0]);
  const k1 = m.vertex(E, [0, 0, -1], [0, 1]);
  const k2 = m.vertex(F, [0, 0, -1], [1, 1]);
  const k3 = m.vertex(B, [0, 0, -1], [1, 0]);
  m.tri(k0, k1, k2);
  m.tri(k0, k2, k3);

  // slope, normal (0, 2z, 2y) normalised
  const sn: [number, number, number] = [0, size[2], size[1]];
  const s0 = m.vertex(E, sn, [0, 1]);
  const s1 = m.vertex(D, sn, [0, 0]);
  const s2 = m.vertex(C, sn, [1, 0]);
  const s3 = m.vertex(F, sn, [1, 1]);
  m.tri(s0, s1, s2);
  m.tri(s0, s2, s3);

  // -X side
  const l0 = m.vertex(A, [-1, 0, 0], [0, 0]);
  const l1 = m.vertex(D, [-1, 0, 0], [1, 0]);
  const l2 = m.vertex(E, [-1, 0, 0], [0, 1]);
  m.tri(l0, l1, l2);

  // +X side
  const r0 = m.vertex(B, [1, 0, 0], [0, 0]);
  const r1 = m.vertex(F, [1, 0, 0], [0, 1]);
  const r2 = m.vertex(C, [1, 0, 0], [1, 0]);
  m.tri(r0, r1, r2);

  return m.build();
}

function cylinderMesh(size: readonly [number, number, number], radial: number): TriMesh {
  const m = new MeshBuilder();
  const rx = size[0] / 2;
  const rz = size[2] / 2;
  const hy = size[1] / 2;
  // side: one extra column so the u seam can carry two texture coordinates for one position
  const top: number[] = [];
  const bot: number[] = [];
  for (let j = 0; j <= radial; j++) {
    const phi = (2 * Math.PI * j) / radial;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const n: [number, number, number] = [c / rx, 0, s / rz];
    const u = j / radial;
    top.push(m.vertex([rx * c, hy, rz * s], n, [u, 1]));
    bot.push(m.vertex([rx * c, -hy, rz * s], n, [u, 0]));
  }
  for (let j = 0; j < radial; j++) {
    m.tri(bot[j]!, top[j]!, top[j + 1]!);
    m.tri(bot[j]!, top[j + 1]!, bot[j + 1]!);
  }
  // caps, each a fan from a centre vertex; uv is a disc inside the atlas
  const capTopCentre = m.vertex([0, hy, 0], [0, 1, 0], [0.5, 0.5]);
  const capBotCentre = m.vertex([0, -hy, 0], [0, -1, 0], [0.5, 0.5]);
  const capTop: number[] = [];
  const capBot: number[] = [];
  for (let j = 0; j < radial; j++) {
    const phi = (2 * Math.PI * j) / radial;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const uv: [number, number] = [0.5 + 0.5 * c * 0.98, 0.5 + 0.5 * s * 0.98];
    capTop.push(m.vertex([rx * c, hy, rz * s], [0, 1, 0], uv));
    capBot.push(m.vertex([rx * c, -hy, rz * s], [0, -1, 0], uv));
  }
  for (let j = 0; j < radial; j++) {
    const k = (j + 1) % radial;
    m.tri(capTopCentre, capTop[k]!, capTop[j]!);
    m.tri(capBotCentre, capBot[j]!, capBot[k]!);
  }
  return m.build();
}

function coneMesh(size: readonly [number, number, number], radial: number): TriMesh {
  const m = new MeshBuilder();
  const rx = size[0] / 2;
  const rz = size[2] / 2;
  const hy = size[1] / 2;
  for (let j = 0; j < radial; j++) {
    const phi0 = (2 * Math.PI * j) / radial;
    const phi1 = (2 * Math.PI * (j + 1)) / radial;
    const mid = (phi0 + phi1) / 2;
    // side normal of a cone: radial component scaled by the slope
    const n: [number, number, number] = [(Math.cos(mid) * size[1]) / size[0], (rx + rz) / 2 / hy, (Math.sin(mid) * size[1]) / size[2]];
    const apex = m.vertex([0, hy, 0], n, [(j + 0.5) / radial, 1]);
    const p1 = m.vertex([rx * Math.cos(phi1), -hy, rz * Math.sin(phi1)], n, [(j + 1) / radial, 0]);
    const p0 = m.vertex([rx * Math.cos(phi0), -hy, rz * Math.sin(phi0)], n, [j / radial, 0]);
    m.tri(apex, p1, p0);
  }
  const centre = m.vertex([0, -hy, 0], [0, -1, 0], [0.5, 0.5]);
  const rim: number[] = [];
  for (let j = 0; j < radial; j++) {
    const phi = (2 * Math.PI * j) / radial;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    rim.push(m.vertex([rx * c, -hy, rz * s], [0, -1, 0], [0.5 + 0.5 * c * 0.98, 0.5 + 0.5 * s * 0.98]));
  }
  for (let j = 0; j < radial; j++) m.tri(centre, rim[j]!, rim[(j + 1) % radial]!);
  return m.build();
}

/**
 * A UV sphere (an ellipsoid, since the three radii are independent).
 *
 * The pole rows carry ONE vertex per segment rather than a full ring, because a pole ring's first
 * and last vertices belong to no triangle. An exporter that writes unreferenced vertices produces
 * a file whose vertex count disagrees with its geometry — harmless in a viewer, and a real
 * discrepancy in every count the product then shows the user. The per-segment pole vertex also
 * gives each pole triangle the u it should have, half way between its two neighbours.
 */
function sphereMesh(size: readonly [number, number, number], radial: number, rings: number): TriMesh {
  const m = new MeshBuilder();
  const rx = size[0] / 2;
  const ry = size[1] / 2;
  const rz = size[2] / 2;
  const at = (theta: number, phi: number, uv: readonly [number, number]): number => {
    const st = Math.sin(theta);
    const x = rx * st * Math.cos(phi);
    const y = ry * Math.cos(theta);
    const z = rz * st * Math.sin(phi);
    // an ellipsoid's normal is the gradient of its implicit form, not the position
    return m.vertex([x, y, z], [x / (rx * rx), y / (ry * ry), z / (rz * rz)], uv);
  };

  const north: number[] = [];
  const south: number[] = [];
  for (let j = 0; j < radial; j++) {
    north.push(at(0, (2 * Math.PI * (j + 0.5)) / radial, [(j + 0.5) / radial, 1]));
    south.push(at(Math.PI, (2 * Math.PI * (j + 0.5)) / radial, [(j + 0.5) / radial, 0]));
  }
  // interior latitude rows, seam column duplicated so u can reach 1
  const grid: number[][] = [];
  for (let i = 1; i < rings; i++) {
    const theta = (Math.PI * i) / rings;
    const row: number[] = [];
    for (let j = 0; j <= radial; j++) row.push(at(theta, (2 * Math.PI * j) / radial, [j / radial, 1 - i / rings]));
    grid.push(row);
  }

  const first = grid[0]!;
  const last = grid[grid.length - 1]!;
  for (let j = 0; j < radial; j++) {
    m.tri(north[j]!, first[j + 1]!, first[j]!);
    m.tri(south[j]!, last[j]!, last[j + 1]!);
  }
  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = grid[i]![j]!;
      const b = grid[i]![j + 1]!;
      const c = grid[i + 1]![j + 1]!;
      const d = grid[i + 1]![j]!;
      m.tri(a, b, d);
      m.tri(b, c, d);
    }
  }
  return m.build();
}

function torusMesh(size: readonly [number, number, number], radial: number, tubular: number): TriMesh {
  const m = new MeshBuilder();
  const tube = size[1] / 2;
  const ring = size[0] / 2 - tube;
  const grid: number[][] = [];
  for (let i = 0; i <= radial; i++) {
    const u = (2 * Math.PI * i) / radial;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const row: number[] = [];
    for (let j = 0; j <= tubular; j++) {
      const v = (2 * Math.PI * j) / tubular;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const p: [number, number, number] = [(ring + tube * cv) * cu, tube * sv, (ring + tube * cv) * su];
      row.push(m.vertex(p, [cv * cu, sv, cv * su], [i / radial, j / tubular]));
    }
    grid.push(row);
  }
  for (let i = 0; i < radial; i++) {
    for (let j = 0; j < tubular; j++) {
      const a = grid[i]![j]!;
      const b = grid[i]![j + 1]!;
      const c = grid[i + 1]![j + 1]!;
      const d = grid[i + 1]![j]!;
      m.tri(a, b, d);
      m.tri(b, c, d);
    }
  }
  return m.build();
}

/**
 * Turn one validated part spec into triangles, in the part's own local space.
 *
 * The primitive is INSCRIBED in `size`: a sphere of size [2,3,2] is an ellipsoid that touches all
 * six faces of that box and never leaves it. That is what makes `size` mean the same thing to the
 * renderer, to the bounding-box gate and to the collision proxy.
 */
export function tessellate(spec: PartSpec, tier: QualityTier = 'standard'): TriMesh {
  if (!isTier(tier)) throw new Error(`unknown quality tier ${JSON.stringify(tier)}`);
  const seg = TIER_SEGMENTS[tier];
  switch (spec.kind) {
    case 'box':
      return boxMesh(spec.size);
    case 'wedge':
      return wedgeMesh(spec.size);
    case 'cylinder':
      return cylinderMesh(spec.size, seg.radial);
    case 'cone':
      return coneMesh(spec.size, seg.radial);
    case 'sphere':
      return sphereMesh(spec.size, seg.radial, seg.rings);
    case 'torus':
      return torusMesh(spec.size, seg.radial, seg.tubular);
    default: {
      // Unreachable through validatePartSpec; here so a new kind cannot be added without a mesh.
      const never: never = spec.kind;
      throw new Error(`no tessellator for ${String(never)}`);
    }
  }
}

/** The volume of the ideal solid the tessellation approximates. Inscribed meshes stay under it. */
export function analyticVolume(spec: PartSpec): number {
  const [x, y, z] = spec.size;
  switch (spec.kind) {
    case 'box':
      return x * y * z;
    case 'wedge':
      return (x * y * z) / 2;
    case 'cylinder':
      return Math.PI * (x / 2) * (z / 2) * y;
    case 'cone':
      return (Math.PI * (x / 2) * (z / 2) * y) / 3;
    case 'sphere':
      return (4 / 3) * Math.PI * (x / 2) * (y / 2) * (z / 2);
    case 'torus': {
      const tube = y / 2;
      const ring = x / 2 - tube;
      return 2 * Math.PI * Math.PI * ring * tube * tube;
    }
    default:
      return 0;
  }
}

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

export function meshBounds(mesh: TriMesh): Box {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = mesh.positions[i + a]!;
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
  }
  return { min, max };
}

// ---------------------------------------------------------------------------------------------
// Topology — the questions a printer, a CSG operation and a physics engine all ask
// ---------------------------------------------------------------------------------------------

export interface MeshTopology {
  vertices: number;
  weldedVertices: number;
  triangles: number;
  /** Edges with one triangle: holes. A solid has none. */
  boundaryEdges: number;
  /** Edges with three or more triangles: a surface that branches. */
  nonManifoldEdges: number;
  /** Edges traversed the same way twice: a triangle wound against its neighbours. */
  windingConflicts: number;
  degenerateTriangles: number;
  /** Connected components of the welded surface. */
  shells: number;
  /** Positive when the surface encloses a volume with its normals pointing out. */
  signedVolume: number;
  watertight: boolean;
}

/**
 * Weld vertices that share a position, then read the surface's topology.
 *
 * WHY WELDING COMES FIRST. Every UV-mapped primitive duplicates its seam vertices — the cylinder's
 * u=0 column and u=1 column are the same ring of points with two texture coordinates. Read without
 * welding, every one of those seams looks like a hole, and "is this solid?" would answer "no" for
 * geometry that is perfectly closed. The weld uses a spatial hash that also checks the 26
 * neighbouring cells, because two points 1e-16 apart can still fall either side of a bin edge.
 */
export function topologyOfMesh(mesh: TriMesh): MeshTopology {
  const n = mesh.positions.length / 3;
  const b = meshBounds(mesh);
  const extent = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1);
  const eps = extent * 1e-7;
  const cell = eps * 2;

  const buckets = new Map<string, number[]>();
  const weld = new Int32Array(n).fill(-1);
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  let welded = 0;
  for (let i = 0; i < n; i++) {
    const x = mesh.positions[i * 3]!;
    const y = mesh.positions[i * 3 + 1]!;
    const z = mesh.positions[i * 3 + 2]!;
    let found = -1;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1 && found < 0; dx++) {
      for (let dy = -1; dy <= 1 && found < 0; dy++) {
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          const list = buckets.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const j of list) {
            if (
              Math.abs(mesh.positions[j * 3]! - x) <= eps &&
              Math.abs(mesh.positions[j * 3 + 1]! - y) <= eps &&
              Math.abs(mesh.positions[j * 3 + 2]! - z) <= eps
            ) {
              found = weld[j]!;
              break;
            }
          }
        }
      }
    }
    if (found < 0) found = welded++;
    weld[i] = found;
    const k = key(x, y, z);
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  }

  const parent = new Int32Array(welded);
  for (let i = 0; i < welded; i++) parent[i] = i;
  const find = (a: number): number => {
    let x = a;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b2: number) => {
    const ra = find(a);
    const rb = find(b2);
    if (ra !== rb) parent[rb] = ra;
  };

  const directed = new Map<number, number>();
  const undirected = new Map<number, number>();
  const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
  const edgeKey = (a: number, b2: number) => a * welded + b2;

  let degenerate = 0;
  let triangles = 0;
  let signedVolume = 0;
  const areaEps = extent * extent * 1e-12;
  const used = new Set<number>();

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ia = mesh.indices[t]!;
    const ib = mesh.indices[t + 1]!;
    const ic = mesh.indices[t + 2]!;
    triangles++;
    const p0: [number, number, number] = [mesh.positions[ia * 3]!, mesh.positions[ia * 3 + 1]!, mesh.positions[ia * 3 + 2]!];
    const p1: [number, number, number] = [mesh.positions[ib * 3]!, mesh.positions[ib * 3 + 1]!, mesh.positions[ib * 3 + 2]!];
    const p2: [number, number, number] = [mesh.positions[ic * 3]!, mesh.positions[ic * 3 + 1]!, mesh.positions[ic * 3 + 2]!];
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    const cxv = uy * vz - uz * vy;
    const cyv = uz * vx - ux * vz;
    const czv = ux * vy - uy * vx;
    const area = Math.hypot(cxv, cyv, czv) / 2;
    const a = weld[ia]!;
    const b2 = weld[ib]!;
    const c = weld[ic]!;
    if (area <= areaEps || a === b2 || b2 === c || a === c) {
      degenerate++;
      continue;
    }
    signedVolume += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
    used.add(a);
    used.add(b2);
    used.add(c);
    union(a, b2);
    union(b2, c);
    for (const [x, y] of [[a, b2], [b2, c], [c, a]] as const) {
      bump(directed, edgeKey(x, y));
      bump(undirected, edgeKey(Math.min(x, y), Math.max(x, y)));
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of undirected.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }
  let windingConflicts = 0;
  for (const count of directed.values()) if (count > 1) windingConflicts += count - 1;

  const roots = new Set<number>();
  for (const v of used) roots.add(find(v));

  return {
    vertices: n,
    weldedVertices: welded,
    triangles,
    boundaryEdges,
    nonManifoldEdges,
    windingConflicts,
    degenerateTriangles: degenerate,
    shells: roots.size,
    signedVolume,
    watertight: boundaryEdges === 0 && nonManifoldEdges === 0 && windingConflicts === 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------

export interface AssembledPart {
  spec: PartSpec;
  name: string;
  /** World-space triangles: rotation and translation are baked in, not carried alongside. */
  mesh: TriMesh;
  bounds: Box;
  triangles: number;
  /** Final world position of the part's centre, after any originAtBase shift. */
  pos: [number, number, number];
  rot: [number, number, number];
}

export interface Assembly {
  id: string;
  name: string;
  intent?: string;
  seed?: number;
  quality: QualityTier;
  parts: AssembledPart[];
  triangles: number;
  vertices: number;
  bounds: Box;
  /** Distinct Roblox material names used, sorted, for the panel and for the style gates. */
  materials: string[];
}

export interface AssembleOptions {
  quality?: QualityTier;
  /**
   * Move the model so its base sits on y=0 and its footprint is centred on the origin.
   *
   * This is not cosmetic: judgeAsset() in packages/evals/src/glb-inspect.mjs fails `origin_at_base`
   * and `origin_centred` without it, and a Roblox MeshPart whose origin is at its centre sinks
   * halfway into the floor the moment it is placed.
   */
  originAtBase?: boolean;
}

function eulerMatrix(rot: readonly [number, number, number]): number[] {
  const [rx, ry, rz] = rot;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // R = Rz * Ry * Rx, applied to a column vector: X first, then Y, then Z.
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

function applyMat(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z,
  ];
}

const IDENTITY_ROT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Build every part, place it, and report the totals the panel shows.
 *
 * The triangle ceiling is enforced HERE rather than at export, because a model that cannot be
 * realised in Studio should never reach the point where a user is looking at a download button.
 */
export function assemble(raw: unknown, opts: AssembleOptions = {}): { ok: boolean; assembly: Assembly | null; problems: SpecProblem[] } {
  const validated = validateAssemblySpec(raw);
  if (!validated.ok || !validated.spec) return { ok: false, assembly: null, problems: validated.problems };
  const spec = validated.spec;
  const quality: QualityTier = opts.quality ?? 'standard';
  if (!isTier(quality)) {
    return { ok: false, assembly: null, problems: [{ field: 'quality', detail: `${JSON.stringify(opts.quality)} is not a quality tier` }] };
  }

  const parts: AssembledPart[] = [];
  let triangles = 0;
  let vertices = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const materials = new Set<string>();

  spec.parts.forEach((p, i) => {
    const local = tessellate(p, quality);
    const rotated: TriMesh = { positions: new Array(local.positions.length), normals: new Array(local.normals.length), uvs: local.uvs, indices: local.indices };
    const m = p.rot[0] === 0 && p.rot[1] === 0 && p.rot[2] === 0 ? IDENTITY_ROT : eulerMatrix(p.rot);
    for (let v = 0; v < local.positions.length; v += 3) {
      const [x, y, z] = applyMat(m, local.positions[v]!, local.positions[v + 1]!, local.positions[v + 2]!);
      rotated.positions[v] = x + p.pos[0];
      rotated.positions[v + 1] = y + p.pos[1];
      rotated.positions[v + 2] = z + p.pos[2];
      const [nx, ny, nz] = applyMat(m, local.normals[v]!, local.normals[v + 1]!, local.normals[v + 2]!);
      rotated.normals[v] = nx;
      rotated.normals[v + 1] = ny;
      rotated.normals[v + 2] = nz;
    }
    const bounds = meshBounds(rotated);
    for (let a = 0; a < 3; a++) {
      if (bounds.min[a]! < min[a]!) min[a] = bounds.min[a]!;
      if (bounds.max[a]! > max[a]!) max[a] = bounds.max[a]!;
    }
    triangles += rotated.indices.length / 3;
    vertices += rotated.positions.length / 3;
    materials.add(p.material);
    parts.push({
      spec: p,
      name: p.name ?? `${p.kind}_${i + 1}`,
      mesh: rotated,
      bounds,
      triangles: rotated.indices.length / 3,
      pos: [...p.pos] as [number, number, number],
      rot: [...p.rot] as [number, number, number],
    });
  });

  if (triangles > MESH_LIMITS.hardTriangleCeiling) {
    return {
      ok: false,
      assembly: null,
      problems: [{
        field: 'triangles',
        detail: `${triangles} triangles at the '${quality}' tier is over the ${MESH_LIMITS.hardTriangleCeiling} EditableMesh ceiling — drop a tier or split the model`,
      }],
    };
  }

  if (opts.originAtBase) {
    const dx = -(min[0]! + max[0]!) / 2;
    const dy = -min[1]!;
    const dz = -(min[2]! + max[2]!) / 2;
    for (const part of parts) {
      for (let v = 0; v < part.mesh.positions.length; v += 3) {
        part.mesh.positions[v] = part.mesh.positions[v]! + dx;
        part.mesh.positions[v + 1] = part.mesh.positions[v + 1]! + dy;
        part.mesh.positions[v + 2] = part.mesh.positions[v + 2]! + dz;
      }
      part.bounds = meshBounds(part.mesh);
      part.pos = [part.pos[0] + dx, part.pos[1] + dy, part.pos[2] + dz];
    }
    min[0] += dx; max[0] += dx;
    min[1] += dy; max[1] += dy;
    min[2] += dz; max[2] += dz;
  }

  return {
    ok: true,
    assembly: {
      id: spec.id,
      name: spec.name,
      intent: spec.intent,
      seed: spec.seed,
      quality,
      parts,
      triangles,
      vertices,
      bounds: { min, max },
      materials: [...materials].sort(),
    },
    problems: [],
  };
}

/** Every part's triangles in one buffer — what the exporters and the print checks read. */
export function mergedMesh(assembly: Assembly): TriMesh {
  const out: TriMesh = { positions: [], normals: [], uvs: [], indices: [] };
  for (const part of assembly.parts) {
    const offset = out.positions.length / 3;
    out.positions.push(...part.mesh.positions);
    out.normals.push(...part.mesh.normals);
    out.uvs.push(...part.mesh.uvs);
    for (const i of part.mesh.indices) out.indices.push(i + offset);
  }
  return out;
}

/** Triangles one part would cost at a tier, without building it. */
export function trianglesFor(spec: PartSpec, tier: QualityTier): number {
  const seg = TIER_SEGMENTS[tier];
  switch (spec.kind) {
    case 'box':
      return 12;
    case 'wedge':
      return 8;
    case 'cylinder':
      return seg.radial * 4;
    case 'cone':
      return seg.radial * 2;
    case 'sphere':
      return seg.radial * (2 * seg.rings - 2);
    case 'torus':
      return seg.radial * seg.tubular * 2;
    default:
      return 0;
  }
}

export interface QualityPlan {
  ok: boolean;
  tier: QualityTier;
  triangles: number;
  budget: number;
  detail: string;
}

/**
 * Pick the richest tier that fits a triangle budget.
 *
 * The budget is the thing a caller actually has — a scene budget divided among its props — and the
 * tier is the thing the tessellator needs. A budget that is not a number is refused rather than
 * defaulted, because `budget ?? Infinity` turns a broken caller into an unbounded mesh.
 */
export function planQuality(rawParts: unknown, budget: unknown): QualityPlan {
  const cheapest = QUALITY_TIERS[0];
  if (!finite(budget) || budget <= 0) {
    return { ok: false, tier: cheapest, triangles: 0, budget: 0, detail: `budget ${JSON.stringify(budget)} is not a positive number of triangles` };
  }
  const parts: PartSpec[] = [];
  if (!Array.isArray(rawParts)) {
    return { ok: false, tier: cheapest, triangles: 0, budget, detail: 'parts must be an array' };
  }
  for (let i = 0; i < rawParts.length; i++) {
    const r = validatePartSpec(rawParts[i], `parts[${i}].`);
    if (!r.ok || !r.spec) return { ok: false, tier: cheapest, triangles: 0, budget, detail: r.problems.map((p) => `${p.field}: ${p.detail}`).join('; ') };
    parts.push(r.spec);
  }
  const cost = (tier: QualityTier) => parts.reduce((n, p) => n + trianglesFor(p, tier), 0);
  for (let i = QUALITY_TIERS.length - 1; i >= 0; i--) {
    const tier = QUALITY_TIERS[i]!;
    const triangles = cost(tier);
    if (triangles <= budget) return { ok: true, tier, triangles, budget, detail: `'${tier}' fits ${triangles} of ${budget} triangles` };
  }
  const triangles = cost(cheapest);
  return { ok: false, tier: cheapest, triangles, budget, detail: `even the '${cheapest}' tier costs ${triangles} triangles, over the ${budget} budget` };
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

export type CleanupReason = 'duplicate' | 'enclosed' | 'invisible';

export interface RemovedPart {
  index: number;
  name: string;
  reason: CleanupReason;
  detail: string;
}

export interface CleanupResult {
  spec: AssemblySpec;
  removed: RemovedPart[];
  trianglesSaved: number;
}

/** Below this a part is opaque enough that nothing behind it can be seen. */
const OPAQUE_ENOUGH = 0.02;

/** World AABB of a part from its spec alone: the primitive is inscribed, so the box is exact. */
function specAabb(p: PartSpec): Box {
  const h: [number, number, number] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
  if (p.rot[0] === 0 && p.rot[1] === 0 && p.rot[2] === 0) {
    return {
      min: [p.pos[0] - h[0], p.pos[1] - h[1], p.pos[2] - h[2]],
      max: [p.pos[0] + h[0], p.pos[1] + h[1], p.pos[2] + h[2]],
    };
  }
  const m = eulerMatrix(p.rot);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const v = applyMat(m, sx * h[0], sy * h[1], sz * h[2]);
        for (let a = 0; a < 3; a++) {
          const w = v[a]! + p.pos[a]!;
          if (w < min[a]!) min[a] = w;
          if (w > max[a]!) max[a] = w;
        }
      }
    }
  }
  return { min, max };
}

const boxVolume = (b: Box) => (b.max[0]! - b.min[0]!) * (b.max[1]! - b.min[1]!) * (b.max[2]! - b.min[2]!);

/**
 * Drop geometry that cannot be seen.
 *
 * A model writing part specs produces three kinds of waste, and all three survive every check the
 * pipeline otherwise runs: a part emitted twice at the same place (which z-fights, so it is a
 * rendering bug and not a style choice), a part buried inside an opaque one, and a part left fully
 * transparent. Each of them costs triangles in the export, a row in the ledger, and — in the case
 * of the transparent one — inflates the bounding box that the scale gates in assets.ts measure, so
 * a 2-stud crate inside a 20-stud invisible bubble fails as "too big for a crate".
 *
 * THE RULES ARE DELIBERATELY TIMID, BECAUSE DELETING VISIBLE GEOMETRY IS UNRECOVERABLE.
 * Only an axis-aligned opaque BOX may hide anything: a sphere does not fill its bounding box, and
 * neither does a rotated box, so "inside its AABB" does not mean "inside the solid" for either.
 * A part inside a transparent container is kept — that is a display case, not waste. The tests
 * feed all four of those near-misses in and assert that nothing is removed, because a cleanup pass
 * that is only ever shown rubbish has not been shown to keep anything.
 *
 * REMOVING INVISIBLE PARTS IS SAFE HERE SPECIFICALLY BECAUSE COLLISION IS GENERATED SEPARATELY.
 * In a Roblox place a fully transparent part is often a hitbox; in an exported MESH it is nothing
 * at all. `collisionProxy` builds the hull from the visible parts, so the hitbox is not being
 * thrown away — it is being computed rather than authored.
 */
export function cleanAssemblySpec(raw: unknown, opts: { quality?: QualityTier } = {}): CleanupResult {
  const validated = validateAssemblySpec(raw);
  if (!validated.ok || !validated.spec) {
    throw new Error(`cannot clean an invalid assembly: ${validated.problems.map((p) => `${p.field} ${p.detail}`).join('; ')}`);
  }
  const spec = validated.spec;
  const quality: QualityTier = isTier(opts.quality) ? opts.quality : 'standard';
  const parts = spec.parts;
  const boxes = parts.map(specAabb);
  const removed: RemovedPart[] = [];
  const dead: (CleanupReason | null)[] = parts.map(() => null);
  const nameOf = (p: PartSpec, i: number) => p.name ?? `${p.kind}_${i + 1}`;

  const seen = new Map<string, number>();
  parts.forEach((p, i) => {
    const key = [p.kind, ...p.size, ...p.pos, ...p.rot].map((v) => (typeof v === 'number' ? v.toFixed(6) : v)).join('|');
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else dead[i] = 'duplicate';
  });

  parts.forEach((p, i) => {
    if (!dead[i] && p.transparency >= 1) dead[i] = 'invisible';
  });

  parts.forEach((p, i) => {
    if (dead[i]) return;
    const inner = boxes[i]!;
    const innerVolume = boxVolume(inner);
    for (let j = 0; j < parts.length; j++) {
      if (j === i || dead[j]) continue;
      const outer = parts[j]!;
      if (outer.kind !== 'box') continue;
      if (outer.rot[0] !== 0 || outer.rot[1] !== 0 || outer.rot[2] !== 0) continue;
      if (outer.transparency > OPAQUE_ENOUGH) continue;
      const ob = boxes[j]!;
      if (boxVolume(ob) <= innerVolume + 1e-9) continue;
      let inside = true;
      for (let a = 0; a < 3 && inside; a++) {
        if (inner.min[a]! < ob.min[a]! - 1e-9 || inner.max[a]! > ob.max[a]! + 1e-9) inside = false;
      }
      if (inside) {
        dead[i] = 'enclosed';
        break;
      }
    }
  });

  // An assembly with no parts is not a model. If every part is waste, the largest one stays.
  // `dead.every(d => d !== null)` would narrow the array itself, so the reinstatement below
  // stops typechecking. Ask the negative question instead.
  if (!dead.some((d) => d === null)) {
    let keep = 0;
    for (let i = 1; i < parts.length; i++) if (boxVolume(boxes[i]!) > boxVolume(boxes[keep]!)) keep = i;
    dead[keep] = null;
  }

  const kept: PartSpec[] = [];
  let trianglesSaved = 0;
  parts.forEach((p, i) => {
    const reason = dead[i];
    if (!reason) {
      kept.push(p);
      return;
    }
    trianglesSaved += trianglesFor(p, quality);
    const detail =
      reason === 'duplicate'
        ? 'a second copy of a part already placed at the same position, size and rotation — coincident faces z-fight'
        : reason === 'invisible'
          ? 'fully transparent, so it contributes nothing to the exported mesh'
          : 'entirely inside an opaque axis-aligned box, so no camera can see it';
    removed.push({ index: i, name: nameOf(p, i), reason, detail });
  });

  return { spec: { ...spec, parts: kept }, removed, trianglesSaved };
}

// ---------------------------------------------------------------------------------------------
// LOD
// ---------------------------------------------------------------------------------------------

export interface LodLevel {
  level: number;
  quality: QualityTier;
  assembly: Assembly;
  triangles: number;
  bounds: Box;
  /** Distance from the camera at which this level takes over, in studs. */
  minViewDistanceStuds: number;
}

/**
 * Camera assumptions behind the switch distances. Roblox's default field of view is 70 degrees,
 * and the fractions are the share of the viewport height the model still covers at that distance.
 * A level is worth switching to when the detail it drops is smaller than a pixel anyway.
 */
export const LOD_SCREEN_FRACTIONS = [1, 0.25, 0.08];
export const LOD_FOV_DEGREES = 70;

export function generateLods(raw: unknown, opts: { levels?: number; originAtBase?: boolean } = {}): { ok: boolean; levels: LodLevel[]; problems: SpecProblem[] } {
  const levels = opts.levels ?? 3;
  if (!Number.isInteger(levels) || levels < 2 || levels > QUALITY_TIERS.length) {
    return { ok: false, levels: [], problems: [{ field: 'levels', detail: `${JSON.stringify(opts.levels)} is not a whole number of levels between 2 and ${QUALITY_TIERS.length}` }] };
  }
  // richest first, and always ending at the cheapest tier available
  const tiers: QualityTier[] = levels === QUALITY_TIERS.length
    ? [...QUALITY_TIERS].reverse()
    : ['high', 'low'];
  const out: LodLevel[] = [];
  const tanHalf = Math.tan((LOD_FOV_DEGREES * Math.PI) / 360);
  for (let i = 0; i < tiers.length; i++) {
    const built = assemble(raw, { quality: tiers[i]!, originAtBase: opts.originAtBase });
    if (!built.ok || !built.assembly) return { ok: false, levels: [], problems: built.problems };
    const height = built.assembly.bounds.max[1]! - built.assembly.bounds.min[1]!;
    const fraction = LOD_SCREEN_FRACTIONS[Math.min(i, LOD_SCREEN_FRACTIONS.length - 1)]!;
    out.push({
      level: i,
      quality: tiers[i]!,
      assembly: built.assembly,
      triangles: built.assembly.triangles,
      bounds: built.assembly.bounds,
      minViewDistanceStuds: i === 0 ? 0 : height / (2 * tanHalf * fraction),
    });
  }
  return { ok: true, levels: out, problems: [] };
}

// ---------------------------------------------------------------------------------------------
// Seeded variation
// ---------------------------------------------------------------------------------------------

/**
 * mulberry32. Small, fast, and — the property that matters — a pure function of an integer seed,
 * so a variant is reproducible from the seed alone and a checkpoint can store four bytes instead
 * of a mesh.
 *
 * A non-integer seed is REFUSED rather than coerced. `Math.imul(NaN, x)` is 0, so a NaN seed would
 * silently produce one fixed stream and every "random" variant in the product would be the same
 * model. That is the failure shape this repository keeps finding: the generator would still run,
 * still return, and have varied nothing.
 */
export function seededRandom(seed: number): () => number {
  if (!Number.isSafeInteger(seed)) throw new Error(`seed must be a whole number, got ${JSON.stringify(seed)}`);
  let a = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VariantOptions {
  /** Fractional size change, per axis. 0.12 means each dimension moves by up to 12%. */
  sizeJitter?: number;
  /** Hue rotation, as a fraction of the colour wheel. */
  hueJitter?: number;
  /** Positional wander, as a fraction of the part's own size. */
  posJitter?: number;
}

export const DEFAULT_VARIANT_OPTIONS: Required<VariantOptions> = { sizeJitter: 0.12, hueJitter: 0.15, posJitter: 0 };

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let rgb: [number, number, number];
  switch (i % 6) {
    case 0: rgb = [v, t, p]; break;
    case 1: rgb = [q, v, p]; break;
    case 2: rgb = [p, v, t]; break;
    case 3: rgb = [p, q, v]; break;
    case 4: rgb = [t, p, v]; break;
    default: rgb = [v, p, q];
  }
  return [
    Math.min(255, Math.max(0, Math.round(rgb[0] * 255))),
    Math.min(255, Math.max(0, Math.round(rgb[1] * 255))),
    Math.min(255, Math.max(0, Math.round(rgb[2] * 255))),
  ];
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * One reproducible variation of an assembly.
 *
 * The jitter is CLAMPED back into the legal range rather than applied blindly: a 95% shrink on a
 * 0.22-stud band would otherwise produce a part under the engine minimum, and the variant would
 * validate as a model nobody can build. Every variant this returns passes validateAssemblySpec —
 * which is asserted, with jitter turned up past anything the product would use.
 */
export function variantOf(raw: unknown, seed: number, opts: VariantOptions = {}): AssemblySpec {
  if (!Number.isSafeInteger(seed)) throw new Error(`seed must be a whole number, got ${JSON.stringify(seed)}`);
  const validated = validateAssemblySpec(raw);
  if (!validated.ok || !validated.spec) {
    throw new Error(`cannot vary an invalid assembly: ${validated.problems.map((p) => `${p.field} ${p.detail}`).join('; ')}`);
  }
  const base = validated.spec;
  const o = { ...DEFAULT_VARIANT_OPTIONS, ...opts };
  for (const [k, v] of Object.entries(o)) {
    if (!finite(v) || v < 0 || v > 1) throw new Error(`variant option ${k} must be a number in 0..1, got ${JSON.stringify(v)}`);
  }
  const rng = seededRandom(seed);
  const clampStud = (v: number) => Math.min(MAX_PART_STUDS, Math.max(MIN_PART_STUDS, round4(v)));

  const parts: PartSpec[] = base.parts.map((p) => {
    const jitter = () => 1 + (rng() * 2 - 1) * o.sizeJitter;
    let size: [number, number, number];
    if (p.kind === 'torus') {
      // x and z must stay equal and the tube must stay inside the ring, so one factor drives both
      const f = jitter();
      const outer = clampStud(p.size[0] * f);
      const tube = Math.min(clampStud(p.size[1] * jitter()), round4(outer * 0.9));
      size = [outer, Math.max(MIN_PART_STUDS, tube), outer];
    } else {
      size = [clampStud(p.size[0] * jitter()), clampStud(p.size[1] * jitter()), clampStud(p.size[2] * jitter())];
    }
    const pos: [number, number, number] = [
      round4(p.pos[0] + (rng() * 2 - 1) * o.posJitter * size[0]),
      round4(p.pos[1] + (rng() * 2 - 1) * o.posJitter * size[1]),
      round4(p.pos[2] + (rng() * 2 - 1) * o.posJitter * size[2]),
    ];
    const [h, s, v] = rgbToHsv(p.color[0], p.color[1], p.color[2]);
    const shifted = (h + (rng() * 2 - 1) * o.hueJitter + 1) % 1;
    const color = hsvToRgb(shifted, s, v);
    return { ...p, size, pos, color };
  });

  return { ...base, parts, seed };
}

/** A family of variants, each reproducible from its own seed. */
export function variantsOf(raw: unknown, count: number, opts: VariantOptions = {}): AssemblySpec[] {
  if (!Number.isInteger(count) || count < 1 || count > 256) throw new Error(`variant count must be a whole number in 1..256, got ${JSON.stringify(count)}`);
  const validated = validateAssemblySpec(raw);
  if (!validated.ok || !validated.spec) {
    throw new Error(`cannot vary an invalid assembly: ${validated.problems.map((p) => `${p.field} ${p.detail}`).join('; ')}`);
  }
  const first = validated.spec.seed ?? 1;
  const out: AssemblySpec[] = [];
  for (let i = 0; i < count; i++) out.push(variantOf(validated.spec, first + i, opts));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------------------------

export const COLLISION_FIDELITIES = ['box', 'clustered', 'per_part'] as const;
export type CollisionFidelity = (typeof COLLISION_FIDELITIES)[number];
const COLLISION_FIDELITY_SET: ReadonlySet<string> = new Set<string>(COLLISION_FIDELITIES);

export interface CollisionBox {
  size: [number, number, number];
  pos: [number, number, number];
  rot: [number, number, number];
}

export interface CollisionProxy {
  fidelity: CollisionFidelity;
  boxes: CollisionBox[];
  /** What the physics engine pays: a box is twelve triangles whatever it wraps. */
  triangles: number;
}

/**
 * Collision geometry as a set of boxes, at three fidelities.
 *
 * The middle tier exists because the two obvious answers are both wrong for a prop: one box around
 * everything lets a player stand on air between a turret's legs, and one box per part is a
 * physics bill nobody asked for. `clustered` groups the parts that read as one mass — the same
 * question composition.ts already answers for structure metrics, so it is answered by the same
 * function rather than by a second implementation that drifts.
 */
export function collisionProxy(assembly: Assembly, fidelity: CollisionFidelity = 'per_part'): CollisionProxy {
  if (!COLLISION_FIDELITY_SET.has(fidelity)) throw new Error(`unknown collision fidelity ${JSON.stringify(fidelity)}`);
  const boxes: CollisionBox[] = [];
  if (fidelity === 'box') {
    const b = assembly.bounds;
    boxes.push({
      size: [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!],
      pos: [(b.min[0]! + b.max[0]!) / 2, (b.min[1]! + b.max[1]!) / 2, (b.min[2]! + b.max[2]!) / 2],
      rot: [0, 0, 0],
    });
  } else if (fidelity === 'per_part') {
    for (const p of assembly.parts) boxes.push({ size: [...p.spec.size] as [number, number, number], pos: [...p.pos] as [number, number, number], rot: [...p.rot] as [number, number, number] });
  } else {
    const scene: ScenePart[] = assembly.parts.map((p) => ({
      size: [p.bounds.max[0]! - p.bounds.min[0]!, p.bounds.max[1]! - p.bounds.min[1]!, p.bounds.max[2]! - p.bounds.min[2]!],
      pos: [(p.bounds.min[0]! + p.bounds.max[0]!) / 2, (p.bounds.min[1]! + p.bounds.max[1]!) / 2, (p.bounds.min[2]! + p.bounds.max[2]!) / 2],
    }));
    for (const group of clusterMasses(scene, 0.25)) {
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const i of group) {
        const b = assembly.parts[i]!.bounds;
        for (let a = 0; a < 3; a++) {
          if (b.min[a]! < min[a]!) min[a] = b.min[a]!;
          if (b.max[a]! > max[a]!) max[a] = b.max[a]!;
        }
      }
      boxes.push({
        size: [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!],
        pos: [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2],
        rot: [0, 0, 0],
      });
    }
  }
  return { fidelity, boxes, triangles: boxes.length * 12 };
}

export interface ContainmentReport {
  contained: boolean;
  /** Vertices of the visual mesh that no collision box encloses. */
  escaped: number;
  worstOverrunStuds: number;
}

/**
 * Does the collision hull actually contain the thing it is standing in for?
 *
 * A proxy that misses geometry is worse than no proxy: the part is visibly there and the player
 * walks through it. This is the property worth asserting, and it is asserted by running the real
 * vertices through the real boxes rather than by trusting the construction.
 */
export function proxyContainsMesh(proxy: CollisionProxy, assembly: Assembly): ContainmentReport {
  const extent = Math.max(
    assembly.bounds.max[0]! - assembly.bounds.min[0]!,
    assembly.bounds.max[1]! - assembly.bounds.min[1]!,
    assembly.bounds.max[2]! - assembly.bounds.min[2]!,
    1,
  );
  const eps = extent * 1e-6;
  const frames = proxy.boxes.map((b) => ({ box: b, m: eulerMatrix(b.rot) }));
  let escaped = 0;
  let worst = 0;
  for (const part of assembly.parts) {
    const pos = part.mesh.positions;
    for (let i = 0; i < pos.length; i += 3) {
      let inside = false;
      let best = Infinity;
      for (const { box, m } of frames) {
        const dx = pos[i]! - box.pos[0];
        const dy = pos[i + 1]! - box.pos[1];
        const dz = pos[i + 2]! - box.pos[2];
        // transpose of a rotation is its inverse: world -> box-local
        const lx = m[0]! * dx + m[3]! * dy + m[6]! * dz;
        const ly = m[1]! * dx + m[4]! * dy + m[7]! * dz;
        const lz = m[2]! * dx + m[5]! * dy + m[8]! * dz;
        const over = Math.max(
          Math.abs(lx) - box.size[0] / 2,
          Math.abs(ly) - box.size[1] / 2,
          Math.abs(lz) - box.size[2] / 2,
        );
        if (over < best) best = over;
        if (over <= eps) {
          inside = true;
          break;
        }
      }
      if (!inside) {
        escaped++;
        if (best > worst) worst = best;
      }
    }
  }
  return { contained: escaped === 0, escaped, worstOverrunStuds: worst };
}

// ---------------------------------------------------------------------------------------------
// Bounding box against intent
// ---------------------------------------------------------------------------------------------

export interface PivotCheck {
  ok: boolean;
  baseOffsetStuds: number;
  lateralOffsetStuds: number;
  reasons: string[];
}

export interface AssemblyBoundsCheck {
  ok: boolean;
  size: [number, number, number];
  scale: ScaleCheck;
  pivot: PivotCheck;
  reasons: string[];
}

/**
 * Is this model a plausible size for the noun it claims to be, and is its origin where a placer
 * expects it?
 *
 * The envelopes and the tolerances both come from assets.ts, which already mirrors them into the
 * plugin. Restating "a crate is under 8 studs tall" here would create a second truth.
 */
export function checkAssemblyBounds(assembly: Assembly, intent?: string): AssemblyBoundsCheck {
  const b = assembly.bounds;
  const size: [number, number, number] = [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!];
  const scale = checkScale(intent ?? assembly.intent, size);

  const baseOffset = Math.abs(b.min[1]!);
  const lateral = Math.max(Math.abs((b.min[0]! + b.max[0]!) / 2), Math.abs((b.min[2]! + b.max[2]!) / 2));
  const baseTol = pivotToleranceStuds(size[1]);
  const lateralTol = lateralPivotToleranceStuds(size[0], size[2]);
  const pivotReasons: string[] = [];
  if (baseOffset > baseTol) pivotReasons.push(`the pivot sits ${baseOffset.toFixed(2)} studs off the base of the model (tolerance ${baseTol.toFixed(2)}) — it will float or sink when placed`);
  if (lateral > lateralTol) pivotReasons.push(`the pivot is ${lateral.toFixed(2)} studs off the horizontal centre (tolerance ${lateralTol.toFixed(2)}) — it will swing when rotated`);
  const pivot: PivotCheck = { ok: pivotReasons.length === 0, baseOffsetStuds: baseOffset, lateralOffsetStuds: lateral, reasons: pivotReasons };

  return { ok: scale.ok && pivot.ok, size, scale, pivot, reasons: [...scale.reasons, ...pivotReasons] };
}

// ---------------------------------------------------------------------------------------------
// Printability
// ---------------------------------------------------------------------------------------------

export interface PrintIssue {
  code: 'not_watertight' | 'non_manifold' | 'inconsistent_winding' | 'degenerate_triangles' | 'thin_feature' | 'unsupported' | 'no_bed_contact' | 'over_bed' | 'inverted';
  severity: 'error' | 'warning';
  detail: string;
}

export interface PrintOptions {
  /** How big the model is printed. A stud is not a millimetre, and the rules are in millimetres. */
  millimetresPerStud: number;
  /** Two passes of a 0.4 mm nozzle. Below this a wall does not exist in the slicer's output. */
  minFeatureMm?: number;
  /** Bed size of a common consumer printer, per axis. */
  maxBedMm?: number;
}

export const PRINT_DEFAULTS = { minFeatureMm: 0.8, maxBedMm: 256 } as const;

export interface PrintMeshReport {
  watertight: boolean;
  topology: MeshTopology;
  volumeMm3: number;
  issues: PrintIssue[];
  printable: boolean;
}

function readPrintOptions(opts: PrintOptions): { mm: number; minFeatureMm: number; maxBedMm: number } {
  if (!finite(opts?.millimetresPerStud) || opts.millimetresPerStud <= 0) {
    throw new Error(`millimetresPerStud must be a positive finite number, got ${JSON.stringify(opts?.millimetresPerStud)}`);
  }
  const minFeatureMm = opts.minFeatureMm ?? PRINT_DEFAULTS.minFeatureMm;
  const maxBedMm = opts.maxBedMm ?? PRINT_DEFAULTS.maxBedMm;
  if (!finite(minFeatureMm) || minFeatureMm <= 0) throw new Error(`minFeatureMm must be a positive finite number, got ${JSON.stringify(minFeatureMm)}`);
  if (!finite(maxBedMm) || maxBedMm <= 0) throw new Error(`maxBedMm must be a positive finite number, got ${JSON.stringify(maxBedMm)}`);
  return { mm: opts.millimetresPerStud, minFeatureMm, maxBedMm };
}

/** Surface-level printability: is this triangle soup a solid at all? */
export function printabilityOfMesh(mesh: TriMesh, opts: PrintOptions): PrintMeshReport {
  const { mm } = readPrintOptions(opts);
  const topology = topologyOfMesh(mesh);
  const issues: PrintIssue[] = [];
  if (topology.boundaryEdges > 0) {
    issues.push({ code: 'not_watertight', severity: 'error', detail: `${topology.boundaryEdges} open edges — a slicer cannot tell inside from outside` });
  }
  if (topology.nonManifoldEdges > 0) {
    issues.push({ code: 'non_manifold', severity: 'error', detail: `${topology.nonManifoldEdges} edges shared by more than two faces` });
  }
  if (topology.windingConflicts > 0) {
    issues.push({ code: 'inconsistent_winding', severity: 'error', detail: `${topology.windingConflicts} faces wound against their neighbours` });
  }
  if (topology.degenerateTriangles > 0) {
    issues.push({ code: 'degenerate_triangles', severity: 'warning', detail: `${topology.degenerateTriangles} zero-area triangles` });
  }
  if (topology.signedVolume <= 0 && topology.boundaryEdges === 0) {
    issues.push({ code: 'inverted', severity: 'error', detail: 'the surface encloses a negative volume — its normals point inwards' });
  }
  return {
    watertight: topology.watertight,
    topology,
    volumeMm3: Math.max(0, topology.signedVolume) * mm * mm * mm,
    issues,
    printable: issues.every((i) => i.severity !== 'error'),
  };
}

export interface PrintReport extends PrintMeshReport {
  millimetresPerStud: number;
  sizeMm: [number, number, number];
  /** Parts with nothing under them. Printable with supports; a surprise without them. */
  unsupportedParts: string[];
}

/**
 * Full printability: the surface, the wall thickness, the bed, and what is holding each part up.
 *
 * WHY SUPPORT IS CHECKED PER PART AND NOT PER TRIANGLE. A real overhang analysis is a per-facet
 * angle test, and for an assembly of primitives it reports the underside of every sphere, which is
 * true and useless. The question a person actually has is "will a piece of this drop onto the bed
 * while it prints", and that is answered by asking whether anything is underneath each part.
 */
export function printabilityReport(assembly: Assembly, opts: PrintOptions): PrintReport {
  const { mm, minFeatureMm, maxBedMm } = readPrintOptions(opts);
  const merged = mergedMesh(assembly);
  const base = printabilityOfMesh(merged, opts);
  const issues = [...base.issues];

  const b = assembly.bounds;
  const sizeMm: [number, number, number] = [(b.max[0]! - b.min[0]!) * mm, (b.max[1]! - b.min[1]!) * mm, (b.max[2]! - b.min[2]!) * mm];
  for (let a = 0; a < 3; a++) {
    if (sizeMm[a]! > maxBedMm) {
      issues.push({ code: 'over_bed', severity: 'warning', detail: `axis ${a} is ${sizeMm[a]!.toFixed(1)} mm, over the ${maxBedMm} mm bed — it has to be cut or scaled` });
      break;
    }
  }

  for (const part of assembly.parts) {
    const thinnest = Math.min(part.spec.size[0], part.spec.size[1], part.spec.size[2]) * mm;
    if (thinnest < minFeatureMm) {
      issues.push({
        code: 'thin_feature',
        severity: 'error',
        detail: `'${part.name}' is ${thinnest.toFixed(2)} mm at its thinnest, under the ${minFeatureMm} mm minimum feature — it will not print`,
      });
    }
  }

  const tol = MIN_PART_STUDS;
  const bedY = b.min[1]!;
  if (bedY > tol) {
    issues.push({ code: 'no_bed_contact', severity: 'error', detail: `the lowest point of the model is ${bedY.toFixed(2)} studs above the bed` });
  }
  const unsupported: string[] = [];
  for (const part of assembly.parts) {
    const bottom = part.bounds.min[1]!;
    if (bottom - bedY <= tol) continue;
    const overlapsInPlan = (other: AssembledPart) =>
      other !== part &&
      other.bounds.min[0]! <= part.bounds.max[0]! + tol &&
      other.bounds.max[0]! >= part.bounds.min[0]! - tol &&
      other.bounds.min[2]! <= part.bounds.max[2]! + tol &&
      other.bounds.max[2]! >= part.bounds.min[2]! - tol;
    const held = assembly.parts.some((other) => overlapsInPlan(other) && other.bounds.max[1]! >= bottom - tol && other.bounds.min[1]! < bottom - tol / 2);
    if (!held) unsupported.push(part.name);
  }
  if (unsupported.length) {
    issues.push({
      code: 'unsupported',
      severity: 'error',
      detail: `${unsupported.join(', ')} ${unsupported.length === 1 ? 'hangs' : 'hang'} in the air with nothing underneath — the print needs supports or a redesign`,
    });
  }

  return {
    ...base,
    issues,
    printable: issues.every((i) => i.severity !== 'error'),
    millimetresPerStud: mm,
    sizeMm,
    unsupportedParts: unsupported,
  };
}

// ---------------------------------------------------------------------------------------------
// Export: OBJ + MTL
// ---------------------------------------------------------------------------------------------

/**
 * A name from a model is untrusted text, and OBJ is a line-oriented format.
 *
 * "Body\nv 9999 9999 9999" written into an `o` line adds a vertex to the file. Every consumer then
 * reads geometry nobody authored, and the bounding box the customer was shown is not the bounding
 * box of the file they downloaded. So names are stripped to one line of safe characters.
 */
function objSafeName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\r\n]+/g, ' ').replace(/[^A-Za-z0-9_.\-]/g, '_').slice(0, 64);
  return cleaned.length ? cleaned : fallback;
}

function materialKey(spec: PartSpec): string {
  return `${spec.material}_${spec.color[0]}_${spec.color[1]}_${spec.color[2]}_${Math.round((1 - spec.transparency) * 1000)}`;
}

export interface ObjExport {
  obj: string;
  mtl: string;
  objName: string;
  mtlName: string;
}

/**
 * Wavefront OBJ, with the companion MTL.
 *
 * The one thing an OBJ writer has to get right is that `f` indices are GLOBAL and 1-based across
 * the whole file. Restarting them per object produces a file that opens, shows geometry, and is
 * wrong — which is why tests/meshgen.test.mjs reads the file back with a parser that resolves
 * indices the way every consumer does, and compares the recovered bounds against the assembly.
 */
export function exportObj(assembly: Assembly): ObjExport {
  const stem = objSafeName(assembly.name, assembly.id || 'model');
  const mtlName = `${stem}.mtl`;
  const lines: string[] = [
    `# ${stem} — generated by golem-meshgen`,
    `# ${assembly.parts.length} parts, ${assembly.triangles} triangles, '${assembly.quality}' tier`,
    `mtllib ${mtlName}`,
  ];
  const materials = new Map<string, PartSpec>();
  let offset = 1; // OBJ is 1-based
  assembly.parts.forEach((part, index) => {
    const key = materialKey(part.spec);
    if (!materials.has(key)) materials.set(key, part.spec);
    lines.push(`o ${objSafeName(part.name, `part_${index + 1}`)}`);
    lines.push(`usemtl ${key}`);
    const m = part.mesh;
    for (let i = 0; i < m.positions.length; i += 3) {
      lines.push(`v ${m.positions[i]!.toFixed(6)} ${m.positions[i + 1]!.toFixed(6)} ${m.positions[i + 2]!.toFixed(6)}`);
    }
    for (let i = 0; i < m.uvs.length; i += 2) lines.push(`vt ${m.uvs[i]!.toFixed(6)} ${m.uvs[i + 1]!.toFixed(6)}`);
    for (let i = 0; i < m.normals.length; i += 3) {
      lines.push(`vn ${m.normals[i]!.toFixed(6)} ${m.normals[i + 1]!.toFixed(6)} ${m.normals[i + 2]!.toFixed(6)}`);
    }
    for (let i = 0; i < m.indices.length; i += 3) {
      const a = m.indices[i]! + offset;
      const b = m.indices[i + 1]! + offset;
      const c = m.indices[i + 2]! + offset;
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    offset += m.positions.length / 3;
  });

  const mtlLines: string[] = [`# ${stem} materials — generated by golem-meshgen`];
  for (const [key, spec] of materials) {
    const pbr = MATERIAL_PBR[spec.material] ?? MATERIAL_PBR[DEFAULT_MATERIAL]!;
    const [r, g, b] = [spec.color[0] / 255, spec.color[1] / 255, spec.color[2] / 255];
    mtlLines.push(`newmtl ${key}`);
    mtlLines.push(`Kd ${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
    mtlLines.push(`Ka ${(r * 0.1).toFixed(6)} ${(g * 0.1).toFixed(6)} ${(b * 0.1).toFixed(6)}`);
    const spec01 = (1 - pbr.roughness) * (0.04 + 0.96 * pbr.metalness);
    mtlLines.push(`Ks ${spec01.toFixed(6)} ${spec01.toFixed(6)} ${spec01.toFixed(6)}`);
    mtlLines.push(`Ns ${(1 + (1 - pbr.roughness) * 900).toFixed(2)}`);
    mtlLines.push(`Ke ${(r * pbr.emissive).toFixed(6)} ${(g * pbr.emissive).toFixed(6)} ${(b * pbr.emissive).toFixed(6)}`);
    mtlLines.push(`d ${(1 - spec.transparency).toFixed(6)}`);
    mtlLines.push(`illum ${pbr.metalness > 0.5 ? 3 : 2}`);
  }

  return { obj: `${lines.join('\n')}\n`, mtl: `${mtlLines.join('\n')}\n`, objName: `${stem}.obj`, mtlName };
}

// ---------------------------------------------------------------------------------------------
// Export: binary glTF
// ---------------------------------------------------------------------------------------------

/** glTF colour factors are LINEAR; Roblox reports colour in sRGB. Converting is not optional. */
function srgbToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const COMPONENT_UINT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

export const GLB_GENERATOR = 'golem-meshgen/1';

/**
 * Binary glTF 2.0.
 *
 * Written by hand rather than through a library because a Worker has no three.js and no exporter
 * bundle, and because the format is small enough that the honest cost is a hundred lines. Every
 * claim this makes about the file — chunk order, alignment, POSITION min/max, triangle mode, the
 * material count — is read back in the tests by packages/evals/src/glb-inspect.mjs, which is the
 * same parser the asset QC pipeline points at downloaded meshes.
 */
export function exportGlb(assembly: Assembly): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const bufferViews: Record<string, number>[] = [];
  const accessors: Record<string, unknown>[] = [];

  const pushView = (data: Uint8Array, target: number): number => {
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength, target });
    chunks.push(data);
    byteOffset += data.byteLength;
    return bufferViews.length - 1;
  };

  const pushFloatAccessor = (values: number[], type: 'VEC3' | 'VEC2', withBounds: boolean): number => {
    const arr = new Float32Array(values);
    const view = pushView(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), TARGET_ARRAY_BUFFER);
    const stride = type === 'VEC3' ? 3 : 2;
    const acc: Record<string, unknown> = { bufferView: view, componentType: COMPONENT_FLOAT, count: values.length / stride, type };
    if (withBounds) {
      const min = new Array(stride).fill(Infinity);
      const max = new Array(stride).fill(-Infinity);
      // read back through Float32Array so min/max are the values the file really holds
      for (let i = 0; i < arr.length; i += stride) {
        for (let a = 0; a < stride; a++) {
          const v = arr[i + a]!;
          if (v < min[a]) min[a] = v;
          if (v > max[a]) max[a] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const materials: Record<string, unknown>[] = [];
  const materialIndex = new Map<string, number>();
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];

  assembly.parts.forEach((part, i) => {
    const key = materialKey(part.spec);
    let mat = materialIndex.get(key);
    if (mat === undefined) {
      const pbr = MATERIAL_PBR[part.spec.material] ?? MATERIAL_PBR[DEFAULT_MATERIAL]!;
      const alpha = 1 - part.spec.transparency;
      const entry: Record<string, unknown> = {
        name: key,
        pbrMetallicRoughness: {
          baseColorFactor: [
            srgbToLinear(part.spec.color[0]),
            srgbToLinear(part.spec.color[1]),
            srgbToLinear(part.spec.color[2]),
            alpha,
          ],
          metallicFactor: pbr.metalness,
          roughnessFactor: pbr.roughness,
        },
        doubleSided: false,
      };
      if (alpha < 1) entry.alphaMode = 'BLEND';
      if (pbr.emissive > 0) {
        entry.emissiveFactor = [
          srgbToLinear(part.spec.color[0]) * pbr.emissive,
          srgbToLinear(part.spec.color[1]) * pbr.emissive,
          srgbToLinear(part.spec.color[2]) * pbr.emissive,
        ];
      }
      materials.push(entry);
      mat = materials.length - 1;
      materialIndex.set(key, mat);
    }
    const position = pushFloatAccessor(part.mesh.positions, 'VEC3', true);
    const normal = pushFloatAccessor(part.mesh.normals, 'VEC3', false);
    const uv = pushFloatAccessor(part.mesh.uvs, 'VEC2', false);
    const idxArr = new Uint32Array(part.mesh.indices);
    const idxView = pushView(new Uint8Array(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength), TARGET_ELEMENT_ARRAY_BUFFER);
    accessors.push({ bufferView: idxView, componentType: COMPONENT_UINT, count: part.mesh.indices.length, type: 'SCALAR' });
    const indices = accessors.length - 1;
    meshes.push({
      name: part.name,
      primitives: [{ attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv }, indices, material: mat, mode: 4 }],
    });
    nodes.push({ name: part.name, mesh: i });
  });

  const binLength = byteOffset;
  const gltf = {
    asset: { version: '2.0', generator: GLB_GENERATOR },
    scene: 0,
    scenes: [{ name: assembly.name, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadded = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonLength = jsonBytes.byteLength + jsonPadded;
  const total = 12 + 8 + jsonLength + 8 + binLength;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLength, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPadded; i++) out[20 + jsonBytes.byteLength + i] = 0x20; // JSON pads with spaces
  const binHeader = 20 + jsonLength;
  dv.setUint32(binHeader, binLength, true);
  dv.setUint32(binHeader + 4, CHUNK_BIN, true);
  let at = binHeader + 8;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Credit accounting, per mesh
// ---------------------------------------------------------------------------------------------

/**
 * What a generated mesh costs, in neurons, before conversion to Credits.
 *
 * WHY A PROCEDURAL MESH COSTS ANYTHING AT ALL. The triangles are free; the SPEC is not. A model
 * wrote it, a critic looked at it, and a variant sweep multiplies both. Charging per generation
 * rather than per mesh is what lets one loop turn a single Credit into four hundred assets, so the
 * unit of account is the mesh — the thing the user receives — and the rates below scale with the
 * two numbers that really drive the work: how many parts the model had to place, and how much
 * geometry the pipeline then had to carry through QC, export and storage.
 *
 * The numbers are deliberately small against docs/COST-MODEL.md's 2,300-neuron build: the most
 * expensive mesh this pipeline can produce must still cost less than a whole quality-gated build,
 * which tests/meshgen.test.mjs asserts rather than assumes.
 */
export const MESH_CREDIT_RATES = {
  /** Fixed cost of producing one asset: the spec, the QC pass, the export. */
  perMeshNeurons: 8,
  /** Each part is a decision the model had to make and a row the critic had to look at. */
  perPartNeurons: 2,
  /** Geometry carried through export and storage. */
  neuronsPerKiloTriangle: 6,
  /** A textured mesh costs an image generation on top. */
  texturedNeurons: 20,
} as const;

export interface MeshWork {
  triangles: number;
  parts: number;
  textured?: boolean;
}

function requireCount(v: unknown, what: string): number {
  if (!finite(v) || !Number.isInteger(v) || v <= 0) {
    throw new Error(`${what} must be a positive whole number, got ${JSON.stringify(v)}`);
  }
  return v;
}

export function meshCreditCost(work: MeshWork): number {
  const triangles = requireCount(work?.triangles, 'triangle count');
  const parts = requireCount(work?.parts, 'part count');
  const textured = work.textured === true;
  return (
    MESH_CREDIT_RATES.perMeshNeurons +
    parts * MESH_CREDIT_RATES.perPartNeurons +
    (triangles / 1000) * MESH_CREDIT_RATES.neuronsPerKiloTriangle +
    (textured ? MESH_CREDIT_RATES.texturedNeurons : 0)
  );
}

/** The same charge in the unit the user reads. Never zero: `creditsForNeurons` floors at one. */
export function creditsForMesh(work: MeshWork): number {
  return creditsForNeurons(meshCreditCost(work));
}

export interface MeshCharge {
  meshId: string;
  name: string;
  triangles: number;
  neurons: number;
}

export interface MeshLedger {
  assemblyId: string;
  charges: MeshCharge[];
  totalNeurons: number;
  totalCredits: number;
  /**
   * What the same work would cost billed one mesh at a time.
   *
   * Recorded rather than charged. `creditsForNeurons` rounds up and floors at one, so five small
   * meshes billed separately cost five Credits and billed together cost two. The ledger charges the
   * total and keeps this figure so the difference is visible instead of being an accident.
   */
  chargedSeparatelyCredits: number;
}

/** One row per mesh, because a bill nobody can audit is a bill nobody trusts. */
export function meshLedger(assembly: Assembly, opts: { textured?: boolean } = {}): MeshLedger {
  const charges: MeshCharge[] = assembly.parts.map((part, i) => ({
    meshId: `${assembly.id}#${i}`,
    name: part.name,
    triangles: part.triangles,
    neurons: meshCreditCost({ triangles: part.triangles, parts: 1, textured: opts.textured === true }),
  }));
  const totalNeurons = charges.reduce((n, c) => n + c.neurons, 0);
  return {
    assemblyId: assembly.id,
    charges,
    totalNeurons,
    totalCredits: creditsForNeurons(totalNeurons),
    chargedSeparatelyCredits: charges.reduce((n, c) => n + creditsForNeurons(c.neurons), 0),
  };
}
