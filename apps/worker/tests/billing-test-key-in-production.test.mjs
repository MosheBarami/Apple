/**
 * A TEST KEY IN PRODUCTION SELLS THE PRODUCT FOR FREE.
 *
 * Stripe's test mode accepts published card numbers — `4242 4242 4242 4242` is in Stripe's own
 * documentation. A production deployment holding an `sk_test_` key and reporting `checkout: true`
 * hands a real visitor a real Checkout Session, they "pay" with a number anyone can look up, the
 * webhook fires `checkout.session.completed`, and `entitlementFor` grants the plan. Nobody is
 * charged. Everybody who knows one card number has Studio.
 *
 * This is not a hypothetical that was guarded pre-emptively. The live deployment was given test
 * keys, `/api/billing/config` reported `checkout: true, purchasable: [builder, studio]`, and the
 * pricing page rendered both buy buttons — which is exactly that hole, open, until it was noticed.
 *
 * The honest failure is the smaller one: outside production a test key is the RIGHT key and works;
 * in production it is refused, and the page tells the visitor the plans cannot be bought, which is
 * true.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-testkey-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
rmSync(out, { force: true });

const base = (over = {}) => ({
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_PRICE_BUILDER: 'price_builder_1',
  STRIPE_PRICE_STUDIO: 'price_studio_1',
  ...over,
});

test('production refuses a test key, so nothing is sold for a payment that never happened', () => {
  const env = base({ STRIPE_SECRET_KEY: 'sk_test_51abc', ENVIRONMENT: 'production' });
  assert.equal(B.checkoutConfigured(env), false);
  assert.deepEqual(B.billingConfigFor(env).purchasable, [], 'a refused checkout must offer no plans either');
  assert.equal(B.billingConfigFor(env).checkout, false);
});

test('production accepts a live key', () => {
  const env = base({ STRIPE_SECRET_KEY: 'sk_live_51abc', ENVIRONMENT: 'production' });
  assert.equal(B.checkoutConfigured(env), true);
  assert.deepEqual(B.billingConfigFor(env).purchasable.sort(), ['builder', 'studio']);
});

test('outside production a test key is the correct key and is admitted', () => {
  // The guard must not make local and preview deployments untestable — that would trade one
  // silent failure for a different one.
  for (const environment of ['development', 'preview', 'staging', undefined]) {
    const env = base({ STRIPE_SECRET_KEY: 'sk_test_51abc', ...(environment ? { ENVIRONMENT: environment } : {}) });
    assert.equal(B.checkoutConfigured(env), true, `a test key should work when ENVIRONMENT is ${environment}`);
  }
});

test('the webhook secret is still required, whatever the key', () => {
  // The older property, kept: entitlement comes only from the webhook, so a deployment that
  // cannot verify one must not offer checkout even with a perfectly good live key.
  const env = base({ STRIPE_SECRET_KEY: 'sk_live_51abc', ENVIRONMENT: 'production', STRIPE_WEBHOOK_SECRET: '' });
  assert.equal(B.checkoutConfigured(env), false);
});

test('every kind of test key is refused, not just the secret one', () => {
  // Stripe mints restricted keys as well, and `rk_test_` is as much a test key as `sk_test_`. The
  // first version of this guard checked `sk_test_` only, and this test was written to document
  // that hole — which is a bad reason to keep a hole when closing it is one regex.
  for (const key of ['sk_test_51abc', 'rk_test_51abc', 'pk_test_51abc']) {
    assert.equal(B.checkoutConfigured(base({ STRIPE_SECRET_KEY: key, ENVIRONMENT: 'production' })), false, key);
  }
});

test('an unrecognised LIVE key form is admitted rather than refused on suspicion', () => {
  // The rule is "a test key is refused", not "only sk_live_ is accepted". Stripe adds key kinds,
  // and refusing what we do not recognise would break a working deployment to guard a hypothesis.
  for (const key of ['sk_live_51abc', 'rk_live_51abc', 'sk_somethingnew_51abc']) {
    assert.equal(B.checkoutConfigured(base({ STRIPE_SECRET_KEY: key, ENVIRONMENT: 'production' })), true, key);
  }
});
