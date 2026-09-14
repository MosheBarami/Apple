// Tests for the adversarial visual critic.  node --test src/critic.test.mjs
//
// Everything here runs with ZERO model calls. The five geometry-derived lenses are deterministic
// by construction, and the model-driven lens is exercised with synthetic replies, so the whole
// pipeline — lenses, evidence gate, adjudication, regression records — is covered for free.
//
// The two properties worth stating plainly, because they are what this replaces:
//   * A criticism without verifiable evidence CANNOT reach the verdict. Not down-weighted:
//     discarded, before adjudication runs.
//   * Vague agreement is not corroboration. Two lenses saying the same thing while citing the
//     same evidence count once, so a quorum cannot be manufactured by echoing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  loadCriticModule,
  criticInputFromScene,
  runCriticSuite,
  loadRegression,
  coincidentFacePairs,
  faceValueSpread,
  lightingTouchedProperties,
  REGRESSION_PATH,
} from './critic.mjs';
import { loadSuite, getPropSpec, loadFixture } from './props.mjs';
import { buildSuiteFixtures, GOOD_BUILDERS, uglyTrophy } from '../tasks-visual/props/build-fixtures.mjs';

/** The shipping critic, bundled out of apps/worker/src/critic.ts. */
let C;
before(async () => {
  C = await loadCriticModule();
});

const suite = loadSuite();

/** A minimal input whose metric table the evidence gate can be tested against. */
const INPUT = {
  intent: 'a trophy',
  subject: 'prop',
  views: [
    { name: 'hero', width: 288, height: 180 },
    { name: 'front', width: 288, height: 180 },
  ],
  requestedElements: ['handles', 'plinth'],
  metrics: { profileCV: 0.42, boxFill: 0.59, factoryDefaultShare: 0.0, partCount: 36 },
  lighting: { brightness: 2.4, clockTime: 16.2, ambient: [42, 44, 52], lightInstances: 2, effects: ['Atmosphere'], isDefault: false },
};

const crit = (over = {}) => ({
  lens: 'technical_art',
  subject: 'surface-intent',
  claim: 'the plinth and stem are untouched default grey, so no material decision exists for the lower two thirds of the object',
  severity: 'major',
  evidence: { kind: 'measure', metric: 'factoryDefaultShare', value: 0.0, comparator: '<=', threshold: 0 },
  ...over,
});

// ---------------------------------------------------------------------------------------------

describe('the evidence gate', () => {
  const rejected = (c) => C.rejectionReason(c, INPUT, C.DEFAULT_RULE);

  test('a well-formed criticism is admissible', () => {
    assert.equal(rejected(crit()), null);
  });

  test('no evidence: discarded', () => {
    assert.match(rejected(crit({ evidence: undefined })), /no evidence/);
  });

  test('no subject: discarded, because nothing could corroborate or retest it', () => {
    assert.match(rejected(crit({ subject: '  ' })), /no subject/);
  });

  test('a region citing a view that was not rendered: discarded', () => {
    assert.match(
      rejected(crit({ evidence: { kind: 'region', view: 'orbit', box: [0.1, 0.1, 0.2, 0.2] } })),
      /was not rendered/,
    );
  });

  test('a region covering the whole frame: discarded, it points at nothing', () => {
    assert.match(
      rejected(crit({ evidence: { kind: 'region', view: 'hero', box: [0, 0, 1, 1] } })),
      /not pointing at anything/,
    );
  });

  test('a metric the harness does not measure: discarded', () => {
    assert.match(
      rejected(crit({ evidence: { kind: 'measure', metric: 'vibes', value: 3, comparator: '<', threshold: 5 } })),
      /does not measure/,
    );
  });

  test('A FABRICATED VALUE FOR A REAL METRIC: discarded', () => {
    // The anti-hallucination clause. The critic says coverage is catastrophic and cites a number
    // that is not the number the harness measured. The claim never reaches adjudication.
    const r = rejected(crit({ evidence: { kind: 'measure', metric: 'profileCV', value: 0.01, comparator: '<', threshold: 0.08 } }));
    assert.match(r, /cites profileCV = 0.01 but the harness measured 0.42/);
  });

  test('a real value that does not actually break the threshold it names: discarded', () => {
    const r = rejected(crit({ evidence: { kind: 'measure', metric: 'profileCV', value: 0.42, comparator: '<', threshold: 0.08 } }));
    assert.match(r, /does not satisfy < 0.08/);
  });

  test('a missing element nobody asked for: discarded', () => {
    const r = rejected(
      crit({ evidence: { kind: 'missing', element: 'a dragon', searchedIn: ['hero', 'front'] } }),
    );
    assert.match(r, /never asked for/);
  });

  test('a missing element that WAS asked for, with searched views: admissible', () => {
    assert.equal(rejected(crit({ evidence: { kind: 'missing', element: 'handles', searchedIn: ['hero', 'front'] } })), null);
  });

  test('a missing claim that does not say where it looked: discarded', () => {
    assert.match(rejected(crit({ evidence: { kind: 'missing', element: 'handles', searchedIn: [] } })), /which views were searched/);
  });

  test('vague prose is discarded even when the evidence is perfect', () => {
    for (const claim of [
      'Looks solid overall.',
      'The build could use more detail.',
      'It is somewhat lacking but generally better than average.',
      'not bad',
      'ok',
    ]) {
      assert.ok(C.isVagueClaim(claim), `"${claim}" should read as vague`);
      assert.match(rejected(crit({ claim })), /vague claim/);
    }
  });

  test('a specific claim about a real defect is not caught by the vagueness filter', () => {
    for (const claim of [
      'the stem and bowl are the same width, so the trophy has no waist and reads as a column',
      'the handles are absent from both the hero and front views',
      'small-scale elements are 0% of the build: there is nothing to see at close range',
    ]) {
      assert.equal(C.isVagueClaim(claim), false, `"${claim}" was wrongly filtered as vague`);
    }
  });
});

// ---------------------------------------------------------------------------------------------

describe('adjudication', () => {
  const region = (view, box) => ({ kind: 'region', view, box });

  test('VAGUE AGREEMENT DOES NOT CONFIRM: two lenses, same subject, same evidence', () => {
    const same = region('hero', [0.4, 0.2, 0.2, 0.3]);
    const a = adj([
      crit({ lens: 'composition', subject: 'bowl-proportion', claim: 'the bowl is wider than the plinth so the object reads as top-heavy and unstable', evidence: same }),
      crit({ lens: 'technical_art', subject: 'bowl-proportion', claim: 'the bowl overhangs the plinth in a way that would not stand up physically', evidence: same }),
    ]);
    assert.equal(a.confirmed.length, 0);
    assert.equal(a.unconfirmed.length, 1);
    assert.match(a.unconfirmed[0].reason, /1 lens\(es\) with distinct evidence, quorum is 2/);
  });

  test('two lenses citing DIFFERENT evidence do confirm', () => {
    const a = adj([
      crit({ lens: 'composition', subject: 'bowl-proportion', claim: 'the bowl is wider than the plinth so the object reads as top-heavy and unstable', evidence: region('hero', [0.4, 0.2, 0.2, 0.3]) }),
      crit({ lens: 'gameplay_readability', subject: 'bowl-proportion', claim: 'from the front the bowl hides the stem entirely, collapsing the trophy to a mushroom', evidence: region('front', [0.3, 0.1, 0.35, 0.25]) }),
    ]);
    assert.equal(a.confirmed.length, 1);
    assert.equal(a.confirmed[0].confirmedBy, 'quorum');
    assert.deepEqual(a.confirmed[0].lenses, ['composition', 'gameplay_readability']);
  });

  test('one lens with a verified measurement confirms alone', () => {
    const a = adj([crit()]);
    assert.equal(a.confirmed.length, 1);
    assert.equal(a.confirmed[0].confirmedBy, 'measurement');
  });

  test('below the severity floor: recorded, never confirmed', () => {
    const a = adj([crit({ severity: 'minor' })]);
    assert.equal(a.confirmed.length, 0);
    assert.match(a.unconfirmed[0].reason, /below the major severity floor/);
  });

  test('the quorum is configurable: raising it to 3 unconfirms a 2-lens defect', () => {
    const two = [
      crit({ lens: 'composition', subject: 'bowl-proportion', claim: 'the bowl is wider than the plinth so the object reads as top-heavy and unstable', evidence: region('hero', [0.4, 0.2, 0.2, 0.3]) }),
      crit({ lens: 'lighting', subject: 'bowl-proportion', claim: 'the bowl and the plinth land on the same luminance so the two masses merge', evidence: region('front', [0.3, 0.1, 0.35, 0.25]) }),
    ];
    assert.equal(adj(two, { quorum: 2 }).confirmed.length, 1);
    assert.equal(adj(two, { quorum: 3 }).confirmed.length, 0);
  });

  test('measureBacksAlone is configurable: turning it off forces a measured defect to find a quorum', () => {
    assert.equal(adj([crit()], { measureBacksAlone: true }).confirmed.length, 1);
    assert.equal(adj([crit()], { measureBacksAlone: false }).confirmed.length, 0);
  });

  test('requireDistinctEvidence is configurable, and turning it off is what re-enables echo quorums', () => {
    const same = region('hero', [0.4, 0.2, 0.2, 0.3]);
    const echo = [
      crit({ lens: 'composition', subject: 'bowl-proportion', claim: 'the bowl is wider than the plinth so the object reads as top-heavy and unstable', evidence: same }),
      crit({ lens: 'technical_art', subject: 'bowl-proportion', claim: 'the bowl overhangs the plinth in a way that would not stand up physically', evidence: same }),
    ];
    assert.equal(adj(echo, { requireDistinctEvidence: true }).confirmed.length, 0);
    assert.equal(adj(echo, { requireDistinctEvidence: false }).confirmed.length, 1);
  });

  test('discarded criticisms are counted and reported, never silently dropped', () => {
    const a = adj([crit(), crit({ claim: 'looks fine' }), crit({ evidence: undefined })]);
    assert.equal(a.stats.raised, 3);
    assert.equal(a.stats.discarded, 2);
    assert.equal(a.discarded.length, 2);
    for (const d of a.discarded) assert.ok(d.reason.length > 10, 'a discard must say why');
  });

  function adj(list, ruleOver = {}) {
    return C.adjudicate(list, INPUT, { ...C.DEFAULT_RULE, ...ruleOver });
  }
});

// ---------------------------------------------------------------------------------------------

describe('the deterministic panel over real fixtures — no model calls', () => {
  test('the ugly trophy is convicted, with a measurement behind every count', async () => {
    const input = criticInputFromScene(loadFixture('trophy-ugly'), { intent: 'a trophy' });
    const r = await C.runCriticPanel(input);
    assert.equal(r.modelCalls, 0, 'the deterministic panel must not call a model');
    const subjects = r.adjudication.confirmed.map((d) => d.subject);
    for (const s of ['surface-intent', 'material-variety', 'mass-hierarchy', 'detail-scales']) {
      assert.ok(subjects.includes(s), `expected a confirmed "${s}" defect, got: ${subjects.join(', ')}`);
    }
    for (const d of r.adjudication.confirmed) {
      assert.equal(d.confirmedBy, 'measurement');
      assert.ok(d.evidence.length > 0);
      for (const e of d.evidence) assert.equal(e.kind, 'measure');
    }
  });

  test('every good build is acquitted: zero confirmed defects', async () => {
    for (const spec of suite.props) {
      const input = criticInputFromScene(loadFixture(`${spec.id}-good`), { intent: spec.prompt });
      const r = await C.runCriticPanel(input);
      assert.deepEqual(
        r.adjudication.confirmed.map((d) => `${d.subject}: ${d.claims[0]}`),
        [],
        `${spec.id}-good drew confirmed defects — either the build regressed or a lens threshold is wrong`,
      );
    }
  });

  test('every degraded fixture draws at least one confirmed defect', async () => {
    const bad = buildSuiteFixtures({ degradeAll: true }).filter((f) => f.expect === 'fail');
    for (const f of bad) {
      const input = criticInputFromScene(f.scene, { intent: getPropSpec(suite, f.prop).prompt });
      const r = await C.runCriticPanel(input);
      assert.ok(r.adjudication.confirmed.length > 0, `${f.id} passed the panel with no confirmed defect`);
    }
  });

  test('the number of critics is configurable', async () => {
    const input = criticInputFromScene(loadFixture('trophy-ugly'), { intent: 'a trophy' });
    const one = await C.runCriticPanel(input, { lenses: ['technical_art'] });
    const all = await C.runCriticPanel(input, { lenses: C.ALL_LENSES });
    assert.equal(one.lensesRun.length, 1);
    assert.equal(all.lensesRun.length, 6);
    assert.ok(all.criticisms.length > one.criticisms.length);
    assert.ok(one.adjudication.confirmed.every((d) => d.lenses.every((l) => l === 'technical_art')));
  });
});

// ---------------------------------------------------------------------------------------------

describe('model-driven lenses, with synthetic replies', () => {
  const input = { ...INPUT, metrics: { ...INPUT.metrics } };

  test('a flattering reply produces nothing: praise carries no evidence', async () => {
    const judge = async () =>
      JSON.stringify({
        criticisms: [
          { subject: 'overall', claim: 'This is a solid build overall, it looks good.', severity: 'minor', evidence: { kind: 'region', view: 'hero', box: [0, 0, 1, 1] } },
          { subject: 'detail', claim: 'Could use more detail', severity: 'major' },
        ],
      });
    const r = await C.runCriticPanel(input, { lenses: ['request_fidelity'], judge, alwaysRunDeterministic: false });
    assert.equal(r.modelCalls, 1);
    assert.equal(r.adjudication.confirmed.length, 0);
    assert.equal(r.adjudication.stats.discarded, 2);
  });

  test('a reply that fabricates a measurement is discarded, and says so', async () => {
    const judge = async () =>
      '```json\n' +
      JSON.stringify({
        criticisms: [
          { subject: 'silhouette-variation', claim: 'the outline is a featureless rectangle from every angle rendered', severity: 'blocking', evidence: { kind: 'measure', metric: 'profileCV', value: 0.02, comparator: '<', threshold: 0.08 } },
        ],
      }) +
      '\n```';
    const r = await C.runCriticPanel(input, { lenses: ['request_fidelity'], judge, alwaysRunDeterministic: false });
    assert.equal(r.adjudication.confirmed.length, 0);
    assert.match(r.adjudication.discarded[0].reason, /but the harness measured 0.42/);
  });

  test('a reply with real evidence about a genuinely missing element is confirmed', async () => {
    const judge = async () =>
      JSON.stringify({
        criticisms: [
          { subject: 'missing-handles', claim: 'the request asks for handles and neither rendered view shows anything attached to the bowl', severity: 'blocking', evidence: { kind: 'missing', element: 'handles', searchedIn: ['hero', 'front'] }, fix: 'add handles at the bowl rim' },
        ],
      });
    const r = await C.runCriticPanel(input, { lenses: ['request_fidelity'], judge, alwaysRunDeterministic: false, rule: { ...C.DEFAULT_RULE, quorum: 1 } });
    assert.equal(r.adjudication.confirmed.length, 1);
    assert.equal(r.adjudication.confirmed[0].subject, 'missing-handles');
  });

  test('a lens that throws does not take the panel down', async () => {
    const judge = async ({ lens }) => {
      if (lens === 'request_fidelity') throw new Error('gateway exploded');
      return '{"criticisms":[]}';
    };
    const r = await C.runCriticPanel(criticInputFromScene(loadFixture('trophy-ugly'), { intent: 'a trophy' }), { judge });
    assert.ok(r.adjudication.confirmed.length > 0, 'the deterministic findings must survive one lens failing');
  });

  test('malformed model output yields no criticisms rather than throwing', () => {
    assert.deepEqual(C.parseLensResponse('composition', 'not json at all'), []);
    assert.deepEqual(C.parseLensResponse('composition', '{"criticisms": "nope"}'), []);
    assert.deepEqual(C.parseLensResponse('composition', JSON.stringify({ criticisms: [{ claim: 'no subject' }] })), []);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the lens prompts', () => {
  test('every lens is instructed to prove the build is bad, not to review it', () => {
    for (const lens of C.ALL_LENSES) {
      const { system } = C.buildLensPrompt(lens, INPUT);
      assert.match(system, /PROVE this build is not good enough/);
      assert.match(system, /not asked what is good/);
      assert.match(system, /DELETED before anyone reads it/);
    }
  });

  test('every prompt states the renderer constraints, so the model cannot be blamed for guessing', () => {
    for (const lens of C.ALL_LENSES) {
      const { system } = C.buildLensPrompt(lens, INPUT);
      assert.ok(system.includes(C.RENDERER_CONSTRAINTS));
      assert.match(system, /no shadows, no point lights, no post-processing/);
      assert.match(system, /288x180 \(320x240 maximum\)/);
    }
  });

  test('the user turn lists the only numbers a critic may cite', () => {
    const { user } = C.buildLensPrompt('composition', INPUT);
    for (const [k, v] of Object.entries(INPUT.metrics)) assert.ok(user.includes(`${k} = ${v}`), `metric ${k} missing from the prompt`);
    assert.match(user, /citing any other number deletes your criticism/);
  });

  test('NO lens builds a claim on something the rasteriser cannot show', () => {
    // The renderer has one sun, flat Lambert, no shadows and no textures. A rule or mandate that
    // asks about shadows is asking the model to invent, and inventions are what this replaces.
    const rules = [...C.COMPOSITION_RULES, ...C.ROBLOX_RULES, ...C.TECHNICAL_ART_RULES, ...C.LIGHTING_RULES, ...C.READABILITY_RULES];
    for (const r of rules) {
      const text = `${r.claim(1)} ${r.fix}`.toLowerCase();
      for (const term of C.UNEVIDENCED_TERMS) {
        assert.ok(!text.includes(term), `rule "${r.subject}" builds on "${term}", which this renderer cannot show`);
      }
    }
    // The lighting mandate may mention them, but only to forbid them.
    assert.match(C.LENS_MANDATES.lighting, /may not comment on shadows, bounce, specular, mood or time of day/);
    assert.match(C.LENS_MANDATES.lighting, /ONLY value structure and the Lighting configuration/);
  });

  test('the lighting lens measures only the two things the renderer evidences', () => {
    assert.deepEqual(
      C.LIGHTING_RULES.map((r) => r.metric).sort(),
      ['faceValueSpread', 'figureGroundContrast'],
      'the lighting lens grew a rule the flat-Lambert renderer cannot support',
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe('the harness feeds the critic every metric its rules can cite', () => {
  test('no rule references a metric the harness does not measure', () => {
    const produced = new Set(Object.keys(criticInputFromScene(loadFixture('trophy-good'), { intent: 'a trophy' }).metrics));
    const missing = C.REFERENCED_METRICS.filter((m) => !produced.has(m));
    assert.deepEqual(missing, [], 'these rules can never fire because nothing measures them');
  });

  test('every metric is a finite number', () => {
    const { metrics } = criticInputFromScene(loadFixture('trophy-good'), { intent: 'a trophy' });
    for (const [k, v] of Object.entries(metrics)) assert.ok(Number.isFinite(v), `${k} = ${v}`);
  });

  test('z-fighting detection needs interpenetration, not merely touching', () => {
    // stacked: two boxes sharing a plane, no overlap -> not a fight
    const stacked = [
      { name: 'a', size: [4, 2, 4], pos: [0, 1, 0], color: [1, 1, 1] },
      { name: 'b', size: [3, 2, 3], pos: [0, 3, 0], color: [1, 1, 1] },
    ];
    assert.equal(coincidentFacePairs(stacked), 0);
    // embedded flush: a plate sunk into the box with its top face on the box's top face -> fight
    const embedded = [
      { name: 'a', size: [4, 2, 4], pos: [0, 1, 0], color: [1, 1, 1] },
      { name: 'b', size: [2, 0.4, 2], pos: [0, 1.8, 0], color: [1, 1, 1] },
    ];
    assert.equal(coincidentFacePairs(embedded), 1);
  });

  test('lighting-touched counting distinguishes a dressed scene from an untouched one', () => {
    assert.equal(lightingTouchedProperties({ brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: [] }), 0);
    assert.ok(lightingTouchedProperties({ brightness: 2.4, clockTime: 16.2, ambient: [42, 44, 52], lightInstances: 2, effects: ['Atmosphere'] }) >= 4);
    assert.equal(lightingTouchedProperties(undefined), 0);
  });

  test('face value spread separates a shaded form from a flat one', () => {
    // A real prop's faces land on different Lambert values; the measure must see that.
    const good = criticInputFromScene(loadFixture('trophy-good'), { intent: 'a trophy' });
    assert.ok(good.metrics.faceValueSpread > 12, `measured ${good.metrics.faceValueSpread}`);
  });
});

// ---------------------------------------------------------------------------------------------

describe('confirmed defects become regression data, automatically', () => {
  // A fixed clock so the written file is byte-stable and a diff means a real change.
  const NOW = new Date('2026-08-31T00:00:00.000Z');

  test('running the suite writes the corpus without being asked to', async () => {
    const entries = buildSuiteFixtures().map((f) => ({
      id: f.id,
      scene: f.scene,
      intent: getPropSpec(suite, f.prop).prompt,
      subject: 'prop',
    }));
    const { records, path } = await runCriticSuite(entries, { critic: C, now: NOW });
    assert.equal(path, REGRESSION_PATH);
    assert.ok(existsSync(path), 'the regression file was not written');
    assert.ok(records.length > 0);

    const onDisk = loadRegression(path);
    assert.equal(onDisk.length, records.length);
    assert.ok(readFileSync(path, 'utf8').startsWith('#'), 'the corpus should describe itself');
  });

  test('only CONFIRMED defects enter the corpus — an unevidenced criticism leaves no trace', async () => {
    const input = criticInputFromScene(loadFixture('trophy-good'), { intent: 'a trophy' });
    const judge = async () => JSON.stringify({ criticisms: [{ subject: 'overall', claim: 'This looks fine to me.', severity: 'blocking', evidence: { kind: 'region', view: 'hero', box: [0, 0, 1, 1] } }] });
    const r = await C.runCriticPanel(input, { judge, now: NOW });
    assert.ok(r.adjudication.discarded.length > 0);
    assert.deepEqual(r.regression, []);
  });

  test('a measurement-backed record carries a machine-checkable fix assertion', async () => {
    const input = criticInputFromScene(loadFixture('trophy-ugly'), { intent: 'a trophy' });
    const r = await C.runCriticPanel(input, { now: NOW });
    const rec = r.regression.find((x) => x.subject === 'surface-intent');
    assert.ok(rec, 'no surface-intent record');
    // the recorded violation was factoryDefaultShare >= 0.5; the fix assertion is its inverse
    assert.deepEqual(rec.fixedWhen, { kind: 'metric', metric: 'factoryDefaultShare', comparator: '<', threshold: 0.5 });
    assert.equal(rec.confirmedBy, 'measurement');
    assert.ok(rec.recordedAt === NOW.toISOString());
  });

  test('a quorum-backed record admits it is not machine-checkable rather than pretending', () => {
    const region = (view, box) => ({ kind: 'region', view, box });
    const a = C.adjudicate(
      [
        crit({ lens: 'composition', subject: 'bowl-proportion', claim: 'the bowl is wider than the plinth so the object reads as top-heavy and unstable', evidence: region('hero', [0.4, 0.2, 0.2, 0.3]) }),
        crit({ lens: 'gameplay_readability', subject: 'bowl-proportion', claim: 'from the front the bowl hides the stem entirely, collapsing the trophy to a mushroom', evidence: region('front', [0.3, 0.1, 0.35, 0.25]) }),
      ],
      INPUT,
      C.DEFAULT_RULE,
    );
    const [rec] = C.toRegressionRecords(a, INPUT, NOW);
    assert.equal(rec.fixedWhen.kind, 'manual');
    assert.match(rec.fixedWhen.note, /re-judge "bowl-proportion"/);
  });

  test("THE LOOP CLOSES: the ugly trophy's records are satisfied by the good trophy's metrics", async () => {
    const uglyRun = await C.runCriticPanel(criticInputFromScene(loadFixture('trophy-ugly'), { intent: 'a trophy' }), { now: NOW });
    const goodMetrics = criticInputFromScene(loadFixture('trophy-good'), { intent: 'a trophy' }).metrics;
    const uglyMetrics = criticInputFromScene(loadFixture('trophy-ugly'), { intent: 'a trophy' }).metrics;
    const checkable = uglyRun.regression.filter((r) => r.fixedWhen.kind === 'metric');
    assert.ok(checkable.length >= 4, 'expected several machine-checkable regressions from the ugly trophy');
    for (const rec of checkable) {
      assert.equal(C.isRegressionFixed(rec, uglyMetrics), false, `${rec.subject} should still be broken on the build it came from`);
      assert.equal(C.isRegressionFixed(rec, goodMetrics), true, `${rec.subject} is not fixed by the good trophy`);
    }
  });

  test('re-checking is honest about what it cannot check', () => {
    assert.equal(C.isRegressionFixed({ fixedWhen: { kind: 'manual', note: 'x' } }, {}), null);
    assert.equal(C.isRegressionFixed({ fixedWhen: { kind: 'metric', metric: 'gone', comparator: '<', threshold: 1 } }, {}), null);
  });

  test('defect ids are stable across runs, so the corpus can be deduplicated', async () => {
    const input = criticInputFromScene(uglyTrophy(), { intent: 'a trophy' });
    const a = await C.runCriticPanel(input, { now: NOW });
    const b = await C.runCriticPanel(input, { now: NOW });
    assert.deepEqual(a.regression.map((r) => r.id), b.regression.map((r) => r.id));
    assert.ok(a.regression.every((r) => /^d_[0-9a-f]{8}$/.test(r.id)));
  });
});

// =============================================================================================
// "NO DEFECTS" MUST NOT MEAN "I DID NOT LOOK"
// =============================================================================================
//
// THE DEFECT. `applyMetricRules` skipped any rule whose metric the harness had not supplied, and
// skipped it SILENTLY. A caller handing the panel a partial metric set got a short defect list —
// and a short defect list is indistinguishable from a clean build. The two readings differ
// entirely in what you should do next, and only one of them makes shipping a mistake.
//
// Skipping is still right: partial metric sets are legitimate, and a caller that can only measure
// geometry should be able to run the geometry lenses. What was wrong was doing it without saying
// so. These tests hold the panel to reporting the difference.

describe('a partial metric set is distinguishable from a clean build', () => {
  /** Every metric the fixture supplies, so "complete" is measured rather than assumed. */
  const FULL = { profileCV: 0.42, boxFill: 0.59, factoryDefaultShare: 0.0, partCount: 36 };

  test('a complete run over a clean build reports nothing unchecked', async () => {
    // The positive control. Without it every assertion below passes on a panel that reports
    // everything as unchecked always, which would be a different way of saying nothing.
    const r = await C.runCriticPanel({ ...INPUT, metrics: FULL });
    assert.deepEqual(
      r.unchecked.filter((u) => Object.prototype.hasOwnProperty.call(FULL, u.metric)),
      [],
      'no rule whose metric WAS supplied may be reported as unchecked',
    );
  });

  test('a metric the harness never measured is reported, not swallowed', async () => {
    const r = await C.runCriticPanel({ ...INPUT, metrics: {} });
    assert.ok(r.unchecked.length > 0, 'an empty metric set must leave rules visibly unrun');
    for (const u of r.unchecked) {
      assert.ok(u.lens, 'each unchecked rule names its lens');
      assert.ok(u.subject, 'each unchecked rule names its subject');
      assert.ok(u.metric, 'each unchecked rule names the metric that was missing');
    }
  });

  test('dropping one metric moves exactly that metric into unchecked', async () => {
    const full = await C.runCriticPanel({ ...INPUT, metrics: FULL });
    const { partCount, ...without } = FULL;
    const partial = await C.runCriticPanel({ ...INPUT, metrics: without });

    const added = partial.unchecked.filter(
      (u) => !full.unchecked.some((f) => f.lens === u.lens && f.subject === u.subject && f.metric === u.metric),
    );
    assert.ok(added.length > 0, 'removing a metric must make at least one rule unrunnable');
    assert.deepEqual([...new Set(added.map((u) => u.metric))], ['partCount']);
  });

  test('a NaN is treated as absent, not as a value that passed the threshold', async () => {
    // `Number.isFinite` was already the guard. What is new is that failing it is now REPORTED —
    // a NaN metric used to look exactly like a metric within tolerance.
    const r = await C.runCriticPanel({ ...INPUT, metrics: { ...FULL, boxFill: Number.NaN } });
    assert.ok(r.unchecked.some((u) => u.metric === 'boxFill'), 'a NaN metric must be reported unchecked');
  });

  test('an unchecked rule raises no criticism — it is absent, not a finding', async () => {
    // The other half of the honesty: reporting an unchecked rule must not fabricate a defect.
    const r = await C.runCriticPanel({ ...INPUT, metrics: {} });
    const bogus = r.criticisms.filter((c) => c.evidence?.kind === 'measure' && !Number.isFinite(c.evidence.value));
    assert.deepEqual(bogus, [], 'no criticism may cite a value the harness never supplied');
  });

  test('the written report says the result is incomplete, before it says what it found', async () => {
    // A caveat that arrives after the verdict is a caveat the reader meets with an opinion already
    // formed. This is the line a human actually sees, so it is the line that is asserted.
    const r = await C.runCriticPanel({ ...INPUT, metrics: {} });
    const report = C.formatPanelReport(r);
    assert.match(report, /INCOMPLETE: \d+ rule\(s\) never ran/);
    assert.ok(
      report.indexOf('INCOMPLETE') < report.indexOf('CONFIRMED'),
      'the incompleteness must precede the verdict it qualifies',
    );
  });

  test('a complete run says nothing about incompleteness', async () => {
    const r = await C.runCriticPanel({ ...INPUT, metrics: FULL });
    const report = C.formatPanelReport(r);
    // Only assert silence when the run really was complete for the lenses that ran.
    if (r.unchecked.length === 0) assert.doesNotMatch(report, /INCOMPLETE/);
  });

  test('runDeterministicLens reports its own unchecked rules, not only the panel', async () => {
    // The panel is one caller. A tool calling a single lens directly — which is exactly what an
    // audit tool would do — must get the same honesty.
    const run = C.runDeterministicLens('composition', { ...INPUT, metrics: {} });
    assert.ok(Array.isArray(run.criticisms), 'a lens run carries its criticisms');
    assert.ok(run.unchecked.length > 0, 'and what it could not check');
  });

  test('a lens with no metric rules reports no false incompleteness', async () => {
    // request_fidelity has no geometric form. Empty unchecked is the honest answer for it; a
    // non-empty one would make every panel look partial forever.
    const run = C.runDeterministicLens('request_fidelity', { ...INPUT, metrics: {} });
    assert.deepEqual(run.unchecked, []);
    assert.deepEqual(run.criticisms, []);
  });
});
