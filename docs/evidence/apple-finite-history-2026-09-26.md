# Finite workflow history contamination — 2026-09-26

AI Gateway details read directly for three isolated garden requests; complete response heads, HTTP 200.

| Run | Provider finish | Actual result | Provider cost USD |
|---|---|---|---|
| c3fb62c9 | stop | 0 tools, incomplete, 112 neurons | 0.0012272998733520507 |
| 388e7644 | tool_calls | 1 transform, done, 105 neurons | 0.0011488999481201172 |
| c6199bbb | stop | 0 tools, incomplete, 59 neurons | 0.0006458698272705078 |

Both no-tool responses copied the exact prior terminal message: “The tool sequence you requested is complete. No further checks were run; gameplay remains unverified.” The run guard correctly refused to report completion and refunded those runs. This establishes historical completion replay, not provider failure or output truncation. It does not explain the model's internal selection mechanism.

The next finite provider transcript omits only old assistant prose beginning with that terminal sentence, before the pinned current request. User facts, real structured tool calls/results and current-run messages remain. Ordinary autonomous requests are unaffected. No additional retries, permissions or tool allowance are introduced.

Regression reproduced the old completion remaining in the transcript (red); after the filter all six finite workflow tests passed. Worker suite: 4222 passed, 4 skipped, 0 failed; TypeScript passed. Deployment and bounded live proof pending at this commit.

No Roblox publication, uploads, new assets, setting Q-022 change or appeal submission. F-059/F-064 and 0/3 independent reviews remain.
