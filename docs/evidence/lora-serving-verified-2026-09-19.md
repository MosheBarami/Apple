# A trained adapter reaches production inference — observed, 2026-09-19

w22 asks for "a saved model with verified serving". Until today nothing on this account had ever
been served. `wrangler ai finetune list` answered **"No finetune assets found."** — so the
conversion and upload path in `packages/training/src/{mlx_to_peft.py,upload_lora.sh}`, however
carefully written, had never completed once. "A trained artifact is in the serving lineage" was
an intention, which is what `upload_lora.sh`'s own header says it exists to stop being.

It has now completed, and the completion was checked rather than assumed.

## The claim that was not established

`lora-apple-v3.yaml` says it targets `@cf/meta/llama-3.2-3b-instruct` "which the live account
lists as LoRA-capable". Being in the account's catalogue and being LoRA-capable are two different
facts, and the sources disagreed:

| source | says |
|---|---|
| the model's own doc page | badge "LoRA", and a table row `LoRA \| Yes` |
| the models index listing | `Cloudflare-hosted` only — no LoRA badge, while `llama-3.2-11b-vision-instruct` in the same listing carries one |
| the 2025-04-11 "Expanded LoRA support" changelog | does not list it |
| the `lora` input parameter on its API page | **proves nothing** — the same parameter appears on `granite-4.0-h-micro` and `llama-3.2-1b-instruct`, which are not on any LoRA list. It is a shared request schema, not a capability |

So the config's claim rested on one badge contradicted by two other Cloudflare sources. That is
not a fact to build a training programme on.

`wrangler ai finetune create` validates the folder locally *before* it calls the API, so probing
with a bogus model name teaches nothing — the question could only be settled by uploading a real
adapter.

## What was done

The v3 adapter already existed (`packages/training/adapters/apple-v3-llama`, trained 2026-09-14,
rank 8, 16 layers, q/k/v/o projections). Quality is irrelevant to this question — the probe asks
whether a LoRA can be served on this base *at all*, and a poorly-trained adapter answers that
exactly as well as a good one.

```
.venv/bin/python src/mlx_to_peft.py adapters/apple-v3-llama <out> --base meta-llama/Llama-3.2-3B-Instruct
  verified delta-W equivalence on 64 projection(s), max relative error < 1e-5
  wrote 128 tensors, rank 8, alpha 128.0, targets ['k_proj', 'o_proj', 'q_proj', 'v_proj']
  adapter_model.safetensors: 10.5 MB — within Cloudflare's limits (rank <= 32, < 300MB)

bash src/upload_lora.sh <out> "@cf/meta/llama-3.2-3b-instruct" "apple-v3-probe"
  id: fb2605c8-2b44-4296-9b94-d37e489ce183
```

## The three observations, and why each was needed

Upload acceptance is not serving. `upload_lora.sh` warns in its own header that a wrongly-named
file "is accepted by the upload and then ignored at serve time". So a `success: true` on
inference proves nothing on its own either — it is equally what you get when the adapter is
silently dropped and the base answers.

**1. The base and the adapter disagree.** Same prompt, `temperature: 0`, `seed: 7`:

- base: `The cooldown is 5 seconds.\n```\nfunction LuauLuaFunction() {\n  return true;\n}`
- lora: `Returns false otherwise.\n\n```lua\nfunction Luau:Cooldown(cooldown, elapsed)\n\t-- Check if the cooldown has elapsed\n\t...`

**2. That difference is not noise.** The base was run twice at the same settings and the response
hashed identically (`2b11f74b36ef6a28`) both times. The endpoint is deterministic here, so a
differing output is a differing model.

**3. The `lora` field is genuinely resolved, not decorative.** A well-formed but non-existent id
is refused:

```
"lora": "00000000-0000-0000-0000-000000000000"
  -> success: false, code 5033, "Finetune not found: ... does not exist or is not accessible"
```

Without this, "the output changed" would still leave open that the parameter is ignored and
something else moved. It is not ignored; an unknown id is an error, so a known id is loaded.

## Settled

**`@cf/meta/llama-3.2-3b-instruct` serves custom LoRA adapters, and the whole path — MLX training
on the M2 Pro, PEFT conversion, Workers AI upload, served inference — works end to end.** Every
downstream hour spent on training data can reach a paying customer. That was the open question,
and it is closed.

## What this does NOT establish, said plainly

- **Nothing about quality.** The adapter served here is the one trained on the defective dataset,
  and the probe output shows the defect directly: it emitted an empty function body followed by
  `Write the corre...` — it learned the harvested dataset's instruction scaffolding (every row
  ends `\n\nWrite the Luau implementation.`) instead of learning to write Luau. The base at least
  attempted a body. **This adapter is worse than the base at the product's job**, which is an
  argument for fixing the data, not for shipping this.
- **It is not wired into the product.** The gateway routes to GLM and Qwen3, neither of which is
  LoRA-capable. Serving a specialised adapter means adding a lane, not swapping the main one, and
  that decision is not made here.
- **One base, not the family.** This says `llama-3.2-3b-instruct` serves adapters and says nothing
  about its siblings. Written before the capability map below was measured — which then answered
  it: `llama-3.2-1b-instruct` returns 5005, so the family shares a name and not the capability.

## Reproduce

```bash
npx wrangler ai finetune list     # apple-v3-probe / fb2605c8-2b44-4296-9b94-d37e489ce183
```

Inference probe: `packages/training/src/serving-probe.sh` (credentials from the git-ignored
`.env`; nothing secret is recorded in this file).

---

# Which models actually serve LoRAs — asked of the API, 2026-09-19

Falsifying the probe's negative branch turned up a better instrument than any badge. Pointing the
3B adapter at `llama-3.2-1b-instruct` produced:

```
code 5005 — "AiError: LoRA unsupported: The model @cf/meta/llama-3.2-1b-instruct does not
             support LoRA inference"
```

Cloudflare answers the capability question directly. So it was asked of every model that matters
here, with a real adapter id and `max_tokens: 1`. Three distinct codes carry three distinct
facts, and conflating them is how the earlier badge-reading went wrong:

| model | result | means |
|---|---|---|
| `@cf/zai-org/glm-4.7-flash` | **5005 LoRA unsupported** | no LoRA, ever |
| `@cf/zai-org/glm-5.3-flash` | **5005 LoRA unsupported** | no LoRA, ever |
| `@cf/qwen/qwen3-30b-a3b-fp8` | **5005 LoRA unsupported** | no LoRA, ever |
| `@cf/meta/llama-3.2-1b-instruct` | **5005 LoRA unsupported** | no LoRA, ever |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | **5005 LoRA unsupported** | no LoRA, ever |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | **3030 Lora not compatible with model** | supports LoRA; this 3B-shaped adapter does not fit it |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | **5007 No such model** | in `wrangler ai models`, not on the run endpoint |
| `@cf/meta/llama-3.2-3b-instruct` | **success** | serves this adapter |

`3030` is not `5005`. A model that refuses *this* adapter for shape is a model that would accept
a correctly-shaped one; a model that says "does not support LoRA inference" would refuse every
adapter ever built. Reading both as "it failed" would have thrown away the only other viable
base.

## What this settles for w22

1. **The product's three live models cannot serve a specialised adapter.** `stone`, `rune` and
   `vision` route to GLM; `clay` and `memory` route to Qwen3. All three are 5005. So a trained
   Apple model can never *replace* the main lane — it can only be an added lane, chosen for the
   requests it is actually better at. Any plan that assumed otherwise was wrong about the
   platform.
2. **Two bases can serve one.** `llama-3.2-3b-instruct` (proven above, with an adapter live right
   now) and `qwen2.5-coder-32b-instruct` (capability confirmed by 3030). The 32B is a *code*
   model and therefore the better target on the merits — but a 32B LoRA is not something an M2
   Pro 32GB trains comfortably, so 3B remains the practical path until that trade is made
   deliberately.
3. **The published LoRA list is stale for this account.** Cloudflare's 2025-04-11 changelog names
   `mistral-small-3.1-24b-instruct` and `llama-3.3-70b-instruct-fp8-fast` as LoRA-capable. The API
   says 5005 and 5007. Documentation is not observation — including Cloudflare's own, and
   including when it agrees with what you hoped.

Reproduce with `packages/training/src/serving-probe.sh`, or for a bare capability answer, one
inference call carrying a known-good `lora` id and `max_tokens: 1`.
