# Apple model selection and serving followthrough — 2026-09-18

## Current serving decision

The current product-model decision is:

| Product route | Workers AI model | Context | Role |
| --- | --- | ---: | --- |
| Apple | `@cf/qwen/qwen3-30b-a3b-fp8` | 32,768 | limited free product model |
| Apple MAX | `@cf/zai-org/glm-4.7-flash` | 131,072 | paid product model |
| internal vision critic | `@cf/zai-org/glm-5.3-flash` | 1,310,720 | image-capable specialist only |

The owner explicitly corrected Apple MAX to GLM-4.7-Flash and delegated the Apple choice; the
current integration uses Qwen3-30B-A3B-FP8 for Apple. This is a **serving choice**, not evidence that
either model was custom-trained for Apple.

No provider call, spend reservation, config write, deployment, model download, training job, or
adapter upload was made while implementing this decision.

## ProductModel selects the foundation

The public `ProductModel` axis and the legacy autonomy/specialist axis remain independent.
`SessionDO` first admits and persists `apple` or `apple-max`, then its existing
`gatewayModelFor(mode, productModel)` translation selects the gateway lane.

An executable local integration test now drives the real bundled `SessionDO` through a real
`alarm()` step and the real gateway, while replacing only `env.AI.run` with a local recorder.
The model id that would have reached Workers AI is:

| Account/product choice | Autonomy mode | Observed provider model id |
| --- | --- | --- |
| free Apple | `clay` / Plan | `@cf/qwen/qwen3-30b-a3b-fp8` |
| free Apple | `stone` / Agent | `@cf/qwen/qwen3-30b-a3b-fp8` |
| paid Apple MAX | `clay` / Plan | `@cf/zai-org/glm-4.7-flash` |
| paid Apple MAX | `stone` / Agent | `@cf/zai-org/glm-4.7-flash` |

A free account requesting Apple MAX in either Plan or Agent is refused before any `AI.run`.
Therefore choosing a stronger autonomy mode cannot silently upgrade Apple to MAX, and choosing Plan
cannot silently downgrade paid MAX to Apple.

The internal `vision` key remains GLM-5.3-Flash because both selected product text models are
non-vision models. Product-model selection does not weaken the existing visual critic.

## Provider facts and conservative pricing

Cloudflare primary documentation checked on 2026-09-18 reports:

- Qwen3-30B-A3B-FP8 is Cloudflare-hosted, supports function calling and reasoning, has a
  32,768-token context window, and its model page lists $0.0509/M input and $0.335/M output.
- GLM-4.7-Flash is Cloudflare-hosted, supports reasoning and multi-turn function calling, has a
  131,072-token context window, and its model page lists $0.0605/M input and $0.40/M output.
- GLM-4.7's request schema documents `reasoning_effort: low | medium | high`. The Workers AI
  adapter therefore emits that field only for GLM model ids. Qwen receives no invented effort field.

Primary sources:

- https://developers.cloudflare.com/ai/models/%40cf/qwen/qwen3-30b-a3b-fp8/
- https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-02-13-glm-4.7-flash-workers-ai/

There is a small rounding disagreement between Cloudflare's current model pages and its pricing
table. The Qwen model page says $0.0509/M input while the pricing table says $0.051/M; GLM-4.7's
model page says $0.0605/M while the pricing table says $0.060/M. The spend boundary deliberately
uses the **higher** primary-source value in each case:

```text
Qwen3 input     $0.0510/M
Qwen3 output    $0.3350/M
GLM-4.7 input   $0.0605/M
GLM-4.7 output  $0.4000/M
```

That direction can slightly over-reserve and cannot under-reserve because of source-page rounding.

The provider catalogue marks the maximum output limit as unverified for both selected text models:
Cloudflare documents Qwen's `max_tokens` default of 2,000 and documents the GLM completion-token
parameter, but the inspected pages do not publish a separate hard maximum. Product ceilings remain
configuration values rather than being presented as provider facts.

## Why Qwen is limited to Apple

The repository has one older 56-task comparison in `docs/evals/FINDINGS.md`. It measured Qwen3 at
88.2% overall, with weaker API-knowledge and UI-implementation scores than the stronger builder
candidate used in that historical comparison. That result is old and is **not** reused as a current
88-task score.

It is still relevant to scope: Apple is already limited to at most three agent steps and a
2,000-token per-step ceiling, while Apple MAX carries the longer builder/autonomy budgets. The new
88-task dual-foundation measurement below is required before claiming current comparative quality.

## Qwen2.5 Apple MAX gate is historical now

`docs/evidence/apple-max-foundation-decision-2026-09-18.md`,
`docs/evidence/apple-max-base-gate-2026-09-18.md`, and
`docs/evidence/apple-max-base-gate-followthrough-2026-09-18.md` record the earlier
Qwen2.5-Coder-32B foundation investigation.

Those files and the frozen gate code are retained as historical evidence. The owner's later explicit
serving correction supersedes Qwen2.5 as the **current Apple MAX serving candidate**. The old gate
must not now be run and described as deciding the current serving model. No historical task bytes,
thresholds, or gate constants were rewritten to manufacture continuity between two different
decisions.

This supersession also does not authorize a custom-training claim. No current Apple or Apple MAX
custom-trained weights exist as a completed product artifact.

## Prepared 88-task measurement — not run

The current task bundle is unchanged:

```text
88 tasks
165 total task weight
task bundle SHA-256:
a1d0b5d260cc466ea4c57d6eff04b438531a9aa0793e6c2523373dd1ed758835
```

The measurement uses the existing harness only:

- both selected foundations in one run through gateway keys `clay,stone`;
- all 88 tasks for each model = 176 jobs;
- no RAG;
- one attempt;
- identical explicit `maxTokens=2000`;
- no category filter or task limit.

Two thousand tokens is deliberate. It is the current Apple gateway ceiling and Qwen's documented
default. Using 2,400 would be silently clamped to 2,000 on Apple while MAX received the larger
request, making the comparison look symmetric when it was not. A 2,000-token comparison may expose
truncation on difficult tasks; that is a measured result, not a reason to hide or retry it.

The exact prepared invocation is:

```bash
node packages/evals/src/run.mjs \
  --models clay,stone \
  --max-tokens 2000 \
  --one-attempt \
  --tag apple-selected-foundations-2026-09-18
```

`API_BASE` and `ADMIN_KEY` must point at the freshly verified Apple deployment. Before spending,
main must read the effective model map and product spend state and require:

```text
clay.id  == @cf/qwen/qwen3-30b-a3b-fp8
stone.id == @cf/zai-org/glm-4.7-flash
kill switch == false
availableToday >= 12,025 neurons
per-request ceiling >= 77 neurons
```

No config write is part of this measurement.

### Pessimistic reservation

The current 88 task requests plus the admin route's default system message contain 58,865 input
characters per model, conservatively 16,864 input tokens. With 2,000 output tokens reserved for
every task and per-request neuron rounding:

| Route | Jobs | Pessimistic neurons | USD equivalent | Largest request |
| --- | ---: | ---: | ---: | ---: |
| Apple / Qwen3 | 88 | 5,479 | $0.060269 | 64 |
| Apple MAX / GLM-4.7 | 88 | 6,546 | $0.072006 | 77 |
| **Combined** | **176** | **12,025** | **$0.132275** | **77** |

The source hard ceiling is 25,000 neurons/day and 1,200 neurons/request, so the complete pessimistic
run fits both ceilings when a fresh live read shows at least 12,025 neurons still available.

The canonical local workflow ledger was re-read before any reservation:

```text
$20.00 cap
$0.06 already allocated
$19.94 available
```

After the live preflight and explicit main greenlight, one **$0.15** local reservation covers the
$0.132275 pessimistic estimate and remains below the owner's $0.25 ceiling for this measurement:

```bash
node --input-type=module - <<'NODE'
import { reserveSpend } from './packages/training/src/spend-ledger.mjs';

console.log(reserveSpend('./packages/training/data/spend-budget-2026-09-18.json', {
  id: 'evaluation:apple-selected-foundations-2026-09-18',
  usd: 0.15,
}));
NODE
```

That reservation has **not** been taken. The ledger has no automatic refund path; an uncertain
started run must not be made free by deleting its audit reservation.

## Honest result collection

The 88-task bundle currently contains:

```text
0 tasks with expectTools
56 tasks with luau_syntax checks
29 tasks with no_antipattern checks
```

Therefore this run can measure answer quality, generated Luau syntax, anti-pattern checks, provider
finish reasons, usage, and settled neurons. It **cannot measure real model tool-call selection or
multi-turn tool execution**, because no task in this bundle asks for an actual tool call. The
offline provider test proves only that GLM-4.7 tool calls survive the adapter wire format; it is not
a model-quality result.

After the run, collect a response-free summary with the run's `runMeta`, aggregate scores, per-model
model-id mismatches, missing/length finish reasons, graded/ungraded counts, usage-missing counts,
settled neurons, executed/passed `luau_syntax` checks, and executed/passed `no_antipattern` checks.
Do not copy `responsePreview` or raw provider bodies into the evidence.

A `length` response remains stored as incomplete and ungraded by the current runner. Missing finish
reason, model-id mismatch, missing usage, or an incomplete denominator must be reported next to any
quality mean rather than being silently converted to a zero or omitted from the narrative. Do not
replace a truncated/failed job and do not retry it under this one-attempt measurement.

## Offline validation

At evidence time:

```text
node --test apps/worker/tests/product-model-entitlement.test.mjs
7/7 pass

node --test packages/evals/src/providers.test.mjs
38/38 pass

node --test apps/worker/tests/gateway-finish-reason.test.mjs
2/2 pass

combined focused routing + provider + finish-reason run
47/47 pass

node --test apps/worker/tests/public-api.test.mjs apps/worker/tests/mode-ingress.test.mjs
67/67 pass

pnpm --filter @golem/worker typecheck
exit 0
```

These checks use local fixtures only. They do not prove that either selected foundation has passed
the pending 88-task quality measurement, and they do not prove custom Roblox training.
