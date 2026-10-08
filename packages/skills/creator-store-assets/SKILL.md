---
name: creator-store-assets
description: Finding, inspecting and adapting Creator Store assets (models, meshes, decals, audio, animations). Covers query wording and categories, judging results by hasScripts, creator, triangle count and thumbnail, inserting with insert_from_store, inspecting with model_anatomy/get_instance, adapting (real-world scale, anchoring, PrimaryPart and pivot, colour/material, removing junk, collision fidelity), integrating (parent, name, tag), safety (scripts stripped, never reuse free-model scripts for logic) and when to build from scratch instead. Load before calling search_creator_store or insert_from_store.
---

# Creator Store assets

The store gives raw material, not finished work. Every inserted asset is a starting point you must check, rescale and
fit to the place's scale, style and performance budget. Behaviour is always written by you, never taken from the asset.

## 1. Decide whether to search at all

Search the store when the thing is **organic or detailed** and would look crude from parts: trees, rocks, plants,
animals, vehicles, furniture, statues, weapons' visual meshes, character models, skyboxes (decals), sounds.

Build it yourself (parts, terrain, `run_luau`) when:
- it is structure or gameplay geometry (floors, walls, platforms, obstacles, colliders, checkpoints) — exact sizes
  matter and you need to control collisions;
- it is simple geometry (crates, tables, fences, signs, simple buildings) — parts give a cleaner, consistent style;
- several store results would clash with each other or with the place's style;
- the user asked for something original or very specific that the store will not match.

## 2. Searching well

`search_creator_store` takes `query` and `category` (`model`, `audio`, `decal`, `mesh`, `animation`).
- Query with the **object noun plus one or two style words**, not a sentence: `low poly pine tree`,
  `medieval wooden cart`, `sci-fi crate`, `stylized rock`. Add `low poly` when performance matters.
- Try 2-3 phrasings if the first page is weak (synonyms: "lamp post" / "street light"; singular nouns).
- Category: `mesh` for a single MeshPart (cleanest to adapt); `model` for multi-part assemblies; `decal` for images
  (textures, sky faces, signs); `audio` see the `sound-design` skill; `animation` for animation assets (they only play
  on rigs that match their joints).
- For a set of related props, search for a consistent style word across all queries, and prefer the same creator.

## 3. Choosing among results (decision rules)

Read every result's fields before inserting:
- `hasScripts`: prefer **false**. Scripts are stripped on insert anyway, but a scripted model often depends on them
  (doors, vehicles, guns) and arrives broken or inert; it also hints at a free model full of junk.
- Triangle count: for a prop repeated many times, aim for ≤ ~2k triangles; a single hero piece ≤ ~10-20k. Very high
  counts hurt mobile. Many separate parts is also a cost.
- Creator: verified/known creators and Roblox itself are more reliable than anonymous uploads.
- Thumbnail and name must match the request and the style of the place (low-poly vs realistic, colour palette).
- Pick one, insert, inspect. If it fails inspection, delete it and try the next — do not stack attempts in the place.

## 4. Inserting and inspecting

1. `insert_from_store` with the asset id and a holder (e.g. a Model under `Workspace` or a staging Folder). It strips
   scripts and returns the inserted parts and size.
2. `model_anatomy` (parts, joints, sizes) and `get_instance` on the root: what is inside? Look for: one root Model or
   loose parts; `PrimaryPart`; anchored state; welds/Motor6Ds; Humanoids; leftover `Sound`, `ParticleEmitter`,
   `ClickDetector`, `ProximityPrompt`, `BillboardGui`, invisible parts, `Configuration`/`Value` objects, attachments;
   enormous or tiny bounding size; parts named `Handle` (tool remnants).
3. `run_luau` for counts and bounds when the anatomy is large: `#model:GetDescendants()`,
   `model:GetBoundingBox()`, list classes present.

## 5. Adapting

- **Scale to the avatar** (5-stud character; see the `building-worlds` skill table): compute the factor from the
  bounding box (`size.Y` vs the target height) and apply with `transform_instances` (or `Model:ScaleTo(factor)` in
  `run_luau`, which scales parts, joints, attachments, lights and particles together). Never scale parts one by one.
- **Pivot and placement**: set `Model.PrimaryPart` to a sensible base part, or set `WorldPivot` to the bottom-centre
  so `PivotTo` places it on the ground; rotate it to face the path or the player.
- **Anchor**: static props `Anchored = true` on every BasePart. Things you will animate: anchor only the root, join the
  rest (see the `animation` skill).
- **Clean up**: delete junk with `delete_instances` — invisible collision boxes you do not need, leftover lights or
  sounds that do not fit, empty models, ValueObjects, GUIs, stray decals, duplicated parts. Keep a deliberate
  hierarchy: one Model, clear part names.
- **Collisions**: MeshPart `CollisionFidelity` Box/Hull for props; small decoration `CanCollide = false`,
  `CanQuery = false`, `CanTouch = false`. Make sure walkable things are actually walkable (`play_check`).
- **Look**: recolour (`Color`) and swap `Material` to match the place palette; remove `SurfaceAppearance` only if it
  clashes; check against the lighting.
- **Name and tag**: rename to what it is (`PineTree`), parent to the right zone Model, add a CollectionService tag if a
  system will drive it (`Collectible`, `Door`), configure with attributes.

## 6. Safety and licensing

- Scripts are stripped on insert. Never paste a free model's script back or copy its logic: write behaviour yourself
  with the `roblox-scripting` skill. Free-model code is a common source of backdoors (`require(<id>)`,
  `getfenv`, `loadstring`, obfuscated strings).
- If you ever see a `require` with a number, `loadstring`, or `MarketplaceService`/`HttpService` calls in something
  you inherited, report it to the user and remove it.
- Only use assets the search returns (public on the store). Never invent asset ids. Audio and images must be public
  or owned by the user/group for the experience to play them.
- Credit is not required by the store, but tell the user which assets you used (name, id, creator) so they can review.

## 7. Verification

- `get_instance` on the final Model: anchored, named, parented, scale right (bounding height vs 5-stud avatar).
- `run_luau`: confirm no `Script`/`LocalScript`/`ModuleScript` remains under it and triangle/part budget is sane.
- `play_check`: no errors, the asset looks right next to the player, and it does not block paths.
