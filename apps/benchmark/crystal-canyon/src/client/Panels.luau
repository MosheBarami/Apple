--!strict
--[[
	Crystal Canyon — the four modals: SHOP, UPGRADES, CODES, ZONES.

	Two invariants shape every line below.

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

	Prices are read from the snapshot when the snapshot carries them, and
	otherwise derived through `Config.upgradeCost` from the *synced level*. That
	fallback is not client bookkeeping: Config is the same table the server
	charges against, so a price shown here can never be one the server would
	reject. What is never done is deriving a price or a balance from anything
	this client believes happened locally.
]]

local ContextActionService = game:GetService("ContextActionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

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
	scale: UIScale,
	-- Bumped on every open/close transition. A close tween that finishes after
	-- the panel has been reopened must not hide it; comparing tokens is how the
	-- stale completion callback recognises that it lost the race.
	token: number,
	refresh: () -> (),
	onOpen: (() -> ())?,
	onClose: (() -> ())?,
}

local OPEN_TIME = 0.18
local CLOSE_TIME = 0.12
local OPEN_FROM_SCALE = 0.86
local CLOSE_TO_SCALE = 0.90
local BACKDROP_TRANSPARENCY = 0.45

local ACTION_CLOSE = "CrystalCanyonClosePanel"

local deps: any = nil
local Theme: any = nil
local layer: Frame? = nil
local backdrop: Frame? = nil
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
	 without the stroke. ]]
local function text(parent: Instance, body: string, size: number, color: Color3, font: Enum.Font?): TextLabel
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Font = font or Palette.Font.Display
	label.Text = body
	label.TextSize = size
	label.TextColor3 = color
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Center
	label.TextStrokeTransparency = 1
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

--[[ `Theme.panel` builds the close button but only hands back the panel and its
	 body, so we go and find it. If a future Theme names it differently we build
	 our own rather than shipping a modal the player cannot dismiss — a panel
	 that traps the screen is a worse failure than a duplicated button. ]]
local function findCloseButton(panel: Frame): TextButton?
	local fallback: TextButton? = nil
	for _, child in panel:GetDescendants() do
		if child:IsA("TextButton") then
			local name = string.lower(child.Name)
			if string.find(name, "close", 1, true) then
				return child
			end
			local t = child.Text
			if t == "X" or t == "x" or t == "✕" then
				fallback = child
			end
		end
	end
	return fallback
end

-- Snapshot readers --------------------------------------------------------

--[[ The snapshot may describe an upgrade as a bare level or as a record the
	 server has already priced. Both are read; the richer form always wins, so
	 the day Economy.push starts sending costs, this file starts using them
	 without an edit. ]]
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

--[[ A purchase control is really two buttons stacked in the same spot: the live
	 green one and a dead grey one. Toggling visibility avoids recolouring a
	 button after `Theme.button` has already baked its gradient and hard bottom
	 edge from the fill colour — repainting only the background would leave a
	 green edge under a grey face. Rebuilding on every Sync would be worse still,
	 since Sync lands as fast as the collect sweep. ]]
type Action = {
	live: TextButton,
	dead: TextButton,
	setLive: (string) -> (),
	setDead: (string) -> (),
}

local function action(parent: Instance, size: UDim2, position: UDim2, anchor: Vector2, onClick: () -> ()): Action
	local live = Theme.button(parent, "BUY", Palette.UI.Buy, size, position)
	live.AnchorPoint = anchor
	live.Activated:Connect(onClick)

	local dead = Theme.button(parent, "MAX", Palette.UI.Locked, size, position)
	dead.AnchorPoint = anchor
	dead.Active = false
	dead.AutoButtonColor = false
	dead.Selectable = false
	dead.Visible = false

	return {
		live = live,
		dead = dead,
		setLive = function(label: string)
			live.Text = label
			live.Visible = true
			dead.Visible = false
		end,
		setDead = function(label: string)
			dead.Text = label
			dead.Visible = true
			live.Visible = false
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

-- UPGRADES ----------------------------------------------------------------

local function buildUpgrades(): PanelDef
	local panel, body = Theme.panel(layer, "UPGRADES", Palette.UI.HeaderCyan, UDim2.fromScale(0.58, 0.74))
	local list = scroller(body)

	local rows: { () -> () } = {}

	for index, up in Config.Upgrades do
		local card = Theme.card(list, UDim2.new(1, 0, 0, 112))
		card.LayoutOrder = index

		local tile = glyph(card, up.Icon, Palette.UI.HeaderCyan)
		tile.AnchorPoint = Vector2.new(0, 0.5)
		tile.Position = UDim2.new(0, 16, 0.5, 0)

		local name = text(card, up.Name, Palette.TextSize.Card, Palette.UI.TextDark)
		name.Position = UDim2.new(0, 100, 0, 14)
		name.Size = UDim2.new(1, -320, 0, 26)

		local blurb = text(card, up.Blurb, Palette.TextSize.Small, Palette.UI.Locked, Palette.Font.Body)
		blurb.Position = UDim2.new(0, 100, 0, 42)
		blurb.Size = UDim2.new(1, -320, 0, 20)
		blurb.TextTruncate = Enum.TextTruncate.AtEnd

		local levelLabel = text(card, "", Palette.TextSize.Small, Palette.UI.TextDark)
		levelLabel.Position = UDim2.new(0, 100, 0, 68)
		levelLabel.Size = UDim2.new(0, 150, 0, 26)

		local valueLabel = text(card, "", Palette.TextSize.Small, Palette.UI.HeaderCyan)
		valueLabel.Position = UDim2.new(0, 250, 0, 68)
		valueLabel.Size = UDim2.new(1, -470, 0, 26)
		valueLabel.TextTruncate = Enum.TextTruncate.AtEnd

		local buy = action(card, UDim2.fromOffset(196, 60), UDim2.new(1, -18, 0.5, 0), Vector2.new(1, 0.5), function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			-- Refuse locally when the synced state says the purchase cannot
			-- land. The server refuses it too; this only spares the player a
			-- rejection toast for something the UI already knew.
			if level >= up.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", up.Id)
		end)

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			local value = Config.upgradeValue(up.Id, level)

			levelLabel.Text = `LEVEL {level} / {up.MaxLevel}`
			valueLabel.Text = `{Util.comma(value)} {string.upper(up.Unit)}`

			if cost == nil then
				buy.setDead("MAX")
			elseif afford then
				buy.setLive(Util.comma(cost))
			else
				-- Unaffordable still shows the price: the player needs to know
				-- what they are saving towards, not just that they cannot buy.
				buy.setDead(Util.comma(cost))
			end
		end)
	end

	return {
		id = "upgrades",
		frame = panel,
		body = body,
		scale = nil :: any,
		token = 0,
		refresh = function()
			for _, fn in rows do
				fn()
			end
		end,
	}
end

-- SHOP --------------------------------------------------------------------

local function buildShop(): PanelDef
	local panel, body = Theme.panel(layer, "SHOP", Palette.UI.HeaderGold, UDim2.fromScale(0.64, 0.78))
	local list = scroller(body)

	local rows: { () -> () } = {}

	-- FEATURED ------------------------------------------------------------
	-- Emoji flanking a section label is the one place the style spec permits
	-- them: ornament, never a functional icon.
	local featuredLabel = Theme.sectionLabel(list, "🔥 FEATURED 🔥")
	featuredLabel.LayoutOrder = 1

	local hero = Config.Upgrades[1]
	if hero then
		local card = Theme.card(list, UDim2.new(1, 0, 0, 168))
		card.LayoutOrder = 2

		-- A gold wash behind the hero card's left half so the featured slot
		-- reads as a storefront pitch rather than the first row of a list.
		local wash = Instance.new("Frame")
		wash.BackgroundColor3 = Palette.lift(Palette.UI.Premium, 0.7)
		wash.BorderSizePixel = 0
		wash.Size = UDim2.new(0, 210, 1, 0)
		wash.Parent = card
		corner(wash, Palette.Radius.Card)

		local tile = glyph(card, hero.Icon, Palette.UI.Premium)
		tile.AnchorPoint = Vector2.new(0.5, 0.5)
		tile.Size = UDim2.fromOffset(104, 104)
		tile.Position = UDim2.new(0, 105, 0.5, 6)

		local ribbon = Instance.new("Frame")
		ribbon.BackgroundColor3 = Palette.UI.Close
		ribbon.AnchorPoint = Vector2.new(0.5, 0)
		ribbon.Size = UDim2.fromOffset(168, 34)
		ribbon.Position = UDim2.new(0, 105, 0, -12)
		ribbon.ZIndex = 3
		ribbon.Parent = card
		corner(ribbon, Palette.Radius.Pill)
		Palette.stroke(ribbon, Palette.Outline.Button)

		local ribbonText = text(ribbon, "BEST VALUE", Palette.TextSize.Small, Palette.UI.TextLight)
		ribbonText.Size = UDim2.fromScale(1, 1)
		ribbonText.ZIndex = 4
		ribbonText.TextXAlignment = Enum.TextXAlignment.Center
		Palette.styleText(ribbonText, Palette.TextSize.Small)

		local name = text(card, hero.Name, Palette.TextSize.Title, Palette.UI.TextDark)
		name.Position = UDim2.new(0, 230, 0, 24)
		name.Size = UDim2.new(1, -260, 0, 40)

		local blurb = text(card, hero.Blurb, Palette.TextSize.Card, Palette.UI.Locked, Palette.Font.Body)
		blurb.Position = UDim2.new(0, 230, 0, 66)
		blurb.Size = UDim2.new(1, -260, 0, 28)
		blurb.TextTruncate = Enum.TextTruncate.AtEnd

		local stat = text(card, "", Palette.TextSize.Card, Palette.UI.HeaderCyan)
		stat.Position = UDim2.new(0, 230, 0, 100)
		stat.Size = UDim2.new(1, -480, 0, 30)
		stat.TextTruncate = Enum.TextTruncate.AtEnd

		local buy = action(card, UDim2.fromOffset(210, 64), UDim2.new(1, -20, 1, -20), Vector2.new(1, 1), function()
			local level, cost, afford = readUpgrade(latest, hero.Id)
			if level >= hero.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", hero.Id)
		end)

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, hero.Id)
			local value = Config.upgradeValue(hero.Id, level)
			stat.Text = `LEVEL {level} / {hero.MaxLevel}  ·  {Util.comma(value)} {string.upper(hero.Unit)}`
			if cost == nil then
				buy.setDead("MAX")
			elseif afford then
				buy.setLive(Util.comma(cost))
			else
				buy.setDead(Util.comma(cost))
			end
		end)
	end

	-- ALL UPGRADES --------------------------------------------------------
	local gridLabel = Theme.sectionLabel(list, "⭐ ALL UPGRADES ⭐")
	gridLabel.LayoutOrder = 3

	local gridHolder = Instance.new("Frame")
	gridHolder.BackgroundTransparency = 1
	gridHolder.LayoutOrder = 4
	gridHolder.Size = UDim2.new(1, 0, 0, 250)
	gridHolder.Parent = list

	-- §5.5: equal-width cards, generously gapped, wrapping rather than
	-- scrolling sideways. The cell width is a fraction of the row so the shop
	-- keeps its grid at any viewport width.
	local count = math.max(#Config.Upgrades, 1)
	local grid = Instance.new("UIGridLayout")
	grid.CellSize = UDim2.new(1 / count, -12, 0, 244)
	grid.CellPadding = UDim2.fromOffset(16, 16)
	grid.SortOrder = Enum.SortOrder.LayoutOrder
	grid.HorizontalAlignment = Enum.HorizontalAlignment.Center
	grid.Parent = gridHolder

	local tints = { Palette.UI.HeaderCyan, Palette.UI.HeaderGreen, Palette.UI.HeaderPurple }

	for index, up in Config.Upgrades do
		local card = Theme.card(gridHolder, UDim2.fromScale(1, 1))
		card.LayoutOrder = index

		local tint = tints[((index - 1) % #tints) + 1]

		local tile = glyph(card, up.Icon, tint)
		tile.AnchorPoint = Vector2.new(0.5, 0)
		tile.Size = UDim2.fromOffset(84, 84)
		tile.Position = UDim2.new(0.5, 0, 0, 16)

		local name = text(card, up.Name, Palette.TextSize.Card, Palette.UI.TextDark)
		name.Position = UDim2.new(0, 10, 0, 110)
		name.Size = UDim2.new(1, -20, 0, 26)
		name.TextXAlignment = Enum.TextXAlignment.Center

		local levelLabel = text(card, "", Palette.TextSize.Small, Palette.UI.Locked, Palette.Font.Body)
		levelLabel.Position = UDim2.new(0, 10, 0, 138)
		levelLabel.Size = UDim2.new(1, -20, 0, 22)
		levelLabel.TextXAlignment = Enum.TextXAlignment.Center

		local buy = action(card, UDim2.new(1, -24, 0, 56), UDim2.new(0.5, 0, 1, -14), Vector2.new(0.5, 1), function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			if level >= up.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", up.Id)
		end)

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
		scale = nil :: any,
		token = 0,
		refresh = function()
			for _, fn in rows do
				fn()
			end
		end,
	}
end

-- CODES -------------------------------------------------------------------

local function buildCodes(): PanelDef
	local panel, body = Theme.panel(layer, "CODES", Palette.UI.HeaderGreen, UDim2.fromScale(0.46, 0.48))

	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 22)
	pad.PaddingBottom = UDim.new(0, 22)
	pad.PaddingLeft = UDim.new(0, 26)
	pad.PaddingRight = UDim.new(0, 26)
	pad.Parent = body

	local prompt = text(body, "ENTER A CODE", Palette.TextSize.Section, Palette.UI.TextDark)
	prompt.Size = UDim2.new(1, 0, 0, 30)
	prompt.TextXAlignment = Enum.TextXAlignment.Center

	local box = Instance.new("TextBox")
	box.BackgroundColor3 = Palette.UI.Body
	box.BorderSizePixel = 0
	box.Position = UDim2.new(0, 0, 0, 44)
	box.Size = UDim2.new(1, 0, 0, 64)
	box.Font = Palette.Font.Display
	box.TextSize = Palette.TextSize.Section
	box.TextColor3 = Palette.UI.TextDark
	box.PlaceholderText = "CODE"
	box.PlaceholderColor3 = Palette.UI.Locked
	box.Text = ""
	box.ClearTextOnFocus = false
	box.TextStrokeTransparency = 1
	box.TextXAlignment = Enum.TextXAlignment.Center
	box.Parent = body
	corner(box, Palette.Radius.Button)
	Palette.stroke(box, Palette.Outline.Panel)

	local result = text(body, "", Palette.TextSize.Card, Palette.UI.Locked)
	result.Position = UDim2.new(0, 0, 0, 194)
	result.Size = UDim2.new(1, 0, 0, 56)
	result.TextXAlignment = Enum.TextXAlignment.Center
	result.TextWrapped = true

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

	local submit = Theme.button(body, "REDEEM", Palette.UI.Buy, UDim2.new(1, 0, 0, 64), UDim2.new(0, 0, 0, 122))
	submit.Activated:Connect(function()
		local code = normalise()
		if code == "" then
			result.TextColor3 = Palette.UI.Close
			result.Text = "TYPE A CODE FIRST"
			return
		end
		result.TextColor3 = Palette.UI.Locked
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
		scale = nil :: any,
		token = 0,
		refresh = function() end,
		onOpen = function()
			result.Text = ""
			result.TextColor3 = Palette.UI.Locked
		end,
		onClose = function()
			box:ReleaseFocus()
		end,
	}
end

-- ZONES -------------------------------------------------------------------

local function buildZones(): PanelDef
	local panel, body = Theme.panel(layer, "ZONES", Palette.UI.HeaderPurple, UDim2.fromScale(0.58, 0.72))
	local list = scroller(body)

	local header = Theme.sectionLabel(list, "✨ PROGRESSION ✨")
	header.LayoutOrder = 1

	local rows: { () -> () } = {}

	for index, zone in Config.Zones do
		local card = Theme.card(list, UDim2.new(1, 0, 0, 118))
		card.LayoutOrder = index + 1

		local tile = glyph(card, "crystal", zone.CrystalColor)
		tile.AnchorPoint = Vector2.new(0, 0.5)
		tile.Position = UDim2.new(0, 16, 0.5, 0)

		local name = text(card, zone.Name, Palette.TextSize.Section, Palette.UI.TextDark)
		name.Position = UDim2.new(0, 100, 0, 16)
		name.Size = UDim2.new(1, -340, 0, 30)

		local yieldLabel = text(card, "", Palette.TextSize.Small, zone.AccentColor)
		yieldLabel.Position = UDim2.new(0, 100, 0, 50)
		yieldLabel.Size = UDim2.new(1, -340, 0, 24)

		local costLabel = text(card, "", Palette.TextSize.Small, Palette.UI.Locked, Palette.Font.Body)
		costLabel.Position = UDim2.new(0, 100, 0, 76)
		costLabel.Size = UDim2.new(1, -340, 0, 24)

		local unlock = action(
			card,
			UDim2.fromOffset(212, 60),
			UDim2.new(1, -18, 0.5, 0),
			Vector2.new(1, 0.5),
			function()
				local unlocked, _, afford = readZone(latest, zone)
				if unlocked or not afford then
					return
				end
				send("Unlock", zone.Id)
			end
		)

		-- The "already yours" state is a tag, not a control. It is built from
		-- Theme.button so it matches the other two states pixel for pixel, then
		-- deadened so nothing about it invites a click.
		local ownedTag =
			Theme.button(card, "UNLOCKED", Palette.UI.Buy, UDim2.fromOffset(212, 60), UDim2.new(1, -18, 0.5, 0))
		ownedTag.AnchorPoint = Vector2.new(1, 0.5)
		ownedTag.Active = false
		ownedTag.AutoButtonColor = false
		ownedTag.Selectable = false
		ownedTag.Visible = false

		table.insert(rows, function()
			local unlocked, cost, afford = readZone(latest, zone)
			local coins = tonumber(latest.coins) or 0

			yieldLabel.Text = `{Util.comma(zone.ShardValue)} {Config.Currency.Shards.Display} PER CRYSTAL`

			if unlocked then
				costLabel.Text = "OPEN — GO COLLECT"
				ownedTag.Visible = true
				unlock.live.Visible = false
				unlock.dead.Visible = false
				return
			end

			ownedTag.Visible = false
			costLabel.Text = `UNLOCK COST  {Util.comma(cost)} {Config.Currency.Coins.Display}`

			if afford then
				unlock.setLive(`UNLOCK  {Util.comma(cost)}`)
			else
				-- Show the gap rather than the price here: on a progression
				-- screen "how far away am I" is the question being asked.
				unlock.setDead(`{Util.comma(math.max(cost - coins, 0))} MORE`)
			end
		end)
	end

	return {
		id = "zones",
		frame = panel,
		body = body,
		scale = nil :: any,
		token = 0,
		refresh = function()
			for _, fn in rows do
				fn()
			end
		end,
	}
end

-- Open / close ------------------------------------------------------------

local function setBackdrop(shown: boolean)
	local bd = backdrop
	local lay = layer
	if not bd or not lay then
		return
	end
	if shown then
		lay.Visible = true
		TweenService:Create(bd, TweenInfo.new(OPEN_TIME, Enum.EasingStyle.Quad), {
			BackgroundTransparency = BACKDROP_TRANSPARENCY,
		}):Play()
	else
		local tween = TweenService:Create(bd, TweenInfo.new(CLOSE_TIME, Enum.EasingStyle.Quad), {
			BackgroundTransparency = 1,
		})
		tween.Completed:Connect(function()
			-- Only hide the layer if nothing was opened while this tween ran.
			if openId == nil then
				lay.Visible = false
			end
		end)
		tween:Play()
	end
end

local function animateIn(def: PanelDef)
	def.token += 1
	def.frame.Visible = true
	def.scale.Scale = OPEN_FROM_SCALE
	TweenService
		:Create(def.scale, TweenInfo.new(OPEN_TIME, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 })
		:Play()
end

local function animateOut(def: PanelDef)
	def.token += 1
	local token = def.token
	local tween = TweenService:Create(
		def.scale,
		TweenInfo.new(CLOSE_TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{ Scale = CLOSE_TO_SCALE }
	)
	tween.Completed:Connect(function()
		-- Reopened mid-close: the panel the player is now looking at must not be
		-- hidden by the completion of the animation they interrupted.
		if def.token == token then
			def.frame.Visible = false
		end
	end)
	tween:Play()
end

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
		animateOut(def)
	end
	setBackdrop(false)
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
	if openId == key then
		return
	end

	-- One at a time: whatever was open leaves without ceremony so the incoming
	-- panel is the only animation on screen.
	local previous = openId
	if previous and panels[previous] then
		local old = panels[previous]
		if old.onClose then
			old.onClose()
		end
		old.token += 1
		old.frame.Visible = false
	end

	openId = key
	if def.onOpen then
		def.onOpen()
	end
	def.refresh()
	setBackdrop(true)
	animateIn(def)
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

	local parent = deps.gui or deps.screenGui or deps.parent
	assert(typeof(parent) == "Instance", "Panels.init requires deps.gui — the ScreenGui the modals live in")

	if type(deps.send) == "function" then
		sendFn = deps.send
	end

	--[[ One layer holds the dimmer and all four panels. Keeping them siblings in
		 creation order means the panels draw over the dimmer without depending on
		 the host ScreenGui's ZIndexBehavior, and hiding the layer hides the whole
		 modal stack in one property write. ]]
	local lay = Instance.new("Frame")
	lay.Name = "Panels"
	lay.BackgroundTransparency = 1
	lay.Size = UDim2.fromScale(1, 1)
	lay.Visible = false
	lay.ZIndex = 40
	lay.Parent = parent
	layer = lay

	local bd = Instance.new("Frame")
	bd.Name = "Backdrop"
	bd.BackgroundColor3 = Palette.Outline.Color
	bd.BackgroundTransparency = 1
	bd.BorderSizePixel = 0
	bd.Size = UDim2.fromScale(1, 1)
	bd.ZIndex = 1
	-- Active swallows clicks so a modal actually blocks the world beneath it.
	bd.Active = true
	bd.Parent = lay
	backdrop = bd

	local built = { buildShop(), buildUpgrades(), buildCodes(), buildZones() }

	for _, def in built do
		local panel = def.frame

		-- Centred and self-sized regardless of how Theme positioned it: §5.6
		-- wants the modal in the middle of the viewport, and this module is the
		-- one that knows it is a modal.
		panel.AnchorPoint = Vector2.new(0.5, 0.5)
		panel.Position = UDim2.fromScale(0.5, 0.5)
		panel.Visible = false
		panel.ZIndex = 10

		local scale = Instance.new("UIScale")
		scale.Scale = 1
		scale.Parent = panel
		def.scale = scale

		local found = findCloseButton(panel)
		if not found then
			-- Theme's close button could not be identified. Build one rather
			-- than ship a modal with no way out.
			local made = Theme.button(panel, "X", Palette.UI.Close, UDim2.fromOffset(52, 52), UDim2.new(1, -14, 0, 14))
			made.AnchorPoint = Vector2.new(1, 0)
			made.ZIndex = 20
			found = made
		end
		local closeButton: TextButton = found
		closeButton.Activated:Connect(function()
			Panels.close()
		end)

		panels[def.id] = def
	end
end

return Panels
