# OWNER HANDOFF

Every row here is an action only a human can take. Each carries six fields, and a row without a
re-probe from the current pass is an escape hatch rather than a handoff — so each records what was
measured, when, and with what command.

A handoff never blocks another lane and never excuses the engineering beneath it. The work on this
side of each blocker is listed, so the day the action is taken there is nothing left to build.

Regenerated every pass. Last regenerated: **pass 2**.

---

## OH-1 · The free plan cannot complete a single build

**The action.** Decide the free tier's daily Spark allowance, and either raise it to at least one
whole build or accept that free users cannot finish one.

**Approve-by test.** `node scripts/check-offer.mjs` — takes under five seconds.

**Output that means done.** The line beginning `BROKEN: the free plan grants` no longer appears.

**Measured this pass (2026-09-14, UTC):**

```
BROKEN: the free plan grants 60 Sparks/day and one quality-gated build costs 77 —
a free user cannot complete a single build in a day
```

Derived, not asserted: `PLAN_LIMITS.free.sparksPerDay = 60`, `SPARKS_PER_BUILD = 77`, so
`buildsPerDay('free') === 0`.

**Rows it unblocks.** 1 — `G-OFFER-1`. It also decides whether S1's published free quota can be
stated at all, since a page advertising a free tier that finishes nothing is a page that misleads.

**Already built on this side.** The whole ladder is shared (`PLAN_LIMITS` in `@golem/shared`, read
by `QuotaDO` and by every surface), the arithmetic is derived rather than restated
(`buildsPerDay`/`buildsPerMonth`), and the checker that measures the violation exists and is red.
The only missing input is the number, which §12.5 reserves to you.

**Why this is not mine to fix.** Raising the allowance is a commercial decision with a direct cost:
at 77 Sparks/day the free tier costs $0.025/user/day to serve. Lowering `SPARKS_PER_BUILD` instead
would mean making builds cheaper, which is engineering — but choosing *that* over raising the
allowance is still your call, because the two have different bills.

---

## OH-2 · Two plans promise more per day than the service can serve

**The action.** Either raise `BILLABLE_NEURONS_PER_DAY` in `apps/worker/src/pricing.ts` — which
raises your maximum monthly bill — or lower the Team and Enterprise daily allowances.

**Approve-by test.** `node scripts/check-offer.mjs`

**Output that means done.** No line beginning `BROKEN: team grants` or `BROKEN: enterprise grants`.

**Measured this pass (2026-09-14, UTC):**

```
BROKEN: team grants 1500 Sparks/day but the WHOLE SERVICE can serve 833
BROKEN: enterprise grants 6000 Sparks/day but the WHOLE SERVICE can serve 833
```

The service ceiling is `DAILY_NEURON_CEILING` = 10,000 free + 15,000 billable = 25,000 neurons,
which at `NEURONS_PER_SPARK` = 30 is 833 Sparks **for every user combined**. A single Team
subscriber using their allowance would exhaust the entire day for everyone.

**Rows it unblocks.** 1 — `G-OFFER-1`. S10 also depends on it: a refusal that says "you are out of
Sparks" when in fact the *service* is out is the wrong sentence, and the user cannot act on it.

**Already built on this side.** BudgetDO enforces the ceiling and is the only spend guard (AI
Gateway is on Standard billing with uncapped overage, §1.1). The kill switch, the per-request
reservation cap and the daily/monthly ledgers all work. What is missing is only the relationship
between what a plan sells and what the guard permits.

**The trade, costed, so the decision is one line.** 15,000 billable neurons/day ≈ $5.02/month at
$0.011/1,000. Serving one Team subscriber's full daily allowance needs 45,000 neurons/day, ≈
$15/month of inference against a $49 price. The margin is there; the ceiling simply was not raised
when the ladder was.

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
