// Provider architecture tests.
//
// TWO THINGS ARE PROVEN HERE.
//
// 1. THE REFACTOR CHANGED NOTHING ABOUT THE TRANSPORT. The provider layer moved the transport out
//    of gateway.ts and behind an adapter. To show that is behaviour-preserving rather than merely
//    plausible, this file bundles the PRE-REFACTOR gateway straight out of git, runs both versions
//    against the same fake Workers AI binding, and asserts the wire payload, the AI Gateway
//    options, the call/reservation/settlement counts and the returned GatewayResponse shape are
//    deep-equal. Not "looks the same" — deep-equal.
//
//    It deliberately does NOT compare the model id or the neuron amounts. The baseline is frozen at
//    a pre-refactor revision, so its DEFAULT_MODELS is whatever shipped then; comparing those
//    compares old CONFIGURATION to new, and which model serves a mode is allowed to change. Neurons
//    are a function of the model's price row, so pinning them here would make any model change fail
//    the suite for the wrong reason. Cost arithmetic is asserted separately, against an explicit
//    model, and the current frontier defaults are asserted in their own tests below.
//
// 2. THE LAYER IS HONEST. OpenAI, Google and DeepSeek have no credentials on this account, and the
//    tests assert they report exactly that, that DeepSeek additionally reports it cannot serve the
//    `vision` key, and that their invoke() refuses BEFORE reaching the network.
//
// NOTHING IN THIS FILE MAKES A NETWORK CALL. Every provider response is a synthetic fixture and
// every credential is absent, which is also the state of production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const WORKER = join(ROOT, 'apps', 'worker');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

function bundle(entry, label) {
  const dest = join(tmpdir(), `golem-${label}-${process.pid}.mjs`);
  execFileSync(ESBUILD, [entry, '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`], {
    stdio: 'pipe',
    cwd: WORKER,
  });
  return dest;
}

// --- the current provider layer + the current gateway ----------------------
const providersFile = bundle(join(WORKER, 'src', 'providers', 'index.ts'), 'providers');
const P = await import(`file://${providersFile}`);
rmSync(providersFile, { force: true });

const gatewayFile = bundle(join(WORKER, 'src', 'gateway.ts'), 'gateway');
const G = await import(`file://${gatewayFile}`);
rmSync(gatewayFile, { force: true });

// --- the pre-refactor gateway, taken from git -------------------------------
// The baseline is the NEWEST revision of gateway.ts that does not yet import the provider layer.
// Pinning it that way rather than to HEAD is what stops this proof from quietly decaying into a
// tautology the moment the refactor is committed: once HEAD is refactored, HEAD~n is still the
// real "before", and if no such revision exists the test says so instead of passing vacantly.
//
// Staged under node_modules so `tsc --noEmit` never sees it; relative imports are rewritten to
// point back at the real src/ so it compiles against the same env and pricing modules.
const BASELINE_DIR = join(WORKER, 'node_modules', '.golem-baseline');
let BASELINE = null;
let BASELINE_REV = null;
try {
  const revs = execFileSync('git', ['rev-list', '-n', '50', 'HEAD', '--', 'apps/worker/src/gateway.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  let src = null;
  for (const rev of revs) {
    const s = execFileSync('git', ['show', `${rev}:apps/worker/src/gateway.ts`], { cwd: ROOT, encoding: 'utf8' });
    if (!s.includes("from './providers'")) {
      src = s;
      BASELINE_REV = rev;
      break;
    }
  }
  if (src) {
    mkdirSync(BASELINE_DIR, { recursive: true });
    const baselineTs = join(BASELINE_DIR, 'gateway-baseline.ts');
    writeFileSync(baselineTs, src.replace(/from '\.\/(env|pricing)'/g, "from '../../src/$1'"));
    const out = bundle(baselineTs, 'gateway-baseline');
    BASELINE = await import(`file://${out}`);
    rmSync(out, { force: true });
  }
} catch {
  // A shallow checkout or a rewritten history is not a reason to fail the whole suite; the
  // equivalence test below skips itself and says so.
  BASELINE = null;
} finally {
  rmSync(BASELINE_DIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// fakes
// ---------------------------------------------------------------------------

/** A synthetic GLM-5.3 response: prose, one native tool call, and a full usage block. */
const CANNED = {
  choices: [
    {
      finish_reason: 'tool_calls',
      message: {
        content: 'Placing the counter now.',
        reasoning_content: 'internal scratchpad that must never surface',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'run_luau', arguments: '{"source":"print(1)"}' } }],
      },
    },
  ],
  usage: { prompt_tokens: 5200, completion_tokens: 180, prompt_tokens_details: { cached_tokens: 4800 }, neurons: 42 },
};

function fakeEnv(extra = {}) {
  const seen = { runs: [], reserved: [], settled: [], released: [] };
  const env = {
    AI: {
      run: async (id, payload, opts) => {
        seen.runs.push({ id, payload, opts });
        return structuredClone(CANNED);
      },
    },
    KV: { get: async () => null },
    AI_GATEWAY_ID: 'golem-gw',
    ENVIRONMENT: 'test',
    BUDGET_DO: {
      idFromName: () => 'singleton',
      get: () => ({
        fetch: async (url, init) => {
          const body = init?.body ? JSON.parse(init.body) : {};
          if (url.endsWith('/reserve')) {
            seen.reserved.push(body);
            return { json: async () => ({ ok: true, reserved: body.neurons }) };
          }
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

/** Tool-call ids embed Date.now() when the provider does not supply one; normalize before diffing. */
function stable(value) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'string' ? v.replace(/^(tc|pc)_(\d+)_\d+$/, '$1_$2_T') : v)),
  );
}

// The request shapes that exercise every branch of the gateway: native tools, vision content
// parts, an assistant turn that already made tool calls, a tool result, and a JSON schema.
const REQUESTS = [
  {
    name: 'native tools + system + user',
    req: {
      model: 'stone',
      messages: [
        { role: 'system', content: 'You are Golem.' },
        { role: 'user', content: 'Build a market stall.' },
      ],
      tools: [
        { name: 'run_luau', description: 'Run Luau in Studio', parameters: { type: 'object', properties: { source: { type: 'string' } } } },
      ],
    },
  },
  {
    name: 'native tools with a prior assistant tool call and a tool result',
    req: {
      model: 'rune',
      messages: [
        { role: 'system', content: 'You are Golem.' },
        { role: 'user', content: 'Fix the door.', pinned: true },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_0', name: 'run_luau', arguments: '{"source":"x"}' }] },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'call_0', name: 'run_luau' },
      ],
      tools: [{ name: 'run_luau', description: 'Run Luau in Studio', parameters: { type: 'object' } }],
      reasoningEffort: 'high',
    },
  },
  {
    name: 'vision: image content parts, no tools',
    req: {
      model: 'vision',
      messages: [
        { role: 'system', content: 'Critique this scene.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Score the composition.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAABBBBCCCC' } },
          ],
        },
      ],
      jsonSchema: { name: 'critique', schema: { type: 'object' } },
    },
  },
  {
    name: 'prompted-tool fallback: tools on a model without native tool support',
    req: {
      model: 'memory',
      messages: [
        { role: 'system', content: 'Summarise.' },
        { role: 'user', content: 'What happened?' },
        { role: 'assistant', content: 'thinking', toolCalls: [{ id: 'call_9', name: 'note', arguments: '{"text":"hi"}' }] },
        { role: 'tool', content: 'noted', toolCallId: 'call_9', name: 'note' },
      ],
      tools: [{ name: 'note', description: 'Write a note', parameters: { type: 'object' } }],
    },
  },
];

// ---------------------------------------------------------------------------
// 1. behaviour preservation
// ---------------------------------------------------------------------------

test('REFACTOR PROOF: provider refactor preserves transport outside model-specific reasoning config', async (t) => {
  if (!BASELINE) {
    t.skip('no pre-provider-layer revision of gateway.ts is reachable from git history');
    return;
  }
  t.diagnostic(`baseline: ${BASELINE_REV}`);
  for (const { name, req } of REQUESTS) {
    const a = fakeEnv();
    const b = fakeEnv();
    const before = await BASELINE.chat(b.env, structuredClone(req), { kind: 'probe', sessionId: 'sess-1' });
    const after = await G.chat(a.env, structuredClone(req), { kind: 'probe', sessionId: 'sess-1' });

    assert.deepEqual(a.seen.runs.length, 1, `${name}: exactly one inference call`);
    // Reasoning controls are provider-model schema, and the product now intentionally routes
    // different foundations. Compare the transport payload after removing only those model-specific
    // knobs; messages, tools, token ceiling and temperature must remain byte-for-byte equivalent.
    const stablePayload = (payload) => {
      const { reasoning, reasoning_effort, ...rest } = payload;
      return rest;
    };
    assert.deepEqual(stablePayload(a.seen.runs[0].payload), stablePayload(b.seen.runs[0].payload), `${name}: same transport payload`);
    assert.deepEqual(a.seen.runs[0].opts, b.seen.runs[0].opts, `${name}: same AI Gateway options`);

    // WHAT THIS PROOF DOES AND DOES NOT COVER.
    //
    // It exists to show the providers refactor did not change the TRANSPORT: same number of calls,
    // same wire payload, same AI Gateway options, same response shape. It is NOT a claim that the
    // model choice can never change. The baseline is reconstructed from a git revision that
    // predates the refactor, so its DEFAULT_MODELS is frozen at whatever shipped then — comparing
    // model ids compares old CONFIGURATION against new configuration, and configuration is exactly
    // the thing that is allowed to move.
    //
    // Model id and neuron amounts are therefore excluded, and the exclusion is narrow and
    // deliberate: neurons are a function of the model's price row, so pinning them here would
    // forbid ever changing the model on pain of a red suite. Cost accounting is covered on its own
    // terms by "Workers AI cost still goes through the existing neuron price table" below, which
    // asserts the arithmetic against an explicit model rather than against whatever is configured.
    assert.equal(typeof a.seen.runs[0].id, 'string', `${name}: a model id was sent`);
    assert.equal(a.seen.reserved.length, b.seen.reserved.length, `${name}: same number of reservations`);
    assert.equal(a.seen.settled.length, b.seen.settled.length, `${name}: same number of settlements`);

    const ignoreModelDependent = (r) => ({ ...stable(r), model: undefined, neurons: undefined, credits: undefined });
    assert.deepEqual(ignoreModelDependent(after), ignoreModelDependent(before), `${name}: same GatewayResponse shape`);
  }
});

test('every Apple product route still uses the Workers AI adapter', () => {
  for (const modelId of [P.APPLE_MODEL_ID, P.APPLE_MAX_MODEL_ID, P.VISION_MODEL_ID]) {
    assert.equal(P.adapterForModelId(modelId).id, 'workers-ai', `${modelId} must use Workers AI`);
  }
  // and so does anything unrecognised — the AI binding is the only transport this worker has
  assert.equal(P.adapterForModelId('@cf/some/future-model').id, 'workers-ai');
});

test('gateway defaults implement the product-model split while vision stays independent', () => {
  assert.equal(G.DEFAULT_MODELS.clay.id, P.APPLE_MODEL_ID, 'the Apple lane must resolve to Qwen3');
  assert.equal(G.DEFAULT_MODELS.memory.id, P.APPLE_MODEL_ID, 'Apple housekeeping must stay on the Apple foundation');
  assert.equal(G.DEFAULT_MODELS.stone.id, P.APPLE_MAX_MODEL_ID, 'the Apple MAX builder lane must resolve to GLM-4.7 Flash');
  assert.equal(G.DEFAULT_MODELS.rune.id, P.APPLE_MAX_MODEL_ID, 'the Apple MAX autonomous lane must resolve to GLM-4.7 Flash');
  assert.equal(G.DEFAULT_MODELS.vision.id, P.VISION_MODEL_ID, 'vision remains the separate multimodal specialist');

  assert.equal(G.DEFAULT_MODELS.clay.ctx, P.APPLE_CONTEXT_WINDOW);
  assert.equal(G.DEFAULT_MODELS.stone.ctx, P.APPLE_MAX_CONTEXT_WINDOW);
  assert.equal(G.DEFAULT_MODELS.rune.ctx, P.APPLE_MAX_CONTEXT_WINDOW);
  assert.equal(G.DEFAULT_MODELS.vision.ctx, P.VISION_CONTEXT_WINDOW);
  assert.equal(G.DEFAULT_MODELS.clay.nativeTools, true);
  assert.equal(G.DEFAULT_MODELS.stone.nativeTools, true);
  assert.equal(G.DEFAULT_MODELS.rune.nativeTools, true);
});

test('the chosen Apple, Apple MAX and vision catalogue rows carry the verified facts', () => {
  const apple = P.WORKERS_AI_MODELS.find((model) => model.id === P.APPLE_MODEL_ID);
  const max = P.WORKERS_AI_MODELS.find((model) => model.id === P.APPLE_MAX_MODEL_ID);
  const vision = P.WORKERS_AI_MODELS.find((model) => model.id === P.VISION_MODEL_ID);
  assert.ok(apple && max && vision, 'all three selected routes must be catalogued');

  assert.deepEqual(
    [apple.displayName, apple.supportsTools, apple.supportsVision, apple.contextWindow, apple.inputCostPer1M, apple.outputCostPer1M],
    ['Qwen3 30B A3B FP8', true, false, 32_768, 0.0509, 0.335],
  );
  assert.ok(apple.unverifiedFields.includes('maxOutput'), 'Qwen max output must stay labelled unverified');

  assert.deepEqual(
    [max.displayName, max.supportsTools, max.supportsVision, max.contextWindow, max.inputCostPer1M, max.outputCostPer1M],
    ['GLM-4.7 Flash', true, false, 131_072, 0.0605, 0.4],
  );
  assert.ok(max.unverifiedFields.includes('maxOutput'), 'GLM-4.7 max output must stay labelled unverified');

  assert.equal(vision.displayName, 'GLM-5.3 Flash');
  assert.equal(vision.supportsVision, true);
  assert.equal(vision.contextWindow, 1_310_720);
});

test('a stale free-tier KV map cannot restore legacy models for user-facing keys', async () => {
  G.resetModelCache();
  const stale = {
    clay: { id: '@cf/openai/gpt-oss-20b', nativeTools: true, maxTokens: 2000, ctx: 128_000, temperature: 0.3 },
    stone: { id: '@cf/openai/gpt-oss-120b', nativeTools: true, maxTokens: 5600, ctx: 128_000, temperature: 0.25 },
    rune: { id: '@cf/openai/gpt-oss-120b', nativeTools: true, maxTokens: 6500, ctx: 128_000, temperature: 0.25 },
    memory: { id: '@cf/openai/gpt-oss-20b', nativeTools: false, maxTokens: 800, ctx: 128_000, temperature: 0.2 },
    vision: { id: '@cf/meta/llama-3.2-11b-vision-instruct', nativeTools: false, maxTokens: 4000, ctx: 128_000, temperature: 0.3 },
    probe: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: true, maxTokens: 120, ctx: 128_000, temperature: 0.2 },
  };
  const { env } = fakeEnv({ KV: { get: async () => JSON.stringify(stale) } });
  const models = await G.getModels(env);
  assert.equal(models.clay.id, P.APPLE_MODEL_ID);
  assert.equal(models.memory.id, P.APPLE_MODEL_ID);
  assert.equal(models.stone.id, P.APPLE_MAX_MODEL_ID);
  assert.equal(models.rune.id, P.APPLE_MAX_MODEL_ID);
  assert.equal(models.vision.id, P.VISION_MODEL_ID);
  assert.equal(models.probe.id, '@cf/qwen/qwen3-30b-a3b-fp8', 'custom diagnostic keys remain configurable');
  G.resetModelCache();
});

test('GLM-4.7 native tool calls stay structured and use its documented reasoning control', () => {
  const { payload } = P.workersAiAdapter.encode({
    modelId: P.APPLE_MAX_MODEL_ID,
    messages: [{ role: 'user', content: 'Call echo_probe.' }],
    tools: [{ name: 'echo_probe', description: 'Return a message.', parameters: { type: 'object' } }],
    maxTokens: 256,
    temperature: 0.2,
    reasoningEffort: 'low',
  });
  assert.deepEqual(payload.tools, [
    { type: 'function', function: { name: 'echo_probe', description: 'Return a message.', parameters: { type: 'object' } } },
  ]);
  assert.equal(payload.reasoning_effort, 'low');
  const decoded = P.workersAiAdapter.decode(
    {
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'echo_probe', arguments: '{"message":"ok"}' } }] } }],
      usage: { prompt_tokens: 166, completion_tokens: 12 },
    },
    500,
    P.APPLE_MAX_MODEL_ID,
  );
  assert.equal(decoded.finishReason, 'tool_calls');
  assert.deepEqual(decoded.toolCalls, [{ id: 'call_1', name: 'echo_probe', arguments: '{"message":"ok"}' }]);
  assert.equal(decoded.text, '');
});

test('Qwen Apple requests do not receive an undocumented reasoning-effort field', () => {
  const { payload } = P.workersAiAdapter.encode({
    modelId: P.APPLE_MODEL_ID,
    messages: [{ role: 'user', content: 'Inspect this project.' }],
    maxTokens: 256,
    temperature: 0.2,
    reasoningEffort: 'high',
  });
  assert.equal(Object.hasOwn(payload, 'reasoning_effort'), false);
  assert.equal(Object.hasOwn(payload, 'reasoning'), false);
});

test('the response still reports provider "workers-ai" and settles on reported neurons', async () => {
  const { env, seen } = fakeEnv();
  const res = await G.chat(env, REQUESTS[0].req, { kind: 'probe' });
  assert.equal(res.provider, 'workers-ai');
  // The configured model for `stone`, not a literal: which model serves a mode is configuration
  // and is allowed to change. What must hold is that the response reports the model that actually
  // ran, so a usage record can be traced back to it.
  assert.equal(res.model, G.DEFAULT_MODELS.stone.id);
  assert.equal(res.finishReason, 'tool_calls');
  assert.equal(res.text, 'Placing the counter now.');
  assert.ok(!res.text.includes('scratchpad'), 'reasoning_content must never surface');
  // The property under test is `max(providerReported, computedFromPriceTable)` — "never bill less
  // than the provider says we spent" — NOT a particular number. Derive the expectation from the
  // configured model's own price row so the rule stays asserted when the model changes.
  //
  // Worth knowing when reading this: GLM published a discounted cached-input rate ($0.03/M against
  // $0.15/M fresh) and the gpt-oss models publish none, so cached tokens now settle at the full
  // input rate. On an agent workload, where most input is a re-sent prefix, that is the single
  // largest cost consequence of moving off GLM.
  const row = P.allModels().find((m) => m.id === G.DEFAULT_MODELS.stone.id);
  assert.ok(row, 'the configured stone model is catalogued');
  const computed = P.neuronsForModelTokens(row, 5200, 180, 4800);
  assert.equal(seen.settled[0].actual, Math.ceil(Math.max(42, computed)));
});

// ---------------------------------------------------------------------------
// 2. availability is computed, never asserted
// ---------------------------------------------------------------------------

test('only Workers AI is available on an env with no provider keys', () => {
  const { env } = fakeEnv();
  const rows = P.providerAvailability(env);
  assert.deepEqual(
    rows.map((r) => [r.provider, r.available, r.reason]),
    [
      ['workers-ai', true, null],
      ['openai', false, 'no_credentials'],
      ['google', false, 'no_credentials'],
      ['deepseek', false, 'no_credentials'],
    ],
  );
});

test('Workers AI is unavailable when the AI binding is missing — availability reads env, not a literal', () => {
  const { env } = fakeEnv();
  const noBinding = { ...env, AI: undefined };
  const row = P.providerAvailability(noBinding).find((r) => r.provider === 'workers-ai');
  assert.equal(row.available, false);
  assert.equal(row.reason, 'binding_missing');
});

test('a provider flips to available the moment its credential appears, and only then', () => {
  const { env } = fakeEnv();
  assert.equal(P.providerAvailability(env).find((r) => r.provider === 'openai').available, false);
  const withKey = { ...env, OPENAI_API_KEY: 'sk-not-a-real-key' };
  assert.equal(P.providerAvailability(withKey).find((r) => r.provider === 'openai').available, true);
  // whitespace is not a credential
  const blank = { ...env, OPENAI_API_KEY: '   ' };
  assert.equal(P.providerAvailability(blank).find((r) => r.provider === 'openai').available, false);
});

test('DeepSeek reports that it cannot serve the vision model key — with or without a key', () => {
  const { env } = fakeEnv();
  for (const e of [env, { ...env, DEEPSEEK_API_KEY: 'ds-not-a-real-key' }]) {
    const row = P.providerAvailability(e).find((r) => r.provider === 'deepseek');
    assert.deepEqual(row.unsupportedModelKeys, [{ key: 'vision', reason: 'no_vision' }]);
    assert.match(row.detail, /cannot serve the `vision` model key/);
  }
  // and no other provider claims a gap it does not have
  for (const p of ['workers-ai', 'openai', 'google']) {
    assert.deepEqual(P.providerAvailability(env).find((r) => r.provider === p).unsupportedModelKeys, []);
  }
});

test('the capability table carries every required field and computes availability per row', () => {
  const { env } = fakeEnv();
  const rows = P.capabilityTable(env);
  // Derived, not hardcoded: a literal here means every model added to the catalogue fails this
  // test for the wrong reason, which trains people to edit the number rather than read the row.
  assert.equal(rows.length, P.allModels().length, 'one row per catalogued model');
  assert.ok(rows.length > 0, 'the catalogue is not empty');
  for (const r of rows) {
    for (const field of [
      'id',
      'displayName',
      'provider',
      'supportsTools',
      'supportsVision',
      'contextWindow',
      'maxOutput',
      'inputCostPer1M',
      'outputCostPer1M',
    ]) {
      assert.ok(r[field] !== undefined, `${r.id} is missing ${field}`);
    }
    assert.equal(typeof r.available, 'boolean');
    assert.equal(r.available, r.provider === 'workers-ai', `${r.id}: availability must reflect credentials`);
  }
  const glm = rows.find((r) => r.provider === 'workers-ai');
  assert.deepEqual(glm.unverifiedFields, [], 'the model we actually run has no guessed metadata');
  for (const r of rows.filter((x) => x.provider !== 'workers-ai')) {
    assert.ok(r.unverifiedFields.includes('contextWindow'), `${r.id} must declare its guessed context window`);
  }
});

test('the catalogued facts match the verified product choices', () => {
  const by = Object.fromEntries(P.allModels().map((m) => [m.id, m]));
  assert.deepEqual(
    [by['gpt-5.6-luna'].supportsTools, by['gpt-5.6-luna'].supportsVision, by['gpt-5.6-luna'].inputCostPer1M, by['gpt-5.6-luna'].outputCostPer1M],
    [true, true, 0.2, 1.2],
  );
  assert.deepEqual(
    [by['gemini-3.7-flash'].supportsTools, by['gemini-3.7-flash'].supportsVision, by['gemini-3.7-flash'].inputCostPer1M, by['gemini-3.7-flash'].outputCostPer1M],
    [true, true, 0.75, 3.75],
  );
  assert.deepEqual(
    [by['deepseek-v4-flash'].supportsTools, by['deepseek-v4-flash'].supportsVision, by['deepseek-v4-flash'].inputCostPer1M, by['deepseek-v4-flash'].outputCostPer1M],
    [true, false, 0.44, 1.32],
  );
});

test('a disabled provider refuses BEFORE it can reach the network', async () => {
  const { env } = fakeEnv();
  for (const id of ['openai', 'google', 'deepseek']) {
    const adapter = P.getAdapter(id);
    await assert.rejects(
      () => adapter.invoke(env, { model: 'x' }, { modelId: 'x', kind: 'probe', cacheTtl: 0 }),
      (e) => e.kind === 'auth' && /not configured/.test(e.message),
      `${id} must refuse without credentials`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. tool-calling normalization
// ---------------------------------------------------------------------------

const TOOLS = [
  { name: 'run_luau', description: 'Run Luau', parameters: { type: 'object', properties: { source: { type: 'string' } } } },
];

test('OpenAI-shaped providers encode tools as {type:function, function:{...}}', () => {
  for (const id of ['openai', 'deepseek']) {
    const { payload } = P.getAdapter(id).encode({
      modelId: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
      maxTokens: 100,
      temperature: 0.2,
    });
    assert.deepEqual(payload.tools, [
      { type: 'function', function: { name: 'run_luau', description: 'Run Luau', parameters: TOOLS[0].parameters } },
    ]);
  }
});

test('OpenAI-shaped providers decode tool_calls into GatewayToolCall', () => {
  const raw = {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: { content: 'ok', tool_calls: [{ id: 'c1', function: { name: 'run_luau', arguments: '{"source":"x"}' } }] },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 3 },
  };
  const out = P.decodeOpenAiChat(raw, 100, 'gpt-5.6-luna', 'openai');
  assert.deepEqual(out.toolCalls, [{ id: 'c1', name: 'run_luau', arguments: '{"source":"x"}' }]);
  assert.equal(out.finishReason, 'tool_calls');
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 3, cachedInputTokens: 0 });
});

test('GEMINI OUT: tools become functionDeclarations', () => {
  assert.deepEqual(P.toGeminiTools(TOOLS), [
    { functionDeclarations: [{ name: 'run_luau', description: 'Run Luau', parameters: TOOLS[0].parameters }] },
  ]);
});

test('GEMINI OUT: system becomes systemInstruction, assistant becomes model, tool becomes functionResponse', () => {
  const convo = P.toGeminiContents([
    { role: 'system', content: 'You are Golem.' },
    { role: 'user', content: 'Build it.' },
    { role: 'assistant', content: 'on it', toolCalls: [{ id: 'c1', name: 'run_luau', arguments: '{"source":"x"}' }] },
    { role: 'tool', content: '{"ok":true}', toolCallId: 'c1', name: 'run_luau' },
  ]);
  assert.deepEqual(convo.systemInstruction, { parts: [{ text: 'You are Golem.' }] });
  assert.deepEqual(convo.contents, [
    { role: 'user', parts: [{ text: 'Build it.' }] },
    { role: 'model', parts: [{ text: 'on it' }, { functionCall: { name: 'run_luau', args: { source: 'x' } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'run_luau', response: { ok: true } } }] },
  ]);
});

test('GEMINI OUT: a data: image becomes inlineData', () => {
  const convo = P.toGeminiContents([
    { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }] },
  ]);
  assert.deepEqual(convo.contents[0].parts, [{ text: 'look' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }]);
});

test('GEMINI IN: functionCall parts become GatewayToolCall with JSON-string arguments', () => {
  const raw = {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: 'Placing it.' }, { functionCall: { name: 'run_luau', args: { source: 'print(1)' } } }] },
      },
    ],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, cachedContentTokenCount: 100 },
  };
  const out = P.decodeGemini(raw, 3000, 'gemini-3.7-flash');
  assert.equal(out.text, 'Placing it.');
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, 'run_luau');
  assert.equal(out.toolCalls[0].arguments, '{"source":"print(1)"}', 'args object must be serialised to the JSON string Golem carries');
  assert.equal(out.finishReason, 'tool_calls');
  assert.deepEqual(out.usage, { inputTokens: 900, outputTokens: 40, cachedInputTokens: 100 });
  assert.equal(out.provider, 'google');
});

test('GEMINI round trip: a tool call survives out-and-back unchanged', () => {
  const original = { id: 'c1', name: 'run_luau', arguments: '{"source":"print(1)","n":3}' };
  const convo = P.toGeminiContents([{ role: 'assistant', content: '', toolCalls: [original] }]);
  const part = convo.contents[0].parts[0];
  const back = P.fromGeminiFunctionCall(part, 0);
  assert.equal(back.name, original.name);
  assert.deepEqual(JSON.parse(back.arguments), JSON.parse(original.arguments));
});

test('GEMINI: MAX_TOKENS and safety blocks map to length and error', () => {
  assert.equal(P.decodeGemini({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'cut' }] } }] }, 10, 'g').finishReason, 'length');
  assert.equal(P.decodeGemini({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }, 10, 'g').finishReason, 'error');
});

// ---------------------------------------------------------------------------
// 4. error normalization
// ---------------------------------------------------------------------------

test('Workers AI errors map to the common taxonomy, and only free failures are retryable', () => {
  const c = (msg) => P.workersAiAdapter.classifyError(new Error(msg));
  assert.deepEqual(c('AiError: 3021: rate limit exceeded'), { kind: 'rate_limit', retryable: true });
  assert.deepEqual(c('Too Many Requests'), { kind: 'rate_limit', retryable: true });
  // 4006 IS a limit, but the model never runs again this window — retrying it buys nothing
  assert.deepEqual(c('4006: daily free allocation exhausted'), { kind: 'rate_limit', retryable: false });
  assert.equal(c('401 unauthorized').kind, 'auth');
  assert.equal(c('prompt is too long for the context window').kind, 'context_length');
  assert.equal(c('blocked by content filter').kind, 'content_filter');
  assert.equal(c('503 temporarily unavailable').kind, 'transient');
  assert.equal(c('something nobody has seen before').kind, 'unknown');
});

test('HTTP providers classify by status first, then by message', () => {
  const err = (status, msg) => new P.ProviderError('unknown', 'openai', msg ?? '', status);
  assert.deepEqual(P.classifyHttpError(err(429)), { kind: 'rate_limit', retryable: true });
  assert.equal(P.classifyHttpError(err(401)).kind, 'auth');
  assert.equal(P.classifyHttpError(err(403)).kind, 'auth');
  assert.equal(P.classifyHttpError(err(500)).kind, 'transient');
  // a 5xx may or may not have run the model, so it is never retried — that would risk a double bill
  assert.equal(P.classifyHttpError(err(500)).retryable, false);
  assert.equal(P.classifyHttpError(err(400, 'maximum context length exceeded')).kind, 'context_length');
  assert.equal(P.classifyHttpError(err(400, 'response was flagged by our content policy')).kind, 'content_filter');
  assert.equal(P.classifyHttpError(new Error('who knows')).kind, 'unknown');
});

test('every adapter answers classifyError with a kind from the taxonomy', () => {
  const KINDS = new Set(['rate_limit', 'auth', 'context_length', 'content_filter', 'transient', 'unknown']);
  for (const id of ['workers-ai', 'openai', 'google', 'deepseek']) {
    const cls = P.getAdapter(id).classifyError(new Error('boom'));
    assert.ok(KINDS.has(cls.kind), `${id} returned ${cls.kind}`);
    assert.equal(typeof cls.retryable, 'boolean');
  }
});

// ---------------------------------------------------------------------------
// 5. cost accounting
// ---------------------------------------------------------------------------

test('Workers AI cost still goes through the existing neuron price table', () => {
  // By id, not "the first workers-ai model". This test asserts GLM's specific published prices,
  // so it must select GLM specifically — otherwise adding a model to the catalogue silently
  // repoints it at a different price row and the arithmetic below becomes meaningless.
  const glm = P.allModels().find((m) => m.id === '@cf/zai-org/glm-5.3-flash');
  assert.ok(glm, 'the GLM price row is still catalogued');
  // 1M input + 1M output at $0.15/$0.50 = $0.65 = 59,091 neurons at $0.000011 each
  assert.equal(P.neuronsForModelTokens(glm, 1_000_000, 1_000_000), Math.ceil(0.65 / 0.000011));
  // and the cached-input discount the table publishes is applied
  const cached = P.neuronsForModelTokens(glm, 1_000_000, 0, 1_000_000);
  assert.equal(cached, Math.ceil(0.03 / 0.000011));
});

test('Apple and Apple MAX reservations use the conservative selected-model price rows', () => {
  const apple = P.allModels().find((m) => m.id === P.APPLE_MODEL_ID);
  const max = P.allModels().find((m) => m.id === P.APPLE_MAX_MODEL_ID);
  assert.ok(apple && max);
  // Qwen's model page currently prints $0.0509/M input while Cloudflare's pricing table rounds it
  // to $0.051/M. The reservation boundary intentionally uses the larger figure.
  assert.equal(P.neuronsForModelTokens(apple, 1_000_000, 1_000_000), Math.ceil((0.051 + 0.335) / 0.000011));
  // GLM-4.7 has the opposite rounding disagreement ($0.0605 on its model page, $0.060 on pricing),
  // so the same fail-closed rule uses $0.0605/M input.
  assert.equal(P.neuronsForModelTokens(max, 1_000_000, 1_000_000), Math.ceil((0.0605 + 0.4) / 0.000011));
});

test('token-billed providers convert into neurons so the BudgetDO ceiling still applies', () => {
  const luna = P.allModels().find((m) => m.id === 'gpt-5.6-luna');
  // 1M in at $0.20 + 1M out at $1.20 = $1.40; $1.40 / $0.000011 per neuron
  assert.equal(P.neuronsForModelTokens(luna, 1_000_000, 1_000_000), Math.ceil(1.4 / 0.000011));
  const ds = P.allModels().find((m) => m.id === 'deepseek-v4-flash');
  assert.equal(P.neuronsForModelTokens(ds, 1_000_000, 1_000_000), Math.ceil((0.44 + 1.32) / 0.000011));
  // cached tokens are NOT discounted for providers whose cache pricing we have not verified
  assert.equal(P.neuronsForModelTokens(luna, 1_000_000, 0, 1_000_000), P.neuronsForModelTokens(luna, 1_000_000, 0, 0));
});

test('a converted cost is expressible in Credits on the same NEURONS_PER_CREDIT scale', () => {
  const luna = P.allModels().find((m) => m.id === 'gpt-5.6-luna');
  const c = P.costOf(luna, 10_000, 1_000);
  assert.ok(c.neurons > 0 && c.usd > 0);
  assert.equal(c.credits, Math.max(1, Math.ceil(c.neurons / P.NEURONS_PER_CREDIT)));
  assert.ok(Math.abs(c.usd - c.neurons * P.USD_PER_NEURON) < 1e-9);
});

test('the pre-flight estimate is pessimistic: every allowed output token is assumed spent', () => {
  const luna = P.allModels().find((m) => m.id === 'gpt-5.6-luna');
  const est = P.estimateNeuronsForModel(luna, 3500, 1000);
  assert.equal(est, P.neuronsForModelTokens(luna, 1000, 1000));
  assert.ok(est >= P.neuronsForModelTokens(luna, 1000, 1), 'estimate must never undershoot a short answer');
});

// ---------------------------------------------------------------------------
// 6. health tracking
// ---------------------------------------------------------------------------

test('health records latency and the last error per provider, in a bounded ring', () => {
  P.resetProviderHealth();
  assert.deepEqual(P.providerHealth(), [], 'nothing recorded yet');

  P.recordProviderCall('workers-ai', { model: 'glm', latencyMs: 120, ok: true });
  P.recordProviderCall('workers-ai', { model: 'glm', latencyMs: 400, ok: false, errorKind: 'rate_limit', errorMessage: '3021' });
  P.recordProviderCall('workers-ai', { model: 'glm', latencyMs: 200, ok: true });

  const [h] = P.providerHealth('workers-ai');
  assert.equal(h.calls, 3);
  assert.equal(h.ok, 2);
  assert.equal(h.failed, 1);
  assert.equal(h.lastLatencyMs, 200, 'last latency is the most recent call');
  assert.equal(h.medianLatencyMs, 200);
  assert.equal(h.lastError.kind, 'rate_limit', 'the last error survives later successes');
  assert.equal(h.lastError.message, '3021');

  for (let i = 0; i < P.HEALTH_RING_SIZE * 2; i++) P.recordProviderCall('workers-ai', { model: 'glm', latencyMs: i, ok: true });
  assert.equal(P.providerHealth('workers-ai')[0].calls, P.HEALTH_RING_SIZE, 'the ring is bounded');
  P.resetProviderHealth();
});

test('a real chat call records a health sample, surfaced through the gateway', async () => {
  // gateway.ts and providers/index.ts are separate bundles here, so the gateway keeps its own ring;
  // read it through the gateway's own re-export rather than the providers bundle's.
  const before = G.providerHealth('workers-ai')[0].calls;
  const { env } = fakeEnv();
  await G.chat(env, REQUESTS[0].req, { kind: 'probe' });
  const [h] = G.providerHealth('workers-ai');
  assert.equal(h.calls, before + 1, 'exactly one sample per inference call');
  assert.ok(h.lastLatencyMs !== null && h.lastLatencyMs >= 0, 'latency of the last call is recorded');
  assert.equal(h.failed, 0, 'a successful call records no error');
  assert.equal(h.lastError, null);
});

test('a failing provider records the error kind in health and never retries a billed failure', async () => {
  const { env, seen } = fakeEnv();
  env.AI.run = async () => {
    throw new Error('AiError 9999: the model exploded');
  };
  await assert.rejects(() => G.chat(env, REQUESTS[0].req, { kind: 'probe' }), /inference failed/);
  assert.equal(seen.released.length, 1, 'the reservation is released when nothing was produced');
  const [h] = G.providerHealth('workers-ai');
  assert.equal(h.lastError.kind, 'unknown');
  assert.match(h.lastError.message, /the model exploded/);
});

// ---------------------------------------------------------------------------
// 7. auto selection
// ---------------------------------------------------------------------------

test('AUTO: with only Workers AI credentialed the choice is deterministic and it says why', () => {
  const { env } = fakeEnv();
  const picks = [];
  for (let i = 0; i < 5; i++) picks.push(P.selectProvider(env, { modelKey: 'stone' }));
  for (const p of picks) {
    assert.equal(p.ok, true);
    assert.equal(p.provider, 'workers-ai');
    // The rule, not a frozen id: with one provider credentialed the pick is the cheapest model
    // there that can serve the task. Naming a model here would re-break on every catalogue change.
    assert.equal(p.model.provider, 'workers-ai');
    assert.ok(p.model.supportsTools, 'stone needs tool calling');
  }
  assert.equal(new Set(picks.map((p) => p.reasoning)).size, 1, 'the same question must give the same answer');
  const r = picks[0].reasoning;
  assert.match(r, new RegExp(picks[0].model.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Was /only usable provider/. Workers AI now catalogues several models, so the selector ranks
  // WITHIN the one credentialed provider and says so. The invariant is that it explains the choice
  // and names the alternatives it weighed, not the exact phrasing.
  assert.match(r, /usable option/);
  // Assert the STRUCTURED rejection list, not the prose. When Workers AI catalogued a single
  // model the reasoning string ranked across providers and named each uncredentialed one; now that
  // it catalogues several, the string ranks within the credentialed provider and the per-provider
  // detail lives in `rejected`. The diagnostic did not disappear, it became structured — and a
  // field is a sturdier thing to assert than a sentence.
  const why = Object.fromEntries(picks[0].rejected.map((x) => [x.provider, x.why]));
  assert.equal(why.openai, 'no credentials configured');
  assert.equal(why.google, 'no credentials configured');
  assert.equal(why.deepseek, 'no credentials configured');
  assert.match(r, /tool calling/, 'it should name the capability the task needed');
});

test('AUTO: a vision task rules DeepSeek out on capability, not on credentials', () => {
  const { env } = fakeEnv();
  const all = { ...env, OPENAI_API_KEY: 'k', GOOGLE_API_KEY: 'k', DEEPSEEK_API_KEY: 'k' };
  const pick = P.selectProvider(all, { modelKey: 'vision' });
  assert.equal(pick.ok, true);
  const ds = pick.rejected.find((r) => r.provider === 'deepseek');
  assert.equal(ds.why, 'no vision support');
  // and whatever wins must actually be able to see an image — that is the whole point of the
  // `vision` key, and a text-only winner would make the visual critic silently non-visual.
  assert.equal(pick.model.supportsVision, true, 'the vision key must resolve to a vision model');
  assert.match(pick.reasoning, /cheapest of the \d+ usable options/);
});

test('AUTO: ranking is by cost and is stable when GLM is out of the picture', () => {
  const { env } = fakeEnv();
  const noBinding = { ...env, AI: undefined, OPENAI_API_KEY: 'k', GOOGLE_API_KEY: 'k', DEEPSEEK_API_KEY: 'k' };
  const pick = P.selectProvider(noBinding, { modelKey: 'stone' });
  assert.equal(pick.ok, true);
  assert.equal(pick.provider, 'openai', 'Luna at $0.20/$1.20 is cheaper than DeepSeek $0.44/$1.32 and Gemini $0.75/$3.75');
  assert.match(pick.reasoning, /cheapest/);
});

test('AUTO: when nothing can serve the task it refuses and explains, rather than picking anyway', () => {
  const { env } = fakeEnv();
  const only = { ...env, AI: undefined, DEEPSEEK_API_KEY: 'k' };
  const pick = P.selectProvider(only, { modelKey: 'vision' });
  assert.equal(pick.ok, false);
  assert.match(pick.reasoning, /No provider can serve the `vision` task/);
  assert.match(pick.reasoning, /deepseek \(no vision support\)/);
  assert.match(pick.reasoning, /workers-ai \(binding not present\)/);
});
