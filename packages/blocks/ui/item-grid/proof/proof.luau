-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player has it on screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Shop", 10)
assert(gui, "Shop was not copied into PlayerGui")
assert(gui:FindFirstChild("Grid", true), "Grid is missing")
assert(gui:FindFirstChild("Item1", true), "Item1 is missing")
print("STUDPILOT_PROOF_OK Shop")
