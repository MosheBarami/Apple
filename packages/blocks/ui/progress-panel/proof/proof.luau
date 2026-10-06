-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player sees it.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Shop", 10)
assert(gui, "Shop was not copied into PlayerGui")
assert(gui:FindFirstChild("Progress", true), "Progress is missing")
assert(gui:FindFirstChild("Action", true), "Action is missing")
print("STUDPILOT_PROOF_OK Shop")
