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
    burned: false, tokenCalls: [], revokeCalls: [], lastRefreshIssued: null,
    failToken: null, failRevoke: null, duringRefresh: null, userinfo: null,
    issueCode({ sub, username, challenge, redirectUri }) {
      const code = `code_${rand()}`;
      roblox.codes.set(code, { sub, username, challenge, redirectUri, used: false });
      return code;
    },
  };
  const sb = { users: new Map(), links: new Map(), createCalls: 0, ghosts: 0, headers: [], strays: [] };
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
      if (roblox.userinfo) return json(200, roblox.userinfo(who));
      return json(200, { sub: who.sub, name: `Display ${who.username}`, nickname: `Display ${who.username}`, preferred_username: who.username, created_at: 1500000000 });
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
    // The secret key is for the Auth admin API. Anything else it is sent to, and any call that arrives without it, is a stray.
    if (!url.pathname.startsWith('/auth/v1/admin/') || headers.get('apikey') !== SB_SECRET) sb.strays.push(`${method} ${url.pathname}`);
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
      // GoTrue's own answer for an id it does not hold; the worker only believes a 404 that says this.
      return user ? json(200, user) : json(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
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

async function signIn(env, world, who, opts) {
  const flow = await startFlow(env, opts);
  return { flow, ...(await finish(env, world, flow, who)) };
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
  assert.equal(world.sb.createCalls, 1);
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
  assert.match(handleLine, /; Path=\/auth\/roblox\/redeem(;|$)/);
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

test('two callbacks for the same new sub at once still make one user and one link', async () => {
  const { db, world, env } = scene();
  const flows = [await startFlow(env), await startFlow(env)];
  const done = await Promise.all(flows.map((f) => finish(env, world, f, { sub: SUB_A, username: 'Builder1' })));
  assert.deepEqual(done.map((d) => d.res.status), [302, 302]);
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
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 409, 'not the generic 502: an operator can tell this from a Roblox or Supabase outage');
  const html = await res.text();
  assert.ok(html.includes(GENERIC), 'the person still gets the one fixed sentence');
  assert.ok(html.includes('roblox_address_taken'), 'and a reference they can quote');
  assert.equal(handleCookieOf(res), '', 'no sign-in handle is issued');
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
  const { res } = await signIn(env, world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(res.status, 409, 'a roblox_sub is present, so a check that only asks "is there one" would adopt this user');
  const html = await res.text();
  assert.ok(html.includes(GENERIC) && html.includes('roblox_address_taken'));
  assert.equal(handleCookieOf(res), '', 'no sign-in handle is issued');
  assert.equal(identityCount(db), 0, 'nothing is linked');
  assert.ok(LOGS.includes('[roblox-oauth] synthetic address taken'));
  assert.deepEqual(world.sb.users.get(holder.id), holder, 'the other person’s user was not touched');
  assert.equal(world.sb.links.size, 1, 'the one link the worker minted to READ the metadata was never handed to anybody');
  assert.equal([...kvHandles(env)].length, 0, 'and no handle waits in KV');
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

test('A ROBLOX-ONLY ACCOUNT can export its data and delete it: neither route asks for a password, the placeholder address is no obstacle, and the person can still sign in afterwards', async () => {
  ROWS.clear();
  const s = scene();
  await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  const userId = userIdOf(s.db, SUB_A);
  const refresh = s.world.roblox.lastRefreshIssued;
  const placeholder = s.world.sb.users.get(userId).email;
  assert.match(placeholder, /@users\.studpilot\.invalid$/, 'the account the SPA is signed in to has only the placeholder address');
  const bearer = as(userId, placeholder);

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

  const erased = await hit(`${PROD}/api/me/delete`, { method: 'POST', headers: { ...bearer.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, s.env);
  assert.ok([200, 207].includes(erased.status), `erasure answered ${erased.status}`);
  const receipt = await erased.json();
  assert.equal(receipt.steps.filter((x) => x.status === 'failed').length, 0);
  assert.equal(receipt.steps.find((x) => x.target === 'roblox_oauth_tokens').status, 'erased');
  assert.equal(receipt.steps.find((x) => x.target === 'roblox_identities').status, 'erased');
  assert.deepEqual(s.world.roblox.revokeCalls, [refresh], 'the Roblox grant was revoked as part of it');
  assert.equal(identityCount(s.db), 0);

  // Erasure does not remove the Supabase login (the worker holds no key to), so the same Roblox account signs back in to the SAME user.
  const back = await signIn(s.env, s.world, { sub: SUB_A, username: 'Builder1' });
  assert.equal(back.res.status, 302);
  assert.equal(userIdOf(s.db, SUB_A), userId);
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
  seen.push(['redeem ok', await redeemFor(env, ok.res)]);
  seen.push(['redeem replay', await redeemFor(env, ok.res)]);
  seen.push(['redeem from another origin', await redeemFor(env, ok.res, { origin: 'https://evil.example' })]);
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

test('SHARED ADDRESS: a school lab behind one NAT completes 20 sign-ins in a minute, and every one of the three steps is answered', async () => {
  // Start, callback and redeem used to share one bucket of 20 for the address, so the seventh sign-in found it empty and a
  // redeem refused after consent threw away a sign-in the person had already paid for at Roblox.
  const { db, world, env } = scene();
  const ip = freshIp();
  for (let i = 0; i < 20; i += 1) {
    const flow = await startFlow(env, { ip });
    assert.equal(flow.res.status, 302, `sign-in ${i + 1}: start`);
    const done = await finish(env, world, flow, { sub: String(2_000_000 + i), username: `Student${i}` });
    assert.equal(done.res.status, 302, `sign-in ${i + 1}: callback`);
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
  const flow = await startFlow(env);
  const first = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  const replays = [];
  for (let i = 0; i < 5; i += 1) replays.push((await finish(env, world, flow, { code: first.code })).res.status);
  assert.deepEqual([first.res.status, ...replays], [302, 400, 400, 400, 400, 429], 'a state is used once; hammering it is limited by its OWN bucket');
  assert.equal(world.roblox.tokenCalls.length, 1, 'no replay exchanged a second code');

  const cookie = handleCookieOf(first.res);
  const redeems = [];
  for (let i = 0; i < 6; i += 1) redeems.push((await redeemRequest(env, { cookie })).status);
  assert.deepEqual(redeems, [200, 400, 400, 400, 400, 429], 'a handle redeems once; hammering it is limited by its OWN bucket');
  db.close();
});

test('a state or handle nobody holds also counts against the address: fresh random values cannot be used to hammer KV, and real flows from that address are untouched', async () => {
  // Each state and handle has a bucket of its own, so a flood of fresh valid-looking values would never meet a ceiling without this.
  const { db, world, env } = scene();
  const ip = freshIp();
  const random = () => randomBytes(32).toString('base64url');
  const callbacks = [];
  for (let i = 0; i < 62; i += 1) {
    const state = random();
    callbacks.push((await hit(`${PROD}/auth/roblox/callback?code=x&state=${state}`, { headers: { 'CF-Connecting-IP': ip, Cookie: `${STATE_C}=${state}` } }, env)).status);
  }
  assert.equal(callbacks.slice(0, 60).every((s) => s === 400), true);
  assert.deepEqual(callbacks.slice(60), [429, 429], 'the sixty-first state nobody holds is refused');
  const redeems = [];
  for (let i = 0; i < 62; i += 1) redeems.push((await redeemRequest(env, { ip, cookie: `${HANDLE_C}=${random()}` })).status);
  assert.equal(redeems.slice(0, 60).every((s) => s === 400), true);
  assert.deepEqual(redeems.slice(60), [429, 429], 'and so is the sixty-first handle nobody holds');
  const refused = await redeemRequest(env, { ip, cookie: `${HANDLE_C}=${random()}` });
  assertHostCookie(setCookieNamed(refused, HANDLE_C, true), HANDLE_C, { maxAge: 0 });
  const flow = await startFlow(env, { ip });
  const done = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.equal(done.res.status, 302, 'a flow whose state IS held is never counted as a stray');
  assert.equal((await redeemFor(env, done.res, { ip })).status, 200, 'and its redeem, from the same address, is answered');
  db.close();
});

test('requests that carry no usable state or handle are limited per address, and a legitimate flow from that address is not affected', async () => {
  const { db, world, env } = scene();
  const ip = freshIp();
  const stray = [];
  for (let i = 0; i < 62; i += 1) stray.push((await hit(`${PROD}/auth/roblox/callback?code=x&state=nope`, { headers: { 'CF-Connecting-IP': ip } }, env)).status);
  assert.equal(stray.slice(0, 60).every((s) => s === 400), true);
  assert.deepEqual(stray.slice(60), [429, 429]);
  const noHandle = [];
  for (let i = 0; i < 62; i += 1) noHandle.push((await redeemRequest(env, { ip })).status);
  assert.equal(noHandle.slice(0, 60).every((s) => s === 400), true);
  assert.deepEqual(noHandle.slice(60), [429, 429]);
  const flow = await startFlow(env, { ip });
  const done = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  assert.equal(done.res.status, 302, 'a real flow from the same address has a state of its own, so the strays do not count against it');
  assert.equal((await redeemFor(env, done.res, { ip })).status, 200);
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

test('NO SECRET, TOKEN, CODE, STATE OR QUERY STRING IS WRITTEN TO ANY LOG LINE, through success and every failure', async () => {
  LOGS.length = 0;
  const { db, world, env } = scene();
  const secrets = new Set([CLIENT_SECRET, SB_SECRET, KEY_B64]);
  // success
  const flow = await startFlow(env);
  const ok = await finish(env, world, flow, { sub: SUB_A, username: 'Builder1' });
  secrets.add(flow.state); secrets.add(ok.code); secrets.add(world.roblox.lastRefreshIssued);
  secrets.add(world.roblox.tokenCalls[0].code_verifier);
  secrets.add(handleCookieOf(ok.res).split('=')[1]);
  const redeemed = await redeemFor(env, ok.res);
  secrets.add((await redeemed.json()).token_hash);
  await redeemFor(env, ok.res);                                          // a replay
  await redeemFor(env, ok.res, { origin: 'https://evil.example' });      // a hostile origin
  for (const at of world.roblox.access.keys()) secrets.add(at);
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
