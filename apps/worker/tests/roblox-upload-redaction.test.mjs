/**
 * THE PROVIDER'S ERROR BODY IS RETURNED VERBATIM — AND A PROVIDER'S 401 QUOTES THE KEY IT REFUSED.
 *
 * `uploadAsset` returns Roblox's body as it came, truncated to 400 characters, and that is the
 * right decision: a generic "upload failed" hides the one sentence that says whether the key lacks
 * a scope, the creator id is wrong, or the file itself was rejected. The problem is where that
 * string then goes — into an import result, a tool row, a log, and from there into a model's
 * context — while Open Cloud error bodies routinely echo the credential back:
 *
 *     {"code":"UNAUTHENTICATED","message":"Invalid API Key: xoxb-…"}
 *
 * `net-policy.ts` already guards exactly this for every other outbound call, in exactly this way,
 * and this path — the only one that carries a CUSTOMER'S OWN key — was the one that did not.
 *
 * THE ORDER IS THE TEST. Redact, then truncate. Truncating first leaves the head of a key inside
 * the excerpt and pushes the placeholder past the cut, which looks redacted and is not.
 *
 * Run with:  node --test tests/roblox-upload-redaction.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { uploadAsset, pollOperation } from '../src/roblox-upload.ts';

const KEY = 'gk_live_3f9a1c02b7e4d85610fa93c7_8b24e70d1af653c9d02e84b7f16a3c59de07481b25fa6c93';

/** A deployment authorised to upload into account 4242 — see `preflight`. */
const env = {
  ROBLOX_API_KEY: KEY,
  ROBLOX_CREATOR_USER_ID: '4242',
  ROBLOX_UPLOAD_AUTHORISED_FOR: '4242',
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).buffer;
const input = { file: png, contentType: 'image/png', displayName: 'Torch', description: 'a torch', type: 'Image' };

const answering = (status, body) => async () => new Response(body, { status, headers: { 'content-type': 'application/json' } });

test('A 401 THAT QUOTES THE KEY DOES NOT CARRY THE KEY OUT OF THIS MODULE', async () => {
  const res = await uploadAsset(env, input, answering(401, JSON.stringify({ code: 'UNAUTHENTICATED', message: `Invalid API Key: ${KEY}` })));
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(res.error.includes(KEY), false, 'the customer\'s own Open Cloud key must not survive into an error string');
  assert.match(res.error, /redacted/, 'and the reader must be told something was removed');
});

test('and the diagnosis survives the redaction — that is why the body is quoted at all', () => {
  // The whole reason this path returns the body verbatim: three different causes that need three
  // different actions. Redacting must not flatten them into "upload failed".
  return uploadAsset(env, input, answering(403, JSON.stringify({ message: 'Insufficient scope: asset:write required' })))
    .then((res) => {
      assert.match(res.error, /asset:write/, 'the scope that is missing is the whole answer');
      assert.equal(res.error.includes('redacted'), false, 'nothing to redact means nothing removed');
    });
});

test('THE ORDER IS REDACT THEN TRUNCATE, or the cut hides the placeholder and keeps the head', async () => {
  // A long body with the key starting at ~345 characters, so a 400-character cut applied FIRST
  // leaves 50-odd characters of it — a real leak that looks like a tidy truncation. Measured: with
  // the padding at 380 this assertion passed against the unredacted code, because the cut happened
  // to land inside the first 24 characters. A test that cannot fail is not a test.
  const padding = 'x'.repeat(340);
  const res = await uploadAsset(env, input, answering(401, `${padding} key=${KEY} trailing`));
  assert.equal(res.error.includes(KEY.slice(0, 24)), false, 'not even the head of the key may survive the cut');
  assert.ok(res.error.length <= 400, `the 400-character cap still holds, got ${res.error.length}`);
});

test('the same is true of the operation poll, which reads the same provider', async () => {
  const res = await pollOperation(env, 'op-1', answering(401, `{"message":"Invalid API Key: ${KEY}"}`));
  assert.equal(res.ok, false);
  assert.equal(res.error.includes(KEY), false, 'the poll returns a provider body too, and it is the same key');
});

test('CONTROL: an upload that Roblox accepts still works', async () => {
  const res = await uploadAsset(
    env,
    input,
    answering(200, JSON.stringify({ path: 'operations/abc', done: true, response: { assetId: '7' } })),
  );
  assert.equal(res.ok, true, `a healthy upload must not have been broken by the redaction: ${JSON.stringify(res)}`);
});
