// Does the composition gate mean anything outside a plaza?
//
// apps/worker/src/composition.ts was calibrated on twelve fixtures derived from ONE captured
// scene, and docs/COMPOSITION.md says so in its own "Honest limits": "a calibration set, not a
// validation set". This harness runs the SAME production module — bundled from
// apps/worker/src/composition.ts, never mirrored — over fifteen independent synthetic scene
// families and reports what happens, including where it is bad.
//
// WHAT IS MEASURED
//   1. gate outcome per fixture              -> false-pass rate, false-reject rate, per family
//   2. AUC per metric, with PRE-DECLARED signs imported from composition-calibration.mjs so no
//      direction can be re-fitted to this data
//   3. camera sensitivity: the same scene judged from each of the five viewpoints separately
//   4. the null hypothesis re-run on independent scenes: part / material / colour count
//
// WHAT IS *NOT* MEASURED, AND MUST NOT BE CLAIMED
//   There is no blind jury here. Ground truth on the twelve-rung ladder is six independent
//   critics who never saw the labels; ground truth here is the fixture author's design intent.
//   That is weaker evidence. It is adequate for the question actually being asked — "does the
//   gate fire on a named failure mode and hold its fire on a competent build of the same family"
//   — and inadequate for any claim about which scene a human would prefer. Every number below
//   carries that caveat.
//
// TUNING DISCIPLINE
//   Nothing in apps/worker/src/composition.ts is edited by this workstream. Where the evidence
//   says a threshold is wrong, the recommendation is written into the report and left for the
//   owner of that file. The CALIBRATION set is the only set consulted while iterating on
//   fixtures; VALIDATION numbers are computed once at the end and reported as held out. Because
//   the split is by FAMILY (see composition-splits.mjs) and no threshold was changed at all, the
//   held-out claim is trivially satisfiable — and it is stated that way rather than dressed up.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScene } from './render-scene.mjs';
import { buildFamilies, DESIGNED_HARD_CASES, ENCLOSED_FAMILIES } from './composition-families.mjs';
import { buildSplits, disjointnessProof, SET_NAMES } from './composition-splits.mjs';
import { loadCompositionModule, auc, spearman, DIRECTION, contactSheet, encodePng } from './composition-calibration.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, '..', 'tasks-visual', 'composition', 'generalization');

export const RENDER_W = 288;
export const RENDER_H = 180;

/**
 * Metrics this project has already MEASURED AND REJECTED, with the ladder AUC that killed them.
 * They are re-measured here for information only. Nothing in this file promotes a metric out of
 * this table, and composition-generalization.test.mjs asserts that none of them has been quietly
 * moved into the kept list — resurrecting a falsified metric because it happened to score well on
 * a second, weaker-labelled set is exactly the failure mode docs/COMPOSITION.md was written about.
 */
export const FALSIFIED = {
  energyGini: { ladderAuc: 0.5, why: 'the central hypothesis of the original work, refuted: a composed scene and a tiled carpet spread edge energy alike once both fill the frame' },
  energyEntropy: { ladderAuc: 0.444, why: 'the same idea inverted; measured direction contradicts the declared one' },
  maskedColorfulness: { ladderAuc: 0.5, why: 'does not GRADE palette; retained ONLY as a floor against total greyness' },
  'structure.massHierarchy': { ladderAuc: 0.333, why: '1-stud clustering fuses a paved scene into one mass' },
  occupiedCellShare: { ladderAuc: 0.306, why: 'direction refuted — the bad fixtures are the ones that fill the frame' },
  coverage: { ladderAuc: 0.25, why: 'direction refuted, same reason' },
  centroidOffset: { ladderAuc: 1.0, why: 'perfect score but excluded: the framing camera follows the bounding box, so a uniform translation cancels exactly' },
  'structure.volumeGini': { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
  'structure.heightBandEntropy': { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
  'structure.landmarkShare': { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
  'structure.footprintOccupancy': { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
  'structure.massCount': { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
  figureGroundContrast: { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
  silhouetteRange: { ladderAuc: null, why: 'did not separate reliably (0.44-0.78 band)' },
};

/** Metrics docs/COMPOSITION.md kept, with the ladder AUC they were kept on. */
export const KEPT = {
  'structure.verticalDominance': 1.0,
  'structure.heightHierarchy': 1.0,
  'structure.verticalElements': 1.0,
  interiorEdgeDensity: 0.889,
  occupancyGini: 0.833,
  silhouettePeakProminence: 0.833,
  silhouetteRoughness: 0.833,
};

/** The project's own null hypothesis, re-run on independent scenes. */
export const CONTROLS = ['control.partCount', 'control.materialCount', 'control.colourCount'];

const VIEW_KEYS = [
  'coverage', 'maskedColorfulness', 'interiorEdgeDensity', 'figureGroundContrast',
  'energyGini', 'occupancyGini', 'energyEntropy', 'occupiedCellShare', 'centroidOffset',
  'silhouetteRange', 'silhouettePeakProminence', 'silhouetteRoughness',
];
const STRUCT_KEYS = [
  'parts', 'volumeGini', 'massHierarchy', 'massCount', 'verticalDominance', 'verticalElements',
  'heightHierarchy', 'footprintOccupancy', 'heightBandEntropy', 'landmarkShare',
];

const TOP_VIEW = 'top';
const SILHOUETTE_KEYS = new Set(['silhouetteRange', 'silhouettePeakProminence', 'silhouetteRoughness']);

/**
 * Same aggregation rule as composition-calibration.mjs: median across usable views, excluding the
 * top-down camera for silhouette statistics (a plan view has no skyline). Median rather than mean
 * so one odd camera cannot decide a scene.
 */
function aggregateViews(views) {
  const out = {};
  const usable = views.filter((v) => v.metrics.coverage >= 0.05);
  const nonTop = usable.filter((v) => v.name !== TOP_VIEW);
  for (const k of VIEW_KEYS) {
    const pool = SILHOUETTE_KEYS.has(k) ? (nonTop.length ? nonTop : usable) : usable;
    const vals = pool.map((v) => v.metrics[k]).filter((v) => typeof v === 'number');
    if (!vals.length) { out[k] = 0; continue; }
    const s = [...vals].sort((a, b) => a - b);
    out[k] = s[Math.floor(s.length / 2)];
  }
  return out;
}

const LIVE = (p) => p.size[0] <= 600 && p.size[2] <= 600;

/** Render + measure every synthetic fixture once. Everything downstream reads this. */
export async function measureAll({ width = RENDER_W, height = RENDER_H, C = null, keepRgb = false } = {}) {
  const mod = C ?? (await loadCompositionModule());
  const fixtures = buildFamilies();
  const splits = buildSplits(fixtures);

  const measured = fixtures.map((f) => {
    const r = renderScene(f.scene, { width, height, view: 'all' });
    if (r.error) throw new Error(`fixture ${f.id} did not render: ${r.error}`);
    // Raw pixels are ~46 MB across the set, so they are kept only when a contact sheet is being
    // written. Everything downstream reads metrics, not bytes.
    const views = r.views.map((v) => ({
      name: v.name,
      coverage: v.meta.subjectCoverage,
      metrics: mod.compositionMetrics(v.rgb, v.meta.width, v.meta.height),
      ...(keepRgb && v.name === 'hero' ? { rgbBuffer: v.rgb } : {}),
    }));
    const structure = mod.structureFromLayout(f.layout.parts);
    const live = f.scene.parts.filter(LIVE);
    const controls = {
      'control.partCount': live.length,
      'control.materialCount': new Set(live.map((p) => p.material)).size,
      'control.colourCount': new Set(live.map((p) => p.color.join(','))).size,
    };
    const agg = aggregateViews(views);

    const values = { ...controls };
    for (const k of VIEW_KEYS) values[k] = agg[k];
    for (const k of STRUCT_KEYS) values[`structure.${k}`] = structure[k];

    return {
      id: f.id,
      family: f.family,
      label: f.label,
      variant: f.variant,
      intent: f.intent,
      set: splits.assignment[f.family],
      structure,
      views,
      values,
      // the production gate, exactly as the worker calls it
      fails: mod.compositionHardFails(structure, views, 'scene'),
      // the two halves separately, so a reader can see which one is doing the work
      structuralFails: mod.compositionHardFails(structure, [], 'scene'),
      perCameraFails: Object.fromEntries(
        views.map((v) => [v.name, mod.compositionHardFails(structure, [v], 'scene')]),
      ),
    };
  });

  return { measured, splits, proof: disjointnessProof(splits), gates: mod.COMPOSITION_GATES };
}

const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);

/** Confusion numbers for one bag of measured fixtures, on a chosen `fails` field. */
function confusion(rows, field = 'fails') {
  const good = rows.filter((r) => r.label === 'good');
  const bad = rows.filter((r) => r.label === 'bad');
  const falseReject = good.filter((r) => r[field].length > 0);
  const falsePass = bad.filter((r) => r[field].length === 0);
  return {
    good: good.length,
    bad: bad.length,
    falseRejects: falseReject.map((r) => r.id),
    falsePasses: falsePass.map((r) => r.id),
    falseRejectRate: rate(falseReject.length, good.length),
    falsePassRate: rate(falsePass.length, bad.length),
    accuracy: rate(good.length - falseReject.length + (bad.length - falsePass.length), rows.length),
  };
}

/**
 * AUC over the binary good/bad labels. `auc` is imported from the calibration harness so the
 * tie-as-half convention cannot drift; labels are mapped to 8 (good) / 2 (bad) to fit its
 * badMax<=3 / goodMin>=5 contract.
 *
 * With 10 good and 10 bad per split, one flipped pair moves AUC by 0.01 and the standard error of
 * a true-0.5 AUC is about 0.12. Differences under ~0.15 between sets are not evidence of anything
 * and the report says so rather than ranking them.
 */
function aucFor(rows, metric) {
  const vals = rows.map((r) => r.values[metric]);
  if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  const labels = rows.map((r) => (r.label === 'good' ? 8 : 2));
  const sign = DIRECTION[metric] ?? 1;
  return Math.round(auc(vals, labels, sign) * 1000) / 1000;
}

/**
 * Camera sensitivity. The structural half of the gate takes no camera at all — it is computed
 * from SceneLayout geometry — so it is invariant by construction, not by measurement, and that is
 * stated rather than "measured". Everything here concerns the pixel half.
 */
function cameraSensitivity(measured) {
  const cameras = measured[0].views.map((v) => v.name);

  // spread of each view metric across the five cameras, per fixture, summarised over fixtures
  const spread = {};
  for (const k of VIEW_KEYS) {
    const rel = [];
    const abs = [];
    for (const r of measured) {
      const vals = r.views.filter((v) => v.metrics.coverage >= 0.05).map((v) => v.metrics[k]);
      if (vals.length < 2) continue;
      const mx = Math.max(...vals);
      const mn = Math.min(...vals);
      const med = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
      abs.push(mx - mn);
      if (med > 1e-6) rel.push((mx - mn) / med);
    }
    const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
    spread[k] = {
      medianAbsoluteRange: med(abs) === null ? null : Math.round(med(abs) * 1000) / 1000,
      medianRelativeRange: med(rel) === null ? null : Math.round(med(rel) * 1000) / 1000,
      worstRelativeRange: rel.length ? Math.round(Math.max(...rel) * 1000) / 1000 : null,
    };
  }

  // does the GATE change its mind when it is shown only one camera?
  const perCameraFailCount = Object.fromEntries(cameras.map((c) => [c, 0]));
  const flipped = [];
  for (const r of measured) {
    const decisions = cameras.map((c) => r.perCameraFails[c].length > 0);
    cameras.forEach((c, i) => { if (decisions[i]) perCameraFailCount[c]++; });
    if (new Set(decisions).size > 1) {
      flipped.push({
        id: r.id,
        label: r.label,
        rejectingCameras: cameras.filter((c, i) => decisions[i]),
        passingCameras: cameras.filter((c, i) => !decisions[i]),
        // the gated pixel statistic, per camera, so the flip is explainable
        maskedColorfulness: Object.fromEntries(r.views.map((v) => [v.name, v.metrics.maskedColorfulness])),
      });
    }
  }

  // confusion for each single-camera gate, versus the production five-camera gate
  const perCameraConfusion = Object.fromEntries(
    cameras.map((c) => [
      c,
      confusion(measured.map((r) => ({ ...r, one: r.perCameraFails[c] })), 'one'),
    ]),
  );

  return {
    note: 'The structural half of the gate reads SceneLayout geometry and never sees a camera, so it is camera-invariant BY CONSTRUCTION. Only the pixel half (maskedColorfulness in the gate; the rest reported to the critic) can move with the camera.',
    cameras,
    viewMetricSpread: spread,
    perCameraFailCount,
    fixturesWhoseGateDecisionDependsOnCamera: flipped.length,
    flipped,
    perCameraConfusion,
    productionGateConfusion: confusion(measured),
  };
}

/**
 * A replica of `compositionHardFails` with the thresholds made adjustable, so a threshold
 * recommendation can be backed by a counterfactual instead of an opinion. apps/worker/src/
 * composition.ts is NOT edited by this workstream; the recommendation is the deliverable.
 *
 * The replica is verified against the real thing on all 60 fixtures — see
 * composition-generalization.test.mjs, "the counterfactual replica reproduces the production
 * gate". If someone changes the production rules and forgets this file, that test fails.
 */
export const PRODUCTION_RULES = {
  verticalDominance: 1.25,
  heightHierarchy: 2.0,
  maskedColorfulness: 12,
  skipDominanceWhenSingleElement: false,
};

export function gateVariant(r, opts = PRODUCTION_RULES) {
  const fails = [];
  const s = r.structure;
  if (s.parts > 0 && s.verticalElements === 0) {
    fails.push('nothing-stands-up');
  } else if (opts.skipDominanceWhenSingleElement && s.verticalElements === 1) {
    // one fused mass: an enclosure, not a landmark contest. No tier is measurable either way.
  } else if (s.verticalDominance < opts.verticalDominance) {
    fails.push('no-landmark');
  }
  if (s.heightHierarchy < opts.heightHierarchy) fails.push('no-vertical-variation');
  const judged = r.views.filter((v) => v.metrics.coverage >= 0.05);
  if (judged.length) {
    const colour = Math.max(...judged.map((v) => v.metrics.maskedColorfulness));
    if (colour < opts.maskedColorfulness) fails.push('greyscale');
  }
  return fails;
}

/**
 * Candidate rule changes, chosen by looking ONLY at the CALIBRATION families. The VALIDATION and
 * REGRESSION columns are computed afterwards and were not consulted while choosing. Since nothing
 * in production is being changed, this is a recommendation with its own held-out evidence, not a
 * fit.
 */
export const COUNTERFACTUALS = [
  { name: 'production (unchanged)', opts: PRODUCTION_RULES },
  {
    name: 'A: skip the landmark rule when verticalElements === 1',
    why: 'a single fused mass is an enclosure (room, cave, house shell), not a failed landmark contest; verticalDominance returns the 1.0 sentinel there and the gate reads it as a failure',
    opts: { ...PRODUCTION_RULES, skipDominanceWhenSingleElement: true },
  },
  {
    name: 'B: verticalDominance floor 1.25 -> 1.05',
    why: 'a colonnade or a paired-tower composition is legitimate and lands just above 1.0',
    opts: { ...PRODUCTION_RULES, verticalDominance: 1.05 },
  },
  {
    name: 'C: colourfulness floor 12 -> 8',
    why: 'a deliberately desaturated genre scene (horror, cave) is not the same failure as a grey slab',
    opts: { ...PRODUCTION_RULES, maskedColorfulness: 8 },
  },
  { name: 'A+C', opts: { ...PRODUCTION_RULES, skipDominanceWhenSingleElement: true, maskedColorfulness: 8 } },
];

/** The whole numeric report. Pure function of `measureAll`'s output. */
export function report(run) {
  const { measured, splits, proof, gates } = run;
  const bySet = Object.fromEntries(SET_NAMES.map((n) => [n, measured.filter((r) => r.set === n)]));

  const metrics = [
    ...Object.keys(KEPT),
    ...Object.keys(FALSIFIED),
    ...CONTROLS,
  ].filter((m, i, a) => a.indexOf(m) === i);

  const metricTable = metrics.map((m) => ({
    metric: m,
    status: KEPT[m] !== undefined ? 'KEPT (ladder)' : FALSIFIED[m] ? 'FALSIFIED (ladder)' : 'CONTROL',
    ladderAuc: KEPT[m] ?? FALSIFIED[m]?.ladderAuc ?? null,
    falsifiedReason: FALSIFIED[m]?.why ?? null,
    direction: DIRECTION[m] ?? 1,
    aucAll: aucFor(measured, m),
    ...Object.fromEntries(SET_NAMES.map((n) => [`auc${n[0]}${n.slice(1, 3).toLowerCase()}`, aucFor(bySet[n], m)])),
    aucBySet: Object.fromEntries(SET_NAMES.map((n) => [n, aucFor(bySet[n], m)])),
  }));

  const perFamily = [...new Set(measured.map((r) => r.family))].map((family) => {
    const rows = measured.filter((r) => r.family === family);
    const c = confusion(rows);
    return {
      family,
      set: rows[0].set,
      ...c,
      discriminates: c.falseRejectRate === 0 && c.falsePassRate === 0,
      // a family where every exemplar is rejected has no discriminative power at all, which is a
      // different and worse failure than a merely noisy one
      rejectsEverything: rows.every((r) => r.fails.length > 0),
      passesEverything: rows.every((r) => r.fails.length === 0),
    };
  }).sort((a, b) => a.family.localeCompare(b.family));

  // which rule actually fires, per class — the difference between "the gate is noisy" and
  // "one rule is responsible for every false rejection"
  const RULES = ['nothing-stands-up', 'no-landmark', 'no-vertical-variation', 'greyscale'];
  const failReasonBreakdown = Object.fromEntries(
    RULES.map((rule) => {
      // what this rule would score if it were the WHOLE gate: the only way to see whether a rule
      // is carrying the result or riding on another one
      const isolated = confusion(
        measured.map((r) => ({ ...r, one: gateVariant(r).includes(rule) ? [rule] : [] })),
        'one',
      );
      return [
        rule,
        {
          firesOnGood: measured.filter((r) => r.label === 'good' && gateVariant(r).includes(rule)).length,
          firesOnBad: measured.filter((r) => r.label === 'bad' && gateVariant(r).includes(rule)).length,
          soleReasonForGoodRejection: measured.filter(
            (r) => r.label === 'good' && gateVariant(r).length === 1 && gateVariant(r)[0] === rule,
          ).map((r) => r.id),
          asTheWholeGate: { falseRejectRate: isolated.falseRejectRate, falsePassRate: isolated.falsePassRate },
        },
      ];
    }),
  );

  // A false rejection on a fixture written to be hostile is expected; one on a plain scene is the
  // real result. Keeping them apart stops the headline number from being padded either way.
  const falseRejects = measured.filter((r) => r.label === 'good' && r.fails.length > 0).map((r) => r.id);
  const falseRejectProvenance = {
    designedHardCases: DESIGNED_HARD_CASES,
    designedHardCasesRejected: falseRejects.filter((id) => DESIGNED_HARD_CASES.includes(id)),
    plainScenesRejected: falseRejects.filter((id) => !DESIGNED_HARD_CASES.includes(id)),
    designedHardCasesAccepted: DESIGNED_HARD_CASES.filter((id) => !falseRejects.includes(id)),
  };

  // the mechanism behind most of the false rejections, isolated and counted
  const fused = measured.filter((r) => r.structure.verticalElements <= 1);
  const enclosureAnalysis = {
    what: 'verticalElementHeights clusters parts in plan at a 3-stud gap. In an enclosed or wall-adjacent scene the shell chains through every prop that touches it, so the whole build collapses to ONE vertical element. verticalDominance then returns its 1.0 "nothing dominates" sentinel and the gate reports "no landmark" on a scene that has no landmark tier to measure in the first place.',
    fixturesWithAtMostOneVerticalElement: fused.length,
    good: fused.filter((r) => r.label === 'good').map((r) => r.id),
    bad: fused.filter((r) => r.label === 'bad').map((r) => r.id),
    shareOfFalseRejects: rate(
      measured.filter((r) => r.label === 'good' && r.fails.length > 0 && r.structure.verticalElements <= 1).length,
      measured.filter((r) => r.label === 'good' && r.fails.length > 0).length,
    ),
  };

  // The framing camera orbits the bounding box, so a roofed scene renders as a lid. Every pixel
  // statistic on those fixtures describes the outside of a box, not the room inside it. Quantified
  // rather than asserted: contact sheets are in generalization/sheets/.
  const enclosed = measured.filter((r) => ENCLOSED_FAMILIES.includes(r.family));
  const open = measured.filter((r) => !ENCLOSED_FAMILIES.includes(r.family));
  const meanOf = (rows, k) => (rows.length ? Math.round((rows.reduce((a, r) => a + r.values[k], 0) / rows.length) * 1000) / 1000 : null);
  const enclosedCameraAnalysis = {
    what: 'The framing camera orbits the geometry bounding box, so on a roofed scene every viewpoint sees the OUTSIDE of a lidded box. See sheets/interior.png: a fully furnished room renders as a beige lid. The pixel half of the gate therefore never sees interior composition at all, and its greyscale floor is applied to a roof.',
    enclosedFamilies: ENCLOSED_FAMILIES,
    enclosedFixtures: enclosed.length,
    openFixtures: open.length,
    meanMaskedColorfulness: { enclosed: meanOf(enclosed, 'maskedColorfulness'), open: meanOf(open, 'maskedColorfulness') },
    meanInteriorEdgeDensity: { enclosed: meanOf(enclosed, 'interiorEdgeDensity'), open: meanOf(open, 'interiorEdgeDensity') },
    greyscaleRuleFiresOnEnclosedGood: measured.filter((r) => r.label === 'good' && ENCLOSED_FAMILIES.includes(r.family) && gateVariant(r).includes('greyscale')).map((r) => r.id),
    greyscaleRuleFiresOnOpenGood: measured.filter((r) => r.label === 'good' && !ENCLOSED_FAMILIES.includes(r.family) && gateVariant(r).includes('greyscale')).map((r) => r.id),
    falseRejectRate: {
      enclosed: rate(enclosed.filter((r) => r.label === 'good' && r.fails.length > 0).length, enclosed.filter((r) => r.label === 'good').length),
      open: rate(open.filter((r) => r.label === 'good' && r.fails.length > 0).length, open.filter((r) => r.label === 'good').length),
    },
    falsePassRate: {
      enclosed: rate(enclosed.filter((r) => r.label === 'bad' && r.fails.length === 0).length, enclosed.filter((r) => r.label === 'bad').length),
      open: rate(open.filter((r) => r.label === 'bad' && r.fails.length === 0).length, open.filter((r) => r.label === 'bad').length),
    },
  };

  const counterfactuals = COUNTERFACTUALS.map((cf) => {
    const withVariant = measured.map((r) => ({ ...r, variantFails: gateVariant(r, cf.opts) }));
    const forSet = (n) => confusion(withVariant.filter((r) => r.set === n), 'variantFails');
    return {
      name: cf.name,
      why: cf.why ?? null,
      all: confusion(withVariant, 'variantFails'),
      ...Object.fromEntries(SET_NAMES.map((n) => [n, forSet(n)])),
    };
  });

  return {
    generatedBy: 'packages/evals/src/composition-generalization.mjs',
    subject: 'apps/worker/src/composition.ts (bundled from source, not mirrored)',
    fixtureProvenance: 'SYNTHETIC — generated by packages/evals/src/composition-families.mjs from fixed seeds. Not captured scenes. The captured fixtures in this repo remain tasks-visual/regression/golem-plaza-{baseline,improved}.',
    groundTruth: 'fixture-author design intent, NOT an independent blind jury. Weaker than the twelve-rung ladder, whose labels came from six blind critics.',
    gates,
    renderSize: [RENDER_W, RENDER_H],
    disjointness: proof,
    setAssignment: splits.assignment,
    overall: {
      productionGate: confusion(measured),
      structuralHalfOnly: confusion(measured, 'structuralFails'),
    },
    bySet: Object.fromEntries(
      SET_NAMES.map((n) => [
        n,
        {
          families: [...new Set(bySet[n].map((r) => r.family))].sort(),
          productionGate: confusion(bySet[n]),
          structuralHalfOnly: confusion(bySet[n], 'structuralFails'),
        },
      ]),
    ),
    perFamily,
    metricTable,
    failReasonBreakdown,
    falseRejectProvenance,
    enclosureAnalysis,
    enclosedCameraAnalysis,
    counterfactuals,
    cameraSensitivity: cameraSensitivity(measured),
    fixtures: measured.map((r) => ({
      id: r.id, family: r.family, label: r.label, set: r.set, intent: r.intent,
      structure: r.structure,
      aggregatedViewMetrics: Object.fromEntries(VIEW_KEYS.map((k) => [k, r.values[k]])),
      controls: Object.fromEntries(CONTROLS.map((k) => [k, r.values[k]])),
      fails: r.fails,
      structuralFails: r.structuralFails,
    })),
  };
}

const pct = (x) => (x === null ? ' n/a' : `${(x * 100).toFixed(1)}%`);

export function formatReport(rep) {
  const L = [];
  L.push('# Composition gate: generalization beyond the plaza');
  L.push('');
  L.push('Fixtures: **SYNTHETIC**, generated from fixed seeds by `composition-families.mjs`. Not captured scenes.');
  L.push(`Ground truth: ${rep.groundTruth}`);
  L.push(`Subject under test: ${rep.subject}`);
  L.push('');
  L.push('## Sets (disjoint by FAMILY, seeded)');
  L.push('');
  L.push(`disjoint: **${rep.disjointness.disjoint}** — ${rep.disjointness.coveredFixtures}/${rep.disjointness.totalFixtures} fixtures covered, ${rep.disjointness.idCollisions.length} id collisions, ${rep.disjointness.familyCollisions.length} family collisions`);
  L.push('');
  L.push('| set | fixtures | good/bad | families |');
  L.push('|---|---|---|---|');
  for (const n of SET_NAMES) {
    const b = rep.disjointness.labelBalance[n];
    L.push(`| ${n} | ${rep.disjointness.sizes[n]} | ${b.good}/${b.bad} | ${rep.disjointness.familiesPerSet[n].join(', ')} |`);
  }
  L.push('');
  L.push('## Gate outcome');
  L.push('');
  L.push('| set | false-reject (good rejected) | false-pass (bad accepted) | accuracy |');
  L.push('|---|---|---|---|');
  L.push(`| ALL | ${pct(rep.overall.productionGate.falseRejectRate)} | ${pct(rep.overall.productionGate.falsePassRate)} | ${pct(rep.overall.productionGate.accuracy)} |`);
  for (const n of SET_NAMES) {
    const g = rep.bySet[n].productionGate;
    L.push(`| ${n} | ${pct(g.falseRejectRate)} | ${pct(g.falsePassRate)} | ${pct(g.accuracy)} |`);
  }
  L.push('');
  L.push(`Structural half alone (no render): false-reject ${pct(rep.overall.structuralHalfOnly.falseRejectRate)}, false-pass ${pct(rep.overall.structuralHalfOnly.falsePassRate)}.`);
  L.push('');
  L.push('## Per family');
  L.push('');
  L.push('| family | set | good rejected | bad accepted | verdict |');
  L.push('|---|---|---|---|---|');
  for (const f of rep.perFamily) {
    const verdict = f.rejectsEverything
      ? '**rejects everything — no discriminative power**'
      : f.passesEverything
        ? '**passes everything — no discriminative power**'
        : f.discriminates
          ? 'separates'
          : 'partial';
    L.push(`| ${f.family} | ${f.set} | ${f.falseRejects.length}/${f.good} | ${f.falsePasses.length}/${f.bad} | ${verdict} |`);
  }
  L.push('');
  L.push('## Metric AUC on independent families');
  L.push('');
  L.push('Signs are pre-declared in `composition-calibration.mjs` and imported, never re-fitted here.');
  L.push('With 10 good / 10 bad per set the standard error on a true-0.5 AUC is about 0.12; treat gaps under ~0.15 as noise.');
  L.push('');
  L.push('| metric | status | ladder AUC | AUC all | CALIB | VALID | REGR |');
  L.push('|---|---|---|---|---|---|---|');
  for (const m of rep.metricTable) {
    const s = m.aucBySet;
    L.push(`| \`${m.metric}\` | ${m.status} | ${m.ladderAuc ?? '—'} | ${m.aucAll ?? '—'} | ${s.CALIBRATION ?? '—'} | ${s.VALIDATION ?? '—'} | ${s.REGRESSION ?? '—'} |`);
  }
  L.push('');
  L.push('## Which rule fires');
  L.push('');
  L.push('| rule | fires on good (false reject) | fires on bad (correct) | as the whole gate: FR / FP |');
  L.push('|---|---|---|---|');
  for (const [rule, k] of Object.entries(rep.failReasonBreakdown)) {
    L.push(`| ${rule} | ${k.firesOnGood} | ${k.firesOnBad} | ${pct(k.asTheWholeGate.falseRejectRate)} / ${pct(k.asTheWholeGate.falsePassRate)} |`);
  }
  L.push('');
  L.push(`Of the ${rep.falseRejectProvenance.plainScenesRejected.length + rep.falseRejectProvenance.designedHardCasesRejected.length} false rejections, ${rep.falseRejectProvenance.designedHardCasesRejected.length} are fixtures written on purpose to be hostile to a landmark rule (${rep.falseRejectProvenance.designedHardCasesRejected.join(', ') || 'none'}) and **${rep.falseRejectProvenance.plainScenesRejected.length} are plain, unremarkable scenes**: ${rep.falseRejectProvenance.plainScenesRejected.join(', ')}.`);
  L.push('');
  L.push('### The mechanism behind most of the false rejections');
  L.push('');
  L.push(rep.enclosureAnalysis.what);
  L.push('');
  L.push(`Fixtures collapsing to <= 1 vertical element: **${rep.enclosureAnalysis.fixturesWithAtMostOneVerticalElement}/60** (good: ${rep.enclosureAnalysis.good.length}, bad: ${rep.enclosureAnalysis.bad.length}).`);
  L.push(`Share of all false rejections explained by it: **${pct(rep.enclosureAnalysis.shareOfFalseRejects)}**.`);
  L.push('');
  L.push('### Enclosed scenes: the camera never gets inside');
  L.push('');
  L.push(rep.enclosedCameraAnalysis.what);
  L.push('');
  L.push('| | enclosed (roofed) | open |');
  L.push('|---|---|---|');
  L.push(`| fixtures | ${rep.enclosedCameraAnalysis.enclosedFixtures} | ${rep.enclosedCameraAnalysis.openFixtures} |`);
  L.push(`| mean maskedColorfulness | ${rep.enclosedCameraAnalysis.meanMaskedColorfulness.enclosed} | ${rep.enclosedCameraAnalysis.meanMaskedColorfulness.open} |`);
  L.push(`| mean interiorEdgeDensity | ${rep.enclosedCameraAnalysis.meanInteriorEdgeDensity.enclosed} | ${rep.enclosedCameraAnalysis.meanInteriorEdgeDensity.open} |`);
  L.push(`| false-reject rate | ${pct(rep.enclosedCameraAnalysis.falseRejectRate.enclosed)} | ${pct(rep.enclosedCameraAnalysis.falseRejectRate.open)} |`);
  L.push(`| false-pass rate | ${pct(rep.enclosedCameraAnalysis.falsePassRate.enclosed)} | ${pct(rep.enclosedCameraAnalysis.falsePassRate.open)} |`);
  L.push('');
  L.push('## Threshold counterfactuals (chosen on CALIBRATION only)');
  L.push('');
  L.push('Recommendations, not changes: `apps/worker/src/composition.ts` is owned by another workstream and was not edited.');
  L.push('');
  L.push('| rule set | ALL FR / FP | CALIBRATION FR / FP | VALIDATION FR / FP | REGRESSION FR / FP |');
  L.push('|---|---|---|---|---|');
  for (const c of rep.counterfactuals) {
    const cell = (k) => `${pct(k.falseRejectRate)} / ${pct(k.falsePassRate)}`;
    L.push(`| ${c.name} | ${cell(c.all)} | ${cell(c.CALIBRATION)} | ${cell(c.VALIDATION)} | ${cell(c.REGRESSION)} |`);
  }
  L.push('');
  L.push('## Camera sensitivity');
  L.push('');
  L.push(rep.cameraSensitivity.note);
  L.push('');
  L.push(`Fixtures whose gate decision changes with the camera: **${rep.cameraSensitivity.fixturesWhoseGateDecisionDependsOnCamera} / ${rep.disjointness.totalFixtures}**`);
  L.push('');
  L.push('| view metric | median range across cameras | median range / median value | worst |');
  L.push('|---|---|---|---|');
  for (const [k, v] of Object.entries(rep.cameraSensitivity.viewMetricSpread)) {
    L.push(`| \`${k}\` | ${v.medianAbsoluteRange ?? '—'} | ${v.medianRelativeRange ?? '—'} | ${v.worstRelativeRange ?? '—'} |`);
  }
  L.push('');
  L.push('| single camera | false-reject | false-pass |');
  L.push('|---|---|---|');
  for (const [c, k] of Object.entries(rep.cameraSensitivity.perCameraConfusion)) {
    L.push(`| ${c} | ${pct(k.falseRejectRate)} | ${pct(k.falsePassRate)} |`);
  }
  L.push(`| all five (production) | ${pct(rep.cameraSensitivity.productionGateConfusion.falseRejectRate)} | ${pct(rep.cameraSensitivity.productionGateConfusion.falsePassRate)} |`);
  L.push('');
  return L.join('\n');
}

/**
 * `node src/composition-generalization.mjs` writes the report, the raw SceneLayout payloads and
 * one contact sheet per family.
 *
 * The contact sheets exist because "the bad exemplars are genuinely bad" is a claim a reader
 * should be able to CHECK, by looking, rather than take on trust from a comment. Each sheet is
 * [good v0 | good v1 | bad v0 | bad v1] from the hero camera. If a bad exemplar looks fine there,
 * the label is wrong and the numbers built on it are worthless.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const run = await measureAll({ keepRgb: true });
  const rep = report(run);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'report.json'), `${JSON.stringify(rep, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, 'REPORT.md'), `${formatReport(rep)}\n`);

  // raw payloads, in the exact shape composition.ts consumes, for anyone who wants to re-measure
  // without importing the generator
  writeFileSync(
    join(OUT_DIR, 'fixtures.json'),
    `${JSON.stringify(
      {
        provenance: rep.fixtureProvenance,
        generator: 'packages/evals/src/composition-families.mjs (buildFamilies)',
        format: 'x,y,z,sx,sy,sz,yawDeg',
        fixtures: buildFamilies().map((f) => ({
          id: f.id, family: f.family, label: f.label, variant: f.variant,
          synthetic: true, intent: f.intent, set: run.splits.assignment[f.family], layout: f.layout,
        })),
      },
      null,
      1,
    )}\n`,
  );

  const sheets = join(OUT_DIR, 'sheets');
  mkdirSync(sheets, { recursive: true });
  const byId = Object.fromEntries(run.measured.map((r) => [r.id, r]));
  const order = ['good/v0', 'good/v1', 'bad/v0', 'bad/v1'];
  for (const family of [...new Set(run.measured.map((r) => r.family))]) {
    const heroes = order
      .map((k) => byId[`${family}/${k}`])
      .filter(Boolean)
      .map((r) => ({ rgb: r.views.find((v) => v.name === 'hero').rgbBuffer }));
    if (heroes.some((h) => !h.rgb)) continue;
    const sheet = contactSheet(heroes, RENDER_W, RENDER_H);
    writeFileSync(join(sheets, `${family}.png`), encodePng(sheet.rgb, sheet.width, sheet.height));
  }

  process.stdout.write(`${formatReport(rep)}\n`);
  process.stdout.write(`\nwritten: ${join(OUT_DIR, 'report.json')}, REPORT.md, fixtures.json, sheets/*.png\n`);
}

export { spearman };
