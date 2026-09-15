// The quota arithmetic, separated from the Durable Object that stores it.
//
// S12 is "does everything still work after a day boundary", and the honest problem with that
// question is that the only way to answer it inside QuotaDO was to wait a day. Every date came from
// `new Date()` at the point of use, so a rollover could be reasoned about and not executed.
//
// Nothing here reads a clock. `now` is an argument, so midnight, a month end, and a leap day are
// inputs a test supplies rather than conditions a test waits for.
//
// WHAT "RESET" ACTUALLY MEANS HERE, because it is not a job that runs. The ledger is keyed by UTC
// day, and the day's spend is a query for rows matching today's key. So the allowance returns at
// midnight because the question changes, not because anything clears a counter. That is a better
// design than a scheduled reset — there is no job to miss, no server that has to be awake — and it
// has one consequence worth stating: a clock that moves BACKWARDS re-exposes a day already spent.
// Cloudflare's clock does not, and `dayKey` would need a monotonic floor if that ever changed.
import type { QuotaState } from '@golem/shared';
import { PLAN_LIMITS, type PlanId } from './pricing';

/** The ledger's UTC day key. Slicing an ISO string is the same thing the DO's SQL compares against. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The month prefix the monthly sum matches with `like`. */
export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/**
 * The next UTC midnight after `now`.
 *
 * Exactly midnight returns the FOLLOWING midnight, not the current instant: at 00:00:00.000 the new
 * day has already begun, so a reset time of "now" would render as "resets in 0 minutes" forever for
 * the length of that millisecond and, worse, would read as expired.
 */
export function nextResetIso(now: number): string {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export interface QuotaInputs {
  plan: PlanId;
  /** Sparks charged to the allowance today, from the day-keyed ledger. */
  spentToday: number;
  /** Sparks charged to the allowance this month. */
  spentThisMonth: number;
  /** Purchased, non-expiring balance. NOT part of either sum above. */
  credits: number;
  now: number;
}

/**
 * The state a client is shown, and the numbers a spend is checked against.
 *
 * The allowance is a RATE and credits are a BALANCE. `sparksRemaining` is what can be spent right
 * now and is therefore both, but the two are reported separately as well, because "you have 0 left
 * today" and "you have 0 left at all" are different sentences with different next actions.
 *
 * Whichever of the daily and monthly limits bites first is the one the user actually has.
 */
export function quotaState(i: QuotaInputs): QuotaState {
  const limits = PLAN_LIMITS[i.plan];
  const dailyLeft = Math.max(0, limits.sparksPerDay - i.spentToday);
  const monthlyLeft = Math.max(0, limits.sparksPerMonth - i.spentThisMonth);
  const allowanceLeft = Math.min(dailyLeft, monthlyLeft);
  const credits = Math.max(0, i.credits);
  return {
    sparksRemaining: allowanceLeft + credits,
    sparksDaily: limits.sparksPerDay,
    sparksMonthly: limits.sparksPerMonth,
    sparksUsedToday: i.spentToday,
    sparksUsedThisMonth: i.spentThisMonth,
    resetsAtIso: nextResetIso(i.now),
    plan: i.plan,
    allowanceRemaining: allowanceLeft,
    credits,
  };
}

/**
 * How a spend is split between the renewable allowance and the purchased balance.
 *
 * Allowance first, always. Spending a purchased balance while a free allowance sits unused is
 * taking money from someone who did not need to give it, and the user cannot see the order, so the
 * order has to be the one they would have chosen.
 */
export function splitSpend(
  sparks: number,
  allowanceRemaining: number,
  credits: number,
): { fromAllowance: number; fromCredits: number; affordable: boolean } {
  // A SPEND NOBODY COULD COMPUTE IS NOT A SPEND OF ZERO.
  //
  // `Math.max(0, NaN)` is NaN, and every comparison below is false for NaN — so an unreadable
  // amount reported AFFORDABLE, then computed `fromAllowance` and `fromCredits` as NaN, so the
  // caller's `if (fromAllowance > 0)` and `if (fromCredits > 0)` were both false and nothing was
  // written. The user was told ok and the ledger did not move: free work, silently, for as many
  // calls as anyone cared to make. The same shape as the BudgetDO defect, one ledger over, and
  // this is the one the user sees — session.ts also does `sparksSpent += owed`, so a single NaN
  // makes that field NaN for the rest of the run and msg_end carries it to the UI.
  //
  // A NEGATIVE IS DELIBERATELY NOT REFUSED. `owed = sparksForNeurons(neuronsUsed) - sparksSpent` is
  // legitimately negative when an earlier step overcharged, and refusing there would tell a user
  // with Sparks left that they had run out. Clamping it to zero is correct.
  if (!Number.isFinite(sparks)) {
    return { fromAllowance: 0, fromCredits: 0, affordable: false };
  }
  const want = Math.max(0, sparks);
  if (want > allowanceRemaining + credits) {
    return { fromAllowance: 0, fromCredits: 0, affordable: false };
  }
  const fromAllowance = Math.min(want, allowanceRemaining);
  return { fromAllowance, fromCredits: want - fromAllowance, affordable: true };
}
