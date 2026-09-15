/**
 * "THE PASSWORD ON YOUR ACCOUNT WAS CHANGED" — the one security event the worker could not see.
 *
 * `securityNotice` had five call sites, all of them things this worker DOES: a key minted, rotated,
 * revoked, a member added, removed. A password change is not one of those. Supabase performs it,
 * the worker only ever verifies the JWT that comes back afterwards, and so the single most
 * important line in an account's history — the one an attacker writes on their way in — was the one
 * line the history could not contain. The settings page showed a local toast and told nobody.
 *
 * There is no server-side hook to add in this deployment, so the browser reports it. That is worth
 * being honest about in both directions and the route's own comment says so: an attacker who
 * changes the password can simply not make the call. What it covers is the ordinary case — a
 * machine left signed in, a password changed on it, and the owner reading their history later from
 * somewhere else.
 *
 * The properties under test, in the order they matter:
 *
 *   1. IT IS RECORDED AGAINST THE CALLER, AND THE INBOX CAN READ IT BACK. End to end over HTTP,
 *      against a real SQLite, so the notice is observed where the user would see it rather than
 *      inferred from the fact that a function was called.
 *   2. THE RECIPIENT COMES FROM THE TOKEN. A body naming somebody else does not write into their
 *      inbox — a route that took a user id would be a way to post alarming sentences into any
 *      account in the product.
 *   3. IT SAYS WHETHER IT RECORDED. When the store is broken the answer is `recorded: false`, not a
 *      cheerful `ok: true`. The page prints "noted in your account history" only on the first, and
 *      a route that cannot tell them apart makes that sentence a guess.
 *   4. REPEATING IT DOES NOT FLOOD THE INBOX. Same subject, same day: the store coalesces and
 *      counts, which is what stops a retry loop burying the row above it.
 *
 * Run with:  node --test tests/security-events.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { d1 } from './stubs/d1.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const TMP = mkdtempSync(join(tmpdir(), 'golem-security-events-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(
  ESBUILD,
  [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.security.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'security-test', alg: 'ES256', use: 'sig' };
const mint = (sub) =>
  new jose.SignJWT({ email: `${sub}@golem.test`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'security-test' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

const OWNER_JWT = await mint(OWNER_ID);
const OTHER_JWT = await mint(OTHER_ID);

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.includes('/rest/v1/profiles')) return json([{ id: OWNER_ID, plan: 'free', is_admin: false, display_name: 'owner' }]);
  return json([]);
};

function doNamespace() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    get: () => ({ async fetch() { return new Response(JSON.stringify({ ok: true }), { status: 200 }); } }),
  };
}

/** A REAL database. A fake that records the SQL it was handed cannot answer "is the row there". */
let db = d1();

/** `CORPUS` normally, or a binding that throws, for the honesty test. */
let corpus = () => db.CORPUS;

const env = () => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  CORPUS: corpus(),
  VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
  SESSION_DO: doNamespace(),
  QUOTA_DO: doNamespace(),
  PAIRING_DO: doNamespace(),
  ADMIN_DO: doNamespace(),
  BUDGET_DO: doNamespace(),
});

async function call(path, { method = 'GET', jwt = OWNER_JWT, body } = {}) {
  const headers = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    env(),
  );
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json: parsed, text };
}

const securityRows = async (jwt) => {
  const r = await call('/api/notifications', { jwt });
  assert.equal(r.status, 200, r.text);
  return r.json.items.filter((i) => i.kind === 'security_event');
};

// ---------------------------------------------------------------------------------------------
// 1. recorded, and readable where the person would read it
// ---------------------------------------------------------------------------------------------

test('CONTROL: an inbox with nothing in it answers with nothing', async () => {
  // Without this every assertion below could pass on a harness that cannot see rows at all — the
  // empty-parser failure, which is the one that reports success loudest.
  assert.deepEqual(await securityRows(OWNER_JWT), []);
});

test('A PASSWORD CHANGE REACHES THE ACCOUNT HISTORY', async () => {
  const r = await call('/api/security/password-changed', { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.recorded, true);

  const rows = await securityRows(OWNER_JWT);
  assert.equal(rows.length, 1, 'the row the settings page will render');
  assert.match(rows[0].title, /password/i);
  assert.equal(rows[0].severity, 'urgent');
  assert.equal(rows[0].readAt, null, 'unread, so it shows as new');
  assert.equal(rows[0].href, '/app/settings', 'and it opens the page it is about');
  assert.match(rows[0].body ?? '', /was not you/i, 'and says what to do about it');
});

// ---------------------------------------------------------------------------------------------
// 2. whose inbox
// ---------------------------------------------------------------------------------------------

test('THE RECIPIENT IS THE TOKEN, NOT THE BODY', async () => {
  // A route that read a user id out of the body would let any account post "your password was
  // changed" into any other account's history — an alarm anyone can pull.
  const r = await call('/api/security/password-changed', {
    method: 'POST',
    jwt: OTHER_JWT,
    body: { userId: OWNER_ID, recipientId: OWNER_ID },
  });
  assert.equal(r.status, 200, r.text);

  const mine = await securityRows(OWNER_JWT);
  assert.equal(mine.length, 1, "the other account's post did not land in this inbox");
  const theirs = await securityRows(OTHER_JWT);
  assert.equal(theirs.length, 1, 'it landed in their own');
});

test('an unauthenticated caller is refused, and writes nothing', async () => {
  const before = (await securityRows(OWNER_JWT)).length;
  const r = await call('/api/security/password-changed', { method: 'POST', jwt: null });
  assert.equal(r.status, 401);
  assert.equal((await securityRows(OWNER_JWT)).length, before);
});

// ---------------------------------------------------------------------------------------------
// 3. it says whether it recorded
// ---------------------------------------------------------------------------------------------

test('A NOTICE THAT DID NOT LAND IS REPORTED AS NOT LANDED', async () => {
  // The page prints "noted in your account history" on the strength of this field. If the route
  // answered `ok: true` whatever happened, that sentence would be a guess — a failure to observe
  // rendering as an observation, on the page whose whole job is to be believed.
  const healthy = db;
  corpus = () => ({
    exec: async () => { throw new Error('D1 is down'); },
    prepare: () => { throw new Error('D1 is down'); },
    batch: async () => { throw new Error('D1 is down'); },
  });
  try {
    const r = await call('/api/security/password-changed', { method: 'POST' });
    assert.equal(r.status, 200, 'the password really did change; this route must not report that as failed');
    assert.equal(r.json.recorded, false, 'and it must not claim a record it does not have');
    assert.equal(typeof r.json.reason, 'string');
  } finally {
    corpus = () => healthy.CORPUS;
  }
});

// ---------------------------------------------------------------------------------------------
// 4. repeating it
// ---------------------------------------------------------------------------------------------

test('a repeated report is counted, not stacked', async () => {
  await call('/api/security/password-changed', { method: 'POST' });
  await call('/api/security/password-changed', { method: 'POST' });
  const rows = await securityRows(OWNER_JWT);
  assert.equal(rows.length, 1, 'one row for one subject inside the dedupe window');
  assert.ok(rows[0].occurrences >= 3, `counted instead: ${rows[0].occurrences}`);
});

test('marking it read marks it read, and the count comes back from the write', async () => {
  const rows = await securityRows(OWNER_JWT);
  const r = await call('/api/notifications/read', { method: 'POST', body: { ids: rows.map((i) => i.id) } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.marked, rows.length);
  const after = await securityRows(OWNER_JWT);
  assert.ok(after.every((i) => i.readAt !== null), 'the panel will now render them as seen');
});
