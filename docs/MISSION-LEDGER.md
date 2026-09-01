# Phase IV+ completion ledger

The Master Mission's §AS lists 40 completion gates. This file maps each to a status
and, where it claims PROVEN, to the artifact that proves it. It exists to stop the
project declaring itself finished because a workstream ended or CI went green.

Statuses: **PROVEN** (evidence in repo) · **PARTIAL** (real but incomplete) ·
**UNPROVEN** (not attempted or not evidenced) · **BLOCKED** (external/human-only) ·
**REJECTED** (tried, measured, refused).

Last reconciled: **2026-09-01** (third pass, after three independent critics).

| # | Outcome (§AS) | Status | Evidence / note |
|---:|---|---|---|
| 1 | Branch + Draft PR coherent and reviewable | **PROVEN** | `feature/roblox-creation-intelligence`, PR #1 Draft, CI green |
| 2 | Benchmark materially beyond the rejected blockout | **PARTIAL — five approaches closed** | 548 primitives vs the 608 blockout, with real relief (three terraces, four walkable ramps) where there was one flat slab. **Gate 2's wall problem now has five closed approaches**: Cube mesas (F-13), mesh ratio (F-19), batter (F-33), decorate-the-box (§4), and oriented facets (F-39, closed by owner decision 2026-09-01). The diagnosis is established and measured — the old wall sat in an 11 % Lambert band, which explains why 2–4 failed — but the inference that spreading normals spreads pixels is disproven: this world's ambient floor compresses a 9.5× geometric range into far less on screen. The facet code stays for its non-visual wins (enclosure 1 → 0, Cliffs 164 → 136, a dominance cap where there was none, the stream fingerprint). What remains untried is composition and sub-facet surface detail, neither a variation on the five |
| 3 | Frost Hollow primitive fallback resolved | **PROVEN** | 0 → 22 crystal meshes · `evidence/2026-09-01-detexture-ab.md` |
| 4 | Glacier Heart no longer a box stack | **PROVEN** | radial crystal burst; dais geometry fixed · same file |
| 5 | UI visual quality passes rendered review | **PARTIAL** | The visual critic calls the UI kit **"the strongest thing in the build, by a distance"** — 4 px outlines throughout, FredokaOne uppercase with a 3 px stroke, panels at 60 % of viewport (§5.6 wants 50–70), **no text overflow across 149 rendered strings**. Three real defects against it: V6 (a shadow 91 px oversized and offset the wrong way in all four panels), V7 (SHOP duplicates UPGRADES), V9 (nav tiles square where §6 says circular). Still not reviewed as PIXELS in play mode — `screen_capture` returns magenta there |
| 6 | UI motion passes frame review | **PROVEN** | **all 12 applicable categories measured**, plus reduced motion. Two of the original 14 name surfaces this game does not have (no tab bar; the roadmap is a web surface). Measuring the last one found the wallet had no counting animation at all — now added and measured at ~400 ms over 25 steps, with shards deliberately still snapping · `evidence/2026-09-01-ui-motion-frames.md` |
| 7 | Creator Store asset intelligence used in real builds | **PROVEN** | 326 curated clones in the built world |
| 8 | Style-coherence gate rejects incompatible assets | **PROVEN** | mesas rejected twice, 7 of 9 Cube generations refused |
| 9 | Cube used where it improves; bad generations rejected | **PROVEN** | geode kept, cliffs rejected · `CUBE-GENERATION.md` |
| 10 | Vertical slice playable and coherent | **PARTIAL** | loop + persistence work; panels only reachable since `cd00b26` |
| 11 | Persistence in published-private benchmark | **PROVEN** | `evidence/2026-09-01-persistence-roundtrip.md` |
| 12 | Luau/architecture passes functional + security gates | **PROVEN** | 16-rule grader, **78 Luau tests over the game's own modules, 20 mutations all caught**, and **every one of the independent review's 13 findings closed or explicitly rejected** — 9 high-severity among them. Writing the tests surfaced 6 more defects (F-26..F-31), all fixed |
| 13 | Provider selector absent from normal UX | **PROVEN** | only `admin.tsx` names a model, which §F permits |
| 14 | Hidden Cloudflare routing benchmark-driven | **HUMAN-BLOCKED** | AI Gateway credit. **Settled by owner ruling 2026-09-01**: do not buy, do not ask again this run; real third-party inference is human-blocked, everything else about the router — architecture, mock testing, observability — is not, and is not gated on it · `BLOCKERS.md` #1 |
| 15 | Separate provider keys not required | **PROVEN** | routing verified keyless · `PHASE4-MODEL-ROUTING.md` |
| 16 | Plan / Agent / Super Agent real | **PROVEN** | modes shipped; Plan toolset genuinely read-only |
| 17 | Thinking/activity UX alive, structured, honest | **PROVEN** | state machine folded from real tool/phase events only; 4 §Y states named as underivable · `docs/THINKING-UX.md` |
| 18 | Inline near-live playtest viewport | **PROVEN** | real rasterised frames + measured blocker (no plugin viewport readback) · `docs/PLAYTEST-VIEWPORT.md` |
| 19 | Roadmap intelligence suggests/builds milestones | **PROVEN** | corrected: it DOES scan the live place (`ROADMAP_SCAN_LUAU`), detects genre, offers Plan/Build, 30 tests incl. the tower-defence-never-offered-rebirth negative proof |
| 20 | Durable design/source intelligence pipeline | **PROVEN** | machinery run against all 217 seeds; 119 resolved · `evidence/2026-09-01-source-corpus-classification.md` |
| 21 | Free UI/cartoon/studs/icon/motion/world kits classified | **PROVEN** | 217 classified: 68 reusable, 8 copyleft, 2 attribution, 139 quarantined |
| 22 | Discovery expands beyond the seed manifest | **PROVEN** | Wally 5,807 + Pesde 781 packages enumerated in full — 30x the 217-URL floor · `evidence/2026-09-01-registry-enumeration.md` |
| 23 | Licences/provenance preserved | **PROVEN** | `data/sources.json` tracked; SHA + SPDX + evidence path per source |
| 24 | Unsafe/exploit content quarantined | **PARTIAL** | 139 quarantined on licence. The **asset** gate is now calibrated against a real dated sample rather than invented fixtures: four free Creator Store "low poly rock" listings inserted and inspected in Studio — **half carried scripts**, two were the same mesh under different ids and creators, one was 419 primitives and no mesh. All four refused; the *type* rule alone stopped them before the script check. The corpus scanner still has nothing downloaded to scan |
| 25 | Golem stops inventing every GUI from blank | **PROVEN** | a UI request now carries retrieved grammar into the system prompt; the default genuinely changed. Model-behaviour delta still unmeasured (gate 26) |
| 26 | Corpus materially improves UI/world evals | **PARTIAL** | **11 of 107 rules mechanised as executable checks**, each validated against geometry or source that actually shipped broken. Two were added this pass and BOTH found live defects the moment they ran: `checkFocusFeedback` reported that every hover response in the game hung off `MouseEnter` while `SelectionGained` appeared nowhere, so a controller navigated a live selection graph that never acknowledged them (F-37); `checkTextScaleOrder` pins F-38, where `TextScaled = true` followed by `TextWrapped = false` left **105 labels** carrying a size constraint that did nothing. Neither was findable by looking — the second is invisible in every screenshot taken at the design resolution. `audit()` reports `enforced` separately from `library` |
| 27 | UI Labs or equivalent isolated UI harness | **PROVEN** | `Stories.luau` renders states in isolation at 1.00 and 0.72 and MEASURES touch targets; found a real mobile trap · `evidence/2026-09-01-ui-stories-harness.md` |
| 28 | Icon intelligence from strong free sources | **PROVEN** | 10 icon/asset rules extracted from `tijnepema/lucide-roblox` (MIT; SVGs ISC) and two agent-skill corpora, MEASURED in the checkout rather than read off prose — the square keyline is 18×18 at (3,3) in 134 files and the circle r10 deliberately overshoots it by one unit per side, which is the optical-vs-geometric-area correction stated as grammar. The shipped family stays original; what was taken is the construction rule, per §K |
| 29 | Motion intelligence uses tested reusable patterns | **PROVEN** | 7 golem-authored rules (three from frame-by-frame samples) **plus 13 extracted from four independent MIT motion libraries** — Flipper, otter, roact-spring, RbxCameraShaker. The second source is what closes this: three libraries AGREEING that a retarget inherits velocity is grammar, and their DISAGREEMENT on what a stop does is recorded as a decision to be made rather than smoothed into a false consensus |
| 30 | Studs/classic a first-class art language | **PARTIAL** | 10 studs-classic + 9 retro-roblox rules, 12 sourced from creator-docs (CC-BY-4.0); no studs world built yet |
| 31 | Broad non-simulator UI/game patterns represented | **PARTIAL** | **106 rules over 21 of 23 families.** `modern` closed from four component kits (synthetic Apache-2.0; onyx-ui, Iris, cyan-ui MIT) — and closed HONESTLY: the merge arrived claiming `modern` on 25 rules and `fantasy` on 3, the pinned coverage test caught it, and 19 `modern` claims plus all 3 `fantasy` claims were stripped as decoration on genre-neutral mechanics. Six rules keep `modern` because their content would differ in a cartoon-simulator. `fantasy` and `sci-fi` stay open |
| 32 | Hugging Face pipeline measured and privacy-safe | **PARTIAL** | landscape characterised, licences read, duplicates identified; nothing uploaded/downloaded/trained · `evidence/2026-09-01-huggingface-luau-landscape.md` |
| 33 | No user project is training data without opt-in | **PROVEN** | standing policy, unchanged |
| 34 | Cost controls intact | **PROVEN** | no purchases; caps untouched |
| 35 | Security/tenant isolation intact | **PROVEN** | CI holds no secrets; tree clean |
| 36 | GitHub CI healthy | **PROVEN** | 6/6 jobs green on `90718b5` |
| 37 | No auto feature-branch production deploy | **PROVEN** | no deploy step in any workflow |
| 38 | No purchases / new paid services | **PROVEN** | none made |
| 39 | PR #1 carries honest evidence incl. rejections | **PROVEN** | body updated 2026-09-01 |
| 40 | Independent critic agrees it is not prototype | **UNPROVEN** | 11 findings from the visual critic, **10 closed** (V10 objective slot, V7 shop duplication, plus V1–V6/V9/V11 earlier). **V8 is now materially addressed**: the world had been one 332×4×553 slab and now rises through three terraces to the wall foot, so the overlook reads as a basin rather than a tabletop — at the cost of an enclosure regression I caused and closed (F-40). **Gate 2 is NOT closed**: the wall was rebuilt from an oriented-facet vocabulary with proven machinery and an unproven picture (F-39). The gate stays UNPROVEN until a FRESH critic judges revised player-eye pixels, and §5 forbids arguing it upward from metrics |

## Tally

PROVEN 28 · PARTIAL 10 · UNPROVEN 1 · BLOCKED 1 · REJECTED 0

Only **one** gate (14) is externally blocked, on AI Gateway credit. Everything else marked
PARTIAL is reachable without owner action.

The UNPROVEN one is gate 40, and it moved there *from* PARTIAL. A visual critic ran and
returned "Prototype". Marking that PARTIAL because three other critics passed would be the
flattering arithmetic this ledger keeps having to correct.

**Counted from the table above rather than carried forward.** An earlier version of this line
said 26/13 and stayed at 26/13 while gates moved underneath it, which is the same class of
error as `audit()` reporting the size of the rule library as though it were coverage. The two
gates that moved are 6 (all applicable motion categories measured) and 12 (every review finding
closed or explicitly rejected, with 78 Luau tests and 20 mutations behind it).

### The worker is deployed

`persist.ts`, `stop-signal.ts`, `single-flight.ts` and the Durable Object concurrency changes are
live. Verified rather than assumed: `wrangler deployments status` reports the active version
created **2026-09-01T11:23:27Z**, which is after the last commit touching `apps/worker/src`
(`dfac79f`, 08:35 UTC) — so F-34 and F-35 are both in it.

## Rejected experiments (kept so they are not retried)

| what | why refused | record |
|---|---|---|
| Cube cliff mesas, textured | strata banding reads as candy stripe in context | `f4d7ad0` |
| Cube cliff mesas, de-textured | banding gone, leaves a smooth featureless column | F-13 |
| Raising cliff mesh ratio 0.62→0.85 | every metric improved, no pixels did; worsened repetition | F-19 |
| Neon motes | world is single-material by decision; §AQ meaningless neon | `dd90c85` |

## What the critics changed about this ledger

No gate went backwards, but gate 12's confidence should have. A 16-rule anti-pattern
grader that scores *model output* said nothing about the game it ships beside, and an
independent reviewer found four criticals in an hour. **L8 was the gap behind that:** 1,412
tests covered the surrounding TypeScript and not one line of the benchmark's Luau.

**Every finding from the independent review is now closed or explicitly rejected** — 13 of
them, 9 high-severity, across the game, the worker and the plugin.

| where | findings | outcome |
|---|---|---|
| game (Luau) | H1–H4, M6, M9, L8 | closed; each measured in a running Studio session |
| worker (TS) | A2, A3, A4, A5 | closed; behavioural tests through the real `SessionDO` |
| worker (TS) | A6 | **rejected**, with the reasoning written at the delivery site |
| plugin (Luau) | B5, B6 | closed |

A6 is the one that is not a fix. It asked for redelivery on the op channel; the plugin
acknowledges by reporting results *after* execution, so an unacknowledged batch is not evidence
it did not run, and re-sending would install duplicate mutation on the one path that touches
the user's place directly. That is the failure this worker is built around avoiding. The
decision, and what would change it (idempotency in the plugin), is recorded rather than left
for someone to rediscover.

**Six defects were found by writing the tests**, not by reading the code:

| id | what it was |
|---|---|
| F-26 | `upgradeCost("pack", -50)` returned **0** — a free upgrade |
| F-27 | `math.clamp` passes NaN through, so a comment promising otherwise was false |
| F-28 | the HUD's only number formatter could render `-0` |
| F-29 | H1's first fix painted **zero parts** and looked exactly like success |
| F-30 | three Studio tests covered a fallback they never reached |
| F-31 | **self-inflicted**: `persistAgent` called itself, so every save silently dropped the run's transcript |

F-31 was written by the same pass that was fixing four criticals, and F-29 was the first
attempt at fixing H1. Three of the six are working-looking code that did nothing at all. That
is the argument for the harness and the mutation check, and against trusting a diff review or
a green suite that cannot reach the code in question.

One claim in this session was wrong and is corrected in the record: I asserted that a
`DurableObject` subclass cannot be instantiated outside the Workers runtime, and wrote
source-level assertions on that basis. `packages/evals` had been constructing one over a fake
storage map since B10. "Untestable" needed the same evidence as any other claim.

## Owner rulings, 2026-09-01 — the three design calls, resolved

These were left for the owner because they are product and art decisions rather than defects.
They are now decided, and the decisions are recorded here rather than only in a chat message so
the next reader inherits the reasoning and not just the outcome.

| call | ruling |
|---|---|
| **SHOP vs UPGRADES** | Keep both **only if they become meaningfully distinct**. UPGRADES is permanent progression tied to the core loop; SHOP is non-upgrade inventory / utility / consumable / cosmetic, bought with **earned currency — no Robux, no paid monetisation in this benchmark**. And explicitly: if there is not enough real SHOP content to justify a panel, **remove it rather than ship a duplicate**. "Do not create filler merely to preserve the button." |
| **The flat world** | Now "a deliberate visual/game-design failure, not a minor polish item". Recompose the playable topology so elevation affects silhouette, discovery, paths, sightlines, landmark reveal, zone transitions, movement and spatial hierarchy — *not* by moving props up and down. Restrained: "a simulator/tycoon benchmark, not a platforming obby." Navigation stays obvious. **Evaluate at player eye height.** |
| **The empty top-centre pill** | Becomes the contextual **primary objective / progression HUD**, driven from real game state — "do not invent fake objectives" — and it **disappears** when no meaningful objective exists. Its transitions become one of the remaining motion-evaluation categories. |

Two further rulings that change how the rest of the mission is run:

- **Gate 2 (canyon walls) is the highest-value world-art problem**, and the four
  decorate-the-box experiments are closed: "Do not repeat those paths." A materially different
  construction strategy is required.
- **Gate 40 is the real visual truth.** The "Prototype" verdict supersedes earlier optimistic
  visual claims, and: *"Do not attempt to argue the score upward from metrics."* The benchmark
  stays UNPROVEN until a **fresh** critic — one that has not seen the implementation narrative,
  and is told nothing about tests, parts, meshes or hours — judges revised player-eye pixels.

## Next-highest-value unblocked work, in dependency order

1. **Cliff wall (2)** — the two routes F-19 named are now costed. "More distinct rock
   silhouettes" is **not** a matter of searching harder: the free Creator Store's rock supply is
   re-uploads of a small number of meshes distributed with scripts attached, and the one clean
   tintable candidate duplicated a silhouette the palette already owns
   (`evidence/2026-09-01-rock-palette-supply.md`). What remains is **generation** (the Cube path
   that produced the accepted geode and six rejections) or **authored courses that are not
   slabs** — built rather than acquired. Neither is blocked; both are larger than a search.
2. **Thinking UX (17)** and **playtest viewport (18)**.
3. **Asset provenance ledger** — the logic is tested; nothing populates it yet.

Superseded: source corpus ingestion (21→24) and design retrieval (25) are landed; every
review finding is closed or rejected.
