# L-A6 retrieval (master plan §4.6), 2026-10-08

496 frozen queries (`planning/library/acceptance/L-A6-queries.jsonl`, sha256 7bed1c4e...), each run through the deployed
`library_search` (GET /api/admin/library/search) and judged by fresh critics: pass when the top 5 hold a correct, on-style
item; a set query also needs its correct items from one style family. Bar: 90 % and 95 %.

| Round | Search | Pass | Set queries in one family |
|---|---|---|---|
| 1 (8980194b) | all 40 candidates sorted A before B, then cut | 286 / 496 = 57.7 % | 21 / 49 |
| 2 (95a0aee0) | relevance decides the answer, A first among it; a set searched within the best match's family | 311 / 496 = 62.7 % | 31 / 49 |

Round 2 by kind: font 84 %, icon 80 %, map pieces 75 %, vehicle 72 %, building 71 %, prop 68 %, skill 54 %, character 52 %,
frame 48 %, code 43 %.

## Why round 2 fails: content, not search

Each of the 185 failures was checked by two critics against up to 10 library items sharing its words
(`round-2-failures.json`): 23 are search misses (a fitting item exists and was not in the top 5), 162 are content gaps
(nothing in the library fits). Even a perfect search would reach 67.3 %.

| Kind | Misses | Gaps | What the gaps are |
|---|---|---|---|
| skill | 1 | 44 | tasks the docs teach as prose and code, not numbered steps (badges, teleport, passes, day/night) |
| code | 1 | 42 | common systems no library module covers (leaderboards, teleport, inventory, passes, pools, rate limits) |
| prop | 3 | 23 | specific objects (mace, fishing rod, grandfather clock, cryo pod, cobweb) |
| character | 0 | 14 | named roles and costumes (shopkeeper, blacksmith, astronaut, scarecrow) |
| building | 2 | 11 | landmarks (lighthouse, pagoda, cathedral, log cabin) |
| frame | 4 | 9 | specific UI parts (toggle, tooltip, hotbar slot, name plate, banner) |
| icon, vehicle, map, font | 12 | 19 | |

Next: skills and code from the Creator Documentation's prose-and-code sections and the API reference's code samples
(CC BY 4.0, no upload needed); props, characters and buildings from the Creator Store once O-KEY exists.
