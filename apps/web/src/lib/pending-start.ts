/**
 * The sentence somebody typed on the landing page, carried across sign-up and into their first
 * project — and dropped the moment it is used or stops being theirs.
 *
 * WHAT WAS THERE BEFORE. `apps/site` renders a real form: `<form action="/app/signup" method="get">`
 * around `<textarea name="start" maxlength="280">`. Typing "a lobby with a round timer" and pressing
 * Build lands on `/app/signup?start=a+lobby+with+a+round+timer`. Nothing in `apps/web` read it. The
 * reader's own words reached the address bar and stopped there.
 *
 * WHY sessionStorage AND NOT SOMETHING THAT LASTS. The handoff is explicit and it is right: a
 * sentence typed on Monday must not arrive in a project created on Friday. sessionStorage dies with
 * the tab, which is the longest this may live. It is read once and removed — `take` is a move, not a
 * copy — so the second project a person makes in the same tab starts empty.
 *
 * EVERY ACCESS IS GUARDED. sessionStorage throws in a private window, with site data blocked, and
 * inside some embedded webviews. A prefill is a courtesy; it may never be the reason a sign-up page
 * fails to render. Absence is the normal answer here, not an error.
 */

const KEY = 'apple.pendingStart';

/** The same ceiling the landing's textarea enforces with `maxlength`. */
export const MAX_START = 280;

/** Normalise what arrived in a query string: trimmed, capped, and empty means nothing. */
export function normaliseStart(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().slice(0, MAX_START).trim();
  return text.length > 0 ? text : null;
}

/**
 * Remember the sentence from a location search string. Returns what it stored, so a caller can
 * assert on it without reaching into storage.
 */
export function capturePendingStart(search: string | null | undefined): string | null {
  let text: string | null = null;
  try {
    text = normaliseStart(new URLSearchParams(search ?? '').get('start'));
  } catch {
    return null; // a search string that is not parseable carries no sentence
  }
  if (text === null) return null;
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    /* private window, blocked site data: the prefill is simply not offered */
  }
  return text;
}

/** Read it and remove it in one move, so it can only ever seed one project. */
export function takePendingStart(): string | null {
  try {
    const text = normaliseStart(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return text;
  } catch {
    return null;
  }
}

/** Drop it on any path that will not use it. */
export function clearPendingStart(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to drop */
  }
}
