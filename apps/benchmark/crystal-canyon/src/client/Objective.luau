--!strict
--[[
	Crystal Canyon — the onboarding chip.

	A single pill at top-centre reading e.g. "COLLECT 25 SHARDS   12/25". It is
	the only thing the game puts near the middle of the screen, and it earns
	that spot by being the one instruction a new player needs; §6 of the style
	spec keeps the centre otherwise empty, so this chip hugs the top edge and
	vanishes the moment the chain is finished.

	Everything here is derived from server state. The chip never counts anything
	itself and never decides which step is current: it renders the single
	`objective` record out of `Sync` — { index, id, text, progress, target,
	complete } — and nothing else, so it cannot congratulate a player for
	progress the server did not record, and it cannot disagree with the server
	about which step is live.

	The one piece of real machinery is the hand-off animation. Progress can jump
	several steps in one `Sync` (a code redeem that completes two objectives at
	once), and `render` can be called again mid-transition. So a transition owns
	the chip exclusively while it runs and the newest state is parked in
	`pending`, replayed when the animation lets go. Without that, two overlapping
	slides leave the chip stranded off-screen.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Util = require(Shared:WaitForChild("Util"))

local Objective = {}

local CHIP_HEIGHT = 48
local CHIP_TOP = 12
local HOME = UDim2.new(0.5, 0, 0, CHIP_TOP)

--[[ How far past the viewport edge the chip parks while it is "off", in screen
	 pixels. Non-zero for two reasons: a slide that stops exactly on the edge can
	 leave a sliver of outline behind on a fractional-scale display, and the chip
	 sits off-screen for one frame with the NEXT step's text already in it, which
	 is a different width. 40px absorbs both — it is travel nobody can see, so
	 there is nothing to spend by being generous. ]]
local EXIT_MARGIN = 40

--[[ Last resort, for the case where there is nothing to measure against at all:
	 no camera, or the chip somehow unparented. Wide enough to clear any viewport
	 this game is realistically played on. A missing width alone does NOT land
	 here — that is handled with a real number below. ]]
local FALLBACK_SLIDE = 2400

local TICK_HOLD = 0.5 -- how long the green "done" state is held before moving on
local SLIDE_OUT = 0.22
local SLIDE_IN = 0.3

local chip: Frame? = nil
local titleLabel: TextLabel? = nil
local countLabel: TextLabel? = nil
local tickBadge: Frame? = nil
local chipStroke: UIStroke? = nil

-- Index of the objective currently drawn. 0 means "nothing drawn yet", which
-- is what suppresses a spurious completion animation on the very first Sync.
local shownIndex = 0
local busy = false
local pending: any = nil

-- Construction ------------------------------------------------------------

--[[ A checkmark drawn from two rotated bars rather than a glyph. §4 permits
	 emoji only as ornament, never as a functional icon, and a font glyph would
	 not carry the mandatory outline the way a real GuiObject does. ]]
local function buildTick(parent: Frame): Frame
	local badge = Instance.new("Frame")
	badge.Name = "Tick"
	badge.Size = UDim2.fromOffset(26, 26)
	badge.BackgroundColor3 = Palette.UI.Buy
	badge.BorderSizePixel = 0
	badge.Visible = false
	badge.ZIndex = 12
	badge.LayoutOrder = 0
	badge.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = Palette.Radius.Icon
	corner.Parent = badge
	Palette.stroke(badge, Palette.Outline.Icon)

	local short = Instance.new("Frame")
	short.Name = "Short"
	short.AnchorPoint = Vector2.new(0.5, 0.5)
	short.Position = UDim2.new(0.36, 0, 0.62, 0)
	short.Size = UDim2.fromOffset(4, 10)
	short.Rotation = -45
	short.BackgroundColor3 = Palette.UI.TextLight
	short.BorderSizePixel = 0
	short.ZIndex = 13
	short.Parent = badge

	local long = Instance.new("Frame")
	long.Name = "Long"
	long.AnchorPoint = Vector2.new(0.5, 0.5)
	long.Position = UDim2.new(0.58, 0, 0.45, 0)
	long.Size = UDim2.fromOffset(4, 18)
	long.Rotation = 40
	long.BackgroundColor3 = Palette.UI.TextLight
	long.BorderSizePixel = 0
	long.ZIndex = 13
	long.Parent = badge

	return badge
end

--[[ `mountPoint` is Hud's ScreenGui (or a full-screen frame inside it). Sharing
	 Hud's ScreenGui keeps the chip in one ZIndex space with the rest of the HUD,
	 so an open modal reliably draws over it. ]]
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
	frame.BackgroundColor3 = Palette.UI.CounterFill
	frame.BorderSizePixel = 0
	frame.Visible = false
	frame.ZIndex = 10
	frame.Parent = mountPoint

	local corner = Instance.new("UICorner")
	corner.CornerRadius = Palette.Radius.Pill
	corner.Parent = frame
	chipStroke = Palette.stroke(frame, Palette.Outline.Panel)

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 20)
	padding.PaddingRight = UDim.new(0, 20)
	padding.Parent = frame

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.VerticalAlignment = Enum.VerticalAlignment.Center
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 10)
	layout.Parent = frame

	tickBadge = buildTick(frame)

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.Size = UDim2.new(0, 0, 1, 0)
	title.AutomaticSize = Enum.AutomaticSize.X
	title.BackgroundTransparency = 1
	title.LayoutOrder = 1
	title.ZIndex = 12
	title.Text = ""
	Palette.styleText(title, Palette.TextSize.Section)
	title.Parent = frame

	local count = Instance.new("TextLabel")
	count.Name = "Count"
	count.Size = UDim2.new(0, 0, 1, 0)
	count.AutomaticSize = Enum.AutomaticSize.X
	count.BackgroundTransparency = 1
	count.LayoutOrder = 2
	count.ZIndex = 12
	count.Text = ""
	Palette.styleText(count, Palette.TextSize.Section, Palette.UI.SoftCurrency)
	count.Parent = frame

	chip = frame
	titleLabel = title
	countLabel = count
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

local function paint(step: Step)
	local frame, title, count = chip, titleLabel, countLabel
	if not (frame and title and count) then
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
	-- A "0/1" on a one-shot step ("SELL AT THE GOLD PAD") is noise, so the
	-- counter only appears where counting is actually the instruction.
	if step.target > 1 then
		count.Text = Util.comma(step.progress) .. "/" .. Util.comma(step.target)
		count.Visible = true
	else
		count.Text = ""
		count.Visible = false
	end
	frame.Visible = true
end

--[[ The chip is NOT mounted in a full-screen frame. Hud parents it inside the
	 objective cluster, which is only clamp(viewport * 0.34, 300, 480) px wide, so
	 a slide expressed as a fraction of the parent — the old
	 UDim2.new(-0.35, ...) / UDim2.new(1.35, ...) — barely moves it: on a 1920px
	 client the chip stopped at x ~ 552, still fully on screen, blanked there, and
	 re-entered from x ~ 1368, also on screen. The player saw it jump sideways and
	 pop in and out over the playfield, which is exactly the centre-of-screen
	 furniture §6 exists to prevent.

	 So the travel is measured in PIXELS, off the chip's own AbsoluteSize and the
	 mount's absolute centre, and converted back into the parent's offset units.
	 That makes the distance independent of how wide the mount happens to be: at
	 390px and at 1920px the chip leaves the viewport either way. ]]

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
	 units, that park it fully outside the left and right edges of the viewport.

	 The chip's home centre is the mount's centre — that is what AnchorPoint 0.5
	 plus Position 0.5 means — so both distances can be derived without the chip
	 having to be sitting at HOME when we measure, which matters because the
	 incoming distance is measured after the NEXT step's text has changed the
	 width. ]]
local function exitOffsets(frame: Frame): (number, number)
	local camera = workspace.CurrentCamera
	local parent = frame.Parent
	if not camera or not parent or not parent:IsA("GuiObject") then
		return -FALLBACK_SLIDE, FALLBACK_SLIDE
	end

	local viewport = camera.ViewportSize.X
	if viewport <= 0 then
		return -FALLBACK_SLIDE, FALLBACK_SLIDE
	end

	--[[ AutomaticSize can report 0 for a frame that has not been laid out yet.
		 The mount's width is the right stand-in: the chip is normally near it, and
		 over-travelling is harmless where under-travelling is the whole bug. ]]
	local width = math.max(frame.AbsoluteSize.X, parent.AbsoluteSize.X)
	local centre = parent.AbsolutePosition.X + parent.AbsoluteSize.X / 2
	local scale = localScale(frame)
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
	local frame, badge, title, count = chip, tickBadge, titleLabel, countLabel
	if not (frame and badge and title and count) then
		return
	end

	busy = true
	task.spawn(function()
		badge.Visible = true
		badge.Size = UDim2.fromOffset(10, 10)
		TweenService
			:Create(badge, TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
				Size = UDim2.fromOffset(26, 26),
			})
			:Play()
		count.Visible = false
		TweenService
			:Create(frame, TweenInfo.new(0.18), { BackgroundColor3 = Palette.UI.Buy })
			:Play()

		task.wait(TICK_HOLD)

		-- Measured now, while the finished step is still the thing on screen: this
		-- distance has to clear the width the player is actually looking at.
		local exitLeft = exitOffsets(frame)
		local out = TweenService:Create(
			frame,
			TweenInfo.new(SLIDE_OUT, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ Position = homeAt(exitLeft) }
		)
		out:Play()
		out.Completed:Wait()

		badge.Visible = false
		frame.BackgroundColor3 = Palette.UI.CounterFill
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
		local _, enterRight = exitOffsets(frame)
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
