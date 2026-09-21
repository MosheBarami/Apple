# MODEL SERVING REALITY — can a locally-trained LoRA reach production?

**Answer: NO. Not today, not on the models production actually serves.**

**Measured:** 2026-09-20, against the live Cloudflare account, not against documentation alone.
**Scope of this document:** one question only — whether a LoRA adapter trained on the M2 Pro can be
applied to the model a paying customer's request hits. It does not evaluate whether training is
worth doing; it establishes the constraint that any such decision has to respect.

---

## 1. THE ONE-LINE VERSION

Apple MAX runs on `@cf/zai-org/glm-5.3-flash`. Cloudflare refuses, with an explicit error, to apply
any LoRA adapter to that model. So every hour spent training produces an artifact that **cannot be
loaded by the thing customers talk to**, until a lane is deliberately moved onto a different base
model — and every base model that accepts adapters is materially weaker than what is served now.

This is not a pessimistic reading of the docs. It is the API's own refusal, reproduced below.

---

## 2. THE EXACT PRODUCTION MODEL IDS

From `apps/worker/src/gateway.ts` (`DEFAULT_MODELS`, lines 104–137) and the lane mapping in
`apps/worker/src/do/session.ts` (`gatewayModelFor`, line 475):

| Gateway config key | Model id | maxTokens ceiling | nativeTools | Which product lane reaches it |
|---|---|---|---|---|
| `stone` | `@cf/zai-org/glm-5.3-flash` | 5,600 | yes | **Apple (free) — every mode**, and **Apple MAX in Plan mode** |
| `rune`  | `@cf/zai-org/glm-5.3-flash` | 6,500 | yes | **Apple MAX — Agent / Super Agent** |
| `vision`| `@cf/zai-org/glm-5.3-flash` | 4,000 | no  | the visual critic |
| `clay`  | `@cf/qwen/qwen3-30b-a3b-fp8` | 6,500 | yes | **no product lane routes here any more** — but see the correction under this table: that is not the same as unreachable |
| `memory`| `@cf/qwen/qwen3-30b-a3b-fp8` | 800 | no | internal summarisation |

**Say this precisely, because the repository has been burned by not saying it precisely:** `clay`,
`stone` and `rune` are *gateway config names*. They are not product lanes. `gatewayModelFor` reads:

```ts
if (productModel === 'apple') return 'stone';
if (productModel === 'apple-max') return mode === 'clay' ? 'stone' : mode;
```

So **both product lanes are served by `@cf/zai-org/glm-5.3-flash` today.** The free lane was moved
onto it deliberately (see the measurement quoted in the comment above that function: stone 11/12 at
125 neurons vs clay 1/12 at 718 neurons on the same twelve prompts, each at its own production
budget). The only thing a customer request can currently hit is GLM-5.3 Flash.

That matters for this question: there is no second, lesser production lane sitting on a
LoRA-capable model that a fine-tune could quietly improve. There is one model, and it refuses LoRA.

> **Correction, 2026-09-21, and it does not change the LoRA answer.** "No product lane routes here"
> is true and reads as "nothing reaches clay", which is false. `gatewayModelFor` was bundled and
> **run** over every input: with `productModel` **undefined** it returns the mode unchanged, so a
> run asking for mode `clay` and sending no product model is served `@cf/qwen/qwen3-30b-a3b-fp8` —
> while `effectiveProductModel` records that same run as `apple`. Both copies of `asProductModel`
> return `undefined` for an omitted field, and one of them serves `POST /v1/projects/:id/runs`.
> Written up in `docs/backlog/HANDOFF-CLAY-REACHABLE.md`; not fixed here, because
> `apps/worker/src/do/session.ts` is held by another session. Whether live traffic takes that path
> is unmeasured. qwen3-30b-a3b-fp8 carries no `lora` property either (§3.1), so the answer above
> stands for every key.

> A stale note in project memory says all five keys resolve to GLM and that the account has zero
> finetunes uploaded. Both are now wrong: `clay`/`memory` are qwen3-30b-a3b-fp8, and the account has
> **two** uploaded finetunes. Corrected here.

---

## 3. THE MEASUREMENT THAT SETTLES IT

Three independent observations, in increasing order of how hard they are to argue with.

### 3.1 The live account catalogue does not mark either production model LoRA-capable

`GET /accounts/{id}/ai/models/search?per_page=200`, run with this account's own token on
2026-09-20. 65 models returned. Exactly **9** carry the `lora: true` property:

```
@cf/google/gemma-2b-it-lora
@cf/google/gemma-7b-it-lora
@cf/meta-llama/llama-2-7b-chat-hf-lora
@cf/meta/llama-3.2-11b-vision-instruct
@cf/meta/llama-3.2-3b-instruct
@cf/meta/llama-guard-3-8b
@cf/mistral/mistral-7b-instruct-v0.2-lora
@cf/qwen/qwen2.5-coder-32b-instruct
@cf/qwen/qwq-32b
```

`@cf/zai-org/glm-5.3-flash` is present in the catalogue; its property list is
`require_workers_paid, context_window, function_calling, reasoning, reasoning_effort, terms,
vision, price` — **no `lora` property at all.** Same for `@cf/qwen/qwen3-30b-a3b-fp8`.

### 3.2 The public documentation agrees

`https://developers.cloudflare.com/workers-ai/models/?capabilities=LoRA` lists the same set. No
GLM model of any version carries a LoRA tag. The limits on
`https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/` are unchanged: rank ≤ 8
(up to 32), adapter < 300 MB, files named exactly `adapter_config.json` and
`adapter_model.safetensors`, up to 100 adapters per account, free while in open beta.

### 3.3 The API refuses it to your face — with a control that proves the refusal is real

A catalogue property is a claim. This is the behaviour. The account already holds a real uploaded
adapter, `apple-v4` (`ddde8377-8a76-4240-b083-b9e59cd38031`), trained locally and uploaded against
`@cf/meta/llama-3.2-3b-instruct`. Sending that **same real adapter id** to four different models:

| Model it was sent to | Result |
|---|---|
| `@cf/meta/llama-3.2-3b-instruct` (its own base) | **success: true**, answered normally — *the control: the id is valid and the adapter loads* |
| `@cf/zai-org/glm-5.3-flash` (**Apple MAX**) | **refused**, code 5005: `LoRA unsupported: The model @cf/zai-org/glm-5.3-flash does not support LoRA inference` |
| `@cf/qwen/qwen3-30b-a3b-fp8` | **refused**, code 5005: `does not support LoRA inference` |
| `@cf/qwen/qwen2.5-coder-32b-instruct` (LoRA-capable, different base) | **refused**, code 3030: `Lora not compatible with model` |

The control row is what makes the other three mean something. Without it, a refusal could be a bad
id, a bad token, or a typo. With it, the id demonstrably works — so the refusal is about the model.

The fourth row is the second half of the constraint and is easy to miss: **a LoRA adapter is
dimension-specific.** Being trained on *a* LoRA-capable base is not enough; it must be trained on
*the exact* base it will be served on. Moving bases means retraining from scratch, not re-uploading.

**Reproduce it:**
```bash
cd /Users/moshe/Desktop/RbxAI && set -a && source .env && set +a
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/zai-org/glm-5.3-flash" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say OK."}],"max_tokens":24,"lora":"ddde8377-8a76-4240-b083-b9e59cd38031"}'
```

*Settings, stated because this repository requires it:* `max_tokens: 24`, default temperature,
single user turn "Say OK.", direct Workers AI REST API (not through the worker, not through AI
Gateway). This measures **model-level LoRA support**, which is not budget-sensitive — a refusal at
code 5005 happens before any token is generated. It does **not** measure output quality, and
nothing here should be read as a quality number.

---

## 4. THE SECOND CONSTRAINT, WHICH IS WORSE THAN THE FIRST

Even granting a retrain onto a LoRA-capable base, look at what those nine models can do:

| LoRA-capable model | native function calling | vision | context |
|---|---|---|---|
| `@cf/google/gemma-2b-it-lora` | **no** | no | 8,192 |
| `@cf/google/gemma-7b-it-lora` | **no** | no | 3,500 |
| `@cf/meta-llama/llama-2-7b-chat-hf-lora` | **no** | no | 8,192 |
| `@cf/meta/llama-3.2-11b-vision-instruct` | **no** | yes | 128,000 |
| `@cf/meta/llama-3.2-3b-instruct` | **no** | no | 80,000 |
| `@cf/meta/llama-guard-3-8b` | **no** | no | 131,072 |
| `@cf/mistral/mistral-7b-instruct-v0.2-lora` | **no** | no | 15,000 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | **no** | no | 32,768 |
| `@cf/qwen/qwq-32b` | **no** | no | 24,000 |

**Not one of the nine supports native function calling.** Production's `stone` and `rune` are
`nativeTools: true`, and the whole product is an agent that calls `run_luau`, `edit_script` and
`delete_instances`. The set of models that accept our adapter and the set of models that can call
tools natively are **disjoint**. This is the same finding `docs/audit/INFERENCE-PROVIDERS.md`
recorded on 2026-09-14; it is re-verified here against today's catalogue and today's model ids, and
it still holds.

Compare what would be given up, from the same live catalogue:

| | `@cf/zai-org/glm-5.3-flash` (now) | `@cf/meta/llama-3.2-3b-instruct` (best LoRA option) | `@cf/qwen/qwen2.5-coder-32b-instruct` |
|---|---|---|---|
| native tools | **yes** | no | no |
| vision | **yes** | no | no |
| context | **1,310,720** | 80,000 | 32,768 |
| price in / out per M tokens | $0.15 / $0.50 (cached in $0.03) | $0.0509 / $0.335 | $0.66 / $1.00 |
| measured on this product's eval | yes — `glm-final \| stone \| 98.9` (`docs/evals/RESULTS.md:16`, 56 jobs, checker luau-lsp, 2026-08-30) | **never measured** | **never measured** |

Note the last column: `qwen2.5-coder-32b` — the option that *sounds* right for Luau — is **4.4×
the input price and 2× the output price of GLM-5.3 Flash**, with 2.5% of the context and no tools.
"Train on the coder model" is not a cheap experiment; it is a more expensive, less capable lane.

---

## 5. SO IS THERE *ANY* PATH? YES — ONE, AND IT IS A DOWNGRADE

There is one honest caveat to "cannot reach production", and it should be stated rather than used
to soften the answer.

`gateway.ts` already has a **prompted-tool fallback**:

```ts
const usePrompted = !!req.tools?.length && !cfg.nativeTools;
```

A model without native tools can still be handed tools — the gateway rewrites the conversation into
plain text and parses the tool call back out. So a LoRA-capable base is not *architecturally*
excluded. `@cf/meta/llama-3.2-3b-instruct` with `nativeTools: false` would run.

And there is evidence the adapter helps exactly there. `packages/training/runs/eval-v4-scored.json`,
base `unsloth/Llama-3.2-3B-Instruct` vs `adapters/apple-v4-best`:

- **trajectory (tool-call) tasks: base 0/13 → adapter 8/13.** The failures that disappeared were
  `tool_does_not_exist` (5) and half the `arguments_rejected`. Training taught the model this
  product's actual tool surface.
- **game-logic tasks: base 0/8 → adapter 0/8.** No movement. It did not teach the model to write
  Luau that passes its own checks.

*Settings:* generated by `packages/training/src/generate_eval.py`, greedy sampling; the script's
default is `--max-tokens 600` and `eval-v4.json` does not record the flag actually passed, so treat
600 as the assumed budget rather than a verified one. Scored by `score-eval.mjs` by executing each
module against its own checks. This is a **local** measurement of a 3B model, not a production
measurement, and it is not comparable to the 98.9 GLM figure, which came from a different suite.

So the whole path, stated plainly: **retrain from scratch on `@cf/meta/llama-3.2-3b-instruct`,
upload, and move a lane from a 1.3M-context multimodal native-tool-calling model to a 3B text-only
model driven by text-parsed tool calls.** That is what "a fine-tune reaching production" costs
today. Read section 6 before deciding it is worth it.

---

## 6. THE ALTERNATIVES, WITH REAL COSTS

| # | Option | Work | Risk | Recurring cost |
|---|---|---|---|---|
| **A** | **Do nothing to serving. Keep training as research only.** Adapters stay local, measured with `eval-production.mjs` and the local pilot; nothing ships to customers. | none | **none to the product** — but be honest that training then buys learning, not customer value | $0 |
| **B** | **Move ONE non-customer-facing lane to a LoRA base.** `vision` was on `@cf/meta/llama-3.2-11b-vision-instruct` (LoRA-capable, vision, 128k) before it moved to GLM. An adapter could serve the visual critic. | ~1 day: retrain on llama-3.2-11b dims, upload, flip `vision` in `DEFAULT_MODELS` | low — critic output is advisory, a regression degrades feedback rather than breaking a build | roughly neutral ($0.0485/$0.676 per M vs $0.15/$0.50) |
| **C** | **Move a customer lane to `@cf/meta/llama-3.2-3b-instruct` + prompted tools.** The only route to "the fine-tune is what customers use". | ~1–2 weeks: retrain from scratch, verify the prompted-tool path end to end, re-run the lane comparison | **high.** The 12-prompt lane test already showed what happens when a weaker model meets this toolset: 1/12, ten empty answers, and more spend. A 3B model is smaller than the qwen3-30b that failed that test | cheaper per token; likely dearer per *successful build* |
| **D** | **Serve the adapter ourselves on the M2 Pro** (`llama-server --lora-scaled`, MIT-licensed, hot-swappable). Full control of base model and rank. | ~2–3 days to stand up; then it is infrastructure with an owner | **high for a SaaS**: one machine, ~1 concurrent serious request, no redundancy, dies when the laptop sleeps. Acceptable for an internal lane, not for paying customers | $0 cash, but it is a server someone has to run |
| **E** | **A provider that hosts custom adapters.** Fireworks supports LoRA — but explicitly **not on serverless**; adapters deploy only to on-demand *dedicated* (paid GPU) deployments. Together has no free tier and dedicated GPUs run $3.99–$8.99/hr. | ~1 week incl. a new provider adapter in `src/providers/` | medium technically; the cost is the real risk | **dedicated GPU hours — the most expensive option on this list** |
| **F** | **Wait for Cloudflare to add LoRA to a strong base.** LoRA support is in open beta and the supported list has grown before (8 models added at once in Apr 2025). | none | **an unbounded wait with no commitment from the vendor.** Not a plan; a thing to check quarterly | $0 |

**If the goal is "Apple MAX is a frontier model for Roblox", none of A–F gets there by training.**
The lever that moves that goal is not the adapter. It is the knowledge the model reaches at
generation time — `apps/worker/src/ui-construction-guide.ts`, the 80 executable modules in
`apps/worker/src/verified-modules.ts`, the 1,451 sourced claims in
`packages/corpus/data/ui-references/` — all of which apply to GLM-5.3 Flash **today**, with no
retraining, no base change and no serving question. That is where an hour buys something a customer
can see.

---

## 7. WHAT WOULD CHANGE THIS ANSWER

Re-check and update this file if any of these becomes true. Each is a single command.

1. `@cf/zai-org/glm-5.3-flash` gains a `lora` property in the account catalogue (§3.1 command).
2. Any model with `function_calling: true` gains `lora: true`. Today that intersection is empty:
   ```bash
   # prints nothing today; if it prints anything, this document is out of date
   curl -s ".../ai/models/search?per_page=200" -H "Authorization: Bearer $TOKEN" \
   | python3 -c "import sys,json;[print(m['name']) for m in json.load(sys.stdin)['result'] if {p['property_id']:p['value'] for p in m.get('properties') or []}.get('lora')=='true' and {p['property_id']:p['value'] for p in m.get('properties') or []}.get('function_calling')=='true']"
   ```
3. Production moves off GLM. `gateway.ts` `DEFAULT_MODELS` is the single source of truth for that.
4. A prompted-tool lane is measured as good enough to be worth the trade in §5.

## 8. RECOMMENDED CHANGE TO `apps/worker/src/gateway.ts` — NOT APPLIED

A peer session owns `apps/worker/src`, so this is written up rather than edited. The comment block
above `DEFAULT_MODELS` (gateway.ts line 80-ish) currently says:

```
  // Product selection is translated in SessionDO: Apple always uses clay; Apple MAX uses
  // stone/rune. Qwen3 is the measured cheap lane for quick Q&A/small edits. GLM-5.3 Flash is the
  // MAX choice: 1.3M context, native multi-turn function calling, reasoning, and vision.
  // Neither is vision-capable, so visual critique deliberately remains on GLM-5.3 Flash.
```

Every sentence of that is now false. `gatewayModelFor` sends Apple to `stone`, not `clay`; qwen3 is
no longer any product lane's model; and "Neither is vision-capable" is a leftover from a two-model
split that no longer exists. Suggested replacement:

```
  // Product selection is translated in SessionDO by `gatewayModelFor`: Apple -> stone for every
  // mode; Apple MAX -> stone in Plan, otherwise its own mode key. BOTH product lanes therefore
  // serve @cf/zai-org/glm-5.3-flash today; the tiers differ by step limit and daily allowance,
  // not by model (see the measurement above gatewayModelFor: stone 11/12 @125 neurons vs clay
  // 1/12 @718). `clay` and `memory` remain configured but no product lane routes to clay.
  //
  // NO LORA HERE. glm-5.3-flash and qwen3-30b-a3b-fp8 both refuse `lora` at inference
  // (Workers AI error 5005, "does not support LoRA inference"). A locally trained adapter cannot
  // be applied to either. See docs/model-serving-reality.md before planning any training work
  // that assumes it will reach a customer.
```

---

## 9. RE-ASKED OF THE ACCOUNT ON 2026-09-21, BECAUSE A PLATFORM ANSWER EXPIRES

§7 says each of the four reversals is a single command. They were run again the day after this file
was written, before it was committed, so what lands in git is today's answer and not a transcript
of yesterday's. **Nothing moved.** Every figure below is output, not recollection.

**The finetunes this account holds** — `GET /accounts/{id}/ai/finetunes`, the row the work queue
asked for by name, because "a download, an alias or an edited model card is not evidence that
training occurred" and this endpoint is the account's own answer to what it actually holds:

```json
{ "success": true, "result": [
  { "id": "ddde8377-8a76-4240-b083-b9e59cd38031", "name": "apple-v4",
    "description": "Apple - Roblox/Luau adapter trained locally with MLX",
    "created_at": "2026-09-19 18:18:39.465", "model": "@cf/meta/llama-3.2-3b-instruct" },
  { "id": "fb2605c8-2b44-4296-9b94-d37e489ce183", "name": "apple-v3-probe",
    "description": "Apple - Roblox/Luau adapter trained locally with MLX",
    "created_at": "2026-09-19 17:38:31.445", "model": "@cf/meta/llama-3.2-3b-instruct" } ] }
```

Two adapters exist and are real. **Both are bound to `@cf/meta/llama-3.2-3b-instruct`, which no
product lane serves.** That is the whole of the serving-lineage question in one response: the
artifact is traceable, and the thing it traces to is not in front of a customer.

**The catalogue** — `GET /ai/models/search?per_page=200`: 65 models, exactly **9** with
`lora: true`, the same nine named in §3.1, character for character. `@cf/zai-org/glm-5.3-flash`
returns `context_window, function_calling, price, reasoning, reasoning_effort,
require_workers_paid, terms, vision` — still **no `lora` property**. `@cf/qwen/qwen3-30b-a3b-fp8`
returns `async_queue, context_window, function_calling, price, reasoning` — likewise none.

**The behaviour, with its control** — the same real adapter id sent to four models:

| Model | 2026-09-21 |
|---|---|
| `@cf/meta/llama-3.2-3b-instruct` (its own base) | **success: true**, `"How can I assist you today?"`, 46 total tokens, **0.4195 neurons** |
| `@cf/zai-org/glm-5.3-flash` | **5005** `LoRA unsupported: The model @cf/zai-org/glm-5.3-flash does not support LoRA inference` |
| `@cf/qwen/qwen3-30b-a3b-fp8` | **5005** `does not support LoRA inference` |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | **3030** `Lora not compatible with model.` |

The control is the row that matters and it is why the refusals are readable: the adapter loaded and
answered on its own base **today**, so the three refusals are about the models, not about a dead id,
a rotated token or a typo. Total spend for the whole re-verification: **0.42 neurons** — the three
refusals are rejected before generation and cost nothing.

**Status of this row, stated so it is not mistaken for pending work.** A traceable trained artifact
in the *serving* lineage is **platform-blocked**, not unfinished. Nothing in this repository, and no
amount of further training on this hardware, changes a 5005 from the vendor. The owner-authorised
route is the other one — expand what the served model knows at generation time — and that work is
measured in `docs/frontier-for-roblox.md`, not here.

---

## SOURCES

- `apps/worker/src/gateway.ts` lines 62–137 (`DEFAULT_MODELS`), 318–330 (provider/tool fallback)
- `apps/worker/src/do/session.ts` lines 451–478 (`gatewayModelFor` and its measurement comment)
- Live Cloudflare API, 2026-09-20: `GET /accounts/{id}/ai/models/search?per_page=200`
- Live Cloudflare API, 2026-09-20: `POST /accounts/{id}/ai/run/{model}` with a real finetune id — errors 5005 and 3030
- Live Cloudflare API, 2026-09-20: `GET /accounts/{id}/ai/finetunes` — 2 finetunes, both on `@cf/meta/llama-3.2-3b-instruct`
- Live Cloudflare API, **2026-09-21**: all three of the above re-run before this file was committed — §9. Same 9 LoRA models, same two finetunes, same 5005/3030 refusals, control still succeeds at 0.4195 neurons
- https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/ — limits, open beta
- https://developers.cloudflare.com/workers-ai/models/?capabilities=LoRA — LoRA-tagged model list
- https://developers.cloudflare.com/changelog/post/2025-04-11-new-models-faster-inference/ — the expansion that added 8 LoRA models
- https://docs.fireworks.ai/fine-tuning/deploying-loras — LoRA deploys to dedicated, not serverless
- `packages/training/runs/eval-v4-scored.json`, `packages/training/runs/eval-v4.json`
- `packages/training/src/serving-probe.sh`, `packages/training/src/upload_lora.sh`
- `docs/audit/INFERENCE-PROVIDERS.md` (2026-09-14) — the disjoint-sets finding, re-verified here
