# World building and art direction (Lighting, Atmosphere, post-processing, Terrain, materials, scale, budgets)
_Researched 2026-10-04 by deep-researcher agent (Claude Sonnet 5.5). Sources: 74 (S74 is a search-result snippet only and was never opened)._

How to read provenance tags used below:
- `[S#]` = taken from that source. Docs sources S1-S31 were read from the official Creator Hub content (create.roblox.com/docs; the underlying markdown/YAML of github.com/Roblox/creator-docs, fetched 2026-10-04). Where the docs give only a property's meaning and no number, no number is claimed.
- `(derived)` = my own derivation or tuning choice. It is a starting point to be verified visually in Studio, not a documented value.
- `(stale)` = source older than 2024; the behaviour may have changed.
- Docs example values (for instance the tab labels in the Lighting guide) are demonstrations of one property in isolation, not recommended presets.

## Key facts

### Lighting technology, style and the 2025 migration
- `Lighting.Technology` (Voxel / ShadowMap / Future) is deprecated, non-scriptable and superseded by two properties: `LightingStyle` (Realistic or Soft) and `PrioritizeLightingQuality` (bool) [S2][S29][S32].
- Roblox's own migration map (Unified Lighting, fully live 2025-01-21, post updated 2025-07-23): Future becomes Realistic + PrioritizeLightingQuality ON; ShadowMap becomes Soft + PrioritizeLightingQuality ON; Voxel becomes Soft + PrioritizeLightingQuality OFF. Neither new property is scriptable [S32]. The Lighting class page confirms "Soft with that property enabled uses shadow maps rather than voxel lighting" [S2].
- `Soft` = "a flat, retro-Roblox look with softer lights and shadows"; `Realistic` = "the most advanced and realistic lighting and shadows Roblox can deliver" [S1][S29].
- `PrioritizeLightingQuality` true keeps advanced shadows and high-quality shaders at closer distances as the quality level drops; false keeps view distance instead. Docs say to set it true if lighting is central to the game's feel [S1].
- `Enum.Technology` still lists Voxel (4x4x4 voxel map), ShadowMap, Future; Compatibility and Legacy are deprecated and cannot be selected in Studio. The old "Compatibility" look is now recreated with Voxel lighting plus a `ColorGradingEffect` set to the `Retro` tonemapper preset [S29].
- `GlobalShadows` "toggles voxel-based dynamic lighting". Each lighting voxel is 4x4x4 studs, so objects must be larger than 4x4x4 studs to cast a realistic voxel shadow; shadows are recalculated when parts move. With GlobalShadows off, no indoor/outdoor distinction exists and `Ambient` is applied everywhere while `OutdoorAmbient` is ignored [S2].
- `OutdoorAmbient` default [127,127,127]; `Ambient` default [0,0,0]; the effective OutdoorAmbient is clamped to be at least Ambient per channel [S2]. `ShadowSoftness` default 0.2, documented range 0 (hard) to 1 (soft) [S1][S2]. The class page says it needs ShadowMap/Future-class lighting; the guide says Realistic style [S1][S2] (same thing after migration).
- `EnvironmentDiffuseScale` and `EnvironmentSpecularScale` both default to 0 and range 0 to 1. Diffuse = ambient derived dynamically from the sky/time of day; when raising it, lower Ambient/OutdoorAmbient accordingly. Specular near 1 makes smooth objects reflect the environment and metal look right [S1][S2].
- `ExposureCompensation` default 0, range -5 to 5, applied before tonemapping; +1 = twice the exposure, -1 = half [S2].
- `Brightness` = intensity of the sun/moon light; the Lighting guide demonstrates 0.5, 1.5 and 3.75 [S1]. A 2020 tutorial says the default was 2 (stale) [S52]. The Studio template defaults for a new place are not documented in the text I read (unverified).
- `ClockTime` (0-24, NotReplicated in the reference) and `TimeOfDay` ("HH:MM:SS" string) are linked; neither follows real time; both change only via script. Docs examples: 0 = 00:00:00, 6.3 = 06:18:00, 17 = 17:00:00 [S1][S2]. `SetMinutesAfterMidnight` also changes both [S2]. `GeographicLatitude` (degrees) moves the sun/moon path without changing the clock [S1][S2]. A community module varies day length by latitude and says not to use the Lighting properties at the same time [S72].
- Light range: PointLight/SpotLight/SurfaceLight `Range` limit doubled from 60 to 120 studs on 2025-09-23; one 120-range light can replace several small ones; scripts that set Range above 60 now behave differently [S33]. `Lighting.ExtendLightRangeTo120` is unused [S2]. A 2020 post gave the then-limit as 60 and per-pixel local lights as limited per frame, with spot shadows cheapest and point shadows most expensive (stale) [S59].
- A customizable voxel light grid (2x2x2 or 1x1x1 instead of 4x4x4) was requested in Oct 2025; a roadmap item for a "new voxel light grid" was reported as on hold; no staff reply captured [S44].

### Atmosphere, fog, sky, clouds, wind
- `Atmosphere` (child of Lighting) has six properties: Density, Offset, Haze, Color, Glare, Decay. No defaults or numeric ranges are printed in the docs text I read [S3][S4]. Docs demo values: Density 0 vs 0.35; Offset 0 vs 1; Haze 1 vs 2.8; Color [255,255,255] vs [255,200,255]; Glare 0 vs 1; Decay [255,255,255] vs [255,90,80] [S3].
- Density only directly affects objects/terrain (not the skybox); higher = more obscured. Offset: high gives a horizon silhouette, low blends distant objects into the sky; a very low Offset can let the skybox show through objects, a very high one leaves distant terrain too detailed; balance it against Density [S3][S4].
- Glare needs Haze > 0 to show; Decay needs both Haze > 0 and Glare > 0; Color is best combined with high Haze [S3][S4].
- Fog properties (`FogColor`, `FogStart`, `FogEnd`) are hidden when Lighting contains an Atmosphere [S2][S4]. Whether the fog still renders at runtime when both exist is not stated (unverified). A 2020 horror tutorial used black fog with FogEnd 25 and FogStart 0 (stale) [S54]; a 2020 tutorial said FogEnd defaults to 100000 and 1000-2000 gives mild background fog (stale) [S52].
- `Sky`: six cube faces (SkyboxBk/Dn/Ft/Lf/Rt/Up), seamless along all edges; sun, moon and stars follow the clock. Defaults: SunAngularSize 21, MoonAngularSize 11 (range 0-60), `CelestialBodiesShown` true; set a body's angular size to 0 to hide only that body; `StarCount` sets stars; `SkyboxOrientation` rotates faces (not celestial bodies) and is low-cost on all platforms [S7]. Default face textures are named "sky512" (512-pixel class) (derived from asset names in [S7]). Community: render custom faces at 1024 or 2048 px, square, 90-degree FOV per face; an Atmosphere is needed so Clouds do not render faintly (2024) [S63].
- `Clouds` only render when parented to `Terrain`. Properties: Cover 0 to 1, Density (low = light translucent, high = dark stormy), Color (but cloud colour is also driven by Lighting and Atmosphere, so Clouds.Color is not the tool for coloured sunsets), Enabled. Docs demo values: Cover 0.65 and 0.8; Density about 0.05-0.1 and 0.3-0.4 (the guide's labels and alt text disagree); Color [255,255,255] vs [75,50,255] [S8].
- `Workspace.GlobalWind` (Vector3) drives terrain grass, dynamic clouds and particles (ParticleEmitters with WindAffectsDrag and Drag > 0; Fire/Smoke by default). Grass speed is reduced by the Reduce Motion accessibility setting [S9][S10].

### Post-processing
- Effects parented to Lighting show to all players; parented to the player's Camera, only to that player (use for menu blur, damage tint) [S5]. In Studio, effects may not appear unless Editor Quality Level is high [S5].
- Classes: BloomEffect, BlurEffect, ColorCorrectionEffect, DepthOfFieldEffect, SunRaysEffect, ColorGradingEffect [S5].
- Bloom: Intensity (additive strength), Size (radius in px; 0 disables the spread but not colour adjustment), Threshold (0 = everything blooms, 1 = only pure white) [S6]. A 2026 third-party tutorial uses Size 20-30 and Threshold 1.5-2 (so thresholds above 1 are in use; docs describe 0-1) [S66].
- ColorCorrection: Brightness (-1 black to 1 white), Contrast (<0 less, >0 more), Saturation (>1 more vivid per docs wording; <0 duller; -1 fully desaturated), TintColor (multiplicative; [255,0,0] zeroes green and blue) [S6]. Docs literally say values above 1 give vivid colours, while community practice uses small positive values; treat saturation above about 0.5 as strong (derived).
- DepthOfField: FocusDistance (studs), InFocusRadius (studs each side with no blur), NearIntensity, FarIntensity [S6]. DoF and refraction/reflection work best on fully opaque surfaces [S14].
- SunRays: Intensity (0-1 visibility), Spread (keep within 0-1; outside is undefined) [S6]. The rays follow ClockTime and are shaped by objects between camera and sun [S5].
- ColorGradingEffect: `TonemapperPreset` Default (post-2019 vivid, high-contrast) or Retro (pre-2019: less saturated, less contrast; for a full retro look also keep all light brightness at most 1.0) [S5].
- There is no official posterise/colour-banding or pixelation effect (feature request, Jan 2024) [S69].
- Underwater and menu blur: BlurEffect.Size is in pixels [S6].

### Terrain
- Smooth terrain is a grid of 4x4x4 stud voxels; `Terrain.IsSmooth` is always true (legacy engine removed) [S10][S11]. `MaxExtents` spans +/-32000 cells = +/-128,000 studs per axis [S11].
- Terrain Editor tools: Generate (biomes: Arctic, Dunes, Canyons, Lavascape, Water, Mountains, Hills, Plains, Marsh), Import (heightmap and optional colormap), Select/Transform/Fill/Sea Level, and brush tools Draw, Sculpt, Smooth, Flatten, Paint; brush base size 1-64 studs; shapes sphere/box/cylinder [S10].
- Heightmap import: 1 pixel = 4 studs, max 4096x4096 px (.jpg or .png), so one import spans at most 16,384 studs per side (derived from [S10]). Height = selection region's Y size mapped between darkest and lightest pixel (for Y = 128, black is 64 studs below centre and white 64 above) [S10]. A colormap needs hard-edged exact colours from the Roblox colour key (examples: Grass [106,127,63], Water [12,84,92], Snow [195,199,218], Sand [143,126,95], Mud [58,46,36], Rock [102,108,111]); unlisted colours snap to the nearest material [S10].
- Water properties on `Terrain` (defaults from the class page): WaterColor [0.05, 0.33, 0.36] (dark teal), WaterReflectance 1 (0-1), WaterTransparency 0.3 (0-1), WaterWaveSize 0-1 (max wave height in studs), WaterWaveSpeed 0-100 (up/down cycles per minute) [S11]. Some water properties only preview in playtest unless Editor Quality Level is max [S10].
- Since June 2021, WaterTransparency also controls underwater fog distance: value 1 now means about 2000 studs of visibility (was about 200); the staff post says to divide old values by 10; transparency changes also affect the surface look (2021) [S47]. Since Nov 2020 underwater brightness follows TimeOfDay and Ambient, so night-time underwater scenes are much darker (2020) [S48].
- Grass: `Terrain.Decoration` true plus `GrassLength` 0.1-1 animates blades on the Grass material; wind via GlobalWind [S10].
- `MaterialColors` is edited through `Terrain:SetMaterialColor(material, color)` / `GetMaterialColor` (the property itself is not scriptable) [S10][S11]. Scripted creation: FillBall/FillBlock/FillCylinder/FillRegion/FillWedge, ReplaceMaterial, ReadVoxels/WriteVoxels [S10][S11].
- Terrain cost: a default terrain baseplate was measured by a developer at over 108,000 triangles and 247 draw calls (June 2025, third-party measurement); a Roblox engineer replied that 100K triangles is not a lot and fragment shading or memory are likelier costs [S42]. A 2024 optimisation guide says terrain "chews up" budget through high default triangle counts and per-material draw-call fragmentation [S41]. A 2026 guide says filled terrain performs better than hollow terrain [S40].
- Coming: Sept 2026 announcement of an Early Access Program for terrain object scattering, path splines, projected PBR terrain decals, virtual texturing and signed-distance-field edges; roadmap places these at Mid 2027 [S34][S35]. No class names yet; do not script against them.

### Materials, MaterialVariant, PBR
- Default `Part.Material` is Plastic. Roblox materials carry physical behaviour as well as looks [S12]. Built-in materials use far less memory than custom textures [S27][S40].
- Built-in texel density: parts show 1024x1024 across an 8x8 stud face; terrain 512x512 across 8x8 studs [S15].
- `MaterialVariant` (child of `MaterialService`) = reusable tileable PBR material (ColorMap, NormalMap, RoughnessMap, MetalnessMap, EmissiveMaskContent/Strength/Tint, AlphaMode, StudsPerTile, MaterialPattern, BaseMaterial, CustomPhysicalProperties). `SurfaceAppearance` = PBR for one specific UV-mapped MeshPart [S12][S13][S14].
- On parts, the variant is referenced by name (`Part.MaterialVariant`), so renaming after applying breaks the link; same-named variant sets can be swapped to restyle a place ("adaptive materials") [S12]. Terrain can take a custom material only as a material override (global per place; one variant per base material) via `MaterialService.<Material>Name` properties and optional `TerrainDetail` faces (top/side/bottom) [S12][S13].
- `MaterialService.Use2022Materials` switches the built-in pack (not scriptable) [S13].
- Glass refraction is not supported on mobile [S12]. Neon and ForceField are unique shaders and other materials' texture asset IDs are listed in [S12] (not repeated here).
- Physical defaults worth knowing (density / elasticity / friction): Plastic 0.7/0.5/0.3; SmoothPlastic 0.7/0.5/0.2; Wood 0.35/0.2/0.48; Metal 7.85/0.25/0.4; Concrete 2.403/0.2/0.7; Ice 0.919/0.15/0.02; Rubber 1.3/0.95/1.5; Snow 0.9/0.03/0.3; Mud 0.9/0.07/0.3; Sand 1.602/0.05/0.5; Grass 0.9/0.1/0.4; Marble 2.563/0.17/0.2; Asphalt 2.36/0.2/0.8 [S12]. Per-part CustomPhysicalProperties beat the variant's, which beats a material override, which beats defaults [S12].
- PBR maps: Color (albedo), Normal (OpenGL tangent-space only; flat = [127,127,255]), Roughness, Metalness (use 0% or 100% mostly), Emissive mask; SurfaceAppearance properties generally cannot be changed by scripts in-game [S14][S15]. `AlphaMode`: Overlay (default), Transparency, TintMask, and Opaque (beta). For cut-out foliage use MeshPart.Transparency 0; for soft semi-transparent detail use at least 0.02 [S14]. `SurfaceAppearance.Color` tint multiplies the colour map, so near-white greyscale maps tint best and one map can be reused with many tints for cheap variety [S14].
- Reference roughness/metalness values (docs clothing examples): leather 0.62/0.0, brass 0.25/1.0, silk 0.52/0.3, denim 0.9/0.0, cotton 0.8-0.9/0.0, fur 0.75/0.0, steel 0.25/1.0, tarnished steel 0.33/1.0 [S16]. Docs warn not to tune values for one lighting setup, and that fresnel may make rough surfaces slightly specular (add about 0.1 roughness to compensate) [S14].
- Emissive masks (studio beta Oct 2025, live in published experiences Feb 2026): grayscale mask, EmissiveStrength (suggested range 0 to 40) and EmissiveTint on SurfaceAppearance, MaterialVariant and TerrainDetail; formula quoted as (mask x strength x tint + light) x colour map [S37][S14].
- Texture resolution: docs guidance is 256x256 per 2x2x2 studs of asset, next size up if larger; 5x5 stud object 256, 10x10 512, 20x20 1024; accepted formats .png/.jpg/.tga/.bmp; one material per mesh [S15]. Curriculum says 1024 is the practical maximum and cost rises toward it [S24]. 4K (4096) textures are supported via texture streaming since 2026-01-30; imports up to 8K but transcoding caps at 4K [S36]. The texture-specification page itself says both "up to 4096" and "up to 1024 for texture maps" (inconsistent) [S15]. Keep to the small sizes anyway for memory.
- Mesh limits: 20,000 triangles per mesh; meshes must be watertight with volume; single UV set within 0..1 [S17]. A May 2026 request to raise the limit had no staff reply [S43].

### Avatar-relative scale (documented numbers)
- 1 stud = 28 cm; 1 RMU = 21.952 kg [S21][S45].
- Humanoid defaults: WalkSpeed 16 studs/s; JumpHeight 7.2 studs (UseJumpPower false) or JumpPower 50 (0-1000); MaxSlopeAngle 89 degrees (clamped 0-89); AutoJump only on touch devices; Workspace.Gravity 196.2 studs/s^2 [S19][S20]. R15 height = 0.5 x RootPart.Size.Y + HipHeight [S19].
- The environmental-art curriculum keeps every doorway and hallway at least 10 studs wide (two avatars can pass) and every wall at least 10 studs tall, and states a "default jump height of 5 studs" [S23]. That 5 conflicts with the 7.2-stud JumpHeight in the Humanoid reference [S19]; use 7.2 for obby/gap maths and keep the 10-stud wall as a safe rule.
- PathfindingService default agent: radius 2, height 5, waypoint spacing 4 (gaps under 5 studs high are non-traversable) [S22].
- Custom avatar body limits (studs, whole body): Classic max 8 x 9.1 x 2, minimum 1.35 x 3.6 x 0.7; Rthro Normal max 8.6 x 9.5 x 2.25; Slender max 6 x 9.5 x 2. These are bounds for UGC bodies, not the default avatar [S18]. Per-asset triangle budgets: Head 4000, torso 1750, each limb 1248, total 10,742 [S18].
- A community figure for the classic avatar is about 5.12 studs tall (2018, stale, unverified by docs) [S46].
- Parts: size per axis 0.001 to 2048 studs; below 0.05 is simulated as 0.05 [S30]. Default camera FieldOfView 70 (clamped 1-120) [S30].
- Curriculum modular kit: grid snap 5 studs and 90 degrees, every kit piece at least 5 studs and divisible by the smallest piece [S23][S24]. Sample map pieces (read via an automated summary, treat as approximate): stair steps 3 x 1 studs, floors about 6 thick, ceilings near 20 studs, roof near 28.5, a hero tower about 98 tall, planters 20 wide by 11 high [S25].
- Community maps: primary routes 32 studs wide; walls 3x-4x player height; roof overhangs 2-3 studs; a 400x400 baseplate for compact FPS maps [S60]. Open worlds: points of interest about 40 seconds of travel apart; loot within 15-20 s of paths; distinct biomes with their own palettes [S61].
- Derived travel numbers: 40 s at 16 studs/s is about 640 studs between points of interest (derived). Airtime of a 7.2-stud jump under 196.2 gravity is 2 x sqrt(2 x 7.2 / 196.2) = 0.54 s, so an ideal running jump covers about 8.7 studs at 16 studs/s (derived; ignores acceleration and landing forgiveness, so design gaps at most 6 studs for normal difficulty, 7-8 for expert) (derived). Ledge height reachable by a jump is 7.2 studs; design climbable steps at 5-6 studs or less (derived).

### Performance budgets and rendering behaviour
- Documentation example for a low-end baseline: stay under about 1,000 draw calls and 1,000,000 triangles (an illustration of finding your device's limit, not a Roblox mandate) [S27].
- Mid-2024 community budget from a veteran mobile developer (MrChickenRocket, "Cardboard Box Simulator"): 500,000 triangles and 500 draw calls in scene, 60 FPS on 90%+ of phones at Graphics Quality 10, under 1.3 GB client memory, under 50 KB/s network, 40-60 moving assemblies; per zone 40,000 triangles and 40 draw calls with at most 8 zones visible; typical view about 100 draw calls and 150k triangles; UI under about 150 draw calls; shadows counted separately; third-party but widely cited (633 likes) [S41].
- A May 2026 optimisation tutorial: 16.67 ms frame for 60 FPS, 8.33 ms for 120 FPS; one light beats many overlapping lights; avoid partial transparency (use 0 or 1) to prevent overdraw [S40]. Roblox docs say the same about transparency and add: avoid overlapping semi-transparent parts [S27][S28][S30].
- Identical MeshParts batch into one draw call (instancing) only when MeshContent matches and SurfaceAppearance (or TextureContent, or material) matches; importing a whole scene as one file creates different asset IDs per copy and kills instancing; decals, textures and particles batch poorly [S28]. Convert assets to packages [S27].
- `RenderFidelity` Automatic (default): highest detail under 250 studs, medium 250-500, lowest 500+; Precise costs triangles everywhere [S30][S62].
- Shadow quality degrades automatically with quality level and shadows are disabled below graphics quality 4; reduce cost with `CastShadow` off on tiny or distant parts (can cause artifacts), Light.Shadows off, smaller Range/Angle, fewer lights [S28][S30]. At most 255 `Highlight` instances display at once [S30].
- Instance streaming is on by default in new places; StreamingMinRadius 64, StreamingTargetRadius 1024 studs. SLIM (client beta since Oct 2025; needs StreamingEnabled, a place saved to Roblox and Team Create; set `Model.LevelOfDetail` to SLIM) renders composite low-detail stand-ins for streamed-out models [S31][S38]. Mesh Streaming (opt-in April 2026, default planned July 2026) cut triangles from about 1.08M to about 403K in the demo scene [S39]. Roadmap: minimum draw distance on low-end devices rising to 500 studs (late 2026) [S35].
- Shadow-casting lights and fancy lighting cost more on mobile: ShadowMap performs better than Future on mobile (2024) [S41]; per-pixel local lighting falls back on unsupported devices (2020) [S59].

## How to apply it (rules for an AI builder)

Lighting and style
- DO pick the style first, before touching colours. Stylised/cartoon/obby/tycoon = `LightingStyle` Soft (PrioritizeLightingQuality false for max view distance on phones; true if shadow quality defines the look). Realistic/horror/atmospheric = Realistic + PrioritizeLightingQuality true [S1][S32].
- DON'T try to set `LightingStyle` or `PrioritizeLightingQuality` from a game script; they are non-scriptable [S32]. In a Studio-automation context set them in the Properties panel or tell the owner; whether a plugin or command bar can write them is unverified.
- DO set time via `Lighting.TimeOfDay = "HH:MM:SS"` or `ClockTime`; remember neither moves on its own; script a cycle with TweenService [S1][S2]. For server-driven cycles prefer writing on the server and verify clients see it (ClockTime is NotReplicated in the reference [S2]; verification in a live test is needed).
- DO keep Ambient <= OutdoorAmbient per channel if you want shadows to look different outdoors vs indoors [S2].
- DO raise EnvironmentSpecularScale toward 1 when the scene has metal or glossy surfaces; leave 0 for flat cartoon looks [S1][S2].
- DON'T stack extreme values in several places (Brightness 3.75 + ExposureCompensation 1.25 + high Bloom); a community guide notes low ExposureCompensation needs higher Brightness and works only for daytime (2021) [S57]. Change one control at a time.
- DO test effects at max Editor Quality Level; otherwise Bloom/DoF/SunRays/water may not show in Studio [S5][S10].

Atmosphere, fog, sky
- DO use an `Atmosphere` for modern depth haze; remember FogStart/FogEnd/FogColor are hidden when one exists [S2]. Use plain fog only when you want a hard "black wall" fade without an Atmosphere (classic horror).
- DO use Density about 0-0.35 as the documented demo band; go beyond only deliberately for opaque murk (derived).
- DO set Haze > 0 before judging Glare or Decay; they do nothing otherwise [S3][S4].
- DO add a Sky (and Atmosphere) when using Clouds; parent Clouds to Terrain [S8][S63].
- DON'T colour sunsets with `Clouds.Color`; drive them with ClockTime, OutdoorAmbient, ColorShift_Top and Atmosphere Color/Decay [S8].
- DO match FogColor (or Atmosphere Color) with the sky's horizon colour to avoid a visible seam (derived).

Post-processing
- DO keep effects subtle: one Bloom, one ColorCorrection, optionally SunRays; add DepthOfField only for cinematic/menu shots (derived, [S58][S66]).
- DO parent per-player effects (menu blur, damage tint) to `Workspace.CurrentCamera`, global look to Lighting [S5].
- DON'T set SunRays.Spread outside 0-1 [S6].
- DO put lights/glow on Neon parts or emissive masks and tune Bloom Threshold so only emitters bloom (derived).

Terrain
- DO block out with parts, then convert/sculpt terrain; use Generate for large biomes, Import for known shapes, brushes for detail [S10][S64].
- DO keep heightmaps within 4096 px (16,384-stud span) and set the Y size deliberately [S10].
- DO colour terrain with `Terrain:SetMaterialColor` for palette control and enable `Decoration` only on Grass material areas [S10][S11].
- DO keep water look in terrain properties: WaterColor/Transparency/Reflectance/WaveSize/WaveSpeed [S11]. After the 2021 change, small WaterTransparency values make underwater murky; 1 = about 2000 studs visibility [S47].
- DON'T build huge hollow terrain shells or unnecessarily high-resolution terrain on mobile games; filled terrain and fewer materials per view cost less [S40][S41].

Materials and textures
- DO prefer built-in materials; add custom textures only where they define the look [S27][S40].
- DO reuse MeshIDs and texture IDs; never import a whole scene as one asset if pieces repeat [S28][S62].
- DO name MaterialVariants with the base material first (GrassWet, GrassDry) so adaptive swapping works [S12].
- DO size textures by object size (256 per 2x2x2 studs, next size up if larger) [S15]; don't use 4K on small objects [S40].
- DO use alpha cut-outs (Transparency 0) for foliage rather than partially transparent parts [S14][S27].
- DON'T tune PBR roughness/metalness to one lighting setup; use physical values (metal 0 or 1) [S14].

Scale and level design
- DO measure against the character: avatar is about 5 studs tall in practice (community, unverified), default agent height 5; walk 16 studs/s, jump 7.2 studs, gravity 196.2 [S19][S20][S22][S46].
- DO make doorways/hallways at least 10 studs wide where two players must pass and walls at least 10 studs tall for blockers; single-file gates can be 6-8 wide by 9-10 tall (derived); absolute minimum for the default agent is about 4 wide by 5 high (derived from agent radius 2 and height 5 [S22]).
- DO scale rooms and objects 1.5x-2x larger than real proportions for third-person comfort (2018 community advice, stale) [S46].
- DO keep movement distances readable: points of interest about 40 s apart, lanes 32 studs wide for PvP, no more than three exits per combat pocket [S23][S60][S61].
- DO guide players with landmarks at decision points (corners, forks), curved multi-direction paths, and peaks and valleys that control sightlines [S23][S61][S64].
- DO design three depth layers (derived): foreground 0-50 studs hero detail and interactables; midground 50-250 studs the playable architecture at full mesh fidelity (RenderFidelity Automatic switches at 250 [S30]); background 250+ studs silhouettes, terrain, skybox blended by Atmosphere Offset/Density [S3].
- DO snap greybox to 5 studs/90 degrees and use a kit grid divisible by 5 [S23][S24].
- DO give biomes distinct palettes and keep palette discipline (3-5 hues plus neutrals) (derived; a documented example palette is team colours mint [88,218,171], carnation [255,170,255], concrete [181,173,156], white [248,248,248] [S25]).

Performance
- DO budget for the baseline phone: about 500k triangles and 500 draw calls visible, UI under 150 draw calls [S41]; check with Shift+F2 render stats and the MicroProfiler [S27][S28].
- DO avoid partial transparency overlap; foliage as opaque cutouts [S27][S28][S30].
- DO limit shadow-casting lights; use one 120-range light instead of many small ones where it fits [S33][S40].
- DO enable StreamingEnabled (default for new places) and consider SLIM and Mesh Streaming for big worlds [S31][S38][S39].

## Recipes (each becomes a skill)

### Recipe 1: Lighting foundation and look-switcher
When to use: first step of any visual pass; also to switch between looks at runtime.
Steps:
1. Decide style. Cartoon/obby/tycoon: LightingStyle Soft (PrioritizeLightingQuality false for mobile reach). Horror/realistic/neon city: Realistic + PrioritizeLightingQuality true [S32]. Set these two in the Properties panel (not scriptable).
2. Ensure children of `Lighting`: one `Sky`, one `Atmosphere`, `BloomEffect`, `ColorCorrectionEffect`, optional `SunRaysEffect`, optional `DepthOfFieldEffect`. Under `Workspace.Terrain` add `Clouds` if wanted.
3. Apply a look table (see Luau reference snippet "applyLook") with Lighting, Atmosphere, effect and Terrain values; tween between looks with TweenService (1-3 s).
4. Playtest at default Studio quality and at a low mobile-like level; check Shift+F2 numbers.
Pitfalls: effects invisible at low Editor Quality; fog hidden when Atmosphere present; Soft and Realistic respond differently to ShadowSoftness and EnvironmentDiffuseScale; ClockTime NotReplicated (verify in a live server/client test).

### Recipe 2: Sunny cartoon
When to use: obby, tycoon, simulator, kid-friendly lobbies.
Values (all derived unless tagged; start here, then tune visually):
- LightingStyle Soft; PrioritizeLightingQuality false (cheapest, longest view distance) [S32 mapping]. Alternative flat look: Brightness 0, Ambient and OutdoorAmbient [255,255,255], GlobalShadows false, CastShadow off, parts SmoothPlastic (2021 community recipe, stale, shows ambient occlusion artefacts at high quality) [S55].
- Lighting: ClockTime 14; Brightness 2.5; Ambient [100,100,115]; OutdoorAmbient [150,150,160]; ColorShift_Top [255,244,214]; ColorShift_Bottom [0,0,0]; EnvironmentDiffuseScale 0; EnvironmentSpecularScale 0; ExposureCompensation 0; GlobalShadows true; ShadowSoftness 0.2 (default [S2]).
- Atmosphere: Density 0.2; Offset 0.3; Haze 0.4; Glare 0; Color [205,225,255]; Decay [160,190,230].
- Bloom: Intensity 0.25; Size 24; Threshold 0.95. ColorCorrection: Saturation 0.2; Contrast 0.08; Brightness 0; TintColor [255,255,255]. SunRays: Intensity 0.06; Spread 0.8.
- Clouds (on Terrain): Cover 0.5; Density 0.15; Color [255,255,255] (doc demos 0.65/0.8 cover [S8]).
- Terrain: Decoration true; GrassLength 0.5; SetMaterialColor(Grass, [110,180,60]); Water: WaterColor [40,170,200] (as Color3.fromRGB); WaterTransparency 0.4; WaterReflectance 0.4; WaterWaveSize 0.15; WaterWaveSpeed 10. Default grass colour in the colour key is [106,127,63] [S10], so this is a more saturated variant.
- Parts: Plastic or SmoothPlastic, saturated mid-value colours, no PBR needed.
Pitfalls: over-bright Brightness plus Bloom blows out light colours; keep Threshold high. Voxel-style shadows need parts larger than 4 studs to show [S2].

### Recipe 3: Night horror
When to use: horror, survival, backrooms/liminal spaces.
Values:
- LightingStyle Realistic; PrioritizeLightingQuality true.
- Documented pitch-dark knobs: ClockTime 0, Brightness 0, EnvironmentDiffuseScale 0, OutdoorAmbient black, SunRays Intensity 0.02 and Spread 0 (2022 community) [S53]; set Brightness 0.3 if you still want a faint moon-light on geometry (derived).
- Ambient [8,8,12] and OutdoorAmbient [6,6,10] (derived; one vendor tutorial snippet suggests [10,10,14] and [8,8,12], low trust) [S74]. Never go to pure black Ambient on low-end phones without a player light (derived).
- Visibility route A, fog (no Atmosphere): FogColor [5,5,8]; FogStart 0; FogEnd 25-60 (25 from a 2020 tutorial [S54]; 60 from [S74]; pick by gameplay; 40 is a safe middle) (derived).
- Visibility route B, Atmosphere: Density 0.5; Offset 0; Haze 2; Glare 0; Color [20,22,30]; Decay [10,10,20] (Density 0.55 and Haze 2 appear in [S74]; the rest is derived).
- Post: ColorCorrection Saturation -0.3, Contrast 0.15, TintColor [210,220,255]; Bloom Intensity 0.3, Size 20, Threshold 1; SunRays near zero. Optional DepthOfField: FocusDistance 30, InFocusRadius 15, FarIntensity 0.2, NearIntensity 0 (derived).
- Light sources: flashlight as SpotLight (Range 40-60, Angle 60, Brightness 2, Shadows true) parented to the tool/head; practical lights as PointLight Brightness 0.5-0.8, Range 10-15 for candles and 20-30 for ceiling lamps [S66] (candle and ceiling ranges from a 2026 third-party tutorial). Max Range is 120 [S33]. Keep few shadow-casting lights [S28].
- Design rule from community: darkness plus small guiding lights beats total darkness; use lamps to lead the player to objectives [S54].
Pitfalls: GlobalShadows and shadow cost; fog and Atmosphere do not both apply cleanly (unverified; use one); moon texture invisible at Brightness 0 unless EnvironmentDiffuseScale approach is used [S53].

### Recipe 4: Foggy forest
When to use: survival, exploration, woodland horror, cosy mist.
Values (derived unless tagged):
- Style: Realistic + PrioritizeLightingQuality true for the crepuscular rays and soft shadows; Soft false/true for a stylised misty look.
- Lighting: ClockTime 7; Brightness 1.5 (a doc demo value [S1]); Ambient [40,50,45]; OutdoorAmbient [95,110,100]; ColorShift_Top [255,235,200]; EnvironmentDiffuseScale 0; ExposureCompensation 0.
- Atmosphere: Density 0.35 (top of the documented demo band [S3]); Offset 0; Haze 2.5 (documented demo up to 2.8 [S3]); Glare 0.2; Color [170,190,180]; Decay [110,130,120].
- Clouds (Terrain): Cover 0.8; Density 0.3 [S8 demo values]. GlobalWind small (for example Vector3.new(3,0,1)) so grass and clouds drift [S9] (magnitude derived).
- Post: ColorCorrection Saturation -0.15, Contrast 0.05, TintColor [225,240,230]; SunRays Intensity 0.15, Spread 0.9; Bloom Intensity 0.2, Size 24, Threshold 1; optional DepthOfField FocusDistance 60, InFocusRadius 40, FarIntensity 0.15.
- Terrain: materials LeafyGrass, Ground, Mud, Rock; Decoration true, GrassLength 0.8; SetMaterialColor on Ground/Mud toward darker greens/browns.
- Trees: reuse 2-4 unique tree MeshIDs; RenderFidelity Automatic; CastShadow false on small foliage; leaf cards as opaque cutouts (AlphaMode Transparency with MeshPart.Transparency 0) [S14][S62][S26].
- Fog doubles as a performance tool: dense haze hides draw-distance pops and lets StreamingTargetRadius stay near default 1024 (derived).
Pitfalls: low Offset makes distant terrain dissolve into the sky; too-high Density hides gameplay targets; DepthOfField needs opaque surfaces [S14].

### Recipe 5: Neon city night
When to use: cyberpunk hubs, racing, club/lobby maps.
Values (derived unless tagged):
- Style: Realistic + PrioritizeLightingQuality true.
- Lighting: ClockTime 0; Brightness 0.5; Ambient [30,15,70] (deep violet; docs demo Ambient [25,0,125] is the saturated version [S1]); OutdoorAmbient [40,30,90]; ColorShift_Top [0,255,190] and ColorShift_Bottom [255,0,220] (these are the docs' demo hues for the two properties [S1]; use at reduced strength by mixing toward grey if too loud); EnvironmentSpecularScale 1 (wet, glossy reflections [S1]); EnvironmentDiffuseScale 0.
- Atmosphere: Density 0.3; Offset 0.1; Haze 1.8; Glare 0; Color [90,40,160]; Decay [255,60,200].
- Post: Bloom Intensity 0.7, Size 28, Threshold 0.85 (size 20-30 per [S66]; adjust threshold so only neon/emissive surfaces bloom); ColorCorrection Saturation 0.3, Contrast 0.2, TintColor [235,225,255]; optional DepthOfField on cinematic cameras.
- Emitters: Neon material on sign parts for all-or-nothing glow; for textured signage use an emissive mask on SurfaceAppearance/MaterialVariant with EmissiveStrength roughly 2-10 for gentle glow and up to 40 maximum (range [0,40] suggested [S37]; the 2-10 band is derived), EmissiveTint for colour.
- Wet street: Asphalt or SmoothPlastic base with a MaterialVariant roughness map around 0.2-0.35 and metalness 0 (derived; reference roughness values in [S16]); keep Reflectance low because it may be ignored by some materials [S30].
- Lights: PointLight Range 20-30 coloured (magenta, cyan), shadows off except hero lights; one 120-range light can cover a plaza [S33][S66].
Pitfalls: many shadowed lights wreck mobile frame time [S28][S40]; Bloom Threshold too low turns the whole scene into haze; Neon colours get washed out by high Atmosphere Haze.

### Recipe 6: Underwater (terrain water plus submerged camera)
When to use: ocean levels, swimming, fishing.
Steps:
1. Terrain water: use the Sea Level tool or `Terrain:FillBlock(cf, size, Enum.Material.Water)`. Set WaterColor (default [0.05,0.33,0.36]); WaterTransparency 0.05-0.3 for murky depth (1 = about 2000 studs visibility after the 2021 change [S47]); WaterReflectance 0.3-1; WaterWaveSize 0.1-0.3; WaterWaveSpeed 5-15 (ranges derived from the documented limits [S11]).
2. Time of day matters underwater: brightness follows ClockTime and Ambient; raise Ambient if night scenes become unplayable [S48].
3. Normal Lighting fog does not render underwater; a community report suggests tuning WaterTransparency (for example 0.02) for a dimmer murk instead (2023) [S51].
4. When the camera is submerged, enable a Camera-parented look: ColorCorrection TintColor [11,143,213], Contrast 0.5, Brightness 0.4, Saturation 0.6 [S49] (2021 community values; strong, consider halving Contrast/Brightness (derived)) plus BlurEffect.Size about 10 tweened over 0.3 s [S50] (2021). Swap ambience to the underwater reverb and fade a loop sound [S49].
5. Detect submersion via the voxel at the camera (snippet below) or Humanoid swimming state.
6. Add light shafts/caustics only with a few lights; use SunRays low (0.05) near the surface (derived).
Pitfalls: partial-transparency particle bubbles add overdraw [S27]; WaterTransparency also affects the surface appearance [S47]; some water properties preview only in playtest [S10].

### Recipe 7: Sunset / golden hour
When to use: lobby intros, cinematic loops, end-of-round scenes.
Values (derived unless tagged; documented demo values noted):
- Style: Realistic + PrioritizeLightingQuality true.
- ClockTime about 17.6 (sun low; the docs show 17 as an afternoon example [S1]); GeographicLatitude changes the sun's arc; check with Lighting:GetSunDirection() if needed [S2].
- Golden hour principle from the community: hazy atmosphere, intense sun, visible but not too dark shadows; warm ColorShift_Top and purple OutdoorAmbient [S56] (2023).
- Brightness 2.5; ExposureCompensation 0.25; Ambient [60,40,70]; OutdoorAmbient [200,150,240] (docs demo for evening-cool [S1]); ColorShift_Top [255,140,60] (the docs demo uses a harsher [255,60,0] [S1]); ColorShift_Bottom [90,60,140]; EnvironmentDiffuseScale 0.2 (lower the two ambients if you raise it [S2]).
- Atmosphere: Density 0.33; Offset 0.2; Haze 2.5; Glare 1; Color [255,200,255] and Decay [255,90,80] (both are the docs' demo values for those properties [S3]; Glare and Decay need Haze above 0).
- Post: Bloom Intensity 0.5, Size 28, Threshold 0.9; ColorCorrection Saturation 0.15, Contrast 0.1, TintColor [255,235,220]; SunRays Intensity 0.2, Spread 1.
- Clouds Cover 0.5 Density 0.15; colour the clouds via Lighting/Atmosphere, not Clouds.Color [S8].
- Water: WaterReflectance 1 so the sky colours reflect [S11].
Pitfalls: warm ColorShift on everything makes skin/UI colours muddy; keep Contrast modest.

### Recipe 8: Terrain workflow (blockout to dressed world)
When to use: any outdoor map.
Steps:
1. Greybox with parts, 5-stud snapping [S23]; mark landmarks and paths.
2. Terrain Editor > Create > Generate with biomes (Hills, Plains, Mountains, Water, Marsh...) over a selection region, or Import a heightmap (max 4096 px, 1 px = 4 studs; set the region's Y size) with optional colormap using exact key colours [S10].
3. Edit tab: Select/Transform to move regions, Fill/Replace for materials, Sea Level for water, brushes (Draw, Sculpt, Smooth, Flatten, Paint; sizes 1-64) for detail; Ctrl/Cmd toggles subtract, Shift smooths [S10].
4. Colour: Terrain.MaterialColors via `SetMaterialColor`; custom materials via MaterialVariant override per base material (global per place) and optional TerrainDetail faces [S12][S13].
5. Grass: Decoration true, GrassLength 0.1-1, GlobalWind set [S9][S10].
6. Water properties (Recipe 6 values) and Clouds.
7. Fill gaps with scripts when needed (snippet) and keep terrain filled rather than hollow [S40].
8. Dress with reused meshes, check Shift+F2 draw calls; terrain alone can be a large share of the budget [S41][S42].
Pitfalls: terrain materials are global per place; Mid-2027 terrain features (scattering, splines) are not shipped yet [S34][S35].

### Recipe 9: Custom material pack with MaterialVariant
When to use: a consistent stylised surface set (for example GrassStylized, WoodPlanksWorn).
Steps:
1. Create textures: square, tileable, seamless, albedo colour without baked lighting; normal map in OpenGL tangent-space; roughness and metalness greyscale; size 512-1024 (docs: 1024 on 8x8 studs matches built-ins [S15]).
2. In Material Manager: choose the base material (inherits physics), Create Material Variant, set maps, StudsPerTile (try 8 for a 1024 map to match built-in density; derived from [S15]) and MaterialPattern.
3. Apply to parts via `Part.MaterialVariant` (name) or set as override for a base material; terrain needs the override [S12].
4. Name convention BaseMaterial+Descriptor; keep all variants in `MaterialService`; same names enable style swaps [S12].
5. Set CustomPhysicalProperties on the variant only when behaviour must change (for example slippery Ice) [S12].
Pitfalls: renaming after applying breaks links; custom textures cost memory versus built-ins [S27]; Neon/Glass remain special; Glass refraction missing on mobile [S12].

### Recipe 10: PBR hero prop with SurfaceAppearance (and emissive)
When to use: repeated props that carry the look (signs, machines, crates).
Steps:
1. Model under 20,000 triangles (aim far lower; props 500-3000 derived), watertight, single UV set in 0-1 [S17].
2. Insert `SurfaceAppearance` under the MeshPart; set ColorMap, NormalMap (OpenGL), RoughnessMap, MetalnessMap, optional EmissiveMask with EmissiveStrength and EmissiveTint [S14][S37].
3. Map sizes: 256 per 2x2x2 studs; 512 for 4x4x4; 1024 for 8x8x8 [S15].
4. Foliage/lace: AlphaMode Transparency and MeshPart.Transparency 0; soft decals: at least 0.02 [S14].
5. Reuse tint: near-white albedo plus SurfaceAppearance.Color per instance for variants without new textures [S14].
6. Reuse the same MeshId and SurfaceAppearance on every copy so they instance [S28].
Pitfalls: SurfaceAppearance properties cannot be changed by scripts at runtime in general [S14]; EmissiveMaskContent only at edit time or via CreateSurfaceAppearanceAsync [S37].

### Recipe 11: Greybox to dressed level with avatar-correct scale
When to use: every new map.
Steps:
1. Baseplate, snapping 5 studs / 90 degrees [S23].
2. Place a reference rig (avatar about 5 studs tall) and check clearances with `Model:GetExtentsSize()`.
3. Rules: hallways/doorways at least 10 wide where two players pass; walls at least 10 tall; single doors 6-8 wide by 9-10 tall (derived); stair rise at most 1 stud with 3-stud run per step as in the Roblox sample (approximate) [S25]; ledges to jump up at most 5-6 studs; gaps at most 6 studs (derived from 7.2-stud jump, 16 studs/s).
4. Layout: three lanes plus cross lanes for combat maps; three exits per pocket; spawns at ends with two exits; peaks and valleys for sightlines [S23]. Open worlds: triangle placement of points of interest with about 40 s walking between them, landmarks at street corners, biome palettes [S61]. PvP: 32-stud main routes, walls 3-4x player height, risk/reward vantage points, cover props [S60].
5. Layering (derived): foreground interactables 0-50 studs; midground 50-250; background 250+ cheap silhouettes.
6. Replace blockout with kit pieces on the 5-stud grid; keep pivots aligned [S24].
7. Run the performance audit (Recipe 12) before polishing lighting.
Pitfalls: building at 1:1 real scale makes rooms feel cramped to a third-person camera (2018 community) [S46]; the curriculum quotes a 5-stud default jump but the engine default is 7.2 [S19][S23].

### Recipe 12: Visual performance audit and budget pass
When to use: before each playtest build and after any art drop.
Steps:
1. Playtest and open Shift+F2 render stats (draw calls, triangles) and the MicroProfiler; note a baseline phone [S27][S28].
2. Targets (start points): about 500k triangles and 500 draw calls in view, under 1.3 GB memory, UI under about 150 draw calls; per zone about 40k triangles [S41]. For very low-end devices consider 1,000,000 triangles / 1,000 draw calls only as the upper illustration from the docs [S27].
3. Find duplicate mesh IDs (snippet), re-upload once and duplicate; convert to packages [S28].
4. Set RenderFidelity Automatic or Performance on props; CollisionFidelity Box on decorative parts and CanCollide/CanTouch off for decoration [S28][S62].
5. Turn off CastShadow on tiny/distant parts; Light.Shadows off on non-hero lights; fewer, larger lights (range up to 120) [S28][S33].
6. Remove partial transparency overlaps; use 0 or 1 [S27].
7. Turn on StreamingEnabled; consider SLIM for big worlds and Mesh Streaming [S31][S38][S39].
8. Check terrain share of draw calls; reduce material count in view [S41][S42].
Pitfalls: Studio runs server and client together so memory looks worse; test on hardware and the emulator for aspect ratio only [S27].

### Recipe 13: Day-night cycle with Atmosphere blending
When to use: open-world hubs, survival.
Steps:
1. Define 4 anchors (dawn 6, noon 13, dusk 18, midnight 0) each with Lighting, Atmosphere and ColorCorrection values (reuse Recipes 2, 7, 3).
2. Advance `Lighting.ClockTime` on the server on a timer (for example 24 hours in 20-40 minutes; length is a design choice (derived)).
3. Lerp Color3 and numbers between anchors (snippet) rather than snapping.
4. Keep Brightness and Ambient changes smooth; ColorShift and OutdoorAmbient carry the colour mood [S1].
Pitfalls: ClockTime not replicated per the reference [S2]; test client sync; avoid per-frame heavy work, update every 0.1-0.25 s (derived, [S27]).

## Luau reference snippets

```lua
--!strict
-- applyLook: set Lighting, Atmosphere, post effects and Terrain water from one table.
local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")
local TweenService = game:GetService("TweenService")
local Terrain = Workspace.Terrain

local function ensure(className: string, parent: Instance): Instance
	local found = parent:FindFirstChildOfClass(className)
	if found then return found end
	local inst = Instance.new(className)
	inst.Parent = parent
	return inst
end

local function setProps(inst: Instance, props: {[string]: any})
	for k, v in props do
		(inst :: any)[k] = v
	end
end

local function tweenProps(inst: Instance, props: {[string]: any}, seconds: number)
	if seconds <= 0 then setProps(inst, props) return end
	TweenService:Create(inst, TweenInfo.new(seconds, Enum.EasingStyle.Sine), props):Play()
end

local SUNNY_CARTOON = {
	lighting = { Brightness = 2.5, Ambient = Color3.fromRGB(100, 100, 115),
		OutdoorAmbient = Color3.fromRGB(150, 150, 160), ColorShift_Top = Color3.fromRGB(255, 244, 214),
		EnvironmentDiffuseScale = 0, EnvironmentSpecularScale = 0, ExposureCompensation = 0,
		ClockTime = 14, GlobalShadows = true },
	atmosphere = { Density = 0.2, Offset = 0.3, Haze = 0.4, Glare = 0,
		Color = Color3.fromRGB(205, 225, 255), Decay = Color3.fromRGB(160, 190, 230) },
	bloom = { Intensity = 0.25, Size = 24, Threshold = 0.95 },
	color = { Saturation = 0.2, Contrast = 0.08, Brightness = 0, TintColor = Color3.new(1, 1, 1) },
	sunrays = { Intensity = 0.06, Spread = 0.8 },
}

local function applyLook(look: {[string]: any}, seconds: number)
	-- LightingStyle / PrioritizeLightingQuality are not scriptable: set them in Studio.
	tweenProps(Lighting, look.lighting, seconds)
	if look.atmosphere then tweenProps(ensure("Atmosphere", Lighting), look.atmosphere, seconds) end
	if look.bloom then tweenProps(ensure("BloomEffect", Lighting), look.bloom, seconds) end
	if look.color then tweenProps(ensure("ColorCorrectionEffect", Lighting), look.color, seconds) end
	if look.sunrays then tweenProps(ensure("SunRaysEffect", Lighting), look.sunrays, seconds) end
end

applyLook(SUNNY_CARTOON, 2)
```

```lua
--!strict
-- Terrain: recolour, water, grass, fills (all documented Terrain members).
local Terrain = workspace.Terrain
Terrain:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(110, 180, 60))
Terrain.Decoration = true
Terrain.GrassLength = 0.5            -- docs range 0.1 to 1
Terrain.WaterColor = Color3.fromRGB(40, 170, 200)
Terrain.WaterTransparency = 0.4      -- 0 opaque .. 1 clear; 1 is about 2000 studs underwater visibility
Terrain.WaterReflectance = 0.4
Terrain.WaterWaveSize = 0.15         -- 0..1
Terrain.WaterWaveSpeed = 10          -- 0..100
workspace.GlobalWind = Vector3.new(3, 0, 1)

Terrain:FillBlock(CFrame.new(0, -8, 0), Vector3.new(512, 16, 512), Enum.Material.Grass)
Terrain:FillBall(Vector3.new(0, 10, 0), 40, Enum.Material.Rock)
Terrain:FillBlock(CFrame.new(0, -2, 200), Vector3.new(256, 8, 128), Enum.Material.Water)
```

```lua
--!strict
-- Is the camera inside terrain water? Approximate: reads the 4-stud voxel at the camera.
local Terrain = workspace.Terrain
local function cameraUnderwater(cam: Camera): boolean
	local cell = Terrain:WorldToCellPreferSolid(cam.CFrame.Position)
	local center = Terrain:CellCenterToWorld(cell.X, cell.Y, cell.Z)
	local region = Region3.new(center - Vector3.new(2, 2, 2), center + Vector3.new(2, 2, 2))
	local materials, occupancies = Terrain:ReadVoxels(region, 4)
	return materials[1][1][1] == Enum.Material.Water and occupancies[1][1][1] > 0.5
end
-- Use it from a RenderStepped connection (client): when true, enable a Camera-parented
-- ColorCorrectionEffect (TintColor 11,143,213 etc.) and BlurEffect.Size = 10, tweened over 0.3 s.
```

```lua
--!strict
-- MaterialVariant: create, then apply by name and as terrain override.
local MaterialService = game:GetService("MaterialService")
local v = Instance.new("MaterialVariant")
v.Name = "GrassStylized"
v.BaseMaterial = Enum.Material.Grass
v.ColorMap = "rbxassetid://0"      -- replace with your uploaded texture id
v.StudsPerTile = 8
v.Parent = MaterialService
MaterialService.GrassName = "GrassStylized"   -- override built-in Grass (applies to terrain too)

local part = Instance.new("Part")
part.Material = Enum.Material.Grass
part.MaterialVariant = "GrassStylized"
```

```lua
--!strict
-- Find duplicate-looking meshes (same name, different MeshId) that block instancing.
local seen: {[string]: {[string]: number}} = {}
for _, d in workspace:GetDescendants() do
	if d:IsA("MeshPart") then
		local byId = seen[d.Name] or {}
		byId[d.MeshId] = (byId[d.MeshId] or 0) + 1
		seen[d.Name] = byId
	end
end
for name, ids in seen do
	local n = 0
	for _ in ids do n += 1 end
	if n > 1 then print(("%s uses %d different MeshIds"):format(name, n)) end
end
```

```lua
--!strict
-- Day-night: blend two looks by alpha (0..1) for Color3 and number properties.
local function blend(a: any, b: any, t: number): any
	if typeof(a) == "Color3" then return (a :: Color3):Lerp(b, t) end
	if typeof(a) == "number" then return (a :: number) + ((b :: number) - (a :: number)) * t end
	return b
end
-- Per-step: for each key in lookA.lighting set Lighting[key] = blend(lookA[key], lookB[key], t).
-- Drive ClockTime itself: Lighting.ClockTime = (Lighting.ClockTime + dt * 24 / CYCLE_SECONDS) % 24
```

```lua
--!strict
-- Scale check: compare a prop to the avatar and key movement numbers.
local Players = game:GetService("Players")
local plr = Players.LocalPlayer
local char = plr and (plr.Character or plr.CharacterAdded:Wait())
if char then
	local size = char:GetExtentsSize()
	local hum = char:FindFirstChildOfClass("Humanoid")
	print("avatar extents", size, "walk", hum and hum.WalkSpeed, "jumpHeight", hum and hum.JumpHeight,
		"gravity", workspace.Gravity)
end
```

## Open questions / unverified
- Default values of Atmosphere, BloomEffect, ColorCorrectionEffect, DepthOfFieldEffect and SunRaysEffect, and the property values of the Studio Baseplate template's Lighting, are not printed in the docs text read; the one community default (Brightness 2, FogEnd 100000) is from 2020 and may be stale.
- Whether fog (FogStart/FogEnd) is ignored at runtime when an Atmosphere exists, or merely hidden in the Properties panel, is not stated; test before combining.
- Whether LightingStyle and PrioritizeLightingQuality can be written by a Studio plugin or command bar, given they are "not scriptable".
- Whether ClockTime set on the server reaches clients (reference flags it NotReplicated while TimeOfDay is replicated); verify in a live two-client test.
- Bloom Threshold above 1 (used in a 2026 third-party tutorial) versus the documented 0-1 meaning.
- Conflicting jump height in docs (5 in the curriculum, 7.2 in the Humanoid reference); and the texture-size statements (1024 vs 4096) on the texture page; 4K announced Jan 2026.
- Exact default R15 avatar height in studs (docs give only the HipHeight formula; the 5.12 figure is 2018 community).
- Standard door/stair dimensions are not documented by Roblox other than the 10-stud hallway and 10-stud wall rules; the other door and stair numbers here are derived.
- Colour palettes of specific top games (Grow a Garden, Doors, Blox Fruits, and others): no verified source was read; only generic palette rules and the Roblox sample-map palette are included.
- The named looks' RGB, Haze, Bloom and Saturation values marked derived have not been visually checked in Studio in this session; verify with a screenshot loop.
- SIGGRAPH 2026 SLIM talk (advances.realtimerendering.com, 2026-08-08) exceeded the fetch size limit and was not read.
- The ColorGradingEffect page was only read at guide level; no numeric properties beyond TonemapperPreset.
- Web search quota ran out partway; later discovery used DevForum's public search endpoint. Some DevForum numbers come from automated summaries of the page and may be paraphrased imprecisely (notably the sample-map dimensions in S25).
- Lighting behaviour on specific mobile GPUs (Future/Realistic fallback rules) is only covered by 2020 and 2024 sources.

## Sources
Official docs (Creator Hub, content read from github.com/Roblox/creator-docs, which publishes the create.roblox.com/docs sources; fetched 2026-10-04; docs pages undated, treat as current):
[S1] Global lighting, Roblox, https://create.roblox.com/docs/environment/lighting
[S2] Lighting class reference, Roblox, https://create.roblox.com/docs/reference/engine/classes/Lighting
[S3] Atmospheric effects, Roblox, https://create.roblox.com/docs/environment/atmosphere
[S4] Atmosphere class reference, Roblox, https://create.roblox.com/docs/reference/engine/classes/Atmosphere
[S5] Post-processing effects, Roblox, https://create.roblox.com/docs/environment/post-processing-effects
[S6] BloomEffect, ColorCorrectionEffect, DepthOfFieldEffect, SunRaysEffect, BlurEffect class references, Roblox, https://create.roblox.com/docs/reference/engine/classes/BloomEffect (and sibling class pages)
[S7] Skyboxes guide and Sky class reference, Roblox, https://create.roblox.com/docs/environment/skybox
[S8] Dynamic clouds guide and Clouds class reference, Roblox, https://create.roblox.com/docs/environment/clouds
[S9] Global wind, Roblox, https://create.roblox.com/docs/environment/global-wind
[S10] Environmental terrain, Roblox, https://create.roblox.com/docs/parts/terrain
[S11] Terrain class reference, Roblox, https://create.roblox.com/docs/reference/engine/classes/Terrain
[S12] Materials (incl. custom materials, physical properties tables), Roblox, https://create.roblox.com/docs/parts/materials
[S13] MaterialService, MaterialVariant, TerrainDetail class references, Roblox, https://create.roblox.com/docs/reference/engine/classes/MaterialVariant
[S14] PBR textures (SurfaceAppearance), Roblox, https://create.roblox.com/docs/art/modeling/surface-appearance
[S15] Texture specifications, Roblox, https://create.roblox.com/docs/art/modeling/texture-specifications
[S16] Material references (roughness/metalness values), Roblox, https://create.roblox.com/docs/art/modeling/material-reference
[S17] General mesh specifications (20,000 triangles), Roblox, https://create.roblox.com/docs/art/modeling/specifications
[S18] Character body specifications, Roblox, https://create.roblox.com/docs/avatar/character-bodies/specifications
[S19] Humanoid and StarterPlayer class references, Roblox, https://create.roblox.com/docs/reference/engine/classes/Humanoid
[S20] Workspace class reference, Roblox, https://create.roblox.com/docs/reference/engine/classes/Workspace
[S21] Roblox units, Roblox, https://create.roblox.com/docs/physics/units
[S22] Pathfinding (agent parameters), Roblox, https://create.roblox.com/docs/characters/pathfinding
[S23] Environmental art curriculum, Chapter 1 Greybox your environment, Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/greybox-your-environment
[S24] Environmental art curriculum, Chapter 2 Develop polished assets, Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/develop-polished-assets
[S25] Environmental art curriculum, Chapter 4 Construct your world (read through an automated summary), Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/construct-your-world
[S26] Environmental art curriculum, Chapter 5 Optimize your game, Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/optimize-your-experience
[S27] Design for performance, Roblox, https://create.roblox.com/docs/performance-optimization/design
[S28] Improve performance, Roblox, https://create.roblox.com/docs/performance-optimization/improve
[S29] Enum.Technology and Enum.LightingStyle, Roblox, https://create.roblox.com/docs/reference/engine/enums/Technology
[S30] BasePart, MeshPart, Camera, Highlight, Light/PointLight class references, Roblox, https://create.roblox.com/docs/reference/engine/classes/BasePart
[S31] Instance streaming and SLIM guides, Roblox, https://create.roblox.com/docs/workspace/streaming/index and https://create.roblox.com/docs/workspace/streaming/slim
DevForum and other (dates are post dates):
[S32] "Let There Be (Unified) Light! Unified Lighting is Fully Live", Roblox Rendering Team, 2025-01-21 (updated 2025-07-23), https://devforum.roblox.com/t/let-there-be-unified-light-unified-lighting-is-fully-live/3401512
[S33] "Extended Light Ranges: Doubling the Limit to 120", Roblox Rendering Team, 2025-09-23, https://devforum.roblox.com/t/extended-light-ranges-doubling-the-limit-to-120/3954367
[S34] "Terrain Updates: Object Scattering, Path Splines, Projected Terrain Decals, and More", LuckyRainGG, 2026-09-11, https://devforum.roblox.com/t/terrain-updates-object-scattering-path-splines-projected-terrain-decals-and-more/4865617
[S35] "Creator Roadmap 2026: Fall Update", Roblox, 2026-09-18, https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S36] "4k Texture Rendering", FGmm_r2 (Roblox Rendering Team), 2026-01-30, https://devforum.roblox.com/t/4k-texture-rendering/4316229
[S37] "[Studio Beta] Emissive Masks", FGmm_r2, 2025-10-30 (later: live for published experiences 2026-02-12), https://devforum.roblox.com/t/studio-beta-emissive-masks/4034414
[S38] "[Client Beta] Introducing Scalable Lightweight Interactive Models (SLIM)", FGmm_r2, 2025-10-30, https://devforum.roblox.com/t/client-beta-introducing-scalable-lightweight-interactive-models-slim/4034709
[S39] "Introducing Mesh Streaming and Improved Cloud LoDs in Published Experiences (Opt-in Phase)", FGmm_r2, 2026-04-27, https://devforum.roblox.com/t/introducing-mesh-streaming-and-improved-cloud-lods-in-published-experiences-opt-in-phase/4601232
[S40] "The definitive tutorial to game optimization", Kevin WoloPoints (ArthurWellesley), 2026-05-10, https://devforum.roblox.com/t/the-definitive-tutorial-to-game-optimization-everything-you-need-to-know/4629258
[S41] "Real world building and scripting optimization for Roblox", Peter McNeill (MrChickenRocket), 2024-08-20 (third-party, 633 likes), https://devforum.roblox.com/t/3127146
[S42] "Optimize Smooth Terrain Better", SaturnianNightmare (with reply by Elttob), 2025-06-25, https://devforum.roblox.com/t/optimize-smooth-terrain-better/3781706
[S43] "Increase the max triangle limit", AB_XI, 2026-05-23, https://devforum.roblox.com/t/increase-the-max-triangle-limit/4650221
[S44] "Customizable Voxel Light Grid size", feature request, 2025-10-17, https://devforum.roblox.com/t/customizable-voxel-light-grid-size/4010750
[S45] "Units on Roblox", DevForum (post date not captured), https://devforum.roblox.com/t/2418615
[S46] "Measurement Conversion", SargesaurusRex (APilotNamedSarge), 2018-06-19 (stale), https://devforum.roblox.com/t/measurement-conversion/137419
[S47] "Underwater Transparency - Change in Visibility Behavior", ProfessorKJM, 2021-06-02 (stale), https://devforum.roblox.com/t/underwater-transparency-change-in-visibility-behavior/1268584
[S48] "Upcoming Underwater Lighting Improvements", TigerRabbit2, 2020-11-11 (stale), https://devforum.roblox.com/t/upcoming-underwater-lighting-improvements/865915
[S49] "Underwater Effects", kylerzong, 2021-02-07 (stale), https://devforum.roblox.com/t/underwater-effects/1031133
[S50] "Under Water Effect", BoilingPoints (HerMr), 2021-05-01 (stale), https://devforum.roblox.com/t/under-water-effect/1197858
[S51] "FogEnd not applying Ingame", Koki0991, 2023-11-20, https://devforum.roblox.com/t/fogend-not-applying-ingame/2709719
[S52] "Lighting Tutorial - How to use Lighting", Aerosphia (Aero), 2020-10-12 (stale), https://devforum.roblox.com/t/lighting-tutorial-how-to-use-lighting/817013
[S53] "How to make my game pitch dark?" (answer by sargentchess21, Dec 2022), https://devforum.roblox.com/t/how-to-make-my-game-pitch-dark/735897
[S54] "BOO - The 3 Prime Elements to Spice up Your Horror Games!", TheCarbyneUniverse, 2020-03-01 (stale), https://devforum.roblox.com/t/boo-the-3-prime-elements-to-spice-up-your-horror-games/471429
[S55] "How You Can Make Stylized Flat-Color Art", Flumzee, 2021-10-16 (stale), https://devforum.roblox.com/t/how-you-can-make-stylized-flat-color-art/1510773
[S56] "How do I get a golden hour effect with Lighting", AnomalousBob, 2023-08-29, https://devforum.roblox.com/t/how-do-i-get-a-golden-hour-effect-with-lighting/2569475
[S57] "Improve Lighting (STEP BY STEP)", baseparts, 2021-08-02 (stale), https://devforum.roblox.com/t/improve-lighting-step-by-step/1387033
[S58] "Development Tips: Better Lighting", aekume (miso), 2020-05-18 (stale), https://devforum.roblox.com/t/development-tips-better-lighting/580976
[S59] "Future Is Bright: Phase 3 Released", vrtblox, 2020-11-19 (stale), https://devforum.roblox.com/t/future-is-bright-phase-3-released/878634
[S60] "Ruski's Tutorial #3 - How to Design a PvP Map", Trustmeimrussian, 2023-12-18, https://devforum.roblox.com/t/ruskis-tutorial-3-how-to-design-a-pvp-map/2746055
[S61] "Ruski's Tutorial #5 - How to Design an Open World Map", Trustmeimrussian, 2025-03-17, https://devforum.roblox.com/t/ruskis-tutorial-5-how-to-design-an-open-world-map/3554962
[S62] "MeshPart Usage, Performance & Optimizations", BullfrogBait, 2021-06-29 (stale), https://devforum.roblox.com/t/meshpart-usage-performance-optimizations/1319217
[S63] "Creating custom skyboxes using Blender & crafting stunning atmospheres", ZacAttackk, 2024-08-25, https://devforum.roblox.com/t/creating-custom-skyboxes-using-blender-crafting-stunning-atmospheres/3134324
[S64] "Creator Spotlight: Meet Ahlvie, the Environmental Artist Behind Fantastical Worlds", Roblox, 2024-05-10, https://devforum.roblox.com/t/creator-spotlight-meet-ahlvie-the-environmental-artist-behind-fantastical-worlds/2964648
[S65] "Building and Showcase TIPS!", AerialsAbove, 2020-06-22 (updated 2021-05-13) (stale), https://devforum.roblox.com/t/building-and-showcase-tips-update/639045
[S66] "How to make realistic lighting in Roblox Studio", ToastDevRBLX, 2026-04-13 (third-party, creation.dev), https://www.creation.dev/learn/how-to-make-realistic-lighting-roblox-studio
[S67] "Guide to Lighting", dswqsa895, 2023-12-26 (qualitative only), https://devforum.roblox.com/t/guide-to-lighting/2764787
[S68] "Realistic Roblox Lighting", BEAMEDBYTRGX (DevStellarX), 2024-09-02 (qualitative: Future, EnvironmentSpecularScale 1), https://devforum.roblox.com/t/realistic-roblox-lighting/3144291
[S69] "Color Banding Post-Processing Effect" (feature request), mvyasu, 2024-01-13, https://devforum.roblox.com/t/color-banding-post-processing-effect/2790802
[S70] "Comprehensive Guide to Color Theory for Beginners", 3_F7, 2023-04-13 (general colour theory, no Roblox numbers), https://devforum.roblox.com/t/comprehensive-guide-to-color-theory-for-beginners/2294740
[S71] "[V1.1] Realistic Dynamic Lighting | Open Sourced", Maiq_S, 2024-02-14 (values live in the module, not the post), https://devforum.roblox.com/t/v11-realistic-dynamic-lighting-open-sourced/2837777
[S72] "Real Sun Path", Pulsarnova (BangoutBoy), 2023-04-06, https://devforum.roblox.com/t/real-sun-path-realistic-sun-movement-and-longershorter-days/2275337
[S73] "How to make realistic lighting", AstralApples and replies, 2021-12-18 (stale; Future, contrast, custom skybox advice), https://devforum.roblox.com/t/how-to-make-realistic-lighting/1593494
[S74] Horror lighting preset values (Brightness 0.3, Ambient [10,10,14], OutdoorAmbient [8,8,12], FogEnd 60, Atmosphere Density 0.55 and Haze 2) seen only as a web-search snippet from a vendor tutorial page, https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-horror-game (not opened, low trust, undated)
