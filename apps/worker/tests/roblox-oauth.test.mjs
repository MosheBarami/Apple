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
 *
 * Run with:  node --test tests/roblox-oauth.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

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
const { ROWS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => { for (const f of [APP_OUT, LIB_OUT, CRED_OUT]) rmSync(f, { force: true }); });

// Every console line the worker writes, kept so one test can read all of them. Nothing is printed.
const LOGS = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...args) => { LOGS.push(args.map((a) => String(a)).join(' ')); };

/* ------------------------------------------------------------------------- fixtures --- */

const PROD = 'https://studpilot.app';
const DEV = 'http://localhost:5173';
const SB = 'https://sb.example.test';
const CLIENT_ID = '5523165872353873834';
const CLIENT_SECRET = 'RBX-fixture-client-secret-' + 'c'.repeat(20);
const SB_SECRET = 'sb_secret_' + 'f'.repeat(24);
const KEY_B64 = Buffer.alloc(32, 7).toString('base64');
const SYNTHETIC = (sub) => `roblox-${sub}@users.studpilot.invalid`;
const SUB_A = '1234567';
const SUB_B = '7654321';

const sha256url = (s) => createHash('sha256').update(s).digest('base64url');
const rand = (n = 16) => randomBytes(n).toString('hex');

/** Roblox and the Supabase Auth admin API, as one fetch. Every call is recorded; an unknown one fails the test. */
function makeWorld() {
  const roblox = {
    codes: new Map(), access: new Map(), refresh: new Map(),
    burned: false, tokenCalls: [], revokeCalls: [], lastRefreshIssued: null,
    failToken: null, failRevoke: null, duringRefresh: null,
    issueCode({ sub, username, challenge, redirectUri }) {
      const code = `code_${rand()}`;
      roblox.codes.set(code, { sub, username, challenge, redirectUri, used: false });
      return code;
    },
  };
  const sb = { users: new Map(), links: new Map(), createCalls: 0, headers: [] };
  const calls = [];
  const unexpected = [];

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const issue = (who) => {
    const access = `at_${rand()}`;
    const refresh = `RBX-${rand(24)}`;
    roblox.access.set(access, who);
    roblox.refresh.set(refresh, { ...who, state: 'live' });
    roblox.lastRefreshIssued = refresh;
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 900, scope: 'openid profile' };
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
      return json(200, { sub: who.sub, name: `Display ${who.username}`, nickname: `Display ${who.username}`, preferred_username: who.username, created_at: 1500000000 });
    }
    if (url.pathname === '/oauth/v1/token/revoke' && method === 'POST') {
      roblox.revokeCalls.push(form.get('token'));
      if (roblox.failRevoke) return json(roblox.failRevoke, { error: 'server_error' });
      const rec = roblox.refresh.get(form.get('token'));
      if (rec) rec.state = 'revoked';
      return json(200, {});
    }
    return null;
  }

  async function supabaseCall(url, method, body, headers) {
    sb.headers.push({ apikey: headers.get('apikey'), authorization: headers.get('authorization') });
    if (headers.get('apikey') !== SB_SECRET) return json(401, { message: 'invalid api key' });
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      sb.createCalls += 1;
      if (userByEmail(body.email)) return json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      const user = { id: randomUUID(), email: body.email, email_confirmed_at: new Date().toISOString(), app_metadata: { ...body.app_metadata }, user_metadata: { ...body.user_metadata }, confirmedByAdmin: body.email_confirm === true };
      sb.users.set(user.id, user);
      return json(200, user);
    }
    const one = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
    if (one && method === 'GET') {
      const user = sb.users.get(decodeURIComponent(one[1]));
      return user ? json(200, user) : json(404, { msg: 'not found' });
    }
    if (url.pathname === '/auth/v1/admin/generate_link' && method === 'POST') {
      const user = userByEmail(body.email);
      if (!user || body.type !== 'magiclink') return json(404, { msg: 'not found' });
      const hashed = `ht_${rand(20)}`;
      sb.links.set(hashed, user.id);
      return json(200, { ...user, action_link: `${SB}/auth/v1/verify?token=${hashed}&type=magiclink`, email_otp: '123456', hashed_token: hashed, redirect_to: '', verification_type: 'magiclink' });
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
  return { fetch: fetchMock, roblox, sb, calls, unexpected };
}

function makeKv() {
  const rows = new Map();
  return {
    rows,
    ttls: new Map(),
    async get(key) { return rows.get(key) ?? null; },
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
    ...envOverrides,
  };
  return { db, kv, world, env };
}

// Each flow gets its own client address, because the limiter's counters outlive a test.
let nextIp = 0;
const freshIp = () => `198.51.100.${(nextIp += 1) % 250}`;

async function startFlow(env, { origin = PROD, returnTo, ip = freshIp() } = {}) {
  const qs = returnTo === undefined ? '' : `?return=${encodeURIComponent(returnTo)}`;
  const res = await hit(`${origin}/auth/roblox/start${qs}`, { headers: { 'CF-Connecting-IP': ip } }, env);
  const location = res.headers.get('Location') ?? '';
  const auth = new URL(location, origin);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('rbx_oauth_state='));
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

async function signIn(env, world, who, opts) {
  const flow = await startFlow(env, opts);
  return { flow, ...(await finish(env, world, flow, who)) };
}

const fragmentOf = (res) => new URLSearchParams((res.headers.get('Location') ?? '').split('#')[1] ?? '');
const rowsOf = (db, sql, ...params) => db.raw.prepare(sql).all(...params);
const userIdOf = (db, sub) => rowsOf(db, 'select user_id from roblox_identities where roblox_sub = ?', sub)[0]?.user_id;
/** Rows in a table the worker makes on first use: zero when it was never made, which is also "nothing created". */
const identityCount = (db) => { try { return countRows(db.raw, 'select count(*) from roblox_identities'); } catch { return 0; } };
const GENERIC = 'We could not sign you in with Roblox. Go back to StudPilot and try again.';

/* ----------------------------------------------------------- the harness is a real one --- */

test('POSITIVE CONTROL: a first sign-in works end to end, so the refusals below are refusals of something that works', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('Location'), /^\/app\/auth\/roblox#token_hash=ht_/);
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
  const { res } = await finish(env, world, flow, { sub: SUB_A, username: 'x', state: forged, cookie: `rbx_oauth_state=${forged}` });
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
  assert.equal(world.sb.createCalls, 1);
  db.close();
});

test('a state issued to one browser is refused in another: it is bound to the browser by a cookie', async () => {
  // Login CSRF: the attacker starts a flow, finishes it on their own Roblox account, and gives the callback
  // URL to somebody else. The victim has no cookie for that state.
  const { db, kv, world, env } = scene();
  for (const cookie of ['', 'rbx_oauth_state=' + 'z'.repeat(43)]) {
    const flow = await startFlow(env);
    const { res } = await finish(env, world, flow, { sub: SUB_A, username: 'Attacker', cookie });
    assert.equal(res.status, 400, `cookie "${cookie.slice(0, 20)}" must be refused`);
    assert.equal(world.roblox.tokenCalls.length, 0);
    assert.equal(kv.rows.has(`roblox-oauth:state:${flow.state}`), false, 'a refused state is still burned');
  }
  assert.equal(identityCount(db), 0);
  db.close();
});

test('the state cookie is HttpOnly, SameSite=Lax, scoped to the routes, and cleared when the callback is done', async () => {
  const { db, world, env } = scene();
  const flow = await startFlow(env);
  assert.match(flow.setCookie, /HttpOnly/);
  assert.match(flow.setCookie, /SameSite=Lax/);
  assert.match(flow.setCookie, /Path=\/auth\/roblox/);
  assert.match(flow.setCookie, /Max-Age=600/);
  const { res } = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.ok(res.headers.getSetCookie().some((c) => /^rbx_oauth_state=;.*Max-Age=0/.test(c)), 'the cookie must be cleared after use');
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
    assert.match(location, /^\/app\/auth\/roblox#token_hash=/, `leaves the product for ${bad.slice(0, 30)}`);
    assert.equal(fragmentOf(res).has('next'), false, `${bad.slice(0, 30)} was carried into the redirect`);
    assert.equal(location.includes('evil'), false);
    db.close();
  }
});

test('a return path that is an app screen travels in the fragment', async () => {
  const token = 'T'.repeat(24);
  for (const good of ['/usage', '/settings', '/projects/3f1c2a9e-1111-4222-8333-abcdefabcdef', '/projects/abc/roadmap', `/join?token=${token}`]) {
    const { db, world, env } = scene();
    const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' }, { returnTo: good });
    assert.equal(fragmentOf(res).get('next'), good);
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
  assert.match(user.email, /@users\.studpilot\.invalid$/);
  assert.equal(user.confirmedByAdmin, true, 'email_confirm is set, so no confirmation mail is waiting on an undeliverable address');
  assert.equal(user.app_metadata.roblox_sub, SUB_A);
  assert.equal(user.user_metadata.display_name, 'Builder1', 'the profile is named for the Roblox username, not for the synthetic address');
  const rows = rowsOf(db, 'select * from roblox_identities');
  assert.equal(rows.length, 1);
  assert.deepEqual({ sub: rows[0].roblox_sub, user: rows[0].user_id, name: rows[0].username }, { sub: SUB_A, user: user.id, name: 'Builder1' });
  // No mail is sent: the only Supabase calls are the three admin ones.
  assert.deepEqual([...new Set(world.calls.filter((c) => c.url.startsWith(SB)).map((c) => new URL(c.url).pathname.replace(/[0-9a-f-]{36}/, ':id')))].sort(),
    ['/auth/v1/admin/generate_link', '/auth/v1/admin/users', '/auth/v1/admin/users/:id']);
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
  assert.equal(world.sb.links.get(fragmentOf(second.res).get('token_hash')), userId, 'the sign-in token is for the same user');
  db.close();
});

test('a different Roblox account with the same username is a different user, and cannot reach the first', async () => {
  const { db, world, env } = scene();
  const a = await signIn(env, world, { sub: SUB_A, username: 'Shared' });
  const b = await signIn(env, world, { sub: SUB_B, username: 'Shared' });
  assert.equal(world.sb.users.size, 2);
  const userA = userIdOf(db, SUB_A);
  const userB = userIdOf(db, SUB_B);
  assert.notEqual(userA, userB);
  assert.equal(world.sb.links.get(fragmentOf(a.res).get('token_hash')), userA);
  assert.equal(world.sb.links.get(fragmentOf(b.res).get('token_hash')), userB, 'B is signed in as B, never as A');
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

test('two callbacks for the same new sub at once still make one user and one link', async () => {
  const { db, world, env } = scene();
  const flows = [await startFlow(env), await startFlow(env)];
  const done = await Promise.all(flows.map((f) => finish(env, world, f, { sub: SUB_A, username: 'Builder1' })));
  assert.deepEqual(done.map((d) => d.res.status), [302, 302]);
  assert.equal(world.sb.users.size, 1, 'Supabase holds one user for the synthetic address');
  assert.equal(countRows(db.raw, 'select count(*) from roblox_identities'), 1);
  const userId = userIdOf(db, SUB_A);
  for (const d of done) assert.equal(world.sb.links.get(fragmentOf(d.res).get('token_hash')), userId);
  db.close();
});

test('an address somebody registered by hand is NEVER adopted: the account would be theirs', async () => {
  // Anyone can sign up with roblox-<sub>@users.studpilot.invalid. If the worker adopted that user, they
  // would hold a password to the account the real owner then signs in to.
  const { db, world, env } = scene();
  const squatter = { id: randomUUID(), email: SYNTHETIC(SUB_A), app_metadata: {}, user_metadata: {} };
  world.sb.users.set(squatter.id, squatter);
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 502);
  assert.equal(fragmentOf(res).has('token_hash'), false);
  assert.equal(identityCount(db), 0);
  assert.ok((await res.text()).includes(GENERIC), 'the person gets the generic error and nothing is delivered for the squatter’s account');
  assert.deepEqual(world.sb.users.get(squatter.id), squatter, 'the squatter’s user was not touched');
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

/* ------------------------------------------------------- no session is minted here --- */

test('the sign-in token reaches the browser in the URL fragment, and the worker mints no session', async () => {
  const { db, world, env } = scene();
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const location = res.headers.get('Location');
  assert.equal(location.split('#')[0], '/app/auth/roblox', 'the path carries nothing: a fragment never reaches a server log');
  assert.equal(location.includes('?'), false);
  const hash = fragmentOf(res).get('token_hash');
  assert.ok(world.sb.links.has(hash));
  const body = await res.text();
  assert.equal(body.includes(hash), false, 'the token is not in the body either');
  // Supabase issues the session when the SPA calls verifyOtp; the worker never touches the endpoints that do.
  assert.deepEqual(world.calls.filter((c) => /\/auth\/v1\/(token|verify|signup|otp)\b/.test(c.url)), []);
  db.close();
});

test('the Supabase secret key goes in `apikey`, and only a JWT-shaped legacy key is also sent as the bearer', async () => {
  const modern = scene();
  await signIn(modern.env, modern.world, { sub: SUB_A, username: 'Builder1' });
  assert.ok(modern.world.sb.headers.length >= 3);
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
  assert.ok(seen.length >= 3);
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
  const first = rowsOf(db, 'select sealed_refresh, version from roblox_oauth_tokens')[0];
  await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  const second = rowsOf(db, 'select sealed_refresh, version from roblox_oauth_tokens')[0];
  assert.equal(second.version, first.version + 1);
  assert.notEqual(second.sealed_refresh, first.sealed_refresh);
  assert.equal(countRows(db.raw, 'select count(*) from roblox_oauth_tokens'), 1);
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

  const two = await R.refreshRobloxAccessToken(s.env, s.userId);
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
  // And the loser can simply try again.
  assert.equal((await R.refreshRobloxAccessToken(s.env, s.userId)).ok, true);
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

test('a refresh Roblox refuses releases the lease and changes nothing else', async () => {
  const s = await connected();
  const sealed = s.row().sealed_refresh;
  s.world.roblox.failToken = { status: 400, body: { error: 'invalid_grant' } };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'refused' });
  assert.equal(s.row().lease_until, null);
  assert.equal(s.row().sealed_refresh, sealed);
  assert.equal(s.row().version, 1);
  s.world.roblox.failToken = { status: 503, body: {} };
  assert.deepEqual(await R.refreshRobloxAccessToken(s.env, s.userId), { ok: false, reason: 'unavailable' });
  assert.equal((await R.refreshRobloxAccessToken(s.env, 'nobody')).reason, 'not_connected');
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

test('DISCONNECT with Roblox unreachable changes nothing, because the sealed token is the only handle to revoke it with', async () => {
  const s = await connected();
  s.world.roblox.failRevoke = 503;
  const res = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(res.status, 502);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 1);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_identities'), 1);
  // And when Roblox says the token is already dead, that is a revoked grant.
  s.world.roblox.failRevoke = 400;
  const dead = await hit(`${PROD}/api/me/roblox/disconnect`, postAs(s.userId, 'real@example.com'), s.env);
  assert.equal(dead.status, 200);
  assert.equal(countRows(s.db.raw, 'select count(*) from roblox_oauth_tokens'), 0);
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
  assert.deepEqual({ ...body, linkedAt: typeof body.linkedAt }, { configured: true, connected: true, username: 'Builder1', linkedAt: 'string', signInOnly: true });
  const none = await (await hit(`${PROD}/api/me/roblox/connection`, as('someone-else', 'x@example.com'), s.env)).json();
  assert.deepEqual(none, { configured: true, connected: false, username: null, linkedAt: null, signInOnly: false });
  s.db.close();
});

/* ------------------------------------------------------------- export and erasure --- */

test('the account export includes both tables, with no token in it, and nobody else’s rows', async () => {
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
  assert.deepEqual(doc.tables.roblox_identities.rows[0], { roblox_sub: SUB_A, user_id: alice, username: 'Builder1', created_at: doc.tables.roblox_identities.rows[0].created_at });
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

test('the IP limiter answers 429 from the same address, and the status check has a ceiling of its own', async () => {
  const { db, kv, env } = scene();
  const ip = freshIp();
  const answers = [];
  for (let i = 0; i < 22; i += 1) answers.push((await hit(`${PROD}/auth/roblox/start`, { headers: { 'CF-Connecting-IP': ip } }, env)).status);
  assert.equal(answers.slice(0, 20).every((s) => s === 302), true, 'the first twenty are served');
  assert.deepEqual(answers.slice(20), [429, 429]);
  assert.equal(kv.rows.size, 20, 'a limited request stores no state');
  // Hammering start does not take the sign-in page's status check away from the same address.
  assert.equal((await hit(`${PROD}/auth/roblox/status`, { headers: { 'CF-Connecting-IP': ip } }, env)).status, 200);
  db.close();
});

test('NO SECRET, TOKEN, CODE, STATE OR QUERY STRING IS WRITTEN TO ANY LOG LINE, through success and every failure', async () => {
  LOGS.length = 0;
  const { db, world, env } = scene();
  const secrets = new Set([CLIENT_SECRET, SB_SECRET, KEY_B64]);
  // success
  const flow = await startFlow(env);
  const ok = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  secrets.add(flow.state); secrets.add(ok.code); secrets.add(world.roblox.lastRefreshIssued);
  secrets.add(world.roblox.tokenCalls[0].code_verifier);
  secrets.add(fragmentOf(ok.res).get('token_hash'));
  for (const at of world.roblox.access.keys()) secrets.add(at);
  // replay, forged state, failed exchange, a provider error, a throw inside the handler
  await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  const f2 = await startFlow(env);
  world.roblox.failToken = { status: 500, body: { error: 'LEAK-ME-LOG-DETAIL' } };
  const bad = await finish(env, world, f2, { sub: SUB_B, username: 'B' });
  secrets.add(f2.state); secrets.add(bad.code);
  world.roblox.failToken = null;
  const f3 = await startFlow(env);
  const boom = await finish(env, world, f3, { sub: SUB_B, username: 'B' });
  secrets.add(f3.state);
  world.roblox.revokeCalls.length = 0;
  db.raw.exec('drop table roblox_identities');           // the next callback now throws in storage
  const f4 = await startFlow(env);
  secrets.add(f4.state);
  const stored = await finish(env, world, f4, { sub: SUB_B, username: 'B' });
  secrets.add(stored.code);
  assert.ok(boom.res.status >= 200);
  assert.ok(LOGS.length > 0, 'the failure paths log a fixed stage word, so there is something to read');
  const text = LOGS.join('\n');
  for (const s of secrets) assert.equal(text.includes(s), false, `a log line carries ${String(s).slice(0, 6)}…`);
  assert.equal(text.includes('LEAK-ME'), false, 'no provider body in the logs');
  assert.equal(/[?&](code|state|token_hash)=/.test(text), false, 'no query string or fragment in the logs');
  for (const line of LOGS.filter((l) => l.startsWith('[roblox-oauth]'))) assert.match(line, /^\[roblox-oauth\] [a-z -]+$/, `an unexpected log line: ${line.slice(0, 40)}`);
  db.close();
});
