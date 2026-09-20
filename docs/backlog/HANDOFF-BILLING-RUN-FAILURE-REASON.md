# Handoff — a refunded run records that it failed and never records why

**Written 2026-09-21 by the billing lane. `apps/worker/src/do/session.ts` was dirty with another
lane's step-level retry ladder, so this is a patch described rather than applied.** Nothing here is
started. Apply it whole or not at all: the analytics half without the session half ships a field
nothing writes, which this repository already calls a field rather than a disclosure.

## The defect

A run that fails and is refunded writes down THAT it failed and never WHY.

`finishRun` already has the reason. It takes `error?: RunFailure` — one of `busy`, `interrupted`,
`dropped_step`, `model_failed` (`RUN_FAILURES`, `packages/shared/src/index.ts:2634`) — and every one
of its four `'error'` call sites passes one. That code reaches two places:

* `messages.run_failure`, per run, in the session's own SQL, and
* the `msg_end` frame, to whoever has the socket open at that instant.

It reaches the BUILD LOG nowhere. `recordEvent({ kind: 'build', … })`
(`apps/worker/src/do/session.ts:4453`) writes `outcome` and `finishReason` and stops:

```ts
      outcome: reason === 'done' ? (buildOutcome ?? 'done') : reason,   // :4454
      finishReason: agent.lastFinishReason ?? null,                     // :4455
```

`outcome` is the bare string `'error'`. `finishReason` is the PROVIDER's last word and is null on
exactly the failures that matter most here — a `busy` refusal never reached the model, and an
`interrupted` run was evicted between steps, so neither has one. So `GET /api/admin/analytics` and
`buildRollup` (`apps/worker/src/analytics.ts:1233`) can report how many runs failed and cannot
report a single reason for any of them.

The refund's own oplog row has the same hole. `apps/worker/src/do/session.ts:4360` writes

```
run produced no usable output (${buildOutcome ?? reason}); asked N, returned M
```

which for every one of these runs renders as `(error)`.

**Why it is billing's problem and not observability's.** Refunding is the right behaviour and it is
live. But a refund is money moving, and the product now cannot answer "what did we give Credits
back FOR" beyond the word `error` — so `busy` (a free provider refusal that should never have ended
a run at all) is indistinguishable in the record from `model_failed` (a real fault), and the owner's
own question — *"why do runs constantly fail and charge credits"* — is unanswerable from the data
the product keeps. It is also the only thing that would show whether the new retry ladder is
working, because the ladder's success is exactly a fall in `busy`.

## The patch

### 1. `apps/worker/src/analytics.ts` — carry the code (clean file, safe to do first)

Add to `interface BuildEvent`, beside `finishReason: string | null;` at **:375**:

```ts
  /**
   * The product's OWN classification of a failure — 'busy', 'interrupted', 'dropped_step',
   * 'model_failed' — or null on a run that did not fail, or one persisted by an older deploy.
   *
   * Distinct from `finishReason`, which is the PROVIDER's last word and is null on precisely the
   * failures this answers: a rate-limit refusal never reached the model and an evicted run never
   * came back to ask it. `outcome: 'error'` on its own is a count of failures with no reason
   * attached to any of them.
   */
  failure: string | null;
```

And in the `case 'build':` branch of the event validator, beside **:497**:

```ts
          // Bounded like finishReason, and free-form for the same reason in reverse: RUN_FAILURES
          // is OURS and will grow, and a validator that rejected a code it had not been told about
          // would silently drop the newest failure class — the one somebody is looking for.
          failure: readText(o['failure'], 32),
```

Then, in `buildRollup` (**:1233**), add a third bucket next to `byOutcome` and `byFinishReason`:

```ts
    byFailure: errorBuckets(
      builds.filter(failed).map((b) => ({ key: b.failure ?? 'unstated', fatal: true })),
      builds.filter(failed).length,
    ),
```

`'unstated'` rather than `'none'`, and computed over FAILED builds only: a successful run has no
failure and counting it as one would put the product's success rate into a failure breakdown.
`byFinishReason` uses `'none'` because a run that never reached inference genuinely has no provider
finish reason; a failed run always has a reason and `unstated` means we did not write it down.
Declare `byFailure: ErrorBucket[];` on `BuildRollup` beside **:1228**.

### 2. `apps/worker/src/do/session.ts` — ONE LINE (the dirty file)

In the build `recordEvent`, between **:4454** and **:4455**:

```ts
      outcome: reason === 'done' ? (buildOutcome ?? 'done') : reason,
      failure: error ?? null,
      finishReason: agent.lastFinishReason ?? null,
```

`error` is the `RunFailure` parameter `finishRun` already has in scope. Nothing else changes: it is
not recomputed, not widened, and not defaulted to a placeholder — a run with no classification
records null, and `byFailure` counts it as `unstated` rather than inventing a cause.

### 3. The guard

A test that is only satisfiable by the whole patch, and that fails on the half:

* Drive `finishRun` through the existing SessionDO harness (the one `run-refund.test.mjs` already
  bundles) on a run that ends `('error', 'busy')` having applied nothing, and assert the recorded
  build event carries `failure: 'busy'` — not merely that the field exists.
* **Non-vacuity:** assert at least one FAILED build event in the fixture carries a non-null
  `failure`, so a scan reading the wrong events fails as a blind scan rather than passing as a clean
  product.
* **The control:** a run that ends `'done'` records `failure: null`, so the field cannot be
  satisfied by writing a constant.
* Watch it go red by deleting the `failure: error ?? null` line, and restore byte-identical.

## What was verified, and what was not

**Verified, 2026-09-21, read-only.** Every `finishRun(agent, 'error', …)` call site in session.ts
passes a `RunFailure`: `:3273 interrupted`, `:3325 busy`, `:3338 dropped_step`, `:3360
model_failed`. So the code exists at the moment the build event is written and the patch above is
a pass-through, not a new classification.

**Could not measure: how often this bites.** `GET /api/admin/logs?kind=build&days=30` against the
live apple worker returns 3 events, because the event window is capped at 5,000 rows and 3,219
requests in three hours fill it. The frequency of `outcome: 'error'` over a real day is not
knowable from the deployed log today, and no number should be quoted for it.

**A note for the lane holding session.ts.** Your step-level ladder's billing claim — "the request
never reached the model, nothing was billed, and gateway.ts has already handed the reservation back
before it throws" — was checked and holds at both levels. `release(env, reserved)` runs before
`throw new RateLimitedError` (`gateway.ts:492,506`), and the user's own Credits are settled at
`session.ts:3661-3675`, which is BELOW the model call your `StepRefusedError` is thrown from, so a
resumed step cannot re-charge. The 1-Credit admission debit is taken once per message at `:3025`,
in the chat handler, which an alarm-driven resume does not re-enter. The gateway half of that
property is now asserted executably in
`apps/worker/tests/retry-does-not-multiply-the-bill.test.mjs`; **the step-level half is not**, and
a test that your ladder does not re-charge `quotaSpend` is worth writing while the code is in your
hands.
