# StudPilot UI Spec v2: Premium Studs

2026-10-06. Written by the planner.
- **What it replaces:** `planning/STYLE-BIBLE.md` §3 (the UI recipe), §6.2 (the colour gate) and §7 (the critic).
- **What still stands:** the Bible's world recipe (§4), its GLM rules (§5), and S-2 (reference images are never committed).
- **Why it exists:** `STUDPILOT-UI-CRITIQUE.md` explains why v1 failed.

Numbers marked "measured" come from references at native 1920×1080. Numbers marked "start" are starting values to tune against the anchors.

## 0. Owner decisions (2026-10-06)

| # | Decision | What it rules out |
|---|---|---|
| S2-1 | **Look: Premium Studs.** The construction rules of the top games (one dark navy contour on everything, light inner rims, gradient faces, solid lips, big consistent icons, a hero item, motion), plus a **faint** stud texture as StudPilot's signature. | Studs as loud wallpaper; same-hue borders; translucent gloss bands; navy wells |
| S2-2 | **Icons and all art come only from real, human-made, licensed sources** (owner rule L1, same day). This replaces the earlier "we render our own icons" answer: nothing in the library may be made by GLM, by Claude, or by any AI generator. Use consistent families from Creator Store creators, Kenney (CC0) and game-icons.net (CC-BY), re-hosted once under a StudPilot group as Open Use where needed. | Icons rendered or drawn by Claude or GLM; AI-generated art; mixing 38 uploaders' styles; emoji; uploads to the owner's personal account |
| S2-3 | **Owner eye check:** the owner approves 6 screens of the new kit before any build uses it. | Shipping a kit on a critic's word alone |

## 1. The reference board v2

The images live in `private/style-refs/` (git-ignored) and private R2. They are never committed.

**Anchors (the critic sees these):**

| ID | File (from `Desktop/untitled folder 2/`) | What it anchors |
|---|---|---|
| P01 | `web-refs/kits/studpack_55.webp` | Premium studs done right: studded header and cards inside dark contours, sunburst light, big 3D icons |
| P02 | `web-refs/kits/hugestud_71.webp` | The hero composition only: a rainbow "LIMITED" hero, saturated cards filling the body edge to edge. **Do not copy its stud strength (5.6 %, too loud) or its dark body.** |
| P03 | `web-refs/kits/hugestud_61.webp` | A studded index grid with rarity-coloured cards |
| P04 | `web-refs/kits/cartoon_32.webp` | A studded shop with per-rarity cards and a big "$11 k/s" number |
| P05 | `web-refs/kits/kit25_40.webp` | **The contour, rim and lip recipe at 1080p (measured in §2)** |
| P06 | `web-refs/kits/kit25_36.webp` | Daily rewards: a wide hero Day 7 card, rays, a Claim state |
| P07 | `web-refs/devforum/4863646_090.jpeg` | Pet Simulator 99 shop: a rainbow hero, "NEW!", Robux glyph prices |
| P08 | `web-refs/devforum/4863646_091.png` | Pet Simulator 99 pass cards: big title, big icon, sunburst |
| P09 | `web-refs/devforum/4863646_089.png` | Bubble Gum Sim Infinity: round icon on rays, Gift + price buttons |
| P10 | `web-refs/kits/rng_49.webp` | Offer cards with a big icon, a coloured title, a glyph price |
| P11 | `maxresdefault.jpg` (owner R01) | The owner's original studs HUD layout (tabs, left tiles, hotbar) |
| P12 | `images-16.jpg` (owner R02) | A popup with badges sitting on the frame edge |

**Anti-references:** these are shown to the critic as "never like this". Use the annotated versions in `ui-critique/`:
- `X3-annotated.jpg`;
- `X4-annotated.jpg`;
- `KIT-pass9-annotated.jpg`;
- `anti-refs/X5-flat-egg-icon.png`;
- `anti-refs/X6-gems-button.png`.

## 2. Measured recipe (P05 at 1080p)

Measured with pixel scans of `kit25_40.webp`:

| Part | Window | Card | Button | Close button | Title text |
|---|---|---|---|---|---|
| Outer contour | 6 px, about #0A1E36 | 5–6 px, the same navy | 3–4 px on top, ~7 px at the bottom (contour + lip) | 3–4 px navy | 5 px navy stroke |
| Inner light rim | 5 px, a pale tint of the face (#A6E4FA on a #35D7F5 face) | 5 px pale tint | 3 px pale tint | 3 px pale tint | — |
| Face | Gradient | Gradient + sunburst + checker at about 2.5 % strength | Multi-stop gradient (yellow→orange; lime→green) | Magenta→red gradient, white X with a navy stroke | White fill |
| Corner radius | ~20 px | ~12 px | ~10 px | ~10 px | — |
| Size | 706×706 (65 % of the screen height) | ~108 px tall, 17 px gaps | — | ~60–64 px square | ~42 px tall, including descenders |
| Body | A white #F2FFFF inset with its own 6 px navy contour | — | — | — | — |

**Pattern strength** is the high-pass residual SD divided by the mean brightness. Measured:

| Source | Strength |
|---|---|
| Stud UI Pack header | **1.7 %** |
| Stud UI Pack card | **3.4 %** |
| Cartoon shop header | 2.3 % |
| Cartoony kit checker | 2.5 % |
| **Ours** (pass 9 / X3) | **4.6–5.6 %**, about twice too loud |

## 3. Tokens

All pixel values are at 1080p. Every thickness scales with `viewportHeight / 1080` (minimum 1.5 px), through one `StudKitScale` module. **Never hardcode a pixel stroke.**

### 3.1 Colour (start values; tune by sampling P01–P10, staying within ±8 % lightness)

| Token | Top | Mid | Bottom | Lip (solid) | Rim | Use |
|---|---|---|---|---|---|---|
| `contour` | #0B1A33 | | | | | **Every** outline and text stroke |
| `lime` | #B6F23A | #7FDB2B | #4FBF1F | #2E7D12 | #E3FFB0 | Buy, claim, confirm, money |
| `sky` | #6FE3FF | #33BFF5 | #1E8FE0 | #145A9E | #C9F4FF | Info, gems, Index, rare |
| `sun` | #FFE94D | #FFC22E | #FF9A1F | #B35E0E | #FFF6B8 | Upgrades, gold, legendary, Robux prices |
| `berry` | #FF6FB1 | #FF3D7F | #E0234F | #8E1235 | #FFC7DE | Shop header, close, hot offers, mythic |
| `grape` | #D18BFF | #A65BFF | #7B35E8 | #4B1C99 | #EED6FF | Rebirth, epic, gamepasses |
| `teal` | #5BF0D6 | #22D1B6 | #10A893 | #0B6B5E | #C6FFF4 | Settings, popups |
| `grey` | #E6EBF0 | #C9D2DB | #A9B4BF | #6B7785 | #F7F9FB | Common, disabled |
| `cloud` (window body) | #FBFDFF | | #E9F1F8 | — | #FFFFFF | **The default window body.** No navy bodies |
| `rainbow` | 6-stop UIGradient (red→orange→yellow→green→blue→purple), rotating slowly | | | | | Hero, secret, exclusive |

**Rarity convention:** common `grey`, uncommon `lime`, rare `sky`, epic `grape`, legendary `sun`, mythic `berry`, secret `rainbow`.

### 3.2 Geometry

| Element | Contour | Rim | Radius | Lip |
|---|---|---|---|---|
| Window | 6 | 5 | 22 | 0 (soft shadow: `contour` at 70 % transparency, offset +8) |
| Header bar | 6 (shared with the window) | 4 | 22 top | 0 |
| Card | 5 | 4 | 14 | 4 |
| Button | 4 | 3 | 12 | 6 (pressed: 2) |
| Chip / pill | 3 | 2 | height/2 | 3 |
| Close button | 4 | 3 | 12 | 5 |
| Icon tile (HUD) | 5 | 4 | 16 | 5 |
| Progress bar | 4 | 0 | height/2 | 0; fill has a 2 px top highlight |

### 3.3 Type
- **Font:** `FredokaOne` for everything. Body text is at least 18 px; labels 22–26; card titles 28–32; window titles 40–44; hero numbers 48–64.
- **Text colour:** white by default.
- **Strokes:** always `contour`. 5 px for 40 px and up, 4 px for 28–39, 3 px for 18–27. **Never a stroke in the face's own hue.**
- **Coloured text** (rarity labels, gold numbers): coloured fill plus a `contour` stroke.
- **Numbers:** always with thousands separators (12,500), or short forms (1.2K, 3.4M) above 99,999.
- **Currency:**
  - Robux is the glyph `\u{E002}` followed by the number. Check that it renders; if a font doesn't support it, use the set's `robux` icon.
  - Coins and gems use the icon set.
  - **Never "R$", never "Gems 100".**
- **At most 3 text sizes per window.**

### 3.4 Studs (the signature, but quiet)
- **Texture:** the current single-stud image `rbxassetid://7447638591` (from free decal 7447638611), tiled at 26 px (scaled).
- **Strength:** tune `ImageTransparency` until pattern strength (§9 metric) is **1.5–3.0 %** on headers, tabs, buttons and cards.
  - **Window body:** 1 % or less (or none).
  - **Behind text under 28 px:** none, or add a soft clean band behind the text.
- **Studs never replace contour, rim or gradient.** They are the last, faintest layer.

### 3.5 Banned
These are all failing lint (§9):
- translucent white "shine" bands;
- translucent black shadows (shadows are `contour` or a darker shade of the face);
- same-hue borders or strokes;
- navy or charcoal window bodies (unless the request says "dark");
- emoji in any TextLabel;
- the typed characters "R$" and "Gems N", and ">" used as an arrow;
- `ImageColor3` on full-colour icons;
- "Placeholder", "Coming soon", "Empty", "Item Name" in shipped text.

## 4. Components: layer recipes

Each component is one function in `apps/worker/src/studkit.ts` (rewritten), tagged `StudKit=<name>`. GLM picks components and fills text, numbers, token names, icon names and counts. **GLM never sets a colour, font, stroke, corner or size.**

### 4.1 Face (shared by every coloured surface)
```
Holder (BackgroundTransparency 1)
├─ Lip      Frame: colour = token.lip, Position +lip px, UICorner, UIStroke contour
└─ Face     Frame: UIGradient token.top→mid→bottom (Rotation 90), UICorner, UIStroke contour (Border)
   ├─ Rim     Frame inset by rim px, transparent, UIStroke rim px token.rim  (the band just inside the contour)
   ├─ Studs   ImageLabel tiled, tuned per §3.4, clipped (UICorner)
   ├─ Pattern optional: rays (§4.9) or diagonal stripes (UIGradient hard-step ColorSequence at 45°, 6 % contrast)
   └─ Content
```
Check every component with a zoomed capture. From outside in, the edge must read: navy contour, then pale rim, then gradient. If `UIStroke` draws outside the frame in this engine version, the rim frame is inset by exactly the rim thickness. If `BorderStrokePosition` exists, use `Inner` for the rim.

### 4.2 Window
- **Sizing and position:** 56–68 % of the screen height, centred, with a 2.5 % screen-height gap from the HUD.
- **Behind it:** a `BlurEffect` of size 8 on the world.
- **Header:** the token face with studs. The title is left-aligned and white with a navy stroke, with a 1.3× title-height icon that breaks the header's top-left edge by 30 %.
- **Close button:** `berry`, square, sitting on the top-right corner, half outside the frame.
- **Body:** the `cloud` face with its own 5 px navy contour, inset 14 px.
- **Content:** fills at least 80 % of the body. No orphan rows (see §5).
- **Scrolling:** show a visible scrollbar (8 px, `contour` thumb with a `sky` fill) **and** a 24 px bottom fade.

### 4.3 Button
- **States:**

  | State | Look |
  |---|---|
  | Primary | `lime` |
  | Secondary | `sky` |
  | Purchase | `lime` with the Robux glyph |
  | Gift | `sky` with the gift icon |
  | Danger | `berry` |
  | Disabled | `grey` + a lock icon; shakes when clicked |

- **Content:** `[icon] label` or `[glyph] number`, centred, with a gap of 0.25× the height.
- **Press:** the face moves down by (lip − 2) px and the lip shrinks to 2 px; 50 ms down, 90 ms back.

### 4.4 Card (item / offer)
- **Background:** a rarity token face, with a rays pattern behind the icon.
- **Icon:** 45–55 % of the card's height. It may break the card's top edge by up to 20 % of its own height, and **never into another card's text**.
- **Layout, top to bottom:**
  1. the rarity label (small, coloured);
  2. the name (white);
  3. one line of effect text (white, 18–20 px);
  4. the price button, full width minus the padding.
- **In one row:** all cards are the same height; text is centred or left-aligned, never both.

### 4.5 Hero card (one per screen when the request has a "featured" or "best" item)
- **Size:** spans the full width, 1.6–2× a card's height.
- **Background:** `rainbow` or the rarity face with a **rotating rays** layer and a **shine sweep** every 3.5 s.
- **Icon:** 70 % of its height, bobbing ±4 px.
- **Badge:** "NEW!" or "BEST VALUE", a `sun` ribbon tilted −8°.
- **Price:** a large `lime` price button.

### 4.6 HUD
- **Left column:** icon tiles (`StudKit=tile`), 2 columns × up to 3 rows. The icon takes 80 % of the tile and the label overlaps the tile bottom with a navy stroke.
- **Currency stack (bottom left):** each currency is a pill: icon (overflowing left) + number + a small `lime` "+" button on the right.
- **Top centre:** up to 3 tabs (`StudKit=tab`) with icons.
- **Hotbar:** empty slots are clean (no "Empty" text) and show only the slot number.
- **Reserved zones:** the Roblox top bar (58 px) and the bottom-centre safe area on mobile.

### 4.7 Toast
- **Look:** a `sun` / `lime` / `sky` pill: the icon breaks the left edge, then "+250" in large type and "Coins" in small type.
- **Motion:** stacks bottom-right, slides in from the right in 0.25 s, holds 3 s, fades out.

### 4.8 Small parts
| Part | Recipe |
|---|---|
| Progress bar | `contour` track with a token fill and a 2 px highlight; the number sits **outside** the bar (right) unless the bar is 28 px or taller |
| Toggle | Pill switch: `lime` when on, `grey` when off; the knob is a white circle with a contour |
| Slider | Track as the progress bar; knob 1.2× the track height |
| Text input | `cloud` face, navy contour, placeholder text at 50 % opacity |
| Badge | A circle or ribbon **on** a frame edge (centred on the edge line): "!", the number of new items, "x2", "NEW!" |

### 4.9 Rays (procedural, no image needed)
- **Construction:** a `CanvasGroup` with 14 thin `Frame` wedges, white at 0.86 transparency, rotated 360/14° apart around the centre, behind the icon.
- **Motion:** rotates once every 18 s on hero cards; static on normal cards.

## 5. Layout rules
1. **Grid:** 8 px (scaled). Window padding 20, gaps 14–18.
2. **Rows:** no orphan rows. If the item count doesn't fill the last row, use a hero row, a 2-wide card or centred full rows. **Never a lonely card next to empty space.**
3. **Fill:** content covers at least 80 % of the window body. Empty bands taller than 15 % of the body fail.
4. **Overlaps:** nothing overlaps except declared overflow (icons, badges, close buttons). Overflow never covers another element's text or button.
5. **The HUD stays visible:** windows never cover it (the 2.5 % gap). Toasts never overlap a window.
6. **One hero per screen,** at most.
7. **Before→after screens** (rebirth, upgrade) show two cards and an arrow icon, not text rows.
8. **Mobile:** the same layout at 844×390 must not clip text. Use `UIScale` + `UIAspectRatioConstraint`; minimum text 14 px on a phone.

## 6. Icons and UI art (decision S2-2 / rule L1)

### 6.1 Sourcing: human-made, licensed, one family per screen
- **Allowed sources:**
  - **Roblox Creator Store public images** from a *single* creator or pack (licence: Roblox Terms for Creator Store content);
  - **Kenney** (CC0): Game Icons, UI Pack, Board Game Icons, Emotes. They are already in `packages/asset-library/packs/`;
  - **game-icons.net** (CC-BY 3.0, 4,000+ icons; attribution required);
  - **OpenGameArt and itch.io packs only when they are CC0 or CC-BY**;
  - packs whose licence **explicitly allows redistribution inside other people's games**.
- **Forbidden:**
  - anything made by GLM, Claude or any AI image tool;
  - packs with "personal use", "no redistribution" or "NC" licences (most paid UI packs, including the BuiltByBit kits used as *references* here);
  - IP or brand characters;
  - ripped game assets.
- **Consistency rule:** a screen uses **one icon family** (one creator or pack). Families are graded A/B/C by two fresh critics against anchors P01–P10. Only A/B families are used in UI.
- **The cartoon 3D icon gap:** v1 needs a consistent, glossy, outlined family of about 60 objects, including patterned eggs.
  1. Search with the deep-research skill: Creator Store creators who publish whole icon sets, and CC0 packs.
  2. If no free, human-made family reaches grade A, put an owner decision in `BLOCKED.md`: "commission a human icon artist with a commercial redistribution licence (budget X)". Do not fall back to AI.
- **Provenance:** every icon carries its source URL, author, licence, licence URL, fetch date and file hash in `packages/library/` (see the master prompt). CC-BY items are listed on a credits page and in a `StudPilotCredits` module inserted into the user's game.
- **Approval:** a contact sheet of the chosen family on `cloud`, `sky` and dark backgrounds goes to the owner with the 6-screen check (S2-3).

### 6.2 Publishing (one time, for files that are not already on Roblox)
Owner steps go in `BLOCKED.md` (Claude Code writes the exact clicks):
1. Use or create a Roblox group named "StudPilot". **Creating a group costs 100 Robux**, so it needs the owner's "yes" first.
2. Check the group's **Asset Privacy**. Groups created after 2026-05-05 make new images Restricted by default. Either turn it off for the group before uploading, or mark each item **Open Use** (permanent). Claude Code checks the current Roblox docs first.
3. Create a group Open Cloud API key with asset read/write. Put it in `.env` as `ROBLOX_GROUP_ASSETS_KEY` and `ROBLOX_GROUP_ID`.

Then Claude Code:
1. Uploads with `creationContext.creator.groupId`.
2. Waits for moderation.
3. Records the IDs in the library.
4. **Proves each item loads** in a brand-new place owned by a different account.

This is not the owner's personal account, so D-3 stands. Assets already on the Creator Store are used by their existing IDs (no re-upload).

### 6.3 Before publishing (development only)
For Studio previews only, copy PNGs into Roblox Studio's local `content/textures/studpilot/` folder and use `rbxasset://textures/studpilot/<name>.png`. This works only in Studio on that Mac. **Never ship it.**

### 6.4 Items the user built (pets, eggs, tools in their place)
Shop and inventory cards show the **real 3D model** in a `ViewportFrame`:
- **Background:** on rays.
- **Motion:** rotating once every 8 s.
- **Outline:** a navy silhouette made by placing a 1.06× scaled duplicate behind the model in `contour` colour.

This gives every egg its own look with no upload. It is the default whenever the item exists in the place.

## 7. Motion (always on; this is the "life" score)
| Event | Motion |
|---|---|
| Window open | Scale 0.85→1, Back Out, 0.22 s, plus fade in |
| Window close | Scale 1→0.9, fade out, 0.12 s |
| Hover | Scale 1.05, 0.08 s |
| Press | Face sinks (§4.3) |
| Hero | Rays spin, shine sweep every 3.5 s, icon bob ±4 px over 1.6 s |
| Number change | Count up over 0.4 s, plus a "+N" pop that rises 30 px and fades |
| Unaffordable click | Shake ±6 px, 3 times, 0.25 s |
| New item | The badge pulses 1.0↔1.12 |

## 8. Capture (what the critic and the owner see)
- **Place:** **Play mode** on the **Showroom place**: Bible §4 candy-day lighting, studded ground, a few props. Reset before every capture: **no leftover GUIs**. Run `scripts/eval/reset-showroom` and fail if any `ScreenGui` is not from this build.
- **Resolutions:** **1920×1080** (Studio device emulation at scale 1) **and** 844×390 (phone).
- **Shots, per UI request:**
  - closed HUD;
  - each window open (via `proofOpen`);
  - one hover;
  - one press;
  - a hero frame at t=0 and t=1.75 s (to prove the motion).

## 9. Automatic gates (all must pass before any critic runs)
Use `scripts/eval/ui-metrics.py`, copied from the planner's `ui-critique/ui-metrics.py`. It crops the window and resizes it to 480 px wide. The thresholds were validated on 2026-10-06: **all 9 reference screens pass and all 6 StudPilot builds fail.**

| Metric | Pass | References | Ours today |
|---|---|---|---|
| Contour coverage (strong edges with a dark pixel within 2 px) | ≥ 0.88 | 0.89–1.00 | 0.18–0.87 |
| Edge strength (mean FIND_EDGES) | ≥ 34 | 34–57 | 26–37 |
| Dark share (V < 0.3) inside the window | ≤ 0.20, unless the request says "dark" (`--dark-ok`) | 0.01–0.20 | 0.12–0.30 |
| Stud/pattern strength on header, tab, button and card areas | 1.5–3.5 % | 1.7–3.4 % | 4.6–5.6 % |

These gates are a floor, not proof of quality. Re-validate the thresholds whenever anchors are added.

`scripts/eval/luau/kit-lint.luau` fails a build on any of these:
- emoji in any text;
- "R$", "Gems <n>" or ">" used as an arrow;
- a stroke colour within ΔE 25 of its parent face;
- any translucent white frame covering more than 15 % of a face;
- an untagged visible GuiObject;
- an icon image smaller than 2× its on-screen size;
- `ImageColor3` on a non-tintable icon;
- overlapping text or button rectangles that aren't declared overflow;
- a `ScrollingFrame` with hidden overflow and no scrollbar or fade;
- body fill under 80 %;
- text under 18 px at 1080p;
- a banned string (§3.5).

## 10. Critic v3 (replaces Bible §7)
1. **Two fresh critics.** The lower score counts. **Never the session that built it.**
2. **What they see:** anchors P01–P12, then the anti-references marked "never like this", then the build's shots.
3. **Absolute score:** style 0–10 against **these 8 signatures**, each graded present / weak / missing:
   1. a navy contour everywhere;
   2. a pale inner rim;
   3. gradient faces with solid lips;
   4. faint studs;
   5. white text with navy strokes and real currency glyphs;
   6. one consistent human-made icon family, big;
   7. one hero and a clean, full grid;
   8. visible motion.

   **Pass:** style ≥ 8 with **no** weak and **no** missing.
4. **Pairwise blind test.** 10 trials per kit check, 4 per request run.
   - **Each trial:** our screen and an anchor of the same screen type, in random left/right order with no labels.
   - **Question:** "Which one is from a top Roblox game?"
   - **Pass:** ours is picked at least 35 % of the time (indistinguishable range).
5. **Defect hunt:** each critic must list **at least 10 defects with coordinates**, or explain why fewer exist. A list with fewer than 10 and no reason is invalid.

## 11. Owner eye check (S2-3)
Before any agent build uses the kit, send the owner 6 screens at 1920×1080 on the Showroom:
1. Shop;
2. Egg shop;
3. Inventory;
4. Daily rewards;
5. HUD;
6. Settings.

Also send the icon contact sheet. The owner answers "yes" or "change X". **Nothing else proceeds until he says yes.**

## 12. Acceptance for M5a-v2
1. Every §9 gate passes on the kit showcase and the 6 screens.
2. Both critics give ≥ 8 with no weak signature, and the pairwise test passes.
3. The owner says yes (§11).
4. Then re-run U01–U15 through the real agent. Report the pass count, the median of every area, and the pairwise rate.
