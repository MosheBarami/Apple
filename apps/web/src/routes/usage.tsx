// /usage — Sparks today, 30 days of history, and the plan.
//
// Every number on this page comes from the live quota or from @golem/shared.
// Sparks are billed from the compute a run actually consumes, so the per-mode
// figures are the measured typical range, not a price list.
import { useQuery } from '@tanstack/react-query';
import { PlanLadder } from '../components/plans';
import { meterView } from '../components/usage-meter-model';
import { PRODUCT_MODE_INFO, isPlanId, type ProductMode } from '@golem/shared';
import { fetchMe, fetchUsage, type UsageDay } from '../lib/api';

const MODES: ProductMode[] = ['plan', 'agent', 'super'];

/**
 * The ring shows the ALLOWANCE, and credits are reported beside it — never added into the arc.
 *
 * It used to be handed `sparksRemaining`, which is allowance plus purchased credits, and divide it
 * by the daily allowance. A user with 1,440 credits on the free plan saw a full ring captioned
 * "1500 of 60", and an aria-label telling them that was what remained TODAY. Both numbers were
 * real and the sentence they formed was not: credits are not today's, they do not reset, and
 * spending them is a different decision from spending an allowance. This is the same rule
 * usage-meter-model.ts is built around, applied to the surface that states it in the largest type.
 */
function SparksRing({ remaining, daily, period }: { remaining: number; daily: number; period: 'day' | 'month' }) {
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
      aria-label={`${remaining} of ${daily} Sparks of allowance remaining ${window}`}
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

function UsageBars({ days }: { days: UsageDay[] }) {
  // The API returns sparse rows; build a dense 30-day series so gaps read as zero.
  const byDay = new Map(days.map((d) => [d.day, d.sparks]));
  const series: { day: string; sparks: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push({ day: d, sparks: byDay.get(d) ?? 0 });
  }
  const max = Math.max(10, ...series.map((s) => s.sparks));
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
        aria-label="Sparks spent per day over the last 30 days"
      >
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="bar-base" />
        {series.map((s, i) => {
          const h = Math.max(s.sparks > 0 ? 3 : 1.5, (s.sparks / max) * H);
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
                className={s.sparks > 0 ? 'bar bar-active' : 'bar'}
              >
                <title>{`${label}: ${s.sparks} Sparks`}</title>
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Usage</h1>
          <p className="page-sub">
            Sparks are Apple&rsquo;s daily energy. A run is billed from the compute it actually uses, so these are
            measured typical costs, not fixed prices.
          </p>
        </div>
      </div>

      {me.isPending && (
        <p className="muted" aria-busy="true">
          Loading your Sparks…
        </p>
      )}

      {me.isError && (
        <div className="card" role="alert">
          <p className="form-error">Couldn&rsquo;t load usage: {(me.error as Error).message}</p>
          <button type="button" className="btn btn-sm" onClick={() => void me.refetch()}>
            Retry
          </button>
        </div>
      )}

      {me.isSuccess && (
        <div className="usage-grid">
          <div className="card sparks-card">
            <h2>{view.period === 'month' ? 'This month\u2019s Sparks' : 'Today\u2019s Sparks'}</h2>
            <SparksRing
              remaining={view.allowanceRemaining}
              daily={view.allowanceTotal}
              period={view.period}
            />
            {/* The purchased balance, beside the allowance and never inside it. Stated even at zero
                on a plan that has bought some before would be noise, so it appears only when there
                is one — but when there is one it must be here, or the ring understates what the
                user can actually spend. */}
            {view.credits > 0 && (
              <p className="sparks-credits">
                <strong>{view.credits.toLocaleString()}</strong> purchased credits, which do not expire
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
                  <span className="mode-cost-value">{PRODUCT_MODE_INFO[m].typicalSparks}</span>
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
            {usage.isError && (
              <p className="form-error" role="alert">
                Couldn&rsquo;t load history.{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void usage.refetch()}>
                  Retry
                </button>
              </p>
            )}
            {usage.isSuccess &&
              (usage.data.days.length === 0 ? (
                <p className="muted">No Sparks spent yet — go build something.</p>
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
          <PlanLadder current={isPlanId(me.data.quota.plan) ? me.data.quota.plan : 'free'} />
        </section>
      )}
    </div>
  );
}
