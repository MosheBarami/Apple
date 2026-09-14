// QuotaDO - one per user. Authoritative Sparks ledger with daily UTC reset.
// Keeps worst-case inference spend inside the free neuron allocation.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import type { QuotaState } from '@golem/shared';
import { isPlanId, type PlanId } from '../pricing';
import { dayKey, monthKey, quotaState, splitSpend } from '../quota-math';

export class QuotaDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`create table if not exists ledger(
        id integer primary key autoincrement, day text not null, kind text not null,
        sparks integer not null, created_at integer not null);
        create index if not exists ledger_day on ledger(day);`);
    });
  }

  // Both defer to quota-math so the key this DO writes and queries is the same key the tests
  // reason about. Two definitions of "today" is the bug that makes a rollover untestable.
  private today(): string {
    return dayKey(Date.now());
  }

  private thisMonth(): string {
    return monthKey(Date.now());
  }

  private async plan(): Promise<PlanId> {
    const raw = await this.ctx.storage.get<string>('plan');
    return isPlanId(raw) ? raw : 'free';
  }

  /** Purchased, non-expiring balance. Spent only once the renewable allowance is gone. */
  private async credits(): Promise<number> {
    return (await this.ctx.storage.get<number>('credits')) ?? 0;
  }

  private async state(): Promise<QuotaState> {
    // This method now does exactly two things a test cannot do for itself: read storage, and read
    // the clock. Everything decided from those values lives in quota-math, where a day boundary is
    // an argument rather than a thing to wait for.
    const dayRow = this.sql.exec(`select coalesce(sum(sparks),0) as s from ledger where day = ?`, this.today()).one() as { s: number };
    const monthRow = this.sql
      .exec(`select coalesce(sum(sparks),0) as s from ledger where day like ?`, `${this.thisMonth()}%`)
      .one() as { s: number };
    return quotaState({
      plan: await this.plan(),
      spentToday: dayRow.s,
      spentThisMonth: monthRow.s,
      credits: await this.credits(),
      now: Date.now(),
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/state') {
      return Response.json(await this.state());
    }
    if (url.pathname === '/spend' && req.method === 'POST') {
      const { sparks, kind } = (await req.json()) as { sparks: number; kind: string };
      const st = await this.state();
      // Allowance first, credits only for the remainder. Spending a purchased balance while a free
      // allowance is still available would quietly charge the user for something they already had.
      const split = splitSpend(sparks, st.allowanceRemaining, st.credits);
      if (!split.affordable) return Response.json({ ok: false, state: st });
      const { fromAllowance, fromCredits } = split;
      if (fromCredits > 0) await this.ctx.storage.put('credits', Math.max(0, st.credits - fromCredits));
      if (fromAllowance > 0) {
        this.sql.exec(`insert into ledger(day, kind, sparks, created_at) values(?,?,?,?)`, this.today(), kind.slice(0, 40), fromAllowance, Date.now());
      }
      this.sql.exec(`delete from ledger where day < ?`, dayKey(Date.now() - 35 * 864e5));
      const after = await this.state();
      return Response.json({ ok: true, state: after });
    }
    if (url.pathname === '/set-plan' && req.method === 'POST') {
      const { plan } = (await req.json()) as { plan: string };
      // An unrecognised plan id becomes free rather than throwing: this is driven by a webhook, and
      // a Stripe product renamed upstream must degrade to the safe tier, not wedge the route.
      await this.ctx.storage.put('plan', isPlanId(plan) ? plan : 'free');
      return Response.json({ ok: true, state: await this.state() });
    }
    if (url.pathname === '/grant-credits' && req.method === 'POST') {
      const { credits } = (await req.json()) as { credits: number };
      // Additive only, and never negative. The same rule as /simulate-usage: a billing path that
      // can subtract is a billing path that can erase evidence of spend.
      const add = Math.max(0, Math.floor(Number(credits) || 0));
      await this.ctx.storage.put('credits', (await this.credits()) + add);
      return Response.json({ ok: true, granted: add, state: await this.state() });
    }
    // Clear a day's Spark usage for THIS user. Owner-key gated at the edge, and it only ever
    // touches the quota DO it is addressed to — no other user, no project data, and not the global
    // neuron ledger or its caps. It exists so the visual benchmark can run on demand: one
    // quality-gated build now costs more than a whole day's free allowance, so without this the
    // suite could only be run once per UTC day.
    if (url.pathname === '/reset' && req.method === 'POST') {
      const { day } = (await req.json().catch(() => ({}))) as { day?: string };
      const target = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : this.today();
      this.sql.exec(`delete from ledger where day = ?`, target);
      return Response.json({ ok: true, cleared: target, state: await this.state() });
    }
    if (url.pathname === '/history') {
      const rows = this.sql
        .exec(`select day, sum(sparks) as sparks, count(*) as events from ledger group by day order by day desc limit 30`)
        .toArray();
      return Response.json({ days: rows });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
