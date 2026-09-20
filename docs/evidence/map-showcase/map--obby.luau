-- Low-poly obby: "Poison Valley" style map
-- Large separated obstacle clusters, readable direction, checkpoints each stage.

local workspace = game:GetService("Workspace")

local function part(parent, name, size, pos, color, material)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Position = pos
	p.Anchored = true
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local function killPart(parent, name, size, pos)
	local p = part(parent, name, size, pos, Color3.fromRGB(120, 200, 40), Enum.Material.Neon)
	local dmg = Instance.new("NumberValue")
	dmg.Name = "Damage"
	dmg.Value = 100
	dmg.Parent = p
	return p
end

local function checkpoint(parent, pos, stageNum)
	local pad = part(parent, "CheckpointPad" .. stageNum, Vector3.new(10, 1, 10), pos, Color3.fromRGB(0, 170, 255), Enum.Material.Neon)
	local beam = part(parent, "CheckpointBeam" .. stageNum, Vector3.new(2, 12, 2), pos + Vector3.new(0, 6, 0), Color3.fromRGB(0, 220, 255), Enum.Material.Neon)
	beam.Transparency = 0.5
	local num = Instance.new("IntValue")
	num.Name = "Stage"
	num.Value = stageNum
	num.Parent = pad
	return pad
end

-- ============ LOBBY ============
local lobby = Instance.new("Model")
lobby.Name = "Lobby"
lobby.Parent = workspace

part(lobby, "LobbyFloor", Vector3.new(60, 2, 60), Vector3.new(0, 0, 0), Color3.fromRGB(90, 90, 100), Enum.Material.Concrete)
part(lobby, "LobbyWallBack", Vector3.new(60, 20, 2), Vector3.new(0, 10, -29), Color3.fromRGB(70, 70, 80), Enum.Material.Concrete)
part(lobby, "LobbyWallLeft", Vector3.new(2, 20, 60), Vector3.new(-29, 10, 0), Color3.fromRGB(70, 70, 80), Enum.Material.Concrete)
part(lobby, "LobbyWallRight", Vector3.new(2, 20, 60), Vector3.new(29, 10, 0), Color3.fromRGB(70, 70, 80), Enum.Material.Concrete)
part(lobby, "LobbyRoof", Vector3.new(60, 2, 60), Vector3.new(0, 21, 0), Color3.fromRGB(60, 60, 70), Enum.Material.Concrete)

local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(12, 1, 12)
spawn.Position = Vector3.new(0, 1.5, 15)
spawn.Anchored = true
spawn.Color = Color3.fromRGB(0, 200, 120)
spawn.Material = Enum.Material.Neon
spawn.Neutral = true
spawn.Parent = lobby

-- Decorative low-poly props
part(lobby, "LobbySign", Vector3.new(20, 6, 1), Vector3.new(0, 14, -27.5), Color3.fromRGB(255, 170, 0), Enum.Material.Neon)
part(lobby, "LobbyTreeTrunk", Vector3.new(2, 8, 2), Vector3.new(-20, 5, -20), Color3.fromRGB(110, 70, 40), Enum.Material.Wood)
part(lobby, "LobbyTreeTop", Vector3.new(8, 6, 8), Vector3.new(-20, 12, -20), Color3.fromRGB(60, 160, 70), Enum.Material.Grass)
part(lobby, "LobbyTreeTrunk2", Vector3.new(2, 8, 2), Vector3.new(20, 5, -20), Color3.fromRGB(110, 70, 40), Enum.Material.Wood)
part(lobby, "LobbyTreeTop2", Vector3.new(8, 6, 8), Vector3.new(20, 12, -20), Color3.fromRGB(60, 160, 70), Enum.Material.Grass)

-- ============ POISON VALLEY (ground hazards between clusters) ============
local valley = Instance.new("Model")
valley.Name = "PoisonValley"
valley.Parent = workspace

part(valley, "ValleyFloor", Vector3.new(400, 2, 300), Vector3.new(250, -6, 0), Color3.fromRGB(70, 90, 40), Enum.Material.Grass)
killPart(valley, "PoisonPool1", Vector3.new(60, 1, 40), Vector3.new(120, -5, 40))
killPart(valley, "PoisonPool2", Vector3.new(50, 1, 50), Vector3.new(260, -5, -50))
killPart(valley, "PoisonPool3", Vector3.new(70, 1, 40), Vector3.new(380, -5, 30))

-- ============ STAGE 1: Simple jumps ============
local stage1 = Instance.new("Model")
stage1.Name = "Stage1_Jumps"
stage1.Parent = workspace

checkpoint(stage1, Vector3.new(45, 1, 0), 1)
part(stage1, "S1_P1", Vector3.new(8, 1, 8), Vector3.new(60, 1, 0), Color3.fromRGB(230, 120, 60), Enum.Material.SmoothPlastic)
part(stage1, "S1_P2", Vector3.new(8, 1, 8), Vector3.new(75, 3, 6), Color3.fromRGB(230, 120, 60), Enum.Material.SmoothPlastic)
part(stage1, "S1_P3", Vector3.new(8, 1, 8), Vector3.new(90, 5, -4), Color3.fromRGB(230, 120, 60), Enum.Material.SmoothPlastic)
part(stage1, "S1_P4", Vector3.new(8, 1, 8), Vector3.new(105, 7, 4), Color3.fromRGB(230, 120, 60), Enum.Material.SmoothPlastic)
checkpoint(stage1, Vector3.new(120, 8, 0), 2)

-- ============ STAGE 2: Kill brick weave ============
local stage2 = Instance.new("Model")
stage2.Name = "Stage2_KillWeave"
stage2.Parent = workspace

part(stage2, "S2_Bridge", Vector3.new(60, 1, 12), Vector3.new(155, 8, 0), Color3.fromRGB(150, 150, 160), Enum.Material.Concrete)
killPart(stage2, "S2_K1", Vector3.new(4, 3, 12), Vector3.new(140, 10, 0))
killPart(stage2, "S2_K2", Vector3.new(4, 3, 12), Vector3.new(155, 10, 4))
killPart(stage2, "S2_K3", Vector3.new(4, 3, 12), Vector3.new(170, 10, -4))
checkpoint(stage2, Vector3.new(195, 8, 0), 3)

-- ============ STAGE 3: Ladder wall climb ============
local stage3 = Instance.new("Model")
stage3.Name = "Stage3_Climb"
stage3.Parent = workspace

part(stage3, "S3_Wall", Vector3.new(4, 30, 20), Vector3.new(230, 23, 0), Color3.fromRGB(120, 80, 60), Enum.Material.WoodPlanks)
for i = 1, 10 do
	part(stage3, "S3_Rung" .. i, Vector3.new(1, 1, 6), Vector3.new(227, 4 + i * 3, 0), Color3.fromRGB(200, 160, 90), Enum.Material.Wood)
end
part(stage3, "S3_Top", Vector3.new(14, 1, 20), Vector3.new(239, 38, 0), Color3.fromRGB(230, 120, 60), Enum.Material.SmoothPlastic)
checkpoint(stage3, Vector3.new(239, 39, 0), 4)

-- ============ STAGE 4: Moving-free spinner (rotating visual bar, static kill arms) ============
local stage4 = Instance.new("Model")
stage4.Name = "Stage4_Spinner"
stage4.Parent = workspace

part(stage4, "S4_Platform", Vector3.new(30, 1, 30), Vector3.new(280, 38, 0), Color3.fromRGB(150, 150, 160), Enum.Material.Concrete)
local hub = part(stage4, "S4_Hub", Vector3.new(4, 4, 4), Vector3.new(280, 41, 0), Color3.fromRGB(60, 60, 70), Enum.Material.Metal)
local arm1 = killPart(stage4, "S4_Arm1", Vector3.new(24, 2, 2), Vector3.new(280, 41, 0))
arm1.Orientation = Vector3.new(0, 0, 0)
local arm2 = killPart(stage4, "S4_Arm2", Vector3.new(24, 2, 2), Vector3.new(280, 41, 0))
arm2.Orientation = Vector3.new(0, 90, 0)
checkpoint(stage4, Vector3.new(310, 39, 0), 5)

-- ============ STAGE 5: Narrow beam walk ============
local stage5 = Instance.new("Model")
stage5.Name = "Stage5_BeamWalk"
stage5.Parent = workspace

part(stage5, "S5_Beam1", Vector3.new(30, 1, 3), Vector3.new(340, 39, 0), Color3.fromRGB(240, 200, 60), Enum.Material.SmoothPlastic)
part(stage5, "S5_Beam2", Vector3.new(3, 1, 30), Vector3.new(368, 39, -13), Color3.fromRGB(240, 200, 60), Enum.Material.SmoothPlastic)
part(stage5, "S5_Beam3", Vector3.new(30, 1, 3), Vector3.new(396, 39, 0), Color3.fromRGB(240, 200, 60), Enum.Material.SmoothPlastic)
checkpoint(stage5, Vector3.new(420, 39, 0), 6)

-- ============ FINISH ============
local finish = Instance.new("Model")
finish.Name = "Finish"
finish.Parent = workspace

part(finish, "FinishPlatform", Vector3.new(30, 2, 30), Vector3.new(450, 38, 0), Color3.fromRGB(0, 200, 120), Enum.Material.Neon)
part(finish, "FinishArchLeft", Vector3.new(2, 20, 2), Vector3.new(450, 49, -10), Color3.fromRGB(255, 215, 0), Enum.Material.Metal)
part(finish, "FinishArchRight", Vector3.new(2, 20, 2), Vector3.new(450, 49, 10), Color3.fromRGB(255, 215, 0), Enum.Material.Metal)
part(finish, "FinishArchTop", Vector3.new(2, 2, 22), Vector3.new(450, 59, 0), Color3.fromRGB(255, 215, 0), Enum.Material.Metal)
part(finish, "FinishBanner", Vector3.new(1, 8, 14), Vector3.new(450, 52, 0), Color3.fromRGB(255, 215, 0), Enum.Material.Neon)

-- ============ BOUNDARIES ============
local bounds = Instance.new("Model")
bounds.Name = "Boundaries"
bounds.Parent = workspace

part(bounds, "BoundLeft", Vector3.new(2, 60, 400), Vector3.new(250, 20, -160), Color3.fromRGB(80, 100, 60), Enum.Material.Grass)
part(bounds, "BoundRight", Vector3.new(2, 60, 400), Vector3.new(250, 20, 160), Color3.fromRGB(80, 100, 60), Enum.Material.Grass)
part(bounds, "BoundBack", Vector3.new(500, 60, 2), Vector3.new(250, 20, -160), Color3.fromRGB(80, 100, 60), Enum.Material.Grass)
part(bounds, "BoundFront", Vector3.new(500, 60, 2), Vector3.new(250, 20, 160), Color3.fromRGB(80, 100, 60), Enum.Material.Grass)

-- ============ LIGHTING ============
local lighting = game:GetService("Lighting")
lighting.Brightness = 2.2
lighting.Ambient = Color3.fromRGB(90, 100, 80)
lighting.OutdoorAmbient = Color3.fromRGB(110, 120, 95)
lighting.ClockTime = 14
lighting.FogColor = Color3.fromRGB(140, 160, 110)
lighting.FogEnd = 600
lighting.EnvironmentDiffuseScale = 0.5
lighting.EnvironmentSpecularScale = 0.3