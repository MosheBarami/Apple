# Roblox Art Direction Handbook

**Purpose:** the world-building knowledge base Golem reasons from when generating Roblox scenes.
**Audience:** the generation model (`@cf/zai-org/glm-5.3-flash`) and the engineers writing its prompts/tools.
**Last verified:** 2026-08-30. Facts marked **[V]** were verified empirically against a live Roblox Studio
(`placeId 123864611037141`) via `execute_luau` on 2026-08-30. Facts marked **[D]** come from
create.roblox.com docs. Unmarked numbers are craft conventions — defensible, but not vendor-stated.

---

## 0. How to use this document

Golem's failure is not correctness, it is **taste**. The engine happily renders a flat platform, four grey
poles and three stacked bricks. Nothing errors. The scene is simply ugly.

Every section below is written to be *actionable inside a tool call*: exact `Enum.Material` names, exact
`Color3.fromRGB` triples, exact property names, exact stud dimensions. When generating, the model should:

1. Pick a **scene recipe** (§12) or derive one from the user prompt.
2. Lock a **palette** (§7) and a **material set** (§6) *before* placing geometry.
3. Block out at the **5-stud grid** (§4) using the **proportion table** (§3).
4. Run the **detail pass** (§9) — this is the step AI output always skips.
5. Apply a **lighting recipe** (§8).
6. Self-check against the **auto-reject rules** (§13). If any rule trips, revise before returning.

> **The single highest-leverage change:** never emit a `Part` that keeps *both* factory defaults.
> A new `Part` is `Material = Plastic`, `Color = Color3.fromRGB(163, 162, 165)`, `Size = 4, 1.2, 2` **[V]**.
> Untouched defaults are the visual signature of machine-generated slop.

---

## 1. Diagnosis: why the current output looks wrong

The rejected scene — flat platform, four grey poles, yellow cubes, three-part "trophy" — fails on seven
specific, fixable axes. This list doubles as a regression checklist.

| # | Failure | What is actually wrong | Section that fixes it |
|---|---------|------------------------|----------------------|
| 1 | **No material language** | Everything is `Plastic`. Plastic has no texture at any distance, so every surface reads as untextured mass. | §6 |
| 2 | **Saturated primaries on grey** | `(255,255,0)` cubes on `(163,162,165)` poles. Max-chroma hue against neutral grey is the least sophisticated colour relationship available. | §7 |
| 3 | **One value tier** | Platform, poles and props sit at nearly identical lightness. Nothing reads as figure vs ground. | §7.3 |
| 4 | **No silhouette hierarchy** | Four identical poles = four equal focal points = zero focal points. | §5.1 |
| 5 | **Primitive-count minimalism** | A "trophy" as three stacked primitives has no trim, no bevel, no base moulding. Real props are 8–20 parts. | §9 |
| 6 | **Bare flat surfaces** | A single unbroken slab reads as *unfinished blockout*, because that is literally what a greybox is. | §9.2 |
| 7 | **Default lighting** | Untouched `Lighting` gives flat, shadowless, characterless illumination. | §8 |

**Reframe for the model:** a greybox and a finished scene differ by roughly **10× the part count** and a
material/colour/lighting pass. Golem currently ships greyboxes.

---

## 2. CRITICAL API CORRECTION — lighting changed in 2025

This supersedes almost every Roblox lighting tutorial written before mid-2025, and it invalidates the
common instruction "set `Lighting.Technology = Future`".

**Roblox shipped "Unified Lighting" — Studio beta 2025-01-21, fully live in all experiences 2025-07-23. [D]**
`Lighting.Technology` was deprecated and replaced by two properties: **[D]**

| Old `Technology` | New equivalent |
|---|---|
| `Future`     | `LightingStyle = Realistic`, `PrioritizeLightingQuality = Enabled` |
| `ShadowMap`  | `LightingStyle = Soft`, `PrioritizeLightingQuality = Enabled` |
| `Voxel`      | `LightingStyle = Soft`, `PrioritizeLightingQuality = Disabled` |

`Enum.LightingStyle` has exactly two members: `Realistic = 0`, `Soft = 1`. **[V]**

### 2.1 These properties are NOT scriptable — verified

Probing the live Studio datamodel **[V]**:

```
LightingStyle              = Enum.LightingStyle.Soft     scriptable = false
PrioritizeLightingQuality  = true                        scriptable = false
Technology                 = <read error: property gone> scriptable = false
```

**Consequence for Golem — this is an engineering constraint, not a style note:**

- Any generated Luau containing `Lighting.Technology = Enum.Technology.Future` **will error**. The property
  no longer exists on the instance. Golem must never emit it.
- `Lighting.LightingStyle = ...` **also fails**, even at plugin security in Edit mode.
- Therefore **art direction that depends on `Realistic` lighting cannot be delivered by a runtime script.**
  It must be set in the Studio Properties pane, or baked into the place file (`.rbxlx`) / Rojo project.
- Golem should (a) never emit those assignments, and (b) surface a one-line note to the user:
  *"For best results set Lighting → LightingStyle = Realistic in Studio; it cannot be set from a script."*

The same restriction applies to streaming **[V]**: `StreamingMinRadius`, `StreamingTargetRadius`,
`StreamingIntegrityMode` and `ModelStreamingBehavior` all fail to even *read* from a script.
`StreamingEnabled` reads as `true` but docs state it "cannot be set in a script" **[D]** — treat it as
place-file configuration, not script output.

### 2.2 What Golem *can* set from Luau — verified writable

All of these returned `scriptable = true` **[V]**, with the live values shown:

| Property | Live value at probe | Type |
|---|---|---|
| `Lighting.Brightness` | `3` | number |
| `Lighting.ClockTime` | `14.5` | number, 0–24 **[D]** |
| `Lighting.TimeOfDay` | `"14:30:00"` | string |
| `Lighting.GeographicLatitude` | `0` | number |
| `Lighting.ExposureCompensation` | `0` | number |
| `Lighting.EnvironmentDiffuseScale` | `1` | number, 0–1 **[D]** |
| `Lighting.EnvironmentSpecularScale` | `1` | number, 0–1 **[D]** |
| `Lighting.GlobalShadows` | `true` | bool |
| `Lighting.ShadowSoftness` | `0.2` | number, 0–1 **[D]** |
| `Lighting.FogStart` / `FogEnd` | `0` / `100000` | number |
| `Lighting.Ambient` | `Color3.fromRGB(70, 70, 70)` | Color3 |
| `Lighting.OutdoorAmbient` | `Color3.fromRGB(70, 70, 70)` | Color3 |
| `Lighting.ColorShift_Top` | `Color3.fromRGB(0, 0, 0)` | Color3 |
| `Lighting.ColorShift_Bottom` | `Color3.fromRGB(0, 0, 0)` | Color3 |
| `Lighting.FogColor` | `Color3.fromRGB(192, 192, 192)` | Color3 |

Plus every post-processing / atmosphere **instance**, which are freely creatable and parentable to
`Lighting`. That is where Golem's lighting art direction must live. See §8.

---

## 3. Scale and proportion — the studs table

### 3.1 Verified anchors

| Anchor | Value | Source |
|---|---|---|
| Default R15 avatar height | **≈ 5 studs** | widely-used community standard; matches Roblox rig scale |
| Default `WalkSpeed` | **16** studs/sec | **[V]** |
| Default `JumpHeight` | **7.2 studs** | **[V]** (`StarterPlayer.CharacterUseJumpPower = false`, `CharacterJumpHeight = 7.2`) |
| Default `JumpPower` | 50 (legacy path) → apex ≈ **6.37 studs** | **[V]**, derived `v²/(2g)`, `workspace.Gravity = 196.2` |
| Default `MaxSlopeAngle` | **89°** | **[V]** |
| Default camera max zoom | **128 studs** | **[V]** |
| Modular grid / transform snap | **5 studs**, **90°** | **[D]** environmental-art curriculum |
| Min gameplay doorway & hallway width | **10 studs** | **[D]** — lets two avatars pass abreast |
| Min gameplay wall height | **10 studs** | **[D]** |
| Default `Part` size | `4, 1.2, 2` | **[V]** |

> **Correction worth propagating:** Roblox's own greyboxing tutorial justifies the 10-stud wall by citing
> "Roblox's default jump height of 5 studs." That number is stale. The measured default is **7.2 studs [V]**.
> The 10-stud rule still holds — but only just. **An 8-stud wall is jumpable.** Never use 8-stud walls as
> barriers.

### 3.2 Architectural proportions in studs

Everything below is keyed to the 5-stud avatar. Two columns because Roblox has a real tension: a
*visually* correct door (human proportion) is narrower than a *playably* correct door (two avatars +
third-person camera). Pick by role.

| Element | Visual / human-scale | Gameplay-critical | Notes |
|---|---|---|---|
| **Character height** | 5 | 5 | The unit of measure. |
| **Door opening** | 7 H × 4 W | **10 H × 10 W** | Use 7×4 for decorative/background doors and interiors the player won't fight in. Use 10×10 anywhere the player must pass under pressure. **[D]** for the 10s. |
| **Doorway frame/trim** | +0.5 stud proud, 0.5–1 thick | same | Never cut a hole with no frame — see §9.1. |
| **Interior wall height** | 12–14 | ≥ 10 **[D]** | 12 reads domestic; 14 reads generous. |
| **Grand / lobby wall height** | 20–30 | ≥ 10 | Above ~30 the avatar stops reading as human. |
| **Exterior wall thickness** | 2 | 2 | 1 reads like cardboard at grazing angles. |
| **Interior partition thickness** | 1 | 1 | |
| **Floor slab thickness** | 1–2 | 1–2 | Never 0.2 — z-fighting and paper-thin silhouette. |
| **Corridor width** | 8 | **10–12** | 12 is comfortable for third-person camera. |
| **Corridor height** | 10–12 | ≥ 10 | |
| **Stair rise** | **1.0–1.5** | ≤ 2 hard limit | ≤ 2 keeps the walk smooth; 1.0–1.5 looks right. |
| **Stair run (tread depth)** | **2.5–3** | ≥ 2.5 | Rise:run of 1:2 to 1:2.5 reads correct. |
| **Stair width** | 6–8 | ≥ 10 if gameplay | |
| **Ramp slope** | 15–30° | ≤ 45° | `MaxSlopeAngle` is 89° **[V]** so almost anything is walkable — that is a trap. Steep ramps look wrong. |
| **Railing height** | 3.0–3.5 | 3.5 | Top rail at ~⅔ avatar height. |
| **Table height** | 3 | — | |
| **Chair seat height** | 1.5–2 | — | |
| **Counter / bar height** | 3.5–4 | — | |
| **Shelf unit** | 8–10 H × 1.5 D | — | |
| **Window** | 5 × 5, sill at 4 | — | Sill at 4 = chest height on a 5-stud avatar. |
| **Column (human scale)** | 2×2 to 4×4 | — | |
| **Column (monumental)** | 6×6 to 10×10 | — | |
| **Ceiling clearance, standard** | 10–12 | ≥ 10 | |
| **Ceiling clearance, atrium** | 24–40 | — | |
| **Street width** | 24–40 | — | Sidewalk 6–10 each side. |
| **Small plaza** | 80 × 80 | — | |
| **Large plaza** | 140 × 160 | — | |
| **Shop interior footprint** | 40 × 30 | — | |
| **Barrier wall (non-jumpable)** | — | **≥ 10** | 8 is jumpable at `JumpHeight = 7.2` **[V]**. |
| **Curb / step-up detail** | 0.5–1 | ≤ 2 | |

### 3.3 Scale sanity heuristics

- **The 5-stud test.** Mentally place a 5-stud box next to every asset. A door the box can't walk through
  is wrong. A chair taller than the box is wrong.
- **Never a 1-stud-thick anything** the player can see edge-on except deliberate sheet metal / signage.
- **Odd numbers break the grid.** Prefer dimensions divisible by 5 for structure, and free values only
  for props and trim.
- **Roblox's own modular rule [D]:** minimum module 5 studs tall and wide; larger modules must be
  *divisible by* the minimum (e.g. 15×5 is valid against a 5×5 base). Pivots must sit at consistent
  increments or rotated pieces clash.

---

## 4. Modular construction

### 4.1 Grid discipline

Roblox's curriculum is explicit: **transform snapping at 5 studs and 90°** **[D]**. Golem should emit
positions on that lattice for all structural geometry.

```lua
local GRID = 5
local function snap(v: Vector3): Vector3
    return Vector3.new(
        math.round(v.X / GRID) * GRID,
        math.round(v.Y / GRID) * GRID,
        math.round(v.Z / GRID) * GRID
    )
end
```

Props and clutter are explicitly **exempt** — Roblox's docs note props "don't need consistent pivot point
locations" because they don't snap together **[D]**. Off-grid props are what makes a grid-built scene stop
looking like a spreadsheet.

### 4.2 Kit-of-parts

Define a small vocabulary per scene, then repeat it. A good Roblox kit is ~8–14 pieces:

| Piece | Typical size (studs) |
|---|---|
| `Wall_Solid` | 10 × 14 × 1 |
| `Wall_Window` | 10 × 14 × 1 (window void 5×5) |
| `Wall_Door` | 10 × 14 × 1 (opening 10×10 or 7×4) |
| `Wall_Corner` | 1 × 14 × 1 post + returns |
| `Floor_Tile` | 10 × 1 × 10 |
| `Ceiling_Tile` | 10 × 1 × 10 |
| `Column` | 2 × 14 × 2 |
| `Beam` | 10 × 1.5 × 1.5 |
| `Trim_Base` | 10 × 1 × 1.2 (skirting) |
| `Trim_Cornice` | 10 × 0.8 × 1.2 |
| `Stair_Flight` | 8 W, rise 1.2 × run 2.8 |
| `Railing_Section` | 10 × 3.2 × 0.3 |
| `Planter` | 20 × 11 × 5 (Roblox's own sample uses exactly this **[D]**) |
| `Roof_Slope` | 10 × 5 × 10 wedge |

### 4.3 Repeating with variation — the anti-tiling rules

Repetition without variation is the *other* AI tell. Apply at least two of these per repeated element:

1. **Rotational variation:** rotate props by `math.random(0, 3) * 90` (grid-safe) or free Y-rotation for
   organics.
2. **Scale jitter:** ±8% on props only, never on structural modules (breaks the grid).
3. **Colour jitter:** vary lightness ±6 RGB points on a shared hue. Keep hue locked.
4. **Material alternation:** every 3rd–5th module swaps to a sibling material (`Concrete` → `Pavement`).
5. **Occlusion:** break long runs with a column, planter, or crate every 20–30 studs.
6. **Deliberate asymmetry:** never mirror a façade exactly. Move one window.

```lua
-- grid-safe variation for a repeated module
local function vary(part: BasePart, rng: Random)
    part.Orientation += Vector3.new(0, rng:NextInteger(0, 3) * 90, 0)
    local j = rng:NextInteger(-6, 6)
    local c = part.Color
    part.Color = Color3.fromRGB(
        math.clamp(c.R * 255 + j, 0, 255),
        math.clamp(c.G * 255 + j, 0, 255),
        math.clamp(c.B * 255 + j, 0, 255)
    )
end
```

---

## 5. Composition

### 5.1 Focal points and silhouette

**One primary focal point per view.** Four identical poles is four focal points, which is none.

Build focus with a **hierarchy of three**:

- **Primary (1 per scene):** tallest, most saturated, most lit, most silhouette-complex. Gets the accent
  colour. Gets a dedicated light.
- **Secondary (2–4):** supporting masses that frame the primary. Mid-value, secondary colour.
- **Tertiary (everything else):** dominant colour, low contrast, low chroma. This is the majority of parts.

**Silhouette reading test.** Set every part in a candidate view to pure black and ask: is the subject
still identifiable? If the answer is no, the shape needs a distinctive profile — an overhang, a spire, a
notch, an asymmetric top. Roblox's docs say the same for props: include enough detail that "users can
tell what a prop is from its silhouette" **[D]**.

Cheap silhouette wins:
- Break the top edge (crenellations, a tilted cap, an antenna).
- Add an asymmetric element at ~⅔ height.
- Overhang the top mass past the base by 1–2 studs.
- Never terminate a vertical form in a flat, unadorned square top. That is exactly the "grey pole + yellow
  cube" shape.

### 5.2 Rule of thirds in 3D

Roblox's camera is third-person and player-driven, so compose for the **approach vector** — the direction
players first see the space from (usually from `SpawnLocation` toward the objective).

1. Determine the approach ray.
2. Place the primary focal mass **off the centre axis** — offset laterally by ~⅓ of the space's width.
3. Put a **framing element** in the near foreground on the opposite side (an arch, a tree, a column) so
   the focal point sits in the resulting negative space.
4. Set the focal point's base at roughly the lower third of the visible frame — meaning the mass extends
   upward through the middle third.

### 5.3 Foreground / midground / background

Every view needs all three or it reads flat.

| Layer | Distance from camera | Role | Treatment |
|---|---|---|---|
| **Foreground** | 0–30 studs | Frames and occludes | Darkest values, highest detail density, often silhouetted. Arches, foliage, crates, overhangs. |
| **Midground** | 30–120 studs | The subject | Full material and colour treatment. The focal point lives here. |
| **Background** | 120–500+ studs | Depth and context | Lowest contrast, desaturated, hazed by `Atmosphere`. Big simple masses. No small detail. |

**Atmospheric perspective is the cheapest depth cue in Roblox.** Distant geometry must lose contrast and
saturation. Do it with `Atmosphere.Haze` and `Atmosphere.Density` (§8) rather than by hand-desaturating
part colours — the engine does it correctly and for free.

### 5.4 Vertical variation, negative space, flow, landmarks

- **Vertical variation.** A flat platform is the single most common AI failure. Require **at least three
  distinct floor elevations** in any scene larger than 60×60 studs. Steps of 1–2 studs, platforms at
  +5/+10, a sunken area at −3. Elevation change reads as design intent.
- **Negative space.** Do not fill uniformly. Roughly **30–40% of floor area should stay open**. Clutter
  concentrates at edges and around landmarks; the middle of a plaza stays walkable.
- **Player flow.** Roblox's curriculum: combat pockets should have **a maximum of three entrances/exits**
  to avoid choice overload **[D]**. Generalise it — 2–3 connections per room. Wide (12+) for main paths,
  narrow (8) for optional/secret ones.
- **Landmarks.** Any space over ~100 studs across needs a tall, unique, visible-from-anywhere object for
  orientation. Make it the primary focal point. Roblox's own sample uses a spire of `16 × 98 × 11` studs
  on a `21 × 5 × 15` base **[D]** — note the ~10:1 height ratio and the fact it has a distinct base.
- **Readability.** Interactive things must not share a material+colour with scenery. Reserve one accent
  colour and (optionally) `Neon` exclusively for interactables.

---

## 6. Material language

`Enum.Material` numeric values **[D]** — useful when serialising. Full list with the ones that matter for
art direction called out.

### 6.1 What each material *reads as*

| Material | Enum val | Reads as | Use for | Avoid when |
|---|---|---|---|---|
| `Plastic` | 256 | **Nothing — untextured** | Almost never. This is the default and the slop signature. | Always avoid as a default. |
| `SmoothPlastic` | 272 | Clean painted/enamel | Modern furniture, appliances, stylised cartoon surfaces, painted metal | You wanted texture |
| `Neon` | 288 | Emissive, self-lit | Signage, holograms, sci-fi strips, magic. **Also the standard trick for stylised glass.** | Large areas — it flattens |
| `Wood` | 512 | Rough sawn timber | Beams, rustic posts | Fine furniture |
| `WoodPlanks` | 528 | Directional decking | Floors, docks, crates, barn walls | Small props (tiling too coarse) |
| `Marble` | 784 | Luxury veined stone | Lobby floors, monuments, wealth | Anything humble |
| `Slate` | 800 | Fine dark layered stone | Roofs, elegant paving, dark stonework | Warm/rustic scenes |
| `Concrete` | 816 | Modern structural mass | **The workhorse.** Walls, floors, urban structure | Fantasy/organic |
| `Limestone` | 820 | Pale warm sedimentary | Mediterranean, desert, ancient | Cold scenes |
| `Granite` | 832 | Hard speckled stone | Monuments, kerbs, mountains | Soft interiors |
| `Pavement` | 836 | Sidewalk aggregate | Streets, plazas — **best sibling to Concrete** | Interiors |
| `Brick` | 848 | Warm modular masonry | Facades, chimneys, industrial | Sci-fi/clean |
| `Pebble` | 864 | Loose small stone | Riverbeds, gravel paths | Structure |
| `Cobblestone` | 880 | Old-world paving | Medieval streets, courtyards | Modern |
| `Rock` | 896 | Natural boulder | Cliffs, terrain outcrops | Architecture |
| `Sandstone` | 912 | Warm desert block | Deserts, ruins, adobe | Cold/wet |
| `CorrodedMetal` | 1040 | Rust, decay, age | Horror, post-apoc, industrial | Clean/new |
| `DiamondPlate` | 1056 | Industrial tread | Catwalks, floors, machinery | Domestic |
| `Foil` | 1072 | Bright thin metal | Trim, accents, chrome | Large areas |
| `Metal` | 1088 | Clean brushed metal | Sci-fi panels, railings, machinery | Rustic |
| `Grass` | 1280 | Short groundcover | Lawns, terrain | Vertical surfaces |
| `LeafyGrass` | 1284 | Lush overgrowth | Jungle, planters, wild ground | Manicured |
| `Sand` | 1296 | Fine granular | Beaches, deserts | Structure |
| `Fabric` | 1312 | Woven cloth | Awnings, banners, cushions, tents | Hard surfaces |
| `Snow` | 1328 | Fresh powder | Winter | — |
| `Mud` | 1344 | Wet earth | Swamps, paths | Clean |
| `Ground` | 1360 | Dry dirt | Paths, fields | — |
| `Asphalt` | 1376 | Road surface | Roads, car parks | Interiors |
| `Ice` / `Glacier` | 1536 / 1552 | Frozen translucent | Winter, magic | — |
| `Glass` | 1568 | True transparent glass | Windows — set `Transparency ≈ 0.4–0.7` | Perf-critical scenes |
| `Cardboard` | 2304 | Packing material | Boxes, poor districts | — |
| `Carpet` | 2305 | Soft floor pile | Interiors, lobbies, homes | Exteriors |
| `CeramicTiles` | 2306 | Glazed tile | Bathrooms, kitchens, pools | — |
| `ClayRoofTiles` | 2307 | Terracotta roofing | Mediterranean, Spanish | — |
| `RoofShingles` | 2308 | Asphalt shingle | Suburban roofs | — |
| `Leather` | 2309 | Tanned hide | Furniture, saddles, books | — |
| `Plaster` | 2310 | Smooth rendered wall | **Best default interior wall.** Stucco, drywall | Exteriors that need grit |
| `Rubber` | 2311 | Matte grippy | Tyres, mats, playgrounds | — |

### 6.2 Combining materials coherently

**The 3+1 rule.** Any scene should use **three primary materials plus one accent material**. More than
four reads as noise; fewer reads as a greybox.

Proven combinations:

| Style | Structure | Secondary | Ground | Accent |
|---|---|---|---|---|
| **Modern urban plaza** | `Concrete` | `Glass` | `Pavement` | `Metal` |
| **Warm market town** | `Brick` | `Plaster` | `Cobblestone` | `Fabric` |
| **Mediterranean** | `Limestone` | `Plaster` | `Sandstone` | `ClayRoofTiles` |
| **Horror interior** | `Concrete` | `WoodPlanks` | `CeramicTiles` | `CorrodedMetal` |
| **Sci-fi corridor** | `Metal` | `SmoothPlastic` | `DiamondPlate` | `Neon` |
| **Fantasy ruin** | `Slate` | `Sandstone` | `Cobblestone` | `LeafyGrass` |
| **Cosy lobby** | `Plaster` | `Wood` | `Marble` | `Carpet` |
| **Industrial** | `CorrodedMetal` | `Concrete` | `DiamondPlate` | `Foil` |

**Material rules:**
1. **Vertical vs horizontal must differ.** Walls and floors sharing one material kills spatial reading.
2. **Trim contrasts the plane it sits on.** `Concrete` wall → `Metal` or `Wood` trim.
3. **Roughness tells the story.** Rough (`Concrete`, `Brick`, `Rock`) = old/heavy/natural. Smooth
   (`SmoothPlastic`, `Metal`, `Marble`) = new/clean/artificial. Mixing them randomly reads as confusion;
   mixing them *deliberately* (rough base, smooth insert) reads as design.
4. **`Neon` is a light, not a colour.** Anything `Neon` should have a matching `PointLight` nearby or it
   reads as flat paint. Keep `Neon` under ~5% of surface area.
5. **Stylised glass trick [D]:** Roblox's own sample uses `Material = Neon`, `Color = (105, 162, 172)`,
   `Transparency = 0.6` for glass — cheaper and more stylised than real `Glass`.

### 6.3 When MaterialVariants help

`MaterialVariant` lives in `MaterialService` and customises a base material with PBR maps: `ColorMap`,
`NormalMap`, `MetalnessMap`, `RoughnessMap`, plus `StudsPerTile` **[D]**.

Factory defaults **[V]**: `BaseMaterial = Plastic`, `StudsPerTile = 10`, `MaterialPattern = Regular`.
`Enum.MaterialPattern` = `Regular (0)`, `Organic (1)` **[V]**.

Use a `MaterialVariant` when:
- You need the *same* base material to read differently in two places (e.g. `Concrete_Ribbed` vs
  `Concrete_Tiles` — both are real variants in Roblox's sample **[D]**).
- Default tiling is the wrong scale. Lower `StudsPerTile` for props, raise it for big walls.
- You want a specific art style across the whole place — a variant can *override* a base material globally
  **[D]**.

**Do not** use variants when Golem cannot upload textures. Variants need asset IDs. In a
generate-Luau-only pipeline, prefer base materials + `Color` + geometry detail. Note it as an upgrade path.

Texture budget **[D]**: tileable textures and trim sheets up to **1024×1024**; most minor images should be
**under 256×256**, max 512×512.

---

## 7. Colour

### 7.1 The 60/30/10 structure

| Role | Share of visible surface | Character |
|---|---|---|
| **Dominant** | ~60% | Low saturation, mid-to-light value. Walls, ground, sky-facing masses. |
| **Secondary** | ~30% | Related hue, different value. Structure, roofs, large props. |
| **Accent** | ~10% | Higher saturation. Focal point, interactables, signage. |

The accent is the *only* place high chroma is allowed. Everything else must be muted.

### 7.2 Hard rules against the "saturated primaries on grey" look

These are the mechanical rules that prevent Golem's current output. Enforce them in code.

1. **Ban pure primaries and pure greys on large surfaces.** Never emit these for anything over ~4 studs:
   `(255,0,0)`, `(0,255,0)`, `(0,0,255)`, `(255,255,0)`, `(255,0,255)`, `(0,255,255)`, `(255,255,255)`,
   `(0,0,0)`, and the `Part` default `(163,162,165)`.
2. **Saturation ceiling by area.** Convert to HSV:
   - Surface > 50 studs²: `S ≤ 0.35`
   - Surface 10–50 studs²: `S ≤ 0.55`
   - Accent props < 10 studs²: `S ≤ 0.90`
3. **Never neutral grey.** If saturation is near zero, tint it. Give every "grey" a hue:
   warm grey `(150, 145, 138)`, cool grey `(138, 144, 152)`. Neutral `(150,150,150)` is a dead surface.
4. **Hue cohesion.** Pick a base hue `H`. All dominant/secondary colours must fall within `H ± 40°`, or be
   the complement `H + 180° ± 20°` for the accent only. Random hues = chaos.
5. **Value before hue** — see §7.3.

**The guard function.** Run every colour through this before assigning it. Verified in Studio **[V]** —
see the behaviour table below.

```lua
-- Safety net for generated colours. Clamps BOTH saturation and value by surface area,
-- and gives neutrals a hue so nothing is dead grey.
-- sceneHue: 0..1 HSV hue for the scene (0.08 warm, 0.58 cool). Optional.
local function tameSurface(color: Color3, areaStuds2: number, sceneHue: number?): Color3
    local h, s, v = color:ToHSV()
    local sMax, vMax
    if areaStuds2 > 50 then      sMax, vMax = 0.35, 0.88   -- large surface
    elseif areaStuds2 > 10 then  sMax, vMax = 0.55, 0.94   -- mid
    else                         sMax, vMax = 0.90, 1.00   -- small accent prop
    end
    if s < 0.04 then h, s = sceneHue or 0.08, 0.06 end     -- neutral -> tint to scene hue
    if s > sMax then s = sMax end
    if v > vMax then v = vMax end
    if v < 0.12 then v = 0.12 end                          -- never crush to black
    return Color3.fromHSV(h, s, v)
end
```

**Clamping saturation alone is not enough** — a max-value yellow with `S` clamped is still a fluorescent
pastel. The `vMax` clamp is what actually tames it. Verified outputs **[V]**:

| Input | Area | `sceneHue` | Output |
|---|---|---|---|
| `(255,255,0)` yellow | 200 | 0.08 | `(224, 224, 146)` — usable ochre |
| `(255,255,0)` yellow | 5 (accent) | 0.08 | `(255, 255, 26)` — stays punchy, as intended |
| `(255,0,0)` red | 200 | 0.08 | `(224, 146, 146)` |
| `(255,255,255)` white | 200 | 0.08 warm | `(224, 217, 211)` — warm off-white |
| `(255,255,255)` white | 200 | 0.58 cool | `(211, 218, 224)` — cool off-white |
| `(0,0,0)` black | 200 | 0.58 | `(29, 30, 31)` — tinted near-black |
| `(163,162,165)` default grey | 200 | 0.58 | `(155, 160, 165)` — given a hue |
| `(206,188,158)` good dominant | 200 | 0.08 | `(206, 188, 158)` — **unchanged** |
| `(58,122,118)` good accent | 30 | 0.08 | `(58, 122, 118)` — **unchanged** |

The last two rows are the important ones: a well-chosen palette passes through untouched. This is a
safety net, not a filter that flattens deliberate art direction.

### 7.3 Value contrast over hue contrast

**This is the most important colour idea in the document.** Beginners (and LLMs) separate objects by
*hue* — red vs blue. Artists separate by *value* — light vs dark. Value contrast survives being converted
to greyscale; hue contrast does not.

Build every scene on **three value tiers**:

| Tier | Target HSV `V` | Use |
|---|---|---|
| **Dark** | 0.18 – 0.35 | Ground, shadowed masses, foreground framing, trim |
| **Mid** | 0.45 – 0.65 | Walls, the bulk of the scene |
| **Light** | 0.75 – 0.95 | Sky-facing planes, highlights, the focal point |

Aim for **≥ 0.25 difference in `V`** between any two adjacent large surfaces. If two big surfaces are
within 0.1 of each other in value, the scene will look muddy no matter how different the hues are.

**The greyscale test:** if a screenshot converted to greyscale becomes unreadable, the palette failed.

### 7.4 Ready-to-use palettes

Each gives dominant / secondary / accent / trim as exact `Color3.fromRGB`.

**Warm stone plaza (Mediterranean)**
```lua
Dominant  = Color3.fromRGB(206, 188, 158)  -- Limestone paving,   V≈0.81
Secondary = Color3.fromRGB(150,  92,  66)  -- Terracotta walls,   V≈0.59
Accent    = Color3.fromRGB( 58, 122, 118)  -- Teal awnings,       V≈0.48
Trim      = Color3.fromRGB( 92,  76,  58)  -- Dark wood,          V≈0.36
```

**Modern civic / clean**
```lua
Dominant  = Color3.fromRGB(232, 232, 230)  -- Off-white concrete  (Roblox's sample uses 248,248,248 [D])
Secondary = Color3.fromRGB(126, 132, 138)  -- Cool grey structure
Accent    = Color3.fromRGB(214, 124,  46)  -- Signal orange
Trim      = Color3.fromRGB( 52,  58,  64)  -- Charcoal
```

**Cold horror interior**
```lua
Dominant  = Color3.fromRGB( 92,  94,  88)  -- Grimy plaster
Secondary = Color3.fromRGB( 58,  52,  46)  -- Rotten wood
Accent    = Color3.fromRGB(150,  58,  44)  -- Dried blood / rust
Trim      = Color3.fromRGB( 28,  30,  34)  -- Near-black
```

**Sci-fi corridor**
```lua
Dominant  = Color3.fromRGB( 74,  80,  92)  -- Gunmetal panel
Secondary = Color3.fromRGB(168, 174, 184)  -- Light panel insert
Accent    = Color3.fromRGB( 64, 224, 232)  -- Cyan Neon (accent only!)
Trim      = Color3.fromRGB( 34,  38,  46)  -- Dark recess
```

**Cosy wood lobby**
```lua
Dominant  = Color3.fromRGB(198, 178, 152)  -- Warm plaster
Secondary = Color3.fromRGB(112,  74,  46)  -- Walnut
Accent    = Color3.fromRGB(176, 138,  62)  -- Brass
Trim      = Color3.fromRGB( 66,  48,  34)  -- Dark walnut
```

**Verdant / natural**
```lua
Dominant  = Color3.fromRGB(106, 124,  74)  -- Foliage mass
Secondary = Color3.fromRGB(134, 128, 110)  -- Weathered stone
Accent    = Color3.fromRGB(206, 154,  74)  -- Autumn / lantern
Trim      = Color3.fromRGB( 58,  56,  44)  -- Deep shadow
```

### 7.5 Roblox's built-in terrain palette — free, coherent colours

These are the actual default `Terrain:GetMaterialColor` values **[V]**. They are professionally chosen,
desaturated and mutually coherent — an excellent source of "safe" colours for *parts*, not just terrain.

```
Grass        Color3.fromRGB(111, 126,  62)   Rock         Color3.fromRGB( 99, 100, 102)
LeafyGrass   Color3.fromRGB(106, 134,  64)   Slate        Color3.fromRGB( 88,  89,  86)
Sand         Color3.fromRGB(207, 203, 167)   Concrete     Color3.fromRGB(152, 152, 152)
Brick        Color3.fromRGB(138,  97,  73)   Cobblestone  Color3.fromRGB(134, 134, 118)
Sandstone    Color3.fromRGB(148, 124,  95)   Basalt       Color3.fromRGB( 75,  74,  74)
Limestone    Color3.fromRGB(255, 243, 192)   Mud          Color3.fromRGB(121, 112,  98)
Ground       Color3.fromRGB(140, 130, 104)   Asphalt      Color3.fromRGB( 80,  84,  84)
Snow         Color3.fromRGB(235, 253, 255)   Ice          Color3.fromRGB(204, 210, 223)
Glacier      Color3.fromRGB(221, 228, 229)   Salt         Color3.fromRGB(255, 255, 254)
Pavement     Color3.fromRGB(143, 144, 135)   WoodPlanks   Color3.fromRGB(172, 148, 108)
CrackedLava  Color3.fromRGB(255,  24,  67)
```

Note `CrackedLava` is the only saturated one — it is an accent by design. Everything else sits at
`S < 0.35`. That is what a professional palette looks like.

---

## 8. Lighting

Read §2 first — `LightingStyle` cannot be scripted. Everything here is scriptable and is where Golem's
lighting work must live.

### 8.1 Verified factory defaults for effect instances

All **[V]**, from `Instance.new(...)` on the live datamodel:

| Class | Defaults |
|---|---|
| `Atmosphere` | `Density = 0.395`, `Offset = 0`, `Color = (200,170,108)`, `Decay = (92,60,14)`, `Glare = 0`, `Haze = 0` |
| `BloomEffect` | `Intensity = 0.4`, `Size = 24`, `Threshold = 0.95` |
| `ColorCorrectionEffect` | `Brightness = 0`, `Contrast = 0`, `Saturation = 0`, `TintColor = (255,255,255)` |
| `DepthOfFieldEffect` | `FarIntensity = 0.75`, `FocusDistance = 0.05`, `InFocusRadius = 10`, `NearIntensity = 0.75` |
| `SunRaysEffect` | `Intensity = 0.25`, `Spread = 1` |
| `PointLight` | `Brightness = 1`, `Range = 8`, `Color = (255,255,255)`, `Shadows = false` |
| `SpotLight` | `Brightness = 1`, `Range = 16`, `Angle = 90`, `Shadows = false` |
| `SurfaceLight` | `Brightness = 1`, `Range = 16`, `Angle = 90`, `Shadows = false` |
| `Terrain` water | `WaterColor = (12,84,92)`, `WaterTransparency = 0.3`, `WaterReflectance = 1`, `WaterWaveSize = 0.15`, `WaterWaveSpeed = 10` |

Note `DepthOfFieldEffect.FocusDistance = 0.05` by default — adding a bare `DepthOfFieldEffect` blurs
everything. **Always set `FocusDistance` and `InFocusRadius` explicitly.**

### 8.2 What each property actually does

- **`Ambient`** — fill light *everywhere*, including indoors. Raising it flattens the scene. Keep it dark
  (`< 60`) for drama, raise for cartoon flatness.
- **`OutdoorAmbient`** — fill for sky-exposed areas only. This is the "sky bounce" colour. Should be
  cool/blue outdoors in daylight.
- **`Brightness`** — sun/moon intensity. `0.5` overcast, `2` normal, `3+` harsh.
- **`ClockTime`** — 0–24 **[D]**. `6`/`18` = horizon, `12` = overhead (worst for form reading —
  avoid noon), `14–15` or `16–18` = good raking light.
- **`GeographicLatitude`** — shifts the sun's arc. Non-zero values give more interesting sun angles.
- **`ExposureCompensation`** — global stops. `-0.5` for dark/moody, `+0.5` bright. Cheapest mood dial.
- **`ColorShift_Top` / `ColorShift_Bottom`** — tint for surfaces facing toward / away from the sun **[D]**.
  **The classic move: warm Top, cool Bottom.** This single pairing creates the warm-light/cool-shadow
  relationship that reads as "professionally lit".
- **`ShadowSoftness`** — 0–1 **[D]**. Low = hard sun, high = overcast. Docs note it is only valid with
  `LightingStyle = Realistic` **[D]**.
- **`EnvironmentDiffuseScale` / `EnvironmentSpecularScale`** — 0–1 **[D]**. How much the skybox lights and
  reflects on surfaces. Lower both for enclosed interiors.
- **`Atmosphere.Density`** — particle count; docs demo 0→0.35 **[D]**. Drives distance fade.
- **`Atmosphere.Haze`** — haziness; docs demo 1→12.8 **[D]**. **The main atmospheric-perspective dial.**
- **`Atmosphere.Glare`** — 0→1 **[D]**, glow around the sun.
- **`Atmosphere.Offset`** — 0→1 **[D]**, how light transmits between camera and sky.
- **Fog vs Atmosphere:** prefer `Atmosphere`. Use `FogStart`/`FogEnd` only for hard cutoffs (horror
  corridors, hiding a streaming boundary). Note `Atmosphere` overrides legacy fog visually in most setups.

### 8.3 Lighting recipes

Each is a complete, copy-adaptable block. All properties used here are verified scriptable **[V]**.

```lua
-- Shared helper.
local Lighting = game:GetService("Lighting")
local function clearFX()
    for _, c in ipairs(Lighting:GetChildren()) do
        if c:IsA("PostEffect") or c:IsA("Atmosphere") or c:IsA("Sky") then c:Destroy() end
    end
end
local function make(class: string, props: {[string]: any})
    local i = Instance.new(class)
    for k, v in pairs(props) do i[k] = v end
    i.Parent = Lighting
    return i
end
```

#### Recipe A — "Warm dusk plaza"
Golden hour. Long shadows, warm key, cool shadow. The most flattering general-purpose look.

```lua
clearFX()
Lighting.ClockTime                = 17.6
Lighting.GeographicLatitude       = 20
Lighting.Brightness               = 2.0
Lighting.ExposureCompensation     = 0.25
Lighting.Ambient                  = Color3.fromRGB(48, 40, 44)
Lighting.OutdoorAmbient           = Color3.fromRGB(96, 78, 74)
Lighting.ColorShift_Top           = Color3.fromRGB(255, 178, 110)   -- warm sun
Lighting.ColorShift_Bottom        = Color3.fromRGB(60, 70, 110)     -- cool bounce
Lighting.GlobalShadows            = true
Lighting.ShadowSoftness           = 0.30
Lighting.EnvironmentDiffuseScale  = 1
Lighting.EnvironmentSpecularScale = 1

make("Atmosphere", { Density = 0.32, Offset = 0.25, Haze = 2.2, Glare = 0.35,
                     Color = Color3.fromRGB(216, 190, 160), Decay = Color3.fromRGB(110, 88, 90) })
make("BloomEffect", { Intensity = 0.55, Size = 28, Threshold = 1.05 })
make("SunRaysEffect", { Intensity = 0.12, Spread = 0.9 })
make("ColorCorrectionEffect", { Brightness = 0, Contrast = 0.08, Saturation = 0.08,
                                TintColor = Color3.fromRGB(255, 246, 236) })
```

#### Recipe B — "Cold horror interior"
Desaturated, high contrast, cold ambient with warm practicals fighting it.

```lua
clearFX()
Lighting.ClockTime                = 0
Lighting.Brightness               = 0.4
Lighting.ExposureCompensation     = -0.35
Lighting.Ambient                  = Color3.fromRGB(8, 10, 14)
Lighting.OutdoorAmbient           = Color3.fromRGB(14, 18, 26)
Lighting.ColorShift_Top           = Color3.fromRGB(40, 60, 90)
Lighting.ColorShift_Bottom        = Color3.fromRGB(10, 10, 16)
Lighting.GlobalShadows            = true
Lighting.ShadowSoftness           = 0.05                            -- hard, nasty shadows
Lighting.EnvironmentDiffuseScale  = 0.2
Lighting.EnvironmentSpecularScale = 0.3
Lighting.FogStart                 = 12
Lighting.FogEnd                   = 90
Lighting.FogColor                 = Color3.fromRGB(16, 20, 26)

make("Atmosphere", { Density = 0.45, Offset = 0, Haze = 4.2, Glare = 0,
                     Color = Color3.fromRGB(120, 130, 140), Decay = Color3.fromRGB(30, 36, 44) })
make("BloomEffect", { Intensity = 0.35, Size = 18, Threshold = 1.4 })
make("ColorCorrectionEffect", { Brightness = -0.03, Contrast = 0.22, Saturation = -0.42,
                                TintColor = Color3.fromRGB(206, 222, 245) })
make("DepthOfFieldEffect", { FocusDistance = 18, InFocusRadius = 26,
                             FarIntensity = 0.35, NearIntensity = 0.10 })
-- Warm practicals are what make it read as horror rather than just dark:
-- PointLight { Brightness = 1.6, Range = 22, Color = Color3.fromRGB(255, 196, 132), Shadows = true }
```

#### Recipe C — "Clean product showcase"
Neutral, bright, soft. For lobbies, shops, UI-adjacent spaces, anything selling an object.

```lua
clearFX()
Lighting.ClockTime                = 13.0
Lighting.Brightness               = 1.6
Lighting.ExposureCompensation     = 0.10
Lighting.Ambient                  = Color3.fromRGB(140, 140, 145)
Lighting.OutdoorAmbient           = Color3.fromRGB(150, 150, 155)
Lighting.ColorShift_Top           = Color3.fromRGB(255, 252, 245)
Lighting.ColorShift_Bottom        = Color3.fromRGB(210, 216, 228)
Lighting.GlobalShadows            = true
Lighting.ShadowSoftness           = 0.90                            -- big soft studio shadows
Lighting.EnvironmentDiffuseScale  = 1
Lighting.EnvironmentSpecularScale = 1
Lighting.FogEnd                   = 100000

make("Atmosphere", { Density = 0.15, Offset = 0.1, Haze = 0.4, Glare = 0,
                     Color = Color3.fromRGB(235, 238, 244), Decay = Color3.fromRGB(180, 186, 196) })
make("BloomEffect", { Intensity = 0.40, Size = 30, Threshold = 1.20 })
make("ColorCorrectionEffect", { Brightness = 0.02, Contrast = 0.05, Saturation = -0.05,
                                TintColor = Color3.fromRGB(255, 255, 255) })
```

#### Recipe D — "Overcast stone" (grim / fortress / ruins)
No sun direction, heavy haze, cool desaturation. Great for making blocky geometry look intentional.

```lua
clearFX()
Lighting.ClockTime                = 9.2
Lighting.Brightness               = 1.4
Lighting.ExposureCompensation     = -0.10
Lighting.Ambient                  = Color3.fromRGB(58, 62, 70)
Lighting.OutdoorAmbient           = Color3.fromRGB(120, 124, 132)
Lighting.ColorShift_Top           = Color3.fromRGB(150, 165, 190)
Lighting.ColorShift_Bottom        = Color3.fromRGB(48, 52, 60)
Lighting.GlobalShadows            = true
Lighting.ShadowSoftness           = 0.85
Lighting.EnvironmentDiffuseScale  = 0.9
Lighting.EnvironmentSpecularScale = 0.4

make("Atmosphere", { Density = 0.42, Offset = 0.2, Haze = 5.5, Glare = 0,
                     Color = Color3.fromRGB(170, 178, 188), Decay = Color3.fromRGB(92, 98, 108) })
make("BloomEffect", { Intensity = 0.25, Size = 22, Threshold = 1.3 })
make("ColorCorrectionEffect", { Brightness = -0.02, Contrast = 0.10, Saturation = -0.20,
                                TintColor = Color3.fromRGB(238, 244, 255) })
```

#### Recipe E — "Neon night" (cyber / arcade / city)
Dark base so emissive surfaces carry the image. Bloom threshold is deliberately **below 1.0** so `Neon`
blooms hard.

```lua
clearFX()
Lighting.ClockTime                = 22.0
Lighting.Brightness               = 0.9
Lighting.ExposureCompensation     = 0.20
Lighting.Ambient                  = Color3.fromRGB(20, 16, 32)
Lighting.OutdoorAmbient           = Color3.fromRGB(32, 26, 52)
Lighting.ColorShift_Top           = Color3.fromRGB(90, 80, 190)
Lighting.ColorShift_Bottom        = Color3.fromRGB(200, 40, 120)
Lighting.GlobalShadows            = true
Lighting.ShadowSoftness           = 0.4

make("Atmosphere", { Density = 0.50, Offset = 0.15, Haze = 6.0, Glare = 0.20,
                     Color = Color3.fromRGB(110, 90, 160), Decay = Color3.fromRGB(40, 20, 60) })
make("BloomEffect", { Intensity = 1.10, Size = 40, Threshold = 0.85 })   -- < 1.0 = Neon blooms
make("ColorCorrectionEffect", { Brightness = 0, Contrast = 0.16, Saturation = 0.22,
                                TintColor = Color3.fromRGB(232, 236, 255) })
```

#### Recipe F — "Bright stylised day" (safe default)
When the prompt gives no mood. Cheerful, readable, hard to get wrong.

```lua
clearFX()
Lighting.ClockTime                = 14.2
Lighting.GeographicLatitude       = 15
Lighting.Brightness               = 2.4
Lighting.ExposureCompensation     = 0
Lighting.Ambient                  = Color3.fromRGB(72, 74, 70)
Lighting.OutdoorAmbient           = Color3.fromRGB(128, 130, 124)
Lighting.ColorShift_Top           = Color3.fromRGB(255, 240, 214)
Lighting.ColorShift_Bottom        = Color3.fromRGB(120, 140, 160)
Lighting.GlobalShadows            = true
Lighting.ShadowSoftness           = 0.35

make("Atmosphere", { Density = 0.30, Offset = 0.20, Haze = 1.4, Glare = 0.15,
                     Color = Color3.fromRGB(199, 209, 224), Decay = Color3.fromRGB(108, 120, 140) })
make("BloomEffect", { Intensity = 0.45, Size = 26, Threshold = 1.10 })
make("ColorCorrectionEffect", { Brightness = 0, Contrast = 0.06, Saturation = 0.10,
                                TintColor = Color3.fromRGB(255, 253, 248) })
```

### 8.4 Roblox's own shipped configurations — highest-authority reference

These are exact values Roblox publishes for its own sample places. They are already present in this
repo's retrieval corpus (`packages/corpus/data/chunks.jsonl`), so Golem can cite them. Treat them as the
gold standard — they beat any invented preset.

**Cool ocean morning** (Island Jump sample, `docs/tutorials/curriculums/core/building/customize-global-lighting`)
```
Ambient            = 16, 16, 16          ColorShift_Top = 196, 222, 255
OutdoorAmbient     = 134, 158, 190       ShadowSoftness = 0
LightingStyle      = Realistic           ClockTime      = 9
GeographicLatitude = 78
```
Note the technique: near-black `Ambient` + strongly tinted `ColorShift_Top` + mid `OutdoorAmbient`.
That is the "cool blue-grey ocean tone" formula.

**Laser tag arena** (Environmental Art curriculum sample)
```
Ambient            = 26, 34, 36          OutdoorAmbient = 26, 34, 36
LightingStyle      = Realistic           ShadowSoftness = 0.15
GeographicLatitude = -18                 TimeOfDay      = -15:16:23
Atmosphere:  Density 0.285 · Offset 0.65 · Decay 254,254,254 · Glare 0.3 · Haze 2
Bloom:       Intensity 1.5 · Size 56
DepthOfField: FarIntensity 0.05
```
`Bloom.Intensity 1.5 / Size 56` is far stronger than the `0.4 / 24` default **[V]** — Roblox's own art
direction pushes bloom hard. Golem is almost certainly under-using it.

**Volcanic pre-dawn** (VFX volcano tutorial)
```
Ambient              = 133, 152, 176     Brightness           = 2
ColorShift_Top       = 207, 178, 72      LightingStyle        = Realistic
ClockTime            = 4.3               GeographicLatitude   = 199
ExposureCompensation = -1
Bloom: Intensity 0.75 · Size 80 · Threshold 0.85
```
`Threshold 0.85` (below 1.0) is explicitly described as letting "more colors in the environment to glow" —
confirming the §8.3 Recipe E technique.

**Evening campfire** (outdoor realistic lighting tutorial): `ClockTime = 17`,
`EnvironmentDiffuseScale = 1`, `EnvironmentSpecularScale = 1` — the docs state setting both to `1` is what
"truly take[s] advantage of metal reflections" under `Realistic`.

#### The light-leak rule (important, easy to miss)

Under `LightingStyle = Realistic`, Roblox detects indoor spaces geometrically. Their docs are explicit:
surround indoor spaces with `Part` objects **at least 1 stud thick** to stop outdoor light leaking in —
and their own sample uses a **minimum of 2.5 studs**.

**Consequence for Golem:** thin walls are not just an aesthetic problem (§3.2), they are a *lighting*
problem. A 0.2-stud wall will leak sunlight into an interior and the room will look broken. Interior
enclosures must be ≥ 1 stud, ideally 2–2.5.

### 8.5 Local lights — the rule that matters

`PointLight` defaults to `Range = 8`, `Brightness = 1`, `Shadows = false` **[V]**. Range 8 is *tiny* —
barely larger than one avatar. Almost every generated scene under-ranges its lights.

- Practical light in a room: `Range = 20–30`, `Brightness = 1.2–2`.
- **Every visible light source object must have a light.** A lamp model with no `PointLight` reads as a
  prop, not a lamp. Conversely, a `PointLight` with no visible emitter reads as a bug.
- **Colour your practicals against the ambient.** Warm practicals `(255, 196, 132)` in cool ambient is the
  single most reliable "cinematic" move.
- `Shadows = true` is expensive — enable on at most 2–4 hero lights per scene (§11).

---

## 9. Detail density and the clutter pass

**This is the step that separates a greybox from a scene, and it is the step Golem currently omits entirely.**

### 9.1 Trim and edges

Roblox has no bevel tool for parts — you fake it with smaller parts. Every large flat surface needs its
edges broken.

| Technique | Implementation |
|---|---|
| **Skirting / base trim** | A part `0.8–1.2` tall, `0.3` proud of the wall, running the wall's length, at floor level, in the trim colour. |
| **Cornice / top trim** | Same at ceiling level, often slightly larger (`1.0–1.5`). |
| **Fake bevel** | On a hero edge, a thin part (`0.3 × 0.3`) at 45° along the corner in a lighter tint. |
| **Panel division** | Split a 30-stud wall into 3× 10-stud panels with `0.4`-deep recessed strips between. |
| **Frames** | Every door and window opening gets a frame `0.5` proud, `0.5–1` thick. **Never a bare hole.** |
| **Plinths** | Every column, statue, monument gets a base `1–2` larger in footprint and `0.5–1` tall. |
| **Capitals** | And a top piece, mirroring the plinth. |

A "grey pole with a yellow cube on top" becomes acceptable the moment it has: a plinth, a shaft with a
subtle taper (two stacked parts), a capital, and a trim ring — five parts instead of two, and it reads as
designed.

### 9.2 Why bare flat surfaces read as unfinished

A perfectly flat, single-material, single-colour plane gives the eye **no scale reference and no
information**. The brain interprets "no information" as "not finished" — correctly, since that is what a
blockout is.

**Rule: no unbroken flat surface larger than ~20 × 20 studs.** Break it with at least one of:
- A material change (inset panel of a sibling material).
- A value change (a 10% lighter or darker inset region).
- Geometry (a recess `0.3` deep, a raised strip, a seam).
- An applied object (a vent, sign, pipe, poster, planter).

### 9.3 The clutter pass — concrete part budgets

After blockout, run a clutter pass. Target densities:

| Space type | Props per 100 studs² of floor | Notes |
|---|---|---|
| Sparse plaza / exterior | 1–2 | Concentrated at edges |
| Standard interior room | 4–8 | |
| Dense shop / workshop | 10–18 | |
| Horror / abandoned | 8–14 | Plus debris scatter |
| Sci-fi corridor | 3–6 | Mostly wall-mounted |

**Part-count expectations for a finished scene** (this is the number Golem is currently missing by ~10×):

| Element | Realistic part count |
|---|---|
| Simple prop (crate, barrel) | 3–6 |
| Good prop (lamp, bench, sign) | 8–20 |
| Hero prop (trophy, statue, fountain) | 25–60 |
| Small room, fully dressed | 150–400 |
| Plaza, fully dressed | 600–1500 |

**Clutter placement rules:**
1. **Cluster, don't scatter.** Real objects group. Place 3–5 items together, then leave a gap.
2. **Edges and corners first.** Objects gravitate to walls. Centre stays open (§5.4).
3. **Vertical layering.** Something on the floor, something at waist height (2–3), something at eye
   height (4–5), something above (8+). All four layers = a rich space.
4. **Rotate everything.** Nothing real is perfectly axis-aligned. Give props `±15°` free rotation.
5. **Intersect deliberately.** Props should slightly overlap and penetrate surfaces — a crate sunk `0.1`
   into the floor reads as resting; one floating `0.05` above reads as broken.
6. **Tell a story.** A knocked-over chair, a stack of crates mid-unpacking, a half-open door. One
   narrative detail per room is worth ten generic ones.

---

## 10. Terrain

### 10.1 Terrain vs Parts

| Use `Terrain` | Use `Part` |
|---|---|
| Ground planes, hills, cliffs | Anything architectural |
| Water bodies | Anything with a hard edge |
| Caves, organic masses | Anything that must snap to grid |
| Large natural areas (> 200 studs) | Props and clutter |
| Beaches, rivers, deserts | Interiors |

Terrain is voxel-based — cheap for organic mass, bad for precision. **Never build a wall out of terrain.**
Do use terrain to ground a built structure: architecture that sits on a flat `Part` slab floating in void
is a hallmark of generated scenes.

### 10.2 The API — with a correction

**There is no `Terrain:PaintRegion` method.** It does not exist. The repaint operation is
**`Terrain:ReplaceMaterial`** **[D]**. Golem must not emit `PaintRegion`.

Verified signatures **[D]**:

```lua
Terrain:FillBlock(cframe: CFrame, size: Vector3, material: Enum.Material): ()
Terrain:FillBall(center: Vector3, radius: number, material: Enum.Material): ()
Terrain:FillCylinder(cframe: CFrame, height: number, radius: number, material: Enum.Material): ()
Terrain:FillWedge(cframe: CFrame, size: Vector3, material: Enum.Material): ()
Terrain:FillRegion(region: Region3, resolution: number, material: Enum.Material): ()
Terrain:ReplaceMaterial(region: Region3, resolution: number,
                        sourceMaterial: Enum.Material, targetMaterial: Enum.Material): ()
Terrain:SetMaterialColor(material: Enum.Material, value: Color3): ()
Terrain:GetMaterialColor(material: Enum.Material): Color3
```

`resolution` must be `4` for `FillRegion` / `ReplaceMaterial` in practice — Region3 must be aligned to a
4-stud grid (`Region3:ExpandToGrid(4)`).

### 10.3 Practical terrain

```lua
local T = workspace.Terrain

-- Ground slab under the whole scene. Sink it so the top face sits at y = 0.
T:FillBlock(CFrame.new(0, -10, 0), Vector3.new(400, 20, 400), Enum.Material.Grass)

-- A worn path: replace grass with ground along a corridor.
local pathRegion = Region3.new(Vector3.new(-10, -2, -200), Vector3.new(10, 2, 200)):ExpandToGrid(4)
T:ReplaceMaterial(pathRegion, 4, Enum.Material.Grass, Enum.Material.Ground)

-- Rocky outcrops for silhouette interest — balls read more natural than blocks.
for i = 1, 8 do
    T:FillBall(Vector3.new(math.random(-150, 150), math.random(-4, 6), math.random(-150, 150)),
               math.random(8, 20), Enum.Material.Rock)
end

-- Recolour terrain to match the scene palette (this is underused and very effective).
T:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(106, 124, 74))
T:SetMaterialColor(Enum.Material.Rock,  Color3.fromRGB(134, 128, 110))

-- Water, tuned. Defaults are WaterColor (12,84,92), Transparency 0.3, Reflectance 1,
-- WaveSize 0.15, WaveSpeed 10. [V]
T.WaterColor        = Color3.fromRGB(18, 74, 92)
T.WaterTransparency = 0.55
T.WaterReflectance  = 0.9
T.WaterWaveSize     = 0.08
T.WaterWaveSpeed    = 8
```

**`SetMaterialColor` is a top-tier art-direction lever** — it retints all terrain of a material globally,
letting one call harmonise the ground with the built palette.

---

## 11. Performance sanity

Roblox documents surprisingly few hard caps. What it does state **[D]**:

- **Frame budget: 16.67 ms** (60 FPS). Server heartbeat capped at 60 FPS.
- **Server memory:** 6.25 GiB base + 100 MiB per player; keep usage **below 50%**.
- **Textures:** most minor images **< 256×256**, max **512×512**; tileable textures / trim sheets up to
  **1024×1024**.
- **No documented maximum part count.** Roblox explicitly declines to give one, saying frame rate "differs
  wildly between devices."

Working budgets (craft convention, not vendor-stated):

| Metric | Comfortable | Caution | Bad |
|---|---|---|---|
| Parts in one loaded view | < 3,000 | 3–8k | > 15k |
| Total parts in a place (streaming on) | < 50k | 50–150k | > 250k |
| Parts with `CastShadow = true` | < 1,500 | 1.5–4k | > 8k |
| Lights with `Shadows = true` | ≤ 4 | 5–8 | > 12 |
| Total local lights in view | < 30 | 30–80 | > 150 |
| Distinct materials per scene | 3–5 | 6–8 | > 10 |

### 11.1 The rules that actually matter

1. **`CastShadow = false` on small and distant parts.** Default is `true` **[V]**. Trim, clutter, interior
   detail, anything under ~2 studs — turn it off. Docs recommend exactly this **[D]**. This is the single
   biggest cheap win, and it costs nothing visually.
2. **`Anchored = true` on everything static.** Default is `false` **[V]**. An unanchored decorative part is
   a physics body being simulated forever. Generated scenes leak performance here constantly.
3. **Unions:** CSG is expensive when unions are complex and numerous. Set `RenderFidelity` to `Automatic`
   or `Performance` **[D]** and `CollisionFidelity` to `Box` (lowest memory **[D]**) or `Hull` for anchored
   décor. Union smoothing angle **30–70°** works; 90–180° causes shadow artefacts on sharp edges.
   **Prefer plain `Part`s for right-angled architecture** — a union of two boxes is strictly worse than
   two boxes.
4. **`MeshPart` beats `UnionOperation` for anything repeated** — meshes share cached data across instances;
   unions duplicate it.
5. **Instancing:** meshes sharing identical `MeshContent` + `SurfaceAppearance`/`TextureID` batch into one
   draw call **[D]**. Reuse a small kit rather than authoring unique geometry.
6. **Streaming** (`StreamingEnabled`) — defaults `StreamingTargetRadius = 1024`, `StreamingMinRadius = 64`
   **[D]**; recommended `StreamingIntegrityMode = PauseOutsideLoadedArea` and
   `ModelStreamingBehavior = Improved` **[D]**. **All of these are place-file settings, not scriptable [V]** —
   Golem must surface them as instructions, not code.
7. **Lights:** limit range and angle, use fewer instances, disable `Light.Shadows` where unnecessary **[D]**.

```lua
-- Run over every generated part before returning the scene.
local function optimise(root: Instance)
    for _, d in ipairs(root:GetDescendants()) do
        if d:IsA("BasePart") then
            d.Anchored = true
            local vol = d.Size.X * d.Size.Y * d.Size.Z
            if vol < 40 then d.CastShadow = false end          -- small detail: no shadow
            if d:IsA("UnionOperation") then
                d.RenderFidelity = Enum.RenderFidelity.Automatic
                d.CollisionFidelity = Enum.CollisionFidelity.Box
            end
        end
    end
end
```

---

## 12. Scene recipes

Each recipe is a structured spec Golem can instantiate. Fields are deliberately uniform so they can be
templated. **`FAIL REVIEW IF`** lists the specific conditions that mean the output should be regenerated.

---

### R1 — Spawn Plaza

| Field | Spec |
|---|---|
| **Footprint** | 140 × 160 studs, open |
| **Layout** | Central raised dais (20×20, +2 studs) with `SpawnLocation`. Four quadrant paths 12 wide radiating to edges. Perimeter colonnade of columns every 15 studs. Corner planters `20 × 11 × 5`. |
| **Elevations** | 3 tiers: sunken ring at −2, main deck at 0, dais at +2, landmark base at +5 |
| **Focal hierarchy** | **Primary:** monument/spire at the north third, ~50 studs tall, offset 25 studs off-axis. **Secondary:** two arched gateways east/west. **Tertiary:** colonnade, planters, benches. |
| **Palette** | Dominant `Color3.fromRGB(206, 188, 158)` · Secondary `(150, 92, 66)` · Accent `(58, 122, 118)` · Trim `(92, 76, 58)` |
| **Materials** | Ground `Pavement`; structure `Limestone`; roofs/awnings `Fabric`; accent `Metal`; planter fill `LeafyGrass` |
| **Lighting** | Recipe A — Warm dusk plaza (§8.3) |
| **Props** | 8× bench (10 parts each), 6× planter with foliage, 4× lamp post *with `PointLight` Range 26 Brightness 1.5 Color (255,214,170)*, 2× notice board, 3× market stall with `Fabric` canopy, 12× cobble detail insets, bollards along path edges every 8 studs |
| **Part budget** | 700–1,400 |
| **FAIL REVIEW IF** | Ground is one flat unbroken slab · fewer than 3 elevations · monument has no plinth/capital · no lamp has a `PointLight` · any part still `Material = Plastic` · colonnade columns are identical and evenly spaced with zero variation · centre of plaza is cluttered instead of open |

---

### R2 — Shop Interior

| Field | Spec |
|---|---|
| **Footprint** | 40 × 30, ceiling at 14 |
| **Layout** | Entry on short wall (door 10×10). Counter across the back third at 3.5 tall. Shelving along both long walls, 9 tall. Central free-standing display island 8×4. Window wall to street on one long side, sills at 4, glazing 5×5. |
| **Elevations** | Floor 0; counter dais +0.5; display island +0.5 |
| **Focal hierarchy** | **Primary:** back-counter hero display, lit. **Secondary:** central island, window light shaft. **Tertiary:** wall shelving. |
| **Palette** | Dominant `(198, 178, 152)` walls · Secondary `(112, 74, 46)` joinery · Accent `(176, 138, 62)` brass · Trim `(66, 48, 34)` |
| **Materials** | Walls `Plaster`; floor `WoodPlanks`; joinery `Wood`; counter top `Marble`; accents `Foil`; window `Glass` @ `Transparency 0.45` |
| **Lighting** | Recipe C — Clean product showcase, **plus** 5× `PointLight` Range 22 Brightness 1.3 Color `(255, 236, 208)` over counter and island; 1× `SpotLight` on hero display, `Angle 45`, `Shadows = true` |
| **Props** | 30–50 stock items on shelves (vary rotation/scale ±8%), till, stool, 2 crates mid-unpack near back, hanging sign, rug (`Carpet`), 3 wall posters, ceiling beams every 8 studs, skirting + cornice on all walls |
| **Part budget** | 250–500 |
| **FAIL REVIEW IF** | Shelves are empty · no skirting or cornice · door is a bare hole with no frame · walls and floor share a material · fewer than 3 light sources · stock items are perfectly aligned and identical · no ceiling |

---

### R3 — Horror Room

| Field | Spec |
|---|---|
| **Footprint** | 34 × 26, ceiling 12, one door 7×4 (deliberately narrow — traps the player) |
| **Layout** | Asymmetric. Debris pile in one corner. Overturned furniture. One boarded window high on a wall (sill 7). A single working ceiling fixture, swinging. Exit door offset from centre, partly blocked. |
| **Elevations** | Floor 0 with a collapsed section at −1.5; debris mound to +2 |
| **Focal hierarchy** | **Primary:** the lit fixture and the pool of light beneath it. **Secondary:** the exit door in shadow. **Tertiary:** debris, furniture. |
| **Palette** | Dominant `(92, 94, 88)` · Secondary `(58, 52, 46)` · Accent `(150, 58, 44)` · Trim `(28, 30, 34)` |
| **Materials** | Walls `Plaster` + patches of `Concrete`; floor `WoodPlanks` with `CeramicTiles` remnants; furniture `Wood`; pipes/fixtures `CorrodedMetal` |
| **Lighting** | Recipe B — Cold horror interior. 1× `PointLight` Range 24 Brightness 1.6 Color `(255, 196, 132)`, `Shadows = true`. **Exactly one** light source — the darkness is the design. |
| **Props** | Overturned chair, broken table (5 pieces), 20–30 debris scatter parts (0.3–1.5 studs, rotated randomly), hanging wires, 4 wall stains (thin dark parts at `Transparency 0.4`), boarded window slats at varied angles, dangling fixture |
| **Part budget** | 200–450 |
| **FAIL REVIEW IF** | Room is symmetric · more than 2 light sources · everything is upright and tidy · `Saturation` in `ColorCorrectionEffect` is ≥ 0 · no debris · walls are one uniform colour with no staining/variation · lighting is bright enough to see the whole room at once |

---

### R4 — Obby Section

| Field | Spec |
|---|---|
| **Footprint** | 60 wide × 200 long corridor of platforms over void/water |
| **Layout** | 12–18 platforms. **Gaps must respect `JumpHeight = 7.2` and `WalkSpeed = 16` [V]** — horizontal gaps 8–14 studs are comfortable, 18 is expert, >22 is impossible without boosts. Vertical rises ≤ 6 per jump. Checkpoint every 5–6 platforms. |
| **Elevations** | Continuous climb: start 0, end +60. Never flat. |
| **Focal hierarchy** | **Primary:** the next platform — always the brightest, highest-contrast object in view. **Secondary:** checkpoints (accent colour + `Neon`). **Tertiary:** background scenery. |
| **Palette** | Dominant `(126, 132, 138)` platforms · Secondary `(74, 80, 92)` supports · Accent `(64, 224, 232)` checkpoints · Trim `(34, 38, 46)` |
| **Materials** | Platforms `Concrete`; edges/trim `Metal`; checkpoints `Neon`; hazards `CorrodedMetal`; supports `Metal` |
| **Lighting** | Recipe F or E. Ensure high value contrast between platform tops and the void below. |
| **Props** | Trim ring on every platform edge (readability!), support struts beneath each platform (never floating slabs), checkpoint arches, hazard markers, background silhouette geometry |
| **Part budget** | 300–700 |
| **FAIL REVIEW IF** | Any gap > 22 studs · platforms float with no visible support · platform edges have no contrasting trim (players must read the edge instantly) · checkpoints not visually distinct · path is ambiguous at any point · platforms are all identical size and spacing |

---

### R5 — Sci-Fi Corridor

| Field | Spec |
|---|---|
| **Footprint** | 12 wide × 80 long × 12 high |
| **Layout** | Modular: repeating 10-stud bay. Each bay = wall panels + ceiling rib + floor plate + recessed light strip. Every 3rd bay gets a variation (a door, a window, a pipe run, a console alcove). One bend or elevation change at the midpoint so the corridor doesn't read as a tube. |
| **Elevations** | Floor 0, with a 2-stud step at the midpoint |
| **Focal hierarchy** | **Primary:** the lit doorway at the far end. **Secondary:** the console alcove. **Tertiary:** repeating panel rhythm. |
| **Palette** | Dominant `(74, 80, 92)` · Secondary `(168, 174, 184)` · Accent `(64, 224, 232)` · Trim `(34, 38, 46)` |
| **Materials** | Panels `Metal`; inserts `SmoothPlastic`; floor `DiamondPlate`; light strips `Neon`; recesses `Concrete` |
| **Lighting** | Recipe E adapted: `Ambient (18,20,28)`, `Brightness 0.6`. `Neon` strips + matching `PointLight` Range 18 Brightness 1.1 Color `(64, 224, 232)` every 10 studs. Bloom `Threshold 0.85`. |
| **Props** | Pipe runs along ceiling, wall consoles (12+ parts), floor grating insets, warning decals, cable bundles, 2 hero doors with frames |
| **Part budget** | 400–900 |
| **FAIL REVIEW IF** | Corridor is a straight untextured tube · panel bays repeat identically with no variation every 3rd bay · `Neon` strips have no `PointLight` · no ceiling detail · floor is one flat plate · `Neon` exceeds ~5% of surface area |

---

### R6 — Grand Lobby

| Field | Spec |
|---|---|
| **Footprint** | 90 × 70, ceiling at 32 (atrium) |
| **Layout** | Symmetric-ish entry axis, broken by asymmetric furniture. Double-height central volume with mezzanine at +16 running along two sides. Reception counter offset from centre. Grand stair (rise 1.2 / run 2.8, width 12) to mezzanine. Columns 6×6 every 20 studs. |
| **Elevations** | Floor 0, stair landing +8, mezzanine +16, ceiling 32 |
| **Focal hierarchy** | **Primary:** grand stair + whatever sits at its head. **Secondary:** reception counter, chandelier/central fixture. **Tertiary:** columns, seating clusters. |
| **Palette** | Dominant `(232, 232, 230)` · Secondary `(126, 132, 138)` · Accent `(176, 138, 62)` brass · Trim `(52, 58, 64)` |
| **Materials** | Floor `Marble`; walls `Plaster`; columns `Limestone`; rails/accents `Foil`; seating `Leather`; rugs `Carpet` |
| **Lighting** | Recipe C. Plus 8–12 `PointLight` Range 30 Brightness 1.2 Color `(255, 244, 226)`; 2 hero lights with `Shadows = true` at the stair. |
| **Props** | 4 seating clusters (sofa + 2 chairs + table + rug, 40+ parts each), reception desk, 6 planters, chandelier (30+ parts), wall art, balustrade sections on mezzanine, skirting + cornice everywhere, floor inlay pattern in contrasting marble |
| **Part budget** | 900–2,000 |
| **FAIL REVIEW IF** | Ceiling is flat and undetailed at 32 studs (needs coffers/beams/skylight) · no mezzanine or vertical interest · floor is one uniform marble slab with no inlay · columns have no plinth or capital · fewer than 6 light sources · seating is a single box per chair |

---

### R7 — Monument / Hero Prop

| Field | Spec |
|---|---|
| **Footprint** | Base 24 × 24, total height 45–60 |
| **Layout** | **Four-tier vertical structure — this is the antidote to "three stacked primitives".** (1) Stepped plinth: 3 steps, each inset 2 studs, total height 4. (2) Pedestal: 12×12×10 with recessed panels on each face and an inscription band. (3) Shaft/body: the subject, 30–40 tall, tapering, with an asymmetric element at ⅔ height. (4) Crown: a distinctive silhouette-breaking top — never a plain cube. |
| **Elevations** | Surrounding ground drops 1 stud in a ring so the monument sits in a shallow basin |
| **Focal hierarchy** | It **is** the primary. Everything nearby must be tertiary — low contrast, low chroma. |
| **Palette** | Dominant `(206, 188, 158)` stone · Secondary `(134, 128, 110)` weathered · Accent `(176, 138, 62)` gilding on the crown only · Trim `(92, 76, 58)` |
| **Materials** | Plinth `Granite`; pedestal `Limestone`; shaft `Marble`; crown accent `Foil`; inscription `Slate` |
| **Lighting** | 3× `SpotLight` at the base aimed up, `Angle 40`, `Range 45`, `Brightness 2`, `Shadows = true` on one. Uplighting a monument is what makes it read as a monument. |
| **Props** | Bollards + chain ring at 6 studs radius, 4 planters, 2 benches facing it, ground inlay radiating from the base |
| **Part budget** | 40–90 for the monument itself |
| **FAIL REVIEW IF** | Fewer than 4 tiers · fewer than 25 parts · crown is a plain box/sphere · no plinth · no uplighting · silhouette is a simple stack of rectangles · gilding accent covers more than ~10% |

---

### R8 — Village Street

| Field | Spec |
|---|---|
| **Footprint** | 30 wide × 180 long; roadway 16, sidewalks 7 each side |
| **Layout** | 6–8 buildings per side, **varying width (20/30/25/35)**, varying height (2–4 storeys at 12/storey), varying setback (±3 studs). Street bends ~15° at the midpoint. Ground level: doors and shopfronts. Upper: windows with sills and shutters. |
| **Elevations** | Street rises 4 studs over its length; sidewalks +0.7 above roadway (kerb) |
| **Focal hierarchy** | **Primary:** a tower/clock/inn sign at the bend, visible down the whole street. **Secondary:** two ornate shopfronts. **Tertiary:** the residential run. |
| **Palette** | Dominant `(198, 178, 152)` plaster · Secondary `(150, 92, 66)` brick/timber · Accent `(58, 122, 118)` shutters & signs · Trim `(92, 76, 58)` |
| **Materials** | Walls `Plaster` + `Brick`; timber framing `Wood`; roofs `ClayRoofTiles` / `RoofShingles`; road `Cobblestone`; sidewalk `Pavement`; awnings `Fabric` |
| **Lighting** | Recipe A. Lamp posts every 25 studs, `PointLight` Range 24 Brightness 1.4 Color `(255, 206, 156)`. |
| **Props** | Per building: door + frame, 3–6 windows with sills/shutters, hanging sign, chimney, gutter line, roof overhang 1.5 studs. Street: 7 lamp posts, 4 market stalls, barrels/crates clustered at 5 spots, 3 planters, wheel ruts (thin dark parts in the cobbles), 2 wells/fountains |
| **Part budget** | 1,200–2,500 |
| **FAIL REVIEW IF** | Buildings are identical width/height/setback · street is dead straight · roofs are flat (must be sloped, with overhang) · no chimneys · windows are holes without frames · sidewalk and road share material and level · no clustering of props |

---

## 13. Auto-reject rules — machine-checkable

Golem should run these before returning any scene. Each is cheap to evaluate over the generated
instance tree.

```lua
local FORBIDDEN = {
    Color3.fromRGB(255,0,0), Color3.fromRGB(0,255,0), Color3.fromRGB(0,0,255),
    Color3.fromRGB(255,255,0), Color3.fromRGB(255,0,255), Color3.fromRGB(0,255,255),
    Color3.fromRGB(163,162,165), -- Part factory default [V]
}
```

| # | Rule | Threshold |
|---|---|---|
| 1 | No part may keep `Material = Enum.Material.Plastic` | 0 allowed |
| 2 | No part may keep `Color = (163,162,165)` | 0 allowed |
| 3 | No part over 4 studs may use a forbidden saturated primary | 0 allowed |
| 4 | Distinct materials used | ≥ 3 and ≤ 8 |
| 5 | Distinct colours used | ≥ 4 (a 2-colour scene is a greybox) |
| 6 | Max HSV `S` on any surface > 50 studs² | ≤ 0.35 |
| 7 | HSV `V` spread across the 10 largest surfaces | ≥ 0.35 (max − min) |
| 8 | Distinct Y elevations of walkable surfaces | ≥ 3 for scenes > 60 studs across |
| 9 | Part count vs floor area | ≥ 1 part per 3 studs² of dressed interior |
| 10 | Every `Neon` part has a light within 10 studs | 100% |
| 11 | Every emitter-looking prop (lamp/lantern/fixture) has a light | 100% |
| 12 | All static parts `Anchored = true` | 100% |
| 13 | Parts with volume < 40 studs³ have `CastShadow = false` | ≥ 90% |
| 14 | Lights with `Shadows = true` | ≤ 4 |
| 15 | No unbroken single-material flat surface | ≤ 20 × 20 studs |
| 16 | Every door/window opening has a frame part | 100% |
| 17 | Every column/monument has a plinth | 100% |
| 18 | Scene sets `Lighting.Ambient`, `OutdoorAmbient`, `Brightness`, `ClockTime`, `ColorShift_Top`, `ColorShift_Bottom` | all 6 |
| 19 | Scene creates an `Atmosphere` | required |
| 20 | Scene creates ≥ 2 post-effects | required |
| 21 | Generated code contains `Lighting.Technology` | **0 — will error [V]** |
| 22 | Generated code contains `Lighting.LightingStyle` | **0 — not scriptable [V]** |
| 23 | Generated code contains `Terrain:PaintRegion` | **0 — method does not exist [D]** |
| 24 | Generated code sets `StreamingMinRadius`/`StreamingTargetRadius` | **0 — not scriptable [V]** |
| 25 | Barrier walls intended as impassable | ≥ 10 studs (`JumpHeight = 7.2` **[V]**) |

---

## 14. Integration notes for Golem — root cause found

While researching, I read the live production system prompt at
**`/Users/moshe/Desktop/RbxAI/apps/worker/src/prompts.ts`**. The rejected output is a *predictable
consequence of that prompt*, not a model failure. Three findings:

### 14.1 The prompt actively instructs the failure mode

`apps/worker/src/prompts.ts`, lines 17–19, inside `IDENTITY`:

```
- Build geometry from primitives you create yourself: Parts (Block/Ball/Cylinder/Wedge), grouped
  into Models, decorated with Material/Color/UIGradient/lights/ParticleEmitters. A convincing
  trophy, tree, car or sword is a handful of well-placed parts — make it, do not shop for it.
```

**"a handful of well-placed parts"** is the instruction that produces a three-primitive trophy. The model
is complying. Per §9.3 the realistic figure for a hero prop is **25–60 parts**, and for a good prop
**8–20**. Suggested replacement wording:

> A convincing trophy, tree, car or sword is 15–40 parts, not three: a plinth, a shaft, a crown, and
> trim. Give every prop a base and a broken silhouette. Never leave `Material = Plastic` or the default
> grey `Color3.fromRGB(163, 162, 165)` on any part you create.

### 14.2 The prompt contains zero art direction

The `IDENTITY` block covers Luau idioms, tool discipline, verification honesty, analysis precision,
answering style and efficiency. **It says nothing about colour, material, lighting, scale, composition or
detail density.** The only aesthetic word in 106 lines is "convincing". Golem is being graded on taste it
was never given.

### 14.3 The efficiency block fights visual quality

Lines 46–53 push toward minimal output ("you have a limited step budget", "Prefer one `create_instances`
call"). That is correct for *tool-call count* but the model appears to be generalising it to *part count*.
The fix is to make the distinction explicit: few tool calls, many parts. One `create_instances` call
carrying a 200-part nested Model is the target shape — and §4/§9 of this document are written to be
generated inside exactly one such call.

### 14.4 Recommended wiring

1. **Add an art-direction block to `IDENTITY`** — a compressed version of §13's auto-reject rules plus the
   §14 quick-reference card. Roughly 25 lines buys most of the quality.
2. **Ship §12's scene recipes as a tool or retrieval doc**, so "build a spawn plaza" resolves to R1's spec
   rather than to the model's priors.
3. **Add the §13 rules as a post-generation validator** in `apps/worker/src/tools.ts`. Rules 1, 2, 12, 21,
   22, 23, 24 are trivially checkable and rules 21–24 catch *code that will error*, not just ugly code.
4. **Index this document into `packages/corpus`** so `search_docs` can retrieve it. The corpus already
   contains the Roblox lighting pages that confirm §2 — this handbook is the missing layer above them.

---

## 15. Quick reference card

```
SCALE          avatar 5 · walk 16 · jump 7.2 · slope 89° · grid 5 · snap 90°
DOOR           visual 7H×4W · gameplay 10H×10W
WALL           interior 12–14 · barrier ≥10 · thickness 1–2
STAIR          rise 1.0–1.5 · run 2.5–3
CORRIDOR       10–12 wide · ≥10 high
COLOUR         60/30/10 · S≤0.35 large · V spread ≥0.35 · never neutral grey
MATERIALS      3 primary + 1 accent · walls ≠ floors · Neon <5%
LIGHT          warm Top / cool Bottom · PointLight Range 20–30 (default 8 is too small)
DETAIL         no flat surface >20×20 · trim every edge · props 8–20 parts
PERF           Anchored=true · CastShadow=false <40 studs³ · Shadows≤4 lights
NEVER EMIT     Lighting.Technology · Lighting.LightingStyle · Terrain:PaintRegion
               StreamingMinRadius/TargetRadius · Material=Plastic · Color=(163,162,165)
```

---

## 16. Sources

**Roblox official documentation (create.roblox.com / Roblox creator-docs repo)**
- [Lighting service](https://create.roblox.com/docs/environment/lighting) — property list, ClockTime 0–24, ShadowSoftness 0–1, EnvironmentDiffuse/SpecularScale 0–1, LightingStyle Realistic/Soft
- [Atmosphere](https://create.roblox.com/docs/environment/atmosphere) — Density/Offset/Haze/Glare/Color/Decay demo ranges
- [Post-processing effects](https://create.roblox.com/docs/environment/post-processing-effects) — effect classes
- [Enum.Material](https://create.roblox.com/docs/reference/engine/enums/Material) — full enum with numeric values
- [Enum.Technology](https://create.roblox.com/docs/reference/engine/enums/Technology) — deprecation status
- [Lighting class reference](https://create.roblox.com/docs/reference/engine/classes/Lighting) — Technology marked deprecated
- [Terrain class](https://create.roblox.com/docs/reference/engine/classes/Terrain) — Fill*/ReplaceMaterial/SetMaterialColor signatures (**no PaintRegion**)
- [Materials & MaterialVariant](https://create.roblox.com/docs/parts/materials) — ColorMap/NormalMap/MetalnessMap/RoughnessMap, StudsPerTile
- [Instance streaming](https://create.roblox.com/docs/workspace/streaming) — StreamingTargetRadius 1024, StreamingMinRadius 64, PauseOutsideLoadedArea, Improved
- [Performance: identify](https://create.roblox.com/docs/performance-optimization/identify) — 16.67 ms frame, 6.25 GiB + 100 MiB/player, <50% server memory
- [Performance: improve](https://create.roblox.com/docs/performance-optimization/improve) — texture sizes, CastShadow, RenderFidelity, CollisionFidelity
- [Environmental art: greybox your environment](https://github.com/Roblox/creator-docs/blob/main/content/en-us/tutorials/curriculums/environmental-art/greybox-your-environment.md) — 5-stud/90° snapping, 10-stud doorways and walls, max 3 entrances per combat pocket
- [Environmental art: develop polished assets](https://github.com/Roblox/creator-docs/blob/main/content/en-us/tutorials/curriculums/environmental-art/develop-polished-assets.md) — trim sheets ≤1024², modular kit min 5 studs and divisibility, silhouette-readable props
- [Environmental art: construct your world](https://github.com/Roblox/creator-docs/blob/main/content/en-us/tutorials/curriculums/environmental-art/construct-your-world.md) — sample colours, MaterialVariants, planter and spire dimensions, Neon-glass trick

**Roblox DevForum**
- [Let There Be (Unified) Light! Unified Lighting is Fully Live](https://devforum.roblox.com/t/let-there-be-unified-light-unified-lighting-is-fully-live/3401512) — Technology → LightingStyle + PrioritizeLightingQuality mapping; beta 2025-01-21, live 2025-07-23
- [Why are Technology and Streaming not scriptable?](https://devforum.roblox.com/t/why-are-technology-and-streaming-not-scriptable/1533655)
- [Quick Guide Into CSG: Increasing Performance of Unions & Meshes](https://devforum.roblox.com/t/quick-guide-into-csg-increasing-performance-of-unions-meshes/627677) — smoothing angle 30–70°

**This repo's own retrieval corpus** — `packages/corpus/data/chunks.jsonl` independently corroborates §2.
Chunk `api-lighting-1` states verbatim: *"Property Lighting.Technology: Technology [Deprecated] —
Determines the lighting system for rendering the 3D world. **Non-scriptable**."* Chunk `g-80e54aef-1`
states LightingStyle is *"modifiable only in the Properties window"*. The corpus also carries the four
Roblox-authored lighting configurations reproduced in §8.4 (chunks `g-8ace2421-2`, `g-6e303100-71`,
`g-fb344f68-10`, `g-c46b1736-4`) and the indoor light-leak rule (`g-297c80b1-4`).

**This repo's production prompt** — `apps/worker/src/prompts.ts` (read 2026-08-30), analysed in §14.

**Empirical verification [V]** — `execute_luau` against live Roblox Studio, place 123864611037141, 2026-08-30.
Read-only probes (unparented `Instance.new` + no-op self-assignment writability tests). Established: factory
defaults for `Part`/`Atmosphere`/`Bloom`/`ColorCorrection`/`DepthOfField`/`SunRays`/`PointLight`/`SpotLight`/
`SurfaceLight`/`MaterialVariant`/`Terrain` water; the full default terrain material colour palette;
`Enum.LightingStyle` and `Enum.MaterialPattern` members; `StarterPlayer` locomotion defaults
(`WalkSpeed 16`, `JumpHeight 7.2`, `MaxSlopeAngle 89`, `Gravity 196.2`); and the non-scriptability of
`LightingStyle`, `PrioritizeLightingQuality`, `Technology`, and the streaming radius properties.

---

# Addendum A — production kit metrics, shipped tutorial values, composition theory

*Added 2026-08-30 by a second research pass, appended rather than merged so nothing above is disturbed.
Everything here is sourced from pages **not** in §16, and is distilled into
`apps/worker/src/worldbuilding.ts`. Section numbers start at A1 to avoid clashing with §1–§16.*

## A1. Grid size is a project decision — three Roblox-shipped examples

§4.1 gives the 5-stud curriculum figure. That is one of at least three grids Roblox itself ships, and the
principle matters more than the number: **pick one grid, write it down, never mix.**

| Roblox project | Grid | Rotation snap | Source |
|---|---|---|---|
| Environmental Art curriculum (laser tag) | **5 studs** | 90° | [greybox-your-environment](https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/greybox-your-environment.md) |
| Modern City modular building kit | **7.5 studs** | **45°** | [assemble-modular-environments](https://create.roblox.com/docs/en-us/tutorials/use-case-tutorials/modeling/assemble-modular-environments.md) |
| Beyond The Dark space station | **16 studs** | — | [building-architecture](https://create.roblox.com/docs/en-us/resources/beyond-the-dark/building-architecture.md) |

Verbatim from the Modern City guide: *"each mesh in the Modern City sample modular building kit has a
minimum length of 7.5 studs and a maximum length that's divisible by 7.5 studs so every mesh can
seamlessly align and connect without overlap even when you rotate them."* Studio settings for that kit are
**Move snap 7.5, Rotate snap 45°, collisions off**.

From Beyond The Dark: *"we settled on a 16 stud grid size to create most of the modular set. The grid size
you use is arbitrary, but should be consistent throughout the project and across all artists."*

Three more rules from that page, all directly usable by Golem:

- **Keep pieces simple.** *"The idea is to have a few very versatile pieces and not a lot of one-offs.
  The more pieces you have, the more time it takes… and the more it affects your overall memory and
  performance budget."* This is the argument for the 8–14 piece kit in §4.2.
- **1 stud ≈ 28 cm.** Studio does not convert units on import — it substitutes studs 1:1 for whatever unit
  the DCC used. *"The closest real-world scale for a single stud in Roblox is 28 centimetres."*
- **Trim sheets carry the detail budget.** *"90% of the architectural elements used a handful of swappable
  trim sheet sets."* The rule for authoring them: **no contextual detail** — the curriculum's
  [develop-polished-assets](https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/develop-polished-assets.md)
  page shows a furniture set where extra stain detail makes tiling obvious versus a clean set where it does
  not. Same rule for tileable textures: *"Create equal visible distribution so that no one element is more
  distinguishable than others."* Max texture 1024×1024, and the closer to that, the higher the cost.

## A2. Stair risers — the 0.8-stud animation threshold

§3.2 gives rise 1.0–1.5 (never >2). There is a sharper number worth encoding, from a builder with 12 years
on the platform in [Lets talk stairs](https://devforum.roblox.com/t/lets-talk-stairs/399364):

> *"make the steps at most 0.8 studs high from the previous. Why? Well any edge more than 0.8 studs that
> hits a player's leg at the default scale can sometimes read as a 'climb' making the animations not know
> what to do — which creates this weird hopping."*

So: **0.8 is where the walk animation stays smooth; 1.0–1.5 still looks right and is visually preferable;
above 2 the ascent is visibly bad.** Use 0.8–1.0 for stairs the player uses constantly (shop, lobby,
spawn), 1.2–1.5 for monumental flights the player climbs once.

Related, from [What are good door dimensions?](https://devforum.roblox.com/t/what-are-good-door-dimensions/539045):
arms do not collide, so a door does not need clearance for them — 5×7 reads correctly for an R6-scale
character, which is why §3.2's 7H×4W decorative figure holds.

## A3. Roblox's shipped lighting values — two more configurations

Complements §8.4 with the two use-case lighting tutorials, which give step-by-step property values.

**Outdoor, late afternoon** — [enhance-outdoor-environments](https://create.roblox.com/docs/en-us/tutorials/use-case-tutorials/lighting/enhance-outdoor-environments.md)
```
Lighting.ClockTime                = 17
Lighting.EnvironmentDiffuseScale  = 1      Lighting.EnvironmentSpecularScale = 1
Lighting.OutdoorAmbient           = 156, 136, 176   -- and Ambient the same
Atmosphere.Density = 0.272 · Haze = 1 · Color = 85, 78, 54
PointLight (lamp): Range = 48 · Brightness = 2 · Color = 255, 179, 73
```
The doc's guidance on `Atmosphere.Color`: *"set it to a color value that is close to the average of the
objects in the environment."* That is a rule Golem can execute — average the palette, tint the atmosphere.

**Indoor, warm cabin** — [enhance-indoor-environments](https://create.roblox.com/docs/en-us/tutorials/use-case-tutorials/lighting/enhance-indoor-environments.md)
```
Lighting.ClockTime            = 15.6     Lighting.GeographicLatitude = 323
Lighting.Ambient              = 83, 70, 57
Lighting.ExposureCompensation = 0.5
Atmosphere.Density            = 0.5
SunRays: Intensity = 0.023 · Spread = 0.266
ColorCorrection: Contrast = 0.05 · Saturation = 0.1
Candle  PointLight:   Brightness 0.7 · Color 255, 202, 156
Lamp    SpotLight:    Face Bottom · Angle 140 · Brightness 4 · Color 255, 238, 202 · Range 12
Fill    PointLight:   Range 12 · Color 142, 157, 125   (tinting down instead of dimming)
Accent  SurfaceLight: Brightness 2 · Color 146, 255, 251 · Range 4
```

Two techniques worth lifting verbatim:

1. **Exposure over brightness.** The docs contrast the two: raising `Brightness` *"increases all brightness
   of the space, including brightness within the shadows, which leads to an unintentional murkiness"*,
   whereas `ExposureCompensation` *"doesn't increase the brightness of light and shadows equally, allowing
   the space to appear brighter without completely washing out its darker colors."* **When a scene reads
   too dark, raise `ExposureCompensation` first, `Brightness` second.**
2. **Tint a light to dim it.** The moss-green `142, 157, 125` fill is described as tinting *"to a light
   moss green hue and indirectly reduce its brightness"* — a coloured light is a dimmer that also adds
   colour interest. Better than dropping `Brightness` to 0.2.

**Atmosphere.Offset** is the least-used property and the most useful for composition:
*"Increase this value to create a horizon silhouette against the sky or reduce it to blend distant objects
into the background."* Push `Offset` up when the scene has a landmark whose silhouette must read (§5.1).

## A4. Movement and motion values Roblox ships

From [construct-your-world](https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/construct-your-world.md).
A static scene reads as dead even when the geometry is good; these are the cheapest fixes.

**Dynamic clouds** (a `Clouds` object parented to `Terrain`): `Cover = 0.625`, `Density = 0.5`,
`Color = 143, 143, 143`.

**Foreground cloud emitter** — an invisible, non-colliding, anchored part with a `ParticleEmitter`:
```
LightEmission 0.3 · LightInfluence 0.2 · Orientation FacingCameraWorldUp
Size 100 · Squash -0.25 · Lifetime 30 · Rate 0.25
Acceleration (0, -0.8, 0) · Drag 0.1 · LockedToPart true
```
Layer a second emitter at `Rate 0.1` with a different texture for depth.

**Ambient dust** — one emitter covering the whole playable area:
```
Color 192, 241, 255 · ZOffset -5 · Lifetime (1, 10) · Rate 50000
RotSpeed -60 · Speed (1, 5) · Acceleration (1, -1, 1) · LockedToPart true
```
Note `Rate 50000` — dust is one of the few places a very high rate is correct, because the particles are
tiny and short-lived. The doc's own caution: *"keep particle speed slow to only provide micro motion."*
Also note from §11 / [performance](https://create.roblox.com/docs/en-us/performance-optimization/improve.md):
*"Objects like decals, textures, and particles don't batch well and introduce additional draw calls…
property changes to ParticleEmitters can have a dramatic impact on performance."* Two or three emitters
per scene, not twenty.

## A5. Composition theory — the non-Roblox sources

§16 cites only Roblox. The composition rules in §5 are standard level-art practice; these are the
references that state them, and a few principles §5 does not yet carry.

Primary source: **[The Level Design Book](https://book.leveldesignbook.com/)** —
[Composition](https://book.leveldesignbook.com/process/blockout/massing/composition.md),
[Metrics](https://book.leveldesignbook.com/process/blockout/metrics.md),
[Modular kit design](https://book.leveldesignbook.com/process/blockout/metrics/modular.md),
[Lighting](https://book.leveldesignbook.com/process/lighting.md),
[Environment Art](https://book.leveldesignbook.com/process/env-art.md).

**Spatial composition beats shot composition.** The book argues explicitly against the common "rule of
thirds in your screenshot" advice: a 3D level *"cannot guarantee a specific view"*, so hierarchy must be
built into the 3D arrangement of masses, not into one camera angle. **Consequence for Golem: do not
compose for a screenshot. Compose so the landmark reads from every approach.**

**Four ways to build spatial contrast** (all four are cheap to generate):
1. **Height** — a tall thing among short things, or a short thing in an open space.
2. **Density / spread** — a wide open space ringed by narrow structures.
3. **Orientation** — one object rotated off the surrounding grid.
4. **Shape** — a round thing among rectangular things.

*"Hierarchy depends on local contrast and context. A tall thing only seems special if it is surrounded by
short things."* This is the justification for the 3× landmark rule in §5.1 — the multiple is relative to
neighbours, not absolute.

**Focal points create new centres.** A landmark placed off-centre *"doesn't feel off-centre"* because it
pulls the perceived centre of the composition toward itself. This is why the off-centre placement rule
works and why a dead-centre monument feels static.

**Landmarks must be useful.** The book flags *"fake set dressing landmarks"* — skybox decoration that does
not help the player orient — as non-functional. A landmark the player cannot navigate by is just a prop.

**Readability degrades as detail is added.** *"When a level begins in abstract blockout form, it is very
plain and easy to read. However, as we add additional visual details… the level geometry becomes less
distinct and more noisy."* Their prescriptions, which map onto §9.3's clustering rule:
- Compose set dressing in **clusters of related details** (gestalt grouping), not even scatter.
- Keep the ground darker than the walls, wall textures plain, and reserve strong hues for specific planes.
- **START BIG.** Massing, palette and theme first; grunge and pebbles last.

**Hero props.** *"don't guitar solo a dumpster"* — detail budget belongs on the object that anchors the
space, not spread evenly. The Valorant example given uses its hero tower **once on the entire map**, with
its lower section deliberately kept free of distracting silhouettes so gameplay still reads.

**Metrics are a tool, not a law.** *"You cannot measure your way to a good game experience."* Also relevant
to §3: game space is not real space — *"if you approach level design too much like real world architecture,
then ironically, your levels will feel too big, complicated, and implausible."* The stud table in §3.2 is a
starting point to playtest from, not a specification to satisfy.

**Modular kit stress tests** worth running on any generated kit:
- **Loopback test** — can pieces form a closed loop without a gap?
- **Stack test** — can you build multiple storeys? *"floors should NOT be paper thin, they have thickness
  and mass just like walls."* (Corroborates §3.2's 1–2 stud slab.)
- **Gap test** — is there enough "glue" geometry for off-angle joins?

## A6. Additional sources for §16

**Roblox official**
- [Assemble modular environments](https://create.roblox.com/docs/en-us/tutorials/use-case-tutorials/modeling/assemble-modular-environments.md) — 7.5-stud kit modules, 45° rotate snap, pivot-consistency argument, repetition-reduction
- [Beyond the Dark: building architecture](https://create.roblox.com/docs/en-us/resources/beyond-the-dark/building-architecture.md) — 16-stud grid, 1 stud ≈ 28 cm, trim-sheet workflow, packages
- [The Mystery of Duvall Drive: materialize the world](https://create.roblox.com/docs/en-us/resources/the-mystery-of-duvall-drive/materialize-the-world.md) — trim maps vs 1:1 maps, `SurfaceAppearance` tinting via alpha mask, texture-resolution reductions
- [Enhance outdoor environments with realistic lighting](https://create.roblox.com/docs/en-us/tutorials/use-case-tutorials/lighting/enhance-outdoor-environments.md) — values in A3
- [Enhance indoor environments with realistic lighting](https://create.roblox.com/docs/en-us/tutorials/use-case-tutorials/lighting/enhance-indoor-environments.md) — values in A3, exposure-vs-brightness argument, light-tinting technique
- [Assemble an asset library](https://create.roblox.com/docs/en-us/tutorials/curriculums/environmental-art/assemble-an-asset-library.md) — `MaterialVariant` and `SurfaceAppearance` configuration
- [Apply polished assets](https://create.roblox.com/docs/en-us/tutorials/curriculums/core/building/apply-polished-assets.md)
- [Particle emitters](https://create.roblox.com/docs/en-us/effects/particle-emitters.md) · [Light sources](https://create.roblox.com/docs/en-us/effects/light-sources.md) · [Solid modeling](https://create.roblox.com/docs/en-us/parts/solid-modeling.md)
- [Humanoid class reference](https://create.roblox.com/docs/en-us/reference/engine/classes/Humanoid.md) — corroborates `WalkSpeed 16`, `JumpPower 50`, `JumpHeight 7.2`, `MaxSlopeAngle` from `StarterPlayer`
- [Character body specifications](https://create.roblox.com/docs/en-us/avatar/character-bodies/specifications.md) — classic part dimensions (Head 2×2×2, Torso 3×3.5×2, Arm/Leg 1.5×4×2)

**Roblox DevForum**
- [Lets talk stairs](https://devforum.roblox.com/t/lets-talk-stairs/399364) — the 0.8-stud riser threshold
- [What are good door dimensions?](https://devforum.roblox.com/t/what-are-good-door-dimensions/539045) — 5×7 doors, arms don't collide
- [Scaling Buildings Properly](https://devforum.roblox.com/t/scaling-buildings-properly/1054615) — keep a "size test" rig in the scene and drag it around while building
- [Edge Bevel plugin](https://devforum.roblox.com/t/plugin-edge-bevel-easily-bevel-the-edges-corners-of-parts/2940227) — confirms parts have no native bevel; edges are faked with wedges/cylinders (§9.1)

**Level design craft (non-Roblox)**
- [The Level Design Book](https://book.leveldesignbook.com/) — composition, metrics, modular kits, lighting, environment art (see A5)
- Joel Burgess, *Skyrim's Modular Approach to Level Design* (GDC 2013) and *The Modular Level Design of Fallout 4* (GDC 2016) — the origin of most modular-kit practice cited above
- [Composition in Level Design](https://www.gamedeveloper.com/design/composition-in-level-design) and [Applying the Elements and Principles of Design in Level Art](https://www.gamedeveloper.com/art/applying-the-elements-of-design-and-principles-of-design-in-level-art) — focal points, leading lines, emphasis

## A7. What landed in code

`apps/worker/src/worldbuilding.ts` distils §1–§16 plus this addendum into five exports, sized for the
prompt budget:

| Export | Contents |
|---|---|
| `PROPORTIONS` | 25 canonical stud dimensions (doorway, ceiling, stair rise/run, corridor, railing, seat, path, bench, lamp post, window sill, trim…) |
| `MOODS` | 7 presets — `day`, `golden`, `overcast`, `night`, `misty`, `interior`, `horror`. Each splits into `scriptable` (safe to emit as Luau) and `manualStudioSteps` (`LightingStyle` / `PrioritizeLightingQuality`, which must be surfaced to the user, never emitted) |
| `PALETTES` | 8 palettes — `warmStone`, `modernCivic`, `cosyWood`, `verdant`, `sciFi`, `coldHorror`, `marketTown`, `fortressRuin` — each dominant / secondary / accent / trim as RGB plus a 3+1 material set |
| `worldBuildingBrief(kind)` | ~1.8–2.0k tokens: universal rules + one of 8 kind blocks (plaza, interior, shop, lobby, dungeon, obby, arena, natural), with aliases so loose categories resolve |
| `moodLuau(mood)` | Emits ready-to-run Luau for a mood — scriptable properties only |
| `SCENE_PLAN_SCHEMA` | The plan the agent must produce before building: mood, palette, materials, focal point, landmarks, zones with extents and elevation, vertical layers, prop budget, trim plan, ground treatment |
