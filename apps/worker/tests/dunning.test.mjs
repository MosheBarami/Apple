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
// THE MODULE SINCE GREW A FOURTH KIND, and the two facts that follow from it are asserted at the
// bottom of this file. `checkout.session.expired` — a purchase somebody started and never came
// back to — is not a payment problem, so the dedupe subject is no longer always an invoice: the
// field is `subjectId`, holding the invoice for a payment event and the session for an expiry.
// A field named `invoiceId` holding `cs_…` is the kind of quiet mislabelling that survives review
// because it reads correctly, which is why the rename happened and why this file follows it.
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

/** A Checkout Session event. It carries `metadata`, and never `subscription_details`. */
const session = (type, obj = {}) => ({
  id: 'evt_1',
  type,
  data: { object: { id: 'cs_test_1', currency: 'usd', metadata: { userId: 'u-payer' }, ...obj } },
});

/* ------------------------------------------------------------ which events count --- */

test('the invoice events become their kinds, and nothing else does', () => {
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_failed')).kind, 'payment_failed');
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_action_required')).kind, 'action_required');
  assert.equal(D.interpretDunningEvent(invoice('invoice.payment_succeeded')).kind, 'payment_recovered');
  assert.equal(D.interpretDunningEvent(session('checkout.session.expired')).kind, 'checkout_expired');
  // Non-vacuity: the kinds asserted above must be the whole declared set, or this test is checking
  // a subset of a list that has grown.
  assert.deepEqual([...D.DUNNING_KINDS].sort(),
    ['action_required', 'checkout_expired', 'payment_failed', 'payment_recovered']);
});

test('a subscription event is not a dunning event, because a second opinion about a plan is a bug', () => {
  // `interpretStripeEvent` owns entitlement and reads these; nothing here may also answer for them,
  // or a failed card could quietly move somebody's tier.
  for (const type of [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'ping',
    '',
  ]) {
    assert.equal(D.interpretDunningEvent(invoice(type)), null, `${type} was read as a payment problem`);
  }
});

test('a COMPLETED checkout is not a dunning event — the entitlement path owns it', () => {
  // Both readers see every event. If this one claimed the completed session too, a successful
  // purchase would raise a billing alert beside the plan it just granted.
  assert.equal(D.interpretDunningEvent(session('checkout.session.completed', { payment_status: 'paid' })), null);
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

test('an expired checkout for nobody we can name is dropped, like every other orphan', () => {
  assert.equal(D.interpretDunningEvent(session('checkout.session.expired', { metadata: {} })), null);
});

/* ----------------------------------------------------------------- the dedupe key --- */

test('the invoice id rides along, because it is what makes three retries one line', () => {
  // notify() uses it as the dedupe subject. Without it, each of Stripe's retries of the SAME card
  // is a separate alarm about the same problem.
  const n = D.interpretDunningEvent(invoice('invoice.payment_failed'));
  assert.equal(n.subjectId, 'in_9000');
  assert.equal(n.eventId, 'evt_1');
});

test('for an expired checkout the SESSION is the subject, not the event', () => {
  const n = D.interpretDunningEvent(session('checkout.session.expired'));
  assert.equal(n.subjectId, 'cs_test_1');
  assert.equal(n.eventId, 'evt_1');
});

test('a missing subject id is null so the caller can fall back, not an invented one', () => {
  const n = D.interpretDunningEvent(invoice('invoice.payment_failed', { id: undefined }));
  assert.equal(n.subjectId, null);
  assert.equal(n.eventId, 'evt_1', 'the event id is the fallback subject the route uses');
});

test('the route uses the subject as the dedupe key and falls back to the event', () => {
  // Read from the source: the coalescing property lives in the call site, not in this module.
  const index = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  assert.match(index, /interpretDunningEvent\(event\)/, 'the webhook no longer interprets dunning events');
  assert.match(
    index,
    /kind: 'billing_issue'[\s\S]{0,200}subject: dunning\.subjectId \?\? dunning\.eventId/,
    'the billing alarm must dedupe on what the notice is about',
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

/**
 * THE KINDS THAT ARE NOT ABOUT A CHARGE, LISTED RATHER THAN SKIPPED.
 *
 * "every kind names the amount" was true of the three payment kinds and became false the moment a
 * fourth arrived: `checkout_expired` is a purchase somebody abandoned, nothing was charged, and a
 * figure in that sentence would invent a transaction. The rule below is therefore scoped — but by
 * an EXPLICIT list, not by dropping the assertion, so a new kind still has to be classified on
 * purpose and cannot escape the rule by existing. What this one says instead is pinned by
 * 'an expired checkout is told...' at the foot of this file.
 */
const KINDS_WITHOUT_A_CHARGE = ['checkout_expired'];

test('every dunning kind has a title and a body, and neither is empty', () => {
  for (const kind of D.DUNNING_KINDS) {
    const copy = D.dunningCopy({ kind, userId: 'u', eventId: 'evt', subjectId: 'in', amountDue: 1200, currency: 'usd', attempt: 2 });
    assert.ok(copy.title.length > 10, `${kind} has no title`);
    assert.ok(copy.body.length > 20, `${kind} has no body`);
    assert.ok(!/undefined|null|NaN/.test(copy.title + copy.body), `${kind} leaked a placeholder into the copy`);
  }
});

test('a kind that IS about a charge names the charge, so the reader can match it to a statement', () => {
  // Non-vacuity first: the exemption list has to name real kinds, and something has to be left to
  // check. An exemption that quietly covered the whole set would make this test pass by testing
  // nothing at all.
  for (const kind of KINDS_WITHOUT_A_CHARGE) {
    assert.ok(D.DUNNING_KINDS.includes(kind), `${kind} is exempted from a rule it is not subject to`);
  }
  const charged = D.DUNNING_KINDS.filter((k) => !KINDS_WITHOUT_A_CHARGE.includes(k));
  assert.ok(charged.length > 0, 'every kind is exempt, so this asserts nothing');

  for (const kind of charged) {
    const copy = D.dunningCopy({ kind, userId: 'u', eventId: 'evt', subjectId: 'in', amountDue: 1200, currency: 'usd', attempt: 2 });
    // A body that dropped the amount would be an alarm the reader cannot match against their
    // statement.
    assert.ok(copy.body.includes('12.00 USD'), `${kind} does not name the amount it is about`);
  }
});

test('and does so with every field missing, so a new kind cannot land with nothing to say', () => {
  for (const kind of D.DUNNING_KINDS) {
    const copy = D.dunningCopy({ kind, userId: 'u', eventId: null, subjectId: null, amountDue: null, currency: null, attempt: null });
    assert.ok(copy && copy.title.length > 0 && copy.body.length > 0, `${kind} produced no copy`);
    assert.doesNotMatch(`${copy.title} ${copy.body}`, /undefined|null|NaN/, `${kind} rendered a missing field`);
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

test('a bank confirmation request is its own sentence, not a decline', () => {
  const n = D.interpretDunningEvent(invoice('invoice.payment_action_required'));
  assert.equal(n.kind, 'action_required');
  assert.match(`${D.dunningCopy(n).title} ${D.dunningCopy(n).body}`, /bank/i);
});

/* ------------------------------------------------- the checkout nobody came back to --- */

/**
 * A CHECKOUT THAT LAPSES PRODUCED NO STATE, NO NOTICE AND NO RECORD.
 *
 * The page knows `?checkout=done` and `?checkout=cancelled` — both of which require the user to come
 * back through the redirect. Someone who opens Stripe's page, gets interrupted, and closes the tab
 * hits neither: the session simply expires. Nothing was charged, and nothing said so, so the next
 * thing that account hears about the plan it tried to buy is silence.
 */
test('an expired checkout is told, in the same breath, that nothing was charged and where to start again', () => {
  const n = D.interpretDunningEvent(session('checkout.session.expired'));
  const copy = D.dunningCopy(n);
  assert.match(`${copy.title} ${copy.body}`, /nothing (?:was|has been) charged/i,
    'the one sentence that stops this reading as a failed payment');
  assert.match(copy.body, /again/i, 'and it must say the purchase can simply be restarted');
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /declin|failed|problem/i,
    'an abandoned checkout is not a payment failure, and alarming copy about one is a false alarm');
});
