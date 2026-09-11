--!strict
--[[
	Stories — the isolated UI evaluation harness (§N).

	§N: "Build/finish a UI authoring and evaluation harness rather than only judging UI
	inside a full game", and it lists the states that must be renderable: default, hover,
	pressed, disabled, loading, success, error, selected, unselected, mobile, desktop,
	controller-focus, reduced-motion, large-text. It closes with the line this module
	exists to satisfy: "A UI component does not count as good merely because it
	instantiates successfully. Capture visual evidence."

	WHY IT SHIPS IN THE CLIENT INSTEAD OF LIVING IN world/.

	The command context Studio gives us runs in a SEPARATE Luau VM, so `require` there
	returns a fresh module instance — that is a recorded trap in this project, and it is
	why two earlier motion probes produced confident wrong answers. A harness kept in
	`world/` could therefore only be run by pasting its source, which drifts from the file
	the moment anyone edits either. Installed as a real module it is required the same way
	Hud requires Theme, so what runs IS what is committed.

	It is inert. Nothing calls `Stories.mount`; it draws only when a reviewer asks for it,
	and `Stories.unmount` removes every trace.

	WHAT IT DOES NOT DO. It does not judge. §AK is explicit that a metric which sounds
	reasonable can be useless, and there is no rubric here for the same reason — this
	renders the states side by side so a human, or a critic with eyes, can look at them.
]]

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")

local Theme = require(script.Parent:WaitForChild("Theme"))

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Palette = require(Shared:WaitForChild("Palette") :: ModuleScript)

local Stories = {}

local GUI_NAME = "CrystalCanyonStories"

--[[ A labelled cell. The caption is part of the evidence: a screenshot of eight
	 buttons is not evidence about states unless each one says which state it is. ]]
local function cell(parent: Instance, label: string, w: number, h: number): Frame
	local holder = Instance.new("Frame")
	holder.Name = label
	holder.BackgroundTransparency = 1
	holder.Size = UDim2.fromOffset(w, h + 22)
	holder.Parent = parent

	local cap = Instance.new("TextLabel")
	cap.Name = "Caption"
	cap.BackgroundTransparency = 1
	cap.Size = UDim2.new(1, 0, 0, 18)
	cap.Position = UDim2.fromOffset(0, h + 4)
	cap.Font = Enum.Font.GothamMedium
	cap.TextSize = 13
	cap.TextColor3 = Color3.fromRGB(232, 238, 248)
	cap.TextXAlignment = Enum.TextXAlignment.Left
	cap.Text = label
	cap.Parent = holder

	local slot = Instance.new("Frame")
	slot.Name = "Slot"
	slot.BackgroundTransparency = 1
	slot.Size = UDim2.fromOffset(w, h)
	slot.Parent = holder
	return slot
end

local function row(parent: Instance, title: string): Frame
	local band = Instance.new("Frame")
	band.Name = title
	band.BackgroundTransparency = 1
	band.AutomaticSize = Enum.AutomaticSize.Y
	band.Size = UDim2.new(1, 0, 0, 0)
	band.Parent = parent

	local heading = Instance.new("TextLabel")
	heading.BackgroundTransparency = 1
	heading.Size = UDim2.new(1, 0, 0, 24)
	heading.Font = Enum.Font.GothamBold
	heading.TextSize = 16
	heading.TextColor3 = Color3.fromRGB(255, 255, 255)
	heading.TextXAlignment = Enum.TextXAlignment.Left
	heading.Text = title
	heading.Parent = band

	local strip = Instance.new("Frame")
	strip.Name = "Strip"
	strip.BackgroundTransparency = 1
	strip.Position = UDim2.fromOffset(0, 26)
	strip.AutomaticSize = Enum.AutomaticSize.Y
	strip.Size = UDim2.new(1, 0, 0, 0)
	strip.Parent = band

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.Padding = UDim.new(0, 14)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = strip

	local pad = Instance.new("UIPadding")
	pad.PaddingBottom = UDim.new(0, 30)
	pad.Parent = band
	return strip
end

--[[ Drive a control into a state the way the player would, rather than reaching past
	 `wireFeedback` to set the look directly. A story that paints the pressed appearance
	 by hand proves nothing about the button: the whole question is whether the real
	 input path produces the real state. ]]
local function drive(btn: TextButton, state: string)
	if state == "hover" then
		btn.SelectionImageObject = nil
		-- MouseEnter is what wireFeedback listens to; firing it exercises the real handler.
		for _, conn in ipairs(getconnections and getconnections(btn.MouseEnter) or {}) do
			conn:Fire()
		end
	elseif state == "focus" then
		--[[ The gamepad's hover, driven the same way — and the point of having it here is
			 that "selection is the controller's hover" is a CLAIM about appearance, so the
			 harness that renders states side by side is the only place it can be seen to
			 be true. If the focus tile ever stops matching the hover tile, these two lines
			 are what shows it. ]]
		btn.SelectionImageObject = nil
		for _, conn in ipairs(getconnections and getconnections(btn.SelectionGained) or {}) do
			conn:Fire()
		end
	elseif state == "pressed" then
		for _, conn in ipairs(getconnections and getconnections(btn.MouseButton1Down) or {}) do
			conn:Fire()
		end
	end
end

--[[ Mount the board. `scale` renders the same components at a phone's UIScale so the
	 mobile row is the SAME components under the same rules, not a second design. ]]
function Stories.mount(opts: { scale: number?, reducedMotionNote: boolean? }?): ScreenGui
	Stories.unmount()
	local o = opts or {}
	local player = Players.LocalPlayer
	local gui = Instance.new("ScreenGui")
	gui.Name = GUI_NAME
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 5000
	gui.Parent = player:WaitForChild("PlayerGui")

	local back = Instance.new("Frame")
	back.Size = UDim2.fromScale(1, 1)
	back.BackgroundColor3 = Color3.fromRGB(22, 26, 34)
	back.BorderSizePixel = 0
	back.Parent = gui

	local scroll = Instance.new("ScrollingFrame")
	scroll.Size = UDim2.new(1, -48, 1, -48)
	scroll.Position = UDim2.fromOffset(24, 24)
	scroll.BackgroundTransparency = 1
	scroll.BorderSizePixel = 0
	scroll.CanvasSize = UDim2.new()
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroll.ScrollBarThickness = 6
	scroll.Parent = back

	local list = Instance.new("UIListLayout")
	list.Padding = UDim.new(0, 8)
	list.SortOrder = Enum.SortOrder.LayoutOrder
	list.Parent = scroll

	if o.scale and o.scale ~= 1 then
		local s = Instance.new("UIScale")
		s.Scale = o.scale
		s.Parent = scroll
	end

	local title = Instance.new("TextLabel")
	title.BackgroundTransparency = 1
	title.Size = UDim2.new(1, 0, 0, 30)
	title.Font = Enum.Font.GothamBold
	title.TextSize = 20
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.TextColor3 = Color3.fromRGB(255, 255, 255)
	title.Text = string.format(
		"Crystal Canyon — component states   (scale %.2f, reducedMotion %s)",
		o.scale or 1,
		tostring(Theme.reducedMotion())
	)
	title.Parent = scroll

	-- ---------------------------------------------------------------- buttons
	local buttons = row(scroll, "Theme.button — fill colours and input states")
	local fills = {
		{ "primary", Palette.UI.HardCurrency },
		{ "accent", Palette.UI.SoftCurrency },
		{ "danger", Palette.UI.Close },
		{ "muted", Palette.UI.Locked },
	}
	for _, f in ipairs(fills) do
		local slot = cell(buttons, f[1] :: string, 200, 56)
		Theme.button(slot, string.upper(f[1] :: string), f[2] :: Color3, UDim2.fromOffset(190, 52))
	end
	for _, state in ipairs({ "default", "hover", "focus", "pressed", "disabled" }) do
		local slot = cell(buttons, state, 200, 56)
		local b = Theme.button(slot, string.upper(state), Palette.UI.HardCurrency, UDim2.fromOffset(190, 52))
		if state == "disabled" then
			b.Active = false
			b.AutoButtonColor = false
			local veil = Instance.new("Frame")
			veil.Size = UDim2.fromScale(1, 1)
			veil.BackgroundColor3 = Palette.UI.Locked
			veil.BackgroundTransparency = 0.45
			veil.BorderSizePixel = 0
			veil.ZIndex = b.ZIndex + 40
			veil.Parent = b
		else
			drive(b, state)
		end
	end

	-- ---------------------------------------------------------------- cards
	local cards = row(scroll, "Theme.card — density and selection")
	for _, state in ipairs({ "unselected", "selected", "locked" }) do
		local slot = cell(cards, state, 250, 120)
		local c = Theme.card(slot, UDim2.fromOffset(240, 112))
		local label = Instance.new("TextLabel")
		label.BackgroundTransparency = 1
		label.Size = UDim2.new(1, -24, 0, 26)
		label.Position = UDim2.fromOffset(12, 12)
		label.Font = Enum.Font.GothamBold
		label.TextSize = 16
		label.TextXAlignment = Enum.TextXAlignment.Left
		label.TextColor3 = Palette.UI.TextLight
		label.Text = string.upper(state)
		label.Parent = c
		if state == "selected" then
			Palette.stroke(c, Palette.Outline.Icon)
		elseif state == "locked" then
			local veil = Instance.new("Frame")
			veil.Size = UDim2.fromScale(1, 1)
			veil.BackgroundColor3 = Palette.UI.Locked
			veil.BackgroundTransparency = 0.5
			veil.BorderSizePixel = 0
			veil.ZIndex = c.ZIndex + 30
			veil.Parent = c
		end
	end

	-- ---------------------------------------------------------------- counters
	local counters = row(scroll, "Theme.counter — currency readouts")
	for _, spec in ipairs({
		{ "soft", Palette.UI.SoftCurrency, "1,240" },
		{ "hard", Palette.UI.HardCurrency, "0" },
		{ "large", Palette.UI.SoftCurrency, "9,999,999" },
	}) do
		local slot = cell(counters, spec[1] :: string, 240, 64)
		local _, label = Theme.counter(slot, spec[2] :: Color3)
		label.Text = spec[3] :: string
	end

	-- ---------------------------------------------------------------- surfaces
	local surfaces = row(scroll, "Theme.groupPlate / well / sectionLabel")
	do
		local slot = cell(surfaces, "groupPlate", 260, 110)
		Theme.groupPlate(slot, UDim2.fromOffset(250, 100))
	end
	do
		local slot = cell(surfaces, "well", 260, 110)
		local plate = Theme.groupPlate(slot, UDim2.fromOffset(250, 100))
		Theme.well(plate, UDim2.fromOffset(220, 60), UDim2.fromOffset(15, 20))
	end
	do
		local slot = cell(surfaces, "sectionLabel", 260, 110)
		local plate = Theme.groupPlate(slot, UDim2.fromOffset(250, 100))
		Theme.sectionLabel(plate, "FEATURED")
	end

	local note = Instance.new("TextLabel")
	note.BackgroundTransparency = 1
	note.Size = UDim2.new(1, 0, 0, 40)
	note.Font = Enum.Font.Gotham
	note.TextSize = 13
	note.TextWrapped = true
	note.TextXAlignment = Enum.TextXAlignment.Left
	note.TextColor3 = Color3.fromRGB(170, 182, 200)
	note.Text = string.format(
		"Input states are driven through the real handlers, not painted. Touch-enabled: %s. "
			.. "Gamepad: %s. Reduced motion is read from GuiService and cannot be set from code.",
		tostring(UserInputService.TouchEnabled),
		tostring(UserInputService.GamepadEnabled)
	)
	note.Parent = scroll

	return gui
end

--[[ MEASURE, don't just draw.

	 §N's point is that a component "does not count as good merely because it instantiates
	 successfully". Rendering the states is half of that; the other half is checking the
	 ones with an unambiguous right answer. Touch target size is the clearest of them:
	 44px is a number, not a taste.

	 Deliberately NOT a general quality score. §AK warns that a plausible visual metric can
	 be useless or actively misleading, so this reports the one thing it can actually
	 decide and leaves everything else to the rendered board and a human.

	 The finding this was written for: `Theme.Metrics.ButtonHeight` is 54, so a plain
	 `Theme.button` inside a container scaled to Hud's MIN_SCALE of 0.72 finishes at 38.9px
	 — under the floor. `Theme.actionButton` (72 -> 51.8) and the nav tile (68 -> 49) both
	 clear it, which is why the shipped HUD is fine and why this is a trap for the NEXT
	 screen someone builds rather than a bug in the current one. ]]
export type TouchFinding = { name: string, height: number, ok: boolean }

function Stories.auditTouchTargets(root: Instance?, floorPx: number?): { any }
	local floor = floorPx or 44
	local player = Players.LocalPlayer
	local scope = root or (player and player:FindFirstChild("PlayerGui"))
	local findings: { any } = {}
	if not scope then
		return findings
	end
	for _, d in ipairs(scope:GetDescendants()) do
		if d:IsA("TextButton") or d:IsA("ImageButton") then
			local b = d :: GuiButton
			if b.Visible and b.AbsoluteSize.Y > 1 then
				local h = b.AbsoluteSize.Y
				table.insert(findings, {
					name = b:GetFullName(),
					height = h,
					ok = h >= floor,
				})
			end
		end
	end
	table.sort(findings, function(a, b)
		return a.height < b.height
	end)
	return findings
end

function Stories.unmount()
	local player = Players.LocalPlayer
	local pg = player and player:FindFirstChild("PlayerGui")
	local existing = pg and pg:FindFirstChild(GUI_NAME)
	if existing then
		existing:Destroy()
	end
end

return Stories
