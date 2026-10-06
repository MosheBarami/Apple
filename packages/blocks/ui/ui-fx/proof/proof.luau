-- PROOF ONLY (never shipped): the runtime is in the player's scripts.
local player = game:GetService("Players").LocalPlayer or game:GetService("Players").PlayerAdded:Wait()
assert(player:WaitForChild("PlayerScripts"):WaitForChild("StudPilotUiFx", 10), "the effects runtime did not start")
print("STUDPILOT_PROOF_OK ui-fx")
