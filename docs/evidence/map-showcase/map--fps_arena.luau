-- FPS Arena Map Builder
local function part(parent, name, size, pos, color, material)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Position = pos
	p.Anchored = true
	p.Color = color
	p.Material = material or Enum.Material.Concrete
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
part(ground, "Floor", Vector3.new(300, 2, 300), Vector3.new(0, -1, 0), Color3.fromRGB(105, 115, 100), Enum.Material.Grass)
part(ground, "ConcretePad", Vector3.new(120, 0.4, 120), Vector3.new(0, 0.2, 0), Color3.fromRGB(140, 140, 140), Enum.Material.Concrete)

-- ============ BOUNDARIES ============
local walls = model("Boundaries")
local wallColor = Color3.fromRGB(120, 100, 85)
part(walls, "WallN", Vector3.new(300, 24, 4), Vector3.new(0, 12, -150), wallColor)
part(walls, "WallS", Vector3.new(300, 24, 4), Vector3.new(0, 12, 150), wallColor)
part(walls, "WallE", Vector3.new(4, 24, 300), Vector3.new(150, 12, 0), wallColor)
part(walls, "WallW", Vector3.new(4, 24, 300), Vector3.new(-150, 12, 0), wallColor)
-- Wall trim
part(walls, "TrimN", Vector3.new(300, 1, 5), Vector3.new(0, 24.5, -150), Color3.fromRGB(70, 70, 75), Enum.Material.Metal)
part(walls, "TrimS", Vector3.new(300, 1, 5), Vector3.new(0, 24.5, 150), Color3.fromRGB(70, 70, 75), Enum.Material.Metal)
part(walls, "TrimE", Vector3.new(5, 1, 300), Vector3.new(150, 24.5, 0), Color3.fromRGB(70, 70, 75), Enum.Material.Metal)
part(walls, "TrimW", Vector3.new(5, 1, 300), Vector3.new(-150, 24.5, 0), Color3.fromRGB(70, 70, 75), Enum.Material.Metal)

-- ============ SPAWN AREA (Blue) ============
local spawnBlue = model("SpawnBlue")
local sp1 = Instance.new("SpawnLocation")
sp1.Name = "SpawnBlue"
sp1.Size = Vector3.new(16, 1, 16)
sp1.Position = Vector3.new(0, 1, 125)
sp1.Anchored = true
sp1.Color = Color3.fromRGB(70, 110, 200)
sp1.Material = Enum.Material.Concrete
sp1.Neutral = false
sp1.TeamColor = BrickColor.new("Bright blue")
sp1.Parent = spawnBlue
part(spawnBlue, "SpawnShelter", Vector3.new(20, 2, 20), Vector3.new(0, 12, 125), Color3.fromRGB(60, 90, 170), Enum.Material.Metal)
part(spawnBlue, "ShelterPost1", Vector3.new(2, 11, 2), Vector3.new(-8, 6, 116), Color3.fromRGB(60, 90, 170), Enum.Material.Metal)
part(spawnBlue, "ShelterPost2", Vector3.new(2, 11, 2), Vector3.new(8, 6, 116), Color3.fromRGB(60, 90, 170), Enum.Material.Metal)
part(spawnBlue, "ShelterPost3", Vector3.new(2, 11, 2), Vector3.new(-8, 6, 134), Color3.fromRGB(60, 90, 170), Enum.Material.Metal)
part(spawnBlue, "ShelterPost4", Vector3.new(2, 11, 2), Vector3.new(8, 6, 134), Color3.fromRGB(60, 90, 170), Enum.Material.Metal)
-- Spawn cover
part(spawnBlue, "Cover1", Vector3.new(8, 5, 2), Vector3.new(-20, 2.5, 110), Color3.fromRGB(90, 90, 95), Enum.Material.Concrete)
part(spawnBlue, "Cover2", Vector3.new(8, 5, 2), Vector3.new(20, 2.5, 110), Color3.fromRGB(90, 90, 95), Enum.Material.Concrete)

-- ============ SPAWN AREA (Red) ============
local spawnRed = model("SpawnRed")
local sp2 = Instance.new("SpawnLocation")
sp2.Name = "SpawnRed"
sp2.Size = Vector3.new(16, 1, 16)
sp2.Position = Vector3.new(0, 1, -125)
sp2.Anchored = true
sp2.Color = Color3.fromRGB(200, 70, 70)
sp2.Material = Enum.Material.Concrete
sp2.Neutral = false
sp2.TeamColor = BrickColor.new("Bright red")
sp2.Parent = spawnRed
part(spawnRed, "SpawnShelter", Vector3.new(20, 2, 20), Vector3.new(0, 12, -125), Color3.fromRGB(170, 60, 60), Enum.Material.Metal)
part(spawnRed, "ShelterPost1", Vector3.new(2, 11, 2), Vector3.new(-8, 6, -116), Color3.fromRGB(170, 60, 60), Enum.Material.Metal)
part(spawnRed, "ShelterPost2", Vector3.new(2, 11, 2), Vector3.new(8, 6, -116), Color3.fromRGB(170, 60, 60), Enum.Material.Metal)
part(spawnRed, "ShelterPost3", Vector3.new(2, 11, 2), Vector3.new(-8, 6, -134), Color3.fromRGB(170, 60, 60), Enum.Material.Metal)
part(spawnRed, "ShelterPost4", Vector3.new(2, 11, 2), Vector3.new(8, 6, -134), Color3.fromRGB(170, 60, 60), Enum.Material.Metal)
part(spawnRed, "Cover1", Vector3.new(8, 5, 2), Vector3.new(-20, 2.5, -110), Color3.fromRGB(90, 90, 95), Enum.Material.Concrete)
part(spawnRed, "Cover2", Vector3.new(8, 5, 2), Vector3.new(20, 2.5, -110), Color3.fromRGB(90, 90, 95), Enum.Material.Concrete)

-- ============ CENTRAL STRUCTURE ============
local center = model("CenterTower")
local metal = Color3.fromRGB(100, 105, 110)
part(center, "Base", Vector3.new(30, 1, 30), Vector3.new(0, 0.5, 0), metal, Enum.Material.Metal)
part(center, "Core", Vector3.new(14, 14, 14), Vector3.new(0, 8, 0), Color3.fromRGB(130, 135, 140), Enum.Material.Metal)
part(center, "UpperDeck", Vector3.new(34, 1, 34), Vector3.new(0, 15.5, 0), metal, Enum.Material.Metal)
part(center, "DeckRailN", Vector3.new(34, 3, 1), Vector3.new(0, 17.5, -16.5), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
part(center, "DeckRailS", Vector3.new(34, 3, 1), Vector3.new(0, 17.5, 16.5), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
part(center, "DeckRailE", Vector3.new(1, 3, 34), Vector3.new(16.5, 17.5, 0), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
part(center, "DeckRailW", Vector3.new(1, 3, 34), Vector3.new(-16.5, 17.5, 0), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
-- Ramps up to deck (N and S sides)
local rampN = part(center, "RampN", Vector3.new(8, 1, 24), Vector3.new(0, 8, -28), Color3.fromRGB(120, 125, 130), Enum.Material.Metal)
rampN.Orientation = Vector3.new(-18, 0, 0)
local rampS = part(center, "RampS", Vector3.new(8, 1, 24), Vector3.new(0, 8, 28), Color3.fromRGB(120, 125, 130), Enum.Material.Metal)
rampS.Orientation = Vector3.new(18, 0, 0)
-- Core windows (shooting slits)
part(center, "SlitN", Vector3.new(10, 2, 1), Vector3.new(0, 10, -7.2), Color3.fromRGB(40, 45, 50), Enum.Material.Glass)
part(center, "SlitS", Vector3.new(10, 2, 1), Vector3.new(0, 10, 7.2), Color3.fromRGB(40, 45, 50), Enum.Material.Glass)

-- ============ SIDE BUNKERS ============
local bunkers = model("SideBunkers")
local function bunker(x, z, name)
	local b = model(name)
	b.Parent = bunkers
	part(b, "Floor", Vector3.new(24, 1, 24), Vector3.new(x, 0.5, z), Color3.fromRGB(110, 110, 115), Enum.Material.Concrete)
	part(b, "BackWall", Vector3.new(24, 10, 2), Vector3.new(x, 6, z - 11), Color3.fromRGB(125, 120, 110), Enum.Material.Concrete)
	part(b, "SideWallL", Vector3.new(2, 10, 24), Vector3.new(x - 11, 6, z), Color3.fromRGB(125, 120, 110), Enum.Material.Concrete)
	part(b, "SideWallR", Vector3.new(2, 10, 24), Vector3.new(x + 11, 6, z), Color3.fromRGB(125, 120, 110), Enum.Material.Concrete)
	part(b, "FrontWallLow", Vector3.new(24, 4, 2), Vector3.new(x, 3, z + 11), Color3.fromRGB(125, 120, 110), Enum.Material.Concrete)
	part(b, "Roof", Vector3.new(26, 1, 26), Vector3.new(x, 11.5, z), Color3.fromRGB(90, 95, 100), Enum.Material.Metal)
	-- ramp to roof
	local r = part(b, "RoofRamp", Vector3.new(6, 1, 18), Vector3.new(x, 6, z + 20), Color3.fromRGB(120, 125, 130), Enum.Material.Metal)
	r.Orientation = Vector3.new(18, 0, 0)
end
bunker(-95, 0, "BunkerWest")
bunker(95, 0, "BunkerEast")

-- ============ COVER CRATES ============
local crates = model("CoverCrates")
local crateColor = Color3.fromRGB(150, 115, 70)
local crateSpots = {
	{-40, 60}, {-55, 45}, {40, 60}, {55, 45},
	{-40, -60}, {-55, -45}, {40, -60}, {55, -45},
	{-70, 80}, {70, 80}, {-70, -80}, {70, -80},
	{0, 70}, {0, -70}, {-90, 40}, {90, 40}, {-90, -40}, {90, -40},
}
for i, spot in ipairs(crateSpots) do
	local h = 4 + (i % 3) * 1.5
	part(crates, "Crate" .. i, Vector3.new(6, h, 6), Vector3.new(spot[1], h / 2, spot[2]), crateColor, Enum.Material.WoodPlanks)
end
-- Low sandbag lines
local sandbag = Color3.fromRGB(160, 150, 110)
part(crates, "SandbagLine1", Vector3.new(20, 3, 3), Vector3.new(-30, 1.5, 20), sandbag, Enum.Material.Fabric)
part(crates, "SandbagLine2", Vector3.new(20, 3, 3), Vector3.new(30, 1.5, -20), sandbag, Enum.Material.Fabric)
part(crates, "SandbagLine3", Vector3.new(3, 3, 20), Vector3.new(20, 1.5, -30), sandbag, Enum.Material.Fabric)
part(crates, "SandbagLine4", Vector3.new(3, 3, 20), Vector3.new(-20, 1.5, 30), sandbag, Enum.Material.Fabric)

-- ============ CATWALKS (E-W circulation) ============
local catwalks = model("Catwalks")
part(catwalks, "CatwalkW", Vector3.new(60, 1, 6), Vector3.new(-70, 10, 0), metal, Enum.Material.Metal)
part(catwalks, "CatwalkE", Vector3.new(60, 1, 6), Vector3.new(70, 10, 0), metal, Enum.Material.Metal)
part(catwalks, "RailW1", Vector3.new(60, 2, 1), Vector3.new(-70, 11.5, -3), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
part(catwalks, "RailW2", Vector3.new(60, 2, 1), Vector3.new(-70, 11.5, 3), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
part(catwalks, "RailE1", Vector3.new(60, 2, 1), Vector3.new(70, 11.5, -3), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
part(catwalks, "RailE2", Vector3.new(60, 2, 1), Vector3.new(70, 11.5, 3), Color3.fromRGB(70, 75, 80), Enum.Material.Metal)
-- Support legs
for _, x in ipairs({-95, -70, -45}) do
	part(catwalks, "LegW" .. x, Vector3.new(2, 10, 2), Vector3.new(x, 5, 0), Color3.fromRGB(80, 85, 90), Enum.Material.Metal)
end
for _, x in ipairs({45, 70, 95}) do
	part(catwalks, "LegE" .. x, Vector3.new(2, 10, 2), Vector3.new(x, 5, 0), Color3.fromRGB(80, 85, 90), Enum.Material.Metal)
end
-- Stairs to catwalks
local stairW = part(catwalks, "StairW", Vector3.new(6, 1, 22), Vector3.new(-45, 5, 16), Color3.fromRGB(120, 125, 130), Enum.Material.Metal)
stairW.Orientation = Vector3.new(24, 0, 0)
local stairE = part(catwalks, "StairE", Vector3.new(6, 1, 22), Vector3.new(45, 5, -16), Color3.fromRGB(120, 125, 130), Enum.Material.Metal)
stairE.Orientation = Vector3.new(-24, 0, 0)

-- ============ LIGHTING ============
local lighting = game:GetService("Lighting")
lighting.Brightness = 2.2
lighting.Ambient = Color3.fromRGB(90, 95, 100)
lighting.OutdoorAmbient = Color3.fromRGB(120, 125, 130)
lighting.ClockTime = 14
lighting.GeographicLatitude = 20
lighting.ExposureCompensation = 0.1
local atmo = Instance.new("Atmosphere")
atmo.Density = 0.3
atmo.Color = Color3.fromRGB(199, 199, 199)
atmo.Haze = 1.5
atmo.Parent = lighting

print("FPS Arena map built.")