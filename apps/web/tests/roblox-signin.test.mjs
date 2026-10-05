/**
 * SIGN IN WITH ROBLOX, the browser half: when the button shows, where it goes, and what the landing route
 * does with what the worker hands it (apps/web/src/lib/roblox-signin.ts and the pages that use it).
 *
 * This app has no DOM test environment, so the decisions are tested as functions and the wiring is tested as
 * source text, with each text assertion stating the property rather than the spelling (the way
 * walkable-routes.test.mjs does). The worker half, including everything that crosses the network, is
 * apps/worker/tests/roblox-oauth.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROBLOX_START_PATH,
  completeRobloxSignIn,
  describeConnection,
  disconnectMessage,
  fetchRobloxConfigured,
  parseRobloxFragment,
  robloxStartHref,
} from '../src/lib/roblox-signin.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');
const HASH = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8';

/* ------------------------------------------------------------------ the button shows --- */

test('the button is offered only when the worker answers {"configured": true}', async () => {
  const answer = (status, body, contentType = 'application/json') =>
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
  assert.equal(await fetchRobloxConfigured(answer(200, { configured: true })), true, 'the positive control');
  assert.equal(await fetchRobloxConfigured(answer(200, { configured: false })), false);
  assert.equal(await fetchRobloxConfigured(answer(200, {})), false);
  assert.equal(await fetchRobloxConfigured(answer(200, { configured: 'true' })), false, 'a string is not a yes');
  assert.equal(await fetchRobloxConfigured(answer(503, { configured: true })), false, 'a failing status is not a yes, whatever the body says');
  assert.equal(await fetchRobloxConfigured(answer(429, { configured: true })), false);
  assert.equal(await fetchRobloxConfigured(answer(200, '<!doctype html><title>app</title>', 'text/html')), false, 'a dev server answering with the app shell');
  assert.equal(await fetchRobloxConfigured(async () => { throw new TypeError('network'); }), false);
});

test('the status check asks the worker route and is never cached', async () => {
  let seen;
  await fetchRobloxConfigured(async (url, init) => { seen = { url, init }; return new Response('{"configured":true}'); });
  assert.equal(seen.url, '/auth/roblox/status');
  assert.equal(seen.init.cache, 'no-store');
});

/* ------------------------------------------------------------------ where it goes --- */

test('the button links to the worker start route, and carries a return path only when it is an app path', () => {
  assert.equal(robloxStartHref('/'), ROBLOX_START_PATH);
  assert.equal(robloxStartHref(undefined), ROBLOX_START_PATH);
  assert.equal(robloxStartHref('/usage'), '/auth/roblox/start?return=%2Fusage');
  assert.equal(robloxStartHref('/join?token=abc'), '/auth/roblox/start?return=%2Fjoin%3Ftoken%3Dabc');
  for (const hostile of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '/a\nb']) {
    assert.equal(robloxStartHref(hostile), ROBLOX_START_PATH, `${JSON.stringify(hostile)} must not become a return path`);
  }
});

/* --------------------------------------------------------------- the landing route --- */

test('the fragment is read for a token hash of a sane shape, and a hostile next is dropped', () => {
  assert.deepEqual(parseRobloxFragment(`#token_hash=${HASH}`), { tokenHash: HASH, next: '/' });
  assert.deepEqual(parseRobloxFragment(`token_hash=${HASH}&next=%2Fusage`), { tokenHash: HASH, next: '/usage' });
  assert.equal(parseRobloxFragment(`#token_hash=${HASH}&next=${encodeURIComponent('//evil.example')}`).next, '/');
  assert.equal(parseRobloxFragment(`#token_hash=${HASH}&next=${encodeURIComponent('https://evil.example')}`).next, '/');
  for (const bad of ['', '#', '#token_hash=', '#token_hash=short', `#token_hash=${HASH}%0d%0a`, '#token_hash=<script>alert(1)</script>aaaaaaaaaaaaaaaa', `#other=${HASH}`, `#token_hash=${'a'.repeat(300)}`]) {
    assert.equal(parseRobloxFragment(bad), null, `${bad.slice(0, 30)} must not reach Supabase`);
  }
});

test('the landing route trades the hash with verifyOtp as a magic link and moves on only when Supabase accepts it', async () => {
  const calls = [];
  const verify = (result) => async (args) => { calls.push(args); if (result instanceof Error) throw result; return { error: result }; };

  assert.deepEqual(await completeRobloxSignIn(`#token_hash=${HASH}&next=%2Fsettings`, verify(null)), { kind: 'signed-in', next: '/settings' });
  assert.deepEqual(calls, [{ token_hash: HASH, type: 'magiclink' }]);

  assert.deepEqual(await completeRobloxSignIn(`#token_hash=${HASH}`, verify({ message: 'Token has expired or is invalid' })), { kind: 'failed' });
  assert.deepEqual(await completeRobloxSignIn(`#token_hash=${HASH}`, verify(new Error('network'))), { kind: 'failed' }, 'a throw is a failure, never a sign-in');

  const before = calls.length;
  assert.deepEqual(await completeRobloxSignIn('#nothing', verify(null)), { kind: 'failed' });
  assert.equal(calls.length, before, 'a fragment with no token never reaches Supabase');
});

/* --------------------------------------------------------------- the settings card --- */

test('the Connections card says what is linked, and what Disconnect will and will not do', () => {
  const base = { configured: true, connected: true, username: 'Builder1', linkedAt: '2026-10-05T00:00:00Z', signInOnly: false };
  const plain = describeConnection(base);
  assert.equal(plain.status, 'Connected as Builder1.');
  assert.equal(plain.canDisconnect, true);
  assert.match(plain.caution, /no longer sign in with Roblox/);

  const only = describeConnection({ ...base, signInOnly: true });
  assert.equal(only.canDisconnect, true);
  assert.match(only.caution, /still sign in with Roblox/, 'when Roblox is the only way in, the card says Disconnect will not remove it');
  assert.match(only.caution, /email address and set a password/);

  const none = describeConnection({ ...base, connected: false, username: null });
  assert.equal(none.canDisconnect, false);
  assert.match(none.status, /^Not connected\./);
  assert.equal(describeConnection({ ...base, connected: false, configured: false, username: null }).status, 'Not available yet.');
});

test('the Disconnect message matches what the server did', () => {
  assert.equal(disconnectMessage({ revoked: true, tokenRemoved: true, linkRemoved: true, signInKept: false }), 'Roblox disconnected.');
  assert.match(disconnectMessage({ revoked: true, tokenRemoved: true, linkRemoved: false, signInKept: true }), /still how you sign in/);
  assert.equal(disconnectMessage({ revoked: null, tokenRemoved: false, linkRemoved: false, signInKept: false }), 'There was nothing connected.');
});

/* -------------------------------------------------------------------------- wiring --- */

/** The text of one exported function or component, from its declaration to the next top-level declaration. */
function bodyOf(src, name) {
  const at = src.search(new RegExp(`^(?:export )?function ${name}\\b`, 'm'));
  assert.ok(at >= 0, `${name} is not declared`);
  const rest = src.slice(at + 10);
  const next = rest.search(/^(?:export )?(?:function|const|\/\*) /m);
  return src.slice(at, next < 0 ? undefined : at + 10 + next);
}

test('"Continue with Roblox" is on the sign-in page and the sign-up page, and renders nothing until the worker says yes', () => {
  const pages = read('routes', 'auth-pages.tsx');
  for (const page of ['LoginPage', 'SignupPage']) {
    assert.match(bodyOf(pages, page), /<RobloxSignIn\b/, `${page} does not offer Roblox`);
  }
  const button = bodyOf(pages, 'RobloxSignIn');
  assert.match(button, /fetchRobloxConfigured\(/, 'the button does not ask the worker whether it can work');
  // The guard comes before any markup: nothing is drawn while the answer is no or not yet known.
  assert.ok(button.indexOf('if (!configured) return null') > 0 && button.indexOf('if (!configured) return null') < button.indexOf('<a '),
    'the link is drawn before the configured check');
  assert.match(button, /robloxStartHref\(/);
  assert.match(button, /Continue with Roblox/);
});

test('only Roblox is added: no Google or Discord sign-in button exists, because those providers are not enabled', () => {
  const pages = read('routes', 'auth-pages.tsx');
  assert.equal(/signInWithOAuth/.test(pages), false, 'a Supabase OAuth button was added');
  assert.equal(/Continue with (Google|Discord|GitHub|Facebook)/i.test(pages), false);
});

test('the landing route is declared outside both guards and the page clears the fragment before it trades it', () => {
  const app = read('app.tsx');
  const at = app.indexOf('path="/auth/roblox"');
  assert.ok(at > 0, 'there is no /auth/roblox route');
  const tag = app.slice(app.lastIndexOf('<Route', at), app.indexOf('/>', at) + 2);
  assert.match(tag, /<RobloxCallbackPage\s*\/>/);
  assert.equal(/GuestGuard|AuthGuard/.test(tag), false, 'the landing route is behind a guard that would bounce it');
  assert.ok(at < app.indexOf('<AuthGuard>'), 'the landing route is declared inside the guarded group');

  const page = bodyOf(read('routes', 'auth-pages.tsx'), 'RobloxCallbackPage');
  const cleared = page.indexOf('replaceState');
  const traded = page.indexOf('completeRobloxSignIn(');
  assert.ok(cleared > 0 && traded > 0, 'the page must clear the fragment and trade it');
  assert.ok(cleared < traded, 'the token hash stays in the address bar until after it is used');
  assert.match(page, /verifyOtp\(/, 'the session is made by Supabase, not by the worker');
  assert.match(page, /role="alert"/, 'a failed sign-in has its own state');
  assert.match(page, /to="\/login"/, 'and a way out of it');
});

test('the Connections card is a row in settings, reachable from search', () => {
  assert.match(read('routes', 'settings.tsx'), /<Row id="roblox-signin"[^>]*>\s*<RobloxConnectionCard\b/);
  assert.match(read('lib', 'settings-search.ts'), /id: 'roblox-signin'/);
  const card = read('components', 'roblox-connection-card.tsx');
  assert.match(card, /disconnectRobloxSignIn/);
  assert.match(card, /Disconnect Roblox/);
});
