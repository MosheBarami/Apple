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
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Util = require(Shared:WaitForChild("Util"))

-- Sibling require, exactly as Hud reaches for it. The chip is a HUD surface and
-- has to be made of the same material as the rest of them.
local Theme = require(script.Parent:WaitForChild("Theme"))

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
local stepLabel: TextLabel? = nil
local stepBadge: Frame? = nil
local tickArt: Frame? = nil
local meterFill: Frame? = nil
local capsule: Frame? = nil

-- Index of the objective currently drawn. 0 means "nothing drawn yet", which
-- is what suppresses a spurious completion animation on the very first Sync.
local shownIndex = 0
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

	-- Trust the server's flag, but treat the sentinel index as complete too so a
	-- snapshot that carries one without the other still lands in the same state.
	local complete = record.complete == true or index >= DONE_INDEX

	local fallback = Config.Objectives[index]
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
	badgeLabel.Text = tostring(math.min(step.index, DONE_INDEX - 1))

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
		shownIndex = nextStep.index

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

	if shownIndex == 0 then
		-- First paint of the session: land on the current step with no
		-- celebration. A returning player must not be congratulated on load for
		-- objectives they finished days ago.
		shownIndex = step.index
		if step.complete then
			frame.Visible = false
		else
			paint(step)
			frame.Position = HOME
		end
		return
	end

	if step.index > shownIndex then
		-- Advanced — including the advance to DONE_INDEX, which is why the
		-- finish still gets its tick-and-slide before the chip goes away.
		transition(step)
		return
	end

	-- Same step, new progress: the cheap path, and the common one, running on
	-- every Sync while the player is collecting. A step that moved BACKWARDS
	-- (an objective list shortened between sessions, or a hand-edited profile)
	-- lands here too and is adopted silently — there is nothing to celebrate.
	shownIndex = step.index
	if step.complete then
		frame.Visible = false
		frame.Position = HOME
		return
	end
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
