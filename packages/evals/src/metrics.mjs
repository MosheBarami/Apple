// ============================================================================================
// Per-run scoring: the numbers a run is allowed to claim about itself.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE:
//   a grader that could not grade reports that it could not. It never reports a zero.
//
// A zero is a claim about the model. "No response arrived", "no Luau checker was installed",
// "this run never recorded tool calls" are claims about the HARNESS, and averaging them into a
// quality score prints a measurement of the machine as a measurement of the model. Every metric
// below is therefore one of two shapes and never a third:
//
//   { available: true,  value: <finite number>, n, ungraded }
//   { available: false, value: null, reason: '<why nothing was measured>', n: 0, ungraded }
//
// `value` is `null` when unavailable, not 0 and not NaN, so a consumer that forgets to check
// `available` gets an arithmetic result it cannot mistake for a score. `measurement()` throws
// on a non-finite value rather than publish one.
//
// The metrics split deliberately into two families by DENOMINATOR, because conflating them is
// how an outage gets read as a quality regression:
//
//   quality     (passRate, buildValidity, toolCallAccuracy, latency, cost, tokenEfficiency)
//               denominator = records that were actually graded. Ungraded records are invisible
//               to these; they cannot move them in either direction.
//   throughput  (completionRate, errorRate, retryRate, successRate, firstAttemptSuccess)
//               denominator = every record attempted. These are ABOUT the ungraded ones.
//
// The identity binding the two families is asserted in metrics.test.mjs:
//     successRate === passRate × completionRate
// which is exactly the statement that an end-to-end success needs both a response and a pass.
// ============================================================================================
import { MODEL_PRICES, neuronsFor, usdFor } from '../../../apps/worker/src/pricing.ts';

/** Direction of goodness per metric id. Gates and leaderboards read this instead of guessing. */
export const METRIC_DEFS = Object.freeze({
  passRate: { label: 'pass rate', unit: 'fraction', direction: 'higher', family: 'quality' },
  successRate: { label: 'success rate', unit: 'fraction', direction: 'higher', family: 'throughput' },
  firstAttemptSuccess: { label: 'first-attempt success', unit: 'fraction', direction: 'higher', family: 'throughput' },
  completionRate: { label: 'completion rate', unit: 'fraction', direction: 'higher', family: 'throughput' },
  errorRate: { label: 'error rate', unit: 'fraction', direction: 'lower', family: 'throughput' },
  retryRate: { label: 'retry rate', unit: 'fraction', direction: 'lower', family: 'throughput' },
  toolCallAccuracy: { label: 'tool-call accuracy', unit: 'fraction', direction: 'higher', family: 'quality' },
  buildValidity: { label: 'build validity', unit: 'fraction', direction: 'higher', family: 'quality' },
  meanLatencyMs: { label: 'mean latency', unit: 'ms', direction: 'lower', family: 'quality' },
  p95LatencyMs: { label: 'p95 latency', unit: 'ms', direction: 'lower', family: 'quality' },
  meanCostUsd: { label: 'mean cost', unit: 'usd', direction: 'lower', family: 'quality' },
  tokenEfficiency: { label: 'token efficiency', unit: 'score/1k-tok', direction: 'higher', family: 'quality' },
});

export const METRIC_IDS = Object.freeze(Object.keys(METRIC_DEFS));

/** Why a record produced no gradable observation. Closed set: an unlisted reason is a bug. */
export const UNGRADED_REASONS = Object.freeze([
  'transport_error',
  'timeout',
  'no_response',
  'grader_unavailable',
  'invalid_score',
  'not_attempted',
]);

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** An available measurement. Throws rather than publish a NaN/Infinity as if it were a score. */
export function measurement(id, value, { n, ungraded = 0 } = {}) {
  const def = METRIC_DEFS[id];
  if (!def) throw new Error(`unknown metric id: ${id}`);
  if (!isFiniteNum(value)) throw new Error(`metric ${id}: refusing to publish non-finite value ${String(value)}`);
  return { id, label: def.label, unit: def.unit, direction: def.direction, family: def.family, available: true, value, n, ungraded };
}

/** An unavailable measurement: says why, and carries `value: null` so it cannot be summed. */
export function unavailable(id, reason, { n = 0, ungraded = 0 } = {}) {
  const def = METRIC_DEFS[id];
  if (!def) throw new Error(`unknown metric id: ${id}`);
  if (!reason) throw new Error(`metric ${id}: an unavailable measurement must say why`);
  return { id, label: def.label, unit: def.unit, direction: def.direction, family: def.family, available: false, value: null, reason, n, ungraded };
}

/**
 * Decide whether one per-task record carries a gradable observation.
 *
 * Every number here crosses a trust boundary — these records are read back out of a JSON file
 * that may have been written by an older harness, hand-edited, or truncated mid-write. `score`
 * is therefore not merely null-checked: a string, a NaN, an Infinity or a 1.4 are all rejected
 * as `invalid_score` rather than allowed into a mean. `??` would have admitted every one of them.
 */
export function classifyRecord(rec) {
  if (!rec || typeof rec !== 'object') return { graded: false, reason: 'not_attempted' };
  if (rec.ok === false) {
    const err = String(rec.error ?? '');
    if (/timeout|timed out|abort/i.test(err)) return { graded: false, reason: 'timeout' };
    return { graded: false, reason: 'transport_error' };
  }
  if (rec.scored === false || rec.score == null) {
    const declared = rec.ungradedReason;
    if (typeof declared === 'string' && UNGRADED_REASONS.includes(declared)) return { graded: false, reason: declared };
    return { graded: false, reason: 'grader_unavailable' };
  }
  if (!isFiniteNum(rec.score) || rec.score < 0 || rec.score > 1) return { graded: false, reason: 'invalid_score' };
  return { graded: true, reason: null };
}

/** Split records into the gradable ones and an itemised list of the rest. */
export function partition(records) {
  const graded = [];
  const ungraded = [];
  for (const rec of records ?? []) {
    const c = classifyRecord(rec);
    if (c.graded) graded.push(rec);
    else ungraded.push({ taskId: rec?.taskId ?? null, model: rec?.model ?? null, category: rec?.category ?? null, reason: c.reason, error: rec?.error ?? null });
  }
  return { graded, ungraded };
}

/**
 * Linear-interpolated percentile over an unsorted array of finite numbers.
 * Returns null for an empty input — the caller decides what "no data" means, this does not
 * invent a 0 for it.
 */
export function percentile(values, p) {
  const xs = (values ?? []).filter(isFiniteNum).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (!isFiniteNum(p) || p < 0 || p > 1) throw new Error(`percentile: p must be in [0,1], got ${String(p)}`);
  if (xs.length === 1) return xs[0];
  const idx = p * (xs.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
}

/** A record's declared attempt count, defended against a JSON file's idea of a number. */
function attemptsOf(rec) {
  const a = rec?.attempts;
  return Number.isInteger(a) && a >= 1 ? a : 1;
}

/**
 * Per-record USD, or a stated reason there is none.
 *
 * Two sources, in order of authority:
 *   1. `neurons` — what the gateway actually settled against the budget ledger. Ground truth.
 *   2. `usage` tokens + a KNOWN model id, converted through apps/worker/src/pricing.ts.
 *
 * `neuronsFor` deliberately prices an UNKNOWN model at the most expensive rate in the table,
 * because under-reserving is what lets a bill escape. That is the right answer for billing and
 * the wrong answer for measurement: it would hand back a plausible dollar figure for a model
 * whose price nobody knows. So this checks MODEL_PRICES itself and refuses instead.
 */
export function recordCostUsd(rec) {
  if (isFiniteNum(rec?.neurons) && rec.neurons >= 0) return { usd: usdFor(rec.neurons), source: 'neurons' };
  const u = rec?.usage;
  if (!u || !isFiniteNum(u.inputTokens) || !isFiniteNum(u.outputTokens)) return { usd: null, reason: 'no_usage_reported' };
  const id = rec?.modelId;
  if (typeof id !== 'string' || !MODEL_PRICES[id]) return { usd: null, reason: 'unknown_model_price' };
  const cached = isFiniteNum(u.cachedInputTokens) ? u.cachedInputTokens : 0;
  return { usd: usdFor(neuronsFor(id, u.inputTokens, u.outputTokens, cached)), source: 'tokens' };
}

/** Total tokens on a record, or null when the run recorded no usage at all. */
export function recordTokens(rec) {
  const u = rec?.usage;
  if (!u || !isFiniteNum(u.inputTokens) || !isFiniteNum(u.outputTokens)) return null;
  return u.inputTokens + u.outputTokens;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Score one set of per-task records.
 *
 * @param {object[]} records  perTask records
 * @param {{passThreshold?: number}} [opts]
 *   passThreshold — the score at or above which a task counts as passed. Default 1: every check
 *   the task declares has to pass. A lower threshold is a different question, so it is explicit.
 * @returns {{metrics: Record<string, object>, ungraded: object[], gradedCount: number, attempted: number}}
 */
export function scoreRecords(records, opts = {}) {
  const passThreshold = isFiniteNum(opts.passThreshold) ? opts.passThreshold : 1;
  const all = Array.isArray(records) ? records : [];
  const { graded, ungraded } = partition(all);
  const attempted = all.length;
  const nUngraded = ungraded.length;
  const m = {};

  // ---------------------------------------------------------------- quality: denominator = graded
  const passed = graded.filter((r) => r.score >= passThreshold);
  m.passRate = graded.length
    ? measurement('passRate', passed.length / graded.length, { n: graded.length, ungraded: nUngraded })
    : unavailable('passRate', attempted ? 'all_records_ungraded' : 'no_records', { ungraded: nUngraded });

  // ---------------------------------------------------------------- throughput: denominator = attempted
  if (!attempted) {
    m.completionRate = unavailable('completionRate', 'no_records');
    m.errorRate = unavailable('errorRate', 'no_records');
    m.retryRate = unavailable('retryRate', 'no_records');
    m.successRate = unavailable('successRate', 'no_records');
    m.firstAttemptSuccess = unavailable('firstAttemptSuccess', 'no_records');
  } else {
    const errored = ungraded.filter((u) => u.reason === 'transport_error' || u.reason === 'timeout').length;
    const retried = all.filter((r) => attemptsOf(r) > 1).length;
    m.completionRate = measurement('completionRate', graded.length / attempted, { n: attempted, ungraded: nUngraded });
    m.errorRate = measurement('errorRate', errored / attempted, { n: attempted, ungraded: nUngraded });
    m.retryRate = measurement('retryRate', retried / attempted, { n: attempted, ungraded: nUngraded });
    // End to end: a task that never produced a response is not a success. This is the only place
    // an ungraded record legitimately lowers a number, and the number says so in its name.
    m.successRate = measurement('successRate', passed.length / attempted, { n: attempted, ungraded: nUngraded });
    const firstTry = passed.filter((r) => attemptsOf(r) === 1).length;
    m.firstAttemptSuccess = measurement('firstAttemptSuccess', firstTry / attempted, { n: attempted, ungraded: nUngraded });
  }

  // ---------------------------------------------------------------- build validity
  // Fraction of graded answers whose emitted code parsed. Counts only luau_syntax checks that
  // RAN: an absent checker marks them `unavailable`, and a run on a machine without luau-lsp
  // must report "not measured" here rather than "every model emits broken Luau".
  let luauRan = 0;
  let luauPassed = 0;
  let luauUnavailable = 0;
  for (const r of graded) {
    for (const c of r.checks ?? []) {
      if (c.type !== 'luau_syntax') continue;
      if (c.unavailable) luauUnavailable += 1;
      else {
        luauRan += 1;
        if (c.passed) luauPassed += 1;
      }
    }
  }
  m.buildValidity = luauRan
    ? measurement('buildValidity', luauPassed / luauRan, { n: luauRan, ungraded: luauUnavailable })
    : unavailable('buildValidity', luauUnavailable ? 'luau_checker_absent' : 'no_luau_checks', { ungraded: luauUnavailable });

  // ---------------------------------------------------------------- tool-call accuracy
  // `toolGrade: null`/absent means the run never looked at tool calls. `toolGrade.available:false`
  // means it looked and could not judge. Neither is a zero.
  let toolN = 0;
  let toolSum = 0;
  let toolUnavailable = 0;
  for (const r of graded) {
    const tg = r.toolGrade;
    if (tg == null) continue;
    if (tg.available === false || !isFiniteNum(tg.score)) {
      toolUnavailable += 1;
      continue;
    }
    toolN += 1;
    toolSum += tg.score;
  }
  m.toolCallAccuracy = toolN
    ? measurement('toolCallAccuracy', toolSum / toolN, { n: toolN, ungraded: toolUnavailable })
    : unavailable('toolCallAccuracy', toolUnavailable ? 'no_gradable_tool_calls' : 'no_tool_expectations', { ungraded: toolUnavailable });

  // ---------------------------------------------------------------- latency
  const latencies = graded.map((r) => r.ms).filter((v) => isFiniteNum(v) && v >= 0);
  const latencyDropped = graded.length - latencies.length;
  if (latencies.length) {
    m.meanLatencyMs = measurement('meanLatencyMs', latencies.reduce((a, b) => a + b, 0) / latencies.length, { n: latencies.length, ungraded: latencyDropped });
    m.p95LatencyMs = measurement('p95LatencyMs', percentile(latencies, 0.95), { n: latencies.length, ungraded: latencyDropped });
  } else {
    m.meanLatencyMs = unavailable('meanLatencyMs', graded.length ? 'no_valid_latencies' : 'no_graded_records', { ungraded: latencyDropped });
    m.p95LatencyMs = unavailable('p95LatencyMs', graded.length ? 'no_valid_latencies' : 'no_graded_records', { ungraded: latencyDropped });
  }

  // ---------------------------------------------------------------- cost + token efficiency
  const costs = [];
  const costReasons = new Set();
  for (const r of graded) {
    const c = recordCostUsd(r);
    if (c.usd == null) costReasons.add(c.reason);
    else costs.push(c.usd);
  }
  m.meanCostUsd = costs.length
    ? measurement('meanCostUsd', costs.reduce((a, b) => a + b, 0) / costs.length, { n: costs.length, ungraded: graded.length - costs.length })
    : unavailable('meanCostUsd', costReasons.size ? [...costReasons].sort().join('+') : 'no_graded_records', { ungraded: graded.length });

  let tokTotal = 0;
  let tokScore = 0;
  let tokN = 0;
  for (const r of graded) {
    const t = recordTokens(r);
    if (t == null) continue;
    tokN += 1;
    tokTotal += t;
    tokScore += r.score;
  }
  // Score earned per 1,000 tokens spent. A model that scores the same for half the tokens is
  // twice as efficient; a model that spends tokens and scores nothing is 0, which here IS an
  // observation — it answered, it was graded, and it earned no credit.
  m.tokenEfficiency = tokN && tokTotal > 0
    ? measurement('tokenEfficiency', (tokScore / tokTotal) * 1000, { n: tokN, ungraded: graded.length - tokN })
    : unavailable('tokenEfficiency', tokN ? 'zero_tokens_reported' : 'no_usage_reported', { ungraded: graded.length - tokN });

  return { metrics: m, ungraded, gradedCount: graded.length, attempted };
}

/** Accept either a loaded run object or a bare array of records. */
function recordsOf(run) {
  if (Array.isArray(run)) return run;
  if (run && Array.isArray(run.perTask)) return run.perTask;
  return [];
}

/**
 * Score a whole run: overall, and once per model.
 * @returns {{tag, models: string[], overall, byModel: Record<string, object>, ungraded}}
 */
export function scoreRun(run, opts = {}) {
  const records = recordsOf(run);
  const overall = scoreRecords(records, opts);
  const models = [...new Set(records.map((r) => r?.model).filter((m) => typeof m === 'string'))].sort();
  const byModel = {};
  for (const model of models) byModel[model] = scoreRecords(records.filter((r) => r.model === model), opts);
  return {
    tag: Array.isArray(run) ? null : (run?.runMeta?.tag ?? null),
    startedAt: Array.isArray(run) ? null : (run?.runMeta?.startedAt ?? null),
    models,
    overall,
    byModel,
    ungraded: overall.ungraded,
  };
}

/** Render one scored set as aligned text. Unavailable metrics print their reason, never a number. */
export function formatScorecard(scored, { title = 'scorecard' } = {}) {
  const lines = [`${title}  (${scored.gradedCount}/${scored.attempted} graded)`];
  const w = Math.max(...METRIC_IDS.map((id) => METRIC_DEFS[id].label.length)) + 2;
  for (const id of METRIC_IDS) {
    const met = scored.metrics[id];
    if (!met) continue;
    const val = met.available ? formatValue(met) : `— (${met.reason})`;
    lines.push(`  ${met.label.padEnd(w)}${val}`);
  }
  if (scored.ungraded.length) {
    const byReason = {};
    for (const u of scored.ungraded) byReason[u.reason] = (byReason[u.reason] ?? 0) + 1;
    lines.push(`  ungraded: ${Object.entries(byReason).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  }
  return lines.join('\n');
}

export function formatValue(met) {
  if (!met || !met.available) return '—';
  if (met.unit === 'fraction') return `${(met.value * 100).toFixed(1)}%`;
  if (met.unit === 'ms') return `${Math.round(met.value)} ms`;
  if (met.unit === 'usd') return `$${met.value.toFixed(6)}`;
  return met.value.toFixed(3);
}
