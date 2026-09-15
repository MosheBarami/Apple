// THE CREATOR DASHBOARD, AND THE ONE ASSERTION THE WHOLE FILE EXISTS FOR.
//
// 299 assets were created in one person's Roblox account because the only write credential in the
// product was a single shared one. Roblox refused to take them back — an Image is "not an
// archivable asset type" — so that account keeps them permanently. The rule that came out of it is
// that configuration is not consent, and every write to a customer's account must be traceable to
// that customer having asked for that specific thing.
//
// `asset-import-account.test.mjs` makes that assertion for the IMPORT path, which has a legitimate
// no-customer branch: Apple's own library work writes to Apple's own account. The Creator Dashboard
// has NO such branch. Every call here acts on a customer's own Roblox account by definition, so a
// missing customer key is not a case to fall back from — it is the end of the request.
//
// The fixtures are recorded from Roblox's own published OpenAPI documents
// (github.com/Roblox/creator-docs, content/en-us/reference/cloud/*), so the request shapes the
// tests assert are the shapes Roblox documents rather than the shapes I guessed. The game pass
// create body is multipart/form-data with a required `name` field and NOT JSON — which is exactly
// the kind of thing a guess gets wrong and a fixture catches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => {
  const out = join(mkdtempSync(join(tmpdir(), 'creatordash-')), `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', `${name}.ts`), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const D = await import(`file://${src('creator-dashboard')}`);
const C = await import(`file://${src('user-credentials')}`);

/* --------------------------------------------------------------------- fixtures --- */

/**
 * A D1 stand-in that serves both the credential table and the write log.
 *
 * It keeps the audit rows because the audit is not decoration here: a write to somebody's real
 * Roblox account that left no trace of who asked for it is the incident, restated.
 */
function fakeD1() {
  const creds = new Map();
  const writes = [];
  const key = (u) => `${u} roblox`;
  const db = {
    creds,
    writes,
    failAudit: false,
    prepare(sql) {
      const stmt = {
        bind(...args) {
          return {
            async run() {
              if (/^insert into user_credentials/i.test(sql)) {
                const [userId, sealed, creatorId, creatorType, scopes, fingerprint, hint, createdAt] = args;
                creds.set(key(userId), {
                  user_id: userId, sealed, roblox_creator_id: creatorId, creator_type: creatorType,
                  scopes, fingerprint, hint, created_at: createdAt, last_used_at: null,
                });
                return { meta: { changes: 1 } };
              }
              if (/^insert into creator_write_log/i.test(sql)) {
                if (db.failAudit) throw new Error('D1 exceeded its CPU time limit and was reset');
                const [userId, at, action, creatorId, creatorType, target, ok, status, request, response] = args;
                writes.push({
                  user_id: userId, at, action, roblox_creator_id: creatorId, creator_type: creatorType,
                  target, ok, http_status: status, request, response,
                });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async first() { return creds.get(key(args[0])) ?? null; },
            async all() { return { results: [] }; },
          };
        },
        async run() { return { meta: { changes: 0 } }; },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
    async exec() { return { count: 0 }; },
    async batch() { return []; },
  };
  return db;
}

const KEY32 = Buffer.alloc(32, 7).toString('base64');
const CUSTOMER_KEY = 'CustomerOpenCloudKey0123456789ABCDEFGHIJK';
const CUSTOMER_ACCOUNT = '555000111';

/** A worker env with one customer's key connected, carrying exactly `scopes`. */
async function envWith(scopes) {
  const env = { CORPUS: fakeD1(), CREDENTIAL_KEY: KEY32 };
  await C.putRobloxCredential(env, {
    userId: 'cust-1',
    apiKey: CUSTOMER_KEY,
    robloxCreatorId: CUSTOMER_ACCOUNT,
    creatorType: 'user',
    scopes,
  });
  return env;
}

/**
 * A fetch that records what it was asked to do and replays one recorded response.
 *
 * It asserts nothing itself — the tests read `calls` — because a fake that also judges is a fake
 * whose failures are reported at the wrong place.
 */
function recorder(status, body, contentType = 'application/json') {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType },
    });
  };
  impl.calls = calls;
  return impl;
}

/* ------------- recorded responses, shapes taken from Roblox's published OpenAPI ------------- */

// components/schemas/Universe
const UNIVERSE_200 = {
  path: 'universes/6543210',
  createTime: '2026-01-04T10:00:00Z',
  updateTime: '2026-09-01T12:00:00Z',
  displayName: 'Tower of Hecc',
  description: 'A climbing game.',
  user: `users/${CUSTOMER_ACCOUNT}`,
  visibility: 'PUBLIC',
};

// components/schemas/ListInventoryItemsResponse + InventoryItem_AssetDetails
const INVENTORY_200 = {
  inventoryItems: [
    {
      path: `users/${CUSTOMER_ACCOUNT}/inventory-items/abc`,
      addTime: '2026-08-02T09:30:00Z',
      assetDetails: { assetId: '981234567', inventoryItemAssetType: 'DECAL' },
    },
    {
      path: `users/${CUSTOMER_ACCOUNT}/inventory-items/def`,
      addTime: '2026-08-03T09:30:00Z',
      assetDetails: { assetId: '981234568', inventoryItemAssetType: 'MODEL' },
    },
  ],
  nextPageToken: 'page-2',
};

// game-passes-http-service/v1.json, 200 response of POST .../game-passes
const GAMEPASS_200 = {
  gamePassId: 776655,
  name: 'Starter Pack',
  description: 'A leg up.',
  isForSale: true,
  iconAssetId: 0,
  createdTimestamp: '2026-09-15T08:00:00Z',
  updatedTimestamp: '2026-09-15T08:00:00Z',
  priceInformation: { defaultPriceInRobux: 100 },
};

const GAMEPASS_LIST_200 = { gamePasses: [GAMEPASS_200], nextPageToken: '' };

/* ================================================================= THE NEGATIVE ONE === */

test('NO CUSTOMER KEY, NO WRITE — and it must not fall back to the platform credential', async () => {
  // The fallback is the whole bug wearing a helpful face: the call succeeds, the customer sees a
  // game pass appear, and it appears on somebody else's experience.
  const env = {
    CORPUS: fakeD1(),
    CREDENTIAL_KEY: KEY32,
    // A perfectly usable, fully consented SHARED key sits right here. It must not be reached.
    ROBLOX_API_KEY: 'shared-platform-key',
    ROBLOX_CREATOR_USER_ID: '11279664020',
    ROBLOX_UPLOAD_AUTHORISED_FOR: '11279664020',
  };
  const fetchImpl = recorder(200, GAMEPASS_200);
  const out = await D.createGamePass(env, 'cust-with-no-key', { universeId: '6543210', name: 'Starter Pack' }, fetchImpl);

  assert.equal(out.ok, false);
  assert.match(out.error, /no Roblox key is connected/);
  // THE ASSERTION THIS FILE EXISTS FOR: not one byte left for Roblox.
  assert.equal(fetchImpl.calls.length, 0, 'it must not have called Roblox at all');
  assert.equal(/shared-platform-key/.test(JSON.stringify(out)), false, 'and must not carry the shared key');
  assert.equal(/11279664020/.test(out.error ?? ''), false, 'and must not name the platform account');
});

test('every write refuses the same way, with no key connected — one missing check is not a gap in one place', async () => {
  const env = { CORPUS: fakeD1(), CREDENTIAL_KEY: KEY32, ROBLOX_API_KEY: 'shared-platform-key' };
  const attempts = [
    ['createGamePass', (f) => D.createGamePass(env, 'nobody', { universeId: '1', name: 'x' }, f)],
    ['grantAssetPermission', (f) => D.grantAssetPermission(env, 'nobody', { subjectType: 'Universe', subjectId: '1', action: 'Use', assetIds: [2] }, f)],
    ['getExperience', (f) => D.getExperience(env, 'nobody', '1', f)],
    ['listOwnedAssets', (f) => D.listOwnedAssets(env, 'nobody', {}, f)],
    ['listGamePasses', (f) => D.listGamePasses(env, 'nobody', '1', {}, f)],
  ];
  for (const [name, run] of attempts) {
    const f = recorder(200, {});
    const out = await run(f);
    assert.equal(out.ok, false, `${name} must refuse`);
    assert.equal(f.calls.length, 0, `${name} must not reach Roblox`);
  }
});

/* ============================================================== scope gating === */

test('a key without game-pass:write cannot create a game pass', async () => {
  const env = await envWith(['game-pass:read']);
  const f = recorder(200, GAMEPASS_200);
  const out = await D.createGamePass(env, 'cust-1', { universeId: '6543210', name: 'Starter Pack' }, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /game-pass:write/);
  assert.equal(f.calls.length, 0);
});

test('a key without asset-permissions:write cannot grant a permission', async () => {
  const env = await envWith(['asset:write']);
  const f = recorder(200, {});
  const out = await D.grantAssetPermission(env, 'cust-1', { subjectType: 'Universe', subjectId: '6543210', action: 'Use', assetIds: [981234567] }, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /asset-permissions:write/);
  assert.equal(f.calls.length, 0);
});

test('reading is gated too — a write-only key cannot list somebody\'s inventory', async () => {
  const env = await envWith(['asset:write']);
  const f = recorder(200, INVENTORY_200);
  const out = await D.listOwnedAssets(env, 'cust-1', {}, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /user\.inventory-item:read/);
  assert.equal(f.calls.length, 0);
});

/* ============================================================== the reads === */

test('getExperience calls the documented v2 path with the customer key', async () => {
  const env = await envWith(['universe:read']);
  const f = recorder(200, UNIVERSE_200);
  const out = await D.getExperience(env, 'cust-1', '6543210', f);

  assert.equal(out.ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://apis.roblox.com/cloud/v2/universes/6543210');
  assert.equal(f.calls[0].method, 'GET');
  assert.equal(f.calls[0].headers['x-api-key'], CUSTOMER_KEY);
  assert.equal(out.data.universeId, '6543210');
  assert.equal(out.data.displayName, 'Tower of Hecc');
  assert.equal(out.data.visibility, 'PUBLIC');
});

test('listOwnedAssets asks for the CONNECTED account, never an id off the request', async () => {
  // The user id in the path comes from the stored credential, so a caller cannot aim this at
  // somebody else's inventory by passing a different number.
  const env = await envWith(['user.inventory-item:read']);
  const f = recorder(200, INVENTORY_200);
  const out = await D.listOwnedAssets(env, 'cust-1', { maxPageSize: 50 }, f);

  assert.equal(out.ok, true);
  const url = new URL(f.calls[0].url);
  assert.equal(url.pathname, `/cloud/v2/users/${CUSTOMER_ACCOUNT}/inventory-items`);
  assert.equal(url.searchParams.get('maxPageSize'), '50');
  assert.equal(out.data.items.length, 2);
  assert.equal(out.data.items[0].assetId, '981234567');
  assert.equal(out.data.items[0].type, 'DECAL');
  assert.equal(out.data.nextPageToken, 'page-2');
});

test('listGamePasses reads the creator view of a universe', async () => {
  const env = await envWith(['game-pass:read']);
  const f = recorder(200, GAMEPASS_LIST_200);
  const out = await D.listGamePasses(env, 'cust-1', '6543210', {}, f);

  assert.equal(out.ok, true);
  assert.equal(
    new URL(f.calls[0].url).pathname,
    '/game-passes/v1/universes/6543210/game-passes/creator',
  );
  assert.equal(out.data.gamePasses[0].gamePassId, 776655);
  assert.equal(out.data.gamePasses[0].name, 'Starter Pack');
});

test('a read does not write an audit row — only writes do', async () => {
  const env = await envWith(['universe:read']);
  await D.getExperience(env, 'cust-1', '6543210', recorder(200, UNIVERSE_200));
  assert.equal(env.CORPUS.writes.length, 0);
});

/* ============================================================== the writes === */

test('createGamePass sends multipart/form-data with the documented field names', async () => {
  // Roblox documents this body as multipart/form-data with a required `name`. A JSON body here is
  // a 400 forever, which is why the shape is asserted rather than assumed.
  const env = await envWith(['game-pass:write']);
  const f = recorder(200, GAMEPASS_200);
  const out = await D.createGamePass(env, 'cust-1', {
    universeId: '6543210',
    name: 'Starter Pack',
    description: 'A leg up.',
    price: 100,
    isForSale: true,
  }, f);

  assert.equal(out.ok, true, out.error);
  const call = f.calls[0];
  assert.equal(call.method, 'POST');
  assert.equal(call.url, 'https://apis.roblox.com/game-passes/v1/universes/6543210/game-passes');
  assert.equal(call.headers['x-api-key'], CUSTOMER_KEY);
  assert.ok(call.body instanceof FormData, 'the body must be FormData, not a JSON string');
  assert.equal(call.body.get('name'), 'Starter Pack');
  assert.equal(call.body.get('description'), 'A leg up.');
  assert.equal(call.body.get('price'), '100');
  assert.equal(call.body.get('isForSale'), 'true');
  // FormData sets its own boundary; a hand-set content-type is the classic way to get a 400 that
  // reads like a schema error.
  assert.equal(call.headers['content-type'], undefined);
  assert.equal(out.data.gamePassId, 776655);
});

test('grantAssetPermission sends the documented JSON body', async () => {
  const env = await envWith(['asset-permissions:write']);
  const f = recorder(200, {});
  const out = await D.grantAssetPermission(env, 'cust-1', {
    subjectType: 'Universe',
    subjectId: '6543210',
    action: 'Use',
    assetIds: [981234567, 981234568],
  }, f);

  assert.equal(out.ok, true, out.error);
  const call = f.calls[0];
  assert.equal(call.method, 'PATCH');
  assert.equal(call.url, 'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions');
  const body = JSON.parse(call.body);
  assert.equal(body.subjectType, 'Universe');
  assert.equal(body.subjectId, '6543210');
  assert.equal(body.action, 'Use');
  assert.deepEqual(body.requests, [{ assetId: 981234567 }, { assetId: 981234568 }]);
});

test('an action outside the documented enum is refused before the request', async () => {
  const env = await envWith(['asset-permissions:write']);
  const f = recorder(200, {});
  const out = await D.grantAssetPermission(env, 'cust-1', {
    subjectType: 'Universe', subjectId: '1', action: 'Delete', assetIds: [1],
  }, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /Delete/);
  assert.equal(f.calls.length, 0);
});

test('Roblox refusing a write is reported with its own words, not a generic failure', async () => {
  const env = await envWith(['game-pass:write']);
  const f = recorder(400, { errorCode: 'InvalidName', errorMessage: 'Name contains filtered words.', field: 'name' });
  const out = await D.createGamePass(env, 'cust-1', { universeId: '6543210', name: 'x' }, f);
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
  assert.match(out.error, /filtered words/);
});

/* ============================================================== the audit === */

test('EVERY WRITE RECORDS WHAT WAS DONE, TO WHICH ACCOUNT, ON WHOSE BEHALF', async () => {
  const env = await envWith(['game-pass:write']);
  await D.createGamePass(env, 'cust-1', { universeId: '6543210', name: 'Starter Pack', price: 100 }, recorder(200, GAMEPASS_200));

  assert.equal(env.CORPUS.writes.length, 1);
  const row = env.CORPUS.writes[0];
  assert.equal(row.action, 'create_gamepass', 'what was done');
  assert.equal(row.roblox_creator_id, CUSTOMER_ACCOUNT, 'to which account');
  assert.equal(row.user_id, 'cust-1', 'on whose behalf');
  assert.equal(row.target, 'universes/6543210');
  assert.equal(row.ok, 1);
  assert.equal(row.http_status, 200);
  assert.ok(row.at, 'and when');
});

test('a REFUSED write is audited too — an attempt on somebody\'s account is a fact about it', async () => {
  const env = await envWith(['game-pass:write']);
  await D.createGamePass(env, 'cust-1', { universeId: '6543210', name: 'x' },
    recorder(403, { errorCode: 'Forbidden', errorMessage: 'no access to this universe' }));
  assert.equal(env.CORPUS.writes.length, 1);
  assert.equal(env.CORPUS.writes[0].ok, 0);
  assert.equal(env.CORPUS.writes[0].http_status, 403);
});

test('the audit never stores the key, in any column', async () => {
  const env = await envWith(['asset-permissions:write']);
  await D.grantAssetPermission(env, 'cust-1',
    { subjectType: 'Universe', subjectId: '6543210', action: 'Use', assetIds: [1] }, recorder(200, {}));
  const dumped = JSON.stringify(env.CORPUS.writes);
  assert.equal(dumped.includes(CUSTOMER_KEY), false);
  assert.equal(dumped.includes(CUSTOMER_KEY.slice(0, 12)), false);
});

test('A WRITE WHOSE AUDIT ROW FAILS IS NOT REPORTED AS A PLAIN SUCCESS', async () => {
  // The asset exists on Roblox now and cannot be un-created, so claiming a clean success would be
  // a failure to observe rendering as an observation. It says what happened and that it is unlogged.
  const env = await envWith(['game-pass:write']);
  env.CORPUS.failAudit = true;
  const out = await D.createGamePass(env, 'cust-1', { universeId: '6543210', name: 'Starter Pack' }, recorder(200, GAMEPASS_200));

  assert.equal(out.ok, true, 'the game pass really was created — saying otherwise would be a second lie');
  assert.equal(out.audited, false, 'and the caller is told the audit row did not land');
  assert.match(out.auditError ?? '', /CPU time limit/);
});

test('a successful write says it was audited', async () => {
  const env = await envWith(['game-pass:write']);
  const out = await D.createGamePass(env, 'cust-1', { universeId: '6543210', name: 'Starter Pack' }, recorder(200, GAMEPASS_200));
  assert.equal(out.audited, true);
});

/* ============================================================== what is NOT here === */

test('nothing in this module posts to an unverified URL', async () => {
  // Every host and path the module can reach, asserted as a closed set. A new endpoint added
  // without a verified path and a fixture makes this go red, which is the point: the 299 uploads
  // began with a request nobody had checked.
  const VERIFIED = new Set([
    'https://apis.roblox.com/cloud/v2/universes/{id}',
    'https://apis.roblox.com/cloud/v2/users/{id}/inventory-items',
    'https://apis.roblox.com/game-passes/v1/universes/{id}/game-passes',
    'https://apis.roblox.com/game-passes/v1/universes/{id}/game-passes/creator',
    'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions',
    'https://apis.roblox.com/assets/v1/assets',
    'https://apis.roblox.com/assets/v1/assets/{id}',
    'https://apis.roblox.com/assets/v1/operations/{id}',
  ]);
  assert.deepEqual(new Set(D.VERIFIED_ENDPOINTS), VERIFIED);
});

test('promo codes are absent on purpose, with the reason attached', async () => {
  // Roblox has no creator-facing promo/redemption-code product in Open Cloud. Checked against the
  // published spec (749 paths) and by live probe on 2026-09-15: /promo-codes/... and
  // /promotion-codes/... both answer 404 while every real route answers 401. Rather than a
  // function that posts to a URL nobody verified, the module states the gap.
  assert.equal(typeof D.UNBUILDABLE.promoCodes, 'string');
  assert.match(D.UNBUILDABLE.promoCodes, /404|no .*endpoint/i);
  assert.equal('createPromoCode' in D, false);
});

test('listing a person\'s experiences is absent on purpose, with the reason attached', async () => {
  // GET /v1/user/universes exists but its only documented security scheme is roblox-legacy-cookie
  // — the .ROBLOSECURITY browser cookie, which Roblox's own spec describes as "DO NOT SHARE THIS".
  // An Open Cloud API key cannot call it. Asking a customer for that cookie would be asking for
  // their whole account, so the module takes a universe id instead.
  assert.equal(typeof D.UNBUILDABLE.listExperiences, 'string');
  assert.match(D.UNBUILDABLE.listExperiences, /cookie/i);
  assert.equal('listExperiences' in D, false);
});

/* ======================= uploading into the CUSTOMER'S OWN account === */
//
// The library import path (asset-import.ts) has a legitimate no-customer branch and uploads to
// Apple's own account behind ROBLOX_UPLOAD_AUTHORISED_FOR. This is the other path — a file the
// customer asked to put in THEIR account — and it has no such branch. The fixtures come from
// assets/v1.json: multipart `request` + `fileContent`, and a long-running Operation back.

// components/schemas/Operation, with the Asset inlined as `response` when Roblox finishes at once.
const UPLOAD_DONE_200 = {
  path: 'operations/8a4c0e12-b9f1-4a6e-9f18-2c5d7a11e300',
  done: true,
  response: {
    path: 'assets/981234999',
    assetId: '981234999',
    assetType: 'Image',
    displayName: 'Brick wall',
    creationContext: { creator: { userId: Number(CUSTOMER_ACCOUNT) } },
    moderationResult: { moderationState: 'Approved' },
    state: 'Active',
  },
};

// The same operation before Roblox has finished with it — the usual first answer.
const UPLOAD_PENDING_200 = { path: 'operations/8a4c0e12-b9f1-4a6e-9f18-2c5d7a11e300', done: false };

// components/schemas/Asset, as GET /v1/assets/{assetId} returns it.
const ASSET_200 = {
  path: 'assets/981234567',
  assetId: 981234567,
  assetType: 'Decal',
  displayName: 'Mossy stone',
  description: 'A stone.',
  revisionId: '1',
  revisionCreateTime: '2026-08-02T09:30:00Z',
  moderationResult: { moderationState: 'Approved' },
  state: 'Active',
  creationContext: { creator: { userId: Number(CUSTOMER_ACCOUNT) } },
};

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3, 4]).buffer;

test('UPLOADING WITH NO CUSTOMER KEY IS REFUSED, and never reaches for the shared one', async () => {
  // The same assertion as the game pass, for the operation that actually caused the incident.
  const env = {
    CORPUS: fakeD1(),
    CREDENTIAL_KEY: KEY32,
    ROBLOX_API_KEY: 'shared-platform-key',
    ROBLOX_CREATOR_USER_ID: '11279664020',
    ROBLOX_UPLOAD_AUTHORISED_FOR: '11279664020',
  };
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.uploadAsset(env, 'cust-with-no-key', {
    file: png(), contentType: 'image/png', displayName: 'Brick wall',
  }, f);

  assert.equal(out.ok, false);
  assert.match(out.error, /no Roblox key is connected/);
  assert.equal(f.calls.length, 0, 'it must not have called Roblox at all');
  assert.equal(/shared-platform-key/.test(JSON.stringify(out)), false, 'and must not carry the shared key');
  assert.equal(/11279664020/.test(out.error ?? ''), false, 'and must not name the platform account');
});

test('a key without asset:write cannot upload', async () => {
  const env = await envWith(['asset:read']);
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.uploadAsset(env, 'cust-1', { file: png(), contentType: 'image/png', displayName: 'x' }, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /asset:write/);
  assert.equal(f.calls.length, 0);
});

test('uploadAsset posts the documented multipart body to the documented path', async () => {
  const env = await envWith(['asset:write']);
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.uploadAsset(env, 'cust-1', {
    file: png(), contentType: 'image/png', displayName: 'Brick wall', description: 'A wall.',
  }, f);

  assert.equal(out.ok, true, out.error);
  const call = f.calls[0];
  assert.equal(call.method, 'POST');
  assert.equal(call.url, 'https://apis.roblox.com/assets/v1/assets');
  assert.equal(call.headers['x-api-key'], CUSTOMER_KEY);
  assert.ok(call.body instanceof FormData, 'assets/v1.json declares multipart/form-data');
  const req = JSON.parse(call.body.get('request'));
  assert.equal(req.assetType, 'Image');
  assert.equal(req.displayName, 'Brick wall');
  assert.ok(call.body.get('fileContent'), 'the file goes in `fileContent`');
  assert.equal(out.data.assetId, 981234999);
  assert.equal(out.data.done, true);
});

test('THE ACCOUNT UPLOADED TO COMES FROM THE STORED CREDENTIAL, never from the request', async () => {
  // This is the 299 uploads restated as a request shape: if the creator block could be set by the
  // caller, one customer could create assets in another account and Roblox would happily agree.
  const env = await envWith(['asset:write']);
  const f = recorder(200, UPLOAD_DONE_200);
  await D.uploadAsset(env, 'cust-1', {
    file: png(), contentType: 'image/png', displayName: 'x',
    // A caller trying to aim it elsewhere. It must be ignored entirely.
    creator: { userId: '11279664020' }, robloxCreatorId: '11279664020',
  }, f);
  const req = JSON.parse(f.calls[0].body.get('request'));
  assert.equal(req.creationContext.creator.userId, CUSTOMER_ACCOUNT);
  assert.equal('groupId' in req.creationContext.creator, false);
});

test('AN UPLOAD TELLS ROBLOX TO FAIL RATHER THAN SPEND THE CUSTOMER\'S ROBUX', async () => {
  // assets/v1.json: `expectedPrice` — "when the actual price is more than expected, the operation
  // fails with a 400 error". A fee charged to somebody's account because nobody named a ceiling is
  // the money-shaped version of configuration-is-not-consent.
  const env = await envWith(['asset:write']);
  const f = recorder(200, UPLOAD_DONE_200);
  await D.uploadAsset(env, 'cust-1', { file: png(), contentType: 'image/png', displayName: 'x' }, f);
  const req = JSON.parse(f.calls[0].body.get('request'));
  assert.equal(req.creationContext.expectedPrice, 0, 'a free upload by default');
});

test('a content type Roblox does not accept is refused before a byte is sent', async () => {
  const env = await envWith(['asset:write']);
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.uploadAsset(env, 'cust-1', { file: png(), contentType: 'image/webp', displayName: 'x' }, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /image\/webp/);
  assert.equal(f.calls.length, 0);
});

test('a .glb IS uploadable to the customer\'s own account, unlike the shared library path', async () => {
  // roblox-upload.ts refuses a Model for the LIBRARY because a Model is not Open Use and would 404
  // for every customer but Apple. In the customer's own account that reason does not apply: they
  // own it, so they can use it. Roblox's own table lists .glb under Model.
  const env = await envWith(['asset:write']);
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.uploadAsset(env, 'cust-1', { file: png(), contentType: 'model/gltf-binary', displayName: 'Wrench' }, f);
  assert.equal(out.ok, true, out.error);
  assert.equal(JSON.parse(f.calls[0].body.get('request')).assetType, 'Model');
});

test('a file over Roblox\'s 20 MB ceiling is refused before a byte is sent', async () => {
  const env = await envWith(['asset:write']);
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.uploadAsset(env, 'cust-1', {
    file: new ArrayBuffer(20 * 1024 * 1024 + 1), contentType: 'image/png', displayName: 'x',
  }, f);
  assert.equal(out.ok, false);
  assert.match(out.error, /20|limit|exceed/i);
  assert.equal(f.calls.length, 0);
});

test('an upload Roblox has not finished is reported as pending, not as a finished asset', async () => {
  const env = await envWith(['asset:write']);
  const out = await D.uploadAsset(env, 'cust-1',
    { file: png(), contentType: 'image/png', displayName: 'x' }, recorder(200, UPLOAD_PENDING_200));
  assert.equal(out.ok, true);
  assert.equal(out.data.done, false, 'accepted is not the same fact as created');
  assert.equal(out.data.assetId, null);
  assert.equal(out.data.operationId, '8a4c0e12-b9f1-4a6e-9f18-2c5d7a11e300');
});

test('AN UPLOAD IS AUDITED — what was created, in which account, on whose behalf', async () => {
  const env = await envWith(['asset:write']);
  await D.uploadAsset(env, 'cust-1', { file: png(), contentType: 'image/png', displayName: 'Brick wall' },
    recorder(200, UPLOAD_DONE_200));

  assert.equal(env.CORPUS.writes.length, 1);
  const row = env.CORPUS.writes[0];
  assert.equal(row.action, 'upload_asset');
  assert.equal(row.roblox_creator_id, CUSTOMER_ACCOUNT);
  assert.equal(row.user_id, 'cust-1');
  assert.equal(row.ok, 1);
  assert.equal(JSON.stringify(env.CORPUS.writes).includes(CUSTOMER_KEY), false, 'and never the key');
});

test('an upload whose audit row fails is not reported as a plain success', async () => {
  // Roblox cannot un-create an Image. Claiming a clean success would be the incident's own shape.
  const env = await envWith(['asset:write']);
  env.CORPUS.failAudit = true;
  const out = await D.uploadAsset(env, 'cust-1', { file: png(), contentType: 'image/png', displayName: 'x' },
    recorder(200, UPLOAD_DONE_200));
  assert.equal(out.ok, true);
  assert.equal(out.audited, false);
  assert.match(out.auditError ?? '', /CPU time limit/);
});

/* ======================= reading one asset back === */

test('getAsset reads the documented path with the customer key', async () => {
  const env = await envWith(['asset:read']);
  const f = recorder(200, ASSET_200);
  const out = await D.getAsset(env, 'cust-1', '981234567', f);
  assert.equal(out.ok, true, out.error);
  assert.equal(f.calls[0].url, 'https://apis.roblox.com/assets/v1/assets/981234567');
  assert.equal(f.calls[0].headers['x-api-key'], CUSTOMER_KEY);
  assert.equal(out.data.displayName, 'Mossy stone');
  assert.equal(out.data.assetType, 'Decal');
  assert.equal(out.data.moderationState, 'Approved');
  assert.equal(env.CORPUS.writes.length, 0, 'a read is not a write');
});

test('getAsset is gated on asset:read like everything else', async () => {
  const env = await envWith(['asset:write']);
  const f = recorder(200, ASSET_200);
  const out = await D.getAsset(env, 'cust-1', '981234567', f);
  assert.equal(out.ok, false);
  assert.match(out.error, /asset:read/);
  assert.equal(f.calls.length, 0);
});

test('getUploadStatus finishes the job an upload started', async () => {
  const env = await envWith(['asset:read']);
  const f = recorder(200, UPLOAD_DONE_200);
  const out = await D.getUploadStatus(env, 'cust-1', '8a4c0e12-b9f1-4a6e-9f18-2c5d7a11e300', f);
  assert.equal(out.ok, true, out.error);
  assert.equal(
    f.calls[0].url,
    'https://apis.roblox.com/assets/v1/operations/8a4c0e12-b9f1-4a6e-9f18-2c5d7a11e300',
  );
  assert.equal(out.data.assetId, 981234999);
});

/* ======================= what "download" actually is === */

test('DOWNLOADING THE FILE is absent on purpose, with the count that proves it', async () => {
  // Measured against Roblox's own published master Cloud spec on 2026-09-15: 749 paths, and ZERO
  // operations anywhere in it declare a binary response body. `GET /assets/v1/assets/{id}` returns
  // the Asset schema, whose thirteen properties carry no content and no download URL. The only
  // thing that ever served asset bytes is `assetdelivery`, which is not in the Cloud spec at all
  // and is authenticated by the .ROBLOSECURITY cookie. So the record comes back; the file cannot.
  assert.equal(typeof D.UNBUILDABLE.downloadAssetFile, 'string');
  assert.match(D.UNBUILDABLE.downloadAssetFile, /749|cookie|no .*binary/i);
  assert.equal('downloadAsset' in D, false);
  assert.equal('downloadAssetFile' in D, false);
});
