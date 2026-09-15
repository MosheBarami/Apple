/**
 * THE EMERGENCY STOP MUST NOT DEPEND ON SUPABASE BEING UP.
 *
 * The admin gate now identifies the operator behind a call so the audit log can say who acted. That
 * identification runs `verifyJwt`, which reaches out to Supabase's JWKS endpoint — and the admin
 * surface is the one you use when things are on fire. `POST /api/admin/kill-switch` is how AI
 * generation is stopped when spend is running away; a gate that refuses, throws or hangs because an
 * identity provider is unreachable has coupled the fire alarm to the building.
 *
 * So identification is BEST EFFORT, always. It may produce a name; it may never produce a refusal,
 * an exception, or a delay that outlives the request. The authority to act is the admin key and
 * nothing else — exactly as it was before the log learned to name people.
 *
 * TWO SHAPES OF THAT FAILURE ARE EXERCISED, because they fail in different places:
 *   * SUPABASE_URL absent or malformed. `new URL(`${undefined}/auth/v1/...`)` THROWS, and it throws
 *     OUTSIDE verifyJwt's own try/catch — so this is an exception on the way in, not a null on the
 *     way out.
 *   * the JWKS fetch failing. That one is inside the try, and the honest result is an unnamed
 *     operator rather than a refused admin.
 *
 * Run with:  node --test tests/admin-gate-independence.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-admin-gate-${process.pid}.mjs`);

// NOTE: auth is NOT stubbed here. The whole point is the real `verifyJwt`, with its real `new URL`
// on the way in — a stub would answer null politely and the test would prove nothing.
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-cf',
    setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const ADMIN_KEY = 'a-high-entropy-admin-key';
const doStub = () => ({
  idFromName: (n) => n,
  get: () => ({
    async fetch(url) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      if (u.pathname === '/events') return Response.json({ events: [], retained: 0, truncated: false, stored: 0, rejected: {} });
      return Response.json({ ok: true, counters: [], killed: true });
    },
  }),
});

const envWith = (over) => ({
  ADMIN_KEY,
  SUPABASE_ANON_KEY: 'anon',
  ENVIRONMENT: 'test',
  ADMIN_DO: doStub(), QUOTA_DO: doStub(), SESSION_DO: doStub(),
  PAIRING_DO: doStub(), BUDGET_DO: doStub(), DISCORD_DO: doStub(),
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  ...over,
});
const CTX = { waitUntil() {}, passThroughOnException() {} };

const hit = (env, headers) =>
  app.fetch(new Request('https://w/api/admin/stats', { headers: { 'CF-Connecting-IP': '198.51.100.20', ...headers } }), env, CTX);

test('CONTROL: with a healthy config the gate lets an admin call through', async () => {
  const res = await hit(envWith({ SUPABASE_URL: 'https://supa.gate.test' }), { 'X-Admin-Key': ADMIN_KEY });
  assert.equal(res.status, 200, 'without this every assertion below passes for the wrong reason');
});

test('AN UNCONFIGURED SUPABASE_URL MUST NOT TAKE THE ADMIN SURFACE DOWN', async () => {
  // `new URL('undefined/auth/v1/.well-known/jwks.json')` throws, and it throws before verifyJwt's
  // own try/catch can turn it into a null.
  const res = await hit(envWith({ SUPABASE_URL: undefined }), { 'X-Admin-Key': ADMIN_KEY, Authorization: 'Bearer something' });
  assert.equal(res.status, 200, 'a missing identity provider must cost a NAME in the log, not the admin route');
});

test('a malformed SUPABASE_URL is the same story', async () => {
  const res = await hit(envWith({ SUPABASE_URL: 'not a url at all' }), { 'X-Admin-Key': ADMIN_KEY, Authorization: 'Bearer something' });
  assert.equal(res.status, 200);
});

test('AND THE KILL SWITCH ITSELF STILL WORKS WITH NO IDENTITY PROVIDER', async () => {
  // The route this whole file exists for: stopping spend must not need Supabase.
  const res = await app.fetch(new Request('https://w/api/admin/kill-switch', {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN_KEY, Authorization: 'Bearer something', 'content-type': 'application/json' },
    body: JSON.stringify({ killed: true, reason: 'spend runaway' }),
  }), envWith({ SUPABASE_URL: undefined }), CTX);
  assert.equal(res.status, 200, 'the emergency stop must not be coupled to an identity provider');
});

test('a JWKS endpoint that cannot be reached costs the name, not the call', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('jwks unreachable'); };
  try {
    const res = await hit(envWith({ SUPABASE_URL: 'https://supa.down.test' }), { 'X-Admin-Key': ADMIN_KEY, Authorization: 'Bearer something' });
    assert.equal(res.status, 200, 'an unreachable identity provider must not refuse an admin holding the right key');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('AND A WRONG KEY IS STILL REFUSED when the identity provider is down', async () => {
  // The other direction, and the one that would be a security defect: "we could not identify you"
  // must never become "so we let you in".
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('jwks unreachable'); };
  try {
    const res = await hit(envWith({ SUPABASE_URL: 'https://supa.down.test' }), { 'X-Admin-Key': 'wrong', Authorization: 'Bearer something' });
    assert.equal(res.status, 403, 'the key is the authority, and it still is');
  } finally {
    globalThis.fetch = realFetch;
  }
});
