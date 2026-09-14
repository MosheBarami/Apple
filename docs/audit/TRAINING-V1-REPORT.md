# Apple v1 — training report

**Verdict: NOT PROMOTED. `apple-v1` is a regression against its own base and must not be served.**

The mandate is explicit that a fine-tune must not be forced into production to satisfy a branding
deadline, and that an unrepaired one is reported as unresolved rather than shipped. This is that
report.

---

## 1. What was run

| | |
|---|---|
| Base | `mlx-community/Qwen3-4B-Instruct-2507-4bit` |
| Method | QLoRA, `fine_tune_type: lora`, rank 8, scale 16, dropout 0.05 |
| Target modules | `self_attn.{q,k,v,o}_proj`, 16 layers |
| Trainable params | 2.621 M / 4,022.468 M (**0.065 %**) |
| Optimiser / LR | adamw @ 1.0e-4, `mask_prompt: true` |
| Batch / seq | 4 / 1024 (corpus p99 = 931 tok) |
| Seed | 20260914 |
| Hardware | Apple M2 Pro, 32 GB unified, 19 GPU cores, MLX 0.32.2 / mlx-lm 0.31.3 |
| Throughput | ~100–116 tok/s, peak 23.55 GB |
| Config | `packages/training/lora-apple-v1.yaml` |
| Log | `packages/training/runs/apple-v1.log` |

Dataset: 404 examples (327 train / 39 val / 38 test), 77,020 train tokens, built by
`packages/training/src/build-dataset.mjs` from 37 MIT/Apache-2.0 repositories pinned by commit SHA
in `packages/corpus/raw/manifest.json`. Every response parsed under `luau-lsp` and screened by
`checkNoAntipattern` before admission. `Roblox/creator-docs` excluded — the registry marks CC-BY-4.0
as `training: forbidden`. Split is by whole repository; no repo spans splits.

## 2. What happened

### The run did not finish

It died at ~iter 120 of 250:

```
RuntimeError: [METAL] Command buffer execution failed: Impacting Interactivity
(0000000e:kIOGPUCommandBufferCallbackErrorImpactingInteractivity)
```

macOS's GPU watchdog killing long Metal command buffers under memory pressure (23.55 GB of 32 GB).
**The shell reported exit code 0** because the trainer was piped through `tee`; the exit status came
from `tee`, not from the trainer. Any future run must check the log, not the exit code.

### Overfitting began before iter 100

| iter | val loss | train loss |
|---:|---:|---:|
| 1 | **2.812** | — |
| 50 | **1.294** ← minimum | 1.396 |
| 100 | 1.318 ↑ | 1.056 |
| 120 | — | 0.994 |

Train loss falling while validation rises is memorisation of 327 examples. The best checkpoint is
`0000050_adapters.safetensors`; `adapters.safetensors` holds the worse iter-100 weights and is the
file a naive `--adapter-path adapters/apple-v1` would load. Preserved separately as
`adapters/apple-v1-best/`.

### Measured against the base, it is worse

Held-out, product-shaped prompts (n = 8 — small; the repetition and template figures are reported
as counts, not as a claimed percentage improvement):

| metric | base | apple-v1 (iter-50) |
|---|---:|---:|
| Luau syntax-valid | 5/8 | 5/8 — no gain |
| degenerate repetition | 1/8 | **3/8** |
| stray `<think>` tags | 0/8 | **8/8** |

Qualitatively, on the canonical door task the base produced a recognisable door script (services,
`TweenService`, a `ProximityPrompt`, an `OpenDoor` function). The tuned model emitted stray think
tags, referenced undefined `player`/`Door`, and looped producing seven identical
`Instance.new("Joint")` calls — a class that does not exist in Roblox.

## 3. Root causes

**A. Chat-template mismatch — confirmed, and the direct cause of the 8/8 `<think>` corruption.**
The tokenizer renders a *training* assistant turn as:

```
<|im_start|>assistant\n<think>\n\n</think>\n\nASSISTANT_REPLY<|im_end|>
```

while the *inference* prefix ends at `<|im_start|>assistant\n`. With `mask_prompt: true` the loss
covers the assistant span including the empty think block, so the adapter was explicitly trained to
emit `<think>\n\n</think>` before every answer — and it does, in every single output. Training
targets must be pre-rendered so the assistant span matches exactly what inference continues from.

**B. Task-distribution mismatch — the deeper problem.**
The dataset is `(library doc comment -> library-internal function)` harvested from ProfileService,
Nevermore and friends. The product task is `(user request for a game mechanic -> correct, verified
Roblox implementation)`. These are different distributions, and training on the first degrades the
second: the model learned to emit long chains of `Instance.new` and local helper scaffolding, which
is precisely the repetition failure observed. **No hyperparameter fixes a wrong task.**

**C. Too small and too narrow.** 327 training examples, 77k tokens, and the greedy split placed the
three highest-yield repositories in train — so the effective diversity is three codebases.

## 4. Repair plan

In dependency order. Nothing here is a hyperparameter sweep, because the problem is not hyperparameters.

1. **Fix the template.** Pre-render the training text rather than relying on `apply_chat_template`
   with a trailing assistant turn; assert byte-equality between the training assistant prefix and
   the inference prefix. Add a unit test that fails if they diverge.
2. **Rebuild the dataset in the product's shape.** `(request -> verified implementation)`, not
   `(docstring -> library internal)`. Two clean sources, both zero-marginal-cost and licence-safe:
   locally-synthesised requests over the licensed corpus, and — the higher-value one — **verified
   execution traces from Apple's own runs**, which we own outright and which carry tool calls,
   errors, repairs and evidence exactly as the mandate specifies.
3. **Verify every synthesised pair** through the existing `checkLuauSyntax` + `checkNoAntipattern`
   gates, which already work.
4. **Early stopping on validation loss**, since the minimum arrived at iter 50 of an intended 250.
5. **Lower memory pressure** (smaller batch, or gradient checkpointing) so the Metal watchdog does
   not kill the run, and check the log rather than the exit code.
6. Rank is now a **free parameter**. It was set to 8 to preserve Cloudflare's custom-LoRA path; that
   path does not exist for a Qwen base (Cloudflare accepts adapters only on `mistral`/`gemma`/`llama`
   bases), so the constraint bought nothing and should not be inherited.

## 5. What this does and does not establish

**Established.** The pipeline is real and reproducible end-to-end: licence-gated corpus → verified
dataset → LoRA training on local hardware → checkpointed artifact → held-out evaluation against the
base. It produced a genuine trained artifact with a recorded config, seed, loss curve and hash
(`adapters.safetensors`, sha256 `9d70db6c8ad5004b9c0311e294771afb…`). Training on this hardware at
zero recurring cost is demonstrated, not assumed.

**Not established.** That fine-tuning improves Apple. On the evidence it currently harms it. The
mandate's requirement of *a real trained artifact in the serving lineage of each shipped mode*
is therefore **UNMET**, deliberately and visibly, pending the repair above — rather than satisfied
by promoting a model that measures worse than the one it replaces.
