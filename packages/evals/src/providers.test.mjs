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
// 2. THE LAYER IS HONEST. The Workers AI binding is the only transport. The direct-HTTP OpenAI,
//    Google and DeepSeek adapters, which never had a credential, were removed by D-VISION-1: the
//    outside models (Gemini, GPT-5.6) now run on the same binding through AI Gateway, and their
//    wires are proven in apps/worker/tests/model-wires.test.mjs. So the tests below assert that no
//    stray key can bring a second transport back, and that an outside model without a gateway is
//    refused before it reaches the binding.
//
// NOTHING IN THIS FILE MAKES A NETWORK CALL. Every provider response is a synthetic fixture.
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

const modelsFile = bundle(join(ROOT, 'packages', 'shared', 'src', 'models.ts'), 'models');
const { MODEL_REGISTRY } = await import(`file://${modelsFile}`);
rmSync(modelsFile, { force: true });
const OUTSIDE = MODEL_REGISTRY.filter((m) => m.route === 'unified-billing');

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
    //[[ THE RENAME IS STATED, NOT HIDDEN.
    //
    //   This proof drives ONE request through two revisions: `BASELINE`, reconstructed from a git
    //   revision that predates the provider layer, and the live gateway. The baseline's
    //   DEFAULT_MODELS is frozen in the vocabulary that shipped then — `clay`/`stone`/`rune` — while
    //   the live catalogue is keyed by the product's own modes. So no single model key is valid on
    //   both sides, and `baselineModel` names the equivalent: `agent` IS what `stone` became.
    //
    //   It does not weaken the comparison. The key selects CONFIGURATION and nothing else, and the
    //   assertions below already exclude model-dependent configuration (id, max_tokens, neurons) for
    //   exactly that reason. What must match — the number of calls, the messages, the tools, the AI
    //   Gateway options — is untouched by which key was used to look up a ceiling.
    //
    //   RE-AIMED 2026-09-22: these fixtures named `stone`/`rune` outright, so `G.chat` threw
    //   `unknown model key: stone` and the whole refactor proof failed before it compared anything. ]]
    baselineModel: 'stone',
    req: {
      model: 'agent',
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
    baselineModel: 'rune',
    req: {
      model: 'plan',
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
  for (const { name, req, baselineModel } of REQUESTS) {
    const a = fakeEnv();
    const b = fakeEnv();
    // The baseline speaks the vocabulary that shipped with it; the live gateway speaks the product
    // modes. `baselineModel` bridges the two — see the note on the first fixture.
    const before = await BASELINE.chat(b.env, structuredClone({ ...req, model: baselineModel ?? req.model }), { kind: 'probe', sessionId: 'sess-1' });
    const after = await G.chat(a.env, structuredClone(req), { kind: 'probe', sessionId: 'sess-1' });

    assert.deepEqual(a.seen.runs.length, 1, `${name}: exactly one inference call`);
    // Reasoning controls are provider-model schema, and the product now intentionally routes
    // different foundations. Compare the transport payload after removing only those model-specific
    // knobs; messages, tools and temperature must remain byte-for-byte equivalent.
    //
    // RE-AIMED 2026-09-20: `max_tokens` moved out of the comparison, for the SAME reason model id
    // and neurons were already excluded twenty lines below — it is configuration, and configuration
    // is the thing that is allowed to move. It is not an independent fact about the transport:
    // gateway.ts:372 computes it as `min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)`, so it is
    // read straight out of DEFAULT_MODELS. The baseline is a frozen pre-refactor revision, so its
    // DEFAULT_MODELS is frozen too, and comparing the two compared old configuration against new.
    //
    // What actually reversed: 600ab00 found that `stone` and `rune` are the SAME model
    // (@cf/zai-org/glm-5.3-flash) carrying different ceilings — 5600 and 6500 — with nothing in the
    // file explaining why, and raised stone to 6500. That is the deliberate decision this assertion
    // had been defending against, and it turned a real fix red: the owner's 16-step build died on
    // step 1 having been charged 30 Credits for nothing usable. Leaving `max_tokens` here would
    // forbid ever correcting a model's ceiling on pain of a red suite — the identical argument the
    // file already makes for neurons ("pinning them here would forbid ever changing the model").
    //
    // The property this test exists for is untouched: the providers refactor did not change the
    // TRANSPORT — same number of calls, same messages, same tools, same temperature, same AI
    // Gateway options. The token ceiling is covered on its own terms by the clamp-before-reserve
    // ordering asserted in apps/worker/tests/effort-output-budget.test.mjs.
    const stablePayload = (payload) => {
      const { reasoning, reasoning_effort, max_tokens, ...rest } = payload;
      return rest;
    };
    assert.deepEqual(stablePayload(a.seen.runs[0].payload), stablePayload(b.seen.runs[0].payload), `${name}: same transport payload`);
    // RE-AIMED (D-VISION-1): the live gateway's log metadata now also names the model a call went
    // to, so the gateway's own log attributes spend per model. The model id is configuration and is
    // excluded above for that reason; every other option — gateway id, cache TTL, logging, the
    // `kind`, the session-affinity header — must still match the baseline exactly.
    const withoutModelTag = (opts) => {
      const o = structuredClone(opts);
      if (o?.gateway?.metadata) delete o.gateway.metadata.model;
      return o;
    };
    assert.equal(a.seen.runs[0].opts?.gateway?.metadata?.model, a.seen.runs[0].id, `${name}: the log names the model that ran`);
    assert.deepEqual(withoutModelTag(a.seen.runs[0].opts), b.seen.runs[0].opts, `${name}: same AI Gateway options`);

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

test('gateway defaults: the run modes share one foundation, and memory and vision stay independent', () => {
  // RE-AIMED 2026-09-22. This asserted a "product-model SPLIT" — clay on Qwen3, stone and rune on
  // GLM — where the ENTITLEMENT picked the foundation model. That split was retired deliberately:
  // entitlement now controls paid capabilities and the reasoning policy, the run mode controls the
  // toolset, and `gatewayModelFor(mode, productModel)` voids its second argument and returns the
  // mode. The old assertions therefore named a mechanism that no longer exists, and the property
  // is restated as what replaced it. The two lanes that genuinely ARE independent — housekeeping
  // and vision — are still pinned, on their own terms.
  for (const mode of ['plan', 'agent']) {
    assert.equal(G.DEFAULT_MODELS[mode].id, P.APPLE_MAX_MODEL_ID, `${mode} runs on the measured GLM-5.3 Flash foundation`);
    assert.equal(G.DEFAULT_MODELS[mode].ctx, P.APPLE_MAX_CONTEXT_WINDOW, `${mode} gets the full context window`);
    assert.equal(G.DEFAULT_MODELS[mode].nativeTools, true, `${mode} must be able to call tools natively`);
  }
  // The lane that is NOT a run mode, and stays on the cheap foundation for housekeeping.
  assert.equal(G.DEFAULT_MODELS.memory.id, P.APPLE_MODEL_ID, 'housekeeping stays on the cheap Qwen3 foundation');
  assert.equal(G.DEFAULT_MODELS.memory.ctx, P.APPLE_CONTEXT_WINDOW);
  assert.equal(G.DEFAULT_MODELS.memory.nativeTools, false, 'housekeeping is not given a toolset');
  // Vision shares the MAX model id and is still a separate lane: smaller ceiling, no tools.
  assert.equal(G.DEFAULT_MODELS.vision.id, P.VISION_MODEL_ID, 'vision remains the separate multimodal specialist');
  assert.equal(G.DEFAULT_MODELS.vision.ctx, P.VISION_CONTEXT_WINDOW);
  assert.equal(G.DEFAULT_MODELS.vision.nativeTools, false);
  // THE KEY SET IS THE CONTRACT, so it is asserted rather than assumed: two run modes, the two
  // lanes that are not run modes, and — since D-VISION-1 — one key per outside model, named by its
  // registry id and read from the registry rather than listed here. A third run-mode key would
  // mean Autonomous crept back in as a mode.
  const outside = MODEL_REGISTRY.filter((m) => m.route === 'unified-billing').map((m) => m.id);
  assert.ok(outside.length >= 1, 'the registry lists no outside model — the subtraction below checks nothing');
  //
  // TRAINING LAB KEYS, reviewed 2026-09-23 (15b5a04, `lab-llama-3b` / `lab-qwen-coder-32b`): the two
  // Workers AI bases that accept LoRA adapters, for /api/admin/model-test (ADMIN_KEY) to score an
  // adapter against its base. They are not run modes: no product path can select one, because the
  // run's key comes from `gatewayModelFor(mode, productModel)`, which returns the mode or a
  // registry id routed 'unified-billing' — and a lab key is in neither. Both ids are priced in
  // pricing.ts MODEL_PRICES, so the spend gate meters them like any other call.
  const lab = Object.keys(G.DEFAULT_MODELS).filter((k) => k.startsWith('lab-'));
  for (const k of lab) {
    assert.equal(MODEL_REGISTRY.some((m) => m.id === k), false, `${k} is in the product registry — a customer could select it`);
  }
  assert.deepEqual(Object.keys(G.DEFAULT_MODELS).filter((k) => !outside.includes(k) && !lab.includes(k)).sort(), ['agent', 'memory', 'plan', 'vision']);
  for (const id of outside) assert.ok(G.DEFAULT_MODELS[id], `no model key for ${id}`);
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

  // APPLE MAX AND VISION ARE THE SAME ROW SINCE 2026-09-19, and this test now says so rather than
  // asserting the same object twice under two names as if it had checked two things.
  assert.equal(max.id, vision.id, 'the MAX lane and the visual critic resolve to one model');
  assert.deepEqual(
    [max.displayName, max.supportsTools, max.supportsVision, max.contextWindow, max.inputCostPer1M, max.outputCostPer1M],
    ['GLM-5.3 Flash', true, true, 1_310_720, 0.15, 0.5],
  );
  // The MAX lane became MULTIMODAL as a side effect of the move — nobody asked for that, it simply
  // follows from the weights, and a reader of this file should learn it here rather than from a
  // support ticket. The lanes stay separate in DEFAULT_MODELS; only the model behind them merged.
  // (`stone` here until 2026-09-22; the gateway key is now the product mode, `agent`.)
  assert.equal(G.DEFAULT_MODELS.agent.id, G.DEFAULT_MODELS.vision.id);
  assert.notEqual(G.DEFAULT_MODELS.agent.maxTokens, G.DEFAULT_MODELS.vision.maxTokens);

  // Exactly one catalogue row for that id. Two rows would make `modelById` answer with whichever
  // came first and hide the other's prices — which is how a billing figure goes wrong silently.
  assert.equal(P.WORKERS_AI_MODELS.filter((m) => m.id === P.APPLE_MAX_MODEL_ID).length, 1);
});

test('a stale free-tier KV map cannot restore legacy models for user-facing keys', async () => {
  G.resetModelCache();
  // THE STALE MAP KEEPS ITS LEGACY KEYS ON PURPOSE. This is not a list of today's modes — it is a
  // fixture standing in for a `config:models` row an older deployment actually wrote, and the whole
  // point is that such a row must not be able to resurrect a retired model. Renaming its keys to
  // plan/agent would delete the scenario the test exists for. The live keys the product reads are
  // asserted below against the CURRENT catalogue.
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
  // The two run modes: absent from the stale row, so the compiled defaults hold.
  assert.equal(models.plan.id, P.APPLE_MAX_MODEL_ID, 'Plan must not be routed by a stale KV row');
  assert.equal(models.agent.id, P.APPLE_MAX_MODEL_ID, 'Agent must not be routed by a stale KV row');
  // Present in the stale row with a RETIRED model id — the override must be refused, not applied.
  assert.equal(models.memory.id, P.APPLE_MODEL_ID, 'a stale row must not put housekeeping back on gpt-oss');
  assert.equal(models.vision.id, P.VISION_MODEL_ID, 'a stale row must not put vision back on llama-3.2-11b');
  // …while a custom diagnostic key is still the operator's to configure. The refusal is scoped to
  // the user-facing keys, not to the KV override itself.
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
  // The configured model for `agent`, not a literal: which model serves a mode is configuration
  // and is allowed to change. What must hold is that the response reports the model that actually
  // ran, so a usage record can be traced back to it.
  assert.equal(res.model, G.DEFAULT_MODELS.agent.id);
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
  const row = P.allModels().find((m) => m.id === G.DEFAULT_MODELS.agent.id);
  assert.ok(row, 'the configured agent model is catalogued');
  const computed = P.neuronsForModelTokens(row, 5200, 180, 4800);
  assert.equal(seen.settled[0].actual, Math.ceil(Math.max(42, computed)));
});

// ---------------------------------------------------------------------------
// 2. availability is computed, never asserted
// ---------------------------------------------------------------------------

test('Workers AI is the only platform provider, and it claims no gap it does not have', () => {
  const { env } = fakeEnv();
  const rows = P.providerAvailability(env);
  assert.deepEqual(rows.map((r) => [r.provider, r.available, r.reason]), [['workers-ai', true, null]]);
  assert.deepEqual(rows[0].unsupportedModelKeys, []);
});

test('Workers AI is unavailable when the AI binding is missing — availability reads env, not a literal', () => {
  const { env } = fakeEnv();
  const noBinding = { ...env, AI: undefined };
  const row = P.providerAvailability(noBinding).find((r) => r.provider === 'workers-ai');
  assert.equal(row.available, false);
  assert.equal(row.reason, 'binding_missing');
});

test('a stray provider key brings no second transport back', () => {
  // RESTATED (D-VISION-1). This asserted that OpenAI flipped to available when OPENAI_API_KEY
  // appeared. That adapter is gone, and the property that replaces it is the opposite one: a key
  // left in the environment must not open a path that bypasses the gateway and its credits.
  const { env } = fakeEnv();
  const keyed = { ...env, OPENAI_API_KEY: 'sk-not-a-real-key', GOOGLE_API_KEY: 'k', DEEPSEEK_API_KEY: 'k' };
  assert.deepEqual(P.providerAvailability(keyed), P.providerAvailability(env));
  assert.deepEqual(P.capabilityTable(keyed).map((r) => r.provider), P.capabilityTable(env).map((r) => r.provider));
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

test('the outside models are not in the platform catalogue, so no capability row claims them', () => {
  // RESTATED (D-VISION-1). This pinned the prices of the retired direct-HTTP catalogue rows. The
  // outside models' prices now live in pricing.ts MODEL_PRICES, pinned by
  // apps/worker/tests/model-step-caps.test.mjs. What this file owns is availability: an outside
  // model is not "available" until a live call through the gateway has been observed (Q-006), so it
  // must not appear as a row the capability table would report available.
  assert.ok(OUTSIDE.length >= 1, 'the registry lists no outside model — this checks nothing');
  const catalogued = new Set(P.allModels().map((m) => m.id));
  for (const m of OUTSIDE) assert.equal(catalogued.has(m.providerModelId), false, `${m.id} is in the platform catalogue`);
});

test('an outside model without AI_GATEWAY_ID refuses BEFORE it can reach the binding', async () => {
  // RESTATED (D-VISION-1). The disabled HTTP adapters this covered are gone. The same property now
  // belongs to the outside models: only a call that names the gateway is billed to its credits.
  for (const m of OUTSIDE) {
    G.resetModelCache();
    const { env, seen } = fakeEnv({ AI_GATEWAY_ID: undefined });
    await assert.rejects(() => G.chat(env, { model: m.id, messages: [{ role: 'user', content: 'hi' }] }, { kind: 'probe' }), /AI_GATEWAY_ID/);
    assert.equal(seen.runs.length, 0, `${m.id} reached the binding without a gateway`);
    assert.equal(seen.released.length, seen.reserved.length, `${m.id}: the hold was not handed back`);
  }
  G.resetModelCache();
  // The refusals above are real failures in the gateway's health ring; later tests read that ring
  // as if it started clean.
  G.resetProviderHealth();
});

// ---------------------------------------------------------------------------
// 3. tool-calling normalization
// ---------------------------------------------------------------------------

const TOOLS = [
  { name: 'run_luau', description: 'Run Luau', parameters: { type: 'object', properties: { source: { type: 'string' } } } },
];

test('OpenAI-shaped providers encode tools as {type:function, function:{...}}', () => {
  // The chat wire on the binding. The standalone OpenAI-compatible encoder served only the
  // customer-key path and went with BYOK (D-VISION-1); every model now encodes here.
  for (const encode of [P.workersAiAdapter.encode]) {
    const { payload } = encode({
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
  const out = P.workersAiAdapter.decode(raw, 100, P.APPLE_MODEL_ID);
  assert.deepEqual(out.toolCalls, [{ id: 'c1', name: 'run_luau', arguments: '{"source":"x"}' }]);
  assert.equal(out.finishReason, 'tool_calls');
  // The token counts, by field: the binding's decoder also carries `reportedNeurons` (absent here).
  const { inputTokens, outputTokens, cachedInputTokens } = out.usage;
  assert.deepEqual({ inputTokens, outputTokens, cachedInputTokens }, { inputTokens: 10, outputTokens: 3, cachedInputTokens: 0 });
});

// The direct Gemini adapter (functionDeclarations, systemInstruction, inlineData) was removed by
// D-VISION-1: Gemini now runs on the binding's chat-completions wire, whose encode/decode are
// covered above and in apps/worker/tests/model-wires.test.mjs.

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

// `classifyHttpError` (status-first classification for direct HTTP providers) was removed with
// providers/openai.ts in D-VISION-1: no provider this worker calls speaks HTTP to it directly any
// more — every model, Apple's and the outside ones, is reached through the AI binding.

test('every adapter answers classifyError with a kind from the taxonomy', () => {
  const KINDS = new Set(['rate_limit', 'auth', 'context_length', 'content_filter', 'transient', 'unknown']);
  assert.ok(P.PROVIDER_ORDER.length >= 1);
  for (const id of P.PROVIDER_ORDER) {
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

  // THE PAID LANE GOT DEARER ON 2026-09-19 and this is the assertion that noticed. GLM-4.7 cost
  // $0.0605/$0.40 and reserved 41,864 neurons for 1M in + 1M out; GLM-5.3 costs $0.15/$0.50 and
  // reserves 59,091 — a 41% increase on the mode customers pay for, and the price of putting the
  // MAX lane on the only MAX model this product has ever measured.
  assert.equal(P.neuronsForModelTokens(max, 1_000_000, 1_000_000), Math.ceil((0.15 + 0.5) / 0.000011));
  assert.equal(P.neuronsForModelTokens(max, 1_000_000, 1_000_000), 59_091);
  const glm47 = Math.ceil((0.0605 + 0.4) / 0.000011);
  assert.ok(
    P.neuronsForModelTokens(max, 1_000_000, 1_000_000) > glm47,
    'if this ever stops being true the lane moved again and the credit model needs re-checking',
  );

  // What takes the sting out: GLM-5.3 is the one Workers AI row that publishes a cached-input rate,
  // and a builder lane re-sends a large fixed prompt every turn. Cached input is $0.03/M against
  // $0.15 — so the tokens that repeat are billed at a FIFTH of the new headline rate, and below the
  // old lane's uncached rate. The reservation above stays pessimistic and assumes none of it.
  const cached = P.neuronsForModelTokens(max, 1_000_000, 0, 1_000_000);
  assert.equal(cached, Math.ceil(0.03 / 0.000011));
  assert.ok(cached < P.neuronsForModelTokens(max, 1_000_000, 0, 0), 'the cached discount is not reaching the MAX lane');
});

// RESTATED (D-VISION-1). These three used the retired OpenAI and DeepSeek catalogue rows. The
// conversion they pin is still cost.ts's, so they now run against an explicit token-billed record
// that is not on the Workers AI table — the arithmetic, not a catalogue entry, is the subject.
const TOKEN_BILLED = {
  id: 'token-billed-probe', displayName: 'probe', provider: 'openrouter', supportsTools: true, supportsVision: false,
  contextWindow: 128_000, maxOutput: 16_384, inputCostPer1M: 0.2, outputCostPer1M: 1.2, unverifiedFields: [],
};

test('token-billed providers convert into neurons so the BudgetDO ceiling still applies', () => {
  const luna = TOKEN_BILLED;
  // 1M in at $0.20 + 1M out at $1.20 = $1.40; $1.40 / $0.000011 per neuron
  assert.equal(P.neuronsForModelTokens(luna, 1_000_000, 1_000_000), Math.ceil(1.4 / 0.000011));
  // cached tokens are NOT discounted for providers whose cache pricing we have not verified
  assert.equal(P.neuronsForModelTokens(luna, 1_000_000, 0, 1_000_000), P.neuronsForModelTokens(luna, 1_000_000, 0, 0));
});

test('a converted cost is expressible in Credits on the same NEURONS_PER_CREDIT scale', () => {
  const luna = TOKEN_BILLED;
  const c = P.costOf(luna, 10_000, 1_000);
  assert.ok(c.neurons > 0 && c.usd > 0);
  assert.equal(c.credits, Math.max(1, Math.ceil(c.neurons / P.NEURONS_PER_CREDIT)));
  assert.ok(Math.abs(c.usd - c.neurons * P.USD_PER_NEURON) < 1e-9);
});

test('the pre-flight estimate is pessimistic: every allowed output token is assumed spent', () => {
  const luna = TOKEN_BILLED;
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
  for (let i = 0; i < 5; i++) picks.push(P.selectProvider(env, { modelKey: 'agent' }));
  for (const p of picks) {
    assert.equal(p.ok, true);
    assert.equal(p.provider, 'workers-ai');
    // The rule, not a frozen id: with one provider credentialed the pick is the cheapest model
    // there that can serve the task. Naming a model here would re-break on every catalogue change.
    assert.equal(p.model.provider, 'workers-ai');
    assert.ok(p.model.supportsTools, 'the agent lane needs tool calling');
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
  //
  // RESTATED (D-VISION-1): the three uncredentialed HTTP providers it named are gone, so every
  // rejection is now a capability verdict about a Workers AI model, never a missing credential.
  for (const x of picks[0].rejected) {
    assert.equal(x.provider, 'workers-ai');
    assert.notEqual(x.why, 'no credentials configured');
  }
  assert.match(r, /tool calling/, 'it should name the capability the task needed');
});

test('AUTO: a vision task rules text-only models out on capability, not on credentials', () => {
  const { env } = fakeEnv();
  const pick = P.selectProvider(env, { modelKey: 'vision' });
  assert.equal(pick.ok, true);
  const textOnly = P.allModels().filter((m) => !m.supportsVision);
  assert.ok(textOnly.length >= 1, 'no text-only model in the catalogue — this checks nothing');
  for (const m of textOnly) {
    assert.equal(pick.rejected.find((r) => r.model === m.id)?.why, 'no vision support', m.id);
  }
  // and whatever wins must actually be able to see an image — that is the whole point of the
  // `vision` key, and a text-only winner would make the visual critic silently non-visual.
  assert.equal(pick.model.supportsVision, true, 'the vision key must resolve to a vision model');
  assert.match(pick.reasoning, /cheapest of the \d+ usable options/);
});

test('AUTO: ranking is by cost among the models that can serve the task', () => {
  // RESTATED (D-VISION-1): this ranked the retired HTTP providers against each other with the
  // binding absent. With one provider the ranking is within its catalogue, and the pick is the
  // cheapest tool-capable model by the same blended price the selector uses.
  const { env } = fakeEnv();
  const pick = P.selectProvider(env, { modelKey: 'agent' });
  assert.equal(pick.ok, true);
  const capable = P.allModels().filter((m) => m.supportsTools);
  const cheapest = Math.min(...capable.map((m) => P.blendedPricePer1M(m)));
  assert.equal(P.blendedPricePer1M(pick.model), cheapest);
  assert.match(pick.reasoning, /cheapest/);
});

test('AUTO: when nothing can serve the task it refuses and explains, rather than picking anyway', () => {
  const { env } = fakeEnv();
  const only = { ...env, AI: undefined };
  const pick = P.selectProvider(only, { modelKey: 'vision' });
  assert.equal(pick.ok, false);
  assert.match(pick.reasoning, /No provider can serve the `vision` task/);
  assert.match(pick.reasoning, /workers-ai \(binding not present\)/);
});
