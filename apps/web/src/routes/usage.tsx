// /usage — Credits today, 30 days of history, and the plan.
//
// Every number on this page comes from the live quota or from @golem/shared.
// Credits are billed from the compute a run actually consumes, so the per-mode
// figures are the measured typical range, not a price list.
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlanLadder } from '../components/plans';
import { meterView } from '../components/usage-meter-model';
import { formatNumber } from '../lib/format';
import { Failure } from '../components/failure';
import { PLAN_COPY, PRODUCT_MODE_INFO, isPlanId, type PlanId, type ProductMode } from '@golem/shared';
import {
  billingChangeLine,
  billingNotice,
  formatMoney,
  invoiceAmountMinor,
  invoiceStatusPill,
  type Invoice,
  type SubscriptionView,
} from '../lib/billing-copy';
import {
  fetchBillingConfig,
  fetchBillingHistory,
  fetchInvoice,
  fetchInvoices,
  fetchMe,
  fetchUsage,
  openBillingPortal,
  startCheckout,
  type UsageDay,
} from '../lib/api';
import { useToast } from '../components/toast';

const MODES: ProductMode[] = ['plan', 'agent', 'super'];

/**
 * The ring shows the ALLOWANCE, and credits are reported beside it — never added into the arc.
 *
 * It used to be handed `creditsRemaining`, which is allowance plus purchased credits, and divide it
 * by the daily allowance. A user with 1,440 credits on the free plan saw a full ring captioned
 * "1500 of 60", and an aria-label telling them that was what remained TODAY. Both numbers were
 * real and the sentence they formed was not: credits are not today's, they do not reset, and
 * spending them is a different decision from spending an allowance. This is the same rule
 * usage-meter-model.ts is built around, applied to the surface that states it in the largest type.
 */
function CreditsRing({ remaining, daily, period }: { remaining: number; daily: number; period: 'day' | 'month' }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = daily > 0 ? Math.max(0, Math.min(1, remaining / daily)) : 0;
  const window = period === 'month' ? 'this month' : 'today';
  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      role="img"
      aria-label={`${remaining} of ${daily} Credits of allowance remaining ${window}`}
    >
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform="rotate(-90 70 70)"
        className="ring-arc"
      />
      <text x="70" y="68" textAnchor="middle" className="ring-number">
        {remaining}
      </text>
      <text x="70" y="90" textAnchor="middle" className="ring-caption">
        of {daily}
      </text>
    </svg>
  );
}

/**
 * THE SUBSCRIPTION, SAID OUT LOUD.
 *
 * Before this the page could render exactly one billing fact — the tier — because the tier was the
 * only thing the webhook wrote down. A renewal date, a pending cancellation, a failed payment and a
 * card awaiting authentication all arrived on the same Stripe event and were dropped, so the
 * product's first word to a user whose card had expired was the cancellation.
 *
 * Every sentence here comes from `billingNotice`, which is tested on its own. Nothing in this
 * component decides what a date means.
 */
function BillingNotice({ view, onManage }: { view: SubscriptionView; onManage: () => void }) {
  const notice = billingNotice(view, {
    planName: PLAN_COPY[isPlanId(view.plan) ? view.plan : 'free'].name,
    // The viewer's own locale and timezone. A billing date shown in UTC to someone in Auckland can
    // be the wrong day.
    formatDate: (seconds) =>
      new Date(seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
  });
  if (!notice) return null;
  return (
    <div className={`billing-notice billing-notice--${notice.tone}`} role={notice.tone === 'warn' ? 'alert' : 'status'}>
      <p className="billing-notice__head">{notice.headline}</p>
      {notice.detail && <p className="billing-notice__detail">{notice.detail}</p>}
      {notice.action && view.hasBillingAccount && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onManage}>
          {notice.action}
        </button>
      )}
    </div>
  );
}

/**
 * WHAT HAS HAPPENED TO THIS ACCOUNT'S BILLING.
 *
 * `plan` was overwritten in place by the webhook, so "when did this go from Studio to Free, and on
 * which Stripe event" had no answer on our side at all — not for the user, and not for whoever had
 * to answer their email about it. Collapsed by default: a history is for the moment someone
 * disagrees with a charge, not a thing to read every visit.
 */
function BillingHistory() {
  const history = useQuery({ queryKey: ['billing-history'], queryFn: fetchBillingHistory, retry: false });
  const lines = (history.data?.events ?? [])
    .map((e) => ({
      key: `${e.at}:${e.eventId ?? ''}`,
      text: billingChangeLine(e, {
        planName: (id) => (isPlanId(id) ? PLAN_COPY[id].name : id),
        formatDate: (millis) => new Date(millis).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
      }),
    }))
    .filter((l): l is { key: string; text: string } => l.text !== null);
  // Nothing recorded is not the same as a history that failed to load, and neither is worth an
  // empty disclosure triangle on a page that is mostly about Credits.
  if (history.isPending || history.isError || lines.length === 0) return null;
  return (
    <details className="billing-history">
      <summary>Billing history</summary>
      <ul className="billing-history__list">
        {lines.map((l) => (
          <li key={l.key}>{l.text}</li>
        ))}
      </ul>
    </details>
  );
}

/**
 * WHAT THIS ACCOUNT WAS ACTUALLY CHARGED, on our own page.
 *
 * Before this, an invoice existed for this product's customers in exactly one place: Stripe's
 * hosted portal, behind a button that leaves the app. That is a defensible home for an invoice and
 * a bad place for it to be the only one — a customer told IN OUR OWN INBOX that a payment failed
 * could not see the invoice it was about anywhere in the thing they were paying for.
 *
 * THE PDF IS AN ORDINARY LINK. Stripe's `invoice_pdf` is already scoped and expiring; proxying
 * those bytes through the worker would turn it into a general-purpose document fetcher wearing our
 * authentication, and would give the person downloading it nothing.
 *
 * Every sentence here — the status word, the money, which of the two amounts a row is about —
 * comes from billing-copy, where it is tested. Nothing in this component decides what a field
 * means.
 */
function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  // Fetched only once the row is opened: the list is what most visits need, and 24 detail requests
  // on page load would be 24 Stripe calls nobody asked for.
  const detail = useQuery({
    queryKey: ['invoice', invoice.id],
    queryFn: () => fetchInvoice(invoice.id),
    enabled: open,
    retry: false,
  });
  const pill = invoiceStatusPill(invoice.status);
  const amount = formatMoney(invoiceAmountMinor(invoice), invoice.currency);
  const when =
    invoice.created === null
      ? null
      : new Date(invoice.created * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = detail.data?.invoice?.lines ?? [];

  return (
    <li className="invoice-row">
      <div className="invoice-row__head">
        <button
          type="button"
          className="invoice-row__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {/* A draft invoice genuinely has no number yet, and "Invoice null" is the sentence that
              teaches a customer this page is guessing. */}
          <span className="invoice-row__number">{invoice.number ?? 'Invoice'}</span>
          <span className="invoice-row__date">{when ?? 'Date unavailable'}</span>
        </button>
        <span className={`invoice-pill invoice-pill--${pill.tone}`}>{pill.label}</span>
        <span className="invoice-row__amount">{amount ?? '—'}</span>
        {invoice.pdfUrl ? (
          <a className="invoice-row__pdf" href={invoice.pdfUrl} target="_blank" rel="noreferrer noopener">
            PDF
          </a>
        ) : (
          // No link rather than a dead one: a draft invoice has no PDF, and an anchor that goes
          // nowhere is worse than an absent one.
          <span className="invoice-row__pdf invoice-row__pdf--none" aria-hidden="true" />
        )}
      </div>

      {open && (
        <div className="invoice-detail">
          {detail.isPending && (
            <p className="muted" aria-busy="true">
              Loading this invoice…
            </p>
          )}
          {detail.isError && <Failure error={detail.error} onRetry={() => void detail.refetch()} compact />}
          {detail.isSuccess && detail.data.invoice === null && (
            <p className="muted">This invoice is no longer available.</p>
          )}
          {detail.isSuccess && detail.data.invoice && (
            <>
              <ul className="invoice-detail__lines">
                {lines.map((line, i) => (
                  <li key={`${invoice.id}:${i}`} className="invoice-detail__line">
                    <span className="invoice-detail__desc">{line.description ?? 'Line item'}</span>
                    {line.quantity !== null && line.quantity !== 1 && (
                      <span className="invoice-detail__qty">×{line.quantity}</span>
                    )}
                    <span className="invoice-detail__amount">
                      {formatMoney(line.amount, invoice.currency) ?? '—'}
                    </span>
                  </li>
                ))}
                {lines.length === 0 && <li className="muted">No line items on this invoice.</li>}
              </ul>
              <dl className="invoice-detail__totals">
                {/* Each total is rendered only when it is really there. A tax row reading "—" on an
                    invoice with no tax implies tax was charged and could not be read. */}
                {formatMoney(detail.data.invoice.subtotal, invoice.currency) && (
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{formatMoney(detail.data.invoice.subtotal, invoice.currency)}</dd>
                  </div>
                )}
                {formatMoney(detail.data.invoice.tax, invoice.currency) && (
                  <div>
                    <dt>Tax</dt>
                    <dd>{formatMoney(detail.data.invoice.tax, invoice.currency)}</dd>
                  </div>
                )}
                {formatMoney(detail.data.invoice.total, invoice.currency) && (
                  <div className="invoice-detail__total">
                    <dt>Total</dt>
                    <dd>{formatMoney(detail.data.invoice.total, invoice.currency)}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function InvoiceList() {
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: fetchInvoices, retry: false });
  // Nothing to show is not the same as a list that failed to load, and neither earns a heading on a
  // page that is mostly about Credits. A customer with no invoices yet has nothing to check.
  if (invoices.isPending || invoices.isError || invoices.data.invoices.length === 0) return null;
  return (
    <section className="invoice-list" aria-labelledby="invoices-heading">
      <h3 id="invoices-heading">Invoices</h3>
      <ul className="invoice-list__rows">
        {invoices.data.invoices.map((inv) => (
          <InvoiceRow key={inv.id} invoice={inv} />
        ))}
      </ul>
    </section>
  );
}

function UsageBars({ days }: { days: UsageDay[] }) {
  // The API returns sparse rows; build a dense 30-day series so gaps read as zero.
  const byDay = new Map(days.map((d) => [d.day, d.credits]));
  const series: { day: string; credits: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push({ day: d, credits: byDay.get(d) ?? 0 });
  }
  const max = Math.max(10, ...series.map((s) => s.credits));
  const W = 600;
  const H = 150;
  const pad = 4;
  const bw = (W - pad * 2) / 30;

  return (
    <div className="bars-wrap">
      <svg
        viewBox={`0 0 ${W} ${H + 24}`}
        className="usage-bars"
        role="img"
        aria-label="Credits spent per day over the last 30 days"
      >
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="bar-base" />
        {series.map((s, i) => {
          const h = Math.max(s.credits > 0 ? 3 : 1.5, (s.credits / max) * H);
          const x = pad + i * bw;
          const label = new Date(`${s.day}T00:00:00Z`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });
          return (
            <g key={s.day}>
              <rect
                x={x + 2}
                y={H - h}
                width={bw - 4}
                height={h}
                rx={2}
                className={s.credits > 0 ? 'bar bar-active' : 'bar'}
              >
                <title>{`${label}: ${s.credits} Credits`}</title>
              </rect>
              {/* Anchor the end labels inward so they are not clipped by the viewBox. */}
              {(i === 0 || i === 29 || i === 15) && (
                <text
                  x={i === 0 ? pad : i === 29 ? W - pad : x + bw / 2}
                  y={H + 17}
                  textAnchor={i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}
                  className="bar-label"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/*
 * THE PRO WAITLIST LIVED HERE.
 *
 * It offered a signed-in user the chance to join a list for a plan the server was already
 * enforcing — PLAN_LIMITS has had four tiers for some time, and QuotaDO applies them. A page that
 * contradicts the thing enforcing it is not merely incomplete; plans.tsx was written to replace
 * this and then never imported anywhere, so the contradiction stayed on screen.
 *
 * PlanLadder reads PLAN_LIMITS and PLAN_COPY directly, so it cannot drift from the enforcement
 * again. The waitlist ROUTE is left alone — the marketing site still uses it for people who have
 * not signed up at all, which is the audience it was actually for.
 */

export function UsagePage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const usage = useQuery({ queryKey: ['usage'], queryFn: fetchUsage });

  // ONE MODEL FOR BOTH SURFACES. The rail's meter and this page describe the same two balances, and
  // two independent readings of one payload is how they come to disagree — which is the bug this
  // page already had against the server it is reporting on. meterView decides which limit is
  // binding, keeps allowance and credits apart, and is tested on its own.
  const view = meterView(me.data?.quota, Date.now(), { pending: me.isPending });

  // w14 — the upgrade and downgrade path.
  const billing = useQuery({ queryKey: ['billing-config'], queryFn: fetchBillingConfig, retry: false });
  const { toast } = useToast();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);

  /**
   * COMING BACK FROM STRIPE IS NOT AN ENTITLEMENT.
   *
   * The plan moves when the webhook applies the subscription event, which may not have landed by
   * the time the browser returns. So this refetches and reports what the server SAYS, rather than
   * congratulating the user on a tier nobody has granted yet — the one sentence that would make
   * this page lie again, in the same way the waitlist did.
   */
  const [returned, setReturned] = useState<'done' | 'cancelled' | null>(null);
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('checkout');
    if (flag !== 'done' && flag !== 'cancelled') return;
    setReturned(flag);
    // Take the flag back out of the URL, so a reload or a shared link does not replay it.
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    window.history.replaceState({}, '', url.toString());
    if (flag === 'done') void me.refetch();
  }, []);

  const checkout = useMutation({
    mutationFn: (plan: PlanId) => startCheckout(plan),
    onMutate: (plan: PlanId) => setBusyPlan(plan),
    onSuccess: ({ url }) => {
      // Leaving the app for Stripe's own page is the point: the card details are theirs to collect,
      // never ours to see.
      window.location.assign(url);
    },
    onError: (e: Error) => {
      setBusyPlan(null);
      toast(`Couldn't open checkout: ${e.message}`, 'error');
    },
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e: Error) => toast(`Couldn't open billing: ${e.message}`, 'error'),
  });

  const currentPlan: PlanId = isPlanId(me.data?.quota?.plan) ? me.data.quota.plan : 'free';
  // Absent on an older worker, which is not the same as "no subscription" — so the notice is simply
  // not rendered rather than rendered as a claim that there is nothing.
  const billingView = me.data?.billing ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Usage</h1>
          <p className="page-sub">
            Credits are Apple&rsquo;s daily energy. A run is billed from the compute it actually uses, so these are
            measured typical costs, not fixed prices.
          </p>
        </div>
      </div>

      {me.isPending && (
        <p className="muted" aria-busy="true">
          Loading your Credits…
        </p>
      )}

      {me.isError && (
        <div className="card">
          <Failure error={me.error} onRetry={() => void me.refetch()} />
        </div>
      )}

      {me.isSuccess && (
        <div className="usage-grid">
          <div className="card credits-card">
            <h2>{view.period === 'month' ? 'This month\u2019s Credits' : 'Today\u2019s Credits'}</h2>
            <CreditsRing
              remaining={view.allowanceRemaining}
              daily={view.allowanceTotal}
              period={view.period}
            />
            {/* The purchased balance, beside the allowance and never inside it. Stated even at zero
                on a plan that has bought some before would be noise, so it appears only when there
                is one — but when there is one it must be here, or the ring understates what the
                user can actually spend. */}
            {view.credits > 0 && (
              <p className="credits-credits">
                <strong>{formatNumber(view.credits)}</strong> purchased credits, which do not expire
                <span className="muted"> — spent only once the allowance is gone</span>
              </p>
            )}
            <p className="muted">{view.resetsIn ?? 'Resets in a moment'}</p>
            <ul className="mode-cost-list">
              {MODES.map((m) => (
                <li key={m} className="mode-cost">
                  <span className={`mode-dot mode-dot-${m}`} aria-hidden="true" />
                  <span className="mode-cost-name">{PRODUCT_MODE_INFO[m].name}</span>
                  <span className="mode-cost-blurb">{PRODUCT_MODE_INFO[m].blurb}</span>
                  <span className="mode-cost-value">{PRODUCT_MODE_INFO[m].typicalCredits}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card bars-card">
            <h2>Last 30 days</h2>
            {usage.isPending && (
              <p className="muted" aria-busy="true">
                Loading history…
              </p>
            )}
            {usage.isError && <Failure error={usage.error} onRetry={() => void usage.refetch()} compact />}
            {usage.isSuccess &&
              (usage.data.days.length === 0 ? (
                <p className="muted">No Credits spent yet — go build something.</p>
              ) : (
                <UsageBars days={usage.data.days} />
              ))}
          </div>

        </div>
      )}

      {me.isSuccess && (
        <section className="plans-section" aria-labelledby="plans-heading">
          <div className="page-head">
            <div>
              <h2 className="page-title" id="plans-heading">Plans</h2>
              <p className="page-sub">
                Every tier below is one the service already enforces. What you see here is the same
                table that decides whether a run is allowed.
              </p>
            </div>
          </div>
          {returned === 'done' && (
            <p className="plans-note" role="status">
              Thanks — your payment went through. The plan changes when Stripe confirms it, usually
              within a few seconds; this page shows{' '}
              <strong>{me.data.quota.plan}</strong> right now.{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void me.refetch()}>
                Check again
              </button>
            </p>
          )}
          {returned === 'cancelled' && (
            <p className="plans-note" role="status">
              No change made — nothing was charged.
            </p>
          )}

          {billingView && <BillingNotice view={billingView} onManage={() => portal.mutate()} />}

          <PlanLadder
            current={currentPlan}
            busyPlan={busyPlan}
            // What this deployment actually charges in, from the server rather than assumed by the
            // page. Undefined while the config is in flight, which falls back to the declared code.
            currency={billing.data?.currency}
            // Absent when this deployment has no Stripe key, which makes the ladder render "Not
            // available yet" on each tier rather than a button that cannot work.
            availability={
              billing.isPending ? 'checking' : billing.isError ? 'unknown' : billing.data?.checkout ? 'ready' : 'unavailable'
            }
            onChoose={
              billing.data?.checkout
                ? (plan) => {
                    // A CHECKOUT ONLY EVER STARTS A FIRST SUBSCRIPTION.
                    //
                    // Anyone already on a paid tier goes to the portal, whichever direction they
                    // are moving. A checkout for a second price does not REPLACE the running
                    // subscription, it adds one — so a Team customer moving to Pro would be billed
                    // for both. Swapping, proration and when a downgrade takes effect are Stripe's
                    // to decide, and the portal is where it does that.
                    const canBuy = billing.data.purchasable.includes(plan);
                    if (currentPlan === 'free' && canBuy) checkout.mutate(plan);
                    else portal.mutate();
                  }
                : undefined
            }
          />

          {/*
            GATED ON HAVING A BILLING ACCOUNT, NOT ON BEING ON A PAID PLAN.
            This was `currentPlan !== 'free'`, which hid the portal from exactly the people who
            most need it: a customer whose subscription lapsed is back on Free with invoices, a
            saved card and a cancellation to reverse, and no way to reach any of them. The server
            already keeps the Stripe customer id across a plan change for this reason; the page was
            the half that did not honour it.
          */}
          {/*
            GATED ON THE SAME THING THE PORTAL BUTTON IS. A Stripe customer exists, so there is
            something to list — including for somebody whose subscription lapsed and who is back on
            Free with invoices they still need to reach.
          */}
          {billingView?.hasBillingAccount && <InvoiceList />}

          {billingView?.hasBillingAccount && <BillingHistory />}

          {billingView?.hasBillingAccount && (
            <p className="plans-manage">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => portal.mutate()}>
                Manage billing, invoices and cancellation
              </button>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
