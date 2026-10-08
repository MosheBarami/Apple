---
name: building-worlds
description: Building maps, levels and environments in Roblox. Covers player scale and dimensions, layout and composition (landmarks, paths, sightlines, zones), terrain with edit_terrain, procedural placement with run_luau (noise, scatter, raycasts onto terrain), materials and MaterialVariants, Lighting (LightingStyle, ClockTime, ambient, shadows) and Atmosphere/Sky/Clouds/post effects tuned to a requested mood, performance (part counts, anchoring, collision fidelity, StreamingEnabled), and when to use Creator Store models versus parts. Load before creating or changing any 3D space, terrain or lighting. references/lighting-and-atmosphere.md explains every mood parameter and its range.
---

# Building worlds

A world is good when a player arriving understands where to go, the scale feels right for their avatar, the mood
matches the request, and it runs smoothly on a phone. Decide those four things before placing anything.

## 1. Scale (measure everything against the avatar)

1 stud ≈ 0.28 m. Default R15 avatar is ~5 studs tall (head at ~4.5-5), shoulder width ~2-3, walks 16 studs/s,
jumps ~7.2 studs high (JumpHeight) — so a gap is jumpable when ≤ ~10-12 studs horizontally at equal height and a ledge
when ≤ ~6 studs high.

| Thing | Comfortable size (studs) |
|---|---|
| door opening | 4-6 wide × 8-10 high |
| ceiling (room) | 12-16; halls and shops 16-24 |
| corridor / walkway | 6-10 wide (lets two players pass, camera does not clip) |
| main path / road | 12-24 wide |
| stair step | 1 rise × 1.5-2 run (or a ramp ≤ ~40°; Humanoid.MaxSlopeAngle default 89 but steep looks wrong) |
| railing / counter / table | 3-3.5 high |
| chair seat | ~2 high |
| tree | 15-40 high; small bush 3-6 |
| one-storey house | ~25-35 footprint, 14-18 to the eaves |

The third-person camera sits behind and above the player: interiors need more room than real life (×1.3-1.5) or the
camera fights the walls. When adapting anything, compare it to a 5-stud character, not to other props.

## 2. Composition method

1. **Read the request for purpose**: obby (linear challenge), tycoon (plots), hangout (social space), adventure
   (exploration), combat arena (cover + sightlines), simulator (zones by progression). The genre decides the layout.
2. **Block out first** with plain grey parts: ground, main masses, paths, spawn. Check walking distances
   (16 studs/s: 160 studs = 10 s) and play-test before detailing.
3. **Spawn** (`SpawnLocation`, anchored, `Neutral = true` unless teams) facing the most interesting view.
4. **Landmarks**: one large, distinctive, visible-from-everywhere feature per area gives orientation. Silhouette matters
   more than detail.
5. **Paths and flow**: a clear main route (wider, contrasting material or light) with branches; avoid dead ends without
   a reward. Lead the eye with light, colour and leading lines (fences, lamps, rivers).
6. **Sightlines**: from spawn, the player should see the goal or the next landmark. In combat maps, break long
   sightlines with cover every ~20-40 studs.
7. **Zones**: distinct palette/material/lighting per zone so players know where they are. Name zone Models clearly.
8. **Density gradient**: dense detail near paths and points of interest, sparse at edges. Bound the playable area with
   natural edges (cliffs, water, dense trees) rather than invisible walls where possible.
9. **Detail last**: props, decals, small variation (rotation ±15°, scale ±20%, colour ±5%).

Organise the hierarchy: `Workspace/Map/<Zone>/<Group>` Models. Anchor every static part.

## 3. Terrain with edit_terrain

Actions: `fill_block`, `fill_ball`, `fill_region`, `replace_material`, `write_voxels`, `path`, `clear`.
- Terrain voxels are 4 studs; anything smaller than ~4 studs is approximated. Use parts for crisp edges.
- Fill ground as a thick slab (≥ 8 studs) so it never shows holes; build hills with overlapping `fill_ball`s of varied
  radius; water with `fill_block` material `Water` below the ground line, then carve the basin.
- `replace_material` inside a region to paint (grass → ground near paths, rock on steep slopes).
- For heightmaps or large organic shapes, generate occupancy/material arrays (`write_voxels`), or call
  `workspace.Terrain:FillBlock/FillBall/FillWedge/FillCylinder` from `run_luau` in a loop driven by `math.noise`.
- `Terrain.Decoration = true` adds animated grass on Grass material (cost on low-end devices).
- Terrain colours: `Terrain:SetMaterialColor(Enum.Material.Grass, Color3)`; water look: `WaterColor`,
  `WaterTransparency`, `WaterWaveSize`, `WaterWaveSpeed`, `WaterReflectance`.

## 4. Procedural placement with run_luau

Use code for anything repeated (forests, rocks, lamp rows, fences, city blocks). Principles:
- **Seeded randomness**: `local rng = Random.new(seed)` so a re-run reproduces the layout; tell the user the seed.
- **Noise for natural variation**: `math.noise(x * f, z * f, seed)` with frequency `f` ~ 0.01-0.05 for
  large-scale density; combine two octaves for detail. Use it to decide *density*, not exact positions.
- **Poisson-ish scatter**: candidate points from `rng`; reject any closer than `minDist` to accepted ones (grid-bucket
  the accepted points for speed). Gives natural spacing without clumps.
- **Snap to ground**: raycast down from above each point:
  `workspace:Raycast(Vector3.new(x, 500, z), Vector3.new(0, -1000, 0), params)`; place at `result.Position`, reject
  if `result.Normal.Y < 0.8` (too steep) or `result.Material == Enum.Material.Water`. Align to slope with
  `CFrame.lookAlong`/`CFrame.fromMatrix` when the object should tilt (rocks), keep upright for trees and buildings.
- **Avoid paths and keep-outs**: test distance to path polyline points or `GetPartBoundsInBox`.
- Clone from one prepared source model (`clone_instances` or `:Clone()` in run_luau) and vary rotation/scale
  (`Model:ScaleTo`, `PivotTo`).
- Batch: create inside a Model, parent it at the end. Report how many instances you made.

## 5. Materials and colour

- `BasePart.Material` (Enum.Material: Plastic, SmoothPlastic, Wood, WoodPlanks, Slate, Concrete, Brick, Cobblestone,
  Rock, Granite, Marble, Pebble, Sand, Grass, Ground, Mud, Snow, Ice, Glacier, Metal, DiamondPlate, CorrodedMetal,
  Foil, Glass, Neon, Fabric, Cardboard, Carpet, Leather, Plaster, Rubber, Asphalt, Limestone, Pavement, Salt,
  Sandstone, Basalt, CrackedLava, ClayRoofTiles, RoofShingles, CeramicTiles ...). `search_docs` "Material
  enum" for the full list.
- `Neon` glows (emissive) — use sparingly as accents and signage; it ignores lighting.
- `MaterialVariant` (in `MaterialService`) customises a base material with PBR maps (`ColorMap`, `NormalMap`,
  `RoughnessMap`, `MetalnessMap`, `StudsPerTile`, `MaterialPattern` Regular/Organic). Apply per part via
  `BasePart.MaterialVariant = "<variant name>"`, or set as the override for a base material in MaterialService.
  Texture ids come from images the user owns or the store; never invent asset ids.
- Palette: pick 3-5 main colours per zone plus one accent; vary value (light/dark) more than hue. Fully saturated
  colours read as toy-like; slightly desaturated ones read as natural.
- `SurfaceAppearance` on MeshParts gives PBR; `Texture`/`Decal` for tiled or one-off images on faces.

## 6. Lighting and mood

Mood comes from Lighting + Atmosphere + Sky + post effects together. Read
`references/lighting-and-atmosphere.md` (via `load_skill` with `file`) for every parameter, its range and what it
does. Method:
1. Name the mood in words (e.g. "cold, misty dawn", "warm cosy interior", "neon night city", "bright cartoon noon").
2. Choose time (`Lighting.ClockTime`, 0-24) and sun colour/brightness for it.
3. Set ambient/outdoor ambient for shadow darkness; `Atmosphere` for depth and haze; `Sky` for the backdrop;
   `Clouds` (a child of `Terrain`) for weather.
4. Grade with `ColorCorrectionEffect`, then add `BloomEffect`/`SunRaysEffect`/`DepthOfFieldEffect` only if they serve
   the mood. Post effects live in `Lighting` (or the Camera).
5. Place local lights (`PointLight`/`SpotLight`/`SurfaceLight` inside parts) for interiors and night scenes.
6. Verify with `play_check` (screen contents) — readability of paths and UI matters more than drama.

`Lighting.Technology` is now superseded by `Lighting.LightingStyle` (`Enum.LightingStyle.Realistic` or `Soft`) and
`Lighting.PrioritizeLightingQuality`; `Technology` is not scriptable. Check the docs if the place uses either.

## 7. Performance budget

- Anchor everything static (`Anchored = true`); unanchored parts cost physics and fall.
- Part count: a small map 2k-10k parts is fine; past ~20-30k think about merging and streaming. Prefer fewer, larger
  parts; union/mesh repeated detail.
- `CanCollide = false`, `CanTouch = false`, `CanQuery = false` on decorative detail players never hit (grass tufts,
  leaves, small props). `CastShadow = false` on tiny props.
- MeshPart `CollisionFidelity`: `Box` for small props, `Hull` for convex things, `Default`/`PreciseConvexDecomposition`
  only for walkable complex surfaces. `RenderFidelity = Automatic`.
- `Workspace.StreamingEnabled = true` for large maps: clients only get nearby parts, so client scripts must
  `WaitForChild` and tolerate missing instances; mark must-exist models with `ModelStreamingMode = Persistent`.
- Lights: shadowed `PointLight`/`SpotLight` are expensive; keep `Shadows = true` to a few hero lights; Range ≤ 60.
- Transparent overlapping parts and many `Neon`/particles cost fill rate on mobile.

## 8. Creator Store vs building from parts

- **Build from parts / terrain**: layout, ground, walls, roads, simple architecture, anything that must match exact
  dimensions or be gameplay-critical (platforms, colliders, checkpoints).
- **Creator Store** (`search_creator_store` + `insert_from_store`, see the `creator-store-assets` skill): organic or
  detailed meshes that parts would make look crude (trees, rocks, vehicles, furniture, statues), when a good
  low-triangle asset exists. Always rescale to the avatar and re-anchor.
- Mix: store meshes for detail, parts for structure. Keep one visual language: do not mix a realistic PBR tree with
  blocky plastic houses unless the style is deliberate.

## 9. Verification

1. `get_project_tree` on `Workspace` — structure grouped and named; nothing loose at the root.
2. `run_luau` to count parts and unanchored parts: iterate `workspace:GetDescendants()` and report counts, bounds
   (`Model:GetBoundingBox()`), anything floating (raycast down from each prop; gap > 0.5 stud = floating).
3. `play_check`: player spawns on ground, can walk the main path, view shows the intended landmark, no errors.
4. Describe to the user what you built, with sizes, and what you would refine next.
