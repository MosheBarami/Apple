# Phase 3 + 4 build plan 

Status: design only. Nothing here has been built, measured, deployed or run in Studio. Written 2026-10-02 from four read-only studies (store, critique, senses, knowledge). This plan starts after phase 1 lands. It is compatible with phase 2 (library search) but does not duplicate it.

## 0. Ground rules

- **Owner directive "generalize-not-patch".** Every failure is a missing capability. The harness supplies information, tools and checks, and the agent decides. No subject-specific code, and nothing leaks between projects. Asset order is library, then Creator Store (Roblox-owned or quality first), then combine or adapt, then build from scratch (highly detailed).
- **No benchmark overfitting.** Any prompt a designer has seen is DEV material. That includes every prompt listed in the four studies' done-tests, which are illustrative shapes only. Held-out prompts are written fresh by someone who has not seen the knowledge stores. They are frozen into a new bank (`owner-30-v2-heldout`) before any run and kept out of prompts, skills, RAG and the worker bundle.
- **Every milestone ships behind a kill-switch flag.** Each milestone is measured with its flag off (arm A) and on (arm B) on the same fresh prompts.
- **Expected deltas are hypotheses, not measurements.** They are chosen to sum to the targets in the studies. If a milestone moves its primary criterion by less than half the expectation after two iterations on DEV prompts, stop and escalate. Do not add a subject patch.
- **Docs-corpus caveat.** `packages/corpus/data/chunks.jsonl` is absent on this machine (only `chunks-witness.json`). Roblox API facts below come from fetched public docs and the repo's `apps/plugin/api-docs.json`. Before building on any of them, re-verify against the corpus or the live docs.
- **Doc paths cited:**
  - `docs/scripting/capabilities`
  - `docs/scripting/security/third-party-vulnerabilities`
  - `docs/audio/objects`
  - `docs/animation/using`
  - `docs/physics/constraints/hinge`
  - `docs/ui/proximity-prompts`
  - `docs/effects/particle-emitters`
  - `docs/reference/engine/classes/{InsertService,AssetService,TweenService,Sound,ClickDetector,ProximityPrompt,Lighting,Terrain}`
  - `docs/projects/assets/privacy`

## 1. Evidence baseline (owner-30-v1, first 13 items, judge 0-2)

| works | professional | matches | polished | noErrors | performance | sound | animation | fx |
|---|---|---|---|---|---|---|---|---|
| 1.23 | 0.46 | 0.38 | 0.38 | 1.62 | 1.92 | 0.08 | 0.92 | 0.31 |

Other measurements:
- Library imports are stripped of all scripts and sounds, and the agent cannot re-add behaviour.
- The agent has no self-check, and it made false claims (hidden joke text called visible, white paint called red).
- Hand-built routes cost 87 to 112 credits. The p16 map run took 25+ minutes, 63 steps and 584 credits, and scored 6/18.

Target after this plan (the floors in the studies' done-tests):

| Criterion | Target |
|---|---|
| sound | at least 1.0 |
| fx | at least 1.0 |
| animation | at least 1.3 |
| works | at least 1.5 |
| professional | at least 1.0 |
| matches | at least 1.0 |
| polished | at least 1.0 |
| noErrors | at least 1.62 (no regression) |
| performance | at least 1.92 (no regression) |

Both the evaluator and the in-product critic use the same model family. Every judged item gets a human or Claude photo review that can only lower scores.

## 2. Consolidations (where the four studies overlap)

| Overlap | Resolution |
|---|---|
| `inspect_model` (store), `inspect_parts` (senses) | One tool, `inspect_model`. It returns the part and joint graph, hinge candidates, script/Sound/prompt manifest, and an optional numbered-label image built on `look`. |
| Receipts (store), evidence ledger (critique), place census (knowledge), `audio_visual_audit` (senses) | One run-scoped `evidence-ledger.ts` plus one pure `place-census.ts`. The census reports facts only, such as counts of sounds, animations, emitters and interactive objects with no sound. It never exposes the judge rubric. Store receipts are ledger entries. |
| `play_check` probes (store activate/watch, senses D1, critique non-visual) | One extension of `PlayCheck.luau`: path and number inputs only, nothing from the wire becomes code. Evidence tier is recorded as `real-input` (VirtualInput click or prompt) or `simulated` (Trigger attribute). The claim audit treats `simulated` as weaker. |
| `preload_content` as `check_audio` (store) vs `insert_sound` preflight (senses) | One op. `insert_sound` calls it automatically, and `check_audio` is the agent-callable form. |
| `find_verified_asset`, `find_sound`, audio search | `search_store` (model, mesh, decal, audio) replaces `find_verified_asset`. `find_audio` (library first, then live Store) replaces `find_sound`. Old tools stay callable for tests and MCP, but are deferred. |
| Behaviour re-adding (store lint, senses clip language, knowledge recipes) | Reviewed runtime modules (`AppleAnimate` v2, `AppleAudio`, `bounce_pad`) that attach to any model by path, plus `behaviour-review.ts` as a lint backstop for agent-written scripts. Cards teach the pattern. |
| Tool-definition token tax | Every new visible tool must replace or defer an existing one. Target: at most +3 net visible tools in focused runs. |

## 3. Contracts with phases 1 and 2 (confirm before M3)

1. Phase 1's library step returns `{ model path, partsIndex, request }` to the agent. It removes the hard-coded `findSounds('squish')`, wobble and `COOL_EFFECTS` at `library-object.ts:499-516`. Otherwise M4 and M5 would double-add behaviour.
2. Phase 1 reports its mutations and inserted paths through the same hook the ledger uses (`out.mutatedProject`, `inserted`).
3. Phase 2's search calls `store-search.ts` as its second source. The shared candidate shape is `{id, name, type, creator, trust, scripts, triangles, votes, thumbnailUrl, loadableHere, licenceNote}`.
4. This plan never edits `libraryObjectStep`, `library-object.ts`, `model-library.ts` or `compose-*.ts`. It flags `recipes.ts` (hard-coded orchard-siege) as against the directive and leaves it alone.
5. `tools.ts` is the contention point. Each milestone adds thin call sites only, and only one milestone merges to it at a time.

## 4. Release trains (anything that needs the owner to publish or install)

- **Plugin release A (with M2):** `PlayCheck.luau` probes, plus `rig_model`, `set_joint_pivot` and `reset_joints` added to `OPT_IN_OPERATIONS`.
- **Plugin release B (with M6):**
  - `ops/Store.luau`: `probe_loading`, dry-run summary, strip-before-parent.
  - `ops/Fx.luau`: `fx_preview`.
  - Terrain `path` and cave actions.
- **The published store build is likely 1.0.0.** This is inferred from AGENTS.md, and nobody has read the published bytes. Until the owner publishes, customers lack native capture and the new ops. Every new tool must degrade through `plugin-capabilities.ts`.
- **Release-time requirements:** Studio restart, and owner consent per release. Read the Creator Store plugin policy on "remote assets" first (Q-020). Listing id: 107230158271368.

## 5. Spikes (Studio or network; run once the live benchmark is idle, with owner consent)

| Spike | Question | Gates |
|---|---|---|
| S1 | Loadability matrix of about 30 Roblox-owned and third-party ids, toggle on and off | M6 |
| S2 | Resolve an inner mesh id from a Mesh/MeshPart container | M6 |
| S3 | Detached scripts never run, and `LoadAssetAsync` results are sandboxed, for both loaders | M6 |
| S4 | Does `saves` POST change `LoadAsset` ownership? | M6, optional |
| S5 | Batch `items/details` | M6 |
| S6 | VirtualInput click on a world part, and ProximityPrompt input from the play harness | M2 |
| S7 | v2 search audio enum and response fields | M5, M6 |
| K1 | Capture works during Run or test? StarterGui in an edit capture? `Emit` in edit mode? Camera `set_props` undo effect on the `play_check` census? | M1, M5 |
| K2 | SoundGroup nesting (read `docs/audio/objects`) | M5 |
| K3 | Which capture and joint ops the published plugin build actually has | M1, M4 |

## 6. Ordered milestones

Test protocol for every gate:
- Fresh chat, clean Baseplate (`bench/reset`, restore `bench-baseline`, one chat, `bench/evaluate`).
- At least 3 never-tried requests in each affected category (object, silly, modify, map, system, ui, game), plus a 1-request-per-category regression smoke on the rest.
- A full 21-run pass happens only at M8, and after M4 and M6 if budget allows.
- Run cost is runs times credits per run. From the reported data points (library object about 1 credit, hand-built 87 to 112, map 584), a full 21-run pass is plausibly 200 to 800 credits. That is an estimate, and the owner approves the envelope first.

### M0. Foundations and guards (no behaviour change)

- **Capability:**
  - Leak guard: `tests/knowledge-no-bank.test.mjs` plus a worker-bundle metafile check that `packages/evals/owner-bench/requests.json` is absent.
  - Flags: `SELF_CHECK`, `STORE_V2`, `KNOWLEDGE_V2`, `BEHAVIOUR_V2`.
  - A `ctx.addNeurons` hook so tool-internal model calls count toward `agent.neuronsUsed` (a fix for the uncounted look and vision cost).
  - Tool-description fixes: `insert_asset` says "scripts removed" but the plugin refuses the asset; `find_verified_asset` is mesh-only; stale `design_sound` text; stale `docs/VISUAL-LOOP.md`.
  - Remove subject-specific worked examples (donut, butter, the treasure-chest genre skill, campfire kit text) in favour of archetype wording. Existing leak hits are listed in the knowledge study.
  - Freeze the held-out bank file and write the baseline run protocol.
- **Files:** new `tests/knowledge-no-bank.test.mjs`; edits to `creator-skills.ts`, `prompts.ts`, `object-tool.ts` headers, `assets.ts`, `audio-tools.ts`, `docs/VISUAL-LOOP.md`, `session.ts:4442`.
- **Generalization test:** baseline arm A on the fresh set, with all flags off. This yields the real baseline for every later delta.
- **Criterion moved:** none, by design. This is the baseline and a guard.
- **Cost:** baseline runs only, no per-run change.
- **Depends on:** phase 1 landed. **Owner:** approve the baseline run credits, approve the held-out bank freeze, and approve deleting or rewriting the subject examples (they are repo content, but they are prompt behaviour).

### M1. Evidence ledger, `look`, completion gate, claim audit (flag `SELF_CHECK`)

- **Capability:**
  - `evidence-ledger.ts`: ordered `{seq, kind: mutation|read|look|play, text, mutationSeq}` plus `touched[]`, run-scoped.
  - `look` tool: multi-angle camera poses including player eye-level from the spawn. It uses existing ops only (`viewport_info`, `spatial_query`, `set_props` on `Workspace.Camera`, `capture_studio_viewport`, restore the camera). One vision call returns observations (what is visible, `expect` items seen / not seen / cannot tell, answers to questions), not a score. The fallback is box views labelled "box approximation".
  - Structural completion gate (changed since the last look, studio connected, look available), with no keyword classifier. Limits: 1 forced look, 2 repair rounds, 6 looks per run.
  - Claim audit: one cheap text call plus deterministic pre-checks (a quoted label must appear in a read this run; "visible text" claims need `play_check` or `ui_layout_check`). It sends unsupported claims back to the agent and appends a plain "What I did not check" line. It never rewrites the agent's words.
  - `place-census.ts` (pure facts).
- **Files:**
  - New: `studio-look.ts`, `look-observe.ts`, `evidence-ledger.ts`, `claim-audit.ts`, `place-census.ts`.
  - Edits: `tools.ts`, `do/session.ts` (about 4440 and 4640-4740), `router.ts`, `mcp.ts`, `plugin-capabilities.ts`, `verifiers.ts`, `prompts.ts`, the `inspect_visually` multi-angle drop, and a web "what I checked" strip.
  - New tests: `look-observe`, `claim-audit`, `look-gate`. The planted-lie tests (reply says red but the read-back says white; reply claims visible text but `play_check` shows it hidden) must flag both.
- **Generalization test:** at least 3 fresh requests in each of the 7 categories. Pass means:
  - zero contradicted claims in a blind reviewer's read;
  - at least 95% of mutating runs end with a look or an honest "could not check";
  - repair rounds lower the flagged-defect count in at least 60% of cases, and never raise it;
  - the camera is restored, with no leftover instances.
- **Criterion moved:** matches +0.1 to +0.2, polished +0.1 to +0.2, works +0.1 (catches hidden or broken things). Honesty is the primary gain and is checked by the blind review, not by the score.
- **Cost:** a look is roughly 100 to 200 neurons, or 3 to 7 credits (estimate, to be logged as `visual:look`). The claim audit is about 40 neurons, or about 1.3 credits. A 1-credit library object could become 5 to 8 credits. Acceptance bar: median extra at most 6 credits and 90 s, with p95 reported.
- **Depends on:** M0, phase 1's mutation hook, K1 and K3 spikes.
- **Owner needed:**
  - Q21 line. Q21 (2026-09-28) says no automatic self-critic loop. The 2026-10-02 directive says the opposite, and does not mention Q21. Get one line before enabling the flag.
  - Whether system and ui categories may skip the forced look.
  - Approval of the credit uplift.
  - Plugin release is not required for this milestone (native capture is optional). Customers on the old build get the box fallback.

### M2. Verification substrate: `play_check` probes and playable audio (Plugin release A)

- **Capability:**
  - `play_check` takes `activate:[{path, via: click|prompt|touch}]` and `watch:[{path, props}]`. It reports before and after property deltas, attribute and leaderstat changes, per-Sound `IsLoaded`, `TimeLength` and `IsPlaying`, emitter `Enabled` and `Rate`, and joint C0 deltas. The wire carries paths and numbers only.
  - The `Trigger` attribute fallback, honoured by all harness behaviour modules, is used only if S6 (real click and prompt input) fails. Evidence is tagged `simulated`.
  - `check_audio` is an agent tool built on the `preload_content` op (today an admin route only).
  - `insert_sound` v2: preflight, `playable: true|false|unknown` with alternates, removes the Sound on failure.
  - `rig_model`, `set_joint_pivot` and `reset_joints` are added to `OPT_IN_OPERATIONS`, so an old plugin is withheld `animate_model` instead of failing mid-run.
- **Files:** `PlayCheck.luau`, `ops/Content.luau`, `Commands.luau`, `fx-library.ts`, `tools.ts` (`play_check` at about l.3018), `index.ts` (admin allowlist at about l.4617), `plugin-capabilities.ts`, `op-failure.ts`, `packages/shared/src/index.ts` (`StudioOp`), plus `apps/apple-plugin/tests/`.
- **Generalization test:** 3 fresh requests each in system, object and game that involve a world click, a prompt or a sound. The probes must return correct before and after evidence on a deliberately broken build as well as a working one.
- **Criterion moved:** works +0.1, noErrors +0.05, sound +0.05 (catches unplayable ids). Mostly this makes M4 and M5 verifiable.
- **Cost:** about 0 extra credits, plus a few seconds of play-check time.
- **Depends on:** M0, S6. **Owner:** publish plugin release A and restart Studio; run S6 in Studio.

### M3. Knowledge door and corpus fixes (flag `KNOWLEDGE_V2`; data track can start in parallel with M1)

- **Capability:**
  - `consult({need})` returns at most 5 compact cards across stores. `consult({id})` reads one card. It is read-only and free apart from an optional embedding.
  - `read_doc({url|vecId})` returns a page's chunks.
  - `api_member({class, member})` is a deterministic lookup over the 1,319 api chunks, with no embedding cost.
  - The old four lookup tools (`search_creation_skills`, `read_creation_skill`, `find_mechanic`, `get_*`) move to `DEFERRED_TOOLS` but stay callable.
  - Card matching becomes need-based (blind paraphrase index plus IDF, generic stopwords dropped), following the proven need-index pattern (91.3% top-1 vs 86.3% for embeddings).
  - `prompts.ts` stops discouraging docs and stops saying "you already know core Roblox APIs" (it conflicts with the repo rule).
  - Corpus: `guidePriority()` extended so about 700 audio, sound, input, characters, performance and game-design chunks are embedded. Citation fix (`apple:skill/<id>` instead of one Roblox page as author). Incremental re-index through `index-plan.mjs`.
- **Files:** new `consult.ts`; edits to `skill-cards.ts`, `creator-skills.ts`, `rag.ts`, `tools.ts` (registration, `DEFERRED_TOOLS`), `router.ts`, `prompts.ts`; `packages/corpus/src/{chunk,skill-card-chunks}.mjs`; the paraphrase generator, with a static scan that it never reads the bank path.
- **Generalization test:**
  - Retrieval reach on at least 80 dev queries (written from category descriptions, not the bank): the floor is set from the first measured baseline, with a proposed target of at least 85% top-1 and 95% top-5.
  - Fresh-run check: `consult` used in at least 2 of 3 runs per category, with no more tokens per step than before.
- **Criterion moved:** professional +0.1 to +0.2, polished +0.1. This is infrastructure that later milestones' cards use.
- **Cost:** token cost goes down (tools deferred). Embedding about 700 chunks is a small Workers AI spend. `consult` is free.
- **Depends on:** M0. **Owner:** consent to the embedding spend, to re-fetching Creator Docs (external read), and to the D1 and Vectorize writes and any deploy.

### M4. Behaviour re-adding and inspection (flag `BEHAVIOUR_V2`)

- **Build status (2026-10-02, branch `worktree-wf_90b4b7a1-0cd-4`, not merged, not deployed):** built, and measured by unit tests only. Nothing has run in Studio and nothing has been run on the benchmark. Where the build differs from the design below:
  - The reader is `model_anatomy`, not a merged `inspect_model`: `inspect_model` already exists as a plugin-backed asset QC tool, so it was left alone. `model_anatomy` is built on the existing `get_tree` and `read_script` ops, so it needs no plugin release.
  - Behaviours are one component, `packages/components/behave` (`AppleBehave`), driven by data in a ModuleScript `AppleBehaviours` written by `add_behaviour`. `AppleAnimate` v2, `AppleAudio`, `bounce_pad` and `animate_creature` are not part of this build. `AppleBehave` publishes `Model:SetAttribute("AppleBehave_<id>", on)`, which an M2 probe can read.
  - `refuseLuauIngress` on direct `edit_script` source is unchanged. `behaviour-review.ts` reports those primitives on the result instead, and enforces one rule only (a loop that never yields).
  - Not built: the numbered-label image (needs M1's `look`), the generalization test (live runs), `animate_model` v2.
- **Capability:**
  - `inspect_model` (the merge): part and joint graph, size, CFrame relative to the pivot, material, colour, hinge candidates, original script/Sound/prompt manifest, and an optional numbered-label image built on `look` (temporary labels deleted afterwards).
  - `animate_model` v2: `play: toggle | pingpong`, `then` chaining, property tracks via TweenService (see `docs/reference/engine/classes/TweenService`), events `sound`, `emit` and `setAttribute`, parametric primitives (swing, slide, spin, bob, squash, pulse), and the object-tool vocabulary lifted out of `ObjectPart`.
  - `AppleAudio` runtime module (the generic player over `ReplicatedStorage.AppleAudio`, with `play`, `playAt`, ambient zones, ducking, buses).
  - `bounce_pad`, and `animate_creature` (exposes `AppleMotion`, compose-only today).
  - `behaviour-review.ts`: lint for agent-written behaviour scripts (the `scanScriptSource` rules as refusals, a static reference check that every `WaitForChild` name exists in the inserted tree, run-context checks through `contextFindings`).
  - Behaviour recipe cards in `consult`: hinge or open, click or prompt trigger (`docs/physics/constraints/hinge`, `docs/ui/proximity-prompts`), toggle audio on interact, bounce, collect and count, hazard zone. They attach to any model by path regardless of its origin.
- **Files:** new `inspect-model.ts`, `behaviour-review.ts`, `packages/components/audio/AppleAudio.luau` plus manifest; edits to `animate-tool.ts`, `AppleAnimate.luau`, `AppleSounds.luau`, `tools.ts` (`edit_script` l.1839, the `refuseLuauIngress` carve-out at about l.1355), `object-tool.ts`, `skill-cards.json` and `creator-skills.ts` cards, regenerated `components.generated.ts`, plus the animate/sound tests.
- **Generalization test:** at least 3 fresh requests each in object, silly, modify and system, where a library or built piece needs a behaviour added. Pass means each effect passes an M2 probe, a fresh `list_scripts` shows only reviewed agent scripts, and no new subject noun appears in the code diff.
- **Criterion moved:** works +0.2 to +0.3, animation +0.3 to +0.4, sound +0.2 (music on click).
- **Cost:** per-request, aim at most 15 credits and 8 steps for behaviour requests (hand-built routes cost 87 to 112). The estimated saving is a lower-cost route. This is not yet measured.
- **Depends on:** M1 (the look image), M2 (probes), M3 (cards), the phase 1 partsIndex contract. **Owner:**
  - A one-line decision to enforce `refuseLuauIngress` on direct `edit_script` source. This changes a deliberate carve-out recorded in a comment at `tools.ts` about l.1355.
  - Tune lint false positives before enforcing.
  - No plugin release is needed beyond A.

### M5. Audio and FX capability

- **Capability:**
  - `find_audio`: multi-query, `kind` sfx, music or ambience, BM25 over name tokens with category only as a tie-break, offline synonym expansion, de-duplication by name stem, and creator tier. The full 126,780-row harvest goes to D1 `CORPUS` (today only a 30,000-row slice is bundled and 96K ids are unreachable). The live Store audio search is a secondary source flagged `unverified`, pending S7.
  - `insert_sound` v2 placement modes (`at`, `ui`, `ambient`, `music`), rolloff from object size, and automatic one-time `design_sound` bus setup. Only Roblox-owned or licensed-partner ids can pass the playable check. Community audio does not pass (`audio/assets` says it is not Open Use).
  - `fx_emitter`: a validated parameter spec for any emitter, beam or trail, with presets (`from: 'fire'` plus overrides) as starting points. The linter enforces a rate cap, lifetime cap, a transparency ramp ending at 1, a visible size ramp, a `LightEmission` range, an engine texture or verified Roblox-owned image id, and a per-place particle budget. `FX_RULE` guards the budget instead of refusing the class. `effects.ts` presets merge into one list. Triggers `on: loop|touch|click|prompt|event` share the `AppleAudio` and `AppleAnimate` event bus. `fx_preview` for one-shot effects (S K1 decides whether `Emit` renders in edit mode).
  - `generate_sound` and `speak_line` retire from build runs and stay user-facing only.
  - Census nudge (information only): before the final answer the agent is told the place has "N sounds, M animations, K effects, J interactive objects with no sound", along with matching cards. The judge rubric is not exposed.
  - Fix stale text (`assets.ts` sfx row, `get_genre_kit` note, `audio-tools.ts` header). The 52 genre-kit audio ids refused by the guard get verified via `preload_content` and added to the index, or are dropped from the kit.
- **Files:** new `audio-index.ts`; edits to `fx-library.ts`, `audio-tools.ts`, `sound-design.ts`, `effects.ts`, `tools.ts`, `assets.ts`, `genre-kits.ts` / `kit-pins.json`, `build-fx-manifest.mjs`, `sfx/index.json`, `sfx/manifest.json`, a D1 migration, `ops/Fx.luau` (ships with release B), plus the FX cards.
- **Generalization test:** at least 3 fresh requests each in object, silly, map, game and ui involving ambience, music, a trigger sound or a particle effect, such that no request subject appears in the new code. Pass means sounds loaded and played per M2 probes, emitters fired, at most 15 credits and 8 steps, with no console errors.
- **Criterion moved:** sound +0.6 to +0.8 (the largest gap, from 0.08), fx +0.5 to +0.7, animation +0.1. Cumulative sound goal at least 1.0 and fx at least 1.0.
- **Cost:** the D1 search is token-table based, with no per-query vector call. Per-run credits are flat or lower. Particle budget protects performance (watch the performance criterion).
- **Depends on:** M2, M3, M4 (event bus), S7, K1, K2. **Owner:** consent for the D1 migration and a 126K-row production write; an ROBLOX_API_KEY with the right scope if the live audio search needs it; publish plugin release B for `fx_preview`.

### M6. Creator Store pipeline (flag `STORE_V2`; Plugin release B)

- **Capability:**
  - `store-capabilities.ts` and plugin op `probe_loading` (once per place, cached per project): reports Roblox-owned model, third-party model, Open Use mesh and image, and audio loadability. Search results are annotated `loadableHere: yes|no|unknown`, and a `no` is dropped. This removes the 20-of-20 third-party failure pattern.
  - `search_store` (model, mesh, decal, audio): Roblox-owned by default (`creatorTargetId=1`), widening on request. Parallel and cached details. The Model refusal in `verifyCreatorStoreAsset` becomes conditional on `loadableHere`. Counted in `asset-search-limit.ts`.
  - Dry run: `insert_asset dryRun:true` returns a structure summary without parenting. Script source is never sent to the model. The exception is Roblox-owned assets whose scan is clean, which may be read as inert data.
  - Strip-before-parent insert (`store-insert.ts`, plugin `Store.luau`): load detached, delete scripts and risky classes, then parent. This takes 2 round-trips instead of about 8. A `removed` manifest is returned. The worker keeps `scanInsertedHierarchy` as a second reading and fails closed.
  - Stage once per distinct asset in `ServerStorage.AppleStore/<assetId>`, then clone with `place_copies` (phase 1 machinery).
  - A receipt per asset (creator, name, `loadedVia`, `removed`, bounds, checks) as a ledger entry, replacing `unaccounted:roblox:<id>`. `insert_library_model` also writes one.
  - User-pasted ids (`user_supplied`) get an explanation and probe results instead of a flat refusal, with the toggle path offered in both toggle states.
  - Not exposed: the subject-keyed scorers in `brokerAsset` (`SCALE_ENVELOPES`, `INTENT_TIERS`, `BIOMES`, `IDENTITY_COLOURED`). Deletion needs owner consent.
  - Scratch gate: after at least 2 searches with different queries, a from-scratch build is allowed. That changes D-MODELLIB-2 (`model-rule.ts`) and is an owner decision.
- **Files:** new `store-search.ts`, `store-capabilities.ts`, `store-insert.ts`, `store-receipt.ts`, `apps/apple-plugin/src/ops/Store.luau`; edits to `tools.ts` (`find_verified_asset` l.4346, `insert_asset` l.4378, `insert_library_model` l.5057), `assets.ts`, `asset-search-limit.ts`, `Commands.luau` (`handleInsertAsset` l.3270), `ops/init.luau`, `op-failure.ts`, `request-scope.ts`, `run-idle.ts`, `index.ts`, `packages/shared/src/index.ts`, `prompts.ts`, plus new store, behaviour and plugin tests.
- **Generalization test:** at least 3 fresh requests each in object, map and modify. Cover:
  - a Roblox-owned model found by live search and absent from the 639-row index (the studies listed lighthouse, tent and scarecrow as index misses; use fresh nouns instead);
  - a multi-piece scene;
  - an inserted piece adapted by colour or scale, with the change verified by measurement, not claim;
  - a library-and-Store miss leading to a detailed scratch build after two different searches;
  - a pasted third-party link in both toggle states.
  Pass means every insertion is verified and scanned (100% required), a fresh `list_scripts` shows zero asset-origin scripts, and no claim exceeds the receipt.
- **Criterion moved:** matches +0.3 to +0.6, professional +0.2 to +0.4, polished +0.1 to +0.2. Map runs target under 15 minutes and at most 8 failed steps, against 25+ minutes and 63 steps for p16. That is a target, not an expectation.
- **Cost:** shorter inserts (2 vs about 8 round-trips) and one insert per distinct asset make maps cheaper, and the Store route should replace some 87 to 112 credit hand-builds. Not measured.
- **Depends on:** M1, M2, M4, phase 2's interface, S1 to S5, S7. **Owner (most of the plan's owner actions):**
  - Publish plugin release B after reading the Creator Store policy on remote assets (Q-020); confirm what the published build contains.
  - Q-022: enable "Allow Loading Third Party Assets" on a disposable published test experience. This is a Roblox account action, per experience, and a plugin cannot flip it. Third-party supply depends on it. Until then only Roblox-owned assets load (24 of 24 in the earlier test; 0 of 20 third-party).
  - `ROBLOX_API_KEY` with `creator-store-product:read` for the v2 search. `creator-store-save:write` is not in `ROBLOX_SCOPES`, so do not add it unless S4 needs it, and treat the `saves` POST as an account-state change needing consent.
  - Decide the D-MODELLIB-2 relaxation, and the `refuseLuauIngress` one-liner if not already decided at M4.
  - `DataModel:GetObjects` is off the table (the plugin was once removed for it, and the capability contract test bans it).

### M7. Craft knowledge: lighting, terrain, archetypes, performance cards

- **Capability:**
  - Parametric `set_mood` `params` override (not more fixed presets) and a `day_night_cycle` behaviour prefab that tweens `Lighting.ClockTime`. A blown-highlights measure after lighting changes (`pixel-stats.ts`).
  - Terrain primitives: `shape_terrain` `path` (polyline channel for rivers, roads and canyons, chunked under the 65,536-voxel ceiling), `carve_tunnel`, and slope-aware `replace_material`. `floating_island` and `waterfall` remain as aliases. Natural-landscape requests offer the terrain tools by intent (without the always-on token cost), and the prompt rule "never Terrain unless asked" is reconciled.
  - About 150 authored cards, each grounded to doc chunk ids and validated by the existing reference tests, by technique and archetype, never by request subject:
    - object archetypes (detail checklist plus the asset order);
    - UI patterns;
    - systems (openable, collectible, weather);
    - game design from `docs/production/game-design/*`;
    - performance from `docs/performance-optimization/*`, paired with the census.
  - A `verify-your-claims` always-on card (probe a colour read-back or the occlusion state before claiming).
  - Reconcile the `prompts.ts` sentence "a prop made from stacked parts is an unfinished placeholder" with the owner's "build from scratch (highly detailed)".
- **Files:** `worldbuilding.ts`, `terrain-recipes.ts`, `phase-a-tools.ts`, `tools.ts`, `prompts.ts`, `skill-cards.json` and `packages/corpus/data/craft/*`, `mechanics.ts`, `prefabs.ts`, plugin `terrain_shape` op (the `path` and cave actions ship in release B, so they depend on it).
- **Generalization test:** at least 3 fresh requests each in map, modify, ui and game, from natural-landscape, lighting-change and layout requests. A lint on card text checks that no bank n-gram or example subject appears.
- **Criterion moved:** professional +0.1 to +0.2, polished +0.1 to +0.2, fx +0.1. Performance must hold at 1.92 or better.
- **Cost:** cards cap at about 2.2k characters, at most 2 at start and 1 per step. Terrain tools add per-step tokens only when matched by intent.
- **Depends on:** M3, M6 (plugin release B). **Owner:** the plugin rebuild for terrain actions (rolled into release B).

### M8. Integration, regression and flag flip

- **Capability:** no new capability. Run the full 21-or-more-run held-out pass in arms A (all flags off) and B (all on), then the owner-30 regression.
- **Pass criteria:**
  - mean at least target on every criterion in section 1;
  - zero contradicted claims (blind reviewer);
  - zero unverified or unscanned asset insertions;
  - no map-class request over 15 minutes or 8 failed steps (measure, do not assume);
  - the added cost stays within the owner-approved envelope;
  - the camera is restored, and no side effects.
- **Depends on:** M0 to M7. **Owner:** approve the final run credits and the flip of each flag; deploy and push are never done without consent.

## 7. Cost and credit summary (estimates, all unmeasured until logged)

| Milestone | Per-run credit effect | One-off spend |
|---|---|---|
| M0 | none | baseline bench runs |
| M1 | +3 to +7 per look, about +1.3 for the claim audit | bench runs |
| M2 | about 0 | bench runs |
| M3 | tokens down (deferred tools); `consult` free | embeddings for about 700 chunks, plus re-index |
| M4 | likely lower for behaviour requests (87 to 112 today) | bench runs |
| M5 | roughly flat | D1 migration, bench runs |
| M6 | likely lower on maps (p16: 584) | bench runs, possible API usage |
| M7 | roughly flat | bench runs |
| M8 | n/a | full 21-run pass in two arms, plus owner-30 regression |

## 8. Everything that needs the owner

1. Q21 line (self-critique loop), the per-category skip list, and the credit uplift (M1).
2. `refuseLuauIngress` on direct `edit_script` source (M4) and the D-MODELLIB-2 relaxation (M6).
3. Plugin release A (M2) and release B (M6/M7), including Studio restart, the Q-020 policy read, and confirming what the published build contains.
4. Q-022: toggle "Allow Loading Third Party Assets" in a disposable published test experience. A Roblox account action.
5. Paid calls: bench runs, vision calls, Workers AI embeddings (M3), Creator Store API usage with a key.
6. Production writes: D1 migration and the 126K-row audio load (M5), corpus re-index and Vectorize (M3), KV cache, deploys. Docs re-fetch (external network).
7. Studio and Chrome time for spikes S1 to S7 and K1 to K3. The live benchmark is running, so schedule after it.
8. Held-out bank freeze, and who writes the fresh prompts.
9. Deleting the subject-keyed unused code (`brokerAsset` scorers, `recipes.ts`). Not done here, flagged only.

## 9. Risks and unverified items

- **Judge is the same model family as the product critic.** Mitigation: keep the bench rubric out of the product, and apply human photo review that can only lower scores.
- **Plugin version skew:** everything degrades through `plugin-capabilities.ts`; release A and B timing sets which milestones show effect on customer machines.
- **`tools.ts` contention** with phases 1 and 2: thin call sites, one merge at a time.
- **Third-party loading is a per-experience human toggle (Q-022).** Third-party supply is zero until enabled. Roblox-owned supply works today.
- **Undocumented endpoints** (`items/details`, v1 marketplace). `strictDetailsFetch` already fails closed.
- **Audio:** a Studio preload success does not prove another experience can load an id. Hence only Roblox-owned or licensed ids pass.
- **Guard weakening:** replacing the `FX_RULE` refusal with lint could let default-white-square emitters back in. Keep lint failures blocking and keep the budget cap.
- **Prompt injection through third-party script text:** keep source out of transcripts (names and hashes only).
- **Unverified here:** whether capture works during Run, StarterGui in edit captures, `Emit` in edit mode, SoundGroup nesting, real per-look neuron cost, the published plugin's op set, S1 to S7 outcomes.
- **Tests pinned by name** that each new tool must satisfy: `mcp.test.mjs`, `verification-tools.test.mjs`, web `tool-vocabulary.test.mjs`, worker `phase-coverage`, `tools-for-mode`, `webtools-wiring`.
