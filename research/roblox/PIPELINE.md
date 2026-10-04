# How knowledge reaches Apple's agent (mapped 2026-10-04 on the renamed tree, `/Users/moshe/Developer/RbxAI-rename`)

| Channel | Storage | Search | How to add | Constraints |
|---|---|---|---|---|
| `search_docs` (tools.ts ~5461 → rag.ts) | D1 `golem-corpus` (`chunks`, `chunks_fts`) + Vectorize `golem-docs` | hybrid: bge-small vectors top 8 + FTS5 bm25 top 8, RRF, k=5, 900-char excerpts | `packages/corpus`: `chunk.mjs` builder → `chunks.jsonl` → `upload.mjs` (`API_BASE`, `ADMIN_KEY`; `/api/admin/embed-batch`, batches of 50, embeds the first 2,000 chars of `title\ntext`) | `PROVENANCE.md`: CC-BY-4.0/MIT sources only, LICENSE verified, url per chunk; a new source needs its own section and a builder in `chunk.mjs`; `EMBED_CAP` 12,000 |
| Skill cards (auto-pushed, no tool call) | `packages/corpus/data/skill-cards.json` (5 cards) → `skill-cards.ts` | keyword overlap ≥2; up to 2 in the system message, +1 per plan step, ≤5 per run | edit the JSON; `upload` also makes them `search_docs` chunks (kind `skill`) | ≤2,200 chars each; cited vecIds must exist in `chunks.jsonl`; no hand-built UI recipes |
| Creator skills (`search_creation_skills` / `read_creation_skill`) | TS literals in `apps/worker/src/creator-skills.ts` (~217: foundation, mechanic and genre seeds) | token scoring (id 60, title 50, keywords 22, summary 10, steps 3) | append a `SkillSeed` to `FOUNDATION_SEEDS`; its refs must exist in `CREATOR_SKILL_REFERENCES`, and a new ref must point at an existing corpus docSlug/vecId; regenerate `chunks-witness.json` (`node scripts/build-chunk-witness.mjs`) | `creator-skills.test.mjs`: 2–6 steps; ≥2 preconditions, verifications, failure modes and quality criteria; ≥1 ref; read payload ≤2,800 chars; exactly 8 per genre and 2 per mechanic; ≥60 foundation |
| System prompt | `apps/worker/src/prompts.ts` (~47 KB) | always sent | edit text | no total-size test; `prompt-no-subjects` / `no-subject-literals`: banned subject words (in prompt, skill cards, creator skills, tool defs) |
| Genre references (`get_genre_references`) | `packages/corpus/data/genre-references.json` | keyword search, ≤2,800 chars | edit JSON | DevForum reference-only sources with official IDs that resolve in the corpus |
| Others | `mechanics.ts`, `verified-modules.json`, `need-index.json`, `ui-construction.json`, `packages/components` (Luau → `components.generated.ts`), `kit-pins.json` | various | per file | per file |

## Plan for feeding Phase R research
1. **Corpus (all depth):** add an "Apple research" source.
   - The research docs are original syntheses written in our own words, with a citation URL on every fact. They are
     not copies of anyone's text, so the licence rule is met by authorship.
   - Add a `PROVENANCE.md` section that says so.
   - Add a builder in `chunk.mjs` that splits each `research/roblox/NN-*.md` on `##`/`###`. Each chunk carries kind
     `research`, a url pointing to its first cited source, and the citations kept in its text.
   - Upload with `upload.mjs`. That is the one step that spends embedding calls, and it is cheap.
2. **Skill cards (always-on guidance):** one card per genre playbook and per core craft (a world-art pass, a UI pass,
   a sound pass, a VFX pass, the monetisation set-up, the first 5 minutes), each ≤2,200 chars and citing research
   chunk vecIds.
3. **Creator skills:** recipes from each doc become `FOUNDATION_SEEDS`, citing the research chunks (witness
   regenerated). Keep the banned subject words out.
4. **Prompt:** at most 6–8 lines of principles. The craft knowledge stays in the corpus and skills.
5. **Checks run (format only):** the unit tests listed above, run file by file. No live builds, no bench.

## Capability gaps found by the research (not knowledge — the agent cannot act on it yet)
- **Plugin allowlist** (`apps/apple-plugin/src/Commands.luau`) lacks the new Audio API (AudioPlayer, AudioEmitter,
  AudioListener, AudioDeviceOutput, Wire, audio effects), Animator/Animation/IKControl and Explosion (note 07 §9).
  Roblox calls Sound/SoundGroup/SoundEffect "discouraged". Extending the allowlist is a plugin release (owner's call on
  version) plus worker composers; until then audio-API recipes run through scripts.
