--!nonstrict
-- Lumen Isles: an authored low-poly adventure, built from first-party geometry only.
-- Ordinary game source. No HTTP, remote require, asset upload, plugin API or external meshes.
local World = {}
local V = Vector3.new
local C = Color3.fromRGB
local palette = {
    grass = C(113, 155, 102), grassLight = C(148, 177, 111), moss = C(80, 127, 108),
    rock = C(85, 111, 119), rockLight = C(112, 137, 137), rockDark = C(61, 87, 103),
    sand = C(224, 201, 145), path = C(215, 181, 120), cream = C(242, 224, 185),
    wood = C(117, 78, 58), timber = C(176, 131, 85), roof = C(39, 98, 108),
    sea = C(43, 133, 158), seaLight = C(88, 177, 179), gold = C(255, 206, 107),
    dark = C(30, 61, 77), leaf = C(53, 124, 110), leafLight = C(87, 153, 112),
    peach = C(230, 160, 116), pale = C(249, 239, 214),
}
World.beacons = {
    { id = "orchard", title = "Orchard Windmill", position = V(82, 22, -12), spawn = V(72, 25, -2) },
    { id = "tide", title = "Tideglass Arch", position = V(46, 31, -102), spawn = V(38, 34, -90) },
    { id = "summit", title = "Cloudrest Summit", position = V(-62, 46, -96), spawn = V(-51, 49, -86) },
}
World.shards = {
    V(-12, 16, 14), V(16, 16, 7), V(4, 16, -18), V(-23, 16, -3),
    V(45, 22, -3), V(69, 26, 12), V(92, 26, 4), V(98, 26, -21), V(75, 26, -34),
    V(65, 31, -63), V(61, 35, -88), V(32, 35, -109), V(60, 35, -118),
    V(-5, 43, -98), V(-44, 50, -75), V(-80, 50, -89), V(-66, 50, -117), V(-21, 25, -52),
}
World.spawn = V(0, 16, 19)
World.lighthouse = V(-25, 20, -49)

function World.build()
    assert(not workspace:FindFirstChild("LumenIsles"), "Lumen Isles already exists; never replace an existing world implicitly")
    local model = Instance.new("Model")
    model.Name = "LumenIsles"
    model:SetAttribute("FirstPartyExperience", "lumen-isles-v1")
    local scenery = Instance.new("Folder"); scenery.Name = "Scenery"; scenery.Parent = model
    local targets = Instance.new("Folder"); targets.Name = "Targets"; targets.Parent = model
    local beacons = Instance.new("Folder"); beacons.Name = "Beacons"; beacons.Parent = model
    local parts = 0
    local function part(name, size, frame, colour, parent, material, collide, className)
        local p = Instance.new(className or "Part")
        p.Name, p.Size, p.CFrame = name, size, frame
        p.Color, p.Material = colour, material or Enum.Material.SmoothPlastic
        p.Anchored, p.CanCollide, p.CanTouch = true, collide ~= false, false
        p.TopSurface, p.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
        p.Parent = parent or scenery
        parts += 1
        return p
    end
    local function cylinder(name, radius, height, at, colour, parent, collide)
        local p = part(name, V(height, radius * 2, radius * 2), CFrame.new(at) * CFrame.Angles(0, 0, math.pi / 2), colour, parent, nil, collide)
        p.Shape = Enum.PartType.Cylinder
        return p
    end
    local function beam(name, a, b, width, height, colour, parent, collide)
        return part(name, V(width, height, (b-a).Magnitude), CFrame.lookAt((a+b)/2, b), colour, parent, nil, collide)
    end
    local function triangle(name, a, b, c, colour, parent, collide)
        local ab, ac, bc = b-a, c-a, c-b
        if ab:Dot(ab) > ac:Dot(ac) and ab:Dot(ab) > bc:Dot(bc) then c, a = a, c
        elseif ac:Dot(ac) > bc:Dot(bc) then a, b = b, a end
        ab, ac, bc = b-a, c-a, c-b
        if ac:Cross(ab).Magnitude < 0.001 or bc.Magnitude < 0.001 then return end
        local right = ac:Cross(ab).Unit
        local up, back = bc:Cross(right).Unit, bc.Unit
        local height = math.abs(ab:Dot(up))
        part(name, V(0.16, height, math.abs(ab:Dot(back))), CFrame.fromMatrix((a+b)/2, right, up, back), colour, parent, nil, collide, "WedgePart")
        part(name, V(0.16, height, math.abs(ac:Dot(back))), CFrame.fromMatrix((a+c)/2, -right, up, -back), colour, parent, nil, collide, "WedgePart")
    end
    local function island(name, at, radius, height, seed, distant)
        local group = Instance.new("Model"); group.Name = name; group.Parent = scenery
        local random, ring, bottom = Random.new(seed), {}, {}
        local n = distant and 9 or 15
        for i = 1, n do
            local angle = (i-1)*math.pi*2/n
            local r = radius * random:NextNumber(0.89, 1.11)
            ring[i] = at + V(math.cos(angle)*r, random:NextNumber(-0.45, 0.45), math.sin(angle)*r)
            bottom[i] = at + V(math.cos(angle)*r*0.72, -height*random:NextNumber(0.7,1.05), math.sin(angle)*r*0.72)
        end
        for i = 1, n do
            local j = i % n + 1
            triangle("MeadowFacet", at, ring[i], ring[j], i % 3 == 0 and palette.grassLight or palette.grass, group, not distant)
            triangle("CliffFace", ring[i], bottom[i], ring[j], i % 3 == 0 and palette.rockDark or palette.rock, group, not distant)
            triangle("CliffFacet", bottom[i], bottom[j], ring[j], i % 2 == 0 and palette.rockLight or palette.rock, group, not distant)
            triangle("IslandKeel", bottom[i], at + V(2,-height*1.35,-3), bottom[j], palette.rockDark, group, false)
        end
        return group
    end
    local function canopy(at, radius, colour, seed)
        local random, top, ring = Random.new(seed), at + V(0,radius*0.9,0), {}
        local group = Instance.new("Model"); group.Name = "FacetedCanopy"; group.Parent = scenery
        for i=1,7 do
            local angle=i*math.pi*2/7
            ring[i]=at+V(math.cos(angle)*radius,random:NextNumber(-0.4,0.4),math.sin(angle)*radius)
        end
        for i=1,7 do
            local next_=i%7+1
            triangle("LeafPlane",top,ring[i],ring[next_],i%2==0 and colour:Lerp(palette.pale,0.08) or colour,group,false)
            triangle("LeafUnderside",at-V(0,radius*0.5,0),ring[next_],ring[i],colour:Lerp(palette.dark,0.12),group,false)
        end
    end
    local function tree(at, scale, seed, peach)
        beam("TreeTrunk",at,at+V(0.8*scale,6.8*scale,0),1.05*scale,1.05*scale,palette.wood)
        beam("TreeBranch",at+V(0.5*scale,4*scale,0),at+V(-2*scale,7*scale,0.4*scale),0.55*scale,0.55*scale,palette.wood,nil,false)
        canopy(at+V(0.7*scale,8.8*scale,0),4.2*scale,peach and palette.peach or palette.leaf,seed)
        canopy(at+V(-2*scale,7.5*scale,0.5*scale),2.7*scale,peach and palette.peach:Lerp(palette.gold,0.16) or palette.leafLight,seed+1)
    end
    local function rock(at, scale, yaw)
        local p=part("WeatheredStone",V(3.1,2.3,2.7)*scale,CFrame.new(at)*CFrame.Angles(0.1,yaw,0.15),palette.rockLight)
        p.Shape=Enum.PartType.Ball
        part("StoneFacet",V(2.4,1.2,3.2)*scale,CFrame.new(at+V(0.3,0.8,0)*scale)*CFrame.Angles(0,yaw,-0.25),palette.rock,nil,nil,true,"WedgePart")
    end
    local function lantern(at)
        part("LanternPost",V(0.45,5,0.45),CFrame.new(at+V(0,2.5,0)),palette.wood)
        beam("LanternArm",at+V(0,4.8,0),at+V(1.5,4.8,0),0.3,0.3,palette.wood)
        local lamp=part("LanternGlow",V(0.8,1.15,0.8),CFrame.new(at+V(1.5,4,0)),palette.gold,nil,Enum.Material.Neon,false)
        part("LanternCap",V(1.1,0.2,1.1),CFrame.new(at+V(1.5,4.68,0)),palette.dark,nil,nil,false)
        local light=Instance.new("PointLight");light.Color=palette.gold;light.Brightness=0.8;light.Range=12;light.Parent=lamp
    end
    local function sign(at, title, subtitle, yaw)
        local cf=CFrame.new(at)*CFrame.Angles(0,yaw or 0,0)
        for _,x in ipairs({-2,2}) do part("WaymarkPost",V(0.45,4,0.45),cf*CFrame.new(x,2,0),palette.wood) end
        local p=part("Waymark",V(6,2.5,0.3),cf*CFrame.new(0,3,-0.42),palette.roof)
        local gui=Instance.new("SurfaceGui");gui.Face=Enum.NormalId.Front;gui.SizingMode=Enum.SurfaceGuiSizingMode.PixelsPerStud;gui.PixelsPerStud=45;gui.Parent=p
        local t=Instance.new("TextLabel");t.BackgroundTransparency=1;t.Size=UDim2.fromScale(0.94,0.62);t.Position=UDim2.fromScale(0.03,0.03);t.Font=Enum.Font.GothamBold;t.Text=title;t.TextSize=29;t.TextColor3=palette.pale;t.TextWrapped=true;t.Parent=gui
        local s=t:Clone();s.Font=Enum.Font.Gotham;s.Text=subtitle;s.TextSize=17;s.Size=UDim2.fromScale(0.94,0.3);s.Position=UDim2.fromScale(0.03,0.66);s.Parent=gui
    end
    local function path(points, width, bridge)
        for i=1,#points-1 do
            local a,b=points[i],points[i+1]
            if bridge then
                local n=math.max(1,math.ceil((b-a).Magnitude/2.4))
                for step=0,n-1 do
                    local p=a:Lerp(b,(step+0.5)/n)
                    part("BridgePlank",V(width,0.42,(b-a).Magnitude/n-0.06),CFrame.lookAt(p,b),step%3==0 and palette.timber:Lerp(palette.pale,0.09) or palette.timber)
                end
                local direction=(b-a).Unit;local side=V(-direction.Z,0,direction.X)*(width/2+0.15)
                for _,s in ipairs({-1,1}) do
                    beam("RopeRail",a+side*s+V(0,2.7,0),b+side*s+V(0,2.7,0),0.17,0.17,palette.cream,nil,false)
                    part("BridgePost",V(0.5,3.1,0.5),CFrame.new(a+side*s+V(0,1.4,0)),palette.wood)
                end
            else beam("GoldenTrail",a,b,width,0.18,palette.path) end
        end
    end
    local function cottage(at, yaw)
        local cf=CFrame.new(at)*CFrame.Angles(0,yaw,0)
        part("HarbourHouse",V(11,8,9),cf*CFrame.new(0,4,0),palette.cream)
        for _,s in ipairs({-1,1}) do
            part("SlopingRoof",V(7,0.55,11),cf*CFrame.new(s*2.85,9,0)*CFrame.Angles(0,0,s*math.rad(-25)),palette.roof)
            part("HouseBeam",V(0.6,8.5,0.6),cf*CFrame.new(s*5.3,4,4.5),palette.wood)
        end
        part("Door",V(2.4,5,0.3),cf*CFrame.new(0,2.5,-4.65),palette.wood)
        for _,x in ipairs({-3.7,3.7}) do
            part("WindowFrame",V(2.15,2.8,0.35),cf*CFrame.new(x,4.4,-4.65),palette.timber)
            part("Window",V(1.65,2.2,0.4),cf*CFrame.new(x,4.4,-4.85),palette.gold, nil, Enum.Material.Glass)
            part("WindowMullion",V(0.12,2.3,0.45),cf*CFrame.new(x,4.4,-4.91),palette.wood)
            part("WindowSill",V(2.5,0.25,0.9),cf*CFrame.new(x,2.9,-4.9),palette.timber)
        end
        part("DoorLintel",V(3.2,0.3,0.8),cf*CFrame.new(0,5.2,-4.8),palette.timber)
        part("DoorStep",V(3.8,0.3,1.3),cf*CFrame.new(0,0.25,-5.1),palette.rockLight)
        part("Chimney",V(1.6,4,1.6),cf*CFrame.new(3,10,2),palette.rock)
    end
    local function crystal(id, at)
        local anchor=part(id,V(1.35,1.35,1.35),CFrame.new(at)*CFrame.Angles(0,math.rad(30),math.rad(45)),palette.gold,targets,Enum.Material.Neon,false)
        anchor:SetAttribute("CollectibleId",id)
        local prompt=Instance.new("ProximityPrompt");prompt.Name="Collect";prompt.ActionText="Gather light";prompt.ObjectText="Light shard";prompt.KeyboardKeyCode=Enum.KeyCode.E;prompt.GamepadKeyCode=Enum.KeyCode.ButtonX;prompt.HoldDuration=0.15;prompt.MaxActivationDistance=9;prompt.RequiresLineOfSight=false;prompt.Parent=anchor
        local light=Instance.new("PointLight");light.Color=palette.gold;light.Brightness=0.5;light.Range=9;light.Parent=anchor
        return anchor
    end
    local function beacon(spec)
        local group=Instance.new("Model");group.Name=spec.id;group.Parent=beacons
        local at=spec.position
        cylinder("BeaconPlinth",3.6,0.6,at+V(0,0.3,0),palette.rockLight,group)
        cylinder("BeaconColumn",0.85,5,at+V(0,3,0),palette.cream,group)
        for i=1,6 do
            local angle=i*math.pi/3
            beam("BeaconCrown",at+V(math.cos(angle)*1.35,4.8,math.sin(angle)*1.35),at+V(math.cos(angle)*2,7,math.sin(angle)*2),0.35,0.35,palette.timber,group,false)
        end
        local core=part("Core",V(2.1,2.1,2.1),CFrame.new(at+V(0,6.5,0))*CFrame.Angles(0,0,math.pi/4),palette.seaLight,group,Enum.Material.Glass,false)
        local prompt=Instance.new("ProximityPrompt");prompt.Name="Restore";prompt.ActionText="Restore · 4 shards";prompt.ObjectText=spec.title;prompt.HoldDuration=0.8;prompt.MaxActivationDistance=11;prompt.RequiresLineOfSight=false;prompt.Parent=core
        return core
    end
    -- Negative space is ocean, not a baseplate. Four distinct connected destinations form a circuit.
    local sea=part("Sea",V(6000,2,6000),CFrame.new(0,-10,0),palette.sea,model,Enum.Material.SmoothPlastic,false)
    sea.Reflectance=0.02
    island("HarbourMeadow",V(0,12,0),34,26,7)
    island("OrchardIsland",V(82,22,-12),31,36,11)
    island("TideglassIsland",V(46,31,-102),29,46,19)
    island("CloudrestIsland",V(-62,46,-96),32,61,29)
    island("LighthouseRock",V(-25,20,-49),17,33,41)
    for i, data in ipairs({{V(180,14,-215),40},{V(-150,32,-260),53},{V(230,1,90),36},{V(-230,11,-80),48},{V(40,28,-340),60}}) do island("DistantIsle"..i,data[1],data[2],data[2]*1.4,70+i,true) end
    path({V(0,12.4,25),V(0,12.4,5),V(18,12.4,-2),V(29,12.4,-3)},7,false)
    path({V(28,12.7,-3),V(42,17,-1),V(55,21,-3),V(62,22.5,-7)},7,true)
    path({V(62,22.4,-7),V(78,22.4,-10),V(83,22.4,-24),V(78,22.4,-36)},6,false)
    path({V(78,22.6,-35),V(72,26,-50),V(64,29,-68),V(58,31.5,-78)},6.5,true)
    path({V(58,31.4,-78),V(47,31.4,-94),V(34,31.4,-102),V(19,31.4,-103)},6,false)
    path({V(20,31.6,-103),V(3,37,-99),V(-15,42,-96),V(-33,46.5,-91)},6.5,true)
    path({V(-33,46.4,-91),V(-52,46.4,-92),V(-65,46.4,-100)},6,false)
    path({V(-76,46.4,-77),V(-70,46.4,-69)},6,false)
    path({V(-70,46.6,-69),V(-70,39,-49),V(-61,32,-31),V(-45,26,-27),V(-31,20.5,-37)},6.5,true)
    path({V(-19,20.5,-35),V(-15,17,-26),V(-12,12.5,-18)},6,true)
    cottage(V(-18,12,10),math.rad(190));cottage(V(17,12,18),math.rad(90))
    path({V(-7,12.4,18),V(-10,12.4,33),V(-8,12.4,47)},6,true)
    -- A small tied sailboat gives arrival a purpose and a recognizable silhouette.
    part("BoatHull",V(5,2,13),CFrame.new(-1,10.5,46)*CFrame.Angles(0,0.2,0),palette.roof,nil,nil,false)
    part("BoatMast",V(0.35,13,0.35),CFrame.new(-1,17,46),palette.wood,nil,nil,false)
    triangle("Sail",V(-0.6,23,46),V(-0.6,13,46),V(5,13,46),palette.cream,nil,false)
    for i, v in ipairs({V(-25,12,-10),V(-13,12,-21),V(23,12,-14),V(15,12,-25),V(101,22,1),V(68,22,5),V(95,22,-29),V(67,22,-25),V(88,22,13),V(27,31,-89),V(65,31,-111),V(33,31,-122),V(-82,46,-88),V(-58,46,-120),V(-42,46,-107)}) do tree(v,0.7+(i%4)*0.14,120+i,i>=5 and i<=9) end
    for i,v in ipairs({V(-29,12,7),V(20,12,0),V(11,12,-16),V(91,22,-5),V(65,22,-18),V(42,31,-122),V(65,31,-93),V(-76,46,-110),V(-47,46,-73),V(-33,20,-43)}) do rock(v+V(0,0.7,0),0.6+(i%3)*0.3,i) end
    for _,v in ipairs({V(7,12,17),V(23,12,-5),V(62,22,-3),V(77,22,-28),V(60,31,-80),V(27,31,-98),V(-37,46,-88),V(-25,20,-38)}) do lantern(v) end
    -- Deliberate small-scale habitat clusters, away from the navigable ribbon.
    local flowerSites={V(-22,12.3,21),V(-13,12.3,26),V(22,12.3,-20),V(70,22.3,10),V(99,22.3,-14),V(69,22.3,-29),V(34,31.3,-121),V(-77,46.3,-106)}
    for cluster,site in ipairs(flowerSites) do
        local random=Random.new(900+cluster)
        for i=1,6 do
            local at=site+V(random:NextNumber(-2.5,2.5),0,random:NextNumber(-2.5,2.5))
            beam("MeadowStem",at,at+V(0,0.8,0),0.09,0.09,palette.moss,nil,false)
            part("Wildflower",V(0.35,0.16,0.65),CFrame.new(at+V(0,0.85,0))*CFrame.Angles(0,i,0),i%2==0 and palette.pale or palette.peach,nil,nil,false)
        end
    end
    -- A little harbour market, rather than two blank houses facing away from the player.
    local stall=CFrame.new(11,12,-12)*CFrame.Angles(0,0.12,0)
    part("MarketCounter",V(7,2,2.8),stall*CFrame.new(0,1.3,0),palette.timber)
    for _,x in ipairs({-3.2,3.2}) do part("MarketPost",V(0.35,5.8,0.35),stall*CFrame.new(x,2.9,0.5),palette.wood) end
    for i=0,5 do
        part("CanvasAwning",V(1.3,0.2,4.4),stall*CFrame.new(-3.25+i*1.3,5.8,-0.35)*CFrame.Angles(-0.13,0,0),i%2==0 and palette.cream or palette.peach,nil,nil,false)
    end
    for i=1,4 do
        cylinder("Pot",0.55,0.8,(stall*CFrame.new(-2.6+i*1.05,2.7,0)).Position,palette.roof,nil,false)
    end
    -- Low dry-stone terrace edges and orchard beds identify each destination without cluttering paths.
    for i=0,9 do
        local a=math.rad(20+i*12)
        part("OrchardWall",V(4.2,1.25,1.2),CFrame.new(82+math.cos(a)*22,22.8,-12+math.sin(a)*22)*CFrame.Angles(0,-a-math.pi/2,0),i%2==0 and palette.rockLight or palette.cream)
    end
    for _,at in ipairs({V(95,22.4,-4),V(96,22.4,-10),V(97,22.4,-16)}) do
        part("OrchardBed",V(8,0.3,2.2),CFrame.new(at),palette.wood)
        for i=1,5 do part("GardenLeaf",V(0.6,0.8,0.7),CFrame.new(at+V(-3+i,0.5,0))*CFrame.Angles(0,i,0),palette.leafLight,nil,nil,false,"WedgePart") end
    end
    sign(V(6,12,7),"LUMEN ISLES","Follow the wind • restore the light",math.pi)
    sign(V(67,22,-8),"ORCHARD","Windmill sanctuary",math.pi/2)
    sign(V(51,31,-81),"TIDEGLASS","The old stone crossing",0)
    sign(V(-40,46,-93),"CLOUDREST","Above the drifting sea",-math.pi/2)
    -- Windmill: tapered silhouette, four deliberate timber-and-cloth sails.
    cylinder("WindmillTower",3.2,13,V(88,28.5,-18),palette.cream)
    local hub=V(88,34,-14.4)
    for i=0,3 do
        local angle=i*math.pi/2+math.rad(20)
        local cf=CFrame.new(hub)*CFrame.Angles(0,0,angle)
        part("WindmillArm",V(0.45,10,0.4),cf*CFrame.new(0,4,0),palette.wood,nil,nil,false)
        part("CanvasSail",V(2,6,0.22),cf*CFrame.new(0.7,5.2,0.2),palette.cream,nil,nil,false)
    end
    -- Tideglass arch is open at its centre, never a repeated stack of boxes.
    for i=0,10 do
        local t=(i/10)*math.pi
        local centre=V(46+math.cos(t)*9,32+math.sin(t)*11,-111)
        part("ArchStone",V(3.5,3.4,4),CFrame.new(centre)*CFrame.Angles(0,0,t-math.pi/2),i%2==0 and palette.rockLight or palette.cream)
    end
    -- A summit ring and flags frame the third beacon against the horizon.
    for i=0,7 do
        local a=i*math.pi/4
        local p=V(-62+math.cos(a)*10,46.5,-96+math.sin(a)*10)
        part("SummitPaving",V(4,0.3,5),CFrame.new(p)*CFrame.Angles(0,-a,0),palette.cream)
    end
    for _,p in ipairs({V(-75,46,-99),V(-57,46,-110),V(26,31,-115)}) do
        part("Flagpole",V(0.35,9,0.35),CFrame.new(p+V(0,4.5,0)),palette.wood)
        triangle("WindBanner",p+V(0,8,0),p+V(0,4.8,0),p+V(4,6.2,0),palette.peach,nil,false)
    end
    -- Lighthouse is visible from the harbour and all three destinations.
    local at=World.lighthouse
    cylinder("LighthouseFoundation",7,0.7,at+V(0,0.35,0),palette.cream)
    cylinder("LighthouseTower",4,22,at+V(0,11,0),palette.pale)
    cylinder("LighthouseBand",4.04,3,at+V(0,13,0),palette.roof)
    cylinder("LanternGallery",6,0.7,at+V(0,22,0),palette.wood)
    for i=0,7 do
        local a=i*math.pi/4
        part("GalleryPillar",V(0.3,5,0.3),CFrame.new(at+V(math.cos(a)*4,25,math.sin(a)*4)),palette.dark,nil,nil,false)
    end
    local lens=part("LighthouseLens",V(5,4,5),CFrame.new(at+V(0,25,0)),palette.seaLight,model,Enum.Material.Glass,false)
    cylinder("LighthouseRoof",5.3,1,at+V(0,28,0),palette.roof)
    cylinder("LighthouseFinial",0.25,4,at+V(0,30,0),palette.gold,nil,false)
    local door=part("LighthouseDoor",V(3.2,5.2,0.35),CFrame.new(at+V(0,2.6,4.05)),palette.roof,targets)
    local finish=Instance.new("ProximityPrompt");finish.Name="Finish";finish.ActionText="Bring the light home";finish.ObjectText="The lighthouse";finish.HoldDuration=1.2;finish.MaxActivationDistance=10;finish.RequiresLineOfSight=false;finish.Parent=door
    for _,spec in ipairs(World.beacons) do beacon(spec) end
    for i,pos in ipairs(World.shards) do crystal("shard_"..i,pos) end
    local spawn=Instance.new("SpawnLocation");spawn.Name="HarbourSpawn";spawn.Size=V(6,0.4,6);spawn.CFrame=CFrame.new(World.spawn-V(0,3.7,0));spawn.Anchored=true;spawn.Transparency=1;spawn.CanCollide=false;spawn.Duration=0;spawn.Neutral=true;spawn.Parent=model
    model:SetAttribute("AuthoredPartCount",parts)
    model.Parent=workspace
    local lighting=game:GetService("Lighting")
    lighting.ClockTime=15.6;lighting.Brightness=1.7;lighting.Ambient=C(90,111,132);lighting.OutdoorAmbient=C(120,143,155)
    lighting.GlobalShadows=true;lighting.EnvironmentDiffuseScale=0.55;lighting.EnvironmentSpecularScale=0.2
    lighting.FogColor=C(166,206,214);lighting.FogStart=220;lighting.FogEnd=1200
    local atmosphere=Instance.new("Atmosphere");atmosphere.Name="LumenAtmosphere";atmosphere.Density=0.22;atmosphere.Offset=0.15;atmosphere.Color=C(210,226,224);atmosphere.Decay=C(138,177,197);atmosphere.Glare=0.14;atmosphere.Haze=1.1;atmosphere.Parent=lighting
    local grade=Instance.new("ColorCorrectionEffect");grade.Name="LumenColour";grade.Contrast=0.06;grade.Saturation=-0.06;grade.TintColor=C(255,248,236);grade.Parent=lighting
    local bloom=Instance.new("BloomEffect");bloom.Name="LumenGlow";bloom.Intensity=0.08;bloom.Size=14;bloom.Threshold=1.7;bloom.Parent=lighting
    return model
end

return World
