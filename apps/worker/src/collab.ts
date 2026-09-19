/**
 * WHO MAY TOUCH A SHARED PROJECT, AND WHAT THEY MAY DO TO IT.
 *
 * Until this file existed the product had exactly one answer to "may this person open this
 * project": `getOwnedProject` — a PostgREST select that returns a row only when the caller owns
 * it. That is a correct answer for a single-tenant product and it is the WRONG SHAPE for a shared
 * one, because widening it is a one-line change to an RLS policy that silently converts every
 * read route, every write route and the Durable Object's `/ws` handshake into member-accessible
 * endpoints at once. The access decision has to be a thing the code SAYS, not a thing a database
 * policy happens to imply.
 *
 * So: membership is resolved here, from data, by a pure function, and every route names the
 * ACTION it is performing. A viewer reading a transcript and a viewer restoring a checkpoint are
 * the same person asking two different questions, and only one of them gets a yes.
 *
 * THE RULES THIS FILE FAILS CLOSED ON — each has a test that feeds it the violating input:
 *
 *   - A role string that is not one of ours is REFUSED, never widened and never downgraded to
 *     viewer. `Record<CollabRole, T>` is a compile-time promise; the rows come from Postgres and
 *     the header comes from another process, so both are validated against an explicit allowlist.
 *     (The same failure the mode router had — see router.ts's default branch.)
 *   - A membership row claiming role `owner` is MALFORMED, not an owner. Ownership is the
 *     `projects.owner_id` column and nothing else; if a row in a members table could confer it,
 *     then anyone who can insert a membership row can take the project.
 *   - An expiry that is present but unparseable makes the grant DEAD, not eternal. `expiresAt ??
 *     Infinity` defends null and undefined only; `Date.parse('whenever')` is NaN and every `>`
 *     against NaN is false, so the direction of the comparison decides whether a corrupt row
 *     opens the project or closes it. It closes it, explicitly, by name.
 *   - A clock that is not a finite number refuses EVERYTHING. Expiry cannot be evaluated without
 *     one, and "cannot evaluate" must never render as "not expired".
 *   - A share link may never carry `admin` or `owner`. A link is a bearer token that lands in
 *     chat logs and browser history; a link that can add members is account takeover with extra
 *     steps.
 */

// ---------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------

/** Every role the product understands. Order is meaningless here; see ROLE_RANK. */
export const COLLAB_ROLES = ['viewer', 'commenter', 'editor', 'admin', 'owner'] as const;
export type CollabRole = (typeof COLLAB_ROLES)[number];

const ROLE_SET: ReadonlySet<string> = new Set(COLLAB_ROLES);

/** The allowlist gate. Anything that is not exactly one of our strings is null, not a default. */
export function asCollabRole(value: unknown): CollabRole | null {
  return typeof value === 'string' && ROLE_SET.has(value) ? (value as CollabRole) : null;
}

/**
 * Roles a MEMBERSHIP ROW may confer. `owner` is deliberately absent: see the header.
 * A share link is narrower still — see SHARE_LINK_MAX_RANK.
 */
export const GRANTABLE_ROLES = ['viewer', 'commenter', 'editor', 'admin'] as const;
const GRANTABLE_SET: ReadonlySet<string> = new Set(GRANTABLE_ROLES);

/** Strength order, used only to pick between two valid grants held by the same person. */
const ROLE_RANK: Record<CollabRole, number> = { viewer: 0, commenter: 1, editor: 2, admin: 3, owner: 4 };

/** -1 for anything that is not a role, so a corrupt value can never win a max(). */
export function roleRank(role: unknown): number {
  const r = asCollabRole(role);
  return r === null ? -1 : ROLE_RANK[r];
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/**
 * What a caller can be doing. Routes name one of these; roles hold a set of them.
 *
 * `read` is the transcript, the memory, the checkpoint list, the export — everything the project
 * already knows. `chat` and `build` both spend the OWNER's Credits, which is why they stop at
 * editor: an invitation to comment must not be an invitation to spend someone's money.
 */
export const COLLAB_ACTIONS = [
  'read',
  'comment',
  'react',
  'request_review',
  'approve',
  'chat',
  'build',
  'restore_version',
  'manage_members',
  'share',
  'delete_project',
] as const;
export type CollabAction = (typeof COLLAB_ACTIONS)[number];

const ACTION_SET: ReadonlySet<string> = new Set(COLLAB_ACTIONS);

export function asCollabAction(value: unknown): CollabAction | null {
  return typeof value === 'string' && ACTION_SET.has(value) ? (value as CollabAction) : null;
}

const VIEWER: readonly CollabAction[] = ['read'];
const COMMENTER: readonly CollabAction[] = [...VIEWER, 'comment', 'react'];
const EDITOR: readonly CollabAction[] = [...COMMENTER, 'request_review', 'chat', 'build'];
/**
 * `restore_version` is admin, not editor, and that is a decision rather than an oversight.
 * Restoring a checkpoint discards work that other members made after it. An editor may build;
 * only someone trusted with the project's shape may throw a day of someone else's building away.
 */
const ADMIN: readonly CollabAction[] = [...EDITOR, 'approve', 'restore_version', 'manage_members', 'share'];
const OWNER: readonly CollabAction[] = [...ADMIN, 'delete_project'];

const CAPABILITIES: Record<CollabRole, readonly CollabAction[]> = {
  viewer: VIEWER,
  commenter: COMMENTER,
  editor: EDITOR,
  admin: ADMIN,
  owner: OWNER,
};

/**
 * May this role do this thing?
 *
 * Both arguments are `unknown` on purpose. Every caller of this is downstream of a database row,
 * a JSON body or an inter-process header, and a signature that demanded `CollabRole` would push
 * the cast — and therefore the failure — to the call site where nobody would see it.
 */
export function can(role: unknown, action: unknown): boolean {
  const r = asCollabRole(role);
  const a = asCollabAction(action);
  if (r === null || a === null) return false;
  return CAPABILITIES[r].includes(a);
}

/** The full capability set of a role, for a client that wants to grey out buttons honestly. */
export function capabilitiesFor(role: unknown): readonly CollabAction[] {
  const r = asCollabRole(role);
  return r === null ? [] : CAPABILITIES[r];
}

// ---------------------------------------------------------------------------------------------
// Membership grants
// ---------------------------------------------------------------------------------------------

/** A row out of `project_members`, as PostgREST returns it: snake_case, everything nullable. */
export interface MemberGrantRow {
  user_id?: unknown;
  role?: unknown;
  /**
   * WHAT THIS GRANT REACHES. Absent means `project`, because a `project_members` row is a
   * membership of the whole project and always has been. A share link redeemed for one chat
   * writes `chat` here with that chat's id in `resource_id`, and the difference between the two
   * is the difference between "someone shared a conversation with me" and "someone added me to
   * their project".
   */
  scope?: unknown;
  resource_id?: unknown;
  /** ISO timestamp, or null/absent for "never expires". */
  expires_at?: unknown;
  /** ISO timestamp; any value at all means the grant is over. */
  revoked_at?: unknown;
  display_name?: unknown;
  invited_by?: unknown;
  /**
   * ISO timestamp; any value at all means the grant is PAUSED. Same rule `revoked_at` follows,
   * and deliberately a separate column: an admin who cannot tell "paused pending a conversation"
   * from "gone" has to re-invite the first, which is the same act as inviting a stranger.
   */
  suspended_at?: unknown;
}

export type GrantStatus = 'active' | 'expired' | 'revoked' | 'suspended' | 'malformed';

export interface NormalisedGrant {
  userId: string;
  role: CollabRole;
  /** `project` for every membership row; a share link redeemed for one chat or build narrows it. */
  scope: ShareScope;
  /** The chat or build a scoped grant opens. Null exactly when `scope` is `project`. */
  resourceId: string | null;
  expiresAtMs: number | null;
  displayName: string | null;
  invitedBy: string | null;
}

/** A finite, parseable instant, or null. Accepts a number of ms or an ISO string. */
function instantMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function nonEmptyId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Classify one membership row.
 *
 * Returns the reason as well as the grant so a caller can tell "you were never invited" from
 * "your invitation ran out" — the second is a sentence a product can act on and the first is not.
 */
export function classifyGrant(row: unknown, nowMs: number): { status: GrantStatus; grant: NormalisedGrant | null } {
  if (!Number.isFinite(nowMs)) return { status: 'malformed', grant: null };
  if (!row || typeof row !== 'object') return { status: 'malformed', grant: null };
  const r = row as MemberGrantRow;

  const userId = nonEmptyId(r.user_id);
  if (userId === null) return { status: 'malformed', grant: null };

  // `owner` is not grantable — see the header. Anything outside GRANTABLE_ROLES is malformed,
  // including a role we DO understand but do not allow a row to confer.
  const role = typeof r.role === 'string' && GRANTABLE_SET.has(r.role) ? (r.role as CollabRole) : null;
  if (role === null) return { status: 'malformed', grant: null };

  // THE SCOPE IS PART OF THE GRANT, not a property of the link that minted it. Absent is
  // `project`, which is what a membership row has always been. PRESENT BUT UNREADABLE IS
  // MALFORMED, never widened back to `project`: the only job this column has is to narrow, so a
  // value nobody can read must not be the value that narrows nothing.
  let scope: ShareScope = 'project';
  let resourceId: string | null = null;
  if (r.scope !== undefined && r.scope !== null) {
    const parsed = asShareScope(r.scope);
    if (parsed === null) return { status: 'malformed', grant: null };
    scope = parsed;
  }
  if (scope !== 'project') {
    // A scoped grant that names no resource cannot be confined to one, and "cannot be confined"
    // must close the door rather than remove it — the same direction the expiry rule goes.
    resourceId = nonEmptyId(r.resource_id);
    if (resourceId === null) return { status: 'malformed', grant: null };
  }

  // Revocation beats everything, including a still-valid expiry — and including a suspension,
  // so "restore this suspended member" can never resurrect someone who was actually removed.
  if (r.revoked_at !== undefined && r.revoked_at !== null) return { status: 'revoked', grant: null };

  // SUSPENDED IS DEAD WHILE IT LASTS. The grant is not returned, so every caller that asks this
  // function — resolveMembership, decideAccess, the directory, the roster — closes the door at
  // once. A suspension that only greyed out a button in the UI would be a label, not a state.
  //
  // Present in ANY form means suspended, exactly as `revoked_at` reads: a column whose value we
  // cannot parse must not mean "not suspended after all".
  if (r.suspended_at !== undefined && r.suspended_at !== null) return { status: 'suspended', grant: null };

  let expiresAtMs: number | null = null;
  if (r.expires_at !== undefined && r.expires_at !== null) {
    expiresAtMs = instantMs(r.expires_at);
    // PRESENT BUT UNREADABLE IS DEAD, NOT ETERNAL. See the header.
    if (expiresAtMs === null) return { status: 'malformed', grant: null };
    if (expiresAtMs <= nowMs) return { status: 'expired', grant: null };
  }

  return {
    status: 'active',
    grant: {
      userId,
      role,
      scope,
      resourceId,
      expiresAtMs,
      displayName: typeof r.display_name === 'string' ? r.display_name : null,
      invitedBy: nonEmptyId(r.invited_by),
    },
  };
}

export interface Membership {
  userId: string;
  role: CollabRole;
  /** `owner` means the projects.owner_id column; `grant` means a project_members row. */
  via: 'owner' | 'grant';
  /** What the grant in force reaches. `project` for ownership and for every membership row. */
  scope: ShareScope;
  /** The chat or build a scoped grant opens, or null for a project-wide one. */
  resourceId: string | null;
  /** Trusted grant deadline, when the effective grant carries one. Owners have none. */
  expiresAtMs?: number;
}

/**
 * The durable lifecycle overlay written with every membership-access outbox event. It never grants
 * access by itself; it can deny a grant or cap the strongest live grant at the administrator's
 * latest chosen role. Kept here beside the grant resolver so the HTTP door and SQL migration share
 * one explicit vocabulary.
 */
export const MEMBERSHIP_ACCESS_CHANGES = ['clear', 'demoted', 'removed', 'suspended'] as const;
export type MembershipAccessChange = (typeof MEMBERSHIP_ACCESS_CHANGES)[number];

export interface MembershipAccessStateRow {
  user_id?: unknown;
  version?: unknown;
  role?: unknown;
  access?: unknown;
  /** Current authoritative deadline, or null for a permanent grant. */
  expires_at?: unknown;
}

/**
 * WHAT A ROUTE IS TOUCHING, so a scoped grant opens its own resource and nothing else.
 *
 * `undefined` means the route is project-wide — the roster, the link list, the version list, the
 * review queue — and only a project-scoped grant survives it. `{ kind, id }` names the surface;
 * `id: null` is for a surface this product has exactly one of per project (the chat), where
 * "which one" cannot differ and pretending to compare an id would be theatre.
 *
 * `'any'` is the one deliberate exception, and it is a promise by the caller: this route admits a
 * grant of any scope BECAUSE IT REPORTS THE SCOPE AND NARROWS ITS OWN ANSWER. Today that is only
 * GET /api/shared/:id, which tells a scoped guest their role and withholds the member directory
 * instead of handing it over.
 */
export type ShareResource = { kind: ShareScope; id: string | null } | 'any';

export interface AccessInput {
  userId: unknown;
  ownerId: unknown;
  /** Rows for THIS project. Rows for other users are ignored rather than trusted. */
  grants?: readonly unknown[];
  /**
   * Latest lifecycle overlay for this user. `undefined` means no event has ever been written;
   * PRESENT BUT MALFORMED closes the door because it means the authority could not be read safely.
   */
  accessState?: unknown;
  nowMs: number;
  /** What the caller is reaching for. Omitted means project-wide; see ShareResource. */
  resource?: ShareResource;
}

type AccessOverlay =
  | { kind: 'none' }
  | { kind: 'deny' }
  | { kind: 'active'; role: CollabRole; expiresAtMs: number | null }
  | { kind: 'malformed' };

function accessOverlay(value: unknown, userId: string, nowMs: number): AccessOverlay {
  if (value === undefined || value === null) return { kind: 'none' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'malformed' };
  const row = value as MembershipAccessStateRow;
  if (nonEmptyId(row.user_id) !== userId) return { kind: 'malformed' };
  if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version <= 0) return { kind: 'malformed' };
  const access = typeof row.access === 'string' && (MEMBERSHIP_ACCESS_CHANGES as readonly string[]).includes(row.access)
    ? (row.access as MembershipAccessChange)
    : null;
  if (access === null) return { kind: 'malformed' };
  if (access === 'removed' || access === 'suspended') return { kind: 'deny' };
  const role = typeof row.role === 'string' && GRANTABLE_SET.has(row.role) ? (row.role as CollabRole) : null;
  if (role === null) return { kind: 'malformed' };
  let expiresAtMs: number | null = null;
  if (row.expires_at !== null) {
    // A lifecycle row always carries this column. Missing/unreadable is not "permanent", because
    // that would turn a failed authority read into an unbounded grant.
    expiresAtMs = instantMs(row.expires_at);
    if (expiresAtMs === null) return { kind: 'malformed' };
    if (expiresAtMs <= nowMs) return { kind: 'deny' };
  }
  return { kind: 'active', role, expiresAtMs };
}

/** Does this grant reach what the route named? A project grant reaches everything on its project. */
function grantReaches(grant: NormalisedGrant, resource: ShareResource | undefined): boolean {
  if (grant.scope === 'project') return true;
  if (resource === undefined) return false;
  if (resource === 'any') return true;
  if (resource.kind !== grant.scope) return false;
  return resource.id === null || resource.id === grant.resourceId;
}

/**
 * The strongest grant that reaches here, and WHETHER ONE WAS TURNED AWAY FOR ITS SCOPE.
 *
 * The second half is what lets the door tell a chat guest apart from a stranger. Both have no
 * membership of this project; only one of them is holding a link to it.
 */
function pickGrant(input: AccessInput): { best: NormalisedGrant | null; scopedOut: boolean } {
  const userId = nonEmptyId(input.userId);
  if (userId === null || !Number.isFinite(input.nowMs)) return { best: null, scopedOut: false };
  let best: NormalisedGrant | null = null;
  let scopedOut = false;
  for (const raw of input.grants ?? []) {
    const { status, grant } = classifyGrant(raw, input.nowMs);
    if (status !== 'active' || grant === null) continue;
    if (grant.userId !== userId) continue; // a row about someone else is not a grant to you
    if (!grantReaches(grant, input.resource)) {
      scopedOut = true;
      continue;
    }
    if (best === null || roleRank(grant.role) > roleRank(best.role)) best = grant;
  }
  const overlay = accessOverlay(input.accessState, userId, input.nowMs);
  // PRESENT BUT UNREADABLE IS DENIED. A failed state query must not be indistinguishable from a
  // user who has never had an outbox event, because the former may be the only durable revocation.
  if (overlay.kind === 'malformed' || overlay.kind === 'deny') return { best: null, scopedOut: false };
  if (overlay.kind === 'active' && best !== null) {
    // The state can only NARROW. A stale/corrupt row claiming a stronger role cannot turn a viewer
    // grant into an editor grant. Expiry follows the same rule: an earlier authoritative deadline
    // wins, while a later one only takes effect when the underlying grant was extended too.
    const role = roleRank(overlay.role) < roleRank(best.role) ? overlay.role : best.role;
    const expiresAtMs =
      overlay.expiresAtMs !== null && (best.expiresAtMs === null || overlay.expiresAtMs < best.expiresAtMs)
        ? overlay.expiresAtMs
        : best.expiresAtMs;
    best = { ...best, role, expiresAtMs };
  }
  return { best, scopedOut };
}

/**
 * What this user is to this project, or null for "nothing at all".
 *
 * A null here is the non-member answer, and the whole point of the cluster: every route asks this
 * question before it does anything, and a stranger never gets past it.
 */
export function resolveMembership(input: AccessInput): Membership | null {
  if (!Number.isFinite(input.nowMs)) return null; // cannot evaluate expiry ⇒ no access
  const userId = nonEmptyId(input.userId);
  const ownerId = nonEmptyId(input.ownerId);
  if (userId === null) return null;
  // A project with no owner id is a broken row; nobody is its owner, not even another broken row.
  if (ownerId !== null && ownerId === userId) {
    return { userId, role: 'owner', via: 'owner', scope: 'project', resourceId: null };
  }

  const { best } = pickGrant(input);
  return best === null
    ? null
    : {
        userId,
        role: best.role,
        via: 'grant',
        scope: best.scope,
        resourceId: best.resourceId,
        ...(best.expiresAtMs === null ? {} : { expiresAtMs: best.expiresAtMs }),
      };
}

/**
 * What this person may do here, and WHY — CHECKLIST-V2 §08.12-14.
 *
 * Three questions that are really one. Someone who cannot see why they CAN do a thing cannot tell a
 * bug from a policy; someone who cannot see why they CANNOT cannot tell "ask an admin" from "this
 * is broken". So the answer carries the role, where the role came from, which grant conferred it,
 * and when it runs out.
 *
 * DERIVED FROM `can()`, NEVER FROM A SECOND TABLE. A permissions view maintained beside the
 * enforcement drifts from it, and a view that has drifted tells people confidently what the server
 * will refuse. Every entry in `actions` is a call to the same function the routes gate on.
 *
 * EVERY ACTION APPEARS, including the false ones. An action omitted from the map reads as "not
 * permitted" to any caller, so absence would be a verdict nobody wrote — the omission and the
 * refusal are indistinguishable to a UI.
 *
 * A non-member gets `member: false` and an all-false map rather than an empty one, for the same
 * reason: "no permissions" and "not here at all" are different sentences.
 */
export interface EffectivePermissions {
  member: boolean;
  role: CollabRole | null;
  /** `owner` means the projects row; `grant` means a membership row. Null when not a member. */
  via: 'owner' | 'grant' | null;
  /** Every action in the vocabulary, true or false — never a subset. */
  actions: Record<CollabAction, boolean>;
  /** Who conferred the grant in force, when it came from one. */
  invitedBy: string | null;
  /** When the grant in force runs out, or null for ownership and for grants that do not expire. */
  expiresAtIso: string | null;
  /** Other live grants this person holds that the effective one outranks. */
  supersededCount: number;
}

export function effectivePermissions(
  membership: Membership | null,
  opts: { now: number; grants?: readonly unknown[] },
): EffectivePermissions {
  const none = (): EffectivePermissions => ({
    member: false,
    role: null,
    via: null,
    actions: Object.fromEntries(COLLAB_ACTIONS.map((a) => [a, false])) as Record<CollabAction, boolean>,
    invitedBy: null,
    expiresAtIso: null,
    supersededCount: 0,
  });

  // A clock that cannot be read cannot decide an expiry, and an answer computed from it would be a
  // confident guess. Same rule resolveMembership applies.
  if (!Number.isFinite(opts?.now)) return none();
  if (!membership) return none();

  const actions = Object.fromEntries(
    COLLAB_ACTIONS.map((a) => [a, can(membership.role, a)]),
  ) as Record<CollabAction, boolean>;

  if (membership.via === 'owner') {
    return { member: true, role: membership.role, via: 'owner', actions, invitedBy: null, expiresAtIso: null, supersededCount: 0 };
  }

  // Which grant is actually in force: the strongest ACTIVE one, which is resolveMembership's rule.
  // Reported rather than recomputed differently, so the view cannot disagree with the decision.
  const active: { role: CollabRole; invitedBy: string | null; expiresAtMs: number | null }[] = [];
  for (const raw of opts.grants ?? []) {
    const { status, grant } = classifyGrant(raw, opts.now);
    if (status !== 'active' || grant === null) continue;
    if (grant.userId !== membership.userId) continue;
    // Only grants that reach the SAME place the effective one does. A chat-scoped link this
    // person also holds is not a superseded project membership, and counting it as one would
    // report "1 other grant" about a grant that opens somewhere else entirely.
    //
    // A membership with no scope on it is PROJECT-WIDE, not "matches nothing". This function
    // reports provenance, and a mismatch here loses `invitedBy` silently — the direction that
    // turns "Maya invited you" into "nobody did".
    if (grant.scope !== (membership.scope ?? 'project')) continue;
    if (grant.resourceId !== (membership.resourceId ?? null)) continue;
    active.push({ role: grant.role, invitedBy: grant.invitedBy, expiresAtMs: grant.expiresAtMs });
  }
  let inForce: (typeof active)[number] | null = null;
  for (const g of active) if (inForce === null || roleRank(g.role) > roleRank(inForce.role)) inForce = g;

  return {
    member: true,
    role: membership.role,
    via: 'grant',
    actions,
    invitedBy: inForce?.invitedBy ?? null,
    expiresAtIso: inForce?.expiresAtMs != null ? new Date(inForce.expiresAtMs).toISOString() : null,
    supersededCount: Math.max(0, active.length - 1),
  };
}

export interface AccessDecision {
  allowed: boolean;
  /** The HTTP status a route should answer with when `allowed` is false. */
  status: 200 | 403 | 404;
  role: CollabRole | null;
  reason: 'ok' | 'not_a_member' | 'insufficient_role' | 'unknown_action' | 'scoped_grant';
}

/**
 * The route-level answer.
 *
 * A non-member gets 404, not 403, and that matches what this codebase already does for images:
 * "no such project", "not shared with you" and "deleted" are one answer, because three answers
 * turn an id into an oracle that confirms which projects exist.
 *
 * A MEMBER who lacks the capability gets 403, because they already know the project exists and
 * telling them "not with your role" is the only way they can ask for the right one.
 */
export function decideAccess(input: AccessInput & { action: unknown }): AccessDecision {
  const membership = resolveMembership(input);
  if (membership === null) {
    // A LIVE GRANT THAT DOES NOT REACH HERE IS NOT "NO SUCH PROJECT". 404 is the right answer to a
    // stranger and the wrong one to someone holding a chat link: they can already prove the
    // project exists, and "not found" hides the single fact they can act on — that their link
    // opens the conversation and not the project around it.
    if (pickGrant(input).scopedOut) return { allowed: false, status: 403, role: null, reason: 'scoped_grant' };
    return { allowed: false, status: 404, role: null, reason: 'not_a_member' };
  }
  if (asCollabAction(input.action) === null) {
    return { allowed: false, status: 403, role: membership.role, reason: 'unknown_action' };
  }
  if (!can(membership.role, input.action)) {
    return { allowed: false, status: 403, role: membership.role, reason: 'insufficient_role' };
  }
  return { allowed: true, status: 200, role: membership.role, reason: 'ok' };
}

// ---------------------------------------------------------------------------------------------
// Share links — "Shared projects", "Shared chats", "Shared builds"
// ---------------------------------------------------------------------------------------------

/** What a link can point at. A chat link opens one conversation, not the whole project. */
export const SHARE_SCOPES = ['project', 'chat', 'build'] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];
const SCOPE_SET: ReadonlySet<string> = new Set(SHARE_SCOPES);

export function asShareScope(value: unknown): ShareScope | null {
  return typeof value === 'string' && SCOPE_SET.has(value) ? (value as ShareScope) : null;
}

/**
 * The ceiling on what a bearer link may carry. `editor` is the most a URL can be worth.
 * Raising this to `admin` would make a pasted link able to add members; see the header.
 */
export const SHARE_LINK_MAX_RANK = ROLE_RANK.editor;

export interface ShareLinkRow {
  token?: unknown;
  project_id?: unknown;
  scope?: unknown;
  /** The chat or build the link opens; null for a whole-project link. */
  resource_id?: unknown;
  role?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
}

export interface ShareRedemption {
  projectId: string;
  scope: ShareScope;
  resourceId: string | null;
  role: CollabRole;
}

export type ShareRefusal =
  | 'malformed'
  | 'revoked'
  | 'expired'
  | 'role_too_strong'
  | 'wrong_project'
  | 'wrong_scope'
  | 'wrong_resource';

/**
 * Turn a stored link row into an access grant, or say why not.
 *
 * The `asking` argument is what the REQUEST claims it wants to open. A link is only as good as
 * the thing it was minted for: a chat link presented at a build URL is refused rather than
 * upgraded, because the alternative is that one leaked link opens everything.
 */
export function redeemShareLink(
  row: unknown,
  asking: { projectId: unknown; scope: unknown; resourceId?: unknown },
  nowMs: number,
): { ok: true; grant: ShareRedemption } | { ok: false; reason: ShareRefusal } {
  if (!Number.isFinite(nowMs)) return { ok: false, reason: 'malformed' };
  if (!row || typeof row !== 'object') return { ok: false, reason: 'malformed' };
  const r = row as ShareLinkRow;

  const projectId = nonEmptyId(r.project_id);
  const scope = asShareScope(r.scope);
  const role = asCollabRole(r.role);
  if (projectId === null || scope === null || role === null) return { ok: false, reason: 'malformed' };
  if (nonEmptyId(r.token) === null) return { ok: false, reason: 'malformed' };

  if (r.revoked_at !== undefined && r.revoked_at !== null) return { ok: false, reason: 'revoked' };
  if (roleRank(role) > SHARE_LINK_MAX_RANK) return { ok: false, reason: 'role_too_strong' };

  if (r.expires_at !== undefined && r.expires_at !== null) {
    const exp = instantMs(r.expires_at);
    if (exp === null) return { ok: false, reason: 'malformed' };
    if (exp <= nowMs) return { ok: false, reason: 'expired' };
  }

  if (nonEmptyId(asking.projectId) !== projectId) return { ok: false, reason: 'wrong_project' };
  if (asShareScope(asking.scope) !== scope) return { ok: false, reason: 'wrong_scope' };

  const resourceId = nonEmptyId(r.resource_id);
  if (scope !== 'project') {
    // A scoped link must name its resource, and must be presented at that resource.
    if (resourceId === null) return { ok: false, reason: 'malformed' };
    if (nonEmptyId(asking.resourceId) !== resourceId) return { ok: false, reason: 'wrong_resource' };
  }

  return { ok: true, grant: { projectId, scope, resourceId: scope === 'project' ? null : resourceId, role } };
}
