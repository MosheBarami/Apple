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

### V7 · Two of the four panels were the same panel

Not a new failure — the visual critic's finding — but the diagnosis is worth recording because
the obvious fix would have recreated it.

`buildShop` was a gold FEATURED tray holding `Config.Upgrades[1]`, a heading reading
`⭐ ALL UPGRADES ⭐`, and a grid of one card per `Config.Upgrades` entry, each sending
`Purchase`. `buildUpgrades` was the same three entries as rows. Same ids, same prices, same
remote, same `readUpgrade`.

There was a second piece of evidence nobody had recorded: `Hud.luau` read

```luau
setBadge("shop", canUpgrade)
setBadge("upgrades", canUpgrade)
```

One boolean lit both nav tiles, because there was genuinely nothing else the SHOP dot could
have been about. The HUD already knew.

**Why the obvious fix fails.** The owner reserved for UPGRADES every permanent stat: capacity,
collection speed and radius, sell multiplier, movement, zone effects. Config's three upgrades
are pack, speed and magnet — so a "MAGNET SURGE" or a "DOUBLE COINS (60s)" is the upgrades list
again with a clock bolted on. That reservation looks like it shrinks the shop to nothing, and it
does the opposite: it forces the shop off the stat sheet entirely and onto UTILITY and
COSMETICS, which is the one place the two panels can never converge again.

**The test that separates them is VERBS.** Upgrades has one — buy a level. Shop has three (buy,
use, equip) and two nouns upgrades does not have: a stock count and an equipped state.

Kept rather than removed, and the case for removal was real: removing it is a five-line change,
and it would have spent no effort on V8, which is what actually earned "Prototype". What decided
it was that `buildShop` holds the only `UIGridLayout` of product cards and the only FEATURED
tray in the client — §5's whole construction grammar — so deleting the panel deletes evidence
for a pass criterion on a visual benchmark.

`config.spec`-style enforcement lives in `shop.spec.luau`: no shop product may carry any field
an upgrade uses to be a stat (`BaseValue`, `PerLevel`, `MaxLevel`, `BaseCost`, `CostGrowth`), and
none may share an id or a name with one. That is structural rather than a spelling check — a
stat wearing an innocent name still fails.

#### The one inversion worth reading twice

`Shop.use` runs the EFFECT before spending the charge, which is the opposite of
`Upgrades.purchase`'s validate-debit-apply. There, the debit was the only thing that could fail
and delivery could not. Here the roles reverse: the effect is the only thing that can refuse (an
empty pack, a sell still on cooldown) and the charge is the thing with no refund path. Spending
first burns a flare for nothing.

Confirmed in the live game, not only in the spec: using a flare with an empty pack returned
`NOTHING TO SELL` and left the stock at 2. Two mutations guard the ordering, because it is
exactly the shape a later refactor "tidies" back into the house order.

### F-40 · Giving the world relief broke the thing that kept players inside it

V8 and the owner's §2: "the whole play space is one flat slab; zero elevation change anywhere a
player can walk." It was literally one `332 × 4 × 553` block of grass with everything standing
on it, and from the overlook camera the world read as a tabletop diorama.

#### Why an apron rather than a height field

The obvious answer is to make `groundTop(x, z)` continuous and re-datum everything against it.
That was designed and rejected on two grounds, both verified in this codebase:

* **`Collect.farEnough` compares crystal candidates in 3-D** — `d:Dot(d)` on a `Vector3`. Today
  every candidate shares `y = 6.4`, so it behaves 2-D. Give the ground relief and Y varies, so
  rejection outcomes change, so the number of `NextNumber` draws changes, so the whole 34-crystal
  layout silently re-rolls. That is F-32 arriving through a **rejection loop** rather than through
  a draw site, which is why guarding draw order alone would not have caught it.
* Reconciling a continuous field with collision geometry needs a run-length encoder whose cell
  boundaries do not align with the field's own discontinuities — so field and collision disagree
  by a few studs, which is a player standing in the air.

So the relief went where it could be built as ordinary geometry and checked by looking: three
terraces rising from the meadow floor to the foot of the walls, all the way round, with four
ramps. Built **after** every prop is placed and re-seating what it swallows — a post-pass takes
no draws, so the stream fingerprint still matches the flat build.

#### And then it broke the enclosure

The apron lifts the player up to **16.5 studs at the wall's foot, and the wall does not rise with
it**. Surveyed from the top terrace: **122 of 256 perimeter samples cleared a 7.15-stud jump**,
most of them clearing it entirely. The apron turned a sealed canyon into a wall you can step
over — strictly worse than the flat world it replaced.

**No capture would ever have shown this.** The player has to climb the apron and look outward to
find it, and every screenshot in the pass was taken from the floor. It was found by re-running
the F-36 enclosure survey from the new standable heights rather than from the old ones, which is
the only reason to keep that survey as a script instead of as a memory.

Fixed with four invisible 70-stud slabs on the top terrace. The enclosure invariant is now
**structural** rather than emergent from whatever heights the archetype deck happened to deal —
which it should have been before the apron too, since the old buttress-and-stepped-courses
construction was already a staircase. After: **0 jumpable samples out of 512**, lowest barrier
50 studs.

#### Two smaller things the same survey caught

The terrace ring originally cut a gap where each ramp crosses, and the gaps were cut at **slab
granularity (46 studs) rather than ramp granularity (32)**, so different levels' holes did not
line up and left a **10.9-stud unclimbable step** at (116, −168). The ring is now solid and the
ramps lie on top of it, which makes a hole impossible rather than merely unlikely.

And the first apron took the biome's ground colour at every level, so the overlook showed three
bright green shelves that read as ski slopes. It now blends toward the biome's cliff tone as it
rises, which is what talus at the foot of a wall actually is, and it ties the apron to the wall
standing on it instead of leaving a colour seam at the join.

#### Three ramps that were geometrically perfect and physically unusable

The apron is only relief if the player can get onto it, and §2 requires navigation to stay
obvious. Four ramps, and **all four failed a walk test the raycast survey had passed**:

1. **The ramp began at the apron's inner edge**, where terrace 1 already stands 5.5 studs while
   the wedge is still zero thick — so the terrace blocked its own ramp. `Humanoid:MoveTo` stopped
   dead at y = 3.1 and 3.3 and never climbed a stud.
2. **A linear ramp reaching full height at the OUTER edge cannot clear a stepped apron at all.**
   Terrace k starts at `INNER + (k−1)w/3` and stands `k·STEP`; the ramp is only
   `rise·(foot + (k−1)w/3)/(foot + w)` there. The requirement reduces to `foot·(3 − k) > w`,
   which at k = 3 is `0 > w` — false for every foot length. The second version was blocked by
   **0.3 studs**, which is exactly the margin that looks fine in a screenshot. Ramps now top out
   where the top terrace *begins*: 8.7 against 5.5, 12.6 against 11.0, 16.5 against 16.5.
3. **A 19 × 32 pine stood in the west ramp**, and a butte's sealing course stood in the east one
   at x = 95. The surface profile under both was flawless — 0.3 rising smoothly to 16.5 — and a
   player walking it stopped dead. Props are now pushed aside by a corridor pass (no draws, no
   deletions), and the east ramp moved to z = −185 after surveying the whole side for a stretch
   with no cliff mass in x 55..140.

Every one of these was found by **walking**, and none by measuring. The raycast survey answers
"is there a surface at the right height", and the question that matters is "can a humanoid get
from here to there" — which is a different question whenever anything else has a collision box.
Final state: all four ramps climb 11.4–14.0 studs on foot, and the escape test from the top of
each still reports CONTAINED.

#### The review instrument was wrong too

`meadow-wall` and `frost-wall` aimed at `x = ±150`, which is **inside the cliff footprint**.
`Viewpoints.groundAt` deliberately does not exclude `Cliffs` — standing on a ledge is a
legitimate player-eye shot — so the target height resolved to the cliff TOP, and when the wall
rewrite raised those tops the camera tilted up and photographed the sky. A review camera whose
aim depends on the height of the thing it is reviewing cannot compare two builds, which is the
entire reason `Viewpoints.luau` exists. Both now aim at the wall's face.

### F-57 · The signature defect, committed by the person documenting it

`no_design_violation` and `playbook_complete` were both implemented, imported by `grade.mjs`,
dispatched by `evalCheck`, and covered by passing unit tests. Both were described — in commit
messages, in `docs/evidence/2026-09-01-playbooks-l3.md`, and in the Draft PR — as wired into the
eval harness.

Neither was reachable from it. `tasks.mjs` validated `check.type` against its own hand-written set:

```js
const CHECK_TYPES = new Set(['contains', 'not_contains', 'regex', 'luau_syntax', 'no_antipattern']);
```

enforced at `tasks.mjs:77`. A task file declaring either new type was rejected as **`bad type`**, so
no eval task could use them and neither had ever graded anything but a synthetic object built
inside its own test.

This is the fourth instance of one defect in this repository, and the list is worth having in one
place:

| | capability | the sentence that was missing |
| --- | --- | --- |
| gate 26 era | five mechanised design checks | never exported from `packages/design` |
| **F-47** | `retrievalRank` | read `provenance.security`; `scan.mjs` wrote `record.security` |
| gate 22 | `includeRegistry` | accepted by `run()`, never passed by the CLI |
| **F-57** | two check types | dispatched by `grade.mjs`, rejected by `tasks.mjs` |

Every one: two correct halves, no sentence joining them, every unit test passing. What makes this
instance worth its own entry is that it was introduced **on the same day, by the same author, as
the entries describing the other three** — while writing a test whose entire purpose was to prevent
the general form of it for `discover.mjs`'s CLI. Knowing a defect's shape well enough to write its
guard is not the same as recognising it in your own next commit.

Fixed by binding rather than syncing. `grade.mjs` exports `DISPATCHABLE_CHECK_TYPES`, `tasks.mjs`
imports it instead of restating it, and `grade.test.mjs` reads `grade.mjs`'s own `case` labels and
fails if the two lists diverge — so adding a `case` without registering it now breaks the build. A
third test confirms the binding did not turn the validator into a rubber stamp: an unknown type is
still rejected.

**Found by an adversarial audit, not by me.** A workflow was run to verify this session's own
handoff report, with agents instructed to hunt for "a code-existence claim written as an execution
claim". It returned 33 overstatements across six areas; this was the most serious.

### F-56 · A measured limitation, deliberately not fixed

Recorded because a known limitation with a number on it is worth more than a rushed change to an
error-severity rule, and because the next person to look will otherwise measure it again.

`busy-wait-loop` fires on `while true do` whose body contains no yield. Over the 2,646 files
fetched this session it produced **39 error-severity findings, and 30 of them contain a `break` or
`return`** — pure-computation loops that terminate on a computed condition. The first three are a
thousand-separator formatter, elliptic-curve modular arithmetic, and friend-list pagination:

```luau
while true do
	local lFormatted, k = string.gsub(formatted, "^(-?%d+)(%d%d%d)", delimiterSubStr)
	formatted = lFormatted
	if k == 0 then break end
end
```

That is the normal way to write a fixed-point iteration and it terminates in a handful of passes.
On the numbers above the rule's precision on real code is roughly **18 %**. (First published as
23 %, from a cruder scan that counted 30 rather than 32; a nesting-aware pass gives 32/7. The
conclusion is unchanged and the measured number is worse than first stated.)

**Why this is not fixed here.** Exempting every loop with a `break` would let the real case through,
because a spin-wait has one too:

```luau
while true do
	if flag then break end   -- polls external state; pins the thread exactly as the rule warns
end
```

The distinction is whether the exit condition depends on state the loop itself advances or on
something outside it, and that is not decidable from a regex. Five rule changes landed today, each
with paired tests; a sixth requiring a judgement I cannot make reliably, at the end of a long
session, is precisely the shape of change this file keeps recording as a failure.

The 7 findings with no exit at all are the rule working. What is needed is either a real reaching
analysis or splitting the rule so a loop with an exit reports at `warn` — and a per-finding
severity is not something the current shape supports, since severity is a property of the rule.

### F-55 · Three false-positive classes in one rule, found by running it over 2,646 real files

The fifteen repositories fetched this session are 2,646 Luau files of real, licence-clear code —
the first corpus this repository's own rules had ever been run against at scale. Fourteen of the
nineteen rules fired at least once, which is the coverage evidence. `datastore-without-pcall`
produced **134 error-severity findings**, and almost all of them were wrong, in three distinct ways.

**93 from one test file.** `NevermoreEngine/src/datastore/src/Server/Mocks/DataStoreMock.spec.lua`
— a jest-lua spec exercising a DataStore *mock*. The rule's stated reason is that an unprotected
throw "aborts the save mid-way"; in a test an unprotected throw is the DESIRED behaviour, and a
pcall would swallow exactly what the test exists to observe. One file was generating 70 % of the
rule's output across fifteen codebases, which is how a real finding gets lost in a listing nobody
reads. Test-ness is now detected from the SOURCE rather than the filename, because the case that
matters most is grading a model's fenced code block, which has no meaningful path — and a model
asked to write datastore tests should not be marked down for the absence of a pcall that would
break them. **Scoped to this rule only:** a test that hands a RemoteFunction to a client still
demonstrates what `remote-function-to-client` warns about, and that is a test of its own.

**8 from a library defining its own method.** `ProfileStore` declares
`function Profile:SetAsync()` — its view-mode save — and `DATASTORE_CALL` matches `:SetAsync(`
with no notion of a receiver, so the rule flagged the definition line and every call to
ProfileStore's own API. This is **F-49's shape a third time** (Flipper condemned for defining
`Signal:connect`, the tagger counting `wait()` in prose). A regex cannot type a receiver, so the
decidable question is whether the file DEFINES the method. Per method name, not blanket: defining
`:UpdateAsync` does not exempt `:SetAsync`.

**2 from the F-52 fix not surviving contact with modern Luau.** The delegated-pcall recognition
added earlier today worked on untyped helpers and failed on
`local function retry<T>(fn: () -> T, attempts: number)` — twice over. `<T>` sits between the name
and the paren, and a `[^)]*` parameter capture ends at the `)` inside `() -> T` rather than at the
one closing the list. So a correct retry helper went unrecognised and its two protected
`UpdateAsync` calls were reported. The irony is worth recording: the fix for "this rule penalises
the better answer" itself penalised the better answer, because typed generic Luau is more modern
than the code the fix was tested against.

**134 → 31, across 8 files — and the concentration was not resolved, it moved.**

The first version of this entry claimed "spread across nine files rather than concentrated in one",
and that was wrong in both halves. Re-measured over the same 2,646 files at HEAD:

| file | findings |
| --- | ---: |
| `MadStudioRoblox__ProfileStore/ProfileStoreTest.server.luau` | **23** |
| `phocodes__rice-simulator/.../SaveData.server.lua` | 2 |
| six others (Cmdr `var`/`varSet`, `fetchServer`, `ToolSaver`) | 1 each |

23 of 31 is **74 %** in one file — worse concentration than the 70 % that prompted the fix. And
that file's own header reads *"Automatic testing of the ProfileStore module"*: it is another test
harness, hand-rolled rather than jest-lua, so the source-based detector added above does not
recognise it. The detector catches the framework idiom, not the intent.

**This is left open deliberately.** Widening test detection to catch a bare `*Test.server.luau`
script means either trusting a filename — which the entry above explains is the wrong signal for
grading model output — or guessing at intent from shape. The remaining eight findings outside it
look genuine.

### F-54 · An enforced check reported the best-behaved call site in the file

`checkWaitContracts` is one of the eleven ENFORCED design rules. Pointed at this repository's own
benchmark, it reported a defect:

> `"CrystalCanyon"` is treated as OPTIONAL in `init.client.luau`, `init.server.luau` (bounded wait,
> degrades) but blocked on FOREVER in twelve other modules. One of the two is wrong, and while they
> disagree a missing `"CrystalCanyon"` is invisible: the bounded consumer keeps drawing.

The reasoning needs the bounded consumer to actually keep drawing. Both entry points do this:

```luau
local root = ReplicatedStorage:WaitForChild("CrystalCanyon", 30)
assert(root, "CrystalCanyon shared folder never replicated")
```

and the server's `if not sharedRoot then error(...) end`. **Neither degrades.** A bounded wait
followed by a throw is a bounded FAIL-FAST — a named error in thirty seconds instead of an
"Infinite yield possible" warning forever — which is strictly better than the unbounded pattern it
was being contrasted with. The check had found the two best call sites in the file and reported
them as the problem.

Fixed by looking at the statement immediately after a bounded wait: if it throws on the result, the
dependency is required there and the file is not treating it as optional. The case the check exists
for — a consumer that warns and carries on while another blocks forever — still fires, and is a
test in its own right so the widening cannot swallow it.

`checks.mjs` already carries this lesson in `checkFocusFeedback`, which was flagging the Stories
harness and whose comment says a check that reports the test harness as a defect "gets switched
off, which is worse than not having written it". Same failure, different check, and this one was
enforced.

Worth noting what the *other* checker said. `roblox-antipatterns.mjs`'s `unbounded-wait-for-child`
reports all fifty-eight of those unbounded waits at `warn` severity, and those findings are real —
the twelve modules genuinely have no nil path. They are also unreachable in practice, because a
module only runs after an entry point has already asserted the folder exists. Two checkers, two
defensible readings, and only one of them was claiming a contradiction that was not there.

### F-53 · The same string false positive, in the rule that grades models

`F-50` fixed the domain tagger counting `wait()` inside a comment. Its follow-up found the tagger
also counting `wait()` inside a **string**, and fixed that too: markers describing call syntax are
counted with string contents blanked, markers naming a class with them kept, because
`Instance.new("BodyVelocity")` is real usage whose whole evidence lives inside a string.

`roblox-antipatterns.mjs`'s `deprecated-api` rule had the identical defect and did not get the
identical fix, because the two live in different packages and only their **vocabulary** was under
a shared test. Running it over this repository found `apps/plugin/src/Ops.luau:351`:

```luau
"refused: this code contains a loop with no yield in it (no task.wait, wait() or "
```

A refusal message listing which yields are allowed, reported as a deprecated call.

The consequence is the same one F-52 has: **this rule grades model output.** A model writing that
exact sensible message — explaining to a user which yields are permitted — would be marked down
for the words in it.

Fixed with the same split, and the cross-package test extended from *which* constructs are
deprecated to *where they count*, so the two cannot drift apart on this either. The blanking
preserves length, because `matches()` derives a line number from a character index and a shorter
view would misreport every finding after a string.

The pattern worth naming: **a fix applied to one of two independent implementations is half a
fix**, and the test that was supposed to bind them only covered the half I had thought about.

### F-52 · A rule that graded the better answer worse

Running this repository's own nineteen anti-pattern rules over its own server code produced three
ERROR findings in `apps/benchmark/crystal-canyon/src/server/DataService.luau`:
`datastore-without-pcall`, at every `UpdateAsync` call site.

All three are wrapped in `withRetry(label, function() ... end)`, and `withRetry` is:

```luau
for attempt = 1, Config.Store.MaxRetries do
	local ok, result = pcall(fn)
	if ok then return true, result end
	...exponential backoff, permanent-error short-circuit...
end
```

`pcallRanges` only recognised the literal `pcall(function() ... end)` shape, so a helper handed a
function and pcalling it was invisible.

The reason this is worse than noise: **the rule grades model output.** A model that factors
retry-and-pcall into a helper scored worse than one that inlines a bare `pcall` — and
`datastore-without-retry`, four rules further down the same file, asks for exactly the helper that
`datastore-without-pcall` was penalising. Two rules in one file wanted opposite things, and the
one that fires at ERROR severity was the one asking for the worse code.

Fixed narrowly, because the permissive direction lets real bugs through. A helper counts as
protection only if it pcalls one of its **own parameters by name**. A helper that merely takes a
callback (`local function run(label, fn) return fn() end`) still fires, and so does a bare call.
Both are tests.

This is the third time this session that pointing a checker at our own code has paid: the domain
tagger's `wait()`-inside-a-string, the era claim about our own build coming back clean, and this.
The rules had run over model output and over corpus sources, and never over the repository that
ships them.

### F-51 · A lockfile disqualified a source, and the register already knew it shouldn't

Fetching 15 new sources ran the security gate over material it had never seen. Three checkouts
were flagged. One of the three was the scanner being right about something uncomfortable, one was
a genuine question for a human, and one was a false positive the codebase had already documented
without generalising.

**`evaera/Cmdr` was disqualified on its `package-lock.json`.** A lockfile is machine-written,
contains no executable Roblox code, and is opaque by construction — which is precisely what the
`unscannable` signal fires on. The `ACCEPTED` register in `scan.mjs` already carried a
hand-written acceptance for `Roblox/creator-docs`'s lockfile, whose stated reason was *"build
tooling rather than shipped content"* — the general rule, written down, applied to exactly one
source. Every future lockfile would have needed its own human review to say the same sentence
again.

Lockfiles are now excluded before scanning, by four exact filenames, reported rather than silent —
the same list `hash.mjs` has always used, for the analogous reason that two forks differing only
in a lockfile are the same content. The now-dead `ACCEPTED` entry was removed rather than left in
place, because an accepted-path entry that can never fire claims a human reviewed something the
scanner no longer reaches.

Deliberately narrow. `Roblox/react-luau` stays in REVIEW on a generated `docs/bench/data.json`,
which cannot be recognised by name, and where a human deciding is the correct outcome rather than
a gap.

**And the finding that is not a false positive.** `Quenty/NevermoreEngine` — 608 stars, the
highest-value source in the batch — is UNSAFE as a `remote-payload-loader`, and that verdict
stands. It ships `tools/studio-bridge/src/commands/console/exec/execute.lua`, a Studio bridge
whose *purpose* is executing arbitrary code, plus `loadstring` in a UI-converter plugin and three
test runners. The library's reputation is not evidence about what the code does, and a pattern
extracted from `execute.lua` would teach how to build an RCE bridge. It has not been added to the
`ACCEPTED` register: that register is for human-reviewed exceptions, and reviewing my own is the
thing §4 exists to prevent.

The temptation here is the whole point of writing this down. The exclusion cost the batch its most
valuable source, the fix was one register entry away, and the argument for it — *"it's Quenty, it's
obviously fine"* — is an argument from reputation about a security verdict.

### F-50 · Counting engine vocabulary inside comments, for the third time in this repository

The domain tagger's first run over the real corpus reported 2 bare `wait()` calls in
`Sleitnick/RbxCameraShaker`'s `src/CameraShaker/init.lua` (at lines 32 and 45), and 1 in
`Reselim/Flipper`'s `typings/Signal.d.ts`. (An earlier draft said 3; there are two.) Both counts were checked by opening the files rather than by trusting them.

Both CameraShaker hits are inside the usage example in the file's **opening doc comment**:

```lua
--[[ Usage:
     camShake:Shake(CameraShaker.Presets.Explosion)
     wait(1)
```

That matters more than a stray count, because **five shake and motion rules were extracted from
that source**, so an era claim about it is not idle: a tag saying "this teaches APIs that no longer
behave as assumed" would have been pointing at documentation.

The Flipper hit is `wait(): Parameters<T>` — a TypeScript method declaration for a method named
`wait`, in a `.d.ts`, with no relationship to the Roblox global. Era is a claim about Luau, and a
`.ts` file in a Roblox repository is tooling or typings.

The comment half is **the third occurrence of this exact defect class here**. F-43 is the roadmap
matching genre words in English prose and calling a shard collector a racing game.
`roblox-antipatterns.mjs` carries a `stripComments` written for the same reason, and its header
says so. Three independent scanners, three times the same mistake — vocabulary counted where the
language is not being spoken.

Fixed by blanking comment bodies before counting and scoping era markers to `.lua`/`.luau`. The
effect on the real corpus, all of it in the direction of fewer false claims:

| checkout | deprecated before | after |
| --- | --- | --- |
| `Sleitnick__RbxCameraShaker` | 2 | **0** |
| `ddust1n__CameraShaker` | 2 | **0** |
| `MadStudioRoblox__ProfileService` | 10 | 9 |
| `Reselim__Flipper` | 2 | 1 |
| `evaera__roblox-lua-promise` | 1 | **0** |

Library detection got the same scoping and lost a false positive with it: `Sleitnick/Knit` had been
detected as depending on `knit`, from a `require` inside a comment in Knit's own source.

`packages/corpus` is upstream of `packages/evals` and must not depend on it, so the stripper is
implemented locally and a test asserts it agrees with the eval harness's `stripComments` on a
battery of samples — comments, long-bracket comments, comment markers inside strings, and strings
inside comments. Divergence is caught by a test rather than prevented by a coupling, which is the
same arrangement the shared deprecation vocabulary already has.

### F-47 · Retrieval ranking returned a number for every source and had been dead the whole time

`retrievalRank()` orders the corpus. It was written, tested, and never once run against
data on disk. Running it as part of the quality-score work returned **0 for all 23 content
records** — not mis-ordered, not degraded: no source in the corpus was retrievable by it.

The cause is two stages being individually correct about different halves of one fact.
`scan.mjs` wrote its verdict to `record.security`, under a comment saying that is "where the
claim lives". `retrievalRank` gates on `p.security?.safe === true` where `p` is a **provenance**
record, and every provenance record still read `{safe: false, class: 'unscanned'}` — for all 170
of them. So `usable` was empty on every call and the function returned 0 every time.

`hash.mjs` had already established the convention that was missed:

```js
rec.contentHash = h.hash;
if (rec.provenance) rec.provenance.contentHash = h.hash;   // <- the mirror scan.mjs lacked
```

Fixed by mirroring the verdict. With real quality scores also populated, 23 of 23 sources now
rank and **17 of 22 positions changed** against the pre-quality ordering.

Two things made this survivable for so long, and both are worth naming. Every unit test passed,
because each stage's function was right about its own half and nothing tested the join. And the
function returned a plausible number rather than throwing — a zero that reads like a low rank
rather than like an empty result. `pipeline-data.test.mjs` now asserts against the data on disk
rather than against the functions: a scanned source must carry its verdict in both places, and no
licence-clear, security-clean record may rank 0.

### F-48 · Two records, one provenance id, and last-write-wins decided which verdict survived

Fixing F-47 revived 22 of 23 sources. `Roblox/creator-docs` stayed at 0.

A provenance id is `host/owner/repo/sha` and deliberately carries no path, because a file inside
a repository at a SHA has the same provenance as the repository. The seed manifest contains both
`gh-roblox-creator-docs` and a file-level citation of one `SurfaceType.yaml` inside it, and the
two mint **the same provenance id**. Only the first matches a checkout URL, so only the first was
ever scanned — and any consumer building an `id -> record` map got last-write-wins, which handed
`retrievalRank` the unscanned twin.

The verdict is about the repo at that SHA, so it belongs on every record naming that SHA. That is
not a workaround for the collision; it is what the identity already means. 23 of 23 now rank.

The general shape: **an identity that intentionally collapses several records is safe to read
through a map only if every one of those records is kept consistent.** The scan stage was writing
to one member of an equivalence class it did not know it was in.

### F-49 · A quality tagger that condemned a library for its own naming convention

The domain tagger classified `Reselim/Flipper` as `legacy` on 9 deprecated markers. Seven of the
nine were `:connect(`, the pre-2016 lowercase alias for `RBXScriptSignal:Connect`; the other two
were one `spawn/delay` and the `wait(): Parameters<T>` in a `.d.ts` that F-50 later addressed.
(An earlier draft said eight of nine. There are exactly seven `:connect(` occurrences in the
checkout, and the tagger's own `suppressed` report says so.)

Flipper does not use that alias. It ships its own userland `Signal` class —
`function Signal:connect(handler)` — and every flagged call site is a call into its own API. Regex
cannot type a receiver, so the marker could not tell a removed engine alias from a library's
method name, and the result was a tag that condemned a library for what it chose to call a method.
The tag exists to answer "will learning from this teach an API that no longer behaves the way the
code assumes?", and on Flipper it answered a question about naming instead.

Fixed with a signal that IS decidable: if a checkout defines its own `connect` method, its calls
are presumed to be its own. The suppression is per-checkout, and it is **reported** rather than
applied silently — a repo that defines `:connect` and also genuinely calls `part.Touched:connect(f)`
loses that finding, and that cost should be visible rather than absorbed. Flipper moved from a
false `legacy` to `unknown`: with the false markers removed it has too little era evidence either
way, which is the honest answer.

Worth noting what did NOT go wrong here. `MadStudioRoblox/ProfileService` shows 10 bare `wait()`
calls and is still tagged `modern` — correctly, because all ten are in `ProfileTest.server.lua`, a
test harness, while `ProfileService.lua` itself makes 32 `task.*` calls. Density-based
classification got that right where a presence test would have called it legacy.

### F-45 · A playbook that taught the mouse-only path a comment had already ruled out

Building L3 meant writing down, for each task class, the procedure and the Golem primitive each
step should reach for. The `button.interactive` playbook's `press` step named
`MouseButton1Down` as the primitive and `Activated` as the hand-rolled fallback.

Grading `Theme.luau` — the file the step was derived from — returned `manual`, meaning "attempted,
but bypassed the library". Reading why produced the opposite conclusion. `Theme.luau:1088`:

> ButtonA is the gamepad's activate, and it arrives through InputBegan on the button itself once
> that button holds selection. Without it the controller path fired `Activated` — so the game
> responded — while the control never looked pressed, which reads as an input that did not
> register.

A press arrives from three devices — mouse, touch, gamepad — and only one of them is a mouse
button. `Theme.luau` routes all three through `InputBegan`/`InputEnded` behind an `isPress`
predicate. The codebase had already learned this and written the reason down; the playbook was
a step **behind** the code it was supposedly extracted from, and would have taught a generator
the mouse-only path under the authority of the library.

Corrected: `InputBegan` with a device predicate is the primitive, a bare mouse-button signal is
the re-invention. `Theme.luau` now grades 4/4 `primitive`.

The general shape is worth naming, because L3 will keep producing it: **a playbook can encode a
procedure the codebase has already outgrown**, and unlike a stale rule it does so prescriptively.
Nothing about reading the rules would have caught it — the two rules cited by that step are both
correct and neither mentions an input event. It surfaced only from running the playbook against
real code and refusing to accept a `manual` verdict without checking the source.

### F-46 · An `ok: true` that meant "nothing was examined"

The first probe written to demonstrate L3's value called `audit(source, {})`.

`audit()` takes a structured spec — `{clusters, files, priceLayers, …}` — not a source string.
Passing a string destructures every field to `undefined`, runs **zero** of the eleven checks, and
returns `{ok: true, findings: [], enforced: 11}`. That `enforced: 11` is what makes it dangerous:
the result reports the size of the check set beside a clean verdict, and reads exactly like eleven
checks passing.

It was reported as evidence that the check layer is omission-blind. The layer *is* omission-blind
— `checkFocusFeedback` returns early on any file with no `MouseEnter` to contradict — but that
probe did not show it, and would have returned the same green for code riddled with violations.

Re-run as `audit({files: [{path, source}]})`, the finding held: 0 findings on a panel that does
nothing. The conclusion survived; the evidence for it had to be thrown away and redone.

This is the session's recurring shape arriving one level up. F-41, F-43 and F-44 were all *code
that had never run*. This was code that ran, returned green, and was **measuring nothing** — the
same defect as a test that asserts nothing. The regression test now asserts `enforced === 11`
against a spec that actually carries files, so an empty-spec call cannot masquerade as a clean run.

### F-44 · The motion probe measured one axis of a two-axis space

`MotionProbe.luau` exists so motion claims come from frames rather than from `TweenInfo`, and its
header is a careful record of two earlier probe designs that "produced confident WRONG answers".
It had never been run. An audit found no recorded execution and no persisted frame data.

Running it against the objective chip's slide motions reported:

```
posTravel  0.0 px      across 451 frames
```

`posTravel` was `travel(series, s => s.pos.Y)` — **vertical only**. The chip's entire motion
vocabulary is horizontal: `transition` and `swap` slide it out to the left and back in from the
right. None of the travel was vertical, so the probe returned zero.

Worse, `moved` is computed from these totals, so **a purely horizontal animation could be reported
as no animation at all** — a third confident wrong answer from the module written to stop exactly
that.

Both axes are measured now, and the same motion reports **1109.7 px**.

#### And the run set an honest ceiling on what this instrument can claim

497 frames over 45 seconds is **~15 fps** — Studio's render rate for this scene in play mode. The
motions are 180–300 ms, so a slide is resolved by **about three samples**. That establishes that a
motion happened, how far it went, and roughly where it peaked. It does **not** characterise an
easing curve, and the evidence file says so, because gate 6's PROVEN rating rested on the word
"measured" doing three different jobs at once.

---

### F-43 · The roadmap called a shard collector a racing game

`ROADMAP_SCAN_LUAU` is a 92-line evidence payload that the mission ledger cited as proof gate 19
was PROVEN — "it DOES scan the live place". An audit pointed out that was a **code-existence
claim written as an execution claim**: the payload had never run.

Running it against Crystal Canyon produced 76,496 bytes of real evidence — 1,159 instances, 974
parts, 34 scripts — and then this verdict:

```
genre       : racing
confidence  : 0
evidence    : ["the place calls itself a race"]
milestones  : race_track, race_vehicles, race_results
```

Crystal Canyon is a shard-collecting simulator. Three separate defects, one execution, and not
one of them findable by reading the code.

#### 1. Genre signals matched ordinary English in comments

`buildIndex` joined raw script sources, comments included. The two weight-3 signals that fired:

| signal | what actually matched |
|---|---|
| `racing` | "this waits for the profile it publishes rather than **racing** it" |
| `roleplay` | "a walkspeed of 16 for the rest of the **life**" |

Both are prose in a comment. The signal's own description is "a name the genre wears openly" —
openly means in its instance names and identifiers, not in an aside to a maintainer about thread
scheduling. `roblox-antipatterns.mjs` had already reached this conclusion for its own rules and
says so: *"a comment saying `-- never use wait()` must not fire the deprecated-API rule."*

String CONTENTS are still scanned, deliberately, and there is a test for it: a place that renders
"Coin Simulator" to a player is saying what it is, which is the opposite of an aside.

#### 2. A tie was reported as a verdict, decided by the alphabet

Racing scored 3. Roleplay scored 3. `ranked` breaks ties with `a.genre.localeCompare(b.genre)` —
correct for determinism, catastrophic as a decision — so **R-A came before R-O and the place
became a racing game.**

`confidence` is `margin / top.score`, so it was `0`, and the code's own comment already says a
6–4 win is "a coin toss dressed as a verdict". A 3–3 tie is a coin toss with no dressing at all,
and `buildRoadmap` committed to genre-specific milestones on it. A zero margin now returns
`unknown` and names both candidates.

#### 3. The scan never captured the place's own name

The deepest of the three. Every strong genre signal reads "the place calls itself X" — and
`ROADMAP_SCAN_LUAU` collected services, classes, named containers, GUIs, lighting and script
sources, and **never `game.Name`**. The single most deliberate statement of intent in a place
file was invisible to the detector that most needed it.

This is also why the test fixture had been leaning on a comment: `SIMULATOR` declared itself in
`-- Coin Simulator core loop` because there was nowhere else to put it. The scan captures the
place name now, and the fixture says it the way a real place would.

**What this cost to find: one execution.** The payload was reviewed, tested through its
TypeScript half, and cited as evidence for a PROVEN gate, and it had never been pointed at a real
place. Six new tests, 36 total.

---

### F-42 · A declared licence is a claim, and now there is a number for it

§H says a licence a publisher declares is a CLAIM, not evidence. That was policy; enumerating
the package registries turned it into a measurement.

Of **51 registry candidates resolved** — their repositories fetched and their actual LICENSE
files read — 46 had declared something in the index:

| | count |
|---|---|
| declaration CONFIRMED by a LICENSE file in the repository | 41 |
| declaration NOT confirmed, so quarantined | **5** |
| no declaration in the index at all | 5 |

**Roughly one in nine packages that declare a licence cannot prove it.** Four of the five
declared plain `MIT`. One declared `VFX-DL-1.1`, which is not an SPDX identifier at all.

That is the whole argument for resolving rather than trusting, expressed as a rate. A pipeline
that had accepted the index's word would have taken five unlicensed packages into a corpus whose
entire claim is that everything in it may lawfully be learned from.

Two further facts worth keeping:

- **Only 1,082 of 6,410 registry packages declare a repository URL at all.** The other 5,328
  cannot be resolved, cannot be licence-checked, and therefore cannot enter the corpus by any
  route. The registries are far less usable as a corpus than their headline size suggests, and
  "6,588 packages, 30× the seed floor" was never 30× of anything that could be used.
- **The earlier one-off count was wrong.** It reported 781 Pesde packages; the index holds 601
  package files plus 180 `scope.toml` and one `config.toml`. It counted scope metadata as
  packages, ~30 % high, and the mission ledger cited that figure as evidence for a PROVEN gate.

Real third-party data also broke two things that clean data never would. `https://www.github.com/
…` — a form GitHub itself serves — was rejected by the seed validator's regex. And one malformed
candidate aborted the whole import, because `loadSeeds` is deliberately unforgiving: correct for
a hand-written manifest where a typo is a mistake, wrong for 1,082 URLs typed by 1,082 strangers,
where a few oddities are the expected condition. Registry candidates are now skipped and
**counted**; hand-written seeds still throw.

---

### F-41 · Three bugs found by running code that had never run

An independent audit found that `contenthash.mjs`, `dedupe.mjs` and `records.mjs` — **784 lines
of production code with 766 lines of passing tests** — were imported by no non-test file. Every
provenance record carried `contentHash: null`; not one ContentRecord existed. Separately,
`security.mjs` (35 KB, 31 KB of tests) had never been run either, and all 217 records read
`security.class: "unscanned"` while fifteen sources had already been read closely enough to
extract 48 design rules from them.

Writing the two runners found three defects, and none of them was findable by reading.

#### 1. A bare identifier read as an executor

`remote-payload-fetch` matched `/\bgame\s*:\s*HttpGet\(|\bHttpGet\(|.../i`. The detector's own
comment justifies it with "`game:HttpGet` is an executor extension; honest code reaches
HttpService" — reasoning that applies to the **receiver** form. The second alternative was a bare
`\bHttpGet\(` which, with `/i`, matches any function anyone has named `httpGet`.

It fired five times in `evaera/roblox-lua-promise`'s `docs/WhyUsePromises.md`, a tutorial whose
subject is wrapping `HttpService:GetAsync` in a Promise, and classified one of the most widely
used packages in the ecosystem as exploit code. Requiring the receiver colon keeps every true
positive.

#### 2. Checkout directories collided, and forks collide worst

`fetch.mjs` named checkouts by bare repo name. Fetching both `LolplePlays/framer` and
`Starstruck-Studios-Developers/framer` wrote them to the **same directory**, so the second clone
updated the first out of existence and the corpus held one fork where it believed it held two.
Provenance survived only because `recordAll` reads the git remote rather than trusting the name.

Not a one-repository accident: `framer`, `signal`, `promise`, `janitor` and `maid` all exist
several times over, and **a fork always shares its upstream's name** — so the collision is
likeliest in exactly the case §J cares about most.

#### 3. `isDivergent` answered `false` for every pair of records

The worst of the three. `similarity()` accepted anything, so a ContentRecord — the type the rest
of the module is built around — stringified to `"[object Object]"`, which shingles to **one
token, identical for every record**. Two records sharing not a single file scored a perfect
`1.0`:

```
similarity(recordA, recordB) === 1      // for ANY two records
isDivergent(anything, anything) === false
```

§2 exists to stop one idea being counted twice. This silently collapsed **every** idea into one.
It never fired in production because nothing called it — and the first caller was the runner
written to close that very gap, which nearly published the wrong answer about two real forks.

`similarity`/`isDivergent` now refuse anything that is not text or a signature, with an error
pointing at `recordSimilarity`; `recordDivergent` is the record-shaped API and returns `null`
rather than guessing when there is no evidence.

#### And then the fix for the false positives was itself attacked

Three sources came back unsafe on shapes that were plainly benign — Roblox's own OpenAPI specs
declaring `.ROBLOSECURITY` as an auth **parameter**, a policy page naming `getfenv` in order to
**prohibit** it, two Rojo sourcemaps. The obvious fix was to downgrade the shape detectors on
data and prose files.

**Three independent attacks each found a working hole**, verified against the live scanner: a
Luau loader as a 1,400-entry numeric array in `.json`, a cookie stealer as 2,500 hex characters
in `.toml`, and a numeric array inside a `.md` fenced block. All three route around every
*vocabulary* rule by encoding the payload, which leaves the shape detectors as the only thing
that can see them.

So the discriminator is not the file's extension, it is whether the long line is **opaque**.
Generated JSON is long because it is structured; a payload is long because it is one alphabet.
All three attacks stay condemned and all three false positives clear, and all six are permanent
tests.

**The shape of all of this**: five separate defects, in code that was tested, reviewed and
believed to work, none of them reachable by reading it. The tests were right about the functions
and the functions were never called by anything real.

---

### THE FACET PATH IS CLOSED — 2026-09-01, by owner decision

Gate 2 has now had **five** distinct approaches and every one of them is closed. Written here as
a single list so the sixth attempt starts from the boundary rather than from the beginning:

| # | approach | outcome | why it failed |
|---|---|---|---|
| 1 | Cube-generated mesa meshes | **closed** (F-13) | a generated mesh arrives TEXTURED, and a textured mesh cannot be tinted into a flat-shaded palette — so it is either already in the world's language or it cannot be made to be. Rejected on sight in-world after rendering well alone. |
| 2 | Raise the mesh:primitive ratio | **closed** (F-19) | 0.62 → 0.85 improved every number (Cliffs 157 → 136, world 497 → 482) and changed no pixels, because what the eye reads is the authored courses BEHIND the mesh. |
| 3 | Raise the batter | **closed** (F-33) | 2.0–6.6° → 5.7–12.6° moved the Lambert MEAN 15 % and left the SPREAD at 15 %. Every face brightened together, so nothing separated from anything. |
| 4 | Decorate the box — weathering chamfer, broken crest, buttress, ramp cap | **closed** | four separate additions to a stack of slabs; the stack was still what the eye read. The owner's §4 closed this family explicitly. |
| 5 | **Oriented facets over a wide pitch/yaw/roll spread** | **closed here** | the geometry did exactly what it promised — `N·L` from an 11 % band to [0.10, 0.94] — and the wall still rendered as a flat panel across five captures. |

#### What #5 actually established, since it is not nothing

The diagnosis was right and is now measured rather than argued: the old wall's faces sat inside
an **11 % band of one Lambert value**, and that is a complete explanation of why #2, #3 and #4
all failed. Any future attempt that adjusts one shared parameter across all faces will fail the
same way, and now there is a number for it.

What #5 disproved is the **inference** drawn from that diagnosis — that spreading the normals
would therefore spread the pixels. It does not, because `N·L` is not the delivered pixel: under
`OutdoorAmbient (146,152,158)`, `Ambient (112,116,122)`, `EnvironmentDiffuseScale 0.55` and
`Brightness 3`, the ambient floor compresses a 9.5× geometric range into something far flatter on
screen. Baking the pitch into the **albedo** instead is measurable (58 % / 91 % value spread) and
still not sufficient.

**So the closed claim is specific: orientation is not the lever for gate 2 in this lighting.** It
is not "faceting is wrong" in general — it is that this world's ambient floor will flatten any
purely geometric answer, and a sixth attempt must therefore move something that ambient light
cannot compress.

#### The code stays, and that is a separate decision from the path

Closing the path does not mean reverting the construction, because the construction carries wins
that are independent of the picture:

- **enclosure 1 floor-level breach → 0** (and 0 of 512 samples after the apron)
- **Cliffs 164 → 136 primitives**, world 513 → 485 before the apron
- **the dominance ceiling is now enforced** (`CW.FACET_MAX_TOP`) where before nothing capped a
  cliff's height at all — the ratio held at 1.32 against a 1.25 gate *because* of that cap
- **the stream fingerprint**, which is a new capability the whole file now benefits from
- the F-36 seal floor and the seal-as-back-plane sizing, both of which the apron's ramps were
  then surveyed against

Reverting would give back a flat 11 % wall, one live escape route, 28 more primitives, no
dominance cap, and would invalidate the ramp corridor survey. The picture is a wash; everything
else is better. It stays.

#### What is left untried, for whoever picks this up

The evidence points away from geometry and toward **the frame** rather than the surface: in the
canonical capture the wall is roughly 50 studs away and each facet is 20–40 studs, so the camera
sees a handful of large quads however they are angled. The untried levers are composition
(how much of the frame the wall occupies, and what stands in front of it), and surface detail at
a scale smaller than a facet. Neither is a variation on #1–#5.

---

### F-39 · The facet rewrite: the machinery is right and the picture is not

The fifth attempt at gate 2 ("the orange/red perimeter is visibly repeated rectangular blocks").
It is recorded here **while still unproven**, because the honest state of it is the useful part.

#### The diagnosis, which I still believe

Every previous attempt changed the wall's SILHOUETTE or its material and left its SHADING alone.
With `batter = -rand(0.035, 0.115)` and yaw at most ±7°, every authored face in the ring sat
between 2.0° and 6.6° off vertical — Lambert `N·L` in [0.556, 0.624], an **11 % band across a
500-stud surface**. That is a flat panel with lines drawn on it, whatever its outline does.

It also explains F-33 better than F-33's own entry does. Raising the batter to 5.7–12.6° moved
`N·L` to [0.612, 0.702]: the **mean rose 15 % and the spread stayed 15 %**. Every face brightened
together, so nothing separated from anything. That is the general trap for any change that
adjusts one shared parameter across all faces, and it is worth naming.

#### What was built

A facet vocabulary — `WedgePart` / `CornerWedgePart` / `Block` over ±32° yaw, −22°..+38° pitch,
±18° roll — drawn from a shuffled five-archetype deck with adjacency repair, standing forward of
a buried sealing course by a per-segment standoff so the wall's plan meanders. Pitch comes from a
per-archetype **ladder**, not an independent draw, because a wide range sampled independently
still produces near-identical neighbours.

Axis conventions were **measured, not assumed** (F-14 was exactly a wrong guess about a wedge's
local axes): raycasting a 12-stud cube of each from above on a 5×5 lattice shows a `WedgePart` is
thin on its LookVector side and full behind it, and a `CornerWedgePart`'s apex is at +X on the
LookVector side.

#### What is genuinely proven

| | before | after |
|---|---|---|
| stream fingerprint | `0.35833105581491947` | **identical** |
| world primitives | 513 | 485 |
| Cliffs primitives | 164 | 136 |
| dominance ratio | 1.37 | 1.32 (gate is 1.25) |
| floor-level breaches | 1 | **0** |
| cliff albedo spread | one of 3 band tones | 58 % meadow / 91 % frost |

The fingerprint is the one that matters most. A wall this different consumed the shared seeded
stream **bit-identically**, so every before/after comparison in this entry is a comparison of one
variable. That was achieved by keeping every draw site in place and routing the retired
geometry's arguments through `discard`, rather than by extracting a program table — the draw
sequence has three short-circuits in it and any one transcribed wrongly is F-32 again, silently.

#### What is NOT proven, and this is the point

**The picture did not improve.** Five captures from the canonical `meadow-wall` camera, across
five iterations, and the wall still reads as a large flat red panel. The first iteration was
visibly WORSE than what it replaced. Three real defects were found by looking rather than by
measuring, and each is recorded on the code that caused it:

1. The seal kept `courseFraction[1]` = 0.46 from a construction where it was the bottom of a
   stack. With the stack gone, TALUS and BREACH segments left the wall a 16-stud band.
2. `BREACH` sized against the saddle's own reduced height, so its shoulders finished **below**
   the sill they were opening — the notch was hidden behind the thing it notched.
3. `TALUS` as a whole outer-ring segment is a long low mass, and the deck dealt two side by side
   on the most-photographed stretch of the world.

All three are fixed. The wall is now taller, encloses better, costs less and has real albedo
variation — and from the canonical camera it is at best marginally different.

#### The lesson, which is the reason this entry exists

The design plan's central number was `N·L`, and `N·L` is not the pixel. This world runs
`OutdoorAmbient (146,152,158)`, `Ambient (112,116,122)` and `EnvironmentDiffuseScale 0.55` under
`Brightness 3`; that ambient floor compresses a 9.5× geometric spread into something far flatter
on screen. The plan flagged this risk and then reasoned past it, and so did I — for four
iterations, while every metric in the pass improved.

Baking the pitch into the **albedo** was the response, and it is measurable (58 %/91 % value
spread) and still not sufficient. What the evidence now points at is that a few large tilted
quads do not read as rock at this scale whatever their tone; low-poly rock reads through **many
smaller facets with visible tonal steps between them**.

§5 of the owner's ruling is explicit that gate 40 may not be argued upward from metrics. This
entry is that rule applied to my own work: better numbers, no better picture, and the gate stays
where it was.

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
