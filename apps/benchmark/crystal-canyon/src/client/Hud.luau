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

	Two passes were rejected. The first for "too many plain black pill-shaped
	surfaces" and a side menu that "looks like a basic icon stack"; the second,
	after a rail and tinted pills had been added, for the same thing described
	more precisely: "too much black surface area", "currency counters dominate
	with large dark pills", "side navigation feels like unrelated coloured
	circles", "labels under icons are tiny", "SELL SHARDS is visually muted",
	"world and UI art direction do not feel fully connected".

	The single rule that answers all of it, and the rule Theme.luau now enforces:

	    dark is for OUTLINE, SHADOW and CONTRAST. It is not a fill.

	Five decisions follow from it, and each is worth understanding before it is
	undone:

	1. THE THREE CLUSTERS ARE MOUNTED ON STONE. The wallet, the nav and the sell
	   action each sit on a `Theme.groupPlate` — the same carved sand slab, taken
	   from the colour of the world's plaza floor. That is what turns three piles
	   of controls into three GROUPS, and it is why nothing on this HUD needs a
	   large dark surface behind it any more. The previous rail was a cool slate
	   that appears nowhere in the canyon; this stone is literally §7's sand.

	2. THE COUNTERS ARE THE CURRENCY'S COLOUR. A shard capsule is gold and a coin
	   capsule is green — the whole surface, not a dot on a black pill. The
	   number is white outlined display type sunk into a `Theme.well`, which is
	   the one translucent dark this design system still hands out, and the small
	   currency name is dark INK on the colour with a light halo. Three levels of
	   hierarchy, no black lozenge.

	3. THE NAV IS ONE CONTROL GROUP. Four rounded-square tiles in the two crystal
	   colours the player actually collects plus the world's amber and moss, in a
	   channel on the stone rail, each with a caption plate in a DEEP SHADE OF
	   ITS OWN TILE'S HUE rather than a near-black chip — so the plate reads as
	   part of its tile instead of as a fifth unrelated object. Captions are
	   `Theme.Type.Label`, a named size, because "tiny" was the note.

	4. SELL IS THE BRIGHTEST OBJECT ON THE SCREEN. It is a `Theme.actionButton`:
	   bigger type, thicker edge, a sheen band, a deeper cast shadow and the lit
	   face of the world's grass for a fill. It is the only control on the HUD
	   built from that primitive, which is the point of having one.

	5. ICONS ARE A FAMILY, DRAWN FROM ONE GRID. All pictograms come from
	   Icons.luau, which draws every glyph on a 32-unit design box entirely in
	   scale units. An earlier pass inlined fixed-pixel interiors into
	   scale-positioned art frames here, and the four glyphs drifted apart the
	   moment a tile resized. Nothing in this file draws a glyph any more.

	Every surface still comes from Theme — `Theme.surface` for the capsules and
	chips, `Theme.button` for the nav tiles, `Theme.actionButton` for SELL,
	`Theme.groupPlate` for the three mounts — so the HUD's press feel, gradient
	and §3 hard bottom edge are literally the same code the modals use. The nav
	tile only overrides the corner radius, because §6's circular icon button is
	the shape the owner rejected. The few shapes Theme has no primitive for (the
	gauge track and its notches) are built here in the same grammar: gradient,
	hard bottom edge, thick near-black outline.
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
	-- How far a cluster's contents sit inside the stone plate they are mounted
	-- on, and how much room that plate needs under them for its own hard bottom
	-- edge (Theme.Edge.Panel is 9px of it).
	Pad = Theme.Metrics.PlatePad,
	Foot = 8,

	-- wallet
	CapsuleHeight = 58,
	CapsuleGap = 8,
	GaugeGap = 10,
	GaugeKnob = 44,
	GaugeTrack = 30,

	-- nav rail
	Tile = 68,
	TileGap = 12,
	RailPad = 11,
	-- The caption plate is wider than its tile on purpose: "UPGRADES" at
	-- Theme.Type.Label does not fit inside 68px, and the answer to "labels under
	-- icons are tiny" is a wider plate, not smaller type.
	PlateWidth = 84,
	PlateHeight = 26,
	PlateOverlap = 8, -- how far the caption plate notches into the tile

	-- sell
	SellHeight = Theme.Metrics.ActionHeight,
	ChipHeight = 36,
	ChipGap = 8,

	ObjectiveHeight = 56,
}

--[[ The smallest comfortable touch target is 44px, and the nav tile is the
	 smallest thing in this HUD a finger has to hit: 68 * 0.72 = 49. Every other
	 control here is larger, so this one ratio is the whole mobile floor. ]]
local MIN_SCALE = 0.72
local MAX_SCALE = 1

local TILE_RADIUS = UDim.new(0, 18) -- §3: rounded rectangle, not a circle

-- Cluster width rules, kept next to each other because the objective collision
-- check below is only honest if it uses the numbers the clusters are built from.
-- Both wallet and sell grew by 2 * M.Pad when they gained their stone mounts.
local WALLET_WIDTH = { Fraction = 0.21, Min = 250, Max = 326 }
local SELL_WIDTH = { Fraction = 0.23, Min = 236, Max = 336 }
local OBJECTIVE_WIDTH = { Fraction = 0.34, Min = 300, Max = 480 }

local WALLET_HEIGHT = M.Pad * 2 + M.Foot + M.CapsuleHeight * 2 + M.CapsuleGap + M.GaugeGap + M.GaugeKnob
local SELL_HEIGHT = M.Pad * 2 + M.Foot + M.SellHeight + M.ChipGap + M.ChipHeight

local NAV_CELL = M.Tile + M.PlateHeight - M.PlateOverlap
-- Sized to the PLATE rather than the tile, because the plate is the wider of
-- the two and the rail clips.
local NAV_WIDTH = M.PlateWidth + M.RailPad * 2

--[[ The rail needs more room under the last cell than over the first one: its
	 own hard bottom edge lives there, and the caption plate is wider than the
	 tile, so with symmetric padding the last plate's corners would be shaved off
	 by the rail's rounded corner and its clip. ]]
local RAIL_BOTTOM = M.RailPad + M.Foot

--[[ The nav's four hues, and the clearest example of "pull the HUD's accents
	 from the world palette". Two of them are the crystal colours the player is
	 in the canyon to collect (Config.Zones[].CrystalColor, read into UI tones by
	 Theme.Accent); the other two are the world's amber and its grass. Nothing
	 here is a colour invented for a menu.

	 A tile's caption plate is NOT listed: it is derived as a deep shade of the
	 tile's own fill, so the two can never drift apart and the plate can never
	 become the near-black chip that read as a fifth unrelated object. ]]
local NAV = {
	{ Id = "shop", Caption = "SHOP", Art = "shop", Fill = Theme.Accent.CrystalCyan },
	{ Id = "upgrades", Caption = "UPGRADES", Art = "upgrades", Fill = Theme.Accent.CrystalViolet },
	{ Id = "codes", Caption = "CODES", Art = "codes", Fill = Theme.Accent.Amber },
	{ Id = "zones", Caption = "ZONES", Art = "zones", Fill = Theme.Accent.Moss },
}

-- How far a caption plate is shaded below its tile. Deep enough for white type
-- to carry on it, shallow enough that it is still visibly the tile's own colour.
local PLATE_SHADE = 0.55

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

--[[ The HUD used to carry its own `hardEdge`, `gloss` and `mix` helpers, and
	 they are gone rather than left unused. Every surface here is now built by
	 `Theme.surface`, `Theme.groupPlate`, `Theme.button` or `Theme.actionButton`,
	 which apply the §3 moulding themselves — a second local copy of the depth
	 grammar is exactly how the HUD and the modals drift apart. `Theme.mix` is
	 the blend that survived, because it is the design system's own. ]]

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

--[[ A caption written as INK on a saturated surface, rather than as white type.

	 This is the small half of the direction change. Now that a currency capsule
	 is gold instead of near-black, its "SHARDS" caption cannot be white — white
	 on gold at 13px is the weakest thing on the screen — and it cannot keep the
	 black stroke §4 gives display type either, because a dark glyph inside a
	 black outline at that size is a blob.

	 So the caption is a deep shade of the surface's own hue, and the mandatory
	 stroke is inverted into a LIGHT HALO of the same hue. That still does §4's
	 job (the glyphs are separated from the fill by a contrasting line) and it
	 reads as stamped into the metal, which is the effect this category uses
	 wherever it writes small text on a coloured plate. ]]
local function inkLabel(parent: Instance, name: string, size: number, ink: Color3, halo: Color3): TextLabel
	local label = text(parent, name, size, ink)
	local stroke = label:FindFirstChildOfClass("UIStroke")
	if stroke and stroke:IsA("UIStroke") then
		stroke.Color = halo
		stroke.Thickness = 2
		stroke.Transparency = 0.2
	end
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

--[[ The round medallion a pictogram sits on. Capsules, the gauge knob, the
	 payout chip and the sell button all use it, which is what makes them read as
	 one kit rather than four unrelated widgets.

	 `accent` exists because the surfaces under these medallions inverted. On a
	 near-black capsule the plate was the bright thing and its glyph's accent
	 could be derived by lifting its own fill. On a gold capsule the plate has to
	 be the DARK thing or it disappears into the body, and lifting a dark brown
	 by 70% gives a dead grey. So a caller that darkens the plate passes the
	 accent it wants — normally a lift of the capsule's hue, so the glyph still
	 belongs to its currency. ]]
local function iconPlate(
	parent: GuiObject,
	fill: Color3,
	diameter: number,
	position: UDim2,
	art: string?,
	accent: Color3?
): Frame
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
			accent = accent or Palette.lift(fill, 0.7),
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

--[[ One currency capsule, and the clearest statement of the direction change.

	 THE SURFACE IS THE CURRENCY. The body is the currency's own hue taken down
	 8% — gold for shards, green for coins — carrying the five layers every other
	 surface in this game carries, because it is built by `Theme.surface` rather
	 than assembled here. It was previously near-black mixed 22% toward the hue,
	 which is what the owner saw as "currency counters dominate with large dark
	 pills": the biggest, highest-contrast objects on the HUD were black.

	 Three things had to invert to make colour work as the ground:

	   • the medallion, which used to be the bright element on a dark pill and is
	     now a deep-shaded disc with a lifted glyph — the reverse contrast, same
	     three concentric parts
	   • the currency's name, now dark ink with a light halo (`inkLabel`) instead
	     of white, because white 13px type on gold is the weakest thing possible
	   • the number, which keeps its white fill and black stroke but now sits in
	     a `Theme.well` — the translucent recess that is the only dark fill this
	     design system still hands out

	 What did NOT change is §6's actual ask: a rounded currency pill, a minted
	 coin at its left end, and a big comma-separated number. Only the black. ]]
local function capsule(parent: GuiObject, name: string, caption: string, tint: Color3, art: string, y: number): Capsule
	local body = Palette.shade(tint, 0.08)

	local pill = Theme.surface(parent, {
		Fill = body,
		Radius = Palette.Radius.Pill,
		Stroke = Palette.Outline.Button,
		Edge = 6,
		HighlightInset = 26,
		HighlightThickness = 5,
		HighlightTransparency = 0.56,
		Shadow = Theme.Shadow.Offset,
		ShadowTransparency = 0.7,
	}, UDim2.new(1, 0, 0, M.CapsuleHeight), UDim2.fromOffset(0, y))
	pill.Name = name

	local diameter = M.CapsuleHeight - 16
	--[[ Deep, not bright. On a saturated body a medallion of the same hue is
		 invisible, so it is shaded hard and the glyph inside it is lifted — which
		 is also why `iconPlate` takes an accent now. ]]
	local plate = iconPlate(
		pill,
		Palette.shade(tint, 0.62),
		diameter,
		UDim2.new(0, 6 + diameter / 2, 0.5, -3),
		art,
		Palette.lift(tint, 0.35)
	)

	local textLeft = 12 + diameter

	--[[ The well behind the number. Built before the two labels so it cannot
		 cover them, and stopping well short of the pill's right end so the
		 currency's colour is still the first thing read. ]]
	Theme.well(pill, UDim2.new(1, -(textLeft + 4), 0, 30), UDim2.new(0, textLeft - 6, 0, 20), 0.2)

	local title = inkLabel(pill, "Label", 13, Palette.shade(tint, 0.68), Palette.lift(tint, 0.55))
	title.AnchorPoint = Vector2.new(0, 0)
	title.Position = UDim2.fromOffset(textLeft, 5)
	title.Size = UDim2.new(1, -(textLeft + 12), 0, 15)
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Text = caption

	local amount = text(pill, "Amount", Palette.TextSize.Counter, Palette.UI.TextLight)
	amount.AnchorPoint = Vector2.new(0, 0)
	amount.Position = UDim2.fromOffset(textLeft, 21)
	amount.Size = UDim2.new(1, -(textLeft + 10), 0, 28)
	amount.TextXAlignment = Enum.TextXAlignment.Left
	-- §4: never truncated to "1B"; the comma form is part of the fantasy.
	amount.Text = Util.comma(0)

	--[[ `plateFill` is what `flash` decays back to when this currency goes up,
		 so it has to be the medallion's ACTUAL fill, not the capsule's tint. ]]
	return { pill = pill, plate = plate, amount = amount, tint = tint, plateFill = plate.BackgroundColor3 }
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

	--[[ The one place on this HUD where a dark fill is still the right answer,
		 and it is not an exception to the direction change but an example of it:
		 a gauge track is a RECESS, and a recess is dark for the same reason a
		 `Theme.well` is. What did change is the temperature — the old track was
		 a neutral charcoal, this one is the canyon's own rust at its deepest,
		 warmed a little toward the gold that fills it. ]]
	local trackFill = Theme.mix(Theme.Accent.Canyon, Palette.UI.SoftCurrency, 0.12)

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

	local label = text(track, "Amount", Theme.Type.Label, Palette.UI.TextLight)
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

--[[ The transparent, padded interior of a stone mount.

	 Every cluster on this HUD is now `groupPlate -> mount -> contents`, and the
	 middle layer is what lets the contents keep saying `UDim2.new(1, 0, ...)`
	 instead of doing plate arithmetic at every call site. It is transparent, so
	 it draws nothing; it exists purely as a coordinate space.

	 It cannot be a UIPadding on the plate itself: a `Theme.surface` puts its
	 hard bottom edge and its top highlight in as children, and a UIPadding would
	 inset both of them off the silhouette they are supposed to trace. ]]
local function mount(parent: Instance, name: string, size: UDim2, position: UDim2): Frame
	local plate = Theme.groupPlate(parent, size, position)
	plate.Name = name
	plate.ZIndex = 2

	local inner = Instance.new("Frame")
	inner.Name = "Inner"
	inner.BackgroundTransparency = 1
	inner.BorderSizePixel = 0
	inner.Position = UDim2.fromOffset(M.Pad, M.Pad)
	inner.Size = UDim2.new(1, -M.Pad * 2, 1, -(M.Pad * 2 + M.Foot))
	inner.ZIndex = plate.ZIndex + 1
	inner.Parent = plate

	return inner
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

	local inner = mount(box, "WalletPlate", UDim2.fromScale(1, 1), UDim2.fromOffset(0, 0))

	shardsCapsule = capsule(inner, "Shards", Config.Currency.Shards.Display, Palette.UI.SoftCurrency, "shard", 0)
	coinsCapsule = capsule(
		inner,
		"Coins",
		Config.Currency.Coins.Display,
		Palette.UI.HardCurrency,
		"coin",
		M.CapsuleHeight + M.CapsuleGap
	)
	buildGauge(inner, M.CapsuleHeight * 2 + M.CapsuleGap + M.GaugeGap)
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
	--[[ The tile's top-right corner, expressed against the CELL. The cell is as
		 wide as the caption plate and the tile is centred in it, so the tile's
		 right edge is half the difference in from the cell's. ]]
	dot.Position = UDim2.fromOffset((M.PlateWidth + M.Tile) // 2 - 7, 7)
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

	--[[ The rail, and the answer to "side navigation feels like unrelated
		 coloured circles". It is the SAME `Theme.groupPlate` the wallet and the
		 sell action are mounted on — one carved sand slab, three times — which
		 is what makes four buttons read as one designed control group and what
		 ties this cluster to the other two.

		 It is deliberately stone rather than the slate it used to be. A dark rail
		 behind four saturated tiles was a large black surface in a HUD that had
		 already been failed for having too many of them, and slate grey appears
		 nowhere in the canyon this game is set in. ]]
	local rail = Theme.groupPlate(box, UDim2.fromScale(1, 1), UDim2.fromOffset(0, 0))
	rail.Name = "Rail"
	rail.ZIndex = 2

	--[[ The channel the tiles sit in: a shallow well running the length of the
		 rail. This is the second half of "one control group" — without it the
		 four tiles are four objects lying on a slab, and with it they are four
		 objects seated in a track cut into one. It is a `Theme.well`, so it is
		 translucent warm ink with a lit lower lip rather than a black inlay. ]]
	Theme.well(
		rail,
		UDim2.new(1, -(M.RailPad - 4) * 2, 1, -(M.RailPad - 4) - RAIL_BOTTOM + 4),
		UDim2.fromOffset(M.RailPad - 4, M.RailPad - 4),
		0.16,
		Theme.Radius.Card
	)

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
		cell.Size = UDim2.fromOffset(M.PlateWidth, NAV_CELL)
		cell.ZIndex = list.ZIndex + 1
		cell.Parent = list

		--[[ Theme.button, not Theme.iconButton. The press feel, the gradient and
			 the §3 hard bottom edge all have to be the same code the modals use —
			 but §6's circular icon button is exactly the shape the owner rejected,
			 so the silhouette is overridden to a rounded square and nothing else
			 about the button is touched. The caption is empty on purpose: the word
			 lives on the plate below, where it is legible.

			 Centred in the cell rather than filling it, because the cell is as
			 wide as the caption plate and the plate is wider than the tile. ]]
		local tile =
			Theme.button(cell, "", entry.Fill, UDim2.fromOffset(M.Tile, M.Tile), UDim2.new(0.5, -M.Tile // 2, 0, 0))
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
			 read as one object.

			 It is a DEEP SHADE OF THE TILE'S OWN HUE, not a near-black chip. That
			 one change is most of what the owner was reacting to: a black plate
			 under a cyan tile is a second, unrelated object, and the eye counts
			 eight things in the rail instead of four. Shaded from `entry.Fill`
			 rather than listed in NAV, so a recoloured tile can never leave its
			 plate behind.

			 Wider than the tile and 26px tall, carrying `Theme.Type.Label` type,
			 because "labels under icons are tiny" was a named failure and the fix
			 is a plate big enough to hold real type — not smaller words. ]]
		local plateFill = Palette.shade(entry.Fill, PLATE_SHADE)
		local plate = Theme.surface(cell, {
			Fill = plateFill,
			Radius = Palette.Radius.Pill,
			Stroke = Palette.Outline.Card,
			Edge = 4,
			EdgeShade = 0.3,
			HighlightInset = 16,
			HighlightThickness = 3,
			HighlightTransparency = 0.76,
		}, UDim2.fromOffset(M.PlateWidth, M.PlateHeight), UDim2.new(0.5, 0, 0, M.Tile - M.PlateOverlap))
		plate.Name = "Label"
		plate.AnchorPoint = Vector2.new(0.5, 0)
		plate.ZIndex = tile.ZIndex + 6

		local caption = text(plate, "Caption", Theme.Type.Label, Palette.UI.TextLight)
		-- Lifted 2px off the plate's own hard bottom edge, the same correction
		-- every caption in Theme makes, so the word is centred in the lit face.
		caption.Size = UDim2.new(1, -10, 1, -4)
		caption.Position = UDim2.fromOffset(5, 0)
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
		UDim2.new(SELL_WIDTH.Fraction, 0, 0, SELL_HEIGHT)
	)
	constrain(box, SELL_WIDTH.Min, SELL_WIDTH.Max)

	local inner = mount(box, "SellPlate", UDim2.fromScale(1, 1), UDim2.fromOffset(0, 0))

	--[[ `Theme.actionButton`, and the only call to it in the game. SELL SHARDS
		 was reported as "visually muted", and the cause was that it was the same
		 object as every other button with a different fill. This primitive gives
		 it larger type, a thicker hard edge, the diagonal sheen §3 otherwise
		 reserves for headers, a deeper cast shadow, and the lit face of the
		 world's grass — five differences in the category's own vocabulary rather
		 than a glow or a permanent animation.

		 Framing it on stone is the last part: a bright green control on a warm
		 sand slab is louder than the same control floating on the sky. ]]
	local button = Theme.actionButton(
		inner,
		"SELL SHARDS",
		Theme.Accent.Action,
		UDim2.new(1, 0, 0, M.SellHeight),
		UDim2.fromOffset(0, 0)
	)

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

	--[[ The leading shard medallion. Gold on green is the loudest legal pairing
		 in this palette, and it is also literal: this button converts the gold
		 thing into the green thing. 46px rather than 42 now the action is taller. ]]
	local plate = iconPlate(button, Palette.UI.SoftCurrency, 46, UDim2.new(0, 33, 0.5, -4), "shard")

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

	--[[ The payout chip: what this press is worth, in the currency it pays out.

		 A DEEP COIN GREEN rather than the charcoal it used to be. It has to be
		 darker than the action above it — it is the quiet half of the pair and
		 must not compete — but "darker" in this design system means a deeper
		 shade of a real colour, not a slide toward black. Deep green also says
		 COINS before the label is read, which is the job. ]]
	local chipFill = Palette.shade(Palette.UI.HardCurrency, 0.55)
	local chip = Theme.surface(inner, {
		Fill = chipFill,
		Radius = Palette.Radius.Pill,
		Stroke = Palette.Outline.Card,
		Edge = 4,
		HighlightInset = 20,
		HighlightThickness = 3,
		HighlightTransparency = 0.74,
	}, UDim2.new(1, 0, 0, M.ChipHeight), UDim2.fromOffset(0, M.SellHeight + M.ChipGap))
	chip.Name = "Payout"

	local chipPlate = iconPlate(
		chip,
		Palette.UI.HardCurrency,
		M.ChipHeight - 10,
		UDim2.new(0, 16, 0.5, -2),
		"coin",
		Palette.lift(Palette.UI.HardCurrency, 0.55)
	)
	chipPlate.Name = "CoinPlate"

	local chipText = text(chip, "Amount", Theme.Type.Label, Palette.UI.TextLight)
	chipText.AnchorPoint = Vector2.new(0, 0.5)
	chipText.Position = UDim2.new(0, 34, 0.5, -2)
	chipText.Size = UDim2.new(1, -44, 0, 19)
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
		--[[ Never re-enabled. Theme turns AutoButtonColor off because it draws
			 its own hover and press states, and switching it back on here handed
			 Roblox's built-in tint the same button — two systems recolouring one
			 fill, which showed up as the action momentarily going flat grey mid
			 press. `Active` alone is what gates the input. ]]
		sellButton.AutoButtonColor = false
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
