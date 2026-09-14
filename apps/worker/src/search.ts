// Finding a phrase in a conversation.
//
// Two things here are easy to get wrong in ways nobody notices until a user does.
//
// THE ESCAPE. The query goes into a SQL `LIKE`, where `%` and `_` are wildcards. Unescaped, a user
// searching for a literal `%` matches every message, and searching `a_b` matches `axb`. Worse,
// `%%%` scans the whole transcript for nothing. Escaping is not a security fix here — the value is
// still bound, never interpolated — it is a correctness fix: LIKE's wildcards are not the user's.
//
// THE SNIPPET. A result that shows the first 120 characters of a message is useless when the match
// is 4,000 characters in: the user sees a result list where nothing visibly matches what they
// typed. The snippet has to be a window around the HIT.

/** Wildcards in a LIKE pattern belong to SQL, not to whoever typed the query. */
export function escapeLike(query: string, escape = '\\'): string {
  return query.replace(/[\\%_]/g, (c) => escape + c);
}

export interface Snippet {
  /** Text around the first match, with ellipses where it was cut. */
  text: string;
  /** Where the match starts inside `text`, so the UI can mark it without searching again. */
  matchStart: number;
  matchLength: number;
  /** How many times the query occurs in the whole message. */
  occurrences: number;
}

const ELLIPSIS = '…';

/**
 * A window of `content` around the first occurrence of `query`.
 *
 * Cuts on a word boundary where one is nearby, because a snippet that starts mid-word reads as
 * corruption rather than as an excerpt — but only where one is nearby, since forcing it would
 * either push the match out of view or do nothing at all in a language this does not tokenise.
 */
export function snippetAround(content: string, query: string, radius = 80): Snippet | null {
  const q = query.trim();
  if (!q) return null;

  const hay = content.toLowerCase();
  const needle = q.toLowerCase();
  const at = hay.indexOf(needle);
  if (at < 0) return null;

  let occurrences = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) occurrences += 1;

  let from = Math.max(0, at - radius);
  let to = Math.min(content.length, at + needle.length + radius);

  // Nudge to a word boundary, but never past the match itself.
  if (from > 0) {
    const space = content.indexOf(' ', from);
    if (space >= 0 && space < at) from = space + 1;
  }
  if (to < content.length) {
    const space = content.lastIndexOf(' ', to);
    if (space > at + needle.length) to = space;
  }

  const head = from > 0 ? ELLIPSIS : '';
  const tail = to < content.length ? ELLIPSIS : '';
  return {
    text: head + content.slice(from, to) + tail,
    matchStart: head.length + (at - from),
    matchLength: needle.length,
    occurrences,
  };
}

/**
 * Is this query worth running?
 *
 * One character matches most of a transcript, which is not a search result — it is a slow way to
 * render the whole conversation. Two is the floor, and the UI says so rather than returning
 * everything and letting the user wonder why.
 */
export const MIN_QUERY = 2;
export const MAX_QUERY = 200;

export function isSearchable(query: string): boolean {
  const q = query.trim();
  return q.length >= MIN_QUERY && q.length <= MAX_QUERY;
}
