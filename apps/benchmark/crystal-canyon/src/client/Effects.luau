--!strict
--[[
	Crystal Canyon — reward feedback.

	Style spec §8: "Reward feedback is immediate and loud — number pop, sound,
	particle burst. Silence reads as breakage." This module is the whole of that
	promise on the client: a world-space number every time the server grants
	something, a toast every time it says something, and a genuinely noisy
	celebration when a zone opens.

	Three things here are load-bearing and not obvious:

	1. `Pop` fires several times a second per player. Every pop therefore comes
	   out of a fixed pool of Attachment + BillboardGui pairs that are recycled,
	   never destroyed, and the pool is hard-capped. A naive
	   Instance.new-per-pop implementation leaks under a magnet upgrade, which
	   is exactly the moment the game is meant to feel best.

	2. Toasts are queued, not stacked. Two notifications arriving in the same
	   frame (sell refused + rate limited, say) would otherwise draw on top of
	   each other and read as one unreadable smear.

	3. Sound uses one asset id that ships with Roblox, pitch-varied per cue,
	   rather than five invented ids. An id that does not resolve is silent at
	   best and an error at worst, and a broken audio call must never take the
	   rest of the feedback down with it — hence the pcall wrappers.
]]

local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local Effects = {}

-- Number pops ------------------------------------------------------------
local POP_DURATION = 0.8
local POP_PUNCH = 0.12 -- the scale-up at the front of the pop
local POP_RISE = 4.5 -- studs travelled while fading
local POP_POOL_MAX = 24 -- hard ceiling; beyond this a pop is dropped, not queued

-- Toasts -----------------------------------------------------------------
local TOAST_WIDTH = 330
local TOAST_HEIGHT = 58
local TOAST_GAP = 10
local TOAST_MARGIN = 16
local TOAST_LIFE = 2.6
local TOAST_VISIBLE_MAX = 3
local TOAST_QUEUE_MAX = 8

-- Celebration ------------------------------------------------------------
local BANNER_LIFE = 2.2
local BURST_PARTS = 20
local BURST_LIFE = 1.8

--[[ One shipped Roblox asset, re-pitched per cue. See the header: inventing
	 asset ids for "sell" and "unlock" would be a guess, and a guess that fails
	 is silence, which §8 explicitly calls breakage. A pitch ladder off a known
	 id is worse than bespoke audio but it is *reliably* worse. ]]
local BASE_SOUND = "rbxasset://sounds/electronicpingshort.wav"
local CUES: { [string]: { pitch: number, volume: number } } = {
	collect = { pitch = 1.45, volume = 0.35 },
	sell = { pitch = 1.05, volume = 0.6 },
	purchase = { pitch = 1.25, volume = 0.6 },
	unlock = { pitch = 0.8, volume = 0.85 },
	error = { pitch = 0.55, volume = 0.5 },
}

local KIND_COLOR: { [string]: Color3 } = {
	good = Palette.UI.Buy,
	reward = Palette.UI.Premium,
	info = Palette.UI.HeaderCyan,
	bad = Palette.UI.Close,
	error = Palette.UI.Close,
}

type PopEntry = {
	attachment: Attachment,
	gui: BillboardGui,
	label: TextLabel,
	stroke: UIStroke?,
	busy: boolean,
}

type Toast = {
	frame: Frame,
	slot: number,
}

local player = Players.LocalPlayer
local rng = Random.new()

local mount: Instance? = nil
local anchor: Part? = nil
local popPool: { PopEntry } = {}
local activeToasts: { Toast } = {}
local toastQueue: { { kind: string, text: string } } = {}
local sounds: { [string]: Sound } = {}

-- Sound -------------------------------------------------------------------

local function cueSound(name: string): Sound?
	local existing = sounds[name]
	if existing then
		return existing
	end
	local cue = CUES[name]
	if not cue then
		return nil
	end
	local ok, made = pcall(function(): Sound
		local s = Instance.new("Sound")
		s.Name = "CC_" .. name
		s.SoundId = BASE_SOUND
		s.Volume = cue.volume
		s.PlaybackSpeed = cue.pitch
		s.Parent = SoundService
		return s
	end)
	if not ok then
		return nil
	end
	sounds[name] = made
	return made
end

--[[ Public so Panels/Hud can click-cue without duplicating the pcall dance.
	 A failed cue is deliberately silent: audio is garnish, and an audio error
	 must not surface as a script error mid-purchase. ]]
function Effects.playCue(name: string)
	local s = cueSound(name)
	if not s then
		return
	end
	pcall(function()
		-- Slight jitter so a burst of collects does not sound like a machine.
		local cue = CUES[name]
		s.PlaybackSpeed = cue.pitch * (0.96 + rng:NextNumber() * 0.08)
		s:Play()
	end)
end

-- Number pops -------------------------------------------------------------

local function ensureAnchor(): Part
	local existing = anchor
	if existing and existing.Parent then
		return existing
	end
	local part = Instance.new("Part")
	part.Name = "CrystalCanyonFXAnchor"
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Transparency = 1
	part.Size = Vector3.new(1, 1, 1)
	part.CFrame = CFrame.new(0, 0, 0)
	part.Parent = workspace
	anchor = part
	return part
end

local function newPopEntry(): PopEntry
	local att = Instance.new("Attachment")
	att.Parent = ensureAnchor()

	local gui = Instance.new("BillboardGui")
	gui.Name = "Pop"
	gui.Size = UDim2.fromOffset(160, 60)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.MaxDistance = 300
	gui.Enabled = false
	gui.Parent = att

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = ""
	-- §4: heavy white type with a real black stroke. styleText attaches it.
	Palette.styleText(label, 34)
	label.Parent = gui

	local entry: PopEntry = {
		attachment = att,
		gui = gui,
		label = label,
		stroke = label:FindFirstChildOfClass("UIStroke"),
		busy = false,
	}
	return entry
end

local function acquirePop(): PopEntry?
	for _, entry in popPool do
		if not entry.busy then
			return entry
		end
	end
	if #popPool >= POP_POOL_MAX then
		--[[ Over budget. Dropping the newest pop is the right failure: the
			 player is already drowning in feedback at this rate, and growing
			 the pool without bound is how this module becomes the memory leak
			 that tanks the session. ]]
		return nil
	end
	local entry = newPopEntry()
	table.insert(popPool, entry)
	return entry
end

--[[ A world-space number at `position`. Safe to call at collection rate. ]]
function Effects.pop(position: Vector3, text: string, color: Color3?)
	local entry = acquirePop()
	if not entry then
		return
	end
	entry.busy = true

	entry.attachment.WorldPosition = position
	entry.gui.StudsOffset = Vector3.new(rng:NextNumber(-0.6, 0.6), 0, 0)
	entry.gui.Enabled = true
	entry.label.Text = text
	entry.label.TextColor3 = color or Palette.UI.SoftCurrency
	entry.label.TextTransparency = 0
	entry.label.TextSize = 22
	if entry.stroke then
		entry.stroke.Transparency = 0
	end

	-- Punch first, then rise and fade. Two tweens rather than one because the
	-- overshoot on the punch is what makes the number read as *impact*.
	TweenService
		:Create(
			entry.label,
			TweenInfo.new(POP_PUNCH, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
			{ TextSize = 36 }
		)
		:Play()

	local drift = TweenInfo.new(POP_DURATION, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(entry.gui, drift, {
		StudsOffset = entry.gui.StudsOffset + Vector3.new(0, POP_RISE, 0),
	}):Play()
	TweenService:Create(entry.label, drift, { TextTransparency = 1 }):Play()
	if entry.stroke then
		TweenService:Create(entry.stroke, drift, { Transparency = 1 }):Play()
	end

	--[[ Release on a timer rather than a tween Completed signal: three tweens
		 finish here and only one owns the lifetime. The timer is the single
		 authority, so a cancelled or overridden tween cannot strand the entry
		 as permanently busy. ]]
	task.delay(POP_DURATION, function()
		entry.gui.Enabled = false
		entry.busy = false
	end)
end

-- Toasts ------------------------------------------------------------------

local function toastY(slot: number): UDim2
	local y = TOAST_MARGIN + (slot - 1) * (TOAST_HEIGHT + TOAST_GAP)
	return UDim2.new(1, -TOAST_MARGIN, 0, y)
end

local function reflowToasts()
	for i, toast in activeToasts do
		if toast.slot ~= i then
			toast.slot = i
			TweenService
				:Create(
					toast.frame,
					TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
					{ Position = toastY(i) }
				)
				:Play()
		end
	end
end

local pumpToasts -- forward declared; dismiss feeds the queue back into show

local function dismissToast(toast: Toast)
	local index = table.find(activeToasts, toast)
	if not index then
		return -- already dismissed; a double-dismiss must not shift the stack
	end
	table.remove(activeToasts, index)
	reflowToasts()

	local slide = TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	local tween = TweenService:Create(toast.frame, slide, {
		Position = UDim2.new(1, TOAST_WIDTH + TOAST_MARGIN, 0, toast.frame.Position.Y.Offset),
	})
	tween.Completed:Connect(function()
		toast.frame:Destroy()
	end)
	tween:Play()

	pumpToasts()
end

local function showToast(kind: string, text: string)
	local parent = mount
	if not parent then
		return
	end

	local accent = KIND_COLOR[kind] or Palette.UI.HeaderCyan
	local slot = #activeToasts + 1

	local frame = Instance.new("Frame")
	frame.Name = "Toast"
	frame.AnchorPoint = Vector2.new(1, 0)
	frame.Size = UDim2.fromOffset(TOAST_WIDTH, TOAST_HEIGHT)
	frame.Position = UDim2.new(1, TOAST_WIDTH + TOAST_MARGIN, 0, TOAST_MARGIN)
	frame.BackgroundColor3 = Palette.UI.CounterFill
	frame.BorderSizePixel = 0
	frame.ZIndex = 40
	frame.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = Palette.Radius.Card
	corner.Parent = frame
	Palette.stroke(frame, Palette.Outline.Card)

	-- §3: depth is a hard edge, not a blur. The accent bar doubles as the
	-- colour code for the message kind, so severity is readable pre-literacy.
	local bar = Instance.new("Frame")
	bar.Name = "Accent"
	bar.Size = UDim2.new(0, 10, 1, 0)
	bar.BackgroundColor3 = accent
	bar.BorderSizePixel = 0
	bar.ZIndex = 41
	bar.Parent = frame
	local barCorner = Instance.new("UICorner")
	barCorner.CornerRadius = Palette.Radius.Card
	barCorner.Parent = bar

	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.Size = UDim2.new(1, -32, 1, -12)
	label.Position = UDim2.fromOffset(24, 6)
	label.BackgroundTransparency = 1
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextWrapped = true
	label.ZIndex = 42
	label.Text = text
	Palette.styleText(label, Palette.TextSize.Small + 2)
	label.Parent = frame

	local toast: Toast = { frame = frame, slot = slot }
	table.insert(activeToasts, toast)

	TweenService
		:Create(frame, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
			Position = toastY(slot),
		})
		:Play()

	task.delay(TOAST_LIFE, function()
		dismissToast(toast)
	end)
end

function pumpToasts()
	while #activeToasts < TOAST_VISIBLE_MAX and #toastQueue > 0 do
		local queued = table.remove(toastQueue, 1)
		if queued then
			showToast(queued.kind, queued.text)
		end
	end
end

--[[ Queue a toast. Beyond TOAST_QUEUE_MAX the OLDEST waiting message is
	 discarded: under a flood the newest message is the one describing what the
	 player just tried to do, so it is the one worth keeping. ]]
function Effects.notify(kind: string, text: string)
	if type(text) ~= "string" or text == "" then
		return
	end
	table.insert(toastQueue, { kind = kind, text = text })
	while #toastQueue > TOAST_QUEUE_MAX do
		table.remove(toastQueue, 1)
	end
	if kind == "bad" or kind == "error" then
		Effects.playCue("error")
	end
	pumpToasts()
end

-- Zone unlock celebration --------------------------------------------------

local function burst(origin: Vector3, color: Color3)
	for _ = 1, BURST_PARTS do
		local p = Instance.new("Part")
		p.Size = Vector3.new(0.7, 0.7, 0.7) * rng:NextNumber(0.7, 1.6)
		p.Color = rng:NextNumber() < 0.35 and Palette.UI.Premium or color
		p.Material = Enum.Material.SmoothPlastic
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.CastShadow = false
		p.Position = origin + Vector3.new(rng:NextNumber(-1.5, 1.5), rng:NextNumber(0, 2), rng:NextNumber(-1.5, 1.5))
		p.Parent = workspace
		-- Set velocity after parenting; an unparented assembly has no assembly
		-- to push, so doing this earlier silently does nothing.
		p.AssemblyLinearVelocity =
			Vector3.new(rng:NextNumber(-22, 22), rng:NextNumber(28, 46), rng:NextNumber(-22, 22))
		p.AssemblyAngularVelocity = Vector3.new(rng:NextNumber(-8, 8), rng:NextNumber(-8, 8), rng:NextNumber(-8, 8))
		Debris:AddItem(p, BURST_LIFE)
	end
end

local function banner(text: string, accent: Color3)
	local parent = mount
	if not parent then
		return
	end

	local frame = Instance.new("Frame")
	frame.Name = "UnlockBanner"
	frame.AnchorPoint = Vector2.new(0.5, 0.5)
	frame.Position = UDim2.new(0.5, 0, 0.24, 0)
	frame.Size = UDim2.fromOffset(0, 0)
	frame.BackgroundColor3 = accent
	frame.BorderSizePixel = 0
	frame.ZIndex = 60
	frame.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = Palette.Radius.Panel
	corner.Parent = frame
	Palette.stroke(frame, Palette.Outline.Panel)

	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 90
	gradient.Color = ColorSequence.new(Palette.lift(accent), Palette.shade(accent, 0.18))
	gradient.Parent = frame

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.ZIndex = 61
	label.Text = text
	Palette.styleText(label, Palette.TextSize.Title)
	label.Parent = frame

	TweenService
		:Create(frame, TweenInfo.new(0.32, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
			Size = UDim2.fromOffset(520, 96),
		})
		:Play()

	task.delay(BANNER_LIFE, function()
		local out = TweenService:Create(frame, TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			Size = UDim2.fromOffset(520, 0),
		})
		out.Completed:Connect(function()
			frame:Destroy()
		end)
		out:Play()
	end)
end

--[[ The loud one. Fires on the server's `Unlocked` cue, never on a local guess
	 that a purchase succeeded — the celebration must mean the coins were
	 actually spent, or it teaches the player to distrust it. ]]
function Effects.celebrate(zoneId: string)
	local zone = Config.zoneById(zoneId)
	local accent = zone and zone.AccentColor or Palette.UI.Premium
	local name = zone and zone.Name or "NEW ZONE"

	Effects.playCue("unlock")
	banner(name .. " UNLOCKED!", accent)

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		burst(root.Position + Vector3.new(0, 2, 0), accent)
	end
end

-- Wiring ------------------------------------------------------------------

--[[ `mountPoint` is the ScreenGui (or a full-screen Frame inside it) that Hud
	 owns. Effects deliberately does not create its own ScreenGui: two
	 ScreenGuis means two ZIndex spaces, and a toast that draws under a modal is
	 the bug that follows. ]]
function Effects.init(mountPoint: Instance)
	if mount then
		return -- init is idempotent; a second boot must not double-bind remotes
	end
	mount = mountPoint

	Remotes.get("Pop").OnClientEvent:Connect(function(payload: any)
		if typeof(payload) ~= "table" then
			return
		end
		if typeof(payload.position) ~= "Vector3" or type(payload.text) ~= "string" then
			return
		end
		local color = typeof(payload.color) == "Color3" and payload.color or nil
		Effects.pop(payload.position, payload.text, color)
		Effects.playCue("collect")
	end)

	Remotes.get("Notify").OnClientEvent:Connect(function(payload: any)
		if typeof(payload) ~= "table" or type(payload.text) ~= "string" then
			return
		end
		local kind = type(payload.kind) == "string" and payload.kind or "info"
		Effects.notify(kind, payload.text)
	end)

	Remotes.get("Unlocked").OnClientEvent:Connect(function(payload: any)
		if typeof(payload) ~= "table" or type(payload.zoneId) ~= "string" then
			return
		end
		Effects.celebrate(payload.zoneId)
	end)
end

return Effects
