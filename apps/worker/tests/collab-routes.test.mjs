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

/** Membership rows PostgREST will hand back, keyed by nothing: the fake filters like the real one. */
let memberRows = [];
/** Every request the Durable Object stub received. */
let doCalls = [];
/** What the DO answers for a `/collab` delegation, so a route's plumbing can be observed. */
let doCollabReply = { status: 200, body: { ok: true } };
const kv = new Map();
/** Every KV key the worker ASKED FOR. A Map's `get` records nothing, so without this an
 *  assertion about "nothing was read under a forged key" cannot fail — see the redeem test. */
let kvReads = [];

/**
 * Every D1 write the request made, and every promise it handed to `waitUntil`.
 *
 * The CORPUS fake used to answer everything with nothing and record nothing, which is right for a
 * test about STATUS CODES and useless for one about what the route WROTE. A mention and a review
 * request are both notifications now, and the only proof that the route emits them is the row it
 * inserts — asserting on the 201 alone would pass just as well with the notify() call deleted.
 */
let dbWrites = [];
/** Work the handler deferred. Without an ExecutionContext the notify path is never even reached. */
let waits = [];

const corpus = () => ({
  exec: async () => ({}),
  batch: async () => [],
  prepare: (sql) => ({
    bind: (...args) => ({
      all: async () => ({ results: [] }),
      // Null for the dedupe lookup, so every delivery in a test is a fresh row rather than a
      // coalesce into one that does not exist.
      first: async () => null,
      run: async () => {
        dbWrites.push({ sql, args });
        return { meta: { changes: 1 } };
      },
    }),
  }),
});

/** The insert column order in apps/worker/src/notification-store.ts, so a row reads as a row. */
const NOTIFICATION_COLS = [
  'id', 'recipient_id', 'kind', 'severity', 'title', 'body', 'project_id', 'project_name',
  'subject', 'href', 'dedupe_key', 'group_key', 'created_at', 'updated_at', 'deliver_at',
  'read_at', 'occurrences',
];

function notificationRows() {
  return dbWrites
    .filter((w) => w.sql.startsWith('insert into notifications('))
    .map((w) => Object.fromEntries(NOTIFICATION_COLS.map((c, i) => [c, w.args[i]])));
}

/** Let the deferred work finish. `notify` is on waitUntil so the response does not wait for D1. */
async function settle() {
  await Promise.all(waits.splice(0));
}

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
  CORPUS: corpus(),
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
    // A REAL ExecutionContext. The worker defers its notifications onto `waitUntil`, and a harness
    // that supplies none makes every one of those branches unreachable — `c.executionCtx` THROWS
    // rather than returning undefined, which is the hazard index.ts:2843 already carries a note
    // about. Collected so a test can await the work instead of racing it.
    { waitUntil: (p) => void waits.push(Promise.resolve(p).catch(() => undefined)), passThroughOnException: () => {} },
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
  kv.clear();
  dbWrites = [];
  waits = [];
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

/* ------------------------------------------------------------------ being told about it --- */
//
// A mention and a review request were both already first-class RECORDS — collab-threads.ts calls
// mentions "notification targets" and refuses one that names a non-member, and the store writes
// them into `collab_mentions`. Both halves were right and nothing joined them: the target was
// recorded, and then the named person had to happen to open that project and look.
//
// collab-threads.test.mjs:133 tests the RESOLVER. These test the ROUTE, which is a different claim:
// that what the store actually wrote becomes a row in somebody's inbox. Asserting on the 201 alone
// would pass just as well with the notify() call deleted.

test('a comment that mentions a member puts a row in THAT member’s inbox, addressed to the project', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  // The mention comes back from the STORE, not from the request body: the store applied the policy
  // (a mention of a stranger resolves to nobody), and notifying from the body would be notifying
  // from the claim rather than from what was written.
  doCollabReply = { status: 201, body: { id: 'cmt-9', mentions: [{ userId: MEMBER_ID }] } };

  const res = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: OWNER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', body: 'have a look @member' },
  });
  assert.equal(res.status, 201);
  await settle();

  const rows = notificationRows();
  assert.equal(rows.length, 1, `expected one notification, wrote ${rows.length}`);
  assert.equal(rows[0].kind, 'mention');
  assert.equal(rows[0].recipient_id, MEMBER_ID, 'the mention must go to the person who was named');
  assert.equal(rows[0].project_id, PROJECT_ID);
  assert.equal(rows[0].href, `/app/projects/${PROJECT_ID}`, 'the row has to open the project it is about');
  assert.equal(rows[0].subject, 'cmt-9', 'the comment id is the dedupe subject');
});

test('mentioning yourself notifies nobody, because it carries no information', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  doCollabReply = { status: 201, body: { id: 'cmt-10', mentions: [{ userId: OWNER_ID }] } };
  const res = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: OWNER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', body: 'note to self @me' },
  });
  assert.equal(res.status, 201);
  await settle();
  assert.deepEqual(notificationRows(), [], 'suppressSelf must be applied on the route, not only in the policy test');
});

test('a review request tells the reviewer, and the requester hears nothing about their own ask', async () => {
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  doCollabReply = { status: 201, body: { id: 'rev-3', reviewers: [MEMBER_ID, OWNER_ID] } };
  const res = await call(`/api/shared/${PROJECT_ID}/reviews`, {
    method: 'POST',
    jwt: OWNER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', reviewers: [MEMBER_ID, OWNER_ID] },
  });
  assert.equal(res.status, 201);
  await settle();

  const rows = notificationRows();
  assert.equal(rows.length, 1, 'the requester asked themselves for a review; only the other one is news');
  assert.equal(rows[0].kind, 'approval_requested');
  assert.equal(rows[0].recipient_id, MEMBER_ID);
  assert.equal(rows[0].project_id, PROJECT_ID);
  assert.equal(rows[0].subject, 'rev-3');
});

test('a comment the store REFUSED notifies nobody, because nothing was written to be told about', async () => {
  // The branch is on the DO's 201. A route that notified on any response would announce a mention
  // the store rejected — the person would be told about a comment that does not exist.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  doCollabReply = { status: 400, body: { error: 'bad target', mentions: [{ userId: MEMBER_ID }] } };
  const res = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: OWNER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', body: 'hi @member' },
  });
  assert.equal(res.status, 400);
  await settle();
  assert.deepEqual(notificationRows(), [], 'a refused write must not become a notification');
});

test('a mention naming somebody the store did not resolve is not notified from the request body', async () => {
  // The stranger is in the body and NOT in the store's answer. Reading the body would notify a
  // person who is not on this project — the inbox is the densest "who works with whom" the product
  // has, and a route that took recipients from the claim would leak that on request.
  reset({ members: [{ user_id: MEMBER_ID, role: 'editor' }] });
  doCollabReply = { status: 201, body: { id: 'cmt-11', mentions: [] } };
  const res = await call(`/api/shared/${PROJECT_ID}/comments`, {
    method: 'POST',
    jwt: OWNER_JWT,
    body: { targetKind: 'build', targetId: 'b-1', body: 'hi', mentions: [{ userId: STRANGER_ID }] },
  });
  assert.equal(res.status, 201);
  await settle();
  assert.deepEqual(notificationRows(), [], 'recipients must come from the store’s response, never the request');
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
