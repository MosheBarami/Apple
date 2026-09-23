// Art direction for the builder. Golem's failure mode is not correctness, it is taste:
// the engine happily renders a flat grey slab, four poles and three stacked cylinders.
// Nothing errors; the scene is simply ugly. This module holds the canonical numbers
// (proportions, palettes, lighting moods) and emits the compact rules block injected
// into the system prompt for a build request.
//
// Source of truth: docs/research/roblox-art-direction.md (verified against live Studio).
// Every fixed mood/palette below is also tied to >=5 real visual examples in
// packages/corpus/data/style-visual-evidence.json. Those sources are reference-only evidence,
// never copied assets or training rows.
// Token budget is a hard product constraint — worldBuildingBrief() must stay ~1.5k tokens.

export type RGB = readonly [number, number, number];

/** Canonical stud dimensions, keyed to the ~5-stud R15 avatar. Values are literal or ranges. */
export const PROPORTIONS = {
  avatar: '5 tall x 2 wide; WalkSpeed 16, JumpHeight 7.2, MaxSlopeAngle 89',
  grid: 'snap structure to 5 studs / 90deg; module sizes divisible by 5',
  doorway: '10H x 10W where players move under pressure; 7H x 4W decorative',
  doorFrame: '0.5 proud, 0.5-1 thick — never a bare hole',
  ceiling: '10-12 standard, 14 generous, 20-30 grand, 24-40 atrium',
  wallHeight: '12-14 interior; >=10 for any wall meant to be impassable (8 is jumpable)',
  wallThickness: '2 exterior, 1 interior partition — never 0.2',
  floorSlab: '1-2 thick',
  corridor: '10-12 wide x 10-12 high (8 wide only for non-gameplay)',
  stairRise: '1.0-1.5 (never above 2; >0.8 starts to read as a climb)',
  stairRun: '2.5-3 tread depth; rise:run about 1:2',
  stairWidth: '6-8, or >=10 if gameplay',
  ramp: '15-30 degrees; MaxSlopeAngle 89 is a trap, steep ramps look wrong',
  railing: '3.0-3.5 tall, posts every 6-8',
  seat: '1.5-2 seat height; bench 8-12 long x 2 deep',
  table: '3 tall; counter/bar 3.5-4',
  windowSill: 'sill at 4 (chest height), opening 5x5',
  lampPost: '14-18 tall, 0.6-1 shaft, with plinth + head + PointLight',
  column: '2x2 to 4x4 human scale, 6x6 to 10x10 monumental; plinth + capital always',
  path: '12 wide main, 6-8 secondary; sidewalk 6-10',
  street: '24-40 wide',
  plaza: '80x80 small, 140x160 large',
  room: 'shop 40x30, standard room 30x24',
  trim: 'skirting 0.8-1.2 tall / 0.3 proud; cornice 1.0-1.5; panel recess 0.4 deep',
  curb: '0.5-1 step-up detail',
} as const;

export interface LightingPreset {
  /**
   * Assignments on the Lighting service that generated Luau MAY emit.
   * Every property here was verified scriptable against a live Studio datamodel.
   */
  scriptable: {
    ClockTime: number;
    Brightness: number;
    ExposureCompensation: number;
    ShadowSoftness: number;
    GlobalShadows: true;
    Ambient: RGB;
    OutdoorAmbient: RGB;
    ColorShift_Top: RGB;
    ColorShift_Bottom: RGB;
    GeographicLatitude?: number;
    EnvironmentDiffuseScale?: number;
    EnvironmentSpecularScale?: number;
    FogStart?: number;
    FogEnd?: number;
    FogColor?: RGB;
  };
  atmosphere: { Density: number; Offset: number; Haze: number; Glare: number; Color: RGB; Decay: RGB };
  bloom: { Intensity: number; Size: number; Threshold: number };
  colorCorrection: { Brightness: number; Contrast: number; Saturation: number; TintColor: RGB };
  sunRays?: { Intensity: number; Spread: number };
  depthOfField?: { FocusDistance: number; InFocusRadius: number; FarIntensity: number; NearIntensity: number };
  /**
   * Settings that CANNOT be scripted — verified non-scriptable even at plugin security in edit
   * mode. Surface these to the user as manual Studio steps; emitting them as Luau breaks the build.
   */
  manualStudioSteps: readonly string[];
  /** One line telling the model when to reach for this. */
  use: string;
}

/**
 * Lighting.Technology was removed by Unified Lighting (beta 2025-01-21, live 2025-07-23) — reading
 * it throws. Its replacements, LightingStyle and PrioritizeLightingQuality, are non-scriptable.
 * Every mood therefore carries the same two manual steps.
 */
const MANUAL_LIGHTING_STEPS = [
  'Lighting.LightingStyle = Realistic (Properties pane — not scriptable)',
  'Lighting.PrioritizeLightingQuality = Enabled (Properties pane — not scriptable)',
] as const;

/** Ready-to-apply lighting + atmosphere moods. Pick exactly one per scene. */
export const MOODS: Record<string, LightingPreset> = {
  day: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'safe default when the prompt gives no mood — cheerful, readable, hard to get wrong',
    scriptable: {
      ClockTime: 14.2, Brightness: 2.4, ExposureCompensation: 0, ShadowSoftness: 0.35,
      GlobalShadows: true, GeographicLatitude: 15,
      Ambient: [72, 74, 70], OutdoorAmbient: [128, 130, 124],
      ColorShift_Top: [255, 240, 214], ColorShift_Bottom: [120, 140, 160],
    },
    atmosphere: { Density: 0.3, Offset: 0.2, Haze: 1.4, Glare: 0.15, Color: [199, 209, 224], Decay: [108, 120, 140] },
    bloom: { Intensity: 0.45, Size: 26, Threshold: 1.1 },
    colorCorrection: { Brightness: 0, Contrast: 0.06, Saturation: 0.1, TintColor: [255, 253, 248] },
  },
  golden: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'golden hour — long shadows, warm key, cool bounce; the most flattering exterior look',
    scriptable: {
      ClockTime: 17.6, Brightness: 2.0, ExposureCompensation: 0.25, ShadowSoftness: 0.3,
      GlobalShadows: true, GeographicLatitude: 20, EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 1,
      Ambient: [48, 40, 44], OutdoorAmbient: [96, 78, 74],
      ColorShift_Top: [255, 178, 110], ColorShift_Bottom: [60, 70, 110],
    },
    atmosphere: { Density: 0.32, Offset: 0.25, Haze: 2.2, Glare: 0.35, Color: [216, 190, 160], Decay: [110, 88, 90] },
    bloom: { Intensity: 0.55, Size: 28, Threshold: 1.05 },
    colorCorrection: { Brightness: 0, Contrast: 0.08, Saturation: 0.08, TintColor: [255, 246, 236] },
    sunRays: { Intensity: 0.12, Spread: 0.9 },
  },
  overcast: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'grim, fortress, ruins, industrial — no sun direction; makes blocky geometry look intentional',
    scriptable: {
      ClockTime: 9.2, Brightness: 1.4, ExposureCompensation: -0.1, ShadowSoftness: 0.85,
      GlobalShadows: true, EnvironmentDiffuseScale: 0.9, EnvironmentSpecularScale: 0.4,
      Ambient: [58, 62, 70], OutdoorAmbient: [120, 124, 132],
      ColorShift_Top: [150, 165, 190], ColorShift_Bottom: [48, 52, 60],
    },
    atmosphere: { Density: 0.42, Offset: 0.2, Haze: 5.5, Glare: 0, Color: [170, 178, 188], Decay: [92, 98, 108] },
    bloom: { Intensity: 0.25, Size: 22, Threshold: 1.3 },
    colorCorrection: { Brightness: -0.02, Contrast: 0.1, Saturation: -0.2, TintColor: [238, 244, 255] },
  },
  night: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'cyber, arcade, city, neon — dark base so emissive surfaces carry the image',
    scriptable: {
      ClockTime: 22.0, Brightness: 0.9, ExposureCompensation: 0.2, ShadowSoftness: 0.4,
      GlobalShadows: true,
      Ambient: [20, 16, 32], OutdoorAmbient: [32, 26, 52],
      ColorShift_Top: [90, 80, 190], ColorShift_Bottom: [200, 40, 120],
    },
    atmosphere: { Density: 0.5, Offset: 0.15, Haze: 6.0, Glare: 0.2, Color: [110, 90, 160], Decay: [40, 20, 60] },
    bloom: { Intensity: 1.1, Size: 40, Threshold: 0.85 }, // <1.0 so Neon blooms hard
    colorCorrection: { Brightness: 0, Contrast: 0.16, Saturation: 0.22, TintColor: [232, 236, 255] },
  },
  misty: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'dawn, swamp, forest, mystery — depth by atmospheric perspective; hides weak background geometry',
    scriptable: {
      ClockTime: 6.8, Brightness: 1.6, ExposureCompensation: 0.15, ShadowSoftness: 0.75,
      GlobalShadows: true, GeographicLatitude: 35, EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 0.5,
      Ambient: [64, 70, 74], OutdoorAmbient: [138, 146, 150],
      ColorShift_Top: [214, 206, 190], ColorShift_Bottom: [96, 112, 124],
      FogStart: 40, FogEnd: 480, FogColor: [186, 194, 198],
    },
    atmosphere: { Density: 0.48, Offset: 0.55, Haze: 7.0, Glare: 0.1, Color: [198, 204, 206], Decay: [126, 136, 142] },
    bloom: { Intensity: 0.6, Size: 34, Threshold: 1.0 },
    colorCorrection: { Brightness: 0.01, Contrast: 0.04, Saturation: -0.12, TintColor: [248, 250, 255] },
    depthOfField: { FocusDistance: 30, InFocusRadius: 60, FarIntensity: 0.2, NearIntensity: 0.05 },
  },
  interior: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'lobbies, shops, showrooms — neutral, bright, soft; anything selling an object',
    scriptable: {
      ClockTime: 13.0, Brightness: 1.6, ExposureCompensation: 0.1, ShadowSoftness: 0.9,
      GlobalShadows: true, EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 1,
      Ambient: [140, 140, 145], OutdoorAmbient: [150, 150, 155],
      ColorShift_Top: [255, 252, 245], ColorShift_Bottom: [210, 216, 228],
    },
    atmosphere: { Density: 0.15, Offset: 0.1, Haze: 0.4, Glare: 0, Color: [235, 238, 244], Decay: [180, 186, 196] },
    bloom: { Intensity: 0.4, Size: 30, Threshold: 1.2 },
    colorCorrection: { Brightness: 0.02, Contrast: 0.05, Saturation: -0.05, TintColor: [255, 255, 255] },
  },
  horror: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'dungeons, abandoned rooms — desaturated, hard shadows, cold ambient fought by warm practicals',
    scriptable: {
      ClockTime: 0, Brightness: 0.4, ExposureCompensation: -0.35, ShadowSoftness: 0.05,
      GlobalShadows: true, EnvironmentDiffuseScale: 0.2, EnvironmentSpecularScale: 0.3,
      Ambient: [8, 10, 14], OutdoorAmbient: [14, 18, 26],
      ColorShift_Top: [40, 60, 90], ColorShift_Bottom: [10, 10, 16],
      FogStart: 12, FogEnd: 90, FogColor: [16, 20, 26],
    },
    atmosphere: { Density: 0.45, Offset: 0, Haze: 4.2, Glare: 0, Color: [120, 130, 140], Decay: [30, 36, 44] },
    bloom: { Intensity: 0.35, Size: 18, Threshold: 1.4 },
    colorCorrection: { Brightness: -0.03, Contrast: 0.22, Saturation: -0.42, TintColor: [206, 222, 245] },
    depthOfField: { FocusDistance: 18, InFocusRadius: 26, FarIntensity: 0.35, NearIntensity: 0.1 },
  },
  sunny: {
    manualStudioSteps: MANUAL_LIGHTING_STEPS,
    use: 'stylised bright games — simulators, tycoons, obbies, farming, pets: high sun, clear air so saturated colour stays vivid',
    scriptable: {
      ClockTime: 13, Brightness: 2.8, ExposureCompensation: 0, ShadowSoftness: 0.25,
      GlobalShadows: true, GeographicLatitude: 20,
      Ambient: [100, 104, 112], OutdoorAmbient: [150, 150, 160],
      ColorShift_Top: [255, 246, 226], ColorShift_Bottom: [150, 170, 200],
    },
    atmosphere: { Density: 0.22, Offset: 0.1, Haze: 0.6, Glare: 0.1, Color: [200, 226, 255], Decay: [120, 160, 220] },
    bloom: { Intensity: 0.3, Size: 24, Threshold: 1.2 },
    colorCorrection: { Brightness: 0.02, Contrast: 0.1, Saturation: 0.22, TintColor: [255, 255, 250] },
    sunRays: { Intensity: 0.06, Spread: 0.8 },
  },
};

export interface Palette {
  /** ~60% of visible surface. */ dominant: RGB;
  /** ~30%. */ secondary: RGB;
  /** ~10%; in a realistic palette the only saturated colour. */ accent: RGB;
  /** Edges, skirting, cornice, frames. Darkest value. */ trim: RGB;
  /** 3 primary materials + 1 accent, in that order. */ materials: readonly [string, string, string, string];
  moods: readonly string[];
}

/**
 * Realistic palettes are restrained: desaturated bases, one saturated accent, wide value spread.
 * brightPlay is the stylised classic-Roblox one: saturated, high-key colour on SmoothPlastic.
 */
export const PALETTES: Record<string, Palette> = {
  warmStone: {
    dominant: [206, 188, 158], secondary: [150, 92, 66], accent: [58, 122, 118], trim: [92, 76, 58],
    materials: ['Limestone', 'Plaster', 'Pavement', 'Fabric'], moods: ['golden', 'day'],
  },
  modernCivic: {
    dominant: [232, 232, 230], secondary: [126, 132, 138], accent: [214, 124, 46], trim: [52, 58, 64],
    materials: ['Concrete', 'Glass', 'Pavement', 'Metal'], moods: ['day', 'interior'],
  },
  cosyWood: {
    dominant: [198, 178, 152], secondary: [112, 74, 46], accent: [176, 138, 62], trim: [66, 48, 34],
    materials: ['Plaster', 'Wood', 'Marble', 'Carpet'], moods: ['interior', 'golden'],
  },
  verdant: {
    dominant: [106, 124, 74], secondary: [134, 128, 110], accent: [206, 154, 74], trim: [58, 56, 44],
    materials: ['Grass', 'Rock', 'Wood', 'LeafyGrass'], moods: ['misty', 'day', 'golden'],
  },
  sciFi: {
    dominant: [74, 80, 92], secondary: [168, 174, 184], accent: [64, 224, 232], trim: [34, 38, 46],
    materials: ['Metal', 'SmoothPlastic', 'DiamondPlate', 'Neon'], moods: ['night', 'interior'],
  },
  coldHorror: {
    dominant: [92, 94, 88], secondary: [58, 52, 46], accent: [150, 58, 44], trim: [28, 30, 34],
    materials: ['Concrete', 'WoodPlanks', 'CeramicTiles', 'CorrodedMetal'], moods: ['horror', 'overcast'],
  },
  marketTown: {
    dominant: [186, 158, 128], secondary: [138, 97, 73], accent: [72, 106, 128], trim: [62, 50, 40],
    materials: ['Brick', 'Plaster', 'Cobblestone', 'Fabric'], moods: ['golden', 'overcast', 'day'],
  },
  fortressRuin: {
    dominant: [134, 134, 118], secondary: [88, 89, 86], accent: [124, 142, 96], trim: [44, 46, 44],
    materials: ['Slate', 'Sandstone', 'Cobblestone', 'LeafyGrass'], moods: ['overcast', 'misty'],
  },
  brightPlay: {
    dominant: [95, 201, 74], secondary: [201, 138, 75], accent: [255, 206, 64], trim: [122, 82, 48],
    materials: ['SmoothPlastic', 'Plastic', 'WoodPlanks', 'Neon'], moods: ['sunny', 'day'],
  },
};

const UNIVERSAL = `ART DIRECTION (mandatory — a scene that breaks these is rejected, not "fine")

PLAN FIRST. Before creating anything, produce a scene plan (style, mood, palette, materials, focal
point, zones and functional areas, vertical layers, prop budget) and build to it. Do not improvise.

STYLE — pick ONE and hold it on every part; mixing reads as two games glued together.
- STYLISED (default for simulators, tycoons, obbies, farming, pets, kids' games, "a game like X"):
  classic Roblox. SmoothPlastic/Plastic, bright saturated high-key colour, flat shading, chunky
  oversized props. Colour zones the space: each functional area owns a colour and paths contrast
  hard with the ground. No realistic textures (Grass, Brick, Concrete) under stylised props.
- REALISTIC (showcases, horror, realistic cities, anything asked to look "realistic"): textured
  materials, restrained colour and the realistic limits below.

SCALE (studs, avatar is 5 tall x 2 wide; snap structure to a 5-stud grid):
doorway 10H x 10W (7H x 4W decorative) · ceiling 10-12, grand 20-30 · impassable wall >=10 tall (8
is jumpable), 2 thick exterior, 1 interior · floor slab 1-2 · corridor 10-12 wide · stair rise
1.0-1.5 + run 2.5-3 · railing 3-3.5 · seat 1.5-2 · table 3, counter 3.5-4 · window 5x5, sill 4 ·
path 12 wide · lamp post 14-18 · column 2x2 human / 6x6 monumental.

FACTORY DEFAULTS ARE THE SLOP SIGNATURE. A new Part arrives as Plastic, Color=(163,162,165),
Size=(4,1.2,2), Anchored=FALSE. Set colour, size and Anchored=true on every part and choose the
material on purpose (Plastic only in the stylised look). Unanchored decoration falls apart the
moment the game runs.

MATERIALS — stylised: SmoothPlastic/Plastic for almost everything, Neon for glow, Wood/WoodPlanks
only for fences, crates and signs. Realistic: exactly 3 primary + 1 accent; walls and floors never
share one; trim contrasts the plane it sits on. Neon is a light, not a colour: <5% of surface and a
light within 10 studs. Stylised glass = Neon + Transparency 0.6.

COLOUR — 60/30/10 plus a dark trim colour. Stylised: 4-6 saturated high-key colours, each with a job
(grass 95,201,74 · path 201,138,75 · sand 232,211,169 · trunk/fence 122,82,48 · accents at full
chroma on props). Realistic: at most 5 colours; surfaces over 50 studs^2 keep HSV saturation <=0.35.
In either style, full-saturation primaries (255,0,0 / 0,0,255 / 255,255,0) never go on anything over
4 studs, and the 10 largest surfaces span >=0.35 in HSV value.

FUNCTIONAL AREAS — every plot, pad, stall, stage, spawn or arena floor is built, not painted: a base
1-2 studs thick (never a flush 0.2 plate) with a contrasting rim 0.5-1 proud; a fence when it is
owned or enclosed, a sign and 3-6 props clustered at its edges — the fence, the sign and every prop
from find_library_model + insert_library_model, never assembled from parts (D-MODELLIB-2). Repeated areas are one
module built once, then cloned with small variations.

ORGANIC SHAPES — trees, foliage, bushes, fruit, rocks and crystals are library models
(find_library_model "oak tree", "bush", "boulder"), never balls or blocks; clouds are a Clouds object.

COMPOSITION:
- One hero landmark at least 3x the height of its surroundings, off-centre (about a third in),
  visible from the spawn; then 2-4 mid masses; dressing is the rest.
- At least 3 walkable elevations in any scene over 60 studs across — steps, daises, sunken rings,
  ramps. Flat = unfinished.
- Keep the centre open and mass at edges and corners; break the grid with one rotated or round thing.

DETAIL PASS — what separates a scene from a greybox. Never skip it.
- Never leave a slab edge bare: trim 0.4 proud along every exposed edge; skirting and cornice on
  every wall; a frame 0.5 proud on every door and window.
- Every column, statue, sign or trophy gets a plinth (1-2 larger, 0.5-1 tall) and a cap.
- No unbroken flat surface over 20x20: break it with an inset panel, recess, value shift or object.
- Clutter in clusters of 3-5, hugging walls and corners, rotated +/-15deg, layered floor, waist
  (2-3), eye (4-5) and above (8+). Props per 100 studs^2: exterior 1-2, room 4-8, shop 10-18.
- Props are library models, never parts (D-MODELLIB-2): place one with insert_library_model, then
  clone_instances and transform_instances for repeats with small rotation and scale variation.

LIGHTING — every scene gets a lighting pass: set_mood with one named mood (stylised: sunny or day),
or by hand the Lighting properties, an Atmosphere, Bloom and ColorCorrection. Every lamp, lantern
or screen gets a tinted PointLight/SpotLight/SurfaceLight (warm 255,214,170 / cool 190,214,255),
Range 18-30. An open sky gets a Clouds object under Terrain (Cover 0.5-0.6, Density 0.6); never
build a sky, sun or clouds from Parts. End the reply with one line: "Set Lighting.LightingStyle =
Realistic and PrioritizeLightingQuality = Enabled in Studio's Properties pane — they can't be set
from a script."

GROUND — never ship the default grey baseplate. Stylised: recolour it to the grass colour
(SmoothPlastic), delete its grid Texture, and lay paths and area zones 1-2 thick on top in their own
colours. Realistic: Terrain for organic scenes, a Pavement/Concrete deck with kerbs and inset panels
for built ones. Terrain: FillBlock, FillBall, FillCylinder(cframe, height, radius, material),
FillWedge, FillRegion, ReplaceMaterial(region, 4, from, to), SetMaterialColor. Terrain:PaintRegion
DOES NOT EXIST. Voxels are 4x4x4 studs.

PERFORMANCE — CastShadow=false under ~40 studs^3; at most 4 shadowed lights; reuse a small kit of
repeated pieces, not unique one-offs; under ~5k parts.

BANNED — any of these means regenerate:
- the default grey baseplate as final ground; any scene without a lighting pass
- stacked cylinders or boxes passing as a prop; a bare pole as a lamp, tree, sign or statue; a tree
  that is a trunk plus one block
- functional areas as flat plates with no rim, fence, sign or props
- realistic and stylised materials mixed in one scene
- full-saturation primaries on large surfaces; the default grey; unanchored parts
- identical props at identical spacing with zero rotation or scale variation
- emitting Lighting.Technology, LightingStyle, PrioritizeLightingQuality, Terrain:PaintRegion or
  Workspace.StreamingTargetRadius — all removed or non-scriptable

FINISH ORDER — ground zones → every functional area to full detail → the landmark → organic clusters
→ set_mood and clouds → scripts and polish. Build every item of the plan before polishing any of it,
and do not re-read what you already built.

SELF-CHECK before reporting done: one style throughout · no default grey, every part anchored · 4-6
colours with paths contrasting the ground · every functional area has base, rim, sign and props ·
foliage and rocks are clusters · 3+ elevations · a landmark 3x its neighbours · trim on exposed edges
· set_mood applied · part count on budget · every item of the plan built.`;

// Only outdoor requests carry this: it is ~400 tokens and an interior, shop or obby has no use for it.
const OUTDOOR_RE =
  /\b(island|hill|mountain|cliff|canyon|valley|forest|jungle|woods?|trees?|waterfall|river|lake|ocean|sea|beach|shore|sky|skies|sunset|sunrise|nature|meadow|volcano|cave|outdoor|landscape|terrain)\b/i;

/** Whether a request is an outdoor scene — the ones built from Terrain. */
export const isOutdoorRequest = (text: string): boolean => OUTDOOR_RE.test(text);

const OUTDOOR = `NATURAL OUTDOOR SCENES (islands, hills, cliffs, forests, waterfalls, skies) are built with the engine's
  own tools, not out of Parts — measured 2026-09-23 on "a floating sky island with a waterfall, trees,
  crystals and a sunset": a Parts-only build scored 2/10 on the visual check after 232 Credits ("a flat grey
  slab", "a 2D billboard", "lollipop trees", "specks").
  * A floating / sky island is build_scene kit "floating_island" — island, waterfall, trees, crystals,
    mist, golden light, Baseplate hidden, spawn on top, in one call. Then add to it; never rebuild its
    pieces by hand. For a lone landform without the kit: edit_terrain recipe "floating_island" with
    center (high in the air, e.g. y 150) and radius 40-60; it returns surfaceY — put trees, crystals and
    the spawn on that height. Other landforms: Rock or Slate for the mass, Grass or LeafyGrass on top.
  * The sky and the time of day are Lighting, never geometry: set_mood with "golden" for a sunset or golden
    hour, "night", "misty" and so on. Never build a sun, a sky or a sunset out of parts or flat planes.
  * Water is Terrain water. A waterfall is a tall, narrow column of it falling off an edge, with add_effect's
    waterfall mist preset where it lands.
  * Trees, rocks and crystals: find_library_model + insert_library_model, never parts and never a
    generator (D-MODELLIB-2). A crystal cluster's biggest spike stands taller than a player.
  * Floating scenes: the template Baseplate under the island breaks the illusion. Hide it (set_visible) and
    move the SpawnLocation onto the island, and say so in the reply. Clouds are never Parts: flat slabs read
    as glass. Use a Clouds object under Terrain (Cover 0.5-0.6, Density 0.6) or leave them out.
  * Real sizes: a big tree is 30-50 studs tall and a crystal 6-15, next to a 5-stud player. Scale a
    generated model to that size ONCE and move on; resizing it again and again is the loop that ends a run.
  * A waterfall is edit_terrain recipe "waterfall": top = a point ON the island's edge at surfaceY, a
    height that clears the underside, endsIn "mist" for a fall into the sky (then add_effect mist there).
  * The built-in sky can be warmed, not painted: set_mood "golden" gives a low warm sun and warm light on
    everything, but the sky itself stays the Roblox sky. Never promise an orange sky in the reply.
  * Spend in this order and stop to check: landform, set_mood, 3-5 hero objects, check_composition, then
    detail. A whole environment should fit in about 60 steps.`;

const KINDS: Record<string, string> = {
  plaza: `SCENE: PLAZA — 140x160 open. Central dais 20x20 raised +2 with the spawn; four 12-wide paths
radiating out; perimeter colonnade every 15 studs; corner planters. Landmark: a monument/spire ~50
tall, offset a third off-axis, with plinth and capital. Tiers: sunken ring -2, deck 0, dais +2.
Keep the middle open and mass the props at the edges. Vary column height/spacing slightly.
Suggested: palette warmStone or modernCivic, mood golden or day. Budget 700-1400 parts.`,

  interior: `SCENE: INTERIOR ROOM — 30x24, ceiling 12-14. Skirting and cornice on every wall, ceiling
beams every 8 studs, a real ceiling (never open sky). One window wall (5x5 openings, sill 4) to
motivate the light. Floor material must differ from walls. Furniture against walls, one island in
the middle third. Landmark: the lit hero object (fireplace, display, desk) on the far wall.
Suggested: palette cosyWood, mood interior. Budget 150-400 parts.`,

  shop: `SCENE: SHOP — 40x30, ceiling 14, door 10x10 on a short wall. Counter across the back third at
3.5. Shelving 9 tall on both long walls, STOCKED (30-50 items, rotation and scale varied +/-8%).
Central display island 8x4 raised +0.5. Window wall to the street. Landmark: the lit back-counter
display with a SpotLight (Angle 45, Shadows on) plus 4-5 warm PointLights (Range 22).
Suggested: palette cosyWood or modernCivic, mood interior. Budget 250-500 parts.`,

  lobby: `SCENE: LOBBY — 80x60, atrium ceiling 24-40. Symmetry is allowed here but break it with one
asymmetric element. Landmark: a central feature (chandelier, sculpture, stair) at least 3x the
height of the furniture. Grand stair (rise 1.2, run 3, width 10) with a 3.5 railing. Marble or
Pavement floor with a contrasting inset border pattern. Columns 6x6 with plinths and capitals,
mezzanine at +14 with railings. Suggested: palette cosyWood or modernCivic, mood interior. 400-900 parts.`,

  dungeon: `SCENE: DUNGEON — corridors 10-12 wide, ceiling 12, rooms 24-40 across. Asymmetric and
irregular: vary corridor width, break sightlines every 20-30 studs, collapse a section to -1.5 and
mound debris to +2. Wall material patchy (Concrete over Plaster). 20-30 small rotated debris parts.
Light is the design: few sources, warm practicals (torch PointLight Range 24, Brightness 1.6,
Color 255,196,132, Shadows on) fighting a cold ambient. Suggested: palette coldHorror or
fortressRuin, mood horror. Budget 300-700 parts.`,

  obby: `SCENE: OBBY — readability is the art direction. Walkable surfaces get ONE consistent
material+colour; hazards get a different, saturated accent; decoration must never be mistakeable
for either. Platforms 8-12 across, gaps 8-14 (jump reach is ~7.2 up), rise between stages 4-6.
Give every platform a trim edge 0.4 proud so its silhouette reads against the void, and a
checkpoint landmark every 5-8 platforms. Build the surround (floating islands, a tower, terrain
below) so it is not parts in empty sky. Suggested: palette brightPlay or sciFi, mood sunny or night.
Budget 300-800 parts.`,

  arena: `SCENE: ARENA — playfield 100x100 kept clear and flat, everything interesting on the perimeter.
Tiered seating rising in 3-4 bands (each +6, depth 10), a canopy or ring beam overhead, two opposed
gateways as secondary focal points. Landmark: a scoreboard/banner mass at least 3x the seating
height on one side only. Ground: a bordered field with an inset centre circle, not a blank slab.
Suggested: palette modernCivic or fortressRuin, mood day or night. Budget 600-1200 parts.`,

  natural: `SCENE: NATURAL — Terrain, not parts, for the ground: Terrain:FillBlock/FillBall/FillCylinder
with Grass, Ground, Rock, Sand (voxels are 4x4x4, so size features in multiples of 4); blend edges
with Terrain:ReplaceMaterial(region, 4, source, target) — PaintRegion does not exist.
Sculpt at least 3 elevations with a 15-40 stud height range. Add a Clouds object on
Terrain (Cover 0.6, Density 0.5). Landmark: one hero mass (rock outcrop, great tree, waterfall)
3x its surroundings,
off-centre. Scatter foliage in clusters of 3-5 with clearings between, never a uniform grid; vary
scale +/-25% and rotate freely. Rocks are 3-5 intersecting rotated parts, never one sphere.
Suggested: palette verdant, mood misty or golden. Budget 400-1000 parts.`,

  simulator: `SCENE: PLOT GAME (simulator, tycoon, farming) — a central hub (sand or plaza colour, 40-60
across) with the spawn, shops or vendor stalls around it and one landmark; N identical player plots
(default 6) in two rows or a ring off the hub, 30-40 across each, 12-16 apart, joined by 10-14 wide
paths in a colour that contrasts the grass. Every plot is one module cloned: raised base, contrasting
rim, fence with a gate gap facing the path, owner sign, 3-6 props, then its contents. Stalls are
open-front booths with a counter, an awning in a bright accent and a big sign.
Suggested: palette brightPlay, mood sunny. Budget 800-2000 parts.`,
};

const KIND_ALIASES: Record<string, string> = {
  town: 'plaza', city: 'plaza', street: 'plaza', park: 'plaza', spawn: 'plaza', courtyard: 'plaza',
  room: 'interior', house: 'interior', home: 'interior', office: 'interior', cabin: 'interior',
  store: 'shop', market: 'shop', stall: 'shop',
  hall: 'lobby', entrance: 'lobby', atrium: 'lobby', museum: 'lobby',
  cave: 'dungeon', crypt: 'dungeon', horror: 'dungeon', ruins: 'dungeon', maze: 'dungeon',
  parkour: 'obby', tower: 'obby', platformer: 'obby',
  stadium: 'arena', battlefield: 'arena', pvp: 'arena',
  forest: 'natural', island: 'natural', beach: 'natural', mountain: 'natural', outdoor: 'natural',
  terrain: 'natural', jungle: 'natural', desert: 'natural',
  tycoon: 'simulator', farm: 'simulator', farming: 'simulator', plot: 'simulator',
};

function resolveKind(kind: string): string | null {
  // Whole words only ("install" is not a stall, "workshop" not a shop), and the FIRST scene word in
  // the request decides: "an obby with a spawn" is an obby, not a plaza.
  const k = kind.toLowerCase();
  const words = [...Object.keys(KINDS).map((n) => [n, n] as const), ...Object.entries(KIND_ALIASES)];
  let best: string | null = null;
  let bestAt = Infinity;
  for (const [word, target] of words) {
    const at = k.search(new RegExp(`\\b${word}s?\\b`));
    if (at >= 0 && at < bestAt) {
      best = target;
      bestAt = at;
    }
  }
  return best;
}

/**
 * The art-direction block injected into the system prompt for a build request.
 * `kind` is a loose scene category (plaza, interior, obby, lobby, dungeon, shop, arena, natural…);
 * unknown values still get the universal rules.
 */
export function worldBuildingBrief(kind: string): string {
  const resolved = resolveKind(kind);
  const specific = resolved ? KINDS[resolved] : undefined;
  const names = `Moods: ${Object.keys(MOODS).join(', ')}. Palettes: ${Object.keys(PALETTES).join(', ')}.`;
  const base = OUTDOOR_RE.test(kind) ? `${UNIVERSAL}\n\n${OUTDOOR}` : UNIVERSAL;
  return specific ? `${base}\n\n${specific}\n\n${names}` : `${base}\n\n${names}`;
}

/**
 * Emits the Luau that applies a mood. Saves the model from re-deriving property values.
 * Only emits verified-scriptable properties; see `MOODS[m].manualStudioSteps` for the rest.
 */
export function moodLuau(mood: string): string {
  const p = MOODS[mood] ?? MOODS.day;
  if (!p) return '';
  const c = (v: RGB) => `Color3.fromRGB(${v[0]}, ${v[1]}, ${v[2]})`;
  const val = (v: number | boolean | RGB) =>
    typeof v === 'number' || typeof v === 'boolean' ? String(v) : c(v);
  const props = (o: Record<string, number | boolean | RGB>) =>
    Object.entries(o)
      .map(([k, v]) => `${k} = ${val(v)}`)
      .join(', ');
  const fx: string[] = [
    `mk("Atmosphere", { ${props(p.atmosphere as unknown as Record<string, number | RGB>)} })`,
    `mk("BloomEffect", { ${props(p.bloom)} })`,
    `mk("ColorCorrectionEffect", { ${props(p.colorCorrection as unknown as Record<string, number | RGB>)} })`,
  ];
  if (p.sunRays) fx.push(`mk("SunRaysEffect", { ${props(p.sunRays)} })`);
  if (p.depthOfField) fx.push(`mk("DepthOfFieldEffect", { ${props(p.depthOfField)} })`);
  const lines = Object.entries(p.scriptable).map(
    ([k, v]) => `L.${k} = ${val(v as number | boolean | RGB)}`,
  );
  // EITHER WE PUT IT THERE AND SAID SO, OR WE LEAVE IT ALONE.
  //
  // This used to open by destroying every PostEffect and Atmosphere in Lighting, full stop. A user
  // who had hand-tuned a ColorCorrectionEffect and a SunRaysEffect and then asked to "warm the
  // scene up a bit" had both deleted, and was told only that a mood had been applied. Replacing
  // somebody's lighting rig is a reasonable thing to ask for and an unreasonable thing to do
  // without being asked — and worse to do silently.
  //
  // So every instance this writes carries the same AppleMood marker that effects.ts uses for its
  // own, the sweep removes only marked ones, and the chunk RETURNS what it left behind so the tool
  // can say so. Anything of the user's stays, and stacking with it is a visible fact rather than a
  // surprise.
  return [
    'local L = game:GetService("Lighting")',
    'local kept, replaced = {}, 0',
    'for _, c in ipairs(L:GetChildren()) do',
    '\tif c:IsA("PostEffect") or c:IsA("Atmosphere") then',
    '\t\tif c:GetAttribute("AppleMood") ~= nil then',
    '\t\t\treplaced = replaced + 1',
    '\t\t\tc:Destroy()',
    '\t\telse',
    '\t\t\ttable.insert(kept, c.ClassName)',
    '\t\tend',
    '\tend',
    'end',
    // The RESOLVED name, not the requested one. An unknown mood falls back to day's lighting, and
    // tagging those instances with a name nobody implemented would make the marker a record of what
    // was asked for rather than of what is actually in the scene.
    `local mood = ${JSON.stringify(MOODS[mood] ? mood : 'day')}`,
    'local function mk(class, props)',
    '\tlocal i = Instance.new(class)',
    '\tfor k, v in pairs(props) do i[k] = v end',
    '\ti:SetAttribute("AppleMood", mood)',
    '\ti.Parent = L',
    'end',
    ...lines,
    ...fx,
    'return { mood = mood, replaced = replaced, kept = kept }',
  ].join('\n');
}

const S = (props: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties: props,
  required,
});

/** The plan the agent must produce (and follow) before placing a single part. */
export const SCENE_PLAN_SCHEMA = S(
  {
    kind: { type: 'string', description: 'Scene category: plaza, interior, obby, lobby, dungeon, shop, arena, natural…' },
    style: { type: 'string', enum: ['stylised', 'realistic'], description: 'One art style held on every part (see STYLE).' },
    mood: { type: 'string', enum: Object.keys(MOODS), description: 'Named lighting mood to apply verbatim.' },
    palette: {
      type: 'string',
      description: `Named palette from: ${Object.keys(PALETTES).join(', ')}. Use "custom" only with explicit colors below.`,
    },
    colors: S({
      dominant: { type: 'string', description: 'RGB "r,g,b" — ~60% of surface; realistic: desaturated (S<=0.35), stylised: a saturated high-key colour' },
      secondary: { type: 'string', description: 'RGB "r,g,b" — ~30%' },
      accent: { type: 'string', description: 'RGB "r,g,b" — ~10%, the strongest colour' },
      trim: { type: 'string', description: 'RGB "r,g,b" — darkest, for edges/skirting/frames' },
    }, ['dominant', 'secondary', 'accent', 'trim']),
    materials: {
      type: 'array',
      description: 'Enum.Material names: realistic exactly 3 primary + 1 accent; stylised SmoothPlastic/Plastic plus Neon and WoodPlanks. Never the default grey.',
      items: { type: 'string' },
    },
    focalPoint: S({
      what: { type: 'string', description: 'The single hero element the eye lands on.' },
      heightStuds: { type: 'number', description: 'Must be >=3x the height of its surroundings.' },
      position: { type: 'string', description: 'Approx "x,y,z"; place off-centre, about a third in.' },
      partCount: { type: 'number', description: 'Hero props are 25-60 parts, never 2-3.' },
    }, ['what', 'heightStuds', 'position']),
    landmarks: {
      type: 'array',
      description: '1-4 secondary masses that give the space orientation and callouts.',
      items: S({ name: { type: 'string' }, heightStuds: { type: 'number' }, position: { type: 'string' } }, ['name']),
    },
    zones: {
      type: 'array',
      description: 'Named areas with approximate extents; they must not all sit at the same elevation.',
      items: S({
        name: { type: 'string' },
        extents: { type: 'string', description: 'Approx "widthXdepth at x,z"' },
        elevation: { type: 'number', description: 'Y of the walkable surface, in studs.' },
        purpose: { type: 'string' },
      }, ['name', 'extents', 'elevation']),
    },
    verticalLayers: {
      type: 'array',
      description: 'Distinct walkable Y elevations; >=3 for scenes over 60 studs across.',
      items: { type: 'number' },
    },
    propBudget: S({
      heroProps: { type: 'number' },
      midProps: { type: 'number' },
      setDressing: { type: 'number' },
      totalParts: { type: 'number', description: 'Room 150-400, plaza 600-1500. Under 100 is a blockout.' },
    }, ['totalParts']),
    trimPlan: { type: 'string', description: 'Which edges get trim, skirting, cornice, frames, plinths.' },
    groundTreatment: { type: 'string', description: 'How the baseplate is replaced: terrain fill, or deck + kerbs + insets.' },
  },
  ['kind', 'mood', 'palette', 'materials', 'focalPoint', 'zones', 'verticalLayers', 'propBudget'],
);
