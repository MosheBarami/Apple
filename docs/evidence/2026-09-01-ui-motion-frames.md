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

> **Superseded by the third pass below.** All six were taken up: three are measured, one is
> measured and found to have no motion at all, and two turned out to name surfaces this game
> does not have.

---

# Third pass, 2026-09-01 — the last four categories, and what two of them turned out to be

Same sampler as pass 1: arm on `RenderStepped`, **re-resolve the instance every frame**, drive
with real input or the real server cue, read afterwards. Two of the four are measured curves.
The other two are findings.

## Hover — measured

A real mouse moved onto the SHOP nav tile and off again, with the sampler watching every
animatable colour and transparency in the tile's subtree rather than a property guessed in
advance.

| t (ms) | tile fill | highlight alpha |
|---|---|---|
| 0 | 76,198,244 | 0.52 |
| +18 | 84,200,244 | 0.46 |
| +35 | 92,203,245 | 0.40 |
| +51 | 97,204,245 | 0.37 |
| +67 | 100,205,245 | 0.35 |
| +83 | 101,205,245 | 0.34 |

Alpha deltas of 6, 6, 3, 2, 1 — **decelerating over ~66 ms**. Leaving reverses it with the
same shape (0.34 → 0.40 → 0.46 → 0.49 → 0.51 → 0.52) and lands **exactly** on the resting
values, so repeated hovers do not drift.

The first attempt sampled `Size` and `Rotation` and recorded 1258 frames of nothing. Hover here
is colour and glow, not geometry — the same mistake pass 2 records for the toast container,
which is why the sampler now snapshots the whole subtree instead of one property.

## Loading / progress — measured

The pack gauge fill, driven by a real award from the server's 10 Hz sweep.

| t (ms) | fill (scale) |
|---|---|
| 518.6 | 0.0074 |
| 534.8 | 0.0136 |
| 550.4 | 0.0189 |
| 567.1 | 0.0240 |
| 584.4 | 0.0285 |
| 601.6 | 0.0322 |
| 617.5 | 0.0350 |
| 635.0 | 0.0374 |
| 650.9 | 0.0389 |
| 667.7 | **0.0398** |

Deltas 74, 62, 53, 51, 45, 37, 28, 24, 15, 9 (×10⁻⁴): **monotonic, decelerating, no
overshoot**, settling at 0.0398 ≈ 1/25 — one shard of a 25 capacity. ~150 ms of visible travel
against a coded 0.18 s Quad Out.

## Unlock burst — measured, three channels at once

Driven by firing the real `Unlocked` remote from the server, never by calling into `Effects`
(F-18: a `require` in the command context returns a different module instance).

| t (ms) | screen wash alpha | shockwave width |
|---|---|---|
| 0 | 0.543 | 165 px |
| 66 | 0.681 | 448 px |
| 148 | 0.819 | 751 px |
| 233 | 0.920 | 1000 px |
| 315 | 0.979 | 1182 px |
| 348 | 0.992 | 1239 px |

The ring expands **7.5×** while the wash fades out, both decelerating and **frame-synchronised**
— they are one gesture, not two animations that happen to overlap. 160 frames, 35 distinct
states.

*Limitation:* the sampler can only record once an instance exists, so the first captured frame
already has the wash at 0.543. The rise into the peak is one frame earlier than anything this
harness can see.

## Purchase — measured, and the finding is that there is no motion

Three real purchases, clicked with a real mouse, sampling both coin surfaces every frame.

```
t=   0.0ms   HUD wallet=250   panel pill=250
t=4735.0ms   HUD wallet=122   panel pill=122
```

**Two states. Both surfaces snap, in the same frame, with nothing in between.** The card's
"25 → 40 SHARDS" line swaps instantly too. Sampled across 835 frames.

And it is not a debit-only asymmetry — a *sell* behaves the same way:

```
t=   0.4ms  shards=56   coins=122
t=1552.1ms  shards=0    coins=234
```

`Effects.countTo` exists, handles both directions (`math.abs(target - start)`), and is called
from `Panels.luau:957` — but **`Hud.luau:1306` writes the wallet with
`coinBox.amount.Text = Util.comma(coins)`**, a direct assignment. `countTo` appears nowhere in
`Hud.luau`. What the HUD *does* animate on a currency change is the pill punch and plate flash,
and only on an **increase** (`if coins > lastCoins`), so a purchase produces no HUD motion at
all.

Pass 2's "currency gain — shard label rolled 15 → 16 → 17 → 18 → 19" is consistent with this
and was not a counting animation: those are five separate awards from the sweep arriving one at
a time, with the pill punching on each. The measured travel was the punch.

**This is a gap against §O, recorded rather than closed.** Whether the wallet *should* count is
a design call — a counter that lags the truth is its own problem — but "purchase" currently has
no motion of its own, and this document should not have implied otherwise.

## Two categories that name surfaces this game does not have

The fourteen-category list is this document's own enumeration of §O, and two entries in it
describe surfaces Crystal Canyon never implemented:

- **tab transition** — there is no tab bar. Panels are modal and mutually exclusive, opened
  from the nav rail; `grep -i "tabbar\|selectTab\|activeTab"` across the client returns
  nothing.
- **roadmap transition** — the roadmap is a web-app surface. It has no representation in the
  game client.

Calling these "unmeasured" implied work outstanding that does not exist. They are **not
applicable**, and the distinction matters: an unmeasured category is a gap in the evidence, an
inapplicable one is a gap in the list.

## Coverage against §O, honestly

| category | status |
|---|---|
| panel open · panel close | measured (pass 1) |
| button press | measured as deliberately instantaneous |
| currency gain · notification · error · success pulse | measured (pass 2) |
| reduced-motion | implemented and proven (pass 2) |
| **hover · loading/progress · unlock burst** | **measured (pass 3)** |
| **purchase** | **measured — no motion exists; recorded as a §O gap** |
| tab transition · roadmap transition | **not applicable — no such surface in this game** |

**11 of 12 applicable categories carry a measurement**, plus reduced motion. The twelfth
(purchase) is measured and found empty, which is a finding rather than a curve.
