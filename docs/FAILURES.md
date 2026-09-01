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
| H1 | high | The per-player zone gate is published by the server (`zone_<id>` attribute) and **read by nobody**. A player who pays 2,500 coins sees the gate unchanged; one who has not pays walks through and collects nothing with **zero feedback**. |
| H2 | high | A live server **does** silently degrade to no-persistence: `DataService:463` is not Studio-gated, so a `GetDataStore` throw at boot hands every joiner a blank profile at `state = ready`. The docstring asserts the opposite of the code. |
| H3 | high | Losing the session lock mid-play sets `persist = false` and continues. The HUD keeps crediting coins; every write is discarded. `Notify` is wired and used elsewhere and fires on neither this path nor H2. |
| H4 | high | Teleport farming works. `MaxPerTick` caps the instantaneous pickup, not the round trip, and there is no server-side movement validation — a ~6-8× economy advantage against the comment's claim of "the same rate as walking". |
| A2 | high | The **stop button** can be silently lost: `webSocketMessage` does a read-modify-write of `agent` while `runStep` holds its own copy and writes `status: 'running'` at the tail. |
| A3 | high | Concurrent `startRun` double-charges a Spark, inserts two user rows, and orphans a message that never gets `msg_end`. |
| A4 | high | `createCheckpoint` throwing inside `startRun` leaves `status: 'running'` with **no alarm scheduled**, so nothing can ever recover it before the 180 s staleness bypass. |
| A5/A6 | medium | Ops queued by a dead run are still delivered and executed; op delivery is at-most-once with no ack or redelivery. |
| B5 | high | `plugin:Unloading` is never handled — nothing disconnects. After a plugin reload there are two live poll loops draining the same queue, which is also how F-21's nil recording arises. |
| B6 | high | Reconnect calls `task.cancel` on a possibly-dead thread, and if the old loop is mid-yield it dies inside `Ops.execute`, leaving the ChangeHistory recording open forever and the asset policy stuck open. |
| M6 | medium | The **HUD** is drawn under the Roblox topbar (`IgnoreGuiInset = true`, and `GetGuiInset` appears nowhere). The modal was fixed this session; the wallet column was not. |
| M9 | medium | `Config.Codes` claims "the client never sees this table" and the client requires `Config`. `Codes.luau` says the opposite and is correct. |
| ~~L8~~ | ~~medium~~ | **CLOSED 2026-09-01.** 33 Luau tests now run the game's own modules in the standalone Luau CLI, plus a 7-mutation check proving the suite can fail. Finding F-26..F-28 below were found by writing them. See `apps/benchmark/crystal-canyon/tests/`. |

---

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
