// Tests for the plan-economics simulator (packages/evals/src/economics.mjs).
//
// Two jobs:
//   1. Assert the arithmetic on small worked examples, computed by hand here so
//      a silent change to a formula fails loudly.
//   2. Pin the simulator to the PUBLISHED plan. The Free allowance constants
//      must equal the documented 60 Credits/day / 900 Credits/month and 1 Credit
//      must equal 30 neurons, so this internal model can never drift away from
//      what the pricing page promises without a test going red.
//
// Run: node --test packages/evals/src/economics.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  USD_PER_NEURON,
  NEURONS_PER_CREDIT,
  FREE_NEURONS_PER_DAY_ACCOUNT_WIDE,
  BILLABLE_NEURONS_PER_DAY,
  BILLABLE_NEURONS_PER_MONTH,
  DAILY_NEURON_CEILING,
  MAX_NEURONS_PER_REQUEST,
  WORKERS_PAID_USD_PER_MONTH,
  HARD_MAX_USD_PER_MONTH,
  maxBillableNeuronsPerMonth,
  maxUsdPerMonth,
  SIM_DAYS_PER_MONTH,
  CLAY_QUESTION_NEURONS,
  STONE_SMALL_EDIT_NEURONS,
  STONE_DEBUG_NEURONS,
  RUNE_NEURONS,
  STONE_FULL_BUILD_NEURONS,
  MEMORY_DISTILL_NEURONS,
  DOC_SEARCH_NEURONS,
  GATED_BUILD_STEPS,
  NEURONS_PER_AGENT_STEP,
  VISUAL_CRITIQUE_NEURONS,
  CRITIQUES_PER_GATED_BUILD,
  GATED_BUILD_NEURONS,
  DOCUMENTED_GATED_BUILD_NEURONS,
  PROVIDER_REQUESTS_PER_MIN,
  PEAK_HOUR_SHARE_OF_DAY,
  PEAK_MINUTE_BURSTINESS,
  TASK_MIX,
  TASK_KINDS,
  PLANS,
  ACTIVITY_LEVELS,
  TARGET_GROSS_MARGIN,
  taskNeurons,
  blendedTaskNeurons,
  blendedRequestsPerTask,
  neuronsPerRequest,
  largestSingleRequestNeurons,
  unservableKinds,
  creditsFor,
  usd,
  breakEvenPrice,
  grossMargin,
  queueModel,
  makeRng,
  simulateUserMonth,
  simulateCohort,
  simulateScenario,
  allowanceCeilingUsdPerUserPerMonth,
  report,
} from './economics.mjs';

const near = (actual, expected, tol, msg) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? 'value'}: expected ${expected} +/- ${tol}, got ${actual}`,
  );

// ---------------------------------------------------------------------------
// The published-plan guard. If any of these fail, the simulator has drifted
// from the plan the site sells and its output must not be trusted.
// ---------------------------------------------------------------------------

test('Free allowance matches the documented published plan exactly', () => {
  assert.equal(PLANS.free.creditsPerDay, 60, 'Free is documented as 60 Credits/day');
  assert.equal(PLANS.free.creditsPerMonth, 900, 'Free is documented as 900 Credits/month');
  assert.equal(PLANS.free.published, true, 'Free must be flagged as the real, published plan');
});

test('1 Credit is 30 neurons, so Free is 1,800 neurons/day', () => {
  assert.equal(NEURONS_PER_CREDIT, 30);
  assert.equal(PLANS.free.creditsPerDay * NEURONS_PER_CREDIT, 1_800);
});

test('Pro and Max are flagged hypothetical, never published', () => {
  assert.equal(PLANS.pro.published, false);
  assert.equal(PLANS.max.published, false);
});

test('a quality-gated build does not fit in a Free day', () => {
  // The documented fact: 60 Credits/day = 1,800 neurons/day, and one gated build
  // is ~2,300-2,400 neurons. It must not fit, in Credits or in neurons.
  const build = taskNeurons('visual_build');
  assert.ok(build > PLANS.free.creditsPerDay * NEURONS_PER_CREDIT, 'gated build exceeds a Free day in neurons');
  assert.ok(creditsFor(build) > PLANS.free.creditsPerDay, 'gated build exceeds a Free day in Credits');
  assert.deepEqual(unservableKinds('free'), ['visual_build']);
  assert.deepEqual(unservableKinds('pro'), []);
});

// ---------------------------------------------------------------------------
// Billing primitives — worked by hand.
// ---------------------------------------------------------------------------

test('USD_PER_NEURON is $0.011 per 1,000 neurons', () => {
  near(USD_PER_NEURON, 0.000011, 1e-12, 'USD_PER_NEURON');
  // 1,000,000 neurons -> $11.00
  near(usd(1_000_000), 11.0, 1e-9, 'usd(1e6)');
});

test('usd() worked example: 2,442 neurons = $0.026862', () => {
  // 2442 * 0.000011 = 0.026862
  near(usd(2442), 0.026862, 1e-9, 'usd(2442)');
});

test('creditsFor() rounds up and has a floor of 1', () => {
  assert.equal(creditsFor(0), 1, 'a served request always costs at least 1 Credit');
  assert.equal(creditsFor(1), 1);
  assert.equal(creditsFor(30), 1); // exactly 30 -> 1
  assert.equal(creditsFor(31), 2); // ceil(31/30) = 2
  assert.equal(creditsFor(2442), 82); // ceil(2442/30) = ceil(81.4) = 82
});

test('the hard monthly ceiling is $10.06 and is not moved by this file', () => {
  // 460,000 billable neurons * $0.000011 = $5.06, plus $5.00 Workers Paid.
  near(BILLABLE_NEURONS_PER_MONTH * USD_PER_NEURON, 5.06, 1e-9, 'AI portion');
  near(HARD_MAX_USD_PER_MONTH, 10.06, 1e-9, 'hard max');
  assert.equal(WORKERS_PAID_USD_PER_MONTH, 5.0);
});

test('service gate constants match apps/worker/src/pricing.ts', () => {
  assert.equal(FREE_NEURONS_PER_DAY_ACCOUNT_WIDE, 10_000);
  assert.equal(BILLABLE_NEURONS_PER_DAY, 15_000);
  assert.equal(BILLABLE_NEURONS_PER_MONTH, 460_000);
  assert.equal(DAILY_NEURON_CEILING, 25_000);
  assert.equal(MAX_NEURONS_PER_REQUEST, 1_200);
});

// ---------------------------------------------------------------------------
// Task costs — every composite recomputed by hand from the measured parts.
// ---------------------------------------------------------------------------

test('measured per-request costs are the documented ones', () => {
  assert.equal(CLAY_QUESTION_NEURONS, 40); // 37-43 midpoint
  assert.equal(STONE_SMALL_EDIT_NEURONS, 111);
  assert.equal(STONE_DEBUG_NEURONS, 241);
  assert.equal(RUNE_NEURONS, 297);
  assert.equal(STONE_FULL_BUILD_NEURONS, 511);
  assert.equal(MEMORY_DISTILL_NEURONS, 21);
  assert.equal(DOC_SEARCH_NEURONS, 1);
  assert.equal(VISUAL_CRITIQUE_NEURONS, 67); // 63-72 midpoint
  assert.equal(NEURONS_PER_AGENT_STEP, 145); // 140 high / 155 low, blended
  assert.equal(GATED_BUILD_STEPS, 16);
});

test('gated build composite: 16*145 + 1.5*67 = 2,420.5', () => {
  assert.equal(GATED_BUILD_NEURONS, 16 * 145 + 1.5 * 67);
  near(GATED_BUILD_NEURONS, 2420.5, 1e-9, 'gated build');
  // Reconciles with the documented "~2,300" to within 10%.
  const drift = Math.abs(GATED_BUILD_NEURONS - DOCUMENTED_GATED_BUILD_NEURONS) / DOCUMENTED_GATED_BUILD_NEURONS;
  assert.ok(drift < 0.1, `gated build drifts ${(drift * 100).toFixed(1)}% from the documented 2,300`);
  assert.equal(CRITIQUES_PER_GATED_BUILD, 1.5);
});

test('taskNeurons() adds the right overheads, worked by hand', () => {
  // question: 40 base, no memory distillation, + 0.6 expected doc-search = 40.6 -> 41
  assert.equal(taskNeurons('question'), 41);
  // small_edit: 111 + 21 memory + 0.5 = 132.5 -> 133
  assert.equal(taskNeurons('small_edit'), 133);
  // debugging: 241 + 21 + 0.8 = 262.8 -> 263
  assert.equal(taskNeurons('debugging'), 263);
  // rune: 297 + 21 + 0.5 = 318.5 -> 319 (round-half-up)
  assert.equal(taskNeurons('rune'), 319);
  // normal_build: 511 + 21 + 0.9 = 532.9 -> 533
  assert.equal(taskNeurons('normal_build'), 533);
  // visual_build: 2420.5 + 21 + 0.9 = 2442.4 -> 2442
  assert.equal(taskNeurons('visual_build'), 2442);
});

test('taskNeurons() rejects an unknown kind', () => {
  assert.throws(() => taskNeurons('nope'), /unknown task kind/);
});

test('the task mix is a real distribution', () => {
  const total = TASK_KINDS.reduce((s, k) => s + TASK_MIX[k].share, 0);
  near(total, 1.0, 1e-12, 'shares must sum to 1');
  for (const k of TASK_KINDS) {
    assert.ok(TASK_MIX[k].share > 0 && TASK_MIX[k].share < 1, `${k} share in (0,1)`);
    assert.ok(TASK_MIX[k].requests >= 1, `${k} makes at least one request`);
  }
});

test('blended cost per task, worked by hand from the mix', () => {
  // 0.45*41 + 0.25*133 + 0.08*263 + 0.04*319 + 0.12*533 + 0.06*2442
  // = 18.45 + 33.25 + 21.04 + 12.76 + 63.96 + 146.52 = 295.98
  near(blendedTaskNeurons(), 295.98, 1e-9, 'blended neurons/task');
  // 0.45*1 + 0.25*1 + 0.08*2 + 0.04*2 + 0.12*4 + 0.06*18 = 2.50
  near(blendedRequestsPerTask(), 2.5, 1e-9, 'blended requests/task');
});

test('no single inference call can breach the per-request gate', () => {
  for (const k of TASK_KINDS) {
    assert.ok(
      neuronsPerRequest(k) < MAX_NEURONS_PER_REQUEST,
      `${k} averages ${neuronsPerRequest(k)} neurons/call against a ${MAX_NEURONS_PER_REQUEST} cap`,
    );
  }
  // rune: 319 neurons over 2 calls = 159.5, the largest in the mix.
  near(largestSingleRequestNeurons(), 159.5, 1e-9, 'largest single call');
});

// ---------------------------------------------------------------------------
// A hand-computed user-day, so the allowance logic is pinned.
// ---------------------------------------------------------------------------

test('worked example: two questions and one small edit in a Free day', () => {
  // 2 questions at 41 neurons -> creditsFor(41) = ceil(41/30) = 2 Credits each
  // 1 small edit at 133 neurons -> ceil(133/30) = ceil(4.43) = 5 Credits
  // total 2*2 + 5 = 9 Credits, 2*41 + 133 = 215 neurons, $0.002365
  const q = taskNeurons('question');
  const e = taskNeurons('small_edit');
  assert.equal(creditsFor(q), 2);
  assert.equal(creditsFor(e), 5);
  const credits = 2 * creditsFor(q) + creditsFor(e);
  const neurons = 2 * q + e;
  assert.equal(credits, 9);
  assert.equal(neurons, 215);
  near(usd(neurons), 0.002365, 1e-9, 'cost of the day');
  assert.ok(credits <= PLANS.free.creditsPerDay, 'this day fits inside Free');
  // ...and 30 such days would breach the 900/month cap: 9 * 30 = 270. It does not.
  assert.ok(credits * SIM_DAYS_PER_MONTH <= PLANS.free.creditsPerMonth, '270 Credits fits in 900/month');
});

test('worked example: one gated build alone busts a Free day', () => {
  const build = taskNeurons('visual_build');
  assert.equal(creditsFor(build), 82);
  assert.ok(82 > PLANS.free.creditsPerDay);
  // On Pro it fits with room: 82 of 400.
  assert.ok(82 <= PLANS.pro.creditsPerDay);
});

// ---------------------------------------------------------------------------
// Margin arithmetic.
// ---------------------------------------------------------------------------

test('breakEvenPrice() inverts grossMargin()', () => {
  near(breakEvenPrice(1.0, 0.8), 5.0, 1e-12, '1 / (1 - 0.8)');
  near(breakEvenPrice(2.5, 0.5), 5.0, 1e-12, '2.5 / (1 - 0.5)');
  assert.equal(breakEvenPrice(3.0, 0), 3.0);
  near(grossMargin(5.0, 1.0), 0.8, 1e-12, 'margin at $5 on $1 cost');
  for (const cost of [0.05, 0.5, 1.98, 13.2]) {
    near(grossMargin(breakEvenPrice(cost), cost), TARGET_GROSS_MARGIN, 1e-12, `round trip at ${cost}`);
  }
});

test('breakEvenPrice() rejects impossible margins', () => {
  assert.throws(() => breakEvenPrice(1, 1), /margin/);
  assert.throws(() => breakEvenPrice(1, 1.2), /margin/);
  assert.throws(() => breakEvenPrice(1, -0.1), /margin/);
});

test('allowance ceilings, worked by hand', () => {
  // Free: min(60*30, 900) = 900 Credits = 27,000 neurons = $0.297
  near(allowanceCeilingUsdPerUserPerMonth('free'), 0.297, 1e-9, 'free ceiling');
  // Pro: min(400*30, 6000) = 6,000 Credits = 180,000 neurons = $1.98
  near(allowanceCeilingUsdPerUserPerMonth('pro'), 1.98, 1e-9, 'pro ceiling');
  // Max: min(2000*30, 40000) = 40,000 Credits = 1,200,000 neurons = $13.20
  near(allowanceCeilingUsdPerUserPerMonth('max'), 13.2, 1e-9, 'max ceiling');
  // and their break-even prices at the 80% target
  near(breakEvenPrice(1.98), 9.9, 1e-9, 'pro worst-case break-even');
  near(breakEvenPrice(13.2), 66.0, 1e-9, 'max worst-case break-even');
});

// ---------------------------------------------------------------------------
// Queueing.
// ---------------------------------------------------------------------------

test('queueModel() peak arithmetic, worked by hand', () => {
  assert.equal(PROVIDER_REQUESTS_PER_MIN, 30);
  assert.equal(PEAK_HOUR_SHARE_OF_DAY, 0.15);
  assert.equal(PEAK_MINUTE_BURSTINESS, 2.0);
  // 12,000 req/day * 0.15 * 2 / 60 = 60 req/min -> 2.0x the 30/min ceiling
  const q = queueModel(12_000);
  near(q.peakPerMin, 60, 1e-9, 'peak/min');
  near(q.utilization, 2.0, 1e-9, 'utilization');
  assert.equal(q.saturated, true);
  assert.equal(q.meanQueueWaitSec, null);
  // peak hour offers 1,800 requests against 1,800 capacity... at 12k/day the
  // hour offers 12000*0.15 = 1,800 and capacity is 30*60 = 1,800, so backlog 0.
  near(q.backlogRequests, 0, 1e-9, 'backlog');
});

test('queueModel() below saturation returns a finite wait', () => {
  // 3,000 req/day * 0.15 * 2 / 60 = 15 req/min -> rho = 0.5
  const q = queueModel(3_000);
  near(q.peakPerMin, 15, 1e-9, 'peak/min');
  near(q.utilization, 0.5, 1e-9, 'utilization');
  assert.equal(q.saturated, false);
  // Wq = rho / (mu (1-rho)) = 0.5 / (30 * 0.5) = 0.03333 min = 2.0s
  near(q.meanQueueWaitSec, 2.0, 1e-9, 'queue wait');
});

test('queueModel() accumulates a backlog past the hour capacity', () => {
  // 24,000 req/day -> peak hour offers 3,600 against 1,800 capacity -> 1,800 backlog
  const q = queueModel(24_000);
  assert.equal(q.saturated, true);
  near(q.backlogRequests, 1_800, 1e-9, 'backlog');
  near(q.backlogDrainMinutes, 60, 1e-9, 'drain minutes'); // 1800 / 30
});

test('queueModel() is quiet at zero traffic', () => {
  const q = queueModel(0);
  assert.equal(q.saturated, false);
  assert.equal(q.peakPerMin, 0);
  assert.equal(q.meanQueueWaitSec, 0);
});

// ---------------------------------------------------------------------------
// Simulation behaviour.
// ---------------------------------------------------------------------------

test('makeRng() is deterministic and in range', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i += 1) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('simulateUserMonth() never lets a user exceed their allowance', () => {
  for (const plan of Object.keys(PLANS)) {
    for (const activity of Object.keys(ACTIVITY_LEVELS)) {
      const rnd = makeRng(7);
      const u = simulateUserMonth({ plan, tasksPerDay: ACTIVITY_LEVELS[activity].tasksPerDay, rnd });
      assert.ok(
        u.creditsThisMonth <= PLANS[plan].creditsPerMonth,
        `${plan}/${activity}: ${u.creditsThisMonth} Credits exceeds the ${PLANS[plan].creditsPerMonth} monthly allowance`,
      );
      assert.ok(u.servedNeurons <= u.demandNeurons, 'served can never exceed demand');
      assert.ok(u.servedTasks <= u.demandTasks, 'served tasks can never exceed demanded tasks');
      assert.ok(u.daysBlocked >= 0 && u.daysBlocked <= SIM_DAYS_PER_MONTH);
    }
  }
});

test('simulateUserMonth() rejects an unknown plan', () => {
  assert.throws(() => simulateUserMonth({ plan: 'enterprise', tasksPerDay: 1, rnd: makeRng(1) }), /unknown plan/);
});

test('a zero-activity user costs nothing', () => {
  const u = simulateUserMonth({ plan: 'free', tasksPerDay: 0, rnd: makeRng(3) });
  assert.equal(u.demandTasks, 0);
  assert.equal(u.servedNeurons, 0);
  assert.equal(u.hitAllowance, false);
});

test('heavier activity never reduces demand (monotonicity)', () => {
  const seen = Object.keys(ACTIVITY_LEVELS).map(
    (a) => simulateCohort({ plan: 'max', activity: a, sample: 120 }).demandNeuronsPerActiveUser,
  );
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `demand must rise from ${seen[i - 1]} to ${seen[i]}`);
  }
});

test('a tighter plan serves no more than a looser one at the same activity', () => {
  const free = simulateCohort({ plan: 'free', activity: 'heavy', sample: 150 });
  const pro = simulateCohort({ plan: 'pro', activity: 'heavy', sample: 150 });
  const max = simulateCohort({ plan: 'max', activity: 'heavy', sample: 150 });
  assert.ok(free.servedNeuronsPerActiveUser < pro.servedNeuronsPerActiveUser);
  assert.ok(pro.servedNeuronsPerActiveUser < max.servedNeuronsPerActiveUser);
  assert.ok(free.fractionHittingAllowance >= pro.fractionHittingAllowance);
  assert.ok(pro.fractionHittingAllowance >= max.fractionHittingAllowance);
  for (const c of [free, pro, max]) {
    assert.ok(c.fractionHittingAllowance >= 0 && c.fractionHittingAllowance <= 1);
  }
});

test('simulateScenario() is deterministic for a fixed seed', () => {
  const a = simulateScenario({ plan: 'pro', activity: 'typical', users: 1_000, sample: 100 });
  const b = simulateScenario({ plan: 'pro', activity: 'typical', users: 1_000, sample: 100 });
  assert.equal(a.serviceNeuronsPerDay, b.serviceNeuronsPerDay);
  assert.equal(a.marginalUsdPerUserPerMonth, b.marginalUsdPerUserPerMonth);
  assert.equal(a.fractionHittingAllowance, b.fractionHittingAllowance);
});

test('per-user cost scales linearly with population, service cost does not', () => {
  const small = simulateScenario({ plan: 'pro', activity: 'typical', users: 100, sample: 100 });
  const big = simulateScenario({ plan: 'pro', activity: 'typical', users: 10_000, sample: 100 });
  // Marginal per-user cost is population-independent by construction.
  near(small.marginalUsdPerUserPerMonth, big.marginalUsdPerUserPerMonth, 1e-12, 'marginal cost/user');
  // 100x the users is 100x the demand.
  near(big.serviceNeuronsPerDay / small.serviceNeuronsPerDay, 100, 1e-9, 'demand scaling');
  // The shared free allocation is worth less per user as the base grows.
  assert.ok(big.allocatedUsdPerUserPerMonth > small.allocatedUsdPerUserPerMonth * 0.9);
});

test('the shipped spend gates cap the bill at the hard maximum, always', () => {
  for (const plan of Object.keys(PLANS)) {
    for (const activity of Object.keys(ACTIVITY_LEVELS)) {
      for (const users of [100, 1_000, 10_000]) {
        const s = simulateScenario({ plan, activity, users, sample: 60 });
        assert.ok(
          s.totalCappedUsdPerMonth <= HARD_MAX_USD_PER_MONTH + 1e-9,
          `${plan}/${activity}/${users}: capped bill ${s.totalCappedUsdPerMonth} exceeds the ${HARD_MAX_USD_PER_MONTH} ceiling`,
        );
        assert.ok(s.cappedNeuronsPerDay <= DAILY_NEURON_CEILING + 1e-9, 'daily ceiling holds');
        assert.ok(s.demandServedFraction > 0 && s.demandServedFraction <= 1 + 1e-9);
      }
    }
  }
});

test('the two spend gates compose, and the tighter one wins', () => {
  // daily gate over a 30-day month: 15,000 * 30 = 450,000
  // monthly backstop:                            460,000
  assert.equal(maxBillableNeuronsPerMonth(30), 450_000);
  near(maxUsdPerMonth(30), 9.95, 1e-9, '450,000 * $0.000011 + $5.00');
  // Give the month enough days and the monthly backstop becomes the binding gate.
  assert.equal(maxBillableNeuronsPerMonth(40), BILLABLE_NEURONS_PER_MONTH);
  near(maxUsdPerMonth(40), HARD_MAX_USD_PER_MONTH, 1e-9, 'monthly backstop = the documented $10.06');
  // Whatever the month length, the documented maximum is never exceeded.
  for (const days of [1, 28, 30, 30.4, 31, 60, 365]) {
    assert.ok(
      maxUsdPerMonth(days) <= HARD_MAX_USD_PER_MONTH + 1e-9,
      `${days} days reaches ${maxUsdPerMonth(days)}, above the ${HARD_MAX_USD_PER_MONTH} ceiling`,
    );
  }
});

test('demand beyond the ceiling shows up as unserved, not as spend', () => {
  const s = simulateScenario({ plan: 'max', activity: 'heavy', users: 10_000, sample: 60 });
  assert.ok(s.serviceNeuronsPerDay > DAILY_NEURON_CEILING * 100, 'this scenario is wildly over the ceiling');
  assert.ok(s.demandServedFraction < 0.05, 'so almost none of it is served');
  // The bill is pinned at what the gates permit in a 30-day month, not at the
  // demand, and not above the documented hard maximum.
  near(s.totalCappedUsdPerMonth, maxUsdPerMonth(), 1e-9, 'bill pinned at the gate');
  assert.ok(s.totalCappedUsdPerMonth <= HARD_MAX_USD_PER_MONTH);
});

// ---------------------------------------------------------------------------
// The report itself must render and must keep saying what it is.
// ---------------------------------------------------------------------------

test('report() renders and is labelled an internal model', () => {
  const text = report();
  assert.match(text, /INTERNAL MODEL ONLY/);
  assert.match(text, /Not public pricing/);
  assert.match(text, /PUBLISHED PLAN/);
  assert.match(text, /\$10\.06/, 'the hard ceiling must appear verbatim');
  for (const k of TASK_KINDS) assert.ok(text.includes(TASK_MIX[k].label), `${k} appears in the report`);
  for (const u of ['100', '1,000', '10,000']) assert.ok(text.includes(u), `${u} users appears`);
  for (const a of Object.keys(ACTIVITY_LEVELS)) assert.ok(text.includes(a), `${a} activity appears`);
  assert.ok(text.length > 3_000, 'report is substantive');
});
