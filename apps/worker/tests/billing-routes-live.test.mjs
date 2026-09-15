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
/** Every prepared D1 statement, so a notification can be observed rather than assumed. */
let d1Calls = [];
/** Set to make Stripe refuse, so a route's behaviour when it cannot see can be asserted. */
let stripeDown = false;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.startsWith('https://api.stripe.com/')) {
    stripeCalls.push({ url, body: String(init?.body ?? '') });
    if (stripeDown) return json({ error: { message: 'no' } }, 500);
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
  STRIPE_PORTAL_CONFIGURATION: 'bpc_test_1',
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

const reset = (billing) => {
  doBilling = { plan: 'free', customerId: null, subscription: null, events: [], ...billing };
  doCalls = [];
  stripeCalls = [];
  d1Calls = [];
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
