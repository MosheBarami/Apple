# Library acceptance, 2026-10-08 (master plan §4.6)

| Test | State | Evidence |
|---|---|---|
| L-A1 Count | 4 categories at their number (vehicles, UI art, code, skills), fonts and knowledge complete, 3 in progress (props 52 %, building parts 75 %, characters 14 %), 8 not started | table below, from `packages/library/tools/acceptance.mjs` |
| L-A2 Licence | PASS | every item re-validated: source, licence class its words support, no banned term, licence URL, attribution where needed, passing ai_check |
| L-A3 Human-made | PASS | 4 independent 300-item samples, two fresh reviewers each: 0 AI items in 1,200 reviews |
| L-A4 Safety | PASS on sample 4 (after fixes) | samples 1-3 found issues; each was fixed for its whole class (708 decisions in `planning/library/maturity-overrides.jsonl`); sample 4: 0 flags from both reviewers |
| L-A5 Load | NOT RUN | needs items on Roblox: waits on O-GROUP and O-KEY (code modules: 118 of 121 load, see STATUS.md) |
| L-A6 Retrieval | NOT RUN YET | 496 frozen queries (`planning/library/acceptance/L-A6-queries.jsonl`, sha256 in the .sha256 file); runs after `library_search` deploys |
| L-A7 Owner boards | NOT SENT | 17 boards of 48 random A items, after L-A6 |

## L-A4: what the samples found and what changed

- Sample 1 (all items): a slot machine, a Meta-logo input prompt, the Nosifer font. Sweep by name and by picture: gambling (15), alcohol (11), logo prompts (20), contact sheets that are not icons (26) to C; Nosifer to maturity Mild (horror requests only).
- Sample 2 (A/B only): Kenney input prompts for named consoles (Xbox, PlayStation, Nintendo, Steam Deck, Meta Quest and others) and a named real firearm. Brand-named console prompt sets (599) to C (Roblox provides gamepad prompt images itself); 26 real firearm models to Mild.
- Sample 3: a beer glass in Kenney's Generic Items, whose files are named only by number. A picture sweep of that pack by two critics: 10 items to C (alcohol, an Apple-logo laptop, a cigarette-like pack).
- Sample 4: clean. Two reviewers noted, without flagging, an unbranded realistic gun and a car titled with a pun on a real brand (no logo): left as they are.

Samples, reviewers' verdicts and the item ids are in `planning/library/acceptance/L-A3-L-A4-samples.json`.

## L-A1 count (A/B items against the §4.3 targets; not yet uploaded or load-tested)

| # | Category | Target | A/B | A / B / C | |
|---|---|---|---|---|---|
| 1 | Props and models | 10,000 | 5,241 | 1,442 / 3,799 / 1,445 | 52 % |
| 2 | Modular building parts | 5,000 | 3,791 | 562 / 3,229 / 1,320 | 75 % |
| 3 | Complete maps and environments | 300 | 0 | 0 / 0 / 0 | 0 % |
| 4 | Characters, NPCs, creatures, pets | 1,500 | 211 | 140 / 71 / 178 | 14 % |
| 5 | Vehicles and mechanisms | 400 | 618 | 327 / 291 / 73 | met |
| 6 | Textures, materials, terrain presets | 1,000 | 0 | 0 / 0 / 0 | 0 % |
| 7 | Skies and lighting presets | 400 | 0 | 0 / 0 / 0 | 0 % |
| 8 | UI art (icons and frames) | 8,500 | 11,298 | 6,070 / 5,228 / 2,210 | met |
| 9 | Fonts | all | 100 | 19 / 81 / 20 | - |
| 10 | VFX | 2,000 | 0 | 0 / 0 / 0 | 0 % |
| 11 | SFX (indexed) | 30,000 | 0 | 0 / 0 / 0 | 0 % |
| 12 | Music (indexed) | 10,000 | 0 | 0 / 0 / 0 | 0 % |
| 13 | Animations | 1,000 | 2 | 0 / 2 / 45 | 0 % |
| 14 | Code modules | 300 | 325 | 29 / 296 / 79 | met |
| 15 | Knowledge | all | 0 | 0 / 0 / 0 | - |
| 16 | Skills | 500 | 546 | 77 / 469 / 624 | met |
| 17 | Game templates and starters | 50 | 0 | 0 / 0 / 0 | 0 % |

## L-A2 licence: PASS

Every item has a source, a licence class its words support, no banned term, a licence URL, attribution where the licence needs it, and a passing ai_check.

