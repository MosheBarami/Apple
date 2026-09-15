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

const ENV = { ROBLOX_API_KEY: 'key-123', ROBLOX_CREATOR_USER_ID: '99887766' };
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
  await U.uploadAsset({ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_GROUP_ID: '555' }, INPUT, r.impl);
  const req = JSON.parse(r.seen[0].init.body.get('request'));
  assert.deepEqual(req.creationContext.creator, { groupId: '555' });
});

/* ---------------------------------------------------------------------------- the refusals --- */

test('MODELS HAVE NO UPLOAD PATH, and that is the rule the whole library rests on', () => {
  // Images, Decals and Meshes are Open Use by default; Models are not. A Model uploaded under
  // Apple's account would be usable by Apple and by nobody who pays for the product.
  assert.deepEqual([...U.OPEN_USE_UPLOAD_TYPES], ['Decal', 'Image', 'Mesh']);
  assert.ok(!U.OPEN_USE_UPLOAD_TYPES.includes('Model'));
  assert.equal(U.uploadTypeFor('building', 'application/zip'), null, 'a zip has no path');
  assert.equal(U.uploadTypeFor('prop', 'text/html'), null, 'nor does a web page');
});

test('an image becomes an Image, and an icon or particle becomes a Decal', () => {
  assert.equal(U.uploadTypeFor('texture', 'image/jpeg'), 'Image');
  assert.equal(U.uploadTypeFor('ui_icon', 'image/png'), 'Decal');
  assert.equal(U.uploadTypeFor('particle', 'image/png'), 'Decal');
  assert.equal(U.uploadTypeFor('prop', 'model/gltf-binary'), 'Mesh');
});

test('preflight refuses before a byte is sent, and says which thing is wrong', () => {
  const cases = [
    [{}, /ROBLOX_API_KEY/],
    [{ ROBLOX_API_KEY: 'k' }, /neither .*USER_ID nor .*GROUP_ID/],
    [{ ROBLOX_API_KEY: 'k', ROBLOX_CREATOR_USER_ID: '1', ROBLOX_CREATOR_GROUP_ID: '2' }, /exactly one/],
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
