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

function makeSession({ plan = 'free', quotaStatus = 200, aiRun } = {}) {
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
        if (name === 'QUOTA_DO' && path === '/state') return new Response(JSON.stringify({ plan, creditsRemaining: 100, allowanceRemaining: 100 }), { status: quotaStatus });
        if (name === 'QUOTA_DO' && path === '/spend') return Response.json({ ok: true, state: { plan, creditsRemaining: 99, allowanceRemaining: 99 } });
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
  const session = new SessionDO(ctx, env);
  return { session, store, sql, sent, calls, providerRuns, ws };
}

test('the shared selector keeps Apple free and Apple MAX paid-only', () => {
  assert.deepEqual(shared.PRODUCT_MODELS, ['apple', 'apple-max']);
  assert.equal(shared.canUseProductModel('apple'), true);
  for (const plan of [undefined, null, 'free', 'unknown', {}]) {
    assert.equal(shared.canUseProductModel('apple-max', plan), false, `MAX must refuse ${String(plan)}`);
  }
  for (const plan of ['builder', 'studio', 'enterprise']) assert.equal(shared.canUseProductModel('apple-max', plan), true);
  assert.equal(shared.canUseProductModel('not-a-model', 'builder'), false);
});

test('SessionDO refuses MAX for a free plan before quota spend', async () => {
  const h = makeSession({ plan: 'free' });
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST',
    body: JSON.stringify({ text: 'build a tower', mode: 'stone', productModel: 'apple-max' }),
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
    body: JSON.stringify({ text: 'build a tower', mode: 'stone', productModel: 'apple-max' }),
  }));
  assert.equal(res.status, 403);
  assert.equal(h.store.has('agent'), false);
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), false);
});

test('WS edit checks MAX entitlement before irreversible history truncation', async () => {
  const h = makeSession({ plan: 'free' });
  await h.session.webSocketMessage(h.ws, JSON.stringify({
    type: 'edit_resend', messageId: 'old-message', text: 'build a tower', mode: 'stone', productModel: 'apple-max',
  }));
  assert.deepEqual(h.sent.filter((m) => m.type === 'error').map((m) => m.code), ['product_model_unavailable']);
  assert.equal(h.sent.find((m) => m.type === 'error')?.terminal, true, 'a refusal is terminal for this request');
  assert.equal(h.sql.calls.some((c) => c.statement.includes('delete from messages')), false);
  assert.equal(h.calls.some((c) => c.name === 'QUOTA_DO' && c.path === '/spend'), false);
});

test('free Apple can ride Stone tools while its identity is persisted and returned in history', async () => {
  const h = makeSession({ plan: 'free' });
  await h.session.webSocketMessage(h.ws, JSON.stringify({
    type: 'chat', text: 'build a small tower', mode: 'stone', productModel: 'apple',
  }));
  const agent = h.store.get('agent');
  assert.equal(agent.productModel, 'apple');
  assert.equal(agent.mode, 'stone');
  assert.equal(agent.maxSteps, undefined, 'free Apple is not artificially stopped after a fixed number of work steps');
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
    // The free lane moved from clay to stone on 2026-09-20. Measured on the deployed gateway, the
    // same twelve prompts at each lane's own production budget: stone 11/12 for 125 neurons, clay
    // 1/12 for 718 — ten of clay's twelve returned no code at all, because a reasoning model spends
    // its output budget thinking. The cheaper-looking lane was five and a half times the spend for
    // an eleventh of the result. The honest product decision is therefore to share the stronger
    // foundation. What differentiates the tiers is entitlement, maxSteps/effort and MAX-only
    // media/3D capability — not an inferior free model hidden behind a different id.
    { plan: 'free', mode: 'clay', productModel: 'apple', expected: DEFAULT_MODELS.stone.id },
    { plan: 'free', mode: 'stone', productModel: 'apple', expected: DEFAULT_MODELS.stone.id },
    { plan: 'builder', mode: 'clay', productModel: 'apple-max', expected: DEFAULT_MODELS.stone.id },
    { plan: 'builder', mode: 'stone', productModel: 'apple-max', expected: DEFAULT_MODELS.stone.id },
  ];

  // Clay still exists as a genuinely different gateway configuration, so this test would catch a
  // regression that silently routed one product tier back to Qwen. Its existence is not presented
  // as a product-tier distinction.
  assert.notEqual(DEFAULT_MODELS.clay.id, DEFAULT_MODELS.stone.id,
    'the control gateway must stay different or this routing assertion becomes vacuous');

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
  for (const mode of ['clay', 'stone']) {
    const h = makeSession({ plan: 'free' });
    const res = await h.session.fetch(new Request('https://do/agent-run', {
      method: 'POST',
      body: JSON.stringify({ text: 'build a tower', mode, productModel: 'apple-max' }),
    }));
    assert.equal(res.status, 403);
    assert.equal(h.providerRuns.length, 0, `free MAX/${mode} must stop before provider selection`);
  }
});
