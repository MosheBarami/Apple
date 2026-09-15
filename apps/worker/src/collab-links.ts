/**
 * SHARE LINKS — a project, a chat or a build, handed to someone by URL.
 *
 * The POLICY for a link lives in collab.ts (`redeemShareLink`): what a link may carry, when it is
 * dead, and which resource it opens. This file is the storage and the token, and it exists apart
 * from the Postgres tables for one reason: a link is a BEARER credential, and a bearer credential
 * cannot be looked up under row-level security. RLS answers "may this user read this row"; the
 * question a link asks is "does this secret exist", and the only honest way to ask it is to hold
 * the secret as the key.
 *
 * So links and the grants they mint live in KV, keyed by the secret itself, and
 * `resolveMembership` merges those grants with the Postgres ones — it already takes a list of
 * rows and does not care which store they came from.
 *
 * THE TOKEN IS VALIDATED BEFORE IT IS USED AS A KEY. A key is a namespaced string; a token that
 * may contain `:` or `/` can address another namespace, and a token that may be empty addresses
 * the namespace itself. Both are refused by shape before a single read happens.
 */
import type { Env } from './env';
import type { CollabRole, ShareScope } from './collab';

/** 32 base64url characters ≈ 192 bits. Long enough that guessing is not an attack. */
const TOKEN_BYTES = 24;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function newShareToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let bin = '';
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A token we are willing to use as part of a KV key. See the header. */
export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

export function shareLinkKey(token: string): string {
  return `share:link:${token}`;
}

export function shareGrantKey(projectId: string, userId: string): string {
  return `share:grant:${projectId}:${userId}`;
}

/**
 * Every link-derived grant on one project lives under this prefix.
 *
 * The grants were keyed by project and user from the start; nothing ever LISTED them, which is why
 * a member removal could not reach one and why a roster could not show one. The prefix is the
 * index — no second key to keep in step with the first, and no way for the two to disagree.
 */
export function shareGrantPrefix(projectId: string): string {
  return `share:grant:${projectId}:`;
}

export interface StoredShareLink {
  token: string;
  project_id: string;
  scope: ShareScope;
  resource_id: string | null;
  role: CollabRole;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

export async function putShareLink(env: Env, link: StoredShareLink): Promise<void> {
  await env.KV.put(shareLinkKey(link.token), JSON.stringify(link));
}

/** The stored row, or null. An unreadable value is null, never a partially-trusted object. */
export async function readShareLink(env: Env, token: unknown): Promise<StoredShareLink | null> {
  if (!isShareToken(token)) return null;
  const raw = await env.KV.get(shareLinkKey(token));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as StoredShareLink) : null;
  } catch {
    return null;
  }
}

export async function revokeShareLink(env: Env, token: string, nowIso: string): Promise<boolean> {
  const link = await readShareLink(env, token);
  if (!link) return false;
  await putShareLink(env, { ...link, revoked_at: nowIso });
  return true;
}

/** A membership grant minted by redeeming a link. Same shape the Postgres rows use. */
export interface KvGrant {
  user_id: string;
  role: CollabRole;
  /**
   * THE SCOPE THE LINK WAS MINTED WITH, CARRIED ONTO THE GRANT IT MINTS.
   *
   * `redeemShareLink` refuses a chat link presented at a build — and then the grant it produced
   * had no scope on it at all, so the refusal lasted exactly one request: from the moment the
   * link was accepted the holder was an ordinary project member with the roster, every version
   * and every artifact. `classifyGrant` reads these two fields off any row shape, so the
   * confinement is applied by the same function that applies revocation and expiry.
   */
  scope?: ShareScope;
  resource_id?: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  display_name: string | null;
  invited_by: string | null;
  via_token: string;
  /** When the link was redeemed. THIS is the acceptance an invitation never had. */
  accepted_at?: string | null;
  /** Who ended it, when a person rather than an expiry did. */
  revoked_by?: string | null;
  /** Set by a member removal, so re-presenting the same link cannot undo the removal. */
  removed_from_project?: boolean;
  /** A paused grant. Read by `classifyGrant` exactly as the Postgres column is. */
  suspended_at?: string | null;
  suspended_reason?: string | null;
  suspended_by?: string | null;
}

export async function putKvGrant(env: Env, projectId: string, grant: KvGrant): Promise<void> {
  await env.KV.put(shareGrantKey(projectId, grant.user_id), JSON.stringify(grant));
}

/** The stored grant for one person, parsed, or null. Same failure rule as `readShareLink`. */
export async function readKvGrant(env: Env, projectId: string, userId: string): Promise<KvGrant | null> {
  try {
    const raw = await env.KV.get(shareGrantKey(projectId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as KvGrant) : null;
  } catch {
    return null;
  }
}

/**
 * END a link-derived grant.
 *
 * THIS IS THE HOLE THE MEMBER-REMOVAL ROUTE FELL THROUGH. `DELETE /members/:userId` PATCHed
 * `project_members` and nothing else, so a person whose access came from a redeemed link kept it:
 * `getProjectAccess` merges KV grants with Postgres ones, and only one of the two stores was being
 * revoked. The test beside it asserted the intended division of labour in a comment — "that is a
 * membership revocation, and the route above does it" — of a route that did not do it.
 *
 * Revoked, not deleted, for the same reason the Postgres row is: "this access ended" is a fact
 * worth keeping. `removed_from_project` is the part that makes the removal STICK — see
 * `kvGrantBarred`.
 *
 * Returns whether there was anything to revoke, so a caller can report what it actually did
 * rather than an unconditional `ok: true`.
 */
export async function revokeKvGrant(
  env: Env,
  projectId: string,
  userId: string,
  opts: { at: string; by: string | null; removed?: boolean },
): Promise<boolean> {
  return patchKvGrant(env, projectId, userId, {
    revoked_at: opts.at,
    revoked_by: opts.by,
    ...(opts.removed === true ? { removed_from_project: true } : {}),
  });
}

/** Undo the above: the grant comes back at the role it carried, and the bar is lifted. */
export async function restoreKvGrant(env: Env, projectId: string, userId: string): Promise<boolean> {
  return patchKvGrant(env, projectId, userId, {
    revoked_at: null,
    revoked_by: null,
    suspended_at: null,
    suspended_reason: null,
    suspended_by: null,
    removed_from_project: false,
  });
}

/**
 * Change part of a stored grant, or report that there was nothing to change.
 *
 * ONE WRITER FOR THE GRANT RECORD. Suspension, revocation and reinstatement are three verbs over
 * the same JSON, and three read-modify-write pairs written out three times is three chances for
 * one of them to drop a field the others rely on.
 *
 * Suspension needs no special support here and that is the point: `classifyGrant` reads
 * `suspended_at` off ANY row shape, so a suspended link grant is dead at the door by the same
 * rule that kills a suspended `project_members` row — one rule, two stores.
 */
export async function patchKvGrant(env: Env, projectId: string, userId: string, patch: Partial<KvGrant>): Promise<boolean> {
  const grant = await readKvGrant(env, projectId, userId);
  if (!grant) return false;
  await putKvGrant(env, projectId, { ...grant, ...patch, user_id: grant.user_id ?? userId });
  return true;
}

/**
 * Was this person REMOVED from this project by an admin?
 *
 * Asked at redemption. Without it, removing someone who got in through a link is undone by that
 * person pressing the link again — the removal would last exactly as long as it took to re-click,
 * and the admin would have no way to tell. An admin who wants them back re-invites them or
 * reactivates them; both are explicit acts by someone with `manage_members`.
 */
export async function kvGrantBarred(env: Env, projectId: string, userId: string): Promise<boolean> {
  const grant = await readKvGrant(env, projectId, userId);
  return grant?.removed_from_project === true && grant.revoked_at != null;
}

/**
 * Every link-derived grant on a project, and WHETHER THE LIST IS COMPLETE.
 *
 * The second half is not decoration. KV is a separate store that can be unreachable, and an empty
 * array returned from a failed list is indistinguishable from "this project has no guests" — a
 * failure to observe rendering as an observation, which is this repository's F-58. The caller is
 * handed the truth and decides what to say; the roster route says `partial: true`.
 */
export async function listKvGrants(
  env: Env,
  projectId: string,
  limit = 200,
): Promise<{ grants: KvGrant[]; complete: boolean }> {
  const prefix = shareGrantPrefix(projectId);
  let listed: { keys: { name: string }[]; list_complete?: boolean };
  try {
    listed = (await env.KV.list({ prefix, limit })) as { keys: { name: string }[]; list_complete?: boolean };
  } catch {
    return { grants: [], complete: false };
  }
  const keys = Array.isArray(listed?.keys) ? listed.keys : null;
  if (keys === null) return { grants: [], complete: false };

  const grants: KvGrant[] = [];
  let complete = listed.list_complete !== false;
  for (const key of keys) {
    if (typeof key?.name !== 'string' || !key.name.startsWith(prefix)) continue;
    const userId = key.name.slice(prefix.length);
    if (userId.length === 0) continue;
    const grant = await readKvGrant(env, projectId, userId);
    // A key that lists but cannot be read is a grant we know exists and cannot describe. Saying
    // the list is incomplete is the only honest answer; skipping it silently is not.
    if (grant === null) {
      complete = false;
      continue;
    }
    grants.push({ ...grant, user_id: typeof grant.user_id === 'string' ? grant.user_id : userId });
  }
  return { grants, complete };
}

/**
 * The link-derived grant this user holds on this project, if any.
 *
 * Returns an ARRAY because that is what `resolveMembership` consumes, and because an empty array
 * is the only honest answer to "KV was unreachable": no grant, therefore no access. A thrown
 * error here would take down a request that Postgres could have answered on its own.
 */
export async function kvGrantsFor(env: Env, projectId: string, userId: string): Promise<unknown[]> {
  try {
    const raw = await env.KV.get(shareGrantKey(projectId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? [parsed] : [];
  } catch {
    return [];
  }
}
