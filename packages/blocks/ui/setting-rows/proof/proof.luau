-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player has it on screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Settings", 10)
assert(gui, "Settings was not copied into PlayerGui")
assert(gui:FindFirstChild("Setting1", true), "Setting1 is missing")
print("STUDPILOT_PROOF_OK Settings")
