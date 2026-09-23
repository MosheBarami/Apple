/**
 * D-PAY-2 — STRIPE TEST MODE, END TO END, FOR ADMINS ONLY.
 *
 * `checkoutConfigured` refuses a test key in production because a test key sells the plan for the
 * published card 4242. That stays true for everybody else. The one exception is a signed-in account
 * whose email is on `BILLING_TEST_ADMINS`: that account may open a test-mode checkout, is told it is
 * test mode, and the `livemode: false` webhook that follows grants ITS plan — and nobody else's.
 *
 * The webhook half is the one that matters most: a test-mode event in production that is not tied
 * to an allow-listed admin must change nothing, whatever the rest of it says.
 *
 * Signatures are constructed exactly as Stripe's `webhooks.generateTestHeaderString` does
 * (`t=<ts>,v1=HMAC-SHA256(secret, "<ts>.<body>")`) — the `stripe` package is not a dependency here.
 *
 * Run with:  node --test tests/billing-test-admins.test.mjs      (from apps/worker)
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
const TMP = mkdtempSync(join(tmpdir(), 'apple-test-admins-'));
const bundle = (entry, name, extra = []) => {
  const out = join(TMP, name);
  execFileSync(ESBUILD, [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022', ...extra,
    `--outfile=${out}`], { stdio: 'pipe', cwd: WORKER });
  return import(`file://${out}`);
};
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const B = await bundle('billing.ts', 'billing.mjs');
const AUTHORITY = await bundle('billing-origin-authority.ts', 'authority.mjs');
const APP = (await bundle('index.ts', 'worker.mjs', [`--alias:cloudflare:workers=${CF_SHIM}`])).default;

const ADMIN = 'Owner@Apple.test';
const PRICES = { STRIPE_PRICE_BUILDER: 'price_builder_1', STRIPE_PRICE_STUDIO: 'price_studio_1' };
const PROD_TEST_KEY = {
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_SECRET_KEY: 'sk_test_x',
  ENVIRONMENT: 'production',
  // Spaces and case differ from the signed-in address on purpose: the list is typed by a person.
  BILLING_TEST_ADMINS: ' someone@else.test ,  owner@apple.TEST ',
  ...PRICES,
};

// ------------------------------------------------------------------------------------ pure half

test('a non-admin in production with a test key is refused, exactly as before', () => {
  for (const email of ['buyer@apple.test', null, undefined, '']) {
    assert.equal(B.checkoutConfigured(PROD_TEST_KEY, email), false, String(email));
    const config = B.billingConfigFor(PROD_TEST_KEY, email);
    assert.equal(config.checkout, false);
    assert.deepEqual(config.purchasable, []);
    assert.notEqual(config.testMode, true, 'nobody refused is told they are in test mode');
    const r = B.buildCheckoutRequest(PROD_TEST_KEY, { userId: 'u_1', email, plan: 'builder', returnTo: 'https://x/app/usage' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 503);
  }
  // No allowlist at all: nobody, including an empty address matching an empty entry.
  const noList = { ...PROD_TEST_KEY, BILLING_TEST_ADMINS: undefined };
  assert.equal(B.checkoutConfigured(noList, ADMIN), false);
  assert.equal(B.checkoutConfigured({ ...PROD_TEST_KEY, BILLING_TEST_ADMINS: ' , ' }, ''), false);
});

test('an allow-listed admin is admitted, told it is test mode, and the session says whose it is', () => {
  assert.equal(B.checkoutConfigured(PROD_TEST_KEY, ADMIN), true);
  const config = B.billingConfigFor(PROD_TEST_KEY, ADMIN);
  assert.equal(config.checkout, true);
  assert.deepEqual([...config.purchasable].sort(), ['builder', 'studio']);
  assert.equal(config.testMode, true);
  const r = B.buildCheckoutRequest(PROD_TEST_KEY, { userId: 'u_admin', email: ADMIN, plan: 'builder', returnTo: 'https://x/app/usage' });
  assert.equal(r.ok, true, r.error);
});

test('the billing contact cannot make a non-admin an admin — only the signed-in address counts', () => {
  // The billing contact is a field the customer types. Naming the owner's address there must not
  // open a test checkout for somebody else.
  const r = B.buildCheckoutRequest(PROD_TEST_KEY, {
    userId: 'u_1', email: 'buyer@apple.test', billingEmail: ADMIN, plan: 'builder', returnTo: 'https://x/app/usage',
  });
  assert.equal(r.ok, false);
});

test('a live key in production is unchanged and never claims test mode', () => {
  const live = { ...PROD_TEST_KEY, STRIPE_SECRET_KEY: 'sk_live_x' };
  for (const email of [ADMIN, 'buyer@apple.test', null]) {
    assert.equal(B.checkoutConfigured(live, email), true);
    assert.notEqual(B.billingConfigFor(live, email).testMode, true);
  }
});

// ------------------------------------------------------------------------------- over the routes

const SUPABASE_URL = 'https://supa.admins.test';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const BUYER_ID = '22222222-2222-4222-8222-222222222222';
const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'k', alg: 'ES256', use: 'sig' };
const jwtFor = (sub, email) => new jose.SignJWT({ email, role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'k' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`).setAudience('authenticated').setSubject(sub)
  .setIssuedAt().setExpirationTime('1h').sign(privateKey);
const ADMIN_JWT = await jwtFor(ADMIN_ID, 'owner@apple.test');
const BUYER_JWT = await jwtFor(BUYER_ID, 'buyer@apple.test');
const LATER = Math.floor(Date.now() / 1000) + 10 * 86_400;

let doCalls = [];
let stripeCalls = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
  if (url.startsWith('https://api.stripe.com/')) {
    stripeCalls.push({ url, body: String(init?.body ?? '') });
    return Response.json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  }
  if (url.includes('/rest/v1/profiles')) return Response.json([{ id: ADMIN_ID, plan: 'free', is_admin: false }]);
  return Response.json([]);
};

const env = (over = {}) => {
  const e = {
    SUPABASE_URL, SUPABASE_ANON_KEY: 'anon', BILLING_WORKER_NAME: 'apple', ADMIN_KEY: 'k',
    KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
    CORPUS: { exec: async () => ({}), batch: async () => [], prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }) },
    ...PROD_TEST_KEY,
    ...over,
  };
  const ns = (namespace) => ({
    idFromName: (n) => ({ toString: () => n }),
    get: (id) => ({
      async fetch(url, init) {
        const path = new URL(typeof url === 'string' ? url : url.url).pathname;
        const body = init?.body ? JSON.parse(init.body) : null;
        doCalls.push({ path, id: id.toString(), namespace, body });
        if (path === '/billing-authority') {
          // The real resolver, with Stripe's current subscription equal to the event's.
          const resolved = await AUTHORITY.resolveBillingAuthorityMutation(body.event, e, async () => Response.json(body.event.data.object));
          return Response.json({ ok: true, replayed: false, mutation: resolved ? AUTHORITY.sequenceBillingMutation(resolved, 1) : null });
        }
        if (path === '/billing-replica') return Response.json({ ok: true, replayed: false, stale: false, authoritySequence: body.mutation.authoritySequence });
        if (path === '/billing') return Response.json({ plan: 'free', customerId: null, subscription: null, events: [] });
        return Response.json({ ok: true });
      },
    }),
  });
  return { ...e, QUOTA_DO: ns('apple'), LEGACY_QUOTA_DO: ns('golem'), SESSION_DO: ns('s'), PAIRING_DO: ns('p'), ADMIN_DO: ns('a'), BUDGET_DO: ns('b') };
};

async function call(path, { jwt, method = 'GET', body, environment } = {}) {
  const headers = { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  const res = await APP.fetch(new Request(`https://apple.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env(environment));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

async function webhook(event, environment) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_x'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const waited = [];
  const ctx = { waitUntil: (p) => waited.push(Promise.resolve(p)), passThroughOnException: () => {} };
  const res = await APP.fetch(new Request('https://apple.test/api/billing/webhook', {
    method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' }, body,
  }), env(environment), ctx);
  const out = { status: res.status, json: await res.json() };
  await Promise.allSettled(waited);
  return out;
}

const reset = () => { doCalls = []; stripeCalls = []; };
const granted = () => doCalls.filter((c) => c.path === '/billing-authority' || c.path === '/billing-replica');

/** The subscription metadata a checkout for this user would have produced, read off the real session body. */
async function subscriptionMetadataFromCheckout(jwt) {
  reset();
  const r = await call('/api/billing/checkout', { jwt, method: 'POST', body: { plan: 'builder' } });
  assert.equal(r.status, 200, r.text);
  const p = new URLSearchParams(stripeCalls[0].body);
  const meta = {};
  for (const [k, v] of p) {
    const m = /^subscription_data\[metadata\]\[(.+)\]$/.exec(k);
    if (m) meta[m[1]] = v;
  }
  return meta;
}

const subscriptionEvent = (id, metadata, livemode) => ({
  id, type: 'customer.subscription.created', livemode,
  data: { object: { id: `sub_${id}`, customer: 'cus_1', status: 'active', current_period_end: LATER,
    cancel_at_period_end: false, items: { data: [{ id: 'si_1', price: { id: 'price_builder_1' } }] }, metadata } },
});

test('config: the admin is offered test-mode checkout; a stranger and a visitor are not', async () => {
  const admin = await call('/api/billing/config', { jwt: ADMIN_JWT });
  assert.equal(admin.status, 200, admin.text);
  assert.equal(admin.json.checkout, true);
  assert.equal(admin.json.testMode, true);
  assert.ok(admin.json.purchasable.includes('builder'));
  for (const jwt of [BUYER_JWT, undefined, 'not-a-jwt']) {
    const r = await call('/api/billing/config', { jwt });
    assert.equal(r.status, 200, 'the public route stays public, and a bad token is just a visitor');
    assert.equal(r.json.checkout, false);
    assert.deepEqual(r.json.purchasable, []);
    assert.notEqual(r.json.testMode, true);
  }
});

test('checkout: a non-admin is refused before Stripe is asked; the admin gets a session', async () => {
  reset();
  const refused = await call('/api/billing/checkout', { jwt: BUYER_JWT, method: 'POST', body: { plan: 'builder' } });
  assert.equal(refused.status, 503, refused.text);
  assert.equal(stripeCalls.length, 0, 'no Stripe session may be minted for a non-admin');
  const meta = await subscriptionMetadataFromCheckout(ADMIN_JWT);
  assert.equal(stripeCalls.length, 1);
  assert.equal(meta.userId, ADMIN_ID);
});

test('webhook: a livemode:false event for a non-admin grants nothing, and is answered 200', async () => {
  // Every shape a non-admin test-mode event could take: no marker, a marker naming a non-admin, and
  // a marker naming the admin's address on somebody else's subscription is covered by the checkout
  // refusing to mint one — so here the metadata is the most a stranger's session could carry.
  for (const metadata of [
    { userId: BUYER_ID, plan: 'builder' },
    { userId: BUYER_ID, plan: 'builder', testAdmin: 'buyer@apple.test' },
  ]) {
    reset();
    const r = await webhook(subscriptionEvent('evt_stranger', metadata, false));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(granted(), [], `a test-mode event reached the plan store: ${JSON.stringify(metadata)}`);
  }
});

test('webhook: the admin\'s own livemode:false subscription grants the plan it bought', async () => {
  const metadata = await subscriptionMetadataFromCheckout(ADMIN_JWT);
  reset();
  const r = await webhook(subscriptionEvent('evt_admin', metadata, false));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const replica = doCalls.find((c) => c.path === '/billing-replica');
  assert.ok(replica, 'the admin\'s test purchase must reach the plan store');
  assert.equal(replica.id, ADMIN_ID, 'and it lands on the admin\'s own account');
  assert.equal(replica.body.mutation.plan, 'builder');
});

test('webhook: removing the admin from the allowlist stops their test events granting', async () => {
  const metadata = await subscriptionMetadataFromCheckout(ADMIN_JWT);
  reset();
  const r = await webhook(subscriptionEvent('evt_revoked', metadata, false), { BILLING_TEST_ADMINS: 'someone@else.test' });
  assert.equal(r.status, 200);
  assert.deepEqual(granted(), []);
});

test('CONTROLS: live events in production, and test events outside it, apply as before', async () => {
  reset();
  await webhook(subscriptionEvent('evt_live', { userId: BUYER_ID, plan: 'builder' }, true), { STRIPE_SECRET_KEY: 'sk_live_x' });
  assert.ok(doCalls.some((c) => c.path === '/billing-replica'), 'a live event must still grant');
  reset();
  await webhook(subscriptionEvent('evt_staging', { userId: BUYER_ID, plan: 'builder' }, false), { ENVIRONMENT: 'staging' });
  assert.ok(doCalls.some((c) => c.path === '/billing-replica'), 'outside production test mode is the normal mode');
});
