import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { d1 } from './stubs/d1.mjs';
const worker = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ai-route-contract-'));
writeFileSync(join(dir, 'entry.ts'), `export { Hono } from ${JSON.stringify(join(worker, 'node_modules/hono/dist/index.js'))};
export { aiConnectionRoutes } from ${JSON.stringify(join(worker, 'src/ai-connection-routes.ts'))};`);
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(dir, 'entry.ts'), '--bundle', '--format=esm',
  `--outfile=${join(dir, 'routes.mjs')}`], { stdio: 'pipe' });
const { Hono, aiConnectionRoutes } = await import(`file://${join(dir, 'routes.mjs')}`);
after(() => rmSync(dir, { recursive: true, force: true }));
function harness() {
  const database = d1(); after(() => database.close());
  const prefs = new Map();
  const env = { CORPUS: database.CORPUS, AI_BYOK_ENABLED: 'true', AI_CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64'),
    KV: { get: async (key) => prefs.get(key) ?? null, put: async (key, value) => prefs.set(key, value) } };
  const app = new Hono(); app.use('*', async (c, next) => {
    const userId = c.req.header('x-fixture-user'); if (userId) c.set('user', { userId }); await next();
  }); app.route('/ai', aiConnectionRoutes);
  const request = async (path, method = 'GET', body, user = 'owner') => {
    const response = await app.request(`/ai${path}`, { method, headers: { 'x-fixture-user': user, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env);
    assert.equal(response.headers.get('Cache-Control'), user ? 'private, no-store' : null);
    return { status: response.status, body: await response.json() };
  };
  return { env, request, prefs };
}
const credentials = { apiKey: 'fixture-api-private-key' };
test('HTTP CRUD and preferences never reveal credentials or cross user boundaries', async () => {
  const h = harness();
  assert.equal((await h.request('/connections', 'GET', undefined, '')).status, 401);
  const created = await h.request('/connections', 'POST', { provider: 'groq', name: 'Personal', credentials });
  assert.equal(created.status, 201); const id = created.body.connection.id;
  assert.equal(JSON.stringify(created.body).includes(credentials.apiKey), false);
  for (const path of [`/connections/${id}/models`, `/connections/${id}/check`, `/connections/${id}/capabilities`]) {
    const method = path.endsWith('/models') ? 'GET' : 'POST';
    assert.equal((await h.request(path, method, method === 'POST' ? { modelId: 'fixture' } : undefined, 'foreign')).status, 404);
  }
  assert.equal((await h.request(`/connections/${id}`, 'PUT', { name: 'Hijack', credentials }, 'foreign')).status, 404);
  assert.equal((await h.request(`/connections/${id}`, 'DELETE', undefined, 'foreign')).status, 404);
  const selection = { route: 'byok', provider: 'groq', connectionId: id, modelId: 'fixture' };
  assert.equal((await h.request('/selection', 'PUT', { selection }, 'foreign')).status, 404);
  assert.equal((await h.request('/selection', 'PUT', { selection })).status, 200);
  assert.deepEqual((await h.request('/selection')).body.selection, selection);
  assert.deepEqual((await h.request('/selection', 'GET', undefined, 'foreign')).body.selection, { route: 'studpilot' });
  assert.equal(JSON.stringify([...h.prefs.values()]).includes(credentials.apiKey), false);
  h.env.AI_BYOK_ENABLED = 'false';
  assert.equal((await h.request('/connections', 'POST', { provider: 'groq', name: 'Disabled', credentials })).status, 503);
  assert.equal((await h.request(`/connections/${id}/models/refresh`, 'POST', {})).status, 503);
  assert.equal((await h.request('/connections')).status, 200);
  assert.equal((await h.request(`/connections/${id}`, 'DELETE')).status, 200);
});

test('catalog load is separate from real inference and invalid native tool parameters cannot pass verification', async () => {
  const h = harness(); const created = await h.request('/connections', 'POST', { provider: 'groq', name: 'Personal', credentials });
  const id = created.body.connection.id; const original = globalThis.fetch;
  let response = { choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: { prompt_tokens: 12, completion_tokens: 2 } };
  globalThis.fetch = async (url) => url.endsWith('/models') ? Response.json({ data: [{ id: 'fixture', owned_by: 'Groq', active: true }] }) : Response.json(response);
  try {
    const catalog = await h.request(`/connections/${id}/models/refresh`, 'POST', {});
    assert.equal(catalog.status, 200); assert.equal(catalog.body.inferenceVerified, false);
    assert.equal((await h.request(`/connections/${id}/check`, 'POST', { modelId: 'fixture' })).body.verified, true);
    response = { choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [
      { id: 'c1', type: 'function', function: { name: 'probe_result', arguments: '{"ok":true,"unexpected":"value"}' } } ] } }],
      usage: { prompt_tokens: 20, completion_tokens: 10 } };
    assert.equal((await h.request(`/connections/${id}/capabilities`, 'POST', { modelId: 'fixture' })).body.tools, false);
    response.choices[0].message.tool_calls[0].function.arguments = '{"ok":true}';
    assert.equal((await h.request(`/connections/${id}/capabilities`, 'POST', { modelId: 'fixture' })).body.tools, true);
    const model = (await h.request(`/connections/${id}/models`)).body.catalog.models[0];
    assert.equal(model.quality.tools.attempts, 2); assert.equal(model.quality.tools.passed, 1);
    assert.equal(model.verification.tools.passed, true); assert.ok(model.quality.tools.medianLatencyMs >= 0);
    assert.equal(JSON.stringify(model).includes(credentials.apiKey), false);
  } finally { globalThis.fetch = original; }
});
