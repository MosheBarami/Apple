#!/usr/bin/env node
// =============================================================================
// Golem plan-economics simulator  —  INTERNAL MODEL ONLY.
//
// THIS FILE DOES NOT SET, CHANGE, OR PUBLISH PRICING.
// The public plan (Free = 60 Credits/day, 900/month) and the shipped worker
// constants in apps/worker/src/pricing.ts are the single source of truth. This
// simulator READS those documented numbers and asks "what would it cost, and
// what would it have to sell for" under hypothetical Pro/Max tiers that do not
// exist as products. Nothing here is a commitment and nothing here is deployed.
//
// It performs no network I/O and spends nothing. Run it with:
//     node packages/evals/src/economics.mjs
//
// EVERY assumption below is a named constant tagged MEASURED or ASSUMED.
//   MEASURED = observed against the live service and recorded in
//              docs/COST-MODEL.md or apps/worker/src/pricing.ts.
//   ASSUMED  = a modelling choice made here. Not evidence. Change it and the
//              whole table moves; that is the point of naming it.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Billing primitives
// -----------------------------------------------------------------------------

/**
 * THESE ARE RE-EXPORTS, NOT COPIES. Read this before adding a constant below.
 *
 * Every value here used to be a hand-typed literal carrying a `MEASURED — pricing.ts X` comment,
 * and `economics.test.mjs` then asserted those literals equalled... the same literals. Neither file
 * imported `pricing.ts`, so the test could not fail: raising a spend cap in the worker shipped green
 * while this model — and the public pricing page derived from it — kept describing the old ceiling.
 * A regression test that cannot observe the thing it guards is worse than no test, because it is
 * read as coverage.
 *
 * `apps/worker/src/pricing.ts` is the single source of truth. It has no imports of its own, and
 * Node strips its types on load, so importing it here costs nothing and makes the guard real.
 */
export {
  USD_PER_NEURON,
  NEURONS_PER_CREDIT,
  BILLABLE_NEURONS_PER_DAY,
  BILLABLE_NEURONS_PER_MONTH,
  MAX_NEURONS_PER_REQUEST,
  DAILY_NEURON_CEILING,
} from '../../../apps/worker/src/pricing.ts';

import {
  FREE_NEURONS_PER_DAY,
  USD_PER_NEURON as _USD_PER_NEURON,
  NEURONS_PER_CREDIT as _NEURONS_PER_CREDIT,
  BILLABLE_NEURONS_PER_DAY as _BILLABLE_NEURONS_PER_DAY,
  BILLABLE_NEURONS_PER_MONTH as _BILLABLE_NEURONS_PER_MONTH,
  MAX_NEURONS_PER_REQUEST as _MAX_NEURONS_PER_REQUEST,
  DAILY_NEURON_CEILING as _DAILY_NEURON_CEILING,
} from '../../../apps/worker/src/pricing.ts';

/**
 * Cloudflare's included allowance is per ACCOUNT, not per Apple user — at any real scale it rounds
 * to nothing. The name is kept explicit here because the simulator repeatedly needs to reason about
 * that distinction, which `FREE_NEURONS_PER_DAY` alone does not convey.
 */
export const FREE_NEURONS_PER_DAY_ACCOUNT_WIDE = FREE_NEURONS_PER_DAY;

// Local aliases so the rest of this module reads unchanged.
const USD_PER_NEURON = _USD_PER_NEURON;
const NEURONS_PER_CREDIT = _NEURONS_PER_CREDIT;
const BILLABLE_NEURONS_PER_DAY = _BILLABLE_NEURONS_PER_DAY;
const BILLABLE_NEURONS_PER_MONTH = _BILLABLE_NEURONS_PER_MONTH;
const MAX_NEURONS_PER_REQUEST = _MAX_NEURONS_PER_REQUEST;
const DAILY_NEURON_CEILING = _DAILY_NEURON_CEILING;

/** MEASURED — Workers Paid flat fee. Fixed cost, excluded from gross margin. */
export const WORKERS_PAID_USD_PER_MONTH = 5.0;

/** MEASURED — the hard monthly ceiling that must never move:
 *  460,000 neurons x $0.000011 = $5.06 of AI, plus $5.00 Workers Paid = $10.06. */
export const HARD_MAX_USD_PER_MONTH =
  BILLABLE_NEURONS_PER_MONTH * USD_PER_NEURON + WORKERS_PAID_USD_PER_MONTH;

/**
 * Two independent gates cap the month, and the tighter one wins:
 *   daily gate   15,000/day x SIM_DAYS_PER_MONTH days = 450,000 neurons
 *   monthly gate                                        460,000 neurons
 * So the simulator's worst case lands at $9.95, slightly UNDER the documented
 * $10.06. The ceiling has not moved and nothing here relaxes it: $10.06 is the
 * monthly backstop's own value, reachable only in a month long enough for the
 * daily gate to sum past it (30.4 x 15,000 = 456,000, still under 460,000).
 * $10.06 remains the number to quote as the maximum; $9.95 is what a 30-day
 * month can actually reach. Under, never over.
 */
export function maxBillableNeuronsPerMonth(days = SIM_DAYS_PER_MONTH) {
  return Math.min(BILLABLE_NEURONS_PER_DAY * days, BILLABLE_NEURONS_PER_MONTH);
}

export function maxUsdPerMonth(days = SIM_DAYS_PER_MONTH) {
  return maxBillableNeuronsPerMonth(days) * USD_PER_NEURON + WORKERS_PAID_USD_PER_MONTH;
}

/** ASSUMED — simulation grain. The $10.06 ceiling is derived elsewhere with a
 *  30.4-day month; the monthly caps applied here are absolute neuron counts, so
 *  the day count only affects how demand is spread, not the ceiling. */
export const SIM_DAYS_PER_MONTH = 30;

// -----------------------------------------------------------------------------
// 2. Per-request measured costs (docs/COST-MODEL.md, 2026-08-30 / 08-31)
// -----------------------------------------------------------------------------

/** MEASURED — Clay question with Studio attached: 37-43 neurons. Midpoint. */
export const CLAY_QUESTION_NEURONS = 40;
/** MEASURED — Stone targeted edit + read-back verify in Studio. */
export const STONE_SMALL_EDIT_NEURONS = 111;
/** MEASURED — Stone inspect + playtest verify (the debugging shape). */
export const STONE_DEBUG_NEURONS = 241;
/** MEASURED — Rune build + read-back verify + playtest. */
export const RUNE_NEURONS = 297;
/** MEASURED — Stone full build + edit + verify, build-blind (no visual gate). */
export const STONE_FULL_BUILD_NEURONS = 511;
/** MEASURED — memory distillation after an agent run. */
export const MEMORY_DISTILL_NEURONS = 21;
/** MEASURED — docs search embedding, cached 24h. */
export const DOC_SEARCH_NEURONS = 1;

// --- the quality-gated (visual) build, built up from its measured parts ---
/** MEASURED — steps in a quality-gated build. */
export const GATED_BUILD_STEPS = 16;
/** MEASURED — neurons per agent step (140 at high, 155 at low; ~145 blended). */
export const NEURONS_PER_AGENT_STEP = 145;
/** MEASURED — one inspect_visually critique, 3 frames: 63-72 neurons. Midpoint. */
export const VISUAL_CRITIQUE_NEURONS = 67;
/** ASSUMED — 1-2 critiques per gated build is MEASURED; 1.5 is the midpoint. */
export const CRITIQUES_PER_GATED_BUILD = 1.5;

/**
 * 16 x 145 = 2,320, plus 1.5 x 67 = 100.5, = 2,420.5 neurons.
 * docs/COST-MODEL.md rounds this to "~2,300 ($0.025)". This file carries the
 * arithmetic out precisely rather than using the rounded figure; the two agree
 * to within 6%. That is the same measurement, not a contradiction of it.
 */
export const GATED_BUILD_NEURONS =
  GATED_BUILD_STEPS * NEURONS_PER_AGENT_STEP + CRITIQUES_PER_GATED_BUILD * VISUAL_CRITIQUE_NEURONS;

/** MEASURED (docs figure this is reconciled against). */
export const DOCUMENTED_GATED_BUILD_NEURONS = 2_300;

// -----------------------------------------------------------------------------
// 3. Provider throughput (for the queueing model)
// -----------------------------------------------------------------------------

/** MEASURED — sustained successful requests/minute with retry handling.
 *  Error 3021 is the rate-limit code that binds above this. */
export const PROVIDER_REQUESTS_PER_MIN = 30;

/** MEASURED — p95 latency under 6 concurrent requests (median was 2.0s).
 *  Used only to sanity-check the queue model's service time, not as an input. */
export const MEASURED_P95_SECONDS_AT_6_CONCURRENT = 17.3;

/** ASSUMED — share of a day's requests that land in the single busiest hour.
 *  Flat traffic would be 1/24 = 4.2%; 15% is a normal consumer-product peak. */
export const PEAK_HOUR_SHARE_OF_DAY = 0.15;

/** ASSUMED — burstiness of the busiest minute against the peak hour's average. */
export const PEAK_MINUTE_BURSTINESS = 2.0;

// -----------------------------------------------------------------------------
// 4. Task mix
// -----------------------------------------------------------------------------
//
// ASSUMED distribution. Stated explicitly so it can be argued with. The shape
// is "most interactions are cheap questions and small edits; full builds are
// rare and the visually-gated build is rarer still, because it is 6x the cost
// of a blind build." Shares sum to 1.0 (asserted in the test file).
//
// `memory: true`  -> the run ends with a memory distillation (21 neurons).
// `docSearchProb` -> ASSUMED probability the task triggers a docs-search embed
//                    (1 neuron). Applied as an expected value so the model is
//                    deterministic; a 1-neuron term cannot move any conclusion.
// `requests`      -> inference calls the task makes, which is what the provider
//                    rate limit actually meters. Derived as
//                    round(baseNeurons / NEURONS_PER_AGENT_STEP), floor 1,
//                    except the gated build whose 16 steps are MEASURED
//                    directly (+2 critique calls).

export const TASK_MIX = {
  question: {
    label: 'Clay question',
    share: 0.45, // ASSUMED
    baseNeurons: CLAY_QUESTION_NEURONS, // MEASURED
    memory: false,
    docSearchProb: 0.6, // ASSUMED
    requests: 1, // MEASURED shape: one call
  },
  small_edit: {
    label: 'Small edit (Stone)',
    share: 0.25, // ASSUMED
    baseNeurons: STONE_SMALL_EDIT_NEURONS, // MEASURED
    memory: true,
    docSearchProb: 0.5, // ASSUMED
    requests: 1,
  },
  debugging: {
    label: 'Debugging (inspect+playtest)',
    share: 0.08, // ASSUMED
    baseNeurons: STONE_DEBUG_NEURONS, // MEASURED
    memory: true,
    docSearchProb: 0.8, // ASSUMED
    requests: 2,
  },
  rune: {
    label: 'Rune work',
    share: 0.04, // ASSUMED
    baseNeurons: RUNE_NEURONS, // MEASURED
    memory: true,
    docSearchProb: 0.5, // ASSUMED
    requests: 2,
  },
  normal_build: {
    label: 'Normal build (blind)',
    share: 0.12, // ASSUMED
    baseNeurons: STONE_FULL_BUILD_NEURONS, // MEASURED
    memory: true,
    docSearchProb: 0.9, // ASSUMED
    requests: 4,
  },
  visual_build: {
    label: 'Visual build (quality-gated)',
    share: 0.06, // ASSUMED
    baseNeurons: GATED_BUILD_NEURONS, // MEASURED components
    memory: true,
    docSearchProb: 0.9, // ASSUMED
    requests: GATED_BUILD_STEPS + Math.ceil(CRITIQUES_PER_GATED_BUILD), // 18
  },
};

export const TASK_KINDS = Object.keys(TASK_MIX);

/** Total neurons a task of this kind costs, including its attached overheads. */
export function taskNeurons(kind) {
  const t = TASK_MIX[kind];
  if (!t) throw new Error(`unknown task kind: ${kind}`);
  return Math.round(t.baseNeurons + (t.memory ? MEMORY_DISTILL_NEURONS : 0) + t.docSearchProb * DOC_SEARCH_NEURONS);
}

/** Share-weighted mean neurons per task across the whole mix. */
export function blendedTaskNeurons() {
  return TASK_KINDS.reduce((sum, k) => sum + TASK_MIX[k].share * taskNeurons(k), 0);
}

/** Share-weighted mean inference requests per task (what the rate limit meters). */
export function blendedRequestsPerTask() {
  return TASK_KINDS.reduce((sum, k) => sum + TASK_MIX[k].share * TASK_MIX[k].requests, 0);
}

/** Mean neurons in a single inference call, per kind. Checked against MAX_NEURONS_PER_REQUEST. */
export function neuronsPerRequest(kind) {
  return taskNeurons(kind) / TASK_MIX[kind].requests;
}

/** The largest single inference call any task makes, across the whole mix. */
export function largestSingleRequestNeurons() {
  return Math.max(...TASK_KINDS.map(neuronsPerRequest));
}

/**
 * Task kinds a plan can NEVER serve, because one task costs more Credits than
 * the plan grants in a whole day. These are structural, not statistical: no
 * amount of patience gets the user this task on this plan.
 */
export function unservableKinds(plan) {
  const limit = PLANS[plan].creditsPerDay;
  return TASK_KINDS.filter((k) => creditsFor(taskNeurons(k)) > limit);
}

// -----------------------------------------------------------------------------
// 5. Plans
// -----------------------------------------------------------------------------
//
// free  = THE PUBLISHED PLAN. These constants mirror pricing.ts PLAN_LIMITS.free
//         exactly and the test file asserts they still match, so this simulator
//         can never silently drift from what the site promises.
// pro   = the allowance already published as "designed / waitlist" on the
//         pricing page. Modelled here; not sold.
// max   = ENTIRELY HYPOTHETICAL. Invented for this model. Does not exist.

export const PLANS = {
  free: { label: 'Free', creditsPerDay: 60, creditsPerMonth: 900, published: true },
  pro: { label: 'Pro (hypothetical)', creditsPerDay: 400, creditsPerMonth: 6_000, published: false },
  max: { label: 'Max (hypothetical)', creditsPerDay: 2_000, creditsPerMonth: 40_000, published: false }, // ASSUMED
};

/** MEASURED — mirrors pricing.ts creditsForNeurons(). */
export function creditsFor(neurons) {
  return Math.max(1, Math.ceil(neurons / NEURONS_PER_CREDIT));
}

export function usd(neurons) {
  return neurons * USD_PER_NEURON;
}

// -----------------------------------------------------------------------------
// 6. Activity levels
// -----------------------------------------------------------------------------

/** ASSUMED — tasks per ACTIVE user per day at each activity level. */
export const ACTIVITY_LEVELS = {
  light: { label: 'light', tasksPerDay: 3 },
  typical: { label: 'typical', tasksPerDay: 12 },
  heavy: { label: 'heavy', tasksPerDay: 40 },
};

/** ASSUMED — share of the signed-up base that is active on any given day. */
export const DAILY_ACTIVE_FRACTION = 0.3;

/** ASSUMED — lognormal spread of per-user intensity around the cohort mean.
 *  sigma 0.8 gives a realistic long tail (top decile ~2.6x the median). */
export const USER_INTENSITY_SIGMA = 0.8;

/** ASSUMED — Monte Carlo sample size per cohort. Results are seeded and stable. */
export const MC_SAMPLE_USERS = 400;

/** ASSUMED — RNG seed. Fixed so every run of this file prints the same table. */
export const SIM_SEED = 20260831;

// -----------------------------------------------------------------------------
// 7. Margin target
// -----------------------------------------------------------------------------

/** ASSUMED — target gross margin used for the break-even price column. */
export const TARGET_GROSS_MARGIN = 0.8;

/** price such that (price - cost) / price = margin */
export function breakEvenPrice(costPerUserPerMonth, targetMargin = TARGET_GROSS_MARGIN) {
  if (targetMargin >= 1 || targetMargin < 0) throw new Error('margin must be in [0, 1)');
  return costPerUserPerMonth / (1 - targetMargin);
}

export function grossMargin(price, costPerUserPerMonth) {
  if (price <= 0) return Number.NEGATIVE_INFINITY;
  return (price - costPerUserPerMonth) / price;
}

// -----------------------------------------------------------------------------
// 8. Deterministic RNG
// -----------------------------------------------------------------------------

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function standardNormal(rnd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Lognormal multiplier with mean exactly 1.0 for the given sigma. */
function intensityMultiplier(rnd, sigma = USER_INTENSITY_SIGMA) {
  return Math.exp(sigma * standardNormal(rnd) - (sigma * sigma) / 2);
}

function poisson(rnd, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 20) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * standardNormal(rnd)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rnd();
  } while (p > limit);
  return k - 1;
}

function pickKind(rnd) {
  const r = rnd();
  let acc = 0;
  for (const k of TASK_KINDS) {
    acc += TASK_MIX[k].share;
    if (r < acc) return k;
  }
  return TASK_KINDS[TASK_KINDS.length - 1];
}

// -----------------------------------------------------------------------------
// 9. Per-user simulation
// -----------------------------------------------------------------------------

/**
 * One user, one month, under one plan's allowance. Pure given `rnd`.
 * `demand*` is what the user tried to do; `served*` is what the allowance let
 * through. The service-wide ceiling is NOT applied here — it is an aggregate
 * effect and is applied in simulateScenario().
 */
export function simulateUserMonth({ plan, tasksPerDay, rnd, days = SIM_DAYS_PER_MONTH }) {
  const p = PLANS[plan];
  if (!p) throw new Error(`unknown plan: ${plan}`);
  const multiplier = intensityMultiplier(rnd);

  let demandNeurons = 0;
  let servedNeurons = 0;
  let demandTasks = 0;
  let servedTasks = 0;
  let servedRequests = 0;
  let creditsThisMonth = 0;
  let daysBlocked = 0;

  for (let d = 0; d < days; d += 1) {
    const n = poisson(rnd, tasksPerDay * multiplier);
    let creditsToday = 0;
    let blockedToday = false;
    for (let i = 0; i < n; i += 1) {
      const kind = pickKind(rnd);
      const neurons = taskNeurons(kind);
      const credits = creditsFor(neurons);
      demandNeurons += neurons;
      demandTasks += 1;
      const overDaily = creditsToday + credits > p.creditsPerDay;
      const overMonthly = creditsThisMonth + credits > p.creditsPerMonth;
      if (overDaily || overMonthly) {
        blockedToday = true;
        continue;
      }
      creditsToday += credits;
      creditsThisMonth += credits;
      servedNeurons += neurons;
      servedTasks += 1;
      servedRequests += TASK_MIX[kind].requests;
    }
    if (blockedToday) daysBlocked += 1;
  }

  return {
    demandNeurons,
    servedNeurons,
    demandTasks,
    servedTasks,
    servedRequests,
    creditsThisMonth,
    daysBlocked,
    hitAllowance: daysBlocked > 0,
  };
}

/** Mean behaviour of a cohort on one plan at one activity level. */
export function simulateCohort({ plan, activity, sample = MC_SAMPLE_USERS, seed = SIM_SEED }) {
  const tasksPerDay = ACTIVITY_LEVELS[activity].tasksPerDay;
  const rnd = makeRng(seed ^ (plan.length * 7919) ^ (tasksPerDay * 104729));
  const acc = {
    demandNeurons: 0,
    servedNeurons: 0,
    demandTasks: 0,
    servedTasks: 0,
    servedRequests: 0,
    hitAllowance: 0,
    daysBlocked: 0,
  };
  for (let i = 0; i < sample; i += 1) {
    const u = simulateUserMonth({ plan, tasksPerDay, rnd });
    acc.demandNeurons += u.demandNeurons;
    acc.servedNeurons += u.servedNeurons;
    acc.demandTasks += u.demandTasks;
    acc.servedTasks += u.servedTasks;
    acc.servedRequests += u.servedRequests;
    acc.hitAllowance += u.hitAllowance ? 1 : 0;
    acc.daysBlocked += u.daysBlocked;
  }
  return {
    plan,
    activity,
    sample,
    // per ACTIVE user per month
    demandNeuronsPerActiveUser: acc.demandNeurons / sample,
    servedNeuronsPerActiveUser: acc.servedNeurons / sample,
    demandTasksPerActiveUser: acc.demandTasks / sample,
    servedTasksPerActiveUser: acc.servedTasks / sample,
    servedRequestsPerActiveUser: acc.servedRequests / sample,
    fractionHittingAllowance: acc.hitAllowance / sample,
    meanDaysBlocked: acc.daysBlocked / sample,
  };
}

// -----------------------------------------------------------------------------
// 10. Queueing when the provider ceiling binds
// -----------------------------------------------------------------------------

/**
 * ESTIMATE, not a measurement. Takes service-wide inference requests per day,
 * concentrates them into a peak minute with the ASSUMED peak factors, and
 * compares against the MEASURED 30 req/min sustained ceiling.
 *
 * Below saturation the added wait uses an M/M/1 approximation
 *   Wq = rho / (mu * (1 - rho))
 * with mu = 30/min. At or above saturation the queue does not reach steady
 * state, so we report the backlog the peak hour accumulates instead.
 */
export function queueModel(requestsPerDay) {
  const peakPerMin = (requestsPerDay * PEAK_HOUR_SHARE_OF_DAY * PEAK_MINUTE_BURSTINESS) / 60;
  const utilization = peakPerMin / PROVIDER_REQUESTS_PER_MIN;
  if (utilization >= 1) {
    const peakHourRequests = requestsPerDay * PEAK_HOUR_SHARE_OF_DAY;
    const peakHourCapacity = PROVIDER_REQUESTS_PER_MIN * 60;
    const backlog = Math.max(0, peakHourRequests - peakHourCapacity);
    return {
      peakPerMin,
      utilization,
      saturated: true,
      meanQueueWaitSec: null,
      backlogRequests: backlog,
      backlogDrainMinutes: backlog / PROVIDER_REQUESTS_PER_MIN,
    };
  }
  const waitMinutes = utilization / (PROVIDER_REQUESTS_PER_MIN * (1 - utilization));
  return {
    peakPerMin,
    utilization,
    saturated: false,
    meanQueueWaitSec: waitMinutes * 60,
    backlogRequests: 0,
    backlogDrainMinutes: 0,
  };
}

// -----------------------------------------------------------------------------
// 11. Scenario: a cohort at a population size, against the service ceilings
// -----------------------------------------------------------------------------

export function simulateScenario({ plan, activity, users, seed = SIM_SEED, sample = MC_SAMPLE_USERS }) {
  const cohort = simulateCohort({ plan, activity, sample, seed });
  const activeUsers = users * DAILY_ACTIVE_FRACTION;

  // Allowance-limited demand, i.e. what the plan itself says the user may have.
  const neuronsPerActiveUserPerDay = cohort.servedNeuronsPerActiveUser / SIM_DAYS_PER_MONTH;
  const requestsPerActiveUserPerDay = cohort.servedRequestsPerActiveUser / SIM_DAYS_PER_MONTH;

  const serviceNeuronsPerDay = activeUsers * neuronsPerActiveUserPerDay;
  const serviceRequestsPerDay = activeUsers * requestsPerActiveUserPerDay;

  // --- what it WOULD cost to actually serve that, ignoring the spend gates ---
  // The account-wide free allocation is a fixed 10,000/day for everyone
  // together, so it is subtracted once at the service level, not per user.
  const uncappedBillablePerDay = Math.max(0, serviceNeuronsPerDay - FREE_NEURONS_PER_DAY_ACCOUNT_WIDE);
  const uncappedAiUsdPerMonth = uncappedBillablePerDay * SIM_DAYS_PER_MONTH * USD_PER_NEURON;

  // Marginal cost of one more user: no share of the free allocation, because
  // the allocation is already spent by the users ahead of them. This is the
  // conservative figure and the one break-even is priced from.
  const marginalUsdPerUserPerMonth = cohort.servedNeuronsPerActiveUser * DAILY_ACTIVE_FRACTION * USD_PER_NEURON;
  // Fully-allocated: the free allocation shared pro-rata across the base.
  const allocatedUsdPerUserPerMonth = users > 0 ? uncappedAiUsdPerMonth / users : 0;

  // --- what the shipped spend gates actually permit ---
  const cappedNeuronsPerDay = Math.min(serviceNeuronsPerDay, DAILY_NEURON_CEILING);
  const cappedBillablePerDay = Math.max(0, cappedNeuronsPerDay - FREE_NEURONS_PER_DAY_ACCOUNT_WIDE);
  const cappedBillablePerMonth = Math.min(cappedBillablePerDay * SIM_DAYS_PER_MONTH, BILLABLE_NEURONS_PER_MONTH);
  const cappedAiUsdPerMonth = cappedBillablePerMonth * USD_PER_NEURON;
  const totalCappedUsdPerMonth = cappedAiUsdPerMonth + WORKERS_PAID_USD_PER_MONTH;
  const demandServedFraction = serviceNeuronsPerDay > 0 ? cappedNeuronsPerDay / serviceNeuronsPerDay : 1;

  // Queue behaviour at the requests the ceiling actually lets through.
  const cappedRequestsPerDay = serviceRequestsPerDay * demandServedFraction;
  const queue = queueModel(cappedRequestsPerDay);
  const queueUncapped = queueModel(serviceRequestsPerDay);

  return {
    plan,
    activity,
    users,
    activeUsers,
    cohort,
    serviceNeuronsPerDay,
    serviceRequestsPerDay,
    uncappedAiUsdPerMonth,
    marginalUsdPerUserPerMonth,
    allocatedUsdPerUserPerMonth,
    breakEvenUsdPerUserPerMonth: breakEvenPrice(marginalUsdPerUserPerMonth),
    cappedNeuronsPerDay,
    cappedAiUsdPerMonth,
    totalCappedUsdPerMonth,
    demandServedFraction,
    fractionHittingAllowance: cohort.fractionHittingAllowance,
    queue,
    queueUncapped,
  };
}

/** Worst case: a user who consumes their entire allowance every single day. */
export function allowanceCeilingUsdPerUserPerMonth(plan) {
  const p = PLANS[plan];
  const byDay = p.creditsPerDay * SIM_DAYS_PER_MONTH;
  const credits = Math.min(byDay, p.creditsPerMonth);
  return credits * NEURONS_PER_CREDIT * USD_PER_NEURON;
}

// -----------------------------------------------------------------------------
// 12. Report
// -----------------------------------------------------------------------------

const money = (v, dp = 2) => `$${v.toFixed(dp)}`;
const num = (v, dp = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (v, dp = 1) => `${(v * 100).toFixed(dp)}%`;

function table(headers, rows, aligns = []) {
  const all = [headers, ...rows];
  const widths = headers.map((_, c) => Math.max(...all.map((r) => String(r[c] ?? '').length)));
  const pad = (s, c) => {
    const v = String(s ?? '');
    return aligns[c] === 'r' ? v.padStart(widths[c]) : v.padEnd(widths[c]);
  };
  const line = (r) => `  ${r.map((_, c) => pad(r[c], c)).join('  ')}`;
  const rule = `  ${widths.map((w) => '-'.repeat(w)).join('  ')}`;
  return [line(headers), rule, ...rows.map(line)].join('\n');
}

function heading(t) {
  return `\n${t}\n${'='.repeat(t.length)}`;
}

export function report() {
  const out = [];

  out.push('GOLEM PLAN-ECONOMICS SIMULATOR — INTERNAL MODEL ONLY');
  out.push('Not public pricing. Does not change any plan, allowance, or spend gate.');
  out.push(
    `Free = the published plan (${PLANS.free.creditsPerDay} Credits/day, ${num(PLANS.free.creditsPerMonth)}/month). Pro and Max are hypothetical.`,
  );
  out.push(
    `Billing: $0.011/1,000 neurons · 1 Credit = ${NEURONS_PER_CREDIT} neurons · hard ceiling ${money(HARD_MAX_USD_PER_MONTH)}/month (unchanged).`,
  );

  // --- task mix ---
  out.push(heading('1. Task mix (ASSUMED distribution over MEASURED per-task costs)'));
  out.push(
    table(
      ['task', 'share', 'neurons', 'credits', 'USD', 'requests', 'provenance'],
      TASK_KINDS.map((k) => {
        const t = TASK_MIX[k];
        const n = taskNeurons(k);
        return [
          t.label,
          pct(t.share, 0),
          num(n),
          num(creditsFor(n)),
          money(usd(n), 4),
          num(t.requests),
          k === 'visual_build' ? `${GATED_BUILD_STEPS}x${NEURONS_PER_AGENT_STEP} + ${CRITIQUES_PER_GATED_BUILD}x${VISUAL_CRITIQUE_NEURONS}` : 'measured',
        ];
      }),
      ['l', 'r', 'r', 'r', 'r', 'r', 'l'],
    ),
  );
  const blended = blendedTaskNeurons();
  out.push('');
  out.push(
    `  Blended: ${num(blended, 1)} neurons/task = ${num(blended / NEURONS_PER_CREDIT, 1)} Credits = ${money(usd(blended), 4)}, ${num(blendedRequestsPerTask(), 2)} inference requests/task.`,
  );
  out.push(
    `  Free's ${PLANS.free.creditsPerDay} Credits/day = ${num(PLANS.free.creditsPerDay * NEURONS_PER_CREDIT)} neurons/day = ${num((PLANS.free.creditsPerDay * NEURONS_PER_CREDIT) / blended, 1)} blended tasks/day.`,
  );
  out.push(
    `  One quality-gated build is ${num(taskNeurons('visual_build'))} neurons = ${num(creditsFor(taskNeurons('visual_build')))} Credits, so it does NOT fit in a Free day (${PLANS.free.creditsPerDay} Credits). Confirms the documented fact.`,
  );

  // --- per-user demand ---
  out.push(heading('2. Per-active-user demand by activity level (before any allowance)'));
  out.push(
    table(
      ['activity', 'tasks/day', 'neurons/day', 'Credits/day', 'neurons/mo', 'raw AI cost/mo'],
      Object.keys(ACTIVITY_LEVELS).map((a) => {
        const tpd = ACTIVITY_LEVELS[a].tasksPerDay;
        const npd = tpd * blended;
        return [
          ACTIVITY_LEVELS[a].label,
          num(tpd),
          num(npd),
          num(npd / NEURONS_PER_CREDIT, 1),
          num(npd * SIM_DAYS_PER_MONTH),
          money(usd(npd * SIM_DAYS_PER_MONTH), 3),
        ];
      }),
      ['l', 'r', 'r', 'r', 'r', 'r'],
    ),
  );
  out.push('');
  out.push(
    `  Allowance ceilings (a user consuming 100% of their plan every day, whichever of daily/monthly binds first):`,
  );
  out.push(
    table(
      ['plan', 'Credits/day', 'Credits/mo', 'max neurons/mo', 'max AI cost/user/mo'],
      Object.keys(PLANS).map((p) => {
        const pl = PLANS[p];
        const credits = Math.min(pl.creditsPerDay * SIM_DAYS_PER_MONTH, pl.creditsPerMonth);
        return [
          pl.label,
          num(pl.creditsPerDay),
          num(pl.creditsPerMonth),
          num(credits * NEURONS_PER_CREDIT),
          money(allowanceCeilingUsdPerUserPerMonth(p), 3),
        ];
      }),
      ['l', 'r', 'r', 'r', 'r'],
    ),
  );

  // --- scenario grid ---
  const userCounts = [100, 1_000, 10_000];
  const activities = Object.keys(ACTIVITY_LEVELS);
  const scenarios = [];
  for (const plan of Object.keys(PLANS)) {
    for (const users of userCounts) {
      for (const activity of activities) {
        scenarios.push(simulateScenario({ plan, activity, users }));
      }
    }
  }

  out.push(heading('3. Scenario grid'));
  out.push(
    `  ${pct(DAILY_ACTIVE_FRACTION, 0)} of the base is active daily (ASSUMED). ${MC_SAMPLE_USERS} Monte Carlo users/cohort, seed ${SIM_SEED}, lognormal sigma ${USER_INTENSITY_SIGMA}.`,
  );
  out.push(
    `  "cost/user/mo" = AI cost per SIGNED-UP user (not per active user), MARGINAL: no share of the ${num(FREE_NEURONS_PER_DAY_ACCOUNT_WIDE)}/day`,
  );
  out.push(
    `  account-wide free allocation, since that is already spent by the users ahead of them. The conservative figure.`,
  );
  out.push(
    `  "true cost/mo" is what serving the demand WOULD cost with the spend gates removed. It is not what gets billed.`,
  );
  out.push(
    `  "break-even" is the price giving ${pct(TARGET_GROSS_MARGIN, 0)} gross margin on that marginal cost.`,
  );
  out.push('');
  for (const plan of Object.keys(PLANS)) {
    out.push(`  ${PLANS[plan].label}${PLANS[plan].published ? '  [PUBLISHED PLAN — allowances not modifiable]' : '  [hypothetical]'}`);
    out.push(
      table(
        [
          'users',
          'activity',
          'neurons/day',
          'hit allowance',
          'cost/user/mo',
          `break-even @${pct(TARGET_GROSS_MARGIN, 0)}`,
          'true cost/mo',
          'served under cap',
          'peak req/min',
          'queue',
        ],
        scenarios
          .filter((s) => s.plan === plan)
          .map((s) => [
            num(s.users),
            s.activity,
            num(s.serviceNeuronsPerDay),
            pct(s.fractionHittingAllowance, 0),
            money(s.marginalUsdPerUserPerMonth, 3),
            money(s.breakEvenUsdPerUserPerMonth, 2),
            money(s.uncappedAiUsdPerMonth + WORKERS_PAID_USD_PER_MONTH, 2),
            pct(s.demandServedFraction, 1),
            num(s.queueUncapped.peakPerMin, 1),
            s.queueUncapped.saturated
              ? `SATURATED ${num(s.queueUncapped.utilization, 1)}x`
              : `+${num(s.queueUncapped.meanQueueWaitSec, 1)}s`,
          ]),
        ['r', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l'],
      ),
    );
    out.push('');
  }

  // --- ceiling reality check ---
  out.push(heading('4. What the shipped spend gates actually permit'));
  const tasksPerDayAtCeiling = DAILY_NEURON_CEILING / blended;
  out.push(
    `  Daily service ceiling: ${num(DAILY_NEURON_CEILING)} neurons (${num(FREE_NEURONS_PER_DAY_ACCOUNT_WIDE)} free + ${num(BILLABLE_NEURONS_PER_DAY)} billable).`,
  );
  out.push(`  Monthly backstop: ${num(BILLABLE_NEURONS_PER_MONTH)} billable neurons. Per request: ${num(MAX_NEURONS_PER_REQUEST)}.`);
  out.push(
    `  That buys ${num(tasksPerDayAtCeiling, 0)} blended tasks/day service-wide, or ${num(DAILY_NEURON_CEILING / taskNeurons('visual_build'), 1)} quality-gated builds/day.`,
  );
  const supportable = {};
  for (const a of activities) {
    const npd = ACTIVITY_LEVELS[a].tasksPerDay * blended;
    supportable[a] = DAILY_NEURON_CEILING / npd / DAILY_ACTIVE_FRACTION;
  }
  out.push(
    table(
      ['activity', 'neurons/active user/day', 'active users supported', 'signed-up users supported'],
      activities.map((a) => {
        const npd = ACTIVITY_LEVELS[a].tasksPerDay * blended;
        return [a, num(npd), num(DAILY_NEURON_CEILING / npd, 1), num(supportable[a], 1)];
      }),
      ['l', 'r', 'r', 'r'],
    ),
  );
  out.push('');
  out.push(
    `  So the ceiling — not the plan allowances and not the provider rate limit — is the first thing to bind.`,
  );
  out.push(
    `  Every scenario at 100+ users is capacity-limited, and the bill stays pinned at the ceiling by construction.`,
  );
  out.push(
    `  Worst case in a ${SIM_DAYS_PER_MONTH}-day month: min(${num(BILLABLE_NEURONS_PER_DAY)}/day x ${SIM_DAYS_PER_MONTH}, ${num(BILLABLE_NEURONS_PER_MONTH)}/month) = ${num(maxBillableNeuronsPerMonth())} billable neurons`,
  );
  out.push(
    `  = ${money(maxBillableNeuronsPerMonth() * USD_PER_NEURON)} of AI + ${money(WORKERS_PAID_USD_PER_MONTH)} Workers Paid = ${money(maxUsdPerMonth())}. Under the documented ${money(HARD_MAX_USD_PER_MONTH)} maximum, never over.`,
  );
  out.push(
    `  Per-request gate is never the binding one: the largest single call in the mix is ~${num(largestSingleRequestNeurons(), 0)} neurons against a ${num(MAX_NEURONS_PER_REQUEST)} cap.`,
  );

  // --- structurally unservable tasks ---
  out.push(heading('4b. Tasks a plan can never serve (one task > one day of Credits)'));
  out.push(
    table(
      ['plan', 'Credits/day', 'unservable task kinds', 'share of tasks', 'share of neurons'],
      Object.keys(PLANS).map((p) => {
        const bad = unservableKinds(p);
        const taskShare = bad.reduce((s, k) => s + TASK_MIX[k].share, 0);
        const neuronShare = bad.reduce((s, k) => s + TASK_MIX[k].share * taskNeurons(k), 0) / blended;
        return [
          PLANS[p].label,
          num(PLANS[p].creditsPerDay),
          bad.length ? bad.map((k) => `${TASK_MIX[k].label} (${creditsFor(taskNeurons(k))} Credits)`).join(', ') : 'none',
          pct(taskShare, 0),
          pct(neuronShare, 0),
        ];
      }),
      ['l', 'r', 'l', 'r', 'r'],
    ),
  );
  out.push('');
  out.push(
    `  This is the single most consequential result in the model. A quality-gated build is ${num(creditsFor(taskNeurons('visual_build')))} Credits;`,
  );
  out.push(
    `  Free grants ${PLANS.free.creditsPerDay}/day. So on Free the visual build is not "expensive", it is UNREACHABLE — which is why Free's`,
  );
  out.push(
    `  measured cost/user stays low (${pct(TASK_MIX.visual_build.share, 0)} of tasks carrying ${pct((TASK_MIX.visual_build.share * taskNeurons('visual_build')) / blended, 0)} of the neurons is simply never served)`,
  );
  out.push(
    `  and why Free users hit their allowance so often. It is a product decision wearing a cost decision's clothes.`,
  );

  // --- provider ceiling ---
  out.push(heading('5. Provider throughput'));
  out.push(
    `  MEASURED sustained: ${PROVIDER_REQUESTS_PER_MIN} successful requests/min (error 3021 above it). p95 ${MEASURED_P95_SECONDS_AT_6_CONCURRENT}s at 6 concurrent vs 2.0s median.`,
  );
  out.push(
    `  Capped by the daily neuron ceiling, the service can only issue ~${num((DAILY_NEURON_CEILING / blended) * blendedRequestsPerTask(), 0)} requests/day,`,
  );
  const cappedQ = queueModel((DAILY_NEURON_CEILING / blended) * blendedRequestsPerTask());
  out.push(
    `  = ${num(cappedQ.peakPerMin, 1)} req/min at the ASSUMED peak (${pct(PEAK_HOUR_SHARE_OF_DAY, 0)} of the day in the peak hour, ${PEAK_MINUTE_BURSTINESS}x burst),`,
  );
  out.push(
    `  which is ${pct(cappedQ.utilization, 1)} of the provider ceiling — added queue wait ${cappedQ.saturated ? 'SATURATED' : `${num(cappedQ.meanQueueWaitSec, 2)}s`}.`,
  );
  out.push(
    `  The provider limit only binds on UNCAPPED demand (column 9 above). Under the spend gates it never does.`,
  );

  // --- break-even summary ---
  out.push(heading(`6. Break-even price per tier at a ${pct(TARGET_GROSS_MARGIN, 0)} target gross margin`));
  out.push(
    table(
      [
        'plan',
        'light cost/mo',
        'light B/E',
        'typical cost/mo',
        'typical B/E',
        'heavy cost/mo',
        'heavy B/E',
        'worst case cost',
        'worst case B/E',
      ],
      Object.keys(PLANS).map((p) => {
        const row = [PLANS[p].label];
        for (const a of activities) {
          const s = scenarios.find((x) => x.plan === p && x.activity === a && x.users === 1_000);
          row.push(money(s.marginalUsdPerUserPerMonth, 3), money(s.breakEvenUsdPerUserPerMonth, 2));
        }
        const worst = allowanceCeilingUsdPerUserPerMonth(p);
        row.push(money(worst, 2), money(breakEvenPrice(worst), 2));
        return row;
      }),
      ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    ),
  );
  out.push('');
  out.push(
    `  Free is a cost line, not a price line: a typical Free user costs ${money(scenarios.find((s) => s.plan === 'free' && s.activity === 'typical' && s.users === 1_000).marginalUsdPerUserPerMonth, 3)}/month`,
  );
  out.push(
    `  and a Free user pinned at their allowance every day costs ${money(allowanceCeilingUsdPerUserPerMonth('free'), 2)}/month. That is the honest CAC-adjacent number.`,
  );
  out.push(
    `  "Worst case" prices the allowance itself — what the tier must charge if EVERY user burns 100% of it. It is the only price that cannot be wrong.`,
  );
  out.push('');
  out.push('  Reminder: internal model. Public pricing and plan allowances are unchanged by this file.');
  out.push('');

  return out.join('\n');
}

// -----------------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  process.stdout.write(`${report()}\n`);
}
