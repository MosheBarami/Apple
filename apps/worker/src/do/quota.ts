// QuotaDO - one per user. Authoritative Sparks ledger with daily UTC reset.
// Keeps worst-case inference spend inside the free neuron allocation.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import type { QuotaState } from '@golem/shared';
import { PLAN_LIMITS } from '../pricing';

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

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private thisMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private async state(): Promise<QuotaState> {
    const plan = (await this.ctx.storage.get<string>('plan')) ?? 'free';
    const limits = plan === 'pro' ? PLAN_LIMITS.pro : PLAN_LIMITS.free;
    const day = this.today();
    const dayRow = this.sql.exec(`select coalesce(sum(sparks),0) as s from ledger where day = ?`, day).one() as { s: number };
    const monthRow = this.sql
      .exec(`select coalesce(sum(sparks),0) as s from ledger where day like ?`, `${this.thisMonth()}%`)
      .one() as { s: number };
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    // whichever limit bites first is the one the user actually has
    const dailyLeft = Math.max(0, limits.sparksPerDay - dayRow.s);
    const monthlyLeft = Math.max(0, limits.sparksPerMonth - monthRow.s);
    return {
      sparksRemaining: Math.min(dailyLeft, monthlyLeft),
      sparksDaily: limits.sparksPerDay,
      sparksMonthly: limits.sparksPerMonth,
      sparksUsedToday: dayRow.s,
      sparksUsedThisMonth: monthRow.s,
      resetsAtIso: tomorrow.toISOString(),
      plan: plan === 'pro' ? 'pro' : 'free',
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/state') {
      return Response.json(await this.state());
    }
    if (url.pathname === '/spend' && req.method === 'POST') {
      const { sparks, kind } = (await req.json()) as { sparks: number; kind: string };
      const st = await this.state();
      if (st.sparksRemaining < sparks) return Response.json({ ok: false, state: st });
      this.sql.exec(`insert into ledger(day, kind, sparks, created_at) values(?,?,?,?)`, this.today(), kind.slice(0, 40), sparks, Date.now());
      this.sql.exec(`delete from ledger where day < ?`, new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10));
      const after = await this.state();
      return Response.json({ ok: true, state: after });
    }
    if (url.pathname === '/set-plan' && req.method === 'POST') {
      const { plan } = (await req.json()) as { plan: string };
      await this.ctx.storage.put('plan', plan === 'pro' ? 'pro' : 'free');
      return Response.json({ ok: true, state: await this.state() });
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
