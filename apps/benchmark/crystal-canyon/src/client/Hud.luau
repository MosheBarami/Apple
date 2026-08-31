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

	Layout (every cluster welded to an edge, each with its own UIScale):

	  top-left     wallet: SHARDS capsule / COINS capsule / pack gauge
	  left edge    nav rail: SHOP · UPGRADES · CODES · ZONES
	  right edge   SELL SHARDS action + payout chip
	  top-centre   objective mount (empty; Objective.luau fills it)
	  bottom-left  version string

	--- what changed, and why ---

	The first pass was rejected as "too many plain black pill-shaped surfaces",
	a side menu that "looks like a basic icon stack", and "insufficient visual
	hierarchy". Three decisions answer that, and each is worth understanding
	before it is undone:

	1. THE NAV IS A CLUSTER, NOT FOUR CIRCLES. The four entries sit on one
	   outlined slate RAIL, and each is a rounded-square tile in its own
	   saturated hue with a dark caption plate notched into its lower edge. A
	   rail is what makes four buttons read as one designed control; the plates
	   are what let the words be legible without shrinking them into the tile.

	2. THE CURRENCY COUNTERS ARE COMPOSITES, NOT PILLS. §6 wants dark rounded
	   currency pills and it gets them — but the body of each is tinted toward
	   its own currency (deep gold for shards, deep green for coins) rather than
	   left at flat charcoal, and each carries a saturated icon plate, a small
	   currency name, and the big number under it. That is three levels of
	   hierarchy inside one surface, which is what the flat pills lacked.

	3. ICONS ARE A FAMILY, DRAWN FROM ONE GRID. All pictograms come from
	   Icons.luau, which draws every glyph on a 32-unit design box entirely in
	   scale units. The previous pass inlined fixed-pixel interiors into
	   scale-positioned art frames here, and the four glyphs drifted apart the
	   moment a tile resized. Nothing in this file draws a glyph any more.

	Buttons still come from `Theme.button` — the nav tiles and the sell action
	included — so the HUD's press feel, gradient and §3 hard bottom edge are
	literally the same code the modals use. The nav tile only overrides the
	corner radius, because §6's circular icon button is the shape the owner
	rejected. Everything Theme does not have a primitive for (the rail, the
	capsules, the gauge, the caption plates) is built here from the same Palette
	tokens, in the same grammar: gradient, hard bottom edge, thick near-black
	outline.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Util = require(Shared:WaitForChild("Util"))
local Theme = require(script.Parent:WaitForChild("Theme"))

--[[ Icons is a sibling ModuleScript, and the wait is deliberately BOUNDED. An
	 untimed WaitForChild here would hang client boot forever on an install whose
	 manifest has not been taught about the module yet; five seconds is far
	 longer than a local install takes. A missing icon set must cost the HUD its
	 pictograms, never the HUD itself. ]]
local Icons: any = nil
do
	local module = script.Parent:WaitForChild("Icons", 5)
	if module and module:IsA("ModuleScript") then
		local ok, result = pcall(require, module)
		if ok then
			Icons = result
		else
			warn(`[CrystalCanyon] Hud: Icons failed to load, drawing without pictograms: {result}`)
		end
	else
		warn("[CrystalCanyon] Hud: Icons module missing, drawing without pictograms")
	end
end

local Hud = {}

--[[ One entry of `Sync.upgrades`, exactly as `Economy.push` builds it.

	 This is NOT a bare level. The previous annotation said `{[string]: number}`,
	 so `tonumber(upgrades[id])` returned nil against the real payload and every
	 upgrade was priced as though it were level 0 — which lit the red "you can
	 afford something" dot for a maxed PACK the server would refuse to sell.

	 `nextCost` is absent (not nil-valued) at max level: a nil field does not
	 survive the remote boundary, so the server documents that absence as its MAX
	 signal. Every reader below treats "no nextCost on a record that has a level"
	 as max level, never as "look the price up yourself". ]]
export type UpgradeEntry = {
	level: number?,
	maxLevel: number?,
	value: number?,
	nextCost: number?,
}

--[[ `objective` is a SINGLE record describing the current step, not a map of
	 every objective. Hud does not render it — Objective.luau does — but it is
	 declared here because Hud.render receives the whole snapshot and a wrong
	 shape in this type is exactly what caused the objective bug. ]]
export type ObjectiveState = {
	index: number?,
	id: string?,
	text: string?,
	progress: number?,
	target: number?,
	complete: boolean?,
}

export type HudState = {
	coins: number?,
	shards: number?,
	packCapacity: number?,
	upgrades: { [string]: UpgradeEntry }?,
	zones: { [string]: boolean }?,
	objective: ObjectiveState?,
	stats: { collected: number?, sold: number?, playtime: number? }?,
}

export type Deps = {
	remotes: { [string]: RemoteEvent },
	openPanel: (panelId: string) -> (),
}

-- Metrics ------------------------------------------------------------------
-- Chunky by policy (§3). These are the unscaled desktop sizes; a per-cluster
-- UIScale shrinks them on small viewports, never below the touch floor below.
local M = {
	Margin = 16,

	-- wallet
	CapsuleHeight = 56,
	CapsuleGap = 8,
	GaugeGap = 12,
	GaugeKnob = 46,
	GaugeTrack = 34,

	-- nav rail
	Tile = 62,
	TileGap = 14,
	RailPad = 11,
	PlateWidth = 78,
	PlateHeight = 20,
	PlateOverlap = 7, -- how far the caption plate notches into the tile

	-- sell
	SellHeight = 66,
	ChipHeight = 34,
	ChipGap = 8,

	ObjectiveHeight = 56,
}

--[[ The smallest comfortable touch target is 44px, and the nav tile is the
	 smallest thing in this HUD a finger has to hit: 62 * 0.72 = 44.6. Every
	 other control here is larger, so this one ratio is the whole mobile floor. ]]
local MIN_SCALE = 0.72
local MAX_SCALE = 1

local TILE_RADIUS = UDim.new(0, 18) -- §3: rounded rectangle, not a circle

-- Cluster width rules, kept next to each other because the objective collision
-- check below is only honest if it uses the numbers the clusters are built from.
local WALLET_WIDTH = { Fraction = 0.2, Min = 226, Max = 306 }
local SELL_WIDTH = { Fraction = 0.22, Min = 218, Max = 320 }
local OBJECTIVE_WIDTH = { Fraction = 0.34, Min = 300, Max = 480 }
local WALLET_HEIGHT = M.CapsuleHeight * 2 + M.CapsuleGap + M.GaugeGap + M.GaugeKnob

local NAV_CELL = M.Tile + M.PlateHeight - M.PlateOverlap
local NAV_WIDTH = M.Tile + M.RailPad * 2

--[[ The rail needs more room under the last cell than over the first one: its
	 own hard bottom edge lives there, and the caption plate is wider than the
	 tile, so with symmetric padding the last plate's corners would be shaved off
	 by the rail's rounded corner and its clip. ]]
local RAIL_BOTTOM = M.RailPad + 8

--[[ Neutral darks. The rail is deliberately a cool slate rather than the
	 counters' near-black: four saturated tiles need something to sit ON, and a
	 black rail behind black-ish tiles is the "plain black surface" note again.
	 Caption plates go darker than the rail so they read as inset into it. ]]
local RAIL_FILL = Color3.fromRGB(48, 58, 70)
local PLATE_FILL = Color3.fromRGB(29, 33, 38)

local NAV = {
	{ Id = "shop", Caption = "SHOP", Art = "shop", Fill = Palette.UI.HeaderCyan },
	{ Id = "upgrades", Caption = "UPGRADES", Art = "upgrades", Fill = Palette.UI.HeaderPurple },
	{ Id = "codes", Caption = "CODES", Art = "codes", Fill = Palette.UI.Premium },
	{ Id = "zones", Caption = "ZONES", Art = "zones", Fill = Palette.UI.HeaderGreen },
}

-- Runtime handles ----------------------------------------------------------
type Capsule = {
	pill: Frame,
	plate: Frame,
	amount: TextLabel,
	tint: Color3,
	plateFill: Color3,
}

local gui: ScreenGui? = nil
local scales: { UIScale } = {}
local viewportConn: RBXScriptConnection? = nil

local shardsCapsule: Capsule? = nil
local coinsCapsule: Capsule? = nil
local barFill: Frame? = nil
local barLabel: TextLabel? = nil
local gaugeKnob: Frame? = nil
local sellButton: TextButton? = nil
local sellVeil: Frame? = nil
local sellPlate: Frame? = nil
local sellPulse: Tween? = nil
local payoutLabel: TextLabel? = nil
local objectiveMount: Frame? = nil
local dots: { [string]: Frame } = {}

local lastShards = -1
local lastCoins = -1
local lastFull = false
local lastSellAt = 0

-- Construction primitives --------------------------------------------------
-- Theme owns panels, cards and buttons. These are the few shapes the HUD needs
-- that Theme has no primitive for; they follow exactly the same §2/§3 grammar
-- so a HUD surface and a panel surface cannot drift apart.

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ §3 Slight vertical gradient on fills: lighter top, deeper bottom. ]]
local function gradient(inst: GuiObject, fill: Color3): UIGradient
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Color = ColorSequence.new(Palette.lift(fill), Palette.shade(fill, 0.10))
	g.Parent = inst
	return g
end

--[[ §3 Depth is a hard bottom edge, not a soft shadow. Shading within the
	 host's silhouette rather than a surface of its own, so — like Theme's
	 equivalent — it is deliberately NOT stroked. `host` must clip. ]]
local function hardEdge(host: GuiObject, fill: Color3, thickness: number): Frame
	local edge = Instance.new("Frame")
	edge.Name = "Edge"
	edge.AnchorPoint = Vector2.new(0.5, 1)
	edge.Position = UDim2.fromScale(0.5, 1)
	edge.Size = UDim2.new(1, 0, 0, thickness)
	edge.BackgroundColor3 = Palette.shade(fill)
	edge.BorderSizePixel = 0
	edge.ZIndex = host.ZIndex
	edge.Parent = host
	return edge
end

--[[ A soft top highlight so a dark surface reads as a moulded plastic slab
	 rather than a hole cut in the screen. Shading again: unstroked. ]]
local function gloss(host: GuiObject, height: number): Frame
	local sheen = Instance.new("Frame")
	sheen.Name = "Gloss"
	sheen.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	sheen.BackgroundTransparency = 0.9
	sheen.BorderSizePixel = 0
	sheen.Position = UDim2.fromOffset(0, 0)
	sheen.Size = UDim2.new(1, 0, 0, height)
	sheen.ZIndex = host.ZIndex
	sheen.Parent = host
	corner(sheen, Palette.Radius.Pill)
	return sheen
end

local function mix(a: Color3, b: Color3, t: number): Color3
	return Color3.new(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t)
end

--[[ Let type shrink to fit a small screen but never grow past the size the
	 design was drawn at. Mirrors Theme's private helper of the same name. ]]
local function clampText(label: TextLabel, maxSize: number)
	label.TextScaled = true
	label.TextWrapped = false
	local c = Instance.new("UITextSizeConstraint")
	c.MaxTextSize = maxSize
	c.MinTextSize = 9
	c.Parent = label
end

local function text(parent: Instance, name: string, size: number, color: Color3?): TextLabel
	local label = Instance.new("TextLabel")
	label.Name = name
	label.ZIndex = (if parent:IsA("GuiObject") then parent.ZIndex else 1) + 3
	Palette.styleText(label, size, color)
	clampText(label, size)
	label.Parent = parent
	return label
end

--[[ Draw a pictogram, tolerating an absent Icons module (see the require at the
	 top). Returns nothing: no caller needs the handle, and the ones that animate
	 something animate the plate the glyph sits on, not the glyph. ]]
local function glyph(parent: Instance, name: string, opts: any)
	if not Icons then
		return
	end
	local ok, err = pcall(Icons.draw, parent, name, opts)
	if not ok then
		warn(`[CrystalCanyon] Hud: could not draw the "{name}" pictogram: {err}`)
	end
end

--[[ The saturated round plate a pictogram sits on. This is the single element
	 that carries colour into the dark surfaces — capsules, gauge knob, payout
	 chip and the sell button all use it, which is what makes them read as one
	 kit rather than four unrelated widgets. ]]
local function iconPlate(parent: GuiObject, fill: Color3, diameter: number, position: UDim2, art: string?): Frame
	local plate = Instance.new("Frame")
	plate.Name = "Plate"
	plate.AnchorPoint = Vector2.new(0.5, 0.5)
	plate.Position = position
	plate.Size = UDim2.fromOffset(diameter, diameter)
	plate.BackgroundColor3 = fill
	plate.BorderSizePixel = 0
	plate.ZIndex = parent.ZIndex + 4
	plate.Parent = parent
	corner(plate, Palette.Radius.Icon)
	gradient(plate, fill)
	Palette.stroke(plate, Palette.Outline.Icon)

	if art then
		glyph(plate, art, {
			size = UDim2.fromScale(0.64, 0.64),
			fill = Palette.UI.TextLight,
			accent = Palette.lift(fill, 0.7),
			cut = fill,
			zIndex = plate.ZIndex + 1,
		})
	end
	return plate
end

-- Layout -------------------------------------------------------------------

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
	 relative width alone turns a currency capsule into a 700px slab on an
	 ultrawide. The constraint is what keeps it a capsule. ]]
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
	-- portrait one, and the left nav rail is what runs out of room first.
	return math.clamp(math.min(v.X / 1100, v.Y / 760), MIN_SCALE, MAX_SCALE)
end

--[[ On a phone the top-left wallet column and a centred objective chip want the
	 same pixels: at 390 wide the column already reaches past the point where a
	 300px-minimum chip would start, and no amount of scaling fixes that because
	 both have a floor. Rather than let them overlap — or shrink the chip until
	 its text is unreadable — the chip steps down below the column. It is still
	 pinned to the top band, so the middle of the screen stays empty. ]]
local function layoutObjective(s: number)
	local mount = objectiveMount
	if not mount then
		return
	end
	local camera = workspace.CurrentCamera
	local vx = camera and camera.ViewportSize.X or 1920
	local columnRight = M.Margin + math.clamp(vx * WALLET_WIDTH.Fraction, WALLET_WIDTH.Min, WALLET_WIDTH.Max) * s
	local chipLeft = vx / 2
		- math.clamp(vx * OBJECTIVE_WIDTH.Fraction, OBJECTIVE_WIDTH.Min, OBJECTIVE_WIDTH.Max) * s / 2

	local y = M.Margin
	if chipLeft < columnRight + 8 then
		y = M.Margin + WALLET_HEIGHT * s + 8
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

-- Motion -------------------------------------------------------------------
-- "Limited motion feedback" was one of the rejections. Reward feedback that is
-- not visible reads as breakage (§8), so every value that can change has a
-- gesture attached to it: a punch when a number grows, a flash on the plate
-- that owns that number, a pulse on the action the player now needs to take.

local function scaleOf(frame: GuiObject): UIScale
	local existing = frame:FindFirstChildOfClass("UIScale")
	if existing and existing:IsA("UIScale") then
		return existing
	end
	local s = Instance.new("UIScale")
	s.Parent = frame
	return s
end

local function punch(frame: GuiObject, amount: number?)
	local s = scaleOf(frame)
	s.Scale = amount or 1.1
	TweenService:Create(s, TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

--[[ A one-shot brighten that decays back to the surface's own colour. Used on
	 the icon plate of whichever currency just went up, so the eye is told WHICH
	 number changed rather than just that something moved. ]]
local function flash(frame: Frame, base: Color3)
	frame.BackgroundColor3 = Palette.lift(base, 0.6)
	TweenService:Create(frame, TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		BackgroundColor3 = base,
	}):Play()
end

--[[ The only looping animation in the HUD, and it is on for exactly one state:
	 the pack is full, so collecting is pointless until the player sells. It is
	 cancelled the moment that stops being true — an idle loop that never ends
	 is noise, and noise is the other half of the rejection. ]]
local function setSellPulse(on: boolean)
	local plate = sellPlate
	if not plate then
		return
	end
	if on == (sellPulse ~= nil) then
		return
	end
	if not on then
		local running = sellPulse
		sellPulse = nil
		if running then
			running:Cancel()
		end
		scaleOf(plate).Scale = 1
		return
	end
	local tween = TweenService:Create(
		scaleOf(plate),
		TweenInfo.new(0.55, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ Scale = 1.14 }
	)
	sellPulse = tween
	tween:Play()
end

-- Snapshot readers ----------------------------------------------------------
-- Both take the raw `upgrades` table as `any`: it arrives across a remote and
-- may be from an older build, so its shape is checked here rather than trusted.

--[[ The level of one upgrade out of the snapshot. Reads `.level` off the record
	 the server actually sends; the bare-number branch is only a courtesy to a
	 snapshot from a build that predates the record shape. ]]
local function upgradeLevel(upgrades: any, id: string): number
	local entry = upgrades[id]
	local raw = if typeof(entry) == "table" then tonumber(entry.level) else tonumber(entry)
	if not raw or raw ~= raw then -- nil or NaN
		return 0
	end
	return math.max(0, math.floor(raw))
end

--[[ Price to buy the next level, or nil if there is no next level.

	 The server's `nextCost` wins when it is present, because it is the number
	 the purchase will actually be charged against. Its ABSENCE on a record that
	 has a level is the max-level signal and must return nil — falling back to
	 `Config.upgradeCost` there would be harmless today (Config returns nil at
	 max too) but would silently re-price the upgrade from stale client tables
	 the moment the two disagree, which is the whole failure this file exists to
	 avoid. Config is consulted only when there is no record at all, i.e. before
	 the first Sync lands. ]]
local function upgradeNextCost(upgrades: any, id: string): number?
	local entry = upgrades[id]
	if typeof(entry) == "table" then
		local cost = tonumber(entry.nextCost)
		if cost and cost == cost then
			return cost
		end
		if tonumber(entry.level) then
			return nil -- record present, no nextCost -> max level
		end
	end
	return Config.upgradeCost(id, upgradeLevel(upgrades, id))
end

-- Construction -------------------------------------------------------------

--[[ One currency capsule: dark tinted body, saturated icon plate at the left
	 end, the currency's name small above its big comma-separated number.

	 §6 asks for "dark rounded pills, coin icon, big number" and this is still
	 that — but the body is mixed 22% toward the currency's own hue, which is
	 enough to tell shards from coins at a glance without leaving the dark family
	 the spec asks for. Flat charcoal on both was the "plain black pill" note. ]]
local function capsule(parent: GuiObject, name: string, caption: string, tint: Color3, art: string, y: number): Capsule
	local body = mix(Palette.UI.CounterFill, tint, 0.22)

	local pill = Instance.new("Frame")
	pill.Name = name
	pill.Position = UDim2.fromOffset(0, y)
	pill.Size = UDim2.new(1, 0, 0, M.CapsuleHeight)
	pill.BackgroundColor3 = body
	pill.BorderSizePixel = 0
	pill.ClipsDescendants = true -- required by hardEdge and gloss
	pill.ZIndex = parent.ZIndex + 2
	pill.Parent = parent
	corner(pill, Palette.Radius.Pill)
	gradient(pill, body)
	Palette.stroke(pill, Palette.Outline.Button)
	hardEdge(pill, body, 6)
	gloss(pill, math.floor(M.CapsuleHeight * 0.42))

	local diameter = M.CapsuleHeight - 16
	local plate = iconPlate(pill, tint, diameter, UDim2.new(0, 6 + diameter / 2, 0.5, -3), art)

	local textLeft = 12 + diameter

	local title = text(pill, "Label", 12, Palette.lift(tint, 0.4))
	title.AnchorPoint = Vector2.new(0, 0)
	title.Position = UDim2.fromOffset(textLeft, 6)
	title.Size = UDim2.new(1, -(textLeft + 12), 0, 14)
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Text = caption

	local amount = text(pill, "Amount", Palette.TextSize.Counter, Palette.UI.TextLight)
	amount.AnchorPoint = Vector2.new(0, 0)
	amount.Position = UDim2.fromOffset(textLeft, 19)
	amount.Size = UDim2.new(1, -(textLeft + 10), 0, 29)
	amount.TextXAlignment = Enum.TextXAlignment.Left
	-- §4: never truncated to "1B"; the comma form is part of the fantasy.
	amount.Text = Util.comma(0)

	return { pill = pill, plate = plate, amount = amount, tint = tint, plateFill = tint }
end

--[[ The pack gauge. §6 asks for a thick rounded progress bar with an icon at
	 the left end and the label inside; the brief asks for it to read as a chunky
	 GAUGE, so the track is deep, the fill is gradient-lit, and three notches
	 divide it into quarters so a glance reads "about half" rather than "some". ]]
local function buildGauge(parent: GuiObject, y: number)
	local row = Instance.new("Frame")
	row.Name = "PackGauge"
	row.BackgroundTransparency = 1
	row.Position = UDim2.fromOffset(0, y)
	row.Size = UDim2.new(1, 0, 0, M.GaugeKnob)
	row.ZIndex = parent.ZIndex + 2
	row.Parent = parent

	local trackFill = mix(Palette.UI.CounterFill, Palette.UI.SoftCurrency, 0.1)

	local track = Instance.new("Frame")
	track.Name = "Track"
	track.BackgroundColor3 = trackFill
	track.BorderSizePixel = 0
	track.AnchorPoint = Vector2.new(0, 0.5)
	track.Position = UDim2.new(0, M.GaugeKnob // 2, 0.5, 0)
	track.Size = UDim2.new(1, -(M.GaugeKnob // 2), 0, M.GaugeTrack)
	track.ClipsDescendants = true
	track.ZIndex = row.ZIndex
	track.Parent = row
	corner(track, Palette.Radius.Pill)
	Palette.stroke(track, Palette.Outline.Card)

	-- Padding is what insets the fill inside the track's outline; sizing the
	-- fill by scale against the padded area keeps the inset exact at every
	-- viewport width instead of guessing an offset.
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 5)
	pad.PaddingBottom = UDim.new(0, 5)
	pad.PaddingLeft = UDim.new(0, 5)
	pad.PaddingRight = UDim.new(0, 5)
	pad.Parent = track

	--[[ The fill is the only surface in this cluster without its own outline, and
		 that is deliberate. It is a level indicator inside the already-outlined
		 track, inset by the padding above — a 3px Border stroke would all but
		 close that gap against the track's inner edge, and at zero shards (the
		 very first thing a new player sees) a zero-width frame with a Border
		 stroke renders as a small black lozenge floating in an empty bar. ]]
	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.BackgroundColor3 = Palette.UI.SoftCurrency
	fill.BorderSizePixel = 0
	fill.Size = UDim2.new(0, 0, 1, 0)
	fill.ZIndex = track.ZIndex + 1
	fill.Parent = track
	corner(fill, Palette.Radius.Pill)

	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new(Palette.lift(Palette.UI.SoftCurrency), Palette.shade(Palette.UI.SoftCurrency, 0.12))
	grad.Parent = fill

	-- Quarter notches. Shading over the fill rather than surfaces of their own,
	-- so like every other piece of shading in this file they are unstroked.
	for i = 1, 3 do
		local notch = Instance.new("Frame")
		notch.Name = `Notch{i}`
		notch.AnchorPoint = Vector2.new(0.5, 0.5)
		notch.Position = UDim2.fromScale(i / 4, 0.5)
		notch.Size = UDim2.new(0, 2, 1, 0)
		notch.BackgroundColor3 = Palette.Outline.Color
		notch.BackgroundTransparency = 0.55
		notch.BorderSizePixel = 0
		notch.ZIndex = track.ZIndex + 2
		notch.Parent = track
	end

	local label = text(track, "Amount", 15, Palette.UI.TextLight)
	label.Size = UDim2.new(1, 0, 1, 0)
	label.ZIndex = track.ZIndex + 3
	label.Text = "0 / 0"

	-- The knob overhangs the track's left end so the gauge reads as one object
	-- with a head, not as a bar with a circle parked next to it.
	local knob = iconPlate(row, Palette.UI.SoftCurrency, M.GaugeKnob, UDim2.new(0, M.GaugeKnob // 2, 0.5, 0), "pack")
	knob.Name = "Knob"
	knob.ZIndex = track.ZIndex + 4

	barFill, barLabel, gaugeKnob = fill, label, knob
end

local function buildWallet(parent: Instance)
	local box = cluster(
		parent,
		"Wallet",
		Vector2.new(0, 0),
		UDim2.fromOffset(M.Margin, M.Margin),
		UDim2.new(WALLET_WIDTH.Fraction, 0, 0, WALLET_HEIGHT)
	)
	constrain(box, WALLET_WIDTH.Min, WALLET_WIDTH.Max)

	shardsCapsule = capsule(box, "Shards", Config.Currency.Shards.Display, Palette.UI.SoftCurrency, "shard", 0)
	coinsCapsule = capsule(
		box,
		"Coins",
		Config.Currency.Coins.Display,
		Palette.UI.HardCurrency,
		"coin",
		M.CapsuleHeight + M.CapsuleGap
	)
	buildGauge(box, M.CapsuleHeight * 2 + M.CapsuleGap + M.GaugeGap)
end

--[[ The little red "you can afford something" dot. It is parented to the CELL
	 rather than to the tile: the tile clips its own descendants (Theme needs
	 that for the hard bottom edge), so a badge pinned to a corner from inside
	 would have its outer half sliced off by the rounded corner. ]]
local function badge(cell: Frame, z: number): Frame
	local dot = Instance.new("Frame")
	dot.Name = "Badge"
	dot.BackgroundColor3 = Palette.UI.Close
	dot.BorderSizePixel = 0
	dot.AnchorPoint = Vector2.new(0.5, 0.5)
	dot.Position = UDim2.fromOffset(M.Tile - 7, 7)
	dot.Size = UDim2.fromOffset(20, 20)
	dot.ZIndex = z
	dot.Visible = false
	dot.Parent = cell
	corner(dot, Palette.Radius.Icon)
	gradient(dot, Palette.UI.Close)
	Palette.stroke(dot, Palette.Outline.Icon)
	return dot
end

local function buildNav(parent: Instance, openPanel: (string) -> ())
	local railHeight = #NAV * NAV_CELL + (#NAV - 1) * M.TileGap + M.RailPad + RAIL_BOTTOM
	local box = cluster(
		parent,
		"Nav",
		Vector2.new(0, 0.5),
		UDim2.new(0, M.Margin, 0.5, 0),
		UDim2.fromOffset(NAV_WIDTH, railHeight)
	)

	--[[ The rail. This single surface is the difference between "a designed
		 navigation cluster" and "a basic icon stack": it groups the four
		 entries, gives them a shared ground to sit on, and carries the same
		 outline + gradient + hard bottom edge as every other surface. ]]
	local rail = Instance.new("Frame")
	rail.Name = "Rail"
	rail.Size = UDim2.fromScale(1, 1)
	rail.BackgroundColor3 = RAIL_FILL
	rail.BorderSizePixel = 0
	rail.ClipsDescendants = true
	rail.ZIndex = 2
	rail.Parent = box
	corner(rail, Palette.Radius.Panel)
	gradient(rail, RAIL_FILL)
	Palette.stroke(rail, Palette.Outline.Panel)
	hardEdge(rail, RAIL_FILL, 7)

	local list = Instance.new("Frame")
	list.Name = "Cells"
	list.BackgroundTransparency = 1
	list.Position = UDim2.fromOffset(M.RailPad, M.RailPad)
	list.Size = UDim2.new(1, -M.RailPad * 2, 1, -(M.RailPad + RAIL_BOTTOM))
	list.ZIndex = rail.ZIndex + 1
	list.Parent = rail

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, M.TileGap)
	layout.Parent = list

	for index, entry in NAV do
		local cell = Instance.new("Frame")
		cell.Name = entry.Caption
		cell.BackgroundTransparency = 1
		cell.LayoutOrder = index
		cell.Size = UDim2.fromOffset(M.Tile, NAV_CELL)
		cell.ZIndex = list.ZIndex + 1
		cell.Parent = list

		--[[ Theme.button, not Theme.iconButton. The press feel, the gradient and
			 the §3 hard bottom edge all have to be the same code the modals use —
			 but §6's circular icon button is exactly the shape the owner rejected,
			 so the silhouette is overridden to a rounded square and nothing else
			 about the button is touched. The caption is empty on purpose: the word
			 lives on the plate below, where it is legible. ]]
		local tile = Theme.button(cell, "", entry.Fill, UDim2.fromOffset(M.Tile, M.Tile), UDim2.fromOffset(0, 0))
		tile.Name = "Tile"
		local silhouette = tile:FindFirstChildOfClass("UICorner")
		if silhouette and silhouette:IsA("UICorner") then
			silhouette.CornerRadius = TILE_RADIUS
		end

		glyph(tile, entry.Art, {
			-- Lifted 2px so the glyph is optically centred in the lit face of the
			-- tile rather than in the silhouette that includes its hard edge.
			position = UDim2.new(0.5, 0, 0.5, -2),
			size = UDim2.fromScale(0.58, 0.58),
			fill = Palette.UI.TextLight,
			accent = Palette.lift(entry.Fill, 0.68),
			cut = entry.Fill,
			zIndex = tile.ZIndex + 3,
		})

		--[[ The caption plate, notched up into the tile's lower edge so the two
			 read as one object. Dark against the saturated tile, which is what
			 gives the cluster its hierarchy: colour identifies, dark labels. ]]
		local plate = Instance.new("Frame")
		plate.Name = "Label"
		plate.AnchorPoint = Vector2.new(0.5, 0)
		plate.Position = UDim2.new(0.5, 0, 0, M.Tile - M.PlateOverlap)
		plate.Size = UDim2.fromOffset(M.PlateWidth, M.PlateHeight)
		plate.BackgroundColor3 = PLATE_FILL
		plate.BorderSizePixel = 0
		plate.ZIndex = tile.ZIndex + 6
		plate.Parent = cell
		corner(plate, Palette.Radius.Pill)
		gradient(plate, PLATE_FILL)
		Palette.stroke(plate, Palette.Outline.Card)

		local caption = text(plate, "Caption", 12, Palette.UI.TextLight)
		caption.Size = UDim2.new(1, -8, 1, 0)
		caption.Position = UDim2.fromOffset(4, 0)
		caption.ZIndex = plate.ZIndex + 1
		caption.Text = entry.Caption

		dots[entry.Id] = badge(cell, plate.ZIndex + 2)

		local id = entry.Id
		tile.Activated:Connect(function()
			-- The press already sinks the tile into its own edge (Theme's
			-- feedback); the glyph-free plate punch is what confirms the tap on a
			-- touch screen, where there is no hover state to have told the player
			-- the control was live.
			punch(plate, 1.12)
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
		UDim2.new(SELL_WIDTH.Fraction, 0, 0, M.SellHeight + M.ChipGap + M.ChipHeight)
	)
	constrain(box, SELL_WIDTH.Min, SELL_WIDTH.Max)

	local button =
		Theme.button(box, "SELL SHARDS", Palette.UI.Buy, UDim2.new(1, 0, 0, M.SellHeight), UDim2.fromOffset(0, 0))

	--[[ The leading shard plate needs clear space at the left end of the button.
		 That inset must NOT be a UIPadding on the button: UIPadding insets EVERY
		 child, including two that must stay full-bleed.

		   · Theme's `Edge` frame — the §3 hard bottom edge that reads as the
		     button's thickness — would be drawn narrow and shifted right, leaving
		     the bottom-left corner visibly flat.
		   · The disabled `Veil` below would inset the same way, so with 0 shards
		     the leftmost strip (the plate included) stayed fully saturated on a
		     button the player cannot press.

		 So the inset goes on the one child that actually wants it: Theme's
		 centred caption. Theme owns the caption's vertical terms (they lift the
		 text off the hard edge), so only the X terms are touched here. ]]
	local ICON_INSET = 50
	local captionLabel = button:FindFirstChild("Caption")
	if captionLabel and captionLabel:IsA("TextLabel") then
		local size = captionLabel.Size
		-- Narrow by the full inset and shift the centre by half of it: the text
		-- ends up optically centred in what is left, not sitting under the plate.
		captionLabel.Position = UDim2.new(0.5, ICON_INSET / 2, 0, 0)
		captionLabel.Size = UDim2.new(size.X.Scale, size.X.Offset - ICON_INSET, size.Y.Scale, size.Y.Offset)
	end

	local plate = iconPlate(button, Palette.UI.SoftCurrency, 42, UDim2.new(0, 31, 0.5, -3), "shard")

	-- Disabled state is drawn as a desaturating veil rather than by recolouring
	-- the fill: Theme owns the button's gradient and its hard bottom edge (§3),
	-- and setting BackgroundColor3 alone would leave those two out of sync.
	local veil = Instance.new("Frame")
	veil.Name = "Veil"
	veil.BackgroundColor3 = Palette.UI.Locked
	veil.BackgroundTransparency = 0.4
	veil.BorderSizePixel = 0
	veil.Size = UDim2.new(1, 0, 1, 0)
	veil.ZIndex = 20
	veil.Visible = false
	veil.Parent = button
	corner(veil, Palette.Radius.Pill)

	-- The payout chip: same kit as the capsules, one size down.
	local chip = Instance.new("Frame")
	chip.Name = "Payout"
	chip.BackgroundColor3 = mix(Palette.UI.CounterFill, Palette.UI.HardCurrency, 0.22)
	chip.BorderSizePixel = 0
	chip.ClipsDescendants = true
	chip.Position = UDim2.fromOffset(0, M.SellHeight + M.ChipGap)
	chip.Size = UDim2.new(1, 0, 0, M.ChipHeight)
	chip.ZIndex = 2
	chip.Parent = box
	corner(chip, Palette.Radius.Pill)
	gradient(chip, chip.BackgroundColor3)
	Palette.stroke(chip, Palette.Outline.Card)
	hardEdge(chip, chip.BackgroundColor3, 4)

	local chipPlate = iconPlate(chip, Palette.UI.HardCurrency, M.ChipHeight - 10, UDim2.new(0, 15, 0.5, -2), "coin")
	chipPlate.Name = "CoinPlate"

	local chipText = text(chip, "Amount", 15, Palette.UI.TextLight)
	chipText.AnchorPoint = Vector2.new(0, 0.5)
	chipText.Position = UDim2.new(0, 32, 0.5, -2)
	chipText.Size = UDim2.new(1, -42, 0, 18)
	chipText.TextXAlignment = Enum.TextXAlignment.Left
	chipText.Text = "+0 COINS"

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

	sellButton, sellVeil, sellPlate, payoutLabel = button, veil, plate, chipText
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
		sellPulse = nil
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

	buildWallet(screen)
	buildNav(screen, newDeps.openPanel)
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

	lastShards, lastCoins, lastFull = -1, -1, false
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
	-- Typed `any` on purpose: these come off a remote, so their shape is read
	-- through the guarded helpers above rather than asserted here.
	local upgrades: any = state.upgrades or {}
	local zones: any = state.zones or {}

	-- Capacity comes from the snapshot when the server sends it, and otherwise
	-- from the same Config table the server caps against — so the gauge can never
	-- advertise a capacity the economy does not enforce. The floor of 1 exists
	-- purely so the ratio below can never divide by zero.
	local packLevel = upgradeLevel(upgrades, "pack")
	local capacity = math.max(1, math.floor(tonumber(state.packCapacity) or Config.upgradeValue("pack", packLevel)))
	local ratio = math.clamp(shards / capacity, 0, 1)
	local full = shards >= capacity

	local shardBox = shardsCapsule
	if shardBox then
		shardBox.amount.Text = Util.comma(shards)
		if shards > lastShards and lastShards >= 0 then
			punch(shardBox.pill)
			flash(shardBox.plate, shardBox.plateFill)
		end
	end

	local coinBox = coinsCapsule
	if coinBox then
		coinBox.amount.Text = Util.comma(coins)
		if coins > lastCoins and lastCoins >= 0 then
			punch(coinBox.pill)
			flash(coinBox.plate, coinBox.plateFill)
		end
	end

	if barFill then
		local tint = full and Palette.UI.Close or Palette.UI.SoftCurrency
		local gradientFill = barFill:FindFirstChildOfClass("UIGradient")
		if gradientFill and gradientFill:IsA("UIGradient") then
			gradientFill.Color = ColorSequence.new(Palette.lift(tint), Palette.shade(tint, 0.12))
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
	-- The knob is the gauge's head, so it is where "you just hit the ceiling"
	-- gets announced — once, on the transition, not on every Sync while full.
	if gaugeKnob and full and not lastFull then
		punch(gaugeKnob, 1.2)
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
	setSellPulse(full)

	-- Affordability badges. Priced from the server's own `nextCost`, so a lit dot
	-- always corresponds to a purchase the server would actually accept — and a
	-- maxed upgrade (no nextCost) can never light one.
	local canUpgrade = false
	for _, up in Config.Upgrades do
		local cost = upgradeNextCost(upgrades, up.Id)
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

	--[[ A dot that appears silently is a dot nobody notices, so becoming visible
		 pops. Turning off is not animated: nothing was earned, and an outgoing
		 flourish would read as a reward. ]]
	local function setBadge(id: string, on: boolean)
		local dot = dots[id]
		if not dot or dot.Visible == on then
			return
		end
		dot.Visible = on
		if on then
			punch(dot, 1.5)
		end
	end
	setBadge("shop", canUpgrade)
	setBadge("upgrades", canUpgrade)
	setBadge("zones", canUnlock)

	lastShards, lastCoins, lastFull = shards, coins, full
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
