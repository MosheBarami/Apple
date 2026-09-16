# Release acceptance — the owner's scenarios, as things that run

`docs/backlog/CHECKLIST-V2.md` section **60. END-TO-END RELEASE ACCEPTANCE** names twenty
user-visible outcomes. Until now they were twenty sentences. They are now twenty runnable cases in
`packages/evals/src/acceptance.mjs`, executed by `packages/evals/src/acceptance.test.mjs` inside
`pnpm -r test`, and reported with the success metrics by `packages/evals/src/success-metrics.mjs`.

```sh
pnpm --filter @golem/evals acceptance   # the twenty, as tests
pnpm --filter @golem/evals metrics      # the report: scenarios + section 53's measures
pnpm --filter @golem/evals metrics -- --json
```

Nothing here calls a model, opens a socket, or spends anything. The scenarios drive the real
worker modules through esbuild and the real Hono app with a real ES256 JWT and a stubbed PostgREST;
`globalThis.fetch` is replaced for the duration of each HTTP scenario and restored afterwards.

## What a green line means, and what it does not

A pass is **the named mechanism holding, measured offline against the committed source**. It is not
a stranger completing the journey on the deployed product. Every scenario carries a `notChecked`
sentence naming the part no offline check can see, and the report prints it under the verdict. The
brief marks thirteen of these twenty items `~` — real code that stops short — and a harness that
asserted the built half and then reported the whole item green would be the exact defect this
repository keeps finding.

## The one skip, and why it is not a gap in the harness

**Scenario 2 · Invited member joins the intended organization with correct access** does not run.
The owner dispositioned three-level tenancy as not-built on 2026-09-15 (`docs/design/TENANCY.md`);
the schema is flat (`profiles` → `projects`) and there is no organizations table, so there is no
organization to join. The equivalent capability the owner did build is per-project sharing, which
scenario 15 checks.

The skip carries a guard: `guardSkipReason()` greps `infra/supabase/migrations` for an
organizations table and **fails the test** if one appears. The day the reason stops being true, the
suite says so instead of carrying a stale excuse.

## Falsification

Every scenario was made to go red by breaking the mechanism it names, with one uniquely-anchored
string replacement, reverted byte-for-byte (sha256 compared before and after). Each row below was
observed `before=green mutated=red restored=green`.

| # | scenario | mechanism broken |
|---|---|---|
| 1 | New user completes registration… | `apps/web/src/app.tsx` — `<Route path="/confirm"` renamed |
| 2 | Invited member joins the intended organization… | a `create table public.organizations` migration added, so the skip reason goes stale |
| 3 | Returning user resumes the correct project… | `apps/worker/src/index.ts` — the messages route answers an invisible row `200` instead of `404` |
| 4 | User installs the Studio plugin and pairs… | `apps/worker/src/studio-place.ts` — `servesOps` returns `true` unconditionally |
| 5 | User sees accurate connection and capability status | `apps/web/src/lib/studio-connection.ts` — `disconnected` collapsed into `not-connected` |
| 6 | User submits a request with relevant project context | `apps/worker/src/prompts.ts` — the project name dropped from the system prompt |
| 7 | Agent presents an actionable plan with visible cost… | `apps/worker/src/run-intent.ts` — the checklist emptied |
| 8 | User approves the exact operations that require consent | `apps/worker/src/preferences.ts` — `'ask'` no longer withholds the tool |
| 9 | Approved operations execute against the intended Studio… | `apps/worker/src/tools.ts` — the `studioConnected` clause dropped from `toolDefs` |
| 10 | Studio changes produce persisted and inspectable results | `apps/worker/src/do/session.ts` — the automatic pre-run checkpoint renamed away |
| 11 | Verification reports distinguish passed, failed, unverified | `apps/worker/src/vision.ts` — the `unavailable` branch made unreachable |
| 12 | User can inspect supporting evidence and operation history | `apps/worker/src/op-attribution.ts` — every op kept, none dropped |
| 13 | User can reverse changes and verify restored state | `apps/web/src/lib/restore-status.ts` — a noted restore reported `good` |
| 14 | Interrupted runs recover without duplicate writes or charges | `apps/worker/src/single-flight.ts` — an `await` inserted before the flag is set |
| 15 | Collaborators receive only the access granted to them | `apps/worker/src/collab.ts` — `manage_members` granted to `editor` |
| 16 | Plan limits are enforced consistently… | `apps/worker/src/quota-math.ts` — `Math.min` on the two limits became `Math.max` |
| 17 | Purchases update entitlements and credit balances accurately | `apps/worker/src/billing.ts` — the lapsed-period check made unreachable |
| 18 | Cancellation, downgrade, and payment failure… | `apps/worker/src/dunning.ts` — the first-attempt suppression removed |
| 19 | Data export and deletion complete across… storage | `apps/worker/src/erasure.ts` — `ACCOUNT_RESIDUE` emptied |
| 20 | Production incidents are detected, communicated, recoverable | `apps/worker/src/notifications.ts` — `email` offered as a channel while listed unbuilt |

The report's own honesty rule is falsified the same way: emptying `notMeasured`'s reason, replacing
a counted value with a plausible rate, and letting a count drift from the list it counts each turn
`success-metrics.test.mjs` red.

## Success metrics

`success-metrics.mjs` prints three things against the commit and date it measured:

1. **Release acceptance** — the twenty scenarios, pass / fail / skip, each with what it checked and
   what it did not.
2. **The brief's own completion figure** — recomputed from the marks in the checklist rather than
   read from the total typed at its top, and compared against that total.
3. **Section 53 · PRODUCT ANALYTICS** — the twenty measures the brief names, each either a real
   number with the method under it, or `not measured, because <reason>`.

Seventeen of the twenty land in the third category, and the reason is structural rather than
incidental: `EVENT_KINDS` in `apps/worker/src/analytics.ts` is `request, model_call, error, build,
audit` — five infrastructure events and not one product event. There is no signup, activation,
pairing, conversion or retention event anywhere in the tree, so there is nothing behind a funnel
figure to compute it from, and no production datastore is reachable from an offline report anyway.
Where a modelled figure exists and the observed one does not — the credit cost of a build, for
instance — the reason is printed first and the model is a labelled note beneath it, never the other
way round.

## Milestones

The third unimplemented section of the brief is not covered here. `MILESTONES` in the product sense
is built (`apps/worker/src/roadmap.ts` + `apps/web/src/components/roadmap/`); a milestone *plan for
the mission* is a scheduling artefact, not something a harness can execute, and inventing one would
be inventing work the brief does not name.
