/**
 * THE BILLING ROUTES, ASKED OVER HTTP.
 *
 * The pure tests prove `checkoutGuard` says no and `subscriptionView` says what. They cannot prove
 * that a ROUTE asks either one, and a refusal nothing consults is the most expensive kind of dead
 * code — it reads like protection in every review it survives. That was literally the state of this
 * file's subject: the comment above `allow_promotion_codes` in billing.ts claimed "one subscription
 * per account", the page enforced it in the browser, and `POST /api/billing/checkout` never looked
 * at the caller's current plan at all. A direct call minted a second subscription.
 *
 * So this bundles the real `index.ts`, stands a fake edge behind it, and sends real requests signed
 * with real ES256 tokens.
 *
 * Run with:  node --test tests/billing-routes-live.test.mjs      (from apps/worker)
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

const TMP = mkdtempSync(join(tmpdir(), 'golem-billing-routes-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(ESBUILD, [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`], { stdio: 'pipe', cwd: WORKER });
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.billing.test';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'billing-test', alg: 'ES256', use: 'sig' };
const JWT = await new jose.SignJWT({ email: 'buyer@golem.test', role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'billing-test' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(USER_ID)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

const NOW_S = Math.floor(Date.now() / 1000);
const LATER = NOW_S + 10 * 86_400;

/** What the user's QuotaDO answers for /billing. Set per test. */
let doBilling = { plan: 'free', customerId: null, subscription: null, events: [] };
/** Every DO call the routes made, so forwarding can be observed rather than assumed. */
let doCalls = [];
/** Every request that left for Stripe. */
let stripeCalls = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.startsWith('https://api.stripe.com/')) {
    stripeCalls.push({ url, body: String(init?.body ?? '') });
    return json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  }
  if (url.includes('/rest/v1/profiles')) return json([{ id: USER_ID, plan: 'free', is_admin: false, display_name: 'buyer' }]);
  return json([]);
};

function quotaNamespace() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    get: () => ({
      async fetch(url, init) {
        const u = new URL(typeof url === 'string' ? url : url.url);
        let body = null;
        try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
        doCalls.push({ path: u.pathname, body });
        if (u.pathname === '/billing') return new Response(JSON.stringify(doBilling), { status: 200 });
        if (u.pathname === '/billing-customer') return new Response(JSON.stringify({ customerId: doBilling.customerId }), { status: 200 });
        if (u.pathname === '/state') {
          return new Response(JSON.stringify({
            creditsRemaining: 100, creditsDaily: 231, creditsMonthly: 2310, creditsUsedToday: 0,
            creditsUsedThisMonth: 0, resetsAtIso: new Date().toISOString(), plan: doBilling.plan,
            allowanceRemaining: 100, credits: 0,
          }), { status: 200 });
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
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_PRICE_BUILDER: 'price_builder_1',
  STRIPE_PRICE_STUDIO: 'price_studio_1',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  CORPUS: { exec: async () => ({}), prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }), batch: async () => [] },
  VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
  SESSION_DO: quotaNamespace(),
  QUOTA_DO: quotaNamespace(),
  PAIRING_DO: quotaNamespace(),
  ADMIN_DO: quotaNamespace(),
  BUDGET_DO: quotaNamespace(),
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

const reset = (billing) => {
  doBilling = { plan: 'free', customerId: null, subscription: null, events: [], ...billing };
  doCalls = [];
  stripeCalls = [];
};

const sub = (over) => ({
  plan: 'builder', customerId: 'cus_1', subscriptionId: 'sub_1',
  status: 'active', currentPeriodEnd: LATER, cancelAtPeriodEnd: false, ...over,
});

// ------------------------------------------------------ one subscription per account, enforced

test('CONTROL: a free user can still start a checkout', async () => {
  // Without this every refusal below could pass because checkout is simply broken.
  reset();
  const r = await call('/api/billing/checkout', { method: 'POST', body: { plan: 'builder' } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(stripeCalls.length, 1, 'and Stripe was actually asked');
});

test('A SECOND CHECKOUT IS REFUSED BY THE SERVER, not only by the page', async () => {
  // Stripe Checkout ADDS a subscription. The browser routed paid users to the portal; a direct POST
  // did not, and the customer was charged twice.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await call('/api/billing/checkout', { method: 'POST', body: { plan: 'studio' } });
  assert.equal(r.status, 409, 'an existing subscription is a conflict, not a bad request');
  assert.match(r.json.error, /portal/i);
  assert.equal(stripeCalls.length, 0, 'AND NOTHING WAS ASKED OF STRIPE — the refusal is before the call');
});

test('a lapsed customer may buy again — refusing reactivation would be the opposite bug', async () => {
  reset({ plan: 'free', customerId: 'cus_1', subscription: sub({ status: 'canceled' }) });
  const r = await call('/api/billing/checkout', { method: 'POST', body: { plan: 'builder' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(stripeCalls.length, 1);
});

test('the checkout Stripe is asked for names the plan, so the webhook can grant it', async () => {
  // End to end, over HTTP: the field whose absence made every paid subscription read as free.
  reset();
  await call('/api/billing/checkout', { method: 'POST', body: { plan: 'studio' } });
  const p = new URLSearchParams(stripeCalls[0].body);
  assert.equal(p.get('subscription_data[metadata][plan]'), 'studio');
  assert.equal(p.get('subscription_data[metadata][userId]'), USER_ID);
});

// --------------------------------------------------------------- what /api/me can now report

test('/api/me REPORTS THE SUBSCRIPTION, not just the tier', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await call('/api/me');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.billing.state, 'active');
  assert.equal(r.json.billing.renewsAt, LATER, 'the renewal date reaches the client');
  assert.equal(r.json.billing.hasBillingAccount, true);
});

test('/api/me distinguishes a cancelling subscription from a renewing one', async () => {
  reset({ plan: 'studio', customerId: 'cus_1', subscription: sub({ plan: 'studio', cancelAtPeriodEnd: true }) });
  const r = await call('/api/me');
  assert.equal(r.json.billing.state, 'cancelling');
  assert.equal(r.json.billing.endsAt, LATER);
  assert.equal(r.json.billing.renewsAt, null);
});

test('A LAPSED CUSTOMER STILL HAS A BILLING ACCOUNT TO RETURN THROUGH', async () => {
  // The reactivation gap: the portal button was rendered only for a paid plan, so a cancelled
  // customer now on free could not reach their own invoices or card at all.
  reset({ plan: 'free', customerId: 'cus_1', subscription: sub({ status: 'canceled' }) });
  const r = await call('/api/me');
  assert.equal(r.json.billing.state, 'lapsed');
  assert.equal(r.json.billing.hasBillingAccount, true);
});

test('a user who never bought anything reports no billing account and no state', async () => {
  reset();
  const r = await call('/api/me');
  assert.equal(r.json.billing.state, 'none');
  assert.equal(r.json.billing.hasBillingAccount, false);
  assert.equal(r.json.billing.needsAttention, false);
});

// ------------------------------------------------------------------------- the history is readable

test('AN ACCOUNT CAN READ ITS OWN BILLING HISTORY', () => {
  // `plan` was overwritten in place, so "when did this go from Studio to Free" had no answer on our
  // side — not for the user, and not for whoever had to answer their email about it.
  reset({
    plan: 'builder',
    customerId: 'cus_1',
    subscription: sub(),
    events: [
      { at: 1_700_000_000_000, kind: 'plan', fromPlan: 'free', toPlan: 'builder', status: 'active', eventId: 'evt_1' },
    ],
  });
  return call('/api/billing/history').then((r) => {
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.events.length, 1);
    assert.equal(r.json.events[0].fromPlan, 'free');
    assert.equal(r.json.events[0].toPlan, 'builder');
  });
});

test('the history route is scoped to the caller, with no id to point elsewhere', async () => {
  // The DO is addressed from the verified JWT subject, so there is no parameter that could name
  // another account. Asserted by asking: an unauthenticated call must not reach a record at all.
  reset({ events: [{ at: 1, kind: 'plan', fromPlan: 'free', toPlan: 'studio', status: 'active', eventId: 'e' }] });
  const anon = await call('/api/billing/history', { jwt: null });
  assert.notEqual(anon.status, 200, 'an unauthenticated caller must not read a billing history');
});

// ------------------------------------------------------------- the webhook carries what it read

async function signedWebhook(event) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_x'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const res = await APP.fetch(new Request('https://golem.test/api/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${ts},v1=${hex}`, 'content-type': 'application/json' },
    body,
  }), env());
  return { status: res.status, json: await res.json() };
}

test('THE WEBHOOK FORWARDS THE EVENT ID AND THE WHOLE SUBSCRIPTION', async () => {
  // Both are what the DO needs to deduplicate a redelivery and to remember a renewal date. Either
  // one dropped here and the fix in the store is unreachable.
  reset();
  const r = await signedWebhook({
    id: 'evt_route_1',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: LATER,
                      cancel_at_period_end: true, metadata: { userId: USER_ID, plan: 'builder' } } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const setPlan = doCalls.find((c) => c.path === '/set-plan');
  assert.ok(setPlan, 'the plan must still be applied');
  assert.equal(setPlan.body.eventId, 'evt_route_1');
  assert.equal(setPlan.body.plan, 'builder', 'entitlement is still recomputed, and now it is the tier bought');
  assert.equal(setPlan.body.subscription.cancelAtPeriodEnd, true, 'the cancellation reaches the store');
  assert.equal(setPlan.body.subscription.currentPeriodEnd, LATER);
});

test('the credits webhook forwards its event id too', async () => {
  reset();
  await signedWebhook({
    id: 'evt_route_2',
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: { userId: USER_ID, credits: '500' } } },
  });
  const grant = doCalls.find((c) => c.path === '/grant-credits');
  assert.ok(grant, 'credits must still be granted');
  assert.equal(grant.body.credits, 500);
  assert.equal(grant.body.eventId, 'evt_route_2', 'without this a redelivery credits the account twice');
});
