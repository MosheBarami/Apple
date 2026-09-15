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
