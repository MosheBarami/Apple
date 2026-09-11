# Second creation exercise — a tycoon loop, and what it cost

**Date:** 2026-09-02 00:00–00:05Z · **Mission §9.1** ("at least two fresh creation
exercises demonstrate meaningful generality"). Run at the daily Spark reset, through the
real product path: real account → deployed Worker → SessionDO → `@cf/zai-org/glm-5.3-flash`
→ Golem's own tools → paired Studio plugin → live place 116648235878426.

Claude authored one thing: the user's sentence.

## The request

> Add an ore-mining tycoon loop to my game. Players touch a rock to mine ore, ore goes
> into their backpack up to a carry limit, they walk to a sell pad to turn ore into cash,
> and their cash shows on screen and is still there when they rejoin. Add one upgrade
> they can buy that raises the carry limit.

Deliberately the **simulator/tycoon** family, against the first exercise's parkour course:
economy, per-player state, a carry limit, persistence across rejoin, a HUD and a purchase
— a different set of systems from platforming and a timer.

## What Golem did

Mode Agent (`stone`). 16 steps, 15 tool calls, 294 seconds.

```
get_project_tree · list_scripts · create_checkpoint
run_luau ×4                              world setup
edit_script  ServerScriptService.OreTycoonServer            (×3, iterated)
edit_script  StarterPlayerScripts.OreTycoonClient
edit_script  StarterPlayerScripts.OreTycoonHud
run_and_check · get_output_logs          playtested, read its own output
```

It took its own checkpoint before mutating ("Before ore-mining tycoon loop", 36 scripts /
1172 instances), built server, client and HUD scripts, played the game, read the log, and
went back to `OreTycoonServer` twice more.

Then it **ran out of steps**:

> I reached the step limit for this run. Progress so far is saved — send another message
> to continue.

## What this establishes, and what it does not

**Establishes:** Golem works on a second, genuinely different family under its own
steam — it planned, checkpointed, wrote server and client Luau, playtested, read the
output and iterated on its own code. That is the generality the gate is about, and it is
real.

**Does not establish:** that the loop works. The first exercise was verified by driving
the finished feature with throwaway Luau; that is not possible here. The Studio MCP
bridge disconnected mid-session, the run consumed the entire Spark allowance so there is
no budget for a follow-up, and the admin `run-tool` route — which would have read the
scripts back for free — refuses the `ADMIN_KEY` in the local `.env`, which is stale
against the deployed secret.

**So §9.1 is PARTIALLY met, and is recorded as partial.** A run that stops at the step
limit has not demonstrated a working feature, only a competent partial build. Calling
this gate met would be the overstatement this project keeps correcting in itself.

## The cost, which is the finding that matters

| | |
|---|---|
| Sparks at `hello` | **60** (full free daily allowance, freshly reset) |
| Sparks after | **0** |
| Used | **60**, for one request, which did not finish |

Corroborated by the usage ledger: 2026-09-02 **60 sparks / 17 events**, 2026-09-01 60/23,
2026-08-30 62/38. The free day is consumed by roughly one substantial Agent run.

**The published figure says otherwise.** The pricing page states **Agent · 4 sparks** and
**≈15 requests a free day**. The measured cost of one Agent request doing what Agent is
advertised for — *"Builds features across your project"* — is 60, and it did not
complete. That is 15× the published number.

The 4-spark figure is not invented: it is `ceil(111 / 30)` from `COST-MODEL.md`'s row
*"Stone, targeted edit + read-back verify in Studio"*. A targeted edit is a real thing
Agent does. It is not the thing the page describes beside the number.

**And I made this worse earlier today.** I corrected the Plan figure from 1 spark to 2,
wired `scripts/check-spark-figures.mjs` into CI to enforce the whole table against
COST-MODEL, and thereby locked in the Agent figure with a guard that now reports agreement.
The guard is faithful; the source it enforces under-represents a real feature build by
more than an order of magnitude. A check that says "these agree" is not a check that says
"this is true", and I presented it closer to the latter than it deserved.

**Not republished here.** One instrumented measurement is one data point, and picking a
new number from it would repeat the mistake that produced the old one. What is warranted
is that the current number cannot stand beside the words next to it. §33 makes public
pricing the owner's, so this is written up in `BLOCKERS.md` rather than changed.

## A third sighting of the checkpoint bug, against production

At 0.5s:

> `ERROR checkpoint: Couldn't snapshot your project before starting (The run this change
> belonged to has ended). Continuing without an undo point.`

This is the `currentMsgId` attribution defect that `apps/worker/src/op-attribution.ts`
documents and fixes — the automatic pre-run undo point inheriting the id of the last
finished run and being discarded. Its own comment records two sightings on 2026-09-01;
this is the third, and it is against the **deployed** Worker, which does not have the fix.

That is corroboration rather than a new defect: the exercise independently reproduced the
failure the branch already repairs, which is the strongest argument yet for deploying it.
The run was not left unprotected — Golem took its own checkpoint at step 4 — but the
automatic one a user relies on silently did not exist.
