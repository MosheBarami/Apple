# Live agent probe against the deployed product, 2026-09-21

Ledger row `live-agent-probe-from-the-site`, which was NOT-STARTED. The owner's instruction:

> אני פוקד עליך לבדוק את הagent לא מהקוד אלה ממש מהאתר עצמו ולראות מה שגוי מה שבור באתר ובסוכן
> תבדוק הכל ואני רוצה שתעשה את זה עכשיו את הסטודיו פתוח

("I command you to check the agent, not from the code but from the site itself, and see what is
wrong and what is broken in the site and in the agent, check everything, and I want you to do it
now, with Studio open.")

Instrument: `infra/e2e.mjs` against `API_BASE=https://apple.moshe-barami111.workers.dev`, the live
origin. Not a fixture, not a mock worker: a real sign-in, a real project, a real pairing code, real
model calls against the deployed worker.

## What this probe is NOT

**The Studio here is simulated, and that is a limitation, not a detail.** `infra/e2e.mjs` runs a
fake plugin loop that answers `/api/studio/poll` from Node. Real Studio pairing requires a person to
type a six-character code into the Studio dock — `apps/apple-plugin/src/Bridge.luau` keeps the
credential in Lua state only and never persists it — so an autonomous session cannot pair the
owner's running Studio. Roblox Studio **was** open throughout (pid 67077, `Place1.rbxl`), and its
log was read directly; it was not driven.

So: the wire, the worker, the model, the credit ledger and the tool loop are real and measured. The
Studio side of the loop is a stub, and every claim below is scoped accordingly.

## Run 1 — 2026-09-20T23:19:23Z — FAILED at step 6

```
1. signed in as e2e-test@golem.internal
2. project created 755bd791-6025-4330-a9db-beac63e285b9
3. /api/me → quota 231/231 plan free
4. pairing code TX4775 / claimed → project E2E Obby / code single-use ✓
5. clay chat (no studio)…
   → stopReason done | `task.wait()` pauses the current coroutine for at least the given number…
6. starting fake plugin loop + stone chat…
   ws error msg: product_model_unavailable Apple MAX requires a paid subscription. Choose Apple to continue free.

Error: refused with no terminal event: product_model_unavailable — Apple MAX requires a paid
subscription. Choose Apple to continue free. (events: presence,hello,studio_status,error)
```

Two findings, both from this one run.

### F1 — the harness asked for a plan the account does not have, and had been doing so silently

`effectiveProductModel` (`apps/worker/src/do/session.ts:460`) is
`requested ?? (mode === 'clay' ? 'apple' : 'apple-max')`. Step 6 sent `mode: 'stone'` and **no**
`productModel`, so it was asking for **Apple MAX**. Step 3 of the same script prints `plan free` on
every run. Since product-model entitlement landed, step 6 has been asking this account for something
it can never have, and the run died before reaching its own assertion.

The repository's only production end-to-end test has therefore not exercised the Studio tool loop
for as long as that gate has existed. Fixed in this commit by sending `productModel: 'apple'`
explicitly; the mode stays `stone`, the toolset stays the build toolset, and the assertion is
untouched. `gatewayModelFor('stone', 'apple')` is still `stone`, so it is the same model.

### F2 — a refusal arrives with no terminal event, confirmed against the LIVE worker

`refuseOne` sends one `error` frame and returns. The event list the harness captured —
`presence,hello,studio_status,error` — is the whole of what the deployed worker sent. No `msg_end`,
no `run_state`, nothing. This had been inferred from source in
`docs/backlog/HANDOFF-SESSION-AGENT-LOOP.md` section C; it is now **measured against production**.

`session.ts` is held by another lane, so the fix stays a handoff. The harness half landed in
`ffc25b3`: this failure took **6 seconds and named the refusal**, where before it took 150 seconds
and blamed a timeout it had not suffered.

## Run 2 — 2026-09-20T23:20:14Z — E2E PASS

```
3. /api/me → quota 228/231 plan free
5. clay chat (no studio)…
   → stopReason done | `task.wait()` pauses the current coroutine for at least one frame…
6. starting fake plugin loop + stone chat…
   ws hello (studio=true) → sending "Create a glowing neon blue anchored part…" [stone/apple]
   tool: ✓ create_instances
   tool: ✓ get_instance · game.Workspace.BeaconTower
   tool: ✓ run_luau
   → stopReason done | studio ops handled: ["snapshot","create_instances","get_instance","run_code"]
   → reply: I reached the step limit for this run. Progress so far is saved — send another message to continue.
7. message history: 4 messages persisted
8. unauthenticated access → 401 ✓
E2E PASS
```

**The agent works from the live site.** A free account signed in, opened a project, paired, asked a
knowledge question and got a correct answer in 3 seconds, then asked for a build and the agent took
a snapshot, created the instance, read it back and ran Luau — against the deployed worker, in 17
seconds. That is the first complete pass of this harness on record tonight.

### F3 — the free lane gets three steps, and a build cannot finish in three

Read the last line of step 6 before reading the verdict. The customer asked for a part **and then
asked the agent to confirm what it created**. What they got was:

> I reached the step limit for this run. Progress so far is saved — send another message to continue.

`maxStepsFor` (`apps/worker/src/do/session.ts:494`) is
`productModel === 'apple' ? Math.min(STEP_LIMITS[mode], STEP_LIMITS.clay) : STEP_LIMITS[mode]`, and
`STEP_LIMITS` (line 370) is `{ clay: 3, stone: 16, rune: 24 }`. So a free build run gets **3 steps**,
and this run spent them on `create_instances`, `get_instance` and `run_luau` — all three of them real
work — leaving nothing to answer with. The step-limit sentence at `session.ts:3400` is what the free
tier says at the end of its simplest possible build.

This is the same defect one axis over from the one that file already documents at line 378 — *"the
free lane's budget was below the floor its own model needs to answer at all"* — which was measured
and fixed for tokens on 2026-09-20. The step budget was not revisited. The comment at line 484
describes the cap as the honest axis of tier difference, *"same brain, less of it"*; three steps is
less brain than a one-part build consumes.

**Not fixed here, for two reasons, and neither is that it is unclear.** `maxStepsFor` is in
`session.ts`, which another lane holds tonight — `git status --porcelain` checked. And the number
itself sets how much inference the free tier is allowed to spend, on an AI Gateway account with
uncapped overage where BudgetDO is the only guard; raising it is a decision about the owner's money
and belongs in the same change as the budget reasoning, not in a test-harness commit. Handed off as
section D.

## What was NOT verified, stated plainly

- **The snapshot admission in `checkpoint-evidence.ts` was not exercised.** The fake plugin answers
  `snapshot` with `{ v: 1, containers: [], scripts: [], scriptCount: 0, instanceCount: 3 }`, which
  carries no `format` field, so `checkpointEvidence` takes its legacy branch and returns `{ ok: true }`
  without reaching any of the three named causes. Verifying that end to end needs a real paired
  Studio, which needs the owner to type a pairing code. **Not done. Not claimed.**
- **No Apple MAX run was made**, so nothing here says anything about the MAX effort floor
  (ledger row `max-must-not-think-on-low`). That row needs a paid fixture account or the owner's own.
- **The browser UI was not driven.** This probe is the websocket protocol and the worker. What a
  person sees in `apps/web` at these moments was not observed on this pass.
- **`get_tree` was not called by the model in run 2**, so the whole-place tree fix committed in
  `b99c224` was not exercised end to end here. It is covered by an executable Luau guard in
  `apps/apple-plugin/tests/commands.test.mjs`.
