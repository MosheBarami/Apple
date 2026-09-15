/**
 * A REJECTED STRIPE WEBHOOK HAS TO BE VISIBLE TO SOMEONE WHO DOES NOT USE A TERMINAL.
 *
 * `/api/billing/webhook` is the source of truth for entitlement: every upgrade, downgrade,
 * cancellation and credit grant arrives through it. When the signature does not verify it refuses —
 * correctly — and the reason was written to `console.warn`. In a Cloudflare Worker that means
 * `wrangler tail`, a live-only stream, watched by nobody, gone the moment the session closes.
 *
 * So the failure mode is: the signing secret is rotated in the Stripe dashboard and not here. Every
 * webhook is refused from that moment on. Nobody is upgraded, nobody is downgraded, paid customers
 * silently stay on free — and the only record that it is happening is in a log stream the person
 * who runs this business has no way to read. The admin console's error log would have shown it on
 * the first refusal, and there was no path from one to the other.
 *
 * THE TWO HALVES ARE ASSERTED TOGETHER, because they pull in opposite directions:
 *   * the reason must reach the ERROR LOG, where the operator can see it, and
 *   * the reason must NOT reach the RESPONSE, or a prober learns which part of their forgery was
 *     wrong. The route's own comment states that second rule; recording the reason must not quietly
 *     repeal it.
 *
 * Run with:  node --test tests/webhook-failure-visibility.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-webhook-visibility-${process.pid}.mjs`);

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
let shipped = [];

const adminDo = () => ({
  idFromName: () => 'singleton',
  get: () => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      if (u.pathname === '/events' && init?.method === 'POST') {
        shipped.push(...JSON.parse(init.body).events);
        return Response.json({ ok: true, stored: 0, rejected: {} });
      }
      if (u.pathname === '/events') return Response.json({ events: [], retained: 0, truncated: false });
      return Response.json({ counters: [] });
    },
  }),
});
const doStub = () => ({ idFromName: (n) => n, get: () => ({ async fetch() { return Response.json({ ok: true }); } }) });

const ENV = () => ({
  ADMIN_KEY,
  STRIPE_WEBHOOK_SECRET: 'whsec_the_one_this_deployment_holds',
  SUPABASE_URL: 'https://supa.webhook.test',
  SUPABASE_ANON_KEY: 'anon',
  ENVIRONMENT: 'test',
  ADMIN_DO: adminDo(),
  QUOTA_DO: doStub(), SESSION_DO: doStub(), PAIRING_DO: doStub(), BUDGET_DO: doStub(), DISCORD_DO: doStub(),
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
});
const CTX = { waitUntil() {}, passThroughOnException() {} };

/** Post a webhook signed with the WRONG secret — exactly what a rotated secret looks like here. */
async function forgedWebhook(signature) {
  shipped = [];
  const env = ENV();
  const res = await app.fetch(new Request('https://w/api/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' }),
  }), env, CTX);
  // Force the flush through the worker's own path, so what is observed is what would reach the sink.
  await app.fetch(new Request('https://w/api/admin/logs?kind=error', { headers: { 'X-Admin-Key': ADMIN_KEY } }), env, CTX);
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body, events: shipped };
}

test('CONTROL: a webhook signed with the wrong secret is still refused', async () => {
  const r = await forgedWebhook(`t=${Math.floor(Date.now() / 1000)},v1=0000000000000000000000000000000000000000000000000000000000000000`);
  assert.equal(r.status, 400, 'an unverifiable webhook must not be accepted');
});

test('THE REFUSAL REACHES THE ERROR LOG — wrangler tail is not a place the owner can look', async () => {
  const r = await forgedWebhook(`t=${Math.floor(Date.now() / 1000)},v1=0000000000000000000000000000000000000000000000000000000000000000`);
  const err = r.events.find((e) => e.kind === 'error' && e.scope === '/api/billing/webhook');
  assert.ok(err, `no error event was recorded for the refusal: ${JSON.stringify(r.events)}`);
  assert.equal(err.errorKind, 'stripe_signature', 'named, so a rotated secret is distinguishable from a forgery attempt');
  assert.ok(typeof err.message === 'string' && err.message.length > 0, 'and carries the reason the verifier gave');
});

test('a MISSING signature header is recorded too — that is what a misconfigured endpoint sends', async () => {
  const r = await forgedWebhook('');
  assert.equal(r.status, 400);
  assert.ok(r.events.some((e) => e.kind === 'error' && e.scope === '/api/billing/webhook'), 'silence here is a silent entitlement outage');
});

test('IT IS NOT FATAL — one forged webhook is not an outage, and the count must stay meaningful', async () => {
  const r = await forgedWebhook(`t=${Math.floor(Date.now() / 1000)},v1=1111111111111111111111111111111111111111111111111111111111111111`);
  const err = r.events.find((e) => e.kind === 'error' && e.scope === '/api/billing/webhook');
  assert.equal(err.fatal, false, 'anyone can POST a forgery; marking each one fatal would bury the real thing');
});

test('AND THE REASON STILL DOES NOT REACH THE CALLER', async () => {
  // The route's own rule: a prober must not learn which part of their forgery was wrong. Logging
  // the reason must not quietly repeal it.
  const r = await forgedWebhook(`t=${Math.floor(Date.now() / 1000)},v1=0000000000000000000000000000000000000000000000000000000000000000`);
  assert.deepEqual(r.body, { error: 'invalid signature' }, 'the response says only that it was invalid');
});
