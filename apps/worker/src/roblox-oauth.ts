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
//   - an account is found by `sub`. A username is display text that Roblox lets people change and reuse, so
//     linking by it would let a second person take an account over;
//   - the synthetic address is a KEYED digest of the `sub` (HMAC under CREDENTIAL_KEY). A Roblox id is public,
//     so an address derived from it alone could be registered by anybody through the open sign-up, and the
//     real Roblox user would be locked out for good. And an existing user with the address is still adopted
//     only when the admin-written app_metadata names the same `sub`, else the sign-in fails closed;
//   - the Roblox refresh token is single use. Before the worker spends it, it claims a lease on the row, and
//     it stores the replacement by compare-and-swap on `version`, so two requests can never both spend it;
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
/** The only origins a redirect_uri may be built from: the product, and the registered dev server. */
const DEV_ORIGIN = 'http://localhost:5173';
/** RFC 2606 `.invalid` can never be delivered to, so no mail goes anywhere by accident. */
const SYNTHETIC_EMAIL_DOMAIN = 'users.studpilot.invalid';
/** Domain-separates the keyed digest the address is made from (user-credentials.ts `keyedId`). Never change it: addresses derive from it. */
const ADDRESS_PURPOSE = 'roblox-signin-address';
const OUTBOUND_TIMEOUT_MS = 10_000;
const REFRESH_LEASE_MS = 30_000;
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
      `create table if not exists roblox_identities(roblox_sub text primary key, user_id text not null, username text not null, created_at text not null)`,
    ).run();
    // One Roblox account per StudPilot account. Nothing in M2 links a second one, and the index makes
    // sure nothing can by accident.
    await env.CORPUS.prepare('create unique index if not exists roblox_identities_user on roblox_identities(user_id)').run();
    // `version` is the compare-and-swap counter; `lease_until` (epoch ms) is held while a refresh is at Roblox.
    await env.CORPUS.prepare(
      `create table if not exists roblox_oauth_tokens(user_id text primary key, sealed_refresh text not null, sub text not null, scopes text not null, version integer not null, rotated_at text not null, lease_until integer)`,
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

/** HttpOnly, SameSite=Lax, and Secure on https (the dev origin is plain http, where some browsers refuse a Secure cookie). */
const cookieAttrs = (path: string, secure: boolean): string => `Path=${path}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
const stateCookie = (state: string, secure: boolean): string => `${STATE_COOKIE}=${state}; Max-Age=${STATE_TTL_SECONDS}; ${cookieAttrs('/auth/roblox', secure)}`;
const clearedStateCookie = (secure: boolean): string => `${STATE_COOKIE}=; Max-Age=0; ${cookieAttrs('/auth/roblox', secure)}`;
/** Scoped to the redeem route alone: no other request this browser makes carries it. */
const handleCookie = (handle: string, secure: boolean): string => `${HANDLE_COOKIE}=${handle}; Max-Age=${HANDLE_TTL_SECONDS}; ${cookieAttrs(REDEEM_PATH, secure)}`;
const clearedHandleCookie = (secure: boolean): string => `${HANDLE_COOKIE}=; Max-Age=0; ${cookieAttrs(REDEEM_PATH, secure)}`;

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

/** The StudPilot user for this Roblox account: found by `sub`, or made once. Never one it cannot vouch for. */
async function userFor(env: Env, cfg: Config, who: RobloxProfile): Promise<Linked> {
  await ensureRobloxOAuthTables(env);
  const known = await env.CORPUS.prepare('select user_id, username from roblox_identities where roblox_sub = ?')
    .bind(who.sub).first<{ user_id: string; username: string }>();
  if (known) {
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
  }

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
async function storeRefreshToken(env: Env, userId: string, who: RobloxProfile, tokens: TokenSet): Promise<void> {
  if (!tokens.refreshToken) return;
  const sealed = await sealSecret(env, tokens.refreshToken);
  await env.CORPUS.prepare(
    `insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, rotated_at, lease_until) values (?, ?, ?, ?, 1, ?, null)
     on conflict(user_id) do update set sealed_refresh = excluded.sealed_refresh, sub = excluded.sub, scopes = excluded.scopes,
       version = roblox_oauth_tokens.version + 1, rotated_at = excluded.rotated_at, lease_until = null`,
  ).bind(userId, sealed, who.sub, tokens.scope, new Date().toISOString()).run();
}

// ---------------------------------------------------------------------------------------------
// the three routes
// ---------------------------------------------------------------------------------------------

interface StateRecord {
  verifier: string;
  returnTo: string;
  redirectUri: string;
}

async function start(req: Request, env: Env): Promise<Response> {
  const cfg = configOf(env);
  if (!cfg) return page(503, MESSAGES.unavailable);
  const url = new URL(req.url);
  const origin = ownOrigin(req);
  // A flow must start on the host it will come back to, or the state cookie is on the wrong host.
  if (!origin) return redirect(`${PRODUCT_ORIGIN}${url.pathname}${url.search}`);

  const state = randomToken(32);
  const verifier = randomToken(48);
  const record: StateRecord = {
    verifier,
    returnTo: allowedReturn(url.searchParams.get('return')),
    redirectUri: `${origin}${CALLBACK_PATH}`,
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
  });
  return redirect(authorize, [stateCookie(state, url.protocol === 'https:')]);
}

function parseRecord(raw: string | null): StateRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<StateRecord>;
    return r.verifier && r.redirectUri && typeof r.returnTo === 'string' ? (r as StateRecord) : null;
  } catch {
    return null;
  }
}

async function callback(req: Request, env: Env): Promise<Response> {
  const cfg = configOf(env);
  if (!cfg) return page(503, MESSAGES.unavailable);
  const url = new URL(req.url);
  const clear = [clearedStateCookie(url.protocol === 'https:')];
  const fail = (status: number, stage: string, reference?: string): Response => {
    note(stage);
    return page(status, MESSAGES.failed, clear, reference);
  };

  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  // Burn the state before anything else is looked at: whatever happens next, this one cannot be used again.
  const validShape = /^[A-Za-z0-9_-]{20,128}$/.test(state);
  const raw = validShape ? await env.KV.get(STATE_PREFIX + state) : null;
  if (raw !== null) await env.KV.delete(STATE_PREFIX + state);
  const record = parseRecord(raw);
  if (!record) return fail(400, 'state unknown or already used');
  if (readCookie(req, STATE_COOKIE) !== state) return fail(400, 'state not bound to this browser');
  if (!code || url.searchParams.has('error')) return fail(400, 'no code');

  const tokens = await exchangeCode(cfg, code, record.verifier, record.redirectUri);
  if (!tokens) return fail(502, 'code exchange');
  const who = await userinfo(tokens.accessToken);
  if (!who) return fail(502, 'userinfo');

  try {
    const linked = await userFor(env, cfg, who);
    // A different status, stage and reference from the generic failure, so an operator can tell it at a glance.
    if (!linked.ok) return linked.code === 'address_taken' ? fail(409, 'synthetic address taken', REFERENCES.addressTaken) : fail(502, 'account link');
    await storeRefreshToken(env, linked.userId, who, tokens);
    const hashed = await signInTokenFor(env, cfg, linked.userId, linked.email);
    if (!hashed) return fail(502, 'sign-in token');
    // The token never goes in the URL. It waits in KV behind a random handle, and the handle goes only to THIS browser,
    // in a cookie that only /redeem receives: a link made from this response signs in nobody who does not hold the cookie.
    const handle = randomToken(32);
    const waiting: HandleRecord = { tokenHash: hashed, next: record.returnTo };
    await env.KV.put(HANDLE_PREFIX + handle, JSON.stringify(waiting), { expirationTtl: HANDLE_TTL_SECONDS });
    return redirect(LANDING_PATH, [...clear, handleCookie(handle, url.protocol === 'https:')]);
  } catch {
    return fail(502, 'storage');
  }
}

interface HandleRecord {
  tokenHash: string;
  next: string;
}

/**
 * The SPA's landing page calls this (POST, same origin, no body) to turn the handle cookie into the sign-in token.
 * It answers once: the handle is read and burned, and the cookie is cleared whatever the outcome. The Origin check
 * runs first and spends nothing, so a hostile page cannot make a real person's sign-in fail by poking at it.
 */
async function redeem(req: Request, env: Env): Promise<Response> {
  const cfg = configOf(env);
  const secure = new URL(req.url).protocol === 'https:';
  const clear = [clearedHandleCookie(secure)];
  if (!cfg) return jsonReply(503, { error: MESSAGES.unavailable });        // nothing read, nothing cleared: it can still be redeemed once the secrets are back
  const origin = ownOrigin(req);
  if (!origin || req.headers.get('Origin') !== origin) {
    note('redeem from another origin');
    return jsonReply(403, { error: MESSAGES.failed });
  }
  const handle = readCookie(req, HANDLE_COOKIE);
  const raw = /^[A-Za-z0-9_-]{20,128}$/.test(handle) ? await env.KV.get(HANDLE_PREFIX + handle) : null;
  if (raw !== null) await env.KV.delete(HANDLE_PREFIX + handle);
  let waiting: Partial<HandleRecord> | null = null;
  try {
    waiting = raw ? (JSON.parse(raw) as Partial<HandleRecord>) : null;
  } catch {
    waiting = null;
  }
  if (!waiting?.tokenHash || typeof waiting.next !== 'string') {
    note('handle unknown or already used');
    return jsonReply(400, { error: MESSAGES.failed }, clear);
  }
  return jsonReply(200, { token_hash: waiting.tokenHash, next: waiting.next }, clear);
}

/**
 * The routes under /auth/roblox. The limiter is the worker's own (index.ts `ipLimited`) and is handed in,
 * because that function lives in the router and this file may not import it back.
 */
export function robloxOAuthRoutes(limited: IpLimiter): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.use('*', async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    // The status check runs on every visit to the sign-in page; start and callback run once per attempt.
    const busy = c.req.path.endsWith('/status') ? limited(`rbx-status:${ip}`, 120) : limited(`rbx-oauth:${ip}`, 20);
    if (busy) return page(429, MESSAGES.busy);
    return next();
  });

  routes.get('/status', (c) =>
    reply(200, JSON.stringify({ configured: robloxSignInConfigured(c.env) }), { 'Content-Type': 'application/json; charset=utf-8' }));

  for (const [path, handler] of [['/start', start], ['/callback', callback]] as const) {
    routes.get(path, async (c) => {
      try {
        return await handler(c.req.raw, c.env);
      } catch {
        // Nothing from the error is kept: its message can carry a URL, and a URL here carries a code.
        note('unexpected failure');
        return page(500, MESSAGES.failed, [clearedStateCookie(new URL(c.req.url).protocol === 'https:')]);
      }
    });
  }
  routes.post('/redeem', async (c) => {
    try {
      return await redeem(c.req.raw, c.env);
    } catch {
      note('unexpected failure');
      return jsonReply(500, { error: MESSAGES.failed }, [clearedHandleCookie(new URL(c.req.url).protocol === 'https:')]);
    }
  });
  return routes;
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
  scopes: string;
}

/**
 * The access token last handed out for each person, in this isolate's memory only. Roblox gives a new one per refresh and
 * every refresh spends the single-use refresh token, so callers that arrive together should share one rather than
 * each spend a rotation. An entry is used only while it is unexpired AND the stored row is still the version it was
 * issued under, so a new sign-in (version bump) voids it, and a disconnect (no row) is answered `not_connected` before
 * the cache is consulted. Bounded, oldest out.
 */
const accessTokens = new Map<string, { accessToken: string; scope: string; version: number; until: number }>();
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
  const row = await env.CORPUS.prepare('select sealed_refresh, version, scopes from roblox_oauth_tokens where user_id = ?')
    .bind(userId).first<TokenRow>();
  if (!row) return { ok: false, reason: 'not_connected' };
  const cached = accessTokens.get(userId);
  if (cached && cached.version === row.version && cached.until > now) {
    return { ok: true, accessToken: cached.accessToken, scope: cached.scope, version: cached.version };
  }

  const claim = await env.CORPUS.prepare(
    'update roblox_oauth_tokens set lease_until = ? where user_id = ? and version = ? and (lease_until is null or lease_until < ?)',
  ).bind(now + REFRESH_LEASE_MS, userId, row.version, now).run();
  if (Number(claim.meta?.changes ?? 0) === 0) return { ok: false, reason: 'busy' };
  const release = (): Promise<unknown> =>
    env.CORPUS.prepare('update roblox_oauth_tokens set lease_until = null where user_id = ? and version = ?').bind(userId, row.version).run();

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
     where user_id = ? and version = ?`,
  ).bind(await sealSecret(env, tokens.refreshToken), tokens.scope, new Date(now).toISOString(), userId, row.version).run();
  if (Number(swap.meta?.changes ?? 0) === 0) {
    // The row moved on while we were at Roblox. The replacement we hold belongs to no row; do not leave it live.
    await revokeAtRoblox(cfg, tokens.refreshToken);
    return { ok: false, reason: 'busy' };
  }
  if (accessTokens.size >= ACCESS_TOKEN_CACHE_MAX) accessTokens.delete(accessTokens.keys().next().value as string);
  accessTokens.set(userId, { accessToken: tokens.accessToken, scope: tokens.scope, version: row.version + 1, until: now + tokens.expiresIn * 1000 - ACCESS_TOKEN_MARGIN_MS });
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
  };
}
