-- Run only in the generated unpublished restore proof place.
local runner = game:GetService("ServerScriptService"):FindFirstChild("AppleRestoreEngineProof")
assert(runner and runner:IsA("ModuleScript"), "Open the isolated restore proof place")
local result = require(runner).run()
assert(result.ok == true, "Apple restore engine proof failed; inspect its measured report")
print("APPLE_RESTORE_ENGINE_TASK_COMPLETE")
