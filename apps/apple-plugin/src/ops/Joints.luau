--!strict
--[[
	Joints, after RIGEDIT LITE (the joint editor plugin the owner supplied, 2026-10-01; credit and the list of changes are in
	apps/apple-plugin/THIRD_PARTY_NOTICES.md). RigEdit makes a model animatable the way Roblox builders do by hand: every
	part is joined to one root part by a Motor6D (or a Weld for parts that never move) that keeps it exactly where it is,
	and a joint's pivot (the hinge) can then be moved without moving the part, so a door swings on its edge, a key dips
	from its base and a lid opens from its back. Apple's agent does the same through these ops; animation is then played
	from code (packages/components/animate), so nothing is uploaded.

	rig_model { root = path, parts? = { path | { part = path, to = path } }, joint? = "motor"|"weld" }
	  Joins each part (default: every other BasePart in the root's Model) to the root, or to `to` for a chain built
	  from the root outwards (base -> barrel -> cap, body -> arm -> hand), as builders do with RigEdit. The root stays
	  anchored and becomes the Model's PrimaryPart; joined parts are unanchored; each joint is named after its part
	  (Part1) and parented to the part it hangs from (Part0); C0 = Part1's offset from Part0, C1 = identity
	  (RigEdit's CreateJoint/CreateWeld). A joint that already joins the same pair is reused.
	set_joint_pivot { joint = path, at = { x, y, z }, turn? = { x, y, z } }
	  Moves the joint's pivot to the world point `at` without moving its part (RigEdit's move handles), and turns the
	  pivot's axes by `turn` degrees (RigEdit's rotate handles), so the joint's rotations hinge there.
	reset_joints { paths = { path } }
	  Puts each Motor6D back to rest: C0 = Part0 to Part1 as they stand now, C1 = identity (RigEdit's Reset).
]]
local Joints = {}

--[[ Pure: RigEdit's pivot move. Given the joint's C0, C1, Part0's CFrame and a world point, the new C0 and C1 that put
	the pivot on that point and leave Part1 exactly where it was. ]]
function Joints.movePivot(part0: CFrame, c0: CFrame, c1: CFrame, at: Vector3): (CFrame, CFrame)
	local orig = part0 * c0
	local desired = orig.Rotation + at
	local newC0 = part0:ToObjectSpace(desired)
	local diff = c0:ToObjectSpace(newC0)
	return newC0, c1 * diff
end

--[[ Pure: RigEdit's pivot turn: both sides turn together, so the part stays put and only the joint's axes change. ]]
function Joints.turnPivot(c0: CFrame, c1: CFrame, degrees: Vector3): (CFrame, CFrame)
	local rot = CFrame.Angles(math.rad(degrees.X), math.rad(degrees.Y), math.rad(degrees.Z))
	return c0 * rot, c1 * rot
end

function Joints.build(api)
	local function part(self: any, path: any, label: string): (BasePart?, string?)
		local target = api.resolvePath(self.game, self.options.services, path, false, self)
		if not target then return nil, "nothing at " .. tostring(path) end
		if not target:IsA("BasePart") then return nil, label .. " must be a part" end
		if not api.writableTarget(self.game, target) then return nil, "that place is not one Apple edits" end
		return target :: BasePart, nil
	end

	local function handleRig(self: any, op: any): (any?, string?, string?)
		local root, rootErr = part(self, op.root, "root")
		if not root then return nil, "invalid", rootErr end
		local kind = op.joint or "motor"
		if kind ~= "motor" and kind ~= "weld" then return nil, "invalid", "joint must be motor or weld" end
		local parts: { BasePart } = {}
		local parentOf: { [BasePart]: BasePart } = {}
		if op.parts ~= nil then
			if type(op.parts) ~= "table" or #op.parts == 0 or #op.parts > 500 then return nil, "invalid", "parts must list 1 to 500 parts" end
			for _, entry in op.parts do
				local path, to = entry, nil
				if type(entry) == "table" then path, to = entry.part, entry.to end
				local p, err = part(self, path, "each of parts")
				if not p then return nil, "invalid", err end
				if p == root then continue end
				table.insert(parts, p)
				if to ~= nil then
					local hang, hangErr = part(self, to, "to")
					if not hang then return nil, "invalid", hangErr end
					if hang == p then return nil, "invalid", "a part cannot hang from itself" end
					parentOf[p] = hang
				end
			end
		else
			local model = root:FindFirstAncestorWhichIsA("Model")
			if not model then return nil, "invalid", "the root is not in a Model; list the parts" end
			for _, d in model:GetDescendants() do
				if d:IsA("BasePart") and d ~= root then table.insert(parts, d) end
			end
			if #parts == 0 then return nil, "invalid", "the model has no other parts to join" end
			if #parts > 500 then return nil, "invalid", "more than 500 parts; list the ones that move" end
		end
		local model = root:FindFirstAncestorWhichIsA("Model")
		if model and model.PrimaryPart == nil then model.PrimaryPart = root end
		local made, reused = {}, 0
		root.Anchored = true
		for _, p in parts do
			local base = parentOf[p] or root
			local existing: JointInstance? = nil
			for _, j in base:GetChildren() do
				if (j:IsA("Motor6D") or j:IsA("Weld")) and (j :: any).Part0 == base and (j :: any).Part1 == p then existing = j :: any end
			end
			p.Anchored = false
			if existing and existing:IsA(if kind == "motor" then "Motor6D" else "Weld") then
				reused += 1
				table.insert(made, api.fullPath(self.game, existing))
				continue
			end
			if existing then existing:Destroy() end
			local joint = Instance.new(if kind == "motor" then "Motor6D" else "Weld") :: any
			joint.Name = p.Name
			joint.Part0 = base
			joint.Part1 = p
			joint.C0 = base.CFrame:ToObjectSpace(p.CFrame)
			joint.C1 = CFrame.new()
			joint.Parent = base
			table.insert(made, api.fullPath(self.game, joint))
		end
		return { root = api.fullPath(self.game, root), joints = made, reused = reused }
	end

	local function jointAt(self: any, path: any): (any?, string?)
		local j = api.resolvePath(self.game, self.options.services, path, false, self)
		if not j then return nil, "nothing at " .. tostring(path) end
		if not (j:IsA("Motor6D") or j:IsA("Weld")) then return nil, "that is not a Motor6D or Weld" end
		if not api.writableTarget(self.game, j) then return nil, "that place is not one Apple edits" end
		if not (j :: any).Part0 or not (j :: any).Part1 then return nil, "the joint has no Part0 or Part1" end
		return j, nil
	end

	local function vector(v: any, label: string): (Vector3?, string?)
		if type(v) ~= "table" or #v ~= 3 then return nil, label .. " must be [x, y, z]" end
		for i = 1, 3 do if not api.finite(v[i]) or math.abs(v[i]) > api.limits.translation then return nil, label .. " is out of range" end end
		return Vector3.new(v[1], v[2], v[3]), nil
	end

	local function handlePivot(self: any, op: any): (any?, string?, string?)
		local j, err = jointAt(self, op.joint)
		if not j then return nil, "invalid", err end
		if op.at ~= nil then
			local at, atErr = vector(op.at, "at")
			if not at then return nil, "invalid", atErr end
			j.C0, j.C1 = Joints.movePivot(j.Part0.CFrame, j.C0, j.C1, at)
		end
		if op.turn ~= nil then
			local turn, turnErr = vector(op.turn, "turn")
			if not turn then return nil, "invalid", turnErr end
			j.C0, j.C1 = Joints.turnPivot(j.C0, j.C1, turn)
		end
		local pivot = (j.Part0.CFrame * j.C0).Position
		return { joint = api.fullPath(self.game, j), pivot = { pivot.X, pivot.Y, pivot.Z } }
	end

	local function handleReset(self: any, op: any): (any?, string?, string?)
		if type(op.paths) ~= "table" or #op.paths == 0 or #op.paths > 500 then return nil, "invalid", "paths must list 1 to 500 joints" end
		local done = 0
		for _, path in op.paths do
			local j, err = jointAt(self, path)
			if not j then return nil, "invalid", err end
			if not j:IsA("Motor6D") then return nil, "invalid", "only Motor6D joints are reset" end
			j.C0 = j.Part0.CFrame:ToObjectSpace(j.Part1.CFrame)
			j.C1 = CFrame.new()
			done += 1
		end
		return { reset = done }
	end

	return {
		handlers = { rig_model = handleRig, set_joint_pivot = handlePivot, reset_joints = handleReset },
		mutating = { rig_model = true, set_joint_pivot = true, reset_joints = true },
		deleteOnlyClasses = { Motor6D = true, Weld = true },
	}
end

return Joints
