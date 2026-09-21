/**
 * REACHED AND FINISHED, ASSERTED TOGETHER — BECAUSE EITHER HALF ALONE READS AS SUCCESS.
 *
 * Measured 2026-09-20 against the deployed worker (free Apple lane, mode stone, GLM-5.3-flash,
 * Studio disconnected, so the agent is offered the 8-tool offline set of which two are the
 * knowledge tools). Of 10 measurable runs, 7 reached a real knowledge tool and 3 finished cleanly —
 * and the two sets did not intersect. Every run that called get_ui_construction or
 * get_verified_module ended in provider error; every run that ended cleanly had called neither.
 * A customer only ever sees a finished run, so the library's measured 70% reach rate was worth
 * nothing.
 *
 * TWO EARLIER MEASUREMENTS WATCHED THIS HAPPEN AND REPORTED SUCCESS OR A DIFFERENT FAILURE:
 *
 *   * first-reach asked whether a knowledge tool was called FIRST and answered 0 of 12. True, and
 *     misleading — it measures ordering, and the runs it scored zero on had reached the library
 *     later in the same run.
 *   * the any-call measurement asked whether one was called at all and answered 70%. Also true.
 *     It caught the real defect only because somebody afterwards cross-tabulated it against which
 *     runs COMPLETED.
 *
 * Neither could have failed on this, because neither asserted the CONJUNCTION. That is what
 * `verdict` below is: one value, false whenever a run reached the library without finishing OR
 * finished without reaching it, and the two control tests exist to prove each half is insufficient
 * on its own rather than to leave that as a claim in a comment.
 *
 * WHAT WAS ACTUALLY KILLING THEM is recorded on RATE_LIMIT_WAIT_MS in src/do/session.ts: a Workers
 * AI rate-limit refusal is free — nothing reached the model, nothing was billed, the reservation is
 * handed back — and SessionDO turned it into a terminal run failure. That deleted long runs
 * selectively, and the long runs are the ones that used the library.
 *
 * Run with:  node --test tests/knowledge-run-completes.test.mjs      (from apps/worker)
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
const TMP = mkdtempSync(join(tmpdir(), 'knowledge-run-completes-'));
const OUT = join(TMP, 'session.mjs');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
  plugins: [{
    name: 'refusing-gateway',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: 'refusing-gateway', namespace: 'refuse' }));
      build.onLoad({ filter: /.*/, namespace: 'refuse' }, () => ({
        loader: 'js',
        contents: `
          export class BudgetError extends Error {
            constructor(reason, message) { super(message); this.reason = reason; }
          }
          // The REAL class, raised from the REAL place. A fixture asks for a refusal with a
          // sentinel and it becomes a RateLimitedError here, at the provider boundary, so the
          // subclass tagging in runStep is exercised rather than bypassed.
          export class RateLimitedError extends Error {
            constructor(message) { super(message); this.name = 'RateLimitedError'; }
          }
          export async function chat(env, req, opts) {
            const next = await env.__testChat(req, opts);
            if (next && next.__refuse) {
              throw new RateLimitedError('Apple is handling a burst of requests right now. Nothing was charged — try that again in a moment.');
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

// ---------------------------------------------------------------------------------------------

const result = (rows = [], one = null) => ({ toArray: () => rows, one: () => one });

class SqlMemory {
  constructor() { this.messages = []; this.models = new Map(); }
  exec(statement, ...args) {
    const q = statement.replace(/\s+/g, ' ').trim();
    if (/pragma_table_info\('checkpoints'\)/.test(q)) return result([]);
    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const withTrace = args.length === 6;
      this.messages.push({
        id, role, mode, content,
        tool_trace: withTrace ? maybeTrace : null,
        created_at: withTrace ? maybeCreated : maybeTrace,
      });
      return result();
    }
    if (q.startsWith('update messages set stop_reason = ?')) {
      const [stop_reason, run_failure, credits_spent, ...rest] = args;
      const row = this.messages.find((m) => m.id === rest[rest.length - 1]);
      if (row) Object.assign(row, { stop_reason, run_failure, credits_spent });
      return result();
    }
    if (q.startsWith('insert into message_models')) { this.models.set(args[0], args[1]); return result(); }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    return result();
  }
}

function makeSession({ responses = [] } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Test Place', ownerId: 'owner-1' }]]);
  const sql = new SqlMemory();
  const sent = [];
  const spends = [];
  const chatCalls = [];
  const alarms = [];
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
      fetch: async (input, init) => {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const settled = () => {
          const spent = spends.reduce((n, v) => n + v, 0);
          return {
            plan: 'free', creditsRemaining: 100 - spent, creditsDaily: 100,
            allowanceRemaining: 100 - spent, credits: 0, resetsAtIso: '2026-09-21T00:00:00.000Z',
          };
        };
        if (name === 'QUOTA_DO' && path === '/state') return Response.json(settled());
        if (name === 'QUOTA_DO' && path === '/spend') {
          spends.push(Number(init?.body ? JSON.parse(init.body).credits : 0));
          return Response.json({ ok: true, state: settled() });
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
      async delete(key) { store.delete(key); return true; },
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
      assert.ok(queue.length > 0, 'the test gateway ran more times than the fixture supplied');
      return structuredClone(queue.shift());
    },
  };
  return { session: new SessionDO(ctx, env), store, sql, sent, spends, chatCalls, alarms, ws };
}

const answer = ({ finishReason = 'stop', text = '', toolCalls = [], neurons = 40 } = {}) => ({
  text, toolCalls,
  usage: { inputTokens: 900, outputTokens: Math.max(1, Math.ceil(text.length / 4)) },
  neurons, provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', finishReason,
});

/** What the provider did in the measured burst: refuse before the model produced a token. */
const REFUSED = { __refuse: true };

const CALLS_UI_CONSTRUCTION = answer({
  finishReason: 'tool_calls',
  toolCalls: [{ id: 'k-1', name: 'get_ui_construction', arguments: JSON.stringify({ id: 'screen-shop' }) }],
});

async function start(h, text = 'build me a shop screen') {
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST', body: JSON.stringify({ text, mode: 'stone', productModel: 'apple' }),
  }));
  assert.equal(res.status, 200, await res.text());
}

const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const assistantRow = (h) => [...h.sql.messages].reverse().find((m) => m.role === 'assistant');

/** The moment the provider's burst clears, delivered the way workerd delivers it: the alarm fires. */
async function fireScheduledAlarm(h) {
  const agent = h.store.get('agent');
  assert.equal(typeof agent.resumeAt, 'number', 'a refused step must name the moment it may be retried');
  assert.ok(agent.resumeAt > Date.now(), 'and that moment must be in the future — a wait of zero is not a wait');
  assert.equal(h.alarms[h.alarms.length - 1], agent.resumeAt, 'the alarm must be armed for exactly that moment');
  h.store.set('agent', structuredClone({ ...agent, resumeAt: Date.now() - 1 }));
  await h.session.alarm();
}

const KNOWLEDGE_TOOLS = new Set(['get_ui_construction', 'get_verified_module']);

/**
 * THE JOINT PROPERTY, AS ONE VALUE.
 *
 * Read off the persisted transcript rather than the live agent, because the transcript is what the
 * customer is left holding. `reached` requires a SUCCESSFUL knowledge call: a refused or
 * hallucinated tool name is a run that tried to use the library, not one that used it.
 */
function verdict(h) {
  const end = lastEnd(h);
  const row = assistantRow(h);
  const trace = row?.tool_trace ? JSON.parse(row.tool_trace) : [];
  const reached = trace.some((t) => KNOWLEDGE_TOOLS.has(t.tool) && t.ok === true);
  const finished = end?.stopReason === 'done';
  return { reached, finished, ok: reached && finished, calls: trace.filter((t) => KNOWLEDGE_TOOLS.has(t.tool)).length };
}

// =============================================================================================

test('A RUN THAT USES THE KNOWLEDGE LIBRARY FINISHES, THROUGH THE BURST THAT USED TO END IT', async () => {
  const h = makeSession({ responses: [
    CALLS_UI_CONSTRUCTION,   // step 1: reach the library
    REFUSED,                 // step 2: the provider refuses, un-billed — this used to end the run
    answer({ finishReason: 'stop', text: 'Shop screen built to the shipped construction spec.' }),
  ] });
  await start(h);

  await h.session.alarm();
  assert.equal(h.store.get('agent').trace.some((t) => t.tool === 'get_ui_construction' && t.ok), true,
    'control: the knowledge tool really ran — without this the joint property is vacuous');

  const stepsDone = h.store.get('agent').step;
  await h.session.alarm();

  const waiting = h.store.get('agent');
  assert.equal(waiting.status, 'running', 'a free refusal is not a failed run');
  assert.equal(lastEnd(h), undefined, 'and it does not end the message');
  assert.equal(waiting.step, stepsDone,
    'the refused step is given back: the provider never ran it, so it must not spend the step budget');

  await fireScheduledAlarm(h);
  assert.equal(h.store.get('agent').step, stepsDone + 1,
    'and the retry is the SAME step number, not a step further into the budget');

  const v = verdict(h);
  assert.deepEqual(
    { reached: v.reached, finished: v.finished },
    { reached: true, finished: true },
    'reached AND finished — the property the earlier measurements each saw half of',
  );
  assert.equal(v.calls, 1, 'resuming the step must not re-run the work the step had already done');
  assert.equal(lastEnd(h).error, undefined, 'a run that rode out a burst reports no failure');
});

test('a burst that never clears sleeps and keeps the same run alive instead of handing it back to the user', async () => {
  const h = makeSession({ responses: [CALLS_UI_CONSTRUCTION, REFUSED, REFUSED, REFUSED, REFUSED] });
  await start(h);
  await h.session.alarm();

  await h.session.alarm();
  for (let i = 0; i < 3; i++) await fireScheduledAlarm(h);

  const waiting = h.store.get('agent');
  assert.equal(lastEnd(h), undefined, 'provider burst must not manufacture a terminal customer reply');
  assert.equal(waiting.status, 'running');
  assert.equal(typeof waiting.resumeAt, 'number');
  assert.equal(h.chatCalls.length, 5, 'the fixture exercised four refused retries after the knowledge call');
  assert.equal(waiting.trace.some((t) => t.tool === 'get_ui_construction' && t.ok), true,
    'the work already completed before the burst remains on the live run');
});

test('CONTROL — REACHED WHILE STILL RUNNING is not misreported as a finished success', async () => {
  const h = makeSession({ responses: [CALLS_UI_CONSTRUCTION, REFUSED, REFUSED, REFUSED, REFUSED] });
  await start(h);
  await h.session.alarm();
  await h.session.alarm();
  for (let i = 0; i < 3; i++) await fireScheduledAlarm(h);

  const live = h.store.get('agent');
  assert.equal(live.trace.some((t) => t.tool === 'get_ui_construction' && t.ok), true, 'the library WAS used');
  assert.equal(lastEnd(h), undefined, 'the run is still working rather than falsely terminal');
  assert.equal(live.status, 'running');
});

test('CONTROL — FINISHED WITHOUT REACHING reads as failure, which the any-call measurement scored 0 and moved on', async () => {
  // The other shape the deployed worker produced: a clean `done` that consulted nothing. Three of
  // the ten measurable runs looked exactly like this, and all three were counted as completions.
  const h = makeSession({ responses: [answer({ finishReason: 'stop', text: 'Here is a shop screen from memory.' })] });
  await start(h);
  await h.session.alarm();

  const v = verdict(h);
  assert.equal(v.finished, true, 'the run finished cleanly');
  assert.equal(v.reached, false, 'having consulted the library not at all');
  assert.equal(v.ok, false, 'a completion that skipped the library does not satisfy the property either');
});
