/**
 * THE PLAN TABLE IS ONE CONFIG, AND EVERY PLAN IN IT PAYS ITS WAY.
 *
 * Owner decisions of 2026-10-04 (planning/pricing-2026-10-04.md): a credit is $0.05 of AI compute;
 * Free is 5 credits a day and at most 30 a month; Pro is $9.99 a month for 100; Max is $24.99 for
 * 300; a top-up pack is $4.99 for 50. packages/shared holds those numbers once (PLAN_TABLE), and
 * this file holds the three properties that keep them honest:
 *
 *   1. THE UNIT. The ledger counts in units of NEURONS_PER_CREDIT neurons and a credit is
 *      INTERNAL_PER_CREDIT of them. That number is derived here from the neuron price in
 *      src/pricing.ts and pinned, instead of being trusted as a second source of truth.
 *   2. THE MONEY. Worst-case profit after a 2.9% + $0.30 card fee is recomputed here from the table
 *      with its own arithmetic, and a paid plan or pack below $0 fails the build. Free is not
 *      exempt from being costed: its worst case is printed as a number a test pins.
 *      ASSUMPTION, STATED: that arithmetic is for ONE pool per payment. QuotaDO's month is the UTC
 *      CALENDAR month (quota-math.monthKey), not the billing period, so a subscriber who pays
 *      mid-month can spend one pool before the month ends and a second after it, inside the first
 *      paid period: Pro loses $0.60 and Max $6.03 in that worst case. The last test of section 3
 *      measures it. Charging is off, so no one is exposed; it is an M6 MUST-FIX (align the pool to
 *      the billing period, or prorate the first one), and that test is the one to change then.
 *   3. THE ENFORCEMENT. QuotaDO takes its limits from the same table: Free is 5 credits a day and 30
 *      a month, in ledger units, and a spend past the day is refused by the real DO code.
 *
 * The global daily neuron ceiling and the spend caps in src/pricing.ts are NOT touched by this
 * change; the last test states what the new Free allowance does to the headroom under them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'plan-economics-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));

function bundle(entry, name, extra = []) {
  const out = join(TMP, name);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', ...extra, `--outfile=${out}`],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return import(pathToFileURL(out).href);
}

const shared = await bundle(join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'shared.mjs');
const pricing = await bundle(join(WORKER, 'src', 'pricing.ts'), 'pricing.mjs');
const math = await bundle(join(WORKER, 'src', 'quota-math.ts'), 'quota-math.mjs');
const {
  CARD_FEE, CREDIT_USD, INTERNAL_PER_CREDIT, PLAN_IDS, PLAN_LIMITS, PLAN_TABLE, TOPUP_PACK,
  TYPICAL_BUILD_CREDITS, BUILD_COSTS, LISTED_PLAN_IDS, NEURONS_PER_CREDIT, internalToCredits, buildsPerMonth,
} = shared;
const { USD_PER_NEURON, DAILY_NEURON_CEILING } = pricing;

// What the owner decided, typed here ON PURPOSE and independently of the config: the config is what
// is under test, so it cannot also be where the expected values come from.
const DECIDED = {
  creditUsd: 0.05,
  cardFee: { rate: 0.029, fixedUsd: 0.3 },
  free: { creditsPerDay: 5, creditsPerMonth: 30 },
  builder: { name: 'Pro', priceUsdMonthly: 9.99, creditsPerMonth: 100 },
  studio: { name: 'Max', priceUsdMonthly: 24.99, creditsPerMonth: 300 },
  pack: { priceUsd: 4.99, credits: 50 },
  // The pricing doc's worst-case profit column. The doc rounds each to the cent and does not say
  // how; the exact values are 4.4003, 8.9653 and 2.0453, so the pack reads 2.04 truncated and 2.05
  // rounded. The test therefore accepts anything within one cent of the doc rather than pinning
  // the doc's rounding.
  profit: { builder: 4.4, studio: 8.97, pack: 2.04 },
  freeWorstCaseAiCostUsd: 1.5,
};

/** The profit of one payment if the buyer spends every credit it bought, after the card fee. */
const worstCaseProfit = (priceUsd, credits) =>
  priceUsd - (priceUsd * DECIDED.cardFee.rate + DECIDED.cardFee.fixedUsd) - credits * DECIDED.creditUsd;

// ---------------------------------------------------------------- 1. the table says what was decided

test('the table holds the decided plans, with the stored ids and display names mapped', () => {
  assert.equal(CREDIT_USD, DECIDED.creditUsd);
  assert.deepEqual(CARD_FEE, DECIDED.cardFee);
  assert.deepEqual(PLAN_IDS, ['free', 'builder', 'studio', 'enterprise'], 'the stored plan ids are identifiers and do not change');
  assert.equal(PLAN_TABLE.free.name, 'Free');
  assert.equal(PLAN_TABLE.free.priceUsdMonthly, 0);
  assert.equal(PLAN_TABLE.free.creditsPerDay, DECIDED.free.creditsPerDay);
  assert.equal(PLAN_TABLE.free.creditsPerMonth, DECIDED.free.creditsPerMonth);
  for (const id of ['builder', 'studio']) {
    assert.equal(PLAN_TABLE[id].name, DECIDED[id].name, `${id} is shown as ${DECIDED[id].name}`);
    assert.equal(PLAN_TABLE[id].priceUsdMonthly, DECIDED[id].priceUsdMonthly);
    assert.equal(PLAN_TABLE[id].creditsPerMonth, DECIDED[id].creditsPerMonth);
  }
  assert.equal(TOPUP_PACK.priceUsd, DECIDED.pack.priceUsd);
  assert.equal(TOPUP_PACK.credits, DECIDED.pack.credits);
});

test('Enterprise is a stored id and is not on the displayed ladder', () => {
  assert.ok(PLAN_IDS.includes('enterprise'), 'a row holding the stored id must still resolve');
  assert.deepEqual([...LISTED_PLAN_IDS], ['free', 'builder', 'studio']);
  assert.equal(shared.PLAN_COPY.enterprise.priceUsdMonthly, null, 'and it carries no price');
});

test('PLAN_COPY and PLAN_LIMITS are derived from the table, never a second set of numbers', () => {
  for (const id of PLAN_IDS) {
    assert.equal(shared.PLAN_COPY[id].name, PLAN_TABLE[id].name);
    assert.equal(shared.PLAN_COPY[id].priceUsdMonthly, PLAN_TABLE[id].priceUsdMonthly);
    assert.equal(PLAN_LIMITS[id].creditsPerDay, PLAN_TABLE[id].creditsPerDay * INTERNAL_PER_CREDIT);
    assert.equal(PLAN_LIMITS[id].creditsPerMonth, PLAN_TABLE[id].creditsPerMonth * INTERNAL_PER_CREDIT);
  }
});

// ---------------------------------------------------------------- 2. the unit

test('THE UNIT: 150 ledger units is the neuron arithmetic rounded down to a multiple of ten', () => {
  const exact = CREDIT_USD / (NEURONS_PER_CREDIT * USD_PER_NEURON);
  assert.ok(exact > 151 && exact < 152, `$0.05 / (30 neurons x $0.000011) is ${exact}`);
  assert.equal(INTERNAL_PER_CREDIT, Math.floor(exact / 10) * 10, 'INTERNAL_PER_CREDIT drifted from what the neuron price implies');
  const dollarsPerCredit = INTERNAL_PER_CREDIT * NEURONS_PER_CREDIT * USD_PER_NEURON;
  assert.ok(dollarsPerCredit <= CREDIT_USD, 'a credit may not cost more compute than the $0.05 it is sold as');
  assert.ok(CREDIT_USD - dollarsPerCredit <= CREDIT_USD * 0.011, 'and the rounding gives away at most about 1%');
  assert.equal(internalToCredits(INTERNAL_PER_CREDIT), 1);
});

// ---------------------------------------------------------------- 3. the money

test('worst-case profit of ONE pool per payment, after the card fee, matches the pricing doc and no paid plan is below $0', () => {
  const rows = [
    ['builder', PLAN_TABLE.builder.priceUsdMonthly, PLAN_TABLE.builder.creditsPerMonth],
    ['studio', PLAN_TABLE.studio.priceUsdMonthly, PLAN_TABLE.studio.creditsPerMonth],
    ['pack', TOPUP_PACK.priceUsd, TOPUP_PACK.credits],
  ];
  for (const [name, price, credits] of rows) {
    const profit = worstCaseProfit(price, credits);
    assert.ok(profit >= 0, `${name} loses $${(-profit).toFixed(2)} in the worst case ($${price} for ${credits} credits)`);
    assert.ok(
      Math.abs(profit - DECIDED.profit[name]) < 0.01,
      `${name}: recomputed worst-case profit ${profit.toFixed(4)} is not within a cent of the doc's ${DECIDED.profit[name]}`,
    );
  }
  assert.equal(Math.round(worstCaseProfit(9.99, 100) * 100) / 100, 4.4);
  assert.equal(Math.round(worstCaseProfit(24.99, 300) * 100) / 100, 8.97);
});

test('KNOWN GAP, OPEN, M6 MUST-FIX: the pool is the UTC calendar month, so a mid-month subscriber can spend TWO pools in the first period', () => {
  // The premise, read from the code: the monthly pool rolls over at the start of a calendar month
  // in UTC, whenever the subscriber paid. A payment on 30 June buys a pool on 30 June and a fresh
  // one a day and a half later, on 1 July, both inside the first paid period.
  const payDay = Date.UTC(2026, 5, 30, 12);
  const nextDay = Date.UTC(2026, 6, 1, 0, 0, 1);
  assert.notEqual(math.monthKey(payDay), math.monthKey(nextDay), 'the pool no longer rolls over on the calendar month: re-derive this exposure');
  assert.equal(math.monthKey(payDay), '2026-06');
  // The exposure, with the same fee arithmetic as above and two pools instead of one.
  const twoPools = (id) => worstCaseProfit(PLAN_TABLE[id].priceUsdMonthly, 2 * PLAN_TABLE[id].creditsPerMonth);
  assert.equal(Math.round(twoPools('builder') * 100) / 100, -0.6, 'Pro, two pools in the first period');
  assert.equal(Math.round(twoPools('studio') * 100) / 100, -6.03, 'Max, two pools in the first period');
  // This is a RECORD OF AN OPEN DEFECT, not an endorsement: when M6 aligns the pool to the billing
  // period (or prorates the first), the premise assertion above stops holding and this test is
  // rewritten into the property "no paid plan is below $0 in its first period".
});

test('EVERY priced plan in the table is covered, not just the ones named above', () => {
  const priced = PLAN_IDS.filter((id) => (PLAN_TABLE[id].priceUsdMonthly ?? 0) > 0);
  assert.deepEqual(priced, ['builder', 'studio'], 'a new priced plan must be added to the profit rows above');
  for (const id of priced) {
    assert.ok(worstCaseProfit(PLAN_TABLE[id].priceUsdMonthly, PLAN_TABLE[id].creditsPerMonth) >= 0, `${id} is below $0`);
  }
});

test('Free costs at most $1.50 a month in the worst case, and the monthly cap is what bounds it', () => {
  const cost = PLAN_TABLE.free.creditsPerMonth * DECIDED.creditUsd;
  assert.ok(Math.abs(cost - DECIDED.freeWorstCaseAiCostUsd) < 1e-9, `free worst case is $${cost}`);
  assert.ok(
    PLAN_TABLE.free.creditsPerMonth <= PLAN_TABLE.free.creditsPerDay * 31,
    'the monthly figure may not exceed what the daily one can reach in a month, or it is an allowance nobody can spend',
  );
});

test('"about N builds" can only understate: it is at most what a typical build allows, and within 10% of it', () => {
  const cases = [
    ...PLAN_IDS.map((id) => [id, PLAN_TABLE[id].approxBuilds, PLAN_TABLE[id].creditsPerMonth]),
    ['pack', TOPUP_PACK.approxBuilds, TOPUP_PACK.credits],
  ];
  for (const [name, builds, credits] of cases) {
    const most = Math.floor(credits / TYPICAL_BUILD_CREDITS);
    assert.ok(builds <= most, `${name} promises ${builds} builds and ${credits} credits buy at most ${most}`);
    assert.ok(builds >= most * 0.9, `${name} promises ${builds} builds, far below the ${most} it affords`);
  }
  for (const id of PLAN_IDS) assert.equal(buildsPerMonth(id), PLAN_TABLE[id].approxBuilds);
});

test('the build cost table converts to the doc dollars at CREDIT_USD', () => {
  const cents = (credits) => Math.round(credits * CREDIT_USD * 100) / 100;
  const byId = Object.fromEntries(BUILD_COSTS.map((b) => [b.id, b]));
  assert.deepEqual([cents(byId.small.creditsLow), cents(byId.small.creditsHigh)], [0.03, 0.07]);
  assert.equal(cents(byId.typical.creditsLow), 0.07);
  assert.deepEqual([cents(byId.big.creditsLow), cents(byId.big.creditsHigh)], [0.2, 0.6]);
  assert.equal(byId.typical.creditsLow, TYPICAL_BUILD_CREDITS);
  assert.equal(byId.big.estimated, true, 'the big-build figure is an estimate and is marked as one');
  assert.equal(byId.small.estimated, false);
});

// ---------------------------------------------------------------- 4. the enforcement

test('QuotaDO enforcement reads the table: Free is 5 credits a day and 30 a month, in ledger units', () => {
  const free = PLAN_LIMITS.free;
  assert.equal(free.creditsPerDay, 750);
  assert.equal(free.creditsPerMonth, 4_500);
  const at = Date.parse('2026-10-04T12:00:00Z');
  const fresh = math.quotaState({ plan: 'free', spentToday: 0, spentThisMonth: 0, credits: 0, now: at });
  assert.equal(fresh.creditsDaily, 750);
  assert.equal(fresh.creditsMonthly, 4_500);
  assert.equal(fresh.allowanceRemaining, 750);
  const dayUsed = math.quotaState({ plan: 'free', spentToday: 750, spentThisMonth: 750, credits: 0, now: at });
  assert.equal(dayUsed.allowanceRemaining, 0, 'the day stops at 5 credits');
  // Six full days is the whole month, so on a fresh day the month is what refuses.
  const monthUsed = math.quotaState({ plan: 'free', spentToday: 0, spentThisMonth: 4_500, credits: 0, now: at + 86_400_000 });
  assert.equal(monthUsed.allowanceRemaining, 0, 'the month stops at 30 credits even on a fresh day');
});

test('the real QuotaDO refuses a Free spend past 5 credits in a day and reports the new limits', async () => {
  const { QuotaDO } = await bundle(join(WORKER, 'src', 'do', 'quota.ts'), 'quota.mjs', [
    `--alias:cloudflare:workers=${join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs')}`,
  ]);
  const rows = [];
  const store = new Map();
  const nil = { toArray: () => [], one: () => null };
  const sql = {
    exec(q, ...a) {
      if (/^\s*(create|alter) table/i.test(q)) return nil;
      if (/insert into ledger/i.test(q)) { rows.push({ day: a[0], kind: a[1], credits: a[2] }); return nil; }
      if (/delete from ledger where day </i.test(q)) return nil;
      if (/where day = \?/.test(q)) return { one: () => ({ s: rows.filter((r) => r.day === a[0]).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      if (/where day like \?/.test(q)) {
        const p = String(a[0]).replace('%', '');
        return { one: () => ({ s: rows.filter((r) => r.day.startsWith(p)).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      }
      return { toArray: () => [], one: () => ({ s: 0 }) };
    },
  };
  const storage = {
    async get(k) { return store.get(k); },
    async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v); else store.set(a, b); },
    async delete(k) { store.delete(k); },
    sql,
  };
  const o = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (path, body) =>
    (await o.fetch(new Request(`https://do${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : {}))).json();

  const state = await call('/state');
  assert.equal(state.plan, 'free');
  assert.equal(state.creditsDaily, 5 * INTERNAL_PER_CREDIT);
  assert.equal(state.creditsMonthly, 30 * INTERNAL_PER_CREDIT);

  const first = await call('/spend', { credits: 750, kind: 'usage_agent' });
  assert.equal(first.ok, true, 'exactly 5 credits is affordable');
  assert.equal((await call('/state')).allowanceRemaining, 0);
  const over = await call('/spend', { credits: 1, kind: 'usage_agent' });
  assert.equal(over.ok, false, 'one ledger unit past 5 credits is refused');
});

/**
 * Does `src` (comments out) write `figure` as a literal? Numeric separators are read first: `4_500` is the number
 * 4500 and `\b4500\b` does not match it, so a restated limit spelled the way this codebase spells its big numbers
 * (see the 4_500 below) got through.
 */
const writesFigure = (src, figure) =>
  new RegExp(`\\b${figure}\\b`).test(
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/(?<=\d)_(?=\d)/g, ''),
  );

test('the literal scan reads a number as it is spelled: 4500, 4_500 and 1_2_3_4 are all the figure', () => {
  assert.equal(writesFigure('const m = 4500;', 4500), true);
  assert.equal(writesFigure('const m = 4_500;', 4500), true, 'a numeric separator hid the figure');
  assert.equal(writesFigure('const m = 1_2_3_4;', 1234), true);
  assert.equal(writesFigure('const m = 14_500;', 4500), false, 'the tail of a longer number is not the figure');
  assert.equal(writesFigure('const m = 4_5000;', 4500), false);
  assert.equal(writesFigure('// was 4_500\nconst m = 1;', 4500), false, 'a comment is not a literal');
});

test('the DO and the arithmetic carry no plan figure of their own', () => {
  for (const file of ['src/do/quota.ts', 'src/quota-math.ts']) {
    const src = readFileSync(join(WORKER, file), 'utf8');
    for (const id of PLAN_IDS) {
      for (const figure of [PLAN_LIMITS[id].creditsPerDay, PLAN_LIMITS[id].creditsPerMonth]) {
        assert.equal(writesFigure(src, figure), false, `${file} restates ${figure}, a ${id} limit`);
      }
    }
  }
  assert.match(readFileSync(join(WORKER, 'src/quota-math.ts'), 'utf8'), /PLAN_LIMITS\[i\.plan\]/);
});

test('every plan fits under the whole-service daily ceiling, which this change leaves alone', () => {
  for (const id of PLAN_IDS) {
    const neuronsADay = PLAN_LIMITS[id].creditsPerDay * NEURONS_PER_CREDIT;
    assert.ok(neuronsADay <= DAILY_NEURON_CEILING, `${id} grants ${neuronsADay} neurons a day against a ${DAILY_NEURON_CEILING} ceiling`);
  }
  // The headroom, stated as a number instead of a hope: how many Free accounts spending their whole
  // day the ceiling serves. It was 23 at 231 a day and is 7 at 750.
  const freeNeuronsADay = PLAN_LIMITS.free.creditsPerDay * NEURONS_PER_CREDIT;
  assert.equal(Math.floor(DAILY_NEURON_CEILING / freeNeuronsADay), 7);
  assert.ok(PLAN_TABLE.builder.creditsPerDay >= PLAN_TABLE.free.creditsPerDay, 'a paid plan never grants less per day than Free');
  assert.ok(PLAN_TABLE.studio.creditsPerDay >= BUILD_COSTS.find((b) => b.id === 'big').creditsHigh, 'a paid day affords the biggest estimated build');
});
