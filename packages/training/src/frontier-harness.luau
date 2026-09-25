--!nolint
--[[
  A RECORDING ROBLOX SHIM, SO "DOES THIS MODEL KNOW ROBLOX" CAN BE DECIDED BY RUNNING THE CODE.

  WHY THIS EXISTS AND WHY IT IS NOT A REGEX. Every interesting way to be wrong about Roblox uses
  the right vocabulary. All four of these mention the correct classes and pass any `contains` or
  `regex` check written against them:

      humanoid:LoadAnimation(anim)              animator:LoadAnimation(anim)
      coins.Value = coins.Value - price         coins.Value = coins.Value - clientPrice
      local d = store:GetAsync(k); store:SetAsync(k, d + 50)
      store:UpdateAsync(k, function(d) return (d or 0) + 50 end)

  The left column is the deprecated call, the client-priced debit and the lost update. The right
  column is correct. The difference is never in the words; it is in WHICH OBJECT the method was
  called on, WHERE the number came from, and WHETHER the read and the write were one operation.
  So this file does not read the model's code. It RUNS it, under a stand-in for the engine, and
  records what was actually called on what. The scorer then asks questions of that recording, and
  a probe fires the model's own handlers with hostile input and reads the state that came out.

  WHAT THIS IS NOT. It is not Roblox. It renders nothing, simulates no physics and replicates
  nothing. It models exactly the surface these benchmark items need, and three consequences are
  written down here rather than left to be discovered:

    - A PROPERTY THIS SHIM HAS NO DEFAULT FOR READS AS `nil`, and if the model then indexes it the
      chunk throws. That error is MY gap, not the model's mistake. Every runtime error is reported
      verbatim under `status = "error"` so a failure of the harness cannot be counted as a failure
      of the model without a person reading the sentence. This is the repository's observation-
      failure rule: a failure to observe must not render as an observation.
    - A STEADY-STATE LOOP never returns. Every thread (the top-level body, each task.spawn/defer/
      delay, each handler the harness fires) has its OWN budget: after LOOP_BUDGET yields, or once
      the virtual clock is LOOP_HORIZON seconds past the thread's start, the shim raises a marker
      and the thread ends there. That is a normal end, not an error: a script that reached its
      update loop finished building. (2026-09-24: this was one GLOBAL budget of 96 yields shared by
      everything, and a spawned loop that hit it was recorded as a `task.spawn` error.)
    - TIME IS VIRTUAL. `now` starts at 0 and only a yield moves it: task.wait(t) by t (at least one
      1/60 frame), wait(t) by t (at least 0.03), Signal:Wait by one frame, task.delay by its delay.
      tick() is EPOCH + now, time() and os.clock() are now, os.time() is EPOCH + now. A spawned
      thread runs to its end synchronously and `now` is put back when it returns, so its waits do
      not delay its parent. __APPLE.runFrames(n) steps RunService's per-frame events.
    - DEPRECATED CALLS ANSWER RATHER THAN THROW. `Humanoid:LoadAnimation`, `wait()`, `BodyVelocity`
      and `FindPartOnRay` all work here, and are recorded. A model that reaches for them must reach
      the end of its own script and be marked down by a check that names the call — not die at the
      call site, where the failure would be indistinguishable from a syntax error.

  THE DATASTORE IS THE PART THAT EARNS ITS KEEP. It is a real little key-value store with three
  engine behaviours reproduced on purpose, because each one is a benchmark item:
    1. A transform passed to UpdateAsync MAY NOT YIELD. Roblox raises; so does this.
    2. Calls THROW on throttle. `injectStoreFailures(n)` makes the next n throw, which is how
       "did this code survive a throttle" becomes a fact instead of an opinion.
    3. Another server can write between your read and your write. `injectConcurrentWrite(key)`
       lands one foreign write at exactly that point — before the transform for UpdateAsync (which
       therefore sees it), after the GetAsync for a Get/Set pair (which therefore erases it). Both
       paths receive exactly one interleaved write; only the atomicity of the caller decides
       whether it survives. That is the lost update, mechanically.
]]

local LOOP_MARKER = "__APPLE_FRONTIER_LOOP__"
local OUT_MARKER = "__APPLE_FRONTIER__"
local LOOP_BUDGET = 1000     -- yields per thread
local LOOP_HORIZON = 60      -- virtual seconds per thread
local EPOCH = 1790208000     -- 2026-09-24T00:00:00Z, what tick() and os.time() count from

local now = 0
-- The running thread is the top of this stack; the root entry is the top-level body.
local threads = { { yields = 0, start = 0 } }
local nodes = {}
local nextId = 0

-- What was called, on what. The whole point of the file.
local calls = {}          -- { {target=class, name=instanceName, method=..., phase=...} }
local created = {}        -- Instance.new class -> count
local services = {}       -- GetService name -> count
local globalCalls = {}    -- wait/spawn/delay/task.wait/... -> count
local unresolved = {}     -- property reads this shim has no answer for
local facts = {}          -- probe-recorded facts, read by the scorer
local handlerErrors = {}  -- errors thrown INSIDE a handler the probe fired
local phase = "build"

local function record(target, name, method)
	calls[#calls + 1] = { target = target, name = name, method = method, phase = phase }
end

local function bump(t, k)
	t[k] = (t[k] or 0) + 1
end

local inTransform = false
local transformYields = 0
local function yieldFor(which, dt)
	bump(globalCalls, which)
	--[[ ROBLOX'S OWN RULE, NOT A STYLE OPINION: the transform passed to UpdateAsync MAY NOT YIELD.
	     roblox-datastores/references/core-operations-and-patterns.md:37 — "calls your transform
	     (which must not yield — no task.wait, no other async)". The engine raises; so does this, so
	     a model that puts an HttpService call or a task.wait inside its transform fails here for
	     exactly the reason it would fail in a live server, rather than quietly working. ]]
	if inTransform then
		--[[ COUNTED AS WELL AS THROWN. A model that wraps its own UpdateAsync in a pcall catches
		     this error itself, and the violation would then be invisible in handlerErrors — the
		     check would pass on code the engine rejects. The counter cannot be swallowed. ]]
		transformYields += 1
		error(("Cannot yield inside of an UpdateAsync transform function (attempted %s)"):format(which), 0)
	end
	local thread = threads[#threads]
	thread.yields += 1
	now += dt or 0
	if thread.yields > LOOP_BUDGET or now - thread.start > LOOP_HORIZON then error(LOOP_MARKER, 0) end
end

--[[ RUN fn AS ITS OWN THREAD. Its own budget and horizon, synchronously, and `now` restored on
     return so a spawned thread's waits do not delay its parent. Reaching the budget is the thread
     ending in its steady state, so it returns true; only a real error returns false, err. ]]
local function asThread(fn, ...)
	local entry = now
	threads[#threads + 1] = { yields = 0, start = now }
	local ok, err = pcall(fn, ...)
	threads[#threads] = nil
	now = entry
	if not ok and tostring(err):find(LOOP_MARKER, 1, true) == nil then return false, err end
	return true
end

-- ---------------------------------------------------------------- datatypes

--[[ TRANSLATION ARITHMETIC IS REAL; ROTATION IS NOT MODELLED. A mover's positions have to come out
     of its own arithmetic (`origin + offset * alpha`, `a:Lerp(b, t)`), or "did the platform take
     more than one position" is decided by this file's constants. A CFrame here carries a position
     and no rotation, so CFrame * CFrame adds translations, which is exact for every CFrame this
     shim can build. ]]
local function kindOf(v) return type(v) == "table" and rawget(v, "__k") or nil end
local vec3
local Vector3MT = {
	__index = function(v, k)
		if k == "Magnitude" then return math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z) end
		if k == "Unit" then
			local m = math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z)
			if m == 0 then return vec3(0, 0, 0) end
			return vec3(v.X / m, v.Y / m, v.Z / m)
		end
		if k == "Lerp" then return function(a, b, t) return a + (b - a) * t end end
		return 0
	end,
	__add = function(a, b) return vec3((a.X or 0) + (b.X or 0), (a.Y or 0) + (b.Y or 0), (a.Z or 0) + (b.Z or 0)) end,
	__sub = function(a, b) return vec3((a.X or 0) - (b.X or 0), (a.Y or 0) - (b.Y or 0), (a.Z or 0) - (b.Z or 0)) end,
	__mul = function(a, b)
		if type(a) == "number" then a, b = b, a end
		if type(b) == "number" then return vec3(a.X * b, a.Y * b, a.Z * b) end
		if kindOf(b) == "Vector3" then return vec3(a.X * b.X, a.Y * b.Y, a.Z * b.Z) end
		return vec3(0, 0, 0)
	end,
	__div = function(a, b)
		if type(b) == "number" then return vec3(a.X / b, a.Y / b, a.Z / b) end
		if kindOf(b) == "Vector3" then return vec3(a.X / b.X, a.Y / b.Y, a.Z / b.Z) end
		return vec3(0, 0, 0)
	end,
	__unm = function(a) return vec3(-a.X, -a.Y, -a.Z) end,
	__tostring = function() return "Vector3" end,
}
function vec3(x, y, z) return setmetatable({ __k = "Vector3", X = x or 0, Y = y or 0, Z = z or 0 }, Vector3MT) end

local function vec2(x, y) return setmetatable({ __k = "Vector2", X = x or 0, Y = y or 0 }, { __index = function() return 0 end, __tostring = function() return "Vector2" end }) end

local function udim(s, o) return setmetatable({ __k = "UDim", Scale = s or 0, Offset = o or 0 }, { __tostring = function() return "UDim" end }) end
local UDim2MT
local function udim2(xs, xo, ys, yo)
	local x, y = udim(xs, xo), udim(ys, yo)
	return setmetatable({ __k = "UDim2", X = x, Y = y, Width = x, Height = y }, UDim2MT)
end
UDim2MT = {
	__add = function(a, b)
		assert(kindOf(a) == "UDim2" and kindOf(b) == "UDim2", "UDim2 addition requires two UDim2 values")
		return udim2(a.X.Scale + b.X.Scale, a.X.Offset + b.X.Offset, a.Y.Scale + b.Y.Scale, a.Y.Offset + b.Y.Offset)
	end,
	__sub = function(a, b)
		assert(kindOf(a) == "UDim2" and kindOf(b) == "UDim2", "UDim2 subtraction requires two UDim2 values")
		return udim2(a.X.Scale - b.X.Scale, a.X.Offset - b.X.Offset, a.Y.Scale - b.Y.Scale, a.Y.Offset - b.Y.Offset)
	end,
	__tostring = function() return "UDim2" end,
}

local function color3(r, g, b) return setmetatable({ __k = "Color3", R = r or 0, G = g or 0, B = b or 0 }, { __index = function() return 0 end }) end

local CFrameMT
local function cframe(x, y, z)
	if kindOf(x) == "Vector3" then x, y, z = x.X, x.Y, x.Z end -- CFrame.new(pos [, lookAt])
	local c = { __k = "CFrame", X = x or 0, Y = y or 0, Z = z or 0, Position = vec3(x, y, z), LookVector = vec3(0, 0, -1), p = vec3(x, y, z) }
	return setmetatable(c, CFrameMT)
end
CFrameMT = {
	__index = function(t, k)
		if k == "Position" or k == "p" then return vec3(rawget(t, "X"), rawget(t, "Y"), rawget(t, "Z")) end
		-- This harness models translation with identity orientation. Direction properties are
		-- Vector3 values in Roblox, never methods; returning the fallback function here made
		-- a valid platform mover throw before its first movement.
		if k == "RightVector" or k == "XVector" then return vec3(1, 0, 0) end
		if k == "UpVector" or k == "YVector" then return vec3(0, 1, 0) end
		if k == "ZVector" then return vec3(0, 0, 1) end
		if k == "Lerp" then return function(a, b, alpha) return cframe(a.Position:Lerp(b.Position, alpha)) end end
		return function() return cframe(0, 0, 0) end
	end,
	__mul = function(a, b)
		if kindOf(b) == "CFrame" then return cframe(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
		if kindOf(b) == "Vector3" then return vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
		return cframe(a.X or 0, a.Y or 0, a.Z or 0)
	end,
	__add = function(a, b)
		if kindOf(b) == "Vector3" then return cframe(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
		return cframe(a.X or 0, a.Y or 0, a.Z or 0)
	end,
	__sub = function(a, b)
		if kindOf(b) == "Vector3" then return cframe(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
		return cframe(a.X or 0, a.Y or 0, a.Z or 0)
	end,
	__tostring = function() return "CFrame" end,
}

Vector3 = setmetatable({
	new = vec3, zero = vec3(0, 0, 0), one = vec3(1, 1, 1),
	FromNormalId = function() return vec3(0, 1, 0) end,
}, { __index = function() return function() return vec3(0, 0, 0) end end })
Vector2 = setmetatable({ new = vec2, zero = vec2(0, 0) }, { __index = function() return function() return vec2(0, 0) end end })
UDim = { new = udim }
UDim2 = setmetatable({
	new = function(xs, xo, ys, yo) return udim2(xs, xo, ys, yo) end,
	fromScale = function(x, y) return udim2(x, 0, y, 0) end,
	fromOffset = function(x, y) return udim2(0, x, 0, y) end,
}, { __index = function() return function() return udim2(0, 0, 0, 0) end end })
Color3 = setmetatable({
	new = color3,
	fromRGB = function(r, g, b) return color3((r or 0) / 255, (g or 0) / 255, (b or 0) / 255) end,
	fromHSV = function() return color3(1, 1, 1) end,
	fromHex = function() return color3(1, 1, 1) end,
}, { __index = function() return function() return color3(1, 1, 1) end end })
CFrame = setmetatable({
	new = cframe,
	lookAt = function() return cframe(0, 0, 0) end,
	Angles = function() return cframe(0, 0, 0) end,
	fromEulerAnglesXYZ = function() return cframe(0, 0, 0) end,
	identity = cframe(0, 0, 0),
}, { __index = function() return function() return cframe(0, 0, 0) end end })

--[[ ONE TABLE PER ENUM MEMBER, FOREVER.

     `if input.KeyCode ~= Enum.KeyCode.E then return end` is how essentially every real answer is
     written. Handing out a FRESH table on each access makes that comparison always true, every
     handler returns early, and the harness reports "the model never played the animation" about
     code that plays it. A failure of the shim rendered as an observation about the model — this
     repository's own shape. Cached, so identity comparison is the truth. ]]
local enumCache = {}
local function enumItem(kind, name)
	local byKind = enumCache[kind]
	if not byKind then byKind = {} enumCache[kind] = byKind end
	local item = byKind[name]
	if not item then
		item = setmetatable({ __k = "EnumItem", Name = name, Value = 0, EnumType = kind },
			{ __tostring = function() return ("Enum.%s.%s"):format(kind, name) end })
		byKind[name] = item
	end
	return item
end
Enum = setmetatable({}, { __index = function(_, kind)
	return setmetatable({}, {
		__index = function(_, name) return enumItem(kind, name) end,
		__call = function() return {} end,
	})
end })

RaycastParams = setmetatable({ new = function()
	return setmetatable({ __k = "RaycastParams", FilterDescendantsInstances = {}, FilterType = nil, IgnoreWater = false, RespectCanCollide = false },
		{ __newindex = function(t, k, v) rawset(t, k, v) end })
end }, { __index = function() return function() return nil end end })
OverlapParams = { new = function() return { __k = "OverlapParams", FilterDescendantsInstances = {} } end }
-- The pre-Raycast surface. `Ray.new` still constructs, so a model that reaches for
-- `workspace:FindPartOnRay(Ray.new(...))` finishes its script and is marked down by the check that
-- names the call rather than dying at the call site.
Ray = setmetatable({ new = function() return { __k = "Ray", Origin = vec3(0, 0, 0), Direction = vec3(0, 0, -1), Unit = nil } end },
	{ __index = function() return function() return nil end end })
TweenInfo = setmetatable({ new = function() return { __k = "TweenInfo" } end }, { __index = function() return function() return {} end end })
NumberRange = { new = function(a, b) return { __k = "NumberRange", Min = a, Max = b or a } end }
NumberSequence = { new = function() return { __k = "NumberSequence" } end }
ColorSequence = { new = function() return { __k = "ColorSequence" } end }
Rect = { new = function() return { __k = "Rect" } end }
Random = { new = function() return setmetatable({}, { __index = function() return function() return 0 end end }) end }
Font = setmetatable({ new = function() return { __k = "Font" } end, fromEnum = function() return { __k = "Font" } end, fromName = function() return { __k = "Font" } end },
	{ __index = function() return function() return { __k = "Font" } end end })

-- ---------------------------------------------------------------- signals

-- RunService's per-frame events, in the order the engine fires them within a frame.
local FRAME_ORDER = { "PreRender", "RenderStepped", "PreAnimation", "PreSimulation", "Stepped", "PostSimulation", "Heartbeat" }
local FRAME_EVENTS = {}
for _, n in ipairs(FRAME_ORDER) do FRAME_EVENTS[n] = true end

local function newSignal(owner, name)
	local s = { __k = "Signal", handlers = {}, owner = owner, name = name }
	s.Connect = function(_, fn)
		s.handlers[#s.handlers + 1] = fn
		return { Disconnect = function() end, Connected = true }
	end
	s.ConnectParallel = s.Connect
	s.Once = s.Connect
	-- One frame. The per-frame events hand back what Roblox passes them, so `local dt =
	-- RunService.Heartbeat:Wait()` integrates; CharacterAdded hands back the character.
	s.Wait = function()
		yieldFor("Signal:Wait", 1 / 60)
		if name == "Stepped" then return now, 1 / 60 end
		if FRAME_EVENTS[name] then return 1 / 60 end
		if name == "CharacterAdded" and owner and owner.props.Character then return owner.props.Character end
		return 0
	end
	return setmetatable(s, { __index = function() return function() end end })
end

-- Signals are per-instance-per-name so a probe can find the handler the model connected.
local function signalFor(d, name)
	d.signals[name] = d.signals[name] or newSignal(d, name)
	return d.signals[name]
end

local EVENT_NAMES = {
	OnServerEvent = true, OnClientEvent = true, OnServerInvoke = true, OnClientInvoke = true,
	PlayerAdded = true, PlayerRemoving = true, CharacterAdded = true, CharacterRemoving = true,
	Touched = true, TouchEnded = true, Changed = true, ChildAdded = true, ChildRemoved = true,
	DescendantAdded = true, AncestryChanged = true, Destroying = true, Died = true,
	Activated = true, MouseButton1Click = true, MouseButton1Down = true, MouseButton1Up = true,
	MouseEnter = true, MouseLeave = true, InputBegan = true, InputChanged = true, InputEnded = true,
	TouchTap = true, Heartbeat = true, RenderStepped = true, Stepped = true, PostSimulation = true, PreRender = true,
	PreSimulation = true, PreAnimation = true, Stopped = true, Ended = true, DidLoop = true, KeyframeReached = true,
	Completed = true, Triggered = true, ClickDetectorClicked = true, PromptGamePassPurchaseFinished = true,
	PromptProductPurchaseFinished = true, MessageReceived = true, SelectionChanged = true, FocusLost = true,
	Equipped = true, Unequipped = true, StateChanged = true, Seated = true, HealthChanged = true,
}

-- ---------------------------------------------------------------- instances

local DEFAULTS = {
	Name = nil, Visible = true, Active = false, Anchored = false, CanCollide = true, CanTouch = true,
	Transparency = 0, Reflectance = 0, BackgroundTransparency = 0, BorderSizePixel = 0, ZIndex = 1,
	LayoutOrder = 0, Rotation = 0, Text = "", TextScaled = false, TextWrapped = false, Enabled = true,
	ResetOnSpawn = true, IgnoreGuiInset = false, DisplayOrder = 0, AutoButtonColor = true,
	Value = 0, MaxHealth = 100, Health = 100, WalkSpeed = 16, JumpPower = 50, Volume = 0.5,
	Looped = false, Playing = false, TimePosition = 0, Length = 1, Priority = 0, Weight = 1,
	Archivable = true, Thickness = 1, AspectRatio = 1, Massless = false, Locked = false,
	CastShadow = true, Material = "Enum.Material.Plastic", Shape = "Enum.PartType.Block",
	AutomaticSize = "Enum.AutomaticSize.None", ScreenInsets = "Enum.ScreenInsets.CoreUISafeInsets",
	RigType = "Enum.HumanoidRigType.R15", AnimationId = "", SoundId = "", Image = "",
	ClipsDescendants = false, Selectable = false, TextTransparency = 0, ImageTransparency = 0,
	RequiresHandle = true, CanBeDropped = true, Disabled = false, RunContext = "Enum.RunContext.Legacy",
}

local function isGuiSized(k) return k == "Size" or k == "Position" or k == "CanvasSize" or k == "CellSize" or k == "CellPadding" end

local newInstance
local function nodeOf(proxy) return proxy and getmetatable(proxy) and getmetatable(proxy).__node or nil end
local function childNamed(d, name)
	for _, c in ipairs(d.children) do if (c.props.Name or c.class) == name then return c.proxy end end
	return nil
end

local function setParent(d, parentProxy)
	local p = nodeOf(parentProxy)
	if d.parent then
		for i, c in ipairs(d.parent.children) do if c == d then table.remove(d.parent.children, i) break end end
	end
	d.parent = p
	if p then p.children[#p.children + 1] = d end
end

local function descendants(d, out)
	for _, c in ipairs(d.children) do
		out[#out + 1] = c
		descendants(c, out)
	end
	return out
end

local CLASS_METHODS = {}

--[[ "DID IT MOVE" MEANS IT TOOK MORE THAN ONE POSITION, NOT THAT IT WAS WRITTEN TWICE.
     `platform.CFrame = platform.CFrame` every frame is a write count in the hundreds and a platform
     that never moves. So every Vector3/CFrame written to a node's Position or CFrame (or handed to
     PivotTo) is kept as a rounded fingerprint and the distinct ones are counted. Position and CFrame
     are one property in the engine, so each write updates the other: a script that reads Position
     and writes CFrame reads back its own last write. ]]
local function placeAt(d, v)
	local k = kindOf(v)
	if k ~= "Vector3" and k ~= "CFrame" then return end
	local spot = ("%.4f,%.4f,%.4f"):format(tonumber(v.X) or 0, tonumber(v.Y) or 0, tonumber(v.Z) or 0)
	if not d.spots[spot] then
		d.spots[spot] = true
		d.spotCount += 1
	end
	if k == "CFrame" then
		d.props.CFrame, d.props.Position = v, v.Position
	else
		d.props.Position, d.props.CFrame = v, cframe(v)
	end
end

local METHODS = {
	FindFirstChild = function(d, name) return childNamed(d, name) end,
	FindFirstChildWhichIsA = function(d, cls) for _, c in ipairs(d.children) do if c.class == cls then return c.proxy end end return nil end,
	FindFirstChildOfClass = function(d, cls) for _, c in ipairs(d.children) do if c.class == cls then return c.proxy end end return nil end,
	FindFirstAncestorOfClass = function(d, cls) local p = d.parent while p do if p.class == cls then return p.proxy end p = p.parent end return nil end,
	FindFirstAncestor = function(d, name) local p = d.parent while p do if (p.props.Name or p.class) == name then return p.proxy end p = p.parent end return nil end,
	WaitForChild = function(d, name)
		local c = childNamed(d, name)
		if c then return c end
		-- Blocking forever would turn the model's ordering choice into a harness hang. The node is
		-- created and recorded like any other, so the scorer can see it was not really there.
		return newInstance("Folder", d.proxy, name)
	end,
	GetChildren = function(d) local out = {} for i, c in ipairs(d.children) do out[i] = c.proxy end return out end,
	GetDescendants = function(d) local out = {} for i, c in ipairs(descendants(d, {})) do out[i] = c.proxy end return out end,
	IsA = function(d, cls)
		if d.class == cls then return true end
		if cls == "Instance" then return true end
		if cls == "BasePart" then return d.class == "Part" or d.class == "MeshPart" or d.class == "UnionOperation" or d.class == "WedgePart" or d.class == "SpawnLocation" end
		if cls == "GuiObject" or cls == "GuiBase2d" then
			return d.class == "Frame" or d.class == "TextLabel" or d.class == "TextButton" or d.class == "ImageLabel" or d.class == "ImageButton" or d.class == "ScrollingFrame" or d.class == "TextBox"
		end
		if cls == "ValueBase" then return d.class:sub(-5) == "Value" end
		return false
	end,
	Destroy = function(d) setParent(d, nil) d.destroyed = true end,
	ClearAllChildren = function(d) for i = #d.children, 1, -1 do setParent(d.children[i], nil) end end,
	Clone = function(d)
		local copy = newInstance(d.class, nil, d.props.Name)
		for k, v in pairs(d.props) do nodeOf(copy).props[k] = v end
		return copy
	end,
	SetAttribute = function(d, k, v) d.attrs[k] = v end,
	GetAttribute = function(d, k) return d.attrs[k] end,
	GetAttributes = function(d) return d.attrs end,
	GetPropertyChangedSignal = function(d, p) return signalFor(d, "PropertyChanged:" .. tostring(p)) end,
	GetAttributeChangedSignal = function(d) return newSignal() end,
	GetFullName = function(d)
		local parts = { d.props.Name or d.class }
		local p = d.parent
		while p do table.insert(parts, 1, p.props.Name or p.class) p = p.parent end
		return table.concat(parts, ".")
	end,
	GetMarkerReachedSignal = function(d) return newSignal() end,
	-- Deprecated members ANSWER. They are recorded by the __index wrapper below, then judged.
	TweenPosition = function() return true end,
	TweenSize = function() return true end,
	TweenSizeAndPosition = function() return true end,
	MakeJoints = function() end,
	BreakJoints = function() end,
	ApplyImpulse = function() end,
	PivotTo = function(d, cf) placeAt(d, cf) end,
	GetPivot = function() return cframe(0, 0, 0) end,
	SetPrimaryPartCFrame = function() end,
	MoveTo = function() end,
	AddTag = function() end,
	RemoveTag = function() end,
	HasTag = function() return false end,
	GetTags = function() return {} end,
}

local RECORDED_ANY = { LoadAnimation = true, TweenPosition = true, TweenSize = true, TweenSizeAndPosition = true,
	SetPrimaryPartCFrame = true, MakeJoints = true, BreakJoints = true, Play = true, Stop = true, Destroy = true,
	FireServer = true, FireClient = true, FireAllClients = true, InvokeServer = true, InvokeClient = true,
	SetAsync = true, GetAsync = true, UpdateAsync = true, IncrementAsync = true, RemoveAsync = true }

function newInstance(class, parentProxy, name)
	nextId += 1
	local d = { id = nextId, class = class, props = { Name = name or class }, children = {}, parent = nil, attrs = {}, signals = {}, writes = {}, methods = {}, spots = {}, spotCount = 0 }
	bump(created, class)
	local mt = {}
	mt.__node = d
	mt.__tostring = function() return d.props.Name or class end
	mt.__index = function(_, k)
		if k == "Parent" then return d.parent and d.parent.proxy or nil end
		if k == "ClassName" then return class end
		if k == "Name" then return d.props.Name or class end
		local byClass = CLASS_METHODS[class]
		if byClass and byClass[k] then
			return function(_, ...) bump(d.methods, k) record(class, d.props.Name or class, k) return byClass[k](d, ...) end
		end
		if METHODS[k] then
			return function(_, ...)
				bump(d.methods, k)
				if RECORDED_ANY[k] then record(class, d.props.Name or class, k) end
				return METHODS[k](d, ...)
			end
		end
		if EVENT_NAMES[k] then return signalFor(d, k) end
		if d.props[k] ~= nil then return d.props[k] end
		local child = childNamed(d, k)
		if child then return child end
		local def = DEFAULTS[k]
		if type(def) == "string" and def:sub(1, 5) == "Enum." then
			local a, b = def:match("^Enum%.(%w+)%.(%w+)$")
			return enumItem(a, b)
		end
		if def ~= nil then return def end
		if k == "CFrame" or k == "PrimaryPart" and false then return cframe(0, 0, 0) end
		if k == "CFrame" then return cframe(0, 0, 0) end
		if k == "Position" and (class == "Part" or class == "MeshPart" or class == "Model" or class == "Attachment") then return vec3(0, 0, 0) end
		if isGuiSized(k) then return udim2(0, 0, 0, 0) end
		if k == "AnchorPoint" then return vec2(0, 0) end
		if k == "Size" then return vec3(4, 1.2, 2) end
		if k == "Velocity" or k == "AssemblyLinearVelocity" then return vec3(0, 0, 0) end
		if k == "Color" or k == "BackgroundColor3" or k == "TextColor3" or k == "ImageColor3" then return color3(1, 1, 1) end
		if k == "AbsoluteSize" or k == "AbsolutePosition" or k == "ViewportSize" then
			unresolved[#unresolved + 1] = class .. "." .. k
			return vec2(0, 0)
		end
		unresolved[#unresolved + 1] = class .. "." .. tostring(k)
		return nil
	end
	mt.__newindex = function(_, k, v)
		if k == "Parent" then setParent(d, v) return end
		bump(d.writes, k)
		d.props[k] = v
		if k == "CFrame" or k == "Position" then placeAt(d, v) end
		-- A function assigned to an event-shaped key is a callback the probe may want to fire.
		if type(v) == "function" then d.signals[k] = d.signals[k] or newSignal(d, k) end
	end
	d.proxy = setmetatable({}, mt)
	nodes[#nodes + 1] = d
	if parentProxy ~= nil then setParent(d, parentProxy) end
	return d.proxy
end

Instance = {
	new = function(class, parent) return newInstance(class, parent) end,
	fromExisting = function(inst) return METHODS.Clone(nodeOf(inst)) end,
}

-- ---------------------------------------------------------------- the DataStore

local stores = {}          -- storeName -> { key -> value }
local storeOps = {}        -- an ordered log of everything that touched a store
local failNext = 0         -- injected throttles
local staleLeft = {}       -- key -> how many more GetAsyncs serve the snapshot below
local staleValue = {}      -- key -> the value as it was at the first read

local function deepcopy(v, seen)
	if type(v) ~= "table" then return v end
	seen = seen or {}
	if seen[v] then return seen[v] end
	local out = {}
	seen[v] = out
	for k, x in pairs(v) do out[k] = deepcopy(x, seen) end
	return out
end

--[[ TWO SERVERS READING THE SAME KEY AT THE SAME TIME, WITHOUT INSPECTING THE CALLER AT ALL.

     `staleReads(key, n)` records the value at the first GetAsync of that key and serves that same
     value to the next n GetAsyncs, whatever has been written since. That is precisely what a second
     server sees when it read at the same moment you did.

     Nothing here looks at how the caller is written. A GetAsync/SetAsync pair reads the stale value
     and writes over the first server's result: the lost update. UpdateAsync never goes through
     GetAsync — its transform is handed the CURRENT stored value at the moment it runs — so it is
     untouched by the staleness, which is exactly the atomicity guarantee it exists to provide. The
     two shapes diverge on the arithmetic alone, and the value's SHAPE is entirely the model's own
     choice, so nothing is forced on a model that saves a table rather than a number. ]]
local function storeCall(storeName, op, key)
	storeOps[#storeOps + 1] = { op = op, store = storeName, key = tostring(key), phase = phase, failed = failNext > 0 }
	record("GlobalDataStore", storeName, op)
	if failNext > 0 then
		failNext -= 1
		error(("%s: 502: API Services rejected request with status code 429 (Too many requests)"):format(op), 0)
	end
	yieldFor("DataStore:" .. op)
end

local function makeStore(storeName)
	stores[storeName] = stores[storeName] or {}
	local api = {}
	function api:GetAsync(key)
		storeCall(storeName, "GetAsync", key)
		local k = tostring(key)
		if staleLeft[k] ~= nil then
			if staleValue[k] == nil and staleLeft[k] > 0 then
				staleValue[k] = { v = deepcopy(stores[storeName][k]) }
				return deepcopy(staleValue[k].v)
			end
			if staleLeft[k] > 0 then
				staleLeft[k] -= 1
				storeOps[#storeOps + 1] = { op = "STALE_READ", store = storeName, key = k, phase = phase }
				return deepcopy(staleValue[k].v)
			end
		end
		return deepcopy(stores[storeName][k])
	end
	function api:SetAsync(key, value)
		storeCall(storeName, "SetAsync", key)
		local k = tostring(key)
		stores[storeName][k] = deepcopy(value)
		return k
	end
	function api:UpdateAsync(key, transform)
		storeCall(storeName, "UpdateAsync", key)
		local k = tostring(key)
		inTransform = true
		local ok, result, userIds, meta = pcall(transform, deepcopy(stores[storeName][k]), nil)
		inTransform = false
		if not ok then error(result, 0) end
		if result ~= nil then stores[storeName][k] = deepcopy(result) end
		return stores[storeName][k], userIds, meta
	end
	function api:IncrementAsync(key, delta)
		storeCall(storeName, "IncrementAsync", key)
		local k = tostring(key)
		local cur = tonumber(stores[storeName][k]) or 0
		stores[storeName][k] = cur + (tonumber(delta) or 1)
		return stores[storeName][k]
	end
	function api:RemoveAsync(key)
		storeCall(storeName, "RemoveAsync", key)
		local k = tostring(key)
		local old = stores[storeName][k]
		stores[storeName][k] = nil
		return old
	end
	function api:GetSortedAsync()
		storeCall(storeName, "GetSortedAsync", "-")
		return setmetatable({}, { __index = function() return function() return {} end end })
	end
	function api:SetIncrementSortedAsync(key, delta) return api:IncrementAsync(key, delta) end
	function api:ListVersionsAsync() storeCall(storeName, "ListVersionsAsync", "-") return setmetatable({}, { __index = function() return function() return {} end end }) end
	function api:GetVersionAsync(key) storeCall(storeName, "GetVersionAsync", key) return stores[storeName][tostring(key)] end
	return setmetatable(api, { __index = function() return function() return nil end end })
end

-- ---------------------------------------------------------------- services

local dataModel
local bindToClose = {}

local function service(name) return childNamed(nodeOf(dataModel), name) end

local function makeAnimator(humanoidNode)
	local animator = newInstance("Animator", humanoidNode.proxy, "Animator")
	return animator
end

CLASS_METHODS.Humanoid = {
	-- Present and working, and recorded. roblox-animation/SKILL.md:184 marks this deprecated in
	-- favour of the Animator; a model that calls it here finishes its script and loses the check.
	LoadAnimation = function(d) return newInstance("AnimationTrack", nil, "Track") end,
	MoveTo = function() end,
	TakeDamage = function(d, n) d.props.Health = (d.props.Health or 100) - (tonumber(n) or 0) end,
	GetState = function() return enumItem("HumanoidStateType", "Running") end,
	ChangeState = function() end,
	EquipTool = function() end,
	UnequipTools = function() end,
	GetLimb = function() return enumItem("Limb", "Unknown") end,
	ApplyDescription = function() end,
	GetAppliedDescription = function() return newInstance("HumanoidDescription", nil, "Desc") end,
}
CLASS_METHODS.Animator = {
	LoadAnimation = function() return newInstance("AnimationTrack", nil, "Track") end,
	GetPlayingAnimationTracks = function() return {} end,
	StepAnimations = function() end,
}
CLASS_METHODS.AnimationTrack = {
	Play = function() end, Stop = function() end, AdjustSpeed = function() end, AdjustWeight = function() end,
	GetMarkerReachedSignal = function() return newSignal() end,
}
CLASS_METHODS.TweenService = {
	Create = function(_, inst, info, goals)
		local t = newInstance("Tween", nil, "Tween")
		nodeOf(t).props.__goals = goals
		return t
	end,
	GetValue = function() return 0 end,
}
CLASS_METHODS.Tween = { Play = function() end, Cancel = function() end, Pause = function() end }
CLASS_METHODS.DataStoreService = {
	GetDataStore = function(_, name) return makeStore(tostring(name)) end,
	GetOrderedDataStore = function(_, name) return makeStore("ordered:" .. tostring(name)) end,
	GetGlobalDataStore = function() return makeStore("global") end,
	GetRequestBudgetForRequestType = function() return 100 end,
}
CLASS_METHODS.MemoryStoreService = {
	GetSortedMap = function() return setmetatable({}, { __index = function() return function() return nil end end }) end,
	GetQueue = function() return setmetatable({}, { __index = function() return function() return nil end end }) end,
	GetHashMap = function() return setmetatable({}, { __index = function() return function() return nil end end }) end,
}
CLASS_METHODS.HttpService = {
	JSONEncode = function(_, v) return type(v) == "table" and "{}" or tostring(v) end,
	JSONDecode = function() return {} end,
	GenerateGUID = function() return "{00000000-0000-0000-0000-000000000000}" end,
	RequestAsync = function() yieldFor("HttpService:RequestAsync") return { Success = true, StatusCode = 200, Body = "{}" } end,
	GetAsync = function() yieldFor("HttpService:GetAsync") return "{}" end,
	PostAsync = function() yieldFor("HttpService:PostAsync") return "{}" end,
}
CLASS_METHODS.MarketplaceService = {
	GetProductInfo = function() yieldFor("MarketplaceService:GetProductInfo") return { Name = "Item", PriceInRobux = 100 } end,
	UserOwnsGamePassAsync = function() yieldFor("MarketplaceService:UserOwnsGamePassAsync") return false end,
	PromptPurchase = function() end,
	PromptGamePassPurchase = function() end,
	PromptProductPurchase = function() end,
}
CLASS_METHODS.Players = {
	GetPlayers = function(d) local out = {} for _, c in ipairs(d.children) do if c.class == "Player" then out[#out + 1] = c.proxy end end return out end,
	GetPlayerFromCharacter = function(d, ch)
		local n = nodeOf(ch)
		for _, c in ipairs(d.children) do if c.props.Character == (n and n.proxy) then return c.proxy end end
		return nil
	end,
	GetUserIdFromNameAsync = function() yieldFor("Players:GetUserIdFromNameAsync") return 1 end,
	GetNameFromUserIdAsync = function() yieldFor("Players:GetNameFromUserIdAsync") return "Player" end,
	CreateHumanoidModelFromUserId = function() return newInstance("Model", nil, "Rig") end,
}
CLASS_METHODS.RunService = {
	IsServer = function() return true end, IsClient = function() return false end,
	IsStudio = function() return false end, IsRunning = function() return true end,
	BindToRenderStep = function() end, UnbindFromRenderStep = function() end,
}
CLASS_METHODS.ContextActionService = { BindAction = function() end, UnbindAction = function() end, SetTitle = function() end, SetImage = function() end }
CLASS_METHODS.Player = {
	GetMouse = function() return newInstance("Mouse", nil, "Mouse") end,
	LoadCharacter = function() return nil end,
	Kick = function() end,
	IsInGroup = function() return false end,
	GetRankInGroup = function() return 0 end,
}
CLASS_METHODS.UserInputService = { GetMouseLocation = function() return vec2(0, 0) end, GetLastInputType = function() return enumItem("UserInputType", "MouseButton1") end, IsKeyDown = function() return false end }
CLASS_METHODS.CollectionService = { GetTagged = function() return {} end, AddTag = function() end, RemoveTag = function() end, GetInstanceAddedSignal = function() return newSignal() end }
CLASS_METHODS.ContentProvider = { PreloadAsync = function() yieldFor("ContentProvider:PreloadAsync") end }
CLASS_METHODS.Debris = { AddItem = function() end }
CLASS_METHODS.PhysicsService = { RegisterCollisionGroup = function() end, CollisionGroupSetCollidable = function() end, SetPartCollisionGroup = function() end }
CLASS_METHODS.TeleportService = { TeleportAsync = function() yieldFor("TeleportService:TeleportAsync") return nil end, ReserveServer = function() return "code", "id" end }
CLASS_METHODS.TextService = {
	--[[ THE FILTERED RESULT MUST CARRY THE TEXT BACK, NOT A CONSTANT.
	     This returned the literal "filtered" for every input, so a 5,000-character pet name came
	     back eight characters long and `length-is-bounded` passed on code with no length check at
	     all. The control test caught it before any model was scored. A real TextFilterResult hands
	     back a string of roughly the input's length, so the shim does too. ]]
	FilterStringAsync = function(_, text)
		yieldFor("TextService:FilterStringAsync")
		local filtered = tostring(text)
		return setmetatable({ __k = "TextFilterResult" }, { __index = function() return function() return filtered end end })
	end,
	GetTextSize = function() return vec2(0, 0) end,
}
CLASS_METHODS.TextChatService = {
	-- A modern system message goes through a TextChannel. The channel is created on demand so the
	-- model's own lookup path (`:WaitForChild("RBXGeneral")`) resolves to a real recorded object.
	DisplaySystemMessage = function() end,
}
CLASS_METHODS.TextChannel = { DisplaySystemMessage = function() end, SendAsync = function() end }
CLASS_METHODS.Chat = {
	-- The legacy service. Answers, and is recorded.
	Chat = function() end,
	FilterStringForBroadcast = function() yieldFor("Chat:FilterStringForBroadcast") return "filtered" end,
	FilterStringAsync = function() yieldFor("Chat:FilterStringAsync") return "filtered" end,
}
CLASS_METHODS.StarterGui = {
	-- SetCore("ChatMakeSystemMessage", ...) is the legacy path. Recorded with its first argument so
	-- the check can name the exact core call rather than the method.
	SetCore = function(d, what) record("StarterGui", "SetCore:" .. tostring(what), "SetCore") end,
	GetCore = function() return nil end,
	SetCoreGuiEnabled = function() end,
}
CLASS_METHODS.Workspace = {
	Raycast = function() return nil end,
	-- Deprecated raycast surface: answers, and is recorded.
	FindPartOnRay = function() return nil, vec3(0, 0, 0) end,
	FindPartOnRayWithIgnoreList = function() return nil, vec3(0, 0, 0) end,
	FindPartsInRegion3 = function() return {} end,
	GetPartBoundsInBox = function() return {} end,
	GetPartsInPart = function() return {} end,
	Blockcast = function() return nil end,
	Shapecast = function() return nil end,
}
CLASS_METHODS.RemoteEvent = {
	FireServer = function() end, FireClient = function() end, FireAllClients = function() end,
}
CLASS_METHODS.RemoteFunction = {
	InvokeServer = function() return nil end,
	InvokeClient = function() yieldFor("RemoteFunction:InvokeClient") return nil end,
}
CLASS_METHODS.Sound = { Play = function() end, Stop = function() end, Resume = function() end, Pause = function() end }
CLASS_METHODS.AudioPlayer = { Play = function() end, Stop = function() end }
CLASS_METHODS.Camera = {
	ScreenPointToRay = function() return { __k = "Ray", Origin = vec3(0, 0, 0), Direction = vec3(0, 0, -1) } end,
	ViewportPointToRay = function() return { __k = "Ray", Origin = vec3(0, 0, 0), Direction = vec3(0, 0, -1) } end,
	WorldToScreenPoint = function() return vec3(0, 0, 0), true end,
	WorldToViewportPoint = function() return vec3(0, 0, 0), true end,
	GetRenderCFrame = function() return cframe(0, 0, 0) end,
}
CLASS_METHODS.Mouse = { GetTarget = function() return nil end }
CLASS_METHODS.GuiService = { GetGuiInset = function() return vec2(0, 36), vec2(0, 0) end }
CLASS_METHODS.Lighting = { GetMinutesAfterMidnight = function() return 0 end, SetMinutesAfterMidnight = function() end }
CLASS_METHODS.ServerScriptService = {}
CLASS_METHODS.ReplicatedStorage = {}

-- ---------------------------------------------------------------- the world

dataModel = newInstance("DataModel", nil, "game")
game = dataModel

local SERVICES = {
	"Players", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPlayer", "StarterPack", "Lighting", "TweenService", "RunService",
	"UserInputService", "ContextActionService", "TextService", "TextChatService", "Chat",
	"GuiService", "SoundService", "CollectionService", "HttpService", "Debris",
	"MarketplaceService", "ContentProvider", "DataStoreService", "MemoryStoreService",
	"PhysicsService", "TeleportService", "PathfindingService", "BadgeService", "AnalyticsService",
	"Teams", "InsertService", "LocalizationService", "PolicyService", "VRService", "ProximityPromptService",
}
for _, name in ipairs(SERVICES) do newInstance(name, dataModel, name) end
local workspaceNode = newInstance("Workspace", dataModel, "Workspace")
workspace = workspaceNode
newInstance("Camera", workspaceNode, "CurrentCamera")
nodeOf(workspaceNode).props.CurrentCamera = childNamed(nodeOf(workspaceNode), "CurrentCamera")
newInstance("Terrain", workspaceNode, "Terrain")

local starterPlayer = service("StarterPlayer")
newInstance("StarterPlayerScripts", starterPlayer, "StarterPlayerScripts")
newInstance("StarterCharacterScripts", starterPlayer, "StarterCharacterScripts")
local generalChannel = newInstance("TextChannel", service("TextChatService"), "RBXGeneral")
newInstance("Folder", service("TextChatService"), "TextChannels")
nodeOf(service("TextChatService")).children[#nodeOf(service("TextChatService")).children] = nil
local channels = newInstance("Folder", service("TextChatService"), "TextChannels")
setParent(nodeOf(generalChannel), channels)

CLASS_METHODS.DataModel = {
	GetService = function(d, name)
		bump(services, tostring(name))
		record("DataModel", "game", "GetService")
		local existing = childNamed(d, tostring(name))
		if existing then return existing end
		return newInstance(tostring(name), d.proxy, tostring(name))
	end,
	FindService = function(d, name) return childNamed(d, tostring(name)) end,
	BindToClose = function(_, fn) bindToClose[#bindToClose + 1] = fn record("DataModel", "game", "BindToClose") end,
	IsLoaded = function() return true end,
	SetPlaceId = function() end,
}
nodeOf(dataModel).props.JobId = "harness-job"
nodeOf(dataModel).props.PlaceId = 1
nodeOf(dataModel).props.GameId = 1
nodeOf(dataModel).props.Workspace = workspaceNode
nodeOf(dataModel).props.Players = service("Players")
nodeOf(dataModel).props.Lighting = service("Lighting")
nodeOf(dataModel).props.ReplicatedStorage = service("ReplicatedStorage")

script = newInstance("Script", service("ServerScriptService"), "Script")

-- ---------------------------------------------------------------- scheduler

local function makeCharacter(playerProxy, name)
	local model = newInstance("Model", workspaceNode, name)
	local hrp = newInstance("Part", model, "HumanoidRootPart")
	newInstance("Part", model, "Head")
	local hum = newInstance("Humanoid", model, "Humanoid")
	makeAnimator(nodeOf(hum))
	nodeOf(model).props.PrimaryPart = hrp
	nodeOf(playerProxy).props.Character = model
	return model
end

local playerCount = 0
local function newPlayer(name, userId)
	playerCount += 1
	local p = newInstance("Player", service("Players"), name or ("Player" .. playerCount))
	nodeOf(p).props.UserId = userId or (2000 + playerCount)
	nodeOf(p).props.DisplayName = nodeOf(p).props.Name
	newInstance("PlayerGui", p, "PlayerGui")
	newInstance("Backpack", p, "Backpack")
	newInstance("PlayerScripts", p, "PlayerScripts")
	makeCharacter(p, nodeOf(p).props.Name)
	return p
end

local localPlayer = newPlayer("LocalPlayer")
nodeOf(service("Players")).props.LocalPlayer = localPlayer

-- Every spawned function is its own thread (see asThread). A real error is recorded under the entry
-- point that ran it; reaching the loop budget is how a steady-state loop ends, and is not an error.
local function spawned(label, fn, ...)
	-- Roblox task.spawn returns a thread. The harness runs work synchronously in its own virtual
	-- thread, so return a completed coroutine handle that callers can store or close afterward.
	local handle = coroutine.create(function() end)
	coroutine.resume(handle)
	local ok, err = asThread(fn, ...)
	if not ok then handlerErrors[#handlerErrors + 1] = label .. ": " .. tostring(err) end
	return handle
end
-- A delayed function starts `t` virtual seconds into its own thread.
local function afterDelay(t, fn)
	return function(...)
		now += math.max(tonumber(t) or 0, 0)
		return fn(...)
	end
end

task = {
	-- Roblox resumes a task.wait no sooner than the next frame, and returns the time that passed.
	wait = function(t) local dt = math.max(tonumber(t) or 0, 1 / 60) yieldFor("task.wait", dt) return dt end,
	spawn = function(fn, ...) bump(globalCalls, "task.spawn") return spawned("task.spawn", fn, ...) end,
	defer = function(fn, ...) bump(globalCalls, "task.defer") return spawned("task.defer", fn, ...) end,
	delay = function(t, fn, ...) bump(globalCalls, "task.delay") return spawned("task.delay", afterDelay(t, fn), ...) end,
	cancel = function() bump(globalCalls, "task.cancel") end,
	synchronize = function() end,
	desynchronize = function() end,
}
wait = function(t) local dt = math.max(tonumber(t) or 0, 0.03) yieldFor("wait", dt) return dt, now end
spawn = function(fn, ...) bump(globalCalls, "spawn") return (asThread(fn, ...)) end
delay = function(t, fn, ...) bump(globalCalls, "delay") return (asThread(afterDelay(t, fn), ...)) end
tick = function() bump(globalCalls, "tick") return EPOCH + now end
time = function() return now end
-- Roblox's `typeof` is a superset of `type`; a validating handler almost always reaches for it.
typeof = function(v)
	local t = type(v)
	if t == "table" then
		local mt = getmetatable(v)
		if mt and mt.__node then return "Instance" end
		if rawget(v, "__k") then return rawget(v, "__k") end
	end
	return t
end
--[[ `os` IS SHADOWED, BECAUSE ITS CLOCK HAS TO BE THE VIRTUAL ONE. os.clock() is what most modern
     Roblox code measures a deadline or a cooldown against, and the real one does not move when a
     script waits, so a correct poll-until-deadline loop never reached its deadline here. The global
     is assignable in this Luau; anything not listed falls through to the real library. ]]
local realOs = os
os = setmetatable({
	clock = function() return now end,
	time = function(t) if t then return realOs.time(t) end return EPOCH + math.floor(now) end,
	date = realOs.date,
	difftime = realOs.difftime,
}, { __index = realOs })
warn = function() end
print = print
require = function(target)
	-- A require of a ModuleScript the model created should return whatever it returned; a require
	-- of anything else returns a permissive stub rather than throwing, because a model organising
	-- its code into modules is not making a mistake.
	local n = nodeOf(target)
	if n and n.props.__moduleResult ~= nil then return n.props.__moduleResult end
	return setmetatable({}, { __index = function() return function() return nil end end, __call = function() return nil end })
end

-- ---------------------------------------------------------------- the probe surface

local function fireSignal(d, signalName, ...)
	local sig = d.signals[signalName]
	local fired = 0
	if sig then
		for _, fn in ipairs(sig.handlers) do
			fired += 1
			local ok, err = asThread(fn, ...)
			if not ok then
				handlerErrors[#handlerErrors + 1] = ("%s.%s: %s"):format(d.props.Name or d.class, signalName, tostring(err))
			end
		end
	end
	-- A callback ASSIGNED to the property (OnServerInvoke, ProcessReceipt) rather than connected.
	local assigned = d.props[signalName]
	if type(assigned) == "function" then
		fired += 1
		local ok, err = asThread(assigned, ...)
		if not ok then
			handlerErrors[#handlerErrors + 1] = ("%s.%s: %s"):format(d.props.Name or d.class, signalName, tostring(err))
		end
	end
	return fired
end

local function findByClass(cls, name)
	for _, d in ipairs(nodes) do
		if d.class == cls and not d.destroyed and (name == nil or (d.props.Name or d.class) == name) then return d end
	end
	return nil
end

local function findValueNamed(name)
	for _, d in ipairs(nodes) do
		if not d.destroyed and (d.props.Name or "") == name and d.class:sub(-5) == "Value" then return d end
	end
	return nil
end

__APPLE = {
	LOOP_MARKER = LOOP_MARKER,
	calls = calls, created = created, services = services, globals = globalCalls,
	storeOps = storeOps, stores = stores, unresolved = unresolved, handlerErrors = handlerErrors,

	fact = function(k, v) facts[k] = v end,
	setPhase = function(p) phase = p end,

	player = function(name, userId) return newPlayer(name, userId) end,
	localPlayer = localPlayer,

	-- find helpers
	find = function(cls, name) local d = findByClass(cls, name) return d and d.proxy or nil end,
	findAny = function(name)
		for _, d in ipairs(nodes) do
			if not d.destroyed and (d.props.Name or d.class) == name then return d.proxy end
		end
		return nil
	end,
	--[[ "WAS THIS THING MOVED" IS A COUNT, NOT AN IMPRESSION.
	     Every write to CFrame/Position/PivotOffset on any node in the subtree, plus every call of
	     the methods that move a model, summed. An admin command that refuses a non-admin leaves
	     this at zero; one that does not leaves a number. ]]
	moveEvidence = function(rootProxy)
		local root = nodeOf(rootProxy)
		if not root then return 0 end
		local total = 0
		local all = { root }
		for _, d in ipairs(descendants(root, {})) do all[#all + 1] = d end
		for _, d in ipairs(all) do
			total += (d.writes.CFrame or 0) + (d.writes.Position or 0) + (d.writes.WorldCFrame or 0)
			total += (d.methods.PivotTo or 0) + (d.methods.MoveTo or 0) + (d.methods.SetPrimaryPartCFrame or 0)
		end
		return total
	end,
	writeCount = function(instProxy, prop) local d = nodeOf(instProxy) return d and (d.writes[prop] or 0) or 0 end,
	-- How many DIFFERENT positions the instance was given (see placeAt).
	distinctPositions = function(instProxy) local d = nodeOf(instProxy) return d and d.spotCount or 0 end,
	findValue = function(name) local d = findValueNamed(name) return d and d.proxy or nil end,
	valueOf = function(name) local d = findValueNamed(name) return d and d.props.Value or nil end,
	attributeOf = function(instProxy, key) local d = nodeOf(instProxy) return d and d.attrs[key] or nil end,

	fireRemote = function(remoteName, ...)
		local d = findByClass("RemoteEvent", remoteName) or findByClass("RemoteEvent")
		if not d then return 0, "no RemoteEvent was created" end
		return fireSignal(d, "OnServerEvent", ...), nil
	end,
	invokeRemote = function(remoteName, ...)
		local d = findByClass("RemoteFunction", remoteName) or findByClass("RemoteFunction")
		if not d then return 0, "no RemoteFunction was created" end
		return fireSignal(d, "OnServerInvoke", ...), nil
	end,
	fireOn = function(instProxy, signalName, ...)
		local d = nodeOf(instProxy)
		if not d then return 0 end
		return fireSignal(d, signalName, ...)
	end,
	firePlayerAdded = function(p) return fireSignal(nodeOf(service("Players")), "PlayerAdded", p) end,
	--[[ n FRAMES OF RunService, each one 1/60 s (or dt) later than the last, with the arguments the
	     engine passes: Stepped(time, dt), every other per-frame event (dt). A mover driven from
	     Heartbeat does nothing until a frame is stepped, and nothing else here steps one. ]]
	runFrames = function(n, dt)
		dt = dt or 1 / 60
		local rs = nodeOf(service("RunService"))
		for _ = 1, n do
			now += dt
			for _, name in ipairs(FRAME_ORDER) do
				if name == "Stepped" then fireSignal(rs, name, now, dt) else fireSignal(rs, name, dt) end
			end
		end
	end,
	firePlayerRemoving = function(p) return fireSignal(nodeOf(service("Players")), "PlayerRemoving", p) end,
	fireBindToClose = function()
		local n = 0
		for _, fn in ipairs(bindToClose) do
			n += 1
			local ok, err = asThread(fn)
			if not ok then handlerErrors[#handlerErrors + 1] = "BindToClose: " .. tostring(err) end
		end
		return n
	end,
	bindToCloseCount = function() return #bindToClose end,

	injectStoreFailures = function(n) failNext = n end,
	staleReads = function(key, n) staleLeft[tostring(key)] = n or 1 staleValue[tostring(key)] = nil end,
	-- A stable, shape-agnostic fingerprint of what is stored, so "did the second save change it"
	-- can be answered without knowing whether the model chose a number, a table or a string.
	storeSnapshot = function(key)
		local best = nil
		for _, tbl in pairs(stores) do
			local v = tbl[tostring(key)]
			if v ~= nil then best = v end
		end
		return best
	end,
	storeKeys = function()
		local out = {}
		for name, tbl in pairs(stores) do
			for k in pairs(tbl) do out[#out + 1] = name .. "/" .. k end
		end
		table.sort(out)
		return out
	end,
	storeValue = function(key)
		for _, tbl in pairs(stores) do
			local v = tbl[tostring(key)]
			if v ~= nil then return v end
		end
		return nil
	end,
	countOps = function(op)
		local n = 0
		for _, o in ipairs(storeOps) do if o.op == op then n += 1 end end
		return n
	end,
	calledMethodOn = function(targetClass, method)
		for _, c in ipairs(calls) do
			if c.target == targetClass and c.method == method then return true end
		end
		return false
	end,
}

-- ---------------------------------------------------------------- output

local function jsonEscape(s)
	return (tostring(s):gsub('[%c"\\]', function(ch)
		if ch == '"' then return '\\"' end
		if ch == "\\" then return "\\\\" end
		if ch == "\n" then return "\\n" end
		if ch == "\r" then return "\\r" end
		if ch == "\t" then return "\\t" end
		return ("\\u%04x"):format(string.byte(ch))
	end))
end

local encode
function encode(v, depth)
	depth = depth or 0
	if depth > 8 then return '"<deep>"' end
	local t = type(v)
	if v == nil then return "null" end
	if t == "number" then return (v ~= v or v == math.huge or v == -math.huge) and "null" or tostring(v) end
	if t == "boolean" then return tostring(v) end
	if t == "string" then return '"' .. jsonEscape(v) .. '"' end
	if t == "table" then
		if v.__k then return '"' .. jsonEscape(v.__k) .. '"' end
		local isArray = #v > 0
		local parts = {}
		if isArray then
			for _, x in ipairs(v) do parts[#parts + 1] = encode(x, depth + 1) end
			return "[" .. table.concat(parts, ",") .. "]"
		end
		local keys = {}
		for k in pairs(v) do if type(k) == "string" or type(k) == "number" then keys[#keys + 1] = tostring(k) end end
		table.sort(keys)
		for _, k in ipairs(keys) do
			local val = v[k] ~= nil and v[k] or v[tonumber(k)]
			parts[#parts + 1] = '"' .. jsonEscape(k) .. '":' .. encode(val, depth + 1)
		end
		return "{" .. table.concat(parts, ",") .. "}"
	end
	return '"<' .. t .. '>"'
end

function __APPLE_EMIT(status, detail)
	local callList = {}
	for _, c in ipairs(calls) do callList[#callList + 1] = { target = c.target, name = c.name, method = c.method, phase = c.phase } end
	local nodeList = {}
	for _, d in ipairs(nodes) do
		if not d.destroyed then
			nodeList[#nodeList + 1] = {
				class = d.class, name = d.props.Name or d.class,
				parent = d.parent and (d.parent.props.Name or d.parent.class) or nil,
			}
		end
	end
	local storeSummary = {}
	for name, tbl in pairs(stores) do
		local keys = {}
		for k, v in pairs(tbl) do keys[k] = v end
		storeSummary[name] = keys
	end
	local out = {
		status = status, detail = detail,
		calls = callList, created = created, services = services, globals = globalCalls,
		storeOps = storeOps, stores = storeSummary, facts = facts,
		transformYields = transformYields,
		handlerErrors = handlerErrors, unresolved = unresolved,
		nodes = nodeList,
	}
	print(OUT_MARKER .. encode(out))
end
