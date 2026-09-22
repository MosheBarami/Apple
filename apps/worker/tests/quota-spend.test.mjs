/**
 * QuotaDO's spend path, EXECUTED — the user-facing Credit ledger.
 *
 * quota-math.ts is well covered by quota-day-boundary.test.mjs, which tests the ARITHMETIC. This
 * tests the DO that wires it to storage, and the boundary where a caller's number arrives.
 *
 * THE DEFECT. `splitSpend` opens with `const want = Math.max(0, credits)`, and `Math.max(0, NaN)` is
 * NaN. Every comparison after that is false for NaN — `NaN > allowanceRemaining + credits` is
 * false, so it reports AFFORDABLE — and then `fromAllowance` and `fromCredits` are both NaN, so
 * `if (fromAllowance > 0)` and `if (fromCredits > 0)` are both false and nothing is written.
 *
 * Measured:
 *   splitSpend(10,  100, 50) -> affordable=true   fromAllowance=10   charged
 *   splitSpend(NaN, 100, 50) -> affordable=true   fromAllowance=NaN  NOTHING CHARGED
 *   splitSpend('abc',100,50) -> affordable=true   fromAllowance=NaN  NOTHING CHARGED
 *   splitSpend(Inf, 100, 50) -> affordable=false                     correctly refused
 *
 * So an unreadable spend is reported OK to the caller and the ledger does not move: the same shape
 * as the BudgetDO defect, one ledger over, and this is the one the USER sees. It is worse than it
 * looks from here, because session.ts:1278 does `agent.creditsSpent += owed` — one NaN makes that
 * field NaN for the rest of the run, and msg_end now carries it to the UI.
 *
 * A NEGATIVE MUST STAY A NO-OP, NOT BECOME A REFUSAL. `owed = creditsForNeurons(neuronsUsed) -
 * creditsSpent` is legitimately negative when a previous step overcharged, and refusing there would
 * tell a user with Credits left that they had run out. Clamping it to zero is correct and is kept.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'quota-do-')), 'quota.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'quota.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { QuotaDO } = await import(`file://${out}`);

/**
 * The ledger in miniature, answering the same two aggregate queries the DO actually issues.
 *
 * Modelled rather than stubbed: "what the user has spent today" is the property under test, so a
 * sql fake that returned a constant would make every assertion below meaningless. Rows go in, the
 * sums come out of the rows.
 */
function quota(seed = {}) {
  const store = new Map(Object.entries(seed));
  const rows = [];
  const sql = {
    exec(q, ...a) {
      if (/^\s*create table/i.test(q)) return { toArray: () => [], one: () => null };
      if (/insert into ledger/i.test(q)) { rows.push({ day: a[0], kind: a[1], credits: a[2] }); return { toArray: () => [], one: () => null }; }
      if (/delete from ledger where day </i.test(q)) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].day < a[0]) rows.splice(i, 1); return { toArray: () => [], one: () => null }; }
      if (/delete from ledger where day =/i.test(q)) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].day === a[0]) rows.splice(i, 1); return { toArray: () => [], one: () => null }; }
      if (/where day = \?/.test(q)) return { one: () => ({ s: rows.filter((r) => r.day === a[0]).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      if (/where day like \?/.test(q)) { const p = String(a[0]).replace('%', ''); return { one: () => ({ s: rows.filter((r) => r.day.startsWith(p)).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] }; }
      if (/group by day/i.test(q)) return { toArray: () => [], one: () => null };
      return { toArray: () => [], one: () => ({ s: 0 }) };
    },
  };
  const storage = {
    async get(k) { const v = store.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, structuredClone(v)); else store.set(a, structuredClone(b)); },
    async delete(k) { store.delete(k); }, sql,
  };
  const o = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (p, body, method = 'POST') =>
    (await o.fetch(new Request('https://do' + p, { method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) }))).json();
  return {
    call, rows,
    spend: (credits, kind = 'chat') => call('/spend', { credits, kind }),
    state: () => call('/state', null, 'GET'),
    /** what the ledger actually recorded, which is the only figure that bills anyone */
    recorded: () => rows.reduce((x, r) => x + r.credits, 0),
  };
}

test('CONTROL: a readable spend is affordable AND lands in the ledger', async () => {
  // If this stops holding, every refusal below passes for the wrong reason.
  const q = quota();
  const before = await q.state();
  assert.ok(before.allowanceRemaining > 0, 'the fixture must start with allowance to spend');
  const r = await q.spend(5);
  assert.equal(r.ok, true);
  assert.equal(q.recorded(), 5, 'the ledger must actually move');
  assert.equal(r.state.allowanceRemaining, before.allowanceRemaining - 5, 'and the remaining allowance with it');
});

test('a spend beyond the allowance and credits is refused', async () => {
  const q = quota();
  const st = await q.state();
  const r = await q.spend(st.allowanceRemaining + st.credits + 1);
  assert.equal(r.ok, false, 'more than the user has must not be affordable');
  assert.equal(q.recorded(), 0, 'and nothing may be recorded for a refused spend');
});

const UNREADABLE = [
  ['a NaN', NaN],
  ['a string', 'abc'],
  ['omitted entirely', undefined],
  ['an object', {}],
];

for (const [label, value] of UNREADABLE) {
  test(`a spend of ${label} is refused, not reported affordable`, async () => {
    const q = quota();
    const r = await q.call('/spend', { credits: value, kind: 'chat' });
    assert.equal(r.ok, false, 'an amount nobody could read must not be reported as an affordable spend');
    assert.equal(q.recorded(), 0, 'and must record nothing');
    assert.equal(Number.isFinite(r.state.allowanceRemaining), true, 'the ledger must not be poisoned');
  });
}

test('a NEGATIVE spend stays a no-op and is still affordable', async () => {
  // Deliberately NOT a refusal: `owed` in session.ts is legitimately negative when an earlier step
  // overcharged, and refusing would tell a user with Credits left that they had run out.
  const q = quota();
  const r = await q.spend(-5);
  assert.equal(r.ok, true, 'a negative settle must not be reported as running out of Credits');
  assert.equal(q.recorded(), 0, 'and must not credit the user either');
});

test('an unreadable spend cannot be used to buy work for free', async () => {
  // The property, stated end to end: whatever is reported ok must have moved the ledger by the
  // amount asked for. Fifty unreadable spends in a row must not yield fifty free operations.
  const q = quota();
  let allowed = 0;
  for (let i = 0; i < 50; i++) {
    const r = await q.call('/spend', { credits: NaN, kind: 'chat' });
    if (r.ok) allowed += 1;
  }
  assert.equal(allowed, 0, `${allowed} of 50 unreadable spends were granted, each one free work`);
  assert.equal(q.recorded(), 0);
});

test('grant-credits stays additive and refuses to subtract', async () => {
  const q = quota();
  await q.call('/grant-credits', { credits: 100 });
  assert.equal((await q.state()).credits, 100);
  await q.call('/grant-credits', { credits: -50 });
  assert.equal((await q.state()).credits, 100, 'a negative grant must not remove credits');
  await q.call('/grant-credits', { credits: 'abc' });
  assert.equal((await q.state()).credits, 100, 'an unreadable grant must not change the balance');
});

test('credits are spent only after the allowance is gone', async () => {
  const q = quota();
  await q.call('/grant-credits', { credits: 100 });
  const st = await q.state();
  await q.spend(st.allowanceRemaining);
  assert.equal((await q.state()).credits, 100, 'the allowance covers it, so credits are untouched');
  await q.spend(10);
  assert.equal((await q.state()).credits, 90, 'only now do credits pay');
});

test('an authoritative unmetered account is never refused or depleted by Credit spend', async () => {
  const q = quota();
  const enabled = await q.call('/set-unmetered', { enabled: true });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.state.unmetered, true);

  const before = await q.state();
  const spend = await q.spend(before.creditsRemaining + 1_000_000);
  assert.equal(spend.ok, true, 'unmetered Credit admission must not become a quota terminal');
  assert.equal(spend.fromAllowance, 0);
  assert.equal(spend.fromCredits, 0);
  assert.equal(q.recorded(), 0, 'unmetered work must not consume the renewable ledger');
  assert.equal((await q.state()).creditsRemaining, before.creditsRemaining, 'the displayed balance must not be depleted');
});
