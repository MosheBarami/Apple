// Minimal PostgREST client. Always called with the USER's verified JWT so RLS applies.
import type { Env, AuthedUser } from './env';
import {
  classifyGrant,
  decideAccess,
  resolveMembership,
  type AccessDecision,
  type CollabAction,
  type Membership,
  type MembershipAccessStateRow,
  type ShareResource,
} from './collab';
import { kvGrantsFor } from './collab-links';
import { systemRpc, systemRpcConfig } from './system-rpc';
// One answer to "who is @maya", shared with the roster. See membership.ts.
import { handleFor } from './membership';

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
 * The project row for somebody whose only claim on it is a redeemed share link.
 *
 * THE GRANT IS CHECKED BEFORE THE ROW IS FETCHED, and that order is the whole security argument.
 * `classifyGrant` is the same function that decides an invited member's standing — it applies
 * revocation, expiry and suspension — so a link that was revoked, expired, suspended, or whose
 * holder was removed from the project (a removal revokes the grant as it marks it), buys nothing. Only once one of this caller's
 * own KV grants is live does the worker read the row as itself.
 *
 * WHAT IT DOES NOT DO. It does not decide access. It answers the narrower question "does a row
 * exist that this caller may be shown at all", and hands back to `getProjectAccess`, where
 * `decideAccess` then applies the scope the link was minted with — a chat link still opens the
 * chat and nothing else — exactly as it does for a grant that arrived alongside an RLS-visible row.
 * Nothing about what a grant MEANS is decided here.
 *
 * RETURNS NULL FOR EVERY KIND OF NO. No grant, a dead grant, no purpose token configured, a
 * database without the function, a row that came back the wrong shape: all of them are the 404 the
 * caller already returns. A deployment that has not run migration 0011 behaves exactly as it did
 * before this existed, which is what makes the worker safe to ship first.
 */
async function projectForLinkGuest(
  env: Env,
  user: AuthedUser,
  projectId: string,
  nowMs: number,
): Promise<ProjectRow | null> {
  const grants = await kvGrantsFor(env, projectId, user.userId);
  if (grants.length === 0) return null;
  // `active` is classifyGrant's own verdict for a grant that is not expired, revoked, suspended or
  // malformed. A member removal is covered without this function knowing the word: the removal
  // writes `removed_from_project` AND `revoked_at` together (collab-links.ts), and it is the
  // revocation classifyGrant sees. Asking HERE means a dead link never reaches the privileged read
  // at all, rather than reaching it and being refused a step later.
  const live = grants.some((grant) => classifyGrant(grant, nowMs).status === 'active');
  if (!live) return null;

  const auth = systemRpcConfig(env);
  if (auth === null) return null;
  const { ok, data } = await systemRpc<ProjectRow[]>(env, 'project_for_link_grant', {
    p_token: auth.token,
    p_consumer: auth.consumer,
    p_project: projectId,
  });
  if (!ok || !Array.isArray(data)) return null;
  const row = data[0] ?? null;
  // The function is asked for one project and is trusted to return that one; this is the assertion
  // rather than the assumption, in the same spirit as getOwnedProject's own second check.
  return row && row.id === projectId && typeof row.owner_id === 'string' ? row : null;
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
  /** What the caller is reaching for. Omitted means project-wide — see ShareResource in collab.ts. */
  resource?: ShareResource,
): Promise<{ project: ProjectRow; membership: Membership } | { project: null; decision: AccessDecision }> {
  const id = encodeURIComponent(projectId);
  const [{ ok, data }, accessState] = await Promise.all([
    supaRest<ProjectRow[]>(env, user.jwt, `/projects?id=eq.${id}&select=${PROJECT_SELECT}&limit=1`),
    readMyMembershipAccessState(env, user, projectId),
  ]);
  let project = ok && data && data[0] ? data[0] : null;
  if (!project) {
    // A REDEEMED SHARE LINK MATCHES NO RLS POLICY, and this early return is where every share link
    // in the product used to die.
    //
    // The read above runs under the caller's own JWT, so `public.projects` answers with what its
    // policies allow: your own projects, and projects you hold a `project_members` row for. The
    // grant a link produces is in KV — a bearer secret cannot be looked up under RLS — so a link
    // guest matches neither policy and the row comes back empty. Returning here made the join page
    // say "You're in", and then 404 on the transcript, the socket, the versions and the
    // checkpoints. Shared projects, shared chats and shared builds opened nothing for anybody.
    //
    // The comment forty lines below already said the two stores were one list and that nothing
    // downstream cared which a grant came from. It was true of `resolveMembership` and false of the
    // control flow that never reached it.
    //
    // So: ask KV first, and only when it holds a LIVE grant for this caller does the worker fetch
    // the row as itself, through a token-gated `security definer` function that returns one project
    // and nothing else. The order is the safety property — the grant is checked before any
    // privileged read happens, never after.
    project = await projectForLinkGuest(env, user, projectId, nowMs);
    if (!project) {
      // Indistinguishable from "not shared with you" on purpose — see decideAccess.
      return { project: null, decision: { allowed: false, status: 404, role: null, reason: 'not_a_member' } };
    }
  }

  // Only the caller's OWN grants are fetched. A full member list is a separate, capability-gated
  // read; resolving access must never require loading everyone else's rows.
  //
  // Two stores, one list. A grant from a redeemed share link lives in KV (see collab-links.ts —
  // a bearer secret cannot be looked up under RLS) and a grant from an invitation lives in
  // Postgres. `resolveMembership` takes rows and does not care which store they came from, so
  // neither does anything downstream of it.
  const grants = [...(await listMyGrants(env, user, projectId)), ...(await kvGrantsFor(env, projectId, user.userId))];
  const decision = decideAccess({ userId: user.userId, ownerId: project.owner_id, grants, accessState, nowMs, action, resource });
  if (!decision.allowed) return { project: null, decision };
  const membership = resolveMembership({ userId: user.userId, ownerId: project.owner_id, grants, accessState, nowMs, resource });
  if (membership === null) return { project: null, decision: { ...decision, allowed: false, status: 404, reason: 'not_a_member' } };
  return { project, membership };
}

/**
 * Latest durable membership lifecycle state for this caller.
 *
 * No row is a normal pre-event state and is represented by `undefined`. A FAILED query is a
 * present malformed row so `collab.ts` closes the door; treating an outage as no overlay would let
 * the exact outage that hid a revocation restore the underlying grant.
 */
async function readMyMembershipAccessState(
  env: Env,
  user: AuthedUser,
  projectId: string,
): Promise<MembershipAccessStateRow | undefined> {
  const { ok, data } = await supaRest<MembershipAccessStateRow[]>(
    env,
    user.jwt,
    `/membership_access_state?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(user.userId)}&select=user_id,version,role,access,expires_at&limit=1`,
  );
  if (!ok || !Array.isArray(data)) {
    return { user_id: user.userId, version: null, role: null, access: 'unreadable' };
  }
  return data[0];
}

export interface MemberRow {
  user_id: string;
  role: string;
  display_name: string | null;
  invited_by: string | null;
  created_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  /** Migration 0006. A paused grant: dead while it lasts, and distinguishable from a revoked one. */
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
}

// SUSPENSION IS SELECTED, NOT ASSUMED ABSENT. `classifyGrant` closes a grant whose `suspended_at`
// is set; a select that omitted the column would hand it a row where the field is undefined, and
// every suspended member would read as active at the door while the roster showed them paused.
const MEMBER_SELECT =
  'user_id,role,display_name,invited_by,created_at,expires_at,revoked_at,suspended_at,suspended_reason,suspended_by';

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

export async function getProfile(env: Env, userJwt: string, userId: string) {
  const { ok, data } = await supaRest<{ id: string; plan: string; is_admin: boolean; display_name: string | null }[]>(
    env,
    userJwt,
    `/profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,is_admin,display_name&limit=1`,
  );
  return ok && data && data[0] ? data[0] : null;
}
