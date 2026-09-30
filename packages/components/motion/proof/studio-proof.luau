
local RS, SSS, SP = game:GetService("ReplicatedStorage"), game:GetService("ServerScriptService"), game:GetService("StarterPlayer")
local folder = RS:FindFirstChild("AppleComponents") or Instance.new("Folder"); folder.Name = "AppleComponents"; folder.Parent = RS
local function put(class, name, parent, src) local old = parent:FindFirstChild(name); if old then old:Destroy() end; local s = Instance.new(class); s.Name = name; s.Source = src; s.Parent = parent; return s end
local mod = put("ModuleScript", "AppleMotion", folder, [=====[--!strict
--[[
	AppleMotion: idle, walk and attack for any rigged creature, made by code. No Animation assets.

	WHY. Every creature Animation id in the owner library is a creator upload (1,186 of 1,207 ids in the
	2026-09-30 survey), private to its creator, so in a new game it fails to load ("Animation failed to
	load") and the creature stands in its bind pose. This module moves the rig's own joints instead.

	HOW. `attach(model)` reads the rig once, in the pose it stands in: every Motor6D and Bone, where each
	joint's pivot is and where the parts it carries hang, all in the ROOT part's space (+X right, +Y up,
	-Z forward). Most library rigs name their joints Part001, Part002 (422 of 617), so a joint's role
	(leg, arm, head, tail, wing, body) comes from that geometry, not its name. `step(dt)` then writes each
	joint's Transform from a small pose made of three rotations about the root's axes and a lift. It must
	run after the Animator (RunService.PreSimulation), so a track that does load cannot fight it.

	The math core (classify, pose) is plain numbers and is unit-tested; the Roblox glue below it is thin.
	Contract: component.json next to this file.
]]

local AppleMotion = {}

AppleMotion.TAG = "AppleCreature"
AppleMotion.ATTACK_SECONDS = 0.45

export type Vec = { x: number, y: number, z: number }
export type JointInput = {
	pivot: Vec, -- the joint's pivot, root space
	center: Vec, -- the centre of the parts this joint carries (its subtree), root space
	share: number, -- the subtree's share of the rig's total volume, 0..1
	parent: number?, -- index of the joint this one hangs from, if any
}
export type Bounds = { height: number, width: number, length: number, minY: number }
export type Role = { role: string, side: number, front: number, phase: number, depth: number }
export type Pose = { rx: number, ry: number, rz: number, lift: number, forward: number }

local function sign(v: number, dead: number): number
	if v > dead then return 1 elseif v < -dead then return -1 else return 0 end
end

--[[ The role of every joint, from where it sits and which way its parts hang. Pure. ]]
function AppleMotion.classify(joints: { JointInput }, bounds: Bounds): { Role }
	local H, W, L = math.max(bounds.height, 0.1), math.max(bounds.width, 0.1), math.max(bounds.length, 0.1)
	local midY = bounds.minY + H * 0.5
	local roles: { Role } = {}
	for i, j in joints do
		local p, c = j.pivot, j.center
		local dx, dy, dz = c.x - p.x, c.y - p.y, c.z - p.z
		local ax, ay, az = math.abs(dx), math.abs(dy), math.abs(dz)
		local role = "body"
		if j.share > 0.35 then
			role = "body" -- carries most of the creature: a waist or root joint, never a limb
		elseif dy < -0.08 * H and ay >= ax and ay >= az then
			if p.y < midY then role = "leg"
			elseif math.abs(p.x) > 0.12 * W then role = "arm"
			else role = "dangle" end
		elseif ax > 0.15 * W and ax >= ay and ax >= az then
			role = "wing"
		elseif az >= ax and az >= ay and (dz > 0.12 * L or (dz > 0 and p.z > 0.25 * L)) then
			role = "tail" -- +Z is behind the creature: long enough, or sitting on its back half
		elseif dy > 0.05 * H and p.y >= midY and j.share < 0.25 then
			role = "head"
		end
		roles[i] = { role = role, side = sign(p.x, 0.05 * W), front = sign(-p.z, 0.05 * L), phase = 0, depth = 0 }
	end
	-- Lower segments (a shin under a thigh, a tail's second piece) follow their parent's role.
	for i, j in joints do
		local parent = j.parent
		local depth = 0
		while parent ~= nil and depth < 8 do
			local pr = roles[parent].role
			if pr == "leg" or pr == "arm" or pr == "tail" or pr == "wing" then
				if roles[i].role ~= "body" or j.share < 0.1 then
					roles[i].role = pr
					roles[i].side = roles[parent].side
					roles[i].front = roles[parent].front
					depth += 1
				end
				break
			end
			parent = joints[parent].parent
		end
		roles[i].depth = depth
	end
	-- Gait phases: a biped alternates left and right; four or more legs move in diagonal pairs.
	for _, r in roles do
		if r.role == "leg" then
			local diagonal = (r.side > 0) ~= (r.front > 0)
			r.phase = if r.front == 0 then (if r.side > 0 then math.pi else 0) elseif diagonal then math.pi else 0
		elseif r.role == "arm" then
			r.phase = if r.side > 0 then 0 else math.pi -- against the leg on the same side
		elseif r.role == "tail" then
			r.phase = r.depth * 0.6
		end
	end
	return roles
end

local function add(a: Pose, b: Pose, k: number): Pose
	return { rx = a.rx + b.rx * k, ry = a.ry + b.ry * k, rz = a.rz + b.rz * k, lift = a.lift + b.lift * k, forward = a.forward + b.forward * k }
end
local ZERO: Pose = table.freeze({ rx = 0, ry = 0, rz = 0, lift = 0, forward = 0 })

--[[
	One joint's pose. `walk` 0..1 blends idle into walking; `attack` is the attack's progress 0..1 (nil = none);
	`legs` says whether the rig has any, because a legless body (a fruit) hops and waddles instead.
	Angles are radians about the root's axes: +rx swings a hanging limb's end forward, -rx leans a body forward.
	lift and forward are fractions of the creature's height. Pure.
]]
function AppleMotion.pose(r: Role, t: number, walk: number, speed: number, attack: number?, legs: boolean): Pose
	local breathe = math.sin(t * 2.2)
	local idle: Pose
	local role = r.role
	local seg = r.depth > 0
	if role == "body" then idle = { rx = 0.02 * breathe, ry = 0, rz = 0, lift = 0.012 * breathe, forward = 0 }
	elseif role == "head" then idle = { rx = 0.06 * math.sin(t * 1.6 + 0.6), ry = 0.08 * math.sin(t * 0.7), rz = 0, lift = 0, forward = 0 }
	elseif role == "arm" or role == "dangle" then idle = { rx = 0.05 * math.sin(t * 1.8 + r.phase), ry = 0, rz = r.side * 0.06 * breathe, lift = 0, forward = 0 }
	elseif role == "wing" then idle = { rx = 0, ry = 0, rz = r.side * 0.15 * math.sin(t * 3), lift = 0, forward = 0 }
	elseif role == "tail" then idle = { rx = 0, ry = 0.35 * math.sin(t * 3 - r.phase), rz = 0, lift = 0, forward = 0 }
	else idle = ZERO end

	local out = idle
	if walk > 0.001 then
		local freq = math.clamp(4 + speed * 0.6, 5, 14)
		local w = t * freq
		local stride: Pose
		if role == "leg" then
			stride = if seg
				then { rx = -0.35 * math.max(0, math.sin(w + r.phase + math.pi / 2)), ry = 0, rz = 0, lift = 0, forward = 0 }
				else { rx = 0.55 * math.sin(w + r.phase), ry = 0, rz = 0, lift = 0, forward = 0 }
		elseif role == "arm" or role == "dangle" then
			stride = { rx = (if seg then -0.2 else -0.45) * math.sin(w + r.phase), ry = 0, rz = 0, lift = 0, forward = 0 }
		elseif role == "body" then
			stride = if legs
				then { rx = -0.05, ry = 0, rz = 0.04 * math.sin(w), lift = 0.035 * math.abs(math.sin(w)), forward = 0 }
				else { rx = -0.06, ry = 0, rz = 0.14 * math.sin(w / 2), lift = 0.14 * math.abs(math.sin(w / 2)), forward = 0 }
		elseif role == "head" then
			stride = { rx = 0.04 * math.sin(2 * w), ry = 0, rz = -0.03 * math.sin(w), lift = 0, forward = 0 }
		elseif role == "tail" then
			stride = { rx = 0, ry = 0.45 * math.sin(w - r.phase), rz = 0, lift = 0, forward = 0 }
		elseif role == "wing" then
			stride = { rx = 0, ry = 0, rz = r.side * 0.3 * math.sin(w * 1.5), lift = 0, forward = 0 }
		else
			stride = ZERO
		end
		out = add(add(idle, idle, -walk), stride, walk)
	end

	if attack ~= nil and attack >= 0 and attack <= 1 then
		local k = math.sin(math.pi * attack)
		local strike: Pose
		if role == "body" then strike = { rx = if legs then -0.35 else -0.5, ry = 0, rz = 0, lift = 0, forward = if legs then 0.1 else 0.2 }
		elseif role == "head" then strike = { rx = -0.3, ry = 0, rz = 0, lift = 0, forward = 0 }
		elseif role == "arm" and not seg then strike = { rx = 1.3, ry = 0, rz = 0, lift = 0, forward = 0 }
		elseif role == "wing" then strike = { rx = 0, ry = 0, rz = r.side * 0.6, lift = 0, forward = 0 }
		else strike = ZERO end
		out = add(out, strike, k)
	end
	return out
end

-- ============================================================================ Roblox glue

type Joint = {
	instance: any, -- Motor6D or Bone
	role: Role,
	axisX: Vector3, axisY: Vector3, axisZ: Vector3, up: Vector3, fwd: Vector3, -- root axes in the joint's own frame
}
export type Rig = {
	model: Model,
	root: BasePart,
	joints: { Joint },
	height: number,
	legs: boolean,
	t: number,
	walk: number,
	speed: number,
	lastPos: Vector3?,
	attackAt: number?,
	step: (self: Rig, dt: number) -> (),
	reset: (self: Rig) -> (),
	attack: (self: Rig) -> (),
}

local function vec(v: Vector3): Vec return { x = v.X, y = v.Y, z = v.Z } end

local function findRoot(model: Model): BasePart?
	if model.PrimaryPart then return model.PrimaryPart end
	local hrp = model:FindFirstChild("HumanoidRootPart")
	if hrp and hrp:IsA("BasePart") then return hrp end
	local best: BasePart? = nil
	local size = -1
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			local v = d.Size.X * d.Size.Y * d.Size.Z
			if v > size then best, size = d, v end
		end
	end
	return best
end

--[[
	Read the rig in the pose it stands in. Returns (rig) or (nil, why). The model's joints must be at rest
	(Transform identity) when this is called, which is how a model arrives from the server.
]]
function AppleMotion.attach(model: Model): (Rig?, string?)
	local root = findRoot(model)
	if not root then return nil, "the model has no parts" end
	local rootCF = root.CFrame

	-- Joints and which part each one carries.
	local motors: { any } = {}
	local carriedBy: { [BasePart]: number } = {}
	local bones: { any } = {}
	for _, d in model:GetDescendants() do
		if d:IsA("Motor6D") and d.Part0 and d.Part1 and d.Part0:IsDescendantOf(model) and d.Part1:IsDescendantOf(model) then
			table.insert(motors, d)
			carriedBy[d.Part1] = #motors
		elseif d:IsA("Bone") then
			table.insert(bones, d)
		end
	end
	if #motors == 0 and #bones == 0 then return nil, "the model has no Motor6D or Bone joints (AppleMotion.prepare adds one)" end

	-- Bounds and volume in root space.
	local minV, maxV = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
	local total = 0
	local parts: { BasePart } = {}
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(parts, d)
			local c = rootCF:PointToObjectSpace(d.Position)
			local half = d.Size / 2
			minV, maxV = minV:Min(c - half), maxV:Max(c + half)
			if d.Transparency < 1 then total += d.Size.X * d.Size.Y * d.Size.Z end
		end
	end
	total = math.max(total, 1e-6)
	local bounds: Bounds = { height = maxV.Y - minV.Y, width = maxV.X - minV.X, length = maxV.Z - minV.Z, minY = minV.Y }

	-- Which motor each part hangs from, walking up the chain, so a subtree is every part under a joint.
	local function topMotorOf(part: BasePart, target: number): boolean
		local seen = 0
		local at: BasePart? = part
		while at and seen < 64 do
			local m = carriedBy[at]
			if m == nil then return false end
			if m == target then return true end
			at = motors[m].Part0
			seen += 1
		end
		return false
	end

	local inputs: { JointInput } = {}
	local frames: { CFrame } = {}
	for i, m in motors do
		local pivot = m.Part0.CFrame * m.C0
		frames[i] = pivot
		local sum, vol = Vector3.zero, 0
		for _, part in parts do
			if topMotorOf(part, i) then
				local v = math.max(part.Size.X * part.Size.Y * part.Size.Z, 1e-6)
				sum += part.Position * v
				vol += v
			end
		end
		local center = if vol > 0 then sum / vol else m.Part1.Position
		inputs[i] = {
			pivot = vec(rootCF:PointToObjectSpace(pivot.Position)),
			center = vec(rootCF:PointToObjectSpace(center)),
			share = vol / total,
			parent = carriedBy[m.Part0],
		}
	end
	local boneIndex: { [any]: number } = {}
	for _, b in bones do
		table.insert(frames, b.TransformedWorldCFrame)
		boneIndex[b] = #frames
	end
	for _, b in bones do
		local i = boneIndex[b]
		local pivot = frames[i]
		local sum, n = Vector3.zero, 0
		for _, d in b:GetDescendants() do
			if d:IsA("Bone") then sum += d.TransformedWorldCFrame.Position; n += 1 end
		end
		local parentBone = if b.Parent and b.Parent:IsA("Bone") then boneIndex[b.Parent] else nil
		local center = if n > 0 then sum / n
			elseif parentBone then pivot.Position + (pivot.Position - frames[parentBone].Position) * 0.5
			else pivot.Position
		inputs[i] = {
			pivot = vec(rootCF:PointToObjectSpace(pivot.Position)),
			center = vec(rootCF:PointToObjectSpace(center)),
			share = n / math.max(#bones, 1),
			parent = parentBone,
		}
	end

	local roles = AppleMotion.classify(inputs, bounds)
	local all: { any } = table.clone(motors)
	for _, b in bones do table.insert(all, b) end
	local joints: { Joint } = {}
	local legs = false
	local R, U, F = rootCF.RightVector, rootCF.UpVector, rootCF.LookVector -- F is forward; the root's +Z axis is -F
	for i, inst in all do
		local f = frames[i]
		if roles[i].role == "leg" then legs = true end
		joints[i] = {
			instance = inst, role = roles[i],
			axisX = f:VectorToObjectSpace(R), axisY = f:VectorToObjectSpace(U), axisZ = f:VectorToObjectSpace(-F),
			up = f:VectorToObjectSpace(U), fwd = f:VectorToObjectSpace(F),
		}
	end

	local rig = {
		model = model, root = root, joints = joints, height = math.max(bounds.height, 0.5), legs = legs,
		t = math.random() * 10, walk = 0, speed = 0, lastPos = nil, attackAt = nil,
	} :: any

	function rig.attack(self: Rig)
		self.attackAt = self.t
	end

	function rig.step(self: Rig, dt: number)
		self.t += dt
		local pos = self.root.Position
		local measured = if self.lastPos and dt > 0 then (pos - self.lastPos).Magnitude / dt else 0
		self.lastPos = pos
		local forced = self.model:GetAttribute("Motion")
		local speed = self.model:GetAttribute("MotionSpeed")
		self.speed += ((if type(speed) == "number" then speed else measured) - self.speed) * math.min(1, dt * 6)
		local moving = if forced == "walk" then true elseif forced == "idle" then false else self.speed > 0.6
		self.walk += ((if moving then 1 else 0) - self.walk) * math.min(1, dt * 8)
		local attack: number? = nil
		if self.attackAt then
			attack = (self.t - self.attackAt) / AppleMotion.ATTACK_SECONDS
			if attack > 1 then self.attackAt = nil; attack = nil end
		end
		for _, j in self.joints do
			local p = AppleMotion.pose(j.role, self.t, self.walk, self.speed, attack, self.legs)
			local cf = CFrame.new((j.up * p.lift + j.fwd * p.forward) * self.height)
				* CFrame.fromAxisAngle(j.axisX, p.rx) * CFrame.fromAxisAngle(j.axisY, p.ry) * CFrame.fromAxisAngle(j.axisZ, p.rz)
			j.instance.Transform = cf
		end
	end

	function rig.reset(self: Rig)
		for _, j in self.joints do pcall(function() j.instance.Transform = CFrame.identity end) end
	end

	return rig :: Rig, nil
end

--[[
	Build-time: make any creature model animatable and keep it together. Runs where the game is built
	(the plugin), never at play time. A model with no joints gets an invisible anchored root at its centre
	and one Motor6D from it to its biggest part; every other part stays welded to that part. Parts other
	than the root are unanchored so the joints can move them, creator Animate scripts are disabled (their
	animations are private), and the model is tagged for the client driver and streamed as one piece.
	Returns what it did, for the build report.
]]
function AppleMotion.prepare(model: Model): { string }
	local did: { string } = {}
	-- Current Roblox avatars join their limbs with AnimationConstraints (physics joints, with BallSocketConstraints
	-- beside them), not Motor6Ds: seen 2026-09-30 on a default R15 body, 15 AnimationConstraints and one Motor6D.
	-- A physics joint is simulated by the part's network owner, so a client-side pose would not show. Each one
	-- becomes the rigid Motor6D with the same attachment frames, which is how every older rig is built.
	local converted = 0
	for _, d in model:GetDescendants() do
		if d:IsA("AnimationConstraint") and d.Attachment0 and d.Attachment1 then
			local p0, p1 = d.Attachment0.Parent, d.Attachment1.Parent
			if p0 and p1 and p0:IsA("BasePart") and p1:IsA("BasePart") and p0:IsDescendantOf(model) and p1:IsDescendantOf(model) then
				local motor = Instance.new("Motor6D")
				motor.Name = d.Name
				motor.Part0, motor.Part1 = p0, p1
				motor.C0, motor.C1 = d.Attachment0.CFrame, d.Attachment1.CFrame
				motor.Parent = p1
				d:Destroy()
				converted += 1
			end
		end
	end
	if converted > 0 then
		for _, d in model:GetDescendants() do
			if d:IsA("BallSocketConstraint") then d:Destroy() end
		end
		table.insert(did, ("turned %d physics joints into animatable joints"):format(converted))
	end
	local hasJoint = false
	for _, d in model:GetDescendants() do
		if d:IsA("Motor6D") or d:IsA("Bone") then hasJoint = true; break end
	end
	local root = findRoot(model)
	if not hasJoint and root then
		local cf, size = model:GetBoundingBox()
		local body = root
		local anchor = Instance.new("Part")
		anchor.Name = "AppleRoot"
		anchor.Size = Vector3.new(1, 1, 1)
		anchor.CFrame = CFrame.new(cf.Position.X, cf.Position.Y - size.Y / 2 + 0.5, cf.Position.Z) * body.CFrame.Rotation
		anchor.Transparency = 1
		anchor.CanCollide = false
		anchor.CanQuery = false
		anchor.Anchored = true
		anchor.Parent = model
		for _, d in model:GetDescendants() do
			if (d:IsA("Weld") or d:IsA("WeldConstraint")) and (d.Part0 == nil or d.Part1 == nil) then d:Destroy() end
		end
		for _, d in model:GetDescendants() do
			if d:IsA("BasePart") and d ~= anchor and d ~= body then
				local weld = Instance.new("WeldConstraint")
				weld.Part0, weld.Part1 = body, d
				weld.Parent = d
			end
		end
		local motor = Instance.new("Motor6D")
		motor.Name = "AppleBody"
		motor.Part0, motor.Part1 = anchor, body
		motor.C0 = anchor.CFrame:ToObjectSpace(body.CFrame)
		motor.Parent = anchor
		model.PrimaryPart = anchor
		root = anchor
		table.insert(did, "added an invisible root and one joint to the body")
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") and d ~= root and d.Anchored then d.Anchored = false end
		if d:IsA("Script") or d:IsA("LocalScript") then
			if d.Name == "Animate" and d.Enabled then d.Enabled = false; table.insert(did, "turned off the creator's Animate script (its animations are private)") end
		end
	end
	if root and not root.Anchored and not model:FindFirstChildWhichIsA("Humanoid", true) then
		root.Anchored = true
	end
	pcall(function() (model :: any).ModelStreamingMode = Enum.ModelStreamingMode.Atomic end)
	game:GetService("CollectionService"):AddTag(model, AppleMotion.TAG)
	table.insert(did, "tagged " .. AppleMotion.TAG)
	return did
end

return AppleMotion
]=====])
put("LocalScript", "AppleMotionClient", SP.StarterPlayerScripts, [=====[--!strict
-- AppleMotion's driver: a LocalScript in StarterPlayerScripts. It animates every model tagged AppleCreature
-- near the camera, after the Animator each frame, so creatures walk, idle and attack with no Animation assets.
-- A server script asks for an attack by setting the model's MotionAttack attribute to a new number
-- (workspace:GetServerTimeNow() works), and may force a mode with Motion = "walk" | "idle".
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local AppleMotion = require(ReplicatedStorage:WaitForChild("AppleComponents"):WaitForChild("AppleMotion"))

local FAR = 300 -- studs; creatures further from the camera are not animated this frame
local rigs: { [Model]: any } = {}
local failed: { [Model]: boolean } = {}
local listeners: { [Model]: RBXScriptConnection } = {}

local function add(model: Instance)
	if not model:IsA("Model") or rigs[model] or failed[model] then return end
	task.defer(function()
		if model.Parent == nil then return end
		local rig = AppleMotion.attach(model)
		if not rig then failed[model] = true return end
		rigs[model] = rig
		listeners[model] = model:GetAttributeChangedSignal("MotionAttack"):Connect(function() rig:attack() end)
	end)
end

local function remove(model: Instance)
	if not model:IsA("Model") then return end
	local rig = rigs[model]
	if rig then rig:reset() end
	rigs[model] = nil
	failed[model] = nil
	if listeners[model] then listeners[model]:Disconnect(); listeners[model] = nil end
end

CollectionService:GetInstanceAddedSignal(AppleMotion.TAG):Connect(add)
CollectionService:GetInstanceRemovedSignal(AppleMotion.TAG):Connect(remove)
for _, model in CollectionService:GetTagged(AppleMotion.TAG) do add(model) end

RunService.PreSimulation:Connect(function(dt: number)
	local camera = workspace.CurrentCamera
	local eye = if camera then camera.CFrame.Position else Vector3.zero
	for model, rig in rigs do
		if model.Parent == nil or rig.root.Parent == nil then
			remove(model)
		elseif (rig.root.Position - eye).Magnitude <= FAR then
			rig:step(dt)
		end
	end
end)
]=====])
put("Script", "MotionProofWalk", SSS, [=====[
-- Proof only: walks each creature along X for 3 s, idles 2 s, attacks every 4 s.
local CollectionService = game:GetService("CollectionService")
local t0 = os.clock()
local homes = {}
for _, m in CollectionService:GetTagged("AppleCreature") do homes[m] = m:GetPivot() end
local lastAttack = 0
game:GetService("RunService").Heartbeat:Connect(function()
	local t = os.clock() - t0
	local cycle = t % 5
	for m, home in homes do
		if m.Parent then
			local x = if cycle < 3 then math.sin(cycle / 3 * math.pi) * 10 else 0
			local facing = if cycle < 1.5 then 0 else math.pi
			m:PivotTo(home * CFrame.new(x, 0, 0) * CFrame.Angles(0, (if cycle < 3 then facing - math.pi / 2 else 0), 0))
		end
	end
	if t - lastAttack > 4 then
		lastAttack = t
		for m in homes do m:SetAttribute("MotionAttack", t) end
	end
end)
]=====])
put("LocalScript", "MotionProofProbe", SP.StarterPlayerScripts, [=====[
-- Proof only: samples every AppleCreature joint's Transform during play and prints how much it moved.
local CollectionService = game:GetService("CollectionService")
task.wait(3)
local seen = {}
for i = 1, 60 do
	for _, m in CollectionService:GetTagged("AppleCreature") do
		for _, d in m:GetDescendants() do
			if d:IsA("Motor6D") or d:IsA("Bone") then
				local rx, ry, rz = d.Transform:ToEulerAnglesXYZ()
				local a = math.abs(rx) + math.abs(ry) + math.abs(rz) + d.Transform.Position.Magnitude
				local key = m.Name .. "/" .. d.Name
				local s = seen[key] or { lo = math.huge, hi = -math.huge, model = m.Name }
				s.lo, s.hi = math.min(s.lo, a), math.max(s.hi, a)
				seen[key] = s
			end
		end
	end
	task.wait(0.1)
end
local per = {}
for key, s in seen do
	local p = per[s.model] or { joints = 0, moving = 0, max = 0 }
	p.joints += 1
	if s.hi - s.lo > 0.02 then p.moving += 1 end
	p.max = math.max(p.max, s.hi - s.lo)
	per[s.model] = p
end
for model, p in per do
	print(("APPLEMOTION PROBE %s: %d of %d joints moved, largest swing %.2f"):format(model, p.moving, p.joints, p.max))
end
]=====])
local Motion = require(mod)
local zoo = workspace:FindFirstChild("MotionProof"); if zoo then zoo:Destroy() end
zoo = Instance.new("Folder"); zoo.Name = "MotionProof"; zoo.Parent = workspace
local function part(name, size, cf, color, parent, shape)
	local p = Instance.new("Part"); p.Name = name; p.Size = size; p.CFrame = cf; p.Color = color; p.Anchored = false; p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth
	if shape then p.Shape = shape end; p.Parent = parent; return p
end
local function motor(name, p0, p1, pivotWorld)
	local m = Instance.new("Motor6D"); m.Name = name; m.Part0 = p0; m.Part1 = p1
	m.C0 = p0.CFrame:ToObjectSpace(pivotWorld); m.C1 = p1.CFrame:ToObjectSpace(pivotWorld); m.Parent = p0; return m
end
-- 1. An R15 body from a default description.
local ok, biped = pcall(function() return game:GetService("Players"):CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15) end)
if ok and biped then
	biped.Name = "Biped"; biped.Parent = zoo; biped:PivotTo(CFrame.new(-8, 3, -18)); biped.HumanoidRootPart.Anchored = true
else warn("APPLEMOTION could not build the R15 body: " .. tostring(biped)) end
-- 2. A quadruped with generic joint names, like most library creatures.
local quad = Instance.new("Model"); quad.Name = "Quadruped"; quad.Parent = zoo
local base = CFrame.new(4, 0, -18)
local root = part("Root", Vector3.new(1, 1, 1), base * CFrame.new(0, 2.2, 0), Color3.new(1, 1, 1), quad); root.Transparency = 1; root.Anchored = true; root.CanCollide = false
local body = part("Part001", Vector3.new(2.2, 1.6, 4), base * CFrame.new(0, 2.2, 0), Color3.fromRGB(170, 110, 60), quad)
local head = part("Part002", Vector3.new(1.4, 1.4, 1.4), base * CFrame.new(0, 3.0, -2.5), Color3.fromRGB(190, 130, 80), quad)
local tail = part("Part003", Vector3.new(0.4, 0.4, 1.6), base * CFrame.new(0, 2.6, 2.7), Color3.fromRGB(120, 80, 40), quad)
quad.PrimaryPart = root
motor("Part001", root, body, base * CFrame.new(0, 2.2, 0))
motor("Part002", body, head, base * CFrame.new(0, 2.7, -1.9))
motor("Part003", body, tail, base * CFrame.new(0, 2.6, 1.9))
local n = 4
for _, c in { { -0.7, -1.4 }, { 0.7, -1.4 }, { -0.7, 1.4 }, { 0.7, 1.4 } } do
	local leg = part(("Part%03d"):format(n), Vector3.new(0.5, 1.6, 0.5), base * CFrame.new(c[1], 0.8, c[2]), Color3.fromRGB(120, 80, 40), quad)
	motor(("Part%03d"):format(n), body, leg, base * CFrame.new(c[1], 1.5, c[2])); n += 1
end
-- 3. A tomato with no joints at all: prepare gives it a root and one joint.
local tomato = Instance.new("Model"); tomato.Name = "Tomato"; tomato.Parent = zoo
local fruit = part("Fruit", Vector3.new(3, 3, 3), CFrame.new(12, 1.6, -18), Color3.fromRGB(220, 40, 30), tomato, Enum.PartType.Ball); fruit.Anchored = true
local leaf = part("Leaf", Vector3.new(1.4, 0.3, 1.4), CFrame.new(12, 3.2, -18), Color3.fromRGB(40, 160, 60), tomato); leaf.Anchored = true
for _, m in zoo:GetChildren() do print("APPLEMOTION prepare " .. m.Name .. ": " .. table.concat(Motion.prepare(m), "; ")) end
print("APPLEMOTION proof place ready")
