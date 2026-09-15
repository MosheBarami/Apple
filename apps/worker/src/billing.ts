/**
 * Billing — subscription state, purchased credits, and the Stripe webhook that drives both.
 *
 * WHAT THIS IS FOR. `PLAN_LIMITS` grants 60 Credits/day to every signup, with no cap on signups and
 * no way to charge anyone. At a measured ~$0.025 per quality-gated build, that makes each new user
 * a pure cost. This is the piece that turns a plan into something a user can actually buy.
 *
 * TWO BALANCES, DELIBERATELY SEPARATE.
 *   - A PLAN grants a renewable Credit allowance. It is a rate: it resets, it does not accumulate.
 *   - CREDITS are a purchased balance. They do not expire and are spent ONLY after the renewable
 *     allowance for the period is gone.
 * Collapsing the two would make "your plan includes X, top up if you need more" inexpressible, and
 * would let a generous month silently consume something the user paid for.
 *
 * THE WEBHOOK IS THE SOURCE OF TRUTH, NOT THE CHECKOUT REDIRECT. A user who completes payment and
 * closes the tab before the redirect still bought the thing. A user who reaches the success URL by
 * typing it has not. So plan changes are driven by verified Stripe events, never by a browser
 * round-trip.
 *
 * SIGNATURE VERIFICATION IS NOT OPTIONAL. The webhook endpoint is public by necessity, and its
 * whole job is to raise someone's entitlements. Without verification it is an open "give me a
 * subscription" endpoint. `verifyStripeSignature` implements Stripe's scheme with Web Crypto and a
 * constant-time compare, and the handler refuses outright when no secret is configured rather than
 * degrading to trusting the body.
 */
import type { Env } from './env';
import { isPlanId, type PlanId } from './pricing';

/** How long a signed webhook payload stays acceptable. Stripe's own default. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface Subscription {
  plan: PlanId;
  /** Stripe's ids, so a support question can be answered without guessing. */
  customerId: string | null;
  subscriptionId: string | null;
  /**
   * The id of the ONE subscription item, which is the thing a tier change replaces.
   *
   * Stored because a price change has to name the item it swaps: quoting or applying a new price
   * without it ADDS a second item beside the running one, and the customer is then priced for both
   * tiers at once. Null on a record written before this was kept, which every reader must treat as
   * "cannot be priced" rather than as "no change needed".
   */
  itemId: string | null;
  /** `active` and `trialing` entitle; everything else falls back to free. */
  status: string | null;
  /** Unix seconds. After this, entitlement lapses unless renewed. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export const FREE_SUBSCRIPTION: Subscription = {
  plan: 'free',
  customerId: null,
  subscriptionId: null,
  itemId: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

/**
 * Which Stripe subscription statuses actually entitle a user.
 *
 * `past_due` deliberately still entitles: a failed renewal is usually an expired card, and cutting
 * off a paying customer at the first retry is both hostile and bad for recovery. Stripe moves the
 * subscription to `canceled` or `unpaid` when it gives up, and those do not entitle.
 */
const ENTITLING_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function entitlementFor(sub: Subscription, now = 0): PlanId {
  if (!sub.status || !ENTITLING_STATUSES.has(sub.status)) return 'free';
  // A lapsed period never entitles, whatever the status says. `now` is passed in rather than read
  // from the clock so this stays a pure function and can be tested at a chosen instant.
  if (sub.currentPeriodEnd !== null && now > 0 && now > sub.currentPeriodEnd) return 'free';
  return sub.plan;
}

// ---------------------------------------------------------------------------
// What the product may SAY about a subscription
// ---------------------------------------------------------------------------

/**
 * The states a subscription can be in, as the product must describe them.
 *
 * `entitlementFor` answers one question — may this user spend at a paid rate — and collapses
 * everything else into 'free'. That is correct for enforcement and useless for a page: a renewing
 * subscription, one that cancels at the end of the period, a failed renewal still being retried,
 * and a payment waiting on a 3-D Secure challenge all had to be told apart before any of them could
 * be shown, and every one of them arrived on the same event and was thrown away.
 */
export type BillingState =
  /** Never subscribed. */
  | 'none'
  /** Renewing normally. */
  | 'active'
  /** Inside a trial. */
  | 'trialing'
  /** Still served, but it ends at the period end rather than renewing. */
  | 'cancelling'
  /** A renewal failed. Still served while Stripe retries, deliberately. */
  | 'past_due'
  /** The payment needs the cardholder to authenticate. Entitles nothing. */
  | 'needs_action'
  /** Over: cancelled, unpaid, or a period that simply ran out. */
  | 'lapsed';

export interface SubscriptionView {
  /** What the user is entitled to RIGHT NOW. Recomputed, never read from metadata. */
  plan: PlanId;
  state: BillingState;
  /** Stripe's own word for it, kept for support questions. */
  status: string | null;
  /** Unix seconds this renews. Null whenever it will not renew. */
  renewsAt: number | null;
  /** Unix seconds access ends. Non-null ONLY when something is actually ending. */
  endsAt: number | null;
  /** A Stripe customer exists, so the portal has something to open — even on the free tier. */
  hasBillingAccount: boolean;
  /** There is something the user must do. Drives the one notice this product can afford to show. */
  needsAttention: boolean;
}

export const NO_SUBSCRIPTION_VIEW: SubscriptionView = {
  plan: 'free',
  state: 'none',
  status: null,
  renewsAt: null,
  endsAt: null,
  hasBillingAccount: false,
  needsAttention: false,
};

/**
 * One reading of a stored subscription, which every surface derives from.
 *
 * RENEWS AND ENDS ARE NEVER BOTH SET, and never the same field under two names. `currentPeriodEnd`
 * means opposite things depending on `cancelAtPeriodEnd` — the day you are charged again, or the
 * day you lose access — and a UI handed the raw number has to make that call itself, in each place
 * it prints it. It is made here, once.
 */
export function subscriptionView(sub: Subscription | null | undefined, nowSeconds: number): SubscriptionView {
  if (!sub || !sub.status) {
    return { ...NO_SUBSCRIPTION_VIEW, hasBillingAccount: !!sub?.customerId };
  }
  const hasBillingAccount = !!sub.customerId;
  const plan = entitlementFor(sub, nowSeconds);
  const base = { status: sub.status, hasBillingAccount, renewsAt: null, endsAt: null, needsAttention: false };

  // A payment awaiting authentication is its own thing: the user believes they have paid, and
  // nothing has been granted. Checked before the lapse test, which would otherwise swallow it.
  if (sub.status === 'incomplete') {
    return { ...base, plan: 'free', state: 'needs_action', needsAttention: true };
  }
  // Over, whatever the reason — a terminal status, or a period that ran out under a live one.
  if (plan === 'free') {
    return { ...base, plan: 'free', state: 'lapsed', endsAt: sub.currentPeriodEnd, needsAttention: hasBillingAccount };
  }
  if (sub.status === 'past_due') {
    return { ...base, plan, state: 'past_due', endsAt: sub.currentPeriodEnd, needsAttention: true };
  }
  if (sub.cancelAtPeriodEnd) {
    // Still served until the period ends, and it does NOT renew. Saying "renews on" here is the
    // single most expensive sentence this page could get wrong.
    return { ...base, plan, state: 'cancelling', endsAt: sub.currentPeriodEnd };
  }
  return {
    ...base,
    plan,
    state: sub.status === 'trialing' ? 'trialing' : 'active',
    renewsAt: sub.currentPeriodEnd,
  };
}

/** States in which Stripe still has a subscription it could charge for. */
const LIVE_STATES = new Set<BillingState>(['active', 'trialing', 'cancelling', 'past_due']);

export type CheckoutGuardVerdict = { ok: true } | { ok: false; status: 409; error: string };

/**
 * May this account start a checkout at all?
 *
 * A Stripe Checkout ADDS a subscription; it never replaces one. The page already sent paid users to
 * the portal, but the ROUTE did not look — so a direct POST to /api/billing/checkout minted a
 * second subscription beside the running one and the customer was charged for both. The page's
 * rule and this one are the same rule; only this one is enforced.
 *
 * A LAPSED CUSTOMER IS NOT REFUSED. Coming back after a cancellation is a first subscription again,
 * and refusing it would strand a returning customer on a portal with nothing to resume.
 */
export function checkoutGuard(view: SubscriptionView): CheckoutGuardVerdict {
  if (!LIVE_STATES.has(view.state)) return { ok: true };
  return {
    ok: false,
    status: 409,
    error: 'you already have a subscription — change or cancel it in the billing portal',
  };
}

// ---------------------------------------------------------------------------
// Stripe signature verification
// ---------------------------------------------------------------------------

/** Compare two byte strings without leaking their difference through timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a `Stripe-Signature` header against the raw body.
 *
 * The RAW body matters: re-serialising parsed JSON changes bytes (key order, whitespace, number
 * formatting) and the signature will never match again. Callers must pass `await req.text()` and
 * parse afterwards, never `JSON.stringify(await req.json())`.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!header) return { ok: false, reason: 'missing signature header' };

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;

  const timestamp = Number(parts['t']);
  const signature = parts['v1'];
  if (!Number.isFinite(timestamp) || !signature) return { ok: false, reason: 'malformed signature header' };

  // Replay window. Without this, a signature stays valid forever and a captured webhook can be
  // resent to re-grant an entitlement that was later cancelled.
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'signature timestamp outside tolerance' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return timingSafeEqual(hex(mac), signature) ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

// ---------------------------------------------------------------------------
// Event interpretation
// ---------------------------------------------------------------------------

export interface BillingOutcome {
  /** Which user this event is about, from subscription metadata. */
  userId: string | null;
  /**
   * Stripe's own id for this event, or null when it carried none.
   *
   * STRIPE RETRIES. A delivery that times out on our side is sent again, and `/grant-credits` is
   * additive — so without an id to deduplicate on, one purchase inside the signature window credits
   * the account twice. Carried here rather than read at the call site so the reader and the
   * deduplicator cannot disagree about which field it is.
   */
  eventId: string | null;
  subscription?: Subscription;
  /** Credits to add, for one-off purchases. */
  creditsDelta?: number;
  /** Why nothing was applied, when nothing was. */
  ignored?: string;
}

/**
 * Turn a verified Stripe event into what should change.
 *
 * Pure, so the decision can be tested without a network or a DO. The caller applies the result.
 *
 * `userId` comes from subscription metadata rather than from the customer's email, because an email
 * is editable by the customer and is not an identity. A subscription with no `metadata.userId` is
 * ignored loudly rather than guessed at — attaching a plan to the wrong account is worse than
 * attaching it to none.
 *
 * `env` is what makes the TIER readable from the price. It is optional only because an event from a
 * deployment with no prices configured still has to be interpretable; when it is absent the reader
 * falls back to the metadata exactly as it always did.
 */
export function interpretStripeEvent(event: unknown, env?: Env): BillingOutcome {
  if (typeof event !== 'object' || event === null) return { userId: null, eventId: null, ignored: 'not an object' };
  const e = event as { id?: unknown; type?: string; data?: { object?: Record<string, unknown> } };
  const obj = e.data?.object ?? {};
  const type = e.type ?? '';
  const metadata = (obj['metadata'] as Record<string, string> | undefined) ?? {};
  const userId = metadata['userId'] ?? null;
  // Null rather than undefined: this value is serialised to the DO, and `undefined` disappears
  // through JSON.stringify, which would turn "no id" into "field absent" and then into a fresh
  // event every time (F-65).
  const eventId = typeof e.id === 'string' && e.id.length > 0 ? e.id : null;

  switch (type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      if (!userId) return { userId: null, eventId, ignored: 'subscription carries no metadata.userId' };
      const planRaw = metadata['plan'];
      const status = typeof obj['status'] === 'string' ? obj['status'] : null;
      // A deletion is a lapse to free regardless of what the plan metadata still says.
      const deleted = type === 'customer.subscription.deleted';
      /*
       * THE PRICE OUTRANKS THE METADATA, because the price is what Stripe bills.
       *
       * `metadata.plan` is written exactly once — by buildCheckoutRequest, at the FIRST purchase.
       * Every later tier change happens in the Billing Portal, which swaps `items[].price` and
       * leaves `metadata` untouched. So an upgrade bought there charged the new tier and entitled
       * the old one, and a downgrade kept serving the tier nobody was paying for; the event carried
       * the right answer all along and nothing read it.
       *
       * The metadata stays as the FALLBACK rather than being dropped: a price this deployment does
       * not recognise (a legacy one, a test-mode id) must not silently demote a paying customer.
       */
      const fromPrice = env ? planForPriceId(env, priceIdOfSubscription(obj)) : null;
      const plan: PlanId = deleted ? 'free' : (fromPrice ?? (isPlanId(planRaw) ? planRaw : 'free'));
      return {
        userId,
        eventId,
        subscription: {
          plan,
          customerId: typeof obj['customer'] === 'string' ? obj['customer'] : null,
          subscriptionId: typeof obj['id'] === 'string' ? obj['id'] : null,
          itemId: itemIdOfSubscription(obj),
          status: deleted ? 'canceled' : status,
          currentPeriodEnd: typeof obj['current_period_end'] === 'number' ? obj['current_period_end'] : null,
          cancelAtPeriodEnd: obj['cancel_at_period_end'] === true,
        },
      };
    }

    case 'checkout.session.completed': {
      if (!userId) return { userId: null, eventId, ignored: 'checkout session carries no metadata.userId' };
      // One-off credit purchase. Subscription checkouts are handled by the subscription events
      // above, so this only applies when credits were actually bought.
      const credits = Number(metadata['credits'] ?? 0);
      if (obj['payment_status'] !== 'paid') return { userId, eventId, ignored: `payment_status ${String(obj['payment_status'])}` };
      if (!Number.isFinite(credits) || credits <= 0) return { userId, eventId, ignored: 'no credits in metadata' };
      return { userId, eventId, creditsDelta: Math.floor(credits) };
    }

    /*
     * HANDLED, AND DELIBERATELY INERT. The default branch below says "unhandled event type", which
     * is this reader's word for an event it does not know about — and an expiry is one it knows
     * about exactly: the person abandoned a checkout, so nothing was bought, so no entitlement and
     * no credit may move. The two are the same no-op and must not read the same in a log, because
     * one of them is a gap and the other is a decision. `dunning.ts` is what tells the person.
     */
    case 'checkout.session.expired':
      return { userId, eventId, ignored: 'checkout session expired — nothing was bought, so nothing changes' };

    default:
      return { userId, eventId, ignored: `unhandled event type ${type}` };
  }
}

/** Is billing configured at all? Everything here is inert without the secret. */
export function billingConfigured(env: Env): boolean {
  return typeof (env as unknown as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET === 'string'
    && ((env as unknown as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET ?? '').length > 0;
}

// --- the upgrade and downgrade path (w14) --------------------------------------------------------
//
// ENTITLEMENT STILL COMES ONLY FROM THE WEBHOOK. Nothing below grants a plan. A checkout session is
// an invitation to Stripe's own hosted page, where the user confirms; the subscription events that
// follow are what move anybody between tiers, through `interpretStripeEvent` and `entitlementFor`
// exactly as before. That separation is the whole reason a redirect cannot be forged into a free
// upgrade: the success URL is a place to come back to, not a claim about what happened.
//
// Downgrades and cancellations go to Stripe's Billing Portal rather than to anything written here.
// Proration, tax, dunning and the rules about when a downgrade takes effect are genuinely difficult
// and Stripe already implements them; a hand-rolled "cancel" button that only tells our own DO the
// plan changed would leave the subscription running and charging.

/** Per-environment Stripe configuration. Absent everywhere until billing is switched on. */
interface CheckoutEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_BUILDER?: string;
  STRIPE_PRICE_STUDIO?: string;
  STRIPE_PORTAL_CONFIGURATION?: string;
}

/**
 * The price a plan is bought at, or null when it cannot be bought here.
 *
 * `free` has no price and `enterprise` is a conversation, so both are null BY DESIGN rather than by
 * omission — a checkout for either is a bug, not a missing environment variable.
 */
export function priceIdFor(env: Env, plan: PlanId): string | null {
  const e = env as unknown as CheckoutEnv;
  if (plan === 'builder') return e.STRIPE_PRICE_BUILDER?.trim() || null;
  if (plan === 'studio') return e.STRIPE_PRICE_STUDIO?.trim() || null;
  return null;
}

/**
 * The inverse: which tier a Stripe price sells, or null when this deployment does not sell it.
 *
 * This is the half that was missing, and its absence is why a tier change made in the Billing
 * Portal entitled the wrong plan — see the comment in `interpretStripeEvent`. An unknown price is
 * null rather than 'free': not recognising an id is not the same as the customer having no plan.
 */
export function planForPriceId(env: Env, priceId: string | null | undefined): PlanId | null {
  if (typeof priceId !== 'string' || priceId.length === 0) return null;
  const e = env as unknown as CheckoutEnv;
  // Compared against the trimmed value, so a price id with a stray newline in a secret still maps.
  if (e.STRIPE_PRICE_BUILDER?.trim() === priceId) return 'builder';
  if (e.STRIPE_PRICE_STUDIO?.trim() === priceId) return 'studio';
  return null;
}

/**
 * The price id of a subscription's first item, however Stripe expanded it.
 *
 * `price` arrives as an object on a webhook and as a bare id when the object was fetched without
 * expansion; reading only one shape would make the tier unreadable half the time. One item per
 * subscription is this product's invariant (`line_items[0][quantity]=1`), so the first is the one.
 */
export function priceIdOfSubscription(obj: Record<string, unknown>): string | null {
  const items = obj['items'] as { data?: unknown[] } | undefined;
  const first = Array.isArray(items?.data) ? items.data[0] : null;
  if (!first || typeof first !== 'object') return null;
  const price = (first as Record<string, unknown>)['price'];
  if (typeof price === 'string') return price;
  if (price && typeof price === 'object') {
    const id = (price as Record<string, unknown>)['id'];
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/**
 * The id of a subscription's single ITEM — not the price on it, and not the subscription itself.
 *
 * Three different ids are in play on one object (`sub_`, `si_`, `price_`) and only this one names
 * the row a tier change edits. One item per subscription is this product's invariant
 * (`line_items[0][quantity]=1`), so the first is the one.
 */
export function itemIdOfSubscription(obj: Record<string, unknown>): string | null {
  const items = obj['items'] as { data?: unknown[] } | undefined;
  const first = Array.isArray(items?.data) ? items.data[0] : null;
  if (!first || typeof first !== 'object') return null;
  const id = (first as Record<string, unknown>)['id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

// --- what a tier change costs, before the user commits to it -------------------------------------
//
// The ladder printed every tier's monthly price and then sent anyone already paying to the Billing
// Portal, so the amount for THIS change — the prorated charge today, the credit for the part of the
// period already paid for — was first seen on Stripe's own page, after the user had left the
// product. This asks Stripe the question in advance. It is READ-ONLY: nothing below moves a
// subscription or grants an entitlement, and the portal is still where the change is made.

export interface InvoicePreview {
  /** In MAJOR units, ready for `formatMoney`. Negative when the change leaves a credit. */
  amountDue: number;
  /** ISO 4217, upper case. Stripe answers in lower case and the formatter wants the code. */
  currency: string;
  /** Unix seconds the proration is computed from, or null when nothing was prorated. */
  prorationDate: number | null;
  lines: { description: string; amount: number }[];
}

/**
 * Currencies with no minor unit. Dividing these by 100 quotes a hundredth of the real charge.
 *
 * It lives here rather than in a caller because the amount and the currency arrive together and are
 * only correct together.
 */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

function toMajor(minor: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return minor;
  // Rounded first: a summed set of lines in binary floating point is not exact, and a price cell
  // reading "$12.340000000000001" is a bug the reader can see.
  return Math.round(minor) / 100;
}

/**
 * Ask Stripe what moving this subscription to `plan` would cost right now.
 *
 * THE ITEM ID IS NOT OPTIONAL. `create_preview` given a price and no item prices a subscription
 * carrying BOTH tiers and quotes their sum — a plausible-looking number that is simply wrong. A
 * record with no item id is refused here rather than previewed badly; the caller then says it could
 * not get a figure, which is true, instead of showing one that is not.
 *
 * `/v1/invoices/create_preview` is the current endpoint. `/v1/invoices/upcoming` is its retired
 * predecessor and is not what a current API version answers.
 */
export function buildInvoicePreviewRequest(
  env: Env,
  opts: { customerId: string | null; subscriptionId: string | null; itemId: string | null; plan: PlanId },
): CheckoutRequest | CheckoutRefusal {
  if (!checkoutConfigured(env)) {
    return { ok: false, status: 503, error: 'billing is not configured for this deployment' };
  }
  const price = priceIdFor(env, opts.plan);
  if (!price) {
    // Free is a cancellation and enterprise is a conversation. Neither is a priced swap.
    return { ok: false, status: 400, error: `${opts.plan} has no price to quote here` };
  }
  if (!opts.customerId || !opts.subscriptionId || !opts.itemId) {
    return { ok: false, status: 400, error: 'there is no running subscription to price this change against' };
  }

  const p = new URLSearchParams();
  p.set('customer', opts.customerId);
  p.set('subscription', opts.subscriptionId);
  p.set('subscription_details[items][0][id]', opts.itemId);
  p.set('subscription_details[items][0][price]', price);
  // Without this the preview is of the NEXT renewal at the new price, not of the change itself —
  // and the charge today is exactly the part the ladder cannot show.
  p.set('subscription_details[proration_behavior]', 'create_prorations');
  return { ok: true, body: p.toString() };
}

/**
 * Read Stripe's preview invoice, or null when it cannot be read.
 *
 * NULL IS NOT ZERO. A reply this cannot parse means the amount is unknown, and returning 0 would
 * turn a failure to observe into the sentence "this change costs nothing today" — the exact shape
 * of defect this codebase keeps finding. The caller refuses instead.
 */
export function readInvoicePreview(payload: unknown): InvoicePreview | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const inv = payload as Record<string, unknown>;
  const minor = inv['amount_due'];
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return null;
  const currency = typeof inv['currency'] === 'string' && inv['currency'].length > 0
    ? inv['currency'].toUpperCase()
    : null;
  if (!currency) return null;

  const raw = (inv['lines'] as { data?: unknown[] } | undefined)?.data;
  const rows = Array.isArray(raw) ? raw : [];
  const lines: { description: string; amount: number }[] = [];
  let prorationDate: number | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const amount = r['amount'];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    lines.push({
      description: typeof r['description'] === 'string' ? r['description'] : '',
      amount: toMajor(amount, currency),
    });
    // Only a PRORATION line dates the proration. A plain renewal line would date it to the start of
    // the next period and make the sentence about today wrong.
    if (r['proration'] === true && prorationDate === null) {
      const start = (r['period'] as Record<string, unknown> | undefined)?.['start'];
      if (typeof start === 'number' && Number.isFinite(start)) prorationDate = start;
    }
  }
  return { amountDue: toMajor(minor, currency), currency, prorationDate, lines };
}

/** Can this deployment start a checkout at all? The webhook secret alone is not enough. */
export function checkoutConfigured(env: Env): boolean {
  const key = (env as unknown as CheckoutEnv).STRIPE_SECRET_KEY ?? '';
  return billingConfigured(env) && key.length > 0;
}

export type CheckoutRefusal =
  | { ok: false; status: 503; error: string }
  | { ok: false; status: 400; error: string };

export interface CheckoutRequest {
  ok: true;
  /** Stripe's form-encoded body. Built here so it can be asserted without a network call. */
  body: string;
}

/**
 * Build the Checkout Session request for one user moving to one plan.
 *
 * `metadata.userId` is the only thread back to us, and it is the same field `interpretStripeEvent`
 * reads — so a session that somehow carried no metadata is ignored by the webhook rather than
 * applied to the wrong account.
 */
/**
 * How long a checkout page stays open.
 *
 * Stripe accepts anything from 30 minutes to 24 hours and defaults to 24. An hour is long enough to
 * finish a purchase and short enough that "the checkout you started has expired, nothing was
 * charged" is still about something the reader remembers doing — a notice a day later reads as news
 * about a stranger.
 */
const CHECKOUT_WINDOW_SECONDS = 60 * 60;

export function buildCheckoutRequest(
  env: Env,
  opts: {
    userId: string;
    email?: string | null;
    plan: PlanId;
    returnTo: string;
    /**
     * Unix seconds, passed in so the expiry can be asserted at a chosen instant rather than against
     * the wall clock. It falls back to the real clock instead of to nothing: an absent value would
     * reach Stripe as the string "NaN" and refuse the whole session.
     */
    nowSeconds?: number;
  },
): CheckoutRequest | CheckoutRefusal {
  if (!checkoutConfigured(env)) {
    return { ok: false, status: 503, error: 'checkout is not configured for this deployment' };
  }
  if (!opts.userId) return { ok: false, status: 400, error: 'no user' };
  if (opts.plan === 'free') {
    // Moving DOWN to free is a cancellation, which belongs to the portal — a checkout for a zero
    // price would create a second subscription beside the paid one that is still running.
    return { ok: false, status: 400, error: 'use the billing portal to move down to Free' };
  }
  const price = priceIdFor(env, opts.plan);
  if (!price) {
    return { ok: false, status: 400, error: `${opts.plan} cannot be bought here` };
  }

  const p = new URLSearchParams();
  p.set('mode', 'subscription');
  p.set('line_items[0][price]', price);
  p.set('line_items[0][quantity]', '1');
  p.set('success_url', `${opts.returnTo}?checkout=done`);
  p.set('cancel_url', `${opts.returnTo}?checkout=cancelled`);
  p.set('client_reference_id', opts.userId);
  // Read by interpretStripeEvent. Set on the SUBSCRIPTION too, because the events that actually
  // move a plan are subscription events, and a session's metadata does not reach them on its own.
  p.set('metadata[userId]', opts.userId);
  p.set('subscription_data[metadata][userId]', opts.userId);
  // AND THE PLAN. This line was missing, and its absence was the whole upgrade path failing
  // silently: interpretStripeEvent reads metadata.plan and falls back to 'free', so every real
  // paid subscription was interpreted as free and the customer stayed on the tier they had left.
  // Nothing caught it because the webhook tests hand-built their events with a plan field that no
  // checkout ever set. It is NOT an instruction about entitlement — entitlementFor still recomputes
  // from status and period, so a cancelled subscription naming 'studio' here still grants nothing.
  p.set('subscription_data[metadata][plan]', opts.plan);
  if (opts.email) p.set('customer_email', opts.email);
  /*
   * WHAT HAS TO BE ON THE INVOICE, COLLECTED AT THE ONE MOMENT THE BUYER IS WILLING TO TYPE IT.
   *
   * `billing_address_collection` defaults to 'auto', which collects only what the payment method
   * itself demands — for a card that is often a postal code and nothing else. The invoice Stripe
   * then prints carries no address, and an invoice with no address is not a document a finance
   * department can accept or a tax authority can read. Required, so it is there from the first
   * charge rather than chased afterwards — and it is the address `automatic_tax` below is
   * calculated against, so the two lines stand or fall together.
   *
   * EDITING IT AFTERWARDS BELONGS TO THE PORTAL. Do not build a second address form in this
   * product: it would be a copy that drifts from the one Stripe actually prints on invoices, and
   * the two would disagree in front of a customer disputing a charge.
   *
   * The VAT/GST/ABN field is `tax_id_collection`, and `customer_update` is deliberately absent;
   * both are set out with the tax parameters below, where they belong, rather than twice.
   */
  p.set('billing_address_collection', 'required');
  /*
   * THE PROMOTION-CODE FIELD, AND THE COMMENT THAT USED TO SIT HERE.
   *
   * This line switches on the code box on Stripe's hosted page; Stripe validates what is typed into
   * it against its own promotion codes and applies the discount before the card is charged, which
   * is why this app has no code-entry box of its own. The comment that stood here described "one
   * subscription per account" — a different rule, enforced by `checkoutGuard` and the route, not by
   * this flag — so anyone deleting the line would have read it as removing a stray, and the field
   * would have silently disappeared from the page. The rule it described lives at its own call site
   * now; this says what this line does.
   */
  p.set('allow_promotion_codes', 'true');
  /*
   * TAX IS STRIPE'S TO CALCULATE, AND IT IS SHOWN BEFORE THE CARD IS ENTERED.
   *
   * With no tax parameter at all Stripe computed none and displayed none, so a VAT-registered buyer
   * was quoted a bare monthly figure, charged exactly that, and handed an invoice they could not
   * reclaim against. The listed price stays EXCLUSIVE of tax — the plan ladder and the pricing page
   * both say so in words — and what is owed on top is worked out on Stripe's page, against the
   * address it collects, before anything is charged.
   *
   * REQUIRES STRIPE TAX TO BE ACTIVE ON THE ACCOUNT. Stripe refuses the whole session otherwise, so
   * a deployment that has not switched it on fails loudly at the first checkout rather than quietly
   * selling untaxed. That is the intended failure: the alternative — a flag defaulting to off — is
   * a page that claims tax is calculated while no tax ever is.
   *
   * `customer_update` IS DELIBERATELY ABSENT. Stripe accepts it only alongside `customer`, and this
   * session names the buyer by `customer_email` and lets Checkout create the customer; sending it
   * here would make Stripe reject every session, which is the shape of "the feature is enabled and
   * nothing works".
   */
  p.set('automatic_tax[enabled]', 'true');
  // So a business can put its VAT/GST number on the invoice, and reverse-charge applies where it
  // should. Without it every EU business buyer is charged consumer VAT they cannot reclaim.
  p.set('tax_id_collection[enabled]', 'true');
  // The window is ours rather than Stripe's 24-hour default, which is what makes the expiry worth
  // telling somebody about — see CHECKOUT_WINDOW_SECONDS, and the 'checkout.session.expired' case
  // in interpretStripeEvent that this makes reachable within the hour.
  const now = typeof opts.nowSeconds === 'number' && Number.isFinite(opts.nowSeconds)
    ? Math.floor(opts.nowSeconds)
    : Math.floor(Date.now() / 1000);
  p.set('expires_at', String(now + CHECKOUT_WINDOW_SECONDS));
  return { ok: true, body: p.toString() };
}

// ---------------------------------------------------------------------------
// INVOICES — what the customer was actually charged, on our own page
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS WHEN THE PORTAL ALREADY LISTS INVOICES. The portal is a good place for an
// invoice to live and a bad place for it to be the ONLY place. A customer who wants to check a
// charge has to be sent to another company's domain, sign in again, and come back; a customer
// disputing one has no shared reference with support; and a failed payment appears in OUR inbox
// while the invoice it is about appears nowhere in this product at all. Reading the list is cheap
// and safe — it moves no money and grants nothing.
//
// EVERYTHING BELOW IS A PURE MAPPER, deliberately. The route that calls Stripe cannot be tested
// without a network; the decisions that matter — which fields leave, which links are rendered,
// whose invoice this is — can be, and are, in billing-invoices.test.mjs.
//
// THE PDF IS A LINK, NOT A PROXY. Stripe's `invoice_pdf` is already scoped and expiring. Fetching
// those bytes through the worker would turn it into a general-purpose document fetcher wearing our
// authentication, for no gain to the person downloading it.

/** One invoice, reduced to what a person reads. The key set IS the allowlist. */
export interface InvoiceSummary {
  id: string;
  /** Stripe's human number, e.g. "C0FFEE-0001". A draft has none yet. */
  number: string | null;
  /** Unix seconds. */
  created: number | null;
  /** Stripe's own word: paid, open, draft, uncollectible, void. Rendered, never interpreted here. */
  status: string | null;
  /** Minor units, as Stripe reports them. Null when unreadable — never a plausible zero. */
  amountPaid: number | null;
  amountDue: number | null;
  currency: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface InvoiceLine {
  description: string | null;
  quantity: number | null;
  unitAmount: number | null;
  amount: number | null;
  period: { start: number | null; end: number | null } | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  lines: InvoiceLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

/** Minor units, or null. The same rule dunning.ts uses: an unreadable field says so. */
function money(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * A link only if it is an https URL on a Stripe host.
 *
 * Both invoice links are put straight into an `<a href>` on a page the customer is signed in to.
 * They come from Stripe over TLS today; a guard costing one comparison is cheaper than ever having
 * to re-derive whether that is still true, and it makes `javascript:` unrenderable by construction.
 */
function stripeLink(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  return u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com') ? s : null;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/**
 * One Stripe invoice as this product is willing to describe it, or null when it cannot be read.
 *
 * AN ALLOWLIST, NEVER A SPREAD. A Stripe invoice carries the customer's postal address, their tax
 * ids, the payment intent and our own metadata. Copying the object and deleting fields leaks every
 * field Stripe adds next year; naming the nine that leave cannot.
 */
export function mapInvoice(raw: unknown): InvoiceSummary | null {
  const o = asObject(raw);
  if (!o) return null;
  const id = str(o['id']);
  if (!id) return null;
  return {
    id,
    number: str(o['number']),
    created: money(o['created']),
    status: str(o['status']),
    amountPaid: money(o['amount_paid']),
    amountDue: money(o['amount_due']),
    currency: str(o['currency']),
    hostedUrl: stripeLink(o['hosted_invoice_url']),
    pdfUrl: stripeLink(o['invoice_pdf']),
  };
}

/** Stripe's list envelope into rows, in Stripe's order. An unreadable row is skipped, not blanked. */
export function mapInvoiceList(raw: unknown): InvoiceSummary[] {
  const o = asObject(raw);
  const data = o?.['data'];
  if (!Array.isArray(data)) return [];
  return data.map(mapInvoice).filter((i): i is InvoiceSummary => i !== null);
}

function mapLine(raw: unknown): InvoiceLine | null {
  const o = asObject(raw);
  if (!o) return null;
  const price = asObject(o['price']);
  const period = asObject(o['period']);
  return {
    description: str(o['description']),
    quantity: money(o['quantity']),
    // Null rather than amount/quantity: a computed unit price is a figure we invented, and the one
    // place it would be read is beside a real one.
    unitAmount: price ? money(price['unit_amount']) : null,
    amount: money(o['amount']),
    period: period ? { start: money(period['start']), end: money(period['end']) } : null,
  };
}

/** The same invoice with its line items and totals. Still no customer record. */
export function mapInvoiceDetail(raw: unknown): InvoiceDetail | null {
  const summary = mapInvoice(raw);
  if (!summary) return null;
  const o = asObject(raw)!;
  const lines = asObject(o['lines'])?.['data'];
  return {
    ...summary,
    lines: Array.isArray(lines) ? lines.map(mapLine).filter((l): l is InvoiceLine => l !== null) : [],
    subtotal: money(o['subtotal']),
    tax: money(o['tax']),
    total: money(o['total']),
  };
}

/**
 * Does this id even look like an invoice id?
 *
 * Checked BEFORE it is interpolated into `https://api.stripe.com/v1/invoices/<id>`, because a
 * caller-supplied `../charges/ch_1` addresses a different Stripe endpoint with our secret key
 * attached. The shape is Stripe's own: `in_` and then url-safe characters.
 */
export function isInvoiceId(id: unknown): boolean {
  return typeof id === 'string' && /^in_[A-Za-z0-9]+$/.test(id);
}

/**
 * Is this invoice the caller's?
 *
 * THE ID IN THE PATH IS NOT THE AUTHORISATION. It names an invoice; it says nothing about who may
 * read it. Without this, any signed-in user could page through every invoice this Stripe account
 * has ever issued, to anyone. Compared as strings only: Stripe returns `customer` expanded when
 * asked to, and two objects stringify to the same `[object Object]`.
 */
export function invoiceBelongsTo(raw: unknown, customerId: string | null | undefined): boolean {
  const o = asObject(raw);
  if (!o) return false;
  const mine = str(customerId);
  const theirs = str(o['customer']);
  return mine !== null && theirs !== null && mine === theirs;
}

/** Build the Billing Portal request — where a downgrade or a cancellation actually happens. */
export function buildPortalRequest(
  env: Env,
  opts: { customerId: string; returnTo: string },
): CheckoutRequest | CheckoutRefusal {
  if (!checkoutConfigured(env)) {
    return { ok: false, status: 503, error: 'the billing portal is not configured for this deployment' };
  }
  if (!opts.customerId) {
    // A user who has never bought anything has no Stripe customer, and saying so is better than
    // sending them to a portal that will not open.
    return { ok: false, status: 400, error: 'no billing account yet — there is nothing to manage' };
  }
  const p = new URLSearchParams();
  p.set('customer', opts.customerId);
  p.set('return_url', opts.returnTo);
  /*
   * WHICH CONTROLS THE PORTAL OFFERS WAS A SETTING IN A WEB UI THIS REPO CANNOT SEE.
   *
   * With no `configuration`, Stripe renders the dashboard's DEFAULT portal configuration — so
   * 'Update your payment method' on a past_due notice, and 'Manage billing, invoices and
   * cancellation' on /usage, both promised a control that somebody could switch off in another tab
   * without anything here noticing. Naming a configuration pins the feature set to a version the
   * deployment controls: payment_method_update, invoice_history and subscription_cancel are the
   * three this product's copy actually promises.
   *
   * ABSENT IS NOT EMPTY. An unset or whitespace value must not be sent: Stripe refuses a blank
   * configuration id, and the portal is the only route a customer has to their own card.
   */
  const configuration = (env as unknown as CheckoutEnv).STRIPE_PORTAL_CONFIGURATION?.trim();
  if (configuration) p.set('configuration', configuration);
  return { ok: true, body: p.toString() };
}
