// WHETHER AN EVENT MAY CARRY THIS PERSON'S NAME.
//
// The request log in AdminDO records an event for every /api/* call, and every one of them carried
// the raw Supabase account id of whoever made it, kept for thirty days. There was no control: not
// in the settings page, not in the preference vocabulary, not in the middleware. A person could not
// say no to being logged, and nowhere in the product said they were.
//
// THE COST THAT SHAPES THIS FILE. The obvious implementation reads the preference on the request
// path — and that is one extra D1 round trip on every API call, to answer a question whose answer
// changes about once in an account's lifetime. The event is recorded in a `finally` block that
// currently touches nothing, and putting a database read there would put it on the latency path of
// every call the product makes.
//
// So the answer is cached per isolate, and the whole design question becomes: what do we do BEFORE
// the answer is known?
//
//   UNKNOWN IS TREATED AS A NO. A cache miss withholds the actor id and refreshes in the
//   background. The cost is one unattributed event per person per isolate; the alternative is one
//   logged identity that nobody consented to, on the way to finding out whether they consented. A
//   consent check has exactly one safe direction and this is it.
//
//   A FAILED LOOKUP IS NOT AN ANSWER. If the read throws, nothing is cached — the entry stays stale
//   so the next request tries again, and the actor stays withheld in the meantime. Caching a
//   failure as "they consented" would turn a momentary D1 blip into permanent attribution for the
//   life of the isolate.
//
//   THE WINDOW IS SHORT ENOUGH TO SAY OUT LOUD. Withdrawal takes effect immediately in the isolate
//   that handled the write and within CONSENT_CACHE_TTL_MS everywhere else; the settings copy says
//   "within a minute" because that is what this number is.
import type { Env } from './env';

/** The preference row, as `preferencesToEntries` writes it. */
export const ANALYTICS_CONSENT_ENTRY_KEY = 'pref.analytics_opt_out';

/** How long a known answer is trusted. Also the longest a withdrawal can take to reach an isolate. */
export const CONSENT_CACHE_TTL_MS = 60_000;

/** Entries kept. Beyond this the OLDEST are dropped — never the whole map. */
export const CONSENT_CACHE_MAX = 5000;

interface Known {
  optOut: boolean;
  at: number;
}

const known = new Map<string, Known>();

/** Test and operational seam: drop one person's cached answer, or all of them. */
export function forgetAnalyticsConsent(userId?: string): void {
  if (userId === undefined) known.clear();
  else known.delete(userId);
}

export function consentCacheSize(): number {
  return known.size;
}

/** True when this isolate has no usable answer for this person — so a refresh is worth queueing. */
export function consentIsStale(userId: string, now: number = Date.now()): boolean {
  const hit = known.get(userId);
  return hit === undefined || now - hit.at >= CONSENT_CACHE_TTL_MS;
}

/**
 * The actor id an analytics event may carry, or null.
 *
 * Null covers three different situations on purpose — there is no signed-in user, the person opted
 * out, or this isolate has not asked yet — because the event is the same event in all three: a
 * request that happened, counted, attributed to nobody. The distinction matters to this module and
 * to nothing downstream of it.
 */
export function analyticsActorId(userId: string | null | undefined, now: number = Date.now()): string | null {
  if (!userId) return null;
  const hit = known.get(userId);
  if (hit === undefined || now - hit.at >= CONSENT_CACHE_TTL_MS) return null;
  return hit.optOut ? null : userId;
}

/**
 * Ask the store, once, and remember.
 *
 * The read is a primary-key point lookup on `memory_entries` — the preference layering in
 * preferences.ts is a much heavier question (three scopes, a merge, a prompt block) and is the
 * wrong tool here. Only the USER layer is consulted: an organisation cannot consent on somebody's
 * behalf, and a project certainly cannot.
 */
export async function refreshAnalyticsConsent(
  env: Pick<Env, 'CORPUS'>,
  userId: string,
  now: number = Date.now(),
): Promise<void> {
  if (!userId) return;
  try {
    const row = await env.CORPUS.prepare(
      `select value from memory_entries where scope = 'user' and scope_id = ? and key = ?`,
    )
      .bind(userId, ANALYTICS_CONSENT_ENTRY_KEY)
      .first<{ value: string }>();
    // ONLY `true` OPTS OUT. The stored value is JSON text written by preferences.ts; a row that is
    // unreadable, or readable and not a boolean, is not a withdrawal — and is not coerced into one
    // either, because a control that switches itself on when a row is malformed is not a control.
    let optOut = false;
    if (row && typeof row.value === 'string') {
      try {
        optOut = JSON.parse(row.value) === true;
      } catch {
        optOut = false;
      }
    }
    remember(userId, optOut, now);
  } catch {
    // Not remembered. The entry stays stale, the actor stays withheld, and the next request asks
    // again — see the header: a failure to observe must not become an observation.
  }
}

function remember(userId: string, optOut: boolean, now: number): void {
  if (known.size >= CONSENT_CACHE_MAX) sweep(now);
  known.set(userId, { optOut, at: now });
}

/**
 * Drop expired entries first; only if that frees nothing, drop the oldest.
 *
 * Never `known.clear()`. index.ts records at length what a wholesale clear did to the rate limiter
 * it shared a map with — and here the entry a flood would evict is the entry of somebody currently
 * making requests, which would silently return them to "unknown" and unattributed. That direction
 * is safe, which is exactly why it would never be noticed.
 */
function sweep(now: number): void {
  for (const [k, v] of known) if (now - v.at >= CONSENT_CACHE_TTL_MS) known.delete(k);
  if (known.size < CONSENT_CACHE_MAX) return;
  const oldestFirst = [...known.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [k] of oldestFirst.slice(0, known.size - CONSENT_CACHE_MAX + 1)) known.delete(k);
}
