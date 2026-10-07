# Library status (master plan §4.3), 2026-10-07

Items ingested as metadata (`planning/library/items/`), with provenance, licence, `ai_check`, family and the automatic
checks, and graded (L5) by two independent critics each from thumbnail boards against the world anchors R10-R13; the
lower grade counts and only A/B reach the build model. Not yet uploaded (waits on O-GROUP and O-KEY) or load-tested
(L8), so none counts toward a target until those steps pass. Loaded into D1 `library_items`.

| # | Category | Target | Ingested (A / B / C) | Where it stands |
|---|---|---|---|---|
| 1 | Props and models | 10,000 | 2,075 (569 / 1,248 / 258) | 19 Kenney packs |
| 2 | Modular building sets | 150 families / 5,000 parts | 1,903 (194 / 1,280 / 429) | 20 families |
| 3 | Complete maps and environments | 300 | 0 | not started |
| 4 | Characters, NPCs, creatures, pets | 1,500 | 68 (54 / 8 / 6) | 3 packs |
| 5 | Vehicles and mechanisms | 400 | 356 (114 / 203 / 39) | 4 packs |
| 6 | Textures, materials, terrain presets | 1,000 | 0 | ledger only (ambientCG, Poly Haven) |
| 7 | Skies and lighting presets | 300 + 100 | 0 | ledger only |
| 8 | UI art: icons in 10+ families | 8,000 + 500 | 43 | 1 family (Kenney 3D renders, kit icons); 2D packs in the ledger |
| 9 | Fonts | all | 0 | ledger: 120 OFL families |
| 10 | VFX | 2,000 | 0 | ledger only |
| 11 | SFX | 30,000 indexed | 0 | ledger only |
| 12 | Music | 10,000 indexed | 0 | ledger only (APM via Roblox) |
| 13 | Animations | 1,000 | 0 | ledger only |
| 14 | Code modules | 300 | 0 | ledger: 70 MIT/Apache repos |
| 15 | Knowledge | 100 % of the docs | 2,195 docs | live corpus: 9,376 chunks, 9,527 vectors; creator-docs upstream has 2,168 pages; fetched 2026-08-30, refresh due |
| 16 | Skills | 500 | 23 | live corpus |
| 17 | Game templates and starters | 50 | 0 | not started |

Kenney 3D: 46 of 50 packs (the 4 FBX/OBJ-only packs wait for a converter), 4,402 models, 0 rejected; triangles
median 138, 95th percentile 1,060, max 10,880. Source zips (741 MB) stay in the git-ignored `private/library-src/`.

Grading (2026-10-07): 93 boards, 38 critic runs (two per board), 4,402 items: A 931, B 2,739, C 732; the two critics
agreed on 3,975 (90 %). Each item keeps both critics' grade and reason in `grade_notes`.

Search (L7): the 3,670 A and B items are embedded (Workers AI bge-small, 384 dimensions, card text and tags) in the
Vectorize index `studpilot-library` (cosine; metadata indexes on kind, grade and family). C items are never embedded.
