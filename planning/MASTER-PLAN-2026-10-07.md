# STUDPILOT MASTER PROMPT: the owner's final order (2026-10-07)

Paste target: the ongoing Claude Code session in `~/Developer/StudPilot`.
- **Where this wins:** over every earlier order, plan section, handoff step, CONTRIBUTING rule and Style Bible section that conflicts with it.
- **Where it doesn't:** the owner's latest message in chat wins over this file.
- **Plan of record:** copy this file to `planning/MASTER-PLAN-2026-10-07.md` in your first commit.

---

## 0. How you work from now on

1. **Models.**
   - **Main session:** Claude Opus 5.5.
   - **Every subagent, workflow agent and critic:** `model: opus` (Opus 5.5). Set `model: opus` in every `.claude/agents/*.md`.
   - **Quota:** this is the owner's choice and it burns the weekly quota faster. If the quota gets low, stop at a clean point and say so. Never silently drop to a smaller model.
2. **Research.**
   - **Tool:** the **deep-research skill** (`/deep-research`) for every library category in §4 and for every open question about Roblox rules, APIs or licences.
   - **No early stop:** don't stop at 5 sources or 10 "suggested packs". Keep researching until each category's target in §4.3 is covered by real, licensed, human-made items.
   - **Fallback:** if the skill is missing, use WebSearch and WebFetch with the same depth, and say so once.
3. **Multi-agent work.**
   - **Allowed (the owner opts in)** for library research, ingestion, grading and evaluation.
   - **Not allowed:** reviewer swarms on code PRs. One self-review per PR; CI does the rest.
4. **Autonomy.** Work through §8 in order without stopping, except at:
   - the owner eye checks (§6.6, §4.7 and §7);
   - money (any purchase, including 100 Robux for a group);
   - legal questions;
   - owner-only clicks.

   Put each of these in `planning/proof/BLOCKED.md` in plain clicks, then **keep working on everything that doesn't depend on it**.
5. **Still in force:**
   - CONTRIBUTING.md (PR shape, CI fast path, no Dependabot until M7);
   - the GLM spend caps;
   - the public-repo secret rules;
   - D-3 (never upload to the owner's personal Roblox account; never set `ROBLOX_CREATOR_USER_ID`);
   - **no AI training on Roblox data**;
   - the hidden test set only at M7.
6. **API keys:** use only the scoped group key(s) the owner creates (§4.5). Never ask for a full-access or personal-account key, never print a key value, and never write one anywhere except `.env`.
7. **Daily report to the owner (10 lines max, plain words):**
   - items added per library category against target;
   - the pass counts (dev, breadth, hidden);
   - what is blocked;
   - what's next.

---

## 1. Why: the critique (read it all before writing code)

Files are in `~/Desktop/untitled folder 2/ui-critique/`:
- `STUDPILOT-UI-CRITIQUE.md`;
- `OURS-vs-TOP.jpg`;
- `X3-annotated.jpg`, `X4-annotated.jpg`, `KIT-pass9-annotated.jpg`;
- `ui-metrics.py`;
- `STUDPILOT-UI-SPEC-v2.md`.

The references are in `../web-refs/` (292 images).

### 1.1 Product-level critique (the owner's words, and he is right)
StudPilot today is **a custom LLM for a few things, not an agent that can make anything**. It knows:
- about 25 tools;
- 10 UI blocks;
- a handful of system and world blocks;
- 39 icons from 38 different uploaders;
- emoji.

Anything outside that falls to GLM writing free-form code, which fails. **The M3 baseline was 0 of 20.** Since then, every M5a render and run has failed too.

A real product needs **breadth**: tens of thousands of real assets, sounds, effects, animations, maps, systems and documented know-how that the agent can **search, insert, place and verify**. The model doesn't "contain" them; it retrieves them. **This is now the core of the product (§4).**

### 1.2 UI critique (measured)
- **The numbers.** A cartoon outline exists on 0.89–1.00 of strong edges in every top game and 2026 kit, and on 0.18–0.87 of ours. The "style 8" kit scores **0.18**. Our edges are about 40 % softer, and our studs are about 2× too loud (4.6–5.6 % against 1.7–3.4 %).
- **Root causes:**
  1. a Web 2.0 recipe: translucent white shine bands, borders in the fill's own hue, translucent black shadows;
  2. studs as wallpaper;
  3. navy window bodies;
  4. emoji and mismatched icons; the egg, the core item, is flat jagged clip art or the same yellow egg seven times;
  5. layout collisions and dead space;
  6. no motion;
  7. every screen is the same template;
  8. captured on a dirty Baseplate test place.
- **Process causes:**
  1. a critic shown only three references, which never saw a top game;
  2. self-grading;
  3. edit-mode captures at 1174×623;
  4. answering "gloss weak" by stacking more translucent layers;
  5. known-ugly assets parked in `LATER.md` and shipped anyway.
- **The planner's own errors (owned):** the Style Bible made studs mandatory and asked for same-hue borders; the handoff asked for a "dark-blue translucent body"; the pass rule was lenient.

### 1.3 What not to do (ever again)
- grade your own work;
- "fix" a critic's note by adding a layer;
- show the owner anything you already know is ugly;
- invent content;
- claim a visual result ("looks great", "verified") in a reply.

---

## 2. StudPilot at 100%: what the finished product is

**One line:** *Tell StudPilot what you want in your Roblox game, and it builds it inside your own Studio, from one button to a whole world. It uses a library of more than 70,000 real, licensed, human-made assets and Roblox's official know-how, then proves the result works.*

### Who it's for
- **Who:** Roblox creators aged 13 and up, beginners and pros, solo developers and small teams.
- **Platform:** PC first, because Studio is a desktop app. The games it builds also work on phones.

### What you can ask
**Anything a Roblox game needs, any size:**

| Area | Examples |
|---|---|
| Worlds | Maps, zones, whole worlds (candy land, haunted forest, neon city, sky islands, mines, beaches, castles) |
| Props | Props and set dressing |
| Screens | Any UI (shops, egg shops, HUDs, inventories, rewards, quests, settings, codes, leaderboards, loading screens) |
| Systems | Currency, saving, shops, pets, eggs, rebirth, quests, rounds, tycoon droppers, obby checkpoints, combat basics, NPC behaviour, vehicles, tools, trading basics, gamepasses, badges |
| Characters | NPCs and creatures with animations |
| Effects and audio | Visual effects; sound effects and music; lighting and mood |
| Edits | "Make it spookier", "fix the shop layout", "add sounds to everything" |

**Big asks** ("make me a pet simulator") become a **plan of many parts** that StudPilot builds one after another, each verified. It never pretends a one-shot game is finished.

### The experience
1. Sign in with Google, Discord, email or Roblox. You land **straight in the chat**: no dashboard.
2. Pair Studio once with a 6-character code. A green light shows it's connected.
3. Type what you want. StudPilot asks **at most one** question, then shows a short plan: what it will build and which library items it will use.
4. It builds live in your Studio. A checkpoint comes first, and each step appears in the chat.
5. It play-tests, captures screenshots and checks for errors.
6. **The reply:** what was built, where it is, anything it couldn't do (honestly), and the credits used.
7. You can **undo** any build, or ask for changes.

### Under the hood
- **Build model:** GLM 5.3 Flash. It is cheap and sits behind one switch.
- **The StudPilot Library (§4):** search, insert, place.
- **Skills:** step-by-step procedures taken from Roblox's official tutorials and open-source code, with citations.
- **The renderer:** StudKit draws every UI in the **Premium Studs** look (UI Spec v2).
- **Placement and assembly code:** scatter, along-path, grid, snap, fit, family-consistent picks.
- **Verification:** play test, lints, UI metrics, a claim audit. Fresh Claude critics are used for evaluation only.

### Quality
Every build meets the bar:
- two fresh critics give **8 or more in every area, including style**;
- the pairwise test against top games is **at least 35 %**;
- **0** play-test errors;
- **0** false claims.

At M7 the dev set (60), the breadth set (300) and the hidden set (40) pass.

### Speed and price
- **Speed:** a typical request takes 2–5 minutes; the maximum is 10.
- **Price:** credits. Free gives 5 a day, up to 30 a month. Pro is $9.99 for 100, Max $24.99 for 300, and a pack $4.99 for 50. **Charging starts only** after the bar is met **and** an adult holds Stripe.

### Trust and safety
- **Content:** 13+. Rule-breaking and mature requests are refused.
- **Assets:** only licensed, human-made assets, with credits. Internet scripts are never inserted unaudited.
- **Uploads:** only to the user's own account, or StudPilot's public group assets.
- **Data:** no AI training on Roblox data.

### Website and app
- **Home hero:** a headline, one line and **"Start building"**. **Nothing else in the hero:** no kits, no renders, no "built with", no galleries.
- **Pages:** Pricing, Docs, Privacy, Terms, Sign in.
- **The app:** it is the chat.

### What it is NOT
A kit store, a template seller, or "one sentence, one finished hit game". **The word "kit" never appears in public copy.**

Write this section, unchanged in meaning, to `planning/STUDPILOT-100.md`. It is the north star. Every milestone must move a number toward it.

---

## 3. Architecture shift: library first

1. **The flow:**
   1. GLM gets a request.
   2. It calls `library_search` (meaning first, then filters).
   3. It picks from **pre-graded top-k cards** (A/B items only, one style family per area).
   4. It calls `library_insert` and the placement tools.
   5. It wires behaviour with blocks and open-source modules.
   6. The system verifies the result.
2. **Tool budget:** keep to 25 tools or fewer by folding modes into a few tools:
   - `library_search(query, kind, family?, theme?, limit≤12)`;
   - `library_insert(id, target, placement)`;
   - `place(mode: scatter|path|grid|snap|fit, …)`;
   - `audio(kind: sfx|music, …)`;
   - `vfx_attach(…)`;
   - `anim_apply(…)`.
3. **Search cards give GLM text, never pictures:** id, title, kind, family, theme tags, size in studs, triangle count, colours, grade, licence class and a one-line description. GLM is blind, so the **grading and families** carry the visual quality.
4. **The boundary:**
   - **Product code (yours, allowed):** the engine, blocks, StudKit, placement code, verification, and the glue code GLM writes per build.
   - **Library content:** **never** made by you or GLM (§4.1).

---

## 4. The StudPilot Library: build it now, at full scale

### 4.1 Rules (L1–L9). No exceptions.
- **L1 Human-made only.** Every item is made by people and comes from a real source.
  - **Banned:** anything generated by GLM, by Claude (you), or by any AI tool (image, 3D, audio, text, or Roblox's own AI generators).
  - **Check:** reject items whose title, description or tags mention AI, Cube, Assistant, Meshy, Tripo, Luma, Midjourney, DALL·E, Stable Diffusion or "generated". For uploads from 2024 onward, require a known human creator or studio.
  - **Record:** keep an `ai_check` record per item. Two fresh critics spot-check 200 random items. If AI is found, drop that **source** and resample.
- **L2 Licensed for our use.** The item may be used inside **other people's** commercial Roblox games, and provided by StudPilot.

  | | Licences |
  |---|---|
  | **Allowed** | Roblox Creator Store public assets (used by ID); Roblox-licensed audio (APM Music library: free inside Roblox only, up to 250 licensed tracks per game; never downloaded); CC0; CC-BY 3.0/4.0 (with attribution); MIT, Apache-2.0, BSD (code); OFL (fonts); Roblox-owned avatar animations and emotes |
  | **Banned** | NC or ND licences; "personal use"; "no redistribution" (most paid packs, including the BuiltByBit kits used only as *references*); **Mixamo** (its FAQ forbids redistributing raw animation files); libraries whose licence forbids giving raw files to others (verify each, for example the Sonniss GDC bundles); unknown licences |

- **L3 Provenance per item:**
  - source URL, author and licence (with licence URL);
  - the fetch date and the file hash, or the Roblox asset ID;
  - the attribution text;
  - who uploaded it (`creator_store` | `studpilot_group` | `user_account`).
- **L4 Safety.**
  - **Scripts:** strip every Script, LocalScript and ModuleScript from Creator Store models by default. Scan for and reject:
    - `require(<number>)`;
    - `getfenv` / `setfenv` / `loadstring`;
    - obfuscation;
    - `HttpService`;
    - `MarketplaceService` prompts;
    - `TeleportService`;
    - `InsertService`.
  - **Junk:** remove hidden, tiny or inside parts, auto-playing sounds and over-budget part counts.
  - **Content:** maturity Minimal or Mild only (13+).
  - **IP:** no trademarked or brand characters, no ripped game assets, no real-world logos.
- **L5 Quality grades (A/B/C).**
  - **Automatic checks:** triangle count, texture size of at least 512, scale normalised to studs, pivot, no z-fighting, materials set.
  - **Visual grade:** two fresh critics grade **from thumbnails** against the UI Spec v2 anchors (for UI art) or the Bible §4 world anchors (for 3D).
  - **Only A/B reach GLM.** C is kept out.
- **L6 Families.** Group items into **style families** (one pack or one creator style). One area or screen uses one family. This fixes the "ransom note".
- **L7 Searchable.**
  - **Metadata:** in D1 (`library_items`).
  - **Embeddings:** in a new Vectorize index `studpilot-library`, for search only, **never training**.
  - **Previews:** thumbnails (the Roblox thumbnail API for Roblox assets; renders for imported files).
  - **Binaries:** imported files live in R2 `studpilot-media/library/`, **never in git**.
  - **Metadata you may write:** tags and descriptions from the item's own source data and thumbnail. **Inventing items is never allowed.**
- **L8 Insertable.** Every item is proven to load in a **fresh place owned by a different account** (a batch harness). Failures are removed.
- **L9 Roblox rules.**
  - Use only official APIs (Open Cloud, including the **Creator Store / Toolbox Service** API for searching meshes, models and audio). Respect rate limits.
  - Cached Roblox data is wiped if API access is lost.
  - **Animations are owner-locked:** only Roblox-owned animations play in any game. Other animations (CC0) must be **uploaded into the user's own account** through OAuth. Verify the current rules with deep research first.
  - **New group images are Restricted by default** since 2026-05-05. Use group Asset Privacy off or Open Use; verify first.

### 4.2 Sources: starting points, not limits
Deep research must **expand every row** until the target is met.

| Area | Starting sources |
|---|---|
| Models and props | Roblox Creator Store (Toolbox Service API) and Roblox official templates and sample places. **Kenney 3D kits** (CC0: City, Nature, Castle, Pirate, Space, Racing, Holiday, Furniture, Food, Platformer, Survival, Graveyard, Train, Tower Defense, Fantasy Town, Car, Watercraft, Building, Mini Dungeon). **Quaternius** (CC0: Ultimate Nature, Stylized Nature MegaKit, Medieval Village, Fantasy Props, Modular Sci-Fi, Animated Animals, Ultimate Monsters, Platformer, Cyberpunk, Pirate, Space, Farm, Food, Universal Animation Library). **KayKit by Kay Lousberg** (CC0: Dungeon, Adventurers, Skeletons, City Builder, Forest, Halloween, Holiday, Furniture, Restaurant, Space Base). Poly Haven models (CC0). Sketchfab and OpenGameArt filtered to CC0/CC-BY |
| Textures, materials, skies | Poly Haven and ambientCG (CC0) → MaterialVariants; Poly Haven HDRIs (CC0) converted to 6-face skyboxes; Creator Store skyboxes |
| UI art | Creator Store icon sets from **single** creators; Kenney UI, Game Icons, Board Game Icons and Emotes (CC0; already in `packages/asset-library/packs`); **game-icons.net** (CC-BY 3.0, 4,000+); OpenGameArt and itch.io CC0 packs; fonts from Roblox's font library |
| VFX | Creator Store particle/beam/trail effects (scripts stripped); Kenney Particle Pack (CC0); OpenGameArt CC0 particle textures |
| SFX | Roblox Creator Store audio (public and Roblox-licensed); Kenney audio packs (CC0); Freesound (CC0, plus CC-BY with attribution) |
| Music | Roblox's licensed APM Music library (inside Roblox only, by ID) |
| Animations | Roblox-owned animation packages and emotes; Quaternius Universal Animation Library (CC0, uploaded per user); other CC0 or permissive mocap (verify the licence). **No Mixamo** |
| Code | Roblox creator-docs code samples (**CC-BY-4.0**). Open-source Luau under MIT/Apache/BSD: ProfileStore/ProfileService, Knit, Promise, GoodSignal, Trove, Janitor, ZonePlus, TopbarPlus, Cmdr, Fusion, react-lua, FastCast, RaycastHitbox, Iris (verify each licence). roblox-ai-studio and robloxstudio-mcp (MIT). The stud repo stays **ideas only** (AGPL) |
| Knowledge | The whole **Roblox/creator-docs** repo (CC-BY-4.0): guides, tutorials, the engine API reference. Luau docs and RFCs (luau-lang). Roblox Terms, Community Standards and monetization rules (linked and quoted minimally) |
| Skills | Converted **verbatim** from official step-by-step tutorials (creator-docs) and open-source agent skill repos with permissive licences. Each step keeps its citation. A format change is allowed; new content is not |
| Templates | Roblox official Studio templates; open-source places whose licence explicitly allows reuse |

### 4.3 Targets (A/B-graded, licensed, safe, load-tested, indexed)

| # | Category | Target |
|---|---|---|
| 1 | Props and models (40+ themes) | 10,000 |
| 2 | Modular building sets (walls, floors, roofs, paths, fences, bridges, stairs) | 150 families / 5,000 parts |
| 3 | Complete maps and environments | 300 |
| 4 | Characters, NPCs, creatures, pets | 1,500 |
| 5 | Vehicles and mechanisms (doors, lifts, conveyors, droppers) | 400 |
| 6 | Textures, materials, terrain presets | 1,000 |
| 7 | Skies and lighting/atmosphere presets | 300 skies + 100 presets |
| 8 | UI art: icons in **≥ 10 consistent families** | 8,000 icons + 500 frames, buttons, bars and badges |
| 9 | Fonts (Roblox-available, tagged by mood) | all |
| 10 | VFX (hits, explosions, auras, magic, weather, portals, rewards, confetti, sparkles, trails) | 2,000 |
| 11 | SFX (UI, coins, hatch, hits, footsteps, ambience, animals, vehicles, magic, sci-fi, horror) | 30,000 indexed |
| 12 | Music (mood, genre, BPM, loopable) | 10,000 indexed |
| 13 | Animations (idle, walk, run, jump, emotes, combat, tool use, NPC gestures, creature motion) | 1,000 |
| 14 | Code modules (systems and utilities) | 300 |
| 15 | Knowledge | 100 % of creator-docs + API reference + Luau docs |
| 16 | Skills (source-backed procedures) | 500 |
| 17 | Game templates and starters | 50 |

**The total is about 70,000 items, or 100,000+ with the full audio index.** If a target proves impossible within the L-rules, deep research must prove it with numbers. Write the gap and the options in `BLOCKED.md` for the owner, for example "commission a human icon artist (budget X)". **Never fill a gap with AI.**

### 4.4 Pipeline (`packages/library/`; metadata in git, binaries in R2)
1. **discover:** deep research and the Toolbox Service API, writing a sources ledger (`planning/library/SOURCES.md` + `planning/library/research/<category>.md`).
2. **licence check:** an automatic whitelist (`licenses.json`).
3. **fetch.**
4. **sanitize:** L4.
5. **normalize:** scale, pivot, materials, FBX→MeshPart import.
6. **grade:** L5.
7. **family:** L6.
8. **index:** L7.
9. **publish:** files not already on Roblox go once to the StudPilot group (Open Use), within upload limits.
10. **load-test:** L8.
11. **credits:** CC-BY attribution goes to a `StudPilotCredits` module inserted in the user's game, and to `studpilot.app/credits`.

### 4.5 Owner steps (write them to `BLOCKED.md` as plain clicks)
1. **The group:** create or choose a "StudPilot" Roblox group. Creating one costs **100 Robux**, so ask for a yes.
2. **Asset Privacy:** set the group's Asset Privacy to off, or use Open Use. Verify the current clicks first.
3. **The API key:** create a **group** Open Cloud API key with **only** the scopes the pipeline needs (Assets read and write; add others later, one by one, with a reason). The owner pastes it into `.env` himself as `ROBLOX_GROUP_ASSETS_KEY` and `ROBLOX_GROUP_ID`. **Never request or use a full-access key on the owner's personal account (D-3).**
4. **The Toolbox Service key:** if the Creator Store / Toolbox Service API needs one, create it.
5. **Workflow size:** if Claude Code's workflow size limit blocks the research agents, the owner raises "Dynamic workflow size" in `/config`.

### 4.6 Library acceptance tests

| Test | Pass |
|---|---|
| L-A1 Count | Every category reaches its §4.3 target (report table) |
| L-A2 Licence | 100 % of items have a source, licence and licence URL; 0 banned licences |
| L-A3 Human-made | 100 % have an `ai_check`; a 200-item sample reviewed by 2 fresh critics finds 0 AI items |
| L-A4 Safety | 100 % sanitized; 0 unaudited third-party scripts reach a user's place; a 300-item maturity sample is clean |
| L-A5 Load | 100 % load in a fresh place owned by another account |
| L-A6 Retrieval | 500 frozen queries: the top 5 contain a correct, on-style item ≥ 90 % of the time (fresh critic with thumbnails); multi-item requests are family-consistent ≥ 95 % of the time |
| L-A7 Owner boards | 17 category boards (48 random A-items each) go to the owner, who answers yes or no per board |

### 4.7 Owner eye check for the library
Send the L-A7 boards and the chosen UI icon family's contact sheet. Nothing new reaches GLM until the owner has said yes to its board.

---

## 5. Evaluation sets

- **Dev set:** the 60 frozen requests (unchanged).
- **Breadth set: new, written first and frozen before any library work.**
  - **Contents:** **B001–B300**, covering all 17 categories and mixes. Examples: "spooky forest zone with fog, owl hoots and fireflies", "a sword with a slash effect and sound", "an NPC that waves when you come close", "a race track with a countdown and finish music", "make the lobby feel like winter".
  - **Freezing:** commit only its sha256 in `planning/TEST-SET-BREADTH.sha256`, and keep the text in `private/`.
- **Hidden set (40):** from the owner, at M7 only.
- **The bar:** for every run, critic v3 (UI Spec v2 §10; two fresh Opus critics, the lower score counts), plus the play test, the claim audit and the §9 metrics. **Never self-graded.**

---

## 6. UI reboot (UI Spec v2: Premium Studs)

1. **Docs:**
   - copy `STUDPILOT-UI-SPEC-v2.md` to `planning/UI-SPEC-v2.md`;
   - copy the critique to `planning/proof/STYLE/CRITIQUE-2026-10-06.md` (text only);
   - copy `ui-metrics.py` to `scripts/eval/ui-metrics.py`;
   - mark Style Bible §3, §6.2 and §7 superseded.

   The anchors, anti-references and web-refs go to `private/style-refs/` and private R2. **Never commit someone else's game images.**
2. **Showroom and capture:**
   - a clean Showroom place, with `scripts/eval/reset-showroom` failing if any foreign ScreenGui exists;
   - **Play mode** captures at **1920×1080 and 844×390**;
   - no edit-mode renders, no 1174×623.
3. **Gates:** run `ui-metrics.py` (contour ≥ 0.88, edge ≥ 34, dark ≤ 0.20, stud pattern 1.5–3.5 %) and `kit-lint.luau` (every rule in spec §9) before any critic.
4. **Rewrite `apps/worker/src/studkit.ts` exactly to spec §3–§5:**
   - one contour colour, `#0B1A33`, on every face and text stroke;
   - a pale inner rim;
   - 3-stop gradients;
   - solid lips;
   - the `cloud` body;
   - studs measured to 1.5–3.5 %;
   - `StudKitScale`;
   - procedural rays;
   - the Robux glyph `\u{E002}`;
   - all motion from spec §7.

   **Delete:**
   - the white shine band;
   - the translucent black shadow;
   - same-hue borders;
   - the navy `#16233F` body;
   - every emoji glyph fallback.
5. **Icons:**
   - **only a human-made family** from the library (spec §6.1); delete the 39 community icons;
   - user-built eggs, pets and tools show as real 3D models in `ViewportFrame`s (spec §6.4).
6. **Owner eye check:**
   - **Send:** 6 screens at 1920×1080 on the Showroom (shop, egg shop, inventory, daily rewards, HUD, settings), plus the icon family sheet.
   - **STOP** until the owner says yes.
7. **Then** re-run U01–U15 through the real agent. Report the pass count, the area medians, the pairwise rate and the 3 worst defects.

---

## 7. Website: hero rule

The live site (#109–#111) has a hero "Studio window" with tabs ("Egg shop / Main menu / Shop with HUD") and the caption "Rendered by StudPilot's kit in Roblox Studio". It also has a "What it builds" gallery of kit renders. **The owner rejects all of it.**

1. **Hero:** **only** a headline, one line and the "Start building" button. A prompt box is allowed. **No** renders, tabs, galleries, "built with", "kit", "rendered by" or showcases.
2. **Delete:**
   - the "What it builds" kit gallery;
   - every "Rendered by StudPilot's kit" caption;
   - the word "kit" from all public copy.
3. **Examples:** real examples may appear **below the fold, later**. They must come only from real user-style requests that passed the bar, and never in the hero.
4. **The preview:** if the owner did not approve 4 screenshots *before* #109 switched the site (WEB-REBUILD step 5), that step was skipped. Either way, do it now with the fixed hero: send 4 screenshots and wait for a yes.

---

## 8. Work order to "finished"

Run these in parallel where independent:
1. **Today:**
   - copy the docs (§0, §2, §6.1);
   - freeze the breadth set (§5);
   - stop all U-runs;
   - fix the hero (§7) and send the 4 screenshots.
2. **Library research:** deep research for all 17 categories, writing the sources ledger. Report source counts and estimated item counts per category against the targets.
3. **Library pipeline and tools:** schema, sanitize, grade, family, index, load-test harness, `library_*` tools, credits module.
4. **UI reboot** (§6), using the first A-grade icon family. Owner eye check.
5. **Library build-out** to the §4.3 targets in batches. Daily counts. Owner boards (§4.7).
6. **Agent integration:**
   - the library-first flow (§3);
   - GLM picks from graded top-k;
   - skills from creator-docs tutorials;
   - item previews in `ViewportFrame`s.
7. **Evaluation:** dev 60 + breadth 300, with fixes. The retrieval test (L-A6).
8. **M6 pricing:** ready, with checkout still off until X5 (an adult holds Stripe).
9. **M7:**
   1. ask the owner for the hidden set (X8);
   2. final proof;
   3. demo video for the OAuth review (X9);
   4. trademark;
   5. launch checklist.

**"Finished" means all of these are true:**
- §4.6 is all green;
- the UI reboot is approved by the owner;
- the dev, breadth and hidden sets pass the bar at M7;
- the website follows the hero rule and the owner approved it;
- pricing is ready;
- `planning/STUDPILOT-100.md` is true in every line, or each gap is listed with its owner decision.

---

## 9. Hard bans (any one fails the work)

- Library content made by GLM, Claude or any AI.
- Unlicensed, NC, ND, "personal use" or Mixamo assets.
- Unaudited third-party scripts in a user's place.
- Committing third-party binaries or anyone else's game screenshots.
- Uploads to the owner's personal account.
- Self-grading.
- Visual claims in replies.
- Emoji icons; "R$" or "Gems 100" text.
- Translucent gloss bands; same-hue strokes; navy wells.
- Kits or renders in the hero; the word "kit" in public copy.
- Parking a known-ugly asset in `LATER.md` and showing it to the owner.
- Training any model on Roblox data.
- Silently downgrading the model or skipping deep research.
