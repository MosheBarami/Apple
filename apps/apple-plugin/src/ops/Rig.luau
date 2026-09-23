--!nocheck
-- Apple Studio op family: CHARACTER RIGS (tool expansion Phase A).
--
--   create_rig  (write)  an R15 or R6 character built by Players:CreateHumanoidModelFromDescription
--
-- The HumanoidDescription is filled with body colours and body scales ONLY. No accessory, clothing,
-- face, animation or body-part asset id is ever set: those are Content, and Content reaches the
-- place only through a door that checks where the id came from (apply_content, not built yet).
--
-- A rig is made of classes Apple cannot recreate from a checkpoint (MeshParts for R15, Motor6D
-- joints whose C0/C1 are not on the property allowlist), so they are registered DELETE-ONLY: a
-- restore may remove a rig added after the checkpoint, and a checkpoint taken after a rig exists
-- says it is incomplete rather than pretending it could rebuild one.

local Rig = {}
Rig.name = "rig"

local BODY_PARTS = {
	head = "HeadColor", torso = "TorsoColor", leftArm = "LeftArmColor", rightArm = "RightArmColor",
	leftLeg = "LeftLegColor", rightLeg = "RightLegColor",
}
local SCALES = {
	height = { "HeightScale", 0.9, 1.05 }, width = { "WidthScale", 0.7, 1 }, depth = { "DepthScale", 0.7, 1 },
	head = { "HeadScale", 0.95, 1 }, proportion = { "ProportionScale", 0, 1 }, bodyType = { "BodyTypeScale", 0, 1 },
}

function Rig.build(api)
	local function handleCreateRig(self, op)
		local rigType = op.rigType or "R15"
		if rigType ~= "R15" and rigType ~= "R6" then return nil, "invalid", "rigType must be R15 or R6" end
		local name, nameErr = api.safeName(op.name or "Rig", "name")
		if not name then return nil, "invalid", nameErr end
		local position = { 0, 5, 0 }
		if op.position ~= nil then
			local ok, err = api.arrayShape(op.position, 3, "position")
			if not ok then return nil, "invalid", err end
			for i = 1, 3 do if math.abs(op.position[i]) > api.limits.translation then return nil, "invalid", "position exceeds the world-coordinate limit" end end
			position = op.position
		end
		local parentPath = op.parent or "game.Workspace"
		local parent, canonicalParent, pErr, pKind, pRemedy = api.resolvePath(self.game, self.options.services, parentPath, true)
		if not parent then return nil, pKind or "not_found", pErr, pRemedy end
		local refused, refusedRemedy = api.destinationRefusal(self.game, parent, canonicalParent, "Model")
		if refused then return nil, "refused", refused, refusedRemedy end
		local okFree, taken = pcall(function() return parent:FindFirstChild(name) end)
		if not okFree then return nil, "internal", "could not inspect sibling names" end
		if taken then return nil, "conflict", ("%s already contains a child named %s"):format(canonicalParent, name) end

		local players = api.serviceFrom(self.game, self.options.services, "Players")
		if players == nil then return nil, "refused", "the Players service is unavailable in this Studio session", "none" end
		local description, dErr = api.makeInstance(self.options, "HumanoidDescription")
		if not description then return nil, "internal", dErr end
		local colours = op.bodyColors or {}
		if type(colours) ~= "table" then return nil, "invalid", "bodyColors must be an object" end
		for key, raw in colours do
			local property = BODY_PARTS[key]
			if not property then return nil, "invalid", "bodyColors keys are head, torso, leftArm, rightArm, leftLeg, rightLeg" end
			local ok, err = api.arrayShape(raw, 3, "bodyColors." .. key)
			if not ok then return nil, "invalid", err end
			for i = 1, 3 do if raw[i] < 0 or raw[i] > 1 then return nil, "invalid", "bodyColors." .. key .. " channels must be 0..1" end end
			description[property] = Color3.new(raw[1], raw[2], raw[3])
		end
		local scale = op.scale or {}
		if type(scale) ~= "table" then return nil, "invalid", "scale must be an object" end
		for key, value in scale do
			local spec = SCALES[key]
			if not spec then return nil, "invalid", "scale keys are height, width, depth, head, proportion, bodyType" end
			if not api.finite(value) or value < spec[2] or value > spec[3] then
				return nil, "invalid", ("scale.%s must be %s-%s"):format(key, tostring(spec[2]), tostring(spec[3]))
			end
			description[spec[1]] = value
		end

		local okBuild, rig = pcall(function()
			return players:CreateHumanoidModelFromDescription(description, Enum.HumanoidRigType[rigType])
		end)
		pcall(function() description:Destroy() end)
		if not okBuild or rig == nil then
			return nil, "internal", "Studio could not build the rig (Players:CreateHumanoidModelFromDescription): " .. tostring(rig)
		end
		local descendants = api.descendantsOf(rig) or {}
		for _, node in descendants do
			if api.isScript(node) then
				pcall(function() rig:Destroy() end)
				return nil, "refused", "the generated rig contained a script, and Apple inserts geometry, not code"
			end
		end
		local humanoid = rig:FindFirstChildOfClass("Humanoid")
		local root = rig:FindFirstChild("HumanoidRootPart")
		local okPlace, placeErr = pcall(function()
			rig.Name = name
			rig:PivotTo(CFrame.new(position[1], position[2], position[3]))
			if op.npc == true then
				if root then root.Anchored = true end
				if humanoid then humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None end
			end
			if humanoid and type(op.displayName) == "string" and #op.displayName <= 60 then humanoid.DisplayName = op.displayName end
			rig.Parent = parent
		end)
		if not okPlace then
			pcall(function() rig:Destroy() end)
			return nil, "internal", "could not place the rig: " .. tostring(placeErr)
		end
		return {
			path = api.fullPath(self.game, rig), rigType = rigType, parts = #(api.partsUnder(rig) or {}),
			humanoid = humanoid ~= nil, anchored = op.npc == true,
			note = "Body colours and scales only: no clothing, accessories or animations (those are asset ids). Checkpoints taken while this rig exists cannot recreate it.",
		}
	end

	return {
		handlers = {
			create_rig = handleCreateRig,
		},
		mutating = { create_rig = true },
		-- Recreatable from a checkpoint: none of these carries Content or joint offsets.
		createClasses = { Humanoid = true, Animator = true, AnimationController = true },
		deleteOnlyClasses = {
			Motor6D = true, Weld = true, HumanoidDescription = true, BodyColors = true, SpecialMesh = true,
			WrapTarget = true, WrapLayer = true, Accessory = true, AccessoryDescription = true, BodyPartDescription = true,
			Shirt = true, Pants = true, ShirtGraphic = true, FaceControls = true,
		},
		propertyAllow = {
			WalkSpeed = true, JumpPower = true, JumpHeight = true, UseJumpPower = true, MaxHealth = true, Health = true,
			DisplayName = true, DisplayDistanceType = true, HipHeight = true, AutoRotate = true,
		},
		readProperties = {
			WalkSpeed = true, JumpPower = true, JumpHeight = true, UseJumpPower = true, MaxHealth = true, Health = true,
			DisplayName = true, DisplayDistanceType = true, HipHeight = true, AutoRotate = true,
		},
		enumAllow = { HumanoidDisplayDistanceType = true },
	}
end

return Rig
