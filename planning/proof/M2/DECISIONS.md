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
the operator line the former operator name for owner item N6; the owner has since decided the operator is StudPilot and the contact support@studpilot.app, see 12.5). The theme toggle keeps its stored key, `apple-theme` (a browser key already in
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
| The operator is StudPilot, the contact is support@studpilot.app (D-13) | `SUPPORT_EMAIL` in `packages/shared` is the one home; the footer prints it as a link; the footer's the former operator name byline is gone (a byline that repeats the wordmark is the defect `one-operator.test.mjs` was written against); the docs layout, status page, FAQ and troubleshooting read the constant; the allowlist rows only these edits kept alive are removed (`build-allowlist.mjs --write`: UNCLASSIFIED 0) | `nav-and-routes.test.mjs`, `one-operator.test.mjs` (footer test restated), `landing.spec.ts` |
| The Creator Store listing is unavailable (`STUDIO_PLUGIN_STORE_LIVE` is false) | see 12.6 | `plugin-honesty.test.mjs` and the restated `how-it-works` and `blog-post` tests |

Not mine and left as they are: `privacy.astro`, `terms.astro` and `docs/privacy-and-data.astro` still say the former operator name and the Gmail address until the
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
## 12. The app rebuild, M2 step 2.3 (`apps/web`; branch `studpilot/m2-app`, 2026-10-05)

Decisions taken while building the web app's features on the design system. One subsection per item (C1 to C8 of the lane's
task). Nothing here was deployed, pushed or sent; no Supabase or Cloudflare call was made, so everything that needs the
live project is listed as unverified. The tests for each item are in `TEST-LEDGER.md`, section "App".

### 12.1 C1: Google and Discord render only when the project says they are on

- **The rule.** `lib/auth-providers.ts` asks `GET <SUPABASE_URL>/auth/v1/settings` (with the public key as `apikey`) and a
  provider is on only when `external.<provider> === true`. The answer is fetched once per page load and shared by the sign-in
  page, the sign-up page and Settings > Connections. Any failure (network, non-200, not JSON, wrong shape) means none, and a failure
  is the page's answer too: nothing retries until a reload. Until the answer arrives nothing is drawn, so a button never appears
  and is taken away.
- **Today both are off (owner item N2), so no Google or Discord button renders anywhere.** The Roblox button is unchanged (it
  waits for `/auth/roblox/status`). The three share one "or" (`AlternativeSignIn`); with nothing on there is no "or" either.
- **Not verified live (no network in this task):** that the settings endpoint answers a browser at `https://studpilot.app` with
  CORS headers. If it does not, the buttons never render, which is the safe failure. When the owner switches a provider on (N2) the
  checks are: the button appears; the redirect URL `https://studpilot.app/app` is on the Supabase allow-list; and, for C6, manual
  identity linking is enabled at the project. **No policy edit is part of that switch (fix cycle 1, 12.9):** the privacy pages used to say
  "not offered yet ... we will update this policy before either is switched on", which a dashboard toggle cannot honour in order (no commit
  accompanies it and no test can go red), so they now describe the sign-in without stating whether a provider is on, and are true before and
  after the switch. The one thing to read at N2 is the Google and Discord sentence on both pages (`LEGAL-CLAIMS.md` section 9, A4 and A5), and
  whether a Google or Discord sign-up should be asked the date of birth as well (12.2).
- **Alternative not taken:** have the worker proxy and cache the settings. One more route and one more cache for a value the
  project already publishes; the page-level cache is enough.
- **The mock app** answers without a request: no providers, and `?providers=google,discord` (dev server only) turns them on so
  the buttons and the Connections cards can be reviewed.
- **`supabase-config.ts`** now holds the two public constants so the check can read the address without building a Supabase client.

### 12.2 C2: the 13+ screen on email sign-up

- **What it is.** The email sign-up form asks for a date of birth as a day, a month (named) and a year. It is neutral: no
  number, no placeholder, no limit on the year that names a line, and the page says nothing about why. An impossible or empty date
  is asked for again in one sentence that says nothing about age.
- **Under 13.** Nothing is sent: no sign-up request, and not even the captcha script (a request to Cloudflare). The form is replaced
  by a kind message ("We cannot make an account for you right now ... we are sorry"; no number, no rule, no second try offered) and
  the browser remembers the refusal.
- **13 or over.** The sign-up goes with `data: { age_gate: 'passed' }` (the user metadata) and nothing else. The birth date is in no
  argument of any call and is stored nowhere.
- **A SOFT BLOCK, and it is said so.** The refusal is a flag (`studpilot.age-gate.v1` = `1`) in `localStorage`, plus a flag in the
  page's memory so it holds where storage is blocked. It stops changing the date and trying again at once, and a reload. It does not
  stop anybody who clears site data or uses another browser, and the server never checks it. A neutral age screen without an identity
  check can be no stronger, and the privacy pages say "the check goes by the date you give and is not an identity check".
  - **A known cost.** A grown-up who typed the wrong year is refused in that browser and has no way back through the app. There is no
    expiry. The alternative is a window (for example 24 hours) after which the form opens again; it makes the block weaker for the
    people it is for and lets an honest slip heal. It is one constant to add if the owner prefers it. Not done.
- **Roblox, Google and Discord sign-ups are not asked the date.** Roblox's OAuth service is for accounts held by people aged 13 and
  older (an external claim, sourced to Roblox in `LEGAL-CLAIMS.md`). Plan section 7 also says Google and Discord already require 13 and
  older; **the pages no longer say that** (fix cycle 1): it is an external claim about those providers' rules that nothing in this repo
  shows, and Google offers supervised accounts to children under 13. The pages say what StudPilot does (no date is asked again) and that
  Google and Discord apply their own age rules. **Open for the owner at N2: whether a Google or Discord sign-up should be asked the date
  too.** Asking would close the gap for a supervised under-13 account; the cost is one more screen after a provider sign-in, which has
  no form today. Nothing is promised either way.
- **Existing accounts are not asked again.** They have the pages' 13-and-older terms already, and the flag lives only in the
  user metadata of an account made after this change. *Alternative: ask at the next login.* It would have to ask every account that
  lacks the flag, once, before the app opens, and write the answer back (`updateUser`), which blocks people who are mid-build on a
  question the terms already answer. Revisit when the server stores the flag.
- **No migration.** Whether the server copies `age_gate` into `profiles` (and whether the Worker refuses an account without it) is a
  later step. The flag is client-supplied: any API caller can set it or leave it out. It is a record that the form was passed, not proof.
- **Pages changed because this made them false.** `/privacy` and `/docs/privacy-and-data` said the sign-up form asked for nothing
  but an address and a password; they now describe the date of birth, that it is checked in the browser and never sent or stored,
  that a pass leaves one note on the account, that a refusal leaves a flag in the browser, and that the other ways in do not ask again
  (and that Google and Discord apply their own age rules). `apps/site/tests/privacy-claims.test.mjs` was re-aimed (it said "no
  birth-date field while the form has none").
- **Digits from any keyboard (fix cycle 1).** The day and year fields kept only ASCII digits, so a person whose keyboard types
  Arabic-Indic, Persian, Devanagari, Thai or full-width digits saw each keystroke vanish with the submit stuck disabled. The fields now keep
  what is typed as the ASCII digit it stands for (`normaliseDigits`, checked against `Intl` for every numbering system the runtime knows),
  and the verdict is the same date in any script.
- **The refusal takes focus (fix cycle 1).** It replaces the form that held focus, so focus fell to the page and the inserted status line
  was not reliably announced. The refusal's heading takes focus when the refusal appears (given or remembered) and is described by the
  sentence under it; the status role is gone, because focus carries the announcement. The 320px phone gets a floor for the month column
  ("Septemb" was "September" cut off), and the Roblox link now has the hairline and height its siblings have.

### 12.3 C3: "New project" is one click

- **What happens.** One press makes the project at once, named "Untitled piece N", and opens its conversation. N is one more than
  the highest "Untitled piece N" the person already has (archived ones count, because they keep their names), so a name is not
  handed out again while its project exists and deleting a lower one does not refill the gap. Only the exact pattern counts; a
  person's own names never move the number.
- **What is gone.** The create dialog (`CreateProjectModal`): its name field, its description field and its template picker.
  A description and a better name are things a project grows (Edit project and the title rename are on the card and in the
  workspace), and "what are you building" is the first message. The dialog's request-seeding survives in one place: the sentence a
  person typed on the landing page still rides into their first project (it is moved, not copied; `lib/pending-start.ts`).
- **Every entry point is one hook.** `lib/use-create-project.ts` serves the shelf's header button, the empty state's action, the
  rail's "New chat", the palette's "New project" and the shortcut. It works from any screen, so nothing navigates to the shelf first
  to find a dialog, and the shell no longer holds any new-project state (`registerNewProject`, `newProjectPending` and
  `useProvideNewProject` were removed with the dialog: they existed only to open it). One creation can be in flight at a time in
  a page, so a double press, or a button and the shortcut, make one project. A failure is a toast; success is the conversation opening.
- **The five starting points stay**, in the composer's "Starting points" menu, where they insert a request into the message box
  (`lib/project-templates.ts`). `templateSeed`, the dialog's lookup, was removed with its only caller.
- **The docs page that described the dialog is corrected.** `/docs/getting-started` said "give it a name" before a project exists; it now says
  the click opens the project, what a new project is called, and how to rename it (a test holds the page to the behaviour).
- **Not verified live:** the two queries it makes (`projects` read by name, then one insert) run under the signed-in person's
  row-level security exactly as the old dialog's insert did; no database was touched in this task.

### 12.4 C4: Studio screenshots in the turn

- **Frames flow today, so the strip fills against real data.** The worker broadcasts `studio_frame` from `emitFrame`, which
  `capture_studio_viewport` (a native Studio capture, `source: 'studio_viewport'`), `render_view` (StudPilot's own preview render)
  and the playtest loop call (`apps/worker/src/tools.ts`, `do/session.ts`). Nothing here is built against a message that is never sent.
  When the agent captures nothing during a run the strip stays on its empty state ("Studio screenshots appear here while StudPilot
  builds"); it fills the first time a capture tool runs. The vision tool `look` also emits frames today and is removed in M3 (plan
  section 3); its frames would show here too until then.
- **Each capture once (fix cycle 1).** The worker replays the frames it still holds, with their original ids and times, every time a
  socket attaches during a playtest, so a reconnect appended copies: the strip repeated and older frames left the newest eight. The page
  now drops a capture it already holds (`appendFrame`, used by the socket hook; a playtest frame is identified by its run and counter,
  any other by what was captured and when, pixels included), and the strip shows each capture once.
- **Which frames.** The newest eight of the run's own, oldest left. The worker stamps every frame with the id of the assistant
  message it was taken for (`msgId`, which is the turn's id), so a frame from an earlier run, or one the worker could not attribute, is
  never shown under this turn. The socket hook already kept the newest eight in memory and persisted none; that is unchanged.
- **Honest names.** A native capture is a "Studio screenshot"; anything else is a "Preview render", so a preview of StudPilot's own
  geometry renderer is never read as a screenshot of Studio. Captions carry the kind and the time in the person's clock setting, and
  nothing technical (no tool name, instance path or camera name).
- **Where it shows.** The latest assistant turn, while it runs, once it has a frame, or when it was a build (it used tools). A plain
  chat reply and every earlier turn get no strip, so a conversation is not full of empty boxes. The offer to the latest turn only is made in
  one place (`workspace.tsx` hands `frames` to the turn whose id is the last assistant message's) and is guarded there by a syntax-tree test.
- **What it says with no frame (fix cycle 1).** It follows the run and Studio, because "appear here while StudPilot builds" is false under a
  finished turn and told nobody what to do: running with Studio connected, "Studio screenshots appear here while StudPilot builds"; running
  with Studio not connected, "Connect Studio to see screenshots here while StudPilot builds"; finished, Studio not connected, "No
  screenshots were taken for this request. Connect Studio to see them next time." (**reworded in fix cycle 2, 12.10: the page cannot know that none were taken**); finished with Studio connected, no box at all (the turn holds none
  and there is nothing to do; the page cannot tell a request that took none from a reload that cleared them, 12.10); and, from cycle 3 (12.11), no line at all
  while the page has not yet heard whether Studio is connected. The enlarged view's Earlier and Later use the workspace's outline button, with a
  visible disabled look and the focus ring (they were 18px of bare text, because the shared `.btn` chrome is scoped to other pages).
- **What the page promises, and only that.** The enlarged view says "Shown only in this tab and kept only while it is open. This page
  does not save or send them." It does not say "no model ever sees it": that is the worker's business, and the worker's `look` path
  sends frames to a vision model today (removed in M3). A source-reading test holds that the strip, its dialog and its model touch no
  storage and make no request.
- **Supersedes** the frame-strip half of owner decision D-THINK-1 ("no playtest panel, frame strip or connection detail"), on the plan's
  own line (section 6: "chat with a live step list and screenshots"). The playtest card and the connection detail stay undrawn.
- **The mock app** holds no frames by default (the strip's empty state); `?frames=1` stamps the fixture renders for the last mock turn
  so a full strip can be reviewed. Those are fixtures and are never shown in a production build.

### 12.5 C5: piece history, and the per-piece settings panel

**History (real data).** The Checkpoints drawer is the project's history: its real checkpoints grouped by the request that made them
(`lib/checkpoint-history.ts`, `components/ws/checkpoint-history.tsx`). The API returns a checkpoint's id, label, kind, time, counts,
coverage, author and description, and **no request id**, so the grouping is by time and says only what time can say:
- A checkpoint StudPilot took (`auto` or `pre_agent`) is filed under the latest request the person had sent when it was taken, which is the
  run that request started. A request that made no checkpoint is not listed.
- A checkpoint the person saved by hand (`manual`) was not made by a request, so it is never filed under one: it sits in "Saved by you".
- A checkpoint older than every request this page has loaded is "Earlier work", not the first request's.
- The one weakness is the clock's: a request sent from this tab is stamped with the device's clock until the conversation is reloaded,
  while a checkpoint carries the server's. A device whose clock is minutes out can file one under its neighbour; a reload restamps every
  request from the server. If the owner wants exact grouping the worker must stamp each checkpoint with the message id of the run that took it
  (a later step; it needs a migration of the session store, not done here).
- The rows are the old rows, moved into the component with no change of content (author, date, counts, description, Restore, the restore's
  own sentence and counts); three tests that read the row's text out of `workspace.tsx` were restated to read the component.

**Settings panel (a stub, wired in M5).** The panel (`components/ws/pieces-panel.tsx`, a "Pieces" drawer in the workspace, reachable from a
topbar button and the palette) has four controls: a number (typed, range and step enforced; a value it cannot hold is refused, not clamped),
a colour (the browser's picker beside a hex field), a switch (a real button with the switch role, and the word On or Off), and a few words
(length-capped). Every control is native, keyboard reachable, named, and carries the ring token.
- **Production has no pieces, and (owner decision, fix cycle 1) does not offer the panel at all until M5.** The first version drew a topbar
  button and a palette command into a drawer that could only say "Pieces appear here after a build", while nothing produces a piece before
  M5: a dead end with a sentence that is false today. `PIECES_OFFERED` (`lib/pieces.ts`, `import.meta.env.DEV`) now gates the button, the
  palette command and the drawer's mount, a remembered "pieces" drawer restores as closed where it is not offered, and the production build
  does not contain the panel (not even its empty sentence). Development and tests keep the specimen panel. `lib/pieces.ts` loads the stub only
  through a dynamic import behind the same constant. Proof: `tests/pieces-production.test.mjs` bundles the module both ways and reads the
  output; `tests/pieces-panel.test.mjs` walks the syntax tree of `workspace.tsx` for every way in and requires the gate on each;
  `scripts/check-app-bundle.mjs` fails when the stub's marker, a sample name, "Pieces and their settings" or the panel's specimen note is in
  `dist` (run on the real production build, and red-first with the gate forced on); `tests/mock-mode-production.test.mjs` stays green.
- **Every stub piece says SPECIMEN**, on the panel in a sentence and as a stamp on each card, and says a change stays in the panel: it is not
  saved and changes nothing in Studio. A piece without `specimen: true` is never stamped.
- **What M5 changes.** `PIECES_OFFERED` becomes the fact that a block has parameters to show. The panel reads a block's own parameter schema (`block.json`: the parameter JSON Schema with defaults) instead of the
  stub; a change then edits that block's parameters and re-runs only that block. The four control kinds map to the schema's number, colour,
  boolean and string types. Nothing here persists a change, and there is no request from the panel, so M5 adds the wiring and removes
  `lib/pieces-stub.ts`.

### 12.6 C6: account connections, and the avatar

- **Two identity cards, drawn only for a provider that is on.** "Sign in with Google" and "Sign in with Discord" (`components/identity-card.tsx`)
  use `supabase.auth.linkIdentity` to connect and `unlinkIdentity` to disconnect, and appear only when the project says the provider is on
  (the same answer as C1, `lib/auth-providers.ts`). Today both are off (N2), so today neither card exists. The page holds the row, its
  search result and its rail entry back on the same answer, so a search for "google" never finds a row that is not there.
- **Disconnect is offered only with another way in.** Supabase refuses to remove an account's last identity, so the card says "This is the
  only way you sign in to this account, so it cannot be disconnected" instead of offering a button that fails. The card also refuses before
  the request if the list says so. An unloaded list is not a yes. A failed read of the identities is shown as a failure, never as "not connected".
- **Separate from the other three things on that page.** The Roblox card, the Open Cloud key panel and the Discord bot link keep their own
  rows. The Discord identity card says in words that it is "separate from the Discord link below, which starts builds from a Discord channel".
  The rows run in this order: Roblox sign-in, Google, Discord sign-in, Open Cloud key, StudPilot API keys, Discord link.
- **Unverified (no network here), for owner item N2:** that manual identity linking is enabled at the Supabase project (without it
  `linkIdentity` fails, and the card says so in a toast), that `https://studpilot.app/app/settings` is on the redirect allow-list, and what
  `identity_data` the two providers return (the card reads `email`, then Discord's `custom_claims.global_name`, then `full_name`, then `name`,
  and says only "is connected" when none is readable).
- **A Roblox-only account may connect Google or Discord** (it has its placeholder email identity and the new one, so two). That is a second
  way in, not a change to how the Roblox account works; its Roblox card is unchanged.
- **The avatar is never "?".** It took `(name ?? address)[0]` or "?", so an account with no address showed "?" in the rail, the account menu and
  its header. `avatarInitial` takes the first letter of the display name, then the Roblox username, then the address, never a placeholder
  address and never the words "Roblox account"; with nothing honest to take, all three places draw the same plain person mark. The line
  beside it says "Your account" instead of being empty.

### 12.7 C7: usage and plans

Checked against the pricing slice (section 4): the usage page's Credits are printed with two decimals through the shared model
(`usage-meter-model.ts`, `formatCredits`), and the plan ladder reads `PLAN_TABLE` and `LISTED_PLAN_IDS` (Free, Pro, Max; no Enterprise card).
**One thing was still wrong:** the pricing page says "Free while in beta. Paid plans start later" above its cards, and the in-app ladder
said nothing of beta. The Plans section of `/usage` now says the same words above the ladder (`BETA_LINE` in `components/plans.tsx`), and
`tests/usage-beta.test.mjs` holds the two surfaces to each other by reading the site's heading. Nothing else was changed. No referral or
bonus credit is promised anywhere on the page (they wait for M6).

### 12.8 C8: growth (P2): an invite link and a "Made with StudPilot" line. It fits, small; the attribution is cut.

- **The link** is `https://studpilot.app/app/signup?ref=<code>`. The code is the first ten hex digits of SHA-256 over a fixed label and the
  account id, so it is stable per account, names no one and cannot be turned back into the id (`lib/growth.ts`). It is copied from "Invite a
  friend to StudPilot" on a project's menu on the shelf and shown in full in Settings > Share, with a Copy button that says whether the copy
  worked. A link with no valid code is not offered. (Fix cycle 1: it was "Copy invite link", among the project's own actions and as an icon
  beside "Who can build here", the real invitation to the project. The link grants no access to any project, so a person who sent it to a
  teammate expecting access sent them to a sign-up form. It is named for the product now, the copy says "Link to StudPilot copied. Send it
  to a friend.", and the workspace's icon-only button is gone: an icon cannot say whose link it is.)
- **Nothing records the code yet, and the rows say so.** The sign-up page ignores `ref`, no worker route accepts it, the sign-up's user metadata
  carries only `age_gate`, and no migration stores a referral, so a sign-up through the link is recorded like any other. The task's rule
  ("recorded at sign-up in the user metadata only if the server side already accepts it") therefore leaves it out. `tests/growth.test.mjs`
  fails the day the sign-up page, the worker or a migration starts reading a referral code, so the copy is revisited then. **Attribution is a
  later step (M6).** An alternative is to pass `ref` in the sign-up metadata now so M6 can backfill; it was not done because nothing consumes
  it and the privacy pages would then have to describe a field that serves no purpose today.
- **No referral credit is promised anywhere.** The invite row says "Nothing records it yet, and nothing is earned by sharing it". A test scans
  the app and the site source for any sentence that offers credits for inviting or sharing, and the guard is run against sentences it must catch.
- **The badge** is `Made with StudPilot - https://studpilot.app`: plain ASCII text and a link, because a Roblox description shows no formatting.
  It is optional, lives in Settings > Share, and nothing inserts it into a game.
- **The link is on every project's menu on the shelf, though it is about the product, not that project.** It says nothing about the
  project's contents, and its label names StudPilot so it does not read as an invitation to the project.

### 12.9 Fix cycle 1 (2026-10-05): what a two-skeptic review of this branch changed

The review (`app-c1-findings.json`: 15 verified findings and 9 minor) found no wrong behaviour in the core of any item and nine things the branch
made false, dead or unguarded. Each is fixed or recorded here; the guards and the planted breaks are in `TEST-LEDGER.md`, "Fix cycle 1".

| Finding | What was decided or done |
|---|---|
| `LEGAL-CLAIMS.md` still described the old form and "no `signInWithOAuth`" | Updated: five rows changed and section 9 added (the date-of-birth screen, the pass note, the refusal flag, the other-ways-in sentence, the Google and Discord sentence), with file:line evidence and what is not verifiable here |
| Privacy pages promised a policy update before a provider is switched on | **Decision (owner):** replace the promise with a plain description that is true whether or not a provider is on (12.1); the restated site tests hold the link (only gated call sites; the gate is the project's `external.<provider> === true`) |
| "Google and Discord already require 13+" | Removed from both pages: external, unsourced, and Google offers supervised under-13 accounts. **Open (owner, N2):** whether provider sign-ups should be asked the date (12.2) |
| Pieces entry point in production | **Decision (owner):** not shown at all until M5 (12.5). Production-bundle proof kept and extended |
| Duplicate frames after a reconnect | Fixed at the hook (`appendFrame`) and in the strip (12.4) |
| Restore button's click unguarded | The test presses the real button of an expanded row; planted `onClick={() => {}}`, no `onClick` and a wrong checkpoint each go red |
| Offer to the latest turn only unguarded | A syntax-tree test on `workspace.tsx` (12.4) |
| Roblox button wiring through `AlternativeSignIn` unguarded | The status hook's answer and the return path are run; planted `robloxConfigured={false}` and `from="/"` go red |
| Referral-credit scan missed ordinary phrasings | A sentence-level pair scan (an invite word and a credit word within one sentence, either order); the four missed sentences and six more are in the must-fire list; the whole app and site read clean |
| Restated privacy test promised "re-aimed in the same change" | Replaced by the property it can hold (above) and the reason |
| Enlarge dialog's Earlier/Later unstyled, disabled invisible, no ring | Workspace outline button plus the strip's own disabled and focus rules (12.4); measured in the browser: 72x36, disabled quiet, ring 2px |
| Strip's empty state stale and not actionable | 12.4 |
| Day and year fields delete non-ASCII digits | 12.2; checked against `Intl` for every numbering system |
| Focus and announcement after the refusal | 12.2 |
| "Copy invite link" reads as a project invite | 12.8 |
| Settings search counts hidden rows | `foundLine` takes the page's own total |
| Strip's sentence under a finished turn (minor) | 12.4 |
| Avatar astral-letter test (minor) | Asserts the letter itself; planted `split('')` goes red |
| `usePieces` loaded gate and unmount guard (minor) | Run through the harness; three planted breaks go red |
| Ledger missing the design-test edit (minor) | Recorded in `TEST-LEDGER.md` |
| Roblox link borderless beside Google and Discord (minor) | The anchor carries the hairline and the 20px line; measured 1px solid, 46px, all three |
| Checkpoint heading shows a time with no date (minor) | `clockOrDate`: time alone for today, the date with it otherwise, in the person's zone |
| Month cut off at 320px (minor) | A floor for the month column below 400px and a stack below 300px; measured at 320, 340, 360, 390 and 1440 |
| OAuth buttons held after Back from a provider (minor) | `pageshow` with `persisted` releases them; run with a stand-in `window`. **Not reproduced in a real browser** (Playwright's Chromium disables the back/forward cache): the release is proved by the stand-in, not by a restored page |

**A mock flag added for review, development only:** `?studio=off` (`mockStudioConnected`, `lib/mock.ts`) makes the mock app's Studio disconnected so the strip's
"Connect Studio" lines can be photographed. It folds to nothing in production like the other mock flags (`tests/mock-mode-production.test.mjs`).

**Left as it was and said so:** the glyph `arrowUpRight` in `components/icons.ts` was used by the removed workspace button and now has no caller in this app; it is a shared icon
table entry that existed before this branch, so it was not deleted.

### 12.10 Fix cycle 2 (2026-10-05): what the third check of this branch changed

The cycle 2 check (`app-c2-findings.json`) found nothing wrong in the cycle 1 fixes themselves: one item partly fixed and four things the cycle 1 fixes made
false, loose or unguarded. The branch was also rebased onto main `30fbebd7` (`git rebase --onto origin/main eb4b2b12`): the 24 design-system commits it used to
carry are on main as one squash (#32), so it now holds only its own app commits; the web suite measured on the rebased head before any change here was 2736 pass,
0 fail, the same as before the rebase. The guards and the planted breaks are in `TEST-LEDGER.md`, "Fix cycle 2".

| Finding | What was decided or done |
|---|---|
| A new playtest frame can be dropped as a replay | **Corrected in 12.11: the case this row describes cannot happen in the worker today; the key stays as a defence.** The page keyed a playtest frame on its run and counter (`playtestRunId`, `seq`). The check had said the worker's counter (`playtestSeq`, `apps/worker/src/do/session.ts`) restarts after a Durable Object eviction while the run id survives, and that new frames then arrive as seq 1, 2, ... under a run id the page holds; that was taken from the finding and was not read in the worker. **The key is now run, counter and the capture time** (`sameFrame`, `lib/studio-shots.ts`). A true replay carries the capture's own time, so an exact replay of the whole ring still adds nothing. Pixels are not part of the playtest key (a long string compared on every replayed frame): within one run the worker gives every frame the next counter value, so two frames of one run never share one. |
| "No screenshots were taken for this request" can be false | It can: frames are held in the page's memory only and a reloaded conversation carries its tool steps, not its frames, so a build that did capture Studio, opened again after a reload with Studio closed, was told none were taken. **The line now says only what the page knows:** "No screenshots to show for this request: they are kept only while this tab stays open, so a reload clears them. To see them next time, connect Studio and keep this tab open during the request." The constant is `SHOTS_NONE_HERE` (it was `SHOTS_NONE_TAKEN`). The line is still drawn only when Studio is not connected; with Studio connected and nothing held, nothing is drawn (as in 12.4). A source test holds the fact the sentence rests on (the page sets its frames from the socket and from the development fixture, nowhere else), so if a later change keeps frames across a reload, the test fails and the sentence must be re-worded with it. **Not decided here:** keeping frames across a reload at all (it would need storage or a worker read, and `SHOTS_KEPT` says this page saves nothing). |
| The Roblox link's rule also restyled the six primary anchor buttons | `.auth-page a.btn { border: 1px solid var(--control-line); line-height: 20px }` was meant for the Roblox link and also reached every `<Link className="btn btn-primary btn-block">` (`/confirm`, `/reset`, the recovery and the check-email screens): their accent border became the faint hairline and 47.7px became 46px. **The rule is on a class of its own, `auth-roblox-link`, which only the Roblox anchor wears.** Measured in Chromium on `/app/reset`: with the old rule `1px solid rgba(255, 255, 255, 0.12)` and 46px; now `1px solid rgb(166, 124, 255)` and 47.7px; the Roblox, Google and Discord buttons still measure `1px solid rgb(55, 59, 68)`, 20px, 46px. The restated test checks the property (no rule of the sheet gives a border or a line height to every anchor button; one element wears the class) and not the rule's text. |
| `LEGAL-CLAIMS.md` cited `auth-pages.tsx` one line off, and nothing guarded it | The six cites are corrected, and **every line cite into a file of `apps/web/src` now carries the symbol it points at in the same code span** (`` `auth-pages.tsx:854 supabase.auth.signUp(` ``). `apps/web/tests/legal-claims-cites.test.mjs` reads each one: the text must be on the cited line (or one of a range's lines), a cite with no symbol fails, and a bare `:NNN` continuation fails; the message says where the text is now. It covers 27 cites in six files (10 of them `auth-pages.tsx`) (`auth-pages.tsx`, `age-gate.ts`, `auth-providers.ts`, `identity-card.tsx`, `roblox-signin.ts`, `settings.tsx`). **Four `settings.tsx` cites (display name, the Roblox card, the improvement-data row and its mutation) were already stale on main (`settings.tsx:2148` is a blank line there); they are repaired because the guard covers every app file.** The worker's cites are not read (their lanes own them), and a file name the worker shares (`turnstile.ts`, `index.ts`) is ambiguous and is skipped. What the guard cannot do: a symbol that is also on the cited line for another reason passes, and it says where the code is, not that the sentence beside it is still true. |

**Left as it was and said so:** `empty-state-model.ts`'s help links (the site lane repoints them), the legal pages and `apps/site` (other lanes own them).

### 12.11 Fix cycle 3 (2026-10-05): what the fourth check of this branch changed

The cycle 3 check (a checker, and a regression hunter whose findings two skeptics each confirmed) found two claims in the cycle 2 work that were false or unguarded, four minor
items and four guards that did not go red. The counts, the planted breaks and the screenshots are in `TEST-LEDGER.md`, "Fix cycle 3". Nothing in the worker, the legal pages or
`apps/site` was touched.

| Finding | What was decided or done |
|---|---|
| The playtest-counter restart that the cycle 2 key guards against cannot happen in the worker | **Confirmed by reading the worker, and the rationale is withdrawn.** A frame is published under a playtest run id by one place only, `PlaytestBus.captureFrame` (`session.ts`); it returns false when the run's frame gate (`this.frameRate`) is null, and `canCapture()` is false then too. The gate is declared null and assigned only in `begin()`, which also mints a new run id and zeroes `playtestSeq`; the boot restore brings back the stored run (`playtestRunBacking`) and neither the gate nor the counter; the whole playtest loop runs inside one `run_and_check` call, which calls `begin()` once. So after an eviction nothing more is published under the old run id, and a later playtest has a new one: "the same run id with seq 1 again" is a state the worker does not reach, and the cycle 2 note that it was "reproduced as the checker described it" reproduced a state the worker cannot be in. The comment on `sameFrame`, the test's header, its comment and its title, and the 12.10 row now say it is **a defence** that stops the key from mistaking a new capture for a replay if a counter ever restarts under a run id the page holds, and that it answers nothing the worker does today. The same note had said "one millisecond"; the Studio plugin stamps `capturedAt` in whole seconds (`os.time() * 1000`, `StudioCapture.luau`), and the comparison is exact, so no window of any size is right. **Not decided here and not done:** making the restart real by persisting the gate and the counter across an eviction (a worker change with its own suite; nobody asked for it, and the page's key already survives it). |
| `THE LINE RESTS ON THIS` did not go red when frames were kept across a reload | It counted `setFrames(` calls and used a regex that cannot cross the `)` of `() =>`, so `useState<StudioFrame[]>(() => JSON.parse(sessionStorage.getItem(...)))` with an effect that wrote it back kept the frames across a reload and the whole web suite stayed green (the checker ran exactly that). **Restated as the property, read from the syntax tree:** the one state declaration starts from the literal `[]`; its setter is only ever called, twice (the development fixture under `if (MOCK_MODE)`, and the `studio_frame` message through `appendFrame`); its value is read once, as a plain member of the object the hook returns; and the workspace takes it by its own name with no default. Any new reader or setter fails it, which is meant: when it fires the review is whether the change keeps frames across a reload, and if it does the finished-turn sentence is re-worded with it. The checker's break (lazy initializer plus an effect) and seven more are planted in `TEST-LEDGER.md`. |
| The finished-turn "connect Studio" line can show while the page is still loading | It could: `studio.connected` starts false and becomes true only when the socket says so, so after a reload a finished build turn drew the two-line "To see them next time, connect Studio" prompt and then took it back. **The hook now keeps `studio.known`**: false until the worker has said, on the open socket, whether Studio is connected (`hello` or `studio_status` sets it), and false again when the socket closes (a reconnect is a time nothing is heard). The workspace hands it to the latest turn and the strip draws **no line at all** while it is false, finished or running; once it is true the lines are what they were. A frame the page holds is shown whatever it has heard. The mock app is always known. The hook is not run under `node --test` (it needs more of React than the harness stands in for), so its three settings are read from the syntax tree and the decision, the strip and the turn are run. |
| Primary anchor buttons 47.7px tall beside 46px `<button>`s | **Fixed, and the cycle 2 rule that blocked it is gone.** A `<button>` has a 20px line from the `button` element rule (`system.css`); an anchor inherits the page's 1.55, which at 14px is 21.7px, so the check-email card's "Send it again" (a button) sat 1.7px under "Go to sign in" (an anchor). `.auth-page a.btn-block { line-height:20px }` gives every full-width anchor the button's line; the Roblox rule keeps only the hairline. **This changes the six primary anchor buttons from 47.7px to 46px**; their accent border is untouched (measured, `TEST-LEDGER.md`). That is a decision: cycle 2 had asked that they keep their height, which meant the height they had on main, and on main they were 1.7px taller than the button next to them. If the owner prefers the old height, delete the one rule and the test's line check. |
| The Roblox-anchor matcher did not see a child combinator | It split on whitespace and needed three exact container names. **Replaced by a small selector matcher** (`couldReach`, `auth-providers.test.mjs`): it tokenises a selector, reads `>`, `+` and `~` as combinators, handles `:not`, `:is`, `:where`, attributes and pseudo-elements, and asks whether the selector could match a primary anchor button standing in the page's real chain (page, form column, card, anchor), over-approximating what it cannot model. It is run on 18 selectors that must reach and 13 that must not (`.auth-page .auth-card > a` among the first), and on four that reach a primary `<button>` too and five that reach the anchor alone. The rule it enforces changed with it: **no rule may give the anchor a border that the primary `<button>` does not also get**, which is the defect, and not "no rule may touch an anchor button", which blocked a legitimate fix. A design change that styles both alike (`.auth-page .btn-primary { border-color: ... }`) is therefore allowed on purpose. The line a `<button>` has and the button's hairline are read from `system.css`, not written in the test. |
| 12.4 and the test header still gave a reason 12.10 says the page cannot know | Both now say "once a finished turn holds none and Studio is connected", as the strip's source does. |
| Four guards that did not go red | `1g` (a time window of 5 s): the test now asserts that captures 1 ms, 1 s and 4.999 s apart are distinct, so a window of any size under five seconds goes red. `2e`: the item above. `3j` (a `.btn-primary` border rule): **not a defect, left green by design**: it styles the primary button and the primary anchor alike, which cannot make them differ. `4e` (a cite written outside a code span): a scan for cites into an app file outside a span or deep inside one now fails (`unreadCites`), run on the document and on a sample with three of them. |
| A process note from the checker: its first copy partly deleted another checker's working copy | Not a defect in the branch. This lane's probes this cycle were kept in their own folder (`probes/app/fix2r2/`) and nothing under `probes/app/check1/` was touched. |

**Left as it was and said so:** `empty-state-model.ts`'s help links, the legal pages and `apps/site` (other lanes own them); the worker (no change, so the worker suite was not run).
