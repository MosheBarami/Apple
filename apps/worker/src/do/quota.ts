// QuotaDO - one per user. Authoritative Credits ledger with daily UTC reset.
// Keeps worst-case inference spend inside the free neuron allocation.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import type { QuotaState } from '@golem/shared';
import { isPlanId, type PlanId } from '../pricing';
import type { Subscription } from '../billing';
import { dayKey, monthKey, quotaState, splitSpend } from '../quota-math';

/** One line of this account's billing history, as the product reads it back. */
interface BillingChange {
  at: number;
  kind: 'plan' | 'credits';
  fromPlan: PlanId | null;
  toPlan: PlanId | null;
  status: string | null;
  eventId: string | null;
}

export class QuotaDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`create table if not exists ledger(
        id integer primary key autoincrement, day text not null, kind text not null,
        credits integer not null, created_at integer not null);
        create index if not exists ledger_day on ledger(day);
        create table if not exists billing_events(
        id integer primary key autoincrement, at integer not null, kind text not null,
        from_plan text, to_plan text, status text, event_id text);
        create table if not exists applied_events(event_id text primary key, at integer not null);`);
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

  /** The full Stripe subscription as last seen, or null for an account that never bought one. */
  private async subscription(): Promise<Subscription | null> {
    return (await this.ctx.storage.get<Subscription>('subscription')) ?? null;
  }

  /**
   * Claim a Stripe event id, returning false if it has already been applied here.
   *
   * WHY THE SIGNATURE WINDOW IS NOT ENOUGH. `verifyStripeSignature` bounds replays to 300 seconds;
   * it does not make a second delivery inside that window a no-op, and Stripe genuinely redelivers
   * an event whose response it did not receive. An additive grant applied twice is money.
   *
   * An event with NO id is applied. Deduplication must never become a reason to lose a purchase.
   */
  private claimEvent(eventId: string | null | undefined): boolean {
    if (typeof eventId !== 'string' || eventId.length === 0) return true;
    const key = eventId.slice(0, 120);
    const seen = this.sql.exec(`select event_id from applied_events where event_id = ?`, key).toArray();
    if (seen.length > 0) return false;
    this.sql.exec(`insert into applied_events(event_id, at) values(?,?)`, key, Date.now());
    // Far outside any redelivery window Stripe uses, and the same horizon the ledger is pruned on.
    this.sql.exec(`delete from applied_events where at < ?`, Date.now() - 35 * 864e5);
    return true;
  }

  private record(kind: 'plan' | 'credits', from: PlanId | null, to: PlanId | null, status: string | null, eventId: string | null): void {
    this.sql.exec(
      `insert into billing_events(at, kind, from_plan, to_plan, status, event_id) values(?,?,?,?,?,?)`,
      Date.now(), kind, from, to, status, eventId,
    );
  }

  private async state(): Promise<QuotaState> {
    // This method now does exactly two things a test cannot do for itself: read storage, and read
    // the clock. Everything decided from those values lives in quota-math, where a day boundary is
    // an argument rather than a thing to wait for.
    const dayRow = this.sql.exec(`select coalesce(sum(credits),0) as s from ledger where day = ?`, this.today()).one() as { s: number };
    const monthRow = this.sql
      .exec(`select coalesce(sum(credits),0) as s from ledger where day like ?`, `${this.thisMonth()}%`)
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
      const { credits, kind } = (await req.json()) as { credits: number; kind: string };
      const st = await this.state();
      // Allowance first, credits only for the remainder. Spending a purchased balance while a free
      // allowance is still available would quietly charge the user for something they already had.
      const split = splitSpend(credits, st.allowanceRemaining, st.credits);
      if (!split.affordable) return Response.json({ ok: false, state: st });
      const { fromAllowance, fromCredits } = split;
      if (fromCredits > 0) await this.ctx.storage.put('credits', Math.max(0, st.credits - fromCredits));
      if (fromAllowance > 0) {
        this.sql.exec(`insert into ledger(day, kind, credits, created_at) values(?,?,?,?)`, this.today(), kind.slice(0, 40), fromAllowance, Date.now());
      }
      this.sql.exec(`delete from ledger where day < ?`, dayKey(Date.now() - 35 * 864e5));
      const after = await this.state();
      return Response.json({ ok: true, state: after });
    }
    if (url.pathname === '/set-plan' && req.method === 'POST') {
      const { plan, customerId, subscription, eventId } = (await req.json()) as {
        plan: string;
        customerId?: string | null;
        subscription?: Subscription | null;
        eventId?: string | null;
      };
      if (!this.claimEvent(eventId)) {
        // Stripe redelivers an event it did not hear back about. Applying it again would move the
        // plan a second time from a state that has since changed.
        return Response.json({ ok: true, replayed: true, state: await this.state() });
      }
      const before = await this.plan();
      const beforeSub = await this.subscription();
      // An unrecognised plan id becomes free rather than throwing: this is driven by a webhook, and
      // a Stripe product renamed upstream must degrade to the safe tier, not wedge the route.
      const next: PlanId = isPlanId(plan) ? plan : 'free';
      await this.ctx.storage.put('plan', next);
      // THE WHOLE SUBSCRIPTION, not only the tier it entitles. status, currentPeriodEnd and
      // cancelAtPeriodEnd were parsed from the event and then discarded here, which left the
      // product unable to tell a subscription that renews from one that cancels at the period end
      // — two opposite sentences printed from the same field.
      if (subscription && typeof subscription === 'object') {
        await this.ctx.storage.put('subscription', subscription);
      }
      // The Stripe customer, kept so the billing portal has something to open. It is written only
      // when the webhook actually carries one, and never cleared by a plan change: a cancelled
      // subscription still belongs to a customer whose invoices and card the user can manage, and
      // dropping the id here would strand them on Free with no way back into their own billing.
      if (typeof customerId === 'string' && customerId.length > 0) {
        await this.ctx.storage.put('stripeCustomerId', customerId);
      }
      const status = subscription?.status ?? null;
      // A ROW PER CHANGE, NOT A ROW PER DELIVERY. Stripe sends subscription.updated for things this
      // product does not model at all; logging those would bury the changes that matter.
      if (next !== before || status !== (beforeSub?.status ?? null)) {
        this.record('plan', before, next, status, eventId ?? null);
      }
      return Response.json({ ok: true, state: await this.state() });
    }
    if (url.pathname === '/billing-customer' && req.method === 'GET') {
      return Response.json({ customerId: (await this.ctx.storage.get<string>('stripeCustomerId')) ?? null });
    }
    /**
     * Everything this account's billing surfaces need, in one read: the enforced plan, the Stripe
     * customer the portal opens, the full subscription record, and the change history.
     */
    if (url.pathname === '/billing' && req.method === 'GET') {
      const sub = await this.subscription();
      const events = this.sql
        .exec(`select at, kind, from_plan, to_plan, status, event_id from billing_events order by at desc, id desc limit 50`)
        .toArray() as Record<string, unknown>[];
      return Response.json({
        plan: await this.plan(),
        customerId: (await this.ctx.storage.get<string>('stripeCustomerId')) ?? null,
        subscription: sub,
        // Renamed on the way out rather than leaking column spellings into the API.
        events: events.map((r): BillingChange => ({
          at: Number(r['at']),
          kind: r['kind'] === 'credits' ? 'credits' : 'plan',
          fromPlan: (r['from_plan'] as PlanId | null) ?? null,
          toPlan: (r['to_plan'] as PlanId | null) ?? null,
          status: (r['status'] as string | null) ?? null,
          eventId: (r['event_id'] as string | null) ?? null,
        })),
      });
    }
    if (url.pathname === '/grant-credits' && req.method === 'POST') {
      const { credits, eventId } = (await req.json()) as { credits: number; eventId?: string | null };
      if (!this.claimEvent(eventId)) {
        // The defect this closes: /grant-credits is additive, so a redelivery inside the signature
        // tolerance granted a second balance for one purchase.
        return Response.json({ ok: true, replayed: true, granted: 0, state: await this.state() });
      }
      // Additive only, and never negative. The same rule as /simulate-usage: a billing path that
      // can subtract is a billing path that can erase evidence of spend.
      const add = Math.max(0, Math.floor(Number(credits) || 0));
      await this.ctx.storage.put('credits', (await this.credits()) + add);
      // Nothing granted is not a change, and a history of changes that did not happen is worse
      // than no history.
      if (add > 0) this.record('credits', null, null, null, eventId ?? null);
      return Response.json({ ok: true, granted: add, state: await this.state() });
    }
    // Clear a day's Credit usage for THIS user. Owner-key gated at the edge, and it only ever
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
        .exec(`select day, sum(credits) as credits, count(*) as events from ledger group by day order by day desc limit 30`)
        .toArray();
      return Response.json({ days: rows });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
