/**
 * w15 — EVERY FAILURE THE USER CAN SEE SAYS WHAT TO DO NEXT.
 *
 * The product had around twenty-five distinct error strings reaching the screen, and most surfaces
 * rendered them raw: `Couldn't load usage: {error.message}`. So a person met "forbidden", "not
 * found", "slow down" or "billing not configured" — each a note one server wrote to another, none
 * of which answers either question they actually have:
 *
 *     1. Did I lose anything?
 *     2. What do I do now?
 *
 * The first is the one nobody answers and the one that makes people redo work that was never lost.
 * Every entry answers it explicitly, including where the honest answer is "we cannot tell".
 *
 * These tests are about the SHAPE of the contract rather than the exact wording: that no failure
 * escapes unclassified, that no explanation is empty, that Retry is offered only where repeating
 * could work, and that the two 429s — out of Credits, and going too fast — never give each other's
 * advice. Wording is checked only where getting it wrong would be a lie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'errtax-')), 'tax.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'error-taxonomy.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const T = await import(out);

/** The client's own error type, reconstructed by shape so the bundle stays small. */
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}
const api = (status, message = 'x') => Object.assign(new ApiError(message, status), { status });

/** Every status the worker actually returns, harvested from index.ts rather than imagined. */
const REAL_STATUSES = [0, 400, 401, 403, 404, 426, 429, 502, 503, 504, 500];

test('EVERY failure is classified — none falls through to a shrug', () => {
  for (const status of REAL_STATUSES) {
    const e = T.explainFailure(api(status));
    assert.ok(e.kind, `${status} produced no kind`);
    assert.ok(e.title && e.title.length > 3, `${status} has no title`);
    assert.ok(e.safety && e.safety.length > 10, `${status} does not say whether anything was lost`);
  }
  // Including things that are not errors at all, because a component cannot promise what it is given.
  for (const junk of [null, undefined, 'a string', 42, {}, new Error('plain')]) {
    const e = T.explainFailure(junk);
    assert.ok(e.kind && e.title && e.safety, `unclassified: ${String(junk)}`);
  }
});

test('a failure never blames the user for our own break', () => {
  // Asserted as the presence of ownership rather than the absence of a phrase: my first version of
  // this matched /you did/ and failed on "not something you did", which is the sentence doing the
  // absolving. A blame check that trips on a denial is checking spelling, not meaning.
  for (const status of [500, 502, 503, 504]) {
    const e = T.explainFailure(api(status));
    const text = `${e.title} ${e.safety}`;
    assert.doesNotMatch(text, /your fault|you must have|check what you sent/i, `${status} blames the user`);
    assert.doesNotMatch(e.title, /invalid|bad request/i, `${status} describes our break as their mistake`);
  }
  assert.match(T.explainFailure(api(500)).safety, /ours to fix/i, 'and one of them says so outright');
  assert.match(T.explainFailure(api(500)).title, /our side/i);
});

test('THE TWO 429s NEVER GIVE EACH OTHER\'S ADVICE', () => {
  // Telling a user who is out of Credits to "wait a few seconds" is a brush-off: waiting seconds
  // does nothing, and the thing that helps is on a page they are not being sent to.
  const spent = T.explainFailure(api(429, 'Daily Credits used up'));
  assert.equal(spent.kind, 'out_of_credits');
  assert.equal(spent.href, '/usage', 'it must point at where the answer is');
  assert.doesNotMatch(spent.next, /few seconds|slow down/i);
  assert.equal(spent.retryable, false, 'repeating it now cannot work');

  const fast = T.explainFailure(api(429, 'Too many requests — slow down.'));
  assert.equal(fast.kind, 'rate_limited');
  assert.equal(fast.retryable, true, 'this one does clear by waiting');
  assert.doesNotMatch(fast.next ?? '', /credits|allowance|renew/i);
});

test('RETRY IS OFFERED ONLY WHERE REPEATING COULD WORK', () => {
  // A Retry on an expired session is a loop: the same dead token fails the same way.
  assert.equal(T.explainFailure(api(401)).retryable, false);
  assert.equal(T.explainFailure(api(403)).retryable, false);
  assert.equal(T.explainFailure(api(404)).retryable, false);
  assert.equal(T.explainFailure(api(503)).retryable, false, 'a deployment without the feature stays without it');
  // And where it genuinely could.
  assert.equal(T.explainFailure(api(0)).retryable, true);
  assert.equal(T.explainFailure(api(500)).retryable, true);
  assert.equal(T.explainFailure(api(429, 'slow down')).retryable, true);
});

test('a session that expired sends them to sign in, and says the work survived', () => {
  const e = T.explainFailure(api(401, 'invalid token'));
  assert.equal(e.kind, 'signed_out');
  assert.equal(e.href, '/login');
  assert.match(e.safety, /saved/i, 'the question they have is whether they lost anything');
});

test('a request that never left the browser says so', () => {
  // The one case where "nothing changed" is certain, and saying it prevents a panicked reload.
  const e = T.explainFailure(api(0, 'Network error — check your connection.'));
  assert.equal(e.kind, 'offline');
  assert.match(e.safety, /nothing was sent/i);
});

test('an upstream timeout does NOT promise that nothing happened', () => {
  // The honest and uncomfortable case: a 502 from a payment or a Studio op may or may not have
  // completed, and claiming otherwise is how a user double-charges themselves.
  const e = T.explainFailure(api(502, 'could not open checkout'));
  assert.equal(e.kind, 'upstream');
  assert.match(e.safety, /cannot tell/i, 'it must not claim nothing happened');
  assert.doesNotMatch(e.safety, /^Nothing was sent/);
});

test('the server\'s own words are kept, but never as the headline', () => {
  const e = T.explainFailure(api(403, 'forbidden'));
  assert.equal(e.detail, 'forbidden', 'support and screenshots need it');
  assert.doesNotMatch(e.title, /forbidden/i, 'but a person is not shown a server\'s vocabulary');
  assert.doesNotMatch(e.title, /40[0-9]|50[0-9]/, 'nor a status code');
});

test('next is ONE action, not a menu', () => {
  for (const status of REAL_STATUSES) {
    const e = T.explainFailure(api(status));
    if (!e.next) continue;
    assert.ok(!e.next.includes(' or else '), `${status} offers alternatives`);
    assert.ok(e.next.split('. ').filter(Boolean).length <= 2, `${status} next is a paragraph: ${e.next}`);
  }
});

test('briefFailure fits a toast and still carries the action', () => {
  const b = T.briefFailure(api(429, 'Daily Credits used up'));
  assert.ok(b.length < 120, `too long for a toast: ${b}`);
  assert.match(b, /Credits/);
});

// --- the surfaces --------------------------------------------------------------------------

test('NO SURFACE RENDERS A RAW SERVER MESSAGE ANY MORE', () => {
  // The actual regression. Every one of these printed `{(error as Error).message}` directly.
  const files = [
    'routes/usage.tsx', 'routes/settings.tsx', 'routes/admin.tsx', 'routes/dashboard.tsx',
    'components/ws/credits-panel.tsx', 'components/ws/memory-panel.tsx',
  ];
  const offenders = files.filter((f) =>
    /\(\s*\w+\.error as Error\s*\)\.message/.test(readFileSync(join(WEB, 'src', f), 'utf8')));
  assert.deepEqual(offenders, [], `still printing raw server text: ${offenders.join(', ')}`);

  // and each one goes through the single component instead
  const without = files.filter((f) => !readFileSync(join(WEB, 'src', f), 'utf8').includes('<Failure'));
  assert.deepEqual(without, [], `not using the shared failure UI: ${without.join(', ')}`);
});

test('the component answers the questions in the order they are asked', () => {
  const src = readFileSync(join(WEB, 'src', 'components', 'failure.tsx'), 'utf8');
  const title = src.indexOf('failure__title');
  const safety = src.indexOf('failure__safety');
  const next = src.indexOf('failure__next');
  const detail = src.indexOf('failure__detail');
  assert.ok(title > 0 && safety > title, 'what happened, then whether anything was lost');
  assert.ok(next > safety, 'then what to do');
  assert.ok(detail > next, 'and the server vocabulary last');
});

test('Retry is rendered only when the explanation says it is retryable', () => {
  const src = readFileSync(join(WEB, 'src', 'components', 'failure.tsx'), 'utf8');
  assert.match(src, /onRetry && e\.retryable/, 'the component must honour retryable, not just onRetry');
});

test('THE TEXT AND THE BUTTON NEVER SAY THE SAME THING', () => {
  // Seen in the rendered preview: the 500 card read "Try again. Try again" — the next-action text
  // beside a button with the same words. Filler like that is how a reader learns to skim the box
  // that was supposed to tell them something.
  for (const status of [0, 401, 403, 404, 429, 500, 502, 503]) {
    const e = T.explainFailure(api(status));
    if (e.retryable && e.next) {
      assert.doesNotMatch(e.next, /^try again/i,
        `${status}: next repeats the Try again button — "${e.next}"`);
    }
  }
});

test('a retryable failure with nothing else to do offers only the button', () => {
  const ours = T.explainFailure(api(500));
  assert.equal(ours.next, null, 'there is nothing to do but press it');
  assert.equal(ours.retryable, true);
  // and the toast, which has no button, still tells them what to do
  assert.match(T.briefFailure(api(500)), /try again/i);
});

test('EVERY LINK A FAILURE OFFERS LANDS ON A ROUTE THAT EXISTS', () => {
  // These hrefs are handed to a react-router <Link> (components/failure.tsx) inside
  // <BrowserRouter basename="/app">, and the router prepends the basename itself. Writing the
  // prefix into the href therefore produced /app/app/usage — a link that cannot resolve — and
  // '/app/sign-in' named a route this app has never had; it is called /login. Both were pinned
  // by this file, so the assertions agreed with the bug.
  //
  // Checked against the router's own path list rather than a copy of it, because a copy drifts.
  const app = readFileSync(join(WEB, 'src', 'app.tsx'), 'utf8');
  const paths = new Set(['/', ...[...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1])]);

  const offered = [
    T.explainFailure(api(401)),
    T.explainFailure(api(403)),
    T.explainFailure(api(404)),
    T.explainFailure(api(429, 'Daily Credits used up')),
    T.explainFailure(api(429, 'slow down')),
    T.explainFailure(api(500)),
    T.explainFailure(api(503)),
    T.explainFailure(api(0)),
  ].filter((e) => e.href);
  assert.ok(offered.length >= 3, 'the taxonomy stopped offering links — that is a different bug');

  for (const e of offered) {
    assert.doesNotMatch(
      e.href,
      /^\/app(\/|$)/,
      `${e.kind} writes the basename into its own href, so the router doubles it: ${e.href}`,
    );
    assert.ok(paths.has(e.href), `${e.kind} points at ${e.href}, which is not a route in app.tsx`);
  }
});
