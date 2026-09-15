// The transport between the in-isolate event ring and the one place that keeps events: AdminDO.
//
// Split out of analytics.ts deliberately. That module must stay a pure function of its inputs so
// the violating input — the NaN latency, the cohort too young to have a day-7 number — can come
// from a test rather than from the tree; this one is the half that touches a binding and therefore
// cannot.
//
// WHY ADMINDO AND NOT A NEW DURABLE OBJECT. A new DO class needs a wrangler migration, and a
// migration is a production change nobody asked for. AdminDO is already the singleton for "cheap
// operational counters, no PII", already has SQLite storage, and is already reachable from both the
// worker and every other DO. Adding a table to it is a `create table if not exists` in a
// constructor that already runs one.
import type { Env } from './env';
import { drainEvents, normalizeEvent, pendingEventCount, type GolemEvent, type RejectReason } from './analytics';

/** Buffered events that trigger a flush. One DO write per request would cost more than the data. */
export const FLUSH_THRESHOLD = 16;

function adminStub(env: Env) {
  return env.ADMIN_DO.get(env.ADMIN_DO.idFromName('singleton'));
}

export interface FlushResult {
  sent: number;
  stored: number;
  /** events that left the ring and never reached the sink; they are gone, and this says so */
  lost: number;
}

/**
 * Ship whatever is buffered to the durable sink.
 *
 * A failed flush reports `lost`, and does NOT put the events back. Re-queuing would mean a sink
 * that is down turns into a ring that never stops growing inside a worker isolate — the events are
 * gone either way, and the honest move is to say how many rather than to accumulate them until the
 * isolate dies with them.
 */
export async function flushEvents(env: Env): Promise<FlushResult> {
  const batch = drainEvents();
  if (batch.length === 0) return { sent: 0, stored: 0, lost: 0 };
  try {
    const res = await adminStub(env).fetch('https://do/events', {
      method: 'POST',
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) return { sent: batch.length, stored: 0, lost: batch.length };
    const body = (await res.json()) as { stored?: number };
    const stored = typeof body.stored === 'number' && Number.isFinite(body.stored) ? body.stored : 0;
    return { sent: batch.length, stored, lost: Math.max(0, batch.length - stored) };
  } catch {
    return { sent: batch.length, stored: 0, lost: batch.length };
  }
}

/** Flush only once enough has accumulated to be worth a write. Fire-and-forget by design. */
export function maybeFlush(env: Env, waitUntil?: (p: Promise<unknown>) => void): void {
  if (pendingEventCount() < FLUSH_THRESHOLD) return;
  const p = flushEvents(env).catch(() => ({ sent: 0, stored: 0, lost: 0 }));
  if (waitUntil) waitUntil(p);
}

export interface StoredEvents {
  events: GolemEvent[];
  /** the window is missing events: either the row cap cut it, or pruning evicted its start */
  truncated: boolean;
  retained: number;
  rejected: Record<RejectReason, number> | null;
}

/**
 * Read events back for a rollup.
 *
 * Rows come out of storage as JSON written by another isolate, so they go through `normalizeEvent`
 * again on the way in — the same trust boundary, applied in the same direction. A row that no
 * longer parses is counted, not skipped silently: a rollup computed over 40 of 50 rows must know
 * it is a rollup over 40.
 */
export async function fetchStoredEvents(
  env: Env,
  opts: { sinceMs: number; limit?: number; kind?: string },
): Promise<StoredEvents> {
  const params = new URLSearchParams({ since: String(Math.floor(opts.sinceMs)) });
  if (opts.limit !== undefined) params.set('limit', String(Math.floor(opts.limit)));
  if (opts.kind) params.set('kind', opts.kind);
  const res = await adminStub(env).fetch(`https://do/events?${params.toString()}`);
  if (!res.ok) return { events: [], truncated: true, retained: 0, rejected: null };
  const body = (await res.json()) as { events?: unknown[]; truncated?: boolean; retained?: number };
  const rejected: Record<RejectReason, number> = {
    not_an_object: 0,
    unknown_kind: 0,
    unreadable_timestamp: 0,
    missing_required_field: 0,
  };
  const events: GolemEvent[] = [];
  for (const row of body.events ?? []) {
    const n = normalizeEvent(row);
    if (n.ok) events.push(n.event);
    else rejected[n.reason] += 1;
  }
  const dropped = Object.values(rejected).reduce((a, b) => a + b, 0);
  return {
    events,
    truncated: body.truncated === true || dropped > 0,
    retained: typeof body.retained === 'number' ? body.retained : events.length,
    rejected,
  };
}
