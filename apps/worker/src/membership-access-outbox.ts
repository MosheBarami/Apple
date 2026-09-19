/**
 * Durable delivery of membership changes to a project's SessionDO.
 *
 * PostgreSQL owns the intent and the sequence (migration 0009). This module owns transport only:
 * it reads or claims an immutable event, sends it to the Durable Object that may have an open
 * socket/run, and acknowledges the exact per-consumer row after the DO accepts the version.
 *
 * Delivery is at-least-once. `SessionDO` persists the greatest version it has accepted for each
 * member, so a duplicate is harmless and an old removal arriving after a regrant cannot undo it.
 */
import type { Env } from './env';
import { systemRpc, systemRpcConfig } from './system-rpc';
import {
  GRANTABLE_ROLES,
  MEMBERSHIP_ACCESS_CHANGES,
  asCollabRole,
  type CollabRole,
  type MembershipAccessChange,
} from './collab';
import { canonicalGrantExpiry } from './run-access';
import { supaRest } from './supa';

export { MEMBERSHIP_ACCESS_CHANGES } from './collab';
export type { MembershipAccessChange } from './collab';

export interface MembershipAccessEvent {
  projectId: string;
  userId: string;
  version: number;
  /** Null closes the socket. Active changes always carry the role the socket should hold. */
  role: CollabRole | null;
  access: MembershipAccessChange;
  /** Complete current grant deadline. Null means permanent. */
  expiresAt: string | null;
  attempts?: number;
}

export interface AccessChangeCounts {
  matched: number;
  closed: number;
  demoted: number;
}

export interface MembershipDeliveryResult {
  event: MembershipAccessEvent;
  accepted: boolean;
  acknowledged: boolean;
  counts: AccessChangeCounts | null;
  error: string | null;
}

export interface MembershipOutboxReport {
  configured: boolean;
  ready: boolean;
  claimed: number;
  accepted: number;
  acknowledged: number;
  failed: number;
  failures: { projectId: string; userId: string; version: number; error: string }[];
}

type OutboxEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SESSION_DO'> &
  Partial<Pick<Env, 'MEMBERSHIP_OUTBOX_TOKEN' | 'MEMBERSHIP_OUTBOX_CONSUMER'>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEMBERSHIP_OUTBOX_BATCH_MAX = 50;
export const MEMBERSHIP_OUTBOX_BATCH_DEFAULT = 25;

interface WireEvent {
  project_id?: unknown;
  user_id?: unknown;
  version?: unknown;
  role?: unknown;
  access?: unknown;
  expires_at?: unknown;
  attempts?: unknown;
}

function accessChange(value: unknown): MembershipAccessChange | null {
  return typeof value === 'string' && (MEMBERSHIP_ACCESS_CHANGES as readonly string[]).includes(value)
    ? (value as MembershipAccessChange)
    : null;
}

/** Validate every field crossing PostgREST before it can address a Durable Object. */
export function membershipAccessEvent(value: unknown): MembershipAccessEvent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as WireEvent;
  const projectId = typeof row.project_id === 'string' && UUID_RE.test(row.project_id) ? row.project_id : null;
  const userId = typeof row.user_id === 'string' && UUID_RE.test(row.user_id) ? row.user_id : null;
  const version = typeof row.version === 'number' && Number.isSafeInteger(row.version) && row.version > 0 ? row.version : null;
  const access = accessChange(row.access);
  const parsedRole = row.role === null || row.role === undefined ? null : asCollabRole(row.role);
  const role = parsedRole !== null && (GRANTABLE_ROLES as readonly string[]).includes(parsedRole) ? parsedRole : null;
  if (row.role !== null && row.role !== undefined && role === null) return null;
  const attempts = typeof row.attempts === 'number' && Number.isSafeInteger(row.attempts) && row.attempts >= 0
    ? row.attempts
    : undefined;
  if (projectId === null || userId === null || version === null || access === null) return null;
  // Versioned events are complete current-state snapshots. Missing/unreadable cannot mean
  // permanent, because that would widen a damaged event into an unlimited grant.
  if (!Object.prototype.hasOwnProperty.call(row, 'expires_at')) return null;
  const expiresAt = canonicalGrantExpiry(row.expires_at);
  if (expiresAt === undefined) return null;
  // A removal/suspension closes the connection. Every active state has a concrete role.
  if ((access === 'clear' || access === 'demoted') && role === null) return null;
  if ((access === 'removed' || access === 'suspended') && role !== null) return null;
  return { projectId, userId, version, role, access, expiresAt, ...(attempts === undefined ? {} : { attempts }) };
}

// MOVED, NOT COPIED. `system-rpc.ts` now owns the purpose token and the unauthenticated RPC call,
// because a second caller needed both: `supa.ts` fetches a project row for a redeemed share-link
// holder through the same token-gated door. Two copies of a credential check is how one of them
// gets a floor raised and the other does not.
const config = systemRpcConfig;

export function membershipOutboxConfigured(env: OutboxEnv): boolean {
  return config(env) !== null;
}

async function credentials(env: OutboxEnv): Promise<{ token: string; consumer: string } | null> {
  const configured = config(env);
  if (configured === null) return null;
  return configured;
}

/** Verify the database has the same purpose token and this Worker is an enabled consumer. */
export async function membershipOutboxReady(env: OutboxEnv): Promise<boolean> {
  const auth = await credentials(env);
  if (auth === null) return false;
  const res = await systemRpc<boolean>(env, 'membership_access_outbox_ready', {
    p_token: auth.token,
    p_consumer: auth.consumer,
  });
  return res.ok && res.data === true;
}

/**
 * Read the event generated atomically by the project_members trigger. This is the low-latency path;
 * inability to read it does not lose the event because the scheduled consumer claims the outbox.
 */
export async function latestMembershipAccessEvent(
  env: OutboxEnv,
  userJwt: string,
  projectId: string,
  userId: string,
): Promise<MembershipAccessEvent | null> {
  if (!UUID_RE.test(projectId) || !UUID_RE.test(userId)) return null;
  const { ok, data } = await supaRest<WireEvent[]>(
    env as Env,
    userJwt,
    `/membership_access_state?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=project_id,user_id,version,role,access,expires_at&limit=1`,
  );
  if (!ok || !Array.isArray(data) || !data[0]) return null;
  const row = data[0];
  return membershipAccessEvent({
    ...row,
    // The state remembers the grant role so it can be restored. The transport closes a denied
    // member's socket, hence null on the wire for these two states.
    role: row.access === 'removed' || row.access === 'suspended' ? null : row.role,
  });
}

/**
 * Atomically write the authoritative state + outbox for a grant whose metadata remains in KV.
 * The caller controls the KV ordering: deny intent first for removal/suspension, KV first for clear.
 */
export async function recordLinkMembershipAccessEvent(
  env: OutboxEnv,
  userJwt: string,
  input: { projectId: string; userId: string; role: CollabRole; access: MembershipAccessChange; expiresAt: string | null },
): Promise<{ ok: boolean; status: number; event: MembershipAccessEvent | null }> {
  const expiresAt = canonicalGrantExpiry(input.expiresAt);
  if (
    !UUID_RE.test(input.projectId)
    || !UUID_RE.test(input.userId)
    || asCollabRole(input.role) === null
    || accessChange(input.access) === null
    || expiresAt === undefined
  ) {
    return { ok: false, status: 400, event: null };
  }
  const { ok, status, data } = await supaRest<WireEvent[]>(env as Env, userJwt, '/rpc/record_link_membership_access_change', {
    method: 'POST',
    body: JSON.stringify({
      p_project: input.projectId,
      p_user: input.userId,
      p_role: input.role,
      p_access: input.access,
      p_expires_at: expiresAt,
    }),
  });
  const event = ok && Array.isArray(data) && data[0] ? membershipAccessEvent(data[0]) : null;
  return { ok: ok && event !== null, status, event };
}

function counts(value: unknown): AccessChangeCounts | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (![row.matched, row.closed, row.demoted].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  return { matched: Number(row.matched), closed: Number(row.closed), demoted: Number(row.demoted) };
}

async function acknowledge(env: OutboxEnv, event: MembershipAccessEvent): Promise<boolean> {
  const auth = await credentials(env);
  if (auth === null) return false;
  const res = await systemRpc<boolean>(env, 'ack_membership_access_outbox', {
    p_token: auth.token,
    p_consumer: auth.consumer,
    p_project: event.projectId,
    p_user: event.userId,
    p_version: event.version,
  });
  // `false` means the exact row was already acknowledged. That is idempotent success, not failure.
  return res.ok && (res.data === true || res.data === false);
}

async function recordFailure(env: OutboxEnv, event: MembershipAccessEvent, error: string): Promise<void> {
  const auth = await credentials(env);
  if (auth === null) return;
  await systemRpc<boolean>(env, 'fail_membership_access_outbox', {
    p_token: auth.token,
    p_consumer: auth.consumer,
    p_project: event.projectId,
    p_user: event.userId,
    p_version: event.version,
    p_error: error.slice(0, 500),
  }).catch(() => null);
}

/** One at-least-once delivery. A successful DO response is acked; every other outcome stays due. */
export async function deliverMembershipAccessEvent(
  env: OutboxEnv,
  event: MembershipAccessEvent,
): Promise<MembershipDeliveryResult> {
  const clean = membershipAccessEvent({
    project_id: event.projectId,
    user_id: event.userId,
    version: event.version,
    role: event.role,
    access: event.access,
    expires_at: event.expiresAt,
    attempts: event.attempts,
  });
  if (clean === null) {
    return { event, accepted: false, acknowledged: false, counts: null, error: 'invalid membership access event' };
  }

  try {
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(clean.projectId));
    const res = await stub.fetch('https://do/collab/access-changed', {
      method: 'POST',
      body: JSON.stringify({
        userId: clean.userId,
        role: clean.role,
        access: clean.access,
        version: clean.version,
        expiresAt: clean.expiresAt,
      }),
    });
    const body = await res.json().catch(() => null);
    const applied = counts(body);
    if (!res.ok || applied === null) {
      const error = `SessionDO refused membership access event (${res.status})`;
      await recordFailure(env, clean, error);
      return { event: clean, accepted: false, acknowledged: false, counts: null, error };
    }
    const acknowledged = await acknowledge(env, clean);
    return {
      event: clean,
      accepted: true,
      acknowledged,
      counts: applied,
      error: acknowledged || !membershipOutboxConfigured(env) ? null : 'SessionDO accepted the event but the outbox acknowledgement failed',
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    await recordFailure(env, clean, message);
    return { event: clean, accepted: false, acknowledged: false, counts: null, error: message };
  }
}

/**
 * Preserve low-latency socket updates while the outbox is the durability boundary. An old/fake
 * PostgREST surface may not expose state yet, so the final fallback is an unversioned best-effort
 * push; production still has the trigger-created outbox row and scheduled versioned delivery.
 */
export async function notifyLatestMembershipAccessChange(
  env: OutboxEnv,
  userJwt: string,
  input: {
    projectId: string;
    userId: string;
    role: CollabRole | null;
    access: MembershipAccessChange;
    expiresAt?: string | null;
    stub?: DurableObjectStub;
  },
): Promise<AccessChangeCounts | null> {
  const durable = await latestMembershipAccessEvent(env, userJwt, input.projectId, input.userId);
  if (durable !== null) return (await deliverMembershipAccessEvent(env, durable)).counts;

  try {
    const stub = input.stub ?? env.SESSION_DO.get(env.SESSION_DO.idFromName(input.projectId));
    const res = await stub.fetch('https://do/collab/access-changed', {
      method: 'POST',
      body: JSON.stringify({
        userId: input.userId,
        role: input.role,
        access: input.access,
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      }),
    });
    return res.ok ? counts(await res.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

async function claim(env: OutboxEnv, limit: number): Promise<MembershipAccessEvent[]> {
  const auth = await credentials(env);
  if (auth === null) throw new Error('membership outbox is not configured');
  const bounded = Math.min(MEMBERSHIP_OUTBOX_BATCH_MAX, Math.max(1, Math.trunc(limit) || MEMBERSHIP_OUTBOX_BATCH_DEFAULT));
  const res = await systemRpc<WireEvent[]>(env, 'claim_membership_access_outbox', {
    p_token: auth.token,
    p_consumer: auth.consumer,
    p_limit: bounded,
  });
  if (!res.ok || !Array.isArray(res.data)) throw new Error(`membership outbox claim failed (${res.status})`);
  const events: MembershipAccessEvent[] = [];
  for (const row of res.data) {
    const event = membershipAccessEvent(row);
    if (event !== null) events.push(event);
  }
  if (events.length !== res.data.length) throw new Error('membership outbox returned an invalid event');
  return events.sort((a, b) =>
    a.projectId.localeCompare(b.projectId) || a.userId.localeCompare(b.userId) || a.version - b.version,
  );
}

/** One bounded scheduled pass. It never loops waiting for more work. */
export async function drainMembershipAccessOutbox(
  env: OutboxEnv,
  limit: number = MEMBERSHIP_OUTBOX_BATCH_DEFAULT,
): Promise<MembershipOutboxReport> {
  const configured = membershipOutboxConfigured(env);
  if (!configured) throw new Error('membership outbox is not configured');
  const ready = await membershipOutboxReady(env);
  if (!ready) throw new Error('membership outbox token or consumer is not configured in Supabase');

  const events = await claim(env, limit);
  const report: MembershipOutboxReport = {
    configured,
    ready,
    claimed: events.length,
    accepted: 0,
    acknowledged: 0,
    failed: 0,
    failures: [],
  };
  for (const event of events) {
    const delivered = await deliverMembershipAccessEvent(env, event);
    if (delivered.accepted) report.accepted += 1;
    if (delivered.acknowledged) report.acknowledged += 1;
    if (!delivered.accepted || !delivered.acknowledged) {
      report.failed += 1;
      report.failures.push({
        projectId: event.projectId,
        userId: event.userId,
        version: event.version,
        error: delivered.error ?? 'delivery was not acknowledged',
      });
    }
  }
  return report;
}
