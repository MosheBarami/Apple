/**
 * SIGN IN WITH ROBLOX, the browser half, EXECUTED: when the button shows, what the landing page does with what
 * the worker hands back, and what the Connections card says.
 *
 * Nothing here reads source text for a spelling or an ordering. There is no DOM package in this app, so the
 * behaviour is reached three ways, each by running the shipped code:
 *
 *   - the functions in lib/roblox-signin.ts are called with stand-ins for fetch and Supabase;
 *   - the hooks in the same file (the status check, the landing page's state) are RUN, effects and all, against
 *     a small stand-in for React (tests/hook-harness.mjs), so what happens after mount is observed, not assumed;
 *   - the components in routes/auth-pages.tsx are bundled with the real React and rendered to markup
 *     (tests/ui-bundle.mjs), so what is checked is what a browser would receive;
 *   - the landing PAGE itself, RobloxCallbackPage, is run (tests/page-harness.mjs): its own wiring of currentAccount, redeem,
 *     verifyOtp, navigate, onSwitch and onStay is executed against a stand-in Supabase client and router, not read.
 *
 * The only structural checks left are two questions of WHERE a component sits (inside which route, inside which
 * page), which have no runtime answer without a browser, and they read the syntax tree rather than the text.
 *
 * WHAT EACH GROUP GUARDS:
 *   - a button that leads to an error page (shown when the worker says no, or before it has said anything);
 *   - a LOGIN CSRF through this page: it must never take a token from the URL. The worker's redirect carries
 *     nothing; the token comes from a same-origin POST that only the browser holding the cookie can answer;
 *   - a session silently replaced: somebody already signed in here is asked before the Roblox account takes over, and when
 *     the account really changes, the previous one's drafts, searches and view state are cleared;
 *   - an account that cannot use the product: a Roblox-only account has no password, so Settings (export, delete, sign out
 *     everywhere) must be reachable by signing in with Roblox again, and its placeholder address is never shown as its own.
 *
 * The worker half, including everything that crosses the network, is apps/worker/tests/roblox-oauth.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { WEB, bundle, renderWith, text } from './ui-bundle.mjs';
import { matchSettings } from '../src/lib/settings-search.ts';
import { loadWithReact } from './hook-harness.mjs';
import { findAll, findElement, loadPage, textOf } from './page-harness.mjs';
import { REAUTH_WINDOW_MS, SENSITIVE_ACTIONS, resumeActionFrom } from '../src/lib/auth-flows.ts';
import { accountIdentity, isPlaceholderAddress, isRobloxAccount } from '../src/lib/account-identity.ts';
import { clearAccountState } from '../src/lib/account-state.ts';
import { writeDraft } from '../src/lib/draft.ts';
import { rememberSearch } from '../src/lib/search-history.ts';
import { writeViewChoice } from '../src/lib/view-state.ts';
import {
  ROBLOX_CREATE_PATH,
  ROBLOX_DECLINE_PATH,
  ROBLOX_REDEEM_PATH,
  ROBLOX_START_PATH,
  completeRobloxSignIn,
  continueRobloxNewAccount,
  createRobloxAccount,
  declineRobloxAccount,
  describeConnection,
  disconnectMessage,
  existingSessionLine,
  fetchRobloxConfigured,
  redeemRobloxSignIn,
  robloxReauthHref,
  robloxStartHref,
  startRobloxLanding,
} from '../src/lib/roblox-signin.ts';

const HASH = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8';
const ATTACKER_HASH = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4';

const answer = (status, body, contentType = 'application/json') =>
  async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });

/** A promise the test resolves by hand, so "before the answer arrives" is a state it can hold and look at. */
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

/** Run `body` with `fetch` replaced, and put it back whatever happens. */
async function withFetch(impl, body) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await body();
  } finally {
    globalThis.fetch = real;
  }
}

const M = await loadWithReact('src/lib/roblox-signin.ts', 'roblox-signin');
const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { MemoryRouter } from 'react-router-dom';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { RobloxCallbackPage, RobloxLandingView, RobloxSignIn, RobloxSignInView } from './src/routes/auth-pages';
  import { RobloxConnectionCard } from './src/components/roblox-connection-card';
  import { ReauthDialog } from './src/components/reauth-dialog';
  import { AuthContext } from './src/lib/auth';
  export { h, renderToStaticMarkup, MemoryRouter, QueryClient, QueryClientProvider, RobloxCallbackPage, RobloxLandingView, RobloxSignIn, RobloxSignInView, RobloxConnectionCard, ReauthDialog, AuthContext };
`, { name: 'roblox-signin', resolveDir: WEB });
const render = (element) => renderWith(ui.renderToStaticMarkup, ui.h(ui.MemoryRouter, null, element));
const noop = () => {};

/* ------------------------------------------------------------------ the button shows --- */

test('the status check says yes only for {"configured": true} on a 200', async () => {
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

test('THE BUTTON is not there before the worker answers, and is there only after {"configured": true}', async () => {
  for (const [what, respond, shown] of [
    ['configured: true', answer(200, { configured: true }), true],
    ['configured: false', answer(200, { configured: false }), false],
    ['an empty object', answer(200, {}), false],
    ['a 503 that says true', answer(503, { configured: true }), false],
    ['a network failure', async () => { throw new TypeError('network'); }, false],
  ]) {
    const held = gate();
    await withFetch(async (...args) => { await held.promise; return respond(...args); }, async () => {
      const hook = M.mountStub(() => M.useRobloxConfigured());
      assert.equal(hook.result, false, `${what}: nothing is drawn on the first render`);
      await hook.settle();                                  // effects committed; the status check is in flight
      assert.equal(hook.result, false, `${what}: nothing is drawn while the worker has not answered`);
      held.open();
      await hook.settle();
      assert.equal(hook.result, shown, `${what}: once it has answered`);
    });
  }
});

test('an answer that arrives after the page has gone is not applied', async () => {
  const held = gate();
  await withFetch(async () => { await held.promise; return new Response('{"configured":true}'); }, async () => {
    const hook = M.mountStub(() => M.useRobloxConfigured());
    await hook.settle();
    hook.unmount();
    held.open();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hook.setsAfterUnmount, 0, 'a state update was attempted on an unmounted component');
  });
});

test('"Continue with Roblox" is drawn only when told the worker can finish a sign-in, and links to the start route', () => {
  assert.equal(render(ui.h(ui.RobloxSignInView, { configured: false, from: '/' })), '', 'nothing, not a disabled button');
  const html = render(ui.h(ui.RobloxSignInView, { configured: true, from: '/' }));
  assert.match(html, /<a [^>]*href="\/auth\/roblox\/start"[^>]*>Continue with Roblox<\/a>/);
  assert.match(render(ui.h(ui.RobloxSignInView, { configured: true, from: '/usage' })), /href="\/auth\/roblox\/start\?return=%2Fusage"/);
});

test('the button the pages use is NOT in the first render: it waits for the worker', () => {
  assert.equal(render(ui.h(ui.RobloxSignIn, { from: '/' })), '', 'the markup a visitor first receives has no Roblox button');
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

test('REDEEM is a same-origin POST with no body and no secret in the URL, and its answer is checked before it is believed', async () => {
  let seen;
  const good = await redeemRobloxSignIn(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ token_hash: HASH, next: '/usage' }), { status: 200 });
  });
  assert.deepEqual(good, { tokenHash: HASH, next: '/usage' });
  assert.equal(seen.url, ROBLOX_REDEEM_PATH);
  assert.equal(seen.url.includes('?') || seen.url.includes('#'), false, 'nothing in the URL');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.credentials, 'same-origin', 'the handle cookie goes along, and only to this origin');
  assert.equal(seen.init.body, undefined, 'no body: the cookie is the whole request');
  assert.equal(seen.init.cache, 'no-store');

  const reply = (body, status = 200) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  assert.equal((await redeemRobloxSignIn(reply({ token_hash: HASH, next: '//evil.example' }))).next, '/', 'a hostile return path is dropped');
  assert.equal((await redeemRobloxSignIn(reply({ token_hash: HASH, next: 'https://evil.example' }))).next, '/');
  assert.equal((await redeemRobloxSignIn(reply({ token_hash: HASH }))).next, '/', 'and a missing one is the home screen');
  for (const bad of [{ error: 'x' }, { token_hash: '' }, { token_hash: 'short' }, { token_hash: `${HASH}%0d%0a` }, { token_hash: '<script>alert(1)</script>aaaaaaaaaaaaaaaa' }, { token_hash: 'a'.repeat(300) }, { token_hash: 12345678901234567890 }, 'not json']) {
    assert.equal(await redeemRobloxSignIn(reply(bad)), null, `${JSON.stringify(bad).slice(0, 40)} must not reach Supabase`);
  }
  for (const status of [400, 403, 429, 500, 503]) assert.equal(await redeemRobloxSignIn(reply({ token_hash: HASH }, status)), null, `a ${status} is a failure whatever the body says`);
  assert.equal(await redeemRobloxSignIn(async () => { throw new TypeError('network'); }), null);
});

test('the landing page trades what it redeemed with verifyOtp as a magic link, and moves on only when Supabase accepts it', async () => {
  const calls = [];
  const verify = (result) => async (args) => { calls.push(args); if (result instanceof Error) throw result; return { data: { user: { id: 'u2' } }, error: result }; };
  const deps = (over = {}) => ({ redeem: async () => ({ tokenHash: HASH, next: '/settings' }), verifyOtp: verify(null), accountSwitched: noop, ...over });

  assert.deepEqual(await completeRobloxSignIn(deps()), { kind: 'signed-in', next: '/settings' });
  assert.deepEqual(calls, [{ token_hash: HASH, type: 'magiclink' }]);
  assert.deepEqual(await completeRobloxSignIn(deps({ verifyOtp: verify({ message: 'Token has expired or is invalid' }) })), { kind: 'failed' });
  assert.deepEqual(await completeRobloxSignIn(deps({ verifyOtp: verify(new Error('network')) })), { kind: 'failed' }, 'a throw is a failure, never a sign-in');

  const before = calls.length;
  assert.deepEqual(await completeRobloxSignIn(deps({ redeem: async () => null })), { kind: 'failed' });
  assert.equal(calls.length, before, 'when nothing was redeemed Supabase is never called');
});

test('when the session that results belongs to a DIFFERENT account than the one it replaced, the old account’s local state is cleared; for the same account it is kept', async () => {
  const run = async (previous, answer) => {
    let cleared = 0;
    const out = await completeRobloxSignIn({ redeem: async () => ({ tokenHash: HASH, next: '/' }), verifyOtp: async () => answer, accountSwitched: () => { cleared += 1; } }, previous);
    return { out, cleared };
  };
  const ok = (id) => ({ data: id === undefined ? { user: null } : { user: { id } }, error: null });
  assert.deepEqual(await run(null, ok('b')), { out: { kind: 'signed-in', next: '/' }, cleared: 0 }, 'nobody was signed in: nothing of anybody’s to clear');
  assert.equal((await run({ id: 'a' }, ok('b'))).cleared, 1, 'a replaced by b');
  assert.equal((await run({ id: 'a' }, ok('a'))).cleared, 0, 'the same account confirming it is them keeps its drafts');
  assert.equal((await run({ id: 'a' }, ok(undefined))).cleared, 1, 'when it cannot be said to be the same account it is treated as another');
  assert.equal((await run({ id: 'a' }, { data: null, error: { message: 'expired' } })).cleared, 0, 'a failed sign-in replaced nothing');
  // A cleanup that throws does not undo a sign-in that happened.
  const thrown = await completeRobloxSignIn({ redeem: async () => ({ tokenHash: HASH, next: '/x' }), verifyOtp: async () => ok('b'), accountSwitched: () => { throw new Error('storage'); } }, { id: 'a' });
  assert.deepEqual(thrown, { kind: 'signed-in', next: '/x' });
});

/** The landing hook with recording stand-ins. `over` replaces any of them. */
function landing(over = {}) {
  const calls = { account: 0, redeem: 0, create: 0, decline: 0, verify: [], switched: 0 };
  const deps = {
    currentAccount: async () => { calls.account += 1; if (over.accountThrows) throw new Error('storage'); return over.account ?? null; },
    // `redeemed` may be a list: the first answer, then the next (a first sight is asked, then redeemed again once it has been made).
    redeem: async () => { calls.redeem += 1; const answers = Array.isArray(over.redeemed) ? over.redeemed : [over.redeemed]; const answer = answers[Math.min(calls.redeem, answers.length) - 1]; return answer === undefined ? { tokenHash: HASH, next: '/settings' } : answer; },
    create: async () => { calls.create += 1; return over.created ?? { ok: true }; },
    decline: async () => { calls.decline += 1; },
    verifyOtp: async (args) => { calls.verify.push(args); return { data: { user: { id: over.newUserId ?? 'the-new-user' } }, error: over.verifyError ?? null }; },
    accountSwitched: () => { calls.switched += 1; },
  };
  const signedIn = [];
  const declined = [];
  const hook = M.mountStub(() => M.useRobloxLanding(deps, (next) => signedIn.push(next), () => declined.push(true)));
  return { hook, calls, signedIn, declined };
}

test('LANDING, nobody signed in here: it redeems, trades the token, and goes where the person was heading, once', async () => {
  const { hook, calls, signedIn } = landing();
  assert.deepEqual(hook.result.state, { kind: 'working' }, 'it starts working, not failed and not asking');
  await hook.settle();
  assert.deepEqual(calls.verify, [{ token_hash: HASH, type: 'magiclink' }]);
  assert.deepEqual(signedIn, ['/settings']);
  hook.rerender();                                          // a re-render must not redeem again: the handle is single use
  await hook.settle();
  assert.equal(calls.redeem, 1);
  assert.deepEqual(signedIn, ['/settings']);
});

test('LANDING never takes a token from the URL: a crafted fragment or query is not read, and is never traded', async () => {
  // The attack: finish a flow on your own Roblox account, then hand the victim /app/auth/roblox#token_hash=<yours>.
  const reads = [];
  const real = globalThis.window;
  globalThis.window = { location: {
    get hash() { reads.push('hash'); return `#token_hash=${ATTACKER_HASH}&next=%2Fsettings`; },
    get search() { reads.push('search'); return `?token_hash=${ATTACKER_HASH}`; },
    get href() { reads.push('href'); return `https://studpilot.app/app/auth/roblox#token_hash=${ATTACKER_HASH}`; },
  } };
  try {
    const { hook, calls, signedIn } = landing();
    await hook.settle();
    assert.deepEqual(reads, [], 'the page looked at the address for something to trade');
    assert.deepEqual(calls.verify, [{ token_hash: HASH, type: 'magiclink' }], 'only what the worker redeemed for THIS browser was traded');
    assert.equal(JSON.stringify(calls.verify).includes(ATTACKER_HASH), false);
    assert.deepEqual(signedIn, ['/settings']);

    // And with nothing to redeem (the victim's browser has no handle cookie) the crafted link signs in nobody.
    const victim = landing({ redeemed: null });
    await victim.hook.settle();
    assert.deepEqual(victim.calls.verify, [], 'a link alone signs nobody in');
    assert.deepEqual(victim.signedIn, []);
    assert.deepEqual(victim.hook.result.state, { kind: 'failed' });
  } finally {
    if (real === undefined) delete globalThis.window; else globalThis.window = real;
  }
});

test('LANDING with somebody already signed in here ASKS first: nothing is redeemed and nothing is replaced until they say so', async () => {
  const { hook, calls, signedIn } = landing({ account: { id: 'u1', email: 'me@example.com', roblox: false } });
  await hook.settle();
  assert.deepEqual(hook.result.state, { kind: 'choice', id: 'u1', email: 'me@example.com', roblox: false });
  assert.equal(calls.redeem, 0, 'the handle is not spent while the person is deciding');
  assert.deepEqual(calls.verify, [], 'the existing session is untouched');
  assert.deepEqual(signedIn, []);

  hook.result.switchNow();                                  // "Switch to my Roblox account"
  hook.rerender();
  assert.deepEqual(hook.result.state, { kind: 'working' }, 'the choice is replaced by a working card while it signs in');
  await hook.settle();
  assert.equal(calls.redeem, 1);
  assert.deepEqual(calls.verify, [{ token_hash: HASH, type: 'magiclink' }]);
  assert.deepEqual(signedIn, ['/settings']);
  assert.equal(calls.switched, 1, 'the account that was here was replaced by another (the-new-user), so its local state was cleared');
});

test('LANDING failures end in a failed state with nothing signed in, and say so rather than guessing', async () => {
  for (const [what, over] of [
    ['the handle cannot be redeemed', { redeemed: null }],
    ['Supabase refuses the token', { verifyError: { message: 'expired' } }],
    ['it cannot be told whether somebody is signed in', { accountThrows: true }],
  ]) {
    const { hook, calls, signedIn } = landing(over);
    await hook.settle();
    assert.deepEqual(hook.result.state, { kind: 'failed' }, what);
    assert.deepEqual(signedIn, [], what);
    if (over.accountThrows) assert.equal(calls.redeem, 0, 'unable to tell who is signed in, it must not redeem and replace');
  }
  // From the choice, a switch that then fails is a failure too.
  const { hook } = landing({ account: { id: 'u1', email: null, roblox: false }, redeemed: null });
  await hook.settle();
  hook.result.switchNow();
  await hook.settle();
  assert.deepEqual(hook.result.state, { kind: 'failed' });
});

test('startRobloxLanding asks about the existing session before it redeems anything', async () => {
  const order = [];
  const deps = {
    currentAccount: async () => { order.push('account'); return null; },
    redeem: async () => { order.push('redeem'); return { tokenHash: HASH, next: '/' }; },
    verifyOtp: async () => { order.push('verify'); return { error: null }; },
    create: async () => ({ ok: true }),
    decline: async () => {},
    accountSwitched: noop,
  };
  await startRobloxLanding(deps);
  assert.deepEqual(order, ['account', 'redeem', 'verify']);
});

test('the sentence about the existing session names the account, and never a placeholder address', () => {
  assert.match(existingSessionLine('me@example.com'), /already signed in as me@example\.com/);
  for (const email of [null, 'roblox-0a1b2c3d4e5f60718293a4b5c6d7e8f9@users.studpilot.invalid']) {
    assert.doesNotMatch(existingSessionLine(email), / as /, `${email} is not somebody's name`);
    assert.doesNotMatch(existingSessionLine(email), /invalid/);
  }
  assert.match(existingSessionLine(null), /replace that session/);
});

/* ------------------------------------------------- what the landing page shows --- */

test('the landing page draws one card per state: working, a choice with two buttons, and a failure with a way out', () => {
  const view = (state) => render(ui.h(ui.RobloxLandingView, { state, onSwitch: noop, onStay: noop, onContinue: noop, onBack: noop }));

  const working = view({ kind: 'working' });
  assert.match(working, /role="status"/);
  assert.match(text(working), /Signing you in/);
  assert.equal(/<button|<a /.test(working), false, 'nothing to press while it works');

  const choice = view({ kind: 'choice', id: 'u1', email: 'me@example.com', roblox: false });
  assert.match(text(choice), /already signed in as me@example\.com/);
  assert.deepEqual([...choice.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]), ['Switch to my Roblox account', 'Stay signed in']);
  assert.equal(/role="alert"/.test(choice), false);

  // A Roblox account that is already signed in is somebody confirming it is them (Settings sends it here instead of asking for a
  // password it does not have), so the card says what continuing does and offers Continue and Cancel, not "switch".
  const confirming = view({ kind: 'choice', id: 'u1', email: 'roblox-0a1b2c3d4e5f60718293a4b5c6d7e8f9@users.studpilot.invalid', roblox: true });
  assert.match(text(confirming), /Confirm it is you/);
  assert.doesNotMatch(text(confirming), /invalid/, 'the placeholder address is not on the page');
  assert.deepEqual([...confirming.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]), ['Continue with Roblox', 'Cancel']);

  const failed = view({ kind: 'failed' });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /<a [^>]*href="\/login"[^>]*>Back to sign in<\/a>/, 'a failed sign-in has a way out');
  assert.match(text(failed), /could not sign you in/i);
});

test('the landing ROUTE starts in the working state: the first thing a visitor receives is neither an error nor a choice', () => {
  const html = render(ui.h(ui.RobloxCallbackPage));
  assert.match(text(html), /Signing you in/);
  assert.equal(/role="alert"|Switch to my Roblox account/.test(html), false);
});

/* --------------------------------------------------------------- the settings card --- */

test('the Connections card says what is linked, and what Disconnect will and will not do', () => {
  const base = { configured: true, connected: true, username: 'Builder1', linkedAt: '2026-10-05T00:00:00Z', signInOnly: false };
  const plain = describeConnection(base);
  assert.equal(plain.status, 'Connected as Builder1.');
  assert.equal(plain.canDisconnect, true);
  assert.match(plain.caution, /no longer sign in with Roblox/);

  const none = describeConnection({ ...base, connected: false, username: null });
  assert.equal(none.canDisconnect, false);
  assert.match(none.status, /^Not connected\./);
  assert.equal(describeConnection({ ...base, connected: false, configured: false, username: null }).status, 'Not available yet.');
});

test('a ROBLOX-ONLY account is told plainly what it can do today: it signs in with Roblox, it cannot disconnect, and why. No dead end is offered', () => {
  const only = describeConnection({ configured: true, connected: true, username: 'Builder1', linkedAt: '2026-10-05T00:00:00Z', signInOnly: true });
  assert.equal(only.status, 'Connected as Builder1.');
  assert.equal(only.canDisconnect, false, 'there is no other way in, so there is no Disconnect');
  assert.match(only.caution, /Roblox is how you sign in to this account/);
  assert.match(only.caution, /cannot be disconnected/);
  assert.match(only.caution, /no email address or password, so there would be no way back in/, 'and the reason');
  // The advice this card used to give: impossible while the address is a placeholder a confirmation email cannot reach.
  for (const advice of [/change your email/i, /set a password/i, /under Security/i, /first change/i]) assert.doesNotMatch(only.caution, advice, `${advice} sends a person to something that cannot work`);
  assert.match(only.caution, /Connected apps/, 'it still says how to withdraw StudPilot’s access');
});

/** The card, rendered with the connection already in the cache so what is checked is the markup a person sees. */
function cardFor(connection) {
  const client = new ui.QueryClient();
  client.setQueryData(['roblox-connection', 'u1'], connection);
  return render(ui.h(ui.QueryClientProvider, { client }, ui.h(ui.RobloxConnectionCard, { userId: 'u1' })));
}

test('the Connections card draws Disconnect for an account with another way in, and draws none (only the reason) for a Roblox-only one', () => {
  const base = { configured: true, connected: true, username: 'Builder1', linkedAt: '2026-10-05T00:00:00Z', signInOnly: false };
  const withEmail = cardFor(base);
  assert.match(withEmail, /<button[^>]*>Disconnect Roblox<\/button>/);
  assert.match(text(withEmail), /Connected as Builder1\./);
  const only = cardFor({ ...base, signInOnly: true });
  assert.equal(/<button/.test(only), false, 'no button at all');
  assert.match(text(only), /cannot be disconnected/);
  assert.doesNotMatch(only, /invalid/);
});

test('the Disconnect message reads `revoked`: it claims a withdrawal only when Roblox confirmed one', () => {
  const done = { tokenRemoved: true, linkRemoved: true, signInKept: false };
  assert.equal(disconnectMessage({ ...done, revoked: true }), 'Roblox disconnected.');
  assert.equal(disconnectMessage({ ...done, revoked: null, tokenRemoved: false }), 'Roblox disconnected.', 'no stored token means nothing to withdraw, and the link is gone');
  assert.match(disconnectMessage({ revoked: true, tokenRemoved: true, linkRemoved: false, signInKept: true }), /still how you sign in/);
  // revoked: false is never a success, however the rest of the answer reads.
  for (const rest of [done, { tokenRemoved: true, linkRemoved: false, signInKept: true }]) {
    const said = disconnectMessage({ ...rest, revoked: false });
    assert.match(said, /did not confirm/, JSON.stringify(rest));
    assert.doesNotMatch(said, /^Roblox disconnected\.$|is withdrawn|still how you sign in/);
  }
  assert.equal(disconnectMessage({ revoked: null, tokenRemoved: false, linkRemoved: false, signInKept: false }), 'There was nothing connected.');
});

/* ------------------------------------------------------------ where things sit (syntax tree) --- */

const parse = (...p) => ts.createSourceFile(p.at(-1), readFileSync(join(WEB, 'src', ...p), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };
const tagOf = (n) => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();
const isTag = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const attr = (n, name) => (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
const attrText = (n, name) => attr(n, name)?.initializer?.getText().replace(/^["{]|["}]$/g, '');
const ancestors = (n) => { const out = []; for (let p = n.parent; p; p = p.parent) out.push(p); return out; };

test('the sign-in page and the sign-up page both offer Roblox', () => {
  const source = parse('routes', 'auth-pages.tsx');
  for (const page of ['LoginPage', 'SignupPage']) {
    const fn = nodes(source).find((n) => ts.isFunctionDeclaration(n) && n.name?.text === page);
    assert.ok(fn, `${page} is not declared`);
    assert.ok(nodes(fn).some((n) => isTag(n) && tagOf(n) === 'RobloxSignIn'), `${page} does not offer "Continue with Roblox"`);
  }
});

test('only Roblox is added: no Supabase OAuth button exists, because no other provider is enabled', () => {
  const calls = nodes(parse('routes', 'auth-pages.tsx')).filter((n) => ts.isCallExpression(n)).map((n) => n.expression.getText());
  assert.equal(calls.some((c) => /signInWithOAuth$/.test(c)), false, 'a Supabase OAuth call was added');
  assert.equal(nodes(parse('routes', 'auth-pages.tsx')).some((n) => ts.isJsxText(n) && /Continue with (Google|Discord|GitHub|Facebook)/i.test(n.getText())), false);
});

/**
 * The guards over `route`: a guard is written as a wrapper in a route's `element` (`<Route element={<AuthGuard><AppLayout /></AuthGuard>}>`),
 * so the ones that matter are in the `element` of the route itself and of EVERY ancestor `Route`, not among the tags that enclose it.
 */
const guardsOver = (route) => [route, ...ancestors(route).filter(isTag)].flatMap((n) => {
  const element = attr(n, 'element');
  return [...(element ? nodes(element).filter(isTag).map(tagOf) : []), ...(n === route ? [] : [tagOf(n)])];
}).filter((t) => /Guard$/.test(t));

test('the landing route is declared, renders the landing page, and sits outside both guards, including the guarded layout Route that holds the signed-in screens', () => {
  const app = parse('app.tsx');
  const routes = nodes(app).filter((n) => isTag(n) && tagOf(n) === 'Route');
  const at = (path) => routes.filter((n) => attrText(n, 'path') === path);
  assert.equal(at('/auth/roblox').length, 1, 'there is not exactly one /auth/roblox route');
  const [route] = at('/auth/roblox');
  assert.match(attrText(route, 'element'), /^<RobloxCallbackPage\s*\/>$/, 'the route renders the landing page');
  assert.deepEqual(guardsOver(route), [], 'the landing route is inside a guard that would bounce it before the token is used');

  // The positive controls: the same reading finds the guards over routes that DO have them, so a pass above is not a blind spot.
  assert.deepEqual(guardsOver(at('/settings')[0]), ['AuthGuard'], 'a route inside the guarded layout Route is found to be guarded');
  assert.deepEqual(guardsOver(at('/login')[0]), ['GuestGuard'], 'a route whose own element is wrapped is found to be guarded');
  assert.deepEqual(guardsOver(at('/confirm')[0]), [], 'and a sibling that is deliberately open is not');
});

test('the Connections card is a row in settings', () => {
  const rows = nodes(parse('routes', 'settings.tsx')).filter((n) => ts.isJsxElement(n) && tagOf(n) === 'Row' && attrText(n, 'id') === 'roblox-signin');
  assert.equal(rows.length, 1, 'there is not exactly one roblox-signin row');
  assert.ok(nodes(rows[0]).some((n) => isTag(n) && tagOf(n) === 'RobloxConnectionCard'), 'the row does not hold the card');
  for (const query of ['roblox', 'disconnect', 'unlink']) assert.ok(matchSettings(query).includes('roblox-signin'), `searching "${query}" does not find it`);
});


/* ================================================================================================
 * THE LANDING PAGE, RUN. RobloxCallbackPage hands the hook five things (currentAccount, redeem, verifyOtp,
 * accountSwitched, and a navigate callback) and its view two more (onSwitch, onStay). All of that is the page's own code, so it
 * is executed here, against a stand-in Supabase client and router, rather than trusted because the hook it calls is tested.
 * ============================================================================================ */

const Page = await loadPage({
  entry: 'src/routes/auth-pages.tsx',
  name: 'roblox-landing',
  real: ['lib/roblox-signin.ts', 'lib/account-state.ts', 'lib/account-identity.ts'],
});

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/**
 * What one person's device holds, written by the app's own writers: a draft, a recent search and a view choice (the three families
 * the app clears at sign-out), and a key that is none of the app's business.
 */
function deviceStorage() {
  const storage = fakeStorage();
  const real = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    writeDraft('project-1', 'my unsent prompt');
    rememberSearch('project-1', 'secret query');
    writeViewChoice('drawer', 'files');
    storage.setItem('theme', 'dark');
  } finally {
    if (real === undefined) delete globalThis.window; else globalThis.window = real;
  }
  return storage;
}
const DEVICE_KEYS = [...deviceStorage().map.keys()];
assert.equal(DEVICE_KEYS.length, 4, 'the fixture wrote four keys');

/**
 * Mount the real RobloxCallbackPage with `session` as the one Supabase reports, run `body`, and put every global back.
 * `reads` records any look at window.location.hash, search or href; `fetches` every request the page made.
 */
async function scenario({ session = null, sessionError = null, verifyResult, redeemBody = { token_hash: HASH, next: '/settings' }, redeemStatus = 200, answers = {} } = {}, body) {
  const sc = Page.supabaseControls;
  const rc = Page.routerControls;
  sc.session = session;
  sc.sessionError = sessionError;
  sc.verifyResult = verifyResult ?? { data: { user: { id: 'the-new-user' } }, error: null };
  sc.calls.length = 0;
  rc.navigations.length = 0;
  const reads = [];
  const fetches = [];
  const storage = deviceStorage();
  const realWindow = globalThis.window;
  const realFetch = globalThis.fetch;
  globalThis.window = { localStorage: storage, location: {
    get hash() { reads.push('hash'); return `#token_hash=${ATTACKER_HASH}`; },
    get search() { reads.push('search'); return `?token_hash=${ATTACKER_HASH}`; },
    get href() { reads.push('href'); return `https://studpilot.app/app/auth/roblox#token_hash=${ATTACKER_HASH}`; },
  } };
  // `answers[path]` is a list of { status, body } handed out in order for that path; every other request is answered like a redeem.
  const queued = Object.fromEntries(Object.entries(answers).map(([path, list]) => [path, [...list]]));
  globalThis.fetch = async (url, init) => {
    fetches.push({ url, init });
    const next = queued[url]?.shift();
    return next ? new Response(JSON.stringify(next.body), { status: next.status }) : new Response(JSON.stringify(redeemBody), { status: redeemStatus });
  };
  try {
    const page = Page.mountStub(() => Page.RobloxCallbackPage());
    await page.settle();
    const view = () => findElement(page.result, Page.RobloxLandingView).props;
    return await body({ page, view, sc, rc, reads, fetches, storage });
  } finally {
    if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow;
    globalThis.fetch = realFetch;
  }
}

const emailSession = { user: { id: 'u1', email: 'me@example.com', app_metadata: { provider: 'email' } } };
const robloxSession = { user: { id: 'u2', email: 'roblox-0a1b2c3d4e5f60718293a4b5c6d7e8f9@users.studpilot.invalid', app_metadata: { provider: 'email', roblox_sub: '1234567' } } };

test('LANDING PAGE, run, nobody signed in: it asks Supabase who is here, redeems with a same-origin POST, trades that token, and navigates on (replacing the history entry); it never looks at the address', async () => {
  await scenario({}, async ({ view, sc, rc, reads, fetches, storage }) => {
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession', 'verifyOtp'], 'asked who is signed in, then traded the token, and called nothing else');
    assert.deepEqual(sc.calls[1].args, [{ token_hash: HASH, type: 'magiclink' }], 'the token it redeemed is the one it traded, as a magic link');
    assert.deepEqual(fetches.map((f) => [f.init.method, f.url, f.init.credentials]), [['POST', ROBLOX_REDEEM_PATH, 'same-origin']]);
    assert.deepEqual(rc.navigations, [{ to: '/settings', options: { replace: true } }], 'it goes where the person was heading and does not leave this page in the history');
    assert.deepEqual(reads, [], 'the address (hash, search, href) was never read: a crafted link cannot supply a token');
    assert.deepEqual(view().state, { kind: 'working' }, 'it stays on the working card while the router takes over, never a failure card or a choice');
    assert.equal(storage.map.size, DEVICE_KEYS.length, 'with nobody signed in before, nothing of anybody’s was cleared');
  });
});

test('LANDING PAGE, run, somebody signed in: it SHOWS THE CHOICE and redeems nothing, replaces nothing and navigates nowhere until they press a button', async () => {
  await scenario({ session: emailSession }, async ({ view, sc, rc, reads, fetches, storage }) => {
    assert.deepEqual(view().state, { kind: 'choice', id: 'u1', email: 'me@example.com', roblox: false }, 'the page asked and was told somebody is here');
    assert.deepEqual(fetches, [], 'the one-time handle was not spent while the person decides');
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession'], 'and Supabase was not asked to replace the session');
    assert.deepEqual(rc.navigations, []);
    assert.deepEqual(reads, []);
    assert.equal(storage.map.size, DEVICE_KEYS.length);
  });
});

test('LANDING PAGE, run, "Switch" replaces the session after redeeming, and because the account CHANGED the previous account’s drafts, searches and view state are cleared (and nothing else)', async () => {
  await scenario({ session: emailSession }, async ({ page, view, sc, rc, fetches, storage }) => {
    view().onSwitch();
    page.rerender();
    assert.deepEqual(view().state, { kind: 'working' }, 'the choice gives way to a working card');
    await page.settle();
    assert.equal(fetches.length, 1, 'redeemed once');
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession', 'verifyOtp']);
    assert.deepEqual(rc.navigations, [{ to: '/settings', options: { replace: true } }]);
    assert.deepEqual([...storage.map.keys()], ['theme'], 'the three families the app clears at sign-out are gone; a key it does not own is not');
  });
});

test('LANDING PAGE, run, a Roblox account signing in again over its own session (confirming it is them) keeps its drafts, and the card says it is a confirmation', async () => {
  const same = { data: { user: { id: 'u2' } }, error: null };
  await scenario({ session: robloxSession, verifyResult: same }, async ({ page, view, rc, storage }) => {
    assert.deepEqual(view().state, { kind: 'choice', id: 'u2', email: robloxSession.user.email, roblox: true });
    view().onSwitch();
    page.rerender();
    await page.settle();
    assert.deepEqual(rc.navigations, [{ to: '/settings', options: { replace: true } }]);
    assert.equal(storage.map.size, DEVICE_KEYS.length, 'same account: nothing cleared');
  });
  // ... and a DIFFERENT Roblox account over it clears the first one's.
  await scenario({ session: robloxSession }, async ({ page, view, storage }) => {
    view().onSwitch();
    page.rerender();
    await page.settle();
    assert.deepEqual([...storage.map.keys()], ['theme']);
  });
});

test('LANDING PAGE, run, "Stay signed in" goes home without redeeming, trading or clearing anything', async () => {
  await scenario({ session: emailSession }, async ({ view, sc, rc, fetches, storage }) => {
    view().onStay();
    assert.deepEqual(rc.navigations, [{ to: '/', options: { replace: true } }]);
    assert.deepEqual(fetches, []);
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession']);
    assert.equal(storage.map.size, DEVICE_KEYS.length);
  });
});

test('LANDING PAGE, run, failures are a failure card and nothing else: a session that cannot be read, a handle that cannot be redeemed, a token Supabase refuses', async () => {
  await scenario({ sessionError: new Error('storage') }, async ({ view, sc, rc, fetches }) => {
    assert.deepEqual(view().state, { kind: 'failed' }, 'unable to tell who is signed in, it does not guess');
    assert.deepEqual(fetches, []);
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession']);
    assert.deepEqual(rc.navigations, []);
  });
  await scenario({ redeemStatus: 400, redeemBody: { error: 'x' } }, async ({ view, sc, rc }) => {
    assert.deepEqual(view().state, { kind: 'failed' });
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession'], 'nothing was redeemed, so nothing was traded');
    assert.deepEqual(rc.navigations, []);
  });
  await scenario({ verifyResult: { data: null, error: { message: 'Token has expired or is invalid' } } }, async ({ view, rc }) => {
    assert.deepEqual(view().state, { kind: 'failed' });
    assert.deepEqual(rc.navigations, []);
  });
});

/* ======================================================= a Roblox-only account in Settings --- */

const PLACEHOLDER = 'roblox-0a1b2c3d4e5f60718293a4b5c6d7e8f9@users.studpilot.invalid';

test('a Roblox-only account is recognised by app_metadata.roblox_sub, never by the shape of its address or by anything a person can write', () => {
  assert.equal(isRobloxAccount({ email: PLACEHOLDER, app_metadata: { provider: 'email', roblox_sub: '1234567' } }), true);
  assert.equal(isRobloxAccount({ email: PLACEHOLDER, app_metadata: { provider: 'email' } }), false, 'the address alone is a hint anybody’s sign-up could imitate');
  assert.equal(isRobloxAccount({ email: 'me@example.com', user_metadata: { roblox_sub: '1234567' }, app_metadata: {} }), false, 'user_metadata is written by the person; only app_metadata is the worker’s');
  for (const sub of [undefined, null, '', 'abc', '12 34', 1234567, {}, '1'.repeat(30)]) assert.equal(isRobloxAccount({ app_metadata: { roblox_sub: sub } }), false, `roblox_sub ${JSON.stringify(sub)}`);
  for (const nobody of [null, undefined, 'a string', 42, {}, { app_metadata: null }, { app_metadata: 'x' }]) assert.equal(isRobloxAccount(nobody), false);
  assert.equal(isPlaceholderAddress(PLACEHOLDER), true);
  assert.equal(isPlaceholderAddress('me@example.com'), false);
  assert.equal(isPlaceholderAddress(null), false);
});

test('the placeholder address is never the label of an account: a Roblox-only account is shown by its Roblox username, or as a Roblox account while that is not known', () => {
  const user = { email: PLACEHOLDER, app_metadata: { roblox_sub: '1234567' } };
  assert.deepEqual(accountIdentity(user, PLACEHOLDER, 'Builder1'), { roblox: true, label: 'Roblox: Builder1', signedInAs: 'Signed in with Roblox as Builder1' });
  assert.deepEqual(accountIdentity(user, PLACEHOLDER, null), { roblox: true, label: 'Roblox account', signedInAs: 'Signed in with Roblox' });
  assert.deepEqual(accountIdentity(user, PLACEHOLDER, '  '), { roblox: true, label: 'Roblox account', signedInAs: 'Signed in with Roblox' });
  assert.deepEqual(accountIdentity({ email: 'me@example.com', app_metadata: {} }, 'me@example.com', null), { roblox: false, label: 'me@example.com', signedInAs: 'Signed in as me@example.com' });
  // A placeholder address is not shown even when nothing else says the account is a Roblox one.
  assert.equal(accountIdentity({ app_metadata: {} }, PLACEHOLDER, null).label, 'Roblox account');
  for (const shown of [accountIdentity(user, PLACEHOLDER, 'Builder1'), accountIdentity(user, PLACEHOLDER, null), accountIdentity({}, PLACEHOLDER, null)]) {
    assert.doesNotMatch(JSON.stringify(shown), /invalid|roblox-0a1b/i);
  }
});

const authValue = (user) => ({ session: { user }, loading: false, signOut: async () => {}, signOutEverywhere: async () => ({ ok: true }), reauthenticatedAt: null, markReauthenticated: noop, stepOwed: { step: 'in' } });
const dialogFor = (user, action) => render(ui.h(ui.AuthContext.Provider, { value: authValue(user) }, ui.h(ui.ReauthDialog, { action, title: 'Confirm it is you', onConfirmed: noop, onClose: noop })));
const ROBLOX_USER = { id: 'u2', email: PLACEHOLDER, app_metadata: { provider: 'email', roblox_sub: '1234567' }, user_metadata: { display_name: 'Builder1' } };
const EMAIL_USER = { id: 'u1', email: 'me@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} };

test('RE-AUTH for a Roblox-only account is signing in with Roblox again, for EVERY action Settings gates: there is no password box it could never fill', () => {
  for (const action of SENSITIVE_ACTIONS) {
    const html = dialogFor(ROBLOX_USER, action);
    assert.match(html, new RegExp(`<a [^>]*href="/auth/roblox/start\\?reauth=${action}"[^>]*>Confirm with Roblox</a>`), `${action}: the way to confirm is a Roblox RE-AUTHENTICATION for this action, not a plain sign-in`);
    assert.equal(/type="password"|name="currentPassword"|Your password/.test(html), false, `${action}: no password field`);
    assert.match(text(html), /no password to type/);
    assert.match(text(html), /what you asked for carries on/, `${action}: it says the action resumes by itself`);
    assert.match(html, /<button[^>]*>Cancel<\/button>/, `${action}: and a way out`);
    assert.doesNotMatch(html, /invalid|roblox-0a1b/i, `${action}: the placeholder address is not on the dialog`);
  }
  // And each one says why it is asking, in its own words, as the password dialog does.
  assert.equal(new Set(SENSITIVE_ACTIONS.map((action) => text(dialogFor(ROBLOX_USER, action)))).size, SENSITIVE_ACTIONS.length, 'every action has its own explanation');
  assert.match(text(dialogFor(ROBLOX_USER, 'delete-account')), /deletes your data from every store/);
  assert.match(text(dialogFor(ROBLOX_USER, 'export-data')), /everything we keep about you/);
});

test('RE-AUTH for an account with a password is unchanged: a password box, and no Roblox link; and an address that merely LOOKS like the placeholder does not make an account passwordless', () => {
  for (const user of [EMAIL_USER, { ...EMAIL_USER, email: PLACEHOLDER }, { ...EMAIL_USER, user_metadata: { roblox_sub: '1234567' } }]) {
    const html = dialogFor(user, 'delete-account');
    assert.match(html, /name="currentPassword"/, JSON.stringify(user).slice(0, 60));
    assert.equal(/auth\/roblox/.test(html), false);
  }
});

test('the dialog names the real window: the same ten minutes the server keeps a re-authentication for', () => {
  assert.match(text(dialogFor(ROBLOX_USER, 'export-data')), new RegExp(`${Math.round(REAUTH_WINDOW_MS / 60_000)} minutes`));
  assert.equal(REAUTH_WINDOW_MS, 10 * 60_000);
});

/* ---------------------------------------------------------- the account is never shown by its placeholder --- */

test('no screen prints a raw account address: Settings and the shell go through accountIdentity, so a placeholder cannot reach the page', () => {
  for (const file of [['routes', 'settings.tsx'], ['components', 'layout.tsx']]) {
    const source = parse(...file);
    const printed = nodes(source).filter((n) => ts.isJsxExpression(n) && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) && n.expression && /\b(?:user\??\.email|data\??\.email)\b/.test(n.expression.getText()));
    assert.deepEqual(printed.map((n) => n.getText()), [], `${file.join('/')} prints an address straight from the session`);
  }
  const shell = nodes(parse('components', 'layout.tsx')).find((n) => ts.isVariableDeclaration(n) && n.name.getText() === 'email' && n.initializer);
  assert.ok(shell, 'the shell’s account line');
  assert.match(shell.initializer.getText(), /^accountIdentity\(/, 'the shell’s address line is made by accountIdentity');
  const head = nodes(parse('routes', 'settings.tsx')).filter((n) => ts.isJsxElement(n) && attrText(n, 'className') === 'settings-signed');
  assert.equal(head.length, 1);
  assert.match(head[0].getText(), /identity\.signedInAs/, 'the sentence under the Settings title is the identity’s');
});

/* ============================================================================================================
 * SETTINGS, RUN. SettingsPage is called for real (tests/page-harness.mjs): its hooks, its Roblox-only branching, its identity gate
 * and its resume-on-arrival run against stand-ins for the session, the query layer and the worker's answer, and the element tree
 * it returns is read. A branch that is inverted, a gate that consults the wrong thing, a resume that never fires: each fails here.
 * ========================================================================================================== */

const Settings = await loadPage({
  entry: 'src/routes/settings.tsx',
  name: 'roblox-settings',
  real: ['lib/account-identity.ts', 'lib/auth-flows.ts', 'lib/use-roblox-username.ts', 'lib/prefs.ts', 'lib/settings-search.ts', 'lib/confirm-model.ts', 'lib/notification-prefs.ts', 'lib/notification-inbox.ts', 'lib/security-history.ts', 'lib/mfa.ts', 'lib/format.ts', 'lib/roblox-signin.ts'],
  fakes: {
    'lib/auth.tsx': { useAuth: '() => globalThis.__pageFakes.auth' },
    'lib/theme.tsx': { usePrefs: '() => globalThis.__pageFakes.prefs' },
    'components/toast.tsx': { useToast: '() => ({ toast: () => {} })' },
    'lib/api.ts': { DELETE_ACCOUNT_PHRASE: "'DELETE MY ACCOUNT'", fetchRobloxConnection: '(...a) => globalThis.__pageFakes.api.fetchRobloxConnection(...a)' },
    'lib/mock.ts': { MOCK_MODE: 'false' },
  },
});

const SETTINGS_ROBLOX_NAME = 'Builder1';

/**
 * Mount SettingsPage as `user`, with `connection` as what the worker answers for GET /api/me/roblox/connection (an Error is a failed
 * request), the address bar at `search`, and the DEVICE CLOCK `skewMs` away from the real one (the session's own
 * `last_sign_in_at` stays the real, server-side time). Everything global is put back afterwards.
 */
async function settingsScenario({ user, connection = { reauthFresh: false }, search = '', skewMs = 0, lastSignInAgoMs = 1000 }, body) {
  const realNow = Date.now.bind(Date);
  const fakes = {
    auth: {
      session: { user: { ...user, last_sign_in_at: new Date(realNow() - lastSignInAgoMs).toISOString() } },
      signOutEverywhere: async () => ({ ok: true }),
      reauthenticatedAt: null,
    },
    prefs: { prefs: {}, setPref: noop, resetPrefs: noop, theme: 'dark', systemTheme: 'dark' },
    api: { fetches: 0, async fetchRobloxConnection() { fakes.api.fetches += 1; if (connection instanceof Error) throw connection; return connection; } },
  };
  globalThis.__pageFakes = fakes;
  Settings.queryControls.queries.length = 0;
  Settings.queryControls.answer = (options) => (options.queryKey[0] === 'roblox-connection' ? { data: { configured: true, connected: true, username: SETTINGS_ROBLOX_NAME, signInOnly: true, reauthFresh: false } } : undefined);
  const replaced = [];
  const realWindow = globalThis.window;
  globalThis.window = { location: { search, hash: '', href: `https://studpilot.app/app/settings${search}` }, history: { state: null, replaceState: (_state, _title, url) => { replaced.push(String(url)); } } };
  Date.now = () => realNow() + skewMs;
  try {
    const page = Settings.mountStub(() => Settings.SettingsPage());
    await page.settle();
    const tree = () => page.result;
    const click = async (element) => { element.props.onClick(); await page.settle(); };
    return await body({ page, tree, click, fakes, replaced });
  } finally {
    Date.now = realNow;
    if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow;
    delete globalThis.__pageFakes;
  }
}

const buttonLike = (tree, pattern) => findAll(tree, (n) => n.type === 'button' && typeof n.props.onClick === 'function' && pattern.test(textOf(n)))[0];
/** The identity dialog Settings has open, as { action }, or null. */
const openDialog = (tree) => findAll(tree, (n) => typeof n.props.action === 'string' && typeof n.props.onConfirmed === 'function' && n.props.title === 'Confirm it is you')[0]?.props ?? null;
/** The action the page has decided to run (or to ask the confirmation ladder about): what RunPending was handed. */
const pendingAction = (tree) => findAll(tree, (n) => 'pending' in n.props && 'ceremony' in n.props && 'run' in n.props)[0]?.props.pending ?? null;
const rowControl = (tree, id) => findAll(tree, (n) => n.props.id === id && 'control' in n.props)[0];

/** The button (or callback) each gated action is reached by on this page, for an account that has the control at all. */
const GATED = [
  ['sign-out-everywhere', async (tree, click) => click(buttonLike(tree, /^Sign out on all devices$/))],
  ['export-data', async (tree, click) => click(buttonLike(tree, /^Download my data$/))],
  ['reset-settings', async (tree, click) => click(buttonLike(tree, /^Reset \d+ settings?$/))],
  ['delete-account', async (tree, click) => click(buttonLike(tree, /^Delete my account$/))],
  ['remove-two-step', async (tree, click, page) => { findAll(tree, (n) => typeof n.props.onRemove === 'function')[0].props.onRemove('factor-1'); await page.settle(); }],
];

test('SETTINGS, run, a Roblox-only account: no email or password form, its own words in their place, shown by its Roblox username, and the Roblox query is asked', async () => {
  await settingsScenario({ user: ROBLOX_USER }, async ({ tree }) => {
    for (const id of ['email-address', 'password']) {
      const row = rowControl(tree(), id);
      assert.ok(row, `${id}: the row is drawn`);
      assert.equal(row.props.control, null, `${id}: no control for an account that has no address to change and no password to set`);
    }
    assert.match(textOf(tree()), /This account has no password: it signs in with Roblox/);
    assert.match(textOf(tree()), /signs in with Roblox and has no email address/);
    const signed = findAll(tree(), (n) => n.props.className === 'settings-signed')[0];
    assert.equal(textOf(signed), `Signed in with Roblox as ${SETTINGS_ROBLOX_NAME}`, 'the sentence under the title names the Roblox account');
    assert.equal(findAll(tree(), (n) => n.type === 'strong' && textOf(n) === `Roblox: ${SETTINGS_ROBLOX_NAME}`).length, 1, 'and so does the address row');
    assert.doesNotMatch(JSON.stringify(textOf(tree())), /invalid|roblox-0a1b/i, 'the placeholder address is nowhere on the page');
    const asked = Settings.queryControls.queries.filter((q) => q.queryKey[0] === 'roblox-connection');
    assert.ok(asked.length > 0 && asked.every((q) => q.enabled === true && q.queryKey[1] === ROBLOX_USER.id), 'the Roblox username is asked for, for this account');
  });
});

test('SETTINGS, run, an account with an email and a password keeps both forms, its address, and never asks about Roblox', async () => {
  await settingsScenario({ user: EMAIL_USER }, async ({ tree, fakes }) => {
    for (const id of ['email-address', 'password']) {
      const row = rowControl(tree(), id);
      assert.ok(row && row.props.control !== null, `${id}: there is a control`);
      assert.equal(findAll(row.props.control, (n) => n.type === 'form').length, 1, `${id}: and it is the form`);
    }
    assert.doesNotMatch(textOf(tree()), /signs in with Roblox/);
    assert.equal(textOf(findAll(tree(), (n) => n.props.className === 'settings-signed')[0]), 'Signed in as me@example.com');
    assert.equal(findAll(tree(), (n) => n.type === 'strong' && textOf(n) === 'me@example.com').length, 1);
    assert.deepEqual(Settings.queryControls.queries.filter((q) => q.queryKey[0] === 'roblox-connection').map((q) => q.enabled), [false], 'the Roblox username is not asked for, and not for an account that has none');
    assert.equal(fakes.api.fetches, 0);
  });
});

test('SETTINGS, run, the Roblox gate is THE SERVER’S answer: only a clear yes lets the action through, and a session that signed in a second ago still has to confirm', async () => {
  for (const [action, reach] of GATED) {
    for (const [what, connection, asks] of [
      ['the server has a confirmation on record', { reauthFresh: true }, false],
      ['the server has none', { reauthFresh: false }, true],
      ['the answer has no such field', {}, true],
      ['a string is not a yes', { reauthFresh: 'true' }, true],
      ['the request fails', new Error('network'), true],
    ]) {
      // `lastSignInAgoMs: 1000`: the session itself says it signed in a second ago, which is what the old gate trusted.
      await settingsScenario({ user: ROBLOX_USER, connection, lastSignInAgoMs: 1000 }, async ({ page, tree, click, fakes }) => {
        await reach(tree(), click, page);
        assert.equal(fakes.api.fetches, 1, `${action}: ${what}: the server was asked`);
        if (asks) {
          assert.deepEqual([openDialog(tree())?.action, pendingAction(tree())], [action, null], `${action}: ${what}: it asks`);
        } else {
          assert.deepEqual([openDialog(tree()), pendingAction(tree())], [null, action], `${action}: ${what}: it goes ahead`);
        }
      });
    }
  }
});

test('SETTINGS, run, a device clock that is far off cannot loop a Roblox-only account: the decision never reads it', async () => {
  const SKEWS = [['30 s behind', -31_000], ['an hour behind', -3_600_000], ['11 minutes ahead', 11 * 60_000], ['a day ahead', 24 * 3_600_000]];
  for (const [clock, skewMs] of SKEWS) {
    for (const [action, reach] of GATED) {
      // The server says the person confirmed it is them: the action goes ahead, however wrong this device's clock is.
      await settingsScenario({ user: ROBLOX_USER, connection: { reauthFresh: true }, skewMs }, async ({ page, tree, click }) => {
        await reach(tree(), click, page);
        assert.deepEqual([openDialog(tree()), pendingAction(tree())], [null, action], `${action}: device ${clock}: asked again although the server has a confirmation`);
      });
      // And when it does not, it asks, once, and that is the end of it.
      await settingsScenario({ user: ROBLOX_USER, connection: { reauthFresh: false }, skewMs }, async ({ page, tree, click }) => {
        await reach(tree(), click, page);
        assert.deepEqual([openDialog(tree())?.action, pendingAction(tree())], [action, null], `${action}: device ${clock}`);
      });
    }
  }
});

test('SETTINGS, run, a password account is gated exactly as before: by its sign-in time against the device clock, and the server is never asked', async () => {
  const fresh = (action) => async ({ page, tree, click, fakes }) => { await GATED.find(([a]) => a === action)[1](tree(), click, page); assert.equal(fakes.api.fetches, 0, `${action}: no Roblox query`); return [openDialog(tree()), pendingAction(tree())]; };
  for (const [action] of GATED.filter(([a]) => a !== 'remove-two-step')) {
    assert.deepEqual(await settingsScenario({ user: EMAIL_USER, lastSignInAgoMs: 5_000 }, fresh(action)), [null, action], `${action}: a sign-in five seconds ago does not ask`);
    const [dialog, pending] = await settingsScenario({ user: EMAIL_USER, lastSignInAgoMs: 60 * 60_000 }, fresh(action));
    assert.deepEqual([dialog?.action, pending], [action, null], `${action}: an hour-old sign-in asks (with a password, in the dialog)`);
  }
});

test('SETTINGS, run, coming back from Roblox with ?resume=<action> carries the action on by itself, once, whatever the device clock says', async () => {
  for (const [clock, skewMs] of [['honest', 0], ['30 s behind', -31_000], ['11 minutes ahead', 11 * 60_000]]) {
    for (const action of SENSITIVE_ACTIONS) {
      await settingsScenario({ user: ROBLOX_USER, connection: { reauthFresh: true }, search: `?resume=${action}`, skewMs }, async ({ tree, fakes, replaced }) => {
        assert.deepEqual([openDialog(tree()), pendingAction(tree())], [null, action], `${action}: device ${clock}: the action was not resumed`);
        assert.equal(fakes.api.fetches, 1, `${action}: the server was asked once`);
        assert.deepEqual(replaced, ['https://studpilot.app/app/settings'], `${action}: the resume parameter is taken out of the address, so a reload does not repeat it`);
      });
    }
  }
  // It resumes nothing the server has not confirmed: a link that names an action opens nothing by itself.
  await settingsScenario({ user: ROBLOX_USER, connection: { reauthFresh: false }, search: '?resume=export-data' }, async ({ tree }) => {
    assert.deepEqual([openDialog(tree())?.action, pendingAction(tree())], ['export-data', null], 'not confirmed: it asks again, and does not run');
  });
  await settingsScenario({ user: ROBLOX_USER, connection: new Error('network'), search: '?resume=delete-account' }, async ({ tree }) => {
    assert.deepEqual([openDialog(tree())?.action, pendingAction(tree())], ['delete-account', null]);
  });
  // Other parts of the address survive the clean-up.
  await settingsScenario({ user: ROBLOX_USER, connection: { reauthFresh: true }, search: '?resume=export-data&ownerCredits=0' }, async ({ replaced }) => {
    assert.deepEqual(replaced, ['https://studpilot.app/app/settings?ownerCredits=0']);
  });
});

test('SETTINGS, run, ?resume= does nothing for anything that is not a gated action, nothing without a Roblox account, and nothing at all on an ordinary visit', async () => {
  for (const search of ['', '?resume=', '?resume=evil', '?resume=export-data%00', '?resume%5B%5D=export-data', '?resume=EXPORT-DATA', '?resume=export-data-now', '?other=export-data']) {
    await settingsScenario({ user: ROBLOX_USER, connection: { reauthFresh: true }, search }, async ({ tree, fakes, replaced }) => {
      assert.deepEqual([openDialog(tree()), pendingAction(tree())], [null, null], `${JSON.stringify(search)}: nothing runs and nothing opens`);
      assert.equal(fakes.api.fetches, 0, `${JSON.stringify(search)}: the server is not even asked`);
      assert.deepEqual(replaced, [], `${JSON.stringify(search)}: the address is left alone`);
    });
  }
  // A password account has no Roblox confirmation to resume on: the parameter is cleaned and nothing is run.
  await settingsScenario({ user: EMAIL_USER, search: '?resume=delete-account' }, async ({ tree, fakes, replaced }) => {
    assert.deepEqual([openDialog(tree()), pendingAction(tree())], [null, null]);
    assert.equal(fakes.api.fetches, 0);
    assert.deepEqual(replaced, ['https://studpilot.app/app/settings']);
  });
});

test('resumeActionFrom names a gated action or nothing, and robloxReauthHref carries the action to the worker’s start route', () => {
  for (const action of SENSITIVE_ACTIONS) {
    assert.equal(resumeActionFrom(`?resume=${action}`), action);
    assert.equal(resumeActionFrom(`?x=1&resume=${action}&y=2`), action);
    assert.equal(robloxReauthHref(action), `/auth/roblox/start?reauth=${action}`);
    assert.equal(robloxReauthHref(action).startsWith(ROBLOX_START_PATH), true);
  }
  for (const bad of ['', '?', '?resume=', '?resume=evil', '?resume=export-data%20', '?resume=Export-Data', '?resume=__proto__', '?resume=constructor', null, undefined, 42, {}]) {
    assert.equal(resumeActionFrom(bad), null, JSON.stringify(bad));
  }
  assert.equal(robloxReauthHref('a b&c'), '/auth/roblox/start?reauth=a%20b%26c', 'whatever it is handed is encoded, never concatenated');
});

/* ============================================================================================================
 * useRobloxUsername AND ITS CALL SITES, RUN.
 * ========================================================================================================== */

const Username = await loadPage({
  entry: 'src/lib/use-roblox-username.ts',
  name: 'roblox-username',
  real: ['lib/account-identity.ts'],
  fakes: { 'lib/api.ts': { fetchRobloxConnection: '(...args) => globalThis.__connectionFetcher(...args)' } },
});

test('useRobloxUsername, run: a Roblox-only account asks for its connection (by its id, through the api’s own function) and gets the username; every other caller asks for nothing and gets null', async () => {
  const answered = { username: 'from the api module' };
  globalThis.__connectionFetcher = async () => answered;
  try {
    const run = async (user, answer) => {
      Username.queryControls.queries.length = 0;
      Username.queryControls.answer = answer;
      const hook = Username.mountStub(() => Username.useRobloxUsername(user));
      await hook.settle();
      return { name: hook.result, query: Username.queryControls.queries.at(-1) };
    };
    const connected = (o) => (o.queryKey[0] === 'roblox-connection' ? { data: { username: 'Builder1' } } : undefined);

    const roblox = await run(ROBLOX_USER, connected);
    assert.equal(roblox.name, 'Builder1');
    assert.deepEqual(roblox.query.queryKey, ['roblox-connection', 'u2'], 'the key the Connections card uses, so one request serves both');
    assert.equal(roblox.query.enabled, true);
    assert.equal(await roblox.query.queryFn(), answered, 'it asks the api module’s own connection call');
    assert.equal((await run(ROBLOX_USER, () => undefined)).name, null, 'null until the answer arrives: callers say "Roblox account", never the placeholder');
    assert.equal((await run(ROBLOX_USER, () => ({ data: { username: null } }))).name, null);
    assert.equal((await run(ROBLOX_USER, () => ({ data: undefined, isError: true }))).name, null);

    // Everyone else: nothing is asked and nothing is returned, even if the cache happens to hold a Roblox answer under that key
    // (`connected` answers whatever it is asked, as a cache that still holds an old entry would).
    for (const [what, user] of [['an email account', EMAIL_USER], ['an address that only looks like the placeholder', { ...EMAIL_USER, email: PLACEHOLDER }], ['nobody', null], ['nobody yet', undefined]]) {
      const other = await run(user, connected);
      assert.equal(other.name, null, `${what}: no name`);
      assert.equal(other.query.enabled, false, `${what}: nothing is asked`);
    }
    // A Roblox account whose id is not known yet asks nothing either (a disabled query has no data, as in the real query layer).
    const idless = await run({ app_metadata: { roblox_sub: '1234567' } }, (o) => (o.enabled === false ? undefined : connected(o)));
    assert.equal(idless.query.enabled, false, 'no id, nothing to ask about');
    assert.equal(idless.name, null);
  } finally {
    delete globalThis.__connectionFetcher;
  }
});

const Shell = await loadPage({
  entry: 'src/components/layout.tsx',
  name: 'roblox-shell',
  real: ['lib/account-identity.ts', 'lib/use-roblox-username.ts', 'lib/view-state.ts', 'lib/rail-width.ts'],
  expose: { 'components/layout.tsx': ['Shell'] },
  fakes: {
    'lib/auth.tsx': { useAuth: '() => globalThis.__pageFakes.auth' },
    'lib/shell.tsx': { useShell: '() => globalThis.__pageFakes.shell' },
    'lib/theme.tsx': { useTheme: '() => ({ theme: "dark", setTheme() {} })' },
    'lib/mock.ts': { MOCK_MODE: 'false' },
    'lib/api.ts': { fetchRobloxConnection: '() => null' },
  },
});

/** The address line the shell hands its rail for `user`, with the Roblox query answering `username` (undefined: not yet). */
async function shellLabel(user, username) {
  globalThis.__pageFakes = { auth: { session: { user }, signOut: async () => {} }, shell: { railOpen: true, openRail: noop, closeRail: noop, railCollapsed: false, newProject: noop } };
  const realWindow = globalThis.window;
  const realDocument = globalThis.document;
  globalThis.window = { localStorage: { getItem: () => null, setItem: noop }, location: { search: '' } };
  globalThis.document = { addEventListener: noop, removeEventListener: noop };
  Shell.queryControls.queries.length = 0;
  Shell.queryControls.answer = (o) => (o.queryKey[0] === 'roblox-connection' && username !== undefined ? { data: { username } } : undefined);
  try {
    const page = Shell.mountStub(() => Shell.Shell());
    await page.settle();
    const rails = findAll(page.result, (n) => typeof n.props.email === 'string');
    assert.equal(rails.length, 1, 'the shell hands exactly one account line to its rail');
    return rails[0].props.email;
  } finally {
    delete globalThis.__pageFakes;
    if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow;
    if (realDocument === undefined) delete globalThis.document; else globalThis.document = realDocument;
  }
}

test('the SHELL’s account line, run: a Roblox-only account is "Roblox: <username>" (or "Roblox account" until it is known), never its placeholder address; everyone else is their address', async () => {
  assert.equal(await shellLabel(ROBLOX_USER, 'Builder1'), 'Roblox: Builder1');
  assert.equal(await shellLabel(ROBLOX_USER, undefined), 'Roblox account');
  assert.equal(await shellLabel(EMAIL_USER, undefined), 'me@example.com');
  assert.equal(await shellLabel(EMAIL_USER, 'ignored'), 'me@example.com', 'a Roblox answer does not rename an email account');
});

test('isPlaceholderAddress: the reserved .invalid ending, anchored, and nothing that only resembles it', () => {
  for (const near of ['me@example.invalid.com', 'me@example.invalidx', 'me@exampleinvalid', 'invalid@example.com', 'me@invalid', 'me.invalid@example.com', 'me@example.invalid.example', 'me@example.invalid@example.com ', '.invalid@example.com', 'me@example-invalid', 'me@example.valid']) {
    assert.equal(isPlaceholderAddress(near), false, `${near} is not a placeholder address`);
  }
  for (const real of [PLACEHOLDER, 'me@example.INVALID', '  me@example.invalid  ', 'x@y.invalid']) assert.equal(isPlaceholderAddress(real), true, `${real} is`);
  for (const nothing of [undefined, '', 42, {}, []]) assert.equal(isPlaceholderAddress(nothing), false);
});

/* ============================================================================================================
 * A FIRST SIGHT IS ASKED ABOUT: the card, the calls it makes, and what is never done without Continue.
 * ========================================================================================================== */

const ASKED = { status: 200, body: { confirm: 'new-account', username: 'Builder1', next: '/' } };
const MADE = { status: 200, body: { created: true } };

test('the first-sight card says it in the words the brief gives, names the Roblox account, and offers exactly Continue and Go back', () => {
  const html = render(ui.h(ui.RobloxLandingView, { state: { kind: 'confirm-new', username: 'Builder1' }, onSwitch: noop, onStay: noop, onContinue: noop, onBack: noop }));
  assert.match(text(html), /This creates a new StudPilot account\. Already have one\? Sign in with your email instead\./);
  assert.match(text(html), /Signed in to Roblox as Builder1/);
  assert.deepEqual([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]), ['Continue', 'Go back']);
  assert.match(html, /role="group"/);
  assert.equal(/role="alert"/.test(html), false, 'it is a question, not an error');
  // The username is Roblox's text: it is shown as text, never as markup.
  const hostile = render(ui.h(ui.RobloxLandingView, { state: { kind: 'confirm-new', username: '<img src=x onerror=alert(1)>' }, onSwitch: noop, onStay: noop, onContinue: noop, onBack: noop }));
  assert.equal(/<img/.test(hostile), false);
  // A failure shows the worker's fixed reference when it gave one, and nothing when it did not.
  const failed = (state) => render(ui.h(ui.RobloxLandingView, { state, onSwitch: noop, onStay: noop, onContinue: noop, onBack: noop }));
  assert.match(failed({ kind: 'failed', reference: 'roblox_address_taken' }), /Reference: <code>roblox_address_taken<\/code>/);
  assert.equal(/Reference/.test(failed({ kind: 'failed' })), false);
});

test('redeem answers a first sight as a QUESTION: {confirmNew: {username}}, only when the answer is the worker’s and the name can be shown', async () => {
  const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
  assert.deepEqual(await redeemRobloxSignIn(reply({ confirm: 'new-account', username: 'Builder1', next: '/' })), { confirmNew: { username: 'Builder1' } });
  assert.deepEqual(await redeemRobloxSignIn(reply({ confirm: 'new-account', username: '  Builder1 ' })), { confirmNew: { username: 'Builder1' } });
  for (const bad of [{ confirm: 'new-account' }, { confirm: 'new-account', username: '' }, { confirm: 'new-account', username: '   ' }, { confirm: 'new-account', username: 42 }, { confirm: 'new-account', username: 'x'.repeat(201) }]) {
    assert.equal(await redeemRobloxSignIn(reply(bad)), null, `${JSON.stringify(bad).slice(0, 50)}`);
  }
  assert.equal(await redeemRobloxSignIn(reply({ confirm: 'new-account', username: 'Builder1' }, 400)), null, 'an error status is not a question');
  // Anything that is not the question is read as before.
  assert.deepEqual(await redeemRobloxSignIn(reply({ confirm: 'something-else', token_hash: HASH, next: '/usage' })), { tokenHash: HASH, next: '/usage' });
});

test('createRobloxAccount and declineRobloxAccount are same-origin POSTs with no body and nothing in the URL, and read only the worker’s fixed words back', async () => {
  const seen = [];
  const record = (answer) => async (url, init) => { seen.push({ url, init }); return answer(); };
  assert.deepEqual(await createRobloxAccount(record(() => new Response('{"created":true}', { status: 200 }))), { ok: true });
  await declineRobloxAccount(record(() => new Response('{"declined":true}', { status: 200 })));
  assert.deepEqual(seen.map((x) => [x.init.method, x.url, x.init.credentials, x.init.body, x.init.cache]), [['POST', ROBLOX_CREATE_PATH, 'same-origin', undefined, 'no-store'], ['POST', ROBLOX_DECLINE_PATH, 'same-origin', undefined, 'no-store']]);
  assert.equal(seen.some((x) => /[?#]/.test(x.url)), false);
  const failure = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  assert.deepEqual(await createRobloxAccount(failure(409, { error: 'x', reference: 'roblox_address_taken' })), { ok: false, reference: 'roblox_address_taken' });
  for (const bad of [{ reference: '<script>' }, { reference: 'x'.repeat(60) }, { reference: 42 }, { error: 'x' }, 'not json']) {
    assert.deepEqual(await createRobloxAccount(failure(502, bad)), { ok: false }, `${JSON.stringify(bad).slice(0, 40)} is not shown`);
  }
  assert.deepEqual(await createRobloxAccount(failure(200, { created: false })), { ok: false }, 'a 200 that does not say created is not a success');
  assert.deepEqual(await createRobloxAccount(failure(500, { created: true })), { ok: false }, 'and a failing status is not either');
  assert.deepEqual(await createRobloxAccount(async () => { throw new TypeError('network'); }), { ok: false });
  await declineRobloxAccount(async () => { throw new TypeError('network'); });               // swallowed: nothing more can be done from here
});

test('continueRobloxNewAccount makes the account FIRST and signs in only if that worked: a failure redeems nothing, trades nothing, and keeps the worker’s reference', async () => {
  const log = [];
  const deps = (created) => ({
    create: async () => { log.push('create'); return created; },
    redeem: async () => { log.push('redeem'); return { tokenHash: HASH, next: '/usage' }; },
    verifyOtp: async () => { log.push('verify'); return { data: { user: { id: 'u9' } }, error: null }; },
    accountSwitched: () => log.push('switched'),
  });
  assert.deepEqual(await continueRobloxNewAccount(deps({ ok: true })), { kind: 'signed-in', next: '/usage' });
  assert.deepEqual(log, ['create', 'redeem', 'verify']);
  log.length = 0;
  assert.deepEqual(await continueRobloxNewAccount(deps({ ok: false, reference: 'roblox_address_taken' })), { kind: 'failed', reference: 'roblox_address_taken' });
  assert.deepEqual(await continueRobloxNewAccount(deps({ ok: false })), { kind: 'failed' });
  assert.deepEqual(log, ['create', 'create'], 'nothing was redeemed or traded after a failure');
  log.length = 0;
  assert.deepEqual(await continueRobloxNewAccount(deps({ ok: true }), { id: 'u1' }), { kind: 'signed-in', next: '/usage' });
  assert.deepEqual(log, ['create', 'redeem', 'verify', 'switched'], 'and an account that replaced another one clears the other’s local state, as a switch does');
});

test('LANDING (hook), a first sight: it ASKS and does nothing else; Continue makes the account and signs in; Go back declines and leaves', async () => {
  const asked = landing({ redeemed: [{ confirmNew: { username: 'Builder1' } }, undefined] });
  await asked.hook.settle();
  assert.deepEqual(asked.hook.result.state, { kind: 'confirm-new', username: 'Builder1' });
  assert.deepEqual([asked.calls.create, asked.calls.decline, asked.calls.verify, asked.signedIn], [0, 0, [], []], 'asked, and nothing made, declined, traded or entered');

  asked.hook.result.continueNew();
  asked.hook.rerender();
  assert.deepEqual(asked.hook.result.state, { kind: 'working' });
  await asked.hook.settle();
  assert.deepEqual([asked.calls.create, asked.calls.redeem, asked.calls.verify, asked.signedIn], [1, 2, [{ token_hash: HASH, type: 'magiclink' }], ['/settings']]);

  const back = landing({ redeemed: [{ confirmNew: { username: 'Builder1' } }] });
  await back.hook.settle();
  back.hook.result.goBack();
  back.hook.rerender();
  assert.deepEqual(back.hook.result.state, { kind: 'working' }, 'the card gives way to a working one while the worker is told, so Go back cannot be pressed twice');
  await back.hook.settle();
  assert.deepEqual([back.calls.decline, back.calls.create, back.calls.verify, back.signedIn, back.declined], [1, 0, [], [], [true]]);

  const refused = landing({ redeemed: [{ confirmNew: { username: 'Builder1' } }], created: { ok: false, reference: 'roblox_address_taken' } });
  await refused.hook.settle();
  refused.hook.result.continueNew();
  await refused.hook.settle();
  assert.deepEqual(refused.hook.result.state, { kind: 'failed', reference: 'roblox_address_taken' });
  assert.deepEqual([refused.calls.verify, refused.signedIn], [[], []]);
});

test('LANDING PAGE, run, a first sight: the card asks; NOTHING is made, redeemed again or traded until Continue, and then the order is ask, create, redeem, trade', async () => {
  await scenario({ answers: { [ROBLOX_REDEEM_PATH]: [ASKED], [ROBLOX_CREATE_PATH]: [MADE] } }, async ({ page, view, sc, rc, fetches, reads }) => {
    assert.deepEqual(view().state, { kind: 'confirm-new', username: 'Builder1' });
    assert.deepEqual(fetches.map((f) => f.url), [ROBLOX_REDEEM_PATH], 'only the question was asked');
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession'], 'no session was made');
    assert.deepEqual(rc.navigations, []);
    view().onContinue();
    page.rerender();
    assert.deepEqual(view().state, { kind: 'working' });
    await page.settle();
    assert.deepEqual(fetches.map((f) => [f.init.method, f.url, f.init.credentials]), [['POST', ROBLOX_REDEEM_PATH, 'same-origin'], ['POST', ROBLOX_CREATE_PATH, 'same-origin'], ['POST', ROBLOX_REDEEM_PATH, 'same-origin']]);
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession', 'verifyOtp']);
    assert.deepEqual(sc.calls[1].args, [{ token_hash: HASH, type: 'magiclink' }]);
    assert.deepEqual(rc.navigations, [{ to: '/settings', options: { replace: true } }]);
    assert.deepEqual(reads, []);
  });
});

test('LANDING PAGE, run, a first sight: Go back declines at the worker, goes to the sign-in page, and makes and trades nothing', async () => {
  await scenario({ answers: { [ROBLOX_REDEEM_PATH]: [ASKED] } }, async ({ page, view, sc, rc, fetches }) => {
    view().onBack();
    page.rerender();
    await page.settle();
    assert.deepEqual(fetches.map((f) => f.url), [ROBLOX_REDEEM_PATH, ROBLOX_DECLINE_PATH]);
    assert.equal(fetches.some((f) => f.url === ROBLOX_CREATE_PATH), false, 'no account was made');
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession'], 'and nothing was traded');
    assert.deepEqual(rc.navigations, [{ to: '/login', options: { replace: true } }], 'back to the sign-in page, where signing in with an email is on offer');
  });
});

test('LANDING PAGE, run, a first sight where the account cannot be made: a failure card (with the worker’s reference), nothing traded, nowhere navigated', async () => {
  const taken = { status: 409, body: { error: 'x', reference: 'roblox_address_taken' } };
  await scenario({ answers: { [ROBLOX_REDEEM_PATH]: [ASKED], [ROBLOX_CREATE_PATH]: [taken] } }, async ({ page, view, sc, rc, fetches }) => {
    view().onContinue();
    page.rerender();
    await page.settle();
    assert.deepEqual(view().state, { kind: 'failed', reference: 'roblox_address_taken' });
    assert.deepEqual(fetches.map((f) => f.url), [ROBLOX_REDEEM_PATH, ROBLOX_CREATE_PATH], 'it did not redeem after a failed create');
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession']);
    assert.deepEqual(rc.navigations, []);
  });
});

test('LANDING PAGE, run, somebody signed in who meets a first sight is asked twice, in order: first whether to replace the session, then whether to make the account', async () => {
  await scenario({ session: emailSession, answers: { [ROBLOX_REDEEM_PATH]: [ASKED], [ROBLOX_CREATE_PATH]: [MADE] } }, async ({ page, view, sc, rc, fetches, storage }) => {
    assert.equal(view().state.kind, 'choice');
    assert.deepEqual(fetches, [], 'nothing redeemed while the person decides about their session');
    view().onSwitch();
    page.rerender();
    await page.settle();
    assert.deepEqual(view().state, { kind: 'confirm-new', username: 'Builder1' });
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession'], 'the existing session is still untouched');
    assert.equal(storage.map.size, DEVICE_KEYS.length, 'and so is everything the device holds');
    view().onContinue();
    page.rerender();
    await page.settle();
    assert.deepEqual(sc.calls.map((c) => c.method), ['getSession', 'verifyOtp']);
    assert.deepEqual(rc.navigations, [{ to: '/settings', options: { replace: true } }]);
    assert.deepEqual([...storage.map.keys()], ['theme'], 'the account was replaced by another, so the previous one’s local state is cleared');
  });
});

/* ------------------------------------------------------------------- clearing the previous account --- */

test('clearAccountState removes the drafts, recent searches and view state, and only those', () => {
  const real = globalThis.window;
  const storage = deviceStorage();
  globalThis.window = { localStorage: storage };
  try {
    writeDraft('project-2', 'another draft');
    writeViewChoice('rail', 'closed');
    assert.equal(storage.map.size, DEVICE_KEYS.length + 2);
    clearAccountState();
    assert.deepEqual([...storage.map.keys()], ['theme']);
  } finally {
    if (real === undefined) delete globalThis.window; else globalThis.window = real;
  }
});

test('clearAccountState clears every family the sign-out handler in lib/auth.tsx clears, so the two lists cannot drift', () => {
  const called = (file) => new Set([...readFileSync(join(WEB, 'src', 'lib', file), 'utf8').matchAll(/\b(clearAll[A-Za-z]+)\(\)/g)].map((m) => m[1]));
  const signOut = called('auth.tsx');
  const here = called('account-state.ts');
  assert.ok(signOut.size >= 3, 'the sign-out handler clears the three families');
  assert.deepEqual([...here].sort(), [...signOut].sort());
});
