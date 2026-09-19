# Apple MAX foundation decision — 2026-09-18

## Decision

Use **official `Qwen/Qwen2.5-Coder-32B-Instruct`** as the next Apple MAX foundation
candidate. Do not download or train it yet. The next authorized action should be one bounded,
base-only run of the current Roblox evaluation through the product's existing Workers AI gateway.
That run can reject a weak foundation before more data, a local 18.4 GB download, or a training job
is justified.

This is the candidate with the shortest honest path from a materially stronger code foundation to
the serving route Apple already operates:

- official Apache-2.0 weights rather than an ambiguously licensed community derivative;
- a pinned MLX-community 4-bit conversion of the official weights that is small enough to attempt
  on this 32 GiB Mac;
- explicit LoRA support on Cloudflare's model page;
- an existing `env.AI.run` provider adapter, gateway budget gate, model price row, and admin
  evaluation route in this repository;
- a prior 56-task result of 94.3% and 100% Luau-correctness, which is useful selection evidence but
  is not reusable as a current score because both the task set and grader have changed.

Passing the proposed base gate would mean only **foundation eligible for the next local capacity
probe and data build**. It would not make the base, an adapter, or the product Apple MAX. Promotion
still requires a separately held-out model evaluation, real Studio/agent runs, serving validation,
and owner review.

No model was downloaded, loaded, sampled, trained, uploaded, or served during this decision pass.
No model-inference or paid provider job ran and the spend ledger was not changed.

## Why the 4B path is closed

The v4 experiment is reproducible and rejected:

- base: cached `mlx-community/Qwen3-4B-Instruct-2507-4bit`, revision
  `50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b`;
- actual offline training: 20 train rows, 20 iterations, rank 8 LoRA;
- adapter replay: 5/5 exact;
- executable behavior: 1/5 before and 1/5 after;
- preserved development families: 0/3 after;
- new transfer families: 1/2 after;
- observed failures: infinite helper recursion, a load/index mix-up producing `nil < nil`, a
  generation cut at exactly 1,600 tokens, and invalid-element acceptance.

Loss fell and the saved adapter reloaded correctly. Those facts isolate the problem away from a
missing adapter or a broken save/reload path. The 4B base did not express the required algorithms
reliably, and one tiny synthetic curriculum did not change that. Repeating the same foundation with
more iterations would repeat an experiment already falsified twice.

Source: `docs/evidence/apple-max-experiment-followthrough-2026-09-18.md`.

## Measured machine and runtime

Read-only inspection on the owner's Mac produced:

| Item | Measured value |
| --- | ---: |
| Unified memory | 34,359,738,368 bytes / 32 GiB |
| Free filesystem space | 145,059,400 KiB / about 138.3 GiB |
| Hugging Face cache | 8.1 GiB |
| `mlx` | 0.32.2 |
| `mlx-lm` | 0.31.3 |
| `transformers` | 5.17.0 |
| `huggingface-hub` | 1.31.0 |
| `safetensors` | 0.8.0 |

Only two foundations are cached:

| Cached repository | Revision | Unique cache bytes |
| --- | --- | ---: |
| `mlx-community/Qwen3-4B-Instruct-2507-4bit` | `50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b` | 2,278,972,236 |
| `unsloth/Llama-3.2-3B-Instruct` | `006f5dcd1393c3add266de40994ba96225e9689d` | 6,442,819,961 |

No Qwen Coder model is cached. The installed MLX runtime contains implementations for `qwen2` and
`qwen3_moe`. Its LoRA conversion accepts ordinary and quantized linear layers plus ordinary and
quantized switch-expert layers. That establishes software support for both official candidates. It
does not establish that a 32B dense LoRA training step fits in 32 GiB, how much swap it would use,
or how quickly it would train.

The 18.43 GB Qwen2.5 quant leaves roughly 13.6 GiB before accounting for macOS, activations, the KV
cache, gradients, optimizer state, tokenizer state, and the rest of the application. Local
inference is plausible from weight size; local training remains an unmeasured capacity question.
It must be answered with a bounded memory probe only after the base passes and the download is
approved.

## Candidate audit

Public metadata was read without authentication from the Hugging Face model API on 2026-09-18.
The sizes below are the sum of published weight blobs, not estimates from parameter count.

| Candidate | Public revision and license | Local artifact | Serving fact | Decision |
| --- | --- | ---: | --- | --- |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | `381fc969f78efac66bc87ff7ddeadb7e73c218a7`, Apache-2.0; 65,527,841,688 bytes BF16 | `mlx-community/Qwen2.5-Coder-32B-Instruct-4bit`, revision `d1e3b690c8e225d7795bccddf971ca6be68b2012`, 18,431,478,459 bytes | Cloudflare advertises `@cf/qwen/qwen2.5-coder-32b-instruct` as hosted and LoRA-capable | **Recommended base gate** |
| `Qwen/Qwen3-Coder-30B-A3B-Instruct` | `b2cff646eb4bb1d68355c01b18ae02e7cf42d120`, Apache-2.0; 61,066,575,656 bytes BF16 | `mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`, revision `6e302ea604ad9ab206367e2c501d1571023e7b6d`, 17,181,071,994 bytes | Cloudflare hosts generic `qwen3-30b-a3b-fp8`, but its page has no LoRA capability and it is not the Coder foundation | Keep as a local research alternative, not the production foundation |
| `bostonstrong567/Luau-Qwen3-Coder-30B-A3B` | `8ef576104161f0c9608e860150fc2f308c754324`, top-level license `other` | 137,553,594,952 bytes of safetensors plus 163,211,184,896 bytes of GGUFs; IQ4_XS 16,557,094,848 bytes and Q4_K_M 18,556,688,320 bytes | No Cloudflare-hosted base/adapter path | Reject |

The Qwen3-Coder official model is a serious local candidate: it is Apache-2.0, its MoE architecture
has 30.5B total parameters and about 3.3B active parameters per token, and this MLX build supports
its quantized switch layers. It is not the recommendation because the current product does not
have a matching hosted LoRA base. Serving it from a developer Mac or adding an unrelated GPU
service would create a different operations path from the one the product already measures and
budgets.

### Why the previously chosen Luau repository is rejected

The model card's claims are useful leads, not quality or licence proof. It says the adapter used
28,005 examples, rank 96 / alpha 192, an H200 140 GB GPU for about nine hours, and a mixture of
GitHub, reasoning, and synthetic data. It also says Studio plugins and packages were not extensively
tested. The repository metadata says `license: other`; the Apache licence of its base does not
automatically grant clear rights for the derivative data and adapter.

Its base is `huihui-ai/Huihui-Qwen3-Coder-30B-A3B-Instruct-abliterated`, revision
`b84c58d52ac44041774fe9542e1943e4d971b5f4`. The deliberate refusal-removal step changes product
safety behavior without producing Roblox-engine evidence. The card supplies no first-party Studio
playtest, held-out engine benchmark, contamination audit, or provenance adequate for the repository's
training standard.

Rank 96 is also outside Cloudflare's published maximum of 32. Its tags `luau`, `roblox`, `lora`, and
`fine-tuned` establish discoverability, not executable competence. Downloading it would consume
16.6–18.6 GB for a practical quant before answering any of these questions, so it is not the next
substantive step.

## Serving path: advertised, but not yet proven end to end

The candidate reuses the real product route:

1. `packages/evals/src/run.mjs` calls authenticated `POST /api/admin/model-test`.
2. That route calls `llmChat` in `apps/worker/src/gateway.ts`.
3. The Workers AI adapter calls `env.AI.run`.
4. `apps/worker/src/pricing.ts` already contains the current Qwen2.5 Coder price:
   $0.66/M input and $1.00/M output.
5. The gateway reserves pessimistically before invocation and settles measured usage after it.

Cloudflare's current model page explicitly marks
`@cf/qwen/qwen2.5-coder-32b-instruct` as **LoRA: Yes**, with a 32,768-token context. Its current
LoRA documentation says adapters are open beta, free during the beta period, limited to supported
bases, rank 8 or up to 32, less than 300 MB, and the exact filenames
`adapter_config.json` / `adapter_model.safetensors`.

There are two unresolved compatibility facts before any upload can be called ready:

- `packages/training/src/mlx_to_peft.py` proves matrix orientation and scale, enforces rank and size,
  and emits the two filenames, but it does **not** emit `model_type`. Cloudflare's current upload
  documentation requires that field and lists only `mistral`, `gemma`, or `llama`. The accompanying
  converter test does not assert it. The correct value for the advertised Qwen2.5 LoRA route must be
  established from a compatible Cloudflare example or a guarded account-side validation; guessing
  would recreate the silent-load failure this converter was written to prevent.
- Cloudflare's limitation text says supported LoRA models must not be quantized. The local candidate
  is a 4-bit training copy of the official base. A QLoRA adapter normally targets the corresponding
  full base, but that general fact is not proof that Cloudflare accepts this exact conversion.
  Compatibility must be demonstrated after training and before routing any product call to it.

The advertised route is strong enough to select the foundation. These two facts prevent a claim
that serving is already complete.

## The next action: one base-only rejection run

After the main agent reviews and authorizes the proposal, add a temporary diagnostic model key that
does not change `clay`, `stone`, `rune`, `memory`, or `vision`:

```ts
appleMaxBase: {
  id: '@cf/qwen/qwen2.5-coder-32b-instruct',
  nativeTools: false,
  maxTokens: 2400,
  ctx: 32768,
  temperature: 0.2,
}
```

Then run the current complete suite once through `/api/admin/model-test`, with no RAG and no second
attempt. Two small controls are required before it starts:

- `packages/evals/src/transport.mjs` currently omits `maxTokens`, so the endpoint silently uses its
  1,600-token default even when the temporary model config allows 2,400. The bounded run must send
  `maxTokens: 2400` explicitly.
- `packages/evals/src/run.mjs` currently retries a retryable transport failure once and discards the
  provider finish reason. The bounded run must attempt once, retain `finishReason`, and reject a
  `length` finish rather than scoring a truncated answer as model behavior.

This can be a small reviewed option on the existing runner or an equivalent one-shot invocation of
the same route. It is not a new evaluation framework. A partial run after the daily budget is
exhausted is not a model baseline.

### Current suite identity before the bounded-run control

At inspection time:

- 88 tasks in 13 JSON files;
- 165 total task weight;
- four scripting categories carry 89 weight / 53.9%;
- task-bundle SHA-256:
  `ca57b588f6601aee74d6cd0165d0a3a32ad6d83c02f087098f92a4d6b23221b8`;
- runner SHA-256:
  `9b0d783f5e1414893c80efc19490013e5cf68042c013b6e20755ea34ccef8f76`;
- grader SHA-256:
  `de703323c352221abcca786d429e93f0a1d9a613d5514def7fd3cd82fece9a16`;
- metrics SHA-256:
  `39d78a17bb2762fc43a0604badb53261ed98f34aab8d8e0edf1cc7c3d6339978`;
- transport SHA-256:
  `2a27e9708439c494ebc205d810479448aef819f2940087fd271623e14410c0a9`.

The task-bundle hash is the content to freeze. If the existing runner and transport receive the
bounded controls above, the run must record their new hashes and the effective values
`maxTokens=2400`, `attempts=1`.

`node packages/evals/src/selftest.mjs` passed, including all 88 tasks and a real local Luau checker.
`node --test packages/evals/src/scripting-curriculum.test.mjs` passed 39/39.

The older docs that say 56 or 84 tasks describe earlier points in time. They must not be used as the
denominator for this run.

### Rejection criteria registered before inference

Reject the base and do not download/train it if any of these fail:

1. exactly 88/88 jobs return a gradable first-attempt result with the expected model id;
2. overall weighted check score is at least 90%;
3. the combined four-category scripting weighted score is at least 85%, and no scripting category
   is below 75%;
4. build validity is 100% for every available `luau_syntax` check;
5. every executed `no_antipattern` security check passes;
6. no response finishes with provider reason `length`;
7. the result records actual usage/settled neurons and no task is silently excluded from the mean.

These are weak-foundation rejection thresholds, not a promotion benchmark. The 90% floor is below
the older model's 94.3% result to allow for the expanded, harder suite and the prior measured
approximately two-point run variance. A pass says the base is worth the next experiment. It does not
measure multi-turn repair, full-game architecture, visual quality, Studio execution, or live tool use.

### Hard proposed budget

The current 88 message bodies total 58,865 characters and no current task requests a tool schema.
The gateway applies `ceil(chars / 3.5)` and neuron rounding separately to each request. Summed across
the 88 calls, that gives 16,864 reserved input tokens. At 2,400 output tokens per task, the absolute
requested output ceiling is 211,200 tokens.

At the published Qwen2.5 price, one attempt reserves approximately:

```text
input  :  16,864 × $0.66/M = $0.01113024
output : 211,200 × $1.00/M = $0.21120000
raw USD:                         $0.22233024
reserved after per-call rounding: 20,258 neurons / $0.222838
```

Reserve **$0.25** before the run and refuse to start unless the product budget has enough daily
capacity for the complete 20,258-neuron estimate. The present training ledger has $19.94 unallocated;
the proposed reservation would leave $19.69. It was not made in this pass. Actual settled usage will
normally be lower because most answers stop before 2,400 tokens.

The largest individual reservation in the current suite is 258 neurons, below the gateway's
1,200-neuron per-request ceiling. The full-suite daily reservation, rather than an individual task,
is the limiting budget check.

The 2,400-token ceiling is deliberate. The failed v4 experiment already showed a valid UI task cut
mid-condition at 1,600 tokens. Reusing that ceiling would risk classifying output-budget truncation as
foundation weakness. The single-attempt rule keeps the proposed run below the 25,000-neuron daily
product ceiling; the current two-attempt runner could reserve about $0.446 / 40,516 neurons at this
output limit and would exceed that daily ceiling if every task retried.

## Dataset expansion after a base pass

The next dataset should come from first-party build and repair trajectories that have executable and
Studio evidence. It should not be a larger pile of isolated synthetic functions.

The repository already has one real source pattern in `apps/benchmark/crystal-canyon`:

- an original multi-file Roblox experience and architecture contract;
- executable local specs against shipping Luau;
- named semantic mutations that the specs kill;
- Studio playtests recording boot, HUD construction, collection/sale arithmetic, server refusal
  paths, a 40-request purchase race, live UI input, state readback, and zero application errors;
- recorded defects, repairs, and a second playtest after the repair.

Turn that pattern into training units at the trajectory level:

```text
brief + existing project state
→ plan/tool decisions
→ multi-file Luau/UI/world change
→ executable checks and mutation result
→ Studio playtest observation
→ repair, when the first attempt fails
→ final verified state
```

Split by whole experience and capability family before extracting rows. A mechanic, its near-duplicate
repair, and its test must stay in one split. Current evaluation prompts, reference answers, RobloxQA
gate rows, v4 held-outs, and future promotion experiences remain outside training.

Genre coverage should be earned by independently verified experiences across the product's intended
range: simulator/tycoon, obby/platformer, round-based PvP, survival/horror, tower defense, social or
roleplay, story/adventure, and UI-heavy management. Each experience should exercise server authority,
persistence/failure behavior, mobile/controller input, multi-file changes, responsive UI, and visual
construction where relevant. A large row count created by paraphrasing one mechanic is not coverage.

The large genre-aware low-poly/UI knowledge base should remain split by purpose:

- SFT trajectories teach the model how to plan, build, inspect, and repair;
- the current Roblox documentation corpus supplies current APIs through retrieval;
- first-party art-direction, low-poly assembly, responsive-UI, and genre-pattern documents expand the
  corpus with verified examples;
- the licensed asset library stays a provenance-aware tool source rather than being memorized into
  weights.

This keeps fast-changing API and asset facts updateable while the adapter learns stable behavior.

## Conditional path after the base gate

Only after a pass and separate approval:

1. reserve disk and download the exact 18,431,478,459-byte MLX revision;
2. run an offline load plus short deterministic generation while recording peak MLX memory and swap;
3. if that fits, run a one-step disposable rank-8 LoRA memory probe with no retained adapter;
4. build the first engine-validated trajectory dataset with whole-family splits;
5. preregister one bounded training configuration and independent evaluation before training;
6. repair and test the PEFT/Cloudflare configuration contract before any adapter upload;
7. upload and route only after executable quality, conversion equivalence, provider loading, and
   the real product path all pass.

If the dense 32B memory probe does not fit, that result should trigger a new foundation decision or a
separately priced remote-LoRA proposal. No claim is made here that a 32B paid training job fits inside
the remaining budget; current GPU time, data volume, sequence length, and training steps have not been
priced or measured.

## Primary external sources checked

- `https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct`
- `https://huggingface.co/mlx-community/Qwen2.5-Coder-32B-Instruct-4bit`
- `https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct`
- `https://huggingface.co/mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit`
- `https://huggingface.co/bostonstrong567/Luau-Qwen3-Coder-30B-A3B`
- `https://huggingface.co/huihui-ai/Huihui-Qwen3-Coder-30B-A3B-Instruct-abliterated`
- `https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/`
- `https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/`
- `https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/`

Repository evidence checked:

- `docs/evidence/apple-max-experiment-followthrough-2026-09-18.md`
- `docs/evidence/apple-max-next-step-2026-09-18.md`
- `docs/evidence/local-model-failure-audit-2026-09-18.md`
- `docs/evidence/local-model-iteration-ablation-2026-09-18.md`
- `docs/evals/FINDINGS.md`
- `docs/SCRIPTING-CURRICULUM.md`
- `apps/benchmark/crystal-canyon/evidence/PLAYTEST-01.md`
- `apps/benchmark/crystal-canyon/tests/mutation-check.mjs`
- `apps/worker/src/gateway.ts`
- `apps/worker/src/providers/workers-ai.ts`
- `apps/worker/src/pricing.ts`
- `packages/training/src/mlx_to_peft.py`
- `packages/training/src/mlx-to-peft.test.mjs`

## Scope and validation

This pass added only this evidence file. It intentionally did not add another candidate-audit tool:
the decisive facts already come from primary model APIs, installed runtime source, the current eval
suite, and the actual provider route. A new framework would add maintenance without improving the
decision.

All existing curricula, diagnostics, adapters, cached weights, holdout assignments, and the spend
ledger remained unchanged.
