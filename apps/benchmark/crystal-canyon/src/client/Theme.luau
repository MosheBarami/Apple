--!strict
--[[
	Crystal Canyon — Theme: the simulator DESIGN SYSTEM.

	Every surface this game draws is built here. That was already true; what
	changed is what "a surface" means. The previous version handed out rounded
	rectangles with an outline on them, and the owner's verdict on the result was
	blunt: too many plain black pills, weak panel personality, limited depth,
	limited motion feedback, no cohesion with a colourful simulator world.

	The fix is not more decoration. It is that a surface in this category is a
	MOULDED OBJECT, and a moulded object is built from five layers, always in
	this order, bottom to top:

	    1. drop shadow   solid dark shape, offset down-right, low transparency —
	                     never a soft glow, never a blur (§3 forbids both)
	    2. outline       thick near-black, and it does not thin down (§2)
	    3. body          vertical gradient, lighter top / deeper bottom (§3)
	    4. hard edge     a darker band of the SAME hue along the lower edge —
	                     this, not the shadow, is what reads as thickness (§3)
	    5. highlight     a thin light bar inset along the TOP edge, which is what
	                     turns a flat fill into something with a lit face

	`surfaceLayers` below is the one function that applies all five, and
	`Theme.surface` is its public door. Buttons, cards, counters, panel headers
	and the panel itself all go through it, which is why they now read as one
	family instead of five separately-tuned frames.

	--- the direction change: dark is INK, not PAINT ---

	The pass after that one was rejected again, and this time the note was about
	WHERE the dark goes: "too much black surface area", "currency counters
	dominate with large dark pills", "side navigation feels like unrelated
	coloured circles". Every one of those is the same mistake — near-black was
	being used as the default *fill* of a surface rather than as the line around
	one.

	So the rule this file now enforces is:

	    dark is for OUTLINE, SHADOW and CONTRAST. It is not a fill.

	A surface's fill is the colour of the thing it represents. A currency
	counter is the currency's own colour with white outlined numerals on it
	(`Theme.counter`); a nav tile is its section's colour; the primary action is
	the brightest object on the screen (`Theme.actionButton`). Near-black appears
	as the 3–4px stroke, the offset shadow plate, the hard bottom edge — and, in
	the one place a fill is still justified, as `Theme.well`: a translucent inset
	recess that sits BEHIND a number to lift it off a saturated body. A well is
	shading, not a surface, so it is thin, it is see-through, and it never grows
	into the pill it is drawn inside.

	`Theme.Accent` is the other half of the answer. The owner's second note was
	that the world and the UI "do not feel fully connected", so the HUD's
	structural colours are no longer invented neutrals (a cool slate rail, a
	charcoal chip) — they are read straight out of §7's WORLD palette: the sand
	of the plaza floor for group plates, canyon rust and warm ink for recesses,
	moss green for the primary action, and the cyan/violet of the crystals the
	player is actually collecting for the nav. `Theme.groupPlate` is the one
	primitive that carries that stone: the wallet, the nav rail and the sell
	mount are all the same carved slab, which is what makes three clusters read
	as one interface.

	Section numbers in comments refer to docs/ROBLOX-STYLE-SPEC.md.

	Six decisions below are not obvious and are worth reading before editing.

	1. TOKENS, NOT TUNING. `Theme.Spacing`, `Theme.Radius`, `Theme.Edge` and
	   `Theme.Type` are the scales. Panels used to pick its own paddings per
	   modal; anything that wants a gap now names one of these. Two values in
	   the spacing scale (Snug = 12, Base = 14) are load-bearing: Panels measures
	   card interiors against exactly those numbers (`CARD_PAD_Y`, `CARD_PAD_X`),
	   so they are a contract with that file, not free parameters.

	2. BUTTONS CARRY TWO PIECES OF TEXT MACHINERY. The button's own `Text` is the
	   public API — callers do `btn.Text = "SELL"` and expect it to work — but its
	   single UIStroke is already spent on the silhouette (ApplyStrokeMode.Border),
	   so it cannot also carry the heavy contextual stroke §4 demands on type.
	   The caption therefore lives in a child TextLabel with its own stroke, the
	   button's native text is made invisible, and a property-changed connection
	   mirrors one into the other.

	3. DISPLAY TYPE IS TWO LABELS, AND THE *SHADE* IS THE OUTER ONE. §4 asks for
	   white fill + black outline + drop shadow. A child always draws above its
	   parent in Roblox, so a shadow cannot be a child of the label it sits under.
	   It has to be the parent. So `displayText` returns a dark "shade" label and
	   parents a white "face" label inside it, offset upward by the shadow
	   distance. The shade is the instance callers hold: `Theme.counter` returns
	   it, `Theme.sectionLabel` returns it, and a caption's `Caption` child is it.
	   Writing `.Text` on the shade mirrors into the face automatically, so the
	   whole arrangement is invisible from outside — Hud can still resize
	   `button.Caption` and set `counterLabel.Text` exactly as before.

	4. PRESSED MUST PHYSICALLY SINK. A chunky button reads as depressed when its
	   hard bottom edge shrinks AND its face moves down by the same number of
	   pixels — do one without the other and it reads as a colour change. So
	   `wireFeedback` shrinks the edge from `Edge.Rest` to `Edge.Pressed` and
	   offsets every face child down by the difference. The offset is applied as
	   a *delta* against the child's current position rather than against a
	   remembered base, so a caller that repositioned the caption (Hud insets the
	   SELL caption to make room for a shard icon) is not stomped.

	5. THE DROP SHADOW IS A SIBLING, AND IS SKIPPED INSIDE LAYOUTS. It cannot be
	   a child (see 3), so it is a sibling plate mirroring the target's geometry.
	   That is safe everywhere except inside a UIListLayout or UIGridLayout, which
	   would lay the plate out as a cell of its own — a phantom gap in the shop
	   grid. So `attachShadow` refuses when the parent owns a UILayout, and those
	   surfaces fall back on the hard bottom edge, which is the category's
	   primary depth device anyway (§3). Panels' scrollers and grids all create
	   their layout before their children, so the check sees the truth.

	6. PANELS ARE SIZED BY SCALE AND CLAMPED IN PIXELS. A fixed 700px panel is
	   unusable on a phone; a pure 60%-scale panel is unreadably narrow on one.
	   The panel picks a scale appropriate to the viewport and a UISizeConstraint
	   guarantees it can never exceed the screen.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")
local RealTweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Palette = require(Shared:WaitForChild("Palette") :: ModuleScript)
local Util = require(Shared:WaitForChild("Util") :: ModuleScript)

local Theme = {}

--------------------------------------------------------------------------------
-- REDUCED MOTION
--------------------------------------------------------------------------------
--[[ §O requires reduced-motion support and §AL lists it under accessibility. It
	 did not exist: all 31 tween sites across the five client modules played
	 unconditionally, so a player who has asked their device for less motion got
	 every overshoot, pop, burst and number rollup anyway.

	 The gate is implemented as a DROP-IN REPLACEMENT for TweenService rather than
	 as a branch at each call site. Every site already writes
	 `TweenService:Create(obj, info, goal):Play()`, so swapping what `TweenService`
	 names in a module converts all of that module's sites at once, and — more
	 importantly — a site added later is covered without anyone remembering to.
	 A rule you have to remember at 31 places is a rule that will be missed.

	 Reduced motion does NOT mean "no feedback". The END STATE is still applied,
	 immediately: a currency counter still reaches the new number, a panel still
	 reaches full size, a toast still appears and still leaves. What is removed is
	 the travel between those states. Suppressing the outcome as well would make
	 the interface look broken to exactly the players who asked for calm.

	 `Completed` still fires, because callers use it to clear their own state —
	 `Theme.close` hides the panel in that handler, so a tween that never reports
	 completion leaves a panel visible forever. It fires deferred rather than
	 synchronously so a caller that connects AFTER calling Play() still hears it.  ]]
function Theme.reducedMotion(): boolean
	-- Wrapped: ReducedMotionEnabled is a newer GuiService member and a client on an
	-- older engine should get full motion, not an error.
	local ok, enabled = pcall(function()
		return GuiService.ReducedMotionEnabled
	end)
	return ok and enabled == true
end

local InstantTween = {}
InstantTween.__index = InstantTween

function InstantTween.new(target: Instance, goal: { [string]: any }, info: TweenInfo?)
	local signal = Instance.new("BindableEvent")
	return setmetatable({
		_target = target,
		_goal = goal,
		_info = info,
		_signal = signal,
		_done = false,
		Completed = signal.Event,
		PlaybackState = Enum.PlaybackState.Begin,
	}, InstantTween)
end

--[[ A REVERSING LOOP HAS NO END STATE AT THE GOAL — it rests where it started.

	 `TweenInfo.new(0.55, Sine, InOut, -1, true)` is the pack-full pulse: it runs
	 forever and returns to its origin on every cycle. Applying its GOAL under
	 reduced motion parks the sell plate permanently at Scale 1.14 — a UI stuck
	 mid-gesture, which is a worse outcome than the animation it replaced.

	 So the goal is applied only for tweens that actually settle on it. A looping
	 reverse is simply not played, which is the honest reduced-motion answer: the
	 gesture conveyed attention, and attention is exactly what a player asking for
	 less motion has opted out of. The STATE it decorated is unaffected. ]]
local function settlesOnGoal(info: TweenInfo?): boolean
	if not info then
		return true
	end
	local repeats = info.RepeatCount
	return not (info.Reverses and repeats ~= 0)
end

function InstantTween:Play()
	if settlesOnGoal(self._info) then
		for property, value in pairs(self._goal) do
			-- pcall so one unsettable property cannot strand the whole goal, which a
			-- real tween would also survive.
			pcall(function()
				(self._target :: any)[property] = value
			end)
		end
	end
	if self._done then
		return
	end
	self._done = true
	self.PlaybackState = Enum.PlaybackState.Completed
	local signal = self._signal
	task.defer(function()
		signal:Fire(Enum.PlaybackState.Completed)
	end)
end

--[[ Cancel must REPORT, not just stop.

	 `Theme.close` hides the panel in its Completed handler and returns early when
	 the state is anything but Completed — "cancelled by a re-open; that open owns
	 the panel now". A Cancel that fires nothing leaves that guard unable to fire,
	 so under reduced motion a re-open's panel would be hidden by the close it
	 interrupted. The guard exists precisely for this and was unreachable here. ]]
function InstantTween:Cancel()
	self.PlaybackState = Enum.PlaybackState.Cancelled
	if self._done then
		return
	end
	self._done = true
	local signal = self._signal
	task.defer(function()
		signal:Fire(Enum.PlaybackState.Cancelled)
	end)
end

function InstantTween:Pause() end

--[[ Same `:Create(target, info, goal)` shape as TweenService, so a module adopts
	 it by changing ONE line: `local TweenService = Theme.motion`. ]]
Theme.motion = {
	Create = function(_self, target: Instance, info: TweenInfo, goal: { [string]: any })
		if Theme.reducedMotion() then
			return InstantTween.new(target, goal, info)
		end
		return RealTweenService:Create(target, info, goal)
	end,
}

-- Theme's own sites go through the gate too. Declared after `Theme.motion` so the
-- name below refers to the gate, not to the service.
local TweenService = Theme.motion

--------------------------------------------------------------------------------
-- design tokens
--------------------------------------------------------------------------------

--[[ ONE spacing scale for the whole client. Before this existed every panel
	 invented its own paddings, which is half of why the UI read as five separate
	 screens rather than one product.

	 `Snug` (12) and `Base` (14) are not arbitrary: Panels measures a card's
	 interior as `width - CARD_PAD_X * 2` with CARD_PAD_X = 14 and CARD_PAD_Y =
	 12. `Theme.card` pads by exactly those, so changing either number here
	 silently mis-measures every card in the game. Change both together or not
	 at all. ]]
Theme.Spacing = {
	Hair = 4,
	Tight = 8,
	Snug = 12, -- card padding, vertical  (Panels.CARD_PAD_Y)
	Base = 14, -- card padding, horizontal (Panels.CARD_PAD_X)
	Room = 18, -- panel body padding
	Loose = 24,
	Section = 32,
}

--[[ ONE corner scale. §3 wants ~12–20px on panels and full pills on buttons;
	 anything smaller than `Chip` starts to read as a web UI rather than a
	 moulded toy, which is the failure mode the owner named. ]]
Theme.Radius = {
	Chip = UDim.new(0, 8),
	Button = Palette.Radius.Button,
	Card = Palette.Radius.Card,
	Panel = Palette.Radius.Panel,
	Pill = Palette.Radius.Pill,
	Icon = Palette.Radius.Icon,
}

--[[ §3 depth, in pixels. `Rest` is how thick a control looks; `Pressed` is how
	 thick it looks while held, and the difference is exactly how far its face
	 travels down (decision 4). ]]
Theme.Edge = {
	Rest = 6,
	Pressed = 2,
	Card = 5,
	Counter = 6,
	Header = 7,
	Panel = 9,
	-- The primary action is physically the thickest control on the screen. Depth
	-- is the category's way of saying "this is the button", and it costs nothing
	-- in noise — unlike a second colour or a permanent animation.
	Action = 8,
}

--[[ The drop shadow (decision 5). Solid, offset, low transparency — a shape,
	 not a glow. Roblox has no blur worth using here and §3 forbids one anyway. ]]
Theme.Shadow = {
	Offset = Vector2.new(5, 7),
	Transparency = 0.62,
	PanelOffset = Vector2.new(8, 12),
	PanelTransparency = 0.46,
	-- Cast further and darker than a normal control's, so the primary action
	-- sits visibly ABOVE the plate it is mounted on.
	ActionOffset = Vector2.new(6, 9),
	ActionTransparency = 0.54,
}

--[[ §4 typography. `ShadeDrop` is the distance the white face is lifted above
	 its dark shade, i.e. the visible drop-shadow distance on display type. ]]
Theme.Type = {
	Title = Palette.TextSize.Title,
	Section = Palette.TextSize.Section,
	Card = Palette.TextSize.Card,
	Button = Palette.TextSize.Button,
	Counter = Palette.TextSize.Counter,
	Small = Palette.TextSize.Small,
	-- One step above a normal button. "SELL SHARDS" is the sentence the whole
	-- HUD exists to make the player read, and it was reported as visually muted.
	Action = 26,
	-- Captions under an icon. The owner's note was literally "labels under icons
	-- are tiny", so this is a named size rather than a number typed at a call
	-- site, and it is deliberately only two steps below body type.
	Label = 15,
	ShadeDrop = 2,
	-- The shade is near-black but not the outline colour: identical values make
	-- the shadow disappear into the 3px stroke and the type looks flat again.
	ShadeColor = Color3.fromRGB(24, 20, 30),
	ShadeTransparency = 0.25,
}

--[[ THE WORLD'S PALETTE, READ INTO THE INTERFACE.

	 "World and UI art direction do not feel fully connected" was a named defect,
	 and the cause was that the HUD's structural colours were invented in the HUD
	 — a cool slate rail, a charcoal caption chip, a neutral dark counter — none
	 of which appear anywhere in the canyon the player is standing in.

	 Every value below is the UI reading of something that exists in §7's world
	 palette, and that correspondence is the point:

	   Stone / StoneDeep   the sand plaza floor. Group plates are carved out of
	                       it, which is what lets the HUD hold saturated controls
	                       without any large black surface behind them.
	   Canyon / Ink        the rust cliff at its deepest. Wells, medallion rims
	                       and ink captions use these instead of a neutral black,
	                       so even the darks are warm and belong to the place.
	   Moss / Action       the grass. Action is the lit face of it and is the
	                       brightest colour this file will draw.
	   CrystalCyan/Violet  the two crystal colours the player actually collects
	                       (Config.Zones[].CrystalColor). The nav wears them, so
	                       the menu is coloured by the game's own subject.

	 These are UI tokens, not world tokens: they are tuned for type contrast on
	 a screen, not for how a part looks under sunlight. Palette.World stays the
	 authority for anything built out of parts. ]]
Theme.Accent = {
	Stone = Color3.fromRGB(228, 206, 166),
	StoneDeep = Color3.fromRGB(191, 163, 118),
	Canyon = Color3.fromRGB(74, 44, 36),
	Ink = Color3.fromRGB(38, 28, 24),
	Rust = Color3.fromRGB(181, 83, 58),
	Moss = Color3.fromRGB(95, 201, 74),
	Action = Color3.fromRGB(92, 222, 74),
	CrystalCyan = Color3.fromRGB(76, 198, 244),
	CrystalViolet = Color3.fromRGB(163, 124, 238),
	Amber = Color3.fromRGB(245, 190, 60),
}

Theme.Metrics = {
	HeaderHeight = 68,
	CloseSize = 52,
	OrnamentSize = 44,
	ButtonHeight = 54,
	ActionHeight = 72,
	IconButton = 70,
	CounterHeight = 46,
	-- Inner padding of a group plate: how far its contents sit inside the stone.
	PlatePad = 10,
}

-- Below this viewport width the panel switches to a near-full-bleed layout.
-- A 60%-wide modal on a 390pt phone is a column of clipped words.
local NARROW_VIEWPORT = 700

local PANEL_SCALE_WIDE = UDim2.fromScale(0.60, 0.68)
local PANEL_SCALE_NARROW = UDim2.fromScale(0.94, 0.80)
local PANEL_MAX = Vector2.new(820, 680)
local PANEL_MIN = Vector2.new(280, 240)
local BACKDROP_DIM = 0.45

--[[ §5's construction diagram draws a black rule between the saturated header
	 bar and the white body, and §2 wants the header outlined like every other
	 surface. Both come from one Border-mode UIStroke on the header — see the
	 note in Theme.panel — and a Border stroke is drawn entirely OUTSIDE its
	 object, so the body has to start this many pixels further down or it would
	 simply cover the rule. Keep this equal to the header's stroke thickness. ]]
local HEADER_RULE = Palette.Outline.Panel

-- Modals sit above the HUD. ScreenGui ZIndexBehavior is Sibling, so this only
-- has to beat the HUD's own root frames, not every descendant.
local Z_BACKDROP = 50

--------------------------------------------------------------------------------
-- colour helpers
--------------------------------------------------------------------------------

--[[ Blend two colours. Used to tint neutrals toward a hue rather than replacing
	 them, which is how a counter can stay a dark pill (§6) while still belonging
	 to its currency's colour family. ]]
function Theme.mix(a: Color3, b: Color3, k: number): Color3
	return a:Lerp(b, math.clamp(k, 0, 1))
end

--[[ THE COUNTER SURFACE. This one function is the direction change in miniature.

	 It used to blend the currency's hue 58% into near-black, i.e. the number sat
	 on a dark pill with a coloured hint. The owner's verdict on the result was
	 "currency counters dominate with large dark pills", and it was right: the
	 biggest, highest-contrast objects on the screen were black.

	 Now the surface IS the currency. Only 8% is taken off the hue — just enough
	 that white numerals carrying a 3px black stroke sit on a fill rather than
	 glare against a pure highlight tone — so a shard counter reads as gold and a
	 coin counter reads as green from across the room.

	 §6 still gets what it is actually asking for: a rounded currency pill with a
	 minted medallion and a big number. What it no longer gets is the black. ]]
local function counterSurface(hue: Color3): Color3
	return Palette.shade(hue, 0.08)
end

--------------------------------------------------------------------------------
-- primitives
--------------------------------------------------------------------------------

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ A surface should always draw above whatever it was parented into. Sibling
	 ZIndexBehavior would let this slide, but a ScreenGui left on the legacy
	 Global behaviour draws by absolute ZIndex, and then a button whose children
	 sat at the default 1 would vanish underneath its own panel. ]]
local function zAbove(parent: Instance): number
	if parent:IsA("GuiObject") then
		return parent.ZIndex + 1
	end
	return 1
end

--[[ §3 body gradient: lighter top, deeper bottom. Three stops rather than two —
	 a straight two-stop ramp reads as a wash, whereas holding the true fill
	 across the middle and only lifting/deepening the extremes reads as a curved,
	 moulded face. The gradient multiplies BackgroundColor3, so hover and press
	 can recolour the fill underneath it and the shading survives. ]]
local function bodyGradient(inst: GuiObject, fill: Color3): UIGradient
	local g = Instance.new("UIGradient")
	g.Rotation = 90 -- 0 is left-to-right; 90 runs top-to-bottom
	g.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Palette.lift(fill, 0.22)),
		ColorSequenceKeypoint.new(0.52, fill),
		ColorSequenceKeypoint.new(1, Palette.shade(fill, 0.16)),
	})
	g.Parent = inst
	return g
end

--[[ §3 Depth is a hard bottom edge, not a soft shadow: a darker band of the
	 same hue along the lower edge. `host` must clip, or the band's square ends
	 will punch through the rounded corners.

	 This is deliberately NOT stroked, and an outline audit should not add one:
	 the band is shading *within* the host's silhouette, not a surface of its
	 own. The host already carries the outline that encloses both. ]]
local function hardEdge(host: GuiObject, fill: Color3, thickness: number, darken: number?): Frame
	local edge = Instance.new("Frame")
	edge.Name = "Edge"
	edge.AnchorPoint = Vector2.new(0.5, 1)
	edge.Position = UDim2.fromScale(0.5, 1)
	edge.Size = UDim2.new(1, 0, 0, thickness)
	-- 0.34 on a saturated fill lands on the same hue two shades down, which is
	-- what §3 asks for. A white surface needs far less — shading white by a third
	-- produces a mid-grey strip that reads as a shadow lying on the card rather
	-- than as the card's own edge — so `Theme.card` passes a gentler figure.
	edge.BackgroundColor3 = Palette.shade(fill, darken or 0.34)
	edge.BorderSizePixel = 0
	edge.ZIndex = host.ZIndex
	edge.Parent = host
	return edge
end

--[[ The lit top edge. A thin light bar inset inside the host's top border is
	 what separates "a moulded plastic object" from "a rounded rectangle" — it
	 is the single cheapest cue in this whole file.

	 `widthScale` is 1 for a pill or a rectangle (inset from both ends by the
	 corner radius so the bar does not ride out onto the curve) and a fraction
	 for a circle, where a scale-based width tracks the button through the
	 resizing Hud does after construction. Like the hard edge it is shading
	 inside the host, so it carries no outline of its own. ]]
local function topHighlight(
	host: GuiObject,
	widthScale: number,
	inset: number,
	thickness: number,
	transparency: number
): Frame
	local hi = Instance.new("Frame")
	hi.Name = "Highlight"
	hi.AnchorPoint = Vector2.new(0.5, 0)
	hi.Position = UDim2.new(0.5, 0, 0, math.max(3, thickness - 1))
	hi.Size = UDim2.new(widthScale, -inset * 2, 0, thickness)
	hi.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	hi.BackgroundTransparency = transparency
	hi.BorderSizePixel = 0
	hi.ZIndex = host.ZIndex
	hi.Parent = host
	corner(hi, Theme.Radius.Pill)
	return hi
end

--[[ §3's diagonal sheen band, used on saturated headers. Rotated so it reads as
	 a highlight sweep rather than a stripe; the host's clip trims the overhang.
	 Shading, not a surface — outlining it would draw a black diagonal stripe. ]]
local function sheen(host: GuiObject, height: number, transparency: number): Frame
	local band = Instance.new("Frame")
	band.Name = "Sheen"
	band.AnchorPoint = Vector2.new(0.5, 0.5)
	band.Position = UDim2.fromScale(0.5, 0.3)
	band.Size = UDim2.new(1.7, 0, 0, height)
	band.Rotation = -7
	band.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	band.BackgroundTransparency = transparency
	band.BorderSizePixel = 0
	band.ZIndex = host.ZIndex
	band.Parent = host
	return band
end

--[[ Decision 5: the offset drop shadow. A sibling plate, solid and dark, that
	 mirrors the target's geometry — including Visible, because Panels stacks
	 three action buttons in one spot and shows one at a time, and a shadow left
	 behind a hidden button would be a floating dark smear.

	 Returns nil, deliberately and silently, when the parent runs a UILayout: the
	 plate would be laid out as a cell of its own. Callers in that position get
	 their depth from the hard bottom edge instead, which is what §3 actually
	 asks for. ]]
local function attachShadow(target: GuiObject, radius: UDim, offset: Vector2, transparency: number): Frame?
	local parent = target.Parent
	if not parent or not parent:IsA("GuiObject") then
		return nil
	end
	if parent:FindFirstChildWhichIsA("UILayout") then
		return nil
	end

	local plate = Instance.new("Frame")
	plate.Name = "Shadow"
	plate.BackgroundColor3 = Palette.Outline.Color
	plate.BackgroundTransparency = transparency
	plate.BorderSizePixel = 0
	plate.ZIndex = math.max(0, target.ZIndex - 1)
	plate.Parent = parent
	local plateCorner = corner(plate, radius)

	--[[ The silhouette is not fixed at construction. Hud builds its nav tiles
		 from `Theme.button` — for the press feel and the hard edge — and then
		 reaches in to swap the pill corner for a rounded square, which is a
		 legitimate thing to do to a button. A shadow frozen at the radius it was
		 handed would then be a pill lying behind a square, so it tracks the
		 target's own UICorner instead of the argument it was called with. ]]
	local hostCorner = target:FindFirstChildOfClass("UICorner")
	if hostCorner then
		plateCorner.CornerRadius = hostCorner.CornerRadius
		hostCorner:GetPropertyChangedSignal("CornerRadius"):Connect(function()
			plateCorner.CornerRadius = hostCorner.CornerRadius
		end)
	end

	--[[ AND NEITHER IS THE SIZE, FOR THE SAME REASON. V6.

		 `sync` copies `target.Size`, which is the size the target ASKED for — not the size it
		 got. A `UISizeConstraint` on the target clamps the target and not the plate, so the
		 two diverge silently and the shadow renders at the unclamped figure.

		 That shipped in all four panels. The balance pill is `UDim2.new(0.5, 0, 0, 42)` capped
		 at 268px; on a 754px panel the half-width is 359px, so the plate drew 359 wide behind a
		 268-wide counter — and with `AnchorPoint (1, 0.5)` the surplus 91px hangs off the LEFT,
		 where every other shadow in this kit offsets down-right. A dark tab sticking out of one
		 side of the coin counter, on every panel.

		 Mirroring the constraint fixes it for every caller rather than for this one, which
		 matters because the divergence is invisible until someone measures the two frames. ]]
	--[[ The constraint usually is not there yet, which is the whole reason this is a listener
		 and not a lookup.

		 `Theme.counter` builds the pill AND attaches its shadow, and only then does the caller
		 parent a `UISizeConstraint` to the pill — `balanceStrip` does exactly that. A shadow
		 that only checked at construction would find nothing, mirror nothing, and be wrong from
		 the moment the caller finished the job. The first version of this fix did precisely
		 that and changed nothing, which the measurement caught. ]]
	local plateCap: UISizeConstraint? = nil
	local function mirrorCap(hostCap: UISizeConstraint)
		if plateCap then
			return
		end
		local cap = Instance.new("UISizeConstraint")
		cap.MaxSize = hostCap.MaxSize
		cap.MinSize = hostCap.MinSize
		cap.Parent = plate
		plateCap = cap
		hostCap:GetPropertyChangedSignal("MaxSize"):Connect(function()
			cap.MaxSize = hostCap.MaxSize
		end)
		hostCap:GetPropertyChangedSignal("MinSize"):Connect(function()
			cap.MinSize = hostCap.MinSize
		end)
	end

	local existingCap = target:FindFirstChildOfClass("UISizeConstraint")
	if existingCap then
		mirrorCap(existingCap)
	end
	target.ChildAdded:Connect(function(child: Instance)
		if child:IsA("UISizeConstraint") then
			mirrorCap(child)
		end
	end)

	local function sync()
		local p = target.Position
		plate.Position = UDim2.new(p.X.Scale, p.X.Offset + offset.X, p.Y.Scale, p.Y.Offset + offset.Y)
		plate.Size = target.Size
		plate.AnchorPoint = target.AnchorPoint
		plate.Rotation = target.Rotation
		plate.Visible = target.Visible
	end
	sync()

	-- Mirroring by signal rather than by copying once: every caller in this game
	-- resizes or repositions the thing it just built (Hud widens the counters,
	-- Panels reflows an action button between two layouts, Theme.open tweens a
	-- panel's Size), and a shadow that did not follow would tear off it.
	for _, property in { "Position", "Size", "AnchorPoint", "Rotation", "Visible" } do
		target:GetPropertyChangedSignal(property):Connect(sync)
	end
	target.Destroying:Connect(function()
		plate:Destroy()
	end)

	return plate
end

--[[ Let type shrink to fit a small screen but never grow past the size the
	 design was drawn at — TextScaled alone will happily render a 60px word in a
	 pill built for 22px type. ]]
local function clampText(label: TextLabel, maxSize: number)
	local MIN_SIZE = 10
	--[[ THE ORDER IS LOAD-BEARING, AND THE ORIGINAL ORDER WAS WRONG.

		 This used to read `TextScaled = true` and then `TextWrapped = false`. Setting
		 `TextScaled = true` implicitly turns wrapping ON, and explicitly turning wrapping back
		 OFF silently clears `TextScaled` — so the second line disabled the first, and this
		 function has been INERT since it was written. Measured in a live session: 105 labels
		 across the HUD and every panel carried a `UITextSizeConstraint`, which does nothing at
		 all unless the text is scaled, and not one of them was scaling. The "let type shrink to
		 fit a small screen" this comment promises had never once happened.

		 The fix is to stop writing `TextWrapped` here. The engine owns it under `TextScaled`
		 and forces it true; at these sizes the text still lays out on one line, because it
		 shrinks to fit before it has any reason to wrap. Verified rather than assumed —
		 `19,834/19,835` in a 112px pill comes back one line, and a short `5/25` still renders
		 at the full MaxTextSize, which is the half of the contract that stops a pill built for
		 17px type rendering a 60px word. See F-38 in docs/FAILURES.md. ]]
	local c = Instance.new("UITextSizeConstraint")
	c.MaxTextSize = maxSize
	c.MinTextSize = MIN_SIZE
	c.Parent = label
	label.TextScaled = true
end

--------------------------------------------------------------------------------
-- display type (decision 3)
--------------------------------------------------------------------------------

--[[ §4's near-universal treatment: white fill, black outline, drop shadow.

	 The returned label is the SHADE — the dark one underneath — and the white
	 face is its child, lifted by `Theme.Type.ShadeDrop`. That inversion is
	 forced by Roblox: children always draw above their parent, so a shadow
	 cannot be a child of the text it sits under.

	 Everything a caller normally does to a label still works on the shade. Size,
	 Position and LayoutOrder move both (the face is sized `(1, 0, 1, 0)` of its
	 parent), and `.Text` is mirrored by the connection below, so
	 `counterLabel.Text = "1,250"` behaves exactly as it did when this was one
	 plain label. `TextColor3` is the one property that does not: it belongs to
	 the face now, which is why `Theme.setTextColor` exists. ]]
local function displayText(parent: Instance, size: number, color: Color3?): (TextLabel, TextLabel)
	local shade = Instance.new("TextLabel")
	shade.Name = "Text"
	shade.BackgroundTransparency = 1
	shade.BorderSizePixel = 0
	shade.Font = Palette.Font.Display
	shade.TextSize = size
	shade.TextColor3 = Theme.Type.ShadeColor
	shade.TextTransparency = Theme.Type.ShadeTransparency
	shade.TextStrokeTransparency = 1
	shade.ZIndex = zAbove(parent)
	shade.Size = UDim2.new(1, 0, 1, 0)
	clampText(shade, size)
	shade.Parent = parent

	local face = Instance.new("TextLabel")
	face.Name = "Face"
	face.Size = UDim2.new(1, 0, 1, 0)
	face.Position = UDim2.fromOffset(0, -Theme.Type.ShadeDrop)
	face.ZIndex = shade.ZIndex + 1
	Palette.styleText(face, size, color)
	clampText(face, size)
	face.Parent = shade

	local function mirrorText()
		face.Text = shade.Text
		face.TextXAlignment = shade.TextXAlignment
		face.TextYAlignment = shade.TextYAlignment
	end
	mirrorText()
	shade:GetPropertyChangedSignal("Text"):Connect(mirrorText)
	shade:GetPropertyChangedSignal("TextXAlignment"):Connect(mirrorText)
	shade:GetPropertyChangedSignal("TextYAlignment"):Connect(mirrorText)

	--[[ Callers raise the shade's ZIndex after construction (the panel title and
		 the close-button caption both do, to clear furniture underneath them).
		 Under `ZIndexBehavior.Sibling` a child always wins against its parent
		 anyway, but both ScreenGuis in this game only *happen* to be on Sibling —
		 keeping the face one step ahead means the pair survives a switch to
		 Global, where the face would otherwise sink behind its own shadow. ]]
	shade:GetPropertyChangedSignal("ZIndex"):Connect(function()
		face.ZIndex = shade.ZIndex + 1
	end)

	return shade, face
end

--[[ Recolour the white face of a `displayText` pair. Callers hold the shade, so
	 without this they would tint the shadow and leave the type white. ]]
function Theme.setTextColor(label: TextLabel, color: Color3)
	local face = label:FindFirstChild("Face")
	if face and face:IsA("TextLabel") then
		face.TextColor3 = color
	else
		label.TextColor3 = color
	end
end

--------------------------------------------------------------------------------
-- the moulded surface
--------------------------------------------------------------------------------

export type SurfaceSpec = {
	Fill: Color3,
	Radius: UDim?,
	Stroke: number?,
	Edge: number?,
	EdgeShade: number?,
	Gradient: boolean?,
	Highlight: boolean?,
	HighlightScale: number?,
	HighlightInset: number?,
	HighlightThickness: number?,
	HighlightTransparency: number?,
	Sheen: number?, -- height of the diagonal sheen band, nil for none
	Shadow: Vector2?, -- offset, nil for none
	ShadowTransparency: number?,
}

type SurfaceParts = {
	edge: Frame?,
	highlight: Frame?,
	shadow: Frame?,
}

--[[ The five layers, in order. Every surface in the game is one call to this.

	 `host` must already be parented and must clip: layers 4 and 5 are square
	 frames pinned to the host's edges, and without ClipsDescendants their corners
	 punch straight through the rounded silhouette. ]]
local function surfaceLayers(host: GuiObject, spec: SurfaceSpec): SurfaceParts
	local radius = spec.Radius or Theme.Radius.Button
	local fill = spec.Fill

	host.BackgroundColor3 = fill
	host.BorderSizePixel = 0
	host.ClipsDescendants = true

	corner(host, radius)
	if spec.Gradient ~= false then
		bodyGradient(host, fill)
	end

	-- §2: the outline is the single most important signal, and it does not thin
	-- down on small elements. Every branch of this file goes through here.
	Palette.stroke(host, spec.Stroke or Palette.Outline.Button)

	local parts: SurfaceParts = {}

	if spec.Shadow then
		parts.shadow = attachShadow(host, radius, spec.Shadow, spec.ShadowTransparency or Theme.Shadow.Transparency)
	end
	if spec.Sheen then
		sheen(host, spec.Sheen, 0.86)
	end
	if spec.Edge and spec.Edge > 0 then
		parts.edge = hardEdge(host, fill, spec.Edge, spec.EdgeShade)
	end
	if spec.Highlight ~= false then
		parts.highlight = topHighlight(
			host,
			spec.HighlightScale or 1,
			spec.HighlightInset or 16,
			spec.HighlightThickness or 5,
			spec.HighlightTransparency or 0.55
		)
	end

	return parts
end

--[[ Public door onto the construction above, for a surface this file does not
	 have a named recipe for. Returns the frame; its layers are children named
	 `Edge` and `Highlight`, and its shadow (when it got one) is a sibling. ]]
function Theme.surface(parent: Instance, spec: SurfaceSpec, size: UDim2?, position: UDim2?): Frame
	local frame = Instance.new("Frame")
	frame.Name = "Surface"
	frame.Size = size or UDim2.fromOffset(120, 48)
	frame.Position = position or UDim2.fromOffset(0, 0)
	frame.ZIndex = zAbove(parent)
	frame.Parent = parent
	surfaceLayers(frame, spec)
	return frame
end

--[[ Attach a drop shadow to something this file did not build. Returns nil when
	 the target sits in a layout (decision 5), so callers must tolerate that. ]]
function Theme.dropShadow(target: GuiObject, radius: UDim?, offset: Vector2?, transparency: number?): Frame?
	return attachShadow(
		target,
		radius or Theme.Radius.Button,
		offset or Theme.Shadow.Offset,
		transparency or Theme.Shadow.Transparency
	)
end

--[[ A WELL: the only dark fill this design system still hands out, and it is
	 deliberately not a surface.

	 The problem it solves is real — a big white numeral sitting directly on a
	 saturated gold pill is legible, but a long one (`1,284,905`) starts to swim.
	 The wrong fix is the one that was just rejected: make the pill dark. The
	 right fix is to sink the number a few percent into the colour it is already
	 on, which is what a moulded object does anyway.

	 So a well is: translucent warm ink (never pure black, never opaque), with a
	 lit lower lip. The lip is what sells it as a RECESS rather than as a stain —
	 light comes from above in this category, so the bottom inner edge of a dent
	 is the part that catches it.

	 Like the hard edge and the sheen it is shading INSIDE its host, so it
	 carries no outline of its own and an outline audit must not add one. `host`
	 must clip. `strength` is how dark, 0–1; anything past ~0.3 and this stops
	 being a recess and becomes the black pill it exists to replace. ]]
function Theme.well(host: GuiObject, size: UDim2, position: UDim2, strength: number?, radius: UDim?): Frame
	local well = Instance.new("Frame")
	well.Name = "Well"
	well.AnchorPoint = Vector2.new(0, 0)
	well.Position = position
	well.Size = size
	well.BackgroundColor3 = Theme.Accent.Ink
	well.BackgroundTransparency = 1 - math.clamp(strength or 0.2, 0, 0.3)
	well.BorderSizePixel = 0
	well.ZIndex = host.ZIndex
	well.Parent = host
	-- Pill by default, which is right for the short wide recess behind a number.
	-- A tall channel (the nav rail's) must pass a fixed radius: a pill's radius
	-- is half the SHORT axis, so a 84x380 well would come out as a stadium.
	corner(well, radius or Theme.Radius.Pill)

	local lip = Instance.new("Frame")
	lip.Name = "Lip"
	lip.AnchorPoint = Vector2.new(0.5, 1)
	lip.Position = UDim2.new(0.5, 0, 1, -1)
	lip.Size = UDim2.new(1, -10, 0, 2)
	lip.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	lip.BackgroundTransparency = 0.82
	lip.BorderSizePixel = 0
	lip.ZIndex = well.ZIndex
	lip.Parent = well
	corner(lip, Theme.Radius.Pill)

	return well
end

--[[ A GROUP PLATE: the carved sand slab a cluster of controls is mounted on.

	 "Weak visual grouping" and "side navigation feels like unrelated coloured
	 circles" are the same defect described twice — four controls floating on the
	 world are four objects, and four controls bolted to one slab are one
	 control group. This is that slab, and it is the same object for the wallet,
	 the nav rail and the sell mount, which is what makes those three clusters
	 read as parts of one interface.

	 Stone rather than dark, because the alternative — a dark rail — is exactly
	 the "too much black surface area" note. A light warm plate lets the
	 saturated controls on it stay the brightest things in their own cluster.

	 It clips (every `Theme.surface` does), so lay contents out inside
	 `Theme.Metrics.PlatePad` and expect anything past the edge to be trimmed. ]]
function Theme.groupPlate(parent: Instance, size: UDim2?, position: UDim2?): Frame
	local plate = Theme.surface(parent, {
		Fill = Theme.Accent.Stone,
		Radius = Theme.Radius.Panel,
		Stroke = Palette.Outline.Panel,
		Edge = Theme.Edge.Panel,
		-- Gentler than a saturated surface's 0.34: a third off sand produces a
		-- muddy grey band that reads as dirt on the plate rather than as its
		-- own thickness. Same reason `Theme.card` softens its edge.
		EdgeShade = 0.2,
		HighlightInset = 24,
		HighlightThickness = 5,
		HighlightTransparency = 0.42,
		Shadow = Theme.Shadow.Offset,
		ShadowTransparency = 0.66,
	}, size, position)
	plate.Name = "GroupPlate"
	return plate
end

--------------------------------------------------------------------------------
-- buttons
--------------------------------------------------------------------------------

--[[ Children a press must NOT move. `Edge` and `Highlight` are the button's own
	 moulding — the edge shrinks instead, and the highlight is the fixed lit rim.
	 `Veil` is Hud's full-bleed disabled wash, which has to stay registered with
	 the silhouette. `Badge` is the notification dot: it is pinned to the corner
	 and a bouncing dot reads as a bug. Everything else — the caption, Hud's
	 pictograms, the SELL button's shard icon — is the button's FACE and travels
	 with the press. ]]
local SINK_SKIP: { [string]: boolean } = {
	Edge = true,
	Highlight = true,
	Sheen = true,
	Veil = true,
	Badge = true,
	Shadow = true,
}

--[[ The caption described in decision 2, built on the display type of decision
	 3. The label returned (and named `Caption`, which Hud looks up by name) is
	 the dark shade; the white face is inside it. ]]
local function caption(btn: TextButton, textSize: number, bottomPad: number): TextLabel
	--[[ The native text stays as the API surface but is never drawn.

		 It is also dragged onto the category's own font and size instead of being
		 left on the TextButton defaults (LegacyArial at 8px). A style audit that
		 reads properties rather than pixels sees a thin, non-category font on a
		 control and §9.10 fails that outright — and more importantly it is one
		 stray write from being true: any code that cleared TextTransparency would
		 surface hairline Arial underneath the styled caption. Matching the caption
		 means the worst case is a doubled correct glyph, not a category failure.

		 Clearing `btn.Text` instead is not an option: it is the documented public
		 API and Panels drives caption changes through it. ]]
	btn.Font = Palette.Font.Display
	btn.TextSize = textSize
	btn.TextColor3 = Palette.UI.TextLight
	btn.TextTransparency = 1
	btn.TextStrokeTransparency = 1

	local label = displayText(btn, textSize)
	label.Name = "Caption"
	label.AnchorPoint = Vector2.new(0.5, 0)
	--[[ Sits above the hard bottom edge so the type is optically centred in the
		 LIT FACE of the button rather than in its full silhouette.

		 The Y offset is deliberately left at zero rather than being nudged down
		 to compensate for the shade drop (decision 3). Hud rewrites this label's
		 Position outright when it insets the SELL caption around a shard plate,
		 preserving only the Y *terms it can see* — so any compensation encoded
		 here would survive on every button except the one that most needs it, and
		 the SELL button would be the odd one out. Two pixels of shade drop on
		 22px type is below the threshold where that matters; an inconsistency
		 between one button and every other one is not.

		 Horizontally only 10px: a nav tile is barely wider than its word, and a
		 generous inset there scales "UPGRADES" down to nothing. ]]
	label.Position = UDim2.new(0.5, 0, 0, 0)
	label.Size = UDim2.new(1, -10, 1, -bottomPad)
	label.ZIndex = btn.ZIndex + 1
	label.TextXAlignment = Enum.TextXAlignment.Center
	label.TextYAlignment = Enum.TextYAlignment.Center
	label.Text = btn.Text

	btn:GetPropertyChangedSignal("Text"):Connect(function()
		label.Text = btn.Text
		-- Re-assert invisibility alongside the one write a caller is expected to
		-- make. A caller that swaps a caption (Panels does, BUY -> MAX) must not
		-- be able to leave the native glyph showing through the styled one.
		btn.TextTransparency = 1
	end)

	return label
end

--[[ idle / hover / pressed (decision 4).

	 Hover brightens the fill and the lit rim. Press does three things at once,
	 and all three are needed for the button to read as depressed rather than
	 merely recoloured: the fill deepens, the hard bottom edge collapses from
	 `rest` to `Edge.Pressed`, and every face child moves down by exactly that
	 difference. The button's own Size and Position are never touched, so this
	 cannot fight a UIListLayout or a caller-set position.

	 The press half is applied instantly rather than tweened. A chunky button
	 that eases into being pressed feels soft; the category's read is a hard
	 mechanical click, and an eased edge would also drift out of step with the
	 snapped caption for the length of the tween. Only colour is tweened. ]]
local function wireFeedback(btn: TextButton, fill: Color3, parts: SurfaceParts, rest: number)
	local hoverFill = Palette.lift(fill, 0.14)
	local pressFill = Palette.shade(fill, 0.14)
	local edge = parts.edge
	local highlight = parts.highlight
	-- Written long-hand rather than as `highlight and x or 1`: a highlight that
	-- was fully opaque (transparency 0) would make that idiom fall through to 1
	-- and the rim would vanish on the first hover.
	local restGlow = 1
	if highlight then
		restGlow = highlight.BackgroundTransparency
	end

	local colourTween = TweenInfo.new(0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

	-- How far the face is currently displaced, so a state change can be applied
	-- as a delta. Deltas rather than a remembered base is what lets Hud reposition
	-- the SELL caption after construction without this stomping it back.
	local sunk = 0
	local function sink(depth: number)
		local delta = depth - sunk
		if delta == 0 then
			return
		end
		sunk = depth
		for _, child in btn:GetChildren() do
			if child:IsA("GuiObject") and not SINK_SKIP[child.Name] then
				local p = child.Position
				child.Position = UDim2.new(p.X.Scale, p.X.Offset, p.Y.Scale, p.Y.Offset + delta)
			end
		end
	end

	local function state(color: Color3, edgeThickness: number, glow: number)
		TweenService:Create(btn, colourTween, { BackgroundColor3 = color }):Play()
		if edge then
			edge.Size = UDim2.new(1, 0, 0, edgeThickness)
		end
		if highlight then
			TweenService:Create(highlight, colourTween, { BackgroundTransparency = glow }):Play()
		end
		sink(rest - edgeThickness)
	end

	local hovering = false
	local held = false

	--[[ What counts as a press, across the three devices.

		 ButtonA is the gamepad's activate, and it arrives through InputBegan on the
		 button itself once that button holds selection. Without it the controller
		 path fired `Activated` — so the game responded — while the control never
		 looked pressed, which reads as an input that did not register. ]]
	local function isPress(input: InputObject): boolean
		return input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
			or input.KeyCode == Enum.KeyCode.ButtonA
	end

	local function refresh()
		if held then
			state(pressFill, Theme.Edge.Pressed, math.min(1, restGlow + 0.25))
		elseif hovering then
			state(hoverFill, rest, math.max(0, restGlow - 0.18))
		else
			state(fill, rest, restGlow)
		end
	end

	btn.MouseEnter:Connect(function()
		hovering = true
		refresh()
	end)
	btn.MouseLeave:Connect(function()
		-- A touch drag that leaves the button must also release it, or the
		-- button stays visually stuck down after the finger lifts elsewhere.
		hovering = false
		held = false
		refresh()
	end)

	--[[ Gamepad focus is the controller's hover, and it drives the SAME value.

		 Not a new visual state: every response already written for hover — the fill
		 tween, the edge weight, the glow, the sink — becomes a response to gamepad
		 focus for free, and cannot drift from it later, because there is only one
		 `hovering` and one `refresh`.

		 This was a real hole rather than a missing nicety. `Selectable = false` is
		 set in two places in Panels, so the selection graph is live and a controller
		 player genuinely navigates this UI — they simply received no feedback while
		 doing it. Every visible response in the game was connected to MouseEnter,
		 and `SelectionGained` appeared nowhere in the client.

		 Found by `state.selection-gained-is-the-gamepad-s-hover` in
		 packages/design/src/rules.mjs, learned from onyx-ui and synthetic. The
		 existing `checkGamepadReachability` could not have caught it: it proves the
		 selection graph is CONNECTED, not that anything happens when you move
		 through it. ]]
	btn.SelectionGained:Connect(function()
		hovering = true
		refresh()
	end)
	btn.SelectionLost:Connect(function()
		hovering = false
		held = false
		refresh()
	end)

	btn.InputBegan:Connect(function(input: InputObject)
		if isPress(input) then
			held = true
			refresh()
		end
	end)
	btn.InputEnded:Connect(function(input: InputObject)
		if isPress(input) then
			--[[ Returning to `hovering` is right for BOTH devices here, which is only
				 true because selection feeds the same value. A pointer release returns
				 the control to hover because the cursor is still on it; a gamepad
				 release returns it to its SELECTED appearance because the focus has not
				 moved. Those are different sentences about the same variable, and the
				 rule they satisfy — `state.a-press-returns-to-the-state-the-device-
				 actually-left-it-in` — is the reason to write that down rather than to
				 discover later that one device was returning to the other's state. ]]
			held = false
			refresh()
		end
	end)
end

--[[ The one place a button is actually constructed. Theme.button, the panel
	 close button and the Hud's nav tiles all come through here so none of them
	 can drift from the others on outline weight, depth or press behaviour. ]]
local function makeButton(
	parent: Instance,
	text: string,
	fillColor: Color3,
	size: UDim2,
	position: UDim2,
	radius: UDim,
	textSize: number,
	edgeThickness: number,
	highlightScale: number,
	highlightInset: number,
	shadowOffset: Vector2,
	-- Optional, and used by exactly one caller: the primary action. §3 hands the
	-- diagonal sheen band to saturated headers, and the whole point of
	-- `Theme.actionButton` is that the single most important control on the
	-- screen gets the loudest surface treatment the design system owns.
	sheenHeight: number?,
	shadowTransparency: number?
): (TextButton, TextLabel)
	local btn = Instance.new("TextButton")
	btn.Name = "Button"
	btn.Size = size
	btn.Position = position
	btn.AutoButtonColor = false -- the hover/press states below replace it
	btn.Text = string.upper(text)
	btn.ZIndex = zAbove(parent) -- set before the layers and caption copy it
	-- Parented before the layers, because the drop shadow is a SIBLING and has
	-- to be able to see where it is going (decision 5).
	btn.Parent = parent

	local parts = surfaceLayers(btn, {
		Fill = fillColor,
		Radius = radius,
		Stroke = Palette.Outline.Button,
		Edge = edgeThickness,
		HighlightScale = highlightScale,
		HighlightInset = highlightInset,
		HighlightThickness = 5,
		HighlightTransparency = 0.52,
		Sheen = sheenHeight,
		Shadow = shadowOffset,
		ShadowTransparency = shadowTransparency,
	})

	local label = caption(btn, textSize, edgeThickness)
	wireFeedback(btn, fillColor, parts, edgeThickness)

	return btn, label
end

--------------------------------------------------------------------------------
-- public surface
--------------------------------------------------------------------------------

--[[ §3 Pill, vertical gradient, lit top rim, hard bottom edge, offset shadow,
	 thick outline, heavy uppercase type. `size` and `position` are optional. ]]
function Theme.button(parent: Instance, text: string, fillColor: Color3, size: UDim2?, position: UDim2?): TextButton
	local btn = makeButton(
		parent,
		text,
		fillColor,
		size or UDim2.fromOffset(220, Theme.Metrics.ButtonHeight),
		position or UDim2.fromOffset(0, 0),
		Theme.Radius.Pill, -- §3 buttons are often full pills; this is the default action shape
		Theme.Type.Button,
		Theme.Edge.Rest,
		1,
		18,
		Theme.Shadow.Offset
	)
	return btn
end

--[[ THE PRIMARY ACTION. One per screen, and on this game's HUD it is SELL
	 SHARDS — the thing the entire loop is built to make the player press.

	 It was reported as "visually muted", and the diagnosis matters: it was not
	 the wrong colour, it was the same object as every other button. A control
	 that has to out-read a whole HUD cannot be distinguished by hue alone, so
	 this differs from `Theme.button` on five axes at once, all of them the
	 category's own vocabulary rather than added noise:

	   • the fill is `Theme.Accent.Action`, the lit face of the world's grass and
	     the brightest colour this file will draw
	   • the caption is one type step larger (`Theme.Type.Action`)
	   • the hard bottom edge is thicker, so it is physically the deepest control
	   • it carries the diagonal sheen band §3 otherwise reserves for headers
	   • its shadow is cast further and darker, so it floats above its mount

	 No pulse, no glow, no permanent animation: the HUD already pulses this
	 button's icon when the pack is full, and a control that moves all the time
	 stops meaning anything when it moves for a reason. ]]
function Theme.actionButton(
	parent: Instance,
	text: string,
	fillColor: Color3?,
	size: UDim2?,
	position: UDim2?
): TextButton
	local btn = makeButton(
		parent,
		text,
		fillColor or Theme.Accent.Action,
		size or UDim2.fromOffset(260, Theme.Metrics.ActionHeight),
		position or UDim2.fromOffset(0, 0),
		Theme.Radius.Pill,
		Theme.Type.Action,
		Theme.Edge.Action,
		1,
		18,
		Theme.Shadow.ActionOffset,
		26, -- sheen band height
		Theme.Shadow.ActionTransparency
	)
	btn.Name = "ActionButton"
	return btn
end

--[[ §5.4 Item cards are white, outlined, rounded. The action button goes
	 *inside* the card, right-aligned — that is the caller's job, and the padding
	 here is what gives it somewhere to sit.

	 A white card cannot use the white top highlight (it would be invisible), so
	 its moulding comes from the gradient and from a light-grey hard bottom edge
	 that reads as the card's thickness. That is also why it clips: the edge is a
	 square band and the card's corners are 14px round. Panels lays every card
	 child out inside the padding, so nothing legitimate is clipped by this —
	 including the action button's own shadow, which lands inside the padding
	 rather than past the card border. ]]
function Theme.card(parent: Instance, size: UDim2?): Frame
	local card = Instance.new("Frame")
	card.Name = "Card"
	card.Size = size or UDim2.new(1, 0, 0, 92)
	card.ZIndex = zAbove(parent)
	card.Parent = parent

	surfaceLayers(card, {
		Fill = Palette.UI.CardFill,
		Radius = Theme.Radius.Card,
		-- §2: the outline does not thin down on small elements. A card gets the
		-- same weight as a button even when it is a 60px chip in a grid.
		Stroke = Palette.Outline.Card,
		Edge = Theme.Edge.Card,
		EdgeShade = 0.16,
		Highlight = false,
		Shadow = Theme.Shadow.Offset,
		ShadowTransparency = 0.74,
	})

	local pad = Instance.new("UIPadding")
	-- Contract with Panels.CARD_PAD_X / CARD_PAD_Y — see decision 1.
	pad.PaddingTop = UDim.new(0, Theme.Spacing.Snug)
	pad.PaddingBottom = UDim.new(0, Theme.Spacing.Snug)
	pad.PaddingLeft = UDim.new(0, Theme.Spacing.Base)
	pad.PaddingRight = UDim.new(0, Theme.Spacing.Base)
	pad.Parent = card

	return card
end

--[[ §6 Currency counter, rebuilt onto colour.

	 A rounded pill IN THE CURRENCY'S OWN COLOUR, with a minted medallion at the
	 left end and a big comma-separated number in white outlined display type
	 sunk into a translucent well. Shards read gold, coins read green, and
	 neither is a black lozenge with a coloured dot on it any more.

	 The medallion inverts to keep working on the new ground. On a dark pill the
	 coin was a bright disc; on a gold pill a gold disc would vanish, so the rim
	 is now a deep shade of the same hue with a bright face inside it. Same
	 object, same three concentric parts, reversed contrast.

	 Geometry is unchanged, and that is a contract: Panels resizes this pill to
	 half a strip's width at 42px tall and constrains it between 122 and 268 px,
	 so the medallion's 32px offset size and the number's `x = 48` origin have to
	 keep working at that height.

	 Returns the pill and the number label. The label is a `displayText` shade
	 (decision 3): `label.Text = Util.comma(n)` is all a caller needs and it
	 keeps working exactly as it did. ]]
function Theme.counter(parent: Instance, iconColor: Color3, position: UDim2?): (Frame, TextLabel)
	local fill = counterSurface(iconColor)

	local pill = Instance.new("Frame")
	pill.Name = "Counter"
	pill.Size = UDim2.fromOffset(196, Theme.Metrics.CounterHeight)
	pill.Position = position or UDim2.fromOffset(0, 0)
	pill.ZIndex = zAbove(parent)
	pill.Parent = parent

	surfaceLayers(pill, {
		Fill = fill,
		Radius = Theme.Radius.Pill,
		Stroke = Palette.Outline.Button,
		Edge = Theme.Edge.Counter,
		HighlightScale = 1,
		HighlightInset = 22,
		HighlightThickness = 4,
		-- Subtler than a button's: this is a readout, not a control, and a bright
		-- rim here would compete with the number for attention.
		HighlightTransparency = 0.66,
		Shadow = Theme.Shadow.Offset,
	})

	--[[ The number's well (see `Theme.well`). Thin, translucent, and stopping
		 short of the pill's ends so the gold or green surface is still what the
		 eye reads first. Built BEFORE the number so it cannot cover it. ]]
	-- Centred on the number's own centre line rather than on the pill's, and
	-- sized in offset, so it stays registered with the type at both the 46px
	-- height the HUD builds and the 42px one Panels resizes to.
	Theme.well(pill, UDim2.new(1, -54, 0, 26), UDim2.new(0, 46, 0.5, -14), 0.2)

	--[[ The medallion. Three concentric parts rather than one flat disc — rim,
		 face, gloss — because a single coloured circle is exactly the "basic icon
		 treatment" the owner called out. It is anchored to the pill's left end
		 and vertically centred, so the Hud resizing the pill (it does, to line
		 the counters up with the pack bar) moves it. ]]
	local rim = Instance.new("Frame")
	rim.Name = "Coin"
	rim.AnchorPoint = Vector2.new(0, 0.5)
	rim.Position = UDim2.new(0, 8, 0.5, -2)
	rim.Size = UDim2.fromOffset(32, 32)
	rim.ZIndex = pill.ZIndex + 1
	rim.Parent = pill
	surfaceLayers(rim, {
		-- Deep enough to read as a struck rim against a pill of the same hue.
		-- 0.24 was tuned against a near-black pill and disappears against this one.
		Fill = Palette.shade(iconColor, 0.62),
		Radius = Theme.Radius.Icon,
		Stroke = Palette.Outline.Icon,
		Edge = 0,
		Highlight = false,
	})

	local face = Instance.new("Frame")
	face.Name = "Face"
	face.AnchorPoint = Vector2.new(0.5, 0.5)
	face.Position = UDim2.fromScale(0.5, 0.46)
	face.Size = UDim2.fromScale(0.72, 0.72)
	face.BackgroundColor3 = Palette.lift(iconColor, 0.42)
	face.BorderSizePixel = 0
	face.ZIndex = rim.ZIndex + 1
	face.Parent = rim
	corner(face, Theme.Radius.Icon)
	bodyGradient(face, Palette.lift(iconColor, 0.42))

	local gloss = Instance.new("Frame")
	gloss.Name = "Gloss"
	gloss.AnchorPoint = Vector2.new(0.5, 0.5)
	gloss.Position = UDim2.fromScale(0.36, 0.3)
	gloss.Size = UDim2.fromScale(0.3, 0.22)
	gloss.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	gloss.BackgroundTransparency = 0.42
	gloss.BorderSizePixel = 0
	gloss.Rotation = -25
	gloss.ZIndex = face.ZIndex + 1
	gloss.Parent = face
	corner(gloss, Theme.Radius.Pill)

	local number = displayText(pill, Theme.Type.Counter)
	number.Name = "Amount"
	number.AnchorPoint = Vector2.new(0, 0.5)
	-- -1 rather than 0: the pill carries a 6px hard bottom edge, so its optical
	-- centre is above its geometric one, and the white face already sits one
	-- ShadeDrop up from this box.
	number.Position = UDim2.new(0, 48, 0.5, -1)
	number.Size = UDim2.new(1, -58, 0, 30)
	number.ZIndex = pill.ZIndex + 1
	number.TextXAlignment = Enum.TextXAlignment.Left
	-- §4 never truncated to "1B"; the comma form is part of the fantasy.
	number.Text = Util.comma(0)

	return pill, number
end

--[[ There is no `Theme.iconButton`.

	 §6 asks for left-edge circular icon buttons and this module used to export
	 one. The owner's pixel review rejected the shape — "side navigation feels
	 like unrelated coloured circles" — so `Hud.buildNav` builds the rail out of
	 `Theme.button` with the silhouette overridden to a rounded square, seats the
	 tiles in a `Theme.well` on a `Theme.groupPlate`, and hangs the caption on a
	 plate shaded from the tile's own hue.

	 The circular version was left behind with no call sites, and it was broken:
	 `makeButton` sets ClipsDescendants on the disc, so a caption plate parented
	 BELOW it was clipped away entirely and the button rendered wordless. Keeping
	 a rejected shape in the design system as dead, broken code is how a later
	 pass reintroduces the thing that was rejected, so it is gone rather than
	 fixed. The rail in Hud.luau is the only nav control. ]]

--[[ §5.3 Sections are labelled, centred, outlined. Flanked by real rules — two
	 stubby dark bars with a diamond cap — rather than by em-dashes inside the
	 string, because a rule drawn in type is a hyphen and reads as one.

	 Returns a TextLabel so callers can set LayoutOrder and Text on it; the rules
	 and the white face are its children (decision 3). ]]
function Theme.sectionLabel(parent: Instance, text: string): TextLabel
	local label = displayText(parent, Theme.Type.Section)
	label.Name = "SectionLabel"
	-- Taller than the type by ShadeDrop so lifting the face does not push it out
	-- of its own layout slot.
	label.Size = UDim2.new(1, 0, 0, 34 + Theme.Type.ShadeDrop)
	label.Text = string.upper(text)
	label.TextXAlignment = Enum.TextXAlignment.Center
	label.ZIndex = zAbove(parent)

	local function rule(anchorX: number, positionX: number)
		local bar = Instance.new("Frame")
		bar.Name = "Rule"
		bar.AnchorPoint = Vector2.new(anchorX, 0.5)
		bar.Position = UDim2.new(positionX, 0, 0.5, 0)
		bar.Size = UDim2.new(0.13, 0, 0, 5)
		bar.BackgroundColor3 = Palette.Outline.Color
		bar.BackgroundTransparency = 0.3
		bar.BorderSizePixel = 0
		bar.ZIndex = label.ZIndex
		bar.Parent = label
		corner(bar, Theme.Radius.Pill)

		local cap = Instance.new("Frame")
		cap.Name = "Cap"
		cap.AnchorPoint = Vector2.new(anchorX, 0.5)
		cap.Position = UDim2.new(1 - anchorX, 0, 0.5, 0)
		cap.Size = UDim2.fromOffset(9, 9)
		cap.Rotation = 45
		cap.BackgroundColor3 = Palette.Outline.Color
		cap.BackgroundTransparency = 0.3
		cap.BorderSizePixel = 0
		cap.ZIndex = label.ZIndex
		cap.Parent = bar
		corner(cap, UDim.new(0, 2))
	end

	rule(0, 0)
	rule(1, 1)

	return label
end

--------------------------------------------------------------------------------
-- header ornaments
--------------------------------------------------------------------------------

--[[ A small shape composed from rounded frames. Coordinates are in the 30x30
	 box the ornament slot scales, which keeps every ornament drawn to one grid. ]]
local function pip(
	host: Frame,
	width: number,
	height: number,
	x: number,
	y: number,
	radius: number,
	color: Color3,
	rotation: number?
): Frame
	local part = Instance.new("Frame")
	part.AnchorPoint = Vector2.new(0.5, 0.5)
	part.Position = UDim2.fromScale(x / 30, y / 30)
	part.Size = UDim2.fromScale(width / 30, height / 30)
	part.BackgroundColor3 = color
	part.BorderSizePixel = 0
	part.Rotation = rotation or 0
	part.ZIndex = host.ZIndex + 1
	part.Parent = host
	corner(part, UDim.new(0, radius))
	Palette.stroke(part, Palette.Outline.Icon)
	return part
end

--[[ §5's header is the panel's personality, and four modals that differ only in
	 hue still read as one screen repeated. This is the optional slot on the LEFT
	 of the header — mirroring the close button on the right, so the title stays
	 optically centred between them — that lets SHOP wear a gem and ZONES wear a
	 marker.

	 Shapes are original vector primitives, never a logo or a third-party mark. ]]
function Theme.headerOrnament(panel: Frame, kind: string, color: Color3?): Frame?
	local header = panel:FindFirstChild("Header")
	if not header or not header:IsA("Frame") then
		return nil
	end

	local existing = header:FindFirstChild("Ornament")
	if existing then
		existing:Destroy()
	end

	local slot = Instance.new("Frame")
	slot.Name = "Ornament"
	slot.AnchorPoint = Vector2.new(0, 0.5)
	slot.Position = UDim2.new(0, 14, 0.5, -3)
	slot.Size = UDim2.fromOffset(Theme.Metrics.OrnamentSize, Theme.Metrics.OrnamentSize)
	slot.BackgroundTransparency = 1
	slot.BorderSizePixel = 0
	slot.ZIndex = header.ZIndex + 2
	slot.Parent = header

	local tint = color or Palette.UI.TextLight
	local deep = Palette.shade(tint, 0.3)

	if kind == "gem" then
		-- A cut stone: a broad table over a tapered body.
		pip(slot, 20, 20, 15, 16, 4, tint, 45)
		pip(slot, 16, 6, 15, 10, 3, Palette.lift(tint, 0.45))
	elseif kind == "coin" then
		pip(slot, 22, 22, 15, 15, 11, tint)
		pip(slot, 10, 10, 15, 15, 5, deep)
	elseif kind == "star" then
		pip(slot, 8, 24, 15, 15, 4, tint)
		pip(slot, 24, 8, 15, 15, 4, tint)
		pip(slot, 14, 14, 15, 15, 7, Palette.lift(tint, 0.4))
	elseif kind == "pin" then
		-- A map marker: a head over a tapered spike.
		pip(slot, 9, 9, 15, 22, 2, deep, 45)
		pip(slot, 20, 20, 15, 13, 10, tint)
		pip(slot, 8, 8, 15, 13, 4, deep)
	elseif kind == "key" then
		pip(slot, 16, 16, 12, 12, 8, tint)
		pip(slot, 6, 6, 12, 12, 3, deep)
		pip(slot, 14, 6, 21, 19, 3, tint, -45)
	elseif kind == "bolt" then
		pip(slot, 8, 16, 13, 11, 3, tint, 18)
		pip(slot, 8, 16, 17, 19, 3, Palette.lift(tint, 0.35), 18)
	else
		slot:Destroy()
		return nil
	end

	return slot
end

--------------------------------------------------------------------------------
-- panel
--------------------------------------------------------------------------------

export type PanelOptions = {
	size: UDim2?,
	ornament: string?, -- "gem" | "coin" | "star" | "pin" | "key" | "bolt" | "none"
	ornamentColor: Color3?,
}

--[[ The default ornament for each of the four header hues.

	 "Weak panel personality" was one of the named defects, and four modals that
	 differ only in header colour are exactly that. A caller can always pass
	 `opts.ornament` (or "none"), but a panel should not have to opt IN to having
	 a face — so the hue it already chose picks one.

	 The mapping is deliberately by Palette token rather than by panel id, because
	 Theme does not know what a panel is for. It happens to land correctly on the
	 four modals this game ships: gold SHOP wears a coin, cyan UPGRADES a bolt,
	 green CODES a key, purple ZONES a map marker. A header built from any other
	 colour simply gets no ornament. ]]
local DEFAULT_ORNAMENT: { { hue: Color3, kind: string } } = {
	{ hue = Palette.UI.HeaderGold, kind = "coin" },
	{ hue = Palette.UI.HeaderCyan, kind = "bolt" },
	{ hue = Palette.UI.HeaderGreen, kind = "key" },
	{ hue = Palette.UI.HeaderPurple, kind = "pin" },
}

local function defaultOrnament(headerColor: Color3): string?
	for _, entry in DEFAULT_ORNAMENT do
		if entry.hue == headerColor then
			return entry.kind
		end
	end
	return nil
end

--[[ Keeps a panel legible on every screen (decision 6). Re-runs on viewport
	 change, which also covers a phone being rotated. ]]
local function bindResponsive(panel: Frame, fixed: UDim2?)
	local constraint = Instance.new("UISizeConstraint")
	constraint.Parent = panel

	--[[ Seed a legal base size before anything is measured. A fresh Frame's Size
		 is zero, and `Theme.open` animates *to* `ThemeBaseSize` — so a panel
		 opened before the camera had reported a viewport (the early-return in
		 `apply` below) would scale up to nothing and read as a broken modal. ]]
	local seed = fixed or PANEL_SCALE_WIDE
	panel:SetAttribute("ThemeBaseSize", seed)
	panel.Size = seed

	local function apply()
		local camera = workspace.CurrentCamera
		local vp = camera and camera.ViewportSize or Vector2.new(1280, 720)
		if vp.X < 1 or vp.Y < 1 then
			return -- viewport is briefly zero during the first frames
		end

		-- MaxSize is the hard guarantee that a panel is never wider than the
		-- screen; the scale below only decides how much of it to use.
		local maxX = math.min(PANEL_MAX.X, math.max(120, vp.X - 24))
		local maxY = math.min(PANEL_MAX.Y, math.max(120, vp.Y - 24))
		constraint.MaxSize = Vector2.new(maxX, maxY)
		-- Min must never cross Max or the constraint fights itself on a tiny
		-- viewport and the panel snaps to a size neither value asked for.
		constraint.MinSize = Vector2.new(math.min(PANEL_MIN.X, maxX), math.min(PANEL_MIN.Y, maxY))

		local target = fixed or (vp.X < NARROW_VIEWPORT and PANEL_SCALE_NARROW or PANEL_SCALE_WIDE)
		panel:SetAttribute("ThemeBaseSize", target)
		-- Do not stomp an in-flight open/close tween; it reads the attribute.
		if panel:GetAttribute("ThemeAnimating") ~= true then
			panel.Size = target
		end
	end

	apply()

	local conn: RBXScriptConnection? = nil
	local function watchCamera()
		if conn then
			conn:Disconnect()
		end
		local camera = workspace.CurrentCamera
		if camera then
			conn = camera:GetPropertyChangedSignal("ViewportSize"):Connect(apply)
		end
		apply()
	end
	watchCamera()

	local cameraSwap = workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(watchCamera)
	panel.Destroying:Connect(function()
		if conn then
			conn:Disconnect()
		end
		cameraSwap:Disconnect()
	end)
end

--[[ §5 A modal: thick outline, ONE saturated header bar over a neutral body, an
	 optional ornament and the title on the left and centre of that header, and a
	 large red rounded-square close button top-right with a white X — never a
	 small glyph.

	 Returns (panel, body). Three things are worth knowing about the panel:
	   • `panel.Parent` is the full-screen Backdrop this function also creates.
	     It starts hidden; Theme.open reveals and fades it.
	   • The close button is wired to Theme.close already, and `panel.Closed`
	     (a BindableEvent) fires once the close animation finishes, so Panels can
	     enforce "exactly one open at a time" without touching the button.
	   • `opts.ornament` is the header's personality slot; it can also be set
	     later through `Theme.headerOrnament(panel, kind)`.
]]
function Theme.panel(
	parent: Instance,
	titleText: string,
	headerColor: Color3,
	size: UDim2?,
	opts: PanelOptions?
): (Frame, Frame)
	local options: PanelOptions = opts or {}
	local fixedSize = size or options.size

	local backdrop = Instance.new("Frame")
	backdrop.Name = "Backdrop"
	backdrop.Size = UDim2.fromScale(1, 1)
	backdrop.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	backdrop.BackgroundTransparency = 1
	backdrop.BorderSizePixel = 0
	backdrop.ZIndex = Z_BACKDROP
	backdrop.Visible = false
	-- A dimming scrim, not a surface — it has no edge of its own to outline, and
	-- a black rule around the whole viewport would read as a letterbox.
	-- Active makes the backdrop swallow input, so a click aimed at the dimmed
	-- area cannot reach the HUD buttons or the world behind the modal.
	backdrop.Active = true
	backdrop.Parent = parent

	local panel = Instance.new("Frame")
	panel.Name = "Panel"
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	--[[ CENTRED IN THE VISIBLE AREA, NOT IN THE SCREEN.

		 The two ScreenGuis in this client disagree about the safe area, and until
		 now the wrong one won for interactive content. `CrystalCanyonHud` sets
		 `IgnoreGuiInset = false` with the comment "keep the top row clear of the
		 Roblox topbar". `CrystalCanyonUI` — the layer Panels parents its modal to,
		 carrying every close button and every purchase control — sets it TRUE.

		 Opting out is correct for the BACKDROP: a dimming scrim wants to be
		 full-bleed, and a strip of undimmed world above the topbar would read as a
		 rendering fault. It is wrong for the PANEL, which is interactive, and on a
		 device with a tall topbar or a camera cutout the header — and therefore the
		 close button — can sit underneath it.

		 So the scrim keeps its full bleed and the panel is centred on the visible
		 region instead: shifted down by half the top inset, which is exactly the
		 offset that puts its middle in the middle of what the player can see. Read
		 live rather than assumed, because the inset differs by device and changes
		 when the topbar does. ]]
	local function centreInSafeArea()
		local topLeft = GuiService:GetGuiInset()
		panel.Position = UDim2.new(0.5, 0, 0.5, topLeft.Y / 2)
	end
	centreInSafeArea()
	GuiService:GetPropertyChangedSignal("TopbarInset"):Connect(centreInSafeArea)
	panel.BackgroundColor3 = Palette.UI.Body
	panel.BorderSizePixel = 0
	-- Clipping is what lets a square header bar inherit the panel's rounded top
	-- corners, and what keeps the header's bottom band inside the silhouette.
	panel.ClipsDescendants = true
	panel.ZIndex = Z_BACKDROP + 1
	panel.Parent = backdrop
	corner(panel, Theme.Radius.Panel)
	Palette.stroke(panel, Palette.Outline.Panel)

	--[[ The panel's own drop shadow. This is the one place in the file where the
		 shadow really matters: a modal has to feel like it is floating over the
		 world, and §3 rules out the blur every other engine would use for that.
		 A solid offset plate at low transparency does the same job in the
		 category's own language. Safe here because the panel is the backdrop's
		 only laid-out child. ]]
	attachShadow(panel, Theme.Radius.Panel, Theme.Shadow.PanelOffset, Theme.Shadow.PanelTransparency)

	bindResponsive(panel, fixedSize)

	--[[ §5.1 The header is the only saturated surface, and it is built as a full
		 moulded surface rather than a coloured strip: gradient, diagonal sheen,
		 lit top rim, hard bottom edge.

		 §2/§9.1: the header is a surface, so it carries the outline too. The
		 geometry is worth understanding before touching it, because a naive
		 stroke here would read as two stacked pills with a doubled line:

		   • The stroke is ApplyStrokeMode.Border, so it is drawn wholly OUTSIDE
		     the header. The header is full-bleed — it spans the panel's whole
		     width and starts at its top — so the left, right and top bands land
		     exactly where the panel's own stroke already is, outside the panel
		     rect. `panel.ClipsDescendants` (set above, and it respects the
		     UICorner) trims them away. One outline, not two, and the header's
		     square top corners inherit the panel's radius from the same clip.
		   • Only the bottom band survives, inside the panel: the seam rule.
		     `body` is offset down by HEADER_RULE so it cannot cover it — header
		     and body share a ZIndex, and the later sibling would otherwise win. ]]
	local header = Instance.new("Frame")
	header.Name = "Header"
	header.Size = UDim2.new(1, 0, 0, Theme.Metrics.HeaderHeight)
	header.ZIndex = panel.ZIndex + 1
	header.Parent = panel
	surfaceLayers(header, {
		Fill = headerColor,
		-- Square: the panel's clip is what rounds its top corners, and a radius
		-- here would round the BOTTOM ones too and break the seam rule.
		Radius = UDim.new(0, 0),
		Stroke = Palette.Outline.Panel,
		Edge = Theme.Edge.Header,
		HighlightScale = 1,
		HighlightInset = 20,
		HighlightThickness = 6,
		HighlightTransparency = 0.62,
		Sheen = 24,
	})

	-- Built before the title so the two never fight for the same ZIndex.
	local ornament = options.ornament or defaultOrnament(headerColor)
	if ornament and ornament ~= "none" then
		Theme.headerOrnament(panel, ornament, options.ornamentColor or Palette.lift(headerColor, 0.62))
	end

	--[[ §4 the title in heavy outlined uppercase with a drop shadow. Inset
		 equally on both sides even though the two sides hold different furniture
		 (ornament left, close button right), so the title stays optically centred
		 whether or not an ornament is present. ]]
	local title = displayText(header, Theme.Type.Title)
	title.Name = "Title"
	-- Same two vertical insets as a button caption: clear of the header's hard
	-- bottom edge, then pushed down by one ShadeDrop so the white face lands on
	-- the centre line rather than three pixels above it.
	title.Size = UDim2.new(1, -152, 1, -(Theme.Edge.Header + Theme.Type.ShadeDrop))
	title.Position = UDim2.fromOffset(76, Theme.Type.ShadeDrop)
	title.ZIndex = header.ZIndex + 2
	title.Text = string.upper(titleText)
	title.TextXAlignment = Enum.TextXAlignment.Center

	-- §5.2 large red rounded SQUARE, top-right, white X, outlined.
	local close, closeCaption = makeButton(
		header,
		"X",
		Palette.UI.Close,
		UDim2.fromOffset(Theme.Metrics.CloseSize, Theme.Metrics.CloseSize),
		UDim2.new(1, -14, 0.5, -3),
		Theme.Radius.Button, -- square-ish, not a pill: this is a button, not a glyph
		32,
		5,
		1,
		12,
		-- Small, because the header clips and a full-size plate would be sheared
		-- off against the header's bottom edge.
		Vector2.new(3, 4)
	)
	close.Name = "CloseButton"
	close.AnchorPoint = Vector2.new(1, 0.5)
	-- Above the title so an overlong title can never sit on top of the only way
	-- out of the modal.
	close.ZIndex = title.ZIndex + 1
	closeCaption.ZIndex = close.ZIndex + 1
	for _, layer in { "Edge", "Highlight" } do
		local child = close:FindFirstChild(layer)
		if child and child:IsA("Frame") then
			child.ZIndex = close.ZIndex
		end
	end

	local body = Instance.new("Frame")
	body.Name = "Body"
	-- Starts below the header's outline, not below the header (see HEADER_RULE).
	-- The body is deliberately NOT stroked: it is flush with the panel on three
	-- sides and the same white, so an outline here would only redraw the panel's
	-- own on those sides and double the seam rule on the fourth.
	body.Size = UDim2.new(1, 0, 1, -(Theme.Metrics.HeaderHeight + HEADER_RULE))
	body.Position = UDim2.fromOffset(0, Theme.Metrics.HeaderHeight + HEADER_RULE)
	body.BackgroundColor3 = Palette.UI.Body
	body.BorderSizePixel = 0
	body.ZIndex = panel.ZIndex + 1
	body.Parent = panel

	--[[ §5.1 keeps the body neutral, but a flat sheet of #FFFFFF under a
		 saturated header is the "limited depth" the owner named. A gentle ramp to
		 the cool body tint gives the panel an interior without making it a second
		 coloured surface. UIGradient applies only to the object it is parented
		 to, so this does not tint a single card sitting on it. ]]
	local bodyRamp = Instance.new("UIGradient")
	bodyRamp.Rotation = 90
	bodyRamp.Color = ColorSequence.new(Palette.UI.Body, Palette.UI.BodyTint)
	bodyRamp.Parent = body

	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, Theme.Spacing.Room)
	pad.PaddingBottom = UDim.new(0, Theme.Spacing.Room)
	pad.PaddingLeft = UDim.new(0, Theme.Spacing.Room)
	pad.PaddingRight = UDim.new(0, Theme.Spacing.Room)
	pad.Parent = body

	--[[ The header's cast shadow onto the body — the last of the five depth
		 layers, and the thing that makes scroll content read as passing UNDER the
		 header rather than starting below it.

		 It is a sibling of the body rather than a child of it, for one reason:
		 the body carries a UIPadding, which insets every child, and an inset
		 cast shadow would leave a visible pale gutter down both sides. As a
		 sibling one ZIndex above the body it also covers the body's scroller,
		 which is exactly where the content needs to slide under. ]]
	local cast = Instance.new("Frame")
	cast.Name = "HeaderCast"
	cast.Size = UDim2.new(1, 0, 0, 12)
	cast.Position = UDim2.fromOffset(0, Theme.Metrics.HeaderHeight + HEADER_RULE)
	cast.BackgroundColor3 = Palette.Outline.Color
	cast.BorderSizePixel = 0
	cast.ZIndex = body.ZIndex + 1
	cast.Parent = panel

	local castRamp = Instance.new("UIGradient")
	castRamp.Rotation = 90
	castRamp.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.72),
		NumberSequenceKeypoint.new(1, 1),
	})
	castRamp.Parent = cast

	local closed = Instance.new("BindableEvent")
	closed.Name = "Closed"
	closed.Parent = panel

	close.Activated:Connect(function()
		Theme.close(panel)
	end)

	return panel, body
end

--------------------------------------------------------------------------------
-- open / close animation
--------------------------------------------------------------------------------

-- Weak keys: a destroyed panel must not be kept alive by this table.
local activeTween: { [Frame]: Tween } = setmetatable({}, { __mode = "k" }) :: any

local function baseSizeOf(panel: Frame): UDim2
	local stored = panel:GetAttribute("ThemeBaseSize")
	if typeof(stored) == "UDim2" then
		return stored
	end
	return panel.Size
end

local function scaled(size: UDim2, k: number): UDim2
	return UDim2.new(size.X.Scale * k, size.X.Offset * k, size.Y.Scale * k, size.Y.Offset * k)
end

local function backdropOf(panel: Frame): Frame?
	local p = panel.Parent
	if p and p:IsA("Frame") and p.Name == "Backdrop" then
		return p
	end
	return nil
end

--[[ Scale-in with a slight overshoot, backdrop fading up underneath it.

	 The panel itself is not faded: GuiObject transparency is not inherited, so a
	 fade would mean tweening every descendant individually and would show the
	 body through the header on the way in. Scale plus the backdrop fade buys the
	 same read for two tweens. ]]
function Theme.open(panel: Frame, onDone: (() -> ())?)
	local running = activeTween[panel]
	if running then
		running:Cancel()
		activeTween[panel] = nil
	end

	local base = baseSizeOf(panel)
	local backdrop = backdropOf(panel)
	if backdrop then
		backdrop.Visible = true
		backdrop.BackgroundTransparency = 1
		TweenService:Create(backdrop, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
			BackgroundTransparency = BACKDROP_DIM,
		}):Play()
	end

	panel.Visible = true
	panel.Size = scaled(base, 0.82)
	panel:SetAttribute("ThemeAnimating", true)

	local tween = TweenService:Create(
		panel,
		TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out), -- Back/Out is the overshoot
		{ Size = base }
	)
	activeTween[panel] = tween
	tween.Completed:Connect(function(state: Enum.PlaybackState)
		if activeTween[panel] == tween then
			activeTween[panel] = nil
			panel:SetAttribute("ThemeAnimating", false)
		end
		if state == Enum.PlaybackState.Completed and onDone then
			onDone()
		end
	end)
	tween:Play()
end

--[[ Collapse and hide. Fires the panel's `Closed` BindableEvent when the
	 animation actually finishes — a close that was interrupted by a re-open
	 fires nothing and leaves the panel visible, which is what the interrupting
	 open wanted. ]]
function Theme.close(panel: Frame, onDone: (() -> ())?)
	local running = activeTween[panel]
	if running then
		running:Cancel()
		activeTween[panel] = nil
	end

	local base = baseSizeOf(panel)
	local backdrop = backdropOf(panel)
	if backdrop then
		TweenService:Create(backdrop, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			BackgroundTransparency = 1,
		}):Play()
	end

	panel:SetAttribute("ThemeAnimating", true)
	local tween = TweenService:Create(
		panel,
		TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{ Size = scaled(base, 0.86) }
	)
	activeTween[panel] = tween
	tween.Completed:Connect(function(state: Enum.PlaybackState)
		if state ~= Enum.PlaybackState.Completed then
			return -- cancelled by a re-open; that open owns the panel now
		end
		if activeTween[panel] == tween then
			activeTween[panel] = nil
		end
		panel:SetAttribute("ThemeAnimating", false)
		panel.Size = base
		panel.Visible = false
		if backdrop then
			backdrop.Visible = false
		end

		local signal = panel:FindFirstChild("Closed")
		if signal and signal:IsA("BindableEvent") then
			signal:Fire()
		end
		if onDone then
			onDone()
		end
	end)
	tween:Play()
end

return Theme
