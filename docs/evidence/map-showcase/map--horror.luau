-- HORROR MANSION MAP — symmetrical foyer, central stair, arches, galleries, fog grounds
local function part(parent, name, size, pos, color, material)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Position = pos
	p.Anchored = true
	p.Color = color
	p.Material = material or Enum.Material.Slate
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local GRAY = Color3.fromRGB(60, 60, 65)
local DARKWOOD = Color3.fromRGB(72, 48, 32)
local STONE = Color3.fromRGB(85, 85, 90)
local FLOORC = Color3.fromRGB(55, 45, 40)
local RED = Color3.fromRGB(120, 20, 20)
local GREEN = Color3.fromRGB(30, 60, 30)

-- ============ GROUNDS ============
local grounds = Instance.new("Model")
grounds.Name = "FogGrounds"
grounds.Parent = workspace

part(grounds, "Ground", Vector3.new(400, 2, 400), Vector3.new(0, -1, 0), Color3.fromRGB(35, 40, 35), Enum.Material.Grass)
part(grounds, "PathMain", Vector3.new(12, 0.4, 90), Vector3.new(0, 0.2, 130), Color3.fromRGB(50, 48, 45), Enum.Material.Cobblestone)
part(grounds, "PathEast", Vector3.new(70, 0.4, 10), Vector3.new(60, 0.2, 100), Color3.fromRGB(50, 48, 45), Enum.Material.Cobblestone)
part(grounds, "PathWest", Vector3.new(70, 0.4, 10), Vector3.new(-60, 0.2, 100), Color3.fromRGB(50, 48, 45), Enum.Material.Cobblestone)

-- Perimeter walls (circular-ish ring of segments)
for i = 1, 24 do
	local a = (i / 24) * math.pi * 2
	local w = part(grounds, "Perimeter" .. i, Vector3.new(52, 14, 4), Vector3.new(math.sin(a) * 190, 7, math.cos(a) * 190), Color3.fromRGB(40, 42, 45), Enum.Material.Concrete)
	w.Orientation = Vector3.new(0, math.deg(a), 0)
end

-- Dead trees
for _, xz in ipairs({{40,150},{-45,155},{70,120},{-70,125},{90,160},{-95,158},{30,180},{-35,182}}) do
	local t = Instance.new("Model"); t.Name = "DeadTree"; t.Parent = grounds
	part(t, "Trunk", Vector3.new(2, 16, 2), Vector3.new(xz[1], 8, xz[2]), Color3.fromRGB(45, 35, 28), Enum.Material.Wood)
	part(t, "Branch1", Vector3.new(8, 1.5, 1.5), Vector3.new(xz[1] + 3, 13, xz[2]), Color3.fromRGB(45, 35, 28), Enum.Material.Wood).Orientation = Vector3.new(0, 0, 25)
	part(t, "Branch2", Vector3.new(7, 1.5, 1.5), Vector3.new(xz[1] - 3, 10.5, xz[2]), Color3.fromRGB(45, 35, 28), Enum.Material.Wood).Orientation = Vector3.new(0, 0, -30)
end

-- ============ SPAWN ============
local spawnModel = Instance.new("Model"); spawnModel.Name = "Spawn"; spawnModel.Parent = workspace
local sp = Instance.new("SpawnLocation")
sp.Size = Vector3.new(10, 1, 10)
sp.Position = Vector3.new(0, 0.5, 185)
sp.Anchored = true
sp.Color = Color3.fromRGB(70, 70, 75)
sp.Material = Enum.Material.Cobblestone
sp.Neutral = true
sp.Parent = spawnModel
part(spawnModel, "GateArchL", Vector3.new(3, 18, 3), Vector3.new(-7, 9, 178), STONE, Enum.Material.Concrete)
part(spawnModel, "GateArchR", Vector3.new(3, 18, 3), Vector3.new(7, 9, 178), STONE, Enum.Material.Concrete)
part(spawnModel, "GateTop", Vector3.new(17, 3, 3), Vector3.new(0, 18.5, 178), STONE, Enum.Material.Concrete)

-- ============ MANSION ============
local m = Instance.new("Model"); m.Name = "Mansion"; m.Parent = workspace

-- Foundation & ground floor
part(m, "Foundation", Vector3.new(90, 2, 70), Vector3.new(0, 0, 60), GRAY, Enum.Material.Concrete)
part(m, "FoyerFloor", Vector3.new(80, 0.5, 60), Vector3.new(0, 1.25, 60), FLOORC, Enum.Material.WoodPlanks)
part(m, "FrontStep", Vector3.new(20, 1, 6), Vector3.new(0, 0.5, 97), STONE, Enum.Material.Concrete)

-- Front facade with symmetrical arches
part(m, "FrontWallL", Vector3.new(30, 22, 3), Vector3.new(-25, 12, 90), GRAY, Enum.Material.Brick)
part(m, "FrontWallR", Vector3.new(30, 22, 3), Vector3.new(25, 12, 90), GRAY, Enum.Material.Brick)
part(m, "FrontWallTop", Vector3.new(80, 6, 3), Vector3.new(0, 25, 90), GRAY, Enum.Material.Brick)
part(m, "FrontDoorL", Vector3.new(8, 14, 1), Vector3.new(-5, 8, 90), DARKWOOD, Enum.Material.Wood)
part(m, "FrontDoorR", Vector3.new(8, 14, 1), Vector3.new(5, 8, 90), DARKWOOD, Enum.Material.Wood)
part(m, "DoorFrame", Vector3.new(20, 3, 3), Vector3.new(0, 16.5, 90), DARKWOOD, Enum.Material.Wood)
-- repeated arches flanking the door
for _, x in ipairs({-25, -15, 15, 25}) do
	part(m, "ArchColL" .. x, Vector3.new(2, 14, 2), Vector3.new(x - 3, 8, 90), STONE, Enum.Material.Concrete)
	part(m, "ArchColR" .. x, Vector3.new(2, 14, 2), Vector3.new(x + 3, 8, 90), STONE, Enum.Material.Concrete)
	part(m, "ArchTop" .. x, Vector3.new(8, 2, 2), Vector3.new(x, 15.5, 90), STONE, Enum.Material.Concrete)
end

-- Side walls, back wall
part(m, "WallWest", Vector3.new(3, 22, 60), Vector3.new(-40, 12, 60), GRAY, Enum.Material.Brick)
part(m, "WallEast", Vector3.new(3, 22, 60), Vector3.new(40, 12, 60), GRAY, Enum.Material.Brick)
part(m, "WallBack", Vector3.new(80, 22, 3), Vector3.new(0, 12, 30), GRAY, Enum.Material.Brick)

-- Central grand stair (readable landmark)
local stair = Instance.new("Model"); stair.Name = "GrandStair"; stair.Parent = m
for i = 1, 10 do
	part(stair, "Step" .. i, Vector3.new(16, 1, 2), Vector3.new(0, i * 1 - 0.5, 62 - i * 2), DARKWOOD, Enum.Material.WoodPlanks)
end
part(stair, "RailL", Vector3.new(1, 2, 22), Vector3.new(-8, 12, 52), DARKWOOD, Enum.Material.Wood).Orientation = Vector3.new(-42, 0, 0)
part(stair, "RailR", Vector3.new(1, 2, 22), Vector3.new(8, 12, 52), DARKWOOD, Enum.Material.Wood).Orientation = Vector3.new(-42, 0, 0)

-- Upper gallery floor (second floor ring around stair well)
part(m, "GalleryFloor", Vector3.new(80, 1, 24), Vector3.new(0, 21.5, 42), FLOORC, Enum.Material.WoodPlanks)
part(m, "GalleryFloorFront", Vector3.new(24, 1, 22), Vector3.new(-28, 21.5, 65), FLOORC, Enum.Material.WoodPlanks)
part(m, "GalleryFloorFrontR", Vector3.new(24, 1, 22), Vector3.new(28, 21.5, 65), FLOORC, Enum.Material.WoodPlanks)
-- gallery railing with repeated balusters
part(m, "GalleryRail", Vector3.new(80, 1, 1), Vector3.new(0, 25, 31), DARKWOOD, Enum.Material.Wood)
for x = -36, 36, 4 do
	part(m, "Baluster" .. x, Vector3.new(0.8, 3, 0.8), Vector3.new(x, 23.5, 31), DARKWOOD, Enum.Material.Wood)
end
part(m, "GalleryRailW", Vector3.new(1, 1, 22), Vector3.new(-39, 25, 42), DARKWOOD, Enum.Material.Wood)
part(m, "GalleryRailE", Vector3.new(1, 1, 22), Vector3.new(39, 25, 42), DARKWOOD, Enum.Material.Wood)
part(m, "GalleryRailFW", Vector3.new(1, 1, 22), Vector3.new(-16, 25, 65), DARKWOOD, Enum.Material.Wood)
part(m, "GalleryRailFE", Vector3.new(1, 1, 22), Vector3.new(16, 25, 65), DARKWOOD, Enum.Material.Wood)

-- Upper walls & roof
part(m, "UpperWallBack", Vector3.new(80, 14, 3), Vector3.new(0, 29.5, 30), GRAY, Enum.Material.Brick)
part(m, "UpperWallWest", Vector3.new(3, 14, 60), Vector3.new(-40, 29.5, 60), GRAY, Enum.Material.Brick)
part(m, "UpperWallEast", Vector3.new(3, 14, 60), Vector3.new(40, 29.5, 60), GRAY, Enum.Material.Brick)
part(m, "UpperWallFrontL", Vector3.new(30, 14, 3), Vector3.new(-25, 29.5, 90), GRAY, Enum.Material.Brick)
part(m, "UpperWallFrontR", Vector3.new(30, 14, 3), Vector3.new(25, 29.5, 90), GRAY, Enum.Material.Brick)
part(m, "UpperWallFrontTop", Vector3.new(80, 4, 3), Vector3.new(0, 36.5, 90), GRAY, Enum.Material.Brick)
part(m, "RoofL", Vector3.new(46, 2, 74), Vector3.new(-21, 44, 60), Color3.fromRGB(50, 30, 30), Enum.Material.Slate).Orientation = Vector3.new(0, 0, 28)
part(m, "RoofR", Vector3.new(46, 2, 74), Vector3.new(21, 44, 60), Color3.fromRGB(50, 30, 30), Enum.Material.Slate).Orientation = Vector3.new(0, 0, -28)
part(m, "RoofRidge", Vector3.new(3, 2, 74), Vector3.new(0, 51, 60), Color3.fromRGB(40, 25, 25), Enum.Material.Slate)
part(m, "Chimney", Vector3.new(6, 16, 6), Vector3.new(-24, 50, 45), Color3.fromRGB(70, 40, 35), Enum.Material.Brick)

-- Interior corridor walls (ground floor circulation)
part(m, "CorridorWallW", Vector3.new(2, 22, 24), Vector3.new(-14, 12, 48), GRAY, Enum.Material.Brick)
part(m, "CorridorWallE", Vector3.new(2, 22, 24), Vector3.new(14, 12, 48), GRAY, Enum.Material.Brick)
part(m, "HallFloor", Vector3.new(26, 0.5, 26), Vector3.new(0, 1.25, 40), Color3.fromRGB(45, 40, 45), Enum.Material.Marble)

-- ============ FURNISHINGS / PROPS ============
local props = Instance.new("Model"); props.Name = "Props"; props.Parent = workspace

-- Foyer chandelier frame + candles
part(props, "ChandelierChain", Vector3.new(0.5, 6, 0.5), Vector3.new(0, 30, 60), Color3.fromRGB(40, 40, 40), Enum.Material.Metal)
part(props, "ChandelierRing", Vector3.new(8, 0.8, 8), Vector3.new(0, 27, 60), Color3.fromRGB(50, 40, 20), Enum.Material.Metal)
for i = 1, 6 do
	local a = (i / 6) * math.pi * 2
	part(props, "Candle" .. i, Vector3.new(0.6, 2, 0.6), Vector3.new(math.sin(a) * 3.5, 28, 60 + math.cos(a) * 3.5), Color3.fromRGB(230, 220, 180), Enum.Material.SmoothPlastic)
end

-- Long dining table + chairs (west room)
part(props, "Table", Vector3.new(4, 1, 18), Vector3.new(-28, 4, 60), DARKWOOD, Enum.Material.Wood)
for z = 52, 68, 4 do
	part(props, "Chair" .. z, Vector3.new(2, 4, 2), Vector3.new(-24, 3.5, z), DARKWOOD, Enum.Material.Wood)
	part(props, "ChairB" .. z, Vector3.new(2, 4, 2), Vector3.new(-32, 3.5, z), DARKWOOD, Enum.Material.Wood)
end
-- Candelabra on table
part(props, "Candelabra", Vector3.new(1, 3, 1), Vector3.new(-28, 6, 60), Color3.fromRGB(80, 65, 25), Enum.Material.Metal)
part(props, "CandleFlame", Vector3.new(0.5, 1, 0.5), Vector3.new(-28, 8, 60), Color3.fromRGB(255, 200, 80), Enum.Material.Neon)

-- Bookshelves (east library)
for z = 50, 70, 6 do
	part(props, "Shelf" .. z, Vector3.new(2, 14, 5), Vector3.new(36, 9, z), DARKWOOD, Enum.Material.Wood)
end
part(props, "LibraryTable", Vector3.new(6, 1, 6), Vector3.new(28, 4, 60), DARKWOOD, Enum.Material.Wood)

-- Portraits in foyer
for _, x in ipairs({-30, -20, 20, 30}) do
	part(props, "Portrait" .. x, Vector3.new(5, 7, 0.5), Vector3.new(x, 14, 88.8), Color3.fromRGB(90, 70, 40), Enum.Material.Wood)
	part(props, "PortraitFace" .. x, Vector3.new(3.5, 5, 0.3), Vector3.new(x, 14, 88.4), Color3.fromRGB(30, 25, 20), Enum.Material.SmoothPlastic)
end

-- ============ GRAVEYARD (west approach) ============
local grave = Instance.new("Model"); grave.Name = "Graveyard"; grave.Parent = workspace
part(grave, "GravePlot", Vector3.new(50, 0.4, 40), Vector3.new(-70, 0.2, 140), Color3.fromRGB(40, 45, 40), Enum.Material.Grass)
part(grave, "FenceN", Vector3.new(50, 4, 1), Vector3.new(-70, 2, 160), Color3.fromRGB(50, 50, 55), Enum.Material.Metal)
part(grave, "FenceS", Vector3.new(50, 4, 1), Vector3.new(-70, 2, 120), Color3.fromRGB(50, 50, 55), Enum.Material.Metal)
part(grave, "FenceW", Vector3.new(1, 4, 40), Vector3.new(-95, 2, 140), Color3.fromRGB(50, 50, 55), Enum.Material.Metal)
for x = -90, -50, 8 do
	for z = 128, 152, 8 do
		part(grave, "Headstone" .. x .. "_" .. z, Vector3.new(3, 5, 1), Vector3.new(x, 3, z), STONE, Enum.Material.Slate).Orientation = Vector3.new(math.random(-8, 8), math.random(-15, 15), math.random(-10, 4))
	end
end
part(grave, "Crypt", Vector3.new(12, 10, 10), Vector3.new(-85, 5, 145), GRAY, Enum.Material.Concrete)
part(grave, "CryptRoof", Vector3.new(14, 2, 12), Vector3.new(-85, 11, 145), Color3.fromRGB(45, 45, 50), Enum.Material.Slate)
part(grave, "CryptDoor", Vector3.new(4, 7, 1), Vector3.new(-79, 3.5, 145), Color3.fromRGB(30, 30, 30), Enum.Material.Metal)

-- ============ RITUAL CIRCLE (east approach) ============
local ritual = Instance.new("Model"); ritual.Name = "RitualCircle"; ritual.Parent = workspace
part(ritual, "CircleBase", Vector3.new(24, 0.4, 24), Vector3.new(70, 0.2, 140), Color3.fromRGB(45, 40, 40), Enum.Material.Cobblestone)
for i = 1, 8 do
	local a = (i / 8) * math.pi * 2
	part(ritual, "Monolith" .. i, Vector3.new(3, 12, 2), Vector3.new(70 + math.sin(a) * 10, 6, 140 + math.cos(a) * 10), STONE, Enum.Material.Slate).Orientation = Vector3.new(0, math.deg(a) + 90, math.random(-5, 5))
end
part(ritual, "Altar", Vector3.new(6, 3, 4), Vector3.new(70, 2, 140), STONE, Enum.Material.Slate)
part(ritual, "RuneGlow", Vector3.new(10, 0.2, 10), Vector3.new(70, 0.5, 140), RED, Enum.Material.Neon)

-- ============ LIGHTING ============
local light = game:GetService("Lighting")
light.ClockTime = 0
light.Ambient = Color3.fromRGB(15, 15, 20)
light.OutdoorAmbient = Color3.fromRGB(20, 20, 30)
light.FogColor = Color3.fromRGB(10, 12, 15)
light.FogEnd = 180
light.Brightness = 0.6
light.Atmosphere = Instance.new("Atmosphere")
light.Atmosphere.Density = 0.4
light.Atmosphere.Color = Color3.fromRGB(60, 60, 70)
light.Atmosphere.Haze = 2

-- Flicker-free porch lamps (static, no loops)
for _, x in ipairs({-12, 12}) do
	local lamp = Instance.new("Model"); lamp.Name = "PorchLamp"; lamp.Parent = workspace
	part(lamp, "Post", Vector3.new(1, 10, 1), Vector3.new(x, 5, 100), Color3.fromRGB(40, 40, 40), Enum.Material.Metal)
	part(lamp, "Bulb", Vector3.new(1.5, 1.5, 1.5), Vector3.new(x, 10.5, 100), Color3.fromRGB(255, 180, 100), Enum.Material.Neon)
	local pl = Instance.new("PointLight")
	pl.Color = Color3.fromRGB(255, 170, 90)
	pl.Range = 24
	pl.Brightness = 1
	pl.Parent = lamp.Bulb
end

-- Interior sconces along gallery
for _, x in ipairs({-30, 0, 30}) do
	local s = Instance.new("Model"); s.Name = "Sconce"; s.Parent = workspace
	part(s, "SconceBase", Vector3.new(1, 2, 1), Vector3.new(x, 26, 32), Color3.fromRGB(60, 50, 25), Enum.Material.Metal)
	part(s, "SconceFlame", Vector3.new(0.6, 1, 0.6), Vector3.new(x, 27.5, 32), Color3.fromRGB(255, 160, 60), Enum.Material.Neon)
	local sl = Instance.new("PointLight")
	sl.Color = Color3.fromRGB(255, 140, 60)
	sl.Range = 18
	sl.Brightness = 0.8
	sl.Parent = s.SconceFlame
end