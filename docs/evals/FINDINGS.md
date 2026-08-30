# Golem model evaluation findings — 2026-08-30 (v0.1 baseline)

56 Roblox-specific tasks, 8 categories, run against the production gateway
(single-turn; graded by deterministic checks + local `luau-lsp` syntax analysis).
Raw results: `packages/evals/results/*.json`. Rerun: `node src/run.mjs --models ... --tag ...`.

## Baseline (no retrieval)

| category | clay (qwen3-30b-a3b) | stone (gpt-oss-120b) | coder (qwen2.5-coder-32b) |
|---|---|---|---|
| api-knowledge | 67.9 | **100.0** | 85.7 |
| debugging | 100.0 | 92.6 | 100.0 |
| failure-recovery | 87.5 | 87.5 | 75.0 |
| luau-correctness | 93.6 | 98.2 | **100.0** |
| multi-file | 100.0 | 97.1 | 93.6 |
| project-comprehension | 100.0 | 100.0 | 100.0 |
| tool-selection | 100.0 | 100.0 | 100.0 |
| ui-implementation | 66.7 | 100.0 | 95.8 |
| **OVERALL** | **88.2** | **97.6** | **94.3** |

## With forced RAG injection (top-4 docs prepended)

| | clay | stone |
|---|---|---|
| OVERALL | 85.8 (−2.4) | 96.9 (−0.7) |
| api-knowledge | 71.4 (+3.5) | 100.0 (=) |

## Conclusions (drive the product configuration)

1. **gpt-oss-120b is the right core model** for Stone/Rune: best overall (97.6), perfect
   API knowledge, and also the *cheapest* strong option on Workers AI ($1.10/2M tokens).
   Decision: keep as default builder model. (Apache-2.0 → satisfies the open-core requirement.)
2. **Forced RAG injection is net negative** on this mix: +3.5 on clay's API knowledge but
   −6.8 on its Luau correctness (context distraction). Decision: retrieval stays an
   agent-invoked tool (`search_docs`) rather than automatic prompt stuffing. The corpus still
   pays off for long-tail/current APIs the models won't know (post-cutoff changes) — measured
   next by a dedicated "recent API" task set.
3. **qwen2.5-coder-32b** (94.3, best luau-correctness) remains the designated BYO-LoRA base
   on Workers AI if fine-tuning is later justified; today it loses to gpt-oss-120b on both
   quality and price, so no fine-tune is warranted yet by the evidence.
4. clay (qwen3-30b) stays for fast/cheap Clay mode: 10× cheaper input than the 70B-class,
   88.2 overall is acceptable for quick Q&A/small edits, and it has `search_docs` available.
5. Variance between identical runs is ~±2 points; differences smaller than that are noise.
   failure-recovery (4 tasks) needs more tasks before trusting movement there.
