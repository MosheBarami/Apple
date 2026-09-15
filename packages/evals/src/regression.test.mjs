// Regression detection and the promotion / rollback gates.
//
// Every gate test below is run TWICE against the same policy: once on a candidate that measured
// the metric, and once on a candidate that could not. The second case is the one that matters.
// A gate tested only on measurable data passes identically whether it fails open or fails closed,
// which is the same as not testing it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { diffRuns, detectRegressions, promotionGate, rollbackGate, noiseFloor, formatDiff } from './regression.mjs';

const rec = (taskId, score, extra = {}) => ({
  model: 'clay',
  taskId,
  category: 'c',
  ok: true,
  attempts: 1,
  ms: 100,
  score,
  scored: true,
  usage: { inputTokens: 10, outputTokens: 10 },
  checks: [{ type: 'luau_syntax', passed: score >= 1 }],
  ...extra,
});
const deadRec = (taskId) => ({ model: 'clay', taskId, category: 'c', ok: false, attempts: 2, ms: 0, score: null, scored: false, ungradedReason: 'transport_error', error: 'HTTP 500', checks: [] });

const run = (tag, perTask) => ({ runMeta: { tag, startedAt: '2026-09-15T00:00:00.000Z', models: ['clay'] }, perTask });

const GOOD = run('baseline', [rec('t1', 1), rec('t2', 1), rec('t3', 1), rec('t4', 1)]);
const WORSE = run('candidate', [rec('t1', 1), rec('t2', 0), rec('t3', 0), rec('t4', 1)]);
// Same four tasks, all of them dead. NOTHING is known about this candidate's quality.
const BLIND = run('candidate', [deadRec('t1'), deadRec('t2'), deadRec('t3'), deadRec('t4')]);

const POLICY = { require: { passRate: { min: 0.75, maxDrop: 0.05 }, buildValidity: { min: 0.9 } } };
const TRIGGERS = { triggers: { passRate: { maxDrop: 0.1 } } };

// =============================================================================================
// 1. Diff
// =============================================================================================

test('a real quality drop is reported as a regression on the right metric', () => {
  const d = diffRuns(GOOD, WORSE);
  const pr = d.metrics.find((r) => r.id === 'passRate' && r.model === null);
  assert.equal(pr.a, 1);
  assert.equal(pr.b, 0.5);
  assert.equal(pr.delta, -0.5);
  assert.equal(pr.status, 'regressed');
  const { regressions, clean } = detectRegressions(d);
  assert.equal(clean, false);
  assert.ok(regressions.some((r) => r.id === 'passRate' && r.model === null));
  assert.equal(d.tasks.filter((t) => t.status === 'regressed').length, 2);
});

test('a lower-is-better metric moving UP is the regression', () => {
  const fast = run('fast', [rec('t1', 1, { ms: 100 })]);
  const slow = run('slow', [rec('t1', 1, { ms: 9000 })]);
  const rows = diffRuns(fast, slow).metrics.filter((r) => r.model === null);
  assert.equal(rows.find((r) => r.id === 'meanLatencyMs').status, 'regressed', 'latency tripling was called an improvement');
  assert.equal(diffRuns(slow, fast).metrics.find((r) => r.id === 'meanLatencyMs' && r.model === null).status, 'improved');
});

test('an unmeasurable metric is INDETERMINATE on both sides, never a delta against zero', () => {
  const d = diffRuns(GOOD, BLIND);
  const pr = d.metrics.find((r) => r.id === 'passRate' && r.model === null);
  assert.equal(pr.status, 'indeterminate');
  assert.equal(pr.b, null, 'a run that answered nothing was given a pass rate of 0');
  assert.equal(pr.delta, null, 'a delta was computed against a measurement that does not exist');
  assert.match(pr.reason, /^b:all_records_ungraded$/);
  const det = detectRegressions(d);
  assert.deepEqual(det.regressions.filter((r) => r.id === 'passRate'), [], 'an outage was reported as a quality regression');
  assert.ok(det.indeterminate.some((i) => i.id === 'passRate'));
  assert.equal(det.clean, false, '"no regressions" was reported over metrics nobody could measure');
});

test('tasks present in only one run are added/removed, not scored as a change', () => {
  const d = diffRuns(run('a', [rec('t1', 1), rec('gone', 1)]), run('b', [rec('t1', 1), rec('fresh', 0)]));
  assert.deepEqual(d.added.map((t) => t.taskId), ['fresh']);
  assert.deepEqual(d.removed.map((t) => t.taskId), ['gone']);
  assert.deepEqual(d.tasks.map((t) => t.taskId), ['t1']);
});

test('a change smaller than the noise floor is unchanged', () => {
  const a = run('a', [rec('t1', 1, { ms: 1000 })]);
  const b = run('b', [rec('t1', 1, { ms: 1000.4 })]);
  assert.equal(diffRuns(a, b).metrics.find((r) => r.id === 'meanLatencyMs' && r.model === null).status, 'unchanged');
  assert.equal(noiseFloor('fraction'), 0.001);
  assert.equal(noiseFloor('ms'), 1);
});

// =============================================================================================
// 2. Promotion gate -- FAILS CLOSED
// =============================================================================================

test('the promotion gate promotes a candidate that meets every requirement', () => {
  const d = diffRuns(GOOD, run('candidate', [rec('t1', 1), rec('t2', 1), rec('t3', 1), rec('t4', 1)]));
  const g = promotionGate(d, POLICY);
  assert.equal(g.promote, true);
  assert.equal(g.verdict, 'promote');
  assert.deepEqual(g.blocked, []);
  assert.equal(g.checked.length, 2);
});

test('the promotion gate blocks a candidate that fell below the floor', () => {
  const g = promotionGate(diffRuns(GOOD, WORSE), POLICY);
  assert.equal(g.promote, false);
  assert.ok(g.blocked.some((b) => b.id === 'passRate' && b.why === 'threshold'), JSON.stringify(g.blocked));
  assert.match(g.blocked.find((b) => b.id === 'passRate').detail, /< min|dropped/);
});

test('THE GATE FAILS CLOSED: an unmeasured requirement blocks the promotion', () => {
  // Same policy, same baseline. The candidate produced no gradable answer at all, so passRate
  // is not low -- it is unknown. A gate that reads "not a regression" as "fine" ships it.
  const g = promotionGate(diffRuns(GOOD, BLIND), POLICY);
  assert.equal(g.promote, false, 'a candidate nobody could measure was promoted');
  assert.equal(g.verdict, 'blocked');
  assert.ok(g.indeterminate.some((i) => i.id === 'passRate' && i.why === 'unmeasured'), JSON.stringify(g.indeterminate));
  assert.ok(g.blocked.some((b) => b.id === 'passRate' && b.why === 'unmeasured'));
  // and it names the reason, so an operator can tell a broken harness from a bad model
  assert.match(g.blocked.find((b) => b.id === 'passRate').detail, /ungraded/);
});

test('a requirement on a metric the diff does not carry blocks too', () => {
  const g = promotionGate(diffRuns(GOOD, GOOD), { require: { toolCallAccuracy: { min: 0.9 } } });
  assert.equal(g.promote, false, 'a requirement on a metric that was never measured waved the candidate through');
  assert.ok(g.blocked.some((b) => b.id === 'toolCallAccuracy'));
});

test('an EMPTY policy blocks rather than promoting everything', () => {
  const g = promotionGate(diffRuns(GOOD, WORSE), {});
  assert.equal(g.promote, false, 'a gate with no requirements approved a candidate');
  assert.equal(g.blocked[0].why, 'empty_policy');
  assert.deepEqual(g.checked, []);
});

test('maxDrop is enforced even when the absolute floor is met', () => {
  const a = run('a', [rec('t1', 1), rec('t2', 1), rec('t3', 1), rec('t4', 1)]);
  const b = run('b', [rec('t1', 1), rec('t2', 1), rec('t3', 1), rec('t4', 0)]);
  // 0.75 clears `min: 0.75` exactly, and is a 25-point drop from 1.0.
  const g = promotionGate(diffRuns(a, b), { require: { passRate: { min: 0.75, maxDrop: 0.05 } } });
  assert.equal(g.promote, false, 'a 25-point drop passed because the absolute floor was still met');
  assert.match(g.blocked[0].detail, /dropped/);
});

test('the gate can be pointed at one model rather than the run as a whole', () => {
  const a = { runMeta: { tag: 'a', models: ['clay', 'stone'] }, perTask: [rec('t1', 1), { ...rec('t1', 1), model: 'stone' }] };
  const b = { runMeta: { tag: 'b', models: ['clay', 'stone'] }, perTask: [rec('t1', 1), { ...rec('t1', 0), model: 'stone' }] };
  const d = diffRuns(a, b);
  assert.equal(promotionGate(d, { model: 'clay', require: { passRate: { min: 1 } } }).promote, true);
  assert.equal(promotionGate(d, { model: 'stone', require: { passRate: { min: 1 } } }).promote, false);
});

// =============================================================================================
// 3. Rollback gate -- fires on measured harm, and never reports health it did not measure
// =============================================================================================

test('the rollback gate fires on a measured drop past the trigger', () => {
  const g = rollbackGate(diffRuns(GOOD, WORSE), TRIGGERS);
  assert.equal(g.rollback, true);
  assert.equal(g.verdict, 'rollback');
  assert.equal(g.healthy, false);
  assert.equal(g.triggered[0].id, 'passRate');
});

test('the rollback gate stays quiet when the measured numbers held', () => {
  const g = rollbackGate(diffRuns(GOOD, run('candidate', [rec('t1', 1), rec('t2', 1), rec('t3', 1), rec('t4', 1)])), TRIGGERS);
  assert.equal(g.rollback, false);
  assert.equal(g.healthy, true);
  assert.equal(g.verdict, 'healthy');
});

test('THE OTHER SHAPE: unmeasurable does not roll back, and does NOT report healthy either', () => {
  // The asymmetry with the promotion gate is deliberate. Rolling back on every harness hiccup
  // would thrash production; reporting "healthy" over data nobody collected is the failure this
  // whole package is about. So: rollback false, healthy FALSE, verdict indeterminate.
  const g = rollbackGate(diffRuns(GOOD, BLIND), TRIGGERS);
  assert.equal(g.rollback, false, 'a measurement outage triggered a production rollback');
  assert.equal(g.healthy, false, 'a run that measured nothing was reported as healthy');
  assert.equal(g.verdict, 'indeterminate');
  assert.deepEqual(g.triggered, []);
  assert.equal(g.indeterminate[0].id, 'passRate');
  assert.equal(g.indeterminate[0].why, 'unmeasured');
});

test('an EMPTY rollback policy is indeterminate, not healthy', () => {
  const g = rollbackGate(diffRuns(GOOD, WORSE), {});
  assert.equal(g.healthy, false, 'a gate watching nothing declared the deploy healthy');
  assert.equal(g.verdict, 'indeterminate');
  assert.equal(g.indeterminate[0].why, 'empty_policy');
});

test('a maxDrop trigger with no baseline measurement is indeterminate, not a trigger', () => {
  const g = rollbackGate(diffRuns(BLIND, GOOD), TRIGGERS);
  assert.equal(g.rollback, false);
  assert.equal(g.healthy, false, 'a deploy whose baseline was unmeasurable was called healthy');
  assert.ok(g.indeterminate.length > 0);
});

test('a min trigger fires on an absolute floor even with no usable baseline delta', () => {
  const g = rollbackGate(diffRuns(BLIND, WORSE), { triggers: { passRate: { min: 0.9 } } });
  assert.equal(g.rollback, true, 'an absolute floor needs no baseline and must still fire');
  assert.match(g.triggered[0].detail, /< min/);
});

// =============================================================================================
// 4. The two gates disagree about the same unmeasurable run, on purpose
// =============================================================================================

test('on identical unmeasurable input the promotion gate blocks and the rollback gate abstains', () => {
  const d = diffRuns(GOOD, BLIND);
  const p = promotionGate(d, POLICY);
  const r = rollbackGate(d, TRIGGERS);
  assert.equal(p.promote, false);
  assert.equal(r.rollback, false);
  // Neither of them claims anything is fine.
  assert.equal(p.verdict, 'blocked');
  assert.equal(r.verdict, 'indeterminate');
  assert.equal(r.healthy, false);
});

test('formatDiff prints a dash for an indeterminate row rather than a number', () => {
  const text = formatDiff(diffRuns(GOOD, BLIND));
  assert.match(text, /pass rate.*indeterminate/);
  assert.doesNotMatch(text, /pass rate\s+100\.0%\s+0\.0%/, 'the indeterminate row rendered as a drop to zero');
});
