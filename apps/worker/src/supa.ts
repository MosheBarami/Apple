// Minimal PostgREST client. Always called with the USER's verified JWT so RLS applies.
import type { Env, AuthedUser } from './env';
import { classifyGrant, decideAccess, resolveMembership, type AccessDecision, type CollabAction, type Membership } from './collab';
import { kvGrantsFor } from './collab-links';

export async function supaRest<T = unknown>(
  env: Env,
  userJwt: string,
  path: string,
  init?: RequestInit & { prefer?: string },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${userJwt}`,
    'Content-Type': 'application/json',
  };
  if (init?.prefer) headers['Prefer'] = init.prefer;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, { ...init, headers });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  place_name: string | null;
  memory_summary: string | null;
  memory_facts: unknown[];
}

const PROJECT_SELECT = 'id,owner_id,name,place_name,memory_summary,memory_facts';

/**
 * The subject of an ALREADY-VERIFIED Supabase JWT.
 *
 * No signature check here, and none is needed: the only caller passes a token that `verifyJwt`
 * accepted, and the value is then used to NARROW a query that PostgREST runs under that same
 * token. A forged token returns no rows whatever this function says, so the worst a garbled
 * payload can do is refuse a request that would otherwise have succeeded. Null on anything
 * unreadable, and the caller treats null as "no access" rather than as "skip the check".
 */
function jwtSubject(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Returns the project row iff the user OWNS it.
 *
 * THE `owner_id` FILTER IS NOT REDUNDANT, AND REMOVING IT IS THE DEFECT IT GUARDS AGAINST.
 *
 * This used to be a bare `id=eq.…` select that leaned entirely on RLS to mean "owned". That was
 * true while `projects` had exactly one select policy. Migration 0005 adds a second — a member may
 * read a project they were invited to — and the moment it lands, every caller of this function
 * silently starts accepting members: the purge route, the pairing route, the memory write. Not one
 * of those call sites would have changed, so the widening would have been invisible in the diff
 * that caused it and invisible in the review of it.
 *
 * So ownership is asserted here, in the query, by the function whose NAME is the claim. RLS is
 * still the backstop it always was; it is no longer the only thing that knows what this means.
 */
export async function getOwnedProject(env: Env, userJwt: string, projectId: string): Promise<ProjectRow | null> {
  const sub = jwtSubject(userJwt);
  if (sub === null) return null; // cannot establish who is asking ⇒ nobody owns anything
  const { ok, data } = await supaRest<ProjectRow[]>(
    env,
    userJwt,
    `/projects?id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(sub)}&select=${PROJECT_SELECT}&limit=1`,
  );
  if (!ok || !data || data.length === 0) return null;
  const row = data[0] ?? null;
  // Belt as well as braces: PostgREST filters are a request, and this is the assertion.
  return row && row.owner_id === sub ? row : null;
}

/**
 * The project, plus what this caller is to it — owner, member, or nothing at all.
 *
 * Two round trips rather than an embedded select, because PostgREST would apply the embed as a
 * LEFT join and hand back the project row with an empty members array for a caller with no
 * membership. That is the failure shape this repository keeps finding: a query that could not see
 * anything returning a shape that reads like it looked.
 */
export async function getProjectAccess(
  env: Env,
  user: AuthedUser,
  projectId: string,
  action: CollabAction,
  nowMs: number = Date.now(),
): Promise<{ project: ProjectRow; membership: Membership } | { project: null; decision: AccessDecision }> {
  const id = encodeURIComponent(projectId);
  const { ok, data } = await supaRest<ProjectRow[]>(env, user.jwt, `/projects?id=eq.${id}&select=${PROJECT_SELECT}&limit=1`);
  const project = ok && data && data[0] ? data[0] : null;
  if (!project) {
    // Indistinguishable from "not shared with you" on purpose — see decideAccess.
    return { project: null, decision: { allowed: false, status: 404, role: null, reason: 'not_a_member' } };
  }

  // Only the caller's OWN grants are fetched. A full member list is a separate, capability-gated
  // read; resolving access must never require loading everyone else's rows.
  //
  // Two stores, one list. A grant from a redeemed share link lives in KV (see collab-links.ts —
  // a bearer secret cannot be looked up under RLS) and a grant from an invitation lives in
  // Postgres. `resolveMembership` takes rows and does not care which store they came from, so
  // neither does anything downstream of it.
  const grants = [...(await listMyGrants(env, user, projectId)), ...(await kvGrantsFor(env, projectId, user.userId))];
  const decision = decideAccess({ userId: user.userId, ownerId: project.owner_id, grants, nowMs, action });
  if (!decision.allowed) return { project: null, decision };
  const membership = resolveMembership({ userId: user.userId, ownerId: project.owner_id, grants, nowMs });
  if (membership === null) return { project: null, decision: { ...decision, allowed: false, status: 404, reason: 'not_a_member' } };
  return { project, membership };
}

export interface MemberRow {
  user_id: string;
  role: string;
  display_name: string | null;
  invited_by: string | null;
  created_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

const MEMBER_SELECT = 'user_id,role,display_name,invited_by,created_at,expires_at,revoked_at';

/** This caller's own membership rows for one project. An unreachable table reads as NO grants. */
async function listMyGrants(env: Env, user: AuthedUser, projectId: string): Promise<MemberRow[]> {
  const { ok, data } = await supaRest<MemberRow[]>(
    env,
    user.jwt,
    `/project_members?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(user.userId)}&select=${MEMBER_SELECT}`,
  );
  // A failed query is NOT an empty membership list in the sense of "you are fine": it is no
  // access, which is what an empty array produces at every call site. Stated so a later reader
  // does not add a fallback that turns an outage into an open door.
  return ok && Array.isArray(data) ? data : [];
}

/**
 * Everyone on the project, as the mention resolver and the reviewer check need them.
 * Callers must already hold `read`; this function does not re-derive that.
 */
export async function listProjectMembers(env: Env, user: AuthedUser, project: ProjectRow): Promise<MemberRow[]> {
  const { ok, data } = await supaRest<MemberRow[]>(
    env,
    user.jwt,
    `/project_members?project_id=eq.${encodeURIComponent(project.id)}&select=${MEMBER_SELECT}`,
  );
  return ok && Array.isArray(data) ? data : [];
}

/**
 * The member directory the collaboration store works from: the owner, plus every LIVE grant.
 *
 * Built through `classifyGrant`, so an expired or revoked row is not in the directory — which is
 * what makes "you cannot ask a non-member to review this" true of people whose invitation ran out
 * as well as of people who never had one.
 */
export function memberDirectory(
  project: ProjectRow,
  rows: readonly MemberRow[],
  ownerHandle: string | null,
  nowMs: number = Date.now(),
): { userId: string; handle: string; role: string; displayName: string | null }[] {
  const out = [
    {
      userId: project.owner_id,
      handle: handleFor(ownerHandle, project.owner_id),
      role: 'owner',
      displayName: ownerHandle,
    },
  ];
  for (const row of rows) {
    const { status, grant } = classifyGrant(row, nowMs);
    if (status !== 'active' || grant === null) continue;
    if (grant.userId === project.owner_id) continue; // the owner is already here, at full strength
    out.push({
      userId: grant.userId,
      handle: handleFor(grant.displayName, grant.userId),
      role: grant.role,
      displayName: grant.displayName,
    });
  }
  return out;
}

/** A stable `@handle`. Falls back to the user id so everyone is addressable, named or not. */
function handleFor(displayName: string | null, userId: string): string {
  const slug = (displayName ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length >= 2 ? slug : userId;
}

export async function getProfile(env: Env, userJwt: string, userId: string) {
  const { ok, data } = await supaRest<{ id: string; plan: string; is_admin: boolean; display_name: string | null }[]>(
    env,
    userJwt,
    `/profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,is_admin,display_name&limit=1`,
  );
  return ok && data && data[0] ? data[0] : null;
}
