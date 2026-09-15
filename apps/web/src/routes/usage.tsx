// /usage — Credits today, 30 days of history, and the plan.
//
// Every number on this page comes from the live quota or from @golem/shared.
// Credits are billed from the compute a run actually consumes, so the per-mode
// figures are the measured typical range, not a price list.
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlanLadder } from '../components/plans';
import { OrderSummaryDialog } from '../components/order-summary';
import { meterView } from '../components/usage-meter-model';
import { formatNumber } from '../lib/format';
import { Failure } from '../components/failure';
import { PLAN_COPY, PRODUCT_MODE_INFO, isPlanId, type PlanId, type ProductMode } from '@golem/shared';
import { billingChangeLine, billingNotice, type SubscriptionView } from '../lib/billing-copy';
import {
  fetchBillingConfig,
  fetchBillingHistory,
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
   * THE ORDER WAITING TO BE CONFIRMED.
   *
   * The first click used to call the checkout mutation and the browser left for Stripe's card form.
   * The only pre-purchase statement in the product was the plan card behind it, which describes a
   * TIER — price, allowance, highlights — and not an order: it never said what the account was
   * moving from, that the charge repeats, or that tax is added to the figure being read. Choosing a
   * plan now opens the summary; nothing is bought until it is confirmed.
   */
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);

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
                    if (currentPlan === 'free' && canBuy) setPendingPlan(plan);
                    else portal.mutate();
                  }
                : undefined
            }
          />

          {/*
            THE ORDER, BEFORE THE PAYMENT PAGE. It states the plan, the charge, how often it repeats,
            the allowance it moves to and that tax is added — and only then hands over to Stripe.
            Every sentence in it comes from lib/order-summary.ts, which is tested on its own.
          */}
          <OrderSummaryDialog
            plan={pendingPlan}
            currentPlan={currentPlan}
            currency={billing.data?.currency}
            busy={busyPlan != null}
            onConfirm={(plan) => checkout.mutate(plan)}
            onCancel={() => setPendingPlan(null)}
          />

          {/*
            GATED ON HAVING A BILLING ACCOUNT, NOT ON BEING ON A PAID PLAN.
            This was `currentPlan !== 'free'`, which hid the portal from exactly the people who
            most need it: a customer whose subscription lapsed is back on Free with invoices, a
            saved card and a cancellation to reverse, and no way to reach any of them. The server
            already keeps the Stripe customer id across a plan change for this reason; the page was
            the half that did not honour it.
          */}
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
