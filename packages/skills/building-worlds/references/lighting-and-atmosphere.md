# Lighting and atmosphere parameters

What each knob does, its useful range, and which direction pushes which mood. These are not presets: derive values
from the mood words in the request, set them, look (`play_check`), adjust. Docs:
https://create.roblox.com/docs/environment/lighting, /environment/atmosphere, /environment/post-processing-effects.

## Lighting (service)

| Property | Range | Effect / mood lever |
|---|---|---|
| `ClockTime` | 0-24 (hours) | Sun position. 6-7 and 17-19 = low warm sun and long shadows (golden hour); 12-14 = flat bright noon; 0-4 / 20-24 = night (moon). `TimeOfDay` is the same as a "HH:MM:SS" string. |
| `GeographicLatitude` | degrees | Tilts the sun path; raise it for a lower midday sun and longer shadows. |
| `Brightness` | 0-10 (typ. 1-3) | Strength of sun/moon light. Night scenes: ~0-1 and lean on local lights. |
| `ExposureCompensation` | -5..5 | Whole-scene exposure bias after lighting; +1 doubles, -1 halves. Fix "too dark/too bright" here before touching everything else. |
| `Ambient` | Color3 | Light added everywhere *indoors/occluded* areas. Dark (≤ 40,40,40) = moody interiors; raised = flat, friendly. Tint it (blue-ish night, warm interior). |
| `OutdoorAmbient` | Color3 | Ambient for outdoor areas; controls how dark shadows are outside. Low = high contrast/drama; high = soft cartoon. |
| `ColorShift_Top` / `ColorShift_Bottom` | Color3 | Tint of light on surfaces facing toward / away from the sun. Warm top for sunsets. |
| `EnvironmentDiffuseScale` / `EnvironmentSpecularScale` | 0-1 | How much the sky lights and reflects on surfaces. ~1 for realistic PBR, lower for stylised. |
| `GlobalShadows` | bool | Sun shadows. Off only for a deliberately flat style. |
| `ShadowSoftness` | 0-1 (default 0.2) | Shadow edge blur (shadow-map path). Higher = overcast/soft. |
| `LightingStyle` | `Realistic` / `Soft` | Artistic intent (replaces `Technology`, which is not scriptable). |
| `PrioritizeLightingQuality` | bool | On lower quality levels, keep shadows/shading quality (true) or view distance (false). |
| `FogStart` / `FogEnd` / `FogColor` | studs | Legacy linear fog; hidden and ignored when an `Atmosphere` exists. Prefer Atmosphere. |

Local lights (parent to a part or Attachment): `PointLight` (`Brightness` 0-~10, `Range` up to 60, or 120 with
`Lighting.ExtendLightRangeTo120`, `Color`, `Shadows`), `SpotLight` (+ `Angle` 0-180, `Face`), `SurfaceLight`
(+ `Angle`, `Face`). Warm (255,180,110) for fire/lamps, cool (150,190,255) for moon/tech. Several dim lights beat one
bright one.

## Atmosphere (child of Lighting)

| Property | Range | Effect |
|---|---|---|
| `Density` | 0-1 | Amount of particles in air: how much distant objects fade. 0.2-0.35 clear day; 0.4-0.6 hazy; 0.7+ thick fog/mystery. |
| `Offset` | 0-1 | How light passes between camera and sky. Higher = distant objects silhouette against the sky (horizon); lower = they blend into the sky (endless world). |
| `Color` | Color3 | Hue of the atmosphere near the sun / overall tint of the fog. Grey-blue = cold mist; orange = dust/sunset; green = toxic. |
| `Decay` | Color3 | Hue away from the sun (needs Haze and Glare > 0). Creates a gradient across the sky. |
| `Haze` | 0-10 | Haziness above the horizon and into the distance. 0-1 clean; 2-3 polluted/humid. |
| `Glare` | 0-10 | Glow around the sun (needs Haze > 0). Hot, bright days or dreamy scenes. |

## Sky (child of Lighting)
- `SkyboxBk/Dn/Ft/Lf/Rt/Up` (six images), `SunTextureId`, `MoonTextureId`, `SunAngularSize`, `MoonAngularSize`,
  `CelestialBodiesShown`, `StarCount` (night sky stars, 0-5000ish), `SkyboxOrientation`.
- No Sky = default Roblox sky. Custom skybox images must be real asset ids (store search, category decal; or the
  user's own). Never invent ids.

## Clouds (child of Workspace.Terrain)
- `Cover` 0-1 (sparse → overcast), `Density` 0-1 (wispy → thick/dark), `Color`. Stormy: high Cover and Density,
  grey Color, lower Lighting.Brightness.

## Post-processing (children of Lighting or Camera)

| Effect | Properties | Use |
|---|---|---|
| `ColorCorrectionEffect` | `Brightness` (-1..1, small steps ±0.05), `Contrast` (-1..1; +0.1-0.2 punchy), `Saturation` (-1..1; -0.3 bleak/cold, +0.2 vivid/cartoon), `TintColor` (multiplier; slight warm or cool cast) | The main colour grade. Change one thing at a time. |
| `BloomEffect` | `Intensity` (0-1+), `Size` (0-56, spread), `Threshold` (brightness above which pixels bloom; 0 = everything blooms, ~1 = only whites) | Glow on neon/sun/highlights. Too much washes the scene; keep Threshold high unless dreamy. |
| `SunRaysEffect` | `Intensity` (0-1, typically 0.01-0.25), `Spread` (0-1) | God rays when the sun is visible past occluders. |
| `DepthOfFieldEffect` | `FarIntensity`, `NearIntensity` (0-1), `FocusDistance`, `InFocusRadius` (studs) | Cinematic blur; keep subtle in gameplay (it blurs targets). |
| `BlurEffect` | `Size` (0-56) | Menus/pauses/damage; not for permanent world mood. |

## Turning mood words into values (method)

- **Warm vs cold**: shift ColorShift_Top, Atmosphere Color, TintColor toward orange or blue; adjust ClockTime toward
  golden hour (warm) or overcast midday/dawn (cold).
- **Bright/friendly vs dark/tense**: raise or lower OutdoorAmbient and ExposureCompensation; contrast up for tension;
  saturation up for playful, down for grim.
- **Open vs claustrophobic**: Atmosphere Density low + Offset high (see far, clear horizon) vs Density high + Haze
  (short visibility).
- **Magical / dreamy**: Bloom with a lower Threshold, Glare, pastel TintColor, soft shadows.
- **Realistic**: LightingStyle Realistic, EnvironmentDiffuse/SpecularScale near 1, neutral grade, modest bloom.
- Always check gameplay readability afterwards: paths, enemies and UI must remain visible on a phone screen.
