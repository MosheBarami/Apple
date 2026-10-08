import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signRunnerRequest, verifyRunnerRequest } from '../../packages/shared/src/runner-auth.ts';
import { createRunnerService } from './service.mjs';
import { InferenceQueue } from './queue.mjs';
const signingKey = Buffer.alloc(32, 7).toString('base64');
const clock = 1791462000000;
const model = { id: 'verified-free', name: 'Fixture', cost: { input: 0, output: 0 },
  api: { id: 'verified-free', url: 'https://opencode.ai/zen/v1', npm: '@ai-sdk/openai-compatible' },
  limit: { context: 32000, output: 6500 }, capabilities: { input: { text: true }, output: { text: true } } };
const catalog = { version: 'fixture-v1', checkedAt: new Date(clock).toISOString(), models: [model] };
const review = { modelId: model.id, source: 'https://opencode.ai/docs/zen/', checkedAt: catalog.checkedAt,
  serviceUseAllowed: true, runtimeVerified: true, dataUse: 'zero-retention' };
const input = { actorId: 'user-1', runId: 'run-1', requestId: 'req-1', modelId: model.id,
  catalogVersion: catalog.version, input: 'OK', instructions: 'Return JSON.', maxTokens: 400 };
async function signed(path, data, options = {}) {
  const method = options.method ?? (data ? 'POST' : 'GET'), body = data ? JSON.stringify(data) : '';
  const headers = await signRunnerRequest(signingKey, method, path, body, clock);
  return new Request(`http://runner${path}`, { method, headers, ...(body ? { body } : {}), signal: options.signal });
}
function service(options = {}) { return createRunnerService({ executable: '/fixture', signingKey,
  now: () => clock, discover: async () => structuredClone(catalog), reviews: [review],
  invoke: async () => ({ text: 'OK', cost: 0 }), ...options }); }

test('signature binds body, method, path, nonce and expiry', async () => {
  const headers = new Headers(await signRunnerRequest(signingKey, 'POST', '/v1/infer', '{}', clock));
  assert.ok(await verifyRunnerRequest(signingKey, 'POST', '/v1/infer', '{}', headers, clock));
  for (const [method, path, body, at] of [['GET', '/v1/infer', '{}', clock], ['POST', '/other', '{}', clock],
    ['POST', '/v1/infer', '{"changed":1}', clock], ['POST', '/v1/infer', '{}', clock + 61000]]) {
    assert.equal(await verifyRunnerRequest(signingKey, method, path, body, headers, at), null);
  }
});

test('unsigned calls and replayed signatures are rejected before discovery or inference', async () => {
  const runner = service();
  assert.equal((await runner.fetch(new Request('http://runner/v1/models'))).status, 401);
  const request = await signed('/v1/models');
  assert.equal((await runner.fetch(request.clone())).status, 200);
  assert.equal((await runner.fetch(request.clone())).status, 409);
});

test('catalog presence is not readiness: runtime and service-use reviews are required', async () => {
  const runner = service({ reviews: [] }); await runner.refresh();
  const health = await runner.fetch(await signed('/v1/health'));
  assert.equal(health.status, 503); assert.equal((await health.json()).ready, false);
  const models = await (await runner.fetch(await signed('/v1/models'))).json();
  assert.equal(models.models[0].available, false);
  assert.equal((await runner.fetch(await signed('/v1/infer', input))).status, 422);
});

test('private requests cannot use a training model without explicit selection consent', async () => {
  let calls = 0;
  const runner = service({ reviews: [{ ...review, dataUse: 'training' }], invoke: async () => { calls++; return { text: 'OK' }; } });
  await runner.refresh();
  assert.equal((await runner.fetch(await signed('/v1/infer', input))).status, 422);
  assert.equal(calls, 0);
  assert.equal((await runner.fetch(await signed('/v1/infer', { ...input, allowTraining: true }))).status, 200);
});

test('same request is executed once and replays fresh response bodies, including concurrent reconnects', async () => {
  let calls = 0;
  const runner = service({ invoke: async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return { text: 'OK' }; } });
  await runner.refresh();
  const [first, second] = await Promise.all([runner.fetch(await signed('/v1/infer', input)), runner.fetch(await signed('/v1/infer', input))]);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal((await (await runner.fetch(await signed('/v1/infer', input))).json()).text, 'OK');
  assert.equal(calls, 1);
  assert.equal((await runner.fetch(await signed('/v1/infer', { ...input, input: 'changed' }))).status, 409);
  assert.equal(calls, 1);
});

test('owner/run scoped request ids never replay another tenant\'s inference result', async () => {
  let calls = 0; const runner = service({ invoke: async () => ({ text: String(++calls) }) }); await runner.refresh();
  const first = await (await runner.fetch(await signed('/v1/infer', input))).json();
  const second = await (await runner.fetch(await signed('/v1/infer', { ...input, actorId: 'user-2' }))).json();
  assert.notEqual(first.text, second.text); assert.equal(calls, 2);
});

test('catalog changes cannot silently reroute an admitted request', async () => {
  const runner = service(); await runner.refresh();
  assert.equal((await runner.fetch(await signed('/v1/infer', { ...input, catalogVersion: 'different' }))).status, 409);
  assert.equal((await runner.fetch(await signed('/v1/infer', { ...input, modelId: 'paid' }))).status, 422);
});

test('provider exceptions never leak keys, stderr, input or a raw error message', async () => {
  const runner = service({ invoke: async () => { throw new Error('secret-key and private prompt'); } }); await runner.refresh();
  const response = await runner.fetch(await signed('/v1/infer', input));
  assert.equal(response.status, 502); assert.equal((await response.text()).includes('secret-key'), false);
});

test('bounded queue rejects overload and removes cancelled queued work without invoking it', async () => {
  const queue = new InferenceQueue({ concurrency: 1, capacity: 1 });
  let release, calls = 0;
  const active = queue.submit(() => new Promise((r) => { release = r; }));
  await Promise.resolve();
  const controller = new AbortController();
  const waiting = queue.submit(async () => { calls++; }, controller.signal);
  await assert.rejects(queue.submit(async () => {}), (e) => e.code === 'queue_full');
  controller.abort(); await assert.rejects(waiting, (e) => e.code === 'cancelled');
  release(); await active; assert.equal(calls, 0);
});

test('refresh is bounded, malformed input fails, and no key is present in catalog output', async () => {
  const runner = service(); await runner.refresh();
  assert.equal((await runner.fetch(await signed('/v1/models/refresh', {}))).status, 429);
  assert.equal((await runner.fetch(await signed('/v1/infer', []))).status, 400);
  const response = await runner.fetch(await signed('/v1/models'));
  assert.equal((await response.text()).includes(signingKey), false);
});
