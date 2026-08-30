# Workers AI Model Pricing — Cost Model for Golem

Research date: **2026-08-30**. Source pricing page last updated by Cloudflare: **Aug 28, 2026** (2 days before this research).
Account: `e9b8acf2e89a1de289a1ee4abb0f3f8d`, worker `golem`, calling Workers AI via the `env.AI` binding.

All figures below were read from the **raw markdown source** of the official docs pages
(`https://developers.cloudflare.com/workers-ai/platform/pricing/index.md`), not from a rendered summary.
Every per-model number was cross-checked a second time against that model's own catalog page
(`.../workers-ai/models/<model>/index.md`, `Unit Pricing` row).

---

## 1. Headline numbers

| Fact | Value | Source |
| --- | --- | --- |
| Neuron rate | **$0.011 per 1,000 Neurons** | [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Free daily allocation (Workers **Free**) | **10,000 Neurons per day** | same |
| Free daily allocation (Workers **Paid**) | **10,000 Neurons per day**, then $0.011 / 1,000 Neurons | same |
| Allocation reset | **Daily at 00:00 UTC** | same |

Verbatim from the docs:

> Workers AI is included in both the Free and Paid Workers plans and is priced at **$0.011 per 1,000 Neurons**.
> Our free allocation allows anyone to use a total of **10,000 Neurons per day at no charge**.

> All limits reset daily at 00:00 UTC.

| | Free allocation | Pricing |
| --- | --- | --- |
| Workers Free | 10,000 Neurons per day | N/A — Upgrade to Workers Paid |
| Workers Paid | 10,000 Neurons per day | $0.011 / 1,000 Neurons |

**Derived rate:** 1 Neuron = $0.000011. So `USD = neurons × 0.000011`.

### Billing-risk note (read this before enabling Workers Paid)

The pricing page describes **no spend cap, no budget limit, and no auto-shutoff** for Workers AI.
On Workers Paid, everything above 10,000 Neurons/day is billed at $0.011/1,000 Neurons with no
documented ceiling. The docs also note that *"Some models require a paid billing method"* —
`@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`,
`@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`,
`@cf/deepseek-ai/deepseek-v4-pro-0813`.

Whether any Cloudflare-side hard spend cap exists is **UNVERIFIED** — it is not on the pricing page,
and the [limits page](https://developers.cloudflare.com/workers-ai/platform/limits/) covers only
per-minute *rate* limits (requests/min by task type), not spend or neurons. Since the owner's
precondition is "uncontrolled AI billing is impossible," the cap must be assumed to be
**Golem's own responsibility in application code** unless a separate investigation proves otherwise.

One alternative the pricing page *does* document: **prepaid AI Gateway credits**. Setting a gateway's
Workers AI billing to *Unified billing* and routing the `AI` binding through it pays inference from a
prepaid balance. A prepaid balance is inherently bounded — this is worth evaluating as the
billing-containment mechanism, but its exhaustion behavior is **UNVERIFIED** here.

---

## 2. Per-model pricing — the models Golem uses or could use

Prices are **per 1M tokens**. Neuron columns are Cloudflare's own equivalents (the docs state:
*"The Price in Tokens column is equivalent to the Price in Neurons column"*).

| Model | $/M in | $/M out | Neurons/M in | Neurons/M out | Context window | Function calling |
| --- | ---: | ---: | ---: | ---: | ---: | :---: |
| `@cf/openai/gpt-oss-120b` | $0.350 | $0.750 | 31,818 | 68,182 | 128,000 | **Yes** |
| `@cf/openai/gpt-oss-20b` | $0.200 | $0.300 | 18,182 | 27,273 | 128,000 | **Yes** |
| `@cf/qwen/qwen3-30b-a3b-fp8` | $0.051 | $0.335 | 4,625 | 30,475 | 32,768 | **Yes** |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | $0.660 | $1.000 | 60,000 | 90,909 | 32,768 | **No** |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293 | $2.253 | 26,668 | 204,805 | **24,000** | **Yes** |
| `@cf/google/gemma-4-26b-a4b-it` | $0.100 | $0.300 | 9,091 | 27,273 | 256,000 | **Yes** |
| `@cf/baai/bge-small-en-v1.5` (embed) | $0.020 | — | 1,841 | — | 512 max input tokens | n/a |
| `@cf/baai/bge-m3` (embed) | $0.012 | — | 1,075 | — | 60,000 | n/a |

### Per-model notes

- **`@cf/google/gemma-4-26b-a4b-it` exists and is the current flagship Gemma.** It is live in the
  pricing table and has its own catalog page. Also present: `@cf/google/gemma-3-12b-it`
  ($0.345 / $0.556; 31,371 / 50,560 neurons) and `@cf/aisingapore/gemma-sea-lion-v4-27b-it`
  ($0.351 / $0.555). Gemma-4 is both cheaper and larger-context than Gemma-3 — there is no reason
  to pick Gemma-3 over Gemma-4 on price.
- **`@cf/qwen/qwen2.5-coder-32b-instruct` does NOT support function calling.** Its catalog page lists
  `Context Window: 32,768`, `LoRA: Yes`, `Unit Pricing` — and **no** `Function calling` row. It is also
  the second most expensive model in this set. If Golem needs tool use on a coding task, this model
  cannot do it.
- **`@cf/meta/llama-3.3-70b-instruct-fp8-fast` has only a 24,000-token context window** — by far the
  smallest of the chat models here, smaller than gpt-oss (128k), Gemma-4 (256k), and even
  qwen3-30b (32,768). Combined with the highest output price in the set ($2.253/M), it is a poor
  default. Note `@cf/meta/llama-3.1-70b-instruct-fp8-fast` is priced identically.
- **`@cf/baai/bge-small-en-v1.5` uses "Maximum Input Tokens: 512"**, not a context window — it will
  truncate anything longer. Output is 384-dimensional. `@cf/baai/bge-m3` has a 60,000-token context
  window and is **cheaper per token** ($0.012 vs $0.020) — bge-m3 dominates bge-small on both price
  and input length. bge-m3's output dimensionality is **UNVERIFIED** (not stated on its catalog page).
- Both embedding models are **input-priced only** — the pricing table lists no output token price,
  since embeddings emit vectors rather than tokens.
- Other BAAI embedding options for reference: `@cf/baai/bge-base-en-v1.5` $0.067/M (6,058 neurons),
  `@cf/baai/bge-large-en-v1.5` $0.204/M (18,582 neurons), `@cf/baai/bge-reranker-base` $0.003/M
  (283 neurons).

---

## 3. Cheaper small models with function calling (routing / classification)

**Yes — there are two materially cheaper options than anything in the list above, and one is ~3x
cheaper than the cheapest model Golem was considering.**

Function-calling support is a per-model property in the catalog; the
[function-calling docs](https://developers.cloudflare.com/workers-ai/features/function-calling/)
confirm the method: *"When browsing our model catalog, look for models with the function calling
property beside it."* Each row below was verified on that model's own page.

| Candidate | $/M in | $/M out | Neurons/M in | Neurons/M out | Context | Function calling |
| --- | ---: | ---: | ---: | ---: | ---: | :---: |
| **`@cf/ibm-granite/granite-4.0-h-micro`** | **$0.017** | **$0.112** | 1,542 | 10,158 | 131,000 | **Yes** |
| **`@cf/zai-org/glm-4.7-flash`** | $0.060 | $0.400 | 5,500 | 36,400 | 131,072 | **Yes** |
| `@cf/qwen/qwen3-30b-a3b-fp8` | $0.051 | $0.335 | 4,625 | 30,475 | 32,768 | **Yes** |
| `@cf/openai/gpt-oss-20b` | $0.200 | $0.300 | 18,182 | 27,273 | 128,000 | **Yes** |
| `@cf/google/gemma-4-26b-a4b-it` | $0.100 | $0.300 | 9,091 | 27,273 | 256,000 | **Yes** |

**Recommendation: `@cf/ibm-granite/granite-4.0-h-micro` is the clear routing/classification pick.**
It is the cheapest function-calling model in the entire Workers AI catalog on both input
($0.017/M) and output ($0.112/M), and still carries a 131,000-token context window. Cloudflare's
own description positions it exactly for this job: *"industry-leading results in key agentic tasks
like instruction following and function calling ... well-suited for ... multi-agent workflows."*
Against `@cf/qwen/qwen3-30b-a3b-fp8` it is **3x cheaper on input and 3x cheaper on output**, with
4x the context window.

`@cf/zai-org/glm-4.7-flash` is the runner-up — more expensive than granite but explicitly tuned for
*"multi-turn tool calling across 100+ languages"*, which matters if Golem's routing must handle
non-English input.

### Cheap models that do NOT support function calling (do not use for routing)

These are cheap and tempting, but their catalog pages have **no** `Function calling` row:

| Model | $/M in | $/M out | Context | Function calling |
| --- | ---: | ---: | ---: | :---: |
| `@cf/meta/llama-3.2-1b-instruct` | $0.027 | $0.201 | 60,000 | **No** |
| `@cf/meta/llama-3.2-3b-instruct` | $0.051 | $0.335 | 80,000 | **No** |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | $0.045 | $0.384 | — | **No** |

Note `@cf/meta/llama-3.2-1b-instruct` at $0.027/M in is *more expensive on input* than granite-4.0-h-micro
at $0.017/M — so there is no cost argument for dropping function calling here at all.

---

## 4. Cost table — one request of 6,000 input + 800 output tokens

### The arithmetic

```
cost_in  = (6,000 / 1,000,000) × price_per_M_input  = 0.006   × price_in
cost_out = (  800 / 1,000,000) × price_per_M_output = 0.0008  × price_out
total    = cost_in + cost_out

neurons  = 0.006 × neurons_per_M_in + 0.0008 × neurons_per_M_out
check    = neurons × $0.000011   (must equal total)
```

### Results

| Model | Input cost | Output cost | **Total USD** | Neurons | Cross-check via neurons | Requests in 10k free/day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `@cf/baai/bge-m3` (embed, 6k in) | $0.000072 | — | **$0.000072** | 6.45 | $0.000071 | 1,550 |
| `@cf/baai/bge-small-en-v1.5` (embed, 6k in)¹ | $0.000120 | — | **$0.000120** | 11.05 | $0.000122 | 905 |
| `@cf/ibm-granite/granite-4.0-h-micro` | $0.000102 | $0.000090 | **$0.000192** | 17.38 | $0.000191 | 575 |
| `@cf/qwen/qwen3-30b-a3b-fp8` | $0.000306 | $0.000268 | **$0.000574** | 52.13 | $0.000573 | 191 |
| `@cf/zai-org/glm-4.7-flash` | $0.000360 | $0.000320 | **$0.000680** | 62.12 | $0.000683 | 160 |
| `@cf/google/gemma-4-26b-a4b-it` | $0.000600 | $0.000240 | **$0.000840** | 76.36 | $0.000840 | 130 |
| `@cf/openai/gpt-oss-20b` | $0.001200 | $0.000240 | **$0.001440** | 130.91 | $0.001440 | 76 |
| `@cf/openai/gpt-oss-120b` | $0.002100 | $0.000600 | **$0.002700** | 245.45 | $0.002700 | 40 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.001758 | $0.001802 | **$0.003560** | 323.85 | $0.003562 | 30 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | $0.003960 | $0.000800 | **$0.004760** | 432.73 | $0.004760 | 23 |

¹ bge-small has a 512-token max input, so a real 6,000-token request would be **truncated**. The row
is the arithmetic at the quoted rate, shown for comparability only.

The dollar path and the neuron path agree on every row (differences are Cloudflare's own rounding in
the published neuron figures), which validates both columns.

### Worked examples

**`@cf/openai/gpt-oss-120b`** (most expensive general chat model here):
```
in  : 0.006  × $0.350 = $0.002100
out : 0.0008 × $0.750 = $0.000600
total                 = $0.002700
neurons: 0.006 × 31,818 = 190.908
       + 0.0008 × 68,182 =  54.546  →  245.45 neurons
check  : 245.45 × $0.000011 = $0.002700  ✓
```

**`@cf/ibm-granite/granite-4.0-h-micro`** (cheapest with function calling):
```
in  : 0.006  × $0.017 = $0.000102
out : 0.0008 × $0.112 = $0.0000896
total                 = $0.000192
neurons: 0.006 × 1,542 =  9.252
       + 0.0008 × 10,158 = 8.126  →  17.38 neurons
check  : 17.38 × $0.000011 = $0.000191  ✓
```

**`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** (output-price trap — output costs *more* than input
despite being 7.5x fewer tokens):
```
in  : 0.006  × $0.293 = $0.001758
out : 0.0008 × $2.253 = $0.0018024   ← larger than the input cost
total                 = $0.003560
neurons: 0.006 × 26,668 = 160.008
       + 0.0008 × 204,805 = 163.844  →  323.85 neurons
check  : 323.85 × $0.000011 = $0.003562  ✓
```

### What this means at the $5/mo budget

The right-hand column is the number that matters most for Golem. The 10,000-Neuron daily free
allocation is **small**: at this request shape it is only **40 requests/day** on gpt-oss-120b, but
**575/day** on granite-4.0-h-micro — a 14x difference from model choice alone.

Beyond the free tier, $5.00 of Workers AI spend buys 454,545 neurons total, i.e. at this request shape:

| Model | Requests per $5 (beyond free tier) |
| --- | ---: |
| `@cf/ibm-granite/granite-4.0-h-micro` | ~26,000 |
| `@cf/qwen/qwen3-30b-a3b-fp8` | ~8,700 |
| `@cf/google/gemma-4-26b-a4b-it` | ~5,900 |
| `@cf/openai/gpt-oss-20b` | ~3,470 |
| `@cf/openai/gpt-oss-120b` | ~1,850 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | ~1,400 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | ~1,050 |

(Note the $5/mo Workers Paid subscription is the plan fee; Workers AI usage above the free allocation
is billed **on top** of it. Whether the Workers Paid plan includes any usage credit that offsets
Workers AI neurons is **UNVERIFIED** — the Workers AI pricing page does not mention one.)

---

## 5. Practical conclusions for Golem's cost model

1. **Route on `@cf/ibm-granite/granite-4.0-h-micro`.** Cheapest function-calling model in the catalog,
   131k context, ~$0.000192 per 6k+800 request. 575 free requests/day.
2. **Escalate to `@cf/google/gemma-4-26b-a4b-it`** for real work — $0.000840/request, 256k context,
   function calling, and cheaper than gpt-oss-20b on input *and* equal on output.
3. **Embed with `@cf/baai/bge-m3`, not `bge-small-en-v1.5`.** Cheaper per token ($0.012 vs $0.020)
   *and* 60,000-token context vs a 512-token cap. bge-small is strictly dominated.
4. **Avoid `@cf/qwen/qwen2.5-coder-32b-instruct`** unless LoRA is specifically needed: most expensive
   model in the evaluated set *and* no function calling.
5. **Avoid `@cf/meta/llama-3.3-70b-instruct-fp8-fast` as a default:** 24,000-token context (smallest
   here) and a $2.253/M output price that makes output dominate total cost.
6. **Watch output tokens, not just input.** Output is priced 1.5x–7.7x higher than input across these
   models. Capping `max_tokens` is the single highest-leverage cost control in the request path.
7. **The free tier alone is not a billing guard.** 10,000 neurons/day is consumed by 23–575 requests
   depending on model. Golem must enforce its own per-user/per-day neuron budget before Workers Paid
   is enabled.

---

## Open items / UNVERIFIED

- Whether Cloudflare offers **any hard spend cap or budget alert** for Workers AI. Not on the pricing
  page; the limits page is rate limits only. **This is the owner's blocking question and is not
  answered by the pricing docs** — it needs its own investigation (billing/notifications docs, or
  the AI Gateway prepaid-credits path).
- Exhaustion behavior of **prepaid AI Gateway credits** when the balance hits zero (does inference
  fail closed, or fall back to account billing?).
- Output dimensionality of `@cf/baai/bge-m3` — not stated on its catalog page.
- Whether the Workers Paid $5/mo plan includes any **usage credit** applicable to Workers AI neurons.
- Context window for `@cf/meta/llama-3.1-8b-instruct-fp8-fast` — not captured in this pass.

---

## Sources

All pages fetched 2026-08-30. Cloudflare docs serve a raw-markdown twin of each page at
`<url>index.md`; figures were read from those to avoid summarization error, then cross-checked
against each model's own catalog page.

- Workers AI pricing (neuron rate, free allocation, full per-model table, paid-billing model list, AI Gateway credits):
  https://developers.cloudflare.com/workers-ai/platform/pricing/
  (raw: https://developers.cloudflare.com/workers-ai/platform/pricing/index.md — "Last updated Aug 28, 2026")
- Workers AI model catalog: https://developers.cloudflare.com/workers-ai/models/
- Workers AI limits (rate limits by task type — confirms no neuron/spend cap documented here):
  https://developers.cloudflare.com/workers-ai/platform/limits/
- Function calling (how to identify supporting models):
  https://developers.cloudflare.com/workers-ai/features/function-calling/
- Workers platform pricing (checked for a Workers AI neuron allowance — none found):
  https://developers.cloudflare.com/workers/platform/pricing/

Per-model catalog pages (context window, function calling, unit pricing):

- https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
- https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/
- https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
- https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/
- https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://developers.cloudflare.com/workers-ai/models/bge-small-en-v1.5/
- https://developers.cloudflare.com/workers-ai/models/bge-m3/
- https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/
- https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/
- https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/
