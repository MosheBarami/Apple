// ANALYTICS — the event log and the rollups computed over it.
//
// Before this file the worker could answer exactly two operational questions. `providers/health.ts`
// held a 32-sample in-isolate ring per provider ("is this provider answering right now, from where
// I am standing"), and `BudgetDO.spend` held a day/model/kind neuron table that `/report` summed.
// Everything else an operator might want to know — which routes are failing, what a run cost, how
// long a build took, who touched an admin endpoint, whether anyone came back the next day — was not
// recorded anywhere, so it could not be wrong and it could not be right.
//
// THE RULE THIS MODULE IS BUILT AROUND, and it is the reason it is longer than a counter needs to
// be: AN UNREADABLE METRIC MUST RENDER AS UNKNOWN, NEVER AS ZERO.
//
// The failure it prevents is specific and has already happened twice in this repository. BudgetDO
// settled an unreadable cost as `Math.max(0, Math.ceil(NaN))` — zero — so the provider billed and
// the ledger did not move, and nobody could tell that from a quiet day. `applyMetricRules` skipped
// every rule whose metric was missing, so a panel that ran three checks instead of eighteen
// returned a short defect list indistinguishable from a clean build. Both are the same shape: a
// FAILURE TO OBSERVE rendered as an OBSERVATION. A dashboard is the most dangerous possible place
// for that shape, because its entire job is to be believed at a glance.
//
// So every number this module produces is a `Metric`, which is either known — with a count of the
// samples behind it and whether any sample was unreadable — or explicitly unknown with a reason.
// There is no third state and no default. `sum([]) === 0` is true in arithmetic and false in
// operations: a sum over no samples is not a measurement of zero, it is the absence of one.
//
// Aggregation here is PURE. Every function takes an array of events and returns a value; none of
// them reads a clock, a binding or a global. That is what makes the violating input — the NaN
// latency, the hostile dimension name, the cohort too young to have a day-7 number — something a
// test can hand them directly, rather than something a test has to wait for or provoke.
import { dayKey } from './quota-math';
import { usdFor } from './pricing';
import { redactSecrets } from './redaction.ts';

// ---------------------------------------------------------------------------
// Metric: a number, or an honest absence of one
// ---------------------------------------------------------------------------

/**
 * Why a metric has no value. Each of these is a different sentence on a dashboard and a different
 * next action for whoever reads it, which is why they are not collapsed into one null.
 */
export type UnknownReason =
  /** Nothing was recorded that this metric is computed from. */
  | 'no_samples'
  /** Samples existed and not one of them could be read as a number. */
  | 'no_readable_samples'
  /** A ratio whose denominator is zero — no outcome was classified either way. */
  | 'no_denominator'
  /** The window does not extend far enough past the cohort for this number to exist yet. */
  | 'not_yet_observable';

export type Metric =
  | {
      known: true;
      value: number;
      /** Readable samples behind `value`. */
      samples: number;
      /** Samples that were present and could NOT be read. */
      unreadable: number;
      /** False when `unreadable > 0`: the value is then a floor, not a measurement. */
      complete: boolean;
    }
  | { known: false; value: null; samples: number; unreadable: number; why: UnknownReason };

/**
 * The single constructor. Nothing else in this file builds a Metric literal, because the guard that
 * matters lives here: a value that is not finite is NOT a value, however it arrived.
 *
 * `??` would not do this job and is the reason this is a function rather than a default. `value ??
 * 0` defends undefined and null and admits NaN, Infinity and the string "12" — the three shapes
 * that actually reach a metric, since JSON turns NaN and Infinity into null only on the way OUT and
 * `Number(undefined)` produces NaN on the way in.
 */
export function metric(value: number | null, samples: number, unreadable: number, why: UnknownReason): Metric {
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) {
    return { known: false, value: null, samples, unreadable, why };
  }
  return { known: true, value, samples, unreadable, complete: unreadable === 0 };
}

/** A metric that is unknown for a stated reason, with no value to report. */
export function unknown(why: UnknownReason, samples = 0, unreadable = 0): Metric {
  return { known: false, value: null, samples, unreadable, why };
}

/**
 * Sum of the readable values in a sample column.
 *
 * The three cases are deliberately distinct: no samples at all, samples of which none were readable,
 * and a partial sum. The third is `known` — a floor is more useful than nothing — but carries
 * `complete: false` so a caller can render it as "at least N" rather than "N".
 */
export function sumMetric(values: readonly (number | null)[]): Metric {
  let total = 0;
  let readable = 0;
  let unreadable = 0;
  for (const v of values) {
    if (v === null || typeof v !== 'number' || !Number.isFinite(v)) unreadable += 1;
    else {
      total += v;
      readable += 1;
    }
  }
  if (readable === 0) return unknown(values.length === 0 ? 'no_samples' : 'no_readable_samples', 0, unreadable);
  return metric(total, readable, unreadable, 'no_readable_samples');
}

/** Arithmetic mean of the readable values. Same three cases as `sumMetric`. */
export function meanMetric(values: readonly (number | null)[]): Metric {
  const s = sumMetric(values);
  if (!s.known) return s;
  return metric(s.value / s.samples, s.samples, s.unreadable, 'no_readable_samples');
}

/**
 * The q-quantile of the readable values, by nearest-rank on the sorted sample.
 *
 * Nearest-rank rather than interpolation because these are latencies in whole milliseconds and an
 * interpolated p95 is a number no request ever took.
 */
export function quantileMetric(values: readonly (number | null)[], q: number): Metric {
  const readable: number[] = [];
  let unreadable = 0;
  for (const v of values) {
    if (v === null || typeof v !== 'number' || !Number.isFinite(v)) unreadable += 1;
    else readable.push(v);
  }
  if (readable.length === 0) return unknown(values.length === 0 ? 'no_samples' : 'no_readable_samples', 0, unreadable);
  if (!Number.isFinite(q) || q < 0 || q > 1) return unknown('no_readable_samples', readable.length, unreadable);
  readable.sort((a, b) => a - b);
  const rank = Math.min(readable.length - 1, Math.max(0, Math.ceil(q * readable.length) - 1));
  return metric(readable[rank] ?? null, readable.length, unreadable, 'no_readable_samples');
}

/**
 * A proportion.
 *
 * `part / whole` is the one place a zero is genuinely indistinguishable from an absence — 0/0 is
 * NaN and would render as "0%" through any `?? 0`, which reads as "everything failed" when the
 * truth is "nothing was classified". So a zero denominator is `no_denominator`, always.
 */
export function rateMetric(part: number, whole: number, unreadable = 0): Metric {
  if (!Number.isFinite(part) || !Number.isFinite(whole)) return unknown('no_readable_samples', 0, unreadable);
  if (whole <= 0) return unknown('no_denominator', 0, unreadable);
  return metric(part / whole, whole, unreadable, 'no_denominator');
}

// ---------------------------------------------------------------------------
// readers: the trust boundary for individual fields
// ---------------------------------------------------------------------------

/** A number this module is willing to record, or null because nobody could read it. */
export function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** A non-negative number: counts, durations, token totals. A negative duration is not a duration. */
export function readCount(v: unknown): number | null {
  const n = readNumber(v);
  return n === null || n < 0 ? null : n;
}

/**
 * An epoch-milliseconds timestamp.
 *
 * The range check is not decoration. `Number.isFinite(1e18)` is true and `new Date(1e18)` is an
 * Invalid Date whose `toISOString()` THROWS — so a finite-but-absurd `at` does not produce a wrong
 * day, it takes down whatever computes the day. ECMA-262 puts the limit at ±8.64e15 ms.
 */
export function readTimestamp(v: unknown): number | null {
  const n = readNumber(v);
  if (n === null) return null;
  return Math.abs(n) <= 8.64e15 ? n : null;
}

/** A non-empty string, trimmed and bounded. Anything else is null — never the empty string. */
export function readText(v: unknown, max = 120): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/** A member of an explicit allowlist, or null. Used wherever a union crosses the boundary. */
export function readEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Strip credential-shaped substrings out of a message before it is stored.
 *
 * An error log is the easiest accidental credential store there is: provider SDKs put the request
 * they failed on into the message, and this worker's own errors interpolate ids. The log is
 * admin-only, but "admin-only" is a gate and this is the belt — a leaked log file should not also
 * be a leaked key.
 *
 * The four patterns that used to live here are now the `secret` rules in redaction.ts, beside the
 * ones this list never had: AWS access key ids, GitHub tokens, PEM private-key headers, Google and
 * Slack keys, `Authorization:` headers, and this product's own `gk_live_…` API keys — which an
 * error message about a failed public-API call is the likeliest thing in the worker to contain. One
 * scanner, so a rule added for the egress gate also protects the log and the two cannot drift.
 *
 * `placeholder: 'plain'` keeps the STORED FORMAT unchanged — `[redacted]`, not `[redacted:jwt]`.
 * The log already holds rows in the old shape, and naming the kind would tell a reader of a leaked
 * log which credential was in the message they are holding.
 *
 * Truncation happens AFTER redaction, which is the order that matters: cutting first can leave half
 * a key in the message.
 */
export function redactMessage(v: unknown, max = 240): string {
  return redactSecrets(v, { placeholder: 'plain', max }).text;
}

/**
 * Collapse a request path into a route label a log can group by.
 *
 * Two jobs, and the second is the one that matters. Grouping is obvious: `/api/projects/<uuid>/ws`
 * is one route, not one route per project, and a breakdown keyed on the raw path is a list of
 * customers rather than a list of endpoints. The second job is that the raw path IS the identifier
 * — project ids, image ids, session ids — and a request log keyed on it is a per-tenant activity
 * record sitting in an operational table nobody thought of as holding one.
 *
 * Anything that looks like an id becomes `:id`. Over-collapsing a legitimately static segment costs
 * a row in a table; under-collapsing writes an identifier into a log forever.
 */
function looksLikeId(seg: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;
  if (/^[A-Fa-f0-9]{16,}$/.test(seg)) return true;
  // The catch-all, and the threshold is 40 rather than 24 ON PURPOSE. At 24 it swallowed every
  // UUID (36 characters) before the clause above ever saw one, which made that clause impossible
  // to falsify — break it and nothing turns red, which is the signature of a guard nobody is
  // relying on. Above 36 each clause now covers a shape no other clause reaches.
  return seg.length > 40;
}

export function routeLabel(pathname: unknown): string {
  const raw = readText(pathname, 200);
  if (raw === null) return 'unknown';
  const parts = raw.split('/').map((seg) => (seg && looksLikeId(seg) ? ':id' : seg));
  const label = parts.join('/');
  return label.length > 120 ? label.slice(0, 120) : label;
}

/**
 * The id a path ADDRESSES — `routeLabel`'s twin, pointed the other way.
 *
 * `routeLabel` exists to keep identifiers out of the request log, where a per-path key turns an
 * operational table into a per-tenant activity record nobody meant to keep. This exists because the
 * audit log is the one place the identifier IS the record: "an operator changed a plan" is not an
 * audit entry, "an operator changed THIS PERSON's plan" is. Same id detection, so the two can never
 * disagree about what an id looks like.
 *
 * Null rather than a placeholder when the path addresses nobody. A subject field that always holds
 * something route-shaped reads, at a glance, exactly like one that names an account — and the whole
 * value of this field is that a reader can trust it when it is populated.
 */
export function pathSubject(pathname: unknown): string | null {
  const raw = readText(pathname, 200);
  if (raw === null) return null;
  const ids = raw.split('/').filter((seg) => seg.length > 0 && looksLikeId(seg));
  if (ids.length === 0) return null;
  return readText(ids.join('/'), 120);
}

// ---------------------------------------------------------------------------
// the events
// ---------------------------------------------------------------------------

/**
 * Every kind of event this module records. The array is the RUNTIME allowlist and the type is
 * derived from it, never the other way round.
 *
 * A `Record<EventKind, T>` is a promise the compiler keeps about code it can see. Events arrive
 * here from another isolate over `fetch` with a JSON body, where `kind` is whatever the sender
 * wrote — so the compile-time promise says nothing at all about the value in hand, and the check
 * below is the only thing that does.
 */
export const EVENT_KINDS = ['request', 'model_call', 'error', 'build', 'audit'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
const EVENT_KIND_SET: ReadonlySet<string> = new Set(EVENT_KINDS);
export function isEventKind(v: unknown): v is EventKind {
  return typeof v === 'string' && EVENT_KIND_SET.has(v);
}

/** How a model call or a build ended. `unknown` is a real outcome and is never folded into failure. */
export const OUTCOMES = ['ok', 'failed', 'unknown'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** How a run ended, mirroring SessionDO's own stop reasons. */
export const BUILD_OUTCOMES = ['done', 'failed', 'stopped', 'quota', 'incomplete', 'error', 'unknown'] as const;
export type BuildOutcome = (typeof BUILD_OUTCOMES)[number];

/** Who performed an audited action. */
export const ACTOR_KINDS = ['user', 'admin', 'system', 'anonymous', 'unknown'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface EventBase {
  kind: EventKind;
  /** epoch ms; validated, never defaulted at the boundary */
  at: number;
  /** opaque actor identity (a user id or a hash of one), or null when the actor is unknown */
  actorId: string | null;
  projectId: string | null;
  runId: string | null;
}

/** One HTTP request the worker served. */
export interface RequestEvent extends EventBase {
  kind: 'request';
  route: string;
  method: string;
  status: number | null;
  durationMs: number | null;
}

/** One inference attempt: the model trace. */
export interface ModelCallEvent extends EventBase {
  kind: 'model_call';
  provider: string;
  model: string;
  /** what the call was for — the same `kind` string BudgetDO attributes spend by */
  feature: string;
  outcome: Outcome;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  neurons: number | null;
  errorKind: string | null;
}

/** One failure, wherever it was caught. */
export interface ErrorEvent extends EventBase {
  kind: 'error';
  scope: string;
  errorKind: string;
  message: string;
  fatal: boolean;
}

/** One agent run against a user's place. */
export interface BuildEvent extends EventBase {
  kind: 'build';
  outcome: BuildOutcome;
  steps: number | null;
  opsApplied: number | null;
  opsFailed: number | null;
  durationMs: number | null;
  neurons: number | null;
}

/** One privileged or security-relevant action, allowed or refused. */
export interface AuditEvent extends EventBase {
  kind: 'audit';
  action: string;
  actorKind: ActorKind;
  subject: string | null;
  allowed: boolean;
}

export type GolemEvent = RequestEvent | ModelCallEvent | ErrorEvent | BuildEvent | AuditEvent;

/** Why an event was refused at the boundary. Counted, never silently dropped. */
export type RejectReason =
  | 'not_an_object'
  | 'unknown_kind'
  | 'unreadable_timestamp'
  | 'missing_required_field';

export type Normalized = { ok: true; event: GolemEvent } | { ok: false; reason: RejectReason };

/**
 * The trust boundary. Everything that becomes an event goes through here, whether it came from a
 * call site in this isolate or over the wire from a Durable Object.
 *
 * `at` is STRICT: present-but-unreadable is a rejection, not a re-stamp. The distinction is the
 * point. A missing `at` means the caller never claimed to know when this happened (`recordEvent`
 * stamps it). A present one that cannot be read means somebody COMPUTED a timestamp and got a
 * number that is not a time — and quietly replacing it with `Date.now()` would file an event from
 * last week under today, which is the analytics version of settling an unreadable cost as zero.
 * Note that `JSON.stringify(NaN)` is `null`, so a NaN timestamp arrives here as null: present.
 */
export function normalizeEvent(raw: unknown): Normalized {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not_an_object' };
  const o = raw as Record<string, unknown>;

  const kind = o['kind'];
  if (!isEventKind(kind)) return { ok: false, reason: 'unknown_kind' };

  const at = readTimestamp(o['at']);
  if (at === null) return { ok: false, reason: 'unreadable_timestamp' };

  const base: EventBase = {
    kind,
    at,
    actorId: readText(o['actorId'], 64),
    projectId: readText(o['projectId'], 64),
    runId: readText(o['runId'], 64),
  };

  switch (kind) {
    case 'request': {
      const route = readText(o['route'], 120);
      if (route === null) return { ok: false, reason: 'missing_required_field' };
      return {
        ok: true,
        event: {
          ...base,
          kind: 'request',
          route,
          method: readText(o['method'], 10)?.toUpperCase() ?? 'UNKNOWN',
          status: readCount(o['status']),
          durationMs: readCount(o['durationMs']),
        },
      };
    }
    case 'model_call': {
      const model = readText(o['model'], 120);
      if (model === null) return { ok: false, reason: 'missing_required_field' };
      return {
        ok: true,
        event: {
          ...base,
          kind: 'model_call',
          provider: readText(o['provider'], 40) ?? 'unknown',
          model,
          feature: readText(o['feature'], 60) ?? 'unknown',
          // An outcome nobody stated is `unknown`. It is NOT a failure and it is NOT a success:
          // folding it either way invents the very number the success rate exists to report.
          outcome: readEnum(o['outcome'], OUTCOMES) ?? 'unknown',
          latencyMs: readCount(o['latencyMs']),
          inputTokens: readCount(o['inputTokens']),
          outputTokens: readCount(o['outputTokens']),
          cachedInputTokens: readCount(o['cachedInputTokens']),
          neurons: readCount(o['neurons']),
          errorKind: readText(o['errorKind'], 40),
        },
      };
    }
    case 'error': {
      const scope = readText(o['scope'], 60);
      if (scope === null) return { ok: false, reason: 'missing_required_field' };
      return {
        ok: true,
        event: {
          ...base,
          kind: 'error',
          scope,
          errorKind: readText(o['errorKind'], 40) ?? 'unknown',
          message: redactMessage(o['message']),
          fatal: o['fatal'] === true,
        },
      };
    }
    case 'build': {
      return {
        ok: true,
        event: {
          ...base,
          kind: 'build',
          outcome: readEnum(o['outcome'], BUILD_OUTCOMES) ?? 'unknown',
          steps: readCount(o['steps']),
          opsApplied: readCount(o['opsApplied']),
          opsFailed: readCount(o['opsFailed']),
          durationMs: readCount(o['durationMs']),
          neurons: readCount(o['neurons']),
        },
      };
    }
    case 'audit': {
      const action = readText(o['action'], 60);
      if (action === null) return { ok: false, reason: 'missing_required_field' };
      return {
        ok: true,
        event: {
          ...base,
          kind: 'audit',
          action,
          actorKind: readEnum(o['actorKind'], ACTOR_KINDS) ?? 'unknown',
          subject: readText(o['subject'], 120),
          // `allowed` defaults to FALSE on an unreadable value, unlike every other field, because
          // this one is a security record: an action nobody can confirm was permitted must not be
          // filed as permitted.
          allowed: o['allowed'] === true,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// the in-isolate log
// ---------------------------------------------------------------------------

/**
 * Events retained per isolate between flushes. Small on purpose, for the same reason
 * `HEALTH_RING_SIZE` is: this lives in the isolate's memory and an isolate that has not served a
 * request has nothing to say. Durability is the sink's job (AdminDO), not this buffer's.
 */
export const EVENT_RING_SIZE = 256;

export interface LogStats {
  /** accepted since the isolate started */
  recorded: number;
  /** accepted, then pushed out of the ring before anyone drained it — the window is INCOMPLETE */
  dropped: number;
  /** refused at the boundary, by reason */
  rejected: Record<RejectReason, number>;
}

let ring: GolemEvent[] = [];
let stats: LogStats = { recorded: 0, dropped: 0, rejected: emptyRejects() };

function emptyRejects(): Record<RejectReason, number> {
  return { not_an_object: 0, unknown_kind: 0, unreadable_timestamp: 0, missing_required_field: 0 };
}

/**
 * Record one event.
 *
 * `at` is stamped only when the caller did not supply the field at all. See `normalizeEvent` for
 * why a present-but-unreadable timestamp is a rejection instead.
 */
export function recordEvent(input: unknown, now = Date.now()): Normalized {
  // `'at' in input` THROWS on a primitive, and this function is called from a `finally` block on
  // every request. A logger that can throw takes down the thing it was supposed to observe, so the
  // shape check happens before the convenience does; anything that is not an object falls straight
  // through to `normalizeEvent` and is rejected there as `not_an_object`.
  const isObject = !!input && typeof input === 'object' && !Array.isArray(input);
  const withAt = isObject && !('at' in (input as object)) ? { ...(input as object), at: now } : input;
  const res = normalizeEvent(withAt);
  if (!res.ok) {
    stats.rejected[res.reason] += 1;
    return res;
  }
  ring.push(res.event);
  stats.recorded += 1;
  while (ring.length > EVENT_RING_SIZE) {
    ring.shift();
    stats.dropped += 1;
  }
  return res;
}

/** Everything currently buffered, without clearing it. */
export function readEvents(): GolemEvent[] {
  return [...ring];
}

/** Take the buffer for shipping to the durable sink, leaving it empty. */
export function drainEvents(): GolemEvent[] {
  const out = ring;
  ring = [];
  return out;
}

export function pendingEventCount(): number {
  return ring.length;
}

export function logStats(): LogStats {
  return { recorded: stats.recorded, dropped: stats.dropped, rejected: { ...stats.rejected } };
}

/** Test seam, and the reset a fresh isolate would give you anyway. */
export function resetEventLog(): void {
  ring = [];
  stats = { recorded: 0, dropped: 0, rejected: emptyRejects() };
}

// ---------------------------------------------------------------------------
// aggregation — pure functions of an event array, and nothing else
// ---------------------------------------------------------------------------

/**
 * What the numbers below were computed over.
 *
 * `complete` is the flag that keeps a rollup honest about its own inputs. Events are dropped when
 * the ring overflows and again when the durable sink hits its row cap, and a cost total computed
 * over a truncated window is a FLOOR wearing the costume of a total. The caller that knows it
 * truncated says so here; everything downstream can then refuse to call the number final.
 */
export interface EventWindow {
  events: number;
  fromMs: number | null;
  toMs: number | null;
  complete: boolean;
}

export function eventWindow(events: readonly GolemEvent[], opts: { truncated?: boolean } = {}): EventWindow {
  let from: number | null = null;
  let to: number | null = null;
  for (const e of events) {
    if (from === null || e.at < from) from = e.at;
    if (to === null || e.at > to) to = e.at;
  }
  return { events: events.length, fromMs: from, toMs: to, complete: opts.truncated !== true };
}

const isModelCall = (e: GolemEvent): e is ModelCallEvent => e.kind === 'model_call';
const isRequest = (e: GolemEvent): e is RequestEvent => e.kind === 'request';
const isError = (e: GolemEvent): e is ErrorEvent => e.kind === 'error';
const isBuild = (e: GolemEvent): e is BuildEvent => e.kind === 'build';
const isAudit = (e: GolemEvent): e is AuditEvent => e.kind === 'audit';

/** Convert a neuron metric to dollars WITHOUT inventing a number when there is none. */
export function usdMetric(neurons: Metric): Metric {
  if (!neurons.known) return neurons;
  return metric(usdFor(neurons.value), neurons.samples, neurons.unreadable, 'no_readable_samples');
}

/** The label a feature-usage row and a funnel step are matched on. One definition, two consumers. */
export function featureLabel(e: GolemEvent): string {
  switch (e.kind) {
    case 'model_call':
      return e.feature;
    case 'request':
      return e.route;
    case 'build':
      return `build:${e.outcome}`;
    case 'audit':
      return `audit:${e.action}`;
    case 'error':
      return `error:${e.scope}`;
  }
}

export interface CostBucket {
  key: string;
  calls: number;
  neurons: Metric;
  usd: Metric;
}

export interface CostRollup {
  calls: number;
  neurons: Metric;
  usd: Metric;
  byDay: CostBucket[];
  byModel: CostBucket[];
  byProvider: CostBucket[];
  byFeature: CostBucket[];
}

function costBuckets(calls: readonly ModelCallEvent[], key: (c: ModelCallEvent) => string): CostBucket[] {
  const groups = new Map<string, (number | null)[]>();
  for (const c of calls) {
    const k = key(c);
    const arr = groups.get(k) ?? [];
    arr.push(c.neurons);
    groups.set(k, arr);
  }
  return [...groups.entries()]
    .map(([k, values]) => {
      const neurons = sumMetric(values);
      return { key: k, calls: values.length, neurons, usd: usdMetric(neurons) };
    })
    .sort((a, b) => (b.neurons.value ?? -1) - (a.neurons.value ?? -1) || a.key.localeCompare(b.key));
}

/**
 * Cost analytics.
 *
 * Every total here can come back unknown, and the case that makes that mandatory is real: BudgetDO
 * settles an unreadable cost by charging the per-request ceiling and REPORTING that it estimated.
 * A call whose neuron figure never resolved contributes `null`, so the day's total says "at least
 * N over 12 calls, 1 unreadable" instead of quietly under-counting by one call's spend.
 */
export function costRollup(events: readonly GolemEvent[]): CostRollup {
  const calls = events.filter(isModelCall);
  const neurons = sumMetric(calls.map((c) => c.neurons));
  return {
    calls: calls.length,
    neurons,
    usd: usdMetric(neurons),
    byDay: costBuckets(calls, (c) => dayKey(c.at)),
    byModel: costBuckets(calls, (c) => c.model),
    byProvider: costBuckets(calls, (c) => c.provider),
    byFeature: costBuckets(calls, (c) => c.feature),
  };
}

export interface LatencySummary {
  samples: number;
  unreadable: number;
  p50: Metric;
  p95: Metric;
  max: Metric;
  mean: Metric;
}

function latencySummary(values: readonly (number | null)[]): LatencySummary {
  let unreadable = 0;
  let readable = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) unreadable += 1;
    else readable += 1;
  }
  return {
    samples: readable,
    unreadable,
    p50: quantileMetric(values, 0.5),
    p95: quantileMetric(values, 0.95),
    max: quantileMetric(values, 1),
    mean: meanMetric(values),
  };
}

export interface LatencyRollup {
  model: LatencySummary;
  request: LatencySummary;
  build: LatencySummary;
}

/** Latency analytics, kept in three separate columns because they measure three different things. */
export function latencyRollup(events: readonly GolemEvent[]): LatencyRollup {
  return {
    model: latencySummary(events.filter(isModelCall).map((c) => c.latencyMs)),
    request: latencySummary(events.filter(isRequest).map((r) => r.durationMs)),
    build: latencySummary(events.filter(isBuild).map((b) => b.durationMs)),
  };
}

export interface TokenRollup {
  calls: number;
  input: Metric;
  output: Metric;
  cachedInput: Metric;
  total: Metric;
  perCall: Metric;
  /** share of input tokens served from the prefix cache — the number prefix affinity exists to move */
  cacheHitRate: Metric;
}

/**
 * Token analytics.
 *
 * `total` is computed PER CALL and only when both halves of that call are readable, rather than as
 * `sum(input) + sum(output)`. Summing the columns independently would silently add a call's input
 * to a total whose output was missing, producing a number that is neither the truth nor a floor of
 * it — and it would report `complete` while doing so.
 */
export function tokenRollup(events: readonly GolemEvent[]): TokenRollup {
  const calls = events.filter(isModelCall);
  const input = sumMetric(calls.map((c) => c.inputTokens));
  const output = sumMetric(calls.map((c) => c.outputTokens));
  const cachedInput = sumMetric(calls.map((c) => c.cachedInputTokens));
  const total = sumMetric(
    calls.map((c) => (c.inputTokens === null || c.outputTokens === null ? null : c.inputTokens + c.outputTokens)),
  );
  const perCall = total.known && calls.length > 0 ? metric(total.value / total.samples, total.samples, total.unreadable, 'no_samples') : unknown(total.known ? 'no_samples' : total.why, 0, total.unreadable);
  const cacheHitRate =
    input.known && cachedInput.known
      ? rateMetric(cachedInput.value, input.value, input.unreadable + cachedInput.unreadable)
      : unknown('no_readable_samples', 0, input.unreadable + cachedInput.unreadable);
  return { calls: calls.length, input, output, cachedInput, total, perCall, cacheHitRate };
}

export interface SuccessRollup {
  total: number;
  ok: number;
  failed: number;
  unclassified: number;
  rate: Metric;
}

function successOf(outcomes: readonly string[]): SuccessRollup {
  let ok = 0;
  let failed = 0;
  let unclassified = 0;
  for (const o of outcomes) {
    if (o === 'ok' || o === 'done') ok += 1;
    else if (o === 'failed' || o === 'error') failed += 1;
    else unclassified += 1;
  }
  return { total: outcomes.length, ok, failed, unclassified, rate: rateMetric(ok, ok + failed, unclassified) };
}

export interface SuccessAnalytics {
  modelCalls: SuccessRollup;
  builds: SuccessRollup;
  requests: SuccessRollup;
}

/**
 * Success analytics.
 *
 * The denominator EXCLUDES unclassified outcomes rather than counting them as failures. A run that
 * ended `stopped` or `quota` is not a defect — the user stopped it, or they ran out — and a run
 * whose outcome never arrived is not evidence of anything. Both are reported as `unclassified` so
 * the rate cannot be read as covering more than it does, and a window with nothing but unclassified
 * outcomes yields no rate at all rather than 0%.
 */
export function successRollup(events: readonly GolemEvent[]): SuccessAnalytics {
  return {
    modelCalls: successOf(events.filter(isModelCall).map((c) => c.outcome)),
    builds: successOf(events.filter(isBuild).map((b) => b.outcome)),
    requests: successOf(
      events
        .filter(isRequest)
        .map((r) => (r.status === null ? 'unknown' : r.status >= 200 && r.status < 400 ? 'ok' : 'failed')),
    ),
  };
}

export interface ErrorBucket {
  key: string;
  count: number;
  fatal: number;
  share: Metric;
}

export interface ErrorBreakdown {
  total: number;
  byKind: ErrorBucket[];
  byScope: ErrorBucket[];
}

function errorBuckets(rows: readonly { key: string; fatal: boolean }[], total: number): ErrorBucket[] {
  const groups = new Map<string, { count: number; fatal: number }>();
  for (const r of rows) {
    const g = groups.get(r.key) ?? { count: 0, fatal: 0 };
    g.count += 1;
    if (r.fatal) g.fatal += 1;
    groups.set(r.key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, count: g.count, fatal: g.fatal, share: rateMetric(g.count, total) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Error breakdown, over BOTH explicit error events and failed model calls.
 *
 * A failed inference is an error whether or not anyone remembered to log a second event for it, and
 * a breakdown that counted only the explicit ones would under-report exactly the failures the
 * gateway handles quietly. A failure with no error kind lands in an `unknown` bucket; it is never
 * dropped, because a failure nobody classified is the one worth looking at.
 */
export function errorBreakdown(events: readonly GolemEvent[]): ErrorBreakdown {
  const rows: { kind: string; scope: string; fatal: boolean }[] = [];
  for (const e of events) {
    if (isError(e)) rows.push({ kind: e.errorKind, scope: e.scope, fatal: e.fatal });
    else if (isModelCall(e) && e.outcome === 'failed') {
      rows.push({ kind: e.errorKind ?? 'unknown', scope: `model:${e.provider}`, fatal: false });
    }
  }
  return {
    total: rows.length,
    byKind: errorBuckets(rows.map((r) => ({ key: r.kind, fatal: r.fatal })), rows.length),
    byScope: errorBuckets(rows.map((r) => ({ key: r.scope, fatal: r.fatal })), rows.length),
  };
}

/** Dimensions a model-call breakdown may be grouped by. The RUNTIME allowlist. */
export const BREAKDOWN_DIMENSIONS = ['provider', 'model', 'feature', 'projectId', 'actorId'] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export interface BreakdownRow {
  key: string;
  calls: number;
  success: Metric;
  latencyP50: Metric;
  neurons: Metric;
  usd: Metric;
  tokens: Metric;
}

export type BreakdownResult =
  | { known: true; dimension: BreakdownDimension; rows: BreakdownRow[]; unattributed: number }
  | { known: false; why: 'unknown_dimension'; allowed: readonly string[] };

/**
 * Group model calls by one dimension.
 *
 * The dimension arrives from a query string, so it is checked against `BREAKDOWN_DIMENSIONS` at
 * RUNTIME. `Record<BreakdownDimension, T>` would have compiled happily and then indexed with
 * whatever the caller sent — returning `undefined` for `?by=__proto__` and an empty table for
 * `?by=nonsense`, which renders as "no traffic" rather than "you asked for a column that does not
 * exist". An empty table is the shape of a working system with nothing happening, so that mistake
 * is invisible exactly when it matters.
 *
 * Calls whose dimension value is null (an unowned project, an anonymous actor) are counted as
 * `unattributed` rather than bucketed under a plausible-looking "unknown" key, because a key that
 * looks like a tenant will be read as one.
 */
export function breakdownBy(events: readonly GolemEvent[], dimension: string): BreakdownResult {
  const dim = readEnum(dimension, BREAKDOWN_DIMENSIONS);
  if (dim === null) return { known: false, why: 'unknown_dimension', allowed: BREAKDOWN_DIMENSIONS };

  const groups = new Map<string, ModelCallEvent[]>();
  let unattributed = 0;
  for (const c of events.filter(isModelCall)) {
    const key = dim === 'provider' ? c.provider : dim === 'model' ? c.model : dim === 'feature' ? c.feature : dim === 'projectId' ? c.projectId : c.actorId;
    if (key === null) {
      unattributed += 1;
      continue;
    }
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const rows = [...groups.entries()]
    .map(([key, calls]): BreakdownRow => {
      const neurons = sumMetric(calls.map((c) => c.neurons));
      return {
        key,
        calls: calls.length,
        success: successOf(calls.map((c) => c.outcome)).rate,
        latencyP50: quantileMetric(calls.map((c) => c.latencyMs), 0.5),
        neurons,
        usd: usdMetric(neurons),
        tokens: sumMetric(
          calls.map((c) => (c.inputTokens === null || c.outputTokens === null ? null : c.inputTokens + c.outputTokens)),
        ),
      };
    })
    .sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));

  return { known: true, dimension: dim, rows, unattributed };
}

/** Provider breakdown — which provider served the traffic, and how well. */
export function providerBreakdown(events: readonly GolemEvent[]): BreakdownResult {
  return breakdownBy(events, 'provider');
}

/** Model breakdown — the same columns, grouped by model id. */
export function modelBreakdown(events: readonly GolemEvent[]): BreakdownResult {
  return breakdownBy(events, 'model');
}

export interface FeatureRow {
  feature: string;
  events: number;
  /** distinct attributable actors; unknown when the feature was used but nobody could be attributed */
  actors: Metric;
  lastAt: number;
}

export interface FeatureUsage {
  rows: FeatureRow[];
  unattributedEvents: number;
}

/**
 * Feature usage.
 *
 * `actors` is a Metric and not a count because zero distinct actors is never the right answer for a
 * feature with events against it: it means the events carried no identity, which is a gap in the
 * instrumentation and not a fact about usage. Reporting `0 users` for a feature somebody just used
 * is the observation-failure shape again.
 */
export function featureUsage(events: readonly GolemEvent[]): FeatureUsage {
  const groups = new Map<string, { events: number; actors: Set<string>; anonymous: number; lastAt: number }>();
  let unattributedEvents = 0;
  for (const e of events) {
    const label = featureLabel(e);
    const g = groups.get(label) ?? { events: 0, actors: new Set<string>(), anonymous: 0, lastAt: e.at };
    g.events += 1;
    if (e.actorId === null) {
      g.anonymous += 1;
      unattributedEvents += 1;
    } else g.actors.add(e.actorId);
    if (e.at > g.lastAt) g.lastAt = e.at;
    groups.set(label, g);
  }
  const rows = [...groups.entries()]
    .map(([feature, g]): FeatureRow => ({
      feature,
      events: g.events,
      actors: g.actors.size > 0 ? metric(g.actors.size, g.actors.size, g.anonymous, 'no_samples') : unknown('no_readable_samples', 0, g.anonymous),
      lastAt: g.lastAt,
    }))
    .sort((a, b) => b.events - a.events || a.feature.localeCompare(b.feature));
  return { rows, unattributedEvents };
}

const DAY_MS = 86_400_000;

export interface RetentionCell {
  dayOffset: number;
  /** null whenever `rate` is unknown — there is no count to report either */
  retained: number | null;
  rate: Metric;
}

export interface RetentionCohort {
  day: string;
  actors: number;
  cells: RetentionCell[];
}

export interface RetentionRollup {
  cohorts: RetentionCohort[];
  horizonDays: number;
  /** the instant retention was measured as of, or null when the caller's clock was unreadable */
  asOf: number | null;
  unattributedEvents: number;
}

/**
 * Retention analytics: of the actors first seen on day D, how many came back on day D+k.
 *
 * THE GUARD THIS EXISTS FOR. A cohort that started yesterday has no day-7 retention. Not 0% — the
 * number does not exist yet, and the seventh day has not happened. Every retention table that
 * computes `retained / cohort` over a fixed grid produces a wall of zeros in its bottom-right
 * triangle, and every such table is read as a collapse in retention rather than as the calendar.
 * Cells past what the window can observe come back `not_yet_observable`, with no count.
 *
 * An unreadable `now` makes EVERY cell unobservable rather than making them all zero, for the same
 * reason: without a clock there is nothing to compare a cohort's age against.
 */
export function retentionRollup(events: readonly GolemEvent[], opts: { now: number; horizonDays?: number }): RetentionRollup {
  const horizonDays = Math.max(1, Math.min(90, Math.floor(readCount(opts.horizonDays) ?? 7)));
  const asOf = readTimestamp(opts.now);
  const nowIdx = asOf === null ? null : Math.floor(asOf / DAY_MS);

  const byActor = new Map<string, Set<number>>();
  let unattributedEvents = 0;
  for (const e of events) {
    if (e.actorId === null) {
      unattributedEvents += 1;
      continue;
    }
    const days = byActor.get(e.actorId) ?? new Set<number>();
    days.add(Math.floor(e.at / DAY_MS));
    byActor.set(e.actorId, days);
  }

  const cohorts = new Map<number, string[]>();
  for (const [actor, days] of byActor) {
    const first = Math.min(...days);
    const list = cohorts.get(first) ?? [];
    list.push(actor);
    cohorts.set(first, list);
  }

  const out: RetentionCohort[] = [...cohorts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayIdx, actors]) => {
      const cells: RetentionCell[] = [];
      for (let k = 1; k <= horizonDays; k++) {
        if (nowIdx === null || dayIdx + k > nowIdx) {
          cells.push({ dayOffset: k, retained: null, rate: unknown('not_yet_observable', actors.length) });
          continue;
        }
        const retained = actors.filter((a) => byActor.get(a)?.has(dayIdx + k) === true).length;
        cells.push({ dayOffset: k, retained, rate: rateMetric(retained, actors.length) });
      }
      return { day: dayKey(dayIdx * DAY_MS), actors: actors.length, cells };
    });

  return { cohorts: out, horizonDays, asOf, unattributedEvents };
}

export interface FunnelStep {
  step: string;
  actors: number;
  fromPrevious: Metric;
  fromStart: Metric;
}

export type FunnelResult =
  | { known: true; steps: FunnelStep[]; actorsStarted: number; unattributedEvents: number }
  | { known: false; why: 'no_steps' | 'no_attributable_actors'; unattributedEvents: number };

/**
 * Funnel analytics: how many actors reached each step, having reached every step before it.
 *
 * ORDER IS ENFORCED BY TIME, not by presence. An actor who opened the editor after they published
 * did not go through that funnel, and counting them as though they had is how a funnel reports a
 * conversion rate higher than the product achieved.
 *
 * A funnel over events that carry no actor is not a funnel of zero conversions — it is not a funnel
 * at all, and it says so, because 0% conversion and "nobody is identified in this data" send an
 * operator to two completely different places.
 */
export function funnelRollup(events: readonly GolemEvent[], steps: readonly string[]): FunnelResult {
  const wanted = steps.map((s) => readText(s, 120)).filter((s): s is string => s !== null);
  let unattributedEvents = 0;
  for (const e of events) if (e.actorId === null) unattributedEvents += 1;
  if (wanted.length === 0) return { known: false, why: 'no_steps', unattributedEvents };

  // actor -> step label -> earliest time
  const firstAt = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (e.actorId === null) continue;
    const label = featureLabel(e);
    if (!wanted.includes(label)) continue;
    const perActor = firstAt.get(e.actorId) ?? new Map<string, number>();
    const prev = perActor.get(label);
    if (prev === undefined || e.at < prev) perActor.set(label, e.at);
    firstAt.set(e.actorId, perActor);
  }
  if (firstAt.size === 0) return { known: false, why: 'no_attributable_actors', unattributedEvents };

  const reached: number[] = [];
  for (let i = 0; i < wanted.length; i++) {
    let n = 0;
    for (const perActor of firstAt.values()) {
      let last = -Infinity;
      let through = true;
      for (let j = 0; j <= i; j++) {
        const t = perActor.get(wanted[j]!);
        if (t === undefined || t < last) {
          through = false;
          break;
        }
        last = t;
      }
      if (through) n += 1;
    }
    reached.push(n);
  }

  const started = reached[0] ?? 0;
  const out: FunnelStep[] = wanted.map((step, i) => {
    const here = reached[i] ?? 0;
    const prev = i === 0 ? started : (reached[i - 1] ?? 0);
    return {
      step,
      actors: here,
      fromPrevious: i === 0 ? rateMetric(here, started) : rateMetric(here, prev),
      fromStart: rateMetric(here, started),
    };
  });
  return { known: true, steps: out, actorsStarted: started, unattributedEvents };
}

/**
 * Whether a page of stored events is missing any of the window it was asked for.
 *
 * Extracted from AdminDO so the violating input can come from a test instead of from a Durable
 * Object that has to be filled up first. Two independent ways to lose events, and a rollup that
 * knows about only one of them is a rollup that will confidently report a floor as a total:
 *
 *   1. THE PAGE CUT IT. More rows match than were returned.
 *   2. THE START WAS EVICTED. Rows have been pruned at some point, and the oldest row that
 *      survives is NEWER than the start of the asked-for window — so the beginning of that window
 *      is gone, and the flat stretch before the oldest row is absence of DATA, not absence of
 *      traffic. The `evicted > 0` term is what separates that from a table that is simply young.
 *
 * Unreadable inputs answer TRUE. "I cannot tell whether this window is complete" and "this window
 * is complete" are the two answers that must never be collapsed, and only one of them is safe.
 */
export function windowTruncated(i: {
  available: unknown;
  returned: unknown;
  evictedAllTime: unknown;
  oldestAt: unknown;
  sinceMs: unknown;
}): boolean {
  const available = readCount(i.available);
  const returned = readCount(i.returned);
  if (available === null || returned === null) return true;
  if (available > returned) return true;
  const evicted = readCount(i.evictedAllTime) ?? 0;
  if (evicted <= 0) return false;
  const oldest = readTimestamp(i.oldestAt);
  const since = readTimestamp(i.sinceMs);
  if (since === null) return true;
  // No rows at all in a table that HAS evicted: nothing survives to say the window was covered.
  if (oldest === null) return true;
  return oldest > since;
}

export interface AnalyticsSummary {
  window: EventWindow;
  counts: Record<EventKind, number>;
  cost: CostRollup;
  latency: LatencyRollup;
  tokens: TokenRollup;
  success: SuccessAnalytics;
  errors: ErrorBreakdown;
  providers: BreakdownResult;
  models: BreakdownResult;
  features: FeatureUsage;
  retention: RetentionRollup;
  audit: { total: number; refused: number; byAction: ErrorBucket[] };
}

/** Everything at once, for the admin surface. Still pure: `now` is an argument. */
export function summarize(
  events: readonly GolemEvent[],
  opts: { now: number; truncated?: boolean; retentionDays?: number },
): AnalyticsSummary {
  const counts: Record<EventKind, number> = { request: 0, model_call: 0, error: 0, build: 0, audit: 0 };
  for (const e of events) counts[e.kind] += 1;
  const audits = events.filter(isAudit);
  return {
    window: eventWindow(events, { truncated: opts.truncated === true }),
    counts,
    cost: costRollup(events),
    latency: latencyRollup(events),
    tokens: tokenRollup(events),
    success: successRollup(events),
    errors: errorBreakdown(events),
    providers: providerBreakdown(events),
    models: modelBreakdown(events),
    features: featureUsage(events),
    retention: retentionRollup(events, { now: opts.now, horizonDays: opts.retentionDays ?? 7 }),
    audit: {
      total: audits.length,
      refused: audits.filter((a) => !a.allowed).length,
      byAction: errorBuckets(audits.map((a) => ({ key: a.action, fatal: !a.allowed })), audits.length),
    },
  };
}
