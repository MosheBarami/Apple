// ADVERSARIAL VISUAL CRITIC — a panel of prosecutors, not a panel of reviewers.
//
// THE FAILURE THIS REPLACES.
// vision.ts asks one vision model "critique this scene". The measured failure mode is agreeable
// vague praise: the model says the build is "solid overall, could use more detail", which is true
// of literally every build ever made, cannot be acted on, cannot be regression-tested, and lets a
// grey blockout through. Asking the same model more nicely does not fix it. The structure of the
// question is what is wrong: a reviewer asked for a balanced opinion produces a balanced opinion.
//
// THE DESIGN.
//   1. SEVERAL LENSES, EACH ADVERSARIAL. Six independent critics, each with a narrow mandate and
//      an explicit instruction to PROVE THE SCENE IS BAD. None of them is asked what is good.
//      A lens that finds nothing returns nothing; that is a valid outcome, not a failure.
//   2. EVIDENCE OR IT DID NOT HAPPEN. Every criticism must carry one of three evidence kinds:
//        region   a named box in a named view — "the top-left quadrant of `front`"
//        measure  a metric the HARNESS measured, its value, and the threshold it violates. The
//                 stated value is checked against the harness's own number: a critic cannot
//                 invent a measurement to justify a feeling.
//        missing  a named element from the request, plus the views that were searched for it
//      A criticism with no evidence, unverifiable evidence, or evidence pointing at the whole
//      frame is DISCARDED BEFORE ADJUDICATION. It cannot influence the verdict at all.
//   3. ADJUDICATION, NOT VOTING. A defect is CONFIRMED only when it is either backed by a
//      verified measurement, or raised by `quorum` different lenses citing DIFFERENT evidence.
//      Two critics saying "it looks unfinished" with no distinct evidence is one vague opinion
//      repeated, not corroboration, and the rule is written so it cannot be counted as such.
//   4. CONFIRMED DEFECTS BECOME REGRESSION DATA. Each one serialises to a record carrying the
//      assertion a future run must satisfy for the defect to count as fixed. The harness writes
//      them out automatically (packages/evals/src/critic.mjs).
//
// WHAT THE RENDERER CAN AND CANNOT SHOW — the constraint every lens is designed around.
// Renders come from a hand-written Luau CPU rasteriser: 288x180 by default, 320x240 hard cap,
// flat Lambert, ONE fixed sun direction, no shadows, no PointLights, no post-processing, no
// texture sampling — a material is a brightness multiplier and a roughness number, nothing more.
// Therefore:
//   * NO lens may ask about shadow softness, bounce light, time-of-day mood, specular highlights,
//     bloom, colour grading, or how a material's texture reads. The image contains no evidence
//     for any of it, so any answer is invention.
//   * The lighting lens is restricted to the two things that ARE evidenced: the Lighting
//     CONFIGURATION as reported by the plugin (which is data, not pixels), and value structure —
//     figure-ground luminance separation and whether the form's faces separate in value at all
//     under the one sun. Those are real and measurable. Nothing else is.
//   * At 288x180 a prop occupies a few thousand pixels. Fine ornament is below the sampling
//     limit, so "lacks fine detail" is not a claim the image can support; the detail lenses work
//     from geometry instead, and the readability lens works from a deliberate 96x60 downsample.
//
// DETERMINISTIC VS MODEL-DEPENDENT.
// Five of the six lenses are fully deterministic: they read measured numbers and emit criticisms
// with `measure` evidence. They cost nothing, run in CI, and are the reason the whole pipeline is
// testable against fixtures with no model call. Only `request_fidelity` needs a model, because
// "does this look like what was asked for" is not a geometric question. Any lens can additionally
// be run through a model by supplying a `judge`; the model's output goes through exactly the same
// evidence gate as everything else.

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type LensId =
  | 'composition'
  | 'roblox_level_design'
  | 'technical_art'
  | 'lighting'
  | 'gameplay_readability'
  | 'request_fidelity';

export type Severity = 'minor' | 'major' | 'blocking';

export const SEVERITY_ORDER: Record<Severity, number> = { minor: 1, major: 2, blocking: 3 };

export type Comparator = '<' | '<=' | '>' | '>=';

/** A box in normalised frame coordinates: [x, y, w, h], each 0-1, origin top-left. */
export type Box = [number, number, number, number];

export type Evidence =
  | { kind: 'region'; view: string; box: Box; note?: string }
  | { kind: 'measure'; metric: string; value: number; comparator: Comparator; threshold: number }
  | { kind: 'missing'; element: string; searchedIn: string[] };

export interface Criticism {
  lens: LensId;
  /** WHAT is wrong, as a stable identifier. Defects group by this, so two lenses must name the
   *  same subject the same way to corroborate each other. Free-form prose cannot do that. */
  subject: string;
  claim: string;
  severity: Severity;
  evidence: Evidence;
  /** what to change. Optional: a critic that cannot say how to fix it may still be right. */
  fix?: string;
}

export interface DiscardedCriticism {
  criticism: Criticism;
  reason: string;
}

export interface ConfirmedDefect {
  id: string;
  subject: string;
  severity: Severity;
  /** the lenses that raised it, deduplicated */
  lenses: LensId[];
  confirmedBy: 'measurement' | 'quorum';
  claims: string[];
  evidence: Evidence[];
  fixes: string[];
}

export interface Adjudication {
  confirmed: ConfirmedDefect[];
  /** survived the evidence gate but not the adjudication rule — reported, never acted on */
  unconfirmed: { subject: string; lenses: LensId[]; reason: string }[];
  /** failed the evidence gate. The count is the flattery/hallucination rate, and it is reported
   *  rather than hidden, because a run where 90% of criticisms were discarded is a signal. */
  discarded: DiscardedCriticism[];
  stats: { raised: number; accepted: number; discarded: number; confirmed: number };
}

/** Everything a lens is allowed to reason from. If it is not in here, there is no evidence for it. */
export interface CriticInput {
  /** the user's request, verbatim */
  intent: string;
  subject: 'prop' | 'scene';
  /** the views that were actually rendered, with their real pixel dimensions */
  views: { name: string; width: number; height: number }[];
  /**
   * Every metric the harness measured, keyed by name. This is the ground truth a `measure`
   * evidence is checked against — the single most important field in this interface, because it
   * is what makes "cite a number" enforceable rather than decorative.
   */
  metrics: Record<string, number>;
  /** Lighting as REPORTED by the plugin. Configuration data, never inferred from the image. */
  lighting?: {
    brightness: number;
    clockTime: number;
    ambient: [number, number, number];
    lightInstances: number;
    effects: string[];
    /** true when every value above is still the Roblox default */
    isDefault: boolean;
  };
  /** Elements named in the request. `missing` evidence must name one of these. */
  requestedElements?: string[];
}

/** A model call, injected so the critic has no dependency on the gateway and tests need no network. */
export type Judge = (args: { lens: LensId; system: string; user: string }) => Promise<string>;

export interface AdjudicationRule {
  /** how many DIFFERENT lenses must independently raise a subject for it to be confirmed without
   *  a verified measurement */
  quorum: number;
  /** a criticism whose measurement the harness itself confirms is enough on its own */
  measureBacksAlone: boolean;
  /** criticisms below this severity are recorded but never confirmed */
  minSeverity: Severity;
  /** two criticisms only corroborate when their evidence differs. Off, and a critic that echoes
   *  another critic's exact citation would manufacture a quorum by agreeing. */
  requireDistinctEvidence: boolean;
  /** a region citation covering more than this fraction of the frame is not pointing at anything */
  maxRegionArea: number;
  /** tolerance when checking a cited value against the harness's own measurement */
  measureTolerance: number;
}

export const DEFAULT_RULE: AdjudicationRule = {
  quorum: 2,
  measureBacksAlone: true,
  minSeverity: 'major',
  requireDistinctEvidence: true,
  maxRegionArea: 0.6,
  measureTolerance: 0.02,
};

// ---------------------------------------------------------------------------------------------
// The evidence gate
// ---------------------------------------------------------------------------------------------

/** Hedges that turn a criticism into an opinion. A claim made entirely of these says nothing a
 *  builder can act on and nothing a future run can regression-test. Heuristic by nature — it is a
 *  filter on prose, and it is deliberately narrow so it cannot swallow a real finding. */
export const VAGUE_PATTERNS = [
  /\b(?:could|might|may)\s+(?:be|use|benefit|improve)/i,
  /\b(?:somewhat|slightly|a bit|a little|fairly|generally|overall)\b.*\b(?:better|nicer|improved|lacking)\b/i,
  /\blooks?\s+(?:fine|okay|ok|good|nice|decent|solid)\b/i,
  /\b(?:needs?|add)\s+more\s+detail\b\s*$/i,
  /\bnot\s+bad\b/i,
];

export function isVagueClaim(claim: string): boolean {
  const c = claim.trim();
  if (c.length < 20) return true;
  return VAGUE_PATTERNS.some((p) => p.test(c));
}

/** A stable string for one piece of evidence, used to decide whether two lenses cited the SAME
 *  thing (agreement) or different things (corroboration). */
export function evidenceFingerprint(e: Evidence): string {
  switch (e.kind) {
    case 'region':
      return `region:${e.view}:${e.box.map((v) => Math.round(v * 20)).join(',')}`;
    case 'measure':
      return `measure:${e.metric}`;
    case 'missing':
      return `missing:${e.element.toLowerCase()}`;
  }
}

/**
 * The gate. Returns null when the criticism is admissible, or the reason it is not.
 *
 * The `measure` branch is the load-bearing one: the cited value must match the harness's own
 * measurement, AND the stated comparison must actually be false against the threshold. A critic
 * that says "coverage 0.9 exceeds the 0.6 limit" when the harness measured 0.31 is discarded, and
 * so is one that cites a real number which does not in fact violate the threshold it names.
 */
export function rejectionReason(c: Criticism, input: CriticInput, rule: AdjudicationRule): string | null {
  if (!c.subject || !c.subject.trim()) return 'no subject: the criticism names nothing that could be corroborated or retested';
  if (!c.claim || isVagueClaim(c.claim)) return `vague claim, nothing actionable: "${c.claim}"`;
  if (!c.evidence) return 'no evidence';
  const viewNames = new Set(input.views.map((v) => v.name));

  switch (c.evidence.kind) {
    case 'region': {
      const { view, box } = c.evidence;
      if (!viewNames.has(view)) return `cites view "${view}", which was not rendered (have: ${[...viewNames].join(', ')})`;
      if (box.length !== 4 || box.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return `region box ${JSON.stringify(box)} is not in normalised frame coordinates`;
      const area = box[2] * box[3];
      if (area <= 0) return 'region box has zero area';
      if (area > rule.maxRegionArea) return `region covers ${Math.round(area * 100)}% of the frame: that is not pointing at anything`;
      return null;
    }
    case 'measure': {
      const { metric, value, comparator, threshold } = c.evidence;
      if (!(metric in input.metrics)) return `cites metric "${metric}", which the harness does not measure`;
      const actual = input.metrics[metric]!;
      if (!Number.isFinite(value)) return `cited value for "${metric}" is not a number`;
      const tol = Math.max(rule.measureTolerance, Math.abs(actual) * rule.measureTolerance);
      if (Math.abs(actual - value) > tol) return `cites ${metric} = ${value} but the harness measured ${actual}`;
      if (!compare(actual, comparator, threshold)) return `${metric} = ${actual} does not satisfy ${comparator} ${threshold}, so the stated violation did not occur`;
      return null;
    }
    case 'missing': {
      const { element, searchedIn } = c.evidence;
      if (!element?.trim()) return 'missing-element evidence names no element';
      if (!searchedIn?.length) return `claims "${element}" is missing without saying which views were searched`;
      const unknown = searchedIn.filter((v) => !viewNames.has(v));
      if (unknown.length) return `searched views that were not rendered: ${unknown.join(', ')}`;
      const wanted = input.requestedElements ?? [];
      if (wanted.length && !wanted.some((w) => w.toLowerCase() === element.toLowerCase())) {
        return `"${element}" was never asked for; a missing thing nobody requested is not a defect`;
      }
      return null;
    }
    default:
      return 'unrecognised evidence kind';
  }
}

function compare(a: number, op: Comparator, b: number): boolean {
  return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
}

// ---------------------------------------------------------------------------------------------
// Adjudication
// ---------------------------------------------------------------------------------------------

function defectId(subject: string, evidence: Evidence[]): string {
  const basis = `${subject}|${evidence.map(evidenceFingerprint).sort().join('|')}`;
  // FNV-1a: short, stable across runs and processes, and no crypto dependency in a Worker.
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `d_${h.toString(16).padStart(8, '0')}`;
}

export function adjudicate(criticisms: Criticism[], input: CriticInput, rule: AdjudicationRule = DEFAULT_RULE): Adjudication {
  const discarded: DiscardedCriticism[] = [];
  const accepted: Criticism[] = [];
  for (const c of criticisms) {
    const reason = rejectionReason(c, input, rule);
    if (reason) discarded.push({ criticism: c, reason });
    else accepted.push(c);
  }

  const groups = new Map<string, Criticism[]>();
  for (const c of accepted) {
    const key = c.subject.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const confirmed: ConfirmedDefect[] = [];
  const unconfirmed: Adjudication['unconfirmed'] = [];

  for (const [subject, group] of groups) {
    const eligible = group.filter((c) => SEVERITY_ORDER[c.severity] >= SEVERITY_ORDER[rule.minSeverity]);
    if (!eligible.length) {
      unconfirmed.push({ subject, lenses: [...new Set(group.map((c) => c.lens))], reason: `all ${group.length} criticism(s) below the ${rule.minSeverity} severity floor` });
      continue;
    }

    const measureBacked = rule.measureBacksAlone && eligible.some((c) => c.evidence.kind === 'measure');

    // Independence: count distinct lenses, and — when required — only those whose evidence is not
    // a duplicate of evidence already counted. This is the clause that stops vague agreement from
    // manufacturing a quorum.
    const seenEvidence = new Set<string>();
    const independentLenses = new Set<LensId>();
    for (const c of eligible) {
      const fp = evidenceFingerprint(c.evidence);
      if (rule.requireDistinctEvidence && seenEvidence.has(fp)) continue;
      seenEvidence.add(fp);
      independentLenses.add(c.lens);
    }
    const quorumMet = independentLenses.size >= rule.quorum;

    if (!measureBacked && !quorumMet) {
      unconfirmed.push({
        subject,
        lenses: [...new Set(eligible.map((c) => c.lens))],
        reason: `raised by ${independentLenses.size} lens(es) with distinct evidence, quorum is ${rule.quorum}, and no verified measurement backs it`,
      });
      continue;
    }

    const evidence = dedupeEvidence(eligible.map((c) => c.evidence));
    const worst = eligible.reduce((a, b) => (SEVERITY_ORDER[b.severity] > SEVERITY_ORDER[a.severity] ? b : a));
    confirmed.push({
      id: defectId(subject, evidence),
      subject,
      severity: worst.severity,
      lenses: [...new Set(eligible.map((c) => c.lens))].sort(),
      confirmedBy: measureBacked ? 'measurement' : 'quorum',
      claims: [...new Set(eligible.map((c) => c.claim))],
      evidence,
      fixes: [...new Set(eligible.map((c) => c.fix).filter((f): f is string => !!f))],
    });
  }

  confirmed.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || a.subject.localeCompare(b.subject));
  return {
    confirmed,
    unconfirmed,
    discarded,
    stats: { raised: criticisms.length, accepted: accepted.length, discarded: discarded.length, confirmed: confirmed.length },
  };
}

function dedupeEvidence(list: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const e of list) {
    const fp = evidenceFingerprint(e);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Regression records
// ---------------------------------------------------------------------------------------------

export interface RegressionRecord {
  id: string;
  recordedAt: string;
  intent: string;
  subject: string;
  severity: Severity;
  lenses: LensId[];
  confirmedBy: 'measurement' | 'quorum';
  claims: string[];
  evidence: Evidence[];
  fixes: string[];
  /**
   * What a future run must show for this defect to count as fixed. A measurement-backed defect
   * gets a machine-checkable assertion — the same metric, with the comparison INVERTED, so
   * re-running the check is unambiguous. A quorum-backed defect cannot get one, and says so
   * rather than pretending: it is filed for a human or a model to re-judge.
   */
  fixedWhen: { kind: 'metric'; metric: string; comparator: Comparator; threshold: number } | { kind: 'manual'; note: string };
}

const INVERSE: Record<Comparator, Comparator> = { '<': '>=', '<=': '>', '>': '<=', '>=': '<' };

export function toRegressionRecords(adj: Adjudication, input: CriticInput, now = new Date()): RegressionRecord[] {
  return adj.confirmed.map((d) => {
    const measure = d.evidence.find((e): e is Extract<Evidence, { kind: 'measure' }> => e.kind === 'measure');
    return {
      id: d.id,
      recordedAt: now.toISOString(),
      intent: input.intent,
      subject: d.subject,
      severity: d.severity,
      lenses: d.lenses,
      confirmedBy: d.confirmedBy,
      claims: d.claims,
      evidence: d.evidence,
      fixes: d.fixes,
      fixedWhen: measure
        ? { kind: 'metric', metric: measure.metric, comparator: INVERSE[measure.comparator], threshold: measure.threshold }
        : { kind: 'manual', note: `re-judge "${d.subject}" against: ${d.claims.join(' / ')}` },
    };
  });
}

/** Newline-delimited JSON: appendable, diffable, and readable one record at a time. */
export function serializeRegression(records: RegressionRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}

/** Re-check a stored record against a fresh measurement set. `null` = not machine-checkable. */
export function isRegressionFixed(record: RegressionRecord, metrics: Record<string, number>): boolean | null {
  if (record.fixedWhen.kind !== 'metric') return null;
  const { metric, comparator, threshold } = record.fixedWhen;
  if (!(metric in metrics)) return null;
  return compare(metrics[metric]!, comparator, threshold);
}

// ---------------------------------------------------------------------------------------------
// The lenses
// ---------------------------------------------------------------------------------------------

/** A rule a deterministic lens applies: one metric, one threshold, one sentence. */
interface MetricRule {
  subject: string;
  metric: string;
  comparator: Comparator;
  threshold: number;
  severity: Severity;
  claim: (v: number) => string;
  fix: string;
}

function applyMetricRules(lens: LensId, rules: MetricRule[], input: CriticInput): Criticism[] {
  const out: Criticism[] = [];
  for (const r of rules) {
    const v = input.metrics[r.metric];
    if (v === undefined || !Number.isFinite(v)) continue;
    if (!compare(v, r.comparator, r.threshold)) continue;
    out.push({
      lens,
      subject: r.subject,
      claim: r.claim(v),
      severity: r.severity,
      evidence: { kind: 'measure', metric: r.metric, value: v, comparator: r.comparator, threshold: r.threshold },
      fix: r.fix,
    });
  }
  return out;
}

/**
 * COMPOSITION. For a prop this is about the object's internal composition, not the place: is
 * there a dominant mass the eye lands on, or is the object a uniform lump; is the mass placed or
 * merely centred by default.
 */
export const COMPOSITION_RULES: MetricRule[] = [
  {
    subject: 'mass-hierarchy',
    metric: 'scaleEntropy',
    comparator: '<',
    threshold: 0.3,
    severity: 'blocking',
    claim: (v) => `every element is effectively the same size (scale entropy ${v.toFixed(2)} of a possible 1.0), so nothing in the form dominates and the eye has nowhere to land`,
    fix: 'make one element clearly the largest mass and demote the rest into supporting and trim scales',
  },
  {
    subject: 'silhouette-variation',
    metric: 'profileCV',
    comparator: '<',
    threshold: 0.08,
    severity: 'major',
    claim: (v) => `the outline barely changes over the object's height (profile variation ${v.toFixed(3)}): it reads as a rectangle from every angle`,
    fix: 'vary the width along the vertical axis — a base, a waist, a cap',
  },
  {
    subject: 'silhouette-fill',
    metric: 'boxFill',
    comparator: '>',
    threshold: 0.9,
    severity: 'major',
    claim: (v) => `the silhouette fills ${Math.round(v * 100)}% of its own bounding box, which is what a single slab does`,
    fix: 'cut into the mass so the outline is not a filled rectangle',
  },
];

/**
 * ROBLOX LEVEL DESIGN. The lens a Roblox environment artist brings and nobody else does: does
 * this thing work at the engine's human scale. A Roblox R15 character is about 5 studs tall and
 * 2 wide; a doorway is 7x4; anything under about 0.2 studs is smaller than the player can
 * perceive at play distance and is paying part budget for nothing.
 */
export const ROBLOX_RULES: MetricRule[] = [
  {
    subject: 'player-scale',
    metric: 'heightStuds',
    comparator: '<',
    threshold: 1.5,
    severity: 'major',
    claim: (v) => `the object is ${v.toFixed(1)} studs tall — under knee height on a 5-stud Roblox character, so a player will walk past without registering it`,
    fix: 'scale it against a 5-stud character: a landmark prop wants to read at 6 studs or more',
  },
  {
    subject: 'player-scale',
    metric: 'heightStuds',
    comparator: '>',
    threshold: 120,
    severity: 'major',
    claim: (v) => `the object is ${v.toFixed(0)} studs tall — 24 times player height, so it cannot be seen as an object from anywhere a player can stand`,
    fix: 'either reduce it or treat it as architecture and compose the approach to it',
  },
  {
    subject: 'sub-perceptual-parts',
    metric: 'tinyPartShare',
    comparator: '>',
    threshold: 0.25,
    severity: 'major',
    claim: (v) => `${Math.round(v * 100)}% of parts are under 0.2 studs — below what a player can resolve at play distance, so they cost budget and return nothing`,
    fix: 'merge sub-0.2-stud parts into their host, or make them large enough to read',
  },
  {
    subject: 'part-budget',
    metric: 'partCount',
    comparator: '>',
    threshold: 400,
    severity: 'major',
    claim: (v) => `${v} parts in a single prop: this is a streaming and physics cost a place cannot pay for one object`,
    fix: 'consolidate repeated geometry; a hero prop should sit well under 200 parts',
  },
  {
    subject: 'unanchored-geometry',
    metric: 'unanchoredParts',
    comparator: '>',
    threshold: 0,
    severity: 'blocking',
    claim: (v) => `${v} part(s) are unanchored: on server start they will fall, and the prop the player sees is not the prop that was built`,
    fix: 'anchor every part that is not deliberately physics-driven',
  },
];

/** TECHNICAL ART. Construction hygiene: the faults that make a build look amateur on inspection
 *  regardless of how it is composed. */
export const TECHNICAL_ART_RULES: MetricRule[] = [
  {
    subject: 'surface-intent',
    metric: 'factoryDefaultShare',
    comparator: '>=',
    threshold: 0.5,
    severity: 'blocking',
    claim: (v) => `${Math.round(v * 100)}% of parts are still default-grey Plastic: no material and no colour decision was made for most of this object`,
    fix: 'assign a material and a colour to every part; grey Plastic is the absence of a choice',
  },
  {
    subject: 'material-variety',
    metric: 'distinctMaterials',
    comparator: '<=',
    threshold: 1,
    severity: 'major',
    claim: () => 'the entire object is one material, so nothing separates structure from ornament from trim',
    fix: 'use at least three materials with different roughness so the flat-Lambert renderer can separate them in value',
  },
  {
    subject: 'colour-story',
    metric: 'distinctColours',
    comparator: '<=',
    threshold: 2,
    severity: 'major',
    claim: (v) => `${v} perceptibly distinct colour(s) across the whole object`,
    fix: 'establish a dominant colour, a secondary and an accent',
  },
  {
    subject: 'z-fighting',
    metric: 'coincidentFacePairs',
    comparator: '>',
    threshold: 0,
    severity: 'major',
    claim: (v) => `${v} pair(s) of exactly coplanar faces occupy the same space and will z-fight on hardware`,
    fix: 'offset coincident surfaces by at least 0.01 studs',
  },
  {
    subject: 'detail-scales',
    metric: 'smallPartShare',
    comparator: '<',
    threshold: 0.08,
    severity: 'major',
    claim: (v) => `small-scale elements are ${Math.round(v * 100)}% of the build: there is nothing to see at close range`,
    fix: 'add trim, fasteners and edge details at roughly a tenth of the object size',
  },
];

/**
 * LIGHTING — deliberately the narrowest lens in the panel.
 *
 * The rasteriser has one fixed sun, flat Lambert shading, no shadows, no PointLights and no post
 * effects. Almost every question an artist would normally ask about lighting is unanswerable from
 * these images, and a critic asked one anyway will confabulate. So this lens is restricted to two
 * things that genuinely are evidenced:
 *   1. VALUE STRUCTURE, from the pixels: does the object separate from its background in
 *      luminance, and do its faces separate from each other in value under the single sun. A form
 *      whose faces all land on the same value reads as a flat sticker no matter how it is built.
 *   2. LIGHTING CONFIGURATION, from the plugin's report — data, not pixels.
 * It may never ask about shadow quality, bounce, specular, mood or time of day.
 */
export const LIGHTING_RULES: MetricRule[] = [
  {
    subject: 'figure-ground-separation',
    metric: 'figureGroundContrast',
    comparator: '<',
    threshold: 8,
    severity: 'major',
    claim: (v) => `the object's mean luminance is within ${v.toFixed(1)} of 255 of the background's: it reads as a stain on the backdrop rather than a solid form`,
    fix: 'shift the palette in value away from the ground and sky, not in hue',
  },
  {
    subject: 'face-value-separation',
    metric: 'faceValueSpread',
    comparator: '<',
    threshold: 12,
    severity: 'major',
    claim: (v) => `faces at different angles land within ${v.toFixed(1)} luminance of each other under the single sun, so the form does not read as three-dimensional`,
    fix: 'use materials with different roughness on adjacent planes; under flat Lambert, roughness is the only lever that separates faces in value',
  },
];

export function lightingConfigCriticisms(input: CriticInput): Criticism[] {
  const out: Criticism[] = [];
  const l = input.lighting;
  if (!l) return out;
  if (l.isDefault) {
    out.push({
      lens: 'lighting',
      subject: 'lighting-pass',
      claim: 'every Lighting property is still the Roblox default: brightness, ClockTime, Ambient and effects were never touched, so no lighting decision exists to judge',
      severity: 'major',
      // Configuration is data, so it is cited as a measurement, not as something seen in a frame.
      evidence: { kind: 'measure', metric: 'lightingTouchedProperties', value: 0, comparator: '<=', threshold: 0 },
      fix: 'set ClockTime and Ambient for the mood the request implies, and add an Atmosphere pass',
    });
  }
  return out;
}

/** GAMEPLAY READABILITY. Everything here is measured on a deliberate 96x60 downsample — the frame
 *  a prop actually occupies when a player is standing back from it. */
export const READABILITY_RULES: MetricRule[] = [
  {
    subject: 'distance-legibility',
    metric: 'distantInteriorEdgeDensity',
    comparator: '<',
    threshold: 0.03,
    severity: 'major',
    claim: (v) => `at gameplay distance the object's internal structure collapses to ${v.toFixed(3)} edge density: from a few steps back it is a single blob`,
    fix: 'carry the read on massing and value blocking rather than on trim that vanishes past three metres',
  },
  {
    subject: 'distance-contrast',
    metric: 'distantContrast',
    comparator: '<',
    threshold: 6,
    severity: 'blocking',
    claim: (v) => `figure-ground contrast falls to ${v.toFixed(1)} at gameplay distance: the player cannot find the object in the frame`,
    fix: 'raise the value separation between the object and the ground plane',
  },
  {
    subject: 'frame-occupancy',
    metric: 'distantCoverage',
    comparator: '<',
    threshold: 0.015,
    severity: 'minor',
    claim: (v) => `the object occupies ${(v * 100).toFixed(1)}% of the gameplay-distance frame, which is below the size at which a player registers a prop at all`,
    fix: 'scale it up or bring it closer to where the player walks',
  },
];

// ---------------------------------------------------------------------------------------------
// Model-driven lenses
// ---------------------------------------------------------------------------------------------

/**
 * The adversarial system prompt. Two properties matter and both are structural rather than
 * polite: the critic is told its job is to PROVE the build is bad (so a balanced answer is off
 * the table), and it is told exactly what happens to an unevidenced claim (so hedging has a
 * visible cost rather than being the safe option).
 */
export function buildLensPrompt(lens: LensId, input: CriticInput): { system: string; user: string } {
  const system = [
    `You are the ${LENS_TITLES[lens]} on an adversarial review panel. Your job is to PROVE this build is not good enough to ship. You are not asked what is good about it and you must not say.`,
    '',
    'RULES OF EVIDENCE. Every criticism must carry exactly one piece of evidence, of one of three kinds:',
    '  region  {"kind":"region","view":"<a rendered view name>","box":[x,y,w,h]}  — normalised 0-1, origin top-left, covering less than 60% of the frame',
    '  measure {"kind":"measure","metric":"<a metric name from the table>","value":<the value from the table>,"comparator":"<|<=|>|>=","threshold":<the limit it breaks>}',
    '  missing {"kind":"missing","element":"<something the request asked for>","searchedIn":["<view>","<view>"]}',
    '',
    'A criticism with no evidence is DELETED before anyone reads it. So is one citing a view that was not rendered, a metric that was not measured, a value that disagrees with the table, a threshold the value does not actually break, or an element nobody asked for. Hedged prose is deleted too — "could use more detail", "looks solid overall" and anything of that shape count for nothing.',
    'Finding nothing is an acceptable answer. Inventing something is not.',
    '',
    `WHAT THE RENDERER CAN SHOW: ${RENDERER_CONSTRAINTS}`,
    '',
    `YOUR LENS: ${LENS_MANDATES[lens]}`,
    '',
    'Reply with JSON only: {"criticisms":[{"subject":"<short-stable-id>","claim":"<what is wrong, specific>","severity":"minor|major|blocking","evidence":{...},"fix":"<what to change>"}]}',
    'The "subject" is how your finding is matched against the other critics\' findings, so use a short stable identifier such as "silhouette-variation" or "surface-intent", not a sentence.',
  ].join('\n');

  const user = [
    `REQUEST, VERBATIM: "${input.intent}"`,
    `SUBJECT: a single ${input.subject}`,
    `VIEWS RENDERED: ${input.views.map((v) => `${v.name} (${v.width}x${v.height})`).join(', ')}`,
    input.requestedElements?.length ? `ELEMENTS THE REQUEST NAMES: ${input.requestedElements.join(', ')}` : '',
    '',
    'MEASUREMENTS (the only numbers you may cite; citing any other number deletes your criticism):',
    ...Object.entries(input.metrics).map(([k, v]) => `  ${k} = ${v}`),
    input.lighting
      ? `\nLIGHTING CONFIGURATION (reported by the plugin, not visible in the images): brightness ${input.lighting.brightness}, ClockTime ${input.lighting.clockTime}, Ambient rgb(${input.lighting.ambient.join(',')}), ${input.lighting.lightInstances} light instance(s), effects [${input.lighting.effects.join(', ') || 'none'}]${input.lighting.isDefault ? ' — ALL STILL AT ROBLOX DEFAULTS' : ''}`
      : '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { system, user };
}

export const RENDERER_CONSTRAINTS =
  'The images come from a CPU rasteriser at 288x180 (320x240 maximum) with flat Lambert shading, ONE fixed sun direction, ' +
  'no shadows, no point lights, no post-processing and no textures — a material is only a brightness multiplier and a ' +
  'roughness value. There is therefore NO evidence in these images about shadow quality, bounce light, specular ' +
  'highlights, bloom, colour grading, texture detail, or time-of-day mood, and a criticism about any of them will be ' +
  'deleted as unevidenced. Fine ornament below a few pixels is also unresolvable, so judge detail from the measurements, ' +
  'not from the image.';

export const LENS_TITLES: Record<LensId, string> = {
  composition: 'composition critic',
  roblox_level_design: 'Roblox level designer',
  technical_art: 'technical artist',
  lighting: 'lighting critic',
  gameplay_readability: 'gameplay readability critic',
  request_fidelity: 'request fidelity auditor',
};

export const LENS_MANDATES: Record<LensId, string> = {
  composition:
    'Mass hierarchy and silhouette. Is there a dominant element, or is the object a uniform lump? Does the outline carry information, or is it a rectangle? Ignore surface and colour entirely — that is another critic\'s job.',
  roblox_level_design:
    'The engine\'s human scale. A Roblox character is about 5 studs tall and 2 wide; a doorway is 7x4; a step over 2 studs cannot be walked up. Is this object sized for a player to stand next to? Is it paying part budget for geometry a player cannot resolve? Would it survive being placed in a real level?',
  technical_art:
    'Construction hygiene. Default-grey Plastic parts, single-material builds, coincident faces that will z-fight, unanchored geometry, missing detail scales. You are inspecting the build, not appreciating it.',
  lighting:
    'ONLY value structure and the Lighting configuration. Does the object separate from its background in luminance? Do its faces separate from each other under the single sun? Was any Lighting property changed from the Roblox default? You may not comment on shadows, bounce, specular, mood or time of day — this renderer produces none of them and any such claim is invention.',
  gameplay_readability:
    'What survives at play distance. Everything you are given about the 96x60 downsample is what a player sees standing back from this object. Does it still read? Would a player find it in a busy frame?',
  request_fidelity:
    'The request against the build. Which named elements of the request are absent, which are present but unrecognisable as the thing named, and which of the request\'s adjectives ("ornate", "ruined", "futuristic") have no expression in the build at all. Cite missing elements by name and say which views you searched.',
};

/** Every metric a deterministic rule can cite. The harness must produce all of them: a rule
 *  naming a metric nobody measures is dead code that looks like a check. Asserted in the tests. */
export const REFERENCED_METRICS: string[] = [
  ...new Set([
    ...[...COMPOSITION_RULES, ...ROBLOX_RULES, ...TECHNICAL_ART_RULES, ...LIGHTING_RULES, ...READABILITY_RULES].map((r) => r.metric),
    'lightingTouchedProperties', // cited by lightingConfigCriticisms, which is not a MetricRule
  ]),
].sort();

/** Terms with no evidence in a flat-Lambert, single-sun, shadowless, texture-free 288x180 render.
 *  No lens may build a claim on one. Enforced by the tests over every rule and every mandate. */
export const UNEVIDENCED_TERMS = ['shadow', 'bounce light', 'specular', 'bloom', 'colour grading', 'color grading', 'texture detail', 'time of day', 'point light'];

/** Which lenses need no model at all. This is the set the tests run against fixtures for free. */
export const DETERMINISTIC_LENSES: LensId[] = ['composition', 'roblox_level_design', 'technical_art', 'lighting', 'gameplay_readability'];
export const ALL_LENSES: LensId[] = [...DETERMINISTIC_LENSES, 'request_fidelity'];

/** Run one deterministic lens. Returns [] for `request_fidelity`, which has no geometric form. */
export function runDeterministicLens(lens: LensId, input: CriticInput): Criticism[] {
  switch (lens) {
    case 'composition':
      return applyMetricRules(lens, COMPOSITION_RULES, input);
    case 'roblox_level_design':
      return applyMetricRules(lens, ROBLOX_RULES, input);
    case 'technical_art':
      return applyMetricRules(lens, TECHNICAL_ART_RULES, input);
    case 'lighting':
      return [...applyMetricRules(lens, LIGHTING_RULES, input), ...lightingConfigCriticisms(input)];
    case 'gameplay_readability':
      return applyMetricRules(lens, READABILITY_RULES, input);
    case 'request_fidelity':
      return [];
  }
}

/** Pull the criticisms out of a model reply that may be fenced or prefixed with prose. */
export function parseLensResponse(lens: LensId, text: string): Criticism[] {
  const raw = String(text ?? '');
  const fenced = raw.match(/```(?:json)?\s*\r?\n([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const list = (parsed as { criticisms?: unknown[] })?.criticisms;
  if (!Array.isArray(list)) return [];
  const out: Criticism[] = [];
  for (const item of list) {
    const c = item as Partial<Criticism>;
    // A criticism with no evidence is deliberately KEPT here and rejected by the gate instead of
    // being dropped silently. The discard count is the panel's flattery rate, and a rate that
    // quietly excludes the most flagrant cases is not a rate worth reporting.
    if (!c || typeof c.subject !== 'string' || typeof c.claim !== 'string') continue;
    out.push({
      lens,
      subject: c.subject,
      claim: c.claim,
      severity: (['minor', 'major', 'blocking'] as const).includes(c.severity as Severity) ? (c.severity as Severity) : 'major',
      evidence: c.evidence as Evidence,
      fix: typeof c.fix === 'string' ? c.fix : undefined,
    });
  }
  return out;
}

export interface CriticPanelOptions {
  /** which lenses sit on the panel. Configurable per the brief; defaults to all six. */
  lenses?: LensId[];
  /** supply to run model-driven lenses. Without it the panel is deterministic and free. */
  judge?: Judge;
  /** run the deterministic rules for a lens even when a judge is supplied. Default true: the
   *  measurements are the part a model cannot fake, so they should always be on the record. */
  alwaysRunDeterministic?: boolean;
  rule?: AdjudicationRule;
  now?: Date;
}

export interface PanelResult {
  criticisms: Criticism[];
  adjudication: Adjudication;
  regression: RegressionRecord[];
  lensesRun: LensId[];
  modelCalls: number;
}

/**
 * Run the panel. With no `judge` this makes zero network calls and is fully deterministic, which
 * is how the test suite runs it: the whole pipeline — lenses, evidence gate, adjudication and
 * regression records — is exercised against fixtures for free.
 */
export async function runCriticPanel(input: CriticInput, opts: CriticPanelOptions = {}): Promise<PanelResult> {
  const lenses = opts.lenses ?? ALL_LENSES;
  const rule = opts.rule ?? DEFAULT_RULE;
  const alwaysDet = opts.alwaysRunDeterministic ?? true;
  const criticisms: Criticism[] = [];
  let modelCalls = 0;

  for (const lens of lenses) {
    const deterministic = DETERMINISTIC_LENSES.includes(lens);
    if (deterministic && (alwaysDet || !opts.judge)) criticisms.push(...runDeterministicLens(lens, input));
    if (opts.judge && (!deterministic || alwaysDet)) {
      const { system, user } = buildLensPrompt(lens, input);
      modelCalls++;
      try {
        criticisms.push(...parseLensResponse(lens, await opts.judge({ lens, system, user })));
      } catch {
        // A lens that errors contributes nothing. It must not take the panel down: the other
        // critics' findings are still valid, and a missing lens only weakens a quorum.
      }
    }
  }

  const adjudication = adjudicate(criticisms, input, rule);
  return {
    criticisms,
    adjudication,
    regression: toRegressionRecords(adjudication, input, opts.now),
    lensesRun: lenses,
    modelCalls,
  };
}

export function formatPanelReport(r: PanelResult): string {
  const a = r.adjudication;
  const lines = [
    `panel: ${r.lensesRun.length} lens(es), ${r.modelCalls} model call(s)`,
    `${a.stats.raised} criticisms raised -> ${a.stats.accepted} admissible -> ${a.stats.confirmed} CONFIRMED (${a.stats.discarded} discarded for want of evidence)`,
  ];
  for (const d of a.confirmed) {
    lines.push(`  [${d.severity.toUpperCase()}] ${d.subject}  (${d.confirmedBy}; ${d.lenses.join(' + ')})`);
    for (const c of d.claims) lines.push(`      ${c}`);
    for (const e of d.evidence) lines.push(`      evidence: ${describeEvidence(e)}`);
  }
  for (const u of a.unconfirmed) lines.push(`  [unconfirmed] ${u.subject}: ${u.reason}`);
  for (const d of a.discarded) lines.push(`  [discarded] ${d.criticism.lens}/${d.criticism.subject}: ${d.reason}`);
  return lines.join('\n');
}

export function describeEvidence(e: Evidence): string {
  switch (e.kind) {
    case 'region':
      return `${e.view} region [${e.box.map((v) => v.toFixed(2)).join(', ')}]`;
    case 'measure':
      return `${e.metric} = ${e.value} (violates ${e.comparator} ${e.threshold})`;
    case 'missing':
      return `"${e.element}" not found in ${e.searchedIn.join(', ')}`;
  }
}
