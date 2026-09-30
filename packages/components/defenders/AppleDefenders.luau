--!strict
--[[
	AppleDefenders: things a player placed (plants, towers) that hit the nearest enemy in range. Each placed
	model in Workspace.AppleDefenders carries attributes Range (studs), Damage, Rate (hits per second) and
	Owner (UserId). A hit lowers the enemy's Health, sets LastHitBy to the owner (AppleWaves pays the reward),
	turns the defender to face it, plays its attack (AppleMotion MotionAttack) and tells every client to draw
	the shot (ReplicatedStorage.AppleShot: from, to, colour, projectile name). Works with any enemy tagged AppleEnemy.
]]
local AppleDefenders = {}

export type Target = { id: any, x: number, z: number, progress: number }
--[[ Pure: the enemy a defender at (x, z) with this range should hit: the one furthest along its path among
	those in range (the most dangerous), ties to the nearest. nil when none is in range. ]]
function AppleDefenders.pick(x: number, z: number, range: number, targets: { Target }): Target?
	local best: Target? = nil
	local bestProgress, bestDist = -math.huge, math.huge
	for _, t in targets do
		local d = math.sqrt((t.x - x) ^ 2 + (t.z - z) ^ 2)
		if d <= range then
			if t.progress > bestProgress or (t.progress == bestProgress and d < bestDist) then
				best, bestProgress, bestDist = t, t.progress, d
			end
		end
	end
	return best
end

function AppleDefenders.start()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local RunService = game:GetService("RunService")
	local CollectionService = game:GetService("CollectionService")

	local placed = workspace:FindFirstChild("AppleDefenders") or Instance.new("Folder")
	placed.Name = "AppleDefenders"
	placed.Parent = workspace
	local shot = ReplicatedStorage:FindFirstChild("AppleShot") or Instance.new("RemoteEvent")
	shot.Name = "AppleShot"
	shot.Parent = ReplicatedStorage

	local ready: { [Model]: number } = {}
	local spawnedAt: { [Model]: number } = {}
	CollectionService:GetInstanceAddedSignal("AppleEnemy"):Connect(function(m) spawnedAt[m] = os.clock() end)
	CollectionService:GetInstanceRemovedSignal("AppleEnemy"):Connect(function(m) spawnedAt[m] = nil end)

	RunService.Heartbeat:Connect(function()
		local now = os.clock()
		local targets: { Target } = {}
		for _, enemy in CollectionService:GetTagged("AppleEnemy") do
			if enemy:IsA("Model") and enemy.Parent and (enemy:GetAttribute("Health") or 0) > 0 then
				local p = enemy:GetPivot().Position
				-- Enemies that have walked longest are furthest along: the order they spawned in stands in for progress.
				table.insert(targets, { id = enemy, x = p.X, z = p.Z, progress = now - (spawnedAt[enemy] or now) })
			end
		end
		if #targets == 0 then return end
		for _, d in placed:GetChildren() do
			if not d:IsA("Model") then continue end
			local rate = d:GetAttribute("Rate") or 1
			if (ready[d] or 0) > now or rate <= 0 then continue end
			local pivot = d:GetPivot()
			local t = AppleDefenders.pick(pivot.Position.X, pivot.Position.Z, d:GetAttribute("Range") or 16, targets)
			if not t then continue end
			ready[d] = now + 1 / rate
			local enemy = t.id :: Model
			local to = enemy:GetPivot().Position
			enemy:SetAttribute("LastHitBy", d:GetAttribute("Owner") or 0)
			enemy:SetAttribute("Health", (enemy:GetAttribute("Health") or 0) - (d:GetAttribute("Damage") or 5))
			local flat = Vector3.new(to.X, pivot.Position.Y, to.Z)
			if (flat - pivot.Position).Magnitude > 0.1 then d:PivotTo(CFrame.lookAt(pivot.Position, flat)) end
			d:SetAttribute("MotionAttack", now)
			local muzzle = d:FindFirstChild("Muzzle", true)
			local from = if muzzle and muzzle:IsA("BasePart") then muzzle.Position elseif muzzle and muzzle:IsA("Attachment") then muzzle.WorldPosition else pivot.Position + Vector3.new(0, 2, 0)
			shot:FireAllClients(from, to, d:GetAttribute("ShotColor") or Color3.fromRGB(120, 220, 90), d:GetAttribute("Projectile"))
		end
	end)
end

return AppleDefenders
