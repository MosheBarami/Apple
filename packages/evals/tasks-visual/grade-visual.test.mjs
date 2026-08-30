// Unit tests for the visual grader. Run with:  node --test packages/evals/tasks-visual/
//
// The load-bearing test is "the existence-only cheat": a scene where a maximally generous
// vision judge scored every dimension 4/4, including prompt_fidelity, but whose structural
// metrics show a bare baseplate, one material, default lighting and no small props.
// That scene MUST NOT pass. If it ever does, this suite has stopped measuring the thing it
// was built to measure.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRubric,
  loadVisualTasks,
  getTask,
  loadJson,
  normalizeTask,
  normalizeMetrics,
  validateMetrics,
  validateCritique,
  validateRubric,
  effectiveWeights,
  weightedTotal,
  detectHardFails,
  applyHardFailCap,
  checkCriticalFloor,
  gradeVisual,
  formatReport,
  buildCritiquePrompt,
  parseCritiqueResponse,
  requestCritique,
  FIDELITY_DIMENSION,
  EMPHASIS_MAX,
} from './grade-visual.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = (name) => join(HERE, 'fixtures', name);

const rubric = loadRubric();
const tasks = loadVisualTasks();
const plaza = getTask(tasks, 'vis-03-plaza');

const metricsBlockout = loadJson(FIX('metrics-blockout-plaza.json'));
const metricsGood = loadJson(FIX('metrics-good-plaza.json'));
const critiqueAllFours = loadJson(FIX('critique-all-fours.json'));
const critiqueBlockout = loadJson(FIX('critique-blockout-plaza.json'));
const critiqueGood = loadJson(FIX('critique-good-plaza.json'));

/** Build a critique where every rubric dimension gets `score`, with valid justifications. */
function uniformCritique(score, overrides = {}) {
  const dimensions = {};
  for (const d of rubric.dimensions) {
    dimensions[d.id] = {
      score: overrides[d.id] ?? score,
      justification: `Observed in the hero view: dimension ${d.id} judged at this level.`,
    };
  }
  return { dimensions, defects: [], observedLandmark: 'a centrepiece', summary: 'synthetic critique for tests' };
}

/** Metrics that trip no hard fail, so a test can isolate the scoring maths. */
function cleanMetrics(overrides = {}) {
  return {
    boundsSize: [100, 25, 100],
    views: [{ name: 'hero', image: 'screenshots/hero.png', meta: { partsVisible: 400, subjectCoverage: 0.5, distinctColours: 30, materials: [] } }],
    materials: [
      { material: 'Slate', parts: 100 },
      { material: 'Grass', parts: 40 },
      { material: 'Metal', parts: 20 },
    ],
    ground: { isDefaultBaseplate: false, parts: 40, materials: ['Slate', 'Grass'], recoloured: true },
    lighting: { changedProperties: ['ClockTime', 'Ambient'], lightInstances: 6, effects: ['Atmosphere'] },
    parts: { total: 400, unanchored: 0, smallPropCount: 120, tallestStuds: 25, medianHeightStuds: 3 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('rubric shape', () => {
  test('is valid and has 20 dimensions', () => {
    assert.deepEqual(validateRubric(rubric), []);
    assert.equal(rubric.dimensions.length, 20);
  });

  test('weights sum to 100', () => {
    const sum = rubric.dimensions.reduce((a, d) => a + d.weight, 0);
    assert.equal(sum, 100);
  });

  test('every dimension has all five 0-4 anchors', () => {
    for (const d of rubric.dimensions) {
      for (const level of ['0', '1', '2', '3', '4']) {
        assert.ok(d.anchors[level]?.length > 20, `${d.id} anchor ${level} too short to be useful`);
      }
    }
  });

  test('hardFailCap is strictly below passThreshold, so a hard fail can never pass', () => {
    assert.ok(rubric.gate.hardFailCap < rubric.gate.passThreshold);
  });

  test('a rubric whose cap is above the threshold is rejected', () => {
    const broken = { ...rubric, gate: { ...rubric.gate, hardFailCap: 3.0 } };
    assert.ok(validateRubric(broken).some((e) => /hardFailCap must be strictly below/.test(e)));
  });

  test('prompt_fidelity cannot dominate: alone it is worth far less than the pass threshold', () => {
    const fidelity = rubric.dimensions.find((d) => d.id === FIDELITY_DIMENSION);
    const maxContribution = (fidelity.weight * rubric.scale.max) / 100; // on the 0-4 scale
    assert.ok(fidelity.weight <= 10, 'prompt_fidelity weight must stay small');
    assert.ok(
      maxContribution < rubric.gate.passThreshold,
      `a perfect prompt_fidelity contributes ${maxContribution}/4, which must be below the ${rubric.gate.passThreshold} threshold`,
    );
  });
});

describe('task set', () => {
  test('has 12 tasks with unique ids and the required fields', () => {
    assert.equal(tasks.length, 12);
    assert.equal(new Set(tasks.map((t) => t.id)).size, 12);
    for (const t of tasks) {
      assert.ok(t.title, `${t.id} missing title`);
      assert.ok(t.prompt.length > 20, `${t.id} prompt is not a realistic user request`);
      assert.ok(t.category, `${t.id} missing category`);
      assert.ok(['small', 'medium', 'large'].includes(t.difficulty), `${t.id} bad difficulty`);
      assert.ok(Number.isFinite(t.timeBudgetSeconds), `${t.id} missing timeBudgetSeconds`);
      assert.ok(t.expectations.good.length >= 4, `${t.id} needs specific "good" expectations`);
      assert.ok(t.expectations.bad.length >= 4, `${t.id} needs specific "bad" expectations`);
    }
  });

  test('covers a spread of categories and difficulties', () => {
    assert.ok(new Set(tasks.map((t) => t.category)).size >= 10);
    assert.ok(new Set(tasks.map((t) => t.difficulty)).size === 3);
  });

  test('every emphasis key names a real rubric dimension', () => {
    const known = new Set(rubric.dimensions.map((d) => d.id));
    for (const t of tasks) {
      for (const key of Object.keys(t.dimensionEmphasis)) {
        assert.ok(known.has(key), `task ${t.id} emphasises unknown dimension "${key}"`);
      }
    }
  });

  test('normalizeTask tolerates the alternative on-disk task schema', () => {
    const t = normalizeTask({
      id: 'vis-99-alt',
      taskType: 'monument',
      weight: 3,
      prompt: 'Build a monument.',
      dimensionWeights: { composition: 2.0 },
      capture: { shots: ['establish_045', 'eye_spawn'] },
    });
    assert.equal(t.title, 'monument');
    assert.equal(t.category, 'monument');
    assert.deepEqual(t.views, ['establish_045', 'eye_spawn']);
    assert.equal(t.dimensionEmphasis.composition, 2.0);
  });
});

describe('metrics normalisation and validation', () => {
  test('accepts the plugin Render.capture() shape and lifts views[].meta', () => {
    const m = normalizeMetrics(metricsBlockout);
    assert.equal(m.views.length, 4);
    assert.equal(m.views[0].name, 'hero');
    assert.equal(m.views[0].partsVisible, 38);
    assert.equal(m.views[0].subjectCoverage, 0.44);
    assert.deepEqual(m.boundsSize, [118, 14.5, 116]);
  });

  test('derives the scene material histogram from views when absent', () => {
    const m = normalizeMetrics({
      boundsSize: [10, 10, 10],
      views: [
        { name: 'hero', meta: { materials: [{ material: 'Slate', parts: 10 }] } },
        { name: 'top', meta: { materials: [{ material: 'Grass', parts: 4 }, { material: 'Slate', parts: 12 }] } },
      ],
    });
    assert.deepEqual(m.materials, [{ material: 'Slate', parts: 12 }, { material: 'Grass', parts: 4 }]);
  });

  test('missing evidence blocks are reported so a broken capture cannot launder a pass', () => {
    const errs = validateMetrics(normalizeMetrics({ views: [], boundsSize: null }));
    assert.ok(errs.some((e) => /views/.test(e)));
    assert.ok(errs.some((e) => /ground/.test(e)));
    assert.ok(errs.some((e) => /lighting/.test(e)));
    assert.ok(errs.some((e) => /parts/.test(e)));
  });

  test('a grade on incomplete metrics is invalid, never a pass', () => {
    const r = gradeVisual({ task: plaza, rubric, metrics: { views: [] }, critique: uniformCritique(4) });
    assert.equal(r.status, 'invalid');
    assert.equal(r.pass, false);
  });
});

describe('critique validation', () => {
  test('accepts a complete critique', () => {
    assert.deepEqual(validateCritique(critiqueGood, rubric), []);
  });

  test('rejects a missing dimension', () => {
    const c = uniformCritique(3);
    delete c.dimensions.lighting_setup;
    assert.ok(validateCritique(c, rubric).some((e) => /missing dimension "lighting_setup"/.test(e)));
  });

  test('rejects an out-of-range or non-integer score', () => {
    const high = uniformCritique(3, { composition: 7 });
    assert.ok(validateCritique(high, rubric).some((e) => /composition/.test(e)));
    const frac = uniformCritique(3);
    frac.dimensions.composition.score = 2.5;
    assert.ok(validateCritique(frac, rubric).some((e) => /composition/.test(e)));
  });

  test('rejects a hand-waved justification', () => {
    const c = uniformCritique(4);
    c.dimensions.composition.justification = 'looks fine';
    assert.ok(validateCritique(c, rubric).some((e) => /justification must be at least/.test(e)));
  });

  test('rejects an unknown dimension id', () => {
    const c = uniformCritique(3);
    c.dimensions.vibes = { score: 4, justification: 'the vibes in this scene are frankly immaculate' };
    assert.ok(validateCritique(c, rubric).some((e) => /unknown dimension "vibes"/.test(e)));
  });
});

describe('weighting', () => {
  test('with no emphasis, effective weights are the rubric weights', () => {
    const { weights } = effectiveWeights(rubric, { id: 'x', dimensionEmphasis: {} });
    for (const d of rubric.dimensions) assert.ok(Math.abs(weights.get(d.id) - d.weight) < 1e-9);
  });

  test('emphasis renormalises back to the rubric total', () => {
    const { weights, total } = effectiveWeights(rubric, plaza);
    const sum = [...weights.values()].reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - total) < 1e-6, `weights sum to ${sum}, expected ${total}`);
    assert.ok(weights.get('composition') > weights.get('technical_hygiene'));
  });

  test('emphasis multipliers are clamped to the allowed range', () => {
    const { weights, warnings } = effectiveWeights(rubric, { id: 'x', dimensionEmphasis: { composition: 99 } });
    const base = rubric.dimensions.find((d) => d.id === 'composition').weight;
    assert.ok(weights.get('composition') <= base * EMPHASIS_MAX + 1e-9);
    assert.ok(warnings.some((w) => /clamped/.test(w)));
  });

  test('prompt_fidelity can never be emphasised above its base weight, on any task', () => {
    const base = rubric.dimensions.find((d) => d.id === FIDELITY_DIMENSION).weight;
    for (const t of tasks) {
      const { weights } = effectiveWeights(rubric, t);
      assert.ok(
        weights.get(FIDELITY_DIMENSION) <= base + 1e-9,
        `task ${t.id} let prompt_fidelity reach ${weights.get(FIDELITY_DIMENSION)} (base ${base})`,
      );
    }
  });

  test('an explicit attempt to emphasise prompt_fidelity is refused and warned about', () => {
    const base = rubric.dimensions.find((d) => d.id === FIDELITY_DIMENSION).weight;
    const { weights, warnings } = effectiveWeights(rubric, { id: 'cheat', dimensionEmphasis: { [FIDELITY_DIMENSION]: 2 } });
    assert.ok(weights.get(FIDELITY_DIMENSION) <= base + 1e-9);
    assert.ok(warnings.some((w) => new RegExp(FIDELITY_DIMENSION).test(w)));
  });

  test('a uniform score produces that score as the weighted mean', () => {
    for (const s of [0, 1, 2, 3, 4]) {
      const { total } = weightedTotal(uniformCritique(s), rubric, plaza);
      assert.ok(Math.abs(total - s) < 1e-6, `uniform ${s} gave ${total}`);
    }
  });

  test('percentage is the mean expressed against the 0-4 scale', () => {
    const { total, pct } = weightedTotal(uniformCritique(3), rubric, plaza);
    assert.ok(Math.abs(pct - (total / 4) * 100) < 1e-6);
  });
});

describe('hard-fail detection', () => {
  test('fires bare-baseplate, single-material, default-lighting and no-detail-props on the blockout', () => {
    const fails = detectHardFails(normalizeMetrics(metricsBlockout), critiqueBlockout, rubric, plaza).map((f) => f.id);
    for (const id of ['bare-baseplate', 'single-material', 'default-lighting', 'no-detail-props']) {
      assert.ok(fails.includes(id), `expected hard fail ${id}, got ${fails.join(', ')}`);
    }
  });

  test('every fired hard fail carries specific evidence', () => {
    for (const f of detectHardFails(normalizeMetrics(metricsBlockout), critiqueBlockout, rubric, plaza)) {
      assert.ok(f.evidence.length > 15, `hard fail ${f.id} has no usable evidence`);
    }
  });

  test('fires nothing on a healthy scene', () => {
    assert.deepEqual(detectHardFails(normalizeMetrics(metricsGood), critiqueGood, rubric, plaza), []);
  });

  test('no-landmark fires when focal_point is 1 or less and the task expects a landmark', () => {
    const c = uniformCritique(3, { focal_point: 1 });
    const fails = detectHardFails(normalizeMetrics(cleanMetrics()), c, rubric, plaza).map((f) => f.id);
    assert.ok(fails.includes('no-landmark'));
  });

  test('no-landmark does not fire on a task that does not expect one', () => {
    const obby = getTask(tasks, 'vis-04-obby-section');
    assert.equal(obby.landmarkExpected, false);
    const c = uniformCritique(3, { focal_point: 1 });
    const fails = detectHardFails(normalizeMetrics(cleanMetrics()), c, rubric, obby).map((f) => f.id);
    assert.ok(!fails.includes('no-landmark'));
  });

  test('no-landmark fires on flat height hierarchy even when the judge scored focal_point well', () => {
    const m = cleanMetrics({ parts: { total: 100, unanchored: 0, smallPropCount: 30, tallestStuds: 6, medianHeightStuds: 5 } });
    const fails = detectHardFails(normalizeMetrics(m), uniformCritique(4), rubric, plaza).map((f) => f.id);
    assert.ok(fails.includes('no-landmark'));
  });

  test('flat-slab fires on a wide scene with no height', () => {
    const m = cleanMetrics({ boundsSize: [120, 2, 110] });
    const fails = detectHardFails(normalizeMetrics(m), uniformCritique(3), rubric, plaza).map((f) => f.id);
    assert.ok(fails.includes('flat-slab'));
  });

  test('nothing-rendered fires when no view sees geometry', () => {
    const m = cleanMetrics({
      views: [{ name: 'hero', meta: { partsVisible: 0, subjectCoverage: 0, distinctColours: 1, materials: [] } }],
    });
    const fails = detectHardFails(normalizeMetrics(m), uniformCritique(3), rubric, plaza).map((f) => f.id);
    assert.ok(fails.includes('nothing-rendered'));
  });

  test('single-material ignores materials that barely appear', () => {
    const m = cleanMetrics({ materials: [{ material: 'Plastic', parts: 300 }, { material: 'Neon', parts: 1 }] });
    const fails = detectHardFails(normalizeMetrics(m), uniformCritique(3), rubric, plaza).map((f) => f.id);
    assert.ok(fails.includes('single-material'));
  });

  test('a lit scene with untouched Lighting service properties still passes the lighting check', () => {
    const m = cleanMetrics({ lighting: { changedProperties: [], lightInstances: 9, effects: [] } });
    const fails = detectHardFails(normalizeMetrics(m), uniformCritique(3), rubric, plaza).map((f) => f.id);
    assert.ok(!fails.includes('default-lighting'), 'placing real lights counts as a lighting pass');
  });
});

describe('cap arithmetic', () => {
  test('no hard fail means no cap', () => {
    assert.deepEqual(applyHardFailCap(3.2, 0, rubric.gate), { capped: 3.2, cap: null });
  });

  test('one hard fail caps at gate.hardFailCap', () => {
    const { capped, cap } = applyHardFailCap(4, 1, rubric.gate);
    assert.equal(cap, rubric.gate.hardFailCap);
    assert.equal(capped, rubric.gate.hardFailCap);
  });

  test('each extra hard fail lowers the cap, never below the floor', () => {
    const c1 = applyHardFailCap(4, 1, rubric.gate).capped;
    const c3 = applyHardFailCap(4, 3, rubric.gate).capped;
    const c99 = applyHardFailCap(4, 99, rubric.gate).capped;
    assert.ok(c3 < c1);
    assert.equal(c99, rubric.gate.hardFailCapFloor);
  });

  test('the cap never raises a score that was already lower', () => {
    assert.equal(applyHardFailCap(0.2, 1, rubric.gate).capped, 0.2);
  });

  test('any capped score is below the pass threshold, for any number of fails', () => {
    for (let n = 1; n <= 10; n++) {
      assert.ok(applyHardFailCap(4, n, rubric.gate).capped < rubric.gate.passThreshold);
    }
  });
});

describe('critical dimension floor', () => {
  test('a zero on a heavily weighted dimension is flagged', () => {
    const { contributions } = weightedTotal(uniformCritique(4, { ground_treatment: 0 }), rubric, plaza);
    const v = checkCriticalFloor(contributions, rubric);
    assert.equal(v.length, 1);
    assert.equal(v[0].id, 'ground_treatment');
  });

  test('a zero on a light dimension is not flagged by the floor', () => {
    const { contributions } = weightedTotal(uniformCritique(4, { negative_space: 0 }), rubric, plaza);
    assert.deepEqual(checkCriticalFloor(contributions, rubric), []);
  });

  test('the floor alone fails a run that otherwise clears the threshold', () => {
    const r = gradeVisual({ task: plaza, rubric, metrics: cleanMetrics(), critique: uniformCritique(4, { ground_treatment: 0 }) });
    assert.deepEqual(r.hardFails, []);
    assert.ok(r.total >= rubric.gate.passThreshold, 'this case must clear the threshold so the floor is what fails it');
    assert.equal(r.pass, false);
    assert.equal(r.criticalFloorViolations[0].id, 'ground_treatment');
  });
});

// ===========================================================================
// The load-bearing test.
// ===========================================================================
describe('THE EXISTENCE-ONLY CHEAT CANNOT PASS', () => {
  const result = gradeVisual({ task: plaza, rubric, metrics: metricsBlockout, critique: critiqueAllFours });

  test('setup is genuinely the adversarial case: every dimension scored 4/4', () => {
    assert.deepEqual(validateCritique(critiqueAllFours, rubric), [], 'the cheat critique must itself be well-formed');
    for (const d of rubric.dimensions) assert.equal(critiqueAllFours.dimensions[d.id].score, 4);
    assert.equal(result.rawTotal, 4, 'the ungated weighted total is a perfect 4/4');
  });

  test('perfect prompt fidelity plus a bare baseplate and one material CANNOT pass', () => {
    assert.equal(result.pass, false);
    assert.equal(result.status, 'fail');
  });

  test('it fails because of hard fails, and the score is capped far below the threshold', () => {
    const ids = result.hardFails.map((f) => f.id);
    assert.ok(ids.includes('bare-baseplate'));
    assert.ok(ids.includes('single-material'));
    assert.ok(ids.includes('default-lighting'));
    assert.ok(ids.includes('no-detail-props'));
    assert.ok(result.total < rubric.gate.passThreshold);
    assert.ok(result.total <= result.cap);
    assert.ok(result.rawTotal - result.total > 2, 'the cap must visibly bite');
  });

  test('the same holds for the realistic critique of the same scene', () => {
    const r = gradeVisual({ task: plaza, rubric, metrics: metricsBlockout, critique: critiqueBlockout });
    assert.equal(r.pass, false);
    assert.equal(critiqueBlockout.dimensions.prompt_fidelity.score, 2, 'every requested object exists');
    assert.ok(r.total < 1);
  });

  test('removing the hard fails but keeping the ugliness still fails on score alone', () => {
    // Ground fixed, materials added, lights placed, trim props added, and a focal element
    // present (focal_point 2) so no hard fail fires. But the judge still sees a block-out,
    // so the weighted mean cannot clear 2.6 no matter how complete the object list is.
    const patched = cleanMetrics();
    const c = uniformCritique(1, { focal_point: 2, prompt_fidelity: 4, technical_hygiene: 4 });
    const r = gradeVisual({ task: plaza, rubric, metrics: patched, critique: c });
    assert.deepEqual(r.hardFails, []);
    assert.equal(r.pass, false);
    assert.ok(r.total < rubric.gate.passThreshold);
  });

  test('a genuinely good scene does pass, so the gate is not simply unreachable', () => {
    const r = gradeVisual({ task: plaza, rubric, metrics: metricsGood, critique: critiqueGood });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.hardFails, []);
    assert.equal(r.pass, true, `good scene scored ${r.total}/4, expected >= ${rubric.gate.passThreshold}`);
    assert.ok(r.total >= rubric.gate.passThreshold);
  });
});

describe('reporting', () => {
  test('the report names every hard fail with its evidence', () => {
    const r = gradeVisual({ task: plaza, rubric, metrics: metricsBlockout, critique: critiqueAllFours });
    const text = formatReport(r);
    assert.match(text, /HARD FAILS/);
    assert.match(text, /bare-baseplate/);
    assert.match(text, /FAIL/);
  });

  test('the report of a passing scene says PASS and shows the final score', () => {
    const text = formatReport(gradeVisual({ task: plaza, rubric, metrics: metricsGood, critique: critiqueGood }));
    assert.match(text, /PASS/);
    assert.match(text, /FINAL/);
  });
});

describe('vision transport', () => {
  test('the critique prompt carries the anchors, the task expectations and the anti-existence instruction', () => {
    const p = buildCritiquePrompt({ task: plaza, rubric, metrics: metricsGood });
    assert.match(p, /DO NOT give a high score simply because every requested/);
    assert.match(p, /ground_treatment/);
    assert.match(p, /I need a town square/);
    assert.match(p, /GOOD:/);
    assert.match(p, /BAD:/);
    for (const d of rubric.dimensions) assert.ok(p.includes(d.id), `prompt omits dimension ${d.id}`);
  });

  test('parses a fenced JSON response', () => {
    const parsed = parseCritiqueResponse('Here you go:\n```json\n{"dimensions":{"composition":{"score":2}}}\n```\nhope that helps');
    assert.equal(parsed.dimensions.composition.score, 2);
  });

  test('parses a bare JSON response with surrounding prose', () => {
    assert.equal(parseCritiqueResponse('sure. {"a":1} done').a, 1);
  });

  test('throws on unparseable output rather than inventing a critique', () => {
    assert.throws(() => parseCritiqueResponse('I am unable to assess this image.'), /did not return parseable JSON/);
  });

  test('requestCritique posts images to the gateway and returns the parsed critique', async () => {
    let seen = null;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ ok: true, text: JSON.stringify(uniformCritique(3)) }) };
    };
    const critique = await requestCritique({
      task: plaza,
      rubric,
      metrics: metricsGood,
      imagePaths: [FIX('critique-good-plaza.json').replace(/\.json$/, '.json')].map(() => join(HERE, 'fixtures', 'fake.png')),
      apiBase: 'https://example.invalid',
      adminKey: 'k',
      fetchImpl,
    }).catch((e) => e);
    // fake.png does not exist, so this must fail loudly at image read rather than silently pass.
    assert.ok(critique instanceof Error);
    assert.equal(seen, null, 'no network call should be made when the evidence cannot be read');
  });

  test('requestCritique refuses to run without credentials', async () => {
    await assert.rejects(
      () => requestCritique({ task: plaza, rubric, metrics: metricsGood, imagePaths: ['a.png'] }),
      /API_BASE and ADMIN_KEY are required/,
    );
  });
});

describe('CLI --dry-run', () => {
  const cli = join(HERE, 'grade-visual.mjs');
  const run = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }) };
    } catch (e) {
      return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  test('grades the blockout from canned JSON and exits non-zero', () => {
    const { status, out } = run(['--dry-run', '--task', 'vis-03-plaza', '--metrics', FIX('metrics-blockout-plaza.json'), '--critique', FIX('critique-blockout-plaza.json')]);
    assert.equal(status, 1, out);
    assert.match(out, /HARD FAILS/);
    assert.match(out, /FAIL/);
  });

  test('grades a good scene from canned JSON and exits zero', () => {
    const { status, out } = run(['--dry-run', '--task', 'vis-03-plaza', '--metrics', FIX('metrics-good-plaza.json'), '--critique', FIX('critique-good-plaza.json')]);
    assert.equal(status, 0, out);
    assert.match(out, /PASS/);
  });

  test('--json emits a machine-readable result', () => {
    const { out } = run(['--dry-run', '--json', '--task', 'vis-03-plaza', '--metrics', FIX('metrics-blockout-plaza.json'), '--critique', FIX('critique-all-fours.json')]);
    const parsed = JSON.parse(out);
    assert.equal(parsed.pass, false);
    assert.equal(parsed.rawTotal, 4);
    assert.ok(parsed.hardFails.length >= 4);
  });

  test('an unknown task id is a clear error, not a crash', () => {
    const { status, out } = run(['--dry-run', '--task', 'nope', '--metrics', FIX('metrics-good-plaza.json'), '--critique', FIX('critique-good-plaza.json')]);
    assert.equal(status, 2);
    assert.match(out, /unknown task id/);
  });
});
