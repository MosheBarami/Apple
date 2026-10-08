import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ai-connections-'));
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, 'src/ai-connections.ts'),
  '--bundle', '--format=esm', `--outfile=${join(dir, 'connections.mjs')}`], { stdio: 'pipe' });
const C = await import(`file://${join(dir, 'connections.mjs')}`);
after(() => rmSync(dir, { recursive: true, force: true }));

function environment() {
  const db = new DatabaseSync(':memory:');
  const CORPUS = { prepare(sql) {
    const statement = db.prepare(sql);
    const bound = (args = []) => ({ bind: (...args) => bound(args),
      async run() { return { success: true, meta: { changes: statement.run(...args).changes } }; },
      async all() { return { results: statement.all(...args) }; }, async first() { return statement.get(...args) ?? null; } });
    return bound();
  } };
  return { db, CORPUS, AI_CREDENTIAL_KEY: Buffer.alloc(32, 9).toString('base64') };
}
const credentials = { apiKey: 'test-secret-provider-key' };

test('AES-GCM uses fresh nonces and binds ciphertext to owner, connection and provider', async () => {
  const env = environment();
  const a = await C.sealAiCredentials(env, 'user-a', 'connection-a', 'openai', credentials);
  const b = await C.sealAiCredentials(env, 'user-a', 'connection-a', 'openai', credentials);
  assert.notEqual(a, b); assert.equal(a.includes(credentials.apiKey), false);
  assert.deepEqual(await C.openAiCredentials(env, 'user-a', 'connection-a', 'openai', a), credentials);
  for (const [owner, id, provider] of [['user-b', 'connection-a', 'openai'],
    ['user-a', 'connection-b', 'openai'], ['user-a', 'connection-a', 'anthropic']]) {
    await assert.rejects(C.openAiCredentials(env, owner, id, provider, a), /cannot be decrypted/);
  }
  const [version, iv, ciphertext] = a.split('.');
  const bytes = Buffer.from(ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(C.openAiCredentials(env, 'user-a', 'connection-a', 'openai',
    `${version}.${iv}.${bytes.toString('base64')}`), /cannot be decrypted/);
  env.db.close();
});

test('multiple connections per provider stay isolated across every CRUD operation', async () => {
  const env = environment();
  const a = await C.createAiConnection(env, 'user-a', 'openai', 'Personal', credentials);
  const b = await C.createAiConnection(env, 'user-a', 'openai', 'Work', { apiKey: 'second-secret-value' });
  await C.createAiConnection(env, 'user-b', 'openai', 'Other tenant', { apiKey: 'third-secret-value' });
  const views = await C.listAiConnections(env, 'user-a');
  assert.equal(views.length, 2); assert.notEqual(a.id, b.id);
  assert.equal(JSON.stringify(views).includes(credentials.apiKey), false);
  assert.equal(views[0].status, 'unverified'); assert.equal(views[0].hint, '-key');
  assert.equal(await C.getAiConnection(env, 'user-b', a.id), null);
  assert.equal(await C.replaceAiConnection(env, 'user-b', a.id, 'stolen', credentials), null);
  assert.equal(await C.deleteAiConnection(env, 'user-b', a.id), false);
  assert.equal(await C.updateAiConnectionCheck(env, 'user-b', a.id, 1, 'verified'), false);
  const replacement = await C.replaceAiConnection(env, 'user-a', a.id, 'New key', { apiKey: 'replacement-value' });
  assert.equal(replacement.revision, 2); assert.equal(replacement.status, 'unverified');
  assert.deepEqual((await C.getAiConnection(env, 'user-a', a.id)).credentials, { apiKey: 'replacement-value' });
  assert.equal(await C.deleteAiConnection(env, 'user-a', a.id), true);
  assert.equal(await C.getAiConnection(env, 'user-a', a.id), null);
  assert.equal((await C.listAiConnections(env, 'user-a')).length, 1);
  env.db.close();
});

test('late verification cannot validate replaced or deleted credentials or retain the old catalog', async () => {
  const env = environment();
  const connection = await C.createAiConnection(env, 'user-a', 'openrouter', 'Router', credentials);
  assert.equal(await C.updateAiConnectionCheck(env, 'user-a', connection.id, 1, 'catalog_loaded', { models: ['old'] }, 'v1'), true);
  await C.replaceAiConnection(env, 'user-a', connection.id, 'Replaced', { apiKey: 'replacement-value' });
  assert.equal(await C.updateAiConnectionCheck(env, 'user-a', connection.id, 1, 'verified', { models: ['old'] }, 'v1'), false);
  const after = await C.getAiConnection(env, 'user-a', connection.id);
  assert.equal(after.view.status, 'unverified'); assert.equal(after.catalog, null); assert.equal(after.view.catalogVersion, null);
  await C.deleteAiConnection(env, 'user-a', connection.id);
  assert.equal(await C.updateAiConnectionCheck(env, 'user-a', connection.id, 2, 'verified'), false);
  env.db.close();
});

test('missing or malformed wrapping key refuses before writing a credential', async () => {
  for (const key of [undefined, Buffer.alloc(16).toString('base64')]) {
    let writes = 0;
    await assert.rejects(C.createAiConnection({ AI_CREDENTIAL_KEY: key, CORPUS: {
      prepare() { writes++; throw new Error('unexpected database write'); } } }, 'user-a', 'openai', 'Key', credentials));
    assert.equal(writes, 0);
  }
});

test('metadata cannot accidentally reveal a short key or accept an endpoint in credentials', async () => {
  for (const value of [{ apiKey: '1234' }, { apiKey: 'line\nsecret' }, { ...credentials, endpoint: 'http://127.0.0.1' },
    { ...credentials, accountId: '../admin' }]) assert.equal(C.validateAiCredentials(value), false);
  assert.equal(C.validateAiCredentials(credentials), true);
  const env = environment();
  await assert.rejects(C.createAiConnection(env, 'user-a', 'openai', credentials.apiKey, credentials), /Invalid/);
  env.db.close();
});
