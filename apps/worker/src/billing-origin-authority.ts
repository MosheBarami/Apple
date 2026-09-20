import type { Env } from './env';
import {
  entitlementFor,
  interpretStripeEvent,
  type Subscription,
} from './billing';

/** The only worker allowed to resolve Stripe subscription state into entitlement. */
export const BILLING_AUTHORITY_WORKER = 'apple' as const;
/** Existing QuotaDO namespace kept in sync while sessions still use the legacy worker. */
export const BILLING_REPLICA_WORKER = 'golem' as const;

/** A Stripe subscription should be small; cap the provider response before parsing it. */
export const STRIPE_SUBSCRIPTION_MAX_BYTES = 64 * 1024;
const DO_RESPONSE_MAX_BYTES = 32 * 1024;
const BOUNDED_JSON_TIMEOUT_MS = 5_000;
const BOUNDED_JSON_MAX_READS = 1_024;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ResolvedBillingMutation = SubscriptionMutation | CreditsMutation;
export type BillingMutation = ResolvedBillingMutation & {
  /**
   * Monotonic per-user sequence assigned by the canonical authority QuotaDO.
   *
   * Subscription replicas use it as an ordering fence. Credit grants remain additive and are
   * deduplicated by Stripe event id, so an out-of-order credit can never be discarded merely because
   * a later subscription state arrived first.
   */
  authoritySequence: number;
};

export interface SubscriptionMutation {
  version: 1;
  kind: 'subscription';
  userId: string;
  /** Stripe event id. Reusing the legacy id keeps rollout idempotent with already-applied events. */
  eventId: string;
  /** Stripe delivery that triggered this reconciliation, retained only for audit. */
  sourceEventId: string;
  plan: Subscription['plan'];
  customerId: string | null;
  subscription: Subscription;
}

export interface CreditsMutation {
  version: 1;
  kind: 'credits';
  userId: string;
  /** The purchase itself is the state change, so Stripe's event id is the idempotency key. */
  eventId: string;
  sourceEventId: string;
  credits: number;
}

/**
 * WHY NOBODY CAN BE UPGRADED, IN ONE READ.
 *
 * THE FAILURE THIS EXISTS FOR. Establishing whether a Stripe event could reach BOTH quota stores
 * took four hours and a Cloudflare API call against the deployed script's binding list, because
 * nothing the product serves says anything about it. `/api/billing/config` answers
 * `{"checkout": false}` for three completely different situations — no webhook secret, no API key,
 * or a TEST key refused in production — and the webhook's own two refusals are deliberately mute
 * so a prober cannot learn which half of a forgery was wrong. Every one of those refusals is
 * correct facing the internet and useless facing the owner, who is entitled to know why his
 * product cannot take money.
 *
 * `golem` was ALSO found answering the webhook with 503 `billing not configured` — correct, it
 * holds no webhook secret and is the replica, not the authority — and there was no way to tell
 * that from a misconfiguration without reading two wrangler files.
 *
 * PURE, AND IT NAMES NO SECRET. Every field is a boolean or a closed enum derived from presence
 * and shape; no value, prefix or length of any secret leaves this function. It is pure so the
 * decision can be falsified in a unit test rather than against a deployment.
 *
 * `mutationWouldApplyToBoth` is the question the migration actually turns on: a subscription
 * bought today has to land in the canonical QuotaDO *and* in golem's, or one of the two stores is
 * silently wrong about what the customer paid for.
 *
 * WHAT IT IS COMPUTED FROM, STATED EXACTLY, because this comment used to say "the same four
 * conditions the webhook route itself checks, in the same order, so the report and the route cannot
 * disagree" — and that was the reason to trust `why`, and it was not true.
 *
 * THREE of the conditions are the route's own, and their order against the route is asserted in
 * apps/worker/tests/billing-wiring-report.test.mjs: the webhook secret, the authority identity and
 * the replica binding. Those really are refusals, and `why` really does name the one the route
 * would stop at.
 *
 * THE TWO STRIPE-KEY CONDITIONS ARE NOT REFUSALS THE ROUTE MAKES. Nothing on the webhook path
 * tests a key for a test/live prefix at all — `checkoutConfigured` does that, and it guards
 * CHECKOUT (billing.ts), not this. `resolveBillingAuthorityMutation` reads the key only through
 * `stripeKey`, which refuses an absent or empty one and admits every other. So:
 *
 *   * with a TEST key in production, a subscription event is not refused here. It is attempted, and
 *     Stripe answers for a subscription that key cannot see, which becomes a 502
 *     `stripe_subscription_unavailable` and a 503 to Stripe — a failure Stripe will retry, not a
 *     configuration refusal. The outcome for the customer is the same (no entitlement) and the
 *     shape is not, which is worth knowing before reading a retry storm as a fault.
 *   * a CREDITS mutation never reads the key at all: `resolveBillingAuthorityMutation` returns the
 *     credits mutation before `stripeKey` is called. Both key conditions are simply irrelevant to
 *     it. No such event can arrive today only because `checkoutConfigured` refuses to mint the
 *     checkout session that would produce one — a DIFFERENT guard, in a different file.
 *
 * So `mutationWouldApplyToBoth: false` with a key reason is a correct bottom line reached partly
 * through a condition this function imposes and the route does not. It is deliberate — the owner
 * asking "can my product take money" is owed "no", and a test key in production means no — and it
 * is stated here rather than implied, so nobody reads `why` as a line of the route's source.
 */
export type StripeKeyState = 'absent' | 'test' | 'live';

export interface BillingWiring {
  /** The deployment identity from `vars`, never from the request Host. */
  worker: string | null;
  canonicalAuthority: typeof BILLING_AUTHORITY_WORKER;
  isAuthority: boolean;
  /** The compatibility namespace must be bound for a mutation to reach the old store. */
  replicaBound: boolean;
  replicaWorker: typeof BILLING_REPLICA_WORKER;
  webhookSecret: boolean;
  stripeApiKey: StripeKeyState;
  production: boolean;
  priceIds: { builder: boolean; studio: boolean };
  /** Could a signature-verified subscription event be applied to BOTH stores right now? */
  mutationWouldApplyToBoth: boolean;
  /**
   * The FIRST condition that is not met, in the order the webhook checks them, or null when every
   * one is. One reason rather than a list: the route stops at the first, and a report that named
   * later ones too would describe a code path nothing takes.
   */
  why:
    | 'webhook_secret_missing'
    | 'not_the_billing_authority'
    | 'replica_binding_missing'
    | 'stripe_api_key_missing'
    | 'stripe_api_key_is_a_test_key_in_production'
    | null;
}

export function billingWiring(env: Env): BillingWiring {
  const e = env as unknown as {
    STRIPE_WEBHOOK_SECRET?: unknown;
    STRIPE_SECRET_KEY?: unknown;
    STRIPE_PRICE_BUILDER?: unknown;
    STRIPE_PRICE_STUDIO?: unknown;
    ENVIRONMENT?: unknown;
  };
  const present = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
  const worker = typeof env.BILLING_WORKER_NAME === 'string' ? env.BILLING_WORKER_NAME : null;
  const isAuthority = worker === BILLING_AUTHORITY_WORKER;
  const replicaBound = Boolean(env.LEGACY_QUOTA_DO);
  const webhookSecret = present(e.STRIPE_WEBHOOK_SECRET);
  const production = e.ENVIRONMENT === 'production';
  // The same prefix SHAPE `checkoutConfigured` matches, and for the same reason: Stripe mints
  // restricted keys too, so `rk_test_` is as much a test key as `sk_test_`. An unrecognised live
  // form stays 'live', because refusing what we do not recognise would report a working
  // deployment as broken.
  const key = present(e.STRIPE_SECRET_KEY) ? String(e.STRIPE_SECRET_KEY).trim() : null;
  const stripeApiKey: StripeKeyState = key === null ? 'absent' : /^[a-z]+_test_/.test(key) ? 'test' : 'live';

  const why: BillingWiring['why'] = !webhookSecret
    ? 'webhook_secret_missing'
    : !isAuthority
      ? 'not_the_billing_authority'
      : !replicaBound
        ? 'replica_binding_missing'
        : stripeApiKey === 'absent'
          ? 'stripe_api_key_missing'
          : stripeApiKey === 'test' && production
            ? 'stripe_api_key_is_a_test_key_in_production'
            : null;

  return {
    worker,
    canonicalAuthority: BILLING_AUTHORITY_WORKER,
    isAuthority,
    replicaBound,
    replicaWorker: BILLING_REPLICA_WORKER,
    webhookSecret,
    stripeApiKey,
    production,
    priceIds: { builder: present(e.STRIPE_PRICE_BUILDER), studio: present(e.STRIPE_PRICE_STUDIO) },
    mutationWouldApplyToBoth: why === null,
    why,
  };
}

export class BillingAuthorityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BillingAuthorityError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

export function billingSourceEventId(event: unknown): string | null {
  const e = object(event);
  return nonEmptyString(e?.['id']);
}

async function boundedJson(response: Response, maxBytes: number, codePrefix: string): Promise<unknown> {
  const cancelBody = () => {
    if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
  };
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    cancelBody();
    throw new BillingAuthorityError(`${codePrefix}_invalid`, 502, `${codePrefix} did not return JSON`);
  }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    cancelBody();
    throw new BillingAuthorityError(`${codePrefix}_invalid`, 502, `${codePrefix} returned an invalid response length`);
  }
  if (length !== null && Number(length) > maxBytes) {
    cancelBody();
    throw new BillingAuthorityError(`${codePrefix}_too_large`, 502, `${codePrefix} response exceeded the size limit`);
  }
  if (!response.body) {
    throw new BillingAuthorityError(`${codePrefix}_invalid`, 502, `${codePrefix} returned invalid JSON`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => {});
      reject(new BillingAuthorityError(`${codePrefix}_timeout`, 502, `${codePrefix} response exceeded the read deadline`));
    }, BOUNDED_JSON_TIMEOUT_MS);
  });
  const read = async (): Promise<unknown> => {
    let bytes = 0;
    let text = '';
    for (let reads = 0; reads < BOUNDED_JSON_MAX_READS; reads++) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        try {
          return JSON.parse(text);
        } catch {
          throw new BillingAuthorityError(`${codePrefix}_invalid`, 502, `${codePrefix} returned invalid JSON`);
        }
      }
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        throw new BillingAuthorityError(`${codePrefix}_too_large`, 502, `${codePrefix} response exceeded the size limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    throw new BillingAuthorityError(`${codePrefix}_invalid`, 502, `${codePrefix} response exceeded the read limit`);
  };
  try {
    return await Promise.race([read(), deadline]);
  } catch (error) {
    if (error instanceof BillingAuthorityError) throw error;
    throw new BillingAuthorityError(`${codePrefix}_invalid`, 502, `${codePrefix} returned invalid JSON`);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

function stripeKey(env: Env): string {
  const key = (env as unknown as { STRIPE_SECRET_KEY?: unknown }).STRIPE_SECRET_KEY;
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new BillingAuthorityError('stripe_api_not_configured', 503, 'Stripe API access is not configured');
  }
  return key.trim();
}

/**
 * Resolve an already signature-verified Stripe event into the one mutation both quota namespaces
 * must receive. Subscription snapshots are never trusted for ordering: Stripe is read again and the
 * current subscription state is what becomes authoritative.
 */
export async function resolveBillingAuthorityMutation(
  event: unknown,
  env: Env,
  fetcher: Fetcher = fetch,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ResolvedBillingMutation | null> {
  const outcome = interpretStripeEvent(event, env);
  if (!outcome.userId) return null;
  if (outcome.ignored && !outcome.subscription && !outcome.creditsDelta) return null;
  if (!outcome.eventId) {
    throw new BillingAuthorityError('stripe_event_id_missing', 400, 'Actionable Stripe event has no event id');
  }

  if (outcome.creditsDelta) {
    return {
      version: 1,
      kind: 'credits',
      userId: outcome.userId,
      eventId: outcome.eventId,
      sourceEventId: outcome.eventId,
      credits: outcome.creditsDelta,
    };
  }

  if (!outcome.subscription) return null;
  const subscriptionId = outcome.subscription.subscriptionId;
  if (!subscriptionId) {
    throw new BillingAuthorityError('stripe_subscription_id_missing', 400, 'Subscription event has no subscription id');
  }

  let response: Response;
  try {
    // `credentials` is a Fetch standard field and is honored by the runtime, but Cloudflare's
    // narrowed RequestInit type omits it. Keep the runtime guard without widening every caller.
    const init = {
      method: 'GET',
      headers: { Authorization: `Bearer ${stripeKey(env)}` },
      redirect: 'error',
      credentials: 'omit',
    } as unknown as RequestInit;
    response = await fetcher(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, init);
  } catch {
    throw new BillingAuthorityError('stripe_subscription_unavailable', 502, 'Current Stripe subscription could not be read');
  }
  if (!response.ok) {
    // Do not read or surface provider bodies here. They can contain request detail and identifiers.
    throw new BillingAuthorityError('stripe_subscription_unavailable', 502, 'Current Stripe subscription could not be read');
  }

  const current = object(await boundedJson(response, STRIPE_SUBSCRIPTION_MAX_BYTES, 'stripe_subscription'));
  if (!current) {
    throw new BillingAuthorityError('stripe_subscription_invalid', 502, 'Current Stripe subscription was not an object');
  }
  if (nonEmptyString(current['id']) !== subscriptionId) {
    throw new BillingAuthorityError('stripe_subscription_mismatch', 502, 'Stripe returned a different subscription');
  }
  const metadata = object(current['metadata']);
  if (nonEmptyString(metadata?.['userId']) !== outcome.userId) {
    throw new BillingAuthorityError('stripe_user_mismatch', 502, 'Stripe subscription belongs to a different account');
  }

  // Reuse billing.ts as the single parser for price, status, period and customer fields.
  const latest = interpretStripeEvent({
    id: outcome.eventId,
    type: 'customer.subscription.updated',
    data: { object: current },
  }, env);
  if (!latest.subscription || latest.userId !== outcome.userId) {
    throw new BillingAuthorityError('stripe_subscription_invalid', 502, 'Current Stripe subscription could not be interpreted');
  }
  const plan = entitlementFor(latest.subscription, nowSeconds);
  return {
    version: 1,
    kind: 'subscription',
    userId: outcome.userId,
    // Preserve Stripe's id through the migration. The previous direct webhook path already wrote
    // this exact id into QuotaDO.applied_events, so a delivery straddling rollout remains a replay
    // instead of becoming a second application under a newly invented key.
    eventId: outcome.eventId,
    sourceEventId: outcome.eventId,
    plan,
    customerId: latest.subscription.customerId,
    subscription: latest.subscription,
  };
}

function isResolvedBillingMutation(value: unknown): value is ResolvedBillingMutation {
  const m = object(value);
  if (!m || m['version'] !== 1) return false;
  const userId = nonEmptyString(m['userId']);
  const eventId = nonEmptyString(m['eventId']);
  const sourceEventId = nonEmptyString(m['sourceEventId']);
  if (!userId || !eventId || !sourceEventId) return false;

  if (m['kind'] === 'credits') {
    const credits = safeInteger(m['credits']);
    return eventId === sourceEventId && credits !== null && credits > 0;
  }
  if (m['kind'] !== 'subscription') return false;
  const subscription = object(m['subscription']);
  if (eventId !== sourceEventId || !subscription) return false;
  const plan = m['plan'];
  const subPlan = subscription['plan'];
  if (!['free', 'builder', 'studio', 'enterprise'].includes(String(plan))) return false;
  if (!['free', 'builder', 'studio', 'enterprise'].includes(String(subPlan))) return false;
  // `subscription.plan` is the tier Stripe is billing for; `plan` is the entitlement we enforce.
  // Canceled, unpaid and lapsed subscriptions therefore preserve their purchased tier while
  // enforcing free. Elevated entitlement must still match that purchased tier and an entitling
  // status. Do not compare currentPeriodEnd with the current clock here: this validator also reads
  // stored replay snapshots, and a mutation valid when sequenced must remain valid after its period
  // naturally passes so the exact original replay can still converge a lagging replica.
  const status = subscription['status'];
  if (status !== null && typeof status !== 'string') return false;
  if (plan !== 'free' && (plan !== subPlan || !['active', 'trialing', 'past_due'].includes(String(status)))) return false;
  const customerId = m['customerId'];
  if (customerId !== null && typeof customerId !== 'string') return false;
  if (subscription['customerId'] !== customerId) return false;
  for (const field of ['subscriptionId', 'itemId'] as const) {
    const v = subscription[field];
    if (v !== null && typeof v !== 'string') return false;
  }
  const periodEnd = subscription['currentPeriodEnd'];
  if (periodEnd !== null && (typeof periodEnd !== 'number' || !Number.isFinite(periodEnd))) return false;
  if (typeof subscription['cancelAtPeriodEnd'] !== 'boolean') return false;
  return true;
}

export function isBillingMutation(value: unknown): value is BillingMutation {
  const m = object(value);
  const sequence = safeInteger(m?.['authoritySequence']);
  return sequence !== null && sequence > 0 && isResolvedBillingMutation(value);
}

export function sequenceBillingMutation(
  mutation: ResolvedBillingMutation,
  authoritySequence: number,
): BillingMutation {
  if (!Number.isSafeInteger(authoritySequence) || authoritySequence <= 0) {
    throw new BillingAuthorityError('billing_authority_sequence_invalid', 503, 'Billing authority sequence is invalid');
  }
  return { ...mutation, authoritySequence };
}

/** The exact legacy QuotaDO mutation used by authority/replica internals after sequencing. */
export function localQuotaRequestForBillingMutation(
  mutation: ResolvedBillingMutation | BillingMutation,
): { url: string; init: RequestInit } {
  if (mutation.kind === 'credits') {
    return {
      url: 'https://do/grant-credits',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          credits: mutation.credits,
          eventId: mutation.eventId,
          sourceEventId: mutation.sourceEventId,
        }),
      },
    };
  }
  return {
    url: 'https://do/set-plan',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        plan: mutation.plan,
        customerId: mutation.customerId,
        subscription: mutation.subscription,
        eventId: mutation.eventId,
        sourceEventId: mutation.sourceEventId,
      }),
    },
  };
}

/** The compatibility replica receives the full sequenced mutation so it can fence stale state. */
export function quotaRequestForBillingMutation(mutation: BillingMutation): { url: string; init: RequestInit } {
  return {
    url: 'https://do/billing-replica',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutation }),
    },
  };
}

interface FetchTarget {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** Deliver one normalized mutation and fail closed unless the QuotaDO explicitly confirms it. */
export async function deliverBillingMutation(
  target: FetchTarget,
  mutation: BillingMutation,
  worker: typeof BILLING_AUTHORITY_WORKER | typeof BILLING_REPLICA_WORKER,
): Promise<Record<string, unknown>> {
  const request = quotaRequestForBillingMutation(mutation);
  let response: Response;
  try {
    response = await target.fetch(request.url, request.init);
  } catch {
    throw new BillingAuthorityError('quota_delivery_failed', 503, `Billing mutation was not acknowledged by ${worker}`);
  }
  if (!response.ok) {
    throw new BillingAuthorityError('quota_delivery_failed', 503, `Billing mutation was not acknowledged by ${worker}`);
  }
  let parsed: unknown;
  try {
    parsed = await boundedJson(response, DO_RESPONSE_MAX_BYTES, 'quota_delivery');
  } catch {
    throw new BillingAuthorityError('quota_delivery_failed', 503, `Billing mutation was not acknowledged by ${worker}`);
  }
  const body = object(parsed);
  if (!body || body['ok'] !== true) {
    throw new BillingAuthorityError('quota_delivery_failed', 503, `Billing mutation was not acknowledged by ${worker}`);
  }
  const acknowledgedSequence = safeInteger(body['authoritySequence']);
  const stale = body['stale'] === true;
  if (
    acknowledgedSequence === null
    || acknowledgedSequence <= 0
    || (stale ? acknowledgedSequence <= mutation.authoritySequence : acknowledgedSequence !== mutation.authoritySequence)
  ) {
    throw new BillingAuthorityError('quota_delivery_failed', 503, `Billing mutation was not acknowledged by ${worker}`);
  }
  return body;
}

/**
 * Ask the canonical per-user QuotaDO to resolve and apply an event. This transport contains the
 * verified event only; webhook and Stripe API secrets stay in Worker/DO environment bindings.
 */
export async function invokeBillingAuthority(
  authority: FetchTarget,
  event: unknown,
): Promise<{ ok: true; replayed: boolean; mutation: BillingMutation | null }> {
  let response: Response;
  try {
    response = await authority.fetch('https://do/billing-authority', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  } catch {
    throw new BillingAuthorityError('quota_authority_failed', 503, 'Billing authority did not acknowledge the event');
  }
  if (!response.ok) {
    throw new BillingAuthorityError('quota_authority_failed', 503, 'Billing authority did not acknowledge the event');
  }
  const parsed = object(await boundedJson(response, DO_RESPONSE_MAX_BYTES, 'quota_authority'));
  if (
    !parsed
    || parsed['ok'] !== true
    || typeof parsed['replayed'] !== 'boolean'
    || !Object.hasOwn(parsed, 'mutation')
  ) {
    throw new BillingAuthorityError('quota_authority_invalid', 503, 'Billing authority returned an invalid response');
  }
  const replayed = parsed['replayed'];
  const mutation = parsed['mutation'];
  if (mutation === null) {
    if (replayed) {
      throw new BillingAuthorityError('quota_authority_invalid', 503, 'Billing authority returned an invalid response');
    }
    return { ok: true, replayed, mutation: null };
  }
  const sourceEventId = billingSourceEventId(event);
  if (!isBillingMutation(mutation) || !sourceEventId || mutation.sourceEventId !== sourceEventId) {
    throw new BillingAuthorityError('quota_authority_invalid', 503, 'Billing authority returned an invalid response');
  }
  return { ok: true, replayed, mutation };
}
