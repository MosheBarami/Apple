-- Tower Defense Map: "Emberfall Crossing"
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

local function model(name)
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = workspace
	return m
end

-- ============ GROUND ============
local ground = model("Ground")
part(ground, "MainGround", Vector3.new(240, 2, 240), Vector3.new(0, -1, 0), Color3.fromRGB(106, 148, 82), Enum.Material.Grass)
part(ground, "DirtPatch1", Vector3.new(30, 0.4, 30), Vector3.new(-60, 0.25, 50), Color3.fromRGB(120, 92, 60), Enum.Material.Ground)
part(ground, "DirtPatch2", Vector3.new(24, 0.4, 24), Vector3.new(70, 0.25, -60), Color3.fromRGB(120, 92, 60), Enum.Material.Ground)

-- ============ BOUNDARIES ============
local bounds = model("Boundaries")
local wallColor = Color3.fromRGB(70, 90, 70)
part(bounds, "WallN", Vector3.new(240, 14, 4), Vector3.new(0, 6, 120), wallColor, Enum.Material.Slate)
part(bounds, "WallS", Vector3.new(240, 14, 4), Vector3.new(0, 6, -120), wallColor, Enum.Material.Slate)
part(bounds, "WallE", Vector3.new(4, 14, 240), Vector3.new(120, 6, 0), wallColor, Enum.Material.Slate)
part(bounds, "WallW", Vector3.new(4, 14, 240), Vector3.new(-120, 6, 0), wallColor, Enum.Material.Slate)

-- ============ ENEMY PATH (winding S-curve) ============
local path = model("EnemyPath")
local pathColor = Color3.fromRGB(194, 168, 120)
local pathMat = Enum.Material.Sand
-- Segment 1: spawn (south) heading north
part(path, "PathSeg1", Vector3.new(10, 0.5, 60), Vector3.new(-70, 0.5, -80), pathColor, pathMat)
-- Turn east
part(path, "PathSeg2", Vector3.new(60, 0.5, 10), Vector3.new(-45, 0.5, -55), pathColor, pathMat)
-- North again
part(path, "PathSeg3", Vector3.new(10, 0.5, 70), Vector3.new(-20, 0.5, -25), pathColor, pathMat)
-- East across middle
part(path, "PathSeg4", Vector3.new(70, 0.5, 10), Vector3.new(15, 0.5, 5), pathColor, pathMat)
-- South
part(path, "PathSeg5", Vector3.new(10, 0.5, 60), Vector3.new(45, 0.5, 30), pathColor, pathMat)
-- East to base
part(path, "PathSeg6", Vector3.new(50, 0.5, 10), Vector3.new(75, 0.5, 55), pathColor, pathMat)
-- Corner smoothing pads
part(path, "CornerPad1", Vector3.new(12, 0.5, 12), Vector3.new(-70, 0.5, -55), pathColor, pathMat)
part(path, "CornerPad2", Vector3.new(12, 0.5, 12), Vector3.new(-20, 0.5, 5), pathColor, pathMat)
part(path, "CornerPad3", Vector3.new(12, 0.5, 12), Vector3.new(45, 0.5, 55), pathColor, pathMat)

-- ============ SPAWN (enemy portal) ============
local spawnArea = model("EnemySpawn")
part(spawnArea, "PortalPlatform", Vector3.new(24, 1, 24), Vector3.new(-70, 1, -100), Color3.fromRGB(60, 40, 70), Enum.Material.Slate)
part(spawnArea, "PortalFrameL", Vector3.new(3, 16, 3), Vector3.new(-76, 9, -100), Color3.fromRGB(120, 40, 160), Enum.Material.Neon)
part(spawnArea, "PortalFrameR", Vector3.new(3, 16, 3), Vector3.new(-64, 9, -100), Color3.fromRGB(120, 40, 160), Enum.Material.Neon)
part(spawnArea, "PortalFrameTop", Vector3.new(15, 3, 3), Vector3.new(-70, 17.5, -100), Color3.fromRGB(120, 40, 160), Enum.Material.Neon)
part(spawnArea, "PortalGlow", Vector3.new(9, 13, 1), Vector3.new(-70, 8, -100), Color3.fromRGB(170, 60, 255), Enum.Material.Neon)

-- ============ PLAYER BASE (end of path) ============
local base = model("PlayerBase")
part(base, "BasePlatform", Vector3.new(30, 1, 30), Vector3.new(100, 1, 55), Color3.fromRGB(90, 90, 100), Enum.Material.Concrete)
part(base, "KeepBody", Vector3.new(16, 20, 16), Vector3.new(100, 11, 55), Color3.fromRGB(130, 130, 145), Enum.Material.Brick)
part(base, "KeepRoof", Vector3.new(18, 2, 18), Vector3.new(100, 22, 55), Color3.fromRGB(160, 60, 50), Enum.Material.Slate)
part(base, "KeepRoofPeak", Vector3.new(10, 4, 10), Vector3.new(100, 25, 55), Color3.fromRGB(160, 60, 50), Enum.Material.Slate)
part(base, "BaseBanner", Vector3.new(1, 8, 4), Vector3.new(100, 14, 46), Color3.fromRGB(60, 120, 220), Enum.Material.Fabric)
part(base, "CrystalCore", Vector3.new(4, 6, 4), Vector3.new(100, 30, 55), Color3.fromRGB(80, 220, 255), Enum.Material.Neon)

-- ============ TOWER PADS (build spots along path) ============
local pads = model("TowerPads")
local padColor = Color3.fromRGB(150, 150, 160)
local padPositions = {
	Vector3.new(-85, 1, -70), Vector3.new(-55, 1, -70),
	Vector3.new(-35, 1, -40), Vector3.new(-5, 1, -40),
	Vector3.new(-35, 1, 20), Vector3.new(-5, 1, 20),
	Vector3.new(30, 1, 20), Vector3.new(60, 1, 20),
	Vector3.new(30, 1, 45), Vector3.new(60, 1, 45),
	Vector3.new(-35, 1, -10), Vector3.new(15, 1, -10),
}
for i, pos in ipairs(padPositions) do
	local pad = part(pads, "TowerPad" .. i, Vector3.new(10, 1, 10), pos, padColor, Enum.Material.Concrete)
	part(pads, "PadRing" .. i, Vector3.new(11, 0.4, 11), Vector3.new(pos.X, 1.7, pos.Z), Color3.fromRGB(90, 200, 120), Enum.Material.Neon)
end

-- ============ DECORATION: TREES ============
local trees = model("Trees")
local treeSpots = {
	Vector3.new(-95, 0, -20), Vector3.new(-95, 0, 30), Vector3.new(-95, 0, 80),
	Vector3.new(-40, 0, 80), Vector3.new(10, 0, 80), Vector3.new(80, 0, -20),
	Vector3.new(80, 0, -70), Vector3.new(20, 0, -80), Vector3.new(-40, 0, -90),
	Vector3.new(90, 0, 90),
}
for i, pos in ipairs(treeSpots) do
	part(trees, "Trunk" .. i, Vector3.new(2, 8, 2), Vector3.new(pos.X, 4, pos.Z), Color3.fromRGB(101, 67, 33), Enum.Material.Wood)
	part(trees, "Leaves" .. i, Vector3.new(8, 8, 8), Vector3.new(pos.X, 10, pos.Z), Color3.fromRGB(50, 130, 60), Enum.Material.Grass)
	part(trees, "LeavesTop" .. i, Vector3.new(5, 5, 5), Vector3.new(pos.X, 15, pos.Z), Color3.fromRGB(60, 150, 70), Enum.Material.Grass)
end

-- ============ DECORATION: ROCKS ============
local rocks = model("Rocks")
part(rocks, "Rock1", Vector3.new(8, 5, 6), Vector3.new(-100, 2.5, -60), Color3.fromRGB(120, 120, 125), Enum.Material.Slate)
part(rocks, "Rock2", Vector3.new(6, 4, 8), Vector3.new(95, 2, -50), Color3.fromRGB(120, 120, 125), Enum.Material.Slate)
part(rocks, "Rock3", Vector3.new(7, 4, 5), Vector3.new(5, 2, -60), Color3.fromRGB(120, 120, 125), Enum.Material.Slate)

-- ============ WATER POND ============
local pond = model("Pond")
part(pond, "Water", Vector3.new(26, 0.6, 26), Vector3.new(85, 0.4, -85), Color3.fromRGB(60, 140, 200), Enum.Material.Glass)
part(pond, "PondEdge", Vector3.new(30, 0.8, 30), Vector3.new(85, 0.2, -85), Color3.fromRGB(140, 110, 80), Enum.Material.Ground)

-- ============ BRIDGE OVER PATH CROSSING ============
local bridge = model("Bridge")
part(bridge, "BridgeDeck", Vector3.new(14, 1, 30), Vector3.new(45, 3, 30), Color3.fromRGB(140, 100, 60), Enum.Material.WoodPlanks)
part(bridge, "BridgeRailL", Vector3.new(1, 3, 30), Vector3.new(39, 5, 30), Color3.fromRGB(110, 80, 50), Enum.Material.Wood)
part(bridge, "BridgeRailR", Vector3.new(1, 3, 30), Vector3.new(51, 5, 30), Color3.fromRGB(110, 80, 50), Enum.Material.Wood)

-- ============ PLAYER SPAWN LOCATION ============
local spawns = model("Spawns")
local sp = Instance.new("SpawnLocation")
sp.Name = "PlayerSpawn"
sp.Size = Vector3.new(8, 1, 8)
sp.Position = Vector3.new(100, 1.5, 75)
sp.Anchored = true
sp.Color = Color3.fromRGB(90, 200, 120)
sp.Material = Enum.Material.Neon
sp.Neutral = true
sp.Duration = 0
sp.Parent = spawns

-- ============ LIGHTING ============
local lighting = game:GetService("Lighting")
lighting.Ambient = Color3.fromRGB(90, 100, 110)
lighting.OutdoorAmbient = Color3.fromRGB(120, 130, 140)
lighting.Brightness = 2.2
lighting.ClockTime = 14.5
lighting.GeographicLatitude = 30
lighting.FogEnd = 600
lighting.FogColor = Color3.fromRGB(190, 205, 220)