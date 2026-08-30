# Cloudflare Workers AI — Model Catalog & Economics (for Golem)

Research date: 2026-08-30. All data fetched from official Cloudflare docs pages on this date (URLs in Sources). Prices and catalogs change frequently — re-verify before hard-coding.

---

## TL;DR for Golem

- Both Workers Free and Workers Paid ($5/mo) include **10,000 neurons/day free** (resets 00:00 UTC). That is $0.11/day ≈ **$3.35/month of free inference**. Free plan hard-blocks after the allocation; Paid bills overage at **$0.011 per 1,000 neurons**.
- Best default coding/agent model on value: **`@cf/openai/gpt-oss-120b`** ($0.35 in / $0.75 out per M, 128k context, function calling + reasoning). The free daily allocation buys **exactly 100k input + 100k output tokens/day** on it.
- Cheapest capable agent tier: **`@cf/zai-org/glm-5.3-flash`** ($0.15/$0.50, 1M context, function calling + vision) — but it is one of the 7 models that **require a paid billing method** (Workers Paid or prepaid AI Gateway credits).
- **`@cf/qwen/qwen2.5-coder-32b-instruct`** is the only code-specialized model and one of the few that accepts **BYO LoRA adapters** — a path to a Luau-tuned model — but it has only a 32k context, a 300 RPM cap and **no function-calling badge**.
- Gotcha: nearly all text models default to **`max_tokens: 256`** — always set it explicitly for code generation.

---

## (a) Text-generation models relevant to coding/agents

Exact model IDs, from the pricing table and per-model pages:

| Model ID | $/M input | $/M output | Context window | Notes |
|---|---|---|---|---|
| `@cf/openai/gpt-oss-120b` | $0.35 | $0.75 | 128,000 | FC, reasoning, batch |
| `@cf/openai/gpt-oss-20b` | $0.20 | $0.30 | 128,000 | FC, reasoning, batch; low latency |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | $0.66 | $1.00 | 32,768 | Code-specific; LoRA; no FC badge |
| `@cf/qwen/qwq-32b` | $0.66 | $1.00 | 32k (UNVERIFIED on CF page) | Reasoning; LoRA |
| `@cf/qwen/qwen3-30b-a3b-fp8` | $0.051 | $0.335 | 32,768 | FC, reasoning, batch; MoE, very cheap |
| `@cf/qwen/qwen3.8-27b` | $0.45 | $3.20 | UNVERIFIED | FC, reasoning, vision |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293 | $2.253 | 24,000 | FC, batch |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | $0.27 | $0.85 | 131,000 | FC, vision, batch; MoE 17B×16E |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | $0.045 | $0.384 | — | cheap utility model |
| `@cf/meta/llama-3.2-3b-instruct` | $0.051 | $0.335 | — | cheap utility model |
| `@cf/meta/llama-3.2-1b-instruct` | $0.027 | $0.201 | — | cheapest Llama |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | $0.497 | $4.881 | — | reasoning distill; JSON mode |
| `@cf/deepseek-ai/deepseek-v4-flash-0731` | $0.44 ($0.014 cached) | $1.32 | 1,310,720 | FC, reasoning; **paid-billing only** |
| `@cf/deepseek-ai/deepseek-v4-pro-0813` | $1.32 ($0.044 cached) | $3.96 | UNVERIFIED | FC, reasoning; **paid-billing only** |
| `@cf/zai-org/glm-4.7-flash` | $0.06 | $0.40 | 131,072 | FC, reasoning; very cheap |
| `@cf/zai-org/glm-5.3-flash` | $0.15 ($0.03 cached) | $0.50 | 1,048,576 | FC, reasoning, vision; 320B/18B-active MoE; **paid-billing only** |
| `@cf/zai-org/glm-5.2` / `glm-5.3` | $1.40 ($0.26 cached) | $4.40 | UNVERIFIED | FC, reasoning; **paid-billing only** |
| `@cf/moonshotai/kimi-k2.5` | $0.60 ($0.10 cached) | $3.00 | UNVERIFIED | FC, reasoning, vision; **paid-billing only** (UNVERIFIED for k2.5) |
| `@cf/moonshotai/kimi-k2.6` | $0.95 ($0.16 cached) | $4.00 | UNVERIFIED | frontier 1T; **paid-billing only** |
| `@cf/moonshotai/kimi-k2.7-code` | $0.95 ($0.19 cached) | $4.00 | 262,144 | code-focused frontier 1T; FC, vision; **paid-billing only** |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | $0.351 | $0.555 | — | FC |
| `@cf/mistral/mistral-7b-instruct-v0.1` | $0.11 | $0.19 | — | LoRA base; 400 RPM |
| `@cf/google/gemma-3-12b-it` | $0.345 | $0.556 | — | LoRA base |
| `@cf/google/gemma-4-26b-a4b-it` | $0.10 | $0.30 | 256,000 | FC, reasoning, vision, batch; cheap |
| `@cf/nvidia/nemotron-3-120b-a12b` | $0.50 | $1.50 | UNVERIFIED | FC, reasoning |
| `@cf/ibm-granite/granite-4.0-h-micro` | $0.017 | $0.112 | UNVERIFIED | FC; cheapest FC model |
| `@cf/meta/llama-guard-3-8b` | $0.484 | $0.030 | — | content moderation |

FC = function calling badge in the official catalog. "—" = not gathered this pass.

**Paid-billing-only models** (verbatim list from the pricing page): `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `@cf/deepseek-ai/deepseek-v4-pro-0813`. These require Workers Paid or prepaid AI Gateway credits; they are unavailable on Workers Free.

## (b) Function calling and JSON mode

**Function calling** — catalog badge appears on: `llama-3.3-70b-instruct-fp8-fast`, `llama-4-scout-17b-16e-instruct`, `deepseek-v4-flash-0731`, `deepseek-v4-pro-0813`, `gemma-4-26b-a4b-it`, `glm-4.7-flash`, `glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `gpt-oss-120b`, `gpt-oss-20b`, `granite-4.0-h-micro`, `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`, `mistral-small-3.1-24b-instruct`, `nemotron-3-120b-a12b`, `qwen3-30b-a3b-fp8`, `qwen3.8-27b`, plus the docs' canonical example `@hf/nousresearch/hermes-2-pro-mistral-7b`.
- Two styles: **embedded function calling** via `@cloudflare/ai-utils` (`runWithTools`, `createToolsFromOpenAPISpec` — executes your JS functions in-Worker alongside inference) and **traditional** (model returns tool-call JSON; you execute and feed results back).
- OpenAI-compatible endpoints exist (`/v1/chat/completions`), so standard `tools`/`tool_calls` payloads work with FC-capable models.
- Note: `qwen2.5-coder-32b-instruct` does **not** carry the function-calling badge — for agentic tool loops prefer gpt-oss/glm/qwen3-30b.

**JSON mode / structured outputs** — pass `response_format: { type: "json_schema", json_schema: {...} }`. Documented supported list (JSON-mode page): Llama 3.1 8B/70B variants, `llama-3.3-70b-instruct-fp8-fast`, `llama-3-8b-instruct`, `llama-3.2-11b-vision-instruct`, `hermes-2-pro-mistral-7b`, DeepSeek Coder 6.7B, `deepseek-r1-distill-qwen-32b`. Limitations: **no streaming in JSON mode**; schema conformance is best-effort ("JSON Mode couldn't be met" error possible). Newer model pages (gpt-oss, qwen2.5-coder) also document a `response_format` parameter, but they are not on the JSON-mode page's official list — treat as UNVERIFIED until tested.

## (c) Embeddings and vision-language models

Embeddings ($/M input tokens):

| Model ID | $/M input | Notes |
|---|---|---|
| `@cf/baai/bge-m3` | $0.012 | multilingual, multi-granularity; model page states 60,000 max input tokens (unusually high — verify; upstream BGE-M3 is 8,192) |
| `@cf/qwen/qwen3-embedding-0.6b` | $0.012 | |
| `@cf/baai/bge-small-en-v1.5` | $0.020 | |
| `@cf/baai/bge-base-en-v1.5` | $0.067 | batch |
| `@cf/baai/bge-large-en-v1.5` | $0.204 | batch; 1,500 RPM |
| `@cf/pfnet/plamo-embedding-1b` | $0.019 | |
| `embeddinggemma-300m` | — | in catalog; pricing not listed on pricing page |

Reranker: `@cf/baai/bge-reranker-base` (text classification section).

Vision-language: `@cf/meta/llama-3.2-11b-vision-instruct` ($0.049/$0.676, LoRA), `llava-1.5-7b-hf`, `moondream3.1-9B-A2B`, `uform-gen2-qwen-500m`, plus the multimodal text models above (`llama-4-scout`, `gemma-4-26b-a4b-it`, `glm-5.3-flash`, `kimi-k2.5/2.6/2.7-code`, `qwen3.8-27b`). For Golem screenshot-understanding (Studio viewport checks), `gemma-4-26b-a4b-it` at $0.10/$0.30 with 256k context is the value pick.

## (d) Pricing and the neurons system

- **Neurons** are Cloudflare's cross-model GPU-compute unit. Conversion: **$0.011 per 1,000 neurons** (so 1 neuron ≈ $0.000011).
- **Workers Free**: 10,000 neurons/day at no charge; usage beyond that is **blocked** (no overage possible). Paid-billing-only models are unavailable.
- **Workers Paid ($5/mo)**: same 10,000 neurons/day included free, then $0.011/1,000 neurons overage, billed on usage. Allocation resets daily at 00:00 UTC.
- 10,000 neurons/day = $0.11/day ≈ $3.35/month of inference value.
- Whether the free daily allocation applies to the 7 paid-billing-only models on a Paid account is **UNVERIFIED** (docs do not say explicitly).
- Prepaid **AI Gateway credits** can pay for Workers AI inference via unified billing and unlock higher frontier-model rate limits.
- Neurons per M tokens (selected): gpt-oss-120b 31,818 in / 68,182 out; gpt-oss-20b 18,182 / 27,273; qwen2.5-coder-32b 60,000 / 90,909; glm-5.3-flash 13,636 / 45,455; qwen3-30b-a3b 4,625 / 30,475; llama-3.3-70b 26,668 / 204,805.

## (e) BYO LoRA / fine-tunes

- **Constraints**: adapter file **< 300MB**; trained with rank **r ≤ 8** (docs also mention support for larger ranks up to 32 — page wording is ambiguous; verify per base model); exactly two files: `adapter_model.safetensors` + `adapter_config.json` (must include `model_type`: `mistral`, `gemma`, or `llama`); up to **100 LoRA adapters per account**. Only non-quantized base models qualify.
- **Serving**: upload via `npx wrangler ai finetune create` (or REST API); at inference pass the finetune name/ID in the `lora` parameter; use `raw: true` to bypass the default chat template.
- **LoRA-capable base models** (catalog filter `?capabilities=LoRA`): `@cf/qwen/qwen2.5-coder-32b-instruct`, `@cf/qwen/qwq-32b`, `@cf/google/gemma-3-12b-it`, `@cf/google/gemma-2b-it-lora`, `@cf/google/gemma-7b-it-lora`, `@cf/meta/llama-3.2-11b-vision-instruct`, `@cf/meta/llama-guard-3-8b`, `@cf/meta/llama-2-7b-chat-hf-lora`, `@cf/mistral/mistral-7b-instruct-v0.1`, `@cf/mistral/mistral-7b-instruct-v0.2(-lora)`.
- Golem angle: a Luau-tuned LoRA on `qwen2.5-coder-32b-instruct` is feasible (train elsewhere, e.g. RunPod; serve on Workers AI at base-model token prices — no LoRA serving surcharge documented).

## (f) Context windows (per CF model pages)

- `deepseek-v4-flash-0731`: **1,310,720**
- `glm-5.3-flash`: **1,048,576**
- `kimi-k2.7-code`: **262,144**
- `gemma-4-26b-a4b-it`: **256,000**
- `glm-4.7-flash`: **131,072**
- `llama-4-scout-17b-16e-instruct`: **131,000**
- `gpt-oss-120b` / `gpt-oss-20b`: **128,000**
- `qwen2.5-coder-32b-instruct` / `qwen3-30b-a3b-fp8`: **32,768**
- `llama-3.3-70b-instruct-fp8-fast`: **24,000** (fp8-fast variant is context-truncated!)
- Default `max_tokens` is 256 on most models (2,000 on qwen3-30b-a3b) — set it explicitly.

## (g) Rate limits (requests/min unless noted)

- **Text generation: 300 RPM default.** Overrides: Mistral-7B 400; Qwen1.5-14B 150; small models up to 720–1,500.
- **Frontier models** (Kimi K2.6, K2.7-Code, GLM-5.2): **20 RPM per account per model**, or **50 RPM with prepaid AI Gateway credits**.
- Text embeddings: 3,000 RPM (bge-large: 1,500). Summarization 1,500; translation 720; image-to-text 720; ASR 720; text-to-image 720; image classification / object detection 3,000.
- Local-mode inference via Wrangler counts against these limits.

## Worked examples

**Cost of 1M input + 1M output tokens (top 3 coding candidates):**

| Model | Input cost | Output cost | Total | Neurons |
|---|---|---|---|---|
| `@cf/openai/gpt-oss-120b` | $0.35 | $0.75 | **$1.10** | 100,000 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | $0.66 | $1.00 | **$1.66** | 150,909 |
| `@cf/zai-org/glm-5.3-flash` | $0.15 | $0.50 | **$0.65** | 59,091 |

(Budget alternates: gpt-oss-20b $0.50; qwen3-30b-a3b-fp8 $0.386; gemma-4-26b $0.40; glm-4.7-flash $0.46. Frontier: kimi-k2.7-code $4.95.)

**What the free 10,000 neurons/day buys (tokens/day):**

| Model | Pure input | Pure output | 3:1 input:output mix |
|---|---|---|---|
| `gpt-oss-120b` | 314,288 | 146,667 | ~244,400 total (≈183k in + 61k out); balanced = exactly 100k in + 100k out |
| `qwen2.5-coder-32b` | 166,667 | 110,000 | ~147,650 total (≈110.7k in + 36.9k out) |
| `glm-5.3-flash` | 733,333 | 220,000 | ~463,200 total (≈347k in + 116k out) — only if the free allocation applies to paid-only models (UNVERIFIED) |
| `gpt-oss-20b` | 550,000 | 366,667 | ~488,900 total |

**Golem monthly sketch:** on Workers Paid ($5/mo base), staying under ~10k neurons/day means $5/mo total AI spend. A heavier day of e.g. 2M in + 0.4M out on gpt-oss-120b = 90,909 neurons ≈ $1.00 minus the free $0.11 ≈ $0.89 overage. Prompt-caching discounts (up to 30× cheaper cached input on deepseek-v4-flash: $0.014/M) make the paid-only long-context models attractive for repeated large system prompts / codebase context.

## Recommendations for Golem

1. **Default agent model: `@cf/openai/gpt-oss-120b`** — best price/capability with function calling, 128k context, and free-tier friendliness (100k+100k tokens/day free).
2. **Cheap high-volume lane: `@cf/qwen/qwen3-30b-a3b-fp8`** ($0.051/$0.335, FC) for classification/routing/short edits; `gemma-4-26b-a4b-it` for vision checks.
3. **Long-context codebase work: `@cf/zai-org/glm-5.3-flash`** (1M ctx, $0.15/$0.50, cached $0.03) once on Workers Paid.
4. **Luau specialization path:** LoRA on `qwen2.5-coder-32b-instruct` (r≤8, <300MB, safetensors) — but note its 32k context and lack of tool-calling.
5. Always set `max_tokens`; plan around 300 RPM text-gen limits (fine for a small SaaS); avoid frontier Kimi/GLM-5.2 for interactive loops (20 RPM).
6. Structured outputs: use `response_format` json_schema on the documented models; for others, validate + retry, since conformance is not guaranteed and JSON mode disables streaming.

## Sources

- Pricing & neurons: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Rate limits: https://developers.cloudflare.com/workers-ai/platform/limits/
- Model catalog (badges): https://developers.cloudflare.com/workers-ai/models/
- LoRA catalog filter: https://developers.cloudflare.com/workers-ai/models/?capabilities=LoRA
- Function calling: https://developers.cloudflare.com/workers-ai/features/function-calling/
- JSON mode: https://developers.cloudflare.com/workers-ai/features/json-mode/
- LoRA / fine-tunes: https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/
- Model pages: https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/ · /gpt-oss-120b/ · /gpt-oss-20b/ · /llama-3.3-70b-instruct-fp8-fast/ · /deepseek-v4-flash-0731/ · /glm-5.3-flash/ · /kimi-k2.7-code/ · /qwen3-30b-a3b-fp8/ · /gemma-4-26b-a4b-it/ · /glm-4.7-flash/ · /llama-4-scout-17b-16e-instruct/ · /bge-m3/
