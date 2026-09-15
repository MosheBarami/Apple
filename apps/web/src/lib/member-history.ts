/**
 * The membership history, and the warning that belongs to a change nobody wrote down.
 *
 * `membership_events` is append-only — no update policy and no delete policy — and every route that
 * changes a membership answers `audited`, because the change has already happened by the time the
 * append runs. A failed append must not undo the change and must not be swallowed either.
 *
 * SO THE FLAG IS READ IN BOTH DIRECTIONS, AND NEITHER IS THE OBVIOUS ONE:
 *
 *   `!res.audited` warns on an older worker that never sends the field, which trains people to
 *   dismiss the warning — and a warning people dismiss has stopped being one by the time it is
 *   true. Absent means "this deployment does not say", not "it was not recorded".
 *
 *   `res.audited === false` is the only unrecorded change. A truthy-but-not-true value is not a
 *   yes and a falsy-but-not-false value is not a no, which is the same rule lib/confirm-model.ts
 *   states for consequences we cannot read.
 */
import { ROLE_LABELS } from './capabilities.ts';

/**
 * Mirrors EVENT_REASON_MAX in apps/worker/src/membership.ts, which is also the CHECK constraint on
 * `project_members.suspended_reason`. The route truncates at it silently, so a box that accepts
 * more loses the end of what somebody wrote — usually the half that says what to do about it.
 */
export const MEMBER_REASON_MAX = 500;

export function unauditedNote(res: unknown): string | null {
  if (!res || typeof res !== 'object') return null;
  const audited = (res as { audited?: unknown }).audited;
  if (audited !== false) return null;
  return 'This change was made, but it could not be written to the membership history.';
}

/**
 * One line of the history.
 *
 * `MEMBERSHIP_EVENT_KINDS` is the worker's vocabulary and the database's CHECK constraint agrees
 * with it, so the known kinds below are not a guess. They are still not a closed set from this
 * bundle's point of view: a newer worker can write a kind this build has never heard of, and
 * running it through a lookup that returns `undefined` puts a BLANK ROW in somebody's audit trail —
 * a gap that reads as nothing having happened rather than as something we could not read. Unknown
 * kinds and unknown roles are both printed as they came.
 *
 * The reason comes back separately rather than glued into the sentence: it is the member's
 * administrator's own words, it can be five hundred characters, and it wants quoting.
 */

export interface EventLine {
  /** What happened, in one sentence. Never empty. */
  text: string;
  /** ISO timestamp, or null when the row carried none. Formatting belongs to the component. */
  at: string | null;
  /** 'history' (Postgres) or 'grant' (the KV grant a share link minted). */
  source: string;
  reason: string | null;
}

const roleName = (role: unknown): string => {
  if (typeof role !== 'string' || role.length === 0) return 'no role';
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
};

export function describeEvent(raw: unknown): EventLine {
  if (!raw || typeof raw !== 'object') {
    return { text: 'An entry in this history could not be read.', at: null, source: 'history', reason: null };
  }
  const e = raw as Record<string, unknown>;
  const kind = typeof e.kind === 'string' ? e.kind : '';
  const to = roleName(e.toRole);
  const from = roleName(e.fromRole);

  let text: string;
  switch (kind) {
    case 'invited':
      text = `Invited as ${to}.`;
      break;
    case 'role_changed':
      text = `Role changed from ${from} to ${to}.`;
      break;
    case 'renewed':
      // Not a no-op: re-inviting at the role somebody already holds extends or replaces the grant,
      // and an audit reader needs to know somebody did that.
      text = `Access renewed at ${to}.`;
      break;
    case 'reactivated':
      text = `Reinstated at ${to}.`;
      break;
    case 'suspended':
      text = 'Paused.';
      break;
    case 'removed':
      text = 'Removed from the project.';
      break;
    case 'link_accepted':
      // The route never echoes the token, and this sentence must not invent one: knowing somebody
      // came in through a link is the audit fact; the secret itself is not, and a history view is
      // a place people paste from.
      text = `Joined by share link, as ${to}.`;
      break;
    default:
      text = `An event this version does not recognise: ${kind || 'unnamed'}.`;
  }

  return {
    text,
    at: typeof e.at === 'string' && e.at.length > 0 ? e.at : null,
    source: typeof e.source === 'string' ? e.source : 'history',
    reason: typeof e.reason === 'string' && e.reason.trim().length > 0 ? e.reason : null,
  };
}

/**
 * The hole in the list, when there is one.
 *
 * The route answers `partial: true, incomplete: ['link_grants']` when the KV side could not be read
 * in full, rather than serving a short list as a whole one. A client that drops that flag undoes
 * exactly the care the route took — and a history missing the entry you are looking for, with
 * nothing saying anything is missing, is how somebody concludes an event never happened.
 */
export function historyGap(res: unknown): string | null {
  if (!res || typeof res !== 'object') return null;
  if ((res as { partial?: unknown }).partial !== true) return null;
  const incomplete = (res as { incomplete?: unknown }).incomplete;
  const what = Array.isArray(incomplete) && incomplete.includes('link_grants') ? ' Anyone who joined by share link may be missing from it.' : '';
  return `Part of this history could not be read, so it may be incomplete.${what}`;
}
