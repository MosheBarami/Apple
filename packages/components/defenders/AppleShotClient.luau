--!strict
-- Draws AppleDefenders' shots on each client: the defender's library projectile (ReplicatedStorage.AppleProjectiles.<name>)
-- flies from the defender to the enemy; a small glowing ball when it has none.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local shot = ReplicatedStorage:WaitForChild("AppleShot") :: RemoteEvent
local projectiles = ReplicatedStorage:FindFirstChild("AppleProjectiles")

local function flyModel(template: Instance, from: Vector3, to: Vector3)
	local copy = template:Clone()
	local time = math.clamp((to - from).Magnitude / 60, 0.08, 0.5)
	local start = CFrame.lookAt(from, to)
	for _, d in copy:GetDescendants() do if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false; d.CanQuery = false end end
	if copy:IsA("BasePart") then copy.Anchored = true; copy.CanCollide = false end
	local function place(cf: CFrame)
		if copy:IsA("Model") then copy:PivotTo(cf) elseif copy:IsA("BasePart") then copy.CFrame = cf end
	end
	place(start)
	copy.Parent = workspace
	local t0 = os.clock()
	local conn: RBXScriptConnection
	conn = game:GetService("RunService").RenderStepped:Connect(function()
		local k = math.min(1, (os.clock() - t0) / time)
		place(start.Rotation + from:Lerp(to, k))
		if k >= 1 then conn:Disconnect(); copy:Destroy() end
	end)
end

shot.OnClientEvent:Connect(function(from: Vector3, to: Vector3, colour: Color3, projectile: string?)
	local template = projectiles and projectile and projectiles:FindFirstChild(projectile)
	if template then flyModel(template, from, to) return end
	local ball = Instance.new("Part")
	ball.Shape = Enum.PartType.Ball
	ball.Size = Vector3.new(0.8, 0.8, 0.8)
	ball.Material = Enum.Material.Neon
	ball.Color = colour
	ball.Anchored = true
	ball.CanCollide = false
	ball.CanQuery = false
	ball.CastShadow = false
	ball.Position = from
	ball.Parent = workspace
	local time = math.clamp((to - from).Magnitude / 60, 0.08, 0.5)
	TweenService:Create(ball, TweenInfo.new(time, Enum.EasingStyle.Linear), { Position = to }):Play()
	task.delay(time, function()
		TweenService:Create(ball, TweenInfo.new(0.15), { Size = Vector3.new(2, 2, 2), Transparency = 1 }):Play()
	end)
	Debris:AddItem(ball, time + 0.2)
end)
