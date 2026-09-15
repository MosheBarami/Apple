/**
 * THE EVENTS THE ENTITLEMENT READER THROWS AWAY, AND WHAT THE PERSON IS TOLD ABOUT THEM.
 *
 * `interpretStripeEvent` answers one question — what tier does this subscription entitle — and
 * returns `ignored` for everything that is not a subscription event or a completed checkout. That
 * is the right shape for it. It also means every payment problem and every abandoned checkout
 * arrived, was correctly ignored, and reached nobody.
 *
 * `dunning.ts` is the other half, and until now it had no test file at all: the module that decides
 * whether a customer hears about a declined card was the one module nobody fed a hostile event to.
 *
 * TWO PROPERTIES MATTER HERE and both are about NOT saying things:
 *   - a successful payment that was never in trouble is not news, and announcing every renewal
 *     trains people to ignore the channel that also carries the failures;
 *   - an event that belongs to somebody we cannot identify produces nothing, rather than a
 *     notification attached to a guess.
 *
 * Run with:  node --test tests/dunning.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-dunning-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'dunning.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const D = await import(`file://${out}`);
rmSync(out, { force: true });

const USER = 'u_1';
const invoice = (over = {}) => ({
  id: 'in_1',
  amount_due: 2000,
  currency: 'usd',
  attempt_count: 2,
  subscription_details: { metadata: { userId: USER } },
  ...over,
});
const event = (type, object) => ({ id: 'evt_1', type, data: { object } });

// --------------------------------------------------------------------- the three invoice events

test('A DECLINED CARD IS SOMEBODY WE CAN NAME, AND SAYS SERVICE CONTINUES', () => {
  const n = D.interpretDunningEvent(event('invoice.payment_failed', invoice()));
  assert.ok(n, 'a failed invoice with a user on it must produce a notice');
  assert.equal(n.kind, 'payment_failed');
  assert.equal(n.userId, USER);
  const copy = D.dunningCopy(n);
  assert.match(`${copy.title} ${copy.body}`, /keeps working|still/i,
    'past_due keeps entitling on purpose, and a warning with no consequence stated reads as a cut-off');
  assert.match(copy.body, /20\.00 USD/, 'and the sum is the one Stripe reported');
});

test('a bank confirmation request is its own sentence, not a decline', () => {
  const n = D.interpretDunningEvent(event('invoice.payment_action_required', invoice()));
  assert.equal(n.kind, 'action_required');
  const copy = D.dunningCopy(n);
  assert.match(`${copy.title} ${copy.body}`, /bank/i);
});

test('THE ALL-CLEAR IS SENT, BUT ONLY FOR A PAYMENT THAT HAD ACTUALLY FAILED', () => {
  // Stripe sends invoice.payment_succeeded for every ordinary renewal. Announcing each one teaches
  // the person to ignore the channel that also carries the declines.
  const ordinary = D.interpretDunningEvent(event('invoice.payment_succeeded', invoice({ attempt_count: 1 })));
  assert.equal(ordinary, null, 'a first-attempt success is not news');
  const recovered = D.interpretDunningEvent(event('invoice.payment_succeeded', invoice({ attempt_count: 3 })));
  assert.equal(recovered.kind, 'payment_recovered', 'a retry that finally worked is');
});

test('an event about nobody we can identify produces nothing at all', () => {
  const orphan = D.interpretDunningEvent(event('invoice.payment_failed', invoice({ subscription_details: {} })));
  assert.equal(orphan, null, 'a notification attached to a guessed account is worse than none');
});

test('the metadata on the INVOICE is read as well as the subscription\'s', () => {
  // An invoice does not inherit metadata from its subscription; Stripe copies it onto
  // subscription_details.metadata. Reading only one shape finds nobody on most real events.
  const own = D.interpretDunningEvent(event('invoice.payment_failed',
    invoice({ subscription_details: {}, metadata: { userId: 'u_own' } })));
  assert.equal(own.userId, 'u_own');
});

test('an unreadable amount stays unreadable rather than becoming a plausible 0.00', () => {
  const n = D.interpretDunningEvent(event('invoice.payment_failed', invoice({ amount_due: null })));
  assert.equal(n.amountDue, null);
  assert.doesNotMatch(D.dunningCopy(n).body, /0\.00|null|NaN|undefined/,
    'a missing figure must not be printed as a real one');
});

test('a forged type cannot reach a kind through the prototype chain', () => {
  assert.equal(D.interpretDunningEvent(event('constructor', invoice())), null);
  assert.equal(D.interpretDunningEvent(event('toString', invoice())), null);
});

test('every kind produces copy, so a new one cannot land with nothing to say', () => {
  for (const kind of D.DUNNING_KINDS) {
    const copy = D.dunningCopy({ kind, userId: USER, eventId: 'e', subjectId: 's', amountDue: null, currency: null, attempt: null });
    assert.ok(copy && copy.title.length > 0 && copy.body.length > 0, `${kind} produced no copy`);
    assert.doesNotMatch(`${copy.title} ${copy.body}`, /undefined|null|NaN/, `${kind} rendered a missing field`);
  }
});

// ------------------------------------------------------------------- the checkout nobody finished

/**
 * A CHECKOUT THAT LAPSES PRODUCED NO STATE, NO NOTICE AND NO RECORD.
 *
 * The page knows `?checkout=done` and `?checkout=cancelled` — both of which require the user to come
 * back through the redirect. Someone who opens Stripe's page, gets interrupted, and closes the tab
 * hits neither: the session simply expires. Nothing was charged, and nothing said so, so the next
 * thing that account hears about the plan it tried to buy is silence.
 */
test('AN EXPIRED CHECKOUT IS SOMETHING THE PERSON IS TOLD ABOUT', () => {
  const n = D.interpretDunningEvent(event('checkout.session.expired', {
    id: 'cs_test_1',
    metadata: { userId: USER },
    currency: 'usd',
  }));
  assert.ok(n, 'the session carries metadata.userId, so there is somebody to tell');
  assert.equal(n.kind, 'checkout_expired');
  assert.equal(n.userId, USER);
  assert.equal(n.subjectId, 'cs_test_1', 'the SESSION is the dedupe subject, not the event');
});

test('and is told, in the same breath, that nothing was charged and where to start again', () => {
  const n = D.interpretDunningEvent(event('checkout.session.expired', { id: 'cs_1', metadata: { userId: USER } }));
  const copy = D.dunningCopy(n);
  assert.match(`${copy.title} ${copy.body}`, /nothing (?:was|has been) charged/i,
    'the one sentence that stops this reading as a failed payment');
  assert.match(copy.body, /again/i, 'and it must say the purchase can simply be restarted');
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /declin|failed|problem/i,
    'an abandoned checkout is not a payment failure, and alarming copy about one is a false alarm');
});

test('an expired checkout for nobody we can name is dropped, like every other orphan', () => {
  assert.equal(D.interpretDunningEvent(event('checkout.session.expired', { id: 'cs_1' })), null);
});

test('a COMPLETED checkout is not a dunning event — the entitlement path owns it', () => {
  // Both readers see every event. If this one claimed the completed session too, a successful
  // purchase would raise a billing alert beside the plan it just granted.
  assert.equal(D.interpretDunningEvent(event('checkout.session.completed',
    { id: 'cs_1', payment_status: 'paid', metadata: { userId: USER } })), null);
});
