# Corpus Provenance

Golem's RAG corpus is built exclusively from license-compatible public sources.
`src/fetch.mjs` records the exact commit SHA of every source in `raw/manifest.json`
on each fetch; `data/chunks.jsonl` carries a `url` per chunk that links back to the
canonical published page, satisfying attribution requirements at retrieval time
(chunk sources are surfaced as links in the Golem UI).

Initial fetch date: **2026-08-30**. Re-fetch by running `pnpm fetch` (shallow
update; the SHA in `raw/manifest.json` is refreshed).

## Source 1 — Roblox/creator-docs

| | |
|---|---|
| Repo | https://github.com/Roblox/creator-docs |
| License | **Dual-licensed**: prose (all documentation text) **CC-BY-4.0**; code samples **MIT**. Verified via repo `LICENSE` + README and GitHub SPDX detection (`CC-BY-4.0`), 2026-08-30. |
| Copyright | © Roblox Corporation |
| Fetched | 2026-08-30 (shallow, blobless, sparse clone — `content/en-us/assets/` media excluded, Git LFS smudge disabled; commit SHA in `raw/manifest.json`) |

**What we extract**

- `content/en-us/reference/engine/**/*.yaml` — the structured engine API
  reference (classes, enums, datatypes, libraries, globals). Converted to
  compact per-class chunks: class summary plus member signatures with one-line
  descriptions (e.g. `Method Humanoid:MoveTo(location: Vector3, part: Instance?)`).
  Large classes are split into multiple chunks by member group. `kind='api'`,
  `url=https://create.roblox.com/docs/reference/engine/...`. All embedded.
- `content/en-us/**/*.md` guides/tutorials (excluding `reference/`, `assets/`,
  `includes/`) — substantive pages only, split by `##` headings into 600–1200
  char chunks, frontmatter/MDX components stripped, code blocks kept.
  `kind='guide'`, `url=https://create.roblox.com/docs/<path>`. Scripting, Luau,
  UI, mechanics and tutorial guides are embedded (subject to the global
  12,000-chunk embedding cap, API chunks first); the rest are FTS-only.

**CC-BY-4.0 compliance:** creator identification (© Roblox), license notice
(this file), per-chunk `url` back to the source page, and modification notice:
chunks are mechanical extractions/reformattings (heading splits, signature
compaction, MDX stripping) of the original text, not rewrites.

## Source 2 — luau-lang/site (luau.org docs)

| | |
|---|---|
| Repo | https://github.com/luau-lang/site |
| License | **MIT** (SPDX-verified on GitHub; `src/fetch.mjs` additionally verifies a LICENSE file exists in the checkout and records the result in `raw/manifest.json`) |
| Copyright | © Luau language contributors |
| Fetched | 2026-08-30 (shallow clone; commit SHA in `raw/manifest.json`) |

**What we extract:** the site's Markdown documentation pages (Luau syntax tour,
type system, compatibility, library docs), chunked the same way as guides.
`kind='guide'`, `url=https://luau.org/<page>`. Embedded with top priority after
API chunks.

**License gate:** if `src/fetch.mjs` cannot verify a recognizable MIT/CC-BY
license file in the checkout, `src/chunk.mjs` **skips the source entirely** and
prints a note — nothing with an unverified license enters the corpus.

## Explicitly excluded

- `content/en-us/assets/` media (not needed; huge LFS payload).
- Roblox `Full-API-Dump.json` and mirrors — no explicit license; the same API
  facts exist as CC-BY-4.0 YAML in creator-docs, which we use instead.
- MPL-2.0 repos (rojo, StyLua, selene) and `license: other` HF scrapes.

## Storage

Chunks are uploaded to the Golem worker (`/api/admin/embed-batch`): text into
D1 (`chunks` + `chunks_fts` FTS5) for keyword search, and Workers AI embeddings
into Vectorize for the `embed=true` subset. `raw/` and `data/` are gitignored;
nothing from the corpus is committed to this repository.
