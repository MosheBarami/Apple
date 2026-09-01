# Phase IV+ completion ledger

The Master Mission's §AS lists 40 completion gates. This file maps each to a status
and, where it claims PROVEN, to the artifact that proves it. It exists to stop the
project declaring itself finished because a workstream ended or CI went green.

Statuses: **PROVEN** (evidence in repo) · **PARTIAL** (real but incomplete) ·
**UNPROVEN** (not attempted or not evidenced) · **BLOCKED** (external/human-only) ·
**REJECTED** (tried, measured, refused).

Gate 14 is written **HUMAN-BLOCKED**, which is `BLOCKED` with the reason spelled out; it counts as
BLOCKED in the tally. No other spelling variants are in use.

Last reconciled: **2026-09-01** (third pass, after three independent critics).

| # | Outcome (§AS) | Status | Evidence / note |
|---:|---|---|---|
| 1 | Branch + Draft PR coherent and reviewable | **PROVEN** | `feature/roblox-creation-intelligence`, PR #1 Draft, CI green |
| 2 | Benchmark materially beyond the rejected blockout | **PARTIAL — five approaches closed** | 548 primitives vs the 608 blockout, with real relief (three terraces, four walkable ramps) where there was one flat slab. **Gate 2's wall problem now has five closed approaches**: Cube mesas (F-13), mesh ratio (F-19), batter (F-33), decorate-the-box (§4), and oriented facets (F-39, closed by owner decision 2026-09-01). The diagnosis is established and measured — the old wall sat in an 11 % Lambert band, which explains why 2–4 failed — but the inference that spreading normals spreads pixels is disproven: this world's ambient floor compresses a 9.5× geometric range into far less on screen. The facet code stays for its non-visual wins (enclosure 1 → 0, Cliffs 164 → 136, a dominance cap where there was none, the stream fingerprint). What remains untried is composition and sub-facet surface detail, neither a variation on the five |
| 3 | Frost Hollow primitive fallback resolved | **PROVEN** | 0 → 22 crystal meshes · `evidence/2026-09-01-detexture-ab.md` |
| 4 | Glacier Heart no longer a box stack | **PROVEN** | radial crystal burst; dais geometry fixed · same file |
| 5 | UI visual quality passes rendered review | **PARTIAL** | The visual critic calls the UI kit **"the strongest thing in the build, by a distance"** — 4 px outlines throughout, FredokaOne uppercase with a 3 px stroke, panels at 60 % of viewport (§5.6 wants 50–70), **no text overflow across 149 rendered strings**. Three real defects against it: V6 (a shadow 91 px oversized and offset the wrong way in all four panels), V7 (SHOP duplicates UPGRADES), V9 (nav tiles square where §6 says circular). Still not reviewed as PIXELS in play mode — `screen_capture` returns magenta there |
| 6 | UI motion passes frame review | **PARTIAL** | The probe has now RUN: 497 frames over 45 s against the three objective-chip motions, driven through the real `Sync` remote with targets resolved by function every frame · `evidence/2026-09-01-motion-probe-run.md`. **It found a bug in itself first**: `posTravel` measured `pos.Y` alone and returned **0.0 px across 451 frames** of a motion whose whole vocabulary is a horizontal slide — and `moved` is derived from it, so a purely horizontal animation could read as no animation. Both axes now: the same motion measures **1109.7 px**. Honest limit, stated rather than glossed: Studio renders this scene at ~15 fps, so a 220 ms motion is resolved by about three samples — enough to prove travel and peak, **not** enough to characterise an easing curve. Still PARTIAL: 6 of 14 categories have a series |
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
| 18 | Inline near-live playtest viewport | **PARTIAL — recovered from UNPROVEN** | **The first frame exists.** `apps/plugin/src/Render.luau` was installed into Studio unmodified and called through its real entry point against the live place: 192×144, **930 parts rasterised in 39 ms**, 110,592 base64 chars (exactly 192×144×3). It is recognisably the world. Pushed through the real `frame-bus.ts`: RLE24 packs it 82,944 → **8,868 bytes (10.7 %)** and **round-trips byte-exactly**, `admitFrame` accepts it, and the ceilings genuinely refuse an oversize payload (`too-large`) and a dimension mismatch (`too-many-pixels`) — the codec's correctness property now holds on real geometry rather than a fixture. **Not PROVEN**: the browser decoder has not drawn this frame for a user, the card is not deployed, and the `run_and_check` capture loop did not drive it · `evidence/2026-09-01-playtest-frame.md` |
| 19 | Roadmap intelligence suggests/builds milestones | **PARTIAL — and the scan has now actually run** | `ROADMAP_SCAN_LUAU` executed against a real place for the first time: 76,496 bytes of evidence off Crystal Canyon, 1,159 instances, 974 parts, 34 scripts, POSTed out of Studio and run through `parseScan → analyzeProject → buildRoadmap`. **It got the answer wrong, in three separate ways, none of them visible by reading the code** (F-43): it called a shard-collecting simulator a *racing game* with confidence 0 and generated `race_track` / `race_vehicles` / `race_results`. All three fixed and pinned by 6 new tests (36 total). Still PARTIAL rather than PROVEN: the polish pass needs a model, which is gate 14's blocker |
| 20 | Durable design/source intelligence pipeline | **PARTIAL** | Of §7's eight stages, **six now execute**: discovery, provenance, rights, **security** (23 of 23 checkouts scanned, verdicts written back — 0 of 217 records carried one this morning), **content hashing** (23 records, and the collapse policy finally has its demonstration: the two fork pairs the corpus had flagged "content-hash before granting independent weight" land on opposite sides of the 0.30 threshold — RbxCameraShaker/fork at 0.0833 is divergent, the two `framer` repos at 0.7500 are one idea twice), and pattern extraction. Running the last two found **three real bugs in the pipeline itself** (F-41). **Playbooks (L3) now exist and are measured**: 3 playbooks / 13 steps, each step citing rule ids rather than restating prose, wired into evals as `playbook_complete`. The rung is demonstrated rather than asserted — on a bare-Frame answer to "build a shop panel", `audit({files})` returns 0 findings and the playbook returns 4 of 5 steps missing, because every enforced check is a violation detector and omission is invisible to all of them. Running it found F-45 (the playbook taught a mouse-only press path that `Theme.luau:1088` had already ruled out) and F-46. **Quality score, domain tag and engineEra now also run**, which closes §7's stage list: 23 of 23 records carry a quality score, 13 carry an era, 13 carry detected libraries. Running those found three more defects, one of them total — **`retrievalRank` had been returning 0 for every source in the corpus** (F-47), because `scan.mjs` wrote its verdict to the source record and retrieval gates on the provenance record. With that fixed and real scores populated, 23 of 23 sources rank and 17 of 22 positions changed. F-48 and F-49 are the other two. Quality is measured against stars at r = 0.10, so it is not a popularity proxy. **Then the pipeline was run end to end on new material**: 15 distinct repos fetched (23 → 38 checkouts), all 38 hashed, scanned, tagged and scored. All four era classes now appear in real data rather than only in tests, and the security gate excluded the batch's highest-value source correctly — `NevermoreEngine` ships a Studio bridge for executing arbitrary code — while F-51 fixed a lockfile false positive beside it |
| 21 | Free UI/cartoon/studs/icon/motion/world kits classified | **PROVEN** | 217 classified: 68 reusable, 8 copyleft, 2 attribution, 139 quarantined |
| 22 | Discovery expands beyond the seed manifest | **PROVEN** | The PROVEN rating was withdrawn because the Wally/Pesde enumeration was a one-off measurement that fed nothing: aggregate counts only, no list, no re-runnable code, and all 217 records still reading `origin: "seed-manifest"`. **`src/enumerate.mjs` now walks both indexes and emits one record per PACKAGE** — 6,410 packages, 1,082 with a resolvable GitHub URL, 1,071 of them novel — and `discover.mjs --includeRegistry` resolves and classifies them. The corpus is **217 → 289 records**, 51 registry candidates resolved: 41 COMMERCIAL_REUSABLE, 9 quarantined, 1 copyleft. It also corrects a figure the old rating cited: Pesde has **601** packages, not 781 — the one-off counted `scope.toml` metadata files as packages. Not PROVEN because 1,020 candidates remain unresolved; the mechanism is demonstrated end to end, the backlog is arithmetic  **The 1,020 unresolved candidates are now resolved, and the blocker was never scale.** `run()` had accepted `includeRegistry` since the enumerator landed and the CLI called `run({ force, limit })`, so 1,071 novel candidates were reachable only from a test file — the same shape as five design checks that existed, passed their tests, and were not exported from their package. One argument. Ingested: the corpus went **289 → 1,240 sources, 170 → 1,019 resolved, and lawfully-reusable 109 → 769** (COPYLEFT 9 → 60, quarantine 169 → 409, 125 errored and counted rather than dropped). `discover-cli.test.mjs` now reads `run()`'s destructured signature and fails if any option it accepts cannot be set from the command line. What this does NOT claim: discovered is not fetched. **747 lawfully-reusable sources currently teach nothing**, and that number — up from 87 — is the honest measure of where the remaining value is |
| 23 | Licences/provenance preserved | **PROVEN** | `data/sources.json` tracked; SHA + SPDX + evidence path per source |
| 24 | Unsafe/exploit content quarantined | **PARTIAL** | 139 quarantined on licence, and **the security gate now runs**: 23 of 23 checkouts, 0 unsafe. Running it found a bug in the SCANNER rather than the corpus — a bare `HttpGet(` matched any function of that name and condemned `evaera/roblox-lua-promise` as an executor on its own Promise tutorial. Three independent attacks on the proposed fix each found a **working hole** (a numeric-array loader in `.json`, a hex blob in `.toml`, a numeric array in a `.md` fence), so the fix went narrow: `packed-line` now requires the long line to be OPAQUE rather than merely long. All three attacks and all three false positives are permanent tests. creator-docs' five remaining findings sit on a **SHA-pinned accepted register** — verified that changing the SHA re-flags all 18. Still true: 194 of 217 sources are unscanned because unfetched  **The gate has now excluded something, which is the thing it existed to do and had never done.** Re-run over 38 checkouts after a targeted fetch: `Quenty/NevermoreEngine` is UNSAFE as a `remote-payload-loader` — it ships a Studio bridge whose purpose is executing arbitrary code — and the verdict stands rather than being waved through on the library's 608-star reputation; it is deliberately NOT on the SHA-pinned `ACCEPTED` register, because that register is for human-reviewed exceptions and reviewing my own is what §4 exists to prevent. A false positive beside it was fixed narrowly (F-51: a `package-lock.json` disqualified `evaera/Cmdr`; lockfiles are now excluded upstream by four exact filenames, and the register's now-dead hand-written acceptance was removed rather than left to claim a review the scanner no longer reaches). `Roblox/react-luau` stays in REVIEW on a generated blob that cannot be recognised by name, which is a human decision rather than a gap. Retrieval is tested in BOTH directions against the same policy the ranker applies. **Why this is still PARTIAL:** 58 of 1,240 records carry a scan verdict, because a source cannot be scanned before it is fetched, and 497 lawfully-reusable repositories are still unfetched. The mechanism is proven; the coverage is not |
| 25 | Golem stops inventing every GUI from blank | **PROVEN** | a UI request now carries retrieved grammar into the system prompt; the default genuinely changed. Model-behaviour delta still unmeasured (gate 26) |
| 26 | Corpus materially improves UI/world evals | **PARTIAL** | The audit's criticism was exact — "the word doing the work is *evals*, and there is no eval", because `packages/evals` did not import `@golem/design` at all. **Now it does**: `no_design_violation` is a check type beside `no_antipattern`, so the mechanised rules run against code a MODEL wrote rather than only against this repository's source. Five of the eleven are text-decidable and wired; the other six need measured geometry and say so rather than guessing. Wiring it exposed that **five of the eleven checks were never exported from the design package at all** — the first consumer to import it failed to load. F-37 and F-38 are now regression fixtures for generated code. A second check type now sits beside it: `playbook_complete`, the only check here that can fail model output for what it does **not** do. What is still not done: running either against an actual model, which is gate 14's blocker  **§8's three questions now all have answers**, which is the concrete form of this gate's claim: the corpus is judged by whether the simulator/tycoon build gets better, and §8 names what better means. Progression curves — ours grow 1.6–1.8 over 8–12 levels, a shipped MIT tycoon 1.15–1.28 over 250–500, which at twelve levels is 643× versus 4.7× on the last upgrade. Deprecated patterns in our own build — none, across 37 files, after a false positive in the tagger was fixed. StyleSheet/StyleRule — answered from the engine reference because no checked-out game uses the API, and it found **five existing rules hand-rolling conditions the engine already selects on** (`@ReducedMotionEnabledTrue`, `@PreferredInputGamepad`, `@PreferredInputTouch`, `@PreferredTextSize*`, `@ViewportDisplaySize*`). 107 → 113 rules, plus a `progression` component. **Still PARTIAL for the same reason:** none of this has been run against a model, which is gate 14's blocker  **And the corpus produced a scripting rule, on the mission's highest-priority track.** `slime-factory-tycoon`'s `Validate.finite` rejects NaN because it "breaks every comparison" — so a handler that type-checks AND range-checks a remote number still admits NaN, since every comparison against it is false while infinity is caught by the upper bound. Verified first: that shape matched **zero of the eighteen** existing rules. Now rule 19, `range-check-admits-nan`. Running all nineteen over our own server code then found two defects in the rules rather than in the code — F-52 (`datastore-without-pcall` flagged `DataService`'s retry helper, so the rule was grading the better answer worse, and `datastore-without-retry` four rules below asks for exactly the helper it penalised) and F-53 (`deprecated-api` counting `wait()` inside a string, in the rule that grades models). 18 → 19 rules |
| 27 | UI Labs or equivalent isolated UI harness | **PROVEN** | `Stories.luau` renders states in isolation at 1.00 and 0.72 and MEASURES touch targets; found a real mobile trap · `evidence/2026-09-01-ui-stories-harness.md` |
| 28 | Icon intelligence from strong free sources | **PROVEN** | 10 icon/asset rules extracted from `tijnepema/lucide-roblox` (MIT; SVGs ISC) and two agent-skill corpora, MEASURED in the checkout rather than read off prose — the square keyline is 18×18 at (3,3) in 134 files and the circle r10 deliberately overshoots it by one unit per side, which is the optical-vs-geometric-area correction stated as grammar. The shipped family stays original; what was taken is the construction rule, per §K |
| 29 | Motion intelligence uses tested reusable patterns | **PROVEN** | 7 golem-authored rules (three from frame-by-frame samples) **plus 13 extracted from four independent MIT motion libraries** — Flipper, otter, roact-spring, RbxCameraShaker. The second source is what closes this: three libraries AGREEING that a retarget inherits velocity is grammar, and their DISAGREEMENT on what a stop does is recorded as a decision to be made rather than smoothed into a false consensus |
| 30 | Studs/classic a first-class art language | **PARTIAL** | 10 studs-classic + 9 retro-roblox rules, 12 sourced from creator-docs (CC-BY-4.0); no studs world built yet |
| 31 | Broad non-simulator UI/game patterns represented | **PARTIAL** | **106 rules over 21 of 23 families.** `modern` closed from four component kits (synthetic Apache-2.0; onyx-ui, Iris, cyan-ui MIT) — and closed HONESTLY: the merge arrived claiming `modern` on 25 rules and `fantasy` on 3, the pinned coverage test caught it, and 19 `modern` claims plus all 3 `fantasy` claims were stripped as decoration on genre-neutral mechanics. Six rules keep `modern` because their content would differ in a cartoon-simulator. `fantasy` and `sci-fi` stay open  **The material for the remaining families is now on disk**: this session fetched Fusion, Roact, react-luau and vide (UI frameworks) and three full games including a legacy-era simulator, all licence-clear and security-scanned. None has been extracted from yet — extraction is still hand-driven, which the ten-track audit named, and it is now the binding constraint on this gate rather than discovery being |
| 32 | Hugging Face pipeline measured and privacy-safe | **PARTIAL** | landscape characterised, licences read, duplicates identified; nothing uploaded/downloaded/trained · `evidence/2026-09-01-huggingface-luau-landscape.md` |
| 33 | No user project is training data without opt-in | **PROVEN** | standing policy, unchanged |
| 34 | Cost controls intact | **PROVEN** | no purchases; caps untouched |
| 35 | Security/tenant isolation intact | **PROVEN** | CI holds no secrets; tree clean |
| 36 | GitHub CI healthy | **PROVEN** | 6/6 jobs green on `90718b5`  *Citation note (2026-09-01): the SHA above is now 111 commits behind HEAD. The claim was re-checked rather than re-dated — CI on HEAD is green across all six jobs, the same shape the cited run had — so the gate stands and only its pointer is stale.* |
| 37 | No auto feature-branch production deploy | **PROVEN** | no deploy step in any workflow |
| 38 | No purchases / new paid services | **PROVEN** | none made |
| 39 | PR #1 carries honest evidence incl. rejections | **PROVEN** | body updated 2026-09-01 |
| 40 | Independent critic agrees it is not prototype | **UNPROVEN** | 11 findings from the visual critic, **10 closed** (V10 objective slot, V7 shop duplication, plus V1–V6/V9/V11 earlier). **V8 is now materially addressed**: the world had been one 332×4×553 slab and now rises through three terraces to the wall foot, so the overlook reads as a basin rather than a tabletop — at the cost of an enclosure regression I caused and closed (F-40). **Gate 2 is NOT closed**: the wall was rebuilt from an oriented-facet vocabulary with proven machinery and an unproven picture (F-39). The gate stays UNPROVEN until a FRESH critic judges revised player-eye pixels, and §5 forbids arguing it upward from metrics  **Attempted again this session and blocked on tooling, not on judgement.** The built world in Studio was verified current (84 wedges / 14 corner wedges in `Cliffs`, `Apron` present with its 4 ramps) and the canonical `Viewpoints` cameras resolve correctly against live geometry via `execute_luau` — but `screen_capture` times out, and a capture attempt takes the whole MCP transport down with it — `execute_luau`, which had been working, then reports no connected instance too, and recovers only until the next capture. Five attempts, same sequence each time. So the fault is the capture transport rather than the capture parameters. The one capture path that does work is the plugin's own rasteriser, and the reason it cannot stand in is not its resolution — `Render.renderView` could be driven at 320x240 with the canonical player-eye CFrames. It is that the rasteriser renders flat `SmoothPlastic` with no lighting, materials, shadows or atmosphere: it can answer whether the composition reads, and it structurally cannot answer *"is this a finished game or a prototype"*, which is the question this gate asks. Offering a flat-shaded render as "revised player-eye pixels" would be the same move as arguing the score up from metrics. The gate stays UNPROVEN; the blocker is the Studio `screen_capture` transport |

## Tally

PROVEN 26 · PARTIAL 12 · UNPROVEN 1 · BLOCKED 1 · REJECTED 0

*Counted by matching gate rows, not by grepping for the word — which also matches the
"downgraded from PROVEN" notes and inflates the total past 40.*

**Gate 22 returned to PROVEN**, which is the first of the five downgraded gates to recover
fully. It did so on the strength of the thing the audit said was missing — the enumeration now
feeds the corpus rather than a summary line — and the corpus went 289 → 1,240 sources with
lawfully-reusable rising 109 → 769.

The two gates that are not PROVEN or PARTIAL are both blocked on something outside the
repository: **14** on AI Gateway credit, and **40** on the Studio capture transport, which drops
the whole MCP connection on every capture attempt. Neither is blocked on judgement or on work
left undone here, and 40 in particular stays UNPROVEN rather than being argued upward — the one
capture path that does work renders flat `SmoothPlastic` with no lighting, and so cannot answer
the question the gate asks.

**Corrected 2026-09-01 by a ten-track independent audit** (`evidence/2026-09-01-mission-track-audit.md`)**, and the correction went the wrong
way on purpose.** Five gates were downgraded: 6, 18, 19, 20 and 22 — three of them out of
PROVEN entirely. The audit ran one auditor per track and then a SECOND agent whose only job was
to refute that auditor's own weakest claim, and the two refutations that landed were both
against claims *I* had written.

The pattern in all five is the same and it is worth naming, because it will recur: **a
code-existence claim written as an execution claim.** `ROADMAP_SCAN_LUAU` exists and has never
run. The playtest frame bus exists and has never produced a frame. The registry enumerator
counted 6,588 packages and fed them to nothing. `MotionProbe.luau` exists and no frame data was
kept. Each was true about the repository and false about the world, and each read as PROVEN.

Gate 18 is the sharpest: it was flipped UNPROVEN → PROVEN **two minutes after the feature
commit**, citing "real rasterised frames", when not one frame had been produced.

**Since the correction, three of the five have been worked and two recovered.** Gate 22 went
UNPROVEN → PARTIAL by replacing the counted-and-discarded enumeration with a committed
enumerator, a real per-package list and a working handoff into classification (F-42); gate 20
went from three of eight stages executing to six, by writing the runners for the security and
content-hash stages, which found five defects in code that was tested and called by nothing
(F-41); and gate 26's criticism — "the word doing the work is *evals*, and there is no eval" —
was closed by making the design library's rules a grader check type.

Gate 22 stopped at PARTIAL at the time of that audit, with 1,020 candidates still unresolved,
because going straight back to PROVEN would have been the same flattering arithmetic that produced
the downgrade. **It returned to PROVEN later the same day**, on the evidence the audit said was
missing: the candidates were ingested rather than counted, and the corpus went 289 → 1,240 sources.
See its row above.

**Two** gates are externally blocked: **14** on AI Gateway credit, and **40** on the Studio
`screen_capture` transport, which drops the whole MCP connection on every attempt. Everything else
marked PARTIAL is reachable without owner action.

*(This paragraph read "Only one gate (14) is externally blocked" until 2026-09-01. It was written
before gate 40's blocker was a transport fault rather than a judgement, and it contradicted the
summary thirty-three lines above it. Found by an adversarial audit of this file.)*

The UNPROVEN one is gate 40, which moved there *from* PARTIAL. Gate 18 recovered to PARTIAL once a frame actually existed. A visual critic ran and
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
