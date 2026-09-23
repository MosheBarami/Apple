/**
 * THE CLOUDFLARE PLATFORM HOOKS IN THE REAL HONO APP (D-VISION-1).
 *
 * The modules are driven alone in cloudflare-platform.test.mjs. This file proves index.ts really
 * calls them: Turnstile in front of the recovery request, the admin read path behind the admin key,
 * and the queue consumer exported beside `fetch` and `scheduled`.
 *
 * Run with:  node --test tests/cloudflare-platform-routes-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-cf-routes-${process.pid}.mjs`);

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
const mod = await import(`file://${OUT}`);
const app = mod.default;
process.on('exit', () => rmSync(OUT, { force: true }));

const ctx = { waitUntil() {}, passThroughOnException() {} };
const hit = (url, init, env) => app.request(url, init, env, ctx);
const ADMIN_KEY = 'admin-key-for-the-test';
const envFor = (db, extra = {}) => ({
  CORPUS: db.CORPUS,
  ADMIN_KEY,
  KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
  ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  ...extra,
});
let nextIp = 0;
const post = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${(nextIp += 1) % 250}` },
  body: JSON.stringify(body),
});
const RECOVERY = 'https://x/api/recovery-request';
const rows = (db) => { try { return countRows(db.raw, 'select count(*) from recovery_requests'); } catch { return 0; } };

async function withSiteverify(answer, fn) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://challenges.cloudflare.com/')) {
      seen.push(init.body);
      return new Response(JSON.stringify(answer));
    }
    return real(url, init);
  };
  try { return await fn(seen); } finally { globalThis.fetch = real; }
}

test('recovery request: with no Turnstile secret it behaves exactly as before', async () => {
  const db = d1();
  const res = await hit(RECOVERY, post({ email: 'sam@example.com', note: 'lost phone' }), envFor(db));
  assert.equal(res.status, 200);
  assert.equal(rows(db), 1);
  db.close();
});

test('recovery request: with a secret, no token is refused and nothing is written', async () => {
  const db = d1();
  const res = await hit(RECOVERY, post({ email: 'sam@example.com', note: 'x' }), envFor(db, { TURNSTILE_SECRET: '2x0000000000000000000000000000000AA' }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.reason, 'missing_token');
  assert.match(body.error, /confirm you are a person/);
  assert.equal(rows(db), 0);
  db.close();
});

test('recovery request: a token Cloudflare rejects is refused', async () => {
  const db = d1();
  await withSiteverify({ success: false, 'error-codes': ['invalid-input-response'] }, async () => {
    const res = await hit(RECOVERY, post({ email: 'sam@example.com', note: 'x', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }), envFor(db, { TURNSTILE_SECRET: '2x0000000000000000000000000000000AA' }));
    assert.equal(res.status, 403);
  });
  assert.equal(rows(db), 0);
  db.close();
});

test('recovery request: a token Cloudflare accepts goes through, checked against the recovery action', async () => {
  const db = d1();
  await withSiteverify({ success: true, action: 'recovery' }, async (seen) => {
    const res = await hit(RECOVERY, post({ email: 'sam@example.com', note: 'x', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }), envFor(db, { TURNSTILE_SECRET: '1x0000000000000000000000000000000AA' }));
    assert.equal(res.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].get('response'), 'XXXX.DUMMY.TOKEN.XXXX');
  });
  assert.equal(rows(db), 1);
  db.close();
});

test('product analytics: behind the admin key, and says what is missing instead of showing zeros', async () => {
  const db = d1();
  const anon = await hit('https://x/api/admin/product-analytics', {}, envFor(db));
  assert.ok(anon.status === 401 || anon.status === 403, `no admin key: ${anon.status}`);
  const res = await hit('https://x/api/admin/product-analytics?days=30', { headers: { 'X-Admin-Key': ADMIN_KEY } }, envFor(db));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.configured, false);
  assert.match(body.why, /CF_ANALYTICS_TOKEN/);
  db.close();
});

test('the worker exports a queue consumer and the Workflow class', async () => {
  assert.equal(typeof app.queue, 'function');
  assert.equal(typeof mod.ModelUploadWorkflow, 'function');
  const acked = [];
  const db = d1();
  // A notice with no kind is refused by policy: acknowledged, never retried forever.
  await app.queue({ messages: [{ body: { recipientId: '' }, attempts: 1, ack: () => acked.push(1), retry: () => assert.fail('no retry') }] }, envFor(db));
  assert.deepEqual(acked, [1]);
  db.close();
});
