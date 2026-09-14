// BUILD AUDIT — the adversarial critic, run on geometry, for free.
//
// critic.ts is 909 lines of six-lens adversarial panel with evidence rules, an adjudicator and a
// regression format. Nothing in apps/worker has ever imported it. Its only consumers are
// packages/evals, so the product has never once run the check it built to decide whether a build is
// any good.
//
// WHY IT COULD NOT BE WIRED, AND WHAT THAT DICTATES HERE.
// `runCriticPanel` is driven by `CriticInput.metrics`, and `REFERENCED_METRICS` names eighteen of
// them. Five are derived from pixels (faceValueSpread, figureGroundContrast, distantContrast,
// distantCoverage, distantInteriorEdgeDensity) and need a render. Twelve are derived from geometry
// and need nothing but a walk of the Workspace. Nobody had written the producer for either set —
// composition.ts measures a DIFFERENT vocabulary (volumeGini, massHierarchy, footprintOccupancy)
// that no critic rule cites.
//
// THE TRAP, AND THE REASON THIS MODULE REPORTS COVERAGE.
// `applyMetricRules` skips any rule whose metric is undefined:
//     const v = input.metrics[r.metric];
//     if (v === undefined || !Number.isFinite(v)) continue;
// So handing the panel a partial metric set does not fail — it silently runs fewer checks and
// returns a shorter defect list, which is indistinguishable from a clean build. A lens that did not
// run must never be reported as a lens that found nothing. Everything below exists to make that
// distinction explicit: this module runs only the lenses whose every rule it can feed, and states
// which rules were not evaluated and why.
//
// The three geometry lenses cost zero neurons: no judge is passed, so `runCriticPanel` takes the
// deterministic path for each and no model is called at all.
import { normEntropy } from './composition';
import type { CriticInput, LensId } from './critic';
import { COMPOSITION_RULES, ROBLOX_RULES, TECHNICAL_ART_RULES, LIGHTING_RULES, READABILITY_RULES } from './critic';

/** One part as the audit pass reports it. */
export interface AuditPart {
  pos: [number, number, number];
  size: [number, number, number];
  material: string;
  color: [number, number, number];
  anchored: boolean;
  transparency: number;
}

export interface AuditCapture {
  parts: AuditPart[];
  /** True when the place held more parts than the pass was willing to walk. */
  truncated: boolean;
  /** How many parts the place actually has. Larger than `parts.length` when truncated. */
  total: number;
  lighting?: CriticInput['lighting'];
}

/**
 * The measurement pass.
 *
 * Compact on purpose: this comes back through a tool result, and a per-part JSON object with named
 * keys costs about four times the bytes of a positional row for the same information. The material
 * legend is emitted once and indexed rather than repeated per part.
 *
 * `isDefault` is decided on the presence of a lighting pass, not on numeric equality with Roblox's
 * property defaults. Effect instances are the robust signal — a place that has had any lighting
 * work has an Atmosphere or a post-effect — whereas hard-coding Brightness and ClockTime defaults
 * would silently stop detecting an untouched place the day Roblox changes one of them.
 */
export const AUDIT_LUAU = `
local L = game:GetService("Lighting")
local mats, matIdx, out, n = {}, {}, {}, 0
for _, d in ipairs(game.Workspace:GetDescendants()) do
	if d:IsA("BasePart") and d.Transparency < 0.95 then
		n += 1
		if n <= 1500 then
			local m = d.Material.Name
			if not matIdx[m] then
				table.insert(mats, m)
				matIdx[m] = #mats
			end
			local c = d.Color
			out[#out + 1] = string.format("[%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d,%d,%d,%d,%d,%.2f]",
				d.Position.X, d.Position.Y, d.Position.Z,
				d.Size.X, d.Size.Y, d.Size.Z,
				matIdx[m],
				math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5),
				d.Anchored and 1 or 0, d.Transparency)
		end
	end
end
local fx, touched = {}, 0
for _, child in ipairs(L:GetChildren()) do
	if child:IsA("Atmosphere") or child:IsA("PostEffect") then
		table.insert(fx, child.ClassName)
		touched += 1
	end
end
local q = function(s) return '"' .. s .. '"' end
local qm = {}
for _, m in ipairs(mats) do table.insert(qm, q(m)) end
local qf = {}
for _, f in ipairs(fx) do table.insert(qf, q(f)) end
return "{\\"mats\\":[" .. table.concat(qm, ",") .. "],\\"n\\":" .. n
	.. ",\\"parts\\":[" .. table.concat(out, ",") .. "]"
	.. ",\\"lighting\\":{\\"brightness\\":" .. string.format("%.3f", L.Brightness)
	.. ",\\"clockTime\\":" .. string.format("%.3f", L.ClockTime)
	.. ",\\"ambient\\":[" .. string.format("%d,%d,%d", math.floor(L.Ambient.R * 255 + 0.5), math.floor(L.Ambient.G * 255 + 0.5), math.floor(L.Ambient.B * 255 + 0.5))
	.. "],\\"lightInstances\\":" .. tostring(#L:GetChildren())
	.. ",\\"effects\\":[" .. table.concat(qf, ",") .. "]"
	.. ",\\"touched\\":" .. tostring(touched) .. "}}"
`;

/** Unwrap whatever `run_code` nested the value in, then parse. Mirrors composition.parseLayout. */
export function parseAudit(raw: unknown): AuditCapture | null {
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
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const mats = Array.isArray(o.mats) ? (o.mats as unknown[]).map(String) : [];
  const rows = Array.isArray(o.parts) ? (o.parts as unknown[]) : [];
  const parts: AuditPart[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 12 || !r.every((v) => typeof v === 'number')) continue;
    const t = r as number[];
    parts.push({
      pos: [t[0]!, t[1]!, t[2]!],
      size: [t[3]!, t[4]!, t[5]!],
      material: mats[t[6]! - 1] ?? 'Unknown',
      color: [t[7]!, t[8]!, t[9]!],
      anchored: t[10] === 1,
      transparency: t[11]!,
    });
  }
  const lr = o.lighting as Record<string, unknown> | undefined;
  let lighting: CriticInput['lighting'];
  if (lr && typeof lr === 'object') {
    const amb = Array.isArray(lr.ambient) ? (lr.ambient as number[]) : [0, 0, 0];
    const touched = Number(lr.touched ?? 0);
    lighting = {
      brightness: Number(lr.brightness ?? 0),
      clockTime: Number(lr.clockTime ?? 0),
      ambient: [amb[0] ?? 0, amb[1] ?? 0, amb[2] ?? 0],
      lightInstances: Number(lr.lightInstances ?? 0),
      effects: Array.isArray(lr.effects) ? (lr.effects as unknown[]).map(String) : [],
      isDefault: touched === 0,
    };
  }
  const n = Number(o.n ?? parts.length);
  return { parts, truncated: n > parts.length, total: Number.isFinite(n) ? n : parts.length, lighting };
}

// --- metrics -------------------------------------------------------------------------------------

/** Roblox's factory part: Plastic, and the grey every new Part is born with. */
const DEFAULT_GREY: [number, number, number] = [163, 162, 165];
const GREY_TOLERANCE = 6; // per-channel, so a deliberately near-grey choice is not called a default

/** Euclidean distance in 0-255 RGB. Crude next to a perceptual space, and enough to separate
 *  "someone chose this" from "nobody chose anything". */
function rgbDist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

/** Colours a person would call different. Greedy clustering at a perceptible radius: two colours
 *  inside it are one colour decision, not two. */
export function distinctColourCount(colours: readonly (readonly number[])[], radius = 40): number {
  const reps: (readonly number[])[] = [];
  for (const c of colours) {
    if (!reps.some((r) => rgbDist(r, c) < radius)) reps.push(c);
  }
  return reps.length;
}

/**
 * Pairs of axis-aligned faces that are exactly coplanar AND overlap in the other two axes.
 *
 * Exactly, not approximately: z-fighting is what happens when two surfaces occupy the same plane,
 * and a deliberate 0.01-stud offset — which is the fix the rule recommends — must not be reported
 * as a defect. O(n^2), so it is capped; above the cap the metric is withheld rather than estimated,
 * because a rule that fires on a guess is exactly what critic.ts refuses to contain.
 */
export function coincidentFacePairs(parts: AuditPart[], cap = 400): number | undefined {
  if (parts.length > cap) return undefined;
  let pairs = 0;
  const lo = (p: AuditPart, ax: number) => p.pos[ax]! - p.size[ax]! / 2;
  const hi = (p: AuditPart, ax: number) => p.pos[ax]! + p.size[ax]! / 2;
  const overlaps = (a: AuditPart, b: AuditPart, ax: number) =>
    Math.min(hi(a, ax), hi(b, ax)) - Math.max(lo(a, ax), lo(b, ax)) > 1e-4;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!, b = parts[j]!;
      for (let ax = 0; ax < 3; ax++) {
        const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
        if (!overlaps(a, b, o1) || !overlaps(a, b, o2)) continue;
        // a's high face against b's low face, and the reverse.
        if (Math.abs(hi(a, ax) - lo(b, ax)) < 1e-6 || Math.abs(hi(b, ax) - lo(a, ax)) < 1e-6) { pairs++; break; }
        // both faces on the same plane (stacked identically) counts too.
        if (Math.abs(hi(a, ax) - hi(b, ax)) < 1e-6 && Math.abs(lo(a, ax) - lo(b, ax)) < 1e-6) { pairs++; break; }
      }
    }
  }
  return pairs;
}

/** Every geometry-derived metric critic.ts can cite. A metric that cannot be measured is OMITTED,
 *  never defaulted to zero — zero is a value a rule will act on. */
export function auditMetrics(cap: AuditCapture): Record<string, number> {
  const parts = cap.parts;
  const m: Record<string, number> = {};
  if (parts.length === 0) return m;

  // THE TRUE TOTAL, not the sample size. The pass walks every part to count them and only emits
  // the first 1500; reporting the sample as the part count understates a big place by any amount.
  m.partCount = cap.total > 0 ? cap.total : parts.length;

  // A COUNT OVER A SAMPLE CANNOT PROVE AN ABSENCE. `unanchoredParts` feeds a blocking rule that
  // fires when it is above zero, and a zero drawn from the first 1500 parts of a 4000-part place
  // says nothing about the other 2500 — which is exactly where parts added late, and so most likely
  // to be unanchored, will be. Reported when it found something, because a positive from a sample
  // is still conclusive; omitted when it found nothing, because that is the case it cannot support.
  // This is the same withholding coincidentFacePairs already does above its own cap, in the place
  // it was missing.
  const unanchored = parts.filter((p) => !p.anchored).length;
  if (unanchored > 0 || !cap.truncated) m.unanchoredParts = unanchored;
  m.distinctMaterials = new Set(parts.map((p) => p.material)).size;
  m.distinctColours = distinctColourCount(parts.map((p) => p.color));
  m.factoryDefaultShare =
    parts.filter((p) => p.material === 'Plastic' && rgbDist(p.color, DEFAULT_GREY) <= GREY_TOLERANCE).length / parts.length;

  const maxDim = (p: AuditPart) => Math.max(p.size[0], p.size[1], p.size[2]);
  m.tinyPartShare = parts.filter((p) => maxDim(p) < 0.2).length / parts.length;

  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, p.pos[a]! - p.size[a]! / 2);
      hi[a] = Math.max(hi[a]!, p.pos[a]! + p.size[a]! / 2);
    }
  }
  const span = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
  m.heightStuds = Math.max(0, span[1]!);

  // "roughly a tenth of the object size" — the rule's own words for what detail scale means.
  const objectScale = Math.max(span[0]!, span[1]!, span[2]!);
  if (objectScale > 0) {
    const detail = objectScale / 10;
    m.smallPartShare = parts.filter((p) => maxDim(p) <= detail).length / parts.length;
  }

  const volumes = parts.map((p) => Math.max(1e-6, p.size[0] * p.size[1] * p.size[2]));
  m.scaleEntropy = normEntropy(volumes);

  const boxVolume = Math.max(1e-6, span[0]! * span[1]! * span[2]!);
  m.boxFill = Math.min(1, volumes.reduce((a, b) => a + b, 0) / boxVolume);

  // profileCV — how much the silhouette's width varies up its height. A tower of identical width
  // has a CV near zero, which is the rule's "the outline carries no information".
  const BANDS = 12;
  if (span[1]! > 1e-6) {
    const widths = new Array<number>(BANDS).fill(0);
    for (let b = 0; b < BANDS; b++) {
      const y0 = lo[1]! + (span[1]! * b) / BANDS;
      const y1 = lo[1]! + (span[1]! * (b + 1)) / BANDS;
      let bLo = Infinity, bHi = -Infinity;
      for (const p of parts) {
        const pLo = p.pos[1]! - p.size[1]! / 2, pHi = p.pos[1]! + p.size[1]! / 2;
        if (pHi < y0 || pLo > y1) continue;
        bLo = Math.min(bLo, p.pos[0]! - p.size[0]! / 2);
        bHi = Math.max(bHi, p.pos[0]! + p.size[0]! / 2);
      }
      widths[b] = bHi > bLo ? bHi - bLo : 0;
    }
    const occupied = widths.filter((w) => w > 0);
    if (occupied.length >= 2) {
      const mean = occupied.reduce((a, b) => a + b, 0) / occupied.length;
      if (mean > 1e-6) {
        const variance = occupied.reduce((a, w) => a + (w - mean) ** 2, 0) / occupied.length;
        m.profileCV = Math.sqrt(variance) / mean;
      }
    }
  }

  const pairs = coincidentFacePairs(parts);
  if (pairs !== undefined) m.coincidentFacePairs = pairs;
  if (cap.lighting) m.lightingTouchedProperties = cap.lighting.isDefault ? 0 : 1;

  return m;
}

// --- coverage ------------------------------------------------------------------------------------

const RULES_BY_LENS: Record<string, { metric: string }[]> = {
  composition: COMPOSITION_RULES,
  roblox_level_design: ROBLOX_RULES,
  technical_art: TECHNICAL_ART_RULES,
  lighting: LIGHTING_RULES,
  gameplay_readability: READABILITY_RULES,
};

/**
 * Lenses that carry a deterministic check which needs NO metric.
 *
 * Only one does. `runDeterministicLens('lighting', …)` returns its metric-rule criticisms PLUS
 * `lightingConfigCriticisms(input)`, which reads the plugin's Lighting report — configuration data,
 * not pixels — and raises the single most actionable art-direction defect there is: every Lighting
 * property is still the Roblox default, so no lighting decision exists to judge.
 *
 * Gating that lens out because two of its sibling rules need a render suppressed the one check in
 * it that was always available. The value stated here is what a caller loses by skipping it.
 */
const LENS_NON_METRIC_CHECK: Partial<Record<LensId, string>> = {
  lighting: 'the Lighting configuration report, which is data rather than pixels',
};

export type CoverageStatus = 'complete' | 'partial' | 'none';

export interface LensCoverage {
  lens: LensId;
  status: CoverageStatus;
  /** true only when every rule in this lens had its metric measured */
  complete: boolean;
  /** metrics this lens needed and did not get */
  missing: string[];
  /** why a `partial` lens is still worth running */
  partialBecause?: string;
}

/**
 * Which lenses can be run honestly against this metric set, in three states rather than two.
 *
 * The original rule here was: run a lens only when EVERY rule can be evaluated, because a lens with
 * some rules silently skipped returns a short defect list that reads exactly like a clean result.
 * That was right about the danger and wrong about the remedy, and it cost a real check.
 *
 * `applyMetricRules` no longer skips silently — a rule whose metric is missing is reported on
 * `PanelResult.unchecked`. So "partial" is now a state that can be REPORTED rather than one that
 * has to be avoided, and the honest rule becomes: run a lens when it can check SOMETHING, and say
 * exactly what it could not check.
 *
 *   complete  every rule ran
 *   partial   some rules ran, or a non-metric check ran; the rest are named
 *   none      nothing in this lens could run at all, so running it would report an empty silence
 */
export function lensCoverage(metrics: Record<string, number>): LensCoverage[] {
  return Object.entries(RULES_BY_LENS).map(([name, rules]) => {
    const lens = name as LensId;
    const needed = [...new Set(rules.map((r) => r.metric))];
    const missing = needed.filter((k) => !Number.isFinite(metrics[k])).sort();
    const ranSome = missing.length < needed.length;
    const nonMetric = LENS_NON_METRIC_CHECK[lens];

    if (missing.length === 0) return { lens, status: 'complete' as const, complete: true, missing };
    if (ranSome || nonMetric) {
      return {
        lens,
        status: 'partial' as const,
        complete: false,
        missing,
        partialBecause: ranSome ? 'some of its rules had their metrics' : nonMetric,
      };
    }
    return { lens, status: 'none' as const, complete: false, missing };
  });
}

/**
 * The lenses to hand `runCriticPanel`.
 *
 * Everything that can check something. A lens in `none` is excluded deliberately: running it would
 * add nothing to the verdict and would let "5 lenses run" stand for a lens that examined nothing.
 */
export function runnableLenses(metrics: Record<string, number>): LensId[] {
  return lensCoverage(metrics).filter((c) => c.status !== 'none').map((c) => c.lens);
}
