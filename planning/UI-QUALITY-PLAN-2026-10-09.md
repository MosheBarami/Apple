# Making the agent build Roblox UI at the owner's reference level (2026-10-09)

The owner's target is the attached "Admin Panel": a rainbow title bar with a stud texture, chunky saturated gradient
buttons with thick dark borders, white bold text with a black outline, a dark inset body, an avatar headshot row and a
full-width confirm bar. What the agent produced for "make me a nice, cool admin panel" was a dark, flat, generic panel,
and once a pile of overlapping fields.

## Why it fails today (in order of weight)

1. **The engine cannot express that look.** Even a perfect model could not build the reference with build_ui:
   - a button's `stroke` is its border, so button text cannot also carry a black outline;
   - there is no tiled texture (`ScaleType.Tile`) and no layer behind the content (gloss, stud pattern);
   - there is no 3D base (the darker bottom edge that makes a button look pressable) and no double border;
   - there is no text drop shadow;
   - images accept only `rbxassetid://`, so there are no avatar headshots (`rbxthumb://`) and no built-in textures.
2. **The skill teaches the wrong taste.** ui-design's first example is a restrained dark "tool" panel, and that is
   what Kimi copies. Nothing tells it what Roblox players expect: the cartoon/simulator idiom, outline widths, how
   saturated, how thick.
3. **"100x cooler" has no translation.** The model imagines good things but has no concrete ladder from words to
   techniques (outline, gradient, depth, texture, motion, sound).
4. **It cannot see its result.** measure_ui checks fit and overlap, never looks.
5. **Bugs that destroyed work** (fixed 2026-10-09, below).

## The plan

**A. Engine: a Roblox game-UI vocabulary.** Every field compiles to native objects and is measured at five sizes:
- `textStroke {color, width}` on any text, buttons included (the label moves to a child when the box also has a
  border).
- `textShadow {color, offset}`.
- `depth {color, px}`: the chunky base under a button or panel.
- `border2`: an inner second border.
- `layers`: a tiled `pattern {image, tile, t, tint}` and a `gloss` highlight behind the content. The content then
  sits in a laid-out inner frame, so overlays never break the list layout.
- `rbxthumb://` headshots, plus built-in `rbxasset://` textures.
- `press`: a shrink-on-click and lift-on-hover feel, written by the agent's own LocalScript from a short snippet the
  skill teaches.

**B. Knowledge: rewrite ui-design around game-UI idioms, as techniques, not presets.**
- Each common Roblox style (cartoon/simulator, clean mobile, sci-fi, fantasy, horror) is described by measurable
  rules: outline about fontSize/8, gradient top about 15% lighter, depth 4-6 px at about 35% darker, borders 3 px
  near-black, display fonts.
- The agent still chooses every colour and composition for the request.
- A "make it cooler" ladder: hierarchy, then outline, gradient, depth, texture, motion, sound, applied in that
  order.
- Two or three complete worked screens at reference quality, the owner's admin panel first. Each one is compiled in
  CI, so an example can never rot.

**C. Measure, not hope.**
- A frozen UI set of 12 requests: admin panel, shop, HUD, inventory, settings, daily reward, "make it 100x cooler"
  follow-ups, and a scary or a cute variant.
- Each request runs through ui-probe with the real Kimi, is rendered (ui-render learns the new fields), and is scored
  against the reference by a written rubric.
- Iterate A and B until 10 of 12 are at reference level, then show the owner every render, the good ones and the
  bad ones.

**D. Assets.** The stud texture and icons need real image ids. search_creator_store returns decal ids, which are not
image ids, so resolving a decal to its image id is added. Avatar headshots need no asset.

## Fixed 2026-10-09 (before this plan)

- **Agent forgot earlier turns.** The token saver had dropped earlier tool calls and results. They are now kept,
  shortened.
- **Legacy library rules refused hand-made UI, sounds, effects and models, and blocked restyling with
  set_properties.** These were D-UIONLY-1, D-FXLIB-1 and D-MODELLIB-2. They are lifted for the Studio agent.
- **One script over 240k characters failed list, search and read.** Such scripts are now skipped or paged.
- **"StudPilot hit an error and stopped" hid the real error.** The real message is now shown and logged.
- **A gap without a layout piled children up.** There is now a warning and a clearer error. `gradient.t` takes a
  single number. A refused service names the allowed ones.

Cost: the probes run at about $0.05 each; the whole loop should stay under $5 of model spend.
