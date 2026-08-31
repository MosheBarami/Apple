--!strict
--[[
	Crystal Canyon — the four modals: SHOP, UPGRADES, CODES, ZONES.

	Four invariants shape every line below.

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

	3. EVERY SURFACE IS THEME'S. `Theme.panel` makes the shell, `Theme.card` the
	   cards, `Theme.button` the controls, `Theme.counter` the balance readout,
	   `Theme.sectionLabel` the headings, and `Theme.surface` anything this file
	   needs that Theme has no named recipe for — trays, icon tiles, meter tracks,
	   rail nodes. That last one is the important door: it applies the same five
	   moulding layers (shadow, outline, gradient body, hard bottom edge, lit top
	   rim) that a button gets, so a tile built here cannot drift from a button
	   built there.

	   Nothing in this file calls `Instance.new("Frame")` for a surface. Frames
	   are created directly only for things that are NOT surfaces: transparent
	   layout holders, and shading drawn inside a surface that already carries the
	   outline enclosing it (the glyph strokes, the flash wash).

	4. WHAT THIS FILE OWNS IS THE COMPOSITION. Theme knows how to mould one
	   object; it does not know that a locked zone should look locked, that a
	   maxed upgrade desaturates, or that a shop needs a featured tray. That is
	   this file's job, and it is the difference between four panels that are the
	   same list four times and four panels with their own reason to exist:

	     SHOP      a storefront — a gold tray holding one featured offer, then a
	               wrapping grid of the rest
	     UPGRADES  a rig sheet — a whole-rig progress meter, then one row per
	               upgrade showing current → next and a filled pip track
	     CODES     a ticket booth — a punched ticket carrying the field and the
	               verdict, then how-it-works chips
	     ZONES     a route — numbered rail nodes joined by a connector, a bright
	               card for what is open and a slate, padlocked, hazard-striped
	               one for what is not

	LAYOUT. Nothing in a card is positioned from a hardcoded pixel inset. Card
	interiors are measured from the card's own `AbsoluteSize` and reflow between
	a wide layout (icon | text | action on the right) and a stacked one (icon |
	text, action full-width underneath) at `STACK_WIDTH`. The old code sized
	labels with offsets like `UDim2.new(1, -320, 0, 26)`, which is a *negative*
	width — and therefore nothing on screen — for every card narrower than 320px.
	That is every card on a phone, and the widest of them (`-470`) went negative
	on desktop too at around a 976px window.

	MOTION (§11) is deliberate feedback, never ambient animation:
	  · open/close      Theme's, with its overshoot — this file only calls it
	  · button          Theme sinks a held button; `lift` adds the hover RISE,
	                    which is the half Theme cannot do without fighting layout
	  · currency        the balance strip counts from the PREVIOUS snapshot's
	                    value to the new one, via `Effects.countTo`
	  · purchase        the card whose level actually went up flashes, and the
	                    level is read from the server's snapshot, never from the
	                    click that requested it
	  · unlock          Effects owns it; it is louder than a toast by design

	Every one of those is interruptible and none of them allocates: the flash
	overlay, the lift scale and the meter fill are built once and re-tweened, and
	each keeps a handle so a second event cancels the first rather than stacking
	a second writer onto the same property.
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
	refresh: () -> (),
	onOpen: (() -> ())?,
	onClose: (() -> ())?,
}

local ACTION_CLOSE = "CrystalCanyonClosePanel"

-- Card geometry ------------------------------------------------------------
--[[ `Theme.card` pads its children by `Theme.Spacing.Base` horizontally and
	 `Theme.Spacing.Snug` vertically, and Theme's decision 1 names that a contract
	 with this file. These two are seeded with the values that contract currently
	 carries and then RE-READ from Theme in `Panels.init`, so the contract is
	 enforced by the code rather than by two files agreeing to remember the same
	 number. Every interior measurement below is taken inside that padded box. ]]
local CARD_PAD_X = 14
local CARD_PAD_Y = 12
local GAP = 14

--[[ Below this much CARD width a row reflows to the stacked layout. The
	 threshold is measured on the card and not on the viewport on purpose: a
	 1440px window still produces a ~700px card, and a 390px phone produces a
	 ~280px one, but the panel/body/well/scroller paddings in between mean the
	 viewport width alone does not tell you how much room a card actually has. ]]
local STACK_WIDTH = 520

local ROW_ICON = 76
local HERO_ICON = 104
local ACTION_H = 56
-- The action button takes a share of the card and is clamped at both ends, so
-- it can never outgrow the card (the old fixed 196px button spilled past the
-- left edge of a 184px card) nor squeeze the text column to nothing.
local ACTION_SHARE = 0.3
local ACTION_MIN_W = 152
local ACTION_MAX_W = 240

-- §5.5 grid: equal-width cards, generously gapped, WRAPPING. A fixed cell is
-- what makes UIGridLayout wrap; a `1/count` scale cell forces one row forever
-- and shrinks to 58px on a phone.
local GRID_CELL = Vector2.new(224, 286)
local GRID_GAP = 16

-- Panel chrome -------------------------------------------------------------
local FOOTER_H = 62
--[[ Tray geometry. These are computed rather than left to `AutomaticSize`, and
	 that is deliberate: a `Theme.surface` carries an `Edge` and a `Highlight`
	 child sized and positioned in SCALE, and mixing scale-sized children with an
	 auto-sizing parent is the one Roblox layout interaction whose result is not
	 worth betting a panel on. Every tray below is either a fixed stack of known
	 heights or is resized by the row inside it through `onResize`. ]]
local TRAY_PAD_TOP = 14
local TRAY_PAD_BOTTOM = 16
local TRAY_GAP = 12
local TRAY_HEADING_H = 36
local TRAY_CHROME = TRAY_PAD_TOP + TRAY_HEADING_H + TRAY_GAP + TRAY_PAD_BOTTOM
local TRAY_MIN_H = TRAY_CHROME + 140
local TICKET_H = 292
local BOOTH_H = TRAY_CHROME + TICKET_H
local WELL_PAD = 12
local LIST_GAP = 14
local SECTION_H = 42
local PIP_H = 12
local METER_H = 28

-- Motion -------------------------------------------------------------------
--[[ The hover rise, and ONLY the rise. Theme's own feedback already sinks a held
	 button by shrinking its hard edge and dropping its face by the same pixels,
	 which is the press half of §11 done properly; adding a scale change on top of
	 that would read as two different presses at once. So `held` returns to rest
	 here and lets Theme own it. ]]
local LIFT_HOVER = 1.03
local LIFT_TIME = 0.09
local FLASH_TIME = 0.5

--[[ How long the CODES panel waits for the server's verdict before admitting it
	 has not arrived.

	 There are no RemoteFunctions in this game, so a redeem answer comes back as
	 a `Notify` — and every refusal on the server funnels through `Net.reject`,
	 which throttles to one Notify per player per second. A second bad code
	 inside that window therefore produces NO verdict at all, and the result line
	 would sit on "CHECKING..." for the rest of the session.

	 The wait is deliberately longer than that 1s throttle so a verdict that is
	 merely slow still wins the race. What it falls back to claims neither
	 success nor failure, because the client genuinely does not know which
	 happened — inventing either would be worse than the hang it replaces. ]]
local REDEEM_TIMEOUT = 3
local REDEEM_NO_ANSWER = "NO ANSWER YET — TRY AGAIN"

local deps: any = nil
local Theme: any = nil
local Effects: any = nil
local layer: Frame? = nil
local panels: { [string]: PanelDef } = {}
local openId: string? = nil

--[[ The last two snapshots. `latest` is what every surface renders from;
	 `prior` is what it rendered from LAST time, and exists for exactly two
	 jobs — deciding which card just levelled up, and telling the balance strip
	 what number to count away from. Neither is client bookkeeping: both are
	 server payloads, and nothing here ever writes a field into either. ]]
local latest: Snapshot = {}
local prior: Snapshot = {}

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

-- Server verdicts ---------------------------------------------------------

--[[ There is exactly ONE `Notify` subscription on this client and it belongs to
	 `Effects`. This file used to open a second one inside `buildCodes` so the
	 codes panel could show the redeem verdict inline, which meant every verdict
	 rendered twice — once as a toast, once in the panel — and the two
	 classified the kind separately, so the same event could come out green here
	 and cyan there. `Effects.onNotify` is the routed replacement.

	 Effects is taken from `deps` when the host supplies it, and otherwise found
	 as a sibling module. The boot script requires every client module before it
	 inits any of them, so by the time `Panels.init` runs this resolves without
	 yielding, and `require` on an already-required ModuleScript returns the same
	 cached table rather than re-running it.

	 When it cannot be resolved at all, the codes panel simply has no verdict
	 path and the redeem timeout clears the line, and the balance strip snaps
	 instead of counting. Those are the deliberate outcomes: the alternative —
	 falling back to our own `Notify` connection, or a second copy of the
	 counting animation — is the duplication this routing exists to remove. ]]
local function resolveEffects(): any?
	local supplied = if deps then (deps.Effects or deps.effects) else nil
	if type(supplied) == "table" and type(supplied.onNotify) == "function" then
		return supplied
	end

	local parent = script.Parent
	local sibling = if parent then parent:FindFirstChild("Effects") else nil
	if not sibling or not sibling:IsA("ModuleScript") then
		return nil
	end

	local ok, module = pcall(require, sibling)
	if ok and type(module) == "table" and type(module.onNotify) == "function" then
		return module
	end
	return nil
end

local function cue(name: string)
	if Effects and type(Effects.playCue) == "function" then
		Effects.playCue(name)
	end
end

--------------------------------------------------------------------------------
-- construction kit
--------------------------------------------------------------------------------

--[[ Theme's `bodyGradient` multiplies a surface's fill by `lift(fill, 0.22)` at
	 the top, by the fill itself at 0.52 and by `shade(fill, 0.16)` at the bottom.
	 Multiplied — so a saturated tile does not RENDER at its token colour anywhere
	 except where that ramp happens to be white.

	 That matters exactly once, and it matters a lot: the punch-out trick. A gap in
	 the magnet's horseshoe, the padlock's keyhole and the ticket's notches are all
	 shapes painted in the surrounding colour so they read as holes. Painted with
	 the raw token they come out dramatically BRIGHTER than the metal around them —
	 a cyan tile renders near fill² in its middle — and the hole reads as a raised
	 boss instead. This returns the colour the surface actually renders at a given
	 height, which is what a hole has to be painted.

	 It is a copy of Theme's ramp, and it has to be: Theme applies the gradient to
	 the host, and a UIGradient does not reach the host's children, so there is no
	 instance to ask. The two are kept honest by this comment and by the fact that
	 a drift shows up immediately as visibly wrong icons. ]]
local function renderedTint(fill: Color3, y: number): Color3
	local top = Palette.lift(fill, 0.22)
	local bottom = Palette.shade(fill, 0.16)
	local t = math.clamp(y, 0, 1)
	local multiplier = if t <= 0.52 then top:Lerp(fill, t / 0.52) else fill:Lerp(bottom, (t - 0.52) / 0.48)
	return Color3.new(fill.R * multiplier.R, fill.G * multiplier.G, fill.B * multiplier.B)
end

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ Body copy sitting on a light card. Theme's display treatment — white fill,
	 black stroke, dark shade behind — is right on a saturated surface and muddy on
	 a white one, so card text is styled from the same tokens without it.

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
	label.ZIndex = (if parent:IsA("GuiObject") then parent.ZIndex else 0) + 1
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

--[[ §4 display type — white fill, black stroke — for short captions sitting on a
	 saturated surface: tray headings, the ribbon, rail nodes, the balance caption.

	 Deliberately the light form rather than Theme's shaded pair. Theme's version
	 is two nested labels so the type can carry a drop shadow, which earns its cost
	 on a panel title at 34pt and does not on a 16pt word inside a 30px chip, where
	 the second label would only blur the glyphs. Headings that DO want the full
	 treatment call `Theme.sectionLabel`. ]]
local function displayText(parent: Instance, body: string, size: number, color: Color3?): TextLabel
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Text = string.upper(body)
	label.TextXAlignment = Enum.TextXAlignment.Center
	label.Size = UDim2.fromScale(1, 1)
	label.ZIndex = (if parent:IsA("GuiObject") then parent.ZIndex else 0) + 1
	Palette.styleText(label, size, color)
	label.TextScaled = true
	label.TextWrapped = false
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = size
	limit.MinTextSize = 10
	limit.Parent = label
	label.Parent = parent
	return label
end

-- Icons -------------------------------------------------------------------

--[[ The box every glyph below is drawn in. It is a DESIGN size, not the size
	 the tile ends up: a tile is drawn at 76 in a row, 84 in the shop grid and
	 104 as the featured medallion.

	 So interiors are authored in these design pixels and converted to SCALE, so
	 a resized tile carries its drawing with it. They used to be sized in flat
	 offsets while being positioned in scale, which meant a 104px tile showed
	 76px of art whose parts had drifted apart from each other — the two speed
	 chevrons, positioned at 0.36/0.64 of a wider tile but still 8px wide,
	 separate visibly. Undersized art floating in an oversized tile. ]]
local GLYPH_DESIGN = 72

--[[ Functional icons drawn from primitives. The style spec allows emoji only as
	 ornamental section decoration, never as a working icon, so every tile in
	 this file is built out of frames. The tile carries the mandatory outline;
	 the shapes inside it read against the tile fill and would only turn to mud
	 if each got its own 3px stroke at this size. ]]
local function glyph(tile: Frame, kind: string, tint: Color3, ink: Color3)
	--[[ The colour a "punch" is filled with — the trick that gives the magnet its
		 gap, the padlock its keyhole and the ticket its notches without a second
		 stroke on each.

		 It is NOT the tile's own `tint`. A UIGradient shades the object it is
		 parented to and NOT that object's children, so a punch filled with the raw
		 token renders at full brightness against a tile that the gradient has
		 already darkened by roughly 6% wherever the art sits. The result is a
		 visibly lighter patch in the shape of the hole — the exact opposite of a
		 hole. Every punch below is drawn a matching step down, and every punch is
		 positioned above the gradient's hard band (0.78) so one constant is
		 enough. ]]
	local function punchAt(y: number): Color3
		return renderedTint(tint, y)
	end

	--[[ Design pixels in, tile-relative scale out. `radius` stays an offset:
		 UICorner's scale form is a percentage of the shape's SMALLER dimension,
		 which for a 44x10 bar is a different curve than for a 34x34 square, so
		 scaling it would distort the drawing rather than preserve it. A corner
		 that stays 3px while the shape grows is the cheap, correct trade. ]]
	local function part(w: number, h: number, pos: UDim2, rot: number?, radius: UDim?, fill: Color3?): Frame
		local f = Instance.new("Frame")
		f.BackgroundColor3 = fill or ink
		f.BorderSizePixel = 0
		f.AnchorPoint = Vector2.new(0.5, 0.5)
		f.Size = UDim2.fromScale(w / GLYPH_DESIGN, h / GLYPH_DESIGN)
		f.Position = pos
		f.Rotation = rot or 0
		f.ZIndex = tile.ZIndex + 2
		f.Parent = tile
		corner(f, radius or UDim.new(0, 3))
		return f
	end

	--[[ A ring drawn as a stroke, with its line weight tracked against the tile's
		 measured size. UIStroke.Thickness has no scale form, so it is the one
		 measurement in these drawings that cannot be expressed relative to the
		 tile — without the tracking, a 104px hero magnet is an oversized ring
		 drawn in a 72px-tile line weight. AbsoluteSize is 0 until the first
		 layout pass, hence the guard and the signal. ]]
	local function ring(d: number, pos: UDim2, weight: number, z: number): Frame
		local r = Instance.new("Frame")
		r.BackgroundTransparency = 1
		r.AnchorPoint = Vector2.new(0.5, 0.5)
		r.Size = UDim2.fromScale(d / GLYPH_DESIGN, d / GLYPH_DESIGN)
		r.Position = pos
		r.ZIndex = z
		r.Parent = tile
		corner(r, Theme.Radius.Pill)

		local line = Instance.new("UIStroke")
		line.Color = ink
		line.Thickness = weight
		line.Parent = r

		local function sync()
			local measured = tile.AbsoluteSize.X
			if measured < 1 then
				return
			end
			line.Thickness = weight * (measured / GLYPH_DESIGN)
		end
		sync()
		tile:GetPropertyChangedSignal("AbsoluteSize"):Connect(sync)
		return r
	end

	if kind == "pack" then
		-- A satchel: body, flap, strap.
		part(40, 30, UDim2.fromScale(0.5, 0.62), 0, UDim.new(0, 6))
		part(44, 10, UDim2.fromScale(0.5, 0.4), 0, UDim.new(0, 4))
		part(8, 18, UDim2.fromScale(0.5, 0.3), 0, UDim.new(0, 4))
	elseif kind == "speed" then
		-- Two chevrons, each a pair of bars meeting at a point.
		for i = 0, 1 do
			local x = 0.36 + i * 0.28
			part(8, 22, UDim2.fromScale(x, 0.38), 32)
			part(8, 22, UDim2.fromScale(x, 0.62), -32)
		end
	elseif kind == "magnet" then
		--[[ A horseshoe: a ring, its lower third masked back to the tile colour,
			 and two poles hanging off the cut ends.

			 ZIndex is explicit on all three because the ScreenGui runs
			 `ZIndexBehavior.Sibling`, under which these siblings are ordered by
			 their own ZIndex and ties fall back to child order. The mask used to
			 be the only one that set it while the poles took the default, so the
			 mask — 30 design-px wide against poles centred 0.15 of the tile from
			 the middle — painted over ~97% of both of them, and the icon rendered
			 as a gapped ring with no poles at all. The order that works is: the
			 shape, the punch above it, then anything that must survive the punch
			 above that. ]]
		ring(44, UDim2.fromScale(0.5, 0.38), 9, tile.ZIndex + 1)
		local mask = part(30, 22, UDim2.fromScale(0.5, 0.6), 0, UDim.new(0, 0), punchAt(0.6))
		mask.ZIndex = tile.ZIndex + 2
		local leftPole = part(9, 20, UDim2.fromScale(0.35, 0.66))
		leftPole.ZIndex = tile.ZIndex + 3
		local rightPole = part(9, 20, UDim2.fromScale(0.65, 0.66))
		rightPole.ZIndex = tile.ZIndex + 3
	elseif kind == "crystal" then
		-- A shard: a rotated square with a lighter facet down one side.
		part(34, 34, UDim2.fromScale(0.5, 0.5), 45, UDim.new(0, 5))
		part(12, 34, UDim2.fromScale(0.58, 0.5), 45, UDim.new(0, 5), Palette.shade(ink, 0.22))
	elseif kind == "lock" then
		-- A padlock: shackle above, body below, keyhole punched out of the body.
		ring(30, UDim2.fromScale(0.5, 0.36), 8, tile.ZIndex + 1)
		local cut = part(34, 18, UDim2.fromScale(0.5, 0.56), 0, UDim.new(0, 0), punchAt(0.56))
		cut.ZIndex = tile.ZIndex + 2
		local bodyPart = part(44, 32, UDim2.fromScale(0.5, 0.64), 0, UDim.new(0, 6))
		bodyPart.ZIndex = tile.ZIndex + 3
		local hole = part(8, 12, UDim2.fromScale(0.5, 0.64), 0, UDim.new(0, 4), punchAt(0.64))
		hole.ZIndex = tile.ZIndex + 4
	elseif kind == "coin" then
		-- A coin seen face on: disc, rim, and a struck mark.
		part(46, 46, UDim2.fromScale(0.5, 0.5), 0, Theme.Radius.Pill)
		local rim = part(34, 34, UDim2.fromScale(0.5, 0.5), 0, Theme.Radius.Pill, punchAt(0.5))
		rim.ZIndex = tile.ZIndex + 3
		local mark = part(10, 22, UDim2.fromScale(0.5, 0.5), 0, UDim.new(0, 3))
		mark.ZIndex = tile.ZIndex + 4
	elseif kind == "ticket" then
		-- A stub: body, two punched notches, a perforation.
		part(50, 34, UDim2.fromScale(0.5, 0.5), 0, UDim.new(0, 6))
		local left = part(12, 12, UDim2.fromScale(0.15, 0.5), 0, Theme.Radius.Pill, punchAt(0.5))
		left.ZIndex = tile.ZIndex + 3
		local right = part(12, 12, UDim2.fromScale(0.85, 0.5), 0, Theme.Radius.Pill, punchAt(0.5))
		right.ZIndex = tile.ZIndex + 3
		for i = 0, 2 do
			local dash = part(4, 6, UDim2.fromScale(0.62, 0.36 + i * 0.14), 0, UDim.new(0, 2), punchAt(0.36 + i * 0.14))
			dash.ZIndex = tile.ZIndex + 3
		end
	else
		-- "spark": an eight-point burst, the generic ornament.
		part(34, 34, UDim2.fromScale(0.5, 0.5), 45, UDim.new(0, 5))
		part(10, 46, UDim2.fromScale(0.5, 0.5), 0, UDim.new(0, 4))
		part(46, 10, UDim2.fromScale(0.5, 0.5), 0, UDim.new(0, 4))
	end
end

--[[ An icon tile: a moulded saturated square with vector art in it.

	 The tile itself is `Theme.surface`, which is the whole point — it gets the
	 same five layers a button gets (outline, gradient body, hard bottom edge, lit
	 top rim, offset shadow), so the icon reads as a physical object of the same
	 material as everything around it. The review called the previous icons "basic
	 icon treatment": a flat swatch with a white shape painted on. The difference
	 is that the art now sits ON something.

	 The shadow is skipped for tiles inside a layout, which Theme decides for
	 itself and this file does not have to care about. ]]
local function iconTile(parent: Instance, kind: string, tint: Color3, size: number): Frame
	local tile = Theme.surface(parent, {
		Fill = tint,
		Radius = Theme.Radius.Card,
		Stroke = Palette.Outline.Icon,
		Edge = Theme.Edge.Card,
		HighlightInset = math.max(6, math.floor(size * 0.16)),
		HighlightThickness = 4,
		HighlightTransparency = 0.6,
		Shadow = Theme.Shadow.Offset,
		ShadowTransparency = 0.76,
	}, UDim2.fromOffset(size, size)) :: Frame
	tile.Name = "Icon"

	--[[ The desaturating veil for a maxed upgrade, built hidden and toggled by
		 `setMuted`. It exists because recolouring the tile would NOT work: Theme
		 builds a surface's gradient out of the fill it was given, and a UIGradient
		 multiplies, so repainting a cyan tile grey renders it as dark teal rather
		 than grey. The HUD solves the disabled SELL button the same way and for
		 the same reason. Shading inside an outlined surface, so no stroke. ]]
	local veil = Instance.new("Frame")
	veil.Name = "Veil"
	veil.Size = UDim2.fromScale(1, 1)
	veil.BackgroundColor3 = Palette.UI.Locked
	veil.BackgroundTransparency = 1
	veil.BorderSizePixel = 0
	veil.ZIndex = tile.ZIndex + 20
	veil.Active = false
	veil.Parent = tile

	glyph(tile, kind, tint, Palette.UI.TextLight)
	return tile
end

--[[ Grey a tile out — the visible half of "a maxed upgrade reads MAX in a
	 desaturated state". Tolerates a tile that has no veil so a caller cannot be
	 broken by handing it some other frame. ]]
local function setMuted(tile: Frame, muted: boolean)
	local veil = tile:FindFirstChild("Veil")
	if veil and veil:IsA("Frame") then
		veil.BackgroundTransparency = if muted then 0.38 else 1
	end
end

-- Cards -------------------------------------------------------------------

type Card = {
	root: Frame,
	flash: () -> (),
	recolour: (fill: Color3) -> (),
}

local flashTweens: { [Frame]: Tween } = setmetatable({}, { __mode = "k" }) :: any

--[[ `Theme.card` with the two things a panel needs on top of it: a success
	 flash, and the ability to change what the card is made of.

	 THE FLASH IS FULL-BLEED THROUGH THE PADDING. `Theme.card` carries a UIPadding,
	 and a UIPadding insets every child — including a wash that is supposed to
	 cover the card. So the overlay is deliberately sized larger than its parent by
	 exactly the padding it is about to be inset by, and offset back by the same.
	 The card clips, so the result is a wash that reaches the rounded silhouette
	 and stops there.

	 RECOLOURING IS SAFE because Theme builds a white card's gradient from white,
	 and a ramp of lift(white)/white/shade(white) is a neutral grey multiplier. The
	 hard bottom edge is not — it is a baked light grey — so it is recoloured with
	 the face, or a slate locked-zone card would keep a pale strip along its
	 bottom that reads as a crack rather than as thickness. ]]
local function card(parent: Instance, height: number): Card
	local root = Theme.card(parent, UDim2.new(1, 0, 0, height)) :: Frame

	local flashOverlay = Instance.new("Frame")
	flashOverlay.Name = "Flash"
	flashOverlay.Size = UDim2.new(1, CARD_PAD_X * 2, 1, CARD_PAD_Y * 2)
	flashOverlay.Position = UDim2.fromOffset(-CARD_PAD_X, -CARD_PAD_Y)
	flashOverlay.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	flashOverlay.BackgroundTransparency = 1
	flashOverlay.BorderSizePixel = 0
	-- A momentary wash inside a surface that is already outlined, not a surface of
	-- its own — so no stroke, and above everything the card holds.
	flashOverlay.ZIndex = root.ZIndex + 30
	flashOverlay.Active = false
	flashOverlay.Parent = root
	corner(flashOverlay, Theme.Radius.Card)

	return {
		root = root,
		--[[ §11 PURCHASE: a success flash on the card. One tween at a time — the
			 previous is cancelled — so mashing BUY on a cheap upgrade cannot stack a
			 dozen writes onto the same transparency. The overlay is built once,
			 above, and reused forever; a flash never creates an instance. ]]
		flash = function()
			local running = flashTweens[flashOverlay]
			if running then
				running:Cancel()
			end
			flashOverlay.BackgroundTransparency = 0.45
			local tween = TweenService:Create(
				flashOverlay,
				TweenInfo.new(FLASH_TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ BackgroundTransparency = 1 }
			)
			flashTweens[flashOverlay] = tween
			tween:Play()
			if Effects and type(Effects.pulse) == "function" then
				Effects.pulse(root, 0.05)
			end
		end,
		recolour = function(fill: Color3)
			root.BackgroundColor3 = fill
			local edge = root:FindFirstChild("Edge")
			if edge and edge:IsA("Frame") then
				edge.BackgroundColor3 = Palette.shade(fill, 0.16)
			end
		end,
	}
end

-- Controls ----------------------------------------------------------------

--[[ §11 BUTTON, the hover half: the control rises to meet the pointer.

	 Driven through a UIScale, which is a channel nothing else in the stack writes
	 to. Theme's feedback owns the button's BackgroundColor3, the height of its
	 hard edge and the position of its face children, and it documents that it
	 never touches Size — so a lift written to Size or Position would either fight
	 Theme's sink or be stomped by the next reflow, which moves the action button
	 between a right-hand column and a full-width bar.

	 The scale is small for a reason beyond taste: `Theme.card` clips, so a lift
	 has to stay inside the card's padding. At the widest card a stacked action
	 button is ~490px, and 3% of that is 7.4px per side against 14px of padding. ]]
local function lift(btn: TextButton)
	local scale = Instance.new("UIScale")
	scale.Parent = btn

	local info = TweenInfo.new(LIFT_TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local hovering = false
	local held = false

	local function refresh()
		-- Held returns to rest: Theme sinks the face, and that IS the press.
		local target = if not held and hovering then LIFT_HOVER else 1
		TweenService:Create(scale, info, { Scale = target }):Play()
	end

	btn.MouseEnter:Connect(function()
		hovering = true
		refresh()
	end)
	btn.MouseLeave:Connect(function()
		-- A touch drag that leaves the button must also release it, or the button
		-- stays visually stuck after the finger lifts elsewhere.
		hovering = false
		held = false
		refresh()
	end)
	btn.InputBegan:Connect(function(input: InputObject)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			held = true
			refresh()
		end
	end)
	btn.InputEnded:Connect(function(input: InputObject)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			held = false
			refresh()
		end
	end)
end

--[[ The leading coin on a price button, so a price reads as money rather than as
	 a number. Theme centres its caption in the whole button, so the caption is
	 narrowed and nudged to make room — the same technique the HUD uses for the
	 shard on SELL SHARDS, and for the same reason: a UIPadding on the button would
	 inset Theme's hard bottom edge too and flatten the bottom-left corner.

	 The coin is named neither `Edge`, `Highlight`, `Veil` nor `Badge`, so Theme's
	 press sink moves it down with the caption — which is what it should do: it is
	 part of the button's face, not part of its moulding.

	 If the caption cannot be found — a future Theme that names it differently —
	 the coin is skipped entirely rather than dropped on top of the price. A
	 missing ornament is a small loss; an unreadable price is not. ]]
local COIN_INSET = 34

local function addCoin(btn: TextButton, tint: Color3)
	local caption = btn:FindFirstChild("Caption")
	if not (caption and caption:IsA("TextLabel")) then
		return
	end

	local size = caption.Size
	caption.Position = UDim2.new(0.5, COIN_INSET / 2, caption.Position.Y.Scale, caption.Position.Y.Offset)
	caption.Size = UDim2.new(size.X.Scale, size.X.Offset - COIN_INSET, size.Y.Scale, size.Y.Offset)

	local coin = Theme.surface(btn, {
		Fill = tint,
		Radius = Theme.Radius.Icon,
		Stroke = Palette.Outline.Icon,
		Edge = 0,
		HighlightInset = 4,
		HighlightThickness = 3,
	}, UDim2.fromOffset(22, 22), UDim2.new(0, 14, 0.5, -3)) :: Frame
	coin.Name = "Coin"
	coin.AnchorPoint = Vector2.new(0, 0.5)
	coin.ZIndex = btn.ZIndex + 2
end

--[[ A purchase control is really several buttons stacked in the same spot: the
	 live green one, a dead grey one, and (zones only) a green "already yours"
	 tag. Toggling visibility avoids recolouring a button after `Theme.button`
	 has already baked its gradient, its hard bottom edge and its shadow from the
	 fill colour — repainting only the background would leave a green edge under a
	 grey face. Rebuilding on every Sync would be worse still, since Sync lands as
	 fast as the collect sweep.

	 Only the live button lifts. A control the player cannot use must not answer
	 the pointer; that silence is half of what makes the dead state read as
	 genuinely unavailable rather than merely grey.

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

local function action(parent: Instance, onClick: () -> (), coin: boolean?): Action
	local live: TextButton = Theme.button(parent, "BUY", Palette.UI.Buy)
	live.Activated:Connect(onClick)
	lift(live)

	-- `Locked` is the right token here and only here: this is a control that is
	-- genuinely unavailable, not body copy.
	local dead: TextButton = Theme.button(parent, "MAX", Palette.UI.Locked)
	dead.Active = false
	dead.AutoButtonColor = false
	dead.Selectable = false
	dead.Visible = false

	if coin then
		addCoin(live, Palette.UI.HardCurrency)
		addCoin(dead, Palette.shade(Palette.UI.HardCurrency, 0.35))
	end

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

-- Indicators ---------------------------------------------------------------

--[[ The level track: one pip per level, filled up to the current one. This is
	 the UPGRADES panel's whole personality in one widget — a number that says
	 "LEVEL 4 / 12" tells you where you are, a row of pips shows you, and the
	 difference is the difference between a spreadsheet and a progression screen.

	 Pips are positioned in SCALE so the track fits whatever width the card
	 reflowed to. The only offset is the gap, and it can never make a pip
	 negative-width at any width this panel can produce: the narrowest card is
	 ~184px of content, which is 15px per pip at the longest track (12).

	 A pip is a real surface rather than a plain frame — §2 does not thin the
	 outline down on small elements — but with `Edge = 0`, because a hard bottom
	 band inside a 12px-tall cell is most of the cell. ]]
local PIP_GAP = 4

local function pipTrack(parent: Instance, count: number): (Frame, (level: number, tint: Color3) -> ())
	local track = Instance.new("Frame")
	track.Name = "Pips"
	track.BackgroundTransparency = 1
	track.BorderSizePixel = 0
	track.Size = UDim2.new(1, 0, 0, PIP_H)
	track.ZIndex = (if parent:IsA("GuiObject") then parent.ZIndex else 0) + 1
	track.Parent = parent

	local total = math.max(1, math.floor(count))
	local pips: { Frame } = {}
	for i = 1, total do
		local pip = Theme.surface(track, {
			Fill = Palette.UI.BodyTint,
			Radius = Theme.Radius.Pill,
			Stroke = Palette.Outline.Icon,
			Edge = 0,
			Highlight = false,
		}, UDim2.new(1 / total, -PIP_GAP, 1, 0), UDim2.new((i - 1) / total, PIP_GAP / 2, 0, 0)) :: Frame
		pip.Name = `Pip{i}`
		table.insert(pips, pip)
	end

	return track,
		function(level: number, tint: Color3)
			local filled = math.clamp(math.floor(level), 0, total)
			for i, pip in pips do
				pip.BackgroundColor3 = if i <= filled then tint else Palette.UI.BodyTint
			end
		end
end

--[[ A thick rounded progress bar with its label inside it (§6). Used for the
	 unlock progress on a locked zone and for the rig summary in UPGRADES. ]]
local function meter(parent: Instance, height: number?): (Frame, (ratio: number, tint: Color3, label: string) -> ())
	local h = height or METER_H
	local track = Theme.surface(parent, {
		Fill = Palette.shade(Palette.UI.CounterFill, 0.3),
		Radius = Theme.Radius.Pill,
		Stroke = Palette.Outline.Card,
		Edge = 0,
		HighlightInset = 12,
		HighlightThickness = 3,
		HighlightTransparency = 0.82,
	}, UDim2.new(1, 0, 0, h)) :: Frame
	track.Name = "Meter"

	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.Size = UDim2.new(0, 0, 1, 0)
	fill.BackgroundColor3 = Palette.UI.Premium
	fill.BorderSizePixel = 0
	-- Shading inside the already-outlined track, so no stroke of its own: a
	-- border on a zero-width fill renders as a black lozenge in an empty bar.
	fill.ZIndex = track.ZIndex + 1
	fill.Parent = track
	corner(fill, Theme.Radius.Pill)

	local label = displayText(track, "", Palette.TextSize.Small)
	label.Size = UDim2.fromScale(1, 1)
	label.ZIndex = track.ZIndex + 2

	local running: Tween? = nil

	return track,
		function(ratio: number, tint: Color3, caption: string)
			label.Text = caption
			fill.BackgroundColor3 = tint
			local target = UDim2.new(math.clamp(ratio, 0, 1), 0, 1, 0)
			if running then
				running:Cancel()
			end
			-- Tweened, not snapped: this bar moves on every Sync while the player
			-- banks coins, and a bar that jumps reads as a glitch.
			local tween = TweenService:Create(
				fill,
				TweenInfo.new(0.24, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ Size = target }
			)
			running = tween
			tween:Play()
		end
end

-- Panel chrome -------------------------------------------------------------

--[[ The inset well the scrolling content sits in. A modal whose whole body is
	 one flat sheet is what "weak panel personality" looks like; an outlined,
	 tinted well gives the content a floor to sit on and separates it from the
	 header above and the balance strip below.

	 No hard edge and no highlight: this is a recess, and both of those cues would
	 make it read as a raised slab instead. ]]
local function well(body: Frame, footer: number): Frame
	local frame = Theme.surface(body, {
		Fill = Palette.UI.BodyTint,
		Radius = Theme.Radius.Card,
		Stroke = Palette.Outline.Card,
		Edge = 0,
		Highlight = false,
	}, UDim2.new(1, 0, 1, -(footer + WELL_PAD))) :: Frame
	frame.Name = "Well"
	return frame
end

local function scroller(host: Frame): ScrollingFrame
	local list = Instance.new("ScrollingFrame")
	list.BackgroundTransparency = 1
	list.BorderSizePixel = 0
	list.Size = UDim2.fromScale(1, 1)
	list.CanvasSize = UDim2.new()
	list.AutomaticCanvasSize = Enum.AutomaticSize.Y
	list.ScrollBarThickness = 8
	list.ScrollBarImageColor3 = Palette.Outline.Color
	list.ScrollingDirection = Enum.ScrollingDirection.Y
	list.ZIndex = host.ZIndex + 1
	list.Parent = host

	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, WELL_PAD)
	pad.PaddingBottom = UDim.new(0, WELL_PAD)
	pad.PaddingLeft = UDim.new(0, WELL_PAD)
	pad.PaddingRight = UDim.new(0, WELL_PAD)
	pad.Parent = list

	--[[ The layout is created BEFORE any child, deliberately. Theme's drop shadow
		 is a sibling plate and it refuses to attach when the parent runs a
		 UILayout, because the plate would be laid out as a cell of its own — a
		 phantom gap between two cards. That check reads the parent at the moment
		 the child is built, so the layout has to already be there. ]]
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, LIST_GAP)
	layout.Parent = list

	return list
end

--[[ The balance strip along the foot of every panel: the panel's own accent
	 colour carrying a Theme currency counter.

	 §11 CURRENCY CHANGE lives here. `set` is given the value to show AND the
	 value to count away from, because only the caller knows which snapshot was
	 last drawn — reading the number currently in the label would count from
	 whatever a half-finished previous animation happened to have written. When
	 `from` is nil the number is written straight in, which is what an opening
	 panel wants: nothing changed, so there is nothing to animate. ]]
type Strip = { root: Frame, set: (value: number, from: number?) -> () }

local function balanceStrip(body: Frame, tint: Color3): Strip
	local bar = Theme.surface(body, {
		Fill = tint,
		Radius = Theme.Radius.Card,
		Stroke = Palette.Outline.Button,
		Edge = Theme.Edge.Card,
		HighlightInset = 20,
		HighlightThickness = 4,
		Sheen = 16,
	}, UDim2.new(1, 0, 0, FOOTER_H), UDim2.new(0, 0, 1, 0)) :: Frame
	bar.Name = "Balance"
	bar.AnchorPoint = Vector2.new(0, 1)

	local caption = displayText(bar, `YOUR {Config.Currency.Coins.Display}`, Palette.TextSize.Card)
	caption.AnchorPoint = Vector2.new(0, 0.5)
	caption.Position = UDim2.new(0, 18, 0.5, -3)
	--[[ 0.34 + 0.5 of the strip plus the two margins still fits the narrowest
		 panel this game can produce (a 280px modal leaves a 244px strip: 83 + 122
		 + 32 = 237). Any wider a split and the caption would sit under the pill. ]]
	caption.Size = UDim2.new(0.34, 0, 0, 26)
	caption.TextXAlignment = Enum.TextXAlignment.Left

	-- §6 currency is a dark rounded pill with a minted coin at its left end and a
	-- big comma-separated number. That is `Theme.counter`, exactly as the HUD
	-- draws it, so the balance a player reads in a shop is the same object they
	-- read in the corner of the screen.
	local pill, amount = Theme.counter(bar, Palette.UI.HardCurrency, UDim2.new(1, -14, 0.5, -3))
	pill.AnchorPoint = Vector2.new(1, 0.5)
	pill.Size = UDim2.new(0.5, 0, 0, 42)

	local widthCap = Instance.new("UISizeConstraint")
	widthCap.MaxSize = Vector2.new(268, 42)
	widthCap.MinSize = Vector2.new(122, 42)
	widthCap.Parent = pill

	return {
		root = bar,
		set = function(value: number, from: number?)
			if from ~= nil and Effects and type(Effects.countTo) == "function" then
				Effects.countTo(amount, from, value, { pulse = pill })
				return
			end
			amount.Text = Util.comma(value)
		end,
	}
end

-- Purchase flashes ----------------------------------------------------------

--[[ Cards that should flash when the server says a particular thing changed,
	 keyed "up:<id>" / "zone:<id>". One key can own several cards: PACK SIZE
	 appears twice in the shop (featured and in the grid) and again in UPGRADES,
	 and all three are showing the same fact, so all three flash. ]]
local flashers: { [string]: { () -> () } } = {}

local function registerFlash(key: string, fn: () -> ())
	local bucket = flashers[key]
	if not bucket then
		bucket = {}
		flashers[key] = bucket
	end
	table.insert(bucket, fn)
end

local function fireFlash(key: string)
	local bucket = flashers[key]
	if not bucket then
		return
	end
	for _, fn in bucket do
		-- A card that has been destroyed (it cannot be, today, but panels are
		-- rebuilt on a re-init) must not stop the others from flashing.
		pcall(fn)
	end
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

-- Row card ------------------------------------------------------------------

--[[ The one row-card shape in this file: an icon slot, a text column that
	 stacks its own lines with a UIListLayout, and one action control.

	 `apply` is the whole responsive story. It runs off the card's measured width
	 and off the column's measured height, so:
	   • no offset it computes can go negative — the action width is clamped and
	     then subtracted, and the subtraction is always smaller than the width it
	     is taken from (worst case at STACK_WIDTH: 520 - 32 padding - 76 icon -
	     28 gaps - 152 button = 232px of text column left);
	   • the card grows to fit however many lines the blurb wrapped to, rather
	     than clipping them against a hardcoded height.

	 `options.wash`, when given, paints a full-bleed outlined medallion behind the
	 icon — the shop's featured badge. It lives inside the slot so it tracks the
	 icon through both layouts instead of floating at a fixed inset.

	 `onResize` is how a caller that owns the row's surroundings (the ZONES rail)
	 keeps in step with a height this function alone can compute. ]]
type Row = {
	card: Card,
	column: Frame,
	act: Action,
	icon: Frame,
}

local function rowCard(
	parent: Instance,
	iconKind: string,
	tint: Color3,
	iconSize: number,
	onAction: () -> (),
	options: {
		wash: Color3?,
		coin: boolean?,
		onResize: ((height: number) -> ())?,
	}?
): Row
	local opts = options or {}
	local handle = card(parent, iconSize + CARD_PAD_Y * 2)
	-- `Theme.card` carries its own padding, so the card IS the content box.
	local content = handle.root

	-- The medallion's ring of colour around the icon, 0 when there is no wash.
	local washPad = if opts.wash then 20 else 0
	-- An oversized hero icon is right on a wide card and is most of a phone's
	-- card, so it falls back to the standard row icon in the stacked layout.
	local narrowIcon = math.min(iconSize, ROW_ICON)

	local slot = Instance.new("Frame")
	slot.Name = "IconSlot"
	slot.BackgroundTransparency = 1
	slot.BorderSizePixel = 0
	slot.Size = UDim2.fromOffset(iconSize + washPad, iconSize + washPad)
	slot.ZIndex = content.ZIndex + 1
	slot.Parent = content

	if opts.wash then
		local wash = Theme.surface(slot, {
			Fill = opts.wash,
			Radius = Theme.Radius.Card,
			Stroke = Palette.Outline.Card,
			Edge = Theme.Edge.Card,
			HighlightInset = 14,
			HighlightThickness = 4,
		}, UDim2.fromScale(1, 1)) :: Frame
		wash.Name = "Wash"
		wash.ZIndex = slot.ZIndex
	end

	local tile = iconTile(slot, iconKind, tint, iconSize)
	tile.AnchorPoint = Vector2.new(0.5, 0.5)
	tile.Position = UDim2.fromScale(0.5, 0.5)
	tile.ZIndex = slot.ZIndex + 2

	local column = Instance.new("Frame")
	column.Name = "Column"
	column.BackgroundTransparency = 1
	column.BorderSizePixel = 0
	column.AutomaticSize = Enum.AutomaticSize.Y
	column.Size = UDim2.new(1, -(iconSize + washPad + GAP), 0, 0)
	column.ZIndex = content.ZIndex + 1
	column.Parent = content

	local lines = Instance.new("UIListLayout")
	lines.FillDirection = Enum.FillDirection.Vertical
	lines.SortOrder = Enum.SortOrder.LayoutOrder
	lines.Padding = UDim.new(0, 6)
	lines.Parent = column

	local act = action(content, onAction, opts.coin)

	local function apply()
		local width = handle.root.AbsoluteSize.X
		if width < 1 then
			return -- not laid out yet; the AbsoluteSize signal brings us back
		end
		local inner = width - CARD_PAD_X * 2
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
		local height: number

		if stacked then
			-- Stacked: icon + text on one row, action as a full-width bar below.
			slot.AnchorPoint = Vector2.new(0, 0)
			slot.Position = UDim2.fromOffset(0, 0)
			column.AnchorPoint = Vector2.new(0, 0)
			column.Position = UDim2.fromOffset(slotSize + GAP, 0)
			column.Size = UDim2.new(1, -(slotSize + GAP), 0, 0)
			act.place(UDim2.new(1, 0, 0, ACTION_H), UDim2.new(0.5, 0, 1, 0), Vector2.new(0.5, 1))
			local top = math.max(slotSize, column.AbsoluteSize.Y)
			height = top + GAP + ACTION_H + CARD_PAD_Y * 2
		else
			local actionW = math.clamp(math.floor(inner * ACTION_SHARE), ACTION_MIN_W, ACTION_MAX_W)
			slot.AnchorPoint = Vector2.new(0, 0.5)
			slot.Position = UDim2.new(0, 0, 0.5, 0)
			column.AnchorPoint = Vector2.new(0, 0.5)
			column.Position = UDim2.new(0, slotSize + GAP, 0.5, 0)
			column.Size = UDim2.new(1, -(slotSize + GAP * 2 + actionW), 0, 0)
			act.place(UDim2.fromOffset(actionW, ACTION_H), UDim2.new(1, 0, 0.5, 0), Vector2.new(1, 0.5))
			local top = math.max(slotSize, column.AbsoluteSize.Y)
			height = top + CARD_PAD_Y * 2
		end

		local size = UDim2.new(1, 0, 0, height)
		if handle.root.Size ~= size then
			handle.root.Size = size
		end
		if opts.onResize then
			opts.onResize(height)
		end
	end

	apply()
	-- Width changes come from the card; height changes come from the text
	-- wrapping to a different number of lines. Both must re-run the layout, and
	-- neither can drive the other into a loop: `apply` only ever writes a height
	-- that is a pure function of the measured width.
	handle.root:GetPropertyChangedSignal("AbsoluteSize"):Connect(apply)
	column:GetPropertyChangedSignal("AbsoluteSize"):Connect(apply)

	return { card = handle, column = column, act = act, icon = tile }
end

--------------------------------------------------------------------------------
-- UPGRADES — the rig sheet
--------------------------------------------------------------------------------

local function buildUpgrades(): PanelDef
	-- No fixed size: `Theme.panel` only takes its responsive branch (and its
	-- narrow-viewport scale) when the caller does not pin one.
	local panel, body = Theme.panel(layer, "UPGRADES", Palette.UI.HeaderCyan)
	local list = scroller(well(body, FOOTER_H))
	local strip = balanceStrip(body, Palette.shade(Palette.UI.HeaderCyan, 0.18))

	local rows: { () -> () } = {}

	-- A summary of the whole rig, so the panel opens on an answer to "how far
	-- along am I" before the player reads a single row.
	local summary = card(list, 100)
	summary.root.LayoutOrder = 1
	local summaryTitle = text(summary.root, "CANYON RIG", Palette.TextSize.Section, Palette.UI.TextDark)
	summaryTitle.Size = UDim2.new(1, 0, 0, 26)
	local rigMeter, setRig = meter(summary.root)
	rigMeter.Position = UDim2.fromOffset(0, 34)

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
		end, { coin = true })
		row.card.root.LayoutOrder = index + 1
		registerFlash(`up:{up.Id}`, row.card.flash)

		-- Names wrap rather than truncate: a truncated card title on a phone reads
		-- as a bug, and the column auto-sizes to whatever it wraps to.
		local name = text(row.column, up.Name, Palette.TextSize.Section, Palette.UI.TextDark, nil, true)
		name.LayoutOrder = 1

		-- §9.10: live copy is not rendered in `Locked`, the desaturated
		-- unavailable-control grey. `TextMuted` is the body-copy token.
		local blurb = text(row.column, up.Blurb, Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body, true)
		blurb.LayoutOrder = 2

		local pips, setPips = pipTrack(row.column, up.MaxLevel)
		pips.LayoutOrder = 3

		local stat = text(row.column, "", Palette.TextSize.Card, Palette.UI.HeaderCyan, nil, true)
		stat.LayoutOrder = 4

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			local value = Config.upgradeValue(up.Id, level)
			local maxed = cost == nil

			local unit = string.upper(up.Unit)
			if maxed then
				stat.Text = `{Util.comma(value)} {unit}  ·  FULLY UPGRADED`
			else
				-- The next value, not just the current one: the whole question a
				-- shop row has to answer is "what do I get for this".
				local nextValue = Config.upgradeValue(up.Id, level + 1)
				stat.Text = `{Util.comma(value)} → {Util.comma(nextValue)} {unit}`
			end

			--[[ A maxed upgrade is desaturated across the whole card, not just on
				 its button: grey tile, grey pips, grey stat line. `Locked` is the
				 token for exactly this — a thing that is genuinely unavailable. ]]
			setMuted(row.icon, maxed)
			stat.TextColor3 = if maxed then Palette.UI.TextMuted else Palette.UI.HeaderCyan
			setPips(level, if maxed then Palette.UI.Locked else Palette.UI.HeaderCyan)

			if maxed then
				row.act.setDead("MAX")
			elseif afford then
				row.act.setLive(Util.comma(cost :: number))
			else
				-- Unaffordable still shows the price: the player needs to know
				-- what they are saving towards, not just that they cannot buy.
				row.act.setDead(Util.comma(cost :: number))
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

			local owned, total = 0, 0
			for _, up in Config.Upgrades do
				local level = readUpgrade(latest, up.Id)
				owned += level
				total += up.MaxLevel
			end
			setRig(
				owned / math.max(1, total),
				Palette.UI.HeaderCyan,
				`{Util.comma(owned)} / {Util.comma(total)} LEVELS OWNED`
			)

			local coins = tonumber(latest.coins) or 0
			local from = tonumber(prior.coins)
			strip.set(coins, if from and from ~= coins and openId == "upgrades" then from else nil)
		end,
	}
end

--------------------------------------------------------------------------------
-- SHOP — the storefront
--------------------------------------------------------------------------------

local function buildShop(): PanelDef
	local panel, body = Theme.panel(layer, "SHOP", Palette.UI.HeaderGold)
	local list = scroller(well(body, FOOTER_H))
	local strip = balanceStrip(body, Palette.shade(Palette.UI.HeaderGold, 0.22))

	local rows: { () -> () } = {}

	-- FEATURED ------------------------------------------------------------
	--[[ A gold tray holding one white card. That relationship — one saturated
		 block, one neutral card inside it — is §5's whole construction grammar,
		 and running it at section scale is what separates the featured offer from
		 the grid below instead of leaving four identical cards in a column. ]]
	local tray = Theme.surface(list, {
		Fill = Palette.UI.Premium,
		Radius = Theme.Radius.Panel,
		Stroke = Palette.Outline.Panel,
		Edge = Theme.Edge.Header,
		HighlightInset = 22,
		HighlightThickness = 5,
		Sheen = 20,
	}, UDim2.new(1, 0, 0, TRAY_MIN_H)) :: Frame
	tray.Name = "Featured"
	tray.LayoutOrder = 1

	local trayPad = Instance.new("UIPadding")
	trayPad.PaddingTop = UDim.new(0, TRAY_PAD_TOP)
	trayPad.PaddingBottom = UDim.new(0, TRAY_PAD_BOTTOM)
	trayPad.PaddingLeft = UDim.new(0, 14)
	trayPad.PaddingRight = UDim.new(0, 14)
	trayPad.Parent = tray

	local trayList = Instance.new("UIListLayout")
	trayList.FillDirection = Enum.FillDirection.Vertical
	trayList.SortOrder = Enum.SortOrder.LayoutOrder
	trayList.Padding = UDim.new(0, TRAY_GAP)
	trayList.Parent = tray

	-- Emoji flanking a section label is the one place the style spec permits
	-- them: ornament, never a functional icon.
	local featuredHeading = Theme.sectionLabel(tray, "🔥 FEATURED 🔥") :: TextLabel
	featuredHeading.LayoutOrder = 1

	local hero = Config.Upgrades[1]
	if hero then
		local row = rowCard(tray, hero.Icon, Palette.UI.Premium, HERO_ICON, function()
			local level, cost, afford = readUpgrade(latest, hero.Id)
			if level >= hero.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", hero.Id)
		end, {
			wash = Palette.lift(Palette.UI.Premium, 0.55),
			coin = true,
			--[[ The tray is as tall as its own chrome plus whatever the row inside
				 it reflowed to. This is the hand-back that replaces AutomaticSize —
				 see the note on TRAY_CHROME. ]]
			onResize = function(height: number)
				local size = UDim2.new(1, 0, 0, TRAY_CHROME + height)
				if tray.Size ~= size then
					tray.Size = size
				end
			end,
		})
		row.card.root.LayoutOrder = 2
		registerFlash(`up:{hero.Id}`, row.card.flash)

		local ribbon = Theme.surface(row.column, {
			Fill = Palette.UI.Close,
			Radius = Theme.Radius.Pill,
			Stroke = Palette.Outline.Button,
			Edge = 4,
			HighlightInset = 12,
			HighlightThickness = 3,
		}, UDim2.new(1, 0, 0, 30)) :: Frame
		ribbon.Name = "Ribbon"
		ribbon.LayoutOrder = 0
		-- Sized as a share of the text column with a ceiling, not a flat 150px:
		-- on the narrowest supported panel the column is ~134px and a fixed
		-- ribbon would hang off the side of its own card.
		local ribbonCap = Instance.new("UISizeConstraint")
		ribbonCap.MaxSize = Vector2.new(158, 30)
		ribbonCap.Parent = ribbon

		local ribbonText = displayText(ribbon, "BEST VALUE", Palette.TextSize.Small)
		ribbonText.Size = UDim2.new(1, -12, 1, -6)
		ribbonText.Position = UDim2.fromOffset(6, 0)

		local name = text(row.column, hero.Name, Palette.TextSize.Title, Palette.UI.TextDark, nil, true)
		name.LayoutOrder = 1

		local blurb = text(row.column, hero.Blurb, Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body, true)
		blurb.LayoutOrder = 2

		local pips, setPips = pipTrack(row.column, hero.MaxLevel)
		pips.LayoutOrder = 3

		local stat = text(row.column, "", Palette.TextSize.Card, Palette.shade(Palette.UI.Premium, 0.3), nil, true)
		stat.LayoutOrder = 4

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, hero.Id)
			local value = Config.upgradeValue(hero.Id, level)
			local maxed = cost == nil
			local unit = string.upper(hero.Unit)

			if maxed then
				stat.Text = `{Util.comma(value)} {unit}  ·  FULLY UPGRADED`
				setMuted(row.icon, true)
				setPips(level, Palette.UI.Locked)
				row.act.setDead("MAX")
				return
			end

			local nextValue = Config.upgradeValue(hero.Id, level + 1)
			stat.Text = `{Util.comma(value)} → {Util.comma(nextValue)} {unit}`
			setMuted(row.icon, false)
			setPips(level, Palette.UI.Premium)

			if afford then
				row.act.setLive(Util.comma(cost :: number))
			else
				row.act.setDead(Util.comma(cost :: number))
			end
		end)
	end

	-- ALL UPGRADES --------------------------------------------------------
	local gridHeading = Theme.sectionLabel(list, "⭐ ALL UPGRADES ⭐") :: TextLabel
	gridHeading.LayoutOrder = 2

	local gridHolder = Instance.new("Frame")
	gridHolder.Name = "Grid"
	gridHolder.BackgroundTransparency = 1
	gridHolder.BorderSizePixel = 0
	gridHolder.LayoutOrder = 3
	-- The holder grows with its rows. A fixed-height holder could only ever show
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
		--[[ Cell geometry is fixed and known, so this card can position from
			 offsets safely: every one of them is checked against the 224x286 cell
			 minus the plate and the card padding (192 x 246 of content) and none
			 of them can go negative. ]]
		local handle = card(gridHolder, GRID_CELL.Y)
		handle.root.Size = UDim2.fromScale(1, 1)
		handle.root.LayoutOrder = index
		registerFlash(`up:{up.Id}`, handle.flash)

		local tint = tints[((index - 1) % #tints) + 1]

		local tile = iconTile(handle.root, up.Icon, tint, 84)
		tile.AnchorPoint = Vector2.new(0.5, 0)
		tile.Position = UDim2.new(0.5, 0, 0, 0)

		local name = text(handle.root, up.Name, Palette.TextSize.Card, Palette.UI.TextDark)
		name.Position = UDim2.fromOffset(0, 92)
		name.Size = UDim2.new(1, 0, 0, 26)
		name.TextXAlignment = Enum.TextXAlignment.Center

		local pips, setPips = pipTrack(handle.root, up.MaxLevel)
		pips.Position = UDim2.fromOffset(0, 124)

		local levelLabel = text(handle.root, "", Palette.TextSize.Card, Palette.UI.TextMuted, Palette.Font.Body)
		levelLabel.Position = UDim2.fromOffset(0, 144)
		levelLabel.Size = UDim2.new(1, 0, 0, 24)
		levelLabel.TextXAlignment = Enum.TextXAlignment.Center

		local buy = action(handle.root, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			if level >= up.MaxLevel or cost == nil or not afford then
				return
			end
			send("Purchase", up.Id)
		end, true)
		buy.place(UDim2.new(1, 0, 0, ACTION_H), UDim2.new(0.5, 0, 1, 0), Vector2.new(0.5, 1))

		table.insert(rows, function()
			local level, cost, afford = readUpgrade(latest, up.Id)
			local maxed = cost == nil
			levelLabel.Text = `LEVEL {level} / {up.MaxLevel}`
			setMuted(tile, maxed)
			setPips(level, if maxed then Palette.UI.Locked else tint)
			if maxed then
				buy.setDead("MAX")
			elseif afford then
				buy.setLive(Util.comma(cost :: number))
			else
				buy.setDead(Util.comma(cost :: number))
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
			local coins = tonumber(latest.coins) or 0
			local from = tonumber(prior.coins)
			strip.set(coins, if from and from ~= coins and openId == "shop" then from else nil)
		end,
	}
end

--------------------------------------------------------------------------------
-- CODES — the ticket booth
--------------------------------------------------------------------------------

local HINTS = {
	"CASE DOES NOT MATTER",
	"EACH CODE WORKS ONCE",
	"NEW DROPS AT MILESTONES",
}

local function buildCodes(): PanelDef
	local panel, body = Theme.panel(layer, "CODES", Palette.UI.HeaderGreen)
	local list = scroller(well(body, FOOTER_H))
	local strip = balanceStrip(body, Palette.shade(Palette.UI.HeaderGreen, 0.2))

	-- The booth: a green tray with a punched ticket inside it. Same tray/card
	-- grammar as the shop's featured block, dressed as the thing it does.
	local tray = Theme.surface(list, {
		Fill = Palette.UI.HeaderGreen,
		Radius = Theme.Radius.Panel,
		Stroke = Palette.Outline.Panel,
		Edge = Theme.Edge.Header,
		HighlightInset = 22,
		HighlightThickness = 5,
		Sheen = 20,
	}, UDim2.new(1, 0, 0, BOOTH_H)) :: Frame
	tray.Name = "Booth"
	tray.LayoutOrder = 1

	local trayPad = Instance.new("UIPadding")
	trayPad.PaddingTop = UDim.new(0, TRAY_PAD_TOP)
	trayPad.PaddingBottom = UDim.new(0, TRAY_PAD_BOTTOM)
	trayPad.PaddingLeft = UDim.new(0, 16)
	trayPad.PaddingRight = UDim.new(0, 16)
	trayPad.Parent = tray

	local trayList = Instance.new("UIListLayout")
	trayList.FillDirection = Enum.FillDirection.Vertical
	trayList.SortOrder = Enum.SortOrder.LayoutOrder
	trayList.Padding = UDim.new(0, TRAY_GAP)
	trayList.HorizontalAlignment = Enum.HorizontalAlignment.Center
	trayList.Parent = tray

	local heading = Theme.sectionLabel(tray, "🎟 REDEEM A CODE 🎟") :: TextLabel
	heading.LayoutOrder = 1

	local ticket = card(tray, TICKET_H)
	ticket.root.LayoutOrder = 2
	local ticketWidth = Instance.new("UISizeConstraint")
	ticketWidth.MaxSize = Vector2.new(560, math.huge)
	ticketWidth.Parent = ticket.root

	--[[ Where the notches sit as a fraction of the TRAY's height, which is what
		 decides the colour they have to be painted (see below). The ticket's own
		 centre is the tray's chrome above it plus half its height. ]]
	local NOTCH_Y = (TRAY_PAD_TOP + TRAY_HEADING_H + TRAY_GAP + TICKET_H / 2) / BOOTH_H

	--[[ The two punched notches that make the card read as a ticket stub. They
		 are filled with the TRAY's colour, which is the same punch-out trick the
		 pictograms use: a shape in the background's own colour reads as a hole.
		 Unstroked for the same reason — an outlined circle would read as a button
		 stuck to the side of the card rather than as a bite taken out of it. ]]
	local function notch(x: number)
		local hole = Instance.new("Frame")
		hole.Name = "Notch"
		hole.AnchorPoint = Vector2.new(0.5, 0.5)
		hole.Position = UDim2.new(x, 0, 0.5, 0)
		hole.Size = UDim2.fromOffset(26, 26)
		--[[ The colour the TRAY renders at the notch's own height, not the green
			 token — see `renderedTint`. Painted with the token these would be two
			 bright dots stuck to the card rather than two bites taken out of it. ]]
		hole.BackgroundColor3 = renderedTint(Palette.UI.HeaderGreen, NOTCH_Y)
		hole.BorderSizePixel = 0
		hole.ZIndex = ticket.root.ZIndex + 30
		hole.Parent = ticket.root
		corner(hole, Theme.Radius.Pill)
	end
	notch(0)
	notch(1)

	local form = Instance.new("Frame")
	form.Name = "Form"
	form.BackgroundTransparency = 1
	form.BorderSizePixel = 0
	form.Size = UDim2.fromScale(1, 1)
	form.ZIndex = ticket.root.ZIndex + 1
	form.Parent = ticket.root

	local column = Instance.new("UIListLayout")
	column.FillDirection = Enum.FillDirection.Vertical
	column.SortOrder = Enum.SortOrder.LayoutOrder
	column.Padding = UDim.new(0, 12)
	column.HorizontalAlignment = Enum.HorizontalAlignment.Center
	column.Parent = form

	local prompt = text(form, "ENTER YOUR CODE", Palette.TextSize.Section, Palette.UI.TextDark)
	prompt.LayoutOrder = 1
	prompt.Size = UDim2.new(1, 0, 0, 30)
	prompt.TextXAlignment = Enum.TextXAlignment.Center

	--[[ The input well. Like the panel's own well it is a RECESS — no hard bottom
		 edge, no lit top rim — so it reads as somewhere to put something rather
		 than as another raised control competing with the REDEEM button. ]]
	local field = Theme.surface(form, {
		Fill = Palette.UI.BodyTint,
		Radius = Theme.Radius.Button,
		Stroke = Palette.Outline.Panel,
		Edge = 0,
		Highlight = false,
	}, UDim2.new(1, 0, 0, 66)) :: Frame
	field.Name = "Field"
	field.LayoutOrder = 2

	local box = Instance.new("TextBox")
	box.Name = "CodeBox"
	box.BackgroundTransparency = 1
	box.Size = UDim2.new(1, -24, 1, -8)
	box.Position = UDim2.fromOffset(12, 0)
	box.Font = Palette.Font.Display
	box.TextSize = Palette.TextSize.Title
	box.TextColor3 = Palette.UI.TextDark
	box.PlaceholderText = "CODE"
	-- Placeholder copy is live copy, not a disabled control (§9.10).
	box.PlaceholderColor3 = Palette.UI.TextMuted
	box.Text = ""
	box.ClearTextOnFocus = false
	box.TextStrokeTransparency = 1
	box.TextXAlignment = Enum.TextXAlignment.Center
	box.ZIndex = field.ZIndex + 1
	box.Parent = field

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

	local submit: TextButton = Theme.button(form, "REDEEM", Palette.UI.Buy, UDim2.new(1, 0, 0, 64))
	submit.LayoutOrder = 3
	lift(submit)

	--[[ The verdict, drawn as a strip rather than a coloured line of text. A
		 recolouring surface carries much further than a recoloured word, and the
		 neutral resting state means the panel is never claiming an answer it does
		 not have. ]]
	local resultStrip = Theme.surface(form, {
		Fill = Palette.UI.BodyTint,
		Radius = Theme.Radius.Button,
		Stroke = Palette.Outline.Card,
		Edge = 4,
		HighlightInset = 14,
		HighlightThickness = 3,
	}, UDim2.new(1, 0, 0, 46)) :: Frame
	resultStrip.Name = "Result"
	resultStrip.LayoutOrder = 4
	resultStrip.Visible = false

	local resultText = displayText(resultStrip, "", Palette.TextSize.Card)
	resultText.Size = UDim2.new(1, -20, 1, -4)
	resultText.Position = UDim2.fromOffset(10, 0)

	local function showResult(message: string, fill: Color3, ink: Color3)
		resultStrip.Visible = true
		resultStrip.BackgroundColor3 = fill
		resultText.TextColor3 = ink
		resultText.Text = string.upper(message)
	end

	local function clearResult()
		resultStrip.Visible = false
		resultText.Text = ""
	end

	--[[ At most one redeem is outstanding at a time, identified by a generation
		 number. Every submit takes the next one; a verdict or a panel reset puts
		 it back to 0. A timeout only writes if its own generation is still the
		 outstanding one, so a late timer can never overwrite a verdict that did
		 arrive, and a second submit invalidates the first submit's timer. ]]
	local pendingRedeem = 0

	submit.Activated:Connect(function()
		local code = normalise()
		if code == "" then
			-- Answered locally, so nothing is outstanding and no timer is armed.
			pendingRedeem = 0
			showResult("TYPE A CODE FIRST", Palette.UI.Close, Palette.UI.TextLight)
			cue("error")
			return
		end
		showResult("CHECKING...", Palette.shade(Palette.UI.CounterFill, 0.1), Palette.UI.TextLight)
		send("Redeem", code)

		pendingRedeem += 1
		local generation = pendingRedeem
		task.delay(REDEEM_TIMEOUT, function()
			if pendingRedeem ~= generation then
				return -- a verdict landed, or a newer submit owns the line now
			end
			pendingRedeem = 0
			showResult(REDEEM_NO_ANSWER, Palette.shade(Palette.UI.CounterFill, 0.1), Palette.UI.TextLight)
		end)
	end)

	--[[ The redeem verdict, routed through Effects rather than a second
		 subscription to `Notify` (see `resolveEffects`). If Effects could not be
		 resolved there is no listener at all and the timeout above is what
		 resolves the strip.

		 The strip is claimed only while a redeem is actually outstanding AND this
		 panel is the open one. Without the first test an unrelated toast — a
		 refused sell, PACK FULL — would land in the result strip and read as an
		 answer to a code the player never typed; the old handler tested only the
		 second. What is left is a ~3s window in which an unrelated toast can
		 still be mistaken for the verdict, which is as narrow as this can get
		 without a correlation id on the remote. ]]
	if Effects then
		Effects.onNotify(function(_kind: string, message: string, accent: Color3)
			if pendingRedeem == 0 or openId ~= "codes" then
				return
			end
			pendingRedeem = 0 -- a real verdict; the timeout must not overwrite it

			--[[ `accent` is the colour Effects resolved for this kind, so the strip
				 and the toast cannot disagree about severity. ]]
			showResult(message, accent, Palette.UI.TextLight)
		end)
	end

	-- HOW CODES WORK -------------------------------------------------------
	local hintHeading = Theme.sectionLabel(list, "HOW CODES WORK") :: TextLabel
	hintHeading.LayoutOrder = 2

	local hintHolder = Instance.new("Frame")
	hintHolder.Name = "Hints"
	hintHolder.BackgroundTransparency = 1
	hintHolder.BorderSizePixel = 0
	hintHolder.LayoutOrder = 3
	hintHolder.Size = UDim2.new(1, 0, 0, 0)
	hintHolder.AutomaticSize = Enum.AutomaticSize.Y
	hintHolder.ZIndex = list.ZIndex + 1
	hintHolder.Parent = list

	-- A grid rather than a row: three chips fit across on desktop and wrap to one
	-- column on a phone without any of them being squeezed to unreadable.
	local hintGrid = Instance.new("UIGridLayout")
	hintGrid.CellSize = UDim2.fromOffset(216, 84)
	hintGrid.CellPadding = UDim2.fromOffset(12, 12)
	hintGrid.SortOrder = Enum.SortOrder.LayoutOrder
	hintGrid.HorizontalAlignment = Enum.HorizontalAlignment.Center
	hintGrid.Parent = hintHolder

	for index, hint in HINTS do
		local chip = card(hintHolder, 84)
		chip.root.Size = UDim2.fromScale(1, 1)
		chip.root.LayoutOrder = index

		local tile = iconTile(chip.root, "ticket", Palette.UI.HeaderGreen, 40)
		tile.AnchorPoint = Vector2.new(0, 0.5)
		tile.Position = UDim2.new(0, 0, 0.5, 0)

		local label = text(chip.root, hint, Palette.TextSize.Small, Palette.UI.TextMuted, Palette.Font.Body, true)
		-- Anchored on its own centre so a hint that wraps to two lines grows
		-- symmetrically about the tile instead of hanging off the bottom.
		label.AnchorPoint = Vector2.new(0, 0.5)
		label.Position = UDim2.new(0, 52, 0.5, 0)
		label.Size = UDim2.new(1, -52, 0, 0)
	end

	return {
		id = "codes",
		frame = panel,
		body = body,
		refresh = function()
			local coins = tonumber(latest.coins) or 0
			local from = tonumber(prior.coins)
			strip.set(coins, if from and from ~= coins and openId == "codes" then from else nil)
		end,
		onOpen = function()
			-- Reopening abandons anything still in flight, so a verdict for the
			-- previous session of this panel cannot land on a fresh blank strip.
			pendingRedeem = 0
			clearResult()
		end,
		onClose = function()
			box:ReleaseFocus()
		end,
	}
end

--------------------------------------------------------------------------------
-- ZONES — the progression map
--------------------------------------------------------------------------------

local RAIL_W = 40
local NODE = 30

local function buildZones(): PanelDef
	local panel, body = Theme.panel(layer, "ZONES", Palette.UI.HeaderPurple)
	local list = scroller(well(body, FOOTER_H))
	local strip = balanceStrip(body, Palette.shade(Palette.UI.HeaderPurple, 0.2))

	local heading = Theme.sectionLabel(list, "✨ PROGRESSION ✨") :: TextLabel
	heading.LayoutOrder = 1

	local rows: { () -> () } = {}
	local zoneCount = #Config.Zones

	for index, zone in Config.Zones do
		--[[ One entry is a numbered rail node plus a card. The rail is what makes
			 this read as a route rather than as a list: a player should be able to
			 see at a glance that the zones are ordered and that they are partway
			 along. ]]
		local entry = Instance.new("Frame")
		entry.Name = `Zone{index}`
		entry.BackgroundTransparency = 1
		entry.BorderSizePixel = 0
		entry.LayoutOrder = index + 1
		entry.Size = UDim2.new(1, 0, 0, 120)
		entry.ZIndex = list.ZIndex + 1
		entry.Parent = list

		local rail = Instance.new("Frame")
		rail.Name = "Rail"
		rail.BackgroundTransparency = 1
		rail.BorderSizePixel = 0
		rail.Size = UDim2.new(0, RAIL_W, 1, 0)
		rail.ZIndex = entry.ZIndex
		rail.Parent = entry

		--[[ The connector runs past the bottom of this entry by the list's own gap
			 so it meets the next node instead of stopping short. The last zone has
			 no next node, so its line stops under its own. ]]
		local line = Instance.new("Frame")
		line.Name = "Line"
		line.AnchorPoint = Vector2.new(0.5, 0)
		line.Position = UDim2.new(0.5, 0, 0, NODE // 2)
		line.Size = UDim2.new(0, 8, 1, LIST_GAP)
		line.BackgroundColor3 = Palette.shade(Palette.UI.HeaderPurple, 0.25)
		line.BorderSizePixel = 0
		line.Visible = index < zoneCount
		line.ZIndex = entry.ZIndex
		line.Parent = rail
		corner(line, Theme.Radius.Pill)
		Palette.stroke(line, Palette.Outline.Icon)

		local node = Theme.surface(rail, {
			Fill = Palette.UI.HeaderPurple,
			Radius = Theme.Radius.Icon,
			Stroke = Palette.Outline.Icon,
			Edge = 4,
			HighlightScale = 0.56,
			HighlightInset = 0,
			HighlightThickness = 3,
		}, UDim2.fromOffset(NODE, NODE), UDim2.new(0.5, 0, 0, 0)) :: Frame
		node.Name = "Node"
		node.AnchorPoint = Vector2.new(0.5, 0)
		node.ZIndex = entry.ZIndex + 2
		local nodeLabel = displayText(node, tostring(index), 18)
		nodeLabel.Size = UDim2.new(1, 0, 1, -4)

		local holder = Instance.new("Frame")
		holder.Name = "CardHolder"
		holder.BackgroundTransparency = 1
		holder.BorderSizePixel = 0
		holder.Position = UDim2.fromOffset(RAIL_W + GAP, 0)
		holder.Size = UDim2.new(1, -(RAIL_W + GAP), 1, 0)
		holder.ZIndex = entry.ZIndex + 1
		holder.Parent = entry

		local row = rowCard(holder, "crystal", zone.CrystalColor, ROW_ICON, function()
			local unlocked, _, afford = readZone(latest, zone)
			if unlocked or not afford then
				return
			end
			send("Unlock", zone.Id)
		end, {
			coin = true,
			--[[ The row computes its own height from its measured width; the entry
				 and the rail have to follow it, and this is how they hear about
				 it. Without the hand-back the rail would be a fixed 120px stub
				 beside a card that grew to fit a wrapped line on a phone. ]]
			onResize = function(height: number)
				local size = UDim2.new(1, 0, 0, height)
				if entry.Size ~= size then
					entry.Size = size
				end
			end,
		})
		registerFlash(`zone:{zone.Id}`, row.card.flash)

		--[[ The locked face of the same icon slot. A padlock is different ART,
			 not a different colour, so it is a second tile toggled against the
			 crystal rather than a recolour of it — built once, here, never per
			 Sync. It tracks the crystal's size because `rowCard` resizes that
			 tile when the card reflows between its wide and stacked layouts. ]]
		local slot = row.icon.Parent :: Instance
		local lockTile = iconTile(slot, "lock", Palette.UI.Locked, ROW_ICON)
		lockTile.AnchorPoint = row.icon.AnchorPoint
		lockTile.Position = row.icon.Position
		lockTile.Size = row.icon.Size
		lockTile.ZIndex = row.icon.ZIndex + 1
		lockTile.Visible = false
		row.icon:GetPropertyChangedSignal("Size"):Connect(function()
			lockTile.Size = row.icon.Size
		end)

		local name = text(row.column, zone.Name, Palette.TextSize.Section, Palette.UI.TextDark, nil, true)
		name.LayoutOrder = 1

		local yieldLabel = text(row.column, "", Palette.TextSize.Card, Palette.shade(zone.AccentColor, 0.3), nil, true)
		yieldLabel.LayoutOrder = 2

		local progress, setProgress = meter(row.column)
		progress.LayoutOrder = 3

		table.insert(rows, function()
			local unlocked, cost, afford = readZone(latest, zone)
			local coins = tonumber(latest.coins) or 0

			yieldLabel.Text = `{Util.comma(zone.ShardValue)} {Config.Currency.Shards.Display} PER CRYSTAL`

			if unlocked then
				--[[ An open zone is bright: a white card, its crystal in the zone's
					 own colour, and a green "yours" tag where the price would be. ]]
				row.card.recolour(Palette.UI.CardFill)
				row.icon.Visible = true
				lockTile.Visible = false
				name.TextColor3 = Palette.UI.TextDark
				yieldLabel.TextColor3 = Palette.shade(zone.AccentColor, 0.3)
				progress.Visible = false
				-- The "already yours" state is a tag, not a control. It is built
				-- from Theme.button so it matches the other two states pixel for
				-- pixel, then deadened so nothing about it invites a click.
				row.act.setTag("UNLOCKED")
				return
			end

			--[[ A locked zone has to LOOK locked, not merely say so. The card goes
				 to slate, the crystal becomes a padlock-grey tile, the name loses
				 its contrast, and the price is replaced by how far away it is.
				 Everything the player would reach for is visibly switched off. ]]
			row.card.recolour(Theme.mix(Palette.UI.CounterFill, Palette.shade(Palette.UI.HeaderPurple, 0.5), 0.45))
			row.icon.Visible = false
			lockTile.Visible = true
			name.TextColor3 = Palette.UI.TextLight
			yieldLabel.TextColor3 = Palette.lift(zone.AccentColor, 0.25)
			progress.Visible = true
			setProgress(
				coins / math.max(1, cost),
				if afford then Palette.UI.Buy else Palette.UI.Premium,
				`{Util.comma(math.min(coins, cost))} / {Util.comma(cost)}`
			)

			if afford then
				row.act.setLive(Util.comma(cost))
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
			local coins = tonumber(latest.coins) or 0
			local from = tonumber(prior.coins)
			strip.set(coins, if from and from ~= coins and openId == "zones" then from else nil)
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
	 than the numbers from whenever it was last on screen.

	 The diff at the top is the ONLY thing this module does with two snapshots,
	 and it is not bookkeeping: both are server payloads, and the question being
	 asked of them is "which fact did the server just change", not "what do I
	 think happened". A card flashes because the server raised a level, never
	 because a click was sent. ]]
function Panels.render(state: Snapshot)
	if type(state) ~= "table" then
		return
	end

	prior = latest
	latest = state

	-- `prior` is empty on the very first Sync of the session; a returning player
	-- must not have every owned upgrade flash at them on load.
	if next(prior) ~= nil then
		local celebrated = false
		for _, up in Config.Upgrades do
			local before = readUpgrade(prior, up.Id)
			local after = readUpgrade(latest, up.Id)
			if after > before then
				fireFlash(`up:{up.Id}`)
				celebrated = true
			end
		end
		for _, zone in Config.Zones do
			local wasOpen = readZone(prior, zone)
			local isOpen = readZone(latest, zone)
			if isOpen and not wasOpen then
				-- No cue here: `Effects.celebrate` is already firing on the
				-- server's `Unlocked` push, and two stingers on one event read as
				-- a double-fire rather than as emphasis.
				fireFlash(`zone:{zone.Id}`)
			end
		end
		if celebrated then
			cue("purchase")
		end
	end

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

	--[[ Theme's spacing scale is the padding `Theme.card` actually applies, and
		 Theme's decision 1 names that a contract with this file. Reading it here
		 rather than re-declaring the numbers means a change to the scale moves the
		 card interiors with it instead of silently mis-measuring every card. The
		 literals at the top of this file are only the seed for the case where a
		 host supplies a Theme without the scale. ]]
	if type(Theme.Spacing) == "table" then
		CARD_PAD_X = tonumber(Theme.Spacing.Base) or CARD_PAD_X
		CARD_PAD_Y = tonumber(Theme.Spacing.Snug) or CARD_PAD_Y
	end

	-- `screen` is what the client boot script calls the ScreenGui; the other
	-- spellings are accepted so a different host does not have to rename it.
	local parent = deps.gui or deps.screenGui or deps.screen or deps.parent
	assert(typeof(parent) == "Instance", "Panels.init requires deps.gui — the ScreenGui the modals live in")

	if type(deps.send) == "function" then
		sendFn = deps.send
	end

	--[[ Resolved once, here, and shared by every panel: the codes verdict, the
		 counting balance strips and the click cues all come through it. A nil
		 Effects degrades every one of those to its static form rather than
		 disabling a panel. ]]
	Effects = resolveEffects()

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
