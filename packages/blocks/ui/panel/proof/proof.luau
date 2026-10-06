-- PROOF ONLY (never shipped): after the panel recipe ran with its defaults, the window is on the player's screen.
local Players = game:GetService("Players")
local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
local gui = player:WaitForChild("PlayerGui"):WaitForChild("Panel", 10)
assert(gui, "the Panel ScreenGui was not copied into PlayerGui")
local title = gui:FindFirstChild("Title", true)
assert(title and title.Text == "Menu", "the header does not show the default title")
print("STUDPILOT_PROOF_OK panel")
