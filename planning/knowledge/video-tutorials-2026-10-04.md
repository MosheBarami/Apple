# Knowledge from 8 owner-chosen Roblox tutorial videos (2026-10-04)

**Status:** distilled by the planner from each video's captions (YouTube's own English captions, fetched 2026-10-04). These are facts and rules, not transcripts. Do not commit the raw transcripts: the repo is public and the videos belong to their creators.

**Not seen yet:** the on-screen details. Captions miss exact colour codes, asset IDs shown on screen or in descriptions, and layouts. Claude Code must re-watch the videos with frames using the `claude-video` plugin (task V1 below) and fill in every item marked [frames].

| # | Video | Channel | Topic |
|---|---|---|---|
| V-A | [How To Make Stud GUI In Roblox Studio](https://www.youtube.com/watch?v=vitiAMlaupQ) | Kingkade 3D | Clean stud UI panel *(already the reference for `stud-ui.ts`, 2026-10-01)* |
| V-B | [Make Your Roblox UI Look 10x Better](https://www.youtube.com/watch?v=F6AtQKo3uIY) | Develuper | Identity + depth, a shop layout, Figma → Roblox |
| V-C | [How to Make an ANIMATED CARTOONY UI in Roblox](https://www.youtube.com/watch?v=-DVchkGfp9E) | Silme | Cartoony shop, rays, tag-driven UI animations |
| V-D | [Make Your Roblox Game Look 10x Better With Lighting](https://www.youtube.com/watch?v=vkEXLmRAQgs) | Develuper | Lighting stack, colour variety |
| V-E | [How To Improve Your UI In Roblox Studio](https://www.youtube.com/watch?v=RPqIm0I_gsw) | Kingkade 3D | Stud header + shadow, tab buttons |
| V-F | [How to Animate Models in Roblox Studio!](https://www.youtube.com/watch?v=sTLrmOQgsDs) | ErExx | Rigging a non-character model |
| V-G | [How to Animate in ROBLOX Studio! (2025)](https://www.youtube.com/watch?v=ImxrPsznbH4) | Scriptix | Animation Editor, priority, play from a script |
| V-H | [How to make STUD GUIS in Roblox Studio](https://www.youtube.com/watch?v=vHsLLhmglBE) | Devy Studio | Stud button + shop frame, open/close scripts |

---

## 1. Stud / cartoony UI: the rules all five UI videos agree on

**Structure**
- **One parent Frame per screen.** Build it first and name it for its job (`ShopFrame`, `UpgradeFrame`). Code then toggles one `Visible`, not twenty children. (V-A, V-E, V-H)
- **The "depth" pair.** A **Header** (bright, studded, gradient), plus a **Shadow**: a copy of the header, offset a few pixels *down*, only its bottom edge showing.
  - The Shadow's colour is the header colour, darker, shifted slightly toward blue.
  - Shadow `ImageTransparency` = 1, so it has no studs.
  - Header `ZIndex` = 2, shadow below it, text at `ZIndex` 3. (V-A, V-E; V-B does the same "depth trick" in Figma)
- **Studs only where they add something.** Too many studs look messy (V-A's own critique of its earlier video).
  - Put studs on headers, buttons and icons.
  - The panel body is a **very dark blue** (not black: black "looks colourless"), `BackgroundTransparency` ≈ 0.15.
  - A studded body is also acceptable if its stud `ImageTransparency` ≈ 0.75 (V-E). [frames: exact dark-blue hex]
- **Tiling the stud texture.** An `ImageLabel`/`ImageButton` with the stud image, `ScaleType = Tile`, `TileSize = {0,100},{0,100}` (offset pixels; V-A, V-E, V-H).
  - Without a tile size it stretches.
  - Size panels to whole studs: a half-stud at an edge looks sloppy (V-E).
  - *Apple today uses `rbxassetid://6927295847` with tile 64 (`stud-ui.ts`). Keep that ID; test 64 vs 100 visually.*
- **Patterned background alternative (V-C).** A tiled pattern at offset 20, `ImageTransparency` ≈ 0.8, a tint colour, a small `UICorner`, and a **white** `UIStroke`. [frames: pattern asset ID]

**Gradients and strokes**
- **UIGradient on the header, running vertically.** Rotation 90 or −90, so the **brighter colour is on top**. Use saturated colours: green→yellow-green for shop/upgrade, orange→yellow for currency tabs, red→orange for buttons. (V-A, V-B, V-E, V-H)
- **Three strokes make the look:**
  1. **Inner stroke** (`BorderStrokePosition = Inner`) on the header, thickness ≈ 5, colour *brighter* than the header. This is the glowing edge. (V-A, V-E; V-B calls it "edge highlighting", "surprisingly big difference")
  2. **Outer black stroke** ≈ 5 on the Shadow.
  3. **Outer black stroke** ≈ 5 on the background panel.
- **Keep stroke thickness consistent** across one screen (4–5 for the chunky style; 1.5 with corner radius ≈ 3 for V-C's cleaner cartoony buttons). Don't make corners too round.

**Text**
- **Font:** Fredoka One (the "iconic Roblox font"; Luckiest Guy for a more cartoony look, V-C). White, `TextScaled = true`, `BackgroundTransparency = 1`.
- **Text stroke:** black, 4–5, with **`LineJoinMode = Bevel`** (or Miter), so the holes in letters like A, O and P fill in. Round leaves gaps. (V-A, V-E)
- **Titles** are centred, or left-aligned in a top bar (V-C).

**Buttons and shop layout**
- **Price/buy buttons are GREEN** ("green is the colour of money"). Show a small currency icon next to every price. (V-B)
- **The main item is bigger, more prominent and first;** smaller items follow. Each item has: a name, a short description, a large image and the price button. (V-B)
- **Tabs (Coins / Wins / Pets):** a TextButton with no text, holding a pasted Header + Shadow, plus a label. Duplicate it for each tab and recolour. (V-E)
- **A top bar** that stands out, a close button (top-right) and a shop icon. The background is either white with details or semi-transparent black. (V-B, V-C)
- **Turn `AutoButtonColor` off** on styled buttons; the default hover tint looks cheap. (V-C)
- **Rays behind a featured item:** a `CanvasGroup` covering the card (`BackgroundTransparency` 1) holds 2–3 large, slightly rotated ray images; `GroupTransparency` ≈ 0.7. A glow image sits behind the item icon at a lower `ZIndex`. (V-C) [frames: ray and glow asset IDs]
- **Optional `UIShadow` on the panel** (V-C says "add a UI shadow"). *Unverified that this instance exists in the current Roblox API; check before use.*
- **Workflow:** build one card well, then duplicate it and change the colour, text and price. Build a whole UI set by copying a finished frame and recolouring its header. (V-A, V-C, V-E)

**Animation (V-C)**
- **One LocalScript in StarterPlayerScripts animates by CollectionService tags:** `UI_Click` (press bounce), `UI_Shine` (shine sweep), `UI_Rotate` (spinning rays).
- This is exactly Apple's "data, not code" pattern: a reviewed runtime script plus tags. [frames/description link: the script's behaviour, durations, easing]

**Figma path (V-B): advanced, optional**
- **Identity** = colours, shapes, typography, texture. **Depth** = the duplicated darker shape below.
- **Shine:** a masked overlay with a blend mode, plus an inside-stroke edge highlight and small star sparkles.
- **Export each image just under 1024 px** (Roblox downscales larger ones), then upload in Asset Manager.
- *For Apple:* uploading images needs the **user's** Roblox account (Apple's shared image table is empty). So rich image-based UI is a later feature. Version 1 should get its depth from native instances (gradient, strokes, shadow layer), which all of the above supports.

## 2. Lighting: a "10× better" preset stack (V-D)

- **`Lighting.LightingStyle` = Realistic:** better shadows. [frames: confirm the property name; 2025+ API]
- **Raise `Brightness` slightly.** Tune `Ambient` (shadow tone) and `OutdoorAmbient` (outdoor fill). Set `ClockTime` and the sun angle (`GeographicLatitude`) to aim the light.
- **Atmosphere:** `Density` 0.3–0.4, `Offset` 0, a *small* light-coloured `Glare`, a little darker `Haze`. This adds depth without fog.
- **Bloom** up, so bright and neon objects pop. **SunRays** a little, especially at late-afternoon or sunset times.
- **Sky:** a stylised skybox from the Creator Store.
- **ColorCorrection, "the most important touch":** a soft tint (very light blue), more `Saturation`, and **more `Contrast`**.
- **Stud style:** the Baseplate `MaterialVariant` set to studs.
- **Retro look:** a `Highlight` on characters, configured so it does not show through walls (`DepthMode = Occluded`).
- **Variety:** randomise textures (3–4 similar ones) and colour tones per part across a map folder, so the world doesn't look copy-pasted.
- *Apple mapping:* this becomes a **lighting block** with 3–4 presets (bright studded day, golden hour, night). Apple's `set_mood` already has 9 moods; compare them against this stack. Apple has no vision in the product, so a preset must be correct by construction.

## 3. Animation (V-F, V-G)

**A character or NPC (V-G)**
- Avatar tab → Rig Builder (R15) → Animation Editor → pick the rig.
- **Keyframes:** set a start pose; space keys about 3 frames apart for natural motion. Angle a limb slightly forward so the interpolation takes the natural path.
- **Priority:** `Action` for anything that must not be overridden. Core < Idle < Movement < Action.
- **Publish → animation ID.** In code: `Humanoid → Animator → LoadAnimation(Animation{AnimationId="rbxassetid://ID"}) → :Play()`. Trigger it from events (touch, prompt, talk).

**A non-character model, e.g. a cannon (V-F)**
- Give every part a **unique name**.
- Set a flat **PrimaryPart** touching the ground; otherwise the animation tilts.
- Use the **RigEdit** plugin, bottom → top: a **Weld** for parts that must stay still, a **joint (Motor6D)** for parts that move.
- Put an **AnimationController** in the top model, then animate it in the Animation Editor (only jointed parts can be selected). Publish under the **group** if the game is group-owned.
- Play it via `AnimationController:LoadAnimation` and add a **cooldown/debounce**.

**⚠ The critical constraint for Apple (Roblox platform rule):** an animation asset plays only in experiences its owner (user or group) has permission for. An animation published by *Apple's* account will not play in a user's game.
- So Apple must either animate **procedurally** (tweens and joint CFrames at runtime: Apple's `motion`, `animate` and `behave` components already do this), or prepare a `KeyframeSequence` the **user** publishes themselves.
- This explains past "T-pose" failures. Rigging (welds vs Motor6D, PrimaryPart, AnimationController) still applies fully to procedural animation.

## 4. What changes in Apple (for the plan and the handoff)

| Knowledge | Apple today | Change |
|---|---|---|
| Header + darker shadow layer | `stud-ui.ts`: header + stud body; a white "Shine" frame; **no shadow layer** | Add a Shadow layer to every studded panel and button |
| Inner bright stroke | Black stroke 3 only | Add an Inner stroke (brighter tint, ≈5); keep black outer strokes ≈5 |
| `LineJoinMode = Bevel` on text strokes | Not set (grep found none) | Set it on every text stroke |
| Studs only on headers/buttons; dark-blue translucent body | Stud body everywhere | A "clean stud" variant as the default |
| `AutoButtonColor = false` | Not set | Set it on every styled button |
| Green price buttons + currency icon; main item first and bigger | Partly (icons follow currency words) | Layout rules in the UI block |
| Tag-driven UI animations (click, shine, rotate) | `gameui` animates counters | A reviewed `ui-fx` runtime block driven by tags |
| Lighting stack (Realistic, Atmosphere 0.3–0.4, Bloom, SunRays, ColorCorrection contrast) | `set_mood`, 9 moods | Re-tune the presets against this stack |
| Procedural vs published animation | `motion`/`animate` are procedural (good) | Write the ownership rule into the animation block; never promise a published-ID animation |

## 5. Handoff tasks this note creates (they go into the Claude Code handoff)

- **V1 (owner action, 2 minutes).** Install the video plugin in Claude Code: `/plugin marketplace add bradautomates/claude-video`, then `/plugin install watch@claude-video`.
  - Needs Python 3.10+, ffmpeg, yt-dlp and a JS runtime (Deno) for YouTube. Claude Code installs these with Homebrew if missing.
  - If YouTube blocks downloads ("sign in to confirm you're not a bot" / HTTP 429, both seen today), use the plugin's caption-only mode or browser cookies.
  - **Verify:** `/plugin list` shows `watch`.
- **V2.** Re-watch the 8 videos with frames. Fill every [frames] item (hex colours, asset IDs, the tag script's timings) into this note. Commit only this distilled note.
- **V3.** Turn sections 1–3 into **blocks**, as already decided:
  - a "clean stud" panel/button/tab block;
  - a `ui-fx` tag runtime;
  - lighting presets;
  - a rigging + procedural animation block.
  - Add a short hint card for each to the knowledge push.
  - **Verify:** the UI block passes `check_ui_layout`, and the blind critic scores a shop built only from the block at ≥8/10 on "UI/UX".
- **V4.** Remove the conflict between D-UIONLY-1 ("library only") and the stud builders, by making the stud panel *the* UI block.
