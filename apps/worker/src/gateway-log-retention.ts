// THE AI GATEWAY LOG IS KEPT 30 DAYS AND THEN DELETED (owner decision D-14, 2026-10-05).
//
// Every text, image, sound and speech call goes through Cloudflare AI Gateway with `collectLog: true`, so the gateway keeps the prompt and the
// reply (providers/workers-ai.ts; voice is the one exception). Measured on 2026-10-05: the account is on AI Gateway LEGACY LOGS, which keep
// logs until they are deleted and have no time-based retention of their own
// (developers.cloudflare.com/ai-gateway/observability/logging/legacy-logs/). So the privacy pages' sentence "kept 30 days, then deleted" is
// true only because something deletes them, and this file is that something: one step of the Worker's daily cron.
//
//   DELETE https://api.cloudflare.com/client/v4/accounts/<account>/ai-gateway/gateways/<gateway>/logs?filters=<urlencoded JSON>
//   filters = [{"key":"created_at","operator":"lt","value":["<ISO time>"]}]
//
// The call answers success and deletes ASYNCHRONOUSLY, and the list endpoint's `result_info.total_count` stays stale for a while afterwards; the
// oldest log's `created_at` is what proves it worked. So a "requested" result here means Cloudflare accepted the request, not that the rows are gone.
//
// IT NEEDS A TOKEN THE WORKER DOES NOT HAVE UNTIL THE OWNER MAKES IT: the optional secret CF_WORKER_OPS_TOKEN (owner item N4 in
// planning/proof/BLOCKED.md: a narrow Cloudflare token with AI Gateway: Edit). Without it this step does nothing, and SAYS SO: the result is
// `skipped` with the reason, recorded as an audit event in the admin log and in KV for GET /api/admin/gateway-log-retention. Until the token is
// set the deletion is done by hand (it was done on 2026-10-05 for the old gateway); the current gateway's oldest log is from 2026-10-04, so the
// sentence holds without this step until 2026-11-03.
//
// ZERO AND "COULD NOT RUN" ARE DIFFERENT FACTS (retention-sweep.ts says the same): a missing token or gateway is `skipped`, a refused or unreachable
// call is `failed`, and neither is ever reported as `requested`. The function never throws, so one broken step cannot cancel the others in the cron.
//
// A DELETE THAT IGNORED ITS FILTER WOULD DELETE EVERY LOG, so the filter is checked before the deletion is sent, and what is left is read after it. Both are Cloudflare's
// List Gateway Logs call (`GET .../logs`, the same `filters` value, `order_by=created_at`, `order_by_direction`, `per_page=1`): BEFORE, with the cutoff filter and newest
// first, the newest log it returns must be OLDER than the cutoff, and if it is not (the list is returning logs the filter should have excluded) nothing is deleted
// and the night is `failed`; AFTER, oldest first with no filter, the oldest log is recorded in the audit event, so a deletion that did nothing shows as an oldest log that
// does not move. The DELETE carries an explicit `limit` (10,000, the API's maximum: it is optional and has no stated default). These calls are written from Cloudflare's API
// reference (this was written without a live gateway to try them on: the OAuth login has no AI Gateway scope), and are mocked in
// tests/gateway-log-retention.test.mjs. THEIR SHAPE IS TO BE VERIFIED ON THE FIRST LIVE RUN, once owner item N4 (CF_WORKER_OPS_TOKEN) is set: planning/proof/M2/LEGAL-CLAIMS.md
// section 9.3 lists what to look for. An answer this module cannot read is never taken as agreement: before the deletion it refuses.
import type { Env } from './env';

/** How long a model call and its reply stay in the gateway log. The privacy pages quote this number, and a test reads it from here. */
export const GATEWAY_LOG_RETENTION_DAYS = 30;

const API = 'https://api.cloudflare.com/client/v4';
/** How long ONE call to Cloudflare may take. A step makes three, in the daily cron, which must still reach the Roblox check and flush its events. */
export const GATEWAY_CALL_TIMEOUT_MS = 15_000;
/** The most logs one DELETE is asked to remove: the API's own maximum for `limit`. */
export const GATEWAY_DELETE_LIMIT = 10_000;
/** Where the last run is kept for the admin route. It is overwritten each day. */
export const GATEWAY_RETENTION_KV_KEY = 'ops:gateway-log-retention';

export interface GatewayRetentionResult {
  /** `requested`: Cloudflare accepted the deletion. `skipped`: it could not be asked (a setting is missing). `failed`: it was asked and did not accept, or could not be reached. */
  status: 'requested' | 'skipped' | 'failed';
  /** ISO time of the run. */
  at: string;
  /** The cutoff sent: logs created before this are to be deleted. Absent when nothing was sent. */
  cutoff?: string;
  /** One sentence, never carrying a value Cloudflare sent beyond a status and a short error text, and never the token. */
  reason?: string;
  /** The HTTP status Cloudflare answered, when it answered. */
  httpStatus?: number;
  /** Before the deletion: the `created_at` of the newest log older than the cutoff, or null when none is (there was nothing to delete). */
  newestExpired?: string | null;
  /** After the request: the `created_at` of the oldest log still listed (deletion is asynchronous, so a log just asked for can still be there), null when none is, absent when the read could not be made. */
  oldestAfter?: string | null;
}

/** The names of the settings this step needs and does not have: names only, never values. Empty means it can run. */
export function missingGatewayRetentionSettings(env: Pick<Env, 'AI_GATEWAY_ID' | 'CF_ACCOUNT_ID' | 'CF_WORKER_OPS_TOKEN'>): string[] {
  const missing: string[] = [];
  if (!env.CF_WORKER_OPS_TOKEN?.trim()) missing.push('CF_WORKER_OPS_TOKEN');
  if (!env.AI_GATEWAY_ID?.trim()) missing.push('AI_GATEWAY_ID');
  if (!env.CF_ACCOUNT_ID?.trim()) missing.push('CF_ACCOUNT_ID');
  return missing;
}

/** The query string value for the delete call: the one filter the owner measured on 2026-10-05, urlencoded. */
export function gatewayLogFilter(cutoffIso: string): string {
  return encodeURIComponent(JSON.stringify([{ key: 'created_at', operator: 'lt', value: [cutoffIso] }]));
}

/** What a call to Cloudflare came back as, or why it did not. `body` is Cloudflare's envelope. */
type Answered = { ok: true; status: number; body: { success?: unknown; errors?: { code?: unknown; message?: unknown }[]; result?: unknown } | null } | { ok: false; reason: string; httpStatus?: number };

/** One call, with its own time limit. Never throws: an error and a timeout are `{ ok: false }` with a sentence that carries no value Cloudflare sent beyond a status and a short error text. */
async function callCloudflare(fetchImpl: typeof fetch, url: string, method: string, token: string, timeoutMs: number): Promise<Answered> {
  try {
    const res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
    const body = (await res.json().catch(() => null)) as { success?: unknown; errors?: { code?: unknown; message?: unknown }[]; result?: unknown } | null;
    // A 2xx whose body says success:false is a refusal; Cloudflare's API wraps every answer in that envelope.
    if (res.ok && body?.success !== false) return { ok: true, status: res.status, body };
    const first = Array.isArray(body?.errors) ? body!.errors![0] : undefined;
    const said = first ? ` (${[first.code, first.message].filter((v) => v !== undefined && v !== null).map((v) => String(v).slice(0, 120)).join(' ')})` : '';
    return { ok: false, httpStatus: res.status, reason: `Cloudflare answered ${res.status}${said}, so no log was deleted` };
  } catch (err) {
    return { ok: false, reason: `Cloudflare could not be reached (${String((err as Error)?.name ?? 'error').slice(0, 40)}), so no log was deleted` };
  }
}

/** The `created_at` of the first log in a List Gateway Logs answer: a string (ISO) or null for an empty list, or `undefined` when the answer is not a list this can read. */
function firstCreatedAt(body: Answered & { ok: true }): string | null | undefined {
  const list = body.body?.result;
  if (!Array.isArray(list)) return undefined;
  if (list.length === 0) return null;
  const at = (list[0] as { created_at?: unknown } | null)?.created_at;
  return typeof at === 'string' && Number.isFinite(Date.parse(at)) ? at : undefined;
}

/**
 * Ask AI Gateway to delete every log older than the retention window. Never throws. `fetchImpl` is the one injection point, so a test can
 * answer for Cloudflare; in the Worker it is the global fetch. `timeoutMs` is how long each call may take (tests shorten it).
 *
 * THREE CALLS, IN THIS ORDER: a list with the cutoff filter that must come back with nothing newer than the cutoff, the delete, and a list of what is oldest now (see the header).
 */
export async function pruneGatewayLogs(
  env: Pick<Env, 'AI_GATEWAY_ID' | 'CF_ACCOUNT_ID' | 'CF_WORKER_OPS_TOKEN'>,
  now: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
  opts: { timeoutMs?: number } = {},
): Promise<GatewayRetentionResult> {
  const at = new Date(now).toISOString();
  const missing = missingGatewayRetentionSettings(env);
  if (missing.length > 0) {
    // Said plainly, where an admin reads it, rather than looking like a night with nothing to delete.
    return { status: 'skipped', at, reason: `${missing.join(', ')} not set, so no log was deleted${missing.includes('CF_WORKER_OPS_TOKEN') ? ' (owner item N4 creates the token)' : ''}` };
  }
  const timeoutMs = opts.timeoutMs ?? GATEWAY_CALL_TIMEOUT_MS;
  const token = env.CF_WORKER_OPS_TOKEN!.trim();
  const cutoff = new Date(now - GATEWAY_LOG_RETENTION_DAYS * 86_400_000).toISOString();
  const logs = `${API}/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID!.trim())}/ai-gateway/gateways/${encodeURIComponent(env.AI_GATEWAY_ID!.trim())}/logs`;
  // ONE filter value, used by the list and by the delete: what is checked is what is sent.
  const filters = `filters=${gatewayLogFilter(cutoff)}`;
  const failed = (reason: string, httpStatus?: number): GatewayRetentionResult => ({ status: 'failed', at, cutoff, reason, ...(httpStatus === undefined ? {} : { httpStatus }) });

  // 1. BEFORE: the newest log the cutoff filter returns must be older than the cutoff.
  const before = await callCloudflare(fetchImpl, `${logs}?${filters}&order_by=created_at&order_by_direction=desc&per_page=1&page=1`, 'GET', token, timeoutMs);
  if (!before.ok) return failed(before.reason, before.httpStatus);
  const newest = firstCreatedAt(before);
  if (newest === undefined) return failed('Cloudflare answered the check of the filter in a shape this step cannot read, so no log was deleted', before.status);
  if (newest !== null && Date.parse(newest) >= Date.parse(cutoff)) {
    // Short on purpose: the audit event's subject is clipped at 120 characters (analytics.ts), and the part that matters is the first.
    return failed(`filter not honoured: listed a log from ${newest}, newer than the cutoff, so no log was deleted`, before.status);
  }

  // 2. THE DELETE, with an explicit limit.
  const sent = await callCloudflare(fetchImpl, `${logs}?${filters}&limit=${GATEWAY_DELETE_LIMIT}`, 'DELETE', token, timeoutMs);
  if (!sent.ok) return failed(sent.reason, sent.httpStatus);

  // 3. AFTER: the oldest log still listed. It does not turn an accepted deletion into a failure; it is what makes a deletion that did nothing visible.
  const after = await callCloudflare(fetchImpl, `${logs}?order_by=created_at&order_by_direction=asc&per_page=1&page=1`, 'GET', token, timeoutMs);
  const oldest = after.ok ? firstCreatedAt(after) : undefined;
  return { status: 'requested', at, cutoff, httpStatus: sent.status, newestExpired: newest, ...(oldest === undefined ? {} : { oldestAfter: oldest }) };
}

/**
 * `requested: older than 2026-09-05T03:00:00.000Z; newest 2026-09-04T03:00:00.000Z; oldest left 2026-09-06T03:00:00.000Z` — one line for the admin log's audit event. What was
 * asked, then what was seen before it (the newest log older than the cutoff: `none` when nothing was) and after it (the oldest log listed: `none`, or `unread`). It is at most
 * 120 characters, because the event's subject is clipped there (analytics.ts), and the oldest log left is the last thing on it.
 */
export function describeGatewayRetention(r: GatewayRetentionResult): string {
  if (r.status === 'requested') {
    const newest = r.newestExpired === undefined ? 'unread' : (r.newestExpired ?? 'none');
    const oldest = r.oldestAfter === undefined ? 'unread' : (r.oldestAfter ?? 'none');
    return `requested: older than ${r.cutoff}; newest ${newest}; oldest left ${oldest}`;
  }
  return `${r.status}: ${r.reason ?? 'no reason given'}`;
}

/** Keep the last run where GET /api/admin/gateway-log-retention reads it. Never throws: a KV that is down must not turn a deletion into a failed cron. */
export async function rememberGatewayRetention(env: Pick<Env, 'KV'>, result: GatewayRetentionResult): Promise<void> {
  try {
    await env.KV.put(GATEWAY_RETENTION_KV_KEY, JSON.stringify(result));
  } catch {
    // The audit event carries the same line.
  }
}

export interface GatewayRetentionReport {
  retentionDays: number;
  /** True when every setting the step needs is present. False means it does nothing, and `missing` names what to set. */
  configured: boolean;
  missing: string[];
  /** The last daily run, or null when the cron has not run it since this was deployed. */
  last: GatewayRetentionResult | null;
}

/** What the admin sees: whether the daily deletion can run, and what happened the last time it was tried. */
export async function readGatewayRetention(env: Pick<Env, 'AI_GATEWAY_ID' | 'CF_ACCOUNT_ID' | 'CF_WORKER_OPS_TOKEN' | 'KV'>): Promise<GatewayRetentionReport> {
  const missing = missingGatewayRetentionSettings(env);
  let last: GatewayRetentionResult | null = null;
  try {
    const raw = await env.KV.get(GATEWAY_RETENTION_KV_KEY);
    last = raw ? (JSON.parse(raw) as GatewayRetentionResult) : null;
  } catch {
    last = null;
  }
  return { retentionDays: GATEWAY_LOG_RETENTION_DAYS, configured: missing.length === 0, missing, last };
}
