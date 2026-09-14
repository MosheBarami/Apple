// What the rail says about what you have left — and, more importantly, what it refuses to say.
//
// The quota already reached the browser before this file existed. `fetchMe` has always returned a
// full `QuotaState`, and `layout.tsx` has always fetched it — and then read exactly one field off
// it, `profile.is_admin`, to decide whether to draw the Admin link. Every number describing what
// the user had left was fetched on every page load and thrown away, so the only way to learn you
// were nearly out was to run out.
//
// THREE RULES, and they are the whole reason this is a separate file with its own tests.
//
// 1. THE ALLOWANCE IS NEVER RESTATED. `allowanceTotal` is read from PLAN_LIMITS in @golem/shared,
//    the same table QuotaDO enforces. A meter with "60" written in it is a meter that lies the
//    moment the table changes, and it would lie silently, in the user's favour or against them.
//
// 2. ALLOWANCE AND CREDITS ARE TWO NUMBERS, NEVER ONE. `QuotaState` reports `allowanceRemaining`
//    (renewable, resets, does not accumulate) and `credits` (purchased, non-expiring, spent only
//    once the allowance is gone) separately, and its own comment says why: "you have 0 left today"
//    and "you have 0 left at all" are different sentences. `sparksRemaining` is their sum and is
//    deliberately not what this renders as the headline — a single figure hides which kind of zero
//    you are looking at, and the two have different next actions.
//
// 3. AN UNREADABLE QUOTA IS NEVER DRAWN AS A HEALTHY ONE. If the query failed, or the payload is
//    not shaped like a quota, the verdict is `unknown` and says so. Rendering a missing number as
//    an empty bar reads as "you have nothing"; rendering it as a full one reads as "you have
//    plenty". Both are claims this file cannot support. credits-model.ts set this precedent for
//    the attribution ledger — an empty ledger is never drawn as a clearance — and it is the same
//    mistake in a different subsystem.
import { PLAN_LIMITS, PLAN_COPY, SPARKS_PER_BUILD, isPlanId, type QuotaState } from '@golem/shared';

export type MeterTone = 'good' | 'warn' | 'bad' | 'unknown';

export interface MeterView {
  tone: MeterTone;
  /** The plan's display name, or null when the plan id is not one we know. */
  planName: string | null;
  /** Renewable allowance left in this period. */
  allowanceRemaining: number;
  /** The period's full allowance, from PLAN_LIMITS — never a literal in this file. */
  allowanceTotal: number;
  /** 0..1 for the bar. 0 when the total is unknown, which the `unknown` tone already signals. */
  allowanceFraction: number;
  /** Purchased, non-expiring. Reported beside the allowance, never added to it. */
  credits: number;
  headline: string;
  detail: string;
  /** Named ONLY when there is genuinely nothing left to spend. */
  nextAction: string | null;
  /** "about 3 builds" — omitted entirely when the remainder cannot afford one. */
  buildsHint: string | null;
  resetsIn: string | null;
}

const UNKNOWN: MeterView = {
  tone: 'unknown',
  planName: null,
  allowanceRemaining: 0,
  allowanceTotal: 0,
  allowanceFraction: 0,
  credits: 0,
  headline: 'Balance unavailable',
  detail: 'The usage service did not answer. Your balance is unchanged — this is a display problem, not a charge.',
  nextAction: null,
  buildsHint: null,
  resetsIn: null,
};

function looksLikeQuota(q: unknown): q is QuotaState {
  if (!q || typeof q !== 'object') return false;
  const o = q as Record<string, unknown>;
  // allowanceRemaining and credits are the two this component exists to separate; without BOTH
  // there is no honest meter to draw, so absence is unknown rather than zero.
  return Number.isFinite(o.allowanceRemaining) && Number.isFinite(o.credits);
}

/** Whole minutes/hours until the allowance renews. `now` is injected so this is testable. */
export function resetsIn(iso: string | undefined, now: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const ms = at - now;
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `resets in ${mins} min`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `resets in ${hrs}h` : `resets in ${Math.round(hrs / 24)}d`;
}

export function meterView(quota: unknown, now: number): MeterView {
  if (!looksLikeQuota(quota)) return UNKNOWN;

  const allowanceRemaining = Math.max(0, Math.floor(quota.allowanceRemaining));
  const credits = Math.max(0, Math.floor(quota.credits));
  const plan = isPlanId(quota.plan) ? quota.plan : null;

  // The enforced table first; the wire's own figure only as a fallback for a plan we do not know.
  const allowanceTotal = plan
    ? PLAN_LIMITS[plan].sparksPerDay
    : Number.isFinite(quota.sparksDaily) ? Math.max(0, Math.floor(quota.sparksDaily)) : 0;

  const allowanceFraction = allowanceTotal > 0 ? Math.min(1, allowanceRemaining / allowanceTotal) : 0;
  const spendable = allowanceRemaining + credits;
  const builds = Math.floor(spendable / SPARKS_PER_BUILD);

  let tone: MeterTone;
  let headline: string;
  let detail: string;
  let nextAction: string | null = null;

  if (allowanceRemaining > 0) {
    tone = allowanceFraction <= 0.15 ? 'warn' : 'good';
    headline = `${allowanceRemaining.toLocaleString()} Sparks left today`;
    detail = credits > 0
      ? `of ${allowanceTotal.toLocaleString()} a day, plus ${credits.toLocaleString()} purchased`
      : `of ${allowanceTotal.toLocaleString()} a day`;
  } else if (credits > 0) {
    // A real distinction: the day's allowance is gone but the account is not empty, and nothing
    // the user does next is blocked.
    tone = 'warn';
    headline = "Today's allowance is used up";
    detail = `Running on ${credits.toLocaleString()} purchased credit${credits === 1 ? '' : 's'}, which do not expire.`;
  } else {
    tone = 'bad';
    headline = 'No Sparks left';
    detail = 'The daily allowance is spent and there are no purchased credits.';
    nextAction = 'Wait for the reset, or add credits.';
  }

  return {
    tone,
    planName: plan ? PLAN_COPY[plan].name : null,
    allowanceRemaining,
    allowanceTotal,
    allowanceFraction,
    credits,
    headline,
    detail,
    nextAction,
    // Withheld below one whole build rather than shown as "0 builds", which reads as a fault in the
    // account rather than what it is — a remainder smaller than one job.
    buildsHint: builds >= 1 ? `about ${builds} more build${builds === 1 ? '' : 's'}` : null,
    resetsIn: resetsIn(quota.resetsAtIso, now),
  };
}
