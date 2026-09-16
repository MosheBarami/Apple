/**
 * ERROR MONITORING — the tests for apps/worker/src/sentry.ts.
 *
 * Three properties are worth more here than anything else, and each one is asserted against a real
 * violating input rather than a healthy fixture that walks past the guard:
 *
 *   1. AN UNSET DSN SENDS NOTHING AND BREAKS NOTHING. The transport is injected and counted, so
 *      "nothing was sent" is a count of zero calls rather than the absence of a network log.
 *   2. NOTHING SENSITIVE LEAVES. The needles below are a real Supabase-shaped JWT, a real-shaped
 *      email address and a paragraph of prompt text, and the assertions are made against the
 *      SERIALISED ENVELOPE — the exact bytes of the POST body — not against the event object,
 *      because the object is not what goes on the wire.
 *   3. THE CLIENT'S ERROR RESPONSE IS UNCHANGED. The middleware is driven with the DSN set and
 *      unset and the two responses are compared byte for byte.
 *
 * WHAT WOULD MAKE EACH ASSERTION GO RED is stated where it is not obvious. Every test in this file
 * was run against a deliberately broken copy of the module before being committed; where the break
 * is not the obvious one, it is named.
 *
 * Run: node --test tests/sentry.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'sentry-')), 'sentry.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'sentry.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const S = await import(`file://${out}`);

const DSN = 'https://abc123def456@o4500.ingest.us.sentry.io/4509';

/* --------------------------------------------------------------- the needles --- */

/** Supabase's access tokens are compact JWS. This is the shape, with nothing real in it. */
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkEgUGVyc29uIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const EMAIL = 'someone.real@example.com';
/** What a person actually typed into the composer. No rule in redaction.ts matches prose. */
const PROMPT = 'build me an obby with lava floors and a checkpoint every twenty studs';
const API_KEY = 'gk_live_0123456789abcdef01234567_0123456789abcdef0123456789abcdef0123456789abcdef';

/** A transport that records rather than sends. `calls.length` is the whole point of the no-DSN test. */
function recorder(response = { ok: true, status: 200 }) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: response.ok, status: response.status };
  };
  return { calls, deps: { fetch, now: () => 1_770_000_000_000, eventId: () => 'a'.repeat(32) } };
}

const ctx = (over = {}) => ({ kind: 'unhandled', route: '/api/projects/:id/ws', method: 'POST', status: null, origin: 'https://apple.example', ...over });

/** The bytes that would be POSTed, for the run just recorded. */
const bodyOf = (calls) => calls[0].init.body;

/* -------------------------------------------------------------------- the DSN --- */

test('a DSN is parsed into its parts, and the envelope endpoint is derived from them', () => {
  const dsn = S.parseDsn(DSN);
  assert.ok(dsn, 'a well-formed DSN was refused');
  assert.equal(dsn.publicKey, 'abc123def456');
  assert.equal(dsn.projectId, '4509');
  assert.equal(dsn.host, 'o4500.ingest.us.sentry.io');
  assert.equal(S.envelopeEndpoint(dsn), 'https://o4500.ingest.us.sentry.io/api/4509/envelope/');
  assert.match(S.sentryAuthHeader(dsn), /sentry_version=7/);
  assert.match(S.sentryAuthHeader(dsn), /sentry_key=abc123def456/);
  // The deprecated secret half is never sent. Red if `sentryAuthHeader` starts reading it.
  assert.equal(S.sentryAuthHeader(dsn).includes('sentry_secret'), false);
});

test('every unusable DSN is null, including the ones that look almost right', () => {
  for (const bad of [
    undefined,
    null,
    '',
    '   ',
    42,
    'not a url',
    'ftp://key@host/1',
    'https://o1.ingest.sentry.io/4509',           // no public key
    'https://key@o1.ingest.sentry.io',            // no project id
    'https://key@o1.ingest.sentry.io/notanumber', // a path, not a project
  ]) {
    assert.equal(S.parseDsn(bad), null, `${JSON.stringify(bad)} was accepted as a DSN`);
  }
});

/* ------------------------------------------------------- no DSN, no send, no crash --- */

test('an unset DSN sends nothing at all — and says so by name', async () => {
  const { calls, deps } = recorder();
  for (const env of [{}, { SENTRY_DSN: undefined }, { SENTRY_DSN: '' }, { SENTRY_DSN: '   ' }]) {
    const outcome = await S.reportToSentry(env, new Error('boom'), ctx(), deps);
    assert.deepEqual(outcome, { sent: false, reason: 'no_dsn' });
  }
  // THE ASSERTION THAT MATTERS. A module that built the event and then failed to POST it would
  // satisfy the outcome check above; this one is a count of transport calls, and it is zero.
  assert.equal(calls.length, 0, `${calls.length} requests were made with no DSN configured`);
});

test('a DSN that is set but unusable is a DIFFERENT answer from one that is absent', async () => {
  const { calls, deps } = recorder();
  const outcome = await S.reportToSentry({ SENTRY_DSN: 'https://o1.sentry.io/nope' }, new Error('boom'), ctx(), deps);
  assert.equal(outcome.sent, false);
  // `no_dsn` here would be the failure this distinction exists to prevent: somebody set the
  // variable, believes monitoring is on, and the system agrees with them by staying quiet.
  assert.equal(outcome.reason, 'bad_dsn');
  assert.equal(calls.length, 0);
  // The value is not echoed back. A mis-pasted DSN is often a mis-pasted something else.
  assert.equal(outcome.detail.includes('nope'), false, 'the unusable value was echoed into the outcome');
});

test('a transport that throws is a named refusal, never a rejected promise', async () => {
  // reportToSentry is handed to waitUntil with no catch attached. If it could reject, every
  // reported error would produce a second, unhandled one.
  const deps = { fetch: async () => { throw new Error('DNS is down'); }, now: () => 1, eventId: () => 'b'.repeat(32) };
  const outcome = await S.reportToSentry({ SENTRY_DSN: DSN }, new Error('boom'), ctx(), deps);
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, 'transport_failed');
  assert.match(outcome.detail, /DNS is down/);
});

test('a 4xx from Sentry is a refusal, not a send', async () => {
  const { deps } = recorder({ ok: false, status: 413 });
  const outcome = await S.reportToSentry({ SENTRY_DSN: DSN }, new Error('boom'), ctx(), deps);
  assert.deepEqual(outcome, { sent: false, reason: 'refused', detail: 'Sentry answered 413' });
});

/* ------------------------------------------------------------------ the payload --- */

test('the envelope is three lines: header, item header, event', async () => {
  const { calls, deps } = recorder();
  const outcome = await S.reportToSentry({ SENTRY_DSN: DSN, BUILD_SHA: 'abc1234', ENVIRONMENT: 'production' }, new Error('boom'), ctx(), deps);
  assert.equal(outcome.sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://o4500.ingest.us.sentry.io/api/4509/envelope/');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-sentry-envelope');
  assert.match(calls[0].init.headers['X-Sentry-Auth'], /^Sentry sentry_version=7, sentry_client=apple-worker/);
  const lines = bodyOf(calls).trim().split('\n');
  assert.equal(lines.length, 3, `the envelope had ${lines.length} lines`);
  assert.equal(JSON.parse(lines[1]).type, 'event');
  const event = JSON.parse(lines[2]);
  assert.equal(event.event_id, JSON.parse(lines[0]).event_id, 'the envelope header names a different event');
});

test('the event carries the build sha, the environment and the request context', async () => {
  const { calls, deps } = recorder();
  await S.reportToSentry(
    { SENTRY_DSN: DSN, BUILD_SHA: 'deadbee', ENVIRONMENT: 'production' },
    new Error('boom'),
    ctx({ status: 500, method: 'POST' }),
    deps,
  );
  const event = JSON.parse(bodyOf(calls).trim().split('\n')[2]);
  assert.equal(event.release, 'deadbee');
  assert.equal(event.environment, 'production');
  assert.equal(event.transaction, '/api/projects/:id/ws');
  assert.equal(event.tags.route, '/api/projects/:id/ws');
  assert.equal(event.tags.method, 'POST');
  assert.equal(event.tags.status, '500');
  assert.equal(event.tags.capture, 'unhandled');
  assert.equal(event.exception.values[0].type, 'Error');
  assert.equal(event.exception.values[0].value, 'boom');
});

test('a status nobody could read is the string "unknown", never 0 and never a missing tag', async () => {
  const { calls, deps } = recorder();
  await S.reportToSentry({ SENTRY_DSN: DSN }, new Error('boom'), ctx({ status: null }), deps);
  const event = JSON.parse(bodyOf(calls).trim().split('\n')[2]);
  // A failure to observe must not render as an observation: `status: '0'` on a Sentry issue reads
  // as a real status, and an absent tag reads as "this error never had one".
  assert.equal(event.tags.status, 'unknown');
  assert.equal(event.release, 'unknown', 'a missing BUILD_SHA must not be a plausible-looking guess');
  assert.equal(event.environment, 'unknown');
});

/* ------------------------------------------------------------------ the scrubbing --- */

test('a JWT, an email and an API key in the error message never reach the wire', async () => {
  const { calls, deps } = recorder();
  // The JWT stands ALONE here rather than behind `authorization: Bearer`. Written the second way
  // the `bearer_credential` rule claims the whole header and the jwt rule never fires — the token
  // is still removed, but the test would then be asserting a different rule than it names. The
  // bearer shape gets its own line below.
  const error = new Error(`refused for ${EMAIL}: token ${JWT} key ${API_KEY}`);
  await S.reportToSentry({ SENTRY_DSN: DSN }, error, ctx(), deps);
  const body = bodyOf(calls);
  // Against the SERIALISED BODY, not the event object: the object is not what leaves the isolate.
  assert.equal(body.includes(JWT), false, 'a JWT was sent to Sentry');
  assert.equal(body.includes(EMAIL), false, 'an email address was sent to Sentry');
  assert.equal(body.includes(API_KEY), false, 'an Apple API key was sent to Sentry');
  // And the markers ARE there — without this, a scrubber that replaced the whole message with ''
  // would pass every assertion above while destroying the error report.
  assert.match(body, /\[redacted:jwt\]/);
  assert.match(body, /\[redacted:email\]/);
  assert.match(body, /\[redacted:apple_api_key\]/);
  assert.match(body, /refused for/, 'the diagnostic text around the secrets was destroyed');
});

test('an Authorization header pasted into a message goes too, header and all', async () => {
  const { calls, deps } = recorder();
  await S.reportToSentry({ SENTRY_DSN: DSN }, new Error(`upstream said: authorization: Bearer ${JWT}`), ctx(), deps);
  const body = bodyOf(calls);
  assert.equal(body.includes(JWT), false, 'a bearer token was sent to Sentry');
  assert.match(body, /\[redacted:bearer_credential\]/);
});

test('the event id survives the scrub, because an envelope Sentry rejects is not a send', async () => {
  //[[ THIS TEST EXISTS BECAUSE THE BUG WAS REAL, and it was the exact failure shape this tree
  //   keeps finding. A Sentry event id is 32 hex characters; redaction.ts's `long_hex` rule
  //   claims any run of 32+ hex as "a session id, an HMAC or a raw key" and was right to. So the
  //   first working version of this module POSTed an envelope whose id — in both the envelope
  //   header and the event — read `[redacted:long_hex]`, which Sentry would have refused, and
  //   `reportToSentry` returned `{ sent: true }`. A failure to send, rendering as a send.
  //
  //   Red if the restamp in reportToSentry is removed. Nothing else in this file notices: every
  //   other assertion compares the two ids to each other, and a redacted id equals a redacted id. ]]
  const { calls, deps } = recorder();
  const outcome = await S.reportToSentry({ SENTRY_DSN: DSN }, new Error('boom'), ctx(), deps);
  const lines = bodyOf(calls).trim().split('\n');
  const header = JSON.parse(lines[0]);
  const event = JSON.parse(lines[2]);
  assert.match(event.event_id, /^[0-9a-f]{32}$/, `the event id went out as ${event.event_id}`);
  assert.match(header.event_id, /^[0-9a-f]{32}$/, `the envelope header id went out as ${header.event_id}`);
  assert.equal(header.event_id, event.event_id);
  assert.equal(outcome.eventId, event.event_id, 'the reported id is not the one that was sent');
  // The DSN in the envelope header is not scrubbed either — Relay routes on it.
  assert.equal(header.dsn, 'https://abc123def456@o4500.ingest.us.sentry.io/4509');
});

test('the scrub is recursive, so a field added to the event later is still covered', () => {
  // RED-FIRST NOTE: the obvious break — deleting the string branch — turns every test in this file
  // red at once. The break this test exists for is subtler: making scrubEvent walk only the fields
  // it knows by name. Nothing else in this file notices that, because every field it checks is one
  // a name-based scrubber would still list.
  const scrubbed = S.scrubEvent({ a: { b: [{ deep: `see ${JWT}` }] }, n: 5, keep: null });
  assert.equal(JSON.stringify(scrubbed).includes(JWT), false, 'a nested string was not scrubbed');
  assert.match(scrubbed.a.b[0].deep, /\[redacted:jwt\]/);
  assert.equal(scrubbed.n, 5, 'non-strings must survive untouched');
  assert.equal(scrubbed.keep, null);
});

test('the request url is the ORIGIN and the LABEL — never a raw path and never a query string', () => {
  const event = S.buildEvent({
    error: new Error('boom'),
    ctx: { kind: 'unhandled', route: '/api/projects/:id/ws', method: 'GET', status: 500, origin: 'https://apple.example' },
    eventId: 'c'.repeat(32),
    timestampMs: 0,
    release: 'x',
    environment: 'test',
  });
  assert.equal(event.request.url, 'https://apple.example/api/projects/:id/ws');
  assert.equal(event.request.url.includes('?'), false);
  // THE STRUCTURAL GUARANTEE, asserted as a shape rather than a hope: there is nowhere on this
  // event for a header, a cookie, a body or a person to go.
  assert.deepEqual(Object.keys(event.request).sort(), ['method', 'url']);
  assert.equal('user' in event, false, 'the event grew a `user` field');
  assert.equal('breadcrumbs' in event, false, 'the event grew breadcrumbs');
  assert.equal('extra' in event, false, 'the event grew an `extra` bag');
  assert.equal('contexts' in event, false);
});

test('a stack that cannot be parsed yields no stacktrace, not an empty one', () => {
  const noStack = S.buildEvent({
    error: Object.assign(new Error('boom'), { stack: 'not a stack at all' }),
    ctx: { kind: 'unhandled', route: '/x', method: 'GET', status: 500 },
    eventId: 'd'.repeat(32), timestampMs: 0, release: 'x', environment: 'test',
  });
  // `frames: []` renders in Sentry as "this happened nowhere", which is a failure to observe
  // wearing the costume of an observation.
  assert.equal('stacktrace' in noStack.exception.values[0], false);

  const withStack = S.parseStack('Error: boom\n    at inner (worker.js:10:5)\n    at outer (worker.js:20:1)');
  assert.equal(withStack.length, 2);
  // Oldest first: Sentry renders the LAST frame as the innermost one.
  assert.equal(withStack[0].function, 'outer');
  assert.equal(withStack[1].function, 'inner');
  assert.equal(withStack[1].filename, 'worker.js');
  assert.equal(withStack[1].lineno, 10);
});

test('a thrown non-Error is still reported, with an honest type', () => {
  for (const [thrown, type] of [['a string', 'string'], [null, 'null'], [{ nope: 1 }, 'Object'], [7, 'number']]) {
    const e = S.buildEvent({ error: thrown, ctx: ctx(), eventId: 'e'.repeat(32), timestampMs: 0, release: 'x', environment: 't' });
    assert.equal(e.exception.values[0].type, type, `a thrown ${JSON.stringify(thrown)} was typed wrong`);
  }
});

/* ----------------------------------------------------------------- the middleware --- */

/** The smallest thing that behaves like the part of Hono's Context the middleware reads. */
function miniCtx(env, { url = 'https://apple.example/api/projects/8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/ws?token=secret', method = 'POST' } = {}) {
  const waited = [];
  return {
    c: { env, req: { url, method }, res: undefined, executionCtx: { waitUntil: (p) => waited.push(p) } },
    waited,
  };
}

const LABEL = (p) => p.split('/').map((s) => (/^[0-9a-f-]{36}$/i.test(s) ? ':id' : s)).join('/');

test('the middleware re-throws, so the response the client gets does not depend on Sentry', async () => {
  const boom = new Error('the handler exploded');
  const run = async (env) => {
    const { c, waited } = miniCtx(env);
    const mw = S.sentryMiddleware(LABEL, recorder().deps);
    let caught = null;
    try {
      await mw(c, async () => { throw boom; });
    } catch (e) {
      caught = e;
    }
    await Promise.all(waited);
    return caught;
  };
  const withoutDsn = await run({});
  const withDsn = await run({ SENTRY_DSN: DSN });
  // IDENTITY, not equality: the very object the handler threw comes back out both times, so
  // whatever Hono's error handler would have made of it, it still makes of it.
  assert.equal(withoutDsn, boom, 'the error was swallowed when no DSN was set');
  assert.equal(withDsn, boom, 'Sentry replaced the error the client would have been shown');
});

test('all three error shapes are reported, and the real cause is preferred to a synthetic one', async () => {
  //[[ THE `c.error` CASE IS THE COMMON ONE, WHICH IS WHY IT IS FIRST.
  //
  //   Hono's `compose` wraps every dispatch frame in its own try/catch: when a middleware throws,
  //   the catch in THAT frame parks the error on `c.error`, calls the error handler and returns
  //   normally, so every middleware outside it sees `next()` resolve with a 500 in `c.res`. A
  //   middleware that reports only what IT catches therefore reports almost nothing.
  //
  //   The first version of sentry.ts did exactly that, and sentry-live.test.mjs caught it: a real
  //   exception arrived in Sentry as "the handler answered 500 without throwing" with no stack.
  //   Red if `c.error` stops being read — the value assertion below is what goes, and it is the
  //   whole difference between a usable issue and an unusable one. ]]
  for (const [name, drive, kind, value] of [
    [
      "compose's 500, with the cause on c.error",
      async (c) => { c.error = new Error('the real cause'); c.res = { status: 500 }; },
      'unhandled',
      'the real cause',
    ],
    [
      'a non-Error throw, which compose re-throws rather than handling',
      async () => { throw 'a bare string'; },
      'unhandled',
      'a bare string',
    ],
    [
      'a handler that chose to answer 503 with nothing behind it',
      async (c) => { c.res = { status: 503 }; },
      'server_error',
      'the handler answered 503 without throwing',
    ],
  ]) {
    const { calls, deps } = recorder();
    const { c, waited } = miniCtx({ SENTRY_DSN: DSN });
    try {
      await S.sentryMiddleware(LABEL, deps)(c, async () => { await drive(c); });
    } catch { /* re-thrown by design */ }
    await Promise.all(waited);
    assert.equal(calls.length, 1, `${name} was not reported`);
    const event = JSON.parse(bodyOf(calls).trim().split('\n')[2]);
    assert.equal(event.tags.capture, kind, name);
    assert.equal(event.exception.values[0].value, value, `${name}: the wrong error was reported`);
  }
});

test('a 200 and a 404 are not errors and are not reported', async () => {
  for (const status of [200, 204, 304, 400, 401, 404, 429]) {
    const { calls, deps } = recorder();
    const { c, waited } = miniCtx({ SENTRY_DSN: DSN });
    await S.sentryMiddleware(LABEL, deps)(c, async () => { c.res = { status }; });
    await Promise.all(waited);
    assert.equal(calls.length, 0, `a ${status} was reported as an error`);
  }
});

test('the middleware labels the path and drops the query string before anything is sent', async () => {
  const { calls, deps } = recorder();
  const { c, waited } = miniCtx({ SENTRY_DSN: DSN });
  try {
    await S.sentryMiddleware(LABEL, deps)(c, async () => { throw new Error('boom'); });
  } catch { /* expected */ }
  await Promise.all(waited);
  const body = bodyOf(calls);
  // The url handed in carries a project uuid AND `?token=secret`. Neither may survive.
  assert.equal(body.includes('8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f'), false, 'a project id reached Sentry');
  assert.equal(body.includes('token=secret'), false, 'a query string reached Sentry');
  assert.match(body, /\/api\/projects\/:id\/ws/);
});

test('no execution context is not a crash — a synthetic request still reports', async () => {
  const { calls, deps } = recorder();
  const c = {
    env: { SENTRY_DSN: DSN },
    req: { url: 'https://apple.example/api/x', method: 'GET' },
    res: undefined,
    // The shape a test harness produces: reading `executionCtx` throws.
    get executionCtx() { throw new Error('no execution context'); },
  };
  try {
    await S.sentryMiddleware(LABEL, deps)(c, async () => { throw new Error('boom'); });
  } catch (e) {
    assert.equal(e.message, 'boom', 'the waitUntil failure replaced the original error');
  }
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 1, 'the report was abandoned because there was no execution context');
});

test('prompt text is not in the event because the event cannot reach it', () => {
  // THE STRUCTURAL PROOF, stated here and driven end-to-end through a real request body in
  // sentry-live.test.mjs. `buildEvent` takes an error and five scalars; there is no argument
  // through which a request body, a header or a transcript could arrive.
  const e = S.buildEvent({
    error: new Error('model call failed'),
    ctx: ctx(),
    eventId: 'f'.repeat(32), timestampMs: 0, release: 'x', environment: 't',
  });
  assert.equal(JSON.stringify(e).includes(PROMPT), false);
  // And the allowlist is closed: these are every key the event has.
  assert.deepEqual(
    Object.keys(e).sort(),
    ['environment', 'event_id', 'exception', 'level', 'logger', 'platform', 'release', 'request', 'tags', 'timestamp', 'transaction'],
  );
});
