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
//    and "you have 0 left at all" are different sentences. `creditsRemaining` is their sum and is
//    deliberately not what this renders as the headline — a single figure hides which kind of zero
//    you are looking at, and the two have different next actions.
//
// 3a. NOT ASKED YET IS NOT THE SAME AS ASKED AND FAILED. The first version of this file had one
//    fallback for both, so every page load flashed "The usage service did not answer" during the
//    ordinary fetch — a claim about a service that was working fine, made before it had been given
//    a chance to answer. A failure to observe must not render as an observation. `pending` is its
//    own state and says only that the number is not here yet.
//
// 4. THE METER NAMES THE LIMIT THAT IS ACTUALLY BITING. `allowanceRemaining` is the smaller of
//    what is left today and what is left this month, so a spent month reads as zero on a fresh
//    day. Saying "the daily allowance is spent" then, and offering a reset a few hours away, is
//    wrong twice: wrong about which limit stopped them and wrong about when it lifts. The plan's
//    monthly figure is in the same table as the daily one, so the meter can tell which is binding
//    and say so.
//
// 3. AN UNREADABLE QUOTA IS NEVER DRAWN AS A HEALTHY ONE. If the query failed, or the payload is
//    not shaped like a quota, the verdict is `unknown` and says so. Rendering a missing number as
//    an empty bar reads as "you have nothing"; rendering it as a full one reads as "you have
//    plenty". Both are claims this file cannot support. credits-model.ts set this precedent for
//    the attribution ledger — an empty ledger is never drawn as a clearance — and it is the same
//    mistake in a different subsystem.
import { PLAN_LIMITS, PLAN_COPY, CREDITS_PER_BUILD, PRODUCT_MODE_INFO, SPECIALIST_TO_PRODUCT_MODE, isPlanId, type QuotaState } from '@golem/shared';

export type MeterTone = 'good' | 'warn' | 'bad' | 'unknown' | 'pending';

/** Which limit is currently the binding one. The copy and the reset both hang off this. */
export type MeterPeriod = 'day' | 'month';
// Numbers go through the shared formatter so the reader's region decides the separators.
// `formatNumber` with the default settings is character-for-character what `toLocaleString()`
// produced, so nothing about this line changed for anyone who has not chosen a region.
import { formatNumber } from '../lib/format.ts';

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
  /** Which limit the numbers above describe. `day` unless the month ran out first. */
  period: MeterPeriod;
}

const BLANK = {
  planName: null,
  allowanceRemaining: 0,
  allowanceTotal: 0,
  allowanceFraction: 0,
  credits: 0,
  nextAction: null,
  buildsHint: null,
  resetsIn: null,
  period: 'day' as MeterPeriod,
};

const UNKNOWN: MeterView = {
  ...BLANK,
  tone: 'unknown',
  headline: 'Balance unavailable',
  detail: 'The usage service did not answer. Your balance is unchanged — this is a display problem, not a charge.',
};

/**
 * Not an error. The request is in flight and no claim is being made about anything yet — which is
 * the entire difference between this and UNKNOWN, and the reason both exist.
 */
const PENDING: MeterView = {
  ...BLANK,
  tone: 'pending',
  headline: 'Checking your balance',
  detail: 'One moment.',
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

/**
 * The first instant of the next UTC month. The wire carries the DAILY reset only, and when the
 * month is the binding limit that figure is the wrong answer to "when does this lift". This is the
 * same UTC arithmetic the ledger keys by, not a second opinion about policy.
 */
export function nextMonthResetIso(now: number): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

const finite = (n: unknown): n is number => Number.isFinite(n);

export function meterView(
  quota: unknown,
  now: number,
  opts?: { pending?: boolean; failed?: boolean },
): MeterView {
  // Pending is checked first and on its own: a request in flight has no payload to inspect, and
  // inspecting the absent one is how "not yet" became "the service did not answer".
  if (opts?.pending) return PENDING;
  // A caller that KNOWS the fetch failed says so, rather than leaving it to be inferred from an
  // absent payload. The inference gave the right answer, but only by accident of `undefined` —
  // and a rule that holds by accident is one a refactor silently breaks.
  if (opts?.failed) return UNKNOWN;
  if (!looksLikeQuota(quota)) return UNKNOWN;

  const allowanceRemaining = Math.max(0, Math.floor(quota.allowanceRemaining));
  const credits = Math.max(0, Math.floor(quota.credits));
  const plan = isPlanId(quota.plan) ? quota.plan : null;

  // WHICH LIMIT IS BITING. allowanceRemaining is already the smaller of the two, so this only
  // decides what to CALL it. The month wins ties: at the moment they are equal, the day is about to
  // renew into a month that will not, and naming the month is the more useful of the two truths.
  const dayLeft = finite(quota.creditsDaily) && finite(quota.creditsUsedToday)
    ? Math.max(0, quota.creditsDaily - quota.creditsUsedToday)
    : null;
  const monthLeft = finite(quota.creditsMonthly) && finite(quota.creditsUsedThisMonth)
    ? Math.max(0, quota.creditsMonthly - quota.creditsUsedThisMonth)
    : null;
  const period: MeterPeriod = dayLeft !== null && monthLeft !== null && monthLeft <= dayLeft ? 'month' : 'day';

  // The enforced table first; the wire's own figure only as a fallback for a plan we do not know.
  const wireTotal = period === 'month' ? quota.creditsMonthly : quota.creditsDaily;
  const allowanceTotal = plan
    ? (period === 'month' ? PLAN_LIMITS[plan].creditsPerMonth : PLAN_LIMITS[plan].creditsPerDay)
    : finite(wireTotal) ? Math.max(0, Math.floor(wireTotal)) : 0;

  const per = period === 'month' ? 'a month' : 'a day';
  const window = period === 'month' ? 'this month' : 'today';

  const allowanceFraction = allowanceTotal > 0 ? Math.min(1, allowanceRemaining / allowanceTotal) : 0;
  const spendable = allowanceRemaining + credits;
  const builds = Math.floor(spendable / CREDITS_PER_BUILD);

  let tone: MeterTone;
  let headline: string;
  let detail: string;
  let nextAction: string | null = null;

  if (allowanceRemaining > 0) {
    tone = allowanceFraction <= 0.15 ? 'warn' : 'good';
    headline = `${formatNumber(allowanceRemaining)} Credits left ${window}`;
    detail = credits > 0
      ? `of ${formatNumber(allowanceTotal)} ${per}, plus ${formatNumber(credits)} purchased`
      : `of ${formatNumber(allowanceTotal)} ${per}`;
  } else if (credits > 0) {
    // A real distinction: the day's allowance is gone but the account is not empty, and nothing
    // the user does next is blocked.
    tone = 'warn';
    headline = period === 'month' ? "This month's allowance is used up" : "Today's allowance is used up";
    detail = `Running on ${formatNumber(credits)} extra credit${credits === 1 ? '' : 's'}, which do not expire.`;
  } else {
    tone = 'bad';
    headline = 'No Credits left';
    detail = period === 'month'
      ? "This month's allowance is spent and there are no extra credits. The daily limit is not what stopped this."
      : 'The daily allowance is spent and there are no extra credits.';
    nextAction = period === 'month'
      ? 'Add credits, or upgrade — the monthly limit does not lift until next month.'
      : 'Wait for the reset, or add credits.';
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
    // The wire's resetsAtIso is the DAILY reset. Offering it while the month is what ran out would
    // promise the allowance back in a few hours when it is weeks away.
    resetsIn: period === 'month' ? resetsIn(nextMonthResetIso(now), now) : resetsIn(quota.resetsAtIso, now),
    period,
  };
}

// ---------------------------------------------------------------------------
// WHAT THE CREDITS WENT ON
// ---------------------------------------------------------------------------
//
// QuotaDO has recorded a `kind` on every single spend since the ledger existed, and the history
// query threw it away — so the usage page could draw thirty bars saying WHEN Credits went and had
// no answer at all to the question a person actually asks about a bill: what were they spent ON.
// The server now sends the breakdown per day. This is the half that turns raw ledger kinds into a
// list somebody reads, and it is here rather than in the component for the same reason everything
// else in this file is: a page that decides what a field means decides it again in every place it
// prints it.

/**
 * "AM I SPENDING MORE THAN LAST MONTH", which the page could not answer at all.
 *
 * It showed one period at a time and nothing anywhere held a previous figure. The trap in adding
 * one is the FIRST month: a comparison against a month that was never counted reads as "1,200 this
 * month, against 0 last month" — a story about explosive growth told to somebody who had simply not
 * signed up yet. So the server sends `null` rather than `0` for a month it cannot vouch for, and
 * this returns null rather than a sentence. The caller renders nothing.
 */
export function periodComparisonLine(
  thisMonth: unknown,
  previous: { month?: string; credits?: unknown } | null | undefined,
): string | null {
  if (typeof thisMonth !== 'number' || !Number.isFinite(thisMonth)) return null;
  if (!previous || typeof previous.credits !== 'number' || !Number.isFinite(previous.credits)) return null;
  const prev = previous.credits;
  const now = formatNumber(thisMonth);
  const then = formatNumber(prev);
  // Three directions rather than two. "the same as last month" is a real and quite common answer,
  // and forcing it into "more" or "less" would be false about a figure somebody can check.
  if (thisMonth === prev) return `${now} Credits this month — the same as last month.`;
  const direction = thisMonth > prev ? 'up from' : 'down from';
  return `${now} Credits this month, ${direction} ${then} last month.`;
}

/** One day of spend as the worker now reports it. `kinds` is absent on an older worker. */
export interface UsageDayRow {
  day: string;
  credits: number;
  events?: number;
  kinds?: { kind: string; credits: number }[];
}

export interface SpendSlice {
  /** The bucket key, stable across renders — combined kinds share one. */
  key: string;
  label: string;
  credits: number;
}

/**
 * The ledger kind a person would recognise.
 *
 * `chat_<mode>` and `usage_<mode>` are ONE activity charged in two instalments — one Credit on
 * admission and the settlement when the run finishes — so they share a bucket. Printing them as two
 * categories would invite the reader to conclude they had been charged twice for one run.
 *
 * AN UNRECOGNISED KIND IS TIDIED, NEVER DROPPED. A new spend kind ships on the server before it is
 * named here, and dropping it would stop the parts summing to the whole silently, in the direction
 * that flatters us.
 */
function ledgerMode(kind: string): string | undefined {
  const raw = /^(?:chat|usage)_(.+)$/.exec(kind)?.[1];
  // Old settlements store internal specialist names. Normalize to the existing public
  // activity, not Apple/MAX: those historical rows do not prove which product model ran.
  return raw && Object.prototype.hasOwnProperty.call(SPECIALIST_TO_PRODUCT_MODE, raw)
    ? SPECIALIST_TO_PRODUCT_MODE[raw as keyof typeof SPECIALIST_TO_PRODUCT_MODE]
    : raw;
}

export function usageKindLabel(kind: string): string {
  const mode = ledgerMode(kind);
  if (mode === 'plan' || mode === 'agent' || mode === 'super') return PRODUCT_MODE_INFO[mode].name;
  if (kind.startsWith('api_')) return 'API';
  if (kind === 'docs_search') return 'Search';
  if (kind === 'roadmap_rank') return 'Roadmap';
  if (!kind) return 'Other';
  return kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** The bucket a kind falls in. Two instalments of one run share it; everything else is itself. */
function bucketKey(kind: string): string {
  const mode = ledgerMode(kind);
  if (mode) return `mode:${mode}`;
  if (kind.startsWith('api_')) return 'api';
  return `kind:${kind}`;
}

/**
 * Every day's breakdown collapsed into one list, biggest first.
 *
 * NO "OTHER" BUCKET IS INVENTED. A worker that sends no `kinds` produces an empty list, and the
 * page renders nothing — right, because nothing is known. Filling the day's total into a category
 * called "Other" would be a figure attributed to something nobody spent it on.
 */
export function spendByKind(days: readonly UsageDayRow[] | null | undefined): SpendSlice[] {
  if (!Array.isArray(days)) return [];
  const totals = new Map<string, SpendSlice>();
  for (const day of days) {
    if (!day || !Array.isArray(day.kinds)) continue;
    for (const row of day.kinds) {
      if (!row || typeof row.kind !== 'string') continue;
      const credits = typeof row.credits === 'number' && Number.isFinite(row.credits) ? row.credits : 0;
      const key = bucketKey(row.kind);
      const cur = totals.get(key);
      if (cur) cur.credits += credits;
      else totals.set(key, { key, label: usageKindLabel(row.kind), credits });
    }
  }
  return [...totals.values()].sort((a, b) => b.credits - a.credits || a.label.localeCompare(b.label));
}
