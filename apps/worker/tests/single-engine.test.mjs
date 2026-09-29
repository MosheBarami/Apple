/**
 * ONE ENGINE, AND THE BRIDGE THAT KEEPS OLD CLIENTS WORKING (V3 gate G01).
 *
 * Apple is the only customer-facing engine: GLM 5.3 Flash on Workers AI. There is no model tier and
 * no plan-gated model. The `productModel` wire field stays, and every value in it — `apple`, a
 * retired id (`apple-max`, `gemini-3.8-flash`, `gpt-5.6`, `gpt-5.6-luna`) or anything else an older
 * client or a stored row carries — is normalized to Apple and served, never refused.
 *
 * These tests execute the bundled shared package, gateway, provider adapter and SessionDO with local
 * stubs only. No provider or Roblox endpoint is contacted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'single-engine-'));

function bundle(entry, name) {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(
    ESBUILD,
    [entry, '--bundle', '--format=esm', '--target=es2022', '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'), '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
}

const { SessionDO } = await import(`file://${bundle(join(WORKER, 'src', 'do', 'session.ts'), 'session')}`);
const shared = await import(`file://${bundle(join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'shared')}`);
const { DEFAULT_MODELS } = await import(`file://${bundle(join(WORKER, 'src', 'gateway.ts'), 'gateway')}`);
const providers = await import(`file://${bundle(join(WORKER, 'src', 'providers', 'index.ts'), 'providers')}`);

const GLM = '@cf/zai-org/glm-5.3-flash';
const LEGACY = ['apple-max', 'gemini-3.8-flash', 'gpt-5.6', 'gpt-5.6-luna'];
/** What older clients and stored rows may carry besides the retired ids. */
const GARBAGE = ['', 'APPLE', 'openai/gpt-4o', 'no-such-model', 42, {}, [], true];
const REPLY = { choices: [{ finish_reason: 'stop', message: { content: 'ran' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } };

function result(rows = [], value = null) {
  return { toArray: () => rows, one: () => value };
}

/** Tiny SQLite-shaped seam: it records destructive statements and persists message model rows. */
class SqlMemory {
  constructor() {
    this.calls = [];
    this.messages = [];
    this.models = new Map();
  }

  exec(statement, ...args) {
    this.calls.push({ statement, args });
    const q = statement.replace(/\s+/g, ' ').trim();

    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const hasTrace = args.length === 6;
      this.messages.push({
        id, role, mode, content,
        tool_trace: hasTrace ? maybeTrace : null,
        created_at: hasTrace ? maybeCreated : maybeTrace,
      });
      return result();
    }
    if (q.startsWith('insert into message_models')) {
      this.models.set(args[0], args[1]);
      return result();
    }
    if (q.startsWith('select message_id, product_model from message_models')) {
      const ids = new Set(args);
      return result([...this.models].filter(([id]) => ids.has(id)).map(([message_id, product_model]) => ({ message_id, product_model })));
    }
    if (q.startsWith('select role, content from messages order by created_at desc')) {
      return result([...this.messages].sort((a, b) => b.created_at - a.created_at).slice(0, 15));
    }
    if (q.startsWith('select id, role, mode, content, tool_trace, created_at from messages where id = ?')) {
      return result(this.messages.filter((m) => m.id === args[0]));
    }
    if (q.startsWith('select id, role, mode, content, tool_trace, created_at from messages where created_at < ?')) {
      const before = Number(args[0]);
      const limit = Number(args[1]);
      return result([...this.messages].filter((m) => m.created_at < before).sort((a, b) => b.created_at - a.created_at).slice(0, limit));
    }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    if (q.startsWith('select message_id, count(*) as n from message_revisions')) return result();
    return result();
  }
}

function makeSession({ plan = 'free', planOf = () => plan, quotaStatus = 200, aiRun, envExtra = {} } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Test Place', ownerId: 'owner-1' }]]);
  const sql = new SqlMemory();
  const sent = [];
  const calls = [];
  const providerRuns = [];
  let attachment = { userId: 'owner-1', role: 'owner', connectionId: 'connection-1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw)),
    close: () => {},
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
  };
  const namespace = (name) => ({
    idFromName: (id) => ({ __name: id, toString: () => `${name}:${id}` }),
    get: (id) => ({
      fetch: async (url, init) => {
        const path = new URL(typeof url === 'string' ? url : url.url).pathname;
        calls.push({ name, path, id: id.__name });
        if (name === 'QUOTA_DO' && path === '/state') return new Response(JSON.stringify({ plan: planOf(), creditsRemaining: 100, allowanceRemaining: 100 }), { status: quotaStatus });
        if (name === 'QUOTA_DO' && path === '/spend') return Response.json({ ok: true, state: { plan: planOf(), creditsRemaining: 99, allowanceRemaining: 99 } });
        return Response.json({ ok: true, state: { killed: false }, reserved: 1 });
      },
    }),
  });
  const ctx = {
    id: { toString: () => 'session-1' },
    storage: {
      async get(key) { return store.get(key); },
      async put(key, value) {
        if (key && typeof key === 'object') for (const [k, v] of Object.entries(key)) store.set(k, v);
        else store.set(key, value);
      },
      async delete(key) { store.delete(key); },
      async deleteAlarm() {},
      async deleteAll() { store.clear(); },
      async list() { return new Map(); },
      setAlarm() {},
      getAlarm() { return null; },
      sql,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket() {},
  };
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'),
    BUDGET_DO: namespace('BUDGET_DO'),
    ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: {
      async exec() {},
      prepare() {
        return {
          bind() { return this; },
          async first() { return null; },
          async all() { return { results: [] }; },
          async run() { return { success: true, meta: { changes: 0 } }; },
        };
      },
    },
    AI: {
      run: async (model, payload) => {
        providerRuns.push({ model, payload });
        if (aiRun) return aiRun(model, payload);
        throw new Error('provider must not be called in this test');
      },
    },
  };
  Object.assign(env, envExtra);
  const session = new SessionDO(ctx, env);
  // V3 G03 gates chat on a paired, connected Studio place (tests/studio-gate-steer.test.mjs holds
  // that gate). This file tests something else, so its runs are admitted as they were before it.
  session.studioGate = async () => null;
  return { session, store, sql, sent, calls, providerRuns, ws };
}

test('the registry is one engine: Apple, on GLM 5.3 Flash through Workers AI', () => {
  assert.deepEqual(shared.MODEL_REGISTRY.map((m) => m.id), ['apple']);
  const apple = shared.registryModel('apple');
  assert.equal(apple.displayName, 'Apple', 'the name is just "Apple", with no version number');
  assert.equal(apple.providerModelId, GLM);
  assert.equal(apple.vendor, 'Apple');
  assert.equal(apple.reasoningEffort, 'low');
  assert.deepEqual(shared.PRODUCT_MODELS, ['apple']);
  assert.deepEqual(Object.keys(shared.PRODUCT_MODEL_INFO), ['apple']);
  assert.equal(shared.PRODUCT_MODEL_INFO.apple.name, 'Apple');
});

test('no tier, no plan-gated model: the entitlement API is gone and no plan row names a model', () => {
  for (const name of ['TIER_FOR_PLAN', 'canUseModel', 'canUseProductModel', 'lockedReason', 'modelRefusal', 'bestEntitledModel', 'modelListing']) {
    assert.equal(name in shared, false, `${name} is still exported`);
  }
  for (const m of shared.MODEL_REGISTRY) {
    for (const field of ['tier', 'creditMultiplier', 'route', 'wire', 'lora']) assert.equal(field in m, false, `${m.id}.${field}`);
  }
  const modelRows = shared.PLAN_FEATURES.filter((f) => shared.isModelId(f.id) || LEGACY.includes(f.id));
  assert.deepEqual(modelRows, [], 'a plan-table row still gates a model');
  // The plan ids are wire literals and are not renamed.
  assert.deepEqual(shared.PLAN_IDS, ['free', 'builder', 'studio', 'enterprise']);
});

test('the bridge: Apple, every retired id and any other value normalize to Apple', () => {
  assert.deepEqual([...shared.LEGACY_MODEL_IDS], LEGACY);
  assert.equal(shared.normalizeModelId('apple'), 'apple');
  for (const id of LEGACY) {
    assert.equal(shared.normalizeModelId(id), 'apple', id);
    assert.equal(shared.isModelId(id), false, `${id} is a retired id, not a registry id`);
  }
  for (const value of [...GARBAGE, undefined, null]) assert.equal(shared.normalizeModelId(value), 'apple', String(value));
});

test('every gateway lane that answers a customer runs the registry\'s engine, at its full output room', () => {
  const apple = shared.registryModel('apple');
  assert.equal(providers.APPLE_MODEL_ID, apple.providerModelId, 'the provider constant drifted from the registry');
  assert.equal(providers.VISION_MODEL_ID, GLM);
  for (const key of ['plan', 'agent']) {
    assert.equal(DEFAULT_MODELS[key].id, GLM, key);
    // GLM can spend a small max_tokens entirely on reasoning_content; the budget is not lowered.
    assert.ok(DEFAULT_MODELS[key].maxTokens >= apple.maxOutputTokens, `${key}: ${DEFAULT_MODELS[key].maxTokens}`);
  }
  assert.equal(DEFAULT_MODELS.vision.id, GLM);
  for (const key of Object.keys(DEFAULT_MODELS)) {
    assert.equal(key.startsWith('lab-'), false, `training lane ${key} is still routed`);
    assert.equal(LEGACY.includes(key), false, `retired model ${key} still has a lane`);
    assert.ok(DEFAULT_MODELS[key].id.startsWith('@cf/'), `${key} leaves Workers AI: ${DEFAULT_MODELS[key].id}`);
  }
});

test('a retired id on a free plan is admitted, run as Apple, and reaches GLM', async () => {
  for (const productModel of [...LEGACY, ...GARBAGE]) {
    const h = makeSession({ plan: 'free', aiRun: async () => REPLY });
    const res = await h.session.fetch(new Request('https://do/agent-run', {
      method: 'POST',
      body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel }),
    }));
    assert.equal(res.status, 200, `${JSON.stringify(productModel)} was refused`);
    assert.equal(h.store.get('agent')?.productModel, 'apple', JSON.stringify(productModel));
    await h.session.alarm();
    assert.equal(h.providerRuns.length, 1, JSON.stringify(productModel));
    assert.equal(h.providerRuns[0].model, GLM, JSON.stringify(productModel));
  }
});

test('a chat frame and an edit carrying a retired id are served, never refused', async () => {
  const chat = makeSession({ plan: 'free' });
  await chat.session.webSocketMessage(chat.ws, JSON.stringify({
    type: 'chat', text: 'build a small tower', mode: 'agent', productModel: 'apple-max',
  }));
  assert.deepEqual(chat.sent.filter((m) => m.type === 'error'), []);
  assert.equal(chat.store.get('agent')?.productModel, 'apple');
  assert.equal(chat.sent.find((m) => m.type === 'msg_start')?.productModel, 'apple');

  const edit = makeSession({ plan: 'free' });
  await edit.session.webSocketMessage(edit.ws, JSON.stringify({
    type: 'edit_resend', messageId: 'old-message', text: 'build a tower', mode: 'agent', productModel: 'gpt-5.6',
  }));
  assert.equal(edit.sent.some((m) => m.type === 'error' && /model/.test(String(m.code))), false, 'the edit was refused for its model');
});

test('Apple can use Agent tools while its identity is persisted and returned in history', async () => {
  const h = makeSession({ plan: 'free' });
  await h.session.webSocketMessage(h.ws, JSON.stringify({
    type: 'chat', text: 'build a small tower', mode: 'agent', productModel: 'apple',
  }));
  const agent = h.store.get('agent');
  assert.equal(agent.productModel, 'apple');
  assert.equal(agent.mode, 'agent');
  assert.equal(agent.maxSteps, 1000, 'every message uses the current hard work-step ceiling');
  const res = await h.session.fetch(new Request('https://do/messages'));
  const body = await res.json();
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].productModel, 'apple');
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), true);
});

test('a stored turn and a persisted run that name a retired id load and continue as Apple', async () => {
  const h = makeSession({ plan: 'free', aiRun: async () => REPLY });
  h.sql.messages.push({ id: 'old-turn', role: 'user', mode: 'agent', content: 'old', tool_trace: null, created_at: 1 });
  h.sql.models.set('old-turn', 'apple-max');
  const history = await (await h.session.fetch(new Request('https://do/messages'))).json();
  assert.equal(history.messages.find((m) => m.id === 'old-turn')?.productModel, 'apple');

  await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST', body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: 'apple' }),
  }));
  // The shape a pre-G01 worker persisted for a run on a retired model.
  h.store.set('agent', { ...h.store.get('agent'), productModel: 'gpt-5.6-luna' });
  await h.session.alarm();
  assert.equal(h.providerRuns.length, 1, 'a run persisted on a retired id did not continue');
  assert.equal(h.providerRuns[0].model, GLM);
});

test('Plan and Agent share the one engine; the mode controls behaviour and tools, not the model', async () => {
  assert.equal(DEFAULT_MODELS.plan.id, DEFAULT_MODELS.agent.id);
  for (const plan of ['free', 'builder', 'studio']) {
    for (const mode of ['plan', 'agent']) {
      const h = makeSession({ plan, aiRun: async () => REPLY });
      const start = await h.session.fetch(new Request('https://do/agent-run', {
        method: 'POST',
        body: JSON.stringify({ text: 'build a small tower', mode, productModel: 'apple' }),
      }));
      assert.equal(start.status, 200, `${mode} refused on ${plan}`);
      await h.session.alarm();
      assert.equal(h.providerRuns[0]?.model, GLM, `${mode} on ${plan}`);
    }
  }
});

//[[ BRING-YOUR-OWN-KEY IS GONE (D-VISION-1). A client that predates the removal can still send a
//   `model` field naming an OpenRouter id; the worker no longer reads it. The property: such a frame
//   runs on the registry model it names in `productModel`, takes the admission Credit like any other
//   run, and nothing about the customer key reaches the run or the wire. ]]
test('a frame that still names a model on the customer\'s own key runs on Apple and spends Credits', async () => {
  const h = makeSession({ plan: 'free' });
  await h.session.webSocketMessage(h.ws, JSON.stringify({
    type: 'chat', text: 'build a small tower', mode: 'agent', productModel: 'apple', model: 'openai/gpt-4o',
  }));
  const agent = h.store.get('agent');
  assert.ok(agent, 'the run was refused instead of admitted on Apple');
  assert.equal(agent.productModel, 'apple');
  assert.equal('customerModel' in agent, false, 'no customer-key lane is carried by the run');
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), true, 'the admission Credit was not taken');
  const start = h.sent.find((m) => m.type === 'msg_start');
  assert.equal(start.productModel, 'apple');
  assert.equal('model' in start, false, 'msg_start names no customer-key model');
});

test('a run persisted on a customer key before the removal ends in a sentence, with no model call', async () => {
  const h = makeSession({
    plan: 'free',
    aiRun: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'ran' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
  });
  await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST', body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: 'apple' }),
  }));
  // The shape an older worker persisted for a run on the customer's own OpenRouter key.
  const agent = h.store.get('agent');
  h.store.set('agent', { ...agent, customerModel: { provider: 'openrouter', modelId: 'openai/gpt-4o', label: 'GPT-4o', free: false, keyOwnerId: 'owner-1' } });
  await h.session.alarm();
  assert.equal(h.providerRuns.length, 0, 'the step ran — on Apple\'s Credits — although the run was started on a key');
  const reply = h.sql.messages.filter((x) => x.role === 'assistant').map((x) => x.content).join('\n');
  assert.match(reply, /old way Apple no longer supports/, `the run ended without saying why — ${reply.slice(0, 200)}`);
});
