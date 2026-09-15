// THE CONFIRM STEP BETWEEN CHOOSING A PLAN AND BEING SENT TO A CARD FORM.
//
// Built on ./modal rather than beside it: the focus trap, the Escape handling and the focus restore
// are already correct there, and a second dialog implementation is a second one to get wrong. The
// same call confirm-dialog.tsx made, for the same reason — but this is NOT a ConfirmDialog: that
// one renders a destructive ceremony in danger copy with a red button, and buying something is not
// a thing to be warned about. It is a thing to be shown.
//
// Every sentence comes from `orderSummary`, which is pure and tested on its own. Nothing in this
// component decides what a number means.
import { Modal } from './modal';
import { orderSummary } from '../lib/order-summary';
import { formatNumber } from '../lib/format';
import { PLAN_COPY, PLAN_LIMITS, PRICE_CURRENCY, formatMoney, type PlanId } from '@golem/shared';

export function OrderSummaryDialog({
  plan,
  currentPlan,
  currency,
  busy = false,
  onConfirm,
  onCancel,
}: {
  /** The tier being bought. Null closes the dialog — there is no order in flight. */
  plan: PlanId | null;
  currentPlan: PlanId;
  /** What this deployment charges in, from the server. Undefined while the config is in flight. */
  currency?: string;
  busy?: boolean;
  onConfirm: (plan: PlanId) => void;
  onCancel: () => void;
}) {
  if (!plan) return null;
  const summary = orderSummary({
    planName: PLAN_COPY[plan].name,
    priceMonthly: PLAN_COPY[plan].priceUsdMonthly,
    creditsPerMonth: PLAN_LIMITS[plan].creditsPerMonth,
    currentPlanName: PLAN_COPY[currentPlan].name,
    currentCreditsPerMonth: PLAN_LIMITS[currentPlan].creditsPerMonth,
    // The declared code is the fallback the ladder already uses while /api/billing/config is in
    // flight, and it is formatMoney's own default too, so the words and the figure cannot disagree.
    currency: currency ?? PRICE_CURRENCY,
    formatMoney: (amount, code) => formatMoney(amount, { currency: code }),
    formatNumber,
  });
  // A tier with no price has no order to show. The caller is gated on `purchasable` already; this is
  // the second lock on the same door, and it closes the dialog rather than rendering a blank total.
  if (!summary) return null;

  return (
    <Modal title={summary.title} onClose={onCancel} locked={busy}>
      <dl className="order-summary">
        {summary.lines.map((line) => (
          <div className="order-summary__row" key={line.label}>
            <dt className="order-summary__label">{line.label}</dt>
            <dd className="order-summary__value">{line.value}</dd>
          </div>
        ))}
      </dl>

      <p className="order-summary__terms">{summary.terms}</p>
      <p className="order-summary__tax">{summary.tax}</p>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {summary.cancelLabel}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(plan)} disabled={busy}>
          {busy ? 'Opening…' : summary.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
