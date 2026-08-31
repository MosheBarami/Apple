--!strict
--[[
	Crystal Canyon — the four modals: SHOP, UPGRADES, CODES, ZONES.

	Three invariants shape every line below.

	1. THE SERVER OWNS THE NUMBERS. Every price, level, balance and lock state
	   rendered here comes from the snapshot handed to `Panels.render(state)`,
	   which is the payload of the server-pushed `Sync`. This module keeps no
	   running tally of its own — there is deliberately no "coins" variable that
	   this file ever increments. When a purchase is refused, the refusal is
	   cosmetic: the server refuses it again, authoritatively, and the corrected
	   truth arrives as the next `Sync`. The greying-out is politeness, not
	   enforcement.

	2. EXACTLY ONE PANEL IS OPEN. Opening one closes the rest, so the modal
	   layer never stacks and the world is never buried under two headers.

	3. THEME OWNS THE MODAL SHELL. This file used to build a second backdrop, a
	   second open/close animation (on a UIScale) and a second close handler on
	   top of the ones `Theme.panel` already creates — and because Theme's
	   backdrop starts `Visible = false` and only `Theme.open` ever reveals it,
	   the panels this file "showed" were children of an invisible ancestor and
	   never rendered at all. The shell is now Theme's, entirely: Theme makes the
	   backdrop, animates it, and wires its own close button; this file calls
	   `Theme.open`/`Theme.close` and listens to the `Closed` BindableEvent that
	   `Theme.panel` documents for exactly this purpose. One backdrop and one
	   close handler per panel, both of them Theme's.

	Prices are read from the snapshot when the snapshot carries them, and
	otherwise derived through `Config.upgradeCost` from the *synced level*. That
	fallback is not client bookkeeping: Config is the same table the server
	charges against, so a price shown here can never be one the server would
	reject. What is never done is deriving a price or a balance from anything
	this client believes happened locally.

	LAYOUT. Nothing in a card is positioned from a hardcoded pixel inset any
	more. Card interiors are measured from the card's own `AbsoluteSize` and
	reflow between a wide layout (icon | text | action button on the right) and a
	stacked one (icon | text, action full-width underneath) at `STACK_WIDTH`.
	The old code sized labels with offsets like `UDim2.new(1, -320, 0, 26)`,
	which is a *negative* width — and therefore nothing on screen — for every
	card narrower than 320px. That is every card on a phone, and the widest of
	them (`-470`) went negative on desktop too at around a 976px window.
]]

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local Util = require(Shared:WaitForChild("Util"))

local Panels = {}

-- Deliberately loose: the Sync snapshot is authored by the server modules, and
-- this module is written to survive a snapshot that carries more or less than
-- it expects rather than to hard-fail on an unfamiliar field.
type Snapshot = { [string]: any }

type PanelDef = {
	id: string,
	frame: Frame,
	body: Frame,
	refresh: () -> (),
	onOpen: (() -> ())?,
	onClose: (() -> ())?,
}

local ACTION_CLOSE = "CrystalCanyonClosePanel"

-- Card interior geometry ---------------------------------------------------
-- `Theme.card` pads its children by 14px horizontally and 12px vertically, so
-- every measurement below is taken inside that padded box.
local CARD_PAD_X = 14
local CARD_PAD_Y = 12
local GAP = 14

--[[ Below this much CARD width a row reflows to the stacked layout. The
	 threshold is measured on the card and not on the viewport on purpose: a
	 1440px window still produces a ~750px card, and a 390px phone produces a
	 ~300px one, but the panel/body/scroller paddings in between mean the
	 viewport width alone does not tell you how much room a card actually has. ]]
local STACK_WIDTH = 520

local ROW_ICON = 72
local HERO_ICON = 104
local ACTION_H = 56
-- The action button takes a share of the card and is clamped at both ends, so
-- it can never outgrow the card (the old fixed 196px button spilled past the
-- left edge of a 184px card) nor squeeze the text column to nothing.
local ACTION_SHARE = 0.30
local ACTION_MIN_W = 150
local ACTION_MAX_W = 240

-- §5.5 grid: equal-width cards, generously gapped, WRAPPING. A fixed cell is
-- what makes UIGridLayout wrap; a `1/count` scale cell forces one row forever
-- and shrinks to 58px on a phone.
local GRID_CELL = Vector2.new(220, 250)
local GRID_GAP = 16

local deps: any = nil
local Theme: any = nil
local layer: Frame? = nil
local panels: { [string]: PanelDef } = {}
local openId: string? = nil
local latest: Snapshot = {}
local sendFn: ((string, ...any) -> ())? = nil
local started = false

-- Remote fallback ---------------------------------------------------------

--[[ The boot script may hand us a `send`; if it does not, we open the c2s
	 remotes ourselves. Either way this module only ever fires intent — an id,
	 never an amount — which is what makes an edited client harmless here. ]]
local remoteCache: { [string]: RemoteEvent } = {}

local function send(name: string, ...: any)
	if sendFn then
		sendFn(name, ...)
		return
	end
	local ev = remoteCache[name]
	if not ev then
		ev = Remotes.get(name)
		remoteCache[name] = ev
	end
	ev:FireServer(...)
end

-- Small construction helpers ----------------------------------------------

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ Body copy sitting on a white card. `Palette.styleText` is the display
	 treatment — white fill, black stroke — which is right on a saturated header
	 and muddy on a white card, so card text is styled from the same tokens
	 without the stroke.

	 `wrap` labels auto-size their height, which is what lets a card grow to fit
	 a two-line blurb on a phone instead of clipping it. ]]
local function text(
	parent: Instance,
	body: string,
	size: number,
	color: Color3,
	font: Enum.Font?,
	wrap: boolean?
): TextLabel
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Font = font or Palette.Font.Display
	label.Text = body
	label.TextSize = size
	label.TextColor3 = color
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Center
	label.TextStrokeTransparency = 1
	if wrap then
		label.TextWrapped = true
		label.Size = UDim2.new(1, 0, 0, 0)
		label.AutomaticSize = Enum.AutomaticSize.Y
	else
		-- TextTruncate is ignored while TextWrapped is on, so the two are
		-- mutually exclusive here rather than both set hopefully.
		label.TextTruncate = Enum.TextTruncate.AtEnd
		label.Size = UDim2.new(1, 0, 0, math.floor(size * 1.4))
	end
	label.Parent = parent
	return label
end

--[[ Functional icons drawn from primitives. The style spec allows emoji only as
	 ornamental section decoration, never as a working icon, so the shop tiles
	 are built out of frames. The tile carries the mandatory outline; the shapes
	 inside it read against the tile fill and would only turn to mud if each got
	 its own 3px stroke at this size. ]]
local function glyph(parent: Instance, kind: string, tint: Color3): Frame
	local tile = Instance.new("Frame")
	tile.Name = "Glyph"
	tile.BackgroundColor3 = tint
	tile.Size = UDim2.fromOffset(72, 72)
	tile.Parent = parent
	corner(tile, Palette.Radius.Card)
	Palette.stroke(tile, Palette.Outline.Icon)

	local ink = Palette.UI.TextLight

	local function part(size: UDim2, pos: UDim2, rot: number?, radius: UDim?): Frame
		local f = Instance.new("Frame")
		f.BackgroundColor3 = ink
		f.BorderSizePixel = 0
		f.AnchorPoint = Vector2.new(0.5, 0.5)
		f.Size = size
		f.Position = pos
		f.Rotation = rot or 0
		f.Parent = tile
		corner(f, radius or UDim.new(0, 3))
		return f
	end

	if kind == "pack" then
		-- A satchel: body, flap, strap.
		part(UDim2.fromOffset(40, 30), UDim2.fromScale(0.5, 0.62), 0, UDim.new(0, 6))
		part(UDim2.fromOffset(44, 10), UDim2.fromScale(0.5, 0.4), 0, UDim.new(0, 4))
		part(UDim2.fromOffset(8, 18), UDim2.fromScale(0.5, 0.3), 0, UDim.new(0, 4))
	elseif kind == "speed" then
		-- Two chevrons, each a pair of bars meeting at a point.
		for i = 0, 1 do
			local x = 0.36 + i * 0.28
			part(UDim2.fromOffset(8, 22), UDim2.fromScale(x, 0.38), 32)
			part(UDim2.fromOffset(8, 22), UDim2.fromScale(x, 0.62), -32)
		end
	elseif kind == "magnet" then
		-- A horseshoe: a ring, its lower third masked back to the tile colour,
		-- and two poles hanging off the cut ends.
		local ring = Instance.new("Frame")
		ring.BackgroundTransparency = 1
		ring.AnchorPoint = Vector2.new(0.5, 0.5)
		ring.Size = UDim2.fromOffset(44, 44)
		ring.Position = UDim2.fromScale(0.5, 0.42)
		ring.Parent = tile
		corner(ring, Palette.Radius.Pill)
		local ringStroke = Instance.new("UIStroke")
		ringStroke.Color = ink
		ringStroke.Thickness = 9
		ringStroke.Parent = ring

		local mask = Instance.new("Frame")
		mask.BackgroundColor3 = tint
		mask.BorderSizePixel = 0
		mask.AnchorPoint = Vector2.new(0.5, 0)
		mask.Size = UDim2.fromOffset(30, 26)
		mask.Position = UDim2.fromScale(0.5, 0.56)
		mask.ZIndex = 2
		mask.Parent = tile

		part(UDim2.fromOffset(9, 20), UDim2.fromScale(0.35, 0.72))
		part(UDim2.fromOffset(9, 20), UDim2.fromScale(0.65, 0.72))
	elseif kind == "crystal" then
		-- A shard: a rotated square with a lighter facet down one side.
		local body = part(UDim2.fromOffset(34, 34), UDim2.fromScale(0.5, 0.5), 45, UDim.new(0, 5))
		body.BackgroundColor3 = ink
		local facet = part(UDim2.fromOffset(12, 34), UDim2.fromScale(0.58, 0.5), 45, UDim.new(0, 5))
		facet.BackgroundColor3 = Palette.shade(ink, 0.18)
	else
		part(UDim2.fromOffset(30, 30), UDim2.fromScale(0.5, 0.5), 45, UDim.new(0, 5))
	end

	return tile
end

-- Snapshot readers --------------------------------------------------------

--[[ `Economy.push` sends each upgrade as `{ level, maxLevel, value, nextCost }`
	 with `nextCost` ABSENT at max level. Both that record and a bare level are
	 read; the richer form always wins. ]]
local function readUpgrade(state: Snapshot, id: string): (number, number?, boolean)
	local entry = if type(state.upgrades) == "table" then (state.upgrades :: any)[id] else nil

	local level = 0
	local cost: number? = nil
	local afford: boolean? = nil

	if type(entry) == "number" then
		level = entry
	elseif type(entry) == "table" then
		level = tonumber(entry.level) or 0
		cost = tonumber(entry.cost) or tonumber(entry.nextCost)
		if type(entry.afford) == "boolean" then
			afford = entry.afford
		elseif type(entry.canAfford) == "boolean" then
			afford = entry.canAfford
		end
	end

	local up = Config.upgradeById(id)
	local maxLevel = if up then up.MaxLevel else 0
	level = math.clamp(math.floor(level), 0, maxLevel)

	if level >= maxLevel then
		-- At max there is no next price at all; `nil` is the signal every
		-- caller uses to render MAX and refuse the purchase.
		return level, nil, false
	end

	if cost == nil then
		cost = Config.upgradeCost(id, level)
	end

	if afford == nil then
		local coins = tonumber(state.coins) or 0
		afford = cost ~= nil and coins >= cost
	end

	return level, cost, afford == true
end

--[[ `Economy.push` sends `zones` as a plain id -> boolean map. The table form is
	 still tolerated so a richer future payload does not need an edit here. ]]
local function readZone(state: Snapshot, zone: any): (boolean, number, boolean)
	local entry = if type(state.zones) == "table" then (state.zones :: any)[zone.Id] else nil

	local unlocked = false
	local cost = zone.UnlockCost
	local afford: boolean? = nil

	if type(entry) == "boolean" then
		unlocked = entry
	elseif type(entry) == "table" then
		unlocked = entry.unlocked == true
		cost = tonumber(entry.cost) or cost
		if type(entry.afford) == "boolean" then
			afford = entry.afford
		elseif type(entry.canAfford) == "boolean" then
			afford = entry.canAfford
		end
	end

	-- A free zone is the starting zone; it is unlocked whether or not the
	-- snapshot bothered to say so.
	if cost <= 0 then
		unlocked = true
	end

	if afford == nil then
		afford = (tonumber(state.coins) or 0) >= cost
	end

	return unlocked, cost, afford == true
end

-- Shared card widgets -----------------------------------------------------

--[[ A purchase control is really several buttons stacked in the same spot: the
	 live green one, a dead grey one, and (zones only) a green "already yours"
	 tag. Toggling visibility avoids recolouring a button after `Theme.button`
	 has already baked its gradient and hard bottom edge from the fill colour —
	 repainting only the background would leave a green edge under a grey face.
	 Rebuilding on every Sync would be worse still, since Sync lands as fast as
	 the collect sweep.

	 `place` moves every one of them at once, which is what lets the reflow below
	 swap the button between a right-hand column and a full-width bar. ]]
type Action = {
	live: TextButton,
	dead: TextButton,
	place: (UDim2, UDim2, Vector2) -> (),
	setLive: (string) -> (),
	setDead: (string) -> (),
	setTag: (string) -> (),
}

local function action(parent: Instance, onClick: () -> ()): Action
	local live: TextButton = Theme.button(parent, "BUY", Palette.UI.Buy)
	live.Activated:Connect(onClick)

	-- `Locked` is the right token here and only here: this is a control that is
	-- genuinely unavailable, not body copy.
	local dead: TextButton = Theme.button(parent, "MAX", Palette.UI.Locked)
	dead.Active = false
	dead.AutoButtonColor = false
	dead.Selectable = false
	dead.Visible = false

	local all: { TextButton } = { live, dead }
	local tag: TextButton? = nil

	local size = UDim2.fromOffset(ACTION_MIN_W, ACTION_H)
	local position = UDim2.new(1, 0, 0.5, 0)
	local anchor = Vector2.new(1, 0.5)

	local function applyTo(btn: TextButton)
		btn.Size = size
		btn.Position = position
		btn.AnchorPoint = anchor
	end

	for _, btn in all do
		applyTo(btn)
	end

	local function hideOthers(keep: TextButton)
		for _, btn in all do
			btn.Visible = btn == keep
		end
	end

	return {
		live = live,
		dead = dead,
		place = function(newSize: UDim2, newPosition: UDim2, newAnchor: Vector2)
			size, position, anchor = newSize, newPosition, newAnchor
			for _, btn in all do
				applyTo(btn)
			end
		end,
		setLive = function(label: string)
			live.Text = label
			hideOthers(live)
		end,
		setDead = function(label: string)
			dead.Text = label
			hideOthers(dead)
		end,
		setTag = function(label: string)
			local t = tag
			if not t then
				t = Theme.button(parent, label, Palette.UI.Buy) :: TextButton
				local made = t :: TextButton
				made.Name = "Tag"
				made.Active = false
				made.AutoButtonColor = false
				made.Selectable = false
				applyTo(made)
				table.insert(all, made)
				tag = made
			end
			local shown = t :: TextButton
			shown.Text = label
			hideOthers(shown)
		end,
	}
end

local function scroller(body: Frame): ScrollingFrame
	local list = Instance.new("ScrollingFrame")
	list.BackgroundTransparency = 1
	list.BorderSizePixel = 0
	list.Size = UDim2.fromScale(1, 1)
	list.CanvasSize = UDim2.new()
	list.AutomaticCanvasSize = Enum.AutomaticSize.Y
	list.ScrollBarThickness = 8
	list.ScrollBarImageColor3 = Palette.Outline.Color
	list.ScrollingDirection = Enum.ScrollingDirection.Y
	list.ZIndex = body.ZIndex + 1
	list.Parent = body

	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 14)
	pad.PaddingBottom = UDim.new(0, 14)
	pad.PaddingLeft = UDim.new(0, 16)
	pad.PaddingRight = UDim.new(0, 16)
	pad.Parent = list

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 12)
	layout.Parent = list

	return list
end

--[[ The one row-card shape in this file: an icon slot, a text column that
	 stacks its own lines with a UIListLayout, and one action control.

	 `apply` is the whole responsive story. It runs off the card's measured width
	 and off the column's measured height, so:
	   • no offset it computes can go negative — the action width is clamped and
	     then subtracted, and the subtraction is always smaller than the width it
	     is taken from (worst case at STACK_WIDTH: 520 - 28 padding - 72 icon -
	     28 gaps - 150 button = 242px of text column left);
	   • the card grows to fit however many lines the blurb wrapped to, rather
	     than clipping them against a hardcoded height.

	 `washColor`, when given, paints a full-bleed outlined panel behind the icon —
	 the shop's featured medallion. It lives inside the slot so it tracks the icon
	 through both layouts instead of floating at a fixed inset. ]]
type Row = {
	card: Frame,
	column: Frame,
	act: Action,
}

local function rowCard(
	parent: Instance,
	iconKind: string,
	tint: Color3,
	iconSize: number,
	onAction: () -> (),
	washColor: Color3?
): Row
	local card = Theme.card(parent, UDim2.new(1, 0, 0, iconSize + CARD_PAD_Y * 2))

	-- The medallion's ring of gold around the icon, 0 when there is no wash.
	local washPad = if washColor then 20 else 0
	-- An oversized hero icon is right on a wide card and is most of a phone's
	-- card, so it falls back to the standard row icon in the stacked layout.
	local narrowIcon = math.min(iconSize, ROW_ICON)

	local slot = Instance.new("Frame")
	slot.Name = "IconSlot"
	slot.BackgroundTransparency = 1
	slot.BorderSizePixel = 0
	slot.Size = UDim2.fromOffset(iconSize + washPad, iconSize + washPad)
	slot.ZIndex = card.ZIndex + 1
	slot.Parent = card

	if washColor then
		local wash = Instance.new("Frame")
		wash.Name = "Wash"
		wash.Size = UDim2.fromScale(1, 1)
		wash.BackgroundColor3 = washColor
		wash.BorderSizePixel = 0
		wash.ZIndex = slot.ZIndex
		wash.Parent = slot
		corner(wash, Palette.Radius.Card)
		-- §9.1 is that EVERY surface carries the outline. This gold wash was the
		-- one frame in the client that shipped without one.
		Palette.stroke(wash, Palette.Outline.Card)
	end

	local tile = glyph(slot, iconKind, tint)
	tile.AnchorPoint = Vector2.new(0.5, 0.5)
	tile.Position = UDim2.fromScale(0.5, 0.5)
	tile.Size = UDim2.fromOffset(iconSize, iconSize)
	tile.ZIndex = slot.ZIndex + 1

	local column = Instance.new("Frame")
	column.Name = "Column"
	column.BackgroundTransparency = 1
	column.BorderSizePixel = 0
	column.AutomaticSize = Enum.AutomaticSize.Y
	column.Size = UDim2.new(1, -(iconSize + washPad + GAP), 0, 0)
	column.ZIndex = card.ZIndex + 1
	column.Parent = card

	local lines = Instance.new("UIListLayout")
	lines.FillDirection = Enum.FillDirection.Vertical
	lines.SortOrder = Enum.SortOrder.LayoutOrder
	lines.Padding = UDim.new(0, 4)
	lines.Parent = column

	local act = action(card, onAction)

	local function apply()
		local width = card.AbsoluteSize.X
		if width < 1 then
			return -- not laid out yet; the AbsoluteSize signal brings us back
		end
		local content = width - CARD_PAD_X * 2
		local stacked = width < STACK_WIDTH

		local icon = if stacked then narrowIcon else iconSize
		local slotSize = icon + washPad
		slot.Size = UDim2.fromOffset(slotSize, slotSize)
		tile.Size = UDim2.fromOffset(icon, icon)

		--[[ The column's height is read back below, one layout pass behind the
			 width just written to it — Roblox does not recompute AbsoluteSize
			 synchronously. That is fine and is why `apply` is also bound to the
			 column's own AbsoluteSize: the pass that measures the re-wrapped text
			 arrives on the next frame and settles the card height then. ]]
		local size: UDim2

		if stacked then
			-- Stacked: icon + text on one row, action as a full-width bar below.
			slot.AnchorPoint = Vector2.new(0, 0)
			slot.Position = UDim2.fromOffset(0, 0)
			column.AnchorPoint = Vector2.new(0, 0)
			column.Position = UDim2.fromOffset(slotSize + GAP, 0)
			column.Size = UDim2.new(1, -(slotSize + GAP), 0, 0)
			act.place(UDim2.new(1, 0, 0, ACTION_H), UDim2.new(0.5, 0, 1, 0), Vector2.new(0.5, 1))
			local top = math.max(slotSize, column.AbsoluteSize.Y)
			size = UDim2.new(1, 0, 0, top + GAP + ACTION_H + CARD_PAD_Y * 2)
		else
			local actionW = math.clamp(math.floor(content * ACTION_SHARE), ACTION_MIN_W, ACTION_MAX_W)
			slot.AnchorPoint = Vector2.new(0, 0.5)
			slot.Position = UDim2.new(0, 0, 0.5, 0)
			column.AnchorPoint = Vector2.new(0, 0.5)
			column.Position = UDim2.new(0, slotSize + GAP, 0.5, 0)
			column.Size = UDim2.new(1, -(slotSize + GAP * 2 + actionW), 0, 0)
			act.place(UDim2.fromOffset(actionW, ACTION_H), UDim2.new(1, 0, 0.5, 0), Vector2.new(1, 0.5))
			local top = math.max(slotSize, column.AbsoluteSize.Y)
			size = UDim2.new(1, 0, 0, top + CARD_PAD_Y * 2)
		end

		if card.Size ~= size then
			card.Size = size
		end
	end

	apply()
	-- Width changes come from the card; height changes come from the text
	-- wrapping to a different number of lines. Both must re-run the layout, and
	-- neither can drive the other into a loop: `apply` only ever writes a height
	-- that is a pure function of the measured width.
	card:GetPropertyChangedSignal("AbsoluteSize"):Connect(apply)
	column:GetPropertyChangedSignal("AbsoluteSize"):Connect(apply)

	return { card = card, column = column, act = act }
end

-- UPGRADES ----------------------------------------------------------------

local function buildUpgrades(): PanelDef
	-- No fixed size: `Theme.panel` only takes its responsive branch (and its
	-- narrow-viewport scale) when the caller does not pin one.
	local panel, body = Theme.panel(layer, "UPGRADES", Palette.UI.HeaderCyan)
	local list = scroller(body)

	local rows: { () -> () } = {}

	for index, up in Config.Upgrades do
		local row = rowCard(list, up.Icon, Palette.UI.HeaderCyan, ROW_ICON, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			-- Refuse locally when the synced state says the purchase cannot
			-- land. The server refuses it too; this only spares the player a
			-- rejection toast for something the UI already knew.
			if level >= up.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", up.Id)
		end)
		row.card.LayoutOrder = index

		-- Names wrap rather than truncate: a truncated card title on a phone reads
		-- as a bug, and the column auto-sizes to whatever it wraps to.
		local name = text(row.column, up.Name, Palette.TextSize.Section, Palette.UI.TextDark, nil, true)
		name.LayoutOrder = 1

		-- §9.10: live copy is not rendered in `Locked`, the desaturated
		-- unavailable-control grey. `TextMuted` is the body-copy token, and the
		-- size comes up to the card size the rest of the panel is drawn at.
		local blurb = text(row.column, up.Blurb, Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body, true)
		blurb.LayoutOrder = 2

		local stat = text(row.column, "", Palette.TextSize.Card, Palette.UI.HeaderCyan, nil, true)
		stat.LayoutOrder = 3

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			local value = Config.upgradeValue(up.Id, level)

			stat.Text = `LEVEL {level} / {up.MaxLevel}  ·  {Util.comma(value)} {string.upper(up.Unit)}`

			if cost == nil then
				row.act.setDead("MAX")
			elseif afford then
				row.act.setLive(Util.comma(cost))
			else
				-- Unaffordable still shows the price: the player needs to know
				-- what they are saving towards, not just that they cannot buy.
				row.act.setDead(Util.comma(cost))
			end
		end)
	end

	return {
		id = "upgrades",
		frame = panel,
		body = body,
		refresh = function()
			for _, fn in rows do
				fn()
			end
		end,
	}
end

-- SHOP --------------------------------------------------------------------

local function buildShop(): PanelDef
	local panel, body = Theme.panel(layer, "SHOP", Palette.UI.HeaderGold)
	local list = scroller(body)

	local rows: { () -> () } = {}

	-- FEATURED ------------------------------------------------------------
	-- Emoji flanking a section label is the one place the style spec permits
	-- them: ornament, never a functional icon.
	local featuredLabel = Theme.sectionLabel(list, "🔥 FEATURED 🔥")
	featuredLabel.LayoutOrder = 1

	local hero = Config.Upgrades[1]
	if hero then
		local row = rowCard(list, hero.Icon, Palette.UI.Premium, HERO_ICON, function()
			local level, cost, afford = readUpgrade(latest, hero.Id)
			if level >= hero.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", hero.Id)
		end, Palette.lift(Palette.UI.Premium, 0.7))
		row.card.LayoutOrder = 2

		local ribbon = Instance.new("Frame")
		ribbon.Name = "Ribbon"
		ribbon.BackgroundColor3 = Palette.UI.Close
		ribbon.AnchorPoint = Vector2.new(0, 0)
		-- Sized as a share of the text column with a ceiling, not a flat 150px:
		-- on the narrowest supported panel the column is ~134px and a fixed
		-- ribbon would hang off the side of its own card.
		ribbon.Size = UDim2.new(1, 0, 0, 30)
		ribbon.Position = UDim2.fromOffset(0, 0)
		ribbon.ZIndex = row.card.ZIndex + 3
		ribbon.Parent = row.column
		ribbon.LayoutOrder = 0
		corner(ribbon, Palette.Radius.Pill)
		Palette.stroke(ribbon, Palette.Outline.Button)

		local ribbonWidth = Instance.new("UISizeConstraint")
		ribbonWidth.MaxSize = Vector2.new(150, 30)
		ribbonWidth.Parent = ribbon

		local ribbonText = text(ribbon, "BEST VALUE", Palette.TextSize.Small, Palette.UI.TextLight)
		ribbonText.Size = UDim2.fromScale(1, 1)
		ribbonText.ZIndex = ribbon.ZIndex + 1
		ribbonText.TextXAlignment = Enum.TextXAlignment.Center
		Palette.styleText(ribbonText, Palette.TextSize.Small)

		local name = text(row.column, hero.Name, Palette.TextSize.Title, Palette.UI.TextDark, nil, true)
		name.LayoutOrder = 1

		local blurb = text(row.column, hero.Blurb, Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body, true)
		blurb.LayoutOrder = 2

		local stat = text(row.column, "", Palette.TextSize.Card, Palette.UI.HeaderCyan, nil, true)
		stat.LayoutOrder = 3

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, hero.Id)
			local value = Config.upgradeValue(hero.Id, level)
			stat.Text = `LEVEL {level} / {hero.MaxLevel}  ·  {Util.comma(value)} {string.upper(hero.Unit)}`
			if cost == nil then
				row.act.setDead("MAX")
			elseif afford then
				row.act.setLive(Util.comma(cost))
			else
				row.act.setDead(Util.comma(cost))
			end
		end)
	end

	-- ALL UPGRADES --------------------------------------------------------
	local gridLabel = Theme.sectionLabel(list, "⭐ ALL UPGRADES ⭐")
	gridLabel.LayoutOrder = 3

	local gridHolder = Instance.new("Frame")
	gridHolder.Name = "Grid"
	gridHolder.BackgroundTransparency = 1
	gridHolder.BorderSizePixel = 0
	gridHolder.LayoutOrder = 4
	-- The holder grows with its rows. A fixed 250px holder could only ever show
	-- one row, so a wrapped second row had nowhere to be drawn.
	gridHolder.Size = UDim2.new(1, 0, 0, 0)
	gridHolder.AutomaticSize = Enum.AutomaticSize.Y
	gridHolder.ZIndex = list.ZIndex + 1
	gridHolder.Parent = list

	--[[ §5.5: equal-width cards, generously gapped, wrapping rather than
		 scrolling sideways. A FIXED cell is what makes UIGridLayout wrap — the
		 old `1 / count` scale cell pinned all three cards to a single row at
		 every width, which is 58px per card on a 390pt phone. Centring the row
		 keeps the grid balanced however many cards fit across. ]]
	local grid = Instance.new("UIGridLayout")
	grid.CellSize = UDim2.fromOffset(GRID_CELL.X, GRID_CELL.Y)
	grid.CellPadding = UDim2.fromOffset(GRID_GAP, GRID_GAP)
	grid.SortOrder = Enum.SortOrder.LayoutOrder
	grid.HorizontalAlignment = Enum.HorizontalAlignment.Center
	grid.Parent = gridHolder

	local tints = { Palette.UI.HeaderCyan, Palette.UI.HeaderGreen, Palette.UI.HeaderPurple }

	for index, up in Config.Upgrades do
		-- Cell geometry is fixed and known, so this card can position from
		-- offsets safely: every one of them is checked against the 220x250 cell
		-- minus Theme.card's padding (192x226) and none of them can go negative.
		local card = Theme.card(gridHolder, UDim2.fromScale(1, 1))
		card.LayoutOrder = index

		local tint = tints[((index - 1) % #tints) + 1]

		local tile = glyph(card, up.Icon, tint)
		tile.AnchorPoint = Vector2.new(0.5, 0)
		tile.Size = UDim2.fromOffset(84, 84)
		tile.Position = UDim2.new(0.5, 0, 0, 0)

		local name = text(card, up.Name, Palette.TextSize.Card, Palette.UI.TextDark)
		name.Position = UDim2.new(0, 0, 0, 92)
		name.Size = UDim2.new(1, 0, 0, 28)
		name.TextXAlignment = Enum.TextXAlignment.Center

		local levelLabel = text(card, "", Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body)
		levelLabel.Position = UDim2.new(0, 0, 0, 122)
		levelLabel.Size = UDim2.new(1, 0, 0, 26)
		levelLabel.TextXAlignment = Enum.TextXAlignment.Center

		local buy = action(card, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			if level >= up.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", up.Id)
		end)
		buy.place(UDim2.new(1, 0, 0, ACTION_H), UDim2.new(0.5, 0, 1, 0), Vector2.new(0.5, 1))

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			levelLabel.Text = `LEVEL {level} / {up.MaxLevel}`
			if cost == nil then
				buy.setDead("MAX")
			elseif afford then
				buy.setLive(Util.comma(cost))
			else
				buy.setDead(Util.comma(cost))
			end
		end)
	end

	return {
		id = "shop",
		frame = panel,
		body = body,
		refresh = function()
			for _, fn in rows do
				fn()
			end
		end,
	}
end

-- CODES -------------------------------------------------------------------

local function buildCodes(): PanelDef
	local panel, body = Theme.panel(layer, "CODES", Palette.UI.HeaderGreen)

	--[[ `Theme.panel` already parents a UIPadding to the body, and an instance
		 may only have one — a second was silently doing nothing here. The extra
		 breathing room this panel wants lives on its own form instead, which is
		 also what keeps the input group a sensible width when the responsive
		 panel is 820px across on desktop and 366px on a phone. ]]
	local form = Instance.new("Frame")
	form.Name = "Form"
	form.BackgroundTransparency = 1
	form.BorderSizePixel = 0
	form.AnchorPoint = Vector2.new(0.5, 0.5)
	form.Position = UDim2.fromScale(0.5, 0.5)
	form.Size = UDim2.new(1, 0, 0, 0)
	form.AutomaticSize = Enum.AutomaticSize.Y
	form.ZIndex = body.ZIndex + 1
	form.Parent = body

	local width = Instance.new("UISizeConstraint")
	width.MaxSize = Vector2.new(520, 100000)
	width.Parent = form

	local column = Instance.new("UIListLayout")
	column.FillDirection = Enum.FillDirection.Vertical
	column.SortOrder = Enum.SortOrder.LayoutOrder
	column.Padding = UDim.new(0, 14)
	column.HorizontalAlignment = Enum.HorizontalAlignment.Center
	column.Parent = form

	local prompt = text(form, "ENTER A CODE", Palette.TextSize.Section, Palette.UI.TextDark)
	prompt.LayoutOrder = 1
	prompt.Size = UDim2.new(1, 0, 0, 32)
	prompt.TextXAlignment = Enum.TextXAlignment.Center

	local box = Instance.new("TextBox")
	box.Name = "CodeBox"
	box.LayoutOrder = 2
	box.BackgroundColor3 = Palette.UI.BodyTint
	box.BorderSizePixel = 0
	box.Size = UDim2.new(1, 0, 0, 64)
	box.Font = Palette.Font.Display
	box.TextSize = Palette.TextSize.Section
	box.TextColor3 = Palette.UI.TextDark
	box.PlaceholderText = "CODE"
	-- Placeholder copy is live copy, not a disabled control (§9.10).
	box.PlaceholderColor3 = Palette.UI.TextMuted
	box.Text = ""
	box.ClearTextOnFocus = false
	box.TextStrokeTransparency = 1
	box.TextXAlignment = Enum.TextXAlignment.Center
	box.ZIndex = form.ZIndex + 1
	box.Parent = form
	corner(box, Palette.Radius.Button)
	Palette.stroke(box, Palette.Outline.Panel)

	--[[ Display-side tidying only. The client upper-cases and trims so what the
		 player reads matches what they will be judged on, but the string is sent
		 as-is beyond that and `Codes.redeem` does the real normalising and the
		 only validation that counts. Truncation here mirrors the server's
		 MaxLength so the box cannot show more than the server would accept. ]]
	local function normalise()
		local raw = string.upper((string.gsub(box.Text, "%s", "")))
		if #raw > Config.CodeInput.MaxLength then
			raw = string.sub(raw, 1, Config.CodeInput.MaxLength)
		end
		if box.Text ~= raw then
			box.Text = raw
		end
		return raw
	end

	box.FocusLost:Connect(function()
		normalise()
	end)

	local result = text(form, "", Palette.TextSize.Card, Palette.UI.TextMuted, nil, true)
	result.LayoutOrder = 4
	result.TextXAlignment = Enum.TextXAlignment.Center

	local submit: TextButton = Theme.button(form, "REDEEM", Palette.UI.Buy, UDim2.new(1, 0, 0, 64))
	submit.LayoutOrder = 3
	submit.Activated:Connect(function()
		local code = normalise()
		if code == "" then
			result.TextColor3 = Palette.UI.Close
			result.Text = "TYPE A CODE FIRST"
			return
		end
		result.TextColor3 = Palette.UI.TextMuted
		result.Text = "CHECKING..."
		send("Redeem", code)
	end)

	--[[ There are no RemoteFunctions in this game, so the redeem verdict comes
		 back as a `Notify` rather than a return value. We only claim a Notify
		 while this panel is the open one — otherwise an unrelated toast (a
		 refused sell, say) would appear in the codes result line and read as an
		 answer to a code the player never typed. ]]
	Remotes.get("Notify").OnClientEvent:Connect(function(payload: any)
		if openId ~= "codes" then
			return
		end
		local message = if type(payload) == "table" then payload.text else payload
		if type(message) ~= "string" then
			return
		end
		local kind = if type(payload) == "table" then payload.kind else nil
		result.TextColor3 = if kind == "error"
				or kind == "bad"
				or kind == "deny"
			then Palette.UI.Close
			else Palette.UI.Buy
		result.Text = string.upper(message)
	end)

	return {
		id = "codes",
		frame = panel,
		body = body,
		refresh = function() end,
		onOpen = function()
			result.Text = ""
			result.TextColor3 = Palette.UI.TextMuted
		end,
		onClose = function()
			box:ReleaseFocus()
		end,
	}
end

-- ZONES -------------------------------------------------------------------

local function buildZones(): PanelDef
	local panel, body = Theme.panel(layer, "ZONES", Palette.UI.HeaderPurple)
	local list = scroller(body)

	local header = Theme.sectionLabel(list, "✨ PROGRESSION ✨")
	header.LayoutOrder = 1

	local rows: { () -> () } = {}

	for index, zone in Config.Zones do
		local row = rowCard(list, "crystal", zone.CrystalColor, ROW_ICON, function()
			local unlocked, _, afford = readZone(latest, zone)
			if unlocked or not afford then
				return
			end
			send("Unlock", zone.Id)
		end)
		row.card.LayoutOrder = index + 1

		local name = text(row.column, zone.Name, Palette.TextSize.Section, Palette.UI.TextDark, nil, true)
		name.LayoutOrder = 1

		local yieldLabel = text(row.column, "", Palette.TextSize.Card, zone.AccentColor, nil, true)
		yieldLabel.LayoutOrder = 2

		local costLabel = text(row.column, "", Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body, true)
		costLabel.LayoutOrder = 3

		table.insert(rows, function()
			local unlocked, cost, afford = readZone(latest, zone)
			local coins = tonumber(latest.coins) or 0

			yieldLabel.Text = `{Util.comma(zone.ShardValue)} {Config.Currency.Shards.Display} PER CRYSTAL`

			if unlocked then
				costLabel.Text = "OPEN — GO COLLECT"
				-- The "already yours" state is a tag, not a control. It is built
				-- from Theme.button so it matches the other two states pixel for
				-- pixel, then deadened so nothing about it invites a click.
				row.act.setTag("UNLOCKED")
				return
			end

			costLabel.Text = `UNLOCK COST  {Util.comma(cost)} {Config.Currency.Coins.Display}`

			if afford then
				row.act.setLive(`UNLOCK  {Util.comma(cost)}`)
			else
				-- Show the gap rather than the price here: on a progression
				-- screen "how far away am I" is the question being asked.
				row.act.setDead(`{Util.comma(math.max(cost - coins, 0))} MORE`)
			end
		end)
	end

	return {
		id = "zones",
		frame = panel,
		body = body,
		refresh = function()
			for _, fn in rows do
				fn()
			end
		end,
	}
end

-- Open / close ------------------------------------------------------------

local function bindEscape(bound: boolean)
	if bound then
		--[[ Bound only while a panel is open so Escape still reaches the Roblox
			 menu the rest of the time. Sinking it unconditionally would take the
			 platform's own escape hatch away from the player. ]]
		ContextActionService:BindAction(ACTION_CLOSE, function(_, state)
			if state == Enum.UserInputState.Begin then
				Panels.close()
			end
			return Enum.ContextActionResult.Sink
		end, false, Enum.KeyCode.Escape)
	else
		ContextActionService:UnbindAction(ACTION_CLOSE)
	end
end

-- Public surface ----------------------------------------------------------

function Panels.close()
	local current = openId
	if current == nil then
		return
	end
	openId = nil
	local def = panels[current]
	if def then
		if def.onClose then
			def.onClose()
		end
		Theme.close(def.frame)
	end
	bindEscape(false)
end

function Panels.open(id: string)
	-- Callers spell the id however their button was labelled; the panel table is
	-- lower case so the HUD can pass "SHOP" or "shop" and be right either way.
	local key = string.lower(id)
	local def = panels[key]
	if not def then
		return
	end
	--[[ Already the open one, so this is a second press on the same HUD button.
		 The one edge here: for the ~140ms of Theme's close animation after the
		 red X is pressed, `openId` still names this panel (it clears on the
		 `Closed` event), so a re-press inside that window is swallowed. That is
		 shorter than a double-click interval and the panel is visibly closing,
		 so it reads as the press landing on the animation rather than as a dead
		 button. ]]
	if openId == key then
		return
	end

	-- One at a time. `Theme.close` on the outgoing panel takes its own backdrop
	-- down with it; the incoming `Theme.open` brings a fresh one up.
	local previous = openId
	openId = key

	if previous and panels[previous] then
		local old = panels[previous]
		if old.onClose then
			old.onClose()
		end
		Theme.close(old.frame)
	end

	if def.onOpen then
		def.onOpen()
	end
	def.refresh()
	Theme.open(def.frame)
	bindEscape(true)
end

--[[ The only way state reaches these panels. Every panel is refreshed, not just
	 the visible one, so opening a panel shows current numbers immediately rather
	 than the numbers from whenever it was last on screen. ]]
function Panels.render(state: Snapshot)
	if type(state) ~= "table" then
		return
	end
	latest = state
	for _, def in panels do
		def.refresh()
	end
end

function Panels.init(inputDeps: any)
	if started then
		return
	end
	started = true

	deps = inputDeps or {}
	Theme = deps.Theme or deps.theme
	assert(Theme, "Panels.init requires deps.Theme")

	-- `screen` is what the client boot script calls the ScreenGui; the other
	-- spellings are accepted so a different host does not have to rename it.
	local parent = deps.gui or deps.screenGui or deps.screen or deps.parent
	assert(typeof(parent) == "Instance", "Panels.init requires deps.gui — the ScreenGui the modals live in")

	if type(deps.send) == "function" then
		sendFn = deps.send
	end

	--[[ One layer holds all four modal shells so they sit above the HUD as a
		 group. It has no backdrop of its own — each `Theme.panel` builds and
		 animates its own, and duplicating that here is what made the modals
		 invisible in the first place. The layer is transparent and inactive, so
		 it never intercepts input; only Theme's backdrop does that, and only
		 while it is shown. ]]
	local lay = Instance.new("Frame")
	lay.Name = "Panels"
	lay.BackgroundTransparency = 1
	lay.BorderSizePixel = 0
	lay.Size = UDim2.fromScale(1, 1)
	lay.ZIndex = 40
	lay.Parent = parent
	layer = lay

	local built = { buildShop(), buildUpgrades(), buildCodes(), buildZones() }

	for _, def in built do
		panels[def.id] = def

		--[[ `Theme.panel` fires this once its own close animation finishes,
			 whichever route triggered it. It is the documented hook for keeping
			 the one-open-at-a-time rule without adding a second handler to
			 Theme's close button.

			 If `openId` has already moved on, the close was ours (Panels.close,
			 or the outgoing half of an open) and the bookkeeping is done; the
			 only case left is the player pressing Theme's red X, which this
			 branch catches. ]]
		local closed = def.frame:FindFirstChild("Closed")
		if closed and closed:IsA("BindableEvent") then
			closed.Event:Connect(function()
				if openId ~= def.id then
					return
				end
				openId = nil
				if def.onClose then
					def.onClose()
				end
				bindEscape(false)
			end)
		end
	end
end

return Panels
