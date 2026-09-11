# Texture is a property, not a fact about the mesh

**Date:** 2026-09-01
**Place:** Golem Visual Benchmark (placeId 116648235878426), Studio Edit mode
**Falsifies:** the constraint recorded in `f4d7ad0` and written into `Build.luau`'s
Cube header as *"NO TINT, EVER — every Cube mesh carries a texture, so `Color` has
no effect on it."*

---

## Why this mattered

That one sentence was load-bearing for three separate rejections:

1. **Frost Hollow's crystals.** The frost biome admits only tintable members, all
   four curated `crystal` meshes carry a `TextureID`, so the frost tintable pool was
   **empty** and every crystal there fell back to an authored primitive body. In the
   owner's pixel review those bodies read as *flat tilted rectangles* — painted
   cardboard, not crystal.
2. **The three generated `cliff_module` mesas**, rejected because their baked strata
   banding "reads as a candy stripe against flat-shaded vertex-coloured rock", with
   the note that this was *"not fixable downstream"*.
3. **The Glacier Heart's core**, which was built from seven boxes *precisely because*
   a crystal asked for there would have fallen back to boxes anyway.

Each conclusion follows from treating `TextureID` as immutable. It is not — it is a
writable property on the clone.

## The A/B

Four `crystal` meshes, cloned twice each. Both copies scaled to 18 studs, stood on a
neutral pad, and set to `Color = Color3.fromRGB(255, 0, 0)`. The **only** difference
between the rows is `TextureID`.

| row | `TextureID` | rendered result |
|---|---|---|
| front | left as authored | cyan / violet-pink / teal — **`Color` ignored** |
| back | set to `""` | **pure red on all four** — `Color` honoured |

Geometry, vertex normals and flat-shaded facets are identical between rows; only the
baked colour is dropped. The silhouette that made these meshes worth curating
survives the strip intact.

## The resulting policy

The question is not "is this mesh textured" but **does the texture carry
INFORMATION, or only COLOUR?**

| family | stripped? | why |
|---|---|---|
| `crystal` | yes | texture is flat colour over faceted geometry |
| `crystal_cube` | yes | same; frees the accepted silhouette for both biomes |
| `cliff_module` | **no** | stripping *does* remove the candy stripe, and leaves a smooth column — tried and rejected, see the follow-up below |
| `sign` | **no** | glyphs |
| `crate` | **no** | painted panel detail |
| `tree_pine` / `tree_round` | **no** | green canopy over brown trunk |
| `kiosk` | **no** | the striped awning is the authored art |
| `landmark` | **no** | the accepted hero gradient |

Implemented as `DETEXTURE` in `world/Build.luau`. Stripping happens **on the clone**,
never on the ServerStorage original, so the acquired palette stays byte-for-byte as
downloaded and the decision is reversible by editing one table.

The older note in `place()` claimed blanking a texture "yields an untextured white
blob". That is true of a sign and measurably false of a crystal. It is now stated
per family.

---

## Three geometry bugs this exposed

Rebuilding the Glacier Heart on real crystal meshes made the pedestal the worst
thing in frame, and isolating it (everything else set `Transparency = 1`) showed why.
`stoneDais` — **shared by both landmarks** — had two defects:

1. **The ashlar blocks were yawed 90° out.** `CFrame.Angles(0, -ang, 0)` maps a
   block's local +X — its *chord* axis — onto `(cos ang, 0, sin ang)`, the **radial**
   direction. Every block was laid as a plank pointing straight out of the centre.
   Eight of them made a pinwheel of spokes, not a closed drum. Tangential yaw is
   `-(ang + π/2)`.
2. **The chord was measured on the wrong circle.** It used the outer `radius` while
   the blocks stand on `rr = radius - dep/2`. At the Glacier Heart's 23-stud tier
   that is a 20.1-stud chord on a 118-stud circumference: eight blocks asking for
   161 studs of arc, so they overlapped and threw corners past one another.

Both are fixed, plus a half-sector twist per tier so each step presents a face where
the tier below presents a corner. The comment above `stoneDais` had promised "there
is no elevation from which it reads as a stack of squares" — that promise is only
now true, and it was false for **both** landmarks, not just this one.

3. **The Glacier Heart core was seven boxes** described in-source as "three faceted
   shafts". A rotated cube has no facets. Rebuilt as a blunt radial crystal burst,
   which keeps the section's own rule that the secondary landmark must be a
   *different silhouette*, not a smaller copy of the monument.

---

## Measured effect

| metric | before | after | delta |
|---|---|---|---|
| primitives | 590 | 497 | **−93** |
| mesh assets | 339 | 380 | **+41** |
| textured meshes | 339 | 32 | −307 |
| `SecondaryLandmarks` prim/mesh | 101 / 22 | 42 / 53 | −59 prim |
| `Landmark` prim/mesh | 57 / 10 | 43 / 17 | −14 prim |
| crystal meshes in Frost Hollow | **0** | **22** | +22 |

Primitives are now 111 below the 608-part rejected blockout. The 471 recorded for an
earlier art pass is **not** reached: `Cliffs` still spends 157 primitives and is the
next target.

`pnpm -r typecheck` and `pnpm -r test` both exit 0 after these changes.

## What is still wrong, in the same frames

Recorded here rather than left for the next review to rediscover:

- `Cliffs` is 157 primitives; the canyon and frost walls still read as stacked
  rectangles in every wide shot.
- The ice road's guidance chevrons are painted rather than flown, but at their
  current scale they read as a debug arrow overlay, not as terrain.
- Coins are untextured floating cubes.
- The Glacier Heart is legible but does not yet read as a *payoff* from the gate —
  it is a modest cluster in the middle distance.

---

## Follow-up: `cliff_module` was tried on this path and rejected again

Stripping the texture from the three generated mesas does remove the candy-stripe
banding that got them rejected in `f4d7ad0`. It does not make them usable.

Stood against the real canyon wall at the `cliff` tier, scaled to 42 studs and
capped at the same 46-stud footprint the previous pass had to add, in the meadow's
own rust: **a de-textured mesa reads as a smooth featureless column.** The
underlying geometry is soft — the banding had been doing all of the geological
work. A curated rock mesh standing in the same frame is sharply faceted and reads
as rock.

**The sharpened rule this gives the DETEXTURE list:** de-texturing only helps where
the *geometry* already carries the form. A crystal's facets survive the strip; a
mesa's do not exist. Generating successfully, rendering well alone, tinting
correctly, and even fixing the originally-cited defect are all still not acceptance.

`cliff_module` is therefore off the list rather than on-it-and-unused — a rejected
thing kept as dead configuration is how a later pass reintroduces it. The three
meshes stay in `ServerStorage.GolemPalette` so the reading can be re-taken.

Running total on this family: **7 of 9 generations rejected** — 3 on their own
render, 3 in context, and now the same 3 again on a second, differently-motivated
attempt.
