// Per-run scoring: the numbers a run is allowed to claim about itself.
//
// Every test here feeds the metric layer an ACTUAL bad record -- a transport error, a NaN score,
// a latency of Infinity, a luau check that could not run -- and watches what comes out. A test
// that only walked the healthy path would pass against a version of metrics.mjs that scored
// every failure as a zero, which is the exact defect the module exists to prevent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  scoreRecords,
  scoreRun,
  classifyRecord,
  partition,
  percentile,
  measurement,
  unavailable,
  recordCostUsd,
  METRIC_IDS,
  METRIC_DEFS,
} from './metrics.mjs';

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

/** A graded record with everything the metrics layer can read. */
function ok(taskId, score, extra = {}) {
  return {
    taskId,
    category: 'c',
    model: 'clay',
    ok: true,
    attempts: 1,
    ms: 100,
    score,
    scored: true,
    usage: { inputTokens: 100, outputTokens: 100 },
    checks: [],
    ...extra,
  };
}

/** A record that produced NO observation: the transport never came back. */
function dead(taskId, extra = {}) {
  return { taskId, category: 'c', model: 'clay', ok: false, attempts: 2, ms: 0, score: null, scored: false, ungradedReason: 'transport_error', error: 'gateway error (HTTP 500)', checks: [], ...extra };
}

// =============================================================================================
// 1. The headline: an ungraded record cannot move a quality metric in either direction.
// =============================================================================================

test('adding transport failures leaves every quality metric EXACTLY where it was', () => {
  const healthy = [ok('t1', 1), ok('t2', 1), ok('t3', 0)];
  const withOutage = [...healthy, dead('t4'), dead('t5'), dead('t6')];

  const a = scoreRecords(healthy).metrics;
  const b = scoreRecords(withOutage).metrics;

  // The three dead jobs are HALF the suite. Under the old `score: 0` behaviour passRate went
  // from 0.667 to 0.333 and the run looked like a quality regression.
  assert.equal(a.passRate.value, 2 / 3);
  assert.equal(b.passRate.value, 2 / 3, 'passRate moved because of jobs that produced no answer');
  assert.equal(b.meanLatencyMs.value, a.meanLatencyMs.value);
  assert.equal(b.tokenEfficiency.value, a.tokenEfficiency.value);
  assert.equal(b.passRate.n, 3, 'the denominator is the graded records, not all of them');
  assert.equal(b.passRate.ungraded, 3, 'and it says how many were left out');
});

test('the throughput metrics DO move, which is what they are for', () => {
  const healthy = [ok('t1', 1), ok('t2', 1), ok('t3', 0)];
  const withOutage = [...healthy, dead('t4'), dead('t5'), dead('t6')];
  const a = scoreRecords(healthy).metrics;
  const b = scoreRecords(withOutage).metrics;
  assert.equal(a.completionRate.value, 1);
  assert.equal(b.completionRate.value, 0.5);
  assert.equal(a.errorRate.value, 0);
  assert.equal(b.errorRate.value, 0.5);
  assert.ok(b.successRate.value < a.successRate.value, 'end-to-end success must fall when responses do not arrive');
});

test('successRate === passRate x completionRate, exactly', () => {
  // The identity that binds the two families: an end-to-end success needs a response AND a pass.
  // If it ever fails, one of the two denominators has been quietly redefined.
  const recs = [ok('t1', 1), ok('t2', 1), ok('t3', 0.5), ok('t4', 0), dead('t5'), dead('t6'), { ...ok('t7', 1), scored: false, score: null, ungradedReason: 'grader_unavailable' }];
  const m = scoreRecords(recs).metrics;
  assert.ok(Math.abs(m.successRate.value - m.passRate.value * m.completionRate.value) < 1e-12, `${m.successRate.value} != ${m.passRate.value} * ${m.completionRate.value}`);
});

test('completionRate + errorRate is strictly below 1 when a record was ungraded WITHOUT erroring', () => {
  // A record the grader could not grade is neither a completion nor a transport error. If the
  // two sum to 1 here, "ungraded" has been collapsed into "errored" and the harness has lost
  // the ability to tell an outage from a missing checker.
  const recs = [ok('t1', 1), { ...ok('t2', 1), score: null, scored: false, ungradedReason: 'grader_unavailable' }];
  const m = scoreRecords(recs).metrics;
  assert.equal(m.completionRate.value, 0.5);
  assert.equal(m.errorRate.value, 0, 'a missing grader is not a transport error');
  assert.ok(m.completionRate.value + m.errorRate.value < 1);
});

// =============================================================================================
// 2. Numbers crossing the trust boundary
// =============================================================================================

test('a non-finite or out-of-range score is rejected as invalid, never averaged', () => {
  // `??` defends null and undefined and nothing else. Each of these survives it.
  const poison = [NaN, Infinity, -Infinity, '0.5', 1.5, -0.1, true, {}];
  for (const score of poison) {
    const c = classifyRecord({ ok: true, scored: true, score });
    assert.equal(c.graded, false, `score ${String(score)} was accepted as gradable`);
  }
  const m = scoreRecords([ok('good', 1), { ...ok('bad', 0), score: NaN }]).metrics;
  assert.equal(m.passRate.value, 1, 'a NaN score contaminated the mean');
  assert.ok(Number.isFinite(m.passRate.value));
  assert.equal(m.passRate.ungraded, 1);
});

test('a NaN latency is dropped from the latency metrics rather than making them NaN', () => {
  const m = scoreRecords([ok('t1', 1, { ms: 100 }), ok('t2', 1, { ms: NaN }), ok('t3', 1, { ms: Infinity }), ok('t4', 1, { ms: -5 })]).metrics;
  assert.equal(m.meanLatencyMs.value, 100);
  assert.equal(m.meanLatencyMs.n, 1);
  assert.equal(m.meanLatencyMs.ungraded, 3);
});

test('measurement() refuses to publish a non-finite value at all', () => {
  assert.throws(() => measurement('passRate', NaN, { n: 1 }), /non-finite/);
  assert.throws(() => measurement('passRate', Infinity, { n: 1 }), /non-finite/);
  assert.throws(() => unavailable('passRate', ''), /must say why/);
  assert.throws(() => measurement('noSuchMetric', 1, { n: 1 }), /unknown metric/);
});

test('an unavailable measurement carries null, not 0', () => {
  const m = scoreRecords([]).metrics;
  for (const id of METRIC_IDS) {
    assert.equal(m[id].available, false, `${id} claimed to be available over zero records`);
    assert.equal(m[id].value, null, `${id} reported ${m[id].value} for "no data"`);
    assert.ok(m[id].reason, `${id} is unavailable and does not say why`);
  }
});

// =============================================================================================
// 3. Build validity: an absent checker is not a broken build
// =============================================================================================

test('an unavailable luau check is excluded from build validity, not counted as a failure', () => {
  const recs = [
    ok('t1', 1, { checks: [{ type: 'luau_syntax', passed: true }] }),
    ok('t2', 1, { checks: [{ type: 'luau_syntax', passed: false, unavailable: true, reason: 'luau_checker_absent' }] }),
  ];
  const m = scoreRecords(recs).metrics;
  // Counting the unavailable one as a failure would give 0.5 here -- half the models' code
  // reported as unparseable because half the machine had no checker installed.
  assert.equal(m.buildValidity.value, 1);
  assert.equal(m.buildValidity.n, 1);
  assert.equal(m.buildValidity.ungraded, 1);
});

test('build validity is UNAVAILABLE when no luau check could run at all', () => {
  const recs = [ok('t1', 1, { checks: [{ type: 'luau_syntax', passed: false, unavailable: true, reason: 'luau_checker_absent' }] })];
  const m = scoreRecords(recs).metrics;
  assert.equal(m.buildValidity.available, false);
  assert.equal(m.buildValidity.value, null, 'a machine with no Luau checker reported 0% build validity');
  assert.equal(m.buildValidity.reason, 'luau_checker_absent');
});

test('build validity distinguishes "no luau checks" from "checker absent"', () => {
  const m = scoreRecords([ok('t1', 1, { checks: [{ type: 'contains', passed: true }] })]).metrics;
  assert.equal(m.buildValidity.available, false);
  assert.equal(m.buildValidity.reason, 'no_luau_checks');
});

test('build validity reports real breakage when the checker DID run', () => {
  const recs = [
    ok('t1', 1, { checks: [{ type: 'luau_syntax', passed: true }] }),
    ok('t2', 0, { checks: [{ type: 'luau_syntax', passed: false, detail: 'SyntaxError' }] }),
    ok('t3', 0, { checks: [{ type: 'luau_syntax', passed: false, detail: 'SyntaxError' }] }),
  ];
  const m = scoreRecords(recs).metrics;
  assert.equal(m.buildValidity.value, 1 / 3);
  assert.equal(m.buildValidity.n, 3);
});

// =============================================================================================
// 4. Tool-call accuracy
// =============================================================================================

test('tool-call accuracy separates "never looked" from "looked and it was wrong"', () => {
  const neverLooked = scoreRecords([ok('t1', 1)]).metrics.toolCallAccuracy;
  assert.equal(neverLooked.available, false);
  assert.equal(neverLooked.reason, 'no_tool_expectations');
  assert.equal(neverLooked.value, null);

  const lookedAndFailed = scoreRecords([ok('t1', 1, { toolGrade: { available: true, score: 0 } })]).metrics.toolCallAccuracy;
  assert.equal(lookedAndFailed.available, true);
  assert.equal(lookedAndFailed.value, 0, 'a graded tool call that was wrong IS a zero -- that one is a real observation');
});

test('a tool grade that could not be produced is excluded, not averaged as 0', () => {
  const m = scoreRecords([
    ok('t1', 1, { toolGrade: { available: true, score: 1 } }),
    ok('t2', 1, { toolGrade: { available: false, reason: 'no_tool_calls_recorded' } }),
  ]).metrics;
  assert.equal(m.toolCallAccuracy.value, 1);
  assert.equal(m.toolCallAccuracy.n, 1);
  assert.equal(m.toolCallAccuracy.ungraded, 1);
});

// =============================================================================================
// 5. Latency percentiles
// =============================================================================================

test('percentile interpolates, and p95 sits between the median and the max', () => {
  const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const p50 = percentile(xs, 0.5);
  const p95 = percentile(xs, 0.95);
  assert.equal(percentile(xs, 0), 10);
  assert.equal(percentile(xs, 1), 100);
  assert.equal(p50, 55);
  // The relationship is the claim, not the literal: p95 must order correctly against its
  // neighbours for any input, which "p95 === 95.5" would not catch if the sort were dropped.
  assert.ok(p50 < p95 && p95 <= 100, `p50=${p50} p95=${p95}`);
  assert.equal(percentile([42], 0.95), 42, 'a single sample is its own percentile');
  assert.equal(percentile([], 0.95), null, 'no samples must not become 0');
  assert.throws(() => percentile(xs, 1.5), /p must be in/);
});

test('p95 latency is at least the mean when one job is much slower than the rest', () => {
  const recs = [ok('a', 1, { ms: 100 }), ok('b', 1, { ms: 100 }), ok('c', 1, { ms: 100 }), ok('d', 1, { ms: 9000 })];
  const m = scoreRecords(recs).metrics;
  assert.ok(m.p95LatencyMs.value > m.meanLatencyMs.value, 'a tail that the mean hides must show in p95');
  assert.ok(m.p95LatencyMs.value <= 9000);
});

// =============================================================================================
// 6. Cost: refuse to invent a price
// =============================================================================================

test('cost comes from settled neurons when the gateway reported them', () => {
  const { usd, source } = recordCostUsd({ neurons: 1000 });
  assert.equal(source, 'neurons');
  assert.ok(Math.abs(usd - 0.011) < 1e-12, `1000 neurons should be $0.011, got ${usd}`);
});

test('cost from tokens requires a model id the price table knows', () => {
  const usage = { inputTokens: 1000, outputTokens: 1000 };
  // 'stone' is a GATEWAY KEY, not a model id. neuronsFor() would happily price it at the most
  // expensive rate in the table -- correct for reserving budget, a fabrication as a measurement.
  const unknown = recordCostUsd({ usage, modelId: 'stone' });
  assert.equal(unknown.usd, null);
  assert.equal(unknown.reason, 'unknown_model_price');

  const known = recordCostUsd({ usage, modelId: '@cf/zai-org/glm-5.3-flash' });
  assert.ok(known.usd > 0 && Number.isFinite(known.usd));
  assert.equal(known.source, 'tokens');

  const noUsage = recordCostUsd({ modelId: '@cf/zai-org/glm-5.3-flash' });
  assert.equal(noUsage.usd, null);
  assert.equal(noUsage.reason, 'no_usage_reported');
});

test('mean cost is unavailable, with a reason, when no record can be priced', () => {
  const m = scoreRecords([ok('t1', 1, { modelId: 'stone' })]).metrics;
  assert.equal(m.meanCostUsd.available, false);
  assert.equal(m.meanCostUsd.value, null, 'an unpriceable run reported $0.00 per task');
  assert.match(m.meanCostUsd.reason, /unknown_model_price/);
});

test('token efficiency rises when the same score costs fewer tokens', () => {
  const cheap = scoreRecords([ok('t1', 1, { usage: { inputTokens: 50, outputTokens: 50 } })]).metrics.tokenEfficiency;
  const dear = scoreRecords([ok('t1', 1, { usage: { inputTokens: 500, outputTokens: 500 } })]).metrics.tokenEfficiency;
  assert.ok(cheap.value > dear.value, `${cheap.value} should beat ${dear.value}`);
  assert.equal(scoreRecords([ok('t1', 1, { usage: null })]).metrics.tokenEfficiency.available, false);
});

// =============================================================================================
// 7. Attempts
// =============================================================================================

test('first-attempt success excludes a pass that needed a retry, and never exceeds success rate', () => {
  const recs = [ok('t1', 1, { attempts: 1 }), ok('t2', 1, { attempts: 2 }), ok('t3', 0, { attempts: 1 })];
  const m = scoreRecords(recs).metrics;
  assert.equal(m.successRate.value, 2 / 3);
  assert.equal(m.firstAttemptSuccess.value, 1 / 3, 'the retried pass must not count as first-attempt');
  assert.ok(m.firstAttemptSuccess.value <= m.successRate.value);
  assert.equal(m.retryRate.value, 1 / 3);
});

test('a bogus attempts field falls back to 1 instead of poisoning the retry rate', () => {
  for (const attempts of [0, -1, 2.5, NaN, '3', null]) {
    const m = scoreRecords([ok('t1', 1, { attempts })]).metrics;
    assert.equal(m.retryRate.value, 0, `attempts=${String(attempts)} was treated as a retry`);
    assert.ok(Number.isFinite(m.retryRate.value));
  }
});

// =============================================================================================
// 8. Against the real recorded runs in results/
// =============================================================================================

test('THE RECORDED RUN THIS MODULE EXISTS FOR: 168 dead jobs, stored as three models scoring 0', () => {
  // results/baseline-20260830-200846.json is in this repository. Every one of its 168 jobs died
  // with the same ReferenceError -- "useRag is not defined", a bug in the harness itself -- and
  // the file's own `overall` block records:
  //     clay 0, stone 0, coder 0
  // with `transportErrors: 56` beside each, which nothing that reads the file was obliged to
  // look at. report.mjs renders that run into docs/evals/RESULTS.md as a row of 0.0s. Three
  // models were never asked a question and the ledger says they failed every one.
  const file = 'baseline-20260830-200846.json';
  const data = JSON.parse(readFileSync(join(RESULTS_DIR, file), 'utf8'));
  assert.equal(data.perTask.length, 168);
  assert.equal(data.perTask.filter((t) => t.ok).length, 0, 'fixture drift: this run is supposed to be a total outage');
  for (const o of data.overall) assert.equal(o.score, 0, `stored overall for ${o.model} is no longer the 0 this test is about`);

  const s = scoreRun(data);
  assert.equal(s.overall.gradedCount, 0);
  assert.equal(s.overall.attempted, 168);
  assert.equal(s.overall.metrics.passRate.available, false, 'a run where nothing was answered produced a pass rate');
  assert.equal(s.overall.metrics.passRate.value, null);
  assert.equal(s.overall.metrics.passRate.reason, 'all_records_ungraded');
  // What it CAN say is that nothing completed and everything errored. Those are observations.
  assert.equal(s.overall.metrics.completionRate.value, 0);
  assert.equal(s.overall.metrics.errorRate.value, 1);
  for (const model of s.models) assert.equal(s.byModel[model].metrics.passRate.available, false, `${model} still has a pass rate`);
});

test('the other historical result files score without inventing a cost for them', () => {
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'no recorded runs to score');
  let withGraded = 0;
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf8'));
    if (!Array.isArray(data.perTask) || data.perTask.length === 0) continue;
    const s = scoreRun(data);
    // These runs predate neuron/model-id capture. The honest answer is "not measured".
    assert.equal(s.overall.metrics.meanCostUsd.available, false, `${f} produced a cost figure from a run that recorded no price information`);
    if (s.overall.gradedCount > 0) {
      withGraded += 1;
      assert.equal(s.overall.metrics.tokenEfficiency.available, true, `${f} has graded records with usage but no token efficiency`);
      assert.equal(s.overall.metrics.passRate.available, true, `${f} has graded records but no pass rate`);
    }
    for (const id of METRIC_IDS) {
      const met = s.overall.metrics[id];
      assert.ok(met, `${f} is missing metric ${id}`);
      if (met.available) assert.ok(Number.isFinite(met.value), `${f}.${id} published ${met.value}`);
      else assert.equal(met.value, null, `${f}.${id} is unavailable but carries ${met.value}`);
    }
  }
  assert.ok(withGraded >= 3, `expected several runs with graded records, found ${withGraded}`);
});

test('every metric id declares a direction the gates can read', () => {
  // A metric with no direction cannot be gated or ranked: "lower is better" is not inferable
  // from the number. A new metric added without one would silently rank backwards.
  for (const id of METRIC_IDS) {
    const def = METRIC_DEFS[id];
    assert.ok(['higher', 'lower'].includes(def.direction), `${id} direction=${def.direction}`);
    assert.ok(['quality', 'throughput'].includes(def.family), `${id} family=${def.family}`);
  }
});

test('partition itemises what was left out and why', () => {
  const { graded, ungraded } = partition([ok('t1', 1), dead('t2'), { ...ok('t3', 1), score: null, scored: false, ungradedReason: 'grader_unavailable' }, { ok: false, taskId: 't4', error: 'timeout after 120000ms' }]);
  assert.equal(graded.length, 1);
  assert.deepEqual(ungraded.map((u) => u.reason).sort(), ['grader_unavailable', 'timeout', 'transport_error']);
  assert.ok(ungraded.every((u) => u.taskId));
});

test('base-gate incomplete responses retain their measured cause without moving quality scores', () => {
  const reasons = ['truncated', 'unexpected_model', 'missing_finish_reason'];
  const incomplete = reasons.map((reason, index) => ok(`incomplete-${index}`, null, {
    scored: false, complete: false, ungradedReason: reason,
  }));
  const records = [ok('complete', 1), ...incomplete];
  const split = partition(records);
  assert.deepEqual(split.ungraded.map(row => row.reason), reasons);
  assert.equal(split.graded.length, 1);
  const scores = scoreRecords(records);
  assert.equal(scores.metrics.passRate.value, 1);
  assert.equal(scores.metrics.passRate.ungraded, 3);
  assert.equal(scores.metrics.completionRate.value, 0.25);
});
