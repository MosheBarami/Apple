# Resume runtime validation — 2026-09-18

## Scope and observation boundary

This is a read-only verification of the current shared working tree after the earlier handoff became
stale. Source was not changed. The only new artifact from this pass is this report.

No production endpoint, Roblox Studio session, remote database, account configuration, provider model,
training job, deployment, upload, or paid API was called. The model-routing test uses a local
`env.AI.run` recorder fixture. The reference tests run against checked-in data and explicitly exercise
offline behavior. Therefore the results below establish the current local runtime wiring and tests;
they are not production, engine, rendered-pixel, or model-quality evidence.

Repository HEAD was `6d7a5bec3a741de9cbe97459bcc82e760bd3e089` while the relevant runtime files were dirty/uncommitted in
the shared checkout. The fingerprints below are of the exact working-tree bytes validated here, not of
that HEAD commit.

## Current integrated product-model choice and entitlement

The current source agrees with the serving decision in
`docs/evidence/apple-model-selection-2026-09-18.md`:

| Product role | Current Workers AI id | Current context |
| --- | --- | ---: |
| Apple | `@cf/qwen/qwen3-30b-a3b-fp8` | 32,768 |
| Apple MAX | `@cf/zai-org/glm-4.7-flash` | 131,072 |
| internal vision critic | `@cf/zai-org/glm-5.3-flash` | 1,310,720 |

`ProductModel` is still independent of the Plan/Agent/Super Agent autonomy mode. `SessionDO` maps
`apple` to the Qwen-backed `clay` gateway lane even when Stone tools are selected, and maps
`apple-max` to the GLM-4.7-backed builder lane. `canUseProductModel` admits Apple without a subscription
record and admits Apple MAX only for a valid non-Free plan. `SessionDO` reads that plan from QuotaDO;
an unavailable or malformed authoritative read does not grant MAX.

The focused executable integration test drove the real bundled `SessionDO`/gateway path with a local
AI recorder. It observed Qwen3 for free Apple in both Plan and Agent and GLM-4.7-Flash for paid MAX in
both Plan and Agent. Free MAX was refused before the provider recorder was reached.

Nothing in this pass changes the earlier custom-adapter verdict. The 16-step and 64-step local adapters
remain rejected/not promoted in the existing evidence, and the current product-model routing points at
the Cloudflare-hosted foundation ids above. No custom-training or Roblox-trained production-model claim
is established here.

## Plugin capability session and execution fence

The integrated capability source still matches
`docs/evidence/independent-plugin-capability-2026-09-18.md` byte-for-byte under that report's aggregate
fingerprint algorithm:

```text
capability source aggregate SHA-256
93cd007d72180d80d4bf745ce1b7fba5c7143a41af3fb1e89c97d0757d873dce

capability test aggregate SHA-256
7698a64f74339a447ab682a4679fd88578c11e6753353bc6a53d108f08c15611
```

The current path still has all of the documented boundaries:

- the report is persisted per pairing under `pluginCapabilities:<tokenHash>` and reloaded after a
  Durable Object restart;
- a new pairing, expiration, and explicit revoke clear the active report, while an omitted report on
  a later poll preserves the acknowledged state;
- a present malformed report clears the canonical report and returns to legacy/unknown compatibility;
- the active token hash fences a late old-pairing poll from poisoning a new pairing;
- narrowing order is mode, then user tool permissions, then plugin capability report;
- the effective set is used for model tool definitions and text-call recovery, and it is re-read after
  inference then intersected with the set actually offered to that call;
- a returned capability-blocked tool call gets bounded `executed:false` feedback and never reaches
  `runTool`/Studio;
- the SYSTEM capability note contains Worker-owned operation/tool names only, while plugin-authored
  refusal text stays structured and out of the prompt;
- unsupported visual inspection cannot become a visual-pass claim, and a blocked artifact attempt
  remains a failed artifact attempt rather than prose-completing the artifact.

## Genre references and creator-skill wiring

The current guide embeds the post-research manifest SHA-256:

```text
482787e6fe202531f332daab1f2bd37fa24046c7f8194f354f657ab0fa163921
```

That is the same SHA recorded as the new manifest in
`genre-reference-gap-followthrough-2026-09-18.md`. That report captured a temporary, intentional
6-pass/1-fail hash-guard state because the Worker helper still carried the older `8c332b...` digest.
The current helper now carries `482787e6...`, and its hash guard passes. This is concrete evidence that
the current source is ahead of that superseded handoff state.

Measured locally from the current Worker bundles:

```text
creator skills:                 217
canonical genres:                10
canonical aspects:                8
default genre-guide queries:     90
default queries truncated:       43
serialized guide range:    1509–2700 chars
current visual-gap queries:        1  (horror/inventory)
```

`search_creation_skills`, `read_creation_skill`, and `get_genre_references` are real non-Studio tools.
They are present in Plan and in the offline tool vocabulary. All three have explicit `phaseForTool`
cases in the shared vocabulary and announce `inspecting`; the phase-coverage guard also confirms that
no registered tool currently relies on the default phase. `get_genre_kit` links to both
`get_genre_references` and `read_creation_skill`, with the creation-skill data placed before the generic
`runTool` model-context cap.

The reference helper remains provenance-carrying and bounded: its current success result reports
matched/returned/omitted source, observation and rule counts; external references remain
`reference_only` with `copyPermission:false` and `trainingData:false`; and it always reports
`createdGame.visuallyVerified:false` / `studioVisualPass:required_after_build`.

## Actionable truncation findings

One correctness bug is reproducible in the current creator-skill search. The search computes its
`truncated` flag before `fitSearchPayload` removes hits to satisfy the character budget, and the fitter
does not recompute the flag. The following current call:

```text
searchCreatorSkills({ query: "hud", limit: 5, maxChars: 700 })
```

measured:

```text
totalMatches = 3
returned     = 1
truncated    = false
serialized  = 583 chars
```

Two real matches were omitted while the result explicitly claimed it was not truncated. This should
be fixed in the creator-skills owner lane by deriving `truncated` from the final returned count (or by
carrying a distinct limit/budget omission reason) after budget fitting. A regression should cover the
case where `totalMatches <= limit` but the character budget removes one or more requested hits.

There is also no explicit successful-result truncation reason across these retrieval surfaces. At the
default 2,700-character guide budget, 43 of 90 canonical results have `truncated:true`; the first
measured broad horror result reports exact nonzero omission counts but has no `reason`,
`truncationReason`, or equivalent field. At the 1,400-character minimum read budget, all 217 current
creator-skill reads report `truncated:true`, and their top-level result contains only `skill` and
`truncated`. Ordinary truncated search results similarly expose the Boolean and counts but no reason.

For the guide, exact omission counts keep the loss visible, so this is a contract/diagnostic gap rather
than hidden omission. For `read_creation_skill`, callers cannot distinguish list compaction from string
clipping. If the intended contract requires a truncation reason, add a small bounded enum such as
`limit`, `character_budget`, or `compacted_for_character_budget` and test it at the minimum budgets.

## Focused local validation

Only the relevant bounded suites were run; the full Worker suite was not run.

```text
node --test \
  apps/worker/tests/product-model-entitlement.test.mjs \
  apps/worker/tests/plugin-capabilities.test.mjs \
  apps/worker/tests/plugin-capability-session.test.mjs \
  apps/worker/tests/genre-reference-guide.test.mjs \
  apps/worker/tests/genre-reference-tools.test.mjs \
  apps/worker/tests/creator-skills.test.mjs \
  apps/worker/tests/creator-skills-tools.test.mjs \
  apps/worker/tests/phase-coverage.test.mjs \
  apps/worker/tests/tools-for-mode.test.mjs

71 tests · 71 passed · 0 failed

pnpm --filter @golem/worker typecheck
tsc --noEmit · exit 0
```

Aggregate fingerprint algorithm for this report: for each path in the listed order, SHA-256 receives
the UTF-8 path, one NUL byte, the exact file bytes, then one NUL byte.

Runtime source set, in order:

1. `packages/shared/src/index.ts`
2. `apps/worker/src/gateway.ts`
3. `apps/worker/src/providers/workers-ai.ts`
4. `apps/worker/src/plugin-capabilities.ts`
5. `apps/worker/src/do/session.ts`
6. `apps/worker/src/prompts.ts`
7. `apps/worker/src/router.ts`
8. `apps/worker/src/tools.ts`
9. `apps/worker/src/genre-reference-guide.ts`
10. `apps/worker/src/creator-skills.ts`

```text
RUNTIME_SOURCE_AGGREGATE_SHA256 = 415c188971d566a71dc15191c3773154b085971cf015d6600f58b7ac1c3a89f0
```

Focused test set, in the same order as the command above:

```text
FOCUSED_TEST_AGGREGATE_SHA256 = f680e27ebb827fc0c55484349c37914cccf19e66e250533f9d71381822a725a2
```

## Evidence boundaries

- **Observed local tests:** the 71 focused tests and Worker typecheck above passed on the fingerprinted
  working-tree bytes.
- **Engine proof:** no Roblox Studio/engine run was performed in this pass. Existing engine evidence was
  not reclassified as a new observation.
- **Production:** no production health/config/model/account request was made, so this report does not
  claim the current local bytes are deployed.
- **Visual acceptance:** no rendered output was inspected in this pass. The reference/skill surfaces
  themselves continue to require a live Studio visual pass and do not mark created work visually
  verified.
- **Model quality/training:** no model inference or training was performed. The earlier rejected local
  adapters remain rejected; this report establishes serving selection/wiring only.

## Creator-skills truncation follow-through

The truncation finding above records the pre-fix state that was measured first. The subsequently
authorized creator-skills owner pass fixed that defect without changing the catalogue, model routing,
genre guide, router, shared phase vocabulary, UI, capability code, Studio code, or any production
configuration.

The search result envelope now derives `returned`, `omitted`, `truncated`, and its truncation reason
from the **final result list after character fitting**. The bounded reason vocabulary is exactly:

```text
result_limit
character_budget
result_limit_and_character_budget
```

`truncationReason` is present only when `truncated:true`. `readCreatorSkill` uses the same bounded
contract and reports `character_budget` when its response has to be compacted. Size checks account for
that reason field before returning, so diagnostic honesty does not break the documented budgets.

The original regression now measures:

```text
searchCreatorSkills({ query: "hud", limit: 5, maxChars: 700 })
totalMatches     = 3
returned         = 1
omitted          = 2
truncated        = true
truncationReason = character_budget
serialized       = 632 chars
```

The same query at the maximum search budget (`2600`) returns all 3 matches, omits 0, reports
`truncated:false`, has no `truncationReason`, and serializes to 1,174 characters. A zero search budget
clamps to the existing 700-character minimum and produces byte-for-byte-equivalent JSON to the explicit
minimum call; an oversized budget clamps to the existing 2,600-character maximum and likewise matches
the explicit maximum call.

The read contract was exercised over every catalogue entry at both limits:

```text
creator skills                         217
maximum serialized size at 1400 cap  1396 chars
skills truncated at 1400               217
maximum serialized size at 2800 cap  2796 chars
skills truncated at 2800                71
truncated reads missing/wrong reason      0
```

For reads, zero clamps to 1,400 and oversized values clamp to 2,800. Unknown search/read inputs retain
their existing `noMatch` reasons and do not acquire a truncation reason. The result cap remains five.
`CREATOR_SKILL_COUNT` remains exactly 217.

Red-first validation made the original defect observable: after adding the regression tests and before
changing `creator-skills.ts`, the focused run had 13 passes / 3 failures, including the `hud` case with
the missing final omission metadata. After the fix and minimum-fallback adjustment, the final focused
validation is:

```text
node --test \
  apps/worker/tests/creator-skills.test.mjs \
  apps/worker/tests/creator-skills-tools.test.mjs

16 tests · 16 passed · 0 failed

pnpm --filter @golem/worker typecheck
tsc --noEmit · exit 0
```

Exact final file SHA-256 values for this follow-through:

```text
apps/worker/src/creator-skills.ts
0a74aff69dab9c3a9ba20551719d262ca3cb07c4ee881c6f481042e3f5c96d4c

apps/worker/tests/creator-skills.test.mjs
a514d53c9366e279dcdcb092bd433109d2c3147ac5be67efe8ed9c9cca4701f7

apps/worker/tests/creator-skills-tools.test.mjs
22fc5f99d8f20b2da2cdca5cb6fd6a0c9f79da6eb6b1a83429d4334cfa1bd1fa
```

All commands in this follow-through were local. No external fetch, model/provider call, Studio/engine
operation, remote database operation, deployment, upload, or customer-data access occurred.
