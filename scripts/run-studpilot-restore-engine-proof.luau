-- Run only in the generated unpublished restore proof place.
local runner = game:GetService("ServerScriptService"):FindFirstChild("AppleRestoreEngineProof")
assert(runner and runner:IsA("ModuleScript"), "Open the isolated restore proof place")
local result = require(runner).run()
assert(result.ok == true, "StudPilot restore engine proof failed; inspect its measured report")
print("STUDPILOT_RESTORE_ENGINE_TASK_COMPLETE")
