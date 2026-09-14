/**
 * S12 — DOES IT STILL WORK TOMORROW.
 *
 * The station asks whether quota reset, and everything that hangs off it, survives a day boundary.
 * Until now the only way to answer that inside QuotaDO was to wait, because every date came from
 * `new Date()` at the point of use: a rollover could be reasoned about and not executed. The
 * arithmetic now takes `now` as an argument, so midnight, a month end and a leap day are inputs.
 *
 * WHAT IS ACTUALLY BEING TESTED, and it is not a scheduled job. The ledger is keyed by UTC day and
 * the day's spend is a query for rows matching today's key, so the allowance returns at midnight
 * because THE QUESTION CHANGES, not because anything clears a counter. That is the better design —
 * no job to miss, no server that has to be awake — but it means "the reset works" is a claim about
 * a key and a query agreeing, which is exactly what the fake ledger below reproduces. Asserting
 * only on `quotaState` would test the arithmetic and miss the mechanism.
 *
 * The property that matters most is the one a scheduled reset would get wrong: PURCHASED CREDITS
 * MUST NOT RESET. They are a balance somebody paid for. An allowance that returns and a balance
 * that survives look identical on any single day and differ completely on the next one.
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
const out = join(mkdtempSync(join(tmpdir(), 'qm-')), 'qm.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'quota-math.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const Q = await import(`file://${out}`);

const sharedOut = join(mkdtempSync(join(tmpdir(), 'qm-shared-')), 'shared.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts'), '--bundle', '--format=esm',
   '--target=es2022', '--outfile=' + sharedOut], { cwd: WORKER, stdio: 'pipe' });
const { PLAN_LIMITS } = await import(`file://${sharedOut}`);

const at = (iso) => Date.parse(iso);

/**
 * The DO's ledger, in miniature: rows keyed by UTC day, summed by the same two queries.
 * This is what makes the reset observable — the rows never change, only the key being asked for.
 */
function ledger() {
  const rows = [];
  return {
    rows,
    spend(now, sparks) { rows.push({ day: Q.dayKey(now), sparks }); },
    today(now) { return rows.filter((r) => r.day === Q.dayKey(now)).reduce((a, r) => a + r.sparks, 0); },
    month(now) { const k = Q.monthKey(now); return rows.filter((r) => r.day.startsWith(k)).reduce((a, r) => a + r.sparks, 0); },
  };
}
const stateAt = (l, now, plan = 'free', credits = 0) =>
  Q.quotaState({ plan, spentToday: l.today(now), spentThisMonth: l.month(now), credits, now });

// --- the keys --------------------------------------------------------------------------------

test('day and month keys are UTC, and roll at the right instant', () => {
  assert.equal(Q.dayKey(at('2026-09-14T23:59:59.999Z')), '2026-09-14');
  assert.equal(Q.dayKey(at('2026-09-15T00:00:00.000Z')), '2026-09-15');
  assert.equal(Q.monthKey(at('2026-09-30T23:59:59.999Z')), '2026-09');
  assert.equal(Q.monthKey(at('2026-10-01T00:00:00.000Z')), '2026-10');
  // a local-time implementation would put this one on the 14th in most of the Americas
  assert.equal(Q.dayKey(at('2026-09-15T02:00:00.000Z')), '2026-09-15');
});

test('the reset time is the NEXT midnight, including at midnight itself', () => {
  assert.equal(Q.nextResetIso(at('2026-09-14T00:00:00.000Z')), '2026-09-15T00:00:00.000Z');
  assert.equal(Q.nextResetIso(at('2026-09-14T23:59:59.999Z')), '2026-09-15T00:00:00.000Z');
  // At exactly midnight the new day has begun; returning "now" would render as expired.
  assert.equal(Q.nextResetIso(at('2026-09-15T00:00:00.000Z')), '2026-09-16T00:00:00.000Z');
  assert.equal(Q.nextResetIso(at('2026-12-31T18:00:00.000Z')), '2027-01-01T00:00:00.000Z');
});

// --- the rollover ----------------------------------------------------------------------------

test('THE ALLOWANCE RETURNS AT MIDNIGHT, without anything clearing a counter', () => {
  const l = ledger();
  const before = at('2026-09-14T22:00:00.000Z');
  l.spend(before, PLAN_LIMITS.free.sparksPerDay); // spend the whole day
  const spent = stateAt(l, before);
  assert.equal(spent.allowanceRemaining, 0, 'the day is spent');
  assert.equal(spent.sparksRemaining, 0);

  const after = at('2026-09-15T00:00:01.000Z');
  const fresh = stateAt(l, after);
  assert.equal(fresh.allowanceRemaining, PLAN_LIMITS.free.sparksPerDay, 'the allowance is back');
  assert.equal(fresh.sparksUsedToday, 0, 'and today shows no spend');
  assert.equal(l.rows.length, 1, 'while the ledger row is still there — nothing was deleted');
});

test('PURCHASED CREDITS DO NOT RESET — they are a balance, not a rate', () => {
  // The property a scheduled reset gets wrong. On any single day an allowance that returns and a
  // balance that survives look identical; they differ completely on the next one.
  const l = ledger();
  const d1 = at('2026-09-14T22:00:00.000Z');
  l.spend(d1, PLAN_LIMITS.free.sparksPerDay);
  assert.equal(stateAt(l, d1, 'free', 500).credits, 500);
  assert.equal(stateAt(l, d1, 'free', 500).sparksRemaining, 500, 'credits carry the spend when the day is gone');

  const d2 = at('2026-09-15T00:00:01.000Z');
  const next = stateAt(l, d2, 'free', 500);
  assert.equal(next.credits, 500, 'the purchased balance must survive the boundary untouched');
  assert.equal(next.allowanceRemaining, PLAN_LIMITS.free.sparksPerDay, 'and the allowance returns beside it');
  assert.equal(next.sparksRemaining, PLAN_LIMITS.free.sparksPerDay + 500, 'the two add, and neither replaced the other');
});

test('a day boundary does NOT reset the month', () => {
  const l = ledger();
  for (let d = 1; d <= 5; d++) l.spend(at(`2026-09-0${d}T12:00:00.000Z`), 40);
  const now = at('2026-09-06T00:00:01.000Z');
  const s = stateAt(l, now);
  assert.equal(s.sparksUsedToday, 0, 'the day reset');
  assert.equal(s.sparksUsedThisMonth, 200, 'the month did not');
});

test('a month boundary resets the month too', () => {
  const l = ledger();
  for (let d = 1; d <= 5; d++) l.spend(at(`2026-09-0${d}T12:00:00.000Z`), 40);
  const s = stateAt(l, at('2026-10-01T00:00:01.000Z'));
  assert.equal(s.sparksUsedThisMonth, 0, 'a new month starts empty');
  assert.equal(s.sparksUsedToday, 0);
});

test('month ends and leap days roll like any other boundary', () => {
  const l = ledger();
  l.spend(at('2026-01-31T23:00:00.000Z'), 50);
  assert.equal(stateAt(l, at('2026-02-01T00:00:01.000Z')).sparksUsedToday, 0, '31 Jan to 1 Feb');
  const leap = ledger();
  leap.spend(at('2024-02-28T23:00:00.000Z'), 50);
  assert.equal(leap.today(at('2024-02-29T00:00:01.000Z')), 0, '28 Feb to 29 Feb in a leap year');
  assert.equal(Q.dayKey(at('2024-02-29T12:00:00.000Z')), '2024-02-29');
});

test('the monthly cap can bite before the daily one, and says so', () => {
  // Free is 60/day and 900/month, so a heavy month runs out of month before it runs out of day.
  const l = ledger();
  for (let d = 1; d <= 15; d++) l.spend(at(`2026-09-${String(d).padStart(2, '0')}T12:00:00.000Z`), 60);
  const s = stateAt(l, at('2026-09-16T00:00:01.000Z'));
  assert.equal(s.sparksUsedThisMonth, 900);
  assert.equal(s.allowanceRemaining, 0, 'the month is spent even though the day is fresh');
  assert.equal(s.sparksUsedToday, 0, 'and the day genuinely is fresh — the two are reported separately');
});

// --- the spend split -------------------------------------------------------------------------

test('a spend takes the allowance first and credits only for the remainder', () => {
  assert.deepEqual(Q.splitSpend(10, 100, 500), { fromAllowance: 10, fromCredits: 0, affordable: true });
  assert.deepEqual(Q.splitSpend(120, 100, 500), { fromAllowance: 100, fromCredits: 20, affordable: true });
  assert.deepEqual(Q.splitSpend(50, 0, 500), { fromAllowance: 0, fromCredits: 50, affordable: true });
});

test('an unaffordable spend takes NOTHING, rather than draining what there is', () => {
  // A partial charge for a refused request is the worst of both: the user is billed and unserved.
  assert.deepEqual(Q.splitSpend(700, 100, 500), { fromAllowance: 0, fromCredits: 0, affordable: false });
  assert.deepEqual(Q.splitSpend(1, 0, 0), { fromAllowance: 0, fromCredits: 0, affordable: false });
});

test('exactly affordable is affordable, and a zero spend is free', () => {
  assert.deepEqual(Q.splitSpend(600, 100, 500), { fromAllowance: 100, fromCredits: 500, affordable: true });
  assert.deepEqual(Q.splitSpend(0, 0, 0), { fromAllowance: 0, fromCredits: 0, affordable: true });
});

test('every plan reports the table it is limited by, not a copy of it', () => {
  for (const plan of Object.keys(PLAN_LIMITS)) {
    const s = Q.quotaState({ plan, spentToday: 0, spentThisMonth: 0, credits: 0, now: at('2026-09-14T12:00:00.000Z') });
    assert.equal(s.sparksDaily, PLAN_LIMITS[plan].sparksPerDay, `${plan} daily`);
    assert.equal(s.sparksMonthly, PLAN_LIMITS[plan].sparksPerMonth, `${plan} monthly`);
    assert.equal(s.allowanceRemaining, Math.min(PLAN_LIMITS[plan].sparksPerDay, PLAN_LIMITS[plan].sparksPerMonth));
  }
});

test('an overspent ledger clamps at zero rather than reporting a negative allowance', () => {
  const l = ledger();
  l.spend(at('2026-09-14T12:00:00.000Z'), PLAN_LIMITS.free.sparksPerDay * 3);
  const s = stateAt(l, at('2026-09-14T13:00:00.000Z'));
  assert.equal(s.allowanceRemaining, 0);
  assert.equal(s.sparksRemaining, 0);
  assert.ok(s.sparksUsedToday > s.sparksDaily, 'the overspend is still reported honestly, not clamped away');
});
