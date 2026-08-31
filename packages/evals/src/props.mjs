#!/usr/bin/env node
// PROP QUALITY BENCHMARK — does a single built object read as the noun that was asked for,
// or is it a stack of Parts that merely satisfies the description?
//
// THE BUG THIS EXISTS TO CATCH.
// The project's origin failure was an "ugly trophy": the agent produced a grey box, a grey
// cylinder-shaped box, and a wider grey box on top, called it a trophy, and every check the
// system had agreed. Object existence was satisfied. A vision critic asked "is this a trophy?"
// said yes. It was still garbage art. tasks-visual/props/fixtures/trophy-ugly.json IS that
// object, reconstructed, and `node --test src/props.test.mjs` fails the day this benchmark
// stops rejecting it.
//
// DESIGN RULE: A STACK OF PARTS THAT TECHNICALLY RESEMBLES THE NOUN MUST NOT PASS.
// Nothing here scores "contains the requested thing". Every signal asks a harder question:
// does the silhouette carry information, is there detail at more than one scale, did anyone
// choose a material and a colour, would you recognise it from across the map.
//
// DETERMINISTIC VS MODEL-DEPENDENT — the honest split, also machine-readable in SIGNALS below.
//
//   deterministic (geometry + rasteriser only; free, reproducible, run in CI):
//     silhouette          per-row width profile of the rendered mask; box-likeness
//     detail_scale        part-size histogram in large/medium/small relative to the prop's bounds
//     material_intent     distinct materials, and whether they belong to the noun's material family
//     factory_default     share of parts that are default-grey Plastic — the "grey blocks" test
//     proportion          overall aspect and archetype-specific ratios (waist, cap, footprint)
//     efficiency          part count against the silhouette complexity it actually buys
//     readability         re-render at gameplay-distance pixel scale; does the profile survive
//     archetype           necessary structural conditions for the noun (a tree's canopy is above
//                         and wider than its trunk; a chest is wider than tall; ...)
//
//   model-dependent (NOT computed here; a model is the only instrument for these):
//     recognizability     "would a player call this a trophy?" — archetype above is a NECESSARY
//                         condition, never a sufficient one. Passing archetype does not mean the
//                         object is recognisable; failing it means it cannot be.
//     ornament_quality    is the detail meaningful decoration or noise
//     style_coherence     does it belong to one art direction
//
// The benchmark deliberately gates on the deterministic half alone, because a gate that needs a
// model call is a gate nobody runs. The model-dependent half is exposed as `SIGNALS` metadata so
// the adversarial critic (apps/worker/src/critic.ts) can pick the lenses geometry cannot cover.
//
// Usage:
//   node src/props.mjs --scene ../tasks-visual/props/fixtures/trophy-ugly.json --prop trophy
//   node src/props.mjs --suite            # grade every fixture, print the separation table
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScene } from './render-scene.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROPS_DIR = join(HERE, '..', 'tasks-visual', 'props');
export const SUITE_PATH = join(PROPS_DIR, 'suite.json');
export const FIXTURES_DIR = join(PROPS_DIR, 'fixtures');

/** Background constants of the software rasteriser. Must match src/render-scene.mjs; a test
 *  renders a known scene and asserts the mask recovers, so drift is caught rather than assumed. */
export const SKY_RGB = [0x9f, 0xc7, 0xe8];
export const GROUND_RGB = [0x6e, 0x7a, 0x63];

/** Roblox's out-of-the-box Part. Medium stone grey, Plastic. The thing "just grey Parts" means. */
export const FACTORY_PART = { material: 'Plastic', color: [163, 162, 165] };
/** Materials that are the engine default rather than a choice. */
export const DEFAULT_MATERIALS = new Set(['Plastic', 'SmoothPlastic']);
/** HSV saturation below this reads as grey to a player. */
export const GREY_SATURATION = 0.12;

/** Views used for silhouette work. `top` flattens a prop into a footprint and `eye` duplicates
 *  `hero` for a small object, so both are excluded — they would dilute the profile statistics. */
export const PROFILE_VIEWS = ['hero', 'front', 'side'];

/** Full-resolution capture (the plugin's default) and the gameplay-distance capture. */
export const FULL_RES = { width: 288, height: 180 };
/** 96x60 is the 288x180 frame at one third linear scale: what a prop subtends when a player is
 *  standing back from it rather than nose to the mesh. Under the 320x240 hard cap by construction. */
export const DISTANT_RES = { width: 96, height: 60 };

export class PropBenchError extends Error {}

// ---------------------------------------------------------------------------------------------
// Signal registry — the machine-readable version of the header comment.
// ---------------------------------------------------------------------------------------------

export const SIGNALS = [
  { id: 'archetype', deterministic: true, weight: 0.16, measures: 'necessary structural conditions for the noun' },
  { id: 'silhouette', deterministic: true, weight: 0.16, measures: 'width-profile variation and box-likeness of the rendered mask' },
  { id: 'detail_scale', deterministic: true, weight: 0.16, measures: 'presence of large, medium and small elements' },
  { id: 'factory_default', deterministic: true, weight: 0.14, measures: 'share of parts left as default grey Plastic' },
  { id: 'material_intent', deterministic: true, weight: 0.12, measures: 'material count and fit to the noun material family' },
  { id: 'proportion', deterministic: true, weight: 0.1, measures: 'overall aspect ratio against the archetype band' },
  { id: 'readability', deterministic: true, weight: 0.1, measures: 'does the profile survive at gameplay-distance pixel scale' },
  { id: 'efficiency', deterministic: true, weight: 0.06, measures: 'part count against the silhouette complexity it buys' },
  // Not scored here. Listed so the gap is explicit and the critic can cover it.
  { id: 'recognizability', deterministic: false, weight: 0, measures: 'would a player name the noun unprompted' },
  { id: 'ornament_quality', deterministic: false, weight: 0, measures: 'is the detail meaningful decoration or noise' },
  { id: 'style_coherence', deterministic: false, weight: 0, measures: 'does the object belong to one art direction' },
];

export const SCORED_SIGNALS = SIGNALS.filter((s) => s.weight > 0);

/** Gate. hardFailCap sits strictly below passThreshold so a hard fail can never pass, whatever
 *  the weighted score says — same invariant the visual grader enforces. */
export const GATE = { passThreshold: 0.62, hardFailCap: 0.35 };

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

export function loadJson(path) {
  const p = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (!existsSync(p)) throw new PropBenchError(`file not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function loadSuite() {
  return loadJson(SUITE_PATH);
}

export function getPropSpec(suite, id) {
  const spec = suite.props.find((p) => p.id === id);
  if (!spec) throw new PropBenchError(`unknown prop id "${id}"; suite has: ${suite.props.map((p) => p.id).join(', ')}`);
  return spec;
}

export function loadFixture(name) {
  return loadJson(join(FIXTURES_DIR, name.endsWith('.json') ? name : `${name}.json`));
}

// ---------------------------------------------------------------------------------------------
// Small maths
// ---------------------------------------------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
}

/** Coefficient of variation. Scale-free, so a big prop and a small prop are comparable. */
export function cv(xs) {
  const m = mean(xs);
  return m > 0 ? stdev(xs) / m : 0;
}

/** HSV saturation of an 0-255 RGB triple. */
export function saturation([r, g, b]) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

/** Rec.709 relative luminance, 0-255. */
export function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Score a measured value against a [lo, hi] band, degrading linearly outside it over `slack`. */
export function bandScore(value, [lo, hi], slack = null) {
  if (value >= lo && value <= hi) return 1;
  const s = slack ?? Math.max((hi - lo) * 0.75, 1e-6);
  const d = value < lo ? lo - value : value - hi;
  return clamp01(1 - d / s);
}

/** Score a value that should be at least `min`, reaching 1 at `good`. */
export function atLeast(value, min, good) {
  if (value >= good) return 1;
  if (value <= min) return 0;
  return clamp01((value - min) / (good - min));
}

/** Score a value that should be at most `max`, reaching 1 at `good`. */
export function atMost(value, max, good) {
  if (value <= good) return 1;
  if (value >= max) return 0;
  return clamp01((max - value) / (max - good));
}

// ---------------------------------------------------------------------------------------------
// Geometry measures — read the scene, no rendering needed
// ---------------------------------------------------------------------------------------------

/** Parts that are actually part of the object: not invisible, not a baseplate-scale ground plane. */
export function livePartsOf(scene) {
  return (scene.parts ?? []).filter((p) => (p.transparency ?? 0) < 0.95 && p.size[0] <= 600 && p.size[2] <= 600);
}

export function boundsOf(parts) {
  if (!parts.length) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    // Axis-aligned envelope of the rotated box: conservative, and rotation-stable, which matters
    // because a 45-degree-rotated slab would otherwise report a smaller footprint than it occupies.
    const r = p.rot ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let a = 0; a < 3; a++) {
      const ext =
        0.5 *
        (Math.abs(r[a * 3]) * p.size[0] + Math.abs(r[a * 3 + 1]) * p.size[1] + Math.abs(r[a * 3 + 2]) * p.size[2]);
      lo[a] = Math.min(lo[a], p.pos[a] - ext);
      hi[a] = Math.max(hi[a], p.pos[a] + ext);
    }
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

/**
 * Detail-scale distribution. Buckets are relative to the prop's own largest dimension, so a
 * 3-stud figurine and a 40-stud monument are measured the same way.
 *
 * The failure mode: everything in one bucket. A blockout is all-large. Part spam is all-small.
 * Real props read at three distances — the mass you see across the map, the components you see
 * walking up, and the trim you see standing at it.
 */
export function detailScale(parts, boundsSize) {
  // Cube-equivalent size, not the largest dimension: bucketing a 17-stud obelisk against its own
  // height would put every element in "small" and a squat chest would have no small bucket at all.
  // cbrt(volume of the bounding box) puts a tall thin prop and a wide flat prop on the same footing.
  const M = Math.max(Math.cbrt(Math.max(boundsSize[0], 0.1) * Math.max(boundsSize[1], 0.1) * Math.max(boundsSize[2], 0.1)), 1e-6);
  const buckets = { large: 0, medium: 0, small: 0 };
  for (const p of parts) {
    const d = Math.max(...p.size) / M;
    if (d >= 0.45) buckets.large++;
    else if (d >= 0.15) buckets.medium++;
    else buckets.small++;
  }
  const n = parts.length || 1;
  const shares = {
    large: buckets.large / n,
    medium: buckets.medium / n,
    small: buckets.small / n,
  };
  // Normalised entropy over the three buckets: 1 = evenly spread across scales, 0 = all one size.
  const ps = Object.values(shares).filter((v) => v > 0);
  const entropy = ps.length < 2 ? 0 : clamp01(-ps.reduce((a, p) => a + p * Math.log(p), 0) / Math.log(3));
  return { counts: buckets, shares, entropy, occupiedBuckets: ps.length };
}

/** Palette + material intent, and the factory-default share that the origin bug is made of. */
export function surfaceMeasures(parts) {
  const materials = new Map();
  const hues = new Set();
  let grey = 0;
  let factory = 0;
  let exactDefaultColour = 0;
  for (const p of parts) {
    const m = p.material ?? 'Plastic';
    materials.set(m, (materials.get(m) ?? 0) + 1);
    const sat = saturation(p.color);
    if (sat < GREY_SATURATION) grey++;
    if (DEFAULT_MATERIALS.has(m) && sat < GREY_SATURATION) factory++;
    if (p.color.every((c, i) => Math.abs(c - FACTORY_PART.color[i]) <= 6)) exactDefaultColour++;
    // quantise to a 16^3 cube — perceptibly distinct colours, not float noise
    hues.add(
      Math.floor((p.color[0] / 255) * 15) * 256 + Math.floor((p.color[1] / 255) * 15) * 16 + Math.floor((p.color[2] / 255) * 15),
    );
  }
  const n = parts.length || 1;
  return {
    distinctMaterials: materials.size,
    materialCounts: [...materials].map(([material, count]) => ({ material, count })).sort((a, b) => b.count - a.count),
    distinctColours: hues.size,
    greyShare: grey / n,
    factoryShare: factory / n,
    exactDefaultColourShare: exactDefaultColour / n,
    meanSaturation: mean(parts.map((p) => saturation(p.color))),
  };
}

/** Which named material families the build actually uses, per suite.json's family table. */
export function materialFamilies(materialCounts, families) {
  const hit = new Set();
  for (const { material } of materialCounts) {
    for (const [family, members] of Object.entries(families)) {
      if (members.includes(material)) hit.add(family);
    }
  }
  return [...hit];
}

// ---------------------------------------------------------------------------------------------
// Silhouette measures — read the rendered mask
// ---------------------------------------------------------------------------------------------

/** 1 where geometry was drawn, 0 where the background constants show through. */
export function geometryMask(rgb, width, height) {
  const px = width * height;
  const mask = new Uint8Array(px);
  for (let i = 0; i < px; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const isSky = r === SKY_RGB[0] && g === SKY_RGB[1] && b === SKY_RGB[2];
    const isGround = r === GROUND_RGB[0] && g === GROUND_RGB[1] && b === GROUND_RGB[2];
    mask[i] = isSky || isGround ? 0 : 1;
  }
  return mask;
}

/**
 * The silhouette statistics. This is the measure that separates "a trophy" from "three boxes".
 *
 *   boxFill    silhouette area / its bounding-box area. A single axis-aligned slab seen head-on
 *              is 1.0. A projected cube is ~0.75. Anything with a stem, a waist or handles is
 *              well below that, because the bounding box counts the air the shape does not fill.
 *   profileCV  coefficient of variation of per-row silhouette width. A box has 0 by construction.
 *              A trophy (wide base, thin stem, wide bowl) is the highest-CV shape in the suite.
 *   waistRatio narrowest row width over widest row width, over the rows that contain geometry.
 *              An hourglass is low; a slab is 1.
 *   topHeavy   mean width of the top third over the mean width of the bottom third. Distinguishes
 *              a trophy/tree (heavy above) from a chest/altar (heavy below).
 */
export function silhouetteMetrics(rgb, width, height) {
  const mask = geometryMask(rgb, width, height);
  const rowWidth = [];
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < height; y++) {
    let lo = -1;
    let hi = -1;
    let filled = 0;
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (lo < 0) lo = x;
      hi = x;
      filled++;
    }
    rowWidth.push(hi < 0 ? 0 : hi - lo + 1);
    area += filled;
    if (hi >= 0) {
      minX = Math.min(minX, lo);
      maxX = Math.max(maxX, hi);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxY < 0) {
    return { area: 0, coverage: 0, boxFill: 0, profileCV: 0, waistRatio: 0, topHeavy: 0, rows: 0, empty: true };
  }
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const live = rowWidth.slice(minY, maxY + 1);
  const widest = Math.max(...live);
  const third = Math.max(1, Math.floor(live.length / 3));
  const top = mean(live.slice(0, third));
  const bottom = mean(live.slice(-third));
  return {
    area,
    coverage: area / (width * height),
    boxFill: area / (bboxW * bboxH),
    profileCV: cv(live),
    waistRatio: widest > 0 ? Math.min(...live) / widest : 0,
    topHeavy: bottom > 0 ? top / bottom : 0,
    aspect: bboxH / bboxW,
    rows: live.length,
    empty: false,
  };
}

/**
 * Interior edge density: Sobel energy counted ONLY where the whole 3x3 neighbourhood is geometry.
 *
 * This is the measure that sees the origin bug. The ugly trophy's OUTER profile is a correct
 * trophy profile — base, stem, bowl — and profileCV cannot tell it from a well-built trophy
 * (measured: 0.488 vs 0.464). What separates them is inside the outline: three flat grey faces
 * against thirty-six part boundaries, each a step in Lambert value or colour. Whole-frame edge
 * density would not show this either, because the silhouette against the sky dominates it and a
 * bare box has just as much of that as a carved one. Excluding any window touching background
 * removes the silhouette contribution entirely.
 */
export function interiorEdgeDensity(rgb, width, height) {
  const mask = geometryMask(rgb, width, height);
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) lum[i] = luminance([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
  let interior = 0;
  let edges = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let allGeom = true;
      for (let dy = -1; dy <= 1 && allGeom; dy++) for (let dx = -1; dx <= 1; dx++) if (!mask[(y + dy) * width + (x + dx)]) { allGeom = false; break; }
      if (!allGeom) continue;
      interior++;
      const at = (dx, dy) => lum[(y + dy) * width + (x + dx)];
      const gx = at(-1, -1) + 2 * at(-1, 0) + at(-1, 1) - at(1, -1) - 2 * at(1, 0) - at(1, 1);
      const gy = at(-1, -1) + 2 * at(0, -1) + at(1, -1) - at(-1, 1) - 2 * at(0, 1) - at(1, 1);
      // 18 on a 0-255 luminance scale is roughly one Lambert step between adjacent faces: below
      // that is dithering noise from the rasteriser's flat shading, above it is a real boundary.
      if (Math.hypot(gx, gy) > 18) edges++;
    }
  }
  return { interiorPixels: interior, interiorEdgeDensity: interior > 0 ? edges / interior : 0 };
}

/** |mean luminance of geometry − mean luminance of background|: does the object read against the
 *  world at all. The rasteriser has one sun and no shadows, so this — not "lighting quality" — is
 *  the only lighting-adjacent thing the pixels can honestly support. */
export function figureGroundContrast(rgb, width, height) {
  const mask = geometryMask(rgb, width, height);
  const fg = [];
  const bg = [];
  for (let i = 0; i < width * height; i++) {
    const l = luminance([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
    (mask[i] ? fg : bg).push(l);
  }
  if (!fg.length || !bg.length) return 0;
  return Math.abs(mean(fg) - mean(bg));
}

// ---------------------------------------------------------------------------------------------
// Measurement: scene -> every number the scorers need
// ---------------------------------------------------------------------------------------------

export function measureProp(scene, opts = {}) {
  const parts = livePartsOf(scene);
  if (!parts.length) throw new PropBenchError('scene has no renderable parts');
  const b = boundsOf(parts);
  const full = renderScene(scene, { ...FULL_RES, view: 'all', ...(opts.full ?? {}) });
  if (full.error) throw new PropBenchError(`render failed: ${full.error}`);
  const distant = renderScene(scene, { ...DISTANT_RES, view: 'all' });

  const profiles = full.views
    .filter((v) => PROFILE_VIEWS.includes(v.name))
    .map((v) => ({
      name: v.name,
      ...silhouetteMetrics(v.rgb, v.meta.width, v.meta.height),
      ...interiorEdgeDensity(v.rgb, v.meta.width, v.meta.height),
    }));
  const distantProfiles = distant.views
    .filter((v) => PROFILE_VIEWS.includes(v.name))
    .map((v) => ({
      name: v.name,
      ...silhouetteMetrics(v.rgb, v.meta.width, v.meta.height),
      ...interiorEdgeDensity(v.rgb, v.meta.width, v.meta.height),
      contrast: figureGroundContrast(v.rgb, v.meta.width, v.meta.height),
    }));

  const agg = (list, key) => round(mean(list.map((p) => p[key])), 4);
  return {
    parts: parts.length,
    boundsSize: b.size.map((v) => round(v, 2)),
    scale: detailScale(parts, b.size),
    surface: surfaceMeasures(parts),
    silhouette: {
      views: profiles,
      boxFill: agg(profiles, 'boxFill'),
      profileCV: agg(profiles, 'profileCV'),
      waistRatio: agg(profiles, 'waistRatio'),
      topHeavy: agg(profiles, 'topHeavy'),
      interiorEdgeDensity: agg(profiles, 'interiorEdgeDensity'),
      // worst view matters: a prop that reads only from one angle is not a prop
      worstProfileCV: round(Math.min(...profiles.map((p) => p.profileCV)), 4),
      worstInteriorEdgeDensity: round(Math.min(...profiles.map((p) => p.interiorEdgeDensity)), 4),
    },
    distant: {
      views: distantProfiles,
      profileCV: agg(distantProfiles, 'profileCV'),
      interiorEdgeDensity: agg(distantProfiles, 'interiorEdgeDensity'),
      contrast: round(mean(distantProfiles.map((p) => p.contrast)), 2),
      coverage: agg(distantProfiles, 'coverage'),
    },
    // height/footprint, from geometry not pixels, so camera framing cannot flatter it
    aspect: round(b.size[1] / Math.max(b.size[0], b.size[2], 1e-6), 3),
    footprintRatio: round(Math.min(b.size[0], b.size[2]) / Math.max(b.size[0], b.size[2], 1e-6), 3),
  };
}

// ---------------------------------------------------------------------------------------------
// Scoring — one function per signal, each returning {score, evidence}
// ---------------------------------------------------------------------------------------------

const ev = (score, evidence) => ({ score: round(clamp01(score), 3), evidence });

/**
 * Archetype: the NECESSARY structural conditions for the noun. Every clause names a measured
 * quantity and a band, so a failure says which number was wrong rather than "looks off".
 * Passing this does not mean the object is recognisable — only a model can say that. Failing it
 * means it cannot be, which is all a gate needs.
 */
export function scoreArchetype(m, spec) {
  const checks = [];
  const push = (id, ok, detail) => checks.push({ id, ok, detail });
  const a = spec.archetype ?? {};
  if (a.aspect) push('aspect', m.aspect >= a.aspect[0] && m.aspect <= a.aspect[1], `height/footprint ${m.aspect} vs ${JSON.stringify(a.aspect)}`);
  if (a.waistRatio) push('waist', m.silhouette.waistRatio >= a.waistRatio[0] && m.silhouette.waistRatio <= a.waistRatio[1], `waistRatio ${m.silhouette.waistRatio} vs ${JSON.stringify(a.waistRatio)}`);
  if (a.topHeavy) push('mass_distribution', m.silhouette.topHeavy >= a.topHeavy[0] && m.silhouette.topHeavy <= a.topHeavy[1], `topHeavy ${m.silhouette.topHeavy} vs ${JSON.stringify(a.topHeavy)}`);
  if (a.footprintRatio) push('footprint', m.footprintRatio >= a.footprintRatio[0] && m.footprintRatio <= a.footprintRatio[1], `footprintRatio ${m.footprintRatio} vs ${JSON.stringify(a.footprintRatio)}`);
  if (a.minParts != null) push('part_budget', m.parts >= a.minParts, `${m.parts} parts vs minimum ${a.minParts}`);
  const failed = checks.filter((c) => !c.ok);
  return {
    ...ev(checks.length ? (checks.length - failed.length) / checks.length : 1, failed.length ? `archetype conditions violated: ${failed.map((c) => `${c.id} (${c.detail})`).join('; ')}` : `all ${checks.length} archetype conditions met`),
    checks,
  };
}

/**
 * Form legibility: the outer profile AND the structure inside it.
 *
 * Both halves are needed and neither is sufficient. The ugly trophy proves the outer profile is
 * not sufficient — its profileCV is HIGHER than the good trophy's, because a base/stem/bowl
 * outline is a base/stem/bowl outline whether you build it from three boxes or thirty-six parts.
 * The interior-edge half is what tells them apart.
 */
export function scoreSilhouette(m, spec) {
  const s = m.silhouette;
  const minCV = spec.silhouette?.minProfileCV ?? 0.12;
  const maxFill = spec.silhouette?.maxBoxFill ?? 0.72;
  const minEdges = spec.silhouette?.minInteriorEdges ?? 0.05;
  const cvScore = atLeast(s.profileCV, minCV * 0.5, minCV * 1.6);
  const fillScore = atMost(s.boxFill, maxFill + 0.18, maxFill);
  const edgeScore = atLeast(s.interiorEdgeDensity, minEdges * 0.35, minEdges);
  const worstEdgeScore = atLeast(s.worstInteriorEdgeDensity, minEdges * 0.25, minEdges * 0.8);
  return ev(
    0.28 * cvScore + 0.2 * fillScore + 0.34 * edgeScore + 0.18 * worstEdgeScore,
    `profileCV ${s.profileCV} (min ${minCV}), boxFill ${s.boxFill} (max ${maxFill}), interior edge density ${s.interiorEdgeDensity} (min ${minEdges}), worst view ${s.worstInteriorEdgeDensity}`,
  );
}

export function scoreDetailScale(m, spec) {
  const req = spec.detail ?? {};
  const minSmall = req.minSmallShare ?? 0.2;
  const minBuckets = req.minBuckets ?? 3;
  const sh = m.scale.shares;
  const smallScore = atLeast(sh.small, minSmall * 0.35, minSmall);
  const bucketScore = m.scale.occupiedBuckets >= minBuckets ? 1 : m.scale.occupiedBuckets / minBuckets;
  const spreadScore = atLeast(m.scale.entropy, 0.25, 0.7);
  return ev(
    0.4 * smallScore + 0.35 * bucketScore + 0.25 * spreadScore,
    `scale shares large ${round(sh.large, 2)} / medium ${round(sh.medium, 2)} / small ${round(sh.small, 2)} (small min ${minSmall}), ${m.scale.occupiedBuckets}/3 buckets occupied, entropy ${round(m.scale.entropy, 2)}`,
  );
}

/**
 * The origin-bug detector: grey + Plastic + nothing chosen.
 *
 * Deliberately NOT weighted on saturation, because a stone fountain or a marble monument is
 * legitimately desaturated and penalising that would teach the builder to paint props purple.
 * What it measures is whether anyone made a decision: parts left on the engine default, and how
 * many perceptibly distinct colours exist across the build.
 */
export function scoreFactoryDefault(m) {
  const s = m.surface;
  const factory = atMost(s.factoryShare, 0.5, 0.1);
  const grey = atMost(s.greyShare, 0.9, 0.5);
  const variety = atLeast(s.distinctColours, 1, 6);
  return ev(
    0.5 * factory + 0.2 * grey + 0.3 * variety,
    `${round(s.factoryShare * 100, 1)}% of parts are default-grey Plastic, ${round(s.greyShare * 100, 1)}% are greyscale, ${s.distinctColours} distinct colours, mean saturation ${round(s.meanSaturation, 3)}`,
  );
}

export function scoreMaterialIntent(m, spec, suite) {
  const s = m.surface;
  const wanted = spec.materialFamilies ?? [];
  const used = materialFamilies(s.materialCounts, suite.materialFamilies ?? {});
  const overlap = wanted.length ? wanted.filter((f) => used.includes(f)).length / wanted.length : 1;
  const count = atLeast(s.distinctMaterials, 1, spec.minMaterials ?? 3);
  const nonDefault = 1 - s.materialCounts.filter((mc) => DEFAULT_MATERIALS.has(mc.material)).reduce((a, mc) => a + mc.count, 0) / (m.parts || 1);
  return ev(
    0.4 * count + 0.35 * overlap + 0.25 * clamp01(nonDefault / 0.6),
    `${s.distinctMaterials} distinct materials [${s.materialCounts.slice(0, 5).map((x) => `${x.material}x${x.count}`).join(' ')}], families used [${used.join(', ') || 'none'}] vs expected [${wanted.join(', ') || 'any'}]`,
  );
}

export function scoreProportion(m, spec) {
  const band = spec.archetype?.aspect ?? [0.3, 4];
  const aspectScore = bandScore(m.aspect, band, (band[1] - band[0]) * 0.6);
  // A prop whose plan is a long thin rectangle when the noun is radial (fountain, trophy) is
  // wrong even when the height is right, hence footprintRatio carries weight of its own.
  const fpBand = spec.archetype?.footprintRatio ?? [0.25, 1];
  const fpScore = bandScore(m.footprintRatio, fpBand, 0.35);
  return ev(0.65 * aspectScore + 0.35 * fpScore, `aspect ${m.aspect} vs ${JSON.stringify(band)}, footprintRatio ${m.footprintRatio} vs ${JSON.stringify(fpBand)}`);
}

/**
 * Gameplay-distance readability. Re-rendered at 96x60 — the same scene through a third of the
 * pixels. A shape carried entirely by fine trim vanishes; a shape carried by silhouette survives.
 * Contrast is included because a prop the same value as its background is unreadable however
 * well modelled, and the flat-Lambert rasteriser can measure exactly that and nothing more.
 */
export function scoreReadability(m, spec) {
  const minCV = (spec.silhouette?.minProfileCV ?? 0.12) * 0.7;
  const cvScore = atLeast(m.distant.profileCV, minCV * 0.4, minCV);
  const contrastScore = atLeast(m.distant.contrast, 6, 22);
  // The outer profile is scale-invariant and survives any downsample, so it says nothing about
  // distance. What dies at 96x60 is the structure INSIDE the outline. A prop whose interest is
  // carried by fine trim goes to mush; a prop whose interest is carried by massing does not.
  const surviving = m.distant.interiorEdgeDensity;
  const minEdges = (spec.silhouette?.minInteriorEdges ?? 0.05) * 0.6;
  const survivalScore = atLeast(surviving, minEdges * 0.3, minEdges);
  return ev(
    0.25 * cvScore + 0.25 * contrastScore + 0.5 * survivalScore,
    `at 96x60: profileCV ${m.distant.profileCV} (min ${round(minCV, 3)}), figure-ground contrast ${m.distant.contrast}, surviving interior edge density ${surviving} (min ${round(minEdges, 4)})`,
  );
}

/**
 * Part count against the form it buys. Two-sided on purpose: four boxes cannot be a trophy, and
 * 400 identical tiles are not detail either. The measured quantity is silhouette complexity per
 * part, so "add more parts" is not a way to pass.
 */
export function scoreEfficiency(m, spec) {
  const band = spec.partBudget ?? [12, 160];
  const inBand = bandScore(m.parts, band, Math.max(band[0], 20));
  const yieldPerPart = m.silhouette.profileCV / Math.log2(m.parts + 1);
  const spamPenalty = m.parts > band[1] && m.silhouette.profileCV < (spec.silhouette?.minProfileCV ?? 0.12) ? 0 : 1;
  return ev(
    0.6 * inBand + 0.4 * spamPenalty * clamp01(yieldPerPart / 0.045),
    `${m.parts} parts vs budget ${JSON.stringify(band)}, silhouette yield ${round(yieldPerPart, 4)} profileCV per log2(part)`,
  );
}

export const SCORERS = {
  archetype: (m, spec) => scoreArchetype(m, spec),
  silhouette: (m, spec) => scoreSilhouette(m, spec),
  detail_scale: (m, spec) => scoreDetailScale(m, spec),
  factory_default: (m) => scoreFactoryDefault(m),
  material_intent: (m, spec, suite) => scoreMaterialIntent(m, spec, suite),
  proportion: (m, spec) => scoreProportion(m, spec),
  readability: (m, spec) => scoreReadability(m, spec),
  efficiency: (m, spec) => scoreEfficiency(m, spec),
};

// ---------------------------------------------------------------------------------------------
// Hard fails — measured conditions that cap the total below the pass mark whatever else is true
// ---------------------------------------------------------------------------------------------

export function detectHardFails(m, spec) {
  const fails = [];
  const s = m.surface;
  const add = (id, detail) => fails.push({ id, detail });

  if (s.factoryShare >= 0.5) add('factory-default-parts', `${round(s.factoryShare * 100, 1)}% of ${m.parts} parts are default-grey Plastic`);
  if (s.distinctMaterials <= 1) add('single-material', `all ${m.parts} parts are ${s.materialCounts[0]?.material ?? 'unknown'}: 1 distinct material`);
  if (s.distinctColours <= 2 && s.meanSaturation < 0.15) add('no-colour-choice', `${s.distinctColours} distinct colours at mean saturation ${round(s.meanSaturation, 3)}`);
  const minSmall = spec.detail?.minSmallShare ?? 0.2;
  if (m.scale.shares.small < minSmall * 0.35) add('no-small-detail', `small-scale parts are ${round(m.scale.shares.small * 100, 1)}% of the build, floor is ${round(minSmall * 35, 1)}%`);
  // Every part the same size is the defect whichever bucket they all land in. Caught separately
  // from no-small-detail because `equalise` on a large prop puts every part in the SMALL bucket,
  // which satisfies the small-detail floor while having no hierarchy at all — measured on
  // fountain-equalised, which passed the gate until this check existed.
  if (m.scale.entropy < 0.3) add('no-scale-hierarchy', `scale entropy ${round(m.scale.entropy, 2)}: ${m.scale.occupiedBuckets}/3 size buckets occupied, so every part is effectively one size`);
  const minCV = spec.silhouette?.minProfileCV ?? 0.12;
  if (m.silhouette.profileCV < minCV * 0.5) add('box-silhouette', `mean profileCV ${m.silhouette.profileCV} is below half the ${minCV} the archetype needs`);
  if (m.silhouette.boxFill > (spec.silhouette?.maxBoxFill ?? 0.72) + 0.15) add('slab-silhouette', `silhouette fills ${round(m.silhouette.boxFill * 100, 1)}% of its bounding box`);
  if (m.distant.contrast < 6) add('unreadable-at-distance', `figure-ground contrast ${m.distant.contrast} at 96x60`);
  const budget = spec.partBudget ?? [12, 160];
  if (m.parts < Math.max(4, budget[0] * 0.5)) add('part-starved', `${m.parts} parts against a budget floor of ${budget[0]}`);
  // Over budget is only a fail when the extra parts bought nothing: entropy below 0.45 means
  // essentially every part landed in one size bucket, which is what "300 identical tiles" looks
  // like. Measured: every positive control sits at 0.62-0.98, every part-spam fixture at 0.17-0.38.
  if (m.parts > budget[1] && m.scale.entropy < 0.45) add('part-spam', `${m.parts} parts over a budget ceiling of ${budget[1]} with scale entropy ${round(m.scale.entropy, 2)} — the parts are all one size`);
  return fails;
}

// ---------------------------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------------------------

export function weightedTotal(scores) {
  let total = 0;
  let weight = 0;
  for (const s of SCORED_SIGNALS) {
    if (!(s.id in scores)) continue;
    total += scores[s.id].score * s.weight;
    weight += s.weight;
  }
  return weight > 0 ? total / weight : 0;
}

export function gradeProp(scene, spec, suite, opts = {}) {
  const m = opts.measured ?? measureProp(scene, opts);
  const scores = {};
  for (const s of SCORED_SIGNALS) scores[s.id] = SCORERS[s.id](m, spec, suite);
  const raw = weightedTotal(scores);
  const hardFails = detectHardFails(m, spec);
  const total = hardFails.length ? Math.min(raw, GATE.hardFailCap) : raw;
  return {
    prop: spec.id,
    scene: scene.name ?? spec.id,
    measured: m,
    scores,
    rawTotal: round(raw, 3),
    total: round(total, 3),
    hardFails,
    passed: hardFails.length === 0 && total >= GATE.passThreshold,
    // named for the critic: what a model still has to judge that no number here covers
    modelSignalsOutstanding: SIGNALS.filter((s) => !s.deterministic).map((s) => s.id),
  };
}

export function formatPropReport(g) {
  const lines = [
    `${g.passed ? 'PASS' : 'FAIL'}  ${g.prop}  ${g.total.toFixed(3)} / ${GATE.passThreshold} (raw ${g.rawTotal.toFixed(3)})`,
    `  ${g.measured.parts} parts, bounds ${g.measured.boundsSize.join(' x ')} studs`,
  ];
  for (const s of SCORED_SIGNALS) {
    const r = g.scores[s.id];
    lines.push(`  ${r.score.toFixed(2)}  ${s.id.padEnd(16)} w=${s.weight}  ${r.evidence}`);
  }
  if (g.hardFails.length) {
    lines.push('  HARD FAILS (total capped at ' + GATE.hardFailCap + '):');
    for (const f of g.hardFails) lines.push(`    - ${f.id}: ${f.detail}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
  }
  return out;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const suite = loadSuite();
  if (args.suite) {
    const { buildSuiteFixtures } = await import(join(PROPS_DIR, 'build-fixtures.mjs'));
    const rows = [];
    for (const f of buildSuiteFixtures()) {
      const spec = getPropSpec(suite, f.prop);
      const g = gradeProp(f.scene, spec, suite);
      rows.push({ id: f.id, expect: f.expect, pass: g.passed, total: g.total, fails: g.hardFails.map((x) => x.id).join(',') });
    }
    const wrong = rows.filter((r) => (r.expect === 'pass') !== r.pass);
    for (const r of rows) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${(r.expect === 'pass') === r.pass ? '  ' : '<<'} ${r.id.padEnd(28)} ${r.total.toFixed(3)}  ${r.fails}`);
    }
    console.log(`\n${rows.length - wrong.length}/${rows.length} fixtures graded as labelled`);
    process.exit(wrong.length ? 1 : 0);
  }
  if (!args.scene || !args.prop) {
    console.error('usage: node src/props.mjs --scene <scene.json> --prop <prop-id>   |   node src/props.mjs --suite');
    process.exit(2);
  }
  const scene = loadJson(args.scene);
  console.log(formatPropReport(gradeProp(scene, getPropSpec(suite, args.prop), suite)));
}
