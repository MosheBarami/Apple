-- The panel's close button hides its window. Written by StudPilot's panel block; edit freely.
local gui = script.Parent
local window = gui:WaitForChild("Window")
local button = window:WaitForChild("Close"):WaitForChild("Button")
button.Activated:Connect(function()
	window.Visible = false
end)
