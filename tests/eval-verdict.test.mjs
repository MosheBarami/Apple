/**
 * scripts/eval/lib/verdict.mjs: the pass rule of plan 4.3, one test per clause, each shown to FAIL the piece.
 *
 * The rule: the lower of two critic scores >= 8 in every applicable area (N/A only if both critics mark it); neither critic
 * lists a severe flaw; the play test shows 0 errors; every scripted functional check passes; the claim audit finds 0
 * unsupported claims. Two clauses this harness adds, both of which only make a piece harder to pass: the run ended
 * normally, and each critic viewed every screenshot.
 *
 * THE DECISION ON "NO FUNCTIONAL CHECKS DEFINED" (they arrive with the block engine in M5): it is NOT a pass. An empty list
 * of checks is vacuously "all passed", and reading it that way would let every piece through that clause and inflate the
 * pass rate. So the clause is "not established": status `unevaluable`, pass false, and the reason says so. The same piece
 * is also reported as `passIgnoringFunctionalChecks` (the other four clauses), which is a labelled side figure.
 *
 * Run with:  node --test tests/eval-verdict.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, PASS_THRESHOLD, computeVerdict, lowerScores, validateCritic } from '../scripts/eval/lib/verdict.mjs';

const SHOTS = ['overview.png', 'three-quarter.png', 'close-up.png', 'spawn-eye.png'];
const critic = (over = {}) => ({
  scores: { delivers: 9, visual: 8.5, layout: 8, ui: null, life: 8, polish: 9, ...(over.scores ?? {}) },
  na: ['ui'],
  severeFlaws: [],
  topFixes: ['x'],
  notes: 'n',
  shotsViewed: SHOTS,
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'scores')),
});
const good = (over = {}) => ({
  requestId: 'P01',
  criticA: critic(),
  criticB: critic(),
  shotsGiven: SHOTS,
  planned: { names: SHOTS, missing: [] },
  playTest: { errors: 0, warnings: 2 },
  functionalChecks: { defined: true, results: [{ id: 'opens-on-e', pass: true }] },
  claims: { unsupported: [] },
  run: { endedBy: 'done' },
  ...over,
});

test('CONTROL: a piece that meets every clause passes, so the failures below are not a broken rule', () => {
  const v = computeVerdict(good());
  assert.equal(v.status, 'pass');
  assert.equal(v.pass, true);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.lower.delivers, 9);
  assert.deepEqual(v.na, ['ui']);
});

test('CLAUSE 1: the LOWER of the two scores decides, in every applicable area, at exactly 8', () => {
  for (const area of ['delivers', 'visual', 'layout', 'life', 'polish']) {
    // A is 10 and B is 7.5: the lower (7.5) fails even though the mean (8.75) would pass.
    const v = computeVerdict(good({ criticA: critic({ scores: { [area]: 10 } }), criticB: critic({ scores: { [area]: 7.5 } }) }));
    assert.equal(v.pass, false, area);
    assert.equal(v.status, 'fail');
    assert.match(v.reasons.join('\n'), new RegExp(`${area}: the lower score 7.5 is below ${PASS_THRESHOLD}`));
  }
  // exactly 8 passes
  assert.equal(computeVerdict(good({ criticA: critic({ scores: { visual: 8 } }), criticB: critic({ scores: { visual: 8 } }) })).pass, true);
  // 7.9 does not
  assert.equal(computeVerdict(good({ criticA: critic({ scores: { visual: 7.9 } }) })).pass, false);
});

test('CLAUSE 1, the UI area: scored when either critic scores it; N/A only when BOTH mark it', () => {
  const uiA = critic({ scores: { ui: 6 }, na: [] });
  const uiNaB = critic();
  const one = computeVerdict(good({ criticA: uiA, criticB: uiNaB }));
  assert.equal(one.lower.ui, 6, 'one critic scored it, so that score is used');
  assert.equal(one.pass, false);
  assert.deepEqual(one.na, []);
  const both = computeVerdict(good({ criticA: critic(), criticB: critic() }));
  assert.deepEqual(both.na, ['ui']);
  assert.equal(both.pass, true);
  const bothScored = computeVerdict(good({ criticA: critic({ scores: { ui: 9 }, na: [] }), criticB: critic({ scores: { ui: 8 }, na: [] }) }));
  assert.equal(bothScored.lower.ui, 8);
  assert.equal(bothScored.pass, true);
});

test('only the UI area may be N/A: a critic that marks another area N/A is not usable', () => {
  const v = computeVerdict(good({ criticA: critic({ scores: { visual: null }, na: ['ui', 'visual'] }) }));
  assert.equal(v.status, 'unevaluable');
  assert.match(v.reasons.join('\n'), /"visual" may not be marked N\/A/);
});

test('CLAUSE 2: a severe flaw from EITHER critic fails the piece whatever the scores are', () => {
  const flaw = [{ flaw: 3, evidence: 'overview: the price text overlaps the egg icon' }];
  for (const [label, over] of [['A', { criticA: critic({ severeFlaws: flaw }) }], ['B', { criticB: critic({ severeFlaws: flaw }) }]]) {
    const v = computeVerdict(good({ ...over, criticA: over.criticA ?? critic({ scores: { delivers: 10, visual: 10, layout: 10, life: 10, polish: 10 } }) }));
    assert.equal(v.pass, false, label);
    assert.match(v.reasons.join('\n'), new RegExp(`severe flaw 3 \\(critic ${label}\\)`));
  }
});

test('CLAUSE 3: one play-test error fails the piece; zero passes; no play test is not a pass', () => {
  const one = computeVerdict(good({ playTest: { errors: 1 } }));
  assert.equal(one.pass, false);
  assert.match(one.reasons.join('\n'), /play test: 1 error\b/);
  assert.match(computeVerdict(good({ playTest: { errors: 4 } })).reasons.join('\n'), /4 errors/);
  const none = computeVerdict(good({ playTest: null }));
  assert.equal(none.pass, false);
  assert.equal(none.status, 'unevaluable');
  assert.match(none.reasons.join('\n'), /play test: it did not run/);
  assert.equal(computeVerdict(good({ playTest: { errors: 0, warnings: 9 } })).pass, true, 'warnings do not fail a piece');
});

test('CLAUSE 4: a failed functional check fails the piece, and every check must pass', () => {
  const v = computeVerdict(good({ functionalChecks: { defined: true, results: [{ id: 'a', pass: true }, { id: 'saves-and-reloads', pass: false }] } }));
  assert.equal(v.pass, false);
  assert.equal(v.status, 'fail');
  assert.match(v.reasons.join('\n'), /functional check "saves-and-reloads" failed/);
});

test('CLAUSE 4, THE DECISION: no functional checks defined is NOT a pass: unevaluable, and it says so plainly', () => {
  const v = computeVerdict(good({ functionalChecks: { defined: false } }));
  assert.equal(v.pass, false, 'a piece cannot pass a clause that was never run');
  assert.equal(v.status, 'unevaluable');
  assert.match(v.reasons.join('\n'), /functional checks: none are defined for this request yet.*cannot pass/s);
  assert.equal(v.passIgnoringFunctionalChecks, true, 'the other four clauses are met, and that is reported separately, labelled');
  assert.equal(v.functionalChecksEstablished, false);
  // marked defined with no result recorded is also not established
  const empty = computeVerdict(good({ functionalChecks: { defined: true, results: [] } }));
  assert.equal(empty.pass, false);
  assert.match(empty.reasons.join('\n'), /no result was recorded/);
  // and so is no record at all (the key absent, or null): the rule itself fails closed, not only the caller that reads the manifest
  for (const [label, functionalChecks] of [['absent', undefined], ['null', null]]) {
    const { functionalChecks: _dropped, ...rest } = good();
    const v = computeVerdict(functionalChecks === undefined ? rest : { ...rest, functionalChecks });
    assert.equal(v.pass, false, label);
    assert.equal(v.status, 'unevaluable', label);
    assert.equal(v.functionalChecksEstablished, false, label);
    assert.match(v.reasons.join('\n'), /functional checks: none are defined for this request yet/, label);
  }
});

test('the side figure never turns a failing piece into a passing one: any other failed clause clears it', () => {
  const v = computeVerdict(good({ functionalChecks: { defined: false }, playTest: { errors: 2 } }));
  assert.equal(v.status, 'fail');
  assert.equal(v.passIgnoringFunctionalChecks, false);
  const lowScore = computeVerdict(good({ functionalChecks: { defined: false }, criticA: critic({ scores: { polish: 3 } }) }));
  assert.equal(lowScore.passIgnoringFunctionalChecks, false);
});

test('CLAUSE 5: one unsupported claim fails the piece; an audit that did not run is not a pass', () => {
  const v = computeVerdict(good({ claims: { unsupported: [{ claim: 'I tested it and it works' }] } }));
  assert.equal(v.pass, false);
  assert.match(v.reasons.join('\n'), /claim audit: 1 unsupported claim\b/);
  const notRun = computeVerdict(good({ claims: null }));
  assert.equal(notRun.pass, false);
  assert.equal(notRun.status, 'unevaluable');
  assert.match(notRun.reasons.join('\n'), /claim audit: it did not run/);
});

test('THE RUN MUST HAVE ENDED NORMALLY: a timeout, a stop, an error, a quota stop and a dry run all fail', () => {
  for (const endedBy of ['timeout', 'stopped', 'error', 'quota', 'incomplete', 'never-started', 'no-reply', 'dry-run', 'aborted']) {
    const v = computeVerdict(good({ run: { endedBy } }));
    assert.equal(v.pass, false, endedBy);
    assert.match(v.reasons.join('\n'), new RegExp(`did not end normally \\(${endedBy}\\)`));
  }
  assert.equal(computeVerdict(good({ run: { endedBy: 'done' } })).pass, true);
});

test('A CRITIC THAT DID NOT LOOK AT EVERY SCREENSHOT IS NOT COUNTED', () => {
  const v = computeVerdict(good({ criticB: critic({ shotsViewed: ['overview.png', 'close-up.png'] }) }));
  assert.equal(v.pass, false);
  assert.equal(v.status, 'unevaluable');
  assert.match(v.reasons.join('\n'), /critic B is not usable: did not view 2 of 4 screenshots: three-quarter\.png, spawn-eye\.png/);
});

test('missing or malformed critic output is unevaluable, never a pass and never a zero-mean', () => {
  for (const bad of [null, undefined, {}, { scores: {} }, { scores: { delivers: 'ten' } }, { scores: { delivers: 11, visual: 8, layout: 8, ui: null, life: 8, polish: 8 }, na: ['ui'], severeFlaws: [], shotsViewed: SHOTS }]) {
    const v = computeVerdict(good({ criticA: bad }));
    assert.equal(v.pass, false);
    assert.equal(v.status, 'unevaluable');
    assert.equal(v.lower, null, 'no scores are reported from an unusable critic');
  }
  assert.equal(computeVerdict(good({ criticA: critic({ severeFlaws: [{ flaw: 9, evidence: 'x' }] }) })).status, 'unevaluable');
  assert.equal(computeVerdict(good({ criticA: critic({ severeFlaws: [{ flaw: 2, evidence: '' }] }) })).status, 'unevaluable', 'a severe flaw must cite its evidence');
});

test('a decided failure outranks an unestablished clause: the status is fail, not unevaluable', () => {
  const v = computeVerdict(good({ playTest: { errors: 3 }, claims: null }));
  assert.equal(v.status, 'fail');
  assert.ok(v.reasons.length >= 2);
});

test('lowerScores takes the minimum per area and reports N/A only where both critics did', () => {
  const r = lowerScores(critic({ scores: { delivers: 9, visual: 6 } }), critic({ scores: { delivers: 7, visual: 10 } }));
  assert.equal(r.lower.delivers, 7);
  assert.equal(r.lower.visual, 6);
  assert.deepEqual(r.na, ['ui']);
  assert.deepEqual(AREAS, ['delivers', 'visual', 'layout', 'ui', 'life', 'polish']);
});

test('validateCritic accepts the rubric shape and names each defect', () => {
  assert.deepEqual(validateCritic(critic(), { shotsGiven: SHOTS }), { ok: true, problems: [] });
  assert.match(validateCritic(critic({ na: [], scores: { ui: null } })).problems.join(), /ui has no score/);
  assert.match(validateCritic(critic({ na: ['ui'], scores: { ui: 7 } })).problems.join(), /ui is in na but has a score/);
  assert.match(validateCritic(critic({ severeFlaws: 'none' })).problems.join(), /severeFlaws is not a list/);
});

test('the verdict records what produced it: both critics, the lower scores, the non-critic results', () => {
  const v = computeVerdict(good());
  assert.ok(v.critics.a && v.critics.b);
  assert.deepEqual(Object.keys(v.nonCritic).sort(), ['claimAudit', 'functionalChecks', 'playTest', 'runEndedBy', 'screenshots']);
  assert.equal(v.threshold, 8);
});

// ================================================================================ the clauses the first review found unguarded
test('THE RUN RECORD: a missing run, or a run with no ending recorded, is NOT a normal ending (it fails closed like every other absent input)', () => {
  for (const run of [undefined, null, {}, { endedBy: undefined }, { endedBy: null }]) {
    const v = computeVerdict(good({ run }));
    assert.equal(v.pass, false, JSON.stringify(run));
    assert.equal(v.status, 'fail');
    assert.match(v.reasons.join('\n'), /did not end normally \(unknown\)/);
    assert.equal(v.nonCritic.runEndedBy, 'unknown');
  }
  const omitted = good();
  delete omitted.run;
  assert.equal(computeVerdict(omitted).status, 'fail', 'no `run` key at all');
});

test('THE PLANNED PICTURES: a piece is not scored on the pictures that happened to be saved; the critics\' scores of an incomplete set are not counted', () => {
  const one = computeVerdict(good({ planned: { names: SHOTS, missing: [{ name: 'close-up', why: 'screen_capture returned no picture' }] } }));
  assert.equal(one.pass, false);
  assert.equal(one.status, 'unevaluable');
  assert.match(one.reasons.join('\n'), /screenshots: 1 of 4 planned pictures are missing \(close-up: screen_capture returned no picture\).*scores are not counted/s);
  assert.equal(one.lower, null, 'no mean is reported from scores given on an incomplete set');
  assert.equal(one.na, null);
  assert.deepEqual(one.nonCritic.screenshots, { planned: SHOTS, missing: [{ name: 'close-up', why: 'screen_capture returned no picture' }] });
  // all of them missing, and the scores are glowing: still nothing
  const none = computeVerdict(good({ planned: { names: SHOTS, missing: SHOTS.map((name) => ({ name })) } }));
  assert.equal(none.status, 'unevaluable');
  assert.equal(none.passIgnoringFunctionalChecks, false);
  // a manifest that cannot say what was planned leaves the clause unestablished, not satisfied
  for (const planned of [undefined, null, {}, { names: SHOTS }, { missing: [] }]) {
    const v = computeVerdict(good({ planned }));
    assert.equal(v.status, 'unevaluable', JSON.stringify(planned));
    assert.match(v.reasons.join('\n'), /screenshots: the manifest does not say which pictures the piece should have/);
  }
  // a decided failure still outranks it
  assert.equal(computeVerdict(good({ planned: { names: SHOTS, missing: [{ name: 'overview' }] }, playTest: { errors: 1 } })).status, 'fail');
});

test('THE UI AREA ON A UI PIECE: both critics marking it N/A leaves it unscored, and the piece unevaluable; one critic scoring it is enough', () => {
  const because = 'the harness found a screen UI in what was built';
  const both = computeVerdict(good({ uiRequired: because }));
  assert.equal(both.pass, false);
  assert.equal(both.status, 'unevaluable');
  assert.match(both.reasons.join('\n'), /ui: both critics marked UI\/UX N\/A, but the harness found a screen UI in what was built/);
  // CONTROLS: the same two critics on a piece that may be N/A pass; one critic scoring the UI is the pass rule as written
  assert.equal(computeVerdict(good({ uiRequired: null })).pass, true, 'a world piece may have its UI area N/A');
  assert.equal(computeVerdict(good({ uiRequired: undefined })).pass, true);
  const oneScores = computeVerdict(good({ uiRequired: because, criticA: critic({ scores: { ui: 9 }, na: [] }) }));
  assert.equal(oneScores.pass, true, JSON.stringify(oneScores.reasons));
  assert.equal(oneScores.lower.ui, 9);
  const bothScore = computeVerdict(good({ uiRequired: because, criticA: critic({ scores: { ui: 9 }, na: [] }), criticB: critic({ scores: { ui: 8 }, na: [] }) }));
  assert.equal(bothScore.pass, true);
  // a low UI score still fails, N/A or not
  assert.equal(computeVerdict(good({ uiRequired: because, criticA: critic({ scores: { ui: 3 }, na: [] }) })).status, 'fail');
});

test('THE PLAY TEST WITHOUT EVIDENCE: an error count of null (not established) is unevaluable and names what was missing; a count of 0 stands', () => {
  const v = computeVerdict(good({ playTest: { errors: null, warnings: null, why: ['the server log could not be read', 'the console could not be read'] } }));
  assert.equal(v.status, 'unevaluable');
  assert.match(v.reasons.join('\n'), /play test: not established \(the server log could not be read; the console could not be read\), so its errors were not counted/);
  assert.deepEqual(v.nonCritic.playTest.why, ['the server log could not be read', 'the console could not be read']);
  assert.equal(v.nonCritic.playTest.errors, null);
  assert.match(computeVerdict(good({ playTest: { errors: undefined } })).reasons.join('\n'), /not established \(no error count was recorded\)/);
  assert.equal(computeVerdict(good({ playTest: { errors: 0, warnings: 0, why: [] } })).pass, true);
});

test('passIgnoringFunctionalChecks is true ONLY when the functional clause is the single thing not established: no other gap may ride along', () => {
  const noChecks = { functionalChecks: { defined: false } };
  assert.equal(computeVerdict(good(noChecks)).passIgnoringFunctionalChecks, true, 'CONTROL: only the checks are missing');
  // each other way a clause can be merely unestablished, alone and beside the functional gap
  for (const [label, over] of [
    ['the claim audit never ran', { claims: null }],
    ['the play test never ran', { playTest: null }],
    ['the play test is not established', { playTest: { errors: null, why: ['play did not start'] } }],
    ['a critic is not usable', { criticB: null }],
    ['a critic skipped a picture', { criticA: critic({ shotsViewed: ['overview.png'] }) }],
    ['a planned picture is missing', { planned: { names: SHOTS, missing: [{ name: 'overview' }] } }],
    ['the pictures planned are unknown', { planned: null }],
    ['the UI area is N/A on a UI piece', { uiRequired: 'the request is in the UI category' }],
    ['the functional checks are defined but recorded no result', { functionalChecks: { defined: true, results: [] } }],
  ]) {
    const v = computeVerdict(good({ ...noChecks, ...over }));
    assert.equal(v.status, 'unevaluable', label);
    assert.equal(v.passIgnoringFunctionalChecks, false, `${label}: the side figure must not count it`);
  }
  // a decided failure clears it too
  assert.equal(computeVerdict(good({ ...noChecks, playTest: { errors: 2 } })).passIgnoringFunctionalChecks, false);
  // and a piece that passes outright is, of course, counted
  assert.equal(computeVerdict(good()).passIgnoringFunctionalChecks, true);
});
