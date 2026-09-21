-- Horror HUD — screen-hud construction + horror genre kit
local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- coreUiCollision: custom health/sanity meter replaces the core one
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local function make(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local screenGui = make("ScreenGui", {
	Name = "HorrorHud",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, playerGui)

-- Palette (horror kit: near-black chrome, bone text, blood accent)
local C_BG = Color3.fromRGB(12, 10, 12)
local C_PANEL = Color3.fromRGB(22, 18, 22)
local C_BONE = Color3.fromRGB(214, 205, 190)
local C_DIM = Color3.fromRGB(120, 112, 108)
local C_BLOOD = Color3.fromRGB(148, 26, 30)
local C_SANITY = Color3.fromRGB(96, 60, 140)

local function panel(props, parent)
	local f = make("Frame", props, parent)
	make("UICorner", { CornerRadius = UDim.new(0, 6) }, f)
	make("UIStroke", { Color = Color3.fromRGB(60, 50, 52), Thickness = 1 }, f)
	return f
end

local function label(props, parent)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.Gotham
	props.TextColor3 = props.TextColor3 or C_BONE
	props.TextSize = props.TextSize or 14
	return make("TextLabel", props, parent)
end

-- ============ TOP-CENTRE BAND: sanity meter (compact, animated fill not a panel) ============
local sanityFrame = panel({
	Name = "SanityMeter",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim.new(0.5, 0, 0, 44), -- below the 36px top bar
	Size = UDim.new(0, 260, 0, 30),
	BackgroundColor3 = C_PANEL,
}, screenGui)
label({
	Name = "Title",
	Position = UDim.new(0, 10, 0, 0),
	Size = UDim.new(0, 90, 1, 0),
	Text = "SANITY",
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = C_DIM,
	TextSize = 12,
}, sanityFrame)
local sanityTrack = make("Frame", {
	Name = "Track",
	Position = UDim.new(0, 70, 0.5, -5),
	Size = UDim.new(1, -80, 0, 10),
	BackgroundColor3 = Color3.fromRGB(30, 24, 30),
	BorderSizePixel = 0,
}, sanityFrame)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, sanityTrack)
local sanityFill = make("Frame", {
	Name = "Fill",
	Size = UDim.new(0.62, 0, 1, 0),
	BackgroundColor3 = C_SANITY,
	BorderSizePixel = 0,
}, sanityTrack)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, sanityFill)
label({
	Name = "Value",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim.new(1, -8, 0.5, 0),
	Size = UDim.new(0, 40, 1, 0),
	Text = "62%",
	TextXAlignment = Enum.TextXAlignment.Right,
	TextSize = 12,
	TextColor3 = C_BONE,
}, sanityFrame)

-- ============ LEFT EDGE below top bar: health meter (custom, core disabled above) ============
local healthFrame = panel({
	Name = "HealthMeter",
	Position = UDim.new(0, 12, 0, 44),
	Size = UDim.new(0, 220, 0, 30),
	BackgroundColor3 = C_PANEL,
}, screenGui)
label({
	Name = "Title",
	Position = UDim.new(0, 10, 0, 0),
	Size = UDim.new(0, 70, 1, 0),
	Text = "VITALS",
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = C_DIM,
	TextSize = 12,
}, healthFrame)
local healthTrack = make("Frame", {
	Name = "Track",
	Position = UDim.new(0, 66, 0.5, -5),
	Size = UDim.new(1, -76, 0, 10),
	BackgroundColor3 = Color3.fromRGB(30, 24, 30),
	BorderSizePixel = 0,
}, healthFrame)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, healthTrack)
local healthFill = make("Frame", {
	Name = "Fill",
	Size = UDim.new(0.85, 0, 1, 0),
	BackgroundColor3 = C_BLOOD,
	BorderSizePixel = 0,
}, healthTrack)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, healthFill)

-- ============ LEFT EDGE below health: quest tracker ============
local questFrame = panel({
	Name = "QuestTracker",
	Position = UDim.new(0, 12, 0, 84),
	Size = UDim.new(0, 220, 0, 96),
	BackgroundColor3 = C_PANEL,
}, screenGui)
label({
	Name = "Header",
	Position = UDim.new(0, 10, 0, 6),
	Size = UDim.new(1, -20, 0, 16),
	Text = "OBJECTIVE — FLOOR 2",
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = C_BLOOD,
	TextSize = 12,
	Font = Enum.Font.GothamBold,
}, questFrame)
local questList = make("Frame", {
	Name = "List",
	Position = UDim.new(0, 10, 0, 26),
	Size = UDim.new(1, -20, 1, -34),
	BackgroundTransparency = 1,
}, questFrame)
make("UIListLayout", {
	Padding = UDim.new(0, 4),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, questList)
local objectives = {
	{ "Find the brass key in the nursery", false },
	{ "Light the three hallway candles", true },
	{ "Escape through the cellar door", false },
}
for i, obj in ipairs(objectives) do
	local row = make("Frame", {
		Name = "Obj" .. i,
		Size = UDim.new(1, 0, 0, 16),
		BackgroundTransparency = 1,
		LayoutOrder = i,
	}, questList)
	label({
		Size = UDim.new(0, 14, 1, 0),
		Text = obj[2] and "✓" or "○",
		TextColor3 = obj[2] and C_BONE or C_DIM,
		TextSize = 12,
	}, row)
	label({
		Position = UDim.new(0, 18, 0, 0),
		Size = UDim.new(1, -18, 1, 0),
		Text = obj[1],
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = obj[2] and C_DIM or C_BONE,
		TextSize = 12,
	}, row)
end

-- ============ TOP-CENTRE: currency pill (candles collected) ============
local pill = panel({
	Name = "CurrencyPill",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim.new(0.5, 0, 0, 8),
	Size = UDim.new(0, 130, 0, 28),
	BackgroundColor3 = C_BG,
}, screenGui)
make("UIStroke", { Color = C_BLOOD, Thickness = 1 }, pill)
label({
	Name = "Icon",
	Position = UDim.new(0, 10, 0, 0),
	Size = UDim.new(0, 16, 1, 0),
	Text = "🕯",
	TextSize = 14,
}, pill)
label({
	Name = "Amount",
	Position = UDim.new(0, 30, 0, 0),
	Size = UDim.new(1, -40, 1, 0),
	Text = "7 CANDLES",
	TextXAlignment = Enum.TextXAlignment.Left,
	TextSize = 12,
	Font = Enum.Font.GothamBold,
}, pill)

-- ============ MID-RIGHT: minimap ============
local minimap = panel({
	Name = "Minimap",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim.new(1, -12, 0, 0.35),
	Size = UDim.new(0, 150, 0, 150),
	BackgroundColor3 = C_BG,
}, screenGui)
make("UIStroke", { Color = Color3.fromRGB(60, 50, 52), Thickness = 1 }, minimap)
label({
	Name = "MapTitle",
	Position = UDim.new(0, 8, 0, 4),
	Size = UDim.new(1, -16, 0, 14),
	Text = "BLACKWOOD MANOR — GROUND FLOOR",
	TextSize = 10,
	TextColor3 = C_DIM,
	TextXAlignment = Enum.TextXAlignment.Left,
}, minimap)
local mapCanvas = make("Frame", {
	Name = "Canvas",
	Position = UDim.new(0, 8, 0, 22),
	Size = UDim.new(1, -16, 1, -30),
	BackgroundColor3 = Color3.fromRGB(18, 14, 18),
	BorderSizePixel = 0,
}, minimap)
make("UICorner", { CornerRadius = UDim.new(0, 4) }, mapCanvas)
-- room blocks (symmetrical foyer read: central hall, side galleries)
local rooms = {
	{ 0.40, 0.35, 0.20, 0.45, "FOYER" },
	{ 0.10, 0.40, 0.26, 0.30, "LIBRARY" },
	{ 0.64, 0.40, 0.26, 0.30, "DINING" },
	{ 0.40, 0.05, 0.20, 0.26, "STAIRS" },
	{ 0.40, 0.84, 0.20, 0.12, "CELLAR" },
}
for i, r in ipairs(rooms) do
	local room = make("Frame", {
		Name = "Room" .. r[5],
		Position = UDim.new(r[1], 0, r[2], 0),
		Size = UDim.new(r[3], 0, r[4], 0),
		BackgroundColor3 = Color3.fromRGB(40, 32, 38),
		BorderSizePixel = 0,
		ZIndex = 2,
	}, mapCanvas)
	make("UIStroke", { Color = Color3.fromRGB(70, 58, 62), Thickness = 1 }, room)
	label({
		Size = UDim.new(1, 0, 1, 0),
		Text = r[5],
		TextSize = 8,
		TextColor3 = C_DIM,
	}, room)
end
-- player blip in the foyer
make("Frame", {
	Name = "YouBlip",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim.new(0.5, 0, 0.55, 0),
	Size = UDim.new(0, 6, 0, 6),
	BackgroundColor3 = C_BLOOD,
	BorderSizePixel = 0,
	ZIndex = 3,
}, mapCanvas)

-- ============ BOTTOM-CENTRE: button rail ============
local rail = make("Frame", {
	Name = "ButtonRail",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim.new(0.5, 0, 1, -12),
	Size = UDim.new(0, 320, 0, 44),
	BackgroundTransparency = 1,
}, screenGui)
make("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
	Padding = UDim.new(0, 8),
}, rail)
local railButtons = {
	{ "FLASHLIGHT  [F]", C_PANEL },
	{ "HIDE  [H]", C_PANEL },
	{ "PRAY  [R]", C_BLOOD },
}
for i, b in ipairs(railButtons) do
	local btn = make("TextButton", {
		Name = "Btn" .. i,
		Size = UDim.new(0, 100, 1, 0),
		BackgroundColor3 = b[2],
		Text = b[1],
		Font = Enum.Font.GothamBold,
		TextSize = 11,
		TextColor3 = C_BONE,
		AutoButtonColor = true,
		LayoutOrder = i,
	}, rail)
	make("UICorner", { CornerRadius = UDim.new(0, 6) }, btn)
	make("UIStroke", { Color = Color3.fromRGB(60, 50, 52), Thickness = 1 }, btn)
end

-- ============ BOTTOM-CENTRE above rail: toast ============
local toast = panel({
	Name = "Toast",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim.new(0.5, 0, 1, -66),
	Size = UDim.new(0, 380, 0, 32),
	BackgroundColor3 = C_BG,
}, screenGui)
make("UIStroke", { Color = C_BLOOD, Thickness = 1 }, toast)
label({
	Name = "ToastText",
	Position = UDim.new(0, 12, 0, 0),
	Size = UDim.new(1, -24, 1, 0),
	Text = "Something moved in the nursery. The candles flickered.",
	TextXAlignment = Enum.TextXAlignment.Left,
	TextSize = 12,
	TextColor3 = C_BONE,
}, toast)