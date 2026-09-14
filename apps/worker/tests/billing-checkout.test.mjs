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
  STRIPE_PRICE_PRO: 'price_pro_1',
  STRIPE_PRICE_TEAM: 'price_team_1',
};
const RETURN_TO = 'https://golem.example/app/usage';
const build = (env, over = {}) =>
  B.buildCheckoutRequest(env, { userId: 'u_1', email: 'a@b.c', plan: 'pro', returnTo: RETURN_TO, ...over });
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
  const partial = { ...LIVE, STRIPE_PRICE_TEAM: '   ' };
  assert.equal(B.priceIdFor(partial, 'team'), null, 'whitespace is not a price id');
  const r = B.buildCheckoutRequest(partial, { userId: 'u_1', plan: 'team', returnTo: RETURN_TO });
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
  assert.equal(pro.get('line_items[0][price]'), 'price_pro_1');
  assert.equal(pro.get('mode'), 'subscription');
  assert.equal(pro.get('line_items[0][quantity]'), '1');

  const team = params(build(LIVE, { plan: 'team' }));
  assert.equal(team.get('line_items[0][price]'), 'price_team_1', 'each tier gets its own price');
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
      items: { data: [{ price: { id: 'price_pro_1' } }] },
    } },
  };
  const outcome = B.interpretStripeEvent(event);
  assert.equal(outcome.userId, 'u_abc', 'the webhook must attribute it to the same user');
  assert.ok(outcome.subscription, 'and read a subscription from it');
  assert.equal(outcome.subscription.customerId, 'cus_1', 'including the customer the portal needs');
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
