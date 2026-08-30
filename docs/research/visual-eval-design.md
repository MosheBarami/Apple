# Golem Visual Quality Benchmark — design spec

Status: design, not yet implemented. Author: research pass 2026-08-30.
Companion artifact: `packages/evals/tasks-visual/tasks.json` (12 starter tasks).

---

## 0. Why this exists

`packages/evals` measures whether Golem writes *correct* Luau. It scores 98.9 overall on
GLM-5.3-flash. The owner has rejected the product anyway, because the thing Golem builds looks
like this:

> a flat platform, four grey poles with yellow cubes on top, a "trophy" that is three stacked
> primitives

Every existing check would pass that scene. `luau_syntax` passes. A `contains: "Trophy"` check
passes. The scene has every requested object. **The coding benchmark is structurally incapable of
detecting the failure**, because it grades the response text and the code, and the failure is in
the pixels.

This document specifies a second, independent benchmark that grades **the built scene**, and is
designed from the first line so that the current output measures ≈1.2/4 rather than ≈4/4.

### 0.1 The root cause is in the system prompt, not the model

`apps/worker/src/prompts.ts` lines 17–22 currently instruct the model:

> Build geometry from primitives you create yourself: Parts (Block/Ball/Cylinder/Wedge), grouped
> into Models, decorated with Material/Color/UIGradient/lights/ParticleEmitters. A convincing
> trophy, tree, car or sword is a handful of well-placed parts — make it, do not shop for it.
> NEVER guess a Creator Store asset id. Only call insert_asset with an id the USER gave you.
> **There is no asset search**; a made-up id fails or inserts something random.

That last claim is **false as of 2026-03-19**. Roblox shipped `insert_from_creator_store` (searches
*and* inserts), `generate_mesh` (textured meshes from a text prompt) and `generate_material`
(MaterialVariants from a text description) as native Studio MCP tools, alongside
`GenerationService:GenerateModelAsync` / `GenerateMeshAsync` in the engine API.[^mcp][^gen]
Golem is instructed to hand-roll primitives because the prompt believes the alternative does not
exist. The benchmark below will score that policy at ~1.2/4 and will score an asset-and-material
policy far higher — which is the point. **The benchmark must be able to see the difference before
the prompt is changed, or the change cannot be defended with numbers.**

### 0.2 Design constraint that drives everything

LEGO-Eval (arXiv:2511.03001) measured VLM-as-judge on 3D embodied scenes against human labels:

| judge | Holistic F1 | Cohen's κ |
|---|---|---|
| VLM alone (GPT-4-class) | 0.40 | **0.05** |
| VLM + 21 scene-inspection tools | 0.81 | **0.63** |

κ = 0.05 is chance agreement. A pure "show the render to a VLM and ask for a score" benchmark
**does not work** and must not be built. The failure mode named in the paper is that VLMs
"frequently misidentify or fail to localize mentioned components".[^lego]

Therefore this benchmark is **hybrid and structural-first**: deterministic metrics computed from
the scene graph gate and pre-populate the judge, the judge is never asked a question the geometry
already answers, and the judge never sees the model's own prose (see §6.3, informativeness
bias[^infobias]).

---

## 1. Scope and units

- **Unit of evaluation:** one built scene, produced by one Golem run from one prompt, in a Studio
  session starting from a defined fixture.
- **Score:** 20 dimensions, each 0–4 integer, aggregated to one 0–4 overall (§5).
- **Not in scope:** script correctness (covered by `packages/evals`), gameplay balance, monetisation.
- **Deliberately in scope even though it overlaps:** *technical correctness* and *performance
  sanity*, because a beautiful scene that Z-fights or ships 40k unbatched parts is not shippable.

### 1.1 Bands

| overall | verdict |
|---|---|
| 3.4 – 4.0 | ships as-is; comparable to a competent Roblox environment artist |
| 2.8 – 3.3 | ships after touch-up; recognisably designed |
| 2.2 – 2.7 | prototype; a developer would rebuild the art |
| 1.5 – 2.1 | greybox with paint |
| 0.0 – 1.4 | **primitive slop** — current Golem output lives here |

The owner-rejected scene must land in the bottom band. §5.3 proves it does, arithmetically.

---

## 2. Evidence pipeline

Each run produces an **evidence bundle**. Nothing is scored that is not in the bundle.

```
results-visual/<task-id>/<model>/<seed>/
  snapshot.json        # Serializer.snapshot() — full scene graph
  metrics.json         # computed structural metrics (§7)
  shots/
    establish_045.png  # 6 canonical renders (§2.2)
    orbit_135.png
    orbit_225.png
    orbit_315.png
    eye_spawn.png
    top_ortho.png
    detail_hero.png    # 7th, only when the task names a hero object
  transcript.json      # tool calls + timings (NOT shown to the judge, see §6.3)
  verdict.json         # 20 dimension scores + caps applied + judge quotes
```

### 2.1 Capturing the scene graph

`Serializer.snapshot()` in `apps/plugin/src/Serializer.luau` already emits exactly the right shape:
`{v:1, containers:[{service, children:[{class, name, props, attrs, children}]}], scripts, instanceCount}`,
and its `propList` already whitelists the BasePart properties this benchmark needs — `Size`,
`CFrame`, `Color`, `Material`, `Transparency`, `Reflectance`, `CastShadow`, plus `Shape` on Part and
`MeshId`/`TextureID` on MeshPart.

**Three gaps must be closed before §7 metrics can be computed** (all in `propList`, `Serializer.luau:17-64`):

1. **No branch for the classes that carry visual quality.** `SurfaceAppearance`, `MaterialVariant`,
   `Texture`, `Decal`, `ParticleEmitter`, `Beam`, `Trail`, `Highlight`, `UIGradient`, `Sky`,
   `Clouds`, `SpecialMesh`, and every post-processing effect (`BloomEffect`,
   `ColorCorrectionEffect`, `DepthOfFieldEffect`, `SunRaysEffect`, `BlurEffect`) fall through every
   `elseif` and get `{class, name}` with **no props**. Their *presence* is therefore detectable
   today; their *values* are not. Presence-only metrics (`f_surf`, `L_effects`) work now.
   Value metrics (`ColorMap` set? bloom intensity? emitter rate?) need the branches added.
2. **The `Lighting` service's own properties are never captured.** `CONTAINERS` walks
   `Lighting`'s *children*, so an `Atmosphere` node appears — but `Lighting.Brightness`,
   `.Ambient`, `.OutdoorAmbient`, `.ClockTime`, `.ExposureCompensation`, `.ShadowSoftness`,
   `.EnvironmentDiffuseScale`, `.FogEnd` are not in the snapshot at all. Every §7.11 lighting-delta
   metric depends on adding a service-level property capture.
3. **`Model.PrimaryPart` is explicitly skipped** (`Serializer.luau:25-26`, "skipped v1"), so
   model-level orientation cannot be recovered. Low priority; only affects §7.9 symmetry on
   rotated models.

### 2.2 Capturing renders — and the blocker

**`apps/plugin/src/Ops.luau:395` currently makes this benchmark impossible to automate:**

```lua
handlers.screenshot = function(_)
	return {
		error = "Viewport capture is not available to Studio plugins. ...",
	}
end
```

That was true when written. It is no longer the only option. Two paths now exist:

- **Preferred — Studio MCP `screen_capture`.** Shipped 2026-03-19, "captures the current Studio
  viewport in play mode and returns the image data".[^mcp] The eval harness drives Studio through
  the MCP server rather than through Golem's own plugin socket, so the capture path is independent
  of the thing being tested — which is the correct separation for a benchmark anyway.
- **Fallback — `CaptureService:CaptureScreenshot(onCaptureReady)` from a LocalScript in play
  mode.**[^capture] Client-side, needs Play mode, returns a temporary content id. Usable, more
  moving parts.

Whichever path, the eval harness — not the model under test — sets the camera, so framing is
identical across models. Golem's `camera_focus` op must **not** be used for capture, because a
model that frames its own work well would score higher for camera work rather than building.

**Canonical shots.** Let `C` = centroid and `R` = half-diagonal of the union bounding box of all
Workspace BaseParts excluding the ground plane. All orbit shots: `FieldOfView = 70`, elevation 32°,
distance `max(1.7R, 24)` studs, looking at `C`.

| shot | camera | purpose |
|---|---|---|
| `establish_045` | azimuth 45° | primary composition / silhouette read |
| `orbit_135` | azimuth 135° | back side — catches "façade only" builds |
| `orbit_225` | azimuth 225° | ditto |
| `orbit_315` | azimuth 315° | ditto |
| `eye_spawn` | at SpawnLocation + `Vector3.new(0, 5, 0)`, yaw toward `C` | what the player actually sees |
| `top_ortho` | directly above `C`, FOV 20, distance `4R` | layout, spacing, navigation |
| `detail_hero` | 1.6× the hero object's `Size.Magnitude`, elevation 20° | detail density, asset quality |

Eye height 5 studs is the standing camera height for a default avatar; `Humanoid.JumpHeight`
defaults to 7.2 studs,[^jump] which is the vertical clearance number that matters for §4.14.

**UI-heavy tasks** add two GUI captures at 1920×1080 and 800×600 (a real cross-device check, since
`packages/evals/tasks/ui-implementation.json` already demands scale-based sizing) and skip
`orbit_*`.

### 2.3 Fixtures

Every task names a fixture so runs are comparable:

- `baseplate` — the stock Baseplate template. Lighting at template defaults.
- `flat-ground-256` — a 256×256 stud anchored `Part`, `Material = Grass`, no other content.
- `ugly-<name>.rbxl` — a checked-in *deliberately bad* scene for redesign tasks (§8.12). These are
  produced by running today's Golem and freezing the output, so the redesign task measures exactly
  the gap the owner is complaining about.

---

## 3. Scoring architecture

Three layers, applied in this order. **Order matters: structure gates the judge, never the reverse.**

```
  snapshot.json ──► [L1] structural metrics  ──► metrics.json
                          │                          │
                          │ hard gates               │ facts block (numbers only)
                          ▼                          ▼
                     caps to apply  ────────►  [L2] VLM rubric judge  ──► 20 raw scores
                                                     │  (sees: 6-7 PNGs + facts block
                                                     │   + anchor ladder images.
                                                     │   NEVER sees: model prose, tool
                                                     │   transcript, instance names)
                                                     ▼
                                            [L3] aggregate + apply caps  ──► overall 0-4
                                                     │
                                                     ▼
                                       human audit on 15% sample (§9)
```

**L1 is authoritative wherever it can measure.** If L1 says `f_mesh = 0` and `f_surf = 0`, the
judge is not *asked* whether the assets are good — asset quality is set to 0 and the judge is told
so. This is the LEGO-Eval lesson: give the judge tools and facts, not an open-ended aesthetic
question.[^lego]

---

## 4. The 20 dimensions

Format for each: **what it means in Roblox** · **0–4 anchors** · **evidence that proves the score**.

Anchors are written against the failure the owner named. Where an anchor says "the reference
scene", that is the level-4 anchor image in the calibration ladder (§6.2).

---

### 4.1 Composition
**Roblox meaning.** How mass is arranged in the 3D volume: whether there is a dominant form, a
supporting midground and a background, or whether everything sits on one plane at one height with
equal visual weight. The classic Roblox failure is the *pancake*: all content within ±4 studs of
`Y = ground`, spread evenly over a square footprint.

| | anchor |
|---|---|
| 0 | Single flat plane. All parts within one 5-stud Y band. No focal mass. *(the rejected scene: a flat platform + four poles)* |
| 1 | One raised element on an otherwise flat field; the raise is a bare column or box, not a composed form. |
| 2 | Two or three height tiers exist and read as intentional, but weight is evenly distributed — nothing dominates, the eye has no entry point. |
| 3 | Clear focal mass with supporting forms at differing heights and depths; foreground framing is present in at least 2 of 4 orbit shots. |
| 4 | Reads as designed from every orbit azimuth: a hierarchy of primary/secondary/tertiary mass, deliberate negative space, framing elements that lead the eye to the focal point. |

**Evidence.** `V_bands ≥ 3` and `σ_y/H ≥ 0.18` (§7.7) are necessary for ≥2 — a scene failing them
is capped at 1 by **C4**. Judge must quote, per orbit shot, which form it read as focal and why.
`top_ortho` must show non-uniform mass distribution for ≥3.

---

### 4.2 Visual hierarchy
**Roblox meaning.** Whether a first-time player can tell in one second what the *important* thing
is. In Roblox this is carried by size contrast, `Material` contrast, isolation (negative space),
elevation, and light — not by an instance being named "MainBuilding".

| | anchor |
|---|---|
| 0 | Every object has the same visual weight; naming is the only thing distinguishing them. |
| 1 | Something is bigger, but nothing else supports it — no material, colour, lighting or spacing reinforcement. |
| 2 | The primary object is distinguishable by two cues (e.g. size + elevation) but competing objects pull attention. |
| 3 | Primary/secondary/tertiary tiers are legible; the primary is reinforced by ≥3 cues; nothing competes. |
| 4 | Hierarchy holds at every scale — from the establishing shot down to a detail shot, each level of zoom has its own clear focal point. |

**Evidence.** From `establish_045` and `eye_spawn` only (a hierarchy that needs an orbit is not a
hierarchy). Judge names the intended focal object *from pixels*, then the harness compares against
the task's declared `heroObject`. Correct identification is necessary for ≥3. Instance names are
stripped from the facts block for this dimension (**C8**).

---

### 4.3 Proportions
**Roblox meaning.** Whether the relative dimensions within and between objects are believable.
A door 4 studs wide against a 60-stud wall; a "tree" whose trunk is as thick as its canopy; a
trophy cup narrower than its stem. Roblox's own environmental-art reference sizes a hero spire at
`16 × 98 × 11` studs precisely to read as monumental against player-scale objects.[^construct]

| | anchor |
|---|---|
| 0 | Objects are unrelated boxes; nothing has internal proportion (the "three stacked primitives trophy"). |
| 1 | Objects have plausible outlines but internal ratios are arbitrary — parts sized by round numbers, not by the form. |
| 2 | Most objects are proportioned believably; 1–2 obvious offenders. |
| 3 | Internal proportions are consistent and readable across the scene; sub-elements (trim, bases, caps) are proportioned to their parent. |
| 4 | Proportion is used expressively — deliberate exaggeration or restraint that serves the style, applied consistently. |

**Evidence.** §7.6 aspect-ratio distribution. `f_cube > 0.5` (over half of parts are near-cubes,
`a/c < 1.3`) is strong evidence of ≤1. Presence of trim-signature parts (`a/c > 4`) at ≥15% of
parts is necessary for ≥3. Judge cites two specific object pairs from `detail_hero`.

---

### 4.4 Scale
**Roblox meaning.** Absolute sizing in studs relative to the player. Roblox publishes hard numbers:
corridors and doorways **≥10 studs wide** so two avatars pass, walls **≥10 studs tall** so the
camera clears geometry and players cannot jump them, against a default `JumpHeight` of
**7.2 studs**.[^greybox][^jump] A scene that ignores these is not merely ugly, it is unplayable.

| | anchor |
|---|---|
| 0 | Scene is unusable at avatar scale — doorways under 5 studs, ceilings the camera clips through, or a "plaza" 20 studs across. |
| 1 | Traversable but wrong: geometry sized in convenient round numbers with no reference to the 5-stud avatar. |
| 2 | Player-facing geometry respects the 10-stud minimums; non-player geometry is arbitrarily scaled. |
| 3 | Everything is sized against the avatar; the scene has a believable sense of place at eye level. |
| 4 | Scale is used deliberately for effect — monumentality or intimacy achieved by contrast with player scale, per the 16×98×11 spire pattern. |

**Evidence.** `eye_spawn` is decisive; a scene can only score ≥3 if the eye-level shot reads as
inhabitable. Machine checks: min doorway width, min ceiling clearance, wall heights vs 7.2 (§7.12).
Any hard-gate failure caps this at 1.

---

### 4.5 Spacing
**Roblox meaning.** Distances between objects, and whether they form rhythm or noise. Includes
Z-fighting-adjacent problems (coplanar faces at identical Y), objects clipping into each other, and
the opposite failure — everything on an exact 8-stud lattice with identical gaps.

| | anchor |
|---|---|
| 0 | Objects intersect, float, or sit on an exact uniform grid with zero variation. |
| 1 | No intersections but spacing is uniform and mechanical; the scene reads as a spreadsheet. |
| 2 | Some grouping is visible; gaps vary but without evident intent. |
| 3 | Objects cluster and breathe — tight groupings separated by deliberate negative space; rhythm varies with function. |
| 4 | Spacing itself carries meaning: density guides movement, gaps frame views, and the rhythm changes across zones. |

**Evidence.** §7.8 nearest-neighbour CV and lattice score. `lattice > 0.8` caps at 1 via **C5**.
`CV < 0.15` caps at 1. Intersection count from §7.12 > 0 caps at 1. `top_ortho` is the primary shot.

---

### 4.6 Silhouette
**Roblox meaning.** The scene's outline against the sky, and each object's outline against its
background. Roblox's rendering flattens interior detail at distance, so silhouette is the dominant
long-range read. Boxes have no silhouette; wedges, cylinders, meshes, overhangs, and negative space
create one.

| | anchor |
|---|---|
| 0 | Every outline is a rectangle. The whole scene silhouettes as a bar chart. |
| 1 | One or two non-box outlines (a cylinder, a wedge roof), the rest rectangles. |
| 2 | Varied outlines but no *composed* skyline — the scene's overall silhouette is still a blob or a row. |
| 3 | Objects have distinct, readable silhouettes; the scene's collective outline has variety and a peak. |
| 4 | Silhouette is designed: overhangs, cantilevers, pierced forms and asymmetric peaks make the scene identifiable as a black shape. |

**Evidence.** Derive a binary alpha mask from each orbit shot against the sky and compute outline
complexity (§7.6b). Judge is shown the **thresholded silhouette** of `establish_045` alongside the
colour render — the black shape is the evidence, and it removes colour as a confound.
`f_shape_block > 0.9` (§7.6) caps at 1 via **C4**.

---

### 4.7 Material coherence
**Roblox meaning.** Whether surfaces read as *made of something*. Roblox gives four ascending
tiers: (a) `Enum.Material` on a `Part` (Concrete, Wood, Slate, Brick, Metal…), (b) a
`MaterialVariant` with custom PBR maps, (c) a `SurfaceAppearance` on a `MeshPart` with
ColorMap/NormalMap/RoughnessMap/MetalnessMap, (d) generated materials via `generate_material`.
Studio supports five PBR map types: colour, normal, roughness, metalness, emissive.[^pbr]
Roblox's own reference environment uses ~11 named MaterialVariants across one small map.[^construct]
**Coherence** additionally means the materials belong to one physical world — not Grass next to
Neon next to ForceField for no reason.

| | anchor |
|---|---|
| 0 | Every part is `Plastic`/`SmoothPlastic` with no `SurfaceAppearance`, `MaterialVariant`, `Texture` or `Decal`. **This is the rejected scene.** |
| 1 | 2–3 stock `Enum.Material` values used, assigned per-object with no logic (a "stone" wall in Plastic next to a Plastic floor). |
| 2 | Stock materials used sensibly and consistently — stone reads as stone, metal as metal — but nothing beyond `Enum.Material`. |
| 3 | Stock materials plus at least one `MaterialVariant` or `SurfaceAppearance`; surfaces have tactile variation and belong to a shared physical world. |
| 4 | A deliberate material *language*: a small set of custom PBR materials reused with intent, wear/age variation, correct roughness/metalness relationships. |

**Evidence.** §7.2 `M_u`, `f_mat`; §7.3 `f_surf`. Hard: `f_mat = 0 ∧ f_surf = 0 ∧ f_mesh = 0` ⇒
score 0, no judge discretion (**C1**). `f_surf > 0` required for ≥3. Judge quotes two surfaces from
`detail_hero` and says what material they read as.

---

### 4.8 Colour harmony
**Roblox meaning.** Whether the scene's colours form a scheme. The Roblox-specific failure is
`BrickColor` roulette — every part a different saturated primary because the model picked a name it
recognised. The reference build uses a bounded palette: two team accents (mint `88,218,171`,
carnation `255,170,255`) against four desaturated neutrals (`248,248,248`, `233,218,218`,
`181,173,156`, `91,93,105`) and one gold accent (`255,170,0`).[^construct] Note the ratio: neutrals
carry the area, accents carry the meaning.

| | anchor |
|---|---|
| 0 | Arbitrary saturated colours with no relationship. Grey poles + yellow cubes + a bright platform. **The rejected scene.** |
| 1 | Colours are inoffensive but accidental — mostly greys because nothing was chosen, or one hue applied flatly to everything. |
| 2 | A recognisable scheme exists (analogous, complementary, or neutral+accent) but is applied unevenly; some parts break it. |
| 3 | Bounded palette, consistently applied, with neutrals carrying the surface area and accents used sparingly for emphasis. |
| 4 | The palette *is* the art direction — value structure supports the composition, accents land exactly on the focal points, and the scheme is legible in a desaturated version of the render. |

**Evidence.** §7.5 area-weighted palette entropy `H_a`, effective palette size `K_2`, hue circular
variance. Out-of-band `H_a` or `K_2` caps at 1 via **C3**. Judge is additionally shown a
**desaturated** copy of `establish_045`: if the composition falls apart in greyscale, the score is
capped at 2 (value structure is doing no work).

---

### 4.9 Lighting
**Roblox meaning.** As of the Unified Lighting rollout (fully live 2025-07-23), `Lighting.Technology`
is deprecated and replaced by `LightingStyle` (`Realistic` | `Soft`) plus `PrioritizeLightingQuality`
— **both RobloxScriptSecurity, so a normal script cannot set them**; only Studio UI or an elevated
plugin context can.[^unified] What Golem *can* script: `Ambient`, `OutdoorAmbient`, `Brightness`,
`ClockTime`/`TimeOfDay`, `GeographicLatitude`, `ColorShift_Top`/`_Bottom`, `ExposureCompensation`,
`EnvironmentDiffuseScale`/`EnvironmentSpecularScale`, `ShadowSoftness`, `GlobalShadows`, fog; plus
child instances `Atmosphere`, `Sky`, `Clouds`, `BloomEffect`, `ColorCorrectionEffect`,
`SunRaysEffect`, `DepthOfFieldEffect`, `BlurEffect`; plus local `PointLight`/`SpotLight`/`SurfaceLight`
and `Neon` emissive surfaces.

The single most common Roblox amateur tell is **the untouched default `Lighting`**: `ClockTime` 14.5,
`Brightness` 3, `OutdoorAmbient` 70,70,70, no `Atmosphere`. Community critique of flat builds names
exactly this — *"needs more contrast, looks very flat"*, *"the lighting is making everything look
too similar"*.[^critique]

| | anchor |
|---|---|
| 0 | Lighting untouched from the fixture baseline. No `Atmosphere`, no effects, no local lights. |
| 1 | One or two properties nudged (e.g. `ClockTime` changed) with no supporting atmosphere or local light. |
| 2 | A coherent global mood is set — time of day, ambient, and an `Atmosphere` — but the scene has no local lighting and shadows do no work. |
| 3 | Global mood plus local lights that model the space: sources are motivated (a lamp emits, a window admits), shadows define form, `ExposureCompensation`/`ColorCorrection` tuned. |
| 4 | Lighting is the primary storytelling tool — key/fill/rim relationships, motivated practicals with matching `Neon` or emissive surfaces, atmosphere depth-cueing distance, and the mood is unmistakable within one second of `eye_spawn`. |

**Evidence.** §7.11 `L_props`, `L_effects`, `L_local`. `L_props = 0 ∧ L_effects = 0 ∧ L_local = 0`
⇒ score 0 and overall capped at 2.5 via **C2**. Judge must identify the light direction and the
mood from `eye_spawn` alone.

> **Implementation note.** This dimension cannot be measured until `Serializer.propList` captures
> the `Lighting` service's own properties (§2.1 gap 2). Until then only `L_effects` and `L_local`
> (presence of child instances) are computable, and this dimension is capped at 2 with a
> `metric-unavailable` flag in `verdict.json` rather than silently guessed.

---

### 4.10 Contrast
**Roblox meaning.** Separation in *value* (light/dark), *hue*, *material roughness*, and *scale*.
Distinct from lighting: a scene can be well-lit and still contrast-dead if every surface has the
same albedo. Roblox's flat-shaded `Plastic` at uniform `Color` is the worst case; the fix is
material and value variation, per community critique — *"everything is the same material… change
the material of some rocks to make it pop"*.[^critique]

| | anchor |
|---|---|
| 0 | Render histogram is a single narrow spike. Objects separate only by outline. |
| 1 | Some value range exists but it comes entirely from the sky gradient, not the geometry. |
| 2 | Objects separate from each other and the background, but the range is compressed — no true darks or highlights. |
| 3 | Full value range used; focal areas carry the strongest local contrast; darks read as shadow, not as black paint. |
| 4 | Contrast is orchestrated — value, hue temperature, and roughness contrast all reinforce the same focal hierarchy. |

**Evidence.** Compute the luminance histogram of `establish_045` and `eye_spawn`: report
`p5`, `p95`, inter-percentile range, and the number of local-contrast maxima. `p95 − p5 < 0.25`
(on 0–1 luminance) is strong evidence of ≤1. Judge is shown the histogram alongside the render.

---

### 4.11 Environmental storytelling
**Roblox meaning.** Whether the scene implies a world, a use, or a history that nobody explicitly
asked for. In Roblox terms: worn edges, spilled crates, a mug on a desk, scorch marks near a vent,
a path worn into grass, signage that references in-world fiction. Roblox's own curriculum states
environmental art must "provide contextual information about the world itself".[^curriculum]

| | anchor |
|---|---|
| 0 | The scene is a list of the requested nouns. Nothing implies anyone has ever been there. |
| 1 | Generic set dressing present (a barrel, a crate) but placed like inventory, not like it was used. |
| 2 | A few props imply function — a counter has items on it, a bench faces something worth looking at. |
| 3 | Consistent narrative details throughout: wear where traffic goes, clutter where people work, evidence of past events. |
| 4 | The scene answers "who was here and what happened" without a single line of text; a player could describe the fiction from the render. |

**Evidence.** Judge writes one sentence of implied fiction from `eye_spawn` + `detail_hero` and
cites the three specific objects that grounded it. If the judge cannot name three, score ≤1. Prop
density (§7.10) below the task's band caps at 1. **Named-but-not-modelled props do not count** —
a `Part` named `Barrel` that is a cylinder is a cylinder (**C8**).

---

### 4.12 Detail density
**Roblox meaning.** Detail per unit of surface area, at the right scale. Roblox builders call the
technique *trim and greeble*: small elongated parts breaking up large flat faces, edge bevels,
recesses, panel lines. Community critique of flat builds names exactly this — *"lacking some
detail… add more layers, smaller rocks in between"*.[^critique] The failure has two directions:
bare (a 60-stud wall as one untextured `Part`) and noisy (uniform greeble with no rest areas).

| | anchor |
|---|---|
| 0 | Large flat faces, no subdivision, no trim, no texture. One part per conceptual object. |
| 1 | A handful of decorative parts, all the same shape, distributed evenly. |
| 2 | Meaningful detail on the hero object; background objects remain bare boxes. |
| 3 | Detail graded by importance — dense at focal points and eye level, sparse at the periphery; large surfaces broken by trim. |
| 4 | Multi-scale detail: silhouette-level, mid-level panelling, and surface-level material detail all present, with deliberate rest areas. |

**Evidence.** §7.6 trim fraction, §7.10 prop density, and *surface subdivision*: for each face of
the bounding box, count distinct parts touching it. **C7 is critical here — raw part count can
never lift this above 2** without either silhouette-bearing geometry or material-bearing surfaces.
Ten thousand identical cubes is not detail.

---

### 4.13 Repetition handling
**Roblox meaning.** Roblox *rewards* repetition — identical `MeshId`/`TextureID` lets the engine
batch into one draw call, and Roblox's optimisation docs make this explicit.[^design] So the goal
is not "avoid repetition"; it is "repeat the asset, vary the placement". Good: one lamp mesh, 12
instances, varied rotation and grouping. Bad: 12 lamps on an exact 16-stud lattice at identical
rotation. Also bad: 12 *different* lamp meshes, which costs 12 draw calls and looks incoherent.

| | anchor |
|---|---|
| 0 | Perfect lattice of identical parts at identical rotation, or no repetition at all where the scene demands rhythm. |
| 1 | Repetition exists with trivial variation (position jitter only). |
| 2 | Repeated elements vary in rotation or scale, but the underlying grid is still visible. |
| 3 | Repeated assets are grouped into clusters of varying count, rotation and scale; the module is reused but the lattice is broken. |
| 4 | Repetition creates rhythm — modules combine into higher-order patterns, with deliberate interruptions that read as landmarks. |

**Evidence.** §7.8 lattice score and rotation entropy. `lattice > 0.8 ∧ rotation_entropy ≈ 0` ⇒
score 0 via **C5**. Cross-check against §7.2 unique-`MeshId` count: many unique meshes for the same
conceptual object is evidence of ≤2 *and* a performance flag.

---

### 4.14 Asset quality
**Roblox meaning.** What the objects actually *are*, on the ladder: raw `Part` primitive → unioned
solid → imported/generated `MeshPart` → `MeshPart` + `SurfaceAppearance` → Creator Store asset from
a competent creator. As of 2026-03-19 Golem has three native routes off the bottom rung —
`insert_from_creator_store` (search + insert), `generate_mesh`, `generate_material`[^mcp] — plus
`GenerationService:GenerateModelAsync`, which returns a multi-part grouped `Model` with basic
physical properties.[^gen]

| | anchor |
|---|---|
| 0 | Every object is a raw `Part` primitive. **The rejected scene.** |
| 1 | Primitives plus unions; forms are still obviously CSG-of-boxes. |
| 2 | Some `MeshPart`s present (generated or inserted) but untextured, or mixed inconsistently with primitives at the same visual tier. |
| 3 | Hero and mid-ground objects are meshes with materials; primitives are used only where a primitive is the right answer (walls, floors, trim). |
| 4 | Every object is at the right rung for its role; generated/inserted assets are consistent in style and topology; nothing reads as a placeholder. |

**Evidence.** §7.4 `f_mesh`, unique `MeshId` count, `f_surf`. `f_mesh = 0` ⇒ score 0 (**C1**).
Judge is asked, per object in `detail_hero`, "is this a mesh or a box?" and must be *correct* —
which is verifiable against the snapshot, so this doubles as a judge-reliability probe (§9.2).

---

### 4.15 Style consistency
**Roblox meaning.** Whether one art direction governs the whole scene. Roblox scenes fail this by
mixing tiers: a photoreal Creator Store tree next to a 4-part blocky house; `Neon` cyberpunk trim
on a medieval tavern; realistic PBR concrete beside flat `SmoothPlastic`.

| | anchor |
|---|---|
| 0 | No style at all — nothing to be inconsistent with. |
| 1 | Objects vary wildly in fidelity tier and idiom; the scene reads as assembled from unrelated sources. |
| 2 | A dominant style is discernible with 2–3 clear outliers. |
| 3 | One style holds across geometry, materials, colour and lighting; outliers are absent or deliberate. |
| 4 | The style is specific and committed — a reader could name it ("stylised low-poly with hand-painted trims", "grounded industrial realism") and every element serves it. |

**Evidence.** Judge names the style in ≤6 words from `establish_045`, then lists any element that
violates it, checked against `orbit_*`. Machine corroboration: fidelity-tier variance (fraction of
objects at each rung of the §4.14 ladder) — high variance without intent is evidence of ≤2.
**A scene that is uniformly primitive scores 1, not 4** — consistency of nothing is not style
(**explicit anti-gaming rule**, §6.1).

---

### 4.16 Navigation readability
**Roblox meaning.** Can a player tell where to go? Roblox tools: paths of contrasting `Material`,
lighting leading the eye, landmark silhouettes visible from spawn, colour-coded zones (the
reference build uses mint vs carnation to mark team territory[^construct]), and **traversability** —
gaps under 7.2 studs of jump height, steps under 2 studs, corridors ≥10 studs.[^greybox][^jump]

| | anchor |
|---|---|
| 0 | No legible route; or the geometry is not traversable (walls block the only path, gaps exceed jump height). |
| 1 | Traversable but undirected — an open field with objects on it. |
| 2 | A main route exists and is walkable, marked by geometry alone. |
| 3 | Route is marked by material/colour change *and* reinforced by a landmark visible from spawn; branches are legible. |
| 4 | Wayfinding is layered — landmarks at multiple ranges, material paths, lighting leading lines, and zone colour-coding; a first-time player never stops to wonder where to go. |

**Evidence.** This is where the SceneEval plausibility metrics apply directly — collision, support,
navigability, accessibility, out-of-bounds.[^sceneeval] Machine: run a navmesh/raycast walkability
probe from the SpawnLocation (§7.12); unreachable-area fraction > 0.3 caps at 1. `top_ortho` is the
primary shot; judge traces the route it would take and names the cues.

---

### 4.17 Gameplay readability
**Roblox meaning.** Can a player tell what is *interactive*? In Roblox: `ProximityPrompt` targets,
shop stalls, obby platforms (safe vs killbrick), collectibles, doors. The genre convention is
strong — obby platforms read as platforms, killbricks are red/`Neon`, collectibles float and spin.
Distinct from §4.16: that is "where", this is "what does what".

| | anchor |
|---|---|
| 0 | Interactive and decorative elements are visually identical. |
| 1 | Interactives are distinguished only by a `ProximityPrompt` appearing on approach. |
| 2 | Interactives are visually marked but inconsistently — some shop stalls read as shops, others as scenery. |
| 3 | A consistent visual language separates interactive, traversable and decorative; the language is discoverable in the first shot. |
| 4 | The visual language is genre-fluent and self-teaching — a player understands the mechanic from the art before any UI appears. |

**Evidence.** Judge classifies every prominent object in `eye_spawn` as interactive/traversable/
decorative, scored against the task's declared ground truth. Machine corroboration: count of
`ProximityPrompt`/`ClickDetector` and whether their parents are visually distinguished (differing
`Material` or `Color` from neighbours) — both already captured by `Serializer.propList`.

---

### 4.18 Request fidelity
**Roblox meaning.** Did the model build what was asked — the named objects, the named count, the
named style adjective, the named constraints? This is the *only* dimension the current output
scores well on, which is precisely why it is weighted low and firewalled (§6.1, **C6**).

| | anchor |
|---|---|
| 0 | Core requested objects missing. |
| 1 | Objects present but constraints (count, arrangement, named style) ignored. |
| 2 | All named objects present, constraints partially honoured. |
| 3 | All objects and explicit constraints honoured, including the style adjective. |
| 4 | Explicit requirements met plus correctly-inferred implicit ones (a shop implies a counter, a till, and stock; a horror room implies a light source to fail). |

**Evidence.** Structural, from `snapshot.json` against the task's `requestedObjects` list — matched
by *geometry and material signature*, not by instance name (**C8**). A `Part` named `Fountain` with
no water surface, no basin geometry and no mesh does not satisfy "fountain"; it counts as a
cylinder. This makes fidelity harder to game than a `contains` check in the coding benchmark.

---

### 4.19 Technical correctness
**Roblox meaning.** The build is structurally sound in engine terms: no Z-fighting from coplanar
faces, no parts intersecting where they shouldn't, `Anchored` set on static geometry (unfrozen
parts fall on Play), collision sane (`CanCollide` off on decorative overhangs, on for floors),
normals/orientation correct, no parts below the ground plane, no NaN CFrames, models grouped with
sensible hierarchy, `CastShadow` left on for shadow-casting mass.

| | anchor |
|---|---|
| 0 | Scene breaks on Play — geometry falls, players fall through the floor, or Z-fighting is visible in the establishing shot. |
| 1 | Multiple correctness defects visible or triggered on Play. |
| 2 | One notable defect; otherwise sound. |
| 3 | No visible defects; anchoring, collision and grouping are correct throughout. |
| 4 | Engine-idiomatic: sensible `Model` hierarchy with `PrimaryPart`, collision geometry distinct from visual where warranted, shadow casting deliberate. |

**Evidence.** Fully machine-checkable from `snapshot.json` plus a Play-mode settle test: capture
`establish_045` before and after 3 seconds of Play; any part whose `CFrame` moved was unanchored.
§7.12 lists the checks.

---

### 4.20 Performance sanity
**Roblox meaning.** Roblox publishes the budget explicitly: **"stay below 1,000 draw calls and
1,000,000 triangles for the game to run well on your baseline device"**.[^design] Key lever: parts
sharing the same `MeshId`/`TextureID` batch into a single draw call, whereas the same mesh
duplicated with *different* asset ids cannot instance.[^design] Also: transparency overdraw,
`CastShadow` on thousands of small parts, and unbounded `PointLight` counts.

| | anchor |
|---|---|
| 0 | Would not run on a mid-range mobile device — draw calls or triangles far past budget, or thousands of dynamic lights. |
| 1 | Over budget on one axis with no mitigation. |
| 2 | Within budget but wasteful — duplicate unique meshes that could instance, unnecessary `CastShadow`, overdraw. |
| 3 | Comfortably within budget; instancing exploited; part count proportionate to visual result. |
| 4 | Efficient by design — visual density achieved with a small unique-asset set, streaming-friendly layout, considered shadow/light budgets. |

**Evidence.** Estimated draw calls = (unique `MeshId`×`TextureID` pairs) + (distinct
`Material`×`Color` groups for primitives) + effects; triangles estimated from mesh metadata.
Both compared against the 1,000 / 1,000,000 thresholds. Plus `L_local` count, `CastShadow` count,
`Transparency ∈ (0,1)` part count. **A scene cannot score above 2 here by being empty** — sparsity
is not efficiency; the score is conditioned on the scene having achieved ≥2 on detail density.

---

## 5. Aggregation

### 5.1 Weights

Three groups. The weighting encodes the product thesis: **craft is what was rejected, so craft
dominates.**

| group | weight each | dimensions |
|---|---|---|
| **Craft** (12) | **1.50** | composition, visual hierarchy, silhouette, material coherence, colour harmony, lighting, contrast, environmental storytelling, detail density, repetition handling, asset quality, style consistency |
| **Spatial** (5) | **1.00** | proportions, scale, spacing, navigation readability, gameplay readability |
| **Hygiene** (3) | **0.75** | request fidelity, technical correctness, performance sanity |

Total weight = 12(1.5) + 5(1.0) + 3(0.75) = **25.25**. Craft is 18/25.25 = **71%** of the score.

```
raw_overall = Σ(score_d × weight_d) / 25.25
overall     = min(raw_overall, min over all triggered caps)
```

Per-task weight overrides are allowed in `tasks.json` (a lighting-redesign task raises lighting to
3.0 and drops environmental storytelling to 0.5), but **the craft group's total share may never
fall below 60%** — enforced by the harness, not by convention.

### 5.2 The caps (anti-gaming rules, stated explicitly)

Caps are computed from `metrics.json` **before** the judge runs, and applied as a `min` **after**.
They exist because the judge will drift; the geometry will not.

| id | trigger (from `metrics.json`) | effect |
|---|---|---|
| **C1** *untextured-primitive ceiling* | `f_mat = 0 ∧ f_surf = 0 ∧ f_mesh = 0` (every part stock `Plastic`/`SmoothPlastic`, no `SurfaceAppearance`/`MaterialVariant`/`Texture`/`Decal`, no `MeshPart`) | material coherence = 0, asset quality = 0, detail density ≤ 1, style consistency ≤ 1, **overall ≤ 1.5** |
| **C1b** *near-slop* | `f_mat < 0.15 ∧ f_surf < 0.05 ∧ f_mesh < 0.05` | material coherence ≤ 1, asset quality ≤ 1, **overall ≤ 2.0** |
| **C2** *default-lighting ceiling* | `L_props = 0 ∧ L_effects = 0 ∧ L_local = 0` | lighting = 0, contrast ≤ 1, **overall ≤ 2.5** |
| **C3** *palette-chaos ceiling* | `H_a > 2.6` or `K_2 > 9` or (`H_a < 0.6` and scene is not deliberately monochrome per task) | colour harmony ≤ 1 |
| **C4** *flat-world ceiling* | `V_bands ≤ 2` or `σ_y/H < 0.10` or `f_shape_block > 0.9` | composition ≤ 1, silhouette ≤ 1 |
| **C5** *grid-clone ceiling* | `lattice > 0.8 ∧ rotation_entropy < 0.2` | repetition handling ≤ 1, spacing ≤ 1, detail density ≤ 2 |
| **C6** *fidelity firewall* | always | request fidelity may not raise any craft dimension. The judge scores craft on renders **with the task prompt withheld** for craft dimensions; it sees the prompt only for fidelity, scale and gameplay readability. |
| **C7** *count-is-not-detail* | always | detail density > 2 requires either trim-signature geometry (`a/c > 4` at ≥15% of parts) or `f_surf > 0`. Raw part count is never sufficient evidence. |
| **C8** *names-are-not-evidence* | always | instance names are stripped from every judge-facing artifact except the fidelity pass. A `Part` named `Trophy` is scored as whatever shape it is. |
| **C9** *empty-is-not-efficient* | `detail_density < 2` | performance sanity ≤ 2 |
| **C10** *façade check* | max pairwise difference between orbit-shot scores > 1.5 | composition, silhouette and style consistency take the **minimum** across orbits, not the mean |

Additional standing rules that are not numeric caps:

- **R1 — no credit for intent.** Comments, script names, `StringValue`s describing the design, or
  the model's prose asserting a mood earn nothing. Only geometry, materials, colour and lighting.
- **R2 — no credit for a plan.** A model that describes a beautiful scene and builds a grey box
  scores the grey box. (This is the same discipline as the existing `prompts.ts` rule "Never report
  a change you have not observed", applied to the grader.)
- **R3 — the judge may not see the transcript.** Tool-call counts, retries and durations are
  excluded from `verdict.json` inputs, both to prevent effort-as-quality inference and because
  informativeness bias makes VLM judges reward verbosity per se.[^infobias]
- **R4 — no self-framing.** The harness owns the camera. A model cannot score higher by pointing
  the camera at its one good angle.
- **R5 — anchors are images, not adjectives.** Every level-2 and level-4 anchor is backed by a
  checked-in reference render (§6.2). "Professional" is never left to the judge's imagination.

### 5.3 Proof that the rejected scene cannot exceed ~1.5

Score the owner's description — *flat platform, four grey poles with yellow cubes on top, a trophy
of three stacked primitives, every object requested is present* — against §4 anchors:

| dimension | group | score | why |
|---|---|---|---|
| composition | craft | 1 | poles raise mass, but pancake footprint |
| visual hierarchy | craft | 1 | trophy is bigger, nothing reinforces it |
| silhouette | craft | 1 | boxes and cylinders, bar-chart outline |
| material coherence | craft | **0** | C1: all `Plastic`, no surfaces |
| colour harmony | craft | 1 | grey + yellow, accidental |
| lighting | craft | **0** | C2: defaults untouched |
| contrast | craft | 1 | value range from sky only |
| environmental storytelling | craft | 0 | a list of nouns |
| detail density | craft | 1 | C1/C7 cap |
| repetition handling | craft | 1 | four identical poles, exact lattice |
| asset quality | craft | **0** | C1: zero meshes |
| style consistency | craft | 1 | uniformly primitive ≠ style |
| proportions | spatial | 2 | plausible outlines, arbitrary ratios |
| scale | spatial | 2 | traversable, round numbers |
| spacing | spatial | 2 | no intersections, mechanical |
| navigation readability | spatial | 2 | walkable, undirected |
| gameplay readability | spatial | 2 | marked inconsistently |
| request fidelity | hygiene | **4** | every requested object present |
| technical correctness | hygiene | 3 | anchored, no defects |
| performance sanity | hygiene | 4 | tiny part count |

```
craft   = (1+1+1+0+1+0+1+0+1+1+0+1) =  8  × 1.50 = 12.00
spatial = (2+2+2+2+2)               = 10  × 1.00 = 10.00
hygiene = (4+3+4)                   = 11  × 0.75 =  8.25
                                        total    = 30.25
overall = 30.25 / 25.25 = 1.198
```

**1.20/4** — bottom band, and this is the *natural* score from the anchors. C1's 1.5 ceiling never
even binds; it exists only as a backstop against judge inflation. Note also that request fidelity
scoring a perfect 4 moves the overall by 0.12 — exactly the intended firewall.

For contrast, take the same scene rebuilt with generated meshes, three MaterialVariants, a bounded
5-colour palette, `Atmosphere` plus two motivated `PointLight`s, trim on the plinth and a landmark
silhouette. Score it 3 on ten craft dimensions, 2 on environmental storytelling, asset quality and
style consistency (competent, not authored), 3 across all five spatial dimensions, and 4 on all
three hygiene dimensions:

```
craft   = 3+3+3+3+3+3+3+2+3+3+2+2 = 33  × 1.50 = 49.50
spatial = 3+3+3+3+3               = 15  × 1.00 = 15.00
hygiene = 4+4+4                   = 12  × 0.75 =  9.00
                                      total    = 73.50
overall = 73.50 / 25.25 = 2.911
```

**2.91/4** — "ships after touch-up". The **1.71-point gap** between 1.20 and 2.91 is the thing this
benchmark exists to measure, and it is what any prompt or model change must be able to move.
Both figures are reproducible from the weights in §5.1; the harness must assert them as a unit test
so a future weight change cannot silently break the calibration.

---

## 6. Judging protocol

### 6.1 Two passes, deliberately firewalled

- **Pass A — craft (12 dims).** Judge sees: the 7 renders, the silhouette mask, the desaturated
  copy, the luminance histogram, the anchor ladder, and the **facts block** (numbers only, §6.4).
  Judge does **not** see: the task prompt, instance names, the model's prose, the transcript.
- **Pass B — spatial + hygiene (8 dims).** Judge sees everything in Pass A **plus** the task prompt,
  the `requestedObjects` list, instance names, and the machine-check results.

This ordering is the operational form of **C6**: the judge cannot let "it built everything I asked"
leak into "it looks good", because during Pass A it does not know what was asked.

### 6.2 Anchored scoring, not free-floating

Absolute pointwise VLM scoring is unstable — judges anchor differently and drift within a session;
pairwise comparison is consistently more accurate and more stable across image-generation and
editing tasks.[^pairwise] But this benchmark needs an absolute 0–4 number for tracking over time.
The resolution is the standard **anchor-ladder** construction: build a per-task-type ladder of five
checked-in reference scenes at levels 0/1/2/3/4, stitch the candidate render side-by-side with the
ladder, and have the judge place the candidate by pairwise comparison — then read off the level.

```
packages/evals/tasks-visual/anchors/<taskType>/L0.png … L4.png
```

Ladders are built once, by hand, from: (L0) today's Golem output, (L1–L2) intermediate Studio
builds, (L3–L4) reference environments — Roblox's own laser-tag environmental-art project is the
natural L4 source for the architectural task types, since its exact stud dimensions, MaterialVariant
names and RGB palette are published.[^construct]

**Ties are resolved downward.** If the judge cannot distinguish the candidate from L2 and L3, score
2. Aesthetic benchmarks inflate; this is the counterweight.

### 6.3 Bias controls

| bias | control |
|---|---|
| **informativeness / verbosity**[^infobias] | judge never sees model prose or transcript (R3); facts block is numeric only |
| **position** | anchor ladder order and orbit-shot order shuffled per judging run; each bundle judged twice with different shuffles |
| **self-preference** | the judge model must differ from the model under test; when evaluating GLM-5.3-flash, judge with a different vision model and record which |
| **name leakage** | C8 — names stripped in Pass A |
| **localisation failure**[^lego] | the judge is never asked to count or locate; those come from `metrics.json` |

**Stability requirement:** the two judging runs of the same bundle must agree within 0.5 overall.
If not, the bundle escalates to human scoring and is logged as a judge-instability event.

### 6.4 The facts block

Machine-computed, numeric, name-free. Given to the judge verbatim:

```json
{
  "parts": 214, "meshParts": 0, "unions": 0,
  "uniqueMaterials": 1, "nonDefaultMaterialFraction": 0.0,
  "surfaceDetailFraction": 0.0, "meshFraction": 0.0,
  "paletteEntropyAreaWeighted": 0.91, "effectivePaletteSize": 2,
  "verticalBands": 2, "normalizedHeightStdDev": 0.09,
  "neighbourSpacingCV": 0.11, "latticeScore": 0.94, "rotationEntropy": 0.0,
  "nearCubeFraction": 0.62, "trimFraction": 0.03,
  "symmetryX": 0.97, "propDensityPer1000Studs2": 1.2,
  "lightingPropsChanged": 0, "lightingEffects": 0, "localLights": 0,
  "estDrawCalls": 6, "estTriangles": 2568,
  "capsTriggered": ["C1", "C2", "C4", "C5"]
}
```

The judge is instructed: *these numbers are ground truth; do not contradict them; use them to
explain what you see, not to replace looking.*

---

## 7. Machine-checkable structural metrics

All computed from `snapshot.json` (§2.1) by a new `packages/evals/src/metrics-visual.mjs`.
Provenance tags: **[DOC]** = from cited Roblox documentation, **[DERIVED]** = arithmetic on a
documented fact, **[PROV]** = provisional, must be calibrated on the human-anchored set (§9) before
being used as a hard gate.

Let `P` = BaseParts under Workspace excluding the ground plane, `N = |P|`, and let each part have
`Size = (sx,sy,sz)`, `CFrame`, `Color`, `Material`.

### 7.1 Part count
`N_parts = |P|`. Surface area `A = Σ 2(sx·sy + sy·sz + sx·sz)`.
Context-only; never scored directly (**C7**). Reported to size the other densities.

### 7.2 Material metrics
- `M_u` = |distinct `Material` values| over `P`.
- `f_mat` = |{p : p.Material ∉ {Plastic, SmoothPlastic}}| / N.
- `f_mat_area` = area-weighted version (a textured pebble next to a plastic skyscraper should not count as 50%).

| threshold | value | tag |
|---|---|---|
| slop | `f_mat_area < 0.15` | [PROV] |
| minimum credible | `M_u ≥ 3 ∧ f_mat_area ≥ 0.5` | [PROV] |
| reference-grade | `M_u ≥ 6`, with ≥1 `MaterialVariant` | [DERIVED] — Roblox's own laser-tag map names ~11 MaterialVariants[^construct] |

### 7.3 Surface-detail fraction
`f_surf` = |parts with a `SurfaceAppearance`, `Texture` or `Decal` child, or a `MaterialVariant`
reference| / N. Detectable today by class presence even without the `propList` fix (§2.1).

`f_surf = 0` ⇒ **C1** contribution. `f_surf ≥ 0.15` required for material coherence ≥3. [PROV]

### 7.4 Mesh fraction
`f_mesh` = |MeshParts| / N. `n_mesh_unique` = |distinct (`MeshId`, `TextureID`) pairs|.

`f_mesh = 0` ⇒ asset quality 0 (**C1**). `f_mesh ≥ 0.2` for asset quality ≥3. [PROV]
`n_mesh_unique / meshCount > 0.8` (every mesh unique) is a repetition-handling *and* performance
flag — identical asset ids are what allow single-draw-call instancing.[^design]

### 7.5 Palette metrics — **area-weighted, not part-weighted**
Part-weighted entropy is gameable: 200 tiny confetti parts would swamp one enormous baseplate.
Weight every colour by the part's surface area.

1. Convert each `Color` to OKLCH. Bin into 16 hue sectors × 3 lightness bands = 48 bins.
2. `w_i` = Σ area of parts in bin `i`, normalised.
3. **Area-weighted palette entropy** `H_a = −Σ w_i log₂ w_i`.
4. **Effective palette size** `K_2` = |{i : w_i ≥ 0.02}|.
5. **Hue circular variance** `V_h` over area-weighted hues.
6. **Neutral share** `f_neutral` = area fraction with OKLCH chroma < 0.04.

| band | value | tag |
|---|---|---|
| monotone (unless intended) | `H_a < 0.6` | [PROV] |
| healthy | `1.2 ≤ H_a ≤ 2.6`, `3 ≤ K_2 ≤ 7` | [PROV] |
| confetti | `H_a > 2.6` or `K_2 > 9` | [PROV] |
| reference ratio | `f_neutral ≥ 0.55` with 1–2 accent hues | [DERIVED] — the laser-tag palette is 4 neutrals + 3 accents, neutrals carrying the walls and floors[^construct] |

### 7.6 Bounding-box aspect ratios
Per part, sort `(sx,sy,sz)` descending to `(a,b,c)`; ratio `r = a/c`.
- `f_cube` = |{r < 1.3}| / N — the "everything is a box" signal.
- `f_trim` = |{r > 4}| / N — the trim/greeble signature.
- `f_shape_block` = |{p : p.ClassName == "Part" ∧ p.Shape == Block}| / N.

| threshold | value | tag |
|---|---|---|
| slop | `f_cube > 0.5` or `f_shape_block > 0.9` | [PROV] |
| detail credible | `f_trim ≥ 0.15` | [PROV] — required for detail density > 2 under **C7** |

### 7.6b Silhouette complexity
From the binary sky mask of each orbit render: perimeter `L`, area `A_s`.
`complexity = L² / (4πA_s)` (1.0 = circle; a rectangle ≈ 1.27; a spiky skyline ≫ 2).
Also `skyline_variance` = variance of the topmost occupied row per column.

`complexity < 1.4 ∧ skyline_variance < 0.02·H_img` ⇒ silhouette ≤ 1. [PROV]

### 7.7 Vertical variation
Let `H` = scene bounding-box Y extent.
- `σ_y/H` = area-weighted standard deviation of part centre Y, normalised.
- `V_bands` = number of 5 equal Y bands holding ≥3% of total surface area.

| threshold | value | tag |
|---|---|---|
| pancake | `V_bands ≤ 2` or `σ_y/H < 0.10` | [PROV] → **C4** |
| composed | `V_bands ≥ 3 ∧ σ_y/H ≥ 0.18` | [PROV] |

### 7.8 Neighbour spacing and lattice
- For each part, `d_1` = distance to nearest other part centroid. `CV = σ(d_1)/μ(d_1)`.
- **Lattice score**: for candidate grid pitches `g ∈ [2,32]` studs, `lattice(g)` = fraction of parts
  whose `x` and `z` are within `0.05g` of a multiple of `g`; `lattice = max_g lattice(g)`.
- **Rotation entropy**: Shannon entropy of yaw quantised to 15° bins, normalised to [0,1].

| threshold | value | tag |
|---|---|---|
| grid clone | `lattice > 0.8 ∧ rotation_entropy < 0.2` | [PROV] → **C5** |
| mechanical | `CV < 0.15` | [PROV] |
| healthy | `0.35 ≤ CV ≤ 1.2` | [PROV] |

### 7.9 Symmetry
Reflect all part centroids about each of the three principal planes through the area-weighted
centroid. `S_axis` = fraction of parts with a mirror partner within `0.05·R` and matching
`Size` within 10%.

Symmetry is **task-conditional**, not universally good:

| task type | expected `S_x` | tag |
|---|---|---|
| spawn plaza, lobby, monument | 0.5 – 0.95 (axial formality) | [PROV] |
| shop interior, sci-fi room | 0.2 – 0.6 | [PROV] |
| stylized outdoor, horror | < 0.4 (organic) | [PROV] |

Out-of-band symmetry is evidence against composition, not an automatic cap.

### 7.10 Prop density
Footprint `F` = XZ area of the scene bounding box in stud². Props = parts not in the structural set
(ground plane, walls, floors, ceilings — identified as parts with one dimension > 0.4·R).
`ρ = 1000 · props / F` per 1000 stud².

| task type | expected `ρ` | tag |
|---|---|---|
| spawn plaza, stylized outdoor | 5 – 25 | [PROV] |
| shop interior, sci-fi room, horror | 25 – 90 | [PROV] |
| obby section | 2 – 15 | [PROV] |

Below band ⇒ environmental storytelling ≤ 1. Above band without `f_trim ≥ 0.15` ⇒ detail density
≤ 2 (noise, not detail).

### 7.11 Lighting deltas
**Requires the `Serializer` fix in §2.1 gap 2.** Baseline is captured once from a fresh Baseplate
into `packages/evals/tasks-visual/fixtures/lighting-baseline.json` and checked in — *not*
hard-coded, because Roblox has changed these defaults before and will again.

Observed template defaults as of 2026-08-30 (record, do not trust): `Brightness` 3, `ClockTime`
14.5, `OutdoorAmbient` `70,70,70`, `Ambient` `0,0,0`, `ExposureCompensation` 0, `ShadowSoftness`
0.2, `GlobalShadows` true, no `Atmosphere` child.

- `L_props` = count of scriptable Lighting properties differing from baseline beyond ε
  (ε = 0.01 for scalars, ΔE > 2 in OKLab for colours).
- `L_effects` = count of `{Atmosphere, Sky, Clouds, BloomEffect, ColorCorrectionEffect,
  SunRaysEffect, DepthOfFieldEffect, BlurEffect}` children.
- `L_local` = count of `PointLight`/`SpotLight`/`SurfaceLight`; `L_colored` = those with
  non-white `Color`.
- `L_neon` = count of parts with `Material = Neon`.

| threshold | value | tag |
|---|---|---|
| default lighting | `L_props = 0 ∧ L_effects = 0 ∧ L_local = 0` | → **C2** |
| mood set | `L_props ≥ 3 ∧ L_effects ≥ 1` | [PROV] |
| lit scene | `L_local ≥ 3 ∧ L_colored ≥ 1` (interior/horror) | [PROV] |
| lighting-redesign pass bar | `L_props ≥ 6 ∧ L_effects ≥ 3` | [PROV] |

> `LightingStyle` and `PrioritizeLightingQuality` replaced the deprecated `Lighting.Technology` when
> Unified Lighting went fully live 2025-07-23.[^unified] Both are RobloxScriptSecurity, so
> `run_code` cannot set them — only Studio UI or an elevated plugin path. Tasks must therefore
> **not** require them, and the grader must not penalise their absence.

### 7.12 Correctness and traversability probes
- **Intersection count**: pairs of parts whose oriented bounding boxes overlap by > 5% of the
  smaller volume, excluding intentional parent/child joins.
- **Coplanar Z-fight risk**: pairs of coplanar faces within 0.002 studs on the same axis.
- **Unanchored static**: parts with `Anchored = false` that move during a 3-second Play settle.
- **Sub-floor parts**: parts entirely below the ground plane.
- **Walkability**: raycast grid from the `SpawnLocation` at 4-stud spacing; flood-fill with the
  traversal rules — step ≤ 2 studs, gap ≤ 7.2 studs (default `JumpHeight`[^jump]), clearance ≥ 6
  studs. `unreachable_fraction` = 1 − reachable/total floor cells.
- **Corridor width** and **ceiling clearance** minima, against the documented **10 studs**.[^greybox]

These correspond to SceneEval's plausibility family — collision, support, navigability,
accessibility, out-of-bounds — which is the established structural complement to fidelity
metrics in text-conditioned 3D scene synthesis.[^sceneeval]

### 7.13 Performance estimates
```
estDrawCalls ≈ |distinct (MeshId, TextureID)| + |distinct (Material, Color) primitive groups|
             + L_effects + |ParticleEmitter| + |transparent parts|
estTriangles ≈ Σ mesh triangle counts + 12 × |primitive parts|
```
Gates from Roblox's published budget: `estDrawCalls < 1000`, `estTriangles < 1e6`.[^design]
These are the only two thresholds in §7 tagged **[DOC]**; everything else needs calibration.

---

## 8. Task taxonomy — 12 types

Each type exists to make a *specific* failure mode unavoidable. Full definitions in
`packages/evals/tasks-visual/tasks.json`.

| # | id | type | the failure it forces into the open |
|---|---|---|---|
| 1 | `vis-01-spawn-plaza` | spawn plaza | first impression; landmark silhouette; palette discipline on a large open footprint |
| 2 | `vis-02-simulator-hub` | polished simulator hub | genre fluency + gameplay readability of upgrade/rebirth affordances |
| 3 | `vis-03-horror-room` | small horror environment | **lighting is the whole task** — a default-lit horror scene is a total failure |
| 4 | `vis-04-obby-section` | obby section | gameplay readability (safe vs hazard) + traversability against `JumpHeight` 7.2 |
| 5 | `vis-05-shop-interior` | shop interior | prop density, environmental storytelling, interior scale at 10-stud minimums |
| 6 | `vis-06-scifi-room` | sci-fi room | material coherence + emissive discipline; `Neon` everywhere is the trap |
| 7 | `vis-07-stylized-outdoor` | stylized outdoor area | organic asymmetry, repetition handling with natural assets, atmosphere depth |
| 8 | `vis-08-lobby` | lobby | axial symmetry done well; visual hierarchy toward exits; contrast on interior surfaces |
| 9 | `vis-09-monument` | monument / trophy | **the exact rejected object.** Proportion, silhouette, detail density on one hero form |
| 10 | `vis-10-ui-scene` | UI-heavy scene | 2D hierarchy, cross-device scale, colour harmony between UI and world |
| 11 | `vis-11-lighting-redesign` | lighting redesign | isolates lighting: geometry is a fixed fixture, only lighting may change |
| 12 | `vis-12-ugly-redesign` | ugly → professional redesign | **the money task.** Fixture is frozen current-Golem output; measures the exact gap |

### 8.1 Note on task 11 and 12 fixtures
`vis-11` and `vis-12` load `.rbxl` fixtures. `vis-12`'s fixture is generated by running today's
Golem on a plaza prompt and freezing the result — so its L0 anchor and its input fixture are the
same scene, and the task's score *is* the improvement delta. `vis-11` forbids geometry changes: the
grader diffs `snapshot.json` and zeroes the task if any BasePart `Size`/`CFrame`/`Color`/`Material`
changed, so lighting cannot be faked by rebuilding the scene.

---

## 9. Validation before this benchmark is trusted

The [PROV] thresholds and the judge are both unvalidated. Do not ship numbers from this benchmark
until:

### 9.1 Human-anchored calibration set
60 scenes — 5 per task type — scored independently by 2 humans on all 20 dimensions.
Composition: 12 from current Golem, 24 from mid-tier Roblox community builds, 12 from Roblox's own
reference projects, 12 deliberately adversarial (see 9.3).

### 9.2 Acceptance criteria
| metric | bar | rationale |
|---|---|---|
| human–human Cohen's κ per dimension | ≥ 0.55 | if two humans cannot agree, the anchors are underspecified — rewrite them |
| judge–human κ, overall band | ≥ 0.60 | LEGO-Eval's tool-augmented judge reached 0.63; below that, this is no better than the VLM-alone baseline of 0.05[^lego] |
| judge–human Spearman ρ, overall score | ≥ 0.75 | |
| judge self-consistency across shuffles | ≥ 0.85 within ±0.5 | §6.3 |
| mesh-vs-box probe accuracy (§4.14) | ≥ 0.90 | direct localisation check; failure here means the judge is not looking[^lego] |

Any [PROV] threshold whose gate flips the human score by more than one band is recalibrated to the
value that maximises agreement, then re-tagged with the calibration date and set size.

### 9.3 Adversarial set — must all score low
Twelve deliberately gamed scenes, each targeting one cap:
1. Every requested object present, all `Plastic` primitives (targets C1 — must score ≤1.5)
2. 20,000 tiny cubes forming "detail" (targets C7)
3. Perfect 8-stud lattice of a well-made mesh (targets C5)
4. One gorgeous façade, four bare back faces (targets C10)
5. Instance names describing a beautiful scene, geometry of boxes (targets C8)
6. Correct scene, `Lighting` untouched (targets C2)
7. 40 saturated hues, well-composed geometry (targets C3)
8. Beautiful prose in the response, grey box built (targets R2/R3)
9. Empty scene with 3 draw calls (targets C9)
10. Flat pancake with excellent materials (targets C4)
11. One `Part` per requested noun, correctly named and correctly counted (targets C6 — fidelity 4, overall ≤1.5)
12. Scene rebuilt from scratch during a lighting-only task (targets §8.1 geometry diff)

**If any adversarial scene scores above 2.0, the benchmark is broken and must not be used to make
model or prompt decisions.**

---

## 10. Implementation dependencies

Ordered by what blocks what.

| # | work | file | blocks |
|---|---|---|---|
| 1 | Viewport capture path via Studio MCP `screen_capture`, or `CaptureService` in Play mode | new harness module; `Ops.luau:395` currently returns an error | everything visual |
| 2 | `Serializer.propList`: add branches for `SurfaceAppearance`, `MaterialVariant`, `Texture`, `Decal`, `ParticleEmitter`, `Beam`, `Trail`, `Highlight`, `UIGradient`, `Sky`, `Clouds`, and the 5 post-processing effects | `Serializer.luau:17-64` | §7.3 values, §4.7, §4.12 |
| 3 | Capture service-level properties for `Lighting` (and `Workspace`) | `Serializer.luau:114-162` | §7.11 entirely, §4.9 |
| 4 | `metrics-visual.mjs` implementing §7 | new | caps, facts block |
| 5 | `grade-visual.mjs` — two-pass judge, caps, aggregation | new; mirrors `grade.mjs` structure | verdicts |
| 6 | Extend `validateTask` for the visual task schema (§11) | `tasks.mjs:9-42` — current `CHECK_TYPES` would reject every visual task | loading tasks |
| 7 | Anchor ladders, 5 images × 12 task types | `tasks-visual/anchors/` | §6.2 |
| 8 | `.rbxl` fixtures incl. frozen current-Golem output | `tasks-visual/fixtures/` | tasks 11, 12 |
| 9 | Human calibration set + κ measurement | `tasks-visual/calibration/` | trusting any number |

Items 1–3 are prerequisites in Golem's own plugin, and are worth doing regardless: a Golem that
cannot see its own scene or read back a `SurfaceAppearance` also cannot *iterate* on visual
quality at runtime. The benchmark and the product need the same missing capability.

---

## 11. Task file schema

`tasks-visual/tasks.json` deliberately keeps `id`, `category`, `prompt`, `system`, `weight` from the
existing `tasks/<category>.json` shape so `loadTasks` conventions carry over, and adds:

```jsonc
{
  "id": "vis-09-monument",
  "category": "visual",
  "taskType": "monument",            // selects anchor ladder + metric bands
  "prompt": "...",                   // what the user would type
  "system": "...",                   // system prompt under test
  "weight": 2,
  "fixture": "flat-ground-256",      // or "baseplate" | "fixtures/<name>.rbxl"
  "heroObject": "the monument",      // for §4.2 focal identification
  "requestedObjects": [...],         // §4.18, matched by geometry not name
  "interactives": [...],             // §4.17 ground truth
  "capture": { "shots": [...], "playSettleSeconds": 3 },
  "structural": {
    "gates": [ { "metric": "...", "op": "...", "value": ..., "provenance": "DOC|DERIVED|PROV" } ],
    "bands": { "symmetryX": [0.5, 0.95], "propDensityPer1000Studs2": [5, 30] }
  },
  "dimensionWeights": { "silhouette": 2.0 },   // craft share still ≥60%, enforced
  "caps": ["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10"],
  "anchors": "anchors/monument",
  "forbidGeometryChange": false,      // true for vis-11
  "notes": "..."
}
```

`checks` (the existing `contains`/`regex`/`luau_syntax` array) remains **optional** and is used only
where a text assertion genuinely helps — e.g. `vis-11` asserting the response does not claim a
property it never set, reusing the discipline already in `prompts.ts`.

---

## References

[^mcp]: Roblox DevForum, "Assistant Updates: Mesh Generation, New MCP Server Tools, Screenshot Tool, and More", 2026-03-19 — introduces `screen_capture` ("captures the current Studio viewport in play mode and returns the image data"), `insert_from_creator_store`, `generate_mesh`, `generate_material`. https://devforum.roblox.com/t/assistant-updates-mesh-generation-new-mcp-server-tools-screenshot-tool-and-more/4527258
[^gen]: Roblox Creator Hub, `GenerationService` — `GenerateModelAsync`, `GenerateMeshAsync`, `LoadGeneratedMeshAsync`. https://create.roblox.com/docs/reference/engine/classes/GenerationService
[^unified]: Roblox DevForum, "Let There Be (Unified) Light! Unified Lighting is Fully Live" — `Lighting.Technology` deprecated; replaced by `LightingStyle` (`Realistic`/`Soft`) + `PrioritizeLightingQuality`; Future→Realistic, ShadowMap→Soft, Voxel removed; Studio beta 2025-01-21, fully live 2025-07-23. https://devforum.roblox.com/t/let-there-be-unified-light-unified-lighting-is-fully-live/3401512
[^design]: Roblox Creator Hub, "Design for performance" — "you need to stay below 1,000 draw calls and 1,000,000 triangles for the game to run well on your baseline device"; identical mesh/texture asset ids enable single-draw-call instancing. https://create.roblox.com/docs/performance-optimization/design
[^greybox]: Roblox Creator Hub, environmental art curriculum, "Greybox your environment" — ≥10-stud doorway/hallway width so two avatars pass concurrently; ≥10-stud wall height for camera clearance. https://create.roblox.com/docs/tutorials/curriculums/environmental-art/greybox-your-environment
[^construct]: Roblox Creator Hub, environmental art curriculum, "Construct your world" — published stud dimensions (hero spire `16 × 98 × 11` "creates a sense of scale distinct from player-sized objects"), the bounded RGB palette (mint `88,218,171`; carnation `255,170,255`; neutrals `248,248,248`, `233,218,218`, `181,173,156`, `91,93,105`; accent `255,170,0`), ~11 named MaterialVariants, and the "maximum three entrance or exit points" rule. https://create.roblox.com/docs/tutorials/curriculums/environmental-art/construct-your-world
[^curriculum]: Roblox Creator Hub, environmental art curriculum index — environmental art should "embody and facilitate gameplay requirements, immerse users within your game, and provide contextual information about the world itself." https://create.roblox.com/docs/tutorials/curriculums/environmental-art
[^pbr]: Roblox Creator Hub, "PBR textures" / surface appearance — Studio supports colour, normal, roughness, metalness and emissive maps; `MaterialVariant` for tileable materials, `SurfaceAppearance` for UV-mapped meshes. https://create.roblox.com/docs/art/modeling/surface-appearance
[^jump]: Roblox Creator Hub, `Humanoid.JumpHeight` — default 7.2 studs. https://create.roblox.com/docs/reference/engine/classes/Humanoid#JumpHeight
[^capture]: Roblox Creator Hub, `CaptureService` — `CaptureScreenshot(onCaptureReady)`, client-side. https://create.roblox.com/docs/reference/engine/classes/CaptureService
[^critique]: Roblox DevForum, "Why this build looks bad?" — community critique naming flat lighting ("needs more contrast, looks very flat"), uniform materials ("everything is the same material"), and missing detail layers. https://devforum.roblox.com/t/why-this-build-looks-bad/3117431
[^lego]: Nam et al., "LEGO-Eval: Towards Fine-Grained Evaluation on Synthesizing 3D Embodied Environments with Tool Augmentation", arXiv:2511.03001 — VLM-as-judge holistic F1 0.40 / Cohen's κ 0.05 vs tool-augmented 0.81 / 0.63; VLMs "frequently misidentify or fail to localize mentioned components". https://arxiv.org/abs/2511.03001
[^sceneeval]: Tam et al., "SceneEval: Evaluating Semantic Coherence in Text-Conditioned 3D Indoor Scene Synthesis", arXiv:2503.14756 — fidelity metrics (object count, attributes, spatial relations) plus plausibility metrics (collision, support, navigability, accessibility, out-of-bounds). https://arxiv.org/abs/2503.14756
[^infobias]: Zou, Sridhar, Safarzadeh, Roth, "When Vision-Language Models Judge Without Seeing: Exposing Informativeness Bias", arXiv:2604.17768, 2026-04-21 — VLM judges systematically favour lengthier, more detailed responses regardless of correctness; mitigations include reference answers, explicit quality-over-quantity instructions, and multimodal grounding. https://arxiv.org/abs/2604.17768
[^pairwise]: "Pairwise or Pointwise? Evaluating Feedback Protocols for Bias in LLM-Based Evaluation", arXiv:2504.14716, and related 2026 work on anchor-based aesthetic matching — pairwise protocols are consistently more accurate and stable than absolute pointwise scoring for visual-generation judging. https://arxiv.org/abs/2504.14716
