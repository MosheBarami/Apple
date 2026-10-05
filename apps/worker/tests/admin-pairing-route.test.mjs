/**
 * POST /api/admin/pairing/:id MINTS A PAIRING CODE FOR THE EVALUATION HARNESS, WITH NO SIGN-IN.
 *
 * The user route (`POST /api/projects/:id/pairing`) needs the owner's JWT, and the harness must
 * never sign in with a password. This route does the same minting behind the admin key, for one
 * project and one named owner, and it is only safe because of what it refuses:
 *
 *   1. no admin key, no code, and nothing is addressed (a refusal reaches no Durable Object);
 *   2. a project id or an owner id that is not a UUID is a 400 before any Durable Object is named,
 *      so an arbitrary string never becomes a Durable Object name;
 *   3. the session must already know the project and its owner: a session with a DIFFERENT owner is
 *      refused (the key cannot pair a Studio to someone else's project by naming the wrong user),
 *      and a session that has no owner on record is refused too (it would otherwise adopt whoever
 *      the caller named at the first claim);
 *   4. the owner is checked INSIDE the session (`/owner-check`), so the owner id never travels out
 *      of it and no Supabase call, and no use of SUPABASE_SECRET_KEY, is added (the privacy policy
 *      lists that key's uses exactly);
 *   5. the code is minted through PairingDO exactly as the user route does it, with the same body,
 *      the same 429 pass-through, and the same `existingLink` warning that a second pairing
 *      supersedes the first.
 *
 * Each clause is asserted below, and each was red before the route existed.
 *
 * Run with:  node --test tests/admin-pairing-route.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `studpilot-admin-pairing-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const ADMIN_KEY = 'a-high-entropy-admin-key';
const PROJECT = '1ea443f2-6232-43c1-a8bd-f425e2df4f4d';
const OWNER = '8722e4df-ab9c-47f6-8a57-02f5a5dd1d44';
const STRANGER = '99999999-9999-4999-8999-999999999999';
const CTX = { waitUntil() {}, passThroughOnException() {} };

/** What the fake edge answers; reset by `fresh()` before each test. */
let session;
let pairing;
let calls;

function fresh() {
  calls = [];
  // The session knows its owner and its name. `owner-check` answers like the real one: ok for the
  // owner, 403 for anyone else, 400 when the session was never initialised.
  session = { ownerId: OWNER, name: 'Tower Defence', initialised: true, link: null, linkStatus: 200 };
  pairing = { status: 200, body: { code: 'K7M3QP', expiresAtIso: '2026-10-05T12:10:00.000Z' } };
}
fresh();

const sessionDo = {
  idFromName: (n) => { calls.push({ ns: 'SESSION_DO', addressed: n }); return n; },
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ ns: 'SESSION_DO', path: u.pathname, body });
      if (u.pathname === '/owner-check') {
        if (!session.initialised) return Response.json({ error: 'session not initialized' }, { status: 400 });
        if (body?.userId !== session.ownerId) return Response.json({ error: 'owner mismatch' }, { status: 403 });
        return Response.json({ ok: true, projectId: PROJECT, projectName: session.name });
      }
      if (u.pathname === '/studio/link') return Response.json(session.link ?? { paired: false }, { status: session.linkStatus });
      return Response.json({ error: 'not found' }, { status: 404 });
    },
  }),
};
const pairingDo = {
  idFromName: (n) => { calls.push({ ns: 'PAIRING_DO', addressed: n }); return n; },
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      calls.push({ ns: 'PAIRING_DO', path: u.pathname, body: init?.body ? JSON.parse(init.body) : null });
      return Response.json(pairing.body, { status: pairing.status });
    },
  }),
};
const inert = { idFromName: (n) => n, get: () => ({ fetch: async () => Response.json({ ok: true }) }) };
/** Every audit event the worker shipped to the durable sink, so the row is observed and not assumed. */
let shipped = [];
const adminDo = {
  idFromName: () => 'singleton',
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      if (u.pathname === '/events' && init?.method === 'POST') {
        shipped.push(...JSON.parse(init.body).events);
        return Response.json({ ok: true, stored: 1, rejected: {} });
      }
      if (u.pathname === '/events') return Response.json({ events: [], retained: 0, truncated: false });
      return Response.json({ counters: [] });
    },
  }),
};
const ENV = () => ({
  ADMIN_KEY, ENVIRONMENT: 'test',
  // No SUPABASE_URL, no SUPABASE_SECRET_KEY: a route that reached for either would have nothing to use.
  SESSION_DO: sessionDo, PAIRING_DO: pairingDo, ADMIN_DO: adminDo, QUOTA_DO: inert, BUDGET_DO: inert, DISCORD_DO: inert,
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
});

async function mint(projectId, body, { key = ADMIN_KEY, raw } = {}) {
  const headers = { 'content-type': 'application/json', ...(key ? { 'X-Admin-Key': key } : {}) };
  const res = await app.fetch(
    new Request(`https://studpilot.test/api/admin/pairing/${projectId}`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) }),
    ENV(), CTX,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

const touchedDurableObjects = () => calls.filter((c) => c.addressed !== undefined || c.path !== undefined);

test('CONTROL: the owner named correctly gets a code, so the refusals below are not a broken route', async () => {
  fresh();
  const r = await mint(PROJECT, { userId: OWNER });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.code, 'K7M3QP');
  assert.equal(r.json.expiresAtIso, '2026-10-05T12:10:00.000Z');
});

test('no admin key, no code, and no Durable Object is addressed', async () => {
  fresh();
  for (const key of [null, 'wrong-key']) {
    const r = await mint(PROJECT, { userId: OWNER }, { key });
    assert.equal(r.status, 403);
    assert.deepEqual(touchedDurableObjects().filter((c) => c.ns !== 'ADMIN_DO'), [], 'a refused call must reach no session and no pairing object');
  }
});

test('the code is minted through PairingDO with the same body the user route sends', async () => {
  fresh();
  await mint(PROJECT, { userId: OWNER });
  const create = calls.find((c) => c.ns === 'PAIRING_DO' && c.path === '/create');
  assert.ok(create, 'PairingDO /create was never called');
  assert.deepEqual(create.body, { projectId: PROJECT, userId: OWNER, projectName: 'Tower Defence' },
    'projectName comes from the session, the owner from the request, and nothing else is sent');
});

test('a DIFFERENT owner is refused, and nothing is minted', async () => {
  fresh();
  const r = await mint(PROJECT, { userId: STRANGER });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /owner/i);
  assert.equal(calls.some((c) => c.ns === 'PAIRING_DO' && c.path === '/create'), false, 'a code must not be minted for the wrong owner');
});

test('a session with no owner on record is refused rather than adopting the named user', async () => {
  fresh();
  session.initialised = false;
  const r = await mint(PROJECT, { userId: OWNER });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /session|open/i);
  assert.equal(calls.some((c) => c.ns === 'PAIRING_DO' && c.path === '/create'), false);
});

test('a project id or owner id that is not a UUID is a 400 before any Durable Object is named', async () => {
  for (const [projectId, body, raw] of [
    ['not-a-uuid', { userId: OWNER }],
    [PROJECT, { userId: 'someone' }],
    [PROJECT, {}],
    [PROJECT, { userId: 42 }],
    [PROJECT, undefined, '{not json'],
  ]) {
    fresh();
    const r = await mint(projectId, body, { raw });
    assert.equal(r.status, 400, `${projectId} ${JSON.stringify(body ?? raw)} was not refused`);
    assert.deepEqual(touchedDurableObjects(), [], 'an invalid id must never become a Durable Object name');
  }
});

test('the ids are lower-cased and trimmed before a Durable Object is named: an upper-case id must not address another session', async () => {
  // UUID_RE is case-insensitive but a Durable Object name is not, and the user routes name the session by the database's
  // lower-case id: an upper-case project id would reach a different, never-initialised session and answer a misleading 409.
  // Each case changes ONE thing about ONE id, so removing the trim or the lower-casing of the project id or of the owner id turns
  // exactly the case that depends on it red (UUID_RE refuses a padded id).
  const pad = (id) => encodeURIComponent(` \n${id}\t `); // the id as a caller can put it in the path: spaces, a newline, a tab
  for (const [label, projectId, userId] of [
    ['an upper-case project id', PROJECT.toUpperCase(), OWNER],
    ['a padded project id', pad(PROJECT), OWNER],
    ['an upper-case owner id', PROJECT, OWNER.toUpperCase()],
    ['a padded owner id', PROJECT, ` \n${OWNER}\t `],
    ['both ids padded and upper-case', pad(PROJECT.toUpperCase()), ` ${OWNER.toUpperCase()} `],
  ]) {
    fresh();
    const r = await mint(projectId, { userId });
    assert.equal(r.status, 200, `${label}: ${JSON.stringify(r.json)}`);
    const addressed = calls.filter((c) => c.addressed !== undefined && c.ns === 'SESSION_DO').map((c) => c.addressed);
    assert.deepEqual(addressed, [PROJECT], `${label}: the session is named by the lower-case, trimmed id`);
    assert.deepEqual(calls.find((c) => c.path === '/owner-check').body, { userId: OWNER }, `${label}: the owner is asked about in lower case, trimmed`);
    assert.deepEqual(calls.find((c) => c.ns === 'PAIRING_DO' && c.path === '/create').body, { projectId: PROJECT, userId: OWNER, projectName: 'Tower Defence' }, `${label}: and the minted code carries the lower-case ids`);
  }
});

test('the 429 for too many live codes is passed through unchanged', async () => {
  fresh();
  pairing = { status: 429, body: { error: 'too many active codes' } };
  const r = await mint(PROJECT, { userId: OWNER });
  assert.equal(r.status, 429);
  assert.equal(r.json.error, 'too many active codes');
});

test('a live pairing is reported as existingLink, exactly as the user route reports it', async () => {
  fresh();
  session.link = { paired: true, connected: true, pluginVersion: '0.2.0', place: { placeName: 'Tower Defence' } };
  const r = await mint(PROJECT, { userId: OWNER });
  assert.equal(r.json.existingLink.connected, true);
  assert.equal(r.json.existingLink.place.placeName, 'Tower Defence');
  fresh();
  const none = await mint(PROJECT, { userId: OWNER });
  assert.equal(none.json.existingLink, null, 'nothing paired is reported as null, not as an empty-looking link');
  fresh();
  session.linkStatus = 500;
  const unknown = await mint(PROJECT, { userId: OWNER });
  assert.equal(unknown.status, 200, 'failing to read the link must not cost the caller their code');
  assert.equal(unknown.json.existingLink, null);
});

test('the owner is checked inside the session: the owner id is never read back out of it', async () => {
  fresh();
  const r = await mint(PROJECT, { userId: OWNER });
  assert.equal(JSON.stringify(r.json).includes(OWNER), false, 'the response must not echo the owner id');
  const paths = calls.filter((c) => c.ns === 'SESSION_DO' && c.path).map((c) => c.path);
  assert.deepEqual(paths, ['/owner-check', '/studio/link'], 'the route asks the session two questions and no more');
});

test('the route adds no Supabase call and no use of SUPABASE_SECRET_KEY', () => {
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  const start = src.indexOf("app.post('/api/admin/pairing/:id'");
  assert.ok(start > 0, 'the route is not registered');
  const end = src.indexOf('\napp.', start + 10);
  const body = src.slice(start, end > 0 ? end : undefined);
  assert.equal(/SUPABASE|getOwnedProject|supa\b|fetch\(\s*['"`]https?:\/\/(?!do\/)/.test(body), false,
    'the admin pairing route must not reach Supabase or any outside host; the session is the only authority it asks');
  assert.equal(src.split("'/api/admin/pairing/:id'").length - 1, 1, 'the route must be registered exactly once');
});

test('the audit row, as shipped, names the owner the code was minted for', async () => {
  fresh();
  shipped = [];
  await mint(PROJECT, { userId: OWNER });
  await app.fetch(new Request('https://studpilot.test/api/admin/logs?kind=audit', { headers: { 'X-Admin-Key': ADMIN_KEY } }), ENV(), CTX);
  const row = shipped.find((e) => e.kind === 'audit' && String(e.action).includes('admin.pairing'));
  assert.ok(row, `no admin.pairing audit row reached the sink: ${JSON.stringify(shipped.map((e) => e.action))}`);
  assert.equal(row.subject, OWNER);
  assert.equal(row.allowed, true);
});

test('the audit call precedes the mint in the route body', () => {
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  const start = src.indexOf("app.post('/api/admin/pairing/:id'");
  const body = src.slice(start, src.indexOf('\napp.', start + 10));
  const audit = body.indexOf("auditAdminAction(c, 'admin.pairing'");
  assert.ok(audit > 0, 'no audit row is filed by the route');
  assert.ok(audit < body.indexOf('mintPairingCode'), 'the attempt must be on record before the code exists');
});

// ------------------------------------------------------------ the session's half, executed ---
// The route above trusts `/owner-check`; these run the real SessionDO so the trust is earned.

const SESSION_OUT = join(tmpdir(), `studpilot-admin-pairing-session-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: SESSION_OUT, logLevel: 'silent',
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
});
const { SessionDO } = await import(`file://${SESSION_OUT}`);
process.on('exit', () => rmSync(SESSION_OUT, { force: true }));

function sessionWith(bind) {
  const store = new Map(bind ? [['bind', bind]] : []);
  const ctx = {
    storage: {
      async get(k) { return store.get(k); },
      async put(a, b) { store.set(a, b); },
      async delete(k) { store.delete(k); },
      async list() { return new Map(); },
      setAlarm() {}, getAlarm() { return null; },
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
    acceptWebSocket() {},
  };
  return Object.assign(new SessionDO(ctx, {}), { store });
}
const ownerCheck = async (s, userId) => {
  const res = await s.fetch(new Request('https://do/owner-check', { method: 'POST', body: JSON.stringify({ userId }) }));
  return { status: res.status, json: await res.json() };
};

test('SESSION: /owner-check says yes to the owner, names the project, and does not say who the owner is', async () => {
  const s = sessionWith({ projectId: PROJECT, projectName: 'Tower Defence', ownerId: OWNER });
  const r = await ownerCheck(s, OWNER);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, projectId: PROJECT, projectName: 'Tower Defence' });
});

test('SESSION: /owner-check says no to anyone else, to a missing id and to a non-string', async () => {
  const s = sessionWith({ projectId: PROJECT, projectName: 'Tower Defence', ownerId: OWNER });
  for (const who of [STRANGER, '', undefined, 42, null, OWNER.toUpperCase()]) {
    const r = await ownerCheck(s, who);
    assert.equal(r.status, 403, `${String(who)} was let through`);
    assert.equal(JSON.stringify(r.json).includes(OWNER), false, 'a refusal must not leak the owner id');
  }
});

test('SESSION: a session that was never initialised answers 400, never adopts a caller, and writes nothing', async () => {
  const s = sessionWith(null);
  const r = await ownerCheck(s, OWNER);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /not initialized/);
  assert.equal(s.store.size, 0, 'durable storage is still empty: no bind was written on behalf of the caller');
  // and a second call, by someone else, is refused the same way: the first did not adopt anyone
  const other = await ownerCheck(s, STRANGER);
  assert.equal(other.status, 400);
  assert.equal(s.store.size, 0);
  assert.equal(s.store.has('bind'), false);
});
