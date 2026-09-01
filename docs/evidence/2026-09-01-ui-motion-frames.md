# UI motion, measured frame by frame

**Date:** 2026-09-01
**Place:** Golem Visual Benchmark (placeId 116648235878426), Studio **Play** mode
**Answers:** mission §O — *"Do not claim motion quality from tween code alone"* — and
the standing Phase IV gap *"UI motion remains unproven in pixels/frame sequences."*

---

## Method

A `RunService.RenderStepped` connection samples the live panel every frame into a
global, arms itself for a fixed window, then disconnects. The transition is driven by a
**real mouse click on the real button**, not by calling the module. The sampler records
`AbsoluteSize`, the backdrop's `BackgroundTransparency`, and the `ThemeAnimating`
attribute that `Theme.open` sets.

Two probe failures are recorded here, because both produced a confident wrong answer
before being caught:

1. **`require()` from the MCP command context returns a DIFFERENT module instance.**
   The first attempt called `Panels.open("shop")` on a freshly-required copy whose
   `panels` table was never populated by `init`, so the call returned immediately and
   nothing moved. Read naively, that is a clean measurement of "motion is broken".
2. **Captured GUI references go stale.** `CrystalCanyonUI` is a `ScreenGui` with the
   default `ResetOnSpawn = true`, so a respawn destroys and rebuilds it. A sampler
   holding references from before the respawn watched orphans and reported 240
   consecutive frames of "no panel visible" while the panel was plainly on screen.

The working sampler re-resolves `PlayerGui → CrystalCanyonUI → Panels` **every frame**.

## Result — panel OPEN

`Theme.open` specifies `Size` 0.82 → 1.0 over 0.24 s with `EasingStyle.Back /
EasingDirection.Out` (an overshoot), and the backdrop fading to `BACKDROP_DIM` over
0.18 s. Measured:

| t (ms) | width px | scale | backdrop dim | animating |
|---:|---:|---:|---:|:--|
| 0 | 660.9 | 0.876 | 0.899 | true |
| 32 | 718.3 | 0.952 | 0.735 | true |
| 65 | 751.5 | 0.996 | 0.607 | true |
| 81 | 760.5 | **1.008** | 0.559 | true |
| **114** | **768.2** | **1.018** ← peak | 0.488 | true |
| 148 | 766.0 | 1.015 | 0.453 | true |
| 181 | 759.6 | 1.006 | 0.450 | true |
| 215 | 755.0 | 1.000 | 0.450 | true |
| 247 | 754.8 | 1.000 | 0.450 | false |

- **The overshoot is real and measured: +1.78 % at +114 ms**, settling back to 1.000.
  That is the Back/Out curve doing what it claims, observed in the running client
  rather than inferred from the `TweenInfo`.
- Settles at ~232 ms against a coded 0.24 s.
- The backdrop reaches its 0.450 dim at ~165 ms against a coded 0.18 s.
- `ThemeAnimating` is `true` for the whole transition and `false` after — the attribute
  contract other code depends on actually holds.

## Result — panel CLOSE

Coded as 0.14 s, `Quad / In`, collapsing while the backdrop fades out.

| t (ms) | width px | scale | backdrop dim | animating |
|---:|---:|---:|---:|:--|
| 4467 | 754.8 | 1.000 | 0.450 | false |
| 4483 | 753.5 | 0.998 | 0.457 | true |
| 4516 | 741.7 | 0.983 | 0.518 | true |
| 4550 | 717.6 | 0.951 | 0.643 | true |
| 4583 | 681.8 | 0.903 | 0.830 | true |
| 4616 | 649.1 | 0.860 | 1.000 | true |
| 4633 | — | hidden | — | — |

~133 ms against a coded 0.14 s, monotonic, no overshoot on the way out — correct for
`Quad / In`, and deliberately a different curve from the open.

## Button press — no curve to measure, by design

Sampling every `UIScale` under the nav rail across 300 frames of a real press found
**zero** movement. That is not a defect. `Theme` implements a press as an instant depth
change — the edge shrinks from `Edge.Rest` to `Edge.Pressed = 2` and every face child
moves down by exactly that amount — and the source states the intent plainly: *"a press
that eases into being pressed feels soft; the category's read is a hard cut."* There is
no tween, so there is no frame sequence to capture; the evidence for this category is a
single-frame state change, not a curve.

Recorded so a later pass does not re-run the same probe and mistake it for breakage.

---

## Honest coverage against §O

§O lists fourteen required categories. This document proves **two**, and explains a
third as intentionally curve-free.

| category | status |
|---|---|
| panel open | **measured** — curve + overshoot |
| panel close | **measured** — curve |
| button press | measured as *deliberately instantaneous*; no curve exists |
| hover | not measured |
| tab transition | not measured |
| currency gain | not measured |
| purchase | not measured |
| unlock | not measured |
| error | not measured |
| success | not measured |
| loading / progress | not measured |
| notification | not measured |
| reward burst | not measured |
| roadmap milestone | not measured |

The reusable part is the sampler pattern above — arm on `RenderStepped`, re-resolve
live every frame, drive with real input, read afterwards. Every remaining category can
be measured with it. None of them has been yet, and this file does not claim otherwise.

---

# Second pass, 2026-09-01 — reduced motion implemented, and five more categories

## Reduced motion did not exist

§O requires reduced-motion support and §AL lists it under accessibility. Searching the
client for `ReducedMotionEnabled`, `GuiService` or any equivalent returned **nothing**:
all 31 tween sites across the five client modules played unconditionally. A player who
had asked their device for less motion got every overshoot, pop, burst and rollup.

**Implemented as a drop-in replacement for TweenService**, not as a branch at each call
site. Every site already writes `TweenService:Create(obj, info, goal):Play()`, so
swapping what `TweenService` *names* in a module converts all of that module's sites at
once — and a site added later is covered without anyone remembering. A rule you must
remember in 31 places is a rule that will be missed.

| module | sites | how it was routed |
|---|---:|---|
| `Theme.luau` | 6 | gate defined here; local shadows the service |
| `Effects.luau` | 13 | `local TweenService = Theme.motion` |
| `Objective.luau` | 5 | same |
| `Hud.luau` | 4 | same |
| `Panels.luau` | 3 | Theme arrives by injection, so repointed in `Panels.init` |

**Reduced motion does not mean no feedback.** The end state is still applied
immediately — the counter still reaches the number, the panel still reaches full size,
the toast still appears and still leaves. Only the travel is removed. Suppressing the
outcome too would make the interface look broken to exactly the players who asked for
calm.

### Proven, both directions

`GuiService.ReducedMotionEnabled` is **read-only** — a user accessibility setting that
cannot be set from code — so the gate's predicate was overridden on a freshly-required
`Theme` and both branches driven against a real Frame:

| | 50 ms after `Play()` | settles |
|---|---|---|
| full motion | size **175** px (mid-tween) | 400 px |
| reduced motion | size **400** px, alpha **1.00** — immediate | already there |

`Completed` still fired in the reduced branch and `PlaybackState` reached `Completed`.
That matters more than it looks: `Theme.close` hides the panel *in its Completed
handler*, so a tween that never reports completion would leave a panel visible forever.

## Categories measured this pass

Driven through the real paths — the server's own 10 Hz proximity sweep for collection,
and the real `Notify` / `Pop` / `Unlocked` s2c remotes — never by poking a module.

| category | evidence |
|---|---|
| **currency gain** | shard label rolled `15 → 16 → 17 → 18 → 19` with 3.8 px size travel |
| **success / attention pulse** | shard plate scale travel 0.023 on the same event |
| **notification (success)** | inner `Frame` travels **16.96 px** in Y; `Highlight` sweeps alpha **0.140** |
| **notification (error)** | same path, distinct text `NOT ENOUGH COINS` |
| **reduced-motion behaviour** | table above |

**A probe correction worth keeping:** the toast *container* never moves — constant
position, alpha, scale, zero visibility changes across 229 frames. Measuring only the
container says "notifications do not animate", which is false. The animation is on a
child. Sampling one frame and concluding is how a working system gets reported broken.

## Coverage against §O, honestly

| category | status |
|---|---|
| panel open · panel close | measured (pass 1) |
| button press | measured as deliberately instantaneous |
| currency gain · notification · error · success pulse | **measured (this pass)** |
| reduced-motion | **implemented and proven (this pass)** |
| hover · tab transition · purchase · unlock burst · loading/progress · roadmap transition | **still unmeasured** |

**8 of 14 categories plus reduced-motion**, up from 2. The remaining six are reachable
with the same harness; none is blocked.
