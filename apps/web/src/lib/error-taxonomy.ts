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
  // A THIRD PARTY THE CUSTOMER CONNECTED refused, which is not the same failure as any of the
  // above and used to be reported as one of them. A dead Roblox Open Cloud key arrives as a 401
  // and was classified `signed_out` — "Your session has expired, sign in again" — sending somebody
  // to re-authenticate their APPLE account when the thing that expired was a credential on
  // somebody else's service. The integration's own mapper fills this in (lib/roblox-key.ts).
  | 'integration'
  | 'rejected';

/**
 * A link to the page that explains this failure at length.
 *
 * SEPARATE FROM `href` ON PURPOSE, and the reason is structural rather than editorial. `href` is
 * an in-app route and `failure.tsx` renders it with react-router's `Link`. `/docs/*` is served by
 * the Astro site, not by the SPA — a `Link` to it would be resolved against the app's own route
 * table and land on the not-found page, so a help link has to be a real anchor. Two fields make
 * that difference impossible to get wrong; one field with a convention would not.
 *
 * It is also a SECOND thing to read, never the one action: `next` stays exactly one action, for
 * the reason the header gives. Help sits below it.
 */
export interface HelpLink {
  /** A path under /docs. Checked against the pages on disk by apps/web/tests/contextual-help. */
  href: string;
  label: string;
}

/** Where the long answers live. Named once so a renamed page is one edit, not a search. */
const DOC_TROUBLESHOOTING: HelpLink = { href: '/docs/troubleshooting', label: 'Troubleshooting' };
const DOC_CREDITS: HelpLink = { href: '/docs/credits-and-limits', label: 'How Credits work' };

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
  /** Where that action lives, when it is somewhere in the product. An SPA route. */
  href?: string;
  /** The written explanation, when one exists. Never a substitute for `safety` or `next`. */
  help?: HelpLink;
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
export function explainFailure(err: unknown): Explained {
  const status = statusOf(err);
  const detail = messageOf(err);
  const lower = (detail ?? '').toLowerCase();

  // A CONNECTED THIRD PARTY REFUSED, CHECKED BEFORE THE STATUS BRANCHES BELOW, because the status
  // is what gets this one wrong: a revoked Roblox key is a 401 and every 401 below this line means
  // "your Apple session expired, sign in again". The narrow test — the provider named in the
  // server's own words — is deliberate; a broad one would swallow ordinary auth failures. The
  // titled, actionable version lives in lib/roblox-key.ts, which is where the panel gets it from.
  if (/\broblox\b|open cloud/i.test(lower)) {
    return {
      kind: 'integration',
      title: 'Your connected Roblox account refused that',
      safety: 'Your Apple account and your work are unaffected — this is about the key you connected.',
      next: 'Check the connection in Settings → Connections.',
      href: '/app/settings',
      retryable: false,
      detail,
    };
  }

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
      href: '/app/sign-in',
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
      href: '/app',
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
        href: '/app/usage',
        help: DOC_CREDITS,
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
      help: DOC_TROUBLESHOOTING,
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
      help: DOC_TROUBLESHOOTING,
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
      help: DOC_TROUBLESHOOTING,
      retryable: true,
      detail,
    };
  }

  return {
    kind: 'ours',
    title: 'Something broke on our side',
    safety: 'Your work is saved. This is ours to fix, not something you did.',
    next: null,
    help: DOC_TROUBLESHOOTING,
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
