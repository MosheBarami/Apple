--!strict
--[[
	Crystal Canyon — reward feedback.

	Style spec §8: "Reward feedback is immediate and loud — number pop, sound,
	particle burst. Silence reads as breakage." This module is the whole of that
	promise on the client: a world-space number every time the server grants
	something, a toast every time it says something, and a genuinely noisy
	celebration when a zone opens.

	It also owns the two motion primitives that are NOT specific to one surface,
	because both are wanted in more than one place and neither belongs to
	whichever surface happened to need it first:

	  • `Effects.countTo` — a currency number that counts toward its new value
	    instead of snapping to it. The HUD's coin and shard pills want it and so
	    does the balance strip at the foot of every panel; both count FROM the
	    previous snapshot's value, which is the caller's to supply because only
	    the caller knows which snapshot it last drew.
	  • `Effects.pulse` — the brief scale punch that goes with it.

	Five things here are load-bearing and not obvious:

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

	4. EVERY transient instance this module creates is handed to `Debris` with a
	   lifetime as well as being destroyed by its own tween. The tween is the
	   nice path; Debris is the guarantee. A celebration whose tween is cancelled
	   (by a second unlock landing mid-animation, say) must not leave a banner
	   parked on screen forever, and a `Completed` handler is not a guarantee
	   because a cancelled tween never completes.

	5. Anything that reserves a resource — a pool slot, a label's animation
	   claim — reserves it and then does the fallible work inside a pcall with a
	   single release path. An earlier pass set `busy = true` and then threw on
	   the next line, which permanently removed a slot from a 24-entry pool;
	   twenty-four of those and number pops stop for the session. That ordering
	   is repeated deliberately everywhere it applies below.
]]

local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Palette = require(Shared:WaitForChild("Palette"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local Util = require(Shared:WaitForChild("Util"))

--[[ Feedback is UI, so it is built from the same design system as the rest of
	 the UI. A toast assembled out of hand-rolled frames was a large part of why
	 the previous pass read as "too many plain black pill-shaped surfaces": it was
	 a plain black pill, drawn by a file that had never heard of the moulding
	 every other surface in the game carries. Sibling require, exactly as Hud
	 reaches for it. ]]
local Theme = require(script.Parent:WaitForChild("Theme"))
--[[ Reduced motion (§O, §AL). `Theme.motion` has TweenService's `:Create`
	 shape and returns an instant, still-Completed tween when the player has asked
	 their device for less motion. Swapped here rather than at each call site so a
	 tween added later to this module is covered without anyone remembering to. ]]
local TweenService = Theme.motion

local Effects = {}

-- Number pops ------------------------------------------------------------
local POP_DURATION = 0.8
local POP_PUNCH = 0.12 -- the scale-up at the front of the pop
local POP_RISE = 4.5 -- studs travelled while fading
local POP_POOL_MAX = 24 -- hard ceiling; beyond this a pop is dropped, not queued

-- Toasts -----------------------------------------------------------------
local TOAST_WIDTH = 348
local TOAST_HEIGHT = 64
--[[ The toast's coloured left cap. §5's grammar is one saturated block against a
	 neutral one, and this is that shape at notification size: the severity is a
	 solid colour block with a white pictogram in it, not a hairline rule. It is
	 also what stops the toast reading as one more plain dark pill. ]]
local TOAST_CAP = 54
local TOAST_GAP = 10
local TOAST_MARGIN = 16
local TOAST_LIFE = 2.6
local TOAST_VISIBLE_MAX = 3
local TOAST_QUEUE_MAX = 8

-- Celebration ------------------------------------------------------------
local BANNER_LIFE = 2.4
--[[ The banner is sized by SCALE, capped by a UISizeConstraint — not by a flat
	 560px offset. A fixed width overflows a 390pt phone viewport, so the
	 celebration for unlocking a zone would be the one moment the UI ran off the
	 screen. 0.86 of the width keeps the same generous desktop look (clamped well
	 before 1080p) and stays inside the smallest phone. ]]
local BANNER_WIDTH_SCALE = 0.86
local BANNER_MAX = Vector2.new(560, 104)
local BANNER_EDGE = 8
local RAY_COUNT = 6
local BURST_PARTS = 30
local BURST_LIFE = 2
local SHOCKWAVE_LIFE = 0.55
local SCREEN_FLASH_LIFE = 0.42

-- Counting numbers -------------------------------------------------------
local COUNT_DURATION = 0.45
--[[ Above this jump the count still runs but is stretched slightly, so banking a
	 six-figure sale reads as a roll rather than a blur. Below it the default
	 duration is already imperceptibly short. ]]
local COUNT_LONG_JUMP = 5000
local COUNT_LONG_DURATION = 0.75

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
	fanfare = { pitch = 1.6, volume = 0.7 }, -- the second half of the unlock stinger
	error = { pitch = 0.55, volume = 0.5 },
}

--[[ The server's toast vocabulary, in full — and nothing else.

	 Grep the server for `kind =` and you get exactly three strings:
	 `Zones.unlock` and the redeem-success branch of `Net` send "success",
	 `Collect.notifyPackFull` sends "warn", and every refusal funnelled through
	 `Net.reject` sends "error".

	 This table used to hold good/reward/info/bad/error, not one of which any
	 server module has ever emitted. "success" and "warn" therefore missed and
	 fell through to the neutral cyan default below, so the zone-unlock toast
	 was not green and PACK FULL was not coloured as a warning at all. Keys that
	 nothing fires are worse than useless here: they read as coverage.

	 `warn` is amber rather than red on purpose. The cap is the toast's severity
	 code, and a pack that filled up because the player is collecting well is not
	 the same event as a refused purchase. ]]
local KIND_COLOR: { [string]: Color3 } = {
	success = Palette.UI.Buy,
	warn = Palette.UI.Premium,
	error = Palette.UI.Close,
}

--[[ The pictogram drawn in the cap, per kind. Drawn from primitives rather than
	 emoji: §4 permits emoji as ornament only, never as a functional icon. ]]
local KIND_GLYPH: { [string]: string } = {
	success = "tick",
	warn = "bang",
	error = "cross",
}

--[[ An unknown kind — a future server build, or a payload with no `kind` at
	 all — draws neutral rather than guessing at a severity. ]]
local KIND_DEFAULT = Palette.UI.HeaderCyan

--[[ Subscribers to the server's toast verdicts.

	 There is exactly ONE `Notify` subscription on this client: the one in
	 `Effects.init` below. The codes panel needs the same verdict to draw it
	 inline, and the obvious way to get it — a second `OnClientEvent` connection
	 in `Panels.buildCodes` — is what used to happen. Every redeem answer then
	 rendered twice, and because the two call sites classified the kind
	 separately they could disagree: the same event came out green in the panel
	 and cyan in the toast. Panels registers here instead.

	 Listeners are keyed by id rather than appended to an array so unsubscribing
	 is O(1) and cannot shift indices out from under a fan-out in progress. ]]
--[[ The variadic return is not decoration: Luau types `pcall(f, ...)` as
	 returning `(boolean, R...)`, so a listener declared `-> ()` makes
	 `local ok, err = pcall(fn, ...)` a type error and costs the fan-out below
	 its error message. A listener may still return nothing; the return value is
	 ignored either way. ]]
type NotifyListener = (kind: string, text: string, accent: Color3) -> ...any

local notifyListeners: { [number]: NotifyListener } = {}
local nextListenerId = 0

--[[ Register a listener for server toasts; returns its disconnect function.

	 Safe to call before `Effects.init` — the registry is module state, and the
	 boot script inits Panels before Effects. `accent` is the colour this module
	 resolved for the kind, handed over so a subscriber renders the same
	 severity the toast does instead of keeping a second copy of the vocabulary
	 that can drift from this one. ]]
function Effects.onNotify(fn: NotifyListener): () -> ()
	assert(type(fn) == "function", "Effects.onNotify expects a function")
	nextListenerId += 1
	local id = nextListenerId
	notifyListeners[id] = fn
	return function()
		notifyListeners[id] = nil
	end
end

--[[ A listener that throws must not stop the others from being told, and must
	 never take down the toast path it is riding on — hence a pcall each. ]]
local function fanOutNotify(kind: string, text: string)
	local accent = KIND_COLOR[kind] or KIND_DEFAULT
	for _, fn in notifyListeners do
		local ok, err = pcall(fn, kind, text, accent)
		if not ok then
			warn(`[CrystalCanyon] a Notify subscriber errored: {err}`)
		end
	end
end

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

--[[ The celebration currently on screen, if any. A second unlock landing while
	 the first is still playing takes the stage over rather than drawing a second
	 banner on top of it — see `Effects.celebrate`. ]]
local celebrationStage: Frame? = nil

-- Small construction helpers ----------------------------------------------

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ A white bar inside a 32x32 box — the same design grid `Icons` uses — for the
	 three toast cap pictograms.

	 Deliberately NOT taken from `Icons`, even though a tick is in that set. The
	 severity marks are tick / bang / cross, and the shared family has only the
	 tick; drawing one of the three from the icon module and the other two here
	 would give the same component two hands. Three shapes drawn together on the
	 shared grid is the more consistent answer, and if a bang and a cross are ever
	 added to `Icons` this whole block should go. ]]
local GLYPH_BOX = 32

local function bar(parent: Instance, w: number, h: number, x: number, y: number, rot: number?, z: number?): Frame
	local f = Instance.new("Frame")
	f.BackgroundColor3 = Palette.UI.TextLight
	f.BorderSizePixel = 0
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.Size = UDim2.fromScale(w / GLYPH_BOX, h / GLYPH_BOX)
	f.Position = UDim2.fromScale(x, y)
	f.Rotation = rot or 0
	f.ZIndex = z or (parent :: any).ZIndex + 1
	f.Parent = parent
	corner(f, UDim.new(0, 2))
	return f
end

local function capGlyph(parent: Frame, kind: string)
	local art = Instance.new("Frame")
	art.Name = "Glyph"
	art.BackgroundTransparency = 1
	art.AnchorPoint = Vector2.new(0.5, 0.5)
	art.Position = UDim2.fromScale(0.5, 0.5)
	art.Size = UDim2.fromOffset(GLYPH_BOX, GLYPH_BOX)
	art.ZIndex = parent.ZIndex + 1
	art.Parent = parent

	if kind == "tick" then
		bar(art, 6, 13, 0.36, 0.62, -45)
		bar(art, 6, 22, 0.58, 0.44, 40)
	elseif kind == "cross" then
		bar(art, 6, 24, 0.5, 0.5, 45)
		bar(art, 6, 24, 0.5, 0.5, -45)
	elseif kind == "bang" then
		bar(art, 6, 16, 0.5, 0.38)
		bar(art, 6, 6, 0.5, 0.72)
	else
		bar(art, 12, 12, 0.5, 0.5, 45)
	end
end

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

-- Motion primitives --------------------------------------------------------

--[[ §11 BUTTON/COUNTER feedback: a brief overshoot on a surface that just
	 changed. Reuses the target's existing UIScale rather than adding one per
	 call — a pill that punches on every collect would otherwise accumulate one
	 UIScale per shard, and the last one written would win while the rest sat
	 there as garbage. ]]
function Effects.pulse(target: GuiObject, amount: number?)
	if typeof(target) ~= "Instance" or not target:IsA("GuiObject") then
		return
	end
	local existing = target:FindFirstChildOfClass("UIScale")
	local scale: UIScale
	if existing then
		scale = existing
	else
		scale = Instance.new("UIScale")
		scale.Parent = target
	end
	scale.Scale = 1 + (amount or 0.12)
	TweenService:Create(scale, TweenInfo.new(0.26, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 })
		:Play()
end

--[[ Claims on a counting label, one per label, keyed weakly so a destroyed
	 label is not kept alive by its own animation bookkeeping. The value is a
	 generation number: a newer count bumps it, and the older loop sees that its
	 own generation is stale on its next frame and returns. That is what makes
	 counting interruptible — the common case is a second Sync landing while the
	 first count is still rolling. ]]
local countClaims: { [TextLabel]: number } = setmetatable({}, { __mode = "k" }) :: any

--[[ §11 CURRENCY CHANGE: the number counts toward its new value instead of
	 snapping to it.

	 `from` is the caller's to supply and is deliberately not remembered here:
	 only the caller knows which snapshot it last drew, and reading "the number
	 currently in the label" would count from whatever a half-finished previous
	 animation happened to have written — or from a comma-formatted string this
	 function would then have to parse back into a number.

	 No instances are created: the loop writes `label.Text` on a `task.spawn`ed
	 coroutine and stops on the first frame its generation is stale. A failed
	 write (a label destroyed mid-count) releases the claim and returns rather
	 than spinning. ]]
export type CountOptions = {
	duration: number?,
	format: ((value: number) -> string)?,
	pulse: GuiObject?,
}

function Effects.countTo(label: TextLabel, from: number, to: number, options: CountOptions?)
	if typeof(label) ~= "Instance" or not label:IsA("TextLabel") then
		return
	end

	local format = (options and options.format) or Util.comma
	local target = tonumber(to) or 0
	local start = tonumber(from) or target
	-- NaN survives tonumber; it would make every frame's interpolation NaN and
	-- the label would read "-0" forever.
	if target ~= target then
		target = 0
	end
	if start ~= start then
		start = target
	end
	target = math.floor(target)
	start = math.floor(start)

	local claim = (countClaims[label] or 0) + 1
	countClaims[label] = claim

	if options and options.pulse and start ~= target then
		Effects.pulse(options.pulse, 0.1)
	end

	local jump = math.abs(target - start)
	local duration = (options and options.duration)
		or (if jump >= COUNT_LONG_JUMP then COUNT_LONG_DURATION else COUNT_DURATION)

	local function write(value: number): boolean
		local ok = pcall(function()
			label.Text = format(value)
		end)
		if not ok and countClaims[label] == claim then
			countClaims[label] = nil
		end
		return ok
	end

	if jump == 0 or duration <= 0 then
		write(target)
		if countClaims[label] == claim then
			countClaims[label] = nil
		end
		return
	end

	task.spawn(function()
		local began = os.clock()
		while true do
			if countClaims[label] ~= claim then
				return -- a newer count owns the label now
			end
			local t = (os.clock() - began) / duration
			if t >= 1 then
				break
			end
			-- Cubic ease-out: fast off the mark, settling onto the final value,
			-- which is what makes a credited payout read as arriving.
			local eased = 1 - (1 - t) ^ 3
			if not write(math.floor(start + (target - start) * eased + 0.5)) then
				return
			end
			task.wait()
		end
		if countClaims[label] ~= claim then
			return
		end
		write(target)
		if countClaims[label] == claim then
			countClaims[label] = nil
		end
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

--[[ Draw one pop into an already-acquired entry. Split out from Effects.pop so
	 the whole body — every property write and every tween — sits inside one
	 pcall at the call site, with a single release path. ]]
local function drawPop(entry: PopEntry, position: Vector3, text: string, color: Color3?)
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
end

local function releasePop(entry: PopEntry)
	entry.gui.Enabled = false
	entry.busy = false
end

--[[ A world-space number at `position`. Safe to call at collection rate.

	 The pool is the fragile part, so the ordering here is deliberate:

	 1. Arguments are validated BEFORE anything is acquired. `busy` used to be
		set first and the property writes done after, which meant one bad
		argument (a table where a Vector3 was expected, say) threw between the
		two and permanently removed a slot from a 24-entry pool. Twenty-four of
		those and `acquirePop` returns nil forever — every number pop in the
		session gone, from a caller that merely passed the wrong shape.
	 2. Acquisition and release are paired around one pcall, so *any* throw
		inside the draw releases the entry rather than stranding it. On success
		the timer below is the sole release; on failure the catch is. Exactly
		one of the two runs. ]]
function Effects.pop(position: Vector3, text: string, color: Color3?)
	if typeof(position) ~= "Vector3" or type(text) ~= "string" then
		warn(`[CrystalCanyon] Effects.pop ignored a malformed call: position={typeof(position)} text={typeof(text)}`)
		return
	end
	local tint = typeof(color) == "Color3" and color or nil

	local entry = acquirePop()
	if not entry then
		return
	end
	entry.busy = true

	local ok, err = pcall(drawPop, entry, position, text, tint)
	if not ok then
		releasePop(entry)
		warn(`[CrystalCanyon] Effects.pop failed to draw; pool slot released: {err}`)
		return
	end

	--[[ Release on a timer rather than a tween Completed signal: three tweens
		 finish here and only one owns the lifetime. The timer is the single
		 authority, so a cancelled or overridden tween cannot strand the entry
		 as permanently busy. ]]
	task.delay(POP_DURATION, function()
		releasePop(entry)
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
			TweenService:Create(
				toast.frame,
				TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ Position = toastY(i) }
			):Play()
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
	-- The tween is the nice exit; this is the guarantee (header note 4).
	Debris:AddItem(toast.frame, 1)

	pumpToasts()
end

--[[ One toast: a dark body carrying a saturated cap with a white pictogram in
	 it. The cap is the severity code — readable before the words are — and it is
	 what keeps the notification from being one more featureless black pill. ]]
local function showToast(kind: string, text: string)
	local parent = mount
	if not parent then
		return
	end

	local accent = KIND_COLOR[kind] or KIND_DEFAULT
	local slot = #activeToasts + 1

	--[[ The body is dark, as §6 asks — but MIXED toward the severity colour, the
		 same trick `Theme.counter` uses to keep a currency pill from being a black
		 lozenge. A refusal reads as deep red-black and a reward as deep green-black
		 before a single word has been parsed. ]]
	local frame = Theme.surface(parent, {
		Fill = Theme.mix(Palette.UI.CounterFill, Palette.shade(accent, 0.62), 0.5),
		Radius = Theme.Radius.Card,
		Stroke = Palette.Outline.Card,
		Edge = Theme.Edge.Card,
		HighlightInset = 20,
		HighlightThickness = 4,
		HighlightTransparency = 0.76,
		Shadow = Theme.Shadow.Offset,
	}, UDim2.fromOffset(TOAST_WIDTH, TOAST_HEIGHT), UDim2.new(1, TOAST_WIDTH + TOAST_MARGIN, 0, TOAST_MARGIN))
	frame.Name = "Toast"
	frame.AnchorPoint = Vector2.new(1, 0)
	frame.ZIndex = 40
	--[[ Theme built the toast's moulding before that ZIndex was raised, so the
		 hard edge and the lit rim are still sitting on the default. Bring them with
		 it — the same normalisation `Theme.panel` does after re-stacking its close
		 button — or the cap, at ZIndex+1, would draw over the rim it is supposed to
		 sit beside. ]]
	for _, layerName in { "Edge", "Highlight" } do
		local child = frame:FindFirstChild(layerName)
		if child and child:IsA("Frame") then
			child.ZIndex = frame.ZIndex
		end
	end

	local cap = Theme.surface(frame, {
		Fill = accent,
		Radius = Theme.Radius.Card,
		Stroke = 0,
		Edge = 0,
		HighlightInset = 14,
		HighlightThickness = 4,
		HighlightTransparency = 0.62,
	}, UDim2.new(0, TOAST_CAP, 1, 0))
	cap.Name = "Cap"
	cap.ZIndex = frame.ZIndex + 1

	--[[ The cap's UICorner rounds all four of its corners; this squares the two
		 that meet the message, so the cap reads as a block butted against the body
		 rather than as a pill floating inside it.

		 It goes through `Theme.surface` for one specific reason: the patch has to
		 be indistinguishable from the cap it is patching, and a UIGradient shades
		 the object it is parented to but not that object's children. A flat fill
		 here would be a visibly brighter rectangle down the cap's right-hand third.
		 Built as a surface it gets the SAME ramp over the SAME full height, so the
		 two match at every pixel. No stroke and no edge: it is shading inside a
		 surface whose outline already encloses it. ]]
	local square = Theme.surface(cap, {
		Fill = accent,
		Radius = UDim.new(0, 0),
		Stroke = 0,
		Edge = 0,
		Highlight = false,
	}, UDim2.new(0, 16, 1, 0), UDim2.new(1, 0, 0.5, 0))
	square.Name = "SquareOff"
	square.AnchorPoint = Vector2.new(1, 0.5)
	square.ZIndex = cap.ZIndex

	--[[ The black rule between the cap and the message. §5's construction diagram
		 puts one exactly here, between the saturated block and the neutral one. ]]
	local rule = Instance.new("Frame")
	rule.Name = "Rule"
	rule.AnchorPoint = Vector2.new(1, 0.5)
	rule.Position = UDim2.new(1, 0, 0.5, 0)
	rule.Size = UDim2.new(0, Palette.Outline.Card, 1, 0)
	rule.BackgroundColor3 = Palette.Outline.Color
	rule.BorderSizePixel = 0
	rule.ZIndex = cap.ZIndex + 2
	rule.Parent = cap

	capGlyph(cap, KIND_GLYPH[kind] or "dot")

	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.Position = UDim2.fromOffset(TOAST_CAP + 14, 0)
	label.Size = UDim2.new(1, -(TOAST_CAP + 26), 1, -Theme.Edge.Card)
	label.BackgroundTransparency = 1
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextWrapped = true
	label.ZIndex = frame.ZIndex + 2
	label.Text = string.upper(text)
	Palette.styleText(label, Theme.Type.Small + 2)
	label.Parent = frame

	local toast: Toast = { frame = frame, slot = slot }
	table.insert(activeToasts, toast)

	TweenService:Create(frame, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
		Position = toastY(slot),
	}):Play()

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
	--[[ Both of the server's negative kinds get the low cue. "warn" earns it as
		 much as "error" does: PACK FULL is the moment collection silently stops
		 paying, and §8 is explicit that silence there reads as breakage. ]]
	if kind == "error" or kind == "warn" then
		Effects.playCue("error")
	elseif kind == "success" then
		Effects.playCue("purchase")
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
		p.AssemblyLinearVelocity = Vector3.new(rng:NextNumber(-22, 22), rng:NextNumber(28, 46), rng:NextNumber(-22, 22))
		p.AssemblyAngularVelocity = Vector3.new(rng:NextNumber(-8, 8), rng:NextNumber(-8, 8), rng:NextNumber(-8, 8))
		Debris:AddItem(p, BURST_LIFE)
	end
end

--[[ A brief wash of the accent colour over the whole screen. This is the part
	 that makes the unlock louder than a toast rather than merely bigger: the
	 player's peripheral vision registers it before they have read anything. ]]
local function screenFlash(accent: Color3)
	local parent = mount
	if not parent then
		return
	end
	local flash = Instance.new("Frame")
	flash.Name = "UnlockFlash"
	flash.Size = UDim2.fromScale(1, 1)
	flash.BackgroundColor3 = Palette.lift(accent, 0.65)
	flash.BackgroundTransparency = 0.5
	flash.BorderSizePixel = 0
	-- A wash, not a surface: it has no edge of its own, so it carries no outline.
	flash.ZIndex = 56
	flash.Active = false
	flash.Parent = parent
	Debris:AddItem(flash, SCREEN_FLASH_LIFE + 0.4)

	TweenService:Create(flash, TweenInfo.new(SCREEN_FLASH_LIFE, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		BackgroundTransparency = 1,
	}):Play()
end

--[[ An outlined ring expanding out of the centre. It is transient by design —
	 §6 keeps the centre of the screen empty, and "empty" is about the furniture
	 that stays there, not about a half-second of celebration. ]]
local function shockwave(accent: Color3)
	local parent = mount
	if not parent then
		return
	end
	local ring = Instance.new("Frame")
	ring.Name = "Shockwave"
	ring.AnchorPoint = Vector2.new(0.5, 0.5)
	ring.Position = UDim2.fromScale(0.5, 0.5)
	ring.Size = UDim2.fromOffset(80, 80)
	ring.BackgroundTransparency = 1
	ring.BorderSizePixel = 0
	ring.ZIndex = 57
	ring.Parent = parent
	corner(ring, Theme.Radius.Pill)
	Debris:AddItem(ring, SHOCKWAVE_LIFE + 0.4)

	local edge = Instance.new("UIStroke")
	edge.Color = Palette.lift(accent, 0.35)
	edge.Thickness = 10
	edge.Parent = ring

	local out = TweenInfo.new(SHOCKWAVE_LIFE, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(ring, out, { Size = UDim2.fromScale(1.1, 1.1) }):Play()
	TweenService:Create(edge, out, { Transparency = 1, Thickness = 2 }):Play()
end

--[[ The banner and the sunburst behind it, built as ONE stage frame so the two
	 cannot come apart and so a second unlock can retire both with a single
	 Destroy. ]]
local function banner(text: string, accent: Color3)
	local parent = mount
	if not parent then
		return
	end

	-- A second unlock takes the stage over rather than drawing on top of the
	-- first. Nothing about the first is worth preserving by then.
	local previous = celebrationStage
	if previous then
		previous:Destroy()
		celebrationStage = nil
	end

	local stage = Instance.new("Frame")
	stage.Name = "UnlockStage"
	stage.AnchorPoint = Vector2.new(0.5, 0.5)
	stage.Position = UDim2.fromScale(0.5, 0.26)
	stage.Size = UDim2.new(1, 0, 0, 220)
	stage.BackgroundTransparency = 1
	stage.BorderSizePixel = 0
	stage.ZIndex = 58
	stage.Parent = parent
	celebrationStage = stage
	Debris:AddItem(stage, BANNER_LIFE + 1.2)

	-- Sunburst. Each bar is two rays, so RAY_COUNT bars read as twice that many
	-- spokes; they are shading behind the banner and carry no outline.
	local rays = Instance.new("Frame")
	rays.Name = "Rays"
	rays.AnchorPoint = Vector2.new(0.5, 0.5)
	rays.Position = UDim2.fromScale(0.5, 0.5)
	rays.Size = UDim2.fromScale(1, 1)
	rays.BackgroundTransparency = 1
	rays.BorderSizePixel = 0
	rays.ZIndex = stage.ZIndex
	rays.Parent = stage

	for i = 1, RAY_COUNT do
		local ray = Instance.new("Frame")
		ray.AnchorPoint = Vector2.new(0.5, 0.5)
		ray.Position = UDim2.fromScale(0.5, 0.5)
		ray.Size = UDim2.new(0, 22, 2.4, 0)
		ray.Rotation = (i - 1) * (180 / RAY_COUNT)
		ray.BackgroundColor3 = Palette.lift(accent, 0.6)
		ray.BackgroundTransparency = 0.82
		ray.BorderSizePixel = 0
		ray.ZIndex = rays.ZIndex
		ray.Parent = rays
	end

	TweenService:Create(rays, TweenInfo.new(BANNER_LIFE + 0.6, Enum.EasingStyle.Linear), { Rotation = 26 }):Play()

	local frame = Theme.surface(stage, {
		Fill = accent,
		Radius = Theme.Radius.Panel,
		Stroke = Palette.Outline.Panel,
		Edge = BANNER_EDGE,
		HighlightInset = 24,
		HighlightThickness = 6,
		HighlightTransparency = 0.6,
		Sheen = 26,
		Shadow = Theme.Shadow.PanelOffset,
		ShadowTransparency = Theme.Shadow.PanelTransparency,
	}, UDim2.new(BANNER_WIDTH_SCALE, 0, 0, 0), UDim2.fromScale(0.5, 0.5))
	frame.Name = "UnlockBanner"
	frame.AnchorPoint = Vector2.new(0.5, 0.5)
	frame.ZIndex = stage.ZIndex + 2

	--[[ The cap that makes the scale safe: MaxSize keeps the desktop banner at
		 the intended size, and the width scale is what shrinks on a phone.
		 MaxSize only — a MinSize is enforced every frame, so it would be applied
		 to the zero-height start and end sizes too and flatten both halves of the
		 grow/collapse animation. ]]
	local limit = Instance.new("UISizeConstraint")
	limit.MaxSize = BANNER_MAX
	limit.Parent = frame

	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, -BANNER_EDGE)
	label.BackgroundTransparency = 1
	label.ZIndex = frame.ZIndex + 1
	label.Text = text
	Palette.styleText(label, Theme.Type.Title)
	--[[ Zone names are authored, not user text, but the banner is narrower on a
		 phone than the size the title was measured against. Scaling down to a
		 floor keeps "FROST HOLLOW UNLOCKED!" on one line instead of clipping it;
		 the max keeps it from growing past the display size §4 asks for. ]]
	label.TextScaled = true
	local textLimit = Instance.new("UITextSizeConstraint")
	textLimit.MaxTextSize = Theme.Type.Title
	textLimit.MinTextSize = 16
	textLimit.Parent = label
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 20)
	pad.PaddingRight = UDim.new(0, 20)
	pad.Parent = label
	label.Parent = frame

	local grown = UDim2.new(BANNER_WIDTH_SCALE, 0, 0, BANNER_MAX.Y)
	local collapsed = UDim2.new(BANNER_WIDTH_SCALE, 0, 0, 0)

	TweenService:Create(frame, TweenInfo.new(0.34, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Size = grown })
		:Play()

	task.delay(BANNER_LIFE, function()
		-- The stage may already be gone (a second unlock, or Debris); tweening a
		-- destroyed instance is harmless but reparenting checks are not needed —
		-- the Destroy below is idempotent and Debris is the backstop either way.
		if stage.Parent == nil then
			return
		end
		local out = TweenService:Create(frame, TweenInfo.new(0.26, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			Size = collapsed,
		})
		out.Completed:Connect(function()
			if celebrationStage == stage then
				celebrationStage = nil
			end
			stage:Destroy()
		end)
		out:Play()
	end)
end

--[[ The loud one. Fires on the server's `Unlocked` cue, never on a local guess
	 that a purchase succeeded — the celebration must mean the coins were
	 actually spent, or it teaches the player to distrust it.

	 §11 asks for this to be louder than a normal toast, and "louder" is four
	 channels at once rather than one bigger box: a screen wash, an expanding
	 ring, a sunburst banner, and physical debris thrown off the player. ]]
function Effects.celebrate(zoneId: string)
	local zone = Config.zoneById(zoneId)
	local accent = zone and zone.AccentColor or Palette.UI.Premium
	local name = zone and zone.Name or "NEW ZONE"

	Effects.playCue("unlock")
	-- The second half of the stinger, offset so the two read as one rising cue
	-- rather than as a single flat ping.
	task.delay(0.14, function()
		Effects.playCue("fanfare")
	end)

	screenFlash(accent)
	shockwave(accent)
	banner(name .. " UNLOCKED!", accent)

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		burst(root.Position + Vector3.new(0, 2, 0), accent)
		-- A second wave a beat later; one instantaneous puff reads as a glitch,
		-- two reads as a celebration.
		task.delay(0.22, function()
			local stillThere = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
			if stillThere and stillThere:IsA("BasePart") then
				burst(stillThere.Position + Vector3.new(0, 3, 0), Palette.UI.Premium)
			end
		end)
	end
end

-- Wiring ------------------------------------------------------------------

--[[ `mountPoint` is the ScreenGui (or a full-screen Frame inside it) that the
	 boot script owns. Effects deliberately does not create its own ScreenGui:
	 two ScreenGuis means two ZIndex spaces, and a toast that draws under a modal
	 is the bug that follows. ]]
function Effects.init(mountPoint: Instance)
	if mount then
		return -- init is idempotent; a second boot must not double-bind remotes
	end

	--[[ Fail HERE, loudly, on a bad mount.

		 A caller once passed the client's context TABLE instead of the ScreenGui.
		 Nothing complained: `mount` accepted it, and the failure surfaced minutes
		 later as `frame.Parent = <table>` inside the first toast — a stack trace
		 pointing at `showToast`, from a mistake made at boot. An assert costs one
		 line and moves that error back to the line that caused it. ]]
	assert(
		typeof(mountPoint) == "Instance",
		`Effects.init requires the ScreenGui (or a frame inside it) to parent toasts into, got {typeof(mountPoint)}`
	)

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
		--[[ Subscribers are told AFTER the toast is queued, so a slow or
			 throwing subscriber can never delay or swallow the feedback the
			 player is owed. ]]
		fanOutNotify(kind, payload.text)
	end)

	Remotes.get("Unlocked").OnClientEvent:Connect(function(payload: any)
		if typeof(payload) ~= "table" or type(payload.zoneId) ~= "string" then
			return
		end
		Effects.celebrate(payload.zoneId)
	end)
end

return Effects
