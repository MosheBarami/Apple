# Reading notes, 2026-10-01 (owner order: read every doc one by one)

Why: the owner judged the composed Orchard Siege generic and ugly: no stud textures, a kit UI dropped in unedited and not
working (Plants button dead, "$299,999" placeholder), no progression, crude models, no effects/sound. Target look: the
owner's reference images (studded cartoony worlds, layered cliffs, saturated colour, stud textures everywhere) and the
studded GUI taught by "How To Make Stud GUI In Roblox Studio" (YouTube, saved locally).

## Studded GUI method (from the video, measured frame by frame)
- ScreenGui > ImageButton (or Frame/ImageLabel): BackgroundColor3 white (or a colour), Image = rbxassetid://6927295847
  (white stud tile, public Toolbox decal "Stud Texture"), ImageColor3 white, ScaleType = Tile, TileSize = UDim2 offset
  ({0,100},{0,100} shows a 4x4 stud grid; smaller tiles for small buttons).
- Colour: UIGradient on the button (ColorSequence, e.g. magenta/purple, green, yellow-orange) tints background + studs.
- UICorner CornerRadius {0,8}. UIStroke: Color black, Thickness 3, LineJoinMode Round, StrokeSizingMode FixedSize.
- Text: child TextLabel, BackgroundTransparency 1, Font Fredoka One, white, TextScaled, with its own black UIStroke.
- Layout of the finished game: top HUD counters (icon + number + green "+" button) on stud bars; left side menu buttons
  (Auras pink, Trails blue) with gradients; bottom centre big square action button with icon + caption; right side
  promo badges; panels = header bar (green stud) over body (orange stud) with item cards (stud buttons with price), red X.
- The world: every part has the same stud texture (orange/green/blue stud floors, brown stud fences, stud trees).

## Docs read
- CLAUDE.md / AGENTS.md / README.md / working-rules skill: report to owner in Hebrew, what changed for him, % of whole
  product and of task, say plainly what is not deployed/verified. Commit with `git commit -F msg -- <paths>`; never
  add -A/stash/reset/checkout; never upload to the owner's Roblox account; "a failure to observe must not render as an
  observation"; assert the property not the spelling; red-first AND green-after.
- V3 HANDOFF + DECISIONS (Q1-Q38): complete substantial game from a one-line prompt; specialty modern saturated
  colourful STUDDED games at Steal a Brainrot / Grow a Garden / Arm Wrestle Simulator quality; world/props/effects/
  animation studded; UI theme cartoony|studded|none (none = Apple picks, never no UI). Detailed props/UI/effects come
  from prepared assets; simple geometry may be created. Q32: adapt/recombine assets, NEVER low-quality primitives
  passed off as finished assets — report the gap. Content volume from prompt+genre (Q29/Q30). Desktop+phone+tablet.
  Game runs without Apple. Monetization prepared but inactive. Generate Branding after the game. English only.
  No in-product screenshot critic loop (Q21); development team verifies results in Studio. GLM 5.3 Flash only.
  Developer agent (me) may research/download free Roblox-specific community resources; runtime agent may not browse.
- ROBLOX-STYLE-SPEC.md (the visual grammar): saturated high-key palette (grass #5FC94A-#7ED957, dirt path #C98A4B-#E0A45C,
  rust banded cliffs #B5533A/#8E3F2E in 2-3 tones, canopy #3E9E4E-#57B85F, trunk/fence #7A5230-#96683E, sky #7FC8F0,
  plaza sand #E8D3A9, pure-hue accents); colour zoning (hub clearing, cliffs wall it, orange route). THICK near-black
  outlines on all UI (3-5px), heavy uppercase white text with black stroke + shadow, rounded chunky shapes, vertical
  gradient, hard darker bottom edge = depth. Panel = saturated header + neutral body + big red X; item cards with action
  button inside; HUD on screen edges (left circular icon buttons, top-left currency pills, top-centre main action),
  centre empty. World: low-poly chunky trees (cones / 1-3 blobs), faceted rock clusters, grass tufts at path edges,
  BANDED cliffs, oversized props, wide paths, circular hub, ONE dominant landmark visible from spawn, progression
  signposted (giant arrows, glowing pads, floor rings, gates), loud reward feedback (number pop, sound, particles).
  Auto-fail: grey default Frame, hairline border, thin font, realistic material, evenly scattered props.
- COMPOSITION.md: landmark dominance (tallest vertical / second tallest >= 1.25), height hierarchy >= 2, vertical
  elements > 0; more parts/colours do NOT make a better scene; regular spacing and same-facing props read badly.
- VISUAL-LOOP.md: the in-product critic loop is removed by V3 Q21, but its lessons hold; development verification in
  Studio by the developer remains required (that is me, every round, with screenshots to the owner).

## Every remaining doc, read in full (2026-10-01, seven readers over 168 files incl. CHECKLIST-V2 3,536 lines)
Per-file notes were returned per group; what changes how games are built is kept here.

### Owner direction that is current (newest wins)
- SESSION_HANDOFF_2026-09-30 / CURRENT_STATE verdict: build component by component on a NEW map, never copy a world;
  the twist is really built; creatures move (code-driven Motor6D); tests are ideas; users see no technical text; the
  web app shows one live status line and the answer once.
- MISSION (V3): complete substantial game from one line: world, systems, PROGRESSION, economy, saving, ONBOARDING, UI,
  models, animation, VFX, SFX; studded colourful at Steal a Brainrot / Grow a Garden / Arm Wrestle quality; runs
  without Apple. CLAUDE-OWNER-GOAL: "commercially convincing visual/audio/animation quality"; F-059/F-064 open.
- D-MODELLIB-2: never build props/models from parts (trees, fences, rocks, lamps...). Parts only for floors, paths,
  walls, pads, platforms, zones. => the studded map is parts (ground, cliffs, road, plots, gate, plaza, signs) and
  every prop comes from the library; rock clusters were removed from the map.
- D-UIONLY-1/2 (2026-09-24, UI only from the stored UI library) and D-FXLIB-1 (sounds/particles only from the FX
  library) are SUPERSEDED for game UI by the owner's 2026-10-01 order: the agent builds the game's own studded GUI the
  way the reference video teaches and is given the tools for it (build_studded_ui, skill ui-studded-gui). The guards
  still refuse hand-drawn Frames through create_instances/run_luau. Effects/sounds in our components use engine
  particle textures and pinned public library sounds (kit-pins.json), never invented ids.

### Look (GAUNTLET, direct-play research, style spec, WORLD-BUILDER-HISTORY, VISUAL-RUBRIC)
- Classic bright Plastic with studs, 4-6 saturated colours, raised trim on every functional area, 3-6 props per area,
  oversized props vs a 5-stud avatar, one dominant landmark (>= 1.25x the next), elevation (3+ levels), clustered not
  scattered props, real text on signs, guidance painted on the ground (chevrons ~0.3 thick, never floating arrows),
  Atmosphere + >= 2 post effects, never a bare baseplate, never "stacked boxes" cliffs decorated into more boxes.
- First ten seconds: safe spawn, ONE obvious first action, every popup dismissable; avoid props that hide the avatar.
- Never set Lighting.Technology / LightingStyle from scripts; never TextWrapped=false after TextScaled; keep the HUD on
  CoreUISafeInsets (no IgnoreGuiInset); measure overlap at phone size.

### Verify (BLIND_CRITIC, OWNER_PROMPT, playbook)
- Judge with a fresh blind critic on 4-8 final shots (wide map, props, HUD in play, every UI screen open); never argue
  a score up from metrics; play whole causal chains (buy -> place -> defeat -> money -> upgrade) in real Studio.
- What Apple says changed must be read back; deploy is not done until the URL serves it.

### Checklist (CHECKLIST-V2)
- It is a SaaS-shell checklist (1,200 rows): no row covers studded style, maps, sound, effects, animation, economy or
  functional game UI. Open rows that matter for games: interaction verification (nothing fires prompts/clicks),
  playtest hardening, expect_instances checks, asset preview, durable generated assets, spawn grounding.
