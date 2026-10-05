/**
 * ACCOUNT CONNECTIONS AND THE AVATAR (M2 step 2.3, item C6).
 *
 *   1. THE GOOGLE AND DISCORD CARDS exist only when the Supabase project says the provider is on. Today both are off (owner item N2),
 *      so today neither card, nor its settings row, nor its search result, nor its rail entry exists: a card for a provider that is off
 *      would be a control that leads to an error.
 *   2. WHAT A CARD DOES: Connect calls supabase.auth.linkIdentity for that provider and comes back to Settings; Disconnect calls
 *      unlinkIdentity with the identity the service listed, and is offered only when the account has another way in.
 *   3. THEY ARE NOT THE OTHER THREE THINGS on that page: the Roblox card, the Open Cloud key panel and the Discord bot link keep their
 *      own rows, and the Discord sign-in card says in words that it is not the bot link.
 *   4. THE AVATAR is never "?": an account with no address takes its letter from its display name or its Roblox username, a placeholder
 *      address is never a source, and with nothing honest to take it draws a plain person mark.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { findAll, loadPage, textOf } from './page-harness.mjs';
import { SETTING_FIELDS, matchSettings } from '../src/lib/settings-search.ts';
import { avatarInitial } from '../src/lib/account-identity.ts';
import { IDENTITY_COPY, IDENTITY_FIELD, NOT_CONNECTED, ONLY_WAY_IN, canUnlink, connectedLine, fieldsForProviders, identityFor, identityLabel } from '../src/lib/identity-links.ts';

const email = { provider: 'email', identity_id: 'i-email', identity_data: { email: 'me@example.com' } };
const google = { provider: 'google', identity_id: 'i-google', identity_data: { email: 'me@gmail.example', full_name: 'Me Myself' } };
const discord = { provider: 'discord', identity_id: 'i-discord', identity_data: { custom_claims: { global_name: 'Builder#1' }, full_name: 'Builder', email: '' } };

/* ------------------------------------------------------------------ the rules --- */

test('an identity is found by its provider, and a missing list finds nothing', () => {
  assert.equal(identityFor([email, google], 'google'), google);
  assert.equal(identityFor([email, google], 'discord'), null);
  for (const none of [null, undefined, []]) assert.equal(identityFor(none, 'google'), null);
});

test('the account is named by what the provider sent: its address, else its Discord name, else its display name; text only, one line', () => {
  assert.equal(identityLabel(google), 'me@gmail.example');
  assert.equal(identityLabel(discord), 'Builder#1', 'a Discord account with no address is its global name');
  assert.equal(identityLabel({ provider: 'google', identity_data: { full_name: 'Only A Name' } }), 'Only A Name');
  assert.equal(identityLabel({ provider: 'google', identity_data: { email: '   ', name: 'Named' } }), 'Named');
  for (const none of [null, { provider: 'google' }, { provider: 'google', identity_data: null }, { provider: 'google', identity_data: {} }, { provider: 'google', identity_data: { email: 42, name: {} } }]) {
    assert.equal(identityLabel(none), null, JSON.stringify(none));
  }
  assert.equal(identityLabel({ provider: 'google', identity_data: { email: 'x'.repeat(200) } }).length, 80, 'cut to a line');
  assert.equal(connectedLine('google', google), 'Connected as me@gmail.example.');
  assert.equal(connectedLine('google', { provider: 'google' }), 'Google is connected.', 'nothing readable: it says connected and names nothing');
  assert.equal(connectedLine('discord', { provider: 'discord' }), 'Discord is connected.');
});

test('an identity may be disconnected only when the account has another way in; an unloaded list is not a yes', () => {
  assert.equal(canUnlink([email, google]), true);
  assert.equal(canUnlink([google]), false, 'the only identity: the service would refuse');
  assert.equal(canUnlink([]), false);
  assert.equal(canUnlink(null), false);
  assert.equal(canUnlink(undefined), false);
});

test('the two cards say what they are, and the Discord one says it is not the bot link', () => {
  assert.equal(IDENTITY_COPY.google.title, 'Sign in with Google');
  assert.equal(IDENTITY_COPY.discord.title, 'Sign in with Discord');
  assert.match(IDENTITY_COPY.discord.note, /separate from the Discord link below, which starts builds from a Discord channel/);
  for (const copy of Object.values(IDENTITY_COPY)) assert.match(copy.note, /sign in to this StudPilot account/);
  assert.match(ONLY_WAY_IN, /only way you sign in/);
  assert.match(NOT_CONNECTED, /^Not connected\./);
});

/* ------------------------------------------------------------------ nothing exists for a provider that is off --- */

test('with no provider on, no settings row for either exists: not in the list, not in a search, not in the rail’s fields', () => {
  assert.ok(SETTING_FIELDS.length > 10);
  const none = fieldsForProviders(SETTING_FIELDS, []);
  assert.equal(none.length, SETTING_FIELDS.length - 2, 'exactly the two identity rows are held back');
  for (const id of Object.values(IDENTITY_FIELD)) assert.equal(none.some((f) => f.id === id), false, `${id} is offered with its provider off`);
  for (const query of ['google', 'sign in with google', 'discord', 'sign in with discord', 'gmail', 'link']) {
    assert.equal(matchSettings(query, none).some((id) => Object.values(IDENTITY_FIELD).includes(id)), false, `searching "${query}" found a row that is not there`);
  }
  // The positive controls: the same search finds the rows once the provider is on, and the bot-link row is never held back.
  assert.equal(matchSettings('google', SETTING_FIELDS).includes('google-signin'), true);
  assert.equal(matchSettings('discord', none).includes('discord'), true, 'the Discord bot link is not a sign-in provider and stays');
});

test('each provider brings only its own row', () => {
  const ids = (on) => fieldsForProviders(SETTING_FIELDS, on).map((f) => f.id).filter((id) => Object.values(IDENTITY_FIELD).includes(id)).sort();
  assert.deepEqual(ids(['google']), ['google-signin']);
  assert.deepEqual(ids(['discord']), ['discord-signin']);
  assert.deepEqual(ids(['google', 'discord']), ['discord-signin', 'google-signin']);
  assert.deepEqual(ids([]), []);
});

test('the registry knows both rows, in the Connections section, with words people type', () => {
  for (const [provider, id] of Object.entries(IDENTITY_FIELD)) {
    const field = SETTING_FIELDS.find((f) => f.id === id);
    assert.ok(field, `${id} is not in the registry`);
    assert.equal(field.section, 'Connections');
    assert.equal(field.title, IDENTITY_COPY[provider].title);
    assert.ok(matchSettings(provider, SETTING_FIELDS).includes(id), `searching "${provider}" does not find it`);
  }
});

/* ------------------------------------------------------------------ the card, rendered --- */

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { IdentityCardView } from './src/components/identity-card';
  export { AccountMenuHeader } from './src/components/picks/settings/user-button';
  export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
`, { name: 'account-connections', resolveDir: WEB });
const render = (el) => renderWith(ui.renderToStaticMarkup, el);
const noop = () => {};
const card = (props) => render(ui.h(ui.IdentityCardView, { provider: 'google', identities: [email], busy: false, onConnect: noop, onDisconnect: noop, ...props }));

test('NOT CONNECTED: the sentence and one Connect button', () => {
  const html = card({});
  assert.match(text(html), /Not connected\./);
  assert.deepEqual([...html.matchAll(/<button[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/button>/g)].map((m) => text(m[1])), ['Connect Google']);
  assert.match(html, /type="button"/);
});

test('CONNECTED with another way in: who it is, and a Disconnect button', () => {
  const html = card({ identities: [email, google] });
  assert.match(text(html), /Connected as me@gmail\.example\./);
  assert.deepEqual([...html.matchAll(/<button[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/button>/g)].map((m) => text(m[1])), ['Disconnect Google']);
});

test('CONNECTED but the only way in: no button at all, only the reason', () => {
  const html = card({ identities: [google] });
  assert.equal(/<button/.test(html), false, 'a button the service would refuse');
  assert.match(text(html), /only way you sign in to this account, so it cannot be disconnected/);
});

test('while it works the button says so and is held', () => {
  assert.match(card({ busy: true }), /<button[^>]*disabled=""[^>]*>Connecting…<\/button>/);
  assert.match(card({ identities: [email, google], busy: true }), /<button[^>]*disabled=""[^>]*>Disconnecting…<\/button>/);
});

test('the Discord card says it is not the bot link, and the Google card does not mention Discord', () => {
  assert.match(text(card({ provider: 'discord' })), /separate from the Discord link below/);
  assert.doesNotMatch(text(card({ provider: 'google' })), /Discord/);
});

/* ------------------------------------------------------------------ the card, run --- */

const Card = await loadPage({
  entry: 'src/components/identity-card.tsx',
  name: 'identity-card',
  real: ['lib/identity-links.ts', 'lib/auth-flows.ts'],
  fakes: {
    'lib/auth-providers.ts': { useEnabledProviders: '() => globalThis.__pageFakes.enabled', PROVIDER_NAME: '({ google: "Google", discord: "Discord" })' },
    'components/toast.tsx': { useToast: '() => ({ toast: (...a) => globalThis.__pageFakes.toasts.push(a) })' },
    'lib/mock.ts': { MOCK_MODE: 'false', mockIdentities: '() => []' },
  },
});

async function mounted(provider, enabled, identities) {
  globalThis.__pageFakes = { enabled, toasts: [] };
  Card.supabaseControls.calls.length = 0;
  Card.supabaseControls.identities = identities;
  Card.supabaseControls.oauthResult = { data: {}, error: null };
  Card.queryControls.queries.length = 0;
  Card.queryControls.mutations.length = 0;
  Card.queryControls.answer = (o) => (o.queryKey[0] === 'identities' ? { data: identities, isPending: false, isSuccess: true } : undefined);
  const page = Card.mountStub(() => Card.IdentityCard({ provider, userId: 'u1' }));
  await page.settle();
  const query = () => Card.queryControls.queries.at(-1);
  const mutation = (i) => Card.queryControls.mutations[i];
  return { page, query, mutation, calls: (m) => Card.supabaseControls.calls.filter((c) => c.method === m) };
}

test('A CARD FOR A PROVIDER THAT IS OFF DRAWS NOTHING AND ASKS NOTHING', async () => {
  const { page, query } = await mounted('google', [], [email]);
  assert.equal(page.result, null, 'nothing is drawn');
  assert.equal(query().enabled, false, 'and the identities are not even requested');
  const other = await mounted('google', ['discord'], [email]);
  assert.equal(other.page.result, null, 'another provider being on does not switch this one on');
});

test('A CARD FOR A PROVIDER THAT IS ON draws its title and the view of the identities it read', async () => {
  const { page, query } = await mounted('discord', ['discord'], [email, discord]);
  assert.equal(query().enabled, true);
  assert.deepEqual(query().queryKey, ['identities', 'u1']);
  const heading = findAll(page.result, (n) => n.type === 'h3');
  assert.equal(textOf(heading[0]), 'Sign in with Discord');
  const view = findAll(page.result, (n) => n.props?.provider === 'discord' && n.props?.identities);
  assert.equal(view.length, 1);
  assert.deepEqual(view[0].props.identities, [email, discord]);
});

test('Connect calls supabase.auth.linkIdentity for THAT provider and returns to Settings', async () => {
  const { mutation, calls } = await mounted('google', ['google'], [email]);
  await mutation(0).mutationFn();
  const [call] = calls('linkIdentity');
  assert.ok(call, 'linkIdentity was not called');
  assert.equal(call.args[0].provider, 'google');
  assert.match(call.args[0].options.redirectTo, /\/app\/settings$/);
  assert.deepEqual(calls('unlinkIdentity'), []);
  assert.deepEqual(calls('signInWithOAuth'), [], 'linking is not signing in');
});

test('a Connect that cannot start is said in words, not hidden', async () => {
  const { mutation, calls } = await mounted('google', ['google'], [email]);
  Card.supabaseControls.oauthResult = { data: {}, error: { message: 'manual linking is disabled' } };
  await assert.rejects(() => mutation(0).mutationFn(), /manual linking is disabled/);
  mutation(0).onError(new Error('manual linking is disabled'));
  assert.deepEqual(globalThis.__pageFakes.toasts, [["Couldn't connect Google: manual linking is disabled", 'error']]);
  assert.equal(calls('linkIdentity').length, 1);
});

test('Disconnect calls unlinkIdentity with the identity exactly as the service listed it', async () => {
  const { mutation, calls } = await mounted('google', ['google'], [email, google]);
  await mutation(1).mutationFn();
  const [call] = calls('unlinkIdentity');
  assert.ok(call, 'unlinkIdentity was not called');
  assert.deepEqual(call.args[0], google);
  assert.equal(call.args[0], google, 'the same object, not a copy with fields changed');
  mutation(1).onSuccess();
  assert.deepEqual(globalThis.__pageFakes.toasts, [['Google disconnected.', 'success']]);
});

test('Disconnect refuses, before any request, when it is the only way in or there is nothing to disconnect', async () => {
  const only = await mounted('google', ['google'], [google]);
  await assert.rejects(() => only.mutation(1).mutationFn(), /no other way to sign in/);
  assert.deepEqual(only.calls('unlinkIdentity'), [], 'the service is not asked to remove the last identity');
  const none = await mounted('google', ['google'], [email, discord]);
  await assert.rejects(() => none.mutation(1).mutationFn(), /no other way to sign in/);
  assert.deepEqual(none.calls('unlinkIdentity'), []);
});

/* ------------------------------------------------------------------ where the rows are (syntax tree) --- */

const parse = (...p) => ts.createSourceFile(p.at(-1), readFileSync(join(WEB, 'src', ...p), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };
const isTag = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const tagOf = (n) => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();
const attrText = (n, name) => (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name)?.initializer?.getText();

test('each identity row is drawn only inside a check of its provider, beside (and apart from) the Roblox row, the key panel and the bot link', () => {
  const source = parse('routes', 'settings.tsx');
  const section = nodes(source).find((n) => isTag(n) && tagOf(n) === 'Section' && attrText(n, 'id') === '"connections"');
  assert.ok(section, 'the Connections section was not found');
  const rows = nodes(section).filter((n) => isTag(n) && tagOf(n) === 'Row');
  assert.deepEqual(rows.map((r) => attrText(r, 'id')), ['"roblox-signin"', '"google-signin"', '"discord-signin"', '"roblox-key"', '"api-keys"', '"discord"'], 'the rows, in order');
  for (const [provider, id] of [['google', '"google-signin"'], ['discord', '"discord-signin"']]) {
    const row = rows.find((r) => attrText(r, 'id') === id);
    const guard = (() => { for (let p = row.parent; p && p !== section; p = p.parent) if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return p.left.getText(); return null; })();
    assert.equal(guard, `oauthOn.includes('${provider}')`, `the ${provider} row is not behind its provider's check`);
    assert.ok(nodes(row).some((n) => isTag(n) && tagOf(n) === 'IdentityCard' && attrText(n, 'provider') === `"${provider}"`), `the ${provider} row does not hold its card`);
  }
  // The other three are the same rows they were: their own cards.
  const holds = (id, tag) => nodes(rows.find((r) => attrText(r, 'id') === id)).some((n) => isTag(n) && tagOf(n) === tag);
  assert.ok(holds('"roblox-signin"', 'RobloxConnectionCard'));
  assert.ok(holds('"roblox-key"', 'RobloxKeyPanel'));
  assert.ok(holds('"api-keys"', 'ApiKeysPanel'));
  assert.ok(holds('"discord"', 'DiscordCard'));
});

test('the page’s fields, search and rail all follow the same answer', () => {
  const src = readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /const oauthOn = useEnabledProviders\(\);/);
  assert.match(src, /const fields = useMemo\(\(\) => fieldsForProviders\(SETTING_FIELDS, oauthOn\), \[oauthOn\]\);/);
  assert.match(src, /matchSettings\(query, fields\)/, 'the search ignores the provider answer');
  assert.match(src, /fields: \['roblox-signin', 'google-signin', 'discord-signin', 'roblox-key', 'api-keys', 'discord'\]/, 'the Connections rail entry does not list the rows');
});

/* ------------------------------------------------------------------ the avatar --- */

test('the avatar letter: display name, then Roblox username, then address; never a placeholder, never "?"', () => {
  assert.equal(avatarInitial({ displayName: 'maya', robloxName: 'Builder1', address: 'me@example.com' }), 'M', 'the display name wins');
  assert.equal(avatarInitial({ displayName: null, robloxName: 'builder1', address: null }), 'B', 'a Roblox-only account: its username');
  assert.equal(avatarInitial({ displayName: '', robloxName: 'builder1', address: 'x@y.invalid' }), 'B');
  assert.equal(avatarInitial({ address: 'zoe@example.com' }), 'Z');
  assert.equal(avatarInitial({ address: 'roblox-1a2b@users.studpilot.invalid' }), null, 'a placeholder address is never a source');
  assert.equal(avatarInitial({ displayName: '  ', robloxName: null, address: '' }), null);
  assert.equal(avatarInitial({}), null);
  assert.equal(avatarInitial({ displayName: '🙂 Dev' }), 'D', 'a symbol is not a letter; the next character is');
  assert.equal(avatarInitial({ displayName: '𝒜lice' }) !== null, true);
  assert.equal(avatarInitial({ displayName: 'שרה' }), 'ש', 'any alphabet');
  assert.equal(avatarInitial({ displayName: 'élan' }), 'É');
  assert.equal(avatarInitial({ displayName: '42nd' }), '4');
  for (const out of ['', null, undefined, 42, {}]) assert.equal(avatarInitial({ displayName: out, robloxName: out, address: out }), null);
  // Whatever the input, the answer is one character or nothing: never the question mark that used to stand there.
  for (const parts of [{}, { displayName: '?' }, { address: '???' }, { robloxName: '!!!' }]) assert.notEqual(avatarInitial(parts), '?');
  assert.equal(avatarInitial({ displayName: '?', robloxName: 'Builder1' }), 'B', 'a name that is only a symbol falls through to the next');
});

test('a Roblox-only account’s name is never taken from the words "Roblox account"', () => {
  // The label the shell shows is "Roblox: <name>" or "Roblox account"; the letter must come from the name itself.
  assert.equal(avatarInitial({ displayName: null, robloxName: null, address: null }), null);
  assert.equal(avatarInitial({ displayName: null, robloxName: 'Zed', address: null }), 'Z');
});

const Shell = await loadPage({
  entry: 'src/components/layout.tsx',
  name: 'avatar-shell',
  real: ['lib/account-identity.ts', 'lib/use-roblox-username.ts', 'lib/view-state.ts', 'lib/rail-width.ts'],
  expose: { 'components/layout.tsx': ['Shell'] },
  fakes: {
    'lib/auth.tsx': { useAuth: '() => globalThis.__pageFakes.auth' },
    'lib/shell.tsx': { useShell: '() => globalThis.__pageFakes.shell' },
    'lib/use-create-project.ts': { useCreateProject: '() => ({ create() {}, pending: false })' },
    'lib/theme.tsx': { useTheme: '() => ({ theme: "dark", setTheme() {} })' },
    'lib/mock.ts': { MOCK_MODE: 'false' },
    'lib/api.ts': { fetchRobloxConnection: '() => null' },
  },
});

/** What the shell hands its rail as the avatar's letter, for a signed-in `user`, a profile display name and a Roblox username. */
async function railInitial({ user, displayName, robloxName }) {
  globalThis.__pageFakes = { auth: { session: { user }, signOut: async () => {} }, shell: { railOpen: true, openRail: noop, closeRail: noop, railCollapsed: false } };
  const realWindow = globalThis.window;
  const realDocument = globalThis.document;
  globalThis.window = { localStorage: { getItem: () => null, setItem: noop }, location: { search: '' } };
  globalThis.document = { addEventListener: noop, removeEventListener: noop };
  Shell.queryControls.queries.length = 0;
  Shell.queryControls.answer = (o) => {
    if (o.queryKey[0] === 'me') return { data: { profile: displayName ? { display_name: displayName } : null, quota: null } };
    if (o.queryKey[0] === 'roblox-connection' && robloxName !== undefined) return { data: { username: robloxName } };
    return undefined;
  };
  try {
    const page = Shell.mountStub(() => Shell.Shell());
    await page.settle();
    const rails = findAll(page.result, (n) => 'initial' in n.props && typeof n.props.email === 'string');
    assert.equal(rails.length, 1, 'the shell hands its rail exactly one avatar');
    return rails[0].props.initial;
  } finally {
    delete globalThis.__pageFakes;
    if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow;
    if (realDocument === undefined) delete globalThis.document; else globalThis.document = realDocument;
  }
}

const ROBLOX_ONLY = { id: 'u2', email: 'roblox-1a2b3c@users.studpilot.invalid', app_metadata: { roblox_sub: '1234567' } };
const NO_ADDRESS = { id: 'u3', app_metadata: {} };

test('THE SHELL, run: an account with no address is never "?"', async () => {
  assert.equal(await railInitial({ user: ROBLOX_ONLY, robloxName: 'builder1' }), 'B', 'a Roblox-only account: the username’s first letter');
  assert.equal(await railInitial({ user: ROBLOX_ONLY, displayName: 'Maya', robloxName: 'builder1' }), 'M', 'the display name first');
  assert.equal(await railInitial({ user: NO_ADDRESS, displayName: 'Noor' }), 'N', 'an account with no address at all: its display name');
  assert.equal(await railInitial({ user: { id: 'u1', email: 'me@example.com' } }), 'M', 'an email account: its address, as before');
  assert.equal(await railInitial({ user: ROBLOX_ONLY, robloxName: undefined }), null, 'a Roblox account whose username is not known yet: no letter, so a person mark, not "R" and not "?"');
  assert.equal(await railInitial({ user: NO_ADDRESS }), null, 'nothing known: no letter');
});

test('the three places the avatar is drawn show a person mark when there is no letter, and never a question mark', () => {
  const layout = readFileSync(join(WEB, 'src', 'components', 'layout.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const header = readFileSync(join(WEB, 'src', 'components', 'picks', 'settings', 'user-button.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(layout, /'\?'/, 'a question mark is still a fallback in the layout');
  assert.doesNotMatch(header, /'\?'/, 'a question mark is still a fallback in the account menu header');
  assert.equal((layout.match(/<AvatarMark initial=\{initial\} \/>/g) ?? []).length, 2, 'the account menu and the dock draw the same mark');
  assert.match(header, /initial \?\? \(\s*<svg/, 'the menu header draws the mark when there is no letter');
});

test('the account menu header: a letter when there is one, a person mark when there is not, and never "?"', () => {
  const client = new ui.QueryClient();
  const header = (props) => render(ui.h(ui.QueryClientProvider, { client }, ui.h(ui.AccountMenuHeader, { name: null, email: '', ...props })));
  const withLetter = header({ name: 'Builder1', initial: 'B' });
  assert.match(element(withLetter, /<span class="pk-ubtn__avatar"/), />B</);
  const without = header({ name: null, email: '', initial: null });
  const avatar = element(without, /<span class="pk-ubtn__avatar"/);
  assert.match(avatar, /<svg/, 'a person mark');
  assert.doesNotMatch(text(avatar), /\?/);
  assert.match(text(without), /Your account/, 'and the line beside it is not empty');
});
