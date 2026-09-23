// Roblox VFX presets (D-FXLIB-1): every effect Apple places comes from here, never from a property
// soup the model invents. Each preset is a small tree of real Roblox effect instances (Attachment,
// ParticleEmitter, Beam, Trail, Highlight, PointLight) with every property that decides how it
// looks already set, in the typed wire form the Studio plugin's create_instances accepts.
//
// TEXTURES. The default texture of every emitter is an engine texture that ships inside Roblox
// Studio and every Roblox client (content/textures/..., measured present in RobloxStudio.app on
// 2026-09-23), so a preset renders with no upload and no asset id. `packTexture` names the CC0
// Kenney texture that is the upload source for a sharper look, for when uploading effect textures
// is switched on (it is not yet: insert_vfx places the engine texture). fx.test.mjs checks that
// every engine texture named here is in the allowlist the plugin enforces and that every
// packTexture is a committed file.
//
// ONE-SHOT EFFECTS (kind "burst") are placed with Enabled = false and an AppleEmitCount attribute
// on each emitter; the game fires them with emitter:Emit(emitter:GetAttribute("AppleEmitCount")).
// insert_vfx with mode "loop" turns a burst preset on, which is how it is previewed in Studio.

/** Engine textures a preset may use. The plugin holds the same list (ENGINE texture allowance). */
export const ENGINE_TEXTURES = {
  sparkle: 'particles/sparkles_main.dds',
  glow: 'particles/explosion01_implosion_main.dds',
  ring: 'particles/explosion01_shockwave_main.dds',
  flame: 'particles/explosion01_core_main.dds',
  fire: 'particles/fire_main.dds',
  // Not particles/fire_sparks_main.dds: in Studio it renders almost nothing at any size (seen
  // 2026-09-23, hit_sparks showed no sparks until the texture was sparkles_main.dds).
  smoke: 'particles/smoke_main.dds',
  darkSmoke: 'particles/explosion01_smoke_main.dds',
  vortex: 'particles/forcefield_vortex_main.dds',
  forceGlow: 'particles/forcefield_glow_main.dds',
  square: 'particles/SquareParticle.png',
};

// --- typed wire values (packages/shared PropValue) ------------------------------------------------
const n = (v) => ({ t: 'number', v });
const b = (v) => ({ t: 'bool', v });
const s = (v) => ({ t: 'string', v });
const e = (v) => ({ t: 'EnumItem', v });
const rgb = (r, g, bl) => [+(r / 255).toFixed(4), +(g / 255).toFixed(4), +(bl / 255).toFixed(4)];
const c3 = (r, g, bl) => ({ t: 'Color3', v: rgb(r, g, bl) });
const cs = (stops) => ({ t: 'ColorSequence', v: stops.map(([time, r, g, bl]) => [time, rgb(r, g, bl)]) });
const ns = (stops) => ({ t: 'NumberSequence', v: stops.map(([time, value, env = 0]) => [time, value, env]) });
const nr = (a, bb = a) => ({ t: 'NumberRange', v: [a, bb] });
const v2 = (x, y) => ({ t: 'Vector2', v: [x, y] });
const v3 = (x, y, z) => ({ t: 'Vector3', v: [x, y, z] });
const tex = (key) => s(`rbxasset://textures/${ENGINE_TEXTURES[key]}`);
const one = (r, g, bl) => cs([[0, r, g, bl], [1, r, g, bl]]);

const KP = 'vfx/packs/kenney-particle-pack/';

/**
 * A particle emitter with the defaults every preset shares: no light influence (effects read as
 * light, not as lit paper), transparency always ending at 1 so nothing pops out of existence.
 */
function emitter(name, texture, props, extra = {}) {
  return {
    className: 'ParticleEmitter',
    name,
    props: { Texture: tex(texture), LightInfluence: n(0), ...props },
    ...extra,
  };
}

const light = (name, color, brightness, range, extra = {}) => ({
  className: 'PointLight',
  name,
  props: { Color: c3(...color), Brightness: n(brightness), Range: n(range), Shadows: b(false), ...extra },
});

export const PRESETS = [
  {
    name: 'coin_burst',
    category: 'coin_burst',
    kind: 'burst',
    summary: 'Gold coins-and-glints burst that pops up and falls back, for collecting money.',
    use: 'Fire it where a coin or cash pickup is collected, or over a player when they earn money.',
    parts: [
      emitter('Glints', 'sparkle', {
        Color: cs([[0, 255, 236, 140], [1, 255, 190, 40]]),
        Size: ns([[0, 0.9], [0.4, 0.7], [1, 0]]),
        Transparency: ns([[0, 0], [0.8, 0.2], [1, 1]]),
        Lifetime: nr(0.6, 1.1), Speed: nr(10, 18), SpreadAngle: v2(55, 55),
        Acceleration: v3(0, -30, 0), Drag: n(1.5), LightEmission: n(1), Rate: n(0),
        Rotation: nr(0, 360), RotSpeed: nr(-180, 180), EmissionDirection: e('Enum.NormalId.Top'),
      }, { emit: 24, packTexture: `${KP}star_06.png` }),
      emitter('Flash', 'glow', {
        Color: one(255, 214, 90),
        Size: ns([[0, 1.5], [0.25, 4], [1, 5]]),
        Transparency: ns([[0, 0.3], [1, 1]]),
        Lifetime: nr(0.25, 0.35), Speed: nr(0), LightEmission: n(1), Rate: n(0), ZOffset: n(-0.5),
      }, { emit: 1, packTexture: `${KP}light_01.png` }),
    ],
  },
  {
    name: 'sparkle_shimmer',
    category: 'sparkle',
    kind: 'loop',
    summary: 'A slow shimmer of twinkling stars around an object — rare, shiny, worth grabbing.',
    use: 'On rare items, legendary pets, shop highlights, chests and anything that should read as valuable.',
    parts: [
      emitter('Shimmer', 'sparkle', {
        Color: cs([[0, 255, 255, 255], [0.5, 255, 240, 170], [1, 180, 220, 255]]),
        Size: ns([[0, 0], [0.3, 0.55], [0.7, 0.45], [1, 0]]),
        Transparency: ns([[0, 0.1], [1, 1]]),
        Lifetime: nr(0.8, 1.6), Speed: nr(0.2, 0.8), SpreadAngle: v2(180, 180), Rate: n(9),
        LightEmission: n(1), Rotation: nr(0, 360), RotSpeed: nr(-60, 60),
        Shape: e('Enum.ParticleEmitterShape.Sphere'), ShapeStyle: e('Enum.ParticleEmitterShapeStyle.Volume'),
      }, { packTexture: `${KP}star_04.png` }),
    ],
  },
  {
    name: 'level_up_aura',
    category: 'level_up',
    kind: 'loop',
    summary: 'Golden light rising around a player in a column, with a ring pulse at the feet.',
    use: 'Parent to the HumanoidRootPart (or a part) when a player levels up; remove after a few seconds.',
    parts: [
      emitter('Rise', 'glow', {
        Color: cs([[0, 255, 245, 180], [1, 255, 190, 50]]),
        Size: ns([[0, 0.6], [1, 0]]),
        Transparency: ns([[0, 0.2], [0.8, 0.5], [1, 1]]),
        Lifetime: nr(1, 1.6), Speed: nr(4, 7), SpreadAngle: v2(8, 8), Rate: n(40),
        LightEmission: n(1), EmissionDirection: e('Enum.NormalId.Top'),
        Shape: e('Enum.ParticleEmitterShape.Cylinder'), ShapeStyle: e('Enum.ParticleEmitterShapeStyle.Surface'),
      }, { packTexture: `${KP}light_02.png` }),
      emitter('Stars', 'sparkle', {
        Color: one(255, 240, 160),
        Size: ns([[0, 0.5], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.8, 1.4), Speed: nr(3, 6), SpreadAngle: v2(20, 20), Rate: n(12),
        LightEmission: n(1), RotSpeed: nr(-90, 90), EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}star_08.png` }),
      emitter('Ring', 'ring', {
        Color: one(255, 220, 110),
        Size: ns([[0, 1], [1, 9]]),
        Transparency: ns([[0, 0.2], [1, 1]]),
        Lifetime: nr(0.7), Speed: nr(0), Rate: n(1.5), LightEmission: n(1),
        Orientation: e('Enum.ParticleOrientation.VelocityPerpendicular'), EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}circle_05.png` }),
      light('Glow', [255, 215, 120], 2, 14),
    ],
  },
  {
    name: 'rebirth_pillar',
    category: 'rebirth',
    kind: 'beam',
    summary: 'A tall pillar of light from the ground into the sky, with energy streaming up it.',
    use: 'Rebirth / prestige moments, spawn points, quest beacons. Parent to a part on the ground.',
    attachments: [{ name: 'Base', position: [0, 0, 0] }, { name: 'Top', position: [0, 60, 0] }],
    parts: [
      {
        className: 'Beam', name: 'Pillar', links: ['Base', 'Top'],
        props: {
          Color: cs([[0, 140, 220, 255], [0.5, 210, 150, 255], [1, 255, 255, 255]]),
          Transparency: ns([[0, 0.1], [0.7, 0.45], [1, 1]]),
          Width0: n(6), Width1: n(3), FaceCamera: b(true), LightEmission: n(1), LightInfluence: n(0),
          Segments: n(10), Texture: tex('glow'), TextureMode: e('Enum.TextureMode.Stretch'), TextureSpeed: n(0.6),
          Brightness: n(3),
        },
      },
      {
        className: 'Beam', name: 'Core', links: ['Base', 'Top'],
        props: {
          Color: one(255, 255, 255),
          Transparency: ns([[0, 0.2], [1, 1]]),
          Width0: n(1.6), Width1: n(0.8), FaceCamera: b(true), LightEmission: n(1), LightInfluence: n(0),
          Brightness: n(4),
        },
      },
      emitter('Stream', 'glow', {
        Color: cs([[0, 180, 230, 255], [1, 220, 170, 255]]),
        Size: ns([[0, 0.8], [1, 0]]),
        Transparency: ns([[0, 0.1], [1, 1]]),
        Lifetime: nr(1.5, 2.5), Speed: nr(14, 22), SpreadAngle: v2(4, 4), Rate: n(35), LightEmission: n(1),
        EmissionDirection: e('Enum.NormalId.Top'),
      }, { under: 'Base', packTexture: `${KP}magic_02.png` }),
      light('Glow', [190, 170, 255], 3, 20),
    ],
  },
  {
    name: 'fire',
    category: 'fire',
    kind: 'loop',
    summary: 'Warm licking flames with embers and their own flickering light.',
    use: 'Campfires, torches, braziers, burning wrecks. Parent to the burning part.',
    parts: [
      emitter('Flames', 'flame', {
        Color: cs([[0, 255, 220, 120], [0.4, 255, 130, 30], [1, 160, 40, 10]]),
        Size: ns([[0, 1.2], [0.4, 1.8], [1, 0.3]]),
        Transparency: ns([[0, 0.3], [0.6, 0.5], [1, 1]]),
        Lifetime: nr(0.6, 1), Speed: nr(3, 5), SpreadAngle: v2(10, 10), Acceleration: v3(0, 6, 0),
        Drag: n(1), Rate: n(28), LightEmission: n(0.9), Rotation: nr(-30, 30), RotSpeed: nr(-60, 60),
        EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}fire_01.png` }),
      emitter('Embers', 'glow', {
        Color: cs([[0, 255, 220, 140], [1, 255, 90, 20]]),
        Size: ns([[0, 0.25], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(1.2, 2.2), Speed: nr(3, 6), SpreadAngle: v2(25, 25), Acceleration: v3(0.8, 2.5, 0),
        Rate: n(8), LightEmission: n(1), EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}spark_01.png` }),
      light('Light', [255, 160, 70], 2, 16, { Shadows: b(true) }),
    ],
  },
  {
    name: 'smoke',
    category: 'smoke',
    kind: 'loop',
    summary: 'Slow grey smoke that billows up and widens.',
    use: 'Chimneys, wrecks, extinguished fires, factory stacks.',
    parts: [
      emitter('Smoke', 'smoke', {
        Color: cs([[0, 120, 120, 125], [1, 70, 70, 75]]),
        Size: ns([[0, 1.5], [1, 6]]),
        Transparency: ns([[0, 1], [0.15, 0.45], [1, 1]]),
        Lifetime: nr(3, 5), Speed: nr(2, 3.5), SpreadAngle: v2(15, 15), Acceleration: v3(0.6, 1.2, 0),
        Drag: n(0.8), Rate: n(8), Rotation: nr(0, 360), RotSpeed: nr(-20, 20), LightInfluence: n(0.8),
        EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}smoke_04.png` }),
    ],
  },
  {
    name: 'explosion',
    category: 'explosion',
    kind: 'burst',
    summary: 'Fireball, shockwave ring, flying sparks and rolling smoke — a full explosion without the physics.',
    use: 'Bombs, destroyed objects, rockets, boss deaths. Fire it once; it does no damage by itself.',
    parts: [
      emitter('Fireball', 'flame', {
        Color: cs([[0, 255, 240, 180], [0.3, 255, 140, 30], [1, 90, 30, 10]]),
        Size: ns([[0, 3], [0.3, 9], [1, 11]]),
        Transparency: ns([[0, 0], [0.5, 0.4], [1, 1]]),
        Lifetime: nr(0.5, 0.8), Speed: nr(4, 10), SpreadAngle: v2(180, 180), Drag: n(4), Rate: n(0),
        LightEmission: n(1), Rotation: nr(0, 360), RotSpeed: nr(-90, 90),
      }, { emit: 14, packTexture: `${KP}fire_02.png` }),
      emitter('Shockwave', 'ring', {
        Color: one(255, 220, 160),
        Size: ns([[0, 2], [1, 26]]),
        Transparency: ns([[0, 0.1], [1, 1]]),
        Lifetime: nr(0.45), Speed: nr(0), Rate: n(0), LightEmission: n(1),
        Orientation: e('Enum.ParticleOrientation.VelocityPerpendicular'), EmissionDirection: e('Enum.NormalId.Top'),
      }, { emit: 1, packTexture: `${KP}circle_03.png` }),
      emitter('Sparks', 'sparkle', {
        Color: cs([[0, 255, 240, 170], [1, 255, 120, 30]]),
        Size: ns([[0, 0.5], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.6, 1.2), Speed: nr(35, 60), SpreadAngle: v2(180, 180), Acceleration: v3(0, -40, 0),
        Drag: n(2), Rate: n(0), LightEmission: n(1), Orientation: e('Enum.ParticleOrientation.VelocityParallel'),
      }, { emit: 40, packTexture: `${KP}spark_05.png` }),
      emitter('Smoke', 'smoke', {
        Color: cs([[0, 90, 80, 75], [1, 45, 45, 45]]),
        Size: ns([[0, 4], [1, 14]]),
        Transparency: ns([[0, 0.3], [1, 1]]),
        Lifetime: nr(2, 3.5), Speed: nr(6, 12), SpreadAngle: v2(180, 180), Drag: n(3), Acceleration: v3(0, 3, 0),
        Rate: n(0), Rotation: nr(0, 360), RotSpeed: nr(-30, 30), LightInfluence: n(0.7), ZOffset: n(-1),
      }, { emit: 12, packTexture: `${KP}smoke_07.png` }),
      light('Flash', [255, 180, 90], 6, 40),
    ],
  },
  {
    name: 'magic_hit',
    category: 'magic',
    kind: 'burst',
    summary: 'A violet arcane impact: bright flash, expanding rune ring and glittering shards.',
    use: 'Where a spell, magic projectile or special ability lands.',
    parts: [
      emitter('Flash', 'glow', {
        Color: one(210, 150, 255),
        Size: ns([[0, 2], [0.3, 6], [1, 7]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.3), Speed: nr(0), Rate: n(0), LightEmission: n(1),
      }, { emit: 1, packTexture: `${KP}magic_01.png` }),
      emitter('Ring', 'vortex', {
        Color: cs([[0, 230, 190, 255], [1, 140, 70, 255]]),
        Size: ns([[0, 1], [1, 10]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.5), Speed: nr(0), Rate: n(0), LightEmission: n(1), RotSpeed: nr(120, 200),
      }, { emit: 1, packTexture: `${KP}twirl_01.png` }),
      emitter('Shards', 'sparkle', {
        Color: cs([[0, 255, 230, 255], [1, 150, 80, 255]]),
        Size: ns([[0, 0.8], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.4, 0.8), Speed: nr(14, 24), SpreadAngle: v2(180, 180), Drag: n(5), Rate: n(0),
        LightEmission: n(1), Rotation: nr(0, 360), RotSpeed: nr(-200, 200),
      }, { emit: 22, packTexture: `${KP}star_07.png` }),
      light('FlashLight', [200, 140, 255], 4, 18),
    ],
  },
  {
    name: 'heal',
    category: 'heal',
    kind: 'loop',
    summary: 'Soft green motes and sparkles drifting up around a player.',
    use: 'Healing zones, potions, regen buffs, safe zones. Parent to the player root or a pad.',
    parts: [
      emitter('Motes', 'glow', {
        Color: cs([[0, 180, 255, 190], [1, 60, 230, 120]]),
        Size: ns([[0, 0], [0.2, 0.7], [1, 0]]),
        Transparency: ns([[0, 0.2], [1, 1]]),
        Lifetime: nr(1.2, 2), Speed: nr(2, 4), SpreadAngle: v2(10, 10), Rate: n(18), LightEmission: n(1),
        EmissionDirection: e('Enum.NormalId.Top'),
        Shape: e('Enum.ParticleEmitterShape.Cylinder'), ShapeStyle: e('Enum.ParticleEmitterShapeStyle.Surface'),
      }, { packTexture: `${KP}symbol_01.png` }),
      emitter('Sparkles', 'sparkle', {
        Color: one(200, 255, 210),
        Size: ns([[0, 0.4], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.8, 1.2), Speed: nr(1.5, 3), SpreadAngle: v2(30, 30), Rate: n(8), LightEmission: n(1),
        EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}star_02.png` }),
      light('Glow', [120, 255, 150], 1.5, 12),
    ],
  },
  {
    name: 'portal',
    category: 'portal',
    kind: 'loop',
    summary: 'A swirling vortex disc with particles spiralling in and a glowing rim.',
    use: 'Teleporters, world gates, obby checkpoints to a new area. Parent to a thin upright part (the doorway).',
    parts: [
      emitter('Vortex', 'vortex', {
        Color: cs([[0, 120, 200, 255], [0.5, 170, 110, 255], [1, 90, 60, 230]]),
        Size: ns([[0, 6], [0.5, 7], [1, 5.5]]),
        Transparency: ns([[0, 1], [0.2, 0.2], [0.8, 0.2], [1, 1]]),
        Lifetime: nr(1.5), Speed: nr(0), Rate: n(4), LightEmission: n(1), RotSpeed: nr(90, 140),
        Rotation: nr(0, 360), LockedToPart: b(true),
        Orientation: e('Enum.ParticleOrientation.VelocityPerpendicular'), EmissionDirection: e('Enum.NormalId.Front'),
      }, { packTexture: `${KP}twirl_02.png` }),
      emitter('Core', 'glow', {
        Color: one(200, 180, 255),
        Size: ns([[0, 3.5], [1, 4]]),
        Transparency: ns([[0, 0.5], [0.5, 0.35], [1, 1]]),
        Lifetime: nr(1), Speed: nr(0), Rate: n(3), LightEmission: n(1), LockedToPart: b(true),
      }),
      emitter('Inflow', 'sparkle', {
        Color: one(220, 200, 255),
        Size: ns([[0, 0.5], [1, 0.1]]),
        Transparency: ns([[0, 1], [0.3, 0], [1, 0.5]]),
        Lifetime: nr(1, 1.4), Speed: nr(-4, -3), Rate: n(20), LightEmission: n(1),
        Shape: e('Enum.ParticleEmitterShape.Sphere'), ShapeStyle: e('Enum.ParticleEmitterShapeStyle.Surface'),
        ShapeInOut: e('Enum.ParticleEmitterShapeInOut.Inward'), LockedToPart: b(true),
      }),
      light('Glow', [160, 130, 255], 3, 16),
    ],
  },
  {
    name: 'water_splash',
    category: 'water',
    kind: 'burst',
    summary: 'A crown of droplets thrown up and falling back, with a ripple ring on the surface.',
    use: 'Something landing in water, a player jumping into a pool, fountains, water balloons.',
    parts: [
      emitter('Droplets', 'glow', {
        Color: cs([[0, 220, 245, 255], [1, 120, 190, 255]]),
        Size: ns([[0, 0.6], [1, 0.2]]),
        Transparency: ns([[0, 0.1], [0.8, 0.3], [1, 1]]),
        Lifetime: nr(0.6, 1), Speed: nr(12, 20), SpreadAngle: v2(30, 30), Acceleration: v3(0, -60, 0),
        Rate: n(0), LightEmission: n(0.4), EmissionDirection: e('Enum.NormalId.Top'),
      }, { emit: 30, packTexture: `${KP}circle_01.png` }),
      emitter('Ripple', 'ring', {
        Color: one(210, 240, 255),
        Size: ns([[0, 1], [1, 10]]),
        Transparency: ns([[0, 0.2], [1, 1]]),
        Lifetime: nr(0.9), Speed: nr(0.01), Rate: n(0), LightEmission: n(0.5),
        Orientation: e('Enum.ParticleOrientation.VelocityPerpendicular'), EmissionDirection: e('Enum.NormalId.Top'),
      }, { emit: 2, packTexture: `${KP}circle_04.png` }),
      emitter('Mist', 'smoke', {
        Color: one(230, 245, 255),
        Size: ns([[0, 1.5], [1, 4]]),
        Transparency: ns([[0, 0.5], [1, 1]]),
        Lifetime: nr(0.8, 1.2), Speed: nr(3, 6), SpreadAngle: v2(60, 60), Drag: n(3), Rate: n(0),
        LightInfluence: n(0.6), EmissionDirection: e('Enum.NormalId.Top'),
      }, { emit: 6 }),
    ],
  },
  {
    name: 'dust_trail',
    category: 'dust',
    kind: 'loop',
    summary: 'Brown dust puffs kicked up behind something moving along the ground.',
    use: 'Parent to a vehicle wheel, a running pet or a player foot; puffs stay behind as it moves.',
    parts: [
      emitter('Dust', 'smoke', {
        Color: cs([[0, 185, 160, 125], [1, 140, 120, 95]]),
        Size: ns([[0, 0.8], [1, 3]]),
        Transparency: ns([[0, 0.4], [1, 1]]),
        Lifetime: nr(0.8, 1.4), Speed: nr(1, 2.5), SpreadAngle: v2(40, 40), Drag: n(2), Acceleration: v3(0, 1, 0),
        Rate: n(22), Rotation: nr(0, 360), RotSpeed: nr(-30, 30), LightInfluence: n(0.9),
        EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}dirt_01.png` }),
    ],
  },
  {
    name: 'speed_trail',
    category: 'trail',
    kind: 'trail',
    summary: 'A glowing ribbon that streams behind a moving object and fades out.',
    use: 'Sprint and dash abilities, speed pads, swords, fast pets, racing cars. Parent to the moving part.',
    attachments: [{ name: 'Top', position: [0, 1, 0] }, { name: 'Bottom', position: [0, -1, 0] }],
    parts: [
      {
        className: 'Trail', name: 'Trail', links: ['Top', 'Bottom'],
        props: {
          Color: cs([[0, 120, 230, 255], [1, 200, 120, 255]]),
          Transparency: ns([[0, 0.1], [1, 1]]),
          WidthScale: ns([[0, 1], [1, 0.2]]),
          Lifetime: n(0.45), MinLength: n(0.05), FaceCamera: b(true), LightEmission: n(1), LightInfluence: n(0),
          Texture: tex('glow'), TextureMode: e('Enum.TextureMode.Stretch'), Brightness: n(2),
        },
      },
    ],
  },
  {
    name: 'confetti',
    category: 'confetti',
    kind: 'burst',
    summary: 'Coloured paper squares fired up that tumble and flutter down.',
    use: 'Wins, finishing an obby, unlocking a badge, birthdays, the end of a round.',
    parts: [
      ...[['Red', [255, 70, 90]], ['Yellow', [255, 210, 60]], ['Blue', [70, 150, 255]], ['Green', [80, 220, 120]], ['Pink', [255, 120, 220]]].map(([name, col]) =>
        emitter(`Confetti${name}`, 'square', {
          Color: one(...col),
          Size: ns([[0, 0.35], [1, 0.3]]),
          Transparency: ns([[0, 0], [0.85, 0], [1, 1]]),
          Lifetime: nr(2.5, 4), Speed: nr(25, 40), SpreadAngle: v2(35, 35), Acceleration: v3(0, -18, 0),
          Drag: n(2.2), Rate: n(0), Rotation: nr(0, 360), RotSpeed: nr(-360, 360), LightInfluence: n(0.3),
          EmissionDirection: e('Enum.NormalId.Top'),
        }, { emit: 20 }),
      ),
    ],
  },
  {
    name: 'pet_hatch',
    category: 'pet_hatch',
    kind: 'burst',
    summary: 'The egg-opening moment: white-gold flash, a double ring pulse and a shower of stars.',
    use: 'When an egg hatches or a gacha/capsule reveals its prize.',
    parts: [
      emitter('Flash', 'glow', {
        Color: one(255, 250, 220),
        Size: ns([[0, 2], [0.2, 10], [1, 12]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.5), Speed: nr(0), Rate: n(0), LightEmission: n(1),
      }, { emit: 1, packTexture: `${KP}light_03.png` }),
      emitter('Rings', 'ring', {
        Color: cs([[0, 255, 240, 170], [1, 255, 170, 240]]),
        Size: ns([[0, 1], [1, 14]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.6, 0.9), Speed: nr(0), Rate: n(0), LightEmission: n(1), Rotation: nr(0, 360),
      }, { emit: 2, packTexture: `${KP}circle_02.png` }),
      emitter('Stars', 'sparkle', {
        Color: cs([[0, 255, 255, 200], [0.5, 255, 200, 240], [1, 170, 220, 255]]),
        Size: ns([[0, 1], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.8, 1.4), Speed: nr(12, 22), SpreadAngle: v2(180, 180), Drag: n(3), Acceleration: v3(0, -6, 0),
        Rate: n(0), LightEmission: n(1), Rotation: nr(0, 360), RotSpeed: nr(-180, 180),
      }, { emit: 36, packTexture: `${KP}star_09.png` }),
      light('FlashLight', [255, 240, 200], 5, 24),
    ],
  },
  {
    name: 'egg_glow',
    category: 'pet_hatch',
    kind: 'highlight',
    summary: 'A soft glowing outline and aura around an egg, with a slow sparkle — "open me".',
    use: 'Eggs in a hatch shop, rare eggs, mystery boxes. Parent to the egg part or model.',
    parts: [
      {
        className: 'Highlight', name: 'Glow', under: 'target',
        props: {
          FillColor: c3(255, 230, 150), FillTransparency: n(0.75), OutlineColor: c3(255, 245, 200),
          OutlineTransparency: n(0.1), DepthMode: e('Enum.HighlightDepthMode.Occluded'),
        },
      },
      emitter('Aura', 'glow', {
        Color: one(255, 225, 140),
        Size: ns([[0, 0], [0.3, 1.2], [1, 0]]),
        Transparency: ns([[0, 0.4], [1, 1]]),
        Lifetime: nr(1.2, 2), Speed: nr(0.5, 1.2), SpreadAngle: v2(180, 180), Rate: n(6), LightEmission: n(1),
        Shape: e('Enum.ParticleEmitterShape.Sphere'), ShapeStyle: e('Enum.ParticleEmitterShapeStyle.Surface'),
      }),
      emitter('Twinkle', 'sparkle', {
        Color: one(255, 255, 230),
        Size: ns([[0, 0], [0.5, 0.5], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.6, 1), Speed: nr(0), Rate: n(3), LightEmission: n(1), RotSpeed: nr(-90, 90),
        Shape: e('Enum.ParticleEmitterShape.Sphere'), ShapeStyle: e('Enum.ParticleEmitterShapeStyle.Surface'),
      }),
      light('GlowLight', [255, 225, 150], 1.5, 10),
    ],
  },
  {
    name: 'lightning',
    category: 'lightning',
    kind: 'beam',
    summary: 'A jagged blue-white bolt from the sky to the ground, with a strike flash and sparks.',
    use: 'Storm maps, lightning abilities, boss attacks, electric traps. Parent to the part that gets struck.',
    attachments: [
      { name: 'Sky', position: [0, 60, 0] }, { name: 'Kink1', position: [3, 44, 1.5] },
      { name: 'Kink2', position: [-2.5, 28, -1] }, { name: 'Kink3', position: [1.5, 12, 0.8] },
      { name: 'Ground', position: [0, 0, 0] },
    ],
    parts: [
      ...[['Bolt1', 'Sky', 'Kink1'], ['Bolt2', 'Kink1', 'Kink2'], ['Bolt3', 'Kink2', 'Kink3'], ['Bolt4', 'Kink3', 'Ground']].map(([name, a, z]) => ({
        className: 'Beam', name, links: [a, z],
        props: {
          Color: cs([[0, 200, 230, 255], [1, 255, 255, 255]]),
          Transparency: ns([[0, 0], [1, 0]]),
          Width0: n(0.9), Width1: n(0.9), FaceCamera: b(true), LightEmission: n(1), LightInfluence: n(0),
          Brightness: n(8), Segments: n(1),
        },
      })),
      emitter('Strike', 'sparkle', {
        Color: one(200, 230, 255),
        Size: ns([[0, 0.5], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.3, 0.6), Speed: nr(20, 35), SpreadAngle: v2(80, 80), Acceleration: v3(0, -30, 0),
        Rate: n(30), LightEmission: n(1), EmissionDirection: e('Enum.NormalId.Top'),
        Orientation: e('Enum.ParticleOrientation.VelocityParallel'),
      }, { under: 'Ground', packTexture: `${KP}spark_07.png` }),
      light('StrikeLight', [170, 210, 255], 8, 40),
    ],
  },
  {
    name: 'snow',
    category: 'snow',
    kind: 'area',
    summary: 'Gentle snowflakes drifting down over an area.',
    use: 'Winter maps and holiday events. Parent to a large invisible part above the area, or to Workspace to get one made.',
    parts: [
      emitter('Snow', 'glow', {
        Color: one(255, 255, 255),
        Size: ns([[0, 0.3], [1, 0.25]]),
        Transparency: ns([[0, 1], [0.1, 0.1], [0.9, 0.1], [1, 1]]),
        Lifetime: nr(8, 12), Speed: nr(3, 5), SpreadAngle: v2(15, 15), Acceleration: v3(0.6, 0, 0.3),
        Rate: n(160), LightEmission: n(0.3), RotSpeed: nr(-40, 40), EmissionDirection: e('Enum.NormalId.Bottom'),
      }, { packTexture: `${KP}circle_05.png` }),
    ],
  },
  {
    name: 'rain',
    category: 'rain',
    kind: 'area',
    summary: 'Falling rain streaks over an area.',
    use: 'Stormy and moody maps. Parent to a large invisible part above the area, or to Workspace to get one made. Pair with a rain ambience sound.',
    parts: [
      // Seen in Studio (docs/gauntlet/visual/fx-library/19-rain.jpg): with VelocityParallel a
      // positive Squash lays the streak flat, and a 0.12 glow dot is invisible; a square particle
      // squashed negative falls as a visible vertical streak.
      emitter('Rain', 'square', {
        Color: one(190, 210, 235),
        Size: ns([[0, 0.25], [1, 0.25]]),
        Squash: ns([[0, -2], [1, -2]]),
        Transparency: ns([[0, 0.25], [1, 0.25]]),
        Lifetime: nr(0.9, 1.1), Speed: nr(70, 80), SpreadAngle: v2(2, 2), Rate: n(400), LightEmission: n(0.2),
        Orientation: e('Enum.ParticleOrientation.VelocityParallel'), EmissionDirection: e('Enum.NormalId.Bottom'),
      }, { packTexture: `${KP}trace_01.png` }),
    ],
  },
  {
    name: 'fireflies',
    category: 'fireflies',
    kind: 'area',
    summary: 'Small yellow-green lights wandering and blinking at dusk.',
    use: 'Night forests, meadows, swamps, camp scenes. Parent to a low invisible part over the area, or to Workspace.',
    parts: [
      emitter('Fireflies', 'glow', {
        Color: one(210, 255, 120),
        Size: ns([[0, 0.4], [1, 0.4]]),
        Transparency: ns([[0, 1], [0.2, 0.1], [0.4, 0.8], [0.6, 0.1], [0.8, 0.6], [1, 1]]),
        Lifetime: nr(4, 7), Speed: nr(0.3, 1), SpreadAngle: v2(180, 180), Acceleration: v3(0, 0.2, 0),
        Rate: n(14), LightEmission: n(1), EmissionDirection: e('Enum.NormalId.Top'),
      }, { packTexture: `${KP}light_01.png` }),
    ],
  },
  {
    name: 'hit_sparks',
    category: 'magic',
    kind: 'burst',
    summary: 'A quick white-orange spark spray and flash — a weapon or punch landing.',
    use: 'Sword hits, punches, bullets hitting metal, critical hits.',
    parts: [
      emitter('Sparks', 'sparkle', {
        Color: cs([[0, 255, 255, 220], [1, 255, 150, 40]]),
        Size: ns([[0, 0.35], [1, 0]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.2, 0.45), Speed: nr(25, 45), SpreadAngle: v2(60, 60), Drag: n(4), Rate: n(0),
        LightEmission: n(1), Orientation: e('Enum.ParticleOrientation.VelocityParallel'),
      }, { emit: 18, packTexture: `${KP}spark_03.png` }),
      emitter('Flash', 'glow', {
        Color: one(255, 240, 200),
        Size: ns([[0, 1.5], [1, 3]]),
        Transparency: ns([[0, 0], [1, 1]]),
        Lifetime: nr(0.12), Speed: nr(0), Rate: n(0), LightEmission: n(1),
      }, { emit: 1, packTexture: `${KP}flare_01.png` }),
    ],
  },
  {
    name: 'select_highlight',
    category: 'highlight',
    kind: 'highlight',
    summary: 'A clean coloured outline on a model or part, visible through walls.',
    use: 'Hover/selection feedback, interactable objects, a quest target, the player\'s own team.',
    parts: [
      {
        className: 'Highlight', name: 'Outline', under: 'target',
        props: {
          FillColor: c3(90, 200, 255), FillTransparency: n(0.85), OutlineColor: c3(90, 200, 255),
          OutlineTransparency: n(0), DepthMode: e('Enum.HighlightDepthMode.AlwaysOnTop'),
        },
      },
    ],
  },
];
