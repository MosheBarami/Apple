--!strict
--[[
	AppleAnimate: plays animations on rigged models from code, so nothing is uploaded and the game runs without Apple.
	A model is rigged the RigEdit way (every moving part joined to an anchored root by a Motor6D named after the part,
	the joint's pivot on the hinge: apps/apple-plugin/src/ops/Joints.luau). Its animations are a ModuleScript named
	AppleAnimations inside the model:

	  return {
	    spin  = { play = "loop", length = 4, keys = { { t = 0, Fan = { rot = {0,0,0} } }, { t = 4, Fan = { rot = {0,360,0} } } } },
	    press = { play = "click", length = 0.25, sound = "rbxassetid://...", keys = {
	              { t = 0, Key = { move = {0,0,0} } }, { t = 0.08, Key = { move = {0,-0.3,0} }, ease = "Quad" },
	              { t = 0.25, Key = { move = {0,0,0} }, ease = "Back" } } },
	  }

	Each key gives, per joint name, `rot` (degrees about the pivot's axes) and/or `move` (studs along them), and the
	`ease` (Linear, Sine, Quad, Back, Bounce, Elastic) of the stretch that ends at it. `play` is "loop", "click"
	(a ClickDetector), "prompt" (a ProximityPrompt; `prompt` gives its text), "touch", "once" (at start), or "key"
	(the player presses the real key `key`, an Enum.KeyCode name such as "A" or "Space"; AppleAnimateClient
	sends it; the key can also be clicked, or stepped on, which presses it with the player riding it down; a model with an
	Owner attribute (its own or an ancestor's, a UserId) answers real keys only from that player). Every clip that plays is announced to every client on ReplicatedStorage.AppleAnimatePlayed (model,
	clip name), so a screen can count presses or say something; a clip a player set off is also announced on the
	server as ServerStorage.AppleAnimatePressed (player, model, clip), so a game can pay for presses. A clip
	whose name starts with a joint's part name ("Key_A.press") plays from that part only, so 60 keys share one rig.
	Joints move by their C0 (it replicates), offset from where they rest.
	The model is found by its child AppleAnimations; anything added later is found too.
]]
local AppleAnimate = {}

export type Pose = { rot: { number }?, move: { number }? }

--[[ Pure: the eased share of a stretch done at u (0..1). ]]
function AppleAnimate.ease(style: string?, u: number): number
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

--[[ Pure: one joint's pose (rot and move as numbers) at time t of a clip, from the keys that name it. Before the first
	key and after the last, the nearest key holds. Missing fields are zero. ]]
function AppleAnimate.sample(keys: { any }, joint: string, t: number): ({ number }, { number })
	local before, after = nil, nil
	for _, k in keys do
		if k[joint] ~= nil then
			if k.t <= t and (before == nil or k.t >= before.t) then before = k end
			if k.t >= t and (after == nil or k.t < after.t) then after = k end
		end
	end
	local function parts(k: any): ({ number }, { number })
		local p = k and k[joint] or {}
		return p.rot or { 0, 0, 0 }, p.move or { 0, 0, 0 }
	end
	if not before and not after then return { 0, 0, 0 }, { 0, 0, 0 } end
	if not before then return parts(after) end
	if not after or after.t == before.t then return parts(before) end
	local u = AppleAnimate.ease(after.ease, (t - before.t) / (after.t - before.t))
	local r0, m0 = parts(before)
	local r1, m1 = parts(after)
	local r, m = {}, {}
	for i = 1, 3 do
		r[i] = r0[i] + (r1[i] - r0[i]) * u
		m[i] = m0[i] + (m1[i] - m0[i]) * u
	end
	return r, m
end

--[[ Pure: the joints a clip moves. ]]
function AppleAnimate.jointsOf(keys: { any }): { string }
	local seen, out = {}, {}
	for _, k in keys do
		for name, v in k do
			if name ~= "t" and name ~= "ease" and type(v) == "table" and not seen[name] then seen[name] = true; table.insert(out, name) end
		end
	end
	table.sort(out)
	return out
end

--[[ Pure: whether a player may set off something owned by `owner` (a UserId; nil means nobody owns it, so anyone may). ]]
--[[ Pure: whether one more press in the last second still pays, given the times (os.clock) of the presses that paid.
     Drops times older than a second from `recent`. A fast typist is about 10 a second; standing on a row of keys shrunk
     onto a plot tile touched dozens of keys at once and paid each (the owner's session reached 673K coins). ]]
AppleAnimate.PAID_PER_SECOND = 12
function AppleAnimate.paysPress(recent: { number }, now: number, cap: number?): boolean
	local limit = cap or AppleAnimate.PAID_PER_SECOND
	for i = #recent, 1, -1 do
		if now - recent[i] >= 1 then table.remove(recent, i) end
	end
	if #recent >= limit then return false end
	table.insert(recent, now)
	return true
end

function AppleAnimate.mayPress(owner: any, userId: number): boolean
	return owner == nil or owner == userId
end

--[[ The Owner attribute of a model, or of the nearest ancestor that has one (a plot's machine is owned by its player). ]]
function AppleAnimate.ownerOf(inst: Instance?): any
	local at = inst
	while at and at ~= workspace do
		local owner = at:GetAttribute("Owner")
		if owner ~= nil then return owner end
		at = at.Parent
	end
	return nil
end

function AppleAnimate.start()
	local RunService = game:GetService("RunService")
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local function remote(name: string): RemoteEvent
		local r = ReplicatedStorage:FindFirstChild(name) or Instance.new("RemoteEvent")
		r.Name = name
		r.Parent = ReplicatedStorage
		return r :: RemoteEvent
	end
	local played = remote("AppleAnimatePlayed")
	-- Server side: (player, model, clip) whenever a player sets a clip off, so a game can pay for presses (AppleUpgrades).
	local ServerStorage = game:GetService("ServerStorage")
	local pressed = ServerStorage:FindFirstChild("AppleAnimatePressed") or Instance.new("BindableEvent")
	pressed.Name = "AppleAnimatePressed"
	pressed.Parent = ServerStorage
	local keyRemote = remote("AppleAnimateKey")
	local byKey: { [string]: { { model: Model, clip: any, name: string } } } = {}
	local lastKey: { [Player]: { [string]: number } } = {}
	local paid: { [Player]: { number } } = {}
	keyRemote.OnServerEvent:Connect(function(player: Player, key: any)
		if type(key) ~= "string" or #key > 20 then return end
		-- One key held down or flooded is not 30 presses a second; different keys pressed together all count.
		local now = os.clock()
		local mine = lastKey[player] or {}
		lastKey[player] = mine
		if now - (mine[key] or 0) < 0.03 then return end
		mine[key] = now
		for _, entry in byKey[key] or {} do
			-- A model somebody owns (a machine on their plot) answers only to its owner's keys.
			if entry.model.Parent and AppleAnimate.mayPress(AppleAnimate.ownerOf(entry.model), player.UserId) then
				entry.clip._play(player)
			end
		end
	end)
	game:GetService("Players").PlayerRemoving:Connect(function(p) lastKey[p] = nil; paid[p] = nil end)
	local active: { { model: Model, joints: { [string]: Motor6D }, rest: { [Motor6D]: CFrame }, clip: any, t: number, loop: boolean } } = {}

	local function jointsIn(model: Model): ({ [string]: Motor6D }, { [Motor6D]: CFrame })
		local byName, rest = {}, {}
		for _, d in model:GetDescendants() do
			if d:IsA("Motor6D") then byName[d.Name] = d; rest[d] = d.C0 end
		end
		return byName, rest
	end

	local function play(model: Model, joints: { [string]: Motor6D }, rest: { [Motor6D]: CFrame }, clip: any, loop: boolean, player: Player?)
		-- Who pressed it rides along, so that player's screen can float a "+N" over the key (the owner's reference).
		if clip._name then played:FireAllClients(model, clip._name, player) end
		-- The clip always plays; only the presses that pay are capped per player.
		if player and clip._name then
			local recent = paid[player] or {}
			paid[player] = recent
			if AppleAnimate.paysPress(recent, os.clock()) then (pressed :: BindableEvent):Fire(player, model, clip._name) end
		end
		for _, a in active do
			if a.model == model and a.clip == clip then a.t = 0; return end -- pressing again restarts it
		end
		table.insert(active, { model = model, joints = joints, rest = rest, clip = clip, t = 0, loop = loop })
		if type(clip.sound) == "string" and clip.sound ~= "" then
			local root = model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart", true)
			if root then
				local s = Instance.new("Sound")
				s.SoundId = clip.sound
				s.Volume = clip.volume or 0.6
				s.PlaybackSpeed = (clip.pitch or 1) * (1 + (math.random() - 0.5) * 0.08) -- a little variety, like real keys
				s.Parent = root
				s:Play()
				s.Ended:Connect(function() s:Destroy() end)
			end
		end
	end

	-- Stepped on (owner, 2026-10-01: "the keys are supposed to go down with the players on top of them"): a player
	-- landing on a part pressed by a click or a key presses it too, and rides it down. Once per landing.
	local function stepOn(target: Instance, model: Model, joints: any, rest: any, clip: any)
		if not target:IsA("BasePart") then return end
		local onIt: { [Player]: number } = {}
		target.Touched:Connect(function(hit)
			local who = hit.Parent and game:GetService("Players"):GetPlayerFromCharacter(hit.Parent)
			if not who or os.clock() - (onIt[who] or 0) < (clip.length + 0.15) then return end
			onIt[who] = os.clock()
			play(model, joints, rest, clip, false, who)
		end)
	end

	local function wire(model: Model, module: ModuleScript)
		local ok, clips = pcall(require, module)
		if not ok or type(clips) ~= "table" then warn("AppleAnimate: " .. model:GetFullName() .. " has unreadable animations"); return end
		local joints, rest = jointsIn(model)
		for name, clip in clips do
			if type(clip) ~= "table" or type(clip.keys) ~= "table" then continue end
			clip.length = clip.length or 1
			clip._name = name
			-- "Key_A.press" plays only from the part Key_A; "press" from the whole model.
			local partName = string.match(name, "^(.-)%.")
			local target: Instance = model
			if partName then target = model:FindFirstChild(partName, true) or model end
			local how = clip.play or "once"
			if how == "loop" or how == "once" then
				play(model, joints, rest, clip, how == "loop")
			elseif how == "click" then
				local cd = target:FindFirstChildWhichIsA("ClickDetector") or Instance.new("ClickDetector")
				-- 120, not Roblox's 32: an object built in front of the spawn sits ~34 studs away (test 2, a long thin object, 2026-10-01).
				cd.MaxActivationDistance = clip.reach or 120
				cd.Parent = if target:IsA("BasePart") then target else (model.PrimaryPart or target)
				cd.MouseClick:Connect(function(player) play(model, joints, rest, clip, false, player) end)
				if partName then stepOn(target, model, joints, rest, clip) end -- one part's own click clip: a key, a button
			elseif how == "prompt" then
				local pp = Instance.new("ProximityPrompt")
				pp.ActionText = clip.prompt or "Use"
				pp.ObjectText = model.Name
				pp.MaxActivationDistance = clip.reach or 10
				pp.Parent = if target:IsA("BasePart") then target else (model.PrimaryPart or target)
				pp.Triggered:Connect(function(player) play(model, joints, rest, clip, false, player) end)
			elseif how == "key" then
				if type(clip.key) == "string" then
					clip._play = function(player: Player?) play(model, joints, rest, clip, false, player) end
					byKey[clip.key] = byKey[clip.key] or {}
					table.insert(byKey[clip.key], { model = model, clip = clip, name = name })
				end
				-- A key clip can also be clicked, so it works on a phone too.
				local cd = target:FindFirstChildWhichIsA("ClickDetector") or Instance.new("ClickDetector")
				cd.MaxActivationDistance = clip.reach or 120
				cd.Parent = if target:IsA("BasePart") then target else (model.PrimaryPart or target)
				cd.MouseClick:Connect(function(player) play(model, joints, rest, clip, false, player) end)
				stepOn(target, model, joints, rest, clip)
			elseif how == "touch" then
				local part = if target:IsA("BasePart") then target else model.PrimaryPart
				local last = 0
				if part then
					part.Touched:Connect(function(hit)
						if hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid") and os.clock() - last > (clip.length + 0.1) then
							last = os.clock()
							play(model, joints, rest, clip, false, game:GetService("Players"):GetPlayerFromCharacter(hit.Parent))
						end
					end)
				end
			end
		end
	end

	local function consider(d: Instance)
		if d:IsA("ModuleScript") and d.Name == "AppleAnimations" and d.Parent and d.Parent:IsA("Model") then
			task.defer(wire, d.Parent :: Model, d)
		end
	end
	for _, d in workspace:GetDescendants() do consider(d) end
	workspace.DescendantAdded:Connect(consider)

	RunService.Heartbeat:Connect(function(dt)
		for i = #active, 1, -1 do
			local a = active[i]
			if not a.model.Parent then table.remove(active, i); continue end
			a.t += dt
			local finished = a.t >= a.clip.length
			if finished and a.loop then a.t %= a.clip.length; finished = false end
			local t = math.min(a.t, a.clip.length)
			for _, name in AppleAnimate.jointsOf(a.clip.keys) do
				local j = a.joints[name]
				if j and a.rest[j] then
					local r, m = AppleAnimate.sample(a.clip.keys, name, t)
					j.C0 = a.rest[j] * CFrame.new(m[1], m[2], m[3]) * CFrame.Angles(math.rad(r[1]), math.rad(r[2]), math.rad(r[3]))
				end
			end
			if finished then table.remove(active, i) end
		end
	end)
end

if script and script:IsA("Script") then AppleAnimate.start() end
return AppleAnimate
