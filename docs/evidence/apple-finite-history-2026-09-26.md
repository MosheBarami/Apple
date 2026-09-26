# Finite workflow history contamination — 2026-09-26

AI Gateway details read directly for three isolated garden requests; complete response heads, HTTP 200.

| Run | Provider finish | Actual result | Provider cost USD |
|---|---|---|---|
| c3fb62c9 | stop | 0 tools, incomplete, 112 neurons | 0.0012272998733520507 |
| 388e7644 | tool_calls | 1 transform, done, 105 neurons | 0.0011488999481201172 |
| c6199bbb | stop | 0 tools, incomplete, 59 neurons | 0.0006458698272705078 |

Both no-tool responses copied the exact prior terminal message: “The tool sequence you requested is complete. No further checks were run; gameplay remains unverified.” The run guard correctly refused to report completion and refunded those runs. This establishes historical completion replay, not provider failure or output truncation. It does not explain the model's internal selection mechanism.

The next finite provider transcript omits only old assistant prose beginning with that terminal sentence, before the pinned current request. User facts, real structured tool calls/results and current-run messages remain. Ordinary autonomous requests are unaffected. No additional retries, permissions or tool allowance are introduced.

Regression reproduced the old completion remaining in the transcript (red); after the filter all six finite workflow tests passed. Worker suite: 4222 passed, 4 skipped, 0 failed; TypeScript passed. Worker 3343da7 deployed via a clean archive and infra/deploy-worker.mjs; live health verified that exact stamp.

No Roblox publication, uploads, new assets, setting Q-022 change or appeal submission. F-059/F-064 and 0/3 independent reviews remain.

## Bounded live proof

Native Studio was connected to the saved isolated garden, edits explicitly allowed in the plugin. Run `9e5970e5-18ed-4e37-872f-573d009f4ff2` completed one successful transform_instances, 2 Credits, 58 neurons and one provider call. AI Gateway billed USD 0.0006350698585510253. Complete provider request head had **zero historical completion replies**, and offered only transform_instances. Complete response returned that exact tool with paths game.Workspace.PlazaFence and move [0,-1.1999082565307617,0].

After native Save, a data-only Lune before/after comparison found exactly six changed BaseParts, all Y deltas -1.1999082565307617; zero added/missing parts or scripts. Sizes and anchoring preserved. PlazaFence world minimum Y now 0, maximum Y 4.000001907348633. No downloaded Source executed by the audit.

Native Play loaded the player and retained the garden/fence; screenshot is a distant spawn view, **not a blind quality review**. Play was stopped and plugin returned to inspect only. Screenshot fence-after.png shows the closer edit view. Sparse world, floating barrel appearance and missing Tomato/Pumpkin visuals remain. This one successful probe demonstrates the changed boundary and placement; it does not establish a general reliability rate.

CI 928f728 passed all six jobs. CI for code head 3343da7 was still in progress when recording this observation. Exactly one CPU supervisor PID 35962 remained alive; v32 iteration 310, no interruption.
