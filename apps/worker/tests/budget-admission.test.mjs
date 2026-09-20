/**
 * BudgetDO admission control — what is admitted, what is refused, and what happens when the
 * number cannot be read at all.
 *
 * SCOPE, because there are two files here. `budget-do.test.mjs` (John) executes the reservation
 * lifecycle, the daily ceiling, the kill switch and the admin ratchet. This file deliberately does
 * NOT repeat those. It covers what that one does not: the monthly backstop, the free-vs-billable
 * split, /probe agreeing with /reserve, and the case that produced the finding below.
 *
 * THE FINDING. Every cap in this object is a `>` comparison, and `NaN > n` is FALSE — so a cost
 * nobody could compute trips no guard at all. It cannot even arrive as NaN: the body is JSON and
 * `JSON.stringify(NaN)` is `null`, so `Math.max(1, Math.ceil(null))` reserved ONE neuron for a call
 * of any size and `Math.max(0, Math.ceil(null))` settled it as having cost NOTHING. The provider
 * bills, the ledger does not move, and nothing says a number went missing. Two guards upstream fail
 * the same way — `gateway.ts:299` and the DO's own per-request check — so "the DO checks it too"
 * was not a mitigation.
 *
 * A clamp does not validate, it HIDES: `Math.max` turns "I could not read this" into a confident
 * small number. The guard added alongside these cases refuses instead.
 *
 * HARNESS NOTE. The storage below deep-copies on get and put ON PURPOSE. Real DO storage
 * serializes, so a handler that mutates the object it loaded and never calls put() must NOT
 * persist. A harness that shares the reference cannot tell those apart and would hand back a false
 * green — see 'the rollover is not persisted by a read alone'.
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
const out = join(mkdtempSync(join(tmpdir(), 'budget-adm-')), 'budget.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'budget.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { BudgetDO } = await import(`file://${out}`);

const FREE_PER_DAY = 10_000;
// DUPLICATED ON PURPOSE. Importing the constant from the source would make every assertion below
// vacuous — the test would agree with whatever the source says. These are the numbers the
// boundary arithmetic assumes, restated independently, and the first test compares them against
// the COMPILED module. Raised 2026-09-20 with pricing.ts: 15,000 -> 90,000, because at 15,000 the
// live product refused every build and the owner could not use it. See the long note there.
const BILLABLE_PER_DAY = 90_000;
const CEILING = FREE_PER_DAY + BILLABLE_PER_DAY; // 100,000
const MAX_PER_REQUEST = 1_200;

function budget(seed = {}) {
  const m = new Map(Object.entries(seed));
  const rows = [];
  const storage = {
    async get(k) { const v = m.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) {
      if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) m.set(k, structuredClone(v));
      else m.set(a, structuredClone(b));
    },
    async delete(k) { m.delete(k); },
    sql: { exec(q, ...args) { rows.push({ q, args }); return { toArray: () => [] }; } },
  };
  const o = new BudgetDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const warnings = [];
  const call = async (path, body, method = 'POST') => {
    // A leak that nobody can grep is the thing being tested, so the log is captured, not ignored.
    const realWarn = console.warn;
    console.warn = (...a) => warnings.push(a.map(String).join(' '));
    try {
      return await (await o.fetch(new Request('https://do' + path, {
        method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
      }))).json();
    } finally { console.warn = realWarn; }
  };
  return {
    call, sql: rows, warnings, stored: () => m.get('budget'),
    state: () => call('/state', null, 'GET'),
    reserve: (neurons, model = 'm') => call('/reserve', { neurons, model }),
    settle: (reserved, actual, model = 'm', kind = 'k') => call('/settle', { reserved, actual, model, kind }),
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const seedUsed = (used) => ({
  budget: {
    day: today(), month: thisMonth(),
    dayNeurons: used, dayPending: 0,
    dayBillableNeurons: Math.max(0, used - FREE_PER_DAY),
    monthBillableNeurons: Math.max(0, used - FREE_PER_DAY),
  },
});

test('the compiled ceilings are what every boundary below assumes', async () => {
  const b = budget();
  const p = await b.call('/probe', { neurons: 1 });
  assert.equal(p.dayCeiling, CEILING, 'daily ceiling moved; the boundaries below are stale');
  assert.equal(p.limits.maxNeuronsPerRequest, MAX_PER_REQUEST);
  assert.equal(p.limits.billableNeuronsPerDay, BILLABLE_PER_DAY);
});

// --- the monthly backstop, which the lifecycle suite does not cover -------------------------------

test('the monthly backstop refuses independently of the day', async () => {
  const b = budget(seedUsed(FREE_PER_DAY));
  const s = b.stored();
  s.monthBillableNeurons = 1_800_000;
  await b.call('/reserve', { neurons: 1, model: 'm' });
  const blocked = await b.reserve(500);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'monthly_cap');
});

test('only neurons beyond the free allocation reach the monthly billable ledger', async () => {
  const b = budget();
  await b.reserve(1_000);
  await b.settle(1_000, FREE_PER_DAY - 500);
  assert.equal((await b.state()).monthBillableNeurons, 0, 'inside the free allocation nothing is billable');
  await b.reserve(1_000);
  await b.settle(1_000, 1_000);
  assert.equal((await b.state()).monthBillableNeurons, 500, '10,500 spent, 500 past the free line');
});

test('settle writes one spend row per model and kind', async () => {
  const b = budget();
  await b.settle(0, 100, 'glm-5.3-flash', 'chat');
  const inserts = b.sql.filter((r) => /insert into spend/.test(r.q));
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0].args.slice(1), ['glm-5.3-flash', 'chat', 100]);
});

test('a day rollover clears the day and preserves the month', async () => {
  const b = budget({
    budget: {
      day: '2020-01-01', month: thisMonth(),
      dayNeurons: 24_000, dayPending: 400, dayBillableNeurons: 14_000, monthBillableNeurons: 14_000,
    },
  });
  const s = await b.state();
  assert.equal(s.dayNeurons, 0);
  assert.equal(s.dayPending, 0, 'a reservation that never settled must not hold capacity forever');
  assert.equal(s.monthBillableNeurons, 14_000, 'a day rollover must not erase the month');
});

test('the rollover is not persisted by a read alone', async () => {
  // load() mutates the object it returns; only a handler that put()s may persist that. Without the
  // deep copy in the harness above, a read path that silently rewrote storage would look identical.
  const b = budget({ budget: { day: '2020-01-01', month: '2020-01', dayNeurons: 24_000, dayPending: 0, dayBillableNeurons: 14_000, monthBillableNeurons: 14_000 } });
  await b.state();
  assert.equal(b.stored().day, '2020-01-01', 'a GET must not write');
  assert.equal(b.stored().dayNeurons, 24_000);
});

// --- probe is a dry run of reserve, and must stay one ---------------------------------------------

test('probe returns the verdict reserve would, and changes nothing', async () => {
  const cases = [
    { seed: {}, neurons: 100, expect: 'allowed' },
    { seed: {}, neurons: MAX_PER_REQUEST + 1, expect: 'request_too_large' },
    { seed: seedUsed(CEILING - 10), neurons: 100, expect: 'daily_cap' },
    // A LIVE RESERVATION, and this case is here because its absence hid a break. Falsifying
    // `projectedDay` in /probe changed nothing while every case had dayPending: 0 — the two paths
    // could drift on the pending term and this test would still have passed.
    { seed: { budget: { day: today(), month: thisMonth(), dayNeurons: CEILING - 1_000, dayPending: 600, dayBillableNeurons: 0, monthBillableNeurons: 0 } },
      neurons: 600, expect: 'daily_cap' },
  ];
  for (const c of cases) {
    const probed = budget(structuredClone(c.seed));
    const before = JSON.stringify(await probed.state());
    const p = await probed.call('/probe', { neurons: c.neurons });
    assert.equal(p.verdict, c.expect, `probe verdict for ${c.neurons}`);
    assert.equal(JSON.stringify(await probed.state()), before, 'probe must leave the ledger untouched');

    const real = budget(structuredClone(c.seed));
    const r = await real.reserve(c.neurons);
    assert.equal(r.ok ? 'allowed' : r.reason, c.expect, `reserve disagreed with probe for ${c.neurons}`);
  }
});

// --- an unreadable number is not a small one -------------------------------------------------------

const UNREADABLE = [
  ['null', null],
  ['a NaN, which JSON turns into null', NaN],
  ['a string', 'abc'],
  ['Infinity, which JSON also turns into null', Infinity],
  ['a negative', -5],
  ['omitted entirely', undefined],
];

for (const [label, value] of UNREADABLE) {
  test(`reserve refuses an estimate that is ${label}`, async () => {
    const b = budget();
    const r = await b.call('/reserve', { neurons: value, model: 'm' });
    assert.equal(r.ok, false, 'an unknown-cost call must not be admitted');
    assert.equal(r.reason, 'unreadable_estimate', 'and the refusal must name what went wrong');
    assert.equal((await b.state()).dayPending, 0, 'nothing may be reserved on an unreadable estimate');
  });

  test(`settle charges the reservation when the true cost is ${label}`, async () => {
    // Settle runs AFTER the provider has been paid, so refusing here would record the spend as
    // zero — the very thing being prevented. The conservative reservation is charged instead, and
    // the response says the figure is estimated so it cannot be mistaken for a measurement.
    const b = budget();
    await b.reserve(800);
    const s = await b.call('/settle', { reserved: 800, actual: value, model: 'm', kind: 'k' });
    assert.equal(s.state.dayNeurons, 800, 'an unreadable cost must be charged at the reservation, never at zero');
    assert.equal(s.estimated, true, 'and it must be distinguishable from a measured figure');
    assert.equal(s.unreadable, 'actual');
    assert.equal(s.state.dayPending, 0, 'the reservation is still cleared');
  });
}

test('an unreadable reservation amount does not poison the pending counter', async () => {
  const b = budget();
  await b.reserve(500);
  const s = await b.call('/settle', { reserved: 'abc', actual: 100, model: 'm', kind: 'k' });
  assert.equal(Number.isFinite(s.state.dayPending), true, 'dayPending must never become NaN');
  assert.equal(Number.isFinite(s.state.dayNeurons), true, 'dayNeurons must never become NaN');
  assert.equal(s.state.dayNeurons, 100, 'a readable actual is still recorded exactly');
  assert.equal(s.unreadable, 'reserved');

  const rel = await b.call('/release', { reserved: NaN });
  assert.equal(rel.ok, false, 'releasing an unreadable amount must refuse, not subtract NaN');
  assert.equal(Number.isFinite((await b.state()).dayPending), true);
});

test('simulate-usage refuses a non-number rather than poisoning the ledger', async () => {
  const b = budget();
  await b.call('/simulate-usage', { neurons: 1_000 });
  const bad = await b.call('/simulate-usage', { neurons: 'abc' });
  assert.equal(bad.ok, false);
  const st = await b.state();
  assert.equal(st.dayNeurons, 1_000, 'the ledger must be untouched by an unreadable simulate');
  assert.equal(Number.isFinite(st.dayNeurons), true);
});

test('probe reports the unreadable verdict reserve would give', async () => {
  const b = budget();
  assert.equal((await b.call('/probe', { neurons: null })).verdict, 'unreadable_estimate',
    'probe must not disagree with reserve about this either');
});

test('CONTROL: readable numbers are unaffected by the guard', async () => {
  // A rule that complains about every input would make every case above pass for the wrong reason.
  const b = budget();
  assert.equal((await b.reserve(0)).ok, true, 'zero is a READABLE number and must still be admitted');
  assert.equal((await b.reserve(1)).ok, true);
  assert.equal((await b.reserve(1_000)).ok, true);
  const s = await b.call('/settle', { reserved: 1_000, actual: 640, model: 'm', kind: 'k' });
  assert.equal(s.state.dayNeurons, 640, 'a measured cost is recorded exactly');
  assert.equal(s.estimated, undefined, 'and is NOT flagged as estimated');
  assert.equal((await b.call('/simulate-usage', { neurons: 10 })).ok, true);
});

// --- the lifecycle, because the file that covered it is not in the tree -------------------------
//
// SCOPE CHANGED, and this is why. These cases were deliberately absent above: rbxai-1d had them in
// budget-do.test.mjs and duplicating a peer's suite is waste. He then stood down on this file and
// moved it to his own scratchpad, so it is not in the tree and nothing executing covers the
// reservation lifecycle, the kill switch or the ratchet. `spend-ratchet.test.mjs` regexes the
// SOURCE for the ratchet, which is a different claim. Re-added here rather than left to a file
// that may never land. Two of his cases are better than the ones I first wrote and are kept as he
// framed them — the lowering control especially.
//
// FIXTURE TRAP, from his notes and worth stating where the numbers are: MAX_NEURONS_PER_REQUEST is
// 1,200 against a 25,000 daily ceiling. ANY fixture reserving more than 1,200 exercises the
// REFUSAL path while appearing to test the ceiling, and it looks like it passed for the intended
// reason. Every reservation below is under 1,200 and the ceiling is approached by seeding spend.

test('a reservation is held as pending, and pending accumulates', async () => {
  // If pending did not count, two calls could each see room for one more and both be admitted —
  // the double-spend the singleton exists to prevent.
  const b = budget();
  await b.reserve(1_000);
  assert.equal((await b.state()).dayPending, 1_000, 'the hold must be visible before it settles');
  await b.reserve(1_000);
  assert.equal((await b.state()).dayPending, 2_000, 'a second hold must see the first');
});

test('the daily ceiling holds against a second reservation, and the boundary is exact', async () => {
  const b = budget(seedUsed(CEILING - 1_100));
  assert.equal((await b.reserve(1_000)).ok, true, 'the last 1,000 neurons of the day are spendable');
  const over = await b.reserve(200);
  assert.equal(over.ok, false, 'the next 200 are not — the first reservation is still held');
  assert.equal(over.reason, 'daily_cap');
});

test('a request larger than the per-request cap is refused BY REASON, not by accident', async () => {
  // request_too_large and unreadable_estimate are different operator actions at 3am: one is a
  // client sending too much, the other is a bug upstream. They must never read the same.
  const b = budget();
  assert.equal((await b.reserve(MAX_PER_REQUEST)).ok, true, 'exactly at the cap is allowed');
  const r = await b.reserve(MAX_PER_REQUEST + 1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'request_too_large');
  assert.notEqual(r.reason, 'unreadable_estimate');
});

test('the kill switch refuses every reservation and carries the operator reason to the caller', async () => {
  const b = budget();
  await b.call('/kill', { killed: true, reason: 'paused for a runaway loop' });
  const r = await b.reserve(100);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'killed');
  assert.equal(r.message, 'paused for a runaway loop', 'the operator said why; the caller must hear it');
});

test('the kill switch lifts, or it is a one-way door nobody would use', async () => {
  const b = budget();
  await b.call('/kill', { killed: true, reason: 'x' });
  assert.equal((await b.reserve(100)).ok, false);
  await b.call('/kill', { killed: false });
  assert.equal((await b.reserve(100)).ok, true, 'un-killing must restore service');
});

test('release frees the hold; settle records the ACTUAL cost, not the reservation', async () => {
  const b = budget();
  await b.reserve(1_000);
  await b.call('/release', { reserved: 1_000 });
  const rel = await b.state();
  assert.equal(rel.dayPending, 0, 'a failed call must return its reservation');
  assert.equal(rel.dayNeurons, 0, 'and a released reservation is not spend');

  await b.reserve(1_000);
  await b.settle(1_000, 320);
  const st = await b.state();
  assert.equal(st.dayPending, 0);
  assert.equal(st.dayNeurons, 320, 'the true cost, not the 1,000 reserved');
});

test('a stranded hold is released by the day rollover', async () => {
  // The crash case: a worker that dies between reserve and settle holds neurons with nothing left
  // to free them. Rollover is what bounds the damage to the remainder of one day.
  //
  // THE FIXTURE HAS TO BITE, and my first one did not. It stranded 1,000 neurons against a 25,000
  // ceiling, so inheriting the stale hold refused nothing and the test passed whether or not the
  // rollover happened — it went GREEN with `if (s.day !== d)` replaced by `if (false)`. A test that
  // only ever walks the silent path is not a test. Yesterday's state below sits close enough to the
  // ceiling that inheriting it MUST refuse the next call.
  const stranded = {
    day: '2000-01-01', month: '2000-01',
    dayNeurons: CEILING - 500, dayPending: 400,
    dayBillableNeurons: CEILING - 500 - FREE_PER_DAY, monthBillableNeurons: CEILING - 500 - FREE_PER_DAY,
  };
  // Proof the fixture bites: the same numbers dated TODAY are refused.
  const sameDay = budget({ budget: { ...stranded, day: today(), month: thisMonth() } });
  const refused = await sameDay.reserve(200);
  assert.equal(refused.ok, false, 'the fixture must be over the line, or the rollover proves nothing');
  assert.equal(refused.reason, 'daily_cap');

  // Dated yesterday, the rollover must clear it and the same call must be admitted.
  const b = budget({ budget: stranded });
  const r = await b.reserve(200);
  assert.equal(r.ok, true, "a new day must not inherit yesterday's stranded hold");
  assert.equal(r.state.dayNeurons, 0, "and yesterday's spend must not follow it either");
  assert.equal(r.state.dayPending, 200, 'only the new reservation is held');
});

test('the admin route cannot raise a ceiling above the compiled default', async () => {
  // G4, executed rather than regexed. A route that could widen the cap is a static secret away
  // from a 22x bill, and /api/admin/* is exempt from user auth.
  const b = budget();
  const raised = await b.call('/limits', {
    billableNeuronsPerDay: 2_000_000, billableNeuronsPerMonth: 20_000_000, maxNeuronsPerRequest: 100_000,
  });
  assert.equal(raised.limits.billableNeuronsPerDay, BILLABLE_PER_DAY);
  assert.equal(raised.limits.billableNeuronsPerMonth, 1_800_000);
  assert.equal(raised.limits.maxNeuronsPerRequest, MAX_PER_REQUEST);
});

test('CONTROL: lowering a cap actually BINDS', async () => {
  // The control for the ratchet, and the one that is easy to omit. A route that refused EVERY
  // change would also pass "cannot raise" — while making the runtime cap useless in the incident
  // it exists for. Without this, "can only ratchet down" is satisfied by a route that does nothing.
  const b = budget();
  const lowered = await b.call('/limits', { billableNeuronsPerDay: 100 });
  assert.equal(lowered.limits.billableNeuronsPerDay, 100, 'lowering must be accepted');

  // and it must bind ADMISSION, not merely be stored
  await b.call('/simulate-usage', { neurons: FREE_PER_DAY + 50 });
  const blocked = await b.reserve(100);
  assert.equal(blocked.ok, false, 'a lowered daily cap must refuse');
  assert.equal(blocked.reason, 'daily_cap');
});

/* ------------------------------------- a silent leak is still a silent failure --- */

/**
 * Found by rbxai-1d reviewing bf64b0d, and it is the pattern one layer in from where I fixed it.
 *
 * When `reserved` is unreadable /settle deliberately does NOT subtract it — guessing would let one
 * caller erase another caller's reservation. That is right, and it fails closed. But the
 * reservation then leaks until the UTC rollover, capacity silently shrinks, /reserve starts
 * refusing with `daily_cap`, and an operator sees a full budget with no spend to match it —
 * indistinguishable from genuine demand. `estimated: true` reaches the CALLER; it reaches nobody
 * reading logs at 3am. budget.ts had no logging of any kind.
 */

test('a leaked reservation is announced, not just survived', async () => {
  const b = budget();
  await b.reserve(500);
  const s = await b.call('/settle', { reserved: 'abc', actual: 100, model: 'glm-5.3-flash', kind: 'chat' });
  assert.equal(s.unreadable, 'reserved');
  assert.equal(b.warnings.length >= 1, true, 'a leaked reservation must leave a line someone can grep');
  const line = b.warnings.join(' ');
  assert.match(line, /budget/i, 'the warning must be identifiable as the budget guard');
  assert.match(line, /glm-5\.3-flash/, 'and must name the model, or it cannot be traced to a caller');
});

test('charging the upper bound because nothing was readable is announced too', async () => {
  const b = budget();
  const s = await b.call('/settle', { reserved: null, actual: null, model: 'glm-5.3-flash', kind: 'chat' });
  assert.equal(s.estimated, true);
  assert.equal(s.state.dayNeurons, MAX_PER_REQUEST, 'nothing readable charges the most it could have been');
  // NOT `warnings.length >= 1`. Both fields are unreadable here, so the leaked-reservation warning
  // already satisfies a bare count — and it did: deleting this branch's warn entirely left the test
  // green. The assertion has to name the line it is looking for.
  const upperBound = b.warnings.filter((w) => /upper bound/.test(w));
  assert.equal(upperBound.length, 1, `expected one upper-bound warning, got: ${JSON.stringify(b.warnings)}`);
  assert.match(upperBound[0], new RegExp(String(MAX_PER_REQUEST)), 'the warning must name the figure charged');
});

test('the response says WHY a figure was unreadable, not only that it was', async () => {
  // Three different causes were collapsed into one null: not a number, negative, and non-finite.
  // A caller billed the reservation for sending -1 could not tell why from the response alone.
  const cases = [
    [-5, 'negative'],
    ['abc', 'not_a_number'],
    [null, 'not_a_number'],
  ];
  for (const [value, why] of cases) {
    const b = budget();
    await b.reserve(800);
    const s = await b.call('/settle', { reserved: 800, actual: value, model: 'm', kind: 'k' });
    assert.equal(s.estimated, true);
    assert.equal(s.unreadableWhy, why, `actual=${JSON.stringify(value)} should report "${why}"`);
  }
});

test('CONTROL: a readable settle warns about nothing and says nothing was unreadable', async () => {
  // A guard that warned on every settle would satisfy all three tests above and drown the signal.
  const b = budget();
  await b.reserve(800);
  const s = await b.call('/settle', { reserved: 800, actual: 640, model: 'm', kind: 'k' });
  assert.equal(s.estimated, undefined);
  assert.equal(s.unreadableWhy, undefined);
  assert.deepEqual(b.warnings, [], 'a normal settle must be silent, or the warning means nothing');
});
