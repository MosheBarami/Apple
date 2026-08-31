--!strict
--[[
	Crystal Canyon — the HUD.

	Everything this module draws lives against a screen edge. §6 of the style
	spec calls that out as a hard rule and as the most common way a first
	attempt fails: the centre of the screen belongs to the world, not to us. The
	only thing this file puts near the middle is the objective chip's mount
	point, which is pinned to the very top edge and owned by Objective.luau.

	The HUD is a pure renderer. It holds no economy state of its own: every
	number on screen comes from the last `Sync` snapshot the server pushed, and
	every button sends intent and then waits to be told what happened. If the
	server refuses a sell, the numbers simply never change — there is no local
	prediction to roll back, and nothing here can be edited into free currency.

	Layout (all clusters anchored to an edge, all scaled together for touch):

	  top-left     SHARDS pill / COINS pill / pack-fill bar
	  left edge    SHOP · UPGRADES · CODES · ZONES  (circular icon buttons)
	  right edge   SELL SHARDS pill + payout chip
	  top-centre   objective mount (empty; Objective.luau fills it)
	  bottom-left  version string
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Util = require(Shared:WaitForChild("Util"))
local Theme = require(script.Parent:WaitForChild("Theme"))

local Hud = {}

export type HudState = {
	coins: number?,
	shards: number?,
	packCapacity: number?,
	upgrades: { [string]: number }?,
	zones: { [string]: boolean }?,
	objective: number?,
}

export type Deps = {
	remotes: { [string]: RemoteEvent },
	openPanel: (panelId: string) -> (),
}

-- Metrics ------------------------------------------------------------------
-- Chunky by policy (§3). These are the unscaled desktop sizes; a per-cluster
-- UIScale shrinks them on small viewports, never below the touch floor below.
local M = {
	Margin = 14,
	PillHeight = 54,
	PillGap = 8,
	BarHeight = 34,
	BarKnob = 42, -- the icon knob at the left end of the pack bar
	IconSize = 62,
	IconGap = 14,
	CaptionHeight = 15,
	SellHeight = 64,
	ChipHeight = 26,
	ObjectiveHeight = 56,
}

-- The smallest comfortable touch target is 44px. MinScale is chosen so that
-- IconSize (62) never renders smaller than that: 62 * 0.72 = 44.6.
local MIN_SCALE = 0.72
local MAX_SCALE = 1

local BUTTONS = {
	{ Id = "shop", Caption = "SHOP", Art = "bag", Fill = Palette.UI.HeaderCyan },
	{ Id = "upgrades", Caption = "UPGRADES", Art = "arrow", Fill = Palette.UI.HeaderPurple },
	{ Id = "codes", Caption = "CODES", Art = "key", Fill = Palette.UI.Premium },
	{ Id = "zones", Caption = "ZONES", Art = "pin", Fill = Palette.UI.HeaderGreen },
}

-- Runtime handles ----------------------------------------------------------
local gui: ScreenGui? = nil
local scales: { UIScale } = {}
local viewportConn: RBXScriptConnection? = nil

local shardsLabel: TextLabel? = nil
local shardsPill: Frame? = nil
local coinsLabel: TextLabel? = nil
local coinsPill: Frame? = nil
local barFill: Frame? = nil
local barLabel: TextLabel? = nil
local sellButton: TextButton? = nil
local sellVeil: Frame? = nil
local payoutLabel: TextLabel? = nil
local objectiveMount: Frame? = nil
local dots: { [string]: Frame } = {}

local lastShards = -1
local lastCoins = -1
local lastSellAt = 0

-- Helpers ------------------------------------------------------------------

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ A cluster is a transparent, edge-anchored container that owns one region
	 of the HUD. Each carries its own UIScale rather than the HUD sharing a
	 single one at the root: a UIScale on a full-screen frame shrinks that frame
	 about its anchor point, which would drag every edge-anchored child inward
	 and leave a growing dead margin on small screens. Scaling per cluster keeps
	 each one welded to its own edge at any viewport size. ]]
local function cluster(parent: Instance, name: string, anchor: Vector2, position: UDim2, size: UDim2): Frame
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundTransparency = 1
	frame.AnchorPoint = anchor
	frame.Position = position
	frame.Size = size
	frame.Parent = parent

	local scale = Instance.new("UIScale")
	scale.Parent = frame
	table.insert(scales, scale)

	return frame
end

--[[ Widths are part-relative so the HUD breathes on a wider monitor, but a
	 relative width alone turns a currency pill into a 700px slab on an
	 ultrawide. The constraint is what keeps it a pill. ]]
local function constrain(frame: Frame, minWidth: number, maxWidth: number)
	local c = Instance.new("UISizeConstraint")
	c.MinSize = Vector2.new(minWidth, 0)
	c.MaxSize = Vector2.new(maxWidth, math.huge)
	c.Parent = frame
end

local function computeScale(): number
	local camera = workspace.CurrentCamera
	if not camera then
		return MAX_SCALE
	end
	local v = camera.ViewportSize
	if v.X <= 0 or v.Y <= 0 then
		return MAX_SCALE
	end
	-- Both axes matter: a short landscape phone is as tight as a narrow
	-- portrait one, and the left icon stack is what runs out of room first.
	return math.clamp(math.min(v.X / 1100, v.Y / 760), MIN_SCALE, MAX_SCALE)
end

-- Width rules, kept next to each other because the collision check below is
-- only honest if it uses exactly the numbers the two clusters are built from.
local CURRENCY_WIDTH = { Fraction = 0.2, Min = 212, Max = 300 }
local SELL_WIDTH = { Fraction = 0.22, Min = 214, Max = 320 }
local OBJECTIVE_WIDTH = { Fraction = 0.34, Min = 300, Max = 480 }
local CURRENCY_HEIGHT = M.PillHeight * 2 + M.PillGap + M.BarKnob + 10

--[[ On a phone the top-left currency column and a centred objective chip want
	 the same pixels: at 390 wide the column already reaches past the point where
	 a 300px-minimum chip would start, and no amount of scaling fixes that
	 because both have a floor. Rather than let them overlap — or shrink the chip
	 until its text is unreadable — the chip steps down below the column. It is
	 still pinned to the top band, so the middle of the screen stays empty. ]]
local function layoutObjective(s: number)
	local mount = objectiveMount
	if not mount then
		return
	end
	local camera = workspace.CurrentCamera
	local vx = camera and camera.ViewportSize.X or 1920
	local columnRight = M.Margin + math.clamp(vx * CURRENCY_WIDTH.Fraction, CURRENCY_WIDTH.Min, CURRENCY_WIDTH.Max) * s
	local chipLeft = vx / 2
		- math.clamp(vx * OBJECTIVE_WIDTH.Fraction, OBJECTIVE_WIDTH.Min, OBJECTIVE_WIDTH.Max) * s / 2

	local y = M.Margin
	if chipLeft < columnRight + 8 then
		y = M.Margin + CURRENCY_HEIGHT * s + 8
	end
	mount.Position = UDim2.new(0.5, 0, 0, y)
end

local function applyScale()
	local s = computeScale()
	for _, scale in scales do
		scale.Scale = s
	end
	layoutObjective(s)
end

--[[ A single white shape inside a 30x30 pictogram frame. Coordinates are
	 centre-relative within that box, so the art below reads like a tiny
	 drawing rather than a pile of offsets. ]]
local function pip(
	parent: Instance,
	w: number,
	h: number,
	x: number,
	y: number,
	radius: number,
	z: number,
	fill: Color3?,
	rotation: number?
): Frame
	local f = Instance.new("Frame")
	f.BackgroundColor3 = fill or Palette.UI.TextLight
	f.BorderSizePixel = 0
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.Position = UDim2.fromOffset(x, y)
	f.Size = UDim2.fromOffset(w, h)
	f.Rotation = rotation or 0
	f.ZIndex = z
	corner(f, UDim.new(0, radius))
	f.Parent = parent
	return f
end

--[[ Pictograms are built from primitives instead of images or emoji. §4 allows
	 emoji as ornament only and bans them as functional icons, and this build
	 ships no uploaded assets, so the icon buttons draw their own glyphs. A
	 shape filled with the button's own colour punches a hole in the shape
	 beneath it — that is how the bag handle, the key bow and the pin get their
	 ring without a second stroke. ]]
local function pictogram(button: TextButton, kind: string, fill: Color3)
	local art = Instance.new("Frame")
	art.Name = "Pictogram"
	art.BackgroundTransparency = 1
	art.AnchorPoint = Vector2.new(0.5, 0.5)
	art.Position = UDim2.fromScale(0.5, 0.5)
	art.Size = UDim2.fromOffset(30, 30)
	art.ZIndex = 4
	art.Parent = button

	if kind == "bag" then
		pip(art, 15, 13, 15, 10, 6, 5)
		pip(art, 9, 11, 15, 12, 4, 6, fill)
		pip(art, 23, 17, 15, 20, 5, 7)
	elseif kind == "arrow" then
		pip(art, 6, 15, 15, 20, 3, 5)
		pip(art, 13, 6, 10, 11, 3, 6, nil, -45)
		pip(art, 13, 6, 20, 11, 3, 6, nil, 45)
	elseif kind == "key" then
		pip(art, 15, 15, 15, 9, 8, 5)
		pip(art, 6, 6, 15, 9, 3, 6, fill)
		pip(art, 5, 15, 15, 20, 2, 5)
		pip(art, 8, 4, 19, 20, 2, 5)
		pip(art, 6, 4, 18, 25, 2, 5)
	elseif kind == "pin" then
		pip(art, 11, 11, 15, 20, 2, 5, nil, 45)
		pip(art, 19, 19, 15, 12, 10, 6)
		pip(art, 7, 7, 15, 12, 4, 7, fill)
	end
end

--[[ The little red "you can afford something" dot. It reads the same Config
	 tables the server charges against, so it can never light up for a purchase
	 the server would refuse. ]]
local function badge(button: TextButton): Frame
	local dot = Instance.new("Frame")
	dot.Name = "Badge"
	dot.BackgroundColor3 = Palette.UI.Close
	dot.BorderSizePixel = 0
	dot.AnchorPoint = Vector2.new(0.5, 0.5)
	dot.Position = UDim2.fromScale(0.88, 0.12)
	dot.Size = UDim2.fromOffset(18, 18)
	dot.ZIndex = 8
	dot.Visible = false
	corner(dot, Palette.Radius.Icon)
	Palette.stroke(dot, Palette.Outline.Icon)
	dot.Parent = button
	return dot
end

--[[ Reward feedback has to be visible or it reads as breakage (§8). A short
	 overshoot on the pill whenever its number goes up is the cheapest honest
	 signal that the server credited something. ]]
local function punch(frame: GuiObject)
	local existing = frame:FindFirstChildOfClass("UIScale")
	local s: UIScale
	if existing and existing:IsA("UIScale") then
		s = existing
	else
		s = Instance.new("UIScale")
		s.Parent = frame
	end
	s.Scale = 1.12
	TweenService:Create(s, TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

-- Construction -------------------------------------------------------------

local function buildCounters(parent: Instance)
	local width = UDim2.new(CURRENCY_WIDTH.Fraction, 0, 0, CURRENCY_HEIGHT)
	local box = cluster(parent, "Currency", Vector2.new(0, 0), UDim2.fromOffset(M.Margin, M.Margin), width)
	constrain(box, CURRENCY_WIDTH.Min, CURRENCY_WIDTH.Max)

	local shardFrame, shardText = Theme.counter(box, Palette.UI.SoftCurrency, UDim2.fromOffset(0, 0))
	local coinFrame, coinText =
		Theme.counter(box, Palette.UI.HardCurrency, UDim2.fromOffset(0, M.PillHeight + M.PillGap))
	-- Theme sizes a counter for a standalone pill; the HUD overrides the width
	-- so both pills and the bar beneath them share one left column edge.
	shardFrame.Size = UDim2.new(1, 0, 0, M.PillHeight)
	coinFrame.Size = UDim2.new(1, 0, 0, M.PillHeight)

	shardsPill, shardsLabel = shardFrame, shardText
	coinsPill, coinsLabel = coinFrame, coinText

	-- Pack-fill bar --------------------------------------------------------
	local row = Instance.new("Frame")
	row.Name = "PackBar"
	row.BackgroundTransparency = 1
	row.Position = UDim2.fromOffset(0, M.PillHeight * 2 + M.PillGap + 10)
	row.Size = UDim2.new(1, 0, 0, M.BarKnob)
	row.Parent = box

	local track = Instance.new("Frame")
	track.Name = "Track"
	track.BackgroundColor3 = Palette.UI.CounterFill
	track.BorderSizePixel = 0
	track.AnchorPoint = Vector2.new(0, 0.5)
	track.Position = UDim2.new(0, M.BarKnob // 2, 0.5, 0)
	track.Size = UDim2.new(1, -(M.BarKnob // 2), 0, M.BarHeight)
	track.ZIndex = 2
	corner(track, Palette.Radius.Pill)
	Palette.stroke(track, Palette.Outline.Card)
	track.Parent = row

	-- Padding is what insets the fill inside the track's outline; sizing the
	-- fill by scale against the padded area keeps the inset exact at every
	-- viewport width instead of guessing an offset.
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 4)
	pad.PaddingBottom = UDim.new(0, 4)
	pad.PaddingLeft = UDim.new(0, 4)
	pad.PaddingRight = UDim.new(0, 4)
	pad.Parent = track

	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.BackgroundColor3 = Palette.UI.SoftCurrency
	fill.BorderSizePixel = 0
	fill.Size = UDim2.new(0, 0, 1, 0)
	fill.ZIndex = 3
	corner(fill, Palette.Radius.Pill)
	fill.Parent = track

	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new(Palette.lift(Palette.UI.SoftCurrency), Palette.shade(Palette.UI.SoftCurrency, 0.12))
	grad.Parent = fill

	local label = Instance.new("TextLabel")
	label.Name = "Amount"
	label.Size = UDim2.new(1, 0, 1, 0)
	label.ZIndex = 5
	label.Text = "0 / 0"
	Palette.styleText(label, Palette.TextSize.Small)
	label.Parent = track

	local knob = Instance.new("Frame")
	knob.Name = "Knob"
	knob.BackgroundColor3 = Palette.UI.SoftCurrency
	knob.BorderSizePixel = 0
	knob.AnchorPoint = Vector2.new(0.5, 0.5)
	knob.Position = UDim2.new(0, M.BarKnob // 2, 0.5, 0)
	knob.Size = UDim2.fromOffset(M.BarKnob, M.BarKnob)
	knob.ZIndex = 6
	corner(knob, Palette.Radius.Icon)
	Palette.stroke(knob, Palette.Outline.Icon)
	knob.Parent = row

	-- A shard reads as a diamond: a square stood on its corner.
	local shardGlyph = Instance.new("Frame")
	shardGlyph.BackgroundColor3 = Palette.UI.TextLight
	shardGlyph.BorderSizePixel = 0
	shardGlyph.AnchorPoint = Vector2.new(0.5, 0.5)
	shardGlyph.Position = UDim2.fromScale(0.5, 0.5)
	shardGlyph.Size = UDim2.fromOffset(15, 15)
	shardGlyph.Rotation = 45
	shardGlyph.ZIndex = 7
	corner(shardGlyph, UDim.new(0, 3))
	shardGlyph.Parent = knob

	barFill, barLabel = fill, label
end

local function buildIconStack(parent: Instance, openPanel: (string) -> ())
	local cellHeight = M.IconSize + M.CaptionHeight + 2
	local height = #BUTTONS * cellHeight + (#BUTTONS - 1) * M.IconGap
	local box = cluster(
		parent,
		"Actions",
		Vector2.new(0, 0.5),
		UDim2.new(0, M.Margin, 0.5, 0),
		UDim2.fromOffset(M.IconSize, height)
	)

	local list = Instance.new("UIListLayout")
	list.FillDirection = Enum.FillDirection.Vertical
	list.SortOrder = Enum.SortOrder.LayoutOrder
	list.Padding = UDim.new(0, M.IconGap)
	list.Parent = box

	for index, entry in BUTTONS do
		local cell = Instance.new("Frame")
		cell.Name = entry.Caption
		cell.BackgroundTransparency = 1
		cell.LayoutOrder = index
		cell.Size = UDim2.fromOffset(M.IconSize, cellHeight)
		cell.Parent = box

		-- The label argument is deliberately empty: a four-to-eight letter word
		-- squeezed inside a 62px circle is unreadable, so the glyph is drawn as
		-- vector art and the word goes underneath the button where it fits.
		local button = Theme.iconButton(cell, "", entry.Fill, UDim2.fromOffset(0, 0))
		button.Size = UDim2.fromOffset(M.IconSize, M.IconSize)
		pictogram(button, entry.Art, entry.Fill)
		dots[entry.Id] = badge(button)

		local caption = Instance.new("TextLabel")
		caption.Name = "Caption"
		caption.Position = UDim2.fromOffset(-8, M.IconSize + 2)
		caption.Size = UDim2.fromOffset(M.IconSize + 16, M.CaptionHeight)
		caption.Text = entry.Caption
		Palette.styleText(caption, 13)
		caption.Parent = cell

		local id = entry.Id
		button.Activated:Connect(function()
			openPanel(id)
		end)
	end
end

local function buildSell(parent: Instance, sellRemote: RemoteEvent)
	local box = cluster(
		parent,
		"Sell",
		Vector2.new(1, 0.5),
		UDim2.new(1, -M.Margin, 0.5, 0),
		UDim2.new(SELL_WIDTH.Fraction, 0, 0, M.SellHeight + 6 + M.ChipHeight)
	)
	constrain(box, SELL_WIDTH.Min, SELL_WIDTH.Max)

	local button =
		Theme.button(box, "SELL SHARDS", Palette.UI.Buy, UDim2.new(1, 0, 0, M.SellHeight), UDim2.fromOffset(0, 0))

	-- Padding shifts the button's centred caption clear of the leading icon
	-- without the HUD having to know how Theme laid the text out.
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 40)
	pad.Parent = button

	local icon = Instance.new("Frame")
	icon.Name = "Icon"
	icon.BackgroundColor3 = Palette.UI.SoftCurrency
	icon.BorderSizePixel = 0
	icon.AnchorPoint = Vector2.new(0, 0.5)
	icon.Position = UDim2.new(0, -26, 0.5, 0)
	icon.Size = UDim2.fromOffset(28, 28)
	icon.Rotation = 45
	icon.ZIndex = 4
	corner(icon, UDim.new(0, 5))
	Palette.stroke(icon, Palette.Outline.Icon)
	icon.Parent = button

	-- Disabled state is drawn as a desaturating veil rather than by recolouring
	-- the fill: Theme owns the button's gradient and its hard bottom edge (§3),
	-- and setting BackgroundColor3 alone would leave those two out of sync.
	local veil = Instance.new("Frame")
	veil.Name = "Veil"
	veil.BackgroundColor3 = Palette.UI.Locked
	veil.BackgroundTransparency = 0.4
	veil.BorderSizePixel = 0
	veil.Size = UDim2.new(1, 0, 1, 0)
	veil.ZIndex = 10
	veil.Visible = false
	corner(veil, Palette.Radius.Pill)
	veil.Parent = button

	local chip = Instance.new("Frame")
	chip.Name = "Payout"
	chip.BackgroundColor3 = Palette.UI.CounterFill
	chip.BorderSizePixel = 0
	chip.Position = UDim2.fromOffset(0, M.SellHeight + 6)
	chip.Size = UDim2.new(1, 0, 0, M.ChipHeight)
	corner(chip, Palette.Radius.Pill)
	Palette.stroke(chip, Palette.Outline.Card)
	chip.Parent = box

	local chipText = Instance.new("TextLabel")
	chipText.Name = "Amount"
	chipText.Size = UDim2.new(1, 0, 1, 0)
	chipText.ZIndex = 2
	chipText.Text = "+0 COINS"
	Palette.styleText(chipText, 14, Palette.UI.SoftCurrency)
	chipText.Parent = chip

	button.Activated:Connect(function()
		-- Cosmetic only. The server measures proximity to the sell pad, owns the
		-- cooldown, and rate-limits the remote; this exists so a mashed button
		-- does not spend the player's own token bucket on calls that would be
		-- refused anyway. Bypassing it in an exploit client changes nothing.
		local now = os.clock()
		if now - lastSellAt < Config.Sell.CooldownSeconds then
			return
		end
		lastSellAt = now
		sellRemote:FireServer()
	end)

	sellButton, sellVeil, payoutLabel = button, veil, chipText
end

local function buildObjectiveMount(parent: Instance)
	-- The one thing allowed near the middle, and it is pinned to the very top
	-- edge so the playfield below it stays clear (§6).
	local box = cluster(
		parent,
		"Objective",
		Vector2.new(0.5, 0),
		UDim2.new(0.5, 0, 0, M.Margin),
		UDim2.new(OBJECTIVE_WIDTH.Fraction, 0, 0, M.ObjectiveHeight)
	)
	constrain(box, OBJECTIVE_WIDTH.Min, OBJECTIVE_WIDTH.Max)
	objectiveMount = box
end

local function buildVersion(parent: Instance)
	local label = Instance.new("TextLabel")
	label.Name = "Version"
	label.AnchorPoint = Vector2.new(0, 1)
	label.Position = UDim2.new(0, M.Margin, 1, -M.Margin)
	label.Size = UDim2.fromOffset(240, 18)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.Text = `{Config.GameName}  v{Config.Version}`
	Palette.styleText(label, 13)
	label.TextTransparency = 0.15
	label.Parent = parent
end

-- Public -------------------------------------------------------------------

function Hud.init(newDeps: Deps)
	assert(typeof(newDeps) == "table", "Hud.init requires deps")
	assert(typeof(newDeps.openPanel) == "function", "Hud.init requires deps.openPanel")
	local sellRemote = newDeps.remotes and newDeps.remotes.Sell
	assert(sellRemote and sellRemote:IsA("RemoteEvent"), "Hud.init requires deps.remotes.Sell")

	if gui then
		-- Re-initialising rebuilds from scratch rather than patching a half-built
		-- tree, so a reload during development cannot leave two HUDs stacked.
		gui:Destroy()
		table.clear(scales)
		table.clear(dots)
	end

	local player = Players.LocalPlayer
	local playerGui = player:WaitForChild("PlayerGui")

	local screen = Instance.new("ScreenGui")
	screen.Name = "CrystalCanyonHud"
	screen.IgnoreGuiInset = false -- keep the top row clear of the Roblox topbar
	screen.ResetOnSpawn = false -- the HUD outlives death; rebuilding it would blank every synced number until the next push
	screen.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	screen.DisplayOrder = 5
	screen.Parent = playerGui
	gui = screen

	buildCounters(screen)
	buildIconStack(screen, newDeps.openPanel)
	buildSell(screen, sellRemote)
	buildObjectiveMount(screen)
	buildVersion(screen)

	applyScale()
	local function bindViewport()
		local camera = workspace.CurrentCamera
		if not camera then
			return
		end
		if viewportConn then
			viewportConn:Disconnect()
		end
		viewportConn = camera:GetPropertyChangedSignal("ViewportSize"):Connect(applyScale)
		applyScale()
	end
	bindViewport()
	-- The camera is replaced on respawn, so the old ViewportSize signal dies
	-- with it; rebinding here is what keeps rotation handling alive.
	workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(bindViewport)

	lastShards, lastCoins = -1, -1
end

--[[ Render one authoritative snapshot. Called by the client boot script for
	 every `Sync`; the HUD never calls itself and never renders a value it
	 predicted. Every field is treated as untrusted-shaped rather than
	 untrusted-valued: the server is the author, but a snapshot from an older
	 build (or one pushed before a field existed) must degrade to something
	 legal instead of erroring out and freezing the whole HUD. ]]
function Hud.render(state: HudState?)
	if not gui or not state then
		return
	end

	local shards = math.max(0, math.floor(tonumber(state.shards) or 0))
	local coins = math.max(0, math.floor(tonumber(state.coins) or 0))
	local upgrades = state.upgrades or {}
	local zones = state.zones or {}

	-- Capacity comes from the snapshot when the server sends it, and otherwise
	-- from the same Config table the server caps against — so the bar can never
	-- advertise a capacity the economy does not enforce. The floor of 1 exists
	-- purely so the ratio below can never divide by zero.
	local packLevel = tonumber(upgrades.pack) or 0
	local capacity = math.max(1, math.floor(tonumber(state.packCapacity) or Config.upgradeValue("pack", packLevel)))
	local ratio = math.clamp(shards / capacity, 0, 1)
	local full = shards >= capacity

	if shardsLabel then
		shardsLabel.Text = Util.comma(shards)
	end
	if coinsLabel then
		coinsLabel.Text = Util.comma(coins)
	end
	if shardsPill and shards > lastShards and lastShards >= 0 then
		punch(shardsPill)
	end
	if coinsPill and coins > lastCoins and lastCoins >= 0 then
		punch(coinsPill)
	end

	if barFill then
		local tint = full and Palette.UI.Close or Palette.UI.SoftCurrency
		local gradient = barFill:FindFirstChildOfClass("UIGradient")
		if gradient then
			gradient.Color = ColorSequence.new(Palette.lift(tint), Palette.shade(tint, 0.12))
		end
		-- Tweened because a shard arrives every few hundred milliseconds and a
		-- snapping bar reads as a glitch rather than as progress.
		TweenService:Create(barFill, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
			Size = UDim2.new(ratio, 0, 1, 0),
			BackgroundColor3 = tint,
		}):Play()
	end
	if barLabel then
		barLabel.Text = full and `FULL — {Util.comma(capacity)}` or `{Util.comma(shards)} / {Util.comma(capacity)}`
	end

	if sellButton and sellVeil then
		local canSell = shards > 0
		sellVeil.Visible = not canSell
		sellButton.Active = canSell
		sellButton.AutoButtonColor = canSell
	end
	if payoutLabel then
		payoutLabel.Text = `+{Util.comma(shards * Config.Sell.CoinsPerShard)} COINS`
	end

	-- Affordability badges. Derived entirely from Config, so a lit dot always
	-- corresponds to a purchase the server would actually accept.
	local canUpgrade = false
	for _, up in Config.Upgrades do
		local cost = Config.upgradeCost(up.Id, tonumber(upgrades[up.Id]) or 0)
		if cost and coins >= cost then
			canUpgrade = true
			break
		end
	end
	local canUnlock = false
	for _, zone in Config.Zones do
		if zone.UnlockCost > 0 and not zones[zone.Id] and coins >= zone.UnlockCost then
			canUnlock = true
			break
		end
	end
	if dots.shop then
		dots.shop.Visible = canUpgrade
	end
	if dots.upgrades then
		dots.upgrades.Visible = canUpgrade
	end
	if dots.zones then
		dots.zones.Visible = canUnlock
	end

	lastShards, lastCoins = shards, coins
end

--[[ Where Objective.luau parents its chip. Returned rather than exposed as a
	 field so a caller that runs before init fails loudly here instead of
	 silently parenting the chip to nil. ]]
function Hud.objectiveMount(): Frame
	local mount = objectiveMount
	assert(mount, "Hud.objectiveMount() called before Hud.init()")
	return mount
end

return Hud
