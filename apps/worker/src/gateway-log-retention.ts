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
import type { Env } from './env';

/** How long a model call and its reply stay in the gateway log. The privacy pages quote this number, and a test reads it from here. */
export const GATEWAY_LOG_RETENTION_DAYS = 30;

const API = 'https://api.cloudflare.com/client/v4';
const TIMEOUT_MS = 15_000;
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

/**
 * Ask AI Gateway to delete every log older than the retention window. Never throws. `fetchImpl` is the one injection point, so a test can
 * answer for Cloudflare; in the Worker it is the global fetch.
 */
export async function pruneGatewayLogs(
  env: Pick<Env, 'AI_GATEWAY_ID' | 'CF_ACCOUNT_ID' | 'CF_WORKER_OPS_TOKEN'>,
  now: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayRetentionResult> {
  const at = new Date(now).toISOString();
  const missing = missingGatewayRetentionSettings(env);
  if (missing.length > 0) {
    // Said plainly, where an admin reads it, rather than looking like a night with nothing to delete.
    return { status: 'skipped', at, reason: `${missing.join(', ')} not set, so no log was deleted${missing.includes('CF_WORKER_OPS_TOKEN') ? ' (owner item N4 creates the token)' : ''}` };
  }
  const cutoff = new Date(now - GATEWAY_LOG_RETENTION_DAYS * 86_400_000).toISOString();
  const url = `${API}/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID!.trim())}/ai-gateway/gateways/${encodeURIComponent(env.AI_GATEWAY_ID!.trim())}/logs?filters=${gatewayLogFilter(cutoff)}`;
  try {
    const res = await fetchImpl(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.CF_WORKER_OPS_TOKEN!.trim()}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { success?: unknown; errors?: { code?: unknown; message?: unknown }[] } | null;
    // A 2xx whose body says success:false is a refusal; Cloudflare's API wraps every answer in that envelope.
    if (res.ok && body?.success !== false) return { status: 'requested', at, cutoff, httpStatus: res.status };
    const first = Array.isArray(body?.errors) ? body!.errors![0] : undefined;
    const said = first ? ` (${[first.code, first.message].filter((v) => v !== undefined && v !== null).map((v) => String(v).slice(0, 120)).join(' ')})` : '';
    return { status: 'failed', at, cutoff, httpStatus: res.status, reason: `Cloudflare answered ${res.status}${said}, so no log was deleted` };
  } catch (err) {
    return { status: 'failed', at, cutoff, reason: `Cloudflare could not be reached (${String((err as Error)?.name ?? 'error').slice(0, 40)}), so no log was deleted` };
  }
}

/** `requested older than 2026-09-05T03:00:00.000Z` — one line for the admin log's audit event. */
export function describeGatewayRetention(r: GatewayRetentionResult): string {
  if (r.status === 'requested') return `requested: logs older than ${r.cutoff}`;
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
