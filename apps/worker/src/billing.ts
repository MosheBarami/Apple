/**
 * Billing — subscription state, purchased credits, and the Stripe webhook that drives both.
 *
 * WHAT THIS IS FOR. `PLAN_LIMITS` grants 60 Sparks/day to every signup, with no cap on signups and
 * no way to charge anyone. At a measured ~$0.025 per quality-gated build, that makes each new user
 * a pure cost. This is the piece that turns a plan into something a user can actually buy.
 *
 * TWO BALANCES, DELIBERATELY SEPARATE.
 *   - A PLAN grants a renewable Spark allowance. It is a rate: it resets, it does not accumulate.
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
 */
export function interpretStripeEvent(event: unknown): BillingOutcome {
  if (typeof event !== 'object' || event === null) return { userId: null, ignored: 'not an object' };
  const e = event as { type?: string; data?: { object?: Record<string, unknown> } };
  const obj = e.data?.object ?? {};
  const type = e.type ?? '';
  const metadata = (obj['metadata'] as Record<string, string> | undefined) ?? {};
  const userId = metadata['userId'] ?? null;

  switch (type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      if (!userId) return { userId: null, ignored: 'subscription carries no metadata.userId' };
      const planRaw = metadata['plan'];
      const status = typeof obj['status'] === 'string' ? obj['status'] : null;
      // A deletion is a lapse to free regardless of what the plan metadata still says.
      const deleted = type === 'customer.subscription.deleted';
      const plan: PlanId = deleted ? 'free' : isPlanId(planRaw) ? planRaw : 'free';
      return {
        userId,
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
      if (!userId) return { userId: null, ignored: 'checkout session carries no metadata.userId' };
      // One-off credit purchase. Subscription checkouts are handled by the subscription events
      // above, so this only applies when credits were actually bought.
      const credits = Number(metadata['credits'] ?? 0);
      if (obj['payment_status'] !== 'paid') return { userId, ignored: `payment_status ${String(obj['payment_status'])}` };
      if (!Number.isFinite(credits) || credits <= 0) return { userId, ignored: 'no credits in metadata' };
      return { userId, creditsDelta: Math.floor(credits) };
    }

    default:
      return { userId, ignored: `unhandled event type ${type}` };
  }
}

/** Is billing configured at all? Everything here is inert without the secret. */
export function billingConfigured(env: Env): boolean {
  return typeof (env as unknown as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET === 'string'
    && ((env as unknown as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET ?? '').length > 0;
}
