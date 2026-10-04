# 16. Model training ambitions, data assets, analytics, and the glossary

_Written 2026-10-04 from files on disk, read-only. Code paths are relative to `/Users/moshe/Developer/RbxAI-feed`
(branch `research-feed`, which is `main` at `f8991a96` plus 158 commits) unless a path starts with `~` or says
"main". Nothing was re-run except three read-only counts (research chunks, tool registry size, plugin/worker version
strings). Test counts and benchmark numbers are quoted from the dated documents that measured them, not re-measured._

Three things in the sources are easy to misread, so here they are first.

- **Branch geography matters.** `packages/owner-classify` (the library search) exists on `research-feed` and
  `integration/giant`, not on `main`. `packages/owner-corpus` (the library gateway and cataloguers) is **untracked
  and gitignored** in the main checkout: it is on one Mac and nowhere else. The newest search improvements
  (86% top-3) live only on the saved branch `handoff/search-90`.
- **Training is stopped, not failed.** The owner cancelled LoRA training on 2026-09-26. The tooling and 23 local
  adapters remain. No trained model is served to anyone.
- **Three different things are called "gateway".** The owner-library gateway (a Python server on the owner's Mac),
  the model gateway (`apps/worker/src/gateway.ts`), and Cloudflare AI Gateway. The glossary separates them.

---

## 16.1 Training: what was planned, what was built, what is served

### 16.1.1 The short answer

| Question | Answer | Evidence |
|---|---|---|
| Does a trained Apple model exist? | Yes, locally: 23 adapter folders (v1 to v35, best checkpoints), all small LoRAs on 3B-4B bases. | `packages/training/adapters/` in the main checkout (gitignored); `docs/training/FOREVER-LOG.md` |
| Is any of it served to customers? | **No.** Production serves `@cf/zai-org/glm-5.3-flash` for every lane. No code path passes a `lora` parameter. | `apps/worker/src/gateway.ts` (no `lora` reference); `docs/model-serving-reality.md` |
| Did training beat the base on the thing that matters (game logic)? | No. Tool-call formatting improved a lot; game-logic never exceeded 1 of 8 on the pinned eval. | `docs/training/FOREVER-LOG.md`; `docs/model-serving-reality.md` section 5 |
| Is training still active? | No. Disabled by the owner 2026-09-26. | `packages/training/OWNER_DISABLED.json` |
| Is there a customer-data flywheel? | No. Every dataset is first-party authored or licence-gated public code; `customerData: false`. | `packages/training/mlxdata-apple-v5/dataset-card.json` |

### 16.1.2 Timeline

| Date | Event | Source |
|---|---|---|
| 2026-09-14 | Hardware measured: Apple M2 Pro, 32 GB unified memory, 19 GPU cores, no CUDA. Decision: MLX LoRA/QLoRA on the Mac is the only training path (HF Jobs and ZeroGPU unavailable on a free account). | `~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/apple-training-hardware.md` |
| 2026-09-14 | **Apple v1**: Qwen3-4B-Instruct-2507 4-bit QLoRA on 404 harvested examples (327 train). Died at about iter 120 of 250 to a macOS Metal GPU watchdog; the shell reported exit 0 because the trainer was piped through `tee`. Against its own base: repetition 1/8 to 3/8, stray `<think>` tags 0/8 to 8/8. **Not promoted.** | `docs/audit/TRAINING-V1-REPORT.md` |
| by 2026-09-19 | v2-v4 rebuilt around first-party data and `unsloth/Llama-3.2-3B-Instruct` (a base Workers AI can host). v4: tool-call tasks base 0/13 to adapter 8/13; game logic 0/8 to 0/8. | `docs/evidence/apple-v4-evaluation-2026-09-19.md`; `docs/model-serving-reality.md` section 5 |
| 2026-09-20 | "Can a local LoRA reach production?" measured against the live Cloudflare account. Answer: no, not on the models production serves. | `docs/model-serving-reality.md` |
| 2026-09-21 | Public-data harvest: GitHub corpus (1,035 repos) and Hugging Face gates; one retrieval dataset admitted, six training candidates refused. | `packages/training/data/roblox-github-v1/dataset-card.json`; `packages/training/data/hf/REJECTED.json` |
| about 2026-09-22 to 09-26 | `train-forever.mjs` runs versions v6 to v35, one lever each (`forever-hypotheses.json`); the dated audit docs are 09-25 and 09-26. | `docs/training/FOREVER-LOG.md` |
| 2026-09-26 | **Owner cancels LoRA training** and redirects to owner-supplied asset/game extraction. | `packages/training/OWNER_DISABLED.json` |
| 2026-10-04 | `GOAL.md` replaces every earlier goal; training is not part of the plan. | `/Users/moshe/Developer/RbxAI/GOAL.md` |

### 16.1.3 What was planned

The ambition, stated in the mandate documents, was an **"Apple" fast tier and an "Apple MAX" tier that were
genuinely different models**: fine-tunes of open weights, specialised on Roblox/Luau, trained free on the owner's
Mac and hosted free on Cloudflare. Three assumptions underlay it, and all three broke:

1. *"The adapter can ride on the production model."* It cannot (16.1.5).
2. *"Harvested open-source Luau teaches product behaviour."* It teaches library internals; the product asks for
   "user request to working game mechanic" (v1 report, root cause B).
3. *"Two tiers are different models."* They were never different: all of clay, stone, rune, memory and vision
   resolved to one GLM model on 2026-09-14, so there was nothing to inherit (memory note above). V3 (2026-09-28) then
   dropped the Apple/Apple MAX split altogether (`docs/autonomy/MISSION.md`).

### 16.1.4 What was built

`packages/training` (23 MB, 162 files in `src/`, 66 of them tests) is a complete experimental pipeline:

| Piece | Files | What it does |
|---|---|---|
| Licence-gated dataset builders | `src/build-dataset.mjs`, `clear-rights.mjs`, `screen-row-licences.mjs`, `acquire-github-luau.mjs` | Admit only permissive-licence code; every row carries provenance; Luau must pass `luau-lsp` and an anti-pattern check. |
| First-party curricula | `game-logic-curriculum*.mjs`, `tool-trajectory-curriculum*.mjs`, `ui-logic-curriculum*.mjs`, `data/*-seeds-*` | Authored, executor-verified, mutation-checked examples. |
| MLX datasets | `mlxdata-apple-v4` (233 rows), `mlxdata-apple-v5` (318 rows: 252/37/29; 88 game-logic, 230 tool-trajectory), `mlxdata-llama` (the 404-row harvested set) | v5 card: `first-party-authored`, `harvestedRows: 0`, `customerData: false`, `capturedFromStudio: false`, `productionTrainingReady: false`. |
| LoRA configs | 35 files `lora-apple-v1.yaml` to `v35.yaml` | Rank 8, 16 layers, AdamW; rank held at 8 on purpose to stay servable on Workers AI. |
| The supervisor | `src/train-forever.mjs`, `forever-hypotheses.json` | One lever per version, paired eval against the current best on a pinned held-out set, promote only with a margin of at least 2 points; checks the log not the exit code (Metal watchdog); never calls Cloudflare. |
| Evaluation | `score-eval.mjs`, `paired-eval.mjs`, `roblox-frontier-bench.mjs`, `eval-production.mjs` | Local scoring by executing each answer against its own checks; a frontier bench through production's `/api/admin/model-test`. |
| Publishing | `upload_lora.sh`, `mlx_to_peft.py`, `hf-space/` | Convert MLX adapters to PEFT; private HF repo `moshebarami/apple-lora`; a private static "results" Space. |
| Consent gate | `src/consent-staging.mjs` | Offline gate/redactor for Apple's own tool trajectories: requires a current consent proof (`profiles.training_opt_in`), always `humanReviewRequired`. Never wired to production data. |

### 16.1.5 Results

Pinned held-out eval (`runs/eval-set-v5.jsonl`: 23 trajectory, 8 game-logic, 7 finish; greedy, 1,200 tokens):

| Version | Lever | Trajectory | Game logic | Finish | Total /38 | Status |
|---|---|---:|---:|---:|---:|---|
| v4 | first curriculum | 14 | 0 | 6 | 20 | seed |
| v5 | + game-logic synth, 318 rows | 17 | 0 | 3 | 20 | seed best (val 0.838) |
| v22 | + 51 verified game-logic rows | 17 | 1 | 6 | 24 | promoted |
| v29 | lr 1e-4 | 16 | 0 | 7 | 23 | promoted |
| v34 | dropout 0.05 | 20 | 1 | 5 | **26** | promoted, the best on record |
| v35 | cosine + 800 iters | not in log | | | | config written; no result recorded |

Source: `docs/training/FOREVER-LOG.md`. Of the versions logged from v6 to v34, ten were `truncated` or `failed_training` (the
Metal watchdog), one was `eval_failed`, one errored on an unknown data op, and two were `eval_invalid` because the base trajectory score
drifted (the base answers changed on 19 of 38 rows between runs, so a stored base score is not a valid
comparator; hence "paired" evals). The headline finding is stable across every logged version: **adapters teach this
product's tool surface (tool names, argument shapes) and do not teach correct game logic (0 to 1 of 8).**

A separate frontier code benchmark through the production gateway (house-rules prompt, 16 items) pooled Apple MAX
at 60/64 (93.8%, range 75-100%) and Apple at 15/16 on 2026-09-25. That measures GLM plus prompts, not a fine-tune
(`docs/training/frontier-2026-09-25-library-ui.md`). The older Luau suite scored the same model 98.9 (`glm-final`,
`docs/evals/RESULTS.md`).

### 16.1.6 Workers AI LoRA limits (why nothing shipped)

| Limit | Value | Source |
|---|---|---|
| Rank | at most 8 (docs say "up to 32"; treated as ambiguous) | `docs/model-serving-reality.md` section 3.2; `train-forever.mjs` `MAX_SERVABLE_RANK` |
| Adapter size | under 300 MB | same |
| Adapters per account | up to 100 | same |
| File names | exactly `adapter_config.json` and `adapter_model.safetensors` | same |
| Price | free while in open beta | same |
| LoRA-capable models on this account | 9, measured 2026-09-20: gemma-2b/7b-it-lora, llama-2-7b-chat-hf-lora, llama-3.2-3b-instruct, llama-3.2-11b-vision-instruct, llama-guard-3-8b, mistral-7b-instruct-v0.2-lora, qwen2.5-coder-32b-instruct, qwq-32b | section 3.1 |
| **Native function calling among those 9** | **none** | section 4 |
| Production model | `@cf/zai-org/glm-5.3-flash`: no `lora` property; the API refuses with code 5005 | section 3.3 |
| An adapter on the wrong base | refused with code 3030 ("Lora not compatible"); an adapter is dimension-specific | section 3.3 |
| Uploaded to the account | two finetunes as of 2026-09-20 (includes `apple-v4` on llama-3.2-3b) | section 2 correction |

Consequences, from the same document: the only route to "a fine-tune serves customers" is to retrain on a 3B text-only
base (80k context, prompted tool calls, no vision) and move a lane off a 1.3M-context multimodal native-tool model.
Qwen2.5-Coder-32B, the obvious Luau candidate, is 4.4x the input price and 2x the output price of GLM 5.3 Flash
with 2.5% of the context and no tools. The six alternatives (A to F in section 6 there) range from "research only"
to a dedicated GPU provider; the document's own conclusion is that the lever for quality is the knowledge the model
reaches at generation time, not an adapter.

### 16.1.7 Stale or conflicting notes a planner will meet

- The memory note `apple-training-hardware.md` is internally inconsistent: its top section says the production model
  excludes Qwen/GLM from LoRA serving, a later "CORRECTED 2026-09-14" block lists nine LoRA-capable bases, and it still
  says "0 finetunes uploaded" (corrected to two on 2026-09-20). Read `docs/model-serving-reality.md` instead.
- `AGENTS.md` sizes `packages/training/` at 752 MB (adapters 210 MB); that is the main checkout, not git.
- The privacy page promises "your private project data is never used to train AI models"
  (`apps/site/src/pages/privacy.astro`), yet the schema has `profiles.training_opt_in boolean default false`
  (`infra/supabase/migrations/0001_init.sql`), and `consent-staging.mjs` assumes an opt-in path. I found no settings control for it: the web app only carries it in a mock, the account export lists it and erasure resets it (`apps/worker/src/user-export.ts`, `erasure.ts`).
  This is a policy fork, not a bug (see open questions).

### 16.1.8 What a planner should take from it

1. A model-training track has **no current business case**: it cannot be served on the production model, it did not
   improve the capability that is failing (long creative builds, game logic), and the owner stopped it.
2. What is reusable regardless: the licence-gating discipline, the executor-verified curricula (88 game-logic rows
   that really run), the paired-eval method, and the knowledge that a 3B adapter reliably teaches tool-call format.
   The last one is relevant only if a cheap "tool-call formatter" lane ever becomes desirable.
3. If training returns, the ordering is fixed by evidence: pick a LoRA-capable base that has native tools first (none
   today), then build data from verified traces of real runs (with consent), not harvested code.

---

## 16.2 Data assets: what the company owns or uses

### 16.2.1 Inventory

| Asset | Size / count | Where | Licence / permission basis | Status |
|---|---|---|---|---|
| **Owner library** (games) | 565 games; 12.2M instances; about 226K scripts (66K of 225K stripped in dumps) | `~/Library/Application Support/Apple/owner-library/` (sources, catalog, assets, extract, media) | **Owner-attested only. No licence investigation. All 565 catalog rows have a null licence.** | Mac-only; the cloud never sees it |
| Owner library (assets) | 97,428 asset rows; 504 families; 54 installable systems; 5,797 media files | same; catalogued by `packages/owner-corpus/library_*.py` | same | Complete 2026-09-30 |
| Classification and search | 87,173 deduped items (103,703 rows); T0 BM25 + T2 dense | `~/Library/Application Support/Apple/owner-classify/` (sidecar, never in git); code `packages/owner-classify/` | Derived data over the above | On `research-feed`; not on `main` |
| Docs corpus (RAG) | 8,326 chunks, 2,193 documents | `packages/corpus/data/chunks.jsonl` (gitignored, 10 MB); D1 `golem-corpus` + Vectorize `golem-docs` | Roblox creator-docs CC-BY-4.0 (prose) and MIT (samples); luau.org MIT | Live (`search_docs`) |
| Research notes | 23 notes, about 269K words, 1,025 chunks | `packages/corpus/research/*.md` (identical copies in `research/roblox/`) | Apple's own words; facts cited `[S#]` | Fed 2026-10-04 |
| Skill cards | 23 | `packages/corpus/data/skill-cards.json` | Apple-authored; cite corpus chunks | Auto-pushed into runs |
| Creator skills | 519 (302 new this week) | `apps/worker/src/creator-skills.ts` | Apple-authored | Searchable and pushed per plan step |
| Verified modules | 80 executed Luau modules | `packages/corpus/data/verified-modules.json` | Authored in this repo; each ran against its own checks | Live |
| Other corpus JSON | 131 mechanic entries; 11 genre kits (53 external refs, 25 official docs); 14 UI genres and 16 screen types; 1,451 sourced UI claims; 55 pinned audio ids; 1,082 registry seeds; 3,017 template seeds | `packages/corpus/data/` | Metadata and project-authored observations; no vendored third-party code | Mixed; see below |
| Asset-library package | 15 CC0 packs (5,823 files, 8.6 MB); 51,133 Creator Store model ids; 77,076 UI-store ids; 139,954 sound items (30,000 playable-indexed); 22 VFX presets, 209 textures; 34 UI components in 4 skins | `packages/asset-library/` (134 MB) | Per row (below) | Rebuilt after the 2026-09-20 deletion |
| Training data | 1,035 licensed GitHub repos (29,232 files); first-party seeds; MLX sets | `packages/training/data/`, `mlxdata-*` | Licence text retrieved at a pinned commit per repo | Training stopped |
| Benchmark banks | owner-30-v1 (30), heldout-v1 (21), Luau suite (84 tasks), RobloxQA gate (3,000 Qs), eval50 + two held-out search sets | `packages/evals/` | Own work; RobloxQA is MIT (TorpedoSoftware) | See 16.2.4 |
| Run evidence | 361 entries | `docs/evidence/` | Own | Historical |
| Meshy 3D ledger | 70 of 2,180 credits spent, 4 tasks | `docs/PROVENANCE-meshy.md` | Meshy Premium: owner owns assets | One probe; assets rejected for quality |

### 16.2.2 The owner library in detail

**What it is.** 565 Roblox games and models (`.rbxl`/`.rbxm`) the owner supplied, copied content-addressed into
`owner-library/sources/`, decoded to a SQLite hierarchy with exact script text, dependencies and external media
references (`packages/owner-corpus/README.md`). A loopback Python gateway serves them (`127.0.0.1:63747`; a fresh 256-bit
bearer key per start; no CORS; `packages/owner-corpus/gateway-README.md`). The cloud worker cannot reach it. Every read goes through
the paired plugin on the same Mac (`apps/worker/src/local-owner-corpus.ts`: "Local owner gateway is unavailable in the
paired plugin" is the failure when it is not).

**Build state (2026-09-30, `docs/autonomy/CURRENT_STATE.md`).** 565 of 565 catalogued; 97,428 assets indexed; 565 of 565
style-scanned (154 studded); 504 families; 97,265 of 97,265 asset paths verified by a round trip; 54 systems with
install plans; script integrity per game: 343 working, 77 partly, 145 looks-only; 180 knowledge cards and 8 genre
syntheses drive `plan_game`. Verified by me: `catalog.json` lists 565 games, 12,207,481 instances, 225,900 scripts.

**Classification coverage (`packages/owner-classify/README.md`, measured 2026-10-02).**

| Measure | Result |
|---|---|
| Fully classified (every applicable field) | 95.9% of items, 96.1% of rows |
| ... and a picture required too | 94.2% / 94.5% |
| Physical items with parts: colour / size class / picture | 92.0% / 99.3% / 88.1% |
| Type, description, tags, quality, provenance | 100% |
| Pictures | 36,223 isometric **proxy renders** of boxes (96 px), not Studio screenshots |
| Descriptions | **Templates**, not model-written; `describe_sample.py` never ran for real ("no local model installed") |

**Search quality.**

| Set | Top-3 | Top-1 | Top-10 | Notes |
|---|---:|---:|---:|---|
| eval50, as shipped on `research-feed` | 38/50 (76%) with dense; 31/50 lexical only | 29 | 45 | MRR 0.68; 0/3 reject-probe false accepts; ranking weights **tuned on this set** |
| eval50, `handoff/search-90` (WIP) | 43/50 (86%) | n/a | n/a | not merged; not deployed |
| Held-out set 1 (54 queries, written before ranking work) | 38/54 (70%) baseline; 43/54 (80%) after | 28 (baseline) | 46 (baseline) | MRR 0.619 to 0.727; 1/4 reject false-accept at baseline |
| Held-out set 2 (50 queries, never tuned on) | 36/50 baseline; 39/50 (78%) after | n/a | n/a | the honest generalisation figure |

Sources: README; commit messages `70d9c0ba`, `a2188239`; `docs/handoff/2026-10-04/agent-prompts/search-90.md`.
The owner's target was at least 90% top-3 with no fitting to the test; **it was not met honestly**: 78% on a set
never tuned on, 86% on the tuned one. Failures that remain are world-knowledge gaps ("tropical bird with a giant beak"
for a toucan) that lexical search and a MiniLM cannot solve; the README names a per-item language-model description
pass as the fix, "paid / local-LLM option the owner has not yet approved".

**Dependencies worth knowing.** The dense tier reads all-MiniLM-L6-v2 int8 weights *in place from the Continue VS Code
extension's ONNX file* (`APPLE_EMBED_MODEL` overrides; nothing copied). A product would need its own pinned embedding
model. The sidecar is 900 MB+ (find.sqlite 244 MB, items.jsonl 132 MB, dense vectors 85 MB, 36K thumbnails).

**Permission and risk.** `packages/owner-corpus/README.md`: "Commercial use is owner-attested; no license investigation
was performed." The games are other creators' work: benchmark critiques name source titles such as Bloxburg, Escape
FNAF, Pokemon Adventures and Twisted Murderer (`packages/evals/owner-bench/BASELINE.md`). This is the same pattern that
killed the earlier curated catalogue on 2026-09-20 (rows named after other companies' properties under one blanket
licence; 0 of 511,208 rows insertable; `docs/ASSET-PIPELINE.md`). Two protections exist: script text is treated as
data, never executed on import; and the GitHub repo is public, so on 2026-09-28 the 435 private library files were
stripped from unpushed history and kept local-only (`docs/autonomy/DECISIONS.md` D-V3-3). There is **no mechanism by
which a paying customer can use the library today**: it lives on the owner's Mac. Making it a product asset requires
(a) a cloud store and (b) a rights decision. Neither is planned.

### 16.2.3 The knowledge corpus and research notes

**Docs corpus** (`packages/corpus/PROVENANCE.md`): creator-docs (CC-BY-4.0 prose, MIT samples; per-chunk `url`
satisfies attribution), luau.org docs (MIT, skipped entirely if licence unverifiable), plus the research notes. Explicitly
excluded: `Full-API-Dump.json` mirrors (no licence), MPL-2.0 repos, `license: other` HF scrapes. `search_docs` is hybrid
(Vectorize bge-small top 8 plus D1 FTS5 top 8, reciprocal-rank fusion, k=5; `research/roblox/PIPELINE.md`).

**Research notes** (`packages/corpus/research/`, written 2026-10-04 by research agents): 23 notes, 269,399 words,
2,212 numbered source entries (numbering restarts per note, so this is a count of citations, not unique sources;
per-note counts run from 49 to 159). Topics 01-11 are breadth (viral hits, discovery, genre design, Luau architecture,
world visuals, UI/UX, animation/audio/VFX, monetisation and policy, tools ecosystem, from-scratch playbook, RDC 2026); 12-23 are depth
(seven genre families, visual study of top games, systems cookbook, building craft, player psychology, asset sourcing).
Every fact carries `[S#]`; third-party numbers are labelled; each note ends with open or unverified items (a gap pass
left 5 to 12 items open in each note that records one). Licence basis: Apple's own text, facts restated in its words, few quoted words.
Planner caution: many sources were read through summarising fetch tools, not raw pages (planning section 4, "How to read this section", and the note headers), so a figure is a lead to re-verify before it goes in marketing.

**Feeding channels** (`research/roblox/PIPELINE.md`): `search_docs` (1,025 research chunks added), skill cards (23,
at most 2 in the prompt, one more per plan step, at most 5 per run), creator skills (519; token-scored), the system
prompt (`apps/worker/src/prompts.ts`, 605 lines, principles only), genre references, and component packages
(`packages/components/`, 28 Luau files compiled into `components.generated.ts`).

### 16.2.4 Benchmark banks and results

| Bank | Items | What it is | Latest result | Source |
|---|---:|---|---|---|
| owner-30-v1 | 30 | The owner's frozen request bank: object 6, silly 5, modify 4, map 4, system 4, game 4, ui 3; fresh chat, clean Baseplate, vision-judged on 9 criteria, 0-2 each, /18. Never edit an item after seeing its score. | Baseline 2026-10-02: 26 of 30 judged, **mean 7.27/18**, 3,423 credits. Self-check run 2026-10-04: 11 judged, **mean 9.36/18**, 2,273 credits. Best single row ever: 12/18. | `packages/evals/owner-bench/BASELINE.md`; planning section 8 |
| heldout-v1 | 21 | 3 per category, written blind; 11 near-duplicates replaced before freezing | **Never run** | `packages/evals/owner-bench/heldout-v1.json` |
| Phase T game 1 | 1 idea, 4 rounds | "mine glowing crystals, upgrade your pickaxe, rebirth to deeper caves"; fresh blind critic per round | r1 2/10, r2 1.5/10, r3 1.5/10; r4 prepared (worker 5,413 tests, 5,407 passed, 6 skipped) | `research/roblox/phase-t/`; `t1-round4/validation.md` |
| Luau suite | 84 tasks, 12 categories | Objective checks (`luau-lsp` syntax, anti-patterns, regex) | glm-final / stone 98.9, 2026-08-30; 56 jobs | `docs/evals/RESULTS.md` |
| Roblox frontier (code) | 16 items | House-rules prompt through production gateway | Apple MAX 60/64 pooled, Apple 15/16, 2026-09-25 | `docs/training/frontier-2026-09-25-library-ui.md` |
| RobloxQA gate | 3,000 Qs | Multiple-choice knowledge regression; no Luau in it; held out from training (0 exact overlap with 404 training rows) | gate only, not a score | `packages/evals/data/robloxqa/`; `docs/evals/HELD-OUT.md` |
| Retrieval | 80 modules x 2 phrasings; 15 gold doc queries | Customer-phrased retrieval | contract-phrased top-1 100%; customer-phrased 61% lexical to 87% with embeddings | `docs/retrieval-bakeoff.md` |
| Search sets | eval50 + 54 + 50 | See 16.2.2 | 76% to 86% (tuned), 80% and 78% (held out) | `packages/owner-classify/` |
| Security | 56 tests, scenarios A1..; | Trust boundaries | all 56 passed at `2ffd22db` | `packages/evals/src/security.test.mjs` |

Where the raw results are: only the baseline JSON is in the main repo's `owner-bench/results/`. The integrated,
self-check and Phase T result files and photos are in a separate clone, `RbxAI-ci` (planning section 8 flags this
risk). `GOAL.md` retired the bench loop on 2026-10-04: nothing has been re-measured since 00:14 UTC that day.

### 16.2.5 The asset-library package

Rebuilt after the owner deleted the first catalogue on 2026-09-20 (`docs/ASSET-PIPELINE.md` is partly historical: Layer 1
no longer exists). The new design **stores ids and metadata, not bytes, and uploads nothing to anyone's account** unless
capped and into the customer's own account.

| Part | Content | Licence basis |
|---|---|---|
| `packs/` (15) | Kenney UI, icons, cursors, emotes, input prompts and similar: 5,823 files, 8.6 MB | CC0-1.0 for all 15 (`manifest.json`) |
| `models/` | 51,133 Creator Store ids (847 Roblox official). **481** "normally loadable" (Roblox-owned, script-free); 158 conditional third-party cartoon candidates | "Roblox-free" use by id. Roblox-owned only, because `LoadAsset` refused 20 of 20 third-party free models in Studio (D-MODELLIB-1) |
| `ui-store/` | 77,076 free Creator Store UI image ids | same |
| `sfx/` | 139,954 items: 126,780 Roblox-licensed partner audio, 13,101 CC0 (freesound, OpenGameArt, Kenney), 73 Sonniss (no redistribution); 30,000 playable-indexed; 14 MB of committed packs | per row |
| `vfx/` | 22 presets, 209 textures | engine textures plus presets |
| `ui-components.json` | 34 components x 4 genre skins | built from the packs above (D-UIONLY-1) |
| `sources/*.jsonl` | UI (1,546 entries) and icon (543; 245 import-ok, 298 reference-only) catalogues | `import-ok` only for CC0/PD, free Creator Store, or explicit commercial licence; all else `reference-only` |

### 16.2.6 The Hugging Face and GitHub harvests

`scripts/harvest-hf.mjs` and `scripts/harvest-roblox-knowledge.mjs` apply three gates in order: **licence** (permissive
SPDX, and not asserted over third-party content), **currency** (modified within 365 days), **content** (template share
at most 25%, inert share at most 35%, at least 90% pass Luau syntax and anti-pattern checks on a sample). A
`REJECTED.json` is written on every run. Outcomes (`packages/training/data/hf/REJECTED.json`,
`packages/corpus/raw/manifest.hf.json`, 2026-09-15 to 09-21):

| Source | Verdict | Reason |
|---|---|---|
| `8BitStudio/Roblox-luau-coding_L1` | 23 retrieval chunks admitted; **training forbidden** | Apache-2.0 on the card is an uploader's assertion, not a licence file |
| `TorpedoSoftware/RobloxQA-v2.0` | Admitted as an **eval gate** only | MIT, MCQ prose, not a code corpus |
| `TorpedoSoftware/roblox-info-dump` | Refused | MIT tag over Roblox's own docs (card says Roblox keeps copyright); 44.8% of rows duplicate; 18.4% base64 |
| `Roblox/luau_corpus`, `Roblox-Luau-Reasoning-v1.0` | Refused | 1,036 and 544 days stale |
| `khtsly/*` (2) | Refused | licence "other" |
| `PatoFlamejanteTV/RobloxCodeLarge2UNFILTRED` | Refused | MIT stamped over a 1.9 GB scrape of others' game scripts |
| Roblox safety/3D models (RobloxGuard, PII and voice classifiers, cube3d) | Catalogued only | openrail or Apache-2.0; not used |

The GitHub side is cleaner: `roblox-github-v1` holds 1,035 repositories (MIT 911, Apache-2.0 89, Unlicense 18, CC0 7,
other 10) with the licence document's sha256 recorded per repo and 5,294 vendored paths excluded
(`packages/training/data/roblox-github-v1/dataset-card.json`). A wider lead list of 4,269 repos was 2,046 permissive,
2,060 unlicensed, 153 copyleft (`docs/github-corpus-licences.md`). Net: the harvest produced rigorous refusals and
almost no admitted data, which is the right outcome for a licence-first product.

### 16.2.7 Rights summary (one line each)

| Asset | Can it ship in a paid product? |
|---|---|
| Research notes, skill cards, creator skills, verified modules, components | Yes: authored here |
| Creator-docs RAG chunks | Yes, with CC-BY attribution (per-chunk url) |
| CC0 packs (15) | Yes |
| Creator Store ids (models, UI, sound) | By id, in the customer's place, with the Roblox-owned filter; third-party free models fail `LoadAsset` |
| Roblox-licensed partner audio | Roblox terms; used by id inside Roblox only |
| Owner library | **Unresolved.** Owner-attested, no licence work, other creators' games; cannot be a public asset without a rights decision |
| Public GitHub Luau (1,035 repos) | Licence text retrieved per repo; MIT/Apache attribution duties apply if redistributed |
| Local adapters | Own derivative; base licences (Llama 3.2 community licence needs "Built with Llama") per `docs/research/model-licensing.md` |
| Customer prompts and projects | Promised never used for training (privacy page) |

---

## 16.3 Analytics and observability

### 16.3.1 What is logged, and where

| Layer | What | Retention | Person data | How it is read |
|---|---|---|---|---|
| **Event log in AdminDO** (`apps/worker/src/analytics.ts`, `analytics-sink.ts`, `do/admin.ts`) | Five kinds: `request` (route label, method, status, duration), `model_call` (feature, provider, model, tokens, cached tokens, neurons, outcome), `error` (scope, kind, redacted message, fatal), `build` (one agent run: outcome, steps, ops applied/failed, duration, neurons, finish reason), `audit` (action, actor kind, allowed) | 30 days **and** 5,000 rows, whichever bites first; eviction recorded (`retention.ts`) | Actor id only if the account has not opted out; unknown consent withholds it (`analytics-consent.ts`) | `GET /api/admin/logs?kind=`, `GET /api/admin/analytics`, `/api/admin/account/:userId` |
| **Analytics Engine** `apple_product_events` (`analytics-engine.ts`) | Same events as one data point each, fixed column layout | 3 months | **None** (no user, project or message) | `GET /api/admin/product-analytics` (needs `CF_ANALYTICS_TOKEN`; whether set is unverified) |
| **BudgetDO / QuotaDO** | Service-wide spend per day, model and kind (62 days); per-user credit ledger (35 days) | as stated | QuotaDO is per user | `GET /api/admin/spend`, admin console |
| **Sentry** (`sentry.ts`, `apps/web/src/lib/sentry.ts`, `docs/MONITORING.md`) | Unhandled exceptions, 5xx, cron failures; browser `onerror`, rejections, React crashes. Closed allowlist event; no bodies, headers, cookies, query strings, breadcrumbs, replay, user context | Sentry's | None by design | Sentry UI (org `moshe-s6`; projects `apple-worker`, `apple-web`); DSN set on `apple` and probed 2026-09-20 (`docs/GO-LIVE.md`) |
| **Cloudflare Workers Logs and Traces** (`wrangler.apple.jsonc`) | `observability.enabled`, traces sampled 5% | Cloudflare's | Not scrubbed by this repo | Dashboard. Traces were free until 2026-10-01 and now count against 20M events/month ($0.60 per extra million): **recheck the sample rate, the file said to revisit it with a real measurement** |
| **Per-run state** (SessionDO) | Transcript, plan, evidence ledger, build ledger, model-call list, checkpoints, `stop_reason` | per project; checkpoints newest 25 | project data | `POST /api/admin/agent-run/:id`, `/api/admin/session-messages/:id`, `/api/admin/session-info/:id`; used to build `t1-round4/model-calls.json` |
| **Health** | `GET /api/health`: `buildSha`, `compat: wire-both`, `legacyWire` counts (evidence for removing the old wire spelling) | live | none | curl |
| **Owner dashboard** (`scripts/owner-dashboard/`, `127.0.0.1:4777`) | Agent activity, token cost of the Claude sessions that build the repo, library pages, games | local | none | the owner's browser |
| **Benchmark artefacts** | owner-bench JSON, critiques, `docs/evidence/` (361 entries), `docs/FAILURES.md` | git / disk | none | the closest thing to a quality time series |
| **Discord** (`DiscordDO`, `discord.ts`) | Owner notifications | n/a | n/a | Discord |

Design rule worth keeping (top of `analytics.ts`): **an unreadable metric renders as unknown, never as zero.** Every
number is a `Metric` that is either known (with sample count and an unreadable count) or `{known:false, why}`; a window
cut by the 5,000-row cap says `complete:false`; a retention cohort too young for day 7 says `not_yet_observable`.
Routes are collapsed to labels (`/api/projects/:id/ws`) so the log is not a per-tenant record, and messages pass
through one secret scanner (`redaction.ts`) before storage.

### 16.3.2 What a rollup can answer today

`GET /api/admin/analytics?days=1..30&retentionDays=1..30&by=<dimension>` returns: counts per kind; cost (neurons and
USD); latency quantiles; tokens; success; builds by outcome (`done`, `failed`, `stopped`, `quota`, `incomplete`,
`error`, `step_limit`, `timeout`, `unknown`); error breakdown; provider and model breakdowns; feature usage; a
day-N **retention cohort table** (`retentionRollup`); audit totals. `funnelRollup` exists in the same file.

### 16.3.3 What is missing for a real product

| Gap | Evidence | Why it matters |
|---|---|---|
| **No funnel is exposed.** `funnelRollup(events, steps)` is implemented and tested but no route calls it, and no named step list exists. | grep: only `analytics.ts` references it | The first product question, "where do new users drop between sign-up, Studio paired, first run and first finished game", cannot be asked |
| **No named product events.** Events are HTTP routes, model calls, errors and one `build` row. There is no `signed_up`, `project_created`, `plugin_paired`, `first_run_done`, `game_published`, `upgraded`, `churned`. | `EVENT_KINDS` (five) in `analytics.ts` | Funnels would have to be reverse-engineered from route labels |
| **No quality signals in the log.** The self-check verdicts (look result, claim audit "not checked", blind-critique severity, `judge_game` score, world-pass steers) are not events. `BuildEvent` has outcome, steps and neurons only. | `BuildEvent` | The product's central problem is quality; production cannot measure it, only the owner's manual benchmark can |
| **No client analytics at all** (page views, clicks, onboarding steps). No third-party analytics SDK in `apps/web` or `apps/site`. | grep of both apps | No marketing funnel, no onboarding drop-off |
| **Retention is short and thin.** 5,000 rows and 30 days in AdminDO; a busy week truncates the start of the window. Analytics Engine has 3 months but no person, so it cannot give cohort retention. | `retention.ts`; `analytics-engine.ts` | A real retention curve needs about 90 days of identified, consented events at scale |
| **Consent coupling.** Cohorts need `actorId`, which opted-out and not-yet-cached users withhold. | `analytics-consent.ts` | Retention is biased low until consent is cached; fine at today's scale, wrong at product scale |
| **No paging.** Sentry is passive; there is no alert rule evidence, and the golem-removal runbook notes alert rules and release names were never inspected ("no Sentry tool was available"). | `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` C10 | A 04:00 outage is still a row nobody reads |
| **No user-facing cost or outcome analytics.** Credits burn visibly, but no per-run "what did I get for this" ledger; a free account's allowance is 231 credits/day against a 77-credit build in `PLAN_LIMITS`, while `CUSTOMER_FINDINGS.md` F-019 (2026-09-22) records "a free account gets 100 a day", an older figure. | `packages/shared/src/index.ts`; `docs/autonomy/CUSTOMER_FINDINGS.md` | Pricing decisions have no usage distribution behind them |
| **No real-customer data yet.** The product has had owner and test-account traffic only; Stripe is test mode for an allow-list; commercial launch is held (`docs/autonomy/MISSION.md`). | `BILLING_TEST_ADMINS` | Every analytic above is built, none is calibrated |
| **Plugin telemetry.** The plugin sends a version header only (`X-Golem-Plugin-Version`); no client-side error or version-skew reporting beyond that. | `apps/apple-plugin/src/Bridge.luau` | Roblox has no auto-update; installed base fragments permanently (`plugin-version.ts`) |

---

## 16.4 Glossary

Where a term has two meanings, both are given. "WIP" means on a handoff branch, not on `main`.

### Names and product shape

| Term | Meaning | Lives in |
|---|---|---|
| **Apple** | The product: an AI that builds Roblox games inside the user's own Studio. One name since 2026-10-02. Also the cheaper lane's name in old docs. | `AGENTS.md` section 1 |
| **Apple vX** | The V3 label for the single customer engine (GLM 5.3 Flash plus deterministic routing). No tiers, no Plan/Agent/Autonomous modes. | `docs/autonomy/MISSION.md`, `v3/` |
| **Apple MAX** | The retired paid lane. Still a wire value (`apple-max`); both lanes resolve to the same model. Plans display as Free, Pro (id `builder`, $12), Max (id `studio`, $40). | `packages/shared/src/models.ts`, `PLAN_COPY` |
| **golem** | The old name. Cloud resources keep it (worker `golem`, D1 `golem-corpus`, Vectorize `golem-docs`, AI Gateway id `golem`, header `X-Golem-Plugin-Version`). Owner standing consent (2026-10-02) permits removal. | `scripts/golem-allowlist.json`, `scripts/check-no-golem.mjs`, `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` |
| **wire-both** | `/api/health` reports `compat: 'wire-both'`: the worker accepts both the old and the new wire spellings; legacy reads are counted as evidence for removal. | `apps/worker/src/index.ts`, `packages/shared/src/legacy-wire.ts` |
| **clay / stone / rune / memory / vision** | Gateway config keys for model roles, not product lanes. `plan` and `agent` are the V3 keys. | `apps/worker/src/gateway.ts`, `docs/model-serving-reality.md` |
| **Sparks** | The old name for credits. | memory `golem-project.md` |
| **Plan / Agent / Autonomous** | Old user-facing modes; V3 makes them internal stages. | `docs/autonomy/v3/` |
| **V3, G01-G16** | The owner's locked scope of 2026-09-28 and its acceptance gates. **Retired as a goal on 2026-10-04**; kept as history. | `docs/autonomy/`, `GOAL.md` |
| **Lumen Isles** | A hand-authored demo experience, not a product output. | `apps/experiences/lumen-isles` |

### Infrastructure and runtime

| Term | Meaning | Lives in |
|---|---|---|
| **Worker** | The whole backend: Hono router (`index.ts`, 7,409 lines), Durable Objects, tools. | `apps/worker/src/` |
| **SessionDO** | One per project. Browser WebSocket, the plugin's long-poll op queue, checkpoints, the alarm-driven agent loop, run state and ledgers. | `apps/worker/src/do/session.ts` (7,790 lines) |
| **QuotaDO** | One per user. Authoritative credits ledger, daily reset. | `do/quota.ts` |
| **BudgetDO** | Singleton. Every inference call reserves neurons first and settles the true cost after; serialised, so concurrent calls cannot race past the ceiling. The only spend guard, because AI Gateway overage is uncapped. | `do/budget.ts`; memory `apple-zero-cost-architecture` |
| **PairingDO** | Singleton. Short-lived 6-character codes linking a plugin to a project. | `do/pairing.ts` |
| **AdminDO** | Singleton. Analytics sink and operational counters. | `do/admin.ts` |
| **DiscordDO** | Discord notifications. | `do/discord.ts` |
| **Workers AI** | Cloudflare's hosted open-weight models; the only inference provider in production. | `gateway.ts`, `pricing.ts` |
| **AI Gateway** | Cloudflare's proxy in front of Workers AI (cache, rate limit, logs); id `golem`. Not the same as the model gateway. | `AI_GATEWAY_ID`, `docs/research/ai-gateway.md` |
| **Model gateway** | `apps/worker/src/gateway.ts`: the single entry point for all inference; kill switch, budget reservation, prompted-tool fallback, no automatic retries. | same |
| **Owner-library gateway** (the "gateway") | The Python loopback server on the owner's Mac (`127.0.0.1:63747`) serving `/v1/library*`; unreachable from the cloud. | `packages/owner-corpus/gateway.py` |
| **Plugin pairing** | The user types the 6-character code from the web app into the Apple Studio plugin; the plugin then long-polls for typed ops. The plugin is the only thing that touches the place. | `PairingDO`, `apps/apple-plugin/src/Bridge.luau` |
| **Enable edits** | The "Enable edits..." button, then "Allow edits for this connection", in the plugin panel. **Apple's own consent gate, not a Studio setting**; writes are refused without it. | `apps/apple-plugin/src/Commands.luau`, `prompts.ts` |
| **Allowlist** | Every class and property an op may write is an `X = true,` line in `Commands.luau`; anything else is refused. Composers and components must stay inside it. | `apps/apple-plugin/src/Commands.luau` |
| **Plugin version** | Source 1.5.0 (audio API, Animator/IK, Explosion); worker `LATEST_PLUGIN_VERSION` and the Creator Store build 1.0.0 (asset 107230158271368). Admission is by protocol, never by version. | `apps/apple-plugin/package.json`, `plugin-version.ts` |
| **CORPUS / KV / VEC / MEDIA / PRODUCT_EVENTS** | Bindings: D1, KV, Vectorize, R2, Analytics Engine. | `wrangler.apple.jsonc` |

### The library and the asset order

| Term | Meaning | Lives in |
|---|---|---|
| **Owner library** | The 565 owner-supplied games and their 97k assets, catalogued and searchable. Also called the owner corpus; the corpus code is `packages/owner-corpus`, the data is `~/Library/Application Support/Apple/owner-library/`. | 16.2.2 |
| **owner-classify** | Phase 2: one classified record per asset hash, plus hybrid search (BM25 plus MiniLM dense). | `packages/owner-classify/` |
| **eval50, held-out** | The 50 labelled search queries (tuned on), and two held-out query sets written before ranking changes. | `packages/owner-classify/eval50.json`, `eval_heldout*.json` (WIP branch) |
| **Kit** | Four meanings: **genre kit** (one of 11 coherent briefs: palette, lighting, style tags, pinned audio; `genre-kits.ts`); **UI kit** (a library UI pack, 367 in the owner library); **scene kit** (studded map pieces); **component package** (`packages/components`). | `apps/worker/src/genre-kits.ts`, `packages/corpus/data/kit-pins.json` |
| **Composer** | A deterministic builder that turns a recipe into a base game: `compose_game` (tycoon, plot-sim, lane-defense), `compose-*.ts`. "A composer counts only as a base"; a world pass must follow. | `apps/worker/src/compose*.ts` |
| **Recipe, component** | A recipe says what a game is (library pieces plus numbers); components are the code pieces (`economy`, `waves`, `shop`, ...). | `compose.ts`, `packages/components/` |
| **Studded / studded UI** | The default visual direction: bright, saturated bricks with classic studs; the UI version is an image-button on a public stud tile with UIGradient, UICorner, 3 px stroke, Fredoka One text. Theme choices: `cartoony | studded | none`. | `studded-map.ts`, `stud-ui.ts`, `build_studded_ui` |
| **plan_game / build_game / recreate_owner_game / assemble_owner_game** | Owner-library flows: design a game from the best working cores (180 knowledge cards), build the saved design, copy or assemble from library blueprints. | `game-plan.ts`, `library-assemble.ts` |
| **AppleHidden / AppleStudioData** | Tag for a hidden-not-deleted library screen; the Studio data stand-in that keeps DataStore games playable before publishing. | `library-*.ts`, `apple_studio_data.luau` |
| **Asset order** | Owner order of 2026-10-02: library first, then Creator Store (Roblox-owned and quality first), then combine and adapt, then build from scratch only as a last resort, highly detailed. A capability, not a refusal by name. | `docs/autonomy/DECISIONS.md` **D-MODELLIB-3** |
| **D-MODELLIB-1 / -2 / -3** | 1: props from a stored model library, parts as fallback (2026-09-23); 2: never make a model from scratch, enforced by about 130 banned nouns (superseded); 3: the asset order as a capability. | same |
| **D-UIONLY-1 / -2** | 1: all game UI comes from the stored UI library, Apple never draws UI by hand (`create_instances` refuses GuiObjects, `run_luau` refuses `Instance.new` of them); 2: render the same recipe without an image upload when an id is absent. | same |
| **D-FXLIB-1, D-UILIB-1/2, D-UISTORE-1** | Sounds and particles from a stored library; UI libraries from open licences, bytes in the D1 static store; free Creator Store images allowed. | same |
| **Roblox-owned only** | Creator Store models are insertable only if owned by Roblox (creatorId 1), script-free, unbranded and under 100k triangles. | D-MODELLIB-1 |

### The agent harness: guards, checks and notes

| Term | Meaning | Lives in |
|---|---|---|
| **Tool** | A function the model can call. 122 are registered in `TOOLS`; 58 are "governed" with phase and permission labels. A new tool must also be registered in `packages/shared/src/index.ts`, `mcp.ts` and `run-idle.ts`. | `tools.ts`, `CLAUDE.md` |
| **Deferred tools / `more_tools`** | Tool groups not offered until asked for, to save context. | `tools.ts` `DEFERRED_GROUPS` |
| **Harness note** | A fenced message the harness injects into the run as a steer (not from the user): look results, flags, judge findings, skill pushes. Quoted text is fenced as untrusted data. | `run-parts.ts` (`fenceForQuote`), `session.ts` |
| **Skill card** | A short genre-agnostic recipe (at most 2,200 chars) with trigger keywords, chosen deterministically and pushed into the prompt (2 per request, 1 per plan step, 5 per run). 23 exist. | `skill-cards.ts`, `packages/corpus/data/skill-cards.json` |
| **Creator skill** | A longer recipe (2-6 steps, preconditions, failure modes, at most 2,800 chars read payload) found by `search_creation_skills` / `read_creation_skill`. 519. | `creator-skills.ts` |
| **Skill push** | The harness ranks creator skills for the current plan step and hands the top 1-2 to the run as a harness note (at most 8 per run, 14,000 chars, never past 60% context). Added because the small model made 0 knowledge calls in 90 tool calls. | `skill-push.ts` |
| **Self-check** | Four parts sharing one evidence ledger, on in production since 2026-10-04 (`SELF_CHECK=on`): `look`, the completion gate, the claim audit, the blind critique. Bounds: 1 forced look, 2 repair rounds, 6 looks per run, 2 audit rounds. | `self-check.ts` |
| **Evidence ledger** | Run-scoped facts: what the run wrote, read back, looked at and played, each stamped with how it was known and when. No opinions. Capped (60 entries). | `evidence-ledger.ts` |
| **`look`** | A tool that frames what changed from several angles including player eye level and asks the vision role for observations (seen / not seen / cannot tell), never a score. | `studio-look.ts` |
| **Look gate / completion gate** | A run that changed the place may not answer before one look at it. Structural: it reads the ledger, never the request. | `look-gate.ts` |
| **Claim audit** | Checks a reply's concrete claims (colour, visible text, counts, behaviours) against the ledger: **supported**, **contradicted**, **unsupported** (reported as "not checked", never as wrong). Never rewrites the agent's words. | `claim-audit.ts`, `claim-audit-judge.ts` |
| **Blind critique** | Before answering a world-changing run, a vision call sees only the user's request and the frames and lists the top 5 flaws; a severe one sends the agent back for one fix pass. Switch `SELF_CHECK_CRITIC`. | `blind-critique.ts` |
| **`judge_game`** | A tool that judges a composed game on what the owner named: a new map (not a copied world), the twist actually built, creatures that move, assets that load, a working buy/place/wave loop. | `composed-judge.ts`, `tools.ts` |
| **Judge gate** | The run may not answer over its own latest "not ready" verdict; up to 2 send-backs, then the answer states what is not ready. | `judge-gate.ts` |
| **World pass** | After a composer, at least 3 content changes (placed model, built object, terrain, instances) are required; up to 2 steers, as a concrete list of calls. | `world-pass.ts`, `world-steps.ts` |
| **Read-stall guard** | A run that only reads (scripts, trees, spatial queries) is nudged to build after 6 reads and ended as `incomplete` after 20. Idle-after-verify: nudge at 4, limit at 8. Ended Phase T round 3. | `run-idle.ts` |
| **Duplicate guard / retune stop / step cap** | Other loop-ending guards: identical repeated calls, repeated edits to one target, per-run step ceilings. | `session.ts` |
| **Build ledger** | What earlier runs of this project built, injected as a labelled "may be unrelated" block; nothing leaks between projects. | `build-ledger.ts` |
| **Context budget / context budget test** | The transcript size per step is **derived** from the tightest of three ceilings (per-step neuron reservation, context window at 2.5 chars/token, 2 MB run-state storage), with an 0.85 margin and a trim to 70%. `prompt-budget.test.mjs` holds it, and `composer-kit.test.mjs` holds the tool-definition size ("stays inside the context budget"). | `prompt-budget.ts`, `apps/worker/tests/` |
| **A5** | Scenario A5 of the security eval, "prompt / tool injection": every tool result entering the transcript is fenced as untrusted; it also names the rule that a run's queued ops cannot reach the user's place after the run ends (`op-attribution.ts`). 56 of 56 pass. | `packages/evals/src/security.test.mjs` line 2540 |
| **Per-request neuron cap** | `MAX_NEURONS_PER_REQUEST = 1,200`; bounds one model step. It refused the stronger-model comparison runs. | `pricing.ts` |

### Quality loop and process

| Term | Meaning | Lives in |
|---|---|---|
| **The bench / owner bench** | The owner's frozen 30-request bank (`owner-30-v1`) plus a held-out bank of 21, run in a fresh chat on a clean Baseplate and judged by the vision role on 9 criteria. Retired as a loop on 2026-10-04. | `packages/evals/owner-bench/` |
| **The meter** | Two things. (1) The fixed formula 25% agent, 20% knowledge+library, 15% visual, 10% UI, 10% sound/anim/FX, 20% website (baseline 27.8%, two domains estimated). (2) The owner-requested "total completion" bar (35.6% on 2026-10-04 15:00). Both retired as goals. | `owner-bench/score.mjs`; planning section 2 |
| **Phase R** | The 2026-10-04 goal: research Roblox game-making from cited public sources and feed it to the agent as knowledge, skills and prompt principles. No benchmark runs. Done: 23 notes fed. | `GOAL.md`, `research/roblox/BRIEF.md` |
| **Phase T** | Build 3-5 real games from one-line ideas, judged by a blind critic against the research-derived 12-criterion bar; gaps go back to Phase R. Game 1 round 1-3: 2, 1.5, 1.5 /10. | `GOAL.md`, `research/roblox/PHASE-T.md` |
| **Owner phase plan 0-7** | An older phase numbering (0 baseline, 1 strip request-specific code, 2 library search, 3 Creator Store, 4 capabilities, 5 visual/UI, 6 website, 7 frontier loop). Unrelated to Phase R/T. | `docs/autonomy/PHASE-3-4-PLAN.md` |
| **Blind critic / gauntlet** | A fresh agent given only final screenshots (and the one-line idea) that critiques at top-100-game standard. The gauntlet was the earlier reference-image version (D-GAUNTLET-2 dropped reference images). | `docs/gauntlet/`, D-GAUNTLET-2 |
| **Generalize-not-patch** | The owner directive of 2026-10-02: never hand-fix one result or add code that recognises a subject; every failure is a missing capability; fixes pass a 3-unseen-request test. Guard tests ban subject literals. | memory (deleted 2026-10-04); `no-subject-literals` tests |
| **Frontier** | The goal of Apple being a frontier Roblox model; a "frontier benchmark" scored the bank at 11/12 per item. The morning's claim was withdrawn. | `docs/autonomy/` |
| **D-xxx, F-nnn, ADR** | Owner decisions (`docs/autonomy/DECISIONS.md`, `docs/DECISIONS.md`), recorded failures and falsifications (`docs/FAILURES.md`, F-58..F-64), architecture decisions. | those files |
| **Mods** | 36-38 function-hook mods loaded into every Claude Code session (state display, path fixes, `.env` loading). Tooling, not product. | `CLAUDE.md` |
| **Lanes (Tommy, John, Mark)** | Names for parallel agent sessions in one checkout; never `git add -A`, `switch` or `stash` in the shared tree. | memory `golem-two-agent-lanes.md` |
| **research-feed, fix-r3, handoff/\*** | `research-feed` is the current code. `fix-r3` holds round-3 fixes and the harness step-plan WIP; `handoff/*` are saved WIP branches (`search-90`, `site-v4`, `web-v4`, `repo-reorg`, `fixes-0410`, `integration-giant`). | git branches |

### Money

| Term | Meaning | Lives in |
|---|---|---|
| **Neuron** | Cloudflare's billing unit for Workers AI: $0.011 per 1,000 ($0.000011 each); 10,000 free per day. | `pricing.ts` |
| **Credit** | What the user sees: 1 credit = 30 neurons. A quality-gated build is budgeted at 77 credits (2,310 neurons). Plans give a renewable allowance; purchased credits never expire and are spent after it. | `packages/shared/src/index.ts` (`NEURONS_PER_CREDIT`, `CREDITS_PER_BUILD`, `PLAN_LIMITS`) |
| **"Apple has no cap"** | Owner decision 2026-09-29: the daily and monthly neuron caps were set to 1e9 and 3e10 so a build only stops at a real blocker. Cloudflare's bill is the bound; the arithmetic maximum in `COST-MODEL.md` is $330,005 a month. | `pricing.ts`, `docs/COST-MODEL.md` |
| **Kill switch** | Admin route that stops all inference. | `/api/admin/kill-switch` |

### Training

| Term | Meaning | Lives in |
|---|---|---|
| **LoRA, QLoRA, MLX** | Low-rank adapter fine-tuning; the 4-bit variant; Apple's array framework used to train on the Mac. | `packages/training/` |
| **train-forever** | The supervisor that trains one lever per version and promotes only on a paired win. | `src/train-forever.mjs` |
| **Pinned v5 eval** | The 38-row held-out set (23 trajectory, 8 game-logic, 7 finish) used for every version. | `runs/eval-set-v5.jsonl` |
| **Metal watchdog** | macOS killing long GPU command buffers (`kIOGPUCommandBufferCallbackErrorImpactingInteractivity`); the usual cause of truncated runs; judge by the log, not the exit code. | `train-forever.mjs` |
| **`OWNER_DISABLED`** | The marker that training is cancelled by the owner. | `packages/training/OWNER_DISABLED.json` |
| **RobloxQA gate** | The 3,000-question multiple-choice knowledge check, never trained on. | `packages/evals/data/robloxqa/` |

---

## 16.5 Key numbers

| Number | Value | Source |
|---|---|---|
| Worker tests | 5,413 (5,407 pass, 6 skipped) at `2ffd22db`, 2026-10-04 | `research/roblox/phase-t/t1-round4/validation.md` |
| Root tests | 630 (614 pass, 16 skipped), same date | same |
| Security evals | 56 of 56 | same |
| Web / site tests (older) | 2,453 / 309 at the 2026-10-02 merge | `HANDOFF.md` of 2026-10-02, readable with `git show handoff/search-90:HANDOFF.md` |
| Plugin tests | 77 (2026-09-30) | `docs/autonomy/CURRENT_STATE.md` |
| Test files | worker 410, web 221, site 50, plugin 24, root 46, training 66, evals 56 | `ls` of each tests dir, this branch |
| Agent tools | 122 registered; 58 governed | `apps/worker/src/tools.ts` (TS parse); `packages/shared` `GOVERNED_TOOLS` |
| Plugin version | source 1.5.0; worker `LATEST_PLUGIN_VERSION` 1.0.0, and the Creator Store build is 1.0.0 by inference (nobody read the published bytes) | `apps/apple-plugin/package.json`; `plugin-version.ts` |
| Plugin / worker size | 9,302 Luau lines; `index.ts` 7,409, `session.ts` 7,790, `tools.ts` 6,934 lines | `wc -l` |
| Owner library | 565 games; 97,428 assets; 12.2M instances; 225,900 scripts; 54 systems; 504 families; 5,797 media | `CURRENT_STATE.md`; catalog |
| Classification | 87,173 items (103,703 rows); 95.9% fully classified | `owner-classify/README.md` |
| Search top-3 | 76% eval50 (tuned); 86% on WIP branch; 80% and 78% held-out | commits `70d9c0ba`, `a2188239`; `search-90.md` |
| Docs corpus | 8,326 chunks, 2,193 documents | `chunks-witness.json` |
| Research | 23 notes; 269,399 words; 2,212 citation entries; 1,025 chunks | `packages/corpus/research/` |
| Skills | 23 skill cards; 519 creator skills; 80 verified modules | corpus and `creator-skills.ts`; planning section 2 |
| Asset library | 15 CC0 packs; 51,133 model ids (481 loadable); 77,076 UI ids; 139,954 sounds; 34 UI components | `packages/asset-library/` |
| Training data | 1,035 GitHub repos (29,232 files); MLX v5 318 rows; 404 harvested rows | training data cards |
| Training results | 35 configs; 23 adapters; best 26 of 38 (v34); game logic at most 1 of 8 | `FOREVER-LOG.md` |
| Workers AI LoRA | rank at most 8 (32 ambiguous); under 300 MB; 100 adapters; 9 capable models, 0 with native tools | `model-serving-reality.md` |
| Bench scores | baseline 7.27/18 (26 items); self-check 9.36/18 (11 items); best row 12/18 | `BASELINE.md`; planning section 8 |
| Phase T game 1 | 2, 1.5, 1.5 /10 (rounds 1-3) | `phase-t/` |
| Prices (build model) | GLM 5.3 Flash $0.15 in, $0.03 cached, $0.50 out per M tokens | `pricing.ts` |
| Plans | Free $0; Pro $12; Max $40; Enterprise custom | `PLAN_COPY` |
| Credits | Free 231/day, 2,310/month; Pro 416 / 12,600; Max 700 / 21,000; Enterprise 833 / 25,000 | `PLAN_LIMITS` |
| Unit economics | 1 credit = 30 neurons; build = 77 credits = 2,310 neurons; per-step cap 1,200 neurons | `packages/shared`, `pricing.ts` |
| Measured run costs | Phase T r3: 192 credits, 298 s; self-check bench mean 207 credits per item vs 12.6 at baseline | `MODEL-COMPARISON.md`; planning section 8 |
| Cloudflare floor | Workers Paid $5/month; 10,000 free neurons/day | `docs/COST-MODEL.md` |
| Event log | 5 kinds; 30 days; 5,000 rows; Analytics Engine 3 months | `retention.ts` |
| Traces | 5% head sampling | `wrangler.apple.jsonc` |
| Skill push / cards | 8 pushes, 14,000 chars per run; 2 cards in prompt, 5 per run | `skill-push.ts`, `skill-cards.ts` |
| Loop guards | read-stall 6 nudge / 20 stop; self-check 1 forced look, 2 repairs, 6 looks; judge send-backs 2; world pass 3 changes, 2 steers | `run-idle.ts`, `self-check.ts`, `judge-gate.ts`, `world-pass.ts` |
| Docs evidence | 361 evidence entries | `docs/evidence/` |
| Repo visibility | public on GitHub since 2026-09-28 (private library files stripped) | `docs/autonomy/DECISIONS.md` D-V3-3 |

---

## Open questions this section raises for the planners

1. **Is a model-training track part of the final product at all?** Evidence says no business case today (not servable
   on the production model, no game-logic gain, owner cancelled). If the answer is "maybe later", what is the trigger:
   a LoRA-capable Workers AI model with native tools, a different provider, or owned inference?
2. **Is "your content is never used for training" a permanent promise?** The schema already has an opt-in column and
   the repo has a consent gate. If a data flywheel from real runs is wanted, the privacy page, onboarding and export must
   change first, and consent must be real, not defaulted.
3. **What is the legal basis for the owner library in a paid product?** It is 565 other creators' games with
   owner-attested commercial use, no licence work, on one Mac, in a public repo's shadow. Options: keep it as an internal
   reference only; clear a subset; replace it with original kits; or ship nothing derived from it. The earlier catalogue
   was deleted for exactly this pattern.
4. **If the library stays a product asset, where does it live?** Today no customer can reach it (loopback gateway,
   owner Mac only). A cloud store changes cost, licensing, security and the "works in CI" assumptions.
5. **Search quality: is 78% on unseen queries enough?** The owner asked for 90% without fitting. The remaining gap needs
   model-written item descriptions (an unapproved paid or local-LLM step) or a better embedding model. Which, and who
   funds it? Also: the embedding weights currently come from a VS Code extension's file.
6. **Which data assets are real moat and which are research scaffolding?** Candidates for moat: the 23 cited notes, 519
   skills, 80 verified modules, the owner bench, and (if cleared) the library. Which of these should be hardened
   (versioned, re-verifiable, licence-recorded) first?
7. **Should quality become a production metric?** Self-check verdicts, blind-critique severity and judge scores are not
   events today, so only the owner's manual bench can see quality. A planner should decide whether the final product
   emits a per-build quality record (and whether users see it).
8. **What is the first funnel?** Define the named steps (visit, sign-up, project, plugin paired, edits enabled, first run,
   run finished, game kept, return in 7 days) so `funnelRollup` can be wired and a client-side event source added.
9. **Which analytics stack is the final product's?** Keep the in-worker approach (privacy-first, 30 days, 5,000 rows) and
   extend it, or adopt a product-analytics service (an Amplitude connector is available to the planners' tools but needs
   authorisation)? Retention beyond 30 days and cohort analysis need a decision about identified, consented storage.
10. **Who is paged?** Sentry is passive and alert rules were never inspected; trace sampling at 5% should be re-measured now
    that traces are billable. Decide the minimum on-call story before any public launch.
11. **How much of the held-out evidence must exist before claims are made?** `heldout-v1` (21 items) has never been run,
    the raw result files for three runs live in a separate clone, and nothing was measured after 2026-10-04 00:14 UTC.
    Is a re-run, with the results committed beside the bank, a precondition for planning on the 9.36/18 figure?
12. **Naming and wire cleanup.** Is the golem-to-Apple wire removal (`wire-both`, `legacyWire` counts) a launch
    blocker or a post-launch cleanup, given the published Studio plugin 1.0.0 still speaks the old spelling?
