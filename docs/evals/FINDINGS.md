# Model evaluation findings

> **The suite these numbers came from no longer exists in this form.** Every score below was
> measured against the 56-task suite. It has since grown to 84 tasks — the 28-task scripting
> curriculum added weight-3/4 tasks that carry 57.8% of the total, plus a `no_antipattern` check
> type the old runs never faced (see [SCRIPTING-CURRICULUM.md](../SCRIPTING-CURRICULUM.md)). A
> future overall score is **not** comparable to the 98.9% below; re-baseline before comparing.

## `@cf/zai-org/glm-5.3-flash` IS production again — asked of the deployed worker, 2026-09-21

**A CORRECTION THAT WENT STALE IS STILL A WRONG ANSWER.** This heading said GLM was production;
on 2026-09-15 that was corrected to say it was not; GLM then came back, and the correction became
the stale paragraph. Both are recorded below, because a document that quietly rewrites itself
teaches nobody why it was wrong.

**What the deployed worker answers today.** Not read out of `gateway.ts` — asked of
`https://apple.moshe-barami111.workers.dev` at `buildSha 3236f91-dirty`, one call per gateway key
through `/api/admin/model-test`, 1 neuron each:

| gateway key | reached by | served by, live |
|---|---|---|
| `stone` | Agent, **and every mode on the free Apple lane** | `@cf/zai-org/glm-5.3-flash` |
| `rune` | Super Agent on Apple MAX — **and Super Agent is not offered**, see below | `@cf/zai-org/glm-5.3-flash` |
| `clay` | Plan | `@cf/qwen/qwen3-30b-a3b-fp8` |
| `vision` | screenshot critique | `@cf/zai-org/glm-5.3-flash` |

`@cf/openai/gpt-oss-20b` and `@cf/openai/gpt-oss-120b` are still *available* on the account — they
appear in `/api/admin/model-routing` — but nothing routes to them. "Is it referenced" was the wrong
question to ask of a model id in 2026-09-15 and it is still the wrong question: the only answer that
settles it is what a call to the deployed worker comes back served by.

**Why the 2026-09-15 paragraph said otherwise, kept verbatim so the reasoning survives:** GLM is on
Cloudflare's paid-billing-required list, so on the Workers Free plan every call returned HTTP 403 /
error 5035, and a product that must cost nothing recurring could not be built on it. That constraint
is what moved production off GLM. It moved back when the account did.

**No customer reaches `rune` at all.** `PRODUCT_MODES_OFFERED` in `packages/shared/src/index.ts` is
`['plan', 'agent']`; `super` exists in `PRODUCT_MODES` because stored runs and bills must still
describe it, and the composer dropped it. So of the two modes a person can actually choose, **Agent
resolves both lanes to `stone` and only Plan differs** — Apple gets clay's 4400 tokens at effort
`low`, Apple MAX gets 6500 at `high`.

**`stone` and `rune` are the same model, and since 2026-09-20 they also have the same ceiling**
(6500, commit `8b61c91`) and the same effort floor on a paid lane. So per single call, Apple and
Apple MAX now resolve identically in Agent **and** Super Agent, and differ only in Plan mode. What
Apple MAX still buys is not a bigger or different brain per call: it is `maxStepsFor` (the free lane
is capped at Plan's step limit), exemption from the 8-step high-effort budget in `reasoning.ts`, and
a larger daily allowance. That is the honest axis and it is the one a customer can be told. Anything
in the product, the pricing page or a telemetry assumption that implies MAX gets a better model per
call is describing a world that ended on 2026-09-20.

The comparison below is kept because it is real and dated — it is how the choice was made at the
time, and deleting it would lose the reasoning. It is not a statement about what runs now. The
blockquote above already warns that the SUITE has changed.

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

## Conclusions (SUPERSEDED — these drove the product configuration in 2026-09, and no longer do)

> **Every numbered decision below is out of date, and they are kept rather than deleted because the
> reasoning is still worth reading.** Read them as a record of a decision, not as a description of
> production. What is true today is at the top of this file, asked of the deployed worker rather than
> read out of a config: **both product lanes serve `@cf/zai-org/glm-5.3-flash`.** Specifically —
> item 1's "keep gpt-oss-120b as the default builder model" was reversed: nothing routes to
> `@cf/openai/gpt-oss-120b` today. Item 3's BYO-LoRA plan for `qwen2.5-coder-32b` cannot be reached
> from production at all; `docs/model-serving-reality.md` has the account's own refusal, re-taken
> 2026-09-21. Item 4's "clay stays for fast/cheap Clay mode" no longer describes any choice a
> customer can make.
>
> **On `clay`, this file and `docs/model-serving-reality.md` disagreed, and both were wrong.** The
> table at the top of this page annotates `clay` as "reached by Plan"; model-serving-reality §2 says
> "no product lane routes here any more". `gatewayModelFor` was bundled out of
> `apps/worker/src/do/session.ts` with esbuild and **run** over every input on 2026-09-21, rather
> than read:
>
> | `productModel` | `mode` | gateway key |
> |---|---|---|
> | `apple` | clay / stone / rune | `stone` / `stone` / `stone` |
> | `apple-max` | clay / stone / rune | `stone` / `stone` / `rune` |
> | **`undefined`** | **clay** / stone / rune | **`clay`** / `stone` / `rune` |
>
> So neither named lane reaches `clay` — this page's annotation is wrong — and `clay` is **not**
> unreachable either, which is what model-serving-reality claims. `asProductModel` (session.ts, and
> the identical copy in index.ts serving `POST /v1/projects/:id/runs`) returns **`undefined`** when
> the caller omits `productModel`, and `gatewayModelFor` then returns the mode unchanged. A caller
> that asks for mode `clay` and sends no product model is served `@cf/qwen/qwen3-30b-a3b-fp8` while
> `effectiveProductModel` records the run as `apple` — the lane whose model is GLM. Written up with
> the exact symbols in `docs/backlog/HANDOFF-CLAY-REACHABLE.md`; not fixed here, because
> `apps/worker/src/do/session.ts` is held by another session.
>
> The numbers themselves also predate a grader fix: see the 96.8-vs-97.6 note above.

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
