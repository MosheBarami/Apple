# 7 and 9. The knowledge system and the Studio plugin

_Written 2026-10-04 from the `research-feed` checkout at `/Users/moshe/Developer/RbxAI-feed` (HEAD `2ffd22db`). The
production worker reports `buildSha: "2ffd22db-dirty"` at `/api/health`, so the live backend is this branch, built from
a dirty tree. Everything below was read from source, from git, or from read-only scripts over the local tree. I did not
query D1 or Vectorize, run a test, open Studio, or touch the Creator Store. Where a number depends on one of those, it
is labelled as reported, not measured._

## 0. What a planner should take from this section

**Findings that differ from the brief this section was written against**

| Brief says | The code and git say | Where |
|---|---|---|
| The Creator Store listing is live per `STUDIO_PLUGIN_STORE_LIVE`. | The constant is **`false`**. It was flipped back on 2026-09-25 after the 1.4.0 overwrite, when the asset page rendered 404 and the toolbox probe answered 404. The cause is unknown (Q-020: "the moderation case, not an unchecked distribution setting, is the blocker"). `STUDIO_PLUGIN_STORE_REFUSAL` is `null`. Every install button points at `/docs/plugin`. | `packages/shared/src/index.ts:2079`, `docs/evidence/plugin-install-path-2026-09-25.md`, `docs/autonomy/OWNER_QUEUE.md` Q-020 |
| `LATEST_PLUGIN_VERSION` tracks publish status. | It is **`'1.0.0'`**: the build published 2026-09-19. Source is 1.5.0. Public plugin release (L02) is on the owner's hold list. | `apps/worker/src/plugin-version.ts:86`, `docs/autonomy/NEXT_ACTION.md` |
| Plugin Luau harness has 79 specs. | 79 is the **node:test case count** in `apps/apple-plugin/tests` (76 top-level `test(` plus 3 nested, in 24 files). Those drive about 171 embedded Luau `spec(` calls through the `luau` CLI. All Luau-driven tests **skip silently** when `luau` is not on `PATH`. | `apps/apple-plugin/tests/*.test.mjs` (static count) |
| 1,319 api, 7,009 guide, 1,025 research, 23 skill passages live. | The 1,025 research and 23 skill figures reproduce exactly when I run the chunkers locally. The api/guide figures are consistent with the tracked witness (8,326 `chunks.jsonl` lines on 2026-09-23; 1,319 + 7,009 = 8,328) but I could not read the live index. | `packages/corpus/src/research-chunks.mjs`, `data/skill-cards.json`, `data/chunks-witness.json` |

**The five things that matter most**

1. The knowledge base is large and well-cited (23 notes, 269,399 words, 2,212 listed sources, 1,025 searchable passages)
   but it is **reachable only by retrieval**. The agent does not go looking. Measured on 2026-10-04 (t1 round 1): 0 calls
   to `search_docs`, `search_creation_skills` or `read_creation_skill` in 90 tool calls. The product's answer is
   push-by-harness (skill cards, per-step creator-skill push), not more content.
2. This Mac cannot rebuild or re-prune the docs index: `packages/corpus/data/chunks.jsonl` and the `raw/` checkouts are
   absent. Only the research notes can be re-uploaded (`research-upload.mjs`), and that path never prunes.
3. The plugin is **65 supported operations and one named refusal** (`run_code`), allowlist-bounded and consent-gated.
   Nothing the agent writes reaches the place except through typed ops.
4. 1.5.0 and the `GetObjects` insert fallback exist **only in source on `research-feed`** and, per the owner's session
   record, in a local build on his Mac. No customer can install them: the store flag is false and 1.0.0 is the last
   published build.
5. The `GetObjects` fallback is the first asset loader in a plugin that Roblox has removed from the Creator Store
   for "Misusing Roblox Systems" more than once. It is guarded, tested and byte-verified, but a store reviewer may not
   weigh the guards the way the repository does. See 9.5.

---

# Part A. The knowledge system

## 7.1 The corpus package: `packages/corpus`

`packages/corpus` is `@apple/corpus` (private, ESM, one dependency: `yaml`). It does two different jobs that share a
folder: it **builds the RAG index** (fetch, chunk, upload) and it **runs a source-intake pipeline** (discover, scan,
hash, tag, manifest) that classifies third-party GitHub code by licence and security. Only the first job feeds
`search_docs`. The second feeds the mechanic library, the UI asset index and the owner's licence ledger.

### Pipeline stages

| Stage | File | What it does | Output |
|---|---|---|---|
| Fetch | `src/fetch.mjs` | Shallow, blobless, sparse clone of sources listed in `data/sources.json`; LFS smudge off; then `--record-only` records every checkout in `raw/` (URL, SHA, SPDX licence) whoever made it. A source that has not been classified cannot be fetched at all. | `raw/manifest.json` (38 sources; creator-docs pinned at `529a24ff`) |
| Bootstrap | `src/bootstrap.mjs` | Restores checkouts on a fresh clone from the tracked lock, at pinned SHAs, only for classifier-cleared sources. Never executes what it downloads. | `raw/<Owner__Repo>/` |
| Intake: discover, enumerate, scan, hash, tag, manifest | `src/discover.mjs`, `enumerate.mjs`, `scan.mjs`, `hash.mjs`, `tag.mjs`, `manifest.mjs` (+ `src/intake/*`) | Resolve the seed manifest and the Wally and Pesde indexes (a declared licence is a claim, never trusted), licence-classify each repo, run the security gate before anything is extracted, collapse identical forks to one record, tag domain, era and quality, and generate `docs/SOURCE_MANIFEST.md`. All resumable | `data/sources.json` (3.3 MB), `content.json`, `registries.json` |
| **Chunk** | `src/chunk.mjs` | Turns creator-docs YAML (API reference) and creator-docs plus luau.org Markdown into chunks. `EMBED_CAP = 12000`, API chunk max 3,500 chars, guide chunks 600 to 1,200 chars (hard max 2,600). Priority for embedding: all api, then Luau docs, then scripting, UI, mechanics and tutorials, then building and art guides. | `data/chunks.jsonl` (gitignored, about 10 MB) |
| Research chunks | `src/research-chunks.mjs` | Splits each `research/NN-*.md` on `##`/`###`, at most 2,400 chars per piece, kind `research`, URL = first source the chunk cites. | in memory, appended at upload |
| Skill-card chunks | `src/skill-card-chunks.mjs` | Turns the 23 skill cards into kind `skill` chunks (`vecId: skill-<id>`), cited to the card's first docs URL. | in memory, appended at upload |
| **Plan** | `src/index-plan.mjs` | Hashes every chunk (sha1 over docSlug, title, url, kind, text, NUL-joined, first 16 hex), diffs against what the index reports, yields add, update, reembed, unchanged, remove. An unreadable manifest throws; it is never treated as empty. | plan |
| **Upload** | `src/upload.mjs` | `GET /api/admin/corpus-manifest`, plan, `POST /api/admin/corpus-init` once, `embed-batch` (50 per batch), then `corpus-prune` (200 per call). `--limit`, `--full`, `--no-prune`, `--dry`. | live index |
| Research-only upload | `src/research-upload.mjs` | Sends only the research chunks (`--notes 15,16`, `--dry`), add or update, **never prune**, needs only `research/`. | live index |
| Chunk witness | `src/chunk-witness.mjs` + `scripts/build-chunk-witness.mjs` | A tracked, small record of what `chunks.jsonl` says about the documents the repo cites (see below). | `data/chunks-witness.json` |

`package.json` wires the whole chain as `pnpm all`: `fetch --record-only`, `scan`, `hash`, `tag`, `chunk`, `upload`.

### The chunk witness

`chunks.jsonl` is a 10 MB build artefact that exists on no fresh clone. Two things cite documents in it by exact
address: `data/genre-references.json` (25 official documents) and `CREATOR_SKILL_REFERENCES` in
`apps/worker/src/creator-skills.ts` (60+ more). Their tests used to read the file directly, threw `ENOENT` on CI and
stopped `pnpm -r test`. The witness fixes that without committing the 10 MB file.

- `data/chunks-witness.json` is 371 KB, tracked, schema 1. It records, for each cited document, the list of
  `{vecId, title, url, kind}`. Today it holds 229 documents and 1,639 chunk rows (106 api, 1,517 guide, 16 research),
  with the source file's `sha256` (`afcdfe50...`), `sourceLines: 8326` and `documentCount: 2193`, dated 2026-09-23.
- Everywhere (including CI), tests check the manifests' claims against the witness.
- Where `chunks.jsonl` exists, a test re-derives the witness and requires a byte-identical match. Where it does not, the
  test logs "was NOT re-derived here" and passes. That is the case on this Mac.
- `research/tools-add-witness-docs.mjs` and `research/tools-docids.sh` add rows by querying **live D1** through
  `wrangler d1 execute golem-corpus --remote`, with a hard-coded path into another worktree
  (`/Users/moshe/Developer/RbxAI-ci/apps/worker`).

**Latent defect (read from code, not run).** The witness now holds five `research-*` documents (notes 05, 07, 14, 20,
23) because they were added from live D1. `chunk.mjs` emits no research or skill chunks (they are appended in memory by
`upload.mjs`), so `deriveWitness` over a real `chunks.jsonl` cannot find them and throws "cited but are not in
chunks.jsonl". The first time someone rebuilds the docs corpus and runs the tests, or runs
`scripts/build-chunk-witness.mjs`, it should fail. The comment in `chunk-witness.mjs` still says "25 documents, 359 chunk
ids".

## 7.2 Sources, licences and `PROVENANCE.md`

`packages/corpus/PROVENANCE.md` is the licence ledger. The governing rule: **only licence-compatible public sources, a
verified LICENSE file, a `url` on every chunk.**

| Source | What is taken | Licence | Attribution mechanism |
|---|---|---|---|
| 1. `Roblox/creator-docs` | `content/en-us/reference/engine/**/*.yaml` as compact per-class chunks (`kind: api`); `content/en-us/**/*.md` guides excluding `reference/`, `assets/`, `includes/` (`kind: guide`) | Prose CC-BY-4.0, code samples MIT (SPDX-verified 2026-08-30) | creator credit, licence notice in `PROVENANCE.md`, per-chunk `url`, modification notice (mechanical extraction only) |
| 2. `luau-lang/site` | Markdown docs (syntax, types, library) as `kind: guide`, URL `luau.org/<page>` | MIT | same. **Licence gate:** if `fetch.mjs` cannot verify a MIT or CC-BY LICENSE file, `chunk.mjs` skips the source entirely |
| 3. Apple research notes | `packages/corpus/research/NN-topic.md`, written 2026-10-04 onward | Apple's own text. Facts restated in Apple's words; at most a few quoted words; every fact carries `[S#]` to a public source | per-chunk `url` = first cited source; `[S#]` markers stay in the chunk text; third-party figures are labelled with their date |
| Excluded | `content/en-us/assets/` media; Roblox `Full-API-Dump.json` and mirrors (no explicit licence); MPL-2.0 repos (rojo, StyLua, selene); `license: other` HF scrapes | | |

Observations for planners:

- The file says "`raw/` and `data/` are gitignored; nothing from the corpus is committed". That is stale: `.gitignore`
  un-ignores about 20 files in `data/` and `raw/manifest*.json` (the lock is tracked on purpose), and `data/sources.json`
  alone is 3.3 MB.
- Source 3 rests on "authorship by synthesis". The notes cite DevForum threads, press, analytics sites and developer
  talks. Facts are not copyrightable, but nobody has recorded a decision on DevForum or analytics-site terms of use.
  See open questions.
- The 38 `raw/manifest.json` sources include GitHub game and tooling repos (MIT and similar, each with an SPDX id and a
  `COMMERCIAL_REUSABLE` or `ATTRIBUTION_REQUIRED` class). Of 3,017 harvested repositories, 131 survive into the
  mechanic library (the rest excluded by rule: 1,599 no licence, 522 no mechanic evidence, 206 not Luau, and so on).
  Nothing is vendored; the agent reads the approach and writes its own.

## 7.3 The live index

| Store | Name | Holds | Notes |
|---|---|---|---|
| D1 | `golem-corpus` | table `chunks(rowid, vec_id unique, doc_slug, title, url, kind, text, embedded, indexed_at, content_hash)`; FTS5 table `chunks_fts(vec_id unindexed, title, url unindexed, text)` | `corpus-init` creates both and adds the three newer columns by try/catch `alter table` |
| Vectorize | `golem-docs` | one vector per embedded chunk, id = `vecId`, metadata `{slug, kind}` | model `@cf/baai/bge-small-en-v1.5` (384 dimensions); text embedded is `title + "\n" + text`, sliced to **2,000 chars** |
| Worker | `apps/worker/src/index.ts:4266-4400` | admin routes `corpus-init`, `embed-batch` (1 to 60 chunks), `corpus-manifest` (paged by rowid, up to 2,000), `corpus-prune` (1 to 200 ids, deletes D1 rows, FTS rows and vectors), `corpus-census`, `rag-test` | all behind `X-Admin-Key`. The worker and D1/KV names stay `golem` (wire and infra rule) |

Reported counts (brief, owner session record), by `kind`:

| Kind | Reported live | Source of the rows | Locally reproduced |
|---|---|---|---|
| `api` | 1,319 | creator-docs YAML | not reproducible here (no `raw/`) |
| `guide` | 7,009 | creator-docs and luau.org Markdown | not reproducible here |
| `research` | 1,025 | 23 notes | **1,025 exactly**, 23 documents, longest chunk 2,400 chars, longest id 28 bytes, all ids unique |
| `skill` | 23 | `data/skill-cards.json` | **23** |

Research chunks per note: 33, 30, 61, 45, 37, 41, 51, 36, 34, 38, 33, 50, 48, 52, 52, 54, 52, 46, 41, 72, 43, 41, 35
(notes 01 to 23). Note 20 (systems cookbook) is the biggest at 72.

`embed-batch` is idempotent by design: `chunks` upserts on `vec_id`, and because FTS5 has no unique constraint the
handler deletes the FTS row before inserting (an earlier version appended duplicates, which RRF then double-counted).
`embedded` only ever ratchets up (`max(chunks.embedded, excluded.embedded)`).

## 7.4 Retrieval: `rag.ts` and `retrieval.ts`

`searchDocsDetailed(env, query, k = 5)` in `apps/worker/src/rag.ts`, with the pure parts in `retrieval.ts`:

1. **Gate.** `isSearchableQuery` rejects empty or non-searchable text with an explicit outcome, not an empty list.
2. **Two retrievers in parallel (`Promise.allSettled`).**
   - Vector: embed the query with bge-small, `VEC.query(topK: 8)`, then join to D1 `chunks` by id. Rows are returned in
     the vector index's order. A vector with no D1 row is silently dropped.
   - Keyword: `keywordQuery` builds an FTS5 `MATCH` from at most 8 terms (`MAX_QUERY_TERMS`), OR-joined, stopwords
     removed; `order by bm25(chunks_fts) limit 8`.
3. **Fuse.** Reciprocal rank fusion with `RRF_K = 60`, equal weights, a non-finite weight throws.
4. **Rerank.** Multiplicative over the fused score: `coverage 1.2`, `titleCoverage 0.8`, `phrase 0.6` (maximum boost
   3.6x), coverage weighted by term rarity, then a freshness decay (`HALF_LIFE_DAYS 365`, floor `DECAY_FLOOR 0.6`,
   `FRESH_DAYS 30`, `AGING_DAYS 180`). Age can reorder near-ties but cannot overturn a decisive lexical win.
5. **Drop irrelevant.** For queries of three or more terms, a hit needs lexical coverage of at least 0.34 (or a phrase
   match) unless it came from the vector half. This exists because a nonsense query ("kubernetes horizontal pod
   autoscaler...") used to return five Roblox passages as "official documentation".
6. **Top k = 5**, citations numbered by URL.
7. **Diagnose a miss.** A zero-hit search counts the index (`corpusCensus`) and returns `miss`, `empty-index`,
   `unembedded-index` or `unavailable`, with `certain: false` when a backend failed. One backend failing degrades to the
   other; both failing throws.

The tool wrapper (`search_docs` in `apps/worker/src/tools.ts:5590`) returns `{citation, title, url, excerpt}` with the
excerpt cut to **900 characters**. A research chunk can be 2,400 characters, so the agent sees at most the first 37% of a
long recipe chunk. The vector sees 2,000 of 2,400 characters. The keyword half sees all of it.

Two properties worth knowing:

- Freshness reads `indexed_at`, the time the row was written, not the date of the source page. A freshly uploaded
  2024 guide is "fresh". The research notes carry their own staleness flags in text, which retrieval cannot read.
- Because `topK` is fixed at 8 before the D1 join, any orphan vector (see 7.7) takes a slot and is then discarded, so
  effective vector recall can fall below 8.

## 7.5 How the agent actually reaches knowledge

Seven channels. Only the first is a model-initiated search over the corpus; the rest are pushed or are structured
lookups. The mapping below combines `research/roblox/PIPELINE.md` (mapped 2026-10-04) with the current code.

| Channel | Store | Reach | Bounds |
|---|---|---|---|
| `search_docs` | D1 + Vectorize (above) | model calls it. The prompt says to use it for genre design, limits, prices, policy, new or deprecated APIs, "up to four calls per request", and not for core APIs it already writes correctly (`prompts.ts:265`) | k = 5, 900-char excerpts |
| **Skill cards**, auto-pushed | `data/skill-cards.json` (23 cards) via `apps/worker/src/skill-cards.ts` | **no tool call.** Keyword overlap: at least 2 distinct trigger words (or 1 plus the step's tool). Up to `MAX_PROMPT_CARDS = 2` in the system prompt, plus one per plan step, at most `MAX_CARDS_PER_RUN = 5`. A whole-game request takes the `game-from-idea` card plus its genre card on a single matching word | each card at most 2,200 chars (longest today 2,193); no subject words in a card |
| **Per-step creator-skill push** | `apps/worker/src/creator-skills.ts` (about 519 skills per the owner's session record; `CREATOR_SKILL_COUNT` is computed at load and tests only assert more than 200) via `skill-push.ts` | before each plan step the harness ranks skills against the **step's own words** (request words weigh a quarter), pushes the top one or two as a harness note. A skill needs `MIN_STEP_SCORE 110` and at least 2 matching words in its id, title or keywords. A step whose tool builds in the workspace takes only the `worldbuilding` domain | at most 8 skills per run, 2 per step, 14,000 characters per run, 2,800 per body, and nothing once the transcript passes 0.6 of its budget; all persisted on the run so a restart cannot reset them |
| `search_creation_skills` / `read_creation_skill` | same skill catalogue | model calls them; token scoring id 60, title 50, keywords 22, summary 10, steps 3 (per `PIPELINE.md`) | read payload at most 2,800 chars |
| Genre references (`get_genre_references`) | `data/genre-references.json` (11 genres, 8 aspects, 53 external references, 25 official documents, 88 implementation links) | model calls it; `genre` is a free string on purpose so a genre outside the 11 gets an honest "no coverage" | reference-only, never fetched or executed |
| Mechanics (`find_mechanic`) | `mechanics.ts`: 36 `MECHANIC_PATTERNS` (authority, current API names, failure modes) joined to `mechanic-citations.ts` (131 licence-checked repos) and to prefabs | model is told to call it once before writing any game system. Where a prefab exists it wins (`install_module`) | citations carry licence and author; nothing vendored |
| Verified modules (`get_verified_module`) + `need-index` | `data/verified-modules.json` (80 Luau modules run against their own checks at build time), `data/need-index.json` (80 modules, a customer-phrased vocabulary generated blind) via `need-index-search.ts` | model calls it for cooldowns, currency, XP curves, round transitions, and so on | BM25F scorer. Measured 2026-09-20: customer-phrased queries find the right module first 49/80 with the old scorer, 73/80 with BM25F plus the need index (79/80 in the top five) |

Also in play, but not knowledge channels: the system prompt (`prompts.ts`, about 47 KB), which carries 6 to 8 lines of
researched principles; `data/kit-pins.json` (55 pinned Creator Store items for genre kits, all resolved); and
`data/ui-construction.json`, `ui-assets-github-v1.json` (1,060 UI-building Luau files), `style-visual-evidence.json`,
`template-seeds.json` (the 3,017-row harvest).

Skill cards by domain: genre 7, game 4, systems 3, ui 2, props 2, fx 2, map 1, lighting 1, art 1. Seven of the 23 were
added on 2026-10-04 (Phase R): simulator, tycoon, obby/racing, tower defense, horror/survival, PvP, social/roleplay, plus
`visual-style-of-hits` and `thumbnail-icon-grammar` (commit `65af8ba6`).

**Why push beats pull here.** `skill-push.ts` records the measurement: in 90 tool calls the agent made zero knowledge
calls although about 360 researched skills existed at the time. The cheap build model (GLM 5.3 Flash, per section 15 of
this dossier) does not browse. The remaining design question is whether the pushed text is the right text for the
step, which is a ranking problem, not a content problem.

## 7.6 The research program

### Brief and pipeline

`research/roblox/BRIEF.md` (in the main checkout, untracked there; identical notes are tracked in
`packages/corpus/research/` on `research-feed`) is the contract for each research agent. Rules:

- **Source trust order.** (1) create.roblox.com/docs and luau.org. (2) devforum.roblox.com staff and highly voted
  community resources, naming the author. (3) Roblox corporate and creator blog, RDC talks, investor letters (for
  platform numbers). (4) developer postmortems, GDC and named talks, reputable press with dates. (5) analytics sites
  (RoMonitor Stats, Rolimons, Bloxbiz/Gamefam), whose numbers are labelled "third-party".
- **No invention.** Never invent a fact, number, API name or property; write "unverified" or leave it out. Flag anything
  older than 2024. Prefer 2025 to 2026. Summarise in your own words; quote a few words at most.
- **File format.** `# Topic`, `_Researched <date> by <agent>. Sources: N._`, then `## Key facts`, `## How to apply it
  (rules for an AI builder)`, `## Recipes (each becomes a skill)` (When to use, Steps, Pitfalls), `## Luau reference
  snippets` (modern, `task.wait`), `## Open questions / unverified`, `## Sources` with `[S1] Title, publisher/author,
  date, URL`.
- **Targets.** About 4,000 to 9,000 words, at least 25 distinct sources, at least 8 recipes where buildable.

Round 1 (notes 01 to 11) is the broad map: viral hits, discovery, genre design, Luau architecture, world visuals, UI/UX,
animation/audio/VFX, monetisation and policy, tools ecosystem, from-scratch playbook, RDC 2026 and roadmap. Round 2
(notes 12 to 23, "more research first", owner, 2026-10-04) goes deeper "with real numbers from real games" per genre
family (simulator/incremental, tycoon, obby/racing, defense, horror/survival, PvP, social/roleplay) plus five craft notes
(visual study, systems cookbook, building craft, player psychology, asset and audio sourcing).

`PIPELINE.md` then maps the five ways knowledge reaches the agent (the table in 7.5 is its descendant), and its last
section lists **capability gaps the research found**: the plugin allowlist lacked the new Audio API, Animator, IKControl
and Explosion. That gap was closed the same day by plugin 1.5.0 (9.4).

### The gap passes

Every note except 07 and 11 carries a line near the top, "Gap pass 2026-10-04: N resolved, M still open". A gap pass is
a second research session that re-reads the note's open questions against primary sources and either resolves them,
corrects the note, or deletes the unsupported claim. Two commits show the scale:

- `b0dadb7a`: "gap-pass corrections to nine notes; RDC 2026 and roadmap note (418 research chunks)".
- `10bb5c27`: "round-2 gap passes (notes 12-23) and one corrected skill". It "resolved ~120 open items (wiki tables via the
  MediaWiki API, Roblox public endpoints, reference pages for BindToSimulation, GetNetworkPing, buffers over remotes,
  Tool events, FastCast, Cmdr) and deleted unsupported claims". Note 22's Kids/Select entry bar is 250 since 2026-08-19
  (the docs page wins over a June-July post). One skill stopped claiming a 70% sell refund (the reference game refunds
  about a third). 12 notes changed, 459 insertions, 303 deletions.
- Earlier corrections withdrew a claim that Roblox said tycoon and roleplay earn less from Creator Rewards (note 13 found
  no such statement; no skill repeated it).

By my count across the 21 notes that carry the line: 201 items resolved, about 180 still flagged open.

### The 23 notes

Word counts are `wc -w` on `packages/corpus/research/NN-*.md`. Source counts are the lines in each note's `## Sources`
section that start with `[S<number>]`. Chunks are the output of `researchChunks()`. The last column is the gap-pass line
as written in the note.

| # | Note (file) | Topic | Words | Sources | Chunks | Gap pass resolved / open |
|---|---|---|---:|---:|---:|---|
| 01 | `01-viral-hits` | Hits 2023-2026: loops, hooks, what spread, monetisation, cadence, CCU | 9,374 | 68 | 33 | 17 / 8 |
| 02 | `02-discovery-growth` | Discovery and recommendation signals, thumbnails, analytics benchmarks, launch | 8,653 | 87 | 30 | 9 / 7 |
| 03 | `03-genre-design` | Design craft per genre: loops, progression, economy, FTUE, retention | 17,566 | 159 | 61 | 10 / 19 |
| 04 | `04-luau-architecture` | Client/server, remotes, DataStores, performance, 2024-2026 APIs | 10,766 | 107 | 45 | 6 / 12 |
| 05 | `05-world-visuals` | Lighting, terrain, materials, scale, level design, budgets | 9,973 | 85 | 37 | 6 / 10 |
| 06 | `06-ui-ux` | Mobile-first UI, safe areas, constraints, HUD and shop patterns | 9,009 | 99 | 41 | 8 / 8 |
| 07 | `07-anim-audio-vfx` | Animator, new Audio API, particles, beams, trails, game feel | 10,657 | 69 | 51 | none recorded |
| 08 | `08-monetization-policy` | Passes, products, Premium Payouts, DevEx, policy and moderation | 8,592 | 86 | 36 | 12 / 7 |
| 09 | `09-tools-ecosystem` | Assistant, Studio MCP, Creator Store safety, libraries, testing | 8,697 | 96 | 34 | 9 / 12 |
| 10 | `10-from-scratch-playbook` | Idea to launch: scope, vertical slice, MVP, playtest, iteration | 9,303 | 70 (header says 72) | 38 | 9 / 8 |
| 11 | `11-rdc-2026-and-roadmap` | RDC 2026 announcements with status, Creator Roadmap Oct 2026, investor letters | 7,664 | 49 | 33 | none recorded |
| 12 | `12-genre-simulator-incremental` | Simulators, idle, collecting/RNG: systems, numbers, rebirth math | 13,157 | 96 | 50 | 15 / 8 |
| 13 | `13-genre-tycoon-building` | Tycoons, base building, life-sim, placement systems | 13,743 | 117 | 48 | 12 / 7 |
| 14 | `14-genre-obby-racing-platform` | Obby, tower, speed-escape, parkour, racing | 12,541 | 72 | 52 | 7 / 6 |
| 15 | `15-genre-defense-strategy` | Tower defense, wave survival, RTS-lite | 15,953 | 131 | 52 | 17 / 7 |
| 16 | `16-genre-horror-story-survival` | Horror, story, survival-crafting | 15,456 | 111 | 54 | 13 / 8 |
| 17 | `17-genre-pvp-combat` | Battlegrounds, shooters, melee, duels, ranked | 15,024 | 113 | 52 | 15 / 8 |
| 18 | `18-genre-social-roleplay-party` | Roleplay, hangout, party, social "steal" formats | 12,699 | 152 | 46 | 10 / 7 |
| 19 | `19-visual-study-top-games` | How top games look: palettes, lighting, UI art, thumbnails | 9,743 | 92 | 41 | 4 / 6 |
| 20 | `20-systems-cookbook` | Modern Luau for inventory, quests, rounds, NPC AI, hitboxes, vehicles, placement | 19,429 | 100 | 72 | 6 / 5 |
| 21 | `21-building-craft` | Blockout, kits, low-poly props, architecture, terrain, optimisation | 11,930 | 99 | 43 | 4 / 8 |
| 22 | `22-player-psychology-audience` | Age bands, regions, devices, motivation, fairness, parent expectations | 10,635 | 87 | 41 | 9 / 12 |
| 23 | `23-asset-and-audio-sourcing` | Creator Store search, licensing, audio permissions, what an AI builder may fetch | 8,835 | 67 | 35 | 3 / 7 |
| | **Total** | | **269,399** | **2,212** | **1,025** | **201 / about 180** |

Notes on the table:

- The BRIEF's 25-source minimum is met by every note; the smallest is 49 (note 11).
- Notes 12 to 23 average over 13,000 words, well above the BRIEF's 9,000 ceiling; the hard cap on a chunk is 2,400
  characters, so length costs chunk count, not chunk quality.
- Each note ends with a labelled "Open questions / unverified" list. The notes themselves mark which numbers are
  first-party, third-party, derived or search-snippet only. That labelling lives in prose, so retrieval cannot filter on
  it.
- Per-note recipe headings total about 347 (counting `###` under `## Recipes`). They became creator skills in a run of
  commits on 2026-10-04 (for example 14 simulator recipes from note 12, 16 PvP recipes from note 17, 9 sourcing recipes
  from note 23); the owner's session record puts the catalogue at 519 skills, 302 of them new.

## 7.7 Known limits

| Limit | Mechanism | Consequence |
|---|---|---|
| **No `chunks.jsonl` on this Mac** | `chunks.jsonl` is gitignored and absent; `raw/` holds only the two manifests (24 KB). `upload.mjs` exits "not found - run pnpm chunk first"; `chunk.mjs` has nothing to chunk | The docs half (api and guide, about 8,300 rows) cannot be refreshed, re-planned or pruned from here. Rebuilding needs `pnpm bootstrap` (re-clone creator-docs at `529a24ff`, luau-site) then `pnpm chunk`. The index was last built 2026-08-30 to 2026-09-23 |
| **Stale prune handling and orphan vectors** | `research-upload.mjs` never prunes, and `research-chunks.mjs` makes ids content-addressed (`research-NN-<sha8(title+i+part)><sha8(part+i)>`), so any edit to a chunk's text yields a new id. `upload.mjs` does prune (desired set = chunks.jsonl + skill cards + research) but only where chunks.jsonl exists. If Vectorize `deleteByIds` fails, `corpus-prune` reports `vectorsDeleted: false` after the D1 rows are already gone | Re-uploading an edited note adds the new chunk and leaves the old row, FTS row and vector alive. `10bb5c27` rewrote 12 notes after `8d92a5d6` reported 994 chunks; whether the live index was cleaned afterwards is unrecorded, and nobody has diffed live against local. An orphan vector with no D1 row is dropped after the join and wastes one of the 8 vector slots; an orphan D1 row stays FTS-searchable and serves stale text. Silent recall loss, not an error |
| **64-byte Vectorize id cap** | Vectorize ids are capped at 64 bytes. Research ids are 28 bytes by construction (note number plus hash) and `research-chunks.test.mjs` pins `<= 64`. Guide ids are `g-<8 hex>-<n>`; API ids are `api-<slug>-<n>` from a class or datatype name | Only research ids are tested; an API id from a very long name is not |
| **Embedding truncation** | `embed-batch` embeds `title + "\n" + text` sliced to 2,000 chars; research chunks go to 2,400 | The last 400 characters of a long research chunk are keyword-searchable but not vector-searchable. `search_docs` shows only 900 characters of any chunk |
| **Freshness is index age** | `indexed_at` is the upload time | A stale source page looks fresh. No per-document source date exists in the index |
| **Witness breaks on a rebuild** | See 7.1 | Rebuilding the docs corpus and running tests is expected to fail on the five research documents |
| **Manifest paging cap** | `fetchManifest` pages 1,000 at a time up to 200 pages (200,000 rows) and returns null on any failure | Fine for today's 9,400 rows, fails closed above 200,000 |
| **Skill-card and creator-skill triggers are vocabulary, not meaning** | Keyword overlap, no embeddings | A step phrased unusually matches nothing and gets nothing (by design: "a step no skill is about gets nothing rather than the nearest thing") |
| **Banned subject words** | `prompt-no-subjects` / `no-subject-literals` tests ban subject nouns from the prompt, cards, creator skills and tool definitions | Knowledge must stay genre-general; any game-specific kit has to live outside those four surfaces |

---

# Part B. The Studio plugin (`apps/apple-plugin`)

## 9.1 What it is

A Luau plugin, source in `apps/apple-plugin/src`, built with Rojo from `default.project.json` (`"tree": {"$path": "src"}`)
into `release/apple-studio.rbxm`. It is one of two plugins in the tree: `apps/plugin` is the **legacy** build (asset
`132128477945417`, removed by Roblox, kept only as test fixtures that 16 other test files read).

| File | Lines | Role |
|---|---:|---|
| `src/init.server.luau` | 516 | Entry point and dock UI: pairing box, "Connect to Apple", "Enable edits...", the asset-consent prompt, selection and Output event capture, the edit-mode definition, teardown. Returns immediately if Studio is not in edit mode at load (in a Test server it only runs the PlayCheck watchdog) |
| `src/Bridge.luau` | 867 | Transport only: `claim` and long-`poll` over `HttpService:RequestAsync`, replay table, bounded result and event queues, version headers |
| `src/Commands.luau` | 5,665 | The command engine: path parsing, every allowlist, decode and encode of typed values, all core handlers, consent and edit-mode gates, undo recording, snapshot and restore, the capability report |
| `src/ops/*.luau` | 3,137 (14 files) | 13 op families, loaded by `ops/init.luau` and merged into the one allowlist at load |
| `src/PlayCheck.luau` | 1,025 | The player-side Test session check (`StudioTestService:ExecutePlayModeAsync`) and its harness |
| `src/Render.luau` | 502 | Bounded software rasteriser (the agent's only way to "see" the scene without native capture). Ported from the legacy plugin and held to the original specs |
| `src/StudioCapture.luau` | 259 | Native active-viewport PNG capture, at most 320 x 240 and 240 KiB of PNG |
| `src/GenerationService.luau` | 468 | Adapter for Roblox's `GenerationService:GenerateModelAsync` (text to 3D), result detached until QC passes |

**Why `src/ops/` exists.** `Commands.luau` sits at Luau's 200-local limit when Studio compiles at `-O0`; it refused to
load once (2026-09-22, "Out of local registers"). New operations therefore ship as op families that return
`{name, build(api)}`; `Commands.luau` merges what they declare into the same `HANDLERS`, `MUTATING`, `CONSENT_ONLY`,
`CREATE_CLASSES`, `PROPERTY_ALLOW` and `READ_PROPERTIES` tables. A family may add but never override an existing op, a
script class, an engine-owned class, or a Content, `Source`, `Parent` or `ClassName` property; otherwise the whole
family refuses to install and the reason goes in the capability report. A missing family reports none of its ops, and
the worker offers family ops only when the plugin says "supported" (`OPT_IN_OPERATIONS`).

### The build and verify chain (`scripts/build.mjs`)

1. Parse every bundled source with `luau-analyze` (syntax errors only; without Roblox type definitions the analyzer's
   exit code carries no signal) and refuse a `require` of a module that is not bundled (`scripts/sources.mjs`).
2. Compile every source with `luau-compile --null -O0`, exactly as Studio does.
3. `rojo build` to `release/apple-studio.rbxm`.
4. `scripts/inspect-plugin-build.py` decompresses every chunk and scans for credentials, private hosts, developer paths.
5. `scripts/verify-artifact.py` reads the **built bytes**: the version string matches `Bridge.luau`; 18 required
   needles are present (the rasteriser, `StudioCaptureService`, `ExecutePlayModeAsync`, `GenerateModelAsync`,
   `golem.studio-ops.v1`, `OP_FAMILIES.install`, the script-scan refusal text, the `edit_consent` remedy code, and so
   on); forbidden call shapes are absent; and the artifact holds **exactly one** copy of the id-only `GetObjects` call.
   It refuses to certify if fewer than 50,000 decompressed bytes were read, and it self-tests that its own rules can
   match planted violations.

The build never installs or publishes. CI (`.github/workflows/ci.yml`, job `plugin`) runs it on every push and
uploads `apple-studio-pr-unverified`. `plugin-release.yml` is `workflow_dispatch` only and produces a release
candidate. Publishing to Roblox is a human act; nothing in the repo uploads.

Stale text to correct: the plugin `README.md` safety contract still says "No asset loaders", "`run_code`, remote asset
insertion and automatic Run mode remain fail-closed", and "Entering Run mode or disconnecting clears edit permission".
The code now inserts assets (with guards) and **pauses** rather than revokes consent on Run (D-PLUGIN-2). The
`init.server.luau` header comment still says "No ... asset loaders". `AGENTS.md` says "6 Luau files in src/"; there are
7 top-level files plus the 14-file `ops` folder. `docs/PLUGIN-RELEASE.md` quotes "41 tests on 2026-09-22".

## 9.2 Pairing and the consent button

**Pairing.**

1. In the web app the user mints a code. `PairingDO` draws 6 characters uniformly from the 31-symbol alphabet
   `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1; the code explicitly avoids modulo bias), valid for **10 minutes**.
2. In Studio the user opens the dock (toolbar button "Apple Studio"), types the six-character code, presses "Connect to
   Apple". The plugin refuses to connect while a Studio test is running, and refuses a code that is not exactly 6
   alphanumerics.
3. The plugin posts `{code, place}` to `/api/studio/claim` (unauthenticated, IP rate limited at 10 per window).
   `place` is the open place's name, ids and so on, so the worker binds the project to that place and later refuses ops
   that arrive in a different one.
4. The worker returns a token `<projectId>.<48 hex chars>` (24 random bytes). The token lives **in memory only**; there
   is no `GetSetting`, so closing Studio ends the pairing and the dock says so up front. The worker sets a 30-day
   token life and renews at half-life.
5. The plugin then long-polls `/api/studio/poll` with the token, `X-Golem-Plugin-Version` and
   `X-Golem-Plugin-Protocol` headers (the wire names keep `Golem`; renaming breaks live sessions). Polls are limited to
   400 per window per IP. Each poll also carries a `state` event (place name, ids, run mode, selection count, version)
   that the plugin refuses to send if it cannot be read, so the worker never serves a project without knowing what is
   open.
6. Pairing the same project from another Studio window **supersedes** the first; the older window is told so.

**What pairing discloses and permits (reads).** On the dock: while connected Apple may read the place's objects and
scripts, the current selection, Studio Output messages, and snapshots of the active 3D viewport over HTTPS. Reads need no
edit consent. Selection and Output events are pushed to the worker automatically (Output lines that start with "Apple"
are skipped; 600 chars each, queues bounded at 64).

**"Enable edits" (writes), pressed twice.** The button reads "Enable edits...". The first press shows a confirmation
paragraph (Apple may create or change supported objects and scripts, control a Run-mode playtest, start a short Test
session with a player whose temporary scripts are removed afterwards; writes need edit mode and an undo recording;
disconnecting turns the permission off) and relabels the button "Allow edits for this connection". The second press sets
`allowEdits = true`. A third press turns it off. The system prompt tells the model never to describe this as a Studio
restriction: it is Apple's own gate.

**What clears or pauses consent.**

| Event | Effect |
|---|---|
| Disconnect, plugin unload, session end | `allowEdits` cleared, owner-gateway override cleared |
| Studio enters Run or a Test | Edits **pause** ("Access: edits paused while Studio is testing"); consent is retained for the connection (D-PLUGIN-2, 2026-09-23: a kid pressing Play should not have to re-consent) but every write is refused until Studio returns to edit mode. A half-finished confirmation is dropped |
| Run-mode `stop`, `pause`, `resume` | Allowed while outside edit mode, but only for a Run that Apple itself started (`appleRun` tracking) |

Order of the two gates is itself tested: **edit mode is checked first**, so the refusal says "stop the test" rather than
"press Enable edits", which would be a button that refuses mid-test. A mutation test swaps the order and requires the
suite to go red.

The same two gates guard `create`, `set`, `delete`, `move`, `restore` and `generate_model`, plus the consent-only ops in
9.3.

## 9.3 The operations

Source of truth: `HANDLERS` plus `DEFERRED_MUTATING` plus the two special branches in `Commands.luau`, plus the family
handlers. The shared `StudioOp` union in `packages/shared/src/index.ts` has **66** op names;
`tests/protocol-coverage.test.mjs` fails if one has no handler or named refusal. The plugin reports a capability
document (`golem.studio-ops.v1`) at pairing, derived from the same tables, and the worker withholds every tool whose op
is unsupported.

**65 supported operations and 1 named refusal.** Core engine 37 (34 `HANDLERS` entries, `restore`, `undo_waypoint`,
`generate_model`); op families 28.

| Category | Count | Operations | Gate |
|---|---:|---|---|
| Reads of the place | 27 | `ping`, `get_tree`, `get_instance`, `list_scripts`, `read_script`, `dump_scripts`, `search_scripts`, `get_selection`, `get_logs`, `viewport_info`, `inspect_model`, `project_census`, `snapshot`, `query_instances`, `spatial_query`, `terrain_read`, `collision_groups_list`, `ui_layout_check`, `preload_content`, `render_view`, `screenshot`, `capture_studio_viewport`, `query_owner_local`, `query_owner_exact`, `query_owner_assembly`, `query_owner_media`, `query_owner_library` | pairing only. `capture_studio_viewport` and the five `query_owner_*` ops use the pairing fence; they do not need edit consent. `preload_content` asks Studio whether asset ids load for this account without inserting anything |
| Recorded writes | 29 | `create_instances`, `insert_asset`, `set_props`, `terrain_edit`, `delete_instances`, `move_instances`, `transform_instances`, `clone_instances`, `group_instances`, `ungroup_instances`, `rename_instance`, `set_locked`, `set_visible`, `edit_script`, `restore`, and from families `set_props_bulk`, `scatter`, `collision_groups`, `terrain_shape`, `create_rig`, `place_copies`, `strip_descendants`, `apply_surface`, `rig_model`, `set_joint_pivot`, `reset_joints`, `import_owner_local`, `import_owner_library`, `import_owner_component` | edit mode **and** per-connection consent; one `ChangeHistoryService` recording per op (one Ctrl+Z); a failure cancels the recording; only one write at a time (`conflict` otherwise) |
| Deferred write | 1 | `generate_model` (the slow engine call runs first, the result is QC'd detached, only the final placement is recorded) | same two gates plus the generation consent fence |
| Undo marker | 1 | `undo_waypoint` | same two gates, writes no instance |
| Consent-gated Studio state, no undo entry | 7 | `select`, `camera_focus`, `play_check`, `play_check_ui`, `preview_sound`, `set_surface_default`, `run_mode` (`start`, `run`, `pause`, `resume`, `stop`, `restart`) | edit mode and consent to start; Apple-owned Run may be stopped outside edit mode |
| **Named refusal** | 1 | `run_code` | always refused: "Roblox exposes no constrained plugin evaluator", the legacy path compiled received text into a `ModuleScript` and `require`d it |

The op families (`src/ops/`, 28 handlers):

| Family | Handlers | Purpose |
|---|---|---|
| `Query` | `query_instances`, `set_props_bulk`, `spatial_query`, `scatter` | bounded search, bulk property set, spatial overlap queries, scatter placement |
| `Physics` | `collision_groups`, `collision_groups_list` | collision groups |
| `Terrain` | `terrain_shape`, `terrain_read` | cylinder, wedge, clear, smooth, heightmap, appearance; histogram read, never raw voxels |
| `Rig` | `create_rig` | Humanoid, Animator and AnimationController rigs |
| `Ui` | `ui_layout_check`, `play_check_ui` | layout validation, player-side UI check |
| `Fx` | `preview_sound` | plays one library sound to the person at the keyboard; writes nothing |
| `Content` | `preload_content` | availability probe, at most 400 ids, 20 s default, 60 s ceiling |
| `OwnerCorpus` | `import_owner_component` | cloud owner-library component import |
| `LocalOwnerCorpus` | `query_owner_local`, `query_owner_exact`, `query_owner_assembly`, `query_owner_media`, `query_owner_library`, `import_owner_local`, `import_owner_library` | owner library on the Mac (9.6) |
| `Compose` | `place_copies`, `strip_descendants` | place copies of pieces; strip descendants |
| `Surface` | `apply_surface`, `set_surface_default` | studded surfaces on parts; a watcher studs the parts any Apple write adds (Resurface by cxmeel, credited on the dock and in `THIRD_PARTY_NOTICES.md`) |
| `Joints` | `rig_model`, `set_joint_pivot`, `reset_joints` | joint rigging (allows deleting `Motor6D` and `Weld`) |
| `Upright` | none (a watcher only) | keeps inserted models upright |

Withheld on the worker side because `run_code` is refused: `run_luau` and `run_spec` (the contract test's
`WITHHELD_BY_DESIGN` list, a tripwire a human must review, not bump). The older comment says twelve tools rode on it.

Transport limits: at most 10 ops per poll, results queue 64, replay window 256 ids (acknowledged entries evicted;
before 2026-09-22 the 256th op ended the session), wait clamped to 0.05 to 10 s.

## 9.4 The allowlists

Every class and property an op writes must be on a table in `Commands.luau` (the `X = true,` lines). Anything else is
refused at runtime. The worker's composers and `packages/components/*` must stay inside them.

| Table | Entries |
|---|---:|
| `CREATE_CLASSES` (base file) | 113 |
| plus op-family classes | `Humanoid`, `UIFlexItem`, `CanvasGroup` (and `Animator`, `AnimationController`, already in the base) |
| `DELETE_ONLY_CLASSES` | 4 (`MeshPart`, `SpecialMesh`, `Camera`, `TouchTransmitter`) |
| `PROPERTY_ALLOW` (writable) | 335 |
| `READ_PROPERTIES` | 327 |
| `CONTENT_PROPERTY` (asset-id-bearing) | 26 entries |
| `ENUM_ALLOW` | 52 |
| `INSTANCE_REF_PROPERTY` | 15 |
| Services readable and writable | `Workspace`, `ReplicatedStorage`, `ServerScriptService`, `ServerStorage`, `StarterGui`, `StarterPack`, `StarterPlayer`, `ReplicatedFirst`, `Lighting`, `SoundService`, `Teams`, `TextChatService`, `MaterialService` (13; scripts only under the first 8) |

### What `create_instances` may create (113 base classes)

Parts and structure (`Folder`, `Model`, `Part`, `WedgePart`, `CornerWedgePart`, `TrussPart`, `SpawnLocation`, `Seat`,
`VehicleSeat`, `Attachment`); 20 physics classes (welds, ropes, rods, springs, hinges, prismatic, cylindrical, rigid,
universal, plane, align, `LineForce`, `VectorForce`, `Torque`, `AngularVelocity`, `LinearVelocity`); UI
(`ScreenGui`, `SurfaceGui`, `BillboardGui`, `Frame`, text and image labels and buttons, `TextBox`, `ScrollingFrame` and
the `UI*` modifiers); lights, `Highlight`, `ProximityPrompt`, `ClickDetector`; legacy audio (`Sound`, `SoundGroup`, eight
`*SoundEffect`); effects (`ParticleEmitter`, `Beam`, `Trail`, `Fire`, `Smoke`, `Sparkles`); nine `*Value` classes;
networking primitives (`RemoteEvent`, `RemoteFunction`, `UnreliableRemoteEvent`, `BindableEvent`, `BindableFunction`,
which a normal server-authoritative shop needs); lighting and post-processing (`Atmosphere`, bloom, blur, colour
correction, `ColorGradingEffect`, depth of field, sun rays, `SurfaceAppearance`); and `Decal` and `Texture` (content
property refused on ordinary writes).

### The 1.5.0 additions (16 classes, commit `ba6f8b8c`, 2026-10-04)

`AudioPlayer`, `AudioEmitter`, `AudioListener`, `AudioDeviceOutput`, `Wire`, `AudioFader`, `AudioCompressor`,
`AudioReverb`, `AudioEqualizer`, `AudioFilter`, `AudioLimiter` (the new audio-object API), `Animator`,
`AnimationController`, `Animation`, `IKControl`, and `Explosion`.

How they are made safe:

- `AudioPlayer.Asset` and `Animation.AnimationId` are `CONTENT_PROPERTY` entries scoped to their own class and accept only
  an `rbxassetid` id with digits. Nothing loads by itself.
- A `Wire` reaches its ends through `SourceInstance` and `TargetInstance`, and emitters and listeners through
  `PositionInstance`; the `IKControl` chain through `EndEffector`, `ChainRoot`, `Target`, `Pole`. All are
  `INSTANCE_REF_PROPERTY` path references, resolved under an allowlisted service and refused if missing. The skills tell
  the agent to create the player and output first and the `Wire` in a second call.
- **`Explosion` is created harmless:** `buildSpec` sets `BlastPressure = 0` and `DestroyJointRadiusPercent = 0` unless the
  op sets them (the engine default kills Humanoids, breaks joints and carves terrain). Both properties are on the
  allowlist, and `ExplosionType` on `ENUM_ALLOW`.
- New classes are restorable, so a place that holds them still gets a complete checkpoint.
- `SoundService.DefaultListenerLocation` and `AcousticSimulationEnabled` are settable through `set_props`.
- The enum allowlist covers the new audio and IK enums (`AudioFilterType`, `IKControlType`, `ExplosionType`,
  `ListenerLocation`, `DistanceAttenuationMode`, `EmitterPositionType`, `ListenerPositionType`).
- Property names were checked against creator-docs class pages (research note 07 is the source).
- Version history of this change: the brief said 1.1.0, but source was already 1.4.3, so the bump is to 1.5.0.

### What is refused

| Refused | Mechanism | Where it is decided |
|---|---|---|
| **Creating a Script, LocalScript or ModuleScript through `create_instances`** | not in `CREATE_CLASSES`; an op family that tried would fail to install | plugin. Scripts exist only via `edit_script` (create or edit) |
| **Arbitrary code** | `run_code` is in `UNSUPPORTED`; `loadstring`, `pcall(require, ...)`, `CreateAssetAsync` and remote object loaders are forbidden call shapes in every source file and in the built bytes | plugin source, `worker-capability-contract.test.mjs`, `verify-artifact.py` |
| **Script bodies carrying certain APIs** | `sourceDanger` rejects any source (case-insensitive substring) containing `loadstring`, `getfenv`, `setfenv`, `insertservice`, `assetservice`, `loadasset`, `getobjects`, `httpservice`, `requestasync`, `postasync`, `debug.`, or `require` of a number or string literal | plugin `Commands.luau:1775` |
| **Content properties** | `MeshId`, `MeshContent`, `TextureID`, `TextureContent`, `Video`, six sky faces, PBR maps, shirt and pants templates, `Graphic` are never writable. `Image`, `Texture`, `SoundId`, `Asset`, `AnimationId` are writable only on specific classes and only as `rbxassetid` + digits, or (for emitter textures) from 11 named engine particle textures | `CONTENT_PROPERTY` |
| **`MeshPart`, `UnionOperation` creation** | `MeshPart` is delete-only (and "held" by checkpoints); `UnionOperation` appears nowhere. A mesh cannot be reconstructed by assigning `MeshId` | 9.9 |
| **Hand-made UI** | **Not a plugin refusal.** The plugin allows the UI classes so library components can be built. The product rule (D-UIONLY-1) lives in the worker's `library-guard.ts`: `create_instances` refuses `GuiObject` and `LayerCollector` classes and `UIStroke`/`UICorner`/`UIGradient`; `run_luau` and `edit_script` refuse Luau that `Instance.new`s them; `set_properties` refuses look properties (image, colours, font, slicing). UI comes only from `insert_ui_component` | worker |
| **Hand-made sounds and particle effects** | **Also worker-side** (D-FXLIB-1, `FX_RULE`): `Sound`, `ParticleEmitter`, `Beam`, `Trail`, `Fire`, `Smoke`, `Sparkles` refused unless a vetted kit built them; a `SoundId` or `AudioPlayer.Asset` must be a library id or an id a search tool returned this run (a wrong id plays silence without an error) | worker `tools.ts`, `fx-library.ts` |

The 1.5.0 audio and animation classes are therefore **allowed by the plugin but not by FX_RULE's class list** (which
names legacy `Sound` and the particle classes); the worker holds `AudioPlayer.Asset` to the same id rule as `SoundId`
(`tools.ts:419`, `3135`).

## 9.5 The insert path

`insert_asset(assetId, parent?)` is the only way an arbitrary Creator Store model enters the place from the plugin. The
id must be a positive whole number up to 2^53 - 1. The path, in order:

1. `InsertService:LoadAsset(id)`. For a Creator Store model the user's account does not own, this fails with "User is not
   authorized to access Asset."
2. `AssetService:LoadAssetAsync(id)`. Needs the experience's third-party-asset setting; the plugin cannot read or set that
   RobloxScript-protected option and never touches it.
3. **`game:GetObjects("rbxassetid://" .. string.format("%d", assetId))` (the fallback, commit `a6ec8a58`, 2026-10-04,
   `research-feed` only).** `DataModel:GetObjects` has plugin security and returns the roots **detached** (`Parent` nil),
   the loader the Studio Toolbox itself uses. Measured in Studio on 2026-10-04 for one free asset by a verified
   creator: steps 1 and 2 both failed with the same "not authorized" error while `GetObjects` returned the model whole.
   The roots are collected into a detached `Model` named `AppleLoadedAsset`.
4. On the detached tree, **before anything is parented:**
   - any `LuaSourceContainer` descendant: destroy the tree and refuse by name ("Apple inserts geometry, not code",
     remedy `choose_scriptless_asset`);
   - more than 5,000 descendants: refuse (a tree built to crash Studio);
   - any instance name over 200 characters: refuse;
   - any `PackageLink`: destroy it and report `packageLinksRemoved` (a link can pull different content in on a later
     update);
   - each child must pass `destinationRefusal` for the parent, so a multi-part asset cannot leave half of itself behind;
   - name collisions are made unique.
5. Only then are the children parented, inside the op's `ChangeHistory` recording (one Ctrl+Z removes it).

If all three loaders fail the refusal remedy is `take_asset_first`. The worker adds a second gate in front
(`verifyCreatorStoreAsset` in `assets.ts`: the id must have come from a search response this run, be free and publicly
visible, carry zero scripts, and be Roblox-authored, from a verified creator, or endorsed), and scans what actually
landed (`scanInsertedHierarchy`).

### Where the build allows `GetObjects`, and how tightly

| Place | What it enforces |
|---|---|
| `Commands.luau` (the one call) | The call is `gameRef:GetObjects("rbxassetid://" .. string.format("%d", assetId))`. The id was validated as a positive whole number before it becomes a URL; the URL is never built from received text |
| `scripts/verify-artifact.py` | `ALLOWED_GETOBJECTS = b'gameRef:GetObjects("rbxassetid://" .. string.format("%d", assetId))'`. The forbidden pattern is `:\s*GetObjects\s*\(` with a negative lookahead for exactly those arguments, so every other shape fails the build. The artifact must hold **exactly 1** copy of the allowed shape; the check fails on 0 or 2. It also **requires** `LuaSourceContainer`, `packageLinksRemoved` and "Apple inserts geometry, not code" in the shipped bytes |
| `tests/worker-capability-contract.test.mjs` ("the shipped plugin refuses the pattern the removed Creator Store asset contained") | After stripping comments, `Commands.luau` must contain exactly one `ALLOWED_LOADER`; the loader helper is defined once before `handleInsertAsset` and called once; the order inside the handler must be load, then `LuaSourceContainer` scan, then the first `child.Parent = parent`; the whole-number check must precede the call. Every other file (`Bridge`, `GenerationService`, `init.server`, `Render`, `PlayCheck`, `ops/*`) must contain no `loadstring`, no `pcall(require, ...)`, no `:GetObjects(`, no `CreateAssetAsync`, no `rbxassetid://` literal. Planted-violation cases prove the scans can fire |
| `tests/render-parity.test.mjs` | `Render.luau` must contain no `HttpService`, `RequestAsync`, `loadstring`, `GetObjects`, `InsertService`, `AssetService`, `rbxassetid` or `CreateAssetAsync` |
| Worker `tools.ts:1845` (agent-written source) | The agent's own `run_luau`, `edit_script` Luau and any run check refuse `GetObjects` (`/\bGetObjects\b/`: "the exact primitive insert_asset exists to gate"). The plugin's `sourceDanger` refuses the same word case-insensitively |
| Worker prompt | "Assets enter a place through `insert_library_model` and `insert_asset` and nowhere else" |

### The Creator Store policy implication

This repository's own history is the evidence, and it should be weighed directly:

- Roblox removed two plugins from the Creator Store for **"Misusing Roblox Systems"**: the legacy asset `132128477945417`,
  and the new asset `107230158271368` (removed 2026-09-19 about seven hours after creation; restored by 2026-09-22;
  removed again 2026-09-23 and restored on appeal 2026-09-24 for the "final build"; version 4, the 1.4.0 overwrite,
  removed 2026-09-25). The reviewers' reason is never more specific than that phrase, and "neither trigger was ever
  identified" (`docs/PLUGIN-RELEASE.md`). The repo believes the legacy trigger was a `ModuleScript` built from an HTTP
  body and `require`d.
- Until 2026-09-19 the shipped plugin's guard was "no insertion loader at all"; `verify-artifact.py` once failed the build
  on `GetService("InsertService")`. That ban cost the product its headline feature (81,648 library items had no delivery
  path) and was replaced by the stronger invariant "no insertion without the script refusal".
- `GetObjects` is a third loader, and an arbitrary-URL-capable one in general. The repo's argument is that this one
  call takes only a validated integer, returns a detached tree, and is refused unless the tree is script-free. All of
  that is enforced by tests and by a byte check. But **Roblox's reviewers do not read this repository**; they see a
  plugin with remote object loading, a long-poll to a third-party host, an HTTP-driven edit consent, and (until 1.5.0 is
  published) an unknown fate for 1.4.x. `docs/PLUGIN-RELEASE.md` is explicit: "Avoiding the prohibited pattern is not the
  same as approval".
- The 1.5.0 build with the `GetObjects` fallback has **never been submitted**. If the owner publishes it and it is
  removed again, the store listing (already `false`) stays unavailable. A planner should treat "ship with GetObjects" and
  "survive moderation" as independent bets, and consider whether the fallback can be gated to an owner-library-only or
  non-store build.
- The loader works only for **free** models the account can reach, and Roblox may still block individual assets; the
  agent is told this. Roblox's Creator Store terms about distributing other creators' free models into a customer's
  experience are not analysed anywhere in the repo; note 23 (`23-asset-and-audio-sourcing`) is the place to look.

## 9.6 Security model

**Principle.** The transport may deliver untrusted JSON-shaped tables; only operations, paths, classes, properties and
values the file accepts explicitly can reach the DataModel. Reads are the default. A write needs both per-connection
consent and edit mode.

| Control | What it does |
|---|---|
| **No evaluation** | Source is never loaded, required, compiled or placed in a temporary `ModuleScript`. `ScriptEditorService` is the only write path for source. `edit_script` demands an 8-hex `baseHash` for an existing script (FNV-1a/32) so a stale edit is a `conflict`, never an overwrite |
| **Fixed harness, not received code** | `PlayCheck` ships two fixed harness scripts. They run only if `GetTestArgs()` carries this run's nonce **and** the script's own attribute carries the same nonce. They are inserted immediately before the Test session and removed immediately after, on every path, and the removal is counted (`__ApplePlayCheckHarnessV1`); a non-zero remainder fails the check |
| **Path rules** | Paths must start with `game`, use `.name` or quoted `["name"]` segments, at most 320 chars, segments at most 96, no NUL, no control characters, only the listed escapes. Only 13 services resolve; a write cannot target the DataModel itself. Duplicate-name reads return scoped references that cannot be used to write (1.4.2) |
| **Class and property allowlists** | 9.4. Typed values (`{t: "Vector3", v: [..]}`), decoded through `decodeValue`; a 48-property cap per instance, 400 nodes per create call, 120 items per op |
| **Undo as a safety net** | Every write is one recording; failure cancels it. Checkpoint `snapshot` and `restore` are bounded and identity-checked (source integrity, protected-content freshness, forced-failure rollback measured in a disposable place) |
| **Inserted models** | 9.5: detached, scanned, size and name limited, `PackageLink` stripped |
| **Generation** | `generate_model` runs only with live consent; the result is detached until structural QC passes (type, no scripts, part and descendant caps, finite positive size, the triangle cap, default 6,000 and maximum 20,000); timeout, disconnect and Run retire a request and a late result is destroyed |
| **Result and event bounds** | A result over 900,000 bytes or one that cannot be encoded is replaced after 3 failed sends by a short failure; event messages 600 chars; no token or raw error text is echoed to the dock |
| **Capability honesty** | The report is derived from the dispatch tables. A missing module reports its ops "unsupported"; the worker withholds the tools and the run ends "Rendered appearance was not verified". A check that did not run must never read as a pass |
| **Version skew is normal** | Roblox has no auto-update; admission is by wire **protocol** (currently 1), never by version; an unknown protocol is compatible; an older plugin gets an advisory notice, nothing more |

**The owner-library gateway connection.** `LocalOwnerCorpus.luau` talks to a gateway on the owner's Mac at
`127.0.0.1:63747` (loopback, default port, no key by default; `--require-key` restores a key and the dock keeps hidden
port and key fields for that). It requires a live paired connection (the same consent fence). The dock note reads
"Owner library: connected - N games - M assets" (probed at most every 30 s) or "not running on this Mac". Cloud ops carry
only ids and cursors; selected descriptions and source pages may go to the agent over HTTPS, native asset bytes stay in
Studio, and downloaded source is never executed. Policy string `owner-loopback-scriptfree-v1`: imports are script-free.
Byte caps: 4 MiB per read, 20,000 nodes; library route 64 MiB and 250,000 nodes. Responses are sanitised (filesystem
paths, keys, cache paths, `propertiesXml` stripped). **The gateway does not exist in CI or the cloud**: live pairing and
the owner library only run on the owner's Mac, which is a hard dependency for any "owner library" feature in the final
product.

## 9.7 Versions and history

`PLUGIN_VERSION` appears in `Bridge.luau`, `init.server.luau` (label and state event) and `package.json`;
`packages/evals/src/plugin-version.test.mjs` fails if they disagree, and requires `LATEST_PLUGIN_VERSION` never to be
ahead of the source. `verify-artifact.py` confirms the built bytes carry the declared string.

| Version | Date | What changed (from the comments in `Bridge.luau` and git) |
|---|---|---|
| 1.0.0 | 2026-09-19 | First `apps/apple-plugin` build, 5 scripts, no `StudioCapture`. Published as asset `107230158271368` "Apple Studio", creator Shahar474; removed by moderation the same day. The version is inferred, not read from the published bytes |
| 1.1.0 | about 2026-09-22 | Native viewport capture, Run-mode control (and the ability to stop the playtest it starts), model inspection. The source says 1.1.0 so it cannot be confused with the store build |
| 1.2.0 | 2026-09-23 | An uploaded image id is writable on UI images and decals; a checkpoint holds its `MeshPart`s (F-053); the dock says a Studio restart needs a new code (F-026) |
| 1.3.0 | 2026-09-23 | D-FXLIB-1: a `Sound` may carry a library audio id, an effect may name an engine particle texture, flipbook and Squash properties, `preview_sound` |
| 1.4.0 | 2026-09-25 | F-059: the dock can ask and answer which asset sources this project may use. The 1.4.0 overwrite was accepted in Studio, then the public page went 404 |
| 1.4.1 | 2026-09-25 | The dock asks once for free Roblox asset consent, without a source selector |
| 1.4.2 | 2026-09-26 | Duplicate-name read references retain object identity without write authority |
| 1.4.3 | 2026-09-26 | Model transforms keep offset and nested pivots aligned with geometry |
| (no bump) | 2026-09-29 | A result Studio cannot send no longer stalls the session (900 KB, 3 retries) |
| **1.5.0** | **2026-10-04** | Audio objects, Animator, AnimationController, Animation, IKControl, safe Explosion in `create_instances`. The `GetObjects` insert fallback landed in the same working tree the same day without a version bump (`a6ec8a58`) |

Not in git as a version: op families (13 in `src/ops/`, introduced 2026-09-23 as D-VISION-1), the camera and Focus fix
(2026-10-02), duplicate-name write references (2026-10-02), studs on every part and rig-and-animate (2026-10-01).

**Publish status.**

| Fact | Value | Source |
|---|---|---|
| Asset | `107230158271368`, "Apple Studio", AssetTypeId 38, creator Shahar474 (5541122967) | `STUDIO_PLUGIN_ASSET_ID` |
| `STUDIO_PLUGIN_STORE_LIVE` | **false** (flipped true 2026-09-22, back to false 2026-09-23, true 2026-09-24 after an upheld appeal, back to false 2026-09-25) | `packages/shared/src/index.ts:2079` |
| `STUDIO_PLUGIN_STORE_REFUSAL` | `null` (the 2026-09-25 404 does not establish a new decision) | same file |
| `STUDIO_PLUGIN_INSTALL_HREF` | `/docs/plugin` while the flag is false | same file |
| `LATEST_PLUGIN_VERSION` | `'1.0.0'`, "bump it at the moment the human republishes" | `apps/worker/src/plugin-version.ts:86` |
| What customers could install if the page were live | 1.0.0 (inferred); it predates native capture, `run_mode`, `inspect_model` and `play_check` and very likely refuses them | `docs/PLUGIN-RELEASE.md` |
| Newest build anyone could run | 1.5.0, locally built and installed on the owner's Mac under `~/Documents/Roblox/Plugins` | `docs/autonomy/NEXT_ACTION.md`, `CURRENT_STATE.md` |
| Public plugin release | on hold (owner consent record, 2026-09-29: "Stripe (L01) and public plugin release (L02) stay held") | `docs/autonomy/NEXT_ACTION.md` |
| Open owner item | Q-020: the moderation case is the blocker; no appeal sent for the Sep 25 removal | `docs/autonomy/OWNER_QUEUE.md` |

`docs/PLUGIN-RELEASE.md` section 0 still says the flag is `true` (it was written 2026-09-22 and not revised); the code
wins.

## 9.8 The plugin test harness

`apps/apple-plugin/tests`; the package `test` script is `node --test tests/*.test.mjs`. 24 files, **79 node:test cases**
(76 top-level plus 3 nested). Most embed the real Luau source byte-for-byte into one standalone chunk beside a
Roblox-shaped mock (`tests/studio-mock.mjs`) and run it with the `luau` CLI, about 171 `spec()` calls in all. The mock
provides **no source loader**: `require` is a hard error, so if the engine ever evaluates generated source every suite
built on it turns red.

| Group | What it holds |
|---|---|
| `commands.test.mjs` | 76 `spec()` calls for the engine (create, refusals, reads, undo, snapshot, the `GetObjects` chain at lines 330-402); a "mutation-consent guard is live" test that **inverts the consent check and swaps the gate order** and requires the suite to fail; a source assertion that every dispatcher branch binds the handler remedy |
| op families and adapters | `ops-phase-a` 31, `duplicate-names` 15, `play-check` 13, `content-preload` 11, `ops-families` 8, `generation-service` 8, `studio-capture` 7, `ops-fx` 4 specs |
| `protocol-coverage` | every `StudioOp` has a handler, named refusal, deferred path, restore or waypoint |
| `worker-capability-contract` | runs the real `Commands.capabilities` through the worker's real `parsePluginCapabilities` and tool registry (esbuild-bundled). Asserts the report parses (a malformed report drops the worker into compatibility mode, which offers every tool), covers every live op, and withholds exactly `run_luau` and `run_spec`; also holds the `GetObjects` and forbidden-call checks |
| `render-parity` | runs the legacy plugin's own render and rasteriser specs unmodified against `Render.luau`, and mutates the framing distance to prove it can go red |
| the rest | allowlists, studs, owner ops, transport, entry point, the `-O0` compile, and `*-engine-proof` builds of disposable `.rbxl` places for a human to run in real Studio (a local build is not an observed pass; a frozen r4 restore proof passed 7/7 in one real run) |

Caveats: tests prove behaviour under a mock, not live permissions, undo or store eligibility. Every Luau-driven test is
`skip: luau is not on PATH`, so a machine without the `luau` CLI reports green with most of the suite not run (CI
installs Luau and Rojo in the job); the capability-contract test also skips without the worker's `esbuild`. The plugin
count has drifted: 41 (2026-09-22), 71, 77 (2026-09-29), 79 now. The legacy plugin keeps 250 Luau specs (56 of 56
mutations caught) and about 16 other tests still read its source.

## 9.9 Limits that matter for building games

| Limit | Value and cause | Effect on a game |
|---|---|---|
| **No `UnionOperation`, no `MeshPart` creation** | There is no `UnionOperation` entry anywhere. `MeshPart` is **delete-only**: assigning `MeshId` or `MeshContent` cannot reconstruct a mesh and content properties are never written. A `MeshPart` can enter only by `insert_asset` (a Creator Store model), the owner-library imports, `generate_model` (text to 3D), or a checkpoint's held copy | Custom meshes and CSG are impossible from primitives. Detailed props must come from a library or Creator Store model or a generated mesh; otherwise they are made of `Part`, `WedgePart`, `CornerWedgePart` and `TrussPart` with sphere/cylinder/block shapes. On the owner-library path, old file-mesh parts are converted to true-size MeshParts on copy (218463ab, per `NEXT_ACTION.md`; not verified in this tree) |
| **Terrain: 65,536 voxels per call** | `MAX_TERRAIN_VOXELS = 65536`, resolution 4 studs, so a call spans at most 65,536 cells, about 160 x 160 x 160 studs. The cap is applied after worst-case grid expansion of two extra cells per axis. `write_voxels` takes 1 to 64 cells per axis, material and 0 to 1 occupancy per cell, and must align to the 4-stud grid. `fill_ball` radius at most 4,096. `terrain_shape` has the same ceiling | A large landform is many calls (a clear request once took 29 calls with 16 refused; `action: "clear"` now clears everything in one engine call). Resolution cannot go finer than 4 studs |
| **Edit mode only** | Writes refuse unless `RunService:IsEdit()` is true, `IsRunning()` is false, and `StudioTestService.EditModeActive` is true. `RunService:Run()` leaves `IsEdit()` true, which once let two writes through during Apple's own playtest, so a running simulation is explicitly not edit mode | A write during a user-started playtest is refused with remedy `leave_test_mode`. Runtime state is only inspected by `play_check` (a real solo Test session, which runs on a copy of the place) and `run_mode`; nothing the agent changes in a live Test persists |
| **Read-stall behaviour** | The poll loop is single-threaded per session. Until 2026-09-29, a result Studio could not send (over the `HttpService` body limit, or not encodable) was retried forever: after a 76,000-part import the session sat on "Connection hiccup" and every later op waited behind it. Now, after 3 failed sends, a result over **900,000 bytes** or unencodable is replaced by a short failure telling the agent to treat the effect as unknown and read again. Failed polls warn their reason in Output | A whole-place read of a big game returns a failure rather than hanging; the agent must narrow its read. Reads are bounded: `get_tree` at most 1,200 nodes and depth 12; `dump_scripts` 1,000,000 chars; script source 240,000; `project_census` counts up to 200,000 instances (it was 4,800 before 2026-09-29) |
| **Checkpoint size** | A whole-place `snapshot` is **restorable** only when it fits 800 nodes, depth 12, 600,000 script chars and 400 children per node; otherwise it is truncated, reported incomplete and not restorable. Classes outside the restorable set (and any `MeshPart` without a held copy) also make it incomplete. Held MeshPart copies last for the newest 8 checkpoints and are lost on plugin reload | Large inherited places cannot be rolled back through Apple's checkpoint, and a protective checkpoint before a playtest may be refused (it was, repeatedly, for `TouchTransmitter`s and `SpecialMesh`es until those were special-cased) |
| **Per-call caps** | 400 nodes per `create_instances`, 120 items per op, 48 properties and attributes per instance, 2,000 affected parts per transform, scale 0.001 to 1,000, rotation 36,000 degrees, translation 1,000,000, at most 5,000 instances in an inserted asset | The agent builds in many calls; "prefer one create_instances call with a full nested Model" is in the prompt |
| **Agent-written game scripts cannot use `HttpService`, `InsertService`, `AssetService`, `LoadAsset`, `GetObjects`, `loadstring`, `getfenv`, `setfenv`, `debug.`** | `sourceDanger`: case-insensitive substring match on the whole source | This blocks every use of `HttpService` including `JSONEncode`, `JSONDecode` and `GenerateGUID` (common in DataStore serialisation and unique ids), and any runtime `InsertService` use. It is a coarse refusal list by design ("not a claim that arbitrary Luau is statically safe"). A game that needs these needs the user to write them, or the refusal to be narrowed |
| **No script creation outside `edit_script`; no remote modules** | `require(<number or string>)` rejected; local module paths are fine | The agent writes its own modules; it cannot pull a library by id. Prefabs come through `install_module` (reviewed source) |
| **Visual feedback is coarse** | Native capture at most 320 x 240 (240 KiB PNG) and only if screenshot permission is granted; the software rasteriser is "deliberately small and low-fidelity", enough for composition, massing, proportion and colour blocking | The in-run critic can judge layout and silhouette, not texture or lighting polish |
| **Generation** | `GenerateModelAsync` only: text prompt, `MaxTriangles` (default 6,000, cap 20,000), texture on, schemas `Body1` and `Car5`. Image conditioning, `Size`, custom schemas and provider options are refused. 90 s timeout. No triangle count is readable from the engine, so the result says whether triangles were measured | Text-to-3D props are possible but unconstrained in size and unverified for style |
| **Owner library is Mac-only** | 9.6 | Anything built on the owner's game library works only while his gateway runs |

---

## Open questions this section raises for the planners

1. **Is the Creator Store the final distribution channel?** The flag is false, the cause is an unexplained moderation
   decision (Q-020), no appeal had been sent for the Sep 25 removal as of Q-020, and public release is on the owner's hold list. If
   customers cannot install the plugin, the product has no customers. Options: appeal and republish; distribute as a
   downloadable `.rbxm` with manual install (the build already produces `apple-studio.rbxm`); wait for a Roblox-sanctioned
   channel (research note 09 and 11 cover the Studio MCP server and Assistant, which may be the intended path for
   external agents).
2. **Does the final product keep the `GetObjects` fallback?** It unlocks free Creator Store models the product
   otherwise cannot insert, but it is the riskiest line in a plugin that has been removed for "Misusing Roblox Systems".
   Should it ship only in a locally installed owner build, behind a build flag, or not at all?
3. **Should the research notes get a deletion/update path?** `research-upload.mjs` never prunes and ids are
   content-addressed, so every edited note leaves orphans. Someone should diff live D1 against `researchChunks()`
   (a `corpus-manifest` read against the local ids), then either add `--prune-research` that deletes `research-*` ids
   not in the local set or make ids stable per `(note, chunk index)`.
4. **Who owns rebuilding the docs half?** Without `chunks.jsonl` and `raw/`, the api/guide index (about 8,300 rows, last
   built before 2026-09-23) cannot be refreshed, pruned or re-witnessed on this Mac. Roblox's docs change weekly. Is a
   quarterly rebuild acceptable, or does the final product need a CI-run refresh?
5. **Should retrieval be checked against what the agent needs?** The only retrieval measurement in the repo is the
   verified-module benchmark (49/80 to 73/80). No recall number exists for `search_docs` over the research notes, and the
   agent shows only 900 characters per hit. Would a held-out question set (generic, never seen by authors) be built before
   more notes are added?
6. **Is the dossier's push-versus-pull conclusion right for the final model?** Zero lookups in 90 calls led to
   harness pushes capped at 8 skills and 14,000 characters per run. If the model decision is reopened (section 15), a
   bigger model may search better and need less pushing; a smaller one needs more structure. The knowledge system and the
   model choice should be decided together.
7. **Source 3 rights.** Is "original synthesis with `[S#]` citations" enough for notes built on DevForum threads, press,
   and analytics-site numbers? PROVENANCE records the policy but no review of DevForum or analytics-site terms. A short
   legal read before the notes ship to customers in any visible form (the UI surfaces chunk sources as links).
8. **Fix the witness before the next docs rebuild.** Either add research and skill chunks to `chunk.mjs` output, remove the
   five `research-*` documents from the witness (and the creator-skill references that cite them), or teach
   `deriveWitness` that those slugs come from `researchChunks()`.
9. **Narrow `sourceDanger`?** The substring ban on `httpservice` removes `JSONEncode` and `GenerateGUID` from every
   agent-written script. Is that deliberate product policy (a crude defence against exfiltration from a customer game),
   or an unexamined side effect to fix before game quality is judged?
10. **Meshes, CSG and terrain.** "No `UnionOperation`, no `MeshPart` from primitives" and 4-stud, 65,536-voxel terrain
    calls make hand-built worlds blocky and call-hungry. Is the answer more library and generation, a terrain tiling
    coordinator in the worker, or a Roblox-permitted route to unions the team has not tried?
11. **Edit-mode-only writes against a "play it and fix it" loop.** Every fix after a playtest needs the person to leave
    Test. Is that the intended UX, or should the product drive a stop-then-write sequence itself (`appleRun` tracking
    already lets Apple stop the Run it started)?
12. **Docs that contradict code.** `README.md` (plugin) safety contract, `init.server.luau` header, `AGENTS.md` ("6 Luau
    files"), `docs/PLUGIN-RELEASE.md` section 0 (flag "true"), and `PROVENANCE.md` ("nothing committed") are stale in the
    ways listed above. Reviewers and Roblox moderators read prose; who corrects it and when?
13. **Plugin 1.5.0 and the worker are out of step in production.** The deployed worker is `research-feed` (dirty). The
    main checkout still builds 1.4.3 and has no `GetObjects`. Which branch becomes the product, and does the final
    release pipeline require the plugin and worker to be released from the same commit?
