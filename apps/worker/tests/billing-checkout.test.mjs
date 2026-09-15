/**
 * w14 — THE UPGRADE AND DOWNGRADE PATH, and the line it must not cross.
 *
 * Nothing in the checkout path grants a plan. It asks Stripe for a hosted page and hands back the
 * URL; the user confirms on Stripe's own page; the subscription events that follow are what move
 * anybody between tiers, through interpretStripeEvent and entitlementFor exactly as before. The
 * success URL is somewhere to come back to, not a claim about what happened — so a user who edits
 * it, or who never completes the payment, gets nothing.
 *
 * The property these tests exist for is the JOIN between the two halves: the checkout session sets
 * a metadata field, and the webhook reads a metadata field, and if those are not the same field the
 * upgrade silently does not apply. That is asserted here by running one through the other rather
 * than by comparing two string literals.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-checkout-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
rmSync(out, { force: true });

const LIVE = {
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_PRICE_BUILDER: 'price_builder_1',
  STRIPE_PRICE_STUDIO: 'price_studio_1',
};
const RETURN_TO = 'https://golem.example/app/usage';
const build = (env, over = {}) =>
  B.buildCheckoutRequest(env, { userId: 'u_1', email: 'a@b.c', plan: 'builder', returnTo: RETURN_TO, ...over });
const params = (r) => new URLSearchParams(r.body);

// --- what it refuses -----------------------------------------------------------------------

test('an unconfigured deployment refuses rather than half-working', () => {
  assert.equal(B.checkoutConfigured({}), false);
  assert.equal(B.checkoutConfigured({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }), false,
    'a webhook secret alone cannot open a checkout');
  assert.equal(B.checkoutConfigured({ STRIPE_SECRET_KEY: 'sk_x' }), false,
    'and an API key with no webhook would take money with nothing to apply it');
  assert.equal(B.checkoutConfigured(LIVE), true);

  const r = build({});
  assert.equal(r.ok, false);
  assert.equal(r.status, 503, 'unconfigured is a service state, not a bad request');
});

test('FREE IS NOT A CHECKOUT — moving down is a cancellation', () => {
  // A zero-price subscription checkout would create a SECOND subscription beside the paid one that
  // is still running, so the user keeps being charged for the tier they just left.
  const r = build(LIVE, { plan: 'free' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /portal/i, 'and it must say where downgrading actually happens');
});

test('enterprise cannot be bought, by design rather than by omission', () => {
  const r = build(LIVE, { plan: 'enterprise' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(B.priceIdFor(LIVE, 'enterprise'), null);
  assert.equal(B.priceIdFor(LIVE, 'free'), null);
});

test('a tier whose price is not configured is refused, not sent with an empty price', () => {
  const partial = { ...LIVE, STRIPE_PRICE_STUDIO: '   ' };
  assert.equal(B.priceIdFor(partial, 'studio'), null, 'whitespace is not a price id');
  const r = B.buildCheckoutRequest(partial, { userId: 'u_1', plan: 'studio', returnTo: RETURN_TO });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('a session with no user is refused', () => {
  const r = build(LIVE, { userId: '' });
  assert.equal(r.ok, false);
});

// --- what it builds ------------------------------------------------------------------------

test('the request names the configured price for the plan asked for', () => {
  const pro = params(build(LIVE));
  assert.equal(pro.get('line_items[0][price]'), 'price_builder_1');
  assert.equal(pro.get('mode'), 'subscription');
  assert.equal(pro.get('line_items[0][quantity]'), '1');

  const studio = params(build(LIVE, { plan: 'studio' }));
  assert.equal(studio.get('line_items[0][price]'), 'price_studio_1', 'each tier gets its own price');
});

test('THE RETURN URLS ARE OURS, and say which outcome they represent', () => {
  const p = params(build(LIVE));
  assert.equal(p.get('success_url'), `${RETURN_TO}?checkout=done`);
  assert.equal(p.get('cancel_url'), `${RETURN_TO}?checkout=cancelled`);
  // Neither may be mistaken for an entitlement: they are places, and the flag is only a hint to
  // the page that it should refetch.
  assert.doesNotMatch(p.get('success_url') ?? '', /plan=|grant|upgrade/i);
});

test('THE METADATA THE WEBHOOK READS IS THE METADATA THE CHECKOUT SETS', () => {
  // The join between the two halves. If these drift, a user pays and nothing changes — the webhook
  // ignores a subscription it cannot attribute, which is the correct behaviour and a silent
  // failure. So the field is not compared against a literal; it is fed through the real reader.
  const p = params(build(LIVE, { userId: 'u_abc' }));
  assert.equal(p.get('subscription_data[metadata][userId]'), 'u_abc',
    'the SUBSCRIPTION carries it — session metadata does not reach subscription events');

  const event = {
    type: 'customer.subscription.created',
    data: { object: {
      metadata: { userId: p.get('subscription_data[metadata][userId]') },
      customer: 'cus_1',
      id: 'sub_1',
      status: 'active',
      current_period_end: 4102444800,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_builder_1' } }] },
    } },
  };
  const outcome = B.interpretStripeEvent(event);
  assert.equal(outcome.userId, 'u_abc', 'the webhook must attribute it to the same user');
  assert.ok(outcome.subscription, 'and read a subscription from it');
  assert.equal(outcome.subscription.customerId, 'cus_1', 'including the customer the portal needs');
});

test('THE CHECKOUT COLLECTS A BILLING ADDRESS, because an invoice without one is not a document', () => {
  // Stripe's default collects only what the payment method itself demands, which for a card is
  // often nothing but a postal code — and an invoice with no address on it is not something a
  // company's finance department can accept or a tax authority can read.
  const p = params(build(LIVE));
  assert.equal(p.get('billing_address_collection'), 'required');
});

test('A VAT-REGISTERED BUYER CAN PUT THEIR TAX ID ON THE INVOICE', () => {
  // Without tax_id_collection there is no field for a VAT/GST/ABN number anywhere in this product,
  // so an EU business buyer cannot get a compliant invoice out of it at all — they can pay and
  // then cannot reclaim, which is a refund request wearing a different hat.
  const p = params(build(LIVE));
  assert.equal(p.get('tax_id_collection[enabled]'), 'true');
});

test('AUTOMATIC TAX IS NOT SWITCHED ON HERE, and the refusal is deliberate', () => {
  // Stripe rejects `automatic_tax[enabled]=true` outright on an account that has not activated
  // Stripe Tax and registered an origin address. Setting it from code would not make this product
  // tax-compliant; it would make every checkout 400 until someone finished a task in a dashboard
  // this repo cannot see. It is a configuration decision, not a line of code.
  const body = build(LIVE).body;
  assert.doesNotMatch(body, /automatic_tax/);
});

test('CUSTOMER_UPDATE IS NOT SENT — this session has no customer to update', () => {
  // The audit proposed `customer_update[name]=auto` to get a business name onto the invoice.
  // Stripe only accepts customer_update when the session names an existing `customer`, and this
  // one identifies the buyer by `customer_email` so Stripe creates the customer itself. Sending it
  // would be a 400 from Stripe on every first purchase. The name arrives with the address instead.
  const p = params(build(LIVE));
  assert.equal(p.get('customer'), null, 'no existing customer is named');
  assert.doesNotMatch(build(LIVE).body, /customer_update/);
});

test('the checkout never carries a plan the webhook would trust', () => {
  // Entitlement is recomputed from subscription status and period. Nothing in this request is an
  // instruction about what the user should end up with.
  const body = build(LIVE).body;
  assert.doesNotMatch(body, /entitle|grant|set-plan/i);
});

// --- the portal ----------------------------------------------------------------------------

test('the portal refuses when there is no billing account to open', () => {
  const r = B.buildPortalRequest(LIVE, { customerId: '', returnTo: RETURN_TO });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /nothing to manage/i, 'a user who never bought anything is told why');
});

test('the portal opens the right customer and comes back to us', () => {
  const p = params(B.buildPortalRequest(LIVE, { customerId: 'cus_9', returnTo: RETURN_TO }));
  assert.equal(p.get('customer'), 'cus_9');
  assert.equal(p.get('return_url'), RETURN_TO);
});

test('the portal is unavailable on a deployment with no key', () => {
  const r = B.buildPortalRequest({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }, { customerId: 'cus_9', returnTo: RETURN_TO });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});
