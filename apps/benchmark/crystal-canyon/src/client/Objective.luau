--!strict
--[[
	Crystal Canyon — the onboarding chip.

	A single chip in the top band reading e.g. "① COLLECT 25 SHARDS  [12/25]". It
	is the only thing the game puts anywhere near the middle of the screen, and
	it earns that spot by being the one instruction a new player needs; §6 of the
	style spec keeps the centre otherwise empty, so this chip hugs the top edge
	and vanishes the moment the chain is finished.

	Everything here is derived from server state. The chip never counts anything
	itself and never decides which step is current: it renders the single
	`objective` record out of `Sync` — { index, id, text, progress, target,
	complete } — and nothing else, so it cannot congratulate a player for
	progress the server did not record, and it cannot disagree with the server
	about which step is live.

	Two pieces of real machinery:

	1. THE HAND-OFF. Progress can jump several steps in one `Sync` (a code redeem
	   that completes two objectives at once), and `render` can be called again
	   mid-transition. So a transition owns the chip exclusively while it runs and
	   the newest state is parked in `pending`, replayed when the animation lets
	   go. Without that, two overlapping slides leave the chip stranded
	   off-screen. See `travel` for why the distance it slides is measured the way
	   it is.

	2. THE LAYOUT CONTRACT, AND WHY THE CHIP ITSELF IS NOT A `Theme.surface`.
	   The chip has to grow with its own text, so it is auto-sized and its three
	   contents are placed by a UIListLayout — and a UIListLayout lays out EVERY
	   visible child, with no opt-out. `Theme.surface` builds its moulding out of
	   real child frames (a hard bottom edge, a lit top rim), so applying it to the
	   chip would hand the layout two extra cells and shove the title sideways.

	   So the chip's own shell is built by hand and takes §3's hard bottom edge
	   from its GRADIENT instead — a near-vertical step in the ramp, which is the
	   same band of the same hue two shades down, drawn with no instance at all.
	   Everything INSIDE the chip is a proper Theme surface, because the layout
	   only sees the three children and never their contents.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Util = require(Shared:WaitForChild("Util"))

-- Sibling require, exactly as Hud reaches for it. The chip is a HUD surface and
-- has to be made of the same material as the rest of them.
local Theme = require(script.Parent:WaitForChild("Theme"))
--[[ Reduced motion (§O, §AL). `Theme.motion` has TweenService's `:Create`
	 shape and returns an instant, still-Completed tween when the player has asked
	 their device for less motion. Swapped here rather than at each call site so a
	 tween added later to this module is covered without anyone remembering to. ]]
local TweenService = Theme.motion

local Objective = {}

local CHIP_HEIGHT = 52
--[[ The chip is a dark HUD pill (§6) — but mixed toward the objective's own gold,
	 the same treatment `Theme.counter` gives a currency pill. "Too many plain
	 black pill-shaped surfaces" was a named defect, and a black lozenge parked in
	 the top band was one of them. ]]
local CHIP_FILL = Theme.mix(Palette.UI.CounterFill, Palette.shade(Palette.UI.Premium, 0.62), 0.52)
local CHIP_TOP = 12
local HOME = UDim2.new(0.5, 0, 0, CHIP_TOP)

local BADGE = 34
local CAPSULE_W = 112
local CAPSULE_H = 30

--[[ How far past the viewport edge the chip parks while it is "off", in screen
	 pixels. Non-zero for two reasons: a slide that stops exactly on the edge can
	 leave a sliver of outline behind on a fractional-scale display, and the chip
	 sits off-screen for one frame with the NEXT step's text already in it, which
	 is a different width. 40px absorbs both — it is travel nobody can see, so
	 there is nothing to spend by being generous. ]]
local EXIT_MARGIN = 40

--[[ Last resort, for the case where there is nothing to measure against at all:
	 no camera, or a viewport still reporting zero. Wide enough to clear any
	 viewport this game is realistically played on. ]]
local FALLBACK_SLIDE = 2400

--[[ The width assumed for a chip that has not been laid out yet. Deliberately a
	 constant of THIS module rather than the mount's measured width — see
	 `travel`. Over-estimating costs nothing (the chip is off-screen either way);
	 under-estimating is the entire bug this replaces. ]]
local ASSUMED_CHIP_WIDTH = 520

local TICK_HOLD = 0.5 -- how long the green "done" state is held before moving on
local SLIDE_OUT = 0.22
local SLIDE_IN = 0.3

local chip: Frame? = nil
local titleLabel: TextLabel? = nil
local countLabel: TextLabel? = nil
--[[ Icons, on the BOUNDED wait. Copied verbatim from Hud.luau, including both warns.

	 The badge draws a glyph for every contextual objective, so this module now has a real
	 dependency on Icons — and F-16 is the reason it is bounded: `Panels` waited for this same
	 module UNBOUNDED, the install manifest had never been taught about it, and every panel in
	 the game was silently dead in play. A missing icon set must cost this chip its pictogram,
	 never the chip itself. ]]
local Icons: any = nil
do
	local module = script.Parent:WaitForChild("Icons", 5)
	if module and module:IsA("ModuleScript") then
		local ok, result = pcall(require, module)
		if ok then
			Icons = result
		else
			warn(`[CrystalCanyon] Objective: Icons failed to load, drawing without pictograms: {result}`)
		end
	else
		warn("[CrystalCanyon] Objective: Icons module missing, drawing without pictograms")
	end
end

local stepLabel: TextLabel? = nil
local stepBadge: Frame? = nil
local tickArt: Frame? = nil
local meterFill: Frame? = nil
local capsule: Frame? = nil

-- Index of the objective currently drawn. 0 means "nothing drawn yet", which
-- is what suppresses a spurious completion animation on the very first Sync.
local shownIndex = 0
--[[ The objective's IDENTITY, tracked beside its index.

	 The index alone stopped being enough the moment contextual objectives arrived: they all
	 carry the sentinel, so `step.index > shownIndex` is false for every transition between
	 them. PACK FULL -> SELL YOUR SHARDS -> BUY PACK SIZE would have painted in place, with the
	 text swapping under a stationary chip, which reads as a rendering glitch rather than as the
	 game telling the player something new. ]]
local shownId = ""
local busy = false
local pending: any = nil
local fillTween: Tween? = nil

-- Construction ------------------------------------------------------------

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ §3 asks for a slight vertical gradient and for depth to read as a hard
	 bottom edge rather than a soft shadow. Both come from one gradient here, and
	 the keypoints are NEUTRAL greys rather than tinted colours on purpose:

	   • A UIGradient multiplies its object's BackgroundColor3. A grey ramp
	     therefore shades whatever colour the object currently is, so the chip can
	     be tweened from its dark rest colour to celebration green and keep its
	     shading — a gradient built from the rest colour would multiply the green
	     down to near-black instead.
	   • The near-vertical jump at `cut` is the hard edge. It is a band of the
	     same hue, two shades down, exactly as §3 describes, and unlike a child
	     frame it cannot be picked up and re-positioned by the UIListLayout that
	     owns this chip's children. ]]
local function faceGradient(inst: GuiObject, cut: number?): UIGradient
	local g = Instance.new("UIGradient")
	g.Rotation = 90 -- 0 is left-to-right; 90 runs top-to-bottom
	local edge = cut or 0.78
	g.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.new(1, 1, 1)),
		ColorSequenceKeypoint.new(edge, Color3.new(0.88, 0.88, 0.88)),
		ColorSequenceKeypoint.new(math.min(edge + 0.01, 0.999), Color3.new(0.64, 0.64, 0.64)),
		ColorSequenceKeypoint.new(1, Color3.new(0.6, 0.6, 0.6)),
	})
	g.Parent = inst
	return g
end

--[[ A checkmark drawn from two rotated bars rather than a glyph. §4 permits
	 emoji only as ornament, never as a functional icon, and a font glyph would
	 not carry the mandatory outline the way a real GuiObject does. Lives inside
	 the step badge, so it swaps places with the step number rather than adding a
	 fourth item to the chip's row. ]]
local function buildTick(parent: Frame): Frame
	local art = Instance.new("Frame")
	art.Name = "Tick"
	art.AnchorPoint = Vector2.new(0.5, 0.5)
	art.Position = UDim2.fromScale(0.5, 0.5)
	art.Size = UDim2.fromScale(1, 1)
	art.BackgroundTransparency = 1
	art.Visible = false
	art.ZIndex = parent.ZIndex + 2
	art.Parent = parent

	local short = Instance.new("Frame")
	short.Name = "Short"
	short.AnchorPoint = Vector2.new(0.5, 0.5)
	short.Position = UDim2.fromScale(0.38, 0.6)
	short.Size = UDim2.fromScale(0.14, 0.34)
	short.Rotation = -45
	short.BackgroundColor3 = Palette.UI.TextLight
	short.BorderSizePixel = 0
	short.ZIndex = art.ZIndex
	short.Parent = art
	corner(short, UDim.new(0, 2))

	local long = Instance.new("Frame")
	long.Name = "Long"
	long.AnchorPoint = Vector2.new(0.5, 0.5)
	long.Position = UDim2.fromScale(0.58, 0.44)
	long.Size = UDim2.fromScale(0.14, 0.6)
	long.Rotation = 40
	long.BackgroundColor3 = Palette.UI.TextLight
	long.BorderSizePixel = 0
	long.ZIndex = art.ZIndex
	long.Parent = art
	corner(long, UDim.new(0, 2))

	return art
end

--[[ The step badge: a saturated outlined square carrying the step number. It is
	 the chip's one block of colour, and it is what stops the chip reading as one
	 more plain dark pill — §1's grammar is a saturated block against a neutral
	 body, at every scale. ]]
local function buildBadge(parent: Frame): (Frame, TextLabel, Frame)
	local badge = Theme.surface(parent, {
		Fill = Palette.UI.Premium,
		Radius = Theme.Radius.Button,
		Stroke = Palette.Outline.Icon,
		Edge = 4,
		HighlightInset = 8,
		HighlightThickness = 3,
	}, UDim2.fromOffset(BADGE, BADGE)) :: Frame
	badge.Name = "Step"
	badge.LayoutOrder = 0

	local number = Instance.new("TextLabel")
	number.Name = "Number"
	number.Size = UDim2.fromScale(1, 1)
	number.ZIndex = badge.ZIndex + 1
	number.Text = "1"
	Palette.styleText(number, 20)
	number.Parent = badge

	local tick = buildTick(badge)

	return badge, number, tick
end

--[[ The progress capsule: a dark outlined track with a gold fill behind the
	 "12/25". §6 wants progress drawn as a thick rounded bar with its label inside
	 it, and putting the count INSIDE the bar is also what keeps the chip to three
	 laid-out children instead of four. ]]
local function buildCapsule(parent: Frame): (Frame, Frame, TextLabel)
	local track = Theme.surface(parent, {
		Fill = Palette.shade(Palette.UI.CounterFill, 0.35),
		Radius = Theme.Radius.Pill,
		Stroke = Palette.Outline.Card,
		Edge = 0,
		HighlightInset = 10,
		HighlightThickness = 3,
		HighlightTransparency = 0.84,
	}, UDim2.fromOffset(CAPSULE_W, CAPSULE_H)) :: Frame
	track.Name = "Progress"
	track.LayoutOrder = 2

	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.Size = UDim2.new(0, 0, 1, 0)
	fill.BackgroundColor3 = Palette.UI.SoftCurrency
	fill.BorderSizePixel = 0
	fill.ZIndex = track.ZIndex + 1
	fill.Parent = track
	corner(fill, Theme.Radius.Pill)
	faceGradient(fill, 0.7)

	local label = Instance.new("TextLabel")
	label.Name = "Count"
	label.Size = UDim2.fromScale(1, 1)
	label.ZIndex = track.ZIndex + 2
	label.Text = ""
	Palette.styleText(label, Theme.Type.Small + 1)

	--[[ The capsule used to hold at most `25/25`, four characters, at a fixed TextSize with no
		 scaling and no truncation. The contextual objective can put `19,834/19,835` in it —
		 thirteen — because the most expensive purchasable thing in the game is magnet level 9.

		 The critic's one piece of unqualified praise was "no text overflow across 149 rendered
		 strings". This is where that would have been spent.

		 `TextScaled` with a MAX equal to today's size and a floor of 11: short counts render at
		 exactly the size that shipped, and only the long ones shrink. The house pattern —
		 `clampText` does the same thing at Theme.luau:670 and Hud.luau:348 — costing one
		 instance and no layout change, so the chip's width budget is untouched. ]]
	local cap = Instance.new("UITextSizeConstraint")
	cap.MaxTextSize = Theme.Type.Small + 1
	cap.MinTextSize = 11
	cap.Parent = label
	-- Constraint first, `TextScaled` last, and `TextWrapped` never written. Writing it is what
	-- made both copies of `clampText` inert across 105 labels (F-38); this line was written the
	-- same wrong way and was caught by reading the property back in a live session rather than
	-- by looking at the pill.
	label.TextScaled = true

	label.Parent = track

	return track, fill, label
end

--[[ `mountPoint` is Hud's top-centre cluster (or, if the HUD failed to build,
	 the boot script's ScreenGui). Sharing that ScreenGui keeps the chip in one
	 ZIndex space with the rest of the HUD, so an open modal reliably draws over
	 it. Nothing below assumes the mount is either one in particular. ]]
function Objective.init(mountPoint: Instance)
	if chip then
		return -- idempotent; a second boot must not leave an orphaned chip
	end

	local frame = Instance.new("Frame")
	frame.Name = "ObjectiveChip"
	frame.AnchorPoint = Vector2.new(0.5, 0)
	frame.Position = HOME
	frame.Size = UDim2.fromOffset(0, CHIP_HEIGHT)
	frame.AutomaticSize = Enum.AutomaticSize.X
	frame.BackgroundColor3 = CHIP_FILL
	frame.BorderSizePixel = 0
	frame.Visible = false
	frame.ZIndex = 10
	frame.Parent = mountPoint

	corner(frame, Theme.Radius.Pill)
	faceGradient(frame)
	Palette.stroke(frame, Palette.Outline.Panel)

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 12)
	padding.PaddingRight = UDim.new(0, 14)
	padding.Parent = frame

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.VerticalAlignment = Enum.VerticalAlignment.Center
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 12)
	layout.Parent = frame

	local badge, number, tick = buildBadge(frame)

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.Size = UDim2.new(0, 0, 1, 0)
	title.AutomaticSize = Enum.AutomaticSize.X
	title.BackgroundTransparency = 1
	title.LayoutOrder = 1
	title.ZIndex = frame.ZIndex + 1
	title.Text = ""
	Palette.styleText(title, Theme.Type.Section)
	title.Parent = frame

	local track, fill, count = buildCapsule(frame)

	chip = frame
	titleLabel = title
	countLabel = count
	stepBadge = badge
	stepLabel = number
	tickArt = tick
	capsule = track
	meterFill = fill
end

-- State reading -----------------------------------------------------------

-- The "chain complete" sentinel. Economy.push sends exactly this index, with
-- complete = true, empty text and target 0, once every step is satisfied.
local DONE_INDEX = #Config.Objectives + 1

type Step = {
	index: number,
	id: string,
	text: string,
	progress: number,
	target: number,
	complete: boolean,
}

--[[ Normalise the `objective` record out of a Sync snapshot.

	 This module used to read `state.objectives` (a map of id -> progress) and
	 `state.objectiveIndex`. The server sends NEITHER: `Economy.push` builds one
	 record, `objective = { index, id, text, progress, target, complete }`. So
	 `tonumber(state.objectiveIndex)` was always nil and the map lookups always
	 missed, which made the derived index fall through to 1 every single time —
	 a player who had collected 25 shards, sold, and bought an upgrade still read
	 "COLLECT 25 SHARDS 0/25", the hand-off never ran, and the chip never left.

	 Returns nil for a snapshot with no usable record. Callers leave the chip
	 exactly as it is in that case: a malformed push is not evidence that the
	 player's progress changed, so inventing a step would be worse than nothing.

	 Config is consulted only as a fallback for `text` and `target`, because the
	 server's own strings are what the player is being graded against. ]]
local function readStep(state: any): Step?
	local record = if typeof(state) == "table" then state.objective else nil
	if typeof(record) ~= "table" then
		return nil
	end

	local rawIndex = tonumber(record.index)
	if not rawIndex or rawIndex ~= rawIndex then -- nil or NaN
		return nil
	end
	local index = math.clamp(math.floor(rawIndex), 1, DONE_INDEX)

	--[[ `complete` now means "there is no objective at all", NOT "the chain is over".

		 This line used to read `record.complete == true or index >= DONE_INDEX`, and that
		 second term is the whole of V10. The sentinel index is the CHAIN's terminator, and
		 every contextual objective the resolver emits carries it deliberately — so deriving
		 completion from the index here would hide the chip for every state this module was
		 just extended to draw, and nothing would error. That is the F-29 failure mode: code
		 that runs, finds its target, and paints nothing.

		 The test that fails against the old line is `objectives.spec.luau`'s "finishing the
		 chain does NOT end the objective", plus the client-side guard below. ]]
	local complete = record.complete == true

	--[[ A record that claims to be incomplete but carries nothing to say is malformed, and an
		 empty pill parked at the top of the screen is exactly the leftover furniture §6 exists
		 to prevent. Collapse instead. ]]
	local rawId = record.id
	local id = if typeof(rawId) == "string" then rawId else ""
	if not complete and id == "" and (typeof(record.text) ~= "string" or record.text == "") then
		complete = true
	end

	-- Only a CHAIN index has a Config entry; the sentinel and anything past it do not.
	local fallback = if index <= #Config.Objectives then Config.Objectives[index] else nil
	local target = tonumber(record.target) or (fallback and fallback.Target) or 0
	if target ~= target then -- NaN
		target = 0
	end
	target = math.max(0, math.floor(target))

	local progress = tonumber(record.progress) or 0
	if progress ~= progress then
		progress = 0
	end
	progress = math.clamp(math.floor(progress), 0, target)

	local text = record.text
	if typeof(text) ~= "string" or text == "" then
		text = fallback and fallback.Text or ""
	end

	return {
		index = index,
		id = id,
		text = text :: string,
		progress = progress,
		target = target,
		complete = complete,
	}
end

-- Drawing -----------------------------------------------------------------

--[[ The fill is tweened rather than snapped: a shard lands every few hundred
	 milliseconds while the player is collecting, and a bar that jumps reads as a
	 glitch where one that slides reads as progress. One tween at a time — the
	 previous is cancelled, so a burst of Syncs cannot stack writes on the same
	 property. ]]
local function setProgress(ratio: number)
	local fill = meterFill
	if not fill then
		return
	end
	local running = fillTween
	if running then
		running:Cancel()
		fillTween = nil
	end
	local target = UDim2.new(math.clamp(ratio, 0, 1), 0, 1, 0)
	local tween = TweenService:Create(
		fill,
		TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ Size = target }
	)
	fillTween = tween
	tween:Play()
end

--[[ What the badge shows: a step NUMBER for the onboarding chain, a GLYPH for everything else.

	 Without this, `tostring(math.min(step.index, DONE_INDEX - 1))` prints "3" on every
	 contextual objective — the chip would say "3  PACK FULL — SELL", which reads as a step in a
	 chain that ended.

	 THERE IS NO SECOND TABLE HERE, and that is deliberate. Zone tints come from `Config.Zones`
	 and upgrade glyphs from `Config.Upgrades`, both already shared with the server, so the
	 client and server cannot drift on the SUBJECT of an objective — only on the four fixed
	 kinds, which are literals in this one function. That is the F-16/F-29 lesson applied
	 before the fact rather than after it.

	 An unknown prefix hides the badge and warns. That degrades visibly rather than silently:
	 this module's own header records that a `UIListLayout` lays out every VISIBLE child, so an
	 invisible badge simply leaves title and capsule correctly spaced. ]]
local function badgeArt(id: string): (string?, Color3?)
	local kind, subject = string.match(id, "^(%a+):(.+)$")
	if not kind then
		return nil, nil
	end
	if kind == "sell" then
		-- Two sells, two meanings: `sell:full` is a block and takes the danger colour the gauge
		-- and the pulsing SELL button already use; `sell:goal` is an opportunity and takes the
		-- coin colour it is earning toward.
		return "coin", if subject == "full" then Palette.UI.Close else Palette.UI.HardCurrency
	elseif kind == "save" then
		-- Matches the capsule fill, so the badge and the bar underneath it agree.
		return "coin", Palette.UI.SoftCurrency
	elseif kind == "unlock" or kind == "explore" then
		local zone = Config.zoneById(subject)
		return (if kind == "unlock" then "lock" else "arrow"), (zone and zone.AccentColor or nil)
	elseif kind == "buy" then
		local up = Config.upgradeById(subject)
		return (up and up.Icon or nil), Palette.UI.Buy
	end
	return nil, nil
end

--[[ Draw the badge for a step. Returns nothing; it mutates the badge in place.

	 THE BADGE'S SURFACE FILL NEVER CHANGES. `Theme.surface` builds its gradient from its own
	 gold and a `UIGradient` multiplies, so tweening the badge itself to green renders muddy
	 olive — this module already records that under `transition`. The colour therefore moves to
	 the GLYPH via `Icons.draw`'s accent, and the one case that must shout (`sell:full`) gets it
	 from the chip, whose gradient is explicitly a neutral grey ramp so it CAN be recoloured. ]]
local glyphBox: Frame? = nil

local function decorateBadge(step: Step, badgeLabel: TextLabel)
	local existing = glyphBox
	if existing then
		existing:Destroy()
		glyphBox = nil
	end

	if step.index <= #Config.Objectives then
		-- The onboarding chain keeps its number, byte-identical to what shipped.
		badgeLabel.Text = tostring(step.index)
		badgeLabel.Visible = true
		return
	end

	local art, tint = badgeArt(step.id)
	if not art or not Icons then
		local badge = stepBadge
		if badge then
			badge.Visible = false
		end
		--[[ A missing Icons module already warned once at module scope, so saying it again on
			 every paint would bury the message it is meant to carry. An id the badge has no art
			 for is different — that is a resolver kind this function was never taught, which is
			 a code gap rather than an install gap, and it is worth one line per paint. ]]
		if Icons and step.id ~= "" then
			warn(`[CrystalCanyon] Objective: no badge art for "{step.id}"; drawing without one`)
		end
		return
	end

	local badge = stepBadge
	if badge then
		badge.Visible = true
	end
	badgeLabel.Text = ""
	badgeLabel.Visible = false
	if badge then
		glyphBox = Icons.draw(badge, art, {
			size = UDim2.fromScale(0.62, 0.62),
			fill = tint,
			accent = tint,
			zIndex = badge.ZIndex + 2,
		})
	end
end

local function paint(step: Step)
	local frame, title, count, badgeLabel, track = chip, titleLabel, countLabel, stepLabel, capsule
	if not (frame and title and count and badgeLabel and track) then
		return
	end

	-- A finished chain has no chip. §6 keeps the centre of the screen empty, and
	-- an empty pill parked at the top is exactly the kind of leftover furniture
	-- that rule exists to prevent.
	if step.complete then
		frame.Visible = false
		return
	end

	title.Text = step.text
	decorateBadge(step, badgeLabel)

	-- A "0/1" on a one-shot step ("SELL AT THE GOLD PAD") is noise, so the
	-- capsule only appears where counting is actually the instruction.
	if step.target > 1 then
		count.Text = Util.comma(step.progress) .. "/" .. Util.comma(step.target)
		track.Visible = true
		setProgress(step.progress / step.target)
	else
		count.Text = ""
		track.Visible = false
	end
	frame.Visible = true
end

--[[ An offset inside a UIScale'd cluster renders at `scale * offset`, so a shift
	 of N screen pixels is N / scale in the units Position.Offset speaks. Hud puts
	 a UIScale on the mount and drives it from the viewport; walk the chain and
	 read it rather than importing Hud's number, so the two cannot drift apart.
	 Starts at the PARENT: a UIScale on the chip itself would scale the chip's
	 contents, not the space its own Position is expressed in. ]]
local function localScale(frame: GuiObject): number
	local total = 1
	local node: Instance? = frame.Parent
	while node and not node:IsA("LayerCollector") do
		if node:IsA("GuiObject") then
			local scale = node:FindFirstChildOfClass("UIScale") :: UIScale?
			if scale then
				total *= scale.Scale
			end
		end
		node = node.Parent
	end
	-- A zero scale would turn the slide into infinity. Hud never sets one, but a
	-- divide by it would strand the chip permanently, so refuse it here.
	return if total > 0.05 then total else 1
end

local function homeAt(offsetX: number): UDim2
	return UDim2.new(0.5, offsetX, 0, CHIP_TOP)
end

--[[ Returns (exitLeft, enterRight): the two Position offsets, in the chip's own
	 units, that park it fully outside the left and right edges of the VIEWPORT.

	 The mount's width must not appear in either number, and that is the whole
	 point of this function. Two earlier versions got it wrong in the same way
	 from opposite directions:

	   • The first expressed the slide as a fraction of the parent
	     (`UDim2.new(-0.35, ...)`). Hud mounts the chip inside a cluster that is
	     clamp(viewport * 0.34, 300, 480) px wide, so on a 1920px client the chip
	     stopped at x ≈ 552 — still fully on screen — blanked there, and re-entered
	     from x ≈ 1368, also on screen. The player saw it jump sideways and pop in
	     and out over the playfield, which is exactly the centre-of-screen
	     furniture §6 exists to prevent.
	   • The second measured in pixels but took the chip's WIDTH as
	     `max(chip, mount)`, so the mount's 480px still leaked into the distance.
	     That one over-travels rather than under-travels, so it looks fine — but
	     it means the animation silently changes if the HUD's cluster is ever
	     resized, which is the same class of bug waiting to happen again.

	 What is left uses the mount for one thing only, and only because it is the
	 definition rather than an approximation: the chip's home CENTRE. AnchorPoint
	 0.5 with Position scale 0.5 means "the centre of my parent", so that is what
	 home is. Everything else — the travel, the chip's own width — is measured off
	 the chip and the viewport. A mount that is not a GuiObject at all (the boot
	 script's ScreenGui fallback) falls back to the centre of the screen, which is
	 where a full-bleed mount puts the chip anyway. ]]
local function travel(frame: Frame): (number, number)
	local camera = workspace.CurrentCamera
	local viewport = camera and camera.ViewportSize.X or 0
	if viewport <= 0 then
		return -FALLBACK_SLIDE, FALLBACK_SLIDE
	end

	local scale = localScale(frame)

	local parent = frame.Parent
	local centre = viewport / 2
	if parent and parent:IsA("GuiObject") and parent.AbsoluteSize.X > 0 then
		centre = parent.AbsolutePosition.X + parent.AbsoluteSize.X / 2
	end

	--[[ AutomaticSize reports 0 for a frame that has not been laid out yet. The
		 stand-in is a constant of this module, not the mount's width: over-
		 travelling is invisible, under-travelling is the bug. ]]
	local width = frame.AbsoluteSize.X
	if width < 1 then
		width = math.min(viewport, ASSUMED_CHIP_WIDTH * scale)
	end

	-- Out to the left: the chip's RIGHT edge has to pass x = 0.
	-- In from the right: the chip's LEFT edge has to start past x = viewport.
	return -(centre + width / 2 + EXIT_MARGIN) / scale, (viewport - centre + width / 2 + EXIT_MARGIN) / scale
end

local apply -- forward declared; the transition tail re-enters it with `pending`
-- Forward declared for the same reason: `apply` dispatches to these, and they are defined
-- below it so they can call `paint` and `travel`.
local collapse
local appear
local swap

local function releaseAndReplay()
	busy = false
	local queued = pending
	pending = nil
	if queued then
		apply(queued)
	end
end

--[[ Completion hand-off: flash the finished step green with a tick, slide it
	 out to the left, then bring the next step in from the right. Runs on its own
	 task because it yields; `busy` is what keeps a second one from starting. ]]
local function transition(nextStep: Step)
	local frame, badge, tick, number, track = chip, stepBadge, tickArt, stepLabel, capsule
	if not (frame and badge and tick and number and track) then
		return
	end

	busy = true
	task.spawn(function()
		--[[ The badge becomes the tick rather than a tick appearing beside it.
			 The chip's UIListLayout owns the row, so a fourth child would shove
			 the title sideways at the exact moment the player is reading it. ]]
		number.Visible = false
		tick.Visible = true
		track.Visible = false

		--[[ A punch on the badge as the tick lands: the moment a step is satisfied
			 should be felt rather than merely rendered. The UIScale is found before
			 it is created, so a player who finishes all three steps does not end up
			 with three of them stacked on one badge — the same rule `Effects.pulse`
			 follows for the currency counters. ]]
		local punch = badge:FindFirstChildOfClass("UIScale")
		if not punch then
			punch = Instance.new("UIScale")
			punch.Parent = badge
		end
		local scale = punch :: UIScale
		scale.Scale = 0.72
		TweenService:Create(scale, TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 })
			:Play()

		--[[ Only the CHIP goes green, never the badge — and colour is TWEENED,
			 never re-styled (`Palette.styleText` attaches a new UIStroke on every
			 call, so calling it from a per-transition path would leak one stroke per
			 completed objective).

			 The chip's gradient is a neutral grey ramp, so recolouring it shades the
			 new hue correctly. The badge is a `Theme.surface` whose gradient is
			 built from its own gold, and a UIGradient multiplies — so tweening the
			 badge to green would render it a muddy olive. The tick swapping in is
			 what marks the badge done. ]]
		TweenService:Create(frame, TweenInfo.new(0.18), { BackgroundColor3 = Palette.UI.Buy }):Play()

		task.wait(TICK_HOLD)

		-- Measured now, while the finished step is still the thing on screen: this
		-- distance has to clear the width the player is actually looking at.
		local exitLeft = travel(frame)
		local out = TweenService:Create(
			frame,
			TweenInfo.new(SLIDE_OUT, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ Position = homeAt(exitLeft) }
		)
		out:Play()
		out.Completed:Wait()

		tick.Visible = false
		number.Visible = true
		frame.BackgroundColor3 = CHIP_FILL
		-- `apply` records shownIndex/shownId BEFORE dispatching, so writing it again here
		-- would be a second authority over one value for no benefit.

		if nextStep.complete then
			-- Chain finished. The chip does not linger as an empty pill; the
			-- centre of the screen goes back to the world.
			frame.Visible = false
			frame.Position = HOME
			releaseAndReplay()
			return
		end

		paint(nextStep)
		--[[ The new step's text is a different width, and AutomaticSize only
			 resolves on the next layout pass, so yield one frame before measuring
			 the entry distance. The chip is off-screen left for that frame, so the
			 wait costs the player nothing. ]]
		task.wait()
		local _, enterRight = travel(frame)
		frame.Position = homeAt(enterRight)
		local incoming = TweenService:Create(
			frame,
			TweenInfo.new(SLIDE_IN, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ Position = HOME }
		)
		incoming:Play()
		incoming.Completed:Wait()

		releaseAndReplay()
	end)
end

--[[ THREE MORE MOTIONS, and why they are not one.

	 §3 makes the objective chip a thing that comes and goes and changes its mind, so it needs
	 vocabulary for arriving, leaving, and being replaced. Sharing `transition` for all of them
	 would mean a green flash and a tick every time the player filled their pack, which would
	 spend the celebration the onboarding hand-off is built on.

	 All three set `busy` and end in `releaseAndReplay()`, so the existing newest-wins hand-off
	 covers every one — a Sync arriving mid-motion is queued and replayed, never dropped and
	 never interleaved. `collapse` in particular MUST set `busy`: without it a Sync landing
	 mid-collapse would `paint` a chip that is on its way to hidden, and leave it hidden with
	 new text in it.

	 `COLLAPSE_TIME` is shorter than `APPEAR_TIME` on purpose. Something leaving should get out
	 of the way; something arriving is asking to be read. ]]
local COLLAPSE_TIME = 0.18
local APPEAR_TIME = 0.26

--[[ Nothing left to do: shrink to nothing and fade, from the chip's own centre.

	 Scale rather than a slide, because a slide means "replaced by the next one" in this
	 module's existing vocabulary and there is no next one. The UIScale is found before it is
	 created, the same rule `transition`'s punch follows, so repeated collapses cannot stack. ]]
function collapse()
	local frame = chip
	if not frame then
		return
	end
	busy = true
	task.spawn(function()
		local shrink = frame:FindFirstChildOfClass("UIScale")
		if not shrink then
			shrink = Instance.new("UIScale")
			shrink.Parent = frame
		end
		local scale = shrink :: UIScale
		local tween = TweenService:Create(
			scale,
			TweenInfo.new(COLLAPSE_TIME, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ Scale = 0.82 }
		)
		tween:Play()
		tween.Completed:Wait()
		frame.Visible = false
		frame.Position = HOME
		-- Reset for the next appear, so a chip that comes back does not come back small.
		scale.Scale = 1
		releaseAndReplay()
	end)
end

--[[ Something to do again: paint it, then grow it in. ]]
function appear(step: Step)
	local frame = chip
	if not frame then
		return
	end
	busy = true
	task.spawn(function()
		paint(step)
		frame.Position = HOME
		local grow = frame:FindFirstChildOfClass("UIScale")
		if not grow then
			grow = Instance.new("UIScale")
			grow.Parent = frame
		end
		local scale = grow :: UIScale
		scale.Scale = 0.82
		frame.Visible = true
		local tween = TweenService:Create(
			frame:FindFirstChildOfClass("UIScale") :: UIScale,
			TweenInfo.new(APPEAR_TIME, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ Scale = 1 }
		)
		tween:Play()
		tween.Completed:Wait()
		releaseAndReplay()
	end)
end

--[[ A different objective at the same rank: out to the left, in from the right.

	 This is `transition` with the celebration removed — no tick, no green, no hold — because
	 the player did not finish anything, the game changed its advice. Same measured travel, so
	 the two motions read as members of one family rather than as two different animations that
	 happen to move the same object. ]]
function swap(step: Step)
	local frame = chip
	if not frame then
		return
	end
	busy = true
	task.spawn(function()
		local exitLeft = travel(frame)
		local out = TweenService:Create(
			frame,
			TweenInfo.new(SLIDE_OUT, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ Position = homeAt(exitLeft) }
		)
		out:Play()
		out.Completed:Wait()

		paint(step)
		-- One frame for AutomaticSize to resolve the new text's width before measuring the
		-- entry distance, exactly as `transition` does and for the same reason. The chip is
		-- off-screen left for that frame, so the wait costs the player nothing.
		task.wait()
		local _, enterRight = travel(frame)
		frame.Position = homeAt(enterRight)
		local incoming = TweenService:Create(
			frame,
			TweenInfo.new(SLIDE_IN, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ Position = HOME }
		)
		incoming:Play()
		incoming.Completed:Wait()
		releaseAndReplay()
	end)
end

function apply(state: any)
	local frame = chip
	if not frame then
		return
	end

	local step = readStep(state)
	if not step then
		-- No usable objective record. Leaving the chip untouched is the only
		-- honest option: a malformed snapshot is not evidence of progress.
		return
	end

	local prevIndex, prevId = shownIndex, shownId
	shownIndex, shownId = step.index, step.id

	if prevIndex == 0 then
		-- First paint of the session: land on the current step with no
		-- celebration. A returning player must not be congratulated on load for
		-- objectives they finished days ago. A snap, not an animation — motion on
		-- join is furniture, and it is one less sub-case to sample.
		if step.complete then
			frame.Visible = false
		else
			paint(step)
			frame.Position = HOME
		end
		return
	end

	if step.complete then
		--[[ Nothing left to do. This is now genuinely rare — it means every zone is owned,
			 visited, and every upgrade is maxed — where it used to fire the instant onboarding
			 ended. It COLLAPSES rather than blinking out, because the chip is a persistent
			 object on the screen and an object that vanishes between frames reads as a bug. ]]
		if frame.Visible then
			collapse()
		else
			frame.Position = HOME
		end
		return
	end

	if not frame.Visible then
		-- Coming back from empty: something became purchasable again (a code redeemed, a
		-- new zone added). Appear rather than snap, for the same reason collapse exists.
		appear(step)
		return
	end

	--[[ THE CHAIN ADVANCE, unchanged and deliberately still first.

		 `prevIndex <= #Config.Objectives` is what keeps this to the onboarding chain: every
		 contextual objective carries the sentinel, so `step.index > prevIndex` is structurally
		 false between them and the celebration cannot fire on a routine swap.

		 It still fires on the LAST chain step, which is the property worth having. Finishing
		 step 3 now pushes the sentinel with `complete = false` and a contextual objective, so
		 `transition` runs its tick, green flash, hold and slide-out — and then its existing
		 tail paints the contextual step and slides it back in. The hand-off from onboarding to
		 the contextual HUD works with zero changes to `transition`. ]]
	if step.index > prevIndex and prevIndex <= #Config.Objectives then
		transition(step)
		return
	end

	if step.id ~= prevId then
		-- A different objective at the same rank: swap it out and in, without the celebration.
		swap(step)
		return
	end

	-- Same objective, new progress: the cheap path, and the common one, running on every Sync
	-- while the player is collecting.
	paint(step)
end

--[[ Called with the whole `Sync` snapshot. Safe to call at Sync frequency. ]]
function Objective.render(state: any)
	if typeof(state) ~= "table" then
		return
	end
	if busy then
		pending = state -- newest wins; stale snapshots are worthless by then
		return
	end
	apply(state)
end

return Objective
