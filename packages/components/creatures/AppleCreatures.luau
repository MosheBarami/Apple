--!strict
--[[
	AppleCreatures: new creatures made by combining library pieces, so a twist like "the enemies are vegetables"
	is really built. A rigged body (Motor6D limbs) gets a costume (a vegetable, a fruit, any prop) in place of its
	torso and head: the costume is scaled to that space, stood upright if asked, welded to the torso, and the torso
	and head are hidden (their joints stay, so the limbs still walk). The limbs can take the costume's colour.
	Built on the server when the game starts (AppleBoot), from AppleGameConfig.creatures:
	  { <name> = { body = "ServerStorage.AppleParts.MythicNPC", costume = "ServerStorage.AppleParts.Carrot",
	               into = "ServerStorage.AppleEnemies", upright = true, limbColor = "#3da33a", scale = 1.15,
	               face = true | false | "<texture id>", stretch = 2.4 } }
]]
local AppleCreatures = {}

export type Box = { sx: number, sy: number, sz: number }
--[[ Pure: the uniform scale that makes a costume of size `costume` fill a space of size `space`, `extra` times
	bigger (a vegetable a bit wider than a torso reads as a body). With `upright` the costume's longest side is
	measured as its height. ]]
function AppleCreatures.fit(costume: Box, space: Box, upright: boolean, extra: number): number
	local cx, cy, cz = costume.sx, costume.sy, costume.sz
	if upright then
		local long = math.max(cx, cy, cz)
		local others = { cx, cy, cz }
		table.sort(others)
		cx, cy, cz = others[2], long, others[1]
	end
	local byHeight = space.sy / math.max(cy, 1e-3)
	local byWidth = math.max(space.sx, space.sz) * 1.6 / math.max(cx, cz, 1e-3)
	return math.min(byHeight, byWidth) * extra
end

--[[ Pure: the rotation (in 90-degree turns about Z then X) that stands a box's longest side up. ]]
function AppleCreatures.uprightTurns(costume: Box): (number, number)
	if costume.sy >= costume.sx and costume.sy >= costume.sz then return 0, 0 end
	if costume.sx >= costume.sz then return 1, 0 end -- lying along X: turn a quarter about Z
	return 0, 1 -- lying along Z: turn a quarter about X
end

local function resolve(path: string): Instance?
	local at: Instance? = game
	for part in string.gmatch(path, "[^%.]+") do at = at and at:FindFirstChild(part) end
	return at
end

local function asModel(inst: Instance): Model
	if inst:IsA("Model") then return inst end
	if inst:IsA("Tool") then
		local m = Instance.new("Model")
		m.Name = inst.Name
		for _, c in inst:GetChildren() do c.Parent = m end
		inst:Destroy()
		return m
	end
	local m = Instance.new("Model")
	m.Name = inst.Name
	inst.Parent = m
	if inst:IsA("BasePart") then m.PrimaryPart = inst end
	return m
end

-- The body's torso (the biggest visible part a joint hangs off the root) and head (the highest visible part joined to it).
local function torsoAndHead(body: Model): (BasePart?, BasePart?)
	local root = body.PrimaryPart or body:FindFirstChild("HumanoidRootPart")
	local torso: BasePart? = nil
	local best = -1
	for _, m in body:GetDescendants() do
		if m:IsA("Motor6D") and m.Part0 == root and m.Part1 and m.Part1.Transparency < 1 then
			local v = m.Part1.Size.X * m.Part1.Size.Y * m.Part1.Size.Z
			if v > best then torso, best = m.Part1, v end
		end
	end
	if not torso then
		for _, p in body:GetDescendants() do
			if p:IsA("BasePart") and p ~= root and p.Transparency < 1 then
				local v = p.Size.X * p.Size.Y * p.Size.Z
				if v > best then torso, best = p, v end
			end
		end
	end
	local head: BasePart? = body:FindFirstChild("Head", true) :: any
	if not (head and head:IsA("BasePart")) then
		head = nil
		local top = -math.huge
		for _, m in body:GetDescendants() do
			if m:IsA("Motor6D") and m.Part0 == torso and m.Part1 and m.Part1.Position.Y > top then head, top = m.Part1, m.Part1.Position.Y end
		end
	end
	return torso, head
end

function AppleCreatures.build(name: string, spec: any): (Model?, string?)
	-- A path may name an import folder (ServerStorage.AppleParts.<key>): the piece is what it holds.
	local function piece(at: Instance?): Instance?
		if at and at:IsA("Folder") then return at:FindFirstChildWhichIsA("Model") or at:FindFirstChildWhichIsA("BasePart") or at:FindFirstChildWhichIsA("Tool") end
		return at
	end
	local bodySource = piece(resolve(spec.body or ""))
	local costumeSource = piece(resolve(spec.costume or ""))
	if not bodySource or not costumeSource then return nil, "missing body or costume for " .. name end
	local body = asModel(bodySource:Clone())
	local costume = asModel(costumeSource:Clone())
	body.Name = name
	body.Parent = workspace -- bounding boxes need a parent in the world; it leaves again below
	local torso, head = torsoAndHead(body)
	if not torso then body:Destroy(); return nil, "the body has no torso" end

	-- The space the costume takes: torso and head together, in the body's own frame.
	local frame = (body.PrimaryPart or torso).CFrame
	local lo, hi = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
	for _, p in { torso, head } do
		if p then
			local c = frame:PointToObjectSpace(p.Position)
			lo, hi = lo:Min(c - p.Size / 2), hi:Max(c + p.Size / 2)
		end
	end
	local spaceSize = hi - lo
	local spaceCenter = frame:PointToWorldSpace((lo + hi) / 2)

	-- Scale and turn the costume. Only what shows counts: its scripts, joints and invisible parts (hitboxes, spawn
	-- markers) go first, so a plant's hitbox does not make the vegetable tiny.
	for _, d in costume:GetDescendants() do
		if d:IsA("BaseScript") or d:IsA("JointInstance") or d:IsA("Constraint") or d:IsA("AnimationController") or d:IsA("Humanoid") then d:Destroy() end
	end
	for _, d in costume:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency >= 0.99 then
			for _, c in d:GetChildren() do if c:IsA("BasePart") or c:IsA("Model") then c.Parent = costume end end
			d:Destroy()
		end
	end
	local visible = 0
	for _, d in costume:GetDescendants() do if d:IsA("BasePart") then visible += 1 end end
	if visible == 0 then body:Destroy(); costume:Destroy(); return nil, "the costume for " .. name .. " has nothing visible (a spawn marker?)" end
	costume.PrimaryPart = nil
	costume.Parent = workspace
	local _, csize = costume:GetBoundingBox()
	local box = { sx = csize.X, sy = csize.Y, sz = csize.Z }
	local s = AppleCreatures.fit(box, { sx = spaceSize.X, sy = spaceSize.Y, sz = spaceSize.Z }, spec.upright == true, spec.scale or 1.15)
	pcall(function() costume:ScaleTo(costume:GetScale() * s) end)
	-- Chunky, not skinny: a thin costume (a carrot) is widened on its two short sides toward the body's width, so the
	-- creature reads as a vegetable with arms and legs rather than a stick between them. Round ones stay as they are.
	do
		local bcf, bsize = costume:GetBoundingBox()
		local dims = { bsize.X, bsize.Y, bsize.Z }
		local longAxis = if spec.upright then (if bsize.X >= bsize.Y and bsize.X >= bsize.Z then 1 elseif bsize.Y >= bsize.Z then 2 else 3) else 2
		local wantWidth = math.max(spaceSize.X, spaceSize.Z) * 1.1
		local k = { 1, 1, 1 }
		for axis = 1, 3 do
			if axis ~= longAxis then k[axis] = math.clamp(wantWidth / math.max(dims[axis], 1e-3), 1, spec.stretch or 2.4) end
		end
		if k[1] > 1.01 or k[2] > 1.01 or k[3] > 1.01 then
			for _, p in costume:GetDescendants() do
				if p:IsA("BasePart") then
					local rel = bcf:ToObjectSpace(p.CFrame)
					local r = rel.Rotation
					-- How much each of the part's own axes stretches: the costume's stretch seen along that axis.
					local function along(v: Vector3): number
						local a = r:VectorToWorldSpace(v)
						return math.abs(a.X) * k[1] + math.abs(a.Y) * k[2] + math.abs(a.Z) * k[3]
					end
					local f = Vector3.new(along(Vector3.xAxis), along(Vector3.yAxis), along(Vector3.zAxis))
					p.Size = p.Size * f
					for _, m in p:GetChildren() do
						if m:IsA("SpecialMesh") then m.Scale = m.Scale * f end
					end
					p.CFrame = bcf * (CFrame.new(rel.Position * Vector3.new(k[1], k[2], k[3])) * r)
				end
			end
		end
	end
	costume:GetBoundingBox() -- (bounds changed)
	local turnZ, turnX = 0, 0
	if spec.upright then turnZ, turnX = AppleCreatures.uprightTurns(box) end
	local ccf = costume:GetBoundingBox()
	local offset = ccf.Position - costume:GetPivot().Position
	local target = CFrame.new(spaceCenter) * frame.Rotation * CFrame.Angles(turnX * math.pi / 2, 0, turnZ * math.pi / 2)
	costume:PivotTo(target * CFrame.new(-target.Rotation:VectorToObjectSpace(offset)))

	-- Weld it on, hide what it replaces, colour the limbs.
	for _, p in costume:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = false
			p.CanCollide = false
			p.Massless = true
			local w = Instance.new("WeldConstraint")
			w.Part0, w.Part1 = torso, p
			w.Parent = p
			p.Parent = body
		end
	end
	-- A face on the costume's front, so it reads as a creature. Roblox's own face texture always loads.
	if spec.face ~= false then
		local biggest: BasePart? = nil
		local v = -1
		for _, p in body:GetDescendants() do
			if p:IsA("BasePart") and p:FindFirstChildWhichIsA("WeldConstraint") and p.Size.X * p.Size.Y * p.Size.Z > v then biggest, v = p, p.Size.X * p.Size.Y * p.Size.Z end
		end
		if biggest then
			local bestFace, bestDot = Enum.NormalId.Front, -2
			for _, n in Enum.NormalId:GetEnumItems() do
				local d = biggest.CFrame:VectorToWorldSpace(Vector3.FromNormalId(n)):Dot(frame.LookVector)
				if d > bestDot then bestFace, bestDot = n, d end
			end
			local decal = Instance.new("Decal")
			decal.Name = "AppleFace"
			decal.Face = bestFace
			decal.Texture = if type(spec.face) == "string" then spec.face else "rbxasset://textures/face.png"
			decal.Parent = biggest
		end
	end
	costume:Destroy()
	for _, p in { torso, head } do
		if p then
			p.Transparency = 1
			for _, d in p:GetChildren() do if d:IsA("Decal") or d:IsA("SurfaceAppearance") then d:Destroy() end end
		end
	end
	if spec.limbColor then
		local colour = Color3.fromHex(spec.limbColor)
		for _, p in body:GetDescendants() do
			if p:IsA("BasePart") and p.Transparency < 1 and p ~= torso and p ~= head and not p:FindFirstChildWhichIsA("WeldConstraint") then
				p.Color = colour
				if p:IsA("MeshPart") then p.TextureID = "" end
				for _, d in p:GetChildren() do if d:IsA("SurfaceAppearance") then d:Destroy() end end
			end
		end
	end
	if type(spec.size) == "number" and spec.size > 0 and math.abs(spec.size - 1) > 1e-3 then
		pcall(function() body:ScaleTo(body:GetScale() * spec.size) end) -- joints scale with it
	end
	body:SetAttribute("AppleCreature", spec.costume)
	body.Parent = resolve(spec.into or "ServerStorage") or game:GetService("ServerStorage")
	return body, nil
end

function AppleCreatures.start(config: any)
	for name, spec in config.creatures or {} do
		local model, err = AppleCreatures.build(name, spec)
		if not model then warn("AppleCreatures: " .. tostring(err)) end
	end
end

return AppleCreatures
