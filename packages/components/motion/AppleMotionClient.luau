--!strict
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
