/**
 * THE FAILED-PAYMENT PATH, WHICH WAS BUILT AND NEVER PROVEN.
 *
 * `dunning.ts` is what turns Stripe's invoice events into the one sentence a customer whose card
 * expired ever sees. It was wired into the webhook and had no test of any kind, which is the worst
 * combination available: a mechanism the product depends on, with nothing that would notice when it
 * stops working. Three of its decisions are load-bearing and each one fails SILENTLY — the person
 * is simply never told — so none of them would ever show up as a bug report.
 *
 *   1. AN INVOICE DOES NOT INHERIT THE SUBSCRIPTION'S METADATA. Stripe copies it onto
 *      `subscription_details.metadata` instead. Reading only `metadata` — which is exactly what the
 *      subscription interpreter does, correctly, for its own events — finds nothing on the
 *      overwhelming majority of real dunning events, and "nothing" here means nobody is notified.
 *   2. A FIRST-ATTEMPT `invoice.payment_succeeded` IS NOT NEWS. Stripe sends one for every ordinary
 *      renewal. Announcing each would train people to ignore the channel that also carries the
 *      failures, which is the channel this product uses to say a card has expired.
 *   3. A FORGED `type` OF 'constructor' MUST NOT RESOLVE THROUGH THE PROTOTYPE CHAIN. The webhook
 *      body is attacker-shaped input; a bare index into the event map would hand back a Function
 *      where a DunningKind belongs.
 *
 * Run with:  node --test tests/dunning.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
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

const USER = 'u_dunning';
/** A Stripe invoice event, shaped the way Stripe actually shapes one. */
const invoiceEvent = (type, object = {}) => ({
  id: 'evt_dun_1',
  type,
  data: {
    object: {
      id: 'in_1',
      amount_due: 2900,
      currency: 'usd',
      attempt_count: 2,
      subscription_details: { metadata: { userId: USER } },
      ...object,
    },
  },
});

// ------------------------------------------------------------ where the user id actually lives

test('THE USER IS FOUND ON subscription_details.metadata, which is where Stripe puts it', () => {
  // The defect this pins: an invoice does NOT carry the subscription's metadata on `metadata`.
  // A reader that looks only there finds nobody on almost every real dunning event, and nobody
  // found means nobody told — a card silently expires and the product says nothing for a fortnight.
  const n = D.interpretDunningEvent(invoiceEvent('invoice.payment_failed'));
  assert.ok(n, 'a real Stripe dunning event must be attributable');
  assert.equal(n.userId, USER);
  assert.equal(n.kind, 'payment_failed');
  assert.equal(n.invoiceId, 'in_1', 'the INVOICE is the dedupe subject, so it has to come back');
  assert.equal(n.eventId, 'evt_dun_1');
});

test("the invoice's own metadata wins when it has one, and neither shape is required", () => {
  const own = D.interpretDunningEvent(
    invoiceEvent('invoice.payment_failed', { metadata: { userId: 'u_on_the_invoice' } }),
  );
  assert.equal(own.userId, 'u_on_the_invoice');

  const neither = D.interpretDunningEvent(
    invoiceEvent('invoice.payment_failed', { subscription_details: {}, metadata: {} }),
  );
  assert.equal(neither, null, 'an invoice that names nobody is not ours, and is not an error');
});

// ------------------------------------------------------------------- what is NOT worth saying

test('A FIRST-ATTEMPT SUCCESS IS NOT NEWS — every renewal sends one', () => {
  // Stripe fires invoice.payment_succeeded on every ordinary monthly renewal. If each became a
  // notification, the inbox would be mostly noise and the one message that matters — your card
  // failed — would be the one nobody reads.
  const first = D.interpretDunningEvent(invoiceEvent('invoice.payment_succeeded', { attempt_count: 1 }));
  assert.equal(first, null);

  const noCount = D.interpretDunningEvent(invoiceEvent('invoice.payment_succeeded', { attempt_count: undefined }));
  assert.equal(noCount, null, 'an unreadable attempt count is not evidence of a recovery');

  const recovered = D.interpretDunningEvent(invoiceEvent('invoice.payment_succeeded', { attempt_count: 3 }));
  assert.ok(recovered, 'but a retry that finally worked IS news');
  assert.equal(recovered.kind, 'payment_recovered');
});

test('the events billing.ts owns are ignored here — neither decides what the other decides', () => {
  for (const type of ['customer.subscription.updated', 'checkout.session.completed', 'invoice.created']) {
    assert.equal(D.interpretDunningEvent({ id: 'e', type, data: { object: { metadata: { userId: USER } } } }), null,
      `${type} is not a dunning event`);
  }
});

// ------------------------------------------------------------------------- forged and malformed

test('A FORGED TYPE OF "constructor" RETURNS NULL, not a Function', () => {
  // The webhook body is attacker-shaped input. `EVENT_TO_KIND['constructor']` is truthy through the
  // prototype chain, so a bare index would put a Function where a DunningKind belongs and the
  // notification title would be rendered from it.
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(D.interpretDunningEvent({ id: 'e', type, data: { object: { metadata: { userId: USER } } } }), null,
      `a type of "${type}" must not resolve through the prototype chain`);
  }
});

test('nothing here throws on rubbish', () => {
  for (const junk of [null, undefined, 0, '', 'invoice.payment_failed', [], { type: 'invoice.payment_failed' }]) {
    assert.equal(D.interpretDunningEvent(junk), null);
  }
});

// ------------------------------------------------------------------------------- what it says

test('AN UNREADABLE AMOUNT IS OMITTED, never rendered as a plausible figure', () => {
  // `Number(null)` is 0 and `Number('')` is 0. A 0 here would print "for 0.00 USD was declined",
  // which is a real-looking sentence about a charge that did not happen.
  assert.equal(D.formatAmount(null, 'usd'), null);
  assert.equal(D.formatAmount(2900, null), null);
  assert.equal(D.formatAmount(2900, 'usd'), '29.00 USD');

  const blank = D.interpretDunningEvent(invoiceEvent('invoice.payment_failed', { amount_due: null, currency: null }));
  const copy = D.dunningCopy(blank);
  assert.doesNotMatch(copy.body, /0\.00|null|undefined|NaN/, copy.body);
  assert.match(copy.body, /declined/i, 'and it still says what happened');
});

test('EVERY KIND HAS COPY, and none of it renders an absent field', () => {
  for (const kind of D.DUNNING_KINDS) {
    const copy = D.dunningCopy({ kind, userId: USER, eventId: 'e', invoiceId: 'in_1', amountDue: 2900, currency: 'usd', attempt: 2 });
    assert.ok(copy.title.length > 0 && copy.body.length > 0, `${kind} must say something`);
    assert.doesNotMatch(`${copy.title} ${copy.body}`, /undefined|null|NaN|\[object/, kind);
    assert.ok(copy.body.includes('29.00 USD'), `${kind} names the amount it is about`);
  }
});

test('THE FAILURE COPY SAYS THE PLAN KEEPS WORKING, because billing.ts keeps past_due entitling', () => {
  // The two halves have to agree. `ENTITLING_STATUSES` in billing.ts includes past_due on purpose;
  // copy that said "your plan has been suspended" would be a false alarm about our own behaviour,
  // and it is the sentence a frightened customer would act on first.
  const copy = D.dunningCopy({ kind: 'payment_failed', userId: USER, eventId: 'e', invoiceId: 'in_1', amountDue: 2900, currency: 'usd', attempt: 1 });
  assert.match(copy.body, /keeps working/i);
  assert.doesNotMatch(copy.body, /suspend|cancelled|canceled|cut off|lost access/i);
});

// ------------------------------------------------------------ the webhook actually consults it

test('THE WEBHOOK CALLS THIS, and dedupes on the invoice rather than the event', () => {
  // A reader nothing consults is the most expensive kind of dead code: it reads like a working
  // feature in every review it survives. Three retries of ONE invoice are one problem, so the
  // notification subject must be the invoice id — dedupe on the event id would produce three
  // alarms about one card.
  const index = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(index, /interpretDunningEvent\(event\)/, 'the webhook must run the reader');
  assert.match(index, /subject: dunning\.invoiceId/, 'and dedupe on the invoice');
  assert.match(index, /kind: 'billing_issue'/, 'as a billing notification');
});
