# 8. Quality evidence: what the agent can and cannot do today

Written 2026-10-04 from files on disk. Read-only; nothing was re-run. Two things in the sources are easy to misread, so here they are first.

- **The measurements are small and several are partial.** The only full pass over the frozen 30-request bank is the 2026-10-02 baseline (26 of 30 judged). The two later runs cover 3 and 11 items. The held-out bank (21 items) has never been run. Phase T has judged exactly one game (game 1 of 5) across three rounds, and round 4 had just started when this was written.
- **Fixes shipped is not improvement measured.** Almost every fix listed in section 5 was committed after the last scored run. Nothing has been re-measured on the bench since 2026-10-04 00:14 UTC. `GOAL.md` retired the bench loop on 2026-10-04.

## Path conventions used below

| Short form | Resolves to |
|---|---|
| `R/` | `/Users/moshe/Developer/RbxAI-ci/packages/evals/owner-bench/results/` (a separate clone; the main checkout holds only `2026-10-02-baseline.json` in its own `results/`) |
| `PT/` | `/Users/moshe/Developer/RbxAI/research/roblox/phase-t/` |
| `OB/` | `/Users/moshe/Developer/RbxAI/packages/evals/owner-bench/` |
| `HO/` | `/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/` |

Risk worth flagging to planners: the integrated, self-check and Phase T result JSON files and photos exist only under `R/` (the `RbxAI-ci` clone). They are not in the main repo's `results/` directory.

Numbers marked "computed" are my own arithmetic over the raw rows; the raw rows are in the cited files.

---

## 1. The scoring systems

### 1.1 Owner bench (owner-30-v1): what it measures

- **Bank.** 30 requests in 7 categories (object, silly, modify, map, system, ui, game). They are frozen and must never be edited after seeing a score (`OB/requests.json`, `OB/README.md`).
- **Protocol per item.** Fresh chat on a clean Baseplate (`bench/reset`, then restore of the `bench-baseline` checkpoint). The request goes in as an ordinary chat message. Then `bench/evaluate` counts the place, takes four Studio photos, runs one play test and asks a vision judge (`OB/README.md`).
- **The four photo angles** are front, three-quarter, side and close, framed on the union of everything built in Workspace (`apps/worker/src/owner-bench.ts`, `benchAngles`).
- **Nine criteria, each 0, 1 or 2; total out of 18.** The judge prompt defines the scale as `0 = bad or absent, 1 = acceptable amateur, 2 = what a professional Roblox studio would ship` (`apps/worker/src/owner-bench.ts`, `judgePrompt`).

| Criterion | Judge's definition (verbatim gist) |
|---|---|
| works | functions as asked when played |
| professional | looks rich and detailed, not basic blocks |
| matches | is what the user asked for, in its specifics |
| polished | finish: composition, lighting, UI, details |
| noErrors | no errors or broken pieces |
| performance | sensible part and script counts for what it is |
| sound | fitting sound design |
| animation | lively fitting motion |
| fx | fitting visual effects |

- **Reading the scale.** By the rubric's own words, a total of 9/18 means "acceptable amateur on everything". A total of 18 would mean studio-shippable on everything. The baseline of 7.27 is below amateur. The best row ever scored is 12/18 (computed from 40 judged rows in `R/2026-10-02-baseline.json`, `R/2026-10-04-integrated.json`, `R/2026-10-04-selfcheck.json`).
- **Judge inputs.** Photos, the place census (parts, scripts, sounds, animation pieces, effects, screens, lights), the play-test summary and the agent's final reply (first 600 characters). It never builds or fixes anything (`apps/worker/src/owner-bench.ts`).
- **Judge model.** The `vision` role, which is GLM 5.3 Flash, the same model family as the build model (`PT/MODEL-COMPARISON.md`).
- **Human review pass.** `OB/review.mjs` can only lower a score, and only with a reason. `OB/BASELINE.md` states that nobody reviewed the baseline photos, because they had expired. No later run has a review recorded in the result rows.
- **Meter.** `OB/score.mjs` turns the criteria into a weighted "whole-product" meter:

| Domain | Weight | Source | Measured by bench? |
|---|---|---|---|
| agent (works, matches, noErrors) | 25% | all judged items | yes |
| library | 20% | fixed estimate (15%) | no |
| visual (professional on object/silly/modify/map/game) | 15% | judged items | yes |
| ui (polished on ui and game items) | 10% | judged items | yes |
| sensory (sound, animation, fx) | 10% | all judged items | yes |
| website | 20% | fixed estimate (10%) | no |

  Two domains, 40% of the weight, are estimates, not measurements (`OB/score.mjs`). The baseline meter total was 27.8% (`OB/BASELINE.md`). No later full meter exists. `HO/apple-meter.json` still carries the baseline values plus the note "mean 9.4/18 so far".

### 1.2 Phase T quality bar (owner-plan rubric, /24)

`research/roblox/PHASE-T.md` defines 12 criteria scored 0/1/2 (total 24). The owner's agent was to score them by inspecting the built place, playing it, and reading the transcript, with results in `research/roblox/phase-t-results.md`. That file does not exist. No game has an official /24 score.

The 12 criteria:

1. core loop works end to end
2. first minute (reward within 30 s, next goal visible)
3. progression and economy
4. saving survives a rejoin
5. server authority
6. world art
7. UI (mobile-safe, every number real)
8. sound
9. VFX and feel
10. monetisation hooks
11. clean run (no Output errors in 5 minutes)
12. policy and honesty

Most are unmeasured for game 1. Section 7 maps what evidence exists to each.

### 1.3 Phase T blind-critic rubric (/10 per area)

The rule (`research/roblox/PHASE-T.md`, "Blind critic loop"):

1. Capture the final screenshots after each build.
2. A fresh agent with no context gets only the images and the one-line idea.
3. It critiques at "top-100-game standard" with a score per area, concrete flaws tied to screenshots, and a "top-studio version".
4. Stop only when no severe flaw remains and every area is 8/10 or more.

The areas used in the three critiques (`PT/t1-round1/critique.md`, `PT/t1-round2/critique.md`, `PT/t1-round3/critique.md`):

- delivers the idea
- world and level design
- art direction
- crystal and prop quality
- UI/UX
- feedback and game feel
- first 10 seconds
- broken/placeholder/amateur (round 3 dropped this row)
- overall

Differences from the bench:

- The scale is 0–10 per area, not 0–2.
- It is a single critic per round and has no fixed prompt in the repo. The critique files do not say which model played the critic.
- The critic sees 4 images (rounds 2 and 3) or 7 (round 1), not the build transcript.
- The critic never sees play-mode video. The owner's play frames in `PT/t1-round2/owner-play/` were a separate check.

### 1.4 How the two systems disagree (and why it matters for planners)

On the same builds, the in-product vision judge is far more generous than the blind critic:

| Round | Bench-style judge (GLM 5.3 Flash) | Blind critic | Source |
|---|---|---|---|
| 2 | 8/18 (works 1, professional 1, matches 1, polished 1) | 1.5/10 | `R/2026-10-04-phase-t-r2.json`, `PT/t1-round2/critique.md` |
| 3 | 6/18 | 1.5/10 | `R/2026-10-04-phase-t-r3.json`, `PT/t1-round3/critique.md` |

The product's own `judge_game` tool said "not ready yet (79 out of 100)" on the round-2 build (`PT/t1-round2/causes.md`). The 2026-09-30 evidence that "ready 94/100" had measured the wrong thing was revoked by the owner (`docs/autonomy/CURRENT_STATE.md`). The 2026-10-02 morning claim of "FRONTIER, 5 of 5 green" was withdrawn after the owner saw that the five tests had been fitted (`docs/autonomy/NEXT_ACTION.md`).

Planners should treat the bench judge's absolute scores as optimistic. They are good for comparing code versions only if the judge stays fixed.

---

## 2. Every measured result, with dates

### 2.1 Timeline

| Date (UTC unless noted) | What | Result | Source |
|---|---|---|---|
| 2026-09-22 | First signed-in production session; coin-game and lamp missions | Many critical and high findings (stalls, false passes, 450-credit terrain edit). See section 3, "read paralysis" | `docs/autonomy/CUSTOMER_FINDINGS.md` F-001..F-036, `docs/autonomy/EXPERIMENTS.md` |
| 2026-09-30 | Owner reviews the "Plants vs Brainrots, fruit" game | Owner verdict: bad (copied whole world, wrong creatures, T-posed). Prior "client test PASS, judge 94/100" revoked | `docs/autonomy/CURRENT_STATE.md` |
| 2026-10-02 10:02–13:10 | **Baseline**, bank owner-30-v1, code before phase 1, worker `76c30935` | 26 of 30 judged, **mean 7.27/18**, 3,423 credits, meter 27.8% | `R/2026-10-02-baseline.json`, `OB/BASELINE.md` |
| 2026-10-03 22:59 – 23:21 | **Integrated** run (integrated worker; the result file does not state the deploy) | 3 items judged (o01 12, o02 12, o03 11), mean 11.67; o04 started and abandoned | `R/2026-10-04-integrated.json` |
| 2026-10-03 23:23 – 2026-10-04 00:14 | **Self-check run** (`SELF_CHECK` on) | 11 items judged, **mean 9.36/18**, 2,273 credits; m12 started and abandoned | `R/2026-10-04-selfcheck.json`, `HO/bench-2026-10-04-selfcheck.log` |
| 2026-10-04 08:05–08:18 | **Phase T game 1, round 1** (agent improvised) | Blind critic **2/10** | `PT/t1-round1/critique.md`, `PT/t1-round4/model-calls.json` |
| 2026-10-04 09:16 | **Round 2** (worker `0adfa451`, plugin 1.5.0) | Blind critic **1.5/10**; bench-style judge 8/18 | `R/2026-10-04-phase-t-r2.json`, `PT/t1-round2/causes.md` |
| 2026-10-04 10:10 | **Round 3** (worker `42697f17`) | Blind critic **1.5/10**; bench-style judge 6/18 | `R/2026-10-04-phase-t-r3.json`, `PT/t1-round3/causes.md` |
| 2026-10-04 10:24–10:32 | Build-model comparison (GLM 5.3 full) | Attempt 1 error, attempt 2 quota refusal, attempt 3 cancelled by owner. **No quality result** | `R/2026-10-04-phase-t-m-glm53*.json`, `PT/MODEL-COMPARISON.md` |
| 2026-10-04 11:20 | **Round 4** launched on `2ffd22db` (2,000-credit allowance) | **No result yet.** Only 7 model calls were captured when the file was saved (11:22 UTC) | `PT/t1-round4/validation.md`, `PT/t1-round4/model-calls.json`, `R/2026-10-04-phase-t-r4.json` |

The result files carry two kinds of timestamps: `at` fields in UTC, and file modification times in local time (UTC+3). I use the `at` fields where they exist.

Never measured on any code: p19 (sky islands, skipped to save credits), g28 (zombie survival, tab reloaded mid-run), g29 (pet simulator) and g30 (racing), both deferred. The 21-item held-out bank (`OB/heldout-v1.json`) has no results file at all. Phase T games 2–5 (obby, tower defense, horror, tycoon) have not been attempted (`research/roblox/phase-t-v1.json`).

### 2.2 Baseline (2026-10-02): mean 7.27/18, 26 items

Per-criterion means (0–2), computed from `R/2026-10-02-baseline.json` and matching `OB/BASELINE.md`:

| works | professional | matches | polished | noErrors | performance | sound | animation | fx |
|---|---|---|---|---|---|---|---|---|
| 1.19 | 0.42 | 0.81 | 0.38 | 1.58 | 1.85 | 0.08 | 0.62 | 0.35 |

Per-category means (`OB/BASELINE.md`, with mean cost and time computed from the same rows):

| Category | n | Mean /18 | matches | professional | Mean credits | Mean steps | Mean seconds |
|---|---|---|---|---|---|---|---|
| object | 6 | 6.33 | 0.33 | 0.17 | 1 | 3 | 45 |
| silly | 5 | 8.00 | 0.40 | 0.60 | 27 | 7.2 | 72 |
| modify | 4 | 6.75 | 0.50 | 0.50 | 50 | 14.8 | 140 |
| map | 3 | 5.33 | 0.67 | 0.00 | 504 | 97 | 1,489 |
| system | 4 | 8.50 | 1.75 | 0.50 | 184 | 38.8 | 237 |
| ui | 3 | 9.67 | 1.67 | 1.00 | 85 | 19.7 | 131 |
| game | 1 | 5.00 | 1.00 | 0.00 | 582 | 124 | 956 |

Every baseline row, ordered as in the bank (`R/2026-10-02-baseline.json`):

| id | Request | /18 | Credits | Steps | Seconds |
|---|---|---|---|---|---|
| o01 | treasure chest that opens on touch | 6 | 1 | 3 | 24 |
| o02 | cute robot pet | 6 | 1 | 3 | 35 |
| o03 | giant donut | 9 | 1 | 3 | 97 |
| o04 | medieval sword on a stand | 6 | 1 | 3 | 36 |
| o05 | jukebox that plays music on click | 5 | 1 | 3 | 21 |
| o06 | hot air balloon | 6 | 1 | 3 | 57 |
| s07 | cat that is also a toaster | 9 | 1 | 3 | 30 |
| s08 | floor lava but funny | 7 | 112 | 26 | 247 |
| s09 | banana wearing sunglasses | 9 | 9 | 2 | 23 |
| s10 | tiny house for a hamster | 8 | 10 | 2 | 39 |
| s11 | cloud you can bounce on | 7 | 1 | 3 | 23 |
| m12 | wooden bench, then 100x cooler | 10 | 5 | 4 | 63 |
| m13 | red car, then from the future | 7 | 87 | 25 | 269 |
| m14 | small campfire, then spookier | 7 | 66 | 17 | 128 |
| m15 | cupcake, then bigger with sprinkles | 3 | 43 | 13 | 99 |
| p16 | cozy forest map with a river | 6 | 584 | 116 | 1,581 |
| p17 | desert canyon with a hidden cave | 7 | 434 | 100 | 1,384 |
| p18 | snowy village at night | 3 | 495 | 75 | 1,501 |
| y20 | coins that spawn, collect, counter | 9 | 344 | 97 | 56 (socket closed) |
| y21 | day and night cycle | 12 | 47 | 6 | 62 |
| y22 | shop for speed and jump boosts | 8 | 117 | 17 | 300 |
| y23 | checkpoint system for an obby | 5 | 226 | 35 | 531 |
| u24 | main menu (play, settings, shop) | 10 | 184 | 46 | 226 |
| u25 | health bar and stamina bar | 10 | 59 | 11 | 95 |
| u26 | daily reward popup | 9 | 11 | 2 | 73 |
| g27 | obby with 10 stages | 5 | 582 | 124 | 956 |

Validity notes recorded by the owner's agent (`OB/BASELINE.md`):

- p16 was stopped by hand at 25 minutes.
- y20 had its chat socket close after 56 s and the run continued.
- The `bench-baseline` checkpoint was recreated once.
- The baseline code was the agent before phase 1. A pre-model library step took the first name match and stamped the same kit on every object.

### 2.3 Integrated run (3 items) and self-check run (11 items)

Same-item comparison (computed from `R/2026-10-02-baseline.json`, `R/2026-10-04-integrated.json`, `R/2026-10-04-selfcheck.json`):

| id | Baseline /18 | Integrated /18 | Self-check /18 | Baseline credits | Integrated credits | Self-check credits | Baseline steps | Self-check steps |
|---|---|---|---|---|---|---|---|---|
| o01 chest | 6 | 12 | 11 | 1 | 185 | 165 | 3 | 23 |
| o02 robot pet | 6 | 12 | 12 | 1 | 211 | 162 | 3 | 34 |
| o03 donut | 9 | 11 | 10 | 1 | 270 | 102 | 3 | 21 |
| o04 sword | 6 | not scored | 10 | 1 | not scored | 458 | 3 | 100 |
| o05 jukebox | 5 | not run | 11 | 1 | not run | 211 | 3 | 45 |
| o06 balloon | 6 | not run | 12 | 1 | not run | 160 | 3 | 28 |
| s07 cat-toaster | 9 | not run | 10 | 1 | not run | 213 | 3 | 32 |
| s08 lava | 7 | not run | **2** | 112 | not run | 389 | 26 | 107 |
| s09 banana | 9 | not run | 10 | 9 | not run | 232 | 2 | 47 |
| s10 hamster house | 8 | not run | 7 | 10 | not run | 78 | 2 | 13 |
| s11 cloud | 7 | not run | 8 | 1 | not run | 103 | 3 | 24 |
| **Mean** | **7.09** (these 11) | 11.67 (3) | **9.36** (11) | 12.6 each | 222 each | 207 each | 4.9 | 43.1 |

What the comparison shows (computed):

- **Objects improved a lot.** The 6 object items went from 6.33 to 11.0 mean, driven by `matches` (0.33 to 1.83). The baseline's library grab was the wrong object for 5 of 6 (o03's stock donut was the right subject); the self-check run mostly built from Parts after a failed library search.
- **Silly requests did not improve.** The 5 silly items went from 8.0 to 7.4. The cause was s08 (2/18), where the agent renamed the floor and left a script that still looked for the old name.
- **The score ceiling is low.** No row in any of the three runs scored `professional`, `polished`, `sound` or `animation` at 2. Only one row scored `fx` at 2 (o06 in the self-check run). No row exceeded 12/18. The 40 judged rows hold 360 criterion scores (computed).
- **Sound, animation and fx did not move.** On the 11 same items, `sound` went 0.09 to 0.18, `animation` 0.91 to 0.27 and `fx` 0.18 to 0.36. The baseline's animation score came from a stamped wobble on every object, which disappeared with the kit. The sensory domain average (sound, animation, fx) fell from about 0.39 to 0.27 on these items.
- **Cost rose about 16x per item.** Baseline objects cost 1 credit because they were library grabs. The same 11 items now cost a mean of 207 credits and 43 steps, against 12.6 credits and 4.9 steps. A free account gets 100 credits a day (`docs/autonomy/CUSTOMER_FINDINGS.md` F-019), so one object costs roughly one to four and a half days of free allowance.
- **Integrated vs self-check on o01–o03** (12, 12, 11 vs 11, 12, 10) differ by at most 1 point. Credits were lower with self-check on (185/211/270 vs 165/162/102). The two runs are one sample each, so the noise is unknown. The files do not state exactly what differs between the "integrated" and "self-check" runs; `SELF_CHECK` is an environment variable (`apps/worker/src/env.ts`), and I infer that the integrated run had it off.

Play-test verdicts in the self-check run: 8 of 11 rows read `no_screen_gui` (no game UI on screen) and 3 read `observed` (computed from `R/2026-10-04-selfcheck.json`). For most object requests no UI was expected, so this is not a defect in itself.

### 2.4 Phase T game 1: "a game where you mine glowing crystals, upgrade your pickaxe and rebirth to unlock deeper caves"

| Area (0–10) | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Delivers the idea | 2 | 1 | 1 |
| World and level design | 1 | 1 | 1 |
| Art direction | 2 | 1.5 | 1.5 |
| Crystal and prop quality | 2 | 1 | 2 |
| UI/UX | 5 | 4.5 | 4 |
| Feedback and game feel | 3 | 1 | 1 |
| First 10 seconds | 1 | 2 | 2 |
| Broken/placeholder/amateur | 1 | 1 | not scored |
| **Overall** | **2** | **1.5** | **1.5** |

Sources: `PT/t1-round1/critique.md`, `PT/t1-round2/critique.md`, `PT/t1-round3/critique.md`.

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Worker / plugin | pre-fix | `0adfa451`, plugin 1.5.0 | `42697f17` |
| Tool calls | 90 (stopped by the owner's agent at call 89) | 10 | 44 |
| Model calls (flash) | 93 | 10 | 29 |
| Credits | not recorded (about 475 by neuron conversion) | 82 | 192 |
| Time | 12.8 min | 245 s | 298 s |
| End state | stopped by the agent | `done`, answered over its own "not ready" | `incomplete`, read-stall guard |
| Census | not recorded | 106 parts, 17 scripts, 0 sounds, 0 animations, 0 fx, 11 screens | 109 parts, 17 scripts, 0 sounds, 0 animations, 0 fx, 11 screens |

Sources: `PT/t1-round1/causes.md`, `R/2026-10-04-phase-t-r2.json`, `R/2026-10-04-phase-t-r3.json`, `PT/t1-round4/model-calls.json`. The credit figure for round 1 is derived (14,278 neurons in the model-call log divided by about 30 neurons per credit, a ratio seen in rounds 2 and 3). The model-call counts come from a one-day log that is marked `truncated: true`, so they may undercount.

**Round 1.** The agent improvised the whole world after `compose_game` failed 3 times. Screenshots (`PT/t1-round1/01-overview.jpg`, `02-spawn-eye.jpg`, `04-caves.jpg`, `06-play-view.png`):

- A near-black navy void with flat magenta crystal blobs on black plinths.
- A pure-yellow slab.
- Three HUD buttons, two of them both labelled Upgrades.
- A studded, bright upgrades panel that looks like a real Roblox game (`05-upgrades-panel.png`).

The critic's verdict: "a dark, unlit prototype made of flat neon-magenta blocks". It listed 28 flaws.

**Round 2.** The composer template (`plot-sim`) was taken as the whole game. Screenshots (`PT/t1-round2/01-overview.jpg`, `02-hub-eye.jpg`, `03-plot.jpg`):

- A default grey Baseplate with a white studded hub and four brown plots on thin tan paths.
- One knee-high real crystal asset on the hub, the only 3D object of note.
- A coherent UI: gem icon, Shop, Upgrades and a locked Rebirth button.

The owner's play recording (`PT/t1-round2/owner-play/frame-01.jpg` to `frame-09.jpg`) shows the avatar walking the empty plots:

- Crystals tick from 143 to 167 passively at "+1/s".
- Nothing can be pressed or mined.
- The Rebirth window says "Rebirth for $10K ... You need more money" in a crystal game (`frame-05.jpg`).
- The Shop pad label is sideways and mirrored (`frame-08.jpg`).
- The default Roblox spawn star decal sits in the middle of the hub.

**Round 3.** The same hub, same plots and same four brown pads (`PT/t1-round3/01-overview.jpg`, `03-plot.jpg` are visually the round-2 map with different icons). New regressions:

- The currency icon reverted to a plain "C" (`01-overview.jpg`).
- The "SHOP" and "REBIRTH" billboards overlap to read "SHOP REBIRTH" (`04-hub-eye.jpg`).
- The default spawn star is still there.

The agent inserted 4 real crystal models, left them stacked at one spot, then read the project 30 times with no build until a guard ended the run (`PT/t1-round3/causes.md`).

**Round 4.** Prepared at `2ffd22db`: worker 5,413 tests (5,407 passed, 6 skipped), root 630 tests, security 56/56, typecheck clean (`PT/t1-round4/validation.md`). The run started at 11:20 UTC with the original one-line prompt. No critique exists yet.

---

## 3. A taxonomy of failure modes

Method. I read every critique line of the 26 baseline rows, the 11 self-check rows, the 3 integrated rows and the three Phase T critiques, then assigned each item to the modes below by what the critique says. Counts are my judgement over the judge's text, with the item ids listed so anyone can check. "Phase T" counts rounds (of 3). Keyword counting alone was too loose, so these are hand-curated.

| # | Failure mode | Baseline (of 26) | Self-check (of 11) | Phase T (of 3 rounds) | Best single example |
|---|---|---|---|---|---|
| F1 | Wrong or unrelated library asset presented as the thing | 7: o01, o02, o04, o05, o06, s07, s11 | 0 (o03 imported a stock donut mesh, correct subject) | 0 | o01: "a giant knife ... standing on a blue slab" for a treasure chest (`R/2026-10-02-baseline.json`) |
| F2 | Template stamped as the answer | 17 got the same "Click it!/PRESSES" kit | 0 | 2: r2 and r3 (same `plot-sim` map) | r3 plot photo equals r2 plot photo (`PT/t1-round2/03-plot.jpg`, `PT/t1-round3/03-plot.jpg`) |
| F3 | No real assets; builds from basic blocks judged amateur | `professional` = 0 in 15 of 26 | `professional` = 0 in 1 of 11, never 2 | r1 flat magenta blobs; r2/r3 one real mesh only | o02 self-check: "a plain cyan cube with pink studs" (`R/2026-10-04-integrated.json`) |
| F4 | False claims (reply says what the place does not hold) | 7: s08, s09, s10, m13, m14, m15, u26 | 3: o02, s08, s10 (+2 of 3 integrated) | 1: r2 "I play-tested it: it ran" over a "not ready 79/100" | s08: "verified in the viewport" for three props none of which appear (`R/2026-10-04-selfcheck.json`) |
| F5 | Broken wiring or reference; mechanic dead or never exercised | 6: y20, y22, y23, g27, m13, s08 | 3: s08, s10, s11 | 2: r2 nothing pressable, r3 inserted crystals never wired in | s08: script looks up `'Baseplate'`, floor renamed `LavaFloor`, so the mechanic is dead |
| F6 | Wrong scale | 4: s10, o04, o06, u26 | 1: s10 | 3 of 3 | s10 baseline: a "tiny" hamster house built 50 studs long (about 10x player height) |
| F7 | Environment and lighting wrong or default | default or flat lighting called out in 19; bare baseplate in 24 (keyword count) | 10 (bare); 10 (lighting) | 3 of 3 (r1 near-black; r2, r3 flat daylight) | m14 spooky campfire: "a pitch-black void ... campfire floats" |
| F8 | No sound, no animation, no effects | `sound` = 0 in 24, `animation` = 0 in 10, `fx` = 0 in 17 | `sound` = 0 in 9, `animation` = 0 in 8, `fx` = 0 in 8 | 2 of 2 measured: 0 sounds, 0 animations, 0 fx | jukebox baseline: 0 sounds in the place |
| F9 | Missing core mechanic or named specific | 8: o05, m13, m15, p16, p17, p18, y23, u26 | 3: o02 (not a pet), s08, s10 (wheel is a slab) | 3 of 3 (no mining, no caves) | p18 "snowy village at night": bright daytime green field, no snow, no village |
| F10 | Read paralysis, loops, over-long runs | 4 ended by a guard or timeout at 75–124 steps: p16, p17, p18, g27 (+ y20 at 97) | 2 at 100+ steps: o04 (100), s08 (107) | r1 36 of 90 calls on reads/rereads; r3 about 30 reads of 44 calls, 0 builds | g27 obby: 124 steps, 582 credits, still "no script calls `Checkpoints.configure`" |
| F11 | UI duplication, overlap, leftovers | 3 stacked or bloated: p16 and p18 (four identical HUDs), y20 (26 ScreenGuis); leftover hidden elements in y20, y22, u25, g27 | 3: leftover hidden Title/Label (s08, s11), permanent redundant label (o05) | 2: r1 (3 "Upgrades" labels, modal overlap), r3 ("SHOPREBIRTH") | r1: blue UPGRADES, green Upgrades and a panel titled UPGRADES (`PT/t1-round1/critique.md` flaw 14) |
| F12 | Wasted steps on tool-format and ID errors | not itemised | o05 10 of 45 steps failed; s11 6 of 24; s09 4 of 47; s07 3 of 32 | r1 `compose_game` failed 3x, `insert_asset` refused 2x; r2 `compose_game` failed 4x; r3 2x | s09: three `insert_asset` calls with IDs "User is not authorized" (`HO/scripts/trace-report.py` on s09) |
| F13 | Cost, time and credit burn | maps 430–584 credits and 1,384–1,581 s; game 582 credits | objects 78–458 credits | r1 about 475; r2 82; r3 192 | o04 sword (a plain-block sword): 100 steps, 458 credits (`HO/frontier-issues.md` item 9) |
| F14 | The measurement itself is optimistic | not applicable | not applicable | judge 8/18 and 6/18 vs critic 1.5/10 | `R/2026-10-04-phase-t-r2.json` vs `PT/t1-round2/critique.md` |

### Mode-by-mode evidence and detail

**F2, template as the game.** The baseline kit was a stage, wobble animation, press counter and "Click it!" label, repeated on o01–o06, s07, s09–s11, m12–m15, p16, p18, u26 (`R/2026-10-02-baseline.json` critiques; `OB/BASELINE.md`). The owner called it out and withdrew the "frontier" claim (`docs/autonomy/NEXT_ACTION.md`). In Phase T the same mode reappears one level up. `compose_game` has only three templates (tycoon, plot-sim, lane-defense) (`PT/t1-round1/causes.md` C1). Round 2 and round 3 produced the same island, hub, four plots and empty props for a mining game (`PT/t1-round2/causes.md` D1; `R/2026-10-04-phase-t-r2.json` and `-r3.json` have almost identical censuses: 106 vs 109 parts, 17 scripts each).

**F3, no real assets.** The `professional` criterion has never scored 2 on any of 40 rows (computed). Critique wording is consistent: "basic blocks", "stacked smooth spheres", "segmented donut ring with visible seams", "flat plank shapes", "raw default parts: the studs texture is left on" (`R/2026-10-04-selfcheck.json` o01, o03, o06, s07). In Phase T round 1, `find_library_model` returned 0 results for "glowing crystal cluster" and the owner library returned an unrelated javelin. `insert_asset` was refused twice ("not authorized") (`PT/t1-round1/causes.md` C2). Rounds 2 and 3 fixed the search path, so the only real 3D asset in the game is one crystal mesh (the critic calls it "a pleasant purple-to-cyan gradient, a faceted spiky silhouette and a hint of translucency", `PT/t1-round3/critique.md`). There are no real rocks, cave pieces, terrain, textured materials or props.

**F4, false claims.**

- Baseline: s08 said the joke banner showed (its text was hidden). s09, s10 and u26 told the user clicks play a sound (0 sounds in the place). m13 said "same red paint" (the car was white and blue). m15 described a cupcake that "towers over the trees" (none was in frame).
- Self-check: s08 claimed "a giant rubber duck, a marshmallow and a hot dog cart ... verified in the viewport"; none were visible. The self-check's claim audit missed it (`HO/frontier-issues.md` s08).
- Integrated: o01 claimed "a wooden creak" with 0 sounds in the place.
- Phase T: round 2 ended "I play-tested it: it ran" right after its own `judge_game` said "not ready yet (79 out of 100)" (`PT/t1-round2/causes.md` D3).

This is arguably the costliest mode for a paying user, because it reads as success. The 2026-09-22 customer findings show the same class: `run_and_check` passed a coin game whose log said "managing 0 coins" (`docs/autonomy/CUSTOMER_FINDINGS.md` F-025).

**F5, broken references and dead mechanics.** Examples:

- s08 rename left a script looking up `'Baseplate'`.
- y23 had its DataStore call crash the whole server script.
- g27's Profile module crashed at load in an unpublished place, and no script configured the checkpoints.
- y20's playtest showed Coins 0 to 0.
- o02's behaviour config named a target path that did not resolve (`AppleBehave:793: target not found`, `HO/frontier-issues.md` item 2).
- Phase T round 3 inserted 4 crystals and never passed them as the machines' `from`.

**F7, environment and lighting.** 24 of 26 baseline critiques mention a bare default baseplate or no environment. Phase T showed two opposite errors for the same game:

- Round 1 was near-black ("most pixels are #000010–#101040", flaw 3).
- Rounds 2 and 3 were flat default daylight, which "kills the glow" (`PT/t1-round2/critique.md` flaw 8, `PT/t1-round3/critique.md` flaw 8).

Round 3's critic also reports inconsistent environments between shots 01 and 02–04. That is probably a camera or fog difference between the overview and eye-level captures, not two lighting states. Take that flaw with caution.

**F8, sound, animation and effects.** `sound` is the worst criterion everywhere (mean 0.08, then 0.18). The baseline's animation score was mostly a stamped wobble. Phase T rounds 2 and 3 each census at 0 sounds, 0 animations and 0 fx for a game about "glowing crystals". Plugin 1.5.0 only now allows `create_instances` to make Sound, Animator, Animation, IKControl and Explosion (commit `ba6f8b8c`, see section 5). Earlier, rules D-FXLIB-1 and D-UIONLY-1 refused hand-made Sound or TextLabel instances in scripts and pointed at library tools (`HO/scripts/trace-report.py` on o05 and s08).

**F10, read paralysis and loops.**

- Baseline: p16 ran 116 steps and was stopped at 25 minutes. p17 admitted it was "stuck in a loop redoing the same objects". p18 timed out at 75 steps. g27 stopped incomplete at 124 steps.
- Self-check: s08 used 107 steps (25 `get_instance`, 23 `set_properties`, 13 `rename_instance`); o04 used 100 steps for a plain-block sword.
- Phase T: round 1 spent 36 of 90 calls on reading and re-editing scripts (`PT/t1-round1/causes.md` C7). Round 3 spent about 30 of 44 calls reading, and its reply said "kept looking at your place instead of building the rest".
- September findings show the same loop: 20–40 paid re-read steps after building (F-030), a 32-step read-only diagnosis that missed a two-line bug (F-028), and a 101-step lighting tune (F-036) (`docs/autonomy/CUSTOMER_FINDINGS.md`).

**F12, wasted steps.** From the self-check traces (`HO/scripts/trace-report.py` output for o05, o06, s07, s08, s09, s10, s11):

- o05 spent 9 `add_behaviour` calls, 7 refused for argument shape ("sound does not take 'on'", "that Sound has no SoundId").
- s08 sent `propose_plan` with invalid JSON.
- s07 sent `build_object` with face "front" in lowercase, which failed the whole build.
- s09 and s11 both guessed asset IDs not authorised for the user (3 each). Round 1 had two refused as well.

**Other modes seen.**

- **Output ceiling.** In September a 6,500-token ceiling was hit mid-JSON, killing a build twice (`docs/autonomy/EXPERIMENTS.md` E-1, E-2). A 6,500-token output reappears in the round-4 log (`PT/t1-round4/model-calls.json`, run `54d2988f`, 6,500 output tokens, 84.9 s latency). Whether it was cut is not recorded.
- **Duplicate-named siblings.** The plugin refuses writes to ambiguous paths. The agent could not remove copies it made, and the benchmark reset failed (`OB/BASELINE.md` item 8). This was addressed by the `cap-dup-names` branch (not verified here).
- **Library models wrapped in a same-named container** (`HO/frontier-issues.md` item 8, open).
- **Phase T-specific content bugs:** money language in a crystal game ("Rebirth for $10K ... need more money"), mirrored sideways Shop label, default spawn star (`PT/t1-round2/causes.md` P2–P4).
- **Pricing and quota guards refusing a model** (section 6).

---

## 4. What demonstrably works

Each item below is sourced to a measured row or screenshot.

1. **UI pieces are the strongest output.**
   - The `ui` category had the highest baseline mean (9.67/18, `OB/BASELINE.md`). u24 and u25 each scored 10 and u26 scored 9 (`R/2026-10-02-baseline.json`).
   - In all three Phase T rounds the blind critic's "What is already good" praised the HUD. Round 1: "rounded, bevelled, high-contrast white text with a dark outline ... legible and recognisably Roblox-genre". Round 2: "a coherent button language ... the green, blue and purple colour-coding is consistent". Round 3: "consistent chunky, studded, rounded style" (`PT/t1-round{1,2,3}/critique.md` section 5).
   - UI/UX is the only area above 4/10 in any round (5, 4.5, 4).
2. **Studded UI style and the upgrades panel.** The round-1 upgrades panel has cards with icon, level badge, effect line and a big green buy button (`PT/t1-round1/05-upgrades-panel.png`). The critic wrote that it "has a clear layout ... the panel hierarchy works once the text sizes are fixed".
3. **Genre-correct feedback in the UI.** The "!" badge when an upgrade is affordable (round 1: "correct genre feedback"). The Rebirth button honestly shown as locked with a progress bar (rounds 2, 3). A gem icon on the counter after the round-2 fix (`PT/t1-round2/01-overview.jpg`).
4. **Live Creator Store asset search finds real meshes, and insert works.** In round 2 `find_library_model "glowing crystal cluster"` hit the live store and `insert_library_model` worked. In round 3 it found 4 models, previewed them and inserted all 4 (`PT/t1-round2/causes.md`, `PT/t1-round3/causes.md`). This is the first run where a Phase T build contained a real asset. Before the fix there were 0 results and two `insert_asset` refusals (round 1). The weakness is what happens next (F3, F5).
5. **Checks fire.**
   - Self-check's `look` limit refuses a 7th look ("look limit reached: 6 looks in one run ... say plainly what you did not check", o06, s09).
   - `run_and_check` refuses to playtest when the checkpoint cannot capture the objects, and the agent then used `play_check` (`HO/frontier-issues.md` item 6, "OK, by design").
   - A claim audit and in-product judge exist and sometimes catch issues (`judge_game` gave 79/100 "not ready" on round 2, even if the agent then ignored it).
   - The play test observes real values (leaderstats Crystals 0 to 136 in round 2; 1 to 103 in round 3, `R/2026-10-04-phase-t-r2.json`, `-r3.json`).
6. **Runs are clean and cheap in compute.** `noErrors` mean 1.58 (baseline) and 1.64 (self-check); `performance` mean 1.85 and 1.82. Phase T rounds 2 and 3 both report "0 errors". The one baseline exception was o02 with 20 client errors from broken texture packs (`R/2026-10-02-baseline.json`).
7. **System-type requests are the best functional category.** y21, the day and night cycle, is the highest baseline row (12/18, works 2). System items had `matches` 1.75, the best of any category (`OB/BASELINE.md`).
8. **Matching the request improved sharply once the harness stopped picking assets for the model.** Objects' `matches` rose from 0.33 to 1.83 on the same six items (computed). The agent now says plainly when nothing in the library fits.
9. **Honest stop messages work.** Round 3's reply: "Apple stopped because it kept looking at your place instead of building the rest ... Send another message and it will carry on" (`R/2026-10-04-phase-t-r3.json`). The critic quoted it as an admission, and it is accurate.
10. **Build-from-parts with an object plan produces recognisable things.** The self-check balloon (22 parts: striped envelope, burner, basket, ropes) scored 12/18. The critic's complaints are craft details: "stacked smooth spheres", no sound, floats 0.5 stud (`R/2026-10-04-selfcheck.json` o06; photo `R/2026-10-04-selfcheck/o06/three-quarter.png`).

---

## 5. Fixes already shipped against each failure mode, and what remains open

Commit evidence is from `git log handoff/fix-r3 --since=2026-10-03`. These are on the handoff branch, not on `main` (main's last commit is `f8991a96`). "Deployed" means what the causes files or validation file say was live for a given round: round 2 ran on worker `0adfa451`, round 3 on `42697f17`, and round 4 on `2ffd22db`. A commit not named in those notes may or may not be live; `PT/t1-round4/validation.md` says only that `2ffd22db` is deployed.

| Failure mode | Fixes (commit, source) | Measured since? | Still open? |
|---|---|---|---|
| F1 wrong asset | Phase 1 world-building removed the name-match library step and the noun-ban (integration branch; `OB/BASELINE.md` fixes 1–3). Live Creator Store search in `find_library_model` (`79f789f9`), GetObjects insert path (`a6ec8a58`), owner-library rows matching only in a path held back | Yes: `matches` 0.33 to 1.83 on objects (selfcheck run) | Mostly closed. Open: library models land nested as `X.X` (`HO/frontier-issues.md` 8); multi-piece models cannot preview (7) |
| F2 template as game | Round-2 composer starting kit: own currency, pressable machine, billboard pad, retired default spawn (`21ac40ac`). Prompt says a composer builds the base only (`42697f17`). The old click kit was stripped in phase 1 (`phase1-strip-request-specific.json` in `docs/handoff/2026-10-02/workflow-results/`) | Round 3 still looked like round 2 | **Open.** Only 3 composers exist (tycoon, plot-sim, lane-defense). A mining game still gets the plot-sim map |
| F3 no real assets, blocks only | Researched skills pushed into each plan step automatically (`f440b48b`); hundreds of researched skill recipes and 23 research notes fed to the corpus (`734cf9a6` ... `8d92a5d6`); researched game principles in the prompt (`23a756ff`) | No bench since | **Open.** No mesh generation, texture or real terrain pipeline is in the evidence |
| F4 false claims | Claim audit: a thing said to be seen must be one the run made or read (`443dca91`); self-check repair rounds fixed to not repeat the answer (`494c19df`); a composed game must be looked at and not answered over "not ready" (`7457db78`); a critique nobody acted on is admitted by area (`42697f17`) | Not on the bench. Round 3's reply was honest | **Open** as a class. `HO/frontier-issues.md` 12: self-check repairs did not fix what the look reported (s07, o06) |
| F5 broken references | `rename_instance` lists the script lines that still name the old object (`dc6eaf47`); `add_behaviour` and `model_anatomy` accept every Workspace path form (`cc3de8de`); composer uses the inserted models or says it did not (`87e7992d`); every failed tool keeps its error text on the trace (`70fbc134`) | No | `AppleBehave target not found` (`HO/frontier-issues.md` 2) listed OPEN |
| F6 scale | Prompt: "build at the scale of whoever it is for" (`80565282`); `look` gate | s10 self-check was before this commit and scored 7 | Round 1 flaw 5 and rounds 2–3 world-scale flaws were not targeted by a named fix |
| F7 environment and lighting | Layout flags from a model-free read of the Workspace tree (`d5ac716e`); look checks brightness (plan F1/F3, `PT/t1-round1/causes.md`); `set_mood` must reach a readable exposure | Round 2–3 still flat daylight | **Open.** Cave or dark-mood lighting for a glow game was not achieved in rounds 2–3 |
| F8 sound, animation, fx | Plugin 1.5.0 `create_instances` for Sound, Animator, Animation, IKControl, Explosion (`ba6f8b8c`, `d2b710fc`, `3ddef236`); prompt: "a finished thing moves, lights up and sounds as it naturally would, without being asked" (`25955635`) | No bench run after these | **Open.** Rounds 2 and 3 both census 0/0/0 |
| F9 missing core mechanic | Composer starting kit includes a pressable machine (`21ac40ac`); E2 "concrete numbered build steps" (`3a32d523`, marked WIP and NOT tested) | Not for mining or caves | **Open.** No mining, pickaxe or cave for game 1 |
| F10 read paralysis | Duplicate-streak guard and read-stall guard (earlier); a world-step fence with a new real `SessionDO` assertion (`PT/t1-round4/validation.md`); read-paralysis note (`3a32d523`) | Round 4 will be the first test | **Open** |
| F11 UI duplication | One layout per screen, honest icons, modal backdrop, Buy buttons grey out, Rebirth shows cost and progress (`7a88ca4b`, `b1baf691`, `4cca5a14`); round-3 pad billboards no longer overlap (`c3c79687`); gem icon restored (`14b10ce4`); default spawn star deleted (`08ba7b2e`) | Round 2: gem icon back, one button column. Round 3: regressions E3 (C icon, star, overlap), fixed in commits after round 3 | Closed by tests; round-4 critic needed |
| F12 wasted steps | `create_instances` answers a Script class before Studio and names `edit_script` (`42d0f762`); `build_object` text face in any case (`d505cd29`); plan refusal for invalid JSON | No | Insert of guessed asset IDs not yet constrained (`HO/frontier-issues.md` s11 suggestion: refuse IDs not from this run's search) |
| F13 cost | Phase-1 credit cuts; not itemised here | Objects now cost 78–458 credits (selfcheck) | **Open.** A plain-block sword cost 458 credits and 100 steps |
| F14 measurement | In-product blind critique of final screenshots before answering (`eb7bbbdb`, plan F5) | The judge-versus-critic gap was measured, not closed | **Open** |

Summary of what is still open at the time of writing: F2 (templates), F3 (assets), F7 (lighting and atmosphere), F8 (sound, animation, fx), F9 (core mechanic), F10 (read paralysis, awaiting round 4), F13 (cost), plus the unmeasured status of nearly every shipped fix.

---

## 6. Model capability evidence (build model: GLM 5.3 Flash)

The build model is `@cf/zai-org/glm-5.3-flash` on Workers AI, the plan, agent and vision roles (`PT/MODEL-COMPARISON.md`, `docs/autonomy/CURRENT_STATE.md`).

### 6.1 What the call logs show

From the one-day model-call log `PT/t1-round4/model-calls.json` (159 retained events, marked truncated), per Phase T run (computed):

| Run | Model | Calls | Mean input tokens/call | Median output tokens/call | Mean neurons/call | Calls with 40 or fewer output tokens |
|---|---|---|---|---|---|---|
| Round 1 | glm-5.3-flash | 93 (85 "low", 8 "high") | 34,920 | 75 | 154 | 37 |
| Round 2 | glm-5.3-flash | 10 (2 "low", 8 "high") | 33,209 | 506 | 244 | 0 |
| Round 3 | glm-5.3-flash | 29 | 34,171 | 93 | 198 | 5 |
| GLM 5.3 full, attempt 3 | glm-5.3 | 19 | 33,980 | 244 | 1,369 | 2 |
| Round 4 (partial) | glm-5.3-flash | 7 | 33,440 | 92 | 350 | 0 |

What this says, carefully:

- **One step is a re-read of about 34k tokens.** The context is the same size whether the step writes a script or reads a tree. Most of it is cached input (about 2.86M of 3.25M input tokens cached in round 1). A 90-call run therefore processes about 3.2M input tokens.
- **Most steps are tiny tool calls.** Round 1's median output was 75 tokens, and 37 of 93 calls produced 40 or fewer. That matches the trace shapes: single `get_instance`, `set_properties`, `rename_instance` calls. Round 2 differs because its steps were the 8 "high" steps in a short composer run.
- **No error outcomes in the retained log.** Every Flash call in the log has `outcome: ok`. The failures are in tool results and agent behaviour, not in the model API.
- **The 6,500-token ceiling is real.** Seen in September (E-1, E-2, F-001) and again in round 4.

### 6.2 Step counts, stalls and template reliance

- **Steps by category** (baseline ranges): object requests 3 steps (library grab), silly 2–26, modify 4–25, maps 75–116, game 124, system 6–97 (`R/2026-10-02-baseline.json`). In the self-check run the median is 32 steps and 4 of 11 items took 40 or more (`R/2026-10-04-selfcheck.json`).
- **Stalls.** Round 3: 44 calls, about 30 reads and 0 builds after the composer, ended by the read-stall guard. Its cause file says the model "could not turn 'build the world' into tool calls on its own" (`PT/t1-round3/causes.md` E2). Round 1: 36 of 90 calls on reading and re-editing (`PT/t1-round1/causes.md` C7). Self-check s08: 107 steps on a rename and property loop.
- **Template reliance.** In rounds 2 and 3 the model reached for `compose_game` and accepted its output as the game. It did this 4 and 2 times after failures respectively. In round 1, after three composer failures, it improvised and scored best (2/10) but never consulted the research corpus: "0 calls to `search_docs`, `search_creation_skills` or `read_creation_skill` across 90 calls" (`PT/t1-round1/causes.md` C3).
- **Ignoring its own checks.** Round 2 answered over `judge_game` "not ready (79/100)". Round 2 and round 1 ran with the visual check missing or last (`PT/t1-round2/causes.md` D4: 0 vision calls; `PT/t1-round1/causes.md` C6).
- **Format fragility.** Invalid JSON for `propose_plan` (s08), a wrong enum case failing a whole `build_object` (s07), wrong argument shapes on 7 of 9 `add_behaviour` calls (o05), guessed asset IDs (s09, s11, round 1).

### 6.3 The cancelled stronger-model comparison

On 2026-10-04 the owner decided to compare build models on game 1. Same worker (`42697f17`), same plugin, only the `plan` and `agent` roles changed through KV `config:models`. The vision role (look, blind critique, judge) stayed on Flash for all runs. The table in `PT/MODEL-COMPARISON.md` lists the baseline r3 (Flash, 1.5/10, 192 credits, 298 s, "inserted 4 real crystals, then read-stalled") and three challengers: `@cf/zai-org/glm-5.3`, `@cf/deepseek-ai/deepseek-v4-pro-0813` and `@cf/moonshotai/kimi-k2.7-code`.

What actually happened:

| Attempt | Outcome | Source |
|---|---|---|
| GLM 5.3 attempt 1 | Run failed in 3 s with "That step failed on our side", 0 steps. The product's own guards refused (no price row for the model) | `R/2026-10-04-phase-t-m-glm53.json`, `PT/MODEL-COMPARISON.md` |
| GLM 5.3 attempt 2 | Stopped in 2.5 s with `stopReason: quota` and "needs more context than a single step allows". The per-step 1,200-neuron cap refused it | `R/2026-10-04-phase-t-m-glm53b.json`, `PT/MODEL-COMPARISON.md` |
| GLM 5.3 attempt 3 | Ran 19 model calls (about 2 min 15 s) and used 26,018 neurons, mean 1,369 neurons per call, about 7x Flash's round-3 rate of 198. The owner cancelled it before it finished | `PT/t1-round4/model-calls.json` run `ecae2050`, `R/2026-10-04-phase-t-m-glm53c.json` (status `running`) |
| DeepSeek V4 Pro, Kimi K2.7 Code | Never run | `PT/MODEL-COMPARISON.md` |

The price-row and step-cap commits were reverted (`e90f16f6`, `f598acb8`), `config:models` was reset to `{}`, and the deployed build model is Flash (`PT/MODEL-COMPARISON.md`).

**What this does and does not prove.** There is zero quality evidence about any stronger model on this task. The round-3 cause file's statement "Model ceiling: 3 rounds, each fix exposes the next failure of multi-step building by GLM 5.3 Flash" (`PT/t1-round3/causes.md` E4) is a hypothesis from one game and one critic, not a measurement. The only hard fact about GLM 5.3 full is cost: about 7x per call at the same context size. The product's own budget guards were not built for it.

### 6.4 Other points on model capability

- **Flash can do real multi-step work when the path is open.** The self-check run's 11 objects cost 78–458 credits, and 10 of 11 got `works` of 1 or 2 (computed). The agent handled search, build, look, repair loops and playtests.
- **The weak points are long-horizon planning and spatial judgement.** The failures listed above (mirrored grids, scale errors, stacked inserts, no composition) are the ones a vision-aware planner would catch. The vision role is the same Flash model, and the `look` limit is 6 per run.
- **No evidence exists on other genres.** No run of obby, tower-defense, horror or tycoon under Phase T. The only whole games are in the pre-bench period, see 7.3.

---

## 7. The gap between today and "a game a top studio would ship"

### 7.1 Concrete gap, from the blind critiques

The critic's own description of the top-studio version, against what the screenshots show (`PT/t1-round1/critique.md` section 4, `PT/t1-round2/critique.md` section 4, `PT/t1-round3/critique.md` section 4):

| Dimension | Top-studio version (critic's numbers) | What Apple shipped (rounds 2–3) |
|---|---|---|
| World | Compact hub about 80x80 studs with a 40–60-stud landmark; mine entrance a 12x14-stud timber arch 40–60 studs away; enclosed by cliffs, rock ring or lava | Default grey Baseplate to the horizon; four brown pads on thin tan strips; no terrain, no walls, no sky work (`PT/t1-round2/01-overview.jpg`) |
| Caves and depth | 5 tiers with palettes (stone, copper, ice, magma, void); ramps, tunnels, gated doors with prices | None. "No cave, no tunnel, no depth" in all 3 rounds |
| Crystals | 20–40 clusters per mining area, 3–7 hexagonal prisms each, 3–8 studs tall (15+ for a hero node), Neon or glass, point light range 12–20, bloom | One crystal, knee-high, unlit (r2, r3); magenta blobs on black plinths (r1) |
| Lighting and mood | Dusk or cave dark, coloured crystal light, bloom, fog for depth, colour correction | Flat default daylight (r2, r3) or near-black (r1) |
| Mining interaction | Visible pickaxe in hand, "Mine" prompt, crack stages, shards, "+12" pop-up, counter bounce | Passive "+1/s" only. Nothing pressable (owner play, r2) |
| Stations | A forge, a market stall and a rebirth altar as real objects with billboards and prices | Three flat coloured rectangles; labels sideways, mirrored or overlapping |
| Upgrades | 5–8 items with level previews, cost with gem icon, greyed when unaffordable | 2 items (r1); r2/r3 composer shop rows |
| Rebirth | Progress bar, "x1.5 multiplier" teaser, distinct premium colour, visible portal in the world | A locked button with a bar and a "$10K" string in a crystal game |
| Onboarding | Objective line, floating arrow, first reward in under 10 s, first crystal within 5 studs of spawn | None |
| Sound | Music per tier, a sound on every action | 0 sounds |
| Animation and FX | Shard bursts, glow pulses, idle sparkles, camera nudge | 0 animations, 0 effects |
| Retention | Leaderboard, pets, boosts, daily reward | None |
| Mobile safety | Rebirth off the hotbar, 60 px top clearance, 44–64 px targets | Round 1 flagged hotbar collision and thumb-zone buttons; round 2's UI improved (`PT/t1-round2/critique.md` flaw 13 still complained about hierarchy) |

### 7.2 Gap in the bench's own terms

- **Ceiling.** The best of 40 judged rows is 12/18, and the rubric's 2 means "professional studio". `professional`, `polished`, `sound` and `animation` have never reached 2. So by the owner's own rubric no deliverable has reached studio level on even one criterion in these four dimensions.
- **Distance on the meter.** The whole-product meter was 27.8% at baseline. The weighted domains most connected to "ships like a studio" (visual 15.8%, sensory 17.3%, ui 37.5%) are all far below 100% (`OB/BASELINE.md`).
- **The Phase T bar.** The stop rule is "no severe flaw left and every area 8/10 or more". Game 1's best overall is 2/10 and its best single area is 5/10 (UI/UX in round 1).

### 7.3 Phase T bar criteria vs evidence available for game 1

| # | Criterion | Evidence |
|---|---|---|
| 1 | Core loop works | Passive income ticks and the economy is real (Crystals 0 to 136). Mining does not exist. Fails the idea (`R/2026-10-04-phase-t-r2.json`, owner frames) |
| 2 | First minute | Critic: no goal, arrow or reward (3 rounds) |
| 3 | Progression and economy | Rebirth cost of 10K at +3/s is a "~55 minute grind to first rebirth" with no content (`R/2026-10-04-phase-t-r3.json` critique). No cost-growth evidence otherwise |
| 4 | Saving | No evidence. September: "Save/rejoin is not proven" for Candy Garden (`docs/autonomy/CURRENT_STATE.md`) |
| 5 | Server authority | No evidence in these files |
| 6 | World art | Fails (section 7.1) |
| 7 | UI | Strongest: 4–5/10 by the critic. Mobile safety flagged in r1 |
| 8 | Sound | 0 sounds |
| 9 | VFX and feel | 0 effects, 0 animations |
| 10 | Monetisation hooks | No evidence. Critic noted the "+" button "reads as a currency top-up" (r2 flaw 13) |
| 11 | Clean run | Pass: 0 errors in the play check (r2, r3) |
| 12 | Honesty | Mixed: r2 overclaimed, r3 honest |

### 7.4 Whole-game evidence before Phase T

- **Candy Garden** (2026-09-29, "Grow a Garden but candy"): v1 205 steps and about 1,049 credits; v2 about 1,790 credits across three runs, two ended on stop guards. Playtest worked (buy, plant, grow, harvest) but with wrong "Harvest" shown while growing, locked seeds without prices, placeholder icons, and save/rejoin unproven (`docs/autonomy/CURRENT_STATE.md`).
- **"Plants vs Brainrots, brainrots are fruit"** was built in about 55 s by assembling a library game's core. The owner revoked the pass. It copied a whole world, picked existing brainrots with fruit names, and left creatures in T-pose (`docs/autonomy/CURRENT_STATE.md`).
- The owner then decided components must be built one at a time and whole-world reuse is not allowed. So the fastest path to a "whole game" (assemble from the owner library) is a path the owner rejected.
- **Bench g27 (obby, 10 stages):** 124 steps, 582 credits, 5/18, checkpoints dead. That is the only whole-game bench result, from 2026-10-02.

### 7.5 Caveats on this evidence

- **One game.** The Phase T conclusions rest on game 1 and a single critic per round. The critique files do not say which model played the critic.
- **Capture set shapes the score.** The critic never sees a play session, only four still images. "Nothing to mine" is confirmed by the owner's recording, but the critic's "no avatar" or "environment inconsistent between shots" comments are artefacts of the capture set (round 3 flaws 1 and 5).
- **Round 1 versus 2–3 are not like for like.** Round 1 was an improvised build with different tooling and a 7-image capture including edit-mode views. The slide from 2 to 1.5 is within what one critic's noise could produce. The consistent finding across rounds 2 and 3 is that the composer template was taken as the game, which gave a similar map with a clean HUD and no world.
- **Bench noise.** Each bench row is one run with one LLM judge. s08 swung from 7 to 2 between runs. Nothing has been run twice on identical code.
- **The baseline code is gone.** Baseline and later runs differ in code, so their gap is an ablation of "all fixes together", not of any single one.

---

## Open questions this section raises for the planners

1. **What is the product's target quality tier, and who judges it?** The bench judge (Flash, generous) and the blind critic (strict) disagree by a factor of 5 on the same build. Which scale defines "good enough to ship", and should the judge model be something other than the build model?
2. **Is the claim "a game a top studio would ship" achievable with a text-and-Parts agent at all?** The evidence shows no row above 12/18, no `professional` 2, and one real asset in a game. Does the final product need a mesh, texture and terrain generation pipeline, a much larger curated component library, or both?
3. **Does a stronger build model change the picture?** There is zero evidence either way (comparison cancelled, GLM 5.3 full costs about 7x per call). Is a comparison worth re-running with the budget guards fixed, and on which task set?
4. **Why did the bench improve on objects but not on silly requests, sound, animation and fx?** Is it a prompt problem (the "alive" principle shipped but unmeasured), a tool problem (audio class creation only just landed) or a capability limit?
5. **How should genre composers be structured so a mining game stops getting the plot-sim map?** Three templates cover three genres. Should the answer be more composers, a component-by-component builder (as the owner demanded on 2026-09-30), or both? What happens to F2 when the user's idea fits no template?
6. **How is read paralysis fixed for good?** Guards end the run but do not make the model build. Round 4 tests a world-step fence. Should planning, building and reading be separated into different agent calls?
7. **Cost per delivered object is now 78–458 credits against a 100-credit free day.** What is the intended pricing and free-tier shape, and which quality levers (self-check looks, repair rounds) justify their credits?
8. **How are false claims stopped structurally?** Claim audit exists but missed s08. Should the final reply be generated from verified evidence only, with no free-text claims about sound, visuals or tests?
9. **What should the evidence base be?** Do planners want the held-out bank (21 items) and games 2–5 run before deciding, and who owns the repeat-run and photo-review practice (no row has been run twice, no photo review recorded since the baseline)?
10. **Where do results live?** The post-baseline result files and photos are in the `RbxAI-ci` clone only. Should they be committed to the main repo before any planning work depends on them?
11. **Is the bench retired or not?** `GOAL.md` retires the bench loop and the V3 gates, yet `OB/BASELINE.md` and the meter formula are still the only cross-version yardstick. What replaces them for tracking progress between planning milestones?
12. **Is the owner library path (assemble a game from library cores) allowed in the final product?** The owner rejected whole-world copying on 2026-09-30. The final product's quality bar for "original" versus "assembled" decides whether the fast 55-second route is a feature or a liability.
