--!strict
--[[
	Crystal Canyon — the onboarding chip.

	A single pill at top-centre reading e.g. "COLLECT 25 SHARDS   12/25". It is
	the only thing the game puts near the middle of the screen, and it earns
	that spot by being the one instruction a new player needs; §6 of the style
	spec keeps the centre otherwise empty, so this chip hugs the top edge and
	vanishes the moment the chain is finished.

	Everything here is derived from server state. The chip never counts anything
	itself — it renders the `objectives` map out of `Sync` and nothing else, so
	it cannot congratulate a player for progress the server did not record.

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
local OFF_LEFT = UDim2.new(-0.35, 0, 0, CHIP_TOP)
local OFF_RIGHT = UDim2.new(1.35, 0, 0, CHIP_TOP)

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

--[[ Progress for one objective id out of the synced map, coerced hard. A
	 missing, nil or non-numeric entry is 0 progress, never an error: a profile
	 saved before an objective existed simply has no key for it. ]]
local function progressOf(map: any, id: string): number
	if typeof(map) ~= "table" then
		return 0
	end
	local raw = tonumber(map[id])
	if not raw or raw ~= raw then -- NaN never satisfies a target
		return 0
	end
	return math.max(0, math.floor(raw))
end

--[[ The active objective is the first unmet one. `#Config.Objectives + 1` is
	 the "chain complete" sentinel every caller below checks against.

	 If the server ever puts an explicit index on Sync we trust it, but the
	 derived value is authoritative-equivalent: both read the same server facts,
	 so the chip is correct whether or not that field exists. ]]
local function activeIndex(state: any): number
	local explicit = tonumber(state.objectiveIndex)
	if explicit then
		return math.clamp(math.floor(explicit), 1, #Config.Objectives + 1)
	end
	for i, obj in Config.Objectives do
		if progressOf(state.objectives, obj.Id) < obj.Target then
			return i
		end
	end
	return #Config.Objectives + 1
end

-- Drawing -----------------------------------------------------------------

local function paint(index: number, state: any)
	local frame, title, count = chip, titleLabel, countLabel
	if not (frame and title and count) then
		return
	end

	local obj = Config.Objectives[index]
	if not obj then
		frame.Visible = false
		return
	end

	title.Text = obj.Text
	-- A "0/1" on a one-shot step ("SELL AT THE GOLD PAD") is noise, so the
	-- counter only appears where counting is actually the instruction.
	if obj.Target > 1 then
		local done = math.min(progressOf(state.objectives, obj.Id), obj.Target)
		count.Text = Util.comma(done) .. "/" .. Util.comma(obj.Target)
		count.Visible = true
	else
		count.Text = ""
		count.Visible = false
	end
	frame.Visible = true
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
local function transition(nextIndex: number, state: any)
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

		local out = TweenService:Create(
			frame,
			TweenInfo.new(SLIDE_OUT, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ Position = OFF_LEFT }
		)
		out:Play()
		out.Completed:Wait()

		badge.Visible = false
		frame.BackgroundColor3 = Palette.UI.CounterFill
		shownIndex = nextIndex

		if nextIndex > #Config.Objectives then
			-- Chain finished. The chip does not linger as an empty pill; the
			-- centre of the screen goes back to the world.
			frame.Visible = false
			frame.Position = HOME
			releaseAndReplay()
			return
		end

		paint(nextIndex, state)
		frame.Position = OFF_RIGHT
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

	local index = activeIndex(state)

	if shownIndex == 0 then
		-- First paint of the session: land on the current step with no
		-- celebration. A returning player must not be congratulated on load for
		-- objectives they finished days ago.
		shownIndex = index
		if index > #Config.Objectives then
			frame.Visible = false
		else
			paint(index, state)
			frame.Position = HOME
		end
		return
	end

	if index > shownIndex then
		transition(index, state)
		return
	end

	-- Same step, new progress. Cheap path, and the common one: this runs on
	-- every Sync while the player is collecting.
	paint(shownIndex, state)
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
