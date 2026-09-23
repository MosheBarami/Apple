// BudgetDO — singleton. The one place that decides whether any inference is allowed to run.
//
// Every AI call must reserve neurons here BEFORE it executes and settle the true cost after.
// Because a Durable Object is single-threaded and globally unique, concurrent requests cannot
// race past the ceiling: reservations are serialized. If this object says no, no tokens are spent.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { RETENTION, days } from '../retention';
import {
  BILLABLE_NEURONS_PER_DAY,
  BILLABLE_NEURONS_PER_MONTH,
  FREE_NEURONS_PER_DAY,
  MAX_NEURONS_PER_REQUEST,
  THIRD_PARTY_USD_PER_DAY,
  THIRD_PARTY_USD_PER_MONTH,
  USD_PER_NEURON,
  maxNeuronsPerStepFor,
  routeForModelId,
  usdFor,
} from '../pricing';

export interface BudgetState {
  day: string;
  month: string;
  dayNeurons: number;
  dayPending: number;
  monthBillableNeurons: number;
  killed: boolean;
  killedReason: string | null;
  dayRemainingFraction: number;
  estimatedMonthUsd: number;
  freeRemainingToday: number;
  /** The third-party wallet (D-VISION-1), in dollars because that is how its ceiling is set. */
  thirdParty: ThirdPartyView;
}

export interface ThirdPartyView {
  dayUsd: number;
  dayPendingUsd: number;
  monthUsd: number;
  dayCeilingUsd: number;
  monthCeilingUsd: number;
}

interface Stored {
  day: string;
  month: string;
  dayNeurons: number;
  dayPending: number;
  monthBillableNeurons: number;
  dayBillableNeurons: number;
}

/**
 * THE THIRD-PARTY LEDGER (D-VISION-1). Gemini, GPT-5.6 and Luna are paid from prepaid AI Gateway
 * credits, not Workers AI neurons, so they are reserved and settled HERE and never against the
 * neuron day above. Kept in neurons like everything else (USD converts at USD_PER_NEURON); the
 * ceilings are set in dollars in pricing.ts. There is no free allocation on this wallet: every
 * neuron of it is billable.
 */
interface ThirdPartyStored {
  day: string;
  month: string;
  dayNeurons: number;
  dayPending: number;
  monthNeurons: number;
}

const KEY = 'budget';
const TP_KEY = 'thirdParty';
const LIMITS_KEY = 'limits';

interface Limits {
  billableNeuronsPerDay: number;
  billableNeuronsPerMonth: number;
  /**
   * The per-call cap for models outside the registry. A registry model uses its own
   * `maxNeuronsPerStep` — but when an operator RATCHETS this below its compiled default, every
   * model is held to the lower figure too, because "lower it now" has to mean every call.
   */
  maxNeuronsPerRequest: number;
  thirdPartyNeuronsPerDay: number;
  thirdPartyNeuronsPerMonth: number;
}
const DEFAULT_LIMITS: Limits = {
  billableNeuronsPerDay: BILLABLE_NEURONS_PER_DAY,
  billableNeuronsPerMonth: BILLABLE_NEURONS_PER_MONTH,
  maxNeuronsPerRequest: MAX_NEURONS_PER_REQUEST,
  thirdPartyNeuronsPerDay: Math.floor(THIRD_PARTY_USD_PER_DAY / USD_PER_NEURON),
  thirdPartyNeuronsPerMonth: Math.floor(THIRD_PARTY_USD_PER_MONTH / USD_PER_NEURON),
};

/** The per-call cap that applies to `model` under `limits`. */
function perCallCap(model: unknown, limits: Limits): number {
  const own = maxNeuronsPerStepFor(typeof model === 'string' ? model : '');
  return limits.maxNeuronsPerRequest < DEFAULT_LIMITS.maxNeuronsPerRequest ? Math.min(own, limits.maxNeuronsPerRequest) : own;
}

function isThirdParty(model: unknown): boolean {
  return typeof model === 'string' && routeForModelId(model) === 'unified-billing';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0)));
}

/**
 * A neuron count this object is willing to act on, or null if nobody could read it.
 *
 * WHY THIS IS NOT A CLAMP. Every cap below is a `>` comparison, and `NaN > n` is FALSE — so a cost
 * that could not be computed trips no guard at all. It does not even arrive as NaN: the body is
 * JSON, and `JSON.stringify(NaN)` is `null`, so the old `Math.max(1, Math.ceil(neurons))` reserved
 * ONE neuron for a call of any size and `Math.max(0, Math.ceil(actual))` settled it at ZERO. The
 * provider billed, the ledger did not move, and nothing said a number had gone missing.
 *
 * A clamp does not validate, it hides: it turns "I could not read this" into a confident small
 * number. An unknown-cost call is not a zero-cost call and the two must never render the same, so
 * this returns null and each caller below decides how to fail — closed, and loudly.
 */
/**
 * Why a value could not be read. Three causes were collapsed into one null — not a number,
 * negative, and non-finite — so a caller billed its reservation for sending -1 could not tell from
 * the response why. Reporting only; `readableNeurons` remains the decision.
 */
function whyUnreadable(n: unknown): 'not_a_number' | 'negative' | 'not_finite' | null {
  if (typeof n !== 'number') return 'not_a_number';
  if (Number.isNaN(n)) return 'not_a_number';
  if (!Number.isFinite(n)) return 'not_finite';
  if (n < 0) return 'negative';
  return null;
}

function readableNeurons(n: unknown): number | null {
  // `Number.isFinite` CANNOT BE FALSIFIED TODAY, and that is worth saying so nobody mistakes it for
  // a tested clause. `>= 0` already rejects NaN (NaN >= 0 is false) and -Infinity, so +Infinity is
  // the only value whose answer it changes — and every caller reaches this object through
  // `.fetch('https://do/...')` with a JSON body (gateway.ts:166/179/185/511/514, imagegen.ts:546),
  // where JSON.stringify turns Infinity into null. It is kept because Durable Object RPC uses
  // structured clone, which DOES preserve Infinity and NaN: the day any call site moves off fetch,
  // this clause becomes load-bearing. Found by rbxai-a3, whose falsification of it turned nothing
  // red. (Removing `>= 0` instead is falsifiable — the negative case covers it.)
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export type SpendResetScope = 'day' | 'month' | 'all';
export const SPEND_RESET_USAGE = 'send { "scope": "day" | "month" | "all", "confirm": true } — nothing was cleared';

/** The scope of a spend reset, or null unless the body names one AND carries `confirm: true`. */
export function readResetScope(body: unknown): SpendResetScope | null {
  if (!body || typeof body !== 'object') return null;
  const { scope, confirm } = body as { scope?: unknown; confirm?: unknown };
  if (confirm !== true) return null;
  return scope === 'day' || scope === 'month' || scope === 'all' ? scope : null;
}

export class BudgetDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`create table if not exists spend(
        day text not null, model text not null, kind text not null,
        neurons integer not null default 0, calls integer not null default 0,
        primary key (day, model, kind));`);
    });
  }

  /** Caps can be lowered (or raised) at runtime without a redeploy; compiled values are the default. */
  private async limits(): Promise<Limits> {
    const stored = await this.ctx.storage.get<Partial<Limits>>(LIMITS_KEY);
    return { ...DEFAULT_LIMITS, ...(stored ?? {}) };
  }

  private async load(): Promise<Stored> {
    const s = (await this.ctx.storage.get<Stored>(KEY)) ?? {
      day: today(),
      month: thisMonth(),
      dayNeurons: 0,
      dayPending: 0,
      monthBillableNeurons: 0,
      dayBillableNeurons: 0,
    };
    const d = today();
    const m = thisMonth();
    if (s.day !== d) {
      s.day = d;
      s.dayNeurons = 0;
      s.dayPending = 0;
      s.dayBillableNeurons = 0;
    }
    if (s.month !== m) {
      s.month = m;
      s.monthBillableNeurons = 0;
    }
    return s;
  }

  private async loadThirdParty(): Promise<ThirdPartyStored> {
    const t = (await this.ctx.storage.get<ThirdPartyStored>(TP_KEY)) ?? {
      day: today(),
      month: thisMonth(),
      dayNeurons: 0,
      dayPending: 0,
      monthNeurons: 0,
    };
    if (t.day !== today()) {
      t.day = today();
      t.dayNeurons = 0;
      t.dayPending = 0;
    }
    if (t.month !== thisMonth()) {
      t.month = thisMonth();
      t.monthNeurons = 0;
    }
    return t;
  }

  private thirdPartyView(t: ThirdPartyStored | undefined, limits: Limits): ThirdPartyView {
    const usd = (n: number) => Number(usdFor(n).toFixed(4));
    return {
      dayUsd: usd(t?.dayNeurons ?? 0),
      dayPendingUsd: usd(t?.dayPending ?? 0),
      monthUsd: usd(t?.monthNeurons ?? 0),
      dayCeilingUsd: usd(limits.thirdPartyNeuronsPerDay),
      monthCeilingUsd: usd(limits.thirdPartyNeuronsPerMonth),
    };
  }

  private view(
    s: Stored,
    killed: boolean,
    killedReason: string | null,
    limits: Limits = DEFAULT_LIMITS,
    t?: ThirdPartyStored,
  ): BudgetState {
    const used = s.dayNeurons + s.dayPending;
    const ceiling = FREE_NEURONS_PER_DAY + limits.billableNeuronsPerDay;
    return {
      day: s.day,
      month: s.month,
      dayNeurons: s.dayNeurons,
      dayPending: s.dayPending,
      monthBillableNeurons: s.monthBillableNeurons,
      killed,
      killedReason,
      dayRemainingFraction: Math.max(0, 1 - used / ceiling),
      estimatedMonthUsd: Number(usdFor(s.monthBillableNeurons).toFixed(4)),
      freeRemainingToday: Math.max(0, FREE_NEURONS_PER_DAY - used),
      thirdParty: this.thirdPartyView(t, limits),
    };
  }

  /**
   * Settle on the third-party ledger, with the neuron ledger's rules: the provider has already been
   * paid, so an unreadable figure is charged at the reservation (or the model's own cap), never at
   * zero, and an unreadable reservation is not subtracted.
   */
  private async settleThirdParty(
    reserved: unknown,
    actual: unknown,
    model: string,
    kind: string,
    killed: boolean,
    killedReason: string | null,
  ): Promise<Response> {
    const limits = await this.limits();
    const t = await this.loadThirdParty();
    const heldRaw = readableNeurons(reserved);
    const actualRaw = readableNeurons(actual);
    if (heldRaw !== null) t.dayPending = Math.max(0, t.dayPending - heldRaw);
    else console.warn(`budget: unreadable third-party reservation from model=${String(model).slice(0, 80)}; the hold leaks until the UTC rollover`);
    const spent = actualRaw !== null ? Math.ceil(actualRaw) : heldRaw !== null ? Math.ceil(heldRaw) : perCallCap(model, limits);
    t.dayNeurons += spent;
    t.monthNeurons += spent;
    await this.ctx.storage.put(TP_KEY, t);
    const s = await this.load();
    this.sql.exec(
      `insert into spend(day, model, kind, neurons, calls) values(?,?,?,?,1)
       on conflict(day, model, kind) do update set neurons = neurons + excluded.neurons, calls = calls + 1`,
      t.day,
      String(model).slice(0, 80),
      String(kind).slice(0, 40),
      spent,
    );
    return Response.json({
      ok: true,
      route: 'unified-billing',
      ...(actualRaw === null ? { estimated: true } : {}),
      state: this.view(s, killed, killedReason, limits, t),
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const killed = (await this.ctx.storage.get<boolean>('killed')) ?? false;
    const killedReason = (await this.ctx.storage.get<string>('killedReason')) ?? null;

    if (url.pathname === '/state') {
      return Response.json(this.view(await this.load(), killed, killedReason, await this.limits(), await this.loadThirdParty()));
    }

    if (url.pathname === '/limits' && req.method === 'POST') {
      const body = (await req.json()) as Partial<Limits>;
      const cur = await this.limits();
      // THIS ROUTE CAN ONLY RATCHET DOWN. The upper bound is the COMPILED default, not a wider
      // runtime ceiling.
      //
      // It used to clamp at 2,000,000 neurons/day and 20,000,000/month — $22/day and $220/month at
      // $0.011 per 1,000 — against compiled defaults of 15,000/day and 460,000/month. So a single
      // static secret could raise the bill roughly 22x, and `/api/admin/*` is exempt from user auth
      // (index.ts:74) and throttled only by a best-effort per-isolate limiter.
      //
      // That was survivable while the plan was a free tier that blocks. It is not now: the AI
      // Gateway is on STANDARD billing (owner-confirmed 2026-09-14), which bills overage with no
      // platform ceiling, and Cloudflare's budget alerts neither pause usage nor fire promptly.
      // BudgetDO is the only thing between a runaway loop and the invoice.
      //
      // Raising a limit is still possible — it just has to go through a deploy, where it is a diff
      // someone reviews, rather than a POST. Lowering stays instant, because lowering is what you
      // want to do quickly and in a hurry.
      const next: Limits = {
        billableNeuronsPerDay: clamp(body.billableNeuronsPerDay ?? cur.billableNeuronsPerDay, 0, DEFAULT_LIMITS.billableNeuronsPerDay),
        billableNeuronsPerMonth: clamp(body.billableNeuronsPerMonth ?? cur.billableNeuronsPerMonth, 0, DEFAULT_LIMITS.billableNeuronsPerMonth),
        maxNeuronsPerRequest: clamp(body.maxNeuronsPerRequest ?? cur.maxNeuronsPerRequest, 100, DEFAULT_LIMITS.maxNeuronsPerRequest),
        // The third-party ceilings ratchet the same way: down at runtime, up only by a deploy.
        thirdPartyNeuronsPerDay: clamp(body.thirdPartyNeuronsPerDay ?? cur.thirdPartyNeuronsPerDay, 0, DEFAULT_LIMITS.thirdPartyNeuronsPerDay),
        thirdPartyNeuronsPerMonth: clamp(body.thirdPartyNeuronsPerMonth ?? cur.thirdPartyNeuronsPerMonth, 0, DEFAULT_LIMITS.thirdPartyNeuronsPerMonth),
      };
      await this.ctx.storage.put(LIMITS_KEY, next);
      return Response.json({ ok: true, limits: next });
    }

    if (url.pathname === '/probe' && req.method === 'POST') {
      // dry-run the exact reserve decision, then leave state untouched
      const { neurons, model } = (await req.json()) as { neurons: number; model?: string };
      const s = await this.load();
      const limits = await this.limits();
      const asked = readableNeurons(neurons);
      if (asked !== null && isThirdParty(model)) {
        const t = await this.loadThirdParty();
        const want = Math.max(1, Math.ceil(asked));
        let verdict: string = 'allowed';
        if (killed) verdict = 'killed';
        else if (want > perCallCap(model, limits)) verdict = 'request_too_large';
        else if (t.dayNeurons + t.dayPending + want > limits.thirdPartyNeuronsPerDay) verdict = 'third_party_daily_cap';
        else if (t.monthNeurons + t.dayPending + want > limits.thirdPartyNeuronsPerMonth) verdict = 'third_party_monthly_cap';
        return Response.json({ verdict, want, route: 'unified-billing', limits, state: this.view(s, killed, killedReason, limits, t) });
      }
      if (asked === null) {
        // probe must agree with reserve on every verdict, including this one
        return Response.json({ verdict: 'unreadable_estimate', want: null, projectedDay: null, dayCeiling: FREE_NEURONS_PER_DAY + limits.billableNeuronsPerDay, limits, state: this.view(s, killed, killedReason, limits) });
      }
      const want = Math.max(1, Math.ceil(asked));
      const projectedDay = s.dayNeurons + s.dayPending + want;
      const dayCeiling = FREE_NEURONS_PER_DAY + limits.billableNeuronsPerDay;
      const billableAfter = Math.max(0, projectedDay - FREE_NEURONS_PER_DAY);
      const billableDelta = Math.max(0, billableAfter - s.dayBillableNeurons);
      let verdict: string = 'allowed';
      if (killed) verdict = 'killed';
      else if (want > perCallCap(model, limits)) verdict = 'request_too_large';
      else if (projectedDay > dayCeiling) verdict = 'daily_cap';
      else if (s.monthBillableNeurons + billableDelta > limits.billableNeuronsPerMonth) verdict = 'monthly_cap';
      return Response.json({ verdict, want, projectedDay, dayCeiling, limits, state: this.view(s, killed, killedReason, limits) });
    }

    if (url.pathname === '/simulate-usage' && req.method === 'POST') {
      // ADMIN-ONLY test hook: move the ledger without calling a model, so the caps can be
      // demonstrated end-to-end without burning real allocation.
      const { neurons } = (await req.json()) as { neurons: number };
      const add = readableNeurons(neurons);
      if (add === null) {
        return Response.json({ ok: false, reason: 'unreadable_amount' }, { status: 400 });
      }
      const s = await this.load();
      // additive only: an admin key must not be able to erase spend and slip past a cap
      s.dayNeurons = s.dayNeurons + Math.floor(add);
      const dayBillable = Math.max(0, s.dayNeurons - FREE_NEURONS_PER_DAY);
      s.monthBillableNeurons = Math.max(0, s.monthBillableNeurons + Math.max(0, dayBillable - s.dayBillableNeurons));
      s.dayBillableNeurons = dayBillable;
      await this.ctx.storage.put(KEY, s);
      return Response.json({ ok: true, state: this.view(s, killed, killedReason, await this.limits()) });
    }

    if (url.pathname === '/reset-ledger' && req.method === 'POST') {
      // clears simulated/test usage; real usage rolls over on its own at the day/month boundary.
      // The month ledger is the backstop the whole bill rests on, so nothing is cleared unless the
      // caller names what (day | month | all) and confirms — a bare POST used to erase both.
      const scope = readResetScope(await req.json().catch(() => null));
      if (!scope) {
        return Response.json({ ok: false, reason: 'scope_required', error: SPEND_RESET_USAGE }, { status: 400 });
      }
      const s = await this.load();
      if (scope === 'day' || scope === 'all') {
        s.dayNeurons = 0;
        s.dayPending = 0;
        s.dayBillableNeurons = 0;
      }
      if (scope === 'month' || scope === 'all') s.monthBillableNeurons = 0;
      await this.ctx.storage.put(KEY, s);
      if (scope === 'day' || scope === 'all') this.sql.exec(`delete from spend where day = ?`, s.day);
      return Response.json({ ok: true, scope, state: this.view(s, killed, killedReason, await this.limits()) });
    }

    if (url.pathname === '/reserve' && req.method === 'POST') {
      const { neurons, model } = (await req.json()) as { neurons: number; model: string };
      const s = await this.load();
      const limits = await this.limits();

      if (killed) {
        return Response.json({
          ok: false,
          reason: 'killed',
          message: killedReason ?? 'AI generation is paused.',
          state: this.view(s, killed, killedReason),
        });
      }
      // BEFORE the size check, because the size check is a `>` and would admit what it cannot read.
      const asked = readableNeurons(neurons);
      if (asked === null) {
        return Response.json({
          ok: false,
          reason: 'unreadable_estimate',
          message: 'The cost of this request could not be determined, so it was not run.',
          state: this.view(s, killed, killedReason, limits),
        });
      }
      if (Math.ceil(asked) > perCallCap(model, limits)) {
        return Response.json({
          ok: false,
          reason: 'request_too_large',
          state: this.view(s, killed, killedReason, limits),
        });
      }
      const want = Math.max(1, Math.ceil(asked));

      // A third-party model spends the third-party wallet and ONLY that one: its ceiling is in the
      // owner's dollars, and it must neither eat Apple's neuron day nor be admitted by it.
      if (isThirdParty(model)) {
        const t = await this.loadThirdParty();
        if (t.dayNeurons + t.dayPending + want > limits.thirdPartyNeuronsPerDay) {
          return Response.json({
            ok: false,
            reason: 'third_party_daily_cap',
            message: "Today's allowance for outside models (Gemini and GPT) is used up. Apple and Apple MAX still work, and it resets at midnight UTC.",
            state: this.view(s, killed, killedReason, limits, t),
          });
        }
        if (t.monthNeurons + t.dayPending + want > limits.thirdPartyNeuronsPerMonth) {
          return Response.json({
            ok: false,
            reason: 'third_party_monthly_cap',
            message: "This month's allowance for outside models (Gemini and GPT) is used up. Apple and Apple MAX still work.",
            state: this.view(s, killed, killedReason, limits, t),
          });
        }
        t.dayPending += want;
        await this.ctx.storage.put(TP_KEY, t);
        return Response.json({ ok: true, reserved: want, route: 'unified-billing', state: this.view(s, killed, killedReason, limits, t) });
      }

      const projectedDay = s.dayNeurons + s.dayPending + want;
      const dayCeiling = FREE_NEURONS_PER_DAY + limits.billableNeuronsPerDay;
      if (projectedDay > dayCeiling) {
        return Response.json({ ok: false, reason: 'daily_cap', state: this.view(s, killed, killedReason, limits) });
      }
      // only neurons beyond the day's free allocation count against the monthly billable cap
      const billableAfter = Math.max(0, projectedDay - FREE_NEURONS_PER_DAY);
      const billableDelta = Math.max(0, billableAfter - s.dayBillableNeurons);
      if (s.monthBillableNeurons + billableDelta > limits.billableNeuronsPerMonth) {
        return Response.json({ ok: false, reason: 'monthly_cap', state: this.view(s, killed, killedReason, limits) });
      }

      s.dayPending += want;
      await this.ctx.storage.put(KEY, s);
      return Response.json({ ok: true, reserved: want, state: this.view(s, killed, killedReason, limits) });
    }

    if (url.pathname === '/settle' && req.method === 'POST') {
      const { reserved, actual, model, kind } = (await req.json()) as {
        reserved: number;
        actual: number;
        model: string;
        kind: string;
      };
      if (isThirdParty(model)) return this.settleThirdParty(reserved, actual, model, kind, killed, killedReason);
      const s = await this.load();

      // Settle runs AFTER the provider has been paid, so refusing an unreadable cost here would
      // record the spend as zero — exactly the failure being prevented. The conservative
      // reservation is charged instead, and the response says the figure is an estimate so a
      // caller can never mistake it for a measurement.
      const heldRaw = readableNeurons(reserved);
      const actualRaw = readableNeurons(actual);
      const unreadable: string[] = [];
      if (heldRaw === null) unreadable.push('reserved');
      if (actualRaw === null) unreadable.push('actual');

      // An unreadable reservation is NOT subtracted: guessing would let one caller erase another
      // caller's reservation. It leaks until the UTC rollover, which shrinks capacity — closed.
      if (heldRaw !== null) {
        s.dayPending = Math.max(0, s.dayPending - heldRaw);
      } else {
        // THE LEAK IS ANNOUNCED. Not subtracting is correct — guessing would let one caller erase
        // another caller's reservation — but the reservation then sits until the UTC rollover,
        // capacity quietly shrinks, and /reserve starts refusing with `daily_cap`. An operator
        // would see a full budget with no spend to match it, which is indistinguishable from
        // genuine demand. `estimated` reaches the caller; this reaches whoever is reading logs.
        // Found by rbxai-1d reviewing the commit that added the guard above.
        console.warn(
          `budget: unreadable reservation (${whyUnreadable(reserved)}) from model=${String(model).slice(0, 80)} ` +
            `kind=${String(kind).slice(0, 40)}; the hold is NOT released and leaks until the UTC rollover`,
        );
      }

      let spent: number;
      if (actualRaw !== null) {
        spent = Math.ceil(actualRaw);
      } else if (heldRaw !== null) {
        spent = Math.ceil(heldRaw);
      } else {
        // Nothing readable at all: charge the most it could have been. A true upper bound, because
        // /reserve already refused anything above it.
        spent = perCallCap(model, await this.limits());
        console.warn(
          `budget: neither reservation nor actual was readable for model=${String(model).slice(0, 80)} ` +
            `kind=${String(kind).slice(0, 40)}; charging the per-request ceiling ${spent} as an upper bound`,
        );
      }
      s.dayNeurons += spent;
      const dayBillable = Math.max(0, s.dayNeurons - FREE_NEURONS_PER_DAY);
      s.monthBillableNeurons += Math.max(0, dayBillable - s.dayBillableNeurons);
      s.dayBillableNeurons = dayBillable;
      await this.ctx.storage.put(KEY, s);
      this.sql.exec(
        `insert into spend(day, model, kind, neurons, calls) values(?,?,?,?,1)
         on conflict(day, model, kind) do update set neurons = neurons + excluded.neurons, calls = calls + 1`,
        s.day,
        String(model).slice(0, 80),
        String(kind).slice(0, 40),
        spent,
      );
      this.sql.exec(`delete from spend where day < ?`, new Date(Date.now() - days(RETENTION.serviceSpendDays)).toISOString().slice(0, 10));
      return Response.json({
        ok: true,
        ...(unreadable.length
          ? {
              estimated: true,
              unreadable: unreadable.join('+'),
              unreadableWhy: whyUnreadable(actualRaw === null ? actual : reserved),
            }
          : {}),
        state: this.view(s, killed, killedReason),
      });
    }

    if (url.pathname === '/release' && req.method === 'POST') {
      // a call failed before consuming anything — hand the reservation back
      const { reserved, model } = (await req.json()) as { reserved: number; model?: string };
      const held = readableNeurons(reserved);
      if (held === null) {
        // Subtracting an unreadable amount would either poison the counter with NaN or, clamped,
        // erase reservations this caller never made. Leaking fails closed; guessing does not.
        return Response.json({ ok: false, reason: 'unreadable_reservation' }, { status: 400 });
      }
      // Released on the ledger it was reserved on. A release that names no model is from a caller
      // that only ever reserves Workers AI models (images, speech), so that is the neuron ledger.
      if (isThirdParty(model)) {
        const t = await this.loadThirdParty();
        t.dayPending = Math.max(0, t.dayPending - held);
        await this.ctx.storage.put(TP_KEY, t);
        return Response.json({ ok: true });
      }
      const s = await this.load();
      s.dayPending = Math.max(0, s.dayPending - held);
      await this.ctx.storage.put(KEY, s);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/kill' && req.method === 'POST') {
      const { killed: k, reason } = (await req.json()) as { killed: boolean; reason?: string };
      await this.ctx.storage.put({ killed: !!k, killedReason: k ? (reason ?? 'Paused by an administrator.') : null });
      return Response.json({ ok: true, killed: !!k });
    }

    if (url.pathname === '/report') {
      const s = await this.load();
      const limits = await this.limits();
      const rows = this.sql
        .exec(
          `select day, model, kind, neurons, calls from spend where day >= ? order by day desc, neurons desc`,
          new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
        )
        .toArray() as { day: string; model: string; kind: string; neurons: number; calls: number }[];
      const byDay = new Map<string, { neurons: number; calls: number }>();
      for (const r of rows) {
        // The per-day totals are the NEURON wallet's, and their billable column subtracts the free
        // allocation. Third-party spend has neither, so it is left to the breakdown and to
        // state.thirdParty rather than folded into a neuron total it would misstate.
        if (isThirdParty(r.model)) continue;
        const e = byDay.get(r.day) ?? { neurons: 0, calls: 0 };
        e.neurons += r.neurons;
        e.calls += r.calls;
        byDay.set(r.day, e);
      }
      return Response.json({
        state: this.view(s, killed, killedReason, limits, await this.loadThirdParty()),
        limits: { freeNeuronsPerDay: FREE_NEURONS_PER_DAY, ...limits },
        maxThirdPartyDailyUsd: Number(usdFor(limits.thirdPartyNeuronsPerDay).toFixed(2)),
        maxThirdPartyMonthlyUsd: Number(usdFor(limits.thirdPartyNeuronsPerMonth).toFixed(2)),
        maxMonthlyUsd: Number(usdFor(limits.billableNeuronsPerMonth).toFixed(2)),
        days: [...byDay.entries()]
          .map(([day, v]) => ({
            day,
            neurons: v.neurons,
            calls: v.calls,
            billableNeurons: Math.max(0, v.neurons - FREE_NEURONS_PER_DAY),
            billableUsd: Number(usdFor(Math.max(0, v.neurons - FREE_NEURONS_PER_DAY)).toFixed(4)),
          }))
          .sort((a, b) => b.day.localeCompare(a.day)),
        breakdown: rows.slice(0, 60).map((r) => ({ ...r, usd: Number(usdFor(r.neurons).toFixed(5)) })),
      });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
