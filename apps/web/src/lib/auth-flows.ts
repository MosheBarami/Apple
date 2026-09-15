/**
 * The decisions behind sign-up, sign-in, password reset, email change and re-authentication.
 *
 * Split out of the forms for the reason every other model in this directory is: a component that
 * imports React cannot be loaded by `node --test`, and these are the parts that are worth being
 * sure about. Three properties live here, and each one has a way of failing that looks like
 * working:
 *
 *   1. THE SIGN-UP FORM MUST NOT ANSWER "DOES THIS ADDRESS HAVE AN ACCOUNT?"
 *      It used to. `friendlyAuthError` mapped "already registered" to "That email already has an
 *      account. Sign in instead." — one HTTP request per address, and the form tells you who is a
 *      customer. That is the whole attack, and the fix is not a softer sentence: it is that the
 *      registered and unregistered cases must produce the SAME outcome, byte for byte.
 *
 *      The error string is not the only oracle, and it is not even the sneakiest one. When email
 *      confirmation is on, Supabase answers a sign-up for an existing address with HTTP 200 and an
 *      obfuscated user whose `identities` array is EMPTY. A client that branches on that leaks
 *      exactly as much as the error message did, with no error in sight — so `signupOutcome`
 *      deliberately never reads `identities`, and a test holds it to that.
 *
 *   2. AN EXPIRED LINK AND A LINK THAT WAS NEVER VALID ARE DIFFERENT FACTS.
 *      The same distinction `collab.ts` already draws between "you were never invited" and "your
 *      invitation ran out". One of them means *ask for another one*; the other means the link was
 *      never yours. Collapsing them into "something went wrong" strands the person whose only
 *      problem is that they read their email an hour late.
 *
 *   3. RE-AUTHENTICATION FAILS CLOSED.
 *      "When did this person last prove who they are?" is answered from a timestamp that arrives as
 *      `unknown` — from a JWT, from a provider, from storage. An unreadable answer is NOT a recent
 *      one. Same rule as `confirm-model.ts`: a fact we cannot read lands on more friction, never
 *      less.
 */

/* ------------------------------------------------------------------ outcomes --- */

export type AuthIntent = 'sign-in' | 'sign-up' | 'reset' | 'change-email';

export type AuthOutcome =
  /** Signed in. The only outcome that moves the user into the app. */
  | { kind: 'signed-in' }
  /** A link is on its way — or would be, if that address has an account. Says nothing either way. */
  | { kind: 'check-email'; address: string }
  /** They can fix this themselves: wrong password, too short, too soon. */
  | { kind: 'retry'; message: string };

/**
 * The single sentence every "we may have sent you mail" screen says.
 *
 * Deliberately conditional. It is the same words whether or not the address is registered, which is
 * what makes the two cases indistinguishable from outside — and it is not a lie in either case.
 */
export const CHECK_EMAIL_LINE = 'If that address has an account, a link is on its way.';

const text = (e: unknown): string => {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return '';
};

/**
 * Provider phrasings that answer "does this address exist?".
 *
 * Matched on the way IN so they can be discarded, never on the way out to be reworded. A list of
 * "friendly" replacements for these strings is the bug, not the fix.
 */
const ENUMERATING = [
  'already registered',
  'already exists',
  'already been registered',
  'user not found',
  'email address is already',
  'a user with this email address has already been registered',
];

export const revealsAccountExistence = (error: unknown): boolean => {
  const m = text(error).toLowerCase();
  return m !== '' && ENUMERATING.some((p) => m.includes(p));
};

/**
 * What to tell someone whose attempt failed for a reason that is genuinely about them.
 *
 * Nothing here names the state of an address. "Wrong email or password" is uniform by construction:
 * it is the same sentence for an address that exists with the wrong password and for one that does
 * not exist at all, which is what Supabase's own `invalid login credentials` already means.
 *
 * `email not confirmed` survives, and it is worth saying why it is not an oracle: reaching it
 * requires the correct password. Anyone who can produce that already knows the account exists, so
 * withholding the reason costs a real user their next step and costs an attacker nothing.
 */
export function authErrorMessage(error: unknown): string {
  const raw = text(error);
  const m = raw.toLowerCase();
  if (!raw) return 'Something went wrong. Try again.';
  if (m.includes('invalid login credentials') || revealsAccountExistence(error)) {
    return 'Wrong email or password. Try again.';
  }
  if (m.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link.';
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('for security purposes')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (m.includes('password should be') || m.includes('weak password')) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (m.includes('same password') || m.includes('should be different')) {
    return 'That is already your password. Choose a different one.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return raw;
}

/** Whether a failure is the user's to fix by trying again, or ours to report. */
const retry = (error: unknown): AuthOutcome => ({ kind: 'retry', message: authErrorMessage(error) });

/**
 * What the sign-up form does with whatever came back.
 *
 * READS `session` AND NOTHING ELSE. A session means the person is signed in — which they could only
 * be by supplying a password that works, so it reveals nothing they did not already know. Every
 * other shape — an obfuscated user, an empty `identities` array, a "already registered" error, a
 * clean unconfirmed sign-up — lands on the identical `check-email` outcome.
 *
 * A failure that is genuinely about the request rather than about the address (rate limiting, a
 * password the provider refuses, a dead network) still has to be reportable, or the form silently
 * swallows real errors and tells everyone to go and check their inbox. Those are separated by
 * `revealsAccountExistence`, not by guesswork.
 */
export function signupOutcome(
  result: { session?: unknown } | null | undefined,
  error: unknown,
  address: string,
): AuthOutcome {
  if (!error && result && result.session) return { kind: 'signed-in' };
  if (error && !revealsAccountExistence(error)) return retry(error);
  return { kind: 'check-email', address };
}

/**
 * What the "email me a reset link" form does.
 *
 * Supabase already answers this endpoint uniformly, but the client is what decides what the SCREEN
 * says, and the obvious implementation ("show the error if there is one") reintroduces the oracle
 * the endpoint was careful to avoid.
 */
export function resetRequestOutcome(error: unknown, address: string): AuthOutcome {
  if (error && !revealsAccountExistence(error)) return retry(error);
  return { kind: 'check-email', address };
}

/** Same shape for the address-change form, for the same reason: it takes an address as input. */
export function emailChangeOutcome(error: unknown, address: string): AuthOutcome {
  if (error && !revealsAccountExistence(error)) return retry(error);
  return { kind: 'check-email', address };
}

export function signInOutcome(error: unknown): AuthOutcome {
  if (error) return retry(error);
  return { kind: 'signed-in' };
}

/* ------------------------------------------------------------------- links --- */

export type AuthLinkKind = 'recovery' | 'signup' | 'email_change' | 'magiclink' | 'invite' | 'none';

/**
 * Why a link did not work. `expired` is the one that has somewhere to go next — it is the only
 * failure where "send me another one" is the honest offer rather than a shrug.
 */
export type AuthLinkFailure = 'expired' | 'invalid' | 'denied' | 'server';

export interface AuthLink {
  /** True only when a usable token arrived and no error came with it. */
  ok: boolean;
  kind: AuthLinkKind;
  failure?: AuthLinkFailure;
  /** The provider's own description, flattened and capped. Rendered as text, never as markup. */
  detail?: string;
}

const KINDS: readonly AuthLinkKind[] = ['recovery', 'signup', 'email_change', 'magiclink', 'invite'];

/** `email_change` arrives from some versions as `email_change_current` / `_new`. */
function linkKind(raw: string | null): AuthLinkKind {
  if (!raw) return 'none';
  const v = raw.toLowerCase();
  if (v.startsWith('email_change')) return 'email_change';
  return (KINDS as readonly string[]).includes(v) ? (v as AuthLinkKind) : 'none';
}

/**
 * Provider text is text.
 *
 * `error_description` is rendered into a page the user is being asked to trust at the exact moment
 * they are least able to judge it. React escapes markup, which is most of the risk — but a
 * description carrying newlines or control characters can still forge the shape of the page around
 * it, and an unbounded one can push the actual controls off the screen.
 */
function flatten(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const clean = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return clean || undefined;
}

function failureFor(code: string, description: string): AuthLinkFailure {
  const both = `${code} ${description}`.toLowerCase();
  // "expired" first: the description Supabase sends for a stale link is "Email link is invalid or
  // has expired", which contains BOTH words. Reading `invalid` out of that sentence turns every
  // late click into "this link was never yours", which is the one answer with no way forward.
  if (both.includes('expired') || both.includes('otp_expired')) return 'expired';
  if (both.includes('server_error') || both.includes('unexpected_failure')) return 'server';
  if (both.includes('access_denied') || both.includes('denied')) return 'denied';
  return 'invalid';
}

/**
 * Read the callback a mail link landed on.
 *
 * BOTH HALVES OF THE URL. The implicit flow puts its answer in the fragment
 * (`#access_token=…&type=recovery`, or `#error=access_denied&error_code=otp_expired`); the PKCE
 * flow puts errors in the query (`?error=…&error_code=…`). A parser that reads only the hash calls
 * a PKCE failure "no link here" and shows a blank form to someone who just clicked a link, which
 * is the most confusing possible outcome.
 *
 * AN ERROR BEATS A TOKEN. If both are somehow present, this refuses. A URL carrying both is not a
 * URL this product produced.
 */
export function parseAuthLink(url: { hash?: unknown; search?: unknown }): AuthLink {
  const hash = typeof url?.hash === 'string' ? url.hash.replace(/^#/, '') : '';
  const search = typeof url?.search === 'string' ? url.search.replace(/^\?/, '') : '';
  const params = new URLSearchParams(hash);
  for (const [k, v] of new URLSearchParams(search)) if (!params.has(k)) params.append(k, v);

  const error = params.get('error') ?? params.get('error_code');
  const description = flatten(params.get('error_description'));
  const kind = linkKind(params.get('type'));

  if (error) {
    return {
      ok: false,
      kind,
      failure: failureFor(`${error} ${params.get('error_code') ?? ''}`, description ?? ''),
      detail: description,
    };
  }

  const hasToken = Boolean(params.get('access_token') || params.get('code') || params.get('token_hash'));
  if (!hasToken) return { ok: false, kind };
  return { ok: true, kind };
}

/** Did the user arrive here from a link at all? Distinguishes "it failed" from "there is nothing". */
export const cameFromLink = (link: AuthLink): boolean => link.ok || link.failure !== undefined;

/**
 * Where a mail link must come back to.
 *
 * Supabase sends confirmation and recovery links to its project `site_url` unless the caller says
 * otherwise, and `site_url` is one value for a deployment that serves a marketing site, an app
 * under /app and several preview origins. Every call that sends mail passes one of these, so a link
 * lands on the route that can actually finish the job.
 *
 * ABSOLUTE AND SAME-ORIGIN. The provider requires an absolute URL, which means this function is the
 * one place in the client that turns a route into one — so it is also the place where a caller
 * could accidentally aim a mail link at another site. `safeInternalPath` decides what the path may
 * be, and the origin is read from the page rather than supplied, so an attacker-chosen path cannot
 * become an attacker-chosen host.
 *
 * `basename` is '/app': the router is mounted there, and a redirect to '/confirm' would land on the
 * marketing site, which has no such page.
 */
export const APP_BASE = '/app';

export function emailRedirectTo(
  route: string,
  origin: string = typeof window === 'undefined' ? '' : window.location.origin,
): string {
  const path = safeInternalPathLocal(route);
  return `${origin}${APP_BASE}${path === '/' ? '' : path}`;
}

/**
 * The same rule as `lib/safe-redirect.ts`, inlined rather than imported.
 *
 * Not duplication for its own sake: that module's doc comment is explicit that it validates at the
 * SINK, and this is a different sink with a different consequence — a bad value there is a
 * navigation, a bad value here is baked into an email that outlives the session. Importing it would
 * couple the mail path to a function whose contract is about router state.
 */
function safeInternalPathLocal(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') return '/';
  const path = raw.replace(/\\/g, '/');
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(path)) return '/';
  if (/[\u0000-\u001f\u007f]/.test(path)) return '/';
  return path;
}

/* ---------------------------------------------------------------- passwords --- */

export const PASSWORD_MIN = 8;

/**
 * A short list, not a policy engine.
 *
 * The passwords that actually appear in credential-stuffing lists are not the ones a complexity
 * rule catches — "Password1!" satisfies every rule anyone has ever written. This refuses the
 * handful that are genuinely universal plus the two that are personal to this user (their own
 * address), and leaves length as the only other requirement, which is what current guidance
 * actually says.
 */
const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'letmein1',
  'iloveyou',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'welcome1',
  'admin123',
  'roblox123',
]);

/** The reason this password cannot be used, or null when it can. */
export function passwordProblem(password: unknown, context: { email?: unknown } = {}): string | null {
  if (typeof password !== 'string' || password === '') return 'Enter a password.';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is one of the most common there is. Choose another.';
  const email = typeof context.email === 'string' ? context.email.trim().toLowerCase() : '';
  if (email) {
    const local = email.split('@')[0] ?? '';
    if (lower === email || (local.length >= 4 && lower === local)) {
      return 'Your password cannot be your email address.';
    }
  }
  return null;
}

/* ----------------------------------------------------------- reauthentication --- */

/**
 * How recently someone must have proved who they are before the product will change their
 * credentials or reach across their other devices.
 *
 * Ten minutes: long enough that changing a password immediately after signing in does not ask
 * twice, short enough that a session left open on a shared machine cannot be turned into a
 * takeover by whoever sits down next.
 */
export const REAUTH_WINDOW_MS = 10 * 60_000;

/**
 * The actions that are about IDENTITY rather than about content.
 *
 * Deliberately not the same list as `confirm-model.ts` handles, and the difference is the point:
 * that model asks "how sure are you?", this one asks "who are you?". Typing a project's name
 * proves you meant it; it proves nothing at all about whose keyboard it was typed on. An action
 * can need both — settings reset asks for a confirmation AND for a password — and each answers a
 * question the other cannot.
 */
export const SENSITIVE_ACTIONS = ['change-email', 'change-password', 'sign-out-everywhere', 'reset-settings'] as const;
export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number];

export const isSensitiveAction = (v: unknown): v is SensitiveAction =>
  typeof v === 'string' && (SENSITIVE_ACTIONS as readonly string[]).includes(v);

/**
 * When did this person last prove who they are?
 *
 * Accepts the shapes it is actually handed: an ISO string from `user.last_sign_in_at`, epoch
 * milliseconds from a local re-authentication we watched happen, a Date. Anything else — null, a
 * numeric string, `'never'`, an object — is NOT a time, and returns null rather than a number that
 * happens to compare favourably. `new Date('1750000000000')` is an Invalid Date, and
 * `NaN < anything` is false, so a naive implementation of this silently says "not recent" for one
 * input and silently says "recent" for none — which is the safe direction here only by luck.
 */
export function lastAuthMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Must this action ask for a password first?
 *
 * FAILS CLOSED TWICE OVER. An unreadable timestamp requires re-authentication, and so does a
 * timestamp in the future — a clock that disagrees with ours by more than the window is not
 * evidence of anything, and treating "later than now" as "definitely recent" hands a stale session
 * a permanent pass.
 *
 * An action this model does not recognise is NOT waved through: `isSensitiveAction` decides, and an
 * unknown string returns false only because an unknown action is not one of the four this product
 * gates. The call sites pass literals, and the type keeps them honest.
 */
export function needsReauth(action: unknown, lastAuth: unknown, now: number = Date.now()): boolean {
  if (!isSensitiveAction(action)) return false;
  const at = lastAuthMs(lastAuth);
  if (at === null) return true;
  const age = now - at;
  if (age < 0) return true;
  return age > REAUTH_WINDOW_MS;
}

/**
 * The freshest proof of identity we have.
 *
 * Two sources, and the later one wins: the session's own `last_sign_in_at`, and the moment we
 * personally watched a password re-entered in this tab. The second exists because the first does
 * not always move — a refreshed token carries the ORIGINAL sign-in time, so a user who has just
 * typed their password into the re-auth dialog would otherwise be asked for it again immediately.
 */
export function freshestAuth(sessionLastSignIn: unknown, localReauthAt: unknown): number | null {
  const a = lastAuthMs(sessionLastSignIn);
  const b = lastAuthMs(localReauthAt);
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/* --------------------------------------------------------- verification state --- */

export type EmailVerification = 'verified' | 'unverified' | 'unknown';

/**
 * Is this address confirmed?
 *
 * Three states, not two. `unknown` is what an absent user object means, and it is not the same as
 * "unverified" — showing a red "unverified" badge to someone whose profile simply has not loaded
 * is the product accusing them of something on the strength of a missing field.
 *
 * Supabase has published this under two names over time (`email_confirmed_at`, and `confirmed_at`
 * before it). Both are read, because a user signed up under the old one still has only the old one.
 */
export function emailVerification(user: unknown): EmailVerification {
  if (!user || typeof user !== 'object') return 'unknown';
  const u = user as { email_confirmed_at?: unknown; confirmed_at?: unknown; email?: unknown };
  if (typeof u.email !== 'string' || u.email === '') return 'unknown';
  const at = lastAuthMs(u.email_confirmed_at) ?? lastAuthMs(u.confirmed_at);
  return at === null ? 'unverified' : 'verified';
}
