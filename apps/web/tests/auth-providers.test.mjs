/**
 * GOOGLE AND DISCORD BUTTONS EXIST ONLY WHEN THE PROJECT SAYS THE PROVIDER IS ON (M2 step 2.3, item C1).
 *
 * Both providers are off at the Supabase project today (owner item N2). A button for a provider that is off leads to an error
 * page: a fake control. So the decision is the project's own answer, `GET <SUPABASE_URL>/auth/v1/settings`, and it is held
 * three ways, each by running the shipped code:
 *
 *   - the DECISION FUNCTION (`enabledProviders`) and the fetch around it are called with stand-ins for the network;
 *   - the HOOK is run, effects and all, against the stand-in for React in tests/hook-harness.mjs: nothing before the answer,
 *     one request for any number of screens, no retry after a failure, no state set after the page has gone;
 *   - the SCREENS are rendered to markup (tests/ui-bundle.mjs) and the click is run (tests/page-harness.mjs), so the button
 *     is the one a browser receives and its click calls `supabase.auth.signInWithOAuth` with what it should.
 *
 * Two structural checks remain, on the syntax tree: `signInWithOAuth` is called from one component only, and that component
 * takes its list from the hook, so no button can be written by hand beside it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { loadWithReact } from './hook-harness.mjs';
import { loadPage } from './page-harness.mjs';

const SETTINGS_URL = 'https://npqvyijsvzkuwddyhtpm.supabase.co/auth/v1/settings';
// The shape the project really answers with: a long `external` object of booleans beside other settings.
const settings = (external) => ({ external: { email: true, phone: false, azure: false, ...external }, disable_signup: false, mailer_autoconfirm: false });
const answer = (status, body, contentType = 'application/json') =>
  async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });

function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

async function withFetch(impl, body) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await body();
  } finally {
    globalThis.fetch = real;
  }
}

/** A fresh copy of the module, so its once-per-page cache starts empty, as it does on a page load. */
const fresh = () => loadWithReact('src/lib/auth-providers.ts', 'auth-providers');
// The module imports lib/mock (for MOCK_MODE), which node cannot load as bare source, so it is bundled; the pure parts are read from the bundle.
const { OAUTH_PROVIDERS, PROVIDER_NAME, SETTINGS_PATH, enabledProviders } = await fresh();

/* ------------------------------------------------------------------ the decision --- */

test('the provider list is exactly Google and Discord, and each has the name a person reads', () => {
  assert.deepEqual([...OAUTH_PROVIDERS].sort(), ['discord', 'google']);
  assert.ok(OAUTH_PROVIDERS.length > 0);
  for (const provider of OAUTH_PROVIDERS) assert.match(PROVIDER_NAME[provider], /^[A-Z][a-z]+$/);
});

test('enabledProviders says yes only to external.<provider> === true', () => {
  assert.deepEqual(enabledProviders(settings({ google: true, discord: true })), ['google', 'discord'], 'the positive control');
  assert.deepEqual(enabledProviders(settings({ google: true })), ['google']);
  assert.deepEqual(enabledProviders(settings({ discord: true })), ['discord']);
  assert.deepEqual(enabledProviders(settings({ google: false, discord: false })), [], 'both are off today');
  // Anything that is not the boolean true is not a yes.
  for (const notYes of ['true', 1, 'yes', {}, [], null, undefined, 0]) {
    assert.deepEqual(enabledProviders(settings({ google: notYes, discord: notYes })), [], `${JSON.stringify(notYes)} is not a yes`);
  }
});

test('a settings document of the wrong shape says none, and so does no document at all', () => {
  for (const bad of [null, undefined, 'x', 42, [], {}, { external: null }, { external: 'google' }, { external: [] }, { google: true }, { providers: { google: true } }]) {
    assert.deepEqual(enabledProviders(bad), [], JSON.stringify(bad));
  }
  // A provider this app has no button for is ignored, not drawn.
  assert.deepEqual(enabledProviders(settings({ github: true, facebook: true, azure: true })), []);
});

test('the answer keeps the app order, whatever order the project lists them in', () => {
  assert.deepEqual(enabledProviders({ external: { discord: true, google: true } }), ['google', 'discord']);
});

/* ------------------------------------------------------------------ the request --- */

test('the request is a GET of the project settings with the public key, and every failure is none', async () => {
  const M = await fresh();
  let seen;
  const out = await M.fetchEnabledProviders(async (url, init) => { seen = { url, init }; return new Response(JSON.stringify(settings({ google: true }))); });
  assert.deepEqual(out, ['google']);
  assert.equal(seen.url, SETTINGS_URL);
  assert.equal(SETTINGS_PATH, '/auth/v1/settings');
  assert.equal(seen.init.method, undefined, 'a GET: it reads and writes nothing');
  assert.equal(seen.init.body, undefined);
  assert.match(seen.init.headers.apikey, /^sb_publishable_/, 'the project answers only to its public key');

  for (const [what, respond] of [
    ['a 500 that says true', answer(500, settings({ google: true }))],
    ['a 401', answer(401, { message: 'no apikey' })],
    ['a 429', answer(429, settings({ google: true }))],
    ['an HTML page (a dev server with nothing behind it)', answer(200, '<!doctype html><title>app</title>', 'text/html')],
    ['a body that is not JSON', answer(200, '{not json')],
    ['a body of the wrong shape', answer(200, { external: 'google' })],
    ['a network failure', async () => { throw new TypeError('network'); }],
  ]) {
    assert.deepEqual(await M.fetchEnabledProviders(respond), [], `${what}: fail closed`);
  }
});

/* ------------------------------------------------------------------ the hook --- */

test('NOTHING is drawn before the project answers, and the buttons are there only after it says yes', async () => {
  for (const [what, respond, shown] of [
    ['both on', answer(200, settings({ google: true, discord: true })), ['google', 'discord']],
    ['only Discord on', answer(200, settings({ discord: true })), ['discord']],
    ['both off (today)', answer(200, settings({})), []],
    ['a failing status that says true', answer(503, settings({ google: true })), []],
    ['a network failure', async () => { throw new TypeError('network'); }, []],
  ]) {
    const held = gate();
    await withFetch(async (...args) => { await held.promise; return respond(...args); }, async () => {
      const M = await fresh();
      const hook = M.mountStub(() => M.useEnabledProviders());
      assert.deepEqual(hook.result, [], `${what}: nothing on the first render`);
      await hook.settle();
      assert.deepEqual(hook.result, [], `${what}: nothing while the project has not answered`);
      held.open();
      await hook.settle();
      assert.deepEqual(hook.result, shown, `${what}: once it has answered`);
    });
  }
});

test('the settings are fetched ONCE for the page, however many screens ask, and a failure is not retried', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; return new Response(JSON.stringify(settings({ google: true }))); }, async () => {
    const M = await fresh();
    const hooks = [M.mountStub(() => M.useEnabledProviders()), M.mountStub(() => M.useEnabledProviders()), M.mountStub(() => M.useEnabledProviders())];
    await Promise.all(hooks.map((h) => h.settle()));
    assert.equal(calls, 1, 'three screens, one request');
    for (const h of hooks) assert.deepEqual(h.result, ['google']);
    const late = M.mountStub(() => M.useEnabledProviders());
    await late.settle();
    assert.equal(calls, 1, 'a screen that mounts later reads the page’s answer');
    assert.deepEqual(late.result, ['google']);
  });

  calls = 0;
  await withFetch(async () => { calls += 1; throw new TypeError('network'); }, async () => {
    const M = await fresh();
    const first = M.mountStub(() => M.useEnabledProviders());
    await first.settle();
    const second = M.mountStub(() => M.useEnabledProviders());
    await second.settle();
    assert.equal(calls, 1, 'a failure is the page’s answer too: it fails closed until the page is reloaded');
    assert.deepEqual(second.result, []);
  });
});

test('an answer that arrives after the screen has gone is not applied', async () => {
  const held = gate();
  await withFetch(async () => { await held.promise; return new Response(JSON.stringify(settings({ google: true }))); }, async () => {
    const M = await fresh();
    const hook = M.mountStub(() => M.useEnabledProviders());
    await hook.settle();
    hook.unmount();
    held.open();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hook.setsAfterUnmount, 0, 'a state update was attempted on an unmounted component');
  });
});

/* ------------------------------------------------------------------ the screens --- */

const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { MemoryRouter } from 'react-router-dom';
  import { AlternativeSignIn, AlternativeSignInView, OAuthButtonsView } from './src/routes/auth-pages';
  export { h, renderToStaticMarkup, MemoryRouter, AlternativeSignIn, AlternativeSignInView, OAuthButtonsView };
`, { name: 'auth-providers', resolveDir: WEB });
const render = (element) => renderWith(ui.renderToStaticMarkup, ui.h(ui.MemoryRouter, null, element));
const noop = () => {};
const view = (props) => render(ui.h(ui.AlternativeSignInView, { robloxConfigured: false, providers: [], from: '/', busy: null, error: null, onChoose: noop, ...props }));

test('with nothing switched on the screen draws NOTHING: no button, no "or", no disabled stand-in', () => {
  assert.equal(view({}), '');
  assert.equal(render(ui.h(ui.OAuthButtonsView, { providers: [], busy: null, onChoose: noop })), '');
});

test('a button is drawn for each provider that is on, and for no other', () => {
  const both = view({ providers: ['google', 'discord'] });
  const names = [...both.matchAll(/<button[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/button>/g)].map((m) => text(m[1]));
  assert.deepEqual(names, ['Continue with Google', 'Continue with Discord']);
  const only = view({ providers: ['discord'] });
  assert.match(text(only), /Continue with Discord/);
  assert.doesNotMatch(text(only), /Google/);
  assert.equal((both.match(/<p class="auth-switch">or<\/p>/g) ?? []).length, 1, 'one "or" for every way in');
  // Each is a real button that does nothing until pressed, never a link to a dead address.
  assert.doesNotMatch(both, /<a /);
  assert.equal((both.match(/type="button"/g) ?? []).length, 2);
});

test('the three ways in share one "or", in the order Roblox, Google, Discord', () => {
  const all = view({ robloxConfigured: true, providers: ['google', 'discord'] });
  assert.equal((all.match(/>or</g) ?? []).length, 1);
  const order = [...text(all).matchAll(/Continue with (Roblox|Google|Discord)/g)].map((m) => m[1]);
  assert.deepEqual(order, ['Roblox', 'Google', 'Discord']);
  assert.match(view({ robloxConfigured: true }), /Continue with Roblox/, 'Roblox alone still draws its own');
  assert.doesNotMatch(view({ robloxConfigured: true }), /Google|Discord/);
});

test('while one sign-in starts, every button is held and the pressed one says so; a failure is said in words', () => {
  const html = view({ providers: ['google', 'discord'], busy: 'google' });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2, 'both held, so a second press cannot start a second sign-in');
  assert.equal((html.match(/data-busy="true"/g) ?? []).length, 1, 'only the pressed one');
  assert.match(text(element(html, /<button[^>]*data-busy="true"/)), /Google/, 'and it is the one pressed');
  assert.match(view({ providers: ['google'], error: 'We could not start signing in with Google. Try again, or use your email.' }), /role="alert"[^>]*>We could not start signing in with Google/);
});

test('the first render of the page component draws nothing: it waits for the project', () => {
  assert.equal(render(ui.h(ui.AlternativeSignIn, { from: '/' })), '');
});

/* ------------------------------------------------------------------ the click, run --- */

// The hooks are faked here (their own behaviour is the section above); what this runs is the page's wiring of them and the click.
const Page = await loadPage({
  entry: 'src/routes/auth-pages.tsx',
  name: 'auth-providers-page',
  real: ['lib/auth-flows.ts'],
  fakes: {
    'lib/auth-providers.ts': { useEnabledProviders: '() => globalThis.__pageFakes.providers', PROVIDER_NAME: '({ google: "Google", discord: "Discord" })' },
    'lib/roblox-signin.ts': { useRobloxConfigured: '() => false' },
  },
});

async function mountAlternative(from, providers) {
  Page.supabaseControls.calls.length = 0;
  Page.supabaseControls.oauthResult = { data: {}, error: null };
  globalThis.__pageFakes = { providers };
  const page = Page.mountStub(() => Page.AlternativeSignIn({ from }));
  await page.settle();
  return page;
}

test('the page hands the view exactly the providers the hook returned', async () => {
  for (const providers of [[], ['google'], ['google', 'discord']]) {
    const page = await mountAlternative('/', providers);
    assert.equal(page.result.type, Page.AlternativeSignInView);
    assert.deepEqual([...page.result.props.providers], providers);
  }
});

test('pressing a button calls supabase.auth.signInWithOAuth for THAT provider and comes back to the screen the person was heading for', async () => {
  const page = await mountAlternative('/usage', ['google', 'discord']);
  page.result.props.onChoose('discord');
  await page.settle();
  const [call] = Page.supabaseControls.calls.filter((c) => c.method === 'signInWithOAuth');
  assert.ok(call, 'signInWithOAuth was not called');
  assert.equal(call.args[0].provider, 'discord');
  assert.match(call.args[0].options.redirectTo, /\/app\/usage$/, 'back to the screen the person was heading for, inside the app');
  assert.equal(Page.supabaseControls.calls.filter((c) => c.method === 'signUp').length, 0, 'an OAuth sign-in is not an email sign-up');
});

test('a start that fails comes back as a sentence and releases the buttons', async () => {
  const page = await mountAlternative('/', ['google']);
  Page.supabaseControls.oauthResult = { data: {}, error: { message: 'provider is not enabled' } };
  page.result.props.onChoose('google');
  await page.settle();
  assert.equal(page.result.props.busy, null, 'released');
  assert.match(page.result.props.error, /We could not start signing in with Google/);
  assert.doesNotMatch(page.result.props.error, /provider is not enabled/, 'the provider’s own text is not shown');
});

test('a second press while one is starting does nothing', async () => {
  const page = await mountAlternative('/', ['google', 'discord']);
  const held = gate();
  Page.supabaseControls.oauthResult = held.promise.then(() => ({ data: {}, error: null }));
  page.result.props.onChoose('google');
  await page.settle();
  page.result.props.onChoose('discord');
  await page.settle();
  assert.equal(Page.supabaseControls.calls.filter((c) => c.method === 'signInWithOAuth').length, 1);
  held.open();
});

/* ------------------------------------------------------------------ where it is called (syntax tree) --- */

const parse = (...p) => ts.createSourceFile(p.at(-1), readFileSync(join(WEB, 'src', ...p), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };

test('signInWithOAuth is called from one component, and that component draws only what the hook says is on', () => {
  const calls = nodes(parse('routes', 'auth-pages.tsx')).filter((n) => ts.isCallExpression(n) && /signInWithOAuth$/.test(n.expression.getText()));
  assert.equal(calls.length, 1, 'there is not exactly one signInWithOAuth call in the auth pages');
  const owner = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionDeclaration(p)) return p; return null; };
  const component = owner(calls[0]);
  assert.equal(component?.name?.text, 'AlternativeSignIn', 'the call is outside the component that waits for the project');
  assert.match(component.getText(), /useEnabledProviders\(\)/, 'the component does not take its list from the hook');
  assert.match(component.getText(), /providers=\{providers\}/, 'the list the hook returned is what the view draws');
  // No other route may start an OAuth sign-in by hand.
  for (const file of [['routes', 'settings.tsx'], ['routes', 'dashboard.tsx'], ['routes', 'workspace.tsx'], ['components', 'layout.tsx']]) {
    assert.equal(nodes(parse(...file)).some((n) => ts.isCallExpression(n) && /signInWithOAuth$/.test(n.expression.getText())), false, `${file.join('/')} starts an OAuth sign-in`);
  }
});

test('no Google or Discord button is written by hand: the words come from the provider list', () => {
  const written = nodes(parse('routes', 'auth-pages.tsx')).filter((n) => ts.isJsxText(n) && /Continue with (Google|Discord|GitHub|Facebook|Twitter)/i.test(n.getText()));
  assert.deepEqual(written.map((n) => n.getText()), [], 'a button for a named provider is in the markup, outside the list');
  assert.match(readFileSync(join(WEB, 'src', 'routes', 'auth-pages.tsx'), 'utf8'), /Continue with \{PROVIDER_NAME\[provider\]\}/);
});

test('both the sign-in page and the sign-up page offer the ways in', () => {
  const source = parse('routes', 'auth-pages.tsx');
  for (const page of ['LoginPage', 'SignupPage']) {
    const fn = nodes(source).find((n) => ts.isFunctionDeclaration(n) && n.name?.text === page);
    assert.ok(fn, `${page} is not declared`);
    assert.ok(nodes(fn).some((n) => (ts.isJsxSelfClosingElement(n) || ts.isJsxElement(n)) && (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText() === 'AlternativeSignIn'), `${page} does not offer them`);
  }
});

test('the hook module draws nothing and imports no client: it can be loaded without building a Supabase client', () => {
  const src = readFileSync(join(WEB, 'src', 'lib', 'auth-providers.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /from '\.\/supabase'/, 'it imports the client file, which builds a client on import');
  assert.match(src, /from '\.\/supabase-config'/);
});
