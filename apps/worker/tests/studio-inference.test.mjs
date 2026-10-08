import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { d1 } from './stubs/d1.mjs';
const worker = fileURLToPath(new URL('..', import.meta.url)), directory = mkdtempSync(join(tmpdir(), 'ai-studio-contract-'));
const entry = join(directory, 'entry.ts');
writeFileSync(entry, ['studio-inference', 'ai-connections'].map((file) => `export * from ${JSON.stringify(join(worker, 'src', file + '.ts'))};`).join('\n'));
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', `--outfile=${join(directory, 'bridge.mjs')}`], { stdio: 'pipe' });
const B = await import(`file://${join(directory, 'bridge.mjs')}`);
after(() => rmSync(directory, { recursive: true, force: true }));
const project = '12345678-1234-1234-1234-123456789abc';
const raw = { messages: [{ role: 'user', content: 'Call the offered tool.' }], max_completion_tokens: 1024,
  tools: [{ type: 'function', function: { name: 'set_properties', description: 'Change a property',
    parameters: { type: 'object', properties: { name: { type: 'string' } } } } }] };
async function harness() {
  const database = d1(); after(() => database.close());
  const env = { CORPUS: database.CORPUS, AI_CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64'),
    AI_BYOK_ENABLED: 'true', AI_STUDIO_ROUTES_ENABLED: 'true', KV: { get: async () => null },
    BUDGET_DO: { idFromName: () => 'one', get: () => ({ fetch: async () => Response.json({ killed: false }) }) },
    AI: { run: async () => { throw new Error('No private fallback may invoke the platform'); } } };
  const connection = await B.createAiConnection(env, 'owner', 'groq', 'Private', { apiKey: 'fixture-only' });
  const model = { provider: 'groq', producer: 'Qwen', id: 'fixture-model', name: 'Fixture model', protocol: 'chat-completions',
    lifecycle: 'active', contextWindow: 100000, maxOutput: 6500, inputCostPer1M: null, outputCostPer1M: null,
    capabilities: { tools: true, structuredOutput: true, text: true }, checkedAt: '2026-10-08', source: 'https://console.groq.com/docs/api-reference',
    access: 'listed', runtimeCheckedAt: null };
  await B.updateAiConnectionCheck(env, 'owner', connection.id, 1, 'catalog_loaded', { provider: 'groq', version: 'v1', models: [model] }, 'v1');
  const map = new Map(); let pending = Promise.resolve();
  const store = { get: async (key) => map.get(key) ?? null, put: async (key, value) => map.set(key, value),
    create: async (key, value) => { if (!map.has(key)) map.set(key, value); return map.get(key); },
    update: (key, transform) => { const next = pending.then(() => { map.set(key, transform(map.get(key))); }); pending = next.catch(() => {}); return next; } };
  const selection = { route: 'byok', provider: 'groq', connectionId: connection.id, modelId: model.id };
  return { env, store, map, connection, selection };
}
test('Flue boundary accepts native text/tools and refuses binary content and unsupported inputs', () => {
  const request = B.flueGatewayRequest(raw);
  assert.equal(request.tools[0].name, 'set_properties'); assert.equal(request.maxTokens, 1024);
  assert.equal(B.flueGatewayRequest({ ...raw, max_completion_tokens: 99999 }).maxTokens, 6500);
  assert.throws(() => B.flueGatewayRequest({ ...raw, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: {} }] }] }), /binary/);
  assert.throws(() => B.flueGatewayRequest({ ...raw, max_completion_tokens: -1 }), /budget/);
});
test('pinned Studio run uses its own account and emits complete typed Flue SSE; evidence excludes private replay', async () => {
  const h = await harness(), admitted = await B.prepareStudioInference(h.env, h.store, 'owner', project, h.selection);
  await assert.rejects(B.executeStudioInference(h.env, h.store, 'foreign', project, admitted.runRef, raw), /no longer available/);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(JSON.parse(options.body).model, 'fixture-model');
    return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [{ id: 'tool-one', type: 'function',
      function: { name: 'set_properties', arguments: '{"name":"Door"}' } }] } }], usage: { prompt_tokens: 12, completion_tokens: 8 } });
  };
  try {
    const stream = await B.executeStudioInference(h.env, h.store, 'owner', project, admitted.runRef, raw);
    const text = await stream.text(); assert.match(text, /\[DONE\]/); assert.match(text, /set_properties/);
    const evidence = await B.studioInferenceEvidence(h.store, 'owner', project, admitted.runRef);
    assert.equal(evidence.decisions[0].provider, 'groq'); assert.equal(evidence.decisions[0].modelId, 'fixture-model');
    assert.equal(evidence.usage.platformNeurons, 0); assert.equal(evidence.usage.inputTokens, 12);
    assert.equal(JSON.stringify(evidence).includes('replay'), false); assert.equal(JSON.stringify([...h.map.values()]).includes('fixture-only'), false);
    await B.replaceAiConnection(h.env, 'owner', h.connection.id, 'Replaced', { apiKey: 'replacement-only' });
    await assert.rejects(B.executeStudioInference(h.env, h.store, 'owner', project, admitted.runRef, raw), /removed or replaced/);
  } finally { globalThis.fetch = original; }
});
test('concurrent delegates merge usage instead of overwriting stale run snapshots; rollback stops the next call', async () => {
  const h = await harness(), admitted = await B.prepareStudioInference(h.env, h.store, 'owner', project, h.selection);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: { prompt_tokens: 12, completion_tokens: 2 } }); };
  try {
    await Promise.all([B.executeStudioInference(h.env, h.store, 'owner', project, admitted.runRef, raw),
      B.executeStudioInference(h.env, h.store, 'owner', project, admitted.runRef, raw)]);
    assert.equal((await B.studioInferenceEvidence(h.store, 'owner', project, admitted.runRef)).usage.inputTokens, 24);
    h.env.AI_STUDIO_ROUTES_ENABLED = 'false';
    await assert.rejects(B.executeStudioInference(h.env, h.store, 'owner', project, admitted.runRef, raw), /not enabled/);
  } finally { globalThis.fetch = original; }
});

test('HTTP admission retries preserve the first pinned catalog and reject changed input under the same request id', async () => {
  const h = await harness(), identity = { conversation: project, requestKey: 'same-intent', inputHash: 'a'.repeat(64) };
  const first = await B.prepareStudioInference(h.env, h.store, 'owner', project, h.selection, identity);
  const again = await B.prepareStudioInference(h.env, h.store, 'owner', project, h.selection, identity);
  assert.equal(again.runRef, first.runRef); assert.equal(h.map.size, 1);
  await assert.rejects(B.prepareStudioInference(h.env, h.store, 'owner', project, h.selection,
    { ...identity, inputHash: 'b'.repeat(64) }), /changed its input/);
  const secondConversation = await B.prepareStudioInference(h.env, h.store, 'owner', project, h.selection,
    { ...identity, conversation: project + '~another' });
  assert.notEqual(secondConversation.runRef, first.runRef);
});
