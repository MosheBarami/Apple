/**
 * What the product says about a subscription, decided once.
 *
 * The server sends a SubscriptionView: a plan, a state, and at most one date whose meaning depends
 * on which state it arrived with. `currentPeriodEnd` is the day you are charged again on an active
 * subscription and the day you lose access on a cancelling one, and until the webhook started
 * persisting `cancelAtPeriodEnd` the product had no way to tell those apart — so "renews on 3
 * October" was printed over a subscription that ENDED on 3 October. That is the sentence this file
 * exists to make impossible, and the reason the decision is made here rather than in the component:
 * a page that reads the raw fields makes the call again in every place it prints them.
 *
 * Pure, and formatters are passed in, so the whole sentence can be read back in a test rather than
 * asserting that a formatter was called. A date that never arrived must not appear as "undefined".
 *
 * The same shape as error-taxonomy.ts, deliberately: a stable state key, a table of copy, and one
 * function from one to the other. That is also the seam a message catalog attaches to.
 */

/** The server's own union, mirrored. Cross-checked against apps/worker/src/billing.ts in the test. */
export type BillingState =
  | 'none'
  | 'active'
  | 'trialing'
  | 'cancelling'
  | 'past_due'
  | 'needs_action'
  | 'lapsed';

/**
 * Exported so exhaustiveness is checkable. A switch with a missing branch returns null and the page
 * silently says nothing about a failed payment; the list makes "nothing to say" a decision instead
 * of an omission.
 */
export const BILLING_STATES: readonly BillingState[] = [
  'none',
  'active',
  'trialing',
  'cancelling',
  'past_due',
  'needs_action',
  'lapsed',
];

/** The server's reading of the stored Stripe subscription. */
export interface SubscriptionView {
  plan: string;
  state: BillingState;
  status: string | null;
  /** Unix seconds. Set only when the subscription actually renews. */
  renewsAt: number | null;
  /** Unix seconds. Set only when access actually ends. */
  endsAt: number | null;
  hasBillingAccount: boolean;
  needsAttention: boolean;
}

export interface BillingNotice {
  /** `warn` is for the states a user can act on. Everything else is a statement of fact. */
  tone: 'info' | 'warn';
  headline: string;
  /** The consequence, when it is not obvious from the headline. */
  detail: string | null;
  /** Label for the billing-portal control, or null when there is nothing to open. */
  action: string | null;
}

export interface NoticeOptions {
  /** Display name of the entitled plan, from the shared plan table. */
  planName: string;
  /** Renders a unix-seconds instant in the viewer's own locale and timezone. */
  formatDate: (unixSeconds: number) => string;
}

const MANAGE = 'Manage billing, invoices and cancellation';

/**
 * One sentence about this subscription, or null when there is genuinely nothing to say.
 *
 * A DATE IS NEVER INTERPOLATED UNLESS IT EXISTS. Stripe does not always send a period end — a
 * subscription cancelled before its first invoice has none — and `${undefined}` renders as the
 * literal text "undefined". Every state therefore has a dateless form that is still a sentence.
 */
export function billingNotice(view: SubscriptionView, opts: NoticeOptions): BillingNotice | null {
  const { planName, formatDate } = opts;
  const on = (seconds: number | null): string | null =>
    typeof seconds === 'number' && Number.isFinite(seconds) ? formatDate(seconds) : null;

  switch (view.state) {
    case 'none':
      // A free user who has never bought anything has no billing state. Inventing one is noise.
      return null;

    case 'active': {
      const day = on(view.renewsAt);
      return {
        tone: 'info',
        headline: day ? `Your ${planName} plan renews on ${day}.` : `Your ${planName} plan is active.`,
        detail: null,
        action: MANAGE,
      };
    }

    case 'trialing': {
      const day = on(view.renewsAt);
      return {
        tone: 'info',
        headline: day ? `Your ${planName} trial runs until ${day}.` : `You are on a ${planName} trial.`,
        detail: 'You will be charged when it ends unless you cancel before then.',
        action: MANAGE,
      };
    }

    case 'cancelling': {
      // NOT "renews". The word must not appear anywhere in this branch.
      const day = on(view.endsAt);
      return {
        tone: 'warn',
        headline: day ? `Your ${planName} plan ends on ${day}.` : `Your ${planName} plan is set to end.`,
        detail: `You keep ${planName} until then, and nothing is charged after that. You can undo this in the billing portal.`,
        action: 'Resume or change this plan',
      };
    }

    case 'past_due':
      // Access continues on purpose while Stripe retries the card. Saying so is the difference
      // between a user who updates a card and one who finds out at the cancellation.
      return {
        tone: 'warn',
        headline: 'Your last payment did not go through.',
        detail: `We are still serving your ${planName} plan while the card is retried. Update it to keep the plan.`,
        action: 'Update your payment method',
      };

    case 'needs_action':
      // SCA. The user believes they have paid, and the worst thing this page can do is imply we
      // took the money.
      return {
        tone: 'warn',
        headline: 'Your payment needs confirming with your bank.',
        detail: 'Nothing has been charged and no plan has started yet. Starting the checkout again takes you back to the confirmation step.',
        action: null,
      };

    case 'lapsed': {
      const day = on(view.endsAt);
      return {
        tone: 'info',
        headline: day ? `Your subscription ended on ${day}.` : 'Your subscription has ended.',
        detail: 'Your invoices and payment methods are still there, and you can subscribe again whenever you like.',
        action: MANAGE,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// the history
// ---------------------------------------------------------------------------

/** One recorded change to this account's billing, as QuotaDO wrote it down. */
export interface BillingChange {
  /** Milliseconds since the epoch — this one is a wall-clock instant, not Stripe's unix seconds. */
  at: number;
  kind: 'plan' | 'credits';
  fromPlan: string | null;
  toPlan: string | null;
  status: string | null;
  eventId: string | null;
  /**
   * Which way the cancellation flag moved, on the row where it moved — null on every other row.
   *
   * Absent on rows written before the column existed, which reads the same as null and is correct:
   * they are not rows about a cancellation and must not be described as if they were.
   */
  cancelAtPeriodEnd?: boolean | null;
}

export interface ChangeLineOptions {
  /** Display name for a plan id. The ids are not the words a person reads. */
  planName: (id: string) => string;
  /** Renders a millisecond instant in the viewer's own locale and timezone. */
  formatDate: (millis: number) => string;
}

/**
 * One line of billing history, or null for a record that says nothing a person could use.
 *
 * `plan` was overwritten in place before this existed, so an account's history was whatever its
 * current row happened to be. The rows now exist; this is what they say out loud.
 *
 * A PLAN CHANGE AND A STATUS CHANGE ARE THE SAME ROW and read differently: the webhook records a
 * move to past_due without moving the tier, and "Moved to Builder" over a row where the tier did
 * not move is a false sentence about the one subject a user checks against their bank statement.
 */
export function billingChangeLine(change: BillingChange, opts: ChangeLineOptions): string | null {
  const when = Number.isFinite(change.at) ? opts.formatDate(change.at) : null;
  const on = when ? ` on ${when}` : '';
  if (change.kind === 'credits') return `Credits added${on}.`;
  if (change.toPlan === null) return null;
  const to = opts.planName(change.toPlan);
  // The tier did not move, so this row is about the subscription's state. Naming the plan here
  // would report a change that did not happen.
  if (change.fromPlan !== null && change.fromPlan === change.toPlan) {
    /*
     * THE CANCELLATION IS READ BEFORE THE STATUS, because a cancellation leaves the status alone.
     * Stripe reports it as an update with status still 'active', so the branch below would have
     * printed "Subscription became active" over the row where the customer cancelled — the exact
     * opposite of what happened, on the change they are most likely to dispute.
     *
     * Non-null means the row IS the flag moving. A past_due row that merely carried the same flag
     * along is null here and falls through to the status sentence, where it belongs.
     */
    if (change.cancelAtPeriodEnd === true) return `Set to end at the period end${on}.`;
    if (change.cancelAtPeriodEnd === false) return `Cancellation undone${on}.`;
    return change.status ? `Subscription became ${change.status}${on}.` : null;
  }
  if (change.fromPlan === null) return `Moved to ${to}${on}.`;
  return `Moved from ${opts.planName(change.fromPlan)} to ${to}${on}.`;
}
