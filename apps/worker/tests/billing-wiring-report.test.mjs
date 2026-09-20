/**
 * THE REPORT THAT SAYS WHY NOBODY CAN BE UPGRADED — AND MUST NOT SAY ANYTHING ELSE.
 *
 * `billingWiring` exists because establishing whether a Stripe event could reach BOTH quota stores
 * took four hours on 2026-09-20: `/api/billing/config` answers `{"checkout": false}` identically
 * for three unrelated situations, the webhook's refusals are deliberately mute so a prober cannot
 * learn the shape of a secret, and the answer was finally read out of Cloudflare's script-settings
 * API rather than out of the product. It is a diagnostic behind ADMIN_KEY, so it has exactly two
 * ways to be wrong and both are checked here.
 *
 * ONE: IT COULD LIE. `mutationWouldApplyToBoth` is a claim about a code path in index.ts. If the
 * webhook grows a prerequisite this function does not know about, the report says a purchase would
 * land in both stores while the route refuses it — an all-clear nobody earned, which is the exact
 * failure this repository is written against. So the ORDER of the conditions is checked against the
 * route's own source, not restated here.
 *
 * TWO: IT COULD LEAK. Every field is a boolean or a closed enum on purpose. The last test
 * serialises the whole report against distinctive secret values and asserts none of them survives —
 * including the key PREFIX, because `sk_live_` in a report is a fact about the account.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'apple-billing-wiring-'));
const OUT = join(TMP, 'authority.mjs');
execFileSync(join(WORKER, 'node_modules/.bin/esbuild'), [
  join(WORKER, 'src/billing-origin-authority.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--outfile=${OUT}`,
], { cwd: WORKER, stdio: 'pipe' });
const { billingWiring } = await import(`file://${OUT}`);
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));

/** Everything the canonical authority needs, all of it present and live. */
const WIRED = Object.freeze({
  BILLING_WORKER_NAME: 'apple',
  LEGACY_QUOTA_DO: { idFromName: () => 'x', get: () => ({}) },
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture_only',
  STRIPE_SECRET_KEY: 'sk_live_fixture_only',
  STRIPE_PRICE_BUILDER: 'price_builder_fixture',
  STRIPE_PRICE_STUDIO: 'price_studio_fixture',
  ENVIRONMENT: 'production',
});
const env = (overrides = {}) => ({ ...WIRED, ...overrides });

test('a fully wired authority reports that a purchase would reach both stores', () => {
  const w = billingWiring(env());
  assert.equal(w.why, null);
  assert.equal(w.mutationWouldApplyToBoth, true);
  assert.equal(w.isAuthority, true);
  assert.equal(w.replicaBound, true);
  assert.equal(w.stripeApiKey, 'live');
  assert.deepEqual(w.priceIds, { builder: true, studio: true });
});

test('the replica binding is a prerequisite, not a nicety', () => {
  // Without it the webhook returns 503 before it calls the authority at all: half-applying a
  // purchase to the canonical store and not to golem's is what the two-store rule forbids.
  const w = billingWiring(env({ LEGACY_QUOTA_DO: undefined }));
  assert.equal(w.replicaBound, false);
  assert.equal(w.why, 'replica_binding_missing');
  assert.equal(w.mutationWouldApplyToBoth, false);
});

test('the replica deployment is not the authority and says so rather than looking broken', () => {
  // golem answers the webhook 503 by design. A report that called that "misconfigured" would send
  // somebody to fix a deployment that is behaving correctly.
  const w = billingWiring(env({ BILLING_WORKER_NAME: 'golem', LEGACY_QUOTA_DO: undefined }));
  assert.equal(w.isAuthority, false);
  assert.equal(w.canonicalAuthority, 'apple');
  assert.equal(w.why, 'not_the_billing_authority');
});

test('a missing webhook secret is reported before anything else, because the route refuses there', () => {
  // Every other condition is ALSO unmet here. The report must name the first one the route reaches,
  // or it describes a code path nothing takes.
  const w = billingWiring({ ENVIRONMENT: 'production' });
  assert.equal(w.why, 'webhook_secret_missing');
  assert.equal(w.webhookSecret, false);
  assert.equal(w.stripeApiKey, 'absent');
  assert.equal(w.worker, null);
});

test('a test key is refused in production and admitted outside it', () => {
  // The same rule `checkoutConfigured` applies: a test key in production sells subscriptions that
  // charge nobody. Outside production a test key is the correct key.
  for (const key of ['sk_test_fixture', 'rk_test_fixture']) {
    assert.equal(billingWiring(env({ STRIPE_SECRET_KEY: key })).why,
      'stripe_api_key_is_a_test_key_in_production', `${key} was admitted in production`);
    const staging = billingWiring(env({ STRIPE_SECRET_KEY: key, ENVIRONMENT: 'staging' }));
    assert.equal(staging.why, null, `${key} was refused outside production`);
    assert.equal(staging.stripeApiKey, 'test');
  }
});

test('an unrecognised key form stays live, rather than reporting a working deployment as broken', () => {
  assert.equal(billingWiring(env({ STRIPE_SECRET_KEY: 'sk_fixture_unknown_form' })).stripeApiKey, 'live');
});

test('whitespace is not a secret', () => {
  // A secret pasted with a trailing newline is present. Reporting it absent would send somebody
  // hunting for a value that is already set.
  assert.equal(billingWiring(env({ STRIPE_WEBHOOK_SECRET: '   ' })).why, 'webhook_secret_missing');
  assert.equal(billingWiring(env({ STRIPE_SECRET_KEY: ' sk_live_fixture_only\n' })).stripeApiKey, 'live');
});

test('the report carries no secret, not even a prefix', () => {
  const secrets = [
    'whsec_fixture_only', 'sk_live_fixture_only', 'price_builder_fixture', 'price_studio_fixture',
    // The prefix on its own is a fact about the account: it says whether real cards are being
    // charged. A report that dropped the body and kept `sk_live_` would still have said that.
    'sk_live_', 'whsec_',
  ];
  const serialised = JSON.stringify(billingWiring(env()));
  for (const secret of secrets) {
    assert.ok(!serialised.includes(secret), `the wiring report contains "${secret}": ${serialised}`);
  }
  // And the check is not vacuous: every secret above must really be in the env it was built from.
  const fromEnv = JSON.stringify(WIRED);
  for (const secret of ['whsec_fixture_only', 'sk_live_fixture_only', 'price_builder_fixture']) {
    assert.ok(fromEnv.includes(secret), `${secret} is not in the fixture — this test checks nothing`);
  }
});

test('the route checks the same prerequisites, in the same order, that the report claims', () => {
  //[[ THE PROPERTY, NOT THE SPELLING.
  //   This is the way the report can lie: it is a claim ABOUT index.ts. If the webhook grows a
  //   prerequisite billingWiring does not know about, the report says a purchase would land in both
  //   stores while the route refuses it — an all-clear nobody earned.
  //   Pinned to the two conditions and their ORDER relative to the secret check, not to the exact
  //   expression, so a refactor that keeps the property does not go red. ]]
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const route = src.slice(src.indexOf("app.post('/api/billing/webhook'"), src.indexOf("app.get('/api/providers'"));
  assert.ok(route.length > 500, 'the webhook route could not be sliced out of index.ts — this test has verified nothing');

  const secretCheck = route.search(/STRIPE_WEBHOOK_SECRET/);
  const authorityCheck = route.search(/BILLING_WORKER_NAME\s*!==\s*BILLING_AUTHORITY_WORKER/);
  const replicaCheck = route.search(/!c\.env\.LEGACY_QUOTA_DO/);
  assert.ok(secretCheck >= 0, 'the webhook no longer reads STRIPE_WEBHOOK_SECRET');
  assert.ok(authorityCheck >= 0, 'the webhook no longer refuses a deployment that is not the billing authority');
  assert.ok(replicaCheck >= 0, 'the webhook no longer requires the replica binding — a purchase could apply to one store only');
  assert.ok(secretCheck < authorityCheck,
    'the webhook now checks the authority before the webhook secret; billingWiring reports the secret first and would name the wrong reason');
  assert.ok(authorityCheck < replicaCheck || Math.abs(authorityCheck - replicaCheck) < 200,
    'the authority and replica checks are no longer the same guard; billingWiring folds them into one order and would name the wrong reason');
});
