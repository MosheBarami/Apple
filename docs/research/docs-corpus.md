# License-Compatible Roblox/Luau Knowledge Sources for RAG & Training Data

Research date: 2026-08-30. All repo stats, licenses, and endpoints below were verified live on this date (GitHub API, Roblox CDN, Hugging Face Hub API). Anything not directly verified is marked UNVERIFIED.

---

## 1. Roblox/creator-docs (the primary corpus)

**Repo:** https://github.com/Roblox/creator-docs — "Open Source Creator Documentation"

### License (verified)
- **Dual-licensed.** Per the repo README and LICENSE:
  - **Prose (all documentation text): CC-BY-4.0** (Creative Commons Attribution 4.0 International). GitHub's license detector reports SPDX `CC-BY-4.0` for the repo.
  - **Code samples: MIT.**
- CC-BY-4.0 obligations: retain creator identification, copyright notice, license notice, link to source where practicable, and indicate modifications. Attribution may be satisfied "in any reasonable manner based on the medium" — a NOTICE file + per-chunk `source_url` metadata in Golem's RAG store satisfies this cleanly.

### Repo stats (verified 2026-08-30 via GitHub API)
- Size: **29,584 KB (~29.6 MB)**, default branch `main`, 819 stars, 4,048 forks, last pushed **2026-08-29** (actively maintained, near-daily updates).
- Full git tree: **10,007 entries** (not truncated).

### Structure & file counts (verified via git trees API)
- `content/en-us/` is the only content locale in-repo. Breakdown:
  - **1,010 Markdown guide/tutorial files** (`content/en-us/**/*.md`)
  - **1,217 YAML API-reference files** under `content/en-us/reference/engine/`:
    - `classes/` — **638 files** (e.g. `content/en-us/reference/engine/classes/Accessory.yaml`)
    - `enums/` — **518 files**
    - `datatypes/` — **48 files** (Vector3, CFrame, etc.)
    - `libraries/` — **11 files** (math, string, table, task, ...)
    - `globals/` — **2 files**
  - `assets/` — **7,464 files** (images/videos; exclude from corpus)
  - Major md sections: `tutorials/` (168), `production/` (129), `education/` (184), `art/` (89), `cloud/` (38), `physics/` (30), `ui/` (29), `studio/` (25), `scripting/` (24), `projects/` (27), `resources/` (55), `avatar/` (44)
- **Engine API reference format: YAML** (structured: class name, superclass, tags, per-member descriptions, parameters, return types, code samples). The repo notes reference YAML files are read-only mirrors (no PRs accepted on them) — they are generated from Roblox's internal source, which means they are kept in sync with the engine.

### Verdict
This is the single best license-clean source: ~1,000 prose docs + a complete structured API reference, CC-BY-4.0/MIT, ~30 MB, updated continuously. Clone shallow (`git clone --depth 1`) and re-pull weekly.

---

## 2. Roblox API Dump (Full-API-Dump.json)

### Availability (verified live)
Two-step fetch, no auth required:
1. `GET https://clientsettingscdn.roblox.com/v2/client-version/WindowsStudio64` → returned `version: "0.736.0.7361346"`, `clientVersionUpload: "version-268c7d941ba34c1a"` (2026-08-30).
2. `GET https://setup.rbxcdn.com/{clientVersionUpload}-Full-API-Dump.json` → **HTTP 200/206, verified**. (`setup.roblox.com` resolves to the same content; from some networks only the `setup.rbxcdn.com` CDN host is reachable — prefer it.)

### Contents (verified by downloading)
- **8,194,537 bytes (~8.2 MB)** for the current Studio version.
- Top-level keys: `Classes`, `Enums`, `Version` (schema version 1).
- **914 classes**, **8,361 total members** (properties/methods/events/callbacks with types, security levels, tags like `Deprecated`/`NotScriptable`), **623 enums**.
- Class objects carry `Members`, `MemoryCategory`, `Name`, `Superclass`, `Tags`.
- A smaller `-API-Dump.json` (no defaults/descriptions) exists at the same path pattern.

### Terms
- **UNVERIFIED:** Roblox publishes no explicit license for the API dump. It is factual API metadata served publicly from Roblox's own CDN and is universally used by community tooling (Rojo, roblox-ts, StyLua). Treat as "publicly provided factual data, Roblox ToU applies"; do not claim a license. Safer path: the **same API information exists as CC-BY-4.0 YAML in creator-docs** — use the dump for machine validation/type data and the YAML for redistributable prose.
- Mirror: `MaximumADHD/Roblox-Client-Tracker` (verified: 535 stars, updated 2026-08-30, raw `Full-API-Dump.json` returns HTTP 200) — but the repo has **no license (SPDX null)**, so fetch from the Roblox CDN directly rather than redistributing the mirror.

---

## 3. Luau language sources

| Source | License (verified) | Notes |
|---|---|---|
| https://github.com/luau-lang/luau | **MIT** (SPDX verified) | 5,819 stars, 26,848 KB, pushed 2026-08-28. Language impl + `docs`-adjacent RFCs, conformance tests (great few-shot material for pure-Luau syntax). |
| https://github.com/luau-lang/site (source of luau.org / luau-lang.org) | **MIT** (SPDX verified) | "Official website and documentation for the Luau programming language", pushed 2026-08-19. Contains the Syntax tour, Type system docs, typecheck/compatibility pages as Markdown. |
| https://luau.org (verified live) | site content = MIT via repo | Sections: Getting Started, `/syntax/`, `/types/` (refinements, type functions), Compatibility. Clone the `site` repo instead of scraping. |

---

## 4. Permissive open-source Roblox frameworks/libraries (top 10+, licenses verified via GitHub API 2026-08-30)

| # | Repo | License | Stars | Status | Why include |
|---|---|---|---|---|---|
| 1 | `dphfox/Fusion` | **MIT** | 793 | active (pushed 2026-02) | Modern reactive UI; excellent docs site in-repo |
| 2 | `Sleitnick/Knit` | **MIT** | 630 | **archived** 2024 | Still the most-copied game framework pattern (Services/Controllers) |
| 3 | `Sleitnick/RbxUtil` | **MIT** | 457 | active (2026-08-11) | ~25 utility modules (Signal, Comm, Trove, Component) — idiomatic modern Luau |
| 4 | `Quenty/NevermoreEngine` | **MIT** | 606 | very active (2026-08-29) | Huge monorepo of battle-tested modules |
| 5 | `MadStudioRoblox/ProfileService` | **Apache-2.0** | 326 | maintained | De-facto standard DataStore session-locking |
| 6 | `MadStudioRoblox/ProfileStore` | **Apache-2.0** | 328 | active (2025-07) | Successor to ProfileService |
| 7 | `evaera/roblox-lua-promise` | **MIT** | 353 | maintained | The standard Promise impl; great API docs |
| 8 | `jsdotlua/react-lua` | **MIT** | 567 | active | Maintained community React translation (Roact successor) |
| 9 | `osyrisrblx/t` | **MIT** | 331 | maintained | Runtime type checker; small, idiomatic |
| 10 | `SirMallard/Iris` | **MIT** | 347 | active (2026-08-12) | Immediate-mode debug GUI |
| 11 | `howmanysmall/Janitor` | **MIT** | 148 | active | Cleanup pattern used everywhere |
| 12 | `matter-ecs/matter` | **MIT** | 114 | low activity | ECS pattern reference |
| 13 | `Roblox/roact` | **Apache-2.0** | 625 | **archived** 2023 | Historical; prefer react-lua for current patterns |
| 14 | `Roblox/testez` | **Apache-2.0** | 209 | **archived** 2024 | BDD test patterns (Jest-Lua is the successor) |

Copyleft-adjacent (fine to read/retrieve with attribution, keep out of any training set if you want zero MPL questions): `rojo-rbx/rojo` (**MPL-2.0**, 1,715 stars), `JohnnyMorganz/StyLua` (**MPL-2.0**, 2,286 stars), `Kampfkarren/selene` (**MPL-2.0**, 812 stars). MPL-2.0 is file-level copyleft — retrieval/RAG with attribution is fine; their *docs folders* are part of the same license.

---

## 5. Hugging Face datasets (verified via HF Hub API 2026-08-30)

| Dataset | License | Size/format | Quality assessment |
|---|---|---|---|
| **Roblox/luau_corpus** (official) | **MIT** (full MIT text in card) | `train.jsonl` **41.2 MB** + `test.jsonl` **7.3 MB**; prompt/completion JSONL; 10K–100K rows | Best-in-class provenance: code from the opt-in "Roblox Luau Data Sharing program". Created Nov 2023, not updated since. Roblox reports 10–20% Lua quality gains when fine-tuning generalist code LLMs on it. |
| **TorpedoSoftware/the-luau-stack** | MIT-tagged, **gated** (ToU click-through); underlying files retain original permissive licenses, provenance per row | 10K–100K rows, parquet, StyLua-formatted GitHub code | High quality, curated + deduplicated; must honor per-row original licenses and keep copies updated for takedowns. Updated Oct 2025. |
| **TorpedoSoftware/roblox-info-dump** | MIT-tagged, **gated**; card states "Roblox maintains the copyright on all content" (it is scraped create.roblox.com/docs + luau.org) | 10K–100K rows | Convenient but redundant — build from creator-docs directly for cleaner CC-BY-4.0 attribution. |
| **TorpedoSoftware/Roblox-Luau-Reasoning-v1.0** | **MIT** | 10K–100K rows, parquet; prompt → CoT + code + explanation | Synthetic reasoning data derived from luau_corpus; good SFT material. |
| **TorpedoSoftware/LuauLeetcode** | **Apache-2.0** | 1K–10K rows, parquet | LeetCode problems AST-translated to Luau + Jest-Lua tests — usable as an eval/RL harness. |
| **TorpedoSoftware/RobloxQA-v1.0** | **MIT** | 1K–10K rows | MCQ eval built from Roblox docs — use as Golem's regression eval, not training. |
| 8BitStudio/Roblox-luau-coding_L1 | Apache-2.0 | 10K–100K JSON, instruction-tuning | Community synthetic; spot-check before use (UNVERIFIED quality). |
| khtsly/luau-stack-hq | license:**other** | 10K–100K parquet | Curated GitHub Luau incl. roblox-ts; license "other" → treat cautiously. |
| kefir090/luau_github | license:**other** ("individual files retain original licenses") | 100K–1M rows | Bulk GitHub scrape, no per-row license filtering guarantees → avoid for training. |
| Pinkstack/roblox-luau-corpus-text | MIT | luau_corpus reflow to single `text` column | Derivative convenience format. |

Proof these work in practice: TorpedoSoftware's Luau-Devstral-24B v0.1/v0.2, R1-Distill-Qwen-14B-Roblox-Luau, and Gemma-3-27B-Roblox-Luau were all fine-tuned on the-luau-stack + roblox-info-dump (+ LuauLeetcode for GRPO).

---

## 6. Recommended corpus build plan for Golem

### What to clone/fetch (all commands verified patterns)
```bash
# 1. Docs + API reference (CC-BY-4.0 / MIT) — ~30 MB shallow
git clone --depth 1 https://github.com/Roblox/creator-docs

# 2. Luau language docs (MIT)
git clone --depth 1 https://github.com/luau-lang/site
git clone --depth 1 https://github.com/luau-lang/luau   # RFCs + tests only

# 3. Live API dump (~8.2 MB, refresh weekly with the version GUID)
GUID=$(curl -s https://clientsettingscdn.roblox.com/v2/client-version/WindowsStudio64 | jq -r .clientVersionUpload)
curl -sO https://setup.rbxcdn.com/${GUID}-Full-API-Dump.json

# 4. Framework sources (MIT/Apache only for training; +MPL for RAG)
for r in dphfox/Fusion Sleitnick/RbxUtil Sleitnick/Knit evaera/roblox-lua-promise \
         MadStudioRoblox/ProfileStore osyrisrblx/t SirMallard/Iris howmanysmall/Janitor \
         jsdotlua/react-lua Quenty/NevermoreEngine; do
  git clone --depth 1 https://github.com/$r; done

# 5. Fine-tune data (if ever training): HF Roblox/luau_corpus (MIT, ungated, 48.5 MB)
```

### What to extract
- **From creator-docs:** all 1,010 `content/en-us/**/*.md` (strip frontmatter, drop `assets/` refs) + all 1,217 `reference/engine/**/*.yaml`. Skip `includes/` partials or inline-resolve them.
- **From the API dump:** per-class type/signature/tag table (security levels, deprecation, defaults) — merge into the YAML-derived class chunks as a machine-authoritative "signature block", and use it at generation time to *validate* Golem's emitted property/method names.
- **From frameworks:** README + `docs/` folders as guide chunks; source files as code-example chunks (tag with repo + license + commit SHA).

### Chunking strategy
**API reference (YAML → structured chunks):**
- One **class-summary chunk** per class: name, superclass chain (from dump), tags, 1-paragraph description, member index. ~200–400 tokens.
- One chunk **per member** (property/method/event) for the 8,361 members: qualified title `Instance:FindFirstChild()` + description + parameters/returns + inline code sample. ~100–300 tokens. Qualified names in the chunk header make BM25/embedding retrieval precise.
- Enums: one chunk per enum (all items in one chunk; 518 chunks).
- Store metadata: `{type: class|member|enum|datatype, class, member, security, deprecated, license: CC-BY-4.0, source_url}` → enables filtering deprecated APIs out of prompts.

**Guides/tutorials (Markdown → semantic chunks):**
- Split on H2/H3 headings, target 500–1,000 tokens, never split fenced code blocks; prepend a breadcrumb header (`Scripting > Events > Deferred events`) to every chunk for context.
- Extract fenced Luau blocks additionally as standalone code chunks tagged `license: MIT` (creator-docs code-sample license).

**Scale estimate:** ~640 class chunks + ~8.4K member chunks + ~520 enum chunks + ~3–5K guide chunks + ~2–4K framework chunks ≈ **15K–20K chunks**, comfortably inside Cloudflare Vectorize free/paid tiers at 768–1024-dim embeddings.

### License hygiene (do this once)
1. Ship a `NOTICES.md` in Golem listing: creator-docs (CC-BY-4.0 prose / MIT samples, © Roblox), luau-lang (MIT), each framework repo + license.
2. Keep `source_url` + `license` per chunk; surface "Sources" links in the Golem UI when doc chunks ground an answer (satisfies CC-BY attribution elegantly and builds trust).
3. Exclude: Roblox-Client-Tracker redistribution (no license), `license:other` HF scrapes, MPL repos from any *training* set.
4. The API dump has no explicit license (UNVERIFIED) — use it server-side for validation/grounding, don't redistribute it verbatim as a product artifact.

---

## Sources

- https://github.com/Roblox/creator-docs (README license statements, structure)
- https://api.github.com/repos/Roblox/creator-docs (size 29,584 KB, SPDX CC-BY-4.0, pushed 2026-08-29)
- https://api.github.com/repos/Roblox/creator-docs/git/trees/main?recursive=1 (10,007 entries; 1,010 md; 1,217 YAML: 638 classes/518 enums/48 datatypes/11 libraries/2 globals)
- https://raw.githubusercontent.com/Roblox/creator-docs/main/LICENSE (CC-BY-4.0 text)
- https://clientsettingscdn.roblox.com/v2/client-version/WindowsStudio64 (Studio 0.736.0.7361346, version-268c7d941ba34c1a)
- https://setup.rbxcdn.com/version-268c7d941ba34c1a-Full-API-Dump.json (8,194,537 bytes; 914 classes, 8,361 members, 623 enums — verified by download)
- https://api.github.com/repos/MaximumADHD/Roblox-Client-Tracker (SPDX null, pushed 2026-08-30)
- https://api.github.com/repos/luau-lang/luau (MIT, 5,819 stars, pushed 2026-08-28)
- https://api.github.com/repos/luau-lang/site (MIT, pushed 2026-08-19)
- https://luau.org/ (docs sections: /syntax/, /types/, compatibility)
- GitHub API repo lookups for: Roblox/roact, jsdotlua/react-lua, dphfox/Fusion, Sleitnick/Knit, MadStudioRoblox/ProfileService, MadStudioRoblox/ProfileStore, evaera/roblox-lua-promise, rojo-rbx/rojo, Quenty/NevermoreEngine, osyrisrblx/t, Sleitnick/RbxUtil, matter-ecs/matter, SirMallard/Iris, howmanysmall/Janitor, Roblox/testez, Kampfkarren/selene, JohnnyMorganz/StyLua (licenses/stars/archived status, 2026-08-30)
- https://huggingface.co/datasets/Roblox/luau_corpus (MIT card; train.jsonl 41,173,429 B, test.jsonl 7,336,301 B)
- https://huggingface.co/datasets/TorpedoSoftware/the-luau-stack (gated ToU, README)
- https://huggingface.co/datasets/TorpedoSoftware/roblox-info-dump (gated ToU, README)
- https://huggingface.co/datasets/TorpedoSoftware/Roblox-Luau-Reasoning-v1.0, /LuauLeetcode, /RobloxQA-v1.0 (HF search metadata)
- HF Hub search results for "luau" and "roblox" datasets/models (licenses, sizes, dates)
