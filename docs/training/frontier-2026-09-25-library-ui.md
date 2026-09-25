# Fresh Roblox code benchmark after the library UI correction

Measured 2026-09-25 UTC through production's `/api/admin/model-test` gateway, Agent mode,
`house-rules-plus` arm. The item set and harness are the committed versions in `7d3fd83` and
`8eb5547`, followed by the documented judge repair below. Both product lanes resolved to **the
same** `@cf/zai-org/glm-5.3-flash` model, effort high, with the same prompts and system rules.
Replicates used distinct effective output ceilings (6490–6486 tokens) to avoid the gateway response cache. No answer hit an output
length limit. These are code tasks run under a Luau harness, not full Studio game builds or a
comparison against an outside frontier model.

| Lane | Replicate | Passed / scored | Excluded | Neurons | Failure |
| --- | ---: | ---: | ---: | ---: | --- |
| Apple MAX | 11 | 16/16 | 0 | 416 | none |
| Apple | 12 | 15/16 | 0 | 333 | chat-system-message |
| Apple MAX | 13 | 16/16 | 0 | 369 | none |
| Apple MAX | 14 | 16/16 | 0 | 311 | none |
| Apple MAX | 15, new answers after judge repair | 12/16 | 0 | 376 | chat-system-message, shop-debit, pet-rename, shutdown-save |

**Pooled Apple MAX: 60/64 (93.8%), range 75–100%. Apple: 15/16 (93.8%).** The regular lane
clears its 70% target on this run. Three saved Apple MAX answers now score 100% under the repaired
judge, but the new, prospective 12/16 result shows that 100% is not stable. These results do not
justify calling the product a frontier model. The full-game
visual and Studio acceptance checks are separate and remain open.

All five full run records are in `packages/training/runs/roblox-frontier-*-library-ui-20260925-rep*.json`.
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
Replicates 11 and 12 were also re-scored after the harness fix; neither score changed at that step.

The subsequent judge repair has two independent red-first regression tests against actual saved
model answers. The shop probe sent a second purchase from a buyer who already owned the sword; a
correct duplicate-purchase guard masked the affordability check. It now sends the unaffordable
request from a **different**, empty-handed buyer with 50 coins. The harness's `task.spawn` returned
no value, although [Roblox documents a coroutine return value](https://create.roblox.com/docs/reference/engine/libraries/task).
It now returns a completed thread handle after running the callback in its virtual scheduler.
All 86 benchmark tests, including pass and fail controls, passed. The saved answers were re-scored
without a model call; their earlier verdicts remain in commit `b529ffe` and each run's
`rescoredFrom` field. This is a correction to the judge, not a new model improvement.

Replicate 15 is the fresh check under that repaired judge. Its failures are inspectable: the
chat code calls a permission method absent from the [TextChatService API](https://create.roblox.com/docs/reference/engine/classes/TextChatService)
before displaying; the shop assumes a Sword Tool
already exists in ReplicatedStorage and refunds when it does not; the pet's first rename is blocked
by its initial five-second cooldown; and the shutdown saver treats a successful `UpdateAsync` whose
wrapper returns nil as a failure, then throws while formatting the nil error. These are new model
answers, not re-scored old ones.

Next model work: improve these four behaviors without teaching on held-out answers, then repeat
full runs and the separate real-Studio game gauntlet. The
owner dashboard reports the pooled numbers and labels the two lanes as samples of one model.
