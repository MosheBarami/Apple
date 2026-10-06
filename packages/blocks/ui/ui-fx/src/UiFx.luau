-- StudKit motion (planning/STYLE-BIBLE.md §3.4) for every screen the player has: a kit button (attribute UI_Click)
-- grows to 1.06 on hover and squashes to 0.94 on press; HUD offers bob; UI_Shine sweeps a light across.
-- Written by StudPilot's ui-fx block; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local BOB = {{bob}}
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local done = setmetatable({}, { __mode = "k" })
local function scaleOf(gui)
	local s = gui:FindFirstChild("StudPilotScale") or Instance.new("UIScale")
	s.Name = "StudPilotScale"
	s.Parent = gui
	return s
end
local function click(button)
	local target = button.Name == "Fill" and button.Parent and button.Parent:IsA("GuiObject") and button.Parent or button
	local scale = scaleOf(target)
	local function to(v, t) TweenService:Create(scale, TweenInfo.new(t, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = v }):Play() end
	button.MouseEnter:Connect(function() to(1.06, 0.15) end)
	button.MouseLeave:Connect(function() to(1, 0.15) end)
	button.MouseButton1Down:Connect(function() to(0.94, 0.08) end)
	button.MouseButton1Up:Connect(function() to(1.06, 0.2) end)
end
local function bob(gui)
	local base = gui.Position
	task.spawn(function()
		local t = 0
		while gui.Parent do
			t += 1 / 30
			gui.Position = base + UDim2.fromOffset(0, math.sin(t * 2) * 4)
			task.wait(1 / 30)
		end
	end)
end
local function shine(gui)
	local g = Instance.new("UIGradient")
	g.Name = "StudPilotShine"
	g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.45, 1), NumberSequenceKeypoint.new(0.5, 0.5), NumberSequenceKeypoint.new(0.55, 1), NumberSequenceKeypoint.new(1, 1) })
	g.Rotation = 20
	local sheen = Instance.new("Frame")
	sheen.Name = "StudPilotSheen"
	sheen.BackgroundColor3 = Color3.new(1, 1, 1)
	sheen.BorderSizePixel = 0
	sheen.Size = UDim2.fromScale(1, 1)
	sheen.ZIndex = gui.ZIndex + 3
	sheen:SetAttribute("StudKit", "fx.highlight")
	g.Parent = sheen
	sheen.Parent = gui
	task.spawn(function()
		while sheen.Parent do
			g.Offset = Vector2.new(-1, 0)
			TweenService:Create(g, TweenInfo.new(0.9, Enum.EasingStyle.Sine), { Offset = Vector2.new(1, 0) }):Play()
			task.wait(3)
		end
	end)
end
local function wire(gui)
	if done[gui] or not gui:IsA("GuiObject") then return end
	if gui:GetAttribute("UI_Click") and gui:IsA("GuiButton") then done[gui] = true; click(gui) end
	if gui:GetAttribute("UI_Shine") then done[gui] = true; shine(gui) end
	if BOB and string.match(gui.Name, "^Offer%d+$") then done[gui] = true; bob(gui) end
end
for _, d in playerGui:GetDescendants() do wire(d) end
playerGui.DescendantAdded:Connect(wire)
