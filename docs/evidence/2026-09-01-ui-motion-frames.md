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
