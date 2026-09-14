# Model evaluation findings

> **The suite these numbers came from no longer exists in this form.** Every score below was
> measured against the 56-task suite. It has since grown to 84 tasks — the 28-task scripting
> curriculum added weight-3/4 tasks that carry 57.8% of the total, plus a `no_antipattern` check
> type the old runs never faced (see [SCRIPTING-CURRICULUM.md](../SCRIPTING-CURRICULUM.md)). A
> future overall score is **not** comparable to the 98.9% below; re-baseline before comparing.

## Historical: `@cf/zai-org/glm-5.3-flash` was production from 2026-08-30

**THIS IS NO LONGER THE PRODUCTION MODEL, AND THIS HEADING SAID IT WAS.** Corrected 2026-09-15.

GLM is on Cloudflare's paid-billing-required list: on the Workers Free plan every call returns
HTTP 403 / error 5035, so a product that must cost nothing recurring cannot be built on it. The
gateway records the reasoning at `apps/worker/src/gateway.ts:85-92` — "every mode USED TO resolve
to `@cf/zai-org/glm-5.3-flash`". What ships today is `@cf/openai/gpt-oss-20b` and
`@cf/openai/gpt-oss-120b`, with `@cf/meta/llama-3.2-11b-vision-instruct` for vision.

GLM remains in the price table at `apps/worker/src/pricing.ts:28`, which is why a grep finds it and
why "is it referenced" was the wrong question to ask of it.

The comparison below is kept because it is real and dated — it is how the choice was made at the
time, and deleting it would lose the reasoning. It is not a statement about what runs now. The
blockquote above already warns that the SUITE has changed; this warns that the MODEL has too, which
is the larger of the two and was the one not written down.

Measured on the 56-task Roblox suite, **same corrected grader for both models**:

| category | **GLM-5.3-flash (production)** | gpt-oss-120b (previous) |
|---|---|---|
| api-knowledge | 100.0 | 100.0 |
| debugging | **100.0** | 92.6 |
| failure-recovery | **100.0** | 87.5 |
| luau-correctness | **98.2** | 93.6 |
| multi-file | **100.0** | 97.1 |
| project-comprehension | 93.8 | **100.0** |
| tool-selection | 100.0 | 100.0 |
| ui-implementation | 100.0 | 100.0 |
| **OVERALL** | **98.9** | 96.8 |

GLM-5.3-flash wins on 4 categories, ties 3, and loses 1. It is also cheaper per token
($0.15/$0.50 vs $0.35/$0.75), so the migration improved quality *and* unit cost.

### A grader bug found during the migration
The original `not_contains` checks in project-comprehension marked an answer wrong for merely
*mentioning* an unaffected script — punishing the more useful answer that correctly lists what
breaks and then explains what does not. Checks now carry `scope: "claimed"`, which limits them to
the assertion part of the answer. This lifted GLM 81.3 → 93.8 and required re-baselining
gpt-oss-120b (96.8, previously reported as 97.6 under the buggy grader).

### Reasoning effort is the key setting
GLM is a reasoning model that emits `reasoning_content` alongside `content`. Measured on one
debugging prompt: default = 249 output tokens / 11.69 neurons; `low` = 24 tokens / 1.46 neurons;
`medium` = 600 tokens / 28.13 neurons **and no answer at all** (reasoning consumed the whole
budget). Production runs `reasoning: low` — both the cheapest and the only reliable setting.

---

# Historical: v0.1 baseline (pre-migration, buggy grader)

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
