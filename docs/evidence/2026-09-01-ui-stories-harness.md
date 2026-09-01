# The isolated UI harness, and the first thing it found

**Date:** 2026-09-01
**Answers:** §N ("Build/finish a UI authoring and evaluation harness rather than only
judging UI inside a full game… A UI component does not count as good merely because it
instantiates successfully. Capture visual evidence."), DoD gate 27.
**Module:** `apps/benchmark/crystal-canyon/src/client/Stories.luau`

---

## Why it ships in the client rather than living in `world/`

Studio's command context runs in a **separate Luau VM**, so `require` there returns a
fresh module instance. That is a recorded trap in this project — it is why two earlier
motion probes produced confident wrong answers. A harness kept in `world/` could only be
run by pasting its source, which drifts from the file the moment either is edited.
Installed as a real module it is required exactly the way `Hud` requires `Theme`, so
**what runs is what is committed.**

It is inert: nothing calls `Stories.mount`, and `Stories.unmount` removes every trace.

## What it renders

Components in isolation, each cell captioned — because a screenshot of eight buttons is
not evidence about states unless each one says which state it is.

| row | states |
|---|---|
| `Theme.button` | primary · accent · danger · muted · default · hover · pressed · disabled |
| `Theme.card` | unselected · selected · locked |
| `Theme.counter` | soft · hard · large (9,999,999 — the overflow case) |
| surfaces | `groupPlate` · `well` · `sectionLabel` |

Rendered at scale 1.00 and again at **0.72**, which is `Hud`'s `MIN_SCALE` — the mobile
floor derived from the smallest touch target. Same components, same rules, one number
different.

**Input states are driven through the real handlers**, not painted. A story that paints
the pressed appearance by hand proves nothing about the button; the whole question is
whether the real input path produces the real state.

## The first finding

Rendering is half of §N. The other half is checking the things with an unambiguous right
answer, and touch target size is the clearest of them — 44px is a number, not a taste. So
the harness also measures.

```
LIVE UI at viewport 1258x698 : 19 buttons, 0 below the 44px floor
                               smallest = 52.0px (Panel.Header.CloseButton)
STORY BOARD at scale 0.72     : 8 buttons, 8 below the floor
                               smallest = 37.4px (Theme.button)
```

`Theme.Metrics.ButtonHeight` is **54**. At `MIN_SCALE` that finishes at **38.9px**, under
the floor. `Theme.actionButton` (72 → 51.8) and the nav tile (68 → 49) both clear it,
which is exactly why the shipped HUD is fine and why this matters:

> **This is a trap for the next screen, not a bug in the current one.**

Stated that way deliberately. The shipped UI passes at the viewport measured; a future
screen that puts a plain `Theme.button` inside a container scaled to the mobile floor
would fail, silently, on phones only. `Stories.auditTouchTargets` now exists so that is a
measurement rather than a discovery.

Deliberately NOT a general quality score. §AK warns that a plausible visual metric can be
useless or actively misleading, so the audit reports the one thing it can actually decide
and leaves everything else to the rendered board and a human.

## A second, smaller finding

`Theme.card` returns a light surface with no built-in text treatment, so a caller reaching
for `Palette.UI.TextLight` — the obvious token — gets invisible text. The board shows it:
the three card cells render as blank white rectangles. Not fixed here, because the fix is
a decision about `Theme.card`'s contract rather than a bug, and it belongs to whoever owns
that decision.

## What this does not do

- No hover/pressed capture on the **mobile** row: `MouseEnter` is not a touch concept, and
  faking it would produce a state a phone never shows.
- No controller-focus row yet. §N lists it; `GamepadEnabled` is reported in the board's
  footer so the gap is visible, but `SelectionImageObject` states are not exercised.
- No large-text / accessibility row.
- Reduced motion is displayed in the board title but cannot be toggled — the property is
  read-only, which is recorded in `2026-09-01-ui-motion-frames.md`.
