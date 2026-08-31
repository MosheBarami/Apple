// Composition metrics: the statistics that see STRUCTURE, not surface.
//
// WHY THIS FILE EXISTS — the measured failure that forced it.
//
// pixel-stats.ts computes whole-frame statistics and they are structure-blind. The proof is in the
// project's own numbers: the plaza the owner rejected scores edge density 0.053 against a threshold
// of 0.02, so it PASSES. The threshold only ever catches a degenerate uniform frame. Worse, a later
// build with 725 parts, 10 materials, 5 lights and 48 studs of height span raised every global
// statistic and still rendered from plan view as one uniform grey plate. Global averages cannot
// distinguish "structured" from "uniformly busy", because both produce the same mean.
//
// Composition is a property of the SPATIAL ARRANGEMENT of visual energy, not of its total. So every
// statistic here is either
//   (a) computed over a grid and reduced by a DISPERSION measure (Gini/entropy), never a mean, or
//   (b) a ratio between the largest structure and the typical one (hierarchy), or
//   (c) restricted to the geometry mask, so sky and ground stop diluting the signal.
//
// THE GEOMETRY MASK, AND WHY IT IS FREE.
// pixel-stats.ts records that whole-frame colourfulness is dominated by the backdrop and that
// "Restricting the statistic to the geometry mask would fix this and has not been done". It can be
// done at zero cost and with no change to the plugin, the payload, or the wire format: the
// rasteriser fills the background with exactly two constant colours (SKY 159,199,232 above the
// horizon, GROUND 110,122,99 below) and every geometry pixel is fog-blended toward a third colour
// (158,184,217). So a pixel is geometry iff it is neither background constant. This recovers the
// mask from renders that were already captured, including the regression fixtures.
// Collision risk (a shaded surface landing on a background constant exactly) is measured in
// packages/evals/src/composition.test.mjs rather than assumed.
//
// EVERY METRIC HERE IS A CANDIDATE UNTIL MEASURED. The calibration in
// packages/evals/src/composition-calibration.mjs ranks each one against a labelled ladder, and the
// ones that do not separate are recorded as rejected in docs/COMPOSITION.md. Do not promote a
// metric into a gate without a measured separation.

// verticalElementHeights lives in @golem/shared: the worker gates on it and the web app displays
// it, and two implementations of the same number would drift apart.
import { verticalElementHeights } from '@golem/shared';

/** Background fill constants — must match the rasteriser in apps/plugin/src/Render.luau. */
export const SKY_RGB = [0x9f, 0xc7, 0xe8] as const;
export const GROUND_RGB = [0x6e, 0x7a, 0x63] as const;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Gini coefficient of a non-negative sample. 0 = perfectly even, approaching 1 = all mass in one
 * element. This is the workhorse: it is the difference between "energy spread evenly over the
 * frame" (mush) and "energy concentrated where the composition wants the eye" (hierarchy), and a
 * mean cannot tell those apart.
 */
export function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const xs = [...values].sort((a, b) => a - b);
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    total += xs[i]!;
    weighted += (i + 1) * xs[i]!;
  }
  if (total <= 0) return 0;
  return clamp01((2 * weighted) / (n * total) - (n + 1) / n);
}

/** Normalised Shannon entropy of a distribution. 1 = perfectly uniform, 0 = all in one bucket. */
export function normEntropy(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || values.length < 2) return 0;
  let h = 0;
  for (const v of values) {
    if (v <= 0) continue;
    const p = v / total;
    h -= p * Math.log(p);
  }
  return clamp01(h / Math.log(values.length));
}

/** Build the geometry mask from an already-rendered RGB buffer. 1 = geometry, 0 = background. */
export function geometryMask(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const px = width * height;
  const mask = new Uint8Array(px);
  for (let i = 0; i < px; i++) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    const isSky = r === SKY_RGB[0] && g === SKY_RGB[1] && b === SKY_RGB[2];
    const isGround = r === GROUND_RGB[0] && g === GROUND_RGB[1] && b === GROUND_RGB[2];
    mask[i] = isSky || isGround ? 0 : 1;
  }
  return mask;
}

export interface CompositionMetrics {
  /** fraction of the frame occupied by geometry */
  coverage: number;

  // ---- appearance, restricted to geometry so the backdrop stops diluting it ----
  /** Hasler-Süsstrunk colourfulness over geometry pixels only */
  maskedColorfulness: number;
  /** Sobel edge fraction counted only where the whole 3x3 neighbourhood is geometry: INTERIOR
   *  detail. Whole-frame edge density is inflated by the silhouette against the sky, which a bare
   *  box has just as much of as a carved facade. */
  interiorEdgeDensity: number;
  /** |mean luminance of geometry − mean luminance of background|. A build that matches its ground
   *  in value reads as a stain on the floor however detailed it is. */
  figureGroundContrast: number;

  // ---- spatial distribution: the part global statistics cannot see ----
  /** Gini of interior-edge counts across a grid. Low = uniformly busy OR uniformly bare. */
  energyGini: number;
  /** Gini of geometry coverage across a grid. */
  occupancyGini: number;
  /** normalised entropy of the per-cell energy distribution; 1 = perfectly even mush */
  energyEntropy: number;
  /** fraction of grid cells holding meaningful geometry — guards the "one blob in a void" case
   *  that would otherwise score a flattering Gini */
  occupiedCellShare: number;
  /** distance of the geometry centroid from frame centre, in half-frames (0 = centred, 1 = corner) */
  centroidOffset: number;

  // ---- silhouette: the skyline read ----
  /** (max − min) of the topmost-geometry row per column, over frame height. A flat plate → ~0 */
  silhouetteRange: number;
  /** how far the tallest column rises above the median occupied column, over frame height. This is
   *  landmark dominance measured in image space. */
  silhouettePeakProminence: number;
  /** mean absolute step between adjacent columns of the skyline, over frame height */
  silhouetteRoughness: number;
}

const EMPTY_METRICS: CompositionMetrics = {
  coverage: 0, maskedColorfulness: 0, interiorEdgeDensity: 0, figureGroundContrast: 0,
  energyGini: 0, occupancyGini: 0, energyEntropy: 0, occupiedCellShare: 0, centroidOffset: 0,
  silhouetteRange: 0, silhouettePeakProminence: 0, silhouetteRoughness: 0,
};

/** Grid resolution for the spatial statistics. 6x6 = 36 cells: coarse enough that a single prop
 *  does not own a cell by accident, fine enough to see a focal region against quiet ones. */
export const GRID = 6;

/**
 * Every composition statistic for one rendered view. `rgb` is tightly packed 3 bytes/pixel; the
 * mask is derived from the background constants unless one is supplied.
 */
export function compositionMetrics(
  rgb: Uint8Array,
  width: number,
  height: number,
  mask: Uint8Array = geometryMask(rgb, width, height),
): CompositionMetrics {
  const px = width * height;
  if (px === 0) return { ...EMPTY_METRICS };

  const L = new Float32Array(px);
  let geomCount = 0;
  let sumLgeom = 0;
  let sumLbg = 0;
  let sumRg = 0;
  let sumRg2 = 0;
  let sumYb = 0;
  let sumYb2 = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < px; i++) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    L[i] = l;
    if (mask[i]) {
      geomCount++;
      sumLgeom += l;
      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      sumRg += rg;
      sumRg2 += rg * rg;
      sumYb += yb;
      sumYb2 += yb * yb;
      cx += i % width;
      cy += Math.floor(i / width);
    } else {
      sumLbg += l;
    }
  }

  const coverage = geomCount / px;
  // An almost-empty frame has no composition to measure; reporting zeros is honest, and callers
  // skip such views rather than treating them as failures.
  if (geomCount < 64) return { ...EMPTY_METRICS, coverage: round3(coverage) };

  const bgCount = px - geomCount;
  const meanRg = sumRg / geomCount;
  const meanYb = sumYb / geomCount;
  const sdRg = Math.sqrt(Math.max(0, sumRg2 / geomCount - meanRg * meanRg));
  const sdYb = Math.sqrt(Math.max(0, sumYb2 / geomCount - meanYb * meanYb));
  const maskedColorfulness =
    Math.sqrt(sdRg * sdRg + sdYb * sdYb) + 0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb);

  const figureGroundContrast = bgCount > 0 ? Math.abs(sumLgeom / geomCount - sumLbg / bgCount) : 0;

  // ---- interior edges + per-cell accumulation ----
  const cells = GRID * GRID;
  const cellEnergy: number[] = new Array(cells).fill(0);
  const cellCover: number[] = new Array(cells).fill(0);
  let interiorEdges = 0;
  let interiorConsidered = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const cell =
        Math.min(GRID - 1, Math.floor((y / height) * GRID)) * GRID +
        Math.min(GRID - 1, Math.floor((x / width) * GRID));
      if (mask[i]) cellCover[cell]!++;
      // A Sobel step is INTERIOR only when every tap is geometry. Otherwise it is the object's
      // outline against the backdrop, which a bare cube has as much of as a carved facade.
      if (
        !mask[i] || !mask[i - width - 1] || !mask[i - width] || !mask[i - width + 1] ||
        !mask[i - 1] || !mask[i + 1] || !mask[i + width - 1] || !mask[i + width] || !mask[i + width + 1]
      ) continue;
      interiorConsidered++;
      const tl = L[i - width - 1]!; const tt = L[i - width]!; const tr = L[i - width + 1]!;
      const ll = L[i - 1]!; const rr = L[i + 1]!;
      const bl = L[i + width - 1]!; const bb = L[i + width]!; const br = L[i + width + 1]!;
      const gx = tl + 2 * ll + bl - (tr + 2 * rr + br);
      const gy = tl + 2 * tt + tr - (bl + 2 * bb + br);
      if (Math.hypot(gx, gy) > 0.08) {
        interiorEdges++;
        cellEnergy[cell]!++;
      }
    }
  }

  const cellPx = (width / GRID) * (height / GRID);
  const occupiedCells = cellCover.filter((c) => c / cellPx > 0.05).length;

  // ---- silhouette profile: topmost geometry row per column ----
  const profile: number[] = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (mask[y * width + x]) { profile.push(height - y); break; }
    }
  }
  let silhouetteRange = 0;
  let silhouettePeakProminence = 0;
  let silhouetteRoughness = 0;
  if (profile.length > 1) {
    let mx = -Infinity;
    let mn = Infinity;
    for (const v of profile) { if (v > mx) mx = v; if (v < mn) mn = v; }
    const sorted = [...profile].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    silhouetteRange = (mx - mn) / height;
    silhouettePeakProminence = (mx - median) / height;
    let steps = 0;
    for (let i = 1; i < profile.length; i++) steps += Math.abs(profile[i]! - profile[i - 1]!);
    silhouetteRoughness = steps / (profile.length - 1) / height;
  }

  return {
    coverage: round3(coverage),
    maskedColorfulness: round3(maskedColorfulness),
    interiorEdgeDensity: round3(interiorConsidered ? interiorEdges / interiorConsidered : 0),
    figureGroundContrast: round3(figureGroundContrast),
    energyGini: round3(gini(cellEnergy)),
    occupancyGini: round3(gini(cellCover)),
    energyEntropy: round3(normEntropy(cellEnergy)),
    occupiedCellShare: round3(occupiedCells / cells),
    centroidOffset: round3(
      Math.hypot(cx / geomCount - width / 2, cy / geomCount - height / 2) / Math.hypot(width / 2, height / 2),
    ),
    silhouetteRange: round3(silhouetteRange),
    silhouettePeakProminence: round3(silhouettePeakProminence),
    silhouetteRoughness: round3(silhouetteRoughness),
  };
}

// ---------------------------------------------------------------------------------------------
// Scene-space structure. These read the geometry directly rather than an image, so they are exact,
// view-independent and free — no render required. They are the ones that can gate a BLOCKOUT,
// before any decoration has been paid for.
// ---------------------------------------------------------------------------------------------

export interface ScenePart {
  name?: string;
  size: [number, number, number];
  pos: [number, number, number];
  material?: string;
  transparency?: number;
}

export interface StructureMetrics {
  parts: number;
  /** Gini of part volumes. A composition wants a few large masses, some medium and many small — the
   *  large/medium/small rule. Every part the same size is the signature of a tiled floor or a
   *  cloned prop field, whatever the part count. */
  volumeGini: number;
  /** volume of the largest connected mass / volume of the second largest.
   *  MEASURED AND REJECTED as a focal-dominance signal — see docs/COMPOSITION.md. At a 1-stud
   *  clustering gap a paved scene fuses into a single mass, so this returns the "infinitely
   *  dominant" sentinel for a uniformly tiled plate and for a real plaza alike. Retained only
   *  because massCount is worth reporting. */
  massHierarchy: number;
  /** number of connected masses after clustering */
  massCount: number;
  /** height of the tallest vertical element over the height of the second tallest, both measured
   *  from the floor and clustered in plan. This is focal dominance as a player reads it: a plaza
   *  whose lamp posts stand as tall as its monument has no landmark, however many parts it has.
   *  1.0 means nothing dominates. A scene with only one vertical element returns 1.0, because a
   *  lone object expresses no hierarchy — isolation is caught by occupiedCellShare, not here. */
  verticalDominance: number;
  /** number of distinct vertical elements after plan clustering */
  verticalElements: number;
  /** tallest part top / median part top */
  heightHierarchy: number;
  /** plan area covered by geometry / plan area of the bounding box. Near 1 = wall-to-wall fill with
   *  no negative space; near 0 = a few objects lost in a large empty footprint. */
  footprintOccupancy: number;
  /** normalised entropy of volume distributed over 8 height bands. Near 0 = everything at one
   *  level, which is the flat-plate signature no matter how many parts there are. */
  heightBandEntropy: number;
  /** largest connected mass volume / total volume */
  landmarkShare: number;
}

/** Ground planes are drawn but never define composition — the same rule the rasteriser uses. */
const GROUND_PLANE_STUDS = 600;
const isGroundPlane = (p: ScenePart) => p.size[0] > GROUND_PLANE_STUDS || p.size[2] > GROUND_PLANE_STUDS;

/**
 * Cluster parts into connected masses by AABB proximity (union-find). `gap` is how far apart two
 * boxes can be and still read as one object; 1 stud is roughly a visible seam.
 */
export function clusterMasses(parts: ScenePart[], gap = 1): number[][] {
  const n = parts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => {
    let x = a;
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const box = parts.map((p) => ({
    lo: [p.pos[0] - p.size[0] / 2, p.pos[1] - p.size[1] / 2, p.pos[2] - p.size[2] / 2],
    hi: [p.pos[0] + p.size[0] / 2, p.pos[1] + p.size[1] / 2, p.pos[2] + p.size[2] / 2],
  }));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = box[i]!;
      const b = box[j]!;
      if (
        a.lo[0]! - gap <= b.hi[0]! && b.lo[0]! - gap <= a.hi[0]! &&
        a.lo[1]! - gap <= b.hi[1]! && b.lo[1]! - gap <= a.hi[1]! &&
        a.lo[2]! - gap <= b.hi[2]! && b.lo[2]! - gap <= a.hi[2]!
      ) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i); else groups.set(r, [i]);
  }
  return [...groups.values()];
}

/**
 * The gate. Every threshold below is CALIBRATED, not reasoned: measured against the 12-fixture
 * ladder in packages/evals/src/composition-ladder.mjs, whose ground truth is the mean of six
 * independent blind critics who saw only the images (packages/evals/tasks-visual/composition/
 * blind/jury.json). At these values the gate fires on every fixture the jury scored 4.0 or below
 * and on none it scored 4.5 or above — no false positives and no false negatives on that ladder.
 *
 * For contrast, the property and whole-frame-pixel checks that were already shipped fire on ZERO
 * of the same twelve, including one that is a single flat grey slab. That is the failure this
 * replaces: a check calibrated so loosely it can only catch a synthetic buffer.
 *
 * HONEST LIMITATION. Twelve fixtures derived from one real scene is a calibration set, not a
 * validation set. These numbers will need revisiting against genuinely independent scenes, and the
 * gate is deliberately scoped to `scene` subjects — a prop has no landmark and no vertical tier, so
 * applying it to a trophy would reject correct work. A legitimately flat design (a race circuit, a
 * floor plan) would also trip `flat`; that is a known false positive and is why these cap the score
 * rather than hard-refusing the build.
 */
export const COMPOSITION_GATES = {
  /** below this the tallest element does not dominate the second tallest: there is no landmark */
  verticalDominance: 1.25,
  /** below this the tallest thing barely rises above the typical thing: the plate signature */
  heightHierarchy: 2.0,
  /** below this the geometry is effectively greyscale. Only meaningful on the MASKED statistic —
   *  the whole-frame version reads 46.2 on a grey slab because sky and ground own the frame. */
  maskedColorfulness: 12,
};

/**
 * Composition failures, measured. `structure` is free (no render). `views` may be empty, in which
 * case only the structural checks run — which is the point: a blockout can be rejected before a
 * single pixel or model token has been spent on it.
 */
export function compositionHardFails(
  structure: StructureMetrics,
  views: { name: string; metrics: CompositionMetrics }[] = [],
  subject: 'scene' | 'prop' = 'scene',
): string[] {
  const fails: string[] = [];
  if (subject === 'scene') {
    if (structure.parts > 0 && structure.verticalElements === 0) {
      fails.push(
        'nothing in this scene stands up — every part is floor-height, so it reads as a plate from any camera and there is no silhouette to compose with',
      );
    } else if (structure.verticalDominance < COMPOSITION_GATES.verticalDominance) {
      fails.push(
        `no landmark: the tallest element is only ${structure.verticalDominance}x the height of the next one (want at least ${COMPOSITION_GATES.verticalDominance}x), so nothing dominates and the eye has nowhere to land`,
      );
    }
    if (structure.heightHierarchy < COMPOSITION_GATES.heightHierarchy) {
      fails.push(
        `no vertical variation: the tallest part is ${structure.heightHierarchy}x the median part height (want at least ${COMPOSITION_GATES.heightHierarchy}x) — adding more parts at the same height cannot fix this`,
      );
    }
  }
  const judged = views.filter((v) => v.metrics.coverage >= 0.05);
  if (judged.length) {
    const colour = Math.max(...judged.map((v) => v.metrics.maskedColorfulness));
    if (colour < COMPOSITION_GATES.maskedColorfulness) {
      fails.push(
        `the built geometry is close to greyscale (colourfulness ${colour} measured over the geometry only, want at least ${COMPOSITION_GATES.maskedColorfulness})`,
      );
    }
  }
  return fails;
}

/** One compact line per view for the critic, carrying only the statistics that survived calibration. */
export function compositionLine(name: string, m: CompositionMetrics): string {
  return `${name}: interior detail ${m.interiorEdgeDensity}, geometry colourfulness ${m.maskedColorfulness}, mass concentration ${m.occupancyGini}, skyline peak ${m.silhouettePeakProminence}, figure/ground value gap ${m.figureGroundContrast}`;
}

/** The structural line: view-independent, and the only part a blockout can be judged on. */
export function structureLine(s: StructureMetrics): string {
  return (
    `${s.parts} parts in ${s.verticalElements} vertical elements; tallest element ${s.verticalDominance}x the next ` +
    `(landmark dominance), tallest part ${s.heightHierarchy}x the median part height, plan footprint ${Math.round(s.footprintOccupancy * 100)}% covered`
  );
}

/**
 * Capture the layout with run_code instead of relying on the render to carry it.
 *
 * MEASURED 2026-08-31: the plugin installed in the owner's Studio returns render_view as
 * {views, boundsSize, subject, lighting} — with NO `layout` field. Render.layoutSummary exists in
 * this repo but not in the .rbxm that is actually installed, and the plugin is installed by hand, so
 * every consumer of result.layout has been silently inert in production: analyseLayout, the
 * structural half of the composition gate, and the semantic gate all received undefined and did
 * nothing. check_composition answered "no geometry to judge" against a place with geometry in it.
 *
 * Rather than require every user to reinstall before any of it works, the geometry is fetched with
 * run_code, which every installed plugin understands. It is also cheaper than the render path it
 * replaces: no rasterisation, no image payload, one round trip.
 */
export const LAYOUT_LUAU = `
local root = game.Workspace
local out, n = {}, 0
for _, d in ipairs(root:GetDescendants()) do
  if d:IsA("BasePart") and d.Transparency < 0.95 then
    n += 1
    if n <= 1500 then
      local _, ry = d.CFrame:ToEulerAnglesYXZ()
      out[#out + 1] = string.format("[%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.1f]",
        d.Position.X, d.Position.Y, d.Position.Z, d.Size.X, d.Size.Y, d.Size.Z, math.deg(ry))
    end
  end
end
return "[" .. table.concat(out, ",") .. "]"
`;

/** Read the tuple array back out of whatever wrapper run_code returned it in. */
export function parseLayout(raw: unknown): number[][] | null {
  let value: unknown = raw;
  for (let i = 0; i < 6; i++) {
    if (!value || typeof value !== 'object') break;
    const o = value as Record<string, unknown>;
    if ('result' in o) { value = o.result; continue; }
    if ('t' in o && 'v' in o) { value = o.v; continue; }
    if ('data' in o) { value = o.data; continue; }
    break;
  }
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(value)) return null;
  const parts = value.filter((p): p is number[] => Array.isArray(p) && p.length >= 6 && p.every((n) => typeof n === 'number'));
  return parts.length ? parts : null;
}

/**
 * Structure from the compact capture the plugin already sends. SceneLayout.parts is
 * [x, y, z, sx, sy, sz, yawDeg] per part, so this costs nothing extra on the wire — the geometry
 * needed to judge macro composition is already in the request that asks for a critique.
 */
export function structureFromLayout(parts: number[][] | undefined): StructureMetrics | null {
  if (!parts?.length) return null;
  return structureMetrics(
    parts.map((a) => ({
      pos: [a[0]!, a[1]!, a[2]!] as [number, number, number],
      size: [a[3]!, a[4]!, a[5]!] as [number, number, number],
    })),
  );
}

export function structureMetrics(allParts: ScenePart[]): StructureMetrics {
  const parts = allParts.filter((p) => !isGroundPlane(p) && (p.transparency ?? 0) < 0.95);
  if (parts.length === 0) {
    return {
      parts: 0, volumeGini: 0, massHierarchy: 1, massCount: 0, verticalDominance: 1,
      verticalElements: 0, heightHierarchy: 1, footprintOccupancy: 0, heightBandEntropy: 0,
      landmarkShare: 0,
    };
  }

  const vol = parts.map((p) => Math.max(1e-6, p.size[0] * p.size[1] * p.size[2]));
  const totalVol = vol.reduce((a, b) => a + b, 0);

  // Clustering is O(n^2). Above this the pairwise pass is the slowest thing in the critique, and a
  // scene that large is judged on its image anyway, so mass metrics degrade to per-part.
  const CLUSTER_LIMIT = 900;
  const groups = parts.length <= CLUSTER_LIMIT ? clusterMasses(parts) : parts.map((_, i) => [i]);
  const massVols = groups.map((g) => g.reduce((a, i) => a + vol[i]!, 0)).sort((a, b) => b - a);

  const tops = parts.map((p) => p.pos[1] + p.size[1] / 2).sort((a, b) => a - b);
  const medianTop = tops[Math.floor(tops.length / 2)]!;
  const maxTop = tops[tops.length - 1]!;

  // footprint occupancy on a fixed 64x64 plan grid over the build's own bounding box
  let lox = Infinity, loz = Infinity, hix = -Infinity, hiz = -Infinity;
  for (const p of parts) {
    lox = Math.min(lox, p.pos[0] - p.size[0] / 2); hix = Math.max(hix, p.pos[0] + p.size[0] / 2);
    loz = Math.min(loz, p.pos[2] - p.size[2] / 2); hiz = Math.max(hiz, p.pos[2] + p.size[2] / 2);
  }
  const spanX = Math.max(1e-6, hix - lox);
  const spanZ = Math.max(1e-6, hiz - loz);
  const G = 64;
  const plan = new Uint8Array(G * G);
  for (const p of parts) {
    const x0 = Math.max(0, Math.min(G - 1, Math.floor(((p.pos[0] - p.size[0] / 2 - lox) / spanX) * G)));
    const x1 = Math.max(0, Math.min(G - 1, Math.floor(((p.pos[0] + p.size[0] / 2 - lox) / spanX) * G)));
    const z0 = Math.max(0, Math.min(G - 1, Math.floor(((p.pos[2] - p.size[2] / 2 - loz) / spanZ) * G)));
    const z1 = Math.max(0, Math.min(G - 1, Math.floor(((p.pos[2] + p.size[2] / 2 - loz) / spanZ) * G)));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) plan[z * G + x] = 1;
  }
  let planFilled = 0;
  for (let i = 0; i < plan.length; i++) if (plan[i]) planFilled++;

  // volume by height band, over the vertical span of the build
  let loY = Infinity;
  let hiY = -Infinity;
  for (const p of parts) {
    loY = Math.min(loY, p.pos[1] - p.size[1] / 2);
    hiY = Math.max(hiY, p.pos[1] + p.size[1] / 2);
  }
  const spanY = Math.max(1e-6, hiY - loY);
  const bands: number[] = new Array(8).fill(0);
  parts.forEach((p, i) => {
    const b = Math.min(7, Math.max(0, Math.floor(((p.pos[1] - loY) / spanY) * 8)));
    bands[b]! += vol[i]!;
  });

  const vTops = verticalElementHeights(parts.map((p) => [p.pos[0], p.pos[1], p.pos[2], p.size[0], p.size[1], p.size[2], 0]));

  return {
    parts: parts.length,
    volumeGini: round3(gini(vol)),
    massHierarchy: round3(
      massVols.length > 1 ? massVols[0]! / Math.max(1e-6, massVols[1]!) : 999,
    ),
    massCount: groups.length,
    verticalDominance: round3(vTops.length > 1 ? vTops[0]! / Math.max(1e-6, vTops[1]!) : 1),
    verticalElements: vTops.length,
    heightHierarchy: round3(maxTop / Math.max(1e-6, medianTop)),
    footprintOccupancy: round3(planFilled / (G * G)),
    heightBandEntropy: round3(normEntropy(bands)),
    landmarkShare: round3(massVols[0]! / totalVol),
  };
}
