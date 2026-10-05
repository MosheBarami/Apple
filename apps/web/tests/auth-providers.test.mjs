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
    'lib/roblox-signin.ts': { useRobloxConfigured: '() => globalThis.__pageFakes.robloxConfigured' },
  },
});

// A page's effects run under the stand-in React, which has no browser: the one thing the sign-in component asks of `window` is a `pageshow`
// listener (and the app's own origin, which is empty here as it always was), so that is what is provided, and recorded.
const browser = { pageshow: null };
globalThis.window = {
  location: { origin: '' },
  addEventListener: (type, fn) => { if (type === 'pageshow') browser.pageshow = fn; },
  removeEventListener: (type, fn) => { if (type === 'pageshow' && browser.pageshow === fn) browser.pageshow = null; },
};
test.after(() => { delete globalThis.window; });

async function mountAlternative(from, providers, robloxConfigured = false) {
  Page.supabaseControls.calls.length = 0;
  Page.supabaseControls.oauthResult = { data: {}, error: null };
  globalThis.__pageFakes = { providers, robloxConfigured };
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

// The Roblox half of the seam: AlternativeSignIn is what the two pages mount, and it is the only thing that hands the view what the Roblox status
// hook said and where the person was heading. Both were pinned by the type checker alone (an unused variable), so a literal in their place
// (Roblox gone from both pages, or its return path lost) stayed green. Both are run here, with the hook answering each way.
test('the page hands the view what the Roblox status said, and the screen the person was heading for', async () => {
  for (const configured of [false, true]) {
    const page = await mountAlternative('/usage', ['google'], configured);
    assert.equal(page.result.type, Page.AlternativeSignInView);
    assert.equal(page.result.props.robloxConfigured, configured, `the view was told Roblox is ${!configured} when the status hook said ${configured}`);
    assert.equal(page.result.props.from, '/usage', 'the Roblox return path is not the screen the person was heading for');
  }
  const other = await mountAlternative('/projects/p1', [], true);
  assert.equal(other.result.props.from, '/projects/p1');
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

// A successful start leaves the buttons held, because the browser is on its way to the provider. A page restored from the back/forward cache
// (`pageshow`, persisted) is exactly as it was left, so it must let go; an ordinary `pageshow` (a first load) must not.
test('A PAGE RESTORED FROM THE BACK/FORWARD CACHE RELEASES THE BUTTONS THAT A SUCCESSFUL START LEFT HELD', async () => {
  const page = await mountAlternative('/', ['google', 'discord']);
  assert.equal(typeof browser.pageshow, 'function', 'the page listens for pageshow');
  page.result.props.onChoose('google');
  await page.settle();
  assert.equal(page.result.props.busy, 'google', 'a successful start leaves the pressed button busy (the browser is leaving)');
  browser.pageshow({ persisted: false });
  await page.settle();
  assert.equal(page.result.props.busy, 'google', 'an ordinary pageshow is not a restore');
  browser.pageshow({ persisted: true });
  await page.settle();
  assert.equal(page.result.props.busy, null, 'restored from the cache: nothing is in flight, so the buttons are released');
  page.unmount();
  assert.equal(browser.pageshow, null, 'the listener is removed when the page goes');
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

/* ------------------------------------------------------------------ the three look alike --- */

//[[ RESTATED 2026-10-05 (M2 fix cycle 2), AND AGAIN IN CYCLE 3. Cycle 2: it pinned the rule's text `.auth-page a.btn { ... }`, and that selector also reached the
//   six primary anchor buttons (<Link className="btn btn-primary btn-block">: the confirmation, reset and recovery screens): their accent border turned into
//   the faint control hairline. Cycle 3, three things the cycle 2 matcher got wrong: (1) it split a selector on whitespace and required every container to be
//   one of three names, so `.auth-page .auth-card > a { border: ... }` (a child combinator) was not seen; (2) it forbade a LINE HEIGHT on every anchor button,
//   which is what kept the primary anchors 1.7px taller than the <button> beside them (47.7px against 46px), so the fix for that was blocked by the test; (3) it
//   carried the 20px and the hairline as numbers of its own. The properties it keeps: only the Roblox anchor carries the hairline; no rule gives a primary
//   anchor button a border that the primary <button> beside it does not get too (a design change that styles both alike is not this defect); and every full-width
//   anchor has the line a <button> has, read from the button element rule and not written here. ]]

// A small selector matcher, for the one question this test asks: COULD THIS SELECTOR MATCH A PRIMARY ANCHOR BUTTON? It over-approximates (a sibling or a state
// it cannot model counts as possible), because a rule that might reach the button is the one to look at, and it is run on selectors of its own below so it is known
// to see what it must. The chain is the markup's: the page, the form column, the card, then the anchor.
const PRIMARY_CHAIN = (anchorClasses, last = { tag: 'a', classes: anchorClasses, attrs: ['href'] }) => [
  { tag: 'html', classes: [], attrs: ['data-theme', 'lang'] },
  { tag: 'body', classes: [], attrs: [] },
  { tag: null, classes: ['auth-page'], attrs: [] }, // the containers are a <div> or a <form>: any tag
  { tag: null, classes: ['auth-form-col'], attrs: [] },
  { tag: null, classes: ['auth-card'], attrs: [] },
  last,
];
const NEVER_ON_AN_ANCHOR = new Set(['disabled', 'enabled', 'checked', 'invalid', 'valid', 'required', 'optional', 'placeholder-shown', 'read-only', 'read-write']);
const splitTop = (selector, at) => { // split on `at` outside parentheses and brackets
  const parts = []; let depth = 0; let cur = '';
  for (const ch of selector) {
    if ('(['.includes(ch)) depth++; if (')]'.includes(ch)) depth--;
    if (depth === 0 && at(ch)) { if (cur) parts.push(cur); cur = ''; parts.push(ch.trim() ? ch : ' '); continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
};
/** One compound selector (`a.btn:not(.btn-primary):hover`) against one element: could it match? Pseudo-elements are not elements (null). */
function compoundMatches(compound, el) {
  if (/::|:(before|after|first-line|first-letter)(?![\w-])/.test(compound)) return null;
  let rest = compound; const need = { classes: [], attrs: [] }; let tag = null; let ok = true;
  const lead = /^(\*|[a-zA-Z][\w-]*)/.exec(rest); if (lead) { tag = lead[1]; rest = rest.slice(lead[0].length); }
  while (rest) {
    let m;
    if ((m = /^\.([\w-]+)/.exec(rest))) need.classes.push(m[1]);
    else if ((m = /^#([\w-]+)/.exec(rest))) ok = false;
    else if ((m = /^\[\s*([\w-]+)[^\]]*\]/.exec(rest))) need.attrs.push(m[1]);
    else if ((m = /^:([\w-]+)\(/.exec(rest))) {
      let depth = 1, i = m[0].length; for (; i < rest.length && depth; i++) { if (rest[i] === '(') depth++; if (rest[i] === ')') depth--; }
      const args = rest.slice(m[0].length, i - 1); m = [rest.slice(0, i)];
      const alternatives = splitTop(args, (ch) => ch === ',').filter((a) => a !== ',');
      const any = alternatives.some((a) => compoundMatches(a.trim(), el) === true);
      if (m && /^:not\(/.test(rest) && any) ok = false;
      if (/^:(is|where)\(/.test(rest) && !any) ok = false;
    } else if ((m = /^:([\w-]+)/.exec(rest))) {
      if (NEVER_ON_AN_ANCHOR.has(m[1])) ok = false;
      if (m[1] === 'root' && el.tag !== 'html') ok = false;
    } else return null; // something this matcher does not know: not read as a match
    rest = rest.slice(m[0].length);
  }
  if (tag && tag !== '*' && el.tag && tag.toLowerCase() !== el.tag) ok = false;
  if (!need.classes.every((c) => el.classes.includes(c))) ok = false;
  if (!need.attrs.every((a) => el.attrs.includes(a))) ok = false;
  return ok;
}
/** Could `selector` (a list) match the last element of `chain`? Every combinator is read as "somewhere above, in this order"; a compound before `+` or `~` is a sibling and is not held. */
export function couldReach(selector, chain) {
  return selector.split(/,(?![^(\[]*[)\]])/).some((one) => {
    const tokens = splitTop(one.trim(), (ch) => /[\s>+~]/.test(ch)).filter((t) => t.trim() || t === ' ');
    const compounds = []; // [compound, combinator that follows it]
    for (const t of tokens) {
      if (/^[>+~]$/.test(t.trim()) && t.trim()) { if (compounds.length) compounds[compounds.length - 1][1] = t.trim(); continue; }
      if (t === ' ') { if (compounds.length && !compounds[compounds.length - 1][1]) compounds[compounds.length - 1][1] = ' '; continue; }
      compounds.push([t, null]);
    }
    if (!compounds.length) return false;
    const subject = compounds.pop()[0];
    if (compoundMatches(subject, chain.at(-1)) !== true) return false;
    const held = compounds.filter(([, next]) => next !== '+' && next !== '~').map(([c]) => c);
    let at = 0;
    for (const c of held) {
      while (at < chain.length - 1 && compoundMatches(c, chain[at]) !== true) at++;
      if (at >= chain.length - 1) return false;
      at++;
    }
    return true;
  });
}
const BORDERS = /^border(?!-radius|-collapse|-spacing|-image)[\w-]*$/;
const declaredIn = (body, prop) => new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();
const bordersOf = (body) => [...body.matchAll(/(?:^|[;\s])([\w-]+)\s*:/g)].map((m) => m[1]).filter((n) => BORDERS.test(n));

test('THE MATCHER SEES A RULE THAT REACHES A PRIMARY ANCHOR BUTTON, however it is written, and passes the ones that do not', () => {
  const chain = PRIMARY_CHAIN(['btn', 'btn-primary', 'btn-block']);
  for (const reaches of [
    '.auth-page a.btn', '.auth-page .btn', '.auth-page a', 'a.btn', '.btn', '.auth-page .auth-card > a', '.auth-page > .auth-form-col .auth-card a', '.auth-page .auth-card>a.btn-primary',
    '.auth-page a[href]', '.auth-page a:not(.auth-roblox-link)', '.auth-page a.btn-block', ':root[data-theme="light"] .auth-page .btn-primary', '.auth-page .btn-block, .auth-page .nope',
    '.auth-page .auth-card .btn-block + .btn-block', '.auth-page .auth-card ~ a', '.auth-page a.btn:hover', '.auth-page .btn-primary:is(a, button)', 'a.btn:where(.btn-primary)',
  ]) assert.equal(couldReach(reaches, chain), true, `a rule on \`${reaches}\` is not seen as reaching the primary anchor`);
  for (const misses of [
    '.auth-page a.auth-roblox-link', '.auth-page .auth-theme-toggle .btn', '.auth-page .btn[data-busy="true"]', '.auth-page .btn[data-busy="true"]::before', '.auth-page button.btn', '.auth-page .btn:disabled',
    '.auth-page .auth-card .btn-block:not(.btn-primary):hover:not(:disabled)', '.auth-page .auth-switch a', '.auth-page .auth-card .field input', '.auth-page .btn-ghost', '.auth-page .auth-switch .btn-ghost',
    '.auth-page a.btn-block:before', '.auth-page a.btn-block::after',
  ]) assert.equal(couldReach(misses, chain), false, `a rule on \`${misses}\` is seen as reaching the primary anchor`);
  // The primary <button> beside it: a rule that reaches both styles them alike, and one that reaches only the anchor is the defect.
  const button = PRIMARY_CHAIN(null, { tag: 'button', classes: ['btn', 'btn-primary', 'btn-block'], attrs: ['type'] });
  for (const both of ['.auth-page .btn-primary', '.auth-page .btn-block', '.auth-page .btn', '.auth-page .auth-card .btn-block + .btn-block']) assert.equal(couldReach(both, button), true, `\`${both}\` is not seen as reaching a primary button`);
  for (const anchorOnly of ['.auth-page a.btn', '.auth-page a', '.auth-page .auth-card > a', '.auth-page a[href]', '.auth-page a.btn-block']) assert.equal(couldReach(anchorOnly, button), false, `\`${anchorOnly}\` is seen as reaching a button`);
  assert.deepEqual(bordersOf('border:1px solid red; line-height:20px'), ['border']);
  assert.deepEqual(bordersOf('border-color:red;border-block-start-color:blue;border-radius:6px;margin:0'), ['border-color', 'border-block-start-color']);
});

test('"Continue with Roblox" is an anchor with the hairline a button gets from the element rule, on a class of its own; no other anchor button gets a border, and every full-width anchor has a button’s line', () => {
  const stripped = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Every rule of the sheet, outside or inside an @media block: a selector list and its declarations.
  const rulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const rules = rulesOf(stripped('routes', 'auth.css'));
  assert.ok(rules.length > 40, `the scan read ${rules.length} rules of auth.css`);
  // The element every primary anchor button is, from the markup (not written here): its classes.
  const source = parse('routes', 'auth-pages.tsx');
  const primaries = nodes(source).filter((n) => ts.isJsxOpeningElement(n) && n.tagName.getText() === 'Link' && /btn-primary/.test(n.attributes.getText()));
  assert.ok(primaries.length >= 6, `${primaries.length} primary anchor buttons found`);
  const classesOf = (el) => /className="([^"]*)"/.exec(el.attributes.getText())?.[1].split(/\s+/).sort().join(' ');
  const shapes = new Set(primaries.map(classesOf));
  assert.deepEqual([...shapes], ['btn btn-block btn-primary'], 'the primary anchor buttons are not all one shape');
  const chain = PRIMARY_CHAIN(['btn', 'btn-primary', 'btn-block']);
  const src = readFileSync(join(WEB, 'src', 'routes', 'auth-pages.tsx'), 'utf8');
  for (const container of ['auth-page', 'auth-form-col', 'auth-card']) assert.match(src, new RegExp(`className="${container}"`), `the markup has no .${container}, so the chain this matcher asks about is not the page's`);
  const buttonChain = PRIMARY_CHAIN(null, { tag: 'button', classes: ['btn', 'btn-primary', 'btn-block'], attrs: ['type'] });
  const reaching = rules.filter((r) => couldReach(r.selector, chain));
  assert.ok(reaching.length > 3, 'the matcher found almost no rule that reaches a primary anchor button, so it cannot tell a broad rule from a scoped one');
  const anchorOnly = reaching.filter((r) => !couldReach(r.selector, buttonChain));
  // (1) None of the anchor-only rules gives it a border (its own comes from the primary variant: the accent), so it can never differ from the button beside it.
  const bordered = anchorOnly.filter((r) => bordersOf(r.body).length);
  assert.deepEqual(bordered.map((r) => r.selector), [], 'a rule of auth.css gives a border to the anchor buttons and not to the buttons, the primary ones among them');
  // (2) Every full-width anchor has the line a <button> has, and that is read from the button element rule.
  const system = rulesOf(stripped('design', 'system.css'));
  const element = system.filter((r) => r.selector.startsWith('button:where(') && !/:(hover|active|disabled|focus)/.test(r.selector) && declaredIn(r.body, 'line-height'));
  assert.equal(element.length, 1, 'the button element rule of system.css (the one with a line height) was not found exactly once');
  const buttonLine = declaredIn(element[0].body, 'line-height');
  const buttonBorder = declaredIn(element[0].body, 'border');
  assert.match(buttonLine, /^\d+px$/);
  assert.match(buttonBorder, /^1px solid var\(--control-line\)$/);
  const lines = reaching.filter((r) => declaredIn(r.body, 'line-height'));
  assert.ok(lines.length >= 1, 'no rule gives the primary anchor buttons a line height, so they inherit the page’s and stand taller than a <button>');
  for (const r of lines.filter((l) => anchorOnly.includes(l))) assert.equal(declaredIn(r.body, 'line-height'), buttonLine, `\`${r.selector}\` gives an anchor button a line other than a <button>'s ${buttonLine}`);
  // (3) The hairline sits on the Roblox link's own class and is the button's own.
  const mine = rules.filter((r) => /\.auth-roblox-link(?![\w-])/.test(r.selector));
  assert.equal(mine.length, 1, 'the Roblox link has one rule of its own');
  assert.equal(mine[0].selector, '.auth-page a.auth-roblox-link');
  assert.equal(declaredIn(mine[0].body, 'border'), buttonBorder, 'the Roblox link’s border is not the button element rule’s');
  assert.equal(couldReach(mine[0].selector, chain), false, 'the Roblox rule reaches a primary anchor button');
  // The class is on the Roblox anchor and on no other element, and no primary button wears it.
  const wearing = nodes(source).filter((n) => ts.isJsxAttribute(n) && n.name.getText() === 'className' && /(^|[\s"'`])auth-roblox-link(?![\w-])/.test(n.initializer?.getText() ?? ''));
  assert.equal(wearing.length, 1, 'the class is worn by more or fewer than the one Roblox link');
  const opening = wearing[0].parent.parent;
  assert.equal(opening.tagName.getText(), 'a', 'the Roblox link is an anchor');
  assert.match(opening.getText(), /href=\{robloxStartHref\(from\)\}/);
  assert.doesNotMatch(wearing[0].initializer.getText(), /btn-primary/);
  // The anchor is the only one of the three that is not a <button> (it is a navigation, not an action), and it says so in the markup.
  assert.match(src, /<a className="btn btn-block auth-roblox-link" href=\{robloxStartHref\(from\)\}>/);
  assert.match(src, /<button\s+key=\{provider\}\s+type="button"\s+className="btn btn-block"/);
  // The Roblox anchor is a full-width anchor too, so it has the line without a rule of its own.
  assert.equal(couldReach('.auth-page a.btn-block', PRIMARY_CHAIN(['btn', 'btn-block', 'auth-roblox-link'])), true);
});
