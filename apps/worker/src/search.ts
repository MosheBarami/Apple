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

// ===========================================================================================
// WHAT A PROJECT CONTAINS, NOT JUST WHAT WAS SAID IN IT.
//
// The search above answers "where was this phrase said". Everything below answers the question
// users actually arrive with — "where is that thing" — over the four other kinds of record a
// project holds: the checkpoints it can be rolled back to, the artifacts the agent produced, the
// operations that were run against Studio, and what Apple remembers.
//
// Three decisions here are the ones that would quietly ruin it:
//
//   1. ORDER BY RELEVANCE, NOT BY TIME. `order by created_at desc limit 40` answers a different
//      question than the one asked: it returns the forty most RECENT matches and calls them the
//      results, so the message that is entirely about doors loses to a message from this morning
//      that mentions a door in passing. Recency is a TIEBREAK here and never the sort key.
//
//   2. A FILTER THAT IS NOT UNDERSTOOD IS REPORTED, NEVER DROPPED. `?type=mesages` must not
//      quietly search everything: a widened result set is indistinguishable from an answer, and
//      the user reads it as one. Unparsed values come back in `ignored`, and a filter combination
//      that can match nothing says `impossible` rather than returning the whole project.
//
//   3. THE PURE FUNCTION OWNS THE DEFINITION OF A MATCH. `runSearch` re-applies every filter it
//      is given, so the SQL that narrows the rows on the way in is an optimisation and never the
//      specification. Where the two could disagree — and they can, because SQLite's LIKE folds
//      case for ASCII only — the JS answer is the one that ships.
// ===========================================================================================

/** The kinds of record a project search can return. */
export const SEARCH_TYPES = ['message', 'artifact', 'checkpoint', 'activity', 'memory'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * Who a record came from.
 *
 * Deliberately not the raw message role: the UI has always said "You" and "Apple", and a filter
 * whose values do not match the words on screen is a filter nobody can use.
 *
 * `teammate` exists because there WAS no true value for it, and the absence produced a lie rather
 * than a gap: a checkpoint with no author column was attributed by kind, so on a shared project
 * every other member's manual checkpoint came back as 'you'. It is not offered as a filter chip —
 * only checkpoints can carry it today, since messages still store a role and not a user id, and a
 * chip that matches one record type reads as broken. It is included in the default set, so nothing
 * carrying it is hidden.
 */
export const SEARCH_AUTHORS = ['you', 'apple', 'system', 'teammate'] as const;
export type SearchAuthor = (typeof SEARCH_AUTHORS)[number];

const AUTHOR_ALIASES: Record<string, SearchAuthor> = {
  teammate: 'teammate',
  member: 'teammate',
  you: 'you',
  user: 'you',
  me: 'you',
  apple: 'apple',
  assistant: 'apple',
  system: 'system',
};

/**
 * WHO TOOK A CHECKPOINT, on the author dimension.
 *
 * Three facts, in this order, because each is stronger than the one after it:
 *
 *   an `auto` or `pre_agent` checkpoint was taken BY THE RUN. It has no human author and never
 *   should be given one, whatever is in the column;
 *   a recorded author that matches the reader is 'you';
 *   anything else — another member, or a row from before the column existed — is not the reader.
 *
 * Exported so it can be tested as itself, and so the one rule lives in one place: the guess it
 * replaced (`kind === 'manual' ? 'you' : 'apple'`) was inline, which is how it survived review.
 */
export function checkpointAuthor(kind: string, authorId: string | null, viewer: string | null): SearchAuthor {
  if (kind !== 'manual') return 'apple';
  if (authorId !== null && viewer !== null && authorId === viewer) return 'you';
  return 'teammate';
}

/** A message role as stored, mapped onto the author dimension the UI names. */
export function authorForRole(role: string): SearchAuthor {
  if (role === 'user') return 'you';
  if (role === 'assistant') return 'apple';
  return 'system';
}

export interface SearchRecord {
  /** Unique within its type. */
  id: string;
  type: SearchType;
  author: SearchAuthor;
  /** A checkpoint's label, a tool's name — what the record is CALLED, where it has a name. */
  title: string | null;
  /** The text the query is matched against. */
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Where the workspace should go when this hit is chosen, when that is a message. */
  messageId?: string;
}

export interface SearchFilter {
  q: string;
  limit: number;
  /** Never empty unless `impossible` — an unfiltered search carries every type. */
  types: SearchType[];
  authors: SearchAuthor[];
  /** Epoch ms, inclusive, or null for no bound. */
  from: number | null;
  /** Epoch ms, inclusive, or null for no bound. */
  to: number | null;
  /**
   * Filter values that could not be understood, as `name:value`.
   *
   * Reported rather than dropped: a dropped filter widens the result set, and a widened result
   * set is read as an answer to the narrower question that was actually asked.
   */
  ignored: string[];
  /** True when the filters as given can match nothing, so returning everything would be a lie. */
  impossible: boolean;
}

export const DEFAULT_SEARCH_LIMIT = 40;
export const MAX_SEARCH_LIMIT = 100;

/** The window a date filter may name. Outside it, the value is far likelier to be a mistake. */
const EARLIEST = Date.UTC(2000, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);
const DAY_MS = 86_400_000;

/**
 * One end of a date filter, as epoch milliseconds, or null when it was not understood.
 *
 * A bare `YYYY-MM-DD` names a DAY, and the two ends of a day are not the same instant. `to=2026-09-15`
 * parsed as midnight excludes everything that happened on the fifteenth — the off-by-one-day that
 * makes a date filter look like it works until someone searches for something they did today.
 *
 * Epoch values are accepted in milliseconds only, and a number outside [2000, 2100) is refused
 * rather than coerced: seconds passed as milliseconds land in 1970, which silently means "no lower
 * bound" — the same failure as dropping the filter, wearing the costume of having applied it.
 */
export function parseSearchDate(raw: string, edge: 'from' | 'to'): number | null {
  const s = raw.trim();
  if (!s) return null;
  let ms: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const midnight = Date.parse(`${s}T00:00:00.000Z`);
    if (!Number.isFinite(midnight)) return null;
    ms = edge === 'to' ? midnight + DAY_MS - 1 : midnight;
  } else if (/^\d+$/.test(s)) {
    ms = Number(s);
  } else {
    ms = Date.parse(s);
  }
  if (!Number.isFinite(ms) || ms < EARLIEST || ms >= LATEST) return null;
  return ms;
}

function parseList<T extends string>(
  raw: string | null,
  resolve: (value: string) => T | null,
  all: readonly T[],
  name: string,
  ignored: string[],
): { values: T[]; narrowed: boolean } {
  if (raw === null) return { values: [...all], narrowed: false };
  const parts = raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return { values: [...all], narrowed: false };
  const out: T[] = [];
  for (const part of parts) {
    const value = resolve(part);
    if (value === null) ignored.push(`${name}:${part}`);
    else if (!out.includes(value)) out.push(value);
  }
  return { values: out, narrowed: true };
}

/** Read the filters off a query string, reporting everything it could not use. */
export function parseSearchFilter(params: URLSearchParams): SearchFilter {
  const ignored: string[] = [];
  const q = (params.get('q') ?? '').trim();

  const types = parseList<SearchType>(
    params.get('types') ?? params.get('type'),
    (v) => (SEARCH_TYPES as readonly string[]).includes(v) ? (v as SearchType) : null,
    SEARCH_TYPES,
    'type',
    ignored,
  );
  const authors = parseList<SearchAuthor>(
    params.get('authors') ?? params.get('author'),
    (v) => AUTHOR_ALIASES[v] ?? null,
    SEARCH_AUTHORS,
    'author',
    ignored,
  );

  let from: number | null = null;
  let to: number | null = null;
  let lostDate = false;
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  if (rawFrom !== null && rawFrom.trim()) {
    from = parseSearchDate(rawFrom, 'from');
    if (from === null) {
      ignored.push(`from:${rawFrom.trim()}`);
      lostDate = true;
    }
  }
  if (rawTo !== null && rawTo.trim()) {
    to = parseSearchDate(rawTo, 'to');
    if (to === null) {
      ignored.push(`to:${rawTo.trim()}`);
      lostDate = true;
    }
  }

  let limit = DEFAULT_SEARCH_LIMIT;
  const rawLimit = params.get('limit');
  if (rawLimit !== null && rawLimit.trim()) {
    const n = Number(rawLimit);
    if (!Number.isFinite(n) || n < 1) ignored.push(`limit:${rawLimit.trim()}`);
    else limit = Math.min(MAX_SEARCH_LIMIT, Math.floor(n));
  }

  // A narrowing that survived nothing, or a window that closes before it opens, matches nothing.
  // Saying so is the whole point: the alternative is a full result set that looks like an answer.
  //
  // A date that could not be read counts as impossible rather than as absent. A type list can be
  // applied in part — one of the two values was understood, and searching those is what was asked
  // for. A bound cannot: `from=yesterday` dropped leaves NO lower bound, which is the widest
  // possible search wearing the costume of the narrow one the user typed.
  const impossible =
    lostDate ||
    (types.narrowed && types.values.length === 0) ||
    (authors.narrowed && authors.values.length === 0) ||
    (from !== null && to !== null && from > to);

  return { q, limit, types: types.values, authors: authors.values, from, to, ignored, impossible };
}

export interface FieldMatch {
  /** Index of the first occurrence. */
  at: number;
  occurrences: number;
  /** The match is bounded by something other than a letter or digit on both sides. */
  wholeWord: boolean;
}

const LETTER = /[\p{L}\p{N}]/u;

/** Where and how a query occurs in one field, or null if it does not. */
export function findMatch(text: string, query: string): FieldMatch | null {
  const q = query.trim();
  if (!q || !text) return null;
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  const at = hay.indexOf(needle);
  if (at < 0) return null;
  let occurrences = 0;
  for (let i = at; i >= 0; i = hay.indexOf(needle, i + needle.length)) occurrences += 1;
  const before = at === 0 ? '' : text[at - 1];
  const afterIdx = at + needle.length;
  const after = afterIdx >= text.length ? '' : text[afterIdx];
  const wholeWord = !LETTER.test(before || ' ') && !LETTER.test(after || ' ');
  return { at, occurrences, wholeWord };
}

export interface SearchHit {
  id: string;
  type: SearchType;
  author: SearchAuthor;
  title: string | null;
  createdAt: string;
  snippet: string;
  matchStart: number;
  matchLength: number;
  occurrences: number;
  /** Which field the shown snippet came from, so the UI marks the right line. */
  matchedIn: 'title' | 'body';
  /** Relevance, not recency. Exposed so a support question about ordering has an answer. */
  score: number;
  messageId?: string;
}

/**
 * How well one record answers one query, or null when it does not answer it at all.
 *
 * The weights are ordinary, and their exact values are not the contract — the ORDERING they
 * produce is, which is what the tests assert. What matters:
 *
 *   * a match on the record's NAME beats a match buried in its body, because a checkpoint called
 *     "door timing" is about doors and a message that mentions one is not;
 *   * a whole word beats a fragment, so searching `door` does not rank `doorway` above `the door`;
 *   * a short record whose text is mostly the query beats a long one that mentions it once;
 *   * and time contributes NOTHING, so a perfect match from March outranks a passing mention from
 *     this morning. That is the entire defect this replaces.
 */
export function scoreRecord(record: SearchRecord, query: string): { score: number; matchedIn: 'title' | 'body'; snippet: Snippet } | null {
  const body = findMatch(record.body, query);
  const title = record.title ? findMatch(record.title, query) : null;
  if (!body && !title) return null;

  let score = 0;
  if (body) {
    score += 1;
    if (body.wholeWord) score += 3;
    if (body.at === 0) score += 2;
    score += Math.min(body.occurrences - 1, 5) * 0.5;
    // Density: the query being most of a short record is a stronger signal than one hit in a wall
    // of text, and without it every long message outranks the one-line answer the user wants.
    score += 2 * Math.min(1, query.trim().length / Math.max(record.body.length, 1));
  }
  if (title) {
    score += 4;
    if (title.wholeWord) score += 2;
    if (title.at === 0) score += 1;
  }

  const matchedIn: 'title' | 'body' = body ? 'body' : 'title';
  const source = matchedIn === 'body' ? record.body : (record.title as string);
  const snippet = snippetAround(source, query) ?? {
    text: source.slice(0, 160),
    matchStart: 0,
    matchLength: 0,
    occurrences: 0,
  };
  return { score, matchedIn, snippet };
}

/** Does this record survive the non-text filters? */
export function withinFilter(record: SearchRecord, filter: SearchFilter, ignoreType = false): boolean {
  if (!ignoreType && !filter.types.includes(record.type)) return false;
  if (!filter.authors.includes(record.author)) return false;
  if (filter.from !== null && record.createdAt < filter.from) return false;
  if (filter.to !== null && record.createdAt > filter.to) return false;
  return true;
}

export interface SearchOutcome {
  results: SearchHit[];
  /**
   * How many matched PER TYPE with every filter except the type filter applied.
   *
   * Deliberately not narrowed by the type filter: counts that collapse to the selected type make
   * choosing a facet a one-way door, because the other facets then read as empty.
   */
  counts: Record<SearchType, number>;
  /** How many matched under the full filter, before the cap. */
  total: number;
  /** True when the cap cut the list — there are more matches than these. */
  more: boolean;
}

/** A count for every type, all zero — so a caller never has to invent one. */
export function zeroCounts(): Record<SearchType, number> {
  const out = {} as Record<SearchType, number>;
  for (const t of SEARCH_TYPES) out[t] = 0;
  return out;
}

/**
 * Rank and cut. The only definition of a result in this codebase.
 *
 * Filters are re-applied here even though the caller narrowed its rows, so a row handed over by
 * mistake cannot appear in an answer: the SQL is allowed to be an approximation, and this is not.
 */
export function runSearch(records: Iterable<SearchRecord>, filter: SearchFilter): SearchOutcome {
  const counts = zeroCounts();
  if (filter.impossible || !isSearchable(filter.q)) {
    return { results: [], counts, total: 0, more: false };
  }
  const scored: { hit: SearchHit; createdAt: number }[] = [];
  for (const record of records) {
    if (!withinFilter(record, filter, true)) continue;
    const s = scoreRecord(record, filter.q);
    if (!s) continue;
    counts[record.type] += 1;
    if (!filter.types.includes(record.type)) continue;
    scored.push({
      createdAt: record.createdAt,
      hit: {
        id: record.id,
        type: record.type,
        author: record.author,
        title: record.title,
        createdAt: new Date(record.createdAt).toISOString(),
        snippet: s.snippet.text,
        matchStart: s.snippet.matchStart,
        matchLength: s.snippet.matchLength,
        occurrences: s.snippet.occurrences,
        matchedIn: s.matchedIn,
        score: Math.round(s.score * 1000) / 1000,
        ...(record.messageId ? { messageId: record.messageId } : {}),
      },
    });
  }

  // Relevance first; time only breaks ties; id breaks the tie time cannot, so the same query twice
  // returns the same order rather than whatever the row order happened to be.
  scored.sort(
    (a, b) =>
      b.hit.score - a.hit.score ||
      b.createdAt - a.createdAt ||
      (a.hit.id < b.hit.id ? -1 : a.hit.id > b.hit.id ? 1 : 0),
  );

  const total = scored.length;
  const results = scored.slice(0, filter.limit).map((s) => s.hit);
  return { results, counts, total, more: total > results.length };
}

/**
 * May a SQL `LIKE` be used to narrow the rows before `runSearch` sees them?
 *
 * SQLite's LIKE folds case for ASCII and for nothing else. For an ASCII query that is exactly the
 * relation `findMatch` uses, so the prefilter is a proven superset of the matches. For a query
 * with no case to fold — Hebrew, which this product is used in, and every other caseless script —
 * exact matching is the same relation again. For anything else (`Дверь`) the prefilter would drop
 * rows the matcher would have accepted, and a search that silently misses is worse than a slow one.
 */
export function likePrefilterable(query: string): boolean {
  for (const ch of query) {
    if (ch.charCodeAt(0) < 128) continue;
    if (ch.toLowerCase() !== ch || ch.toUpperCase() !== ch) return false;
  }
  return true;
}

export interface Narrowing {
  /** A complete `where …` clause, or the empty string when nothing narrows. */
  where: string;
  /** One value per `?` in `where`, in order. */
  args: (string | number)[];
}

/**
 * The SQL narrowing for one table: the date window, any fixed clauses, and the LIKE prefilter.
 *
 * This exists so the invariant that actually breaks searches can be TESTED: a `?` without an
 * argument, or an argument without a `?`, does not fail loudly in SQLite — it binds the wrong
 * value to the wrong column and returns a plausible, wrong result set. Assembling both halves in
 * one place is what makes "one arg per placeholder" checkable instead of reviewable.
 *
 * `require` clauses are static by contract. One carrying a `?` would silently shift every later
 * binding by one, so it throws here rather than returning rows about the wrong thing.
 */
export function narrowing(filter: SearchFilter, opts: { columns?: string[]; require?: string[] } = {}): Narrowing {
  const clauses: string[] = [];
  const args: (string | number)[] = [];

  if (filter.from !== null) {
    clauses.push('created_at >= ?');
    args.push(filter.from);
  }
  if (filter.to !== null) {
    clauses.push('created_at <= ?');
    args.push(filter.to);
  }
  for (const req of opts.require ?? []) {
    if (req.includes('?')) throw new Error(`a required clause must not bind: ${req}`);
    clauses.push(req);
  }

  const columns = opts.columns ?? [];
  if (columns.length && likePrefilterable(filter.q)) {
    const pattern = `%${escapeLike(filter.q)}%`;
    const ors = columns.map((c) => `${c} like ? escape '\\'`);
    clauses.push(ors.length === 1 ? (ors[0] as string) : `(${ors.join(' or ')})`);
    for (const _ of columns) args.push(pattern);
  }

  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', args };
}
