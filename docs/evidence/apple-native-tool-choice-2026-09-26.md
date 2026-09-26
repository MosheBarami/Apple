# Native bounded Apple MAX action — 2026-09-26

## Real outcome

Worker **7a08dc4** ran `a9f9571e-6625-4874-b506-a621aa18c460` in the existing isolated local Studio garden. The request explicitly required exactly ONE move_instances call, supplied its JSON arguments, required immediate finish, and said not to touch the qualified paths for Garden.Bench or GardenMeshTrees.

The persisted trace contains exactly **one successful move_instances**, then **done**, with **5 settled Credits**. Fresh session state was idle, plugin connected, queuedOps0. The native Studio Save confirmation wrote the place. Data-only saved comparison, normalized only for the requested Bench reparent, found **0 changed, 0 added, 0 missing BaseParts**. The archived Bench retains14parts; Garden.Bench retains14parts and the cartoon trees13parts. This is a real local reparent, not a permanent upload or autonomous asset acquisition. Gameplay and commercial visual quality were not tested by this run.

## Root causes and fix

Two prior bounded requests each had no native tool call and refunded5Credits (0settled); they consumed129 and133neurons. Gateway evidence identified two different failures:

1. `Do not touch game.Workspace.Garden.Bench` incorrectly matched the whole-place prohibition for `game`, removing all mutation tools. The permission parser now excludes qualified paths while preserving whole-place prohibitions.
2. When move_instances was offered, the provider returned bare JSON text, not a native call. Mutation text recovery stays disabled. Explicit finite sequences now request their next **already offered** tool through the GLM native named tool_choice field. Read-only/mode/permission filters still control the offered tools; absent/withheld tools cannot be forced. Ordinary chats and other models retain their prior behavior.

The [official Cloudflare SDK implementation](https://github.com/cloudflare/ai/blob/main/packages/workers-ai-provider/src/utils.ts) documents the named function choice used here. In the real request, only move_instances was offered and tool_choice named that function. The real response returned finish_reason tool_calls and exactly one structured move_instances with the requested paths. There was no second model call. Admin metering recorded **138neurons** (raw provider usage137.43270874023438). AI Gateway reported **USD0.0015117597961425782** for that request; this is provider log cost, not a verified invoice charge.

## Verification

Both regressions failed before their respective fixes. Focused tests29pass, TypeScript check passes, worker suite4226pass/0fail/4skip. Final model-wire tests17pass include absent tools, withheld named tool, ordinary chat, Qwen and Sol behavior. A clean git archive of7a08dc4 was deployed through infra/deploy-worker.mjs; health verified7a08dc4, deployment version c8eb1a7f-12e7-43df-8715-06b8d2bd29ab.

No source assets executed, models deleted, Roblox upload, Q022 change, purchase, reset-credit redemption or appeal submission. The sole CPU supervisor35962 continues v32 evaluation. Full acceptance remains unmet: F059/F064 and0/3 independent whole-product passing reviews. Previous blind garden review remains MATERIAL_FINDINGS; the map needs cohesive composition, background and consistent styling.

Evidence: [prior provider findings](native-tool-choice-20260926/provider-findings.json), [native request/response summary](native-tool-choice-20260926/provider-success.json), [persisted trace](native-tool-choice-20260926/tool-trace.json), [saved audit](native-tool-choice-20260926/saved-audit.json), [saved diff](native-tool-choice-20260926/saved-diff.json). Full private requests and provider reasoning were excluded.
