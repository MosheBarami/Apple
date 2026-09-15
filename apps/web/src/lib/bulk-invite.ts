/**
 * Turning a pasted list of user ids into a bulk invitation, and the answer back into something a
 * person can act on.
 *
 * POST /api/shared/:id/members/bulk validates every row before it writes any of them and answers
 * with a `rejected` array: `{ index, userId, error }` per refused row. That per-row answer is the
 * whole value of the route — a UI that renders "3 of 5 added" has thrown away the half that says
 * WHICH two and WHY, and left the person to find out by bisecting their own list.
 *
 * TWO THINGS THIS MODULE EXISTS TO GET RIGHT:
 *
 *   THE INDEX IS NOT THE LINE. The server answers about the array it was sent. Blank lines never
 *   leave the browser, so `index: 2` is the third row SENT and, for any list with a gap in it, not
 *   the third line on screen. Printing the index as a line number points at an innocent row and
 *   the person edits the wrong one. Every entry therefore carries both numbers from the moment it
 *   is parsed, and the mapping back is this module's job rather than the component's.
 *
 *   A REFUSAL THIS BUILD DOES NOT RECOGNISE IS STILL A REFUSAL. Running the reason code through a
 *   lookup that returns `undefined` puts a row in the rejected list with nothing beside it, which
 *   reads as a row that was accepted. An unknown code is shown as itself.
 *
 * A malformed id is deliberately NOT filtered here. The obvious client-side guard — drop anything
 * that is not a UUID before sending — deletes exactly the row the person needs to see refused, and
 * the list silently gets shorter with no explanation. The server names it; this puts the name back
 * on their line.
 */

/** Mirrors BULK_INVITE_MAX in apps/worker/src/membership.ts, and tests/bulk-invite.test.mjs holds the two together. */
export const BULK_INVITE_MAX = 50;

export interface BulkEntry {
  /** Position in the array POSTed — the number `rejected[].index` refers to. */
  index: number;
  /** 1-based line in what the person typed. The only number worth putting on screen. */
  line: number;
  userId: string;
}

export function parseBulkIds(text: unknown): BulkEntry[] {
  if (typeof text !== 'string') return [];
  const entries: BulkEntry[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const userId = lines[i]!.trim();
    if (!userId) continue;
    entries.push({ index: entries.length, line: i + 1, userId });
  }
  return entries;
}

export interface BulkProblem {
  /** Null when the answer names a row we cannot place — shown with no line, never a guessed one. */
  line: number | null;
  userId: string | null;
  message: string;
}

/** Mirrors BulkInviteRejection['error'] in apps/worker/src/membership.ts. */
const REASONS: Record<string, string> = {
  bad_row: 'That line could not be read as an invitation.',
  bad_user: 'That is not a user ID — it should look like 00000000-0000-0000-0000-000000000000.',
  unknown_role: 'That role is not one this project can grant.',
  owner_is_not_a_member: 'That is the project owner. They already have every permission.',
  duplicate: 'That ID is on the list twice. It was added once.',
  bad_expiry: 'The expiry date on that row could not be read, so the invitation would never work.',
};

export function explainRejections(rejected: unknown, entries: readonly BulkEntry[]): BulkProblem[] {
  if (!Array.isArray(rejected)) return [];
  return rejected.map((raw) => {
    const r = (raw ?? {}) as { index?: unknown; userId?: unknown; error?: unknown };
    const entry = typeof r.index === 'number' ? entries.find((e) => e.index === r.index) : undefined;
    const error = typeof r.error === 'string' ? r.error : '';
    return {
      line: entry?.line ?? null,
      userId: typeof r.userId === 'string' ? r.userId : (entry?.userId ?? null),
      // An unrecognised code is printed verbatim. See the header.
      message: REASONS[error] ?? `The server refused this row: ${error || 'no reason given'}.`,
    };
  });
}

/**
 * The refusals that land on the WHOLE batch — nothing was written and there is no per-row answer
 * to read. `too_many` carries the cap so the sentence can name the number to cut to.
 */
export function bulkRefusal(error: unknown, max?: unknown): string | null {
  if (typeof error !== 'string' || error.length === 0) return null;
  const cap = typeof max === 'number' && Number.isFinite(max) ? max : BULK_INVITE_MAX;
  if (error === 'too_many') return `That is more than ${cap} people at once. Send it in batches of ${cap} or fewer.`;
  if (error === 'no_members') return 'There is nobody on the list.';
  if (error === 'bad_body') return 'That list could not be read.';
  if (error === 'invite_failed') return 'The server could not write the invitations. Nobody was added — try again.';
  return `The server refused the whole list: ${error}.`;
}
