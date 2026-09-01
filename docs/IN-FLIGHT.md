# Work in flight — 2026-09-01

A scratch record of what is running and what it is for, so the state survives a context
reset. Delete this file once both land and their outputs are committed.

## Workflow A — `cc-visual-redesign`

Four parallel design agents plus an integrator, producing implementation plans (NOT edits) for
the owner's four directed changes:

| agent | problem |
|---|---|
| `design:walls` | a materially different cliff construction. The four decorate-the-box attempts are closed by instruction |
| `design:verticality` | recompose the topology. The seam is `groundTop(x, z)` at `Build.luau:1335`, which everything places against and which currently returns one of three constants |
| `design:shop` | make SHOP and UPGRADES distinct, **or recommend removing SHOP** — both are acceptable answers |
| `design:objective` | the top-centre pill as a state-driven contextual objective HUD |
| `integrate` | where the four plans collide; especially verticality changing ground the walls/pads/spawn/crystal-scatter/zone-AABBs assume is flat |

**The interaction I most want the integrator to catch**, and which I should check myself if it
does not: the perimeter walls currently stand on a single flat `332 × 4 × 553` slab. If the
ground rises toward the perimeter, the "wall" stops being a fence on a plane and becomes the top
of a slope — which may do more for gate 2 than any wall-specific change. The two plans are not
independent.

## Workflow B — `cc-source-intelligence`

Acquire → verify rights in the checkout → security-scan → extract grammar, over four groups of
licence-verified sources, then a merge that dedupes against the existing 61-rule library.

| group | sources | serves |
|---|---|---|
| motion | Flipper, otter, roact-spring, RbxCameraShaker | gate 29 — motion intelligence is currently "one game's patterns" |
| icons | lucide-roblox, roblox-free-assets.skill, roblox-agent-skills | gate 28 — the icon family ships but was drawn from scratch |
| components | synthetic, onyx-ui, Iris, cyan-ui | gates 25, 31 |
| ux | SimpleDialogue, NotificationSystem | gate 31's remaining families |

Writes candidate rules to `<scratch>/source-intel/*.json` and a merged set to `merged.json`.
**Nothing is integrated into `packages/design/src/rules.mjs` by the workflow** — that is mine to
do, after reading the merge.

The corpus state this starts from: 217 seeds, 119 resolved, **68 COMMERCIAL_REUSABLE** and only
**2 actually checked out**. That gap is the whole point of the run.

## Standing constraints both must respect

- `Build.luau` is deterministic from ONE seeded stream. Adding or removing a `rand()` call
  re-rolls the entire world (F-32), so any change meant to be compared before/after must consume
  the same number of draws or take randomness from a separate `Random`.
- A rule learned from a source that cannot prove a licence is `reference-only` and may never
  carry `tokens`. The acquired sources are MIT/Apache/Unlicense precisely so their rules can.
- Gate 40 stays UNPROVEN until a FRESH critic judges player-eye pixels. `world/Viewpoints.luau`
  holds the twelve cameras for that, resolved against the ground at capture time so they survive
  the topology changing underneath them.
