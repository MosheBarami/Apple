// WHOSE ACCOUNT does an import write to.
//
// This is the question that produced the incident: 299 assets were created in one person's Roblox
// account because the only write credential in the product was a single shared one, and Roblox
// then refused to take them back — an Image is "not an archivable asset type". Fixing consent
// stopped it happening by accident. This is the part that stops it being the ARRANGEMENT.
//
// The assertion that matters is the NEGATIVE one. It is easy to write a per-customer path and
// leave a fallback to the shared key for when the customer's is missing, and that fallback is the
// whole bug wearing a helpful face: a build would succeed, the customer would see assets appear,
// and they would be appearing in somebody else's account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => {
  const out = join(mkdtempSync(join(tmpdir(), 'aimport-')), `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', `${name}.ts`), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const I = await import(`file://${src('asset-import')}`);
const C = await import(`file://${src('user-credentials')}`);

/* --------------------------------------------------------------------- fixtures --- */

function fakeD1() {
  const rows = new Map();
  const key = (u) => `${u} roblox`;
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (/^insert into user_credentials/i.test(sql)) {
                const [userId, sealed, creatorId, creatorType, scopes, fingerprint, hint, createdAt] = args;
                rows.set(key(userId), {
                  user_id: userId, sealed, roblox_creator_id: creatorId, creator_type: creatorType,
                  scopes, fingerprint, hint, created_at: createdAt, last_used_at: null,
                });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async first() { return rows.get(key(args[0])) ?? null; },
            async all() { return { results: [] }; },
          };
        },
        async run() { return { meta: { changes: 0 } }; },
        async first() { return null; },
        async all() { return { results: [] }; },
      };
    },
    async batch() { return []; },
  };
}

const KEY32 = Buffer.alloc(32, 3).toString('base64');
const CUSTOMER_KEY = 'CustomerOpenCloudKey0123456789ABCDEFGHIJK';

async function envWithCustomer(scopes = ['asset:write']) {
  const env = { CORPUS: fakeD1(), CREDENTIAL_KEY: KEY32 };
  await C.putRobloxCredential(env, {
    userId: 'cust-1',
    apiKey: CUSTOMER_KEY,
    robloxCreatorId: '555000111',
    creatorType: 'user',
    scopes,
  });
  return env;
}

/** A row whose bytes resolve, so the test reaches the upload rather than stopping earlier. */
const ROW = {
  id: 'poly_haven/textures/aerial-asphalt-01',
  name: 'Aerial Asphalt 01',
  kind: 'texture',
  source: 'poly_haven',
  sourceUrl: 'https://polyhaven.com/a/aerial_asphalt_01',
  licence: 'CC0',
  licenceUrl: 'https://polyhaven.com/license',
  commercialUse: true,
  attributionRequired: false,
  author: 'Poly Haven',
  retrievedAt: '2026-09-15T00:00:00.000Z',
  importedAt: null,
  modifications: [],
  robloxAssetId: null,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  tags: ['asphalt', 'road'],
  sha256: null,
};

/* ------------------------------------------------------------------- the cases --- */

test('WITHOUT A CONNECTED KEY, AN IMPORT FOR A USER FAILS — it does not fall back', async () => {
  // The fallback is the whole bug wearing a helpful face: the build succeeds, assets appear, and
  // they appear in somebody else's account.
  const env = {
    CORPUS: fakeD1(),
    CREDENTIAL_KEY: KEY32,
    // A perfectly usable SHARED key sits right here, fully consented. It must not be reached.
    ROBLOX_API_KEY: 'shared-key',
    ROBLOX_CREATOR_USER_ID: '11279664020',
    ROBLOX_UPLOAD_AUTHORISED_FOR: '11279664020',
  };
  const out = await I.importAsset(env, ROW, 'cust-with-no-key');
  assert.equal(out.ok, false);
  assert.match(out.error, /no Roblox key is connected/);
  assert.equal(/11279664020/.test(out.error ?? ''), false, 'and it must not name the shared account');
});

test('a key without asset:write cannot be used to create an asset', async () => {
  const env = await envWithCustomer(['asset:read']);
  const out = await I.importAsset(env, ROW, 'cust-1');
  assert.equal(out.ok, false);
  assert.match(out.error, /asset:write/);
});

test('the shared key is still refused when the deployment has not consented to it', async () => {
  // The no-userId path is Apple's own library work. It goes through the same preflight, so a
  // deployment that configured a creator id without authorising it still writes nothing.
  const env = { CORPUS: fakeD1(), ROBLOX_API_KEY: 'shared-key', ROBLOX_CREATOR_USER_ID: '11279664020' };
  const out = await I.importAsset(env, ROW);
  assert.equal(out.ok, false);
  assert.match(out.error, /not authorised/);
});

test('THE CONSENT APPLE PASSES ON BEHALF OF A CUSTOMER NAMES THE CUSTOMER ACCOUNT', async () => {
  // The customer connected the key, ticked asset:write and confirmed the permanence warning — that
  // IS the consent the shared-key path looks up in configuration. If it were passed as a bare
  // "yes" rather than as the account id, it would authorise a write to whichever account happened
  // to be configured, which is the distinction the consent check exists to make.
  //
  // Asserted by its absence of a specific failure: with a real connected key the upload must get
  // past preflight, so whatever goes wrong next is about Roblox, never about authorisation.
  const env = await envWithCustomer(['asset:write']);
  const out = await I.importAsset(env, ROW, 'cust-1');
  assert.equal(out.ok, false, 'no real Roblox key, so it cannot actually succeed here');
  assert.equal(
    /not authorised/.test(out.error ?? ''),
    false,
    `a connected customer key must satisfy preflight; got: ${out.error}`,
  );
  assert.match(out.error ?? '', /upload failed/, 'it must have reached Roblox and been refused there');
});
