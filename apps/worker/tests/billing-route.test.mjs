// The webhook route's refusals, asserted as source facts.
//
// This endpoint is public by necessity and its entire job is to RAISE entitlements. Each refusal
// below exists because the alternative is an open subscription dispenser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(join(HERE, '..', 'src', 'index.ts'), 'utf8');
const route = INDEX.slice(INDEX.indexOf("app.post('/api/billing/webhook'"), INDEX.indexOf("app.get('/api/providers'"));

test('no secret configured means refuse, never "trust the body"', () => {
  assert.match(route, /if \(!secret\) return c\.json\(\{ error: 'billing not configured' \}, 503\)/);
  // The refusal must come BEFORE anything reads or acts on the payload.
  assert.ok(route.indexOf('!secret') < route.indexOf('await c.req.text()'), 'the secret check must precede reading the body');
});

test('the signature is verified against the RAW body, not re-serialised JSON', () => {
  // Re-serialising parsed JSON changes bytes (key order, whitespace, number formatting) and the
  // signature can never match again.
  assert.match(route, /const raw = await c\.req\.text\(\)/);
  assert.match(route, /verifyStripeSignature\(\s*raw,/);
  assert.ok(route.indexOf('verifyStripeSignature') < route.indexOf('JSON.parse(raw)'), 'verify before parse');
  assert.equal(/JSON\.stringify\(await c\.req\.json\(\)\)/.test(route), false);
});

test('a failed verification returns 400 without telling the prober why', () => {
  assert.match(route, /if \(!verdict\.ok\)/);
  assert.match(route, /return c\.json\(\{ error: 'invalid signature' \}, 400\)/);
  // The reason is logged, not returned — otherwise the response is an oracle for forging.
  assert.match(route, /console\.warn\('billing webhook rejected:', verdict\.reason\)/);
  assert.equal(/c\.json\(\{ error: verdict\.reason/.test(route), false, 'the reason must not be returned to the caller');
});

test('entitlement is recomputed, not taken from the event', () => {
  // A cancelled or lapsed subscription must not leave a paid tier behind because the plan field
  // still says "pro".
  assert.match(route, /entitlementFor\(outcome\.subscription/);
  assert.ok(route.indexOf('entitlementFor') < route.indexOf("'https://do/set-plan'"), 'recompute before writing the plan');
});

test('an event with no user is acknowledged, not retried forever', () => {
  // 200 because the event IS valid; ignored because guessing the account is worse than skipping.
  assert.match(route, /if \(!outcome\.userId\) return c\.json\(\{ ok: true, ignored/);
});

test('the webhook bypasses JWT auth AND authenticates by signature — both, or neither is safe', () => {
  // Stripe is not a user and has no JWT, so without the exemption every webhook 401s before the
  // handler runs and no subscription is ever applied. The first version of this test asserted the
  // OPPOSITE and passed, which is how the bug nearly shipped: the assertion was satisfied by the
  // broken state.
  //
  // The exemption is only safe because the route verifies an HMAC over the raw body with a replay
  // window. The two facts are asserted TOGETHER so neither can be removed on its own.
  const exempt = /const AUTH_EXEMPT = \[([^\]]*)\]/.exec(INDEX);
  assert.ok(exempt, 'AUTH_EXEMPT must exist');
  assert.ok(exempt[1].includes('/api/billing/webhook'), 'Stripe has no JWT — without this the webhook always 401s');
  assert.match(route, /verifyStripeSignature\(/, 'the exemption is only safe while the signature is verified');
  assert.match(route, /if \(!secret\) return c\.json\(\{ error: 'billing not configured' \}, 503\)/);
});
