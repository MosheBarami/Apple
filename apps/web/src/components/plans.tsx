// The plan ladder, as a page.
//
// Before this, /usage knew about two plans — Free and a Pro you could join a waitlist for — while
// the ledger enforcing quotas already had four. The page was not merely incomplete; it disagreed
// with the server, and a plan page that disagrees with the thing enforcing it is a page that lies.
// Everything here reads from PLAN_TABLE and PLAN_COPY in @studpilot/shared. PLAN_LIMITS, the table
// QuotaDO applies, is derived from PLAN_TABLE (times INTERNAL_PER_CREDIT), so the two cannot drift
// apart again. Only the displayed plans are listed: Free, Pro and Max. Enterprise is a stored id
// and is not on the ladder.
//
// The allowance is stated in BUILDS as well as Credits: "about 70 builds" is the sentence someone
// can act on. The count is the pricing doc's, bounded by what a typical build costs, so it can only
// understate. Credits are shown with two decimals, like every balance in the app.
import { formatNumber } from '../lib/format';
import {
  PLAN_COPY,
  PLAN_SUPPORT,
  PLAN_TABLE,
  LISTED_PLAN_IDS,
  PRICE_CURRENCY,
  buildsPerDay,
  buildsPerMonth,
  CREDIT_PURCHASE_LIVE,
  formatCredits,
  formatMoney,
  type ListedPlanId,
  type PlanId,
} from '@studpilot/shared';

/**
 * What the plan ladder is while StudPilot is in beta, in the words the pricing page uses (apps/site/src/pages/pricing.astro: tests/usage-beta.test.mjs
 * holds the two to each other). Free is the plan everybody is on; the paid tiers below it are decided and shown, and cannot be bought yet.
 */
export const BETA_LINE = 'Free while in beta. Paid plans start later.';

/**
 * Whether this deployment can sell anything, as four states rather than two.
 *
 * `onChoose` being absent used to mean all of "still asking", "we asked and it cannot", and "we
 * could not find out" — so every tier rendered "Not available yet" the moment the page opened,
 * before the answer had arrived. That is a definite claim about a deployment, made from having no
 * information, and it is the same mistake the usage meter made with a quota that had not loaded.
 */
export type PlanAvailability = 'ready' | 'checking' | 'unavailable' | 'unknown';

export function PlanLadder({
  current,
  onChoose,
  busyPlan,
  availability = 'unavailable',
  purchasable = [],
  currency = PRICE_CURRENCY,
}: {
  current: PlanId;
  /** Required for 'ready' to mean anything; ignored in every other state. */
  onChoose?: (plan: PlanId) => void;
  busyPlan?: PlanId | null;
  availability?: PlanAvailability;
  /** Authoritative per-tier availability; omission fails closed. Free remains cancellable. */
  purchasable?: readonly PlanId[];
  /**
   * What these prices are quoted in, as reported by the server rather than assumed by the page.
   * Defaults to the declared currency so the marketing surfaces need not pass it.
   */
  currency?: string;
}) {
  const currentIndex = LISTED_PLAN_IDS.indexOf(current as ListedPlanId);

  return (
    <div className="plans">
      {LISTED_PLAN_IDS.map((id) => {
        const copy = PLAN_COPY[id];
        const table = PLAN_TABLE[id];
        const isCurrent = id === current;
        const index = LISTED_PLAN_IDS.indexOf(id);
        // "Downgrade" rather than a second "Choose": moving down a tier loses allowance, and a
        // control that does not say so reads as an upgrade to someone skimming.
        const direction = index > currentIndex ? 'up' : 'down';
        // A listed plan always has a price (ListedPlanId excludes the stored `enterprise`, which has none).
        const price = table.priceUsdMonthly;
        const canChoose = id === 'free' || purchasable.includes(id);

        return (
          <section key={id} className={`plan${isCurrent ? ' is-current' : ''}`} aria-labelledby={`plan-${id}`}>
            <header className="plan__head">
              <h3 className="plan__name" id={`plan-${id}`}>
                {copy.name}
              </h3>
              {isCurrent && <span className="pill pill-live">Your plan</span>}
            </header>

            <p className="plan__price">
              {price === 0 ? (
                <span className="plan__amount">Free</span>
              ) : (
                <>
                  {/* Formatted, not concatenated: the symbol's position belongs to the locale,
                      and '$' alone does not name a currency. */}
                  <span className="plan__amount">{formatMoney(price, { currency })}</span>
                  <span className="plan__per">/month</span>
                </>
              )}
            </p>

            <p className="plan__blurb">{copy.blurb}</p>

            {/* The allowance in credits with two decimals, and in builds. The monthly pool leads for a
                paid plan and the daily figure caps it; Free is given out by the day. */}
            <p className="plan__allowance">
              <strong>
                About {formatNumber(buildsPerMonth(id))} builds a month
              </strong>
              <span className="plan__allowance-sub">
                {formatCredits(table.creditsPerMonth)} Credits a month · {formatCredits(table.creditsPerDay)} a
                day, up to {formatNumber(buildsPerDay(id))} builds a day
              </span>
            </p>

            <ul className="plan__list">
              {/* A highlight that sells buying Credits is withheld while they cannot be bought
                  (CREDIT_PURCHASE_LIVE), the same filter the pricing page applies to the same copy. */}
              {copy.highlights
                .filter((h) => CREDIT_PURCHASE_LIVE || !/\bbuy\b.*\bcredits?\b/i.test(h))
                .map((h) => (
                  <li key={h}>{h}</li>
                ))}
            </ul>

            {/* Three of the four tiers said nothing at all about support, which a reader cannot
                distinguish from "there is none". Stated for every plan, including the free one:
                what the channel is, and what is actually promised about a reply. No response time
                — nobody has committed to one, and a missed published SLA is worse than an honest
                "best effort". */}
            <p className="plan__support">
              <span className="plan__support-label">Support</span>
              <span>
                {PLAN_SUPPORT[id].channel}. {PLAN_SUPPORT[id].promise}
              </span>
            </p>

            <div className="plan__action">
              {isCurrent ? (
                <span className="plan__on">You are on this plan</span>
              ) : availability === 'checking' ? (
                // Not "unavailable". We have not asked yet, and saying which is the difference
                // between a deployment that cannot sell this and a request still in flight.
                <span className="plan__soon" aria-busy="true">
                  Checking&hellip;
                </span>
              ) : availability === 'unknown' ? (
                <span className="plan__soon">Couldn&rsquo;t check whether this can be bought</span>
              ) : availability === 'ready' && onChoose && canChoose ? (
                <button
                  type="button"
                  className={`btn${direction === 'up' ? ' btn-primary' : ''}`}
                  disabled={busyPlan != null}
                  onClick={() => onChoose(id)}
                >
                  {busyPlan === id ? 'Opening…' : direction === 'up' ? `Upgrade to ${copy.name}` : `Move to ${copy.name}`}
                </button>
              ) : (
                // Asked, and this deployment genuinely cannot sell it. Saying so is better than a
                // button that fails, and far better than hiding the tier — the user should still
                // know what exists.
                <span className="plan__soon">Not available yet</span>
              )}
            </div>
          </section>
        );
      })}
      {/* SAID ONCE, IN WORDS. A symbol is not a currency — the same glyph is three different
          currencies in en-US, en-CA and en-AU — and until this line the only place the charge
          currency appeared was Stripe's own page, after the user had committed.

          AND THE SAME IS TRUE OF TAX. The checkout asks Stripe to calculate it, so a buyer in a
          jurisdiction we are registered in pays the figure above PLUS tax — for a German buyer,
          19% more than the number they just read. Quoting the bare figure and letting them find
          out from their bank statement is the same failure as quoting a bare '$'. */}
      <p className="plans-currency">
        All prices in {currency}, excluding tax. You are charged in {currency}, and any VAT or sales
        tax is calculated at checkout from your billing address.
      </p>
    </div>
  );
}
