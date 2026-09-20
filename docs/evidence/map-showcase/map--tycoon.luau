-- Tycoon Map: central park hub, radiating paths, four tycoon plots, spawn plaza
local function part(parent, name, size, pos, color, material)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Position = pos
	p.Anchored = true
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.Parent = parent
	return p
end

local C = {
	grass = Color3.fromRGB(106, 168, 79),
	path = Color3.fromRGB(203, 195, 178),
	wall = Color3.fromRGB(120, 120, 130),
	plot = Color3.fromRGB(160, 160, 165),
	plotA = Color3.fromRGB(230, 145, 56),
	plotB = Color3.fromRGB(70, 130, 200),
	plotC = Color3.fromRGB(180, 70, 70),
	plotD = Color3.fromRGB(120, 180, 90),
	water = Color3.fromRGB(80, 150, 220),
	wood = Color3.fromRGB(140, 100, 60),
	stone = Color3.fromRGB(130, 130, 135),
	roof = Color3.fromRGB(90, 60, 50),
	drop = Color3.fromRGB(255, 200, 60),
}

-- GROUND
local ground = Instance.new("Model")
ground.Name = "Ground"
ground.Parent = workspace
part(ground, "Base", Vector3.new(400, 2, 400), Vector3.new(0, 0, 0), C.grass, Enum.Material.Grass)

-- BOUNDARIES
local bounds = Instance.new("Model")
bounds.Name = "Boundaries"
bounds.Parent = workspace
local wallH, wallT = 24, 2
part(bounds, "WallN", Vector3.new(400, wallH, wallT), Vector3.new(0, wallH/2, -200), C.wall, Enum.Material.Concrete)
part(bounds, "WallS", Vector3.new(400, wallH, wallT), Vector3.new(0, wallH/2, 200), C.wall, Enum.Material.Concrete)
part(bounds, "WallE", Vector3.new(wallT, wallH, 400), Vector3.new(200, wallH/2, 0), C.wall, Enum.Material.Concrete)
part(bounds, "WallW", Vector3.new(wallT, wallH, 400), Vector3.new(-200, wallH/2, 0), C.wall, Enum.Material.Concrete)

-- SPAWN PLAZA (south center)
local spawnArea = Instance.new("Model")
spawnArea.Name = "SpawnPlaza"
spawnArea.Parent = workspace
part(spawnArea, "Plaza", Vector3.new(40, 1, 24), Vector3.new(0, 1.5, 165), C.path, Enum.Material.Concrete)
local sp = Instance.new("SpawnLocation")
sp.Size = Vector3.new(8, 1, 8)
sp.Position = Vector3.new(0, 2, 165)
sp.Anchored = true
sp.Color = Color3.fromRGB(90, 200, 120)
sp.Material = Enum.Material.Neon
sp.Neutral = true
sp.Parent = spawnArea
-- welcome arch
part(spawnArea, "ArchL", Vector3.new(3, 16, 3), Vector3.new(-10, 9, 152), C.wood, Enum.Material.Wood)
part(spawnArea, "ArchR", Vector3.new(3, 16, 3), Vector3.new(10, 9, 152), C.wood, Enum.Material.Wood)
part(spawnArea, "ArchTop", Vector3.new(26, 3, 3), Vector3.new(0, 18.5, 152), C.wood, Enum.Material.Wood)

-- CENTRAL PARK HUB (pond + paths radiating out)
local park = Instance.new("Model")
park.Name = "CentralPark"
park.Parent = workspace
part(park, "ParkLawn", Vector3.new(70, 1, 70), Vector3.new(0, 1, 0), Color3.fromRGB(96, 160, 70), Enum.Material.Grass)
part(park, "Pond", Vector3.new(30, 1, 22), Vector3.new(0, 1.2, 0), C.water, Enum.Material.Glass)
part(park, "PondRim", Vector3.new(34, 1, 26), Vector3.new(0, 0.8, 0), C.stone, Enum.Material.Slate)
part(park, "FountainBase", Vector3.new(8, 2, 8), Vector3.new(0, 2.5, 0), C.stone, Enum.Material.Slate)
part(park, "FountainJet", Vector3.new(2, 6, 2), Vector3.new(0, 6, 0), C.water, Enum.Material.Neon)
-- benches
for _, x in ipairs({-14, 14}) do
	part(park, "BenchSeat", Vector3.new(6, 1, 2), Vector3.new(x, 2, 18), C.wood, Enum.Material.Wood)
	part(park, "BenchBack", Vector3.new(6, 3, 1), Vector3.new(x, 3.5, 19), C.wood, Enum.Material.Wood)
end
-- trees
for _, t in ipairs({{-25,-25},{25,-25},{-25,25},{25,25},{-28,0},{28,0}}) do
	part(park, "Trunk", Vector3.new(2, 8, 2), Vector3.new(t[1], 5, t[2]), C.wood, Enum.Material.Wood)
	part(park, "Leaves", Vector3.new(8, 8, 8), Vector3.new(t[1], 12, t[2]), Color3.fromRGB(60, 140, 60), Enum.Material.Grass)
end

-- RADIATING PATHS from hub to plots and spawn
local paths = Instance.new("Model")
paths.Name = "Paths"
paths.Parent = workspace
part(paths, "PathN", Vector3.new(10, 1, 90), Vector3.new(0, 1, -80), C.path, Enum.Material.Concrete)
part(paths, "PathS", Vector3.new(10, 1, 90), Vector3.new(0, 1, 80), C.path, Enum.Material.Concrete)
part(paths, "PathE", Vector3.new(90, 1, 10), Vector3.new(80, 1, 0), C.path, Enum.Material.Concrete)
part(paths, "PathW", Vector3.new(90, 1, 10), Vector3.new(-80, 1, 0), C.path, Enum.Material.Concrete)
-- ring path around park
part(paths, "RingN", Vector3.new(90, 1, 8), Vector3.new(0, 1, -42), C.path, Enum.Material.Concrete)
part(paths, "RingS", Vector3.new(90, 1, 8), Vector3.new(0, 1, 42), C.path, Enum.Material.Concrete)
part(paths, "RingE", Vector3.new(8, 1, 90), Vector3.new(42, 1, 0), C.path, Enum.Material.Concrete)
part(paths, "RingW", Vector3.new(8, 1, 90), Vector3.new(-42, 1, 0), C.path, Enum.Material.Concrete)

-- TYCOON PLOTS (four corners, each with pad, dropper zone, conveyor, collector, office)
local function buildPlot(name, cx, cz, color)
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = workspace
	part(m, "PlotPad", Vector3.new(80, 1, 80), Vector3.new(cx, 1.2, cz), C.plot, Enum.Material.Concrete)
	part(m, "PlotFloor", Vector3.new(60, 0.5, 60), Vector3.new(cx, 1.6, cz), color, Enum.Material.SmoothPlastic)
	-- starter building (office)
	part(m, "OfficeWalls", Vector3.new(20, 12, 16), Vector3.new(cx - 18, 8, cz - 18), color, Enum.Material.Brick)
	part(m, "OfficeRoof", Vector3.new(24, 2, 20), Vector3.new(cx - 18, 15, cz - 18), C.roof, Enum.Material.Slate)
	-- dropper pedestal
	part(m, "DropperBase", Vector3.new(6, 10, 6), Vector3.new(cx + 10, 6.5, cz - 20), C.stone, Enum.Material.DiamondPlate)
	part(m, "DropperHead", Vector3.new(4, 3, 4), Vector3.new(cx + 10, 13, cz - 20), C.drop, Enum.Material.Neon)
	-- conveyor strip to collector
	part(m, "Conveyor", Vector3.new(30, 1, 4), Vector3.new(cx + 10, 2.2, cz + 5), Color3.fromRGB(60, 60, 60), Enum.Material.DiamondPlate)
	-- collector
	part(m, "Collector", Vector3.new(10, 10, 10), Vector3.new(cx + 10, 6.5, cz + 22), Color3.fromRGB(40, 40, 40), Enum.Material.Metal)
	part(m, "CollectorGlow", Vector3.new(8, 1, 8), Vector3.new(cx + 10, 12, cz + 22), C.drop, Enum.Material.Neon)
	-- upgrade button pads
	part(m, "ButtonPad1", Vector3.new(6, 1, 6), Vector3.new(cx - 10, 2.2, cz + 20), C.drop, Enum.Material.Neon)
	part(m, "ButtonPad2", Vector3.new(6, 1, 6), Vector3.new(cx - 10, 2.2, cz + 12), Color3.fromRGB(80, 220, 120), Enum.Material.Neon)
	return m
end
buildPlot("PlotNorth", 0, -120, C.plotA)
buildPlot("PlotEast", 120, 0, C.plotB)
buildPlot("PlotSouth", 0, 120, C.plotC)
buildPlot("PlotWest", -120, 0, C.plotD)

-- EXPANSION SPACE (outer ring, per genre: lots grow into destinations)
local expansion = Instance.new("Model")
expansion.Name = "ExpansionZone"
expansion.Parent = workspace
for _, e in ipairs({{-120,-120},{120,-120},{-120,120},{120,120}}) do
	part(expansion, "ExpansionPad", Vector3.new(50, 1, 50), Vector3.new(e[1], 1.2, e[2]), Color3.fromRGB(140, 140, 145), Enum.Material.Concrete)
end

-- LIGHTING
local light = game:GetService("Lighting")
light.Brightness = 2.2
light.Ambient = Color3.fromRGB(140, 140, 150)
light.OutdoorAmbient = Color3.fromRGB(120, 130, 140)
light.ClockTime = 14
light.GeographicLatitude = 30