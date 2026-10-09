/**
 * SIGN IN WITH ROBLOX, EXECUTED — the worker half (apps/worker/src/roblox-oauth.ts).
 *
 * Nothing here touches a network. Roblox (token, userinfo, revoke) and Supabase (the Auth admin API) are
 * one in-process `fetch` stand-in that behaves the way the real ones are documented to, including the two
 * behaviours the design leans on: a Roblox refresh token is SINGLE USE (presenting a spent one burns the
 * grant), and Supabase refuses a second user with the same address. The app is the real Hono app from
 * index.ts and the database is real SQL (node:sqlite), so a WHERE clause that is wrong is wrong here too.
 *
 * WHAT EACH GROUP IS FOR, as the way the feature would be worse than nothing:
 *
 *   - A SIGN-IN THAT CAN BE FORGED. A state nobody issued, a state used twice, a state that was issued to a
 *     different browser, a code that is not bound to our PKCE verifier: each must be a 400 and each must
 *     leave Roblox and Supabase untouched.
 *   - AN ACCOUNT THAT CAN BE TAKEN. Linking is by the Roblox `sub`. A new username on the same sub is the
 *     same person; the same username on another sub is somebody else; an address somebody registered by
 *     hand is never adopted.
 *   - A TOKEN THAT LEAKS. The refresh token is sealed at rest, stays out of every response, every export and
 *     every log line, and goes back to Roblox to be revoked on disconnect and on erasure.
 *   - A REFRESH THAT BURNS THE GRANT. Two requests at once may not both spend a single-use token.
 *   - A SIGN-IN THAT FAILS FOR HONEST PEOPLE. A school lab shares one address; the cookies a flow plants must be
 *     ones nobody else can plant; and the secret Supabase key stays a key to the Auth admin API and nothing else.
 *
 * Run with:  node --test tests/roblox-oauth.test.mjs      (from apps/worker)
 */
import baseTest from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';
// The web's own re-authentication window and action list, so the worker's copies are held to them and cannot drift.
import { REAUTH_WINDOW_MS, SENSITIVE_ACTIONS } from '../../web/src/lib/auth-flows.ts';
// ...and the web's own test for "is this a Roblox-only account", so what the worker leaves on a wiped account is held to what the app recognises.
import { isRobloxAccount } from '../../web/src/lib/account-identity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const APP_OUT = join(tmpdir(), `studpilot-roblox-oauth-app-${process.pid}.mjs`);
const LIB_OUT = join(tmpdir(), `studpilot-roblox-oauth-lib-${process.pid}.mjs`);
const CRED_OUT = join(tmpdir(), `studpilot-roblox-oauth-cred-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: APP_OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      // The email travels with the token in this stub, because the disconnect rule depends on it.
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth-with-email.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
for (const [entry, out] of [['roblox-oauth.ts', LIB_OUT], ['user-credentials.ts', CRED_OUT]]) {
  await esbuild.build({ entryPoints: [join(WORKER, 'src', entry)], bundle: true, format: 'esm', target: 'es2022', outfile: out });
}
const app = (await import(`file://${APP_OUT}`)).default;
const R = await import(`file://${LIB_OUT}`);
const C = await import(`file://${CRED_OUT}`);
const { ROWS, FAILING } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => { for (const f of [APP_OUT, LIB_OUT, CRED_OUT]) rmSync(f, { force: true }); });

// Every console line the worker writes, kept so one test can read all of them. Nothing is printed.
const LOGS = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...args) => { LOGS.push(args.map((a) => String(a)).join(' ')); };

/**
 * EVERY test below goes through this. The worker swallows a failed outbound call (`send` answers null), so a call the mock
 * does not know about does not throw in the test: it is recorded, and this fails the test at the end of ANY scenario, not
 * only the first sign-in. The same for the Supabase secret key: it may reach `/auth/v1/admin/...` and nothing else, so a
 * route that started using it for a table query, a token endpoint or a password check fails here wherever it happens.
 */
const WORLDS = [];
function test(name, fn) {
  return baseTest(name, async (t) => {
    WORLDS.length = 0;
    await fn(t);
    for (const [i, world] of WORLDS.entries()) {
      assert.deepEqual(world.unexpected, [], `world ${i}: a call that none of the three Auth admin routes or the Roblox endpoints answers`);
      assert.deepEqual(world.sb.strays, [], `world ${i}: the Supabase secret key was used outside the Auth admin API, or a call was made without it`);
    }
  });
}

/* ------------------------------------------------------------------------- fixtures --- */

const PROD = 'https://studpilot.app';
const DEV = 'http://localhost:5173';
const SB = 'https://sb.example.test';
const CLIENT_ID = '5523165872353873834';
const CLIENT_SECRET = 'RBX-fixture-client-secret-' + 'c'.repeat(20);
const SB_SECRET = 'sb_secret_' + 'f'.repeat(24);
const KEY_B64 = Buffer.alloc(32, 7).toString('base64');
/**
 * The address the worker derives for a Roblox id, recomputed HERE with node:crypto and not with the worker's code, so the
 * derivation is pinned: HMAC-SHA-256 of the id under a subkey (HMAC of a fixed purpose label under CREDENTIAL_KEY),
 * first 128 bits as hex. An outsider has no CREDENTIAL_KEY, so cannot compute it from the public Roblox id.
 */
const SYNTHETIC = (sub, keyB64 = KEY_B64) => {
  const subkey = createHmac('sha256', Buffer.from(keyB64, 'base64')).update('studpilot:roblox-signin-address').digest();
  return `roblox-${createHmac('sha256', subkey).update(sub).digest('hex').slice(0, 32)}@users.studpilot.invalid`;
};
/** What the address WAS before it was keyed: computable by anybody from a public Roblox id. */
const LEGACY = (sub) => `roblox-${sub}@users.studpilot.invalid`;
const SUB_A = '1234567';
const SUB_B = '7654321';
/** The names the two flow cookies carry on https, which is the product. Only the plain-http dev origin uses the bare names. */
const STATE_C = '__Host-rbx_oauth_state';
const HANDLE_C = '__Host-rbx_oauth_handle';

const sha256url = (s) => createHash('sha256').update(s).digest('base64url');
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const rand = (n = 16) => randomBytes(n).toString('hex');

/** Roblox and the Supabase Auth admin API, as one fetch. Every call is recorded; an unknown one fails the test. */
function makeWorld() {
  const roblox = {
    codes: new Map(), access: new Map(), refresh: new Map(),
    burned: false, tokenCalls: [], revokeCalls: [], introspectCalls: [], lastRefreshIssued: null,
    failToken: null, failRevoke: null, duringRefresh: null, userinfo: null,
    /** How token introspection answers: 'normal' (the truth), 'misread' (everything inactive), or { status, body } / 'junk' for the answers that say nothing. */
    introspect: 'normal',
    /** What the person does in their Roblox settings: remove StudPilot. Every refresh token that grant holds is revoked at once. */
    removeApp(sub) { for (const rec of roblox.refresh.values()) if (rec.sub === sub) rec.state = 'revoked'; },
    issueCode({ sub, username, challenge, redirectUri }) {
      const code = `code_${rand()}`;
      roblox.codes.set(code, { sub, username, challenge, redirectUri, used: false });
      return code;
    },
  };
  const sb = { users: new Map(), links: new Map(), createCalls: 0, ghosts: 0, headers: [], strays: [], deleteCalls: [], failDelete: null, updateCalls: [], failUpdate: null, onUpdate: null, profiles: new Map(), profilePatches: [], failProfile: null };
  const calls = [];
  const unexpected = [];

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const issue = (who) => {
    const access = `at_${rand()}`;
    const refresh = `RBX-${rand(24)}`;
    roblox.access.set(access, who);
    roblox.refresh.set(refresh, { ...who, state: 'live' });
    roblox.lastRefreshIssued = refresh;
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 900, scope: roblox.scope ?? 'openid profile' };
  };
  const userByEmail = (email) => [...sb.users.values()].find((u) => u.email === email);

  async function robloxCall(url, method, form, headers) {
    if (url.pathname === '/oauth/v1/token' && method === 'POST') {
      roblox.tokenCalls.push(Object.fromEntries(form));
      if (roblox.failToken) return json(roblox.failToken.status, roblox.failToken.body);
      if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
      if (form.get('grant_type') === 'authorization_code') {
        const rec = roblox.codes.get(form.get('code'));
        if (!rec || rec.used) return json(400, { error: 'invalid_grant' });
        // PKCE: the verifier must hash to the challenge the browser was sent away with.
        if (!form.get('code_verifier') || sha256url(form.get('code_verifier')) !== rec.challenge) return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
        if (form.get('redirect_uri') !== rec.redirectUri) return json(400, { error: 'invalid_grant' });
        rec.used = true;
        return json(200, issue({ sub: rec.sub, username: rec.username }));
      }
      if (form.get('grant_type') === 'refresh_token') {
        await roblox.duringRefresh?.();
        const rec = roblox.refresh.get(form.get('refresh_token'));
        if (!rec) return json(400, { error: 'invalid_grant' });
        if (rec.state !== 'live') { roblox.burned = true; return json(400, { error: 'invalid_grant', error_description: 'refresh token already used' }); }
        rec.state = 'used';
        return json(200, issue({ sub: rec.sub, username: rec.username }));
      }
      return json(400, { error: 'unsupported_grant_type' });
    }
    if (url.pathname === '/oauth/v1/userinfo' && method === 'GET') {
      const who = roblox.access.get((headers.get('authorization') ?? '').replace(/^Bearer /, ''));
      if (!who) return json(401, { error: 'invalid_token' });
      if (roblox.userinfo) return json(200, roblox.userinfo(who));
      return json(200, { sub: who.sub, name: `Display ${who.username}`, nickname: `Display ${who.username}`, preferred_username: who.username, created_at: 1500000000 });
    }
    if (url.pathname === '/oauth/v1/token/introspect' && method === 'POST') {
      roblox.introspectCalls.push(Object.fromEntries(form));
      if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
      if (roblox.introspect === 'junk') return new Response('<html>not json</html>', { status: 200 });
      if (roblox.introspect && typeof roblox.introspect === 'object') return json(roblox.introspect.status, roblox.introspect.body);
      if (roblox.introspect === 'misread') return json(200, { active: false });
      const token = form.get('token');
      const rec = roblox.refresh.get(token);
      return json(200, rec ? { active: rec.state === 'live', ...(rec.state === 'live' ? { sub: rec.sub, scope: 'openid profile' } : {}) } : { active: roblox.access.has(token) });
    }
    // The accounts ticked under "Your Accounts" (live answer 2026-10-09 with none ticked: creator ids []).
    if (url.pathname === '/oauth/v1/token/resources' && method === 'POST') {
      if (!roblox.access.has(form.get('token'))) return json(401, { error: 'invalid_token' });
      return json(200, { resource_infos: [{ owner: { id: SUB_A, type: 'User' }, resources: { creator: { ids: roblox.creatorIds ?? ['U'] } } }] });
    }
    if (url.pathname === '/oauth/v1/token/revoke' && method === 'POST') {
      roblox.revokeCalls.push(form.get('token'));
      if (roblox.failRevoke) {
        // A bare number is a status with no useful body; {status, body} is Roblox saying something specific.
        const fail = typeof roblox.failRevoke === 'number' ? { status: roblox.failRevoke, body: { error: 'server_error' } } : roblox.failRevoke;
        return json(fail.status, fail.body);
      }
      const rec = roblox.refresh.get(form.get('token'));
      if (rec) rec.state = 'revoked';
      return json(200, {});
    }
    return null;
  }

  async function supabaseCall(url, method, body, headers) {
    sb.headers.push({ apikey: headers.get('apikey'), authorization: headers.get('authorization') });
    // The secret key is for the Auth admin API, and for ONE table call: the PATCH that clears a Roblox username from a profile's display name when a grant is lost.
    // Anything else it is sent to, and any call that arrives without it, is a stray.
    const isProfileNamePatch = method === 'PATCH' && url.pathname === '/rest/v1/profiles' && JSON.stringify(body) === '{"display_name":null}';
    if ((!url.pathname.startsWith('/auth/v1/admin/') && !isProfileNamePatch) || headers.get('apikey') !== SB_SECRET) sb.strays.push(`${method} ${url.pathname}`);
    if (headers.get('apikey') !== SB_SECRET) return json(401, { message: 'invalid api key' });
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      sb.createCalls += 1;
      if (userByEmail(body.email)) return json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      const user = { id: randomUUID(), email: body.email, email_confirmed_at: new Date().toISOString(), app_metadata: { ...body.app_metadata }, user_metadata: { ...body.user_metadata }, confirmedByAdmin: body.email_confirm === true };
      sb.users.set(user.id, user);
      // handle_new_user(): the profile's display name is the user_metadata display name (0001_init.sql).
      sb.profiles.set(user.id, { display_name: user.user_metadata.display_name ?? body.email.split('@')[0] });
      return json(200, user);
    }
    const one = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
    if (one && method === 'GET') {
      const user = sb.users.get(decodeURIComponent(one[1]));
      // GoTrue's own answer for an id it does not hold; the worker only believes a 404 that says this.
      return user ? json(200, user) : json(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    }
    if (one && method === 'PUT') {
      // GoTrue's admin update: app_metadata and user_metadata are MERGED, and a key set to null is removed. `failUpdate` is a status to answer instead.
      const id = decodeURIComponent(one[1]);
      sb.updateCalls.push({ id, body });
      if (sb.failUpdate) return json(sb.failUpdate, { msg: 'update failed' });
      const user = sb.users.get(id);
      if (!user) return json(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
      for (const field of ['app_metadata', 'user_metadata']) {
        for (const [k, v] of Object.entries(body[field] ?? {})) { if (v === null) delete user[field][k]; else user[field][k] = v; }
      }
      sb.onUpdate?.(id);                 // a hook for the test that has a sign-in land between the Auth update and the database batch
      return json(200, user);
    }
    if (one && method === 'DELETE') {
      // Account deletion (erasure.ts, last step). `failDelete` is a status to answer instead, for the tests that break it.
      sb.deleteCalls.push(decodeURIComponent(one[1]));
      if (sb.failDelete) return json(sb.failDelete, { msg: 'database error' });
      const id = decodeURIComponent(one[1]);
      return sb.users.delete(id) ? json(200, {}) : json(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    }
    if (url.pathname === '/auth/v1/admin/generate_link' && method === 'POST') {
      if (body.type !== 'magiclink') return json(400, { msg: 'unsupported link type' });
      let user = userByEmail(body.email);
      if (!user) {
        // HOW GOTRUE REALLY BEHAVES: a magic link for an address nobody holds SIGNS THAT ADDRESS UP and mints the
        // link for the brand-new user. It does not answer 404. So a worker that asks for a link for the wrong
        // address does not fail; it signs the person in as an empty stranger. `ghosts` counts those.
        user = { id: randomUUID(), email: body.email, email_confirmed_at: null, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, createdByLink: true };
        sb.users.set(user.id, user);
        sb.ghosts += 1;
      }
      const hashed = `ht_${rand(20)}`;
      sb.links.set(hashed, user.id);
      return json(200, { ...user, action_link: `${SB}/auth/v1/verify?token=${hashed}&type=magiclink`, email_otp: '123456', hashed_token: hashed, redirect_to: '', verification_type: 'magiclink' });
    }
    // PostgREST, for the one table call the secret key makes: PATCH /rest/v1/profiles?id=eq.<id>&display_name=eq.<name> with {"display_name": null}.
    if (isProfileNamePatch) {
      sb.profilePatches.push({ search: url.search, prefer: headers.get('prefer') });
      if (sb.failProfile) return json(sb.failProfile, { message: 'profile update failed' });
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      const name = (url.searchParams.get('display_name') ?? '').replace(/^eq\./, '');
      const profile = sb.profiles.get(id);
      if (profile && profile.display_name === name) profile.display_name = null;   // a profile whose name is something else matches no row, and the answer is still a success
      return new Response(null, { status: 204 });
    }
    return null;
  }

  const fetchMock = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers ?? {});
    const text = typeof init.body === 'string' ? init.body : '';
    calls.push({ method, url: url.href, text });
    let res = null;
    if (url.origin === 'https://apis.roblox.com') res = await robloxCall(url, method, new URLSearchParams(text), headers);
    else if (url.origin === SB) res = await supabaseCall(url, method, text ? JSON.parse(text) : {}, headers);
    if (res) return res;
    unexpected.push(`${method} ${url.href}`);
    throw new Error(`unexpected network call: ${method} ${url.origin}${url.pathname}`);
  };
  const world = { fetch: fetchMock, roblox, sb, calls, unexpected };
  WORLDS.push(world);
  return world;
}

function makeKv() {
  const rows = new Map();
  return {
    rows,
    ttls: new Map(),
    /** How many times the worker asked KV for a value: a request refused before it reads must leave this where it was. */
    reads: 0,
    async get(key) { this.reads += 1; return rows.get(key) ?? null; },
    async put(key, value, opts) { rows.set(key, value); if (opts?.expirationTtl) this.ttls.set(key, opts.expirationTtl); },
    async delete(key) { rows.delete(key); },
    async list({ prefix = '' } = {}) { return { keys: [...rows.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const hit = (url, init, env) => app.request(url, init, env, ctx);

/** A fresh database, KV and world, with the fetch the worker will use swapped in. */
function scene(envOverrides = {}) {
  const db = d1();
  const kv = makeKv();
  const world = makeWorld();
  globalThis.fetch = world.fetch;
  const env = {
    CORPUS: db.CORPUS, KV: kv, SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon-fixture', ENVIRONMENT: 'test',
    CREDENTIAL_KEY: KEY_B64, ROBLOX_OAUTH_CLIENT_ID: CLIENT_ID, ROBLOX_OAUTH_CLIENT_SECRET: CLIENT_SECRET, SUPABASE_SECRET_KEY: SB_SECRET,
    SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
    QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
    // The Discord link store with nothing linked: what account deletion unlinks, and reads back (the real object is exercised by account-deletion-identity.test.mjs).
    DISCORD_DO: { idFromName: (n) => n, get: () => ({ async fetch(url) { return Response.json(new URL(url).pathname === '/unlink' ? { removed: false, codesRemoved: 0 } : { link: null }); } }) },
    ...envOverrides,
  };
  return { db, kv, world, env };
}

// Each flow gets its own client address, because the limiter's counters outlive a test.
// A counter that does not wrap: a test that exhausts an address (the limiter tests do) must never meet it again in the same minute.
let nextIp = 0;
const freshIp = () => { nextIp += 1; return `198.51.${100 + Math.floor(nextIp / 250)}.${nextIp % 250}`; };

async function startFlow(env, { origin = PROD, returnTo, reauth, ip = freshIp() } = {}) {
  const params = [];
  if (returnTo !== undefined) params.push(`return=${encodeURIComponent(returnTo)}`);
  if (reauth !== undefined) params.push(`reauth=${encodeURIComponent(reauth)}`);
  const qs = params.length ? `?${params.join('&')}` : '';
  const res = await hit(`${origin}/auth/roblox/start${qs}`, { headers: { 'CF-Connecting-IP': ip } }, env);
  const location = res.headers.get('Location') ?? '';
  const auth = new URL(location, origin);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${STATE_C}=`));
  return {
    res, origin, ip, location, auth, setCookie: cookie ?? '',
    state: auth.searchParams.get('state'), challenge: auth.searchParams.get('code_challenge'),
    redirectUri: auth.searchParams.get('redirect_uri'), cookie: (cookie ?? '').split(';')[0],
  };
}

async function finish(env, world, flow, { sub, username, code, state = flow.state, cookie = flow.cookie } = {}) {
  const issued = code ?? world.roblox.issueCode({ sub, username, challenge: flow.challenge, redirectUri: flow.redirectUri });
  const res = await hit(
    `${flow.origin}/auth/roblox/callback?code=${encodeURIComponent(issued)}&state=${encodeURIComponent(state)}`,
    { headers: { 'CF-Connecting-IP': flow.ip, ...(cookie ? { Cookie: cookie } : {}) } },
    env,
  );
  return { res, code: issued };
}

/**
 * A person signing in: the start, Roblox, and the callback. A Roblox account nobody here has seen is NOT made by the callback: it is
 * held until the person has been asked and pressed Continue (`/auth/roblox/create`), so this does that too, as the SPA does, unless
 * a test says `confirm: false` because the point of it is what happens before that. A returning account has nothing to confirm.
 */
async function signIn(env, world, who, opts) {
  const flow = await startFlow(env, opts);
  const done = await finish(env, world, flow, who);
  if (opts?.confirm !== false) await confirmIfAsked(env, done.res, flow.ip);
  return { flow, ...done };
}

/** The SPA's "Continue" and "Go back" on the first-sight card: a same-origin POST that carries only the handle cookie. */
const handlePost = (path, env, { cookie, origin = PROD, ip = freshIp() } = {}) =>
  hit(`${PROD}/auth/roblox/${path}`, { method: 'POST', headers: { 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, env);
const createRequest = (env, opts) => handlePost('create', env, opts);
const declineRequest = (env, opts) => handlePost('decline', env, opts);
/** Is a first sight waiting behind the handle this callback set? */
const isPending = (env, callbackRes) => {
  const handle = handleCookieOf(callbackRes).split('=')[1];
  const raw = handle ? env.KV.rows.get(`roblox-oauth:handle:${handle}`) : undefined;
  return raw !== undefined && 'pending' in JSON.parse(raw);
};
async function confirmIfAsked(env, callbackRes, ip) {
  if (callbackRes.status !== 302 || !isPending(env, callbackRes)) return;
  const created = await createRequest(env, { cookie: handleCookieOf(callbackRes), ip });
  assert.equal(created.status, 200, 'pressing Continue on a first sight makes the account');
}

/** The handle cookie a callback response set (not the line that clears it), as the browser would send it back. */
const handleCookieOf = (res) => (res.headers.getSetCookie().find((c) => c.startsWith(`${HANDLE_C}=`) && !/Max-Age=0/.test(c)) ?? '').split(';')[0];

/**
 * What a browser requires of a cookie whose name starts `__Host-`, and what this feature asks of its two cookies besides:
 * Secure, Path=/ and NO Domain (the three that make the prefix unplantable from plain http or from a sibling subdomain), plus HttpOnly and SameSite=Lax.
 */
function assertHostCookie(line, name, { maxAge } = {}) {
  assert.ok(typeof line === 'string' && line.startsWith(`${name}=`), `a cookie named ${name} was expected, got: ${String(line).split('=')[0]}`);
  assert.match(line, /; Secure(;|$)/, `${name}: a __Host- cookie must be Secure`);
  assert.match(line, /; Path=\/(;|$)/, `${name}: a __Host- cookie must be Path=/`);
  assert.doesNotMatch(line, /;\s*Domain=/i, `${name}: a __Host- cookie must not carry a Domain`);
  assert.match(line, /; HttpOnly(;|$)/, `${name}: HttpOnly`);
  assert.match(line, /; SameSite=Lax(;|$)/, `${name}: SameSite=Lax`);
  if (maxAge !== undefined) assert.match(line, new RegExp(`; Max-Age=${maxAge}(;|$)`), `${name}: Max-Age`);
}
/** The Set-Cookie line of `res` whose cookie is `name`, the clearing one (Max-Age=0) when `cleared`. */
const setCookieNamed = (res, name, cleared = false) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`) && /; Max-Age=0(;|$)/.test(c) === cleared);

/** The SPA's call: POST /auth/roblox/redeem from the app's own origin, carrying whatever cookie this browser holds. */
function redeemRequest(env, { cookie, origin = PROD, ip = freshIp(), method = 'POST' } = {}) {
  return hit(`${PROD}/auth/roblox/redeem`, { method, headers: { 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, env);
}

/** What the SPA gets back for the browser that finished `callbackRes`: { token_hash, next } once, or an error. */
const redeemFor = (env, callbackRes, opts = {}) => redeemRequest(env, { cookie: handleCookieOf(callbackRes), ...opts });

/** The sign-in token hash a finished callback hands the browser, fetched the way the SPA does. */
async function tokenHashOf(env, callbackRes) {
  await confirmIfAsked(env, callbackRes);
  const res = await redeemFor(env, callbackRes);
  assert.equal(res.status, 200, 'the browser that finished the callback can redeem its handle');
  return (await res.json()).token_hash;
}
const rowsOf = (db, sql, ...params) => db.raw.prepare(sql).all(...params);
/** The handle entries waiting in this scene's KV. */
const kvHandles = (env) => [...env.KV.rows.keys()].filter((k) => k.startsWith('roblox-oauth:handle:'));
const userIdOf = (db, sub) => rowsOf(db, 'select user_id from roblox_identities where roblox_sub = ?', sub)[0]?.user_id;
/** Rows in a table the worker makes on first use: zero when it was never made, which is also "nothing created". */
const identityCount = (db) => { try { return countRows(db.raw, 'select count(*) from roblox_identities'); } catch { return 0; } };
const GENERIC = 'We could not sign you in with Roblox. Go back to StudPilot and try again.';

/* ----------------------------------------------------------- the harness is a real one --- */

test('POSITIVE CONTROL: a first sign-in works end to end, so the refusals below are refusals of something that works', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/app/auth/roblox', 'the redirect carries nothing: the token waits behind a cookie');
  assert.match(await tokenHashOf(env, res), /^ht_/, 'and the browser that holds the cookie can fetch it');
  assert.equal(countRows(db.raw, 'select count(*) from roblox_identities'), 1);
  assert.deepEqual(world.unexpected, []);
  db.close();
});

/* ------------------------------------------------------------ the request to Roblox --- */

test('the authorize request carries the registered client id, the sign-in scope only, a state, and an S256 challenge of a stored verifier', async () => {
  const { db, kv, env } = scene();
  const flow = await startFlow(env);
  assert.equal(flow.res.status, 302);
  assert.equal(flow.auth.origin + flow.auth.pathname, 'https://apis.roblox.com/oauth/v1/authorize');
  const p = flow.auth.searchParams;
  assert.equal(p.get('response_type'), 'code');
  assert.equal(p.get('client_id'), CLIENT_ID);
  assert.equal(p.get('redirect_uri'), `${PROD}/auth/roblox/callback`);
  // Sign-in asks for who you are and nothing else. Asset scopes arrive with uploads, with their own consent.
  assert.equal(p.get('scope'), 'openid profile');
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.ok((p.get('state') ?? '').length >= 40, 'the state must be unguessable');
  // The challenge is the SHA-256 of a verifier the worker kept, and the verifier is in KV for ten minutes.
  const stored = JSON.parse(kv.rows.get(`roblox-oauth:state:${p.get('state')}`));
  assert.ok(stored.verifier.length >= 43, 'an RFC 7636 verifier is at least 43 characters');
  assert.equal(sha256url(stored.verifier), p.get('code_challenge'));
  assert.equal(kv.ttls.get(`roblox-oauth:state:${p.get('state')}`), 600);
  // The verifier itself never goes to the browser.
  assert.equal(flow.location.includes(stored.verifier), false);
  assert.equal(flow.res.headers.get('Location').includes('client_secret'), false);
  db.close();
});

test('two flows get different states and different verifiers, and every one of them is drawn from crypto.getRandomValues', async () => {
  const { db, kv, env } = scene();
  const draws = [];
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  globalThis.crypto.getRandomValues = (array) => { const out = real(array); draws.push(Buffer.from(out.buffer, out.byteOffset, out.byteLength)); return out; };
  let a;
  let b;
  try {
    a = await startFlow(env);
    b = await startFlow(env);
  } finally {
    delete globalThis.crypto.getRandomValues;
  }
  const verifierOf = (flow) => JSON.parse(kv.rows.get(`roblox-oauth:state:${flow.state}`)).verifier;
  assert.notEqual(a.state, b.state, 'two flows must not share a state');
  assert.notEqual(verifierOf(a), verifierOf(b), 'or a verifier');
  assert.notEqual(a.challenge, b.challenge);
  for (const flow of [a, b]) {
    // The state is 32 random bytes and the verifier 48: each is exactly the base64url of one draw from the CSPRNG.
    assert.ok(draws.some((d) => d.length === 32 && d.toString('base64url') === flow.state), 'the state is not a getRandomValues draw');
    assert.ok(draws.some((d) => d.length === 48 && d.toString('base64url') === verifierOf(flow)), 'the verifier is not a getRandomValues draw');
  }
  db.close();
});

test('the code exchange sends the verifier, the client secret and the same redirect_uri; Roblox checks the verifier against the challenge', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 302, 'the mock refuses a verifier that does not hash to the challenge, so a 302 means it did');
  assert.equal(world.roblox.tokenCalls.length, 1);
  const sent = world.roblox.tokenCalls[0];
  assert.equal(sent.grant_type, 'authorization_code');
  assert.ok(sent.code_verifier && sent.code_verifier.length >= 43);
  assert.equal(sent.client_id, CLIENT_ID);
  assert.equal(sent.client_secret, CLIENT_SECRET, 'a confidential client sends its secret as well as the verifier');
  assert.equal(sent.redirect_uri, `${PROD}/auth/roblox/callback`);
  db.close();
});

test('the redirect_uri is built from the request origin only when that origin is the product or the dev server', async () => {
  const { db, kv, world, env } = scene();
  const prod = await startFlow(env, { origin: PROD });
  assert.equal(prod.redirectUri, `${PROD}/auth/roblox/callback`);
  assert.match(prod.setCookie, /; Secure/, 'a cookie set over https is Secure');
  // The dev origin is plain http, which index.ts's global https redirect answers before any route runs, so
  // it is driven through the routes themselves.
  const routes = R.robloxOAuthRoutes(() => false);
  const dev = await routes.request(`${DEV}/start`, {}, env);
  const devAuth = new URL(dev.headers.get('Location'));
  assert.equal(devAuth.searchParams.get('redirect_uri'), `${DEV}/auth/roblox/callback`);
  assert.doesNotMatch(dev.headers.getSetCookie()[0], /Secure/, 'http://localhost cannot hold a Secure cookie in every browser');

  // Anywhere else the flow is sent to the product host to start there, so its cookie is on the host it returns to.
  const before = kv.rows.size;
  const other = await startFlow(env, { origin: 'https://studpilot.someone.workers.dev', returnTo: '/usage' });
  assert.equal(other.res.status, 302);
  assert.equal(other.res.headers.get('Location').startsWith(`${PROD}/auth/roblox/start`), true);
  assert.equal(kv.rows.size, before, 'no state is stored for an origin that is not allowed');
  assert.equal(world.calls.length, 0);
  db.close();
});

/* --------------------------------------------------------------------- the state --- */

test('a state nobody issued is a 400, and Roblox and Supabase are not called', async () => {
  const { db, world, env } = scene();
  const flow = await startFlow(env);
  // The forged state comes with a matching cookie, so the only thing that can refuse it is that nobody issued it.
  const forged = 'a'.repeat(43);
  const { res } = await finish(env, world, flow, { sub: SUB_A, username: 'x', state: forged, cookie: `${STATE_C}=${forged}` });
  assert.equal(res.status, 400);
  assert.equal(world.calls.length, 0, 'a forged callback must not reach a provider');
  assert.equal(identityCount(db), 0);
  db.close();
});

test('a state can be used once: the replay is a 400 and the token endpoint is called once', async () => {
  const { db, world, env } = scene();
  const flow = await startFlow(env);
  const first = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.equal(first.res.status, 302);
  const replay = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.equal(replay.res.status, 400);
  assert.equal(world.roblox.tokenCalls.length, 1, 'the replayed callback must not exchange a second code');
  assert.equal(world.sb.createCalls, 0, 'a callback makes no account, replayed or not: the first sight waits for the person to press Continue');
  db.close();
});

test('a state issued to one browser is refused in another: it is bound to the browser by a cookie', async () => {
  // Login CSRF: the attacker starts a flow, finishes it on their own Roblox account, and gives the callback
  // URL to somebody else. The victim has no cookie for that state.
  const { db, kv, world, env } = scene();
  for (const cookie of ['', `${STATE_C}=` + 'z'.repeat(43)]) {
    const flow = await startFlow(env);
    const { res } = await finish(env, world, flow, { sub: SUB_A, username: 'Attacker', cookie });
    assert.equal(res.status, 400, `cookie "${cookie.slice(0, 20)}" must be refused`);
    assert.equal(world.roblox.tokenCalls.length, 0);
    assert.equal(kv.rows.has(`roblox-oauth:state:${flow.state}`), false, 'a refused state is still burned');
  }
  assert.equal(identityCount(db), 0);
  db.close();
});

test('the state cookie is __Host- prefixed (Secure, Path=/, no Domain), HttpOnly, SameSite=Lax, and is cleared with the same attributes when the callback is done', async () => {
  const { db, world, env } = scene();
  const flow = await startFlow(env);
  assert.deepEqual(flow.res.headers.getSetCookie().map((c) => c.split('=')[0]), [STATE_C], 'start sets this one cookie, under its prefixed name only');
  assertHostCookie(flow.setCookie, STATE_C, { maxAge: 600 });
  const { res } = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assertHostCookie(setCookieNamed(res, STATE_C, true), STATE_C, { maxAge: 0 });
  assert.equal(res.headers.getSetCookie().some((c) => /^rbx_oauth_/.test(c)), false, 'no cookie under an unprefixed name is set or cleared in production');
  db.close();
});

test('COOKIE PLANTING: in production only the __Host- names are read, so a cookie planted over plain http or from a sibling subdomain (which can only carry the bare name) is refused', async () => {
  const { db, kv, world, env } = scene();
  // THE STATE. The attacker plants `rbx_oauth_state=<the state of a flow they started>` in the victim's browser and gives the
  // victim the callback link; a worker that reads the bare name would then find the "cookie that binds the flow to this browser".
  const flow = await startFlow(env);
  const bare = await finish(env, world, flow, { sub: SUB_A, username: 'Attacker', cookie: `rbx_oauth_state=${flow.state}` });
  assert.equal(bare.res.status, 400, 'the bare name does not bind a flow to a browser');
  assert.equal(world.roblox.tokenCalls.length, 0, 'and nothing was exchanged');
  assert.equal(kv.rows.has(`roblox-oauth:state:${flow.state}`), false, 'the state was burned by being offered');
  assert.equal(identityCount(db), 0);
  // The control: the very same flow under the prefixed name is accepted, so the refusal above is the name and nothing else.
  const ok = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(ok.res.status, 302);
  // Both names present: a planted bare cookie neither helps nor hurts a flow that has the real one ...
  const alongside = await startFlow(env);
  const planted = await finish(env, world, alongside, { sub: SUB_B, username: 'Bob', cookie: `rbx_oauth_state=${'p'.repeat(43)}; ${alongside.cookie}` });
  assert.equal(planted.res.status, 302, 'a planted bare cookie does not displace the real one');
  // ... and cannot stand in for a prefixed one that is wrong.
  const spoofed = await startFlow(env);
  const refused = await finish(env, world, spoofed, { sub: SUB_B, username: 'Bob', cookie: `rbx_oauth_state=${spoofed.state}; ${STATE_C}=${'q'.repeat(43)}` });
  assert.equal(refused.res.status, 400);

  // THE HANDLE. A handle planted under the bare name is never read, and is not burned by being offered.
  const handle = handleCookieOf(ok.res).split('=')[1];
  const offered = await redeemRequest(env, { cookie: `rbx_oauth_handle=${handle}` });
  assert.equal(offered.status, 400, 'the bare name redeems nothing');
  assert.equal((await offered.text()).includes('ht_'), false);
  assert.equal(kv.rows.has(`roblox-oauth:handle:${handle}`), true, 'the real handle was not read or spent');
  const real = await redeemRequest(env, { cookie: `${HANDLE_C}=${handle}` });
  assert.equal(real.status, 200, 'the prefixed name redeems it');
  db.close();
});

test('on the registered http://localhost dev origin, and only there, the cookies keep working plain names', async () => {
  const { db, world, env } = scene();
  // index.ts answers every plain-http request with a redirect to https before a route runs, so the dev origin is driven through the routes.
  const routes = R.robloxOAuthRoutes(() => false);
  const start = await routes.request(`${DEV}/start`, {}, env);
  const set = start.headers.getSetCookie();
  assert.deepEqual(set.map((c) => c.split('=')[0]), ['rbx_oauth_state'], 'a bare name, because a __Host- cookie needs Secure and Safari refuses that on http');
  assert.doesNotMatch(set[0], /; Secure|__Host-/);
  assert.match(set[0], /; HttpOnly/);
  assert.match(set[0], /; SameSite=Lax/);
  assert.match(set[0], /; Path=\/auth\/roblox(;|$)/, 'and with no prefix to protect it, it stays scoped to the routes');
  const auth = new URL(start.headers.get('Location'));
  const state = auth.searchParams.get('state');
  const code = world.roblox.issueCode({ sub: SUB_A, username: 'Dev', challenge: auth.searchParams.get('code_challenge'), redirectUri: `${DEV}/auth/roblox/callback` });
  const callback = await routes.request(`${DEV}/callback?code=${code}&state=${state}`, { headers: { Cookie: `rbx_oauth_state=${state}` } }, env);
  assert.equal(callback.status, 302, 'the dev flow completes with the bare cookie');
  const handleLine = callback.headers.getSetCookie().find((c) => c.startsWith('rbx_oauth_handle=') && !/Max-Age=0/.test(c));
  assert.ok(handleLine, 'and sets a bare handle cookie');
  assert.doesNotMatch(handleLine, /; Secure|__Host-/);
  assert.match(handleLine, /; Path=\/auth\/roblox\/(;|$)/, 'scoped to the routes, and to all three the SPA posts to (the next test is the browser’s path match)');
  // A first sight is held until the person presses Continue, here as everywhere.
  const asked = await routes.request(`${DEV}/redeem`, { method: 'POST', headers: { Origin: DEV, Cookie: handleLine.split(';')[0] } }, env);
  assert.equal((await asked.json()).confirm, 'new-account');
  assert.equal((await routes.request(`${DEV}/create`, { method: 'POST', headers: { Origin: DEV, Cookie: handleLine.split(';')[0] } }, env)).status, 200);
  const redeem = await routes.request(`${DEV}/redeem`, { method: 'POST', headers: { Origin: DEV, Cookie: handleLine.split(';')[0] } }, env);
  assert.equal(redeem.status, 200);
  assert.match((await redeem.json()).token_hash, /^ht_/);
  db.close();
});

/* ----------------------------------------------------------- errors say one thing --- */

test('a failed code exchange gives a generic error and creates nothing', async () => {
  const { db, world, env } = scene();
  world.roblox.failToken = { status: 400, body: { error: 'invalid_grant', error_description: 'LEAK-ME-PROVIDER-DETAIL' } };
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 502);
  const html = await res.text();
  assert.ok(html.includes(GENERIC), 'the fixed sentence is what the person sees');
  assert.equal(html.includes('LEAK-ME'), false, 'nothing the provider said is reflected');
  assert.equal(html.includes('invalid_grant'), false);
  assert.equal(world.sb.createCalls, 0);
  assert.equal(identityCount(db), 0);
  db.close();
});

test('an error sent back by Roblox on the callback URL is not reflected either', async () => {
  const { db, world, env } = scene();
  const flow = await startFlow(env);
  const res = await hit(
    `${PROD}/auth/roblox/callback?error=access_denied&error_description=${encodeURIComponent('<script>alert(1)</script>LEAK-ME-2')}&state=${flow.state}`,
    { headers: { 'CF-Connecting-IP': flow.ip, Cookie: flow.cookie } }, env,
  );
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.ok(html.includes(GENERIC));
  assert.equal(html.includes('LEAK-ME-2'), false);
  assert.equal(html.includes('<script>'), false);
  assert.equal(world.calls.length, 0);
  db.close();
});

test('a userinfo answer whose sub is not a number is refused rather than escaped into an address', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: '1; drop table roblox_identities', username: 'x' });
  assert.equal(res.status, 502);
  assert.equal(world.sb.createCalls, 0);
  db.close();
});

/* ------------------------------------------------------------- the return path --- */

test('a return path that is not an app screen is dropped, never followed', async () => {
  for (const bad of ['https://evil.example/x', '//evil.example', '/\\evil.example', '/app/../../etc', 'javascript:alert(1)', '/projects/a/b/c', '/join?token=short', '/usage\r\nSet-Cookie: x=1', '/' + 'a'.repeat(300)]) {
    const { db, kv, world, env } = scene();
    const { flow, res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { returnTo: bad });
    assert.equal(JSON.parse(kv.rows.get(`roblox-oauth:state:${flow.state}`) ?? 'null'), null, 'the state is burned by the callback');
    assert.equal(res.status, 302, `a bad return path must not break sign-in: ${bad.slice(0, 30)}`);
    const location = res.headers.get('Location');
    assert.equal(location, '/app/auth/roblox', `leaves the product for ${bad.slice(0, 30)}`);
    assert.equal((await (await redeemFor(env, res)).json()).next, '/', `${bad.slice(0, 30)} was carried to the landing page`);
    assert.equal(location.includes('evil'), false);
    db.close();
  }
});

test('a return path that is an app screen travels with the handle, never in the URL', async () => {
  const token = 'T'.repeat(24);
  for (const good of ['/usage', '/settings', '/projects/3f1c2a9e-1111-4222-8333-abcdefabcdef', '/projects/abc/roadmap', `/join?token=${token}`]) {
    const { db, world, env } = scene();
    const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { returnTo: good });
    assert.equal(res.headers.get('Location'), '/app/auth/roblox', 'the URL carries no part of it');
    assert.equal((await (await redeemFor(env, res)).json()).next, good);
    db.close();
  }
});

/* --------------------------------------------------------------------- the account --- */

test('FIRST SIGHT creates exactly one Supabase user, with a synthetic address nothing can deliver to', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 302);
  assert.equal(world.sb.createCalls, 1);
  assert.equal(world.sb.users.size, 1);
  const user = [...world.sb.users.values()][0];
  assert.equal(user.email, SYNTHETIC(SUB_A));
  assert.match(user.email, /^roblox-[0-9a-f]{32}@users\.studpilot\.invalid$/);
  assert.equal(user.confirmedByAdmin, true, 'email_confirm is set, so no confirmation mail is waiting on an undeliverable address');
  assert.equal(user.app_metadata.roblox_sub, SUB_A);
  assert.equal(user.user_metadata.display_name, 'Builder1', 'the profile is named for the Roblox username, not for the synthetic address');
  const rows = rowsOf(db, 'select * from roblox_identities');
  assert.equal(rows.length, 1);
  assert.deepEqual({ sub: rows[0].roblox_sub, user: rows[0].user_id, name: rows[0].username }, { sub: SUB_A, user: user.id, name: 'Builder1' });
  // No mail is sent: the only Supabase calls are admin ones, and a first sight needs just the two.
  assert.deepEqual(world.calls.filter((c) => c.url.startsWith(SB)).map((c) => `${c.method} ${new URL(c.url).pathname}`),
    ['POST /auth/v1/admin/users', 'POST /auth/v1/admin/generate_link']);
  db.close();
});

test('the same Roblox account signing in again is the same user, and a changed username is only a rename', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'OldName' });
  const userId = userIdOf(db, SUB_A);
  const second = await signIn(env, world, { sub: SUB_A, username: 'NewName' });
  assert.equal(second.res.status, 302);
  assert.equal(world.sb.createCalls, 1, 'a second sign-in must not create a second account');
  assert.equal(world.sb.users.size, 1);
  assert.equal(userIdOf(db, SUB_A), userId);
  assert.equal(rowsOf(db, 'select username from roblox_identities where roblox_sub = ?', SUB_A)[0].username, 'NewName');
  assert.equal(world.sb.links.get(await tokenHashOf(env, second.res)), userId, 'the sign-in token is for the same user');
  db.close();
});

/** [what is hostile about it, what Roblox sent, what is kept]. The name is stored, shown in Settings and named in the profile. */
const HOSTILE_NAMES = [
  ['a right-to-left override that reorders what follows', 'Evil\u202Etxt.exe', 'Eviltxt.exe'],
  ['zero-width characters and a joiner that make two names look alike', 'Ad\u200bmin\u200d\ufeff', 'Admin'],
  ['isolates and embeddings', 'a\u2066b\u2067c\u2068d\u2069e\u202ag\u202c', 'abcdeg'],
  ['C0 controls, newlines, DEL and NUL', 'a\u0000b\nc\rd\te\u007ff', 'abcdef'],
  ['C1 controls and the Unicode line separators', 'x\u0085y\u2028z\u2029', 'xyz'],
  ['padding and runs of space', '   two   words   ', 'two words'],
  ['500 characters', 'x'.repeat(500), 'x'.repeat(100)],
  ['150 emoji, cut on a code point and never inside a surrogate pair', '😀'.repeat(150), '😀'.repeat(100)],
  ['markup, which is only ever text here', '<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
];

test('HOSTILE USERNAMES: invisible, reordering and control characters are stripped and the length is capped, before the name is stored or sent on', async () => {
  for (const [what, sent, kept] of HOSTILE_NAMES) {
    const { db, world, env } = scene();
    const { res } = await signIn(env, world, { sub: SUB_A, username: sent });
    assert.equal(res.status, 302, `${what}: a hostile name must not break sign-in`);
    assert.equal(rowsOf(db, 'select username from roblox_identities')[0].username, kept, `${what}: the stored name`);
    assert.equal([...world.sb.users.values()][0].user_metadata.display_name, kept, `${what}: the profile name`);
    assert.equal(kept.isWellFormed(), true, `${what}: no lone surrogate`);
    assert.equal((await res.text()).includes('Evil'), false, `${what}: nothing of it is reflected in a page`);
    // A rename to the same hostile text is cleaned the same way.
    await signIn(env, world, { sub: SUB_A, username: `${sent}!` });
    assert.equal(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(rowsOf(db, 'select username from roblox_identities')[0].username), false, `${what}: the renamed name`);
    db.close();
  }
});

test('a profile whose every name is invisible falls back to a plain name made from the id, and the first usable name wins', async () => {
  const { db, world, env } = scene();
  world.roblox.userinfo = (who) => ({ sub: who.sub, preferred_username: '\u200b\u200d \u202e', nickname: '\u2800\u3164', name: '\u0000' });
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'ignored' });
  assert.equal(res.status, 302);
  assert.equal(rowsOf(db, 'select username from roblox_identities')[0].username, `roblox-${SUB_A}`);
  db.close();

  const next = scene();
  next.world.roblox.userinfo = (who) => ({ sub: who.sub, preferred_username: '\u200b', nickname: 'Display Name', name: 'Ignored' });
  await signIn(next.env, next.world, { sub: SUB_B, username: 'ignored' });
  assert.equal(rowsOf(next.db, 'select username from roblox_identities')[0].username, 'Display Name', 'an empty preferred_username does not hide a usable nickname');
  next.db.close();
});

test('a different Roblox account with the same username is a different user, and cannot reach the first', async () => {
  const { db, world, env } = scene();
  const a = await signIn(env, world, { sub: SUB_A, username: 'Shared' });
  const b = await signIn(env, world, { sub: SUB_B, username: 'Shared' });
  assert.equal(world.sb.users.size, 2);
  const userA = userIdOf(db, SUB_A);
  const userB = userIdOf(db, SUB_B);
  assert.notEqual(userA, userB);
  assert.equal(world.sb.links.get(await tokenHashOf(env, a.res)), userA);
  assert.equal(world.sb.links.get(await tokenHashOf(env, b.res)), userB, 'B is signed in as B, never as A');
  db.close();
});

test('the Roblox account that is already linked to a user cannot be linked to a second one', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const userA = userIdOf(db, SUB_A);
  assert.throws(() => db.raw.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at) values (?, ?, ?, ?)').run('999', userA, 'x', 'now'),
    /UNIQUE/i, 'one user, one Roblox account: the unique index is what stops a second link');
  assert.throws(() => db.raw.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at) values (?, ?, ?, ?)').run(SUB_A, 'someone-else', 'x', 'now'),
    /UNIQUE|PRIMARY/i, 'and a sub belongs to exactly one user');
  db.close();
});

test('two callbacks for the same new sub, and two presses of Continue, at once, still make one user and one link', async () => {
  const { db, world, env } = scene();
  const flows = [await startFlow(env), await startFlow(env)];
  const done = await Promise.all(flows.map((f) => finish(env, world, f, { sub: SUB_A, username: 'Builder1' })));
  assert.deepEqual(done.map((d) => d.res.status), [302, 302]);
  assert.equal(world.sb.users.size, 0, 'two callbacks make nobody: both first sights wait for Continue');
  await Promise.all(done.map((d) => confirmIfAsked(env, d.res)));
  assert.equal(world.sb.users.size, 1, 'Supabase holds one user for the synthetic address');
  assert.equal(countRows(db.raw, 'select count(*) from roblox_identities'), 1);
  const userId = userIdOf(db, SUB_A);
  for (const d of done) assert.equal(world.sb.links.get(await tokenHashOf(env, d.res)), userId);
  db.close();
});

/* ------------------------------------------------- the address is keyed, so it cannot be squatted --- */

test('the synthetic address is a keyed digest of the Roblox id: not computable from the public id, and the id is not in it', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const email = [...world.sb.users.values()][0].email;
  assert.equal(email, SYNTHETIC(SUB_A), 'HMAC-SHA-256 of the id under a subkey of CREDENTIAL_KEY, recomputed here independently');
  assert.equal(email.includes(SUB_A), false, 'the public Roblox id is not in the address');
  // Everything an outsider could compute from the public id alone.
  const local = (guess) => `roblox-${guess}@users.studpilot.invalid`;
  for (const guess of [LEGACY(SUB_A), local(sha256hex(SUB_A).slice(0, 32)), local(sha256hex(`roblox-${SUB_A}`).slice(0, 32)), local(createHash('sha1').update(SUB_A).digest('hex').slice(0, 32))]) {
    assert.notEqual(email, guess, `${guess} is computable without the key`);
  }
  assert.notEqual(SYNTHETIC(SUB_B), email, 'another person, another address');
  db.close();

  // Another deployment key, another address: the address is a function of the secret, not only of the id.
  const otherKey = Buffer.alloc(32, 9).toString('base64');
  const other = scene({ CREDENTIAL_KEY: otherKey });
  await signIn(other.env, other.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal([...other.world.sb.users.values()][0].email, SYNTHETIC(SUB_A, otherKey));
  assert.notEqual(SYNTHETIC(SUB_A, otherKey), email);
  other.db.close();
});

test('the keyed identifier is separated by its purpose label: the same key and value under another purpose is another identifier', async () => {
  const env = { CREDENTIAL_KEY: KEY_B64 };
  const a = await C.keyedId(env, 'roblox-signin-address', SUB_A);
  assert.equal(a, SYNTHETIC(SUB_A).slice('roblox-'.length, 'roblox-'.length + 32));
  assert.notEqual(await C.keyedId(env, 'some-other-purpose', SUB_A), a);
  assert.equal(await C.keyedId(env, 'roblox-signin-address', SUB_A), a, 'and it is deterministic');
  await assert.rejects(C.keyedId({}, 'roblox-signin-address', SUB_A), /CREDENTIAL_KEY/, 'with no key there is no identifier, rather than an unkeyed one');
});

test('SQUATTING: the OLD public address, pre-registered through the open sign-up, no longer locks the Roblox user out', async () => {
  // Before the address was keyed it was roblox-<sub>@users.studpilot.invalid, computable from the public Roblox id.
  // Anyone could register it by hand and the real Roblox user would then be refused for ever.
  const { db, world, env } = scene();
  const squatter = { id: randomUUID(), email: LEGACY(SUB_A), app_metadata: {}, user_metadata: {} };
  world.sb.users.set(squatter.id, squatter);
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 302, 'the Roblox user signs in');
  const userId = userIdOf(db, SUB_A);
  assert.notEqual(userId, squatter.id, 'and is never given the squatter’s account');
  assert.equal(world.sb.users.get(userId).email, SYNTHETIC(SUB_A));
  assert.equal(world.sb.links.get(await tokenHashOf(env, res)), userId);
  assert.deepEqual(world.sb.users.get(squatter.id), squatter, 'the squatter’s user was not touched');
  db.close();
});

test('an address that is somehow taken by a user with no roblox_sub is NEVER adopted, and fails CLOSED with its own status, code and log line', async () => {
  const { db, world, env } = scene();
  const squatter = { id: randomUUID(), email: SYNTHETIC(SUB_A), app_metadata: {}, user_metadata: {} };
  world.sb.users.set(squatter.id, squatter);
  LOGS.length = 0;
  // The callback cannot know: the address is only looked at when the account is made, after the person presses Continue.
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  assert.equal(res.status, 302);
  const created = await createRequest(env, { cookie: handleCookieOf(res) });
  assert.equal(created.status, 409, 'not the generic 502: an operator can tell this from a Roblox or Supabase outage');
  const body = await created.json();
  assert.equal(body.error, GENERIC, 'the person still gets the one fixed sentence');
  assert.equal(body.reference, 'roblox_address_taken', 'and a reference they can quote');
  assert.equal((await (await redeemFor(env, res)).json()).token_hash, undefined, 'no sign-in is issued: the first sight is still only waiting');
  assert.equal(identityCount(db), 0);
  assert.ok(LOGS.includes('[roblox-oauth] synthetic address taken'), `the operator-visible log line is missing: ${JSON.stringify(LOGS.slice(-3))}`);
  assert.deepEqual(world.sb.users.get(squatter.id), squatter, 'the squatter’s user was not touched');
  assert.equal(world.sb.ghosts, 0);

  // ... and an ordinary failure is still its own, different answer.
  const generic = scene();
  generic.world.roblox.failToken = { status: 400, body: { error: 'invalid_grant' } };
  const failed = await signIn(generic.env, generic.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(failed.res.status, 502);
  assert.equal((await failed.res.text()).includes('roblox_address_taken'), false);
  db.close();
  generic.db.close();
});

test('an address held by a user whose app_metadata names a DIFFERENT roblox_sub is refused, not adopted: the sub on it must be this one', async () => {
  const { db, world, env } = scene();
  const holder = { id: randomUUID(), email: SYNTHETIC(SUB_A), app_metadata: { roblox_sub: SUB_B }, user_metadata: {} };
  world.sb.users.set(holder.id, holder);
  LOGS.length = 0;
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  const created = await createRequest(env, { cookie: handleCookieOf(res) });
  assert.equal(created.status, 409, 'a roblox_sub is present, so a check that only asks "is there one" would adopt this user');
  const body = await created.json();
  assert.ok(body.error === GENERIC && body.reference === 'roblox_address_taken');
  assert.equal((await (await redeemFor(env, res)).json()).token_hash, undefined, 'no sign-in is issued');
  assert.equal(identityCount(db), 0, 'nothing is linked');
  assert.ok(LOGS.includes('[roblox-oauth] synthetic address taken'));
  assert.deepEqual(world.sb.users.get(holder.id), holder, 'the other person’s user was not touched');
  assert.equal(world.sb.links.size, 1, 'the one link the worker minted to READ the metadata was never handed to anybody');
  assert.equal([...kvHandles(env)].filter((k) => !('pending' in JSON.parse(env.KV.rows.get(k)))).length, 0, 'and no ready sign-in waits in KV: only the first sight, still pending');
  db.close();
});

test('a user this worker made for the same sub, left behind by a sign-in that stopped halfway, is adopted', async () => {
  const { db, world, env } = scene();
  const orphan = { id: randomUUID(), email: SYNTHETIC(SUB_A), app_metadata: { roblox_sub: SUB_A }, user_metadata: {} };
  world.sb.users.set(orphan.id, orphan);
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 302);
  assert.equal(userIdOf(db, SUB_A), orphan.id);
  assert.equal(world.sb.users.size, 1);
  db.close();
});

/* ---------------------------------------------------- the link to a Supabase user can go stale --- */

test('STALE LINK: an identity row whose Supabase user no longer exists is dropped with its token row, and the sign-in goes on as a first sight', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const gone = userIdOf(db, SUB_A);
  world.sb.users.delete(gone);                       // an operator deleted the user in the Supabase dashboard
  const again = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(again.res.status, 302, 'the person is not locked out by a link to nobody');
  const now = userIdOf(db, SUB_A);
  assert.notEqual(now, gone);
  assert.equal(world.sb.users.size, 1);
  assert.equal(world.sb.users.get(now).email, SYNTHETIC(SUB_A));
  assert.equal(world.sb.users.get(now).app_metadata.roblox_sub, SUB_A);
  assert.equal(world.sb.links.get(await tokenHashOf(env, again.res)), now);
  assert.equal(countRows(db.raw, 'select count(*) from roblox_oauth_tokens where user_id = ?', gone), 0, 'the dead user’s token row is gone');
  assert.equal(countRows(db.raw, 'select count(*) from roblox_oauth_tokens where user_id = ?', now), 1, 'and the new user holds the new token');
  assert.equal(countRows(db.raw, 'select count(*) from roblox_identities'), 1);
  db.close();
});

test('a 404 that is not GoTrue’s "user not found" (a wrong URL, a proxy page) does NOT drop the link, and an unreachable Auth creates nobody', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const userId = userIdOf(db, SUB_A);
  const inner = world.fetch;
  for (const answer of [() => new Response('<html>Not Found</html>', { status: 404 }), () => new Response('{}', { status: 500 }), () => { throw new TypeError('network'); }]) {
    globalThis.fetch = async (u, i = {}) => (/\/auth\/v1\/admin\/users\/[^/]+$/.test(String(u)) && (i.method ?? 'GET') === 'GET' ? answer() : inner(u, i));
    const created = world.sb.createCalls;
    const res = await (await finish(env, world, await startFlow(env), { sub: SUB_A, username: 'Builder1' })).res;
    assert.equal(res.status, 502, 'cannot tell, so no sign-in');
    assert.equal(userIdOf(db, SUB_A), userId, 'the link is untouched');
    assert.equal(world.sb.createCalls, created, 'and no second account was made for the same Roblox user');
  }
  db.close();
});

/* ------------------------------------------- the user changed their address; the link follows it --- */

test('a Roblox sign-in still works after the person changed their email: the link is minted for the CURRENT address of the SAME user', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const userId = userIdOf(db, SUB_A);
  world.sb.users.get(userId).email = 'real-person@example.com';       // they set a real address under Security
  const again = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(again.res.status, 302);
  // The mock behaves like GoTrue: a magic link for an address nobody holds SIGNS IT UP. A worker that asked for the
  // synthetic address here would sign the person in as an empty stranger instead of failing.
  assert.equal(world.sb.ghosts, 0, 'no link was asked for an address nobody holds');
  assert.equal(world.sb.users.size, 1);
  assert.equal(world.sb.links.get(await tokenHashOf(env, again.res)), userId, 'the token is for the same user');
  db.close();
});

test('the sign-in token is refused when Auth mints it for a DIFFERENT user than the one the worker linked, and no handle is issued', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const userId = userIdOf(db, SUB_A);
  const inner = world.fetch;
  // Between the worker reading the user's address and asking for the link, the address changes hands: GoTrue then SIGNS UP the
  // address it was asked about (a magic link for an address nobody holds does that) and mints the link for that stranger.
  globalThis.fetch = async (u, i = {}) => {
    const res = await inner(u, i);
    if (/\/auth\/v1\/admin\/users\/[^/]+$/.test(String(u)) && (i.method ?? 'GET') === 'GET') world.sb.users.get(userId).email = 'moved@example.com';
    return res;
  };
  LOGS.length = 0;
  const again = await finish(env, world, await startFlow(env), { sub: SUB_A, username: 'Builder1' });
  assert.equal(again.res.status, 502, 'a link for anybody else is not a link for this person');
  assert.equal(world.sb.ghosts, 1, 'the mock did mint a link, for a user the sign-in is not about');
  assert.equal(handleCookieOf(again.res), '');
  assert.equal(kvHandles(env).length, 1, 'only the handle of the first, honest sign-in is waiting (it was never redeemed here)');
  assert.ok(LOGS.includes('[roblox-oauth] sign-in token'));
  assert.equal(await again.res.text().then((t) => /ht_/.test(t)), false);
  db.close();
});

/* --------------------------- the sign-in token is bound to the browser that finished the callback --- */

test('the callback puts NO token in any URL, header or body: it sets a one-time handle cookie, and the token waits in KV behind it', async () => {
  const { db, kv, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const hash = [...world.sb.links.keys()][0];
  assert.equal(res.headers.get('Location'), '/app/auth/roblox', 'no query, no fragment: nothing a link could carry');
  assert.equal(await res.text(), '', 'and the body is empty');
  assert.equal(JSON.stringify([...res.headers.entries()]).includes(hash), false, 'the token hash is in no response header either');

  const cookie = setCookieNamed(res, HANDLE_C);
  assert.ok(cookie, 'the callback sets a handle cookie');
  assertHostCookie(cookie, HANDLE_C, { maxAge: 300 });
  const handle = cookie.split(';')[0].split('=')[1];
  assert.ok(handle.length >= 40, 'an unguessable handle');
  assert.equal(handle.includes(hash), false, 'and it is not the token');
  const stored = JSON.parse(kv.rows.get(`roblox-oauth:handle:${handle}`));
  assert.equal(stored.tokenHash, hash, 'the token is in KV, keyed by the handle');
  assert.equal(kv.ttls.get(`roblox-oauth:handle:${handle}`), 300, 'for five minutes at most');
  assert.deepEqual(world.calls.filter((c) => /\/auth\/v1\/(token|verify|signup|otp)\b/.test(c.url)), [], 'and the worker mints no session');
  db.close();
});

test('REDEEM: the browser that holds the cookie gets the token hash and the return path ONCE, and the cookie and the KV entry are gone', async () => {
  const { db, kv, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { returnTo: '/usage' });
  const cookie = handleCookieOf(res);
  const handle = cookie.split('=')[1];
  const first = await redeemRequest(env, { cookie });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { token_hash: [...world.sb.links.keys()][0], next: '/usage' });
  assertHostCookie(setCookieNamed(first, HANDLE_C, true), HANDLE_C, { maxAge: 0 });
  assert.equal(kv.rows.has(`roblox-oauth:handle:${handle}`), false, 'the KV entry is burned');
  const replay = await redeemRequest(env, { cookie });
  assert.equal(replay.status, 400, 'a second redeem, even with the same cookie, gets nothing');
  assert.equal((await replay.text()).includes('ht_'), false);
  db.close();
});

test('LOGIN CSRF: an attacker who finishes their own sign-in cannot sign a victim in as the attacker, by any link they can build', async () => {
  const { db, kv, world, env } = scene();
  // The attacker runs the whole flow in THEIR browser, so they hold everything the callback answered with.
  const attacker = await signIn(env, world, { sub: SUB_B, username: 'Attacker' });
  const attackerHash = [...world.sb.links.keys()].at(-1);
  const attackerHandle = handleCookieOf(attacker.res).split('=')[1];
  // What they can hand the victim: the landing URL (nothing secret in it) or the callback URL replayed (its state is burned).
  assert.equal(attacker.res.headers.get('Location').includes(attackerHash), false);
  assert.equal(attacker.res.headers.get('Location').includes(attackerHandle), false);
  const victimHeaders = [
    ['no cookie at all', ''],
    ['a guessed handle', `${HANDLE_C}=` + 'z'.repeat(43)],
    ['the state cookie of some flow', `${STATE_C}=` + attacker.flow.state],
    ['a handle in the wrong cookie name', `${HANDLE_C}2=` + attackerHandle],
  ];
  for (const [what, cookie] of victimHeaders) {
    const res = await redeemRequest(env, { cookie });
    assert.equal(res.status, 400, `${what} must not redeem anything`);
    assert.equal((await res.text()).includes(attackerHash), false, `${what} was handed the attacker’s token`);
  }
  assert.equal(kv.rows.has(`roblox-oauth:handle:${attackerHandle}`), true, 'and the victim’s attempts did not burn the attacker’s handle: it is the attacker’s browser that holds it');
  // The only browser that can redeem it is the one that has the cookie.
  assert.equal((await redeemFor(env, attacker.res)).status, 200);
  db.close();
});

test('REDEEM is a same-origin POST: another origin, or no Origin, is refused WITHOUT spending the handle', async () => {
  const { db, kv, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const cookie = handleCookieOf(res);
  const handle = cookie.split('=')[1];
  for (const origin of ['https://evil.example', 'http://localhost:5173', 'https://studpilot.app.evil.example', 'null', '']) {
    const r = await redeemRequest(env, { cookie, origin });
    assert.equal(r.status, 403, `Origin "${origin}" must be refused`);
    assert.equal((await r.text()).includes('ht_'), false);
    assert.equal(kv.rows.has(`roblox-oauth:handle:${handle}`), true, `Origin "${origin}" must not burn the handle`);
  }
  const get = await redeemRequest(env, { cookie, method: 'GET' });
  assert.notEqual(get.status, 200, 'a GET does not redeem');
  assert.equal((await get.text()).includes('ht_'), false);
  assert.equal(kv.rows.has(`roblox-oauth:handle:${handle}`), true);
  assert.equal((await redeemRequest(env, { cookie })).status, 200, 'and the real thing still works afterwards');
  db.close();
});

test('a handle that has outlived its time is refused', async () => {
  const { db, kv, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  kv.rows.delete(`roblox-oauth:handle:${handleCookieOf(res).split('=')[1]}`);      // KV's TTL fired
  const late = await redeemFor(env, res);
  assert.equal(late.status, 400);
  assert.equal((await late.text()).includes('ht_'), false);
  db.close();
});

test('with a secret missing REDEEM answers 503 and reads nothing', async () => {
  const { db, kv, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const cookie = handleCookieOf(res);
  const before = kv.rows.size;
  delete env.SUPABASE_SECRET_KEY;
  const off = await redeemRequest(env, { cookie });
  assert.equal(off.status, 503);
  assert.equal(kv.rows.size, before, 'the handle was not read or burned');
  db.close();
});

test('the Supabase secret key goes in `apikey`, and only a JWT-shaped legacy key is also sent as the bearer', async () => {
  const modern = scene();
  await signIn(modern.env, modern.world, { sub: SUB_A, username: 'Builder1' });
  assert.ok(modern.world.sb.headers.length >= 2, 'a first sight makes two admin calls: create, then mint');
  for (const h of modern.world.sb.headers) assert.deepEqual(h, { apikey: SB_SECRET, authorization: null });
  modern.db.close();

  const legacyKey = 'eyJhbGciOiJIUzI1NiJ9.' + 'e'.repeat(30) + '.' + 'f'.repeat(30);
  const legacy = scene({ SUPABASE_SECRET_KEY: legacyKey });
  // The mock only knows one key; point it at the legacy one for this run.
  const seen = [];
  const inner = legacy.world.fetch;
  globalThis.fetch = async (u, i = {}) => {
    const h = new Headers(i.headers ?? {});
    if (String(u).startsWith(SB)) { seen.push({ apikey: h.get('apikey'), authorization: h.get('authorization') }); return inner(u, { ...i, headers: { ...Object.fromEntries(h), apikey: SB_SECRET } }); }
    return inner(u, i);
  };
  await signIn(legacy.env, legacy.world, { sub: SUB_A, username: 'Builder1' });
  assert.ok(seen.length >= 2);
  for (const h of seen) assert.deepEqual(h, { apikey: legacyKey, authorization: `Bearer ${legacyKey}` });
  legacy.db.close();
});

/* ------------------------------------------------------------------- the token store --- */

test('the refresh token is stored sealed, is not in any response, and is the one Roblox issued', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const refresh = world.roblox.lastRefreshIssued;
  assert.match(refresh, /^RBX-/);
  const row = rowsOf(db, 'select * from roblox_oauth_tokens')[0];
  assert.equal(row.user_id, userIdOf(db, SUB_A));
  assert.equal(row.sub, SUB_A);
  assert.equal(row.scopes, 'openid profile');
  assert.equal(row.version, 1);
  assert.match(row.sealed_refresh, /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/, 'iv.ciphertext, the shape every sealed secret in this product has');
  assert.equal(JSON.stringify(row).includes(refresh), false, 'the plaintext token is nowhere in the row');
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, row.sealed_refresh), refresh, 'and it opens with the wrapping key');
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64') }, row.sealed_refresh), null, 'and with no other');
  assert.equal((await res.text()).includes(refresh), false);
  assert.equal(res.headers.get('Location').includes(refresh), false);
  db.close();
});

test('signing in again replaces the stored token and bumps the version, so a refresh begun before it cannot overwrite it', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const first = rowsOf(db, 'select sealed_refresh, version, generation from roblox_oauth_tokens')[0];
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const second = rowsOf(db, 'select sealed_refresh, version, generation from roblox_oauth_tokens')[0];
  assert.equal(second.version, first.version + 1);
  assert.notEqual(second.sealed_refresh, first.sealed_refresh);
  assert.match(first.generation, /^[A-Za-z0-9_-]{20,}$/, 'a random label, not a counter');
  assert.notEqual(second.generation, first.generation, 'every sign-in is a new generation: it is a new authorization at Roblox');
  assert.equal(countRows(db.raw, 'select count(*) from roblox_oauth_tokens'), 1);
  db.close();
});

test('RE-SIGN-IN REPLACES the stored token and does NOT revoke the previous one: a deliberate choice, pinned', async () => {
  // Revoking the previous token would be wrong if Roblox ties the tokens of one authorization together (the new
  // sign-in's token would die with it) and gains nothing if it does not: the previous token is held nowhere here,
  // so nobody can use it. So it is replaced, not revoked. proof/M2/ROBLOX-SIGNIN.md section 6 says what to watch.
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const first = world.roblox.lastRefreshIssued;
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const second = world.roblox.lastRefreshIssued;
  assert.notEqual(first, second);
  const rows = rowsOf(db, 'select sealed_refresh from roblox_oauth_tokens');
  assert.equal(rows.length, 1);
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, rows[0].sealed_refresh), second, 'the new token is the one stored');
  assert.deepEqual(world.roblox.revokeCalls, [], 'the previous token was not sent to be revoked');
  assert.equal(world.roblox.refresh.get(second).state, 'live', 'so the new one is alive');
  assert.equal(world.roblox.refresh.get(first).state, 'live', 'and the old one is left as Roblox has it, held by nothing here');
  db.close();
});

/* ----------------------------------------------------------------------- rotation --- */

async function connected(extra) {
  const s = scene(extra);
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  s.userId = userIdOf(s.db, SUB_A);
  s.row = () => rowsOf(s.db, 'select * from roblox_oauth_tokens where user_id = ?', s.userId)[0];
  return s;
}

test('ROTATION: a refresh spends the stored token, stores the replacement, and the next refresh spends THAT one', async () => {
  const s = await connected();
  const signInToken = s.world.roblox.lastRefreshIssued;
  const sealedBefore = s.row().sealed_refresh;

  const one = await R.refreshRobloxAccessToken(s.env, s.userId);
  assert.equal(one.ok, true);
  assert.match(one.accessToken, /^at_/);
  assert.equal(s.world.roblox.tokenCalls.at(-1).refresh_token, signInToken, 'the stored token is what is presented');
  const replacement = s.world.roblox.lastRefreshIssued;
  assert.notEqual(replacement, signInToken);
  assert.equal(s.row().version, 2, 'compare-and-swap moved the version');
  assert.notEqual(s.row().sealed_refresh, sealedBefore);
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, s.row().sealed_refresh), replacement);
  assert.equal(s.row().lease_until, null, 'the lease is released');

  const two = await R.refreshRobloxAccessToken(s.env, s.userId, Date.now() + 20 * 60_000);       // the 15-minute access token has lapsed
  assert.equal(two.ok, true);
  assert.equal(s.world.roblox.tokenCalls.at(-1).refresh_token, replacement);
  assert.equal(s.world.roblox.burned, false, 'a spent token was never presented twice');
  assert.equal(s.row().version, 3);
  s.db.close();
});

test('CONCURRENT REFRESH: two requests at once spend the token once; the other is told to retry; the grant is not burned', async () => {
  const s = await connected();
  const before = s.world.roblox.tokenCalls.length;
  const results = await Promise.all([R.refreshRobloxAccessToken(s.env, s.userId), R.refreshRobloxAccessToken(s.env, s.userId)]);
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  assert.equal(results.find((r) => !r.ok).reason, 'busy');
  assert.equal(s.world.roblox.tokenCalls.length - before, 1, 'Roblox saw exactly one refresh');
  assert.equal(s.world.roblox.burned, false);
  assert.equal(s.row().version, 2);
  // And the loser can simply try again, and is served the token the winner just got, without a second spend.
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).ok, true);
  assert.equal(s.world.roblox.tokenCalls.length - before, 1, 'still one refresh at Roblox');
  s.db.close();
});

test('COMPARE-AND-SWAP: if the row moves while Roblox is answering, the stale replacement is discarded and revoked', async () => {
  const s = await connected();
  s.world.roblox.duringRefresh = () => {
    // A sign-in lands in the middle of the refresh and replaces the stored token.
    s.db.raw.prepare("update roblox_oauth_tokens set version = version + 1, sealed_refresh = 'REPLACED-BY-SIGN-IN', lease_until = null where user_id = ?").run(s.userId);
  };
  const result = await R.refreshRobloxAccessToken(s.env, s.userId);
  assert.deepEqual(result, { ok: false, reason: 'busy' });
  assert.equal(s.row().sealed_refresh, 'REPLACED-BY-SIGN-IN', 'the newer write was not overwritten');
  assert.deepEqual(s.world.roblox.revokeCalls, [s.world.roblox.lastRefreshIssued], 'the token that belongs to no row is not left live at Roblox');
  s.db.close();
});

test('COMPARE-AND-SWAP binds the generation too: a disconnect and a new sign-in that land while Roblox is answering, and bring the row back to the SAME version, are not overwritten', async () => {
  const s = await connected();
  s.world.roblox.duringRefresh = () => {
    // The person disconnects and signs in again while the refresh is at Roblox: a new row, at the same version number, of another generation.
    s.db.raw.prepare('delete from roblox_oauth_tokens where user_id = ?').run(s.userId);
    s.db.raw.prepare("insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, generation, rotated_at, lease_until) values (?, 'NEW-SIGN-IN', ?, 'openid profile', 1, 'another-generation', ?, null)")
      .run(s.userId, SUB_A, new Date().toISOString());
  };
  const result = await R.refreshRobloxAccessToken(s.env, s.userId);
  assert.deepEqual(result, { ok: false, reason: 'busy' });
  assert.equal(s.row().sealed_refresh, 'NEW-SIGN-IN', 'the new sign-in’s token was not overwritten by a replacement derived from the old grant');
  assert.equal(s.row().generation, 'another-generation');
  assert.deepEqual(s.world.roblox.revokeCalls, [s.world.roblox.lastRefreshIssued], 'and the replacement that belongs to no row is not left live at Roblox');
  s.db.close();
});

test('the refresh lease is 30 seconds: the row says exactly when it lapses, and Roblox is called only while it is held', async () => {
  const s = await connected();
  const now = Date.now();
  const seen = [];
  s.world.roblox.duringRefresh = () => { seen.push(s.row().lease_until); };
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId, now)).ok, true);
  assert.deepEqual(seen, [now + 30_000], 'a lease claimed at t lapses at t + 30 s: long enough for Roblox to answer, short enough to heal a dead request');
  assert.equal(s.row().lease_until, null, 'and it is released when the refresh is done');
  s.db.close();
});

test('a lease left by a request that died expires, and a live lease is respected', async () => {
  const s = await connected();
  const now = Date.now();
  s.db.raw.prepare('update roblox_oauth_tokens set lease_until = ? where user_id = ?').run(now + 60_000, s.userId);
  const before = s.world.roblox.tokenCalls.length;
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId, now), { ok: false, reason: 'busy' });
  assert.equal(s.world.roblox.tokenCalls.length, before, 'a held lease means Roblox is not called');
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId, now + 120_000)).ok, true, 'two minutes on, the lease has lapsed');
  s.db.close();
});

test('a refresh Roblox refuses WITHOUT saying the grant is dead releases the lease and changes nothing else', async () => {
  // THIS TEST USED TO REFUSE WITH `invalid_grant` AND EXPECT THE ROW TO STAY. That is now the other half of the pair below: Roblox's
  // word that the grant is gone deletes the token. What must still leave the row alone is every refusal that says nothing about
  // the grant: our own credentials wrong (the grant may be alive), a request Roblox did not understand, a body nobody can read.
  const s = await connected();
  const before = { ...s.row() };
  for (const failure of [
    { status: 401, body: { error: 'invalid_client' } },
    { status: 400, body: { error: 'invalid_request' } },
    { status: 400, body: 'not an object' },
    { status: 403, body: {} },
  ]) {
    s.world.roblox.failToken = failure;
    assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused' }, JSON.stringify(failure));
    assert.deepEqual({ ...s.row() }, before, `${JSON.stringify(failure)} says nothing about the grant, so the stored token is left exactly as it was`);
  }
  s.world.roblox.failToken = { status: 503, body: {} };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'unavailable' });
  assert.deepEqual({ ...s.row() }, before);
  assert.equal((await R.refreshRobloxAccessToken(s.env, 'nobody')).reason, 'not_connected');
  s.db.close();
});

/** The one-way code the worker keeps on a Supabase account in place of the Roblox id: recomputed HERE with node:crypto, so the derivation is pinned (a different purpose label from the address). */
const CODE_OF = (sub, keyB64 = KEY_B64) => {
  const subkey = createHmac('sha256', Buffer.from(keyB64, 'base64')).update('studpilot:roblox-signin-code').digest();
  return createHmac('sha256', subkey).update(sub).digest('hex').slice(0, 32);
};
const identityRows = (s) => rowsOf(s.db, 'select * from roblox_identities where user_id = ?', s.userId);
const supaUser = (s) => s.world.sb.users.get(s.userId);
const profileName = (s) => s.world.sb.profiles.get(s.userId)?.display_name;

test('ACCESS LOST: when Roblox answers invalid_grant ALL the Roblox data goes at once (the token, the link, and the Roblox id and username on the Supabase account), and only the one-way code and the address stay', async () => {
  // Roblox Third-Party App Policy (planning/STUDPILOT-FINAL-PLAN.md section 7): wipe the Roblox data when access is lost. The person
  // removes StudPilot in their Roblox settings, or the token expires: Roblox then refuses the stored refresh token with invalid_grant.
  const s = await connected();
  const address = supaUser(s).email;
  assert.equal(supaUser(s).app_metadata.roblox_sub, SUB_A, 'POSITIVE CONTROL: the account carries the Roblox id and username before the loss');
  assert.equal(supaUser(s).user_metadata.display_name, 'Builder1');
  assert.equal(profileName(s), 'Builder1');
  const t0 = Date.now();
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId, t0)).ok, true, 'POSITIVE CONTROL: the grant works while Roblox honours it');
  s.world.roblox.removeApp(SUB_A);
  const calls = s.world.roblox.tokenCalls.length;
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 20 * 60_000), { ok: false, reason: 'refused', lost: 'wiped' });
  assert.equal(s.world.roblox.tokenCalls.length, calls + 1, 'Roblox was asked, and said the grant is gone');
  assert.equal(s.row(), undefined, 'the sealed refresh token is deleted, not left to be refused again');
  assert.equal(identityRows(s).length, 0, 'the Roblox user id and username next to the StudPilot account id are deleted too');
  assert.equal(supaUser(s).app_metadata.roblox_sub, undefined, 'the Roblox id is cleared from the Supabase account');
  assert.equal(supaUser(s).app_metadata.roblox_code, CODE_OF(SUB_A), 'and a one-way code made from it stays');
  assert.equal(supaUser(s).user_metadata.display_name, undefined, 'the Roblox username is cleared from the Supabase display name');
  assert.equal(profileName(s), null, 'and from the profile row\'s display name');
  assert.equal(supaUser(s).email, address, 'the placeholder address (itself a keyed one-way code) is what stays');
  assert.equal(isRobloxAccount(supaUser(s)), true, 'the app still recognises the wiped account as a Roblox-only one (no password to ask it for): it reads the one-way code the worker leaves');
  for (const [where, haystack] of [['the Supabase user', JSON.stringify(supaUser(s))], ['the profile', JSON.stringify(s.world.sb.profiles.get(s.userId))]]) {
    assert.equal(haystack.includes(SUB_A), false, `${where} still holds the Roblox id`);
    assert.equal(haystack.includes('Builder1'), false, `${where} still holds the Roblox username`);
  }
  assert.deepEqual(s.world.roblox.revokeCalls, [], 'a grant Roblox has already withdrawn is not revoked again');
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 20 * 60_000 + 1000), { ok: false, reason: 'not_connected' });
  assert.equal(s.world.roblox.tokenCalls.length, calls + 1, 'and nothing is sent to Roblox for an account that holds no token');
  assert.equal(s.world.sb.profilePatches.length, 1);
  assert.match(s.world.sb.profilePatches[0].search, new RegExp(`^\\?id=eq\\.${s.userId}&display_name=eq\\.Builder1$`), 'the profile update is for this person, and only while the name is still the Roblox username');
  s.db.close();
});

test('ACCESS LOST leaves a name the person chose: a display name that is no longer the Roblox username is theirs, in Auth and in the profile', async () => {
  const s = await connected();
  supaUser(s).user_metadata.display_name = 'My Own Name';
  s.world.sb.profiles.get(s.userId).display_name = 'My Own Name';
  s.world.roblox.removeApp(SUB_A);
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped');
  assert.equal(supaUser(s).user_metadata.display_name, 'My Own Name');
  assert.equal(profileName(s), 'My Own Name');
  assert.equal(supaUser(s).app_metadata.roblox_sub, undefined, 'the id still goes');
  assert.equal(JSON.stringify(s.world.sb.updateCalls.map((c) => c.body)).includes('user_metadata'), false, 'the display name was not even sent for clearing');
  s.db.close();
});

test('ACCESS LOST needs Roblox to say so with a 4xx: invalid_grant on a 429 or a 5xx is a busy Roblox, not a dead grant, and the stored token is left exactly as it was', async () => {
  // THE STATUS GUARD IN robloxSaysGrantGone HAD NO TEST OF ITS OWN: the 5xx case above sends an empty body and the 429 case a rate-limit
  // body, so a guard reduced to "any error body that says invalid_grant" passed. The page says a lost grant is found out from Roblox's
  // answer; a proxy error that happens to carry the word must not delete a working grant.
  const s = await connected();
  const before = { ...s.row() };
  for (const status of [429, 500, 502, 503]) {
    s.world.roblox.failToken = { status, body: { error: 'invalid_grant' } };
    assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'unavailable' }, `status ${status}`);
    assert.deepEqual({ ...s.row() }, before, `an invalid_grant body on a ${status} says nothing about the grant, so the stored token is left exactly as it was`);
    assert.equal(identityRows(s).length, 1, `nor is the link, on a ${status}`);
    assert.equal(supaUser(s).app_metadata.roblox_sub, SUB_A, `nor the Roblox id on the account, on a ${status}`);
  }
  assert.equal(s.world.sb.updateCalls.length, 0, 'Supabase was not touched for a Roblox that is merely busy');
  // POSITIVE CONTROL: the same body on a 400 is Roblox's word that the grant is gone.
  s.world.roblox.failToken = { status: 400, body: { error: 'invalid_grant' } };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused', lost: 'wiped' });
  assert.equal(s.row(), undefined, 'the same body on a 400 deletes the token');
  assert.equal(identityRows(s).length, 0, 'and the link');
  s.db.close();
});

test('ACCESS LOST deletes only the row that was refreshed: a sign-in that lands while Roblox is answering invalid_grant keeps its new token', async () => {
  // THE VERSION BINDING IN wipeDeadGrant WAS HELD ONLY BY A REGEX ON ITS SQL. Dropping `and version = ?` left every behavioural test green
  // (the generation case is the REFRESH LEASE RELEASE test above). Here the row moves to the NEXT VERSION of the SAME generation while
  // the refresh is at Roblox, which is what a rotation by another request looks like, and the dead grant's verdict must not reach it.
  const s = await connected();
  s.world.roblox.refresh.get(s.world.roblox.lastRefreshIssued).state = 'used';           // Roblox will say invalid_grant (the 400 path)
  s.world.roblox.duringRefresh = () => {
    s.db.raw.prepare("update roblox_oauth_tokens set version = version + 1, sealed_refresh = 'NEXT-VERSION', lease_until = null where user_id = ?").run(s.userId);
  };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused' });
  assert.equal(s.row()?.sealed_refresh, 'NEXT-VERSION', 'a verdict about version 1 did not delete version 2');
  assert.equal(s.row().version, 2);
  assert.equal(identityRows(s).length, 1, 'nor did it delete the link of the grant that replaced it');
  assert.equal(supaUser(s).app_metadata.roblox_sub, SUB_A, 'nor did it clear the Roblox id from the account of a grant that is alive');
  assert.equal(s.world.sb.updateCalls.length, 0);
  s.db.close();
});

/* ------------------------------------------------------------------------------ a wipe that cannot finish --- */

for (const [name, arm, disarm] of [
  ['Supabase refuses the account update (500)', (s) => { s.world.sb.failUpdate = 500; }, (s) => { s.world.sb.failUpdate = null; }],
  ['Supabase refuses the profile update (500)', (s) => { s.world.sb.failProfile = 500; }, (s) => { s.world.sb.failProfile = null; }],
  ['Supabase cannot be reached', (s) => { const real = globalThis.fetch; s.restoreFetch = real; globalThis.fetch = async (u, i) => { if (String(u).startsWith(SB)) throw new TypeError('network down'); return real(u, i); }; }, (s) => { globalThis.fetch = s.restoreFetch; }],
]) {
  test(`A WIPE THAT CANNOT FINISH (${name}) deletes NOTHING, says the grant is lost but kept, releases the lease, and the next detection finishes it`, async () => {
    const s = await connected();
    const before = JSON.stringify(supaUser(s));
    s.world.roblox.removeApp(SUB_A);
    arm(s);
    const first = await R.refreshRobloxAccessToken(s.env, s.userId);
    assert.deepEqual(first, { ok: false, reason: 'refused', lost: 'kept' });
    assert.ok(s.row(), 'the token row stays: it is the marker the next detection retries from');
    assert.equal(s.row().lease_until, null, 'the lease is released so the retry is not locked out for thirty seconds');
    assert.equal(identityRows(s).length, 1, 'the link stays until Supabase is clean');
    disarm(s);
    // RETRY: Roblox says invalid_grant again (the refresh token is still dead), and this time everything goes.
    assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused', lost: 'wiped' });
    assert.equal(s.row(), undefined);
    assert.equal(identityRows(s).length, 0);
    assert.equal(supaUser(s).app_metadata.roblox_sub, undefined);
    assert.equal(profileName(s), null);
    assert.notEqual(JSON.stringify(supaUser(s)), before);
    s.db.close();
  });
}

test('ACCESS LOST on an account Supabase no longer has (an operator deleted it) wipes the rest and makes no Supabase write', async () => {
  const s = await connected();
  s.world.sb.users.delete(s.userId);
  s.world.roblox.removeApp(SUB_A);
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused', lost: 'wiped' });
  assert.equal(s.row(), undefined);
  assert.equal(identityRows(s).length, 0);
  assert.equal(s.world.sb.updateCalls.length, 0);
  s.db.close();
});

test('A SIGN-IN THAT LANDS BETWEEN THE ACCOUNT UPDATE AND THE DATABASE BATCH keeps its new grant AND its link: the batch deletes the token it read and the link only while no token is left', async () => {
  const s = await connected();
  s.world.roblox.removeApp(SUB_A);
  s.world.sb.onUpdate = () => {
    // The person signs in again while the worker is clearing their Supabase record: the row becomes another grant (another version and generation) with its own link.
    s.db.raw.prepare("update roblox_oauth_tokens set sealed_refresh = 'NEW-GRANT', version = 5, generation = 'another-generation' where user_id = ?").run(s.userId);
  };
  const out = await R.refreshRobloxAccessToken(s.env, s.userId);
  assert.equal(out.ok, false);
  assert.equal(out.lost, undefined, 'the dead grant\'s verdict did not become this grant\'s');
  assert.equal(s.row()?.sealed_refresh, 'NEW-GRANT', 'the new grant\'s token was not deleted');
  assert.equal(identityRows(s).length, 1, 'nor was its link');
  s.db.close();
});

test('A CACHED ACCESS TOKEN FROM THE DEAD GRANT DOES NOT STAND IN FOR ROBLOX\'S ANSWER: the check drops it, so the confirming refresh really asks Roblox', async () => {
  const s = await connected();
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).ok, true, 'a refresh in this isolate caches a 15-minute access token');
  s.world.roblox.removeApp(SUB_A);
  assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, lost: 1 }), 'served from the cache, the refresh would have "worked" and the loss would have been reported as a disagreement');
  assert.equal(s.row(), undefined);
  s.db.close();
});

/* ------------------------------------------------------------------ the account is still found afterwards --- */

test('AFTER A WIPE, signing in with Roblox again finds the SAME account through its address and the one-way code: the same Supabase user, no second account, no ghost', async () => {
  const s = await connected();
  const address = supaUser(s).email;
  s.world.roblox.removeApp(SUB_A);
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped');
  assert.equal(identityRows(s).length, 0, 'POSITIVE CONTROL: the link is gone, so the account can only be found by its address');
  const users = s.world.sb.users.size;
  const back = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1 (renamed)' });
  assert.equal(back.res.status, 302, 'the sign-in goes through');
  assert.equal(s.world.sb.users.size, users, 'no second account was made');
  assert.equal(s.world.sb.ghosts, 0, 'and no empty stranger was signed in');
  assert.equal(userIdOf(s.db, SUB_A), s.userId, 'the Roblox account is linked to the SAME Supabase user again');
  assert.equal(supaUser(s).email, address);
  assert.equal(identityRows(s)[0].username, 'Builder1 (renamed)', 'the link holds what Roblox says now');
  assert.equal(s.row().version, 1, 'a fresh grant');
  // The sign-in token minted is for that user, and nobody else.
  const hash = await tokenHashOf(s.env, back.res);
  assert.equal(s.world.sb.links.get(hash), s.userId);
  assert.equal(supaUser(s).app_metadata.roblox_code, CODE_OF(SUB_A), 'the code is still what finds the account');
  s.db.close();
});

test('THE ONE-WAY CODE IS THE PROOF, and nothing else is: a user at that address with a code for ANOTHER Roblox account, or with no code and no id, is never adopted', async () => {
  for (const [what, meta] of [['another account\'s code', { roblox_code: CODE_OF('999') }], ['no code and no id', {}], ['a code that is not a string', { roblox_code: 12345 }]]) {
    const s = await connected();
    s.world.roblox.removeApp(SUB_A);
    assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped');
    supaUser(s).app_metadata = { ...meta };
    const attempt = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
    assert.equal(isPending(s.env, attempt.res), true);
    const created = await createRequest(s.env, { cookie: handleCookieOf(attempt.res), ip: attempt.flow.ip });
    assert.equal(created.status, 409, `${what}: an address nobody can vouch for fails closed`);
    assert.equal((await created.json()).reference, 'roblox_address_taken');
    assert.equal(identityRows(s).length, 0, `${what}: nothing was linked`);
    assert.equal(s.world.sb.ghosts, 0);
    s.db.close();
  }
});

/* --------------------------------------------------------------------------- the daily check (introspection) --- */

const checkGrants = (s, now) => R.checkRobloxGrants(s.env, now);
const COUNTS = (o = {}) => ({ checked: 0, active: 0, lost: 0, kept: 0, unknown: 0, unusable: 0, disagreed: 0, unreadable: 0, unchecked: 0, ...o });

test('THE DAILY CHECK asks Roblox about each stored token with the client credentials, leaves a grant Roblox says is active exactly as it was, and spends nothing: a healthy grant is never refreshed', async () => {
  const s = await connected();
  const bob = await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  assert.equal(bob.res.status, 302);
  const rowsBefore = rowsOf(s.db, 'select * from roblox_oauth_tokens order by user_id');
  const tokenCalls = s.world.roblox.tokenCalls.length;
  const report = await checkGrants(s);
  assert.deepEqual(report, COUNTS({ checked: 2, active: 2 }));
  assert.equal(s.world.roblox.introspectCalls.length, 2);
  // THE CALL: the token, and the client's own credentials, as the token endpoint takes them.
  const sent = s.world.roblox.introspectCalls[0];
  assert.deepEqual(Object.keys(sent).sort(), ['client_id', 'client_secret', 'token']);
  assert.equal(sent.client_id, CLIENT_ID);
  assert.equal(sent.client_secret, CLIENT_SECRET);
  assert.ok(s.world.roblox.refresh.has(sent.token), 'it asked about the stored REFRESH token');
  assert.deepEqual(rowsOf(s.db, 'select * from roblox_oauth_tokens order by user_id'), rowsBefore, 'nothing about a healthy grant changed, not even its version');
  assert.equal(s.world.roblox.tokenCalls.length, tokenCalls, 'no refresh was made for a healthy grant: the check must not extend a grant\'s life');
  assert.equal(s.world.sb.updateCalls.length, 0);
  s.db.close();
});

test('THE DAILY CHECK FINDS A LOST GRANT: Roblox reports it inactive, a refresh confirms invalid_grant, and everything of that person\'s Roblox data is wiped, and nobody else\'s', async () => {
  const s = await connected();
  const bobFlow = await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  const bobId = userIdOf(s.db, SUB_B);
  assert.equal(bobFlow.res.status, 302);
  s.world.roblox.removeApp(SUB_A);                // Alice removes StudPilot in her Roblox settings
  const report = await checkGrants(s);
  assert.deepEqual(report, COUNTS({ checked: 2, active: 1, lost: 1 }));
  assert.equal(s.row(), undefined, 'Alice\'s token is gone');
  assert.equal(identityRows(s).length, 0, 'and her link');
  assert.equal(supaUser(s).app_metadata.roblox_sub, undefined);
  assert.equal(supaUser(s).app_metadata.roblox_code, CODE_OF(SUB_A));
  assert.equal(profileName(s), null);
  // Bob is untouched.
  assert.equal(rowsOf(s.db, 'select * from roblox_oauth_tokens where user_id = ?', bobId).length, 1);
  assert.equal(rowsOf(s.db, 'select * from roblox_identities where user_id = ?', bobId).length, 1);
  assert.equal(s.world.sb.users.get(bobId).app_metadata.roblox_sub, SUB_B);
  assert.equal(s.world.sb.profiles.get(bobId).display_name, 'Bob');
  // The confirming refresh was made for Alice's token only.
  assert.equal(s.world.roblox.tokenCalls.filter((c) => c.grant_type === 'refresh_token').length, 1);
  // A second check finds nothing more to do and asks Roblox about Bob only.
  s.world.roblox.introspectCalls.length = 0;
  assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, active: 1 }));
  assert.equal(s.world.roblox.introspectCalls.length, 1);
  s.db.close();
});

test('INTROSPECTION THAT IS MISREAD CANNOT WIPE ANYONE: Roblox says "inactive" for a grant that still refreshes, so it is reported as disagreed, the replacement token is stored, and nothing is deleted', async () => {
  const s = await connected();
  s.world.roblox.introspect = 'misread';          // an endpoint that only understands access tokens would say this about every refresh token
  const report = await checkGrants(s);
  assert.deepEqual(report, COUNTS({ checked: 1, disagreed: 1 }));
  assert.equal(identityRows(s).length, 1, 'the link stays');
  assert.equal(supaUser(s).app_metadata.roblox_sub, SUB_A, 'the account keeps its Roblox id');
  assert.equal(profileName(s), 'Builder1');
  assert.equal(s.row().version, 2, 'the refresh that proved it stored the replacement token (the old one was spent)');
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, s.row().sealed_refresh), s.world.roblox.lastRefreshIssued);
  assert.equal(s.world.sb.updateCalls.length, 0);
  // And it can go on being checked: the stored token still works.
  s.world.roblox.introspect = 'normal';
  assert.equal((await checkGrants(s)).active, 1);
  s.db.close();
});

// `unusable`: Roblox ANSWERED and the answer cannot be acted on (a 4xx other than 429, a body that is not a plain boolean): the check itself is wrong. Not unusable: an outage (a 5xx, a 429).
for (const [name, mode, unusable] of [
  ['a 500', { status: 500, body: {} }, 0],
  ['a 401 invalid_client (the client secret was rotated and the Worker still holds the old one)', { status: 401, body: { error: 'invalid_client' } }, 1],
  ['a 400', { status: 400, body: { error: 'invalid_request' } }, 1],
  ['a 429', { status: 429, body: { error: 'rate_limit_exceeded' } }, 0],
  ['a page that is not JSON', 'junk', 1],
  ['a 200 with no "active" boolean', { status: 200, body: { sub: '1' } }, 1],
  ['a 200 whose "active" is a string', { status: 200, body: { active: 'false' } }, 1],
  ['a 200 whose "active" is null', { status: 200, body: { active: null } }, 1],
]) {
  test(`INTROSPECTION THAT SAYS NOTHING (${name}) wipes nothing, refreshes nothing, and is counted as unknown${unusable ? ' AND unusable (an answer that cannot be acted on)' : ' but not unusable (an outage passes)'}`, async () => {
    const s = await connected();
    s.world.roblox.introspect = mode;
    const tokenCalls = s.world.roblox.tokenCalls.length;
    assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, unknown: 1, unusable }));
    assert.equal(s.world.roblox.tokenCalls.length, tokenCalls);
    assert.equal(identityRows(s).length, 1);
    assert.ok(s.row());
    assert.equal(s.world.sb.updateCalls.length, 0);
    s.db.close();
  });
}

test('A NETWORK FAILURE during the check wipes nothing: no answer is not an answer', async () => {
  const s = await connected();
  const real = globalThis.fetch;
  globalThis.fetch = async (u, i) => { if (String(u).includes('/token/introspect')) throw new TypeError('network down'); return real(u, i); };
  try {
    assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, unknown: 1 }));
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(identityRows(s).length, 1);
  s.db.close();
});

test('INACTIVE, THEN THE CONFIRMATION IS NOT CONCLUSIVE (Roblox is down, or a lease is held): nothing is wiped, and the next check asks again', async () => {
  const s = await connected();
  s.world.roblox.removeApp(SUB_A);
  s.world.roblox.failToken = { status: 503, body: {} };
  assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, unknown: 1 }));
  assert.ok(s.row());
  assert.equal(identityRows(s).length, 1);
  s.world.roblox.failToken = null;
  s.db.raw.prepare('update roblox_oauth_tokens set lease_until = ? where user_id = ?').run(Date.now() + 25_000, s.userId);   // another request holds the refresh lease
  assert.equal((await checkGrants(s)).unknown, 1, 'a busy refresh is not a verdict');
  s.db.raw.prepare('update roblox_oauth_tokens set lease_until = null where user_id = ?').run(s.userId);
  assert.equal((await checkGrants(s)).lost, 1, 'and once Roblox answers, the grant is found lost and wiped');
  assert.equal(s.row(), undefined);
  s.db.close();
});

test('A LOST GRANT WHOSE WIPE CANNOT FINISH is counted as lost AND kept, deletes nothing, and the next check finishes it', async () => {
  const s = await connected();
  s.world.roblox.removeApp(SUB_A);
  s.world.sb.failUpdate = 500;
  assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, lost: 1, kept: 1 }));
  assert.ok(s.row());
  assert.equal(identityRows(s).length, 1);
  s.world.sb.failUpdate = null;
  assert.deepEqual(await checkGrants(s), COUNTS({ checked: 1, lost: 1 }));
  assert.equal(s.row(), undefined);
  assert.equal(identityRows(s).length, 0);
  s.db.close();
});

test('A TOKEN THAT CANNOT BE OPENED (CREDENTIAL_KEY changed) is counted as unreadable and Roblox is not asked about it', async () => {
  const s = await connected();
  const wrongKey = { ...s.env, CREDENTIAL_KEY: Buffer.alloc(32, 9).toString('base64') };
  const report = await R.checkRobloxGrants(wrongKey);
  assert.deepEqual(report, COUNTS({ checked: 1, unreadable: 1 }));
  assert.equal(s.world.roblox.introspectCalls.length, 0);
  assert.equal(identityRows(s).length, 1);
  s.db.close();
});

test('NOT CONFIGURED: with any Roblox secret missing the check says so, asks nobody, and touches nothing', async () => {
  for (const missing of ['ROBLOX_OAUTH_CLIENT_ID', 'ROBLOX_OAUTH_CLIENT_SECRET', 'SUPABASE_SECRET_KEY', 'CREDENTIAL_KEY']) {
    const s = await connected();
    const report = await R.checkRobloxGrants({ ...s.env, [missing]: undefined });
    assert.match(report.skipped, /not configured/, missing);
    assert.equal(report.checked, 0);
    assert.equal(s.world.roblox.introspectCalls.length, 0);
    assert.equal(R.describeGrantCheck(report).startsWith('skipped: '), true);
    s.db.close();
  }
});

test('THE CHECK IS BOUNDED: more grants than one run looks at leaves the rest unchecked and says how many, and reading nothing at all is "skipped", not "nothing lost"', async () => {
  const s = await connected();
  const insert = s.db.raw.prepare("insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, generation, rotated_at, lease_until) values (?, 'not-a-sealed-token', ?, 'openid profile', 1, 'g', 'now', null)");
  for (let i = 0; i < 2000; i += 1) insert.run(`filler-${String(i).padStart(5, '0')}`, String(900000 + i));
  const report = await checkGrants(s);
  assert.equal(report.checked, 2000, 'a run looks at no more than its cap');
  assert.equal(report.unchecked, 1, 'and says one was left');
  s.db.close();
  const broken = scene();
  await R.ensureRobloxOAuthTables(broken.env);
  broken.db.raw.exec('drop table roblox_oauth_tokens');                           // the read fails
  const skipped = await R.checkRobloxGrants(broken.env);
  assert.match(skipped.skipped ?? '', /could not be read/);
  broken.db.close();
});

test('THE CHECK NEVER LOGS A TOKEN, A CLIENT SECRET, AN ID OR A NAME: every console line it and the wipe write is a fixed word', async () => {
  const s = await connected();
  LOGS.length = 0;
  s.world.roblox.removeApp(SUB_A);
  const refresh = s.world.roblox.lastRefreshIssued;
  await checkGrants(s);
  for (const line of LOGS) {
    for (const secret of [refresh, CLIENT_SECRET, SB_SECRET, KEY_B64, SUB_A, 'Builder1', s.userId]) assert.equal(line.includes(secret), false, `a log line carries a secret or a person: ${line}`);
  }
  assert.ok(LOGS.some((l) => /grant gone, roblox data wiped/.test(l)), 'the wipe left no fixed-word trace');
  s.db.close();
});

/* ------------------------------------------------------------------------------------- through the cron --- */

function adminRecorder() {
  const events = [];
  return { events, ns: { idFromName: (n) => n, get: () => ({ async fetch(url, init) { if (new URL(url).pathname === '/events') events.push(...(JSON.parse(init.body).events ?? [])); return new Response(JSON.stringify({ stored: 1 })); } }) } };
}

test('THE DAILY CRON runs the check, wipes a lost grant, and records the counts as an audit event (and an error event for anything a person has to look at)', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  s.world.roblox.removeApp(SUB_A);
  await app.scheduled({ scheduledTime: Date.now(), cron: '0 3 * * *' }, s.env, ctx);
  assert.equal(s.row(), undefined, 'the cron wiped the lost grant');
  const audit = admin.events.find((e) => e.kind === 'audit' && e.action === 'roblox_grant_check');
  assert.ok(audit, `no roblox_grant_check event: ${admin.events.map((e) => e.action ?? e.kind).join(', ')}`);
  assert.equal(audit.allowed, true);
  assert.equal(audit.actorKind, 'system');
  assert.equal(audit.subject, 'checked=2 active=1 lost=1 kept_for_retry=0 unknown=0 unusable=0 disagreed=0 unreadable=0 unchecked=0');
  assert.equal(admin.events.some((e) => e.kind === 'error' && /roblox-grants/.test(e.scope ?? '')), false);
  for (const e of admin.events) for (const secret of [CLIENT_SECRET, SB_SECRET, SUB_A, 'Builder1', s.userId]) assert.equal(JSON.stringify(e).includes(secret), false, 'the event log carries a secret or a person');
  s.db.close();
});

test('THE DAILY CRON reports a kept wipe and a misread introspection as errors, and a deployment with no Roblox sign-in as skipped', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  s.world.roblox.removeApp(SUB_A);
  s.world.sb.failUpdate = 500;
  await app.scheduled({ scheduledTime: Date.now(), cron: '0 3 * * *' }, s.env, ctx);
  const kept = admin.events.find((e) => e.kind === 'error' && e.scope === 'roblox-grants:wipe');
  assert.ok(kept, 'a grant that could not be wiped left no error');
  assert.equal(admin.events.find((e) => e.action === 'roblox_grant_check').allowed, false);
  s.db.close();

  const admin2 = adminRecorder();
  const m = await connected({ ADMIN_DO: admin2.ns });
  m.world.roblox.introspect = 'misread';
  await app.scheduled({ scheduledTime: Date.now(), cron: '0 3 * * *' }, m.env, ctx);
  assert.ok(admin2.events.find((e) => e.kind === 'error' && e.scope === 'roblox-grants:introspection'), 'a misread introspection left no error');
  m.db.close();

  const admin3 = adminRecorder();
  const n = scene({ ADMIN_DO: admin3.ns, ROBLOX_OAUTH_CLIENT_SECRET: undefined });
  await app.scheduled({ scheduledTime: Date.now(), cron: '0 3 * * *' }, n.env, ctx);
  const skipped = admin3.events.find((e) => e.action === 'roblox_grant_check');
  assert.match(skipped.subject, /^skipped: Roblox sign-in is not configured/);
  assert.equal(skipped.allowed, false, 'a night that checked nothing does not read as a good one');
  assert.equal(n.world.roblox.introspectCalls.length, 0);
  n.db.close();
});

test('a Roblox 429 is "unavailable" (try later), not "refused": the grant is not dead, the caller is only too fast', async () => {
  const s = await connected();
  s.world.roblox.failToken = { status: 429, body: { error: 'rate_limit_exceeded' } };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'unavailable' });
  assert.equal(s.row().lease_until, null, 'and the lease is released');
  assert.equal(s.row().version, 1);
  s.world.roblox.failToken = null;
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).ok, true, 'so the same grant refreshes once Roblox lets it');
  s.db.close();
});

test('ACCESS TOKEN CACHE: inside its 15 minutes a second request is served without calling Roblox; it lapses; a sign-in or a disconnect voids it', async () => {
  const s = await connected();
  const t0 = Date.now();
  const first = await R.refreshRobloxAccessToken(s.env, s.userId, t0);
  assert.equal(first.ok, true);
  const calls = s.world.roblox.tokenCalls.length;

  const soon = await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 5 * 60_000);
  assert.deepEqual(soon, first, 'the same token and version');
  assert.equal(s.world.roblox.tokenCalls.length, calls, 'Roblox was not called, so no rotation was spent');
  assert.equal(s.row().version, 2);

  const late = await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 15 * 60_000);
  assert.equal(late.ok, true);
  assert.notEqual(late.accessToken, first.accessToken, 'a lapsed token is not handed out');
  assert.equal(s.world.roblox.tokenCalls.length, calls + 1);

  // A new sign-in bumps the version: the cached token was issued under the old row and must not be served.
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const callsAfterSignIn = s.world.roblox.tokenCalls.length;
  const afterSignIn = await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 15 * 60_000 + 1000);
  assert.equal(afterSignIn.ok, true);
  assert.notEqual(afterSignIn.accessToken, late.accessToken);
  assert.equal(s.world.roblox.tokenCalls.length, callsAfterSignIn + 1, 'a sign-in voids the cache');

  // A disconnect removes the row, and nothing is served from memory for an account that is not connected.
  assert.equal((await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env)).status, 200);
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 15 * 60_000 + 2000), { ok: false, reason: 'not_connected' });
  s.db.close();
});

test('ACCESS TOKEN CACHE across a disconnect and a re-sign-in: a token issued under the revoked grant is not served, even when the new row has climbed back to the SAME version', async () => {
  const s = await connected();
  const t0 = Date.now();
  const old = await R.refreshRobloxAccessToken(s.env, s.userId, t0);
  assert.equal(old.ok, true);
  assert.equal(old.version, 2, 'the cached token was issued under version 2 of the first grant');
  assert.equal((await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env)).status, 200, 'the grant is revoked and the row is gone');
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });     // a new row, version 1, a new generation
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });     // and again: version 2, the number the cached token carries
  assert.equal(s.row().version, 2, 'the row is back at the version the cached token was issued under');
  const calls = s.world.roblox.tokenCalls.length;
  const next = await R.refreshRobloxAccessToken(s.env, s.userId, t0 + 1000);
  assert.equal(next.ok, true);
  assert.notEqual(next.accessToken, old.accessToken, 'a token from the revoked grant was handed out');
  assert.equal(s.world.roblox.tokenCalls.length, calls + 1, 'Roblox was asked, because nothing in memory belongs to this grant');
  s.db.close();
});

/* ------------------------------------------------------------------------ disconnect --- */

const as = (userId, email) => ({ headers: { Authorization: `Bearer ${email ? `${userId}|${email}` : userId}` } });
const postAs = (userId, email) => ({ method: 'POST', ...as(userId, email) });

test('DISCONNECT needs a signed-in caller', async () => {
  const s = await connected();
  assert.equal((await hit(`${PROD}/api/me/roblox/disconnect`, { method: 'POST' }, s.env)).status, 401);
  assert.equal((await hit(`${PROD}/api/me/roblox/connection`, {}, s.env)).status, 401);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1);
  s.db.close();
});

test('DISCONNECT revokes the grant at Roblox with the stored token, then deletes the token and the link, and is idempotent', async () => {
  const s = await connected();
  const refresh = s.world.roblox.lastRefreshIssued;
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { revoked: true, tokenRemoved: true, linkRemoved: true, signInKept: false });
  assert.deepEqual(s.world.roblox.revokeCalls, [refresh]);
  assert.equal(s.world.roblox.refresh.get(refresh).state, 'revoked');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 0);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 0);

  const again = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { revoked: null, tokenRemoved: false, linkRemoved: false, signInKept: false });
  assert.equal(s.world.roblox.revokeCalls.length, 1, 'the second call has nothing to revoke');
  s.db.close();
});

test('DISCONNECT with no token left to withdraw (Roblox already reported the access lost) removes the link, asks Roblox nothing, and says there was nothing to revoke', async () => {
  // The pages say Disconnect asks Roblox to withdraw the access "if StudPilot holds a token", and that the link goes either way.
  const s = await connected();
  s.db.raw.prepare('delete from roblox_oauth_tokens where user_id = ?').run(s.userId);          // what the invalid_grant wipe leaves behind
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { revoked: null, tokenRemoved: false, linkRemoved: true, signInKept: false });
  assert.deepEqual(s.world.roblox.revokeCalls, [], 'there was no token to send');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 0);
  s.db.close();
});

test('DISCONNECT with Roblox unreachable changes nothing, because the sealed token is the only handle to revoke it with', async () => {
  const s = await connected();
  s.world.roblox.failRevoke = 503;
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(res.status, 502);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 1);
  // And when Roblox says, in its documented words, that the token is already dead, that is a revoked grant.
  s.world.roblox.failRevoke = { status: 400, body: { error: 'invalid_token' } };
  const dead = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(dead.status, 200);
  assert.equal((await dead.json()).revoked, true);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 0);
  s.db.close();
});

test('a 400 from the revoke endpoint is "already revoked" ONLY for invalid_token: every other answer is a failure that changes nothing', async () => {
  for (const failure of [
    { status: 400, body: { error: 'invalid_request' } },
    { status: 400, body: { error: 'invalid_client' } },
    { status: 400, body: { error: 'unsupported_token_type' } },
    { status: 400, body: {} },
    { status: 400, body: null },
    { status: 401, body: { error: 'invalid_client' } },
    { status: 403, body: { error: 'invalid_token' } },       // the word is only believed on a 400
    { status: 429, body: { error: 'rate_limited' } },
  ]) {
    const s = await connected();
    s.world.roblox.failRevoke = failure;
    const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
    assert.equal(res.status, 502, `${failure.status} ${JSON.stringify(failure.body)} must not count as revoked`);
    const refusal = await res.json();
    assert.equal(typeof refusal.error, 'string');
    assert.equal(refusal.code, 'revoke_failed');
    assert.equal('revoked' in refusal, false, 'a refusal carries no success field, not even a false one');
    assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1, `${failure.status}: the only handle must survive`);
    assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 1);
    s.db.close();
  }
});

test('DISCONNECT when Roblox cannot even be ASKED (a secret is missing) answers an error, claims nothing, and deletes NOTHING', async () => {
  const s = await connected();
  const refresh = s.world.roblox.lastRefreshIssued;
  s.world.roblox.revokeCalls.length = 0;
  delete s.env.ROBLOX_OAUTH_CLIENT_SECRET;
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.code, 'unavailable');
  assert.match(body.error, /nothing was changed/i);
  assert.equal('revoked' in body, false, 'a refusal does not carry a success field');
  assert.equal(body.tokenRemoved, undefined);
  assert.deepEqual(s.world.roblox.revokeCalls, [], 'Roblox was not called');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1, 'the sealed token is the only handle, so it stays');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 1);
  // Put the secret back and the very same disconnect now works: nothing was lost.
  s.env.ROBLOX_OAUTH_CLIENT_SECRET = CLIENT_SECRET;
  const again = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(again.status, 200);
  assert.deepEqual(s.world.roblox.revokeCalls, [refresh]);
  s.db.close();
});

test('DISCONNECT when the sealed token cannot be OPENED answers an error with its own code and deletes NOTHING', async () => {
  const s = await connected();
  s.world.roblox.revokeCalls.length = 0;
  const realKey = s.env.CREDENTIAL_KEY;
  s.env.CREDENTIAL_KEY = Buffer.alloc(32, 8).toString('base64');       // a rotated key: the row can no longer be read
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.code, 'token_unreadable');
  assert.equal(typeof body.error, 'string');
  assert.equal('revoked' in body, false);
  assert.deepEqual(s.world.roblox.revokeCalls, []);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 1);
  s.env.CREDENTIAL_KEY = realKey;
  assert.equal((await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env)).status, 200);
  s.db.close();
});

test('DISCONNECT keeps the sign-in link while Roblox is the account’s only way in, so the account is not stranded', async () => {
  const s = await connected();
  const refresh = s.world.roblox.lastRefreshIssued;
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, SYNTHETIC(SUB_A)), s.env);
  assert.deepEqual(await res.json(), { revoked: true, tokenRemoved: true, linkRemoved: false, signInKept: true });
  assert.deepEqual(s.world.roblox.revokeCalls, [refresh], 'StudPilot loses its access to Roblox either way');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 0);
  assert.equal(userIdOf(s.db, SUB_A), s.userId, 'the next Roblox sign-in finds this account, not a new empty one');
  s.db.close();
});

test('the connection card is told who is linked, and whether Roblox is the only way in', async () => {
  const s = await connected();
  const body = await (await hit(`${PROD}/api/me/roblox/connection`, as(s.userId, SYNTHETIC(SUB_A)), s.env)).json();
  assert.deepEqual({ ...body, linkedAt: typeof body.linkedAt }, { configured: true, connected: true, username: 'Builder1', linkedAt: 'string', signInOnly: true, reauthFresh: false });
  const none = await (await hit(`${PROD}/api/me/roblox/connection`, as('someone-else', 'x@example.com'), s.env)).json();
  assert.deepEqual(none, { configured: true, connected: false, username: null, linkedAt: null, signInOnly: false, reauthFresh: false });
  s.db.close();
});

/* ------------------------------------------------------------- export and erasure --- */

test('the account export includes the Roblox tables, with no token in it, and nobody else’s rows', async () => {
  ROWS.clear();
  const s = scene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const alice = userIdOf(s.db, SUB_A);
  const sealed = rowsOf(s.db, 'select sealed_refresh from roblox_oauth_tokens')[0].sealed_refresh;
  const refresh = s.world.roblox.lastRefreshIssued;
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });

  const text = await (await hit(`${PROD}/api/me/export`, as(alice), s.env)).text();
  const doc = JSON.parse(text);
  for (const t of ['roblox_identities', 'roblox_oauth_tokens']) {
    assert.equal(doc.tables[t]?.status, 'ok', `${t}: ${doc.tables[t]?.reason ?? 'missing from the export'}`);
    assert.equal(doc.tables[t].rows.length, 1);
    assert.ok(!doc.incomplete.includes(t));
  }
  // A person whose grant was never lost has nothing in the table a wipe fills, and it is not marked incomplete.
  assert.equal(doc.tables.roblox_wiped?.status, 'ok', 'the wiped-code table is in the export');
  assert.equal(doc.tables.roblox_wiped.rows.length, 0);
  assert.deepEqual(doc.tables.roblox_identities.rows[0], { roblox_sub: SUB_A, user_id: alice, username: 'Builder1', created_at: doc.tables.roblox_identities.rows[0].created_at, created_username: 'Builder1' });
  assert.deepEqual(Object.keys(doc.tables.roblox_oauth_tokens.rows[0]).sort(), ['rotated_at', 'scopes', 'sub', 'user_id', 'version']);
  assert.equal(text.includes(sealed), false, 'the sealed token is not in the file');
  assert.equal(text.includes(refresh), false);
  assert.equal(text.includes('sealed_refresh'), true, 'the file names the column it withheld, with the reason');
  assert.equal(text.includes(SUB_B), false, 'somebody else’s Roblox account is not in this person’s export');
  s.db.close();
});

test('the export of someone who never signed in with Roblox is not marked incomplete by these tables', async () => {
  ROWS.clear();
  const s = scene();
  const doc = await (await hit(`${PROD}/api/me/export`, as('a-person-with-an-email-account'), s.env)).json();
  for (const t of ['roblox_identities', 'roblox_oauth_tokens']) {
    assert.equal(doc.tables[t].status, 'ok', `${t} must read as empty, not as a failure: ${doc.tables[t].reason ?? ''}`);
    assert.equal(doc.tables[t].count, 0);
  }
  s.db.close();
});

test('account erasure revokes the grant, deletes both tables for that person only, and the receipt says so', async () => {
  ROWS.clear();
  const s = scene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const alice = userIdOf(s.db, SUB_A);
  const refresh = s.world.roblox.lastRefreshIssued;
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });

  const res = await hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...as(alice).headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
  const receipt = await res.json();
  const step = (target) => receipt.steps.find((x) => x.target === target);
  assert.deepEqual({ ...step('roblox_oauth_tokens'), detail: undefined }, { store: 'd1', target: 'roblox_oauth_tokens', status: 'erased', rows: 1, detail: undefined });
  assert.match(step('roblox_oauth_tokens').detail, /revoked at Roblox/);
  assert.deepEqual(step('roblox_identities'), { store: 'd1', target: 'roblox_identities', status: 'erased', rows: 1 });
  assert.deepEqual(s.world.roblox.revokeCalls, [refresh]);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens where user_id = ?', alice), 0);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities where user_id = ?', alice), 0);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1, 'Bob’s token is untouched');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 1, 'Bob’s link is untouched');
  assert.equal(receipt.steps.filter((x) => x.status === 'failed').length, 0);
  s.db.close();
});

test('account erasure still deletes the rows when Roblox cannot be asked, and the receipt says it could not', async () => {
  ROWS.clear();
  const s = scene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const alice = userIdOf(s.db, SUB_A);
  s.world.roblox.failRevoke = 503;
  const res = await hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...as(alice).headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
  const receipt = await res.json();
  const tokens = receipt.steps.find((x) => x.target === 'roblox_oauth_tokens');
  assert.equal(tokens.status, 'erased');
  assert.match(tokens.detail, /could not be asked to revoke/);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 0);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 0);
  s.db.close();
});

test('account erasure does not call a 400 that is not invalid_token a revocation: the receipt says Roblox could not be asked', async () => {
  ROWS.clear();
  const s = scene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const alice = userIdOf(s.db, SUB_A);
  s.world.roblox.failRevoke = { status: 400, body: { error: 'invalid_request' } };
  const res = await hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...as(alice).headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
  const tokens = (await res.json()).steps.find((x) => x.target === 'roblox_oauth_tokens');
  assert.equal(tokens.status, 'erased');
  assert.match(tokens.detail, /could not be asked to revoke/, 'a 400 that is not invalid_token is not "revoked"');
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 0, 'the erasure still removes our copy');
  s.db.close();
});

test('A ROBLOX-ONLY ACCOUNT can export its data and delete it once it has confirmed it is them with Roblox: neither route asks for a password, the placeholder address is no obstacle, and the person can still sign in afterwards', async () => {
  ROWS.clear();
  const s = scene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const userId = userIdOf(s.db, SUB_A);
  const placeholder = s.world.sb.users.get(userId).email;
  assert.match(placeholder, /@users\.studpilot\.invalid$/, 'the account the SPA is signed in to has only the placeholder address');
  const bearer = as(userId, placeholder);
  const deleteAs = (b) => hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...b.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);

  // Signing in is not confirming it is you: the session's sign-in time is not what these two routes read.
  for (const [what, refused] of [['export', await hit(`${PROD}/api/me/export`, bearer, s.env)], ['delete', await deleteAs(bearer)]]) {
    assert.equal(refused.status, 403, `${what}: a Roblox-only account that has not re-authenticated is refused`);
    assert.equal((await refused.json()).code, 'reauth_required', what);
  }
  assert.equal(identityCount(s.db), 1, 'and the refused deletion deleted nothing');
  assert.deepEqual(s.world.roblox.revokeCalls, []);
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal((await hit(`${PROD}/api/me/export`, bearer, s.env)).status, 403, 'a plain sign-in (which stamps last_sign_in_at) does not open the gate');
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'export-data' });

  const exported = await hit(`${PROD}/api/me/export`, bearer, s.env);
  assert.equal(exported.status, 200, 'the export is served with a JWT and nothing else');
  assert.match(exported.headers.get('Content-Disposition'), /attachment; filename="studpilot-data-/);
  const doc = JSON.parse(await exported.text());
  assert.equal(doc.user.id, userId);
  for (const t of ['roblox_identities', 'roblox_oauth_tokens']) {
    assert.equal(doc.tables[t].status, 'ok', `${t} is in the file`);
    assert.equal(doc.tables[t].rows.length, 1);
  }
  assert.equal(doc.tables.roblox_identities.rows[0].username, 'Builder1');

  const erased = await deleteAs(bearer);
  assert.ok([200, 207].includes(erased.status), `erasure answered ${erased.status}`);
  const receipt = await erased.json();
  assert.equal(receipt.steps.filter((x) => x.status === 'failed').length, 0);
  assert.equal(receipt.steps.find((x) => x.target === 'roblox_oauth_tokens').status, 'erased');
  assert.equal(receipt.steps.find((x) => x.target === 'roblox_identities').status, 'erased');
  assert.equal(s.world.roblox.revokeCalls.at(-1), s.world.roblox.lastRefreshIssued, 'the Roblox grant was revoked as part of it');
  assert.equal(identityCount(s.db), 0);

  // THE SUPABASE ACCOUNT WENT WITH IT (owner decision D-14): the receipt says so, Auth was asked to delete exactly this user, and
  // the same Roblox account signing in again is a first sight that makes a NEW account, never the deleted one.
  assert.equal(receipt.accountRemoved, true);
  assert.deepEqual(s.world.sb.deleteCalls, [userId]);
  assert.equal(s.world.sb.users.has(userId), false, 'the Supabase user is gone');
  const back = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(back.res.status, 302);
  assert.notEqual(userIdOf(s.db, SUB_A), userId, 'the deleted account is not brought back by signing in again');
  assert.equal(s.world.sb.users.size, 1);
  s.db.close();
});

/* ------------------------------------------------------------------- configuration --- */

test('with any one secret missing the routes answer 503 and nothing is called or stored', async () => {
  for (const missing of ['ROBLOX_OAUTH_CLIENT_ID', 'ROBLOX_OAUTH_CLIENT_SECRET', 'SUPABASE_SECRET_KEY', 'CREDENTIAL_KEY']) {
    const { db, kv, world, env } = scene({ [missing]: undefined });
    const ip = freshIp();
    const start = await hit(`${PROD}/auth/roblox/start`, { headers: { 'CF-Connecting-IP': ip } }, env);
    const callback = await hit(`${PROD}/auth/roblox/callback?code=c&state=${'s'.repeat(43)}`, { headers: { 'CF-Connecting-IP': ip } }, env);
    assert.equal(start.status, 503, `${missing}: start`);
    assert.equal(callback.status, 503, `${missing}: callback`);
    assert.ok((await start.text()).includes('not available'));
    const status = await (await hit(`${PROD}/auth/roblox/status`, { headers: { 'CF-Connecting-IP': ip } }, env)).json();
    assert.deepEqual(status, { configured: false }, `${missing}: the button must stay hidden`);
    assert.equal(world.calls.length, 0);
    assert.equal(kv.rows.size, 0);
    db.close();
  }
  const { db, env } = scene();
  assert.deepEqual(await (await hit(`${PROD}/auth/roblox/status`, { headers: { 'CF-Connecting-IP': freshIp() } }, env)).json(), { configured: true });
  db.close();
});

/* ---------------------------------------------------------------------- hardening --- */

test('every response under /auth/roblox is no-store and no-referrer, success or failure', async () => {
  const { db, world, env } = scene();
  const seen = [];
  const flow = await startFlow(env);
  seen.push(['start', flow.res]);
  const ok = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  seen.push(['callback ok', ok.res]);
  seen.push(['callback replay', (await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' })).res]);
  seen.push(['status', await hit(`${PROD}/auth/roblox/status`, { headers: { 'CF-Connecting-IP': freshIp() } }, env)]);
  seen.push(['redeem asks a first sight', await redeemFor(env, ok.res)]);
  seen.push(['create from another origin', await createRequest(env, { cookie: handleCookieOf(ok.res), origin: 'https://evil.example' })]);
  seen.push(['create', await createRequest(env, { cookie: handleCookieOf(ok.res) })]);
  seen.push(['redeem ok', await redeemFor(env, ok.res)]);
  seen.push(['redeem replay', await redeemFor(env, ok.res)]);
  seen.push(['redeem from another origin', await redeemFor(env, ok.res, { origin: 'https://evil.example' })]);
  seen.push(['decline with nothing waiting', await declineRequest(env, { cookie: handleCookieOf(ok.res) })]);
  const second = await finish(env, world, await startFlow(env), { sub: SUB_B, username: 'Bob' });
  seen.push(['decline', await declineRequest(env, { cookie: handleCookieOf(second.res) })]);
  const off = scene({ SUPABASE_SECRET_KEY: undefined });
  seen.push(['not configured', await hit(`${PROD}/auth/roblox/start`, { headers: { 'CF-Connecting-IP': freshIp() } }, off.env)]);
  for (const [name, res] of seen) {
    assert.equal(res.headers.get('Cache-Control'), 'no-store', `${name}: Cache-Control`);
    assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer', `${name}: Referrer-Policy`);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', `${name}: nosniff`);
  }
  db.close();
  off.db.close();
});

test('START has a ceiling per address sized for a shared one (60 a minute), and the status check has a bucket of its own', async () => {
  const { db, kv, env } = scene();
  const ip = freshIp();
  const answers = [];
  for (let i = 0; i < 62; i += 1) answers.push((await hit(`${PROD}/auth/roblox/start`, { headers: { 'CF-Connecting-IP': ip } }, env)).status);
  assert.equal(answers.slice(0, 60).every((s) => s === 302), true, 'the first sixty are served');
  assert.deepEqual(answers.slice(60), [429, 429]);
  assert.equal(kv.rows.size, 60, 'a limited request stores no state');
  // Hammering start does not take the sign-in page's status check away from the same address.
  assert.equal((await hit(`${PROD}/auth/roblox/status`, { headers: { 'CF-Connecting-IP': ip } }, env)).status, 200);
  db.close();
});

test('SHARED ADDRESS: a school lab behind one NAT completes 20 first sign-ins in a minute, and every step of each is answered', async () => {
  // Start, callback and redeem used to share one bucket of 20 for the address, so the seventh sign-in found it empty and a
  // redeem refused after consent threw away a sign-in the person had already paid for at Roblox. A first sight now has a step
  // more (the person is asked, and presses Continue), and that one is answered too.
  const { db, world, env } = scene();
  const ip = freshIp();
  for (let i = 0; i < 20; i += 1) {
    const flow = await startFlow(env, { ip });
    assert.equal(flow.res.status, 302, `sign-in ${i + 1}: start`);
    const done = await finish(env, world, flow, { sub: String(2_000_000 + i), username: `Student${i}` });
    assert.equal(done.res.status, 302, `sign-in ${i + 1}: callback`);
    const asked = await redeemFor(env, done.res, { ip });
    assert.equal((await asked.json()).confirm, 'new-account', `sign-in ${i + 1}: the first sight is asked`);
    assert.equal((await createRequest(env, { cookie: handleCookieOf(done.res), ip })).status, 200, `sign-in ${i + 1}: Continue`);
    const redeemed = await redeemFor(env, done.res, { ip });
    assert.equal(redeemed.status, 200, `sign-in ${i + 1}: redeem`);
    assert.match((await redeemed.json()).token_hash, /^ht_/);
  }
  assert.equal(identityCount(db), 20, 'twenty people, twenty accounts');
  db.close();
});

test('ONCE STARTED, A SIGN-IN IS NEVER REFUSED: with the address’s start allowance used up, every flow already begun still gets its callback and its redeem', async () => {
  const { db, world, env } = scene();
  const ip = freshIp();
  const flows = [];
  for (let i = 0; i < 60; i += 1) flows.push(await startFlow(env, { ip }));
  assert.equal((await startFlow(env, { ip })).res.status, 429, 'the sixty-first START is the one that is refused');
  for (const [i, flow] of flows.entries()) {
    const done = await finish(env, world, flow, { sub: String(3_000_000 + i), username: `Student${i}` });
    assert.equal(done.res.status, 302, `flow ${i + 1}: callback after the start allowance was spent`);
    assert.equal((await redeemFor(env, done.res, { ip })).status, 200, `flow ${i + 1}: redeem after the start allowance was spent`);
  }
  db.close();
});

test('REPLAY is still refused: the same state, or the same handle, offered again is a 400 and then a 429, and nothing is exchanged twice', async () => {
  const { db, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });         // a returning person: a first sight's handle is read more than once, by design
  const flow = await startFlow(env);
  const first = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  const replays = [];
  for (let i = 0; i < 5; i += 1) replays.push((await finish(env, world, flow, { code: first.code })).res.status);
  assert.deepEqual([first.res.status, ...replays], [302, 400, 400, 400, 400, 429], 'a state is used once; hammering it is limited by its OWN bucket');
  assert.equal(world.roblox.tokenCalls.length, 2, 'no replay exchanged a second code (two: the first sign-in, and this one)');

  const cookie = handleCookieOf(first.res);
  const redeems = [];
  for (let i = 0; i < 6; i += 1) redeems.push((await redeemRequest(env, { cookie })).status);
  assert.deepEqual(redeems, [200, 400, 400, 400, 400, 429], 'a handle redeems once; hammering it is limited by its OWN bucket');
  db.close();
});

test('STRAY BUDGET FIRST: a state or handle nobody holds counts against the address, and once the address has used its allowance NOTHING more is read from KV', async () => {
  // Each state and handle has a bucket of its own, so a flood of fresh valid-looking values would never meet a ceiling without the
  // per-address count; and counting only AFTER the read would still let every one of them cost a KV read. So the count is asked first.
  const { db, kv, world, env } = scene();
  const ip = freshIp();
  const random = () => randomBytes(32).toString('base64url');
  // Real flows from this address first: a state or handle that IS held is never a stray, so ten sign-ins leave the whole allowance.
  for (let i = 0; i < 10; i += 1) {
    const real = await signIn(env, world, { sub: String(4_000_000 + i), username: `Real${i}` }, { ip });
    assert.equal((await redeemFor(env, real.res, { ip })).status, 200, `real sign-in ${i + 1}`);
  }
  const reads0 = kv.reads;
  const callbacks = [];
  for (let i = 0; i < 60; i += 1) {
    const state = random();
    callbacks.push((await hit(`${PROD}/auth/roblox/callback?code=x&state=${state}`, { headers: { 'CF-Connecting-IP': ip, Cookie: `${STATE_C}=${state}` } }, env)).status);
  }
  assert.equal(callbacks.every((s) => s === 400), true, 'the first sixty strays are read, found wanting and answered: the real sign-ins above did not use the allowance up');
  assert.equal(kv.reads - reads0, 60, 'each of them cost one read');
  const handles = [];
  for (let i = 0; i < 60; i += 1) handles.push((await redeemRequest(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status);
  assert.equal(handles.every((s) => s === 400), true);
  assert.equal(kv.reads - reads0, 120);

  // The address is over budget for both. Everything after this is refused without a read, fresh, replayed or anything else.
  const before = kv.reads;
  const refused = [];
  for (let i = 0; i < 5; i += 1) {
    const state = random();
    refused.push((await hit(`${PROD}/auth/roblox/callback?code=x&state=${state}`, { headers: { 'CF-Connecting-IP': ip, Cookie: `${STATE_C}=${state}` } }, env)).status);
    refused.push((await redeemRequest(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status);
    refused.push((await createRequest(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status);
    refused.push((await declineRequest(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status);
  }
  assert.deepEqual(refused, Array(20).fill(429), 'over budget: busy');
  assert.equal(kv.reads, before, 'and not one of those twenty requests asked KV for anything');

  // A real flow from that address is refused too, until the minute is out, and NOTHING of it is burned or spent: the same state works later.
  const flow = await startFlow(env, { ip });
  const held = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.equal(held.res.status, 429);
  assert.equal(kv.rows.has(`roblox-oauth:state:${flow.state}`), true, 'its state was not read, so it was not burned');
  assert.equal(world.roblox.tokenCalls.length, 10, 'and no code was exchanged for it (the ten are the real sign-ins above)');
  assert.equal(setCookieNamed(held.res, STATE_C, true), undefined, 'its state cookie is left alone, so the flow can be finished');
  // The allowance is a minute's: when it is out, the very same state finishes the flow it was issued for.
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    const later = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
    assert.equal(later.res.status, 302, 'a minute on, the flow that was refused at the door goes through');
  } finally {
    Date.now = realNow;
  }
  // Other addresses are not the flood's business.
  const other = await signIn(env, world, { sub: SUB_B, username: 'Bob' }, { ip: freshIp() });
  assert.equal(other.res.status, 302);
  assert.equal((await redeemFor(env, other.res)).status, 200);
  db.close();
});

test('requests that carry no usable state or handle are limited per address, never read KV, and do not touch another address', async () => {
  const { db, kv, world, env } = scene();
  const ip = freshIp();
  const stray = [];
  for (let i = 0; i < 62; i += 1) stray.push((await hit(`${PROD}/auth/roblox/callback?code=x&state=nope`, { headers: { 'CF-Connecting-IP': ip } }, env)).status);
  assert.equal(stray.slice(0, 60).every((s) => s === 400), true);
  assert.deepEqual(stray.slice(60), [429, 429]);
  const noHandle = [];
  for (let i = 0; i < 62; i += 1) noHandle.push((await redeemRequest(env, { ip })).status);
  assert.equal(noHandle.slice(0, 60).every((s) => s === 400), true);
  assert.deepEqual(noHandle.slice(60), [429, 429]);
  assert.equal(kv.reads, 0, 'a value that cannot be a state or a handle is never looked up');
  assert.equal((await startFlow(env, { ip })).res.status, 302, 'the strays have a bucket of their own: the address can still start a sign-in');
  const flow = await startFlow(env);
  const done = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.equal(done.res.status, 302, 'a flow from another address is not affected');
  db.close();
});

test('ROUTE-LEVEL CATCH: an exception that escapes a handler answers the one generic page, clears the flow cookie with its attributes, and logs a fixed word, never the error text or a URL', async () => {
  const { db, env } = scene();
  const LEAK = `${PROD}/auth/roblox/callback?code=LEAK-CODE-123&state=LEAK-STATE-456 token_hash=LEAK-HASH-789`;
  // A store that throws an error whose message carries a URL with a code in it: the shape a real KV or fetch failure can take.
  const boom = async () => { throw new Error(`storage said no for ${LEAK}`); };
  const broken = { ...env, KV: { get: boom, put: boom, delete: boom, list: boom } };
  const tokenShaped = 'k'.repeat(43);
  LOGS.length = 0;

  const start = await hit(`${PROD}/auth/roblox/start`, { headers: { 'CF-Connecting-IP': freshIp() } }, broken);
  const callback = await hit(`${PROD}/auth/roblox/callback?code=c&state=${tokenShaped}`, { headers: { 'CF-Connecting-IP': freshIp(), Cookie: `${STATE_C}=${tokenShaped}` } }, broken);
  const redeem = await redeemRequest(broken, { cookie: `${HANDLE_C}=${tokenShaped}` });

  for (const [name, res] of [['start', start], ['callback', callback]]) {
    assert.equal(res.status, 500, `${name}: the escaped exception is a 500`);
    const html = await res.text();
    assert.ok(html.includes(GENERIC), `${name}: the fixed sentence`);
    assert.equal(/LEAK|storage said|auth\/roblox\/callback/.test(html), false, `${name}: nothing of the error is reflected`);
    assertHostCookie(setCookieNamed(res, STATE_C, true), STATE_C, { maxAge: 0 });
  }
  assert.equal(redeem.status, 500);
  assert.deepEqual(await redeem.json(), { error: GENERIC }, 'redeem answers the same sentence, as JSON, with nothing else in it');
  assertHostCookie(setCookieNamed(redeem, HANDLE_C, true), HANDLE_C, { maxAge: 0 });
  for (const res of [start, callback, redeem]) {
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  }

  const text = LOGS.join('\n');
  assert.deepEqual(LOGS.filter((l) => l.startsWith('[roblox-oauth]')), Array(3).fill('[roblox-oauth] unexpected failure'), 'one fixed line per escape');
  assert.equal(/LEAK|storage said|auth\/roblox\/callback|https?:\/\//.test(text), false, 'no error text and no URL in any log line');
  assert.equal(LOGS.every((l) => l.startsWith('[roblox-oauth]')), true, 'and nothing else was logged, by Hono or the monitoring layer');
  db.close();
});

test('NO SECRET, TOKEN, CODE, STATE OR QUERY STRING IS WRITTEN TO ANY LOG LINE, through a real sign-in (the account made by Continue, the sign-in token minted and redeemed) and every failure', async () => {
  LOGS.length = 0;
  const { db, world, env } = scene();
  const secrets = new Set([CLIENT_SECRET, SB_SECRET, KEY_B64]);
  // success, the whole way: the person is asked, presses Continue (the account is made, the token stored, the sign-in token minted) and redeems it
  const flow = await startFlow(env);
  const ok = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  secrets.add(flow.state); secrets.add(ok.code); secrets.add(world.roblox.lastRefreshIssued);
  secrets.add(world.roblox.tokenCalls[0].code_verifier);
  const handle = handleCookieOf(ok.res).split('=')[1];
  secrets.add(handle);
  assert.equal(isPending(env, ok.res), true, 'a first sight: nothing is made until Continue');
  assert.equal(world.sb.users.size, 0);
  assert.equal((await (await redeemFor(env, ok.res)).json()).confirm, 'new-account');
  assert.equal((await createRequest(env, { cookie: handleCookieOf(ok.res) })).status, 200, 'Continue');
  assert.equal(world.sb.users.size, 1, 'the account was made');
  const redeemed = await redeemFor(env, ok.res);
  const tokenHash = (await redeemed.json()).token_hash;
  assert.match(tokenHash, /^ht_/, 'the sign-in token was minted and redeemed');
  secrets.add(tokenHash);
  for (const minted of world.sb.links.keys()) secrets.add(minted);       // every sign-in token Auth made
  for (const row of rowsOf(db, 'select sealed_refresh from roblox_oauth_tokens')) secrets.add(row.sealed_refresh);
  await redeemFor(env, ok.res);                                          // a replay
  await redeemFor(env, ok.res, { origin: 'https://evil.example' });      // a hostile origin
  for (const at of world.roblox.access.keys()) secrets.add(at);
  // Go back with Roblox unable to revoke, and a Continue whose account cannot be made: the log lines the two new routes can write
  const goBack = await signIn(env, world, { sub: '3141592', username: 'Gale' }, { confirm: false });
  secrets.add(goBack.flow.state); secrets.add(goBack.code); secrets.add(handleCookieOf(goBack.res).split('=')[1]); secrets.add(world.roblox.lastRefreshIssued);
  world.roblox.failRevoke = 503;
  assert.equal((await declineRequest(env, { cookie: handleCookieOf(goBack.res) })).status, 200);
  world.roblox.failRevoke = null;
  const noAccount = await signIn(env, world, { sub: '2718281', username: 'Nia' }, { confirm: false });
  secrets.add(noAccount.flow.state); secrets.add(noAccount.code); secrets.add(handleCookieOf(noAccount.res).split('=')[1]); secrets.add(world.roblox.lastRefreshIssued);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, i = {}) => (String(u).endsWith('/auth/v1/admin/users') && (i.method ?? 'GET') === 'POST' ? new Response('{}', { status: 500 }) : realFetch(u, i));
  assert.equal((await createRequest(env, { cookie: handleCookieOf(noAccount.res) })).status, 502);
  globalThis.fetch = realFetch;
  assert.ok(LOGS.includes('[roblox-oauth] decline revoke') && LOGS.includes('[roblox-oauth] account link'), 'the stage words of the two new routes were reached');
  // replay, forged state, failed exchange, a provider error, a failure inside the handler
  await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  const f2 = await startFlow(env);
  world.roblox.failToken = { status: 500, body: { error: 'LEAK-ME-LOG-DETAIL' } };
  const bad = await finish(env, world, f2, { sub: SUB_B, username: 'B' });
  secrets.add(f2.state); secrets.add(bad.code);
  world.roblox.failToken = null;
  const f3 = await startFlow(env);
  const second = await finish(env, world, f3, { sub: SUB_B, username: 'B' });
  assert.equal(second.res.status, 302, 'the control: with the failure switched off the same sign-in succeeds');
  secrets.add(f3.state); secrets.add(second.code);
  world.roblox.revokeCalls.length = 0;
  db.raw.exec('drop table roblox_identities');           // the next callback now fails inside the handler, in storage
  const f4 = await startFlow(env);
  secrets.add(f4.state);
  const stored = await finish(env, world, f4, { sub: SUB_B, username: 'B' });
  secrets.add(stored.code);
  assert.equal(stored.res.status, 502, 'the storage failure was reached and answered');
  assert.ok(LOGS.includes('[roblox-oauth] storage'), 'and logged as a fixed stage word, so there is something to read');
  const text = LOGS.join('\n');
  for (const s of secrets) assert.equal(text.includes(s), false, `a log line carries ${String(s).slice(0, 6)}…`);
  assert.equal(text.includes('LEAK-ME'), false, 'no provider body in the logs');
  assert.equal(/[?&](code|state|token_hash)=/.test(text), false, 'no query string or fragment in the logs');
  for (const line of LOGS.filter((l) => l.startsWith('[roblox-oauth]'))) assert.match(line, /^\[roblox-oauth\] [a-z -]+$/, `an unexpected log line: ${line.slice(0, 40)}`);
  db.close();
});

/* ============================================================================================================
 * CYCLE 3. A RE-AUTHENTICATION THAT PROVES SOMETHING, A FIRST SIGHT THAT IS ASKED ABOUT, AND A STRAY BUDGET THAT IS ASKED FIRST.
 * ========================================================================================================== */

const settingsBearer = (s) => as(s.userId, SYNTHETIC(SUB_A));
const connectionOf = async (s, bearer = settingsBearer(s)) => (await hit(`${PROD}/api/me/roblox/connection`, bearer, s.env)).json();

test('REAUTH START: reauth=<action> asks Roblox for a fresh login (prompt=login, max_age=0), is stored as a re-authentication, and comes back to Settings carrying the action; an ordinary sign-in asks for none of it', async () => {
  const { db, kv, env } = scene();
  const plain = await startFlow(env, { returnTo: '/usage' });
  assert.equal(plain.auth.searchParams.has('prompt'), false, 'an ordinary sign-in lets Roblox answer from the session it already has');
  assert.equal(plain.auth.searchParams.has('max_age'), false);
  assert.equal(JSON.parse(kv.rows.get(`roblox-oauth:state:${plain.state}`)).purpose, 'signin');

  for (const action of SENSITIVE_ACTIONS) {
    const flow = await startFlow(env, { reauth: action, returnTo: '/usage' });
    assert.equal(flow.res.status, 302, action);
    assert.equal(flow.auth.searchParams.get('prompt'), 'login', `${action}: ask Roblox to ask again`);
    assert.equal(flow.auth.searchParams.get('max_age'), '0', `${action}: and say no earlier login is recent enough`);
    const stored = JSON.parse(kv.rows.get(`roblox-oauth:state:${flow.state}`));
    assert.equal(stored.purpose, 'reauth', `${action}: distinguishable on the server`);
    assert.equal(stored.returnTo, `/settings?resume=${action}`, `${action}: the action rides back, and a return path the link also carried does not override it`);
    for (const key of ['response_type', 'client_id', 'redirect_uri', 'scope', 'code_challenge_method']) {
      assert.equal(flow.auth.searchParams.get(key), plain.auth.searchParams.get(key), `${action}: ${key} is the same as a sign-in's`);
    }
    assert.equal(flow.auth.searchParams.get('scope'), 'openid profile', `${action}: no more is asked for`);
  }

  // Anything that is not an action id is not a re-authentication at all: the flow is an ordinary sign-in.
  for (const bad of ['', 'Export Data', 'export_data', 'EXPORT', 'a', 'x'.repeat(30), 'export-data&prompt=none', '../x', 'export-data-a-b-c-d', 'export data', '-export']) {
    const flow = await startFlow(env, { reauth: bad });
    assert.equal(flow.auth.searchParams.has('prompt'), false, `${JSON.stringify(bad)} must not become a re-authentication`);
    const stored = JSON.parse(kv.rows.get(`roblox-oauth:state:${flow.state}`));
    assert.deepEqual([stored.purpose, stored.returnTo], ['signin', '/'], JSON.stringify(bad));
  }
  db.close();
});

test('REAUTH: a successful re-authentication is recorded by the SERVER’S clock, an ordinary sign-in is not, and the record is good for exactly the web’s window', async () => {
  const s = await connected();
  const row = () => rowsOf(s.db, 'select reauth_at from roblox_identities where user_id = ?', s.userId)[0];
  assert.equal(row().reauth_at, null, 'a first sign-in confirms nothing');
  assert.equal((await connectionOf(s)).reauthFresh, false);
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(row().reauth_at, null, 'an ordinary sign-in again, with a Roblox session already open, confirms nothing either');

  const before = Date.now();
  const again = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'export-data' });
  const stamp = row().reauth_at;
  assert.ok(typeof stamp === 'number' && stamp >= before && stamp <= Date.now(), 'epoch milliseconds from this worker’s clock');
  assert.equal((await connectionOf(s)).reauthFresh, true);
  assert.deepEqual(await (await redeemFor(s.env, again.res)).json(), { token_hash: [...s.world.sb.links.keys()].at(-1), next: '/settings?resume=export-data' }, 'the page is sent back to Settings with the action to resume');

  // The window is the web's REAUTH_WINDOW_MS, by this clock and nobody else's; a stamp a few seconds ahead is clock noise, not the future.
  assert.equal(REAUTH_WINDOW_MS, 10 * 60_000);
  const fresh = (at) => R.robloxReauthFresh(s.env, s.userId, at);
  assert.equal(await fresh(stamp), true);
  assert.equal(await fresh(stamp + REAUTH_WINDOW_MS), true, 'ten minutes to the millisecond still holds');
  assert.equal(await fresh(stamp + REAUTH_WINDOW_MS + 1), false, 'and one millisecond more does not');
  assert.equal(await fresh(stamp - 5_000), true, 'a worker whose clock is five seconds behind the one that wrote it');
  assert.equal(await fresh(stamp - 5_001), false, 'a stamp from further in the future is not believed');
  assert.equal(await R.robloxReauthFresh(s.env, 'nobody-linked', stamp), false);
  s.db.close();
});

test('REAUTH never makes an account: a Roblox account nobody here has seen is refused, its authorization is withdrawn, and nothing is created or held', async () => {
  const { db, kv, world, env } = scene();
  LOGS.length = 0;
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Stranger' }, { reauth: 'delete-account' });
  assert.equal(res.status, 403);
  assert.ok((await res.text()).includes(GENERIC));
  assert.equal(handleCookieOf(res), '', 'no handle');
  assert.equal(kvHandles(env).length, 0, 'nothing waits in KV, pending or ready');
  assert.equal(world.sb.createCalls, 0);
  assert.equal(world.calls.filter((c) => c.url.startsWith(SB)).length, 0, 'Supabase was not asked anything');
  assert.equal(identityCount(db), 0);
  assert.deepEqual(world.roblox.revokeCalls, [world.roblox.lastRefreshIssued], 'the authorization it was just given is withdrawn');
  assert.ok(LOGS.includes('[roblox-oauth] reauthentication without a linked account'));
  db.close();
});

test('THE GATE ON EXPORT AND DELETE: a Roblox-only account needs a fresh re-authentication of its own, another Roblox account’s does not count, and an email account is not asked', async () => {
  ROWS.clear();
  const s = await connected();
  const bearer = settingsBearer(s);
  const deleteAs = (b) => hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...b.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
  const codes = async (b) => [(await hit(`${PROD}/api/me/export`, b, s.env)).status, (await deleteAs(b)).status];

  // somebody ELSE confirming it is them (a second, real Roblox account) opens nothing for this one
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' }, { reauth: 'export-data' });
  assert.equal(rowsOf(s.db, 'select reauth_at from roblox_identities where roblox_sub = ?', SUB_B)[0].reauth_at > 0, true, 'Bob did confirm it is him');
  assert.deepEqual(await codes(bearer), [403, 403]);
  assert.equal(identityCount(s.db), 2, 'and the refused deletion deleted nothing');

  // a start that is never finished confirms nothing
  await startFlow(s.env, { reauth: 'export-data' });
  assert.deepEqual(await codes(bearer), [403, 403]);

  // the stamp opens the gate for this account, and for ten minutes
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'export-data' });
  assert.equal((await hit(`${PROD}/api/me/export`, bearer, s.env)).status, 200);
  s.db.raw.prepare('update roblox_identities set reauth_at = ? where user_id = ?').run(Date.now() - REAUTH_WINDOW_MS - 1000, s.userId);
  assert.deepEqual(await codes(bearer), [403, 403], 'ten minutes and a second on, the gate is shut again');
  assert.equal((await (await hit(`${PROD}/api/me/export`, bearer, s.env)).json()).code, 'reauth_required');

  // an account with an email address proves it with its password in the SPA, as before: these routes ask it nothing
  assert.equal((await hit(`${PROD}/api/me/export`, as('a-person-with-an-email-account', 'me@example.com'), s.env)).status, 200);
  assert.equal((await hit(`${PROD}/api/me/export`, as(s.userId), s.env)).status, 200, 'no address on the token at all is not a Roblox-only account');
  s.db.close();
});

/* ------------------------------------------------------------------------ a first sight is asked about --- */

test('A FIRST SIGHT IS ASKED ABOUT: the callback makes no account, it holds the Roblox account (its token sealed) behind the handle, and nothing is made until Continue', async () => {
  const { db, kv, world, env } = scene();
  const { res, flow } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/app/auth/roblox');
  // NOTHING made: not in Supabase, not in D1.
  assert.equal(world.sb.createCalls, 0);
  assert.equal(world.sb.users.size, 0);
  assert.equal(world.calls.filter((c) => c.url.startsWith(SB)).length, 0, 'Supabase was not called at all');
  assert.equal(identityCount(db), 0);
  assert.equal(countRows(db.raw, 'select count(*) from roblox_oauth_tokens'), 0, 'no token row for an account that does not exist');
  // What is held: the verified Roblox identity and the sealed refresh token, under an unguessable handle, for five minutes. No sign-in token.
  const key = `roblox-oauth:handle:${handleCookieOf(res).split('=')[1]}`;
  const held = JSON.parse(kv.rows.get(key));
  assert.equal('tokenHash' in held, false, 'it is not a sign-in');
  assert.equal(held.pending.sub, SUB_A);
  assert.equal(held.pending.username, 'Builder1');
  assert.equal(held.pending.scope, 'openid profile');
  assert.equal(held.next, '/');
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, held.pending.sealedRefresh), world.roblox.lastRefreshIssued, 'the token is sealed with the wrapping key');
  assert.equal(kv.rows.get(key).includes(world.roblox.lastRefreshIssued), false, 'and the plaintext is nowhere in KV');
  assert.equal(kv.ttls.get(key), 300);
  assert.equal(JSON.stringify([...res.headers.entries()]).includes(world.roblox.lastRefreshIssued), false);
  assert.equal(kv.rows.has(`roblox-oauth:state:${flow.state}`), false, 'the state is burned as ever');

  // The SPA asks, and is told what to ask the person. Asking spends nothing: the answer is the same every time and the cookie stays.
  for (let i = 0; i < 2; i += 1) {
    const asked = await redeemFor(env, res);
    assert.equal(asked.status, 200);
    assert.deepEqual(await asked.json(), { confirm: 'new-account', username: 'Builder1', next: '/' }, 'no token_hash among it');
    assert.equal(asked.headers.getSetCookie().length, 0, 'the handle cookie is neither cleared nor reissued');
  }
  assert.equal(kv.rows.has(key), true);
  assert.equal(world.sb.createCalls, 0, 'and being asked made nothing');

  // Continue.
  const created = await createRequest(env, { cookie: handleCookieOf(res) });
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { created: true }, 'it hands over nothing itself: the token still leaves only through redeem');
  assert.equal(world.sb.createCalls, 1);
  assert.equal(world.sb.users.size, 1);
  assert.equal(identityCount(db), 1);
  const row = rowsOf(db, 'select * from roblox_oauth_tokens')[0];
  assert.equal(row.user_id, userIdOf(db, SUB_A));
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, row.sealed_refresh), world.roblox.lastRefreshIssued, 'the held token is the one stored for the new account');
  assert.equal(row.version, 1);
  const redeemed = await redeemFor(env, res);
  assert.equal(redeemed.status, 200);
  const body = await redeemed.json();
  assert.equal(world.sb.links.get(body.token_hash), userIdOf(db, SUB_A), 'the token is for the account that was just made');
  assert.equal(body.next, '/');
  assert.equal((await redeemFor(env, res)).status, 400, 'and, as ever, it is handed over once');
  assert.equal(world.sb.createCalls, 1);
  db.close();
});

test('GO BACK on a first sight makes nothing, deletes what was held, and withdraws the Roblox authorization it was given', async () => {
  const { db, kv, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  const refresh = world.roblox.lastRefreshIssued;
  const key = `roblox-oauth:handle:${handleCookieOf(res).split('=')[1]}`;
  const declined = await declineRequest(env, { cookie: handleCookieOf(res) });
  assert.equal(declined.status, 200);
  assert.deepEqual(await declined.json(), { declined: true });
  assertHostCookie(setCookieNamed(declined, HANDLE_C, true), HANDLE_C, { maxAge: 0 });
  assert.equal(kv.rows.has(key), false, 'what was held is gone');
  assert.deepEqual(world.roblox.revokeCalls, [refresh], 'the authorization is withdrawn at Roblox rather than left in the person’s Connected apps');
  assert.equal(world.roblox.refresh.get(refresh).state, 'revoked');
  assert.equal(world.sb.createCalls, 0);
  assert.equal(world.sb.users.size, 0);
  assert.equal(identityCount(db), 0);
  assert.equal((await createRequest(env, { cookie: handleCookieOf(res) })).status, 400, 'Continue after Go back finds nothing');
  assert.equal(world.sb.createCalls, 0, 'and still nothing is made');

  // Roblox cannot be reached to withdraw it: the held record is deleted all the same, and the operator can see it happened.
  const second = await signIn(env, world, { sub: SUB_B, username: 'Bob' }, { confirm: false });
  world.roblox.failRevoke = 503;
  LOGS.length = 0;
  const key2 = `roblox-oauth:handle:${handleCookieOf(second.res).split('=')[1]}`;
  assert.equal((await declineRequest(env, { cookie: handleCookieOf(second.res) })).status, 200);
  assert.equal(kv.rows.has(key2), false);
  assert.ok(LOGS.includes('[roblox-oauth] decline revoke'));
  assert.equal(world.sb.createCalls, 0);
  db.close();
});

test('Continue and Go back are same-origin POSTs that need the browser’s cookie, do nothing for a sign-in that is not a waiting first sight, and spend nothing when refused', async () => {
  const { db, kv, world, env } = scene();
  const first = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  const cookie = handleCookieOf(first.res);
  const key = `roblox-oauth:handle:${cookie.split('=')[1]}`;
  for (const [name, post] of [['create', createRequest], ['decline', declineRequest]]) {
    for (const origin of ['https://evil.example', 'http://localhost:5173', 'null', '']) {
      const r = await post(env, { cookie, origin });
      assert.equal(r.status, 403, `${name}: Origin "${origin}" is refused`);
      assert.equal(kv.rows.has(key), true, `${name}: and burns nothing`);
    }
    assert.equal((await post(env, {})).status, 400, `${name}: no cookie, nothing to act on`);
    assert.equal((await post(env, { cookie: `${HANDLE_C}=${'z'.repeat(43)}` })).status, 400, `${name}: a handle nobody holds`);
    assert.equal((await post(env, { cookie: `rbx_oauth_handle=${cookie.split('=')[1]}` })).status, 400, `${name}: the bare cookie name is not read in production`);
    const get = await hit(`${PROD}/auth/roblox/${name}`, { headers: { Cookie: cookie, Origin: PROD, 'CF-Connecting-IP': freshIp() } }, env);
    assert.notEqual(get.status, 200, `${name}: a GET does nothing`);
  }
  assert.equal(world.sb.createCalls, 0, 'none of that made an account');
  assert.equal(kv.rows.has(key), true);

  // A sign-in that is READY (a returning account's) is not a first sight: Continue and Go back change nothing and leave it redeemable.
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const returning = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal('pending' in JSON.parse(kv.rows.get(`roblox-oauth:handle:${handleCookieOf(returning.res).split('=')[1]}`)), false, 'a returning account is not asked');
  for (const post of [createRequest, declineRequest]) assert.equal((await post(env, { cookie: handleCookieOf(returning.res) })).status, 400);
  assert.equal((await redeemFor(env, returning.res)).status, 200, 'and its sign-in is still there to redeem');
  assert.deepEqual(world.roblox.revokeCalls, [], 'Go back on it withdrew nothing');

  // with a secret missing neither does anything
  delete env.SUPABASE_SECRET_KEY;
  for (const post of [createRequest, declineRequest]) assert.equal((await post(env, { cookie })).status, 503);
  assert.equal(kv.rows.has(key), true);
  db.close();
});

test('Continue that FAILS burns nothing and can be pressed again; and Continue, Go back and the question share the handle’s own bucket', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  const cookie = handleCookieOf(res);
  const inner = world.fetch;
  globalThis.fetch = async (u, i = {}) => (String(u).endsWith('/auth/v1/admin/users') && (i.method ?? 'GET') === 'POST' ? new Response('{}', { status: 500 }) : inner(u, i));
  const failed = await createRequest(env, { cookie });
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: GENERIC });
  assert.equal(identityCount(db), 0, 'nothing was made');
  assert.equal((await (await redeemFor(env, res)).json()).confirm, 'new-account', 'and the first sight is still waiting');
  globalThis.fetch = inner;
  assert.equal((await createRequest(env, { cookie })).status, 200, 'pressed again, it works');
  assert.equal(world.sb.users.size, 1);

  // The handle's bucket is 5 a minute, whichever of the three it is spent on.
  const bucket = await signIn(env, world, { sub: SUB_B, username: 'Bob' }, { confirm: false });
  const bucketCookie = handleCookieOf(bucket.res);
  const answers = [];
  for (let i = 0; i < 5; i += 1) answers.push((await redeemFor(env, bucket.res)).status);
  assert.deepEqual(answers, Array(5).fill(200));
  assert.equal((await createRequest(env, { cookie: bucketCookie })).status, 429, 'a sixth request on this handle, of any of the three kinds, is limited');
  assert.equal((await declineRequest(env, { cookie: bucketCookie })).status, 429);
  assert.equal(world.sb.users.size, 1, 'and made nothing');
  db.close();
});

test('a RETURNING Roblox account is never asked: the callback hands it a ready sign-in, and an account that was dropped as stale is asked like a new one', async () => {
  const { db, kv, world, env } = scene();
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const again = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  assert.equal('pending' in JSON.parse(kv.rows.get(`roblox-oauth:handle:${handleCookieOf(again.res).split('=')[1]}`)), false);
  assert.match((await (await redeemFor(env, again.res)).json()).token_hash, /^ht_/, 'its redeem is the token, not a question');
  assert.equal(world.sb.createCalls, 1);

  world.sb.users.delete(userIdOf(db, SUB_A));                       // an operator deleted the Supabase user: the link is stale
  const stale = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { confirm: false });
  assert.equal((await (await redeemFor(env, stale.res)).json()).confirm, 'new-account', 'a new account is about to be made, so it is asked');
  assert.equal(world.sb.createCalls, 1, 'and nothing was made yet');
  db.close();
});

test('REAUTH is recorded only when the whole sign-in has worked: a token that cannot be minted leaves no confirmation behind', async () => {
  const s = await connected();
  const inner = s.world.fetch;
  globalThis.fetch = async (u, i = {}) => (String(u).endsWith('/auth/v1/admin/generate_link') ? new Response('{}', { status: 500 }) : inner(u, i));
  const done = await finish(s.env, s.world, await startFlow(s.env, { reauth: 'export-data' }), { sub: SUB_A, username: 'Builder1' });
  assert.equal(done.res.status, 502);
  assert.equal(rowsOf(s.db, 'select reauth_at from roblox_identities where user_id = ?', s.userId)[0].reauth_at, null, 'a sign-in that did not happen confirmed nothing');
  assert.equal((await connectionOf(s)).reauthFresh, false);
  s.db.close();
});

test('a state stored before purposes existed (no `purpose` on it) is an ordinary sign-in: it confirms nothing, and a first sight is asked, not refused', async () => {
  const s = await connected();
  const legacy = async (who) => {
    const flow = await startFlow(s.env, { reauth: 'export-data' });                    // stored as a re-authentication ...
    const stored = JSON.parse(s.env.KV.rows.get(`roblox-oauth:state:${flow.state}`));
    delete stored.purpose;                                                              // ... then made to look like one from before the field existed
    s.env.KV.rows.set(`roblox-oauth:state:${flow.state}`, JSON.stringify(stored));
    return finish(s.env, s.world, flow, who);
  };
  const returning = await legacy({ sub: SUB_A, username: 'Builder1' });
  assert.equal(returning.res.status, 302);
  assert.equal(rowsOf(s.db, 'select reauth_at from roblox_identities where user_id = ?', s.userId)[0].reauth_at, null, 'not a re-authentication: nothing was confirmed');
  const stranger = await legacy({ sub: SUB_B, username: 'Bob' });
  assert.equal(stranger.res.status, 302, 'and a first sight is asked about, as in any sign-in');
  assert.equal(isPending(s.env, stranger.res), true);
  s.db.close();
});

test('a held record that is not a well-formed first sight or sign-in is refused and removed, never acted on', async () => {
  const { db, kv, world, env } = scene();
  const good = { sub: SUB_A, username: 'Builder1', sealedRefresh: null, scope: 'openid profile' };
  const cases = [
    ['no sub', { ...good, sub: undefined }],
    ['a sub that is not a number', { ...good, sub: 'abc' }],
    ['an empty username', { ...good, username: '' }],
    ['no scope', { ...good, scope: '' }],
    ['a sealed token that is not text', { ...good, sealedRefresh: 7 }],
  ];
  for (const [what, pending] of cases) {
    const handle = randomBytes(32).toString('base64url');
    kv.rows.set(`roblox-oauth:handle:${handle}`, JSON.stringify({ pending, next: '/' }));
    const res = await redeemRequest(env, { cookie: `${HANDLE_C}=${handle}` });
    assert.equal(res.status, 400, `${what}: not a question`);
    assert.equal(kv.rows.has(`roblox-oauth:handle:${handle}`), false, `${what}: and not kept`);
  }
  const wellFormed = randomBytes(32).toString('base64url');
  kv.rows.set(`roblox-oauth:handle:${wellFormed}`, JSON.stringify({ pending: good, next: '/' }));
  assert.equal((await (await redeemRequest(env, { cookie: `${HANDLE_C}=${wellFormed}` })).json()).confirm, 'new-account', 'the control: the same record, well formed, is a question');
  assert.equal(world.sb.createCalls, 0);
  db.close();
});

/* ------------------------------------------------------------------------- the status check's ceiling --- */

test('STATUS has a ceiling of 120 a minute for an ADDRESS (every visit to the sign-in page asks): 100 from one address are all served, the 121st is not, and thirty addresses never meet each other', async () => {
  const { db, env } = scene();
  const status = (ip) => hit(`${PROD}/auth/roblox/status`, { headers: { 'CF-Connecting-IP': ip } }, env);
  const ip = freshIp();
  const first = [];
  for (let i = 0; i < 100; i += 1) first.push((await status(ip)).status);
  assert.equal(first.every((s) => s === 200), true, 'a hundred visits from one address in a minute are served');
  for (let i = 100; i < 120; i += 1) assert.equal((await status(ip)).status, 200, `visit ${i + 1}`);
  assert.equal((await status(ip)).status, 429, 'the 121st is the first refused');
  assert.equal((await status(ip)).status, 429);
  // Keyed by the address and by nothing else: thirty other addresses, five visits each, are none of them refused.
  const lab = [];
  for (let a = 0; a < 30; a += 1) {
    const labIp = `203.0.113.${a + 1}`;
    for (let i = 0; i < 5; i += 1) lab.push((await status(labIp)).status);
  }
  assert.equal(lab.every((s) => s === 200), true, 'a lab of thirty addresses');
  // and it is its own bucket: the address that used it up can still start a sign-in.
  assert.equal((await hit(`${PROD}/auth/roblox/start`, { headers: { 'CF-Connecting-IP': ip } }, env)).status, 302);
  db.close();
});

/* ----------------------------------------------------------- the refresh lease is bound to its generation --- */

test('REFRESH LEASE CLAIM binds the generation: a row replaced between the read and the claim, at the SAME version, is not claimed, and Roblox is not called', async () => {
  const s = await connected();
  const calls = s.world.roblox.tokenCalls.length;
  const inner = s.env.CORPUS;
  let swapped = 0;
  const env = { ...s.env, CORPUS: { ...inner, prepare(sql) {
    if (/^update roblox_oauth_tokens set lease_until = \?/.test(sql)) {
      // The person disconnects and signs in again between the worker reading the row and claiming it: a new grant, at version 1 like the old one.
      swapped += 1;
      s.db.raw.prepare('delete from roblox_oauth_tokens where user_id = ?').run(s.userId);
      s.db.raw.prepare("insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, generation, rotated_at, lease_until) values (?, 'NEW-GRANT', ?, 'openid profile', 1, 'another-generation', ?, null)")
        .run(s.userId, SUB_A, new Date().toISOString());
    }
    return inner.prepare(sql);
  } } };
  const result = await R.refreshRobloxAccessToken(env, s.userId);
  assert.equal(swapped, 1, 'the probe ran between the read and the claim');
  assert.deepEqual(result, { ok: false, reason: 'busy' });
  assert.equal(s.world.roblox.tokenCalls.length, calls, 'the old grant’s token was not spent on the new grant’s row');
  assert.equal(s.row().sealed_refresh, 'NEW-GRANT');
  assert.equal(s.row().lease_until, null, 'and the new grant was not claimed');
  s.db.close();
});

test('REFRESH LEASE RELEASE binds the generation: when Roblox refuses and the row has meanwhile become another grant that holds a lease of its own, that lease is left alone', async () => {
  const s = await connected();
  const stored = s.world.roblox.lastRefreshIssued;
  s.world.roblox.refresh.get(stored).state = 'used';                 // Roblox will refuse it: the grant is no good
  const otherLease = Date.now() + 25_000;
  s.world.roblox.duringRefresh = () => {
    // While the refresh is at Roblox, the person disconnects and signs in again, and another request claims the new grant.
    s.db.raw.prepare('delete from roblox_oauth_tokens where user_id = ?').run(s.userId);
    s.db.raw.prepare("insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, generation, rotated_at, lease_until) values (?, 'NEW-GRANT', ?, 'openid profile', 1, 'another-generation', ?, ?)")
      .run(s.userId, SUB_A, new Date().toISOString(), otherLease);
  };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused' });
  assert.equal(s.row().generation, 'another-generation');
  assert.equal(s.row().lease_until, otherLease, 'releasing OUR lease did not release the lease of a grant that is not ours');
  s.db.close();
});

/* ============================================================================================================
 * FINAL PASS. A DELETION THAT PART-FAILED CAN BE RUN AGAIN; JUNK DOES NOT SPEND A REAL FLOW'S ALLOWANCE; THE DEV HANDLE COOKIE
 * REACHES ALL THREE ROUTES; AND THE LOG TEST RUNS A SIGN-IN THROUGH CONTINUE.
 * ========================================================================================================== */

test('A PART-FAILED ERASURE CAN BE RUN AGAIN by a Roblox-only account: the link that carries its re-authentication is the last thing swept, and only once everything else has gone', async () => {
  ROWS.clear(); FAILING.clear();
  const s = scene();
  try {
    await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
    const userId = userIdOf(s.db, SUB_A);
    const bearer = as(userId, SYNTHETIC(SUB_A));
    const deleteAs = () => hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...bearer.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
    const stepOf = (receipt, target) => receipt.steps.find((x) => x.target === target);
    const linkRows = () => countRows(s.db.raw, 'select count(*) from roblox_identities where user_id = ?', userId);
    await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
    const savedUser = { ...s.world.sb.users.get(userId) };
    /** The Supabase account again, for the phases below that need it to exist (the first complete run deletes it). */
    const restoreUser = () => s.world.sb.users.set(userId, { ...savedUser });

    // FIRST RUN: a Postgres step is refused. The route answers 207 and says what is left, and the Supabase account is NOT deleted.
    FAILING.set('profiles', 500);
    const first = await deleteAs();
    assert.equal(first.status, 207, 'a part-failed erasure answers 207');
    const receipt = await first.json();
    assert.equal(receipt.complete, false);
    assert.equal(stepOf(receipt, 'roblox_oauth_tokens').status, 'erased', 'the token and its grant went (a retry must not need Roblox again)');
    assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens where user_id = ?', userId), 0);
    const kept = stepOf(receipt, 'roblox_identities');
    assert.equal(kept.status, 'failed', 'the receipt does not claim a sweep that was not done');
    assert.match(kept.detail, /again/, 'and says to run it again');
    assert.equal(linkRows(), 1, 'the link, and with it the re-authentication, is still there');
    assert.deepEqual(s.world.sb.deleteCalls, [], 'the Supabase account is deleted LAST and only when nothing failed: it was not asked to go');
    assert.equal(stepOf(receipt, 'auth.users — your sign-in identity (and your account row with it)').status, 'failed');

    // RETRY inside the window: the same account, with no new sign-in, is not refused and finishes the job.
    FAILING.clear();
    const retry = await deleteAs();
    assert.equal(retry.status, 200, 'the retry is answered, not refused for a re-authentication that the first run swept away');
    const done = await retry.json();
    assert.equal(done.complete, true);
    assert.deepEqual(stepOf(done, 'roblox_identities'), { store: 'd1', target: 'roblox_identities', status: 'erased', rows: 1 });
    assert.equal(linkRows(), 0, 'and now that everything else has gone, so does the link');
    assert.deepEqual(s.world.sb.deleteCalls, [userId], 'the run that finished everything else deleted the Supabase account');
    assert.equal(done.accountRemoved, true);

    // THE WINDOW HAS LAPSED BEFORE THE RETRY: the account is asked to confirm it is them, and CAN, because the link survived.
    restoreUser();
    s.db.raw.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at) values (?, ?, ?, ?)').run(SUB_A, userId, 'Builder1', 'now');
    FAILING.set('profiles', 500);
    await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
    assert.equal((await deleteAs()).status, 207);
    s.db.raw.prepare('update roblox_identities set reauth_at = ? where user_id = ?').run(Date.now() - REAUTH_WINDOW_MS - 1000, userId);
    assert.equal((await deleteAs()).status, 403, 'ten minutes on, it asks again');
    const again = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
    assert.equal(again.res.status, 302, 'a re-authentication needs the link, and it is there');
    FAILING.clear();
    assert.equal((await deleteAs()).status, 200);
    assert.equal(linkRows(), 0);

    // THE SWEEP OF THE LINK ITSELF FAILS: that is a failed step too, and the link is still there to retry with.
    restoreUser();
    s.db.raw.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at, reauth_at) values (?, ?, ?, ?, ?)').run(SUB_A, userId, 'Builder1', 'now', Date.now());
    const realCorpus = s.env.CORPUS;
    s.env.CORPUS = { ...realCorpus, prepare: (sql) => { if (/^delete from roblox_identities/.test(sql)) throw new Error('D1 said no'); return realCorpus.prepare(sql); } };
    const broken = await deleteAs();
    assert.equal(broken.status, 207);
    assert.equal(stepOf(await broken.json(), 'roblox_identities').status, 'failed');
    assert.equal(linkRows(), 1);
    s.env.CORPUS = realCorpus;
    assert.equal((await deleteAs()).status, 200, 'and the next run finishes it');
    assert.equal(linkRows(), 0);

    // THE LINK CANNOT EVEN BE LOOKED AT while another step has failed: the receipt of everything else is still handed back, and the link is kept.
    restoreUser();
    s.db.raw.prepare('insert into roblox_identities(roblox_sub, user_id, username, created_at, reauth_at) values (?, ?, ?, ?, ?)').run(SUB_A, userId, 'Builder1', 'now', Date.now());
    FAILING.set('profiles', 500);
    s.env.CORPUS = { ...realCorpus, prepare: (sql) => { if (/^select 1 as held from roblox_identities/.test(sql)) throw new Error('D1 said no'); return realCorpus.prepare(sql); } };
    const unreadable = await deleteAs();
    assert.equal(unreadable.status, 207, 'the receipt is not lost to a lookup that threw');
    assert.equal(stepOf(await unreadable.json(), 'roblox_identities').status, 'failed');
    assert.equal(linkRows(), 1, 'and a link that could not be looked at is kept, not swept');
    s.env.CORPUS = realCorpus;
  } finally {
    FAILING.clear();
    s.db.close();
  }
});

test('an erasure that fails for an account with no Roblox link says nothing about one, and still deletes nothing it was not asked to', async () => {
  ROWS.clear(); FAILING.clear();
  const s = scene();
  try {
    FAILING.set('profiles', 500);
    const res = await hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...as('a-person-with-an-email-account', 'me@example.com').headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
    assert.equal(res.status, 207);
    const receipt = await res.json();
    assert.deepEqual(receipt.steps.find((x) => x.target === 'roblox_identities'), { store: 'd1', target: 'roblox_identities', status: 'erased', rows: 0 }, 'nothing to keep, nothing to retry: it is not reported as a failure');
    assert.deepEqual(receipt.steps.filter((x) => x.status === 'failed').map((x) => x.target), ['profiles — display name', 'auth.users — your sign-in identity (and your account row with it)'], 'the profile step failed, and so the sign-in was kept (it is how the person runs this again)');
    assert.equal(s.world.sb.deleteCalls.length, 0);
  } finally {
    FAILING.clear();
    s.db.close();
  }
});

test('JUNK CANNOT SPEND A REAL FLOW’S STRAY ALLOWANCE: sixty cross-site requests with no cookie or a foreign Origin from one address leave that address’s own redeem, create, decline and callback served, and are themselves bounded', async () => {
  // A request with no usable cookie, or from another origin, is the only kind a hostile page can make (the browser sends it no
  // SameSite=Lax cookie). It used to share the per-address stray bucket with a request that carries a well-formed flow cookie, so
  // sixty of them refused the person's own real flow at that address for a minute. They have a bucket of their own now.
  const random = () => randomBytes(32).toString('base64url');
  const FOREIGN = 'https://evil.example';
  const image = (query, extra = {}) => (env, ip) => hit(`${PROD}/auth/roblox/callback?${query()}`, { headers: { 'CF-Connecting-IP': ip, ...extra } }, env);
  const floods = [
    ['cross-site POSTs to redeem (no cookie, a foreign Origin)', (env, ip) => redeemRequest(env, { ip, origin: FOREIGN })],
    ['cross-site POSTs to create', (env, ip) => createRequest(env, { ip, origin: FOREIGN })],
    ['cross-site POSTs to decline', (env, ip) => declineRequest(env, { ip, origin: FOREIGN })],
    ['POSTs from a page with no Origin at all', (env, ip) => redeemRequest(env, { ip, origin: '' })],
    ['a sibling subdomain’s POSTs: a foreign Origin, and a well-formed cookie of the right name', (env, ip) => redeemRequest(env, { ip, origin: FOREIGN, cookie: `${HANDLE_C}=${random()}` })],
    ['POSTs under the bare cookie name, which production never reads', (env, ip) => redeemRequest(env, { ip, cookie: `rbx_oauth_handle=${random()}` })],
    ['<img> callback loads with a random well-formed state and no cookie', image(() => `code=x&state=${random()}`)],
    ['<img> callback loads with no state at all', image(() => 'code=x')],
    ['<img> callback loads under the bare state cookie name', (env, ip) => { const state = random(); return hit(`${PROD}/auth/roblox/callback?code=x&state=${state}`, { headers: { 'CF-Connecting-IP': ip, Cookie: `rbx_oauth_state=${state}` } }, env); }],
  ];
  for (const [name, flood] of floods) {
    const { db, kv, world, env } = scene();
    const ip = freshIp();
    // The person, at the same address, with three flows begun before the flood: one about to come back from Roblox, one asked
    // about a new account, one that will say Go back.
    const comingBack = await startFlow(env, { ip });
    const asked = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { ip, confirm: false });
    const leaving = await signIn(env, world, { sub: SUB_B, username: 'Bob' }, { ip, confirm: false });

    const answers = [];
    for (let i = 0; i < 60; i += 1) answers.push((await flood(env, ip)).status);
    assert.equal(answers.includes(429), false, `${name}: the first sixty are answered, not refused`);
    const reads = kv.reads;
    const over = [(await flood(env, ip)).status, (await flood(env, ip)).status];
    assert.deepEqual(over, [429, 429], `${name}: and the junk is bounded: the sixty-first is refused`);
    assert.equal(kv.reads, reads, `${name}: without a KV read`);

    // Now the person's own, real requests from that very address.
    const back = await finish(env, world, comingBack, { sub: '2468024', username: 'Cara' });
    assert.equal(back.res.status, 302, `${name}: the callback of the flow that was already at Roblox`);
    const question = await redeemFor(env, asked.res, { ip });
    assert.equal(question.status, 200, `${name}: redeem`);
    assert.equal((await question.json()).confirm, 'new-account');
    assert.equal((await createRequest(env, { cookie: handleCookieOf(asked.res), ip })).status, 200, `${name}: create (Continue)`);
    const signedIn = await redeemFor(env, asked.res, { ip });
    assert.equal(signedIn.status, 200, `${name}: redeem after Continue`);
    assert.match((await signedIn.json()).token_hash, /^ht_/);
    assert.equal((await declineRequest(env, { cookie: handleCookieOf(leaving.res), ip })).status, 200, `${name}: decline (Go back)`);
    db.close();
  }
});

test('STRAYS AT /create AND /decline ARE COUNTED, each in the handle routes’ own stray bucket: it bounds them and costs no read once spent, and it is neither the callback’s bucket nor the junk bucket, nor ever a real flow’s', async () => {
  const random = () => randomBytes(32).toString('base64url');
  for (const [name, post] of [['create', createRequest], ['decline', declineRequest]]) {
    const { db, kv, world, env } = scene();
    const ip = freshIp();
    const waiting = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { ip, confirm: false });
    const waitingKey = `roblox-oauth:handle:${handleCookieOf(waiting.res).split('=')[1]}`;

    // Sixty well-formed handles that nobody holds, offered to this one route: each is read, found wanting and answered.
    const reads0 = kv.reads;
    const answers = [];
    for (let i = 0; i < 60; i += 1) answers.push((await post(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status);
    assert.deepEqual(answers, Array(60).fill(400), `${name}: sixty strays are answered`);
    assert.equal(kv.reads - reads0, 60, `${name}: each cost one read`);

    // The allowance is spent, and it is the handle routes' one allowance: all three kinds are refused now, with no read.
    const before = kv.reads;
    for (const [kind, other] of [['redeem', redeemRequest], ['create', createRequest], ['decline', declineRequest]]) {
      assert.equal((await other(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status, 429, `${name} flood, then a stray at ${kind}`);
    }
    assert.equal(kv.reads, before, `${name}: and none of them read KV`);
    // A real handle from that address is refused too until the minute is out, and nothing of it is spent.
    const held = await redeemFor(env, waiting.res, { ip });
    assert.equal(held.status, 429, `${name}: the person’s own redeem waits`);
    assert.equal(held.headers.getSetCookie().length, 0, `${name}: and its cookie is not cleared`);
    assert.equal(kv.rows.has(waitingKey), true, `${name}: and the held first sight is not deleted`);

    // The other two buckets are not this route's: a stray state with its cookie, and a request with no cookie, are still answered.
    const state = random();
    assert.equal((await hit(`${PROD}/auth/roblox/callback?code=x&state=${state}`, { headers: { 'CF-Connecting-IP': ip, Cookie: `${STATE_C}=${state}` } }, env)).status, 400, `${name}: the callback's stray bucket is untouched`);
    assert.equal((await post(env, { ip })).status, 400, `${name}: so is the junk bucket (own Origin, no cookie)`);
    // Another address is not the flood's business, and a minute on the first one's flow goes through.
    const other = await signIn(env, world, { sub: SUB_B, username: 'Bob' }, { ip: freshIp(), confirm: false });
    assert.equal((await redeemFor(env, other.res, { ip: other.flow.ip })).status, 200);
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      assert.equal((await redeemFor(env, waiting.res, { ip })).status, 200, `${name}: a minute on, the held first sight is still there`);
    } finally {
      Date.now = realNow;
    }
    db.close();
  }
});

test('A REFUSED HANDLE ROUTE TOUCHES NOTHING OF THE PERSON’S: no Set-Cookie line (so their handle cookie is not cleared) and the held record is byte for byte as it was, for redeem, create and decline, whatever the refusal', async () => {
  const random = () => randomBytes(32).toString('base64url');
  const routes = [['redeem', redeemRequest], ['create', createRequest], ['decline', declineRequest]];
  // [what is refused, how to make it happen, the status that comes back]. `held`: what waits behind the handle.
  const refusals = [
    ['another origin', 'pending', (post, e) => post(e.env, { cookie: e.cookie, ip: e.ip, origin: 'https://evil.example' }), 403],
    ['no Origin', 'pending', (post, e) => post(e.env, { cookie: e.cookie, ip: e.ip, origin: '' }), 403],
    ['a secret missing', 'pending', (post, e) => { delete e.env.SUPABASE_SECRET_KEY; return post(e.env, { cookie: e.cookie, ip: e.ip }); }, 503],
    ['the handle’s own allowance spent', 'pending', async (post, e) => { for (let i = 0; i < 5; i += 1) await redeemRequest(e.env, { cookie: e.cookie, ip: e.ip }); return post(e.env, { cookie: e.cookie, ip: e.ip }); }, 429],
    ['the address’s stray allowance spent', 'pending', async (post, e) => { for (let i = 0; i < 60; i += 1) await redeemRequest(e.env, { ip: e.ip, cookie: `${HANDLE_C}=${random()}` }); return post(e.env, { cookie: e.cookie, ip: e.ip }); }, 429],
    ['a sign-in that is not a waiting first sight (Continue and Go back)', 'ready', (post, e) => post(e.env, { cookie: e.cookie, ip: e.ip }), 400, ['create', 'decline']],
  ];
  for (const [what, held, refuse, status, only] of refusals) {
    for (const [name, post] of routes) {
      if (only && !only.includes(name)) continue;
      const { db, kv, world, env } = scene();
      const ip = freshIp();
      if (held === 'ready') await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { ip });     // so the next sign-in of that account is a returning one
      const signed = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { ip, confirm: held === 'ready' });
      const cookie = handleCookieOf(signed.res);
      const key = `roblox-oauth:handle:${cookie.split('=')[1]}`;
      const record = kv.rows.get(key);
      assert.ok(record, `${what} / ${name}: something is held`);
      assert.equal('pending' in JSON.parse(record), held === 'pending', `${what} / ${name}: the held record is the one the case says`);

      const refused = await refuse(post, { env, cookie, ip });
      assert.equal(refused.status, status, `${what} / ${name}: refused`);
      assert.equal(refused.headers.getSetCookie().length, 0, `${what} / ${name}: no Set-Cookie at all, so the person's handle cookie is left in their browser`);
      assert.equal(kv.rows.get(key), record, `${what} / ${name}: the held record is untouched`);
      assert.equal(world.sb.createCalls, held === 'ready' ? 1 : 0, `${what} / ${name}: nothing was made`);

      // ... and the person, with the same cookie, carries on: the secret back, a minute on.
      env.SUPABASE_SECRET_KEY = SB_SECRET;
      const realNow = Date.now;
      Date.now = () => realNow() + 61_000;
      try {
        const after = await redeemRequest(env, { cookie, ip });
        assert.equal(after.status, 200, `${what} / ${name}: the person's own redeem still answers`);
        const answer = await after.json();
        assert.equal(held === 'pending' ? answer.confirm : answer.token_hash?.slice(0, 3), held === 'pending' ? 'new-account' : 'ht_', `${what} / ${name}: with what was held`);
      } finally {
        Date.now = realNow;
      }
      db.close();
    }
  }
});

/**
 * RFC 6265 section 5.1.4, the rule a browser applies before it sends a cookie: the cookie-path and the request-path are identical, or the
 * cookie-path is a prefix of the request-path and either ends in "/" or is followed in the request-path by "/".
 */
function pathMatches(cookiePath, requestPath) {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/';
}
const pathAttrOf = (line) => /;\s*Path=([^;]*)/i.exec(line)?.[1];

test('THE BROWSER’S PATH MATCH (RFC 6265 5.1.4): the handle cookie reaches redeem, create and decline, and the state cookie reaches the callback, in production and on the dev origin, and a clearing line has the path it must have to delete them', async () => {
  // the rule itself, on cases whose answers are known
  for (const [cookiePath, requestPath, expected] of [
    ['/', '/auth/roblox/create', true], ['/auth/roblox', '/auth/roblox/create', true], ['/auth/roblox/', '/auth/roblox/create', true],
    ['/auth/roblox/redeem', '/auth/roblox/create', false], ['/auth/roblox/redeem', '/auth/roblox/redeem', true],
    ['/auth/roblox', '/auth/robloxx', false], ['/auth/roblox/', '/auth/roblox', false], ['/auth/roblox/', '/api/me/export', false],
  ]) assert.equal(pathMatches(cookiePath, requestPath), expected, `${cookiePath} against ${requestPath}`);

  const HANDLE_ROUTES = ['/auth/roblox/redeem', '/auth/roblox/create', '/auth/roblox/decline'];
  const clearedLine = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`) && /; Max-Age=0(;|$)/.test(c));
  const liveLine = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`) && !/; Max-Age=0(;|$)/.test(c));

  // PRODUCTION: the real app, the __Host- names. A __Host- cookie has Path=/, which matches everything.
  {
    const { db, world, env } = scene();
    const flow = await startFlow(env);
    assert.equal(pathMatches(pathAttrOf(flow.setCookie), '/auth/roblox/callback'), true, 'production: the state cookie reaches the callback');
    const done = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
    const live = liveLine(done.res, HANDLE_C);
    for (const route of HANDLE_ROUTES) assert.equal(pathMatches(pathAttrOf(live), route), true, `production: the handle cookie reaches ${route}`);
    assert.equal(pathAttrOf(clearedLine(done.res, STATE_C)), pathAttrOf(flow.setCookie), 'production: the state cookie is cleared on the path it was set on');
    const declined = await declineRequest(env, { cookie: handleCookieOf(done.res) });
    assert.equal(pathAttrOf(clearedLine(declined, HANDLE_C)), pathAttrOf(live), 'production: the handle cookie is cleared on the path it was set on');
    db.close();
  }

  // THE DEV ORIGIN: the bare names, the narrow paths, and a mini cookie jar that sends a cookie to a route only when the browser would.
  {
    const { db, world, env } = scene();
    const routes = R.robloxOAuthRoutes(() => false);                      // index.ts redirects plain http, so the routes are driven directly
    const asBrowser = (setCookieLine, route, init = {}) => {
      const sent = pathMatches(pathAttrOf(setCookieLine), route);
      return routes.request(`${DEV}${route.replace('/auth/roblox', '')}`, { method: 'POST', headers: { Origin: DEV, ...(sent ? { Cookie: setCookieLine.split(';')[0] } : {}), ...init.headers } }, env);
    };
    const cameBack = async (sub, username) => {
      const start = await routes.request(`${DEV}/start`, {}, env);
      const stateLine = start.headers.getSetCookie()[0];
      assert.equal(pathMatches(pathAttrOf(stateLine), '/auth/roblox/callback'), true, 'dev: the state cookie reaches the callback');
      const auth = new URL(start.headers.get('Location'));
      const state = auth.searchParams.get('state');
      const code = world.roblox.issueCode({ sub, username, challenge: auth.searchParams.get('code_challenge'), redirectUri: `${DEV}/auth/roblox/callback` });
      const callback = await routes.request(`${DEV}/callback?code=${code}&state=${state}`, { headers: { Cookie: `rbx_oauth_state=${state}` } }, env);
      assert.equal(callback.status, 302);
      assert.equal(pathAttrOf(clearedLine(callback, 'rbx_oauth_state')), pathAttrOf(stateLine), 'dev: the state cookie is cleared on the path it was set on');
      return liveLine(callback, 'rbx_oauth_handle');
    };

    const a = await cameBack(SUB_A, 'Dev');
    for (const route of HANDLE_ROUTES) assert.equal(pathMatches(pathAttrOf(a), route), true, `dev: the handle cookie reaches ${route}`);
    for (const outside of ['/auth/roblox', '/auth/robloxx/create', '/api/me/export', '/app/auth/roblox', '/']) assert.equal(pathMatches(pathAttrOf(a), outside), false, `dev: and not ${outside}`);
    // the person's whole first sight, with the cookie going only where the browser would send it
    assert.equal((await (await asBrowser(a, '/auth/roblox/redeem')).json()).confirm, 'new-account', 'dev: redeem asks');
    assert.equal((await asBrowser(a, '/auth/roblox/create')).status, 200, 'dev: Continue (create) is sent the cookie and is answered');
    const redeemed = await asBrowser(a, '/auth/roblox/redeem');
    assert.equal(redeemed.status, 200);
    assert.match((await redeemed.json()).token_hash, /^ht_/);
    assert.equal(pathAttrOf(clearedLine(redeemed, 'rbx_oauth_handle')), pathAttrOf(a), 'dev: the handle cookie is cleared on the path it was set on');

    // Go back on the dev origin, and the clearing line it sends
    const b = await cameBack(SUB_B, 'DevBob');
    const declined = await asBrowser(b, '/auth/roblox/decline');
    assert.equal(declined.status, 200, 'dev: Go back (decline) is sent the cookie and is answered');
    assert.equal(pathAttrOf(clearedLine(declined, 'rbx_oauth_handle')), pathAttrOf(b), 'dev: and clears it on the path it was set on');
    db.close();
  }
});

/* ======================================================================================================
 * OWNER-UPDATE LANE, FIX CYCLE 1: a wiped account stays reachable, a rename is wiped too, a deletion ends with the sign-in,
 * and the daily check says when it did not do its job. Every test here has a red-first proof in planning/proof/M2/LEGAL-CLAIMS.md section 10.
 * ==================================================================================================== */

const wipedScene = async (extra) => {
  const s = await connected(extra);
  s.world.roblox.removeApp(SUB_A);
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped', 'POSITIVE CONTROL: the grant is lost and wiped');
  return s;
};
const pointerRows = (s) => rowsOf(s.db, 'select code, user_id from roblox_wiped').map((r) => ({ ...r }));
const bearerOf = (s) => settingsBearer(s);
const deleteAsBearer = (s, bearer = bearerOf(s)) => hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...bearer.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
const exportAsBearer = (s, bearer = bearerOf(s)) => hit(`${PROD}/api/me/export`, bearer, s.env);
const sbCalls = (s) => s.world.calls.filter((c) => c.url.startsWith(SB)).length;

test('A WIPED ROBLOX-ONLY ACCOUNT STAYS REACHABLE: the in-app re-authentication finds it by its one-way code (it makes nothing, no ghost), links it again, and then export and delete pass the gate', async () => {
  ROWS.clear();
  const s = await wipedScene();
  // The wipe left the account findable: a pointer from the one-way code to the account, and nothing that holds the Roblox id.
  assert.deepEqual(pointerRows(s), [{ code: CODE_OF(SUB_A), user_id: s.userId }]);
  assert.equal(identityRows(s).length, 0, 'the link is gone, which is what used to lock this account out of its own export and deletion');
  assert.equal(JSON.stringify(pointerRows(s)).includes(SUB_A), false, 'the pointer is not the Roblox id');
  for (const [what, refused] of [['export', await exportAsBearer(s)], ['delete', await deleteAsBearer(s)]]) {
    assert.equal(refused.status, 403, `${what}: a wiped Roblox-only account has not confirmed it is them`);
    assert.equal((await refused.json()).code, 'reauth_required', what);
  }
  assert.equal((await connectionOf(s)).reauthFresh, false);

  // THE RE-AUTHENTICATION, as the app's "sign in with Roblox again" button starts it.
  const users = s.world.sb.users.size;
  const creates = s.world.sb.createCalls;
  const revokes = s.world.roblox.revokeCalls.length;
  const again = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1 (renamed)' }, { reauth: 'export-data' });
  assert.equal(again.res.status, 302, 'the re-authentication is not refused, and the authorization Roblox just gave is not withdrawn');
  assert.equal(s.world.sb.users.size, users, 'no account was made');
  assert.equal(s.world.sb.createCalls, creates, 'and Auth was not asked to make one');
  assert.equal(s.world.sb.ghosts, 0, 'and no empty stranger was signed up at the address by asking for a link');
  assert.equal(s.world.roblox.revokeCalls.length, revokes, 'the new authorization is the one the link now holds');
  const link = identityRows(s);
  assert.equal(link.length, 1, 'the link is made again');
  assert.deepEqual([link[0].roblox_sub, link[0].user_id, link[0].username], [SUB_A, s.userId, 'Builder1 (renamed)']);
  assert.equal(typeof link[0].reauth_at, 'number', 'and carries the confirmation');
  assert.equal(s.row().version, 1, 'the new grant is stored');
  assert.equal(await C.openSecret({ CREDENTIAL_KEY: KEY_B64 }, s.row().sealed_refresh), s.world.roblox.lastRefreshIssued);
  assert.deepEqual(pointerRows(s), [], 'and the pointer has done its job');
  const redeemed = await (await redeemFor(s.env, again.res)).json();
  assert.equal(s.world.sb.links.get(redeemed.token_hash), s.userId, 'the sign-in token is for this account and nobody else');
  assert.equal(redeemed.next, '/settings?resume=export-data');
  assert.equal((await connectionOf(s)).reauthFresh, true, 'the Settings gate (the SPA) now lets the action through');

  // EXPORT, then DELETE, through the gate.
  const exported = await exportAsBearer(s);
  assert.equal(exported.status, 200, 'export passes the gate');
  assert.equal(JSON.parse(await exported.text()).user.id, s.userId);
  const erased = await deleteAsBearer(s);
  assert.equal(erased.status, 200, 'delete passes the gate');
  const receipt = await erased.json();
  assert.equal(receipt.complete, true, JSON.stringify(receipt.steps.filter((x) => x.status === 'failed')));
  assert.equal(receipt.accountRemoved, true);
  assert.deepEqual(s.world.sb.deleteCalls, [s.userId]);
  assert.equal(s.world.roblox.revokeCalls.at(-1), s.world.roblox.lastRefreshIssued, 'the Roblox grant the re-authentication gave is withdrawn by the deletion');
  assert.equal(identityRows(s).length, 0);
  s.db.close();
});

test('THE RE-AUTHENTICATION OF A WIPED ACCOUNT NEEDS THE SAME PROOF AS A SIGN-IN, and a Roblox account that cannot prove it is still refused, its authorization withdrawn, and nothing made', async () => {
  const refusals = [
    ['a Roblox account that no wiped account belongs to', () => {}, 'SUB_B'],
    ['a pointer whose account holds the code of ANOTHER Roblox account', (s) => { supaUser(s).app_metadata = { roblox_code: CODE_OF('999') }; }, 'SUB_A'],
    ['a pointer whose account holds no code', (s) => { supaUser(s).app_metadata = {}; }, 'SUB_A'],
    ['a pointer whose account holds a code that is not a string', (s) => { supaUser(s).app_metadata = { roblox_code: 12345 }; }, 'SUB_A'],
    ['a pointer whose account is at somebody else\'s address', (s) => { supaUser(s).email = 'someone@example.com'; }, 'SUB_A'],
    ['a pointer whose account is at the keyed address of ANOTHER Roblox account', (s) => { supaUser(s).email = SYNTHETIC(SUB_B); }, 'SUB_A'],
  ];
  for (const [what, tamper, who] of refusals) {
    const s = await wipedScene();
    tamper(s);
    const users = s.world.sb.users.size;
    const pointers = pointerRows(s);
    const revokes = s.world.roblox.revokeCalls.length;
    const handles = kvHandles(s.env).length;
    LOGS.length = 0;
    const attempt = await signIn(s.env, s.world, { sub: who === 'SUB_A' ? SUB_A : SUB_B, username: 'Somebody' }, { reauth: 'delete-account' });
    assert.equal(attempt.res.status, 403, `${what}: refused`);
    assert.ok((await attempt.res.text()).includes(GENERIC), `${what}: with the one generic sentence`);
    assert.equal(handleCookieOf(attempt.res), '', `${what}: no handle`);
    assert.equal(kvHandles(s.env).length, handles, `${what}: nothing new waits in KV`);
    assert.equal(s.world.roblox.revokeCalls.length, revokes + 1, `${what}: the authorization it was just given is withdrawn`);
    assert.equal(identityRows(s).length, 0, `${what}: nothing was linked`);
    assert.equal(s.world.sb.users.size, users, `${what}: no account was made`);
    assert.equal(s.world.sb.createCalls, 1, `${what}: and Auth was not asked to make one (the one call is the first sign-up)`);
    assert.equal(s.world.sb.ghosts, 0, `${what}: no ghost`);
    assert.deepEqual(pointerRows(s), pointers, `${what}: the pointer is left as it was`);
    assert.ok(LOGS.includes('[roblox-oauth] reauthentication without a linked account'), what);
    assert.equal((await exportAsBearer(s)).status, 403, `${what}: and the gate is still shut`);
    s.db.close();
  }
});

test('THE RE-AUTHENTICATION OF A ROBLOX ACCOUNT NOBODY HAS SEEN ASKS SUPABASE NOTHING: it is found by the pointer, so there is no link requested for an address that may not exist', async () => {
  const s = await wipedScene();
  const before = sbCalls(s);
  const stranger = await signIn(s.env, s.world, { sub: SUB_B, username: 'Stranger' }, { reauth: 'export-data' });
  assert.equal(stranger.res.status, 403);
  assert.equal(sbCalls(s), before, 'Supabase was not asked anything for a Roblox account that no wiped account belongs to');
  assert.equal(s.world.sb.ghosts, 0);
  s.db.close();
});

test('THE POINTER IS STALE OR UNREADABLE: an account Auth no longer has is refused and its pointer dropped, and an Auth that cannot be reached is a 502 that makes and keeps nothing', async () => {
  const gone = await wipedScene();
  gone.world.sb.users.delete(gone.userId);
  const refused = await signIn(gone.env, gone.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'export-data' });
  assert.equal(refused.res.status, 403);
  assert.deepEqual(pointerRows(gone), [], 'a pointer to an account that is gone is dropped');
  assert.equal(gone.world.sb.ghosts, 0);
  gone.db.close();

  const down = await wipedScene();
  const inner = down.world.fetch;
  globalThis.fetch = async (u, i = {}) => { if (/\/auth\/v1\/admin\/users\/[^/]+$/.test(String(u)) && (i.method ?? 'GET') === 'GET') throw new TypeError('network down'); return inner(u, i); };
  const attempt = await signIn(down.env, down.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'export-data' });
  assert.equal(attempt.res.status, 502, 'an account that cannot be looked at is neither adopted nor refused as a stranger');
  assert.equal(identityRows(down).length, 0);
  assert.equal(pointerRows(down).length, 1, 'and the pointer is kept for the next try');
  down.db.close();
});

test('SIGNING IN WITH ROBLOX AGAIN (not a re-authentication) also ends the pointer: the account is linked and nothing stale is left', async () => {
  const s = await wipedScene();
  assert.equal(pointerRows(s).length, 1);
  const back = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(back.res.status, 302);
  assert.equal(userIdOf(s.db, SUB_A), s.userId);
  assert.deepEqual(pointerRows(s), []);
  s.db.close();
});

test('A WIPE LEAVES NO POINTER when a sign-in landed meanwhile and kept its new grant, and a wipe that could not finish leaves none either', async () => {
  const kept = await connected();
  kept.world.roblox.removeApp(SUB_A);
  kept.world.sb.failUpdate = 500;
  assert.equal((await R.refreshRobloxAccessToken(kept.env, kept.userId)).lost, 'kept');
  assert.equal(rowsOf(kept.db, "select name from sqlite_master where name = 'roblox_wiped'").length, 1, 'POSITIVE CONTROL: the table exists, so an empty result means no pointer, not no table');
  assert.deepEqual(pointerRows(kept), [], 'a wipe that did not finish wrote no pointer');
  assert.equal(identityRows(kept).length, 1);
  kept.db.close();

  const raced = await connected();
  raced.world.roblox.removeApp(SUB_A);
  raced.world.sb.onUpdate = () => {
    // A new sign-in lands between the Auth update and the batch: the token row is replaced, so the batch deletes nothing and writes no pointer.
    raced.db.raw.prepare('update roblox_oauth_tokens set version = version + 1, generation = ? where user_id = ?').run('new-grant', raced.userId);
  };
  const result = await R.refreshRobloxAccessToken(raced.env, raced.userId);
  assert.notEqual(result.lost, 'wiped');
  assert.deepEqual(pointerRows(raced), [], 'a grant that was replaced meanwhile leaves no pointer');
  assert.equal(identityRows(raced).length, 1);
  raced.db.close();
});

/* ---------------------------------------------------------- a rename does not keep the old name --- */

const roblox2 = (s, sub, username) => signIn(s.env, s.world, { sub, username });
const namesIn = (s) => JSON.stringify([supaUser(s), s.world.sb.profiles.get(s.userId)]);

test('RENAME THEN WIPE: the display name holds the username the account was MADE with, so the wipe clears that one too, in Auth and in the profile, whatever the account is called on Roblox now', async () => {
  const s = await connected();
  assert.equal(identityRows(s)[0].created_username, 'Builder1', 'the name the account was made with is recorded once');
  await roblox2(s, SUB_A, 'Builder1Renamed');
  await roblox2(s, SUB_A, 'BuilderThird');
  const row = identityRows(s)[0];
  assert.equal(row.username, 'BuilderThird', 'the link follows Roblox');
  assert.equal(row.created_username, 'Builder1', 'and the name the account was made with is not overwritten by a rename');
  assert.equal(supaUser(s).user_metadata.display_name, 'Builder1', 'POSITIVE CONTROL: the display name is still the first username, which is no longer the current one');
  assert.equal(profileName(s), 'Builder1');
  s.world.roblox.removeApp(SUB_A);
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped');
  assert.equal(supaUser(s).user_metadata.display_name, undefined, 'the old Roblox username is cleared from the Auth display name');
  assert.equal(profileName(s), null, 'and from the profile row');
  for (const name of ['Builder1', 'Builder1Renamed', 'BuilderThird', SUB_A]) assert.equal(namesIn(s).includes(name), false, `${name} is still on the account`);
  assert.deepEqual(s.world.sb.profilePatches.map((p) => p.search).sort(), [`?id=eq.${s.userId}&display_name=eq.Builder1`, `?id=eq.${s.userId}&display_name=eq.BuilderThird`].sort(), 'one request per Roblox name the display name could hold, each for this person only');
  assert.equal(identityRows(s).length, 0);
  s.db.close();
});

test('RENAME THEN WIPE leaves a name the person chose: only a Roblox username of this account is cleared, in Auth and in the profile', async () => {
  const s = await connected();
  await roblox2(s, SUB_A, 'Builder1Renamed');
  supaUser(s).user_metadata.display_name = 'My Own Name';
  s.world.sb.profiles.get(s.userId).display_name = 'My Own Name';
  s.world.roblox.removeApp(SUB_A);
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped');
  assert.equal(supaUser(s).user_metadata.display_name, 'My Own Name');
  assert.equal(profileName(s), 'My Own Name');
  assert.equal(JSON.stringify(s.world.sb.updateCalls.map((c) => c.body)).includes('user_metadata'), false, 'the display name was not even sent for clearing');
  s.db.close();
});

test('RENAME THEN WIPE clears each store on its own: a person who changed only the profile name keeps it, and the Auth name that is still the old Roblox username goes', async () => {
  const s = await connected();
  await roblox2(s, SUB_A, 'Builder1Renamed');
  s.world.sb.profiles.get(s.userId).display_name = 'Profile Name I Chose';
  s.world.roblox.removeApp(SUB_A);
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).lost, 'wiped');
  assert.equal(supaUser(s).user_metadata.display_name, undefined);
  assert.equal(profileName(s), 'Profile Name I Chose');
  s.db.close();
});

test('A SIGN-UP THAT STOPPED HALFWAY and was finished after a rename remembers the name the account was made with (read from the account), and an account adopted by its code remembers none', async () => {
  const half = scene();
  const orphan = { id: randomUUID(), email: SYNTHETIC(SUB_A), app_metadata: { roblox_sub: SUB_A }, user_metadata: { display_name: 'FirstTry' } };
  half.world.sb.users.set(orphan.id, orphan);
  half.world.sb.profiles.set(orphan.id, { display_name: 'FirstTry' });
  assert.equal((await signIn(half.env, half.world, { sub: SUB_A, username: 'SecondTry' })).res.status, 302);
  const made = rowsOf(half.db, 'select username, created_username from roblox_identities')[0];
  assert.deepEqual([made.username, made.created_username], ['SecondTry', 'FirstTry']);
  half.db.close();

  const s = await wipedScene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(identityRows(s)[0].created_username, null, 'the wipe cleared the Roblox name from the account, so there is none to remember');
  s.db.close();
});

test('A TABLE MADE BEFORE `created_username` EXISTED GAINS THE COLUMN and keeps its rows', async () => {
  const db = d1();
  db.raw.exec('create table roblox_identities(roblox_sub text primary key, user_id text not null, username text not null, created_at text not null, reauth_at integer)');
  db.raw.prepare('insert into roblox_identities values (?, ?, ?, ?, ?)').run(SUB_A, 'u-1', 'Old Row', 'then', null);
  await R.ensureRobloxOAuthTables({ CORPUS: db.CORPUS });
  const cols = rowsOf({ raw: db.raw }, 'pragma table_info(roblox_identities)').map((c) => c.name);
  assert.ok(cols.includes('created_username'), cols.join(','));
  assert.equal(rowsOf({ raw: db.raw }, 'select username, created_username from roblox_identities')[0].username, 'Old Row');
  await R.ensureRobloxOAuthTables({ CORPUS: db.CORPUS });        // and a second run is not an error
  db.close();
});

/* --------------------------------- a deletion ends with the sign-in, and a failure keeps the account runnable --- */

test('AUTH CANNOT REMOVE THE SIGN-IN AFTER THE LINK WAS SWEPT: the link is put back, and a retry through the re-authentication finishes the deletion', async () => {
  ROWS.clear();
  const s = await connected();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
  const stamp = identityRows(s)[0].reauth_at;
  s.world.sb.failDelete = 500;
  const first = await deleteAsBearer(s);
  assert.equal(first.status, 207);
  const receipt = await first.json();
  assert.equal(receipt.accountRemoved, false);
  assert.deepEqual(s.world.sb.deleteCalls, [s.userId], 'the sign-in was asked to go, once, and only after everything before it');
  const link = receipt.steps.find((x) => x.target === 'roblox_identities');
  assert.equal(link.status, 'failed', 'a link that was swept and put back is not reported as removed');
  assert.match(receipt.summary, /Your sign-in is still there so that you can run the deletion again/, 'a link that WAS put back leaves the ordinary advice: run it again');
  assert.match(link.detail, /Put back on purpose/);
  assert.equal(identityRows(s).length, 1, 'the link is back');
  assert.equal(identityRows(s)[0].reauth_at, stamp, 'with the confirmation it had');
  assert.equal(rowsOf(s.db, 'select count(*) as n from roblox_oauth_tokens where user_id = ?', s.userId)[0].n, 0, 'the token went and stays gone: a retry never needs Roblox again');

  // INSIDE THE WINDOW: the retry is not asked to confirm again.
  s.world.sb.failDelete = null;
  s.db.raw.prepare('update roblox_identities set reauth_at = ? where user_id = ?').run(Date.now() - REAUTH_WINDOW_MS - 1000, s.userId);
  assert.equal((await deleteAsBearer(s)).status, 403, 'ten minutes on, the account is asked to confirm it is them');
  // ...and it CAN, through the app's own re-authentication, because the link was put back.
  const again = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
  assert.equal(again.res.status, 302, 'the re-authentication is answered');
  const done = await deleteAsBearer(s);
  assert.equal(done.status, 200);
  const finished = await done.json();
  assert.equal(finished.complete, true);
  assert.equal(finished.accountRemoved, true);
  assert.deepEqual(s.world.sb.deleteCalls, [s.userId, s.userId]);
  assert.equal(identityRows(s).length, 0);
  s.db.close();
});

test('A WIPED ACCOUNT WHOSE SIGN-IN CANNOT BE REMOVED gets its pointer back too (the account has since been given an email address, so no Roblox confirmation is asked), and the retry finishes and leaves nothing', async () => {
  ROWS.clear();
  const s = await wipedScene();
  const withEmail = as(s.userId, 'person@example.com');
  assert.equal(pointerRows(s).length, 1, 'POSITIVE CONTROL: the account is in the wiped state');
  s.world.sb.failDelete = 500;
  const first = await deleteAsBearer(s, withEmail);
  assert.equal(first.status, 207);
  const link = (await first.json()).steps.find((x) => x.target === 'roblox_identities');
  assert.equal(link.status, 'failed');
  assert.match(link.detail, /Put back on purpose/);
  assert.deepEqual(pointerRows(s), [{ code: CODE_OF(SUB_A), user_id: s.userId }], 'the pointer is back, so a re-authentication can still find this account');
  s.world.sb.failDelete = null;
  const done = await (await deleteAsBearer(s, withEmail)).json();
  assert.equal(done.complete, true);
  assert.equal(done.accountRemoved, true);
  assert.deepEqual(pointerRows(s), [], 'and the run that removes the sign-in leaves no pointer');
  s.db.close();
});

test('THE LINK THAT CANNOT BE PUT BACK is said, not hidden: the receipt says contact support, and the account cannot confirm itself until support finishes it', async () => {
  ROWS.clear();
  const s = await connected();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
  s.world.sb.failDelete = 500;
  const real = s.env.CORPUS;
  s.env.CORPUS = { ...real, prepare: (sql) => { if (/^insert into roblox_identities/.test(sql)) throw new Error('D1 said no'); return real.prepare(sql); } };
  const first = await deleteAsBearer(s);
  assert.equal(first.status, 207);
  const receipt = await first.json();
  const link = receipt.steps.find((x) => x.target === 'roblox_identities');
  assert.equal(link.status, 'failed');
  assert.match(link.detail, /could not be put back/);
  assert.match(link.detail, /Contact support/);
  assert.match(receipt.summary, /could not be put back: contact support to finish the deletion/, 'the headline does not tell this person to run it again: that cannot work');
  assert.doesNotMatch(receipt.summary, /so that you can run the deletion again/);
  assert.equal(receipt.accountRemoved, false);
  assert.equal(identityRows(s).length, 0, 'the link is gone');
  s.env.CORPUS = real;
  assert.equal((await deleteAsBearer(s)).status, 403, 'and the account cannot pass the gate: this is the one case that needs support');
  s.db.close();
});

test('A LINK THAT CANNOT BE LOOKED AT BEFORE THE DELETION IS NOT SWEPT, and the sign-in is not removed: the step says so, and the account runs the deletion again', async () => {
  ROWS.clear();
  const s = await connected();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' }, { reauth: 'delete-account' });
  const real = s.env.CORPUS;
  s.env.CORPUS = { ...real, prepare: (sql) => { if (/^select roblox_sub, user_id, username, created_at, reauth_at/.test(sql)) throw new Error('D1 said no'); return real.prepare(sql); } };
  const first = await deleteAsBearer(s);
  assert.equal(first.status, 207);
  const receipt = await first.json();
  const link = receipt.steps.find((x) => x.target === 'roblox_identities');
  assert.equal(link.status, 'failed');
  assert.match(link.detail, /could not be looked at/);
  assert.equal(identityRows(s).length, 1, 'the link was not swept');
  assert.deepEqual(s.world.sb.deleteCalls, [], 'and the sign-in was not asked to go');
  s.env.CORPUS = real;
  assert.equal((await deleteAsBearer(s)).status, 200, 'the next run finishes it');
  s.db.close();
});

/* ---------------------------------------- the daily check says when it did not do its job --- */

const NIGHT = { scheduledTime: Date.now(), cron: '0 3 * * *' };
const errorScopes = (admin) => admin.events.filter((e) => e.kind === 'error' && /^roblox-grants:/.test(e.scope ?? '')).map((e) => e.scope).sort();
const grantAudit = (admin) => admin.events.find((e) => e.kind === 'audit' && e.action === 'roblox_grant_check');

test('A NIGHT WHERE ROBLOX ANSWERS AND NO ANSWER CAN BE ACTED ON IS NOT A GOOD NIGHT: introspection answering 400 invalid_request through the real cron is allowed:false with its own error event', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  s.world.roblox.introspect = { status: 400, body: { error: 'invalid_request' } };
  await app.scheduled(NIGHT, s.env, ctx);
  const audit = grantAudit(admin);
  assert.equal(audit.allowed, false, 'a check that never worked read as a healthy night');
  assert.equal(audit.subject, 'checked=1 active=0 lost=0 kept_for_retry=0 unknown=1 unusable=1 disagreed=0 unreadable=0 unchecked=0');
  assert.deepEqual(errorScopes(admin), ['roblox-grants:inconclusive']);
  assert.equal(s.row() !== undefined, true, 'and nothing was wiped for it');
  s.db.close();
});

test('A NIGHT WHERE EVERY GRANT WENT UNANSWERED (Roblox down: 5xx) is inconclusive too, but one unanswered grant among answered ones is an outage that passes', async () => {
  const down = adminRecorder();
  const s = await connected({ ADMIN_DO: down.ns });
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  s.world.roblox.introspect = { status: 503, body: {} };
  await app.scheduled(NIGHT, s.env, ctx);
  assert.equal(grantAudit(down).allowed, false);
  assert.deepEqual(errorScopes(down), ['roblox-grants:inconclusive']);
  s.db.close();

  const some = adminRecorder();
  const t = await connected({ ADMIN_DO: some.ns });
  await signIn(t.env, t.world, { sub: SUB_B, username: 'Bob' });
  const inner = t.world.roblox;
  let n = 0;
  const original = inner.introspect;
  // The first token asked about gets a 503, the second the truth.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, i = {}) => (String(u).includes('/token/introspect') && (n += 1) === 1 ? new Response('{}', { status: 503 }) : realFetch(u, i));
  try {
    await app.scheduled(NIGHT, t.env, ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(inner.introspect, original);
  assert.equal(grantAudit(some).allowed, true, 'one unanswered grant among answered ones is an outage that passes');
  assert.deepEqual(errorScopes(some), []);
  assert.match(grantAudit(some).subject, /checked=2 active=1 .* unknown=1 unusable=0 /);
  t.db.close();
});

test('ONE GRANT WHOSE INTROSPECTION IS REFUSED (a 4xx) AMONG ANSWERED ONES is inconclusive too: Roblox answered and the answer cannot be acted on, which is not an outage that passes', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  const realFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (u, i = {}) => (String(u).includes('/token/introspect') && (n += 1) === 1 ? new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }) : realFetch(u, i));
  try {
    await app.scheduled(NIGHT, s.env, ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.match(grantAudit(admin).subject, /checked=2 active=1 .* unknown=1 unusable=1 /, 'POSITIVE CONTROL: one answered, one refused: unknown is not every grant, so only the unusable count can flag this night');
  assert.equal(grantAudit(admin).allowed, false);
  assert.deepEqual(errorScopes(admin), ['roblox-grants:inconclusive']);
  s.db.close();
});

test('A TOKEN THAT CANNOT BE OPENED (a wrong CREDENTIAL_KEY) THROUGH THE REAL CRON is allowed:false with the unreadable error event, and nothing is asked of Roblox', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  s.env.CREDENTIAL_KEY = Buffer.alloc(32, 9).toString('base64');
  await app.scheduled(NIGHT, s.env, ctx);
  assert.equal(grantAudit(admin).allowed, false);
  assert.equal(grantAudit(admin).subject, 'checked=1 active=0 lost=0 kept_for_retry=0 unknown=0 unusable=0 disagreed=0 unreadable=1 unchecked=0');
  assert.deepEqual(errorScopes(admin), ['roblox-grants:unreadable']);
  assert.equal(s.world.roblox.introspectCalls.length, 0);
  s.db.close();
});

test('GRANTS THE RUN DID NOT REACH ARE NOT A GOOD NIGHT: with every grant answered active and nothing else wrong, the cron still records allowed:false and an unchecked error event', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  // 2,000 more grants that are perfectly healthy (each holds the real sealed token, which Roblox says is active): the only thing wrong with the night is that the run cannot reach them all.
  s.db.raw.prepare("insert into roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, generation, rotated_at, lease_until) select 'filler-' || n, (select sealed_refresh from roblox_oauth_tokens where user_id = ?), '1', 'openid profile', 1, 'g', 'now', null from (with recursive c(n) as (select 1 union all select n + 1 from c where n < 2000) select n from c)").run(s.userId);
  await app.scheduled(NIGHT, s.env, ctx);
  assert.equal(grantAudit(admin).subject, 'checked=2000 active=2000 lost=0 kept_for_retry=0 unknown=0 unusable=0 disagreed=0 unreadable=0 unchecked=1', 'POSITIVE CONTROL: nothing is wrong with the night except that it did not reach everybody');
  assert.equal(grantAudit(admin).allowed, false);
  assert.deepEqual(errorScopes(admin), ['roblox-grants:unchecked']);
  s.db.close();
});

test('A QUIET NIGHT IS STILL A GOOD ONE: every grant answered active is allowed:true with no roblox-grants error event (the positive control of the rules above)', async () => {
  const admin = adminRecorder();
  const s = await connected({ ADMIN_DO: admin.ns });
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  await app.scheduled(NIGHT, s.env, ctx);
  assert.equal(grantAudit(admin).allowed, true);
  assert.deepEqual(errorScopes(admin), []);
  s.db.close();
});

/* ---------------------------------------------- the two time guards, the clock, and the cursor --- */

/** A clock that moves `step` ms every time it is read: the whole run's notion of time, in the test's hands. */
const steppingClock = (start, step) => { let t = start - step; return () => (t += step); };

test('THE TIME BUDGET STOPS THE RUN: a clock that runs past the budget leaves the rest unchecked and says how many, and the budget the Worker runs with is the one that keeps the cron inside its wall-clock allowance', async () => {
  assert.ok(R.GRANT_CHECK_BUDGET_MS > 0 && R.GRANT_CHECK_BUDGET_MS <= 10 * 60_000, `the budget is ${R.GRANT_CHECK_BUDGET_MS}ms: more than ten minutes of a cron that has fifteen, and the rest of the night still has to run`);
  assert.ok(R.GRANT_CHECK_MAX >= 1 && R.GRANT_CHECK_MAX <= 5000);
  const s = await connected();
  for (const sub of ['11', '12', '13', '14']) await signIn(s.env, s.world, { sub, username: `U${sub}` });
  // The injected budget: each read of the clock moves it a second, the budget is 2.5 seconds, so three rows are reached and two are not.
  const report = await R.checkRobloxGrants(s.env, undefined, { clock: steppingClock(1_000_000, 1000), budgetMs: 2500 });
  assert.equal(report.checked + report.unchecked, 5);
  assert.ok(report.unchecked > 0 && report.checked > 0, JSON.stringify(report));
  assert.equal(s.world.roblox.introspectCalls.length, report.checked, 'Roblox was asked about the rows that were reached and no others');
  // The DEFAULT budget is applied when none is injected: a clock that jumps past it after the first reading leaves everything but the first row unchecked.
  const jumps = (() => { let calls = 0; return () => (calls++ < 2 ? 5_000_000 : 5_000_000 + R.GRANT_CHECK_BUDGET_MS + 1); })();
  s.world.roblox.introspectCalls.length = 0;
  const cut = await R.checkRobloxGrants(s.env, undefined, { clock: jumps });
  assert.ok(cut.unchecked >= 1, `the default budget did not stop the run: ${JSON.stringify(cut)}`);
  assert.equal(cut.checked + cut.unchecked, 5);
  s.db.close();
});

test('THE CAP STOPS THE RUN AND TOMORROW STARTS WHERE TONIGHT STOPPED: the rows past the cap are not the same rows every night, and every grant is reached', async () => {
  const s = await connected();
  const subs = ['21', '22', '23', '24', '25'];
  for (const sub of subs) await signIn(s.env, s.world, { sub, username: `U${sub}` });
  const total = rowsOf(s.db, 'select user_id from roblox_oauth_tokens order by user_id').map((r) => r.user_id);
  assert.equal(total.length, 6);
  const reached = [];
  for (let night = 0; night < 3; night += 1) {
    s.world.roblox.introspectCalls.length = 0;
    const report = await R.checkRobloxGrants(s.env, undefined, { max: 2 });
    assert.equal(report.checked, 2, `night ${night}: the cap`);
    assert.ok(report.unchecked >= 1, `night ${night}: and the rest is said to be unchecked`);
    reached.push(...s.world.roblox.introspectCalls.map((c) => c.token));
  }
  assert.equal(new Set(reached).size, 6, `three nights at a cap of two reach all six grants, in turn: ${reached.length} asked, ${new Set(reached).size} different`);
  // The cursor is cleared once a run reaches the end, so a table that fits starts from the beginning again.
  const full = await R.checkRobloxGrants(s.env);
  assert.equal(full.checked, 6);
  assert.equal(full.unchecked, 0);
  assert.equal(s.env.KV.rows.has(R.CHECK_CURSOR_KEY), false, 'a run that reached the end leaves no cursor');
  s.db.close();
});

test('A CURSOR THAT CANNOT BE READ OR KEPT does not stop the check: it starts from the beginning, as it did before there was one', async () => {
  const s = await connected();
  s.env.KV = { ...s.env.KV, get: async () => { throw new Error('KV down'); }, put: async () => { throw new Error('KV down'); }, delete: async () => { throw new Error('KV down'); } };
  const report = await R.checkRobloxGrants(s.env, undefined, { max: 1 });
  assert.deepEqual(report, COUNTS({ checked: 1, active: 1 }));
  s.db.close();
});

test('EVERY REFRESH THE CHECK MAKES IS GIVEN THE CLOCK OF THAT MOMENT: a grant reached minutes into the run takes a lease that is not already lapsed', async () => {
  const s = await connected();
  await signIn(s.env, s.world, { sub: SUB_B, username: 'Bob' });
  s.world.roblox.removeApp(SUB_A);
  s.world.roblox.removeApp(SUB_B);
  const leases = [];
  s.world.roblox.duringRefresh = async () => { leases.push(...rowsOf(s.db, 'select lease_until from roblox_oauth_tokens where lease_until is not null').map((r) => r.lease_until)); };
  const step = 5 * 60_000;
  const report = await R.checkRobloxGrants(s.env, undefined, { clock: steppingClock(10_000_000, step), budgetMs: 1e12 });
  assert.equal(report.lost, 2);
  assert.equal(leases.length, 2, 'each refresh held a lease while Roblox answered');
  assert.ok(leases[1] - leases[0] >= step, `the second lease (${leases[1]}) was written with the same clock as the first (${leases[0]}): a lease already in the past by real time is no lease`);
  // `now` stays what a test may pass: it is used as given.
  const t = await connected();
  t.world.roblox.removeApp(SUB_A);
  const seen = [];
  t.world.roblox.duringRefresh = async () => { seen.push(...rowsOf(t.db, 'select lease_until from roblox_oauth_tokens where lease_until is not null').map((r) => r.lease_until)); };
  await R.checkRobloxGrants(t.env, 123_456_789, { clock: steppingClock(10_000_000, 1000) });
  assert.deepEqual(seen, [123_456_789 + 30_000]);
  s.db.close();
  t.db.close();
});

// LINKING (Connect, 2026-10-08): a signed-in person links the Roblox account they use in Studio, through the same callback.
async function linkFlow(env, userId, returnTo = '/app/projects/fe440692-b64a-4f1b-9f45-b12237ed4a91') {
  const ticket = rand(24);
  await env.KV.put(`roblox-link-ticket:${ticket}`, JSON.stringify({ userId, returnTo }));
  const ip = freshIp();
  const res = await hit(`${PROD}/auth/roblox/start?link=${ticket}`, { headers: { 'CF-Connecting-IP': ip } }, env);
  const auth = new URL(res.headers.get('Location') ?? '', PROD);
  const cookie = (res.headers.getSetCookie().find((c) => c.startsWith(`${STATE_C}=`)) ?? '').split(';')[0];
  return { res, ticket, flow: { origin: PROD, ip, cookie, state: auth.searchParams.get('state'), challenge: auth.searchParams.get('code_challenge'), redirectUri: auth.searchParams.get('redirect_uri') } };
}

test('LINKING: a ticket links the Roblox account to the signed-in account, signs nobody in, and returns to the project with ?roblox=linked', async () => {
  const t = scene();
  const { flow, ticket } = await linkFlow(t.env, 'user-link-1');
  assert.equal(await t.env.KV.get(`roblox-link-ticket:${ticket}`), null, 'the ticket is one-time');
  const { res } = await finish(t.env, t.world, flow, { sub: '424242', username: 'builder' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/app/projects/fe440692-b64a-4f1b-9f45-b12237ed4a91?roblox=linked');
  assert.deepEqual(rowsOf(t.db, 'select user_id from studio_roblox_accounts where roblox_sub = ?', '424242').map((r) => r.user_id), ['user-link-1']);
  assert.equal(identityCount(t.db), 0, 'linking for Studio makes no sign-in identity');
  assert.equal(kvHandles(t.env).length, 0, 'no sign-in handle is made');
  t.db.close();
});

test('LINKING: a used or unknown ticket is refused, never treated as a sign-in', async () => {
  const t = scene();
  const res = await hit(`${PROD}/auth/roblox/start?link=${rand(24)}`, { headers: { 'CF-Connecting-IP': freshIp() } }, t.env);
  assert.equal(res.status, 400);
  t.db.close();
});

test('LINKING: a Roblox account that signs in another account can still be linked for Studio, and its sign-in stays where it was', async () => {
  const t = scene();
  await signIn(t.env, t.world, { sub: '777', username: 'owner' });
  const owner = userIdOf(t.db, '777');
  assert.ok(owner);
  const link = await linkFlow(t.env, 'user-b');
  const { res } = await finish(t.env, t.world, link.flow, { sub: '777', username: 'owner' });
  assert.equal(res.status, 302);
  assert.equal(userIdOf(t.db, '777'), owner, 'the sign-in identity is unchanged');
  assert.deepEqual(rowsOf(t.db, 'select user_id from studio_roblox_accounts where roblox_sub = ?', '777').map((r) => r.user_id), ['user-b']);
  t.db.close();
});

baseTest("Roblox's compact scope answer counts as an uploads grant (measured live 2026-10-09: \"asset:read,write openid profile\")", () => {
  assert.deepEqual(R.scopeList('asset:read,write openid profile'), ['asset:read', 'asset:write', 'openid', 'profile']);
  assert.deepEqual(R.scopeList('openid profile asset:read asset:write'), ['openid', 'profile', 'asset:read', 'asset:write']);
  assert.ok(!R.scopeList('openid profile').includes('asset:write'));
});

test('UPLOADS AT ONCE: four pictures drawn together all get an upload token; the ones that find the refresh busy wait for it instead of failing', async () => {
  const s = await connected();
  s.db.raw.prepare("update roblox_oauth_tokens set scopes = 'asset:read,write openid profile' where user_id = ?").run(s.userId);
  s.world.roblox.scope = 'asset:read,write openid profile';
  const before = s.world.roblox.tokenCalls.length;
  const results = await Promise.all([1, 2, 3, 4].map(() => R.robloxUploadAccess(s.env, s.userId)));
  assert.deepEqual(results.map((r) => r.ok ? 'ok' : r.error), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(results[0].robloxUserId, SUB_A);
  assert.equal(s.world.roblox.tokenCalls.length - before, 1, 'one refresh at Roblox, shared by all four');
  assert.equal(s.world.roblox.burned, false);
  s.db.close();
});

test('UPLOADS WITHOUT AN ACCOUNT: a grant whose "Your Accounts" had nothing selected is refused with the fix, not sent to Roblox to fail', async () => {
  const s = await connected();
  s.db.raw.prepare("update roblox_oauth_tokens set scopes = 'asset:read,write openid profile' where user_id = ?").run(s.userId);
  s.world.roblox.scope = 'asset:read,write openid profile';
  s.world.roblox.creatorIds = [];
  const none = await R.robloxUploadAccess(s.env, s.userId);
  assert.equal(none.ok, false);
  assert.match(none.error, /Select next to your account/);
  s.world.roblox.creatorIds = ['U'];
  assert.equal((await R.robloxUploadAccess(s.env, s.userId)).ok, true, 'POSITIVE CONTROL: with the account selected it is served');
  s.db.close();
});
