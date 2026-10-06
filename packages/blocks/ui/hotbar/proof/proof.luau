-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player has it on screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Hotbar", 10)
assert(gui, "Hotbar was not copied into PlayerGui")
assert(gui:FindFirstChild("Bar", true), "Bar is missing")
assert(gui:FindFirstChild("Slot1", true), "Slot1 is missing")
print("STUDPILOT_PROOF_OK Hotbar")
