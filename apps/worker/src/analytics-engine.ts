// PRODUCT EVENTS IN WORKERS ANALYTICS ENGINE (D-VISION-1).
//
// The event log in analytics.ts keeps the last 30 days in AdminDO, and every rollup over it is
// capped at 5,000 rows — enough to debug last night, not enough to say how many builds, model calls
// and credits a month of real customers used. Analytics Engine is Cloudflare's store for exactly
// that: writes are fire-and-forget from the isolate, retention is three months, and it is read with
// SQL. So every event that already flows through `flushEvents` is ALSO written here, one data point
// each; nothing that reads AdminDO changes.
//
// NO PERSON IN IT. AdminDO carries an actor id under the consent rules in analytics-consent.ts;
// this dataset carries none — no user id, no project id, no message text. It answers "how much",
// not "who", which is what makes it safe to keep for three months without a consent question.
//
// AN UNREADABLE NUMBER IS NOT A ZERO (the rule at the top of analytics.ts). A data point's doubles
// cannot be null, so every measured value travels with a 0/1 "known" double beside it, and the read
// path divides by the count of KNOWN samples, reporting `null` when there were none.
import type { Env } from './env';
import type { GolemEvent } from './analytics';
import { NEURONS_PER_CREDIT } from './pricing';

export const AE_DATASET = 'apple_product_events';

// Column layout. Fixed across every kind so one query can read them all; changing an index here is
// a schema change for three months of stored data, so add at the end, never reorder.
//   blob1 kind · blob2 label (route/feature/scope/action) · blob3 outcome · blob4 provider/method
//   blob5 model/finish reason
//   double1 count · double2 duration ms · double3 duration known · double4 neurons
//   double5 neurons known · double6 input tokens · double7 output tokens · double8 steps
//   double9 ops applied · double10 ops failed · double11 http status (0 = unknown)
function known(v: number | null | undefined): [number, number] {
  return typeof v === 'number' && Number.isFinite(v) ? [v, 1] : [0, 0];
}

const cap = (s: string | null | undefined) => (s ?? '').slice(0, 96);

export function dataPointFor(e: GolemEvent): AnalyticsEngineDataPoint {
  let label = '';
  let outcome = '';
  let via = '';
  let model = '';
  let duration: number | null = null;
  let neurons: number | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let steps: number | null = null;
  let applied: number | null = null;
  let failed: number | null = null;
  let status: number | null = null;
  switch (e.kind) {
    case 'request':
      label = e.route;
      via = e.method;
      status = e.status;
      outcome = e.status === null ? 'unknown' : e.status >= 500 ? '5xx' : e.status >= 400 ? '4xx' : 'ok';
      duration = e.durationMs;
      break;
    case 'model_call':
      label = e.feature;
      outcome = e.outcome;
      via = e.provider;
      model = e.model;
      duration = e.latencyMs;
      neurons = e.neurons;
      tokensIn = e.inputTokens;
      tokensOut = e.outputTokens;
      break;
    case 'build':
      label = 'agent_run';
      outcome = e.outcome;
      model = e.finishReason ?? '';
      duration = e.durationMs;
      neurons = e.neurons;
      steps = e.steps;
      applied = e.opsApplied;
      failed = e.opsFailed;
      break;
    case 'error':
      label = e.scope;
      outcome = e.errorKind;
      via = e.fatal ? 'fatal' : 'handled';
      break;
    case 'audit':
      label = e.action;
      outcome = e.allowed ? 'allowed' : 'refused';
      via = e.actorKind;
      break;
  }
  const [d, dKnown] = known(duration);
  const [n, nKnown] = known(neurons);
  return {
    indexes: [e.kind],
    blobs: [e.kind, cap(label), cap(outcome), cap(via), cap(model)],
    doubles: [1, d, dKnown, n, nKnown, known(tokensIn)[0], known(tokensOut)[0], known(steps)[0], known(applied)[0], known(failed)[0], known(status)[0]],
  };
}

/** Write a batch. Never throws: a metrics write must not take down the thing it measures. */
export function writeProductEvents(env: Pick<Env, 'PRODUCT_EVENTS'>, events: readonly GolemEvent[]): number {
  const ds = env.PRODUCT_EVENTS;
  if (!ds) return 0;
  let written = 0;
  for (const e of events) {
    try {
      ds.writeDataPoint(dataPointFor(e));
      written += 1;
    } catch {
      /* one malformed point must not cost the rest of the batch */
    }
  }
  return written;
}

// ------------------------------------------------------------------------------ the read path

/** The one query the admin reads. `_sample_interval` undoes Analytics Engine's sampling. */
export function productEventsSql(days: number): string {
  const d = Math.max(1, Math.min(90, Math.floor(days)));
  return [
    'SELECT blob1 AS kind, blob2 AS label, blob3 AS outcome,',
    ' SUM(_sample_interval) AS events,',
    ' SUM(_sample_interval * double2) AS duration_ms, SUM(_sample_interval * double3) AS timed,',
    ' SUM(_sample_interval * double4) AS neurons, SUM(_sample_interval * double5) AS priced,',
    ' SUM(_sample_interval * double6) AS input_tokens, SUM(_sample_interval * double7) AS output_tokens,',
    ' SUM(_sample_interval * double9) AS ops_applied, SUM(_sample_interval * double10) AS ops_failed',
    ` FROM ${AE_DATASET}`,
    ` WHERE timestamp > NOW() - INTERVAL '${d}' DAY`,
    ' GROUP BY kind, label, outcome',
    ' ORDER BY events DESC',
    ' LIMIT 500',
  ].join('');
}

export interface ProductEventRow {
  kind: string;
  label: string;
  outcome: string;
  events: number;
  /** mean over the samples that HAD a duration; null when none did */
  avgDurationMs: number | null;
  /** null when no sample carried a readable neuron count — never 0 for "not measured" */
  neurons: number | null;
  credits: number | null;
  inputTokens: number;
  outputTokens: number;
  opsApplied: number;
  opsFailed: number;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function shapeRows(raw: unknown): ProductEventRow[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => {
    const timed = num(r.timed);
    const priced = num(r.priced);
    const neurons = priced > 0 ? num(r.neurons) : null;
    return {
      kind: String(r.kind ?? ''),
      label: String(r.label ?? ''),
      outcome: String(r.outcome ?? ''),
      events: num(r.events),
      avgDurationMs: timed > 0 ? Math.round(num(r.duration_ms) / timed) : null,
      neurons,
      credits: neurons === null ? null : Math.round((neurons / NEURONS_PER_CREDIT) * 10) / 10,
      inputTokens: num(r.input_tokens),
      outputTokens: num(r.output_tokens),
      opsApplied: num(r.ops_applied),
      opsFailed: num(r.ops_failed),
    };
  });
}

export interface KindTotal {
  events: number;
  neurons: number | null;
  credits: number | null;
}

export function totalsByKind(rows: readonly ProductEventRow[]): Record<string, KindTotal> {
  const out: Record<string, KindTotal> = {};
  for (const r of rows) {
    const t = (out[r.kind] ??= { events: 0, neurons: null, credits: null });
    t.events += r.events;
    if (r.neurons !== null) {
      t.neurons = (t.neurons ?? 0) + r.neurons;
      t.credits = Math.round((t.neurons / NEURONS_PER_CREDIT) * 10) / 10;
    }
  }
  return out;
}

export type ProductAnalytics =
  | { configured: false; why: string }
  | { configured: true; ok: false; status: number; error: string }
  | { configured: true; ok: true; days: number; totals: Record<string, KindTotal>; rows: ProductEventRow[] };

/**
 * Read the dataset through the Analytics Engine SQL API. That API is outside the worker, so it
 * needs the account id and an API token with "Account Analytics: Read"; without them the answer is
 * `configured: false` with the reason, never an empty table that looks like a quiet month.
 */
export async function readProductAnalytics(
  env: Pick<Env, 'CF_ACCOUNT_ID' | 'CF_ANALYTICS_TOKEN'>,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductAnalytics> {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) {
    return { configured: false, why: 'CF_ACCOUNT_ID and the CF_ANALYTICS_TOKEN secret (Account Analytics: Read) are needed to read Analytics Engine' };
  }
  const window = Math.max(1, Math.min(90, Math.floor(Number.isFinite(days) ? days : 7)));
  try {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
      body: productEventsSql(window),
    });
    if (!res.ok) return { configured: true, ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
    const rows = shapeRows(await res.json());
    return { configured: true, ok: true, days: window, totals: totalsByKind(rows), rows };
  } catch (e) {
    return { configured: true, ok: false, status: 0, error: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}
