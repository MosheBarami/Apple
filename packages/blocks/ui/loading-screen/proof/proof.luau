-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player sees it.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Loading", 10)
assert(gui, "Loading was not copied into PlayerGui")
assert(gui:FindFirstChild("Logo", true), "Logo is missing")
assert(gui:FindFirstChild("Bar", true), "Bar is missing")
print("STUDPILOT_PROOF_OK Loading")
