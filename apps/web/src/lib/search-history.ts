// What you searched for last time.
//
// A search box that forgets is a search box you retype into. The queries worth keeping are the
// long ones — an error string, a class name, a Hebrew phrase — which are exactly the ones nobody
// wants to type twice.
//
// The rules are the ones `draft.ts` already argued for, and for the same reasons:
//
//   * PER PROJECT. A query list shared across projects shows one project's vocabulary in another,
//     which at best is noise and at worst leaks the name of something the user did elsewhere.
//   * NEVER THROWS. `localStorage` throws outright in a private window and in some webviews.
//     Losing the history is nothing; taking the search panel down with it is not.
//   * GONE AT SIGN-OUT. These are the user's own words on a device that may not be theirs — the
//     same exception drafts are, so `clearAllSearchHistory` hangs off the same SIGNED_OUT event.
//
// And one that is specific to a history rather than a draft:
//
//   * ONLY REAL SEARCHES ARE REMEMBERED. Every keystroke passes through the box, so remembering
//     what was typed rather than what was SEARCHED fills the list with "d", "do", "doo" and buries
//     the one entry that was worth keeping.

// The explicit `.ts` extension is the same device the generative-UI validator uses: it lets
// `node --test` load this module directly, so the storage rules below are exercised for real
// rather than read. Legal here because this project never emits from tsc.
import { MIN_QUERY } from './search-filters.ts';

const PREFIX = 'apple.search.history.';

/** Long enough to hold a session's worth of questions, short enough to read at a glance. */
export const HISTORY_MAX = 8;

/** Below the search floor, nothing was ever searched — so there is nothing to remember. */
export const HISTORY_MIN_QUERY = MIN_QUERY;

const keyFor = (projectId: string) => `${PREFIX}${projectId}`;

function read(projectId: string): string[] {
  if (!projectId) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // A hand-edited or half-written value is treated as no history rather than as a crash: this
    // runs inside the panel's render path.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function write(projectId: string, queries: string[]): void {
  try {
    if (queries.length) window.localStorage.setItem(keyFor(projectId), JSON.stringify(queries));
    else window.localStorage.removeItem(keyFor(projectId));
  } catch {
    /* storage unavailable — the history simply does not persist */
  }
}

export function readSearchHistory(projectId: string): string[] {
  return read(projectId);
}

/**
 * Record a query that was actually run, newest first.
 *
 * De-duplicated case-insensitively, keeping the spelling just typed: searching `Door` after `door`
 * should leave one entry, and it should be the one the user last chose to write.
 */
export function rememberSearch(projectId: string, query: string): string[] {
  const q = query.trim();
  if (!projectId || q.length < HISTORY_MIN_QUERY) return read(projectId);
  const rest = read(projectId).filter((old) => old.toLowerCase() !== q.toLowerCase());
  const next = [q, ...rest].slice(0, HISTORY_MAX);
  write(projectId, next);
  return next;
}

/** Drop one entry — the list is the user's, and so is the right to edit it. */
export function forgetSearch(projectId: string, query: string): string[] {
  const next = read(projectId).filter((old) => old.toLowerCase() !== query.trim().toLowerCase());
  write(projectId, next);
  return next;
}

export function clearSearchHistory(projectId: string): void {
  write(projectId, []);
}

/**
 * Remove every project's history on this device.
 *
 * Keys are collected BEFORE any is removed: removing while walking `localStorage.key(i)` re-indexes
 * the store underneath the loop and skips every second match, which would leave half the queries
 * behind while looking like it had worked.
 */
export function clearAllSearchHistory(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — there is nothing persisted to clear */
  }
}
