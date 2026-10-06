-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player has it on screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("HUD", 10)
assert(gui, "HUD was not copied into PlayerGui")
assert(gui:FindFirstChild("Currencies", true), "Currencies is missing")
print("STUDPILOT_PROOF_OK HUD")
