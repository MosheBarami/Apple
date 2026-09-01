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
| 2 | Benchmark materially beyond the rejected blockout | **PARTIAL** | 482 primitives vs 608 blockout; cliff faces now battered, not terraced; Glacier Heart still not a payoff from the gate |
| 3 | Frost Hollow primitive fallback resolved | **PROVEN** | 0 → 22 crystal meshes · `evidence/2026-09-01-detexture-ab.md` |
| 4 | Glacier Heart no longer a box stack | **PROVEN** | radial crystal burst; dais geometry fixed · same file |
| 5 | UI visual quality passes rendered review | **PARTIAL** | shop/HUD render well once `Icons` installed; not all screens reviewed |
| 6 | UI motion passes frame review | **PARTIAL** | **8 of 14** measured + reduced-motion implemented and proven · `evidence/2026-09-01-ui-motion-frames.md` |
| 7 | Creator Store asset intelligence used in real builds | **PROVEN** | 326 curated clones in the built world |
| 8 | Style-coherence gate rejects incompatible assets | **PROVEN** | mesas rejected twice, 7 of 9 Cube generations refused |
| 9 | Cube used where it improves; bad generations rejected | **PROVEN** | geode kept, cliffs rejected · `CUBE-GENERATION.md` |
| 10 | Vertical slice playable and coherent | **PARTIAL** | loop + persistence work; panels only reachable since `cd00b26` |
| 11 | Persistence in published-private benchmark | **PROVEN** | `evidence/2026-09-01-persistence-roundtrip.md` |
| 12 | Luau/architecture passes functional + security gates | **PARTIAL** | 16-rule grader, **plus 76 tests running the game's own Luau and 20 mutations proving they can fail**; L8 closed and **all four high-severity game findings (H1–H4) closed with Studio-measured evidence**. 8 findings remain, none in the game itself: A2–A6 (worker), B5–B6 (plugin), M6, M9. Writing the tests surfaced 5 more defects (F-26..F-30), all fixed |
| 13 | Provider selector absent from normal UX | **PROVEN** | only `admin.tsx` names a model, which §F permits |
| 14 | Hidden Cloudflare routing benchmark-driven | **BLOCKED** | AI Gateway credit · `BLOCKERS.md` #1 |
| 15 | Separate provider keys not required | **PROVEN** | routing verified keyless · `PHASE4-MODEL-ROUTING.md` |
| 16 | Plan / Agent / Super Agent real | **PROVEN** | modes shipped; Plan toolset genuinely read-only |
| 17 | Thinking/activity UX alive, structured, honest | **PROVEN** | state machine folded from real tool/phase events only; 4 §Y states named as underivable · `docs/THINKING-UX.md` |
| 18 | Inline near-live playtest viewport | **PROVEN** | real rasterised frames + measured blocker (no plugin viewport readback) · `docs/PLAYTEST-VIEWPORT.md` |
| 19 | Roadmap intelligence suggests/builds milestones | **PROVEN** | corrected: it DOES scan the live place (`ROADMAP_SCAN_LUAU`), detects genre, offers Plan/Build, 30 tests incl. the tower-defence-never-offered-rebirth negative proof |
| 20 | Durable design/source intelligence pipeline | **PROVEN** | machinery run against all 217 seeds; 119 resolved · `evidence/2026-09-01-source-corpus-classification.md` |
| 21 | Free UI/cartoon/studs/icon/motion/world kits classified | **PROVEN** | 217 classified: 68 reusable, 8 copyleft, 2 attribution, 139 quarantined |
| 22 | Discovery expands beyond the seed manifest | **PROVEN** | Wally 5,807 + Pesde 781 packages enumerated in full — 30x the 217-URL floor · `evidence/2026-09-01-registry-enumeration.md` |
| 23 | Licences/provenance preserved | **PROVEN** | `data/sources.json` tracked; SHA + SPDX + evidence path per source |
| 24 | Unsafe/exploit content quarantined | **PARTIAL** | 139 quarantined on licence; security scanner still has nothing downloaded to scan |
| 25 | Golem stops inventing every GUI from blank | **PROVEN** | a UI request now carries retrieved grammar into the system prompt; the default genuinely changed. Model-behaviour delta still unmeasured (gate 26) |
| 26 | Corpus materially improves UI/world evals | **PARTIAL** | 4 rules mechanised as checks; caught a real remaining defect (Icons contract) and it was fixed |
| 27 | UI Labs or equivalent isolated UI harness | **PROVEN** | `Stories.luau` renders states in isolation at 1.00 and 0.72 and MEASURES touch targets; found a real mobile trap · `evidence/2026-09-01-ui-stories-harness.md` |
| 28 | Icon intelligence from strong free sources | **PARTIAL** | original icon family ships; not sourced from a vetted library |
| 29 | Motion intelligence uses tested reusable patterns | **PARTIAL** | `MotionProbe.luau` + 4 motion rules in the library; still one game's patterns |
| 30 | Studs/classic a first-class art language | **PARTIAL** | 10 studs-classic + 9 retro-roblox rules, 12 sourced from creator-docs (CC-BY-4.0); no studs world built yet |
| 31 | Broad non-simulator UI/game patterns represented | **PARTIAL** | 51 rules over 17 of 23 families; 6 still empty (fantasy, sci-fi, modern, battleground-fps, social, dialogue-story) and the coverage test names them |
| 32 | Hugging Face pipeline measured and privacy-safe | **PARTIAL** | landscape characterised, licences read, duplicates identified; nothing uploaded/downloaded/trained · `evidence/2026-09-01-huggingface-luau-landscape.md` |
| 33 | No user project is training data without opt-in | **PROVEN** | standing policy, unchanged |
| 34 | Cost controls intact | **PROVEN** | no purchases; caps untouched |
| 35 | Security/tenant isolation intact | **PROVEN** | CI holds no secrets; tree clean |
| 36 | GitHub CI healthy | **PROVEN** | 6/6 jobs green on `90718b5` |
| 37 | No auto feature-branch production deploy | **PROVEN** | no deploy step in any workflow |
| 38 | No purchases / new paid services | **PROVEN** | none made |
| 39 | PR #1 carries honest evidence incl. rejections | **PROVEN** | body updated 2026-09-01 |
| 40 | Independent critic agrees it is not prototype | **PARTIAL** | 3 independent critics ran with clean context — security, engineering, worker/plugin. 4 criticals found and fixed; 13 findings recorded unfixed in `FAILURES.md`. No VISUAL critic yet |

## Tally

PROVEN 26 · PARTIAL 13 · UNPROVEN 0 · BLOCKED 1 · REJECTED 0

Only **one** gate (14) is externally blocked. Everything else marked UNPROVEN or
PARTIAL is reachable without owner action.

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

**L8 is now closed** (`f89609b`), and so are **H1, H2, H3 and H4** — every high-severity
finding the critics raised against the game itself.

76 Luau tests run the shipped modules byte-for-byte in the standalone CLI, and a mutation
check injects 20 known bugs to prove the suite goes red rather than merely staying green.
Writing them found five defects a reader had missed (F-26..F-30), including
`upgradeCost("pack", -50)` returning **0** — a free upgrade — and a Studio spec that appeared
to cover a fallback it never reached.

Every one of the four fixes was measured in a running Studio session rather than asserted:

| finding | what was measured |
|---|---|
| H1 | gate locked 232,62,62 @ T=0.350, unlocked 70,200,85 @ T=0.880, an 8-frame eased fade; the locked notice firing 2×/8s inside the zone, 0× in an owned one |
| H2/H3 | 18 tests across a production and a Studio chunk, because `IsStudio()` is read once at load |
| H4 | A/B against the pre-fix code: **1.95 → 0.08 crystals/s**, with walking (0.15/s) now out-earning teleporting |

Two of those measurements contradicted something I had already written down, which is the
argument for making them: H1's first fix painted zero parts and looked identical to success
(F-29), and the H4 harness had to be rebuilt twice before it reproduced the exploit at all.

**A correction to the record:** the commit closing H4 says "88 Luau tests". The real figure is
76. The count in this table is the one to trust.

## Next-highest-value unblocked work, in dependency order

1. **A2–A4, the three high-severity worker findings** — a lost stop button, a
   double-charged Spark on concurrent `startRun`, and a wedged run when `createCheckpoint`
   throws. These sit in TypeScript with 1,416 tests already around them, so they need no new
   harness — only the failing tests written first.
2. **B5–B6 (plugin lifecycle)** — no `plugin:Unloading`, and `task.cancel` on a possibly-dead
   thread. F-21's nil recording comes from the same place.
3. **M6** — the topbar inset, now confirmed on three surfaces (modal fixed, wallet column and
   notification layer not).
4. **UI motion coverage (6)** — harness proven, 6 of 14 categories still unmeasured.
5. **Cliff wall (2)** — needs a materially different approach than F-19.

Superseded: source corpus ingestion (21→24) and design retrieval (25) are landed; H1–H4 are
closed.
