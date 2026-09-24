// THE PAYLOADS STRIPE SENDS TODAY, NOT THE ONES THE FIXTURES REMEMBER.
//
// No Stripe call in this worker pins `Stripe-Version`, so every webhook and every
// `GET /v1/subscriptions/:id` the billing authority makes arrives in the account's own API version.
// The sandbox this deployment uses was set up in 2025-2026, which is 2025-03-31.basil or later, and
// basil moved three fields this code reads:
//
//   * `current_period_end` left the Subscription for `items.data[].current_period_end`
//     (docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).
//     Reading only the top level made `currentPeriodEnd` null on every real subscription: no renewal
//     date on the page, and `entitlementFor` never lapsed a period whose deletion event was missed.
//   * an invoice's subscription metadata moved to `parent.subscription_details.metadata`
//     (changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects), so a failed renewal
//     named nobody and the customer was never told.
//   * in flexible billing mode (the default from 2025-09-30.clover) a portal cancellation sets
//     `cancel_at` and leaves `cancel_at_period_end` false
//     (docs.stripe.com/billing/subscriptions/billing-mode/compare), so a cancelling plan read "renews".
//
// And one that is not about versions: while a rolled signing secret overlaps, Stripe sends one `v1`
// per live secret (docs.stripe.com/webhooks#verify-manually). Keeping only the last `v1` refused
// every delivery signed for the secret this worker still held — the rotation window was an outage.
//
// Run with:  node --test tests/billing-stripe-api-shape.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'billing-shape-'));
const bundle = (name) => {
  const out = join(dir, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${name}.ts`), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const B = await bundle('billing');
const D = await bundle('dunning');

const ENV = { STRIPE_PRICE_BUILDER: 'price_builder_1', STRIPE_PRICE_STUDIO: 'price_studio_1' };
const NOW = 1_800_000_000;
const PERIOD_END = NOW + 30 * 86_400;

/** A subscription as a basil-or-later account returns it: the period lives on the item. */
const basilSubscription = (over = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: { userId: 'u-1', plan: 'builder' },
  items: {
    data: [{ id: 'si_1', price: { id: 'price_builder_1' }, current_period_start: NOW, current_period_end: PERIOD_END }],
  },
  ...over,
});
const event = (object, type = 'customer.subscription.updated') => ({ id: 'evt_1', type, data: { object } });

test('THE PERIOD END IS READ OFF THE ITEM, WHERE BASIL PUTS IT', () => {
  const out = B.interpretStripeEvent(event(basilSubscription()), ENV);
  assert.equal(out.subscription.currentPeriodEnd, PERIOD_END);
  const view = B.subscriptionView(out.subscription, NOW);
  assert.equal(view.state, 'active');
  assert.equal(view.renewsAt, PERIOD_END, 'a subscriber is told when it renews');
});

test('and a period that ran out lapses, even if the deletion event never arrived', () => {
  const out = B.interpretStripeEvent(event(basilSubscription()), ENV);
  assert.equal(B.entitlementFor(out.subscription, NOW), 'builder');
  assert.equal(B.entitlementFor(out.subscription, PERIOD_END + 1), 'free');
});

test('a pre-basil subscription with a top-level period still reads it', () => {
  const legacy = basilSubscription({ current_period_end: PERIOD_END + 5, items: { data: [{ id: 'si_1', price: 'price_builder_1' }] } });
  assert.equal(B.interpretStripeEvent(event(legacy), ENV).subscription.currentPeriodEnd, PERIOD_END + 5);
});

test('A FLEXIBLE-MODE PORTAL CANCELLATION (cancel_at, not cancel_at_period_end) READS AS CANCELLING', () => {
  const out = B.interpretStripeEvent(event(basilSubscription({ cancel_at: PERIOD_END })), ENV);
  assert.equal(out.subscription.cancelAtPeriodEnd, true);
  const view = B.subscriptionView(out.subscription, NOW);
  assert.equal(view.state, 'cancelling');
  assert.equal(view.renewsAt, null, 'it does not renew, and must not claim to');
  assert.equal(view.endsAt, PERIOD_END);
});

test('a cancel date beyond the current period still renews once, so it is not "cancelling" yet', () => {
  const out = B.interpretStripeEvent(event(basilSubscription({ cancel_at: PERIOD_END + 30 * 86_400 })), ENV);
  assert.equal(out.subscription.cancelAtPeriodEnd, false);
});

test('A BASIL INVOICE NAMES ITS PAYER THROUGH parent.subscription_details', () => {
  const n = D.interpretDunningEvent({
    id: 'evt_2',
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_1', amount_due: 1200, currency: 'usd', attempt_count: 1, metadata: {},
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1', metadata: { userId: 'u-1' } } },
      },
    },
  });
  assert.ok(n, 'a failed renewal on a current API version is not dropped as nobody\'s');
  assert.equal(n.userId, 'u-1');
});

/** Sign like Stripe does; one `v1` per secret given, in that order. */
async function header(body, ts, secrets) {
  const sigs = [];
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
    sigs.push(`v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
  }
  return `t=${ts},${sigs.join(',')}`;
}

test('WHILE A ROLLED SECRET OVERLAPS, A DELIVERY SIGNED FOR THE SECRET WE HOLD VERIFIES, IN EITHER ORDER', async () => {
  const body = JSON.stringify({ id: 'evt_3', type: 'ping' });
  const ts = 1_700_000_000;
  const held = 'whsec_held';
  const rolled = 'whsec_rolled';
  assert.equal((await B.verifyStripeSignature(body, await header(body, ts, [held, rolled]), held, ts)).ok, true);
  assert.equal((await B.verifyStripeSignature(body, await header(body, ts, [rolled, held]), held, ts)).ok, true);
});

test('and a header whose every v1 is for some other secret is still refused', async () => {
  const body = JSON.stringify({ id: 'evt_4', type: 'ping' });
  const ts = 1_700_000_000;
  const r = await B.verifyStripeSignature(body, await header(body, ts, ['whsec_a', 'whsec_b']), 'whsec_held', ts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mismatch/);
});
