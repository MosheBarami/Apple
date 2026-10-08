import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { d1 } from './stubs/d1.mjs';
const worker = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'inference-routing-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, ['inference-router', 'inference-runs', 'inference-health', 'gateway', 'ai-connections'].map((name) =>
  `export * from ${JSON.stringify(join(worker, 'src', name + '.ts'))};`).join('\n'));
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', `--outfile=${join(dir, 'inference.mjs')}`], { stdio: 'pipe' });
const R = await import(`file://${join(dir, 'inference.mjs')}`);
after(() => rmSync(dir, { recursive: true, force: true }));
const connectionId = '12345678-1234-1234-1234-123456789abc';
const selection = { route: 'byok', provider: 'huggingface', connectionId, modelId: 'exact-model:host' };
const model = { provider: 'huggingface', producer: 'Publisher', id: selection.modelId, name: 'Exact model', protocol: 'chat-completions',
  lifecycle: 'active', contextWindow: 100000, maxOutput: 10000, inputCostPer1M: 0.2, outputCostPer1M: 0.5,
  capabilities: { tools: true, structuredOutput: true, text: true }, source: 'https://huggingface.co/docs/inference-providers/index',
  checkedAt: '2026-10-08', access: 'listed', runtimeCheckedAt: null };
const candidate = { route: 'byok', connectionId, model, catalogVersion: 'v1', available: true, privacy: 'unknown' };
const requirements = { task: 'tools', inputTokens: 1000, outputTokens: 1000, tools: true, structuredOutput: true,
  features: { blocks: 0, dependencies: 0, unresolvedFields: 0, failedChecks: 0, customCode: false } };

for (const [complexity, features] of [['simple', {}], ['medium', { customCode: true }], ['complex', { failedChecks: 2 }]]) {
  test(`structural ${complexity} task produces a versioned operational decision`, () => {
    const { decision } = R.routeInference(selection, { ...requirements, features: { ...requirements.features, ...features } }, [candidate]);
    assert.equal(decision.complexity, complexity); assert.equal(decision.modelId, model.id);
    assert.equal(decision.connectionId, connectionId); assert.equal(decision.catalogVersion, 'v1');
    assert.equal(decision.policyVersion, 'routing-1'); assert.match(decision.reason, /you selected/);
  });
}

test('manual BYOK selection cannot silently choose another connection/model or the managed route', () => {
  for (const altered of [{ ...candidate, connectionId: 'another' }, { ...candidate, route: 'studpilot' },
    { ...candidate, model: { ...model, id: 'another-model' } }]) assert.throws(() => R.routeInference(selection, requirements, [altered]), /No model/);
});

for (const [why, altered] of [['unavailable', { available: false }], ['rate limited', { rateLimitedUntil: Date.now() + 10000 }],
  ['circuit open', { circuitOpenUntil: Date.now() + 10000 }], ['retired', { model: { ...model, lifecycle: 'retired' } }],
  ['unknown tool capability', { model: { ...model, capabilities: { ...model.capabilities, tools: null } } }],
  ['context too small', { model: { ...model, contextWindow: 10 } }]]) {
  test(`router filters ${why} before scoring`, () => {
    assert.throws(() => R.routeInference(selection, requirements, [{ ...candidate, ...altered,
      measurements: { tools: { attempts: 10, passed: 10, medianLatencyMs: 1 } } }]), /No model/);
  });
}

test('auto BYOK is opt-in, restricted to approved connections, and ranks measured task results', () => {
  const alternateId = '12345678-1234-1234-1234-123456789def';
  const alternate = { ...candidate, connectionId: alternateId, model: { ...model, id: 'other' },
    measurements: { tools: { attempts: 10, passed: 10, medianLatencyMs: 500 } } };
  const opted = { ...selection, autoRouting: { enabled: true, allowedConnectionIds: [connectionId] } };
  assert.equal(R.routeInference(opted, requirements, [candidate, alternate]).candidate.connectionId, connectionId);
  assert.equal(R.routeInference({ ...opted, autoRouting: { enabled: true, allowedConnectionIds: [connectionId, alternateId] } }, requirements,
    [candidate, alternate]).candidate.connectionId, alternateId);
});

test('OpenCode Free requires free runtime, service-use and privacy proof, never a paid fallback', () => {
  const free = { ...candidate, route: 'opencode-free', connectionId: null, freeVerified: true, serviceUseAllowed: true,
    privacy: 'training', model: { ...model, provider: 'opencode', inputCostPer1M: 0, outputCostPer1M: 0 } };
  const choice = { route: 'opencode-free' };
  assert.throws(() => R.routeInference(choice, requirements, [free]), /training consent/);
  assert.equal(R.routeInference(choice, { ...requirements, allowTraining: true }, [free]).decision.provider, 'opencode');
  assert.throws(() => R.routeInference(choice, { ...requirements, allowTraining: true }, [{ ...free, serviceUseAllowed: false }]), /No model/);
  assert.throws(() => R.routeInference(choice, { ...requirements, allowTraining: true }, [{ ...free, model: { ...free.model, inputCostPer1M: 0.1 } }]), /No model/);
});

async function connectedEnv() {
  const database = d1(), { CORPUS } = database; let platformCalls = 0;
  after(() => database.close());
  const env = { CORPUS, AI_BYOK_ENABLED: 'true', AI_CREDENTIAL_KEY: Buffer.alloc(32, 3).toString('base64'),
    AI: { run: async () => { platformCalls++; throw new Error('Platform fallback must never run'); } },
    KV: { get: async () => null }, BUDGET_DO: { idFromName: () => 'one', get: () => ({ fetch: async () => Response.json({ killed: false }) }) } };
  const connection = await R.createAiConnection(env, 'owner', 'huggingface', 'Private', { apiKey: 'test-secret-key' });
  const catalog = { provider: 'huggingface', version: 'v1', checkedAt: '2026-10-08', models: [model] };
  await R.updateAiConnectionCheck(env, 'owner', connection.id, 1, 'catalog_loaded', catalog, 'v1');
  const selected = { ...selection, connectionId: connection.id };
  return { env, selected, connection, platformCalls: () => platformCalls };
}

test('gateway sends the selected private provider and model, reports usage, and charges no platform inference neurons', async () => {
  const h = await connectedEnv(), pinned = await R.pinRunInference(h.env, 'owner', h.selected, 'p1');
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(url, 'https://router.huggingface.co/v1/chat/completions');
    assert.equal(JSON.parse(init.body).model, selection.modelId); assert.equal(init.headers.Authorization, 'Bearer test-secret-key');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: { prompt_tokens: 12, completion_tokens: 2 } });
  };
  try {
    const result = await R.chat(h.env, { model: 'agent', messages: [{ role: 'user', content: 'OK' }], maxTokens: 100 },
      { inference: pinned, actorId: 'owner', projectId: 'p1', runId: 'run1', requestId: 'call1' });
    assert.equal(result.neurons, 0); assert.equal(result.provider, 'huggingface'); assert.equal(result.model, model.id);
    assert.equal(result.usage.inputTokens, 12); assert.equal(calls, 1); assert.equal(h.platformCalls(), 0);
  } finally { globalThis.fetch = original; }
});

test('foreign credentials, revoked/replaced keys and mismatched actor identities fail before inference', async () => {
  const h = await connectedEnv();
  await assert.rejects(R.pinRunInference(h.env, 'someone-else', h.selected, 'p1'), /no longer available/);
  const pinned = await R.pinRunInference(h.env, 'owner', h.selected, 'p1');
  const req = { model: 'agent', messages: [{ role: 'user', content: 'OK' }], maxTokens: 100 };
  await assert.rejects(R.chat(h.env, req, { inference: pinned, actorId: 'other', runId: 'r', requestId: 'c', projectId: 'p1' }), /identity/);
  await R.replaceAiConnection(h.env, 'owner', h.connection.id, 'Replacement', { apiKey: 'new-secret-key' });
  await assert.rejects(R.chat(h.env, req, { inference: pinned, actorId: 'owner', runId: 'r', requestId: 'c', projectId: 'p1' }), /removed or replaced/);
  assert.equal(h.platformCalls(), 0);
});

test('a failed personal call cannot spend the platform key or replay Studio operations', async () => {
  const h = await connectedEnv(), pinned = await R.pinRunInference(h.env, 'owner', h.selected, 'p1');
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('untrusted private response', { status: 401 }); };
  try {
    await assert.rejects(R.chat(h.env, { model: 'agent', messages: [{ role: 'user', content: 'OK' }], maxTokens: 100 },
      { inference: pinned, actorId: 'owner', projectId: 'p1', runId: 'r', requestId: 'c' }), (error) => error.code === 'auth');
    assert.equal(calls, 1); assert.equal(h.platformCalls(), 0);
  } finally { globalThis.fetch = original; }
});

test('a key replaced while inference is pending discards output before any text callback', async () => {
  const h = await connectedEnv(), pinned = await R.pinRunInference(h.env, 'owner', h.selected, 'p1');
  const original = globalThis.fetch; let published = '';
  globalThis.fetch = async () => {
    await R.replaceAiConnection(h.env, 'owner', h.connection.id, 'Replacement', { apiKey: 'new-secret-key' });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Discard this old-key result' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 } });
  };
  try {
    await assert.rejects(R.chat(h.env, { model: 'agent', messages: [{ role: 'user', content: 'OK' }], maxTokens: 100 },
      { inference: pinned, actorId: 'owner', projectId: 'p1', runId: 'r', requestId: 'c', onText: (text) => { published += text; } }), /result was discarded/);
    assert.equal(published, ''); assert.equal(h.platformCalls(), 0);
  } finally { globalThis.fetch = original; }
});

test('rollout switches default off and disable a previously pinned run before provider invocation', async () => {
  const h = await connectedEnv();
  delete h.env.AI_BYOK_ENABLED;
  await assert.rejects(R.pinRunInference(h.env, 'owner', h.selected, 'p1'), /not enabled/);
  h.env.AI_BYOK_ENABLED = 'true';
  const pinned = await R.pinRunInference(h.env, 'owner', h.selected, 'p1');
  h.env.AI_BYOK_ENABLED = 'false';
  let calls = 0; const original = globalThis.fetch; globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  try {
    await assert.rejects(R.chat(h.env, { model: 'agent', messages: [{ role: 'user', content: 'OK' }] },
      { inference: pinned, actorId: 'owner', projectId: 'p1', runId: 'r', requestId: 'c' }), /not enabled/);
    assert.equal(calls, 0); assert.equal(h.platformCalls(), 0);
  } finally { globalThis.fetch = original; }
});

test('persisted model Retry-After remains authoritative even in a fresh worker isolate', () => {
  const future = new Date(Date.now() + 120000).toISOString();
  const restored = R.routeHealth('fresh-actor', { ...candidate, model: { ...model,
    availability: { kind: 'rate_limited', checkedAt: new Date().toISOString(), retryAt: future } } });
  assert.throws(() => R.routeInference(selection, requirements, [restored]), /temporarily unavailable/);
});
