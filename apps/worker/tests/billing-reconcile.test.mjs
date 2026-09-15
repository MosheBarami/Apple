/**
 * DOES STRIPE THINK THE SAME THING WE DO?
 *
 * Every entitlement in this product is applied by one webhook. A webhook is a delivery, and a
 * delivery can be missed: Stripe gives up after its retries, a deploy can be mid-flight, a
 * signature secret can be rotated on one side. When that happens NOTHING SAYS SO — the customer is
 * charged by Stripe and served by us at whatever tier the last event we did receive implied, and
 * the only way anyone finds out is a complaint. Nothing in this repo read Stripe's subscription
 * list at all before this.
 *
 * THE COMPARISON IS PURE, so it can be tested without a network — and it reads the plan through the
 * SAME function the webhook reads it through, which is the property that makes the report worth
 * anything. Two independent readings of "which tier is this price" would let the report agree with
 * a subscription the webhook would have applied differently, and a reconciliation that can be wrong
 * in exactly the way it is looking for is worse than none.
 *
 * AND IT CARRIES A DENOMINATOR. "No disagreements" over zero subscriptions examined is not a clean
 * account, it is a broken query, and the two must not render as the same sentence.
 *
 * Run with:  node --test tests/billing-reconcile.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-reconcile-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
rmSync(out, { force: true });

const ENV = {
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_PRICE_BUILDER: 'price_builder_1',
  STRIPE_PRICE_STUDIO: 'price_studio_1',
};

/** One Stripe subscription, shaped as Stripe sends it. */
const stripeSub = (over = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_1',
  status: 'active',
  current_period_end: 1_800_000_000,
  cancel_at_period_end: false,
  metadata: { userId: 'u_1' },
  items: { data: [{ id: 'si_1', price: { id: 'price_builder_1' } }] },
  ...over,
});

/** What our own DO holds. */
const ours = (over = {}) => ({
  plan: 'builder', customerId: 'cus_1', subscriptionId: 'sub_1', itemId: 'si_1',
  status: 'active', currentPeriodEnd: 1_800_000_000, cancelAtPeriodEnd: false, ...over,
});

const row = (s, o) => B.reconcileSubscription(s, o, ENV);

// --- the two sides agreeing ------------------------------------------------------------------

test('CONTROL: a subscription both sides read the same way is not a finding', () => {
  // Without this every "it was caught" below could pass because the comparison flags everything.
  const r = row(stripeSub(), ours());
  assert.equal(r.verdict, 'ok');
  assert.equal(r.userId, 'u_1');
  assert.equal(r.subscriptionId, 'sub_1');
});

test('THE PLAN IS READ THE SAME WAY THE WEBHOOK READS IT', () => {
  // The property that makes the report meaningful. A tier change made in the Billing Portal swaps
  // items[].price and leaves metadata alone, so a reconciler that trusted metadata would agree with
  // the very drift it exists to find. Run through interpretStripeEvent rather than compared to a
  // literal, so the two cannot be brought apart by an edit to either.
  const raw = stripeSub({ metadata: { userId: 'u_1', plan: 'builder' }, items: { data: [{ id: 'si_1', price: { id: 'price_studio_1' } }] } });
  const viaWebhook = B.interpretStripeEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: raw } }, ENV);
  assert.equal(viaWebhook.subscription.plan, 'studio', 'the webhook prices it from the price');
  assert.equal(row(raw, ours({ plan: 'studio' })).stripePlan, 'studio', 'and so must this');
  assert.equal(row(raw, ours({ plan: 'studio' })).verdict, 'ok');
});

// --- the four ways they come apart ------------------------------------------------------------

test('A SUBSCRIPTION NOBODY CAN BE ATTRIBUTED IS THE LOUDEST FINDING', () => {
  // Somebody is paying and no account can be entitled by it — the webhook ignores it on every
  // delivery, by design, because a guessed account is worse than none. That refusal is correct and
  // silent, and this is the only place it becomes visible.
  const r = row(stripeSub({ metadata: {} }), null);
  assert.equal(r.verdict, 'unattributed');
  assert.equal(r.userId, null, 'and no id is invented for the report');
  assert.equal(r.subscriptionId, 'sub_1', 'the subscription is still named, so it can be looked up');
  // The tier was genuinely read off the price and must survive: "somebody is paying for Builder and
  // nobody can be entitled by it" is the sentence; the same row with the tier blanked says only
  // that something is wrong somewhere.
  assert.equal(r.stripePlan, 'builder');
  assert.equal(r.ourPlan, null, 'and our side is empty, which is the point');
});

test('an attributed subscription we hold no record of at all', () => {
  // The plain missed webhook: Stripe has it, we never applied it, the customer is paying for a tier
  // they are not being served.
  const r = row(stripeSub(), null);
  assert.equal(r.verdict, 'missing_here');
  assert.equal(r.stripePlan, 'builder');
  assert.equal(r.ourPlan, null, 'null, not "free" — we have no record, which is not a record of free');
});

test('the tiers disagree', () => {
  const r = row(stripeSub({ items: { data: [{ id: 'si_1', price: { id: 'price_studio_1' } }] } }), ours({ plan: 'builder' }));
  assert.equal(r.verdict, 'plan_differs');
  assert.equal(r.stripePlan, 'studio');
  assert.equal(r.ourPlan, 'builder');
});

test('the tiers agree and the STATUS does not, which is a different repair', () => {
  // Same tier, but Stripe has stopped collecting: a cancellation or a lapse whose event we missed.
  // Distinguished from a plan drift because the fix is not the same one.
  const r = row(stripeSub({ status: 'canceled' }), ours({ status: 'active' }));
  assert.equal(r.verdict, 'status_differs');
  assert.equal(r.stripeStatus, 'canceled');
  assert.equal(r.ourStatus, 'active');
});

test('a plan difference outranks a status difference, so one row is not two findings', () => {
  const r = row(stripeSub({ status: 'canceled', items: { data: [{ id: 'si_1', price: { id: 'price_studio_1' } }] } }), ours({ plan: 'builder', status: 'active' }));
  assert.equal(r.verdict, 'plan_differs');
});

test('junk in the list is reported, never silently dropped', () => {
  // A row this reader cannot parse is not a row that agrees. Dropping it would shrink the
  // denominator by exactly the rows most likely to be interesting.
  for (const junk of [null, 'sub_1', 42, []]) {
    const r = row(junk, null);
    assert.equal(r.verdict, 'unattributed', `${JSON.stringify(junk)} must still produce a row`);
    assert.equal(r.subscriptionId, null);
  }
});

// --- the denominator ---------------------------------------------------------------------------

test('THE REPORT COUNTS WHAT IT EXAMINED, not only what it disliked', () => {
  // "0 disagreements" is a fact about a query as much as about an account. Over zero subscriptions
  // it is a broken walk wearing the words of a clean one — the failure this repo keeps finding.
  const rows = [row(stripeSub(), ours()), row(stripeSub({ id: 'sub_2' }), null)];
  const report = B.reconcileReport(rows);
  assert.equal(report.checked, 2);
  assert.equal(report.agreed, 1);
  assert.equal(report.findings.length, 1, 'only the disagreements are listed');
  assert.equal(report.findings[0].subscriptionId, 'sub_2');
});

test('an empty walk reports zero examined, and cannot be read as a clean account', () => {
  const report = B.reconcileReport([]);
  assert.equal(report.checked, 0);
  assert.equal(report.agreed, 0);
  assert.deepEqual(report.findings, []);
});

test('the report never carries a customer record, only the two readings being compared', () => {
  // This is an owner-facing dump over every account in the deployment. An allowlist of fields is
  // what keeps it a comparison rather than an export of everybody's billing profile.
  const r = row(stripeSub({ customer_email: 'someone@acme.test', default_payment_method: 'pm_1' }), ours());
  assert.deepEqual(Object.keys(r).sort(), ['ourPlan', 'ourStatus', 'stripePlan', 'stripeStatus', 'subscriptionId', 'userId', 'verdict']);
});
