/**
 * THE LAST DOOR, AND WHAT THE SCREEN IN FRONT OF IT IS ALLOWED TO SAY.
 *
 * `POST /api/recovery-request` answers three ways and the page has to render each one honestly.
 * That is a smaller job than it sounds and it has exactly one comfortable wrong answer, which is
 * the reason this module exists instead of an `if (res.ok)` in the component:
 *
 *   A REQUEST THAT WAS NOT RECORDED MUST NOT PRODUCE A THANK-YOU. The route returns 503 when D1
 *   refused the write, and the natural client — `catch` around the fetch, show the calm sentence
 *   anyway — turns the one moment this feature exists for into a lie told to somebody who has run
 *   out of other options. `recoveryOutcome` cannot return 'received' for anything but an explicit,
 *   well-formed acknowledgement.
 *
 *   AND A NETWORK FAILURE IS THE SAME CASE. A fetch that threw is not evidence that the plea
 *   landed; it is the absence of evidence either way. It lands on 'failed' with something to do
 *   next, never on 'received'.
 *
 * The other property is the section's standing rule: nothing the screen says may vary with whether
 * the address has an account, because nothing here KNOWS — the worker has no way to find out. The
 * sentence is the conditional one `auth-flows.ts` already uses.
 *
 * Run with:  node --test tests/account-recovery.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/lib/account-recovery.ts';

/* ----------------------------------------------------------------- what may be submitted --- */

test('an address that cannot be one is caught before a request is made', () => {
  for (const bad of ['', '   ', 'nope', 'a@', '@b.com', 'a b@c.com']) {
    assert.equal(R.canSubmit(bad), false, `${JSON.stringify(bad)} should not be submittable`);
  }
});

test('an ordinary address is submittable, including with stray whitespace', () => {
  // F-64: if this were false the test above would pass against a function that refuses everything.
  assert.equal(R.canSubmit('sam@example.com'), true);
  assert.equal(R.canSubmit('  Sam@Example.com  '), true);
});

/* ------------------------------------------------------------------------- the outcomes --- */

test('a 200 that says received is the only thing that produces a thank-you', () => {
  const o = R.recoveryOutcome({ status: 200, body: { received: true, message: 'Thanks — that is recorded.' } });
  assert.equal(o.kind, 'received');
  assert.equal(o.message, 'Thanks — that is recorded.');
});

test('A 503 IS NOT A THANK-YOU — the plea was not recorded and the screen must say so', () => {
  const o = R.recoveryOutcome({ status: 503, body: { error: 'We could not record that just now. Please try again in a minute.' } });
  assert.equal(o.kind, 'failed', 'telling somebody out of options that they are queued when they are not is the failure this guards');
  assert.match(o.message, /again/i);
});

test('A FETCH THAT THREW IS NOT EVIDENCE THE PLEA LANDED', () => {
  const o = R.recoveryOutcome({ error: new TypeError('Failed to fetch') });
  assert.equal(o.kind, 'failed');
  assert.ok(o.message.length > 0, 'and it must still say what to do');
});

test('a 200 whose body is not the acknowledgement is NOT read as one', () => {
  // A proxy's HTML error page, a truncated body, a null. Each is a 200 and none is a confirmation.
  for (const body of [null, undefined, {}, { received: false }, 'ok', { received: 'yes' }]) {
    const o = R.recoveryOutcome({ status: 200, body });
    assert.notEqual(o.kind, 'received', `${JSON.stringify(body)} must not read as an acknowledgement`);
  }
});

test('a 400 tells the person what to fix, because it is about their typing and not their account', () => {
  const o = R.recoveryOutcome({ status: 400, body: { error: 'That does not look like an email address.' } });
  assert.equal(o.kind, 'retry');
  assert.match(o.message, /email address/i);
});

test('a 429 says wait rather than repeating the address back', () => {
  const o = R.recoveryOutcome({ status: 429, body: { error: 'Too many requests — wait a minute and try again.' } });
  assert.equal(o.kind, 'retry');
  assert.match(o.message, /wait|minute/i);
});

test('an unexpected status is a failure, not a silent success', () => {
  for (const status of [301, 404, 418, 500, 502]) {
    const o = R.recoveryOutcome({ status, body: {} });
    assert.notEqual(o.kind, 'received', `${status} must never read as recorded`);
  }
});

/* --------------------------------------------------------- it still reveals nothing --- */

test('NOTHING THE SCREEN SAYS VARIES WITH WHETHER THE ADDRESS HAS AN ACCOUNT', () => {
  // The worker cannot tell, so neither can this. The assertion is on the module's whole
  // vocabulary: no branch here may ever be reachable by a fact about registration.
  const source = R.RECOVERY_SENTENCES.join(' ');
  for (const leak of [/no account/i, /not registered/i, /we found your account/i, /that address exists/i, /unknown address/i]) {
    assert.doesNotMatch(source, leak, 'this sentence would answer "is this address a customer?"');
  }
});

test('the acknowledgement is conditional, the way every other one in this product is', () => {
  const o = R.recoveryOutcome({ status: 200, body: { received: true } });
  // With no message from the server the module supplies its own, and it must be the hedged form.
  assert.match(o.message, /if that address has an account/i);
});
