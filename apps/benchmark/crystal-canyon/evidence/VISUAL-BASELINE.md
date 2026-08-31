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

---

# Art pass — asset acquisition (first real use of the broker)

## Creator Store: 27 assets acquired, 0 scripts found

The pipeline the phase built has now actually been used, which was one of the
review's explicit failure conditions ("asset intelligence exists in code but is
not actually used").

```
search (findVerifiedAssets, free Models only)
  -> deterministic NAME-RELEVANCE filter
  -> game:GetObjects
  -> enumerate descendants, strip every LuaSourceContainer
  -> reject anything with zero parts
  -> uniform scale to a per-family target height
```

Result: **27 kept, 0 rejected, 8 families, 0 scripts found.** Every one is a real
`MeshPart` with a valid mesh id. Recorded with provenance in
`assets/palette.json`.

| family | count | family | count |
|---|---|---|---|
| tree_pine | 4 | fence | 4 |
| tree_round | 4 | sign | 2 |
| rock | 4 | crate | 4 |
| crystal | 4 | bush | 1 |

**The name-relevance filter mattered more than the security gate.** Roblox
toolbox search is keyword-loose: a raw search for "low poly flowers" returned
*Treecko Doll* and *pineco pokemon*, and "cartoon bush" returned *neon hair*.
Inserting those to discover they are wrong is the expensive way to learn it, so
the family's own vocabulary is asserted against the asset NAME before anything
is loaded. That is a deterministic pre-filter in the §39 sense — it costs nothing
and it removes most of the noise before a single round trip.

Five families came back empty after filtering: **flower, lamp, chest, mushroom,
barrel.** Those are the gap Cube generation was supposed to fill.

## Cube / GenerationService: BLOCKED, with the reason measured

Not skipped, and not "implemented but unverified" — attempted, and refused:

```
GenerationService:GenerateMeshAsync(intent, player, {...})
  -> "Unable to trigger mesh generation"      (0.2s, a clean refusal)
```

Preconditions established first, because the earlier attempt failed for a
different and less interesting reason: the API requires a live `Player`, so it
cannot run in Edit mode at all. Retried inside a running playtest with a real
player — same refusal.

The cause is almost certainly the same one that disables DataStore in this place,
and the server log states it plainly:

```
Reason: GetDataStore failed: You must publish this place to the web to access DataStore
game.PlaceId = 0
```

An unpublished place has no universe, and both features need one.

**Owner action: publishing the benchmark place unblocks Cube 3D/4D generation
and persistence testing together.** Until then the five empty families are
covered by authored geometry rather than generated assets, and no claim is made
that Cube works.

## Camera note added 2026-08-31 — how these shots are actually taken

`workspace.CurrentCamera.CFrame` set from a Studio plugin is **partly ignored
unless `CameraType` is first set to `Scriptable`**: the position is applied and
the *rotation is silently discarded*, leaving whatever the Edit viewport was
already facing.

This is not a footnote. Every shot in this file's first two rounds looked toward
**+Z**, which is what the viewport happened to be holding, so every camera that
wanted +Z appeared to work and the one that wanted −Z quietly returned a picture
of something else entirely. Two "the frost hollow is blocked by geometry"
readings were that bug and not the world. Set `Scriptable`, then set the CFrame,
then read `LookVector` back and assert the drift is zero before capturing.

The frost camera in the table above — `[0, 26, -78]` → `[0, 4, -200]` — is
correct and is retained. It sits 4 studs behind the gate's near face, so the
gate frames the shot; that is the zone entrance and it is the intended read.
