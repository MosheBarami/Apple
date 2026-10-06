-- StudKit runtime (planning/UI-SPEC-v2.md §3 and §7) for every screen the player has.
-- StudKitScale: every stroke, corner, lip and stud tile was written at its 1080p size (attributes StudKitPx,
-- StudKitCorner, StudKitLip, StudKitTile, StudKitInset); here they follow the player's screen, viewport height / 1080,
-- never thinner than 1.5 px. Motion: hover 1.05, the press sinks the face onto its lip, hero rays spin (UI_Spin = seconds
-- per turn), icons bob (UI_Bob), badges pulse, a grey (unaffordable) button shakes, offers bob, UI_Shine sweeps.
-- Written by StudPilot's ui-fx block; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local BOB = {{bob}}
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local camera = workspace.CurrentCamera
local done = setmetatable({}, { __mode = "k" })
local scaled = setmetatable({}, { __mode = "k" })

local function k() return (camera and camera.ViewportSize.Y or 1080) / 1080 end
local function rescale(o)
	local f = k()
	local px = o:GetAttribute("StudKitPx")
	if px and o:IsA("UIStroke") then o.Thickness = math.max(1.5, px * f) end
	if px and o:IsA("GuiObject") and o.Name == "Highlight" then o.Size = UDim2.new(o.Size.X.Scale, o.Size.X.Offset, 0, math.max(1, px * f)) end
	local c = o:GetAttribute("StudKitCorner")
	if c and o:IsA("UICorner") then o.CornerRadius = UDim.new(0, c * f) end
	local lip = o:GetAttribute("StudKitLip")
	if lip and o:IsA("GuiObject") then o.Position = UDim2.new(o.Position.X.Scale, 0, o.Position.Y.Scale, lip * f) end
	local tile = o:GetAttribute("StudKitTile")
	if tile and o:IsA("ImageLabel") then o.TileSize = UDim2.fromOffset(tile * f, tile * f) end
	local inset = o:GetAttribute("StudKitInset")
	if inset and o:IsA("GuiObject") then
		o.Position = UDim2.new(o.Position.X.Scale, inset * f, o.Position.Y.Scale, o.Position.Y.Offset)
		o.Size = UDim2.new(o.Size.X.Scale, -2 * inset * f, o.Size.Y.Scale, o.Size.Y.Offset)
	end
	scaled[o] = true
end
local function rescaleAll()
	for o in scaled do if o.Parent then rescale(o) end end
end

local function scaleOf(gui)
	local s = gui:FindFirstChild("StudPilotScale") or Instance.new("UIScale")
	s.Name = "StudPilotScale"
	s.Parent = gui
	return s
end
local function tween(o, t, props, style)
	TweenService:Create(o, TweenInfo.new(t, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props):Play()
end
-- Hover 1.05 in 0.08 s; the press moves the face down onto its lip (lip - 2 px) in 0.05 s and back in 0.09 s; a grey
-- (unaffordable or locked) button shakes +-6 px three times in 0.25 s instead.
local function button(fill)
	local holder = fill.Parent
	if not (holder and holder:IsA("GuiObject")) then return end
	local scale = scaleOf(holder)
	local lip = holder:FindFirstChild("Lip")
	local depth = lip and (lip:GetAttribute("StudKitLip") or 0) or 0
	fill.MouseEnter:Connect(function() tween(scale, 0.08, { Scale = 1.05 }) end)
	fill.MouseLeave:Connect(function() tween(scale, 0.08, { Scale = 1 }) end)
	fill.MouseButton1Down:Connect(function()
		if fill:GetAttribute("Token") == "grey" or fill:GetAttribute("Token") == "slate" then
			local base = holder.Position
			task.spawn(function()
				for _, dx in { 6, -6, 6, -6, 6, 0 } do
					holder.Position = base + UDim2.fromOffset(dx * k(), 0)
					task.wait(0.25 / 6)
				end
				holder.Position = base
			end)
			return
		end
		tween(fill, 0.05, { Position = UDim2.new(0, 0, 0, math.max(0, depth - 2) * k()) })
	end)
	fill.MouseButton1Up:Connect(function() tween(fill, 0.09, { Position = UDim2.new(0, 0, 0, 0) }) end)
end
local function spin(gui, period)
	task.spawn(function()
		while gui.Parent do
			gui.Rotation = (gui.Rotation + 360 / (period * 30)) % 360
			task.wait(1 / 30)
		end
	end)
end
local function bob(gui, amp, period)
	local base = gui.Position
	task.spawn(function()
		local t = 0
		while gui.Parent do
			t += 1 / 30
			gui.Position = base + UDim2.fromOffset(0, math.sin(t * 2 * math.pi / period) * amp * k())
			task.wait(1 / 30)
		end
	end)
end
local function pulse(gui)
	local scale = scaleOf(gui)
	task.spawn(function()
		while gui.Parent do
			tween(scale, 0.6, { Scale = 1.12 }, Enum.EasingStyle.Sine)
			task.wait(0.6)
			tween(scale, 0.6, { Scale = 1 }, Enum.EasingStyle.Sine)
			task.wait(0.6)
		end
	end)
end
local function shine(gui)
	local g = Instance.new("UIGradient")
	g.Name = "StudPilotShine"
	g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.45, 1), NumberSequenceKeypoint.new(0.5, 0.55), NumberSequenceKeypoint.new(0.55, 1), NumberSequenceKeypoint.new(1, 1) })
	g.Rotation = 20
	local sheen = Instance.new("Frame")
	sheen.Name = "StudPilotSheen"
	sheen.BackgroundColor3 = Color3.new(1, 1, 1)
	sheen.BorderSizePixel = 0
	sheen.Size = UDim2.fromScale(1, 1)
	sheen.ZIndex = gui.ZIndex + 3
	sheen:SetAttribute("StudKit", "fx.sweep")
	g.Parent = sheen
	sheen.Parent = gui
	task.spawn(function()
		while sheen.Parent do
			g.Offset = Vector2.new(-1, 0)
			tween(g, 0.9, { Offset = Vector2.new(1, 0) }, Enum.EasingStyle.Sine)
			task.wait(3.5)
		end
	end)
end
local function wire(gui)
	if gui:GetAttribute("StudKitPx") or gui:GetAttribute("StudKitCorner") or gui:GetAttribute("StudKitLip") or gui:GetAttribute("StudKitTile") or gui:GetAttribute("StudKitInset") then rescale(gui) end
	if done[gui] or not gui:IsA("GuiObject") then return end
	if gui:GetAttribute("UI_Click") and gui:IsA("GuiButton") then done[gui] = true; button(gui) end
	if gui:GetAttribute("UI_Spin") then done[gui] = true; spin(gui, gui:GetAttribute("UI_Spin")) end
	if gui:GetAttribute("UI_Bob") then done[gui] = true; bob(gui, 4, 1.6) end
	if gui:GetAttribute("UI_Shine") then done[gui] = true; shine(gui) end
	if gui:GetAttribute("StudKit") == "badge.holder" then done[gui] = true; pulse(gui) end
	if BOB and string.match(gui.Name, "^Offer%d+$") then done[gui] = true; bob(gui, 4, 3) end
end
for _, d in playerGui:GetDescendants() do wire(d) end
playerGui.DescendantAdded:Connect(wire)
if camera then camera:GetPropertyChangedSignal("ViewportSize"):Connect(rescaleAll) end
RunService.Heartbeat:Wait()
rescaleAll()
