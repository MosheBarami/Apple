/**
 * THE STUDIO LOBBY: Connect without a pairing code (do/pairing.ts lobby, index.ts announce/release/connect).
 *
 * The plugin announces itself (install id + secret, the Roblox user signed into Studio, the open place); the project owner
 * presses Connect; the worker binds the waiting Studio whose Roblox account is linked to that owner, or, failing that, the one
 * on the same public address — and the plugin collects an ordinary plugin token on its next announce.
 *
 * These run the REAL index.ts and the REAL PairingDO (bundled), with only the session object and the edge faked, so the
 * matching rule, the secret check, the expiry and the token hand-off are observed end to end rather than asserted on text.
 *
 * Run with:  node --test tests/studio-lobby.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const jose = createRequire(join(WORKER, 'package.json'))('jose');
const TMP = mkdtempSync(join(tmpdir(), 'studpilot-lobby-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`], { stdio: 'pipe', cwd: WORKER });
const MOD = await import(`file://${OUT}`);
const APP = MOD.default;

const SUPABASE_URL = 'https://supa.lobby.test';
const ALICE = '77777777-7777-4777-8777-777777777777';
const BOB = '88888888-8888-4888-8888-888888888888';
const PROJECT = '11111111-2222-4333-8444-555555555555';
const PROJECT_B = '22222222-3333-4444-8555-666666666666';
const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'lobby', alg: 'ES256', use: 'sig' };
const jwtFor = (sub) => new jose.SignJWT({ email: `${sub}@t.test`, role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'lobby' }).setIssuer(`${SUPABASE_URL}/auth/v1`).setAudience('authenticated')
  .setSubject(sub).setIssuedAt().setExpirationTime('1h').sign(privateKey);
const JWT = { [ALICE]: await jwtFor(ALICE), [BOB]: await jwtFor(BOB) };

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.includes('/rest/v1/projects')) {
    // Alice owns PROJECT and PROJECT_B; Bob owns nothing here except what a test says.
    const owner = /owner_id=eq\.([0-9a-f-]+)/.exec(url)?.[1];
    const id = /id=eq\.([0-9a-f-]+)/.exec(url)?.[1];
    return json(owner === ALICE || owner === bobOwns ? [{ id, name: id === PROJECT ? 'Tower Defence' : 'Obby', owner_id: owner }] : []);
  }
  if (url.includes('/rest/v1/profiles')) return json([{ id: ALICE, plan: 'free', is_admin: false }]);
  return json([]);
};

let bobOwns = null;
let sessionCalls = [];
/** roblox_identities rows: { roblox_sub, user_id }. */
let identities = [];

function memoryStorage() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
    async list({ prefix } = {}) { return new Map([...m].filter(([k]) => !prefix || k.startsWith(prefix))); },
    async setAlarm() {},
  };
}

function makeEnv() {
  const pairing = new MOD.PairingDO({ storage: memoryStorage(), blockConcurrencyWhile: (fn) => fn() }, {});
  let clock = 1_000_000;
  pairing.now = () => clock;
  const sessions = {
    idFromName: (n) => ({ toString: () => n }),
    get: (id) => ({
      async fetch(url, init) {
        const path = new URL(typeof url === 'string' ? url : url.url).pathname;
        let body = null;
        try { body = init?.body ? JSON.parse(init.body) : null; } catch { /* not json */ }
        sessionCalls.push({ project: id.toString(), path, body });
        if (path === '/plugin/register') return Response.json({ ok: true, place: body.place });
        return Response.json({ ok: true, revoked: true });
      },
    }),
  };
  const corpus = {
    prepare(sql) {
      return {
        bind: (...args) => ({
          async all() {
            if (sql.includes('where user_id = ?')) return { results: identities.filter((r) => r.user_id === args[0]) };
            if (sql.includes('where roblox_sub in')) return { results: identities.filter((r) => args.includes(r.roblox_sub)) };
            return { results: [] };
          },
          first: async () => null, run: async () => ({}),
        }),
      };
    },
    exec: async () => ({}), batch: async () => [],
  };
  const env = {
    SUPABASE_URL, SUPABASE_ANON_KEY: 'anon', ENVIRONMENT: 'test',
    KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
    CORPUS: corpus,
    SESSION_DO: sessions,
    PAIRING_DO: { idFromName: () => ({}), get: () => ({ fetch: (url, init) => pairing.fetch(new Request(url, init)) }) },
    QUOTA_DO: sessions, ADMIN_DO: sessions, BUDGET_DO: sessions,
  };
  return { env, pairing, advance: (ms) => { clock += ms; } };
}

const hex = (n, seed) => seed.repeat(n).slice(0, n);
const install = (seed, over = {}) => ({
  installId: hex(32, seed), secret: hex(64, seed === 'a' ? 'b' : 'c'), studioSessionId: hex(32, 'd'),
  robloxUserId: 1001, place: { placeId: 555, gameId: 9, placeName: 'Tower Defence' }, wait: false, ...over,
});

let ipSeq = 0;
async function call(env, path, { body, jwt, ip } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip ?? '203.0.113.7' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await APP.fetch(new Request(`https://studpilot.test${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) }), env);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
const announce = (env, body, ip) => call(env, '/api/studio/announce', { body, ip });
const connect = (env, user, project = PROJECT, body = {}, ip) => call(env, `/api/projects/${project}/connect`, { jwt: JWT[user], body, ip });
const reset = () => { sessionCalls = []; identities = []; bobOwns = null; };

test('CONTROL: an announced Studio on the owner\'s address is bound by one Connect and collects a token', async () => {
  reset();
  const { env } = makeEnv();
  const first = await announce(env, install('a'));
  assert.equal(first.status, 200, first.text);
  assert.equal(first.json.waiting, true, 'nothing is bound before anybody presses Connect');
  const c = await connect(env, ALICE);
  assert.equal(c.json.status, 'connected', c.text);
  assert.equal(c.json.placeName, 'Tower Defence');
  const next = await announce(env, install('a'));
  assert.match(next.json.token, new RegExp(`^${PROJECT}\\.[0-9a-f]{48}$`), 'the plugin collects the ordinary session token');
  assert.equal(next.json.projectName, 'Tower Defence');
  const reg = sessionCalls.find((x) => x.path === '/plugin/register');
  assert.ok(reg && reg.project === PROJECT, 'the token was registered with the project session');
  assert.deepEqual(reg.body.place, { placeId: 555, gameId: 9, placeName: 'Tower Defence' });
});

test('a held announce is answered the moment Connect binds it', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  const held = announce(env, { ...install('a'), wait: true });
  await new Promise((r) => setTimeout(r, 20));
  const c = await connect(env, ALICE);
  assert.equal(c.json.status, 'connected');
  const answered = await Promise.race([held, new Promise((r) => setTimeout(() => r('still held'), 2000))]);
  assert.notEqual(answered, 'still held', 'the hold did not end on bind');
  assert.ok(answered.json.token, answered.text);
});

test('THE SECRET IS THE CREDENTIAL: the same install id with another secret is refused and gets no token', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  await connect(env, ALICE);
  const thief = await announce(env, { ...install('a'), secret: hex(64, 'e') }, '198.51.100.9');
  assert.equal(thief.status, 403);
  assert.equal(thief.json.token, undefined);
  assert.ok(!thief.text.includes(hex(64, 'b')), 'nothing secret is echoed');
});

test('malformed announces are refused before the lobby is touched', async () => {
  reset();
  const { env } = makeEnv();
  for (const bad of [
    { ...install('a'), installId: 'short' },
    { ...install('a'), secret: 'x'.repeat(64) },
    { ...install('a'), studioSessionId: '' },
    { ...install('a'), place: { placeId: -1, gameId: 0, placeName: 'X' } },
    { ...install('a'), place: { placeId: 1, gameId: 0, placeName: '' } },
  ]) assert.equal((await announce(env, bad)).status, 400, JSON.stringify(bad));
});

test('NO MATCH: a Studio on another address with an unlinked Roblox account is not offered', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'), '198.51.100.20');
  const c = await connect(env, ALICE, PROJECT, {}, '203.0.113.7');
  assert.equal(c.json.status, 'waiting');
  assert.ok(!sessionCalls.some((x) => x.path === '/plugin/register'));
});

test('A LINKED ROBLOX ACCOUNT MATCHES ACROSS ADDRESSES, and then outranks the address', async () => {
  reset();
  identities = [{ roblox_sub: '1001', user_id: ALICE }];
  const { env } = makeEnv();
  await announce(env, install('a'), '198.51.100.20'); // Alice's Studio, elsewhere (a laptop on another network)
  await announce(env, install('f', { robloxUserId: 2002, studioSessionId: hex(32, '9') }), '203.0.113.7'); // somebody beside her browser
  const c = await connect(env, ALICE, PROJECT, {}, '203.0.113.7');
  assert.equal(c.json.status, 'connected', c.text);
  assert.ok((await announce(env, install('a'), '198.51.100.20')).json.token, 'the Roblox-matched Studio got the token');
  assert.equal((await announce(env, install('f', { robloxUserId: 2002, studioSessionId: hex(32, '9') }), '203.0.113.7')).json.waiting, true);
});

test('A SHARED ADDRESS NEVER OFFERS A STUDIO WHOSE ROBLOX ACCOUNT BELONGS TO ANOTHER STUDPILOT USER', async () => {
  reset();
  identities = [{ roblox_sub: '1001', user_id: BOB }];
  const { env } = makeEnv();
  await announce(env, install('a'));
  const c = await connect(env, ALICE);
  assert.equal(c.json.status, 'waiting', 'Bob\'s Studio on the same network must not be bound to Alice\'s project');
});

test('a shared address does not offer a Studio already bound to another StudPilot user', async () => {
  reset();
  bobOwns = BOB;
  const { env } = makeEnv();
  await announce(env, install('a', { robloxUserId: 0 }));
  assert.equal((await connect(env, BOB, PROJECT_B)).json.status, 'connected');
  assert.equal((await connect(env, ALICE)).json.status, 'waiting');
});

test('SEVERAL CANDIDATES come back as a choice; the pick binds only one, and a forged pick binds nothing', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  await announce(env, install('f', { studioSessionId: hex(32, '9'), place: { placeId: 777, gameId: 9, placeName: 'Obby' } }));
  const c = await connect(env, ALICE);
  assert.equal(c.json.status, 'choose');
  assert.deepEqual(c.json.candidates.map((x) => x.placeName).sort(), ['Obby', 'Tower Defence']);
  assert.ok(c.json.candidates.every((x) => !('installId' in x) && !('robloxUserId' in x)), 'the web never learns an install id');
  assert.equal((await connect(env, ALICE, PROJECT, { pickId: 'f'.repeat(24) })).json.status, 'choose', 'a guessed pick binds nothing');
  const obby = c.json.candidates.find((x) => x.placeName === 'Obby');
  assert.equal((await connect(env, ALICE, PROJECT, { pickId: obby.pickId })).json.status, 'connected');
  assert.ok((await announce(env, install('f', { studioSessionId: hex(32, '9'), place: { placeId: 777, gameId: 9, placeName: 'Obby' } }))).json.token);
  assert.equal((await announce(env, install('a'))).json.waiting, true);
});

test('EXPIRY: a Studio that stopped announcing leaves the lobby after its TTL', async () => {
  reset();
  const { env, advance } = makeEnv();
  await announce(env, install('a'));
  advance(MOD.LOBBY_TTL_MS ?? 45_000);
  advance(1);
  assert.equal((await connect(env, ALICE)).json.status, 'waiting');
  await announce(env, install('a'));
  assert.equal((await connect(env, ALICE)).json.status, 'connected', 'announcing again brings it back');
});

test('REOPENING THE SAME PLACE RECONNECTS WITHOUT A CLICK; another place does not', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  await connect(env, ALICE);
  const reopened = install('a', { studioSessionId: hex(32, '7') }); // Studio restarted: new session, same install and place
  assert.ok((await announce(env, reopened)).json.token);
  const other = install('a', { studioSessionId: hex(32, '7'), place: { placeId: 999, gameId: 1, placeName: 'Other' } });
  assert.equal((await announce(env, other)).json.waiting, true);
});

test('DISCONNECT FROM THE WEB forgets the binding, so the Studio waits instead of reconnecting', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  await connect(env, ALICE);
  const d = await call(env, `/api/projects/${PROJECT}/studio/disconnect`, { jwt: JWT[ALICE] });
  assert.equal(d.status, 200, d.text);
  assert.ok(sessionCalls.some((x) => x.path === '/studio/revoke' && x.project === PROJECT));
  assert.equal((await announce(env, install('a'))).json.waiting, true);
});

test('DISCONNECT FROM STUDIO (release) forgets the binding and revokes the project token; a wrong secret releases nothing', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  await connect(env, ALICE);
  const forged = await call(env, '/api/studio/release', { body: { ...install('a'), secret: hex(64, 'e') } });
  assert.equal(forged.status, 403);
  assert.ok((await announce(env, install('a'))).json.token, 'still bound after a forged release');
  sessionCalls = [];
  const r = await call(env, '/api/studio/release', { body: install('a') });
  assert.equal(r.status, 200, r.text);
  assert.ok(sessionCalls.some((x) => x.path === '/studio/revoke' && x.project === PROJECT));
  assert.equal((await announce(env, install('a'))).json.waiting, true);
});

test('MOVING A CONNECTED STUDIO TO ANOTHER PROJECT revokes the old project and hands the new token on the heartbeat', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  await connect(env, ALICE, PROJECT);
  await announce(env, install('a'));
  const heartbeat = install('a', { connectedProjectId: PROJECT });
  assert.equal((await announce(env, heartbeat)).json.waiting, true, 'a heartbeat for the bound project is just a heartbeat');
  sessionCalls = [];
  assert.equal((await connect(env, ALICE, PROJECT_B)).json.status, 'connected', 'a connected Studio is still a candidate');
  assert.ok(sessionCalls.some((x) => x.path === '/studio/revoke' && x.project === PROJECT), 'the project it left loses its token');
  const moved = await announce(env, heartbeat);
  assert.ok(moved.json.token?.startsWith(`${PROJECT_B}.`), moved.text);
});

test('connect is owner-only', async () => {
  reset();
  const { env } = makeEnv();
  await announce(env, install('a'));
  assert.equal((await connect(env, BOB)).status, 404);
  assert.equal((await call(env, `/api/projects/${PROJECT}/connect`, {})).status, 401);
});
