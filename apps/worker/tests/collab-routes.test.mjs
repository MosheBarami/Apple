/**
 * THE SHARED SURFACE, ASKED OVER HTTP, AS THE PERSON WHO MUST BE REFUSED.
 *
 * The policy tests prove that `decideAccess` says no. They cannot prove that the ROUTE asks it,
 * and a refusal nothing consults is the most expensive kind of dead code: it reads like security
 * in every review it survives. So this file bundles the real `index.ts` — the same entry module
 * the worker deploys — stands a fake edge behind it, and sends real requests signed with real
 * ES256 tokens.
 *
 * Three identities, one project:
 *   the OWNER      — owns the row
 *   the MEMBER     — holds a `commenter` grant in project_members
 *   the STRANGER   — a perfectly valid account with no relationship to the project at all
 *
 * Every assertion below is made by asking as one of them and reading the status code that comes
 * back, not by inspecting a decision object.
 *
 * Run with:  node --test tests/collab-routes.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const TMP = mkdtempSync(join(tmpdir(), 'golem-collab-'));
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
const SUPABASE_URL = 'https://supa.collab.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'collab-test', alg: 'ES256', use: 'sig' };
const JWKS_BODY = JSON.stringify({ keys: [jwk] });
const mint = (sub) =>
  new jose.SignJWT({ email: `${sub}@golem.test`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'collab-test' })
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

// --------------------------------------------------------------------------- the fake edge
const PROJECT_ROW = {
  id: PROJECT_ID,
  owner_id: OWNER_ID,
  name: 'Shared Place',
  place_name: null,
  memory_summary: null,
  memory_facts: [],
};

/** What the session Durable Object holds, so a read can be checked by its CONTENT and not its status. */
const TRANSCRIPT = [
  { id: 'm-1', role: 'user', mode: 'agent', content: 'build me a lobby', toolTrace: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm-2', role: 'assistant', mode: 'agent', content: 'here is the lobby', toolTrace: null, createdAt: '2026-01-01T00:00:01.000Z' },
];
const CHECKPOINTS = [{ id: 'ck-1', label: 'before the lobby', kind: 'manual', createdAt: 1, scriptCount: 2, instanceCount: 3, sizeBytes: 4 }];

/** Membership rows PostgREST will hand back, keyed by nothing: the fake filters like the real one. */
let memberRows = [];
/** Every request the Durable Object stub received. */
let doCalls = [];
/** What the DO answers for a `/collab` delegation, so a route's plumbing can be observed. */
let doCollabReply = { status: 200, body: { ok: true } };
/** What the DO answers when a membership route pushes a change into the open sockets. */
let doAccessChangeReply = { status: 200, body: { matched: 1, closed: 1, demoted: 0 } };
const kv = new Map();
/** Every KV key the worker ASKED FOR. A Map's `get` records nothing, so without this an
 *  assertion about "nothing was read under a forged key" cannot fail — see the redeem test. */
let kvReads = [];

function parseQuery(url) {
  const u = new URL(url);
  const eq = {};
  for (const [k, v] of u.searchParams.entries()) {
    if (typeof v === 'string' && v.startsWith('eq.')) eq[k] = decodeURIComponent(v.slice(3));
  }
  return eq;
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init?.method ?? (typeof input === 'string' ? 'GET' : input.method) ?? 'GET').toUpperCase();
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

  if (url.includes('/.well-known/jwks.json')) return json(JSON.parse(JWKS_BODY));

  if (url.includes('/rest/v1/projects')) {
    const eq = parseQuery(url);
    // The REAL filter, honoured: getOwnedProject narrows by owner_id, and a fake that ignored it
    // would hand the project row to every caller and quietly prove nothing.
    if (eq.id !== PROJECT_ID) return json([]);
    if (eq.owner_id !== undefined && eq.owner_id !== PROJECT_ROW.owner_id) return json([]);
    return json([PROJECT_ROW]);
  }

  if (url.includes('/rest/v1/project_members')) {
    const eq = parseQuery(url);
    if (method === 'POST') {
      const row = JSON.parse(init.body);
      memberRows = [...memberRows.filter((r) => r.user_id !== row.user_id), { ...row, display_name: null, created_at: null }];
      return json([row], 201);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      memberRows = memberRows.map((r) => (r.user_id === eq.user_id ? { ...r, ...patch } : r));
      return json([], 200);
    }
    let rows = memberRows.filter((r) => r.project_id === (eq.project_id ?? PROJECT_ID));
    if (eq.user_id !== undefined) rows = rows.filter((r) => r.user_id === eq.user_id);
    return json(rows);
  }

  if (url.includes('/rest/v1/profiles')) return json([{ id: OWNER_ID, plan: 'free', is_admin: false, display_name: 'maya' }]);
  return json([]);
};

function sessionNamespace() {
  return {
    idFromName: (n) => ({ toString: () => n, __name: n }),
    idFromString: (n) => ({ toString: () => n, __name: n }),
    get: () => ({
      async fetch(url, init) {
        const u = new URL(typeof url === 'string' ? url : url.url);
        const headers = new Headers((typeof url === 'string' ? init?.headers : url.headers) ?? init?.headers ?? {});
        let body = null;
        try {
          body = init?.body ? JSON.parse(init.body) : null;
        } catch {
          body = init?.body ?? null;
        }
        doCalls.push({ path: u.pathname, body, role: headers.get('X-Golem-Role'), userId: headers.get('X-User-Id') });
        if (u.pathname === '/init') return new Response(JSON.stringify({ ok: true }), { status: 200 });
        if (u.pathname === '/collab') {
          return new Response(JSON.stringify(doCollabReply.body), { status: doCollabReply.status });
        }
        if (u.pathname === '/collab/access-changed') {
          return new Response(JSON.stringify(doAccessChangeReply.body), { status: doAccessChangeReply.status });
        }
        // The session DO's own reads. `{ok:true}` for everything made a 200 the only observable
        // fact about /messages and /checkpoints, which is why nothing could tell "the member
        // reached the transcript" from "the member reached a stub". These answer with CONTENT.
        if (u.pathname === '/messages') return new Response(JSON.stringify({ messages: TRANSCRIPT }), { status: 200 });
        if (u.pathname === '/checkpoints') return new Response(JSON.stringify({ checkpoints: CHECKPOINTS }), { status: 200 });
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
    get: async (k) => { kvReads.push(k); return kv.get(k) ?? null; },
    put: async (k, v) => void kv.set(k, v),
    delete: async (k) => void kv.delete(k),
    list: async () => ({ keys: [] }),
  },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  CORPUS: { exec: async () => ({}), prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }), batch: async () => [] },
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
  memberRows = members.map((m) => ({
    project_id: PROJECT_ID,
    display_name: null,
    invited_by: OWNER_ID,
    created_at: null,
    expires_at: null,
    revoked_at: null,
    ...m,
  }));
  doCalls = [];
  doCollabReply = { status: 200, body: { ok: true } };
  doAccessChangeReply = { status: 200, body: { matched: 1, closed: 1, demoted: 0 } };
  kv.clear();
}

/** Every route on the shared surface, with the least privileged role that should reach it. */
const SHARED_ROUTES = [
  { method: 'GET', path: `/api/shared/${PROJECT_ID}` },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/messages` },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/checkpoints` },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/members` },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/comments?targetKind=build&targetId=b-1` },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/comments`, body: { targetKind: 'build', targetId: 'b-1', body: 'hi' } },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/reactions`, body: { commentId: 'c-1', emoji: '👍' } },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/reviews` },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/reviews`, body: { targetKind: 'build', targetId: 'b-1', reviewers: [OWNER_ID] } },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/reviews/approve`, body: { reviewId: 'r-1', verdict: 'approved' } },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/versions` },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/versions`, body: { label: 'mine' } },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/versions/restore`, body: { versionId: 'v-1' } },
  { method: 'GET', path: `/api/shared/${PROJECT_ID}/presence` },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/members`, body: { userId: STRANGER_ID, role: 'viewer' } },
  { method: 'POST', path: `/api/shared/${PROJECT_ID}/links`, body: { scope: 'project', role: 'viewer' } },
];

// ===========================================================================================

test('A STRANGER is refused on every shared route, and never learns the project exists', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'commenter' }] });
  for (const r of SHARED_ROUTES) {
    const res = await call(r.path, { method: r.method, jwt: STRANGER_JWT, body: r.body });
    assert.equal(res.status, 404, `${r.method} ${r.path} must answer a stranger with 404`);
    assert.equal(res.json?.error, 'not found', `${r.method} ${r.path} must not describe the project`);
    assert.equal(res.text.includes(PROJECT_ROW.name), false, 'the project name must not leak to a stranger');
    assert.equal(res.text.includes(OWNER_ID), false, 'the owner id must not leak to a stranger');
  }
  assert.equal(doCalls.filter((d) => d.path === '/collab').length, 0, 'not one stranger request reached the store');
});

test('an unauthenticated caller never even reaches the gate', async () => {
  reset();
  const res = await call(`/api/shared/${PROJECT_ID}`, {});
  assert.equal(res.status, 401);
  const forged = await call(`/api/shared/${PROJECT_ID}`, { jwt: 'not.a.token' });
  assert.equal(forged.status, 401);
});

test('a MEMBER reads, and is told their role and exactly what it can do', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'commenter' }] });
  const res = await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT });
  assert.equal(res.status, 200);
  assert.equal(res.json.role, 'commenter');
  assert.deepEqual(res.json.capabilities, ['read', 'comment', 'react']);
  assert.equal(res.json.project.name, 'Shared Place');
  assert.ok(res.json.members.some((m) => m.userId === OWNER_ID && m.role === 'owner'), 'the owner is in the directory');
});

test('a VIEWER is refused the writes and allowed the reads, over HTTP', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'viewer' }] });
  const reads = [
    `/api/shared/${PROJECT_ID}`,
    `/api/shared/${PROJECT_ID}/messages`,
    `/api/shared/${PROJECT_ID}/checkpoints`,
    `/api/shared/${PROJECT_ID}/versions`,
    `/api/shared/${PROJECT_ID}/presence`,
  ];
  for (const p of reads) assert.equal((await call(p, { jwt: MEMBER_JWT })).status, 200, `${p} must be readable by a viewer`);

  const writes = [
    { path: `/api/shared/${PROJECT_ID}/comments`, body: { targetKind: 'build', targetId: 'b', body: 'x' } },
    { path: `/api/shared/${PROJECT_ID}/reactions`, body: { commentId: 'c', emoji: '👍' } },
    { path: `/api/shared/${PROJECT_ID}/versions`, body: { label: 'x' } },
    { path: `/api/shared/${PROJECT_ID}/versions/restore`, body: { versionId: 'v' } },
    { path: `/api/shared/${PROJECT_ID}/members`, body: { userId: STRANGER_ID, role: 'viewer' } },
    { path: `/api/shared/${PROJECT_ID}/links`, body: { scope: 'project', role: 'viewer' } },
  ];
  for (const w of writes) {
    const res = await call(w.path, { method: 'POST', jwt: MEMBER_JWT, body: w.body });
    // 403, not 404: a member already knows the project exists, and needs to know it is their ROLE
    // that is in the way.
    assert.equal(res.status, 403, `POST ${w.path} must refuse a viewer`);
    assert.equal(res.json.error, 'forbidden');
  }
});

test('an EDITOR may comment and build, and still may not restore or invite', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  doCollabReply = { status: 201, body: { id: 'cmt-1' } };
  const comment = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: MEMBER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', body: 'looks good @maya' },
  });
  assert.equal(comment.status, 201);
  const sent = doCalls.find((d) => d.path === '/collab');
  assert.equal(sent.body.role, 'editor', 'the role the gate decided is what reaches the store');
  assert.equal(sent.body.userId, MEMBER_ID);
  assert.ok(Array.isArray(sent.body.directory) && sent.body.directory.length >= 1, 'mentions resolve against a real member directory');

  assert.equal((await call(`/api/shared/${PROJECT_ID}/versions/restore`, { method: 'POST', jwt: MEMBER_JWT, body: { versionId: 'v' } })).status, 403);
  assert.equal((await call(`/api/shared/${PROJECT_ID}/members`, { method: 'POST', jwt: MEMBER_JWT, body: { userId: STRANGER_ID, role: 'viewer' } })).status, 403);
});

test('an ADMIN may restore and invite; the OWNER may do everything', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  assert.equal((await call(`/api/shared/${PROJECT_ID}/versions/restore`, { method: 'POST', jwt: ADMIN_JWT, body: { versionId: 'v' } })).status, 200);
  const invite = await call(`/api/shared/${PROJECT_ID}/members`, { method: 'POST', jwt: ADMIN_JWT, body: { userId: STRANGER_ID, role: 'commenter' } });
  assert.equal(invite.status, 201);
  // and the person just invited can now read, which is the whole point of the feature
  const now = await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT });
  assert.equal(now.status, 200);
  assert.equal(now.json.role, 'commenter');
});

test('an invitation can never confer ownership, whatever the body says', async () => {
  reset({ members: [{ user_id: ADMIN_ID, role: 'admin' }] });
  for (const role of ['owner', 'superuser', '', null, 7]) {
    const res = await call(`/api/shared/${PROJECT_ID}/members`, { method: 'POST', jwt: ADMIN_JWT, body: { userId: STRANGER_ID, role } });
    assert.equal(res.status, 400, `role ${JSON.stringify(role)} must be refused`);
    assert.equal(res.json.error, 'unknown_role');
  }
  assert.equal(memberRows.some((r) => r.user_id === STRANGER_ID), false, 'nothing was written');
});

test('a REVOKED member is a stranger again, on the next request', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 200);
  const gone = await call(`/api/shared/${PROJECT_ID}/members/${MEMBER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(gone.status, 200);
  const after = await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT });
  assert.equal(after.status, 404, 'a revoked member is refused like anyone else');
});

test('an EXPIRED grant reads as no grant at the HTTP boundary', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor', expires_at: '2020-01-01T00:00:00.000Z' }] });
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 404);
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor', expires_at: '2099-01-01T00:00:00.000Z' }] });
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 200);
  // and a grant whose expiry cannot be read is DEAD, not eternal
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor', expires_at: 'whenever' }] });
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: MEMBER_JWT })).status, 404);
});

test('THE OWNER SURFACE DID NOT WIDEN: a member is still refused /api/projects/:id/*', async () => {
  // The regression that would make this whole cluster a security incident. A member with a live
  // editor grant must still get nothing from the owner-only routes.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  for (const p of [`/api/projects/${PROJECT_ID}/messages`, `/api/projects/${PROJECT_ID}/checkpoints`, `/api/projects/${PROJECT_ID}/export`]) {
    const res = await call(p, { jwt: MEMBER_JWT });
    assert.equal(res.status, 404, `${p} is owner-only and must stay owner-only`);
  }
  // …and the owner still reaches them, or the check has simply broken the product.
  assert.equal((await call(`/api/projects/${PROJECT_ID}/messages`, { jwt: OWNER_JWT })).status, 200);
});

test('the websocket route sends the decided role and OVERWRITES a client-supplied one', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'viewer' }] });
  const res = await call(`/api/shared/${PROJECT_ID}/ws`, {
    jwt: MEMBER_JWT,
    // The browser writing its own permission slip. The route copies raw headers, so this is the
    // exact value that would be forwarded if `set` were ever changed to an append.
    headers: { Upgrade: 'websocket', 'X-Golem-Role': 'owner' },
  });
  assert.equal(res.status, 200);
  const ws = doCalls.find((d) => d.path === '/ws');
  assert.equal(ws.role, 'viewer', 'the role on the wire is the one the access decision produced');
  assert.equal(ws.userId, MEMBER_ID);
  // A non-websocket request to the same path is refused before any of that.
  assert.equal((await call(`/api/shared/${PROJECT_ID}/ws`, { jwt: MEMBER_JWT })).status, 426);

  // THE OWNER TAKES THE SAME DOOR. The browser opens this route for everyone (see
  // use-project-socket.ts), so an owner who could not hold a shared socket would mean no chat at
  // all — the feature failing shut for the person who owns the project.
  doCalls = [];
  const asOwner = await call(`/api/shared/${PROJECT_ID}/ws`, { jwt: OWNER_JWT, headers: { Upgrade: 'websocket' } });
  assert.equal(asOwner.status, 200);
  const ownerWs = doCalls.find((d) => d.path === '/ws');
  assert.equal(ownerWs.role, 'owner', 'the owner is the strongest member, resolved from the project row');
  assert.equal(ownerWs.userId, OWNER_ID);

  // And a stranger still gets nothing from it.
  doCalls = [];
  assert.equal((await call(`/api/shared/${PROJECT_ID}/ws`, { jwt: STRANGER_JWT, headers: { Upgrade: 'websocket' } })).status, 404);
  assert.equal(doCalls.some((d) => d.path === '/ws'), false, 'no socket is opened for a stranger');
});

test('the Durable Object is initialised with the PROJECT owner, never the caller', async () => {
  // Passing the caller here is how sharing fails shut: /init refuses on an owner mismatch and the
  // member sees "project not found" at the last hop, with every access check having said yes.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  await call(`/api/shared/${PROJECT_ID}/messages`, { jwt: MEMBER_JWT });
  const init = doCalls.find((d) => d.path === '/init');
  assert.equal(init.body.ownerId, OWNER_ID, 'the binding is the project owner');
  assert.notEqual(init.body.ownerId, MEMBER_ID);
});

test('a share link is minted, redeemed by a stranger, and then revoked', async () => {
  reset();
  const minted = await call(`/api/shared/${PROJECT_ID}/links`, { method: 'POST', jwt: OWNER_JWT, body: { scope: 'project', role: 'commenter' } });
  assert.equal(minted.status, 201);
  const token = minted.json.token;
  assert.match(token, /^[A-Za-z0-9_-]{32,64}$/);

  // Before redeeming, the stranger is a stranger.
  assert.equal((await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT })).status, 404);

  const redeemed = await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token } });
  assert.equal(redeemed.status, 201);
  assert.equal(redeemed.json.role, 'commenter');

  const now = await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT });
  assert.equal(now.status, 200, 'the redeemed link is a real grant');
  assert.equal(now.json.role, 'commenter');

  const revoked = await call(`/api/shared/${PROJECT_ID}/links/revoke`, { method: 'POST', jwt: OWNER_JWT, body: { token } });
  assert.equal(revoked.status, 200);
  // Revoking the LINK does not retract grants already minted from it — that is a membership
  // revocation, and the route above does it. What it must do is stop the NEXT person.
  const late = await call('/api/shared/links/redeem', { method: 'POST', jwt: ADMIN_JWT, body: { token } });
  assert.equal(late.status, 403);
  assert.equal(late.json.error, 'revoked');
});

test('a link cannot be minted with a role a link may not carry', async () => {
  reset();
  for (const role of ['owner', 'admin']) {
    const res = await call(`/api/shared/${PROJECT_ID}/links`, { method: 'POST', jwt: OWNER_JWT, body: { scope: 'project', role } });
    assert.equal(res.status, 400, `a link must not be mintable as ${role}`);
    assert.equal(res.json.error, 'role_too_strong');
  }
  const scoped = await call(`/api/shared/${PROJECT_ID}/links`, { method: 'POST', jwt: OWNER_JWT, body: { scope: 'chat', role: 'viewer' } });
  assert.equal(scoped.status, 400, 'a chat link with no chat opens everything');
  assert.equal(scoped.json.error, 'scoped_link_needs_a_resource');
});

test('a token that is not a token never becomes part of a KV key', async () => {
  // `kv` IS A Map, AND Map.get RECORDS NOTHING. `assert.equal(kv.size, 0)` therefore cannot fail
  // because of a READ — only a write moves it — so the whole "never becomes part of a KV key" claim
  // rested on an assertion that could not observe the thing it named. And the 404s came from an
  // EMPTY STORE rather than from the shape guard, so they proved nothing either: measured, loosening
  // isShareToken to `typeof value === 'string' && value.length > 0` left this green, and removing
  // the isShareToken call from readShareLink entirely left it green too.
  //
  // Record the reads. Now a forged token that reaches the store is visible even though the store has
  // nothing to give it.
  reset();
  kvReads = [];
  for (const token of ['../../etc', 'share:link:x', '', 'a'.repeat(200), null, 7, { t: 1 }]) {
    const res = await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token } });
    assert.equal(res.status, 404, `token ${JSON.stringify(token)} must be refused by shape`);
  }
  assert.deepEqual(kvReads, [], `a forged token was used to build a KV key: ${JSON.stringify(kvReads)}`);
  assert.equal(kv.size, 0, 'and nothing was written under a forged key');

  // THE CONTROL. Without it, a redeem route that refused EVERY token and never touched KV would
  // satisfy everything above. A well-formed token must actually reach the store.
  reset();
  kvReads = [];
  await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token: 'a'.repeat(32) } });
  assert.ok(
    kvReads.some((k) => k.startsWith('share:link:')),
    'a well-formed token must be looked up — otherwise the refusals above prove nothing',
  );
});

test('a link belonging to another project cannot be revoked from this one', async () => {
  reset();
  const token = (await call(`/api/shared/${PROJECT_ID}/links`, { method: 'POST', jwt: OWNER_JWT, body: { scope: 'project', role: 'viewer' } })).json.token;
  // Rewrite the stored link so it belongs elsewhere, then present its token here.
  const key = `share:link:${token}`;
  kv.set(key, JSON.stringify({ ...JSON.parse(kv.get(key)), project_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
  const res = await call(`/api/shared/${PROJECT_ID}/links/revoke`, { method: 'POST', jwt: OWNER_JWT, body: { token } });
  assert.equal(res.status, 404);
  assert.equal(JSON.parse(kv.get(key)).revoked_at ?? null, null, 'the other project link is untouched');
});

test('every shared route is registered LITERALLY, so the repository parsing guards can see it', () => {
  //[[ THE FIRST VERSION OF THESE ROUTES WAS A `for` LOOP OVER A TABLE.
  //
  //   It was shorter, it read well, and it registered ten endpoints that no guard in this
  //   repository could see: the A3 ownership sweep in packages/evals/src/security.test.mjs finds
  //   routes with /app\.(get|post|…)\('([^']+)'/, and a path built from a template literal matches
  //   nothing. tests/webtools-wiring.test.mjs already says this about the tool registry — an entry
  //   supplied by a spread "would pass every assertion above and be invisible to all of them".
  //
  //   So the claim here is about the SOURCE of src/collab-routes.ts, not about behaviour: these
  //   paths are written out, one per line, where a scanner can find them. ]]
  // THIS READ src/collab-routes.ts, WHICH NOTHING IMPORTS. `registerSharedRoutes` has no call
  // site anywhere in the repository; the routes that serve traffic are in index.ts. So the test
  // asserted a property of a file that does not ship, and the property was FALSE of the file that
  // does: index.ts registered seven of these seventeen paths from a `for` loop with a template
  // literal, invisible to the ownership sweep and to this assertion alike. The verification pass
  // proved the gap by breaking five security mechanisms inside collab-routes.ts — headers.set ->
  // append, the GRANTABLE_ROLES invite allowlist deleted, the link-revoke project_id check deleted,
  // versions/restore downgraded to 'build', the entry point renamed — and watching all 117 tests
  // stay green every time.
  //
  // Measure what ships. index.ts now registers all of them literally (see collabRoute there).
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  const required = [
    '/api/shared/:id',
    '/api/shared/:id/ws',
    '/api/shared/:id/messages',
    '/api/shared/:id/checkpoints',
    '/api/shared/:id/members',
    '/api/shared/:id/members/:userId',
    '/api/shared/:id/links',
    '/api/shared/:id/links/revoke',
    '/api/shared/links/redeem',
    '/api/shared/:id/comments',
    '/api/shared/:id/comments/resolve',
    '/api/shared/:id/reactions',
    '/api/shared/:id/reviews',
    '/api/shared/:id/reviews/approve',
    '/api/shared/:id/versions',
    '/api/shared/:id/versions/restore',
    '/api/shared/:id/presence',
  ];
  const literal = new Set([...src.matchAll(/app\.(?:get|post|put|patch|delete)\('([^']+)'/g)].map((m) => m[1]));
  for (const path of required) {
    assert.ok(literal.has(path), `${path} is not registered as a literal path a source scanner can find`);
  }
  // And nothing may be registered from a variable or a template literal — that is the shape that
  // hides a route, and it hides it from the ownership sweep as easily as from this test.
  assert.equal(
    /app\.(?:get|post|put|patch|delete)\(\s*(?:`|[A-Za-z_$])/.test(src),
    false,
    'a route is registered from something other than a quoted literal path',
  );
});

test('a malformed project id never reaches the project layer', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  // `../admin` normalises to /api/admin before routing and is answered by the admin gate (403),
  // which is the right refusal from the right place — so the claim here is about what comes BACK,
  // not about which of the refusals fires.
  for (const id of ['not-a-uuid', '../admin', '%2e%2e', 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE ']) {
    const res = await call(`/api/shared/${id}`, { jwt: OWNER_JWT });
    assert.ok([401, 403, 404].includes(res.status), `${id} answered ${res.status}, which is not a refusal`);
    assert.equal(res.text.includes(PROJECT_ROW.name), false, `${id} must not reach the project`);
    assert.equal(res.text.includes(OWNER_ID), false, `${id} must not describe the project`);
  }
});

test('A VIEWER READS THE TRANSCRIPT ITSELF, not just a 200', async () => {
  //[[ THE ROUTE WAS TESTED BY ITS STATUS CODE AND NOTHING ELSE.
  //
  //   `/api/shared/:id/messages` was asserted at 200 for a viewer while the DO stub answered
  //   `{ok:true}` to every path — so the assertion could not tell a proxied transcript from a
  //   route that returned an empty object, and would have stayed green if the proxy dropped the
  //   body entirely. The browser's half of this was worse: apps/web/src/lib/api.ts asked
  //   /api/projects/:id/messages, which is owner-only, so a collaborator opening a shared project
  //   saw an EMPTY conversation and only whatever arrived live over the socket afterwards.
  //
  //   Same defect, same shape, for the history of builds: fetchCheckpoints hit the owner-only
  //   route while the shared mirror sat unused. ]]
  reset({ members: [{ user_id: MEMBER_ID, role: 'viewer' }] });
  const msgs = await call(`/api/shared/${PROJECT_ID}/messages?limit=100`, { jwt: MEMBER_JWT });
  assert.equal(msgs.status, 200);
  assert.deepEqual(msgs.json.messages, TRANSCRIPT, 'the viewer must receive the rows, not an empty body');

  const cks = await call(`/api/shared/${PROJECT_ID}/checkpoints`, { jwt: MEMBER_JWT });
  assert.equal(cks.status, 200);
  assert.deepEqual(cks.json.checkpoints, CHECKPOINTS, 'the build history is a read, and a viewer may read it');

  // The owner takes the SAME door — these routes gate on 'read', which the owner passes, so there
  // is no second owner path to keep in step. If this ever fails, the browser has two code paths.
  const asOwner = await call(`/api/shared/${PROJECT_ID}/messages?limit=100`, { jwt: OWNER_JWT });
  assert.equal(asOwner.status, 200);
  assert.deepEqual(asOwner.json.messages, TRANSCRIPT);

  const forwarded = doCalls.filter((d) => d.path === '/messages');
  assert.ok(forwarded.length >= 2, 'the shared route must actually reach the session DO');
});

test('THE BROWSER ASKS THE SHARED ROUTE — the owner-only one showed a collaborator nothing', () => {
  // A source assertion, because apps/web has no DOM renderer and this is a wiring fact: which URL
  // the client builds. It would have failed before the change, and it is the whole of the bug.
  const api = readFileSync(join(WORKER, '..', 'web', 'src', 'lib', 'api.ts'), 'utf8');
  const fetchMessages = /export const fetchMessages[\s\S]*?;\n/.exec(api)?.[0] ?? '';
  const fetchCheckpoints = /export const fetchCheckpoints[\s\S]*?;\n/.exec(api)?.[0] ?? '';
  assert.match(fetchMessages, /\/api\/shared\//, 'fetchMessages must ask the shared route');
  assert.doesNotMatch(fetchMessages, /\/api\/projects\//, 'the owner-only route answers a member 404');
  assert.match(fetchCheckpoints, /\/api\/shared\//, 'fetchCheckpoints must ask the shared route');
  assert.doesNotMatch(fetchCheckpoints, /\/api\/projects\//, 'the owner-only route answers a member 404');
});

test('a CHAT link opens the chat and nothing else, once it has been redeemed', async () => {
  //[[ THE REFUSAL USED TO LAST EXACTLY ONE REQUEST.
  //
  //   `redeemShareLink` refuses a chat link presented at a build, and every one of those refusals
  //   is driven in collab-membership.test.mjs. Then the redemption wrote a grant with no scope on
  //   it, so the person who redeemed a link to ONE CONVERSATION became an ordinary project member:
  //   the roster, the version list, every artifact. Nothing tested it because nothing did it.
  //
  //   Asked over HTTP, as the person the link was sent to. ]]
  reset();
  const minted = await call(`/api/shared/${PROJECT_ID}/links`, {
    method: 'POST',
    jwt: OWNER_JWT,
    body: { scope: 'chat', resourceId: 'c-1', role: 'commenter' },
  });
  assert.equal(minted.status, 201);
  const redeemed = await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token: minted.json.token } });
  assert.equal(redeemed.status, 201, 'the link is still redeemable');
  assert.equal(redeemed.json.scope, 'chat');

  // THE CHAT OPENS. This is what the link is for, and a guard that closed it too would be a
  // different bug wearing the same green.
  const transcript = await call(`/api/shared/${PROJECT_ID}/messages`, { jwt: STRANGER_JWT });
  assert.equal(transcript.status, 200, 'the conversation the link names must still be readable');
  assert.deepEqual(
    transcript.json.messages.map((m) => m.id),
    ['m-1', 'm-2'],
    'and it is the real transcript, not a stub',
  );

  // THE PROJECT AROUND IT DOES NOT. Each of these is a project-wide surface, and 403 rather than
  // 404 because this person can already prove the project exists.
  for (const path of [
    `/api/shared/${PROJECT_ID}/members`,
    `/api/shared/${PROJECT_ID}/versions`,
    `/api/shared/${PROJECT_ID}/checkpoints`,
    `/api/shared/${PROJECT_ID}/reviews`,
    `/api/shared/${PROJECT_ID}/permissions`,
  ]) {
    const res = await call(path, { jwt: STRANGER_JWT });
    assert.equal(res.status, 403, `${path} must refuse a chat-scoped guest`);
    assert.equal(res.json.detail, 'scoped_grant', `${path} must say WHY it refused`);
  }

  // The "what am I here" route answers, and WITHHOLDS the directory rather than returning an
  // empty one that would read as "nobody else is on this project".
  const who = await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT });
  assert.equal(who.status, 200);
  assert.equal(who.json.role, 'commenter');
  assert.equal(who.json.scope, 'chat');
  assert.equal(who.json.resourceId, 'c-1');
  assert.equal(who.json.directoryWithheld, true);
  assert.deepEqual(who.json.members, []);
  // The project's OWNER id stays — a chat link was sent by someone on this project and "whose
  // project is this" is not the roster. What must not appear is anybody's handle, which is the
  // thing @-mentions are made of and the thing the directory exists to supply.
  assert.equal(who.text.includes('maya'), false, 'the member directory is not handed to a scoped guest');

  // A comment on a MESSAGE is on the chat surface and is allowed; the same route reaching the
  // PROJECT is not. One route, two surfaces, and the scope decides.
  doCollabReply = { status: 201, body: { id: 'cmt-1' } };
  const onMessage = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: STRANGER_JWT,
    body: { targetKind: 'message', targetId: 'm-2', body: 'nice' },
  });
  assert.equal(onMessage.status, 201, 'a chat guest may comment on the conversation they were given');
  const onProject = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: STRANGER_JWT,
    body: { targetKind: 'project', targetId: PROJECT_ID, body: 'nice' },
  });
  assert.equal(onProject.status, 403, 'and not on the project around it');

  // THE CONTROL: a PROJECT link redeemed by the same stranger reaches all of it. Without this the
  // assertions above would pass on a build that refused every link-derived grant there is.
  reset();
  const wide = await call(`/api/shared/${PROJECT_ID}/links`, { method: 'POST', jwt: OWNER_JWT, body: { scope: 'project', role: 'commenter' } });
  await call('/api/shared/links/redeem', { method: 'POST', jwt: STRANGER_JWT, body: { token: wide.json.token } });
  assert.equal((await call(`/api/shared/${PROJECT_ID}/members`, { jwt: STRANGER_JWT })).status, 200);
  const wideWho = await call(`/api/shared/${PROJECT_ID}`, { jwt: STRANGER_JWT });
  assert.equal(wideWho.json.directoryWithheld, false);
  assert.ok(wideWho.json.members.some((m) => m.userId === OWNER_ID), 'a project guest sees the directory');
});

test('A MEMBERSHIP CHANGE IS PUSHED INTO THE ROOM, not left for the next request that never comes', async () => {
  //[[ THE HALF THAT WAS MISSING.
  //
  //   "a REVOKED member is a stranger again, on the next request" is true and is asserted above.
  //   A WebSocket makes no next request: the role is decided at the handshake and frozen onto the
  //   socket, and `grep ws.close` across do/session.ts found exactly one call, for a deleted
  //   project. So the membership routes wrote Postgres and KV and returned, and the removed
  //   member kept their capabilities on an open tab for as long as the tab stayed open.
  //
  //   What the socket then DOES with the push is driven in collab-access-change.test.mjs against
  //   the Durable Object itself. This asserts the routes make it. ]]
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  const gone = await call(`/api/shared/${PROJECT_ID}/members/${MEMBER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(gone.status, 200);
  const removal = doCalls.find((d) => d.path === '/collab/access-changed');
  assert.ok(removal, 'a removal must reach the session Durable Object');
  assert.equal(removal.body.userId, MEMBER_ID);
  assert.equal(removal.body.role, null, 'a removal has no lesser role to demote to');
  assert.deepEqual(gone.json.liveSockets, { matched: 1, closed: 1, demoted: 0 }, 'and the route REPORTS what the push did');

  // A DEMOTION carries the new role, so the socket is rewritten rather than closed.
  reset({ members: [{ user_id: MEMBER_ID, role: 'admin' }] });
  await call(`/api/shared/${PROJECT_ID}/members`, { method: 'POST', jwt: OWNER_JWT, body: { userId: MEMBER_ID, role: 'viewer' } });
  const demotion = doCalls.find((d) => d.path === '/collab/access-changed');
  assert.ok(demotion, 'a role change must reach the session Durable Object');
  assert.equal(demotion.body.role, 'viewer');

  // A SUSPENSION closes, because a suspended grant is dead while it lasts.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  await call(`/api/shared/${PROJECT_ID}/members/${MEMBER_ID}/suspend`, { method: 'POST', jwt: OWNER_JWT, body: { reason: 'talking about it' } });
  const suspension = doCalls.find((d) => d.path === '/collab/access-changed');
  assert.ok(suspension, 'a suspension must reach the session Durable Object');
  assert.equal(suspension.body.role, null);

  // A DURABLE OBJECT THAT CANNOT BE REACHED DOES NOT UNDO THE CHANGE — it has already landed in
  // both stores — and must not be reported as a push that happened.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  doAccessChangeReply = { status: 500, body: { error: 'unreachable' } };
  const still = await call(`/api/shared/${PROJECT_ID}/members/${MEMBER_ID}`, { method: 'DELETE', jwt: OWNER_JWT });
  assert.equal(still.status, 200, 'the membership revocation already succeeded');
  assert.equal(still.json.revoked, true);
  assert.equal(still.json.liveSockets, null, 'and the answer says the push did not happen rather than implying it did');
});
