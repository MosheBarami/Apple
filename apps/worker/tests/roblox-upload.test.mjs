// The Open Cloud upload request, asserted against the shape Roblox documents.
//
// WHY THIS IS TESTED AND NOT JUST WRITTEN. A wrong multipart field name, a `content-type` header
// that overwrites the boundary, or a creator block with both a userId and a groupId all produce a
// 400 from Roblox at RUN TIME, against the owner's real account, after the bytes have been sent.
// None of them is visible in a typecheck. The fetch is injected so these assertions read the
// actual request this code builds rather than a description of it.
//
// AND THE ID PARSER IS THE SHARPEST PART. Roblox returns the asset id as a decimal STRING. A
// parser written the obvious way — `Number(body.assetId) > 0` — turns a missing field into NaN and
// an empty string into 0, and a library row stamped with asset id 0 looks imported and resolves to
// nothing. That is the observation-failure shape this repository keeps finding, sitting on the one
// number that decides whether a customer's game can load the asset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rbxupload-')), 'u.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'roblox-upload.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const U = await import(`file://${out}`);

// The consent field is part of a working env, not an extra. Leaving it out of this fixture is
// what the suite does on purpose in the dedicated cases below.
const ENV = { ROBLOX_API_KEY: 'key-123', ROBLOX_CREATOR_USER_ID: '99887766', ROBLOX_UPLOAD_AUTHORISED_FOR: '99887766' };
const FILE = new TextEncoder().encode('not really a png, but bytes are bytes').buffer;
const INPUT = { file: FILE, contentType: 'image/jpeg', displayName: 'Brick Wall 001', description: 'x', type: 'Image' };

/** Capture the one request the code makes, and answer with whatever the case needs. */
function recorder(status, body) {
  const seen = [];
  const impl = async (url, init) => {
    seen.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { seen, impl };
}

/* ---------------------------------------------------------------------- the request shape --- */

test('THE REQUEST IS THE ONE ROBLOX DOCUMENTS — endpoint, key header, two multipart fields', async () => {
  const r = recorder(200, { path: 'operations/op-1' });
  await U.uploadAsset(ENV, INPUT, r.impl);
  assert.equal(r.seen.length, 1, 'exactly one request');
  const { url, init } = r.seen[0];
  assert.equal(url, 'https://apis.roblox.com/assets/v1/assets');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-api-key'], 'key-123');
  assert.ok(init.body instanceof FormData, 'the body must be multipart');
  assert.ok(init.body.has('request'), 'the JSON part is named "request"');
  assert.ok(init.body.has('fileContent'), 'the binary part is named "fileContent"');
});

test('and it does NOT set content-type by hand, which would destroy the multipart boundary', async () => {
  // The single most common way to get an unexplainable 400 out of a multipart endpoint: FormData
  // generates a boundary and puts it in the header it sets itself, so a hand-written
  // `content-type: multipart/form-data` produces a body the server cannot split.
  //
  // My first version of this grepped the SOURCE for the string 'content-type' and went red on the
  // comment explaining why the header is absent, and on the Blob's own `type` — a guard reading
  // its own commentary as data, which is a named trap in this repo. The request is the subject;
  // read the request.
  const r = recorder(200, { path: 'operations/op-1' });
  await U.uploadAsset(ENV, INPUT, r.impl);
  const keys = Object.keys(r.seen[0].init.headers).map((k) => k.toLowerCase());
  assert.deepEqual(keys, ['x-api-key'], 'the key header, and nothing else');
  // The per-part type still travels, on the Blob, which is where multipart wants it.
  assert.equal(r.seen[0].init.body.get('fileContent').type, 'image/jpeg');
});

test('the JSON part carries the asset type, the trimmed name and exactly one creator', async () => {
  const r = recorder(200, { path: 'operations/op-1' });
  await U.uploadAsset(ENV, { ...INPUT, displayName: 'x'.repeat(200) }, r.impl);
  const req = JSON.parse(r.seen[0].init.body.get('request'));
  assert.equal(req.assetType, 'Image');
  assert.equal(req.displayName.length, 50, 'Roblox trims long names; trimming here makes it predictable');
  assert.deepEqual(req.creationContext.creator, { userId: '99887766' });
  assert.equal('groupId' in req.creationContext.creator, false, 'never both');
});

test('a group creator replaces the user one rather than joining it', async () => {
  const r = recorder(200, { path: 'operations/op-1' });
  await U.uploadAsset({ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_GROUP_ID: '555', ROBLOX_UPLOAD_AUTHORISED_FOR: '555' }, INPUT, r.impl);
  const req = JSON.parse(r.seen[0].init.body.get('request'));
  assert.deepEqual(req.creationContext.creator, { groupId: '555' });
});

/* ---------------------------------------------------------------------------- the refusals --- */

//[[ THE TWO TESTS THAT WERE HERE GUARDED THE SHARED-ACCOUNT UPLOAD PATH, AND IT IS GONE.
//
//   They asserted that `OPEN_USE_UPLOAD_TYPES` was exactly ['Decal','Image','Mesh'] and never
//   'Model', and that `uploadTypeFor(kind, contentType)` mapped a catalogue kind onto one of them —
//   refusing .glb and .fbx, because those can only go up as a Model, and a Model uploaded under
//   APPLE'S account would load for Apple and 404 for every paying customer.
//
//   That constraint was about one account: the shared one the asset library imported into. The
//   library was removed on 2026-09-20 and both exports went with it. The only caller left is
//   `creator-dashboard.ts`, uploading into the CUSTOMER'S own account with the customer's own key,
//   where a Model is perfectly usable because they own it — so `ROBLOX_UPLOAD_TYPES` deliberately
//   includes Model and `assetTypeForContentType` deliberately maps .glb and .fbx onto it. Keeping
//   the old assertions would have been pinning a rule to a situation that no longer occurs.
//
//   What replaces them is the assertion that the shared-account path did not survive in some other
//   form, because that is the thing that must not come back. ]]
test('THERE IS NO SHARED-ACCOUNT UPLOAD PATH LEFT, in any shape', () => {
  assert.equal(U.OPEN_USE_UPLOAD_TYPES, undefined,
    'the Open Use type list is back — it only ever described what Apple could upload into its own account');
  assert.equal(U.uploadTypeFor, undefined,
    'uploadTypeFor is back, and it is the function that turned a catalogue row into a shared-account upload');
  assert.equal(U.archiveAsset, undefined,
    'archiveAsset is back — it was the undo for a library import, and there are no imports');
  // CONTROL: the module still exports the customer path, so the three `undefined`s above are real
  // absences and not a module that failed to load and handed back an empty namespace.
  assert.equal(typeof U.uploadAsset, 'function', 'the customer upload path must still be here');
  assert.equal(typeof U.preflight, 'function');
  assert.ok(Array.isArray([...U.ROBLOX_UPLOAD_TYPES]), 'and the full Roblox type list');
});

test('the customer path maps a content type onto a Roblox type, Model included', () => {
  // Open Use is not a constraint on somebody uploading into their own account, so the full set is
  // reachable here on purpose. This is the mapping `creator-dashboard.ts` actually calls.
  assert.equal(U.assetTypeForContentType('image/png'), 'Image');
  assert.equal(U.assetTypeForContentType('image/png; charset=binary'), 'Image', 'parameters are dropped');
  assert.equal(U.assetTypeForContentType('model/gltf-binary'), 'Model');
  assert.equal(U.assetTypeForContentType('model/x-file-mesh-data'), 'Mesh');
  assert.equal(U.assetTypeForContentType('image/webp'), null, 'Roblox does not list webp');
  assert.equal(U.assetTypeForContentType('text/html'), null, 'nor a web page');
});

test('preflight refuses before a byte is sent, and says which thing is wrong', () => {
  const cases = [
    [{}, /ROBLOX_API_KEY/],
    [{ ROBLOX_API_KEY: 'k' }, /neither .*USER_ID nor .*GROUP_ID/],
    [{ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_USER_ID: '1', ROBLOX_CREATOR_GROUP_ID: '2' }, /exactly one/],
    [{ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_USER_ID: '1' }, /not authorised/],
  ];
  for (const [env, re] of cases) assert.match(U.preflight(env, 10, 'Image') ?? '', re);
  assert.equal(U.preflight(ENV, 10, 'Image'), null, 'a good one passes — the control');
  assert.match(U.preflight(ENV, 0, 'Image') ?? '', /empty/);
  assert.match(U.preflight(ENV, U.MAX_UPLOAD_BYTES + 1, 'Image') ?? '', /exceeds/);
  assert.match(U.preflight(ENV, 10, null) ?? '', /Models are excluded/);
});

test('a refused upload sends NOTHING — preflight is a gate, not a warning', async () => {
  const r = recorder(200, { path: 'operations/op-1' });
  const res = await U.uploadAsset({ ROBLOX_API_KEY: 'k' }, INPUT, r.impl);
  assert.equal(res.ok, false);
  assert.equal(r.seen.length, 0, 'no request may be made once preflight has refused');
});

/* -------------------------------------------------------------------------- the responses --- */

test('a 401 comes back with the body verbatim, not as "upload failed"', async () => {
  // The body is where "your key is missing the asset:write scope" is written. Collapsing it to a
  // generic message is the difference between a person ticking one checkbox and retrying forever.
  const r = recorder(401, 'Invalid API Key: missing scope asset:write');
  const res = await U.uploadAsset(ENV, INPUT, r.impl);
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.match(res.error, /asset:write/);
});

test('an accepted upload is NOT a finished one', async () => {
  const r = recorder(200, { path: 'operations/op-77' });
  const res = await U.uploadAsset(ENV, INPUT, r.impl);
  assert.equal(res.ok, true);
  assert.equal(res.done, false, 'no asset id yet — the operation is still running');
  assert.equal(res.operationId, 'op-77');
  assert.equal(res.assetId, undefined, 'and no id is invented for it');
});

test('an operation that reports an error is a FAILURE, even though the HTTP status is 200', async () => {
  // Roblox answers 200 with an `error` member. A status-code-only check reads this as "still
  // processing" and polls it forever — a failure rendered as patience.
  const r = recorder(200, { error: { code: 'MODERATED', message: 'rejected by moderation' } });
  const res = await U.pollOperation(ENV, 'op-9', r.impl);
  assert.equal(res.ok, false);
  assert.match(res.error, /moderation/);
});

/* ----------------------------------------------------------------------------- the id --- */

test('THE ASSET ID IS PARSED, NEVER COERCED — 0 and NaN are not asset ids', () => {
  assert.equal(U.assetIdFrom({ response: { assetId: '1234567890' } }), 1234567890);
  assert.equal(U.assetIdFrom({ assetId: '42' }), 42, 'both nestings Roblox has used');
  assert.equal(U.assetIdFrom({ response: { assetId: 987 } }), 987, 'a number is accepted too');
  for (const bad of [
    {},
    { response: {} },
    { response: { assetId: '' } },        // Number('') is 0
    { response: { assetId: 'abc' } },     // Number('abc') is NaN
    { response: { assetId: '0' } },       // a real zero is still not an asset
    { response: { assetId: -5 } },
    { response: { assetId: 1.5 } },
    { response: { assetId: '12.3' } },
    { response: { assetId: null } },
    { response: { assetId: '1e9' } },     // Number() would happily make this 1000000000
    null,
    undefined,
  ]) {
    assert.equal(U.assetIdFrom(bad), null, JSON.stringify(bad));
  }
});

test('the operation id is read from either shape Roblox has returned', () => {
  assert.equal(U.operationIdFrom({ path: 'operations/abc-123' }), 'abc-123');
  assert.equal(U.operationIdFrom({ path: 'v1/operations/abc-123' }), 'abc-123');
  assert.equal(U.operationIdFrom({ operationId: 'xyz' }), 'xyz');
  for (const bad of [{}, { path: 'assets/5' }, { path: '' }, { operationId: '' }, null]) {
    assert.equal(U.operationIdFrom(bad), null, JSON.stringify(bad));
  }
});

test('a 200 with no operation at all is a failure, not a silent success', async () => {
  const r = recorder(200, { unexpected: true });
  const res = await U.uploadAsset(ENV, INPUT, r.impl);
  assert.equal(res.ok, false);
  assert.match(res.error, /no operation/);
});


/* ------------------------------------------------------------------------- consent --- */

test('AN ACCOUNT IS NOT CONSENT TO WRITE TO IT — the guard that did not exist', () => {
  // 299 assets were created in the owner's personal Roblox account before he had agreed to that,
  // because a key with asset:write and a creator id in the config were between them enough to
  // start. Roblox then refused to take them back — an Image is "not an archivable asset type" —
  // so the account keeps them permanently. Configuration answers "which account". It has never
  // answered "may you", and the two are now separate fields.
  const configuredButUnauthorised = { ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_USER_ID: '11279664020' };
  assert.match(U.preflight(configuredButUnauthorised, 10, 'Image') ?? '', /not authorised/);
  assert.match(U.preflight(configuredButUnauthorised, 10, 'Image') ?? '', /cannot be undone/);
});

test('consent NAMES the account, so changing the account withdraws it', async () => {
  // A boolean would survive an edit to the creator id — which is the exact moment the permission
  // must be re-asked, because it is now a permission about a different person's account.
  const moved = { ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_USER_ID: '22222', ROBLOX_UPLOAD_AUTHORISED_FOR: '11111' };
  assert.match(U.preflight(moved, 10, 'Image') ?? '', /not authorised/);

  const r = recorder(200, { path: 'operations/op-1' });
  const res = await U.uploadAsset(moved, INPUT, r.impl);
  assert.equal(res.ok, false);
  assert.equal(r.seen.length, 0, 'and not one byte is sent while consent does not match');
});

test('a group id is consented to the same way as a user id', () => {
  assert.equal(U.preflight({ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_GROUP_ID: '555', ROBLOX_UPLOAD_AUTHORISED_FOR: '555' }, 10, 'Image'), null);
  assert.match(U.preflight({ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_GROUP_ID: '555', ROBLOX_UPLOAD_AUTHORISED_FOR: '556' }, 10, 'Image') ?? '', /not authorised/);
});

test('and consent alone is not enough — every other refusal still applies', () => {
  // The new gate must not become the only gate. A consented env with no key, an empty file or a
  // format with no Open Use path is still refused, and each still says which thing is wrong.
  const consented = { ROBLOX_CREATOR_USER_ID: '9', ROBLOX_UPLOAD_AUTHORISED_FOR: '9' };
  assert.match(U.preflight(consented, 10, 'Image') ?? '', /ROBLOX_API_KEY/);
  assert.match(U.preflight({ ...consented, ROBLOX_API_KEY: 'k' }, 0, 'Image') ?? '', /empty/);
  assert.match(U.preflight({ ...consented, ROBLOX_API_KEY: 'k' }, 10, null) ?? '', /Models are excluded/);
});
