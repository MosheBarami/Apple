/**
 * THE OUTSIDE MODELS ON THE BINDING (D-VISION-1, rollout step 3).
 *
 * Gemini 3.8 Flash, GPT-5.6 (Sol) and GPT-5.6 Luna run through the same `env.AI.run` as Apple, paid
 * from AI Gateway credits (Unified Billing). No live call has been made: the gateway balance is $0
 * (OWNER_QUEUE Q-006). So every provider response below is a synthetic fixture shaped after the
 * documented wire, and each property is one a live call cannot silently break without a test here
 * going red first:
 *
 *   - a Responses-wire model is never sent a `messages` body (the 2026-08-31 probe that did got
 *     "7003 Invalid value at input"), and a chat-wire model is never sent `input`;
 *   - on the Responses wire a tool result answers its call by id, as a structured item — never as
 *     text — and nothing is stored on the provider's side;
 *   - a Responses reply decodes to the same text, tool calls, usage and truncation a chat reply does;
 *   - a third-party id without AI_GATEWAY_ID is refused BEFORE the binding is called, because only a
 *     call that names the gateway is billed to the credits;
 *   - the gateway log attributes each call to its model;
 *   - the model keys the session asks for exist, and are derived from the registry.
 *
 * The wire lists come from the registry, so a new model is covered without editing this file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODEL_REGISTRY } from '@golem/shared';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'model-wires-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

function bundle(rel, name) {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${out}`],
    { cwd: WORKER, stdio: 'pipe' });
  return import(pathToFileURL(out).href);
}

const WA = await bundle('providers/workers-ai.ts', 'wa');
const G = await bundle('gateway.ts', 'gateway');
const S = await bundle('do/session.ts', 'session');

const OUTSIDE = MODEL_REGISTRY.filter((m) => m.route === 'unified-billing');
const RESPONSES = OUTSIDE.filter((m) => m.wire === 'responses');
const CHAT = MODEL_REGISTRY.filter((m) => m.wire === 'chat');
const SOL = RESPONSES.find((m) => m.id === 'gpt-5.6');
const GEMINI = OUTSIDE.find((m) => m.id === 'gemini-3.8-flash');

test('the registry has models on both wires, so nothing below is vacuous', () => {
  assert.ok(RESPONSES.length >= 2, `responses-wire models: ${RESPONSES.length}`);
  assert.ok(CHAT.length >= 3, `chat-wire models: ${CHAT.length}`);
  assert.ok(SOL && GEMINI, 'Sol and Gemini are in the registry');
});

/** A conversation that exercises every translation: system, image, a prior tool call and its result. */
const CONVERSATION = [
  { role: 'system', content: 'You are Apple.' },
  { role: 'system', content: 'The place has a Baseplate.' },
  { role: 'user', content: [{ type: 'text', text: 'Match this.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
  { role: 'assistant', content: 'Looking first.', toolCalls: [{ id: 'call_7', name: 'get_children', arguments: '{"path":"Workspace"}' }] },
  { role: 'tool', content: '["Baseplate"]', toolCallId: 'call_7', name: 'get_children' },
];
const TOOLS = [{ name: 'run_luau', description: 'Run Luau', parameters: { type: 'object', properties: { source: { type: 'string' } } } }];

function encode(modelId, extra = {}) {
  return WA.workersAiAdapter.encode({
    modelId, messages: CONVERSATION, tools: TOOLS, maxTokens: 4000, temperature: 0.25, reasoningEffort: 'low', ...extra,
  }).payload;
}

test('a Responses-wire model is never sent `messages`, and a chat-wire model is never sent `input`', () => {
  for (const m of RESPONSES) {
    const p = encode(m.providerModelId);
    assert.equal('messages' in p, false, `${m.id} was sent a messages body`);
    assert.ok(Array.isArray(p.input) && p.input.length > 0, `${m.id} has no input`);
  }
  for (const m of CHAT) {
    const p = encode(m.providerModelId);
    assert.equal('input' in p, false, `${m.id} was sent an input body`);
    assert.ok(Array.isArray(p.messages) && p.messages.length === CONVERSATION.length, m.id);
  }
});

test('on the Responses wire every tool result answers an earlier call by id, as a structured item', () => {
  const p = encode(SOL.providerModelId);
  const calls = new Map();
  p.input.forEach((item, i) => { if (item.type === 'function_call') calls.set(item.call_id, i); });
  const outputs = p.input.filter((item) => item.type === 'function_call_output');
  assert.equal(outputs.length, 1);
  for (const o of outputs) {
    assert.ok(calls.has(o.call_id), `output ${o.call_id} answers no call`);
    assert.ok(calls.get(o.call_id) < p.input.indexOf(o), 'the result comes before its call');
    assert.equal(typeof o.output, 'string');
  }
  const call = p.input.find((item) => item.type === 'function_call');
  assert.deepEqual({ name: call.name, arguments: call.arguments }, { name: 'get_children', arguments: '{"path":"Workspace"}' });
  // …and the call is not ALSO flattened into prose, which teaches a model to imitate it as text.
  assert.equal(JSON.stringify(p.input.filter((i) => i.role)).includes('get_children'), false);
});

test('the Responses payload: instructions from every system turn, image as input_image, no storage, no temperature', () => {
  const p = encode(SOL.providerModelId);
  assert.equal(p.instructions, 'You are Apple.\n\nThe place has a Baseplate.');
  assert.equal(p.input.some((i) => i.role === 'system'), false, 'a system turn leaked into input');
  const user = p.input.find((i) => i.role === 'user');
  assert.deepEqual(user.content.map((c) => c.type), ['input_text', 'input_image']);
  assert.equal(user.content[1].image_url, 'data:image/png;base64,AAAA');
  assert.equal(p.store, false);
  assert.equal(p.max_output_tokens, 4000);
  assert.equal('max_tokens' in p, false);
  assert.equal('temperature' in p, false);
  assert.deepEqual(p.tools, [{ type: 'function', ...TOOLS[0] }]);
  assert.deepEqual(p.reasoning, { effort: 'low' });
});

test('a JSON schema request reaches each wire in that wire\'s own field', () => {
  const schema = { name: 'verdict', schema: { type: 'object' }, strict: true };
  assert.deepEqual(encode(SOL.providerModelId, { jsonSchema: schema }).text, { format: { type: 'json_schema', ...schema } });
  assert.deepEqual(encode(GEMINI.providerModelId, { jsonSchema: schema }).response_format, { type: 'json_schema', json_schema: schema });
});

test('reasoning effort reaches Gemini and GLM, and is still not invented for Qwen', () => {
  assert.equal(encode(GEMINI.providerModelId).reasoning_effort, 'low');
  assert.equal(encode('@cf/zai-org/glm-5.3-flash').reasoning_effort, 'low');
  assert.equal('reasoning_effort' in encode('@cf/qwen/qwen3-30b-a3b-fp8'), false);
});

/** A Responses reply after a tool-using step, as the wire documents it. */
const RESPONSES_REPLY = {
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', summary: [] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Placing the stall.' }] },
    { type: 'function_call', id: 'fc_1', call_id: 'call_9', name: 'run_luau', arguments: '{"source":"print(1)"}' },
  ],
  usage: { input_tokens: 5200, output_tokens: 180, input_tokens_details: { cached_tokens: 4800 }, output_tokens_details: { reasoning_tokens: 90 } },
};

test('a Responses reply decodes to text, the call by its call_id, and the reported usage', () => {
  const r = WA.workersAiAdapter.decode(structuredClone(RESPONSES_REPLY), 999, SOL.providerModelId);
  assert.equal(r.text, 'Placing the stall.');
  assert.deepEqual(r.toolCalls, [{ id: 'call_9', name: 'run_luau', arguments: '{"source":"print(1)"}' }]);
  // Reported, not estimated: the output count already includes the reasoning tokens.
  assert.deepEqual(
    { i: r.usage.inputTokens, o: r.usage.outputTokens, c: r.usage.cachedInputTokens },
    { i: 5200, o: 180, c: 4800 },
  );
  assert.equal(r.finishReason, 'tool_calls');
  assert.equal(r.truncated, false);
});

test('a Responses reply cut at max_output_tokens is truncated, like chat\'s finish_reason "length"', () => {
  const cut = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Half an ans' }] }],
    usage: { input_tokens: 10, output_tokens: 4000 } };
  const r = WA.workersAiAdapter.decode(cut, 10, SOL.providerModelId);
  assert.equal(r.truncated, true);
  assert.equal(r.finishReason, 'length');
  // An incomplete reply for another reason is not reported as a length cut.
  const filtered = { ...cut, incomplete_details: { reason: 'content_filter' } };
  assert.equal(WA.workersAiAdapter.decode(filtered, 10, SOL.providerModelId).truncated, false);
});

test('a malformed Responses usage block still costs something and is never NaN', () => {
  for (const usage of [undefined, {}, { input_tokens: '5', output_tokens: 3 }, { input_tokens: 5, output_tokens: 3, input_tokens_details: { cached_tokens: 'x' } }]) {
    const u = WA.extractUsage({ output: RESPONSES_REPLY.output, usage }, 700, 'some text');
    for (const k of ['inputTokens', 'outputTokens', 'cachedInputTokens']) {
      assert.ok(Number.isFinite(u[k]) && u[k] >= 0, `${JSON.stringify(usage)}: ${k}=${u[k]}`);
    }
    assert.ok(u.inputTokens > 0 && u.outputTokens > 0, `${JSON.stringify(usage)} was billed as free`);
  }
});

test('without AI_GATEWAY_ID a third-party id is refused before the binding, and Apple is not', () => {
  const env = {};
  for (const m of OUTSIDE) {
    assert.throws(() => WA.gatewayOpts(env, 'agent:step', 0, 's1', m.providerModelId), /AI_GATEWAY_ID/, m.id);
  }
  // A third-party id the registry does not list is refused too: the route is read from the id.
  assert.throws(() => WA.gatewayOpts(env, 'k', 0, undefined, 'anthropic/some-future-model'), /AI_GATEWAY_ID/);
  assert.deepEqual(WA.gatewayOpts(env, 'k', 0, 's1', '@cf/zai-org/glm-5.3-flash'), { extraHeaders: { 'x-session-affinity': 's1' } });
  assert.equal(WA.gatewayOpts(env, 'k', 0), undefined);
});

test('with a gateway, the log names the model beside the kind of call', () => {
  const o = WA.gatewayOpts({ AI_GATEWAY_ID: 'gw' }, 'agent:step:low', 0, 's1', SOL.providerModelId);
  assert.deepEqual(o.gateway.metadata, { kind: 'agent:step:low', model: SOL.providerModelId });
  assert.equal(o.gateway.id, 'gw');
});

test('every outside model has a model key named by its registry id, with the registry\'s ceiling', () => {
  for (const m of OUTSIDE) {
    const cfg = G.DEFAULT_MODELS[m.id];
    assert.ok(cfg, `no DEFAULT_MODELS entry for ${m.id}`);
    assert.equal(cfg.id, m.providerModelId);
    assert.equal(cfg.maxTokens, m.maxOutputTokens);
    assert.equal(cfg.nativeTools, m.nativeTools);
  }
});

test('the session routes an outside model to its own key, and both Apple lanes to the mode key', () => {
  for (const mode of ['plan', 'agent']) {
    for (const m of OUTSIDE) assert.equal(S.gatewayModelFor(mode, m.id), m.id);
    for (const m of MODEL_REGISTRY.filter((x) => x.route === 'workers-ai')) assert.equal(S.gatewayModelFor(mode, m.id), mode);
    assert.equal(S.gatewayModelFor(mode, undefined), mode);
  }
});

// ---------------------------------------------------------------------------
// the whole path, through gateway.chat, against a fake binding
// ---------------------------------------------------------------------------

function fakeEnv(reply, extra = {}) {
  const seen = { runs: [], reserved: [], settled: [], released: [] };
  const env = {
    AI: { run: async (id, payload, opts) => { seen.runs.push({ id, payload, opts }); return structuredClone(reply); } },
    KV: { get: async () => null },
    AI_GATEWAY_ID: 'golem-gw',
    ENVIRONMENT: 'test',
    BUDGET_DO: {
      idFromName: () => 'singleton',
      get: () => ({
        fetch: async (url, init) => {
          const body = init?.body ? JSON.parse(init.body) : {};
          if (url.endsWith('/reserve')) { seen.reserved.push(body); return { json: async () => ({ ok: true, reserved: body.neurons }) }; }
          if (url.endsWith('/settle')) seen.settled.push(body);
          if (url.endsWith('/release')) seen.released.push(body);
          return { json: async () => ({ ok: true }) };
        },
      }),
    },
    ...extra,
  };
  return { env, seen };
}

test('a Sol step goes out on the binding as a Responses body, and is reserved and settled as Sol', async () => {
  G.resetModelCache();
  const { env, seen } = fakeEnv(RESPONSES_REPLY);
  const res = await G.chat(env, { model: SOL.id, messages: CONVERSATION, tools: TOOLS, reasoningEffort: 'low' }, { kind: 'agent:step:low' });
  assert.equal(seen.runs.length, 1);
  assert.equal(seen.runs[0].id, SOL.providerModelId);
  assert.equal('messages' in seen.runs[0].payload, false);
  assert.equal(seen.runs[0].payload.store, false);
  assert.equal(seen.runs[0].opts.gateway.metadata.model, SOL.providerModelId);
  assert.equal(seen.reserved[0].model, SOL.providerModelId, 'the hold was not taken on the Sol ledger');
  assert.equal(seen.settled[0].model, SOL.providerModelId);
  assert.ok(seen.settled[0].actual > 0);
  assert.deepEqual(res.toolCalls.map((c) => c.name), ['run_luau']);
});

test('without AI_GATEWAY_ID a Sol step never reaches the binding, and its hold is handed back', async () => {
  G.resetModelCache();
  const { env, seen } = fakeEnv(RESPONSES_REPLY, { AI_GATEWAY_ID: undefined });
  await assert.rejects(G.chat(env, { model: SOL.id, messages: CONVERSATION, tools: TOOLS }, { kind: 'agent:step:low' }), /AI_GATEWAY_ID/);
  assert.equal(seen.runs.length, 0, 'the binding was called without a gateway');
  assert.equal(seen.settled.length, 0, 'a call that never ran was charged');
  assert.equal(seen.released.length, seen.reserved.length, 'the hold was not released');
});
