# Library status (master plan §4.3), 2026-10-07

Items ingested as metadata (`planning/library/items/`), with provenance, licence, `ai_check`, family and the automatic
checks, and graded (L5) by two independent critics each from thumbnail boards against the world anchors R10-R13; the
lower grade counts and only A/B reach the build model. Not yet uploaded (waits on O-GROUP and O-KEY) or load-tested
(L8), so none counts toward a target until those steps pass. Loaded into D1 `library_items`.

| # | Category | Target | Ingested (A / B / C) | Where it stands |
|---|---|---|---|---|
| 1 | Props and models | 10,000 | 7,191 (1,490 / 3,913 / 1,788) | Kenney, OpenGameArt, KayKit and Poly Haven, incl. terrain and scenery pieces tagged environment |
| 2 | Modular building sets | 150 families / 5,000 parts | 5,387 (703 / 3,274 / 1,410) | Kenney, OpenGameArt, KayKit and Poly Haven families |
| 3 | Complete maps and environments | 300 | 0 | not started (terrain and scenery pieces are props, row 1) |
| 4 | Characters, NPCs, creatures, pets | 1,500 | 439 (173 / 84 / 182) | Kenney, OpenGameArt and KayKit packs |
| 5 | Vehicles and mechanisms | 400 | 698 (327 / 294 / 77) | Kenney, OpenGameArt, KayKit and Poly Haven |
| 6 | Textures, materials, terrain presets | 1,000 | 2,009 (436 / 1,344 / 229) | ambientCG PBR materials (CC0), 95 families by material type; 1K-JPG sets hashed, colour maps kept; not uploaded yet (MaterialVariants need O-GROUP) |
| 7 | Skies and lighting presets | 300 + 100 | 701 skies (206 / 245 / 250); 0 lighting presets | Poly Haven outdoor HDRIs (CC0), 1K HDR kept for the 6-face skybox made at upload; lighting presets need a source (Creator Store, O-KEY) |
| 8 | UI art: icons in 10+ families | 8,000 + 500 | 13,551 items: icons A 5,421 / B 4,030 / C 2,201, frames A 649 / B 1,198 / C 9, plus 43 kit icons | 27 families; after the L4 overrides; not uploaded yet (O-GROUP) |
| 9 | Fonts | all | 120 (19 / 81 / 20) | every Roblox font family (29 built-in, 91 Creator Store); graded by two critics from specimen boards rendered in Studio; mood-tagged; A: Fredoka One, Luckiest Guy, Bangers, Builder Sans, Creepster, Press Start 2P and 13 more |
| 10 | VFX | 2,000 | 665 (153 / 310 / 202) | Kenney Particle Pack, Smoke Particles, Splat Pack and Light Masks (CC0) as textures for ParticleEmitters, Beams and Decals; Creator Store effects wait on O-KEY; not uploaded yet (O-GROUP) |
| 11 | SFX | 30,000 indexed | 657 (219 / 436 / 2) | Kenney's 9 CC0 sound packs; Creator Store audio (by ID, no upload) waits on O-KEY; not uploaded yet (O-GROUP) |
| 12 | Music | 10,000 indexed | 85 (0 / 85 / 0) | Kenney Music Jingles (CC0); the APM library is used by ID inside Roblox (O-KEY) |
| 13 | Animations | 1,000 | 47 (0 / 2 / 45) | 3 OpenGameArt rigs graded as models; clips not yet split out |
| 14 | Code modules | 300 | 404 (29 / 296 / 79) | 68 of 70 repos (charm and ripple ship TypeScript); 392 MIT, 12 Apache; L4: 315 clean static scans; the 89 flagged reviewed by two reviewers each: 65 safe, 18 restricted (purchases, web, teleport: only when the game asks), 6 unsafe and kept out |
| 15 | Knowledge | 100 % of the docs | 8,447 doc chunks, all embedded | creator-docs (966 guide pages, 1,200 API files) and luau.org, refreshed 2026-10-07 (#120): 1,170 new or changed, 90 removed upstream pruned; plus research and skill chunks |
| 16 | Skills | 500 | 1,879 (201 / 808 / 870) | Creator Documentation, word for word: 1,170 numbered procedures (CC BY 4.0) and 709 code recipes (prose CC BY 4.0, code MIT); 1,009 A/B reach the agent through search_creation_skills / read_creation_skill and library_search |
| 17 | Game templates and starters | 50 | 0 | not started |

Kenney 3D: 46 of 50 packs (the 4 FBX/OBJ-only packs wait for a converter), 4,402 models, 0 rejected; triangles
median 138, 95th percentile 1,060, max 10,880. Source zips (741 MB) stay in the git-ignored `private/library-src/`.

Grading (2026-10-07): 93 boards, 38 critic runs (two per board), 4,402 items: A 931, B 2,739, C 732; the two critics
agreed on 3,975 (90 %). Each item keeps both critics' grade and reason in `grade_notes`.

OpenGameArt 3D (2026-10-08): all 247 allowed packs in the ledger fetched (Kenney re-uploads skipped), including the 40
that ship only .blend. Packs whose exports lost their colours (every MTL Blender's default grey) or ship only .blend are
converted from their .blend with Blender 5.2 (factory settings, scripts off), an old Diffuse-BSDF material given a
Principled BSDF of the same colour; 63 packs, 722 files, 2 failed. Every model is rendered from its files (textures found
by name in the pack; the loaders' requests awaited). 8,522 items from 222 packs: A 1,542, B 4,674, C 2,306; 265 refused under the
2024 rule (packs from 2024-2026 by artists not on the known-human list), 556 left out as incomplete (they name a texture
the pack does not ship, or a .psd), 108 the renderer could not load. Two critics per board; 62 boards whose items and
thumbnails were unchanged since batch 1 keep their grades.

Icons (2026-10-07): game-icons.net (github.com/game-icons/icons at 82d9488), 4,173 SVGs by 34 artists, CC BY 3.0 except
the two its license.txt marks CC0 (123 icons); each CC BY icon carries "made by {artist}" as the licence asks. 5 refused
under the 2024 rule (an artist new in 2025). Badges (overlay pieces) and various-artists (no one to credit) left out.
Two critics per numbered board of 100 graded readability at HUD size and fit for all-ages games: A 1,052, B 1,773,
C 1,348, agreeing on 3,209 (77 %); C includes busy or abstract glyphs, gore, gambling, brands and extremist symbols.

Kenney 2D (2026-10-07): 26 packs from kenney.nl (CC0, each License.txt checked), one item per distinct base-size PNG
(2x copies, sheets and previews left out; byte-identical files kept once across packs): 9,335 items in 25 families
(1-Bit Pack ships only sheets), 1 refused (the Anguilla flag's ISO code "ai" trips the L1 word check). Two critics per
board: A 5,466, B 3,618, C 251, agreeing on 8,244 (88 %).

Skills (2026-10-07): 1,170 procedures from the Roblox Creator Documentation (CC BY 4.0), each the heading, its
introducing paragraph and the steps with their code, word for word; images, videos and the docs site's widgets removed,
cited to page and heading. 9 refused: 7 under L1 (their own words are about Roblox's AI Assistant) and 2 that quote a
credential-shaped example (a Slack webhook URL). Two critics per item
graded them for an agent working in Studio: A 77, B 469, C 624 (C: Blender, the Creator Dashboard, Open Cloud admin,
classroom logistics), agreeing on 1,073 (92 %). The steps are in D1 (`body`); the A/B are in `studpilot-library`.

Acceptance (2026-10-08, planning/proof/LIB/acceptance-2026-10-08.md): L-A2 and L-A3 pass; L-A4 passes on its fourth
sample after 708 L4 decisions (planning/library/maturity-overrides.jsonl: brand-named console prompts, logos, contact
sheets, gambling and alcohol to C; Nosifer and 26 real firearm models to maturity Mild, offered only when asked); L-A5
waits on O-GROUP; L-A6 queries frozen (496).

KayKit (2026-10-08): the 10 free-tier repos of github.com/KayKit-Game-Assets (CC0 per each repo's LICENSE.txt; posted
dates from its creation-date line), 1,005 models: A 380, B 509, C 116 (incl. 9 alcohol overrides). Models exported as
both x.fbx and x.gltf.glb are one model (the GLB): the same fix removed 597 such duplicates from the OpenGameArt items
(older KayKit uploads), which took their GLB copy's grades.

Materials (2026-10-08): ambientCG's 2,013 materials through its official API (CC0); each 1K-JPG zip streamed once to
hash it, its colour map kept for grading (2.1 GB; the full map set is fetched again at upload). 2,009 ingested (2 have no
1K-JPG, 2 failed to download). Two critics per board of 100: A 436, B 1,344, C 229 (88 % agreement); C includes blank or
near-black maps, decal strips and normal-map-like images.

Skies (2026-10-08): Poly Haven's 701 outdoor HDRIs through its public API (CC0; a User-Agent naming StudPilot; no page
scraping), each 1K HDR checked against the API's md5 and hashed. Two critics per board judged each as a Roblox skybox:
A 206, B 245, C 250 (C: enclosed or cluttered panoramas). Credited 'Powered by Poly Haven' with the photographer.

Poly Haven models (2026-10-08): its 520 CC0 models through the public API (a User-Agent naming StudPilot), each 1K
glTF with its buffer and textures checked against the API's md5. Rendered from the files; 92 dense photoscans left out as
over Roblox's mesh import limit (20,000 triangles a mesh, or 100,000 in all). Two critics per board graded the other 428:
A 1, B 77, C 350. The photoreal scans clash with the chunky toy anchors, so only plain, bright or simple pieces pass
(light-wood furniture, barrels, chests, a few foods). L4: two real firearms and a grenade set to Mild; wine bottles and
two cigarette props set to C.

Audio (2026-10-08): Kenney's ten CC0 audio packs, 742 sounds (2 byte-identical copies left out), each measured with
ffprobe and ffmpeg (length, rate, channels, peak and mean level). Two critics per numbered waveform board, with name and
levels on each tile: they cannot listen, so the grade covers name clarity, waveform shape (onset, silence, clipping) and
level, and an owner listening check belongs in the SFX board. A 219, B 521, C 2; three 'kill him/her/it' announcer lines
set to maturity Mild. OpenGameArt music (about 8,700 submissions) is not taken: grading music needs listening.

Search (L7): the 3,670 A and B items are embedded (Workers AI bge-small, 384 dimensions, card text and tags) in the
Vectorize index `studpilot-library` (cosine; metadata indexes on kind, grade and family). C items are never embedded.

Code (2026-10-07): usefulness graded by two critics per repo from its README and module list (the lower grade counts;
an unsafe module is always C); A includes ProfileStore, Promise, GoodSignal, Trove, Janitor, ZonePlus, Fusion, spr,
SimplePath, ByteNet and Warp. Loaded into D1 with the scan and both audits in `sanitize`; the 325 A/B modules are in
`studpilot-library`.

Code load test (L8, 2026-10-07): the 121 standalone A/B packages were each built with their dependencies in Studio
and required: 118 load; Remo, ByteNet and RoactSpring error while loading and are never offered. The agent's
`library_code` tool searches and installs the loading ones (deployed with #118).
