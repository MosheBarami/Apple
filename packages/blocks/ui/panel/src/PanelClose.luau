-- The panel's close button hides its window. Written by StudPilot's panel block; edit freely.
local gui = script.Parent
local window = gui:WaitForChild("Window")
local button = window:WaitForChild("Close"):WaitForChild("Button")
window.Visible = window:GetAttribute("StartOpen") ~= false -- shown while editing; in the game it waits for its button when set so
button.Activated:Connect(function()
	window.Visible = false
end)
