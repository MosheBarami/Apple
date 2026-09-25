/**
 * THE RUN LOOP CANNOT BE TRAPPED BY ITS OWN REFUSALS, RETRIES OR WAITS.
 *
 * Driven through the real SessionDO with only the gateway replaced by a scripted seam, so every
 * guard below is the production code path: the alarm handler, runStep's narrowing, the duplicate
 * guard, finishRun's refund. No provider is called and nothing leaves the process.
 *
 * What each test pins, as a property rather than a spelling:
 *
 *   - PROVIDER WAITS ARE VISIBLE AND BOUNDED. Every wait on a refusing or unreachable provider is
 *     announced to the client, and a provider that has not answered for PROVIDER_OUTAGE_MAX_MS
 *     ends the run honestly, with the no-delivery refund. They used to repeat forever in silence.
 *   - A RETRY THE TOOL SAID WAS SAFE IS NOT REFUSED AS A DUPLICATE — up to a bound — while an
 *     identical repeat of a failure that is not safe to repeat still is.
 *   - propose_plan IS VALIDATED AGAINST WHAT THIS RUN WAS OFFERED, and consecutive refusals never
 *     exceed two whatever the model sends — including byte-identical resubmissions, which the
 *     duplicate guard used to refuse forever on the plan tool's behalf.
 *   - THE PROMPT AND THE OFFERED TOOLS AGREE in the request the provider actually receives.
 *   - A RUN THAT CANNOT BUILD IS NOT TOLD TO BUILD, and a tool call written as text is answered
 *     rather than silently ending the run as "Done.".
 *
 * Run with:  node --test tests/run-loop-traps.test.mjs      (from apps/worker)
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
// The registry, for the lists a fixture must DERIVE rather than write by hand: which tools change
// the project, and which Studio operations each one needs.
const REGISTRY_OUT = join(TMP, 'tools.mjs');
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: REGISTRY_OUT, logLevel: 'silent' });
const W = await import(pathToFileURL(REGISTRY_OUT).href);
const PB_OUT = join(TMP, 'prompt-budget.mjs');
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'prompt-budget.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: PB_OUT, logLevel: 'silent' });
const PB = await import(pathToFileURL(PB_OUT).href);
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
      chatCalls.push({ req, opts });
      assert.ok(queue.length > 0, 'the scripted provider was called more times than the fixture supplied');
      return structuredClone(queue.shift());
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

async function start(h, { text = 'build me a spawn platform', mode = 'agent', autonomous } = {}) {
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST', body: JSON.stringify({ text, mode, productModel: 'apple', ...(autonomous ? { autonomous: true } : {}) }),
  }));
  assert.equal(res.status, 200, await res.text());
}

const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const assistantRow = (h) => [...h.sql.messages].reverse().find((m) => m.role === 'assistant');
const notices = (h) => h.sent.filter((m) => m.type === 'notice' && m.code === 'provider_wait');

/** Deliver the alarm the run scheduled for its retry, as if its moment had come. */
async function fireRetry(h) {
  const agent = h.store.get('agent');
  assert.equal(typeof agent.resumeAt, 'number', 'a wait must name the moment the step is retried');
  h.store.set('agent', structuredClone({ ...agent, resumeAt: Date.now() - 1 }));
  await h.session.alarm();
}

/** The provider has been unavailable since `ms` ago: the recorded start of the outage is moved back. */
function outageFor(h, ms) {
  const agent = h.store.get('agent');
  assert.equal(typeof agent.providerWaitSince, 'number', 'the run never recorded when the outage began');
  h.store.set('agent', structuredClone({ ...agent, providerWaitSince: Date.now() - ms, resumeAt: Date.now() - 1 }));
}

// ============================================================ 1. provider waits: visible, bounded ===

test('EVERY PROVIDER WAIT IS ANNOUNCED TO THE CLIENT, and the run stays alive while it lasts', async () => {
  const h = await makeSession({ responses: [REFUSED, REFUSED, TRANSIENT] });
  try {
    await start(h);
    await h.session.alarm();
    assert.equal(h.store.get('agent').status, 'running', 'one refusal must not end the run');
    assert.equal(notices(h).length, 1, 'the wait sent nothing to the client — a waiting run looks exactly like a dead one');
    assert.match(notices(h)[0].message, /Waiting on the model provider/);
    assert.match(notices(h)[0].message, /retrying in \d+ s/);
    const statusAfter = h.sent.slice(h.sent.indexOf(notices(h)[0]) - 1).find((m) => m.type === 'agent_status');
    assert.ok(statusAfter, 'the Thinking card must be told the run is still going');

    await fireRetry(h);
    await fireRetry(h);
    assert.equal(notices(h).length, 3, 'every wait — rate limit AND transport failure — must be announced');
    assert.match(notices(h)[2].message, /did not answer/, 'a transport failure is described as one');
    assert.equal(lastEnd(h), undefined, 'a short outage must not end the run');
  } finally { h.stop(); }
});

test('A PROVIDER THAT REFUSES FOR FIVE MINUTES ENDS THE RUN HONESTLY, AND THE CREDITS COME BACK', async () => {
  assert.equal(PROVIDER_OUTAGE_MAX_MS, 5 * 60_000, 'the bound is the product decision recorded on the constant');
  const h = await makeSession({ responses: [REFUSED, REFUSED, REFUSED] });
  try {
    await start(h);
    await h.session.alarm();
    assert.equal(h.store.get('agent').status, 'running');

    // Just under the bound: still waiting.
    outageFor(h, PROVIDER_OUTAGE_MAX_MS - 5_000);
    await h.session.alarm();
    assert.equal(h.store.get('agent').status, 'running', 'the run ended before the bound');
    assert.equal(lastEnd(h), undefined);

    outageFor(h, PROVIDER_OUTAGE_MAX_MS + 1_000);
    await h.session.alarm();
    const end = lastEnd(h);
    assert.ok(end, 'a provider unavailable past the bound still has the run waiting forever');
    assert.equal(end.stopReason, 'error');
    assert.equal(end.error, 'busy', 'the ending must carry a code from the shared vocabulary');
    assert.match(assistantRow(h).content, /model provider has not answered for \d+ minutes?/,
      'the reply must say what actually happened');
    // Nothing was built, so the admission Credit is handed back under the ordinary refund rules.
    assert.deepEqual(h.refunds, [1], 'a run that delivered nothing was not refunded');
    assert.equal(end.creditsSpent, 0);
    assert.match(assistantRow(h).content, /Credit/, 'and the reply says so');
  } finally { h.stop(); }
});

test('a transport outage past the bound ends with the dropped-step code', async () => {
  const h = await makeSession({ responses: [TRANSIENT, TRANSIENT] });
  try {
    await start(h);
    await h.session.alarm();
    outageFor(h, PROVIDER_OUTAGE_MAX_MS + 1_000);
    await h.session.alarm();
    assert.equal(lastEnd(h)?.stopReason, 'error');
    assert.equal(lastEnd(h).error, 'dropped_step');
    assert.match(assistantRow(h).content, /lost before a response came back/);
  } finally { h.stop(); }
});

test('the outage clock bounds CONTINUOUS unavailability: an answer resets it', async () => {
  // Otherwise a long run with a refusal an hour ago and one now would be ended as a five-minute outage.
  const h = await makeSession({
    responses: [REFUSED, calls(['get_ui_construction', { id: 'screen-shop' }]), REFUSED],
  });
  try {
    await start(h);
    await h.session.alarm();
    outageFor(h, PROVIDER_OUTAGE_MAX_MS - 10_000); // nearly five minutes of refusals...
    await h.session.alarm(); // ...then the provider answers
    assert.equal(h.store.get('agent').providerWaitSince, undefined, 'an answer did not end the outage');
    await h.session.alarm(); // and refuses again
    const agent = h.store.get('agent');
    assert.equal(agent.status, 'running', 'a fresh refusal after an answer was treated as the old outage');
    assert.ok(Date.now() - agent.providerWaitSince < 5_000, 'the new outage must be timed from its own start');
  } finally { h.stop(); }
});

// ================================================== 2. the duplicate guard and retryable failures ===

test('AN IDENTICAL RETRY THE TOOL SAID WAS SAFE IS RUN — TWICE — AND ONLY THEN REFUSED', async () => {
  const tree = ['get_project_tree', {}];
  const h = await makeSession({
    connected: true,
    // The plugin never got the op: `transport`, which op-failure.ts classifies as safe to repeat.
    answerOp: (op) => (op.op === 'get_tree' ? { ok: false, error: 'the connection dropped', failure: 'transport' } : { ok: false, error: 'not in this test', failure: 'refused' }),
    responses: [calls(tree), calls(tree), calls(tree), calls(tree)],
  });
  try {
    await start(h);
    for (let i = 0; i < 4; i++) await h.session.alarm();
    const treeOps = h.ops.filter((o) => o.op === 'get_tree').length;
    assert.equal(treeOps, 3, `the retry the tool invited was ${treeOps < 3 ? 'refused as a duplicate' : 'allowed without bound'} (${treeOps} ops)`);
    const ends = h.sent.filter((m) => m.type === 'tool_end' && m.summary?.includes('get_project_tree'));
    assert.match(ends.at(-1).summary, /already done/, 'the fourth identical call must be refused');
    const last = h.store.get('agent').llm.filter((m) => m.role === 'tool').at(-1).content;
    assert.match(last, /already retried this exact call/, 'and it must say it was retried, not that it succeeded');
  } finally { h.stop(); }
});

test('CONTROL: an identical repeat of a failure that is NOT safe to repeat is still refused at once', async () => {
  const tree = ['get_project_tree', {}];
  const h = await makeSession({
    connected: true,
    answerOp: () => ({ ok: false, error: 'Studio declined', failure: 'refused' }),
    responses: [calls(tree), calls(tree)],
  });
  try {
    await start(h);
    await h.session.alarm();
    await h.session.alarm();
    assert.equal(h.ops.filter((o) => o.op === 'get_tree').length, 1, 'a refused op was repeated verbatim');
  } finally { h.stop(); }
});

// ================================================ 3. propose_plan inside the real run loop ===

const NO_RENDER = {
  schema: 'golem.studio-ops.v1',
  operations: [
    { op: 'render_view', status: 'unsupported', reason: 'this plugin cannot render' },
    { op: 'run_code', status: 'unsupported', reason: 'no constrained plugin evaluator' },
  ],
};

test('THE RUN LOOP HANDS propose_plan ITS OFFERED SET: no renderer means no inspect_visually', async () => {
  const h = await makeSession({
    connected: true,
    capabilities: NO_RENDER,
    responses: [calls(['propose_plan', { steps: [{ title: 'A platform', tool: 'create_instances' }] }])],
  });
  try {
    await start(h);
    await h.session.alarm();
    const planEnd = h.sent.find((m) => m.type === 'tool_end' && m.detail?.blocks?.[0]?.type === 'build_plan');
    assert.ok(planEnd, 'no plan was accepted');
    const tools = planEnd.detail.blocks[0].steps.map((s) => s.tool);
    assert.ok(!tools.includes('inspect_visually'), 'the product appended a check the connected Studio cannot perform');
    assert.equal(tools.at(-1), 'audit_build', 'the best OFFERED check must be appended instead');
  } finally { h.stop(); }
});

test('CONSECUTIVE propose_plan REFUSALS NEVER EXCEED TWO IN A REAL RUN — identical resubmissions included', async () => {
  const unavailable = { steps: [{ title: 'Test it', tool: 'run_spec' }, { title: 'Build it', tool: 'create_instances' }] };
  const tooLong = { steps: Array.from({ length: 15 }, (_, i) => ({ title: `Part ${i}`, tool: 'create_instances' })) };
  const h = await makeSession({
    connected: true,
    capabilities: NO_RENDER,
    // The production shape: the SAME plan sent again and again, then a different defect.
    responses: [
      calls(['propose_plan', unavailable]),
      calls(['propose_plan', unavailable]),
      calls(['propose_plan', unavailable]),
      calls(['propose_plan', tooLong]),
      calls(['propose_plan', {}]),
      calls(['propose_plan', unavailable], ['propose_plan', tooLong]),
    ],
  });
  try {
    await start(h);
    for (let i = 0; i < 6; i++) await h.session.alarm();
    const planEnds = h.sent.filter((m) => m.type === 'tool_end' && h.sent.some((s) => s.type === 'tool_start' && s.toolId === m.toolId && s.tool === 'propose_plan'));
    assert.ok(planEnds.length >= 7, `only ${planEnds.length} propose_plan results were observed`);
    let streak = 0;
    let worst = 0;
    for (const e of planEnds) {
      streak = e.ok ? 0 : streak + 1;
      worst = Math.max(worst, streak);
    }
    assert.ok(worst <= 2, `${worst} consecutive propose_plan refusals — the run is being refused instead of worked`);
    const agent = h.store.get('agent');
    assert.ok(agent.plan, 'no plan was ever recorded, so the refusals did not end in a plan');
    for (const s of agent.plan.steps) {
      assert.notEqual(s.tool, 'run_spec', 'the recorded plan still promises a tool the run cannot call');
    }
  } finally { h.stop(); }
});

// ========================================================= 4. prompt and offered tools agree ===

/** The snake_case words in the part of the prompt that tells the model which tools to CALL. */
function modeBlockTools(system) {
  const from = system.indexOf('Mode: ');
  assert.ok(from >= 0, 'the prompt has no mode block');
  const ends = ['\n\nAutonomous is ON', '<<<ART_DIRECTION>>>', '<<<UI_GRAMMAR>>>', '\n\nProject: "']
    .map((m) => system.indexOf(m, from)).filter((i) => i > from);
  const block = system.slice(from, Math.min(...ends));
  return [...new Set([...block.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)].map((m) => m[0]))];
}

test('OFFLINE AGENT: the prompt the provider receives does not order a call to a tool it was not sent', async () => {
  const h = await makeSession({ responses: [answer({ text: 'Here is how you would do it.' })] });
  try {
    await start(h);
    await h.session.alarm();
    const req = h.chatCalls[0].req;
    const sentTools = new Set(req.tools.map((t) => t.name));
    const system = req.messages[0].content;
    assert.ok(sentTools.size > 0 && !sentTools.has('propose_plan'), 'control: offline Agent is not offered propose_plan');
    assert.doesNotMatch(system, /FIRST call is propose_plan/, 'offline Agent was told to call a tool it was not given');
    assert.doesNotMatch(system, /\bpropose_plan\b/, 'and the prompt should not name it at all');
    for (const tool of modeBlockTools(system)) {
      assert.ok(sentTools.has(tool), `the mode rules name ${tool}, which this request does not offer`);
    }
  } finally { h.stop(); }
});

test('PAIRED AGENT WITH A NARROWED PLUGIN: the verifiers the prompt names are the ones actually sent', async () => {
  const h = await makeSession({ connected: true, capabilities: NO_RENDER, responses: [answer({ text: 'ok' })] });
  try {
    await start(h);
    await h.session.alarm();
    const req = h.chatCalls[0].req;
    const sentTools = new Set(req.tools.map((t) => t.name));
    const system = req.messages[0].content;
    assert.match(system, /FIRST call is propose_plan/, 'control: a paired Agent run is still told to plan');
    const named = modeBlockTools(system);
    assert.ok(named.includes('audit_build'), 'the offered verifier is not named, so the check below would be vacuous');
    for (const tool of named) {
      assert.ok(sentTools.has(tool), `the mode rules name ${tool}, which the connected Studio withholds`);
    }
  } finally { h.stop(); }
});

// ==================================================== 5. a run that cannot build, and text calls ===

const RESEARCH_NUDGE = /spent several steps researching without changing the project/;

test('A RUN THAT CANNOT BUILD IS NOT TOLD TO BUILD', async () => {
  const offline = await makeSession({
    responses: [
      calls(['get_ui_construction', { id: 'screen-shop' }]),
      calls(['get_ui_construction', { id: 'screen-inventory' }]),
      calls(['get_verified_module', { id: 'cooldown-clock' }]),
    ],
  });
  const paired = await makeSession({
    connected: true,
    responses: [
      calls(['get_ui_construction', { id: 'screen-shop' }]),
      calls(['get_ui_construction', { id: 'screen-inventory' }]),
    ],
  });
  try {
    await start(offline);
    for (let i = 0; i < 3; i++) await offline.session.alarm();
    assert.equal(offline.store.get('agent').llm.some((m) => m.role === 'user' && RESEARCH_NUDGE.test(m.content)), false,
      'an Agent run with Studio disconnected was told to create instances it has no tool for');

    // CONTROL: the same research on a run that CAN build is still steered, so the check above can see the nudge.
    await start(paired);
    for (let i = 0; i < 2; i++) await paired.session.alarm();
    assert.equal(paired.store.get('agent').llm.some((m) => m.role === 'user' && RESEARCH_NUDGE.test(m.content)), true,
      'the control failed: a run that can build is no longer steered, so the assertion above proves nothing');
  } finally { offline.stop(); paired.stop(); }
});

const OWES_WORK_NUDGE = /You have not changed the project yet/;

test('A PAIRED RUN OFFERED NOTHING THAT CHANGES THE PROJECT IS NOT NUDGED TO CHANGE IT — it ends, and says why', async () => {
  // The "you have not changed the project" nudge repeats on every prose reply (384a4be: it is
  // bounded only by the step ceiling, Credits and Stop). That is a decision about runs that CAN
  // build. A paired Agent run whose permissions or plugin withhold every tool that changes the
  // project can never satisfy it, so it was a guaranteed loop of paid steps with no possible
  // progress. The plugin here reports every operation any project-changing tool needs unsupported.
  const mutating = W.projectMutatingToolNames();
  const ops = [...new Set(mutating.flatMap((name) => W.TOOLS[name].studioOps ?? []))];
  assert.ok(mutating.length > 10 && ops.length > 5, `the derived lists are too small to mean anything (${mutating.length} tools, ${ops.length} ops)`);
  const readOnly = {
    schema: 'golem.studio-ops.v1',
    operations: ops.map((op) => ({ op, status: 'unsupported', reason: `${op} is not available in this plugin` })),
  };
  const h = await makeSession({
    connected: true,
    capabilities: readOnly,
    responses: [answer({ text: 'I cannot place parts from here.' }), answer({ text: 'Still cannot.' })],
  });
  const paired = await makeSession({ connected: true, responses: [answer({ text: 'I will build the platform now.' })] });
  try {
    await start(h);
    await h.session.alarm();
    const offered = new Set(h.chatCalls[0].req.tools.map((t) => t.name));
    assert.ok(offered.size > 0 && mutating.every((name) => !offered.has(name)),
      'control: the fixture must leave this run with no tool that changes the project');
    assert.equal(h.store.get('agent').llm.some((m) => m.role === 'user' && OWES_WORK_NUDGE.test(m.content)), false,
      'a run with no tool that changes the project was told to change it');
    assert.ok(lastEnd(h), 'the run kept going after a reply it can never improve on');
    assert.match(assistantRow(h).content, /Nothing in the project was changed/,
      'the reply must say nothing changed, whatever the model wrote');
    assert.match(h.sent.filter((m) => m.type === 'delta').map((m) => m.text).join(''), /Nothing in the project was changed/,
      'and the person watching must be told, not only the stored row');

    // CONTROL: the same prose on a run that CAN build is still steered back to the work.
    await start(paired);
    await paired.session.alarm();
    assert.equal(paired.store.get('agent').llm.some((m) => m.role === 'user' && OWES_WORK_NUDGE.test(m.content)), true,
      'the control failed: a run that can build is no longer nudged, so the assertion above proves nothing');
    assert.equal(lastEnd(paired), undefined, 'control: a run that can build does not end on prose');
  } finally { h.stop(); paired.stop(); }
});

test('A TOOL CALL WRITTEN AS TEXT IS ANSWERED, NOT TURNED INTO "Done." — and the answer is bounded', async () => {
  const asText = answer({ text: JSON.stringify({ name: 'create_instances', arguments: { items: [{ class: 'Part', parent: 'game.Workspace' }] } }) });
  const h = await makeSession({ responses: [asText, asText, asText] });
  try {
    await start(h);
    await h.session.alarm();
    assert.equal(lastEnd(h), undefined, 'the run ended as soon as the model wrote its call as text; the steer never got a turn');
    const steer = h.store.get('agent').llm.at(-1);
    assert.equal(steer.role, 'user');
    assert.match(steer.content, /not offered in this run/, 'an offline run was told to call a tool it does not have');
    assert.doesNotMatch(h.sent.filter((m) => m.type === 'delta').map((m) => m.text).join(''), /create_instances/,
      'the payload was shown to the user');

    await h.session.alarm();
    assert.equal(lastEnd(h), undefined, 'the second steer must also get its turn');
    await h.session.alarm();
    assert.ok(lastEnd(h), 'the steer is bounded: the third text payload must reach the ordinary ending');
  } finally { h.stop(); }
});

// 2026-09-22, run d1a97c0d: the plugin ended its session mid-run, the Studio tools dropped out, and the
// model, told only "not available … for the current mode", told the customer the terrain and lighting
// tools "aren't offered in this mode". A Studio tool refused because the link is down says so.
test('a Studio tool called while Studio is disconnected is refused as "not connected", not as "not in this mode"', async () => {
  const h = await makeSession({
    connected: false,
    responses: [
      calls(['edit_terrain', { action: 'fill_ball', center: [0, 5, 0], radius: 8, material: 'Enum.Material.Grass' }]),
      answer({ text: 'Studio is not connected; reconnect it and I will build the hill.' }),
    ],
  });
  try {
    await start(h, { text: 'add a grassy hill' });
    for (let i = 0; i < 4 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(h.chatCalls.length >= 2, 'the refusal must reach a second model step');
    const second = h.chatCalls[1].req.messages;
    const reply = second.filter((m) => m.role === 'tool').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
    assert.match(reply, /Roblox Studio is not connected right now/);
    assert.match(reply, /not a limit of this mode/);
    assert.doesNotMatch(reply, /Use only the tools offered for the current mode/);
    assert.equal(h.ops.length, 0, 'nothing may be sent to a Studio that is not there');
  } finally {
    h.stop();
  }
});

// 2026-09-23, runs 867aff43 and 2d3d2ea9: the lamp's tree was read, trimmed out of the transcript, and
// every identical re-read refused by the duplicate guard as "already done" — the result it pointed at
// was gone. A read whose result was trimmed away may be read again; a write is still never repeated.
test('a read trimmed out of the transcript can be read again; the duplicate guard does not strand it', async () => {
  const defsChars = JSON.stringify(W.toolDefs(true).map((d) => ({ type: 'function', function: d }))).length;
  const fillers = Math.ceil(PB.promptBudgetForKey('agent', defsChars).maxChars / 2_500);
  const big = (root) => ({ ok: true, data: { root: { path: root, name: root.split('.').pop(), class: 'Model',
    children: Array.from({ length: 120 }, (_, i) => ({ path: `${root}.Part${i}`, name: `Part${i}`, class: 'Part' })) } } });
  const h = await makeSession({
    connected: true,
    answerOp: (op) => (op.op === 'get_tree' ? big(op.root ?? 'game.Workspace') : { ok: true, data: {} }),
    responses: [
      calls(['get_project_tree', { root: 'game.Workspace.StreetLamp' }]),
      // Enough filler reads to push the lamp's result past the transcript budget (prompt-budget.ts);
      // each result is capped at MAX_RESULT_CHARS, so the count follows the budget.
      ...Array.from({ length: fillers }, (_, b) => calls(['get_project_tree', { root: `game.Workspace.Filler${b}` }])),
      calls(['get_project_tree', { root: 'game.Workspace.StreetLamp' }]),
      answer({ text: 'The lamp has 120 parts.' }),
    ],
  });
  try {
    await start(h, { text: 'List the parts inside the StreetLamp model. Do not change anything.' });
    for (let i = 0; i < fillers + 10 && !lastEnd(h); i++) await h.session.alarm();
    const lampReads = h.ops.filter((op) => op.op === 'get_tree' && op.root === 'game.Workspace.StreetLamp').length;
    const dropped = h.sent.filter((m) => m.type === 'context_budget' && m.dropped).length;
    assert.ok(dropped > 0, 'the fixture never trimmed the transcript, so this proves nothing');
    assert.equal(lampReads, 2, 'the second read of the lamp must reach Studio, not be refused as a duplicate');
  } finally {
    h.stop();
  }
});

// Gauntlet round 4 (2026-09-23): Apple MAX on a 1.3M-token model was trimmed at a fixed 60,000 chars
// and dropped 23 turn groups. The ceiling a step is told about is the one derived from its model
// (prompt-budget.ts), and it is larger than the old constant.
test('the context budget a step reports is derived from the model the step is sent to', async () => {
  const h = await makeSession({ connected: true, responses: [answer({ text: 'Hello.' })] });
  try {
    await start(h, { text: 'build me a spawn platform' });
    for (let i = 0; i < 4 && !lastEnd(h); i++) await h.session.alarm();
    const budget = h.sent.find((m) => m.type === 'context_budget');
    assert.ok(budget, 'no context_budget frame');
    const defsChars = JSON.stringify(W.toolDefs(true).map((d) => ({ type: 'function', function: d }))).length;
    assert.equal(budget.maxChars, PB.promptBudgetForKey('agent', defsChars).maxChars);
    assert.ok(budget.maxChars > 60_000, `budget ${budget.maxChars}`);
  } finally {
    h.stop();
  }
});

// F-039, 2026-09-23, run c71b89a9: one install, then 88 read-only calls for 242 Credits. A run that can
// build and only reads is told to build, and then ended — plainly, as incomplete, not as done.
test('a run that changed something and then only reads is ended at the read-stall limit, as incomplete', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: (op) => (op.op === 'get_tree' ? { ok: true, data: { root: { path: op.root, name: 'x', class: 'Folder', children: [] } } } : { ok: true, data: {} }),
    responses: [
      calls(['create_instances', { instances: [{ className: 'Part', name: 'Coin1', parent: 'game.Workspace' }] }]),
      ...Array.from({ length: 40 }, (_, i) => calls(['get_project_tree', { root: `game.Workspace.Look${i}` }])),
      answer({ text: 'Done.' }),
    ],
  });
  try {
    await start(h, { text: 'make a coin game' });
    for (let i = 0; i < 60 && !lastEnd(h); i++) await h.session.alarm();
    const end = lastEnd(h);
    assert.ok(end, 'the run never ended');
    const reads = h.ops.filter((op) => op.op === 'get_tree').length;
    assert.ok(reads <= 21, `ended after ${reads} read-only steps, not at the limit`);
    const text = h.sent.filter((m) => m.type === 'delta').map((m) => m.text).join('');
    assert.match(text, /kept re-reading your place instead of building/);
    assert.notEqual(end.stopReason, 'done');
  } finally {
    h.stop();
  }
});

// F-019, 2026-09-22: "Hi" cost 9 Credits — every call carries all 69 tool definitions (~67k chars).
test('a greeting is answered without the tool definitions; a build request still gets them', async () => {
  const hi = await makeSession({ connected: true, responses: [answer({ text: 'Hi! What should we build?' })] });
  try {
    await start(hi, { text: 'hi' });
    for (let i = 0; i < 4 && !lastEnd(hi); i++) await hi.session.alarm();
    assert.ok(hi.chatCalls.length >= 1, 'no model call was made — this checks nothing');
    assert.equal(hi.chatCalls[0].req.tools?.length ?? 0, 0, 'the greeting was sent the build tools');
  } finally {
    hi.stop();
  }
  const build = await makeSession({ connected: true, responses: [answer({ text: 'Done.' })] });
  try {
    await start(build, { text: 'hi, build me a red tower' });
    for (let i = 0; i < 4 && !lastEnd(build); i++) await build.session.alarm();
    assert.ok(build.chatCalls[0].req.tools.length > 20, 'a build request lost its tools');
  } finally {
    build.stop();
  }
});

// F-036, 2026-09-22: 101 steps re-tuning one Lighting value between renders.
test('a run that keeps changing the same thing is ended at the retune limit, on what it built', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: () => ({ ok: true, data: {} }),
    responses: [
      ...Array.from({ length: 16 }, (_, i) => calls(['set_properties', { path: 'game.Lighting', props: { FogEnd: 1000 + i } }])),
      answer({ text: 'Done.' }),
    ],
  });
  try {
    await start(h, { text: 'make the lighting a warm sunset' });
    for (let i = 0; i < 30 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(lastEnd(h), 'the run never ended');
    const sets = h.ops.filter((op) => op.op === 'set_props').length;
    assert.ok(sets > 0, 'no set_props reached Studio — the fixture checks nothing');
    assert.ok(sets <= 12, `changed the same target ${sets} times before stopping`);
    const text = h.sent.filter((m) => m.type === 'delta').map((m) => m.text).join('');
    assert.match(text, /changed the same thing many times in a row/);
    assert.equal(lastEnd(h).stopReason, 'incomplete', 'a retune guard is a stopped build, not a completed game');
  } finally {
    h.stop();
  }
});

// F-033, 2026-09-22 (run d1a97c0d): Studio stopped answering mid-run, its tools were withdrawn, and the
// reply told the customer the terrain and lighting tools "aren't offered in this mode".
test('when Studio drops mid-run its tools stay offered, and a call is refused as a disconnect, not a mode limit', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: (op) => (op.op === 'get_tree' ? { ok: true, data: { root: { path: 'game.Workspace', name: 'Workspace', class: 'Workspace', children: [] } } } : { ok: true, data: {} }),
    responses: [
      calls(['get_project_tree', { root: 'game.Workspace' }]),
      calls(['set_properties', { path: 'game.Lighting', props: { ClockTime: 18 } }]),
      answer({ text: 'Studio disconnected; reconnect it from the Apple panel.' }),
    ],
  });
  try {
    await start(h, { text: 'make it sunset' });
    await h.session.alarm();
    assert.ok(h.chatCalls.length >= 1, 'no model call was made — this checks nothing');
    // The plugin stops answering: every heartbeat the session reads is cleared.
    h.store.set('pluginLastSeen', 0); h.session.lastSeenWrittenAt = 0; h.session.pluginLastSeenMs = 0;
    for (let i = 0; i < 6 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(h.chatCalls.length >= 2, 'the run ended before a step with Studio down — this checks nothing');
    const offered = (h.chatCalls[1].req.tools ?? []).map((t) => t.name);
    assert.ok(offered.includes('set_properties'), 'the Studio tools were withdrawn when the link dropped');
    const toolText = JSON.stringify(h.chatCalls[2]?.req.messages.filter((m) => m.role === 'tool' && /set_properties/.test(String(m.content))));
    assert.equal(h.ops.filter((op) => op.op === 'set_props').length, 0, 'the change reached Studio although it was down');
    assert.match(toolText, /not connected right now/);
    assert.match(toolText, /It is not a limit of this mode/);
  } finally {
    h.stop();
  }
});

// ================================================= F-045: one reply body, at most one closing line ===
//
// 2026-09-23, Coin Rush 03:10 IDT: one incomplete run's reply stacked the read-stall note, the generic
// "I did not change anything … never made the edit", the refund sentence and the refusal heading, and
// every multi-step reply read twice live. The property: what a client settles on (msg_end.content)
// is the stored row, it carries ONE closing sentence, the refund at most once, and the deltas never
// send a body the stream already shows.

const GENERIC_INCOMPLETE = /I did not change anything in your project/g;
const STALL = /kept re-reading your place instead of building/g;
const REPEAT = /kept repeating a step it had already done/g;
const REFUND = /You have not been charged for this run/g;
const HEADING = /Apple could not change your place/g;
const count = (text, re) => (String(text).match(re) ?? []).length;
const streamed = (h) => h.sent.filter((m) => m.type === 'delta').map((m) => m.text).join('');
const emptyTree = (op) => (op.op === 'get_tree' ? { ok: true, data: { root: { path: op.root, name: 'x', class: 'Folder', children: [] } } } : { ok: true, data: {} });

test('F-045: a read-stall that changed nothing ends on its own note — no generic sentence on top, the refund once', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: emptyTree,
    responses: [
      ...Array.from({ length: 40 }, (_, i) => calls(['get_project_tree', { root: `game.Workspace.Look${i}` }])),
      answer({ text: 'Done.' }),
    ],
  });
  try {
    await start(h, { text: 'make a coin game' });
    for (let i = 0; i < 60 && !lastEnd(h); i++) await h.session.alarm();
    const end = lastEnd(h);
    assert.equal(end?.stopReason, 'incomplete', 'the fixture never reached the read-stall bound');
    const row = assistantRow(h);
    assert.equal(end.content, row.content, 'what the live client settles on must be what a reload shows');
    assert.equal(count(row.content, STALL), 1, `the stall note must close the reply once: ${row.content}`);
    assert.equal(count(row.content, GENERIC_INCOMPLETE), 0, `the generic sentence was stacked on the stall note: ${row.content}`);
    assert.equal(count(row.content, REFUND), 1, `the refund must be stated exactly once: ${row.content}`);
    const live = streamed(h);
    assert.equal(count(live, STALL), 1, 'the stream repeated the stall note');
    assert.equal(count(live, GENERIC_INCOMPLETE), 0, 'the stream carried the generic sentence as well');
    assert.equal(count(live, REFUND), 1, 'the stream stated the refund more than once');
  } finally {
    h.stop();
  }
});

test('F-045: a refusal the product can explain, on a run that changed nothing, IS the closing — no incomplete note beside it', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: (op) => (op.op === 'get_tree' ? emptyTree(op) : { ok: false, error: 'writes require explicit edit consent', failure: 'refused', remedy: 'edit_consent' }),
    responses: [
      calls(['create_instances', { instances: [{ className: 'Part', name: 'Coin1', parent: 'game.Workspace' }] }]),
      ...Array.from({ length: 40 }, (_, i) => calls(['get_project_tree', { root: `game.Workspace.Look${i}` }])),
      answer({ text: 'Done.' }),
    ],
  });
  try {
    await start(h, { text: 'make a coin game' });
    for (let i = 0; i < 60 && !lastEnd(h); i++) await h.session.alarm();
    const end = lastEnd(h);
    assert.equal(end?.stopReason, 'incomplete', 'the fixture never reached an incomplete ending');
    assert.ok(h.ops.some((op) => op.op !== 'get_tree'), 'no write was refused — this checks nothing');
    const row = assistantRow(h);
    assert.equal(end.content, row.content);
    assert.equal(count(row.content, HEADING), 1, `the refusal heading must close the reply once: ${row.content}`);
    assert.equal(count(row.content, GENERIC_INCOMPLETE), 0, `the generic sentence contradicts the refusal: ${row.content}`);
    assert.equal(count(row.content, STALL), 0, `a second reason was given for the same ending: ${row.content}`);
    assert.equal(count(row.content, REFUND), 1, `the refund must be stated exactly once: ${row.content}`);
    assert.ok(row.content.indexOf('Apple could not change') < row.content.indexOf('You have not been charged'),
      'the reason comes before the money');
  } finally {
    h.stop();
  }
});

test('F-045: a duplicate streak that changed nothing ends on its own note, not the generic sentence', async () => {
  const same = () => calls(['get_project_tree', { root: 'game.Workspace' }]);
  const h = await makeSession({
    connected: true,
    answerOp: emptyTree,
    responses: [...Array.from({ length: 12 }, same), answer({ text: 'Done.' })],
  });
  try {
    await start(h, { text: 'make a coin game' });
    for (let i = 0; i < 20 && !lastEnd(h); i++) await h.session.alarm();
    const end = lastEnd(h);
    assert.equal(end?.stopReason, 'incomplete', 'the fixture never reached the duplicate-streak bound');
    const row = assistantRow(h);
    assert.equal(count(row.content, REPEAT), 1, `the streak note must close the reply once: ${row.content}`);
    assert.equal(count(row.content, GENERIC_INCOMPLETE), 0, `the generic sentence was stacked on the streak note: ${row.content}`);
    assert.equal(end.content, row.content);
  } finally {
    h.stop();
  }
});

test('F-045: a reply that spoke in more than one step is sent once, live and as stored', async () => {
  const body = 'Fixed. The coin spins and gives one point.';
  const h = await makeSession({
    connected: true,
    answerOp: () => ({ ok: true, data: {} }),
    responses: [
      answer({ finishReason: 'tool_calls', text: 'Adding a coin.', toolCalls: [{ id: 'c-coin', name: 'create_instances', arguments: JSON.stringify({ instances: [{ className: 'Part', name: 'Coin1', parent: 'game.Workspace' }] }) }] }),
      answer({ text: body }),
    ],
  });
  try {
    await start(h, { text: 'make a coin' });
    for (let i = 0; i < 12 && !lastEnd(h); i++) await h.session.alarm();
    const end = lastEnd(h);
    assert.ok(end, 'the run never ended');
    assert.ok(h.ops.length > 0, 'the change never reached Studio — this checks nothing');
    const row = assistantRow(h);
    assert.equal(count(streamed(h), new RegExp(body.replace(/\./g, '\\.'), 'g')), 1, `the reply body was streamed twice: ${JSON.stringify(streamed(h))}`);
    assert.equal(count(row.content, new RegExp(body.replace(/\./g, '\\.'), 'g')), 1);
    assert.equal(end.content, row.content, 'the live client must settle on the stored reply');
  } finally {
    h.stop();
  }
});

// F-064 round 5 (2026-09-23, run 2e381849, Apple MAX): 128 ops in, a check passed, eight steps of
// reading, and the run ended "the change was made and checked" with half the request's list unbuilt.
// Every plan step was ticked by its tool having run once, so nothing read as open. The request's own
// list is the checklist: a run is steered to the next part nothing it built is named for.
const LISTED = 'Build a harbour scene: a lighthouse, a wooden pier, fishing boats, a tavern and a market square with stalls. Make it complete, make no mistakes';
function listedRun() {
  return [
    calls(['create_instances', { items: [
      { className: 'Model', name: 'Lighthouse', parent: 'Workspace' },
      { className: 'Model', name: 'WoodenPier', parent: 'Workspace' },
    ] }]),
    calls(['audit_build', {}]),
    ...Array.from({ length: 8 }, (_, i) => calls(['get_project_tree', { root: `game.Workspace.Look${i}` }])),
    calls(['create_instances', { items: [
      { className: 'Model', name: 'FishingBoat', parent: 'Workspace' },
      { className: 'Model', name: 'Tavern', parent: 'Workspace' },
      { className: 'Model', name: 'MarketSquare', parent: 'Workspace' },
      { className: 'Model', name: 'Stall', parent: 'Workspace.MarketSquare' },
    ] }]),
    answer({ text: 'Built the harbour.' }),
    answer({ text: 'Built the harbour.' }),
  ];
}
const builtTree = (op) => (op.op === 'get_tree'
  ? { ok: true, data: { root: { path: op.root, name: 'x', class: 'Folder', children: [
    { path: `${op.root}.Block`, name: 'Block', class: 'Part', props: { Position: [0, 2, 0], Size: [4, 4, 4], Material: 'Wood', Color: [0.6, 0.4, 0.2], Anchored: true } },
  ] } } }
  : { ok: true, data: {} });
const steersSent = (h) => [...new Set(h.chatCalls.flatMap((c) => c.req.messages ?? [])
  .filter((m) => m.role === 'user' && /not finished/i.test(String(m.content))).map((m) => String(m.content)))];

for (const autonomous of [false, true]) {
  test(`F-064: a run whose request lists parts it has not built is steered to the next one, not ended after its check (Autonomous ${autonomous ? 'on, continues spent' : 'off'})`, async () => {
    const h = await makeSession({ connected: true, answerOp: builtTree, responses: listedRun() });
    try {
      await start(h, { text: LISTED, autonomous });
      if (autonomous) h.store.set('agent', structuredClone({ ...h.store.get('agent'), autonomousContinues: 99 }));
      for (let i = 0; i < 30 && !lastEnd(h); i++) await h.session.alarm();
      assert.ok(lastEnd(h), 'the run never ended');
      assert.ok(h.chatCalls.length >= 11, `the fixture never reached the idle bound (${h.chatCalls.length} model calls)`);
      assert.doesNotMatch(streamed(h), /only re-reading the place/, 'the run ended on the idle bound with parts unbuilt');
      const steers = steersSent(h);
      assert.ok(steers.length > 0, 'no steer named a missing part');
      assert.match(steers[0], /boat|tavern|market|stall/i, `the steer did not name an unbuilt part: ${steers[0]}`);
      assert.doesNotMatch(steers[0], /lighthouse|pier/i, 'the steer named a part that was already built');
      assert.ok(h.ops.some((op) => JSON.stringify(op).includes('Tavern')), 'the steered build never reached Studio');
      assert.equal(lastEnd(h).stopReason, 'done');
    } finally {
      h.stop();
    }
  });
}

test('F-064 control: a run whose listed parts are all built still ends on the idle bound as before', async () => {
  const built = listedRun();
  built[0] = calls(['create_instances', { items: ['Lighthouse', 'WoodenPier', 'FishingBoat', 'Tavern', 'MarketSquare', 'Stall']
    .map((name) => ({ className: 'Model', name, parent: 'Workspace' })) }]);
  const h = await makeSession({ connected: true, answerOp: builtTree, responses: built });
  try {
    await start(h, { text: LISTED });
    for (let i = 0; i < 30 && !lastEnd(h); i++) await h.session.alarm();
    assert.match(streamed(h), /only re-reading the place/);
    assert.equal(steersSent(h).length, 0);
  } finally {
    h.stop();
  }
});

// F-064 round 4 (run a933ac87, Apple MAX, Autonomous OFF): three all-duplicate steps ended a run while
// the plan's "Audit and light the scene" was still open. Driven here through the real alarm loop, with
// Autonomous off, rather than only through afterDuplicateStreak.
const isStuckSteer = (m) => m.role === 'user' && /you are stuck/i.test(String(m.content));
/** Every move-on the run was given, off the longest transcript the provider saw (the same text can recur). */
const stuckSteers = (h) => h.chatCalls.map((c) => (c.req.messages ?? []).filter(isStuckSteer).map((m) => String(m.content)))
  .reduce((a, b) => (b.length > a.length ? b : a), []);
const offered = (call) => (call.req.tools ?? []).map((t) => t.name ?? t.function?.name);
const sameRead = () => calls(['get_project_tree', { root: 'game.Workspace.Harbour' }]);
const streakOf = (n = 4) => Array.from({ length: n }, sameRead); // one runs, three are refused as repeats
const build = (...names) => calls(['create_instances', { items: names.map((name) => ({ className: 'Model', name, parent: 'Workspace' })) }]);

test('F-064: a duplicate streak moves an Autonomous-OFF run on to its open plan step instead of ending it', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: builtTree,
    responses: [
      calls(['propose_plan', { steps: [
        { title: 'Build the lighthouse and pier', tool: 'create_instances' },
        { title: 'Audit and light the scene', tool: 'set_properties' },
      ] }]),
      build('Lighthouse', 'WoodenPier'),
      ...streakOf(),
      calls(['set_properties', { path: 'game.Lighting', props: { ClockTime: 18 } }]),
      answer({ text: 'Built the harbour and lit it.' }),
      answer({ text: 'Built the harbour and lit it.' }),
      answer({ text: 'Built the harbour and lit it.' }),
    ],
  });
  try {
    await start(h, { text: 'build a small harbour with a lighthouse and a pier, then light it for the evening' });
    for (let i = 0; i < 20 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(lastEnd(h), 'the run never ended');
    assert.equal(count(streamed(h), REPEAT), 0, 'the run was ended on the duplicate streak with a plan step open');
    const steers = stuckSteers(h);
    assert.equal(steers.length, 1, `expected exactly one move-on, got ${steers.length}`);
    assert.match(steers[0], /Audit and light the scene/, 'the move-on did not name the open plan step');
    // The step after the move-on: the first one offered no reads. It must carry the move-on, offer
    // changes, and be the only such step.
    const withheld = h.chatCalls.map((c, i) => (offered(c).length && !offered(c).includes('get_project_tree') ? i : -1)).filter((i) => i >= 0);
    assert.equal(withheld.length, 1, `reads must be withheld for exactly one step, were for ${withheld.length}`);
    const next = h.chatCalls[withheld[0]];
    assert.ok((next.req.messages ?? []).some(isStuckSteer), 'the step offered no reads is not the one after the move-on');
    assert.ok(offered(next).includes('set_properties'), 'CONTROL: the step after the move-on is still offered changes');
    assert.ok(h.ops.some((op) => JSON.stringify(op).includes('ClockTime')), 'the plan step the run was moved on to never reached Studio');
  } finally {
    h.stop();
  }
});

test('F-064: progress between two streaks renews the move-on, so a run that keeps building is not ended on its third wall', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: builtTree,
    responses: [
      build('Lighthouse'),
      ...streakOf(),
      build('WoodenPier'),
      ...streakOf(),
      build('FishingBoat'),
      ...streakOf(),
      build('Tavern', 'MarketSquare', 'Stall'),
      answer({ text: 'Built the harbour.' }),
      answer({ text: 'Built the harbour.' }),
      answer({ text: 'Built the harbour.' }),
    ],
  });
  try {
    await start(h, { text: LISTED });
    for (let i = 0; i < 30 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(lastEnd(h), 'the run never ended');
    assert.ok(stuckSteers(h).length >= 3 || h.chatCalls.length >= 16,
      `the fixture never reached the third streak (${h.chatCalls.length} model calls)`);
    assert.equal(count(streamed(h), REPEAT), 0, 'a run that built a requested part between every streak was ended as stuck');
    assert.ok(h.ops.some((op) => JSON.stringify(op).includes('Tavern')), 'the part after the third streak never reached Studio');
  } finally {
    h.stop();
  }
});

test('F-064 control: a run that changes things between streaks but builds nothing still left open ends after the bounded move-ons', async () => {
  // The real stop the guard exists for: each wall is met with a change that names no requested part,
  // so no open work closes and the allowance is not renewed.
  const tweak = (t) => calls(['set_properties', { path: 'game.Lighting', props: { ClockTime: t } }]);
  const h = await makeSession({
    connected: true,
    answerOp: builtTree,
    responses: [
      build('Lighthouse'),
      ...streakOf(),
      tweak(10),
      ...streakOf(),
      tweak(11),
      ...streakOf(),
      build('Tavern', 'MarketSquare', 'Stall'),
      answer({ text: 'Built the harbour.' }),
    ],
  });
  try {
    await start(h, { text: LISTED });
    for (let i = 0; i < 30 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(lastEnd(h), 'the run never ended');
    assert.equal(count(streamed(h), REPEAT), 1, 'a run stuck with nothing built between its walls must still end on the streak');
    assert.equal(stuckSteers(h).length, 2, 'moved on exactly the bounded number of times');
    assert.equal(h.ops.some((op) => JSON.stringify(op).includes('Tavern')), false, 'it ended before the scripted build');
    assert.equal(lastEnd(h).stopReason, 'incomplete', 'unbuilt requested work remains despite a place mutation');
  } finally {
    h.stop();
  }
});
