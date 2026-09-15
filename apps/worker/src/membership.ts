/**
 * THE MEMBER LIST AS AN ADMINISTRATIVE OBJECT — who is here, who WAS here, and what happened.
 *
 * `memberDirectory` in supa.ts answers one question and answers it well: who may be @mentioned
 * right now. It is built from LIVE grants only, so an expired invitation, a suspended member and a
 * revoked one are all equally absent from it. That is correct for mentions and useless for
 * administration: the rows an admin is about to act on are exactly the rows the directory hides.
 *
 * So this file is the second view over the same data, plus the two things the surface around it
 * needed and did not have — a BATCH of invitations, and an EVENT that says what changed.
 *
 * WHAT IS LOAD-BEARING HERE:
 *
 *   - STATUS IS TAKEN FROM `classifyGrant`, NEVER DECIDED AGAIN. The roster and the door must not
 *     be able to disagree about whether a grant is live; the repository already has that scar
 *     (F-57, a checker that drifted from the thing it checked). `rosterEntry` calls the same
 *     function `decideAccess` calls, and a status this file cannot express is a test failure.
 *   - A FILTER VALUE THAT IS NOT ONE OF OURS IS AN ERROR. `?status=revokd` answered with the whole
 *     roster reads as "nobody is revoked" — a failure to observe rendering as an observation,
 *     which is F-58 and the thing this repository is most careful about.
 *   - A BATCH IS REFUSED WHOLE, NEVER TRUNCATED. A truncated batch reports success for
 *     invitations that were never written.
 *   - AN UNPARSEABLE EXPIRY IS REFUSED AT THE DOOR. `classifyGrant` treats one as DEAD, so a row
 *     accepted with it is an invitation that can never open anything — written, reported as sent,
 *     and broken.
 *   - A ROW THE ACCESS LAYER CANNOT READ IS SHOWN AS MALFORMED, not dropped. Dropping it hides a
 *     row that exists in the table from the only person who can fix it.
 */
import { asCollabRole, classifyGrant, roleRank, COLLAB_ROLES, GRANTABLE_ROLES, type CollabRole } from './collab.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A stable `@handle`. Falls back to the user id so everyone is addressable, named or not.
 *
 * Lives here rather than in supa.ts because both the directory and the roster need it and it is a
 * pure function of a string: two copies of this would be two answers to "who is @maya".
 */
export function handleFor(displayName: string | null, userId: string): string {
  const slug = (displayName ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length >= 2 ? slug : userId;
}

// ---------------------------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------------------------

/**
 * Every classification a roster row can carry — the same vocabulary `classifyGrant` produces.
 * A test derives this from the function rather than trusting the list, so adding a status to the
 * access decision without adding it here is a red test rather than a member who vanishes.
 */
export const MEMBER_STATUSES = ['active', 'suspended', 'expired', 'revoked', 'malformed'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * How this person got here. `link` is the guest class: someone who redeemed a share link and
 * let themselves in, rather than someone an admin named. A roster that cannot tell them apart
 * cannot be used to decide who should still be here.
 */
export const MEMBER_ORIGINS = ['owner', 'invite', 'link'] as const;
export type MemberOrigin = (typeof MEMBER_ORIGINS)[number];

export interface RosterEntry {
  userId: string;
  handle: string;
  /** The role the row CARRIES, live or not — "was an editor" is the sentence an admin needs. */
  role: CollabRole | null;
  displayName: string | null;
  status: MemberStatus;
  origin: MemberOrigin;
  /** `origin === 'link'`, named because that is the question people ask of a member list. */
  guest: boolean;
  invitedBy: string | null;
  invitedAt: string | null;
  /** When a guest redeemed the link. Null for an invitation, which has no acceptance step. */
  acceptedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  suspendedBy: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);

function entryFor(raw: unknown, origin: MemberOrigin, nowMs: number): RosterEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.user_id);
  if (userId === null) return null;
  // THE STATUS IS NOT DECIDED HERE. See the header.
  const { status } = classifyGrant(raw, nowMs);
  // The role is read separately because a dead grant still has one, and `classifyGrant` returns
  // no grant for a dead row. Validated against the allowlist all the same: a role that is not a
  // role is reported as no role, never widened to viewer and never echoed back raw.
  const written = asCollabRole(r.role);
  const role = written !== null && (GRANTABLE_ROLES as readonly string[]).includes(written) ? written : null;
  const displayName = typeof r.display_name === 'string' ? r.display_name : null;
  return {
    userId,
    handle: handleFor(displayName, userId),
    role,
    displayName,
    status: (MEMBER_STATUSES as readonly string[]).includes(status) ? (status as MemberStatus) : 'malformed',
    origin,
    guest: origin === 'link',
    invitedBy: str(r.invited_by),
    invitedAt: str(r.created_at),
    acceptedAt: str(r.accepted_at),
    expiresAt: str(r.expires_at),
    revokedAt: str(r.revoked_at),
    suspendedAt: str(r.suspended_at),
    suspendedReason: str(r.suspended_reason),
    suspendedBy: str(r.suspended_by),
  };
}

/**
 * One person, one row. When someone holds several grants the LIVE one wins, and among live ones
 * the strongest — which is exactly `resolveMembership`'s rule, so the list agrees with the door.
 */
function stronger(a: RosterEntry, b: RosterEntry): RosterEntry {
  const aLive = a.status === 'active';
  const bLive = b.status === 'active';
  if (aLive !== bLive) return aLive ? a : b;
  return roleRank(b.role) > roleRank(a.role) ? b : a;
}

export interface RosterInput {
  project: { id?: unknown; owner_id?: unknown };
  /** `project_members` rows for this project. */
  rows: readonly unknown[];
  /** Grants minted by redeeming a share link — see collab-links.ts. */
  kvGrants?: readonly unknown[];
  ownerHandle: string | null;
  nowMs: number;
}

export function buildRoster(input: RosterInput): RosterEntry[] {
  const ownerId = str(input.project?.owner_id);
  const byUser = new Map<string, RosterEntry>();

  for (const [rows, origin] of [
    [input.rows ?? [], 'invite'],
    [input.kvGrants ?? [], 'link'],
  ] as [readonly unknown[], MemberOrigin][]) {
    for (const raw of rows) {
      const entry = entryFor(raw, origin, input.nowMs);
      if (entry === null) continue;
      // The owner is the `projects.owner_id` column and nothing else. A row naming them is not a
      // second membership; showing it would let a viewer row downgrade the person who owns it.
      if (ownerId !== null && entry.userId === ownerId) continue;
      const seen = byUser.get(entry.userId);
      byUser.set(entry.userId, seen ? stronger(seen, entry) : entry);
    }
  }

  const out: RosterEntry[] = [];
  if (ownerId !== null) {
    out.push({
      userId: ownerId,
      handle: handleFor(input.ownerHandle, ownerId),
      role: 'owner',
      displayName: input.ownerHandle,
      status: 'active',
      origin: 'owner',
      guest: false,
      invitedBy: null,
      invitedAt: null,
      acceptedAt: null,
      expiresAt: null,
      revokedAt: null,
      suspendedAt: null,
      suspendedReason: null,
      suspendedBy: null,
    });
  }
  for (const e of byUser.values()) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

export const ROSTER_PAGE_DEFAULT = 50;
export const ROSTER_PAGE_MAX = 200;
const QUERY_MAX_CHARS = 100;

export interface RosterQuery {
  ok: true;
  q: string | null;
  role: CollabRole | null;
  /** `all` is the explicit way to ask for the dead rows; the default is the live list. */
  status: MemberStatus | 'all';
  origin: MemberOrigin | null;
  limit: number;
  offset: number;
}
export type RosterQueryResult = RosterQuery | { ok: false; error: string };

/** A positive integer written as a string, or null. `'3.5'`, `'0x10'` and `'1e3'` are not one. */
function intParam(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

/**
 * Read the query string, or say which filter was unreadable.
 *
 * NOTHING IS SILENTLY IGNORED. A misspelt status that fell through to "no filter" would answer a
 * question nobody asked with a list that looks like an answer — see the header.
 */
export function parseRosterQuery(raw: Record<string, unknown> | null | undefined): RosterQueryResult {
  const r = raw ?? {};
  const bad = (key: string) => ({ ok: false as const, error: `bad_${key}` });

  let q: string | null = null;
  if (r.q !== undefined && r.q !== null && r.q !== '') {
    if (typeof r.q !== 'string') return bad('q');
    const trimmed = r.q.trim();
    if (trimmed.length > QUERY_MAX_CHARS) return bad('q');
    q = trimmed.length === 0 ? null : trimmed.toLowerCase();
  }

  let role: CollabRole | null = null;
  if (r.role !== undefined && r.role !== null && r.role !== '') {
    role = asCollabRole(r.role);
    if (role === null) return bad('role');
  }

  let status: MemberStatus | 'all' = 'active';
  if (r.status !== undefined && r.status !== null && r.status !== '') {
    if (r.status === 'all') status = 'all';
    else if (typeof r.status === 'string' && (MEMBER_STATUSES as readonly string[]).includes(r.status)) status = r.status as MemberStatus;
    else return bad('status');
  }

  let origin: MemberOrigin | null = null;
  if (r.origin !== undefined && r.origin !== null && r.origin !== '') {
    if (typeof r.origin !== 'string' || !(MEMBER_ORIGINS as readonly string[]).includes(r.origin)) return bad('origin');
    origin = r.origin as MemberOrigin;
  }

  let limit = ROSTER_PAGE_DEFAULT;
  if (r.limit !== undefined && r.limit !== null && r.limit !== '') {
    const n = intParam(r.limit);
    if (n === null || n < 1 || n > ROSTER_PAGE_MAX) return bad('limit');
    limit = n;
  }

  let offset = 0;
  if (r.offset !== undefined && r.offset !== null && r.offset !== '') {
    const n = intParam(r.offset);
    if (n === null) return bad('offset');
    offset = n;
  }

  return { ok: true, q, role, status, origin, limit, offset };
}

export interface RosterPage {
  entries: RosterEntry[];
  /** Every row that exists, whatever the filter — so "0 of 12" is sayable. */
  total: number;
  /** Rows the filter admitted, before the page window. */
  matched: number;
  more: boolean;
  limit: number;
  offset: number;
}

function matches(entry: RosterEntry, q: RosterQuery): boolean {
  if (q.status !== 'all' && entry.status !== q.status) return false;
  if (q.role !== null && entry.role !== q.role) return false;
  if (q.origin !== null && entry.origin !== q.origin) return false;
  if (q.q !== null) {
    const hay = `${entry.handle}\n${entry.displayName ?? ''}\n${entry.userId}`.toLowerCase();
    if (!hay.includes(q.q)) return false;
  }
  return true;
}

/**
 * A page of the roster, in a STABLE order — the owner, then everyone else by handle.
 *
 * Stability is the only thing pagination has to promise: an order that depends on the order rows
 * came back in serves some members twice and skips others, and the caller cannot tell.
 */
export function filterRoster(roster: readonly RosterEntry[], query: RosterQueryResult): RosterPage {
  if (query.ok !== true) return { entries: [], total: roster.length, matched: 0, more: false, limit: 0, offset: 0 };
  const ordered = [...roster].sort((a, b) => {
    if (a.origin === 'owner' !== (b.origin === 'owner')) return a.origin === 'owner' ? -1 : 1;
    const h = a.handle.localeCompare(b.handle);
    return h !== 0 ? h : a.userId.localeCompare(b.userId);
  });
  const admitted = ordered.filter((e) => matches(e, query));
  const page = admitted.slice(query.offset, query.offset + query.limit);
  return {
    entries: page,
    total: roster.length,
    matched: admitted.length,
    more: query.offset + page.length < admitted.length,
    limit: query.limit,
    offset: query.offset,
  };
}

// ---------------------------------------------------------------------------------------------
// Bulk invitations
// ---------------------------------------------------------------------------------------------

/**
 * The cap on one batch. Refused past it rather than truncated — see the header.
 * Fifty is a class, a team and a playtest group; a thousand is a spam run.
 */
export const BULK_INVITE_MAX = 50;

export interface BulkInviteRow {
  userId: string;
  role: CollabRole;
  expiresAt: string | null;
}

export interface BulkInviteRejection {
  /** The index IN THE REQUEST, so the caller can point at the row they typed. */
  index: number;
  userId: string | null;
  error: 'bad_row' | 'bad_user' | 'unknown_role' | 'owner_is_not_a_member' | 'duplicate' | 'bad_expiry';
}

export type BulkInvitePlan =
  | { ok: false; error: 'bad_body' | 'no_members' | 'too_many'; max?: number }
  | { ok: true; accepted: BulkInviteRow[]; rejected: BulkInviteRejection[] };

export function planBulkInvite(body: unknown, ctx: { ownerId: unknown; actorId?: unknown }): BulkInvitePlan {
  const members = (body as { members?: unknown } | null)?.members;
  if (!Array.isArray(members)) return { ok: false, error: 'bad_body' };
  if (members.length === 0) return { ok: false, error: 'no_members' };
  // WHOLE, NOT TRUNCATED. See the header.
  if (members.length > BULK_INVITE_MAX) return { ok: false, error: 'too_many', max: BULK_INVITE_MAX };

  const ownerId = str(ctx?.ownerId);
  const accepted: BulkInviteRow[] = [];
  const rejected: BulkInviteRejection[] = [];
  const taken = new Set<string>();

  members.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return void rejected.push({ index, userId: null, error: 'bad_row' });
    const m = raw as Record<string, unknown>;
    const userId = typeof m.userId === 'string' ? m.userId.trim() : '';
    if (!UUID_RE.test(userId)) return void rejected.push({ index, userId: null, error: 'bad_user' });
    const role = asCollabRole(m.role);
    if (role === null || !(GRANTABLE_ROLES as readonly string[]).includes(role)) {
      return void rejected.push({ index, userId, error: 'unknown_role' });
    }
    if (ownerId !== null && userId === ownerId) return void rejected.push({ index, userId, error: 'owner_is_not_a_member' });
    // Only an ACCEPTED row takes the name: a row refused for a bad expiry must not stop the
    // caller correcting it later in the same batch.
    if (taken.has(userId)) return void rejected.push({ index, userId, error: 'duplicate' });

    let expiresAt: string | null = null;
    if (m.expiresAt !== undefined && m.expiresAt !== null && m.expiresAt !== '') {
      // An expiry `classifyGrant` cannot read makes the grant DEAD. Refuse it here rather than
      // write an invitation that can never open anything.
      if (typeof m.expiresAt !== 'string' || !Number.isFinite(Date.parse(m.expiresAt))) {
        return void rejected.push({ index, userId, error: 'bad_expiry' });
      }
      expiresAt = m.expiresAt;
    }
    taken.add(userId);
    accepted.push({ userId, role, expiresAt });
  });

  return { ok: true, accepted, rejected };
}

// ---------------------------------------------------------------------------------------------
// The event log
// ---------------------------------------------------------------------------------------------

/**
 * What can happen to a membership. `renewed` is a real event and not a no-op: re-inviting someone
 * at the role they already hold extends or replaces the grant, and an audit reader needs to know
 * somebody did that.
 */
export const MEMBERSHIP_EVENT_KINDS = [
  'invited',
  'role_changed',
  'renewed',
  'reactivated',
  'suspended',
  'removed',
  'link_accepted',
] as const;
export type MembershipEventKind = (typeof MEMBERSHIP_EVENT_KINDS)[number];

export const EVENT_REASON_MAX = 500;

export interface MembershipEventRow {
  project_id: string;
  kind: MembershipEventKind;
  subject_id: string;
  actor_id: string;
  from_role: CollabRole | null;
  to_role: CollabRole | null;
  reason: string | null;
  via_token: string | null;
  created_at: string;
}

export interface MembershipEventInput {
  projectId: unknown;
  kind: unknown;
  subjectId: unknown;
  actorId: unknown;
  fromRole?: unknown;
  toRole?: unknown;
  reason?: unknown;
  viaToken?: unknown;
  at: unknown;
}

/**
 * The row to append, or null.
 *
 * NULL RATHER THAN A PARTIAL ROW. An event with no subject, or naming a role that is not a role,
 * is a line in an append-only table that nobody can correct and no reader can interpret. The
 * caller reports that the change was not audited — which is a true sentence — instead of writing
 * a false one.
 */
export function buildMembershipEvent(input: MembershipEventInput): MembershipEventRow | null {
  const projectId = str(input?.projectId);
  const subjectId = str(input?.subjectId);
  const actorId = str(input?.actorId);
  if (projectId === null || subjectId === null || actorId === null) return null;
  if (typeof input.kind !== 'string' || !(MEMBERSHIP_EVENT_KINDS as readonly string[]).includes(input.kind)) return null;

  // GRANTABLE, not merely a role. A membership row can never say `owner`, so an event claiming a
  // membership moved to or from `owner` describes something that cannot have happened — and the
  // CHECK constraint in migration 0006 would refuse the row anyway. Refused here, where the caller
  // can report that the change was not audited, rather than at the database with a 400 nobody reads.
  const optionalRole = (v: unknown): CollabRole | null | 'bad' => {
    if (v === undefined || v === null || v === '') return null;
    const r = asCollabRole(v);
    return r === null || !(GRANTABLE_ROLES as readonly string[]).includes(r) ? 'bad' : r;
  };
  const fromRole = optionalRole(input.fromRole);
  const toRole = optionalRole(input.toRole);
  if (fromRole === 'bad' || toRole === 'bad') return null;

  const at = typeof input.at === 'string' && Number.isFinite(Date.parse(input.at)) ? input.at : null;
  if (at === null) return null;

  let reason: string | null = null;
  if (typeof input.reason === 'string') {
    const trimmed = input.reason.trim().slice(0, EVENT_REASON_MAX);
    reason = trimmed.length === 0 ? null : trimmed;
  }

  return {
    project_id: projectId,
    kind: input.kind as MembershipEventKind,
    subject_id: subjectId,
    actor_id: actorId,
    from_role: fromRole,
    to_role: toRole,
    reason,
    via_token: str(input.viaToken),
    created_at: at,
  };
}

/**
 * What an invitation write actually DID, decided from the row that was there before it.
 *
 * The route cannot name its own event: `POST /members` is invitation, promotion, demotion and
 * reinstatement depending entirely on what it lands on, and an audit log that records the ROUTE
 * rather than the CHANGE says "invited" for a demotion.
 */
export function inviteEventKind(before: unknown, after: { role?: unknown }): MembershipEventKind {
  if (!before || typeof before !== 'object') return 'invited';
  const b = before as Record<string, unknown>;
  const wasDead = (b.revoked_at !== undefined && b.revoked_at !== null) || (b.suspended_at !== undefined && b.suspended_at !== null);
  if (wasDead) return 'reactivated';
  return asCollabRole(b.role) !== asCollabRole(after?.role) ? 'role_changed' : 'renewed';
}

/** Every role a member list can display, for a client that builds a filter menu honestly. */
export const ROSTER_ROLES = COLLAB_ROLES;
