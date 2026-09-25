# Fresh Roblox code benchmark after the library UI correction

Measured 2026-09-25 UTC through production's `/api/admin/model-test` gateway, Agent mode,
`house-rules-plus` arm. The item set and harness are the committed versions in `7d3fd83` and
`8eb5547`. Both product lanes resolved to **the same** `@cf/zai-org/glm-5.3-flash` model, effort
high, with the same prompts and system rules. Replicates used distinct effective output ceilings
(6490, 6489, 6488, 6487 tokens) to avoid the gateway response cache. No answer hit an output
length limit. These are code tasks run under a Luau harness, not full Studio game builds or a
comparison against an outside frontier model.

| Lane | Replicate | Passed / scored | Excluded | Neurons | Failure |
| --- | ---: | ---: | ---: | ---: | --- |
| Apple MAX | 11 | 16/16 | 0 | 416 | none |
| Apple | 12 | 14/16 | 0 | 333 | chat-system-message, shop-debit |
| Apple MAX | 13 | 15/16 | 0 | 369 | shop-debit |
| Apple MAX | 14 | 15/16 | 0 | 311 | shutdown-save |

**Pooled Apple MAX: 46/48 (95.8%), range 93.8–100%. Apple: 14/16 (87.5%).** The regular lane
clears its 70% target on this run. One Apple MAX run reached 100%, but the repeated result does
not establish a stable 100% rate or justify calling the product a frontier model. The full-game
visual and Studio acceptance checks are separate and remain open.

All four full run records are in `packages/training/runs/roblox-frontier-*-library-ui-20260925-rep*.json`.
Each retains its answer, exact settings, per-check verdicts, and scorer/harness/task hashes. The
single-item UI diagnostic (1/1, 22 neurons) is not a full run and is excluded from the dashboard
headline by the recorded `items` count, irrespective of its filename.

Replicate 13 originally excluded a valid platform answer because the shim returned a function
for Roblox's `CFrame.RightVector` property. [Roblox's CFrame reference](https://create.roblox.com/docs/reference/engine/datatypes/CFrame)
declares it a Vector3. The harness now supplies that vector and observes distinct positions;
the regression test failed before this fix and passed afterward. Re-scoring the **same saved
answer** changed replicate 13 from 14/15 with one exclusion to 15/16 with none. The original
run SHA-256 before re-scoring was
`a7a9c165b39a91d66a9ca013eb804428905a565684bd9b23b6be297317c08647`.
Replicates 11 and 12 were also re-scored after the harness fix; neither score changed.

Next model work: diagnose the two shop affordability misses, the legacy chat call, and the
shutdown save failure, then repeat full runs and the separate real-Studio game gauntlet. The
owner dashboard reports the pooled numbers and labels the two lanes as samples of one model.
