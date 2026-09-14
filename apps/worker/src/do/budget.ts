// BudgetDO — singleton. The one place that decides whether any inference is allowed to run.
//
// Every AI call must reserve neurons here BEFORE it executes and settle the true cost after.
// Because a Durable Object is single-threaded and globally unique, concurrent requests cannot
// race past the ceiling: reservations are serialized. If this object says no, no tokens are spent.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import {
  BILLABLE_NEURONS_PER_DAY,
  BILLABLE_NEURONS_PER_MONTH,
  FREE_NEURONS_PER_DAY,
  MAX_NEURONS_PER_REQUEST,
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
}

interface Stored {
  day: string;
  month: string;
  dayNeurons: number;
  dayPending: number;
  monthBillableNeurons: number;
  dayBillableNeurons: number;
}

const KEY = 'budget';
const LIMITS_KEY = 'limits';

interface Limits {
  billableNeuronsPerDay: number;
  billableNeuronsPerMonth: number;
  maxNeuronsPerRequest: number;
}
const DEFAULT_LIMITS: Limits = {
  billableNeuronsPerDay: BILLABLE_NEURONS_PER_DAY,
  billableNeuronsPerMonth: BILLABLE_NEURONS_PER_MONTH,
  maxNeuronsPerRequest: MAX_NEURONS_PER_REQUEST,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0)));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
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

  private view(s: Stored, killed: boolean, killedReason: string | null, limits: Limits = DEFAULT_LIMITS): BudgetState {
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
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const killed = (await this.ctx.storage.get<boolean>('killed')) ?? false;
    const killedReason = (await this.ctx.storage.get<string>('killedReason')) ?? null;

    if (url.pathname === '/state') {
      return Response.json(this.view(await this.load(), killed, killedReason, await this.limits()));
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
      };
      await this.ctx.storage.put(LIMITS_KEY, next);
      return Response.json({ ok: true, limits: next });
    }

    if (url.pathname === '/probe' && req.method === 'POST') {
      // dry-run the exact reserve decision, then leave state untouched
      const { neurons } = (await req.json()) as { neurons: number };
      const s = await this.load();
      const limits = await this.limits();
      const want = Math.max(1, Math.ceil(neurons));
      const projectedDay = s.dayNeurons + s.dayPending + want;
      const dayCeiling = FREE_NEURONS_PER_DAY + limits.billableNeuronsPerDay;
      const billableAfter = Math.max(0, projectedDay - FREE_NEURONS_PER_DAY);
      const billableDelta = Math.max(0, billableAfter - s.dayBillableNeurons);
      let verdict: string = 'allowed';
      if (killed) verdict = 'killed';
      else if (want > limits.maxNeuronsPerRequest) verdict = 'request_too_large';
      else if (projectedDay > dayCeiling) verdict = 'daily_cap';
      else if (s.monthBillableNeurons + billableDelta > limits.billableNeuronsPerMonth) verdict = 'monthly_cap';
      return Response.json({ verdict, want, projectedDay, dayCeiling, limits, state: this.view(s, killed, killedReason, limits) });
    }

    if (url.pathname === '/simulate-usage' && req.method === 'POST') {
      // ADMIN-ONLY test hook: move the ledger without calling a model, so the caps can be
      // demonstrated end-to-end without burning real allocation.
      const { neurons } = (await req.json()) as { neurons: number };
      const s = await this.load();
      // additive only: an admin key must not be able to erase spend and slip past a cap
      s.dayNeurons = s.dayNeurons + Math.max(0, Math.floor(neurons));
      const dayBillable = Math.max(0, s.dayNeurons - FREE_NEURONS_PER_DAY);
      s.monthBillableNeurons = Math.max(0, s.monthBillableNeurons + Math.max(0, dayBillable - s.dayBillableNeurons));
      s.dayBillableNeurons = dayBillable;
      await this.ctx.storage.put(KEY, s);
      return Response.json({ ok: true, state: this.view(s, killed, killedReason, await this.limits()) });
    }

    if (url.pathname === '/reset-ledger' && req.method === 'POST') {
      // clears simulated/test usage; real usage rolls over on its own at the day/month boundary
      const s = await this.load();
      s.dayNeurons = 0;
      s.dayPending = 0;
      s.dayBillableNeurons = 0;
      s.monthBillableNeurons = 0;
      await this.ctx.storage.put(KEY, s);
      this.sql.exec(`delete from spend where day = ?`, s.day);
      return Response.json({ ok: true, state: this.view(s, killed, killedReason, await this.limits()) });
    }

    if (url.pathname === '/reserve' && req.method === 'POST') {
      const { neurons } = (await req.json()) as { neurons: number; model: string };
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
      if (Math.ceil(neurons) > limits.maxNeuronsPerRequest) {
        return Response.json({
          ok: false,
          reason: 'request_too_large',
          state: this.view(s, killed, killedReason, limits),
        });
      }
      const want = Math.max(1, Math.ceil(neurons));

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
      const s = await this.load();
      s.dayPending = Math.max(0, s.dayPending - reserved);
      const spent = Math.max(0, Math.ceil(actual));
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
      this.sql.exec(`delete from spend where day < ?`, new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10));
      return Response.json({ ok: true, state: this.view(s, killed, killedReason) });
    }

    if (url.pathname === '/release' && req.method === 'POST') {
      // a call failed before consuming anything — hand the reservation back
      const { reserved } = (await req.json()) as { reserved: number };
      const s = await this.load();
      s.dayPending = Math.max(0, s.dayPending - reserved);
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
        const e = byDay.get(r.day) ?? { neurons: 0, calls: 0 };
        e.neurons += r.neurons;
        e.calls += r.calls;
        byDay.set(r.day, e);
      }
      return Response.json({
        state: this.view(s, killed, killedReason, limits),
        limits: { freeNeuronsPerDay: FREE_NEURONS_PER_DAY, ...limits },
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
