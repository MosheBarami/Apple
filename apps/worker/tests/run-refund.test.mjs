/**
 * A RUN THAT PRODUCED NOTHING MUST NOT BILL FOR THE ATTEMPT.
 *
 * THE DEFECT. Credits are settled from measured compute after every model call, which is the
 * honest way to charge for work that happened — and until this change it was the ONLY arithmetic
 * in the product. There was no refund path anywhere. So a run cut off at the provider's output
 * ceiling, or killed by the wall clock, or stopped by the step cap, charged for every neuron it
 * burned and then told the user, in the product's own words, to "send another message and Apple
 * will continue from here" — which starts a second run and charges again. One build, paid for
 * twice, every individual sentence true.
 *
 * THREE LAYERS, because the defect could be reintroduced at any of them:
 *
 *   1. THE RULE (src/run-refund.ts). Which endings qualify, and what counts as output. Pure.
 *   2. THE LEDGER (src/do/quota.ts, EXECUTED). `/spend` must report which ledger it took from, and
 *      `/refund` must reverse the same two ledgers, idempotently, without ever pushing a day's
 *      allowance below zero.
 *   3. THE WIRING (src/do/session.ts, EXECUTED, real lifecycle, no provider). The Credits actually
 *      come back, the transcript says so, and `msg_end` carries the same number as the row.
 *
 * Nothing here contacts a provider or any network endpoint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'run-refund-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));

// ---------------------------------------------------------------- 1. the rule
const RULE_OUT = join(TMP, 'rule.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'run-refund.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${RULE_OUT}`],
  { cwd: WORKER, stdio: 'pipe' },
);
const { refundVerdict, refundSentence, runDeliveredSomething } = await import(pathToFileURL(RULE_OUT).href);

/** A builder run that burned two Credits and has nothing to show for it. */
const barren = (over = {}) => ({
  reason: 'error',
  mode: 'stone',
  opsApplied: 0,
  mutated: false,
  artifactRequested: false,
  artifactMissing: false,
  textDelivered: false,
  creditsSpent: 2,
  ...over,
});

test('THE CASE THE PRODUCT WAS CHARGING TWICE FOR: cut off, nothing applied, nothing kept', () => {
  const v = refundVerdict(barren());
  assert.equal(v.refund, true);
  assert.equal(v.credits, 2, 'the whole run comes back, not a token gesture');
  assert.equal(v.why, 'no_usable_output');
});

test('the step cap and the wall clock refund too — they report `done` on the wire and are failures', () => {
  for (const buildOutcome of ['step_limit', 'timeout']) {
    const v = refundVerdict(barren({ reason: 'done', buildOutcome }));
    assert.equal(v.refund, true, `${buildOutcome} must be refundable`);
  }
  assert.equal(refundVerdict(barren({ reason: 'done', buildOutcome: 'done' })).refund, false, 'an ordinary success is not');
});

test('WORK THE USER CAN KEEP IS CHARGED FOR, whatever went wrong afterwards', () => {
  //[[ RE-AIMED 2026-09-20. THE PRINCIPLE IN THE TITLE IS RIGHT; `opsApplied` WAS THE WRONG PROXY.
  //   This asserted `opsApplied: 1 -> delivered`. session.ts computes opsApplied as every tool call
  //   that SUCCEEDED — `get_project_tree` and `propose_plan` included, both of which change
  //   nothing and both of which open every Agent run. So "work the user can keep" was true for any
  //   run that reached its plan, and a run that died at step 1 having built nothing was charged in
  //   full. Owner's screenshot: 30 Credits, nothing created, no refund. A read is not work anybody
  //   can keep; `mutated` is the flag that means the place changed, and it is asserted below. ]]
  assert.equal(refundVerdict(barren({ opsApplied: 1 })).refund, true,
    'a successful READ is being counted as work the user can keep, so a failed run pays in full');
  assert.equal(refundVerdict(barren({ mutated: true })).why, 'delivered');
  assert.equal(
    refundVerdict(barren({ artifactRequested: true, artifactMissing: false })).why,
    'delivered',
    'the image it was asked for exists — the run is worth its Credits',
  );
  assert.equal(
    refundVerdict(barren({ artifactRequested: true, artifactMissing: true })).refund,
    true,
    'and an image that was asked for and never produced is not',
  );
});

test('prose is the deliverable in a conversational mode and is NOT one in a builder mode', () => {
  assert.equal(refundVerdict(barren({ mode: 'clay', textDelivered: true })).why, 'delivered');
  assert.equal(
    refundVerdict(barren({ mode: 'stone', textDelivered: true })).refund,
    true,
    'do/session.ts: "a build request that ends with prose and no change has failed, whatever the prose says"',
  );
  assert.equal(refundVerdict(barren({ mode: 'clay', textDelivered: false })).refund, true);
});

test('pressing stop is not a refund, and neither is a run nobody was charged for', () => {
  assert.equal(refundVerdict(barren({ reason: 'stopped' })).why, 'not_a_failure');
  assert.equal(refundVerdict(barren({ creditsSpent: 0 })).why, 'nothing_charged');
  assert.equal(refundVerdict(barren({ creditsSpent: Number.NaN })).refund, false, 'a refund nobody can compute is not a refund of NaN');
  assert.equal(refundVerdict(barren({ reason: 'quota' })).refund, true, 'running out with nothing to show hands the Credits back');
});

test('runDeliveredSomething is the single answer both the verdict and the wording are written from', () => {
  assert.equal(runDeliveredSomething(barren()), false);
  // Three successful reads are still nothing delivered — see the re-aim note above.
  assert.equal(runDeliveredSomething(barren({ opsApplied: 3 })), false);
  assert.equal(runDeliveredSomething(barren({ mutated: true })), true);
});

test('THE SENTENCE SAYS WHAT THE LEDGER RETURNED, never what was asked for', () => {
  assert.match(refundSentence(2, 2), /not been charged/);
  assert.match(refundSentence(1, 1), /the 1 Credit it used has been put back/);
  assert.match(refundSentence(3, 1), /1 of the 3 Credits/);
  assert.match(refundSentence(3, 0), /could not be returned automatically/);
  assert.equal(refundSentence(0, 0), null, 'nothing to say means nothing appended');
});

// -------------------------------------------------------------- 2. the ledger
const QUOTA_OUT = join(TMP, 'quota.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [
    join(WORKER, 'src', 'do', 'quota.ts'), '--bundle', '--format=esm', '--target=es2022',
    `--alias:cloudflare:workers=${join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs')}`,
    `--outfile=${QUOTA_OUT}`,
  ],
  { cwd: WORKER, stdio: 'pipe' },
);
const { QuotaDO } = await import(pathToFileURL(QUOTA_OUT).href);

/**
 * The ledger in miniature — MODELLED, not stubbed.
 *
 * The property under test is arithmetic over rows, so a sql fake that answered a constant would
 * make every assertion below meaningless. Rows go in; the two aggregate queries the DO actually
 * issues come out of the rows. `applied_refunds` is a real set, because idempotency is the thing
 * that stops a retried alarm minting Credits.
 */
function quota(seed = {}) {
  const store = new Map(Object.entries(seed));
  const rows = [];
  const refunds = new Map();
  const months = new Map();
  const nil = { toArray: () => [], one: () => null };
  const sql = {
    exec(q, ...a) {
      if (/^\s*create table/i.test(q)) return nil;
      if (/^\s*alter table/i.test(q)) return nil;
      if (/insert into ledger/i.test(q)) { rows.push({ day: a[0], kind: a[1], credits: a[2] }); return nil; }
      if (/insert into month_totals/i.test(q)) { months.set(a[0], Math.max(0, (months.get(a[0]) ?? 0) + a[1])); return nil; }
      if (/select refund_id from applied_refunds/i.test(q)) {
        return { toArray: () => (refunds.has(a[0]) ? [{ refund_id: a[0] }] : []), one: () => null };
      }
      if (/insert into applied_refunds/i.test(q)) { refunds.set(a[0], { at: a[1], credits: a[2] }); return nil; }
      if (/delete from applied_refunds/i.test(q)) { for (const [k, v] of refunds) if (v.at < a[0]) refunds.delete(k); return nil; }
      if (/delete from ledger where day </i.test(q)) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].day < a[0]) rows.splice(i, 1); return nil; }
      if (/where day = \?/.test(q)) return { one: () => ({ s: rows.filter((r) => r.day === a[0]).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      if (/where day like \?/.test(q)) {
        const p = String(a[0]).replace('%', '');
        return { one: () => ({ s: rows.filter((r) => r.day.startsWith(p)).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      }
      return { toArray: () => [], one: () => ({ s: 0 }) };
    },
  };
  const storage = {
    async get(k) { const v = store.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) {
      if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, structuredClone(v));
      else store.set(a, structuredClone(b));
    },
    async delete(k) { store.delete(k); },
    sql,
  };
  const o = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (p, body, method = 'POST') =>
    (await o.fetch(new Request(`https://do${p}`, { method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) }))).json();
  return {
    call, rows, months, store,
    spend: (credits, kind = 'usage_stone') => call('/spend', { credits, kind }),
    refund: (body) => call('/refund', body),
    state: () => call('/state', null, 'GET'),
    /** what the day-keyed ledger actually holds, which is the only figure that bills anyone */
    recordedToday: () => rows.reduce((x, r) => x + r.credits, 0),
  };
}

test('A SPEND NOW SAYS WHICH LEDGER IT CAME OUT OF — without it no refund can be apportioned', async () => {
  const q = quota();
  const a = await q.spend(3);
  assert.equal(a.ok, true);
  assert.equal(a.fromAllowance, 3, 'the free allowance is spent first, and says so');
  assert.equal(a.fromCredits, 0);
});

test('a spend that straddles the allowance boundary reports BOTH halves', async () => {
  const q = quota({ credits: 10 });
  const daily = (await q.state()).creditsDaily;
  const r = await q.spend(daily + 4);
  assert.equal(r.ok, true);
  assert.equal(r.fromAllowance, daily);
  assert.equal(r.fromCredits, 4, 'the purchased balance covers only the remainder');
});

test('THE REFUND PUTS BACK EXACTLY WHAT WAS TAKEN, in the same two ledgers', async () => {
  const q = quota({ credits: 10 });
  const daily = (await q.state()).creditsDaily;
  const spent = await q.spend(daily + 4);
  const before = await q.state();
  assert.equal(before.allowanceRemaining, 0);
  assert.equal(before.credits, 6);

  const back = await q.refund({ fromAllowance: spent.fromAllowance, fromCredits: spent.fromCredits, refundId: 'run-1' });
  assert.equal(back.ok, true);
  assert.equal(back.returned, daily + 4);
  const after = await q.state();
  assert.equal(after.allowanceRemaining, daily, 'the rate is restored as a rate');
  assert.equal(after.credits, 10, 'and the purchased balance as a balance');
  assert.equal(q.recordedToday(), 0, 'the day nets to zero rather than being rewritten');
});

test('IDEMPOTENT: a retried alarm must not mint Credits out of a crash', async () => {
  const q = quota();
  await q.spend(4);
  const first = await q.refund({ fromAllowance: 4, fromCredits: 0, refundId: 'run-1' });
  const second = await q.refund({ fromAllowance: 4, fromCredits: 0, refundId: 'run-1' });
  assert.equal(first.returned, 4);
  assert.equal(second.replayed, true);
  assert.equal(second.returned, 0, 'a replay moved nothing and says so');
  assert.equal(q.recordedToday(), 0, 'and the ledger was touched exactly once');
});

test('A DAY IS NEVER PUSHED BELOW ZERO — the midnight case, which is the user\'s money', async () => {
  const q = quota();
  // A run that began yesterday: its charge is on yesterday's day key, and yesterday's allowance
  // has already reset. Reversing against today would hand out an allowance nobody ever had.
  const r = await q.refund({ fromAllowance: 5, fromCredits: 0, refundId: 'run-overnight' });
  assert.equal(r.ok, true);
  assert.equal(r.asked, 5);
  assert.equal(r.returned, 0, 'nothing today to reverse');
  const st = await q.state();
  assert.equal(st.allowanceRemaining, st.creditsDaily, 'and not one Credit more than a full day');
});

test('a partial absorb reports the partial figure rather than the ask', async () => {
  const q = quota();
  await q.spend(2);
  const r = await q.refund({ fromAllowance: 5, fromCredits: 0, refundId: 'run-partial' });
  assert.equal(r.asked, 5);
  assert.equal(r.returned, 2);
});

test('the refund door cannot be used as a charge door', async () => {
  const q = quota({ credits: 7 });
  const r = await q.refund({ fromAllowance: -100, fromCredits: -50, refundId: 'run-hostile' });
  assert.equal(r.returned, 0);
  assert.equal((await q.state()).credits, 7, 'a negative body took nothing away');
  const noId = await q.refund({ fromAllowance: 1, fromCredits: 0 });
  assert.equal(noId.ok, false, 'a refund with no id could not be made idempotent and is refused');
});

// -------------------------------------------------------------- 3. the wiring
const SESSION_OUT = join(TMP, 'session.mjs');
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: SESSION_OUT,
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
  plugins: [{
    name: 'deterministic-gateway',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: 'refund-gateway', namespace: 'refund' }));
      build.onLoad({ filter: /.*/, namespace: 'refund' }, () => ({
        loader: 'js',
        contents: `
          export class BudgetError extends Error { constructor(reason, message) { super(message); this.reason = reason; } }
          export class RateLimitedError extends Error {}
          export async function chat(env, req, opts) { return env.__testChat(req, opts); }
          export async function reasoningEffortApplies() { return true; }
        `,
      }));
    },
  }],
});
const { SessionDO } = await import(pathToFileURL(SESSION_OUT).href);

const result = (rows = [], one = null) => ({ toArray: () => rows, one: () => one });

/** Enough of the session's SQL to let the production inserts and selects run unmodified. */
class SqlMemory {
  constructor() { this.messages = []; this.models = new Map(); this.oplog = []; }
  exec(statement, ...args) {
    const q = statement.replace(/\s+/g, ' ').trim();
    if (/pragma_table_info/.test(q)) return result([]);
    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const withTrace = args.length === 6;
      this.messages.push({ id, role, mode, content, tool_trace: withTrace ? maybeTrace : null, created_at: withTrace ? maybeCreated : maybeTrace });
      return result();
    }
    if (q.startsWith('update messages set stop_reason = ?')) {
      const [stop_reason, run_failure, credits_spent, , , , , , id] = args;
      const row = this.messages.find((m) => m.id === id);
      if (row) Object.assign(row, { stop_reason, run_failure, credits_spent });
      return result();
    }
    if (q.startsWith('insert into oplog(')) {
      const [op_id, kind, ok, summary, created_at, failure, run_id] = args;
      this.oplog.push({ op_id, kind, ok, summary, created_at, failure, run_id });
      return result();
    }
    if (q.startsWith('insert into message_models')) { this.models.set(args[0], args[1]); return result(); }
    if (q.startsWith('select role, content from messages order by created_at desc')) {
      return result([...this.messages].sort((a, b) => b.created_at - a.created_at).slice(0, 15));
    }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    return result();
  }
}

/**
 * A REAL QuotaDO LEDGER BEHIND THE SESSION, not an `ok: true` rubber stamp.
 *
 * The number this test is about is the one the user's balance ends on, and a fake that answers
 * `{ ok: true }` to both `/spend` and `/refund` would let a broken refund pass. So the two routes
 * share one allowance counter and one set of applied refund ids.
 */
function ledger(dailyAllowance = 100, purchased = 0) {
  let allowanceSpent = 0;
  let credits = purchased;
  const applied = new Set();
  const spends = [];
  const refunds = [];
  const state = () => ({
    plan: 'free',
    creditsRemaining: Math.max(0, dailyAllowance - allowanceSpent) + credits,
    creditsDaily: dailyAllowance,
    creditsUsedToday: allowanceSpent,
    allowanceRemaining: Math.max(0, dailyAllowance - allowanceSpent),
    credits,
    resetsAtIso: '2026-09-21T00:00:00.000Z',
  });
  return {
    state, spends, refunds,
    get allowanceSpent() { return allowanceSpent; },
    get credits() { return credits; },
    handle(path, body) {
      if (path === '/state') return Response.json(state());
      if (path === '/spend') {
        const want = Number(body.credits);
        const fromAllowance = Math.min(want, Math.max(0, dailyAllowance - allowanceSpent));
        const fromCredits = want - fromAllowance;
        // Every ATTEMPT is recorded, refused or not: "the ledger was asked and said no" is the case
        // a test below is about, and a fake that only remembered successes could not express it.
        if (fromCredits > credits) {
          spends.push({ ...body, ok: false, fromAllowance: 0, fromCredits: 0 });
          return Response.json({ ok: false, state: state() });
        }
        allowanceSpent += fromAllowance;
        credits -= fromCredits;
        spends.push({ ...body, ok: true, fromAllowance, fromCredits });
        return Response.json({ ok: true, state: state(), fromAllowance, fromCredits });
      }
      if (path === '/refund') {
        refunds.push(body);
        if (applied.has(body.refundId)) return Response.json({ ok: true, replayed: true, returned: 0, state: state() });
        applied.add(body.refundId);
        const backAllowance = Math.max(0, Math.min(Number(body.fromAllowance) || 0, allowanceSpent));
        const backCredits = Math.max(0, Number(body.fromCredits) || 0);
        allowanceSpent -= backAllowance;
        credits += backCredits;
        return Response.json({ ok: true, replayed: false, asked: (Number(body.fromAllowance) || 0) + backCredits, returned: backAllowance + backCredits, state: state() });
      }
      return Response.json({ ok: true, state: { killed: false }, reserved: 1 });
    },
  };
}

function gatewayResponse({ finishReason = 'stop', text = '', toolCalls = [], neurons = 60 } = {}) {
  return {
    text, toolCalls,
    usage: { inputTokens: 10, outputTokens: Math.max(1, Math.ceil(text.length / 4)) },
    neurons, provider: 'workers-ai', model: '@cf/qwen/qwen3-30b-a3b-fp8', finishReason,
  };
}

function makeSession({ responses = [], book = ledger() } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Test Place', ownerId: 'owner-1' }]]);
  const sql = new SqlMemory();
  const sent = [];
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
    get: () => ({
      fetch: async (input, init) => {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const body = init?.body ? JSON.parse(init.body) : {};
        if (name === 'QUOTA_DO') return book.handle(path, body);
        return Response.json({ ok: true, state: { killed: false }, reserved: 1 });
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
      async setAlarm() {},
      async getAlarm() { return null; },
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
      prepare() { return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 0 } }; } }; },
    },
    __testChat: async () => {
      assert.ok(queue.length > 0, 'the test gateway ran more times than the fixture supplied');
      return structuredClone(queue.shift());
    },
  };
  return { session: new SessionDO(ctx, env), store, sql, sent, book, ws };
}

const start = async (h, text = 'build a small tower', mode = 'stone') => {
  const res = await h.session.fetch(new Request('https://do/agent-run', { method: 'POST', body: JSON.stringify({ text, mode, productModel: 'apple' }) }));
  assert.equal(res.status, 200, await res.text());
  return h.store.get('agent');
};
const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const assistantRow = (h) => [...h.sql.messages].reverse().find((m) => m.role === 'assistant');

test('END TO END: a run cut off with nothing applied gives the Credits back and SAYS SO', async () => {
  const book = ledger(100);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'length', text: 'I was about to create the first platform', neurons: 60 })] });
  await start(h);
  await h.session.alarm();

  assert.equal(lastEnd(h).stopReason, 'error', 'the ending itself is still reported as the failure it is');
  assert.equal(book.allowanceSpent, 0, 'THE BALANCE IS WHOLE — this is the number the defect was about');
  assert.equal(book.refunds.length, 1);
  assert.equal(book.refunds[0].fromAllowance, 2, 'both the admission Credit and the settled one come back');

  const row = assistantRow(h);
  assert.match(row.content, /I was about to create the first platform/, 'the partial text is still shown');
  assert.match(row.content, /not been charged for this run/, 'and the user is told, in the reply they are already reading');
  assert.equal(row.credits_spent, 0, 'the transcript records what the run actually cost');
  assert.equal(lastEnd(h).creditsSpent, 0, 'and msg_end carries the same number as the row');

  const note = h.sql.oplog.find((o) => o.kind === 'credits_refunded');
  assert.ok(note, 'and the refund is written down where an operator can find it');
  assert.equal(note.ok, 1);
  assert.equal(note.run_id, lastEnd(h).msgId);
});

test('A RUN THAT SAVED NOTHING DOES NOT TELL THE USER THEIR WORK IS SAVED', async () => {
  // "Everything completed before the cutoff is saved" was printed on every truncated run, including
  // the ones that applied nothing. Vacuously true, read as reassurance, and it sends someone
  // looking in their place for work that was never put there.
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'length', text: 'Starting on it', neurons: 60 })] });
  await start(h);
  await h.session.alarm();
  const content = assistantRow(h).content;
  assert.match(content, /reached its output limit/, 'what stopped it is still said');
  assert.match(content, /Send another message/, 'and so is what to do next');
  assert.doesNotMatch(content, /is saved/, 'but nothing was saved, so nothing claims to be');
});

test('THE CONTROL: a run that changed the place keeps its Credits, cut off or not', async () => {
  const book = ledger(100);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'length', text: 'I finished the tower and the final check is', neurons: 60 })] });
  const agent = await start(h);
  agent.step = 1;
  agent.mutated = true;
  agent.trace = [{ tool: 'create_instances', summary: 'created tower geometry', ok: true, durationMs: 1 }];
  h.store.set('agent', structuredClone(agent));
  await h.session.alarm();

  assert.equal(book.refunds.length, 0, 'work the user can keep is work the user pays for');
  assert.equal(book.allowanceSpent, 2);
  assert.equal(lastEnd(h).creditsSpent, 2);
  assert.doesNotMatch(assistantRow(h).content, /not been charged/);
});

test('THE OTHER CONTROL: an ordinary successful run is untouched by any of this', async () => {
  const book = ledger(100);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'stop', text: 'Complete answer.', neurons: 30 })] });
  await start(h, 'explain what this project does', 'clay');
  await h.session.alarm();

  assert.equal(lastEnd(h).stopReason, 'done');
  assert.equal(book.refunds.length, 0);
  assert.equal(assistantRow(h).content, 'Complete answer.', 'no note is appended to a run that worked');
});

test('the purchased balance comes back as purchased balance, never as free allowance', async () => {
  // One Credit of daily allowance, then real money. The admission charge takes the allowance; the
  // settlement (600 neurons at 30 per Credit = 20 Credits) has to come out of the purchased
  // balance. A refund that put the whole 20 back as allowance would erase money the user paid for;
  // one that put it all back as purchased balance would mint some.
  const book = ledger(1, 40);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'error', text: '', neurons: 600 })] });
  await start(h);
  await h.session.alarm();

  assert.equal(book.spends.length, 2, 'admission, then settlement');
  assert.equal(book.spends[1].fromCredits, 19, 'the settlement was paid for with money');
  const asked = book.refunds[0];
  assert.equal(asked.fromAllowance, 1, 'and the split asked back is the split that was charged');
  assert.equal(asked.fromCredits, 19);
  assert.equal(book.allowanceSpent, 0, 'the rate is whole');
  assert.equal(book.credits, 40, 'and so is the balance — not one Credit more, not one less');
});

test('A RUN REFUSED FOR WANT OF CREDITS ASKS BACK WHAT IT TOOK, not what it wanted', async () => {
  // One Credit of allowance and nothing purchased. Admission takes the Credit; the settlement
  // (600 neurons = 20 Credits at 30 neurons each) is REFUSED, because there is nothing left.
  //
  // `creditsSpent` used to be incremented on BOTH sides of that branch, so a charge the ledger
  // declined was still reported to the user as money spent. With a refund path in place that
  // inflation becomes visible twice: the run would ask the ledger for 20 Credits it never took,
  // get 1 back, and then explain the missing 19 with a reason that never happened.
  const book = ledger(1, 0);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'stop', text: 'Some progress.', neurons: 600 })] });
  await start(h);
  await h.session.alarm();

  assert.equal(book.spends.length, 2, 'admission, then a settlement the ledger refused');
  assert.equal(book.spends[1].ok, false);
  assert.equal(lastEnd(h).stopReason, 'quota');

  const note = h.sql.oplog.find((o) => o.kind === 'credits_refunded');
  assert.ok(note, 'running out with nothing built hands the Credit back');
  assert.match(
    note.summary,
    /asked 1, returned 1$/,
    'ONE Credit was taken, so one Credit is the most that can be asked back — not the 20 the settlement wanted',
  );
  assert.equal(book.allowanceSpent, 0);
  assert.equal(lastEnd(h).creditsSpent, 0, 'and the meter ends where the ledger does');
  assert.match(assistantRow(h).content, /not been charged for this run/);
});

test('A LEDGER THAT DID NOT ANSWER IS NOT A REFUND THAT FAILED — and the reply claims neither', async () => {
  // An older QuotaDO: it accepts the call and returns no `returned` figure. The product has learnt
  // nothing about the user's balance, so it must say nothing about it. This is the repository's own
  // rule pointed at a payment: a failure to observe must not render as an observation.
  const book = ledger(100);
  const deaf = { ...book, handle: (path, body) => (path === '/refund' ? Response.json({ ok: true }) : book.handle(path, body)) };
  const h = makeSession({ book: deaf, responses: [gatewayResponse({ finishReason: 'length', text: 'Partial', neurons: 60 })] });
  await start(h);
  await h.session.alarm();

  const row = assistantRow(h);
  assert.doesNotMatch(row.content, /not been charged/, 'no refund was observed, so none is claimed');
  assert.doesNotMatch(row.content, /could not be returned automatically/, 'and no reason is invented for one either');
  assert.equal(row.credits_spent, 2, 'the charge stands, because nothing reversed it');
  const note = h.sql.oplog.find((o) => o.kind === 'credits_refunded');
  assert.equal(note.failure, 'refund_unknown', 'but the operator can still see that a refund was owed');
});
