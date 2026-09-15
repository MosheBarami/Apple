/**
 * THE ORDER, SAID BACK TO THE PERSON BEFORE THEY ARE SENT TO A PAYMENT PAGE.
 *
 * There was no step here at all. The first click on 'Upgrade to Studio' called the checkout mutation
 * and the browser left for Stripe's card form; the only pre-purchase statement in the whole product
 * was the plan card behind it, which describes a TIER — price, allowance, highlights — and not an
 * order. It never said what the account was moving FROM, that the charge repeats, or that tax is
 * added on top of the figure being read.
 *
 * WHY A MODEL AND NOT JUST JSX. The same reason billing-copy.ts is one: a sentence built inside a
 * component can only be checked by rendering it, this app has no DOM renderer in its tests, and the
 * sentences here are about money. Pure, with the formatters passed in, so the whole thing can be
 * read back in a test — including the case that matters most, a missing field rendering as the
 * literal text "undefined" (F-65).
 *
 * NOTHING HERE IS AN ENTITLEMENT. It describes what the user is ASKING for. The plan moves when the
 * webhook applies the subscription event, and every other surface in this product is careful to say
 * so; a summary claiming the new tier would undo all of it.
 */

export interface OrderInput {
  /** Display name of the tier being bought. */
  planName: string;
  /** Major units per month, as the plan table states it. Null means there is no order to make. */
  priceMonthly: number | null;
  /** The renewable allowance the tier grants, from the table the server enforces. */
  creditsPerMonth: number;
  /** What the account is on today — half of what is changing. */
  currentPlanName: string;
  currentCreditsPerMonth: number;
  /** What the deployment charges in, as reported by /api/billing/config. */
  currency: string;
  /** The shared money formatter, passed in so this file needs no Intl and no plan table. */
  formatMoney: (amount: number, currency: string) => string;
  formatNumber: (value: number) => string;
}

export interface OrderLine {
  label: string;
  value: string;
}

export interface OrderSummary {
  title: string;
  /** The itemised part: what is being bought, at what price, how often, and what it grants. */
  lines: OrderLine[];
  /** What the person is agreeing to, in a sentence rather than a row. */
  terms: string;
  /** Stated separately because it is the one number this product does not know. */
  tax: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * One order, or null when there is nothing that could be ordered.
 *
 * `free` is a downgrade and `enterprise` is a conversation; both carry a null price, and a summary
 * that rendered one as a blank total would be a checkout nobody could reason about. The caller is
 * already gated on `purchasable`, so this is the second lock on the same door.
 */
export function orderSummary(input: OrderInput): OrderSummary | null {
  const { planName, priceMonthly, currency, formatMoney, formatNumber } = input;
  if (typeof priceMonthly !== 'number' || !Number.isFinite(priceMonthly) || priceMonthly <= 0) return null;

  const amount = formatMoney(priceMonthly, currency);
  /*
   * "UP FROM" IS A CLAIM ABOUT DIRECTION, so it is read off the allowance rather than assumed.
   * Today only a free account can reach this dialog — every other move goes to the portal — but a
   * summary that hard-codes "up" would describe a downgrade as an upgrade the first time that
   * changes, on the screen where somebody is deciding to spend money.
   */
  const up = input.creditsPerMonth > input.currentCreditsPerMonth;
  const fromPlan = up ? `up from ${input.currentPlanName}` : `instead of ${input.currentPlanName}`;
  const fromCredits = up ? 'up from' : 'instead of';
  const lines: OrderLine[] = [
    { label: 'Plan', value: `${planName}, ${fromPlan}` },
    { label: 'Price', value: `${amount} per month` },
    { label: 'Billing', value: `Monthly in ${currency}, starting today` },
    {
      label: 'Credits',
      value: `${formatNumber(input.creditsPerMonth)} a month, ${fromCredits} ${formatNumber(input.currentCreditsPerMonth)}`,
    },
  ];

  return {
    title: `Move to ${planName}`,
    lines,
    terms:
      `You will be charged ${amount} today and the same amount each month until you cancel. ` +
      'Cancelling is one button in the billing portal, and the plan runs to the end of the period you paid for.',
    // We do not compute it and must not imply a total. Stripe works it out from the billing address
    // it collects, and saying where it happens is the honest form of "we cannot tell you yet".
    tax: `Prices exclude tax. Any VAT or sales tax is calculated at checkout from your billing address.`,
    // NOT "Pay now": pressing it charges nothing, it opens Stripe's page. This product has spent
    // real effort on not claiming money has moved, and a button label is a claim.
    confirmLabel: 'Continue to payment',
    cancelLabel: 'Cancel',
  };
}
