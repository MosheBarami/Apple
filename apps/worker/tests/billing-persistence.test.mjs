/**
 * QuotaDO AS THE BILLING RECORD, EXECUTED.
 *
 * Three defects, all of them invisible from the pure billing tests because they live in the half
 * that writes things down.
 *
 * 1. EVERYTHING BUT THE PLAN WAS DISCARDED. `interpretStripeEvent` read status, currentPeriodEnd
 *    and cancelAtPeriodEnd; `/set-plan` persisted `plan` and `stripeCustomerId`. So after the
 *    webhook returned, nothing in the product could tell a subscription that renews from one that
 *    cancels at the period end, or say when either happens.
 *
 * 2. A RETRIED WEBHOOK CREDITED TWICE. Stripe redelivers an event whose response it did not get,
 *    and `/grant-credits` is additive. The 300-second signature tolerance bounds the window; it
 *    does not make the second delivery a no-op. Inside that window one purchase granted two
 *    balances, and the machinery to stop it already existed for the public API and was never wired
 *    to the one endpoint that hands out money.
 *
 * 3. NOTHING RECORDED THAT A PLAN HAD CHANGED. `plan` was overwritten in place, so "when did this
 *    account go from Studio to Free, and on which Stripe event" had no answer on our side at all.
 *
 * WHAT THE FAKE IS. The sql fake below MODELS the two tables rather than returning constants: rows
 * go in, and the same queries the DO issues filter those rows back out. A fake that answered a
 * constant would make every assertion here pass against any implementation, which is the failure
 * mode this repo names — an assertion satisfied by a broken state.
 *
 * Run with:  node --test tests/billing-persistence.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'billing-do-'));
const out = join(TMP, 'quota.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'quota.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { QuotaDO } = await import(`file://${out}`);

// The pure reader, so the record this DO writes is checked against the thing that reads it rather
// than against a literal in this file.
const billingOut = join(TMP, 'billing.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + billingOut],
  { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${billingOut}`);

function quota(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ledger = [];
  const events = [];
  const applied = [];
  const empty = { toArray: () => [], one: () => null };
  const sql = {
    exec(q, ...a) {
      if (/^\s*create table/i.test(q)) return empty;
      if (/insert into ledger/i.test(q)) { ledger.push({ day: a[0], kind: a[1], credits: a[2] }); return empty; }
      if (/insert into billing_events/i.test(q)) {
        // `id` is modelled because the real query breaks ties on it. Two changes inside one
        // millisecond share an `at`, and a fake that sorted on `at` alone would return them in an
        // order the database never would — the assertion would then be about the fake.
        // `cancel_at_period_end` is stored as SQLite sees it — 0, 1 or null — rather than as a
        // boolean, so the DO's own null-check on the way back out is the thing under test.
        events.push({ id: events.length + 1, at: a[0], kind: a[1], from_plan: a[2], to_plan: a[3], status: a[4], event_id: a[5], cancel_at_period_end: a[6] ?? null });
        return empty;
      }
      // The migration, which the real table needs because `create table if not exists` cannot add a
      // column to a table that already exists. Modelled as a no-op: these rows are objects.
      if (/^\s*alter table/i.test(q)) return empty;
      if (/insert into applied_events/i.test(q)) { applied.push({ event_id: a[0], at: a[1] }); return empty; }
      if (/from applied_events where event_id/i.test(q)) {
        const hit = applied.filter((r) => r.event_id === a[0]);
        return { toArray: () => hit, one: () => hit[0] ?? null };
      }
      if (/delete from applied_events where at </i.test(q)) {
        for (let i = applied.length - 1; i >= 0; i--) if (applied[i].at < a[0]) applied.splice(i, 1);
        return empty;
      }
      if (/from billing_events/i.test(q)) {
        const rows = [...events].sort((x, y) => y.at - x.at || y.id - x.id);
        return { toArray: () => rows, one: () => rows[0] ?? null };
      }
      if (/delete from ledger where day </i.test(q)) { for (let i = ledger.length - 1; i >= 0; i--) if (ledger[i].day < a[0]) ledger.splice(i, 1); return empty; }
      if (/delete from ledger where day =/i.test(q)) { for (let i = ledger.length - 1; i >= 0; i--) if (ledger[i].day === a[0]) ledger.splice(i, 1); return empty; }
      if (/where day = \?/.test(q)) return { one: () => ({ s: ledger.filter((r) => r.day === a[0]).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      if (/where day like \?/.test(q)) { const p = String(a[0]).replace('%', ''); return { one: () => ({ s: ledger.filter((r) => r.day.startsWith(p)).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] }; }
      if (/group by day/i.test(q)) return empty;
      return { toArray: () => [], one: () => ({ s: 0 }) };
    },
  };
  const storage = {
    async get(k) { const v = store.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, structuredClone(v)); else store.set(a, structuredClone(b)); },
    async delete(k) { store.delete(k); }, sql,
  };
  const o = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (p, body, method = 'POST') =>
    (await o.fetch(new Request('https://do' + p, { method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) }))).json();
  return {
    call, store, events,
    setPlan: (body) => call('/set-plan', body),
    billing: () => call('/billing', null, 'GET'),
    state: () => call('/state', null, 'GET'),
  };
}

const SUB = {
  plan: 'builder',
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  status: 'active',
  currentPeriodEnd: 1_800_000_000,
  cancelAtPeriodEnd: false,
};

// ------------------------------------------------------------------- the record is actually kept

test('CONTROL: a fresh account has no subscription and no billing history', async () => {
  // If this does not hold, every "it was written" below passes for the wrong reason.
  const q = quota();
  const b = await q.billing();
  assert.equal(b.subscription, null);
  assert.equal(b.customerId, null);
  assert.deepEqual(b.events, []);
});

test('THE WHOLE SUBSCRIPTION IS PERSISTED, not just the plan it entitles', async () => {
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: SUB.customerId, subscription: SUB, eventId: 'evt_1' });
  const b = await q.billing();
  assert.equal(b.subscription.status, 'active');
  assert.equal(b.subscription.currentPeriodEnd, SUB.currentPeriodEnd);
  assert.equal(b.subscription.cancelAtPeriodEnd, false);
  assert.equal(b.subscription.subscriptionId, 'sub_1');
  assert.equal(b.plan, 'builder', 'and the enforced plan is still written');
});

test('A CANCELLING SUBSCRIPTION SURVIVES THE ROUND TRIP AS CANCELLING', async () => {
  // The end-to-end property: what Stripe said, through the store, into the thing that renders it.
  // Before this, cancelAtPeriodEnd was read from the event and dropped on the floor, so a cancelling
  // subscription came back out of storage indistinguishable from a renewing one.
  const q = quota();
  await q.setPlan({
    plan: 'studio',
    customerId: 'cus_1',
    subscription: { ...SUB, plan: 'studio', cancelAtPeriodEnd: true },
    eventId: 'evt_2',
  });
  const view = B.subscriptionView((await q.billing()).subscription, SUB.currentPeriodEnd - 86_400);
  assert.equal(view.state, 'cancelling');
  assert.equal(view.endsAt, SUB.currentPeriodEnd);
  assert.equal(view.renewsAt, null);
});

test('the customer id is still never cleared by a plan change', async () => {
  // A cancelled customer still has invoices and a card to manage. Dropping the id would strand them
  // on Free with no way into their own billing — the behaviour that was already deliberate here.
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'e1' });
  await q.setPlan({ plan: 'free', customerId: null, subscription: { ...SUB, plan: 'free', status: 'canceled' }, eventId: 'e2' });
  const b = await q.billing();
  assert.equal(b.customerId, 'cus_1');
  assert.equal(b.plan, 'free');
});

// ------------------------------------------------------------------------------ replay protection

test('A REDELIVERED EVENT DOES NOT CREDIT THE ACCOUNT TWICE', async () => {
  const q = quota();
  const first = await q.call('/grant-credits', { credits: 500, eventId: 'evt_dup' });
  assert.equal(first.granted, 500);
  assert.equal((await q.state()).credits, 500);

  const again = await q.call('/grant-credits', { credits: 500, eventId: 'evt_dup' });
  assert.equal(again.replayed, true, 'the second delivery must announce itself as a replay');
  assert.equal(again.granted, 0);
  assert.equal((await q.state()).credits, 500, 'one purchase, one balance');
});

test('a DIFFERENT event still credits — the guard is per event, not a one-shot latch', async () => {
  // The other half of the conjunction: a deduplicator that refused everything after the first
  // purchase would pass the test above and break every top-up after the first.
  const q = quota();
  await q.call('/grant-credits', { credits: 500, eventId: 'evt_a' });
  await q.call('/grant-credits', { credits: 200, eventId: 'evt_b' });
  assert.equal((await q.state()).credits, 700);
});

test('an event with no id is still applied, rather than silently dropped', async () => {
  // Deduplication must never become a reason to lose a purchase. No id, no dedupe, still applied.
  const q = quota();
  await q.call('/grant-credits', { credits: 300 });
  assert.equal((await q.state()).credits, 300);
});

test('A REDELIVERED SUBSCRIPTION EVENT IS NOT APPLIED TWICE EITHER', async () => {
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'evt_sub' });
  const replay = await q.setPlan({ plan: 'free', customerId: 'cus_1', subscription: { ...SUB, plan: 'free', status: 'canceled' }, eventId: 'evt_sub' });
  assert.equal(replay.replayed, true);
  const b = await q.billing();
  assert.equal(b.plan, 'builder', 'a replay of the id already applied must not move the plan');
  assert.equal(b.subscription.status, 'active');
});

// ------------------------------------------------------------------------- the change is recorded

test('EVERY PLAN CHANGE IS RECORDED, with where it came from and which event caused it', async () => {
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'evt_1' });
  await q.setPlan({ plan: 'studio', customerId: 'cus_1', subscription: { ...SUB, plan: 'studio' }, eventId: 'evt_2' });
  const b = await q.billing();
  assert.equal(b.events.length, 2, 'two changes, two records');
  const [latest, first] = b.events;
  assert.equal(first.fromPlan, 'free');
  assert.equal(first.toPlan, 'builder');
  assert.equal(first.eventId, 'evt_1');
  assert.equal(latest.fromPlan, 'builder', 'the upgrade records where it came from');
  assert.equal(latest.toPlan, 'studio');
  assert.ok(latest.at > 0, 'and when');
});

test('a status change with no plan change is still recorded', async () => {
  // Going past_due does not move the plan — deliberately — but it is exactly the kind of change
  // support needs a date for.
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'evt_1' });
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, status: 'past_due' }, eventId: 'evt_2' });
  const b = await q.billing();
  assert.equal(b.events.length, 2);
  assert.equal(b.events[0].status, 'past_due');
});

test('AN EVENT THAT CHANGES NOTHING WRITES NO RECORD', async () => {
  // A log with a row per webhook delivery is not a history, it is noise — Stripe sends
  // subscription.updated for changes we do not model at all.
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'evt_1' });
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'evt_2' });
  const b = await q.billing();
  assert.equal(b.events.length, 1, 'the second event was identical and must not be recorded as a change');
});

test('the credits purchase is recorded too, so a balance can be accounted for', async () => {
  const q = quota();
  await q.call('/grant-credits', { credits: 500, eventId: 'evt_c' });
  const b = await q.billing();
  assert.equal(b.events.length, 1);
  assert.equal(b.events[0].kind, 'credits');
  assert.equal(b.events[0].eventId, 'evt_c');
});

test('a refused credit grant records nothing', async () => {
  // grant-credits clamps a negative or unreadable amount to zero. A record of a change that did not
  // happen is worse than no record.
  const q = quota();
  await q.call('/grant-credits', { credits: -50, eventId: 'evt_bad' });
  assert.deepEqual((await q.billing()).events, []);
  assert.equal((await q.state()).credits, 0);
});

// ------------------------------------------------ the two changes a customer is most likely to dispute

/**
 * A CANCELLATION CHANGES NEITHER THE PLAN NOR THE STATUS.
 *
 * Stripe reports "cancel at the end of the period" as customer.subscription.updated with status
 * still 'active' and only cancel_at_period_end flipped. The write condition here was
 * `plan changed || status changed`, so the single most disputed change a customer can make left no
 * row at all — and neither did undoing it. The history was complete about everything except the two
 * things somebody rings up about.
 */
test('A CANCELLATION IS RECORDED, though neither the plan nor the status moved', async () => {
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'evt_1' });
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, cancelAtPeriodEnd: true }, eventId: 'evt_2' });
  const b = await q.billing();
  assert.equal(b.events.length, 2, 'the cancellation is a change, and must be written down');
  assert.equal(b.events[0].cancelAtPeriodEnd, true, 'and the row must say WHICH WAY it went');
  assert.equal(b.events[0].fromPlan, 'builder', 'the tier did not move, and the row must not claim it did');
  assert.equal(b.events[0].toPlan, 'builder');
  assert.equal(b.events[0].eventId, 'evt_2');
});

test('AND SO IS UNDOING IT — a reversal is a change in the other direction', async () => {
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'e1' });
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, cancelAtPeriodEnd: true }, eventId: 'e2' });
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, cancelAtPeriodEnd: false }, eventId: 'e3' });
  const b = await q.billing();
  assert.equal(b.events.length, 3, 'three changes, three records');
  assert.equal(b.events[0].cancelAtPeriodEnd, false, 'the newest row is the reversal');
  assert.equal(b.events[1].cancelAtPeriodEnd, true, 'and the one before it is the cancellation');
});

test('A CANCELLATION REVERSED BEFORE IT EXPIRES READS AS ACTIVE AGAIN, WITH A RENEWAL DATE', async () => {
  // The affordance existed — the notice's button opens the portal — and nothing anywhere proved the
  // round trip. A user who changes their mind must come back to "renews on", not stay on "ends on".
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, cancelAtPeriodEnd: true }, eventId: 'e1' });
  const cancelling = B.subscriptionView((await q.billing()).subscription, SUB.currentPeriodEnd - 86_400);
  assert.equal(cancelling.state, 'cancelling', 'the premise: it really was cancelling first');

  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, cancelAtPeriodEnd: false }, eventId: 'e2' });
  const resumed = B.subscriptionView((await q.billing()).subscription, SUB.currentPeriodEnd - 86_400);
  assert.equal(resumed.state, 'active');
  assert.equal(resumed.renewsAt, SUB.currentPeriodEnd, 'it renews again, and the date is the one to say');
  assert.equal(resumed.endsAt, null, 'and nothing is ending any more');
});

test('a row that is not about the cancellation flag carries no opinion about it', async () => {
  // The column means "this change WAS the flag moving". A past_due row that merely carried the same
  // flag along must be null there, or the history reads "cancellation undone" over a failed payment.
  const q = quota();
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: SUB, eventId: 'e1' });
  await q.setPlan({ plan: 'builder', customerId: 'cus_1', subscription: { ...SUB, status: 'past_due' }, eventId: 'e2' });
  const b = await q.billing();
  assert.equal(b.events[0].status, 'past_due');
  assert.equal(b.events[0].cancelAtPeriodEnd, null);
});
