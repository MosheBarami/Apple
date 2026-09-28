/**
 * V3 G03 AND G10, DRIVEN THROUGH THE REAL SessionDO (only the gateway is scripted; the harness is
 * copied from run-loop-traps.test.mjs, per this directory's one-harness-per-file pattern).
 *
 *   G03  a message is refused until the paired place is connected; a disconnect pauses the run;
 *        only `continue` resumes it; completed work is not replayed and queued work is withdrawn.
 *   G10  a message sent mid-run is applied at the next step boundary; Stop is acknowledged over
 *        HTTP when the run has ended (no socket needed); the same failing call is bounded.
 *
 * Run with:  node --test tests/studio-gate-steer.test.mjs      (from apps/worker)
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
const TMP = mkdtempSync(join(tmpdir(), 'studio-gate-steer-'));
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

const { SessionDO } = await import(pathToFileURL(OUT).href);
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
async function makeSession({ responses = [], connected = false, paired = connected, capabilities = null, answerOp } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Trap Place', ownerId: 'owner-1' }]]);
  if (connected) store.set('pluginLastSeen', Date.now());
  if (paired) store.set('pluginTokenHash', 'hash-1');
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
      const next = queue.shift();
      return typeof next === 'function' ? next() : structuredClone(next);
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
      ops.push({ ...op.studioOp, __id: op.id });
      const reply = answerOp ? answerOp(op.studioOp) : { ok: false, error: 'this test does not answer Studio ops', failure: 'refused' };
      waiter({ id: op.id, ...reply });
    }
  }, 1);
  const stop = () => clearInterval(answerer);
  return { session, store, sql, sent, spends, refunds, chatCalls, alarms, ops, stop, ws };
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

const send = (h, msg) => h.session.webSocketMessage(h.ws, JSON.stringify(msg));
const chat = (text) => ({ type: 'chat', text, mode: 'agent' });
const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const errorsWith = (h, code) => h.sent.filter((m) => m.type === 'error' && m.code === code);
const setProps = (path, props) => ['set_properties', { path, props }];
const ok = () => ({ ok: true, data: {} });
/** The plugin stops answering: every heartbeat the session reads is cleared. */
function disconnect(h) {
  h.store.set('pluginLastSeen', 0);
  h.session.lastSeenWrittenAt = 0;
  h.session.pluginLastSeenMs = 0;
}
function reconnect(h) {
  const now = Date.now();
  h.store.set('pluginLastSeen', now);
  h.session.pluginLastSeenMs = now;
}
const toolTexts = (req) => req.messages.filter((m) => m.role === 'tool').map((m) => String(m.content));

// ======================================================================== G03: the gate ===

test('G03: chat and edit are refused with studio_required until the paired place is connected', async () => {
  const cases = [
    ['unpaired', { connected: false, paired: false }],
    ['paired, Studio closed', { connected: false, paired: true }],
    ['paired, another place open', { connected: true, paired: true }, (h) => {
      h.session.placeMismatch = {
        verdict: 'mismatch',
        message: 'Studio has "Other" open, not "Trap Place". Open "Trap Place" to keep building.',
        expected: { placeName: 'Trap Place' },
        open: { placeName: 'Other', placeId: 2 },
      };
    }],
  ];
  for (const [label, opts, prep] of cases) {
    const h = await makeSession({ ...opts, responses: [answer({ text: 'Built.' })] });
    try {
      prep?.(h);
      await send(h, chat('build a tower'));
      await send(h, { type: 'edit_resend', messageId: 'm-1', text: 'build a tower', mode: 'agent' });
      const refusals = errorsWith(h, 'studio_required');
      assert.equal(refusals.length, 2, `${label}: both ingresses must refuse`);
      for (const r of refusals) {
        assert.equal(r.terminal, true, `${label}: no run exists, so the refusal ends the request`);
        assert.ok(r.message.length > 20, `${label}: the refusal must say what to do`);
      }
      assert.equal(h.store.get('agent'), undefined, `${label}: a run was started`);
      assert.equal(h.chatCalls.length, 0, `${label}: a model call was made`);
      assert.equal(h.sql.messages.length, 0, `${label}: the refused message was recorded`);
    } finally {
      h.stop();
    }
  }
  // Control: the same message on a paired, connected place starts a run.
  const h = await makeSession({ connected: true, responses: [answer({ text: 'Built.' })] });
  try {
    await send(h, chat('build a tower'));
    assert.equal(errorsWith(h, 'studio_required').length, 0);
    assert.equal(h.store.get('agent')?.status, 'running', 'the control never started a run — this checks nothing');
  } finally {
    h.stop();
  }
});

// ============================================================= G03: pause and Continue ===

test('G03: Studio dropping mid-step pauses the run; only continue resumes it; completed work is not replayed', async () => {
  let h;
  let dropped = false;
  h = await makeSession({
    connected: true,
    answerOp: (op) => {
      if (!dropped && op.op === 'set_props' && op.path === 'game.Workspace') {
        dropped = true;
        // Studio goes away right after this change lands, leaving one op of this run queued.
        h.session.opQueue.push({ id: 'left-behind', seq: 999, studioOp: { op: 'set_props', path: 'game.Workspace.Late', props: {} }, runId: h.store.get('agent').msgId });
        disconnect(h);
      }
      return ok();
    },
    responses: [
      calls(setProps('game.Workspace', { Gravity: 100 }), setProps('game.StarterPlayer', { CameraMaxZoomDistance: 60 })),
      // After Continue the model asks for both again; the completed one must not run twice.
      calls(setProps('game.Workspace', { Gravity: 100 }), setProps('game.StarterPlayer', { CameraMaxZoomDistance: 60 })),
      answer({ text: 'Gravity raised and the camera zoom capped.' }),
    ],
  });
  try {
    await send(h, chat('raise gravity and cap the camera zoom'));
    await h.session.alarm();
    assert.ok(dropped, 'Studio never dropped — this checks nothing');

    // Paused, not ended, and persisted.
    const paused = h.store.get('agent');
    assert.equal(paused.status, 'running');
    assert.equal(paused.pausedForStudio?.reason, 'disconnected');
    assert.equal(lastEnd(h), undefined, 'a disconnect must pause the run, not end it');
    const snap = [...h.sent].reverse().find((m) => m.type === 'run_state');
    assert.equal(snap?.run?.paused?.reason, 'disconnected', 'the browser was not told the run paused');
    // No further mutation: the second call of the step was not sent, and queued work was withdrawn.
    assert.deepEqual(h.ops.filter((op) => op.op === 'set_props').map((op) => op.path), ['game.Workspace']);
    assert.equal(h.session.opQueue.some((op) => op.id === 'left-behind'), false, 'a queued op would be delivered on reconnect');
    // The transcript answers every call of the turn, and says the unrun one was not attempted.
    const unrun = paused.llm.filter((m) => m.role === 'tool').map((m) => String(m.content)).find((t) => /Not run/.test(t));
    assert.ok(unrun, 'the call Studio never saw has no result');

    // Continue while Studio is still down is refused, and the run stays paused.
    await send(h, { type: 'continue' });
    const refused = errorsWith(h, 'studio_required').at(-1);
    assert.ok(refused, 'continue with Studio down must be refused');
    assert.equal(refused.terminal, false, 'the run is still there; the refusal must not end it in the browser');
    assert.ok(h.store.get('agent').pausedForStudio);

    // Reconnecting alone resumes nothing, however many alarms fire.
    reconnect(h);
    for (let i = 0; i < 3; i++) await h.session.alarm();
    assert.equal(h.chatCalls.length, 1, 'the run resumed without Continue');

    // Continue resumes it.
    await send(h, { type: 'continue' });
    assert.equal(h.store.get('agent').pausedForStudio, undefined);
    for (let i = 0; i < 4 && !lastEnd(h); i++) await h.session.alarm();
    assert.equal(h.chatCalls.length, 3, 'the run did not carry on after Continue');
    assert.equal(lastEnd(h)?.stopReason, 'done');
    const changes = h.ops.filter((op) => op.op === 'set_props').map((op) => op.path);
    assert.equal(changes.filter((p) => p === 'game.Workspace').length, 1, 'a completed change was replayed');
    assert.equal(changes.filter((p) => p === 'game.StarterPlayer').length, 1, 'the change that never ran was not run after Continue');
    assert.equal(changes.includes('game.Workspace.Late'), false);
    const ids = h.ops.map((op) => op.__id);
    assert.equal(new Set(ids).size, ids.length, 'an op id was delivered twice');
  } finally {
    h.stop();
  }
});

test('G03: a disconnect between steps pauses before the next model call is paid for', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: ok,
    responses: [calls(setProps('game.Lighting', { ClockTime: 18 })), answer({ text: 'Done.' })],
  });
  try {
    await send(h, chat('make it sunset'));
    await h.session.alarm();
    disconnect(h);
    await h.session.alarm();
    assert.equal(h.chatCalls.length, 1, 'a model step was taken with Studio down');
    assert.equal(h.store.get('agent').pausedForStudio?.reason, 'disconnected');
    // Another place open is a pause too.
    reconnect(h);
    h.session.placeMismatch = { verdict: 'mismatch', message: 'Open "Trap Place".', expected: { placeName: 'Trap Place' }, open: { placeName: 'Other', placeId: 2 } };
    await send(h, { type: 'continue' });
    assert.ok(h.store.get('agent').pausedForStudio, 'continue on the wrong place resumed the run');
  } finally {
    h.stop();
  }
});

// ================================================================= G10: steering ===

test('G10: a message sent during a run is queued and reaches the model at the next step boundary', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: ok,
    responses: [
      calls(setProps('game.Lighting', { ClockTime: 18 })),
      answer({ text: 'Sunset set, and the tower is blue.' }),
    ],
  });
  try {
    await send(h, chat('make it sunset'));
    await h.session.alarm();
    const before = h.store.get('agent').llm.length;
    await send(h, chat('also make the tower blue'));
    // Queued, not applied, not a second run, not refused as busy.
    assert.equal(h.sent.filter((m) => m.type === 'steer' && m.state === 'queued').length, 1);
    assert.equal(errorsWith(h, 'busy').length, 0, 'a message during a run was refused as busy');
    assert.equal(h.sent.filter((m) => m.type === 'msg_start').length, 1, 'a second run was started');
    assert.equal(h.store.get('agent').llm.length, before, 'the message was applied mid-step');
    assert.equal(h.chatCalls.length, 1);

    await h.session.alarm();
    const req = h.chatCalls[1]?.req;
    assert.ok(req, 'the run never took its next step');
    const users = req.messages.filter((m) => m.role === 'user').map((m) => String(m.content));
    assert.ok(users.at(-1).includes('also make the tower blue'), 'the direction did not reach the next step');
    assert.ok(/do not redo completed steps/i.test(users.at(-1)), 'the direction must keep completed work');
    assert.equal(h.sent.filter((m) => m.type === 'steer' && m.state === 'applied').length, 1);
    assert.ok(h.sql.messages.some((m) => m.role === 'user' && m.content === 'also make the tower blue'), 'the direction is not in the conversation');
    assert.equal(h.ops.filter((op) => op.op === 'set_props').length, 1, 'the completed change was repeated');
  } finally {
    h.stop();
  }
});

test('G10: direction that arrives while a step is finishing keeps the run going instead of being dropped', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: ok,
    responses: [answer({ text: 'Here is the plan.' }), answer({ text: 'Plan revised for a blue tower.' }), answer({ text: 'Plan revised for a blue tower.' }), answer({ text: 'Plan revised for a blue tower.' })],
  });
  try {
    // A greeting ends on its first text-only reply, so only the queued direction can keep it going.
    await send(h, chat('hello'));
    const scripted = h.session.env.__testChat;
    h.session.env.__testChat = async (req, opts) => {
      if (h.chatCalls.length === 0) await send(h, chat('make it blue'));
      return scripted(req, opts);
    };
    for (let i = 0; i < 6 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(h.chatCalls.length >= 2, 'the run ended with the direction still queued');
    assert.ok(h.chatCalls[1].req.messages.some((m) => m.role === 'user' && String(m.content).includes('make it blue')));
    assert.equal(h.sent.filter((m) => m.type === 'steer' && m.state === 'dropped').length, 0);
    assert.equal(h.sent.filter((m) => m.type === 'msg_end').length, 1);
  } finally {
    h.stop();
  }
});

// =================================================================== G10: Stop ===

test('G10: HTTP Stop is acknowledged once the run has ended, with the socket dead', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: ok,
    responses: [calls(setProps('game.Lighting', { ClockTime: 18 })), answer({ text: 'never reached' })],
  });
  try {
    await send(h, chat('make it sunset'));
    await h.session.alarm();
    h.ws.readyState = 3;
    h.ws.send = () => { throw new Error('the socket is dead'); };
    const pending = h.session.fetch(new Request('https://do/agent-stop', { method: 'POST' }));
    await new Promise((r) => setTimeout(r, 20));
    await h.session.alarm();
    const body = await (await pending).json();
    assert.equal(body.ended, true, 'Stop was not acknowledged as ended');
    assert.equal(h.store.get('agent').status, 'idle');
    assert.equal(h.chatCalls.length, 1, 'a step ran after Stop');
  } finally {
    h.stop();
  }
});

test('G10: Stop ends a paused run promptly — the stop brings its alarm forward', async () => {
  const h = await makeSession({
    connected: true,
    answerOp: ok,
    responses: [calls(setProps('game.Lighting', { ClockTime: 18 })), answer({ text: 'never reached' })],
  });
  try {
    await send(h, chat('make it sunset'));
    await h.session.alarm();
    disconnect(h);
    await h.session.alarm();
    assert.ok(h.store.get('agent').pausedForStudio, 'the run never paused — this checks nothing');
    const t = Date.now();
    await send(h, { type: 'stop' });
    assert.ok(h.alarms.at(-1) <= Date.now() && h.alarms.at(-1) >= t, 'Stop left a paused run waiting on no alarm');
    await h.session.alarm();
    assert.equal(h.store.get('agent').status, 'idle');
    assert.equal(lastEnd(h)?.stopReason, 'stopped');
  } finally {
    h.stop();
  }
});

// ================================================== G10: repeated unchanged failure ===

test('G10: the same call failing the same way is stopped at the bound, even with changes in between', async () => {
  const tree = ['get_project_tree', { root: 'game.Workspace' }];
  const h = await makeSession({
    connected: true,
    answerOp: (op) => (op.op === 'get_tree' ? { ok: false, error: 'Studio declined', failure: 'refused' } : ok()),
    responses: [
      calls(tree), calls(setProps('game.Lighting', { ClockTime: 18 })),
      calls(tree), calls(setProps('game.Workspace', { Gravity: 100 })),
      calls(tree), calls(setProps('game.StarterPlayer', { CameraMaxZoomDistance: 60 })),
      calls(tree),
      answer({ text: 'Done what I could.' }),
    ],
  });
  try {
    await send(h, chat('tidy up the place'));
    for (let i = 0; i < 10 && !lastEnd(h); i++) await h.session.alarm();
    assert.ok(h.chatCalls.length >= 8, 'the run ended before the fourth attempt — this checks nothing');
    assert.equal(h.ops.filter((op) => op.op === 'get_tree').length, 3, 'a call that failed the same way three times ran again');
    const last = toolTexts(h.chatCalls[7].req).at(-1);
    assert.match(last, /failed every time/);
    assert.equal(h.ops.filter((op) => op.op === 'set_props').length, 3, 'the work between the failures was not kept');
  } finally {
    h.stop();
  }
});

test('G10: Stop during an in-flight model call ends the run without waiting for the call', async () => {
  const h = await makeSession({ connected: true, answerOp: ok, responses: [() => new Promise(() => {})] });
  try {
    await send(h, chat('build a castle'));
    const step = h.session.alarm(); // never-returning provider call
    await new Promise((r) => setTimeout(r, 20));
    const t0 = Date.now();
    const body = await (await h.session.fetch(new Request('https://do/agent-stop', { method: 'POST' }))).json();
    await step;
    assert.equal(body.ended, true, 'Stop was not acknowledged as ended');
    assert.ok(Date.now() - t0 < 3000, 'Stop waited for the model call');
    assert.equal(h.store.get('agent').status, 'idle');
  } finally {
    h.stop();
  }
});
