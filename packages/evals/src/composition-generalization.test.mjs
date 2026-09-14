// Regression tests for the generalization study.
//
// Two different jobs are done here, and they are kept apart on purpose.
//
// 1. PROTECT THE EXPERIMENT. A generalization result is only worth anything if the fixture set
//    cannot separate its own classes by counting parts, materials or colours; if the three sets
//    are genuinely disjoint; if the split is deterministic rather than reshuffled until the
//    numbers look better; and if the metrics this project already FALSIFIED stay falsified. Each
//    of those is asserted below, because each of them is a way this study could quietly become a
//    lie without anyone editing a number.
//
// 2. PROTECT THE RECORDED FINDING. `tasks-visual/composition/generalization/report.json` holds
//    the measured result. The last test re-measures and compares. If apps/worker/src/
//    composition.ts changes, this test fails and says so — which is the point: the recorded
//    finding must be re-run and reviewed, not silently invalidated.
//
// The headline finding these tests sit on top of, stated plainly so nobody has to open the JSON:
// the gate FALSE-REJECTS about a third of competent scenes once you leave the plaza, almost all
// of them enclosed or wall-adjacent, because plan clustering fuses such a scene into a single
// vertical element and `verticalDominance` then returns its "nothing dominates" sentinel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildFamilies, FAMILIES, VARIANTS, DESIGNED_HARD_CASES } from './composition-families.mjs';
import { buildSplits, disjointnessProof, familyAssignment, SET_NAMES, SPLIT_SEED } from './composition-splits.mjs';
import {
  measureAll, report, gateVariant, PRODUCTION_RULES, FALSIFIED, KEPT, CONTROLS, OUT_DIR,
} from './composition-generalization.mjs';

const fixtures = buildFamilies();
const splits = buildSplits(fixtures);
const run = await measureAll();
const rep = report(run);

// ---------------------------------------------------------------------------------------------
// The fixtures themselves
// ---------------------------------------------------------------------------------------------

test('fifteen independent families, good and bad, two variants each', () => {
  assert.equal(FAMILIES.length, 15, 'the brief asks for at least fifteen families');
  assert.equal(fixtures.length, FAMILIES.length * 2 * VARIANTS);
  for (const family of FAMILIES) {
    const rows = fixtures.filter((f) => f.family === family);
    assert.equal(rows.filter((f) => f.label === 'good').length, VARIANTS, `${family} needs good exemplars`);
    assert.equal(rows.filter((f) => f.label === 'bad').length, VARIANTS, `${family} needs bad exemplars`);
  }
});

test('every fixture is a SceneLayout-shaped payload, matching what composition.ts parses', () => {
  // apps/worker/src/composition.ts -> structureFromLayout(parts) expects
  // [x, y, z, sx, sy, sz, yawDeg] per part, which is @golem/shared's SceneLayout.parts.
  for (const f of fixtures) {
    assert.equal(f.layout.format, 'x,y,z,sx,sy,sz,yawDeg', `${f.id} declares the wrong wire format`);
    assert.equal(f.layout.skipped, 0);
    assert.ok(Array.isArray(f.layout.parts) && f.layout.parts.length > 0, `${f.id} has no parts`);
    for (const p of f.layout.parts) {
      assert.equal(p.length, 7, `${f.id} has a part tuple of the wrong length`);
      assert.ok(p.every((n) => typeof n === 'number' && Number.isFinite(n)), `${f.id} has a non-finite number`);
      assert.ok(p[3] > 0 && p[4] > 0 && p[5] > 0, `${f.id} has a zero-sized part`);
    }
  }
});

test('the fixtures are labelled SYNTHETIC and the captured fixtures are still labelled REAL', () => {
  // Passing generated geometry off as captured scenes would be the worst failure available here.
  for (const f of fixtures) assert.equal(f.synthetic, true, `${f.id} is not flagged synthetic`);
  assert.match(rep.fixtureProvenance, /SYNTHETIC/);
  assert.match(rep.groundTruth, /NOT an independent blind jury/);

  const src = readFileSync(new URL('./composition-families.mjs', import.meta.url), 'utf8');
  assert.match(src, /THESE ARE SYNTHETIC/, 'the generator must say so in its own header');

  // and the pre-existing captured/derived ladder is untouched
  const ladder = readFileSync(new URL('./composition-ladder.mjs', import.meta.url), 'utf8');
  assert.match(ladder, /REAL — the scene the owner rejected/);
  assert.match(ladder, /REAL — production agent output/);
});

test('fixture generation is deterministic', () => {
  // Same bytes on every machine and every run, or none of the numbers below mean anything.
  assert.equal(JSON.stringify(buildFamilies()), JSON.stringify(buildFamilies()));
});

// ---------------------------------------------------------------------------------------------
// The three sets
// ---------------------------------------------------------------------------------------------

test('CALIBRATION, VALIDATION and REGRESSION are disjoint — the proof, not the claim', () => {
  const proof = disjointnessProof(splits);
  assert.deepEqual(proof.idCollisions, [], 'a fixture appears in more than one set');
  assert.deepEqual(proof.familyCollisions, [], 'a family appears in more than one set');
  assert.deepEqual(proof.uncovered, [], 'a fixture belongs to no set');
  assert.equal(proof.duplicateIds, false, 'two fixtures share an id');
  assert.equal(proof.coveredFixtures, proof.totalFixtures);
  assert.equal(proof.disjoint, true);

  // pairwise emptiness of the intersections, stated the obvious way as well
  for (let i = 0; i < SET_NAMES.length; i++) {
    for (let j = i + 1; j < SET_NAMES.length; j++) {
      const a = new Set(splits.sets[SET_NAMES[i]].map((f) => f.id));
      const b = splits.sets[SET_NAMES[j]].map((f) => f.id);
      assert.deepEqual(b.filter((id) => a.has(id)), [], `${SET_NAMES[i]} and ${SET_NAMES[j]} overlap`);
    }
  }
});

test('the split is seeded and stable, not reshuffled per run', () => {
  assert.equal(SPLIT_SEED, 20260831, 'the split seed is a written-down constant');
  assert.deepEqual(familyAssignment(), familyAssignment());
  // Pinned: a reshuffle that quietly moved an inconvenient family out of VALIDATION would show up
  // here as a failing test rather than as a better-looking number.
  assert.deepEqual(disjointnessProof(splits).familiesPerSet, {
    CALIBRATION: ['cave', 'monument', 'obby', 'small-house', 'tavern'],
    VALIDATION: ['horror-corridor', 'lobby', 'outdoor-garden', 'plaza', 'simulator-hub'],
    REGRESSION: ['fantasy-area', 'industrial', 'interior', 'sci-fi-room', 'shop'],
  });
});

test('every set is balanced and non-trivial', () => {
  const proof = disjointnessProof(splits);
  for (const n of SET_NAMES) {
    assert.equal(proof.labelBalance[n].good, 10, `${n} good count`);
    assert.equal(proof.labelBalance[n].bad, 10, `${n} bad count`);
  }
});

// ---------------------------------------------------------------------------------------------
// The experiment cannot be won by counting
// ---------------------------------------------------------------------------------------------

test('the classes are NOT separable by part, material or colour count', () => {
  // The twelve-rung ladder gets this property by deriving its fixtures from one scene. This set
  // gets it by matching each bad exemplar's budget to its good sibling. The first version of these
  // fixtures scored control.materialCount at AUC 0.997, which made every other number here
  // meaningless; this test is what stops that coming back.
  for (const c of CONTROLS) {
    const row = rep.metricTable.find((m) => m.metric === c);
    assert.ok(row, `${c} missing from the metric table`);
    assert.ok(
      Math.abs(row.aucAll - 0.5) < 0.25,
      `${c} separates the classes at AUC ${row.aucAll} — the fixture budgets are unbalanced and every other AUC here is confounded`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// Falsified metrics stay falsified
// ---------------------------------------------------------------------------------------------

test('no previously falsified metric has been promoted into the kept list', () => {
  for (const m of Object.keys(FALSIFIED)) {
    assert.ok(!(m in KEPT), `${m} was falsified on the ladder and must not be resurrected here`);
  }
  // the specific refutations docs/COMPOSITION.md records, still recorded
  assert.ok('energyGini' in FALSIFIED, 'the central refuted hypothesis must stay recorded as refuted');
  assert.ok('energyEntropy' in FALSIFIED);
  assert.ok('centroidOffset' in FALSIFIED, 'centroidOffset scored 1.000 on the ladder and is still excluded');
  assert.ok('structure.massHierarchy' in FALSIFIED);
  assert.ok('maskedColorfulness' in FALSIFIED, 'maskedColorfulness is a greyness floor, never a palette grader');
});

test('a falsified metric scoring above chance HERE is reported, not promoted', () => {
  // energyGini and energyEntropy both come out above 0.5 on these families. That is not a
  // rehabilitation: the ladder that refuted them had blind-jury labels and this set does not.
  // The test asserts the reporting, so the temptation is at least visible in the diff.
  for (const m of ['energyGini', 'energyEntropy']) {
    const row = rep.metricTable.find((x) => x.metric === m);
    assert.equal(row.status, 'FALSIFIED (ladder)', `${m} must still be reported as falsified`);
    assert.ok(row.falsifiedReason, `${m} must carry the reason it was falsified`);
  }
});

// ---------------------------------------------------------------------------------------------
// The harness matches production
// ---------------------------------------------------------------------------------------------

test('the counterfactual replica reproduces the production gate exactly', () => {
  // gateVariant() is the only place a threshold recommendation can be evaluated without editing
  // apps/worker/src/composition.ts. If the production rules change and the replica does not, the
  // counterfactual table becomes fiction — so the two are compared on all 60 fixtures.
  for (const r of run.measured) {
    const replica = gateVariant(r, PRODUCTION_RULES);
    assert.equal(
      replica.length > 0,
      r.fails.length > 0,
      `${r.id}: replica says ${JSON.stringify(replica)}, production says ${JSON.stringify(r.fails)}`,
    );
  }
  assert.equal(PRODUCTION_RULES.verticalDominance, run.gates.verticalDominance);
  assert.equal(PRODUCTION_RULES.heightHierarchy, run.gates.heightHierarchy);
  assert.equal(PRODUCTION_RULES.maskedColorfulness, run.gates.maskedColorfulness);
});

test('the structural half of the gate is camera-invariant by construction', () => {
  // Not a statistical claim: structureFromLayout reads SceneLayout geometry and is never given a
  // camera. Asserted so that a future change that sneaks a view into it is caught.
  for (const r of run.measured) {
    const rules = new Set(['nothing-stands-up', 'no-landmark', 'no-vertical-variation']);
    const structural = gateVariant(r).filter((x) => rules.has(x));
    for (const view of r.views) {
      const perCamera = gateVariant({ ...r, views: [view] }).filter((x) => rules.has(x));
      assert.deepEqual(perCamera, structural, `${r.id}: structural verdict moved with camera ${view.name}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// The findings themselves
// ---------------------------------------------------------------------------------------------

test('the gate still catches the named failure modes it was built for', () => {
  // These are the bad exemplars that reproduce failures this project has already observed in
  // production: cloned props on a lattice, competing equal verticals, a flat plate, a grey box.
  const mustFail = [
    'plaza/bad/v0', 'plaza/bad/v1',            // the live-Studio competing-verticals failure
    'obby/bad/v0', 'obby/bad/v1',              // nothing stands up at all
    'monument/bad/v0', 'monument/bad/v1',      // every landmark identical
    'outdoor-garden/bad/v0', 'fantasy-area/bad/v0', // one prop cloned onto a lattice
    'industrial/bad/v0',                       // the 725-part tiled-mush failure
    'small-house/bad/v0',                      // the grey box
  ];
  const byId = Object.fromEntries(run.measured.map((r) => [r.id, r]));
  for (const id of mustFail) {
    assert.ok(byId[id], `${id} missing from the fixture set`);
    assert.ok(byId[id].fails.length > 0, `${id} passed the gate; it reproduces a known production failure`);
  }
});

test('the false-reject finding is real, not one unlucky family', () => {
  // The result this workstream exists to report. Asserted as a floor across TWO independently
  // assigned sets so it cannot be dismissed as a fluke of whichever families landed where.
  // If a future change to composition.ts fixes this, the test fails and the finding gets rewritten
  // — which is the correct outcome, not a false alarm.
  const cal = rep.bySet.CALIBRATION.productionGate.falseRejectRate;
  const val = rep.bySet.VALIDATION.productionGate.falseRejectRate;
  const reg = rep.bySet.REGRESSION.productionGate.falseRejectRate;
  assert.ok(
    cal >= 0.2 && val >= 0.2 && reg >= 0.2,
    `false-reject rates CAL ${cal} VAL ${val} REG ${reg}: if these have dropped, the recorded finding in docs is stale and must be re-run`,
  );
  assert.ok(
    rep.falseRejectProvenance.plainScenesRejected.length >= 5,
    'most false rejections must be on plain scenes, not on the fixtures written to be hostile',
  );
});

test('the enclosure mechanism explains most of the false rejections', () => {
  assert.ok(
    rep.enclosureAnalysis.shareOfFalseRejects >= 0.5,
    `only ${rep.enclosureAnalysis.shareOfFalseRejects} of false rejections come from single-element fusion; the recorded explanation is stale`,
  );
  assert.ok(rep.enclosureAnalysis.fixturesWithAtMostOneVerticalElement > 0);
});

test('verticalElements no longer separates outside the plaza — a kept metric, falsified here', () => {
  // docs/COMPOSITION.md records structure.verticalElements at AUC 1.000 on the twelve-rung ladder.
  // On fifteen independent families it is at or below chance. Asserted so the finding cannot be
  // lost, and so that if it ever recovers somebody has to come and delete this test deliberately.
  const row = rep.metricTable.find((m) => m.metric === 'structure.verticalElements');
  assert.equal(row.ladderAuc, 1.0);
  assert.ok(
    row.aucAll < 0.55,
    `structure.verticalElements scored ${row.aucAll} here against 1.000 on the ladder; if it has recovered, re-run the study and rewrite the finding`,
  );
});

test('the gate works on OPEN scenes and fails on ENCLOSED ones — the sharpest result here', () => {
  // Open exterior scenes: plaza, garden, obby, simulator-hub, industrial, fantasy, monument.
  // Enclosed scenes: any family with a roof or ceiling.
  // The gate separates the first group perfectly and the second group barely at all. Two causes,
  // both structural rather than a matter of thresholds:
  //   1. plan clustering fuses a shell and everything touching it into ONE vertical element, so
  //      verticalDominance returns its "nothing dominates" sentinel;
  //   2. the framing camera orbits the bounding box, so on a roofed scene it photographs a lid —
  //      see generalization/sheets/interior.png.
  const e = rep.enclosedCameraAnalysis;
  assert.ok(
    e.falseRejectRate.open <= 0.1,
    `open scenes now false-reject at ${e.falseRejectRate.open}; the recorded finding said the gate was clean on exteriors`,
  );
  assert.ok(
    e.falseRejectRate.enclosed >= 0.4,
    `enclosed scenes now false-reject at ${e.falseRejectRate.enclosed}; if this has been fixed, re-run the study and rewrite the finding`,
  );
  assert.ok(
    e.meanMaskedColorfulness.enclosed < e.meanMaskedColorfulness.open,
    'a roofed scene should measure less colourful than an open one, because the camera sees its lid',
  );
});

test('camera sensitivity is measured and bounded', () => {
  const cs = rep.cameraSensitivity;
  assert.equal(cs.cameras.length, 5);
  assert.ok(typeof cs.fixturesWhoseGateDecisionDependsOnCamera === 'number');
  // the gated pixel statistic moves substantially with the camera — this is the number that says
  // judging a scene from one view is not the same as judging it from five
  assert.ok(
    cs.viewMetricSpread.maskedColorfulness.medianRelativeRange > 0.2,
    'maskedColorfulness is claimed to be camera-sensitive; measure says otherwise',
  );
  for (const c of cs.cameras) {
    assert.ok(
      cs.perCameraConfusion[c].falseRejectRate >= cs.productionGateConfusion.falseRejectRate,
      `single camera ${c} should be at least as trigger-happy as the five-camera gate`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// The recorded report must not go stale
// ---------------------------------------------------------------------------------------------

/** The tightest tolerance that is still larger than float noise in a 3-decimal rounded figure. */
const HEADLINE_TOLERANCE = 0.002;

/**
 * deepEqual, except two numbers within HEADLINE_TOLERANCE are the same number.
 *
 * Structure is compared exactly: a missing key, an extra key, a changed string or a changed
 * length is a real difference and must still fail. Only the magnitude of a number is forgiving.
 */
function assertHeadlineMatches(fresh, saved, message, path = '') {
  if (typeof fresh === 'number' && typeof saved === 'number') {
    assert.ok(
      Math.abs(fresh - saved) <= HEADLINE_TOLERANCE,
      `${message}\n  ${path || 'value'}: fresh ${fresh} vs recorded ${saved} (tolerance ${HEADLINE_TOLERANCE})`,
    );
    return;
  }
  if (fresh === null || saved === null || typeof fresh !== 'object' || typeof saved !== 'object') {
    assert.deepEqual(fresh, saved, `${message}\n  at ${path || 'root'}`);
    return;
  }
  const keys = [...new Set([...Object.keys(fresh), ...Object.keys(saved)])].sort();
  assert.deepEqual(
    Object.keys(fresh).sort(), Object.keys(saved).sort(),
    `${message}\n  the shape changed at ${path || 'root'}`,
  );
  for (const k of keys) assertHeadlineMatches(fresh[k], saved[k], message, path ? `${path}.${k}` : k);
}

test('the checked-in report matches a fresh measurement', () => {
  const path = join(OUT_DIR, 'report.json');
  assert.ok(existsSync(path), `missing ${path} — run: node src/composition-generalization.mjs`);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  const headline = (r) => ({
    overall: r.overall,
    bySet: r.bySet,
    perFamily: r.perFamily,
    failReasonBreakdown: r.failReasonBreakdown,
    enclosureAnalysis: r.enclosureAnalysis,
    enclosedCameraAnalysis: r.enclosedCameraAnalysis,
    counterfactuals: r.counterfactuals,
    metricAuc: Object.fromEntries(r.metricTable.map((m) => [m.metric, m.aucAll])),
    cameraFlips: r.cameraSensitivity.fixturesWhoseGateDecisionDependsOnCamera,
  });
  // NUMBERS COMPARED WITHIN A TOLERANCE, everything else exactly.
  //
  // Every figure here is `Math.round(x * 1000) / 1000`, so a value sitting on a rounding boundary
  // flips between 0.397 and 0.398 on a difference far below anything that means something. This
  // guard failed exactly that way during a full `pnpm -r test` — interiorEdgeDensity's AUC — and
  // passed 4/4 in isolation, which is the signature of noise rather than staleness.
  //
  // An intermittent staleness guard is worse than none: it teaches whoever meets it to re-run the
  // generator and commit the new report, which is the one response that destroys the thing the
  // guard exists to protect. The fix is not to loosen it into uselessness but to make its
  // threshold the size of a change worth acting on.
  //
  // 0.002 is five times the observed noise and five times SMALLER than the 0.01 that would move
  // any decision this report informs. A real drift still fails; a last-digit flip does not.
  assertHeadlineMatches(
    headline(rep),
    headline(saved),
    'the recorded findings are stale — re-run `node src/composition-generalization.mjs` and REVIEW the diff before committing it',
  );
});

test('the designed hard cases are declared up front', () => {
  // So a rejection on one of them cannot be presented later as a surprise discovery.
  assert.ok(DESIGNED_HARD_CASES.length > 0);
  for (const id of DESIGNED_HARD_CASES) {
    assert.ok(fixtures.some((f) => f.id === id), `${id} is declared a hard case but is not a fixture`);
    assert.ok(id.includes('/good/'), `${id} must be a GOOD fixture to be a hard case for a rejection rule`);
  }
});
