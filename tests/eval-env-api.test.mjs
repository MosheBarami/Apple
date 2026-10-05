/**
 * scripts/eval/lib/env.mjs and api.mjs: where the admin key comes from, and the promise that it never leaves.
 *
 * Run with:  node --test tests/eval-env-api.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyEnvNames } from '../scripts/lib/env-compat.mjs';
import { ApiError, makeAdminApi } from '../scripts/eval/lib/api.mjs';
import { DEFAULT_API_BASE, loadHarnessEnv, parseEnvFile, redact } from '../scripts/eval/lib/env.mjs';

const KEY = 'sk-very-secret-admin-key-123456';

test('parseEnvFile reads KEY=VALUE lines, quotes and export, and skips comments and junk', () => {
  assert.deepEqual(parseEnvFile('# c\nA=1\nexport B="two words"\nC=\'x\'\n\nnoequals\n=bad\nD=a=b'), { A: '1', B: 'two words', C: 'x', D: 'a=b' });
});

test('the admin key is found under the new name and the older spellings; process.env beats the file', () => {
  // the older spelling is derived through env-compat, which is the one place the old prefixes are written
  const legacy = legacyEnvNames('STUDPILOT_ADMIN_KEY')[0];
  const read = () => `${legacy}=from-the-file\nAPI_BASE=https://stale.example.test\n`;
  const exists = () => true;
  const fromFile = loadHarnessEnv({ envFile: '/x/.env', env: {}, readFile: read, exists });
  assert.equal(fromFile.adminKey, 'from-the-file');
  assert.equal(fromFile.envFile, '/x/.env');
  const fromEnv = loadHarnessEnv({ envFile: '/x/.env', env: { STUDPILOT_ADMIN_KEY: 'from-the-environment' }, readFile: read, exists });
  assert.equal(fromEnv.adminKey, 'from-the-environment');
  const none = loadHarnessEnv({ envFile: '/x/.env', env: {}, readFile: () => '', exists: () => false });
  assert.equal(none.adminKey, '');
  assert.equal(none.envFile, null);
});

test('the API base is the flag, then STUDPILOT_API_BASE, then studpilot.app; the owner .env generic API_BASE is NOT followed', () => {
  const read = () => 'API_BASE=https://stale.example.test\n';
  assert.equal(loadHarnessEnv({ env: {}, readFile: read, exists: () => true }).apiBase, DEFAULT_API_BASE);
  assert.equal(loadHarnessEnv({ env: { STUDPILOT_API_BASE: 'https://staging.test/' }, readFile: read, exists: () => true }).apiBase, 'https://staging.test');
  assert.equal(loadHarnessEnv({ apiBase: 'https://flag.test///', env: { STUDPILOT_API_BASE: 'https://staging.test' }, readFile: read, exists: () => true }).apiBase, 'https://flag.test');
  assert.equal(DEFAULT_API_BASE, 'https://studpilot.app');
});

test('redact removes every occurrence of a secret and ignores empty or short ones', () => {
  assert.equal(redact(`a ${KEY} b ${KEY}`, [KEY]), 'a [redacted] b [redacted]');
  assert.equal(redact('abc', ['']), 'abc');
  assert.equal(redact('abc', ['ab']), 'abc', 'a short string is not treated as a secret');
});

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  f.calls = calls;
  return f;
}
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('admin calls carry the key in X-Admin-Key and the body as JSON; the health call carries no key', async () => {
  const f = fakeFetch(() => reply(200, { ok: true }));
  const api = makeAdminApi({ apiBase: 'https://w.test/', adminKey: KEY, fetchImpl: f });
  await api.setPlan('u', 'free');
  await api.health();
  assert.equal(f.calls[0].url, 'https://w.test/api/admin/set-plan');
  assert.equal(f.calls[0].init.headers['X-Admin-Key'], KEY);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { userId: 'u', plan: 'free' });
  assert.equal(f.calls[1].init.headers['X-Admin-Key'], undefined, 'the public health call must not carry the key');
});

test('an error names the path and status but never the key, even when the server echoes it', async () => {
  const f = fakeFetch(() => reply(500, { error: `bad header ${KEY}` }));
  const api = makeAdminApi({ apiBase: 'https://w.test', adminKey: KEY, fetchImpl: f });
  await assert.rejects(api.spend(), (e) => e instanceof ApiError && e.status === 500 && e.path === '/api/admin/spend' && !e.message.includes(KEY) && /HTTP 500/.test(e.message));
  const boom = fakeFetch(() => { throw new Error(`connect failed for ${KEY}`); });
  await assert.rejects(makeAdminApi({ apiBase: 'https://w.test', adminKey: KEY, fetchImpl: boom }).spend(), (e) => !e.message.includes(KEY));
});

test('a missing key is refused before any request is made', async () => {
  const f = fakeFetch(() => reply(200, {}));
  await assert.rejects(makeAdminApi({ apiBase: 'https://w.test', adminKey: '', fetchImpl: f }).spend(), /no admin key/);
  assert.equal(f.calls.length, 0);
});

test('a hung server times out instead of hanging the harness', async () => {
  const f = fakeFetch((_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' })))));
  await assert.rejects(makeAdminApi({ apiBase: 'https://w.test', adminKey: KEY, fetchImpl: f, timeoutMs: 50 }).spend(), /no answer in 50 ms/);
});

test('the run route returns 409 and 403 to the caller; the pairing route returns its refusals', async () => {
  const f = fakeFetch((url) => (url.includes('agent-run') ? reply(409, { ok: false, error: 'a run is already in progress' }) : reply(403, { error: 'owner mismatch' })));
  const api = makeAdminApi({ apiBase: 'https://w.test', adminKey: KEY, fetchImpl: f });
  assert.equal((await api.agentRun('p', { text: 'x' })).status, 409);
  const minted = await api.mintPairingCode('p', 'u');
  assert.equal(minted.status, 403);
  assert.equal(f.calls[1].url, 'https://w.test/api/admin/pairing/p');
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { userId: 'u' });
});

test('a non-JSON body is an error with a short excerpt, not a crash', async () => {
  const f = fakeFetch(() => reply(502, '<html>bad gateway</html>'));
  await assert.rejects(makeAdminApi({ apiBase: 'https://w.test', adminKey: KEY, fetchImpl: f }).spend(), /HTTP 502 <html>bad gateway/);
});
