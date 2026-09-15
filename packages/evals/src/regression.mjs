// ============================================================================================
// Regression detection and the two gates that read it.
//
// A gate is a place where a failure to observe gets laundered into a decision, and it happens in
// BOTH directions depending on which way the gate fails:
//
//   promotion gate   must FAIL CLOSED.  "we could not measure pass rate" is not "pass rate is
//                    fine". An unmeasured required metric BLOCKS the promotion and says which.
//   rollback gate    must not fire on nothing, and must not report health either. "we could not
//                    measure it" is not "it did not regress". So an unmeasurable trigger yields
//                    rollback: false, healthy: FALSE, and a named indeterminate -- the operator is
//                    told the gate could not do its job instead of being told everything is well.
//
// The two are deliberately asymmetric. A gate that fails closed in both directions rolls back
// every deploy whenever the harness hiccups; a gate that fails open in both directions is
// decoration. What they share is that neither is ever allowed to print a clean verdict over
// data it did not have.
// ============================================================================================
import { scoreRun, METRIC_DEFS, METRIC_IDS, classifyRecord, formatValue } from './metrics.mjs';

/** Below this, a change in a metric is noise rather than a movement. */
export function noiseFloor(unit) {
  if (unit === 'fraction') return 0.001;
  if (unit === 'ms') return 1;
  if (unit === 'usd') return 1e-9;
  return 1e-6;
}

function statusOf(id, a, b, noise) {
  const def = METRIC_DEFS[id];
  const delta = b - a;
  if (Math.abs(delta) <= noise) return 'unchanged';
  const better = def.direction === 'higher' ? delta > 0 : delta < 0;
  return better ? 'improved' : 'regressed';
}

/**
 * Diff two runs: per metric (overall and per shared model) and per shared task.
 *
 * Only what appears in BOTH runs is diffed. A task that exists in one run alone has no delta --
 * it is reported in `added` / `removed` rather than compared against an implicit zero.
 */
export function diffRuns(runA, runB, opts = {}) {
  const sa = scoreRun(runA, opts);
  const sb = scoreRun(runB, opts);
  const metrics = [];

  const addMetricRows = (model, aScored, bScored) => {
    for (const id of METRIC_IDS) {
      const ma = aScored.metrics[id];
      const mb = bScored.metrics[id];
      if (!ma || !mb) continue;
      if (!ma.available || !mb.available) {
        metrics.push({
          id,
          model,
          label: METRIC_DEFS[id].label,
          unit: METRIC_DEFS[id].unit,
          direction: METRIC_DEFS[id].direction,
          a: ma.available ? ma.value : null,
          b: mb.available ? mb.value : null,
          delta: null,
          status: 'indeterminate',
          reason: !ma.available && !mb.available ? `both:${ma.reason}/${mb.reason}` : !ma.available ? `a:${ma.reason}` : `b:${mb.reason}`,
        });
        continue;
      }
      const noise = noiseFloor(METRIC_DEFS[id].unit);
      metrics.push({
        id,
        model,
        label: METRIC_DEFS[id].label,
        unit: METRIC_DEFS[id].unit,
        direction: METRIC_DEFS[id].direction,
        a: ma.value,
        b: mb.value,
        delta: mb.value - ma.value,
        status: statusOf(id, ma.value, mb.value, noise),
        reason: null,
      });
    }
  };

  addMetricRows(null, sa.overall, sb.overall);
  const sharedModels = sa.models.filter((m) => sb.models.includes(m));
  for (const model of sharedModels) addMetricRows(model, sa.byModel[model], sb.byModel[model]);

  // ------------------------------------------------------------------ per task
  const recA = Array.isArray(runA) ? runA : (runA?.perTask ?? []);
  const recB = Array.isArray(runB) ? runB : (runB?.perTask ?? []);
  const key = (r) => `${r?.model ?? ''} ${r?.taskId ?? ''}`;
  const mapA = new Map(recA.map((r) => [key(r), r]));
  const mapB = new Map(recB.map((r) => [key(r), r]));
  const tasks = [];
  const added = [];
  const removed = [];
  for (const [k, rb] of mapB) {
    const ra = mapA.get(k);
    if (!ra) {
      added.push({ model: rb.model, taskId: rb.taskId });
      continue;
    }
    const ca = classifyRecord(ra);
    const cb = classifyRecord(rb);
    if (!ca.graded || !cb.graded) {
      tasks.push({
        model: rb.model,
        taskId: rb.taskId,
        a: ca.graded ? ra.score : null,
        b: cb.graded ? rb.score : null,
        delta: null,
        status: 'indeterminate',
        reason: !ca.graded && !cb.graded ? `both:${ca.reason}/${cb.reason}` : !ca.graded ? `a:${ca.reason}` : `b:${cb.reason}`,
      });
      continue;
    }
    const delta = rb.score - ra.score;
    tasks.push({
      model: rb.model,
      taskId: rb.taskId,
      a: ra.score,
      b: rb.score,
      delta,
      status: Math.abs(delta) <= 1e-9 ? 'unchanged' : delta > 0 ? 'improved' : 'regressed',
      reason: null,
    });
  }
  for (const [k, ra] of mapA) if (!mapB.has(k)) removed.push({ model: ra.model, taskId: ra.taskId });
  tasks.sort((x, y) => String(x.model).localeCompare(String(y.model)) || String(x.taskId).localeCompare(String(y.taskId)));

  return {
    a: { tag: sa.tag, startedAt: sa.startedAt, models: sa.models },
    b: { tag: sb.tag, startedAt: sb.startedAt, models: sb.models },
    sharedModels,
    metrics,
    tasks,
    added,
    removed,
    scoredA: sa,
    scoredB: sb,
  };
}

/**
 * Regressions in a diff, with per-metric tolerances.
 *
 * `indeterminate` is returned alongside and is NOT empty-equals-healthy: a caller printing
 * "no regressions" while this array has entries is making a claim about metrics that were
 * never measured. `clean` is true only when there are no regressions AND nothing indeterminate.
 *
 * @param {object} diff  from diffRuns
 * @param {{tolerances?: Record<string, number>, defaultTolerance?: number, taskTolerance?: number}} [opts]
 *   tolerance = how far a metric may move the wrong way before it counts as a regression.
 */
export function detectRegressions(diff, opts = {}) {
  const tolerances = opts.tolerances ?? {};
  const regressions = [];
  const indeterminate = [];
  for (const row of diff.metrics) {
    if (row.status === 'indeterminate') {
      indeterminate.push({ id: row.id, model: row.model, reason: row.reason });
      continue;
    }
    if (row.status !== 'regressed') continue;
    const tol = Number.isFinite(tolerances[row.id])
      ? tolerances[row.id]
      : Number.isFinite(opts.defaultTolerance)
        ? opts.defaultTolerance
        : noiseFloor(row.unit);
    const drop = row.direction === 'higher' ? -row.delta : row.delta; // always positive for a regression
    if (drop > tol) regressions.push({ id: row.id, model: row.model, label: row.label, unit: row.unit, a: row.a, b: row.b, delta: row.delta, drop, tolerance: tol });
  }
  const taskTol = Number.isFinite(opts.taskTolerance) ? opts.taskTolerance : 1e-9;
  const taskRegressions = diff.tasks.filter((t) => t.status === 'regressed' && -t.delta > taskTol);
  const taskIndeterminate = diff.tasks.filter((t) => t.status === 'indeterminate');
  return {
    regressions,
    indeterminate,
    taskRegressions,
    taskIndeterminate,
    clean: regressions.length === 0 && indeterminate.length === 0 && taskRegressions.length === 0 && taskIndeterminate.length === 0,
  };
}

function requirementRows(diff, policy) {
  const model = policy.model ?? null;
  return Object.entries(policy.require ?? {}).map(([id, rule]) => {
    const row = diff.metrics.find((r) => r.id === id && r.model === model);
    return { id, rule, row };
  });
}

/**
 * Promotion gate. FAILS CLOSED.
 *
 * @param {object} diff  from diffRuns (B is the candidate)
 * @param {{model?: string|null, require: Record<string, {min?: number, max?: number, maxDrop?: number}>}} policy
 * @returns {{promote: boolean, verdict: 'promote'|'blocked', checked: object[], blocked: object[], indeterminate: object[]}}
 */
export function promotionGate(diff, policy = {}) {
  const rows = requirementRows(diff, policy);
  if (rows.length === 0) {
    // A gate with nothing to check must not wave things through. An empty policy is a
    // misconfiguration, and a misconfigured gate that says "promote" is worse than no gate.
    return {
      promote: false,
      verdict: 'blocked',
      checked: [],
      blocked: [{ id: null, why: 'empty_policy', detail: 'the promotion policy requires no metric, so nothing was verified' }],
      indeterminate: [],
    };
  }
  const checked = [];
  const blocked = [];
  const indeterminate = [];
  for (const { id, rule, row } of rows) {
    if (!row) {
      blocked.push({ id, why: 'metric_absent', detail: `the diff carries no "${id}" row for model ${policy.model ?? '(overall)'}` });
      continue;
    }
    // Keyed on `row.b`, NOT on `row.status`. A row is `indeterminate` whenever EITHER side is
    // unmeasurable, and a `min`/`max` requirement is a statement about the candidate alone --
    // refusing to evaluate it because the BASELINE was unmeasurable throws away a measurement
    // that is sitting right there. `maxDrop` genuinely needs both, and is handled below.
    if (row.b == null) {
      const detail = row.reason ?? 'the candidate run did not measure it';
      indeterminate.push({ id, why: 'unmeasured', detail });
      blocked.push({ id, why: 'unmeasured', detail });
      continue;
    }
    const failures = [];
    if (Number.isFinite(rule.min) && !(row.b >= rule.min)) failures.push(`${formatNum(row.b, row.unit)} < min ${formatNum(rule.min, row.unit)}`);
    if (Number.isFinite(rule.max) && !(row.b <= rule.max)) failures.push(`${formatNum(row.b, row.unit)} > max ${formatNum(rule.max, row.unit)}`);
    if (Number.isFinite(rule.maxDrop)) {
      if (row.delta == null) failures.push('no delta (the baseline did not measure it)');
      else {
        const drop = row.direction === 'higher' ? -row.delta : row.delta;
        if (drop > rule.maxDrop) failures.push(`dropped ${formatNum(drop, row.unit)} > maxDrop ${formatNum(rule.maxDrop, row.unit)}`);
      }
    }
    checked.push({ id, value: row.b, ok: failures.length === 0, failures });
    if (failures.length) blocked.push({ id, why: 'threshold', detail: failures.join('; ') });
  }
  const promote = blocked.length === 0;
  return { promote, verdict: promote ? 'promote' : 'blocked', checked, blocked, indeterminate };
}

/**
 * Rollback gate. Fires only on measured harm; never reports health it did not measure.
 *
 * @param {object} diff from diffRuns (B is what is live)
 * @param {{model?: string|null, triggers: Record<string, {maxDrop?: number, min?: number, max?: number}>}} policy
 * @returns {{rollback: boolean, healthy: boolean, verdict: 'rollback'|'healthy'|'indeterminate',
 *           triggered: object[], indeterminate: object[]}}
 */
export function rollbackGate(diff, policy = {}) {
  const rows = Object.entries(policy.triggers ?? {}).map((entry) => ({
    id: entry[0],
    rule: entry[1],
    row: diff.metrics.find((r) => r.id === entry[0] && r.model === (policy.model ?? null)),
  }));
  if (rows.length === 0) {
    return {
      rollback: false,
      healthy: false,
      verdict: 'indeterminate',
      triggered: [],
      indeterminate: [{ id: null, why: 'empty_policy', detail: 'the rollback policy names no trigger, so nothing was watched' }],
    };
  }
  const triggered = [];
  const indeterminate = [];
  for (const { id, rule, row } of rows) {
    if (!row) {
      indeterminate.push({ id, why: 'metric_absent', detail: `the diff carries no "${id}" row for model ${policy.model ?? '(overall)'}` });
      continue;
    }
    // Same reasoning as the promotion gate: an absolute floor on the live run is checkable even
    // when the baseline is missing, so this keys on `row.b` rather than on the row's status.
    if (row.b == null) {
      indeterminate.push({ id, why: 'unmeasured', detail: row.reason ?? 'not measured in the live run' });
      continue;
    }
    const hits = [];
    if (Number.isFinite(rule.min) && !(row.b >= rule.min)) hits.push(`${formatNum(row.b, row.unit)} < min ${formatNum(rule.min, row.unit)}`);
    if (Number.isFinite(rule.max) && !(row.b <= rule.max)) hits.push(`${formatNum(row.b, row.unit)} > max ${formatNum(rule.max, row.unit)}`);
    if (Number.isFinite(rule.maxDrop)) {
      if (row.delta == null) indeterminate.push({ id, why: 'no_baseline', detail: 'the baseline run did not measure it, so no drop can be computed' });
      else {
        const drop = row.direction === 'higher' ? -row.delta : row.delta;
        if (drop > rule.maxDrop) hits.push(`dropped ${formatNum(drop, row.unit)} > maxDrop ${formatNum(rule.maxDrop, row.unit)}`);
      }
    }
    if (hits.length) triggered.push({ id, detail: hits.join('; '), a: row.a, b: row.b, delta: row.delta });
  }
  const rollback = triggered.length > 0;
  // healthy requires BOTH: nothing fired, and nothing went unmeasured.
  const healthy = !rollback && indeterminate.length === 0;
  return { rollback, healthy, verdict: rollback ? 'rollback' : healthy ? 'healthy' : 'indeterminate', triggered, indeterminate };
}

function formatNum(v, unit) {
  return formatValue({ available: true, value: v, unit });
}

/** Human-readable diff, for the CLI. */
export function formatDiff(diff, { model = null } = {}) {
  const rows = diff.metrics.filter((r) => r.model === model);
  const lines = [`${diff.a.tag ?? 'A'} -> ${diff.b.tag ?? 'B'}${model ? `  [${model}]` : '  [overall]'}`];
  const w = Math.max(...rows.map((r) => r.label.length), 10) + 2;
  for (const r of rows) {
    if (r.status === 'indeterminate') {
      lines.push(`  ${r.label.padEnd(w)}${'-'.padStart(10)}${'-'.padStart(10)}   indeterminate (${r.reason})`);
      continue;
    }
    // The SIGN is the movement and the WORD is the judgement, and they are not the same thing:
    // latency falling by a second is a negative delta and an improvement. Printing "+1009 ms"
    // for it -- one symbol standing for both -- reads as the run having got a second slower.
    const signed = `${r.delta > 0 ? '+' : r.delta < 0 ? '-' : ' '}${formatNum(Math.abs(r.delta), r.unit)}`;
    lines.push(`  ${r.label.padEnd(w)}${formatNum(r.a, r.unit).padStart(10)}${formatNum(r.b, r.unit).padStart(10)}${signed.padStart(12)}   ${r.status}`);
  }
  return lines.join('\n');
}
