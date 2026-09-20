// QuotaDO - one per user. Authoritative Credits ledger with daily UTC reset.
// Keeps worst-case inference spend inside the free neuron allocation.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import type { QuotaState } from '@golem/shared';
import { isPlanId, type PlanId } from '../pricing';
import { entitlementFor, NO_BILLING_DETAILS, readBillingDetails, type BillingDetails, type Subscription } from '../billing';
import {
  BillingAuthorityError,
  billingSourceEventId,
  isBillingMutation,
  localQuotaRequestForBillingMutation,
  resolveBillingAuthorityMutation,
  sequenceBillingMutation,
  type BillingMutation,
} from '../billing-origin-authority';
import { dayKey, monthKey, monthTotalComplete, prevMonthKey, quotaState, splitSpend } from '../quota-math';
import { RETENTION, days } from '../retention';

/**
 * How long a ledger row survives. The prune in `/spend` deletes anything older, so this number is
 * part of every answer the ledger gives: an empty list means "nothing in the last 35 days", which
 * is not the same sentence as "this account has never spent".
 */
export const LEDGER_RETENTION_DAYS = RETENTION.quotaLedgerDays;

/** Rows one `/ledger` read may return, and the ceiling on what a caller may ask for. */
const LEDGER_DEFAULT_LIMIT = 200;
const LEDGER_MAX_LIMIT = 500;

const BILLING_AUTHORITY_SEQUENCE_KEY = 'billingAuthoritySequence';
const BILLING_AUTHORITY_USER_KEY = 'billingAuthorityUserId';
const BILLING_AUTHORITY_SUBSCRIPTION_SEQUENCE_KEY = 'billingAuthoritySubscriptionSequence';
const BILLING_REPLICA_USER_KEY = 'billingReplicaUserId';
const BILLING_REPLICA_SUBSCRIPTION_SEQUENCE_KEY = 'billingReplicaSubscriptionSequence';

/** One line of this account's billing history, as the product reads it back. */
interface BillingChange {
  at: number;
  kind: 'plan' | 'credits';
  fromPlan: PlanId | null;
  toPlan: PlanId | null;
  status: string | null;
  eventId: string | null;
  /**
   * Which way the cancellation flag moved, on the row where it actually moved — and NULL everywhere
   * else.
   *
   * It is not "the flag as it stood": a past_due row that merely carried `false` along would then
   * read as "cancellation undone" over a failed payment. Non-null means this change WAS the flag.
   */
  cancelAtPeriodEnd: boolean | null;
}

export class QuotaDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  /** Serialises billing authority/replica work across external awaits inside one per-user DO. */
  private billingSerialTail: Promise<void> = Promise.resolve();

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
        create table if not exists applied_events(event_id text primary key, at integer not null);
        /* One row per refunded run. Its presence is what makes /refund idempotent: a Durable
           Object alarm can be retried, and a refund applied twice mints Credits out of a crash. */
        create table if not exists applied_refunds(
          refund_id text primary key, at integer not null, credits integer not null);
        create index if not exists applied_refunds_at on applied_refunds(at);
        create table if not exists month_totals(month text primary key, credits integer not null);
        create table if not exists billing_authority_replays(
          source_event_id text primary key,
          authority_sequence integer not null,
          mutation_json text not null,
          at integer not null);
        create index if not exists billing_authority_replays_at on billing_authority_replays(at);`);
      // billing_events gained a column after rows already existed in every deployed DO, and
      // `create table if not exists` does not add one to a table that is already there. SQLite has
      // no `add column if not exists`, so the alter is attempted on every start and throws
      // harmlessly once it has been applied. Swallowing it here is the migration.
      try {
        this.sql.exec(`alter table billing_events add column cancel_at_period_end integer`);
      } catch {
        /* already migrated */
      }
      //[[ THE CURRENCY WAS RENAMED AND THE LIVE TABLES WERE NOT.
      //
      //   `ledger` shipped in fa9ee14 as `sparks integer not null`. The product's currency later
      //   became Credits and the CREATE above was rewritten to say `credits` — but
      //   `create table if not exists` does nothing at all to a table that already exists, so every
      //   QuotaDO created before that rename still has a `sparks` column and no `credits` one.
      //
      //   For those users `state()` throws `no such column: credits`, and `state()` is on the hot
      //   path: /state, the charge path and every refund call it. So the failure is not cosmetic —
      //   a user whose DO predates the rename cannot spend a Credit. Found in production on
      //   2026-09-20 through Sentry APPLE-WORKER-6, on a real account.
      //
      //   RENAME, NOT ADD. `add column credits` would leave every historical row reading 0 and the
      //   user's whole spend history would silently become "never spent" — the account would look
      //   fresh and be billed as fresh. The rename carries the rows over.
      //
      //   Attempted on every start and thrown away once applied, exactly like the alter above: on a
      //   DO created fresh with `credits` there is no `sparks` to rename and this throws
      //   immediately. The same drift was already known and handled on the Supabase side — see the
      //   `credits:sparks` retry in account-export.ts — and never here. ]]
      try {
        this.sql.exec(`alter table ledger rename column sparks to credits`);
      } catch {
        /* already migrated, or created fresh with `credits` */
      }
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
   * What THIS PRODUCT last set on the Stripe customer's invoice fields.
   *
   * It is not a second address book: Stripe prints the invoice and Stripe's copy is the one that
   * counts. This record exists so a save can tell "never set" from "set and then removed" — the two
   * are the same null on the way in, and only one of them may erase a field on Stripe's side.
   */
  private async billingDetails(): Promise<BillingDetails> {
    return (await this.ctx.storage.get<BillingDetails>('billingDetails')) ?? NO_BILLING_DETAILS;
  }

  private serialBilling<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.billingSerialTail.then(operation, operation);
    this.billingSerialTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private billingFailure(error: unknown): Response {
    if (error instanceof BillingAuthorityError) {
      return Response.json({ ok: false, error: error.code }, { status: error.status });
    }
    return Response.json({ ok: false, error: 'billing_authority_failed' }, { status: 503 });
  }

  private async pinBillingUser(key: string, userId: string): Promise<void> {
    const pinned = await this.ctx.storage.get<string>(key);
    if (pinned !== undefined && pinned !== userId) {
      throw new BillingAuthorityError('billing_user_mismatch', 409, 'Billing mutation belongs to a different account');
    }
    if (pinned === undefined) await this.ctx.storage.put(key, userId);
  }

  private async nextBillingAuthoritySequence(): Promise<number> {
    const raw = await this.ctx.storage.get<number>(BILLING_AUTHORITY_SEQUENCE_KEY);
    const current = raw === undefined ? 0 : raw;
    if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
      throw new BillingAuthorityError('billing_authority_sequence_invalid', 503, 'Billing authority sequence is invalid');
    }
    const next = current + 1;
    await this.ctx.storage.put(BILLING_AUTHORITY_SEQUENCE_KEY, next);
    return next;
  }

  private authorityReplay(sourceEventId: string): BillingMutation | null {
    const rows = this.sql
      .exec(
        'select authority_sequence, mutation_json from billing_authority_replays where source_event_id = ?',
        sourceEventId,
      )
      .toArray() as Record<string, unknown>[];
    if (rows.length === 0) return null;
    const row = rows[0]!;
    let mutation: unknown;
    try {
      mutation = JSON.parse(String(row['mutation_json']));
    } catch {
      throw new BillingAuthorityError('billing_authority_replay_invalid', 503, 'Stored billing replay is invalid');
    }
    if (
      !isBillingMutation(mutation)
      || mutation.sourceEventId !== sourceEventId
      || mutation.authoritySequence !== Number(row['authority_sequence'])
    ) {
      throw new BillingAuthorityError('billing_authority_replay_invalid', 503, 'Stored billing replay is invalid');
    }
    return mutation;
  }

  private storeAuthorityReplay(mutation: BillingMutation): void {
    this.sql.exec(
      'insert into billing_authority_replays(source_event_id, authority_sequence, mutation_json, at) values(?,?,?,?)',
      mutation.sourceEventId,
      mutation.authoritySequence,
      JSON.stringify(mutation),
      Date.now(),
    );
    this.sql.exec(
      'delete from billing_authority_replays where at < ?',
      Date.now() - days(RETENTION.quotaLedgerDays),
    );
  }

  private async applyLocalBillingMutation(mutation: BillingMutation): Promise<{ replayed: boolean }> {
    const request = localQuotaRequestForBillingMutation(mutation);
    let response: Response;
    try {
      response = await this.fetch(new Request(request.url, request.init));
    } catch {
      throw new BillingAuthorityError('billing_local_apply_failed', 503, 'Billing mutation was not applied locally');
    }
    if (!response.ok) {
      throw new BillingAuthorityError('billing_local_apply_failed', 503, 'Billing mutation was not applied locally');
    }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || body['ok'] !== true) {
      throw new BillingAuthorityError('billing_local_apply_failed', 503, 'Billing mutation was not applied locally');
    }
    return { replayed: body['replayed'] === true };
  }

  /**
   * Sequence fences only replaceable subscription state. Credits are additive facts: a credit
   * mutation arriving after a higher subscription sequence still has to be applied exactly once.
   */
  private async applySequencedBillingMutation(
    mutation: BillingMutation,
    role: 'authority' | 'replica',
  ): Promise<{ replayed: boolean; stale: boolean; authoritySequence: number }> {
    const userKey = role === 'authority' ? BILLING_AUTHORITY_USER_KEY : BILLING_REPLICA_USER_KEY;
    await this.pinBillingUser(userKey, mutation.userId);

    if (mutation.kind === 'subscription') {
      const sequenceKey = role === 'authority'
        ? BILLING_AUTHORITY_SUBSCRIPTION_SEQUENCE_KEY
        : BILLING_REPLICA_SUBSCRIPTION_SEQUENCE_KEY;
      const raw = await this.ctx.storage.get<number>(sequenceKey);
      const last = raw === undefined ? 0 : raw;
      if (!Number.isSafeInteger(last) || last < 0) {
        throw new BillingAuthorityError('billing_replica_sequence_invalid', 503, 'Stored billing sequence is invalid');
      }
      if (mutation.authoritySequence < last) {
        return { replayed: true, stale: true, authoritySequence: last };
      }
      if (mutation.authoritySequence === last) {
        return { replayed: true, stale: false, authoritySequence: last };
      }

      const local = await this.applyLocalBillingMutation(mutation);
      await this.ctx.storage.put(sequenceKey, mutation.authoritySequence);
      return { replayed: local.replayed, stale: false, authoritySequence: mutation.authoritySequence };
    }

    const local = await this.applyLocalBillingMutation(mutation);
    return { replayed: local.replayed, stale: false, authoritySequence: mutation.authoritySequence };
  }

  private async handleBillingAuthority(event: unknown): Promise<Response> {
    const sourceEventId = billingSourceEventId(event);
    if (sourceEventId) {
      const replay = this.authorityReplay(sourceEventId);
      if (replay) {
        await this.applySequencedBillingMutation(replay, 'authority');
        return Response.json({ ok: true, replayed: true, mutation: replay });
      }
    }

    const resolved = await resolveBillingAuthorityMutation(event, this.env);
    if (!resolved) return Response.json({ ok: true, replayed: false, mutation: null });

    if (resolved.kind === 'subscription') {
      const stored = await this.subscription();
      const storedId = stored?.subscriptionId ?? null;
      const resolvedId = resolved.subscription.subscriptionId;
      if (stored && storedId && resolvedId && storedId !== resolvedId) {
        const storedEntitlement = entitlementFor(stored, Math.floor(Date.now() / 1000));
        // A different subscription may become current only after the one we already know has
        // stopped entitling and the replacement actually entitles. This permits an ordinary
        // re-subscription after cancellation/expiry, while a late event for an older subscription
        // cannot demote or replace the newer active record merely because that old subscription's
        // own Stripe GET is current and correctly says it is canceled.
        if (storedEntitlement !== 'free' || resolved.plan === 'free') {
          throw new BillingAuthorityError(
            'billing_subscription_superseded',
            409,
            'Billing event belongs to a subscription that is not current for this account',
          );
        }
      }
    }

    await this.pinBillingUser(BILLING_AUTHORITY_USER_KEY, resolved.userId);
    const authoritySequence = await this.nextBillingAuthoritySequence();
    const mutation = sequenceBillingMutation(resolved, authoritySequence);
    this.storeAuthorityReplay(mutation);

    // The replay record exists before local apply. A retry after partial failure reuses this exact
    // mutation and sequence instead of resolving a different Stripe state.
    await this.applySequencedBillingMutation(mutation, 'authority');
    return Response.json({ ok: true, replayed: false, mutation });
  }

  private async handleBillingReplica(value: unknown): Promise<Response> {
    const body = typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    const mutation = body?.['mutation'];
    if (!isBillingMutation(mutation)) {
      return Response.json({ ok: false, error: 'billing_mutation_invalid' }, { status: 400 });
    }
    const applied = await this.applySequencedBillingMutation(mutation, 'replica');
    return Response.json({ ok: true, ...applied });
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
    this.sql.exec(`delete from applied_events where at < ?`, Date.now() - days(RETENTION.quotaLedgerDays));
    return true;
  }

  private record(
    kind: 'plan' | 'credits',
    from: PlanId | null,
    to: PlanId | null,
    status: string | null,
    eventId: string | null,
    // Null unless this change WAS the cancellation flag moving. Stored as 0/1 because SQLite has no
    // boolean, and read back through a null check so "no opinion" survives the round trip.
    cancelAtPeriodEnd: boolean | null = null,
  ): void {
    this.sql.exec(
      `insert into billing_events(at, kind, from_plan, to_plan, status, event_id, cancel_at_period_end) values(?,?,?,?,?,?,?)`,
      Date.now(), kind, from, to, status, eventId,
      cancelAtPeriodEnd === null ? null : cancelAtPeriodEnd ? 1 : 0,
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
    if (url.pathname === '/billing-authority' && req.method === 'POST') {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false, error: 'billing_authority_invalid_json' }, { status: 400 });
      }
      const record = typeof body === 'object' && body !== null && !Array.isArray(body)
        ? body as Record<string, unknown>
        : null;
      if (!record || !Object.hasOwn(record, 'event')) {
        return Response.json({ ok: false, error: 'billing_authority_event_missing' }, { status: 400 });
      }
      return this.serialBilling(async () => {
        try {
          return await this.handleBillingAuthority(record['event']);
        } catch (error) {
          return this.billingFailure(error);
        }
      });
    }
    if (url.pathname === '/billing-replica' && req.method === 'POST') {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false, error: 'billing_replica_invalid_json' }, { status: 400 });
      }
      return this.serialBilling(async () => {
        try {
          return await this.handleBillingReplica(body);
        } catch (error) {
          return this.billingFailure(error);
        }
      });
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
        /*
         * AND THE MONTH ROLLUP, WHICH IS NOT THE LEDGER.
         *
         * The ledger is pruned at 35 days a few lines below, so a "last month" figure summed from
         * its rows is truncated for most of the month — on the 30th its rows reach back only to the
         * 26th of the previous one. That total would understate, silently, and always in the
         * direction that flatters us; there is no honest month-over-month comparison available from
         * rows that are deleted. So the month total is accumulated as it happens and kept.
         *
         * `ledgerCountingSince` records the day this started, because a total for a month that was
         * ALREADY IN PROGRESS when counting began is partial for good, and has to be refused rather
         * than shown. That is `monthTotalComplete` in quota-math.
         */
        this.sql.exec(
          `insert into month_totals(month, credits) values(?,?)
             on conflict(month) do update set credits = credits + excluded.credits`,
          this.thisMonth(), fromAllowance,
        );
        if ((await this.ctx.storage.get<string>('ledgerCountingSince')) === undefined) {
          await this.ctx.storage.put('ledgerCountingSince', this.today());
        }
      }
      // RETENTION.quotaLedgerDays and nothing else. There were two spellings of 35 in this file —
      // this delete used the central table, the `/ledger` read used a local LEDGER_RETENTION_DAYS,
      // and the privacy page publishes the central one. Two constants holding the same number is
      // how the horizon a customer is TOLD about drifts away from the horizon that actually
      // deletes their rows; LEDGER_RETENTION_DAYS is now derived from the table above, so there is
      // one number and the page cannot be made to lie by editing the other.
      this.sql.exec(`delete from ledger where day < ?`, dayKey(Date.now() - days(RETENTION.quotaLedgerDays)));
      const after = await this.state();
      // THE SPLIT TRAVELS WITH THE ANSWER, because a refund has to reverse the same two ledgers
      // this charge touched and in the right proportions. Without it the only honest reversal
      // available to a caller is "put it all back as purchased balance", which turns a spent free
      // allowance into money. Additive: an older caller reads `ok` and `state` exactly as before.
      return Response.json({ ok: true, state: after, fromAllowance, fromCredits });
    }
    /*
     * GIVING IT BACK — the other half of a ledger that could only ever subtract.
     *
     * Credits are settled from measured compute, which is right, and until this route existed it
     * was the only arithmetic in the product. A run that produced nothing still paid for every
     * neuron it burned and was then invited to try again, at full price. See run-refund.ts for the
     * rule about WHICH runs qualify; this route is only the ledger mechanics, and it is
     * deliberately dumb about eligibility — the caller decides, this returns what it managed.
     *
     * THREE PROPERTIES, each of which has its own way of going wrong:
     *
     *  1. IDEMPOTENT. `refundId` is the run id. A Durable Object alarm can be retried, and a
     *     refund applied twice is free Credits minted by a crash. `applied_refunds` is the same
     *     mechanism `/grant-credits` uses for Stripe event ids.
     *  2. NEVER PUSHES A DAY BELOW ZERO. The allowance is a RATE keyed by UTC day. Reversing more
     *     than today's recorded spend would hand back an allowance the user never had, every
     *     midnight, to anyone whose run straddled it. So the allowance half is clamped to what
     *     today's ledger and this month's rollup can actually absorb, and the response says what
     *     was returned rather than what was asked for. The sentence the user reads is composed
     *     from THAT number — see refundSentence.
     *  3. ONLY EVER RETURNS. Both halves are clamped non-negative, so a malformed or hostile body
     *     cannot be turned into a charge through the refund door.
     */
    if (url.pathname === '/refund' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as
        | { fromAllowance?: unknown; fromCredits?: unknown; kind?: unknown; refundId?: unknown }
        | null;
      const refundId = typeof body?.refundId === 'string' && body.refundId.length > 0 ? body.refundId.slice(0, 128) : null;
      if (!refundId) return Response.json({ ok: false, error: 'refund_id_required', returned: 0, state: await this.state() }, { status: 400 });
      const askAllowance = Math.max(0, Math.floor(Number(body?.fromAllowance) || 0));
      const askCredits = Math.max(0, Math.floor(Number(body?.fromCredits) || 0));
      const kind = typeof body?.kind === 'string' ? body.kind.slice(0, 40) : 'refund';
      const already = this.sql.exec(`select refund_id from applied_refunds where refund_id = ?`, refundId).toArray();
      if (already.length > 0) {
        // A replay is not a second refund, and it is not a failure either: the money is already
        // back. `returned: 0` with `replayed: true` is the honest pair — this call moved nothing.
        return Response.json({ ok: true, replayed: true, returned: 0, state: await this.state() });
      }
      const spentToday = (this.sql.exec(`select coalesce(sum(credits),0) as s from ledger where day = ?`, this.today()).one() as { s: number }).s;
      const spentThisMonth = (
        this.sql.exec(`select coalesce(sum(credits),0) as s from ledger where day like ?`, `${this.thisMonth()}%`).one() as { s: number }
      ).s;
      const allowanceBack = Math.max(0, Math.min(askAllowance, spentToday, spentThisMonth));
      const creditsBack = askCredits;
      if (allowanceBack > 0) {
        this.sql.exec(
          `insert into ledger(day, kind, credits, created_at) values(?,?,?,?)`,
          this.today(), `refund_${kind}`.slice(0, 40), -allowanceBack, Date.now(),
        );
        // The month rollup is accumulated as it happens and is never re-derived from the pruned
        // ledger, so a reversal that skipped it would leave the monthly figure permanently high.
        this.sql.exec(
          `insert into month_totals(month, credits) values(?,?)
             on conflict(month) do update set credits = max(0, credits + excluded.credits)`,
          this.thisMonth(), -allowanceBack,
        );
      }
      if (creditsBack > 0) await this.ctx.storage.put('credits', (await this.credits()) + creditsBack);
      this.sql.exec(`insert into applied_refunds(refund_id, at, credits) values(?,?,?)`, refundId, Date.now(), allowanceBack + creditsBack);
      this.sql.exec(`delete from applied_refunds where at < ?`, Date.now() - days(RETENTION.quotaLedgerDays));
      return Response.json({
        ok: true,
        replayed: false,
        asked: askAllowance + askCredits,
        returned: allowanceBack + creditsBack,
        state: await this.state(),
      });
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
      /*
       * A ROW PER CHANGE, NOT A ROW PER DELIVERY. Stripe sends subscription.updated for things this
       * product does not model at all; logging those would bury the changes that matter.
       *
       * THE CANCELLATION IS A CHANGE. It arrives as customer.subscription.updated with the status
       * still 'active' and only cancel_at_period_end flipped — so a condition of "plan moved or
       * status moved" wrote no row for it, nor for undoing it. Those are the two changes a customer
       * is most likely to ring up about, and they were the two the history could not show.
       */
      const cancelNow = subscription?.cancelAtPeriodEnd ?? false;
      const cancelMoved = cancelNow !== (beforeSub?.cancelAtPeriodEnd ?? false);
      if (next !== before || status !== (beforeSub?.status ?? null) || cancelMoved) {
        this.record('plan', before, next, status, eventId ?? null, cancelMoved ? cancelNow : null);
      }
      return Response.json({ ok: true, state: await this.state() });
    }
    if (url.pathname === '/billing-customer' && req.method === 'GET') {
      return Response.json({ customerId: (await this.ctx.storage.get<string>('stripeCustomerId')) ?? null });
    }
    if (url.pathname === '/billing-details' && req.method === 'GET') {
      return Response.json({ details: await this.billingDetails() });
    }
    /**
     * Set the invoice fields, and say what was there before.
     *
     * THE PREVIOUS RECORD IS PART OF THE ANSWER. The caller's next move is to make Stripe's customer
     * match, and it must send an empty value to erase a field this product set while sending nothing
     * at all for a field it never set — otherwise the very first save wipes the billing name that
     * Checkout collected at the purchase. Returning it here means the route needs no second read and
     * cannot race one.
     *
     * Validated HERE, at the boundary that persists, rather than only at the edge: this is the last
     * place that can refuse, and the values go out again to a browser and into a Stripe request.
     */
    if (url.pathname === '/billing-details' && req.method === 'POST') {
      const { details } = (await req.json().catch(() => ({}))) as { details?: unknown };
      const verdict = readBillingDetails(details ?? {});
      if (!verdict.ok) return Response.json({ error: verdict.error }, { status: verdict.status });
      const previous = await this.billingDetails();
      await this.ctx.storage.put('billingDetails', verdict.details);
      return Response.json({ ok: true, details: verdict.details, previous });
    }
    /**
     * Everything this account's billing surfaces need, in one read: the enforced plan, the Stripe
     * customer the portal opens, the full subscription record, and the change history.
     */
    if (url.pathname === '/billing' && req.method === 'GET') {
      const sub = await this.subscription();
      const events = this.sql
        .exec(`select at, kind, from_plan, to_plan, status, event_id, cancel_at_period_end from billing_events order by at desc, id desc limit 50`)
        .toArray() as Record<string, unknown>[];
      return Response.json({
        plan: await this.plan(),
        customerId: (await this.ctx.storage.get<string>('stripeCustomerId')) ?? null,
        subscription: sub,
        // Carried on the read the billing page already makes, so showing the invoice fields costs
        // no extra round trip and cannot show a record from a different moment than the plan above.
        details: await this.billingDetails(),
        // Renamed on the way out rather than leaking column spellings into the API.
        events: events.map((r): BillingChange => ({
          at: Number(r['at']),
          kind: r['kind'] === 'credits' ? 'credits' : 'plan',
          fromPlan: (r['from_plan'] as PlanId | null) ?? null,
          toPlan: (r['to_plan'] as PlanId | null) ?? null,
          status: (r['status'] as string | null) ?? null,
          eventId: (r['event_id'] as string | null) ?? null,
          // Rows written before the column existed read back null, which is exactly right: they
          // are not rows about the cancellation flag, and must not be described as if they were.
          cancelAtPeriodEnd:
            r['cancel_at_period_end'] === null || r['cancel_at_period_end'] === undefined
              ? null
              : Number(r['cancel_at_period_end']) === 1,
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
    /*
     * THE INDIVIDUAL CHARGES, for the person who has to answer "what was this?".
     *
     * `/history` below is the user's own usage chart: credits per day, with a per-kind breakdown
     * riding on each day. That is the right shape for a chart and the wrong shape for an
     * investigation. A day total of 40 cannot distinguish one charge of 40 from two of 20 a second
     * apart, and "I was billed twice for one build" is exactly the complaint that needs telling
     * apart. This returns the rows.
     *
     * `total` and `retentionDays` are not decoration. A read that comes back empty means one of two
     * things — this account has never spent, or its spending is older than the prune horizon — and
     * an operator staring at `[]` with no window attached will read the first. The same goes for a
     * capped read: 2 rows returned out of 5 must not look like an account with 2 charges.
     */
    if (url.pathname === '/ledger') {
      const asked = Number(url.searchParams.get('limit') ?? NaN);
      const limit = Number.isFinite(asked)
        ? Math.max(1, Math.min(LEDGER_MAX_LIMIT, Math.floor(asked)))
        : LEDGER_DEFAULT_LIMIT;
      const total = (this.sql.exec(`select count(*) as n from ledger`).toArray() as { n: number }[])[0]?.n ?? 0;
      const rows = this.sql
        .exec(`select id, day, kind, credits, created_at from ledger order by created_at desc, id desc limit ?`, limit)
        .toArray() as { id: number; day: string; kind: string; credits: number; created_at: number }[];
      return Response.json({
        entries: rows.map((r) => ({
          id: Number(r.id),
          day: String(r.day),
          kind: String(r.kind),
          credits: Number(r.credits),
          // `at` rather than `created_at`: the column spelling is this DO's business, and a charge
          // is distinguished from the one a second before it by the millisecond, not by the day.
          at: Number(r.created_at),
        })),
        total,
        limit,
        truncated: total > rows.length,
        retentionDays: LEDGER_RETENTION_DAYS,
      });
    }
    if (url.pathname === '/history') {
      /*
       * WHAT THE CREDITS WENT ON, not only which day they went.
       *
       * Every spend has carried a `kind` since the ledger existed — it is the second column of the
       * insert above. This query threw it away, so the usage page could draw a bar per day and had
       * no answer at all to the one question a person asks about a bill: what was this spent ON.
       *
       * TWO QUERIES RATHER THAN ONE GROUPED BY (day, kind). The daily totals are what the 30-day
       * chart is built from; replacing them with one row per (day, kind) would make every bar
       * report the last kind of that day as if it were the day — a quiet understatement on every
       * day that had more than one kind of activity, which is every real day. The breakdown RIDES
       * ON the day row instead, so the parts always sum to the whole they are shown under.
       *
       * Both are over the same pruned 35-day ledger and both are tiny; this is not a page of data.
       */
      const rows = this.sql
        .exec(`select day, sum(credits) as credits, count(*) as events from ledger group by day order by day desc limit 30`)
        .toArray() as { day: string; credits: number; events: number }[];
      const byKind = this.sql
        .exec(`select day, kind, sum(credits) as credits from ledger group by day, kind order by day desc, credits desc`)
        .toArray() as { day: string; kind: string; credits: number }[];
      const kindsFor = new Map<string, { kind: string; credits: number }[]>();
      for (const r of byKind) {
        const list = kindsFor.get(r.day) ?? [];
        list.push({ kind: String(r.kind), credits: Number(r.credits) });
        kindsFor.set(r.day, list);
      }
      /*
       * AND THE MONTH BEFORE THIS ONE, when it can be stated honestly.
       *
       * "Am I spending more than last month" is the first question anybody asks of a usage page and
       * the page had one period on it. The comparison is refused — `null`, and the sentence simply
       * not rendered — whenever the rollup was not already running when that month began, because a
       * partial month presented as a month is a fabricated comparison.
       */
      const prev = prevMonthKey(Date.now());
      const since = await this.ctx.storage.get<string>('ledgerCountingSince');
      const prevRow = monthTotalComplete(since, prev)
        ? (this.sql.exec(`select credits from month_totals where month = ?`, prev).toArray() as { credits: number }[])[0]
        : undefined;
      const thisRow = (this.sql.exec(`select credits from month_totals where month = ?`, this.thisMonth())
        .toArray() as { credits: number }[])[0];
      return Response.json({
        days: rows.map((r) => ({ ...r, kinds: kindsFor.get(r.day) ?? [] })),
        // The current month's running total, from the same rollup, so the two halves of the
        // comparison are measured the same way. A month with no spend is 0 rather than absent.
        thisMonth: Number(thisRow?.credits ?? 0),
        previousMonth: prevRow ? { month: prev, credits: Number(prevRow.credits) } : null,
      });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
