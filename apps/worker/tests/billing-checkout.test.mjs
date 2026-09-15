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
  // company's finance department can accept or a tax authority can read. It is also the address
  // `automatic_tax` is calculated against, so the two are asserted separately on purpose: losing
  // this line would leave the tax flag enabled and computing against nothing.
  const p = params(build(LIVE));
  assert.equal(p.get('billing_address_collection'), 'required');
});

/**
 * TAX IS CALCULATED BY STRIPE, AND THE PAGES SAY SO.
 *
 * Before this the request carried no tax parameter at all, so Stripe computed none and displayed
 * none: a VAT-registered buyer in the EU was quoted a bare monthly figure and charged it, and the
 * invoice that followed was one nobody could reclaim against. The price stays exclusive — that is
 * what the ladder and the pricing page now state in words — and the amount owed on top of it is
 * worked out on Stripe's own page, before the card is entered.
 */
test('THE CHECKOUT ASKS STRIPE TO CALCULATE TAX, and lets a business enter its VAT id', () => {
  const p = params(build(LIVE));
  assert.equal(p.get('automatic_tax[enabled]'), 'true', 'without this Stripe shows and charges no tax');
  assert.equal(p.get('tax_id_collection[enabled]'), 'true',
    'a business buyer must be able to enter a VAT/GST id, or the invoice is useless to them');
});

test('and it does NOT send customer_update, which Stripe would refuse here', () => {
  // `customer_update` is only accepted alongside `customer`. This session identifies the buyer by
  // `customer_email` and lets Checkout create the customer, so sending it would make Stripe reject
  // the whole session — the tax feature would read as "enabled" and no checkout would open at all.
  const p = params(build(LIVE));
  assert.equal(p.get('customer_update[address]'), null);
  assert.doesNotMatch(build(LIVE).body, /customer_update/, 'in any form, not merely the address key');
  assert.equal(p.get('customer'), null, 'and there is no customer id here to attach it to');
  assert.equal(p.get('customer_email'), 'a@b.c');
});

test('THE PROMOTION-CODE FIELD IS SWITCHED ON, so a discount code can be entered at all', () => {
  // Stripe validates the code itself, on its own page, against its own list — which is why there is
  // no code-entry box in this app. The one thing the repo owns is the flag, and nothing asserted it:
  // the comment above the line described "one subscription per account" instead, so deleting the
  // line would have read as removing a stray and the field would have vanished from the page.
  assert.equal(params(build(LIVE)).get('allow_promotion_codes'), 'true');
});

/**
 * THE WINDOW IS OURS, SO THE EXPIRY IS SOMETHING WE CAN TELL SOMEBODY ABOUT.
 *
 * Unset, a session lapses 24 hours later — long after the person has forgotten they started it, and
 * with `checkout.session.expired` arriving into a product that had no case for it. An hour is long
 * enough to finish a purchase and short enough that "the checkout you started has expired, nothing
 * was charged" is still about something the reader remembers doing.
 */
test('THE CHECKOUT WINDOW IS OURS, AND IT IS INSIDE WHAT STRIPE ACCEPTS', () => {
  const NOW = 1_800_000_000;
  const p = params(build(LIVE, { nowSeconds: NOW }));
  const expires = Number(p.get('expires_at'));
  assert.ok(Number.isInteger(expires), `expires_at must be a unix second, saw ${p.get('expires_at')}`);
  assert.ok(expires - NOW >= 30 * 60, 'Stripe refuses a window shorter than 30 minutes');
  assert.ok(expires - NOW <= 24 * 3600, 'and one longer than 24 hours');
});

test('a request built with no clock passed in still carries a usable expiry', () => {
  // A NaN here would be sent to Stripe as the string "NaN" and refuse the whole session, so the
  // fallback is a real clock rather than an absent field.
  const now = Math.floor(Date.now() / 1000);
  const expires = Number(params(build(LIVE)).get('expires_at'));
  assert.ok(expires - now >= 30 * 60 && expires - now <= 24 * 3600, `expires_at was ${expires} at ${now}`);
});

test('AN EXPIRED CHECKOUT IS HANDLED, NOT MERELY UNHANDLED', () => {
  // It reaches the entitlement reader like everything else, and must touch nothing — but "unhandled
  // event type" is what this reader says about an event it does not know, and this is one it knows
  // and deliberately does nothing about. The two must not read the same in a log.
  const out = B.interpretStripeEvent({
    id: 'evt_exp',
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_1', metadata: { userId: 'u_9' } } },
  });
  assert.equal(out.userId, 'u_9', 'the session carries the user, so the person can be told');
  assert.equal(out.subscription, undefined, 'and nothing is applied to their entitlement');
  assert.ok(!out.creditsDelta, 'nor to their credits');
  assert.doesNotMatch(out.ignored ?? '', /unhandled/i);
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

/**
 * WHICH CONTROLS THE PORTAL OFFERS IS A DASHBOARD SETTING, AND THIS IS HOW IT STOPS BEING ONE.
 *
 * The request carried only `customer` and `return_url`, so the portal rendered whatever the Stripe
 * dashboard's DEFAULT configuration happened to have switched on. Every claim this product makes
 * about managing a card — 'Update your payment method' on a past_due notice, 'Manage billing,
 * invoices and cancellation' on /usage — depends on a toggle in a web UI this repo cannot see,
 * cannot assert, and cannot notice being turned off. Naming the configuration pins it to a version
 * a deployment controls.
 */
test('THE PORTAL CONFIGURATION IS PINNED WHEN THE DEPLOYMENT NAMES ONE', () => {
  const p = params(B.buildPortalRequest(
    { ...LIVE, STRIPE_PORTAL_CONFIGURATION: 'bpc_live_1' },
    { customerId: 'cus_9', returnTo: RETURN_TO },
  ));
  assert.equal(p.get('configuration'), 'bpc_live_1',
    'without this, payment-method management is whatever the dashboard default has on today');
  assert.equal(p.get('customer'), 'cus_9', 'and it still opens the right customer');
});

test('and is ABSENT rather than empty when the deployment names none', () => {
  // An empty `configuration` is not "the default": Stripe refuses the session, and the portal — the
  // only route to a card, an invoice or a cancellation — stops opening at all.
  const p = params(B.buildPortalRequest(LIVE, { customerId: 'cus_9', returnTo: RETURN_TO }));
  assert.equal(p.get('configuration'), null);
  const blank = params(B.buildPortalRequest(
    { ...LIVE, STRIPE_PORTAL_CONFIGURATION: '   ' },
    { customerId: 'cus_9', returnTo: RETURN_TO },
  ));
  assert.equal(blank.get('configuration'), null, 'whitespace is not a configuration id');
});

test('the portal is unavailable on a deployment with no key', () => {
  const r = B.buildPortalRequest({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }, { customerId: 'cus_9', returnTo: RETURN_TO });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});
