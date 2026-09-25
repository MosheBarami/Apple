# Rep16 code benchmark and UDim2 judge correction

Measured 2026-09-25 06:56 UTC. A fresh Apple MAX Agent run answered all 16
Roblox code items through `@cf/zai-org/glm-5.3-flash`, costing 444 Workers AI
neurons while the free allowance was available. It initially scored 14/16.
The saved run is
`packages/training/runs/roblox-frontier-apple-max-agent-house-rules-plus-library-ui-20260925-rep16.json`.

The `ui-slide-in` answer used `UDim2.new(...) - UDim2.new(...)` to position the
existing Shop panel. Roblox supports component-wise UDim2 subtraction, but the
local Luau harness represented UDim2 as a table without arithmetic. The click
handler therefore threw before calling TweenService and produced a false miss.
A regression test against the saved real answer failed before the harness fix
and passed afterward. A second test checks all four scale/offset components of
both addition and subtraction. The full frontier control suite passed 88/88.

Scratch copies of five complete Apple MAX runs and the Apple run were rescored
with no model calls. Only rep16's `ui-slide-in` verdict changed. The answer
bytes, requests and measurement timestamps stayed unchanged. The scratch
results were then applied to the saved runs so their judge hashes match the
current harness:

| Run | Before | After |
| --- | ---: | ---: |
| Apple MAX rep11 | 16/16 | 16/16 |
| Apple MAX rep13 | 16/16 | 16/16 |
| Apple MAX rep14 | 16/16 | 16/16 |
| Apple MAX rep15 | 13/16 | 13/16 |
| Apple MAX rep16 | 14/16 | 15/16 |
| Apple rep12 | 15/16 | 15/16 |

The current pooled Apple MAX code-harness result is **76/80 (95.0%)** over five
complete runs; Apple is **15/16 (93.8%)** over one run. The dashboard collector
marks both groups current and records the same Agent model request for the two
lanes. Rep16's remaining miss is `failed-load-no-wipe`: the answer interprets a
successful empty `GetAsync` for a new player as a load failure and then prevents
the player's first save. That is an observed model error; the judge has not been
changed to excuse it.

These are local code-harness measurements, not proof of a 100% frontier model,
complete Studio game, or publicly available plugin.
