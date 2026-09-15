// w15 — every failure the user can see says what to do next.
//
// The product had ~25 distinct error strings reaching the screen and most surfaces rendered them
// raw: `Couldn't load usage: {error.message}`. So a user met "forbidden", "not found", "slow down"
// or "billing not configured" — each of which is a note one server wrote to another, and none of
// which answers either question a person actually has:
//
//     1. Did I lose anything?
//     2. What do I do now?
//
// THE FIRST QUESTION IS THE ONE NOBODY ANSWERS, and it is the one that makes people refresh in a
// panic or redo work that was never lost. Every entry below states it explicitly, including the
// cases where the honest answer is "we cannot tell from here".
//
// `next` is ONE action, never a list. A failure that offers three options is a failure that has
// not been diagnosed, and the reader picks none of them.
//
// The raw message is kept on the result rather than thrown away — support needs it, and a
// developer reading a screenshot needs it — but it is never the headline.
//
// NOTHING IS IMPORTED HERE ON PURPOSE. Classifying a failure needs its status and its message and
// nothing else, and importing the API client to get an `instanceof` would drag the whole fetch
// layer — and Vite's import.meta.env — into anything that wants to explain an error, including a
// test. A structural read also means an error raised somewhere other than the client still gets
// explained rather than falling through to a shrug.

export type FailureKind =
  | 'offline'
  | 'signed_out'
  | 'not_permitted'
  | 'missing'
  | 'rate_limited'
  | 'out_of_credits'
  | 'not_configured'
  | 'upstream'
  | 'ours'
  | 'rejected';

export interface Explained {
  kind: FailureKind;
  /** What happened, in the user's terms. Never a status code, never a server's own wording. */
  title: string;
  /** Whether their work survived. The question people actually have, answered first. */
  safety: string;
  /**
   * What to do BESIDES pressing Try again — null when the button already says it.
   *
   * These used to duplicate. A 500 rendered the text "Try again." next to a button reading "Try
   * again", which is the kind of filler that teaches people to skim the whole box. So `next`
   * carries only what a button cannot, and `retryable` carries the rest.
   */
  next: string | null;
  /** Where that action lives, when it is somewhere in the product. */
  href?: string;
  /** Whether repeating the same request could succeed. Drives whether a Retry is offered at all. */
  retryable: boolean;
  /** The server's own words. For support and for screenshots — not for the headline. */
  detail: string | null;
}

/** Nothing was sent, so nothing can have changed. True for every failure that never left here. */
const NOTHING_SENT = 'Nothing was sent, so nothing in your project changed.';
/** The request arrived and was refused before it did anything. */
const REFUSED = 'The request was refused before it changed anything.';

function statusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const s = (err as { status?: unknown }).status;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
}

function messageOf(err: unknown): string | null {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return null;
}

/**
 * Turn anything thrown by the API client into something worth showing a person.
 *
 * Unknown shapes fall to `ours` rather than to a generic "something went wrong": if this function
 * cannot classify a failure, that is a gap here and not the user's problem to interpret, and the
 * honest thing is to take responsibility and offer the one action that helps.
 */
/**
 * WHERE A LINK POINTS, GIVEN WHO RENDERS IT.
 *
 * These hrefs go to a react-router <Link> in components/failure.tsx, inside
 * <BrowserRouter basename="/app">. The router prepends the basename, so writing it here produced
 * /app/app/usage and /app/app — links that resolved to nothing. '/app/sign-in' was worse: there
 * has never been a sign-in route, it is /login. Every href below is therefore a ROUTER path, and
 * error-taxonomy.test.mjs holds them against app.tsx's own path list so a renamed route breaks
 * the test rather than the link.
 */
export function explainFailure(err: unknown): Explained {
  const status = statusOf(err);
  const detail = messageOf(err);
  const lower = (detail ?? '').toLowerCase();

  // Status 0 is what the client sets when fetch itself threw — the request never left the browser.
  if (status === 0) {
    return {
      kind: 'offline',
      title: 'No connection',
      safety: NOTHING_SENT,
      next: 'Check your connection first.',
      retryable: true,
      detail,
    };
  }

  if (status === 401) {
    return {
      kind: 'signed_out',
      title: 'Your session has expired',
      safety: 'Your work is saved. Signing in again brings you back to it.',
      next: 'Sign in again.',
      href: '/login',
      // Retrying with the same dead token cannot work, and a Retry button here is a loop.
      retryable: false,
      detail,
    };
  }

  if (status === 403) {
    return {
      kind: 'not_permitted',
      title: 'You do not have access to this',
      safety: REFUSED,
      next: 'If this is yours, check you are signed in as the right account.',
      retryable: false,
      detail,
    };
  }

  if (status === 404) {
    return {
      kind: 'missing',
      title: 'Not here any more',
      safety: 'It may have been deleted or archived. Nothing else was touched.',
      next: 'Go back to your projects.',
      href: '/',
      retryable: false,
      detail,
    };
  }

  if (status === 429) {
    // Two different 429s, and they need opposite advice: one clears by waiting a moment, the other
    // does not clear until midnight or until credits are added. Telling a user out of Credits to
    // "slow down" is the kind of wrong answer that reads as a brush-off.
    const spent = /credit|quota|allowance|used up|limit reached/.test(lower);
    if (spent) {
      return {
        kind: 'out_of_credits',
        title: 'You are out of Credits',
        safety: REFUSED + ' Nothing was charged for it.',
        next: 'See what is left and when it renews.',
        href: '/usage',
        retryable: false,
        detail,
      };
    }
    return {
      kind: 'rate_limited',
      title: 'Too many requests in a row',
      safety: REFUSED,
      next: 'Wait a few seconds first.',
      retryable: true,
      detail,
    };
  }

  if (status === 503) {
    return {
      kind: 'not_configured',
      title: 'That part of Apple is not switched on here',
      // The distinction that matters: this is a deployment that cannot do the thing, not a thing
      // that went wrong. Retrying will produce the same answer for as long as it stays that way.
      safety: REFUSED,
      next: null,
      retryable: false,
      detail,
    };
  }

  if (status === 502 || status === 504) {
    return {
      kind: 'upstream',
      title: 'A service Apple depends on did not answer',
      safety: 'We cannot tell from here whether it finished. Check before repeating anything that costs money or changes your place.',
      next: null,
      retryable: true,
      detail,
    };
  }

  if (status !== null && status >= 500) {
    return {
      kind: 'ours',
      title: 'Something broke on our side',
      safety: 'Your work is saved. This is ours to fix, not something you did.',
      next: null,
      retryable: true,
      detail,
    };
  }

  if (status !== null && status >= 400) {
    // A 400 reaching a person means the client sent something the server would not take, which is
    // a bug here rather than a mistake they made. The wording says so without being obscure.
    return {
      kind: 'rejected',
      title: 'Apple could not make sense of that request',
      safety: REFUSED,
      next: 'If it keeps happening, the detail below is worth reporting.',
      retryable: true,
      detail,
    };
  }

  return {
    kind: 'ours',
    title: 'Something broke on our side',
    safety: 'Your work is saved. This is ours to fix, not something you did.',
    next: null,
    retryable: true,
    detail,
  };
}

/** One line for a toast, where there is no room for the full explanation. */
export function briefFailure(err: unknown): string {
  const e = explainFailure(err);
  // A toast has no button, so here the retry has to be said rather than shown.
  const action = e.next ?? (e.retryable ? 'Try again.' : null);
  return action ? `${e.title}. ${action}` : e.title;
}
