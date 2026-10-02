--!strict
--[[
	AppleBehave: runtime behaviour for models that arrive WITHOUT any. A library or Creator Store model comes in with
	every script and sound stripped, so a lid that should open, a button that should play a sound or a sign that should
	spin is just a still shape. This is the one reviewed script that gives such a model behaviour from DATA: the model
	carries a ModuleScript named AppleBehaviours (written by add_behaviour, nothing from the wire is ever code) and this
	script, one copy in ServerScriptService, reads it and wires the model up when the game runs.

	  return { v = 1, behaviours = {
	    { id = "a", verb = "swing", target = { "Lid" }, hinge = { pivot = { 0, -1, -1 }, axis = "x" }, angle = -100,
	      seconds = 0.6, ease = "Back", trigger = { on = "click", text = "Open" }, mode = "toggle" },
	    { id = "b", verb = "sound", target = { "Lid" }, soundId = "rbxassetid://...", trigger = { on = "click" } },
	  } }

	A behaviour is a VERB done to a part (or to every part of a sub-model) when a TRIGGER fires. There is no subject in
	here: nothing knows what a model is, only which part moves, where its hinge is and what starts it.

	Verbs     swing   turn about a hinge line (pivot = a point on the part's box, as -1..1 of each half-size; axis = one
	                  of the box's own axes; angle in degrees, right-hand rule), to and from rest
	          slide   move by an offset (studs, in the target's own frame), to and from rest
	          spin    turn without end about an axis through a pivot (degrees a second)
	          bob     rise and fall about rest, as a sine or as hops (studs, seconds a cycle)
	          fade    go to a transparency (and stop colliding when it is gone), and come back
	          light   switch the lights under the target (or make one), and optionally glow (Neon)
	          sound   play a Sound (an existing one by path, or an id from Apple's sound library), once or looped
	          emit    burst the particle emitters under the target, or switch them on and off
	          bounce  launch whoever touches the target (studs a second, along a direction in the target's frame)
	Triggers  click | prompt | touch | near | auto, on the target or on another part (trigger.at)
	Modes     toggle (each trigger flips it) | pulse (on, then back after `hold` seconds) | hold (on while touching or
	          near) | once (on, and it stays); `auto` starts on, and swing, slide and fade then go back and forth.

	Several behaviours can share one trigger (a lid that swings, creaks and glows from one click). Movers that share a
	part compose: every rotation is applied about its own hinge in the order written, then every translation, always from
	the pose the part had when the game started. Moving parts are anchored, and a weld or joint between a moving part and
	one that stays still is switched off, because a CFrame cannot be set on one half of a weld.

	Every number is clamped and every path resolved defensively: this file is edited by hand as well as written by tools.
	The pure functions at the top are exercised in the luau CLI (packages/components/tests/behave.test.mjs); the glue in
	AppleBehave.start() is exercised there against a mock of the Roblox API and has NOT been run in Studio.
]]

local AppleBehave = {}

AppleBehave.VERSION = 1
AppleBehave.MODULE_NAME = "AppleBehaviours"
-- Where "now" comes from for cooldowns: os.clock in a game, a fake clock in the mock-driven specs.
AppleBehave.clock = os.clock

AppleBehave.VERBS = { swing = true, slide = true, spin = true, bob = true, fade = true, light = true, sound = true, emit = true, bounce = true }
AppleBehave.TRIGGERS = { click = true, prompt = true, touch = true, near = true, auto = true }
AppleBehave.MODES = { toggle = true, pulse = true, hold = true, once = true }
AppleBehave.EASES = { Linear = true, Sine = true, Quad = true, Back = true, Bounce = true, Elastic = true }
AppleBehave.AXES = { x = { 1, 0, 0 }, y = { 0, 1, 0 }, z = { 0, 0, 1 } }
-- Verbs that are a state (on and off, with a position in between) rather than a moment.
AppleBehave.STATE_VERBS = { swing = true, slide = true, spin = true, bob = true, fade = true, light = true }

--[[ Pure: the eased share of a stretch done at u (0..1). Same curves as AppleAnimate. ]]
function AppleBehave.ease(style: string?, u: number): number
	u = math.clamp(u, 0, 1)
	if style == "Sine" then return 1 - math.cos(u * math.pi / 2) end
	if style == "Quad" then return 1 - (1 - u) * (1 - u) end
	if style == "Back" then local c = 1.70158; local v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v end
	if style == "Bounce" then
		local n, d = 7.5625, 2.75
		if u < 1 / d then return n * u * u
		elseif u < 2 / d then u -= 1.5 / d; return n * u * u + 0.75
		elseif u < 2.5 / d then u -= 2.25 / d; return n * u * u + 0.9375 end
		u -= 2.625 / d
		return n * u * u + 0.984375
	end
	if style == "Elastic" then
		if u == 0 or u == 1 then return u end
		return 2 ^ (-10 * u) * math.sin((u * 10 - 0.75) * (2 * math.pi) / 3) + 1
	end
	return u
end

--[[ Pure: `value` moved toward `target` at one whole unit per `seconds` (instantly when seconds is 0). ]]
function AppleBehave.approach(value: number, target: number, dt: number, seconds: number): number
	if seconds <= 0 then return target end
	local step = dt / seconds
	if value < target then return math.min(target, value + step) end
	return math.max(target, value - step)
end

--[[ Pure: a repeating shape at time t. "sine" swings -1..1 (starting at rest); "hop" rises 0..1 and lands once per period. ]]
function AppleBehave.wave(shape: string?, t: number, period: number): number
	local p = if period > 0 then period else 1
	if shape == "hop" then return math.abs(math.sin(math.pi * t / p)) end
	return math.sin(2 * math.pi * t / p)
end

--[[ Pure: the part of a tree a path names. A segment is a name, or { name = , nth = } for the nth child of that name
	(Roblox allows several siblings with one name, and a path by names alone cannot tell them apart). Works on anything
	with GetChildren and Name, so it is exercised on a plain table tree. ]]
function AppleBehave.resolve(root: any, segs: { any }): any?
	local at = root
	for _, seg in segs do
		if at == nil then return nil end
		local name: any, nth: any = seg, 1
		if type(seg) == "table" then name, nth = seg.name, seg.nth or 1 end
		if type(name) ~= "string" or type(nth) ~= "number" then return nil end
		local seen, found = 0, nil
		for _, child in at:GetChildren() do
			if child.Name == name then
				seen += 1
				if seen == nth then found = child; break end
			end
		end
		if found == nil then return nil end
		at = found
	end
	return at
end

--[[ Pure: what a trigger event does to a behaviour that is on or off. Returns the new state and whether to (re)start the
	timer that turns it off again (`hold` seconds, modes pulse and hold). Events: activate (a click, a prompt, a touch),
	enter and leave (a player comes near or goes away), expire (the hold ran out). ]]
function AppleBehave.transition(mode: string, on: boolean, event: string): (boolean, boolean)
	if event == "expire" then
		if mode == "pulse" or mode == "hold" then return false, false end
		return on, false
	end
	if mode == "toggle" then
		if event == "activate" then return not on, false end
		return on, false
	elseif mode == "pulse" then
		if event == "activate" or event == "enter" then return true, true end
		return on, false
	elseif mode == "hold" then
		if event == "activate" then return true, true end -- touching refreshes the hold; it ends when the touching stops
		if event == "enter" then return true, false end
		if event == "leave" then return false, false end
		return on, false
	elseif mode == "once" then
		if event == "activate" or event == "enter" then return true, false end
		return on, false
	end
	return on, false
end

--[[ Pure: the trigger and the mode a behaviour gets when it does not say. ]]
function AppleBehave.defaultTrigger(verb: string): string
	if verb == "spin" or verb == "bob" then return "auto" end
	if verb == "bounce" then return "touch" end
	return "click"
end

function AppleBehave.defaultMode(trigger: string): string
	if trigger == "touch" then return "pulse" end
	if trigger == "near" then return "hold" end
	return "toggle"
end

-- ---------------------------------------------------------------- 3D maths on plain tables (a CFrame as 12 numbers)
-- Component order is CFrame:GetComponents(): x, y, z, R00, R01, R02, R10, R11, R12, R20, R21, R22, so a local axis is a column.

function AppleBehave.vectorToWorld(c: { number }, v: { number }): { number }
	return {
		c[4] * v[1] + c[5] * v[2] + c[6] * v[3],
		c[7] * v[1] + c[8] * v[2] + c[9] * v[3],
		c[10] * v[1] + c[11] * v[2] + c[12] * v[3],
	}
end

function AppleBehave.pointToWorld(c: { number }, v: { number }): { number }
	local w = AppleBehave.vectorToWorld(c, v)
	return { c[1] + w[1], c[2] + w[2], c[3] + w[3] }
end

--[[ Pure: the world point at `frac` ({-1..1} of each half-size) of a box with frame `box` and size `size`. ]]
function AppleBehave.boxPoint(box: { number }, size: { number }, frac: { number }): { number }
	return AppleBehave.pointToWorld(box, { frac[1] * size[1] / 2, frac[2] * size[2] / 2, frac[3] * size[3] / 2 })
end

--[[ Pure: the frame `c` turned by `degrees` about the line through `pivot` along `axis` (world, any length), right-hand
	rule: position and orientation both move, as a rigid piece on a hinge does. ]]
function AppleBehave.swingComponents(c: { number }, pivot: { number }, axis: { number }, degrees: number): { number }
	local len = math.sqrt(axis[1] * axis[1] + axis[2] * axis[2] + axis[3] * axis[3])
	if len < 1e-9 or degrees == 0 then return table.clone(c) end
	local x, y, z = axis[1] / len, axis[2] / len, axis[3] / len
	local th = math.rad(degrees)
	local s, co = math.sin(th), math.cos(th)
	local t = 1 - co
	-- Rodrigues: R = I + s K + (1 - c) K^2
	local r00, r01, r02 = co + x * x * t, x * y * t - z * s, x * z * t + y * s
	local r10, r11, r12 = y * x * t + z * s, co + y * y * t, y * z * t - x * s
	local r20, r21, r22 = z * x * t - y * s, z * y * t + x * s, co + z * z * t
	local px, py, pz = c[1] - pivot[1], c[2] - pivot[2], c[3] - pivot[3]
	local out = {
		pivot[1] + r00 * px + r01 * py + r02 * pz,
		pivot[2] + r10 * px + r11 * py + r12 * pz,
		pivot[3] + r20 * px + r21 * py + r22 * pz,
	}
	for col = 0, 2 do
		local a, b, d = c[4 + col], c[7 + col], c[10 + col]
		out[4 + col] = r00 * a + r01 * b + r02 * d
		out[7 + col] = r10 * a + r11 * b + r12 * d
		out[10 + col] = r20 * a + r21 * b + r22 * d
	end
	return out
end

--[[ Pure: the frame `c` moved by a world vector. ]]
function AppleBehave.moveComponents(c: { number }, by: { number }): { number }
	local out = table.clone(c)
	out[1] += by[1]; out[2] += by[2]; out[3] += by[3]
	return out
end

--[[ Pure: the pose of a part that has movers on it: from its rest frame, every rotation about its own hinge in order
	({ pivot, axis, degrees }), then every translation ({ x, y, z } world). ]]
function AppleBehave.compose(rest: { number }, rotations: { { pivot: { number }, axis: { number }, degrees: number } }, moves: { { number } }): { number }
	local c = rest
	for _, r in rotations do c = AppleBehave.swingComponents(c, r.pivot, r.axis, r.degrees) end
	for _, m in moves do c = AppleBehave.moveComponents(c, m) end
	return c
end

-- ---------------------------------------------------------------------------------------------------- the record

local function finite(v: any): boolean
	return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

-- A number in range: `fallback` when absent, nil when it is not a usable number, clamped otherwise.
local function num(v: any, lo: number, hi: number, fallback: number?): number?
	if v == nil then return fallback end
	if not finite(v) then return nil end
	return math.clamp(v, lo, hi)
end

local function vec(v: any, limit: number, fallback: { number }?): { number }?
	if v == nil then return fallback end
	if type(v) ~= "table" or #v ~= 3 then return nil end
	local out = {}
	for i = 1, 3 do
		if not finite(v[i]) then return nil end
		out[i] = math.clamp(v[i], -limit, limit)
	end
	return out
end

local function refOf(v: any, label: string): ({ any }?, string?)
	if v == nil then return nil, nil end
	if type(v) ~= "table" then return nil, label .. " is not a path" end
	local segs = v.segs
	if type(segs) ~= "table" or #segs > 24 then return nil, label .. " is not a path" end
	for _, s in segs do
		if type(s) == "string" then
			if #s == 0 or #s > 100 then return nil, label .. " has a bad name" end
		elseif type(s) == "table" then
			if type(s.name) ~= "string" or #s.name == 0 or #s.name > 100 or not finite(s.nth) or s.nth < 1 or s.nth > 500 then return nil, label .. " has a bad name" end
		else
			return nil, label .. " has a bad name"
		end
	end
	return { segs = segs, abs = v.abs == true }, nil
end

--[[ Pure: one record as read from the AppleBehaviours module, checked and given its defaults; or nil and why not. ]]
function AppleBehave.check(raw: any): ({ [string]: any }?, string?)
	if type(raw) ~= "table" then return nil, "not a table" end
	local verb = raw.verb
	if type(verb) ~= "string" or not AppleBehave.VERBS[verb] then return nil, "unknown verb " .. tostring(verb) end
	local rec: { [string]: any } = { verb = verb }
	local id = raw.id
	if id ~= nil and (type(id) ~= "string" or not string.match(id, "^[A-Za-z_][A-Za-z0-9_]*$") or #id > 32) then return nil, "bad id" end
	rec.id = id or verb

	local target, targetErr = refOf(raw.target, "target")
	if targetErr then return nil, targetErr end
	rec.target = target or { segs = {}, abs = false }
	local with: { any } = {}
	if raw["with"] ~= nil then
		if type(raw["with"]) ~= "table" or #raw["with"] > 60 then return nil, "with is not a list of paths" end
		for _, w in raw["with"] do
			local ref, err = refOf(w, "with")
			if err or not ref then return nil, err or "with is not a path" end
			table.insert(with, ref)
		end
	end
	rec["with"] = with

	local trig = raw.trigger
	if trig ~= nil and type(trig) ~= "table" then return nil, "trigger is not a table" end
	trig = trig or {}
	local on = trig.on or AppleBehave.defaultTrigger(verb)
	if type(on) ~= "string" or not AppleBehave.TRIGGERS[on] then return nil, "unknown trigger " .. tostring(on) end
	if verb == "bounce" then on = "touch" end -- a launcher launches whoever touches it
	local at, atErr = refOf(trig.at, "trigger.at")
	if atErr then return nil, atErr end
	local reach = num(trig.reach, 1, 500, nil)
	if trig.reach ~= nil and reach == nil then return nil, "trigger.reach is not a number" end
	local cooldown = num(trig.cooldown, 0, 60, nil)
	if trig.cooldown ~= nil and cooldown == nil then return nil, "trigger.cooldown is not a number" end
	local text = if type(trig.text) == "string" then string.sub(trig.text, 1, 30) else nil
	rec.trigger = { on = on, at = at, reach = reach, cooldown = cooldown, text = text }

	local mode = raw.mode or AppleBehave.defaultMode(on)
	if type(mode) ~= "string" or not AppleBehave.MODES[mode] then return nil, "unknown mode " .. tostring(mode) end
	rec.mode = mode
	local hold = num(raw.hold, 0.05, 600, nil)
	if raw.hold ~= nil and hold == nil then return nil, "hold is not a number" end
	rec.hold = hold
	local delay = num(raw.delay, 0, 60, 0)
	if delay == nil then return nil, "delay is not a number" end
	rec.delay = delay

	local ease = raw.ease
	if ease ~= nil and (type(ease) ~= "string" or not AppleBehave.EASES[ease]) then return nil, "unknown ease " .. tostring(ease) end
	rec.ease = ease or "Sine"

	if verb == "swing" or verb == "spin" then
		local hinge = raw.hinge
		if hinge ~= nil and type(hinge) ~= "table" then return nil, "hinge is not a table" end
		hinge = hinge or {}
		local pivot = vec(hinge.pivot, 1, { 0, 0, 0 })
		if not pivot then return nil, "hinge.pivot must be three numbers from -1 to 1" end
		local axis = hinge.axis or "y"
		if type(axis) ~= "string" or not AppleBehave.AXES[axis] then return nil, "hinge.axis must be x, y or z" end
		rec.hinge = { pivot = pivot, axis = axis }
	end

	if verb == "swing" then
		local angle = num(raw.angle, -360, 360, 90)
		if angle == nil or angle == 0 then return nil, "angle must be a number of degrees, not 0" end
		rec.angle = angle
		local seconds = num(raw.seconds, 0.05, 30, 0.6)
		if seconds == nil then return nil, "seconds is not a number" end
		rec.seconds = seconds
	elseif verb == "slide" then
		local offset = vec(raw.offset, 1000, nil)
		if not offset or (offset[1] == 0 and offset[2] == 0 and offset[3] == 0) then return nil, "offset must be three numbers of studs, not all 0" end
		rec.offset = offset
		rec.space = if raw.space == "world" then "world" else "local"
		local seconds = num(raw.seconds, 0.05, 30, 0.6)
		if seconds == nil then return nil, "seconds is not a number" end
		rec.seconds = seconds
	elseif verb == "spin" then
		local speed = num(raw.speed, -1440, 1440, 90)
		if speed == nil or speed == 0 then return nil, "speed must be degrees a second, not 0" end
		rec.speed = speed
	elseif verb == "bob" then
		local axis = raw.axis or "y"
		if type(axis) ~= "string" or not AppleBehave.AXES[axis] then return nil, "axis must be x, y or z" end
		rec.axis = axis
		rec.amount = num(raw.amount, 0.02, 100, 1)
		rec.period = num(raw.period, 0.2, 60, 2)
		if rec.amount == nil or rec.period == nil then return nil, "amount and period must be numbers" end
		rec.shape = if raw.shape == "hop" then "hop" else "sine"
	elseif verb == "fade" then
		rec.to = num(raw.to, 0, 1, 1)
		rec.seconds = num(raw.seconds, 0.05, 30, 0.4)
		if rec.to == nil or rec.seconds == nil then return nil, "to and seconds must be numbers" end
		rec.collide = raw.collide ~= false
	elseif verb == "light" then
		local color = vec(raw.color, 1, { 1, 0.85, 0.6 })
		if not color or color[1] < 0 or color[2] < 0 or color[3] < 0 then return nil, "color must be three numbers from 0 to 1" end
		rec.color = color
		rec.brightness = num(raw.brightness, 0, 20, 2)
		rec.range = num(raw.range, 2, 120, 16)
		rec.seconds = num(raw.seconds, 0, 5, 0.25)
		if rec.brightness == nil or rec.range == nil or rec.seconds == nil then return nil, "brightness, range and seconds must be numbers" end
		rec.glow = raw.glow == true
	elseif verb == "sound" then
		local soundRef, soundErr = refOf(raw.sound, "sound")
		if soundErr then return nil, soundErr end
		local soundId = raw.soundId
		if soundId ~= nil and (type(soundId) ~= "string" or #soundId > 60 or not string.match(soundId, "^rbxassetid://%d+$")) then return nil, "soundId must be rbxassetid://<number>" end
		if soundRef == nil and soundId == nil then return nil, "a sound behaviour needs `sound` (a path) or `soundId`" end
		rec.sound = soundRef
		rec.soundId = soundId
		rec.volume = num(raw.volume, 0, 4, 0.6)
		rec.pitch = num(raw.pitch, 0.1, 4, 1)
		rec.variance = num(raw.variance, 0, 0.5, 0.04)
		rec.range = num(raw.range, 4, 1000, 60)
		rec.fade = num(raw.fade, 0, 5, 0.3)
		if rec.volume == nil or rec.pitch == nil or rec.variance == nil or rec.range == nil or rec.fade == nil then return nil, "volume, pitch, variance, range and fade must be numbers" end
		rec.loop = raw.loop == true
	elseif verb == "emit" then
		rec.count = num(raw.count, 1, 500, 20)
		if rec.count == nil then return nil, "count is not a number" end
		rec.sustain = raw.sustain == true
	elseif verb == "bounce" then
		rec.power = num(raw.power, 10, 400, 80)
		local dir = vec(raw.direction, 1, { 0, 1, 0 })
		if rec.power == nil or not dir or (dir[1] == 0 and dir[2] == 0 and dir[3] == 0) then return nil, "power and direction must be numbers" end
		rec.direction = dir
		rec.cooldown = num(raw.cooldown, 0.1, 10, 0.6)
		if rec.cooldown == nil then return nil, "cooldown is not a number" end
	end
	return rec, nil
end

-- ------------------------------------------------------------------------------------------------------------ the glue

local function comps(cf: CFrame): { number }
	return { cf:GetComponents() }
end

function AppleBehave.start()
	local RunService = game:GetService("RunService")
	local Players = game:GetService("Players")

	local function partsOf(inst: Instance): { BasePart }
		local out: { BasePart } = {}
		if inst:IsA("BasePart") then table.insert(out, inst) end
		for _, d in inst:GetDescendants() do
			if d:IsA("BasePart") then table.insert(out, d) end
		end
		return out
	end

	-- A part to hang a prompt or a sound on: the PrimaryPart, else the biggest part.
	local function anchorPart(inst: Instance): BasePart?
		if inst:IsA("BasePart") then return inst end
		if inst:IsA("Model") and inst.PrimaryPart then return inst.PrimaryPart end
		local best: BasePart? = nil
		local bestVolume = -1
		for _, p in partsOf(inst) do
			local volume = p.Size.X * p.Size.Y * p.Size.Z
			if volume > bestVolume then best, bestVolume = p, volume end
		end
		return best
	end

	-- The frame and size of a part, or of a model's bounding box, as plain numbers.
	local function boxOf(inst: Instance): { c: { number }, size: { number } }?
		if inst:IsA("BasePart") then
			return { c = comps(inst.CFrame), size = { inst.Size.X, inst.Size.Y, inst.Size.Z } }
		elseif inst:IsA("Model") then
			local cf, size = inst:GetBoundingBox()
			return { c = comps(cf), size = { size.X, size.Y, size.Z } }
		end
		return nil
	end

	local function centreOf(inst: Instance): { number }?
		local box = boxOf(inst)
		return if box then { box.c[1], box.c[2], box.c[3] } else nil
	end

	-- ---- movers: every part that moves keeps the pose it had at the start, and the movers on it are composed from that.
	local restOf: { [BasePart]: { number } } = {}
	local moversOf: { [BasePart]: { any } } = {}
	local dirtyParts: { [BasePart]: boolean } = {}

	local function releaseJoints(root: Instance, moved: { [BasePart]: boolean })
		for _, d in root:GetDescendants() do
			if d:IsA("JointInstance") or d:IsA("WeldConstraint") then
				local j = d :: any
				local a, b = j.Part0, j.Part1
				if a and b and ((moved[a] == true) ~= (moved[b] == true)) then j.Enabled = false end
			end
		end
	end

	local function newMover(root: Instance, parts: { BasePart }, kind: string, pivot: { number }?, axis: { number }?)
		local m: any = { kind = kind, pivot = pivot, axis = axis, value = 0, vec = { 0, 0, 0 }, parts = parts }
		local moved: { [BasePart]: boolean } = {}
		for _, p in parts do moved[p] = true end
		for _, p in parts do
			if not restOf[p] then restOf[p] = comps(p.CFrame); p.Anchored = true end
			local list = moversOf[p] or {}
			moversOf[p] = list
			table.insert(list, m)
		end
		releaseJoints(root, moved)
		function m.touch()
			for _, p in m.parts do dirtyParts[p] = true end
		end
		return m
	end

	local function applyPoses()
		for p in dirtyParts do
			dirtyParts[p] = nil
			local rest = restOf[p]
			if rest and p.Parent then
				local rotations, moves = {}, {}
				for _, m in moversOf[p] or {} do
					if m.kind == "rot" then
						table.insert(rotations, { pivot = m.pivot, axis = m.axis, degrees = m.value })
					else
						table.insert(moves, m.vec)
					end
				end
				p.CFrame = CFrame.new(table.unpack(AppleBehave.compose(rest, rotations, moves)))
			end
		end
	end

	-- ---- the per-frame list: a behaviour's `update(dt)` while it is alive
	local updaters: { (number) -> () } = {}
	-- Players near things are polled, not tracked: one pass every 0.2 s over every near trigger.
	local nears: { any } = {}
	local sinceNear = 0

	local function playersNear(center: { number }, reach: number): boolean
		for _, plr in Players:GetPlayers() do
			local root = plr.Character and plr.Character:FindFirstChild("HumanoidRootPart")
			if root and root:IsA("BasePart") then
				local dx, dy, dz = root.Position.X - center[1], root.Position.Y - center[2], root.Position.Z - center[3]
				if dx * dx + dy * dy + dz * dz <= reach * reach then return true end
			end
		end
		return false
	end

	local function resolveRef(model: Instance, ref: any): Instance?
		if ref == nil then return nil end
		return AppleBehave.resolve(if ref.abs then game else model, ref.segs)
	end

	-- A value that eases between 0 and 1 toward the state a trigger asks for.
	-- `cycles`: an `auto` swing, slide or fade goes back and forth (waiting `hold` seconds at each end) instead of resting.
	local function makeProgress(rec: any, apply: (number) -> (), cycles: boolean)
		local p, target, waited = 0.0, 0.0, 0.0
		local obj: any = {}
		function obj.set(on: boolean) target = if on then 1 else 0 end
		function obj.update(dt: number)
			if cycles and p == target then
				waited += dt
				if waited >= (rec.hold or 0.5) then waited = 0; target = 1 - target end
			end
			if p ~= target then
				p = AppleBehave.approach(p, target, dt, rec.seconds or 0.5)
				apply(math.max(0, AppleBehave.ease(rec.ease, p)))
			end
		end
		function obj.progress() return p end
		return obj
	end

	local verbs: { [string]: (Instance, any, { BasePart }) -> any } = {}

	local function rotationFrame(target: Instance, rec: any): { pivot: { number }, axis: { number } }?
		local box = boxOf(target)
		if not box then return nil end
		return {
			pivot = AppleBehave.boxPoint(box.c, box.size, rec.hinge.pivot),
			axis = AppleBehave.vectorToWorld(box.c, AppleBehave.AXES[rec.hinge.axis]),
		}
	end

	verbs.swing = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local frame = rotationFrame(target, rec)
		if not frame then error("target is not a part or a model") end
		local mover = newMover(model, parts, "rot", frame.pivot, frame.axis)
		local prog = makeProgress(rec, function(v) mover.value = rec.angle * v; mover.touch() end, rec.trigger.on == "auto")
		return { kind = "state", set = prog.set, update = prog.update }
	end

	verbs.slide = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local box = boxOf(target)
		if not box then error("target is not a part or a model") end
		local world = if rec.space == "world" then rec.offset else AppleBehave.vectorToWorld(box.c, rec.offset)
		local mover = newMover(model, parts, "move", nil, nil)
		local prog = makeProgress(rec, function(v) mover.vec = { world[1] * v, world[2] * v, world[3] * v }; mover.touch() end, rec.trigger.on == "auto")
		return { kind = "state", set = prog.set, update = prog.update }
	end

	verbs.spin = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local frame = rotationFrame(target, rec)
		if not frame then error("target is not a part or a model") end
		local mover = newMover(model, parts, "rot", frame.pivot, frame.axis)
		local ramp, goal = 0.0, 0.0
		return {
			kind = "state",
			set = function(on: boolean) goal = if on then 1 else 0 end,
			update = function(dt: number)
				ramp = AppleBehave.approach(ramp, goal, dt, 0.4)
				if ramp > 0 then
					mover.value = (mover.value + rec.speed * ramp * dt) % 360
					mover.touch()
				end
			end,
		}
	end

	verbs.bob = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local box = boxOf(target)
		if not box then error("target is not a part or a model") end
		local axis = AppleBehave.vectorToWorld(box.c, AppleBehave.AXES[rec.axis])
		local mover = newMover(model, parts, "move", nil, nil)
		local ramp, goal, t = 0.0, 0.0, 0.0
		return {
			kind = "state",
			set = function(on: boolean) goal = if on then 1 else 0 end,
			update = function(dt: number)
				if ramp == 0 and goal == 0 then return end
				ramp = AppleBehave.approach(ramp, goal, dt, 0.4)
				t += dt
				local d = rec.amount * ramp * AppleBehave.wave(rec.shape, t, rec.period)
				mover.vec = { axis[1] * d, axis[2] * d, axis[3] * d }
				mover.touch()
			end,
		}
	end

	verbs.fade = function(model: Instance, rec: any, parts: { BasePart }): any
		local things: { { inst: any, from: number, canCollide: boolean? } } = {}
		for _, p in parts do table.insert(things, { inst = p, from = p.Transparency, canCollide = p.CanCollide }) end
		local target = resolveRef(model, rec.target) :: Instance
		for _, d in target:GetDescendants() do
			if d:IsA("Decal") or d:IsA("Texture") then table.insert(things, { inst = d, from = (d :: any).Transparency }) end
		end
		local prog = makeProgress(rec, function(v)
			local k = math.clamp(v, 0, 1)
			for _, t in things do
				t.inst.Transparency = t.from + (math.max(rec.to, t.from) - t.from) * k
				if t.canCollide ~= nil and rec.collide then t.inst.CanCollide = if k >= 0.95 then false else t.canCollide end
			end
		end, rec.trigger.on == "auto")
		return { kind = "state", set = prog.set, update = prog.update }
	end

	verbs.light = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local lights: { { inst: any, brightness: number } } = {}
		for _, d in target:GetDescendants() do
			if d:IsA("Light") then table.insert(lights, { inst = d, brightness = (d :: any).Brightness }) end
		end
		if #lights == 0 then
			local host = anchorPart(target)
			if not host then error("nothing to hang a light on") end
			local l = Instance.new("PointLight")
			l.Color = Color3.new(rec.color[1], rec.color[2], rec.color[3])
			l.Brightness = rec.brightness
			l.Range = rec.range
			l.Enabled = false
			l.Parent = host
			table.insert(lights, { inst = l, brightness = rec.brightness })
		end
		local glowing: { { part: BasePart, material: Enum.Material } } = {}
		if rec.glow then for _, p in parts do table.insert(glowing, { part = p, material = p.Material }) end end
		local prog = makeProgress(rec, function(v)
			for _, l in lights do
				l.inst.Enabled = v > 0.001
				l.inst.Brightness = l.brightness * math.clamp(v, 0, 1)
			end
			for _, g in glowing do g.part.Material = if v > 0.5 then Enum.Material.Neon else g.material end
		end, false)
		-- Lights start off unless the behaviour starts on (auto), as a light with a switch does.
		for _, l in lights do l.inst.Enabled = false end
		return { kind = "state", set = prog.set, update = function(dt: number) prog.update(dt) end }
	end

	verbs.emit = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local emitters: { any } = {}
		for _, d in target:GetDescendants() do
			if d:IsA("ParticleEmitter") and #emitters < 12 then table.insert(emitters, d) end
		end
		if #emitters == 0 then error("no particle emitter under the target") end
		if rec.sustain then
			for _, e in emitters do e.Enabled = false end
			return { kind = "state", set = function(on: boolean) for _, e in emitters do e.Enabled = on end end, update = function() end }
		end
		return { kind = "event", fire = function() for _, e in emitters do e:Emit(rec.count) end end }
	end

	verbs.sound = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local host = anchorPart(target)
		if not host then error("nothing to play the sound from") end
		local source: Sound? = nil
		if rec.sound then
			local found = resolveRef(model, rec.sound)
			if found and found:IsA("Sound") then source = found else error("the sound path does not name a Sound") end
		end
		local function make(): Sound
			local s: Sound
			if source then s = source:Clone() else s = Instance.new("Sound"); s.SoundId = rec.soundId end
			s.Volume = rec.volume
			s.PlaybackSpeed = rec.pitch * (1 + (math.random() - 0.5) * 2 * rec.variance)
			s.RollOffMaxDistance = rec.range
			s.Looped = rec.loop
			s.Parent = host
			return s
		end
		if rec.loop then
			local s: Sound? = nil
			local want, level = 0.0, 0.0
			return {
				kind = "state",
				set = function(on: boolean)
					want = if on then 1 else 0
					if on and not s then s = make(); (s :: Sound).Volume = 0 end
					if on and s and not s.IsPlaying then s.Playing = true end
				end,
				update = function(dt: number)
					if not s then return end
					level = AppleBehave.approach(level, want, dt, rec.fade)
					s.Volume = rec.volume * level
					if level == 0 and want == 0 and s.IsPlaying then s.Playing = false end
				end,
			}
		end
		return {
			kind = "event",
			fire = function()
				local s = make()
				s.Looped = false
				s.Ended:Once(function() s:Destroy() end)
				s:Play()
				task.delay(60, function() if s.Parent then s:Destroy() end end)
			end,
		}
	end

	verbs.bounce = function(model: Instance, rec: any, parts: { BasePart }): any
		local target = resolveRef(model, rec.target) :: Instance
		local box = boxOf(target)
		if not box then error("target is not a part or a model") end
		local dir = AppleBehave.vectorToWorld(box.c, rec.direction)
		local len = math.sqrt(dir[1] * dir[1] + dir[2] * dir[2] + dir[3] * dir[3])
		if len < 1e-9 then error("direction has no length") end
		dir = { dir[1] / len, dir[2] / len, dir[3] / len }
		return {
			kind = "event",
			fire = function(player: Player?, hit: Instance?)
				local char = hit and hit.Parent
				local root = char and char:FindFirstChild("HumanoidRootPart")
				if not root or not root:IsA("BasePart") then return end
				local v = root.AssemblyLinearVelocity
				local keep = if math.abs(dir[2]) > 0.5 then { v.X, 0, v.Z } else { 0, 0, 0 }
				root.AssemblyLinearVelocity = Vector3.new(keep[1] + dir[1] * rec.power, keep[2] + dir[2] * rec.power, keep[3] + dir[3] * rec.power)
				local humanoid = char and char:FindFirstChildOfClass("Humanoid")
				if humanoid then humanoid:ChangeState(Enum.HumanoidStateType.Jumping) end
			end,
		}
	end

	-- ---- triggers
	local detectors: { [Instance]: { [string]: any } } = {}
	local function shared(at: Instance, kind: string, make: () -> any): any
		local byKind = detectors[at] or {}
		detectors[at] = byKind
		if not byKind[kind] then byKind[kind] = make() end
		return byKind[kind]
	end

	local function bindTrigger(model: Instance, rec: any, target: Instance, onEvent: (string, Player?, Instance?) -> ())
		local at = resolveRef(model, rec.trigger.at) or target
		local on = rec.trigger.on
		if on == "click" then
			local cd = shared(at, "click", function()
				local existing = at:FindFirstChildWhichIsA("ClickDetector")
				local d = existing or Instance.new("ClickDetector")
				if not existing then d.Parent = at end
				return d
			end)
			cd.MaxActivationDistance = rec.trigger.reach or 40
			cd.MouseClick:Connect(function(player: Player) onEvent("activate", player, nil) end)
		elseif on == "prompt" then
			local host = anchorPart(at)
			if not host then error("nothing to hang a prompt on") end
			local pp = shared(at, "prompt", function()
				local p = Instance.new("ProximityPrompt")
				p.ActionText = rec.trigger.text or "Use"
				p.ObjectText = at.Name
				p.HoldDuration = 0
				p.RequiresLineOfSight = false
				p.Parent = host
				return p
			end)
			pp.MaxActivationDistance = rec.trigger.reach or 10
			pp.Triggered:Connect(function(player: Player) onEvent("activate", player, nil) end)
		elseif on == "touch" then
			local count = 0
			for _, p in partsOf(at) do
				count += 1
				if count > 80 then break end
				p.Touched:Connect(function(hit: BasePart)
					local char = hit.Parent
					if not char or not char:FindFirstChildOfClass("Humanoid") then return end
					onEvent("activate", Players:GetPlayerFromCharacter(char), hit)
				end)
			end
		elseif on == "near" then
			table.insert(nears, { center = function() return centreOf(at) end, reach = rec.trigger.reach or 12, inside = false, handler = onEvent })
		end
	end

	local function build(model: Instance, rec: any)
		local target = resolveRef(model, rec.target)
		if not target then error("target not found") end
		local parts = partsOf(target)
		for _, w in rec["with"] do
			local extra = resolveRef(model, w)
			if not extra then error("a part listed in `with` was not found") end
			for _, p in partsOf(extra) do table.insert(parts, p) end
		end
		if AppleBehave.STATE_VERBS[rec.verb] and #parts == 0 and rec.verb ~= "light" then error("the target has no parts") end
		local act = verbs[rec.verb](model, rec, parts)
		local on, last, token, fired = false, -math.huge, 0, 0
		local cooldown = rec.trigger.cooldown or (if rec.verb == "bounce" then rec.cooldown else 0.25)

		local function announce(state: boolean)
			model:SetAttribute("AppleBehave_" .. rec.id, state)
		end
		local function apply(state: boolean)
			on = state
			act.set(state)
			announce(state)
		end

		local function onEvent(event: string, player: Player?, hit: Instance?)
			if act.kind == "event" then
				if event ~= "activate" and event ~= "enter" then return end
				local now = AppleBehave.clock()
				if now - last < cooldown then return end
				last = now
				fired += 1
				local function run() act.fire(player, hit); model:SetAttribute("AppleBehave_" .. rec.id .. "_fired", fired) end
				if rec.delay > 0 then task.delay(rec.delay, run) else run() end
				return
			end
			local gated = rec.mode == "toggle" or rec.mode == "once"
			if event == "activate" and gated then
				local now = AppleBehave.clock()
				if now - last < cooldown then return end
				last = now
			end
			if rec.mode == "once" and on then return end
			local nextOn, arm = AppleBehave.transition(rec.mode, on, event)
			token += 1
			local mine = token
			local function go()
				apply(nextOn)
				if arm then
					task.delay(rec.hold or (if rec.mode == "hold" then 0.5 else 2), function()
						if token == mine then
							local offOn = AppleBehave.transition(rec.mode, on, "expire")
							apply(offOn)
						end
					end)
				end
			end
			if rec.delay > 0 and nextOn ~= on then task.delay(rec.delay, go) else go() end
		end

		if act.update then table.insert(updaters, act.update) end
		if rec.trigger.on == "auto" then
			if act.kind == "state" then apply(true) else error("`auto` needs a behaviour that is a state; use click, prompt, touch or near") end
		else
			bindTrigger(model, rec, target, onEvent)
		end
	end

	local wired: { [Instance]: boolean } = setmetatable({}, { __mode = "k" }) :: any
	local function wire(model: Instance, module: ModuleScript)
		if wired[module] then return end
		wired[module] = true
		local ok, cfg = pcall(require, module)
		if not ok or type(cfg) ~= "table" or type(cfg.behaviours) ~= "table" then
			warn("AppleBehave: " .. model:GetFullName() .. " has an unreadable " .. AppleBehave.MODULE_NAME)
			return
		end
		for i, raw in cfg.behaviours do
			local rec, why = AppleBehave.check(raw)
			if not rec then
				warn(("AppleBehave: %s behaviour %d: %s"):format(model:GetFullName(), i, tostring(why)))
				continue
			end
			local built, err = pcall(build, model, rec)
			if not built then warn(("AppleBehave: %s behaviour %s: %s"):format(model:GetFullName(), tostring(rec.id), tostring(err))) end
		end
	end

	local function consider(d: Instance)
		if d:IsA("ModuleScript") and d.Name == AppleBehave.MODULE_NAME and d.Parent and (d.Parent:IsA("Model") or d.Parent:IsA("BasePart")) then
			task.defer(wire, d.Parent :: Instance, d)
		end
	end
	for _, d in workspace:GetDescendants() do consider(d) end
	workspace.DescendantAdded:Connect(consider)

	RunService.Heartbeat:Connect(function(dt: number)
		for _, update in updaters do update(dt) end
		applyPoses()
		sinceNear += dt
		if sinceNear >= 0.2 then
			sinceNear = 0
			for _, n in nears do
				local c = n.center()
				if c then
					local inside = playersNear(c, n.reach)
					if inside ~= n.inside then
						n.inside = inside
						n.handler(if inside then "enter" else "leave", nil, nil)
					end
				end
			end
		end
	end)
end

if script and script:IsA("Script") then AppleBehave.start() end
return AppleBehave
