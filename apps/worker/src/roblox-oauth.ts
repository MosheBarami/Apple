// SIGN IN WITH ROBLOX (handoff M2, tasks O1 to O3 of planning/roblox-oauth-setup.md).
//
// The design in one paragraph. The browser goes to /auth/roblox/start, which stores a one-time state and
// a PKCE verifier in KV and sends it to Roblox. Roblox sends it back to /auth/roblox/callback with a code.
// The worker swaps the code for tokens (confidential client plus PKCE), asks Roblox who this is, and links
// that person by the Roblox `sub` and by nothing else. Roblox gives no email and Supabase has no Roblox
// provider, so the account is a Supabase user with a synthetic address that nothing can deliver to, made
// and signed in through the Auth admin API. The worker never signs a JWT: it asks Supabase for a one-time
// token hash, keeps it in KV behind a random handle that only the browser which finished the callback holds
// (an HttpOnly cookie), and the SPA redeems it once with a same-origin POST and trades it for a real session
// with verifyOtp. No token is ever in a URL. docs: planning/proof/M2/ROBLOX-SIGNIN.md.
//
// THE TRUST CHANGE THIS FILE CARRIES. Until now the worker held no Supabase secret and every database call
// travelled with the caller's own JWT. SUPABASE_SECRET_KEY is the first credential that can act as anyone.
// It is used in this file and nowhere else, for three Auth admin calls (create a user, read a user's address,
// mint a sign-in token), and when it is not set every route here answers 503 instead of degrading.
//
// WHY EACH GUARD IS HERE:
//   - state is single use and burned before anything else is read, so a replay is a 400;
//   - the state is also bound to the browser that asked for it by a cookie, because a state that lives only
//     in KV lets an attacker start a flow, finish it on their own Roblox account, and hand the callback URL to
//     somebody else, who would then be signed in as the attacker (login CSRF);
//   - the sign-in token the callback mints is NOT put in the redirect. A token in a link signs in whoever
//     opens the link, so an attacker could finish a flow on their own Roblox account and send the landing
//     link to a victim (login CSRF, the same attack as above one step later). It is stored under a random
//     one-time handle and the handle goes in a cookie that only this browser holds and only /redeem receives;
//   - both flow cookies are `__Host-` prefixed on https (Secure, Path=/, no Domain), because a cookie with an ordinary name
//     can be planted by a response over plain http before HSTS is known, or by a sibling subdomain, and a planted state or
//     handle reopens the same login CSRF. Only the registered http://localhost dev origin keeps the bare names;
//   - the rate limits are per kind of request, and the two steps that come AFTER the person has consented at Roblox
//     (callback, redeem) are keyed by their own single-use state or handle, never by the address a school lab shares;
//   - a RE-AUTHENTICATION is a flow of its own (`purpose: 'reauth'` in the stored state). It asks Roblox for a fresh login
//     (`prompt=login`, `max_age=0`), never makes an account, and on success records the time on the server, which is what
//     the two gated worker routes (export, delete) and the SPA's gate read for a Roblox-only account instead of trusting
//     the session's `last_sign_in_at`, which any sign-in sets and which a still-open roblox.com session satisfies by itself;
//   - nothing makes a NEW account until the person has said so. A Roblox account nobody here has seen is held (sealed) behind
//     the handle cookie as a `pending` record, the SPA asks "This creates a new StudPilot account", and only /create makes
//     the user. Somebody who already has an email account would otherwise get a second, empty one without noticing;
//   - an account is found by `sub`. A username is display text that Roblox lets people change and reuse, so
//     linking by it would let a second person take an account over;
//   - the synthetic address is a KEYED digest of the `sub` (HMAC under CREDENTIAL_KEY). A Roblox id is public,
//     so an address derived from it alone could be registered by anybody through the open sign-up, and the
//     real Roblox user would be locked out for good. And an existing user with the address is still adopted
//     only when the admin-written app_metadata names the same `sub`, else the sign-in fails closed;
//   - the Roblox refresh token is single use. Before the worker spends it, it claims a lease on the row, and
//     it stores the replacement by compare-and-swap on `version` and `generation`, so two requests can never both spend it;
//   - every response carries no-store and no-referrer, error pages say one fixed sentence (nothing the
//     provider sent is reflected), and nothing here logs a query string, a token or a response body.
import { Hono } from 'hono';
import { PRODUCT_ORIGIN } from '@studpilot/shared';
import type { AuthedUser, Env } from './env';
import { oncePerIsolate } from './schema-once';
import { keyedId, openSecret, sealSecret } from './user-credentials';

const OAUTH = 'https://apis.roblox.com/oauth/v1';
/** Sign-in asks for identity only. The asset scopes arrive with uploads (M5c), with their own consent. */
const SIGNIN_SCOPE = 'openid profile';
const STATE_PREFIX = 'roblox-oauth:state:';
const STATE_TTL_SECONDS = 600;
const STATE_COOKIE = 'rbx_oauth_state';
const CALLBACK_PATH = '/auth/roblox/callback';
const LANDING_PATH = '/app/auth/roblox';
/** The sign-in token waits here between the callback and the SPA's redeem, behind a handle only one browser holds. */
const HANDLE_PREFIX = 'roblox-oauth:handle:';
const HANDLE_TTL_SECONDS = 300;
const HANDLE_COOKIE = 'rbx_oauth_handle';
const REDEEM_PATH = '/auth/roblox/redeem';
/** The shape of a state (in the authorize URL) and of a handle (in the cookie): random base64url, never shorter than this. */
const FLOW_TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
/** The only origins a redirect_uri may be built from: the product, and the registered dev server. */
const DEV_ORIGIN = 'http://localhost:5173';
/** RFC 2606 `.invalid` can never be delivered to, so no mail goes anywhere by accident. */
const SYNTHETIC_EMAIL_DOMAIN = 'users.studpilot.invalid';
/** Domain-separates the keyed digest the address is made from (user-credentials.ts `keyedId`). Never change it: addresses derive from it. */
const ADDRESS_PURPOSE = 'roblox-signin-address';
const OUTBOUND_TIMEOUT_MS = 10_000;
const REFRESH_LEASE_MS = 30_000;
/**
 * How long a Roblox re-authentication holds, by the SERVER's clock. The same ten minutes as REAUTH_WINDOW_MS in
 * apps/web/src/lib/auth-flows.ts (a test holds the two equal). It is never compared with a device clock: both ends of the
 * comparison are written and read by the worker, so a device that is minutes off cannot loop a person through re-authentication.
 */
const REAUTH_WINDOW_MS = 10 * 60_000;
/** A stamp a little ahead of this isolate's clock is clock noise between machines, not a stamp from the future. */
const REAUTH_CLOCK_NOISE_MS = 5_000;
/** The action a re-authentication was asked for, carried back to Settings so it can be resumed: words and hyphens, nothing else. */
const REAUTH_ACTION = /^[a-z]{2,20}(?:-[a-z]{2,20}){0,3}$/;
/** Roblox access tokens live 15 minutes; one is handed out from memory until a minute before that. */
const ACCESS_TOKEN_MARGIN_MS = 60_000;

export type IpLimiter = (key: string, limit?: number, windowMs?: number) => boolean;

// ---------------------------------------------------------------------------------------------
// configuration and storage
// ---------------------------------------------------------------------------------------------

interface Config {
  clientId: string;
  clientSecret: string;
  supabaseKey: string;
}

/**
 * All four secrets or nothing. CREDENTIAL_KEY is in the list because the refresh token is sealed with
 * it: exchanging a code and then failing to store the token would burn a sign-in for nothing.
 */
function configOf(env: Env): Config | null {
  const clientId = env.ROBLOX_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.ROBLOX_OAUTH_CLIENT_SECRET?.trim();
  const supabaseKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!clientId || !clientSecret || !supabaseKey || !env.CREDENTIAL_KEY || !env.SUPABASE_URL) return null;
  return { clientId, clientSecret, supabaseKey };
}

export const robloxSignInConfigured = (env: Env): boolean => configOf(env) !== null;

export function ensureRobloxOAuthTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  return oncePerIsolate('roblox-oauth', async () => {
    await env.CORPUS.prepare(
      `create table if not exists roblox_identities(roblox_sub text primary key, user_id text not null, username text not null, created_at text not null, reauth_at integer)`,
    ).run();
    // `reauth_at` (epoch ms, by the clock of this worker) is when this person last signed in with Roblox AS A RE-AUTHENTICATION: null
    // until then. Nothing is deployed, so no existing table needs the column added.
    // One Roblox account per StudPilot account. Nothing in M2 links a second one, and the index makes
    // sure nothing can by accident.
    await env.CORPUS.prepare('create unique index if not exists roblox_identities_user on roblox_identities(user_id)').run();
    // `version` is the compare-and-swap counter; `lease_until` (epoch ms) is held while a refresh is at Roblox. `generation` is
    // minted at every sign-in and kept by every refresh: `version` restarts at 1 when a disconnect deletes the row, so on its
    // own it cannot tell this grant from an earlier one, and the cache and the compare-and-swap would believe a stale one.
    await env.CORPUS.prepare(
      `create table if not exists roblox_oauth_tokens(user_id text primary key, sealed_refresh text not null, sub text not null, scopes text not null, version integer not null, generation text not null, rotated_at text not null, lease_until integer)`,
    ).run();
  }, env.CORPUS);
}

// ---------------------------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------------------------

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (bytes: number): string => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const s256 = async (verifier: string): Promise<string> =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

/** encodeURIComponent, so a space is %20 in the authorize URL and the bodies alike. */
const query = (params: Record<string, string>): string =>
  Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

const isSynthetic = (email: string | null | undefined): boolean =>
  typeof email === 'string' && email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);

/**
 * Where a person may be sent after signing in. App-relative (the router's basename is /app), from a short
 * list of the screens a sign-in is started from. Anything else is dropped to `/`, never followed.
 */
const RETURN_PATHS: readonly RegExp[] = [
  /^\/$/,
  /^\/(?:usage|settings)$/,
  /^\/projects\/[A-Za-z0-9-]{1,64}(?:\/(?:roadmap|branding))?$/,
  /^\/join\?token=[A-Za-z0-9_-]{16,128}$/,
];
export function allowedReturn(raw: unknown): string {
  return typeof raw === 'string' && raw.length <= 200 && RETURN_PATHS.some((re) => re.test(raw)) ? raw : '/';
}

function ownOrigin(req: Request): string | null {
  const origin = new URL(req.url).origin;
  return origin === PRODUCT_ORIGIN || origin === DEV_ORIGIN ? origin : null;
}

function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

/**
 * THE TWO FLOW COOKIES, AND WHO CAN PLANT THEM. A cookie is bound to a browser, not to a site that is allowed to set it: a
 * response over plain http before HSTS is known, or any sibling subdomain, can set a cookie with an ordinary name on this
 * host, and a state or handle planted that way reopens login CSRF (the victim is signed in as the attacker). On https the
 * names therefore carry the `__Host-` prefix, which a browser accepts only when the cookie is Secure, has Path=/ and no
 * Domain, so neither of those can set it. Only the registered http://localhost dev origin, where a Secure cookie is not
 * reliable, keeps the bare names (and the narrow paths, having no prefix to lean on). `__Secure-` would not do for a
 * path-scoped cookie: a sibling subdomain can still set one with Domain=studpilot.app.
 *
 * The prefixed name is the ONLY one read in production, so a request that carries just the bare name has no state and no handle.
 */
const HOST_PREFIX = '__Host-';
const isDevOrigin = (req: Request): boolean => new URL(req.url).origin === DEV_ORIGIN;
const flowCookieName = (base: string, dev: boolean): string => (dev ? base : HOST_PREFIX + base);
/** Path=/ is what `__Host-` demands. The dev cookies keep the narrow paths they always had. */
const flowCookieAttrs = (devPath: string, dev: boolean): string => (dev ? `Path=${devPath}; HttpOnly; SameSite=Lax` : 'Path=/; HttpOnly; SameSite=Lax; Secure');
const stateCookie = (state: string, dev: boolean): string => `${flowCookieName(STATE_COOKIE, dev)}=${state}; Max-Age=${STATE_TTL_SECONDS}; ${flowCookieAttrs('/auth/roblox', dev)}`;
const clearedStateCookie = (dev: boolean): string => `${flowCookieName(STATE_COOKIE, dev)}=; Max-Age=0; ${flowCookieAttrs('/auth/roblox', dev)}`;
const handleCookie = (handle: string, dev: boolean): string => `${flowCookieName(HANDLE_COOKIE, dev)}=${handle}; Max-Age=${HANDLE_TTL_SECONDS}; ${flowCookieAttrs(REDEEM_PATH, dev)}`;
const clearedHandleCookie = (dev: boolean): string => `${flowCookieName(HANDLE_COOKIE, dev)}=; Max-Age=0; ${flowCookieAttrs(REDEEM_PATH, dev)}`;
const readStateCookie = (req: Request): string => readCookie(req, flowCookieName(STATE_COOKIE, isDevOrigin(req)));
const readHandleCookie = (req: Request): string => readCookie(req, flowCookieName(HANDLE_COOKIE, isDevOrigin(req)));

/** Said to the person, and the only words an error ever carries: no provider text is reflected. */
const MESSAGES = {
  unavailable: 'Sign in with Roblox is not available right now.',
  busy: 'Too many attempts. Wait a minute and try again.',
  failed: 'We could not sign you in with Roblox. Go back to StudPilot and try again.',
} as const;

const HARDENING: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function reply(status: number, body: BodyInit | null, extra: Record<string, string>, cookies: readonly string[] = []): Response {
  const headers = new Headers({ ...HARDENING, ...extra });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(body, { status, headers });
}

/** `reference` is a fixed code from REFERENCES, never provider text: it lets a person quote what an operator can search for. */
function page(status: number, message: string, cookies: readonly string[] = [], reference?: string): Response {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>StudPilot</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px">'
    + `<p>${message}</p>${reference ? `<p>Reference: <code>${reference}</code></p>` : ''}<p><a href="/app/login">Back to StudPilot</a></p></body></html>`;
  return reply(status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  }, cookies);
}

const redirect = (location: string, cookies: readonly string[] = []): Response => reply(302, null, { Location: location }, cookies);

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const jsonReply = (status: number, body: unknown, cookies: readonly string[] = []): Response => reply(status, JSON.stringify(body), JSON_HEADERS, cookies);

/** The fixed codes an error page may show. An operator searches the log for the matching stage word. */
const REFERENCES = { addressTaken: 'roblox_address_taken' } as const;

/** The one log line this file writes: a fixed word for where it stopped, never a value. */
const note = (stage: string): void => console.warn(`[roblox-oauth] ${stage}`);

/** One outbound call. A thrown error or a timeout is `null`, which every caller treats as a failure. */
async function send(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  } catch {
    return null;
  }
}

async function jsonOf(res: Response | null): Promise<Record<string, unknown> | null> {
  if (!res) return null;
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// ---------------------------------------------------------------------------------------------
// Roblox
// ---------------------------------------------------------------------------------------------

const postToRoblox = (path: string, params: Record<string, string>): Promise<Response | null> =>
  send(`${OAUTH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: query(params),
  });

interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  /** How long the access token lives, in seconds (Roblox says 900). */
  expiresIn: number;
}

async function tokensFrom(res: Response | null): Promise<TokenSet | null> {
  if (!res?.ok) return null;
  const body = await jsonOf(res);
  const accessToken = str(body?.access_token);
  if (!accessToken) return null;
  const expiresIn = Number(body?.expires_in);
  return {
    accessToken,
    refreshToken: str(body?.refresh_token) || null,
    scope: str(body?.scope) || SIGNIN_SCOPE,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? Math.min(expiresIn, 900) : 900,
  };
}

const exchangeCode = (cfg: Config, code: string, verifier: string, redirectUri: string): Promise<TokenSet | null> =>
  postToRoblox('/token', {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  }).then(tokensFrom);

interface RobloxProfile {
  sub: string;
  username: string;
}

async function userinfo(accessToken: string): Promise<RobloxProfile | null> {
  const res = await send(`${OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const body = res?.ok ? await jsonOf(res) : null;
  const sub = typeof body?.sub === 'number' ? String(body.sub) : str(body?.sub);
  // The sub becomes part of an email address and a primary key. A Roblox user id is a number; anything
  // else is refused rather than escaped.
  if (!/^\d{1,20}$/.test(sub)) return null;
  // The first of the three that is still something once cleaned: an empty-looking username must not hide a usable display name.
  const name = [body?.preferred_username, body?.nickname, body?.name].map((n) => cleanName(str(n))).find((n) => n !== '');
  return { sub, username: name ?? `roblox-${sub}` };
}

/**
 * Display text from Roblox, made safe to store, put in a profile and show in Settings. Removes what cannot be seen or
 * that reorders what can: control characters (Cc, which include newlines and the C1 range), format characters (Cf: zero-width
 * and joiners, bidirectional overrides, isolates and embeddings), the line and paragraph separators, lone surrogates, and
 * the blank "letters" (Braille blank, Hangul fillers). Runs of space become one, the ends are trimmed, and the length is
 * capped at 100 CODE POINTS, so a cut never lands inside a surrogate pair. An empty result is the caller's cue to fall back.
 */
export function cleanName(raw: string): string {
  const visible = raw.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\u2800\u3164\u115f\u1160\uffa0]/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(visible).slice(0, 100).join('').trim();
}

/**
 * Revoke a stored refresh token at Roblox. True when the grant is dead afterwards: the call succeeded, or Roblox
 * answered 400 `invalid_token` (its documented answer for a token that is already revoked or expired). Any other
 * 400 (`invalid_request`, `invalid_client`: our own request or credentials were wrong, so the token may well be
 * live), a 401, a 429, a 5xx or no answer at all means it may still be live, and is false.
 */
async function revokeAtRoblox(cfg: Config, refreshToken: string): Promise<boolean> {
  const res = await postToRoblox('/token/revoke', { token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  if (!res) return false;
  if (res.ok) return true;
  return res.status === 400 && str((await jsonOf(res))?.error) === 'invalid_token';
}

// ---------------------------------------------------------------------------------------------
// Supabase Auth admin
// ---------------------------------------------------------------------------------------------

async function admin(env: Env, cfg: Config, method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> | null } | null> {
  // sb_secret_ keys are not JWTs and go in `apikey` only. A legacy service-role key is a JWT and the
  // Auth server wants it as the bearer too.
  const headers: Record<string, string> = { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' };
  if (cfg.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.supabaseKey}`;
  const res = await send(`${env.SUPABASE_URL}/auth/v1/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return res ? { status: res.status, json: await jsonOf(res) } : null;
}

/** The new user's id, 'exists' when the synthetic address is taken, or null on any other outcome. */
async function createAuthUser(env: Env, cfg: Config, email: string, who: RobloxProfile): Promise<string | 'exists' | null> {
  const res = await admin(env, cfg, 'POST', '/users', {
    email,
    email_confirm: true,
    // handle_new_user() copies display_name into the profile; without it the profile would be named
    // after the synthetic address.
    user_metadata: { display_name: who.username },
    app_metadata: { roblox_sub: who.sub },
  });
  if (!res) return null;
  if (res.status >= 200 && res.status < 300 && str(res.json?.id)) return str(res.json?.id);
  const said = `${str(res.json?.error_code)} ${str(res.json?.msg)} ${str(res.json?.message)}`;
  if (res.status === 422 && /email_exists|already.{0,20}regist/i.test(said)) return 'exists';
  return null;
}

/** A one-time sign-in token for the user that owns `email`, with who that user is. Sends no mail. */
async function mintLink(env: Env, cfg: Config, email: string): Promise<{ hashedToken: string; userId: string; robloxSub: string } | null> {
  const res = await admin(env, cfg, 'POST', '/generate_link', { type: 'magiclink', email });
  if (!res || res.status !== 200 || !res.json) return null;
  const nested = (res.json.properties ?? {}) as Record<string, unknown>;
  const user = (res.json.user ?? {}) as Record<string, unknown>;
  const hashedToken = str(res.json.hashed_token) || str(nested.hashed_token);
  const userId = str(res.json.id) || str(user.id);
  const meta = (res.json.app_metadata ?? user.app_metadata ?? {}) as Record<string, unknown>;
  return hashedToken && userId ? { hashedToken, userId, robloxSub: String(meta.roblox_sub ?? '') } : null;
}

/** One Supabase user as Auth holds them now: their address, 'gone' when Auth says there is no such user, null when we cannot tell. */
async function authUser(env: Env, cfg: Config, userId: string): Promise<{ email: string } | 'gone' | null> {
  const res = await admin(env, cfg, 'GET', `/users/${encodeURIComponent(userId)}`);
  if (!res) return null;
  // Only GoTrue's own "no such user" counts as gone. A bare 404 (a wrong SUPABASE_URL, a proxy's error page) says
  // nothing about this user, and acting on it would delete the link of everybody who signs in.
  if (res.status === 404) return /user_not_found|user.{0,12}not.{0,12}found/i.test(`${str(res.json?.error_code)} ${str(res.json?.msg)}`) ? 'gone' : null;
  const email = str(res.json?.email);
  return res.status === 200 && email ? { email } : null;
}

/** The token hash for `userId`, minted for `email`, which must be that user's CURRENT address. Null if the link is for anyone else. */
async function signInTokenFor(env: Env, cfg: Config, userId: string, email: string): Promise<string | null> {
  const link = await mintLink(env, cfg, email);
  return link && link.userId === userId ? link.hashedToken : null;
}

// ---------------------------------------------------------------------------------------------
// linking
// ---------------------------------------------------------------------------------------------

/**
 * The address a Roblox user's Supabase account is made with. A keyed digest of the `sub`, not the `sub`: Roblox ids
 * are public, and `roblox-<sub>@...` could be registered by anybody through the open sign-up before the real
 * Roblox user ever arrived, locking them out for good. It is only the address: the account is found by the link
 * in D1 and, for an interrupted sign-in, by `app_metadata.roblox_sub`.
 */
const syntheticEmail = async (env: Env, sub: string): Promise<string> =>
  `roblox-${await keyedId(env, ADDRESS_PURPOSE, sub)}@${SYNTHETIC_EMAIL_DOMAIN}`;

/** `address_taken`: the address exists and is not ours. `link`: it could not be said safely (Auth unreachable, a malformed answer). */
type Linked = { ok: true; userId: string; email: string } | { ok: false; code: 'link' | 'address_taken' };

/**
 * The StudPilot user this Roblox account is already linked to, found by `sub`: `'none'` when nobody here has seen it (or when
 * its link pointed at a user that no longer exists, which is the same thing), and a refusal when that cannot be told safely.
 * It makes nothing: a NEW account is made only by `userFor`, after the person has said they want one.
 */
async function findLinked(env: Env, cfg: Config, who: RobloxProfile): Promise<Linked | 'none'> {
  await ensureRobloxOAuthTables(env);
  const known = await env.CORPUS.prepare('select user_id, username from roblox_identities where roblox_sub = ?')
    .bind(who.sub).first<{ user_id: string; username: string }>();
  if (!known) return 'none';
  const user = await authUser(env, cfg, known.user_id);
  if (user === null) return { ok: false, code: 'link' };       // cannot tell: making a second account would be worse than failing
  if (user !== 'gone') {
    // The name is display text. Following a change keeps the same user; it never selects one.
    if (known.username !== who.username) {
      await env.CORPUS.prepare('update roblox_identities set username = ? where roblox_sub = ?').bind(who.username, who.sub).run();
    }
    return { ok: true, userId: known.user_id, email: user.email };
  }
  // The link points at a Supabase user that was deleted (by an operator, in the dashboard). Left alone it would
  // refuse this person for ever, so it goes, with the token row that belonged to that user, and the sign-in
  // goes on as a first sight. The token is deleted, not revoked: this sign-in has just obtained a new
  // authorization for the same Roblox account and revoking the old token could end it too (proof section 6).
  await env.CORPUS.prepare('delete from roblox_oauth_tokens where user_id = ?').bind(known.user_id).run();
  await env.CORPUS.prepare('delete from roblox_identities where roblox_sub = ? and user_id = ?').bind(who.sub, known.user_id).run();
  note('stale link dropped');
  return 'none';
}

/** The StudPilot user for this Roblox account: found by `sub`, or made once. Never one it cannot vouch for. Called only once the person has asked for a new account. */
async function userFor(env: Env, cfg: Config, who: RobloxProfile): Promise<Linked> {
  const found = await findLinked(env, cfg, who);
  if (found !== 'none') return found;

  const email = await syntheticEmail(env, who.sub);
  const made = await createAuthUser(env, cfg, email, who);
  let userId: string;
  if (made === null) return { ok: false, code: 'link' };
  if (made === 'exists') {
    // Either a sign-in that stopped halfway last time, or somebody who got hold of this address. Only the first
    // has our app_metadata on it, and the address is keyed, so the second should be impossible: if it happens
    // it is reported as its own failure rather than as a generic one.
    const link = await mintLink(env, cfg, email);
    if (!link) return { ok: false, code: 'link' };
    if (link.robloxSub !== who.sub) return { ok: false, code: 'address_taken' };
    userId = link.userId;
  } else {
    userId = made;
  }
  // First writer wins. Two callbacks for one new sub both reach here with the same user id (the address
  // is derived from the sub, so Supabase can hold only one), and the row read back is the answer.
  await env.CORPUS.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at) values (?, ?, ?, ?) on conflict(roblox_sub) do nothing')
    .bind(who.sub, userId, who.username, new Date().toISOString()).run();
  const row = await env.CORPUS.prepare('select user_id from roblox_identities where roblox_sub = ?').bind(who.sub).first<{ user_id: string }>();
  return row ? { ok: true, userId: row.user_id, email } : { ok: false, code: 'link' };
}

/**
 * A fresh sign-in REPLACES the stored refresh token, and the previous one is deliberately NOT revoked. The version
 * bump voids any refresh in flight and the cached access token. Revoking the previous token would end the new
 * authorization too if Roblox ties the tokens of one authorization together, and gains nothing if it does not:
 * the previous token is held nowhere in this system once the row is overwritten, so nobody here can use it.
 * Section 6 of planning/proof/M2/ROBLOX-SIGNIN.md says what to check on the first live run.
 */
async function storeSealedRefresh(env: Env, userId: string, sub: string, scope: string, sealed: string | null): Promise<void> {
  if (!sealed) return;
  await env.CORPUS.prepare(
    `insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, generation, rotated_at, lease_until) values (?, ?, ?, ?, 1, ?, ?, null)
     on conflict(user_id) do update set sealed_refresh = excluded.sealed_refresh, sub = excluded.sub, scopes = excluded.scopes,
       version = roblox_oauth_tokens.version + 1, generation = excluded.generation, rotated_at = excluded.rotated_at, lease_until = null`,
  ).bind(userId, sealed, sub, scope, randomToken(16), new Date().toISOString()).run();
}

// ---------------------------------------------------------------------------------------------
// the routes
// ---------------------------------------------------------------------------------------------

interface StateRecord {
  verifier: string;
  returnTo: string;
  redirectUri: string;
  /**
   * `reauth`: the person is confirming it is them (a Roblox-only account has no password), not signing in for the first time or
   * again. It asked Roblox for a fresh login, it never makes an account, and a success records the time on the server.
   * A record without the field (one stored before it existed) is an ordinary sign-in.
   */
  purpose: 'signin' | 'reauth';
}

async function start(req: Request, env: Env): Promise<Response> {
  const cfg = configOf(env);
  if (!cfg) return page(503, MESSAGES.unavailable);
  const url = new URL(req.url);
  const origin = ownOrigin(req);
  // A flow must start on the host it will come back to, or the state cookie is on the wrong host.
  if (!origin) return redirect(`${PRODUCT_ORIGIN}${url.pathname}${url.search}`);

  // `reauth=<action>` marks a re-authentication, and the action rides back to Settings so it can be resumed. A value that is not
  // an action id is not a re-authentication: the flow is an ordinary sign-in, as a bad `return` is dropped to `/`.
  const asked = url.searchParams.get('reauth');
  const action = asked !== null && REAUTH_ACTION.test(asked) ? asked : null;
  const state = randomToken(32);
  const verifier = randomToken(48);
  const record: StateRecord = {
    verifier,
    returnTo: action ? `/settings?resume=${action}` : allowedReturn(url.searchParams.get('return')),
    redirectUri: `${origin}${CALLBACK_PATH}`,
    purpose: action ? 'reauth' : 'signin',
  };
  await env.KV.put(STATE_PREFIX + state, JSON.stringify(record), { expirationTtl: STATE_TTL_SECONDS });
  const authorize = `${OAUTH}/authorize?` + query({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: record.redirectUri,
    scope: SIGNIN_SCOPE,
    state,
    code_challenge: await s256(verifier),
    code_challenge_method: 'S256',
    // A re-authentication must not be answered from a Roblox session that is already open in the browser: whoever is at an
    // unlocked screen would be bounced straight back and the round trip would prove nothing. OpenID Connect's `prompt=login` asks
    // the provider to ask again and `max_age=0` says no earlier login is recent enough. Whether Roblox honours either is NOT
    // confirmed by anything saved in this repository (proof section 6, item 8).
    ...(action ? { prompt: 'login', max_age: '0' } : {}),
  });
  return redirect(authorize, [stateCookie(state, isDevOrigin(req))]);
}

function parseRecord(raw: string | null): StateRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<StateRecord>;
    return r.verifier && r.redirectUri && typeof r.returnTo === 'string'
      ? { verifier: r.verifier, returnTo: r.returnTo, redirectUri: r.redirectUri, purpose: r.purpose === 'reauth' ? 'reauth' : 'signin' }
      : null;
  } catch {
    return null;
  }
}

/**
 * What an address has spent of its STRAY allowance: requests with no usable state or handle, and well-formed ones nobody holds.
 * `spent` is asked BEFORE anything is read from KV and counts nothing; `strike` counts one stray, after a read found nobody
 * holding the value. So an address that has used its allowance gets an answer that cost no KV read, however many fresh random
 * values it sends; and so does a real flow from that address, until the minute is out (nothing of it is burned meanwhile).
 */
interface Strays {
  spent(): boolean;
  strike(): boolean;
}

/** The first sight of a Roblox account that nobody here has seen. Held, sealed, until the person says whether they want an account made. */
interface PendingAccount {
  sub: string;
  username: string;
  /** The Roblox refresh token, sealed with CREDENTIAL_KEY like the stored one; null when Roblox sent none. */
  sealedRefresh: string | null;
  scope: string;
}

/**
 * What waits in KV behind a handle. `tokenHash`: a sign-in that is ready, redeemed once. `pending`: a first sight that is waiting
 * for the person to press Continue; /create turns it into the first kind, /decline withdraws it.
 */
type HandleRecord = { tokenHash: string; next: string } | { pending: PendingAccount; next: string };

function parseHandle(raw: string | null): HandleRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as { tokenHash?: unknown; next?: unknown; pending?: Record<string, unknown> | null };
    if (typeof r.next !== 'string') return null;
    if (typeof r.tokenHash === 'string' && r.tokenHash) return { tokenHash: r.tokenHash, next: r.next };
    const p = r.pending;
    if (p && /^\d{1,20}$/.test(str(p.sub)) && str(p.username) && str(p.scope) && (p.sealedRefresh === null || typeof p.sealedRefresh === 'string')) {
      return { pending: { sub: str(p.sub), username: str(p.username), sealedRefresh: p.sealedRefresh as string | null, scope: str(p.scope) }, next: r.next };
    }
    return null;
  } catch {
    return null;
  }
}

async function callback(req: Request, env: Env, strays: Strays): Promise<Response> {
  const cfg = configOf(env);
  if (!cfg) return page(503, MESSAGES.unavailable);
  const url = new URL(req.url);
  const clear = [clearedStateCookie(isDevOrigin(req))];
  const fail = (status: number, stage: string, reference?: string): Response => {
    note(stage);
    return page(status, MESSAGES.failed, clear, reference);
  };

  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const validShape = FLOW_TOKEN.test(state);
  // An address that has already used up its stray allowance is answered before KV is asked anything, so fresh random states
  // cannot cost reads. Nothing is burned and no cookie is cleared: a real flow from that address can finish once the minute is out.
  if (validShape && strays.spent()) return page(429, MESSAGES.busy);
  // Burn the state before anything else is looked at: whatever happens next, this one cannot be used again.
  const raw = validShape ? await env.KV.get(STATE_PREFIX + state) : null;
  if (raw !== null) await env.KV.delete(STATE_PREFIX + state);
  const record = parseRecord(raw);
  if (!record) {
    // A state nobody holds is never a legitimate request. It is keyed by itself (so a flow is never refused for what its neighbours
    // do), which would let unlimited fresh states hammer KV, so each one also counts against the address's stray allowance.
    if (validShape && strays.strike()) return page(429, MESSAGES.busy, clear);
    return fail(400, 'state unknown or already used');
  }
  if (readStateCookie(req) !== state) return fail(400, 'state not bound to this browser');
  if (!code || url.searchParams.has('error')) return fail(400, 'no code');

  const tokens = await exchangeCode(cfg, code, record.verifier, record.redirectUri);
  if (!tokens) return fail(502, 'code exchange');
  const who = await userinfo(tokens.accessToken);
  if (!who) return fail(502, 'userinfo');

  try {
    const known = await findLinked(env, cfg, who);
    // A different status, stage and reference from the generic failure, so an operator can tell it at a glance.
    if (known !== 'none' && !known.ok) return fail(502, 'account link');
    const sealed = tokens.refreshToken ? await sealSecret(env, tokens.refreshToken) : null;
    let waiting: HandleRecord;
    if (known === 'none') {
      // Nobody here has seen this Roblox account. A re-authentication is for an account that exists, and never makes one.
      if (record.purpose === 'reauth') {
        // The authorization Roblox has just given is for an account that has no StudPilot account here: withdraw it, as a "Go back" does.
        if (tokens.refreshToken && !(await revokeAtRoblox(cfg, tokens.refreshToken))) note('reauthentication revoke');
        return fail(403, 'reauthentication without a linked account');
      }
      // Nothing is made yet. The person is asked first ("This creates a new StudPilot account. Already have one? Sign in with your
      // email instead."), because somebody with an email account who presses "Continue with Roblox" would otherwise get a second,
      // empty account without noticing, and think their projects were gone.
      waiting = { pending: { sub: who.sub, username: who.username, sealedRefresh: sealed, scope: tokens.scope }, next: record.returnTo };
    } else {
      await storeSealedRefresh(env, known.userId, who.sub, tokens.scope, sealed);
      const hashed = await signInTokenFor(env, cfg, known.userId, known.email);
      if (!hashed) return fail(502, 'sign-in token');
      // The server's own record that this person confirmed it is them, written only once the whole sign-in has worked.
      if (record.purpose === 'reauth') await stampReauth(env, known.userId);
      waiting = { tokenHash: hashed, next: record.returnTo };
    }
    // Nothing reaches the URL. The record waits in KV behind a random handle, and the handle goes only to THIS browser, in a
    // cookie that only /redeem (and, for a first sight, /create and /decline) receives: a link made from this response signs in nobody who does not hold the cookie.
    const handle = randomToken(32);
    await env.KV.put(HANDLE_PREFIX + handle, JSON.stringify(waiting), { expirationTtl: HANDLE_TTL_SECONDS });
    return redirect(LANDING_PATH, [...clear, handleCookie(handle, isDevOrigin(req))]);
  } catch {
    return fail(502, 'storage');
  }
}

/**
 * The browser's handle cookie, looked up: its record, or the refusal to send. The Origin check has already run (it spends
 * nothing). An address that has used up its stray allowance is refused BEFORE KV is read; a handle nobody holds is a stray.
 */
async function lookUpHandle(req: Request, env: Env, strays: Strays, clear: readonly string[]): Promise<{ handle: string; rec: HandleRecord } | Response> {
  const handle = readHandleCookie(req);
  const shaped = FLOW_TOKEN.test(handle);
  if (shaped && strays.spent()) return jsonReply(429, { error: MESSAGES.busy });
  const raw = shaped ? await env.KV.get(HANDLE_PREFIX + handle) : null;
  const rec = parseHandle(raw);
  if (!rec) {
    if (raw !== null) await env.KV.delete(HANDLE_PREFIX + handle);       // nothing readable is kept under a handle
    // The same as an unknown state: a handle nobody holds also counts against the address's stray allowance.
    if (shaped && strays.strike()) return jsonReply(429, { error: MESSAGES.busy }, clear);
    note('handle unknown or already used');
    return jsonReply(400, { error: MESSAGES.failed }, clear);
  }
  return { handle, rec };
}

/** The Origin check shared by the three routes the SPA POSTs to: refused before the handle is looked at, so a hostile page spends nothing. */
function sameOriginRefusal(req: Request, what: string): Response | null {
  const origin = ownOrigin(req);
  if (origin && req.headers.get('Origin') === origin) return null;
  note(`${what} from another origin`);
  return jsonReply(403, { error: MESSAGES.failed });
}

/**
 * The SPA's landing page calls this (POST, same origin, no body) to turn the handle cookie into the sign-in token.
 * A ready sign-in answers once: the handle is read and burned, and the cookie is cleared whatever the outcome. A first sight
 * answers `{confirm: 'new-account', username}` and spends nothing: the person has to say whether they want an account made.
 */
async function redeem(req: Request, env: Env, strays: Strays): Promise<Response> {
  const cfg = configOf(env);
  const clear = [clearedHandleCookie(isDevOrigin(req))];
  if (!cfg) return jsonReply(503, { error: MESSAGES.unavailable });        // nothing read, nothing cleared: it can still be redeemed once the secrets are back
  const refused = sameOriginRefusal(req, 'redeem');
  if (refused) return refused;
  const found = await lookUpHandle(req, env, strays, clear);
  if (found instanceof Response) return found;
  const { handle, rec } = found;
  if ('pending' in rec) return jsonReply(200, { confirm: 'new-account', username: rec.pending.username, next: rec.next });
  await env.KV.delete(HANDLE_PREFIX + handle);
  return jsonReply(200, { token_hash: rec.tokenHash, next: rec.next }, clear);
}

/**
 * "Continue": the person has been told this makes a NEW StudPilot account and has said yes. Only this makes the user. The pending
 * first sight becomes an ordinary ready sign-in under the same handle, which /redeem then hands over once. Nothing is burned on a
 * failure, so pressing Continue again is possible; making the user is idempotent (the address is keyed by the `sub`).
 */
async function createAccount(req: Request, env: Env, strays: Strays): Promise<Response> {
  const cfg = configOf(env);
  if (!cfg) return jsonReply(503, { error: MESSAGES.unavailable });
  const refused = sameOriginRefusal(req, 'create');
  if (refused) return refused;
  const found = await lookUpHandle(req, env, strays, [clearedHandleCookie(isDevOrigin(req))]);
  if (found instanceof Response) return found;
  const { handle, rec } = found;
  if (!('pending' in rec)) {
    note('nothing waiting to be created');
    return jsonReply(400, { error: MESSAGES.failed });
  }
  try {
    const who: RobloxProfile = { sub: rec.pending.sub, username: rec.pending.username };
    const linked = await userFor(env, cfg, who);
    if (!linked.ok) {
      if (linked.code === 'address_taken') {
        note('synthetic address taken');
        return jsonReply(409, { error: MESSAGES.failed, reference: REFERENCES.addressTaken });
      }
      note('account link');
      return jsonReply(502, { error: MESSAGES.failed });
    }
    await storeSealedRefresh(env, linked.userId, who.sub, rec.pending.scope, rec.pending.sealedRefresh);
    const hashed = await signInTokenFor(env, cfg, linked.userId, linked.email);
    if (!hashed) {
      note('sign-in token');
      return jsonReply(502, { error: MESSAGES.failed });
    }
    await env.KV.put(HANDLE_PREFIX + handle, JSON.stringify({ tokenHash: hashed, next: rec.next } satisfies HandleRecord), { expirationTtl: HANDLE_TTL_SECONDS });
    return jsonReply(200, { created: true });
  } catch {
    note('storage');
    return jsonReply(502, { error: MESSAGES.failed });
  }
}

/**
 * "Go back": the person does not want a new account. The pending record is deleted, and the authorization Roblox just gave (for an
 * account that will not exist) is withdrawn rather than left in their Connected apps. Nothing was made, so nothing is deleted.
 */
async function declineAccount(req: Request, env: Env, strays: Strays): Promise<Response> {
  const cfg = configOf(env);
  if (!cfg) return jsonReply(503, { error: MESSAGES.unavailable });
  const refused = sameOriginRefusal(req, 'decline');
  if (refused) return refused;
  const clear = [clearedHandleCookie(isDevOrigin(req))];
  const found = await lookUpHandle(req, env, strays, clear);
  if (found instanceof Response) return found;
  const { handle, rec } = found;
  if (!('pending' in rec)) {
    note('nothing waiting to be declined');
    return jsonReply(400, { error: MESSAGES.failed });
  }
  await env.KV.delete(HANDLE_PREFIX + handle);
  const token = rec.pending.sealedRefresh ? await openSecret(env, rec.pending.sealedRefresh) : null;
  if (token && !(await revokeAtRoblox(cfg, token))) note('decline revoke');
  return jsonReply(200, { declined: true }, clear);
}

/**
 * THE LIMITS, one bucket per kind of request, because they protect different things and a school lab shares one address.
 *
 * - `status` runs on every visit to the sign-in page: 120 a minute for the address.
 * - `start` is the only request a person can be refused before they have spent anything: 60 a minute for the address, so a
 *   lab of thirty can sign in together.
 * - `callback` and the handle routes (`redeem`, `create`, `decline`) come AFTER the person has consented at Roblox, and a refusal
 *   there throws that sign-in away. So they are keyed by their own state or handle (5 a minute: one use, and a reload or two),
 *   never by the shared address; a state and a handle are single use anyway, which is the replay protection, and the bucket only
 *   bounds how hard one already-spent value can be hammered. A request with no usable state or handle is never a legitimate one,
 *   and shares a per-address bucket of its own (60 a minute) that no real flow touches; so does a well-formed state or handle that
 *   nobody holds (random, replayed, expired), which the handler counts against that same bucket, because a bucket per value would
 *   otherwise let fresh random values through for ever. That bucket is asked BEFORE KV is read (`Strays.spent`), so an address
 *   that has used it up costs no more reads.
 *
 * `ipLimited` is per isolate and evicts the least active key first under a flood, so none of this is a global ceiling:
 * flooding is for Cloudflare's own rate limiting in front of the worker.
 */
function limitFor(req: Request, ip: string): { key: string; limit: number } {
  const path = new URL(req.url).pathname;
  if (path.endsWith('/status')) return { key: `rbx-status:${ip}`, limit: 120 };
  if (path.endsWith('/start')) return { key: `rbx-start:${ip}`, limit: 60 };
  if (path.endsWith('/callback')) {
    const state = new URL(req.url).searchParams.get('state') ?? '';
    return FLOW_TOKEN.test(state) ? { key: `rbx-callback:${state}`, limit: 5 } : { key: `rbx-callback-stray:${ip}`, limit: 60 };
  }
  if (path.endsWith('/redeem') || path.endsWith('/create') || path.endsWith('/decline')) {
    // Only a request from the app's own origin spends the handle's bucket, so another page (or a sibling subdomain, whose
    // requests do carry the cookie) cannot use up a person's allowance and make their real redeem fail.
    const handle = readHandleCookie(req);
    const own = ownOrigin(req);
    return FLOW_TOKEN.test(handle) && own !== null && req.headers.get('Origin') === own
      ? { key: `rbx-redeem:${handle}`, limit: 5 }
      : { key: `rbx-redeem-stray:${ip}`, limit: 60 };
  }
  return { key: `rbx-other:${ip}`, limit: 60 };
}

/** The stray allowance of one kind of request (the bucket `limitFor` names for a request with no usable value). */
export const STRAY_LIMIT = 60;

/** `spent(key, limit)`: has `key` already used `limit` in its window? Counts nothing. The router's own (index.ts `ipSpent`). */
export type IpSpent = (key: string, limit: number) => boolean;

/**
 * The routes under /auth/roblox. The limiter is the worker's own (index.ts `ipLimited`) and is handed in,
 * because that function lives in the router and this file may not import it back; so is its read-only twin `ipSpent`.
 */
export function robloxOAuthRoutes(limited: IpLimiter, spent: IpSpent = () => false): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  const ipOf = (c: { req: { header(name: string): string | undefined } }): string => c.req.header('CF-Connecting-IP') ?? 'unknown';
  const straysOf = (kind: 'callback' | 'redeem', ip: string): Strays => {
    const key = `rbx-${kind}-stray:${ip}`;
    return { spent: () => spent(key, STRAY_LIMIT), strike: () => limited(key, STRAY_LIMIT) };
  };

  routes.use('*', async (c, next) => {
    const { key, limit } = limitFor(c.req.raw, ipOf(c));
    if (limited(key, limit)) return page(429, MESSAGES.busy);
    return next();
  });

  routes.get('/status', (c) =>
    reply(200, JSON.stringify({ configured: robloxSignInConfigured(c.env) }), { 'Content-Type': 'application/json; charset=utf-8' }));

  routes.get('/start', async (c) => {
    try {
      return await start(c.req.raw, c.env);
    } catch {
      // Nothing from the error is kept: its message can carry a URL, and a URL here carries a code.
      note('unexpected failure');
      return page(500, MESSAGES.failed, [clearedStateCookie(isDevOrigin(c.req.raw))]);
    }
  });
  routes.get('/callback', async (c) => {
    try {
      return await callback(c.req.raw, c.env, straysOf('callback', ipOf(c)));
    } catch {
      note('unexpected failure');
      return page(500, MESSAGES.failed, [clearedStateCookie(isDevOrigin(c.req.raw))]);
    }
  });
  routes.post('/redeem', async (c) => {
    try {
      return await redeem(c.req.raw, c.env, straysOf('redeem', ipOf(c)));
    } catch {
      note('unexpected failure');
      return jsonReply(500, { error: MESSAGES.failed }, [clearedHandleCookie(isDevOrigin(c.req.raw))]);
    }
  });
  // These two leave the cookie alone when they fail: the person is still holding a pending first sight and can press the button again.
  routes.post('/create', async (c) => {
    try {
      return await createAccount(c.req.raw, c.env, straysOf('redeem', ipOf(c)));
    } catch {
      note('unexpected failure');
      return jsonReply(500, { error: MESSAGES.failed });
    }
  });
  routes.post('/decline', async (c) => {
    try {
      return await declineAccount(c.req.raw, c.env, straysOf('redeem', ipOf(c)));
    } catch {
      note('unexpected failure');
      return jsonReply(500, { error: MESSAGES.failed });
    }
  });
  return routes;
}

/**
 * RE-AUTHENTICATION, as the server keeps it. A Roblox-only account has no password, so "type your password again" is "sign in with
 * Roblox again": a flow started with `reauth=<action>` that asked Roblox for a fresh login and ended in a successful sign-in.
 * Its time is written here, by the server's clock, and read here: the gated worker routes (export, delete) and the SPA's gate
 * ask this, and nothing compares it with a device clock or with the session's `last_sign_in_at`.
 */
async function stampReauth(env: Env, userId: string, now = Date.now()): Promise<void> {
  await env.CORPUS.prepare('update roblox_identities set reauth_at = ? where user_id = ?').bind(now, userId).run();
}

/** Did this person confirm it is them with Roblox in the last REAUTH_WINDOW_MS, by the server's clock? */
export async function robloxReauthFresh(env: Env, userId: string, now = Date.now()): Promise<boolean> {
  await ensureRobloxOAuthTables(env);
  const row = await env.CORPUS.prepare('select reauth_at from roblox_identities where user_id = ?').bind(userId).first<{ reauth_at: number | null }>();
  const at = row?.reauth_at;
  if (typeof at !== 'number') return false;
  const age = now - at;
  return age >= -REAUTH_CLOCK_NOISE_MS && age <= REAUTH_WINDOW_MS;
}

/**
 * The refusal for a gated worker route (export, delete) when the caller is a Roblox-only account that has not confirmed it is them,
 * or null when the route may go on. Every other account proves who it is with its password, in the SPA, as before.
 */
export async function robloxReauthRefusal(env: Env, user: AuthedUser): Promise<{ status: 403; body: { error: string; code: 'reauth_required' } } | null> {
  if (!isSynthetic(user.email)) return null;
  if (await robloxReauthFresh(env, user.userId)) return null;
  return { status: 403, body: { error: 'This account signs in with Roblox. Confirm it is you by signing in with Roblox again, then try this again.', code: 'reauth_required' } };
}

// ---------------------------------------------------------------------------------------------
// refreshing, disconnecting, describing
// ---------------------------------------------------------------------------------------------

export type RefreshResult =
  | { ok: true; accessToken: string; scope: string; version: number }
  | { ok: false; reason: 'not_connected' | 'busy' | 'refused' | 'unavailable' };

interface TokenRow {
  sealed_refresh: string;
  version: number;
  generation: string;
  scopes: string;
}

/**
 * The access token last handed out for each person, in this isolate's memory only. Roblox gives a new one per refresh and
 * every refresh spends the single-use refresh token, so callers that arrive together should share one rather than
 * each spend a rotation. An entry is used only while it is unexpired AND the stored row is still the version AND the
 * generation it was issued under: a new sign-in (version bump, new generation) voids it, a disconnect (no row) is answered
 * `not_connected` before the cache is consulted, and a disconnect followed by sign-ins that bring the row back to the same
 * version number is another generation, so a token from the revoked grant is never served. Bounded, oldest out.
 */
const accessTokens = new Map<string, { accessToken: string; scope: string; version: number; generation: string; until: number }>();
const ACCESS_TOKEN_CACHE_MAX = 256;

/**
 * A fresh 15-minute access token for one person, spending and replacing their refresh token.
 *
 * ROBLOX REFRESH TOKENS ARE SINGLE USE, so "read it, call Roblox, write the new one" is a race: two requests
 * that both read it both spend it, one fails, and the failure may cost the person their grant. The row is
 * therefore claimed first. Only the request whose conditional update changes a row (same `version`, no live
 * lease) may call Roblox; the other is told `busy` and may retry. The new token is then written by
 * compare-and-swap on that same `version`, so a sign-in or a disconnect that landed in between wins and the
 * stale replacement is discarded and revoked.
 *
 * Nothing calls this yet: it is the building block for uploads into the person's own account (M5c).
 */
export async function refreshRobloxAccessToken(env: Env, userId: string, now = Date.now()): Promise<RefreshResult> {
  const cfg = configOf(env);
  if (!cfg) return { ok: false, reason: 'unavailable' };
  await ensureRobloxOAuthTables(env);
  const row = await env.CORPUS.prepare('select sealed_refresh, version, generation, scopes from roblox_oauth_tokens where user_id = ?')
    .bind(userId).first<TokenRow>();
  if (!row) return { ok: false, reason: 'not_connected' };
  const cached = accessTokens.get(userId);
  if (cached && cached.version === row.version && cached.generation === row.generation && cached.until > now) {
    return { ok: true, accessToken: cached.accessToken, scope: cached.scope, version: cached.version };
  }

  const claim = await env.CORPUS.prepare(
    'update roblox_oauth_tokens set lease_until = ? where user_id = ? and version = ? and generation = ? and (lease_until is null or lease_until < ?)',
  ).bind(now + REFRESH_LEASE_MS, userId, row.version, row.generation, now).run();
  if (Number(claim.meta?.changes ?? 0) === 0) return { ok: false, reason: 'busy' };
  const release = (): Promise<unknown> =>
    env.CORPUS.prepare('update roblox_oauth_tokens set lease_until = null where user_id = ? and version = ? and generation = ?').bind(userId, row.version, row.generation).run();

  const refreshToken = await openSecret(env, row.sealed_refresh);
  if (!refreshToken) {
    await release();
    return { ok: false, reason: 'refused' };
  }
  const res = await postToRoblox('/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const tokens = await tokensFrom(res);
  if (!tokens?.refreshToken) {
    await release();
    // A 4xx is Roblox saying this grant is no good (revoked, expired, already used); anything else may be tried again.
    // A 429 is the exception among the 4xx: the grant is fine, the caller was too fast.
    return { ok: false, reason: res && res.status >= 400 && res.status < 500 && res.status !== 429 ? 'refused' : 'unavailable' };
  }

  const swap = await env.CORPUS.prepare(
    `update roblox_oauth_tokens set sealed_refresh = ?, scopes = ?, version = version + 1, rotated_at = ?, lease_until = null
     where user_id = ? and version = ? and generation = ?`,
  ).bind(await sealSecret(env, tokens.refreshToken), tokens.scope, new Date(now).toISOString(), userId, row.version, row.generation).run();
  if (Number(swap.meta?.changes ?? 0) === 0) {
    // The row moved on while we were at Roblox. The replacement we hold belongs to no row; do not leave it live.
    await revokeAtRoblox(cfg, tokens.refreshToken);
    return { ok: false, reason: 'busy' };
  }
  if (accessTokens.size >= ACCESS_TOKEN_CACHE_MAX) accessTokens.delete(accessTokens.keys().next().value as string);
  accessTokens.set(userId, { accessToken: tokens.accessToken, scope: tokens.scope, version: row.version + 1, generation: row.generation, until: now + tokens.expiresIn * 1000 - ACCESS_TOKEN_MARGIN_MS });
  return { ok: true, accessToken: tokens.accessToken, scope: tokens.scope, version: row.version + 1 };
}

/**
 * Revoke the stored grant at Roblox ahead of deleting our copy. Never throws. 'none' when nothing was
 * stored, 'revoked' when Roblox no longer honours it, 'not_revoked' when we could not make sure.
 */
export async function revokeStoredRobloxGrant(env: Env, userId: string): Promise<'none' | 'revoked' | 'not_revoked'> {
  try {
    await ensureRobloxOAuthTables(env);
    const row = await env.CORPUS.prepare('select sealed_refresh from roblox_oauth_tokens where user_id = ?').bind(userId).first<{ sealed_refresh: string }>();
    if (!row) return 'none';
    const cfg = configOf(env);
    const token = cfg ? await openSecret(env, row.sealed_refresh) : null;
    return cfg && token && (await revokeAtRoblox(cfg, token)) ? 'revoked' : 'not_revoked';
  } catch {
    return 'not_revoked';
  }
}

export interface DisconnectResult {
  status: 200 | 500 | 502 | 503;
  body:
    | { revoked: true | null; tokenRemoved: boolean; linkRemoved: boolean; signInKept: boolean }
    | { error: string; code: 'unavailable' | 'token_unreadable' | 'revoke_failed' };
}

/**
 * Disconnect Roblox. Idempotent: a second call finds nothing and says so.
 *
 * The grant is revoked at Roblox first, and NOTHING is deleted unless that is confirmed, because the sealed token is the
 * only handle there is to revoke it with. That includes the cases where Roblox cannot even be asked: a missing secret
 * (503) or a sealed token that cannot be opened, e.g. after a key rotation (500). Each answers an error that says nothing
 * was changed and carries no success field, never `revoked: false` inside a 200. Then the token row goes, and so does
 * the identity link, EXCEPT while the account's only way in is Roblox (its address is still the synthetic one): without
 * the link the next Roblox sign-in would open a new, empty account and this one would be unreachable. In that case the
 * access to Roblox is gone and the sign-in link stays, and the answer says so.
 */
export async function disconnectRoblox(env: Env, user: AuthedUser): Promise<DisconnectResult> {
  await ensureRobloxOAuthTables(env);
  const row = await env.CORPUS.prepare('select sealed_refresh from roblox_oauth_tokens where user_id = ?').bind(user.userId).first<{ sealed_refresh: string }>();
  let revoked: true | null = null;
  if (row) {
    const cfg = configOf(env);
    if (!cfg) {
      note('disconnect without credentials');
      return { status: 503, body: { error: 'Roblox sign-in is not available right now, so StudPilot could not ask Roblox to withdraw its access. Nothing was changed. Try again later.', code: 'unavailable' } };
    }
    const token = await openSecret(env, row.sealed_refresh);
    if (!token) {
      note('disconnect token unreadable');
      return { status: 500, body: { error: 'StudPilot could not read the stored Roblox connection, so it could not ask Roblox to withdraw its access. Nothing was changed. Contact support.', code: 'token_unreadable' } };
    }
    if (!(await revokeAtRoblox(cfg, token))) {
      note('revoke');
      return { status: 502, body: { error: 'Roblox could not be reached, so nothing was changed. Try again in a minute.', code: 'revoke_failed' } };
    }
    revoked = true;
  }
  const tokenRemoved = Number((await env.CORPUS.prepare('delete from roblox_oauth_tokens where user_id = ?').bind(user.userId).run()).meta?.changes ?? 0) > 0;
  const onlyWayIn = isSynthetic(user.email);
  const linkRemoved = onlyWayIn
    ? false
    : Number((await env.CORPUS.prepare('delete from roblox_identities where user_id = ?').bind(user.userId).run()).meta?.changes ?? 0) > 0;
  const kept = onlyWayIn && (await env.CORPUS.prepare('select 1 as present from roblox_identities where user_id = ?').bind(user.userId).first()) !== null;
  return { status: 200, body: { revoked, tokenRemoved, linkRemoved, signInKept: kept } };
}

export interface RobloxConnection {
  configured: boolean;
  connected: boolean;
  username: string | null;
  linkedAt: string | null;
  /** True while the account's address is still the synthetic one, so Roblox is the only way in. */
  signInOnly: boolean;
  /** True when the person confirmed it is them with Roblox within the last ten minutes, by the SERVER's clock. The SPA's gate asks this instead of comparing timestamps with the device's clock. */
  reauthFresh: boolean;
}

export async function describeRobloxConnection(env: Env, user: AuthedUser): Promise<RobloxConnection> {
  await ensureRobloxOAuthTables(env);
  const row = await env.CORPUS.prepare('select username, created_at from roblox_identities where user_id = ?')
    .bind(user.userId).first<{ username: string; created_at: string }>();
  return {
    configured: robloxSignInConfigured(env),
    connected: row !== null,
    username: row?.username ?? null,
    linkedAt: row?.created_at ?? null,
    signInOnly: isSynthetic(user.email),
    reauthFresh: row !== null && (await robloxReauthFresh(env, user.userId)),
  };
}
