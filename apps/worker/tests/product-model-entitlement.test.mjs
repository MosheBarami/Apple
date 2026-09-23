/**
 * Product model admission is a separate boundary from the legacy Plan/Agent mode.
 *
 * These tests execute the bundled SessionDO and the real public Hono app with local stubs only.
 * They prove that free Apple is usable, Apple MAX is checked against the authoritative QuotaDO
 * plan before a run or provider spend, and a model-aware message survives the message history
 * round trip. No provider or Roblox endpoint is contacted.
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
const TMP = mkdtempSync(join(tmpdir(), 'product-model-'));

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
// The routing table itself, so this file asserts WHICH LANE a product model reaches rather than
// which model id was current the day it was written. The ids were literals here and went stale the
// moment Apple MAX moved from glm-4.7-flash to glm-5.3-flash — a test failing because the product
// changed on purpose reads as the change being wrong.
const { DEFAULT_MODELS } = await import(`file://${bundle(join(WORKER, 'src', 'gateway.ts'), 'gateway')}`);

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
  return { session, store, sql, sent, calls, providerRuns, ws };
}

test('the shared selector keeps Apple free and Apple MAX paid-only', () => {
  // RESTATED for D-VISION-1: the list is the registry's, so it is asserted to BE the registry's
  // and to lead with the two Apple lanes older clients send, not pinned to a two-item literal.
  assert.deepEqual(shared.PRODUCT_MODELS, shared.MODEL_REGISTRY.map((m) => m.id));
  assert.deepEqual(shared.PRODUCT_MODELS.slice(0, 2), ['apple', 'apple-max']);
  assert.equal(shared.canUseProductModel('apple'), true);
  for (const plan of [undefined, null, 'free', 'unknown', {}]) {
    assert.equal(shared.canUseProductModel('apple-max', plan), false, `MAX must refuse ${String(plan)}`);
  }
  for (const plan of ['builder', 'studio', 'enterprise']) assert.equal(shared.canUseProductModel('apple-max', plan), true);
  assert.equal(shared.canUseProductModel('not-a-model', 'builder'), false);
});

test('D-VISION-1 tiers: Free = Apple, Pro = + Apple MAX, Max = every model', () => {
  const ids = shared.MODEL_REGISTRY.map((m) => m.id);
  assert.deepEqual(ids, ['apple', 'apple-max', 'gemini-3.8-flash', 'gpt-5.6', 'gpt-5.6-luna']);
  const allowed = (plan) => ids.filter((id) => shared.canUseModel(id, plan));
  assert.deepEqual(allowed('free'), ['apple']);
  assert.deepEqual(allowed(undefined), ['apple'], 'no plan read is Free, never more');
  assert.deepEqual(allowed('builder'), ['apple', 'apple-max']);
  assert.deepEqual(allowed('studio'), ids);
  assert.deepEqual(allowed('enterprise'), ids);
  assert.deepEqual(allowed('owner'), ['apple'], 'an unknown plan string is not an entitlement');
  // Every plan the product sells names a tier, so a fifth plan cannot silently fall through.
  assert.deepEqual(Object.keys(shared.TIER_FOR_PLAN).sort(), [...shared.PLAN_IDS].sort());
});

test('the registry names the exact Cloudflare ids, and Apple has no LoRA until one passes the eval', () => {
  const byId = Object.fromEntries(shared.MODEL_REGISTRY.map((m) => [m.id, m]));
  assert.equal(byId['gpt-5.6'].providerModelId, 'openai/gpt-5.6-sol');
  assert.equal(byId['gpt-5.6-luna'].providerModelId, 'openai/gpt-5.6-luna');
  assert.equal(byId['gemini-3.8-flash'].providerModelId, 'google/gemini-3.8-flash');
  assert.equal(byId.apple.providerModelId, '@cf/zai-org/glm-5.3-flash');
  assert.equal(byId.apple.reasoningEffort, 'low');
  assert.equal(byId.apple.lora, undefined);
  // The Responses-only family must be encoded as Responses; everything else as chat.
  for (const m of shared.MODEL_REGISTRY) {
    assert.equal(m.wire, m.providerModelId.startsWith('openai/') ? 'responses' : 'chat', m.id);
    assert.equal(m.route, m.providerModelId.startsWith('@cf/') ? 'workers-ai' : 'unified-billing', m.id);
  }
});

test('plan display names are Pro and Max; the stored ids are not renamed', () => {
  assert.equal(shared.PLAN_COPY.builder.name, 'Pro');
  assert.equal(shared.PLAN_COPY.studio.name, 'Max');
  assert.deepEqual(shared.PLAN_IDS, ['free', 'builder', 'studio', 'enterprise']);
  // Every model a plan can be refused is a plan-table row, valued by the same rule.
  const rows = shared.PLAN_FEATURES.filter((f) => shared.isModelId(f.id));
  assert.deepEqual(rows.map((r) => r.id), shared.MODEL_REGISTRY.filter((m) => m.tier !== 'free').map((m) => m.id));
  for (const row of rows) {
    for (const plan of shared.PLAN_IDS) assert.equal(row.values[plan], shared.canUseModel(row.id, plan), `${row.id}/${plan}`);
  }
});

test('a locked model says which plan includes it, and a downgrade falls back to an entitled Apple lane', () => {
  assert.equal(shared.lockedReason('apple-max'), 'Included with Pro');
  assert.equal(shared.lockedReason('gpt-5.6'), 'Included with the Max plan');
  assert.equal(shared.lockedReason('apple'), '');
  assert.equal(shared.bestEntitledModel('builder', 'gpt-5.6'), 'apple-max');
  assert.equal(shared.bestEntitledModel('free', 'apple-max'), 'apple');
  assert.equal(shared.bestEntitledModel('studio', 'gpt-5.6'), 'gpt-5.6');
  const listing = shared.modelListing('builder');
  assert.deepEqual(listing.filter((m) => m.available).map((m) => m.id), ['apple', 'apple-max']);
  for (const m of listing) assert.equal(m.lockedReason === '', m.available, m.id);
});

test('SessionDO refuses MAX for a free plan before quota spend', async () => {
  const h = makeSession({ plan: 'free' });
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST',
    body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: 'apple-max' }),
  }));
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.code, 'product_model_unavailable');
  assert.equal(h.store.has('agent'), false);
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), false);
});

test('SessionDO fails closed when the authoritative quota read itself fails', async () => {
  const h = makeSession({ plan: 'builder', quotaStatus: 503 });
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST',
    body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: 'apple-max' }),
  }));
  assert.equal(res.status, 403);
  assert.equal(h.store.has('agent'), false);
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), false);
});

test('WS edit checks MAX entitlement before irreversible history truncation', async () => {
  const h = makeSession({ plan: 'free' });
  await h.session.webSocketMessage(h.ws, JSON.stringify({
    type: 'edit_resend', messageId: 'old-message', text: 'build a tower', mode: 'agent', productModel: 'apple-max',
  }));
  assert.deepEqual(h.sent.filter((m) => m.type === 'error').map((m) => m.code), ['product_model_unavailable']);
  assert.equal(h.sent.find((m) => m.type === 'error')?.terminal, true, 'a refusal is terminal for this request');
  assert.equal(h.sql.calls.some((c) => c.statement.includes('delete from messages')), false);
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), false);
});

test('free Apple can use Agent tools while its identity is persisted and returned in history', async () => {
  const h = makeSession({ plan: 'free' });
  await h.session.webSocketMessage(h.ws, JSON.stringify({
    type: 'chat', text: 'build a small tower', mode: 'agent', productModel: 'apple',
  }));
  const agent = h.store.get('agent');
  assert.equal(agent.productModel, 'apple');
  assert.equal(agent.mode, 'agent');
  assert.equal(agent.maxSteps, 1000, 'every message uses the current hard work-step ceiling');
  const start = h.sent.find((m) => m.type === 'msg_start');
  assert.equal(start.productModel, 'apple');
  const res = await h.session.fetch(new Request('https://do/messages'));
  const body = await res.json();
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].productModel, 'apple');
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), true);
});

test('the two product tiers intentionally share the measured foundation, independent of autonomy mode', async () => {
  const cases = [
    { plan: 'free', mode: 'plan', productModel: 'apple', expected: DEFAULT_MODELS.plan.id },
    { plan: 'free', mode: 'agent', productModel: 'apple', expected: DEFAULT_MODELS.agent.id },
    { plan: 'builder', mode: 'plan', productModel: 'apple-max', expected: DEFAULT_MODELS.plan.id },
    { plan: 'builder', mode: 'agent', productModel: 'apple-max', expected: DEFAULT_MODELS.agent.id },
  ];

  assert.equal(DEFAULT_MODELS.plan.id, DEFAULT_MODELS.agent.id,
    'Plan and Agent should share the measured product foundation; mode controls behavior and tools');

  for (const c of cases) {
    const h = makeSession({
      plan: c.plan,
      // Return a tiny local fixture after the real gateway has selected a provider model id.
      // No external request is made.
      aiRun: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: 'route captured' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }),
    });
    const start = await h.session.fetch(new Request('https://do/agent-run', {
      method: 'POST',
      body: JSON.stringify({ text: 'build a small tower', mode: c.mode, productModel: c.productModel }),
    }));
    assert.equal(start.status, 200, `${c.productModel} in ${c.mode} must be admitted for ${c.plan}`);
    await h.session.alarm();
    assert.equal(h.providerRuns.length, 1, `${c.productModel} in ${c.mode} must reach exactly one model call`);
    assert.equal(h.providerRuns[0].model, c.expected, `${c.productModel} must stay on the measured shared foundation regardless of autonomy mode`);
  }
});

test('a free account cannot reach the MAX foundation through either Plan or Agent', async () => {
  for (const mode of ['plan', 'agent']) {
    const h = makeSession({ plan: 'free' });
    const res = await h.session.fetch(new Request('https://do/agent-run', {
      method: 'POST',
      body: JSON.stringify({ text: 'build a tower', mode, productModel: 'apple-max' }),
    }));
    assert.equal(res.status, 403);
    assert.equal(h.providerRuns.length, 0, `free MAX/${mode} must stop before provider selection`);
  }
});

// ---------------------------------------------------------------------------------------------
// D-VISION-1 step 4: every registry model is selectable, each gated by its own tier, and the
// gate is asked again at every step, not only at admission.
// ---------------------------------------------------------------------------------------------

/** The highest plan that does NOT include a model's tier: the account that must be refused. */
const PLAN_BELOW = { pro: 'free', max: 'builder' };
/** The lowest plan that does. */
const PLAN_AT = { pro: 'builder', max: 'studio' };
const PAID = shared.MODEL_REGISTRY.filter((m) => m.tier !== 'free');

test('every paid model is refused one plan below its tier, in the words the picker uses, and admitted at it', async () => {
  assert.ok(PAID.length >= 4, `only ${PAID.length} paid models; the loop below would check little`);
  for (const m of PAID) {
    const refusal = shared.modelRefusal(m.id);
    // The property, not a spelling: the sentence names the model and the plan that includes it,
    // which is exactly the locked row's reason.
    assert.ok(refusal.startsWith(`${m.displayName} is included with ${shared.TIER_PLAN_NAME[m.tier]}.`), refusal);
    assert.ok(refusal.includes(shared.lockedReason(m.id).replace('Included', 'included')), refusal);

    const below = makeSession({ plan: PLAN_BELOW[m.tier] });
    const res = await below.session.fetch(new Request('https://do/agent-run', {
      method: 'POST', body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: m.id }),
    }));
    const body = await res.json();
    assert.equal(res.status, 403, `${m.id} admitted on ${PLAN_BELOW[m.tier]}`);
    assert.equal(body.error, refusal, m.id);
    assert.equal(below.store.has('agent'), false, `${m.id}: a refused run was created`);

    const at = makeSession({ plan: PLAN_AT[m.tier] });
    const ok = await at.session.fetch(new Request('https://do/agent-run', {
      method: 'POST', body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: m.id }),
    }));
    assert.equal(ok.status, 200, `${m.id} refused on ${PLAN_AT[m.tier]}`);
    assert.equal(at.store.get('agent')?.productModel, m.id, `${m.id} was not the run's model`);
  }
  assert.equal(shared.modelRefusal('apple'), '', 'the free model is never refused');
});

test('a model is re-checked at the step: a downgrade after admission stops the run before any model call', async () => {
  for (const m of PAID) {
    let plan = PLAN_AT[m.tier];
    const h = makeSession({
      planOf: () => plan,
      // AI_GATEWAY_ID set, so an outside model's step WOULD reach the binding: without it the
      // adapter refuses first and this test could not tell the re-check from that refusal.
      envExtra: { AI_GATEWAY_ID: 'gw-test' },
      aiRun: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'ran' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
    });
    const start = await h.session.fetch(new Request('https://do/agent-run', {
      method: 'POST', body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel: m.id }),
    }));
    assert.equal(start.status, 200, `${m.id} was not admitted on ${plan}`);
    plan = PLAN_BELOW[m.tier];
    await h.session.alarm();
    assert.equal(h.providerRuns.length, 0, `${m.id}: a step ran after the plan stopped including it`);
    const reply = h.sql.messages.filter((x) => x.role === 'assistant').map((x) => x.content).join('\n');
    assert.ok(reply.includes(shared.modelRefusal(m.id)), `${m.id}: the run ended without saying why — ${reply.slice(0, 200)}`);
  }
});

test('the re-check is a no-op for the free model and while the plan still includes the model', async () => {
  for (const [productModel, plan] of [['apple', 'free'], ['apple-max', 'builder']]) {
    const h = makeSession({
      plan,
      aiRun: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'ran' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
    });
    await h.session.fetch(new Request('https://do/agent-run', {
      method: 'POST', body: JSON.stringify({ text: 'build a tower', mode: 'agent', productModel }),
    }));
    await h.session.alarm();
    assert.equal(h.providerRuns.length, 1, `${productModel} on ${plan} did not reach its model call`);
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
  assert.match(reply, /own key have been retired/, `the run ended without saying why — ${reply.slice(0, 200)}`);
});
