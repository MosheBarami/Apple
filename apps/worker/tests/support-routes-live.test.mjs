/**
 * THE SUPPORT ROUTES, ASKED OVER HTTP.
 *
 * WHAT WAS THERE. Nothing. `public.feedback` was created in 0001_init.sql with a category CHECK,
 * a content bound, a `page` column that only makes sense for an in-app widget, a `status` column,
 * and two RLS policies — and no code anywhere read or wrote it. The product's entire support
 * surface was an address on a marketing page, so a person whose build had just failed had to leave
 * the app, find the site, and retype from memory what they had been doing.
 *
 * The pure tests prove `parseSupportSubmission` refuses an unknown category and strips a token out
 * of a page. They cannot prove that A ROUTE ASKS IT, and a validator nothing calls is the most
 * expensive kind of dead code — it reads like protection in every review it survives. So this
 * bundles the real `index.ts`, stands a fake PostgREST behind it, and sends real requests signed
 * with real ES256 tokens.
 *
 * THE PROPERTY THIS FILE EXISTS FOR is the one a shape test cannot reach: `owner_id` is taken from
 * the verified JWT and there is no path by which a body can set it. Every assertion about identity
 * therefore reads the row that ARRIVED AT THE DATABASE, not the response the route returned — a
 * route can return the right id while writing the wrong one, and only one of those two is what the
 * support desk later reads.
 *
 * Run with:  node --test tests/support-routes-live.test.mjs      (from apps/worker)
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

const TMP = mkdtempSync(join(tmpdir(), 'golem-support-routes-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(
  ESBUILD,
  [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
    `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.support.test';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'support-test', alg: 'ES256', use: 'sig' };
const sign = (sub, email) =>
  new jose.SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'support-test' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
const JWT = await sign(USER_ID, 'reporter@golem.test');

/** Every PostgREST request the routes made: method, path, query and body, as they left. */
let rest = [];
/** What the fake PostgREST answers a POST to /feedback with. */
let insertReply = null;
/** Rows the fake PostgREST returns for a GET of /feedback. */
let feedbackRows = [];
/** Set to make the database refuse, so the route's behaviour when it cannot write is observable. */
let restStatus = 200;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.includes('/rest/v1/feedback')) {
    const u = new URL(url);
    let body = null;
    try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
    rest.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      path: u.pathname,
      query: Object.fromEntries(u.searchParams.entries()),
      auth: init?.headers?.Authorization ?? init?.headers?.authorization ?? null,
      body,
    });
    if (restStatus !== 200) return json({ message: 'nope', code: '23514' }, restStatus);
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') return json(insertReply ?? [defaultRow(body)], 201);
    return json(feedbackRows);
  }
  if (url.includes('/rest/v1/profiles')) return json([{ id: USER_ID, plan: 'free', is_admin: false, display_name: 'reporter' }]);
  return json([]);
};

function defaultRow(body) {
  const row = Array.isArray(body) ? body[0] : body;
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    owner_id: row?.owner_id ?? null,
    kind: row?.kind ?? 'feedback',
    content: row?.content ?? '',
    page: row?.page ?? null,
    status: 'open',
    created_at: '2026-09-01T10:00:00Z',
  };
}

function ns() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    get: () => ({ async fetch() { return new Response(JSON.stringify({ ok: true }), { status: 200 }); } }),
  };
}

const env = () => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  CORPUS: {
    exec: async () => ({}),
    prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }),
    batch: async () => [],
  },
  VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
  SESSION_DO: ns(),
  QUOTA_DO: ns(),
  PAIRING_DO: ns(),
  ADMIN_DO: ns(),
  BUDGET_DO: ns(),
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

const reset = () => { rest = []; insertReply = null; feedbackRows = []; restStatus = 200; };
/** The row as it reached PostgREST — the only copy that matters for what support later reads. */
const written = () => {
  const post = rest.find((r) => r.method === 'POST');
  assert.ok(post, 'nothing was written to public.feedback at all');
  return Array.isArray(post.body) ? post.body[0] : post.body;
};

/* ------------------------------------------------------------------ submitting --- */

test('a report with no credential is refused before it reaches the database', async () => {
  reset();
  const res = await call('/api/feedback', { method: 'POST', jwt: null, body: { kind: 'bug', content: 'it broke' } });
  assert.equal(res.status, 401);
  assert.equal(rest.length, 0, 'an unauthenticated request still reached the database');
});

test('a signed-in person can file a report, and gets back something to refer to it by', async () => {
  reset();
  const res = await call('/api/feedback', {
    method: 'POST',
    body: { kind: 'bug', content: 'The Studio panel says "Session ended" every time I press Build.' },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.json?.id, 'the submitter has no id to quote back');
  // The status is the answer to "did anyone look at this yet". Returning it at submission is what
  // makes the column something the user can see rather than something only staff can.
  assert.equal(res.json.status, 'open');
  assert.equal(res.json.kind, 'bug');
});

test('the owner is the token, and a body that claims otherwise does not get its way', async () => {
  reset();
  const res = await call('/api/feedback', {
    method: 'POST',
    body: { kind: 'support', content: 'please look at my account', owner_id: OTHER_ID, ownerId: OTHER_ID, user_id: OTHER_ID },
  });
  assert.equal(res.status, 201, res.text);
  const row = written();
  assert.equal(row.owner_id, USER_ID, 'a request body chose whose account a support request belongs to');
  assert.equal(row.ownerId, undefined, 'a body key was copied into the row wholesale');
  assert.equal(row.user_id, undefined, 'a body key was copied into the row wholesale');
});

test('the row is written under the caller\'s own token, so RLS is a second lock and not the only one', async () => {
  reset();
  await call('/api/feedback', { method: 'POST', body: { kind: 'bug', content: 'a report long enough to be a report' } });
  const post = rest.find((r) => r.method === 'POST');
  assert.equal(post.auth, `Bearer ${JWT}`, 'the insert used a key other than the caller\'s own');
});

/* ----------------------------------------------------------------- categorising --- */

test('an unknown category is a 400 that names the categories, not a constraint violation', async () => {
  reset();
  const res = await call('/api/feedback', { method: 'POST', body: { kind: 'question', content: 'how do I do this' } });
  assert.equal(res.status, 400, res.text);
  assert.match(res.json.error, /bug/);
  assert.match(res.json.error, /support/);
  assert.match(res.json.error, /feedback/);
  // The point of validating: Postgres never sees it, so the user never sees Postgres's words.
  assert.equal(rest.length, 0, 'the bad category was sent to the database anyway');
});

test('each category the product offers is one the database accepts', async () => {
  for (const kind of ['feedback', 'bug', 'support']) {
    reset();
    const res = await call('/api/feedback', { method: 'POST', body: { kind, content: `a ${kind} report, written out` } });
    assert.equal(res.status, 201, `${kind} was refused: ${res.text}`);
    assert.equal(written().kind, kind);
  }
});

test('an empty report is refused with a sentence, and nothing is written', async () => {
  reset();
  const res = await call('/api/feedback', { method: 'POST', body: { kind: 'bug', content: '   ' } });
  assert.equal(res.status, 400);
  assert.ok(res.json.error.length > 5);
  assert.equal(rest.length, 0);
});

/* --------------------------------------------------------------------- secrets --- */

test('a session token in the page a report was filed from is never stored', async () => {
  reset();
  await call('/api/feedback', {
    method: 'POST',
    body: { kind: 'bug', content: 'broke right after I signed in', page: '/app/project/9b1d#access_token=eyJhbGciOiJIUzI1NiJ9.abc.def' },
  });
  const row = written();
  assert.equal(row.page, '/app/project/9b1d');
  assert.ok(!JSON.stringify(row).includes('access_token'), 'a live session token was filed into the support table');
});

test('a report whose text was edited says so, so nobody is quietly rewritten', async () => {
  reset();
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const res = await call('/api/feedback', { method: 'POST', body: { kind: 'bug', content: `the console printed ${jwt} and stopped` } });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.redacted, true, 'the submitter is not told their report was changed');
  assert.ok(!written().content.includes(jwt), 'the token was stored');
});

/* ---------------------------------------------------------------------- status --- */

test('a person can read back the reports they filed, with the status of each', async () => {
  reset();
  feedbackRows = [
    { id: 'r1', kind: 'bug', content: 'one', page: '/app', status: 'closed', created_at: '2026-08-01T00:00:00Z' },
    { id: 'r2', kind: 'support', content: 'two', page: null, status: 'open', created_at: '2026-09-01T00:00:00Z' },
  ];
  const res = await call('/api/feedback');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.requests.length, 2);
  // Without status the list is a receipt, not an answer: "did anyone read it" is the actual question.
  assert.deepEqual(res.json.requests.map((r) => r.status).sort(), ['closed', 'open']);
});

test('the listing is narrowed to the caller by the query, not left to RLS alone', async () => {
  reset();
  await call('/api/feedback');
  const get = rest.find((r) => r.method === 'GET');
  assert.ok(get, 'the listing never asked the database anything');
  // Belt and braces on purpose. RLS is the lock that must hold; an explicit owner clause means a
  // policy edited in a dashboard cannot silently turn this route into everyone's inbox.
  assert.equal(get.query.owner_id, `eq.${USER_ID}`, `the listing was not narrowed to the caller: ${JSON.stringify(get.query)}`);
  assert.equal(get.auth, `Bearer ${JWT}`);
});

test('the listing is bounded and newest first, so an old report cannot bury a new one', async () => {
  reset();
  await call('/api/feedback');
  const get = rest.find((r) => r.method === 'GET');
  assert.match(get.query.order ?? '', /created_at\.desc/, 'the listing has no order, so its order is whatever Postgres felt like');
  assert.ok(Number(get.query.limit) > 0, 'the listing is unbounded');
});

test('a listing never returns anyone else\'s rows even if the database hands them over', async () => {
  // The database is the thing being trusted here, so the test makes it untrustworthy. A route that
  // forwards whatever PostgREST returns would leak the moment a policy was edited badly.
  reset();
  feedbackRows = [
    { id: 'mine', owner_id: USER_ID, kind: 'bug', content: 'mine', page: null, status: 'open', created_at: '2026-09-01T00:00:00Z' },
    { id: 'theirs', owner_id: OTHER_ID, kind: 'bug', content: 'theirs', page: null, status: 'open', created_at: '2026-09-02T00:00:00Z' },
  ];
  const res = await call('/api/feedback');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.requests.map((r) => r.id), ['mine'], 'another account\'s support request was served');
});

/* -------------------------------------------------------- when the write fails --- */

test('a database that refuses produces an honest failure, not a fabricated receipt', async () => {
  reset();
  restStatus = 500;
  const res = await call('/api/feedback', { method: 'POST', body: { kind: 'bug', content: 'a report long enough to be a report' } });
  assert.ok(res.status >= 500, `a failed write answered ${res.status}`);
  assert.ok(!res.json?.id, 'a receipt was issued for a report that was never stored');
});

test('a write that returns no row is a failure, not a success with an empty id', async () => {
  reset();
  insertReply = [];
  const res = await call('/api/feedback', { method: 'POST', body: { kind: 'bug', content: 'a report long enough to be a report' } });
  assert.ok(res.status >= 500, `an empty insert result answered ${res.status}`);
  assert.ok(!res.json?.id);
});
