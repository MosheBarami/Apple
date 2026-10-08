import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'api-adapters-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, ['api-registry', 'api-codecs', 'api-stream', 'api-transport', 'api-catalog'].map((name) =>
  `export * from ${JSON.stringify(join(worker, 'src/providers', name + '.ts'))};`).join('\n'));
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', `--outfile=${join(dir, 'adapters.mjs')}`], { stdio: 'pipe' });
const A = await import(`file://${join(dir, 'adapters.mjs')}`);
after(() => rmSync(dir, { recursive: true, force: true }));
const request = { modelId: 'fixture-model', maxTokens: 2000, temperature: 0.25,
  messages: [{ role: 'system', content: 'Build safely', pinned: true }, { role: 'user', content: 'Make a door' }],
  tools: [{ name: 'set_properties', description: 'Set a property', parameters: { type: 'object', properties: { name: { type: 'string' } } } }] };
const chat = { choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: { prompt_tokens: 12, completion_tokens: 2 } };
const sse = (events, ending = true) => events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') + (ending ? 'data: [DONE]\r\n\r\n' : '');
const bytes = (text) => new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });

test('all 19 requested API providers have explicit fixed identities and protocols', () => {
  assert.equal(Object.keys(A.API_PROVIDERS).length, 19);
  for (const [id, provider] of Object.entries(A.API_PROVIDERS)) {
    assert.equal(provider.id, id); assert.ok(provider.docs.startsWith('https://'));
    assert.equal(new URL(provider.origin).protocol, 'https:');
    const payload = A.encodeApiRequest(id, request);
    assert.equal(JSON.stringify(payload).includes('pinned'), false);
  }
});

test('OpenAI Responses uses flat function definitions and typed input/result items', () => {
  const payload = A.encodeApiRequest('openai', { ...request, requiredTool: 'set_properties' });
  assert.equal(payload.store, false); assert.equal(payload.max_output_tokens, 2000);
  assert.equal(payload.tools[0].name, 'set_properties'); assert.equal(payload.tools[0].type, 'function');
  assert.equal(payload.tool_choice.name, 'set_properties');
  assert.equal(payload.input[0].content[0].type, 'input_text');
  assert.equal('temperature' in payload, false, 'unsupported sampling fields are not sent by default');
});

test('Anthropic groups tool results in user content and uses input_schema', () => {
  const toolCall = { id: 'call1', name: 'set_properties', arguments: '{"name":"Door"}' };
  const payload = A.encodeApiRequest('anthropic', { ...request, messages: [...request.messages,
    { role: 'assistant', content: '', toolCalls: [toolCall] }, { role: 'tool', content: '{"ok":true}', toolCallId: 'call1' }] });
  assert.equal(payload.system, 'Build safely'); assert.equal(payload.tools[0].input_schema.type, 'object');
  assert.equal(payload.messages[1].content[0].type, 'tool_use');
  assert.equal(payload.messages[2].content[0].type, 'tool_result'); assert.equal(payload.messages[2].role, 'user');
});

test('Gemini uses contents, function declarations and generationConfig', () => {
  const payload = A.encodeApiRequest('google', request);
  assert.equal(payload.contents[0].role, 'user'); assert.equal(payload.systemInstruction.parts[0].text, 'Build safely');
  assert.equal(payload.tools[0].functionDeclarations[0].parametersJsonSchema.type, 'object');
  assert.equal(payload.generationConfig.maxOutputTokens, 2000);
  assert.equal('model' in payload, false);
});

test('MiniMax uses its documented completion-token field; a coding-only endpoint cannot be selected', () => {
  const payload = A.encodeApiRequest('minimax', request);
  assert.equal(payload.max_completion_tokens, 2000); assert.equal('max_tokens' in payload, false);
  assert.equal(A.providerUrl('minimax', {}, 'infer'), 'https://api.minimax.io/v1/chat/completions');
  assert.equal(A.providerUrl('zai', {}, 'infer'), 'https://api.z.ai/api/paas/v4/chat/completions');
});

test('native tool definitions/results remain structured and unoffered required tools fail before fetch', () => {
  assert.throws(() => A.encodeApiRequest('groq', { ...request, requiredTool: 'run_shell' }), /not offered/);
  const payload = A.encodeApiRequest('groq', request);
  assert.equal(payload.tools[0].function.name, 'set_properties');
});

test('images cannot silently reintroduce vision to a build route', () => {
  for (const provider of Object.keys(A.API_PROVIDERS)) assert.throws(() => A.encodeApiRequest(provider,
    { ...request, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'secret-image' } }] }] }), /Images/);
});

for (const [provider, response, expected] of [
  ['openai', { status: 'completed', output: [{ type: 'function_call', call_id: 'c1', name: 'set_properties', arguments: '{"name":"Door"}' }], usage: { input_tokens: 12, output_tokens: 2 } }, 'tool_calls'],
  ['anthropic', { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Partial' }], usage: { input_tokens: 12, output_tokens: 2 } }, 'length'],
  ['google', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private thought', thought: true }, { text: 'OK' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 2 } }, 'stop'],
  ['cohere', { finish_reason: 'COMPLETE', message: { content: [{ type: 'text', text: 'OK' }] }, usage: { tokens: { input_tokens: 12, output_tokens: 2 } } }, 'stop'],
  ['cloudflare', { result: chat }, 'stop'], ['deepseek', chat, 'stop'],
]) test(`${provider} decodes documented response and usage without fabricated completion`, () => {
  const result = A.decodeApiResponse(provider, 'selected', response);
  assert.equal(result.finishReason, expected); assert.equal(result.model, 'selected');
  assert.equal(result.usage.inputTokens, 12); assert.equal(result.usage.outputTokens, 2);
  assert.equal(result.usage.cachedInputTokens, null); assert.ok(result.replay);
  assert.equal(result.text.includes('private thought'), false);
});

test('absent usage and completion markers stay unknown or failed', () => {
  const result = A.decodeApiResponse('groq', 'selected', { choices: [{ message: { content: 'plausible reply' } }] });
  assert.equal(result.finishReason, 'error'); assert.equal(result.usage.inputTokens, null);
});

test('stream parser handles CRLF/multibyte boundaries and assembled structured tool calls', async () => {
  const events = [{ choices: [{ delta: { content: 'שלום', tool_calls: [{ index: 0, id: 'c1', function: { name: 'set_properties', arguments: '{"name":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Door"}' } }] }, finish_reason: 'tool_calls' }] }, { usage: chat.usage, choices: [] }];
  let text = '';
  const raw = await A.collectApiStream(bytes(sse(events)), 'chat-completions', (delta) => { text += delta; });
  const result = A.decodeApiResponse('groq', 'selected', raw);
  assert.equal(text, 'שלום'); assert.equal(result.text, text); assert.equal(result.toolCalls[0].arguments, '{"name":"Door"}');
  assert.equal(result.finishReason, 'tool_calls'); assert.equal(result.usage.inputTokens, 12);
});

test('interrupted streams and provider stream errors never look complete', async () => {
  await assert.rejects(A.collectApiStream(bytes(sse([{ choices: [{ delta: { content: 'Partial' } }] }], false)), 'chat-completions'), /without a completion/);
  await assert.rejects(A.collectApiStream(bytes(sse([{ error: { message: 'secret-key' } }])), 'chat-completions'),
    (error) => !error.message.includes('secret-key'));
});

test('Responses streaming needs a semantic terminal event and retains replay state', async () => {
  const result = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }], usage: { input_tokens: 12, output_tokens: 2 } };
  let streamed = '';
  const events = [{ type: 'response.output_text.delta', delta: 'OK' }, { type: 'response.completed', response: result }];
  const raw = await A.collectApiStream(bytes(sse(events, false)), 'responses', (text) => { streamed += text; });
  assert.equal(streamed, 'OK'); assert.deepEqual(raw, result);
});

test('Anthropic SSE retains signed thinking and native tool input for the next turn without publishing thoughts', async () => {
  const events = [
    { type: 'message_start', message: { role: 'assistant', usage: { input_tokens: 12 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'private thought' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'fixture-signature' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'c1', name: 'set_properties', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"name":"Door"}' } },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } },
    { type: 'message_stop' },
  ];
  let published = '';
  const result = A.decodeApiResponse('anthropic', 'fixture-model', await A.collectApiStream(bytes(sse(events, false)), 'anthropic', (t) => { published += t; }));
  assert.equal(result.finishReason, 'tool_calls'); assert.equal(result.toolCalls[0].arguments, '{"name":"Door"}'); assert.equal(published, '');
  const replay = A.encodeApiRequest('anthropic', { ...request, messages: [...request.messages,
    { role: 'assistant', content: '', toolCalls: result.toolCalls, providerReplay: { provider: 'anthropic', modelId: 'fixture-model', content: result.replay } }] });
  assert.equal(replay.messages[1].content[0].signature, 'fixture-signature');
  const switched = A.encodeApiRequest('groq', { ...request, messages: [{ role: 'assistant', content: 'OK',
    providerReplay: { provider: 'anthropic', modelId: 'fixture-model', content: result.replay } }] });
  assert.equal(JSON.stringify(switched).includes('private thought'), false);
});

test('Gemini and Cohere streams normalize tools, usage and completion by their own event semantics', async () => {
  const gemini = [{ candidates: [{ content: { parts: [{ thought: true, text: 'private thought' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'set_properties', args: { name: 'Door' } }, thoughtSignature: 'fixture-signature' }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 } }];
  const cohere = [{ type: 'message-start', id: 'fixture' },
    { type: 'tool-call-start', index: 0, delta: { message: { tool_calls: { id: 'c1', type: 'function', function: { name: 'set_properties', arguments: '' } } } } },
    { type: 'tool-call-delta', index: 0, delta: { message: { tool_calls: { function: { arguments: '{"name":"Door"}' } } } } },
    { type: 'message-end', delta: { finish_reason: 'TOOL_CALL', usage: { tokens: { input_tokens: 12, output_tokens: 8 } } } }];
  for (const [provider, protocol, events] of [['google', 'gemini', gemini], ['cohere', 'cohere', cohere]]) {
    let published = '';
    const result = A.decodeApiResponse(provider, 'fixture-model', await A.collectApiStream(bytes(sse(events, false)), protocol, (t) => { published += t; }));
    assert.equal(result.finishReason, 'tool_calls'); assert.equal(result.toolCalls[0].arguments, '{"name":"Door"}');
    assert.equal(result.usage.inputTokens, 12); assert.equal(result.usage.outputTokens, 8); assert.equal(published, '');
    await assert.rejects(A.collectApiStream(bytes(sse(events.slice(0, -1), false)), protocol), /completion marker/);
  }
});

test('catalog pagination pins complete results and refuses repeated cursors', async () => {
  let calls = 0;
  const catalog = await A.discoverApiModels('anthropic', { apiKey: 'fixture-only' }, { fetcher: async (url) => {
    calls++; if (calls === 1) return Response.json({ data: [{ id: 'first', display_name: 'First' }], has_more: true, last_id: 'cursor-one' });
    assert.equal(new URL(url).searchParams.get('after_id'), 'cursor-one');
    return Response.json({ data: [{ id: 'second', display_name: 'Second' }], has_more: false });
  } });
  assert.deepEqual(catalog.models.map((m) => m.id), ['first', 'second']); assert.equal(catalog.models[0].contextWindow, null);
  await assert.rejects(A.discoverApiModels('anthropic', { apiKey: 'fixture-only' }, { fetcher: async () =>
    Response.json({ data: [{ id: 'first' }], has_more: true, last_id: 'same-cursor' }) }), /pagination repeated/);
});

test('Gemini validates current-turn replay without inventing signatures or function ids for past turns', () => {
  const call = { id: 'synthetic-one', name: 'set_properties', arguments: '{"name":"Door"}' };
  const replay = { role: 'model', parts: [{ functionCall: { name: call.name, args: { name: 'Door' } }, thoughtSignature: 'fixture-signature' }] };
  const assistant = { role: 'assistant', content: '', toolCalls: [call], providerReplay: { provider: 'google', modelId: 'fixture-model', content: replay } };
  const tool = { role: 'tool', content: 'OK', toolCallId: call.id };
  const current = A.encodeApiRequest('google', { ...request, messages: [...request.messages, assistant, tool] });
  assert.deepEqual(current.contents[1], replay);
  assert.equal('id' in current.contents[2].parts[0].functionResponse, false, 'a synthetic internal id never becomes a native Gemini id');
  const { providerReplay: _, ...withoutReplay } = assistant;
  assert.throws(() => A.encodeApiRequest('google', { ...request, messages: [...request.messages, withoutReplay, tool] }), /current-turn/);
  const next = A.encodeApiRequest('google', { ...request, messages: [...request.messages, withoutReplay, tool,
    { role: 'user', content: 'Make another change.' }] });
  assert.equal(next.contents[1].parts[0].functionCall.name, call.name);
  assert.equal(JSON.stringify(next).includes('skip_thought_signature_validator'), false);
});

test('a successful provider response cannot echo a stored key into a stream callback or return value', async () => {
  let published = '';
  await assert.rejects(A.invokeApi('groq', { apiKey: 'echo-only' }, request, { onText: (text) => { published += text; }, stream: false,
    fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'echo-only' } }], usage: chat.usage }) }),
    (error) => error.code === 'invalid_response' && !error.message.includes('echo-only'));
  assert.equal(published, '');
});

test('a 200 response with tool-shaped content and no completion marker cannot execute or publish it', async () => {
  let published = '';
  await assert.rejects(A.invokeApi('groq', { apiKey: 'fixture-only' }, request, { onText: (text) => { published += text; }, stream: false,
    fetcher: async () => Response.json({ choices: [{ message: { content: 'Plausible reply', tool_calls: [{ id: 'c1', type: 'function',
      function: { name: 'set_properties', arguments: '{"name":"Door"}' } }] } }], usage: chat.usage }) }),
    (error) => error.code === 'invalid_response');
  assert.equal(published, '');
});

test('Cloudflare API names are distinct from its internal UUID; HF host capabilities stay explicitly pinned', () => {
  const [cf] = A.normalizeApiModels('cloudflare', [{ id: 'internal-uuid', name: '@cf/openai/gpt-oss-20b',
    task: { name: 'Text Generation' }, properties: [{ property_id: 'context_window', value: '131072' },
      { property_id: 'function_calling', value: 'true' }, { property_id: 'price', value: [{ unit: 'per M input tokens', currency: 'USD', price: 0.2 }] }] }], '2026-10-08');
  assert.equal(cf.id, '@cf/openai/gpt-oss-20b'); assert.equal(cf.producer, 'OpenAI'); assert.equal(cf.contextWindow, 131072);
  assert.equal(cf.inputCostPer1M, 0.2); assert.equal(cf.outputCostPer1M, null);
  const [hf] = A.normalizeApiModels('huggingface', [{ id: 'exact/published-model', owned_by: 'published-maker',
    architecture: { output_modalities: ['text'] }, providers: [{ provider: 'verified-host', status: 'live', context_length: 32000,
      supports_tools: true, pricing: { input: 0.1, output: 0.2 } }] }], '2026-10-08');
  assert.equal(hf.id, 'exact/published-model:verified-host'); assert.equal(hf.hostedBy, 'verified-host');
  assert.equal(hf.producer, 'published-maker'); assert.equal(hf.capabilities.tools, true); assert.equal(hf.contextWindow, 32000);
});

test('credentials never go into URLs; wrong origins and redirects fail closed', async () => {
  const credentials = { apiKey: 'private-api-key', accountId: 'a'.repeat(32) };
  assert.equal(A.providerUrl('google', credentials, 'infer', 'gemini-fixture').includes(credentials.apiKey), false);
  assert.throws(() => A.providerUrl('cloudflare', { ...credentials, accountId: '../admin' }, 'models'), /account ID/);
  assert.throws(() => A.providerUrl('google', credentials, 'infer', '../admin'), /model ID/);
  let calls = 0;
  await assert.rejects(A.checkedApiFetch('openai', 'http://127.0.0.1', credentials, {}, async () => { calls++; }), /origin mismatch/);
  assert.equal(calls, 0);
  await assert.rejects(A.checkedApiFetch('openai', 'https://api.openai.com/v1/models', credentials, {}, async (_, options) => {
    assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Authorization, 'Bearer private-api-key');
    throw new Error('redirect to http://127.0.0.1 with private-api-key');
  }), (error) => error.code === 'unavailable' && !error.message.includes('private-api-key'));
  await assert.rejects(A.checkedApiFetch('openai', 'https://api.openai.com/v1/models', credentials, {}, async () =>
    new Response(null, { status: 302, headers: { Location: 'https://unreviewed.example/' } })), (error) => error.code === 'blocked');
});

test('auth, rate limit and quota errors have bounded Retry-After and never trigger a paid retry', async () => {
  for (const [status, code] of [[401, 'auth'], [403, 'auth'], [429, 'rate_limit'], [500, 'unavailable']]) {
    let calls = 0;
    await assert.rejects(A.invokeApi('groq', { apiKey: 'secret-key' }, request, { fetcher: async () => {
      calls++; return new Response('secret-key and private prompt', { status, headers: { 'Retry-After': '3' } });
    } }), (error) => error.code === code && error.retryAfterMs === 3000 && !error.message.includes('secret-key'));
    assert.equal(calls, 1);
  }
});

test('real selection controls provider URL and model body; usage reports actual provider counts', async () => {
  const result = await A.invokeApi('together', { apiKey: 'secret-key' }, request, { fetcher: async (url, options) => {
    assert.equal(url, 'https://api.together.xyz/v1/chat/completions');
    assert.equal(JSON.parse(options.body).model, request.modelId);
    return new Response(JSON.stringify(chat));
  } });
  assert.equal(result.provider, 'together'); assert.equal(result.model, request.modelId); assert.equal(result.usage.outputTokens, 2);
});
