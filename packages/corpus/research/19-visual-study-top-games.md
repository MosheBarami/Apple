# Visual study of top 2024-2026 Roblox games (palettes, lighting, materials, UI art, icons and thumbnails)
_Gap pass 2026-10-04: 4 resolved, 6 still open._
_Researched 2026-10-04 by deep-researcher agent (Claude Sonnet 5.5). Sources: 92 (S1-S92)._

How to read the tags in this file.
- `[S#]` = taken from that source (read on 2026-10-04 unless the source line says otherwise). Where a source is a forum thread, the author and date are given in the text. Fetch tools returned machine summaries of some pages; where a number mattered I say which author or page it came from.
- `[O]` = my own observation. I pulled the live thumbnails of about 25 top experiences through Roblox's public thumbnail API on 2026-10-04 (query results in [S79]), looked at them, and measured pixels with a script. Thumbnails are marketing renders and screenshots that were graded and edited, so they show the intended look, not the in-game Lighting settings. Roblox can change them at any time.
- `(inf)` = my inference or design choice, a starting point to check in Studio, not a documented value.
- `(3p)` = third-party blog or analytics, lower trust. `(stale)` = older than 2024.
- No studio of a top game has published its palette, font sizes or Lighting values. Everything below that sounds like "game X uses value Y" is therefore either a documented statement by the developer, a dated community tutorial that claims to match a genre, or my measurement of a thumbnail. Section "Open questions" lists what could not be found.

## Key facts

### 1. What the public record contains (and does not)
- Top games rarely explain their art direction. The best primary material I found is Roblox's DevForum "Creator Spotlight" series (interviews with creators, 2024-2025), Roblox newsroom articles from 2026, the Creator Hub docs (which contain exact sample values for a UI and a map), and forum tutorials by individual developers [S11][S17][S18][S19][S44][S45][S83].
- The spotlight list I could enumerate (DevForum search, 2026-10-04) has 99 Nights in the Forest (2025-10-31), Dandy's World (2025-05-05), Fisch (2024-11-22), The Inn (2025-05-21), Empyror (2025-02-28), unroot on UI (2024-07-19), Ahlvie on environments (2024-05-10), Bayside High (2025-03-28), Paradoxum Games (2024-06-17), and others. There is no spotlight I could find for Grow a Garden, Steal a Brainrot, Rivals or Dead Rails [S83].
- Search-engine summaries of this topic contained at least one invented fact: one summary claimed a 2025 "Best Visual Design" award went to a game called Lumina Grove. The 2025 winners list on PocketGamer.biz (2025-09-09) has no such category or game [S16]. Anything in this file that I could not trace to a page I opened is labelled unverified or left out.

### 2. What Roblox itself says it wants visually (2025-2026)
- Standout Games (Creator Hub page, current): curators want games that make a player think "Wait, that's Roblox?", through hyper-realistic 3D assets, stylised 2.5D sprites, high-fidelity avatars or other novel techniques, and they say they avoid copies and reskins. They also ask that thumbnails follow platform best practice [S9].
- Today's Picks curation criteria (staff post by SilvrenColaver, 2025-10-13): the game must look like what its thumbnails and description promise; build quality and low-end device support count; originality ("a unique twist, not a clone"); retention (D1/D7) and a content cadence of roughly monthly or better are quantitative inputs [S10].
- High-fidelity push (newsroom 2026-04, programme launched 2026-06-08): R15 avatars with advanced joints and a new animation system are positioned for "more realistic worlds"; a Standout Games row on Home prioritises long-term retention [S14]. The 2026 Incubator cohort lists a cinematic dinosaur game (Fossil Force), a 2D pixel-art farm game (Sky Pixel), a neon car-combat game (Cosmic Carnage) and a colourful open-world driving game (Octane) [S13]. The fall 2026 preview adds Caramel (2D pixel-art farming), Scrapbook Saga (flat paper characters in an arts-and-crafts world), Showdown (anime-style shooter with a Shibuya hub) and Monster in the Mansion (realistic survival horror) [S12].
- The 2026 Innovation Awards (2026-09-12) have no "visual design" category; the nearest, "Best Innovation in Creative Direction", went to Animal Hospital, praised for an instantly recognisable creative identity: a creepy hospital with abnormal patients [S15]. The 2025 awards (2025-09-09) gave "Best Creative Direction" to Steal a Brainrot and the "Best Use of Tech" award to Dead Rails [S16]. DOORS won Best Visual Design and Best Audio Design at the 2023 awards (fan wiki; older than 2024) [S86].
- RDC25 (2025-09) promised 4K textures, emissive maps (end of 2025), a cloud asset pipeline and SLIM; the 2025 Year in Review confirms creators were already using emissive maps for glow and PBR on accessories [S75][S76].

### 3. What the current charts look like (live data, 2026-10-04, from Roblox's own public endpoints)
- Top Playing Now, current players: Steal An Egg about 1.90M, Brookhaven about 480K, 99 Nights in the Forest about 294K, Murder Mystery 2 about 246K, Blox Fruits about 240K, Dandy's World about 240K, Adopt Me about 239K, Rivals about 200K, Steal a Brainrot about 156K, Fisch about 107K, Forsaken about 78K, Dress To Impress about 70K, The Strongest Battlegrounds about 70K, DOORS about 67K, Animal Hospital about 66K, Pet Simulator 99 about 41K, Sol's RNG about 33K [S78]. Grow a Garden had about 25K players with 35.95 billion lifetime visits, Steal a Brainrot 73.8 billion visits, and 99 Nights 29.85 billion visits (games endpoint) [S77].
- Steal An Egg was created 2026-07-25 by the group "and Collect Rare Pets" (RoVitals and Rolimons, third-party). Rolimons lists an all-time peak of 14,293,524 about two weeks before 2026-10-04; RoVitals lists a record of 14,272,591 on 2026-09-19, but its tracking only began 2026-08-12, so Rolimons' longer window wins. Both list 2.1M playing on 2026-10-04 (my fetch showed 2.09-2.11M) and Rolimons gives 7 players per server. The 14M peak is now confirmed by two trackers; both are third-party [S90][S78].
- Context from Wikipedia (dated peaks): Grow a Garden peaked at 22.3M CCU on 2025-08-23; Steal a Brainrot passed 25M in October 2025; 99 Nights peaked around 14.2M; Dress to Impress passed 651K in August 2024 [S31][S32][S33][S35].
- The visual range among these is very wide: flat default-Roblox cartoon (Grow a Garden, Steal a Brainrot), painted faceted low-poly (Fisch), cute 3D toons with outlines (Dandy's World, Animal Hospital), clean pastel competitive FPS (Rivals), grim photographic horror (DOORS), semi-realistic frontier (Dead Rails). Visual polish is not the common factor in the hits; clarity of premise and readable thumbnails are (inf, from [S78][O]).

### 4. Case notes by game

**Grow a Garden** (released 2025-03-26 per Wikipedia; the games API says created 2025-03-25) [S31][S77]
- Wikipedia describes the look as studded textures evocative of old-school Roblox, a deliberate retro-Roblox aesthetic rather than modern graphics [S31].
- Co-owner Janzen "Jandel" Madsen told GamesBeat the theme is "as generic as you can get" and that the persistent offline-growth idea was the novel hook; Splitting Point ships weekly updates. There is no art-direction statement [S30].
- UI recipe from the community: DevForum threads (2025-06-20 and 2025-10-22) say the stud look is a single stud image in an ImageLabel with ScaleType Tile and an adjusted tile size, tinted with ImageColor3 or BackgroundColor3 and, per one answer, UIGradients for colour; one reply cites texture asset 15910695917, which exists as an Image asset named stud_texture_from_roblox_by_20thcenturyfoxr, created 2024-01-07 (checked through Roblox's economy API; that the game itself uses it is not shown and reuse rights were not checked) [S37][S38][S88]. A DevForum thread on the game's dialog bubble (2025-06-14) says a BillboardGui with an ImageLabel drop shadow behind the text produced it [S39].
- [O] Live thumbnails (2026-10-04) are in-engine renders: default-style Roblox avatar in a straw hat and overalls, a studded baseplate, chunky bevelled "brick" fruit built from cubes with an inset square on each face, a pure cyan sky (sampled 54,255,255 in the tree thumbnail; 135,245,255 in the icon), grass (41,130,3) to (101,240,58), soil brown (147,73,32), fruit green (120,213,2), petals yellow (255,230,10). Mean saturation 0.73-0.74, mean brightness 0.81-0.89, 76-85% of pixels above 0.6 saturation.
- [O] Thumbnail grammar: a one-to-three word headline at the top in white heavy rounded sans with a thick black outline ("GROWS OFFLINE", "TRADING UPDATE"), a gigantic crop or number as the hero, a tiny avatar at the bottom for scale. Headline cap height is about 9-10% of the 512 px icon height and the black outline is 3-5 px (measured from pixel runs).

**Steal a Brainrot** (released 2025-05-16; Best Creative Direction 2025) [S16][S32]
- Wikipedia: voxel-based characters drawn from Italian brainrot memes; collectible characters on a conveyor, a base to defend, steal loop [S32]. NME (2025-08-29) adds no visual detail [S80].
- Fonts: Fonts In Use lists Comic Sans (purchase UI), Source Sans (character names), Montserrat (brainrot names) and Builder Sans, from a user submission dated 2025-12-07, and a 2026-09-26 comment says the purchase font is Builder Sans, not Comic Sans [S36]. Treat font identity as disputed, user-submitted and not from the developer. Roblox maps `Enum.Font.Gotham` and its weights to the Montserrat family (reference page, read 2026-10-04), so a UI that still sets a Gotham font renders as Montserrat; that the Montserrat entry is such a mapping is my inference, not a statement from anyone [S91]. A blog page that calls the font "custom" (Playgama, 2025-08-27) gives no evidence, so I discarded it.
- [O] Thumbnails: cartoon base buildings in saturated red with cream trim on flat bright-green grass under a cyan sky; income shown as full-comma numbers or suffix notation with white fill and black outline ("$997,672/s", "$991,511m/s", "$89,121Sp/s"); rarity names in rainbow-gradient text ("SECRET", "TREX EGG"); red "!!" and a red curved arrow as pointer icons; a ground-contact shadow ellipse under creatures; a tiny avatar holding the hero object overhead. The sibling hit Steal An Egg uses identical grammar (sand yellow (255,200,85), sky gradient to cyan-blue, huge egg, rainbow headline) [O].

**99 Nights in the Forest** (March-June 2025 build, three-month sprint; peak about 14M CCU) [S17][S35]
- Spotlight (2025-10-31): art direction by Cracky4, a lean team (programmer, a builder/modeller, plus one more artist and an animator); the deer mascot was meant to be scary without alienating younger players; asset workflow keeps part, vertex and instance counts low for mobile; the Cultist Stronghold was built in about two days from a block-out followed by a detail pass; references include medieval keeps [S17].
- The game won Best Horror and Best Adventure at the 2025 awards [S16]. Fan wiki: campfire is the base light and the light-averse Wendigo is repelled by fire, so light is both look and mechanic [S87].
- [O] Icon: 43.7% of pixels near black, mean brightness 0.21, the white-grey ram-horned deer with cartoon googly eyes and a green-faced pumpkin scarecrow as the only saturated accents. Night thumbnails: sky (0,21,44), grass (1,46,32), mean saturation 0.82 but brightness 0.27 (cold saturated dark), a deer with huge white eyes and long dark arms behind two cartoon avatars with pained faces. Day thumbnails: flat saturated green (26,115,1) with sharpened wooden palisade logs, barbed wire and traps and a near-black vignette (5,16,1) at the corners. The monster is cute-faced and spindly, the avatars are comic: contrast of cute and scary is the identity.

**DOORS** (alpha 2022-08-10; 2023 awards for visual and audio design) [S34][S86]
- Wikipedia calls the look Victorian-era-esque and says the graphics do not feel Roblox-like; the fan wiki says players manage light sources (flashlight, lighter, lantern) in dark corridors [S34][S86].
- [O] Thumbnails: 82% of pixels have brightness below 0.2; one is a black field with a warm wooden door and a spill of amber interior light and a pale glowing wooden logotype; the other is a dark teal-green corridor with a green exit sign, a red fire-alarm box and a monster hand at a door edge. Accent colour swatch #5D9267 (about 9% of pixels), blacks (9,12,8).

**Dead Rails** (Best Use of Tech 2025; over 600K CCU in early 2025) [S16][S29]
- GameAnalytics describes an 1899 Wild West zombie setting and a promotional push in late February 2025 (an official TikTok clip with 499K likes) [S29]. A DevForum feedback thread (2025-04-03) shows ARG-horror art assets but no useful critique [S81].
- [O] Thumbnails are raw in-game screenshots: overcast grey-green sky (170,189,170), pale yellow sand (206,219,135), black steam locomotive (44,47,42), health bars above NPCs, no text overlay; mean saturation only 0.22-0.25. A top game with a desaturated, unpolished look and no thumbnail text means the premise (train, zombies, western) carried discovery.

**Fisch** (launched October 2024, solo for about four months, peak about 470K CCU) [S18]
- WoozyNate (spotlight 2024-11-22): inspired by Stardew Valley and Animal Crossing for a "simple and calm" feel; each of seven islands plus two hidden ones has its own atmosphere; fish colour and tint are varied procedurally with a weight-based seed so each base fish has about 25 variations; the Color Adjust plugin recoloured parts [S18]. Forum feedback in May 2024 praised the lighting, fish models and a UI that the developer says is deliberately simple (2024-05-31) [S82].
- [O] Thumbnails: faceted low-poly fish and dragons with flat planes and glowing crystals, saturated primaries on bright sky (195,230,237) for the birthday event, a pink valentine variant, a cavern with emissive mushrooms in magenta and blue, a warm shop interior with red walls and leopard-print carpet. The key art is re-themed per event.

**Rivals** (launched 2024-06-28; Best Shooter 2025) [S16][S67]
- The weapon "viewmodel" that looks blended with the UI is, according to forum replies on 2026-03-25, an in-world model in Workspace rather than a ViewportFrame, so it receives the scene's lighting [S67].
- [O] Thumbnails: pale blue-lilac grid-panel maps (walls (197,202,218), (143,135,211), floor (237,222,245), sky (49,143,255)), fog toward (94,100,137), a single flat pure red (255,0,26) silhouette for the enemy or player, thin white outlines on foreground weapons, and a small studio watermark. One saturated accent in a desaturated field.

**Dandy's World, Animal Hospital, Forsaken, Sol's RNG, Blox Fruits, Pet Simulator 99, Adopt Me, Dress To Impress, Brookhaven, The Strongest Battlegrounds**
- Dandy's World: creator Qwelver oversees all artwork for consistency; character sketch began 2022; floors use hand-placed point lighting; June 2024 alpha; first Easter event peak 875K CCU [S19].
- Animal Hospital: Innovation Awards 2026 creative-direction winner [S15]. [O] big dark-ellipse eyes with white highlights, soft painted skin, rounded shapes, grey-blue clinic walls (navy stripe on pale) so the colourful patients pop.
- Dandy's World [O]: purple background with hanging gold stars, characters with thin white sticker outlines, glowing pumpkins, logo in rainbow gradient with dark outline.
- Forsaken [O]: ink-brush comic style, red/black/cream, torn frame, scratchy white lettering, mean saturation 0.44, 41% dark pixels.
- Sol's RNG [O]: each thumbnail is monochrome (teal swatches #2FC6C5, #168A8C, #042021 in one; orange-red fire in another), a HUD-like corner frame, rarity written as "1 in N" with an aura name.
- Blox Fruits [O]: painted anime key art rather than engine screenshots (deep navy #0A1747, magenta-purple sky, cyan lightning), logo bottom right with an orange-to-blue gradient and black outline.
- Pet Simulator 99 [O]: cube-bodied glossy pets with big eyes in a rainbow lineup on a blue gradient floor; seasonal variants with a purple radial burst and a white "sticker" outline around the pet. A forum UI-copy thread confirms the community imitates the game's trade UI but gives no style numbers [S40].
- Adopt Me [O]: rim-lit 3D pets, dark violet/teal backgrounds for the Halloween event, bold white title bottom-left.
- Dress To Impress [O]: pastel pink and sky blue (mean saturation 0.26, brightness 0.94) with non-blocky high-fidelity avatars; Wikipedia says the game uses "model-like" avatars, not default Roblox bodies [S33].
- Brookhaven [O]: clean bright 3D render, an open-window frame device, red banner title bottom-left, mean saturation 0.21 (calm).
- The Strongest Battlegrounds [O]: raw grey-blue screenshot (mean saturation 0.12), flat low-poly rock debris, no text.

### 5. Palettes measured from thumbnails (own measurement, 2026-10-04) [O]
| Group | Sky / bg | Ground / mass colour | Accent | Mean sat / mean value |
|---|---|---|---|---|
| Grow a Garden (icon, tree thumb) | (135,245,255) / (54,255,255) | grass (41,130,3) to (101,240,58); soil (147,73,32) | yellow (255,230,10); fruit green (120,213,2) | 0.73-0.74 / 0.81-0.89 |
| Steal a Brainrot / Steal An Egg | cyan (0,255,255) top; blue gradient | sand (255,200,85); grass green | purple lane (202,81,242); red building | 0.53-0.70 / 0.62-0.85 |
| 99 Nights (night) | (0,21,44) | grass (1,46,32) | warm amber fire | 0.82 / 0.27 |
| DOORS | near black (9,12,8) | wood amber | exit-sign green #5D9267 | 0.32 / 0.15 |
| Dead Rails | (170,189,170) | sand (206,219,135); loco (44,47,42) | none | 0.22-0.25 / 0.59-0.61 |
| Rivals | sky (49,143,255); walls (197,202,218) | floor (237,222,245) | red (255,0,26) | 0.46 / 0.81 |
| Dress To Impress | #B1D9F9 | #D3849B pink | #F9F0F5 white | 0.26 / 0.94 |
| The Strongest Battlegrounds | (125,156,189) | (150,146,152) | none | 0.12 / 0.61 |
Pattern (inf): simulators and collectors sit at saturation about 0.55-0.75 and brightness 0.8-0.9; horror sits at brightness 0.15-0.3 with one warm accent; competitive shooters pair a desaturated cool environment with one pure-primary accent for units; "premise-first" hits can ship at saturation 0.12-0.25.

### 6. Lighting setups reported by developers (community values, dated)
- Brainrot-game preset (DevForum tutorial by Vec, 2026-02-03; not confirmed to be any game's real setup): Brightness 1.8, EnvironmentDiffuseScale 0.283, EnvironmentSpecularScale 0.39, OutdoorAmbient (209,192,191), ExposureCompensation 0.05, plus a ColorCorrectionEffect with Contrast 0.13, Saturation 1.1, TintColor (230,230,230); everything else default; a rotating sky is driven by a script on RenderStepped (speed -0.4) [S53]. Note Saturation 1.1 is above the Studio slider (max 1) but scripts can exceed slider limits (file 05, from the ColorCorrection reference).
- Cartoon helper (DevForum answer, 2025-04-12): vibrancy from ColorCorrection saturation (example 2x), very simple textures, plastic material, simplified low-poly models, simple lighting, with Pet Simulator named as the reference look [S54].
- Retro "classic Roblox" looks (2025-2026 threads): LightingStyle Soft, PrioritizeLightingQuality false, ColorGradingEffect TonemapperPreset Retro (2025-05-22, 2026-02-05, 2025-11-30) [S59][S60][S61]; accepted answer of 2026-02-05: Ambient (128,128,128), OutdoorAmbient (128,128,128), Brightness 1.981, both ColorShifts (0,0,0), both Environment scales 0, GlobalShadows on, ClockTime 14, Retro tonemapper, Bloom Intensity 0 with Size 24 Threshold 0.95 [S60]; another poster used ClockTime 8.25 and Ambient 127 [S61]; a 2025-05-24 answer used ShadowSoftness 0.2 with Environment scales 0 [S59]. These match the Soft-style description in the Lighting docs summarised in file 05.
- Horror: a developer poll (Banjo's Diner, 2025-01-28, 53 votes) preferred the version without blue fog (33 vs 20); advice: add a dim shadowless point light near the player rather than lifting global light; blue reads calm, so try green or warm yellow for dread [S63]. A 2024 staff-tracked bug reports Atmosphere Haze rendering much darker on some Windows clients (reported 2024-02-01, topic auto-closed, root cause not stated), so keep playable contrast margins in dark scenes [S64].
- Realistic route: Future/Realistic lighting, EnvironmentSpecularScale 1, a custom sky and PBR materials (tutorial by BEAMEDBYTRGX, 2024-09-02) [S55].
- Stylised looks that fail on some hardware: the 2021 fog-based cel-shade trick (FogStart/FogEnd about 100,000 and FogColor about (250000,250000,250000)) is incompatible with Atmosphere and failed on Mac/Vulkan/OpenGL and some phones (stale, 2021) [S57]. The 2021 flat-colour recipe (Brightness 0, Ambient and OutdoorAmbient white, GlobalShadows off, SmoothPlastic) has an unresolved ambient-occlusion side effect at high graphics settings (stale) [S56]. Per-light "ForceSoft" is only a feature request as of 2026-04-28 [S62].
- Roblox's own sample map uses team colours mint (88,218,171) and carnation pink (255,170,255), interior colour (211,190,150) with MetalPanels against exterior mint, glass at transparency 0.6 on Neon, and greybox colours deep orange (255,176,0), persimmon (255,89,89), lapis (16,42,220), bright green (75,151,75) [S70][S71].

### 7. Materials and modelling conventions that read as "professional"
- Majority smooth plastic with minority contrasting materials as "environmental dividers": bricks for foundations, wood for focal points like counters; top surfaces lighter and undersides darker; colour harmony (monochromatic, analogous, complementary) matters more than textures (DevForum answer by PyroGamingMC, 2025-06-26) [S65].
- Stylised characters: a "toy-like" character over a realistic environment (Paradoxum Games, spotlight 2024-06-17; 30-person studio, 19 in art) [S24]; per-mesh colour customisation using Roblox Colors and Materials rather than textures, plus SurfaceAppearance and emission (Twin Atlas, newsroom 2026-07-01) [S11]; 4K textures, emissive maps and terrain material variants for showcase fidelity (Fluorlite, same source) [S11].
- Colour in hand-made assets: greyscale first, then curvature and lighting bake, blue/purple in shadows and yellow/white in highlights (Empyror, 2025-02-28) [S20]. Cute fantasy environments: curved multi-direction paths, bold colours, natural lighting, many flowers (Ahlvie, 2024-05-10) [S22]. Cartoon-bright yet realistic architecture: recognisable shapes made more colourful (xJa_ys, 2025-03-28) with interior lighting added late in the build and a Sun Position plugin [S23].
- Roblox's own environmental-art curriculum: mood boards as "source of truth", tileable textures at most 1024x1024, trim sheets, modular kits on a 5-stud grid and pieces at least 5 studs, shared pivots, reuse of identical asset IDs, CastShadow off on peripheral foliage, avoid layered transparency [S69][S72][S73][S71].
- 99 Nights keeps part, vertex and instance counts low and uses block-out then detail for speed [S17]. A big terrain was cut from 99M to 25M cells for mobile (Twin Atlas) [S11].

### 8. UI art conventions (documented values first, then observation)
- Roblox's docs on art style: pick a colour theme that follows genre conventions, limit colour to key information, do not rely on colour alone, keep main overlays neutral (black/white) so they read over a 3D background, use genre-standard icons, keep a distinct icon style, three tiers of button emphasis (primary largest, secondary, tertiary subtle), and reserve stylised fonts for titles and alerts; give text a contrasting background or stroke [S44]. Bright colours attract more than dull ones, larger and padded elements read as more important, buttons need a container and highlights or shadows to suggest depth, and consistency is rewarded [S46].
- Roblox's sample HUD (exact values): all text Montserrat Medium (TextScaled in the sample); header trapezoid image with ImageTransparency 0.15; black body panels at transparency 0.3; selection container black at 0.3 with CornerRadius 0.075 (scale); unselected item buttons at BackgroundTransparency 0.65 and the selected one at 0.1; small nav buttons CornerRadius 0.1; select button CornerRadius 0.2; team counters tinted mint (88,218,171) and carnation (255,170,255); a tiled overlay with TileSize (0,104),(0,180), BackgroundTransparency 0.8 and a blue-white-blue UIGradient rotated 225 degrees for a force-field screen effect [S45].
- Simulator "chunky" button recipe from a tutorial (FirstLostData, 2024-03-29): design on a 2300x1400 canvas, corner radius about 50 px, stroke 6-15 px placed outside, an inner shadow for depth, a colour overlay, strokes that contrast with the fill, "something between strong and soft" colours, export frames as images, and use Scale sizing [S41]. Another 2026 tutorial summary (video, 2026-09-04) lists the same pipeline in different words: depth from a duplicated darker shape, gradient, stroke, shine by blend mode, edge highlight, then rebuild in Studio with image labels and a green price button; it gives no numbers [S84].
- Native modifiers: UICorner scale 0.5 makes a pill; UIStroke on text is an outline and on a frame a border, and two strokes can coexist; UIGradient supports Linear, Radial and Conical types, and a UIGradient parented to a white UIStroke colours only the outline (answered 2023-02-23) [S43][S48]. UIStroke got `BorderStrokePosition` (Outer default, Center, Inner), a border offset, a scaled thickness mode and multiple border strokes on one object in the 2025-12-04 full release; a reply recommends staying under about 300 UIStrokes on screen (community, not Roblox) [S42]. UIShadow shipped 2026-06-26 per file 06; before that, shadows were blurred PNGs (layer blur 100, exported at 4x, about 135% of the object size, ZIndex -1) [S51].
- Shine sweeps: one DevForum module animates a gradient Offset from (0,-2) to (0,2) with Quint InOut for 1 s and a random repeat delay (2024-11-23) [S49]; another module defaults to width 0.15, angle 10 degrees, brightness scale 1.5, linear easing, looping (2025-03-18) [S50].
- The process of a working UI designer (unroot, 2024-07-19): define scope, name the game's "vibe" first because it drives corner radius, palette, fonts, shapes and density, wireframe, style, test on unfamiliar users, design mobile-first, reference Game UI Database and Interface In Game, generate palettes with Adobe Color or Coolors [S21]. Fisch's developer says he dislikes clunky UI and keeps it simple [S82]. Figma-to-Studio converters map UIGradient, UICorner, UIStroke and flatten shadows (2026-02-26) [S52]. A 2026 matte simulator UI pack exists on the forum but the description has no numbers [S85].
- [O] Observed in thumbnails (rendered UI-like overlays, not in-game UI): white fill, thick black outline, heavy rounded sans for money and update names; rainbow gradient for top-tier names; green for money; red for alerts and arrows. In the older UI-fundamentals thread, never use pure white text on pure black, use off-white and off-black (2021, stale) [S47].
- Fonts: Builder Sans/Extended/Mono arrived 2024-03-07 and Gotham/Arial were removed 2024-05-28 (file 06). Montserrat is what Roblox's sample uses [S45]. Disputed font ids for Steal a Brainrot above [S36]. Staff announcement of 2024-03-07: Gotham becomes Montserrat and Arial becomes Arimo, unchanged instances switch automatically on 2024-05-28, and Builder fonts may be used in experiences and thumbnails (off-platform use is limited to digital promotions) [S91]. `Enum.Font` still lists FredokaOne, LuckiestGuy, Bangers and Cartoon as available (a legacy enum; new work should use `FontFace`) [S91]. Which fonts the top games use is not documented by their developers. For Dress to Impress, community suggestions on a font-identification forum name BlinkHead Stripes (slightly modified) or Stacker for the logo (2024-11 to 2025-07, low confidence) [S92]. For Grow a Garden, Pet Simulator 99, Fisch, Rivals and 99 Nights no source I could open names a font; the UI-copy threads [S38][S40] and the 99 Nights and Dandy's World spotlights [S17][S19] were re-read and say nothing about fonts.

### 9. Icons and thumbnails (documented)
- Icon: square, at least 512x512, preview at 150x150, use bright saturated colours for fantasy or dreamy games, muted for somber, strong balance and contrast for horror, avoid ambiguity, and do not use a generic default [S2]. Thumbnail: 16:9, ideally 1920x1080, formats jpg/gif/png/tga/bmp, under 3 MB, up to 10 per page, avoid putting essential text or elements at the bottom because metadata can cover them (raw docs text re-read 2026-10-04), keep overlay text sparse and limited to describing gameplay with no ads, promotions or subjective claims, at most 3 video uploads a month, no video thumbnails on Xbox, PlayStation or VR [S89], express theme through colour and style, must not misrepresent the game; video thumbnails can use free-cam (Left Shift + P) and logos but not added text claims or voice-over [S1].
- Thumbnail personalisation: needs 2-5 active thumbnails; docs report +8.5% average qualified play-through rate (qPTR) lift [S1]; staff post 2025-02-13: 8,000+ experiences, average +12% relative lift, some +56%; wait at least 7 days or until the next content update; make thumbnails meaningfully different (different gameplay, characters, environments, motivations); refresh with new content; do not mislead [S3]. Staff update 2025-07-01: the current winner keeps most impressions during new tests; keep your best thumbnail in every test (+0.19% qPTR, 21% fewer impressions to non-winners) [S4]. Icon A/B testing is still only a feature request in July 2026 (posts dated 2026-07-07 and 2026-07-15) [S5]. A May 2026 third-party guide says thumbnail testing launched 2024-11-13 and lists icon mistakes such as an unreadable genre, details lost at 128 px, an icon that disagrees with the title, overpromising the first minute and copying a hit too closely (3p) [S6].
- Third-party composition advice from one analytics blog was removed in the gap pass: its figures (for example a red-over-blue click lift) come with no method and its example game IDs are wrong, so none of it is used [S7]. A DevForum critique thread (2025) says text over a blurred background hides what the game is, and that a bright blue sky helped click-through in one advertiser's experience (anecdote) [S8].
- Trailer advice from a 30-person studio (spotlight 2024-06-17): trailers under 30 seconds, promote about a week before an update, close-up angles and dramatic lighting [S24]. One simulator studio noted that Roblox audiences preferred linear gameplay with information in small batches [S26]. Restaurant Tycoon 3's developer used thumbnail personalisation for A/B testing (2025-07-25) [S27].

## How to apply it (rules for an AI builder)

Choose a look first (do this before placing a part)
- DO pick one of five documented-or-observed families and write it down: (1) bright stud/cartoon simulator, (2) painted low-poly cozy (Fisch), (3) clean competitive pastel with one accent colour (Rivals), (4) warm-light-in-cold-dark horror (99 Nights, DOORS), (5) toon-with-outline characters (Dandy's World, Animal Hospital). Mixing two families in one scene is the main thing that makes a game read as "assembled" (inf from [S44][S21][S69]).
- DO name the game's vibe in one line and derive corner radius, palette, font and density from it, as unroot does [S21].
- DO limit a scene to 3-5 hues plus neutrals and give each biome its own palette (inf; supported by [S65][S70]).
- DON'T chase photorealism unless the game's premise needs it; Roblox itself asks for novelty rather than a copy [S9][S10].

Simulator / collector games (Grow a Garden, Steal a Brainrot, Pet Simulator class)
- DO use flat, brightly lit Soft-style lighting: start from Brightness 1.8-2.5, Environment scales 0-0.4, a light ColorCorrection (Contrast 0.1-0.13, Saturation 0.15-1.1 depending on how saturated your parts already are), a neutral tint (230-255 per channel) [S53][S54][S60].
- DO build with SmoothPlastic or Plastic, bevelled chunky shapes, saturated mid-value fills, and use stud texture sparingly on baseplates or UI (S31, S37).
- DO colour sky and ground as a pair: cyan-leaning sky (R low, G and B high), saturated grass green, warm soil or sand brown (O).
- DO show wealth with big numbers: white fill, black outline, full commas in marketing art, suffixes in game (O).
- DON'T put heavy PBR or Future shadows on a cartoon phone game; cost scales with players on low-end devices (inf; see file 05).

Horror / survival (99 Nights, DOORS, Dead Rails class)
- DO create one warm point source against cold dark: fire or lamp in amber (observed (253,142,18) for flame core), environment in navy/teal (0,21,44) to (1,46,32) [O].
- DO keep a small readable light budget: a shadowless dim player light for visibility, shadows only on hero lights [S63].
- DO keep one saturated accent (exit sign green, fire-alarm red) per scene [O].
- DON'T rely on total darkness; players and curators penalise unreadable builds, and Atmosphere Haze can render darker on some clients [S10][S64].
- DO keep part/vertex/instance counts low even for horror; block out first, detail after [S17].

Competitive / shooter (Rivals class)
- DO use a desaturated cool environment (walls near (197,202,218), (124,130,203); floor near (237,222,245)) and flat primary colour only for units or highlights (red (255,0,26)) [O].
- DO render first-person weapons as in-world models so they inherit scene light [S67].
- DO follow Roblox's own map-readability numbers: 10-stud minimum doorways and walls, three lanes, at most three exits per pocket [S71].

UI
- DO write the style once as tokens (primary, secondary, danger, success, radius, stroke, padding, font) and reuse it [S44][S46].
- DO use three button tiers, containers on every button, a depth cue (highlight or shadow), square red X close buttons (file 06) and consistent stat colours [S44][S46].
- DO outline display text with UIStroke Thickness about 7% of cap height at design size (O: measured 3-5 px on a 48 px cap height) and use thicker strokes (6-15 px on a 2300x1400 canvas) on big panels [S41].
- DO keep stylised fonts for titles and numbers; use a plain readable family for body [S44].
- DO keep neutral black or white overlay panels at transparency 0.3 for HUDs and use selected/unselected at 0.1/0.65 [S45].
- DON'T use more than 300 UIStrokes on screen at once (community guidance) and DON'T tween the Thickness of a text stroke (docs warning) [S42][S43].

Thumbnails and icons
- DO make the icon readable at 150x150: one hero object filling 70-90% of the frame, headline cap height about 9-10% of the icon height, outline 3-5 px at 512 (O).
- DO use scale exaggeration (giant fruit or egg beside a tiny avatar), a pointer (arrow, "!!"), and an update or event name at the top (O).
- DO set at least 3 active, visibly different thumbnails and keep the best one in every test; wait 7 days between swaps [S3][S4].
- DO re-theme key art per event (Fisch birthday, valentine; Adopt Me Halloween; Pet Simulator purple event art) [O].
- DON'T show anything the first minute does not contain [S1][S6][S10].
- DO keep overlay text on a thumbnail to a few words that describe gameplay; the docs forbid ads, promotions and subjective claims there [S89]. The update-name headlines seen on marketing icons are an observed habit [O], not a documented allowance.

"Professional" versus "free model" (inf, assembled from [S44][S65][S69][S73][S9])
- Same material rules across the map (smooth plastic majority, a few divider materials).
- One palette per area; no clashing saturated stock models.
- Consistent scale: pieces on a 5-stud grid, doors 10 studs wide.
- Lighting and Sky set on purpose (Atmosphere plus Sky plus one or two effects).
- UI built from one token set; no default grey Roblox buttons.
- Duplicate, not re-upload, meshes; CastShadow off on small foliage.
- Thumbnail matches the game. A free-model scene fails most of these at once.

## Recipes (each becomes a skill)

### Recipe 1: Stud-style simulator panel
When to use: simulator, tycoon, collector shops, inventories in the Grow a Garden vein.
Steps:
1. ScreenGui `Panel` (ScreenInsets CoreUISafeInsets). Frame `Card`: BackgroundColor3 mid-saturated (for example (88,170,255)), UICorner CornerRadius (0,14), UIStroke Thickness 4 Color (20,20,30) ApplyStrokeMode Border.
2. Child ImageLabel `Studs` (BackgroundTransparency 1, Size full, ZIndex above the card fill): Image = a stud texture (the forum cites rbxassetid://15910695917, a real Image asset [S88], but its reuse rights were not checked, so prefer your own uploaded stud tile), ScaleType Tile, TileSize (0,48),(0,48), ImageColor3 a lighter tint of the card colour, ImageTransparency 0.5-0.75. Add UICorner to match [S37][S38].
3. For colour variation, add a UIGradient (Rotation 90) from a lighter top to a darker bottom on the card or the stud layer [S37].
4. Add a title strip (Recipe 3 text) and a padded content area (UIPadding 12).
Pitfalls: tiling without gradient looked flat to the asker [S37]; keep the stud tile transparent so colour changes stay cheap; too many nested tiled ImageLabels cost UI draw calls (file 05 sets a budget of about 150 UI draw calls).

### Recipe 2: Chunky depth button
When to use: Buy, Claim, Rebirth, Hatch buttons.
Steps:
1. Holder Frame (transparent) height H. Child `Lip` Frame: lower, darker colour, Position (0,0,0,4), Size (1,0,1,-4), UICorner, UIStroke 3 px dark outside. Sibling `Face` TextButton: Size (1,0,1,-4), UIGradient top light to bottom saturated, UICorner radius about 12, UIStroke Border 3 px dark. ZIndex Face above Lip.
2. Text: UIStroke ApplyStrokeMode Contextual thickness 2.5-3 black; FontFace bold rounded.
3. Press: Face moves down 3 px and Lip shrinks 3 px in 0.06-0.1 s; release returns; fire Activated.
4. Optional shine (Recipe 11).
5. Sizes: at least 44 px high (the touch-target minimum in file 06), primary actions 56 px.
Pitfalls: two UIStrokes (text and border) must have different ApplyStrokeMode on the same TextButton [S43]; AutoButtonColor off; keep stroke Thickness fixed on text [S43].

### Recipe 3: Outlined display text and rarity names
When to use: currency counters, headlines, rarity labels, damage numbers.
Steps:
1. TextLabel with heavy rounded font, white fill (or gradient), UIStroke Contextual black Thickness about 7% of the font cap height (3-5 px at TextSize 48-60) (O).
2. Rarity ladder (inf, a design choice; no game published its palette): Common grey (170,170,170), Uncommon green (80,220,90), Rare blue (60,140,255), Epic purple (170,80,255), Legendary gold (255,200,40), Mythic red-orange (255,80,60), top tier rainbow via animated UIGradient on the text.
3. Pair colour with name and an icon so colour-blind players are covered [S44].
4. Money in green (observed convention) and alerts in red [O].
Pitfalls: gradient on text fill must not also be applied to the stroke unless you want a gradient outline (put a UIGradient under the UIStroke for that) [S48]; avoid tweening stroke thickness [S43].

### Recipe 4: Sunny simulator lighting
When to use: any cartoon simulator, tycoon, pet game.
Steps:
1. LightingStyle Soft, PrioritizeLightingQuality false (set in the Properties panel or a plugin, not from game scripts; file 05).
2. Lighting: Brightness 1.8, OutdoorAmbient (209,192,191), EnvironmentDiffuseScale 0.28, EnvironmentSpecularScale 0.39, ExposureCompensation 0.05, ClockTime 14 (values from [S53]; ClockTime from [S60]).
3. ColorCorrection: Contrast 0.13, Saturation start 0.15 and raise toward 1.1 only if parts are pastel, TintColor (230,230,230) [S53][S54].
4. Sky: bright, cyan-leaning; optional slow rotation script (speed about -0.4 per [S53]).
5. Parts: SmoothPlastic, cube-bevelled shapes, grass (101,240,58) or darker (41,130,3), sky-matched water.
Pitfalls: values come from a community tutorial, not a game's settings; Saturation above 1 is a script-only value; verify on a phone.

### Recipe 5: Retro classic-Roblox look
When to use: nostalgia, obby and "old Roblox" skins, studded baseplates.
Steps:
1. LightingStyle Soft, PrioritizeLightingQuality false [S59][S60].
2. Add ColorGradingEffect TonemapperPreset Retro [S60].
3. Lighting: Ambient (128,128,128), OutdoorAmbient (128,128,128), Brightness 1.981, ColorShift_Top and ColorShift_Bottom (0,0,0), EnvironmentDiffuseScale 0, EnvironmentSpecularScale 0, GlobalShadows on, ClockTime 14 [S60]. Optional ShadowSoftness 0.2 [S59].
4. Bloom with Intensity 0, Size 24, Threshold 0.95 (inactive but present) [S60].
5. Materials: Plastic, SmoothPlastic, Studs; keep brightness at most 1 on lights for a full retro look (docs, file 05).
Pitfalls: no exact 1:1 replica of the old compatibility mode exists [S59].

### Recipe 6: Warm-vs-cold night survival
When to use: 99 Nights, DOORS, camp and cabin horror.
Steps:
1. Realistic style, PrioritizeLightingQuality true (plugin/Properties).
2. ClockTime 0-1; Brightness 0.2-0.3; Ambient (8,10,16); OutdoorAmbient (6,10,22); sky colour (0,21,44) and forest ground (1,46,32) as art targets [O]; use file 05 Recipe 3 for the effect values and my numbers there are (inf).
3. Campfire: PointLight Range 30-48, Brightness 2, Color (253,142,18) or (255,179,73) [O][file 05 S81]; Fire/particles; Shadows on for the hero fire only.
4. Player light: dim PointLight, Shadows off, short range [S63].
5. Cold fill: a faint blue-teal Atmosphere (Color (20,40,50)) and a slow ClockTime-driven change.
6. One saturated accent per area (exit sign, green pumpkin) [O].
Pitfalls: Haze darker on some clients [S64]; test on mobile; avoid blue "calm" on pure fear scenes [S63].

### Recipe 7: Clean competitive map palette (Rivals-style)
When to use: shooters, duel arenas, sword-fighting lobbies.
Steps:
1. Parts SmoothPlastic with a tight family: walls (197,202,218), (124,130,203), floor (237,222,245) [O].
2. Lighting Soft or Realistic with ClockTime 13-14, low fog toward (94,100,137) [O], sky (49,143,255).
3. Draw a thin grid or panel seam on floors and walls (UV or decal) for scale reading [O].
4. Enemy/teammate marker: Highlight FillColor (255,0,26) FillTransparency 0.2, OutlineColor white, DepthMode AlwaysOnTop (Luau reference).
5. Weapon viewmodel as a Workspace model that follows the camera so it receives light [S67].
6. Sizes: 10-stud corridors, three lanes, three exits per pocket [S71].
Pitfalls: Highlight is capped at 255 simultaneous instances (file 05); do not tint everything red.

### Recipe 8: Painted low-poly cozy world (Fisch/Ahlvie style)
When to use: fishing, cozy adventure, exploration.
Steps:
1. Mood board in PureRef first, then greybox with curved multi-direction paths [S22].
2. Terrain for landforms; props modelled in Blender, texture in Substance with a stylised fantasy palette [S22].
3. Faceted flat-shaded models (observed on Fisch fish) with glowing accents using emissive mask strength 2-10 (file 05) [O].
4. One atmosphere per island: change sky, Atmosphere Color and ambient per zone [S18].
5. Flowers and small colour accents every few metres; natural sun, no heavy post [S22].
6. Light interiors warm (red walls, amber lamps) for contrast with the cool outdoors [O].
Pitfalls: per-zone lighting swaps need tweens; a good-looking scene on PC may be slow on phones.

### Recipe 9: Low-poly cartoon building rules
When to use: tycoons, hangouts, bases.
Steps:
1. Make SmoothPlastic at least 70% of surfaces; use 1-3 divider materials (brick for foundations, wood for counters) [S65].
2. Shade: lighter on top surfaces, darker underneath; keep palettes analogous with one complementary accent [S65].
3. Build recognisable real-world shapes but brighter than real (xJa_ys) [S23]; interior light added at the end [S23].
4. Pieces on a 5-stud grid, doorways at least 10 studs [S71][S72].
5. Reuse identical mesh and texture IDs; convert to packages [S72][S73].
Pitfalls: mixing realistic-material PBR props into a flat plastic scene breaks the look [S65].

### Recipe 10: Toon characters with outlines (Dandy's World style)
When to use: horror-cute mascots and cast characters.
Steps:
1. Concept sketch first, one base shape, variations by adding traits (Qwelver's method) [S19].
2. Model in Blender with large black eye ovals and white highlight; thin dark outline mesh or Highlight outline [O].
3. Painted flat textures; accent glow on corrupted variants (inf).
4. Light sets with hand-placed point lights, not global brightness [S19].
5. Sticker outline in marketing art (white thin outline) [O].
Pitfalls: Highlight outlines cost per instance and have a cap; use mesh outlines for large casts.

### Recipe 11: Shine sweep on a button or card
When to use: premium or limited items, Claim buttons.
Steps: parent a transparent white Frame with a UIGradient (Rotation 20, Transparency sequence with a narrow opaque band) over the button; tween the gradient Offset from (-1,0) to (1,0) in 0.8-1 s (Quint InOut) and repeat at random 2-5 s intervals (documented patterns: Offset sweep 1 s Quint InOut [S49]; width 0.15, angle 10 [S50]).
Pitfalls: gradient transparency interacts badly with parent transparency [S48]; respect ReducedMotionEnabled (file 06).

### Recipe 12: Procedural colour variants (Fisch seed system)
When to use: mutations, shinies, pet and fish variants without new meshes.
Steps: store a seed per item; derive hue shift per part with Color3:ToHSV and Color3.fromHSV; apply to BasePart.Color or SurfaceAppearance.Color tint (file 05); use about 25 distinct variants per base item as Fisch does [S18]; mark rare variants with sparkle particles or Neon.
Pitfalls: keep shifts clear enough to read on phones; document the seed so variants are reproducible.

### Recipe 13: Dark translucent HUD (Roblox sample values)
When to use: shooters, battlegrounds, any HUD over a busy 3D scene.
Steps: header trapezoid or rectangular strip ImageTransparency 0.15; body black panels BackgroundTransparency 0.3 with UICorner scale 0.05-0.075; selected item 0.1 and unselected 0.65; Montserrat Medium white text; team colours mint (88,218,171) and carnation (255,170,255) as the pair [S45].
Pitfalls: TextScaled was used in the sample but breaks with player text-size settings (file 06); multiply transparencies by GuiService.PreferredTransparency.

### Recipe 14: Thumbnail and icon kit (4 variants)
When to use: launch and every update.
Steps:
1. Icon 512x512 (design at 1024). One hero subject filling 70-90%, headline cap height about 48 px (9-10%) white with 3-5 px black outline, bright sky/ground pair or a dark field with one warm accent (O).
2. Thumbnail A: gameplay hero shot in-engine at 1920x1080. B: an exaggerated-scale shot (giant item, tiny avatar). C: the update or event name at the top in 1-3 words. D: social/co-op shot (two to four characters). Make them differ in gameplay, character, environment, motivation [S3].
3. Keep key elements out of the bottom strip [S1]. Keep all under 3 MB [S1]. Keep any overlay text to a few gameplay-descriptive words, no promotions or claims [S89].
4. Activate 2-5 thumbnails, wait 7 days or until the next update; keep the best performer in every test [S3][S4].
5. Check at 150x150 and 128x128 [S2][S6].
Pitfalls: do not show features that are not in the first minute [S1][S10]; the icon A/B test does not exist yet [S5].

### Recipe 15: In-world dialog bubble with drop shadow
When to use: NPC speech and nameplates (Grow a Garden pattern).
Steps: BillboardGui on a head Attachment (ExtentsOffset about (1,0,0), SizeOffset (0.5,0) per the thread), a background ImageLabel acting as the drop shadow behind the TextLabel, MaxDistance 60-100 (file 06) [S39].
Pitfalls: the thread gives no colours or fonts; prefer UIShadow now where supported (file 06).

### Recipe 16: Visual QA pass ("pro vs free model")
When to use: before every playtest build.
Steps: run the checklist in the rules section; compute contrast ratios (Luau reference); open Shift+F2 for draw calls; test at 150x150 for icon legibility; compare against two top games of your family by thumbnail side by side; fix the biggest inconsistency first.
Pitfalls: judging only on a PC at max quality.

## Luau reference snippets

```lua
--!strict
-- Chunky depth button (Recipe 2). Client LocalScript.
local function makeChunkyButton(parent: Instance, text: string, top: Color3, bottom: Color3, lip: Color3): TextButton
	local holder = Instance.new("Frame")
	holder.BackgroundTransparency = 1
	holder.Size = UDim2.fromOffset(190, 60)

	local lipFrame = Instance.new("Frame")
	lipFrame.Name = "Lip"
	lipFrame.BackgroundColor3 = lip
	lipFrame.Position = UDim2.fromOffset(0, 4)
	lipFrame.Size = UDim2.new(1, 0, 1, -4)
	lipFrame.ZIndex = 1
	lipFrame.Parent = holder
	local lipCorner = Instance.new("UICorner")
	lipCorner.CornerRadius = UDim.new(0, 12)
	lipCorner.Parent = lipFrame

	local face = Instance.new("TextButton")
	face.Name = "Face"
	face.AutoButtonColor = false
	face.BackgroundColor3 = Color3.new(1, 1, 1) -- the gradient provides the colour
	face.Size = UDim2.new(1, 0, 1, -4)
	face.ZIndex = 2
	face.Text = text
	face.TextSize = 24
	face.TextColor3 = Color3.new(1, 1, 1)
	face.FontFace = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.ExtraBold)
	face.Parent = holder

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = face

	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new(top, bottom)
	gradient.Rotation = 90
	gradient.Parent = face

	local border = Instance.new("UIStroke") -- border outline
	border.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	border.Thickness = 3
	border.Color = Color3.fromRGB(20, 20, 30)
	border.Parent = face

	local textStroke = Instance.new("UIStroke") -- text outline
	textStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	textStroke.Thickness = 2.5
	textStroke.Color = Color3.fromRGB(20, 20, 30)
	textStroke.Parent = face

	holder.Parent = parent
	return face
end
```

```lua
--!strict
-- Animated rainbow text gradient for a top rarity name (Recipe 3).
local RunService = game:GetService("RunService")

local function rainbowText(label: TextLabel): RBXScriptConnection
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Color = Color3.fromRGB(0, 0, 0)
	stroke.Parent = label

	label.TextColor3 = Color3.new(1, 1, 1)
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0.00, Color3.fromRGB(255, 60, 60)),
		ColorSequenceKeypoint.new(0.20, Color3.fromRGB(255, 190, 40)),
		ColorSequenceKeypoint.new(0.40, Color3.fromRGB(90, 235, 90)),
		ColorSequenceKeypoint.new(0.60, Color3.fromRGB(60, 200, 255)),
		ColorSequenceKeypoint.new(0.80, Color3.fromRGB(150, 90, 255)),
		ColorSequenceKeypoint.new(1.00, Color3.fromRGB(255, 60, 60)),
	})
	gradient.Parent = label

	return RunService.Heartbeat:Connect(function()
		gradient.Rotation = (os.clock() * 90) % 360
	end)
end
```

```lua
--!strict
-- Shine sweep over a button (Recipe 11).
local TweenService = game:GetService("TweenService")

local function addShine(host: GuiObject)
	local shine = Instance.new("Frame")
	shine.Name = "Shine"
	shine.BackgroundColor3 = Color3.new(1, 1, 1)
	shine.BorderSizePixel = 0
	shine.Size = UDim2.fromScale(1, 1)
	shine.ZIndex = host.ZIndex + 1
	shine.Active = false
	shine.Parent = host

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = shine

	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 20
	gradient.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.42, 1),
		NumberSequenceKeypoint.new(0.5, 0.45),
		NumberSequenceKeypoint.new(0.58, 1),
		NumberSequenceKeypoint.new(1, 1),
	})
	gradient.Offset = Vector2.new(-1, 0)
	gradient.Parent = shine

	task.spawn(function()
		while shine.Parent do
			gradient.Offset = Vector2.new(-1, 0)
			local tween = TweenService:Create(gradient, TweenInfo.new(1, Enum.EasingStyle.Quint, Enum.EasingDirection.InOut), { Offset = Vector2.new(1, 0) })
			tween:Play()
			tween.Completed:Wait()
			task.wait(2 + math.random() * 3)
		end
	end)
end
```

```lua
--!strict
-- Stud-tile layer for a card (Recipe 1). The asset id is the one a forum answer cites; replace with your own upload if it fails.
local function addStuds(card: GuiObject, tint: Color3)
	local studs = Instance.new("ImageLabel")
	studs.Name = "Studs"
	studs.BackgroundTransparency = 1
	studs.Size = UDim2.fromScale(1, 1)
	studs.Image = "rbxassetid://15910695917"
	studs.ScaleType = Enum.ScaleType.Tile
	studs.TileSize = UDim2.fromOffset(48, 48)
	studs.ImageColor3 = tint
	studs.ImageTransparency = 0.6
	studs.Parent = card
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 14)
	corner.Parent = studs
end
```

```lua
--!strict
-- Highlight silhouette for units (Recipe 7). Highlight has a global display cap (file 05).
local function markUnit(model: Model, color: Color3)
	local h = Instance.new("Highlight")
	h.Adornee = model
	h.FillColor = color
	h.FillTransparency = 0.2
	h.OutlineColor = Color3.new(1, 1, 1)
	h.OutlineTransparency = 0
	h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
	h.Parent = model
	return h
end
```

```lua
--!strict
-- Hue-shifted variants from a seed (Recipe 12).
local function variantColor(base: Color3, seed: number, partIndex: number): Color3
	local rng = Random.new(seed + partIndex * 7919)
	local h, s, v = base:ToHSV()
	local shift = (rng:NextNumber() - 0.5) * 0.25 -- up to +/- 0.125 of the colour wheel
	return Color3.fromHSV((h + shift) % 1, math.clamp(s + (rng:NextNumber() - 0.5) * 0.2, 0, 1), math.clamp(v, 0.15, 1))
end
```

```lua
--!strict
-- WCAG relative luminance and contrast ratio (Recipe 16): aim for 4.5 or more on body text.
local function channel(c: number): number
	if c <= 0.03928 then return c / 12.92 end
	return ((c + 0.055) / 1.055) ^ 2.4
end
local function luminance(color: Color3): number
	return 0.2126 * channel(color.R) + 0.7152 * channel(color.G) + 0.0722 * channel(color.B)
end
local function contrast(a: Color3, b: Color3): number
	local la, lb = luminance(a), luminance(b)
	if la < lb then la, lb = lb, la end
	return (la + 0.05) / (lb + 0.05)
end
```

```lua
--!strict
-- Apply the sunny simulator look (Recipe 4). LightingStyle and PrioritizeLightingQuality must be set in the Properties panel or by a plugin.
local Lighting = game:GetService("Lighting")

local function applySunnySimulator()
	Lighting.Brightness = 1.8
	Lighting.OutdoorAmbient = Color3.fromRGB(209, 192, 191)
	Lighting.EnvironmentDiffuseScale = 0.283
	Lighting.EnvironmentSpecularScale = 0.39
	Lighting.ExposureCompensation = 0.05
	Lighting.ClockTime = 14
	local cc = Lighting:FindFirstChildOfClass("ColorCorrectionEffect") or Instance.new("ColorCorrectionEffect")
	cc.Contrast = 0.13
	cc.Saturation = 0.2 -- the source tutorial used 1.1; raise only if parts are pastel
	cc.TintColor = Color3.fromRGB(230, 230, 230)
	cc.Parent = Lighting
end
```

## Open questions / unverified
Resolved in the 2026-10-04 gap pass (see Key facts): the stud texture id exists as an Image asset [S88]; Steal An Egg's 14M peak, release date and server cap [S90];
the thumbnail docs wording on the bottom strip and overlay text [S89]; the unsourced third-party thumbnail statistics were deleted.
- No top game's real UI hex colours, stroke widths or font sizes were found. The only exact UI values are Roblox's sample HUD [S45] and a tutorial canvas [S41]. The rarity colour ladder in Recipe 3 is my design, not a documented palette.
- Which Lighting settings Grow a Garden, Steal a Brainrot, Rivals, 99 Nights and Dead Rails actually use is unknown (searched again; the 99 Nights and Dandy's World spotlights name no lighting technology, only low part counts and hand-placed point lights [S17][S19]). The "Brainrot lighting" tutorial [S53] is a community claim, not a game's setting; whether those games use Soft or Realistic lighting is not documented anywhere I found.
- The tile sizes of the Grow a Garden stud texture are unknown (the threads give none) [S37][S38].
- The font used by Grow a Garden and the true font of Steal a Brainrot are unconfirmed; the Fonts In Use entry is a disputed user submission [S36]. A search result and font-generator pages claim "Comic Neue Angular" for Grow a Garden, but the only forum source is a Fandom thread I could not open (HTTP 402), so it stays unverified. Dress to Impress's logo font is only a community guess [S92].
- My thumbnail measurements are from a small sample (about 25 images) on one day and from marketing art; saturation and brightness numbers describe thumbnails, not in-game screens.
- Roblox UI features announced for late 2026-2027 (radial gradients, UI blur, 2D particles) are not covered; see file 06.
- I did not find a DevForum Creator Spotlight for Grow a Garden, Steal a Brainrot, Dead Rails, Rivals, Forsaken or Blox Fruits (searched again 2026-10-04); their visual intent is inferred from thumbnails and Wikipedia only.

## Sources
[S1] Thumbnails, Roblox Creator Hub, read 2026-10-04, https://create.roblox.com/docs/production/publishing/thumbnails
[S2] Icons, Roblox Creator Hub, read 2026-10-04, https://create.roblox.com/docs/production/publishing/experience-icons
[S3] "5 Tips From Roblox Staff to Get the Most Out of Thumbnail Personalization", JavaJiving (Roblox staff), DevForum, 2025-02-13, https://devforum.roblox.com/t/5-tips-from-roblox-staff-to-get-the-most-out-of-thumbnail-personalization/3471689
[S4] "Thumbnail personalization now remembers your existing winning thumbnails", loopcoded (Roblox staff), DevForum, 2025-07-01, https://devforum.roblox.com/t/thumbnail-personalization-now-remembers-your-existing-winning-thumbnails/3793665
[S5] "Icon A/B Testing" feature request, KizmoTek and replies, DevForum, 2024-11-25 to 2026-07-15, https://devforum.roblox.com/t/icon-ab-testing/3274267
[S6] "Roblox Game Icon Mistakes That Kill Clicks and qPTR", creatorxp.gg, 2026-05-20 (third-party), https://creatorxp.gg/guides/roblox-game-icon-mistakes
[S7] "The Roblox Thumbnail Is a Conversion Ad", RoWatcher, undated (third-party; contains wrong game IDs), https://rowatcher.com/news/the-roblox-thumbnail-is-a-conversion-ad-stop-designing-it-like-art
[S8] "Is My Thumbnail Good Enough to Have a Good CTR?", DevForum feedback thread (Jezzie_Dev, agentphilip07, GamEditoPro), 2025-08-26, https://devforum.roblox.com/t/is-my-thumbnail-good-enough-to-have-a-good-ctr/3901355
[S9] Standout Games, Roblox Creator Hub, read 2026-10-04, https://create.roblox.com/docs/creator-programs/standout-games
[S10] "Roblox Curation: How Do We Consider Games for Today's Picks?", SilvrenColaver (Roblox staff), DevForum, 2025-10-13, https://devforum.roblox.com/t/roblox-curation-how-do-we-consider-games-for-todays-picks/4005089
[S11] "Inside Roblox Studio: Creators Discuss Working in Unique Art Styles", Roblox newsroom, 2026-07-01, https://about.roblox.com/newsroom/2026/07/roblox-studio-fidelity-creator-interviews-twin-atlas-fluorlite-maximillian-ecos
[S12] "Roblox Fall Games Preview", Roblox newsroom, 2026-09, https://about.roblox.com/newsroom/2026/09/roblox-fall-games-preview
[S13] "A Look at the 2026 Roblox Incubator Cohort", Roblox newsroom, 2026-06, https://about.roblox.com/newsroom/2026/06/2026-roblox-incubator-cohort
[S14] "Roblox Fuels Next Wave of High-Fidelity Games for Over 18 Players, Increases Qualifying DevEx Rate by 42%", Roblox newsroom, 2026-04, https://about.roblox.com/newsroom/2026/04/roblox-fuels-high-fidelity-games-over-18-players-increases-qualifying-devex-rate-42
[S15] "2026 Roblox Innovation Awards Showcase What's Possible on Roblox", Roblox newsroom, 2026-09-12, https://about.roblox.com/newsroom/2026/09/2026-roblox-innovation-awards
[S16] "Roblox reveals 2025 Innovation Awards winners", PocketGamer.biz, 2025-09-09, https://www.pocketgamer.biz/roblox-reveals-2025-innovation-awards-winners/
[S17] "Creator Spotlight: The Story Behind 99 Nights in the Forest", DevForum, 2025-10-31, https://devforum.roblox.com/t/creator-spotlight-the-story-behind-99-nights-in-the-forest/4036940
[S18] "Creator Spotlight: WoozyNate Makes a Splash with Fisch", DevForum, 2024-11-22, https://devforum.roblox.com/t/creator-spotlight-woozynate-makes-a-splash-with-fisch/3269481
[S19] "Creator Spotlight: How Qwelver Dreamed Up Dandy's World", DevForum, 2025-05-05, https://devforum.roblox.com/t/creator-spotlight-how-qwelver-dreamed-up-dandy%E2%80%99s-world/3639226
[S20] "Creator Spotlight: Empyror on Sculpting Stylized Daggers, Masks, and More", DevForum, 2025-02-28, https://devforum.roblox.com/t/creator-spotlight-empyror-on-sculpting-stylized-daggers-masks-and-more/3515509
[S21] "Creator Spotlight: how unroot designs ui for marbles, mermaids, and more", DevForum, 2024-07-19, https://devforum.roblox.com/t/creator-spotlight-how-unroot-designs-ui-for-marbles-mermaids-and-more/3077233
[S22] "Creator Spotlight: Meet Ahlvie, the Environmental Artist Behind Fantastical Worlds", DevForum, 2024-05-10, https://devforum.roblox.com/t/creator-spotlight-meet-ahlvie-the-environmental-artist-behind-fantastical-worlds/2964648
[S23] "Creator Spotlight: xJa_ys on Bringing Bayside High to Life", DevForum, 2025-03-28, https://devforum.roblox.com/t/creator-spotlight-xja_ys-on-bringing-bayside-high-to-life/3579254
[S24] "Creator Spotlight: BelowNatural's Journey Building Paradoxum Games", DevForum, 2024-06-17, https://devforum.roblox.com/t/creator-spotlight-belownaturals-journey-building-paradoxum-games/3027035
[S25] "Creator Spotlight: Chainsaw Man Director on Building Japanese Horror Game The Inn", DevForum, 2025-05-21, https://devforum.roblox.com/t/creator-spotlight-chainsaw-man-director-on-building-japanese-horror-game-the-inn/3659603
[S26] "Creator Spotlight: HDFrisk on Producing Fun Simulators With The Gang", DevForum, 2025-01-27, https://devforum.roblox.com/t/creator-spotlight-hdfrisk-on-producing-fun-simulators-with-the-gang/3419750
[S27] "Creator Spotlight: How Ultraw's Love for Food Became a Trending Tycoon", DevForum, 2025-07-25, https://devforum.roblox.com/t/creator-spotlight-how-ultraws-love-for-food-became-a-trending-tycoon/3840933
[S28] "Creator Spotlight: Calilies on Creating Roblox Fashion and Animating Dance Moves", DevForum, 2024-09-27, https://devforum.roblox.com/t/creator-spotlight-calilies-on-creating-roblox-fashion-and-animating-dance-moves/3174126
[S29] "How Dead Rails became a Roblox hit: the data behind a breakout success", GameAnalytics, 2025, https://www.gameanalytics.com/blog/dead-rails-and-the-hit-makers-formula
[S30] "How Grow a Garden took off on Roblox" (Janzen Madsen interview), GamesBeat, 2025, https://gamesbeat.com/janzen-madsen-interview/
[S31] "Grow a Garden", Wikipedia, read 2026-10-04, https://en.wikipedia.org/wiki/Grow_a_Garden
[S32] "Steal a Brainrot", Wikipedia, read 2026-10-04, https://en.wikipedia.org/wiki/Steal_a_Brainrot
[S33] "Dress to Impress (video game)", Wikipedia, read 2026-10-04, https://en.wikipedia.org/wiki/Dress_to_Impress_(video_game)
[S34] "Doors (game)", Wikipedia, read 2026-10-04, https://en.wikipedia.org/wiki/Doors_(game)
[S35] "99 Nights in the Forest", Wikipedia, read 2026-10-04, https://en.wikipedia.org/wiki/99_Nights_in_the_Forest
[S36] "Steal a Brainrot video game", Fonts In Use (user submission 2025-12-07; comment 2026-09-26), https://fontsinuse.com/uses/73361/steal-a-brainrot-video-game
[S37] "How do you make stud UI?", DevForum Art Design Support, 2025-10-22/23, https://devforum.roblox.com/t/how-do-you-make-stud-ui/4020877
[S38] "Grow a garden ui example", DevForum (ProbablyGavin; supernovasalmon), 2025-06-20, https://devforum.roblox.com/t/grow-a-garden-ui-example/3764006
[S39] "Grow a garden dialog UI", DevForum (targetdior; 7z99), 2025-06-14, https://devforum.roblox.com/t/grow-a-garden-dialog-ui/3736124
[S40] "Feedback on my Pet simulator 99 inspired UI", DevForum, 2025-07-14/15, https://devforum.roblox.com/t/feedback-on-my-pet-simulator-99-inspired-ui/3814728
[S41] "How to make UI styled for simulator (Detailed Tutorial)", FirstLostData (Besmx), DevForum, 2024-03-29, https://devforum.roblox.com/t/how-to-make-ui-styled-for-simulator-detailed-tutorial/2895762
[S42] "[Full Release] UIStroke Improvements: Scaling, Offsets, and More!", missmandypanda (Roblox staff), DevForum, 2025-12-04, https://devforum.roblox.com/t/full-release-uistroke-improvements-scaling-offsets-and-more/3958036
[S43] UI appearance modifiers (UIGradient, UIStroke, UICorner), Roblox creator-docs repository, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/appearance-modifiers.md
[S44] Choose an art style (UI design curriculum), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/user-interface-design/choose-an-art-style.md
[S45] Implement designs in Studio (UI curriculum, exact sample values), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/user-interface-design/implement-designs-in-studio.md
[S46] UI and UX design, Roblox Creator Hub, read 2026-10-04, https://create.roblox.com/docs/production/game-design/ui-ux-design
[S47] "UI Design and the Fundamentals", PictureFolder, DevForum, 2021-09-05 (stale), https://devforum.roblox.com/t/ui-design-and-the-fundamentals/1455805
[S48] "How do I make outlines with gradient and round corners?", DevForum (Ashk3000; JoyfulFlowerMary), 2023-02-20/23, https://devforum.roblox.com/t/how-do-i-make-outlines-with-gradient-and-round-corners/2189334
[S49] "UI Shine Effect Help", Jebrik (YTKACKA1), DevForum, 2024-11-23, https://devforum.roblox.com/t/ui-shine-effect-help/3269857
[S50] "ShinyEffectModule", uknowdastairtoheaven, DevForum, 2025-03-18, https://devforum.roblox.com/t/shinyeffectmodule-%E2%80%93-customizable-shiny-gradient-effect-for-gui-elements/3555590
[S51] "Dropshadows - How to; quick and easy tutorial", koda (pvvxt), DevForum, 2024-01-18, https://devforum.roblox.com/t/dropshadows-how-to-quick-and-easy-tutorial/2798558
[S52] "FigBloxUI - Figma to Roblox UI in seconds", RatchadaSoi2, DevForum, 2026-02-26, https://devforum.roblox.com/t/figbloxui-%E2%80%94-figma-to-roblox-ui-in-seconds/4446977
[S53] "Lighting Settings for Brainrot Games", Vec (VectazePlayz), DevForum Community Tutorials, 2026-02-03, https://devforum.roblox.com/t/lighting-settings-for-brainrot-games/4326900
[S54] "Cartoon Lighting Help", DevForum (CoderLuau; creepydousage), 2025-04-12, https://devforum.roblox.com/t/cartoon-lighting-help/3602579
[S55] "Realistic Roblox Lighting", BEAMEDBYTRGX, DevForum, 2024-09-02, https://devforum.roblox.com/t/realistic-roblox-lighting/3144291
[S56] "How You Can Make Stylized Flat-Color Art", Flumzee, DevForum, 2021-10-16 (stale), https://devforum.roblox.com/t/how-you-can-make-stylized-flat-color-art/1510773
[S57] "How To: Cel Shading Effect", PersonifiedPizza, DevForum, 2021-09-18 (stale), https://devforum.roblox.com/t/how-to-cel-shading-effect/1472627
[S58] "How to achieve Stylized Lighting", DevForum (kittyboyIsGone; TheBigC10), 2025-01-06 to 2026-05-12, https://devforum.roblox.com/t/how-to-achieve-stylized-lighting/3350796
[S59] "How would I replicate Legacy Lighting w/ Retro Tone Mapping?", DevForum, 2025-05-22 to 2025-05-24, https://devforum.roblox.com/t/how-would-i-replicate-legacy-lighting-w-retro-tone-mapping/3660864
[S60] "Tips on Achieving 2015-2017 Roblox Lighting?", DevForum (raylessrayman et al.), 2026-02-05, https://devforum.roblox.com/t/tips-on-achieving-2015-2017-roblox-lighting/4334776
[S61] "Classic Lighting", Wholesome, DevForum, 2025-11-30, https://devforum.roblox.com/t/classic-lighting/4107658
[S62] "Light.ForceSoft" feature request, Lio_Pard, DevForum, 2026-04-28, https://devforum.roblox.com/t/lightforcesoft/4602564
[S63] "Which lighting is better for my horror game", Jovve and replies, DevForum, 2025-01-28, https://devforum.roblox.com/t/which-lighting-is-better-for-my-horror-game/3421293
[S64] "Haze Atmosphere property appearing way darker on some clients", Engine Bugs, DevForum, 2024-02-01 to 2024-10-02, https://devforum.roblox.com/t/haze-atmosphere-property-appearing-way-darker-on-some-clients/2818161
[S65] "Stylized Low Poly", titanicvs and PyroGamingMC, DevForum, 2025-06-25/26, https://devforum.roblox.com/t/stylized-low-poly/3781693
[S66] "How to make pixelated/low colors lighting system", DevForum (max52229 2024-07-21; UmbrelaGod 2026-02-15), https://devforum.roblox.com/t/how-to-make-pixelatedlow-colors-lighting-system/3079105
[S67] "How did Rivals blend their ViewportFrame in with the environment so well?", DevForum, 2026-03-25, https://devforum.roblox.com/t/how-did-rivals-blend-their-viewportframe-in-with-the-environment-so-well/4537280
[S68] "Maximilian Studios on the success of Frontlines", PocketGamer.biz, 2023-03-21 (older than 2024), https://www.pocketgamer.biz/maximilian-studios-on-the-success-of-frontlines-you-dont-need-a-3000-rig-or-a-500-console-you-can-boot-it-up-on-your-mobile-device/
[S69] Develop polished assets (environmental art curriculum), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/environmental-art/develop-polished-assets.md
[S70] Construct your world (environmental art curriculum), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/environmental-art/construct-your-world.md
[S71] Greybox your environment (environmental art curriculum), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/environmental-art/greybox-your-environment.md
[S72] Assemble an asset library (environmental art curriculum), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/environmental-art/assemble-an-asset-library.md
[S73] Optimize your experience (environmental art curriculum), Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/curriculums/environmental-art/optimize-your-experience.md
[S74] BrickColor data type, Roblox creator-docs, read 2026-10-04, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/datatypes/BrickColor.yaml
[S75] "RDC25: What we announced", DevForum, 2025-09, https://devforum.roblox.com/t/rdc25-what-we-announced/3920245
[S76] "2025 Year in Review!", DevForum, 2025-12-19, https://devforum.roblox.com/t/2025-year-in-review/4164479
[S77] Roblox public games endpoint (universe ids 7436755782, 7709344486, 7326934954), queried 2026-10-04, https://games.roblox.com/v1/games
[S78] Roblox explore endpoint, sort "top-playing-now" and sort list, queried 2026-10-04, https://apis.roblox.com/explore-api/v1/get-sort-content
[S79] Roblox thumbnails endpoint (icons and 768x432 thumbnails of about 25 experiences), queried 2026-10-04; viewed and measured by me, https://thumbnails.roblox.com/v1/games/multiget/thumbnails
[S80] "'Steal A Brainrot' is Roblox's latest viral hit", NME, 2025-08-29, https://www.nme.com/news/gaming-news/steal-a-brainrot-is-robloxs-latest-viral-hit-grow-a-garden-3888650
[S81] "Feedback on Dead Rails + ARG Horror", DasEpocGuy, DevForum, 2025-04-03, https://devforum.roblox.com/t/feedback-on-dead-rails-arg-horror/3592238
[S82] "Feedback On My Fishing Game ("Fisch")" (2024-05-30/31) and "New Roblox Fishing Game ("Fisch")" (2024-10-12/16), DevForum, https://devforum.roblox.com/t/feedback-on-my-fishing-game-fisch/2996415 and https://devforum.roblox.com/t/new-roblox-fishing-game-fisch/3183374
[S83] DevForum Community & Events category listing and "Creator Spotlight" search results, read 2026-10-04, https://devforum.roblox.com/c/updates/community/90
[S84] "Make Your Roblox UI Look 10x Better" (summary of a 2026-09-04 video tutorial), daily.dev, https://daily.dev/posts/make-your-roblox-ui-look-10x-better-gcb7z9t6w
[S85] "Roblox Simulator Asset UI Pack - Clean, Modern, Matte look", BeanyBoxer, DevForum, 2026-09-20, https://devforum.roblox.com/t/roblox-simulator-asset-ui-pack-clean-modern-matte-look-for-roblox-simulator-games/4884711
[S86] DOORS, Official DOORS Wiki (fan wiki; awards listed, 2023), read 2026-10-04, https://doorsgame.wiki/wiki/DOORS
[S87] 99 Nights in the Forest wiki/guide (fan site), read 2026-10-04, https://www.99nightsintheforest.net/
[S88] Roblox economy API, asset details for 15910695917 (name, type Image, created 2024-01-07), queried 2026-10-04. https://economy.roblox.com/v2/assets/15910695917/details
[S89] Thumbnails (raw docs source: size, formats, 3 MB, up to 10 items, bottom-strip rule, overlay text rule, video limits, +8.5% qPTR), Roblox creator-docs, read 2026-10-04. https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/publishing/thumbnails.md
[S90] Steal An Egg stats: Rolimons (all-time peak 14,293,524, 7 per server) and RoVitals (record 14,272,591 on 2026-09-19, tracking from 2026-08-12, created 2026-07-25), third-party, read 2026-10-04. https://www.rolimons.com/game/107778070777162 ; https://rovitals.com/game/107778070777162
[S91] "Introducing Builder Font + Deprecating Gotham and Arial", Roblox staff, DevForum, 2024-03-07 (Gotham to Montserrat, Arial to Arimo, removal 2024-05-28); Enum.Font reference (Gotham maps to Montserrat; FredokaOne, LuckiestGuy, Bangers, Cartoon listed), read 2026-10-04. https://devforum.roblox.com/t/introducing-builder-font-deprecating-gotham-and-arial/2868222 ; https://create.roblox.com/docs/reference/engine/enums/Font
[S92] "Dress to Impress Roblox Game Font", dafont forum (community suggestions, 2024-11-20 to 2025-07-05, low confidence). https://www.dafont.com/forum/read/552392/dress-to-impress-roblox-game-font
