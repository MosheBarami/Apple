---
name: visual-effects
description: Designing visual effects in Roblox from a requested feel (impact, magic, ambience, pickup, trail). Covers ParticleEmitter (Rate, Lifetime, Speed, SpreadAngle, Size/Transparency NumberSequences, Color ColorSequence, LightEmission, Drag, Acceleration, Texture, Flipbook, ZOffset, EmissionDirection, Shape, Emit bursts), Beam, Trail, Attachments, Highlight, PointLight/SpotLight, Explosion, TweenService-driven effects, camera shake and screen effects, performance budgets, and textures (built-in vs store decals). Load before creating any particle, beam, trail, light flash or screen effect.
---

# Visual effects

An effect communicates something: "you hit", "you collected", "this is magical", "this place is dusty". Start from
that message, then pick shape, timing, colour and size. Build it from engine primitives and tune by looking at it.

## 1. Design method

1. **Name the feel and its timing.** Impact = sudden (0.05-0.3 s burst, fast fade). Magic = sustained, swirling,
   glowing. Ambience = slow, sparse, long-lived. Pickup = upward, bright, short. Speed = streaks along motion.
2. **Layer 2-4 elements** rather than one big emitter: e.g. impact = a bright flash (short light + one big soft
   particle) + sparks (fast small particles with drag/gravity) + smoke (slow, large, fading) + maybe a camera shake.
3. **Shape over time**: use NumberSequences so things grow/shrink and fade; nothing should pop in or out at full
   opacity.
4. **Colour**: one dominant hue plus a bright core; `LightEmission` for glowy energy, 0 for smoke/dust.
5. **Scale to the avatar** (5 studs tall): a hit spark is ~0.2-0.5 studs, a magic aura ~3-6 studs, dust motes ~0.1-0.3.
6. **Trigger** from code (client for cosmetic effects other players also need only as visuals; server-triggered
   effects replicate). Clean up after.

## 2. ParticleEmitter

Parent to a BasePart (emits from its volume/surface by `Shape`) or an `Attachment` (emits from a point).

| Property | Type / range | What it controls |
|---|---|---|
| `Rate` | particles/s | Continuous emission. 0 for burst-only emitters. Ambient 2-20; fire 20-60; keep total low. |
| `Lifetime` | NumberRange (s) | How long each lives. Spark 0.2-0.6, smoke 1-4, motes 3-8. |
| `Speed` | NumberRange (studs/s) | Initial speed along the emission direction. |
| `SpreadAngle` | Vector2 (degrees) | Cone around the direction (X, Y). (180,180) = all directions. |
| `EmissionDirection` | Enum.NormalId | Which face's normal (Top default). |
| `Shape`, `ShapeStyle`, `ShapeInOut`, `ShapePartial` | enums / 0-1 | Box/Sphere/Cylinder/Disc emission volume vs surface, outward/inward, partial arc. |
| `Size` | NumberSequence (studs) | Size over life. Grow for smoke, shrink for sparks. |
| `Transparency` | NumberSequence (0-1) | Fade over life; start ~0.2-0.5, end 1. |
| `Squash` | NumberSequence | Stretch: positive = taller/thinner (streaks). |
| `Color` | ColorSequence | Hue over life (hot core → cooler edge). |
| `LightEmission` | 0-1 | Additive blending: 1 = glow (fire, magic, energy); 0 = normal (smoke, dust, debris). |
| `LightInfluence` | 0-1 | How much scene lighting tints particles. 0 for glowing, 1 for physical things. |
| `Brightness` | ≥ 0 | Multiplier; > 1 boosts glow with bloom. |
| `Drag` | ≥ 0 | Exponential slowdown: sparks that burst out and stop. |
| `Acceleration` | Vector3 | Gravity (0,-30,0) for falling debris; (0,2,0) for rising smoke/embers. |
| `Rotation` / `RotSpeed` | NumberRange (degrees, deg/s) | Random start angle and spin; hides texture repetition. |
| `Orientation` | Enum | FacingCamera (default), VelocityParallel (streaks), VelocityPerpendicular, FacingCameraWorldUp. |
| `LockedToPart` | bool | Particles move with the emitter (auras, held torches). |
| `VelocityInheritance` | 0-1 | Inherit the part's velocity. |
| `ZOffset` | studs | Render-order nudge toward/away from camera (keeps a glow in front of smoke). |
| `TimeScale` | 0-1 | Slow-motion of the whole effect. |
| `Texture` | content id | The sprite. |
| `FlipbookLayout` / `FlipbookMode` / `FlipbookFramerate` / `FlipbookStartRandom` | Grid2x2/4x4/8x8, Loop/OneShot/PingPong/Random | Animated sprite sheets (texture must be a grid sheet). |
| `Enabled` | bool | Start/stop continuous emission (existing particles finish). |

- Bursts: set `Rate = 0`, call `emitter:Emit(count)` (count typically 5-40). `emitter:Clear()` removes live particles.
- Make sequences with `NumberSequence.new({ NumberSequenceKeypoint.new(time0to1, value, envelope?) })` and
  `ColorSequence.new({ ColorSequenceKeypoint.new(t, Color3) })` — first keypoint at 0, last at 1.
- Textures: the default (`rbxasset://textures/particles/sparkles_main.dds`) works for most glows; other built-in
  sprites live under `rbxasset://textures/particles/` (check one exists with `read_instance` on a fresh emitter or
  the docs before relying on a name). For a specific look (slash, ring, shockwave,
  leaf, snowflake), `search_creator_store` with category `decal` and a sprite-style query ("smoke particle texture",
  "ring shockwave"), then use the returned id. Never invent ids. A soft round white texture tinted by `Color` covers
  a lot.

## 3. Beam, Trail, Attachment

- `Attachment`: a point/orientation in a part (`Position`, `CFrame` relative to the part; `WorldPosition`). Effects
  need them as anchors. Name them.
- `Beam` connects `Attachment0` → `Attachment1`: lasers, ropes of light, waterfalls, god rays, magic links.
  Properties: `Width0`/`Width1`, `CurveSize0`/`CurveSize1` (bezier bend), `Segments` (smoothness), `Texture`,
  `TextureMode` (Stretch/Wrap/Static), `TextureLength`, `TextureSpeed` (scroll = flowing energy), `Color`,
  `Transparency` (sequences along length), `LightEmission`, `FaceCamera`.
- `Trail` draws between two attachments over time as the part moves: sword swings, dash streaks, projectiles.
  `Lifetime` (0.1-0.5 s for swings), `MinLength`, `MaxLength`, `WidthScale` (NumberSequence), `Transparency`,
  `Color`, `LightEmission`, `FaceCamera`. Toggle `Enabled` only during the action.

## 4. Highlight, lights, Explosion

- `Highlight`: outline/fill on a Model or part (`Adornee` or parent). `FillColor`, `FillTransparency`, `OutlineColor`,
  `OutlineTransparency`, `DepthMode` (AlwaysOnTop shows through walls; Occluded doesn't). Good for selection,
  interactables, damage flash. There is a limit (~31 active Highlights rendered); reuse and disable.
- `PointLight` / `SpotLight` / `SurfaceLight` in a part or attachment: a brief light flash sells impacts and spells;
  tween `Brightness` up then to 0. Keep `Shadows = false` for transient flashes.
- `Explosion` (Instance in Workspace): `Position`, `BlastRadius`, `BlastPressure` (0 for visual only),
  `DestroyJointRadiusPercent` (0 to avoid killing players), `Visible`. It kills by breaking joints unless you set
  those; for custom damage handle `Explosion.Hit` on the server.

## 5. TweenService-driven effects

`TweenService:Create(inst, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {Prop = goal}):Play()`
- Pulses (scale/transparency of a part), shockwave rings (a thin cylinder growing and fading), glows (light
  brightness), colour flashes. Use `Out` easing for impacts (fast start), `InOut` for idle loops
  (`repeatCount = -1, reverses = true`).
- Tween `Size`/`CFrame` of anchored, non-colliding parts only. Destroy temporary parts on `tween.Completed`.

## 6. Camera shake and screen effects (client only)

- Shake: in a LocalScript, on `RunService:BindToRenderStep("Shake", Enum.RenderPriority.Camera.Value + 1, fn)`
  multiply `camera.CFrame` by a small random rotation/offset whose amplitude decays over 0.2-0.5 s. Keep amplitude
  small (≤ 0.5° / 0.2 studs); respect motion-sensitive players (a setting to disable).
- Screen effects: a `ColorCorrectionEffect` or `BlurEffect` in `workspace.CurrentCamera` (client-local) tweened in and
  out for damage, low health, power-ups; a full-screen ScreenGui frame flash for hits (use the `build_ui` tool for
  UI).
- Field of view kick (`camera.FieldOfView` 70 → 80) for speed boosts.

## 7. Performance budget

- Particles: aim for ≤ ~500-1000 live particles on screen at once on mobile; each emitter ≤ 50-100 live
  (`Rate × Lifetime`). Large transparent particles cost more than many small ones (overdraw).
- Disable emitters when far or offscreen; pool effects (re-use emitters, call `Emit`) instead of cloning per event.
- Clean up: `Debris:AddItem(inst, seconds)` or `task.delay(t, function() inst:Destroy() end)` for temporary effect
  parts.
- Few dynamic lights; no shadows on effect lights.
- Cosmetic effects for one player belong on that client (no server work, no replication).

## 8. Verification

- After creating, `read_instance` the emitter to confirm properties took (sequences, texture).
- `play_check` while triggering the effect (or with `Enabled = true` temporarily) and read the screen description;
  check client errors.
- Ask: does it read at gameplay distance? Does it obscure the player or UI? Does it end cleanly? Then tune one
  property at a time.
- When unsure of a property or enum value, `search_docs` "ParticleEmitter" (or the class) and cite the page.
