-- Racing map: circuit loop with start/finish straight, banked-ish corners, pit lane, grandstand
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

local map = Instance.new("Model")
map.Name = "RacingMap"
map.Parent = workspace

-- GROUND
local ground = Instance.new("Model")
ground.Name = "Ground"
ground.Parent = map
part(ground, "Terrain", Vector3.new(600, 4, 600), Vector3.new(0, -2, 0), Color3.fromRGB(96, 140, 70), Enum.Material.Grass)
part(ground, "Infield", Vector3.new(180, 1, 180), Vector3.new(0, 0.5, 0), Color3.fromRGB(110, 155, 78), Enum.Material.Grass)

-- BOUNDARIES
local bounds = Instance.new("Model")
bounds.Name = "Boundaries"
bounds.Parent = map
local wallColor = Color3.fromRGB(120, 120, 130)
part(bounds, "WallN", Vector3.new(600, 12, 4), Vector3.new(0, 6, -298), wallColor)
part(bounds, "WallS", Vector3.new(600, 12, 4), Vector3.new(0, 6, 298), wallColor)
part(bounds, "WallE", Vector3.new(4, 12, 600), Vector3.new(298, 6, 0), wallColor)
part(bounds, "WallW", Vector3.new(4, 12, 600), Vector3.new(-298, 6, 0), wallColor)

-- TRACK (oval circuit, asphalt segments)
local track = Instance.new("Model")
track.Name = "Track"
track.Parent = map
local asphalt = Color3.fromRGB(55, 55, 60)
local trackMat = Enum.Material.Asphalt
local W = 24 -- track width
-- Start/finish straight (south, z = 220)
part(track, "StraightS", Vector3.new(360, 1, W), Vector3.new(0, 0.5, 220), asphalt, trackMat)
-- North straight
part(track, "StraightN", Vector3.new(360, 1, W), Vector3.new(0, 0.5, -220), asphalt, trackMat)
-- East straight (vertical connector)
part(track, "StraightE", Vector3.new(W, 1, 200), Vector3.new(170, 0.5, 0), asphalt, trackMat)
-- West straight
part(track, "StraightW", Vector3.new(W, 1, 200), Vector3.new(-170, 0.5, 0), asphalt, trackMat)
-- Corner pads to join straights
part(track, "CornerNE", Vector3.new(W + 20, 1, W + 20), Vector3.new(170, 0.5, -220), asphalt, trackMat)
part(track, "CornerNW", Vector3.new(W + 20, 1, W + 20), Vector3.new(-170, 0.5, -220), asphalt, trackMat)
part(track, "CornerSE", Vector3.new(W + 20, 1, W + 20), Vector3.new(170, 0.5, 220), asphalt, trackMat)
part(track, "CornerSW", Vector3.new(W + 20, 1, W + 20), Vector3.new(-170, 0.5, 220), asphalt, trackMat)
-- Center line dashes on main straight
for i = -8, 8 do
	part(track, "Dash" .. i, Vector3.new(8, 0.2, 1.2), Vector3.new(i * 20, 1.1, 220), Color3.fromRGB(240, 240, 240))
end

-- START/FINISH
local startArea = Instance.new("Model")
startArea.Name = "StartFinish"
startArea.Parent = map
part(startArea, "FinishLine", Vector3.new(W, 0.2, 6), Vector3.new(0, 1.15, 220), Color3.fromRGB(255, 255, 255))
for i = 0, 7 do
	part(startArea, "Checker" .. i, Vector3.new(3, 0.25, 3),
		Vector3.new(-10.5 + i * 3, 1.3, 220), (i % 2 == 0) and Color3.fromRGB(20, 20, 20) or Color3.fromRGB(255, 255, 255))
end
-- Start gantry
part(startArea, "GantryL", Vector3.new(2, 14, 2), Vector3.new(-13, 7, 220), Color3.fromRGB(200, 40, 40))
part(startArea, "GantryR", Vector3.new(2, 14, 2), Vector3.new(13, 7, 220), Color3.fromRGB(200, 40, 40))
part(startArea, "GantryTop", Vector3.new(30, 2, 3), Vector3.new(0, 14, 220), Color3.fromRGB(200, 40, 40))
-- SpawnLocation on the grid
local spawn = Instance.new("SpawnLocation")
spawn.Size = Vector3.new(8, 1, 8)
spawn.Position = Vector3.new(0, 1.5, 232)
spawn.Anchored = true
spawn.Color = Color3.fromRGB(90, 170, 255)
spawn.Material = Enum.Material.Concrete
spawn.Neutral = true
spawn.Duration = 0
spawn.Parent = startArea

-- BARRIERS along track edges
local barriers = Instance.new("Model")
barriers.Name = "Barriers"
barriers.Parent = map
local barColor = Color3.fromRGB(235, 235, 235)
local redBar = Color3.fromRGB(200, 50, 50)
-- Inner barrier ring (offset 14 from centerline)
for _, seg in ipairs({
	{Vector3.new(340, 3, 2), Vector3.new(0, 1.5, 206)},
	{Vector3.new(340, 3, 2), Vector3.new(0, 1.5, -206)},
	{Vector3.new(2, 3, 172), Vector3.new(156, 1.5, 0)},
	{Vector3.new(2, 3, 172), Vector3.new(-156, 1.5, 0)},
}) do
	part(barriers, "Inner", seg[1], seg[2], redBar)
end
-- Outer barrier ring
for _, seg in ipairs({
	{Vector3.new(340, 3, 2), Vector3.new(0, 1.5, 234)},
	{Vector3.new(340, 3, 2), Vector3.new(0, 1.5, -234)},
	{Vector3.new(2, 3, 172), Vector3.new(184, 1.5, 0)},
	{Vector3.new(2, 3, 172), Vector3.new(-184, 1.5, 0)},
}) do
	part(barriers, "Outer", seg[1], seg[2], barColor)
end

-- PIT LANE (parallel to main straight, north side of it)
local pit = Instance.new("Model")
pit.Name = "PitLane"
pit.Parent = map
part(pit, "PitRoad", Vector3.new(200, 1, 14), Vector3.new(0, 0.5, 250), Color3.fromRGB(70, 70, 75), Enum.Material.Concrete)
for i = 0, 4 do
	local x = -80 + i * 40
	part(pit, "PitGarage" .. i, Vector3.new(24, 10, 14), Vector3.new(x, 5, 268), Color3.fromRGB(150, 150, 160), Enum.Material.Metal)
	part(pit, "PitRoof" .. i, Vector3.new(26, 1, 16), Vector3.new(x, 10.5, 268), Color3.fromRGB(60, 60, 70), Enum.Material.Metal)
	part(pit, "PitBox" .. i, Vector3.new(6, 0.2, 6), Vector3.new(x, 1.1, 250), Color3.fromRGB(255, 200, 40))
end

-- GRANDSTAND (west side)
local stands = Instance.new("Model")
stands.Name = "Grandstand"
stands.Parent = map
for i = 0, 5 do
	part(stands, "Row" .. i, Vector3.new(80, 2, 6), Vector3.new(-230, 1 + i * 2, 40 - i * 6),
		(i % 2 == 0) and Color3.fromRGB(70, 90, 160) or Color3.fromRGB(90, 110, 180), Enum.Material.Concrete)
end
part(stands, "StandRoof", Vector3.new(84, 1, 50), Vector3.new(-230, 16, 25), Color3.fromRGB(50, 50, 60), Enum.Material.Metal)
for _, x in ipairs({-265, -230, -195}) do
	part(stands, "RoofPillar", Vector3.new(2, 16, 2), Vector3.new(x, 8, 2), Color3.fromRGB(80, 80, 90), Enum.Material.Metal)
end

-- CIRCULATION: access roads connecting spawn/pit/stands to track
local access = Instance.new("Model")
access.Name = "Access"
access.Parent = map
part(access, "PitEntry", Vector3.new(14, 1, 30), Vector3.new(100, 0.5, 237), Color3.fromRGB(70, 70, 75), Enum.Material.Concrete)
part(access, "PitExit", Vector3.new(14, 1, 30), Vector3.new(-100, 0.5, 237), Color3.fromRGB(70, 70, 75), Enum.Material.Concrete)
part(access, "Walkway", Vector3.new(60, 1, 8), Vector3.new(-190, 0.5, 100), Color3.fromRGB(160, 160, 160), Enum.Material.Concrete)

-- LOW-POLY PROPS: trees, tire stacks, light poles, checkpoint arches
local props = Instance.new("Model")
props.Name = "Props"
props.Parent = map
-- Trees in infield
for i = 0, 7 do
	local x = -60 + (i % 4) * 40
	local z = -60 + math.floor(i / 4) * 90
	part(props, "Trunk" .. i, Vector3.new(2, 8, 2), Vector3.new(x, 4, z), Color3.fromRGB(100, 70, 45), Enum.Material.Wood)
	part(props, "Leaves" .. i, Vector3.new(8, 8, 8), Vector3.new(x, 10, z), Color3.fromRGB(50, 130, 55), Enum.Material.Grass)
end
-- Tire stacks at corners
for _, c in ipairs({Vector3.new(170, 0, -200), Vector3.new(-170, 0, -200), Vector3.new(170, 0, 200), Vector3.new(-170, 0, 200)}) do
	for lvl = 0, 2 do
		part(props, "Tires", Vector3.new(6, 2, 6), Vector3.new(c.X, 1 + lvl * 2, c.Z), Color3.fromRGB(30, 30, 30), Enum.Material.Rubber)
	end
end
-- Light poles around track
for _, lp in ipairs({Vector3.new(-120, 0, 240), Vector3.new(120, 0, 240), Vector3.new(-120, 0, -240), Vector3.new(120, 0, -240), Vector3.new(190, 0, -100), Vector3.new(-190, 0, 100)}) do
	part(props, "Pole", Vector3.new(1, 18, 1), Vector3.new(lp.X, 9, lp.Z), Color3.fromRGB(90, 90, 95), Enum.Material.Metal)
	part(props, "Lamp", Vector3.new(4, 1, 2), Vector3.new(lp.X, 18.5, lp.Z), Color3.fromRGB(255, 240, 180), Enum.Material.Neon)
end
-- Checkpoint arches (mid-lap markers)
for _, cp in ipairs({Vector3.new(170, 0, -110), Vector3.new(0, 0, -220), Vector3.new(-170, 0, 110)}) do
	part(props, "ArchL", Vector3.new(2, 12, 2), Vector3.new(cp.X - 13, 6, cp.Z), Color3.fromRGB(255, 170, 0))
	part(props, "ArchR", Vector3.new(2, 12, 2), Vector3.new(cp.X + 13, 6, cp.Z), Color3.fromRGB(255, 170, 0))
	part(props, "ArchTop", Vector3.new(28, 2, 2), Vector3.new(cp.X, 12.5, cp.Z), Color3.fromRGB(255, 170, 0))
end
-- Distance boards on main straight (100m braking markers)
for i = 1, 3 do
	part(props, "Board" .. i, Vector3.new(4, 4, 1), Vector3.new(60 + i * 20, 4, 204), Color3.fromRGB(255, 255, 60))
end

-- LIGHTING
local lighting = game:GetService("Lighting")
lighting.ClockTime = 14
lighting.Brightness = 2.4
lighting.Ambient = Color3.fromRGB(120, 120, 130)
lighting.OutdoorAmbient = Color3.fromRGB(140, 145, 155)
lighting.EnvironmentDiffuseScale = 0.6
lighting.EnvironmentSpecularScale = 0.4