# OWNER HANDOFF

Every row here is an action only a human can take. Each carries six fields, and a row without a
re-probe from the current pass is an escape hatch rather than a handoff — so each records what was
measured, when, and with what command.

A handoff never blocks another lane and never excuses the engineering beneath it. The work on this
side of each blocker is listed, so the day the action is taken there is nothing left to build.

Regenerated every pass. Last regenerated: **pass 2**.

---

## OH-1 · ~~The free plan cannot complete a single build~~ — CLOSED 2026-09-14

**Closed by.** The owner's "choose whatever on that pricing" in session on 2026-09-14, recorded
with his exact words in `docs/DECISIONS.md`. Free is now 231 Credits a day — three whole builds —
and 2,310 a month.

**Verified.** `node scripts/check-offer.mjs` prints `ok  free: 231 Credits/day affords 3 build(s)`.

**Measured this pass (2026-09-14, UTC):**

```
BROKEN: the free plan grants 60 Credits/day and one quality-gated build costs 77 —
a free user cannot complete a single build in a day
```

Derived, not asserted: `PLAN_LIMITS.free.creditsPerDay = 60`, `CREDITS_PER_BUILD = 77`, so
`buildsPerDay('free') === 0`.

**Rows it unblocks.** 1 — `G-OFFER-1`. It also decides whether S1's published free quota can be
stated at all, since a page advertising a free tier that finishes nothing is a page that misleads.

**Already built on this side.** The whole ladder is shared (`PLAN_LIMITS` in `@golem/shared`, read
by `QuotaDO` and by every surface), the arithmetic is derived rather than restated
(`buildsPerDay`/`buildsPerMonth`), and the checker that measures the violation exists and is red.
The only missing input is the number, which §12.5 reserves to you.

**Why this is not mine to fix.** Raising the allowance is a commercial decision with a direct cost:
at 77 Credits/day the free tier costs $0.025/user/day to serve. Lowering `CREDITS_PER_BUILD` instead
would mean making builds cheaper, which is engineering — but choosing *that* over raising the
allowance is still your call, because the two have different bills.

---

## OH-2 · ~~Two plans promise more per day than the service can serve~~ — CLOSED 2026-09-14

**Closed by.** Lowering the allowances, not raising the bill. Team and Enterprise are gone; the
plan set is free / builder / studio / enterprise and every row is under the 833 Credits/day the
service can actually serve. See `docs/DECISIONS.md`.

---

## OH-9 · The budget supports a hobby; the plans describe a business

**This is the one decision only you can make, and it is the successor to OH-2.**

`BILLABLE_NEURONS_PER_DAY` is 15,000, sized in its own comment to cap your AI bill at about
**$5.02 a month**. With the free 10,000/day Cloudflare allocation that is 25,000 neurons a day:

  833 Credits a day · 25,323 a month · **about 329 quality-gated builds a month, for every user
  combined.**

The plans now fit inside that, so nothing is broken. But it means the service can carry roughly
**one** paying Builder customer before free users start being turned away, because that customer's
12,600 Credits is half of everything there is.

What each tier would cost you to actually FILL, at $0.00033 a Credit:

| tier | Credits/month | cost to serve one customer | price | margin |
|---|---|---|---|---|
| free | 2,310 | $0.76 | $0 | — (acquisition) |
| builder | 12,600 | $4.16 | $12 | 2.9× |
| studio | 21,000 | $6.93 | $40 | 5.8× |

Ten Builder customers is $41.60/month of AI against $120 of revenue — profitable, but it needs
`BILLABLE_NEURONS_PER_DAY` at roughly **126,000**, which is 8.4× today's ceiling.

**Why I did not do it.** It is your money, and BudgetDO is not one safety net among several: AI
Gateway is on Standard billing with uncapped overage, so this ceiling is the only thing between a
runaway loop and a real bill. It is the single change in this repository that can cost money while
every test stays green.

**The action.** Decide the maximum monthly AI spend you will accept, and set
`BILLABLE_NEURONS_PER_DAY = (that number in dollars) / 0.011 × 1000 / 30.4`.

**Approve-by test.** `node scripts/check-offer.mjs` stays coherent at any ceiling — this is not a
correctness question, it is a capacity one. The number to watch is how many customers you can
serve, which is `DAILY_NEURON_CEILING / 30 / (a plan's creditsPerDay)`.

**Measured this pass (2026-09-14, UTC):**

```
BROKEN: team grants 1500 Credits/day but the WHOLE SERVICE can serve 833
BROKEN: enterprise grants 6000 Credits/day but the WHOLE SERVICE can serve 833
```

The service ceiling is `DAILY_NEURON_CEILING` = 10,000 free + 15,000 billable = 25,000 neurons,
which at `NEURONS_PER_CREDIT` = 30 is 833 Credits **for every user combined**. A single Team
subscriber using their allowance would exhaust the entire day for everyone.

**Rows it unblocks.** 1 — `G-OFFER-1`. S10 also depends on it: a refusal that says "you are out of
Credits" when in fact the *service* is out is the wrong sentence, and the user cannot act on it.

**Already built on this side.** BudgetDO enforces the ceiling and is the only spend guard (AI
Gateway is on Standard billing with uncapped overage, §1.1). The kill switch, the per-request
reservation cap and the daily/monthly ledgers all work. What is missing is only the relationship
between what a plan sells and what the guard permits.

**The trade, costed, so the decision is one line.** 15,000 billable neurons/day ≈ $5.02/month at
$0.011/1,000. Serving one Team subscriber's full daily allowance needs 45,000 neurons/day, ≈
$15/month of inference against a $49 price. The margin is there; the ceiling simply was not raised
when the ladder was.

---

## OH-5 · Generated images are kept for one hour

**The action.** Decide how long a generated image is retained, and either raise
`IMAGE_TTL_SECONDS` or accept that images disappear from a conversation after an hour.

**Approve-by test.** `node -e "import('./apps/worker/src/imagegen.ts').then(m => console.log(m.IMAGE_TTL_SECONDS))"`

**Output that means done.** A value the owner has chosen, rather than the default.

**Measured this pass (2026-09-14, UTC).** `IMAGE_TTL_SECONDS` is 3,600. The panel that displays an
image lives as long as the conversation, which is unbounded. So scrolling back to yesterday's work
is the NORMAL path for a returning user, not an edge case — and S12 is precisely the station that
asks whether a returning user finds their session intact.

**Rows it unblocks.** S12's image half. Not S12 itself: quota, conversation, memory and export have
no retention logic at all, so they are true across a day boundary by construction.

**Already built on this side.** The image is stored scoped to its project and served by an
authenticated route — `GET /api/projects/:id/images/:imageId`, added this pass. Before that there
was no image route in the worker at all: `generate_image` parked PNGs in KV and handed back a key
that nothing could redeem, so every generated image was unreachable.

**On the client half, and a correction I got wrong in both directions.** This row also claims the
client shows alt text and says images are kept for an hour when the fetch fails, "with that
sentence checked against the constant so moving the TTL without moving the copy fails a test".

I could not find any of it on main and struck it as an overstatement. That was wrong. It is real,
tested code on `grow/main` — `SafeImage` in `apps/web/src/lib/generative-ui/render.tsx` renders the
alt text on the failed branch, and `apps/web/tests/image-expiry.test.mjs` imports
`IMAGE_TTL_SECONDS` from the worker and asserts the copy against it. So the sentence was a
measurement of a branch, not a memory dressed as one.

It is restored, SCOPED: true on `grow/main`, not yet on main. Both of my readings were wrong in
the same way — I checked one tree and reported a conclusion about the repository. A claim about
"the client" in a multi-branch repo has to name the branch, or it is unfalsifiable by whoever
reads it next.

Nothing in OH-5 waits on the number; the retention value is the only missing input.

**The trade, costed.** KV storage against images up to ~1 MB each. At one image per build and the
free tier's current allowance, a 30-day retention is under 1 GB per active free user per month.
The number is yours because it is a storage bill, not an engineering constraint.

---

## OH-6 · One pixel metric, two implementations — RESOLVED, not an owner action

**Status.** Closed this pass. It was never owner-blocked: the row said so when it was written
("the decision of which implementation survives is an engineering one this session will make"),
and carrying it here for three passes was a stall, which the escape-hatch checker eventually said
out loud.

**What was decided.** `geometryMask`, `SKY_RGB` and `GROUND_RGB` now have ONE implementation, in
`packages/design/src/pixels.mjs`. Both former copies — `apps/worker/src/composition.ts` (what the
product believes about a build) and `packages/evals/src/props.mjs` (what the offline grader
believes) — import it. They had to agree: a grader whose mask differs from the product's is a
grader whose scores do not predict the product.

**Why the design package.** It is the only package both consumers already depend on, so the shared
module needed no new workspace wiring. A dedicated `@golem/pixels` package would carry a better
name; that is recorded as reversible, and moving it later is an import rewrite in two files.

**What keeps it closed.** `tests/pixel-primitives.test.mjs` asserts each name is defined exactly
once, with a positive control that both consumers still import AND still call it — an absence
check alone cannot tell "deduplicated" from "quietly removed". The hand-written ambient
declaration the worker typechecks against is the one seam the dedup could not remove, so its
exported names are compared against the module's. Falsified: reintroducing a second `SKY_RGB` in
composition.ts turns it red.

---

## OH-3 · Stripe live keys

**The action.** Provide Stripe **live** publishable and secret keys, and the live webhook signing
secret. Test-mode keys are *not* this row — everything on the paid path ships and is probed in test
mode, and only the live-key swap is yours.

**Approve-by test.** `node infra/smoke.mjs --no-model` reports the billing route configured, and
`GET /api/me` reflects an entitlement granted by a test-mode webhook.

**Output that means done.** A checkout session URL returned by the deployed worker.

**Measured this pass.** NOT PROBED. The deployed origin was not contacted this pass; the §10.2 drift
invariant is itself outstanding. This row therefore does not yet meet §13.3 and is listed as an
opening balance, not as a satisfied handoff.

**Rows it unblocks.** S11, and every billing row behind it.

**Already built on this side.** `apps/worker/src/billing.ts` verifies a Stripe signature over the
raw body with a replay window, interprets the event, and recomputes entitlement rather than
trusting the payload's plan field. Tested, including forged, stale and tampered payloads. What does
not exist yet is anything that CREATES a checkout session — that is engineering, mine, not this row.

---

## OH-4 · Creator Store plugin distribution

**The action.** Enable Creator Store distribution for the plugin asset.

**Approve-by test.** The Roblox toolbox-service details endpoint for the asset id returns 200 rather
than 404, with a known-listed control asset returning 200 in the same run — the control is what
distinguishes "not distributed" from "the endpoint moved".

**Output that means done.** HTTP 200 for our asset id.

**Measured this pass.** NOT PROBED. Opening balance, as OH-3.

**Rows it unblocks.** S5's "installable by a stranger" clause only. It does NOT block S5–S9 as a
whole: those are proven against a locally sideloaded `.rbxm`, and if that artifact cannot be
sideloaded then it is an engineering defect in the artifact, not this row.

**Already built on this side.** The pairing flow, the plugin protocol and the tool surface all work
against a sideloaded build.

---

## Notes on what is NOT here

**The generated-asset upload path is not a handoff.** It is a design choice between two routes, and
§13.2 says a row whose blocker is a design choice is not owner-blocked: the cheaper branch gets
built completely and the other is recorded as reversible.

**AI Gateway billing mode is not yet a row.** `apps/worker/src/do/budget.ts`, `docs/SECURITY.md` and
`BLOCKERS.md` are reported to contradict each other on it. That contradiction is mine to resolve by
re-probing all three before asking you anything.
