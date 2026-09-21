-- Obby HUD — LocalScript
local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")
local player = Players.LocalPlayer

-- Core collision: custom stage/health HUD replaces core Health meter
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local gui = Instance.new("ScreenGui")
gui.Name = "ObbyHUD"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local function frame(parent, props)
	local f = Instance.new("Frame")
	f.BackgroundColor3 = props.bg or Color3.fromRGB(24, 26, 34)
	f.BackgroundTransparency = props.trans or 0
	f.BorderSizePixel = 0
	f.AnchorPoint = props.anchor or Vector2.new(0, 0)
	f.Position = props.pos
	f.Size = props.size
	if props.corner then
		local c = Instance.new("UICorner")
		c.CornerRadius = UDim.new(0, props.corner)
		c.Parent = f
	end
	if props.stroke then
		local s = Instance.new("UIStroke")
		s.Color = props.stroke
		s.Thickness = 2
		s.Parent = f
	end
	f.Parent = parent
	return f
end

local function label(parent, text, props)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Font = props.font or Enum.Font.GothamBold
	t.TextSize = props.textSize or 16
	t.TextColor3 = props.color or Color3.fromRGB(235, 238, 245)
	t.TextXAlignment = props.xalign or Enum.TextXAlignment.Center
	t.TextYAlignment = Enum.TextYAlignment.Center
	t.Text = text
	t.Position = props.pos or UDim2.new(0, 0, 0, 0)
	t.Size = props.size or UDim2.new(1, 0, 1, 0)
	t.Parent = parent
	return t
end

-- Palette
local COL_PANEL = Color3.fromRGB(24, 26, 34)
local COL_ACCENT = Color3.fromRGB(255, 170, 40)
local COL_GREEN = Color3.fromRGB(90, 200, 120)
local COL_BLUE = Color3.fromRGB(70, 140, 240)
local COL_TEXT = Color3.fromRGB(235, 238, 245)
local COL_DIM = Color3.fromRGB(160, 165, 178)

-- ============ TOP-CENTRE BAND: stage pill + timer ============
local topBand = frame(gui, {
	pos = UDim2.new(0.5, 0, 0, 44),
	size = UDim2.new(0, 0, 0, 0),
	bg = Color3.fromRGB(0,0,0), trans = 1,
	anchor = Vector2.new(0.5, 0),
})

local stagePill = frame(topBand, {
	pos = UDim2.new(0.5, 0, 0, 0),
	size = UDim2.new(0, 0, 0, 0),
	bg = COL_PANEL, trans = 0.15, corner = 14, stroke = COL_ACCENT,
	anchor = Vector2.new(0.5, 0),
})
stagePill.Size = UDim2.new(0, 220, 0, 52)
label(stagePill, "STAGE", {
	pos = UDim2.new(0, 0, 0, 6), size = UDim2.new(1, 0, 0, 14),
	textSize = 12, color = COL_DIM,
})
label(stagePill, "Stage 17 / 50", {
	pos = UDim2.new(0, 0, 0, 20), size = UDim2.new(1, 0, 0, 26),
	textSize = 22, color = COL_ACCENT,
})

local timerPill = frame(topBand, {
	pos = UDim2.new(0.5, 0, 0, 60),
	size = UDim2.new(0, 160, 0, 34),
	bg = COL_PANEL, trans = 0.15, corner = 10, stroke = COL_BLUE,
	anchor = Vector2.new(0.5, 0),
})
label(timerPill, "⏱ 04:32", { textSize = 16, color = COL_TEXT })

-- ============ LEFT EDGE: quest tracker (below top bar) ============
local questPanel = frame(gui, {
	pos = UDim2.new(0, 12, 0, 48),
	size = UDim2.new(0, 230, 0, 118),
	bg = COL_PANEL, trans = 0.2, corner = 12, stroke = Color3.fromRGB(60, 64, 78),
})
label(questPanel, "DAILY OBBY QUESTS", {
	pos = UDim2.new(0, 12, 0, 8), size = UDim2.new(1, -24, 0, 16),
	textSize = 13, color = COL_ACCENT, xalign = Enum.TextXAlignment.Left,
})

local function questRow(parent, y, name, pct, done)
	local row = frame(parent, {
		pos = UDim2.new(0, 12, 0, y),
		size = UDim2.new(1, -24, 0, 26),
		bg = Color3.fromRGB(0,0,0), trans = 1,
	})
	label(row, name, {
		pos = UDim2.new(0, 0, 0, 0), size = UDim2.new(0.62, 0, 0, 14),
		textSize = 12, color = COL_TEXT, xalign = Enum.TextXAlignment.Left,
	})
	label(row, done and "DONE" or (tostring(pct) .. "%"), {
		pos = UDim2.new(0.62, 0, 0, 0), size = UDim2.new(0.38, 0, 0, 14),
		textSize = 12, color = done and COL_GREEN or COL_DIM, xalign = Enum.TextXAlignment.Right,
	})
	local barBg = frame(row, {
		pos = UDim2.new(0, 0, 0, 18), size = UDim2.new(1, 0, 0, 6),
		bg = Color3.fromRGB(40, 43, 54), corner = 3,
	})
	local fill = frame(barBg, {
		pos = UDim2.new(0, 0, 0, 0),
		size = UDim2.new(done and 1 or (pct / 100), 0, 1, 0),
		bg = done and COL_GREEN or COL_BLUE, corner = 3,
	})
end

questRow(questPanel, 30, "Reach Stage 25", 68, false)
questRow(questPanel, 60, "Collect 50 coins", 84, false)
questRow(questPanel, 90, "Finish without dying", 0, true)

-- ============ CURRENCY PILL: coins, top-centre under timer ============
local coinPill = frame(gui, {
	pos = UDim2.new(0.5, 0, 0, 102),
	size = UDim2.new(0, 140, 0, 34),
	bg = COL_PANEL, trans = 0.15, corner = 10, stroke = COL_GREEN,
	anchor = Vector2.new(0.5, 0),
})
label(coinPill, "🪙 1,240", { textSize = 16, color = COL_GREEN })

-- ============ MID-RIGHT: checkpoint toast stack ============
local toastStack = frame(gui, {
	pos = UDim2.new(1, -12, 0.42, 0),
	size = UDim2.new(0, 240, 0, 0),
	bg = Color3.fromRGB(0,0,0), trans = 1,
	anchor = Vector2.new(1, 0),
})
local toastLayout = Instance.new("UIListLayout")
toastLayout.FillDirection = Enum.FillDirection.Vertical
toastLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
toastLayout.VerticalAlignment = Enum.VerticalAlignment.Top
toastLayout.Padding = UDim.new(0, 8)
toastLayout.Parent = toastStack

local function toast(text, accent)
	local t = frame(toastStack, {
		size = UDim2.new(0, 240, 0, 40),
		bg = COL_PANEL, trans = 0.1, corner = 10, stroke = accent,
	})
	label(t, text, {
		pos = UDim2.new(0, 12, 0, 0), size = UDim2.new(1, -24, 1, 0),
		textSize = 14, color = COL_TEXT, xalign = Enum.TextXAlignment.Left,
	})
end

toast("✅ Checkpoint saved — Stage 17", COL_GREEN)
toast("🏆 New best time: 04:32", COL_ACCENT)

-- ============ BOTTOM-CENTRE: button rail ============
local rail = frame(gui, {
	pos = UDim2.new(0.5, 0, 1, -12),
	size = UDim2.new(0, 0, 0, 0),
	bg = Color3.fromRGB(0,0,0), trans = 1,
	anchor = Vector2.new(0.5, 1),
})
local railLayout = Instance.new("UIListLayout")
railLayout.FillDirection = Enum.FillDirection.Horizontal
railLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
railLayout.VerticalAlignment = Enum.VerticalAlignment.Bottom
railLayout.Padding = UDim.new(0, 10)
railLayout.Parent = rail

local function railButton(text, accent)
	local b = frame(rail, {
		size = UDim2.new(0, 118, 0, 46),
		bg = COL_PANEL, trans = 0.15, corner = 12, stroke = accent,
	})
	label(b, text, { textSize = 15, color = COL_TEXT })
end

railButton("◀ Prev Stage", COL_DIM)
railButton("Stage Select", COL_ACCENT)
railButton("Next Stage ▶", COL_DIM)
railButton("Spectate", COL_BLUE)
railButton("Lobby", COL_GREEN)