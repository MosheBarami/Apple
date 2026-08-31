// Tests for the prop quality benchmark.  node --test src/props.test.mjs
//
// THE LOAD-BEARING TEST is "the ugly trophy": three default-grey Plastic boxes stacked into a
// base/stem/bowl silhouette — the object that started this project by passing every check the
// system had. It must be REJECTED, and a properly built trophy must PASS. Either half alone
// proves nothing: a benchmark that rejects everything would satisfy the first, and one that
// accepts everything would satisfy the second.
//
// The second load-bearing property is that the ugly trophy is trophy-SHAPED. Its archetype score
// is high and its outer silhouette variation is HIGHER than the good trophy's. The benchmark
// rejects it anyway. If a future change starts rejecting it on shape, the test that asserts the
// shape clauses still pass will fail, and that is deliberate — it would mean the benchmark had
// quietly become a shape detector instead of a quality gate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  loadSuite,
  loadFixture,
  getPropSpec,
  gradeProp,
  measureProp,
  detectHardFails,
  weightedTotal,
  detailScale,
  surfaceMeasures,
  silhouetteMetrics,
  interiorEdgeDensity,
  geometryMask,
  bandScore,
  atLeast,
  atMost,
  cv,
  saturation,
  formatPropReport,
  GATE,
  SIGNALS,
  SCORED_SIGNALS,
  FIXTURES_DIR,
} from './props.mjs';
import { renderScene } from './render-scene.mjs';
import {
  buildSuiteFixtures,
  GOOD_BUILDERS,
  DEGRADATIONS,
  uglyTrophy,
  greyify,
  partSpam,
} from '../tasks-visual/props/build-fixtures.mjs';

const suite = loadSuite();
const trophySpec = getPropSpec(suite, 'trophy');

/** Fixtures are read from the checked-in JSON, not from the builder, so the test exercises the
 *  same bytes a human can open and inspect. */
const uglyFromDisk = loadFixture('trophy-ugly');
const goodFromDisk = loadFixture('trophy-good');

const gradeUgly = gradeProp(uglyFromDisk, trophySpec, suite);
const gradeGood = gradeProp(goodFromDisk, trophySpec, suite);

// ---------------------------------------------------------------------------------------------

describe('the ugly trophy — the origin bug', () => {
  test('the fixture on disk really is the bug: three parts, all default grey Plastic', () => {
    assert.equal(uglyFromDisk.parts.length, 3);
    for (const p of uglyFromDisk.parts) {
      assert.equal(p.material, 'Plastic');
      assert.deepEqual(p.color, [163, 162, 165]);
    }
  });

  test('IT IS REJECTED', () => {
    assert.equal(gradeUgly.passed, false, formatPropReport(gradeUgly));
    assert.ok(gradeUgly.total <= GATE.hardFailCap, `capped total ${gradeUgly.total} must be at or under ${GATE.hardFailCap}`);
  });

  test('and it is rejected for the right reasons, each naming a measured quantity', () => {
    const ids = gradeUgly.hardFails.map((f) => f.id);
    for (const expected of ['factory-default-parts', 'single-material', 'no-small-detail', 'no-scale-hierarchy', 'part-starved']) {
      assert.ok(ids.includes(expected), `expected hard fail "${expected}", got ${ids.join(', ')}`);
    }
    for (const f of gradeUgly.hardFails) assert.match(f.detail, /\d/, `hard fail ${f.id} cites no number: "${f.detail}"`);
  });

  test('it IS trophy-shaped — the benchmark does not reject it on silhouette outline', () => {
    // Every archetype clause except the part budget is satisfied: aspect, waist, mass
    // distribution and footprint are all inside the trophy bands.
    const shapeChecks = gradeUgly.scores.archetype.checks.filter((c) => c.id !== 'part_budget');
    assert.deepEqual(
      shapeChecks.filter((c) => !c.ok).map((c) => c.id),
      [],
      'the ugly trophy stopped being trophy-shaped; the fixture or the bands drifted',
    );
    // and its OUTER profile variation beats the good build's, which is exactly why outer
    // silhouette alone can never be the gate
    assert.ok(
      gradeUgly.measured.silhouette.profileCV >= gradeGood.measured.silhouette.profileCV,
      `ugly profileCV ${gradeUgly.measured.silhouette.profileCV} vs good ${gradeGood.measured.silhouette.profileCV}`,
    );
  });

  test('what actually separates it is interior structure, by a wide margin', () => {
    const ugly = gradeUgly.measured.silhouette.interiorEdgeDensity;
    const good = gradeGood.measured.silhouette.interiorEdgeDensity;
    assert.ok(good > ugly * 4, `interior edge density: good ${good} vs ugly ${ugly} — separation collapsed`);
  });

  test('piling on parts does not rescue it: 240 more boxes still fails', () => {
    const g = gradeProp(partSpam(uglyFromDisk), trophySpec, suite);
    assert.equal(g.passed, false);
  });
});

describe('the good trophy — the positive control', () => {
  test('IT PASSES', () => {
    assert.equal(gradeGood.passed, true, formatPropReport(gradeGood));
    assert.ok(gradeGood.total >= GATE.passThreshold);
  });

  test('it trips no hard fail', () => {
    assert.deepEqual(gradeGood.hardFails, []);
  });

  test('every scored signal produces evidence that cites a number', () => {
    for (const s of SCORED_SIGNALS) {
      const r = gradeGood.scores[s.id];
      assert.ok(r, `missing score for ${s.id}`);
      assert.match(r.evidence, /\d/, `${s.id} evidence has no measured value: "${r.evidence}"`);
      assert.ok(r.evidence.length > 25, `${s.id} evidence too thin: "${r.evidence}"`);
    }
  });

  test('greying it out — same geometry, no colour or material choice — flips it to a fail', () => {
    const g = gradeProp(greyify(goodFromDisk), trophySpec, suite);
    assert.equal(g.passed, false);
    assert.ok(g.hardFails.some((f) => f.id === 'factory-default-parts'));
    // geometry signals must be untouched: greyify changed no size and no position
    assert.equal(g.measured.parts, gradeGood.measured.parts);
    assert.deepEqual(g.measured.scale.shares, gradeGood.measured.scale.shares);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the suite', () => {
  test('covers all ten required nouns', () => {
    const need = ['trophy', 'fountain', 'portal', 'lamp', 'chest', 'machine', 'altar', 'kiosk', 'monument', 'tree'];
    const have = suite.props.map((p) => p.id);
    for (const n of need) assert.ok(have.includes(n), `suite is missing "${n}"`);
  });

  test('every noun has a checked-in good fixture that passes', () => {
    for (const spec of suite.props) {
      const scene = loadFixture(`${spec.id}-good`);
      const g = gradeProp(scene, spec, suite);
      assert.equal(g.passed, true, formatPropReport(g));
    }
  });

  test('every band references a measurable field and is ordered lo <= hi', () => {
    for (const spec of suite.props) {
      for (const [k, v] of Object.entries(spec.archetype ?? {})) {
        if (!Array.isArray(v)) continue;
        assert.equal(v.length, 2, `${spec.id}.${k} is not a band`);
        assert.ok(v[0] <= v[1], `${spec.id}.${k} band is inverted`);
      }
      assert.ok(spec.partBudget[0] < spec.partBudget[1], `${spec.id} part budget is inverted`);
    }
  });
});

describe('the fixture grid: every fixture is graded as labelled', () => {
  const fixtures = buildSuiteFixtures({ degradeAll: true });

  test('the grid contains both positive and negative controls', () => {
    assert.ok(fixtures.filter((f) => f.expect === 'pass').length >= 10);
    assert.ok(fixtures.filter((f) => f.expect === 'fail').length >= 10);
  });

  for (const f of fixtures) {
    test(`${f.id} is graded ${f.expect}`, () => {
      const g = gradeProp(f.scene, getPropSpec(suite, f.prop), suite);
      assert.equal(g.passed, f.expect === 'pass', formatPropReport(g));
    });
  }
});

/**
 * Measured blind spots, recorded rather than papered over.
 *
 * The list is asserted to be EXACT: a new blind spot fails the test, and a blind spot that gets
 * fixed also fails it, so the record cannot go stale. Every entry names the numbers.
 */
const KNOWN_BLIND = [
  {
    prop: 'chest',
    degradation: 'boxed',
    why:
      'A chest IS a box. Collapsing it to three stacked masses over the same bounds moves profileCV ' +
      '0.187 -> 0.168 and interior edge density 0.142 -> 0.134, both still inside the chest band, so ' +
      'the silhouette signal cannot see it. The fixture is still rejected — on part budget, small ' +
      'detail and scale hierarchy — but not by the signal the degradation targets.',
  },
];

describe('each degradation is caught by the signal it targets', () => {
  // The point of deriving bad fixtures instead of authoring them: a signal that claims to measure
  // colour choice must move when only colour changes. If "factory_default" were secretly counting
  // parts, greyify would not move it and this test would fail.
  const blind = [];
  for (const [prop, build] of Object.entries(GOOD_BUILDERS)) {
    const good = build();
    const spec = getPropSpec(suite, prop);
    const base = gradeProp(good, spec, suite);
    for (const [name, deg] of Object.entries(DEGRADATIONS)) {
      test(`${prop}: ${name} lowers ${deg.targets}, or is a recorded blind spot that still fails`, () => {
        const g = gradeProp(deg.fn(good), spec, suite);
        const before = base.scores[deg.targets].score;
        const after = g.scores[deg.targets].score;
        if (after < before - 0.05) return;
        blind.push({ prop, degradation: name });
        const known = KNOWN_BLIND.find((k) => k.prop === prop && k.degradation === name);
        assert.ok(
          known,
          `NEW BLIND SPOT: ${deg.targets} scored ${after} after "${name}" vs ${before} before. The signal did not move, so on this noun it is not measuring what it claims (${deg.why}). Either fix the signal or record the blind spot in KNOWN_BLIND with its numbers.`,
        );
        assert.equal(g.passed, false, `${prop}-${name} is a blind spot for ${deg.targets} AND passes the gate — nothing catches it`);
      });
    }
  }

  test('the recorded blind-spot list is exact', () => {
    assert.deepEqual(
      blind.map((b) => `${b.prop}/${b.degradation}`).sort(),
      KNOWN_BLIND.map((b) => `${b.prop}/${b.degradation}`).sort(),
      'the set of signals that fail to move no longer matches the record',
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe('gate invariants', () => {
  test('a hard fail can never pass, whatever the weighted score says', () => {
    assert.ok(GATE.hardFailCap < GATE.passThreshold);
  });

  test('a fixture with every signal at 1.0 but one hard fail is still capped', () => {
    const perfect = Object.fromEntries(SCORED_SIGNALS.map((s) => [s.id, { score: 1, evidence: 'synthetic' }]));
    assert.equal(weightedTotal(perfect), 1);
    // the cap is applied in gradeProp; assert the arithmetic it relies on
    assert.ok(Math.min(1, GATE.hardFailCap) < GATE.passThreshold);
  });

  test('signal weights sum to 1', () => {
    assert.ok(Math.abs(SCORED_SIGNALS.reduce((a, s) => a + s.weight, 0) - 1) < 1e-9);
  });

  test('the model-dependent signals are declared and carry zero weight', () => {
    const modelOnly = SIGNALS.filter((s) => !s.deterministic);
    assert.ok(modelOnly.length >= 3, 'the model-dependent gap must be declared, not hidden');
    for (const s of modelOnly) assert.equal(s.weight, 0, `${s.id} is model-dependent but weighted into a deterministic gate`);
    assert.deepEqual(gradeGood.modelSignalsOutstanding.sort(), modelOnly.map((s) => s.id).sort());
  });

  test('grading is deterministic: the same scene twice gives the same total', () => {
    const a = gradeProp(goodFromDisk, trophySpec, suite);
    const b = gradeProp(goodFromDisk, trophySpec, suite);
    assert.equal(a.total, b.total);
    assert.deepEqual(a.hardFails, b.hardFails);
  });
});

describe('measurement primitives', () => {
  test('the geometry mask agrees with the rasteriser background constants', () => {
    // If SKY_RGB/GROUND_RGB drift out of sync with render-scene.mjs the mask goes empty and
    // every silhouette number silently becomes zero. Assert it recovers a real silhouette.
    const r = renderScene(goodFromDisk, { width: 288, height: 180, view: 'front' });
    const v = r.views[0];
    const mask = geometryMask(v.rgb, v.meta.width, v.meta.height);
    const filled = mask.reduce((a, b) => a + b, 0);
    assert.ok(filled > 500, `mask recovered only ${filled} geometry pixels — background constants have drifted`);
    assert.ok(filled < v.meta.width * v.meta.height * 0.9, 'mask claims almost the whole frame is geometry');
  });

  test('a single flat slab has low profile variation and near-full box fill', () => {
    // Not zero: the front camera sits slightly above centre, so perspective tapers the top and
    // bottom rows by a few pixels. Measured 0.091 — what matters is that it is far below any
    // shaped prop in the suite (the good trophy is 0.464).
    const slab = { name: 'slab', parts: [{ name: 'S', material: 'Plastic', size: [8, 8, 1], pos: [0, 4, 0], color: [163, 162, 165], transparency: 0 }] };
    const r = renderScene(slab, { width: 288, height: 180, view: 'front' });
    const s = silhouetteMetrics(r.views[0].rgb, 288, 180);
    assert.ok(s.profileCV < 0.12, `a slab measured profileCV ${s.profileCV}`);
    assert.ok(s.profileCV < gradeGood.measured.silhouette.profileCV / 3, 'a slab is not clearly flatter than a built trophy');
    // 0.862, not 1.0: the camera is off-axis enough to show a sliver of the top face, so the
    // silhouette is a trapezoid inside its bounding box rather than a filled rectangle.
    assert.ok(s.boxFill > 0.84, `a slab measured boxFill ${s.boxFill}`);
    assert.ok(s.boxFill > gradeGood.measured.silhouette.boxFill * 1.3, 'a slab does not fill its box more than a built trophy does');
  });

  test('interior edge density ignores the silhouette against the sky', () => {
    // A single untextured box has a large outline and no interior structure. If the measure were
    // counting silhouette edges this would come back high.
    const cube = { name: 'cube', parts: [{ name: 'C', material: 'Plastic', size: [6, 6, 6], pos: [0, 3, 0], color: [163, 162, 165], transparency: 0 }] };
    const r = renderScene(cube, { width: 288, height: 180, view: 'front' });
    const { interiorEdgeDensity: d } = interiorEdgeDensity(r.views[0].rgb, 288, 180);
    assert.ok(d < 0.02, `a bare cube measured interior edge density ${d}`);
  });

  test('detail-scale buckets are relative to the cube-equivalent size, not to height', () => {
    // A 1x20x1 mast and a 20x1x20 platter made of the same parts must bucket the same way; using
    // the largest dimension would put everything in "small" for the mast.
    const parts = [
      { name: 'a', material: 'Metal', size: [4, 4, 4], pos: [0, 2, 0], color: [1, 2, 3] },
      { name: 'b', material: 'Metal', size: [1, 1, 1], pos: [0, 6, 0], color: [1, 2, 3] },
    ];
    const d = detailScale(parts, [4, 8, 4]);
    assert.equal(d.occupiedBuckets, 2);
    assert.ok(d.entropy > 0);
  });

  test('surface measures count factory-default parts, not merely grey ones', () => {
    const s = surfaceMeasures([
      { material: 'Plastic', color: [163, 162, 165] },
      { material: 'Marble', color: [163, 162, 165] },
      { material: 'Foil', color: [212, 175, 55] },
    ]);
    assert.equal(s.factoryShare, 1 / 3, 'a grey MARBLE part is a choice, not a default');
    assert.ok(Math.abs(s.greyShare - 2 / 3) < 1e-9);
    assert.equal(s.distinctMaterials, 3);
  });

  test('band and threshold helpers behave at their edges', () => {
    assert.equal(bandScore(5, [1, 10]), 1);
    assert.equal(bandScore(1, [1, 10]), 1);
    assert.ok(bandScore(20, [1, 10]) < 1);
    assert.equal(atLeast(10, 1, 5), 1);
    assert.equal(atLeast(0, 1, 5), 0);
    assert.equal(atMost(0, 5, 1), 1);
    assert.equal(atMost(9, 5, 1), 0);
    assert.equal(cv([4, 4, 4]), 0);
    assert.ok(cv([1, 5, 9]) > 0.5);
    assert.ok(saturation([163, 162, 165]) < 0.05);
    assert.ok(saturation([212, 175, 55]) > 0.5);
  });

  test('measureProp refuses a scene with nothing in it', () => {
    assert.throws(() => measureProp({ name: 'empty', parts: [] }), /no renderable parts/);
  });

  test('hard fails are reported with the numbers that produced them', () => {
    const fails = detectHardFails(gradeUgly.measured, trophySpec);
    assert.ok(fails.length > 0);
    for (const f of fails) assert.ok(f.id && f.detail, 'a hard fail with no detail is not evidence');
  });
});
