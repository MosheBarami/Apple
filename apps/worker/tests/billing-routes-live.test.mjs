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

/**
 * The real validator, so the fake DO refuses exactly what the real one refuses.
 *
 * Importing it rather than re-implementing it is the point: a second copy of the rule in this file
 * would drift from the one in the worker, and the route tests would then be asserting against a
 * validator that ships nowhere.
 */
const BILLING_OUT = join(TMP, 'billing.mjs');
execFileSync(ESBUILD, [join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--outfile=${BILLING_OUT}`], { stdio: 'pipe', cwd: WORKER });
const READ_DETAILS = (await import(`file://${BILLING_OUT}`)).readBillingDetails;

/** What the user's QuotaDO answers for /billing. Set per test. */
let doBilling = { plan: 'free', customerId: null, subscription: null, events: [] };
/** The invoice fields this account has stored, as the DO would hold them. Reset per test. */
let doDetails = { email: null, name: null, poNumber: null };
/** Every DO call the routes made, so forwarding can be observed rather than assumed. */
let doCalls = [];
/** Every request that left for Stripe. */
let stripeCalls = [];
/** Every prepared D1 statement, so a notification can be observed rather than assumed. */
let d1Calls = [];
/** Per-test Stripe response, or null to use the default checkout-session reply. */
let stripeReply = null;
/** Set to make Stripe refuse, so a route's behaviour when it cannot see can be asserted. */
let stripeDown = false;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.startsWith('https://api.stripe.com/')) {
    stripeCalls.push({ url, body: String(init?.body ?? ''), auth: init?.headers?.authorization ?? null });
    // Stripe refusing outright is the coarser switch and comes first: a test that says Stripe
    // cannot be seen means every call, including one a per-test reply would otherwise answer.
    if (stripeDown) return json({ error: { message: 'no' } }, 500);
    // A per-test override, so the invoice routes can be given a real Stripe-shaped body — and a
    // 404 or a 502 — without every other test having to know about invoices.
    if (stripeReply) {
      const r = stripeReply(url);
      if (r) return json(r.body, r.status ?? 200);
    }
    // The preview is an INVOICE, not a session with a url. Amounts in minor units, as Stripe sends
    // them: 1234 is twelve dollars thirty-four.
    if (url.includes('/v1/invoices/create_preview')) {
      return json({
        object: 'invoice',
        amount_due: 1234,
        currency: 'usd',
        lines: {
          data: [
            { description: 'Unused time on Builder', amount: -766, proration: true, period: { start: NOW_S } },
            { description: 'Remaining time on Studio', amount: 2000, proration: true, period: { start: NOW_S } },
          ],
        },
      });
    }
    return json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  }
  if (url.includes('/rest/v1/profiles')) return json([{ id: USER_ID, plan: 'free', is_admin: false, display_name: 'buyer' }]);
  return json([]);
};

function quotaNamespace() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    // The id is captured, not discarded: the reconciliation route addresses ANOTHER account's DO —
    // the one named in Stripe's subscription metadata — and "it read the right account" is the
    // property that distinguishes a report from a coincidence.
    get: (id) => ({
      async fetch(url, init) {
        const u = new URL(typeof url === 'string' ? url : url.url);
        let body = null;
        try { body = init?.body ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
        doCalls.push({ path: u.pathname, body, id: id?.toString() ?? null });
        // The real DO carries the invoice fields on this read, so the checkout can use the billing
        // contact without a second round trip. The fake must too, or the join is never exercised.
        if (u.pathname === '/billing') return new Response(JSON.stringify({ ...doBilling, details: doDetails }), { status: 200 });
        if (u.pathname === '/billing-customer') return new Response(JSON.stringify({ customerId: doBilling.customerId }), { status: 200 });
        /*
         * THE INVOICE FIELDS, MODELLED RATHER THAN ANSWERED WITH A CONSTANT.
         *
         * The real DO validates, stores, and returns the record it REPLACED — and the last of those
         * is the whole reason the route can tell "never set a name" from "removed the name". A fake
         * that echoed the request back with `previous: {}` would make the erasure test below pass
         * against a route that never sent a clear at all.
         */
        if (u.pathname === '/billing-details' && (init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify({ details: doDetails }), { status: 200 });
        }
        if (u.pathname === '/billing-details') {
          const v = READ_DETAILS(body?.details ?? {});
          if (!v.ok) return new Response(JSON.stringify({ error: v.error }), { status: v.status });
          const previous = doDetails;
          doDetails = v.details;
          return new Response(JSON.stringify({ ok: true, details: v.details, previous }), { status: 200 });
        }
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
  STRIPE_PORTAL_CONFIGURATION: 'bpc_test_1',
  ADMIN_KEY: 'owner-key-test',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  // Records what was prepared and what was bound to it. A notification is written through D1, and
  // "the route said it would notify" is not the same fact as "a row exists for the person to find".
  CORPUS: {
    exec: async () => ({}),
    prepare: (sql) => ({
      bind: (...args) => {
        d1Calls.push({ sql, args });
        return { all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) };
      },
    }),
    batch: async () => [],
  },
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

const reset = (billing, details) => {
  doBilling = { plan: 'free', customerId: null, subscription: null, events: [], ...billing };
  doDetails = { email: null, name: null, poNumber: null, ...details };
  doCalls = [];
  stripeCalls = [];
  d1Calls = [];
  stripeReply = null;
  stripeDown = false;
};

const sub = (over) => ({
  plan: 'builder', customerId: 'cus_1', subscriptionId: 'sub_1', itemId: 'si_1',
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

// ------------------------------------------------------------------------------- the invoices
//
// The pure tests in billing-invoices.test.mjs prove the mapper drops the customer record and that
// `invoiceBelongsTo` says no. They cannot prove the ROUTE asks either one — and an ownership check
// nothing calls reads exactly like protection in every review it survives.

/** A Stripe invoice belonging to `cus_1`, with the fields that must not leave still on it. */
const stripeInvoice = (over = {}) => ({
  id: 'in_1ABC', object: 'invoice', number: 'AP-0001', created: 1_760_000_000, status: 'paid',
  amount_paid: 2900, amount_due: 2900, currency: 'usd', customer: 'cus_1',
  customer_email: 'buyer@golem.test',
  customer_address: { line1: '1 Somewhere St', country: 'NZ' },
  payment_intent: 'pi_do_not_ship',
  hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/live_abc',
  invoice_pdf: 'https://pay.stripe.com/invoice/acct_1/live_abc/pdf',
  subtotal: 2900, tax: null, total: 2900,
  lines: { object: 'list', data: [{ description: 'Builder — 1 month', quantity: 1, amount: 2900,
    period: { start: 1_760_000_000, end: 1_762_592_000 }, price: { id: 'price_builder_1', unit_amount: 2900 } }] },
  ...over,
});

test('AN ACCOUNT CAN LIST ITS OWN INVOICES, filtered by its own customer id', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = (url) => (url.includes('/v1/invoices?') ? { body: { object: 'list', data: [stripeInvoice()] } } : null);

  const r = await call('/api/billing/invoices');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.invoices.length, 1);
  assert.equal(r.json.invoices[0].number, 'AP-0001');
  assert.equal(r.json.invoices[0].status, 'paid', 'the per-invoice payment status the page shows');
  assert.equal(r.json.invoices[0].pdfUrl, 'https://pay.stripe.com/invoice/acct_1/live_abc/pdf');

  const asked = new URL(stripeCalls[0].url);
  assert.equal(asked.pathname, '/v1/invoices');
  assert.equal(asked.searchParams.get('customer'), 'cus_1',
    'THE QUERY IS SCOPED BY OUR OWN STORED CUSTOMER, never by anything the caller sent');
});

test('THE RAW STRIPE INVOICE DOES NOT REACH THE BROWSER', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = (url) => (url.includes('/v1/invoices?') ? { body: { object: 'list', data: [stripeInvoice()] } } : null);
  const r = await call('/api/billing/invoices');
  for (const leak of ['Somewhere St', 'pi_do_not_ship', 'cus_1', 'buyer@golem.test']) {
    assert.doesNotMatch(r.text, new RegExp(leak), `${leak} must not be in the response body`);
  }
});

test('a user who never bought anything gets an empty list, not an error', async () => {
  reset();
  const r = await call('/api/billing/invoices');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.invoices, []);
  assert.equal(stripeCalls.length, 0, 'and Stripe is not asked about a customer that does not exist');
});

test('the invoice list is unreachable without a token', async () => {
  reset({ customerId: 'cus_1' });
  const anon = await call('/api/billing/invoices', { jwt: null });
  assert.notEqual(anon.status, 200);
});

test('ONE INVOICE COMES BACK WITH ITS LINE ITEMS AND TOTALS', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = (url) => (url.endsWith('/v1/invoices/in_1ABC') ? { body: stripeInvoice() } : null);
  const r = await call('/api/billing/invoices/in_1ABC');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.invoice.lines.length, 1);
  assert.equal(r.json.invoice.lines[0].description, 'Builder — 1 month');
  assert.equal(r.json.invoice.total, 2900);
  assert.doesNotMatch(r.text, /price_builder_1|pi_do_not_ship/, 'the price id and payment intent stay ours');
});

test('SOMEBODY ELSE’S INVOICE IS REFUSED EVEN THOUGH STRIPE RETURNED IT', async () => {
  // The route asked Stripe with OUR secret key, so Stripe answered. The id in the path is not the
  // authorisation; without the ownership check this is a way to read every invoice in the account.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = (url) => (url.includes('/v1/invoices/') ? { body: stripeInvoice({ customer: 'cus_someone_else' }) } : null);
  const r = await call('/api/billing/invoices/in_1ABC');
  assert.equal(r.status, 404, '404 — that it exists but is not yours is itself an answer about another account');
  assert.doesNotMatch(r.text, /cus_someone_else|Somewhere St/, 'and nothing about it comes back');
});

test('A PATH THAT IS NOT AN INVOICE ID NEVER REACHES api.stripe.com', async () => {
  // `../charges/ch_1` interpolated into the Stripe URL addresses a different endpoint with our
  // secret key attached. The shape check runs before the fetch, so nothing leaves at all.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  for (const bad of ['ch_1', 'in_1%20x', 'IN_1']) {
    stripeCalls = [];
    const r = await call(`/api/billing/invoices/${bad}`);
    assert.equal(r.status, 400, `${bad} must be refused: ${r.text}`);
    assert.equal(stripeCalls.length, 0, `${bad} must not reach Stripe`);
  }
});

// ------------------------------------------------------------- the webhook carries what it read

async function signedWebhook(event) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_x'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // A real ExecutionContext, and the background work is AWAITED before the assertions run. Anything
  // the route hands to waitUntil — the notification about a payment problem, for one — outlives the
  // response, and a test that returns at the response observes a product that has not finished
  // doing the thing under test.
  const waited = [];
  const ctx = { waitUntil: (p) => waited.push(Promise.resolve(p)), passThroughOnException: () => {} };
  const res = await APP.fetch(new Request('https://golem.test/api/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${ts},v1=${hex}`, 'content-type': 'application/json' },
    body,
  }), env(), ctx);
  const out = { status: res.status, json: await res.json() };
  await Promise.allSettled(waited);
  return out;
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

test('A PORTAL UPGRADE GRANTS THE TIER IT CHARGES FOR, over the real webhook route', async () => {
  // THE DEFECT, END TO END. metadata.plan is written once, at checkout. A tier change made in the
  // Billing Portal swaps items[].price and leaves metadata alone, so this event — a genuine Studio
  // upgrade for a customer who first bought Builder — was applied as Builder. The customer paid
  // Studio and was served Builder, and nothing in the product said a word.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await signedWebhook({
    id: 'evt_portal_upgrade',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: LATER,
                      cancel_at_period_end: false,
                      items: { data: [{ id: 'si_1', price: { id: 'price_studio_1' } }] },
                      metadata: { userId: USER_ID, plan: 'builder' } } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const setPlan = doCalls.find((c) => c.path === '/set-plan');
  assert.ok(setPlan, 'the plan must still be applied');
  assert.equal(setPlan.body.plan, 'studio', 'the ENFORCED tier is the one Stripe is billing');
  assert.equal(setPlan.body.subscription.plan, 'studio', 'and the stored record agrees with it');
});

test('a webhook with no price item still grants what the metadata says', async () => {
  // The control. If reading the price had become the ONLY way to a tier, every first checkout — and
  // every event Stripe sends without expanding the item — would demote the customer to free.
  reset();
  await signedWebhook({
    id: 'evt_no_items',
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_2', customer: 'cus_1', status: 'active', current_period_end: LATER,
                      cancel_at_period_end: false, metadata: { userId: USER_ID, plan: 'studio' } } },
  });
  assert.equal(doCalls.find((c) => c.path === '/set-plan').body.plan, 'studio');
});

// ------------------------------------------------------- the checkout nobody came back from

/**
 * A SESSION THE USER ABANDONED PRODUCED NO STATE, NO NOTICE AND NO RECORD.
 *
 * `?checkout=done` and `?checkout=cancelled` both require coming back through the redirect. Someone
 * who opens Stripe's page, is interrupted, and closes the tab hits neither — the session lapses and
 * `checkout.session.expired` arrived into an interpreter whose default branch dropped it. Nothing
 * was charged, and nothing said so.
 */
test('AN EXPIRED CHECKOUT TELLS THE PERSON AND TOUCHES NOTHING THEY OWN', async () => {
  reset();
  const r = await signedWebhook({
    id: 'evt_expired_1',
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_test_9', currency: 'usd', metadata: { userId: USER_ID } } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.dunning, 'checkout_expired', 'the route must recognise it as something to say');

  // Entitlement is the half that must NOT move: an expiry means nothing happened.
  assert.equal(doCalls.find((c) => c.path === '/set-plan'), undefined, 'no plan may be applied');
  assert.equal(doCalls.find((c) => c.path === '/grant-credits'), undefined, 'and no credits');

  // And the half that must: a row the person can actually find.
  const insert = d1Calls.find((c) => /insert into notifications/i.test(c.sql));
  assert.ok(insert, 'a notification row must actually be written, not merely intended');
  assert.ok(insert.args.includes(USER_ID), 'addressed to the account whose checkout it was');
  assert.match(JSON.stringify(insert.args), /nothing was charged/i,
    'and it must say the thing that stops this reading as a failed payment');
});

test('an expired checkout for a session with no user is ignored, and says so', async () => {
  reset();
  const r = await signedWebhook({
    id: 'evt_expired_2',
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_test_10' } },
  });
  assert.equal(r.status, 200, 'the event is valid; Stripe must not retry it forever');
  assert.equal(d1Calls.find((c) => /insert into notifications/i.test(c.sql)), undefined,
    'a notification attached to a guessed account is worse than none');
});

test('CONTROL: an ordinary subscription event raises no billing alarm', async () => {
  // Without this, the assertion above could pass because every webhook notifies.
  reset();
  const r = await signedWebhook({
    id: 'evt_plain_1',
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_9', customer: 'cus_1', status: 'active', current_period_end: LATER,
                      cancel_at_period_end: false, metadata: { userId: USER_ID, plan: 'builder' } } },
  });
  assert.equal(r.json.dunning, null, 'a successful subscription is not a payment problem');
  assert.equal(d1Calls.find((c) => /insert into notifications/i.test(c.sql)), undefined);
});

// ----------------------------------------------- what the page is told before it offers to sell

test('THE CONFIG ROUTE NAMES THE CURRENCY, so the ladder is not guessing', async () => {
  // The page falls back to the declared code when the field is missing, which is a plausible-looking
  // answer arrived at from no information — and that was the state of the deployed worker, which
  // returned {checkout, purchasable} and no currency at all while the page already read one.
  reset();
  const r = await call('/api/billing/config');
  assert.equal(r.status, 200, r.text);
  assert.match(String(r.json.currency), /^[A-Z]{3}$/, `an ISO 4217 code, saw ${r.json.currency}`);
  assert.equal(r.json.checkout, true, 'and it still says whether anything can be bought');
  assert.deepEqual(r.json.purchasable, ['builder', 'studio'], 'and which tiers');
});

test('THE PORTAL ROUTE SENDS THE PINNED CONFIGURATION, not the dashboard default', async () => {
  // The pure test proves the builder sets it. This proves the ROUTE hands the env to the builder — a
  // configuration nothing passes through is the same as no configuration at all.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await call('/api/billing/portal', { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  const p = new URLSearchParams(stripeCalls[0].body);
  assert.equal(p.get('configuration'), 'bpc_test_1');
  assert.equal(p.get('customer'), 'cus_1', "and the caller's own customer, which is not a parameter");
});

test('THE PORTAL SENDS THE USER BACK TO A PAGE THAT KNOWS THEY WERE THERE', async () => {
  // The cancellation happens on Stripe's page. With a bare return_url the product had no moment at
  // which to say anything about it: the page rendered exactly as it had before the visit, and the
  // only return flag it read was the checkout one, which is a different round trip.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await call('/api/billing/portal', { method: 'POST' });
  assert.equal(r.status, 200, r.text);
  const p = new URLSearchParams(stripeCalls[0].body);
  const back = new URL(p.get('return_url'));
  assert.equal(back.pathname, '/app/usage', 'still our own page, never a caller-supplied one');
  assert.equal(back.searchParams.get('billing'), 'returned',
    'and it must carry the flag the page reads to report what changed');
});

// ------------------------------------------------ what a change costs, asked before it is made

test('A PAYING CUSTOMER CAN BE TOLD WHAT A TIER CHANGE COSTS BEFORE LEAVING THE PRODUCT', async () => {
  // The ladder priced every tier per month and then handed a paying user to Stripe's portal, so the
  // amount for THIS change — prorated, net of the credit for time already paid for — was first seen
  // on a page outside the product, after the user had committed to going there.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await call('/api/billing/preview?plan=studio');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.amountDue, 12.34, 'minor units read as money');
  assert.equal(r.json.currency, 'USD');
  assert.equal(r.json.lines.length, 2, 'the credit and the charge are both shown, not only the net');
  assert.equal(r.json.prorationDate, NOW_S);

  assert.equal(stripeCalls.length, 1);
  assert.match(stripeCalls[0].url, /\/v1\/invoices\/create_preview$/);
  const sent = new URLSearchParams(stripeCalls[0].body);
  assert.equal(sent.get('subscription'), 'sub_1');
  // Without the item id Stripe prices BOTH tiers together and quotes their sum.
  assert.equal(sent.get('subscription_details[items][0][id]'), 'si_1');
  assert.equal(sent.get('subscription_details[items][0][price]'), 'price_studio_1');
});

test('the preview changes nothing — it never asks the DO to set a plan', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  await call('/api/billing/preview?plan=studio');
  assert.deepEqual(doCalls.filter((c) => c.path === '/set-plan'), [], 'a quote is not a purchase');
});

test('A USER WITH NOTHING RUNNING IS REFUSED RATHER THAN QUOTED ZERO', async () => {
  // Nothing to prorate against. Returning an amount of 0 here would print "this costs nothing
  // today" over a change that charges the full price.
  reset();
  const r = await call('/api/billing/preview?plan=studio');
  assert.equal(r.status, 400, r.text);
  assert.equal(stripeCalls.length, 0, 'and Stripe is not asked a question with no subject');
});

test('a subscription stored before the item id was kept is refused, not priced wrongly', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub({ itemId: null }) });
  const r = await call('/api/billing/preview?plan=studio');
  assert.equal(r.status, 400, r.text);
  assert.equal(stripeCalls.length, 0);
});

test('an unknown plan is refused before Stripe is troubled', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const r = await call('/api/billing/preview?plan=platinum');
  assert.equal(r.status, 400, r.text);
  assert.equal(stripeCalls.length, 0);
});

test('WHEN STRIPE CANNOT ANSWER, THE ROUTE SAYS SO — it does not invent a figure', async () => {
  // A failure to observe must not render as an observation. The page says "we could not get the
  // amount" off the back of this, which is true; a 200 with a zero would be a sentence about money.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeDown = true;
  const r = await call('/api/billing/preview?plan=studio');
  assert.equal(r.status, 502, r.text);
  assert.equal(r.json.amountDue, undefined, 'no amount may leave this route when none was read');
});

test('the preview is scoped to the caller, with no id to point elsewhere', async () => {
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  const anon = await call('/api/billing/preview?plan=studio', { jwt: null });
  assert.notEqual(anon.status, 200, "an unauthenticated caller must not price someone else's change");
});

// ------------------------------------------------------------ the fields printed on the invoice

/** Every Stripe customer update this test made, parsed. */
const customerCalls = () =>
  stripeCalls.filter((c) => /\/v1\/customers\//.test(c.url)).map((c) => ({ url: c.url, p: new URLSearchParams(c.body) }));

test('CONTROL: an account nobody has configured reads back three absences, not an error', async () => {
  // Without this, every assertion below could pass because the route is simply broken.
  reset();
  const r = await call('/api/billing/details');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.details, { email: null, name: null, poNumber: null });
});

test('the fields are stored, and an account with no Stripe customer is told so rather than lied to', async () => {
  // `synced: null` is not `synced: false`. There is nothing to write to yet — the customer does not
  // exist until the first purchase — and reporting that as a failed sync would send somebody
  // hunting a fault that is not there.
  reset();
  const r = await call('/api/billing/details', {
    method: 'PUT',
    body: { details: { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' } },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.synced, null);
  assert.deepEqual(r.json.details, { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' });
  assert.equal(customerCalls().length, 0, 'and Stripe was not called with no customer to call it about');
  assert.equal((await call('/api/billing/details')).json.details.poNumber, 'PO-4417', 'it survived the write');
});

test('WITH A CUSTOMER, THE FIELDS REACH THE DOCUMENT — under the parameters Stripe prints from', async () => {
  reset({ customerId: 'cus_1' });
  const r = await call('/api/billing/details', {
    method: 'PUT',
    body: { details: { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' } },
  });
  assert.equal(r.json.synced, true, r.text);
  const [one, ...rest] = customerCalls();
  assert.equal(rest.length, 0, 'exactly one customer update, not one per field');
  assert.equal(one.url, 'https://api.stripe.com/v1/customers/cus_1');
  assert.equal(one.p.get('email'), 'finance@acme.test');
  assert.equal(one.p.get('name'), 'Acme Ltd');
  assert.equal(one.p.get('invoice_settings[custom_fields][0][value]'), 'PO-4417');
});

test('A BLANK IN THIS FORM DOES NOT ERASE THE NAME CHECKOUT COLLECTED', async () => {
  // The defect: Checkout collects a billing name at the first purchase, this form opens empty, and
  // a save of the email alone sends `name=` and wipes it off every future invoice. Invisible from
  // here — it shows up on a document, monthly, after the fact.
  reset({ customerId: 'cus_1' });
  const r = await call('/api/billing/details', { method: 'PUT', body: { details: { email: 'finance@acme.test' } } });
  assert.equal(r.json.synced, true, r.text);
  const [one] = customerCalls();
  assert.equal(one.p.has('name'), false, 'a field nobody touched must not appear in the request at all');
  assert.equal(one.p.has('invoice_settings[custom_fields]'), false);
});

test('but a value this product set and the person removed IS cleared on Stripe', async () => {
  // The mirror of the test above. A PO that keeps printing after the buyer deleted it is a false
  // statement on an invoice, reissued every month.
  reset({ customerId: 'cus_1' }, { email: 'old@acme.test', name: 'Old Ltd', poNumber: 'PO-1' });
  const r = await call('/api/billing/details', { method: 'PUT', body: { details: {} } });
  assert.equal(r.json.synced, true, r.text);
  const [one] = customerCalls();
  assert.equal(one.p.get('name'), '', 'an empty value is how Stripe is told to unset a field');
  assert.equal(one.p.get('email'), '');
  assert.equal(one.p.get('invoice_settings[custom_fields]'), '', 'the list goes, not one row emptied');
});

test('an address that is not an address is refused, and Stripe is never troubled', async () => {
  reset({ customerId: 'cus_1' });
  const r = await call('/api/billing/details', { method: 'PUT', body: { details: { email: 'acme.test' } } });
  assert.equal(r.status, 400, r.text);
  assert.match(r.json.error, /email/i);
  assert.equal(customerCalls().length, 0);
  assert.equal((await call('/api/billing/details')).json.details.email, null, 'and nothing was stored');
});

test('WHEN STRIPE REFUSES, THE ROUTE SAYS SO — it does not report a save it could not make', async () => {
  // A failure to observe must not render as an observation. The values are kept here, because the
  // next save re-sends them; what is NOT claimed is that the invoice now carries them.
  reset({ customerId: 'cus_1' });
  stripeDown = true;
  const r = await call('/api/billing/details', { method: 'PUT', body: { details: { name: 'Acme Ltd' } } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.synced, false, 'false, not true and not absent');
  assert.equal(r.json.details.name, 'Acme Ltd', 'and the record is kept, so the next save repairs it');
});

test('editing nothing is not a failed save', async () => {
  reset({ customerId: 'cus_1' });
  const r = await call('/api/billing/details', { method: 'PUT', body: { details: {} } });
  assert.equal(r.json.synced, true, r.text);
  assert.equal(customerCalls().length, 0, 'an empty request to Stripe could still fail, for no gain');
});

test('there is no customer parameter here, so a caller cannot address another account', async () => {
  // The id written to is the one in the caller's own DO, addressed from the verified JWT subject.
  reset({ customerId: 'cus_1' });
  await call('/api/billing/details', {
    method: 'PUT',
    body: { customerId: 'cus_victim', customer: 'cus_victim', details: { name: 'Acme Ltd' } },
  });
  assert.equal(customerCalls()[0].url, 'https://api.stripe.com/v1/customers/cus_1');
  const anon = await call('/api/billing/details', { jwt: null });
  assert.notEqual(anon.status, 200, "an unauthenticated caller must not read somebody's billing contact");
});

test('THE BILLING CONTACT APPLIES TO THE FIRST INVOICE, not from the second one on', async () => {
  // A setting that only takes effect after the purchase is a setting that does not work on the one
  // occasion it is first needed.
  reset({}, { email: 'finance@acme.test' });
  const r = await call('/api/billing/checkout', { method: 'POST', body: { plan: 'builder' } });
  assert.equal(r.status, 200, r.text);
  const session = stripeCalls.find((c) => c.url.includes('/v1/checkout/sessions'));
  assert.equal(new URLSearchParams(session.body).get('customer_email'), 'finance@acme.test');
});

test('and with no billing contact the checkout still names the account address', async () => {
  reset();
  await call('/api/billing/checkout', { method: 'POST', body: { plan: 'builder' } });
  const session = stripeCalls.find((c) => c.url.includes('/v1/checkout/sessions'));
  assert.equal(new URLSearchParams(session.body).get('customer_email'), 'buyer@golem.test');
});

// -------------------------------------------------- does Stripe still think what we think?

const OWNER = { 'X-Admin-Key': 'owner-key-test' };
/** Stripe's subscription list, as the reconciliation route pages it. */
const stripeList = (data, has_more = false) => (url) =>
  url.includes('/v1/subscriptions') ? { body: { object: 'list', data, has_more } } : null;
const liveSub = (over = {}) => ({
  id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'active',
  current_period_end: LATER, cancel_at_period_end: false,
  metadata: { userId: USER_ID }, items: { data: [{ id: 'si_1', price: { id: 'price_builder_1' } }] },
  ...over,
});

test('the reconciliation is owner-gated, and a caller without the key never reaches Stripe', async () => {
  reset();
  stripeReply = stripeList([liveSub()]);
  const r = await call('/api/admin/billing-reconcile');
  assert.equal(r.status, 403, r.text);
  assert.equal(stripeCalls.length, 0, 'a refused admin call must not cost a Stripe request either');
});

test('CONTROL: two records that agree produce no findings AND a denominator', async () => {
  // "No disagreements" over zero subscriptions is a broken query wearing the words of a clean
  // account. The count is what tells them apart, so it is asserted beside the empty list.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = stripeList([liveSub()]);
  const r = await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.checked, 1, 'a report with no denominator is not a report');
  assert.equal(r.json.agreed, 1);
  assert.deepEqual(r.json.findings, []);
});

test('A MISSED WEBHOOK IS VISIBLE — the customer paying for a tier we never applied', async () => {
  // The whole reason this route exists. Nothing in this product read Stripe's subscription list
  // before it, so a delivery Stripe gave up on was silent on both sides until somebody complained.
  reset({ plan: 'free', customerId: null, subscription: null });
  stripeReply = stripeList([liveSub()]);
  const r = await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.checked, 1);
  assert.equal(r.json.findings.length, 1);
  assert.equal(r.json.findings[0].verdict, 'missing_here');
  assert.equal(r.json.findings[0].userId, USER_ID);
});

test('it reads the account Stripe names, not the caller', async () => {
  // An owner report that compared every Stripe subscription against the OWNER's own DO would agree
  // or disagree by coincidence. The DO addressed has to be the one in the subscription metadata.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = stripeList([liveSub({ metadata: { userId: 'u_someone_else' } })]);
  await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.ok(doCalls.some((d) => d.id === 'u_someone_else'), `the route must address u_someone_else, saw ${JSON.stringify(doCalls.map((d) => d.id))}`);
});

test('a subscription nobody can be attributed is reported without a DO lookup to invent one', async () => {
  reset();
  stripeReply = stripeList([liveSub({ metadata: {} })]);
  const r = await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.equal(r.json.findings[0].verdict, 'unattributed');
  assert.equal(r.json.findings[0].userId, null);
  assert.equal(doCalls.filter((d) => d.path === '/billing').length, 0, 'there is no account to look up');
});

test('a complete walk says it was complete', async () => {
  // The other half of the test below. `truncated` has to be false on a normal walk, or the flag is
  // just a constant and the report can never say the one thing it exists to be able to say.
  reset({ plan: 'builder', customerId: 'cus_1', subscription: sub() });
  stripeReply = stripeList([liveSub()]);
  const r = await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.equal(r.json.truncated, false);
});

test('A WALK THAT STOPPED SHORT SAYS SO, rather than reporting its prefix as the whole', async () => {
  // An upstream that always answers `has_more` would otherwise spin this route until the worker is
  // killed; the cap is what stops that, and the flag is what stops the capped result being read as
  // a complete one. Set from the branch that decided to stop, not inferred from the row count.
  reset();
  stripeReply = stripeList([liveSub()], true);
  const r = await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.truncated, true);
  assert.ok(r.json.checked >= 1, 'and what it did examine is still counted');
});

test('WHEN STRIPE CANNOT BE PAGED, THE ROUTE SAYS SO — it does not report a clean account', async () => {
  // A failure to observe must never render as an observation, and "0 findings" off a failed fetch
  // is the most expensive form of that: it is an all-clear on the thing that checks for silence.
  reset();
  stripeDown = true;
  const r = await call('/api/admin/billing-reconcile', { headers: OWNER });
  assert.equal(r.status, 502, r.text);
  assert.equal(r.json.checked, undefined, 'no count may leave this route when nothing was counted');
  assert.equal(r.json.findings, undefined);
});
