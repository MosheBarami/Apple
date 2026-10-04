# Building craft: how professional Roblox builders build (blockout, kits, low-poly props, architecture, terrain, kitbashing, optimisation)
_Researched 2026-10-04 by deep-researcher agent (Claude Sonnet 5.5). Sources: 86 plus one snippet-only entry, S43b (S1-S30 official docs read as raw markdown from github.com/Roblox/creator-docs; S31-S85 DevForum, Roblox newsroom and community threads opened with WebFetch; S86 is a local repo observation)._

How to read the tags used below:
- `[S#]` = taken from that source. Most DevForum pages were read through a summariser, so exact numbers come from the summary of the page; where I only saw a search-result snippet I say "snippet only".
- `(derived)` = my own derivation or tuning choice from cited facts. It is a starting point to check visually in Studio, not a documented value.
- `(stale)` = source older than 2024; the behaviour or tooling may have changed. Many DevForum building threads are 2019-2021, so they are labelled by date.
- Roblox docs pages are undated; treat them as current as of the fetch date (2026-10-04).
- Builder portfolio pages (ArtStation, DevForum "Showcase your portfolio") turned up in search but were not opened; the process material below comes from Roblox's own breakdowns and named community tutorials instead.

This file goes deeper than `05-world-visuals.md` (which covers lighting, materials, PBR, performance numbers and avatar-relative scale). It does not repeat those values; it adds the building process, concrete dimensions and step lists.

## Key facts

### The professional pipeline: sketch, blockout, iterate, then art
- The "industry standard" order, as a community builder states it: sketch, greybox, iterative art pass over all areas at once, repeat until done (2021) [S73]. Roblox's curriculum uses the same order (greybox, develop polished assets, assemble an asset library, construct the world, optimise) and says iteration between and across steps is normal [S1][S2][S3][S4][S5].
- Greyboxing means laying out the level in simple shapes before scripting or final art, to test gameplay, spot unfair vantage points and find assets with wrong scale [S1][S7]. Roblox's Duvall Drive team started from a 2D layout, then used terrain and plain parts plus Creator Store stand-ins so playtesting could begin "within the first few days", and kept the early layout largely intact in the final house [S11].
- Roblox's own space-station demo (Beyond the Dark) built the first layout from Parts plus a few meshes from Maya/Blender to adjust map scale, room arrangement and paths, then swapped in modular final pieces; the designers gave players a goal (the black hole) and broke the straight path to it so exploration was needed [S10].
- A named environment artist (Ahlvie, Twin Atlas) describes her order: mood board and sketch, greybox (paths, spawns, end goal, curves and multiple directions), convert parts to terrain with a Part-to-Terrain plugin, sculpt, apply materials, colours, skybox and atmosphere, model stylised props in Blender (sometimes Substance Painter), then place props with scatter plugins (2024) [S48]. Her 2020 six-step version is: stylisation (geometry and palette), map layout, terrain sculpting, scene building, lighting, final details (2020) [S49]. Her beginner advice: practise greyboxing, avoid straight paths, favour composition and colour balance over polygon count [S48].
- A 2021 workflow thread names a fine-grain snapping ladder used by one builder: layout, then lock-to-grid 0.5 for large details, 0.2/0.1 for small details, 0.05 for studio models (2021) [S73]. Another community tutorial states "the golden increment is 0.25" so segment angles and offsets add up cleanly to 90, 180 or 360 degrees (2020) [S41].

### Grid and unit conventions that real kits use
- 1 stud = 28 cm; 1 RMU = 21.952 kg (see 05). DCC applications import 1 unit as 1 stud with no conversion, so set Blender/Maya unit scale to "1 unit = 1 stud" [S10].
- Roblox kits use different but fixed grids: 5 studs and 90 degrees for the laser-tag blockout and modular kit (every piece at least 5 studs, sizes divisible by the smallest piece) [S1][S2]; 16 studs for the Beyond the Dark space station [S10]; 7.5 studs and 45 degrees (pieces minimum 7.5, maximum divisible by 7.5) for the Modern City sample kit [S9]. The rule is the same: one grid per project, shared by every artist, chosen at the start [S10].
- Pivot rule for kit pieces: consistent pivot (forward-most lower corner or a logical attach point) so pieces snap at incremental distances; props get context pivots (wall item on its back, floor item on its bottom) [S2][S9]. Pivot tools: the Pivot toggle moves a part's or model's pivot; assigning a PrimaryPart moves the pivot to that part; clearing it resets to the bounding-box centre; Origin Position/Orientation and Pivot Offset are settable in Properties; the Align tool offers Min/Center/Max, World or Local axes, relative to Selection Bounds or the Active Object [S17][S18].
- Studio transform snapping is in studs (move/scale) and degrees (rotate), adjustable in the Model tab; Shift toggles snapping while dragging; Ctrl/Cmd+L toggles local axes; T and R while cursor-dragging rotate 90 degrees [S15]. `StudioService.GridSize` and `RotateIncrement` are ReadOnly (readable, not writable) from plugins, so a tool cannot change the user's snap, it can only set exact positions [S30]. A community tutorial recommends starting at 1 stud and 15 degrees (2022) [S42]. A search snippet says the default move step is 1 stud (snippet only).
- Older community conventions (2015-2020): build with side lengths that are multiples of 4, 8, 16, 32 etc.; use a 1 stud grid for structure and 1/5 stud for detail; do solid modelling on a 1 stud grid, scaling the work up 10x for tiny pieces; a 3-4-5 (or 1-3-4 / 1-4-3 scaled) triangle gives clean slope lengths without fractions (2015, stale) [S40].

### Dimensions that are documented or widely used
- Roblox curriculum (greybox chapter): hallways and doorways at least 10 studs wide so two characters pass; perimeter walls at least 10 studs tall; transform snapping 5 studs and 90 degrees; one spawn zone per team with two exits; three lanes (interior, middle, exterior) crossed by five cross lanes, giving "combat pockets"; three floor levels (main, mezzanine, outdoor) joined by wedge ramps [S1]. The same text assumes a 5-stud default jump; the engine default is about 7.2 studs (see 05 resolution), so the 10-stud wall is a safe margin [S1].
- Avatar scale: a standard R15 rig is 5 studs tall in a widely used community script; classic body about 4.75, Rthro 5.25-6.5 per a search snippet; a 2018+ forum figure is 5.125 tall by 4 wide excluding hats (snippet only, stale) [S47]. Use `character:GetExtentsSize()` for an exact number (snippet only).
- House (Ruski, 2019): wall thickness 0.7 studs; roof overhang 1-2 studs with the shingle layer another 1 stud beyond; door and window openings sized against a character model (belly-button height for a window sill is the author's guide); no explicit room or door numbers are given, the tutorial relies on a reference rig and a floor plan [S35]. A search snippet from a 2023 door thread says doors are commonly 7.5-8 studs high and 5-6 wide, with 10 tall by 5 wide suggested to suit Rthro (snippet only, page returned 403) [S43b].
- Doors, 2020 thread: 5x7 studs looks reasonable for an R6/R15 character; 0.05x6.731x4.6 was one builder's door slab; account for Rthro avatars [S43].
- Stairs, 2019 thread: a step higher than about 0.8 studs can make animations hop; 0.8 is called the smooth maximum; a 1:1 rise-to-run ratio is common; invisible ramps over decorative stairs are a standard fix [S44]. The curriculum builds exterior stairs from 1-stud-high steps 3 studs wide (read through an automated summary, approximate) [S4].
- PvP map numbers (Ruski, 2023): 400x400 stud baseplate for a compact map, 32-stud main paths, perimeter walls 3-4 times player height, roof overhangs 2-3 studs, interiors with several entrances and no camping spots [S37]. Map layout numbers (2019): 12-20 players for a spawn area, 2-3 storeys in first-person maps, 2-3 entrances per building; "players should always be looking at something intriguing" [S36]. Open world (2025): points of interest about 40 seconds apart, loot within 15-20 seconds of paths, day-night ratio about 75 percent day [S38].
- Large Roblox sample dimensions (curriculum chapter 4, taken from the page text): floors 5-6 thick, skylight assemblies at Y 20, roof blocks 15 thick with tops near Y 28.5, overhang slabs 5 thick, hero towers 98 studs tall, 20x11x5 planters, trims 0.5-1 studs thick; the whole laser-tag arena was estimated at about 90 minutes to build from the asset library [S4].
- Terrain scale in the core tutorial: a 32-stud brush for the first island sphere, an 18-stud flatten brush at Fixed Y plane 0, a water Fill region of 1800 x 5 x 1800 studs at Y -15 so water reaches the horizon, a 3-stud brush for grass edge detail, spawn at about (-127, -3, 9) [S6].
- Tutorial platform heights: seven levels with height steps 8, 20, 35, 55, 81 and 110 studs, keeping at least 30 studs between levels for jump upgrades [S7] (design for a jump-upgrade game, not a general rule).

### Part counts, primitives and what actually costs
- Triangles per primitive according to a 2021 thread: Part 12, Wedge 10, Cylinder 96, Sphere 432 (single forum post, stale, unverified against the engine) [S61]. Practical use: block and wedge are cheap; cylinders and spheres cost about 8x and 36x a block, so low-poly builds avoid them [S34][S33].
- Part-count reference points from community threads (all stale, 2021-2022): whole maps of 15-30k parts are workable (Jailbreak 19-20k, MadCity 25.3-25.5k, MeepCity 13.5-14k as quoted in 2021); 750+ parts packed in one small spot caused visible frame loss; triangle density and clustering matter more than raw count; a 2022 thread suggests staying under 15-20k parts for low-end devices [S61][S62].
- A 2021 builder guide reports 60 FPS under about 5,000 parts inside a 300-stud view on a weak test PC and 25-30 FPS at 9,000+; a single building without interior is 100-600 parts; a 10-storey, 200-window facade went 800 parts, 400 optimised, 68 with a smarter design; lag ratings: dynamic clouds highest, neon and glass medium, lights medium, script day-night cycles low; Streaming and atmospheric haze reduce lag; use Smooth Plastic as the cheap material (2021, stale) [S39].
- 2019 optimisation guide: a part with textures on all six faces draws roughly 7x as expensively as a plain one; avoid Neon and Glass; semi-transparent parts should be 0 or 1; never put a decal on a fully transparent part; filled terrain beats hollow terrain; unions have medium efficiency but meshes are better; set union CollisionFidelity to Hull or Box (2019, stale) [S59].
- Mesh guidance (2020-2021): RenderFidelity Automatic roughly halves triangles at 250-500 studs (3,000 triangles to about 1,500) and Precise keeps all; CollisionFidelity cost order Box, Hull, Default, PreciseConvexDecomposition; reusing identical MeshIds avoids repeat downloads; avoid unions for decoration because they create many triangles and poor collision shapes; disable CanCollide and CanTouch on decoration (2020-2021, stale) [S60][S65]. A 2024 reply thread repeats "more meshes, fewer unions" and suggests PBR materials instead of extra part detail [S63]. For mobile guidance from a veteran dev see 05 (500k triangles, 500 draw calls).
- Docs: every asset except doors is Anchored in the laser-tag sample; CanCollide off for foliage; CanTouch only where events are needed (checked every frame); CanQuery off where raycasts need not hit, but left on for walls that lasers hit; CastShadow off for foliage nobody sees; DoubleSided only on planar foliage cards (it doubles polygon draws); CollisionFidelity Box for plain walls, Hull for trims users might jump against, Default/Precise only where the collision shape matters (doorway edges); RenderFidelity Performance for foliage [S3]. Combine meshes to cut draw calls (8 tower pieces into one asset = 8 draw calls to 1) and reuse one asset ID per repeated model [S5].
- Occlusion culling (Studio beta announced 2024-11-07 by a Roblox rendering staffer): hides objects behind other objects automatically; works on meshes and parts only (not avatars, terrain, lights, VFX, UI); dense interiors gain most; disable the beta when profiling to match production; no release date was stated in that post [S64]. Community search snippets add that it needs fully opaque occluders and can fail at long camera distance (snippet only, 2025). I did not find a confirmed general-release announcement.
- Scene Analysis (Window > Performance Summary) has a triangle composition view (Shadows, Opaque, Transparent, Terrain, Grass, Particles, Sky, UI) and an instance composition view; it is meant for play/test sessions and its totals do not match what a mid-range phone sees [S27].

### Solid modelling (CSG), meshes and what changed in 2026
- Union, Intersect, Negate, Separate are the Studio tools; "Negate" turns a part into a subtraction shape that cuts when unioned with the target [S13]. Scripts and plugins use `GeometryService:UnionAsync/IntersectAsync/SubtractAsync`; they return arrays, accept unparented inputs, and the `rbxNegate` tag stands in for the Negate button [S13]. In-game calls are asynchronous and should not be fired in long rapid series [S13].
- Solid Modeling on Meshes (Studio beta posted 2026-03-12, full release for live games 2026-07-07 by the Roblox geometry team): CSG on watertight MeshParts, new `FragmentAsync`/`GenerateFragmentSites` and `SweepPartAsync`; meshes over 20k faces will probably become non-solid when simplified; textures from tool parts are discarded; MeshParts created with these tools are still not saved across sessions as of the July note [S66]. So CSG-on-mesh output cannot be a persistent building step yet.
- CSG replication switched to delta updates in April 2026; BasePart union methods are deprecated in favour of GeometryService [S67].
- Watertight means closed, manifold, non-self-intersecting, with each edge shared by exactly two triangles [S13]. Roblox mesh limit is 20,000 triangles with a single UV set (see 05).
- Mesh tooling in 2026: Assistant `/generate_mesh` (text or image, a selected Part used as the bounding box), `/generate_procedural_model` (up to 50 per rolling 24 hours), segmentation up to 8 named parts at generation and up to 5 per `/segment_mesh` run [S28]; procedural models are code-generated, parameter-driven Models whose `OnGenerate` rebuilds on attribute or size change, and Creator Store ones auto-set `Sandboxed = true` [S21]. `GenerationService:GenerateModelAsync` with a schema (for example the five-mesh car) can take a maximum triangle count and a bounding box [S22]. A September 2026 update added better texture generation, image previews and mesh segmentation; users reported custom normals resetting and mesh IDs changing [S68]. Roblox says 44 percent of the top 1,000 creators use Assistant or third-party AI tools via MCP (April 2026) [S84]. A community mesh editor plugin, Meshie (September 2026, $5 early access), adds ngon editing, extrude-like operations and flat/smooth shading, but still needs export and re-import to save meshes [S69].

### Roofs, curves and paths (community craft)
- Roofs in Studio: use WedgeParts and CornerWedgeParts; non-90-degree shapes need several wedges plus a GapFill plugin; builders also use ResizeAlign + GapFill + ResizeAlign, extrude then trim with unions, or a toolbox triangle mesh with GapFill; results at corners are often imperfect (2022) [S71].
- Curves: wedges stepped through 45, 48, 51, 55, 59, 63, 68, 73, 79 degrees give "unclean" angles unless sizes are equal; cylinders with spheres as pivots work if sphere width equals cylinder width; Archimedes (axis plus angle input) is preferred; segment angles must sum to 90/180/360; "avoid unions" for curved roads because they cannot be edited later (2020) [S41].
- Builders recommend tooling: Stravant GapFill, ResizeAlign, Model Reflect, Archimedes, Brushtool, Part To Terrain, F3X, Redupe, Quick Road, GeomTools, Studio Build Suite (2021-2025) [S39][S57]. A Path Creator plugin builds fences and path lines on a 10-stud grid (snippet only).
- Shortcuts that save time: Ctrl+Shift+G union, Ctrl+Shift+N negate, Ctrl+Shift+U separate, Ctrl+Alt+G group as folder, F2 rename, Alt+C select connections (2025) [S57].

### Terrain craft
- Roblox's own island order (core curriculum): Draw (brush 32, Sand) to drop a sphere, Flatten (brush 18, Fixed plane Y 0) for a level top, Sculpt for natural edges and below the waterline, Fill/Replace Air to Water over a 1800x5x1800 region, Paint (Leafy Grass in the middle, Grass at brush 3 along edges), then place spawn and playtest scale. Draw adds or subtracts by brush position; Sculpt only grows or erodes existing terrain; Sculpt and Smooth have strength 0.1-1; brush size 1-64; Shift toggles Smooth while using Draw or Sculpt; Ctrl/Cmd toggles subtract [S6][S19].
- Terrain Editor Create tab: Import (heightmap, optional colormap, default material), Generate (biomes, blending, caves, biome size, seed), Clear; Edit tab: Select, Transform (Merge Empty, Live Edit, Snap to Voxels), Fill, Sea Level, Draw, Sculpt, Smooth, Paint, Flatten; Fill has Fill and Replace modes [S19].
- Community order (2019-2020): Add tool for rough large chunks, Subtract for ravines, Grow as the "most used" blending tool, Erode and Smooth to soften, Paint for beaches and large areas, Regions for flat areas and water; never rely on auto-generation alone and combine tools; customise terrain colours in Terrain properties first (2019) [S51]. Raise hills out of a placeholder material to preview contours, carve V-shaped valleys with branching (fractal) patterns, recolour ground/mud toward green for moss, mix rock materials, add fog above about 2000x2000 stud maps (2020) [S52].
- Scene recipe from a forest tutorial: replace the baseplate with terrain, make the path curved and uneven, vary terrain materials, add hills for depth, plant trees in two size layers, add micro-hills between trees, place boulders, stumps, logs, then ferns and bushes, then rocks and sticks on the path, then flowers and clover, then lighting (less saturation, more contrast, orange tint, vignette) (2021) [S56].
- Conversions: Part To Terrain plugins now use `Terrain:FillWedge` for full wedge shapes; Object to Terrain (2025-12-08) voxelises MeshParts, unions, trusses and corner wedges in chunks but a later user found it slower than alternatives (2026-02) [S70]; a 2024 thread suggests MeshPart-to-Terrain plugin plus manual shaping, and another warns height-maps can be glitchy for proportionally accurate terrain (2021) [S54][S55]. Large-scale pipeline: Gaea at 1k resolution, about 200,000 faces after decimation, import scale about 4,000, script converts parts to voxels with materials by slope and altitude (2019-2020) [S50]. Commercial texture sources (Quixel Megascans in 2020) came with licence caveats; check the current licence before use (2020, stale) [S53].
- Material overrides for terrain: each override replaces one of 22 built-in materials globally per place; Duvall Drive overrode about 10 of them for wet mud, mulch and gravel, and made wet and dry concrete variants (Concrete_Wet_MV naming with an _MV suffix) [S12].
- Terrain cost reminders (cell count, filled vs hollow) are in 05. Twin Atlas reports cutting one map from 99 million terrain cells to 25 million through simplification and Instance Streaming (2026-07) [S85].

### Modular kits, trim sheets and packages
- Kit rules: a handful of versatile pieces beats many one-offs; every piece becomes a package; materials live in packages too; AutoUpdate on the PackageLink; 1,000+ wall panel instances updated by editing one package; 90 percent of the station's architecture used a few swappable trim-sheet sets [S10].
- Trim sheets: textures laid out in rows or columns of different surface treatments, tiling along one axis only, square overall, laid out in a template so a clean metal set can swap for rusted; quads, edge strips to end large surfaces, avoid over-trimming (stripey look), keep texel density consistent (2024) [S2][S10][S58]. Keep trim maps clean of obvious grime; unique heavy wear needs a 1:1 map [S12].
- Material variants for surfaces, SurfaceAppearance for UV-mapped meshes (only MeshParts have UVs; Parts use world-projected materials); name SurfaceAppearance with an _SA suffix and keep them as packages [S10][S12]. Duvall's craftsman style was chosen so one wood trim set served furniture and architecture, and alpha-mask tinting gave colour variants without extra textures [S12].
- Asset library setup order: folders by data type, custom materials (Material Manager, base material for physics, Set as Override, Organic pattern to reduce tiling), SurfaceAppearance packages, import FBX kit and props, apply SurfaceAppearance, set physics and render flags, convert to packages (nested packages are allowed) [S3]. Packages: editing disables auto-update until you publish or revert; nested edits require publishing the nested package before its parent [S25].
- Duvall Drive built an asset storage place full of package links so edits propagated to every place using them, kept a document listing the props each room needs, blocked props out early as packages so final versions swapped in, and used one package for both the normal and corrupt state of a room [S11].
- Photogrammetry or scan data needs retopology, new UVs and baked PBR; Roblox's team reduced scans from about a million vertices to about 1,000 for in-game assets, using 512 PBR textures with lighting painted out [S11].

### Kitbashing and Creator Store safety
- Creator Store asset pages show triangle, vertex and script counts; right-click an inserted object and choose Disable Scripts to use an asset without its scripts running [S23]. Roblox restricts publicly shared assets that obscure engine features (getfenv/setfenv, LuaVMs), require remote assets (`require(assetId)`, loadstring, InsertService:LoadAsset, AssetService:LoadAssetAsync, ModuleScript.LinkedSource), include obfuscated code or are extremely large [S23][S80].
- 2025-2026 reality: a Nov 2025 DevForum report (still updated through April 2026) describes models packed with hundreds of deeply nested, emoji-named children and obfuscated backdoor scripts, including skybox assets with hidden link scripts; staff took assets down but the problem persisted; users advise disabling scripts, deleting suspicious ones and sandboxing [S81]. Script Capabilities (client beta; `Sandboxed` property on Models, Folders, Scripts, restricting what scripts inside can do; set `Workspace.SandboxedInstanceMode` to Experimental) are a way to constrain inserted models [S26]. Procedural models from the Creator Store are auto-sandboxed [S21].
- Asset Privacy applies only to Images, Decals and Meshes created after you enable it, defaulting them to Restricted; Models, MeshParts, Packages, Audio and Animations are not affected; restricted assets you do not have permission for are not visible at runtime [S16][S24].
- Roblox's own sample libraries (Core Building and Scripting library, Environment Art asset library, Beyond the Dark, Duvall Drive, Plant) are first-party kits and the safest source of kit content [S3][S8][S10][S11].

### Where the pro/amateur gap shows
- Pros: consistent grid and kit, trim sheets, reuse of the same mesh IDs and materials, curved and non-straight paths, elevation variation, restrained palettes with rare accent colours (Ahlvie used mostly browns, whites and greys with flowers and mushrooms as accents), props varied in colour, size and angle, and checking every scale in Test mode (2020) [S49].
- Amateurs: unions everywhere, one-off meshes, texture on every face, semi-transparent overlap, straight paths, flat terrain, props at identical size and angle, and cramped 1:1 real-world scale (see 05 and [S59][S63]).
- Scale discipline: one builder method is to decide dimensions against a character rig before building, colour-code sections to check proportions, and keep a rig in the scene; "play your game from time to time" [S45]. Roblox's Duvall team built with an avatar present in both DCC and Studio to size doors and steps and wanted interiors spacious but not absurdly large [S11].

## How to apply it (rules for an AI builder)

Process
- DO decide the metrics card first (see Recipe 1): grid size, wall height, door size, hallway width, stair rise, avatar height 5, jump 7.2, gap limit 6, and write it into folder or attribute names so later steps reuse it [S1][S10].
- DO build in stages with gates: sketch (text layout of zones and routes), blockout of cheap Parts in one folder, scale check with a rig, route and sightline check, art pass by zone, optimisation pass, then clean-up that deletes the blockout and the Baseplate [S1][S4][S11].
- DO keep an organised Workspace: a `World` folder with `Blockout_Parts`, `Terrain`, `Buildings`, `Props` and `Decor` sub-folders, descriptive names, models grouped per building or room [S7][S57][S73].
- DO anchor everything in static levels (only doors and movers unanchored) [S3][S15].
- DON'T polish before the blockout has been walked; changing a layout later costs the art [S1][S73].

Scale and layout
- DO treat 5 studs as the avatar height and size everything against it; doors at least 6 wide by 9 tall for single file (derived), 10 wide corridors where two avatars pass [S1][S43][S47]. A 7-8 tall door is the community minimum and looks cramped to a third-person camera (derived).
- DO make stairs with rise 0.6-0.8 studs and run 1.0-1.5 (derived from [S44]); for steep or long climbs use a ramp (invisible or visible) with a slope of 45 degrees or less (derived).
- DO keep jump gaps at most 6 studs and step-ups at most 5-6 studs (see 05 derivation of 7.2 stud jump) [S7].
- DO use curved, multi-direction routes and break straight lines of sight to the goal; place a landmark at each decision point [S10][S48][S56].
- DO space points of interest about 40 seconds of walking apart in open worlds and keep combat lanes about 32 studs wide with three or fewer exits per pocket [S1][S37][S38].
- DON'T copy real-world scale 1:1 for interiors; scale rooms and furniture 1.3-2x (derived, see 05 for the 2018 advice) [S11].

Building with Parts
- DO prefer Block, WedgePart, CornerWedgePart for structure; DON'T use Sphere or Cylinder for low-poly styles unless the shape requires it (triangle counts in [S61]) [S33][S34].
- DO make walls from separate pieces around openings instead of CSG: a doorway is left column + right column + lintel; a window is those plus a sill piece (Recipe 5). This also respects the plugin's allowlist, which creates Part, WedgePart, CornerWedgePart, TrussPart, Model, Folder and others but no UnionOperation (repo observation) [S86].
- DO use SmoothPlastic, saturated mid-value colours and few parts for the cartoon/low-poly style; add darker patches for stone [S32][S34]. For realism use Roblox materials plus MaterialVariant overrides rather than modelling detail [S12][S63].
- DON'T hollow solid shapes you never see inside; keep walls thin (0.7-1 stud) and delete faces nobody sees [S33][S35].
- DON'T use unions for decoration or curves; if a union is unavoidable set CollisionFidelity Box/Hull and RenderFidelity Automatic [S59][S60][S63].

Terrain
- DO sculpt macro first (brush 32-64, Draw), then Smooth and Sculpt (strength about 0.3-0.6, derived), flatten playable areas at a fixed Y plane, add water with Fill or Sea Level, paint materials, and finish with 3-8 stud detail brushes [S6][S19].
- DO fit a terrain edit inside the plugin's budget: voxels are 4 studs and one terrain edit in the Apple plugin is capped at 65,536 voxels, about 256 x 64 x 256 studs, so tile large areas (repo observation, 2026-10-04) [S86].
- DO vary elevation, avoid straight paths, mix materials (Grass, Ground, Mud, Rock, Sand) and recolour with `SetMaterialColor` for a palette [S52][S56].
- DON'T hollow terrain; filled terrain is cheaper (see 05) [S59].

Kitbashing and sourcing
- DO prefer first-party sample kits and your own packages; for any third-party model, vet it first (Recipe 16), delete all scripts it does not need and verify triangle/vertex counts on the asset page [S23][S81].
- DON'T keep any inserted Script, LocalScript or ModuleScript you did not read; DON'T keep anything with `require` of a number, getfenv, setfenv, loadstring or LoadAsset [S23][S80].
- DO re-skin kit pieces with tint, scale, MaterialVariant or SurfaceAppearance swaps and a few props to make them look distinct [S9].

Optimisation while building
- DO set flags as you build, not at the end: Anchored true, CanCollide/CanTouch/CanQuery off on decoration, CastShadow off on small or unseen parts, CollisionFidelity Box on plain mesh walls, Hull on trims, RenderFidelity Automatic or Performance [S3].
- DO reuse mesh IDs and materials, convert repeated assets to packages, merge groups of static meshes where it cuts draw calls, and delete hidden geometry [S4][S5][S60].
- DO keep transparency to 0 or 1 and avoid overlapping transparent parts [S5][S59].
- DO model interiors as closed opaque shells so occlusion culling can help (beta, verify) [S64].
- DO check Scene Analysis triangle composition and Shift+F2 stats at each milestone, on a throttled quality level [S27].

## Recipes (each becomes a skill)

### Recipe 1: Metrics card (set once, before any building)
When to use: first step of any map, house or prop set.
Steps:
1. Fix the grid: 5 studs for blockout (derived from [S1][S2]); if a modular kit is planned use one of 5, 7.5 or 16 (documented examples [S2][S9][S10]); finish detail on 1, 0.5, 0.25 and below (ladder from [S73][S41]).
2. Record the character numbers: height 5, walk 16 studs/s, jump about 7.2, gravity 196.2 (see 05) [S47].
3. Fix the architecture numbers (derived unless tagged): ground floor slab 1 thick; exterior wall 1 thick (community 0.7 [S35]); interior partition 0.5-0.7; interior ceiling clear height 12-14; exterior wall height per storey 14-15 including slab; single door opening 6 x 9; double door 10 x 10; corridor 10 wide [S1]; window 4 wide x 4 high, sill 3.5 above floor; stair rise 0.6-0.8, run 1.0-1.5 [S44]; roof overhang 1-2 plus 1 for a shingle layer [S35]; railing height 3.5-4.
4. Fix budgets: parts per building 100-600 [S39], map total 15-30k parts [S61], triangles and draw calls as in 05.
5. Store them as attributes on a `World` folder (Luau snippet "Metrics attributes") so later ops read one source.
Pitfalls: mixing grids; making doors 7 studs high because they "look right" on a baseplate when a third-person camera makes them feel low; letting scale drift by zone.

### Recipe 2: Blockout (greybox) to final, stage-gated
When to use: any map from a one-line idea.
Steps:
1. Write the 2D layout as text: zones with sizes, spawn, goal, routes, landmark per zone [S11][S36].
2. Create `World` with `Blockout_Parts` (exact names are conventional in the Roblox tutorial) [S7]. Use SmoothPlastic Parts, Anchored true, colour-coded by role (the curriculum uses deep orange 255,176,0 for walls, persimmon 255,89,89 and lapis 16,42,220 for team floors, bright green 75,151,75 for exterior elevation) [S1].
3. Place the avatar-scale rig and walk the route in Test mode; fix scale, route length, sightlines, spawn exits [S1][S11].
4. Gate 1: the whole route is completable, no jump or gap exceeds the metrics card, three or fewer exits per pocket where combat exists.
5. Replace blockout zone by zone with kit pieces or finished props; keep the greybox hidden (Transparency 1, CanCollide off) or delete it only after the replacement is checked [S4].
6. Terrain, lighting and atmosphere pass (see 05), then set dressing (Recipe 18).
7. Gate 2 (optimisation, Recipe 17) before polishing lighting; Gate 3: delete greybox geometry and Baseplate, then retest [S4].
Pitfalls: building art on an unplayed layout; leaving invisible blockout parts in (they still cost) [S62]; skipping playtests for scale.

### Recipe 3: Three-lane combat arena blockout (Roblox sample logic)
When to use: PvP or team maps, laser-tag style.
Steps:
1. Snap to 5 studs and 90 degrees [S1].
2. Make one spawn zone per team at opposite ends with two exits each [S1].
3. Lay out three lanes (interior, middle, exterior) and five cross lanes; each intersection is a combat pocket; limit each pocket to three exits [S1].
4. Make perimeter walls at least 10 studs tall and hallways at least 10 wide [S1]; use 32-stud main routes for open PvP [S37].
5. Add floor levels: main floor, a mezzanine over half the middle pocket and an outdoor drop, joined by WedgeParts [S1].
6. Add risk/reward vantage spots (watchtowers) and cover props; keep interior rooms to 2-3 entrances with no camping nooks [S36][S37].
7. Colour-code the blockout, test with two teams, then build the kit (Recipe 15).
Pitfalls: long straight sightlines; cover too low (cover must exceed avatar height 5 to block) (derived).

### Recipe 4: Open-world blockout
When to use: survival, adventure, hub worlds.
Steps:
1. Pre-plan narrative, a list of points of interest (POIs), landmarks, spawn [S38].
2. Block out POIs in a triangle layout with basic blocks; mark biome borders [S38].
3. Draw main paths between POIs; keep each POI about 40 seconds of walking from the next (about 640 studs at 16 studs/s, derived) [S38].
4. Draw circles of interest around POIs so they overlap, then place in-between sites (camps, cabins) in the overlaps [S38].
5. Playtest travel time, add shortcut paths, mark resource and loot spots within 15-20 seconds of paths [S38].
6. Give each biome its own palette and material set; make paths curved [S48][S56].
Pitfalls: a straight shot from spawn to goal [S10]; empty distances without terrain variation.

### Recipe 5: Simple house from Parts (walls with openings, no CSG)
When to use: homes, shops, cabins in a tycoon, roleplay or town map.
Steps:
1. Footprint: pick a grid-aligned rectangle (for example 32 x 24) and mark rooms by 2D boxes first [S35][S11].
2. Floor slab: Part Size (L, 1, W), SmoothPlastic or Wood, anchored.
3. Walls: for each wall call the `buildWall` snippet with thickness 1 (0.7 for finer builds [S35]), height 12-14; door opening x offset on a 5-stud grid, width 6, height 9, y 0; windows width 4, height 4, y 3.5.
4. Make wall ends overlap at corners by one thickness so no gap shows (derived).
5. Interior partitions at thickness 0.5-0.7 with 6 x 9 doors, corridors 10 wide if two players must pass [S1].
6. Add baseboards and window frames as thin parts (0.3-0.5 deep), different colour or material from the wall [S35].
7. Ceiling slab 1 thick; second floor uses the same grid so walls stack.
8. Roof: Recipe 7. Exterior details: porch, steps (Recipe 8), chimney, sign.
9. Flags: Anchored, CanCollide on walls, CastShadow on walls only, decoration flags per Recipe 17. Typical result: 60-250 parts for a one-storey house (derived).
Pitfalls: z-fighting where two coplanar faces overlap (offset by 0.01-0.05 or change thickness); door frames taller than the player's camera height; hollow interiors nobody enters (a shell with no interior is cheaper) [S33].

### Recipe 6: Room and interior layout
When to use: any enterable building.
Steps:
1. Draw a 2D floor plan (zones, entrances, windows, furniture list per room) before 3D; the Duvall team drew boxes per room and a props list per room [S11][S35].
2. Choose room sizes from player count and furniture: allow a 10-stud main walkway; avoid ceilings below 12 so the camera clears (derived) [S35].
3. Place anchors first: bed, table, counter, stove on walls or centred, then fill with decorative items in layers: floor items, wall items, ceiling items, then decorative items on surfaces (the four categories used by a community placement system [S82]).
4. Typical furniture heights (derived from real sizes times about 1.3 for studs: 0.28 m per stud): table top 3.0-3.5, chair seat 1.8-2.0, bed 2-2.5, counter 3.5, door handle 3.5.
5. Light: a few ceiling lamps (PointLight Range 20-30, shadows off) plus one hero light (see 05 for values); keep light count low [S3][S27].
6. Close the shell with opaque walls and a ceiling so occlusion culling can hide what is behind [S64].
Pitfalls: oversized 1:1 furniture in a room that is only 8 studs wide; doorways blocked by furniture; too many tiny props (each is a part).

### Recipe 7: Gable and hip roofs
When to use: houses, huts, stands.
Steps:
1. Decide pitch with rise over half-span; for a 24-stud span and rise 6 the pitch is about 26.6 degrees (6:12) (derived); 8 gives about 33.7 degrees.
2. Orientation-safe method: two tilted slabs. Slab length = sqrt(half-span^2 + rise^2) + overhang (1-2 studs [S35]), thickness 0.7-1, rotated about Z by plus/minus atan2(rise, half-span), centred over each side (snippet `buildGableRoof`).
3. Close gable ends with a stepped stack of blocks narrowing by 2 studs per 1 stud of height, or a triangle made from two WedgeParts after verifying the wedge's slope direction on a test part (unverified; builders align wedges with the Align Dragged Objects option and GapFill [S71]).
4. Hip roof: four slabs meeting at ridge and corners, using CornerWedgeParts at hips; accept small clipping at hips or use GapFill to fill (2022 thread) [S71].
5. Add a 1-stud fascia strip and a ridge cap in a darker colour; shingles as an extra thin slab layer 1 stud beyond the eave [S35].
Pitfalls: corner wedges clip when unioned; do not union roofs; check eave overhang against walls so rain-free interiors look right.

### Recipe 8: Stairs, ramps and ledges
When to use: any elevation change.
Steps:
1. Total rise R and chosen step rise r (0.6-0.8 [S44]); steps n = ceil(R / r); recompute r = R / n.
2. Run per step 1.0-1.5 (1:1 is common [S44]); width at least 6 for one avatar, 10 for two.
3. Solid steps: step i is a Block of height r*i so the underside is solid (snippet `buildStairs`).
4. For long climbs add an invisible ramp part (Transparency 1, CanCollide true, rotated to the stair slope) over the steps so avatars glide rather than hop [S44].
5. Landings every 8-10 steps; handrails 3.5 high on open sides (derived).
6. For ledges the player must jump up to, keep them at most 5-6 studs; for blocking walls use at least 10 [S1].
Pitfalls: step height over 0.8 triggers hopping animation [S44]; stairs steeper than 1:1 look and feel like ladders.

### Recipe 9: Low-poly tree from primitives
When to use: forests, parks, simulators.
Steps (derived dimensions, 4-6 parts):
1. Trunk: Block 1.5 x 8 x 1.5, brown, SmoothPlastic, buried 0.5 in the ground.
2. Canopy tiers: three Blocks 10 x 4 x 10, 7 x 4 x 7, 4 x 4 x 4 stacked with 3-stud overlap, each yawed 0, 30 and 60 degrees, in two greens (lighter on top); or one WedgePart-based cone.
3. Optional: one darker 6 x 1.5 x 6 block under the lowest tier for shading.
4. Group as a Model with PrimaryPart the trunk; set CastShadow off on the top tiers only if distant; Anchored true.
5. Make 3-4 variants by scaling the model 0.8-1.4x and varying yaw; reuse the model, not new parts. Trees should be 15-40 studs tall, 3-8x avatar height (derived).
Notes: avoid spheres (432 triangles each in the 2021 count) [S61]; community says low-poly means smooth plastic, bright colours and a low part count [S34][S31]. For mesh trees: stylised trees use leaf-card meshes with a 512 branch texture and DoubleSided or duplicated flipped cards, transparency 0 for opaque cutouts [S74][S78]; in Blender a skin modifier trunk plus an ico-sphere or beveled-cube canopy is the standard tutorial recipe, exported as FBX/OBJ [S75][S76].
Pitfalls: identical trees in a grid; semi-transparent leaves overlapping (overdraw) [S5].

### Recipe 10: Low-poly rocks and boulder clusters
When to use: terrain dressing, caves, shorelines.
Steps (derived dimensions):
1. Cluster of 3-5 Blocks sized 4-10 studs, each rotated randomly up to about 25-35 degrees on all axes, overlapping, sunk 30-40 percent into the ground (community: scale parts differently and rotate on X for depth [S79]).
2. Colour two to three greys or one tinted grey; SmoothPlastic for cartoon, Slate for realism [S79].
3. Add one WedgePart cap for a sloped top; add moss as a thin green block on top faces only (optional).
4. For realism use terrain: `Terrain:FillBall` with Rock material, radius 6-14, then Sculpt or Smooth; terrain rocks avoid part-count cost [S19][S79].
5. For meshes: icosphere, subdivide, sculpt, duplicate and decimate for the low version, bake normals, export both, import the low one [S77].
6. Scatter with random yaw and 0.8-1.3x scale (Recipe 18).
Pitfalls: rocks perfectly axis-aligned look like crates; leaving rocks floating on slopes (sink them).

### Recipe 11: Small props from primitives (lamp post, fence, crate, sign)
When to use: filling streets, yards, markets.
Steps (derived dimensions):
1. Lamp post: pole Block 0.6 x 10 x 0.6 (dark metal colour), arm 0.5 x 0.5 x 3 at the top, lamp head Block 1.6 x 1 x 1.6 in Neon, PointLight Range 20, Brightness 1, Shadows false [S39][S59]. About 4 parts.
2. Fence section 6 studs long: two posts 0.8 x 4 x 0.8, two rails 0.4 x 0.6 x 6 at heights 1.2 and 2.8; repeat every 6 studs on the 5 or 6-stud grid; vary post height by 0.2 for charm. 4 parts per section. For curves, set segment angle steps of 7.5, 15 or 22.5 degrees that sum to a full turn (golden increment 0.25 for sizes [S41]).
3. Crate: Block 3 x 3 x 3 with a 0.3-stud-thick darker frame strips; 6-8 parts or one textured Part.
4. Sign: post 0.5 x 7 x 0.5, board Block 5 x 3 x 0.3; use a SurfaceGui text or a Decal on one face only (texture only on faces that matter) [S59].
5. Group each as a Model, set pivots at the bottom, convert reused props to packages [S3][S10].
Pitfalls: decals on all faces (7x cost) [S59]; neon on large areas (high cost) [S39].

### Recipe 12: Paths, roads, bridges and curves
When to use: park paths, roads, bridges, rivers.
Steps:
1. Lay a centre line of points with gentle bends; no straight run over about 60-80 studs (derived from [S10][S48][S56]).
2. Build as straight segments rotated by equal angle increments (7.5, 15 or 22.5 degrees) so the segments sum to the planned bend; use Archimedes-style repeated rotation or script the CFrame loop (snippet `placeAlongCurve`) [S41].
3. Road: width 20-24 for two lanes (derived), path 8-12 (derived), kerb 0.5 high; terrain material Asphalt or Cobblestone, or thin Parts.
4. Bridge: deck Block 12 x 1 x length, supports every 16-24 studs, railing 3.5 high; arch bridges from wedges or a mesh.
5. For terrain-hugging paths, paint terrain with Paint (Mud, Ground, Sand, brush 3-8) instead of laying parts [S19][S56].
6. Fill small gaps in segmented curves with a GapFill-type approach or overlap segments; do not union [S41].
Pitfalls: gaps at the outside of bends; z-fighting between road and terrain (raise parts 0.05-0.1).

### Recipe 13: Terrain sculpt in the right order
When to use: any natural map.
Steps:
1. Block out scale with Parts (Recipe 2) or the Generate tool over a selected region (biomes, blending, seed) [S19].
2. Macro: Draw (brush 32-64, sphere) add hills and subtract valleys; Transform/Select to move whole regions [S6][S19].
3. Meso: Sculpt (strength 0.3-0.6, derived) to add ridges and erode edges; V-shaped valleys with branching patterns for realism [S52].
4. Smooth: Smooth tool or hold Shift while using Draw or Sculpt; Flatten (Fixed Y plane) for building pads and the spawn [S6][S19].
5. Water: Sea Level over the region, or Fill/Replace Air to Water; core tutorial region 1800 x 5 x 1800 at Y -15 [S6][S19].
6. Materials: Paint Leafy Grass in the middle, Grass edges (brush 3), Sand at waterline, Rock on slopes, Mud near water; recolour ground/mud toward green for moss [S6][S52].
7. Micro: brush 1-8 for path indents, shoreline, cliff faces; add small hills between trees [S56].
8. Dress: trees (two layers), rocks, logs, ferns, flowers (Recipe 18); lighting per 05.
9. Playtest: walk the route; adjust the spawn (core tutorial rotates SpawnLocation until players face the island) [S6].
Pitfalls: terrain edits beyond the plugin's 65,536 voxel cap (tile them) [S86]; huge flat green areas (add elevation and material variation); hollow terrain.

### Recipe 14: Blockout parts to terrain (cliffs and shapes)
When to use: when a precise silhouette is needed (cliffs, arches, bowls).
Steps:
1. Build the shape from Blocks and WedgeParts on the 5-stud grid.
2. Convert with Part To Terrain (wedges use `Terrain:FillWedge`) or Object to Terrain (MeshParts, unions, corner wedges, chunked voxelisation) [S70]; each voxel is 4 studs so shapes thinner than 4 studs round off (see 05).
3. For scripts: `Terrain:FillBlock`, `FillBall`, `FillCylinder`, `FillWedge`; in the Apple plugin use `terrain_edit` fill_block/fill_ball/fill_region/replace_material with the voxel cap (repo observation) [S86].
4. Hide or delete the source parts; smooth edges with Smooth; paint materials by slope (rock on steep, grass on flat); an automatic converter can assign materials by slope and altitude [S50].
5. Check for floating islands and holes from thin parts.
Pitfalls: converting mesh parts with no thickness; running very large conversions in one go; plugin speed differences [S70].

### Recipe 15: Modular kit build (walls, floors, trims)
When to use: repeated architecture (stations, dungeons, cities).
Steps:
1. Choose the grid (5, 7.5 or 16) and write it down [S2][S9][S10].
2. Define 8-15 pieces: floor, wall large/mid/small, corner inner/outer, door frame plus door plug, window, ceiling, trim long/short/corner, stair, skylight; each at least 5 studs (grid) and divisible by the smallest [S2][S4].
3. Pivot at the forward-most lower corner; props by their attach face [S2][S9].
4. Model in Blender at 1 unit per stud, UV all pieces to one trim sheet; use quads; one SurfaceAppearance per set [S10][S58].
5. Import, add SurfaceAppearance packages, set flags (Anchored, Box/Hull collision, RenderFidelity), convert pieces to packages with AutoUpdate [S3][S25].
6. Assemble with grid snapping and numeric coordinates; the laser-tag build used 15-30 modular assets per room and about 90 minutes in total [S4].
7. Swap colours or MaterialVariants per zone (the sample used mint, pink and neutral concrete by team) [S4][S9].
8. Do not edit instances in place; edit the package so changes propagate [S10].
Pitfalls: a one-off piece that breaks the grid; baked-in grime making repeats obvious [S12]; kit pieces thinner than needed that leak light.

### Recipe 16: Kitbashing from the Creator Store safely
When to use: whenever third-party models are inserted.
Steps:
1. Prefer assets by verified, high-usage creators and first-party samples; read the asset page counts (triangles, vertices, scripts) before inserting [S23].
2. Insert into an isolated place or a quarantined Folder first (a community tip: an empty baseplate place); do not insert into the main place [S81].
3. Run the scan snippet: list every Script, LocalScript and ModuleScript, and flag `require(<number>)`, getfenv, setfenv, loadstring, LoadAsset, InsertService, HttpService, obfuscated strings or abnormally deep nesting [S23][S80][S81].
4. Delete all scripts that are not clearly needed (decorative models need none); or right-click and Disable Scripts [S23].
5. Check descendants count and names: hundreds of nested emoji-named children are a malware pattern [S81].
6. Normalise: rename, set pivots, set flags (Recipe 17), unify MeshIds and materials, tint toward the project palette [S9].
7. Convert accepted pieces to packages in your own asset place and use those, not the original [S25].
8. Optional hardening: Sandboxed property with limited Capabilities (client beta) [S26].
Pitfalls: trusting "verified" badges alone (2025 reports of verified-ID malware) [S81]; scripts hidden in MeshParts; assets that auto-update by remote require.

### Recipe 17: Optimisation pass while building
When to use: at each stage gate and before every playtest build.
Steps:
1. Run the stats snippet: part count by class, unique MeshIds, semi-transparent parts, parts with CanCollide false but CanQuery true.
2. Static decoration: CanCollide false, CanTouch false, CanQuery false (unless raycasts must hit), CastShadow false for small parts [S3].
3. Meshes: CollisionFidelity Box (plain walls and decoration), Hull (trims, rocks), Default only where shape matters; RenderFidelity Automatic or Performance for foliage [S3][S60].
4. Replace unions with meshes or plain parts; unify MeshIds [S59][S63].
5. Remove hidden geometry, the Baseplate, invisible blockout parts and faces never seen [S4][S33].
6. Transparency 0 or 1 only; merge multi-part windows [S59].
7. Convert repeated pieces to packages; merge static meshes per room where possible [S5][S25].
8. Check Scene Analysis triangle composition and wireframe rendering; compare with the baseline phone numbers in 05 [S27].
9. Turn on StreamingEnabled and use Model LevelOfDetail (SLIM) for static buildings, models under about 64 cubic studs of extent, atomic models for scripted groups (see 05) [S20].
Pitfalls: optimising by hiding parts with Transparency 1 (they still cost, 2022) [S62]; setting CanCollide false on floors; CanQuery off on walls that weapons must hit [S3].

### Recipe 18: Set dressing and detail layering
When to use: final art pass of any zone.
Steps:
1. Focal points first: place a hero prop or landmark at each decision point [S10][S36].
2. Layer by distance: foreground interactables and clutter near the path, midground buildings, background silhouettes (05 gives distances) [S56].
3. Vegetation in two or three size layers (large trees, small trees, bushes, ferns, flowers) [S56].
4. Scatter with rules: random yaw, 0.8-1.3x scale, min spacing, slope and height masks, exclusion zones for paths and water (Brushtool or script) [S48]; snippet `scatterProps`.
5. Break repetition: vary colour, size and angle of props; use tint on SurfaceAppearance; add grunge overlay on tiling [S9][S49].
6. Palette discipline: mostly neutrals with rare accents (flowers, mushrooms) [S49].
7. Add small guiding lights and particles last.
8. Re-run Recipe 17 and a Test-mode walk at avatar height.
Pitfalls: uniform spacing; props floating or sunk deep; clutter on the critical path blocking movement (route clearance 10 studs).

### Recipe 19: Using Studio AI generation inside a building workflow
When to use: when a unique prop or kit piece is faster to generate than model.
Steps:
1. Place a bounding-box Part where the asset goes and select it; run `/generate_mesh <object>` (name the object, then add material, wear, features; do not describe background, camera or lighting) [S28][S29].
2. For parametric items (bookcase with N shelves, table with chairs) use `/generate_procedural_model` and name the editable properties and how parts scale; limit 50 per rolling 24 hours [S28][S29].
3. Segment into parts at generation (up to 8) or with `/segment_mesh` (up to 5 per run) when parts must move [S28][S68].
4. Validate: triangle budget (20k mesh max; props 500-3000 derived, see 05), watertight if CSG is wanted, scale against the avatar, anchor, set flags and collision fidelity [S13][S22].
5. Save as a package; treat generated textures as a starting point and expect custom normals or mesh IDs to change on regeneration [S68].
6. For code-driven kits write a ProceduralModel generator (`OnGenerate(params, targetContainer)`), which regenerates on attribute change or resize [S21].
Pitfalls: moderation uncertainty for generated content (users asked in 2026) [S68]; generated meshes with excess triangles; segmentation depends on topology [S28].

### Recipe 20: Scale check with a reference rig
When to use: after each zone and before sign-off.
Steps:
1. Insert a 5-stud R15 reference rig or the player's character.
2. Compare door height (at least 1.8x avatar), corridor width (at least 2x avatar width), step rise (at most 0.8), ledge heights and gap widths against the metrics card [S1][S44][S45].
3. Walk the route in Test mode at default camera; look from the third-person camera for headroom and clutter [S11].
4. Use different colours per build section to check proportions [S45].
Pitfalls: relying on top-down views; testing only with one avatar body type (Rthro is taller, snippet) [S43][S47].

## Luau reference snippets

```lua
--!strict
-- Metrics attributes on a World folder so every later step reads one source of truth.
local world = workspace:FindFirstChild("World") or Instance.new("Folder")
world.Name = "World"
world.Parent = workspace
world:SetAttribute("Grid", 5)
world:SetAttribute("AvatarHeight", 5)
world:SetAttribute("WallHeight", 14)
world:SetAttribute("CeilingClear", 12)
world:SetAttribute("DoorW", 6)
world:SetAttribute("DoorH", 9)
world:SetAttribute("CorridorW", 10)
world:SetAttribute("StairRise", 0.7)
world:SetAttribute("StairRun", 1.2)
for _, name in { "Blockout_Parts", "Terrain", "Buildings", "Props", "Decor" } do
	if not world:FindFirstChild(name) then
		local f = Instance.new(if name == "Blockout_Parts" then "Model" else "Folder")
		f.Name = name
		f.Parent = world
	end
end
```

```lua
--!strict
-- Wall with openings built from separate Parts (no CSG). Wall runs along local X from 0 to length;
-- origin is the bottom-left corner on the wall's centre plane. Openings must not overlap.
type Opening = { x: number, w: number, y: number, h: number }

local function buildWall(parent: Instance, origin: CFrame, length: number, height: number, thick: number,
	openings: { Opening }, color: Color3, material: Enum.Material)
	table.sort(openings, function(a, b) return a.x < b.x end)
	local function box(x0: number, x1: number, y0: number, y1: number)
		if x1 - x0 < 0.05 or y1 - y0 < 0.05 then return end
		local p = Instance.new("Part")
		p.Anchored = true
		p.Size = Vector3.new(x1 - x0, y1 - y0, thick)
		p.CFrame = origin * CFrame.new((x0 + x1) / 2, (y0 + y1) / 2, 0)
		p.Color = color
		p.Material = material
		p.Parent = parent
	end
	local cursor = 0
	for _, o in openings do
		box(cursor, o.x, 0, height)               -- solid column before the opening
		box(o.x, o.x + o.w, 0, o.y)               -- sill (zero height for a door)
		box(o.x, o.x + o.w, o.y + o.h, height)    -- lintel
		cursor = o.x + o.w
	end
	box(cursor, length, 0, height)
end

-- Example: 24-long wall, 14 high, 1 thick, a door at x=5 and a window at x=15.
-- buildWall(workspace.World.Buildings, CFrame.new(0, 1, 0), 24, 14, 1,
--   { { x = 5, w = 6, y = 0, h = 9 }, { x = 15, w = 4, y = 3.5, h = 4 } },
--   Color3.fromRGB(235, 220, 190), Enum.Material.SmoothPlastic)
```

```lua
--!strict
-- Solid stairs toward local -Z. origin = bottom front edge of the first step.
local function buildStairs(parent: Instance, origin: CFrame, totalRise: number, run: number, width: number, maxRise: number)
	local steps = math.ceil(totalRise / maxRise)
	local rise = totalRise / steps
	for i = 1, steps do
		local p = Instance.new("Part")
		p.Anchored = true
		p.Size = Vector3.new(width, rise * i, run)
		p.CFrame = origin * CFrame.new(0, rise * i / 2, -(run * (i - 0.5)))
		p.Material = Enum.Material.SmoothPlastic
		p.Parent = parent
	end
end
-- buildStairs(workspace.World.Buildings, CFrame.new(0, 0, 0), 7, 1.2, 8, 0.8)
```

```lua
--!strict
-- Gable roof from two tilted slabs (orientation-safe, no wedge assumptions).
-- origin = wall-top height on the span centre line (the ridge sits `rise` above it); ridge runs along local Z.
local function buildGableRoof(parent: Instance, origin: CFrame, span: number, ridgeLength: number,
	rise: number, overhang: number, thick: number, color: Color3)
	local half = span / 2
	local angle = math.atan2(rise, half)
	local slabLength = math.sqrt(half * half + rise * rise) + overhang
	for _, side in { -1, 1 } do
		local p = Instance.new("Part")
		p.Anchored = true
		p.Size = Vector3.new(slabLength, thick, ridgeLength)
		-- slab centre sits halfway down the slope, shifted outward by half the overhang
		local cx = side * (half / 2 + (overhang / 2) * math.cos(angle))
		local cy = rise / 2 - (overhang / 2) * math.sin(angle)
		p.CFrame = origin * CFrame.new(cx, cy, 0) * CFrame.Angles(0, 0, -side * angle)
		p.Color = color
		p.Material = Enum.Material.SmoothPlastic
		p.Parent = parent
	end
end
```

```lua
--!strict
-- Place segments along a bend with equal angle steps (sum of steps = total bend).
local function placeAlongCurve(parent: Instance, start: CFrame, segments: number, segLength: number,
	totalBendDeg: number, width: number)
	local step = math.rad(totalBendDeg) / segments
	local cf = start
	for i = 1, segments do
		cf = cf * CFrame.Angles(0, step / 2, 0)   -- half-turn, place, half-turn
		local p = Instance.new("Part")
		p.Anchored = true
		p.Size = Vector3.new(width, 1, segLength + 0.1)  -- slight overlap hides seams
		p.CFrame = cf * CFrame.new(0, 0, -segLength / 2)
		p.Material = Enum.Material.Cobblestone
		p.Parent = parent
		cf = cf * CFrame.new(0, 0, -segLength) * CFrame.Angles(0, step / 2, 0)
	end
end
```

```lua
--!strict
-- Scatter props on terrain: random yaw, scale, min spacing, slope mask. Server or plugin context.
local function scatterProps(template: Model, parent: Instance, center: Vector3, radius: number,
	count: number, minGap: number, seed: number)
	local rng = Random.new(seed)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { parent }
	local placed: { Vector3 } = {}
	local tries = 0
	while #placed < count and tries < count * 25 do
		tries += 1
		local a = rng:NextNumber(0, math.pi * 2)
		local r = radius * math.sqrt(rng:NextNumber())
		local origin = center + Vector3.new(math.cos(a) * r, 300, math.sin(a) * r)
		local hit = workspace:Raycast(origin, Vector3.new(0, -600, 0), params)
		if hit and hit.Instance:IsA("Terrain") and hit.Normal.Y > 0.85 and hit.Material ~= Enum.Material.Water then
			local ok = true
			for _, q in placed do
				if (q - hit.Position).Magnitude < minGap then ok = false break end
			end
			if ok then
				table.insert(placed, hit.Position)
				local clone = template:Clone()
				clone:ScaleTo(rng:NextNumber(0.8, 1.3))
				clone:PivotTo(CFrame.new(hit.Position - Vector3.new(0, 0.3, 0)) * CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0))
				clone.Parent = parent
			end
		end
	end
end
```

```lua
--!strict
-- Vet an inserted model (run in the command bar or a plugin: reading Script.Source needs that context).
local SUSPECT = { "require%s*%(%s*%d+", "getfenv", "setfenv", "loadstring", "LoadAsset", "InsertService", "HttpService" }
local function vet(root: Instance): { string }
	local findings: { string } = {}
	local n = 0
	for _, d in root:GetDescendants() do
		n += 1
		if d:IsA("LuaSourceContainer") then
			table.insert(findings, "script: " .. d:GetFullName())
			local ok, src = pcall(function() return (d :: any).Source end)
			if ok and type(src) == "string" then
				for _, pat in SUSPECT do
					if string.find(src, pat) then
						table.insert(findings, "  suspicious pattern " .. pat .. " in " .. d.Name)
					end
				end
			end
		end
	end
	if n > 2000 then table.insert(findings, ("deep tree: %d descendants"):format(n)) end
	return findings
end
-- for _, line in vet(model) do print(line) end
```

```lua
--!strict
-- Decoration flags and mesh collision settings for a folder of static props.
local function optimiseDecor(root: Instance, smallShadowCutoff: number)
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = true
			d.CanCollide = false
			d.CanTouch = false
			d.CanQuery = false
			local s = d.Size
			d.CastShadow = math.max(s.X, s.Y, s.Z) > smallShadowCutoff
			if d:IsA("MeshPart") then
				d.CollisionFidelity = Enum.CollisionFidelity.Box
				d.RenderFidelity = Enum.RenderFidelity.Automatic
			end
		end
	end
end
-- optimiseDecor(workspace.World.Decor, 3)   -- do NOT run on walls, floors or anything players touch
```

```lua
--!strict
-- Build stats: part counts by class, repeated MeshIds, semi-transparent parts.
local byClass: { [string]: number } = {}
local meshIds: { [string]: number } = {}
local semi = 0
for _, d in workspace:GetDescendants() do
	if d:IsA("BasePart") then
		byClass[d.ClassName] = (byClass[d.ClassName] or 0) + 1
		if d.Transparency > 0 and d.Transparency < 1 then semi += 1 end
		if d:IsA("MeshPart") then meshIds[d.MeshId] = (meshIds[d.MeshId] or 0) + 1 end
	end
end
for c, n in byClass do print(c, n) end
local unique = 0
for _ in meshIds do unique += 1 end
print("unique MeshIds", unique, "semi-transparent parts", semi)
```

```lua
--!strict
-- Terrain via script (documented Terrain methods). Keep each call small in tooling with a voxel cap.
local Terrain = workspace.Terrain
Terrain:FillBlock(CFrame.new(0, -8, 0), Vector3.new(256, 16, 256), Enum.Material.Grass)    -- 64x4x64 cells
Terrain:FillBall(Vector3.new(40, 4, -30), 12, Enum.Material.Rock)                          -- boulder
Terrain:FillWedge(CFrame.new(0, 4, 90), Vector3.new(32, 8, 24), Enum.Material.Sand)        -- ramp
Terrain:FillBlock(CFrame.new(0, -15, 0), Vector3.new(256, 5, 256), Enum.Material.Water)    -- water slab
```

## Open questions / unverified
- Wedge orientation: which local axis the WedgePart slope rises along is not stated in the sources I read; the roof recipe avoids it. Verify with a test part before scripting wedge-based ramps and gable ends.
- Studio default snap values: docs say adjustable and `GridSize`/`RotateIncrement` are read-only to plugins [S30]; the 1 stud default is from a search snippet only. A community post recommends 1 stud and 15 degrees [S42].
- Occlusion culling: only the Nov 2024 beta post and snippets were found; I did not find a general-release announcement, and its exact conditions (opaque only, distance behaviour) come from snippets.
- Door and stair numbers: Roblox publishes only the 10-stud hallway and 10-stud wall rules [S1]; the 6 x 9 door, 12-14 ceiling and 0.6-0.8 stairs are derived from community threads and scaling [S43][S44]. The 7.5-8 by 5-6 door range is a snippet from a page that returned 403 [S43b].
- Part and triangle counts: primitive triangle counts (Part 12, Wedge 10, Cylinder 96, Sphere 432) come from a single 2021 forum post; part-count budgets are 2021-2022 community numbers. 05 holds the 2024 mobile budget.
- The Beyond the Dark and Duvall Drive pages are Roblox demos from the PBR launch era (about 2021, the pages are undated); their texture sizes and a mobile "10,000 vertices" remark are older than the current 20,000-triangle mesh limit (see 05); treat those figures as stale.
- Photographed numbers for furniture sizes, stair slopes and house dimensions are derived scalings, not from a builder's measured blueprint; no builder portfolio with part counts per prop was opened.
- CSG on meshes: whether MeshParts from CSG tools will ever persist across sessions is not confirmed (the July 2026 note says not yet) [S66].
- Script Capabilities are a client beta; whether Creator Store models can be sandboxed automatically on insert is not documented [S26].
- Plugin recommendations (Redupe, Brushtool, ScatterForge, Studio Build Suite, GeomTools) come from community posts and a creator interview; no safety review of each plugin was done.
- Whether Roblox moderates AI-generated assets differently is unresolved (user question, no staff answer seen) [S68].

## Sources
Official docs (raw markdown from github.com/Roblox/creator-docs, which publishes create.roblox.com/docs; fetched 2026-10-04; pages undated):
[S1] Greybox your environment (Environmental art curriculum ch. 1), Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/greybox-your-environment
[S2] Develop polished assets (ch. 2), Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/develop-polished-assets
[S3] Assemble an asset library (ch. 3), Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/assemble-an-asset-library
[S4] Construct your world (ch. 4), Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/construct-your-world
[S5] Optimize your experience (ch. 5), Roblox, https://create.roblox.com/docs/tutorials/curriculums/environmental-art/optimize-your-experience
[S6] Create an environment with terrain (Core curriculum), Roblox, https://create.roblox.com/docs/tutorials/curriculums/core/building/create-an-environment-with-terrain
[S7] Greybox a playable area (Core curriculum), Roblox, https://create.roblox.com/docs/tutorials/curriculums/core/building/greybox-a-playable-area
[S8] Apply polished assets (Core curriculum), Roblox, https://create.roblox.com/docs/tutorials/curriculums/core/building/apply-polished-assets
[S9] Assemble modular environments (use-case tutorial), Roblox, https://create.roblox.com/docs/tutorials/use-case-tutorials/modeling/assemble-modular-environments
[S10] Building architecture (Beyond the Dark), Roblox, https://create.roblox.com/docs/resources/beyond-the-dark/building-architecture
[S11] Construct the house (The Mystery of Duvall Drive), Roblox, https://create.roblox.com/docs/resources/the-mystery-of-duvall-drive/construct-the-house
[S12] Materialize the world (The Mystery of Duvall Drive), Roblox, https://create.roblox.com/docs/resources/the-mystery-of-duvall-drive/materialize-the-world
[S13] Solid modeling, Roblox, https://create.roblox.com/docs/parts/solid-modeling
[S14] Meshes, Roblox, https://create.roblox.com/docs/parts/meshes
[S15] Parts, Roblox, https://create.roblox.com/docs/parts
[S16] Models, Roblox, https://create.roblox.com/docs/parts/models
[S17] Pivot tools, Roblox, https://create.roblox.com/docs/studio/pivot-tools
[S18] Align tool, Roblox, https://create.roblox.com/docs/studio/align-tool
[S19] Terrain Editor, Roblox, https://create.roblox.com/docs/studio/terrain-editor
[S20] Instance streaming: techniques and conversion, Roblox, https://create.roblox.com/docs/workspace/streaming/techniques
[S21] Procedural models, Roblox, https://create.roblox.com/docs/parts/procedural-models
[S22] Model generation (GenerationService), Roblox, https://create.roblox.com/docs/parts/model-generation
[S23] Creator Store, Roblox, https://create.roblox.com/docs/production/creator-store
[S24] Asset privacy, Roblox, https://create.roblox.com/docs/projects/assets/privacy
[S25] Packages, Roblox, https://create.roblox.com/docs/projects/assets/packages
[S26] Script capabilities, Roblox, https://create.roblox.com/docs/scripting/capabilities
[S27] Scene Analysis, Roblox, https://create.roblox.com/docs/performance-optimization/scene-analysis
[S28] Assistant for Studio (generate_mesh, procedural models, segmentation), Roblox, https://create.roblox.com/docs/assistant/guide
[S29] Assistant prompt guide and examples, Roblox, https://create.roblox.com/docs/assistant/prompt-engineering
[S30] StudioService class reference (GridSize, RotateIncrement), Roblox, https://create.roblox.com/docs/reference/engine/classes/StudioService
DevForum and other community and press (dates are post dates):
[S31] "Low-Polying Tutorial for Beginners: Low-Poly Basics", Pyrotenics, 2019-02-03 (stale), https://devforum.roblox.com/t/low-polying-tutorial-for-beginners-low-poly-basics/235354
[S32] "General tips and advice when it comes to low poly builds?", replies by Aviator_Firebird, jordonh23, Blqgs and others, 2020-10-07/08 (stale), https://devforum.roblox.com/t/general-tips-and-advice-when-it-comes-to-low-poly-builds/809506
[S33] "Tips before creating a low poly building", replies by lSteveRogersl, Mariofly5 and others, 2019-06-05 (stale), https://devforum.roblox.com/t/tips-before-creating-a-low-poly-building/288652
[S34] "How to create a low poly look/vibe using ROBLOX studio blocks?", replies by Gravity_Defier, ChilledCW, Aotrou, ebur1n, 2019-05-11 (stale), https://devforum.roblox.com/t/how-to-create-a-low-poly-lookvibe-using-roblox-studio-blocks/278566
[S35] "Ruski's Tutorial #2 - How to design a simple house", Trustmeimrussian, 2019-08-14 (stale), https://devforum.roblox.com/t/ruskis-tutorial-2-how-to-design-a-simple-house/330237
[S36] "Ruski's Tutorial #1 - How to design a map layout", Trustmeimrussian, 2019-05-08 (stale), https://devforum.roblox.com/t/ruskis-tutorial-1-how-to-design-a-map-layout/277853
[S37] "Ruski's Tutorial #3 - How to Design a PvP Map", Trustmeimrussian, 2023-12-18, https://devforum.roblox.com/t/ruskis-tutorial-3-how-to-design-a-pvp-map/2746055
[S38] "Ruski's Tutorial #5 - How to Design an Open World Map", Trustmeimrussian, 2025-03-17, https://devforum.roblox.com/t/ruskis-tutorial-5-how-to-design-an-open-world-map/3554962
[S39] "Guide of how to improve your buildings! (Long)", alvarito32 (Bo32k), 2021-12-29 (stale), https://devforum.roblox.com/t/guide-of-how-to-improve-your-buildings-long/1606301
[S40] "Building Tips and Tricks Guide", EndorsedModel, 2015-12-30 (stale), https://devforum.roblox.com/t/building-tips-and-tricks-guide/20964
[S41] "FP1's Guide to Building Curvature in Studio", Fourpapa1, 2020-06-20 (stale), https://devforum.roblox.com/t/fp1s-guide-to-building-curvature-in-studio/635127
[S42] "Tips and Introductory Towards Roblox Building", Gavin42307, 2022-06-08, https://devforum.roblox.com/t/tips-and-introductory-towards-roblox-building/1826639
[S43] "What are good door dimensions?", replies by ImSinfullyFrosty, g8mble, Sporeman15, BanTech, 2020-04-24 (stale), https://devforum.roblox.com/t/what-are-good-door-dimensions/539045
[S43b] "What should be the ideal door size?" (2023; search-result snippet only, page returned 403), https://devforum.roblox.com/t/what-should-be-the-ideal-door-size/2200910
[S44] "Lets talk stairs", replies by Aotrou, MeaxisDev, ash_lyno and others, 2019-12-02 (stale), https://devforum.roblox.com/t/lets-talk-stairs/399364
[S45] "Scaling Buildings Properly", replies by CrazedBrick1, BarbariousBean, souppression, 2021-02-17/20 (stale), https://devforum.roblox.com/t/scaling-buildings-properly/1054615
[S46] "Meter to Stud conversion causes discrepancy...", subsarius with CrazedBrick1, 2023-12 (restates 1 stud = 28 cm), https://devforum.roblox.com/t/meter-to-stud-conversion-causes-discrepancy-between-real-life-proportions-and-roblox-proportions/2734492
[S47] "Adjusts Roblox Rthro avatars so that their height scales match a 5 stud high R15 rig", EgoMoose, GitHub gist (R15 baseline 5 studs; other heights from search snippets), https://gist.github.com/EgoMoose/95d00bed113a2503f4811284fd8a4d1a
[S48] "Creator Spotlight: Meet Ahlvie, the Environmental Artist Behind Fantastical Worlds", Roblox, 2024-05-10, https://devforum.roblox.com/t/creator-spotlight-meet-ahlvie-the-environmental-artist-behind-fantastical-worlds/2964648
[S49] "Map Design and Scene Building: Fantasy, Medieval and Nature maps", Ahlvie, 2020-08-06 (stale), https://devforum.roblox.com/t/map-design-and-scene-building-fantasy-medieval-and-nature-maps/709866
[S50] "Large-Scale Roblox Terrain: The ultimate guide", Vexture, 2019-12-11 (updated 2020-07-03) (stale), https://devforum.roblox.com/t/large-scale-roblox-terrain-the-ultimate-guide/405672
[S51] "Tips for Terraining in Roblox Studio", Fennecpaw, 2019-03-27 (stale), https://devforum.roblox.com/t/tips-for-terraining-in-roblox-studio/258795
[S52] "What are your best terrain/environment tricks?", FIorentius (Florentin) and replies, 2020-01-13 (stale), https://devforum.roblox.com/t/what-are-your-best-terrainenvironment-tricks-and-a-list-of-my-tricks/432393
[S53] "How To Make Realistic Terrain In roblox Studio", alexxk5, 2020-05-06 (stale), https://devforum.roblox.com/t/how-to-make-realistic-terrain-in-roblox-studio/560473
[S54] "How should I go about creating realistic terrain?", replies by Shadow_dud9, Fadeluc_123, Entildo, 2024-02-13 to 18, https://devforum.roblox.com/t/how-should-i-go-about-creating-realistic-terrain/2835904
[S55] "Best way to create realistic terrain?", replies by abcanish123 and Akkoard, 2021-06-03 (stale), https://devforum.roblox.com/t/best-way-to-create-realistic-terrain/1269660
[S56] "Creating REAL Realism (Forest Path)", anon53193547, 2021-07-06 (stale), https://devforum.roblox.com/t/creating-real-realism-forest-path/1332152
[S57] "Tips & Tricks for Building in Roblox Studio - recommended plugins, shortcuts and best practices", replies by TheRobloxianDerg, RuinedSanctuary, MatrixGM_RBX, 2025-04-30 to 05-02, https://devforum.roblox.com/t/tips-tricks-for-building-in-roblox-studio-%E2%80%93-recommended-plugins-shortcuts-and-best-practices/3632450
[S58] "Trim Textures - 3D Modeling and Unwrapping Trim Sheets", SCHLEEMPH (Roblox staff), 2024-09-24, https://devforum.roblox.com/t/trim-textures-3d-modeling-and-unwrapping-trim-sheets/3171223
[S59] "Building Optimisation", Mariofly5 (George), 2019-02-02 (2021 update note) (stale), https://devforum.roblox.com/t/building-optimisation-tips-and-tricks/235059
[S60] "MeshPart Usage, Performance & Optimizations", BullfrogBait, 2021-06-29 (stale), https://devforum.roblox.com/t/meshpart-usage-performance-optimizations/1319217
[S61] "How many parts is 'too many'? When is geometry optimization overkill?", replies by BloodSpring and others, 2021-03-18 (stale; primitive triangle counts and game part counts), https://devforum.roblox.com/t/how-many-parts-is-too-many-when-is-geometry-optimization-overkill/1116692
[S62] "What's a good maximum part count for low-end devices?", replies by JoshGlitcher, TM951atSumex, 2022-08-22, https://devforum.roblox.com/t/whats-a-good-maximum-part-count-for-low-end-devices/1930430
[S63] "Looking for tips to optimize my builds", replies by valantys and Gucci_Dabs222, 2024-11-04, https://devforum.roblox.com/t/looking-for-tips-to-optimize-my-builds/3246138
[S64] "[Studio Beta] Introducing Occlusion Culling", LightBeamRays, 2024-11-07, https://devforum.roblox.com/t/studio-beta-introducing-occlusion-culling/3250604
[S65] "Quick Guide Into CSG: Increasing Performance of Unions & Meshes", unidentifiedchris, 2020-06-15 (stale), https://devforum.roblox.com/t/quick-guide-into-csg-increasing-performance-of-unions-meshes/627677
[S66] "[Studio Beta] Solid Modeling on Meshes & new Fragment and Sweep APIs", FGmm_r2 (Roblox geometry team), 2026-03-12 (full release note 2026-07-07), https://devforum.roblox.com/t/studio-beta-solid-modeling-on-meshes-new-fragment-and-sweep-apis/4515374
[S67] "Blisteringly fast Solid Modeling (CSG) Replication with Delta Updates", Roblox geometry team, 2026-04-02, https://devforum.roblox.com/t/blisteringly-fast-solid-modeling-csg-replication-with-delta-updates/4554628
[S68] "Introducing New Texture Generation Tools, Segment Any Mesh, and Image Previews", LuckyRainGG, 2026-09-23, https://devforum.roblox.com/t/introducing-new-texture-generation-tools-segment-any-mesh-and-image-previews/4890084
[S69] "Meshie - Mesh Editor Plugin for Studio (Preview Release)", Gliiitch, 2026-09-07 (third-party, paid early access), https://devforum.roblox.com/t/meshie-mesh-editor-plugin-for-studio-preview-release/4857494
[S70] "Object to Terrain - convert parts, meshes and unions", GoodPlayerUnlikeYou, 2025-12-08 (replies to 2026-02), https://devforum.roblox.com/t/object-to-terrain-convert-parts-meshes-and-unions/4129983
[S71] "Best way to create house roofs (with wedges)", replies by Fusionet, PyroGamingMC, FarFromLittle, Warm_Vibes, 2022-07-23/24, https://devforum.roblox.com/t/best-way-to-create-house-roofs-with-wedges/1890149
[S72] "How do you build like this?" (stud-style terrain), replies by CrazedBrick1, Gucci_Dabs222, Alex50529 and others, 2024-09-10 to 14, https://devforum.roblox.com/t/how-do-you-build-like-this/3152921
[S73] "How do you create your maps from start to finish in the most organised way possible?", replies by Aotrou, Cafran, 2021-06-25, https://devforum.roblox.com/t/how-do-you-create-your-maps-from-start-to-finish-in-the-most-organised-way-possible/1312128
[S74] "Ultimate Guide to Stylized Trees on Roblox", Tradesmark, 2021-03-22 (stale), https://devforum.roblox.com/t/ultimate-guide-to-stylized-trees-on-roblox/1124673
[S75] "How to make an amazing low poly tree", DevHelpAccount (DevStar), 2021-09-26 (stale), https://devforum.roblox.com/t/how-to-make-an-amazing-low-poly-tree/1483011
[S76] "How to make a Low Poly Tree", ShadowKartX, 2021-07-12 (stale), https://devforum.roblox.com/t/how-to-make-a-low-poly-tree/1344712
[S77] "Blender Tutorial! How To Make Stylized Cartoonish Rocks For Your Game!", PotatoFortniteLOL, 2021-05-16 (stale), https://devforum.roblox.com/t/blender-tutorial-how-to-make-stylized-cartoonish-rocks-for-your-game/1229799
[S78] "Trying to make 'Stylized trees' correctly", replies by AngryAero and Twistir, 2021-07-19/26 (stale), https://devforum.roblox.com/t/trying-to-make-stylized-trees-correctly/1359589
[S79] "How Do I Make Stones?", replies by kingerman89, StarterHumanoid, CRAFTRONIX_457 and others, 2020-08-26 to 28 (stale), https://devforum.roblox.com/t/how-do-i-make-stones/742954
[S80] "Creator Marketplace: Improving Model Safety", tubin_tubs (Roblox), 2022-05-17, https://devforum.roblox.com/t/creator-marketplace-improving-model-safety/1795854
[S81] "[UNFIXED] Creator store flooded with ID-verified viruses", Fe_ct and others, 2025-11-21 (updated to 2026-04), https://devforum.roblox.com/t/unfixed-creator-store-flooded-with-id-verified-viruses/4087170
[S82] "An Interior Building System Guide", iam2nix, 2020-09-06 (stale), https://devforum.roblox.com/t/an-interior-building-system-guide/759289
[S83] "Interior Designing", HEAT_Composer, AdaptabiI and others, 2020-02-19 (no numbers; qualitative only), https://devforum.roblox.com/t/interior-designing/462283
[S84] "Roblox Studio is Going Agentic", Roblox newsroom, 2026-04-15, https://about.roblox.com/newsroom/2026/04/roblox-studio-going-agentic
[S85] "Inside Roblox Studio: Creators Discuss Working in Unique Art Styles", Roblox newsroom, July 2026, https://about.roblox.com/newsroom/2026/07/roblox-studio-fidelity-creator-interviews-twin-atlas-fluorlite-maximillian-ecos
[S86] Local repo observation, apps/apple-plugin/src/Commands.luau (CREATE_CLASSES allowlist: Part, WedgePart, CornerWedgePart, TrussPart, Model, Folder and others, no UnionOperation or MeshPart creation; terrain_edit actions clear, fill_block, fill_ball, fill_region, replace_material, write_voxels; MAX_TERRAIN_VOXELS 65,536; TERRAIN_RESOLUTION 4), read 2026-10-04
