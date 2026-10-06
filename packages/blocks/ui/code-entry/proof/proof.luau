-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player has it on screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Codes", 10)
assert(gui, "Codes was not copied into PlayerGui")
assert(gui:FindFirstChild("Box", true), "Box is missing")
assert(gui:FindFirstChild("Redeem", true), "Redeem is missing")
print("STUDPILOT_PROOF_OK Codes")
