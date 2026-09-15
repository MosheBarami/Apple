/**
 * A RUN OUTLIVES THE REQUEST THAT STARTED IT — so who is allowed to run it has to be re-asked.
 *
 * Every access check in this product happens on the way IN. `sharedAccess` resolves the caller's
 * grant, the socket handshake stamps the decided role onto the connection, and from that moment
 * the agent loop is alarm-driven: `alarm()` reads the stored run and takes the next step, for
 * minutes, with nothing left of the request that authorised it. Revoke that member's grant while a
 * build is running and every subsequent step still runs — spending the owner's Credits and mutating
 * the owner's place on behalf of somebody who was removed from the project an hour ago.
 *
 * The obvious fix — re-query Postgres from the alarm — cannot be written honestly: the Durable
 * Object holds no JWT for that member (and must not: a stored bearer credential outliving the
 * session is a worse bug than the one being fixed), and RLS answers questions only for the person
 * asking. So the signal is PUSHED. The route that ends a membership already holds the project's DO
 * stub, and it tells the object.
 *
 * WHY ITS OWN KEY, AND NOT A FIELD ON THE RUN. Exactly the reason `stop-signal.ts` gives at
 * length: the run holds its own copy of the `agent` blob for the whole length of a step and writes
 * it back at the tail, so anything else that writes that blob concurrently is racing the step. The
 * revocation arrives on an unrelated request, concurrently, by definition. One key, written by the
 * removal path, read by the run.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *   - It never stops a run the OWNER started. Ownership is the `projects.owner_id` column; no
 *     membership write can move it, so no membership event may halt the owner's own build.
 *   - It never stops a run whose initiator it cannot identify. A run persisted by an older deploy
 *     has no initiator recorded, and "I cannot tell who started this" must not render as "the
 *     person who started this was removed" — that is F-58, pointed at the destructive direction.
 *   - It never stops a run on somebody ELSE's revocation. A mark names a user; a run names its
 *     initiator; they have to be the same person.
 */

/** The revocation marks, by user id. Its own key — see the header. */
export const ACCESS_REVOKED_KEY = 'accessRevoked';

/** The slice of Durable Object storage this needs, narrow enough for a Map to satisfy. */
export interface RunAccessStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<boolean>;
}

export const REVOCATION_REASONS = ['removed', 'suspended'] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number];

export interface RevocationMark {
  userId: string;
  reason: RevocationReason;
  at: number;
}

type MarkTable = Record<string, RevocationMark>;

function asMark(value: unknown): RevocationMark | null {
  if (!value || typeof value !== 'object') return null;
  const m = value as Record<string, unknown>;
  const userId = typeof m.userId === 'string' && m.userId.trim().length > 0 ? m.userId : null;
  const reason = typeof m.reason === 'string' && (REVOCATION_REASONS as readonly string[]).includes(m.reason)
    ? (m.reason as RevocationReason)
    : null;
  const at = typeof m.at === 'number' && Number.isFinite(m.at) ? m.at : null;
  if (userId === null || reason === null || at === null) return null;
  return { userId, reason, at };
}

async function readTable(storage: RunAccessStorage): Promise<MarkTable> {
  const raw = await storage.get<unknown>(ACCESS_REVOKED_KEY);
  if (!raw || typeof raw !== 'object') return {};
  const out: MarkTable = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const mark = asMark(value);
    // A row we cannot read is dropped rather than half-trusted: a mark with no reason cannot
    // produce a message, and a mark with no user cannot be matched to a run.
    if (mark !== null && mark.userId === key) out[key] = mark;
  }
  return out;
}

/**
 * Record that this person's access to this project has ended.
 *
 * Kept as a table rather than a single value because a project can lose two members in a minute
 * and the second must not erase the first — the run that is currently going might have been
 * started by either of them.
 */
export async function markAccessRevoked(storage: RunAccessStorage, mark: RevocationMark): Promise<boolean> {
  const clean = asMark(mark);
  if (clean === null) return false;
  const table = await readTable(storage);
  table[clean.userId] = clean;
  await storage.put(ACCESS_REVOKED_KEY, table);
  return true;
}

/** The mark against this person, or null. */
export async function accessRevokedFor(storage: RunAccessStorage, userId: unknown): Promise<RevocationMark | null> {
  if (typeof userId !== 'string' || userId.trim().length === 0) return null;
  const table = await readTable(storage);
  return table[userId] ?? null;
}

/** Lift the mark — reinstatement. Answers whether there was one. */
export async function clearAccessRevoked(storage: RunAccessStorage, userId: unknown): Promise<boolean> {
  if (typeof userId !== 'string' || userId.trim().length === 0) return false;
  const table = await readTable(storage);
  if (!(userId in table)) return false;
  delete table[userId];
  await storage.put(ACCESS_REVOKED_KEY, table);
  return true;
}

export interface RunIdentity {
  /** Who pressed send. Absent on a run persisted before this field existed. */
  initiatedBy?: unknown;
  /** The project's owner, from the Durable Object's binding — never from the wire. */
  ownerId?: unknown;
  /** When the initiator's grant runs out, if it does. ISO string or epoch ms. */
  initiatorExpiresAt?: unknown;
}

export type RunStopReason = 'membership_revoked' | 'membership_suspended' | 'grant_expired';

export interface RunAccessVerdict {
  stop: boolean;
  /** Why it stopped, or why it did not — the second is as informative as the first. */
  why: RunStopReason | 'ok' | 'owner' | 'unknown_initiator' | 'not_this_run';
  /** A sentence for the person watching the build stop. Empty when nothing stopped. */
  message: string;
  /**
   * Whether the expiry could be evaluated at all. A clock that is not a finite number cannot
   * decide an expiry, and "could not evaluate" must never be reported as "has not expired".
   */
  expiryEvaluated: boolean;
}

const KEEP = (why: RunAccessVerdict['why'], expiryEvaluated: boolean): RunAccessVerdict => ({
  stop: false,
  why,
  message: '',
  expiryEvaluated,
});

/**
 * May this run take another step?
 *
 * Pure, and called with the mark the storage already produced, so the decision can be fed the
 * inputs that must NOT stop a run as easily as the ones that must.
 */
export function runMustStop(run: RunIdentity, mark: RevocationMark | null, nowMs: number): RunAccessVerdict {
  const clock = Number.isFinite(nowMs);
  const initiatedBy = typeof run?.initiatedBy === 'string' && run.initiatedBy.trim().length > 0 ? run.initiatedBy : null;
  const ownerId = typeof run?.ownerId === 'string' && run.ownerId.trim().length > 0 ? run.ownerId : null;

  // Ownership is not revocable, so nothing here may stop the owner's own run.
  if (initiatedBy !== null && ownerId !== null && initiatedBy === ownerId) return KEEP('owner', clock);
  // Cannot tell who started it ⇒ cannot tell that they were removed. See the header.
  if (initiatedBy === null) return KEEP('unknown_initiator', clock);

  const against = asMark(mark);
  if (against !== null && against.userId !== initiatedBy) {
    // A mark about somebody else is not about this run.
    return KEEP('not_this_run', clock);
  }
  if (against !== null) {
    return against.reason === 'suspended'
      ? {
          stop: true,
          why: 'membership_suspended',
          message: 'This build stopped: the member who started it has been suspended from the project.',
          expiryEvaluated: clock,
        }
      : {
          stop: true,
          why: 'membership_revoked',
          message: 'This build stopped: the member who started it was removed from the project.',
          expiryEvaluated: clock,
        };
  }

  // The expiry nobody pushes. A grant that simply ran out mid-run produces no request and
  // therefore no mark, so the run carries the instant with it.
  const raw = run?.initiatorExpiresAt;
  if (raw === undefined || raw === null || raw === '') return KEEP('ok', clock);
  if (!clock) return KEEP('ok', false); // cannot evaluate ⇒ reported, not guessed
  const at = typeof raw === 'number' ? (Number.isFinite(raw) ? raw : null) : typeof raw === 'string' ? (Number.isFinite(Date.parse(raw)) ? Date.parse(raw) : null) : null;
  // PRESENT BUT UNREADABLE IS DEAD, NOT ETERNAL — the same direction `classifyGrant` fails in,
  // and for the same reason: the alternative is a corrupt value granting an unbounded run.
  if (at === null || at <= nowMs) {
    return {
      stop: true,
      why: 'grant_expired',
      message: 'This build stopped: the access of the member who started it has expired.',
      expiryEvaluated: true,
    };
  }
  return KEEP('ok', true);
}
