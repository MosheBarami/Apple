/**
 * WHO ELSE IS HERE, AS THE TOPBAR SHOWS IT.
 *
 * The server already decided who is present (apps/worker/src/presence.ts) and refuses to report
 * anyone whose heartbeat it could not read. This file decides what that list LOOKS like, and it is
 * separate from the component for the usual reason: the rules below are the part that can be
 * wrong, and a rule inside JSX is a rule nothing tests.
 *
 * FOUR RULES:
 *
 * 1. YOU ARE NOT AN AVATAR. Your own face in the "who else is here" row is noise — you know you
 *    are here. But "nobody else is here" is worth saying, so the summary distinguishes an empty
 *    project from one you happen to be alone in.
 *
 * 2. A ROLE THE PRODUCT DOES NOT HAVE IS NOT RENDERED. The server sends roles from its own
 *    allowlist; a value outside it means something has gone wrong upstream, and the honest
 *    response is to omit that person rather than to draw them with a blank label. "Unknown-role
 *    Gil is editing" is a sentence the UI must never be able to produce.
 *
 * 3. INITIALS COME FROM CODE POINTS, NOT FROM `charAt`. `name[0]` splits a surrogate pair and
 *    renders half an emoji or a broken glyph, and `slice(0,2)` on a Hebrew name takes the first
 *    two letters of a right-to-left string and shows them left-to-right. One code point per word,
 *    at most two, and the fallback is derived from the user id rather than from the word
 *    "undefined".
 *
 * 4. THE OVERFLOW COUNT AND THE ROWS ADD UP. `rows.length + overflow === people shown` is the
 *    claim; a cap that drops someone without counting them is a room that looks emptier than it is.
 */

/** The wire shape, as `ServerMsg.presence` carries it. Every field is `unknown` on entry. */
export interface PresenceEntry {
  userId?: unknown;
  role?: unknown;
  displayName?: unknown;
  activity?: unknown;
  connections?: unknown;
  lastSeenMs?: unknown;
}

const ROLES = ['viewer', 'commenter', 'editor', 'admin', 'owner'] as const;
export type PresenceRole = (typeof ROLES)[number];

const ACTIVITIES = ['viewing', 'typing', 'building'] as const;
export type PresenceActivity = (typeof ACTIVITIES)[number];

/** How many faces fit before the row becomes a count. */
export const PRESENCE_VISIBLE = 4;

export interface PresenceRow {
  userId: string;
  name: string;
  initials: string;
  role: PresenceRole;
  activity: PresenceActivity;
  /** What a screen reader and a tooltip say. Never a template with a hole in it. */
  title: string;
}

export interface PresenceView {
  rows: PresenceRow[];
  /** People present but past the cap. Always the remainder, never an estimate. */
  overflow: number;
  /** The one-line summary, for the aria-label on the group. */
  summary: string;
}

const asRole = (v: unknown): PresenceRole | null =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v) ? (v as PresenceRole) : null;

const asActivity = (v: unknown): PresenceActivity =>
  typeof v === 'string' && (ACTIVITIES as readonly string[]).includes(v) ? (v as PresenceActivity) : 'viewing';

/** One code point per word, at most two. See rule 3. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  const picked = words.slice(0, 2).map((w) => [...w][0] ?? '');
  const joined = picked.join('');
  return joined.length > 0 ? joined.toUpperCase() : '?';
}

const VERB: Record<PresenceActivity, string> = {
  viewing: 'is here',
  typing: 'is typing',
  building: 'is building',
};

/**
 * Fold the wire list into what the topbar draws.
 *
 * `selfUserId` may be null — during the first render the profile is not loaded yet, and the
 * honest behaviour then is to show everyone rather than to guess which one is you.
 */
export function presenceView(
  present: readonly unknown[] | undefined,
  selfUserId: string | null,
  visible: number = PRESENCE_VISIBLE,
): PresenceView {
  const others: PresenceRow[] = [];
  let sawSelf = false;

  for (const raw of present ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as PresenceEntry;
    const role = asRole(e.role);
    if (role === null) continue; // rule 2
    if (typeof e.userId !== 'string' || e.userId.length === 0) continue;
    if (selfUserId !== null && e.userId === selfUserId) {
      sawSelf = true;
      continue; // rule 1
    }
    const named = typeof e.displayName === 'string' && e.displayName.trim().length > 0 ? e.displayName.trim() : null;
    // A user id is not a name, but it IS an identity — and it beats the string "undefined".
    const name = named ?? `Member ${e.userId.slice(0, 4)}`;
    const activity = asActivity(e.activity);
    others.push({ userId: e.userId, name, initials: initialsOf(name), role, activity, title: `${name} (${role}) ${VERB[activity]}` });
  }

  // Strongest activity first so the person actually changing the project is the face you see, then
  // by id so two clients with the same data draw the same row order.
  others.sort((a, b) => {
    const byActivity = ACTIVITIES.indexOf(b.activity) - ACTIVITIES.indexOf(a.activity);
    return byActivity !== 0 ? byActivity : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  const cap = Number.isFinite(visible) && visible > 0 ? Math.floor(visible) : PRESENCE_VISIBLE;
  const rows = others.slice(0, cap);
  const overflow = others.length - rows.length; // rule 4: the remainder, by construction

  const summary =
    others.length === 0
      ? sawSelf
        ? 'You are the only one here'
        : 'Nobody else is here'
      : others.length === 1
        ? `${others[0]!.name} ${VERB[others[0]!.activity]}`
        : `${others.length} other people are here`;

  return { rows, overflow, summary };
}
