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
  expires_at: string | null;
  revoked_at: string | null;
  display_name: string | null;
  invited_by: string | null;
  via_token: string;
}

export async function putKvGrant(env: Env, projectId: string, grant: KvGrant): Promise<void> {
  await env.KV.put(shareGrantKey(projectId, grant.user_id), JSON.stringify(grant));
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
