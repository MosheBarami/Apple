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
const BILLABLE_PER_DAY = 15_000;
const CEILING = FREE_PER_DAY + BILLABLE_PER_DAY; // 25,000
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
  const call = async (path, body, method = 'POST') =>
    (await o.fetch(new Request('https://do' + path, {
      method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    }))).json();
  return {
    call, sql: rows, stored: () => m.get('budget'),
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
  s.monthBillableNeurons = 460_000;
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
