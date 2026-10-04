/**
 * A RUN THAT PRODUCED NOTHING MUST NOT BILL FOR THE ATTEMPT.
 *
 * THE DEFECT. Credits are settled from measured compute after every model call, which is the
 * honest way to charge for work that happened — and until this change it was the ONLY arithmetic
 * in the product. There was no refund path anywhere. So a run cut off at the provider's output
 * ceiling, or killed by the wall clock, or stopped by the step cap, charged for every neuron it
 * burned and then told the user, in the product's own words, to "send another message and StudPilot
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
  mode: 'agent',
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
  assert.equal(refundVerdict(barren({ mode: 'plan', textDelivered: true })).why, 'delivered');
  assert.equal(
    refundVerdict(barren({ mode: 'agent', textDelivered: true })).refund,
    true,
    'do/session.ts: "a build request that ends with prose and no change has failed, whatever the prose says"',
  );
  assert.equal(refundVerdict(barren({ mode: 'plan', textDelivered: false })).refund, true);
});

test('pressing stop is not a refund, and neither is a run nobody was charged for', () => {
  assert.equal(refundVerdict(barren({ reason: 'stopped' })).why, 'not_a_failure');
  assert.equal(refundVerdict(barren({ creditsSpent: 0 })).why, 'nothing_charged');
  assert.equal(refundVerdict(barren({ creditsSpent: Number.NaN })).refund, false, 'a refund nobody can compute is not a refund of NaN');
  assert.equal(refundVerdict(barren({ reason: 'quota' })).refund, true, 'running out with nothing to show hands the Credits back');
});

test('a run that ended because the allowance could not pay for a step that ran is NOT refunded, whatever else it lacks', () => {
  const v = refundVerdict(barren({ reason: 'quota', allowanceUsedUp: true }));
  assert.equal(v.refund, false);
  assert.equal(v.why, 'allowance_used');
  assert.equal(refundVerdict(barren({ reason: 'quota' })).refund, true, 'a service-wide capacity stop (no flag) still hands the Credits back');
});

test('runDeliveredSomething is the single answer both the verdict and the wording are written from', () => {
  assert.equal(runDeliveredSomething(barren()), false);
  // Three successful reads are still nothing delivered — see the re-aim note above.
  assert.equal(runDeliveredSomething(barren({ opsApplied: 3 })), false);
  assert.equal(runDeliveredSomething(barren({ mutated: true })), true);
});

test('THE SENTENCE SAYS WHAT THE LEDGER RETURNED, never what was asked for, in credits and not in ledger units', () => {
  // `asked` and `returned` are LEDGER units (INTERNAL_PER_CREDIT = 150 to a credit); a person reads
  // credits with two decimals. 300 units is 2.00 Credits, and the sentence must not print "300".
  assert.match(refundSentence(300, 300), /not been charged/);
  assert.match(refundSentence(300, 300), /the 2\.00 Credits it used have been put back/);
  assert.match(refundSentence(1, 1), /the 0\.01 Credits it used have been put back/);
  assert.match(refundSentence(450, 150), /1\.00 of the 3\.00 Credits/);
  assert.match(refundSentence(450, 0), /its 3\.00 Credits should not stand/);
  assert.match(refundSentence(450, 0), /could not be returned automatically/);
  for (const [asked, returned] of [[300, 300], [450, 150], [450, 0]]) {
    assert.doesNotMatch(refundSentence(asked, returned), /\b(300|450|150)\b/, `a ledger-unit count leaked into the sentence for ${asked}/${returned}`);
  }
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

test('a settlement (upTo) charges what is LEFT and says it was not paid in full; admission stays all-or-nothing', async () => {
  const q = quota();
  await q.spend(745);
  const whole = await q.call('/spend', { credits: 20, kind: 'usage_agent' });
  assert.equal(whole.ok, false, 'without upTo a spend the balance cannot cover is refused whole, as before');
  assert.equal((await q.state()).allowanceRemaining, 5, 'and took nothing');
  const part = await q.call('/spend', { credits: 20, kind: 'usage_agent', upTo: true });
  assert.equal(part.ok, false, 'a part-paid settlement is not reported as paid');
  assert.equal(part.fromAllowance, 5, 'but it reports what it took');
  assert.equal(part.fromCredits, 0);
  assert.equal((await q.state()).allowanceRemaining, 0, 'the last five units are spent');
  const none = await q.call('/spend', { credits: 20, kind: 'usage_agent', upTo: true });
  assert.equal(none.ok, false);
  assert.equal(none.fromAllowance, 0, 'with nothing left it takes nothing, and never goes below zero');
  const fits = quota();
  assert.equal((await fits.call('/spend', { credits: 20, kind: 'usage_agent', upTo: true })).ok, true, 'a settlement the balance covers is paid in full');
  const unreadable = await quota().call('/spend', { credits: NaN, kind: 'usage_agent', upTo: true });
  assert.equal(unreadable.ok, false, 'upTo does not turn an unreadable amount into "everything left"');
  assert.equal(unreadable.state.allowanceRemaining, unreadable.state.creditsDaily);
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
        const asked = Number(body.credits);
        // `upTo` is QuotaDO's: a settlement charges what is left instead of refusing the whole amount.
        const want = body.upTo === true ? Math.min(asked, Math.max(0, dailyAllowance - allowanceSpent) + credits) : asked;
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
        spends.push({ ...body, ok: want >= asked, fromAllowance, fromCredits });
        return Response.json({ ok: want >= asked, state: state(), fromAllowance, fromCredits });
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
  // Every statement the session sends to D1 with the values bound to it, so a test can read the
  // notification rows a run wrote.
  const corpus = [];
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'),
    BUDGET_DO: namespace('BUDGET_DO'),
    ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: {
      async exec() {},
      prepare(sqlText) {
        const rec = { sql: sqlText, args: [] };
        corpus.push(rec);
        return { bind(...a) { rec.args = a; return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 0 } }; } };
      },
    },
    __testChat: async () => {
      assert.ok(queue.length > 0, 'the test gateway ran more times than the fixture supplied');
      return structuredClone(queue.shift());
    },
  };
  return { session: new SessionDO(ctx, env), store, sql, sent, book, ws, corpus };
}

const start = async (h, text = 'build a small tower', mode = 'agent') => {
  const res = await h.session.fetch(new Request('https://do/agent-run', { method: 'POST', body: JSON.stringify({ text, mode, productModel: 'apple' }) }));
  assert.equal(res.status, 200, await res.text());
  return h.store.get('agent');
};
const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const assistantRow = (h) => [...h.sql.messages].reverse().find((m) => m.role === 'assistant');

test('END TO END: a terminal provider failure with nothing applied gives the Credits back and SAYS SO', async () => {
  const book = ledger(100);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'error', text: 'I was about to create the first platform', neurons: 60 })] });
  await start(h);
  await h.session.alarm();

  assert.equal(lastEnd(h).stopReason, 'error', 'the ending itself is still reported as the failure it is');
  assert.equal(book.allowanceSpent, 0, 'THE BALANCE IS WHOLE — this is the number the defect was about');
  assert.equal(book.refunds.length, 1);
  assert.equal(book.refunds[0].fromAllowance, 2, 'both the admission Credit and the settled one come back');

  const row = assistantRow(h);
  assert.match(row.content, /I was about to create the first platform/, 'the partial text is still shown');
  assert.match(row.content, /not been charged for this run/, 'and the user is told, in the reply they are already reading');
  assert.match(row.content, /the 0\.01 Credits it used have been put back/, 'in credits: the two ledger units refunded are 0.01 Credits, not "2 Credits"');
  assert.doesNotMatch(row.content, /the 2 Credits/);
  assert.equal(row.credits_spent, 0, 'the transcript records what the run actually cost');
  assert.equal(lastEnd(h).creditsSpent, 0, 'and msg_end carries the same number as the row');

  const note = h.sql.oplog.find((o) => o.kind === 'credits_refunded');
  assert.ok(note, 'and the refund is written down where an operator can find it');
  assert.equal(note.ok, 1);
  assert.equal(note.run_id, lastEnd(h).msgId);
});

test('A TERMINAL FAILURE THAT SAVED NOTHING DOES NOT TELL THE USER THEIR WORK IS SAVED', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'error', text: 'Starting on it', neurons: 60 })] });
  await start(h);
  await h.session.alarm();
  const content = assistantRow(h).content;
  assert.match(content, /could not (complete|finish)|failed/i, 'what stopped it is still said');
  assert.doesNotMatch(content, /send another message/i, 'the product must not outsource recovery to the user');
  assert.doesNotMatch(content, /is saved/, 'but nothing was saved, so nothing claims to be');
});

test('THE CONTROL: a terminal failure after a real mutation keeps its Credits', async () => {
  const book = ledger(100);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'error', text: 'I finished the tower and the final check is', neurons: 60 })] });
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
  await start(h, 'explain what this project does', 'plan');
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

test('A RUN REFUSED FOR WANT OF CREDITS REPORTS WHAT IT TOOK, not what it wanted, and does not give it back', async () => {
  // One Credit of allowance and nothing purchased. Admission takes the Credit; the settlement
  // (600 neurons = 20 Credits at 30 neurons each) is REFUSED, because there is nothing left.
  //
  // `creditsSpent` used to be incremented on BOTH sides of that branch, so a charge the ledger
  // declined was still reported to the user as money spent. The figure must be what the ledger took:
  // the 1 unit of admission, not the 20 the settlement wanted.
  //
  // THIS TEST USED TO ASSERT THE REFUND OF THAT UNIT ("running out with nothing built hands the
  // Credit back"). That was the defect (review finding A): the step had run, and giving the unit back
  // made a Free allowance repeatable. The property now is that the step is paid for as far as the
  // balance goes and what it took stays taken.
  const book = ledger(1, 0);
  const h = makeSession({ book, responses: [gatewayResponse({ finishReason: 'stop', text: 'Some progress.', neurons: 600 })] });
  await start(h);
  await h.session.alarm();

  assert.equal(book.spends.length, 2, 'admission, then a settlement the ledger could not pay in full');
  assert.equal(book.spends[1].ok, false);
  assert.equal(lastEnd(h).stopReason, 'quota');
  assert.equal(book.refunds.length, 0, 'a step that ran is not refunded');
  assert.equal(h.sql.oplog.some((o) => o.kind === 'credits_refunded'), false, 'and no refund is written down');
  assert.equal(book.allowanceSpent, 1, 'the Credit taken at the door stays taken');
  assert.equal(lastEnd(h).creditsSpent, 1, 'and the meter ends where the ledger does: 1, not the 20 the settlement wanted');
  assert.doesNotMatch(assistantRow(h).content, /not been charged for this run/);
});

/** The PRODUCTION QuotaDO behind the session (modelled sql, real arithmetic), recording every spend and refund asked of it. */
function realBook(q) {
  const spends = [];
  const refunds = [];
  return {
    spends, refunds,
    async handle(path, body) {
      const out = await q.call(path, body, path === '/state' ? 'GET' : 'POST');
      if (path === '/spend') spends.push({ credits: body.credits, ok: out.ok, fromAllowance: out.fromAllowance, fromCredits: out.fromCredits });
      if (path === '/refund') refunds.push(body);
      return Response.json(out);
    },
  };
}

test('THE FREE ALLOWANCE CANNOT BE FARMED: a request that overruns it takes what is left, keeps it, and the next request is refused', async () => {
  //[[ Review finding A. A Free user with 5 ledger units left is admitted for 1; the model step then
  //   owes more than the 4 that remain; the all-or-nothing split charged NOTHING and the 'quota'
  //   ending refunded the admission unit. Net 0, text delivered, and the same 5 units were there for
  //   the next request, and the next, until the service-wide ceiling. A ledger that is empty after the
  //   first request cannot be farmed by a second. ]]
  const q = quota();
  await q.spend(745);
  assert.equal((await q.state()).allowanceRemaining, 5, 'the fixture: five ledger units left of Free\'s 750');
  const book = realBook(q);

  const first = makeSession({ book, responses: [gatewayResponse({ finishReason: 'stop', text: 'Here is a long answer.', neurons: 600 })] });
  await start(first);
  await first.session.alarm();
  assert.equal(lastEnd(first).stopReason, 'quota', 'the allowance ran out while paying for the step');
  assert.equal((await q.state()).allowanceRemaining, 0, 'the five units are SPENT: what remained was settled, not left on the table');
  assert.equal(book.refunds.length, 0, 'and the admission unit is not handed back for a step that ran');
  assert.equal(lastEnd(first).creditsSpent, 5, 'the meter says what the ledger took');

  // The same Free user asks again. Nothing is left, so nothing runs.
  const second = makeSession({ book, responses: [] });
  await start(second, 'and one more');
  const refusal = second.sent.find((m) => m.type === 'error');
  assert.equal(refusal?.code, 'quota', 'the second request is refused at the door');
  assert.equal(second.sent.some((m) => m.type === 'msg_end'), false, 'no run, so no free inference');
  assert.equal((await q.state()).allowanceRemaining, 0);
});

/** The notification rows a run wrote: { kind, title, body } from the bound values of the inbox insert. */
const notificationsWritten = (h) =>
  h.corpus.filter((c) => /^insert into notifications\(/.test(c.sql.trim())).map((c) => ({ kind: c.args[2], title: c.args[4], body: c.args[5] }));

test('THE RUN-FINISHED NOTIFICATION NAMES CREDITS, not the ledger units the run was charged in', async () => {
  // 3000 neurons = 100 ledger units = 0.67 credits. The body used to say "100 Credit(s)".
  const h = makeSession({ book: ledger(1000), responses: [gatewayResponse({ finishReason: 'stop', text: 'Here you go.', neurons: 3000 })] });
  await start(h, 'explain what this project does', 'plan');
  await h.session.alarm();
  const done = notificationsWritten(h).find((n) => n.kind === 'run_complete');
  assert.ok(done, 'the run wrote no run_complete notification, so this test would measure nothing');
  assert.match(done.body, /applied for 0\.67 Credits\.$/);
  assert.doesNotMatch(done.body, /\b100\b|Credit\(s\)/);
});

test('THE LOW-CREDITS NOTIFICATION IS IN CREDITS TOO, and the empty one promises nothing it cannot sell', async () => {
  // 1000 units a day is 6.67 credits. 900 units spent leaves 100 = 0.67, which is the 'low' band.
  const low = makeSession({ book: ledger(1000), responses: [gatewayResponse({ finishReason: 'stop', text: 'Done.', neurons: 27_000 })] });
  await start(low, 'explain what this project does', 'plan');
  await low.session.alarm();
  const warn = notificationsWritten(low).find((n) => n.kind === 'usage_threshold');
  assert.ok(warn, 'no usage_threshold notification was written');
  assert.match(warn.body, /^0\.67 of 6\.67 Credits left today\. They refill at /);
  assert.doesNotMatch(warn.body, /\b(100|1000)\b/);

  // 100 units all spent: exhausted. Credits cannot be bought (CREDIT_PURCHASE_LIVE is false) and a
  // bigger plan cannot be taken yet either, so the body says when the allowance refills and no more.
  const empty = makeSession({ book: ledger(100), responses: [gatewayResponse({ finishReason: 'stop', text: 'Done.', neurons: 3000 })] });
  await start(empty, 'explain what this project does', 'plan');
  await empty.session.alarm();
  const out = notificationsWritten(empty).find((n) => n.kind === 'usage_threshold');
  assert.ok(out, 'no usage_threshold notification was written for an empty balance');
  assert.match(out.title, /used up/);
  assert.match(out.body, /^They refill at \S+\.$/);
  assert.doesNotMatch(out.body, /bigger plan|cover the gap/i);
});

test('A LEDGER THAT DID NOT ANSWER IS NOT A REFUND THAT FAILED — and the reply claims neither', async () => {
  // An older QuotaDO: it accepts the call and returns no `returned` figure. The product has learnt
  // nothing about the user's balance, so it must say nothing about it. This is the repository's own
  // rule pointed at a payment: a failure to observe must not render as an observation.
  const book = ledger(100);
  const deaf = { ...book, handle: (path, body) => (path === '/refund' ? Response.json({ ok: true }) : book.handle(path, body)) };
  const h = makeSession({ book: deaf, responses: [gatewayResponse({ finishReason: 'error', text: 'Partial', neurons: 60 })] });
  await start(h);
  await h.session.alarm();

  const row = assistantRow(h);
  assert.doesNotMatch(row.content, /not been charged/, 'no refund was observed, so none is claimed');
  assert.doesNotMatch(row.content, /could not be returned automatically/, 'and no reason is invented for one either');
  assert.equal(row.credits_spent, 2, 'the charge stands, because nothing reversed it');
  const note = h.sql.oplog.find((o) => o.kind === 'credits_refunded');
  assert.equal(note.failure, 'refund_unknown', 'but the operator can still see that a refund was owed');
});

// F-054, 2026-09-23: Disconnect pressed mid-build, nothing changed, reply honest, run ended `done`, 60 Credits kept.
test('a run Studio dropped before any change is refunded, even though it ended done', async () => {
  const { refundVerdict } = await import('../src/run-refund.ts');
  const base = { reason: 'done', mode: 'agent', opsApplied: 2, mutated: false, artifactRequested: false, artifactMissing: false, textDelivered: true, creditsSpent: 60 };
  assert.equal(refundVerdict({ ...base }).refund, false, 'a finished run is not refunded on its own');
  assert.equal(refundVerdict({ ...base, studioDropped: true }).refund, true);
  assert.equal(refundVerdict({ ...base, studioDropped: true }).credits, 60);
  assert.equal(refundVerdict({ ...base, studioDropped: true, mutated: true }).refund, false, 'a run that changed the place keeps its charge');
  assert.equal(refundVerdict({ ...base, studioDropped: true, reason: 'stopped' }).refund, false, 'pressing Stop is the user\'s choice');
});
