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
  identity linking is enabled at the project.
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
- **Roblox, Google and Discord sign-ups need no form.** Roblox's OAuth service is for accounts held by people aged 13 and older,
  and Google and Discord already require their account holders to be at least that old (plan section 7). Asking again would
  collect a birth date nobody needs. The privacy pages say so.
- **Existing accounts are not asked again.** They have the pages' 13-and-older terms already, and the flag lives only in the
  user metadata of an account made after this change. *Alternative: ask at the next login.* It would have to ask every account that
  lacks the flag, once, before the app opens, and write the answer back (`updateUser`), which blocks people who are mid-build on a
  question the terms already answer. Revisit when the server stores the flag.
- **No migration.** Whether the server copies `age_gate` into `profiles` (and whether the Worker refuses an account without it) is a
  later step. The flag is client-supplied: any API caller can set it or leave it out. It is a record that the form was passed, not proof.
- **Pages changed because this made them false.** `/privacy` and `/docs/privacy-and-data` said the sign-up form asked for nothing
  but an address and a password; they now describe the date of birth, that it is checked in the browser and never sent or stored,
  that a pass leaves one note on the account, that a refusal leaves a flag in the browser, and that the other ways in rely on their own
  age rules. `apps/site/tests/privacy-claims.test.mjs` was re-aimed (it said "no birth-date field while the form has none").

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
- **Not verified live:** the two queries it makes (`projects` read by name, then one insert) run under the signed-in person's
  row-level security exactly as the old dialog's insert did; no database was touched in this task.
