# The inline playtest viewport

How a user watches their game run, from inside the conversation, without being
lied to about what they are looking at.

---

## 0. The constraint that decides everything

**Roblox gives Studio plugins no viewport readback.** There is no screenshot of
the user's Studio window and no video stream to subscribe to, at any price.

This is not an inference. Both candidate APIs were tried against real Studio and
both failed, and the findings are recorded at the top of
`apps/plugin/src/Render.luau`:

| API | Result |
| --- | --- |
| `ThumbnailGenerator` | Not a valid service for plugins. |
| `CaptureService` | The callback **never fires** in edit mode. |

There is also no third option hiding behind a paywall: Roblox exposes no
plugin-facing frame buffer, no `ViewportFrame` readback, and no render-target
capture. A "live view of Studio" is not expensive here — it is **absent**.

So the honest question is not "how do we stream video" but "what real pixels
*can* we produce, and how do we present them without implying they are
something they are not".

### What we can produce

The plugin runs **its own depth-buffered triangle rasteriser in Luau**
(`Render.luau`, pre-existing). It walks `workspace:GetDescendants()`, projects
each `BasePart` as a box, and shades it with a Lambert term and a material
response curve. The output is real computed pixels of the real scene.

**One property makes this genuinely useful for a playtest**, and it falls out of
a hazard documented elsewhere in this repo. Per `apps/worker/src/playtest.ts`,
`RunService:Run()` does **not** create a separate play DataModel — server
scripts execute against the *edit* DataModel, the one the plugin can see. That
is a serious hazard for data loss (which `run_and_check` contains with a
checkpoint and a census). It is also the reason the rasteriser observes **live
simulation state** during a playtest rather than a frozen scene: a platform that
moves, a door that opens, a part a script spawns, all appear.

### What these frames can never contain

Stated here because the UI is required to say it, and a test enforces that it
does:

- **No characters.** Run mode is a server simulation; no player spawns.
- No particles, no shadows, no `PointLight`s, no post-effects, no textures,
  no decals, no `MeshPart` geometry beyond its bounding box.
- Flat Lambert, one fixed sun, one sky colour, one ground colour.

**Therefore the card never says "live video", "stream", or "viewport".** It says
*"Rasterised geometry from Studio — not a viewport capture."* This is asserted
by `apps/web/tests/playtest-viewport.test.mjs`, which greps the component for
banned phrasing, so the guarantee survives a future copy edit.

---

## 1. The frame path, end to end

```
Studio (user's machine)                Cloudflare                     Browser
─────────────────────────              ──────────────                 ───────
run_and_check
  │
  │ capture loop (worker-driven, clock-paced)
  │
  │◄──── render_view op ────────────── SessionDO.execStudioOp
  │      (long-poll response)            │  op queued, pollWaiter fires
  │                                      │
  Render.renderView(eye, 160x100)        │
  │  rasterise on main thread            │
  │  base64 packed RGB (~62.5 KB)        │
  │                                      │
  └───── OpResult on next poll ────────► admitFrame()
                                         │  size cap
                                         │  pixel cap
                                         │  payload/dimension agreement
                                         │  re-pack: RLE or raw, whichever wins
                                         │      (~5 KB after RLE)
                                         ▼
                                       FrameRing (in-memory, bounded)
                                         │
                                         └── broadcast studio_frame ──► canvas
                                             broadcast playtest_state ─► card
```

### 1.1 Capture — no new plugin op

The capture uses the **existing `render_view` op**, at a size the installed
plugin already clamps into range (`Render.capture` clamps to 48–320 × 32–240;
we ask for 160×100).

This was a deliberate constraint, not a convenience. Per
`apps/worker/src/plugin-version.ts`: Roblox has **no automatic plugin updating**
— Studio has per-plugin "Update" buttons a human clicks, confirmed by Roblox
staff on 2026-04-27. A new op would be broken for every currently-installed
plugin until each user manually updated, with no push channel to rescue anyone.

**So this capability ships to the entire installed base with no protocol bump
and no plugin release.** `Version.PROTOCOL` stays at 1.

### 1.2 Pacing — clock-driven, not count-driven

The loop in `run_and_check` captures a frame, refreshes the console counts every
other pass, then sleeps only for the *remainder* of the interval. A rasterise
that takes 800 ms eats into the wait rather than extending the run, so the
playtest still lasts exactly the seconds the agent asked for.

`PLAYTEST_FRAME_MIN_INTERVAL_MS = 1500` is a **floor on the capture rate, and it
is not primarily about bandwidth.** The rasteriser runs synchronously on
Studio's main thread: every frame briefly freezes the user's editor and stalls
the simulation being observed. Asking faster would degrade the thing being
watched, which is the one cost a viewport must not impose.

It is a floor on the interval, not a token bucket, precisely so that no burst is
possible after an idle period — a burst of rasterises is exactly what stalls
Studio. Asserted in `frame-bus.test.mjs`.

### 1.3 Transport — measured, and adaptive

The plugin emits uncompressed base64 RGB. At the playtest size that is 62.5 KB
per frame, or **2.44 MB/min** at a 1.5 s cadence — too much to stream.

The worker re-packs each playtest frame with **RLE24** (`[count 1..255][r][g][b]`)
and keeps whichever of RLE and raw is smaller. RLE suits this producer for a
structural reason rather than a hopeful one: the rasteriser is flat-shaded, so
it fills whole spans with one sky colour, one ground colour, and one colour per
visible quad face. There is no gradient, texture or dither anywhere in its
output.

Measured on synthetic frames built to that structure:

| Size | Raw base64 | RLE base64 | Ratio |
| --- | --- | --- | --- |
| 288×180 (critique render) | 202.5 KB | 9.0 KB | 22.4× |
| 192×120 | 90.0 KB | 6.0 KB | 14.9× |
| **160×100 (playtest)** | **62.5 KB** | **5.0 KB** | **12.5×** |
| 128×80 | 40.0 KB | 4.0 KB | 10.1× |
| 96×60 | 22.5 KB | 2.9 KB | 7.7× |

**RLE is not unconditionally smaller.** On high-entropy input every run is
length 1 and the encoding costs 4 bytes per pixel instead of 3 — measured at
**1.33× larger**. A compressor that can silently inflate its input is a bug
waiting for the one busy scene that triggers it, and that is exactly when
bandwidth matters most. So the encoder tries both and keeps the winner, tagging
the frame with `encoding: 'rgb24' | 'rle24'`.

An **absent `encoding` means `rgb24`**, so every frame emitted before the field
existed decodes correctly without the decoder knowing the field was added.

#### Bandwidth per minute

| Cadence | Frames/min | Raw | RLE |
| --- | --- | --- | --- |
| every 1.5 s (the floor) | 40 | 2.44 MB | **0.20 MB** |
| every 2 s | 30 | 1.83 MB | 0.15 MB |
| every 3 s | 20 | 1.22 MB | 0.10 MB |
| every 5 s | 12 | 0.73 MB | 0.06 MB |

A playtest is additionally capped at `PLAYTEST_FRAME_BUDGET = 40` frames, and
`run_and_check` accepts 2–15 seconds, so a single playtest's worst case is
~10 frames ≈ **50 KB**. The 40-frame budget is headroom, not the expected cost.

`frame-bus.test.mjs` asserts the per-minute figure stays under 512 KB rather than
leaving it as a claim in prose.

#### Latency

End-to-end frame latency is **rasterise time + long-poll round trip**:

- The `pollWaiter` in `SessionDO.handlePluginPoll` fires the moment an op is
  queued, so an op does not wait out the poll hold. Measured previously in this
  repo: op pickup is under 2.5 s with the hold in place, versus 6.5–10.4 s with
  the 20 s backoff that was tried and reverted.
- Rasterise time is the dominant and variable term. It scales with parts × faces
  × covered pixels and is not bounded by anything the worker controls, which is
  why the capture op gets an **8 s timeout** and a timeout is recorded as a
  dropped frame rather than a longer freeze.

**The system therefore does not promise a frame rate.** It promises that the age
of whatever is on screen is stated truthfully, which is section 3.

### 1.4 Storage and eviction — nothing durable

Frames live in a **bounded in-memory ring on the SessionDO instance**
(`FrameRing`, 6 frames / 512 KB, whichever binds first, evicting oldest).

They are **never written to durable storage.** A run's worth of frames would be
megabytes of durable writes to show something the user was already watching, and
losing them on eviction costs nothing that matters — the tool trace and results
are what need to survive.

The ring exists for exactly one case: a browser attaching mid-playtest (a
refresh) gets the last few frames replayed immediately instead of a blank card
until the next capture tick. Replayed frames keep their **original
`capturedAt`**, so the staleness the card computes is the truth about when they
were rendered, not about when the socket opened.

**No new infrastructure.** `wrangler.jsonc` binds no R2 bucket; nothing here
needs one. KV and D1 are bound but wrong for hot ephemeral pixels. This design
adds no paid capacity.

### 1.5 Association with a run

Every playtest frame carries `playtestRunId` and a monotonic `seq`. The card
shows **only frames matching its own run id**, ordered by `seq`.

This matters because the same socket also carries the agent's build renders —
a different camera, at a different size, taken at a different time. Showing one
of those inside a Playtest card would put a picture of the static scene under a
"run mode is live" label, which is precisely the class of lie this feature has
to avoid. Asserted in `playtest-viewport.test.mjs`.

---

## 2. Admission control

Before `frame-bus.ts`, `emitFrame` forwarded whatever the plugin handed it.
Three gaps, each with a concrete failure:

| Gate | Failure it prevents |
| --- | --- |
| **Size** — 320 KB base64 ceiling | The frame body is a base64 string produced on the user's machine. A bad clamp or a tampered plugin could hand the DO an arbitrarily large string, which it would forward for the browser to allocate or die trying. |
| **Pixels** — 320×240 ceiling | Matches the plugin rasteriser's own clamp, so a frame larger than the renderer can produce cannot be one this worker asked for. |
| **Dimensions** — payload must match `width×height×3` | Dimensions and payload arrive as independent claims. Disagreement makes the browser paint garbage, or read past its buffer, with no error anywhere. |
| **Rate** — 1500 ms floor, 40-frame budget | A capture loop with no floor is a flood, and each frame freezes Studio's main thread. |
| **Eviction** — 6 frames / 512 KB | An unbounded buffer inside a long-lived Durable Object. |

**Nothing is repaired.** Every failure drops the frame and records the reason in
the oplog. A frame resized, padded or truncated into shape is a picture of
something that was never rendered, and the premise of this whole surface is that
the pixels are real. A payload *longer* than needed is fine and expected — the
plugin's encoder pads to a 3-pixel group boundary.

### Tenant scoping

**Structural, not a runtime check.** The ring and the playtest record are fields
of the `SessionDO` instance, and a `SessionDO` is addressed by project id
(`idFromName(projectId)`). There is exactly one per project and no code path
hands a frame to a different one.

The reader set is already constrained: `/ws` refuses any socket whose
`X-User-Id` is not the bound `ownerId`, and `/api/projects/:id/*` routes go
through `withOwnedProject`. So the set of eyes on a project's frames is that
project's owner's sockets. Frames cannot cross a tenant boundary without an op
first being routed to the wrong Durable Object — at which point the frame is the
least of the problem.

Nothing in this change touches auth, quota or budget. The capture path spends no
model tokens: it is `render_view` and `get_logs`, both plain Studio ops.

---

## 3. The degraded states

**This is the part that matters most, and the reason the card is written the way
it is.**

A viewport is the most credible surface this product has. A moving picture of a
game reads as ground truth even when every other element is hedged, and a user
will believe their eyes over any text beside them. That credibility is exactly
what makes a stale frame dangerous: a render from four minutes ago, shown
without qualification, tells the user their build is fine long after it stopped
being fine.

So **freshness is a function of the pixels' own timestamp and nothing else.**
Not the phase, not the socket being open, not a frame having arrived at some
point.

| State | Trigger | What the card does |
| --- | --- | --- |
| `none` | No frame yet | "Run mode is live — waiting for the first frame". Empty stage. |
| `fresh` | age < 6 s | Green chip, full-brightness frame, "Run mode is live". |
| `stale` | 6 s ≤ age < 20 s | Amber chip, **frame dimmed and desaturated**, veil reading "Ns old", banner explaining a large scene takes longer to rasterise. |
| `dead` | age ≥ 20 s | Red chip, dimmed frame, veil "Last frame · Ns ago", banner "Frames have stopped arriving." |
| offline | `studio.connected === false` | Banner: the picture is the last frame that arrived **before the bridge dropped**. |
| failed | Playtest refused/aborted | The real reason, e.g. the protective checkpoint could not be taken. |

Four states, not a boolean, because **"waiting for the first frame" and "the
stream died" need opposite copy** — one is patience, the other is a problem, and
a two-state model renders them identically.

**A stale frame is still shown.** Hiding it throws away the last thing we
actually know about the game; showing it unmarked is a lie. So it is shown,
dimmed, over its real age.

Three further rules, each enforced by a test:

- **The state chip's colour is bound to `view.freshness`, never to the run
  phase.** A chip keyed off phase would stay lit green while frames had stopped.
- **The card re-derives on a 1 s interval**, not only when a message arrives.
  A card that updated only on messages would freeze its age readout at the exact
  moment the stream died.
- **A finished playtest's final frame is dimmed too.** It is a real picture of a
  moment that has passed, and the card must not present it as the state of the
  game now.
- **A dropped frame never advances `lastFrameAt`.** If a failed capture
  refreshed the timestamp, a stream that had stopped delivering would look
  permanently current.

Dropped frames are shown (`3/4 frames`) rather than hidden, so a stuttering
stream reads as stuttering rather than as slow.

---

## 4. What the card reports, and where each number comes from

Every field is a fact the worker observed, at a moment it can name.

| Field | Source |
| --- | --- |
| Test state | `PlaytestRun.phase`, set at real transitions in `run_and_check` |
| Elapsed | Worker timestamps (`startedAt` → `endedAt ?? now`), **not** a browser timer started at mount — a card that mounted late would under-report a run already in progress |
| Current action | The worker's own word for the step executing |
| Console errors/warnings | Counted from real `LogService` entries returned by `get_logs` |
| Frames delivered / dropped | Counted at the admission gate |
| Frame age | `now − frame.capturedAt` |

Console counts **replace** rather than accumulate, because `get_logs` returns a
trailing window of history — adding successive reads would report one error as a
rising cascade.

An unreadable log payload parses to `null`, never to an empty success. "We did
not look" and "we looked and it was clean" are different facts and only one of
them is safe to render as a zero.

---

## 5. What is real, and what is not

**Real and shipping:**

- Capture via the existing `render_view` op — works on every installed plugin,
  no protocol bump.
- The worker-side capture loop inside `run_and_check`, replacing a blind
  `sleep(secs)`.
- Admission control: size, pixel, dimension, rate, budget, eviction.
- Adaptive RLE/raw packing, with a decoder in the browser proven to agree with
  the encoder across the package boundary.
- The `PlaytestCard`, all its states, and the staleness clock.
- Mid-run reconnect replay from the frame ring.

**Deliberately not built:**

- **Video of any kind.** Not possible; see §0.
- **A dedicated `playtest_frame` plugin op.** A protocol bump would strand every
  installed plugin until each user manually updated. The existing op is
  sufficient; revisit only if a future plugin release is happening anyway.
- **Durable frame storage / scrub-back through a whole playtest.** Megabytes of
  durable writes for something already watched. The ring holds enough to survive
  a refresh.
- **"Open in Studio".** The `PlaytestCard` accepts an `onOpenStudio` prop and
  renders the button when it is supplied; **no caller supplies one yet.** Roblox
  exposes no documented URL scheme a web page can use to focus an already-open
  Studio window at a specific place, and shipping a button that dead-ends would
  be worse than not shipping one. The prop is the seam for when a real mechanism
  exists.

**Not measured against live Studio.** Every number in §1.3 is computed from
synthetic frames built to match the rasteriser's output structure (flat sky and
ground fills, flat-shaded quads), not captured from a real session. The
compression ratios and byte counts are arithmetic on those frames and are
reproduced by the test suite; the **rasterise latency inside Studio is not
measured here at all**, which is why the design refuses to promise a frame rate
and instead makes the age of every frame visible.

---

## 6. Tests

| Suite | Count | Covers |
| --- | --- | --- |
| `apps/worker/tests/frame-bus.test.mjs` | 28 | Size cap, pixel cap, dimension/payload agreement, rate floor, budget, no-burst, eviction on count and bytes, RLE round-trip incl. runs > 255, malformed streams, and the property that packing never inflates |
| `apps/worker/tests/playtest-stream.test.mjs` | 22 | Terminal-run freezing, elapsed freeze and non-negativity, four-state freshness with exact boundaries, drops not advancing the frame clock, console counts replacing not accumulating, log unwrapping across wire shapes, closing out a run abandoned mid-playtest |
| `apps/web/tests/playtest-viewport.test.mjs` | 28 | Old frame never labelled live, stale shown *and* marked, waiting ≠ dead, run scoping, build renders never adopted, seq ordering, decoder refusing partial pictures, encoder/decoder agreement across the package boundary, banned copy |

78 new tests. All offline and deterministic; none makes a network call.
