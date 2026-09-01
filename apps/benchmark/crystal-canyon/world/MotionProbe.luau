--!strict
--[[
	MotionProbe — measure UI motion as it actually renders, not as it is written.

	Master Mission §O: "Do not claim motion quality from tween code alone." A
	TweenInfo is a statement of intent; this module records what the frames did.

	WHY THIS IS A FILE AND NOT A SNIPPET. Two probe designs were tried first and
	both produced confident WRONG answers, so the working shape is worth keeping:

	  1. `require()`ing a client module from the MCP command context returns a
	     DIFFERENT module instance. Calling `Panels.open("shop")` on that copy hits
	     an empty panel table and returns silently. Read naively: "motion is broken".
	  2. Capturing GuiObject references once and sampling them is wrong, because
	     `CrystalCanyonUI` is a ScreenGui with the default `ResetOnSpawn = true`.
	     A respawn destroys and rebuilds it, and the probe then watches orphans —
	     240 consecutive frames of "nothing is visible" while the panel is on screen.

	So: targets are RESOLVED BY FUNCTION EVERY FRAME, and motion is driven through
	real input or the real remote, never by poking the module under test.

	Usage, from the Studio command context (Client datamodel):

	    MotionProbe.arm({ shop = function() ... return frame end }, 5000)
	    -- drive the interaction: click, fire a remote, collect a coin
	    MotionProbe.read()   -- per-target travel, peak, settle time, frame count

	State lives in `_G` because each command-context call is a fresh VM; the
	RenderStepped connection outlives the call that created it.
]]

local RunService = game:GetService("RunService")

local MotionProbe = {}

export type Sample = {
	t: number,
	pos: Vector2,
	size: Vector2,
	transparency: number,
	rotation: number,
	scale: number,
	text: string?,
}

--[[ Everything about a GuiObject that can carry motion. Sampled together so a
	 category that animates position (a toast sliding in) and one that animates
	 scale (a panel popping) are measured by the same probe rather than by two
	 that might disagree about timing. ]]
local function sampleOf(obj: Instance?, t: number): Sample?
	if not obj or not obj:IsA("GuiObject") then
		return nil
	end
	local uiScale = obj:FindFirstChildOfClass("UIScale")
	return {
		t = t,
		pos = obj.AbsolutePosition,
		size = obj.AbsoluteSize,
		transparency = obj.BackgroundTransparency,
		rotation = obj.Rotation,
		scale = if uiScale then uiScale.Scale else 1,
		text = if obj:IsA("TextLabel") then obj.Text else nil,
	}
end

--[[ `resolvers` is a map of name -> function returning the instance to watch.
	 A function, not an instance: see the ResetOnSpawn note in the header. A
	 resolver that returns nil this frame records a gap rather than erroring, so a
	 target that only exists mid-animation (a toast) still measures. ]]
function MotionProbe.arm(resolvers: { [string]: () -> Instance? }, durationMs: number)
	if _G.__mpConn then
		(_G.__mpConn :: RBXScriptConnection):Disconnect()
	end
	_G.__mp = {}
	_G.__mpMarks = {}
	local t0 = os.clock()
	_G.__mpT0 = t0

	for name in pairs(resolvers) do
		(_G.__mp :: any)[name] = {}
	end

	_G.__mpConn = RunService.RenderStepped:Connect(function()
		local t = (os.clock() - t0) * 1000
		if t > durationMs then
			(_G.__mpConn :: RBXScriptConnection):Disconnect()
			_G.__mpConn = nil
			return
		end
		for name, resolve in pairs(resolvers) do
			local ok, inst = pcall(resolve)
			local s = if ok then sampleOf(inst, t) else nil
			if s then
				table.insert((_G.__mp :: any)[name], s)
			end
		end
	end)
	return `armed for {durationMs}ms on {#(function() local n = {} for k in pairs(resolvers) do table.insert(n, k) end return n end)()} targets`
end

--[[ Label the moment an interaction was driven, so a category's timing can be
	 measured from its own trigger rather than from when the probe started. ]]
function MotionProbe.mark(label: string)
	if not _G.__mpT0 then
		return "not armed"
	end
	table.insert(_G.__mpMarks :: any, { label = label, t = (os.clock() - (_G.__mpT0 :: number)) * 1000 })
	return label
end

local function travel(series: { Sample }, get: (Sample) -> number): (number, number, number, number)
	if #series == 0 then
		return 0, 0, 0, 0
	end
	local lo, hi, first, last = math.huge, -math.huge, get(series[1]), get(series[#series])
	local peakT = 0
	for _, s in ipairs(series) do
		local v = get(s)
		if v < lo then lo = v end
		if v > hi then
			hi = v
			peakT = s.t
		end
	end
	return hi - lo, lo, hi, peakT
end

--[[ A per-target verdict. `moved` is the question §O actually asks: did this
	 category animate at all? The travel figures are what distinguishes a real
	 curve from a single-frame state change, which is a legitimate design choice
	 (Theme presses are a hard cut on purpose) and must not be reported as a tween. ]]
function MotionProbe.read()
	local out = {}
	local marks = (_G.__mpMarks :: any) or {}
	for name, series in pairs((_G.__mp :: any) or {}) do
		local sizeTravel, _, sizeHi, sizePeakT = travel(series, function(s)
			return s.size.X
		end)
		local posTravel = select(1, travel(series, function(s)
			return s.pos.Y
		end))
		local alphaTravel = select(1, travel(series, function(s)
			return s.transparency
		end))
		local scaleTravel, _, scaleHi, scalePeakT = travel(series, function(s)
			return s.scale
		end)
		local rotTravel = select(1, travel(series, function(s)
			return s.rotation
		end))
		local texts = {}
		local seen = {}
		for _, s in ipairs(series) do
			if s.text and not seen[s.text] then
				seen[s.text] = true
				table.insert(texts, s.text)
			end
		end
		out[name] = {
			frames = #series,
			sizeTravel = sizeTravel,
			sizePeak = sizeHi,
			sizePeakT = sizePeakT,
			posTravel = posTravel,
			alphaTravel = alphaTravel,
			scaleTravel = scaleTravel,
			scalePeak = scaleHi,
			scalePeakT = scalePeakT,
			rotTravel = rotTravel,
			distinctTexts = texts,
			moved = (sizeTravel > 0.5) or (posTravel > 0.5) or (alphaTravel > 0.01) or (scaleTravel > 0.005) or (rotTravel > 0.1) or (#texts > 1),
		}
	end
	return { marks = marks, targets = out }
end

return MotionProbe
