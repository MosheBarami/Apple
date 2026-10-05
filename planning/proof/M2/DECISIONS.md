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
- The global free-spend pool is **$5 a month for all free users combined** (owner decision D-5, `planning/proof/OWNER-DECISIONS.md`;
  about 100 credits, about 70 builds; when it is used up free building pauses until the next month, with a friendly message). It
  supersedes the "default $10 a month" of the pricing doc and handoff 5.2. It is built in M6 and is not built now. Until it is,
  these two caps are the only bound. The owner should decide whether to raise them before the free plan is widely open.

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

**The profit test assumes one pool per payment, and the pool is not per payment.** The test recomputes the worst case for one
payment and one pool. QuotaDO's month is the UTC calendar month (`quota-math.monthKey`), not the billing period, so a
subscriber who pays mid-month can spend one pool before the month ends and a second one after it, both inside the first paid
period. Measured with the same fee arithmetic and two pools: **Pro $9.99 for 200 credits loses $0.60, Max $24.99 for 600
credits loses $6.03.** Charging is off, so nobody is exposed today. **It is an M6 must-fix**: align the pool to the billing
period, or prorate the first one, before the first payment is taken. The assumption is stated in the header of
`apps/worker/tests/plan-economics.test.mjs`, and a test there (`KNOWN GAP, OPEN, M6 MUST-FIX`) measures the exposure and asserts
the premise, so it fails and has to be rewritten the day the pool changes basis.

## 4. What the app shows

- Plan ladder (`plans.tsx`): Free, Pro, Max from `PLAN_TABLE`, credits with two decimals, no Enterprise "Get in touch" branch.
- The balance meter (`usage-meter-model.ts`): the numeric fields stay in ledger units; every sentence prints credits with two
  decimals ("3.54 Credits left today / of 5.00 a day"). Consumers: the rail meter, the composer ring and its card, the account menu
  header, the usage page ring, the extra-credits line, the 30-day chart, the live panel, the spend breakdown, the activity
  calendar, the month comparison, and the "next request costs" range. The order summary reads `PLAN_TABLE` credits.

## 5. Deferred (M5 and M6, or owner)

(Section 8 records what a review of this slice changed and what it left open.)

- **Estimate before a build, exact charge after it** (plan 5.3, M6). Not built, and the site says nothing like it. Credits are
  already charged from measured usage, so "charged for the work it actually used" is true today.
- ~~User-facing credit amounts still in ledger units~~ Fixed in the review of this slice (section 8, B). The `error-taxonomy`
  copy carries no number.
- The global free-spend pool ($5 a month for all free users combined, owner decision D-5) and its enforcement (M6, handoff 5.2).
- The billing probe in `terms.astro`, `docs/billing.astro` and `lib/billing-probe.ts` (landing). Checkout stays off, so they
  report closed; they should be dropped the same way when M6 rebuilds those pages.
- Owner: confirm the paid daily caps, **Pro 20 and Max 30 credits a day, which are an assumption** (the pricing doc decides only the
  monthly pools; section 2), and decide the caps against the new Free allowance (section 2).

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

## 8. What the review of this slice changed

An independent review of commit `6390b4ca` (now `6a63a8ac`, trailer corrected) found six groups of defects. Each has a test that
failed before the fix; the mutations are in the report.

**A. Free allowance could be farmed (money).** A Free account with 5 ledger units left was admitted for 1, the model step ran, and
settlement owed more than the 4 that remained. `splitSpend` is all-or-nothing, so it charged nothing; the run then ended `quota`,
`quota` is a refundable ending, and the admission unit was handed back. Net 0, the reply delivered, and the same 5 units were
there for the next request, until the service-wide ceiling. Now: a settlement is sent with `upTo` and QuotaDO charges what is left
and answers `ok: false` with what it took (`/spend`; admission stays all-or-nothing); a run that ends because the person's own
allowance could not pay for a step that ran is not refunded (`allowanceUsedUp` -> `refundVerdict` returns `allowance_used`);
a global capacity stop (`BudgetError`, `CAPACITY_EXHAUSTED`) is still `quota` and still refunds a run that left nothing, because
the person did not cause it. The same all-or-nothing hole existed in the public API (`index.ts`, `creditsSpent += owed` whatever
the ledger said) and is fixed the same way. The bound is now one step's overrun: the compute of the step that was already running.

**B. Credits, not ledger units, on every surface a person reads.** The chat footer, the "N Credits spent" chip, the automation
spend panel and run rows, the roadmap and suggestion cost chips (`creditRangeLabel`), the run-finished and low-credit
notifications, the Discord `/credits` and `/status` line (which also named the plan by its stored id, "builder"), the refund
sentences, the branding copy ("Uses about 0.01 Credits": one generation is `BRANDING_COST_UNITS` = 1 ledger unit), and the usage
page's "what your next request costs" line, which again says what a request is (`MODE_INFO.agent.entryUnit`, restored: one
targeted edit, read back and verified, not a whole build). Admin screens keep ledger units and are labelled "ledger units".
**The public API headers `X-StudPilot-Usage-Credits` and `X-StudPilot-Credits-Remaining` are unchanged in value and meaning**
(whole ledger units; 150 is 1.00 credit in the app); the unit is now written in the OpenAPI description and beside `usageHeaders`.
The SDK docstring for `searchDocs` says "one ledger unit".

**C. Claims the product does not back, removed.** "You see the running total live in the workspace while it climbs", "the
workspace counts what the run has spent while it runs" and "the thinking panel counts the Credits this run has spent, step by
step": the app draws a request's cost once, under the finished reply, and nothing while it runs. "One Credit is taken when a
request starts": a request is admitted for 1/150 of a credit. "Buy credits when you need more" on the app's Pro card while
`CREDIT_PURCHASE_LIVE` is false (filtered, as the site filters it). "Credits, or a bigger plan, cover the gap" in the empty-credits
notification (nothing can be bought). The changelog's "there is no Pro tier. The paid tiers are Builder and Studio" (the plans are
Free, Pro and Max; there is no priority queue). `apps/site/tests/no-live-cost-claim.test.mjs` guards the first four and asserts its
own premise.

**D. Guards that could not fail.** `CREDIT_CLAIM` now reads one-digit and decimal claims ("5 Credits a day", "5.00 Credits a day",
"7 credits per month"); it needed two characters, so Free's own "5 Credits a day" was unguarded. The plan-invention guard in
`published-version-and-modes.test.mjs` was dead (`Pro` is listed, so its `if` never ran); it now runs on every page against the plan
table, and a sibling refuses the removed priority-queue claim and ignores sentences that deny it. `order-summary.test.mjs` fed
`PLAN_LIMITS` to a model the component feeds from `PLAN_TABLE`, so reverting the component could not fail it; it now renders the
dialog. `pricing-config.test.mjs` checks each card's price, allowance and build count inside that card, the FAQ credit definition
inside its answer, the shared-pool sentence inside its note, and the build-cost rows row by row.

**Still open after the review (not fixed here, with reason):**

- The profit test's one-pool assumption (section 2): an M6 must-fix.
- **The roadmap cost chip prints `runs x MODE_INFO.typicalCredits`, the per-REQUEST range (4 to 18 ledger units, 0.03 to 0.12
  credits), while a typical build costs about 1.40 credits (BUILD_COSTS).** The two measure different things, the usage page now
  says which, and the roadmap chip is correct in unit and not comparable in scale to a build. Re-derive it with M6's estimate.
- `apps/web/src/lib/generative-ui` `quotaToDocument` hands a raw `QuotaState` to the `usage_summary` block. Nothing calls it
  (only `ui-lab` draws that block, from literals), and the block's numbers are unit-free, so it was left alone.
- The SDK `usage` command prints what `/api/me/usage` sends, in ledger units, which is the public contract.

## 9. What the second review changed (cycle 2, HEAD `d1a25c4e`)

A fresh review of `d1a25c4e` left seven groups of defects. Each has a test that was run red against the unfixed code (or against
a mutation of the fix) and then green; the mutations are in the report.

**1. Stop while a step is in flight no longer leaves the step unbilled (money).** Stop ended the run at once with only the 1-unit
admission charged, and the abandoned provider call still finished and was billed to the service: up to `MAX_NEURONS_PER_REQUEST`
(1,200 neurons = 40 ledger units). A Free account could send and Stop in a loop at 40 units of compute for every 1 it paid. Now
`settleAbandonedStep` pays for the step when the call resolves, with the same `upTo` settlement as every other step (capped by
what the person has left): its measured neurons, or the ceiling when it reports none; a call that fails is not charged (the
gateway releases its reservation and records no spend). The run row and the meter are brought to what the ledger took. Measured
in `run-refund.test.mjs`: with 150 units left, send-and-Stop ends after 4 abandoned steps (40, 40, 40 and 30 units charged, the last part-paid) and
the 5th request is refused at the door; before the fix 150 units paid for 150 requests and it never ended. **Left open:** steps
that are abandoned at the same moment are each paid when they resolve, so the unbilled window is the number in flight at once (a
few seconds of send-and-Stop) times 40 units, once per day per account, instead of unbounded; the global caps are the other bound.

**2. The `upTo` ceiling is tested.** `Math.min(credits, st.allowanceRemaining)` (dropping `+ st.credits`) passed every test, because
every fixture had no purchased credits or an allowance that covered the amount. A settlement now has to draw 20 units from 30
purchased credits with the allowance spent, and stop at the 10 that remain on the next.

**3. Every refill sentence names the limit that binds.** `quotaState` spends `min(dayLeft, monthLeft)`, and Free's 30 credits a
month are used up in 6 full days, so "Daily Credits are used up. They refill at midnight UTC" promised the allowance back in hours
when it is weeks away. `quotaLimit` (packages/shared; the web meter's rule, a tie names the month) gives the period, the instant it
lifts (the next UTC midnight, or the first instant of the next UTC month) and the words. Used by: the admission refusal, the
between-steps pause, the settlement stop, the `usage_threshold` notification (title, body and the low-balance band, now measured
against the period's total), Discord `/credits`, `/status` and `/build`, voice typing, the web meter's empty-balance line, the
pricing FAQ (two answers) and `/docs/credits-and-limits`. Three refusals that said only "Daily Credits used up" (branding, the
unranked roadmap, docs search) say "Your Credits are used up" with no refill promised. The activity timeline's ending label no
longer says "for today". Both periods are tested on each surface.

**4. `/pricing` pins.** The comparison table's Price, Credits a day, Credits a month and builds rows are compared cell by cell with
`PLAN_TABLE` (not with `PLAN_FEATURES`, which is what the page renders) and with the decided figures typed once, so reverting a row to
the `PLAN_LIMITS` ledger figures, or the Free price cell to "Free forever", fails. The card assertions are bounded (`has`: no digit,
comma or point glued to the front), so "15 Credits per day" no longer passes for "5 Credits per day".

**5. Guards.** `offer-rules.mjs` rule 4 reads the period (day or month) and holds a claim that names a plan (Free, Pro, Max) to that
plan's own figure: "Max gives 300 Credits a day", "Free gives 30 Credits a day" and "Free gives 5 Credits a month" are reported.
`PRICE_CLAIM` also reads "$12 / month", "$12 monthly", "$12 each month", "$12 every month" and "$12 USD a month". The `CREDIT_CLAIM`
lookbehind has a test of its own (`1.2.5 Credits a day` is not a claim). `scripts/check-offer.mjs` is a CI step in Static checks,
and the real-tree test requires exit 0 (it read only tracked files and the shared tables, so nothing outside the tree can turn it
red). `check-credit-figures.mjs` requires the pricing page to USE `PLAN_TABLE`, `BUILD_COSTS`, `CREDIT_USD` and
`TYPICAL_BUILD_CREDITS` (comments and import statements taken out first), not to import them. The plan-economics literal scan reads
numeric separators, so `4_500` is the figure 4500.

**6. Three web conversions are pinned.** The account-menu balance, the composer's `SlidingNumber` decimals branch (renders `3.54`,
`3.50`, `0.00`, `1,204.10`) and the usage-page ring's centre figure are rendered and read. The ring starts at the balance under
reduced motion instead of drawing 0.00 until the tween runs, which is what makes the drawn figure readable; `CreditsRing` is
exported for the test.

**7. Small.** The changelog no longer defines "1 Credit = 30 neurons" (it says what the ledger unit was and what a Credit is now).
The Free card says "The same StudPilot engine as every plan" instead of "Every build mode". `/pricing` FAQ and `/terms` point to the
Plan & billing tab of the Usage and Credits page, which exists. The SDK's `studpilot usage` help says ledger units (150 to a
Credit); the API contract is unchanged. The count beside "Spent today" is a count of ledger rows, each one a CHARGE (a request's
admission, a model step's settlement), so it is labelled "Charges today" and the calendar says "N charges" under "Days you spent
Credits" (it said "Builds today", "N requests" and "Days you built").

**Still open after cycle 2:** the M6 one-pool profit gap (section 3), the roadmap chip's per-request scale (section 8), and the
paid daily caps (section 5), all as written there. Not changed: checkout stays off and nothing was deployed, pushed or sent.

## 10. What the third review changed (cycle 3, HEAD `97655dba`)

A third review of `97655dba` left seven groups of defects. Each has a test that was run red against the unfixed code (or against
a mutation of the fix) and then green; the mutations are in the report.

**1. The between-steps pause no longer refunds a step that ran (money).** The `quota` pause at the top of step 2 and later did not set
`allowanceUsedUp`, so `refundVerdict` saw a refundable ending with nothing mutated and handed back every unit the run was charged.
Reproduced before the fix: Free, 51 units left, one read-only step of 1,530 neurons settled the 51 exactly, step 2 paused, 51 units were
refunded and the reply said "You have not been charged for this run". Now the pause sets the mark, the same as the settlement stop:
a `quota` ending that the person's own allowance caused is never refunded, whether it came from the day or the month. **The one `quota`
ending that still refunds is the service being full** (`BudgetError` and `CAPACITY_EXHAUSTED`, section 8 A): the person did not cause it
and a run that delivered nothing is not charged. A test pins that the two are different, in both directions.

**2. The public API's admission refusal names the limit that binds.** `429 insufficient_quota` said "This account has no Credits left
today." for a Free account whose month was used up. It now reads `quotaLimit` like every app path: "This account's daily Credits are used
up. They refill at midnight UTC." or "... monthly Credits ... on 1 November at 00:00 UTC.". The error code, type, status and headers are
the published contract: it is the same `refuse(429, 'insufficient_quota', ...)` call with only its message changed, and a test pins the
refusal's header names exactly (a tripwire: the version header under both its spellings, `content-type`, `referrer-policy`,
`strict-transport-security`, `x-content-type-options`, `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`,
`x-request-id`; no `Retry-After`, no usage header) for both limits.

**3. The live footer and the stored row agree after Stop mid-step.** `finishRun` broadcasts `msg_end` at once, with the cost known then
(the admission), and `settleAbandonedStep` brought the row and the quota meter to the settled figure but told the message nothing. It now
also broadcasts `{ type: 'run_cost', msgId, creditsSpent }` (additive: `packages/shared` `ServerMsg`; the SDK's stream fold ignores a
frame type it does not know). The web applies it to that one message through `withRunCost` and touches no run state, because it can arrive
during the next run. It is sent only when the settlement took something.

**4. Guard: rule 4 of `offer-rules.mjs`.** The plan was "the last plan named before the figure", which reported correct copy
(`<li>5 Credits a day (Free)</li>` under a Pro item; "5 Credits a day on Free, 20 on Pro" after a plan in the same sentence) and said
nothing about a wrong figure with its plan after it ("30 Credits a day (Free)"). It is now the nearest plan name in the figure's own
clause, either side; a list item, paragraph, heading, row, comma or sentence ends a clause; a tie holds the figure to either plan; a claim
inside an attribute does not own the text after its tag. `CREDIT_CLAIM` also reads "every day", "each day", "daily", "per calendar
month", "monthly", "5 daily Credits", and any no-break space (U+00A0, U+202F, `&nbsp;`, `&#160;`, `&#xA0;`, `&NonBreakingSpace;` and the
other entities in `SPACE`); `PRICE_CLAIM` reads "billed monthly", "per user per month" (and seat, member, person, account), one-decimal
prices ("$12.5 a month") and the same spaces. Each spelling has a case, and the real tree is still clean.

**5. Wiring pins and vacuous assertions.** `tests/check-offer.test.mjs` no longer reads the script's text: it runs a copy of the real script,
with its rules, against a small tree (its own tables, tracked copy files, `git ls-files`) with one planted violation per rule: 4 (and 4 per
plan, and credits-not-ledger-units), 5, 6, 7 and 1-3 (`planIssues`), and a control that also shows the two exceptions are honoured. Taking
`copyProblems`, `termProblems`, `planIssues`, `priceProblems` or `limitProblems` out of the script, reading no source files, or dropping the
exceptions turns a case red. `tests/check-credit-figures.test.mjs` runs the real script against a copy of the site's sources with a fixture
pricing page (one name left unused at a time, and import-only), so it fails if the script stops reporting `unusedNames` results or loses a
name from `CONFIG_NAMES`; and the same fixture mechanism holds the milestone derivation (item 6). The Stop-in-flight test's two vacuous
assertions are restated: "compute that ran" was the loop's own counter times 40 (now the count of provider calls, read where the call
happens, against what the ledger took: 40 + 40 + 40 + the 30 left = 150), and "the meter is told" was satisfied by the admission's quota frame
(now the last quota frame must be the settlement's, and say 0 left).

**6. The roadmap Cost chip is a build's cost, not an edit's.** It printed `runs x MODE_INFO.agent.typicalCredits`, the price of one
targeted edit (4 to 18 ledger units, 0.03 to 0.12 credits), as a milestone's cost: below the cheapest published build (0.52) and a
fortieth of a typical one (1.40). `creditRangeForRuns(complexity, runs)` now reads `BUILD_COSTS` (small, medium, large are the `small`,
`typical`, `big` rows) times `runs`, in ledger units on the wire as before, and carries `estimated` for the big row, which the chip
prints as ", estimated" as the pricing page does. A one-run medium milestone reads 1.40 Credits, a small one 0.52 to 1.40, a large one 4.00
to 12.00 estimated, and two runs read double. **The assumption is the owner's to confirm**: that a run of a milestone costs about one build
of its size (it is the only published figure there is; the 12-credit big row is itself an estimate). M6's estimate-before-you-build
replaces it. `MODE_INFO.typicalCredits` is unchanged and still what the usage page calls the next request. `check-credit-figures.mjs` holds
`creditRangeForRuns` to `BUILD_COSTS` (no `MODE_INFO`, no typed figure).

**7. Small.** The post-checkout banner printed the stored plan id ("builder"); it now prints Pro or Max through `planDisplayName`. The
pricing FAQ test accepted swapped resets (it matched "midnight UTC" and "1st of the next month" anywhere); each reset is now read inside the
sentence or clause that names its period. `quotaLimit`'s clamps are pinned: a day and a month both overspent by different amounts are a tie
and name the month (without the day's `Math.max(0, ...)` they named the day), figures that are not finite numbers read as unreadable, and
the daily lift is the next UTC midnight at the last millisecond and at midnight itself. **Not pinnable, stated:** the month's own
`Math.max(0, ...)` is redundant while the day's is there (a negative month figure is below every non-negative day figure either way), so
removing it changes no output.

### For M6 (both are open and the owner decides; neither is built now)

(a) **Parallel runs and API calls are each admitted for 1 unit and run to completion.** Admission is all-or-nothing for 1 ledger unit and
a step is paid when it resolves, up to what is left (`upTo`), so N concurrent runs or API calls against U units left are all admitted
(N up to U), each runs a step of up to `MAX_NEURONS_PER_REQUEST` = 1,200 neurons = 40 ledger units, and the first settlements take what is
left while the rest find nothing. The overrun is therefore about (units left) x (step cost - 1), at most 39 x U units: 51 units left is
at most 1,989 units, 13.26 credits, $0.66 of compute (arithmetic from the constants, not a measured run). Today only the number in flight
at once matters: one run at a time per project (SessionDO), `KEY_RATE_LIMIT` 120 requests a minute per live key. **The M6 fix is to reserve
a per-step estimate before the call** instead of 1 unit, and to refuse when the balance cannot cover it.

(b) **Refunds on `incomplete` and `error` endings with nothing mutated are user-triggerable.** A person who can make a run end that way
(a request the model cannot satisfy, the step cap, a refusal) gets every unit back, measured in `run-refund.test.mjs`: a terminal provider
error after one 60-neuron step on a 100-unit allowance returns the 2 units charged. A read-only prose answer that ends `done` is not
refunded (probed: 3,000 neurons, 100 units charged, 0 refunded), so the product is paying for analysis and not for an attempt that
produced nothing; whether an attempt that used compute and delivered nothing should be free is a pricing-policy decision, not a bug, and
M6 must make it.

**Both are bounded today by the global caps, which this slice left untouched:** `BILLABLE_NEURONS_PER_DAY` 150,000 ($1.65) plus
`FREE_NEURONS_PER_DAY` 10,000 is `DAILY_NEURON_CEILING` 160,000 neurons (5,333 ledger units, 35.6 credits) a day for the whole service,
and `BILLABLE_NEURONS_PER_MONTH` 2,270,000 neurons ($24.97) a month. No account can cost the service more than that, in total, through either
route; what is open is who pays for the compute inside the bound.

**Still open after cycle 3:** the M6 one-pool profit gap (section 3), the paid daily caps (section 5), the two M6 decisions above, and the
milestone-cost assumption in item 6. The roadmap chip's per-request scale (section 8) is closed by item 6. The SDK's stream fold does not
apply `run_cost` (an SDK run resolves at `msg_end`), so an SDK client that watched a Stop mid-step reads the cost known at that instant; the
stored row, the web footer and the meter agree. Not changed: checkout stays off and nothing was deployed, pushed or sent.

## 11. Accepted after three review cycles (2026-10-05)
The pricing slice stops here; the handoff allows 3 honest fix cycles. The third review left only one kind of
finding: the copy guard's rule 4 (`scripts/lib/offer-rules.mjs`) attributes a figure to the nearest plan name by
character distance. So correct figure-first copy joined by "and" ("5 Credits a day with Free and 20 Credits a day
with Pro") is reported against the wrong plan. And a plan name followed by a comma ("On Free, you get 30 Credits a
day") is not tied to its figure.

This is a heuristic in a defence-in-depth guard, not product behaviour:
- Every figure on `/pricing` and in the app is read from the shared config.
- `check-offer` reports the live copy coherent (4 plans, 406 files).
- A figure that no plan grants for that period is still reported, however it is phrased.

Write plan-first sentences until the rule is replaced by a parser of the pricing markup (M6, when the page
gains the estimate-before-build copy).

## 12. M2 step 2.2: the marketing site rebuilt on new layouts (2026-10-05)

Branch `studpilot/m2-site`, from `eb4b2b12` (the design system, in review as PR #32). Handoff 2.2 and the owner's rule: a redesign that
keeps the old layouts fails, and it is judged side by side against the old pages (`planning/proof/M2/old/` against
`planning/proof/M2/new-local/`, composed side by side for the landing, pricing and docs in `planning/proof/M2/side-by-side/`). The guards were written and run red against the old build first (`RED-FIRST.md`); every test that pinned an
old page is in `TEST-LEDGER.md`.

### 12.1 What the site is now

One layout, `Base.astro`, for every route (the docs and legal layouts sit on it). Header: How it works, Catalog, Pricing, Docs, Blog,
Discord (`/discord`), Sign in (`/app/login`) and the primary "Start free (beta)" (`/app/signup`); on a phone the links fold into a panel and the
primary button stays in the bar. Footer: product links, docs links, Privacy, Terms, Status, Discord, the contact address and the beta note (the first pass kept
the operator line "Apple Labs" for owner item N6; the owner has since decided the operator is StudPilot and the contact support@studpilot.app, see 12.5). The theme toggle keeps its stored key, `apple-theme` (a browser key already in
people's browsers, `AGENTS.md` section 2; the site and the app both read it, so there was no second key to read).

Pages: the landing (a left-aligned headline beside a fixed-size slot for a real screenshot, four kinds of piece in a sticky-heading list, a rail of
four steps, the bar stated in a recessed band, a flat price strip, a closing call), `/how-it-works` (eight steps, each labelled **Works today**,
**Partly works today** or **Being built**), `/catalog` (the four kinds, each with three example requests copied word for word from the frozen
dev test set, "No examples yet"), `/pricing` (the same figures and guards, a new layout, no Enterprise, no checkout), `/blog` (a content
collection of Markdown, one post, "What works today in the StudPilot beta"), `/404`. `/status`, `/discord` and the legal pages are kept and
take the new header and footer; their inner structure is untouched (the docs were rewritten in the fix cycle, 12.9). The four removed routes, `/models`, `/proof`, `/showcase` and `/changelog`, are
Astro redirects (to `/`, `/catalog`, `/catalog`, `/blog`), so the built files overwrite the old static rows.

The look, using only the tokens: no gradient, no shadow on a card, no motion of its own (nothing reveals on scroll, nothing loops), system
fonts, one accent. Measured with `scripts/check-landing-budget.mjs` (nothing raised) in the first pass: markup plus stylesheets 10,382 B gzip of 20,000 (was
17,481), inline JavaScript 2,882 B in 2 blocks of 36,000 (was 23,714 in 4), images 2,996 B of 40,000 (was 25,873). After the fix cycle the limits were lowered and the figures are in 12.7. Lighthouse on the local preview (mobile): Accessibility 100, Best Practices 100 and SEO 100 on `/` and on `/pricing`; a local trace of `/pricing`
read LCP 74 ms and CLS 0.00. (Lighthouse's performance score is the step 2.5 measurement, on the deployed site.) The only script on any
page is the theme toggle and the menu (two inline blocks, 2,882 B raw: the pre-paint theme read and the click and Escape handlers).

### 12.2 What was deleted, and the owner pick each one was

Each one is "replaced by the M2 rebuild, handoff 2.2" (the rule: do not reuse old layouts); `tests/old-layouts-gone.test.mjs` keeps them gone.

| Deleted | The owner pick it was | Why it is not reused |
|---|---|---|
| `layouts/Landing.astro`, `styles/landing.css` | the front page's own layout and sheet (the 2026-09-22 and 2026-09-24 redesigns) | one Base layout for every route |
| `picks/NoiseField` (+ `noise.ts`, `noise-field.*`) | React Bits Waves, Shape Waves, Topography, Dither | a moving ground; the new layout is flat and still |
| `picks/PointerRim` | Motion Conic Gradient Pointer | rim effect on the composer, which is gone |
| `Marquee.astro`, `picks/ticker.*` | Motion Ticker, GSAP Modifiers | the idea chips under the composer; no composer |
| `picks/BeamFlow` | UI Layouts Animated Beam (default, multiple input, multiple output, unidirectional) | the "what it reads, what it makes" diagram, which described tools |
| `picks/DeviceFrame` | Eldora iPad, Motion Screenshot Scroll Reveal | the tablet around the old demo stages |
| `picks/ArrowLink` | Motion ArrowLink | text links are plain now |
| `picks/CtaButton` | UI Layouts Button Arrow Right, Liquid Button, Button Background Shine; React Bits Specular Button | the one primary button is `.btn-primary` in the base sheet |
| `picks/ParticleWord`, `picks/motion.ts` | Componentry Cursor-driven Particle Typography | the footer wordmark of scattering bricks |
| `picks/scramble.ts` | Motion Scramble Text Hover | the nav links' scramble |
| `BuiltScreen.astro`, `data/showcase-proof.ts`, `public/assets/proof/model-screen-inventory-*.svg` | not a pick: the "One screen, as the model wrote it" band | a model-built screen is a build result (no fake output) |
| `ConsentProof.astro`, `data/consent-proof.ts`, `public/assets/proof/studpilot-consent-panel-*.webp` | not a pick: the "same request, sent twice" band, a recorded run of 2026-09-19 | replaced by empty slots for real UI recorded in `screens.json` |
| `FAQ.astro` | an earlier FAQ component, already unused (`Accordion` replaced it) | dead |
| `picks-docs/BeamBorder` | Motion UI Border Beam, React Bits Electric Border | decoration on the Free card |
| `picks-docs/BuildEstimator`, `picks-docs/PriceSwitch`, `picks-docs/rolling-number.*` | Motion Number Counter, Number Formatting, Price Switcher | interactive extras; the figure they derived (the price a build) is printed on each paid card |
| `picks-docs/ShinyButton` | Eldora Animated Shiny Button | decoration |
| `picks-docs/Spotlight` | GSAP quickSetter | decoration |
| `pages/models.astro`, `pages/proof.astro`, `pages/changelog.astro`, `data/recorded-run.ts` | not picks: the engine page, the recorded-run page, the release log | redirects; a recorded run and a changelog are not what the beta shows |
| `lib/billing-probe.ts` | not a pick: the build-time `fetch` of `/api/billing/config` | the build is hermetic; `terms` and `docs/billing` now say what is true (`checkoutOpen = false`) |

Kept: the docs picks (`Accordion`, `CodeTabs`, `DocsKit`, `Folder`, `Terminal`, `copy-button`) because the docs rewrite is a separate task, the
mark, and `ObjectIcon` (the plugin page uses it).

### 12.3 Where the task text and the code disagree, and what I wrote

- **Roblox sign-in.** The first task said Roblox and email sign-in were live while `ROBLOX-SIGNIN.md` said nothing was switched on; the pages then said "being switched on".
  The owner confirmed on 2026-10-05 (D-10) that Sign in with Roblox is live and he has used it; the pages now say it works, and Google and Discord "are coming" (12.5).
  **Superseded in 12.12:** the Roblox OAuth app is in Roblox's private mode (up to 10 users until review), so the pages say it is in a limited test.
- **Screenshots in the step list.** The plan's step 4 mentions Studio screenshots. They reach the browser only from a play test or from the `look`
  tool (vision, removed in M3), and the app's strip for them is another lane's. The page says "a live step list" and no more.
- **The block engine and the checks** are worded as "being built to", with "Partly works today" where the tools exist (play test, button presses,
  layout check, audit, claim check are registered and the agent may call them; nothing makes every build run all of them).
- **The one multiple-choice question** is "Being built": the worker has no such tool (`how-it-works.test.mjs` fails the day one appears).
- **No whole-game framing, no text-to-3D, no vision, no results.** Held by `no-fake-output` and `how-it-works`.
- **Reveals.** The scroll-reveal system is gone from every page, and with it `data-reveal` on `/status` and the plugin page; the nav and menu need
  the 2.9 KB of inline script above and nothing else.
- **Pricing.** Every figure and guard kept. The "a month / a build" switch and the build estimator went with their components; the price a build is
  now a static line on each paid card, derived from the same two numbers and held to the config.
- **The standing exemptions** that named deleted pages were updated, each with the reason: `scripts/check-site-links.mjs` (the `/showcase`
  exemption, which its own test demanded be removed), `scripts/check-site-semantics.mjs` (redirect stubs have no heading by design, and are
  counted), `scripts/check-pixels.mjs` (one layout, and the blog post route), `scripts/release.mjs` (the release ledger was checked against the
  changelog page; it is now checked against `docs/releases` when the config redirects `/changelog`, and still fails if a tree has neither),
  `planning/rename-allowlist.txt` (six lines for deleted files removed; the pins of `Base.astro`, `Footer.astro` and `theme-on-every-route` set to the
  measured counts; one line added for the operator-line guard).

### 12.4 Open at the end of the first pass, and where each stands now

1. The screenshot slots were empty (`screens.json` was `[]`) and the frame said "A real screenshot goes here": fixed in the fix cycle (12.7); there is no placeholder frame.
2. `infra/deploy-showcase.mjs` still exists and would put the old gallery back over the `/showcase` redirect. It must not be run again; retiring it (and `docs/evidence/ui-showcase`)
   is a separate decision. **Still open.**
3. `docs/evidence/pixels/baseline` (87 frames of the old look) is stale; `scripts/check-pixels.mjs` rule 4 fires on every frame until it is re-taken with `--write-baseline` once
   the app lane lands (DESIGN-SYSTEM section 7: once, not twice). **Still open.**
4. Left alone on purpose: `public/assets/wall` and `data/asset-wall.json` (CI runs `check-asset-wall` over them; the owner library goes in M3);
   `scripts/check-offer.mjs` still lists `changelog.astro` as an exception (harmless; its test uses the path as a fixture). **Still open.**
5. About 60 places in the docs, `/privacy` and `/terms` where a line break before an inline tag swallowed the space: fixed by one config setting (12.10), the legal pages included.
   The docs Terminal demo that kept its output hidden is deleted with its page.

### 12.5 Fix cycle 1 (2026-10-05): what the first review changed, and the new owner facts

The first pass was reviewed (23 findings: 18 confirmed by two skeptics each, plus 5 minor). Every one is fixed or recorded here. The branch was
rebased onto `main` at `f9c4bfe7`, which holds the design system (#32), the legal pages (#31) and Sign in with Roblox (#30). The owner's update of
2026-10-05 (`planning/proof/OWNER-DECISIONS.md` D-10 to D-16) changed three facts the site states.

| Owner fact | What the site now says | Held by |
|---|---|---|
| Sign in with Roblox is live and the owner has used it; Google and Discord are not switched on | "sign in with Roblox" works (step 1 of How it works, the landing rail, the blog, Getting started); Google and Discord "are coming". **Superseded in 12.12:** the sentences now say it is in a limited test until Roblox approves the app | `how-it-works.test.mjs`, `blog-post.test.mjs` (no `signInWithOAuth` in the app), `docs-claims.test.mjs`; `roblox-signin-limit.test.mjs` since 12.12 |
| The operator is StudPilot, the contact is support@studpilot.app (D-13) | `SUPPORT_EMAIL` in `packages/shared` is the one home; the footer prints it as a link; the footer's "Apple Labs" byline is gone (a byline that repeats the wordmark is the defect `one-operator.test.mjs` was written against); the docs layout, status page, FAQ and troubleshooting read the constant; the allowlist rows only these edits kept alive are removed (`build-allowlist.mjs --write`: UNCLASSIFIED 0) | `nav-and-routes.test.mjs`, `one-operator.test.mjs` (footer test restated), `landing.spec.ts` |
| The Creator Store listing is unavailable (`STUDIO_PLUGIN_STORE_LIVE` is false) | see 12.6 | `plugin-honesty.test.mjs` and the restated `how-it-works` and `blog-post` tests |

Not mine and left as they are: `privacy.astro`, `terms.astro` and `docs/privacy-and-data.astro` still say "Apple Labs" and the Gmail address until the
legal lane's rewrite lands. Consequences the merge has to settle: `one-operator.test.mjs` tests 1 and 2 pin "the operator is not the product name",
which D-13 reverses, so that lane must restate them; `titles.test.mjs` names those three pages as a shrink-only debt (their titles still use an em dash);
`docs/privacy-and-data` imports `DocsKit`, so `DocsKit.astro` stays as an empty stub (12.9). The one edit I made outside `apps/site` for this fact is the
`SUPPORT_EMAIL` literal in `packages/shared/src/index.ts`; the legal lane is expected to make the identical change, which merges cleanly.

### 12.6 The plugin cannot be had today, and every page that talks about it says so

`STUDIO_PLUGIN_STORE_LIVE` is false (known issue `plugin-not-in-creator-store`). The first pass said "it builds the piece in your own Studio place" in the hero,
the meta description and the rail, labelled "Pair the plugin" "Works today", and put the only caveat in the last sentence of the page. Now, derived from the
flag and never typed (each branch reads `STUDIO_PLUGIN_STORE_LIVE`; the day it is true every page says the plugin is free on the Creator Store):
- the landing hero says the plugin is not open to new customers yet and the chat works now, directly under the promise, and so does the meta description
  (the text a search result shows); rail step 02 says it; the closing call keeps its line;
- How it works: "Pair the plugin" and "Follow the live steps" are **Partly works today** (not "Works today") while the listing is down; step 3 says StudPilot can
  plan in the chat and cannot build in Studio;
- the blog post: pairing and the checks leave "What works today" and sit under "What is not there yet" ("New customers cannot build in Studio.", "The checks
  need the plugin."); "Roblox sign-in works" is stated as working;
- the catalog's "Where to ask", the docs overview, Getting started (steps 4 and 5 need a plugin new customers cannot get), the plugin page, the FAQ and
  /pricing (the Free panel and the comparison row) already or now ask the flag;
- the old docs said a connection "survives restarts" and "remembers the session"; the shipped plugin says "A pairing lasts until Studio closes", so no page says it.
`plugin-honesty.test.mjs` is the sweep: every built page with a sentence about pairing the plugin or building in Studio must carry the caveat on that page, the
front page in its hero and its description. "Pictures of the real app and plugin" is said only where real pictures are shown: How it works says "a screenshot of the
real web app ... The plugin is not pictured".

### 12.7 Screenshots (handoff 2.2: "the landing hero and the catalog use real product UI"; plan step 2.3)

`scripts/m2-capture-ui.mjs` builds `apps/web` (typecheck and a production build into a throw-away folder, and proves the production bundle carries none of the mock
fixtures), runs it in its mock mode (dev-only by design, guarded by `apps/web/tests/mock-mode-production.test.mjs`, so on the Vite dev server with
`VITE_STUDPILOT_MOCK=1`), aborts every request that leaves the machine, answers the one access check mock mode forgets (`GET /api/shared/<project>`, as the owner)
and captures **only** the empty workspace of a project with no conversation, at 1200x900 and on a phone. Before each capture it loads the app's own mock
conversation and the guard (`scripts/lib/capture-guard.mjs`) must find conversation elements in it (the canary); the idle page must then hold no conversation
element, no picture element, no failure text and not one line of the mock conversation, or the run fails and writes nothing (red-first: pointing the capture at
the conversation page fails with "18 conversation element(s)"). It encodes webp in Chromium inside a byte budget and writes `apps/site/src/data/screens.json`
(`id, file, sha256, source, commit, date, containsResult: false, alt, caption, width, height`) at the commit it was taken at (it refuses a tree with
uncommitted changes in the app or the packages it imports). The landing hero is 23,920 B (budget 25,000); the phone capture on the catalog is 38,036 B.

What is **not** captured, and why:
- **The plugin in Studio.** Studio is not running here, and the site never shows a Studio picture it did not take. The pages say the plugin is not pictured.
- **The pairing dialog.** In mock mode it shows "Studio connected" and the fixture code `GLM-7F3K2Q`, which is not the six-character code the pages and the plugin
  describe; a new customer cannot reach that state.
- **The usage page.** Its fixtures invent a 30-day spending chart and a spent-today figure, and the page carries the sentence "Builds complete Roblox games
  from a short prompt", which is whole-game framing the plan forbids. That sentence is in `apps/web/src/routes/usage.tsx`: for the app lane, not mine.
- **The dashboard.** Its fixture projects carry summaries of what was built ("Stage 1 is built with checkpoint pads ...") that read as results. One-click create is not on `main`.
- **The empty pieces state.** It is not on `main` either (app lane C5).
A frame the app lane changes is re-captured by re-running the script; the record carries the commit.

`ScreenSlot.astro` draws a recorded picture and its caption or fails the build: there is no placeholder frame, so "A real screenshot goes here" cannot ship. The
"live step list" slot on How it works is gone: a step list is a run, which a capture may not show. `no-fake-output.test.mjs` judges every `<img>` on every built page.
Landing budget, measured after the fix cycle and **lowered, not raised**: markup and stylesheets 10,461 B gzip of **12,000** (was 20,000), inline JavaScript 3,007 B in 2
blocks of **3,500** (was 36,000), images 26,916 B of **31,000** (was 40,000; the hero plus the two icons the head links).

### 12.8 The share card and the manifest

`apps/site/brand/og.html` (and the `og.png` the brand script renders from it) and `site.webmanifest` said "Describe a Roblox game. StudPilot builds it ... straight into the place
you have open in Studio" and "Works inside Roblox Studio". The card now says the plan's promise, "Ask for any piece. It looks pro, it works, and we never claim what we didn't
prove.", under a Beta chip and "The bar we are building to", with "Free while in beta" in its footer; the manifest says beta and nothing about Studio. `check-copy.mjs` reads both
files now (they were not in its denominator) and its "describe-it-then-builds-it" shape accepts a noun phrase after the verb; `share-surfaces.test.mjs` reads the card, the manifest
and the title and description tags of every page against the banned copy, the competitor shapes and the Studio-works claims.

### 12.9 The pricing page is a new layout; the docs are trimmed (plan step 2.6)

**Pricing.** The first pass kept the old page's skeleton (three plan cards, two columns of notes, the comparison table, the cost table, the accordion). The new page: one panel for the decision
a visitor came with (what Free gives you, with the shared-pool warning said there), every plan in ONE table (price, Credits a day and a month, builds, the price a build, steps, engine, support,
and a last row with the start button and the two disabled "Checkout not open" buttons), the cost of a build as a list with proportional bars, the limits as an always-open grid with the shared limit
written as one of them, and tax and support as small print. Every figure is still read from `packages/shared` and the worker's ceiling, and every pricing guard is kept (restated where it read a card).
`/status`, `/discord` and the legal pages keep their structure and take the new header and footer: the rebuild is one Base layout and new pages, not new inner structures for those four.

**Docs.** Pages: Overview, Getting started, The Studio plugin, Credits & limits, Billing & payments, Troubleshooting, FAQ (and Privacy & data, the legal lane's). `/docs/connect` redirects to Getting started
(pairing lives there), `/docs/updating` and `/docs/build-from-source` to the plugin page (an "Updating" section; the developer path said it was not how anyone installs StudPilot). The sidebar and the
overview list are derived from the page files (`docsPages` in `src/data/docs-index.ts`: a page's own heading, `order` and `summary`); a page with no `order` follows the ordered ones.
Every claim was checked: the pairing code is six characters and lasts 10 minutes (`pairing.ts`), a pairing lasts until Studio closes (the plugin's own first line) and a session expires after 30
days (`session.ts`), edits start off and are turned on in two steps (the plugin), the plugin's can and cannot is its own disclosure quoted, the update path is the worker's `UPDATE_PATH`. Sentences that
could not be checked were removed (Discord channel names, "plenty of people have learned scripting from StudPilot", supported Studio versions, "gets caught", queueing per account, a tip on making Credits go
further). `docs-claims.test.mjs` holds the facts against the files, `docs-nav-derived.test.mjs` the derivation.

Deleted with the docs rewrite (each "replaced by the M2 rebuild, handoff 2.2 and plan step 2.6"; `old-layouts-gone.test.mjs` keeps them gone):

| Deleted | The owner pick it was | Why |
|---|---|---|
| `picks-docs/DocsKit` (its script and styles) | React Bits Line Sidebar; Componentry Mac Keyboard; UI Layouts Button Hover Underline | pointer-driven motion and animated keycaps on a site that has none, on a nav that is derived now. The file stays as an **empty stub** only because `docs/privacy-and-data.astro` (the legal lane's) still imports it; the test fails the day nothing imports it |
| `picks-docs/Folder` | React Bits Folder | decoration on Getting started |
| `picks-docs/Terminal`, `picks-docs/CodeTabs`, `picks-docs/copy-button.ts` | Eldora Terminal; UI Layouts Code Tabs and Code Tabs MDX | the build-from-source page they served is deleted; the Terminal's caret looped forever, a debt the e2e spec named |
| `components/ObjectIcon` | not a pick: the plugin page's strip of object icons | decoration with hover motion |
| `pages/docs/connect`, `updating`, `build-from-source` | not picks | folded into Getting started and the plugin page; Astro redirects |
`Accordion` is kept (the FAQ needs a disclosure). `apps/site/tests/build-from-source-target.test.mjs` (4 tests) is deleted with its subject.

### 12.10 The 61 words glued to the next tag: one setting

Astro 7's default `compressHTML: 'jsx'` applies React's whitespace rules and removes the line break before an inline tag. `compressHTML: true` keeps the space. Measured: 62 glued
inline tags on 13 pages with the default, 0 on every page with `true`, the legal pages included, so the named-debt exemption in `rendered-text-joins.test.mjs` is deleted and every page is
held to zero (the mutation is deleting the config line). Cost: under 300 B of gzip on the front page.

### 12.11 Things I found that are not mine, and one I could not reproduce

- **Two `apps/web` tests fail because of the docs redirect (a cross-lane fix, not mine to make).** *Fixed in fix cycle 2 (12.12, finding 6), the only `apps/web` edit of this lane.* `apps/web/src/components/empty-state-model.ts` links `/docs/connect` from two empty states
  (lines 91 and 102, label "Connect a project"), and `apps/web/tests/contextual-help.test.mjs` requires every docs link in the app to be a file under `apps/site/src/pages/docs`. The page is folded into
  Getting started and is an Astro redirect, so the live link still lands, but the web suite is 2,537 tests, 2,535 pass, **2 fail** ("the empty states that mean go and connect Studio say where that is written",
  "every help link declared on an empty state names a page on disk"). The fix is in `apps/web` and is two lines: point those links at `/docs/getting-started` (label "Getting started"). I was told not to touch
  `apps/web`, and keeping a redirect-only page file on disk to satisfy a stale existence check would put it in the derived sidebar and the search index, so I left it.
- `apps/web/src/routes/usage.tsx` says "Builds complete Roblox games from a short prompt" (whole-game framing the plan forbids). App lane.
- `apps/web/src/lib/mock.ts` is wrong for a marketing capture in four ways (12.7: the pairing dialog, the usage page, the dashboard, the missing empty states). The capture script says why it does not use those states.
- The SDK branch of `api-surface-claim.test.mjs` is `if (sdk.private === true)` and `packages/sdk/package.json` no longer says `private`, so that branch is vacuous on main today. It needs the owner's answer on whether
  the SDK is published.
- The review measured a layout shift of 0.163 at 390 px on `/status`. With the first answer delayed past first paint I measured 0.018 at 390 px and 0.002 at 1440 px, from the same four sources (the known issues, the
  meta list, the button, the orb); the fix reserves the text box's height and the Playwright spec asserts nothing moves (under 0.001): red before the fix, green after.
- The test-ledger commit message of the first pass says "73 tests" for the 8 deleted files; the ledger's rows count 65 (9+2+9+4+10+19+8+4). The ledger is the record.
- One process slip, harmless and recorded: early in the work I ran `git checkout` on one file I had just edited, in this isolated clone, to undo an experiment (the working rules forbid it in the shared checkout);
  nothing else was touched. Mock-mode exploration also made one unauthenticated read to the Supabase REST URL that returned 401 and no data, before the capture script was written to abort every request that leaves the machine.

### 12.12 Fix cycle 2 (2026-10-05): what the second review changed, and the facts it settled

The second review had 23 findings (13 survived two skeptics each, the others are minor). Every one is fixed or answered here. The branch was rebased onto `main` at `30fbebd7` (planning files only) first.
The proof is `RED-FIRST.md` section 6 (every new or restated guard shown red, then green, with the previous guard run on the same break), `TEST-LEDGER.md` (the cycle's section; the cycle-1 count corrected), and
the retaken `new-local/` and `side-by-side/` pictures (all 13 routes at 1440 and 390 px, and the three pairs, taken from `astro preview` of `67034fb9`).

| # | Finding | What was done | Held by |
|---|---|---|---|
| 0 | Roblox sign-in shown as working for everyone | `ROBLOX_OAUTH_REVIEWED = false` in `packages/shared` (beside `STUDIO_PLUGIN_STORE_LIVE`); How it works step 1 is "Partly works today"; the landing, the Getting started page and the post say "Sign in with Roblox is in a limited test until Roblox approves the app. Email sign-in works for everyone." | `roblox-signin-limit`, `how-it-works`, `blog-post` |
| 1 | The hero picture shows a Studio selection chip | Not re-captured without the chip (the chip is the app's mock fixture, `apps/web/src/lib/mock.ts`, which this lane may not change): the alt and caption of both captures say the chip is sample data and no Studio is connected; the capture was re-run at `ab32175d` | `no-fake-output` |
| 2 | The critic is described as running | Reworded as the bar being built to ("will see", "is still being made", nothing rated); the three figures carry "Target" in their rows; the catalog and the post agree | `quality-bar-claims`, `blog-post` |
| 3 | Pro 20 and Max 30 a day printed as plan facts | `PAID_DAILY_CAPS_DECIDED = false`; the pricing row says "Not decided yet", the credits page says the paid daily limit is not decided yet, and no paid "full days" is printed | `undecided-figures` |
| 4 | The lede says the plans differ only in Credits | "they differ in how many Credits they include and in who is answered first when you write to support"; the support note says paid plans are *planned* to be answered first | `pricing-config` |
| 5 | support@studpilot.app published before the inbox can receive mail | Kept, with the line "a human reads it". Evidence below | (none: a fact, not code) |
| 6 | Two `apps/web` tests red | `empty-state-model.ts`: both help links now `/docs/getting-started#pair`, labelled "Pair Studio with a project"; `apps/web`: 2537 tests, 0 fail | `nav-and-routes`, the two `apps/web` tests |
| 7 to 16 | Guards that did not hold what they claim | Restated to the property, each with red-first proof | see the ledger section |
| 17 to 22 | Layout and accessibility | Fixed, each held by a browser measure | `layout-measures`, `pages-render-clean` |

**Facts and decisions.**
- **Roblox sign-in (finding 0).** `planning/roblox-oauth-setup.md`: the app is in private mode, "up to 10 unique users until Roblox reviews the app"; the review is owner action X9 (open, scheduled for M7). The page says it plainly and derives every sentence from
  the one flag (`apps/site/src/lib/roblox-signin.ts`); the day X9 is done, flip `ROBLOX_OAUTH_REVIEWED` and the pages say it plainly again. The post is Markdown and cannot read the flag, so `blog-post` holds it: it fails the day the flag flips until
  a person moves the line to "What works today". Step 1 is "Partly works today" and not "Works today" because the label is the claim and one of its parts works for ten people.
- **support@studpilot.app (finding 5).** Cloudflare Email Routing for studpilot.app was switched on and verified on 2026-10-05: status `ready`, the rule "support to owner" forwards `support@studpilot.app` to the owner's address, `route1` to `route3.mx.cloudflare.net` and the
  SPF record resolve on public DNS (`planning/proof/M2/LOG.md`, "Cloudflare access through OAuth, and support@ forwarding is live"; `BLOCKED.md` E1 is closed). The brief for this cycle states that the inbox receives mail and that the owner reads it. I did not
  send a mail or read the inbox (no network write was allowed), and the LOG's own line says a test message had not yet been observed when it was written. The address and "a human reads it" stay.
- **Paid per-day caps (finding 3).** `planning/pricing-2026-10-04.md` decides price and monthly pool per plan and Free's 5 a day; `planning/proof/OWNER-DECISIONS.md` has no answer on the paid daily figures (section 5 of this file still lists "Pro 20 and Max 30" as an assumption for the
  owner to confirm). The config keeps them (QuotaDO needs a number); the marketing site no longer prints them. When the owner decides, set `PAID_DAILY_CAPS_DECIDED` to true.
- **Not mine, found on the way, for the other lanes.**
  - The legal lane: three shrink-only debts name its pages, each deleted by the test the day the page stops offending: `roblox-signin-limit` (`/privacy`, `/terms`, `/docs/privacy-and-data`, and `/docs`, whose list quotes the privacy page's summary "what it holds when
    you sign in with Roblox"), `plugin-honesty` (`/privacy`, `/terms`, `/docs/privacy-and-data`), and the existing `titles` debt. `/terms` still says "have an AI agent apply them inside Roblox Studio via the StudPilot plugin" with no caveat.
  - The app lane: `apps/web/src/routes/auth-pages.tsx` draws "Continue with Roblox" for every visitor once the worker reports it configured, so the 11th person meets a failed Roblox consent; and `apps/web/src/components/plans.tsx` prints the paid plans' "N a day" figures, which the owner has not decided.
- **The landing budget** after this cycle, measured and not raised: markup and stylesheets 10,667 B gzip of 12,000, inline JavaScript 3,007 B of 3,500, images 26,916 B of 31,000.
- **Not done, on purpose.** The hero picture was not re-captured without the chip (above). Lighthouse was not run (other lanes were running suites; the deployed site is measured later). No deploy, no push, no network write.
- **A slip, harmless and recorded.** I ran `git checkout` with no arguments once, in this clone, by mistake: it only lists the modified files and changed nothing. Probe servers used ports 4321 to 4326 (all stopped); mutation work ran in copies under the scratchpad's `probes/site/`.
- **What I found about my own first versions, so the next reader does not repeat it.** Four of the new guards were green on the break they were written for and were tightened before they were committed: the critic scanner exempted a whole sentence on one "will"; the stale-reference scan
  accepted "old" and "was" anywhere nearby; the footer buttons' height was measured only where the layout had one line; and the "Included" text hidden inside a tick cell, which the e2e contrast audit measured against the plan's label once the phone layout became a grid (placed in the value column).
