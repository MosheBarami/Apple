# Complete script read repair — 2026-09-26

## Measured failure

Apple MAX run `0fbf1b46-803d-4b38-b7fc-1ce2dc208728` in the isolated local garden was stopped after eight tools: one plan, two script reads, three script substring searches and two scoped trees. There were zero edits or other game mutations. Persisted charge: 67 Credits. Seven attributed model-call events total 1,993 neurons. Native connection was returned to inspect-only; worker confirmed idle and zero queued operations.

Studio returned 6,410 characters for GardenMain and 3,754 for GardenClient in the tool details. The model-visible runTool result used the generic 3,000-character slice, cutting JSON and dropping late source plus the concurrency hash. The subsequent substring searches targeted plant/harvest handlers beyond that slice. This is a verified read defect; the contribution to overall agent behavior is an inference, not a proven sole cause.

## Repair and verification

Commit f3cd64a gives read_script a 24,000-character serialized result cap and explicit lossless line pages for larger scripts. `start_line`, `max_lines`, `startLine`, `endLine`, `totalLines`, `complete` and `nextStartLine` describe coverage. Every page retains the whole-file baseHash. Invalid ranges fail before Studio; one oversized line fails explicitly. Other tool caps remain unchanged. A failed/partial read does not authorize any edit.

Four regression tests failed on the old implementation, including invalid JSON at character 3,000. The repaired worker passed 4,207 tests with zero failures and four skips; TypeScript passed. Deployed from an archive of f3cd64a with infra/deploy-worker.mjs; verifier and independent health request observed buildSha f3cd64a.

A real admin run-tool read against the connected Studio (same runTool code as the agent, without inference) returned valid JSON of 7,069 characters, all 6,410 source characters, complete=true, nextStartLine=null, baseHash present, and both PlantRE/HarvestRE handlers present. This proves live source delivery; it does not prove gameplay or AI integration.

## Existing asset preparation

Operator imported a script-free derivative of owner source41 Simulator Building Kit Tulip into ServerStorage.GardenTulipTemplate. Three MeshParts, full MIT Copyright(c)2022 SpiralAPI notice and source URL/id preserved. Derivative 59 KB, SHA256 ea9dd8f6fa5077e0cbd87972141bccb9e02ce925005f0ed9d317f42dc305b605. It is a derived local review asset, not an additional original download or automatic Apple insertion. Referenced mesh/texture rights remain separately unverified. Saved locally only. Native import reset the pivot to geometry center, so runtime use must compute the stem-foot pivot.

An additional strictly bounded two-script integration run was started after this repair. Its outcome must be recorded separately. No planting/growth/harvest or commercial visual success is claimed here.

Private raw evidence: /private/tmp/apple-flower-messages.json, /private/tmp/apple-flower-provider.json, /private/tmp/apple-script-read-live.json, /private/tmp/apple-script-read-worker-tests.log, /private/tmp/apple-script-read-deploy.log. Public Model API reference: https://create.roblox.com/docs/reference/engine/classes/Model.


## Follow-up measured result

The second run wrote both garden scripts after full reads. Native Play verified visible growth, harvest removal and coins 60→50→68. See apple-tulip-gameplay-2026-09-26.md for provider spend, termination failure and remaining visual gaps. CI 36219649531 passed on f3cd64a.
