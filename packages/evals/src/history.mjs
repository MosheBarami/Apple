// ============================================================================================
// Eval history: every recorded run, in order, with the gaps left in.
//
// Two things this does that the existing report.mjs loader does not, both for the same reason:
//
//   1. A results file that will not parse is REPORTED, not skipped. report.mjs writes a line to
//      stderr and drops it, so a run that failed halfway through serialisation disappears from
//      the history table entirely -- and a missing row reads as "that run was never done",
//      not as "that run's record is broken".
//   2. A run that did not measure a metric contributes a POINT WITH NO VALUE to that metric's
//      series, not a zero and not a missing entry. A zero draws a cliff on a chart; a missing
//      entry draws a straight line across the gap. Both are pictures of data nobody collected.
// ============================================================================================
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRun, METRIC_DEFS } from './metrics.mjs';

export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');

/** Timestamp embedded in a results filename: <tag>-YYYYMMDD-HHMMSS.json */
export function timestampFromFilename(file) {
  const m = /-(\d{8})-(\d{6})\.json$/.exec(file);
  if (!m) return null;
  const [, d, t] = m;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function orderKey(run) {
  const declared = Date.parse(run.startedAt ?? '');
  if (Number.isFinite(declared)) return { ms: declared, source: 'startedAt' };
  const fromName = timestampFromFilename(run.file);
  if (fromName != null) return { ms: fromName, source: 'filename' };
  return { ms: null, source: 'none' };
}

/**
 * Load every results file in a directory, oldest first.
 * @param {{dir?: string, files?: string[]}} [opts]
 * @returns {{runs: object[], errors: Array<{file: string, why: string}>}}
 */
export function loadRunHistory(opts = {}) {
  const dir = opts.dir ?? RESULTS_DIR;
  const errors = [];
  let files = opts.files;
  if (!files) {
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    } catch (e) {
      return { runs: [], errors: [{ file: dir, why: `unreadable results directory: ${e.message}` }] };
    }
  }
  const runs = [];
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      errors.push({ file, why: `invalid JSON: ${e.message}` });
      continue;
    }
    if (!data || typeof data !== 'object' || !data.runMeta || !Array.isArray(data.perTask)) {
      errors.push({ file, why: 'not an eval results file (needs runMeta + perTask)' });
      continue;
    }
    runs.push({
      file,
      tag: data.runMeta.tag ?? file.replace(/\.json$/, ''),
      startedAt: data.runMeta.startedAt ?? null,
      models: data.runMeta.models ?? [...new Set(data.perTask.map((t) => t?.model).filter(Boolean))].sort(),
      luauChecker: data.runMeta.luauChecker ?? null,
      run: data,
    });
  }
  const undated = [];
  for (const r of runs) {
    const k = orderKey(r);
    r.orderMs = k.ms;
    r.orderSource = k.source;
    if (k.ms == null) undated.push(r.file);
  }
  // A run with no usable timestamp keeps its filename position rather than being sorted to the
  // epoch, where it would silently become "the oldest run" and anchor every trend line.
  runs.sort((a, b) => (a.orderMs == null || b.orderMs == null ? 0 : a.orderMs - b.orderMs));
  for (const f of undated) errors.push({ file: f, why: 'no usable timestamp (kept in filename order)' });
  return { runs, errors };
}

/**
 * One metric across the history, as a series of points.
 *
 * Every loaded run contributes exactly one point. A run that could not measure the metric
 * contributes `{available: false, reason}` -- the gap stays a gap.
 *
 * @param {object[]} runs  from loadRunHistory().runs
 * @param {{metric?: string, model?: string|null, passThreshold?: number}} [opts]
 */
export function metricSeries(runs, opts = {}) {
  const metric = opts.metric ?? 'passRate';
  const def = METRIC_DEFS[metric];
  if (!def) throw new Error(`metricSeries: unknown metric "${metric}"`);
  const model = opts.model ?? null;
  const points = (runs ?? []).map((entry) => {
    const scored = scoreRun(entry.run, { passThreshold: opts.passThreshold });
    const set = model ? scored.byModel[model] : scored.overall;
    if (!set) {
      return { file: entry.file, tag: entry.tag, at: entry.startedAt, available: false, value: null, reason: `model "${model}" not in this run`, n: 0 };
    }
    const met = set.metrics[metric];
    return met?.available
      ? { file: entry.file, tag: entry.tag, at: entry.startedAt, available: true, value: met.value, reason: null, n: met.n }
      : { file: entry.file, tag: entry.tag, at: entry.startedAt, available: false, value: null, reason: met?.reason ?? 'metric_not_computed', n: met?.n ?? 0 };
  });
  const measured = points.filter((p) => p.available);
  return {
    metric,
    model,
    direction: def.direction,
    unit: def.unit,
    points,
    measured: measured.length,
    gaps: points.length - measured.length,
    // `latest` and `best` are over MEASURED points only. There is no "best" among runs that
    // measured nothing, and picking one would be picking a number out of the air.
    latest: measured.length ? measured[measured.length - 1] : null,
    best: measured.length
      ? measured.reduce((acc, p) => (def.direction === 'higher' ? (p.value > acc.value ? p : acc) : p.value < acc.value ? p : acc))
      : null,
  };
}

/** Find a run by tag, filename, or the literal "latest". Returns null when absent. */
export function findRun(runs, ref) {
  if (!ref || !Array.isArray(runs) || runs.length === 0) return null;
  if (ref === 'latest') return runs[runs.length - 1];
  const byFile = runs.filter((r) => r.file === ref || r.file === `${ref}.json`);
  if (byFile.length) return byFile[byFile.length - 1];
  const byTag = runs.filter((r) => r.tag === ref);
  return byTag.length ? byTag[byTag.length - 1] : null;
}
