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
  candyArcade: {
    dominant: [103, 205, 243], secondary: [245, 111, 170], accent: [255, 214, 70], trim: [71, 53, 120],
    materials: ['SmoothPlastic', 'Plastic', 'Neon', 'WoodPlanks'], moods: ['sunny', 'day', 'night'],
  },
  oceanPlay: {
    dominant: [69, 192, 228], secondary: [255, 217, 117], accent: [244, 111, 98], trim: [52, 94, 139],
    materials: ['SmoothPlastic', 'Plastic', 'Neon', 'WoodPlanks'], moods: ['sunny', 'day', 'golden'],
  },
  cozyVillage: {
    dominant: [245, 185, 98], secondary: [119, 207, 120], accent: [244, 113, 125], trim: [116, 77, 89],
    materials: ['SmoothPlastic', 'Plastic', 'WoodPlanks', 'Neon'], moods: ['sunny', 'golden', 'interior'],
  },
};

// Historical presets remain readable for existing places; only these are offered on new builds.
export const CARTOON_MOODS = ['sunny', 'day', 'golden', 'interior', 'night'] as const;
export const CARTOON_PALETTES = ['brightPlay', 'candyArcade', 'oceanPlay', 'cozyVillage'] as const;

const UNIVERSAL = `ART DIRECTION (mandatory for every new Apple build)

STYLE — STYLISED COLORFUL CARTOON ROBLOX, consistently across the world, UI, props, characters and
VFX. Use saturated high-key colors, readable shapes, soft light, strong silhouettes and a playful
material vocabulary: SmoothPlastic/Plastic for simple structures, Neon sparingly for emphasis, and
WoodPlanks only where its shape reads clearly. Keep gameplay surfaces and hazards distinct.

PLAN FIRST — name the playable loop, every requested system, spawn, UI screens, landmarks, zones,
functional connections, verified asset needs and a bounded build order. A scene is not a complete
game. Reserve time for scripting, UI, testing and visual correction. Track each requested item until
built and checked; do not spend the whole run polishing one terrain or prop category.

ASSETS FIRST — use find_library_model then insert_library_model for detailed buildings, trees,
foliage, rocks, machines, pets, characters, vehicles, furniture, fences, signs and decor. Use
verified Roblox-specific assets for UI, SFX, VFX and animations. Confirm each item's appearance,
rights and placement before insertion; wire existing scripts safely to the game's systems. Only
simple unadorned floors, walls, ceilings, paths, platforms and structural trim may be made from
Parts. Never turn missing asset consent or a failed search into hand-built detailed props. Ask or
continue with independent work, then retry the verified source.

SCALE — an avatar is about 5 studs tall and 2 wide. Main paths 12 wide; doorways players use 10H
x 10W; ceilings 10-14; walls meant to block players at least 10 tall; floor slabs 1-2; railings
3-3.5. Snap simple structure to a 5-stud grid. Check walkable gaps with the avatar, not an image.

FUNCTIONAL AREAS — every plot, pad, stall, spawn or arena has a thick 1-2 stud base, a contrasting
rim, an accessible entrance, a fence where enclosed, a sign and 3-6 clustered props. Fence, sign
and props come from find_library_model + insert_library_model. Build one reusable area module and
clone it with measured spacing; do not substitute a flat colored plate for a functioning zone.

ORGANIC SHAPES — trees, foliage, bushes, fruit, rocks and crystals: find_library_model, then
insert_library_model; never balls or blocks. Put them in varied clusters with open routes. Clouds
are a Clouds object under Terrain; water is Terrain water. Keep the hero landmark visible from spawn.

COMPOSITION — one hero landmark roughly 3x nearby masses; 2-4 medium masses; the rest dressing.
Keep the playable center clear, use 3 walkable elevations in a large scene, and frame important
interactions with color and silhouette. Check from the player's camera, not just overhead.

DETAIL PASS — trim exposed structural edges, frame openings, light interactive counters and signs,
and vary cloned assets in rotation and scale within a coherent style. Do not invent a large part
count as a quality target: prefer complete verified models with fewer calls.

LIGHTING — apply set_mood from the colorful cartoon presets, then render_view. Use a clear sunny or
day mood by default; golden for warm outdoor scenes, interior for bright rooms, and night only for
luminous playful arcade scenes with readable routes. Put a Clouds object under Terrain for open
skies; never build sun, sky or clouds from Parts. Preserve the owner's preexisting light effects.

GROUND — replace the default gray baseplate with color-zoned SmoothPlastic ground and contrasting
paths. Sculpt broad landforms with bounded Terrain ops when requested; use library assets for all
detailed vegetation and rocks. Terrain:PaintRegion does not exist. Do not loop endlessly on terrain.

PERFORMANCE — anchor authored structure, reuse assets, cap shadowed lights, and avoid placing many
unique tiny parts where one verified model works. Keep the place responsive on a typical device.

BANNED — default gray baseplate, blank slab as a finished map, two-part trees, generic greybox UI,
detailed props assembled from Parts, mixed visual styles, unanchored structures, inaccessible zones,
missing scripts for requested mechanics, or claiming completion before a player-facing check.

FINISH ORDER — plan → verify sources → block out simple structure → insert the major asset set →
wire gameplay and UI → add SFX/VFX/animations → run a play check → inspect rendered views → fix
visual and functional gaps. Every requested system must be present before reporting the game done.

SELF-CHECK — one colorful cartoon style · readable spawn and pathing · every functional area has
base, rim, fence where appropriate, sign and library props · all requested mechanics and UI work ·
lighting and assets render as intended · no placeholder zones · no missing items from the plan.`;

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
  * The sky and the time of day are Lighting, never geometry: set_mood with "golden" for a sunset or
    "sunny" for a bright day. Never build a sun, a sky or a sunset out of parts or flat planes.
  * Water is Terrain water. A waterfall is a tall, narrow column of it falling off an edge, with add_effect's
    waterfall mist preset where it lands.
  * Trees, rocks and crystals: find_library_model + insert_library_model, never parts and never a
    generator (D-MODELLIB-2). A crystal cluster's biggest spike stands taller than a player.
  * Floating scenes: the template Baseplate under the island breaks the illusion. Hide it (set_visible) and
    move the SpawnLocation onto the island, and say so in the reply. Clouds are never Parts: flat slabs read
    as glass. Use a Clouds object under Terrain (Cover 0.5-0.6, Density 0.6) or leave them out.
  * Real sizes: a big tree is 30-50 studs tall and a crystal 6-15, next to a 5-stud player. Scale a
    verified library model to that size ONCE and move on; resizing it again and again is the loop that ends a run.
  * A waterfall is edit_terrain recipe "waterfall": top = a point ON the island's edge at surfaceY, a
    height that clears the underside, endsIn "mist" for a fall into the sky (then add_effect mist there).
  * The built-in sky can be warmed, not painted: set_mood "golden" gives a low warm sun and warm light on
    everything, but the sky itself stays the Roblox sky. Never promise an orange sky in the reply.
  * Spend in this order and stop to check: landform, set_mood, 3-5 hero objects, check_composition, then
    detail. A whole environment should fit in about 60 steps.`;

const KINDS: Record<string, string> = {
  plaza: `SCENE: PLAZA — bright social hub, clear spawn, four readable paths and a playful off-center
landmark. Use contrasting raised decks and color-coded destinations. Source the monument, planters,
benches and decorative columns as verified Roblox models; simple path and deck geometry may be Parts.
Suggested: palette brightPlay or candyArcade, mood sunny.`,

  interior: `SCENE: INTERIOR ROOM — clear entrance, bright ceiling, readable furniture layout and one
interactive focal point. Source furniture, lamps and decor as verified Roblox models. Build simple
walls, floor, ceiling and trim from Parts. Suggested: palette cozyVillage, mood interior.`,

  shop: `SCENE: SHOP — colorful entrance, functional counter, stocked shelves and a visible purchase
flow. Source products, shelves, sign and decor as verified Roblox models. Use one coherent UI kit
for the shop screens; test opening, prices and feedback. Suggested: palette candyArcade or
cozyVillage, mood interior.`,

  lobby: `SCENE: LOBBY — bright gathering area with a clear spawn, navigation signs, at least one
working destination and a cheerful focal landmark. Source furniture and landmark as verified
Roblox models; construct only simple walls and walkable decks from Parts. Suggested: palette
oceanPlay or candyArcade, mood interior.`,

  dungeon: `SCENE: CARTOON QUEST — colorful fantasy chambers connected by readable paths, oversized
playful props, safe contrast between routes and hazards, clear objectives and rewards. Source
crystals, doors, creatures and decor as verified Roblox models; never use grim horror lighting.
Suggested: palette candyArcade or oceanPlay, mood sunny.`,

  obby: `SCENE: OBBY — walkable platforms 8-12 across, clear hazard color and checkpoint landmark
every 5-8 stages. Build simple platforms from Parts; use verified Roblox models for themed
surroundings, decorations and rewards. Test jumps and respawns as a player. Suggested: palette
candyArcade or brightPlay, mood sunny.`,

  arena: `SCENE: ARENA — clear 100x100 playfield, two readable team entrances, colorful perimeter
landmarks and a functioning scoreboard. Build the simple field and boundaries from Parts; source
seating, banners and decorative structures as verified Roblox models. Suggested: palette brightPlay
or oceanPlay, mood day.`,

  natural: `SCENE: NATURAL — broad Terrain for hills and water, at least three readable elevations and
one off-center hero landmark. Source trees, rocks, flowers and crystals as verified Roblox models;
never assemble detailed nature from Parts. Keep paths and destinations visible from spawn. Add
Clouds under Terrain and inspect the actual player camera. Suggested: palette brightPlay or
oceanPlay, mood sunny or golden.`,

  simulator: `SCENE: PLOT GAME (simulator, tycoon, farming) — central colorful hub with spawn, working
shop and one hero landmark; six player plots by default, connected by contrasting paths. Every
plot has a raised base, rim, gate, owner sign and 3-6 verified library props. Clone a finished plot
module with measured spacing. Wire currency, progression, shop, rewards and UI before calling the
game complete. Suggested: palette brightPlay or cozyVillage, mood sunny.`,
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
  const names = `Moods: ${CARTOON_MOODS.join(', ')}. Palettes: ${CARTOON_PALETTES.join(', ')}.`;
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
    kind: { type: 'string', description: 'Colorful cartoon scene category: plaza, interior, obby, lobby, shop, arena, natural, simulator or playful quest.' },
    style: { type: 'string', enum: ['stylised'], description: 'A consistent colorful cartoon Roblox art direction.' },
    mood: { type: 'string', enum: CARTOON_MOODS, description: 'Named colorful cartoon lighting mood to apply verbatim.' },
    palette: {
      type: 'string',
      description: `Named cartoon palette from: ${CARTOON_PALETTES.join(', ')}. Use "custom" only with explicit colors below.`,
    },
    colors: S({
      dominant: { type: 'string', description: 'RGB "r,g,b" — ~60% of surface; saturated high-key cartoon color' },
      secondary: { type: 'string', description: 'RGB "r,g,b" — ~30%' },
      accent: { type: 'string', description: 'RGB "r,g,b" — ~10%, the strongest colour' },
      trim: { type: 'string', description: 'RGB "r,g,b" — darkest, for edges/skirting/frames' },
    }, ['dominant', 'secondary', 'accent', 'trim']),
    materials: {
      type: 'array',
      description: 'Enum.Material names: SmoothPlastic/Plastic for simple structure, Neon accents, WoodPlanks where appropriate. Never default gray.',
      items: { type: 'string' },
    },
    focalPoint: S({
      what: { type: 'string', description: 'The single hero element the eye lands on.' },
      heightStuds: { type: 'number', description: 'Must be >=3x the height of its surroundings.' },
      position: { type: 'string', description: 'Approx "x,y,z"; place off-centre, about a third in.' },
      partCount: { type: 'number', description: 'Optional: number of simple structural Parts only; detailed hero props come from verified models.' },
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
      totalParts: { type: 'number', description: 'Budget for simple structural Parts; quality comes from complete verified models and working gameplay, not a large Part count.' },
    }, ['totalParts']),
    trimPlan: { type: 'string', description: 'Which edges get trim, skirting, cornice, frames, plinths.' },
    groundTreatment: { type: 'string', description: 'How the baseplate is replaced: terrain fill, or deck + kerbs + insets.' },
  },
  ['kind', 'mood', 'palette', 'materials', 'focalPoint', 'zones', 'verticalLayers', 'propBudget'],
);
