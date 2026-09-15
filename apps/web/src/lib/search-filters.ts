// The filters the search panel offers, and the query string they become.
//
// This module exists so the CONTRACT is testable. The panel's filter state and the worker's
// `parseSearchFilter` are two halves of one agreement about parameter names and value spellings,
// and the failure mode when they disagree is the worst one available: `?type=message` sent where
// `types=` is read is simply ignored by the server, which then returns the whole project. Nothing
// errors, nothing is empty, and the user reads a wide answer as the narrow one they asked for.
// apps/web/tests/search-filters.test.mjs holds both halves against each other for that reason.
//
// Dates are sent as epoch milliseconds for the presets and as plain `YYYY-MM-DD` for a custom
// range. The second form is deliberate: a day is a day in the user's head, and the server extends
// the end of it to the last millisecond rather than cutting at midnight.

/**
 * The shortest query worth sending.
 *
 * Mirrors MIN_QUERY in apps/worker/src/search.ts, and the test holds the two against each other. A
 * client floor BELOW the server's sends requests that are refused and renders the refusal as "no
 * results"; a floor above it silently refuses queries the server would have answered.
 */
export const MIN_QUERY = 2;

/** Mirrors SEARCH_TYPES in apps/worker/src/search.ts. */
export const SEARCH_TYPES = ['message', 'artifact', 'checkpoint', 'activity', 'memory'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Mirrors SEARCH_AUTHORS. 'system' is not offered as a choice — nothing user-visible carries it. */
export const SEARCH_AUTHORS = ['you', 'apple'] as const;
export type SearchAuthor = (typeof SEARCH_AUTHORS)[number];

export const TYPE_LABELS: Record<SearchType, string> = {
  message: 'Messages',
  artifact: 'Artifacts',
  checkpoint: 'Checkpoints',
  activity: 'Activity',
  memory: 'Memory',
};

export const AUTHOR_LABELS: Record<SearchAuthor, string> = {
  you: 'You',
  apple: 'Apple',
};

export const DATE_RANGES = ['any', 'day', 'week', 'month', 'custom'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export const RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any time',
  day: 'Past day',
  week: 'Past week',
  month: 'Past month',
  custom: 'Between…',
};

export interface PanelFilter {
  /** Empty means every type — NOT "no types", which would match nothing. */
  types: SearchType[];
  /** Empty means anyone. */
  authors: SearchAuthor[];
  range: DateRange;
  /** `YYYY-MM-DD`, used only when `range` is 'custom'. */
  from: string;
  to: string;
}

export const EMPTY_FILTER: PanelFilter = { types: [], authors: [], range: 'any', from: '', to: '' };

const DAY_MS = 86_400_000;
const RANGE_MS: Partial<Record<DateRange, number>> = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS };

/** Is anything actually narrowed? Drives the "filters on" marker, which must not lie either way. */
export function isFiltered(filter: PanelFilter): boolean {
  if (filter.types.length > 0 || filter.authors.length > 0) return true;
  if (filter.range === 'custom') return filter.from !== '' || filter.to !== '';
  return filter.range !== 'any';
}

/**
 * The query string for a search, as a list of pairs.
 *
 * An empty list is OMITTED rather than sent empty: `types=` reads to the server as "no preference",
 * which is right, but sending it invites the next reader to believe an empty selection means
 * "nothing", and those two readings differ by an entire result set.
 */
export function searchParams(filter: PanelFilter, q: string, now: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set('q', q);
  if (filter.types.length) params.set('types', filter.types.join(','));
  if (filter.authors.length) params.set('authors', filter.authors.join(','));
  if (filter.range === 'custom') {
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
  } else {
    const span = RANGE_MS[filter.range];
    if (span !== undefined) params.set('from', String(now - span));
  }
  return params;
}

/** Add or remove one type, never producing the "selected nothing" state that matches nothing. */
export function toggleType(filter: PanelFilter, type: SearchType): PanelFilter {
  const on = filter.types.includes(type);
  return { ...filter, types: on ? filter.types.filter((t) => t !== type) : [...filter.types, type] };
}

export function toggleAuthor(filter: PanelFilter, author: SearchAuthor): PanelFilter {
  const on = filter.authors.includes(author);
  return { ...filter, authors: on ? filter.authors.filter((a) => a !== author) : [...filter.authors, author] };
}

/**
 * A stored filter, validated back into one this build can actually apply.
 *
 * Anything unrecognised is DROPPED rather than kept: a type that no longer exists would be sent to
 * the server, reported in `ignored`, and turn every search from that browser into a refusal the
 * user cannot explain because they never chose it.
 */
export function normaliseFilter(raw: unknown): PanelFilter {
  if (!raw || typeof raw !== 'object') return EMPTY_FILTER;
  const r = raw as Record<string, unknown>;
  const types = Array.isArray(r.types)
    ? (r.types.filter((t): t is SearchType => (SEARCH_TYPES as readonly unknown[]).includes(t)) as SearchType[])
    : [];
  const authors = Array.isArray(r.authors)
    ? (r.authors.filter((a): a is SearchAuthor => (SEARCH_AUTHORS as readonly unknown[]).includes(a)) as SearchAuthor[])
    : [];
  const range = (DATE_RANGES as readonly unknown[]).includes(r.range) ? (r.range as DateRange) : 'any';
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return { types, authors, range, from: day(r.from), to: day(r.to) };
}
