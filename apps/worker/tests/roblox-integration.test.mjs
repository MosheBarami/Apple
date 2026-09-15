/**
 * CONNECTING A ROBLOX ACCOUNT LEAVES A TRACE, AND A CONNECTED KEY CAN BE ASKED IF IT STILL WORKS.
 *
 * Two holes, both of the same shape: the product knew something and told nobody.
 *
 *   1. NO RECORD. Minting, rotating and revoking an Apple API key each fired a `securityNotice`.
 *      Attaching a credential that can create things in somebody's real Roblox account — the most
 *      consequential control in the settings page, and the one that exists because 299 assets were
 *      uploaded into one person's account — fired nothing at all. The account history could tell
 *      you about a key that talks to Apple and not about a key that talks to Roblox.
 *
 *   2. NO HEALTH. Roblox expires Open Cloud keys, and a person can revoke one from
 *      create.roblox.com without Apple being told. The stored row does not change, the settings
 *      page keeps saying "Connected", and the first symptom is a build dying with an upstream 401.
 *
 * WHAT THESE ASSERT, AND THE ORDER MATTERS. The check's three verdicts are the point: `ok` must be
 * reachable ONLY from a live answer, `rejected` only from Roblox refusing the key, and everything
 * else — unreachable provider, a 403, a key that never declared the scope the probe needs — must
 * land on `unknown` WITH ITS REASON. A health check that renders "ok" when it could not observe
 * anything is a failure to observe wearing the clothes of an observation, and it is worse than no
 * health check at all: it converts a dead credential into a reassurance.
 *
 * End to end over HTTP against a real SQLite, in the style of security-events.test.mjs, because a
 * notice asserted by reading index.ts's source is satisfied by a comment.
 *
 * Run with:  node --test tests/roblox-integration.test.mjs      (from apps/worker)
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
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const TMP = mkdtempSync(join(tmpdir(), 'golem-roblox-integration-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(
  ESBUILD,
  [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.roblox-integration.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '11279664020';
const API_KEY = 'OpenCloudKeyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'roblox-test', alg: 'ES256', use: 'sig' };
const OWNER_JWT = await new jose.SignJWT({ email: 'owner@golem.test', role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'roblox-test' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(OWNER_ID)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

/**
 * What Roblox will answer, and what it was ASKED — the request is recorded so the header can be
 * asserted. A probe that forgot `x-api-key` would get a 401 from the real Roblox and this file
 * would cheerfully report "rejected: it was revoked", which is a wrong diagnosis produced by a
 * correct-looking test.
 */
let roblox = { status: 200, body: { path: 'users/11279664020', displayName: 'Builderman' } };
let robloxCalls = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  if (url.includes('/rest/v1/profiles')) return json([{ id: OWNER_ID, plan: 'free', is_admin: false, display_name: 'owner' }]);
  if (url.includes('apis.roblox.com')) {
    robloxCalls.push({ url, headers: init?.headers ?? {} });
    if (roblox.throws) throw new Error(roblox.throws);
    return json(roblox.body ?? {}, roblox.status);
  }
  return json([]);
};

function doNamespace() {
  return {
    idFromName: (n) => ({ toString: () => n }),
    idFromString: (n) => ({ toString: () => n }),
    get: () => ({ async fetch() { return new Response(JSON.stringify({ ok: true }), { status: 200 }); } }),
  };
}

let db = d1();

const env = () => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  // 32 bytes, base64 — without it the credential module refuses to store anything, which is its
  // own tested property and not the subject here.
  CREDENTIAL_KEY: Buffer.alloc(32, 7).toString('base64'),
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  AI: { run: async () => ({ choices: [{ message: { content: '{}' } }] }) },
  CORPUS: db.CORPUS,
  VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
  SESSION_DO: doNamespace(),
  QUOTA_DO: doNamespace(),
  PAIRING_DO: doNamespace(),
  ADMIN_DO: doNamespace(),
  BUDGET_DO: doNamespace(),
});

async function call(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${OWNER_JWT}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    env(),
  );
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json: parsed, text };
}

const connect = (scopes) =>
  call('/api/me/roblox-key', {
    method: 'PUT',
    body: { apiKey: API_KEY, robloxCreatorId: CREATOR_ID, creatorType: 'user', scopes },
  });

const securityRows = async () => {
  const r = await call('/api/notifications');
  assert.equal(r.status, 200, r.text);
  return r.json.items.filter((i) => i.kind === 'security_event');
};

// ---------------------------------------------------------------------------------- the record

test('CONTROL: an account with no Roblox key has no history and nothing to check', async () => {
  // Without this every assertion below could pass on a harness that cannot see rows at all — the
  // empty-parser failure, which reports success loudest.
  assert.deepEqual(await securityRows(), []);
  const r = await call('/api/me/roblox-key/check');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { status: 'none' }, 'nothing connected is its own answer, not "ok"');
});

test('CONNECTING A ROBLOX ACCOUNT IS WRITTEN INTO THE ACCOUNT HISTORY', async () => {
  const r = await connect(['asset:write', 'user.social:read']);
  assert.equal(r.status, 200, r.text);

  const rows = await securityRows();
  assert.equal(rows.length, 1, 'exactly one notice for one connection');
  const [notice] = rows;
  assert.match(notice.title, /Roblox account was connected/i);
  assert.ok(
    `${notice.title} ${notice.body}`.includes(CREATOR_ID),
    'the notice must name WHICH account — "a Roblox account was connected" cannot be checked against what the owner expected',
  );
  assert.equal(notice.body.includes(API_KEY), false, 'THE KEY IS NEVER IN THE NOTICE');
  assert.match(notice.body, /ending 6789/, 'the last four are how a person recognises which key this was');
  assert.match(notice.body, /asset:write/, 'and what it was allowed to do, which is the part worth disputing');
});

test('and the notice does not claim the key is gone from Roblox when it is not', async () => {
  // The one sentence people get wrong: disconnecting here removes Apple's ability to act and
  // leaves the key alive on Roblox. A notice implying otherwise would leave a live key nobody
  // goes back to revoke.
  const r = await call('/api/me/roblox-key', { method: 'DELETE' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.removed, true);

  const rows = await securityRows();
  const off = rows.find((n) => /disconnected/i.test(n.title));
  assert.ok(off, 'disconnecting must be recorded too — it is the line that matters after a takeover');
  assert.ok(off.body.includes(CREATOR_ID), 'and it must name the account it no longer reaches');
  assert.match(off.body, /still works on\s+Roblox until you revoke it/i);
});

test('a disconnect that removed nothing records nothing — an empty act is not an event', async () => {
  const before = (await securityRows()).length;
  const r = await call('/api/me/roblox-key', { method: 'DELETE' });
  assert.equal(r.json.removed, false);
  assert.equal((await securityRows()).length, before, 'a no-op must not write history');
});

// ----------------------------------------------------------------------------------- the health

test('A KEY THAT ROBLOX ACCEPTS READS AS ok, AND ONLY FROM A LIVE ANSWER', async () => {
  await connect(['asset:write', 'user.social:read']);
  robloxCalls = [];
  roblox = { status: 200, body: { path: `users/${CREATOR_ID}`, displayName: 'Builderman' } };

  const r = await call('/api/me/roblox-key/check');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.accountName, 'Builderman', 'the name is what makes the sentence about a person');
  assert.equal(robloxCalls.length, 1, 'ok must come from an actual call to Roblox, not from the row');
  assert.ok(robloxCalls[0].url.includes(CREATOR_ID));
  assert.equal(robloxCalls[0].headers['x-api-key'], API_KEY, 'the probe must present the stored key, or its 401 means nothing');
});

test('ROBLOX REFUSING THE KEY IS "rejected" — the state the panel can recover from', async () => {
  roblox = { status: 401, body: { message: 'Invalid API Key' } };
  const r = await call('/api/me/roblox-key/check');
  assert.equal(r.json.status, 'rejected');
  assert.match(r.json.reason, /revoked or it expired/i);
});

test('A CHECK THAT COULD NOT BE MADE SAYS SO — it never reads as ok', async () => {
  // Every one of these is a DIFFERENT reason the answer is unknown, and each has to survive as
  // its own sentence: telling somebody their key expired because Roblox was down sends them to
  // create a key they did not need.
  roblox = { throws: 'connect ETIMEDOUT' };
  const down = await call('/api/me/roblox-key/check');
  assert.equal(down.json.status, 'unknown');
  assert.match(down.json.reason, /could not reach Roblox/i);
  assert.match(down.json.reason, /key was not changed/i);

  roblox = { status: 403, body: { message: 'Forbidden' } };
  const forbidden = await call('/api/me/roblox-key/check');
  assert.equal(forbidden.json.status, 'unknown');
  assert.match(forbidden.json.reason, /403/);

  roblox = { status: 500, body: { message: 'oops' } };
  const broken = await call('/api/me/roblox-key/check');
  assert.equal(broken.json.status, 'unknown');
  assert.match(broken.json.reason, /500/);
});

test('A KEY WITHOUT THE PROBE\'S SCOPE IS NOT PROBED — consent is not borrowed to reassure', async () => {
  // The alternative is worse than it looks: using a credential for a call its owner never ticked,
  // in order to tell them their credential is safe.
  await call('/api/me/roblox-key', { method: 'DELETE' });
  await connect(['asset:write']);
  robloxCalls = [];
  roblox = { status: 200, body: { displayName: 'Builderman' } };

  const r = await call('/api/me/roblox-key/check');
  assert.equal(r.json.status, 'unknown');
  assert.match(r.json.reason, /Read your public profile/i);
  assert.equal(robloxCalls.length, 0, 'NOTHING may be sent to Roblox with a key that was not declared for it');
});

test('the check is private to the person whose key it is', async () => {
  const res = await APP.fetch(new Request('https://golem.test/api/me/roblox-key/check'), env());
  assert.equal(res.status, 401, 'no token, no answer about somebody else\'s credential');
});
