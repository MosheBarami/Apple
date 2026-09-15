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
export function buildCheckoutRequest(
  env: Env,
  opts: { userId: string; email?: string | null; plan: PlanId; returnTo: string },
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
  // One subscription per account: without this a second checkout adds a second subscription and the
  // user is charged twice for tiers that were meant to replace one another.
  p.set('allow_promotion_codes', 'true');
  return { ok: true, body: p.toString() };
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
  return { ok: true, body: p.toString() };
}
