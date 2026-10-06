-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player sees it.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("HUD", 10)
assert(gui, "HUD was not copied into PlayerGui")
assert(gui:FindFirstChild("Counters", true), "Counters is missing")
assert(gui:FindFirstChild("Counter1", true), "Counter1 is missing")
print("STUDPILOT_PROOF_OK HUD")
