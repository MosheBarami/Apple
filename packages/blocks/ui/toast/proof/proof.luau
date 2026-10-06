-- PROOF ONLY (never shipped): after the recipe ran with its defaults, a player sees it.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Toasts", 10)
assert(gui, "Toasts was not copied into PlayerGui")
assert(gui:FindFirstChild("Stack", true), "Stack is missing")
print("STUDPILOT_PROOF_OK Toasts")
