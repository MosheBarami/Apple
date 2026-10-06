# StudPilot Style Bible v1: the hard target look

Written by the planner, 2026-10-06, from the owner's 29 reference images. **This file is the law for how StudPilot output looks.** A build that does not look like it came from the same game as the reference images fails, however well it works.

## 0. Owner decisions (2026-10-06)

| # | Decision | What it rules out |
|---|---|---|
| S-1 | **UI first**, then the world (props, zones). Both follow this bible. | Doing world style before the UI passes |
| S-2 | **The reference images never go in the public repo.** They live in private storage (R2 `studpilot-media/style-refs/`, private) and in a git-ignored local folder. Only this written analysis goes in the repo. | Committing screenshots of other people's games |
| S-3 | **The critic gets a 7th area, "style": does this match the references?** It must score 8 or higher, like every other area. The critic sees a fixed reference board plus the build's screenshots. | Judging style from the critic's own taste |
| S-4 | **Icons and 3D art:** a fixed, curated pack of about 40 items, built from free Creator Store assets and Roblox's own AI generators where needed. Every user gets the same pack. $0. | Buying a UI kit; text-only icons; the model inventing asset IDs |

## 1. Diagnosis: why months of tries failed

These are measured facts, from M3 (the first 20 test builds, 2026-10-06):

1. **0 of 20 passed.** The UI builds averaged about 3/10. The best was U15, at about 7.
2. **The UI tests are mostly a camera bug.** In U01, U06–U10, U13 and U14, the AI made a button ("STORE", "QUESTS"), but the screenshot never opened the panel. The critic saw a button on a bare floor. We cannot tell how good the panels are until this is fixed.
3. **False claims.** U14's reply said "complete and verified working" while the critic saw no store. Every UI build broke the 0-false-claims rule.
4. **The colour gap is huge and measurable.** I measured the colour of every image (thumbnails shrunk to 160×90, then averaged):

   | | Colour strength (saturation, 0–1) | Share of grey pixels | Share of vivid pixels |
   |---|---|---|---|
   | Owner references (25 game shots, median) | **0.57** | **0.08** | **0.52** |
   | StudPilot `overview.jpg` | 0.07 | 0.93 | 0.04 |
   | StudPilot `ui-1554x623.jpg` | 0.06 | 0.95 | 0.01 |

   StudPilot's output is about **93% grey**. The references are about **8% grey**.
5. **The real cause: there was no target.** The "clean-stud look" in PR #68 was designed from imagination. No one ever wrote down the recipe. The build model (GLM 5.3 Flash) is blind and can never check how a build looks.

   **The only reliable fix:** Claude Code, which can see, builds the look **once, by hand**, into a fixed kit and checks it against the references. GLM is then only allowed to pick kit parts and fill in text, numbers and colour *names*. It never sets raw colours, fonts or sizes.

## 2. The reference board

These IDs go in the private store. File names are as the owner saved them.

| ID | File | What it teaches |
|---|---|---|
| R01 | maxresdefault.jpg | **The master UI reference.** Includes:<ul><li>"Studs-Style UI": top tabs (Sell, Base, Upgrades);</li><li>a Shop window with a header and cards;</li><li>left icon tiles;</li><li>currency at bottom left;</li><li>a hotbar;</li><li>a potions row;</li><li>quests on the right.</li></ul> |
| R02 | images-16.jpg | Info popup: teal stud-grid panel, a round badge overflowing the top, a round green check overflowing the bottom |
| R03 | images-21.jpg | Settings window (a flatter, simpler variant): ON toggles, code entry with a Get button |
| R04 | images-13.jpg | Full HUD in a live game: SHOP and SELL top tabs, left Shop and Index tiles, Starter Pack and VIP offers on the right, boost row at bottom left |
| R05 | images-12.jpg | HUD plus world: left tiles (Shop, Index, Rewards), Miners Pack offer, "Next event in" timer, sign prop |
| R06 | images-19.jpg | HUD: Buy, Country and Sell tabs, Research and Alliance tiles, Auto Sell button, hotbar with counts, stat list |
| R07 | images-34.jpg | HUD: Index, Store, Rebirth and Kick Battles tiles (2×2), currency stack, hotbar |
| R08 | images-18.jpg | HUD: Shop, Stats and Auto tiles, offer button with rainbow text, billboard "Expand Plot #1" |
| R09 | images-10.jpg | Pet reveal: "1 in 128" plus rarity name in stroked text, round action buttons with labels |
| R10 | images-11.jpg | World: market stall with striped awning, "Pet Shop" billboard title, crates, studded grass |
| R11 | images-30.jpg | World: three striped stalls, palm trees, lamp post, sunset lighting, studded grass and brick path |
| R12 | images-33.jpg | World: dense flower farm on a studded plot, wooden fence, brick tree |
| R13 | images-26.jpg | World: farm with a barn, windmills, crops, sunflowers, a billboard board |
| R14 | images-32.jpg | World: islands, bridges, barns and windmills (bright, washed out) |
| R15 | images-25.jpg | World: dense town square, shops with awnings, "CUBIC BANK" landmark |
| R16 | images-15.jpg | World: neon city with sakura trees and pastel sky |
| R17 | images-17.jpg | World: low-poly cliffs, chunky trees, coin pickup |
| R18 | images-20.jpg | Tycoon: a round plot with crops, a red silo and a saw |
| R19 | images-28.jpg | Prop progression: one fountain in 3 tiers of colour and size |
| R20 | images-22.jpg | Prop: a blocky house on water (thumbnail) |
| R21 | images-14.jpg | Effect: coin burst with glow, "133 COINS COLLECTED!" stroked text |
| R22–R27 | images-23, 24, 27, 29, 31, noFilter-4 | YouTube thumbnails. **Mood only**: saturation, outlines, "Level 1 → MAX" contrast. **Not** a build target. |
| X1, X2 | overview.jpg, ui-1554x623.jpg | **StudPilot's own failing output (anti-reference).** Never imitate it. |

**The critic's reference board** is fixed: R01, R02, R04, R07 for UI builds; R10, R11, R12, R13 for world builds. Changing the board needs a new rubric version.

## 3. The UI recipe (measured from R01, R02 and R04 at 1920×1080)

### 3.1 The seven signatures
Every UI in the references has **all seven**. A StudPilot UI that misses any of them fails "style".

1. **Heavy rounded font, always with a thick outline.**
   - Labels are white with a dark outline.
   - Numbers are coloured with a darker outline of the same hue (green $ with a dark green outline; cyan gems with a dark teal outline).
   - Text never appears without an outline.
2. **Glossy fills.** Every button, tile and card has a vertical gradient: lighter at the top, a more saturated tone at the bottom. There are no flat fills.
3. **The stud texture.** Buttons, tiles, headers and cards carry a faint repeating Roblox-stud pattern: square studs with an L-shaped highlight, roughly 75–85% transparent. This is the "studs style".
4. **Thick same-hue borders.**
   - Each coloured element has a 3–4 px border, a darker shade of its own colour (lime button → dark green border).
   - Windows have a dark slate outer frame.
   - Corners are rounded but small: about 15–20% of the element's height.
5. **Big 3D icons that overflow their frame.** Icons are rendered, shaded objects (basket, book, gift, gear, clover, cash stack) bigger than their tile. They hang over the edges. Badges (the "i" circle, the green check, the X) sit **on** the frame edge, half outside.
6. **Saturated, candy colours by role.** Each role has a fixed colour family (table 3.2). Nothing is dull grey except disabled states and the dark window frame.
7. **Game layout conventions.**

   | Where | What |
   |---|---|
   | Top centre | 2–3 wide tab buttons |
   | Left edge | a vertical stack (or 2×2 grid) of square icon tiles with labels |
   | Bottom left | the currency stack (icon + big number, top to bottom) and a "Friend Boost" line |
   | Bottom centre | the hotbar |
   | Right | offers (Starter Pack, VIP) with prices, and quests |
   | Centre | windows; one at a time, in front of a dimmed or blurred world |

### 3.2 Palette (sampled from R01; the kit stores these as named tokens)
GLM may only use the **names**, never hex values.

| Token | Top (light) | Bottom (deep) | Border | Used for |
|---|---|---|---|---|
| `lime` | #C9F63E | #7FD82A | #4E8F22 | Sell, buy, claim, price buttons, money |
| `sky` | #4FE3F5 | #1FA6E0 | #1673A8 | Base, info, gems, Index |
| `sun` | #FFE23A | #FF9F1C | #B06A12 | Upgrades, warnings, gold, titles ("Daily Quests!") |
| `berry` | #FF4FA3 | #E0263F | #9E1838 | Shop header, close X, hot offers |
| `grape` | #C77DFF | #8A3FFC | #5A1FB0 | Rebirth, rare, gamepass |
| `teal` | #37E0C8 | #13A38F | #0B6B5E | Popups (R02), settings |
| `slate` (frame) | #5A6270 | #3E4450 | #23272F | Window outer frame, empty hotbar slots |
| `text` | #FFFFFF | n/a | stroke #1B1B1F | All white labels |
| `money` | #6CFF3A | n/a | stroke #1E6B14 | $ numbers |
| `gem` | #5FE6FF | n/a | stroke #0E5F78 | Gem numbers |

### 3.3 Type
- **Font:** `Enum.Font.FredokaOne`, or FontFace "Fredoka One" (it is in Roblox's list) for all titles, labels and numbers. Use `GothamBlack` / `BuilderSansExtraBold` *italic* for descriptions and promos ("Starter Pack description here!", "Last 15 minutes").
- **Outline:** a `UIStroke` on every TextLabel and TextButton, ApplyStrokeMode Contextual. Thickness: 2.5–3.5 px at 1080p for titles; 2 px for small text. Stroke colour per §3.2.
- **Sizes (share of screen height at 1080p):**

  | Text | Share |
  |---|---|
  | Window title | 4.5% |
  | Tab label | 3.5% |
  | Currency number | 4% |
  | Tile label | 2.2% |
  | Body | 1.8% |

  Set the sizes with TextScaled plus UITextSizeConstraint.

### 3.4 Construction (Roblox objects)
- **Button / tile / card:**
  - a Frame with a `UIGradient` (top → bottom per its token), a `UICorner` (~0.18 scale), and a `UIStroke` (border colour, 3 px, Border mode);
  - a child `ImageLabel` with the stud texture, ScaleType Tile, about 0.8 transparency, clipped by its own UICorner;
  - a 2 px top highlight line (white, 0.6 transparency);
  - a **drop shadow**: a copy of the shape, offset 0,4 px, black at 0.6 transparency, behind it.
- **Window:**
  - a slate outer frame (stroke 3 px, #23272F);
  - a coloured header bar with studs, the title on the left with its icon overflowing, and a square berry X on the right;
  - the body made of coloured cards, each with its own gradient and studs;
  - a scrolling area with a hidden scrollbar.
- **Overflow:** icons and badges are siblings placed outside their tile bounds. ClipsDescendants is false on tiles.
- **Motion (the "life" area):**

  | Event | Motion |
  |---|---|
  | Hover | scale 1.06 |
  | Press | scale 0.94 |
  | Open | pop from 0.8 → 1.0 with Back easing, 0.2 s |
  | Number changes | tween the count; a "+N" pops |
  | Earning | toast slides in from the right |
  | Offers | a slow idle bob or shine sweep |

  The motion is the same in every block.
- **Layout:** Scale-based sizes, a `UIAspectRatioConstraint` on every tile and window, and `UIListLayout` / `UIGridLayout` for repeats. Nothing may overlap the Roblox top bar (top 58 px).

## 4. The world recipe (for M5b–d; from R10–R18)
1. **Studded, saturated ground.** Bright lime grass (about #6BD62E) with a visible stud texture (a Texture object, the classic stud pattern, about 2–4 studs per tile). Paths are tan, dirt or terracotta brick, also studded. Never the default grey baseplate in a final shot.
2. **Lighting preset "Candy Day":**
   - Future lighting;
   - ColorCorrection: saturation +0.2…0.3, contrast +0.1;
   - Bloom intensity about 0.6, threshold about 0.9;
   - soft Atmosphere haze;
   - blue sky with puffy clouds;
   - sun high, shadows soft.

   The kit sets this whenever a zone is built. A sunset variant is in R11; a night/neon variant in R16.
3. **Chunky, readable props at player scale.**
   - Kit props: stalls with striped awnings (red/white, blue/white, green/white), wooden plank fences, barrels, crates, hay bales, lamp posts, windmills, chunky low-poly trees (cube or cone canopies) and palms, signs on posts, portals.
   - Thick shapes; nothing thinner than about 0.4 studs except fence rails.
4. **Density and purpose.** Every area has a landmark, props in clusters (never a lonely part on a plain floor), and a path that leads somewhere. Compare R11 and R15 with X1.
5. **Billboard titles.** Every interactive thing has a floating BillboardGui with a coloured stroked title ("Pet Shop", "ALIEN EXTRACTOR") and an optional white subtitle. Same font and stroke rules as §3.3.
6. **Progression by colour.** Tiers of the same prop get brighter and more saturated with each level (R19: white → gold → royal blue).

## 5. Rules for the build model (GLM)
- GLM **only** picks kit components and fills in: text, numbers, colour-token names, icon names from the pack list, and counts.
- GLM **never** writes raw Color3, Font, UIStroke, UICorner, gradient or size values for UI. The block engine rejects a plan that contains any of them.
- Custom code (systems logic) is allowed. **Custom visuals are not**: every visible instance must come from the kit.
- The reply may never say "verified", "looks", "beautiful" or "matches" about visuals. Visual claims are reserved for the critic.

## 6. Automatic checks (no AI, run on every build)
1. **Kit lint.**
   - Every visible GuiObject in the build has a kit tag (`StudKit=<component>`).
   - Every text has a UIStroke.
   - No default fonts (SourceSans, Legacy, Arial).
   - No raw grey (saturation < 0.15) outside the `slate` token and disabled states.
2. **Colour gate, on each final screenshot (the same maths as §1.4):**

   | Shot type | Mean saturation | Grey share | Vivid share |
   |---|---|---|---|
   | World shot | ≥ 0.40 | ≤ 0.30 | ≥ 0.30 |
   | UI shot | ≥ 0.45 | ≤ 0.35 | — |

   For UI shots the gate measures only the UI area (the bounding box of the opened panels). A failing shot fails the build before any critic runs, which saves money. *(These floors pass 22 of the 25 game references; X1 and X2 fail by a wide margin.)*
3. **Opened-state proof.** For UI builds, the screenshot step must show each panel **open**. Each block gets a `proofOpen` hook that the harness calls before the `ui-1554x623` and `play-*` shots. A build whose panels are never seen open fails `delivers`.

## 7. The critic's new "style" area (rubric v2)
The critic sees the reference board (§2) first, then the build's shots, and scores **style** from 0 to 10:

| Score | Meaning |
|---|---|
| 10 | Could be a screenshot from the same game as the references |
| 8 | Same family. A player would not notice a different designer. At most one signature (§3.1) is weaker. |
| 5 | Clearly "trying": some outlines and colours, but flat, or missing the studs, 3D icons or overflow |
| 2 | Generic or default Roblox UI; grey |

The critic must list **each of the seven signatures as present, weak or missing**, citing the shot. Pass: style ≥ 8, and no signature "missing". The critic still never sees the AI's reply or code.

## 8. Honest limits
- **The UI look is achievable.** It is a fixed recipe of fonts, strokes, gradients, a texture and icons, and Roblox supports all of it. **Estimate:** after the kit exists, UI builds can reach style 8. This is unproven until the M5a re-run.
- **The 3D icons are the weakest link.** The look depends on good rendered icons. If the free pack is poor, style will stall at about 6–7. In that case the owner gets a short paid-pack question, not a silent downgrade.
- **The world look is harder.** It needs meshes (trees, stalls, windmills) of R10–R13 quality. The kit must hold real, curated, free models; parts-only builds will not reach 8.
- **"Immediately" is not possible.** The kit takes Claude Code real work. After that, every build gets the look at once, because GLM can no longer leave it out.
