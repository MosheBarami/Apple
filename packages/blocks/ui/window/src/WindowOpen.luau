-- Opens and closes the window: the X hides it (and the dim); when it opens it pops in. A HUD tile with action
-- open:<screen> toggles it. Written by StudPilot's window block; edit freely.
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local window = gui:WaitForChild("Window")
local dim = gui:FindFirstChild("Dim")
local close = window:WaitForChild("Header"):WaitForChild("Close"):WaitForChild("Fill")
local scale = window:FindFirstChild("Pop") or Instance.new("UIScale")
scale.Name = "Pop"
scale.Parent = window
local function sync()
	if dim then dim.Visible = window.Visible end
	if window.Visible then
		scale.Scale = 0.8
		TweenService:Create(scale, TweenInfo.new(0.2, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	end
end
window.Visible = window:GetAttribute("StartOpen") ~= false
window:GetPropertyChangedSignal("Visible"):Connect(sync)
sync()
close.Activated:Connect(function() window.Visible = false end)
