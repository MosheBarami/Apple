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
 *     (tests/ui-bundle.mjs), so what is checked is what a browser would receive.
 *
 * The only structural checks left are two questions of WHERE a component sits (inside which route, inside which
 * page), which have no runtime answer without a browser, and they read the syntax tree rather than the text.
 *
 * WHAT EACH GROUP GUARDS:
 *   - a button that leads to an error page (shown when the worker says no, or before it has said anything);
 *   - a LOGIN CSRF through this page: it must never take a token from the URL. The worker's redirect carries
 *     nothing; the token comes from a same-origin POST that only the browser holding the cookie can answer;
 *   - a session silently replaced: somebody already signed in here is asked before the Roblox account takes over.
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
import {
  ROBLOX_REDEEM_PATH,
  ROBLOX_START_PATH,
  completeRobloxSignIn,
  describeConnection,
  disconnectMessage,
  existingSessionLine,
  fetchRobloxConfigured,
  redeemRobloxSignIn,
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
  import { RobloxCallbackPage, RobloxLandingView, RobloxSignIn, RobloxSignInView } from './src/routes/auth-pages';
  export { h, renderToStaticMarkup, MemoryRouter, RobloxCallbackPage, RobloxLandingView, RobloxSignIn, RobloxSignInView };
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
  const verify = (result) => async (args) => { calls.push(args); if (result instanceof Error) throw result; return { error: result }; };
  const deps = (over = {}) => ({ redeem: async () => ({ tokenHash: HASH, next: '/settings' }), verifyOtp: verify(null), ...over });

  assert.deepEqual(await completeRobloxSignIn(deps()), { kind: 'signed-in', next: '/settings' });
  assert.deepEqual(calls, [{ token_hash: HASH, type: 'magiclink' }]);
  assert.deepEqual(await completeRobloxSignIn(deps({ verifyOtp: verify({ message: 'Token has expired or is invalid' }) })), { kind: 'failed' });
  assert.deepEqual(await completeRobloxSignIn(deps({ verifyOtp: verify(new Error('network')) })), { kind: 'failed' }, 'a throw is a failure, never a sign-in');

  const before = calls.length;
  assert.deepEqual(await completeRobloxSignIn(deps({ redeem: async () => null })), { kind: 'failed' });
  assert.equal(calls.length, before, 'when nothing was redeemed Supabase is never called');
});

/** The landing hook with recording stand-ins. `over` replaces any of them. */
function landing(over = {}) {
  const calls = { account: 0, redeem: 0, verify: [] };
  const deps = {
    currentAccount: async () => { calls.account += 1; if (over.accountThrows) throw new Error('storage'); return over.account ?? null; },
    redeem: async () => { calls.redeem += 1; return over.redeemed === undefined ? { tokenHash: HASH, next: '/settings' } : over.redeemed; },
    verifyOtp: async (args) => { calls.verify.push(args); return { error: over.verifyError ?? null }; },
  };
  const signedIn = [];
  const hook = M.mountStub(() => M.useRobloxLanding(deps, (next) => signedIn.push(next)));
  return { hook, calls, signedIn };
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
  const { hook, calls, signedIn } = landing({ account: { email: 'me@example.com' } });
  await hook.settle();
  assert.deepEqual(hook.result.state, { kind: 'choice', email: 'me@example.com' });
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
  const { hook } = landing({ account: { email: null }, redeemed: null });
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
  const view = (state) => render(ui.h(ui.RobloxLandingView, { state, onSwitch: noop, onStay: noop }));

  const working = view({ kind: 'working' });
  assert.match(working, /role="status"/);
  assert.match(text(working), /Signing you in/);
  assert.equal(/<button|<a /.test(working), false, 'nothing to press while it works');

  const choice = view({ kind: 'choice', email: 'me@example.com' });
  assert.match(text(choice), /already signed in as me@example\.com/);
  assert.deepEqual([...choice.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]), ['Switch to my Roblox account', 'Stay signed in']);
  assert.equal(/role="alert"/.test(choice), false);

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

  const only = describeConnection({ ...base, signInOnly: true });
  assert.equal(only.canDisconnect, true);
  assert.match(only.caution, /still sign in with Roblox/, 'when Roblox is the only way in, the card says Disconnect will not remove it');
  assert.match(only.caution, /email address and set a password/);

  const none = describeConnection({ ...base, connected: false, username: null });
  assert.equal(none.canDisconnect, false);
  assert.match(none.status, /^Not connected\./);
  assert.equal(describeConnection({ ...base, connected: false, configured: false, username: null }).status, 'Not available yet.');
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

test('the landing route is declared, renders the landing page, and sits outside both guards', () => {
  const routes = nodes(parse('app.tsx')).filter((n) => isTag(n) && tagOf(n) === 'Route' && attrText(n, 'path') === '/auth/roblox');
  assert.equal(routes.length, 1, 'there is not exactly one /auth/roblox route');
  const [route] = routes;
  assert.match(attrText(route, 'element'), /^<RobloxCallbackPage\s*\/>$/, 'the route renders the landing page');
  const guards = ancestors(route).filter((n) => isTag(n)).map(tagOf).filter((t) => /Guard$/.test(t));
  assert.deepEqual(guards, [], 'the landing route is inside a guard that would bounce it before the token is used');
});

test('the Connections card is a row in settings', () => {
  const rows = nodes(parse('routes', 'settings.tsx')).filter((n) => ts.isJsxElement(n) && tagOf(n) === 'Row' && attrText(n, 'id') === 'roblox-signin');
  assert.equal(rows.length, 1, 'there is not exactly one roblox-signin row');
  assert.ok(nodes(rows[0]).some((n) => isTag(n) && tagOf(n) === 'RobloxConnectionCard'), 'the row does not hold the card');
  for (const query of ['roblox', 'disconnect', 'unlink']) assert.ok(matchSettings(query).includes('roblox-signin'), `searching "${query}" does not find it`);
});
