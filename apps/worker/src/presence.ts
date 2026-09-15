/**
 * WHO IS IN THIS PROJECT RIGHT NOW.
 *
 * Presence is the one collaboration feature whose whole job is a `>` against a timestamp, which
 * makes it the exact shape this repository has been burned by: a heartbeat that cannot be read as
 * a number must render as GONE, never as present, because "I could not tell when you were last
 * seen" and "you are here" are different facts and only one of them belongs on another person's
 * screen next to an avatar.
 *
 *     now - NaN <= ttl        →  false
 *     now - "12:01" <= ttl    →  false
 *     now - undefined <= ttl  →  false
 *
 * Those all happen to fail closed, which is luck rather than design — flip the comparison to
 * `now - lastSeen > ttl ? drop : keep` and every one of them becomes PRESENT FOREVER. So the
 * check below is explicit about what a readable heartbeat is, and everything else is counted as
 * dropped and reported, rather than being quietly absent.
 *
 * A beat from the FUTURE is dropped too. A client clock running an hour fast would otherwise pin
 * someone to the project permanently: they are never stale, because their heartbeat is always
 * newer than now.
 *
 * Nothing here decides who may BE present — the socket handshake already refused non-members
 * before a beat could exist. What this refuses is a beat that carries a role the product does not
 * have, because the role rides along to the other clients and "Unknown-role Gil is editing" is a
 * sentence the UI must never be handed.
 */
import { asCollabRole, type CollabRole } from './collab.ts';

/** How long a heartbeat is good for. The client beats on the socket ping, every ~20s. */
export const PRESENCE_TTL_MS = 45_000;

/** How far ahead of us a client clock may be before its beat is nonsense. */
export const PRESENCE_FUTURE_SKEW_MS = 60_000;

/** What someone is doing, weakest first — the order IS the aggregation rule for one user's tabs. */
export const PRESENCE_ACTIVITIES = ['viewing', 'typing', 'building'] as const;
export type PresenceActivity = (typeof PRESENCE_ACTIVITIES)[number];

export function asPresenceActivity(value: unknown): PresenceActivity | null {
  return typeof value === 'string' && (PRESENCE_ACTIVITIES as readonly string[]).includes(value)
    ? (value as PresenceActivity)
    : null;
}

/** One socket's last heartbeat. Every field is `unknown` because it comes off a socket attachment. */
export interface PresenceBeat {
  userId?: unknown;
  role?: unknown;
  connectionId?: unknown;
  lastSeenMs?: unknown;
  activity?: unknown;
  displayName?: unknown;
}

export interface PresentUser {
  userId: string;
  role: CollabRole;
  displayName: string | null;
  activity: PresenceActivity;
  /** How many tabs/sockets this person has open. Two tabs are one person, not two. */
  connections: number;
  lastSeenMs: number;
}

export interface PresenceSnapshot {
  present: PresentUser[];
  /** Beats that were not counted, and why. A zero here is a claim; these are the evidence for it. */
  dropped: { stale: number; unreadable: number };
}

const EMPTY: PresenceSnapshot = { present: [], dropped: { stale: 0, unreadable: 0 } };

/**
 * Fold a pile of heartbeats into the list of people to show.
 *
 * Deterministically ordered by userId so two clients rendering the same snapshot draw the same
 * row order, and so a test can assert on it without sorting first.
 */
export function presenceSnapshot(
  beats: readonly unknown[] | undefined,
  nowMs: number,
  ttlMs: number = PRESENCE_TTL_MS,
): PresenceSnapshot {
  // Without a readable clock nobody is present. Not "everybody", and not "the last list we had".
  if (!Number.isFinite(nowMs)) {
    return { present: [], dropped: { stale: 0, unreadable: (beats ?? []).length } };
  }
  if (!beats || beats.length === 0) return EMPTY;
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : PRESENCE_TTL_MS;

  let stale = 0;
  let unreadable = 0;
  const byUser = new Map<string, PresentUser>();

  for (const raw of beats) {
    if (!raw || typeof raw !== 'object') { unreadable += 1; continue; }
    const b = raw as PresenceBeat;

    const userId = typeof b.userId === 'string' && b.userId.trim().length > 0 ? b.userId : null;
    const role = asCollabRole(b.role);
    // A beat carrying a role the product does not have is unreadable, not a viewer: it would be
    // rendered beside this person's name.
    if (userId === null || role === null) { unreadable += 1; continue; }

    // THE GUARD THIS FILE EXISTS FOR. A heartbeat that is not a finite number is not a heartbeat.
    if (typeof b.lastSeenMs !== 'number' || !Number.isFinite(b.lastSeenMs)) { unreadable += 1; continue; }
    const lastSeenMs = b.lastSeenMs;
    if (lastSeenMs > nowMs + PRESENCE_FUTURE_SKEW_MS) { unreadable += 1; continue; }
    if (nowMs - lastSeenMs > ttl) { stale += 1; continue; }

    const activity = asPresenceActivity(b.activity) ?? 'viewing';
    const displayName = typeof b.displayName === 'string' && b.displayName.trim().length > 0 ? b.displayName : null;

    const existing = byUser.get(userId);
    if (!existing) {
      byUser.set(userId, { userId, role, displayName, activity, connections: 1, lastSeenMs });
      continue;
    }
    // One person, several tabs: the freshest beat and the strongest activity win.
    existing.connections += 1;
    if (lastSeenMs > existing.lastSeenMs) existing.lastSeenMs = lastSeenMs;
    if (PRESENCE_ACTIVITIES.indexOf(activity) > PRESENCE_ACTIVITIES.indexOf(existing.activity)) existing.activity = activity;
    if (existing.displayName === null && displayName !== null) existing.displayName = displayName;
  }

  return {
    present: [...byUser.values()].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)),
    dropped: { stale, unreadable },
  };
}

/**
 * The beat a socket stores on itself.
 *
 * Returns null rather than a partly-filled object when the parts are not there, so an
 * unauthenticated or unreadable socket cannot write a presence record at all.
 */
export function makeBeat(input: {
  userId: unknown;
  role: unknown;
  connectionId: unknown;
  nowMs: number;
  activity?: unknown;
  displayName?: unknown;
}): (PresenceBeat & { userId: string; role: CollabRole; connectionId: string; lastSeenMs: number }) | null {
  const role = asCollabRole(input.role);
  if (role === null) return null;
  if (typeof input.userId !== 'string' || input.userId.trim().length === 0) return null;
  if (typeof input.connectionId !== 'string' || input.connectionId.trim().length === 0) return null;
  if (!Number.isFinite(input.nowMs)) return null;
  return {
    userId: input.userId,
    role,
    connectionId: input.connectionId,
    lastSeenMs: input.nowMs,
    activity: asPresenceActivity(input.activity) ?? 'viewing',
    displayName: typeof input.displayName === 'string' ? input.displayName : null,
  };
}
