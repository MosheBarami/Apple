# M2 decisions: the pricing config

Slice: the pricing config only (planning/pricing-2026-10-04.md). Branch `studpilot/m2`, from `studpilot/m1-domain` at
`ae3d5175`. Measured counts before the change are in `BASELINE.md`.

## 1. One config

`packages/shared/src/index.ts` holds every pricing number once.

| Name | Value | Meaning |
|---|---|---|
| `CREDIT_USD` | 0.05 | one credit, as a person is shown it, is $0.05 of AI compute |
| `INTERNAL_PER_CREDIT` | 150 | ledger units in one credit (a ledger unit is `NEURONS_PER_CREDIT` = 30 neurons) |
| `CARD_FEE` | 2.9% + $0.30 | what the profit test charges against every payment |
| `TYPICAL_BUILD_CREDITS` | 1.4 | a typical build (pricing doc, about $0.07) |
| `PLAN_TABLE` | free 5/day, 30/month; builder (shown Pro) $9.99, 100/month; studio (shown Max) $24.99, 300/month | the plan table, in credits |
| `TOPUP_PACK` | $4.99 for 50 credits | the pack; checkout for it is off |
| `BUILD_COSTS` | small 0.52 to 1.40, typical 1.40, big 4 to 12 (estimated) | the pricing doc's cost table |

`PLAN_LIMITS` (what QuotaDO enforces, in ledger units) is now `PLAN_TABLE` times `INTERNAL_PER_CREDIT`, and `PLAN_COPY`
takes its names and prices from `PLAN_TABLE`; neither holds a number of its own. `LISTED_PLAN_IDS` is the displayed
ladder (Free, Pro, Max). The stored plan ids are unchanged: `free`, `builder`, `studio`, `enterprise` (the
`profiles.plan` constraint in migration 0012 and the Stripe price mapping depend on them). `enterprise` stays a valid stored
id with Max's allowance, because no number was ever decided for it; it is `listed: false` and is on no page and not in the
app. The two comparison rows that only differed for it (`self-serve`, `invoicing`) are removed.

**The unit derivation.** 150 x 30 neurons x $0.011 per 1,000 neurons is $0.0495, which is the decided $0.05 less 1%. The
exact quotient is 151.5 ledger units; the pricing doc's "150" is that rounded down to a multiple of ten. It is a pinned
decision, not a second source of truth: `apps/worker/tests/plan-economics.test.mjs` derives the quotient from
`NEURONS_PER_CREDIT` and `USD_PER_NEURON` in `apps/worker/src/pricing.ts` and fails if `INTERNAL_PER_CREDIT` stops being that
figure. Pages therefore say "about $0.05 of AI compute".

Handoff 5.2 says "store credits in hundredths: 1 credit = 100 units internally". The pricing doc and the owner's brief for
this slice say 150, which is the existing ledger unit and needs no data migration, so 150 is what is built. The handoff line
is out of date.

## 2. Free enforcement: before and after (tell the owner)

QuotaDO and `quotaState` read `PLAN_LIMITS`, so enforcement moved by changing the table; no enforcement code changed.

| Plan | Daily, before | Daily, after | Monthly, before | Monthly, after |
|---|---|---|---|---|
| Free | 231 ledger units (6,930 neurons, about $0.076) | **750** (22,500 neurons, about $0.25) | 2,310 | **4,500** (135,000 neurons, about $1.49) |
| Pro (`builder`) | 416 | 3,000 | 12,600 | 15,000 |
| Max (`studio`) | 700 | 4,500 | 21,000 | 45,000 |
| `enterprise` (stored only) | 833 | 4,500 | 25,000 | 45,000 |

Free is now 5 credits a day and at most 30 a month: 3.25 times the old day and 1.95 times the old month.

**What this does to the caps, which this slice leaves untouched** (`BILLABLE_NEURONS_PER_DAY` 150,000, `BILLABLE_NEURONS_PER_MONTH`
2,270,000, `FREE_NEURONS_PER_DAY` 10,000, `MAX_NEURONS_PER_REQUEST`, `DAILY_NEURON_CEILING` 160,000):

- The whole service can serve 160,000 neurons a day, which is 35 credits (5,333 ledger units). Free accounts spending their whole
  5 credits use it up at **7** accounts a day. It was 23 at the old 231 a day. A run that hits it stops with "StudPilot has
  reached today's shared building capacity". The pricing page states this, derived from the same constant.
- The monthly billable backstop (2,270,000 neurons, $24.97) covers about 16.8 accounts spending the full 30 credits
  (135,000 neurons each), before the free 10,000 neurons a day.
- The pricing doc's global free-spend pool (default $10 a month, handoff 5.2) is not built. Until it is, these two caps are the
  only bound. The owner should decide whether to raise them before the free plan is widely open.

**Paid daily caps are an assumption.** The pricing doc decides only the monthly pools. A paid plan needs a daily figure too, and
the existing rule in `scripts/check-offer.mjs` (a plan may not grant more per day than the whole service can serve) caps it at
35 credits. I set Pro at 20 and Max at 30 so that a paid plan never grants less per day than Free and affords the biggest
estimated build (12 credits). No account is on either, because checkout is off. The owner confirms or replaces them. Free's 5
a day does not cover one 12-credit big build, and 30 a month covers two; the pricing doc's own table implies this.

**Profit test, measured.** Worst case = price - (2.9% x price + $0.30) - credits x $0.05:

| Plan | Exact | Rounded to the cent | Doc / brief |
|---|---|---|---|
| Pro | 4.4003 | 4.40 | 4.40 |
| Max | 8.9653 | 8.97 | 8.97 |
| Top-up pack | 2.0453 | 2.05 | 2.04 |
| Free (AI cost, no revenue) | 1.50 | 1.50 | 1.50 |

The pack reads 2.05 at nearest rounding; the doc's 2.04 is the same figure cut off at the cent. No single rounding gives all
three doc figures, so the test accepts anything within one cent of the doc and fails if any paid plan or the pack is below $0.

## 3. What the site shows

`apps/site/src/pages/pricing.astro` reads the config for everything it prints. The headline is the owner's line, word for word:
"Free while in beta. Paid plans start later". Three cards (Free, Pro, Max); no Enterprise row; every paid card ends on a
disabled "Checkout not open"; no Stripe, checkout or purchase link anywhere on the page; no estimate-before or exact-after
claim. The superseded figures ($12, $40, 231, 416, 700, "77 Credits", "~163 builds") are gone. The owner's picked components
(price switch, build estimator) stay and are re-pointed at the typical build. The old per-request table is replaced by the
pricing doc's "what builds cost" table (credits with two decimals and dollars of compute), because a request price in ledger
units would now be 150 times too large in the unit people read.

- The build-time probe of `/api/billing/config` is removed from `/pricing` (it fed a "Choose" button for any plan the live
  deployment reported as purchasable, which contradicts "paid plans start later"). It remains on `/terms`, `/docs/billing` and the
  landing page; see section 5.
- The comparison matrix said "Free forever" for Free; it now says "Free while in beta".
- The top-up pack is in the config and the profit test but is not shown on the site or in the app: `credit-purchase-claim.test.mjs`
  forbids a visible invitation to buy credits while `CREDIT_PURCHASE_LIVE` is false, and nothing can sell one.
- `/docs/credits-and-limits`, `/docs/getting-started`, `/terms` and the changelog read `PLAN_TABLE`, not the ledger table.

## 4. What the app shows

- Plan ladder (`plans.tsx`): Free, Pro, Max from `PLAN_TABLE`, credits with two decimals, no Enterprise "Get in touch" branch.
- The balance meter (`usage-meter-model.ts`): the numeric fields stay in ledger units; every sentence prints credits with two
  decimals ("3.54 Credits left today / of 5.00 a day"). Consumers: the rail meter, the composer ring and its card, the account menu
  header, the usage page ring, the extra-credits line, the 30-day chart, the live panel, the spend breakdown, the activity
  calendar, the month comparison, and the "next request costs" range. The order summary reads `PLAN_TABLE` credits.

## 5. Deferred (M5 and M6, or owner)

- **Estimate before a build, exact charge after it** (plan 5.3, M6). Not built, and the site says nothing like it. Credits are
  already charged from measured usage, so "charged for the work it actually used" is true today.
- **User-facing credit amounts still in ledger units** (so they read as 150 times too large next to the new balance): the per-run
  "N Credits spent" chip (`ws/turn.tsx`, `ws/evidence/context-checkpoint-model.ts`), the automation spend panel, the admin
  quota rows, the roadmap card cost ranges (`roadmap.ts` `creditsLow/High`), and the sentences the worker composes: the refund
  sentences (`run-refund.ts`), the trace summary `... for N Credit(s)` (`do/session.ts`), the usage notifications, and the
  `error-taxonomy` copy. Each needs the same `internalToCredits` conversion plus its tests; none is on a plan page.
- The global free-spend pool (default $10 a month) and its enforcement (handoff 5.2).
- The billing probe in `terms.astro`, `docs/billing.astro` and `lib/billing-probe.ts` (landing). Checkout stays off, so they
  report closed; they should be dropped the same way when M6 rebuilds those pages.
- Owner: confirm the paid daily caps (section 2), and decide the caps against the new Free allowance (section 2).

## 6. Checkout stays off

No change to `apps/worker/src/billing.ts`, `CREDIT_PURCHASE_LIVE` stays false, no Stripe call was made, and nothing was
deployed, pushed or sent to any API. The pricing page no longer contains any code path that could render a purchase button.

## 7. Guards restated (each run red, then green; the mutations are in the final report)

`scripts/check-credit-figures.mjs` (unit chain and "the site quotes credits from the config"), `scripts/check-offer.mjs` with two
new rules in `scripts/lib/offer-rules.mjs` (enforced limits = table x unit; a monthly price in copy is a plan's price),
`scripts/probe-s1.mjs`, and the tests that pinned old figures: site `build-cost-figures`, `onboarding-current`,
`picks-pricing-docs`, `published-version-and-modes`, `quota-ceiling-copy`, `unpurchasable-and-shared-cap`; web
`usage-meter`, `usage-page-wiring`, `next-request-cost`, `picks-composer`, `picks-integration`; root `check-offer`,
`probe-s1`; sdk `protocol-parity`. New: `apps/worker/tests/plan-economics.test.mjs` and `apps/site/tests/pricing-config.test.mjs`.
`credit-purchase-claim`, `pricing-availability`, `workspace-limits` and `pre-run-cost-warning` pinned no figure and pass unchanged.
