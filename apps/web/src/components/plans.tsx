// The plan ladder, as a page.
//
// Before this, /usage knew about two plans — Free and a Pro you could join a waitlist for — while
// the ledger enforcing quotas already had four. The page was not merely incomplete; it disagreed
// with the server, and a plan page that disagrees with the thing enforcing it is a page that lies.
// Everything here reads from PLAN_LIMITS and PLAN_COPY in @golem/shared, which is the same table
// QuotaDO applies, so the two cannot drift apart again.
//
// The allowance is stated in BUILDS as well as Sparks. "6,000 Sparks a month" means nothing on
// first read; "about 78 builds" is the sentence someone can act on. The conversion is measured,
// not marketing: a quality-gated build is ~2,300 neurons, and it is floored, because a rounded-up
// figure is a promise the allowance cannot keep.
import {
  PLAN_COPY,
  PLAN_IDS,
  PLAN_LIMITS,
  buildsPerDay,
  buildsPerMonth,
  type PlanId,
} from '@golem/shared';

export function PlanLadder({
  current,
  onChoose,
  busyPlan,
}: {
  current: PlanId;
  /** Absent while checkout is not configured — the tier still renders, it just cannot be bought. */
  onChoose?: (plan: PlanId) => void;
  busyPlan?: PlanId | null;
}) {
  const currentIndex = PLAN_IDS.indexOf(current);

  return (
    <div className="plans">
      {PLAN_IDS.map((id) => {
        const copy = PLAN_COPY[id];
        const limits = PLAN_LIMITS[id];
        const isCurrent = id === current;
        const index = PLAN_IDS.indexOf(id);
        // "Downgrade" rather than a second "Choose": moving down a tier loses allowance, and a
        // control that does not say so reads as an upgrade to someone skimming.
        const direction = index > currentIndex ? 'up' : 'down';
        const priced = copy.priceUsdMonthly !== null;

        return (
          <section key={id} className={`plan${isCurrent ? ' is-current' : ''}`} aria-labelledby={`plan-${id}`}>
            <header className="plan__head">
              <h3 className="plan__name" id={`plan-${id}`}>
                {copy.name}
              </h3>
              {isCurrent && <span className="pill pill-live">Your plan</span>}
            </header>

            <p className="plan__price">
              {priced ? (
                copy.priceUsdMonthly === 0 ? (
                  <span className="plan__amount">Free</span>
                ) : (
                  <>
                    <span className="plan__amount">${copy.priceUsdMonthly}</span>
                    <span className="plan__per">/month</span>
                  </>
                )
              ) : (
                <span className="plan__amount plan__amount--talk">Let&rsquo;s talk</span>
              )}
            </p>

            <p className="plan__blurb">{copy.blurb}</p>

            <p className="plan__allowance">
              <strong>
                About {buildsPerMonth(id).toLocaleString()} builds a month
              </strong>
              <span className="plan__allowance-sub">
                {limits.sparksPerMonth.toLocaleString()} Sparks · up to {buildsPerDay(id)} builds a day
              </span>
            </p>

            <ul className="plan__list">
              {copy.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>

            <div className="plan__action">
              {isCurrent ? (
                <span className="plan__on">You are on this plan</span>
              ) : !priced ? (
                <a className="btn" href="mailto:hello@apple.build?subject=Enterprise%20plan">
                  Get in touch
                </a>
              ) : onChoose ? (
                <button
                  type="button"
                  className={`btn${direction === 'up' ? ' btn-primary' : ''}`}
                  disabled={busyPlan != null}
                  onClick={() => onChoose(id)}
                >
                  {busyPlan === id ? 'Opening…' : direction === 'up' ? `Upgrade to ${copy.name}` : `Move to ${copy.name}`}
                </button>
              ) : (
                // Checkout is not configured. Saying so is better than a button that fails, and far
                // better than hiding the tier — the user should still know what exists.
                <span className="plan__soon">Not available yet</span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
