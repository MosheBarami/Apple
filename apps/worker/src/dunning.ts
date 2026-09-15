// A FAILED PAYMENT, READ OFF THE EVENT THAT REPORTS IT.
//
// `billing.ts` answers one question - what tier does this subscription entitle - and answers it
// from `customer.subscription.*` and `checkout.session.completed`. It returns `ignored` for every
// invoice event, and that is the right shape for it: an interpreter whose output is a PlanId has
// no business carrying an invoice number.
//
// This answers a different question off the events that one skips. `billing.ts:60` keeps
// `past_due` ENTITLING on purpose, with a good reason - a failed renewal is usually an expired
// card, and cutting a paying customer off at the first retry is worse service than carrying them
// through it. The consequence, until now, was that a card could fail, Stripe could retry it three
// times over a fortnight, the subscription could lapse to free at the end of it, and nothing in
// the product ever said a word. The generous grace period was invisible, so it read as the service
// breaking for no reason.
//
// WHAT IT DELIBERATELY DOES NOT DO: change entitlement. Nothing here returns a plan, and the
// webhook applies it as a notification only. Entitlement is recomputed from the subscription
// events, by `entitlementFor`, from status and period - and a dunning path that could also move a
// tier would be a second, quieter opinion about what somebody has paid for.

/** The dunning events worth telling a person about, and what each one means to them. */
export const DUNNING_KINDS = ['payment_failed', 'action_required', 'payment_recovered'] as const;
export type DunningKind = (typeof DUNNING_KINDS)[number];

const EVENT_TO_KIND: Readonly<Record<string, DunningKind>> = {
  'invoice.payment_failed': 'payment_failed',
  'invoice.payment_action_required': 'action_required',
  // The all-clear. Sent when a retry succeeds, and a product that announces the problem and never
  // announces the fix has taught the person to distrust the announcement.
  'invoice.payment_succeeded': 'payment_recovered',
};

export interface DunningNotice {
  kind: DunningKind;
  userId: string;
  /** Stripe's event id, so a redelivery does not become a second notification. */
  eventId: string | null;
  /** The invoice. It is the dedupe subject: three retries of ONE invoice are one problem. */
  invoiceId: string | null;
  /** Minor units, as Stripe reports them, or null when the field is unreadable. */
  amountDue: number | null;
  currency: string | null;
  /** How many times Stripe has tried. Null when absent rather than zero - see below. */
  attempt: number | null;
}

/**
 * Where the user id lives on an invoice, in the order Stripe actually puts it.
 *
 * An invoice does NOT inherit `metadata` from the subscription it bills. Stripe copies the
 * subscription's metadata onto `subscription_details.metadata`, and anything set on the invoice
 * itself lands on `metadata`. Reading only `metadata` - which is what the subscription interpreter
 * does, correctly, for its own events - finds nothing on the overwhelming majority of real
 * dunning events, and "nothing" here means the person is never told.
 */
function userIdOf(obj: Record<string, unknown>): string | null {
  const own = obj['metadata'];
  if (own && typeof own === 'object' && typeof (own as Record<string, unknown>)['userId'] === 'string') {
    const v = (own as Record<string, string>)['userId'];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  const details = obj['subscription_details'];
  if (details && typeof details === 'object') {
    const meta = (details as Record<string, unknown>)['metadata'];
    if (meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>)['userId'] === 'string') {
      const v = (meta as Record<string, string>)['userId'];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return null;
}

function intOrNull(v: unknown): number | null {
  // `Number(null)` is 0 and `Number('')` is 0, and a 0 here would be rendered as a real amount or
  // a real attempt number. An unreadable field says so rather than becoming a plausible figure.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Is this event a payment problem, and whose?
 *
 * Returns null for everything else, including every event `interpretStripeEvent` handles - the two
 * functions read disjoint event types and neither decides anything the other decides.
 */
export function interpretDunningEvent(event: unknown): DunningNotice | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } };
  const type = typeof e.type === 'string' ? e.type : '';
  // `Object.hasOwn`, not a bare index: `EVENT_TO_KIND['constructor']` is truthy through the
  // prototype chain, and a forged `type` of `constructor` would otherwise produce a Function where
  // a kind belongs.
  if (!Object.hasOwn(EVENT_TO_KIND, type)) return null;
  const kind = EVENT_TO_KIND[type]!;
  const obj = e.data?.object ?? {};

  const userId = userIdOf(obj);
  if (!userId) return null; // nobody to tell; not an error, just not ours

  // A successful payment that was never IN trouble is not news. Stripe sends
  // `invoice.payment_succeeded` for every ordinary renewal, and announcing each one would train
  // people to ignore the channel that also carries the failures. `attempt_count > 1` is the
  // signal that this one had failed before.
  const attempt = intOrNull(obj['attempt_count']);
  if (kind === 'payment_recovered' && (attempt === null || attempt <= 1)) return null;

  return {
    kind,
    userId,
    eventId: typeof e.id === 'string' && e.id.length > 0 ? e.id : null,
    invoiceId: typeof obj['id'] === 'string' ? obj['id'] : null,
    amountDue: intOrNull(obj['amount_due']),
    currency: typeof obj['currency'] === 'string' ? obj['currency'] : null,
    attempt,
  };
}

/** Minor units into something a person reads. Unreadable stays unreadable. */
export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount === null || currency === null) return null;
  const major = (amount / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

export interface DunningCopy {
  title: string;
  body: string;
}

/**
 * What the person is actually told.
 *
 * The body says WHAT HAPPENS NEXT, because that is the only part that changes what they do. "Your
 * payment failed" with no consequence attached is an alarm with no action behind it, and the
 * consequence here is genuinely mild - `past_due` keeps entitling - so saying so is both honest
 * and calming.
 */
export function dunningCopy(n: DunningNotice): DunningCopy {
  const amount = formatAmount(n.amountDue, n.currency);
  const sum = amount ? ` for ${amount}` : '';
  switch (n.kind) {
    case 'payment_failed':
      return {
        title: 'A payment on your account did not go through',
        body:
          `The last charge${sum} was declined, usually an expired or replaced card. ` +
          'Your plan keeps working while the card is retried. Updating it in the billing portal fixes it.',
      };
    case 'action_required':
      return {
        title: 'Your bank wants you to confirm a payment',
        body: `The charge${sum} is waiting on a confirmation from your bank. Nothing stops until it is resolved.`,
      };
    case 'payment_recovered':
      return {
        title: 'That payment went through',
        body: `The charge${sum} that failed earlier has now been collected. Nothing more is needed.`,
      };
  }
}
