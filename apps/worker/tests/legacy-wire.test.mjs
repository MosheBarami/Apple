/**
 * THE RENAME'S COMPATIBILITY, EXECUTED: the old wire spellings still work, the new ones work, and
 * nothing a client could forge slips through the gap between them.
 *
 * The product used to carry its old name on the wire — the WebSocket subprotocols, the Studio
 * plugin's `X-<Brand>-*` headers, the capability schema, an attribute written into users' places.
 * The PUBLISHED plugin (Creator Store asset 107230158271368) and every open browser tab still speak
 * the old spellings, and neither can be updated from here. So the worker accepts both
 * (packages/shared/src/legacy-wire.ts) and the clients switch only after it is deployed.
 *
 * THE OLD LITERALS ARE WRITTEN OUT HERE ON PURPOSE. This file pins them as a wire contract: if it
 * derived them with `legacyOf` it would agree with a broken `legacyOf` forever. The allowlist
 * (scripts/golem-allowlist.json) names this file for that reason, and phase D deletes it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import * as W from '@apple/shared';
import { PLUGIN_CAPABILITY_SCHEMA, normalisePluginCapabilities, parsePluginCapabilities } from '../src/plugin-capabilities.ts';
import { readPluginHeaders } from '../src/plugin-version.ts';
import { usageHeaders } from '../src/public-api.ts';
import { sessionHarness } from './session-harness.mjs';

/* ------------------------------------------------------- the old spellings, pinned --- */

test('legacyOf derives exactly the literals the published plugin and the old clients send', () => {
  assert.equal(W.LEGACY_SUBPROTOCOL, 'golem.v1');
  assert.equal(W.LEGACY_JWT_PREFIX, 'golem.jwt.');
  assert.equal(W.LEGACY_CAPABILITY_SCHEMA, 'golem.studio-ops.v1');
  assert.equal(W.LEGACY_UI_FENCE, 'golem-ui');
  assert.equal(W.LEGACY_BASE_VOLUME_ATTRIBUTE, 'GolemBaseVolume');
  const pairs = {
    token: 'X-Golem-Token',
    pluginVersion: 'X-Golem-Plugin-Version',
    pluginProtocol: 'X-Golem-Plugin-Protocol',
    role: 'X-Golem-Role',
    grantExpiresAt: 'X-Golem-Grant-Expires-At',
    exportSha256: 'X-Golem-Export-SHA256',
    sandbox: 'X-Golem-Sandbox',
    usageInputTokens: 'X-Golem-Usage-Input-Tokens',
    usageOutputTokens: 'X-Golem-Usage-Output-Tokens',
    usageCredits: 'X-Golem-Usage-Credits',
    creditsRemaining: 'X-Golem-Credits-Remaining',
  };
  assert.deepEqual(Object.keys(pairs).sort(), Object.keys(W.WIRE_HEADERS).sort(), 'every header has an old spelling pinned here');
  for (const [key, old] of Object.entries(pairs)) assert.equal(W.legacyOf(W.WIRE_HEADERS[key]), old, key);
});

test('the new spellings are what the clients will send after the rename', () => {
  assert.equal(W.WS_SUBPROTOCOL, 'apple.v1');
  assert.equal(W.WS_JWT_PREFIX, 'apple.jwt.');
  assert.equal(W.CAPABILITY_SCHEMA, 'apple.studio-ops.v1');
  assert.equal(W.UI_FENCE, 'apple-ui');
  assert.equal(W.BASE_VOLUME_ATTRIBUTE, 'AppleBaseVolume');
  assert.equal(W.WIRE_HEADERS.token, 'X-Apple-Token');
});

/* ------------------------------------------------------------------ headers --- */

test('readWire: the new header, the old header, both (new wins), neither', () => {
  W.resetLegacyWireCounts();
  assert.equal(W.readWire(new Headers({ 'X-Apple-Token': 'n' }), W.WIRE_HEADERS.token), 'n');
  assert.deepEqual(W.legacyWireCounts(), {}, 'reading the new spelling is not a legacy use');
  assert.equal(W.readWire(new Headers({ 'X-Golem-Token': 'o' }), W.WIRE_HEADERS.token), 'o');
  assert.equal(Object.values(W.legacyWireCounts()).reduce((a, b) => a + b, 0), 1, 'the old spelling is counted');
  assert.equal(W.readWire(new Headers({ 'X-Golem-Token': 'o', 'x-apple-token': 'n' }), W.WIRE_HEADERS.token), 'n', 'the new one wins');
  assert.equal(W.readWire(new Headers(), W.WIRE_HEADERS.token), null);
});

test('setWire writes both spellings; stripWire removes both', () => {
  const h = new Headers();
  W.setWire(h, W.WIRE_HEADERS.role, 'editor');
  assert.equal(h.get('X-Apple-Role'), 'editor');
  assert.equal(h.get('X-Golem-Role'), 'editor');
  W.stripWire(h, W.WIRE_HEADERS.role);
  assert.equal(h.get('X-Apple-Role'), null);
  assert.equal(h.get('X-Golem-Role'), null);
});

test('the plugin self-report is read from either spelling', () => {
  assert.deepEqual(readPluginHeaders(new Headers({ 'X-Apple-Plugin-Version': '1.1.0', 'X-Apple-Plugin-Protocol': '1' })), { version: '1.1.0', protocol: 1 });
  assert.deepEqual(readPluginHeaders(new Headers({ 'X-Golem-Plugin-Version': '1.0.0', 'X-Golem-Plugin-Protocol': '1' })), { version: '1.0.0', protocol: 1 });
  assert.deepEqual(readPluginHeaders(new Headers()), { version: null, protocol: null }, 'silence is still unknown, not a refusal');
});

test('public usage headers carry every figure under BOTH names, with equal values', () => {
  const h = usageHeaders({ inputTokens: 12, outputTokens: 34, creditsSpent: 5, creditsRemaining: 90 });
  for (const [a, b] of [
    ['X-Apple-Usage-Input-Tokens', 'X-Golem-Usage-Input-Tokens'],
    ['X-Apple-Usage-Output-Tokens', 'X-Golem-Usage-Output-Tokens'],
    ['X-Apple-Usage-Credits', 'X-Golem-Usage-Credits'],
    ['X-Apple-Credits-Remaining', 'X-Golem-Credits-Remaining'],
  ]) {
    assert.ok(a in h && b in h, `${a} and ${b}`);
    assert.equal(h[a], h[b]);
  }
  assert.equal(h['X-Apple-Usage-Input-Tokens'], '12');
  assert.equal(Object.keys(usageHeaders({ inputTokens: 1, outputTokens: 1, creditsSpent: 1, creditsRemaining: null })).length, 6, 'no remaining figure is invented');
});

/* -------------------------------------------------------------- subprotocols --- */

test('the WebSocket echoes the version protocol the CLIENT listed (a browser aborts on any other)', () => {
  assert.equal(W.echoSubprotocol('apple.v1, apple.jwt.tok'), 'apple.v1');
  assert.equal(W.echoSubprotocol('golem.v1, golem.jwt.tok'), 'golem.v1');
  assert.equal(W.echoSubprotocol('golem.jwt.tok, golem.v1'), 'golem.v1', 'wherever it sits in the list');
  assert.equal(W.echoSubprotocol('apple.v1, golem.v1'), 'apple.v1', 'first listed wins');
  assert.equal(W.echoSubprotocol('golem.v1, apple.v1'), 'golem.v1');
  assert.equal(W.echoSubprotocol(null), 'golem.v1', 'a client that listed neither is answered exactly as before the rename');
  assert.equal(W.echoSubprotocol('chat'), 'golem.v1');
});

test('the bearer token rides either subprotocol prefix; a header still beats a subprotocol', async () => {
  const { bearerToken } = await import('../src/auth.ts');
  const proto = (v) => new Request('https://x/', { headers: { 'Sec-WebSocket-Protocol': v } });
  assert.equal(bearerToken(proto('apple.v1, apple.jwt.abc.def.ghi')), 'abc.def.ghi');
  assert.equal(bearerToken(proto('golem.v1, golem.jwt.abc.def.ghi')), 'abc.def.ghi');
  assert.equal(bearerToken(proto('apple.jwt.new, golem.jwt.old')), 'new', 'listed order decides, deterministically');
  assert.equal(bearerToken(proto('apple.v1, chat')), null);
  assert.equal(bearerToken(new Request('https://x/', { headers: { Authorization: 'Bearer h', 'Sec-WebSocket-Protocol': 'apple.jwt.p' } })), 'h');
});

test('the Durable Object answers the upgrade with the echoed protocol, derived from the request — never a fixed value', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'do', 'session.ts'), 'utf8');
  // The 101 response cannot be constructed under Node (status 101 is refused by Response), so the property is
  // asserted on the source: the header value comes from echoSubprotocol(<the request's own header>).
  assert.match(src, /'Sec-WebSocket-Protocol': echoSubprotocol\(req\.headers\.get\('Sec-WebSocket-Protocol'\)\)/);
  assert.doesNotMatch(src, /'Sec-WebSocket-Protocol': '[^']+'/, 'a literal echo would abort whichever clients do not list it');
});

/* ---------------------------------------------------------- capability schema --- */

const OPS = [{ op: 'get_tree', status: 'supported' }, { op: 'run_code', status: 'unsupported', reason: 'not available' }];

test('the capability report is accepted under either schema and normalised to the new one', () => {
  for (const schema of ['golem.studio-ops.v1', 'apple.studio-ops.v1']) {
    const parsed = parsePluginCapabilities({ schema, operations: OPS });
    assert.ok(parsed, schema);
    assert.equal(parsed.schema, PLUGIN_CAPABILITY_SCHEMA);
    assert.equal(normalisePluginCapabilities({ schema, operations: OPS }).schema, 'apple.studio-ops.v1');
  }
  assert.equal(PLUGIN_CAPABILITY_SCHEMA, 'apple.studio-ops.v1');
});

test('an unknown schema is still compatibility mode, not a crash and not an accept', () => {
  assert.equal(parsePluginCapabilities({ schema: 'golem.studio-ops.v2', operations: OPS }), null);
  assert.equal(parsePluginCapabilities({ schema: 'apple.studio-ops.v2', operations: OPS }), null);
  assert.equal(parsePluginCapabilities({ operations: OPS }), null);
});

test('STORAGE FALLBACK: a report stored under the old schema reads back normalised, and its key does not depend on the schema', () => {
  // The Durable Object key is `pluginCapabilities:<token hash>`: it hashes the TOKEN, not the schema string, so a
  // stored row is found after the rename and only its VALUE carries the old spelling.
  const stored = { schema: 'golem.studio-ops.v1', operations: OPS };
  const back = normalisePluginCapabilities(stored);
  assert.equal(back.schema, 'apple.studio-ops.v1');
  assert.deepEqual(back.operations.map((o) => o.op), ['get_tree', 'run_code']);
});

test('a real SessionDO accepts a poll in either spelling and persists the NEW schema', async () => {
  const state = { kind: 'state', placeName: 'P', placeId: 1, gameId: 2, isRunMode: false, selectionCount: 0, pluginVersion: '1.0.0' };
  for (const [tokenHeader, versionHeader, protocolHeader, schema] of [
    ['X-Golem-Token', 'X-Golem-Plugin-Version', 'X-Golem-Plugin-Protocol', 'golem.studio-ops.v1'],
    ['X-Apple-Token', 'X-Apple-Plugin-Version', 'X-Apple-Plugin-Protocol', 'apple.studio-ops.v1'],
  ]) {
    const h = sessionHarness();
    await new Promise((r) => setTimeout(r, 0));
    const token = 'pairing-secret';
    const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const reg = await h.session.fetch(new Request('https://do/plugin/register', { method: 'POST', body: JSON.stringify({ tokenHash, pluginVersion: '1.0.0', pluginProtocol: '1', place: { placeName: 'P', placeId: 1, gameId: 2 } }) }));
    assert.equal(reg.status, 200);
    const res = await h.session.fetch(new Request('https://do/plugin/poll', {
      method: 'POST',
      headers: { [tokenHeader]: token, [versionHeader]: '1.0.0', [protocolHeader]: '1' },
      body: JSON.stringify({ state, capabilities: { schema, operations: OPS } }),
    }));
    assert.equal(res.status, 200, `${tokenHeader}: ${await res.text()}`);
    assert.equal(h.store.get(`pluginCapabilities:${tokenHash}`).schema, 'apple.studio-ops.v1', `${schema} is stored normalised`);
  }
});

test('a real SessionDO refuses a poll with NO token header in either spelling', async () => {
  const h = sessionHarness();
  await new Promise((r) => setTimeout(r, 0));
  const res = await h.session.fetch(new Request('https://do/plugin/poll', { method: 'POST', body: '{}' }));
  assert.notEqual(res.status, 200);
});

/* ------------------------------------------------- the role a socket may claim --- */

test('socketRole reads the role from either spelling, through the same allowlist; a made-up role is refused in both', () => {
  const { session } = sessionHarness();
  const bind = { ownerId: 'u-owner' };
  const ask = (headers) => session.socketRole(new Request('https://do/ws', { headers: { 'X-User-Id': 'u-member', ...headers } }), bind);
  assert.deepEqual(ask({ 'X-Apple-Role': 'editor' }), { userId: 'u-member', role: 'editor' });
  assert.deepEqual(ask({ 'X-Golem-Role': 'editor' }), { userId: 'u-member', role: 'editor' });
  assert.equal(ask({ 'X-Apple-Role': 'superuser' }), null);
  assert.equal(ask({ 'X-Golem-Role': 'superuser' }), null);
  assert.equal(ask({}), null, 'no role is no socket');
  assert.deepEqual(session.socketRole(new Request('https://do/ws', { headers: { 'X-User-Id': 'u-owner' } }), bind), { userId: 'u-owner', role: 'owner' }, 'the owner comes from the binding, not the wire');
});

/* ------------------------------------------- the worker's routes, end to end --- */

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-legacy-wire-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const PROJECT = '9f1c1f2a-0000-4000-8000-000000000001';
const TOKEN = `${PROJECT}.${'a'.repeat(48)}`;
function worker() {
  const seen = [];
  const sessionDo = { idFromName: () => 'id', get: () => ({ fetch: async (url, init) => { seen.push({ url: String(url), headers: new Headers(init?.headers) }); return Response.json({ ok: true }); } }) };
  const other = { idFromName: () => 'id', get: () => ({ fetch: async () => Response.json({ ok: false }) }) };
  const env = { ADMIN_KEY: 'k', SESSION_DO: sessionDo, PAIRING_DO: other, ADMIN_DO: other, BUDGET_DO: other, QUOTA_DO: other };
  return { seen, env };
}
const CTX = { waitUntil() {}, passThroughOnException() {} };
const poll = (env, headers, ip = '10.0.0.1') => app.fetch(new Request('https://w/api/studio/poll', { method: 'POST', headers: { 'CF-Connecting-IP': ip, ...headers }, body: '{}' }), env, CTX);

test('POST /api/studio/poll: the old headers still pair, the new headers pair, and both reach the Durable Object in both spellings', async () => {
  for (const [label, headers] of [
    ['old', { 'X-Golem-Token': TOKEN, 'X-Golem-Plugin-Version': '1.0.0', 'X-Golem-Plugin-Protocol': '1' }],
    ['new', { 'X-Apple-Token': TOKEN, 'X-Apple-Plugin-Version': '1.1.0', 'X-Apple-Plugin-Protocol': '1' }],
  ]) {
    const { seen, env } = worker();
    const res = await poll(env, headers, label === 'old' ? '10.0.0.2' : '10.0.0.3');
    assert.equal(res.status, 200, label);
    assert.equal(seen.length, 1, label);
    const h = seen[0].headers;
    // both spellings on the hop: a DO instance still running the previous bundle reads only the old one
    assert.equal(h.get('X-Apple-Token'), TOKEN, label);
    assert.equal(h.get('X-Golem-Token'), TOKEN, label);
    assert.ok(h.get('X-Apple-Plugin-Version') && h.get('X-Golem-Plugin-Version'), label);
    assert.equal(h.get('X-Apple-Plugin-Protocol'), '1', label);
    assert.equal(h.get('X-Golem-Plugin-Protocol'), '1', label);
  }
});

test('POST /api/studio/poll: a bad or missing token is refused in either spelling, before any Durable Object is touched', async () => {
  for (const headers of [{}, { 'X-Apple-Token': 'nodot' }, { 'X-Golem-Token': 'nodot' }, { 'X-Apple-Token': `${PROJECT}.short` }]) {
    const { seen, env } = worker();
    const res = await poll(env, headers, '10.0.0.4');
    assert.equal(res.status, 401, JSON.stringify(headers));
    assert.equal(seen.length, 0);
  }
});

test('GET /api/health says this build accepts both spellings — the gate scripts/rename-golem.mjs --phase B2 reads', async () => {
  const { env } = worker();
  const res = await app.fetch(new Request('https://w/api/health', { headers: { 'CF-Connecting-IP': '10.0.0.5' } }), env, CTX);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.compat, 'wire-both');
  assert.equal(typeof body.legacyWire, 'object', 'the counters that phase D waits on are reported');
});

test('the legacy counters move when an old client is served, and not when a new one is', async () => {
  // The bundle has its own copy of the shared module, so the counters are read where an operator reads them: /api/health.
  const total = async () => {
    const res = await app.fetch(new Request('https://w/api/health', { headers: { 'CF-Connecting-IP': '10.0.0.20' } }), worker().env, CTX);
    return Object.values((await res.json()).legacyWire).reduce((a, b) => a + b, 0);
  };
  const { env } = worker();
  const before = await total();
  await poll(env, { 'X-Apple-Token': TOKEN, 'X-Apple-Plugin-Version': '1.1.0', 'X-Apple-Plugin-Protocol': '1' }, '10.0.0.6');
  assert.equal(await total(), before, 'a client that speaks the new spelling is not a legacy use');
  await poll(env, { 'X-Golem-Token': TOKEN, 'X-Golem-Plugin-Version': '1.0.0', 'X-Golem-Plugin-Protocol': '1' }, '10.0.0.7');
  assert.ok(await total() > before, 'a client that speaks the old spelling is counted');
});

/* ------------------------------------------- the attribute in users' places --- */

test('baseVolumeOf: the new attribute first, then the one built places carry', () => {
  W.resetLegacyWireCounts();
  assert.equal(W.baseVolumeOf({ AppleBaseVolume: 0.5, GolemBaseVolume: 0.9 }), 0.5, 'the new one is the one a later pass wrote');
  assert.equal(W.baseVolumeOf({ GolemBaseVolume: 0.9 }), 0.9);
  assert.equal(W.baseVolumeOf({ AppleBaseVolume: 0.4 }), 0.4);
  assert.equal(W.baseVolumeOf({}), undefined);
  assert.equal(W.baseVolumeOf(null), undefined);
  assert.equal(W.baseVolumeOf({ AppleBaseVolume: 0 }), 0, 'zero is a real recorded volume, not an absent one');
});
