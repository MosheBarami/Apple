/**
 * THE ONE ENGINE ON THE BINDING (V3 gate G01).
 *
 * StudPilot is the only customer engine: GLM 5.3 Flash on Workers AI, sent on the chat wire through
 * `env.AI.run`. The outside models (Gemini, Sol, Luna) and their Responses wire are gone. Every
 * provider response below is a synthetic fixture shaped after the documented chat wire; each
 * property is one a live call cannot silently break without a test here going red first:
 *
 *   - StudPilot is sent a chat `messages` body, never a Responses `input`, with tool calls structured;
 *   - reasoning effort and named tool choice reach GLM, and are not invented for Qwen;
 *   - usage decodes as reported, and a missing or malformed usage block still costs something;
 *   - a third-party id (reachable only through a KV override) is still refused without AI_GATEWAY_ID;
 *   - the session routes every stored model value to the mode key, so every lane runs StudPilot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const GLM = '@cf/zai-org/glm-5.3-flash';

/** A conversation that exercises every translation: system, image, a prior tool call and its result. */
const CONVERSATION = [
  { role: 'system', content: 'You are StudPilot.' },
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

test('StudPilot is sent a chat body: messages, never input, with the prior tool call structured', () => {
  const p = encode(GLM);
  assert.equal('input' in p, false, 'StudPilot was sent a Responses input body');
  assert.equal(p.messages.length, CONVERSATION.length);
  assert.deepEqual(p.messages[3].tool_calls, [{ id: 'call_7', type: 'function', function: { name: 'get_children', arguments: '{"path":"Workspace"}' } }]);
  assert.equal(p.messages[4].tool_call_id, 'call_7');
  assert.equal(p.max_tokens, 4000);
  assert.deepEqual(p.tools, [{ type: 'function', function: TOOLS[0] }]);
});

test('a JSON schema request reaches StudPilot in the chat wire\'s response_format', () => {
  const schema = { name: 'verdict', schema: { type: 'object' }, strict: true };
  assert.deepEqual(encode(GLM, { jsonSchema: schema }).response_format, { type: 'json_schema', json_schema: schema });
});

test('reasoning effort reaches GLM, and is still not invented for Qwen', () => {
  assert.equal(encode(GLM).reasoning_effort, 'low');
  assert.equal('reasoning_effort' in encode('@cf/qwen/qwen3-30b-a3b-fp8'), false);
});

test('a chat reply decodes to text, structured calls and the reported usage', () => {
  const reply = {
    choices: [{ finish_reason: 'tool_calls', message: { content: 'Placing the stall.', reasoning_content: 'scratch',
      tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'run_luau', arguments: '{"source":"print(1)"}' } }] } }],
    usage: { prompt_tokens: 5200, completion_tokens: 180, prompt_tokens_details: { cached_tokens: 4800 } },
  };
  const r = WA.workersAiAdapter.decode(reply, 999, GLM);
  assert.equal(r.text, 'Placing the stall.', 'reasoning_content leaked into the answer');
  assert.deepEqual(r.toolCalls.map((c) => [c.id, c.name]), [['call_9', 'run_luau']]);
  assert.deepEqual(
    { i: r.usage.inputTokens, o: r.usage.outputTokens, c: r.usage.cachedInputTokens },
    { i: 5200, o: 180, c: 4800 },
  );
  assert.equal(r.finishReason, 'tool_calls');
  const cut = WA.workersAiAdapter.decode({ choices: [{ finish_reason: 'length', message: { content: 'Half an ans' } }] }, 10, GLM);
  assert.equal(cut.truncated, true);
  assert.equal(cut.finishReason, 'length');
});

test('a malformed usage block still costs something and is never NaN', () => {
  for (const usage of [undefined, {}, { prompt_tokens: '5', completion_tokens: 3 }, { prompt_tokens: 5, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 'x' } }]) {
    const u = WA.extractUsage({ usage }, 700, 'some text');
    for (const k of ['inputTokens', 'outputTokens', 'cachedInputTokens']) {
      assert.ok(Number.isFinite(u[k]) && u[k] >= 0, `${JSON.stringify(usage)}: ${k}=${u[k]}`);
    }
    assert.ok(u.inputTokens > 0 && u.outputTokens > 0, `${JSON.stringify(usage)} was billed as free`);
  }
});

test('without AI_GATEWAY_ID a third-party id is refused before the binding, and StudPilot is not', () => {
  const env = {};
  // No product model is third-party any more; one can still arrive through a KV model override.
  assert.throws(() => WA.gatewayOpts(env, 'k', 0, undefined, 'anthropic/some-future-model'), /AI_GATEWAY_ID/);
  assert.deepEqual(WA.gatewayOpts(env, 'k', 0, 's1', GLM), { extraHeaders: { 'x-session-affinity': 's1' } });
  assert.equal(WA.gatewayOpts(env, 'k', 0), undefined);
});

test('with a gateway, the log names the model beside the kind of call', () => {
  const o = WA.gatewayOpts({ AI_GATEWAY_ID: 'gw' }, 'agent:step:low', 0, 's1', GLM);
  assert.deepEqual(o.gateway.metadata, { kind: 'agent:step:low', model: GLM });
  assert.equal(o.gateway.id, 'gw');
});

test('the session routes every lane to its mode key, and the mode key runs StudPilot', () => {
  for (const mode of ['plan', 'agent']) {
    assert.equal(S.gatewayModelFor(mode), mode);
    assert.equal(G.DEFAULT_MODELS[mode].id, GLM);
  }
  for (const retired of ['apple-max', 'gemini-3.8-flash', 'gpt-5.6', 'gpt-5.6-luna']) {
    assert.equal(G.DEFAULT_MODELS[retired], undefined, `${retired} still has a model key`);
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

test('finite GLM action requests native named tool choice through the metered gateway', async () => {
  G.resetModelCache();
  const tools = [{ name: 'move_instances', description: 'Reparent', parameters: { type: 'object' } }];
  const { env, seen } = fakeEnv({ response: '', tool_calls: [{ name: 'move_instances', arguments: { moves: [] } }], usage: { prompt_tokens: 20, completion_tokens: 10 } });
  await G.chat(env, { model: 'agent', messages: [{ role: 'user', content: 'Move the bench' }], tools, requiredTool: 'move_instances' });
  assert.deepEqual(seen.runs[0].payload.tool_choice, { type: 'function', function: { name: 'move_instances' } });
  assert.equal(seen.reserved.length, 1);
  assert.equal(seen.settled.length, 1);
});

test('named choice cannot add a withheld tool or change ordinary chat', () => {
  const model = '@cf/zai-org/glm-5.3-flash';
  assert.equal(encode(model).tool_choice, undefined);
  assert.equal(encode(model, { requiredTool: 'move_instances' }).tool_choice, undefined);
  assert.equal(encode(model, { tools: [], requiredTool: 'run_luau' }).tool_choice, undefined);
  assert.equal(encode('@cf/qwen/qwen3-30b-a3b-fp8', { requiredTool: 'run_luau' }).tool_choice, undefined);
});
