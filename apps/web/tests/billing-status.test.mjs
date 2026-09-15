/**
 * WHAT /usage IS ALLOWED TO SAY ABOUT A SUBSCRIPTION.
 *
 * The server now keeps status, currentPeriodEnd and cancelAtPeriodEnd instead of discarding them.
 * This is the other half: one place that turns that record into a sentence, so the page cannot
 * print two opposite readings of the same number in two places.
 *
 * THE SENTENCE THIS EXISTS TO PREVENT is "renews on 3 October" under a subscription that CANCELS on
 * 3 October. `currentPeriodEnd` means both things and the distinguishing field is a boolean that
 * nothing used to persist, so the page had no way to be right and no way to know it was wrong.
 *
 * The second is "renews on undefined". A view can legitimately carry no date — a lapsed
 * subscription whose period end Stripe never sent — and template interpolation renders that as the
 * literal text "undefined" (F-65). Every assertion below therefore reads the WHOLE sentence back,
 * rather than checking that a formatter was called.
 *
 * Run with:  node --test tests/billing-status.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'billing-copy-')), 'copy.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'billing-copy.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { billingNotice, billingChangeLine, BILLING_STATES } = await import(`file://${out}`);

const DATE = '3 October 2026';
const opts = { planName: 'Builder', formatDate: () => DATE };
const view = (over) => ({
  plan: 'builder', state: 'active', status: 'active',
  renewsAt: null, endsAt: null, hasBillingAccount: true, needsAttention: false, ...over,
});

// ------------------------------------------------------------------- the two opposite sentences

test('AN ACTIVE SUBSCRIPTION SAYS IT RENEWS, AND NAMES THE DAY', () => {
  const n = billingNotice(view({ state: 'active', renewsAt: 1_800_000_000 }), opts);
  assert.ok(n, 'an active subscription has something to say');
  assert.match(n.headline, /renews/i);
  assert.ok(n.headline.includes(DATE), `the date must be in the sentence: ${n.headline}`);
  assert.doesNotMatch(n.headline, /ends|cancel/i, 'nothing is ending');
  assert.equal(n.tone, 'info');
});

test('A CANCELLING SUBSCRIPTION SAYS IT ENDS, AND NEVER THAT IT RENEWS', () => {
  // The exact sentence that was impossible to get right before cancelAtPeriodEnd was persisted.
  const n = billingNotice(view({ state: 'cancelling', endsAt: 1_800_000_000 }), opts);
  assert.match(n.headline, /ends/i);
  assert.ok(n.headline.includes(DATE));
  assert.doesNotMatch(`${n.headline} ${n.detail ?? ''}`, /renew/i,
    'a cancelling subscription must not contain the word renew anywhere');
  assert.equal(n.tone, 'warn', 'a pending cancellation is something the user may want to undo');
  assert.ok(n.action, 'and there must be a way back to it');
});

test('a cancelling subscription still says the plan keeps working until then', () => {
  const n = billingNotice(view({ state: 'cancelling', endsAt: 1_800_000_000 }), opts);
  assert.match(`${n.headline} ${n.detail ?? ''}`, /until then|keep/i,
    'cancelling now is not losing access now, and a user reading this is deciding whether to panic');
});

// ---------------------------------------------------------------------- the states that need help

test('A FAILED RENEWAL IS STATED, AND SAYS SERVICE CONTINUES', () => {
  const n = billingNotice(view({ state: 'past_due', needsAttention: true, endsAt: 1_800_000_000 }), opts);
  assert.equal(n.tone, 'warn');
  assert.match(n.headline, /payment/i);
  assert.match(`${n.headline} ${n.detail ?? ''}`, /still/i, 'the user has not lost their plan yet');
  assert.ok(n.action, 'and the card can be fixed from here');
});

test('A PAYMENT AWAITING AUTHENTICATION SAYS NOTHING WAS CHARGED', () => {
  // The user believes they have paid. The failure mode is silence, and the second-worst outcome is
  // implying we took their money.
  const n = billingNotice(view({ plan: 'free', state: 'needs_action', needsAttention: true }), opts);
  assert.equal(n.tone, 'warn');
  assert.match(`${n.headline} ${n.detail ?? ''}`, /not been charged|nothing has been charged/i);
});

test('a lapsed subscription says so, and that the billing account is still there', () => {
  const n = billingNotice(view({ plan: 'free', state: 'lapsed', endsAt: 1_800_000_000, hasBillingAccount: true }), opts);
  assert.match(n.headline, /ended/i);
  assert.ok(n.headline.includes(DATE));
  assert.ok(n.action, 'a returning customer must be able to reach their own invoices');
});

test('a trial is described as a trial', () => {
  const n = billingNotice(view({ state: 'trialing', renewsAt: 1_800_000_000 }), opts);
  assert.match(n.headline, /trial/i);
});

test('someone who never subscribed is told nothing at all', () => {
  assert.equal(billingNotice(view({ plan: 'free', state: 'none', hasBillingAccount: false }), opts), null,
    'a free user with no history has no billing state, and inventing one is noise');
});

// ---------------------------------------------------------------------------------- exhaustiveness

test('EVERY STATE THE SERVER CAN SEND PRODUCES A SENTENCE', () => {
  // A missing branch returns null and the page silently says nothing about a failed payment. The
  // list is exported from the module under test so a new state cannot be added without appearing
  // here, and it is cross-checked against the server's own union below.
  for (const state of BILLING_STATES) {
    const n = billingNotice(view({ state, renewsAt: 1_800_000_000, endsAt: 1_800_000_000 }), opts);
    if (state === 'none') {
      assert.equal(n, null, 'none is the one state with nothing to say');
      continue;
    }
    assert.ok(n, `${state} produced no notice`);
    assert.ok(n.headline.length > 0, `${state} produced an empty headline`);
  }
});

test("THE CLIENT'S STATE LIST IS THE SERVER'S", () => {
  // Two independent lists of the same union is how a state gets added on one side and rendered as
  // nothing on the other. Read out of the worker's own type rather than copied.
  const billingTs = readFileSync(join(WEB, '..', 'worker', 'src', 'billing.ts'), 'utf8');
  const block = billingTs.slice(billingTs.indexOf('export type BillingState ='));
  const union = block.slice(0, block.indexOf(';'));
  const serverStates = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(serverStates.length >= 7, `expected the server union to parse, saw ${serverStates.length}`);
  assert.deepEqual([...BILLING_STATES].sort(), serverStates.sort());
});

// ----------------------------------------------------------------------------- the missing date

test('A SENTENCE NEVER RENDERS A MISSING DATE AS "undefined"', () => {
  // Stripe does not always send current_period_end — a subscription cancelled before its first
  // invoice has none — and `${undefined}` is the string "undefined" in a template (F-65). The whole
  // sentence is read back, because a formatter that was merely "called" proves nothing.
  const dated = { ...opts, formatDate: (s) => (Number.isFinite(s) ? DATE : 'NEVER-CALLED') };
  for (const state of BILLING_STATES) {
    if (state === 'none') continue;
    const n = billingNotice(view({ state, renewsAt: null, endsAt: null }), dated);
    const whole = `${n.headline} ${n.detail ?? ''} ${n.action ?? ''}`;
    assert.doesNotMatch(whole, /undefined|null|NaN|Invalid Date|NEVER-CALLED/,
      `${state} rendered a missing date into its copy: ${whole}`);
    assert.ok(n.headline.length > 0, `${state} must still say something without a date`);
  }
});

// ------------------------------------------------------------------------------- the manage entry

test('THE PORTAL IS OFFERED TO ANYONE WITH A BILLING ACCOUNT, INCLUDING ON FREE', () => {
  // The reactivation gap: the manage button was rendered only when the plan was not free, so a
  // cancelled customer could not reach their invoices, their card, or a resume control at all.
  const lapsed = billingNotice(view({ plan: 'free', state: 'lapsed', hasBillingAccount: true }), opts);
  assert.ok(lapsed.action, 'a lapsed customer on the free tier still has a billing account');
});

test('and never to someone who has none', () => {
  // The other half: offering a portal to a user with no Stripe customer opens nothing and 400s.
  assert.equal(billingNotice(view({ plan: 'free', state: 'none', hasBillingAccount: false }), opts), null);
});

// ------------------------------------------------------------------------------------ the history

const NAMES = { free: 'Free', builder: 'Builder', studio: 'Studio' };
const lineOpts = { planName: (id) => NAMES[id] ?? id, formatDate: () => DATE };
const change = (over) => ({ at: 1_700_000_000_000, kind: 'plan', fromPlan: 'free', toPlan: 'builder', status: 'active', eventId: 'e', ...over });

test('AN UPGRADE READS AS AN UPGRADE, WITH WHERE IT CAME FROM', () => {
  const line = billingChangeLine(change({ fromPlan: 'builder', toPlan: 'studio' }), lineOpts);
  assert.match(line, /Builder/);
  assert.match(line, /Studio/);
  assert.ok(line.includes(DATE), `the date belongs in the line: ${line}`);
});

test('A ROW WHERE THE TIER DID NOT MOVE NEVER CLAIMS IT DID', () => {
  // The webhook records past_due without moving the plan — deliberately, because a failed renewal
  // does not cut anybody off. "Moved to Builder" over that row is a false sentence about the one
  // subject a user checks against their bank statement.
  const line = billingChangeLine(change({ fromPlan: 'builder', toPlan: 'builder', status: 'past_due' }), lineOpts);
  assert.doesNotMatch(line, /moved/i, `a status change must not read as a plan change: ${line}`);
  assert.match(line, /past_due/);
});

test('a credit purchase is its own line and names no plan', () => {
  const line = billingChangeLine(change({ kind: 'credits', fromPlan: null, toPlan: null, status: null }), lineOpts);
  assert.match(line, /credits/i);
  assert.doesNotMatch(line, /Builder|Free|Studio/);
});

test('plan ids never reach the reader — they are not the words a person knows', () => {
  const line = billingChangeLine(change({ fromPlan: 'free', toPlan: 'studio' }), lineOpts);
  assert.doesNotMatch(line, /\bfree\b|\bstudio\b/, `a raw id leaked into the copy: ${line}`);
});

test('a record with nothing to say produces no line rather than an empty one', () => {
  assert.equal(billingChangeLine(change({ toPlan: null }), lineOpts), null);
  assert.equal(billingChangeLine(change({ fromPlan: 'builder', toPlan: 'builder', status: null }), lineOpts), null);
});

test('a missing timestamp never renders as "on undefined"', () => {
  const line = billingChangeLine(change({ at: NaN }), { ...lineOpts, formatDate: () => 'NEVER-CALLED' });
  assert.doesNotMatch(line, /undefined|NaN|NEVER-CALLED|Invalid Date/, line);
  assert.ok(line.length > 0, 'and still says what happened');
});
