# Owner benchmark baseline (owner-30-v1), 2026-10-02

The first measurement of the product against the owner's fixed 30-request bank (`requests.json`). Every item ran in a
fresh chat on a clean Baseplate (`bench/reset` + restore of the `bench-baseline` checkpoint) against the deployed worker
`76c30935`, and was scored by the vision judge on 9 criteria, 0–2 each (`apps/worker/src/owner-bench.ts`).
Raw rows: `results/2026-10-02-baseline.json`. Formula: `score.mjs` (memory `frontier-meter-every-turn`).

**What this is not.** These are the judge's scores only. Nobody reviewed the photos to lower a score (the photos are
served for one hour and had expired before the review); `review.mjs` exists for the next run. 26 of 30 items are
measured; 4 are not (below). The agent here is the code before phase 1 — the integration branch changes most of what
these numbers measure, so the next run is the real comparison.

## Validity notes, per item
- **p16** ran under the first runner (12-minute turn cap): its socket gave up, the run went on, and it was stopped by
  hand at 25 minutes and scored on what it had built.
- **p19** not measured: skipped to save credits (maps cost 430–580 credits each).
- **g28** not measured: the browser tab reloaded mid-item and the runner was lost.
- **g29, g30** not run on this code: deferred to the run on the integrated code (about 580 credits each).
- **y20** the chat socket closed after 56 s; the run continued on the server, and evaluate waited for it to end.
- **y20, y21** first failed on the reset: the plugin cannot delete duplicate-named siblings (`path is ambiguous`); the
  place was cleared by hand and both were re-run.
- The `bench-baseline` checkpoint was recreated once (retention had aged the first out): 10 restored instances vs 9.

Judged 26 of 28; mean total 7.27/18; 3423 credits. Unmeasured: p19, g28.

| criterion | mean (0-2) |
|---|---|
| works | 1.19 |
| professional | 0.42 |
| matches | 0.81 |
| polished | 0.38 |
| noErrors | 1.58 |
| performance | 1.85 |
| sound | 0.08 |
| animation | 0.62 |
| fx | 0.35 |

| category | n | mean total /18 | matches | professional |
|---|---|---|---|---|
| object | 6 | 6.33 | 0.33 | 0.17 |
| silly | 5 | 8.00 | 0.40 | 0.60 |
| modify | 4 | 6.75 | 0.50 | 0.50 |
| map | 3 | 5.33 | 0.67 | 0.00 |
| system | 4 | 8.50 | 1.75 | 0.50 |
| ui | 3 | 9.67 | 1.67 | 1.00 |
| game | 1 | 5.00 | 1.00 | 0.00 |

| domain | weight | value | measured |
|---|---|---|---|
| agent | 25% | 59.6% | yes |
| library | 20% | 15.0% | estimate |
| visual | 15% | 15.8% | yes |
| ui | 10% | 37.5% | yes |
| sensory | 10% | 17.3% | yes |
| website | 20% | 10.0% | estimate |
| **total** | 100% | **27.8%** | |

| id | request | total | works,prof,matches,polish,noErr,perf,sound,anim,fx | credits | s | top critique |
|---|---|---|---|---|---|---|
| o01 | make me a treasure chest that opens when you touch it | 6 | 100022010 | 1 | 24 | This is not a treasure chest. The screenshots show a giant knife from Twisted Murderer's 'Midas Touch' gear standing on a blue slab — the agent grabbed an unrel |
| o02 | build a cute robot pet | 6 | 100102011 | 1 | 35 | The user asked for a cute ROBOT pet and got a stock Doge head from the library — no robotic design, no metal, no mechanical parts, nothing 'robot' about it. Thi |
| o03 | make a giant donut | 9 | 202022010 | 1 | 97 | The 'giant donut' is a stock free model ('Vanilla Donut' from Candy Obby) dropped on the map, not something built — a professional would model or at least meani |
| o04 | make me a medieval sword on a stand | 6 | 100022010 | 1 | 36 | There is no sword. The user asked for a medieval sword on a stand and got a tiny yellow-roofed shrine-looking library asset ('Stand' from Escape FNAF) with no b |
| o05 | make a jukebox that plays music when you click it | 5 | 010012010 | 1 | 21 | The core request is unfulfilled: there are 0 sounds in the place, so the jukebox plays no music when clicked. The agent explicitly stripped the model's own soun |
| o06 | build a hot air balloon | 6 | 100022010 | 1 | 57 | The user asked for a hot air balloon and got a tiny cluster of party balloons — a stock library asset from Welcome to Bloxburg, not a built hot air balloon with |
| s07 | make a cat that is also a toaster | 9 | 210122010 | 1 | 30 | The 'cat' half of the request is completely missing — this is a stock toaster model (HWToaster from RoCitizens) with zero feline features: no ears, face, tail,  |
| s08 | make the floor lava but make it funny | 7 | 101012101 | 112 | 247 | The joke UI is broken: ScreenGui 'LavaJokeGui' is enabled but Title and Label are hidden, so the player sees NO text — the entire 'make it funny' deliverable is |
| s09 | make me a banana wearing sunglasses | 9 | 211121010 | 9 | 23 | The 'banana' is a plain yellow cylinder with a black bar and two black blocks for sunglasses — no curve, no peel taper, no brown tips worth the name; it reads a |
| s10 | build a tiny house for a hamster | 8 | 110122010 | 10 | 39 | The one thing the user asked for — a TINY house — is flatly violated: the agent's own answer admits it is 50 studs long, roughly 10x the player's height. This i |
| s11 | make a cloud you can bounce on | 7 | 200022010 | 1 | 23 | The user asked for a CLOUD. What shipped is a flat blue-and-yellow trampoline pad on a brown base — a stock library asset ('Bounce' from Pokemon Adventures) tha |
| m12 | build a simple wooden bench → make it 100x cooler | 10 | 111122011 | 5 | 63 | The agent openly admitted it stopped before finishing — the '100x cooler' pass is incomplete, and it shows: the bench itself is still the same plain blocky slat |
| m13 | make a red car → make it look like it's from the future | 7 | 110012011 | 87 | 269 | The car is not red — screenshots clearly show a white/blocky vehicle with blue accents, directly contradicting the user's core request and the agent's own claim |
| m14 | build a small campfire → make it spookier | 7 | 101011111 | 66 | 128 | The scene is a pitch-black void: no terrain, no ground plane, no rocks or logs around the fire — the campfire floats in an empty black rectangle, which reads as |
| m15 | make a cupcake → make it way bigger and give it sparkling sprinkles | 3 | 000012000 | 43 | 99 | The star of the show is missing: the screenshots show a flat green baseplate with a tiny blue slab and a few scattered parts — there is no 34-stud cupcake anywh |
| p16 | make a cozy forest map with a river | 6 | 101011011 | 584 | 1581 | The 'cozy forest' is a flat neon-green baseplate with a handful of floating green spheres for trees — zero ground detail, no terrain, no canopy, no undergrowth; |
| p17 | build a desert canyon map with a hidden cave | 7 | 101022001 | 434 | 1384 | The screenshots show nothing but flat, untextured orange slabs forming a boxy corridor against a default blue sky — this reads as a first-draft blockout, not a  |
| p18 | make a snowy village map at night | 3 | 000021000 | 495 | 1501 | The request was a snowy village at night; the screenshots show a bright daytime green-grass field with a blue sky — no snow, no village, no darkness. This is a  |
| p19 | build a sky islands map connected by bridges | — | — | — | — |  |
| y20 | add coins that spawn around the map, that I can collect, with a counter | 9 | 112122000 | 344 | 56 | The playtest shows Coins 0 → 0 and the counter stuck at $0 — collection was never demonstrated working, which for a coin-collection request is the entire point |
| y21 | make a day and night cycle | 12 | 212122011 | 47 | 62 | Every screenshot shows the world at night — pitch-black baseplate with a lone decal part — so the 'bright day look' is unverified and the place looks dead and e |
| y22 | add a shop where I can buy speed and jump boosts | 8 | 202022000 | 117 | 300 | The world is a completely empty default baseplate: 4 parts total, no shop building, no environment, nothing to look at — the 'shop' exists only as a UI button f |
| y23 | make a checkpoint system for an obby | 5 | 101012000 | 226 | 531 | There is no obby. The user asked for a checkpoint system for an obby and got an empty baseplate with what appears to be a single checkpoint pad — a system with  |
| u24 | make a main menu with play, settings and shop buttons | 10 | 212122000 | 184 | 226 | Zero sound design: no click, hover, or open/close audio on any button — a menu that is completely silent feels dead and unfinished. |
| u25 | make a health bar and a stamina bar | 10 | 212122000 | 59 | 95 | The bars are flat, unstyled rectangles: no gradients, no rounded corners, no icons, no drop shadows — this is the default 'first ScreenGui' look, not something  |
| u26 | make a daily reward popup | 9 | 111122010 | 11 | 73 | The user asked for a popup — the player's screen shows no daily reward popup at all, just a 'PRESSES / Click it!' click counter. The deliverable was built as a  |
| g27 | make an obby with 10 stages | 5 | 101002001 | 582 | 956 | The build is unfinished and the agent's own final message admits it: no script calls Checkpoints.configure or binds players, so checkpoints and saving are dead  |
| g28 | make a zombie survival game | — | — | — | — | interrupted: the browser tab reloaded at ~13:14Z while the runner was mid-item; no score |

## What the baseline shows (framework level; each is a missing capability, not a request to patch)
1. **The agent did not get to choose.** A pre-model library step took the first *name* match and placed it with the
   same stage/wobble/counter/"Click it!" kit on everything: a knife for a treasure chest, a Doge head for a robot pet,
   a shrine for a sword, party balloons for a hot-air balloon, a trampoline for a cloud (object matches 0.33).
2. **A rule forbade building.** D-MODELLIB-2 refused any Parts build whose name held one of ~130 nouns, and the prompt
   said "take the closest hit". The agent could neither reject a wrong model nor build the right one.
3. **The harness spoke as the user.** A nudge injected as a user turn said to build "from Parts rather than looking for
   assets"; the agent then reasoned "the user wants me to build with Parts".
4. **Maps are slow, expensive and poor.** ~100–130 small model steps, ~35k input tokens each, 25 minutes, 430–584
   credits, many failed build calls retried with new coordinates, loops ended by guards (maps 5.3/18, professional 0).
5. **Requested behaviour is lost.** Library pieces arrive with scripts and sounds stripped and nothing re-adds the
   behaviour asked for (a lid that opens, music on click, a bounce).
6. **No self-check before answering.** False claims: hidden joke text called visible, white paint called red, sounds
   that do not exist.
7. **Sound design is effectively absent** (0.08), animation and FX weak (0.62, 0.35).
8. **Duplicate names break editing.** The plugin refuses writes to ambiguous paths, so the agent cannot fix or remove
   copies it made ("Tidying up: Did not work"), and the benchmark reset fails.

Fixes for 1–3 (phase 1, world-building), 4 (credits, world-building tools), 5–6 and 8 (capability tracks) are on the
integration branch, not yet deployed or measured. The next run uses the same bank plus `heldout-v1.json`.
