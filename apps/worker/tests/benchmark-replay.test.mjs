/**
 * Offline replay of the 2026-10-02 benchmark's requests against the whole run loop (phase 1, step 11).
 *
 * A scripted model (no provider is called, nothing is paid for) plays the agent's side of the benchmark's items; the real
 * SessionDO, tool registry, build_object, preview_library_models and dress_object play the harness; a fake Studio keeps the
 * place. The properties pinned: the run starts with the model (no library or Studio step before its first call); the whole choice
 * (find, preview, place, build, dress, compose) is offered at every call and never forced; a tool's rejection hands the turn back
 * to the model; nothing the agent did not ask for (a stage, a "Click it!", a wobble, a crown, a Baseplate or Lighting change)
 * reaches Studio; a Hebrew name survives. The model's own words here are test data; the harness holds none.
 * The harness is copied from run-loop-traps.test.mjs, with a scripted response that may be a function of the request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'run-loop-traps-'));
const OUT = join(TMP, 'session.mjs');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  logLevel: 'silent',
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
  plugins: [{
    name: 'scripted-gateway',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: 'scripted-gateway', namespace: 'scripted' }));
      build.onLoad({ filter: /.*/, namespace: 'scripted' }, () => ({
        loader: 'js',
        contents: `
          export class BudgetError extends Error {
            constructor(reason, message) { super(message); this.reason = reason; }
          }
          export class RateLimitedError extends Error {
            constructor(message) { super(message); this.name = 'RateLimitedError'; }
          }
          // Sentinels become the REAL failure classes at the provider boundary, so the alarm
          // handler's own classification is what is exercised.
          export async function chat(env, req, opts) {
            const next = await env.__testChat(req, opts);
            if (next && next.__refuse) throw new RateLimitedError('Apple is handling a burst of requests right now.');
            if (next && next.__transient) {
              const e = new Error('workers-ai 503 temporarily unavailable');
              e.name = 'ProviderError';
              e.kind = 'transient';
              throw e;
            }
            return next;
          }
          export async function reasoningEffortApplies() { return true; }
        `,
      }));
    },
  }],
});

const { SessionDO, PROVIDER_OUTAGE_MAX_MS } = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

// ------------------------------------------------------------------------------------ harness ---

const result = (rows = [], one = null) => ({ toArray: () => rows, one: () => one });

class SqlMemory {
  constructor() { this.messages = []; this.oplog = []; }
  exec(statement, ...args) {
    const q = statement.replace(/\s+/g, ' ').trim();
    if (/pragma_table_info\('checkpoints'\)/.test(q)) return result([]);
    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const withTrace = args.length === 6;
      this.messages.push({ id, role, mode, content, tool_trace: withTrace ? maybeTrace : null, created_at: withTrace ? maybeCreated : maybeTrace });
      return result();
    }
    if (q.startsWith('insert into oplog(')) { this.oplog.push({ op_id: args[0], kind: args[1], ok: args[2], summary: args[3] }); return result(); }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    return result();
  }
}

const settleBoot = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * @param responses what the provider does, one entry per model call
 * @param connected whether a Studio plugin is polling
 * @param capabilities the plugin's capability report, when it sent one
 * @param answerOp how the "plugin" answers each Studio op it is handed
 */
async function makeSession({ responses = [], connected = false, capabilities = null, answerOp } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Trap Place', ownerId: 'owner-1' }]]);
  if (connected) store.set('pluginLastSeen', Date.now());
  const sql = new SqlMemory();
  const sent = [];
  const spends = [];
  const refunds = [];
  const chatCalls = [];
  const alarms = [];
  const ops = [];
  let attachment = { userId: 'owner-1', role: 'owner', connectionId: 'connection-1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw)),
    close: () => {},
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
  };
  const quotaState = () => {
    const spent = spends.reduce((n, v) => n + v, 0) - refunds.reduce((n, v) => n + v, 0);
    return { plan: 'free', creditsRemaining: 100 - spent, creditsDaily: 100, allowanceRemaining: 100 - spent, credits: 0, resetsAtIso: '2026-09-23T00:00:00.000Z' };
  };
  const namespace = (name) => ({
    idFromName: (id) => ({ __name: id, toString: () => `${name}:${id}` }),
    get: (id) => ({
      fetch: async (input, init) => {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const body = init?.body ? JSON.parse(init.body) : {};
        if (name === 'QUOTA_DO' && path === '/state') return Response.json(quotaState());
        if (name === 'QUOTA_DO' && path === '/spend') {
          spends.push(Number(body.credits ?? 0));
          return Response.json({ ok: true, state: quotaState(), fromAllowance: Number(body.credits ?? 0), fromCredits: 0 });
        }
        if (name === 'QUOTA_DO' && path === '/refund') {
          const returned = Number(body.fromAllowance ?? 0) + Number(body.fromCredits ?? 0);
          refunds.push(returned);
          return Response.json({ ok: true, returned, state: quotaState() });
        }
        return Response.json({ ok: true, id: id.__name, state: { killed: false }, reserved: 1 });
      },
    }),
  });
  const ctx = {
    id: { toString: () => 'session-1' },
    storage: {
      async get(key) { return store.get(key); },
      async put(key, value) {
        if (key && typeof key === 'object') for (const [k, v] of Object.entries(key)) store.set(k, structuredClone(v));
        else store.set(key, structuredClone(value));
      },
      async delete(key) { for (const k of Array.isArray(key) ? key : [key]) store.delete(k); return true; },
      async deleteAlarm() {},
      async deleteAll() { store.clear(); },
      async list() { return new Map(); },
      async setAlarm(at) { alarms.push(at); },
      async getAlarm() { return alarms.length ? alarms[alarms.length - 1] : null; },
      sql,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket: () => {},
  };
  const queue = [...responses];
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'),
    BUDGET_DO: namespace('BUDGET_DO'),
    ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: {
      async exec() {},
      prepare() {
        return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 0 } }; } };
      },
    },
    __testChat: async (req, opts) => {
      chatCalls.push({ req, opts, opsAtCall: ops.length, opsSeen: ops.map((o) => o.op) });
      assert.ok(queue.length > 0, 'the scripted provider was called more times than the fixture supplied');
      const next = queue.shift();
      return typeof next === 'function' ? structuredClone(next(req)) : structuredClone(next);
    },
  };
  const session = new SessionDO(ctx, env);
  await settleBoot();
  if (connected) session.pluginLastSeenMs = Date.now();
  if (capabilities) session.pluginCapabilityReport = capabilities;

  // The plugin's half: answer every op the session queues, the way a poll would find it.
  const answered = new Set();
  const answerer = setInterval(() => {
    for (const op of session.opQueue ?? []) {
      if (answered.has(op.id)) continue;
      const waiter = session.opWaiters?.get(op.id);
      if (!waiter) continue;
      answered.add(op.id);
      ops.push(op.studioOp);
      const reply = answerOp ? answerOp(op.studioOp) : { ok: false, error: 'this test does not answer Studio ops', failure: 'refused' };
      waiter({ id: op.id, ...reply });
    }
  }, 1);
  const stop = () => clearInterval(answerer);
  return { session, store, sql, sent, spends, refunds, chatCalls, alarms, ops, stop };
}

const answer = ({ finishReason = 'stop', text = '', toolCalls = [], neurons = 40 } = {}) => ({
  text, toolCalls,
  usage: { inputTokens: 900, outputTokens: Math.max(1, Math.ceil(text.length / 4)) },
  neurons, provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', finishReason,
});
const calls = (...list) => answer({
  finishReason: 'tool_calls',
  toolCalls: list.map(([name, args], i) => ({ id: `c${Math.random().toString(36).slice(2)}-${i}`, name, arguments: JSON.stringify(args) })),
});
const REFUSED = { __refuse: true };
const TRANSIENT = { __transient: true };
/** A tool name (snake_case) has no business in a sentence a young creator reads. */
const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)+\b/;

async function start(h, { text = 'build me a spawn platform', mode = 'agent' } = {}) {
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST', body: JSON.stringify({ text, mode, productModel: 'apple' }),
  }));
  assert.equal(res.status, 200, await res.text());
}
// ------------------------------------------------------------------------------------- the replay ---

const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
/** Before the model's first call only the run's own safety checkpoint and the studs surface default may have gone to Studio:
 * no search, no library read, no staging, no placing, no build. The model chooses all of those. */
const RUN_OWN_OPS = ['snapshot', 'set_surface_default'];
function assertModelFirst(h) {
  const early = h.chatCalls[0].opsSeen.filter((op) => !RUN_OWN_OPS.includes(op));
  assert.deepEqual(early, [], 'a library or build step ran before the first model call');
}
/** A current plugin reports what it can do; the ops a library step and a build stand on are among them (an older one that does
 * not report the owner-library ops is offered fewer tools, by design: that is plugin-capabilities.ts, not this test's concern). */
const CURRENT_PLUGIN = { schema: 'golem.studio-ops.v1', operations: ['snapshot', 'get_instance', 'create_instances', 'delete_instances', 'get_tree', 'set_surface_default', 'strip_descendants', 'import_owner_library', 'query_owner_library', 'query_owner_local', 'import_owner_local', 'import_owner_component', 'list_scripts', 'read_script', 'group_instances', 'transform_instances', 'insert_asset', 'spatial_query', 'set_props_bulk', 'query_instances', 'play_check', 'capture_studio_viewport'].map((op) => ({ op, status: 'supported' })) };
const CHOICE = ['find_library_model', 'preview_library_models', 'insert_library_model', 'build_object', 'dress_object', 'compose_game'];
const offeredAt = (h, i) => (h.chatCalls[i].req.tools ?? []).map((t) => t.name ?? t.function?.name);
/** What the harness must never add on its own to an object the agent built (the 2026-10-02 benchmark's habits). */
const NEVER_ADDED = /Click it!|wobble|crown|ClickDetector|AppleBody|AppleRoot|Stage|Baseplate|SpawnLocation|Lighting|Atmosphere/i;

/** A place that remembers what was made, so a repeated name is seen and a missing one is not. */
function fakeStudio() {
  const exists = new Set();
  return (op) => {
    if (op.op === 'get_instance') return exists.has(op.path) ? { ok: true, data: {} } : { ok: false, error: 'not found' };
    if (op.op === 'create_instances') { for (const i of op.items) exists.add(`${i.parent}.${i.name}`); return { ok: true, data: {} }; }
    if (op.op === 'delete_instances') { for (const p of op.paths) exists.delete(p); return { ok: true, data: {} }; }
    if (op.op === 'spatial_query') return { ok: true, data: { parts: [], count: 0 } };
    if (op.op === 'get_tree') return { ok: true, data: { root: { path: op.root, name: 'Workspace', class: 'Workspace', children: [] } } };
    return { ok: true, data: {} };
  };
}

const part = (name, size, at, color, extra = {}) => ({ name, size, at, color, ...extra });
// What a model would write for each request. These are test data, written here, not anything the harness knows.
const SPECS = {
  'make me a treasure chest': { name: 'TreasureChest', parts: [part('Body', [6, 3, 4], [0, 1.5, 0], '#8e5b32'), part('Lid', [6, 1, 4], [0, 3.5, 0], '#a46b3a'), part('Lock', [1, 1, 1], [0, 2.5, 2.3], '#ffc83d', { shape: 'ball' })] },
  'a robot pet that follows me': { name: 'RobotPet', parts: [part('Body', [3, 3, 3], [0, 2, 0], '#9aa5b1'), part('Head', [2, 2, 2], [0, 4.5, 0], '#c9d1d9'), part('Eye', [0.6, 0.6, 0.6], [0, 4.6, 1], '#4fd8ff', { material: 'Neon' })] },
  'a sword on a stand': { name: 'SwordOnStand', parts: [part('Stand', [4, 1, 2], [0, 0.5, 0], '#6b4a2b'), part('Blade', [0.6, 5, 0.2], [0, 3.5, 0], '#d9dee3'), part('Hilt', [2, 0.4, 0.4], [0, 1.2, 0], '#8a6b2c')] },
  'a hot air balloon': { name: 'HotAirBalloon', parts: [part('Envelope', [8, 8, 8], [0, 10, 0], '#e2563b', { shape: 'ball' }), part('Basket', [3, 2, 3], [0, 3, 0], '#8e5b32')] },
  'a cloud you can bounce on': { name: 'BounceCloud', parts: [part('Puff', [10, 3, 8], [0, 1.5, 0], '#f4f8ff', { shape: 'ball' })] },
};

async function run(request, responses) {
  const h = await makeSession({ connected: true, capabilities: CURRENT_PLUGIN, answerOp: fakeStudio(), responses });
  try {
    await start(h, { text: request });
    for (let i = 0; i < 30 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(lastEnd(h), `the run for "${request}" never ended`);
  } catch (e) { h.stop(); throw e; }
  return h;
}
/** Every name a create_instances op made, children included. */
const madeNames = (h) => {
  const names = [];
  const walk = (items) => { for (const i of items ?? []) { names.push(i.name); walk(i.children); } };
  for (const o of h.ops) if (o.op === 'create_instances') walk(o.items);
  return names;
};
// The layout check (scene-flags-run.ts) makes three READS of its own after a step that built in the workspace and at the answer: the
// whole Workspace tree, the Lighting rig and a terrain read. They are the harness reading, not the agent, and they add nothing.
const isLayoutRead = (op) => op.op === 'terrain_read' || (op.op === 'get_tree' && ((op.root === 'game.Workspace' && op.maxNodes === 1200) || (op.root === 'game.Lighting' && op.maxNodes === 200)));
const opsText = (h) => h.ops.filter((o) => !isLayoutRead(o)).map((o) => JSON.stringify(o)).join('\n');

for (const [request, spec] of Object.entries(SPECS)) {
  test(`replay: "${request}" starts with the model, keeps the whole choice offered after a rejection, and builds what the spec says`, async () => {
    const h = await run(request, [
      calls(['build_object', { name: spec.name, parts: [] }]), // refused: a reason, not an end
      calls(['build_object', spec]),
      answer({ text: 'It is in front of you.' }),
    ]);
    try {
      assertModelFirst(h);
      for (let i = 0; i < h.chatCalls.length; i++) {
        const names = offeredAt(h, i);
        for (const n of CHOICE) assert.ok(names.includes(n), `${n} was not offered at model call ${i}. ${(/Connected Studio limitations:[\s\S]{0,2500}/.exec(h.chatCalls[i].req.messages[0].content) ?? [''])[0]}`);
        assert.equal(h.chatCalls[i].req.toolChoice ?? h.chatCalls[i].req.tool_choice ?? undefined, undefined, `model call ${i} was forced to a tool`);
      }
      assert.ok(h.chatCalls.length >= 3, `the model was not called again after the rejection (${h.chatCalls.length} calls)`);
      const made = madeNames(h);
      assert.ok(made.includes(spec.name), `${spec.name} was not created: ${made.join(', ')}`);
      for (const p of spec.parts) assert.ok(made.includes(p.name), `${p.name} missing from ${made.join(",")} | ops ${h.ops.map((o) => o.op).join(",")}`);
      assert.doesNotMatch(opsText(h), NEVER_ADDED, 'the harness added something nobody asked for');
    } finally { h.stop(); }
  });
}

test('replay: a library model is found and previewed by the agent, after the model has spoken, with nothing placed or added', async () => {
  const pickId = (req) => {
    const text = (req.messages ?? []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
    const id = /"id"\s*:\s*"([^"]+)"/.exec(text.slice(text.lastIndexOf('find_library_model')))?.[1] ?? /\b(cs-\d+|[a-z]+-[\w-]+)\b/.exec(text)?.[1] ?? 'cs-1';
    return calls(['preview_library_models', { models: [{ id }] }]);
  };
  const h = await run('a sword on a stand', [
    calls(['find_library_model', { query: 'sword on a stand' }]),
    pickId,
    answer({ text: 'I looked at them; none is right, so I will build it.' }),
  ]);
  try {
    assertModelFirst(h);
    const placing = h.ops.filter((o) => o.op === 'import_owner_library' || (o.op === 'create_instances' && o.items.some((i) => i.parent === 'Workspace')));
    assert.deepEqual(placing, [], 'a preview placed something in the place');
    assert.doesNotMatch(opsText(h), NEVER_ADDED);
    const toolResults = h.chatCalls.at(-1).req.messages.filter((m) => m.role === 'tool');
    assert.ok(toolResults.length >= 2, 'the model never saw the results of find and preview');
  } finally { h.stop(); }
});

test('replay: a Hebrew rubber duck keeps its own name, and a second Hebrew object does not collide with it', async () => {
  const duck = { name: 'ברווז גומי', parts: [part('גוף', [3, 3, 3], [0, 2, 0], '#ffe066'), part('ראש', [2, 2, 2], [0, 4, 0], '#ffe066'), part('מקור', [1, 0.5, 1], [0, 4, 1.5], '#ff8800')] };
  const pond = { name: 'בריכה קטנה', parts: [part('מים', [12, 0.5, 12], [10, 0.25, 0], '#4fa6ff')] };
  const h = await run('תעשה לי ברווז גומי', [calls(['build_object', duck]), calls(['build_object', pond]), answer({ text: 'מוכן.' })]);
  try {
    const made = madeNames(h);
    assert.ok(made.includes('ברווז גומי'), `the duck lost its name: ${made.join(', ')}`);
    assert.ok(made.includes('בריכה קטנה'), 'the second object lost its name or was refused as a collision');
    assert.equal(made.filter((n) => n === 'ברווז גומי').length, 1);
    assert.doesNotMatch(opsText(h), NEVER_ADDED);
  } finally { h.stop(); }
});

test('replay: dress_object is offered, but an empty call is an error and adds nothing', async () => {
  const h = await run('a cloud you can bounce on', [
    calls(['build_object', SPECS['a cloud you can bounce on']]),
    calls(['dress_object', { target: 'game.Workspace.BounceCloud' }]),
    answer({ text: 'Done.' }),
  ]);
  try {
    const writesAfter = h.ops.filter((o) => ['create_instances', 'set_properties', 'run_code'].includes(o.op));
    assert.doesNotMatch(JSON.stringify(writesAfter.slice(1)), /Stage|ClickDetector|AppleBody|Count/);
    const last = h.chatCalls.at(-1).req.messages.filter((m) => m.role === 'tool').at(-1);
    assert.match(JSON.stringify(last.content), /error|nothing|ask/i, 'an empty dress_object was not reported as an error');
  } finally { h.stop(); }
});
