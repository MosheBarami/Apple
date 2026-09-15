/**
 * WHAT A TIER CHANGE COSTS, ASKED BEFORE THE USER COMMITS TO IT.
 *
 * The ladder on /app/usage printed every tier's monthly price and then, for anyone already paying,
 * sent them straight to the Stripe Billing Portal. So the amount for THIS change — the prorated
 * charge today, the credit for the part of the month already paid for, the date it applies from —
 * was first seen on Stripe's own page, after the user had left the product. Nothing in this repo
 * had ever asked Stripe what a change would cost: the only two Stripe calls were checkout sessions
 * and portal sessions.
 *
 * TWO THINGS THIS FILE PINS, both of which are money.
 *
 * 1. THE PREVIEW REPLACES THE ITEM, IT DOES NOT ADD ONE. `create_preview` with only a price and no
 *    subscription ITEM id prices a subscription with TWO items on it — the old tier and the new one
 *    — and quotes their sum. That number is wrong in the direction that overstates the bill, and it
 *    is wrong in a way no eyeball catches, because it is a plausible-looking figure.
 *
 * 2. AMOUNTS ARE MINOR UNITS. Stripe says 1200 and means twelve dollars. Handing that to a price
 *    formatter renders "$1,200.00" over a $12 upgrade.
 *
 * And the refusals: a preview that cannot be taken must REFUSE, never return a zero. A zero is a
 * sentence — "this change costs nothing" — and it is the failure-to-observe rendered as an
 * observation that this codebase keeps finding.
 *
 * Run with:  node --test tests/billing-preview.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'billing-preview-')), 'billing.mjs');
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

/** A customer on Builder, with everything the preview needs to name the thing being changed. */
const RUNNING = { customerId: 'cus_1', subscriptionId: 'sub_1', itemId: 'si_1' };

const fields = (body) => Object.fromEntries(new URLSearchParams(body).entries());

// ------------------------------------------------------- the item id, which is the whole ballgame

test('THE PREVIEW REPLACES THE RUNNING ITEM RATHER THAN ADDING A SECOND ONE', () => {
  const built = B.buildInvoicePreviewRequest(LIVE, { ...RUNNING, plan: 'studio' });
  assert.equal(built.ok, true, built.error);
  const f = fields(built.body);
  // Without this key Stripe prices Builder AND Studio together and quotes their sum.
  assert.equal(f['subscription_details[items][0][id]'], 'si_1', 'the running item must be named');
  assert.equal(f['subscription_details[items][0][price]'], 'price_studio_1', 'and swapped for the target price');
  assert.equal(f['subscription'], 'sub_1');
  assert.equal(f['customer'], 'cus_1');
  assert.equal(f['subscription_details[proration_behavior]'], 'create_prorations',
    'a preview with prorations off is not a preview of this change');
});

test('the item id travels from the Stripe event, not from a guess', () => {
  const event = {
    id: 'evt_1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_9', customer: 'cus_9', status: 'active',
        current_period_end: 4_102_444_800, cancel_at_period_end: false,
        metadata: { userId: 'u1', plan: 'builder' },
        items: { data: [{ id: 'si_9', price: { id: 'price_builder_1' } }] },
      },
    },
  };
  const outcome = B.interpretStripeEvent(event, LIVE);
  assert.equal(outcome.subscription.itemId, 'si_9', 'the stored subscription must carry its item id');
});

test('a subscription that carried no items has no item id rather than a made-up one', () => {
  const event = {
    id: 'evt_2', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_9', customer: 'cus_9', status: 'active', metadata: { userId: 'u1', plan: 'builder' } } },
  };
  assert.equal(B.interpretStripeEvent(event, LIVE).subscription.itemId, null);
});

// --------------------------------------------------------------------------------- the refusals

test('A PREVIEW WITH NOTHING TO PRICE AGAINST REFUSES — it never quotes zero', () => {
  const built = B.buildInvoicePreviewRequest(LIVE, { customerId: null, subscriptionId: null, itemId: null, plan: 'studio' });
  assert.equal(built.ok, false);
  assert.equal(built.status, 400);
  assert.match(built.error, /subscription/i);
});

test('a subscription stored before the item id was kept refuses too, rather than pricing two items', () => {
  const built = B.buildInvoicePreviewRequest(LIVE, { ...RUNNING, itemId: null, plan: 'studio' });
  assert.equal(built.ok, false, 'no item id means the swap cannot be expressed');
  assert.equal(built.status, 400);
});

test('free is not a change anyone can be quoted for', () => {
  const built = B.buildInvoicePreviewRequest(LIVE, { ...RUNNING, plan: 'free' });
  assert.equal(built.ok, false);
  assert.equal(built.status, 400);
});

test('a deployment with no Stripe key says so rather than building a request it cannot send', () => {
  const built = B.buildInvoicePreviewRequest({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }, { ...RUNNING, plan: 'studio' });
  assert.equal(built.ok, false);
  assert.equal(built.status, 503);
});

// ------------------------------------------------------------------------- reading Stripe's reply

const REPLY = {
  object: 'invoice',
  amount_due: 1234,
  currency: 'usd',
  lines: {
    data: [
      { description: 'Unused time on Builder', amount: -766, proration: true, period: { start: 1_800_000_000 } },
      { description: 'Remaining time on Studio', amount: 2000, proration: true, period: { start: 1_800_000_000 } },
    ],
  },
};

test('AMOUNTS ARRIVE IN MINOR UNITS AND ARE READ AS MONEY', () => {
  const p = B.readInvoicePreview(REPLY);
  assert.equal(p.amountDue, 12.34, 'Stripe said 1234 and meant twelve dollars thirty-four');
  assert.equal(p.currency, 'USD', 'an ISO code, upper case, because that is what the formatter takes');
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines[0].amount, -7.66, 'the credit keeps its sign');
  assert.equal(p.lines[0].description, 'Unused time on Builder');
  assert.equal(p.prorationDate, 1_800_000_000, 'the day the proration is computed from');
});

test('a zero-decimal currency is not divided by a hundred', () => {
  // JPY has no minor unit. Dividing would quote ¥12 over a ¥1,200 charge.
  const p = B.readInvoicePreview({ ...REPLY, currency: 'jpy', amount_due: 1200, lines: { data: [] } });
  assert.equal(p.amountDue, 1200);
});

test('an unreadable reply is null, never an amount', () => {
  assert.equal(B.readInvoicePreview(null), null);
  assert.equal(B.readInvoicePreview({ object: 'invoice' }), null, 'no amount_due is not an amount of zero');
  assert.equal(B.readInvoicePreview({ amount_due: 'lots', currency: 'usd' }), null);
});

test('a reply with no lines still carries the amount — the total is the number that matters', () => {
  const p = B.readInvoicePreview({ amount_due: 0, currency: 'usd' });
  assert.equal(p.amountDue, 0);
  assert.deepEqual(p.lines, []);
  assert.equal(p.prorationDate, null, 'nothing was prorated, so there is no proration date to claim');
});

test('lines that are not prorations are kept but do not set the proration date', () => {
  const p = B.readInvoicePreview({
    amount_due: 2000, currency: 'usd',
    lines: { data: [{ description: 'Studio', amount: 2000, proration: false, period: { start: 1_700_000_000 } }] },
  });
  assert.equal(p.lines.length, 1);
  assert.equal(p.prorationDate, null);
});
