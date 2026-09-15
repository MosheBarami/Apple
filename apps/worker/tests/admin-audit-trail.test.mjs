/**
 * THE ADMIN AUDIT LOG RECORDS WHO ACTED AND ON WHOM.
 *
 * The gate at `/api/admin/*` has written an audit row on both branches — refused and allowed — for
 * a long time, and the row said almost nothing. `subject` was `c.req.method`, so every entry in the
 * operator's own audit stream read `GET` or `POST`; there was no field anywhere in it naming the
 * account the call touched, and `actorId` was left null even when the caller had signed in and the
 * worker was holding their verified token. So the log could answer "somebody did an admin thing"
 * and could not answer either of the two questions an audit log exists for.
 *
 * That is worse than no log. A record that exists, is tested, and is empty of the facts it purports
 * to hold is the shape this repository keeps finding: a check that cannot fail.
 *
 * WHAT IS ASSERTED HERE, and each of the four went red before the change:
 *
 *   1. `pathSubject` pulls the addressed id out of a path and returns null when there is not one.
 *      It is `routeLabel`'s twin: that one exists to keep ids OUT of the request log, this one
 *      exists to keep the id IN the audit log, which is the one place the id is the point.
 *   2. The gate files the addressed account as `subject`, not the HTTP method.
 *   3. The gate files the OPERATOR as `actorId` when a session token rides along with the admin
 *      key — which is what the admin console sends — and null when one does not. Null is honest:
 *      a shell script holding the shared key has no identity to record, and inventing one would be
 *      worse than the gap.
 *   4. The two routes that address a user through the BODY rather than the path — set-plan and
 *      quota-reset — file their own row naming that user. The gate cannot see a body it must not
 *      consume, so the handler that reads it is the only place that honestly can.
 *
 * Run with:  node --test tests/admin-audit-trail.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');

// ------------------------------------------------------------------ the pure half ---

const pureOut = join(mkdtempSync(join(tmpdir(), 'audit-subject-')), 'analytics.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'analytics.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + pureOut],
  { cwd: WORKER, stdio: 'pipe' },
);
const A = await import(`file://${pureOut}`);

test('pathSubject returns the id a path addresses', () => {
  assert.equal(A.pathSubject('/api/admin/account/8f14e45f-ceea-467a-9f8c-2c1d2b0e6d11'), '8f14e45f-ceea-467a-9f8c-2c1d2b0e6d11');
  assert.equal(A.pathSubject('/api/admin/session-info/0123456789abcdef0123'), '0123456789abcdef0123');
  assert.equal(A.pathSubject('/api/projects/8f14e45f-ceea-467a-9f8c-2c1d2b0e6d11/ws'), '8f14e45f-ceea-467a-9f8c-2c1d2b0e6d11');
});

test('a path that addresses nothing has NO subject — not an empty string, not the route', () => {
  // The failure this forbids: a subject field that is always populated with something
  // route-shaped reads, at a glance, exactly like a subject field that names an account.
  assert.equal(A.pathSubject('/api/admin/stats'), null);
  assert.equal(A.pathSubject('/api/admin/model-test'), null);
  assert.equal(A.pathSubject('/'), null);
});

test('pathSubject refuses what it cannot read rather than guessing', () => {
  assert.equal(A.pathSubject(null), null);
  assert.equal(A.pathSubject(42), null);
  assert.equal(A.pathSubject(undefined), null);
});

test('two addressed ids are both kept, in path order', () => {
  // /api/admin/…/<a>/…/<b> — dropping the second would file half the subject as the whole of it.
  assert.equal(
    A.pathSubject('/api/a/8f14e45f-ceea-467a-9f8c-2c1d2b0e6d11/b/7e14e45f-ceea-467a-9f8c-2c1d2b0e6d22'),
    '8f14e45f-ceea-467a-9f8c-2c1d2b0e6d11/7e14e45f-ceea-467a-9f8c-2c1d2b0e6d22',
  );
});

// ------------------------------------------------------------------ the gate, executed ---

const OUT = join(tmpdir(), `apple-admin-audit-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
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
const OPERATOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Every event the worker shipped to the durable sink, across all calls in one test. */
let shipped = [];

const adminDo = () => ({
  idFromName: () => 'singleton',
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      if (u.pathname === '/events' && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        shipped.push(...body.events);
        return Response.json({ ok: true, stored: body.events.length, rejected: {} });
      }
      if (u.pathname === '/events') return Response.json({ events: [], retained: 0, truncated: false });
      return Response.json({ counters: [] });
    },
  }),
});

const quotaDo = () => ({
  idFromName: (n) => n,
  get: () => ({ async fetch() { return Response.json({ ok: true, state: {} }); } }),
});

const ENV = () => ({
  ADMIN_KEY,
  SUPABASE_URL: 'https://supa.audit.test',
  SUPABASE_ANON_KEY: 'anon',
  ENVIRONMENT: 'test',
  ADMIN_DO: adminDo(),
  QUOTA_DO: quotaDo(),
  SESSION_DO: quotaDo(),
  PAIRING_DO: quotaDo(),
  BUDGET_DO: quotaDo(),
  DISCORD_DO: quotaDo(),
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
});
const CTX = { waitUntil() {}, passThroughOnException() {} };

/**
 * Make one admin call and return the audit rows it produced.
 *
 * The flush is forced through `/api/admin/logs`, which the worker's own code path calls
 * `flushEvents` from — so the rows observed here are the rows that would reach the sink in
 * production, not a private reading of the in-isolate ring.
 */
async function auditFor(path, { method = 'GET', key = ADMIN_KEY, jwt = null, body } = {}) {
  shipped = [];
  const env = ENV();
  const headers = { 'CF-Connecting-IP': '198.51.100.7', 'X-Admin-Key': key };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  await app.fetch(new Request('https://w' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env, CTX);
  await app.fetch(new Request('https://w/api/admin/logs?kind=audit', { headers: { 'X-Admin-Key': ADMIN_KEY } }), env, CTX);
  return shipped.filter((e) => e.kind === 'audit');
}

test('CONTROL: an admin call still produces an audit row at all', async () => {
  const rows = await auditFor('/api/admin/stats');
  assert.ok(rows.length >= 1, 'the gate must keep writing an audit row');
  assert.equal(rows[0].allowed, true);
  assert.equal(rows[0].actorKind, 'admin');
});

test('THE SUBJECT IS THE ACCOUNT ADDRESSED, NOT THE HTTP METHOD', async () => {
  const rows = await auditFor(`/api/admin/account/${CUSTOMER}`);
  const row = rows.find((e) => e.subject === CUSTOMER);
  assert.ok(row, `no audit row named the account: ${JSON.stringify(rows)}`);
  assert.notEqual(row.subject, 'GET', 'the method is not a subject');
});

test('a call that addresses nobody files a null subject rather than a method', async () => {
  const rows = await auditFor('/api/admin/stats');
  assert.equal(rows[0].subject, null, 'nothing was addressed, so nothing may be named');
});

test('the method survives — on `action`, where it belongs', async () => {
  const rows = await auditFor('/api/admin/stats');
  assert.match(rows[0].action, /^GET /, 'the action names the method and the route');
  assert.match(rows[0].action, /\/api\/admin\/stats/);
});

test('THE OPERATOR IS RECORDED when their session token rides along with the key', async () => {
  // This is what the admin console sends: lib/api.ts always attaches the Supabase bearer, and the
  // admin key goes on beside it. Before the change the gate threw that identity away.
  const rows = await auditFor('/api/admin/stats', { jwt: OPERATOR });
  assert.equal(rows[0].actorId, OPERATOR, 'the signed-in operator must be named');
});

test('and is NULL — never invented — when the caller has no session', async () => {
  const rows = await auditFor('/api/admin/stats');
  assert.equal(rows[0].actorId, null, 'a shared key with no session has no identity to record');
});

test('a REFUSED call is recorded with the same facts, which is when they matter most', async () => {
  const rows = await auditFor(`/api/admin/account/${CUSTOMER}`, { key: 'wrong-key', jwt: OPERATOR });
  const row = rows.find((e) => e.allowed === false);
  assert.ok(row, 'a refusal must be audited');
  assert.equal(row.subject, CUSTOMER, 'including what they were reaching for');
  assert.equal(row.actorId, OPERATOR, 'and who was holding the session while they reached');
  assert.equal(row.actorKind, 'unknown', 'but not credited as an admin — they failed the key');
});

test('SET-PLAN NAMES THE ACCOUNT IT MOVED — the id is in the body, so the gate cannot see it', async () => {
  const rows = await auditFor('/api/admin/set-plan', { method: 'POST', body: { userId: CUSTOMER, plan: 'builder' } });
  const row = rows.find((e) => e.action.includes('set-plan') && e.subject === CUSTOMER);
  assert.ok(row, `no audit row named the account whose plan changed: ${JSON.stringify(rows)}`);
  assert.equal(row.allowed, true);
});

test('QUOTA-RESET NAMES THE ACCOUNT IT CLEARED', async () => {
  const rows = await auditFor('/api/admin/quota-reset', { method: 'POST', body: { userId: CUSTOMER } });
  const row = rows.find((e) => e.action.includes('quota-reset') && e.subject === CUSTOMER);
  assert.ok(row, `no audit row named the account whose day was cleared: ${JSON.stringify(rows)}`);
});
