// THE ONLY BILLING ALARM THE PRODUCT HAS, AND NOTHING WAS CHECKING IT.
//
// `billing.ts:60` keeps `past_due` ENTITLING on purpose: a failed renewal is usually an expired
// card, and cutting a paying customer off at the first retry is worse service than carrying them
// through it. The price of that generosity is that the failure is otherwise INVISIBLE — a card
// fails, Stripe retries it over a fortnight, the subscription lapses to free at the end of it, and
// the person is never told. `dunning.ts` exists to close exactly that, and it is the sole path
// from "your card was declined" to anything the user can see.
//
// It had no test file at all. Every part of it was load-bearing and unverified:
//
//   * EVENT_TO_KIND, so a Stripe event-name change would silently stop the alarm;
//   * the user-id extraction, which has to read `subscription_details.metadata` because an invoice
//     does NOT inherit the subscription's `metadata` — the obvious implementation finds nobody on
//     the overwhelming majority of real dunning events;
//   * the invoice id as the dedupe subject, which is what turns three retries of one card into one
//     line with a count rather than three alarms;
//   * `dunningCopy`, which is the actual text a paying customer reads at the worst moment of their
//     relationship with this product.
//
// Modelled on billing.test.mjs, which bundles the module under test the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-dunning-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'dunning.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const D = await import(`file://${out}`);
rmSync(out, { force: true });

/** An invoice event shaped the way Stripe actually sends one. */
const invoice = (type, obj = {}) => ({
  id: 'evt_1',
  type,
  data: {
    object: {
      id: 'in_9000',
      amount_due: 1200,
      currency: 'usd',
      attempt_count: 2,
      subscription_details: { metadata: { userId: 'u-payer' } },
      ...obj,
    },
  },
});

/* ------------------------------------------------------------ which events count --- */

test('the three invoice events become the three kinds, and nothing else does', () => {
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_failed')).kind, 'payment_failed');
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_action_required')).kind, 'action_required');
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_succeeded')).kind, 'payment_recovered');
  // Non-vacuity: the kinds asserted above must be the whole declared set, or this test is checking
  // a subset of a list that has grown.
  assert.deepEqual([...D.DUNNING_KINDS].sort(), ['action_required', 'payment_failed', 'payment_recovered']);
});

test('a subscription event is not a dunning event, because a second opinion about a plan is a bug', () => {
  // `interpretStripeEvent` owns entitlement and reads these; nothing here may also answer for them,
  // or a failed card could quietly move somebody's tier.
  for (const type of [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'checkout.session.completed',
    'ping',
    '',
  ]) {
    assert.equal(D.interpretDunningEvent(invoice(type)), null, `${type} was read as a payment problem`);
  }
});

test('a forged event type cannot reach a kind through the prototype chain', () => {
  // `EVENT_TO_KIND['constructor']` is truthy on a bare index, and would put a Function where a
  // notification kind belongs.
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(D.interpretDunningEvent(invoice(type)), null, `${type} produced a kind`);
  }
});

test('junk in place of an event is null rather than a throw on the webhook path', () => {
  for (const bad of [null, undefined, 42, 'invoice.payment_failed', [], {}]) {
    assert.equal(D.interpretDunningEvent(bad), null);
  }
});

/* --------------------------------------------------------------- whose card it is --- */

test('the user id is read from subscription_details, where Stripe actually puts it', () => {
  // An invoice does NOT inherit the subscription's metadata; Stripe copies it here. Reading only
  // `metadata` — which is right for the subscription events — finds nobody on a real dunning event.
  const n = D.interpretDunningEvent(invoice('invoice.payment_failed'));
  assert.equal(n.userId, 'u-payer');
});

test('an id set on the invoice itself wins, and either place is enough', () => {
  const own = D.interpretDunningEvent(
    invoice('invoice.payment_failed', { metadata: { userId: 'u-own' } }),
  );
  assert.equal(own.userId, 'u-own');
  const onlySub = D.interpretDunningEvent(
    invoice('invoice.payment_failed', { metadata: {} }),
  );
  assert.equal(onlySub.userId, 'u-payer');
});

test('an event with nobody to tell is null, not a notification addressed to the empty string', () => {
  // A row with recipient_id '' is a notification in nobody's inbox that still counts against
  // nobody's badge. The store binds the recipient into every clause, so it would simply be unread
  // forever — and the person whose card failed would still never be told.
  for (const obj of [
    { subscription_details: {}, metadata: {} },
    { subscription_details: { metadata: { userId: '' } } },
    { subscription_details: { metadata: { userId: 42 } } },
    {},
  ]) {
    const n = D.interpretDunningEvent({ id: 'evt_1', type: 'invoice.payment_failed', data: { object: obj } });
    assert.equal(n, null, `${JSON.stringify(obj)} produced a notice with no real recipient`);
  }
});

/* ----------------------------------------------------------------- the dedupe key --- */

test('the invoice id rides along, because it is what makes three retries one line', () => {
  // notify() uses it as the dedupe subject. Without it, each of Stripe's retries of the SAME card
  // is a separate alarm about the same problem.
  const n = D.interpretDunningEvent(invoice('invoice.payment_failed'));
  assert.equal(n.invoiceId, 'in_9000');
  assert.equal(n.eventId, 'evt_1');
});

test('a missing invoice id is null so the caller can fall back, not an invented one', () => {
  const n = D.interpretDunningEvent(invoice('invoice.payment_failed', { id: undefined }));
  assert.equal(n.invoiceId, null);
  assert.equal(n.eventId, 'evt_1', 'the event id is the fallback subject the route uses');
});

test('the route uses the invoice as the dedupe subject and falls back to the event', () => {
  // Read from the source: the coalescing property lives in the call site, not in this module.
  const index = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  assert.match(index, /interpretDunningEvent\(event\)/, 'the webhook no longer interprets dunning events');
  assert.match(
    index,
    /kind: 'billing_issue'[\s\S]{0,200}subject: dunning\.invoiceId \?\? dunning\.eventId/,
    'the billing alarm must dedupe on the invoice',
  );
});

/* ----------------------------------------------------- the all-clear, and its guard --- */

test('an ordinary renewal is not announced, because it was never in trouble', () => {
  // Stripe sends `invoice.payment_succeeded` for EVERY renewal. Announcing each one teaches people
  // to ignore the channel that also carries the failures.
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_succeeded', { attempt_count: 1 })), null);
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_succeeded', { attempt_count: undefined })), null);
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_succeeded', { attempt_count: 0 })), null);
});

test('a recovery after a real failure IS announced', () => {
  // A product that announces the problem and never announces the fix teaches people to distrust
  // the announcement.
  const n = D.interpretDunningEvent(invoice('invoice.payment_succeeded', { attempt_count: 3 }));
  assert.equal(n.kind, 'payment_recovered');
  assert.equal(n.attempt, 3);
});

/* -------------------------------------------------------------- unreadable numbers --- */

test('an unreadable amount stays unreadable instead of becoming a plausible zero', () => {
  // Number(null) is 0 and Number('') is 0. "Your charge for 0.00 USD was declined" is a sentence
  // the product would say with total confidence and no basis.
  const n = D.interpretDunningEvent(invoice('invoice.payment_failed', { amount_due: null, currency: null, attempt_count: '2' }));
  assert.equal(n.amountDue, null);
  assert.equal(n.currency, null);
  assert.equal(n.attempt, null);
  assert.equal(D.formatAmount(null, 'usd'), null);
  assert.equal(D.formatAmount(1200, null), null);
});

test('an amount that IS readable is minor units turned into money', () => {
  assert.equal(D.formatAmount(1200, 'usd'), '12.00 USD');
  assert.equal(D.formatAmount(999, 'eur'), '9.99 EUR');
  assert.equal(D.formatAmount(0, 'gbp'), '0.00 GBP');
});

/* ----------------------------------------------------------------------- the words --- */

test('every dunning kind has a title and a body, and neither is empty', () => {
  for (const kind of D.DUNNING_KINDS) {
    const copy = D.dunningCopy({ kind, userId: 'u', eventId: 'evt', invoiceId: 'in', amountDue: 1200, currency: 'usd', attempt: 2 });
    assert.ok(copy.title.length > 10, `${kind} has no title`);
    assert.ok(copy.body.length > 20, `${kind} has no body`);
    assert.ok(!/undefined|null|NaN/.test(copy.title + copy.body), `${kind} leaked a placeholder into the copy`);
    // Every kind is about a specific charge, so every kind names it. A body that dropped the
    // amount would be an alarm the reader cannot match against their statement.
    assert.ok(copy.body.includes('12.00 USD'), `${kind} does not name the amount it is about`);
  }
});

test('the copy names the amount when it is known and says nothing about it when it is not', () => {
  const known = D.dunningCopy({ kind: 'payment_failed', amountDue: 1200, currency: 'usd' });
  assert.match(known.body, /12\.00 USD/);
  const unknown = D.dunningCopy({ kind: 'payment_failed', amountDue: null, currency: null });
  assert.ok(!/ for /.test(unknown.body), 'an unknown amount must not render as "for "');
  assert.ok(unknown.body.length > 20, 'and the sentence still has to read');
});

test('the failure copy says what happens next, which is the only part that changes behaviour', () => {
  // `past_due` keeps entitling. Saying so is both honest and calming, and it is the difference
  // between an alarm with an action behind it and one without.
  const copy = D.dunningCopy({ kind: 'payment_failed', amountDue: null, currency: null });
  assert.match(copy.body, /keeps working|retried/i, 'the grace period is the whole point of telling them');
  // And it must not claim the opposite. ENTITLING_STATUSES in billing.ts keeps past_due entitling
  // on purpose; copy saying the plan was suspended would be a false alarm about our own behaviour,
  // and it is the sentence a frightened customer acts on first.
  assert.doesNotMatch(copy.body, /suspend|cancelled|canceled|cut off|lost access/i,
    'the copy must not announce a cutoff that billing.ts deliberately does not perform');
});
