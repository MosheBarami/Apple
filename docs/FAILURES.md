# Failures

Mission §V: the internal knowledge base must carry *every confirmed Golem failure*,
every accepted and rejected experiment. Mission §AK: a plausible metric can be
useless or actively misleading, so the falsifications matter as much as the fixes.

Newest first. Each entry: what was believed, what was true, how it was caught.

---

## 2026-09-01

### F-12 · A comment was load-bearing, and it was wrong
**Believed:** "Every Cube mesh carries a texture, so `Color` has no effect on it" —
written into `Build.luau` as a fact about the world.
**True:** `TextureID` is a writable property on the clone. Cleared, the same mesh
takes `Color` normally.
**Cost of the error:** three separate rejections downstream — Frost Hollow's
crystals fell back to flat slabs, three generated mesas were rejected as
unfixable, and the Glacier Heart was built from boxes *because* a crystal there
would have fallen back to boxes.
**Caught by:** an A/B — same four meshes, both copies set to pure red, differing
only in `TextureID`. Evidence: `evidence/2026-09-01-detexture-ab.md`.

### F-13 · De-texturing the mesas fixed the cited defect and still failed
**Believed:** stripping the texture removes the candy-stripe banding the mesas were
rejected for, so they become usable.
**True:** it does remove the banding, and what is left is a smooth featureless
column. The banding had been doing all the geological work.
**Rule this produced:** de-texturing only helps where the GEOMETRY already carries
the form. A crystal's facets survive the strip; a mesa's do not exist.
**Caught by:** rendering them against the real canyon wall at `cliff` tier before
wiring them in. `cliff_module` is now 7 of 9 generations rejected.

### F-14 · `stoneDais` laid its ashlar blocks radially, not tangentially
**Believed:** the comment promised "there is no elevation from which it reads as a
stack of squares."
**True:** `CFrame.Angles(0, -ang, 0)` maps a block's chord axis onto the radial
direction, so eight blocks made a pinwheel of spokes. Correct yaw is `-(ang + π/2)`.
**Compounding bug:** the chord was computed from the OUTER radius while the blocks
stand on `radius - dep/2` — a 20.1-stud chord on a 118-stud circumference, so they
overlapped and threw corners past one another.
**Scope:** shared function. BOTH landmarks were wrong.
**Caught by:** isolating the Glacier Heart (everything else `Transparency = 1`) once
the crystals stopped being the worst thing in frame.

### F-15 · "Three faceted shafts" were three rotated cubes
**Believed:** in-source description of the Glacier Heart core.
**True:** a rotated cube has no facets. Seven boxes.
**Caught by:** the owner's pixel review naming the object, then reading the code
that built it.

### F-16 · A module was written, committed, and never installed
**Believed:** `Icons.luau` shipped. It is 356 lines, committed, and referenced by two
consumers.
**True:** it was absent from `world/Install.luau`, the only supported path into a
place, so it did not exist at runtime. `Hud` waits BOUNDED and degrades visibly;
`Panels` waits UNBOUNDED and never finishes loading — so SHOP, UPGRADES, CODES and
ZONES were dead in **every** playtest since the module landed, while the HUD kept
drawing and screenshots kept looking fine.
**Caught by:** reading Studio's console during a playtest instead of only looking at
it. `Infinite yield possible on ... WaitForChild("Icons")`.
**Now asserted by:** `packages/evals/src/install-manifest.test.mjs`, which was
verified against the real bug by removing the row again and watching two of its
five assertions fail by name.

### F-17 · The HUD overlapped itself, and viewport height decided whether you saw it
**Believed:** the left column was fine; it reviewed fine.
**True:** `Wallet` is pinned to the top and `Nav` is centred on the screen, and
neither position refers to the other. At 698px of usable height that is a 97×73px
collision sitting on the shard gauge. A tall viewport hides it entirely; a short
landscape phone makes it worse.
**Caught by:** measuring `AbsolutePosition`/`AbsoluteSize` rather than judging the
screenshot.

### F-20 · A budget that could not see the field that overflows it
**Believed:** `trimTranscript` bounded the persisted agent state.
**True:** `contentChars` measured `m.content` only, never `toolCalls[].arguments` — which
holds whole script bodies and is routinely the largest string in the transcript. Over the
Durable Object's 128 KiB value limit the `put` rejected, the catch path attempted the SAME
put and rejected again, the alarm handler died, and the platform retried it from the state
persisted BEFORE the step — **re-running the paid LLM call and re-executing every mutating
tool against the user's place.**
**Fixed:** budget counts arguments; `seenCalls`/`lastCalls` bounded; `persistAgent` sheds
transcript rather than dying.
**Rule:** when a failure mode is duplicate mutation, finishing with less history always beats
handing the platform a state it will replay.

### F-21 · A nil undo recording was treated as "no recording needed"
**Believed:** "every AI action is natively undoable" (the file's own header).
**True:** `TryBeginRecording` returns nil when one is already open — after a leaked poll loop
or an op cancelled mid-yield. The handler ran anyway and both Commit and Cancel were skipped,
so the place was modified un-undoably, and `create_instances` (which parents as it goes) could
throw on item 5 of 10 with 1-4 already placed and nothing to roll back.
**Fixed:** a mutating op with no recording is refused. Losing an op is recoverable; an
un-undoable partial mutation is not.

### F-22 · The restore path could not report failure, after destroying the tree
**Believed:** `restored = true` meant restored.
**True:** it was a literal, and `scriptsRestored` reported the SNAPSHOT's count rather than
what was written back — a number that could not decrease however badly the restore went. Every
write is pcall'd with the result discarded, and `Ops.execute` only fails an op carrying an
`error` key. So a restore that recreated almost nothing looked identical to one that worked —
on the highest-stakes operation in the product, the "undo a bad AI build" path.
**Fixed:** counts failures, reports scripts WRITTEN, errors when materially incomplete.

### F-23 · A timeout was sent for four months and never read
**Believed:** `run_code` was bounded by the server's `timeoutMs: 10_000`.
**True:** the plugin never read it, and could not honour it — `pcall(require, module)` runs on
Studio's main thread with no instruction budget, and a non-yielding loop never lets a watchdog
run. `while true do end` hard-freezes Studio; the only recovery is killing it and losing
unsaved work. The server timing out stops it WAITING, not Studio spinning.
**Fixed, partially and honestly:** non-yielding loops are refused before they run. This is
syntactic, not an analysis — a loop whose exit condition is merely never satisfied still hangs,
and that limit is stated rather than papered over.
**And the guard was wrong on first test:** it refused `workspace:WaitForChild("X")`, because
`:Wait%s*%(` cannot match `:WaitForChild(`. Caught by running it against 13 real samples rather
than by reading it. A guard that refuses correct code is a guard people route around.

### F-24 · The untrusted fence used a constant tag
**Believed:** fencing tool output made it inert.
**True:** `JSON.stringify` escapes quotes and backslashes but **not angle brackets**, so a
payload containing a literal closing tag reached the transcript verbatim and closed the fence
early — after which the system prompt's own wording placed the attacker's text OUTSIDE the
markers. Worse, `remember` wrote model-supplied text into the SYSTEM prompt, uncapped and
unfenced, on every future run of the project, and `MEMORY_UPDATE_PROMPT` carried no
untrusted-content warning at all.
**Fixed:** per-run random fence id, memory capped and fenced, warning added.
**Rule:** do not sanitise evidence to make it safe — make the container unforgeable instead.

### F-25 · Three reduced-motion defects in a gate added the same day
A reversing infinite tween has no end state at its goal, so applying the goal parked the sell
plate permanently mid-gesture. `Cancel` never reported `Cancelled`, leaving `Theme.close`'s
guard — which exists precisely for a re-open — unreachable. And the gate is a drop-in
TweenService replacement, so it was structurally incapable of covering `Effects.countTo`, a
hand-rolled per-frame loop driving the most motion-heavy element on screen.
**All three fired only for users who had turned reduced motion on**, which is to say never
during testing. That is the general hazard of an accessibility path: it is the one branch the
author never sees.

---

## Found by the critics and NOT yet fixed

Recorded so they are not rediscovered as new. Severity is the critics' own.

| id | severity | finding |
|---|---|---|
| ~~H1~~ | ~~high~~ | **CLOSED 2026-09-01.** `src/client/Gates.luau` reads the attribute and paints the gate; `Collect.notifyZoneLocked` supplies the missing feedback. Measured in a Studio playtest — locked 232,62,62 @ T=0.350, unlocked 70,200,85 @ T=0.880, an 8-frame eased fade, and the notice firing 2×/8s inside the locked zone and 0× in an owned one. `docs/evidence/2026-09-01-zone-gate-h1.md`. |
| ~~H2~~ | ~~high~~ | **CLOSED 2026-09-01.** `logDegraded` became `degradeToMemory`, which refuses to degrade on a live server and returns whether it did; production now leaves `store` nil so each load takes the existing kick path, which was already correct and merely unreachable. 11 tests in `dataservice-production.spec.luau`, and 7 in the Studio counterpart proving the deliberate softening survives. |
| ~~H3~~ | ~~high~~ | **CLOSED 2026-09-01.** A save that finds a foreign lock now marks the session `failed` *before* kicking, so `get`/`isReady` stop answering in the window before the disconnect lands and the economy cannot credit a profile we no longer own. Five tests cover it, including that no later write reaches the DataStore at all. |
| ~~H4~~ | ~~high~~ | **CLOSED 2026-09-01.** `src/server/Movement.luau` bounds a step by the walk speed the *server* says the player is entitled to; `Collect` zeroes that tick's budget when the step was impossible. Measured A/B in Studio against the pre-fix code, same harness and world: **1.95 → 0.08 crystals/s, a 24× reduction**, while walking (0.15/s) now out-earns teleporting. False positives on legitimate walking-and-jumping: 2 of 202 ticks, 0.1s each. `docs/evidence/2026-09-01-teleport-farming-h4.md`. |
| ~~A2~~ | ~~high~~ | **CLOSED 2026-09-01.** The stop moved to its own key with one writer and one reader (`src/stop-signal.ts`), so neither write can erase the other. The race ran both ways: the run's tail write erased the stop, *and* the stop's stale blob erased the step's own transcript, inviting a replay of a step whose paid call had already run. 9 unit tests + 4 behavioural tests through the real `SessionDO`. |
| ~~A3~~ | ~~high~~ | **CLOSED 2026-09-01.** `src/single-flight.ts` — a gate set **synchronously**, before any await, because the storage read that decides "is a run in flight" is one of the things `startRun` awaits. 7 unit tests + a behavioural test that starts two runs without awaiting between them and asserts exactly one `msg_start`. |
| ~~A4~~ | ~~high~~ | **CLOSED 2026-09-01.** The pre-run checkpoint is wrapped and `setAlarm` sits outside the wrapper, so a throw can no longer skip it — and `alarm()`'s staleness rescue could not have helped, since it requires `step > 0`. The discarded `{ error }` return is now surfaced too. 3 behavioural tests covering throw, returned-error, and the healthy path. |
| ~~A5~~ | ~~medium~~ | **CLOSED 2026-09-01.** Ops carry the run that queued them; `finishRun` discards what an ended run left behind and the poll path re-checks as a backstop, since the queue is persisted and a restart could otherwise deliver them. Dropped ops resolve their waiter with a reason instead of leaving the caller to time out. An op with no `runId` — queued by a deploy predating the field — is kept. 5 tests through the real `SessionDO`. |
| ~~B5~~ | ~~high~~ | **CLOSED 2026-09-01.** `plugin.Unloading` now clears `connected` and retires the loop, so a reloaded plugin's predecessor stops instead of continuing to drain the same queue with the same token. Cooperative, never cancelled — the old loop finishes its op and closes its recording on the way out. |
| ~~B6~~ | ~~high~~ | **CLOSED 2026-09-01.** `task.cancel` is gone from the plugin entirely, along with the thread handle that invited it. Each poll loop carries its own generation and exits when a newer one exists, which retires it without killing it mid-op. 9 tests in `packages/evals/src/plugin-lifecycle.test.mjs`. |
| ~~M6~~ | ~~medium~~ | **CLOSED 2026-09-01.** The notification layer now offsets by `GuiService:GetGuiInset()`; measured in Studio, the toast moved from y=16 to y=74 against a 58 px inset and `FROST HOLLOW IS LOCKED — 2,500 COINS` renders in full where it was previously clipped to `FROST HOLLOW — 2,500`. The wallet column was already clear: `Hud` builds its own ScreenGui with `IgnoreGuiInset = false`, confirmed in the same capture. The modal was fixed earlier this session. |
| ~~M9~~ | ~~medium~~ | **CLOSED 2026-09-01.** Rather than soften the claim to match the code, the code now matches the claim: the table moved to `server/CodeTable.luau`, which does not replicate. Verified from a live client — `Config.Codes` is `nil` and no reward amount or message is reachable by walking `Config`. `Config.CodeInput` stays shared, because the code box has to trim to the length the server will accept. |
| ~~L8~~ | ~~medium~~ | **CLOSED 2026-09-01.** 78 Luau tests now run the game's own modules in the standalone Luau CLI, plus a 20-mutation check proving the suite can fail. Finding F-26..F-28 below were found by writing them. See `apps/benchmark/crystal-canyon/tests/`. |

---

### A6 · REJECTED — at-most-once op delivery is the right trade, not a gap

A6 asked for an ack and redelivery on the op channel: the poll splices ops out of the queue
and forgets them, so a plugin that dies between receiving a batch and executing it loses that
batch.

**Rejected, and the reasoning is the same one the rest of this codebase runs on.** The plugin
acknowledges by reporting RESULTS on its next poll — *after* execution — so an unacknowledged
batch is not evidence it did not run. Studio may have applied every op and died before
reporting. Re-sending would then create the parts a second time, or re-run an `edit_script`
over a file it has already written.

Duplicate mutation is the failure this worker is built to avoid: it is why `trimTranscript`
counts tool arguments, why `persistWithShedding` sheds rather than throws, and why A4's fix
guarantees an alarm. An at-least-once op channel would install that same failure deliberately,
on the one path that touches the user's place directly.

The loss is not silent. `execStudioOp` holds a waiter that resolves with "Studio did not
respond within 30s", so the run is told and the agent handles it as a failed tool call.

**What would change the answer:** idempotency in the plugin — recognising an op id it has
already applied and replying with the earlier result rather than re-running it. That is a
plugin protocol change, not a worker one, and it is the shape any future attempt should take.
Until then, losing work is the cheaper mistake. The decision is written at the delivery site
so the next reader finds it before reimplementing the retry.

### F-31 · A helper that called itself, so every save silently dropped the transcript

**Self-inflicted, this session, in `a1b0261` — the commit that fixed four criticals.** The
whole point of that commit's `persistAgent` was to centralise seven bare `storage.put` calls
behind one shedding-aware helper. What it centralised was this:

```ts
private async persistAgent(agent: AgentState): Promise<void> {
  try {
    await this.persistAgent(agent);   // itself, not storage
    return;
  } catch (err) {
    // ...shed the transcript and put...
```

Entering an async function runs synchronously until its first await *operand* is evaluated,
and the operand here is the recursive call — so it recursed until the stack overflowed. The
`RangeError` landed in the shedding path, which dutifully saved the run **without its
transcript**. Every step. Silently. Behind a `console.warn` reading *"agent state too large;
persisted without transcript"*, which looks like a known, benign, size-related condition.

The user-visible symptom would have been an agent that forgets the conversation between
steps — read as a model quality problem, not a storage bug.

**Why nothing caught it.** No test reached the policy. 1,416 passing tests, `tsc --noEmit`
clean, CI green: none of them touched it, and a reviewer reading the diff sees a
plausible-looking try/catch whose comment describes exactly the right behaviour.

**A correction, because the first version of this entry got it wrong.** I wrote that nothing
*could* have caught it, on the grounds that `SessionDO extends DurableObject` and cannot be
instantiated outside the Workers runtime. That is false, and the disproof was already in the
repository: `packages/evals/src/preserved.test.mjs` bundles `session.ts` and constructs a real
`SessionDO` over a fake storage map. It has done so since B10. "Untestable" is a claim that
deserves the same evidence as any other, and I asserted it instead of checking — which is the
same failure as the bug being recorded here, one level up. A2, A3 and A4 are now covered by
behavioural tests through that harness rather than by the source-level assertions I had
written on the false premise.

**Fix:** the policy moved to `src/persist.ts` and takes its `put` as an argument, which makes
it ordinary code with ordinary tests. `persistAgent` on the DO is now one line that supplies
storage and nothing else. It also returns `'full' | 'shed' | 'terminal'`, because the old
`void` made a healthy save and a degraded one indistinguishable to everything except a human
reading console output.

**Verified against the bug, not just against the fix.** The defect was reintroduced into a
copy of the module and the suite re-run: **8 of 8 tests fail**; against the fix, 8 of 8 pass.

**What this says about the session.** Three of the five defects found by writing tests
(F-29, F-30, F-31) are cases where working-looking code did nothing, and F-31 was written by
the same pass that was fixing critical bugs. Reviewing a diff is not the same as running it,
and neither is a green suite that cannot reach the code in question.

### F-30 · A Studio spec that appeared to cover the softening and never reached it

Three tests asserted that an unreachable DataStore stays playable in Studio. All three
passed. A mutation that made `degradeToMemory` stop degrading — which should break every one
of them — **survived**, three times, and each survival was a different lie in the tests.

**First survival.** The tests set `__dataStoreService.__fail = true` and nothing else. But an
earlier test in the same chunk had already handed `DataService` a working store, and `store`
is never cleared. Failing only `GetDataStore` left that cached handle answering happily: the
"unreachable DataStore" test had a perfectly reachable one. Fixed by failing the store too.

**Second survival.** Retargeting the mutation at the earlier `return true` also survived —
and the reasoning behind the retarget was wrong. Both were symptoms of the same thing: every
test degraded at **boot**, where `init` discards the return value and `onPlayerAdded`
short-circuits on the flag. `degradeToMemory`'s return value is consulted in exactly one
place, the `status == "error"` branch, and no test ever got there.

**The gap that hid.** Boot-time unavailability and load-time refusal are different paths.
`GetDataStore` throwing means no API access at all; `GetDataStore` succeeding and `UpdateAsync`
being refused means access was granted and the request was not — which is where Studio's
softening actually lives. Only the first was covered.

Adding a test for the second made the original mutation observable, and it is now caught.

**Why record it.** The tests were not weak in an obvious way — they exercised real code, made
real assertions, and would have caught a careless edit. What they could not do is tell the
difference between "Studio degrades correctly" and "this chunk degraded before the question
was asked". Nothing but a deliberate attempt to break them surfaced that, which is the whole
argument for `mutation-check.mjs` existing alongside the suite rather than after it.

### F-29 · A client module that ran, found its target, and painted nothing

The first `Gates.luau` cached the gate's parts at init:

```luau
painted[zone.Id] = partsOf(gate)   -- gate:GetDescendants(), once
```

In the playtest the gate's mean transparency stayed at **0.012** — the authored value,
untouched — with no warning and no error. At client boot the gate Model has replicated but
its 13 children have not, so the cached list was empty and every subsequent paint looped over
nothing.

**Why nothing caught it.** An empty list is indistinguishable from success everywhere except
the pixels: the module loaded, `findGate` succeeded, the attribute listener connected, and the
only console output was a legitimate warning about the free zone having no gate. The unit
tests could not have caught it either — there is no replication in the test runtime, so a
snapshot taken there is always complete.

**Fix:** hold the Model, walk its descendants at paint time (a gate is a dozen parts and this
runs on an attribute change, not per frame), and connect `DescendantAdded` so a part that
replicates late still gets the current state.

**The lesson is the one H1 already taught.** H1 was code that ran and affected nothing. The
first attempt to fix it was code that ran and affected nothing. Both were invisible to
everything except a running game.

### F-26 · `upgradeCost` priced negative levels as a discount — down to free

`Config.upgradeValue` clamped its level to `[0, MaxLevel]`. Its sibling
`Config.upgradeCost`, six lines below, did not:

```luau
local lvl = math.floor(level or 0)          -- no lower bound
return math.floor(up.BaseCost * (up.CostGrowth ^ lvl))
```

`CostGrowth ^ lvl` for a negative `lvl` is a *fraction*, so the price fell as the
level went down. Measured against the shipped table:

| level | `upgradeCost("pack", level)` |
|---|---|
| 0 | 50 |
| -5 | 4 |
| -50 | **0** |

A free upgrade, and `upgradeValue` would still hand back the level-0 stat because
*it* clamped. The two functions disagreed about what a level is.

**Reachability:** `Profile.sanitize` floors levels at 0, so this was not live — the
guarantee simply lived in a different module from the arithmetic that depended on
it, with nothing stating the dependency. That is the shape of a bug that arrives
later, when someone adds a second way to set a level.

**Fix:** one `levelIn` helper, used by both functions.
**How it was found:** writing `config.spec.luau`, by asking what `upgradeCost`
does with the inputs `upgradeValue` explicitly defends against.

### F-27 · `math.clamp` does not sanitise NaN, and a comment promised it did

> "Clamped so a corrupt profile with an out-of-range level degrades to a legal
> value instead of an absurd one."

`math.clamp(0/0, 0, 12)` returns **NaN**. So `upgradeValue("pack", nan)` returned
NaN, which then propagated into WalkSpeed, magnet radius and pack capacity. The
comment was not describing the code.

NaN is the one value that survives a clamp precisely because every comparison
against it is false — the same reason `Profile.count` detects it with `v ~= v`
rather than a range check. That guard existed in `Profile` and not in `Config`.

**Fix:** `levelIn` rejects non-finite input explicitly — `+inf` saturates to max,
`-inf` and NaN go to 0. NaN carries no magnitude, so it gets the pessimistic end,
matching `Profile.count`'s stated asymmetry: corruption must never be a route to a
better outcome than the player earned.

### F-28 · The HUD could render "-0"

`Util.comma` signs by testing the input, but truncates by magnitude:

```luau
local whole = tostring(math.floor(math.abs(n)))   -- "0"
return (n < 0 and "-" or "") .. out               -- "-0"
```

Any value in `(-1, 0)` formatted as `-0`. Cosmetic and low-reachability — balances
are non-negative integers after sanitisation — but `comma` is the only formatter
the HUD uses, so every number a player ever sees goes through it, and "-0" is not a
number anyone can hold. **Fix:** sign only a non-zero magnitude.

### F-19 · Raising the cliff wall's mesh ratio improved every number and no pixels
**Believed:** the canyon wall reads as stacked boxes because only 62% of masses get
a rock-mesh silhouette; raise the threshold and the wall stops reading as prototype.
**Tried:** `modRoll < 0.62` -> `0.85`.
**The arithmetic all improved.** Cliffs 157 -> 136 primitives, cliff meshes 29 -> 41,
world 497 -> 482 primitives — and a module segment genuinely spends fewer authored
parts, so this was not even a "more bricks" answer.
**The pixels did not.** The wall still reads as terraced boxes from every wide
camera, because what the eye reads is the AUTHORED COURSES, and those are still
large flat slabs whether or not a mesh stands in front of them.
**And it cost something.** The curated rock shelf is THREE meshes, already placed
172 times; 0.85 takes it to 177. §AK names extreme repetition as a hard failure, so
15 primitives bought with five more copies of the same three rocks is a bad trade
even before the render disagrees.
**Verdict:** REVERTED to 0.62, with the measurement written into the source at the
call site so a later pass starts from it rather than repeating it.
**What this says about the remaining work:** the wall does not need a higher mesh
RATIO. It needs either more distinct rock silhouettes in the palette, or authored
courses that are not flat slabs.

### F-18 · Two probes that produced confident wrong answers about motion
Recorded because both are re-runnable mistakes, not one-offs:
1. **`require()` in the MCP command context returns a DIFFERENT module instance.**
   Calling `Panels.open("shop")` on a freshly-required copy hits an empty panel
   table and returns silently. Read naively: "motion is broken."
2. **Captured GUI references go stale.** `CrystalCanyonUI` is `ResetOnSpawn = true`,
   so a respawn destroys and rebuilds it. A sampler holding pre-respawn references
   reported 240 consecutive frames of "no panel visible" while the panel was on
   screen.
**Rule:** drive UI with real input, and re-resolve the GUI tree every frame.

---

## Inherited (earlier passes, kept for the record)

- **F-11** · The curated allowlist matched on display name, not asset id, so NOTHING
  matched and the world rebuilt entirely from primitives — 1287 parts, 0 mesh clones.
  It verified clean in a stub harness because the fixture was named the way the table
  expected.
- **F-10** · A plugin-set camera CFrame keeps its position and silently DROPS its
  rotation unless `CameraType` is `Scriptable` first, so every "blocked by geometry"
  render was facing +Z whatever it asked for.
- **F-09** · Three Cube mesas accepted on their own thumbnails, rejected once rendered
  in the world: strata banding read as candy stripe.
- **F-08** · A visual metric can pass while the pixels are clearly poor; see
  `COMPOSITION.md` for the enclosure-scoped gate that was measured and then rejected.
