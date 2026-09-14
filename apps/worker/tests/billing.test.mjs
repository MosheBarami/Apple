// Billing: entitlement, credits, and the webhook that drives both.
//
// The webhook endpoint is public by necessity and its whole job is to RAISE someone's
// entitlements. Unverified, it is an open "give me a subscription" endpoint. These tests sign real
// payloads with Web Crypto and check that forged, stale and mismatched ones are all refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-billing-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
rmSync(out, { force: true });

const SECRET = 'whsec_test_secret_value';

/** Sign a body the way Stripe does, so the round trip is real rather than mocked. */
async function sign(body, ts, secret = SECRET) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

// ---------------------------------------------------------------- signature ---

test('a correctly signed payload verifies', async () => {
  const body = JSON.stringify({ type: 'ping' });
  const ts = 1_700_000_000;
  const r = await B.verifyStripeSignature(body, await sign(body, ts), SECRET, ts);
  assert.equal(r.ok, true);
});

test('a forged signature is refused', async () => {
  const body = JSON.stringify({ type: 'ping' });
  const ts = 1_700_000_000;
  const r = await B.verifyStripeSignature(body, await sign(body, ts, 'the-wrong-secret'), SECRET, ts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mismatch/);
});

test('a tampered body invalidates a real signature', async () => {
  const ts = 1_700_000_000;
  const header = await sign(JSON.stringify({ credits: 10 }), ts);
  // Same signature, different body — the attack this exists to stop.
  const r = await B.verifyStripeSignature(JSON.stringify({ credits: 100000 }), header, SECRET, ts);
  assert.equal(r.ok, false);
});

test('a stale signature is refused, so a captured webhook cannot be replayed', async () => {
  const body = JSON.stringify({ type: 'ping' });
  const ts = 1_700_000_000;
  const header = await sign(body, ts);
  const r = await B.verifyStripeSignature(body, header, SECRET, ts + 3600);
  assert.equal(r.ok, false);
  assert.match(r.reason, /tolerance/);
});

test('a missing or malformed header is refused, never treated as absent-therefore-fine', async () => {
  assert.equal((await B.verifyStripeSignature('{}', null, SECRET, 1)).ok, false);
  assert.equal((await B.verifyStripeSignature('{}', 'garbage', SECRET, 1)).ok, false);
  assert.equal((await B.verifyStripeSignature('{}', 't=1', SECRET, 1)).ok, false);
});

// -------------------------------------------------------------- entitlement ---

test('only entitling statuses grant a plan', () => {
  const base = { ...B.FREE_SUBSCRIPTION, plan: 'builder', currentPeriodEnd: null };
  for (const status of ['active', 'trialing', 'past_due']) {
    assert.equal(B.entitlementFor({ ...base, status }), 'builder', status);
  }
  for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
    assert.equal(B.entitlementFor({ ...base, status }), 'free', status);
  }
});

test('past_due still entitles — a failed renewal is usually an expired card', () => {
  // Cutting a paying customer off at the first retry is hostile and hurts recovery. Stripe moves
  // to canceled/unpaid when it actually gives up, and those do not entitle (asserted above).
  assert.equal(B.entitlementFor({ ...B.FREE_SUBSCRIPTION, plan: 'studio', status: 'past_due' }), 'studio');
});

test('a lapsed period never entitles, whatever the status says', () => {
  const sub = { ...B.FREE_SUBSCRIPTION, plan: 'builder', status: 'active', currentPeriodEnd: 1_000 };
  assert.equal(B.entitlementFor(sub, 999), 'builder', 'inside the period');
  assert.equal(B.entitlementFor(sub, 1_001), 'free', 'past the period');
});

// ------------------------------------------------------------------- events ---

test('a subscription event maps to a plan, keyed on metadata.userId', () => {
  const r = B.interpretStripeEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: 123,
                      cancel_at_period_end: false, metadata: { userId: 'u1', plan: 'builder' } } },
  });
  assert.equal(r.userId, 'u1');
  assert.equal(r.subscription.plan, 'builder');
  assert.equal(r.subscription.subscriptionId, 'sub_1');
});

test('a subscription with no userId is ignored loudly, never guessed', () => {
  // Attaching a plan to the wrong account is worse than attaching it to none.
  const r = B.interpretStripeEvent({
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_1', status: 'active', metadata: { plan: 'builder' } } },
  });
  assert.equal(r.userId, null);
  assert.match(r.ignored, /metadata\.userId/);
  assert.equal(r.subscription, undefined);
});

test('an unknown plan id falls back to free rather than granting something invented', () => {
  const r = B.interpretStripeEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 's', status: 'active', metadata: { userId: 'u1', plan: 'unlimited-god-mode' } } },
  });
  assert.equal(r.subscription.plan, 'free');
});

test('deletion lapses to free even when metadata still names a paid plan', () => {
  const r = B.interpretStripeEvent({
    type: 'customer.subscription.deleted',
    data: { object: { id: 's', status: 'active', metadata: { userId: 'u1', plan: 'studio' } } },
  });
  assert.equal(r.subscription.plan, 'free');
  assert.equal(r.subscription.status, 'canceled');
});

test('credits are granted only when the session is actually paid', () => {
  const paid = B.interpretStripeEvent({
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: { userId: 'u1', credits: '500' } } },
  });
  assert.equal(paid.creditsDelta, 500);

  const unpaid = B.interpretStripeEvent({
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'unpaid', metadata: { userId: 'u1', credits: '500' } } },
  });
  assert.equal(unpaid.creditsDelta, undefined);
  assert.match(unpaid.ignored, /payment_status/);
});

test('a negative or absurd credit value cannot mint a balance', () => {
  for (const credits of ['-500', 'NaN', '', 'Infinity']) {
    const r = B.interpretStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'paid', metadata: { userId: 'u1', credits } } },
    });
    assert.equal(r.creditsDelta, undefined, `credits=${credits}`);
  }
});
