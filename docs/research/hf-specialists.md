# Open-Model & Hugging Face Specialist Research

**Date:** 2026-08-30
**Question:** Can a specialist open-weight model or adapter beat `@cf/zai-org/glm-5.3-flash` on any narrow Golem sub-task, within ~$10/month and no new paid services?
**Verdict:** **No. Do not fine-tune anything. Prompting + tooling + retrieval wins decisively at our scale — and the fine-tune question is the wrong question, because our eval cannot see the defect the owner rejected.**

---

## 0. BLUF — the five findings that decide this

1. **Our eval is saturated and blind.** GLM-5.3-flash scores **98.9%**; `gpt-oss-120b` scores **96.8%** on the identical harness. The 2.1-point spread is *smaller than run-to-run variance on the same model* (`glm-prod` 97.4% vs `glm-final` 98.9% = 1.5 points). No model swap can be demonstrated to help, because the instrument has no resolution left.
2. **The eval has zero visual categories.** All 8 task files are code/API/tooling. Golem scores 98.9% *while producing scenes the owner rejected*. The defect is on an unmeasured axis. **A fine-tune optimises the measured axis. That is precisely the wrong move.**
3. **We already own a vision model.** `@cf/zai-org/glm-5.3-flash` is **natively multimodal** (Vision: Yes), **MIT-licensed**, 1,048,576-token context, native function calling, at **$0.15/M in, $0.50/M out, $0.03/M cached**. No candidate on Workers AI beats it on the combination of price + vision + tools + context.
4. **The BYO-LoRA path is empirically closed.** Both public Roblox/Luau LoRA adapters on the Hub violate Cloudflare's hard limits (rank and/or file size and/or base-model mismatch). Every LoRA-capable *text* base on Workers AI is either more expensive with a 32× smaller context (`qwen2.5-coder-32b`) or has a 3.5K–15K context that cannot hold a Golem prompt.
5. **No specialist exists.** Three targeted Hub searches for Roblox/game-scene visual-critique models and screenshot datasets returned **zero results**. There is nothing to adopt; anything would have to be built from scratch, from a dataset that does not exist.

---

## 1. Ground truth (verified, not assumed)

### 1.1 The production model

Verified at `apps/worker/src/gateway.ts:54-60` and `apps/worker/src/pricing.ts:28` — the ID is `@cf/zai-org/glm-5.3-flash` (note: **`zai-org`**, not `zhipu`; a summariser mangled this on first pass and it is worth stating because it changes which HF repo you check).

| Property | Value | Source |
|---|---|---|
| Workers AI ID | `@cf/zai-org/glm-5.3-flash` | CF model page |
| HF repo | [`zai-org/GLM-5.3-Flash`](https://huggingface.co/zai-org/GLM-5.3-Flash) | HF |
| Parameters | 321,323 M total / 18B active (MoE) | HF metadata + CF card |
| **Licence** | **MIT** — read the full `LICENSE` file: *"MIT License, Copyright (c) 2026 Z.AI Co., Ltd"* | [LICENSE](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/main/LICENSE) |
| Context | 1,048,576 tokens | CF model page |
| Vision | **Yes** (`AutoModelForMultimodalLM`, `image-text-to-text`) | CF card + HF config |
| Function calling | Yes | CF model page |
| Price | $0.15/M in · $0.50/M out · $0.03/M cached in | CF model page |

**This is the single most important fact in this document.** The strongest "specialist vision model" argument dies here: we are already running an MIT-licensed, vision-capable, tool-calling, million-token frontier model at near the cheapest price on the platform. There is no licence risk to remove and no vision capability to add.

### 1.2 The eval is saturated — measured, not asserted

From `packages/evals/results/*.json` (`overall.score`):

| Run | Model | Score | Transport errors |
|---|---|---|---|
| `glm-final-20260830-220223` | GLM-5.3-flash (`stone`) | **98.9%** | 0 |
| `glm-prod-20260830-215846` | GLM-5.3-flash (`stone`) | 97.4% | 0 |
| `baseline-20260830-201237` | GLM-5.3-flash (`stone`) | 97.6% | 0 |
| `gptoss-rebaseline-20260830-220417` | gpt-oss-120b (`baseline`) | **96.8%** | 0 |
| `baseline-20260830-201237` | `coder` lane | 94.3% | 0 |
| `baseline-20260830-201237` | `clay` lane | 88.2% | 0 |

The 98.9% figure is confirmed. But so is the problem: **three different architectures land within 2.1 points, and the same model varies 1.5 points across runs.** Per-category, `glm-final` is at 100% in six of eight categories. There is 1.1 points of headroom in total. A fine-tune cannot demonstrate a win against a ceiling.

> **Implication:** any claim that "model X beats GLM on Golem tasks" is currently unfalsifiable. Before *any* model work, the eval needs a visual/world-quality category with real headroom. That is a prerequisite, not a follow-up.

### 1.3 What the eval actually measures

`packages/evals/tasks/` contains exactly eight files:
`api-knowledge`, `luau-correctness`, `project-comprehension`, `ui-implementation`, `failure-recovery`, `multi-file`, `debugging`, `tool-selection`.

**None of them render anything. None of them look at anything.** The owner's rejection — untextured primitives, arbitrary bright colours, a "trophy" made of three stacked blocks — is invisible to all eight. Measured cost of the whole 56-task run: **$0.0036**, p50 latency 666 ms.

---

## 2. (a) Small vision models for screenshot critique

### Every vision-capable model on Workers AI, priced

| Model ID | In $/M | Out $/M | Context | Vision | Tools | Licence |
|---|---|---|---|---|---|---|
| **`@cf/zai-org/glm-5.3-flash`** ← ours | **0.15** | **0.50** | **1,048,576** | Yes | Yes | **MIT** |
| `@cf/google/gemma-4-26b-a4b-it` | **0.10** | **0.30** | 256,000 | Yes | Yes | Gemma Terms (not OSI) |
| `@cf/meta/llama-3.2-11b-vision-instruct` | 0.049 | 0.68 | 128,000 | Yes | — | Llama 3.2 Community |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 0.27 | 0.85 | 131,000 | Yes | Yes | Llama 4 Community |
| `@cf/moondream/moondream3.1-9B-A2B` | 0.30 | 1.00 | — | Yes | — | Moondream Model License 1.0 |
| `@cf/qwen/qwen3.8-27b` | 0.45 | 3.20 | 262,144 | Yes | Yes | — |
| `@cf/llava-hf/llava-1.5-7b-hf` | — | — | — | Yes | — | (legacy) |
| `@cf/unum/uform-gen2-qwen-500m` | — | — | — | Yes | — | **Deprecated** |

**The headline result inverts the usual intuition: the "small specialist" is the expensive option.** Moondream 3.1 — 9B total / 2B active, the obvious candidate — costs **$0.30/M in and $1.00/M out: 2× our production model on both axes**, while losing function calling, losing the million-token context, and adding a second model to maintain. Qwen3.8-27B is 3× input and 6.4× output.

Only **`gemma-4-26b-a4b-it`** is cheaper on both axes ($0.10/$0.30). It is a legitimate candidate for a *high-volume, low-stakes* critique pass, but: (i) it saves ~$0.03 per million input tokens, which at our volume is cents per month; (ii) its licence is the **Gemma Terms of Use**, not an OSI licence — it carries use restrictions and a redistribution-of-terms obligation, a strictly worse legal position than the MIT we have today.

### Licence provenance — the Moondream correction

This is worth recording carefully because the obvious search result is **wrong for this model**:

- A web search for "Moondream 3 license" returns the **`moondream3-preview`** terms: **Business Source License 1.1** with a "No Third-Party Service" grant. Under BSL, a paid SaaS is a genuinely grey area.
- **`moondream3.1-9B-A2B` — the model actually on Workers AI — uses a different, newer licence:** `license_name: moondream-model-license-1.0`, at <https://moondream.ai/licenses/model/1.0>.
- Reading that licence directly: §2 grants permission to *"use the Model Materials in commercial products, applications, and SaaS offerings"* and as *"an integrated component of a product, application, workflow, or Domain-Specific Service, including a commercial product or SaaS offering."* §3 restricts only *"a General-Purpose Hosted Model Service."* It is Elastic-License-2.0-derived, **not** BSL.

**Conclusion: Moondream 3.1 is licence-clean for Golem** (we would be a Domain-Specific Service using it as a component, not reselling inference). It is rejected on **cost and capability**, not on licence. Do not let a stale BSL memory be the reason — the reason is that it costs double and can't call tools.

### Does a Roblox-specific visual critic exist?

Three Hub searches — `game screenshot quality critique scene aesthetic` (models), `roblox vision screenshot` (models), `roblox screenshot image` (datasets) — returned **zero results each**. There is no specialist to adopt, and no image dataset from which to build one.

**(a) verdict:** Use `@cf/zai-org/glm-5.3-flash`'s own vision for screenshot critique. It is already paid for, already MIT, already in the tool loop, and cheaper than every alternative that can also call tools.

---

## 3. (b) BYO-LoRA on Workers AI — the path is closed

### The published constraints (verbatim from CF docs, page last updated 2026-04-21)

- Open beta, **free during the beta period**.
- LoRA only on models tagged `LoRA`, and they **must not be quantized**.
- *"Adapter must be trained with rank `r <=8` as well as larger ranks if up to 32."* (Expanded from r≤8/100 MB in the 2025-04-11 Developer Week release.)
- **Adapter file must be < 300 MB.**
- Files must be named exactly `adapter_config.json` and `adapter_model.safetensors`.
- **`adapter_config.json` must declare `model_type` as one of `mistral`, `gemma`, or `llama`.**
- `task_type: CAUSAL_LM`.
- Up to 100 adapters per account.

### Empirical test: the two real Roblox LoRAs on the Hub

I inspected the actual `adapter_config.json` and file sizes rather than trusting the model cards.

| Adapter | Rank | Adapter size | Base | Verdict |
|---|---|---|---|---|
| [`squaredcuber/roblox-luau-mistral-7b`](https://huggingface.co/squaredcuber/roblox-luau-mistral-7b) | **r=64** ✗ | **671,149,168 B (640 MiB)** ✗ | Mistral-7B-Instruct-**v0.3** ✗ | **Fails all three** |
| [`squaredcuber/roblox-luau-mistral-7b-rft`](https://huggingface.co/squaredcuber/roblox-luau-mistral-7b-rft) | r=32 ✓ | **335,604,696 B (320 MiB)** ✗ | Mistral-7B-Instruct-**v0.3** ✗ | **Fails size + base** |

Both are Apache-2.0 (licence is fine). Both are unusable. Note the base mismatch is not cosmetic: Workers AI's LoRA base is `@cf/mistralai/mistral-7b-instruct-v0.2-lora` (**v0.2**), and these adapters were trained on **v0.3**, which has a different tokenizer and vocabulary size.

### Even if you trained your own, the bases are unusable

| LoRA-capable base | In $/M | Out $/M | **Context** | Note |
|---|---|---|---|---|
| `@cf/qwen/qwen2.5-coder-32b-instruct` | **0.66** (4.4× ours) | **1.00** (2× ours) | **32,768** (32× smaller) | `model_type: qwen` is **not** in the documented allowlist — BYO-LoRA here is undocumented despite the capability tag |
| `@cf/meta/llama-3.2-11b-vision-instruct` | 0.049 | 0.68 | 128,000 | Only viable vision+LoRA base; `task_type: CAUSAL_LM` implies text-path adapters only |
| `@cf/mistralai/mistral-7b-instruct-v0.2-lora` | — | — | **15,000** | Cannot hold a Golem prompt |
| `@cf/google/gemma-7b-it-lora` | — | — | **3,500** | Unusable |
| `@cf/google/gemma-3-12b-it`, `gemma-7b-it`, `mistral-7b-instruct-v0.1/v0.2` | — | — | — | **Deprecated** |

**The `qwen2.5-coder-32b` result is the decisive one.** It is the base most people would reach for. Adapting it would mean paying **4.4× more per input token** to run a model with **1/32nd the context** of what we run today — before the adapter buys us anything. And the documented `model_type` allowlist (`mistral`/`gemma`/`llama`) does not include `qwen`, so the upload path is unverified.

**(b) verdict:** BYO-LoRA is a real, free, well-documented feature — and it is a trap for us. Every path either costs more, truncates context catastrophically, or targets a deprecated base. **No.**

---

## 4. (c) Roblox / Luau datasets on HF and their licences

| Dataset | Licence tag | Size | **Actual provenance risk** |
|---|---|---|---|
| [`Roblox/luau_corpus`](https://huggingface.co/datasets/Roblox/luau_corpus) | MIT | 10K–100K | **Clean.** First-party Roblox, opt-in from creators. But last modified **Nov 2023** — predates modern Luau/API surface. |
| [`TorpedoSoftware/the-luau-stack`](https://huggingface.co/datasets/TorpedoSoftware/the-luau-stack) | `mit` | 10K–100K | ⚠️ **Tag is misleading.** Gated. Card states use *"must abide by the terms of the original licenses, including attribution clauses."* Content is scraped GitHub with **mixed upstream licences** — some likely GPL/copyleft. The MIT tag covers the *compilation*, not the code. |
| [`TorpedoSoftware/roblox-info-dump`](https://huggingface.co/datasets/TorpedoSoftware/roblox-info-dump) | `mit` | 10K–100K | 🚩 **Tag is contradicted by its own terms.** Gated prompt states: *"**Roblox maintains the copyright on all content**"* and use *"must abide by the terms of the original licenses."* This is scraped `create.roblox.com/docs`. **The `license: mit` tag is not a valid grant.** Do not train on this. |
| [`TorpedoSoftware/Roblox-Luau-Reasoning-v1.0`](https://huggingface.co/datasets/TorpedoSoftware/Roblox-Luau-Reasoning-v1.0) | MIT | 10K–100K | Derived from `Roblox/luau_corpus`; inherits its clean MIT. Synthetic CoT added. |
| [`8BitStudio/Roblox-luau-coding_L1`](https://huggingface.co/datasets/8BitStudio/Roblox-luau-coding_L1) | Apache-2.0 | 12,306 examples | Clean licence; **synthetic**, unvetted quality. |
| [`jayras/roblox-luau-dataset`](https://huggingface.co/datasets/jayras/roblox-luau-dataset) | MIT | 565,760 lines | Cleaned of duplicates/malicious code; provenance not independently auditable. |

**Two things matter here.**

First, **the licence tags on the two most-used datasets are not trustworthy.** `roblox-info-dump` is tagged MIT while its own gating terms assert Roblox's copyright over all content. Anyone who trained a commercial model on it because "the tag said MIT" has a problem. This is exactly why the brief said *verify on the model card, do not assume* — and it paid off.

Second, and more important: **every one of these is text/code. There is not a single image, screenshot, scene-graph, or layout dataset for Roblox on the Hub.** The thing we would need to train a visual-quality model — pairs of (scene, human aesthetic judgement) — does not exist publicly and would have to be built by hand. That is the real cost of the fine-tune option, and it is far more than $10/month of anyone's time.

---

## 5. (d) Techniques from 2025–2026 papers we can use *without training anything*

These are the payload of this research. Each is implementable against GLM-5.3-flash today.

### 5.1 A constrained layout DSL with a deterministic compiler — the single highest-value idea

**SpatialGrammar** ([arXiv 2604.27555](https://arxiv.org/abs/2604.27555), Tang et al., 30 Apr 2026) represents layouts as **bird's-eye-view grid placements that deterministically compile to valid 3D geometry**, encoding physical priors *into the representation itself* so constraints are verifiable at generation time. It uses **compiler feedback to iteratively refine scenes and enforce collision constraints**. Two variants: `SG-Agent` (closed-loop refinement, **no training**) and `SG-Mini` (a 104M model on compiler-validated synthetic data).

**Why this is the answer to Golem's actual defect.** Golem currently emits free-form `Part` positions, so nothing can reject "four grey poles with yellow cubes on top." If instead the model emits a constrained scene DSL — anchors, footprints, alignment, adjacency, material slots — and a **validator** rejects unanchored/floating/interpenetrating/untextured output before it ever renders, the failure mode becomes *impossible to express* rather than *hopefully avoided*. Note that `SG-Agent` gets its gains **with no fine-tuning at all** — the win comes from representation + compiler feedback, exactly the "prompting + tooling" thesis.

Corroborating: **RoomPlanner** ([arXiv 2511.17048](https://arxiv.org/abs/2511.17048)) translates relational phrases into geometric constraints optimised to eliminate collisions. **OptiScene** ([arXiv 2506.07570](https://arxiv.org/abs/2506.07570)) and **CasLayout** ([arXiv 2604.27361](https://huggingface.co/papers/2604.27361)) reach the same conclusion — explicit relational/constraint structure beats raw coordinate emission.

### 5.2 Image-first, then layout

**Imaginarium** ([arXiv 2510.15564](https://huggingface.co/papers/2510.15564)) generates a reference image, then derives a scene graph and 3D layout from it. **Scenethesis** ([arXiv 2505.02836](https://huggingface.co/papers/2505.02836)) pairs LLM planning with vision-guided refinement.

**Directly actionable for us:** Workers AI already hosts FLUX (`@cf/black-forest-labs/flux-1-schnell`, `flux-2-klein-4b`). Golem can generate a *concept image* of the requested scene, then feed it to GLM-5.3-flash's vision as an explicit visual target for layout and palette. This attacks "arbitrary bright colours" at the root: the palette gets derived from a coherent reference rather than invented per-part.

### 5.3 Make the critique loop actually work — and know why it usually doesn't

**VISCO** ([arXiv 2412.02172](https://arxiv.org/abs/2412.02172)) is the essential caution: human critiques improve results, but **model-generated critiques are "less helpful and sometimes detrimental."** A naive "ask the model if the screenshot looks good" loop is *expected to make things worse*. Their fix, **LookBack** — re-visit the image and verify each claim in the initial reasoning against it — recovers **up to +13.5%**. The three named failure modes are worth designing against explicitly: overlooking perceptual detail, **hesitating to give negative assessments**, and overestimating error cascades.

Reinforcing techniques:
- **Task decomposition + concrete language** substantially improves zero-shot MLLM aesthetic reasoning ([arXiv 2501.09012](https://huggingface.co/papers/2501.09012)). Do not ask "is this good?" — ask "list every surface whose `Material` is `Plastic`", "name the light sources", "is any part floating?"
- **Iterative visual prompting with bounding boxes** closes ~50% of the gap to human design critique ([arXiv 2412.16829](https://huggingface.co/papers/2412.16829)). Annotate the screenshot before critique.
- **Calibration warning:** frontier models still trail human experts on comparative aesthetic judgement ([Visual Aesthetic Benchmark, arXiv 2605.12684](https://huggingface.co/papers/2605.12684)). Use the VLM as a **checklist verifier**, not a taste oracle.

**Design rule that follows:** make the critic answer *falsifiable, checkable* questions, not aesthetic ones. "Untextured" and "floating" are verifiable. "Beautiful" is not — and asking for it is where VISCO says the loop turns negative.

---

## 6. The thing nobody needs to train: Roblox's own asset pipeline

Golem's defect is *untextured primitives*. Roblox ships first-party fixes that are free and that we are simply not using:

- **Material Generator** and **Texture Generator** in Studio produce tileable PBR maps from text prompts. *(Caveat: the official docs page I read does not confirm Open Cloud/API access — it documents Studio UI usage only. Treat programmatic access as unverified and test it before planning around it.)*
- **Open Cloud Creator Store API** ([docs](https://create.roblox.com/docs/projects/assets/api)) allows querying Studio assets — meshes, models, audio — **programmatically from outside Studio** via the Toolbox Service. This is the real "asset selection" capability: retrieve a real modelled trophy instead of stacking three primitives.
- The Roblox Studio MCP already wired into this workspace exposes `generate_material`, `generate_mesh`, `generate_procedural_model`, `search_asset`, and `insert_asset`.

**Retrieval beats generation here, and it beats fine-tuning by a mile.** A model that has *seen* more Luau does not stop stacking primitives. A pipeline that *looks up an actual trophy mesh and assigns a real material* does.

For completeness: [`Roblox/cube3d-v0.5`](https://huggingface.co/Roblox/cube3d-v0.5) (text-to-3D-shape, [arXiv 2503.15475](https://arxiv.org/abs/2503.15475)) is **`openrail`** — permissive for commercial use but with behavioural use restrictions. It is **8.3 GB of weights** (`shape_gpt` 7.17 GB + `shape_tokenizer` 1.09 GB), is **not on Workers AI**, and would need a self-hosted GPU. **Excluded by the $10/month constraint**, not by licence.

---

## 7. Cost reality check

Grounded in measured usage (`glm-final` run: 10,702 input / 3,991 output tokens across 56 tasks = **$0.0036 total**, p50 latency 666 ms).

Adding a vision critique pass at ~2K input (screenshot + prompt) + 500 output, three times per build:

| Model | Cost per build (3 critiques) | vs GLM |
|---|---|---|
| **GLM-5.3-flash (already deployed)** | **~$0.0017** | — |
| Moondream 3.1 | ~$0.0033 | **2×**, loses tools + context |
| Gemma-4-26B | ~$0.0011 | saves $0.0006/build ≈ **pennies/month**, worse licence |

At our volume the *inference cost difference between every candidate is noise*. The real costs are engineering time, a second model to maintain, and legal review. **All three argue for using the model we already have.**

---

## 8. Licence provenance summary (for anything recommended)

| Asset | Licence | Verified how | Commercial use |
|---|---|---|---|
| `@cf/zai-org/glm-5.3-flash` | **MIT** | Full `LICENSE` file read from HF repo | ✅ Unrestricted |
| `Roblox/luau_corpus` | MIT | Dataset card + card body | ✅ Clean (but stale, Nov 2023) |
| `TorpedoSoftware/Roblox-Luau-Reasoning-v1.0` | MIT | Dataset card | ✅ Inherits clean upstream |
| `8BitStudio/Roblox-luau-coding_L1` | Apache-2.0 | Dataset card | ✅ Clean |
| `moondream/moondream3.1-9B-A2B` | Moondream Model License 1.0 | Licence text read at moondream.ai | ✅ Permitted as component (**not** BSL — that's `moondream3-preview`) |
| `TorpedoSoftware/roblox-info-dump` | Tagged `mit` | Gated terms read | 🚩 **Do not use** — "Roblox maintains the copyright on all content" |
| `TorpedoSoftware/the-luau-stack` | Tagged `mit` | Gated terms read | ⚠️ Mixed upstream GitHub licences; attribution obligations |
| `Roblox/cube3d-v0.5` | `openrail` | Model card | ✅ w/ use restrictions — but 8.3 GB, self-host only |
| `@cf/google/gemma-4-26b-a4b-it` | Gemma Terms | CF model page → Google licence | ⚠️ Not OSI; use restrictions |

---

## 9. Recommendation

**Do not fine-tune. Do not adopt a second model. Build the missing instrument, then build the missing pipeline.**

In order:

1. **Add a visual eval category with real headroom.** Golden scenes + programmatic checks: fraction of parts with a non-default `Material`, count of unanchored/floating parts, palette coherence, presence of lighting. Until this exists, *no model claim about Golem's actual defect is testable* — including the claim that GLM is good enough.
2. **Constrain the output representation** (SpatialGrammar). Emit a scene DSL, compile it deterministically, and reject invalid scenes before render. This makes "four grey poles" unrepresentable rather than merely discouraged.
3. **Wire up asset retrieval** — Open Cloud Creator Store API + Studio material/texture generation. This is what actually kills untextured primitives.
4. **Use GLM-5.3-flash's own vision as a checklist verifier**, with LookBack-style re-verification and decomposed, falsifiable questions. Never ask it whether something is beautiful.
5. **Optionally, image-first palette grounding** via FLUX on Workers AI.

**Revisit fine-tuning only if** step 1 shows a persistent, reproducible gap that steps 2–4 fail to close, *and* we have accumulated a proprietary dataset of (scene, human verdict) pairs from real Golem usage. That dataset — which no one else has — would be the only defensible reason to train. Today it does not exist, and training without it would optimise a saturated eval while the owner's actual complaint goes unmeasured.

---

## Sources

**Cloudflare Workers AI**
- [Workers AI model catalogue](https://developers.cloudflare.com/workers-ai/models/) · [glm-5.3-flash](https://developers.cloudflare.com/workers-ai/models/glm-5.3-flash/) · [moondream3.1-9B-A2B](https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/) · [gemma-4-26b-a4b-it](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) · [llama-3.2-11b-vision-instruct](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/) · [qwen2.5-coder-32b-instruct](https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/) · [qwen3.8-27b](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/) · [llama-4-scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/)
- [Using LoRA adapters](https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/) · [Public LoRA adapters](https://developers.cloudflare.com/workers-ai/features/fine-tunes/public-loras/) · [Developer Week 2025: expanded LoRA support](https://developers.cloudflare.com/changelog/post/2025-04-11-new-models-faster-inference/)

**Hugging Face**
- [zai-org/GLM-5.3-Flash](https://huggingface.co/zai-org/GLM-5.3-Flash) ([LICENSE](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/main/LICENSE)) · [moondream/moondream3.1-9B-A2B](https://huggingface.co/moondream/moondream3.1-9B-A2B) · [Roblox/cube3d-v0.5](https://huggingface.co/Roblox/cube3d-v0.5)
- [Roblox/luau_corpus](https://huggingface.co/datasets/Roblox/luau_corpus) · [TorpedoSoftware/the-luau-stack](https://huggingface.co/datasets/TorpedoSoftware/the-luau-stack) · [TorpedoSoftware/roblox-info-dump](https://huggingface.co/datasets/TorpedoSoftware/roblox-info-dump) · [TorpedoSoftware/Roblox-Luau-Reasoning-v1.0](https://huggingface.co/datasets/TorpedoSoftware/Roblox-Luau-Reasoning-v1.0) · [8BitStudio/Roblox-luau-coding_L1](https://huggingface.co/datasets/8BitStudio/Roblox-luau-coding_L1) · [jayras/roblox-luau-dataset](https://huggingface.co/datasets/jayras/roblox-luau-dataset)
- [squaredcuber/roblox-luau-mistral-7b](https://huggingface.co/squaredcuber/roblox-luau-mistral-7b) · [squaredcuber/roblox-luau-mistral-7b-rft](https://huggingface.co/squaredcuber/roblox-luau-mistral-7b-rft)
- [Moondream Model License 1.0](https://moondream.ai/licenses/model/1.0)

**Papers**
- [SpatialGrammar (2604.27555)](https://arxiv.org/abs/2604.27555) · [RoomPlanner (2511.17048)](https://arxiv.org/pdf/2511.17048) · [OptiScene (2506.07570)](https://arxiv.org/abs/2506.07570) · [CasLayout (2604.27361)](https://huggingface.co/papers/2604.27361) · [NaLA (2606.29395)](https://huggingface.co/papers/2606.29395) · [Imaginarium (2510.15564)](https://huggingface.co/papers/2510.15564) · [Scenethesis (2505.02836)](https://huggingface.co/papers/2505.02836)
- [VISCO (2412.02172)](https://arxiv.org/abs/2412.02172) · [MLLMs Reason about Aesthetics Zero-Shot (2501.09012)](https://huggingface.co/papers/2501.09012) · [Visual Prompting for Design Critique (2412.16829)](https://huggingface.co/papers/2412.16829) · [Visual Aesthetic Benchmark (2605.12684)](https://huggingface.co/papers/2605.12684)
- [Roblox Cube 3D tech report (2503.15475)](https://arxiv.org/abs/2503.15475)

**Roblox**
- [Creator Store queries / Assets API](https://create.roblox.com/docs/projects/assets/api) · [Material Generator](https://create.roblox.com/docs/studio/material-generator) · [Texture Generator](https://create.roblox.com/docs/studio/texture-generator)

**Internal (this repo)**
- `apps/worker/src/gateway.ts:54-60` (model lanes) · `apps/worker/src/pricing.ts:28-35` (unit pricing) · `packages/evals/results/*.json` (scores) · `packages/evals/tasks/*.json` (eight categories, none visual)
