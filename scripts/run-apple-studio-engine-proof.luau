-- Executed by Studio's documented RunScript task against the disposable proof place.
-- The proof module verifies Studio edit mode, PlaceId=0, and its fixture marker.
local runner = game:GetService("ServerScriptService"):FindFirstChild("AppleStudioEngineProof")
assert(runner and runner:IsA("ModuleScript"), "Open the isolated Apple Studio engine proof place")
local report = require(runner).run()
assert(report.ok == true, "Apple Studio engine proof failed; inspect APPLE_STUDIO_ENGINE_PROOF output")
print("APPLE_STUDIO_ENGINE_TASK_COMPLETE")
