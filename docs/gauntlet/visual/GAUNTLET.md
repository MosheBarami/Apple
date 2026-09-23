# Visual gauntlet — Apple MAX Autonomous

## CURRENT METHOD (owner, 2026-09-24): the blind critic — see `BLIND_CRITIC.md`

The owner dropped the comparison against his reference images (D-GAUNTLET-2):
- `compare.py` is removed.
- The images under `refs/` are kept as an archive only; nothing is judged against them.
- A round now runs the fixed customer prompt below.
- A fresh agent then judges ONLY the final screenshots: is this a fit and amazing Roblox game, and
  what is broken, down to the smallest thing.

## Retired target (2026-09-23 evening): a real cartoon simulator, three tests against refs

The owner retired Grow-a-Garden as the target. The loop now builds **one full simulator game** and is
judged against his reference images in `refs/simulator/`, as three separate tests:

| test | refs | what "same" means |
|---|---|---|
| **1. map** (`--test map`) | `map/1-hub-overview.png`, `map/2-leaderboard-grove.png` | a bright hub: layered grass cliffs with brown rock faces, sandy paths, a plaza with a statue, water/bridge, stalls on the edges, a rebirth circle, stylised cloud sky |
| **2. models / 3D** (`--test models`) | `models/1-shop-building-barrels.png`, `models/2-trees-lamps-leaderboard.png`, `models/3-stalls-fences-statue.png` | low-poly cartoon props: a yellow shop with a glowing SHOP sign and neon ring, banded barrels, tiered pines and round trees, post lamps, fences, striped-awning stalls, a leaderboard board |
| **3. UI** (`--test ui`) | `ui/1-shop-hud.png`, `ui/2-settings-currency.png`, `ui/3-gamepass-shop.png`, `ui/4-ui-structure.png` | thick dark outlines, bright gradient cards, chunky cartoon font, top currency pills with "+", round icon buttons down both sides, a SHOP window with starter pack / gamepass / pack cards and prices, a settings panel with toggles, a level/XP bar and cash pill at the bottom |

The rule from the first gauntlet still holds: **fix the model's general weaknesses, never this one
game** — the refs are the bar, not training data; no hand-placing the map.

### The customer prompt (fixed; run verbatim every round)

> Build a full simulator game like the popular ones: a bright cartoon hub map with grass hills, paths, trees, fences, a shop building, market stalls, a rebirth circle and a leaderboard, and the full UI: currency bar on top, round buttons on the sides, a shop with gamepasses and packs, and settings. Make the full game, make no mistakes

Apple MAX, Agent, Autonomous, fresh Baseplate. After the run, three shots, one per test: the wide
hub from the spawn (map), a close shot of the best props (models), and the playtest with the shop
open (UI), plus every UI screen. They go to the blind critic (`BLIND_CRITIC.md`), and its verdict
is sent to the owner in the chat.

---

# Archive: Grow-a-Garden target (rounds 1–3)

Owner, 2026-09-23: the Grow-a-Garden build looked nothing like the real game. Loop until a blind critic
cannot tell ours from the references. **Fix the model's general weaknesses, never this one game** —
no Grow-a-Garden facts in the training data, no hand-fixing the map.

## The bar (fetchable, in `refs/`)

| file | what it shows |
|---|---|
| `roblox-grow-a-garden-screenshot.png` | wide shot: fenced plots, signs, giant stylised plants, cloud sky |
| `noFilter.png` | fenced soil plots with raised trim borders on studded grass |
| `images-30.png` | crop bed close-up: tomato vines, leafy clusters, fence, cloud sky |
| `Angry_Plant_Grow_a_Garden_Quests.png` | hero props: chest, boss plant on a glowing pad, vine-wrapped hut |
| `Beginners_Guide_GAG_under_32KB.png` | giant fruit from rotated blocks, fruit trees lining a green path |
| `apple-max-run1-candidate.png` | **ours, round 1**: flat slabs, grey path, two-part trees, no fences |

## The customer prompt (fixed; run verbatim every round)

> Build Basically Grow A Garden Type Game include 6 plots make the full game make no mistakes

Apple MAX, Agent, Autonomous on, in a fresh empty Baseplate. After the run: playtest, screenshot from
the spawn at the default camera, plus one overhead shot.

Every round ends with the side-by-side image sent to the owner in the chat (his standing request):
`python3 docs/gauntlet/visual/compare.py --round N --ours <shot> --note "<gap>"` writes
`rounds/round-N-compare.jpg`.

## The critic (a separate agent with fresh context, harsh)

It gets our screenshot and one reference with the labels stripped and the order randomised. It answers
only: which one is the shipped game, and what is the single biggest visual gap. Ours wins a round when
the critic picks wrong or calls it a coin flip on two references in a row.

## Round 1 gaps → the general skill each one exposes

| gap seen in round 1 | general skill (applies to every genre) |
|---|---|
| ground is realistic Grass material, dull | **style coherence**: pick one art style (classic Roblox: bright SmoothPlastic/Plastic, studs) and apply it everywhere |
| plots are 0.2-stud plates with no edges | **volume and trim**: every functional area gets a raised border, a lip or a base |
| no fences, signs, crates, lamps | **set dressing**: every area gets 3–6 props that say what it is |
| trees are a trunk + one block | **organic shapes from clusters**: foliage, fruit and rocks from rotated, varied-size blocks |
| grey path, brown, desaturated | **palette**: 4–6 saturated colours, contrast between walk, build and decor areas |
| default sky | **atmosphere**: Sky with clouds, Lighting ClockTime, Atmosphere, a touch of Bloom |
| run ended on read-stall after 33 changes | **finishing**: build the whole plan before polishing scripts; stop re-reading |

Each skill becomes (1) a RAG/skill card the agent retrieves for any build, (2) a training family of
genre-agnostic tasks judged by render, not by text.
