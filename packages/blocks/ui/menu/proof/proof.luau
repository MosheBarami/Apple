-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player has it on screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("MainMenu", 10)
assert(gui, "MainMenu was not copied into PlayerGui")
assert(gui:FindFirstChild("Title", true), "Title is missing")
assert(gui:FindFirstChild("Button1", true), "Button1 is missing")
print("STUDPILOT_PROOF_OK MainMenu")
