/**
 * THE SUBSCRIPTION A USER ACTUALLY BOUGHT, AND WHAT THE PRODUCT CAN SAY ABOUT IT.
 *
 * Two defects this file exists for, both of which passed every test that came before it.
 *
 * 1. THE PLAN NEVER ARRIVED. `buildCheckoutRequest` set `subscription_data[metadata][userId]` and
 *    nothing else, while `interpretStripeEvent` reads `metadata['plan']` and falls back to 'free'.
 *    So a real Builder subscription was interpreted as free and the paying user stayed on the free
 *    tier. billing.test.mjs did not catch it because every event there is HAND-BUILT with a `plan`
 *    field that no checkout in this repo ever sets — the test wrote down the answer it wanted. The
 *    assertion below therefore never names a metadata key twice: it takes the body the checkout
 *    builder produces, feeds THAT metadata to the real reader, and asserts on the plan that comes
 *    out the far end.
 *
 * 2. THE STATUS WAS PARSED AND THROWN AWAY. `interpretStripeEvent` reads status, currentPeriodEnd
 *    and cancelAtPeriodEnd, and the webhook then persisted only the entitled plan — so after the
 *    event returned, the product could not tell a subscription that renews next week from one that
 *    cancels at the end of the period, nor a failed renewal from a healthy one. `subscriptionView`
 *    is the single reading of those fields that every surface now derives from.
 *
 * Run with:  node --test tests/billing-subscription.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'billing-sub-')), 'billing.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);

const LIVE = {
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_PRICE_BUILDER: 'price_builder_1',
  STRIPE_PRICE_STUDIO: 'price_studio_1',
};
const RETURN_TO = 'https://golem.example/app/usage';

/**
 * Stripe's round trip, modelled on the ONE fact that matters: the subscription a checkout creates
 * carries the `subscription_data[metadata][*]` the request asked for, and nothing else of ours.
 *
 * This is deliberately not a fixture of an event. A fixture is where defect 1 hid — it let the test
 * assert a plan the checkout never sent. Here the metadata is LIFTED OUT of the real request body,
 * so if the builder stops setting a field the event stops carrying it and the assertion fails.
 */
function subscriptionEventFromCheckout(body, over = {}) {
  const p = new URLSearchParams(body);
  const metadata = {};
  for (const [k, v] of p.entries()) {
    const m = /^subscription_data\[metadata\]\[(\w+)\]$/.exec(k);
    if (m) metadata[m[1]] = v;
  }
  return {
    id: 'evt_1',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        current_period_end: 4_102_444_800,
        cancel_at_period_end: false,
        metadata,
        ...over,
      },
    },
  };
}

// --------------------------------------------------------------- the plan survives the round trip

test('THE PLAN THE USER BOUGHT IS THE PLAN THE WEBHOOK GRANTS', () => {
  // The defect: a paid subscription was stored as free, silently, for every customer.
  for (const plan of ['builder', 'studio']) {
    const built = B.buildCheckoutRequest(LIVE, { userId: 'u_1', email: 'a@b.c', plan, returnTo: RETURN_TO });
    assert.equal(built.ok, true, `${plan} must be buyable in this fixture`);
    const outcome = B.interpretStripeEvent(subscriptionEventFromCheckout(built.body));
    assert.equal(outcome.subscription.plan, plan,
      `a ${plan} checkout produced a subscription the webhook reads as ${outcome.subscription.plan}`);
    // And the entitlement computed from it is the tier that was paid for, not the fallback.
    assert.equal(B.entitlementFor(outcome.subscription, 1_000), plan);
  }
});

test('a deletion still lapses to free even though the checkout now names a plan', () => {
  // Naming the plan in metadata must not become a way to keep a cancelled subscription paid.
  const built = B.buildCheckoutRequest(LIVE, { userId: 'u_1', plan: 'studio', returnTo: RETURN_TO });
  const event = subscriptionEventFromCheckout(built.body);
  event.type = 'customer.subscription.deleted';
  const outcome = B.interpretStripeEvent(event);
  assert.equal(outcome.subscription.plan, 'free');
  assert.equal(outcome.subscription.status, 'canceled');
});

test('the checkout still carries the user, and the two metadata fields are independent', () => {
  // F-66: one fixture, one missing conjunct. Dropping the plan must not take the user with it.
  const built = B.buildCheckoutRequest(LIVE, { userId: 'u_abc', plan: 'builder', returnTo: RETURN_TO });
  const p = new URLSearchParams(built.body);
  assert.equal(p.get('subscription_data[metadata][userId]'), 'u_abc');
  assert.equal(p.get('subscription_data[metadata][plan]'), 'builder');

  const noPlan = subscriptionEventFromCheckout(built.body);
  delete noPlan.data.object.metadata.plan;
  const a = B.interpretStripeEvent(noPlan);
  assert.equal(a.userId, 'u_abc', 'the user is still attributable');
  assert.equal(a.subscription.plan, 'free', 'but an unnamed plan grants nothing');

  const noUser = subscriptionEventFromCheckout(built.body);
  delete noUser.data.object.metadata.userId;
  const b = B.interpretStripeEvent(noUser);
  assert.equal(b.userId, null, 'and an unattributable subscription is ignored whatever plan it names');
  assert.equal(b.subscription, undefined);
});

// ------------------------------------------------------------------------------ the event's id

test('every interpreted event carries the id the webhook needs to deduplicate it', () => {
  // Stripe retries. Without the id nothing downstream can tell a retry from a second purchase, and
  // /grant-credits is additive.
  const r = B.interpretStripeEvent({
    id: 'evt_9',
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: { userId: 'u1', credits: '500' } } },
  });
  assert.equal(r.eventId, 'evt_9');
  assert.equal(r.creditsDelta, 500);

  const anon = B.interpretStripeEvent({ type: 'ping', data: { object: {} } });
  assert.equal(anon.eventId, null, 'an event with no id must read as null, never as the string "undefined"');
});

// ------------------------------------------------------------------------- what can be displayed

const sub = (over = {}) => ({ ...B.FREE_SUBSCRIPTION, ...over });
const NOW = 1_700_000_000;
const LATER = NOW + 10 * 86_400;

test('a user who never subscribed has nothing to show and no account to open', () => {
  const v = B.subscriptionView(null, NOW);
  assert.equal(v.state, 'none');
  assert.equal(v.plan, 'free');
  assert.equal(v.hasBillingAccount, false);
  assert.equal(v.renewsAt, null);
  assert.equal(v.endsAt, null);
  assert.equal(v.needsAttention, false);
});

test('AN ACTIVE SUBSCRIPTION STATES WHEN IT RENEWS', () => {
  const v = B.subscriptionView(
    sub({ plan: 'builder', status: 'active', currentPeriodEnd: LATER, customerId: 'cus_1' }),
    NOW,
  );
  assert.equal(v.state, 'active');
  assert.equal(v.plan, 'builder');
  assert.equal(v.renewsAt, LATER, 'the renewal date is the one thing a subscriber wants to know');
  assert.equal(v.endsAt, null, 'nothing is ending');
  assert.equal(v.needsAttention, false);
  assert.equal(v.hasBillingAccount, true);
});

test('A CANCELLING SUBSCRIPTION SAYS WHEN ACCESS ENDS, NOT WHEN IT RENEWS', () => {
  // The whole point of persisting cancelAtPeriodEnd: before this, a cancelling subscription and a
  // renewing one were the same row, and the product told the user the wrong one of two opposite
  // things.
  const v = B.subscriptionView(
    sub({ plan: 'studio', status: 'active', currentPeriodEnd: LATER, cancelAtPeriodEnd: true, customerId: 'cus_1' }),
    NOW,
  );
  assert.equal(v.state, 'cancelling');
  assert.equal(v.endsAt, LATER);
  assert.equal(v.renewsAt, null, 'a cancelling subscription does not renew, and must not claim to');
  assert.equal(v.plan, 'studio', 'and service continues until it ends');
});

test('a trial is its own state, not an indistinguishable "active"', () => {
  const v = B.subscriptionView(sub({ plan: 'builder', status: 'trialing', currentPeriodEnd: LATER, customerId: 'c' }), NOW);
  assert.equal(v.state, 'trialing');
  assert.equal(v.plan, 'builder');
});

test('A FAILED RENEWAL IS VISIBLE AND STILL SERVED', () => {
  // past_due entitles on purpose — cutting a customer off at the first retry is hostile. But the
  // product has to SAY so, or the first the user hears of it is the cancellation.
  const v = B.subscriptionView(
    sub({ plan: 'builder', status: 'past_due', currentPeriodEnd: LATER, customerId: 'cus_1' }),
    NOW,
  );
  assert.equal(v.state, 'past_due');
  assert.equal(v.plan, 'builder', 'access continues while Stripe retries');
  assert.equal(v.needsAttention, true, 'and the user is told there is something to fix');
});

test('A PAYMENT AWAITING AUTHENTICATION GRANTS NOTHING AND SAYS SO', () => {
  // SCA: the card needs a challenge. `incomplete` is absent from the entitling set, so the plan is
  // free — but silence there is the failure, because the user believes they have paid.
  const v = B.subscriptionView(
    sub({ plan: 'studio', status: 'incomplete', currentPeriodEnd: LATER, customerId: 'cus_1' }),
    NOW,
  );
  assert.equal(v.state, 'needs_action');
  assert.equal(v.plan, 'free', 'an unauthenticated payment entitles nothing');
  assert.equal(v.needsAttention, true);
});

test('a lapsed subscription reads as lapsed, and keeps the account it can return through', () => {
  const v = B.subscriptionView(
    sub({ plan: 'builder', status: 'canceled', currentPeriodEnd: NOW - 86_400, customerId: 'cus_1' }),
    NOW,
  );
  assert.equal(v.state, 'lapsed');
  assert.equal(v.plan, 'free');
  assert.equal(v.hasBillingAccount, true, 'a cancelled customer must still be able to reach their invoices');
});

test('an expired period lapses even while the status still says active', () => {
  // The same rule entitlementFor applies, carried into the view so the two cannot disagree.
  const s = sub({ plan: 'builder', status: 'active', currentPeriodEnd: NOW - 1, customerId: 'cus_1' });
  assert.equal(B.entitlementFor(s, NOW), 'free');
  assert.equal(B.subscriptionView(s, NOW).state, 'lapsed');
  assert.equal(B.subscriptionView(s, NOW).plan, 'free');
});

// ------------------------------------------------------- one subscription per account, on the server

test('A SECOND CHECKOUT IS REFUSED WHILE A SUBSCRIPTION IS STILL RUNNING', () => {
  // Stripe checkout ADDS a subscription, it does not replace one. The page already routed paid
  // users to the portal, but the ROUTE never looked — so a direct POST minted a second one and the
  // customer paid for both.
  const running = [
    ['active', sub({ plan: 'builder', status: 'active', currentPeriodEnd: LATER, customerId: 'c' })],
    ['trialing', sub({ plan: 'builder', status: 'trialing', currentPeriodEnd: LATER, customerId: 'c' })],
    ['past_due', sub({ plan: 'builder', status: 'past_due', currentPeriodEnd: LATER, customerId: 'c' })],
    ['cancelling', sub({ plan: 'builder', status: 'active', currentPeriodEnd: LATER, cancelAtPeriodEnd: true, customerId: 'c' })],
  ];
  for (const [label, s] of running) {
    const g = B.checkoutGuard(B.subscriptionView(s, NOW));
    assert.equal(g.ok, false, `${label} must not be able to start a second subscription`);
    assert.equal(g.status, 409, `${label} is a conflict with existing state, not a bad request`);
    assert.match(g.error, /portal/i, `${label} must be told where the change actually happens`);
  }
});

test('and a checkout is ALLOWED for everyone with nothing running', () => {
  // The other half of the conjunction. A guard that refuses everybody would pass the test above
  // and break every purchase.
  assert.equal(B.checkoutGuard(B.subscriptionView(null, NOW)).ok, true, 'a new customer');
  assert.equal(
    B.checkoutGuard(B.subscriptionView(sub({ plan: 'builder', status: 'canceled', customerId: 'c' }), NOW)).ok,
    true,
    'A LAPSED CUSTOMER MUST BE ABLE TO COME BACK — reactivation is a first checkout again',
  );
  assert.equal(
    B.checkoutGuard(B.subscriptionView(sub({ plan: 'builder', status: 'active', currentPeriodEnd: NOW - 1, customerId: 'c' }), NOW)).ok,
    true,
    'and so must one whose period simply ran out',
  );
});

// ------------------------------------------------- the tier a PORTAL upgrade actually charges for

/**
 * THE PLAN IS ON THE PRICE, NOT ONLY IN THE METADATA.
 *
 * `metadata.plan` is written exactly once, by `buildCheckoutRequest`. Anyone already on a paid tier
 * is sent to the Stripe Billing Portal instead, and a price swap there changes
 * `subscription.items[].price` and leaves `subscription.metadata` exactly as the original checkout
 * left it. So the `customer.subscription.updated` that follows an upgrade still named the OLD plan:
 * the customer was charged Studio and entitled Builder, silently, with no row anywhere saying so.
 *
 * The price id is the thing Stripe bills against, so it is the thing entitlement is read from.
 */
function portalEvent(over = {}, metadata = { userId: 'u_1', plan: 'builder' }) {
  return {
    id: 'evt_portal',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1', customer: 'cus_1', status: 'active',
        current_period_end: 4_102_444_800, cancel_at_period_end: false, metadata, ...over,
      },
    },
  };
}
const withPrice = (priceId) => ({ items: { data: [{ id: 'si_1', price: { id: priceId } }] } });

test('AN UPGRADE BOUGHT IN THE PORTAL ENTITLES THE TIER IT CHARGES FOR', () => {
  // metadata still says builder because the checkout that wrote it was a builder checkout. The item
  // price says studio because that is what Stripe is now billing. Studio wins.
  const outcome = B.interpretStripeEvent(portalEvent(withPrice(LIVE.STRIPE_PRICE_STUDIO)), LIVE);
  assert.equal(outcome.subscription.plan, 'studio',
    'the price Stripe bills against is the tier the customer is entitled to');
  assert.equal(B.entitlementFor(outcome.subscription, 1_000), 'studio');
});

test('and a DOWNGRADE bought in the portal loses the tier it stopped charging for', () => {
  // The opposite direction, which the same defect got wrong the other way: metadata says studio,
  // the price says builder, and reading metadata would keep serving the tier nobody is paying for.
  const outcome = B.interpretStripeEvent(
    portalEvent(withPrice(LIVE.STRIPE_PRICE_BUILDER), { userId: 'u_1', plan: 'studio' }),
    LIVE,
  );
  assert.equal(outcome.subscription.plan, 'builder');
});

test('an UNRECOGNISED price falls back to the metadata rather than to free', () => {
  // A price this deployment does not know — a legacy one, or a test-mode id against live keys — must
  // not silently demote a paying customer. The metadata is the weaker answer, not no answer.
  const outcome = B.interpretStripeEvent(portalEvent(withPrice('price_from_another_account')), LIVE);
  assert.equal(outcome.subscription.plan, 'builder');
});

test('a subscription with no items at all still reads its metadata', () => {
  // Every event hand-built before this one has no `items`, and none of them may change meaning.
  assert.equal(B.interpretStripeEvent(portalEvent(), LIVE).subscription.plan, 'builder');
});

test('a DELETION lapses to free however good the price id is', () => {
  // Reading the price must not become a way to keep a cancelled subscription paid.
  const e = portalEvent(withPrice(LIVE.STRIPE_PRICE_STUDIO));
  e.type = 'customer.subscription.deleted';
  assert.equal(B.interpretStripeEvent(e, LIVE).subscription.plan, 'free');
});

test('planForPriceId maps only the prices this deployment actually sells', () => {
  assert.equal(B.planForPriceId(LIVE, LIVE.STRIPE_PRICE_BUILDER), 'builder');
  assert.equal(B.planForPriceId(LIVE, LIVE.STRIPE_PRICE_STUDIO), 'studio');
  assert.equal(B.planForPriceId(LIVE, 'price_nope'), null);
  assert.equal(B.planForPriceId(LIVE, null), null);
  // The empty-string trap: a deployment with no prices configured must not match an absent id.
  assert.equal(B.planForPriceId({}, ''), null);
  assert.equal(B.planForPriceId({}, 'price_builder_1'), null);
});
