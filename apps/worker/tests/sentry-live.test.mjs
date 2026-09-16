/**
 * ERROR MONITORING, THROUGH THE WORKER THAT ACTUALLY SERVES REQUESTS.
 *
 * sentry.test.mjs proves the module. This proves it is WIRED — that `app.use('*', …)` is
 * registered, that it is registered OUTERMOST, and that an error thrown inside the real middleware
 * chain reaches Sentry carrying the real request's route and method and none of the real request's
 * secrets. A monitoring module with no caller is the same defect as a retention sweep with no
 * cron, and this repository has shipped that defect before.
 *
 * THE TWO THINGS ONLY AN END-TO-END RUN CAN SHOW:
 *
 *   1. THE STRUCTURAL SCRUB, driven with real inputs. The request below carries a Supabase-shaped
 *      JWT in its Authorization header, a paragraph of prompt text in its body, an access token in
 *      its query string and a project uuid in its path. None of that is redacted by any pattern —
 *      prose matches no rule — and none of it reaches Sentry, because sentry.ts holds no reference
 *      to a Request. That is a property of the wiring, not of the module, so it is asserted here.
 *
 *   2. THE RESPONSE IS UNCHANGED. The same request is driven twice, with SENTRY_DSN set and unset,
 *      and the two responses are compared status and body. Nothing short of driving the real Hono
 *      error handler establishes that.
 *
 * Run: node --test tests/sentry-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-sentry-live-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      // The ONLY substitution that matters: an auth boundary that throws. Everything else in the
      // chain — the Sentry middleware, the request log, Hono's error handler — is the real code.
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth-boom.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(pathToFileURL(OUT).href)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const DSN = 'https://abc123def456@o4500.ingest.us.sentry.io/4509';

/* ----------------------------------------------------------------- the needles --- */

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkEgUGVyc29uIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const EMAIL = 'someone.real@example.com';
/** Prose. No redaction rule matches it — its absence has to come from the allowlist. */
const PROMPT = 'build me an obby with lava floors and a checkpoint every twenty studs';
const QUERY_TOKEN = 'sk-live-thisisaquerystringsecret';
const PROJECT_ID = '8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

const DB = d1();
const baseEnv = {
  CORPUS: DB.CORPUS,
  ENVIRONMENT: 'production',
  // Read by tests/stubs/auth-boom.mjs. The throw has to come from a middleware INSIDE the Sentry
  // one and OUTSIDE every handler, which is exactly where the credential check sits.
  AUTH_EXPLODES: true,
  BUILD_SHA: 'cafe123',
  ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{"stored":0}', { status: 200 }); } }) },
  QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
};

/** Every envelope the worker tried to POST during one run, plus the response it produced. */
async function drive(env) {
  const envelopes = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('/envelope/')) {
      envelopes.push({ url: href, headers: init?.headers ?? {}, body: String(init?.body ?? '') });
      return new Response('{}', { status: 200 });
    }
    return realFetch(url, init);
  };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p), passThroughOnException() {} };
  try {
    const res = await app.request(
      `https://apple.example/api/projects/${PROJECT_ID}/ws?access_token=${QUERY_TOKEN}&email=${EMAIL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: PROMPT, user: EMAIL }),
      },
      env,
      ctx,
    );
    const body = await res.text();
    await Promise.allSettled(pending);
    return { status: res.status, body, envelopes };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ------------------------------------------------------------------- the tests --- */

test('an unhandled error in the real middleware chain reaches Sentry', async () => {
  const run = await drive({ ...baseEnv, SENTRY_DSN: DSN });
  assert.equal(run.status, 500, 'the request under test did not actually fail');
  assert.equal(run.envelopes.length, 1, `${run.envelopes.length} envelopes were sent`);
  assert.equal(run.envelopes[0].url, 'https://o4500.ingest.us.sentry.io/api/4509/envelope/');
  const event = JSON.parse(run.envelopes[0].body.trim().split('\n')[2]);
  assert.equal(event.exception.values[0].value, 'the credential check exploded');
  assert.equal(event.tags.capture, 'unhandled');
  assert.equal(event.tags.method, 'POST');
  assert.equal(event.release, 'cafe123', 'the build sha did not travel with the error');
  assert.equal(event.environment, 'production');
  // The route is LABELLED by the same function the analytics event uses.
  assert.equal(event.transaction, '/api/projects/:id/ws');
});

test('the envelope carries no JWT, no email, no prompt text and no project id', async () => {
  const run = await drive({ ...baseEnv, SENTRY_DSN: DSN });
  const body = run.envelopes[0].body;
  //[[ NONE OF THESE IS REMOVED BY A PATTERN.
  //
  //   The prompt is prose and the project id is a uuid in a path; no rule in redaction.ts claims
  //   either. They are absent because sentry.ts cannot see the Request at all — there is no
  //   argument to `buildEvent` through which a body, a header or a query string could arrive.
  //   That is the guarantee, and this is the test that holds it against the real wiring rather
  //   than against a fixture. ]]
  assert.equal(body.includes(JWT), false, 'the Supabase JWT from the Authorization header reached Sentry');
  assert.equal(body.includes(PROMPT), false, "the user's prompt reached Sentry");
  assert.equal(body.includes(EMAIL), false, 'an email address reached Sentry');
  assert.equal(body.includes(QUERY_TOKEN), false, 'a token from the query string reached Sentry');
  assert.equal(body.includes(PROJECT_ID), false, 'a project id reached Sentry');
  assert.equal(body.includes('access_token'), false, 'the query string reached Sentry');
  // The Authorization header is not forwarded to Sentry either — only the envelope auth is.
  assert.equal(JSON.stringify(run.envelopes[0].headers).includes(JWT), false);
});

test('the error response the client gets is byte-for-byte the same with and without a DSN', async () => {
  const monitored = await drive({ ...baseEnv, SENTRY_DSN: DSN });
  const unmonitored = await drive({ ...baseEnv });
  assert.equal(unmonitored.status, monitored.status, 'the status changed when monitoring was switched on');
  assert.equal(unmonitored.body, monitored.body, 'the body changed when monitoring was switched on');
  assert.equal(monitored.status, 500);
  // Hono's own error handler, untouched. Red if anything adds an `app.onError`.
  assert.equal(monitored.body, 'Internal Server Error');
  // And with no DSN, nothing was sent. A count, not the absence of a log line.
  assert.equal(unmonitored.envelopes.length, 0, `${unmonitored.envelopes.length} envelopes were sent with no DSN configured`);
  assert.equal(monitored.envelopes.length, 1);
});

test('a request that succeeds reports nothing', async () => {
  const realFetch = globalThis.fetch;
  const envelopes = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/envelope/')) { envelopes.push(String(url)); return new Response('{}', { status: 200 }); }
    return realFetch(url, init);
  };
  const pending = [];
  try {
    const res = await app.request('https://apple.example/api/health', {}, { ...baseEnv, AUTH_EXPLODES: false, SENTRY_DSN: DSN }, { waitUntil: (p) => pending.push(p), passThroughOnException() {} });
    assert.equal(res.status, 200, 'the healthy request under test was not healthy');
    await Promise.allSettled(pending);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(envelopes, [], 'a successful request was reported as an error');
});

test('the Sentry middleware is registered before every other one, and it is the only capture point', async () => {
  //[[ POSITION IS BEHAVIOUR HERE, and no request can show it.
  //
  //   Hono composes middleware in registration order. Registered first, `app.use('*')` wraps
  //   `/api/*`, `/v1/*`, the static handler and the not-found handler; registered after the
  //   `/api/*` block it still passes every test above — the `/api` route is covered either way —
  //   while silently reporting nothing for the public API or the marketing site. So the ORDER is
  //   asserted against the source, which is the only place it is visible.
  //
  //   Red if anyone moves the line, and red if anyone adds an `app.onError`, which would replace
  //   the response the test above pins. ]]
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  const sentryAt = src.indexOf("app.use('*', sentryMiddleware(routeLabel))");
  assert.notEqual(sentryAt, -1, 'index.ts no longer registers the Sentry middleware');
  const firstOther = src.search(/app\.use\('\/(api|v1)/);
  assert.notEqual(firstOther, -1);
  assert.ok(sentryAt < firstOther, 'the Sentry middleware is no longer outermost — /v1 and static failures are invisible again');
  assert.equal(/app\.onError\(/.test(src), false, 'an app.onError would change the error response Sentry promises not to change');
});
