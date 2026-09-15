// The retry policy, fed the cases that matter.
//
// `shouldRetry` and `backoffMs` are pure functions precisely so this suite can present the
// dangerous inputs directly: a POST that timed out, a 429 with a Retry-After of an hour, an
// attempt counter that arrived as NaN. None of those can be produced on demand by a server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, backoffMs, messageFromBody, shouldRetry } from '../src/errors.mjs';

test('a POST is NOT retried by default, even on a status that is retryable for a GET', () => {
  const base = { status: 503, attempt: 1, maxAttempts: 3 };
  assert.equal(shouldRetry({ ...base, method: 'GET' }), true);
  assert.equal(shouldRetry({ ...base, method: 'POST' }), false, 'a repeated POST repeats its effect');
  // The opt-in exists, and is the only way a POST repeats.
  assert.equal(shouldRetry({ ...base, method: 'POST', retryNonIdempotent: true }), true);
});

test('PUT and DELETE are retried: repeating them lands on the same state', () => {
  for (const method of ['PUT', 'DELETE', 'HEAD', 'get']) {
    assert.equal(shouldRetry({ method, status: 500, attempt: 1, maxAttempts: 3 }), true, method);
  }
});

test('a status that will never fix itself is not retried', () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(shouldRetry({ method: 'GET', status, attempt: 1, maxAttempts: 5 }), false, String(status));
  }
});

test('a transport failure is retried for a safe method and NOT for a POST', () => {
  assert.equal(shouldRetry({ method: 'GET', status: 0, attempt: 1, maxAttempts: 3 }), true);
  // The tempting reading of status 0 is "it never arrived, so repeating is free". A reset
  // that lands AFTER the worker committed the write throws identically, and the client
  // cannot tell the two apart — so a POST that died in transit is reported, not repeated.
  assert.equal(shouldRetry({ method: 'POST', status: 0, attempt: 1, maxAttempts: 3 }), false);
});

test('the attempt cap holds, including when the counter arrives non-finite', () => {
  assert.equal(shouldRetry({ method: 'GET', status: 500, attempt: 3, maxAttempts: 3 }), false);
  // NaN >= 3 is false. Without admission this would retry forever while the cap looked enforced.
  assert.equal(shouldRetry({ method: 'GET', status: 500, attempt: NaN, maxAttempts: NaN }), false);
  assert.equal(shouldRetry({ method: 'GET', status: 500, attempt: Infinity, maxAttempts: 3 }), false);
});

test('backoff grows with the attempt and is capped', () => {
  const noJitter = { jitter: () => 1 };
  const schedule = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => backoffMs(n, noJitter));
  for (let i = 1; i < schedule.length; i += 1) {
    assert.ok(schedule[i] >= schedule[i - 1], `attempt ${i + 1} must not wait less than attempt ${i}`);
  }
  // The claim is the RELATIONSHIP — doubling until the ceiling — not any one literal.
  assert.equal(schedule[1], schedule[0] * 2);
  assert.ok(schedule.at(-1) <= 20_000, 'the ceiling must hold');
  assert.ok(backoffMs(30, noJitter) <= 20_000, 'a runaway attempt number must not overflow the ceiling');
});

test('jitter spreads the wait without ever making it longer than the schedule', () => {
  for (const j of [0, 0.5, 1]) {
    const d = backoffMs(3, { jitter: () => j });
    assert.ok(d >= 600 && d <= 1200, `jitter ${j} produced ${d}`);
  }
  // A jitter source that returns nonsense must not produce a NaN delay: setTimeout(NaN)
  // fires immediately, which turns a backoff into a hot loop against a struggling server.
  assert.ok(Number.isFinite(backoffMs(3, { jitter: () => NaN })));
  assert.ok(Number.isFinite(backoffMs(3, { jitter: () => 'soon' })));
});

test("the server's Retry-After wins over the client's own schedule", () => {
  assert.equal(backoffMs(1, { retryAfter: 45, jitter: () => 1 }), 20_000, 'clamped to the ceiling');
  assert.equal(backoffMs(1, { retryAfter: 2, jitter: () => 1 }), 2000);
  assert.equal(backoffMs(1, { retryAfter: '3', jitter: () => 1 }), 3000, 'the raw header form is accepted');
  // An unreadable Retry-After falls back to the schedule instead of becoming NaN.
  assert.equal(backoffMs(1, { retryAfter: 'whenever', jitter: () => 1 }), 300);
});

test('an error message comes from the server when it sent one, and never reads as [object Object]', () => {
  assert.equal(messageFromBody({ error: 'Daily Sparks used up' }, 429), 'Daily Sparks used up');
  assert.equal(messageFromBody({ error: '   ' }, 500), 'Request failed (500)');
  assert.equal(messageFromBody(null, 502), 'Request failed (502)');
  assert.equal(messageFromBody({ nope: 1 }, 500), 'Request failed (500)');
  assert.match(messageFromBody('<html>502 Bad Gateway</html>', 502), /502/);
});

test('ApiError separates "the server said no" from "there was no server"', () => {
  assert.equal(new ApiError('x', 0).isTransport, true);
  assert.equal(new ApiError('x', 404).isTransport, false);
  // A status that is not a status must not become one.
  assert.equal(new ApiError('x', NaN).status, 0);
  assert.equal(new ApiError('x', '404').status, 0);
});
