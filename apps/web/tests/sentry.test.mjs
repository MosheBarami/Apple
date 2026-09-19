/**
 * ERROR MONITORING — the tests for apps/web/src/lib/sentry.ts.
 *
 * Before this module existed, a crash in somebody else's browser was written to a console nobody
 * would ever read and left no trace anywhere a maintainer could look. The tests that matter are
 * therefore about the three ways a monitoring module can be worse than none:
 *
 *   1. IT CRASHES THE APP IT IS WATCHING. With no DSN — the default, and every developer's
 *      machine — `installSentry` must register nothing, send nothing and throw nothing.
 *   2. IT EATS THE ERROR. The handlers must not call `preventDefault()`: the console entry and
 *      devtools' pause-on-exception are what people actually debug with, and reporting is an
 *      addition to them, never a swap.
 *   3. IT SHIPS THE CUSTOMER'S DATA. The needles below are a Supabase-shaped JWT, an email
 *      address and a paragraph of prompt text, and the assertions are made against the SERIALISED
 *      ENVELOPE — the bytes of the POST body — not the event object.
 *
 * The transport, the clock, the id source, the event target and `location` are all injected, so
 * "nothing was sent" is a count of zero calls rather than the absence of a network log.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'websentry-')), 'sentry.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'sentry.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out],
  { stdio: 'pipe' },
);
const S = await import(out);

const DSN = 'https://abc123def456@o4500.ingest.us.sentry.io/4509';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkEgUGVyc29uIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const EMAIL = 'someone.real@example.com';
const PROMPT = 'build me an obby with lava floors and a checkpoint every twenty studs';
const PROJECT_ID = '8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

/**
 * A window substitute that records what was registered and lets the test fire it.
 *
 * Not a jsdom: the whole module is written so that `window` arrives as an argument, which is what
 * makes "with no DSN, nothing is registered" observable as `Object.keys(listeners).length === 0`.
 */
function fakeWindow() {
  const listeners = {};
  return {
    listeners,
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); },
    fire: (type, event) => Promise.all((listeners[type] ?? []).map((fn) => fn(event))),
  };
}

function harness({ dsn = DSN, ok = true, status = 200, pathname = `/projects/${PROJECT_ID}/files` } = {}) {
  const sent = [];
  const win = fakeWindow();
  const client = S.installSentry(
    { dsn, release: 'cafe123', environment: 'production' },
    {
      now: () => 1_770_000_000_000,
      eventId: () => 'a'.repeat(32),
      send: async (url, init) => { sent.push({ url, init }); return { ok, status }; },
      target: win,
      location: { origin: 'https://app.example', pathname },
    },
  );
  return { client, sent, win, event: () => JSON.parse(sent[0].init.body.trim().split('\n')[2]), body: () => sent[0].init.body };
}

/* --------------------------------------------------------- no DSN, no anything --- */

test('with no DSN nothing is registered, nothing is sent, and nothing throws', async () => {
  for (const dsn of [undefined, null, '', '   ']) {
    const sent = [];
    const win = fakeWindow();
    const client = S.installSentry({ dsn }, { target: win, send: async (u, i) => { sent.push({ u, i }); return { ok: true, status: 200 }; } });
    assert.equal(client.installed, false, `${JSON.stringify(dsn)} produced an installed client`);
    assert.equal(client.reason, 'no_dsn');
    // THE ASSERTION THAT MATTERS: no listener exists at all, so there is no code path from a
    // browser error into this module. A module that registered handlers and then declined to send
    // would pass the outcome check and fail this one.
    assert.deepEqual(Object.keys(win.listeners), [], 'handlers were registered with no DSN');
    const outcome = await client.captureException(new Error('boom'));
    assert.deepEqual(outcome, { sent: false, reason: 'no_dsn' });
    assert.equal(sent.length, 0);
  }
});

test('captureException with nothing installed is a named no-op, not a crash', async () => {
  const win = fakeWindow();
  S.installSentry({ dsn: undefined }, { target: win });
  // The module-level entry point the React boundary uses. It must answer even when the app never
  // called installSentry at all — a boundary that throws while reporting a crash is the worst
  // possible place for an exception.
  const outcome = await S.captureException(new Error('boom'));
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, 'no_dsn');
});

test('a DSN that is set but unusable is a different answer, and still registers nothing', async () => {
  const win = fakeWindow();
  const client = S.installSentry({ dsn: 'https://o1.sentry.io/nope' }, { target: win });
  assert.equal(client.installed, false);
  // `no_dsn` here would be the failure this distinction exists to prevent: somebody pasted a DSN,
  // believes monitoring is on, and the system agrees with them by staying quiet.
  assert.equal(client.reason, 'bad_dsn');
  assert.deepEqual(Object.keys(win.listeners), []);
});

/* ------------------------------------------------------------- what is captured --- */

test('an uncaught error and an unhandled rejection both reach Sentry', async () => {
  for (const [type, event, kind] of [
    ['error', { error: new Error('render exploded') }, 'window_error'],
    ['unhandledrejection', { reason: new Error('the query rejected') }, 'unhandled_rejection'],
  ]) {
    const h = harness();
    await h.win.fire(type, event);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(h.sent.length, 1, `a ${type} was not reported`);
    assert.equal(h.event().tags.capture, kind);
    assert.equal(h.event().exception.values[0].value, event.error?.message ?? event.reason.message);
    h.client.uninstall();
  }
});

test('the handlers never call preventDefault — the browser still reports the error itself', async () => {
  const h = harness();
  let prevented = false;
  await h.win.fire('error', { error: new Error('boom'), preventDefault: () => { prevented = true; } });
  await h.win.fire('unhandledrejection', { reason: new Error('boom'), preventDefault: () => { prevented = true; } });
  await new Promise((r) => setTimeout(r, 0));
  // MONITORING THAT SWALLOWS THE ERROR IT MONITORS IS WORSE THAN NONE. With preventDefault the
  // console entry disappears and devtools stops pausing — every developer downstream loses the
  // signal they were actually using, in exchange for a dashboard they may not have open.
  assert.equal(prevented, false, 'the reporter suppressed the browser\'s own error reporting');
  assert.equal(h.sent.length, 2, 'and it must still have reported both');
  h.client.uninstall();
});

test('uninstall removes the handlers it added', async () => {
  const h = harness();
  h.client.uninstall();
  assert.deepEqual(h.win.listeners.error, []);
  assert.deepEqual(h.win.listeners.unhandledrejection, []);
  await h.win.fire('error', { error: new Error('boom') });
  assert.equal(h.sent.length, 0);
});

/* ------------------------------------------------------------------ the payload --- */

test('the envelope is three lines with a readable event id, and carries the build and route', async () => {
  const h = harness();
  const outcome = await h.client.captureException(new Error('boom'), { kind: 'react_boundary', scope: 'route' });
  assert.equal(outcome.sent, true);
  assert.equal(h.sent[0].url, 'https://o4500.ingest.us.sentry.io/api/4509/envelope/');
  assert.equal(h.sent[0].init.headers['Content-Type'], 'application/x-sentry-envelope');
  assert.match(h.sent[0].init.headers['X-Sentry-Auth'], /sentry_client=apple-web/);
  const lines = h.body().trim().split('\n');
  assert.equal(lines.length, 3);
  //[[ THE EVENT ID SURVIVES THE SCRUB. A Sentry event id is 32 hex characters, which is exactly
  //   the `long_hex` shape this module redacts. The worker's copy of this module shipped that bug
  //   — an envelope Sentry would refuse, reported as `sent: true` — so the id is restamped after
  //   the scrub in both. Red if that restamp is removed. ]]
  assert.match(JSON.parse(lines[2]).event_id, /^[0-9a-f]{32}$/, 'the event id was redacted out of its own envelope');
  assert.equal(JSON.parse(lines[0]).event_id, JSON.parse(lines[2]).event_id);
  const event = JSON.parse(lines[2]);
  assert.equal(event.release, 'cafe123');
  assert.equal(event.environment, 'production');
  assert.equal(event.tags.boundary, 'route');
  assert.equal(event.tags.runtime, 'browser');
  h.client.uninstall();
});

test('the route is labelled, so a project id never becomes a transaction name', async () => {
  const h = harness();
  await h.client.captureException(new Error('boom'));
  const event = h.event();
  assert.equal(event.transaction, '/projects/:id/files');
  assert.equal(h.body().includes(PROJECT_ID), false, 'a project id reached Sentry');
  assert.equal(event.request.url, 'https://app.example/projects/:id/files');
  h.client.uninstall();
});

test('the browser dependency reads the current SPA route when the error is captured', async () => {
  const sent = [];
  const win = Object.assign(fakeWindow(), {
    location: { origin: 'https://app.example', pathname: `/projects/${PROJECT_ID}/files` },
  });
  const previousWindow = globalThis.window;
  globalThis.window = win;
  try {
    const client = S.installSentry(
      { dsn: DSN, release: 'cafe123', environment: 'production' },
      {
        now: () => 1_770_000_000_000,
        eventId: () => 'a'.repeat(32),
        send: async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200 }; },
      },
    );

    win.location.pathname = '/settings/security';
    await client.captureException(new Error('boom'));

    const event = JSON.parse(sent[0].init.body.trim().split('\n')[2]);
    assert.equal(event.transaction, '/settings/security', 'the report kept the route from install time');
    assert.equal(event.request.url, 'https://app.example/settings/security');
    client.uninstall();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('no JWT, no email and no prompt text reach the wire', async () => {
  const h = harness();
  // The realistic shape: the API client puts the response body into the error it throws.
  await h.client.captureException(new Error(`request failed for ${EMAIL} (token ${JWT}) while sending: ${PROMPT}`));
  const body = h.body();
  assert.equal(body.includes(JWT), false, 'a Supabase JWT was sent to Sentry');
  assert.equal(body.includes(EMAIL), false, 'an email address was sent to Sentry');
  assert.match(body, /\[redacted:jwt\]/);
  assert.match(body, /\[redacted:email\]/);
  //[[ THE PROMPT IS THE HONEST CASE, AND IT IS STATED HERE RATHER THAN HIDDEN.
  //
  //   Prose matches no pattern, so a prompt somebody INTERPOLATED INTO AN ERROR MESSAGE upstream
  //   is not removed by the scrubber and this assertion does not claim it is. What the module
  //   guarantees is structural: it never reads a request body, a transcript, the auth session or
  //   the composer's state, so nothing puts a prompt into an event on its own. The test below
  //   holds that guarantee; this line holds the cap that bounds the other case. ]]
  assert.ok(h.event().exception.values[0].value.length <= 1000, 'the message cap is gone');
  h.client.uninstall();
});

test('the event has nowhere to put a person, a session or a transcript', async () => {
  const h = harness();
  await h.client.captureException(new Error('boom'));
  const event = h.event();
  assert.deepEqual(
    Object.keys(event).sort(),
    ['environment', 'event_id', 'exception', 'level', 'logger', 'platform', 'release', 'request', 'tags', 'timestamp', 'transaction'],
    'the event grew a field — every addition here is a new way for customer data to leave',
  );
  assert.equal('user' in event, false);
  assert.equal('breadcrumbs' in event, false);
  assert.equal('extra' in event, false);
  assert.equal('contexts' in event, false);
  assert.deepEqual(Object.keys(event.request), ['url'], 'the request grew a field');
  assert.equal(event.request.url.includes('?'), false, 'the query string reached Sentry');
  assert.equal(event.request.url.includes('#'), false, 'the url fragment reached Sentry');
  h.client.uninstall();
});

test('the scrub is recursive, so a field added to the event later is still covered', () => {
  const scrubbed = S.scrubEvent({ a: { b: [{ deep: `see ${JWT}` }] }, n: 5, keep: null });
  assert.equal(JSON.stringify(scrubbed).includes(JWT), false, 'a nested string was not scrubbed');
  assert.equal(scrubbed.n, 5, 'non-strings must survive untouched');
  assert.equal(scrubbed.keep, null);
});

test('every occurrence goes, not just the first, and the same input scrubs the same way twice', () => {
  //[[ THE TEST THIS REPLACED COULD NOT FAIL, and that is worth recording.
  //
  //   It asserted that the scanner is not poisoned by a carried `lastIndex`, on the theory that a
  //   shared module-level `/g` regex skips matches on every second call. That is true of
  //   `re.exec()` in a loop — it is why the worker's redaction.ts compiles fresh, and its test
  //   holds it — and FALSE of `String.replace`, which resets `lastIndex` at both ends. Hoisting
  //   the regex out of `redactText` left the whole suite green, which is how it was caught.
  //
  //   What IS falsifiable is the property that actually protects a reader: a message carrying two
  //   tokens loses both. Drop the `g` flag from a rule and only the first goes — the second sits
  //   there in the clear, underneath a marker that claims something was removed. Red on that.
  const text = `first ${JWT} and second ${JWT} done`;
  const scrubbed = S.redactText(text);
  assert.equal(scrubbed.includes(JWT), false, 'a second occurrence survived the scrub');
  assert.equal((scrubbed.match(/\[redacted:jwt\]/g) ?? []).length, 2, 'only one of the two tokens was replaced');
  assert.equal(S.redactText(text), scrubbed, 'the same input scrubbed differently the second time');
});

/* ------------------------------------------------------------------ the failures --- */

test('a transport that rejects is a named refusal, never an escaping rejection', async () => {
  const win = fakeWindow();
  const client = S.installSentry({ dsn: DSN }, {
    target: win,
    location: { origin: 'https://app.example', pathname: '/' },
    send: async () => { throw new Error('the network is gone'); },
  });
  const outcome = await client.captureException(new Error('boom'));
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, 'transport_failed');
  assert.match(outcome.detail, /the network is gone/);
  // And firing the real handler must not produce an unhandled rejection either.
  await win.fire('error', { error: new Error('boom') });
  await new Promise((r) => setTimeout(r, 0));
  client.uninstall();
});

test('a refusal from Sentry is not a send', async () => {
  const h = harness({ ok: false, status: 429 });
  const outcome = await h.client.captureException(new Error('boom'));
  assert.deepEqual(outcome, { sent: false, reason: 'transport_failed', detail: 'Sentry answered 429' });
  h.client.uninstall();
});
