/**
 * THE LAST DOOR — what the screen in front of `POST /api/recovery-request` is allowed to say.
 *
 * Every other way back into an account needs the thing that has gone missing. `/forgot` mails the
 * inbox they cannot open; the two-step prompt wants the phone that broke; settings is behind the
 * sign-in that is failing. This page is for the person all of those have already failed, which is
 * what makes its one comfortable wrong answer so expensive.
 *
 * THAT WRONG ANSWER IS THE THANK-YOU NOBODY EARNED. The obvious client is `await fetch(...)`
 * wrapped in a `try`, showing the calm sentence in the `then` and swallowing the `catch`. Written
 * that way, a 503 from a database that refused the write and a `TypeError` from a dead connection
 * both render as "thanks, that is recorded" — to somebody who has run out of other options and
 * will now wait for a reply that nobody will ever send, because nothing was ever written down.
 * That is this repository's standing failure, an absence of an observation rendered as an
 * observation, at the point where it costs a person their account.
 *
 * So `recoveryOutcome` is a total function over what actually came back, and `received` is
 * reachable from exactly one shape: a 200 whose body explicitly says so. A 200 carrying a proxy's
 * HTML error page, a truncated body, a null, or `received: false` is not an acknowledgement, and
 * neither is a request that never completed.
 *
 * AND IT STILL REVEALS NOTHING. The worker has no way to discover whether an address has an
 * account — `recovery-requests.ts` holds a D1 binding and nothing that could ask — so no sentence
 * here may imply one was consulted. The acknowledgement is the same conditional form
 * `auth-flows.ts` uses, and a test asserts the whole vocabulary of this module against the
 * phrasings that would answer "is this address a customer?".
 *
 * Kept free of React so tests/account-recovery.test.mjs can feed it the shapes a real network
 * produces, including the broken ones.
 */

/** What came back, in the only terms this module needs. */
export interface RecoveryReply {
  /** Absent when the request never completed. */
  status?: number;
  /** Whatever JSON arrived, which may be anything at all. */
  body?: unknown;
  /** Set when the fetch itself threw. */
  error?: unknown;
}

export type RecoveryOutcome =
  /** Written down. The only outcome that tells somebody to wait for a reply. */
  | { kind: 'received'; message: string }
  /** Their input, their fix: a malformed address, or too many attempts. */
  | { kind: 'retry'; message: string }
  /** Nothing was recorded, and saying otherwise would be the lie this module exists to prevent. */
  | { kind: 'failed'; message: string };

/**
 * The hedged acknowledgement.
 *
 * Identical in force to `CHECK_EMAIL_LINE` in auth-flows.ts and deliberately not imported from it:
 * that constant is about a mail that may be on its way, this is about a note that has been filed,
 * and collapsing them would make one of the two sentences wrong the next time either is edited.
 */
const ACKNOWLEDGED =
  'Thanks — that is recorded. If that address has an account, we will be in touch at it.';

const COULD_NOT_RECORD =
  'We could not record that just now — nothing has been saved. Please try again in a minute.';

const NO_CONNECTION =
  "We couldn't reach the server, so nothing has been saved. Check your connection and try again.";

/**
 * Every sentence this module can put on a screen.
 *
 * Exported so a test can assert over the whole vocabulary at once rather than over the branches it
 * happened to think of. A new sentence added below without being listed here is caught by the
 * `RECOVERY_SENTENCES` test only if it is listed — so the rule is: add it here when you add it.
 */
export const RECOVERY_SENTENCES: readonly string[] = [ACKNOWLEDGED, COULD_NOT_RECORD, NO_CONNECTION];

/** A string from an untrusted body, flattened and capped before it can be rendered. */
function serverText(body: unknown, key: 'message' | 'error'): string | null {
  if (!body || typeof body !== 'object') return null;
  const v = (body as Record<string, unknown>)[key];
  if (typeof v !== 'string') return null;
  const flat = v.replace(/\s+/g, ' ').trim();
  return flat ? flat.slice(0, 300) : null;
}

/**
 * Whether the form may be submitted at all.
 *
 * The same shape check the worker applies, done here so that somebody who fat-fingered their
 * address is told immediately rather than after a round trip — and NOT so the client can be
 * trusted: the worker refuses the same values independently.
 */
export function canSubmit(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const v = email.trim().toLowerCase();
  if (v.length < 3 || v.length > 320) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}

/**
 * What the screen says about what happened.
 *
 * ORDER MATTERS AND IS NOT ARBITRARY. `error` is checked first because a request that threw has no
 * status to reason about, and a `status` left over from some earlier state would otherwise decide
 * the sentence. Then the ONE success shape. Everything after that is a failure of some kind, and
 * the default at the bottom is `failed` rather than `received` — an unrecognised answer is not a
 * confirmation.
 */
export function recoveryOutcome(reply: RecoveryReply): RecoveryOutcome {
  if (reply.error !== undefined && reply.error !== null) {
    return { kind: 'failed', message: NO_CONNECTION };
  }

  const status = reply.status;

  if (status === 200) {
    // THE SHAPE CHECK IS THE POINT, not `status === 200`. A 200 is what a captive portal, a proxy
    // error page and a truncated response all look like from here, and every one of them would
    // otherwise be read as "your plea is in a queue".
    const body = reply.body;
    const ok = !!body && typeof body === 'object' && (body as { received?: unknown }).received === true;
    if (ok) return { kind: 'received', message: serverText(body, 'message') ?? ACKNOWLEDGED };
    return { kind: 'failed', message: COULD_NOT_RECORD };
  }

  // Their input, their fix. Both of these are about the request rather than about the account, so
  // repeating the server's own sentence reveals nothing.
  if (status === 400 || status === 429) {
    return { kind: 'retry', message: serverText(reply.body, 'error') ?? COULD_NOT_RECORD };
  }

  return { kind: 'failed', message: serverText(reply.body, 'error') ?? COULD_NOT_RECORD };
}
