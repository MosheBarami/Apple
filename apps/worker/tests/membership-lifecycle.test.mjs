/**
 * THE MEMBERSHIP SURFACE, OVER HTTP, AS THE PERSON WHO MUST BE REFUSED.
 *
 * tests/collab-routes.test.mjs proves that the shared routes ask the access question. This file is
 * about what happens AFTER the answer is yes: removing somebody, pausing them, letting them back
 * in, and whether any of it is recorded.
 *
 * THE BUG THIS FILE WAS WRITTEN FOR. Access is resolved from two stores — `getProjectAccess`
 * merges Postgres membership rows with the grants a redeemed share link minted in KV — and
 * `DELETE /members/:userId` only ever PATCHed one of them. A member who came in through a link was
 * "revoked" by a route that never touched their grant and kept every capability they had. The test
 * that sat next to it asserted the intended division of labour IN A COMMENT — "that is a
 * membership revocation, and the route above does it" — about a route that did not do it. Here it
 * is asked instead of asserted.
 *
 * The Durable Object stub runs the REAL CollabStore over a real SQLite database (node:sqlite), so
 * the impact preview's counts are counted by the query that ships, not by a fake that agrees.
 *
 * Run with:  node --test tests/membership-lifecycle.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import { CollabStore, collabContext } from '../src/do/collab-store.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const TMP = mkdtempSync(join(tmpdir(), 'golem-membership-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(
  ESBUILD,
  [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);
const APP = (await import(`file://${OUT}`)).default;

// --------------------------------------------------------------------------- identities
const SUPABASE_URL = 'https://supa.membership.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const EXTRA_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'membership-test', alg: 'ES256', use: 'sig' };
const mint = (sub) =>
  new jose.SignJWT({ email: `${sub}@golem.test`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'membership-test' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

const OWNER_JWT = await mint(OWNER_ID);
const MEMBER_JWT = await mint(MEMBER_ID);
const STRANGER_JWT = await mint(STRANGER_ID);
const ADMIN_JWT = await mint(ADMIN_ID);
const EXTRA_JWT = await mint(EXTRA_ID);

// --------------------------------------------------------------------------- the fake edge
const PROJECT_ROW = { id: PROJECT_ID, owner_id: OWNER_ID, name: 'Shared Place', place_name: null, memory_summary: null, memory_facts: [] };

let memberRows = [];
let eventRows = [];
/** Tables PostgREST should fail for, so "the write worked" can be told from "we said it did". */
let failTable = new Set();
const kv = new Map();
/** KV can be unreachable; an empty list from a failed read must not read as "no guests". */
let kvListFails = false;

function parseQuery(url) {
  const u = new URL(url);
  const eq = {};
  for (const [k, v] of u.searchParams.entries()) {
    if (typeof v === 'string' && v.startsWith('eq.')) eq[k] = decodeURIComponent(v.slice(3));
  }
  return { eq, params: u.searchParams };
}

const MEMBER_DEFAULTS = {
  display_name: null,
  invited_by: OWNER_ID,
  created_at: '2026-09-01T00:00:00.000Z',
  expires_at: null,
  revoked_at: null,
  suspended_at: null,
  suspended_reason: null,
  suspended_by: null,
};

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init?.method ?? (typeof input === 'string' ? 'GET' : input.method) ?? 'GET').toUpperCase();
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });

  if (url.includes('/rest/v1/projects')) {
    const { eq } = parseQuery(url);
    if (eq.id !== PROJECT_ID) return json([]);
    if (eq.owner_id !== undefined && eq.owner_id !== PROJECT_ROW.owner_id) return json([]);
    return json([PROJECT_ROW]);
  }

  if (url.includes('/rest/v1/membership_events')) {
    if (failTable.has('membership_events')) return json({ message: 'nope' }, 500);
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      // THE REAL SHAPE: the route posts an ARRAY. A fake that only understood one object would
      // make every bulk audit look like a single event.
      const rows = Array.isArray(body) ? body : [body];
      for (const r of rows) eventRows.push({ ...r, created_at: r.created_at ?? new Date().toISOString() });
      return json([], 201);
    }
    const { eq, params } = parseQuery(url);
    let rows = eventRows.filter((r) => r.project_id === eq.project_id);
    if (eq.subject_id !== undefined) rows = rows.filter((r) => r.subject_id === eq.subject_id);
    if ((params.get('order') ?? '').startsWith('created_at.desc')) {
      rows = [...rows].reverse();
    }
    const limit = Number(params.get('limit') ?? 100);
    return json(rows.slice(0, limit));
  }

  if (url.includes('/rest/v1/project_members')) {
    if (failTable.has('project_members')) return json({ message: 'nope' }, 500);
    const { eq } = parseQuery(url);
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const rows = Array.isArray(body) ? body : [body];
      for (const row of rows) {
        // merge-duplicates on (project_id, user_id): the real overwrite, so a route that relied on
        // the previous row still being there fails here as it would in production.
        memberRows = [...memberRows.filter((r) => r.user_id !== row.user_id), { ...MEMBER_DEFAULTS, ...row }];
      }
      return json(rows, 201);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      let touched = 0;
      memberRows = memberRows.map((r) => {
        if (r.user_id !== eq.user_id || r.project_id !== eq.project_id) return r;
        touched++;
        return { ...r, ...patch };
      });
      return json(touched === 0 ? [] : memberRows.filter((r) => r.user_id === eq.user_id), 200);
    }
    let rows = memberRows.filter((r) => r.project_id === (eq.project_id ?? PROJECT_ID));
    if (eq.user_id !== undefined) rows = rows.filter((r) => r.user_id === eq.user_id);
    return json(rows);
  }

  if (url.includes('/rest/v1/profiles')) return json([{ id: OWNER_ID, plan: 'free', is_admin: false, display_name: 'maya' }]);
  return json([]);
};

// --------------------------------------------------------------------------- the Durable Object
/** A SqlStorage-shaped adapter over node:sqlite — the same one tests/collab-store.test.mjs uses. */
function sqlite() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query, ...bindings) {
      if (bindings.length === 0 && /;[\s\S]*\S/.test(query.trim().replace(/;\s*$/, ''))) {
        db.exec(query);
        return { toArray: () => [], one: () => ({}) };
      }
      const stmt = db.prepare(query);
      const rows = stmt.all(...bindings);
      return { toArray: () => rows, one: () => rows[0] ?? {} };
    },
  };
}

let store = null;
let doWrites = 0;
function sessionNamespace() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    get: () => ({
      async fetch(url, init) {
        const u = new URL(typeof url === 'string' ? url : url.url);
        let body = null;
        try {
          body = init?.body ? JSON.parse(init.body) : null;
        } catch {
          body = null;
        }
        if (u.pathname === '/init') return new Response(JSON.stringify({ ok: true }), { status: 200 });
        if (u.pathname === '/collab' && body) {
          if (body.method !== 'GET') doWrites++;
          // THE REAL STORE, over a real database. The impact preview's numbers are produced by the
          // query that ships; a stub returning plausible counts would prove nothing about it.
          const ctx = collabContext(body.userId, body.role, Date.now(), body.directory);
          const out = store.handle(body.method, body.path, body.body ?? {}, ctx);
          return new Response(JSON.stringify(out.body), { status: out.status });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    }),
  };
}

const env = () => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  KV: {
    get: async (k) => kv.get(k) ?? null,
    put: async (k, v) => void kv.set(k, v),
    delete: async (k) => void kv.delete(k),
    list: async ({ prefix = '', limit = 1000 } = {}) => {
      if (kvListFails) throw new Error('kv unreachable');
      const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys: keys.slice(0, limit), list_complete: keys.length <= limit };
    },
  },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  CORPUS: {
    exec: async () => ({}),
    prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }),
    batch: async () => [],
  },
  VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
  SESSION_DO: sessionNamespace(),
  QUOTA_DO: sessionNamespace(),
  PAIRING_DO: sessionNamespace(),
  ADMIN_DO: sessionNamespace(),
  BUDGET_DO: sessionNamespace(),
});

async function call(path, { method = 'GET', jwt, body, headers = {} } = {}) {
  const h = { ...headers };
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    env(),
  );
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json: parsed, text };
}

function reset({ members = [] } = {}) {
  memberRows = members.map((m) => ({ project_id: PROJECT_ID, ...MEMBER_DEFAULTS, ...m }));
  eventRows = [];
  failTable = new Set();
  kv.clear();
  kvListFails = false;
  store = new CollabStore(sqlite());
  doWrites = 0;
}

const M = `/api/shared/${PROJECT_ID}/members`;

/** Mint a link and redeem it as `jwt`. Returns the token. */
async function linkFor(jwt, role = 'commenter') {
  const minted = await call(`/api/shared/${PROJECT_ID}/links`, { method: 'POST', jwt: OWNER_JWT, body: { scope: 'project', role } });
  assert.equal(minted.status, 201, 'fixture: the link must mint');
  const redeemed = await call('/api/shared/links/redeem', { method: 'POST', jwt, body: { token: minted.json.token } });
  assert.equal(redeemed.status, 201, 'fixture: the link must redeem');
  return minted.json.token;
}

// =============================================================== the revocation gap

test('REMOVING A MEMBER ENDS THE GRANT THEIR LINK MINTED, not just the row in Postgres', async () => {
  reset();
  const token = await linkFor(STRANGER_JWT);
  // The grant is real: they can read the project.
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 200);
  assert.equal(memberRows.length, 0, 'fixture: their access comes from KV alone, so only KV can end it');

  const removed = await call(`${M}/${STRANGER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(removed.status, 200);
  assert.equal(removed.json.linkGrantRevoked, true, 'the route must say it revoked the link grant');

  const after = await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT });
  assert.equal(after.status, 404, 'a removed member is a stranger again, however they got in');

  // …and the same link does not undo the removal.
  const again = await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token } });
  assert.equal(again.status, 403);
  assert.equal(again.json.error, 'removed_from_project');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 404, 'still out');
});

test('THE CONTROL: without a removal the same link redeems twice, so the refusal above is the bar', async () => {
  // Without this, "the second redeem was refused" could be true of any second redeem, and the test
  // above would pass against a route that refuses everybody.
  reset();
  const token = await linkFor(STRANGER_JWT);
  const again = await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token } });
  assert.equal(again.status, 201, 'a link with no removal against it redeems again');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 200);
});

test('a removal reaches Postgres AND KV when the person holds both kinds of grant', async () => {
  reset({ members: [{ user_id: STRANGER_ID, role: 'viewer' }] });
  await linkFor(STRANGER_JWT, 'editor');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).json.role, 'editor', 'the stronger grant is in force');

  const removed = await call(`${M}/${STRANGER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(removed.status, 200);
  assert.equal(removed.json.linkGrantRevoked, true);
  assert.notEqual(memberRows.find((r) => r.user_id === STRANGER_ID).revoked_at, null, 'the Postgres row is revoked too');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 404);
});

test('the owner cannot be removed or suspended by anybody, including themselves', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  for (const jwt of [OWNER_JWT, ADMIN_JWT]) {
    const gone = await call(`${M}/${OWNER_ID}`, { method: 'DELETE', jwt });
    assert.equal(gone.status, 400);
    assert.equal(gone.json.error, 'owner_is_not_a_member');
    const paused = await call(`${M}/${OWNER_ID}/suspend`, { method: 'POST', jwt, body: { reason: 'x' } });
    assert.equal(paused.status, 400);
    assert.equal(paused.json.error, 'owner_cannot_be_suspended');
  }
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: OWNER_JWT })).status, 200, 'the owner still owns it');
});

// =============================================================== suspension and reactivation

test('a SUSPENDED member is refused like a stranger, and is not confused with a removed one', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 200);

  const paused = await call(`${M}/${MEMBER_ID}/suspend`, { method: 'POST', jwt: OWNER_JWT, body: { reason: 'under review' } });
  assert.equal(paused.status, 200);
  assert.equal(paused.json.suspended, true);
  assert.equal(paused.json.reason, 'under review');

  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 404, 'a suspension closes the door');

  const roster = await call(`${M}?status=all`, { jwt: OWNER_JWT });
  const row = roster.json.members.find((m) => m.userId === MEMBER_ID);
  assert.equal(row.status, 'suspended', 'and it is NOT reported as revoked');
  assert.equal(row.role, 'editor', 'the role they hold is still visible, which is what reinstatement restores');
  assert.equal(row.suspendedReason, 'under review');
  assert.equal(row.suspendedBy, OWNER_ID, 'who did it is recorded');
  assert.ok(row.suspendedAt, 'and when');
  assert.equal(memberRows.find((r) => r.user_id === MEMBER_ID).revoked_at, null, 'suspension must not write revocation');
});

test('reactivation brings them back AT THE ROLE THEY HAD, without being told what it was', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  await call(`${M}/${MEMBER_ID}/suspend`, { method: 'POST', jwt: OWNER_JWT, body: { reason: 'pause' } });
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 404);

  const back = await call(`${M}/${MEMBER_ID}/reactivate`, { method: 'POST', jwt: OWNER_JWT, body: {} });
  assert.equal(back.status, 200);
  assert.equal(back.json.role, 'editor', 'the role comes from the stored grant, not from the request');

  const now = await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT });
  assert.equal(now.status, 200);
  assert.equal(now.json.role, 'editor');
  const row = memberRows.find((r) => r.user_id === MEMBER_ID);
  assert.equal(row.suspended_at, null);
  assert.equal(row.suspended_reason, null);
  assert.equal(row.suspended_by, null);
});

test('a GUEST can be suspended and reactivated too — the grant in KV obeys the same rule', async () => {
  reset();
  await linkFor(STRANGER_JWT, 'editor');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 200);

  const paused = await call(`${M}/${STRANGER_ID}/suspend`, { method: 'POST', jwt: OWNER_JWT, body: { reason: 'spam' } });
  assert.equal(paused.status, 200);
  assert.equal(paused.json.linkGrantSuspended, true);
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 404, 'a suspended guest is out');

  const back = await call(`${M}/${STRANGER_ID}/reactivate`, { method: 'POST', jwt: OWNER_JWT, body: {} });
  assert.equal(back.status, 200);
  assert.equal(back.json.linkGrantRestored, true);
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 200, 'and back in at the same role');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).json.role, 'editor');
});

test('reactivating somebody who was never here is a 404, not a cheerful ok', async () => {
  // A PATCH that matches no row SUCCEEDS. Without this check both routes would answer `ok: true`
  // for a stranger and an admin would believe they had restored an account that does not exist.
  reset();
  for (const path of [`${M}/${EXTRA_ID}/reactivate`, `${M}/${EXTRA_ID}/suspend`]) {
    const res = await call(path, { method: 'POST', jwt: OWNER_JWT, body: {} });
    assert.equal(res.status, 404, `${path} must refuse`);
    assert.equal(res.json.error, 'not_a_member');
  }
  assert.equal(eventRows.length, 0, 'and nothing was written to the history about them');
});

test('a member cannot suspend, reactivate or remove anybody — it is manage_members or nothing', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }, { user_id: EXTRA_ID, role: 'viewer' }] });
  for (const [method, path] of [
    ['DELETE', `${M}/${EXTRA_ID}`],
    ['POST', `${M}/${EXTRA_ID}/suspend`],
    ['POST', `${M}/${EXTRA_ID}/reactivate`],
    ['POST', `${M}/bulk`],
    ['GET', `${M}/${EXTRA_ID}/impact`],
  ]) {
    const res = await call(path, { method, jwt: MEMBER_JWT, body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 403, `${method} ${path} must refuse an editor`);
  }
  // …and a stranger is told nothing at all.
  for (const [method, path] of [
    ['DELETE', `${M}/${EXTRA_ID}`],
    ['POST', `${M}/${EXTRA_ID}/suspend`],
    ['GET', `${M}/${EXTRA_ID}/impact`],
  ]) {
    const res = await call(path, { method, jwt: STRANGER_JWT, body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 404, `${method} ${path} must not confirm the project to a stranger`);
  }
  assert.equal(memberRows.find((r) => r.user_id === EXTRA_ID).revoked_at, null, 'nothing was revoked');
});

// =============================================================== the history

test('the history records what CHANGED, including the role that was overwritten', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  const invited = await call(M, { method: 'POST', jwt: ADMIN_JWT, body: { userId: MEMBER_ID, role: 'viewer' } });
  assert.equal(invited.json.event, 'invited');
  assert.equal(invited.json.audited, true);

  const promoted = await call(M, { method: 'POST', jwt: ADMIN_JWT, body: { userId: MEMBER_ID, role: 'editor' } });
  assert.equal(promoted.json.event, 'role_changed', 'the same route, a different event — decided from the row it landed on');

  await call(`${M}/${MEMBER_ID}/suspend`, { method: 'POST', jwt: ADMIN_JWT, body: { reason: 'noisy' } });
  await call(`${M}/${MEMBER_ID}/reactivate`, { method: 'POST', jwt: ADMIN_JWT, body: {} });
  await call(`${M}/${MEMBER_ID}`, { method: 'DELETE', jwt: ADMIN_JWT });

  const history = await call(`${M}/events?userId=${MEMBER_ID}`, { jwt: ADMIN_JWT });
  assert.equal(history.status, 200);
  const kinds = history.json.events.map((e) => e.kind);
  assert.deepEqual(kinds, ['removed', 'reactivated', 'suspended', 'role_changed', 'invited'], 'newest first');

  const change = history.json.events.find((e) => e.kind === 'role_changed');
  assert.equal(change.fromRole, 'viewer', 'THE PREVIOUS ROLE — the one the merge overwrote and nothing else remembers');
  assert.equal(change.toRole, 'editor');
  assert.equal(change.actorId, ADMIN_ID, 'who did it');
  assert.ok(change.at, 'and when');
  assert.equal(history.json.events.find((e) => e.kind === 'suspended').reason, 'noisy');
  assert.equal(history.json.events.find((e) => e.kind === 'removed').fromRole, 'editor');
});

test('ACCEPTANCE is audited, and the history never hands back the secret that was accepted', async () => {
  reset();
  const token = await linkFor(STRANGER_JWT, 'commenter');
  const history = await call(`${M}/events`, { jwt: OWNER_JWT });
  assert.equal(history.status, 200);
  const accepted = history.json.events.filter((e) => e.kind === 'link_accepted');
  assert.equal(accepted.length, 1, 'redeeming a link is the only acceptance this product has, and it is recorded');
  assert.equal(accepted[0].subjectId, STRANGER_ID);
  assert.equal(accepted[0].toRole, 'commenter');
  assert.equal(accepted[0].source, 'grant', 'and it says which store it came from');
  assert.ok(accepted[0].at);
  assert.equal(history.text.includes(token), false, 'a bearer token must never come back out of an audit view');
  // Asking about that one person finds it too.
  const mine = await call(`${M}/events?userId=${STRANGER_ID}`, { jwt: OWNER_JWT });
  assert.deepEqual(mine.json.events.map((e) => e.kind), ['link_accepted']);
});

test('a member may read their OWN history and nobody else’s', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }, { user_id: EXTRA_ID, role: 'viewer' }] });
  await call(M, { method: 'POST', jwt: OWNER_JWT, body: { userId: MEMBER_ID, role: 'editor' } });

  const own = await call(`${M}/events?userId=${MEMBER_ID}`, { jwt: MEMBER_JWT });
  assert.equal(own.status, 200, 'a person can see what was done to them');

  const someone = await call(`${M}/events?userId=${EXTRA_ID}`, { jwt: MEMBER_JWT });
  assert.equal(someone.status, 403, 'auditing a colleague needs manage_members');
  const all = await call(`${M}/events`, { jwt: MEMBER_JWT });
  assert.equal(all.status, 403, 'and so does the project-wide history');
  // A REFUSAL, NOT AN EMPTY LIST. An empty list reads as "nothing ever happened to them".
  assert.equal(Array.isArray(someone.json.events), false);
});

test('AN UNRECORDED CHANGE IS REPORTED AS UNRECORDED, never as recorded', async () => {
  // The membership write has already happened; a failed audit insert must not be swallowed and
  // must not be claimed. `audited: true` over a 500 is exactly the shape this repository hunts.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  failTable.add('membership_events');
  const removed = await call(`${M}/${MEMBER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(removed.status, 200, 'the removal itself still happened');
  assert.equal(removed.json.audited, false, 'and the answer says the history does not have it');
  assert.equal(eventRows.length, 0);
  // The control: with the table reachable, the same call reports true.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  const ok = await call(`${M}/${MEMBER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(ok.json.audited, true);
  assert.equal(eventRows.length, 1);
});

// =============================================================== the roster

test('the roster shows the rows a directory hides, and filters them', async () => {
  reset({
    members: [
      { user_id: MEMBER_ID, role: 'editor' },
      { user_id: ADMIN_ID, role: 'admin', revoked_at: '2026-09-02T00:00:00.000Z' },
      { user_id: EXTRA_ID, role: 'viewer', expires_at: '2020-01-01T00:00:00.000Z' },
    ],
  });
  await linkFor(STRANGER_JWT, 'commenter');

  const live = await call(M, { jwt: OWNER_JWT });
  assert.equal(live.status, 200);
  assert.deepEqual(live.json.members.map((m) => m.userId).sort(), [OWNER_ID, MEMBER_ID, STRANGER_ID].sort());
  assert.equal(live.json.total, 5, 'the count of everything is reported even when the list is narrowed');
  assert.equal(live.json.matched, 3);

  const all = await call(`${M}?status=all`, { jwt: OWNER_JWT });
  assert.equal(all.json.members.length, 5);
  const byId = Object.fromEntries(all.json.members.map((m) => [m.userId, m]));
  assert.equal(byId[ADMIN_ID].status, 'revoked');
  assert.equal(byId[EXTRA_ID].status, 'expired');
  assert.equal(byId[STRANGER_ID].guest, true, 'the guest is marked as one');
  assert.equal(byId[STRANGER_ID].origin, 'link');
  assert.ok(byId[STRANGER_ID].acceptedAt, 'and carries when they let themselves in');
  assert.equal(byId[MEMBER_ID].guest, false);

  assert.deepEqual((await call(`${M}?status=revoked`, { jwt: OWNER_JWT })).json.members.map((m) => m.userId), [ADMIN_ID]);
  assert.deepEqual((await call(`${M}?origin=link&status=all`, { jwt: OWNER_JWT })).json.members.map((m) => m.userId), [STRANGER_ID]);
  assert.deepEqual((await call(`${M}?q=maya`, { jwt: OWNER_JWT })).json.members.map((m) => m.userId), [OWNER_ID]);
  const page = await call(`${M}?status=all&limit=2`, { jwt: OWNER_JWT });
  assert.equal(page.json.members.length, 2);
  assert.equal(page.json.more, true);
});

test('a filter this route cannot read is a 400, never a list that looks like an answer', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  for (const [qs, error] of [
    ['status=revokd', 'bad_status'],
    ['role=superuser', 'bad_role'],
    ['origin=ftp', 'bad_origin'],
    ['limit=0', 'bad_limit'],
    ['limit=nine', 'bad_limit'],
    ['offset=-1', 'bad_offset'],
  ]) {
    const res = await call(`${M}?${qs}`, { jwt: OWNER_JWT });
    assert.equal(res.status, 400, `?${qs} must be refused`);
    assert.equal(res.json.error, error);
  }
});

test('the dead rows are administrative: an ordinary member is refused, not quietly narrowed', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }, { user_id: EXTRA_ID, role: 'viewer', revoked_at: '2026-09-02T00:00:00.000Z' }] });
  const live = await call(M, { jwt: MEMBER_JWT });
  assert.equal(live.status, 200, 'the live roster is everybody’s');
  assert.equal(live.json.members.some((m) => m.userId === EXTRA_ID), false);

  const asking = await call(`${M}?status=revoked`, { jwt: MEMBER_JWT });
  assert.equal(asking.status, 403, 'and the revoked list is not');
  assert.equal(asking.json.detail, 'status_filter_needs_manage_members');
});

test('KV UNREACHABLE IS SAID OUT LOUD, not rendered as a project with no guests', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  await linkFor(STRANGER_JWT, 'commenter');
  const good = await call(M, { jwt: OWNER_JWT });
  assert.equal(good.json.partial, false);
  assert.equal(good.json.members.some((m) => m.userId === STRANGER_ID), true);

  kvListFails = true;
  const bad = await call(M, { jwt: OWNER_JWT });
  assert.equal(bad.status, 200, 'the Postgres half is still answerable');
  assert.equal(bad.json.members.some((m) => m.userId === STRANGER_ID), false, 'fixture: the guest is genuinely missing now');
  assert.equal(bad.json.partial, true, 'A SHORTER LIST MUST NEVER READ AS A COMPLETE ONE');
  assert.deepEqual(bad.json.incomplete, ['link_grants'], 'and it says which store it could not read');
});

// =============================================================== bulk invitations

test('a batch invites everybody it accepted and names every row it refused', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  const res = await call(`${M}/bulk`, {
    method: 'POST',
    jwt: ADMIN_JWT,
    body: {
      members: [
        { userId: MEMBER_ID, role: 'editor' },
        { userId: EXTRA_ID, role: 'viewer', expiresAt: '2099-01-01T00:00:00.000Z' },
        { userId: 'not-a-uuid', role: 'viewer' },
        { userId: OWNER_ID, role: 'admin' },
        { userId: STRANGER_ID, role: 'owner' },
      ],
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.applied, true);
  assert.deepEqual(res.json.invited.map((r) => r.userId), [MEMBER_ID, EXTRA_ID]);
  assert.deepEqual(
    res.json.rejected.map((r) => [r.index, r.error]),
    [[2, 'bad_user'], [3, 'owner_is_not_a_member'], [4, 'unknown_role']],
  );
  assert.equal(res.json.audited, true);
  // THE INVITATIONS ARE REAL — asked as the people who were invited, not read off the response.
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).json.role, 'editor');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: EXTRA_JWT })).json.role, 'viewer');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 404, 'the refused row was not written');
  assert.equal(eventRows.filter((e) => e.kind === 'invited').length, 2, 'both invitations are in the history');
});

test('an oversized batch is refused WHOLE — nothing is written and nothing is claimed', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  const members = [];
  for (let i = 0; i < 60; i++) members.push({ userId: `${i % 10}0000000-0000-4000-8000-00000000000${i % 10}`, role: 'viewer' });
  const res = await call(`${M}/bulk`, { method: 'POST', jwt: ADMIN_JWT, body: { members } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'too_many');
  assert.ok(res.json.max >= 1, 'the cap is reported so a client can split the batch');
  assert.equal(memberRows.length, 1, 'only the admin fixture row exists — nothing was truncated and written');
});

test('a batch of entirely bad rows writes nothing and says so', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  const res = await call(`${M}/bulk`, { method: 'POST', jwt: ADMIN_JWT, body: { members: [{ userId: 'x' }, { userId: OWNER_ID, role: 'viewer' }] } });
  assert.equal(res.status, 400);
  assert.equal(res.json.applied, false);
  assert.equal(res.json.rejected.length, 2);
  assert.equal(memberRows.length, 1);
});

// =============================================================== the impact preview

test('the impact preview counts what the departing member actually holds, and writes nothing', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }, { user_id: ADMIN_ID, role: 'admin' }] });
  // Real work by the member, through the real store.
  await call(`/api/shared/${PROJECT_ID}/comments`, { method: 'POST', jwt: MEMBER_JWT, body: { targetKind: 'build', targetId: 'b-1', body: 'first' } });
  await call(`/api/shared/${PROJECT_ID}/comments`, { method: 'POST', jwt: MEMBER_JWT, body: { targetKind: 'build', targetId: 'b-1', body: 'second' } });
  await call(`/api/shared/${PROJECT_ID}/versions`, { method: 'POST', jwt: MEMBER_JWT, body: { label: 'theirs' } });
  await call(`/api/shared/${PROJECT_ID}/reviews`, {
    method: 'POST',
    jwt: MEMBER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', reviewers: [ADMIN_ID] },
  });
  //[[ SOMEBODY ELSE'S WORK, IN THE SAME PROJECT — and the reason it is here.
  //
  //   Without it every count below is also the count of EVERYTHING, and a footprint query that
  //   forgot its `where author_id = ?` produces exactly the same numbers. Measured: dropping the
  //   author filter from the comment count left this test green. A preview that cannot tell one
  //   member's work from the project's is a confirmation dialog describing the wrong person. ]]
  await call(`/api/shared/${PROJECT_ID}/comments`, { method: 'POST', jwt: ADMIN_JWT, body: { targetKind: 'build', targetId: 'b-1', body: 'theirs' } });
  await call(`/api/shared/${PROJECT_ID}/comments`, { method: 'POST', jwt: OWNER_JWT, body: { targetKind: 'build', targetId: 'b-2', body: 'mine' } });
  await call(`/api/shared/${PROJECT_ID}/versions`, { method: 'POST', jwt: ADMIN_JWT, body: { label: 'not theirs' } });
  await call(`/api/shared/${PROJECT_ID}/versions`, { method: 'POST', jwt: MEMBER_JWT, body: { label: 'theirs again' } });
  const writesBefore = doWrites;

  const impact = await call(`${M}/${MEMBER_ID}/impact`, { jwt: OWNER_JWT });
  assert.equal(impact.status, 200);
  assert.equal(impact.json.footprintAvailable, true);
  // FOUR comments and THREE versions exist in the project; two and two are theirs.
  assert.equal(impact.json.footprint.comments, 2, 'their comments, not the project\'s');
  assert.equal(impact.json.footprint.openComments, 2);
  assert.equal(impact.json.footprint.versions, 2, 'their versions, not the project\'s');
  assert.equal(impact.json.footprint.authorsCurrentHead, true, 'the project is sitting on a version they authored');
  assert.equal(impact.json.footprint.reviewsRequested, 1);
  // The control on the control: the OWNER, who wrote one comment and no version, must come back
  // with different numbers — otherwise every count above could be a project-wide total.
  const onOwner = await call(`${M}/${OWNER_ID}/impact`, { jwt: OWNER_JWT });
  assert.equal(onOwner.json.footprint.comments, 1);
  assert.equal(onOwner.json.footprint.versions, 0);
  assert.equal(onOwner.json.footprint.authorsCurrentHead, false);
  assert.equal(impact.json.member.role, 'editor', 'and what they are to the project today');
  assert.equal(impact.json.member.status, 'active');
  assert.equal(impact.json.effects.accessEndsImmediately, true);
  assert.equal(impact.json.effects.historyRetained, true);

  // A PREVIEW WRITES NOTHING. Both stores are checked, because "preview" that quietly revoked
  // would be the worst possible bug in a confirmation dialog.
  assert.equal(doWrites, writesBefore, 'the preview made no write to the collaboration store');
  assert.equal(memberRows.find((r) => r.user_id === MEMBER_ID).revoked_at, null, 'and revoked nobody');
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 200, 'they are still in');

  // The sole-reviewer case: the admin is the only reviewer on the open request above.
  const onAdmin = await call(`${M}/${ADMIN_ID}/impact`, { jwt: OWNER_JWT });
  assert.equal(onAdmin.json.footprint.reviewsAwaiting, 1);
  assert.equal(onAdmin.json.footprint.reviewsSoleReviewer, 1);
  assert.ok(onAdmin.json.footprint.blocked.includes('reviews_awaiting_only_them'));
});

test('the impact preview of somebody who was never here says so, rather than inventing a member', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  const impact = await call(`${M}/${EXTRA_ID}/impact`, { jwt: OWNER_JWT });
  assert.equal(impact.status, 200);
  assert.equal(impact.json.member, null);
  assert.equal(impact.json.effects.accessEndsImmediately, false);
  assert.equal(impact.json.footprint.comments, 0);
  const bad = await call(`${M}/not-a-uuid/impact`, { jwt: OWNER_JWT });
  assert.equal(bad.status, 400);
});
