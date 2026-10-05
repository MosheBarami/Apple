// SIGN IN WITH ROBLOX (handoff M2, tasks O1 to O3 of planning/roblox-oauth-setup.md).
//
// The design in one paragraph. The browser goes to /auth/roblox/start, which stores a one-time state and
// a PKCE verifier in KV and sends it to Roblox. Roblox sends it back to /auth/roblox/callback with a code.
// The worker swaps the code for tokens (confidential client plus PKCE), asks Roblox who this is, and links
// that person by the Roblox `sub` and by nothing else. Roblox gives no email and Supabase has no Roblox
// provider, so the account is a Supabase user with a synthetic address that nothing can deliver to, made
// and signed in through the Auth admin API. The worker never signs a JWT: it asks Supabase for a one-time
// token hash, hands it to the SPA in the URL FRAGMENT (which no server log sees), and the SPA trades it
// for a real session with verifyOtp. docs: planning/proof/M2/ROBLOX-SIGNIN.md.
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
//   - an account is found by `sub`. A username is display text that Roblox lets people change and reuse, so
//     linking by it would let a second person take an account over;
//   - an existing Supabase user with the synthetic address is adopted only when the admin-written
//     app_metadata names the same `sub`. A person cannot write app_metadata, but they could sign up with the
//     synthetic address themselves, and adopting that user would hand them the account;
//   - the Roblox refresh token is single use. Before the worker spends it, it claims a lease on the row, and
//     it stores the replacement by compare-and-swap on `version`, so two requests can never both spend it;
//   - every response carries no-store and no-referrer, error pages say one fixed sentence (nothing the
//     provider sent is reflected), and nothing here logs a query string, a token or a response body.
import { Hono } from 'hono';
import { PRODUCT_ORIGIN } from '@studpilot/shared';
import type { AuthedUser, Env } from './env';
import { oncePerIsolate } from './schema-once';
import { openSecret, sealSecret } from './user-credentials';

const OAUTH = 'https://apis.roblox.com/oauth/v1';
/** Sign-in asks for identity only. The asset scopes arrive with uploads (M5c), with their own consent. */
const SIGNIN_SCOPE = 'openid profile';
const STATE_PREFIX = 'roblox-oauth:state:';
const STATE_TTL_SECONDS = 600;
const STATE_COOKIE = 'rbx_oauth_state';
const CALLBACK_PATH = '/auth/roblox/callback';
const LANDING_PATH = '/app/auth/roblox';
/** The only origins a redirect_uri may be built from: the product, and the registered dev server. */
const DEV_ORIGIN = 'http://localhost:5173';
/** RFC 2606 `.invalid` can never be delivered to, so no mail goes anywhere by accident. */
const SYNTHETIC_EMAIL_DOMAIN = 'users.studpilot.invalid';
const OUTBOUND_TIMEOUT_MS = 10_000;
const REFRESH_LEASE_MS = 30_000;

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

const cookieAttrs = (secure: boolean): string => `Path=/auth/roblox; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
const stateCookie = (state: string, secure: boolean): string => `${STATE_COOKIE}=${state}; Max-Age=${STATE_TTL_SECONDS}; ${cookieAttrs(secure)}`;
const clearedStateCookie = (secure: boolean): string => `${STATE_COOKIE}=; Max-Age=0; ${cookieAttrs(secure)}`;

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

function page(status: number, message: string, cookies: readonly string[] = []): Response {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>StudPilot</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px">'
    + `<p>${message}</p><p><a href="/app/login">Back to StudPilot</a></p></body></html>`;
  return reply(status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  }, cookies);
}

const redirect = (location: string, cookies: readonly string[] = []): Response => reply(302, null, { Location: location }, cookies);

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
}

async function tokensFrom(res: Response | null): Promise<TokenSet | null> {
  if (!res?.ok) return null;
  const body = await jsonOf(res);
  const accessToken = str(body?.access_token);
  if (!accessToken) return null;
  return { accessToken, refreshToken: str(body?.refresh_token) || null, scope: str(body?.scope) || SIGNIN_SCOPE };
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
  const name = (str(body?.preferred_username) || str(body?.nickname) || str(body?.name)).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100);
  return { sub, username: name || `roblox-${sub}` };
}

/**
 * Revoke a stored refresh token at Roblox. True when the grant is dead afterwards: the call succeeded, or
 * Roblox answered 400 because the token was already revoked or expired. Anything else (a 401 for the
 * client credentials, a 5xx, no answer) means it may still be live.
 */
async function revokeAtRoblox(cfg: Config, refreshToken: string): Promise<boolean> {
  const res = await postToRoblox('/token/revoke', { token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  return res !== null && (res.ok || res.status === 400);
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

/**
 * The token hash for a user we already know. The address is read fresh because the person may have
 * changed it since the account was made; the link is for that address and must belong to that user.
 */
async function signInTokenFor(env: Env, cfg: Config, userId: string): Promise<string | null> {
  const user = await admin(env, cfg, 'GET', `/users/${encodeURIComponent(userId)}`);
  const email = str(user?.json?.email);
  if (!email) return null;
  const link = await mintLink(env, cfg, email);
  return link && link.userId === userId ? link.hashedToken : null;
}

// ---------------------------------------------------------------------------------------------
// linking
// ---------------------------------------------------------------------------------------------

/** The StudPilot user for this Roblox account: found by `sub`, or made once. Null when it cannot be said safely. */
async function userFor(env: Env, cfg: Config, who: RobloxProfile): Promise<string | null> {
  await ensureRobloxOAuthTables(env);
  const known = await env.CORPUS.prepare('select user_id, username from roblox_identities where roblox_sub = ?')
    .bind(who.sub).first<{ user_id: string; username: string }>();
  if (known) {
    // The name is display text. Following a change keeps the same user; it never selects one.
    if (known.username !== who.username) {
      await env.CORPUS.prepare('update roblox_identities set username = ? where roblox_sub = ?').bind(who.username, who.sub).run();
    }
    return known.user_id;
  }

  const email = `roblox-${who.sub}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const made = await createAuthUser(env, cfg, email, who);
  let userId: string;
  if (made === null) return null;
  if (made === 'exists') {
    // Either a sign-in that stopped halfway last time, or somebody who signed up with this address on
    // purpose. Only the first has our app_metadata on it.
    const link = await mintLink(env, cfg, email);
    if (!link || link.robloxSub !== who.sub) return null;
    userId = link.userId;
  } else {
    userId = made;
  }
  // First writer wins. Two callbacks for one new sub both reach here with the same user id (the address
  // is derived from the sub, so Supabase can hold only one), and the row read back is the answer.
  await env.CORPUS.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at) values (?, ?, ?, ?) on conflict(roblox_sub) do nothing')
    .bind(who.sub, userId, who.username, new Date().toISOString()).run();
  const row = await env.CORPUS.prepare('select user_id from roblox_identities where roblox_sub = ?').bind(who.sub).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** A fresh sign-in replaces the stored refresh token. The version bump also voids any refresh in flight. */
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
  const fail = (status: number, stage: string): Response => {
    note(stage);
    return page(status, MESSAGES.failed, clear);
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
    const userId = await userFor(env, cfg, who);
    if (!userId) return fail(502, 'account link');
    await storeRefreshToken(env, userId, who, tokens);
    const hashed = await signInTokenFor(env, cfg, userId);
    if (!hashed) return fail(502, 'sign-in token');
    const fragment = query(record.returnTo === '/' ? { token_hash: hashed } : { token_hash: hashed, next: record.returnTo });
    return redirect(`${LANDING_PATH}#${fragment}`, clear);
  } catch {
    return fail(502, 'storage');
  }
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
    return { ok: false, reason: res && res.status >= 400 && res.status < 500 ? 'refused' : 'unavailable' };
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
  status: 200 | 502;
  body: { revoked: boolean | null; tokenRemoved: boolean; linkRemoved: boolean; signInKept: boolean } | { error: string };
}

/**
 * Disconnect Roblox. Idempotent: a second call finds nothing and says so.
 *
 * The grant is revoked at Roblox first, and if Roblox cannot be asked nothing is deleted, because the sealed
 * token is the only handle there is to revoke it with. Then the token row goes, and so does the identity
 * link, EXCEPT while the account's only way in is Roblox (its address is still the synthetic one): without
 * the link the next Roblox sign-in would open a new, empty account and this one would be unreachable. In
 * that case the access to Roblox is gone and the sign-in link stays, and the answer says so.
 */
export async function disconnectRoblox(env: Env, user: AuthedUser): Promise<DisconnectResult> {
  await ensureRobloxOAuthTables(env);
  const row = await env.CORPUS.prepare('select sealed_refresh from roblox_oauth_tokens where user_id = ?').bind(user.userId).first<{ sealed_refresh: string }>();
  let revoked: boolean | null = null;
  if (row) {
    const cfg = configOf(env);
    const token = cfg ? await openSecret(env, row.sealed_refresh) : null;
    revoked = cfg && token ? await revokeAtRoblox(cfg, token) : false;
    if (cfg && token && !revoked) {
      note('revoke');
      return { status: 502, body: { error: 'Roblox could not be reached, so nothing was changed. Try again in a minute.' } };
    }
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
