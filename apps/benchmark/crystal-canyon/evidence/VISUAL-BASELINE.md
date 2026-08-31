# VISUAL BASELINE — BLOCKOUT (rejected)

Owner inspected the live world and UI in Studio on 2026-08-31 and rejected them:
**"a prototype made from primitives"**, *"constructed FROM BLOCKS rather than
designed as a finished Roblox game"*. This records that state as a negative
baseline so the art pass has something to be measured against.

**The gameplay systems are NOT part of this rejection** and are preserved
unchanged. What is rejected is the visual representation.

## How to reproduce the baseline exactly

The world is deterministic — one seeded RNG consumed in a fixed order — so the
baseline does not need to be stored as geometry. Restore `world/Build.luau` from
commit **`39c6e76`**, serve the package over HTTP, and run `world/Install.luau`
in Studio Edit mode. That reproduces it part for part.

Baseline: 608 parts, all `SmoothPlastic` primitives.

## Canonical camera positions — AFTER must be shot from these

A side-by-side is only honest if the camera does not move. Every future visual
comparison uses these exact positions, at player eye height rather than aerial:

| view | camera position | look at |
|---|---|---|
| hub / landmark approach | `[0, 11, -52]` | `[0, 12, 60]` |
| main path, player eye | `[0, 6, 50]` | `[0, 12, 165]` |
| secondary zone (Frost Hollow) | `[0, 26, -78]` | `[0, 4, -200]` |
| wide overview | `[0, 120, -120]` | `[0, 0, 90]` |

Still owed, per the multi-view requirement: a close prop view, a zone transition
at eye level, and UI during normal gameplay.

## What the baseline actually looks like, stated plainly

- Effectively every visible object is a raw `Part`. 608 of them.
- Cliffs are visibly stacked blocks.
- One tree family, repeated, with transform variation standing in for diversity.
- Rocks are primitive lumps, repeated.
- Frost Hollow is largely empty.
- Props are close to absent; no environmental storytelling.
- Silhouettes repeat heavily; there is no asset vocabulary.
- The crystal landmark reads, but reads as a blockout asset.
- Zone transitions are a colour change and a gate.

Earlier renders in this phase showed real, measurable fixes — the ice path made
visible against the frost floor, cliff banding made irregular, the grey void
removed. Those were **corrections within a blockout**, not art direction. Fixing
a byte-identical colour collision is not the same as authoring a world, and the
review is right that the result still reads as primitives.

## Why it came out this way — the actual root cause

Not an aesthetic misjudgement. The asset pipeline was returning nothing:

```
findVerifiedAssets('low poly tree')  ->  0 passed, 12 rejected, all fail_moderated
```

The metadata gate read `visibilityStatus` as a moderation flag and rejected 100%
of the live catalogue, so the builder had no external assets available and
primitives were the only option left. That is now fixed (0 → 4/4 passing), which
is what makes a real art pass possible rather than another round of "more parts".

## Failure conditions the next pass is graded against

Copied from the review so they are checkable rather than remembered:

1. most visible environment assets still primitive block constructions
2. essentially one repeated tree family
3. no meaningful props
4. a visibly empty zone
5. no consistent art direction across environment assets
6. UI still resembling prototype/debug UI
7. improvement achieved primarily by increasing part count
8. asset intelligence present in code but not actually used
9. screenshots materially similar to this baseline
