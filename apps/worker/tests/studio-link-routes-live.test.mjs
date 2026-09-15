/**
 * THE STUDIO LINK ROUTES, ASKED OVER HTTP.
 *
 * The pure suites prove `placeAdmission` refuses the wrong place and `PairingDO` honours a cancel.
 * They cannot prove that a ROUTE asks either one, and this cluster is exactly where that gap bites:
 * every mechanism here already existed inside the SessionDO and NONE of it was reachable by the
 * person who owns the project. `/info` carries the connection state, the queue depth and the op log
 * and sits behind the admin key; two documentation pages tell users to "disconnect from the web
 * workspace", which was not a thing that existed anywhere in the product.
 *
 * So this bundles the real `index.ts`, stands a fake edge behind it, and sends real requests signed
 * with real ES256 tokens — the harness billing-routes-live.test.mjs established.
 *
 * Run with:  node --test tests/studio-link-routes-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const TMP = mkdtempSync(join(tmpdir(), 'golem-studio-link-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(ESBUILD, [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`], { stdio: 'pipe', cwd: WORKER });
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.studio.test';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_ID = '88888888-8888-4888-8888-888888888888';
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';

async function tokenFor(sub) {
  return new jose.SignJWT({ email: `${sub}@golem.test`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'studio-test' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}
const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'studio-test', alg: 'ES256', use: 'sig' };
const JWT = await tokenFor(USER_ID);
const OTHER_JWT = await tokenFor(OTHER_ID);

/** Every call that reached a Durable Object, so forwarding is observed rather than assumed. */
let doCalls = [];
/** What the SessionDO answers for /studio/link. */
let link = null;
/** What PairingDO answers for /create. */
let pairingCreate = { code: 'K7M3QP', expiresAtIso: new Date(Date.now() + 600_000).toISOString() };
let pairingCreateStatus = 200;
/** Whether the project row exists for the caller. */
let projectOwner = USER_ID;

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.includes('/rest/v1/projects')) {
    // getOwnedProject filters on owner_id; the fake edge honours that so a non-owner really is
    // refused by the same path a real one would be.
    const owned = url.includes(`owner_id=eq.${projectOwner}`);
    return json(owned ? [{ id: PROJECT_ID, name: 'Tower Defence', owner_id: projectOwner }] : []);
  }
  if (url.includes('/rest/v1/profiles')) return json([{ id: USER_ID, plan: 'free', is_admin: false, display_name: 'builder' }]);
  if (url.includes('/rest/v1/project_members')) return json([]);
  return json([]);
};

function namespace() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    get: () => ({
      async fetch(url, init) {
        const u = new URL(typeof url === 'string' ? url : url.url);
        let body = null;
        try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
        doCalls.push({ path: u.pathname, body, method: init?.method ?? 'GET' });
        const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
        if (u.pathname === '/init') return json({ ok: true });
        if (u.pathname === '/create') return json(pairingCreate, pairingCreateStatus);
        if (u.pathname === '/cancel') return json({ ok: true, cancelled: body?.userId === USER_ID });
        if (u.pathname === '/studio/link') return link ? json(link) : json({ error: 'nope' }, 500);
        if (u.pathname === '/studio/diagnostics') return json({ link, agentStatus: 'idle', recentOps: [] });
        if (u.pathname === '/studio/revoke') return json({ ok: true, revoked: true });
        if (u.pathname === '/studio/place/rebind') return json({ ok: true });
        if (u.pathname === '/studio/queue') return json({ ok: true, discarded: 3 });
        if (u.pathname === '/plugin/register') return json({ ok: true, place: { placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: 1 } });
        if (u.pathname === '/claim') return json({ projectId: PROJECT_ID, userId: USER_ID, projectName: 'Tower Defence' });
        return json({ ok: true });
      },
    }),
  };
}

const env = () => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  CORPUS: { exec: async () => ({}), prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }), batch: async () => [] },
  SESSION_DO: namespace(),
  QUOTA_DO: namespace(),
  PAIRING_DO: namespace(),
  ADMIN_DO: namespace(),
  BUDGET_DO: namespace(),
});

async function call(path, { method = 'GET', jwt = JWT, body, headers = {} } = {}) {
  const h = { ...headers };
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    env(),
  );
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json: parsed, text };
}

const linked = (over = {}) => ({
  paired: true, connected: true, lastSeenAt: 1_700_000_000_000, queuedOps: 3,
  pluginVersion: '0.2.0', pluginProtocol: 1,
  place: { placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: 1_699_000_000_000 },
  ...over,
});

const reset = () => {
  doCalls = [];
  link = null;
  projectOwner = USER_ID;
  pairingCreateStatus = 200;
  pairingCreate = { code: 'K7M3QP', expiresAtIso: new Date(Date.now() + 600_000).toISOString() };
};

// ------------------------------------------------------- duplicate pairing is reported, not hidden

test('CONTROL: minting a code still returns a code', async () => {
  // Without this every assertion below could pass because pairing is simply broken.
  reset();
  const r = await call(`/api/projects/${PROJECT_ID}/pairing`, { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.code, 'K7M3QP');
  assert.ok(r.json.expiresAtIso, 'and it still carries an expiry');
});

test('MINTING A CODE FOR AN ALREADY-PAIRED PROJECT REPORTS THE LINK IT WILL SUPERSEDE', async () => {
  // The session holds ONE plugin token. Pairing again disconnects whatever was paired, and the
  // Studio that loses it learns from a 401 in a different window. Nothing detected or said so.
  reset();
  link = linked();
  const r = await call(`/api/projects/${PROJECT_ID}/pairing`, { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.existingLink.connected, true);
  assert.equal(r.json.existingLink.pluginVersion, '0.2.0');
  assert.equal(r.json.existingLink.place.placeName, 'Tower Defence', 'and WHICH place it is bound to');
  assert.ok(doCalls.some((d) => d.path === '/studio/link'), 'the session was actually asked');
});

test('a project with no pairing reports no link, rather than an empty-looking one', async () => {
  reset();
  link = { paired: false, connected: false, lastSeenAt: null, queuedOps: 0, pluginVersion: null, pluginProtocol: null, place: null };
  const r = await call(`/api/projects/${PROJECT_ID}/pairing`, { method: 'POST' });
  assert.equal(r.json.existingLink, null, 'a first pairing must not warn about superseding nothing');
});

test('A LINK LOOKUP THAT FAILS DOES NOT COST THE USER THEIR CODE', async () => {
  // The warning is a courtesy; the code is what they came for. Ordering the lookup before the mint,
  // or letting it throw, would turn a nicety into an outage.
  reset();
  link = null; // the stub answers 500 for /studio/link
  const r = await call(`/api/projects/${PROJECT_ID}/pairing`, { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.code, 'K7M3QP');
  assert.equal(r.json.existingLink, null, 'and "could not tell" is reported as no warning, not as a warning');
});

test('the 429 for too many live codes is still passed through untouched', async () => {
  reset();
  pairingCreateStatus = 429;
  pairingCreate = { error: 'too many active codes' };
  const r = await call(`/api/projects/${PROJECT_ID}/pairing`, { method: 'POST' });
  assert.equal(r.status, 429, 'wrapping the refusal in a 200 would hide it');
  assert.equal(r.json.error, 'too many active codes');
});

// ------------------------------------------------------------------------- cancellation

test('cancelling a code reaches the pairing object with the CALLER as the owner', async () => {
  // The userId must come from the verified token, never from the body — otherwise cancel is a
  // route for revoking anybody's code by naming them.
  reset();
  const r = await call(`/api/projects/${PROJECT_ID}/pairing/cancel`, { method: 'POST', body: { code: 'K7M3QP', userId: OTHER_ID } });
  assert.equal(r.status, 200, r.text);
  const sent = doCalls.find((d) => d.path === '/cancel');
  assert.equal(sent.body.userId, USER_ID, 'THE BODY MUST NOT BE ABLE TO NAME A DIFFERENT USER');
  assert.equal(sent.body.code, 'K7M3QP');
});

test('cancel without a code is a bad request, and nothing is asked of the object', async () => {
  reset();
  const r = await call(`/api/projects/${PROJECT_ID}/pairing/cancel`, { method: 'POST', body: {} });
  assert.equal(r.status, 400);
  assert.equal(doCalls.some((d) => d.path === '/cancel'), false, 'the refusal is before the call');
});

// ------------------------------------------------------------------ diagnostics, revoke, rebind

test('the owner can read connection diagnostics WITHOUT the admin key', async () => {
  // This is the whole point: the data existed and only an operator could see it.
  reset();
  link = linked();
  const r = await call(`/api/projects/${PROJECT_ID}/studio/diagnostics`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.link.queuedOps, 3, 'the queue depth reaches the person who owns the queue');
  assert.equal(r.json.link.lastSeenAt, 1_700_000_000_000, 'and when Studio was last seen');
});

test('disconnecting reaches the session as a revoke', async () => {
  reset();
  const r = await call(`/api/projects/${PROJECT_ID}/studio/disconnect`, { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.revoked, true);
  assert.ok(doCalls.some((d) => d.path === '/studio/revoke' && d.method === 'POST'), 'the session was told');
});

test('rebinding the place reaches the session', async () => {
  reset();
  const r = await call(`/api/projects/${PROJECT_ID}/studio/place/rebind`, { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  assert.ok(doCalls.some((d) => d.path === '/studio/place/rebind'));
});

test('DISCARDING THE QUEUE REACHES THE SESSION AS A DELETE, and reports what went', async () => {
  // The verb matters: the session distinguishes DELETE /studio/queue from every other path on
  // that object, and a POST would fall through to the 404 at the bottom of its fetch.
  reset();
  const r = await call(`/api/projects/${PROJECT_ID}/studio/queue`, { method: 'DELETE' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.discarded, 3, 'the count comes back so the UI can say what it threw away');
  assert.ok(doCalls.some((d) => d.path === '/studio/queue' && d.method === 'DELETE'), 'the session was told');
});

// ------------------------------------------------------------------------- who may do all this

test('NONE OF THESE ROUTES ANSWERS A STRANGER', async () => {
  // Every one of them reads or destroys the state of somebody's live Studio session. A missing
  // guard on any single route makes the other four irrelevant, which is why they are asserted as
  // a set rather than one representative.
  const routes = [
    ['POST', `/api/projects/${PROJECT_ID}/pairing`],
    ['POST', `/api/projects/${PROJECT_ID}/pairing/cancel`],
    ['GET', `/api/projects/${PROJECT_ID}/studio/diagnostics`],
    ['POST', `/api/projects/${PROJECT_ID}/studio/disconnect`],
    ['POST', `/api/projects/${PROJECT_ID}/studio/place/rebind`],
    ['DELETE', `/api/projects/${PROJECT_ID}/studio/queue`],
  ];
  for (const [method, path] of routes) {
    reset();
    link = linked();
    const r = await call(path, { method, jwt: OTHER_JWT, body: method === 'POST' ? { code: 'K7M3QP' } : undefined });
    assert.equal(r.status, 404, `${method} ${path} answered ${r.status} to a non-owner`);
    assert.equal(doCalls.some((d) => d.path.startsWith('/studio') || d.path === '/cancel' || d.path === '/create'), false,
      `${method} ${path} reached a Durable Object for a stranger`);
  }
});

test('CONTROL: the owner gets through every one of those same routes', async () => {
  // Without this the refusals above could pass because the routes are broken for everybody.
  const routes = [
    ['POST', `/api/projects/${PROJECT_ID}/pairing`],
    ['POST', `/api/projects/${PROJECT_ID}/pairing/cancel`],
    ['GET', `/api/projects/${PROJECT_ID}/studio/diagnostics`],
    ['POST', `/api/projects/${PROJECT_ID}/studio/disconnect`],
    ['POST', `/api/projects/${PROJECT_ID}/studio/place/rebind`],
    ['DELETE', `/api/projects/${PROJECT_ID}/studio/queue`],
  ];
  for (const [method, path] of routes) {
    reset();
    link = linked();
    const r = await call(path, { method, body: method === 'POST' ? { code: 'K7M3QP' } : undefined });
    assert.equal(r.status, 200, `${method} ${path} refused the owner: ${r.text}`);
  }
});

// ------------------------------------------------------------- the place, confirmed at pairing

test('THE CLAIM CARRIES THE OPEN PLACE INTO THE SESSION, and confirms it back to the plugin', async () => {
  // Unauthenticated route: the plugin sends what it has open, the session binds it, and the
  // response says which place the project is now bound to so the dock can print it.
  reset();
  const r = await call('/api/studio/claim', {
    method: 'POST',
    jwt: null,
    body: { code: 'K7M3QP', place: { placeId: 111, gameId: 900, placeName: 'Tower Defence' } },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.place.placeId, 111, 'the claim response confirms the binding');
  const registered = doCalls.find((d) => d.path === '/plugin/register');
  assert.equal(registered.body.place.placeId, 111, 'and the session was actually given the place');
});

test('a plugin too old to report a place still pairs', async () => {
  // Absence of a place is not a reason to refuse a pairing; studio-place.ts binds nothing and
  // refuses nothing until an identifiable place turns up.
  reset();
  const r = await call('/api/studio/claim', { method: 'POST', jwt: null, body: { code: 'K7M3QP' } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.token, 'the pairing still completes');
  const registered = doCalls.find((d) => d.path === '/plugin/register');
  assert.equal(registered.body.place, null);
});
