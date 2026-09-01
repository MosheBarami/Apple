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

## The visual critic, 2026-09-01 — verdict: PROTOTYPE

The fourth independent critic, and the first with eyes. Clean context, the style spec, and the
live place; told to be harsh and that a charitable review had already let a dead UI ship.

> **"Prototype.** A carefully-dressed prototype with a genuinely shipped-quality UI kit bolted
> onto a world that is still a blockout."

It confirmed the wall finding from five camera positions at player eye height and explicitly
declined to re-litigate it — *"my finding is confirmation, not news"* — which is the right
reading of F-19/F-33 and gate 2.

What it found that this project had **not** recorded is below. Every measurement is the
critic's own; where it retracted a suspicion after checking, that is recorded too, because a
critic that only ever adds findings is not calibrated.

| id | severity | finding |
|---|---|---|
| ~~V1~~ | ~~high~~ | **CLOSED.** Lift 30 → 40, so the label spans 51.5–60.5 and nothing in the gate reaches above the lintel's 44.5. Re-measured with the critic's own raycast: **0 % occluded from 46 studs through 26**, where it was 67 %/100 %/100 %. Fixed by height rather than a world-space nudge toward the player, which would only be right for a gate facing this way. Original finding: the price label was 100 % occluded on the entire walking approach.** `Barrier.Label` sits at `StudsOffsetWorldSpace (0,30,0)` → centre Y 46, spanning 41.5–50.5; the gate's own `Lintel` spans 37.5–44.5 at the same Z, and `AlwaysOnTop = false`. Raycast, 27 points across the label face, from a realistic third-person camera: 67 % occluded at 56 studs, **100 % from 36 studs all the way in**, never better than 59 % when offset ±16 laterally. The only price the game states in the world is unreadable on foot. It renders fine from directly overhead, "which is presumably how it passed review before". |
| ~~V2~~ | ~~medium~~ | **CLOSED.** The square is 16×16, whose 11.31 half-diagonal sits inside the ring rather than 14.14 outside it, so no corner can escape at any ring size; and it now gets the halo/ring/edge stack `buildPad` gives every other floor marker, so §2s outline rule applies here too. Original finding: **the spawn point is an undressed default `SpawnLocation`** — `Size (20, 1.2, 20)`, cream, no outline, no bevel, 1.5 studs proud of the sand. Its `SpawnRing` is a ∅26 disc, so the square's 14.14 half-diagonal **projects 1.14 studs past the ring at four corners**, reading as a rendering fault. First thing every player sees. |
| ~~V3~~ | ~~medium~~ | **CLOSED.** Both causes. The ring is now inscribed by CORNER rather than by face — a regular polygon puts corners on the circumradius and faces on the apothem `R·cos(π/n)`, which lands corners at **1.003·R instead of 1.054·R**: a 0.07-stud sawtooth on the base tier where it was 1.2. And the per-block `k % 2` tone is gone, so eight blocks can fuse into a drum instead of being counted for you; the banding §7 asks for lives across tiers, not around them. Original finding: **F-14's residual cause.** The dais yaw and chord are fixed, but each block's outer corner still lands at `1.054·R` while its neighbour's face is at `R` — a **1.2-stud sawtooth** round the base tier — and `k % 2` alternating tone paints every block a different shade so the eye cannot fuse them into a drum. F-14 recorded the pinwheel; it recorded neither of these. |
| ~~V4~~ | ~~high~~ | **CLOSED.** The frost family was saturated with its hue unchanged: cliffs 21/25/29 % → **44/50/55 %**, ice path 45/49 % → **64/70 %**, foliage 40 % → 59 %, stone 22 % → 35 %. Measured over the built world, mean saturation of every part in the southern half went to **45 % against the meadow's 53 %**, where the two halves had been far apart. Cool does not have to mean grey: "icy" in this style language is a saturated blue, not an absence of colour. Original finding: **Frost Hollow fails §1 wholesale.** Cliffs `#708296/#7086A8/#5E7084`, floor `#CEE8F5`, path `#4A7492/#608DAD`. §1 opens *"Bright, saturated, high-key. No muted palettes, no tasteful neutrals"* and §9.10 makes desaturated an automatic fail. **Roughly a third of the map fails a headline criterion.** |
| ~~V5~~ | ~~medium~~ | **CLOSED, and partly retracted on measurement.** The seven named `sign` props genuinely carried no text; five now do — CRYSTAL CANYON, THIS WAY, PROSPECTOR'S CAMP, TRADING POST, UPGRADE KIOSK — taking the Canyon from 3 BillboardGuis to 8. **The MarkerBoard half of the finding is wrong:** the critic reported the chevron "on one face only, so from the far side they are completely blank", but the chevron is 0.9 deep on a 0.7 board, centred, so it **protrudes 0.10 studs on BOTH faces**. Measured, not argued. Original finding: **thirteen signs carry no text, decal or GUI of any kind** — 7 `sign_*` meshes and 6 `MarkerBoard`s. The whole Canyon has 3 `BillboardGui`s and **zero** `SurfaceGui`/`Decal`/`Texture`. §8 asks kiosks for "a bright sign"; three kiosk structures have none. |
| ~~V6~~ | ~~medium~~ | **CLOSED.** `attachShadow` copied `target.Size` — the size the target *asked* for — while a `UISizeConstraint` clamped the target and not the plate. Now mirrored, and via `ChildAdded` because `Theme.counter` attaches the shadow *before* `balanceStrip` parents the constraint: the first version of the fix only looked at construction time, changed nothing, and the measurement caught it. Verified in all four panels: 268×42 matching, offset +5/+7 down-right. Original finding: the shadow is 359 px wide against a 268 px counter and offset 86 px to the LEFT**, in all four panels. Every other shadow in the kit matches its owner and offsets down-right. |
| V7 | medium | **SHOP and UPGRADES sell the identical three items at identical prices** in two card templates. The SHOP panel has no products of its own — it is the upgrades list with a FEATURED strip. Two of the four panels are the same panel. |
| V8 | medium | **The whole play space is one flat slab.** `Ground.Grass` is a single `332 × 4 × 553` Part and every walkable surface sits at Y ≈ 0.00–0.35. Zero elevation change anywhere a player can walk. |
| ~~V9~~ | ~~low~~ | **CLOSED.** `TILE_RADIUS` is `UDim.new(0.5, 0)`. The old value carried the comment "§3: rounded rectangle, not a circle", which misread the spec twice: §3 is general guidance that explicitly allows "full pills", and §6 is the specific rule for this element — "circular icon buttons". A general rule was overruling a specific one. Original finding: nav tiles are rounded squares (`UICorner 18` on 62 × 62) where §6 specifies circular icon buttons — the one place the otherwise-exemplary UI departs from the spec. |
| V10 | low | **§6's top-centre pill is permanently empty for any post-onboarding player.** The objective chip is the only thing that ever occupies that slot and it retires after three steps. A spec gap rather than a bug. |
| ~~V11~~ | ~~low~~ | **CLOSED on size; the count is left alone.** A single `CRYSTAL_SCALE = 1.8` takes a crystal from 3.2 studs to **5.83 against a 5.50-stud character** — §7's "oversized relative to the player", and now readable as a target at the distance the 7-stud magnet actually operates over. Applied as one factor so the core/wedge/shard proportions, which were tuned together, cannot drift apart later. The count is a Config number that sets economy pacing, so changing it is a balance decision rather than a visual one. Original finding: the 34 collectible crystals are ~1.5 studs against a ~5-stud character, where §7 asks for props oversized relative to the player; and 34 across a 332 × 553 world is thin. |

**What it retracted after checking**, which is why the rest is trustworthy: it suspected the SELL
and UPGRADES pad labels were buried behind crystal clusters, raycast the actual walking
approaches, found 0–33 % and 0 % occlusion, and withdrew the finding. It also suspected the
empty objective chip was dead UI, checked the profile, found all three onboarding steps
complete, and reclassified it as V10.

**What it praised**, specifically: the crystal monument silhouette (84 studs against 50-stud
cliffs, visible from spawn); the path corridor; flora clustering measured rather than asserted
(nearest-neighbour CV 1.35 flora, 0.84 rocks); 896 of 896 parts `SmoothPlastic` with zero
realistic materials; and the UI kit — *"the strongest thing in the build, by a distance"* —
with **no text overflow across 149 rendered strings**.

**A limitation it stated plainly:** `screen_capture` returns magenta in play mode, so it never
saw a pixel of the HUD or the panels. Everything it says about the UI is derived from the live
GUI tree — `AbsoluteSize`, `AbsolutePosition`, `TextBounds`, stroke and corner properties — and
it says so rather than implying it looked.

## Found by the critics and NOT yet fixed

Recorded so they are not rediscovered as new. Severity is the critics' own.

| id | severity | finding |
|---|---|---|
| ~~H1~~ | ~~high~~ | **CLOSED 2026-09-01.** `src/client/Gates.luau` reads the attribute and paints the gate; `Collect.notifyZoneLocked` supplies the missing feedback. Measured in a Studio playtest — locked 232,62,62 @ T=0.350, unlocked 70,200,85 @ T=0.880, an 8-frame eased fade, and the notice firing 2×/8s inside the locked zone and 0× in an owned one. `docs/evidence/2026-09-01-zone-gate-h1.md`. |
| ~~H2~~ | ~~high~~ | **CLOSED 2026-09-01.** `logDegraded` became `degradeToMemory`, which refuses to degrade on a live server and returns whether it did; production now leaves `store` nil so each load takes the existing kick path, which was already correct and merely unreachable. 11 tests in `dataservice-production.spec.luau`, and 7 in the Studio counterpart proving the deliberate softening survives. |
| ~~H3~~ | ~~high~~ | **CLOSED 2026-09-01.** A save that finds a foreign lock now marks the session `failed` *before* kicking, so `get`/`isReady` stop answering in the window before the disconnect lands and the economy cannot credit a profile we no longer own. Five tests cover it, including that no later write reaches the DataStore at all. |
| ~~H4~~ | ~~high~~ | **CLOSED 2026-09-01.** `src/server/Movement.luau` bounds a step by the walk speed the *server* says the player is entitled to; `Collect` zeroes that tick's budget when the step was impossible. Measured A/B in Studio against the pre-fix code, same harness and world: **3.50 → 0.17 crystals/s, a 20.6× reduction**. The exploit was worth **10.3×** a walking player (3.50 vs 0.34); it now earns **less** than walking (0.17 vs 0.40), and walking itself is unaffected. An earlier version of these numbers was measured against `CrystalOutcrop` scenery rather than the collectibles and is corrected in the evidence doc. False positives on legitimate walking-and-jumping: 2 of 202 ticks, 0.1s each. `docs/evidence/2026-09-01-teleport-farming-h4.md`. |
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

### F-34 · My own A5 fix switched itself off after a Durable Object eviction

Found by re-reading this session's own diff rather than by a test, and worth recording because
the failure mode is the one this session keeps meeting: a guard that stops guarding without
saying so.

`execStudioOp` tags each queued op with `this.currentMsgId` so `dropOpsForEndedRuns` can discard
work belonging to a run that has ended. `currentMsgId` is an **instance** field, and it was set
in exactly one place: `startRunInner`.

A run outlives the instance. The Durable Object can be evicted between steps, and the alarm
resumes the run on a fresh object whose field is `undefined`. Every op queued from that point
carries `runId: undefined` — which `dropOpsForEndedRuns` **deliberately keeps**, on the
reasoning that an unlabelled op was queued by a deploy predating the field and discarding work
because it is unlabelled would be worse than the bug.

So the two halves compose into a switch: one eviction and A5's protection is off for the rest
of the run, silently, with the code reading exactly as it did when it worked.

**Fix:** `runStep` re-establishes `currentMsgId` from `agent.msgId` on every step. The run's own
state carries the id across an eviction; the instance field cannot. Two other readers —
playtest frame ids — were quietly degraded the same way and are fixed by the same line.

Covered by a test that builds a second `SessionDO` over the same storage map, which is what an
eviction leaves behind.

### F-35 · A playtest card that outlived the state tracking it

Found by applying F-34's reasoning to the rest of the file: which other instance fields carry
something that outlives the instance?

`playtestRun` was `private playtestRun: PlaytestRun | null = null` and was never persisted,
while `agent`, `opQueue`, `seq`, `memory` and `pluginLastSeen` around it all were. An eviction
mid-playtest therefore lost it, and two things followed:

- the guard in `finishRun` — whose own comment says it exists to stop *"a card that sits there
  counting up the age of a frame from a playtest that is long over"* — reads a null and does
  nothing, leaving exactly the card it was written to prevent;
- a client reconnecting after the eviction is sent no `playtest_state` at all, because the
  handler only sends one when the field is set.

**Fix, and why it is an accessor.** Six places advance a playtest, across four branches of one
message handler. A `setPlaytestRun()` helper that all six must remember to call is a helper the
seventh will not call — which is how this field came to be instance-only while everything
around it was persisted. A private setter cannot be forgotten, so the field is backed by
`playtestRunBacking` and assignment persists. The constructor writes the backing field directly,
since going through the setter would immediately write back what it had just read.

The write is fire-and-forget: losing a card's state is not worth failing a run over, and the
next transition rewrites it.

#### The sweep this came from, completed

F-34 and F-35 were both found by one question — *which instance fields carry something that
outlives the instance?* — so the rest of `SessionDO`'s fields were classified rather than left
to chance:

| field | verdict |
|---|---|
| `opQueue`, `seq`, `pluginSeenRecently` | persisted and restored in the constructor — correct |
| `opWaiters`, `pollWaiter`, `startGate` | in-memory by nature: promise resolvers, an open request, a concurrency latch. Nothing to persist |
| `frames`, `frameRate` | a live ring buffer and a measurement of it. Losing them on eviction costs a few frames, which is what a ring buffer is for |
| `currentMsgId` | **was broken — F-34** |
| `playtestRun` | **was broken — F-35** |
| `liveJwt` | instance-only **on purpose**, and correctly: it is the user's own JWT, its comment says it "is never written to durable storage", and its one consumer guards for absence. Persisting it to fix an eviction would be a security regression dressed as a bug fix |

Two of eleven were wrong. The point of writing the table down is that the next person asking
this question does not have to re-derive the ten that were right.

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

### F-38 · `clampText` has never clamped anything, in 105 places

Two copies of this helper, plus a third inline in `Panels`, all wrote:

```luau
label.TextScaled = true
label.TextWrapped = false
local c = Instance.new("UITextSizeConstraint")
```

Setting `TextScaled = true` implicitly turns wrapping ON. Explicitly turning wrapping back OFF
**silently clears `TextScaled`**. So line two disabled line one, and the `UITextSizeConstraint`
on line three — which does nothing at all unless the text is scaling — was inert.

Counted in a live session: **105 labels** across the HUD and every panel carried a size
constraint, and **not one of them was scaling**. The helper's own comment promises "let type
shrink to fit a small screen but never grow past the size the design was drawn at". Neither half
had ever happened.

Both halves of the pair read as exactly what the author meant — shrink to fit, stay on one line
— which is why it survived three writings and every review. And it is invisible in every
screenshot taken at the design resolution, because at that size nothing needed to shrink. It
only shows on the small screen the clamp existed for, which is the screen nobody renders.

**Found by reading the property back.** The new objective capsule was written the same wrong way,
copying the house pattern; querying `TextScaled` on the live label returned `false` when the
source plainly set it `true`. Isolating it took six probes in a live session:

| built as | reads back |
|---|---|
| `TextScaled = true` alone | **true** |
| `TextScaled = true` then a constraint | **true** |
| `TextScaled = true` then `TextWrapped = false` | **false** |
| constraint first, then `TextScaled = true` | **true** |
| `TextWrapped = false` first, then `TextScaled = true` | **true** (engine re-enables wrapping) |

**Fix:** stop writing `TextWrapped` at all. The engine owns it under `TextScaled`; at these
sizes the text still lays out on one line, because it shrinks to fit before it has any reason
to wrap. Verified, not assumed: `19,834/19,835` in a 112 px pill comes back one line, and a
short `5/25` still renders at the full `MaxTextSize` — which is the half of the contract that
stops a pill built for 17 px type rendering a 60 px word.

After the fix, the same live count reads **106 scaling, 0 inert**.

Pinned by `checkTextScaleOrder` and `typography.a-scaled-label-must-not-be-told-not-to-wrap`.
The check is order-sensitive on purpose — writing the wrap flag BEFORE the scale flag is
harmless — and its `\b` anchors exist because the first version matched the trailing "e" in
both `shade.TextScaled` and `face.TextWrapped` and reported two correctly-configured labels as
one broken one. A test written for that case is what caught it.

### F-37 · A controller could navigate the whole UI and never be told where it was

Every visible hover response in the game hung off `MouseEnter`. `SelectionGained` appeared
**zero times in the entire client**. Meanwhile `Panels.luau` sets `Selectable = false` in two
places, which means the selection graph was live and deliberately curated — so a controller
player really was moving through this UI, and nothing anywhere changed appearance while they
did it.

There were two hover implementations, not one: `Theme.luau` tweens fill, edge weight, glow and
depth; `Panels.luau` separately tweens a `UIScale` lift. Both were pointer-only.

`Theme.luau` also only recognised `MouseButton1` and `Touch` as a press, so a gamepad `ButtonA`
fired `Activated` — the game responded — while the control never looked pressed. An input that
works but does not acknowledge itself reads as an input that did not register.

**Found by the design library, not by a human and not by a screenshot.** The rule is
`state.selection-gained-is-the-gamepad-s-hover`, extracted from onyx-ui and synthetic, whose
whole content is: feed `SelectionGained`/`SelectionLost` into the SAME value the pointer feeds,
and every response already written for hover becomes a gamepad response for free. That is why
the fix is nine lines in each file rather than a second visual state.

The existing `checkGamepadReachability` could not have found it. It proves the selection graph
is CONNECTED. A graph can be perfectly connected and completely invisible, and that is exactly
what was shipping.

**And the check that pins it was wrong the first time.** Written as a bare `MouseEnter` match,
it reported `Stories.luau` — the isolated UI harness, which drives its state grid by FIRING the
connections it finds with `getconnections` and subscribes to nothing. A check that reports the
test harness as a defect gets switched off, and then it is not checking anything, so the signal
is who **subscribes** (`MouseEnter:Connect`) rather than who says the word. With that, the check
reports zero findings against the fixed client and still fails on the pre-fix source.

Stories gained a `focus` tile beside `hover` in its state grid, because "selection is the
controller's hover" is a claim about APPEARANCE, and the harness that renders states side by
side is the only place it can be seen to be true.

### F-36 · The sealing course promised the world could not leak, and it could

`cliffRun`'s sealing course carries this comment, and has since it was written:

> the ring is continuous at ground level and **the world does not leak away**. This is the one
> course that is not allowed to be interesting.

It was not true. Two multipliers stack on a saddle segment — `height = baseHeight *
rand(0.34, 0.5)` and `courseFraction[1] = 0.62` — and then the entire stack sinks by
`y = -rand(0.4, 3.0)`, the sealing course included. Worst case the seal's top lands at
`34 · 0.34 · 0.62 · 0.78 − 3.0` = **2.59 studs**, full segment width, with no boulder mass in
front because `useModule` is false on a saddle. A default humanoid jumps 7.15.

Probing outward from a breach found cliff mass to stand on for about 50 studs and then void —
so the failure is a player stepping over the sill, walking the cliff tops, and falling out of
the world.

**Found by an integrator reviewing four design plans**, not by any of the four. It was a
side-observation in the walls plan, which understated it as "≈5.2 studs" and as "a lateral
window"; the integrator worked out that the sink applies to the seal too and that the whole
segment is the window. Neither the author nor I had noticed it in four passes over this
function.

**Fix:** a floor on the sealing course only — `h = math.max(h, SEAL_MIN_TOP - y)` with
`SEAL_MIN_TOP = 16`. Chosen above the 7.15-stud jump rather than at it, because a floor set at
the number the player is trying to beat is not a floor. `math.max` takes no draw, so the seeded
stream is untouched (F-32). A saddle at 16 against neighbours at 30–51 still reads as the
skyline break §7 wants; what it stops being is a doorway.

#### And the measurement was wrong the first time, which is the more useful half

The first survey reported **42 of 299 perimeter samples** clearing a 7.15-stud jump, and 33
after the fix. Both numbers were inflated: the survey counted any sample with something
standable beneath it, including positions **on top of the cliff** — and finding no wall beyond
a wall you have already climbed is not a leak.

Filtered to the playable floor, the honest figures are **2 of 215 before, 1 after**. The one
that closed was at (-100, -150); the one that remains is at (165, 200), at the corner where the
grass ends, and is ring closure rather than saddle sink.

So the headline is 2 → 1, not 42 → 33, and the constructive claim is the one worth quoting
because a 5-stud sample grid can miss the deepest saddle entirely: **the worst-case seal top
goes from 2.59 studs to 16 by construction**, verified in the rebuilt world — zero cliff courses
top out below 12 studs.

The baseline was re-measured rather than reasoned about, by setting `SEAL_MIN_TOP = -1000`,
which makes the `max` an exact no-op, and rebuilding.

### F-32 · Adding one random draw to the world builder rebuilt the entire world

`Build.luau` is deterministic from a single seeded stream. The cliff experiment below added
`chance(0.5)` to pick a ramp direction — one draw, in the middle of the run — and every draw
after it shifted by one. The trees moved. The props moved. The landmark moved. The before and
after screenshots were of two different worlds, and the one variable under test was no longer
the only thing that had changed.

Caught immediately, because the whole point of the capture was to compare, and the comparison
was visibly nonsense. The part count is the cheap tell: it went 172 → 179 → 172 as the draw was
added and then removed.

**Rule this establishes:** a change to this builder that is meant to be A/B'd must consume the
same number of draws as the code it replaces. The fix here was a parity test on an index that
already existed (`toneOffset % 2`), which costs no draw and left the rest of the world
byte-identical. If a future change genuinely needs randomness, it needs its OWN `Random`
instance seeded separately, not a draw from the shared one.

### F-33 · Raising the cliff batter 2× changed no pixels

The courses' backward lean was 2.0°–6.6°. Raising it to 5.7°–12.6° — the cheapest hypothesis
for why the wall still reads as stacked boxes — produced a capture indistinguishable from the
baseline.

**Why it could not have worked, in hindsight:** what the camera sees head-on is each course's
FRONT face, and tilting a rectangle backwards leaves it a rectangle. The batter foreshortens
the face; it does not change the silhouette, and the silhouette is what reads as a box.
F-19 already said the courses themselves are the problem; this confirms that no amount of
tilting them is the answer. **Reverted.**

### Accepted, on the same evidence standard: the ramp cap now slopes ALONG the wall

A `WedgePart`'s slope runs along its local Z. The cap pointed that at `outward`, chamfering the
top across the wall's **depth** — the one axis the camera cannot see from outside the canyon.
From the front, the silhouette was still the wedge's high edge: a horizontal line, which is
exactly what the courses were already producing.

Pointing local Z along the **run** puts the slope in the skyline. Measured A/B at a grazing
angle along the wall, with the world otherwise byte-identical: the baseline skyline is
horizontals stepping down in terraces; with the change the same masses carry diagonals. Zero
parts, zero draws.

**It is an improvement, and it does not close gate 2 on its own.** Head-on, the wall still
reads as stacked boxes, because the cap is only 12–24 % of a segment's height.

### Also accepted: a weathering chamfer on every free course

The terrace line is the tell — each course meets its own top at a sharp 90°, and the part of
that top the next course does not cover is a flat ledge. Twenty of those in a row is a
staircase however irregular the plan.

A wedge along each free course's top-outer edge cuts that corner off. **Two attempts, and the
first one is the instructive one:** sized at `h * 0.30` it was a 1.3-stud bevel on courses that
turn out to be about 4 studs tall — roughly one percent of the image at playing distance — and
the render was indistinguishable from the baseline. *A chamfer that cannot be measured in the
render is not a chamfer, it is a part.* At `h * 0.75 × dd * 0.85` it reads.

Restricted to `k > 1 and not useModule`: the sealing course must keep its full outward face or
the ring leaks, and a course under a module sits behind a mesh already doing the silhouette.
Every proportion is fixed rather than drawn, per F-32.

**Cost: +29 primitives (482 → 511).** Still well under the 608 of the rejected blockout. At the
grazing angle a player actually walks, the left scarp goes from a staircase of horizontals to a
run of angled shoulders; head-on, the central mass's skyline breaks where it was a clean
horizontal.

### What all four experiments together say about gate 2

F-19 (more mesh in front), F-33 (tilt the courses), the ramp reorientation and the chamfer are
four attempts that keep the box-course vocabulary. Two changed nothing; two produced modest,
real improvements. None of them made the wall stop reading as stacked boxes.

**Decorating a box does not stop it reading as a box.** The vocabulary is the constraint, and
with the acquisition route now costed and closed
(`evidence/2026-09-01-rock-palette-supply.md`), what remains is generation or authored masses
that are not courses at all.

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
