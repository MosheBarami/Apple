/**
 * THE CREATOR DASHBOARD ROUTES, ASKED OVER HTTP.
 *
 * creator-dashboard.test.mjs proves the MODULE refuses to write without the customer's own key.
 * It cannot prove that a route calls the module — a refusal nothing consults is the most expensive
 * kind of dead code, because it reads like protection in every review it survives. This repository
 * has shipped that exact thing: billing.ts's comment claimed one subscription per account, the page
 * enforced it in the browser, and `POST /api/billing/checkout` never looked, so a direct call
 * minted a second subscription.
 *
 * So this bundles the real index.ts, signs real tokens, and sends real requests, with a global
 * `fetch` that stands in for Roblox AND RECORDS EVERY CALL. Four properties, each driven by the
 * mistake that would otherwise be invisible from the module's own tests:
 *
 *   1. A WRITE WITH NO CONNECTED KEY LEAVES NOTHING FOR ROBLOX. The module returns a refusal; this
 *      asserts the route returns it too and that not one request went out — with a shared, fully
 *      authorised platform key sitting in the env the whole time. 299 assets were created in a real
 *      person's account by a path with exactly this hole.
 *
 *   2. NO ROUTE CAN RETURN THE KEY. The requirement is that the server should not be able to hand a
 *      stored key back at all — not masked, not partially. Every creator route is called with a key
 *      connected and every response body is swept for it.
 *
 *   3. ONE CUSTOMER'S KEY IS NOT ANOTHER'S. Several customers share this database, as they share a
 *      D1 in production, and the user id comes off the verified token rather than the request.
 *
 *   4. WHAT ROBLOX CANNOT DO ANSWERS WITH THE REASON. Listing experiences, promo codes and
 *      downloading a file are 501 carrying evidence, not 404s somebody has to interpret.
 *
 * ONE DATABASE FOR THE WHOLE FILE, ON PURPOSE. `schema-once.ts` remembers per ISOLATE that it has
 * run the DDL, so a fresh database per test would be handed to a worker that believes it already
 * built the tables — the tests would fail on a memo, which is not the thing under test. One
 * database and one customer per test is also what production looks like.
 *
 * Run with:  node --test tests/creator-routes-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { d1 } from './stubs/d1.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');

const TMP = mkdtempSync(join(tmpdir(), 'golem-creator-routes-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
   `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`], { stdio: 'pipe', cwd: WORKER });
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.creator.test';
const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'creator-test', alg: 'ES256', use: 'sig' };

/** A signed token for one customer. Each test uses its own, because they share one database. */
const tokenFor = (userId) => new jose.SignJWT({ email: `${userId}@golem.test`, role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'creator-test' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(userId)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

const U = {
  noKey: '70000000-0000-4000-8000-000000000000',
  read: '71111111-1111-4111-8111-111111111111',
  scope: '72222222-2222-4222-8222-222222222222',
  upload: '73333333-3333-4333-8333-333333333333',
  noFile: '74444444-4444-4444-8444-444444444444',
  secret: '75555555-5555-4555-8555-555555555555',
  unsupported: '76666666-6666-4666-8666-666666666666',
  neighbour: '77777777-7777-4777-8777-777777777777',
};

const KEY32 = Buffer.alloc(32, 9).toString('base64');
const CUSTOMER_KEY = 'CustomerOpenCloudKey0123456789ABCDEFGHIJK';
const NEIGHBOUR_KEY = 'NeighbourOpenCloudKeyZYXWVUTSRQPONMLKJIHG';
const CUSTOMER_ACCOUNT = '555000111';
const NEIGHBOUR_ACCOUNT = '999000222';

/** Every request that left for Roblox. The assertion in most of these tests is its LENGTH. */
let robloxCalls = [];
/** What the stand-in Roblox answers next: [status, body]. */
let robloxReply = [200, {}];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.includes('/rest/v1/profiles')) {
    // Echo whichever id was asked for, so every customer below has a profile rather than one of
    // them borrowing another's.
    const id = /id=eq\.([0-9a-f-]+)/.exec(url)?.[1] ?? U.noKey;
    return json([{ id, plan: 'free', is_admin: false, display_name: 'creator' }]);
  }
  if (url.startsWith('https://apis.roblox.com/')) {
    robloxCalls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body });
    return json(robloxReply[1], robloxReply[0]);
  }
  return json([]);
};

const DB = d1();
const doStub = () => ({
  idFromName: (n) => ({ toString: () => n }),
  idFromString: (n) => ({ toString: () => n }),
  get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) }),
});

/**
 * The worker env, with a REAL sqlite-backed D1 and a REAL shared platform credential.
 *
 * The shared key is here deliberately and it is the whole point of the first test: it is present,
 * fully authorised, and nothing under `/api/me/roblox/` may reach it.
 */
const env = () => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  CREDENTIAL_KEY: KEY32,
  CORPUS: DB.CORPUS,
  ROBLOX_API_KEY: 'shared-platform-key',
  ROBLOX_CREATOR_USER_ID: '11279664020',
  ROBLOX_UPLOAD_AUTHORISED_FOR: '11279664020',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
  SESSION_DO: doStub(), QUOTA_DO: doStub(), PAIRING_DO: doStub(), ADMIN_DO: doStub(), BUDGET_DO: doStub(),
});

async function call(path, { method = 'GET', jwt, body, form } = {}) {
  const headers = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, { method, headers, ...(payload !== undefined ? { body: payload } : {}) }),
    env(),
  );
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

/** Connect one customer's key through the real PUT route, and hand back their token. */
async function connect(userId, scopes, apiKey = CUSTOMER_KEY, account = CUSTOMER_ACCOUNT) {
  const jwt = await tokenFor(userId);
  const put = await call('/api/me/roblox-key', {
    method: 'PUT', jwt,
    body: { apiKey, robloxCreatorId: account, creatorType: 'user', scopes },
  });
  assert.equal(put.status, 200, put.text);
  robloxCalls = [];
  return jwt;
}

const UNIVERSE_200 = {
  path: 'universes/6543210', displayName: 'Tower of Hecc', description: 'A climbing game.',
  user: `users/${CUSTOMER_ACCOUNT}`, visibility: 'PUBLIC',
  createTime: '2026-01-04T10:00:00Z', updateTime: '2026-09-01T12:00:00Z',
};
const UPLOAD_DONE_200 = {
  path: 'operations/op-77', done: true,
  response: { path: 'assets/981234999', assetId: '981234999', assetType: 'Image', displayName: 'Brick wall' },
};

function filePart(type = 'image/png') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type }), 'wall.png');
  form.append('displayName', 'Brick wall');
  return form;
}

/* ============================================================= 1. THE NEGATIVE ONE === */

test('A WRITE WITH NO CONNECTED KEY LEAVES NOTHING FOR ROBLOX, at the route', async () => {
  const jwt = await tokenFor(U.noKey);
  robloxCalls = [];
  robloxReply = [200, UPLOAD_DONE_200];

  const upload = await call('/api/me/roblox/assets', { method: 'POST', jwt, form: filePart() });
  assert.equal(upload.status, 400, upload.text);
  assert.match(upload.json.error, /no Roblox key is connected/);

  const pass = await call('/api/me/roblox/experiences/6543210/gamepasses', {
    method: 'POST', jwt, body: { name: 'Starter Pack' },
  });
  assert.equal(pass.status, 400, pass.text);

  const grant = await call('/api/me/roblox/asset-permissions', {
    method: 'POST', jwt, body: { subjectType: 'Universe', subjectId: '6543210', action: 'Use', assetIds: [1] },
  });
  assert.equal(grant.status, 400, grant.text);

  // THE ASSERTION. A shared, fully authorised platform key was in the env of all three calls.
  assert.deepEqual(robloxCalls, [], 'no connected key must mean no request');
  const everything = upload.text + pass.text + grant.text;
  assert.equal(everything.includes('shared-platform-key'), false, 'and no response may carry it');
  assert.equal(everything.includes('11279664020'), false, 'nor name the platform account');
});

test('A REFUSAL THAT NEVER LEFT THE WORKER DOES NOT CLAIM AN UNLOGGED WRITE', async () => {
  // `audited: false` means "this happened on Roblox and the record of it did not land" — the most
  // alarming sentence the product can say, because the thing cannot be un-created. A refusal that
  // never sent a request has nothing to log, so saying `audited: false` about it would be that
  // alarm going off for an event that did not occur. Absence of the field is the honest answer.
  const jwt = await tokenFor(U.noKey);
  robloxCalls = [];
  const r = await call('/api/me/roblox/assets', { method: 'POST', jwt, form: filePart() });
  assert.equal(r.status, 400);
  assert.deepEqual(robloxCalls, [], 'nothing was sent, so there is nothing to have logged');
  assert.equal('audited' in r.json, false, `a local refusal said audited: ${r.json.audited}`);

  const pass = await call('/api/me/roblox/experiences/6543210/gamepasses', {
    method: 'POST', jwt, body: { name: 'Starter Pack' },
  });
  assert.equal('audited' in pass.json, false);

  const grant = await call('/api/me/roblox/asset-permissions', {
    method: 'POST', jwt, body: { subjectType: 'Universe', subjectId: '1', action: 'Use', assetIds: [1] },
  });
  assert.equal('audited' in grant.json, false);
});

test('a write ROBLOX refused still reports whether the record landed', async () => {
  // The other side of the same coin: this one did reach Roblox, so whether it was recorded is a
  // real question with a real answer, and the answer is part of the response.
  const jwt = await connect('78888888-8888-4888-8888-888888888888', ['game-pass:write']);
  robloxReply = [403, { errorCode: 'Forbidden', errorMessage: 'no access to this universe' }];
  const r = await call('/api/me/roblox/experiences/6543210/gamepasses', {
    method: 'POST', jwt, body: { name: 'Starter Pack' },
  });
  assert.equal(r.status, 403, r.text);
  assert.match(r.json.error, /no access to this universe/);
  assert.equal(r.json.audited, true, 'the attempt on their account was written down');
  assert.equal(robloxCalls.length, 1);
});

test('every creator route is closed to a caller with no token', async () => {
  robloxCalls = [];
  const paths = [
    ['GET', '/api/me/roblox/experiences/6543210'],
    ['GET', '/api/me/roblox/assets'],
    ['GET', '/api/me/roblox/assets/981234567'],
    ['POST', '/api/me/roblox/assets'],
    ['GET', '/api/me/roblox/uploads/op-77'],
    ['GET', '/api/me/roblox/experiences/6543210/gamepasses'],
    ['POST', '/api/me/roblox/experiences/6543210/gamepasses'],
    ['POST', '/api/me/roblox/asset-permissions'],
    ['GET', '/api/me/roblox/writes'],
  ];
  for (const [method, path] of paths) {
    const r = await call(path, { method, ...(method === 'POST' ? { body: {} } : {}) });
    assert.equal(r.status, 401, `${method} ${path} answered ${r.status}`);
  }
  assert.deepEqual(robloxCalls, [], 'an unauthenticated caller must not reach Roblox either');
});

/* ============================================================= 2. THE READS, LIVE === */

test('a read route spends the CUSTOMER\'S key against the documented path', async () => {
  const jwt = await connect(U.read, ['universe:read']);
  robloxReply = [200, UNIVERSE_200];
  const r = await call('/api/me/roblox/experiences/6543210', { jwt });

  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.experience.displayName, 'Tower of Hecc');
  assert.equal(robloxCalls.length, 1);
  assert.equal(robloxCalls[0].url, 'https://apis.roblox.com/cloud/v2/universes/6543210');
  assert.equal(robloxCalls[0].headers['x-api-key'], CUSTOMER_KEY);
});

test('a scope the person did not tick is refused at the route, before Roblox', async () => {
  const jwt = await connect(U.scope, ['universe:read']);
  robloxReply = [200, {}];
  const r = await call('/api/me/roblox/assets', { jwt });
  assert.equal(r.status, 400, r.text);
  assert.match(r.json.error, /user\.inventory-item:read/);
  assert.deepEqual(robloxCalls, []);
});

/* ============================================================= 3. THE UPLOAD, LIVE === */

test('the upload route takes a file, uses the customer\'s account, and leaves a trail', async () => {
  const jwt = await connect(U.upload, ['asset:write']);
  robloxReply = [200, UPLOAD_DONE_200];
  const r = await call('/api/me/roblox/assets', { method: 'POST', jwt, form: filePart() });

  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.upload.assetId, 981234999);
  assert.equal(r.json.audited, true);
  assert.equal(robloxCalls.length, 1);
  assert.equal(robloxCalls[0].url, 'https://apis.roblox.com/assets/v1/assets');
  assert.equal(robloxCalls[0].headers['x-api-key'], CUSTOMER_KEY);

  // The trail, read back through its own route by the person it is about.
  const trail = await call('/api/me/roblox/writes', { jwt });
  assert.equal(trail.status, 200, trail.text);
  const row = trail.json.writes[0];
  assert.equal(row.action, 'upload_asset');
  assert.equal(row.robloxCreatorId, CUSTOMER_ACCOUNT, 'to which account');
  assert.equal(row.ok, true);
  assert.equal(row.target, 'assets/981234999');
  assert.equal(trail.text.includes(CUSTOMER_KEY), false, 'and the trail never carries the key');
});

test('ONE CUSTOMER\'S TRAIL IS NOT ANOTHER\'S, in a database they share', async () => {
  // The neighbour uploads with their own key into their own account. The customer above must see
  // nothing of it, and must not have been the one who paid for it.
  const jwt = await connect(U.neighbour, ['asset:write'], NEIGHBOUR_KEY, NEIGHBOUR_ACCOUNT);
  robloxReply = [200, UPLOAD_DONE_200];
  await call('/api/me/roblox/assets', { method: 'POST', jwt, form: filePart() });
  assert.equal(robloxCalls[0].headers['x-api-key'], NEIGHBOUR_KEY, 'their key, not the other one');

  const theirs = await call('/api/me/roblox/writes', { jwt });
  assert.equal(theirs.json.writes.length, 1);
  assert.equal(theirs.json.writes[0].robloxCreatorId, NEIGHBOUR_ACCOUNT);

  const uploaderJwt = await tokenFor(U.upload);
  const mine = await call('/api/me/roblox/writes', { jwt: uploaderJwt });
  assert.equal(mine.json.writes.every((w) => w.robloxCreatorId === CUSTOMER_ACCOUNT), true);
  assert.equal(mine.text.includes(NEIGHBOUR_ACCOUNT), false, 'no row from the neighbour');
  assert.equal(mine.text.includes(NEIGHBOUR_KEY), false);
});

test('a request with no file attached is refused before anything else happens', async () => {
  const jwt = await connect(U.noFile, ['asset:write']);
  robloxReply = [200, UPLOAD_DONE_200];
  const form = new FormData();
  form.append('displayName', 'Brick wall');
  const r = await call('/api/me/roblox/assets', { method: 'POST', jwt, form });
  assert.equal(r.status, 400, r.text);
  assert.deepEqual(robloxCalls, []);
});

/* ================================================= 4. THE KEY CANNOT COME BACK OUT === */

test('NO ROUTE IN THE PRODUCT CAN RETURN THE STORED KEY', async () => {
  // The requirement in the owner's words: it must never be echoed back to the browser after it is
  // stored, not even masked from the server side — the server should not be able to return it at
  // all. `describeRobloxCredential` returns a fingerprint and the last four characters, and those
  // four are all anybody gets.
  const jwt = await connect(U.secret, ['universe:read', 'asset:read', 'asset:write', 'game-pass:read', 'user.inventory-item:read']);
  robloxReply = [200, UNIVERSE_200];

  const responses = [
    await call('/api/me/roblox-key', { jwt }),
    await call('/api/me/roblox/experiences/6543210', { jwt }),
    await call('/api/me/roblox/assets', { jwt }),
    await call('/api/me/roblox/assets/981234567', { jwt }),
    await call('/api/me/roblox/experiences/6543210/gamepasses', { jwt }),
    await call('/api/me/roblox/uploads/op-77', { jwt }),
    await call('/api/me/roblox/writes', { jwt }),
    await call('/api/me/roblox/assets', { method: 'POST', jwt, form: filePart() }),
  ];
  for (const r of responses) {
    assert.equal(r.text.includes(CUSTOMER_KEY), false, `a response carried the key: ${r.text.slice(0, 200)}`);
    // Not a prefix of it either. A "helpfully" truncated secret is still most of a secret.
    assert.equal(r.text.includes(CUSTOMER_KEY.slice(0, 16)), false, `a response carried part of the key: ${r.text.slice(0, 200)}`);
  }
  // The description is still useful: four characters, which is what a person recognises.
  const described = await call('/api/me/roblox-key', { jwt });
  assert.equal(described.json.credential.hint, CUSTOMER_KEY.slice(-4));
  assert.equal(described.json.credential.robloxCreatorId, CUSTOMER_ACCOUNT);
});

/* ============================================= 5. WHAT ROBLOX CANNOT DO, WITH REASONS === */

test('the three things Open Cloud cannot do answer 501 with the evidence, not 404', async () => {
  const jwt = await connect(U.unsupported, ['asset:read']);
  robloxCalls = [];

  const listing = await call('/api/me/roblox/experiences', { jwt });
  assert.equal(listing.status, 501, listing.text);
  assert.match(listing.json.error, /cookie/i);
  assert.equal(listing.json.unsupportedByRoblox, true);

  const codes = await call('/api/me/roblox/promo-codes', { jwt });
  assert.equal(codes.status, 501, codes.text);
  assert.match(codes.json.error, /404|no .*endpoint/i);

  const file = await call('/api/me/roblox/assets/981234567/file', { jwt });
  assert.equal(file.status, 501, file.text);
  assert.match(file.json.error, /749|cookie/i);

  assert.deepEqual(robloxCalls, [], 'a refusal with a reason does not need to ask Roblox');
});
