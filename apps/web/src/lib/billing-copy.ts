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
// what a change will cost, before it is made
// ---------------------------------------------------------------------------

/** Stripe's answer to "what would this change cost", as `/api/billing/preview` returns it. */
export interface PlanChangePreview {
  /** MAJOR units, already converted by the worker. Negative when the change leaves a credit. */
  amountDue: number;
  /** ISO 4217. The charge currency is the server's to state, never the page's to assume. */
  currency: string;
  /** Unix SECONDS — Stripe's clock, unlike BillingChange.at which is milliseconds. */
  prorationDate: number | null;
  lines: { description: string; amount: number }[];
}

export interface ChangePreviewOptions {
  /** The tier being moved TO, in the words a person reads. Plan ids are not those words. */
  planName: string;
  formatMoney: (amount: number, currency: string) => string;
  /** Renders unix seconds. Seconds, because this date came from Stripe rather than from our DO. */
  formatDate: (seconds: number) => string;
}

/**
 * One sentence saying what this change costs, INCLUDING when nobody could find out.
 *
 * NULL IS NOT ZERO, and this is the whole reason the function exists rather than a template in the
 * dialog. The preview can fail — Stripe unreachable, or a subscription stored before its item id
 * was kept — and the only honest thing to say then is that the amount is unknown and Stripe's own
 * page will show it. Rendering "charges $0.00 today" out of a failed fetch is a claim about money
 * assembled from a failure to observe, which is the defect this codebase keeps finding.
 *
 * The three shapes a real answer takes are also three different sentences: a charge today, nothing
 * today, and a CREDIT. Calling a negative amount a charge would state the opposite of what happens.
 */
export function planChangePreviewLine(
  preview: PlanChangePreview | null | undefined,
  opts: ChangePreviewOptions,
): string {
  const amount = preview?.amountDue;
  const currency = preview?.currency;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || typeof currency !== 'string' || !currency) {
    return 'We could not get the amount for this change. Stripe’s own page shows exactly what it costs before you confirm anything there.';
  }

  const applies =
    typeof preview?.prorationDate === 'number' && Number.isFinite(preview.prorationDate)
      ? ` It applies from ${opts.formatDate(preview.prorationDate)}.`
      : '';

  if (amount > 0) {
    // "Today" is load-bearing: this is not the monthly price on the ladder, it is the part of the
    // period being bought now, net of what the old tier had already been paid for.
    return `Moving to ${opts.planName} costs ${opts.formatMoney(amount, currency)} today — the rest of this billing period at the new price, less the time you already paid for on the old one.${applies}`;
  }
  if (amount < 0) {
    // The sign is spoken as the word "credit". Printing it as well gives "a credit of -$7.66".
    return `Moving to ${opts.planName} leaves a credit of ${opts.formatMoney(Math.abs(amount), currency)} against your next invoice.${applies}`;
  }
  // Deliberately no figure. A formatted zero beside a button reads as a price.
  return `Moving to ${opts.planName} costs nothing today.${applies}`;
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

// ---------------------------------------------------------------------------
// TAKING THE RECORD AWAY WITH YOU
// ---------------------------------------------------------------------------

/** The columns, named once. The header and every row are built from this list. */
const CSV_COLUMNS = ['date', 'kind', 'from_plan', 'to_plan', 'status', 'cancel_at_period_end', 'stripe_event'] as const;

/**
 * One CSV cell: quoted when it has to be, and never executable.
 *
 * TWO DIFFERENT HAZARDS, and only one of them is about the file format.
 *   - A comma, a quote or a newline inside a value corrupts every column after it. RFC 4180 says
 *     wrap in quotes and double the quotes, so that is what this does.
 *   - A value beginning `=`, `+`, `-`, `@`, tab or CR is run as a FORMULA the moment the file is
 *     opened in a spreadsheet. The Stripe event id is the one field here we did not write
 *     ourselves. A leading apostrophe defuses it while leaving the value legible — stripping the
 *     character would quietly change a record somebody is about to rely on.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * This account's billing history as a file it can keep.
 *
 * A ledger readable only inside a disclosure triangle on one page is not a record somebody can put
 * in front of an accountant, attach to a dispute, or keep after they cancel — and a cancelled
 * account is exactly when it is most wanted. Built from the rows the page already holds, so this
 * needs no route of its own and cannot disagree with what is on screen.
 *
 * ISO dates, not the viewer's locale: this file is read by a spreadsheet and by a person in another
 * timezone, and "3/10/2026" means two different days depending on who opens it.
 */
export function billingHistoryCsv(events: readonly BillingChange[]): string {
  const rows = events.map((e) => {
    // An unreadable instant is BLANK. "Invalid Date" in a date column is a value that looks like
    // data and is not.
    const at = Number.isFinite(e.at) ? new Date(e.at) : null;
    const date = at && !Number.isNaN(at.getTime()) ? at.toISOString() : '';
    return [
      date,
      e.kind,
      e.fromPlan,
      e.toPlan,
      e.status,
      e.cancelAtPeriodEnd === null || e.cancelAtPeriodEnd === undefined ? '' : String(e.cancelAtPeriodEnd),
      e.eventId,
    ].map(csvCell).join(',');
  });
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// INVOICES
// ---------------------------------------------------------------------------
//
// The worker's mapper decides WHICH fields of a Stripe invoice reach a browser. This decides what
// they are allowed to say. Both halves are pure and tested, for the same reason the subscription
// copy above is: a page that reads the raw fields makes the call again in every place it prints
// them, and the two readings drift.

/** One invoice, exactly as apps/worker/src/billing.ts maps it. */
export interface Invoice {
  id: string;
  number: string | null;
  created: number | null;
  status: string | null;
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

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

export type InvoiceTone = 'paid' | 'due' | 'failed' | 'neutral';
export interface InvoicePill {
  label: string;
  tone: InvoiceTone;
}

/**
 * Stripe's word for an invoice's state, in the words a customer uses.
 *
 * THE DEFAULT IS THE POINT. A status this product has not seen before must read as unrecognised,
 * never be collapsed into the reassuring end of the range: "Paid" printed over an unpaid invoice is
 * the most expensive sentence this page can produce, and it is exactly what a `?? 'paid'` would do
 * the first time Stripe adds a status.
 */
export function invoiceStatusPill(status: unknown): InvoicePill {
  switch (status) {
    case 'paid':
      return { label: 'Paid', tone: 'paid' };
    case 'open':
      return { label: 'Due', tone: 'due' };
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'uncollectible':
      // Stripe's word for "we have given up collecting this". "Unpaid" is what it means to a person.
      return { label: 'Unpaid', tone: 'failed' };
    case 'void':
      return { label: 'Voided', tone: 'neutral' };
    default:
      return { label: 'Status unknown', tone: 'neutral' };
  }
}

/**
 * Minor units into a currency amount, or NOTHING when either half is unreadable.
 *
 * `Number(null)` is 0, and a 0 here renders as a real charge of nothing on the one page whose
 * purpose is letting somebody check a figure against their bank statement.
 */
export function formatMoney(minor: unknown, currency: unknown, locale?: string): string | null {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return null;
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) return null;
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(minor / 100);
  } catch {
    // An Intl that does not know the code still has to print the number rather than throwing on a
    // billing page. Minor units are not universally 100, but Stripe reports in them and this is the
    // fallback path, not the one a real currency takes.
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

/**
 * Which of the two amounts this invoice's row is about.
 *
 * A paid invoice shows what was taken; an open one shows what is owed. `amount_paid` on an open
 * invoice is 0, and "0.00 — Due" reads as a bill for nothing.
 */
export function invoiceAmountMinor(
  invoice: Pick<Invoice, 'status' | 'amountPaid' | 'amountDue'> | null | undefined,
): number | null {
  if (!invoice) return null;
  const paid = typeof invoice.amountPaid === 'number' ? invoice.amountPaid : null;
  const due = typeof invoice.amountDue === 'number' ? invoice.amountDue : null;
  if (invoice.status === 'paid') return paid ?? due;
  return due ?? paid;
}
