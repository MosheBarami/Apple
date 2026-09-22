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
};

export interface Palette {
  /** ~60% of visible surface. */ dominant: RGB;
  /** ~30%. */ secondary: RGB;
  /** ~10%, the only place saturation is allowed. */ accent: RGB;
  /** Edges, skirting, cornice, frames. Darkest value. */ trim: RGB;
  /** 3 primary materials + 1 accent, in that order. */ materials: readonly [string, string, string, string];
  moods: readonly string[];
}

/** Restrained palettes: desaturated bases, one saturated accent, wide value spread. */
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
};

const UNIVERSAL = `ART DIRECTION (mandatory — a scene that breaks these is rejected, not "fine")

PLAN FIRST. Before creating anything, produce a scene plan (mood, palette, 3-4 materials, focal
point, landmarks, zones, vertical layers, prop budget) and build to it. Do not improvise geometry.

SCALE (studs, avatar is 5 tall x 2 wide; snap structure to a 5-stud grid):
doorway 10H x 10W where players move (7H x 4W decorative) · ceiling 10-12, grand 20-30 ·
wall >=10 tall if impassable (8 is jumpable at JumpHeight 7.2) · wall 2 thick exterior, 1 interior ·
floor slab 1-2 · corridor 10-12 wide · stair rise 1.0-1.5 + run 2.5-3 (never rise >2) ·
railing 3-3.5 · seat 1.5-2 · table 3, counter 3.5-4 · window 5x5, sill at 4 · path 12 wide ·
lamp post 14-18 · column 2x2 human / 6x6 monumental.

FACTORY DEFAULTS ARE THE SLOP SIGNATURE. A new Part arrives as Material=Plastic,
Color=(163,162,165), Size=(4,1.2,2), Anchored=FALSE, CastShadow=TRUE. Override all five on every
part you create. Anchored=false especially: unanchored decorative geometry is a simulated physics
body and your scene will collapse the moment it runs.

MATERIALS — exactly 3 primary + 1 accent, never more, never fewer.
No part may keep Material=Plastic or Color=(163,162,165).
Walls and floors must NOT share a material. Trim must contrast the plane it sits on.
Neon is a light, not a colour: <5% of surface area, and every Neon part needs a light within
10 studs or it reads as flat paint. Stylised glass = Neon + Transparency 0.6.

COLOUR — 60/30/10: dominant 60%, secondary 30%, accent 10%, plus a dark trim colour. At most 5
colours per scene. Large surfaces (>50 studs^2) must have HSV saturation <=0.35 — saturated hues
are for accents only. Never put full-saturation primaries (255,0,0 / 0,255,0 / 0,0,255 /
255,255,0) on anything over 4 studs; that is programmer art. Value structure beats hue: across
the 10 largest surfaces the lightest and darkest must differ by >=0.35 in HSV value.

COMPOSITION:
- One landmark at least 3x the height of its surroundings, placed off-centre (about a third in).
  A flat expanse of evenly spaced identical props reads as dead.
- Three tiers: hero (1 landmark) / mid (2-4 secondary masses) / dressing (the rest).
- At least 3 distinct walkable elevations in any scene over 60 studs across — steps, daises,
  sunken rings, ramps. Flat = unfinished.
- Keep the centre open; cluster mass at edges and corners. Negative space makes the focal read.
- Build hierarchy from contrast: height, density, orientation (one thing rotated off the grid),
  shape (one round thing among rectangles).
- Silhouette test: in solid black, would you still recognise the landmark?

DETAIL PASS — the step that separates a scene from a greybox. Never skip it.
- Never leave a slab edge bare: add a trim part 0.4 studs proud along every exposed edge.
- Skirting 0.8-1.2 tall / 0.3 proud at floor level, cornice 1.0-1.5 at ceiling, on every wall.
- Every door and window opening gets a frame 0.5 proud. Never a bare hole.
- Every column, statue, monument, sign or trophy gets a plinth (footprint 1-2 larger, 0.5-1 tall)
  AND a cap. Shaft + plinth + cap + trim ring is 5 parts and already reads as designed.
- No unbroken single-material flat surface larger than 20x20: break it with an inset panel, a
  0.3-deep recess, a 10% value shift, or an applied object (vent, sign, pipe, poster, planter).
- Clutter in clusters of 3-5 with gaps between, hugging walls and corners, rotated +/-15deg,
  sunk 0.1 into what they rest on. Layer vertically: floor, waist (2-3), eye (4-5), above (8+).
- Prop density per 100 studs^2 of floor: exterior 1-2, room 4-8, shop/workshop 10-18, ruin 8-14.
- PART BUDGETS ARE MANDATORY and they override any instruction that a prop is "a handful of
  well-placed parts" — that framing is what produces the stacked-cylinder trophy. Real counts:
  simple prop 3-6 · good prop (lamp, bench, sign) 8-20 · hero prop (trophy, statue, fountain)
  25-60 · dressed room 150-400 · dressed plaza 600-1500. A trophy is a plinth, a stem, a bowl,
  a rim, two handles and a cap. At 40 parts you have a blockout; reach the count with repeated
  create_instances batches, then clone_instances and transform_instances for the repetition.

LIGHTING — every scene gets a lighting pass. Apply one named mood: set Lighting.Ambient,
OutdoorAmbient, Brightness, ClockTime, ColorShift_Top, ColorShift_Bottom, ShadowSoftness and
GlobalShadows, create an Atmosphere, and create at least 2 post-effects (Bloom + ColorCorrection).
Then add local lights: every lamp, lantern, fixture or screen needs a PointLight/SpotLight/
SurfaceLight, tinted (warm 255,214,170 / cool 190,214,255), Range 18-30.
NEVER emit Lighting.Technology (removed by Unified Lighting — reading it throws), and never emit
Lighting.LightingStyle or Lighting.PrioritizeLightingQuality (not scriptable, even for a plugin).
Instead finish the reply with one line: "Set Lighting.LightingStyle = Realistic and
PrioritizeLightingQuality = Enabled in Studio's Properties pane — they can't be set from a script."

GROUND — never ship the default baseplate as final ground. Replace it: for organic scenes use
Terrain, for built scenes a Pavement/Concrete deck with kerbs, seams and inset panels.
Real Terrain methods: FillBlock(cframe, size, material), FillBall(center, radius, material),
FillCylinder(cframe, height, radius, material), FillWedge, FillRegion(region, resolution, material),
ReplaceMaterial(region, resolution, sourceMaterial, targetMaterial), SetMaterialColor, PasteRegion.
Terrain:PaintRegion DOES NOT EXIST — use ReplaceMaterial. Terrain voxels are 4x4x4 studs, so size
terrain features in multiples of 4.

PERFORMANCE — Anchored=true on every static part; CastShadow=false under ~40 studs^3; at most 4
lights with Shadows=true; reuse one small kit of repeated pieces (identical geometry batches into
a single draw call) rather than unique one-offs; keep a scene under ~5k parts.

BANNED — any of these means regenerate:
- an unlit flat baseplate as final ground; any scene without a lighting pass
- cylinder-on-cylinder / box-on-box stacks passing as a prop
- a bare primitive pole standing in for a lamp post, tree, sign or statue
- full-saturation primaries on large surfaces; Material=Plastic; the default grey; unanchored parts
- identical props at identical spacing with zero rotation or scale variation
- emitting Lighting.Technology, LightingStyle, PrioritizeLightingQuality, Terrain:PaintRegion or
  Workspace.StreamingTargetRadius — all removed or non-scriptable

SELF-CHECK before reporting done: 3-4 materials, no Plastic, no default grey · every part anchored
· 4-5 colours with a value spread · 3+ elevations · a landmark 3x its neighbours · trim on every
exposed edge, frames on openings, plinths under uprights · lighting + atmosphere + 2 post-effects
· part count in the right order of magnitude for the tier.`;

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
below) so it is not parts in empty sky. Suggested: palette verdant or sciFi, mood day or night.
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
};

const KIND_ALIASES: Record<string, string> = {
  town: 'plaza', city: 'plaza', street: 'plaza', park: 'plaza', spawn: 'plaza', courtyard: 'plaza',
  room: 'interior', house: 'interior', home: 'interior', office: 'interior', cabin: 'interior',
  store: 'shop', market: 'shop', stall: 'shop',
  hall: 'lobby', entrance: 'lobby', atrium: 'lobby', museum: 'lobby',
  cave: 'dungeon', crypt: 'dungeon', horror: 'dungeon', ruins: 'dungeon', maze: 'dungeon',
  parkour: 'obby', tower: 'obby', platformer: 'obby',
  stadium: 'arena', battlefield: 'arena', pvp: 'arena', map: 'arena',
  forest: 'natural', island: 'natural', beach: 'natural', mountain: 'natural', outdoor: 'natural',
  terrain: 'natural', jungle: 'natural', desert: 'natural',
};

function resolveKind(kind: string): string | null {
  const k = kind.toLowerCase().trim();
  if (k in KINDS) return k;
  const alias = KIND_ALIASES[k];
  if (alias) return alias;
  for (const [word, target] of Object.entries(KIND_ALIASES)) {
    if (k.includes(word)) return target;
  }
  for (const name of Object.keys(KINDS)) {
    if (k.includes(name)) return name;
  }
  return null;
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
  return specific ? `${UNIVERSAL}\n\n${specific}\n\n${names}` : `${UNIVERSAL}\n\n${names}`;
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
    mood: { type: 'string', enum: Object.keys(MOODS), description: 'Named lighting mood to apply verbatim.' },
    palette: {
      type: 'string',
      description: `Named palette from: ${Object.keys(PALETTES).join(', ')}. Use "custom" only with explicit colors below.`,
    },
    colors: S({
      dominant: { type: 'string', description: 'RGB "r,g,b" — ~60% of surface, desaturated (S<=0.35)' },
      secondary: { type: 'string', description: 'RGB "r,g,b" — ~30%' },
      accent: { type: 'string', description: 'RGB "r,g,b" — ~10%, the only saturated colour' },
      trim: { type: 'string', description: 'RGB "r,g,b" — darkest, for edges/skirting/frames' },
    }, ['dominant', 'secondary', 'accent', 'trim']),
    materials: {
      type: 'array',
      description: 'Exactly 4 Enum.Material names: 3 primary + 1 accent. Plastic is forbidden.',
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
