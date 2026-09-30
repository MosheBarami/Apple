
local RS, SSS, SP = game:GetService("ReplicatedStorage"), game:GetService("ServerScriptService"), game:GetService("StarterPlayer")
local folder = RS:FindFirstChild("AppleComponents") or Instance.new("Folder"); folder.Name = "AppleComponents"; folder.Parent = RS
local function put(class, name, parent, src) local old = parent:FindFirstChild(name); if old then old:Destroy() end; local s = Instance.new(class); s.Name = name; s.Source = src; s.Parent = parent; return s end
local mod = put("ModuleScript", "AppleMotion", folder, [=====[@@MODULE@@]=====])
put("LocalScript", "AppleMotionClient", SP.StarterPlayerScripts, [=====[@@CLIENT@@]=====])
put("Script", "MotionProofWalk", SSS, [=====[@@WALK@@]=====])
put("LocalScript", "MotionProofProbe", SP.StarterPlayerScripts, [=====[@@PROBE@@]=====])
local Motion = require(mod)
local zoo = workspace:FindFirstChild("MotionProof"); if zoo then zoo:Destroy() end
zoo = Instance.new("Folder"); zoo.Name = "MotionProof"; zoo.Parent = workspace
local function part(name, size, cf, color, parent, shape)
	local p = Instance.new("Part"); p.Name = name; p.Size = size; p.CFrame = cf; p.Color = color; p.Anchored = false; p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth
	if shape then p.Shape = shape end; p.Parent = parent; return p
end
local function motor(name, p0, p1, pivotWorld)
	local m = Instance.new("Motor6D"); m.Name = name; m.Part0 = p0; m.Part1 = p1
	m.C0 = p0.CFrame:ToObjectSpace(pivotWorld); m.C1 = p1.CFrame:ToObjectSpace(pivotWorld); m.Parent = p0; return m
end
-- 1. An R15 body from a default description.
local ok, biped = pcall(function() return game:GetService("Players"):CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15) end)
if ok and biped then
	biped.Name = "Biped"; biped.Parent = zoo; biped:PivotTo(CFrame.new(-8, 3, -18)); biped.HumanoidRootPart.Anchored = true
else warn("APPLEMOTION could not build the R15 body: " .. tostring(biped)) end
-- 2. A quadruped with generic joint names, like most library creatures.
local quad = Instance.new("Model"); quad.Name = "Quadruped"; quad.Parent = zoo
local base = CFrame.new(4, 0, -18)
local root = part("Root", Vector3.new(1, 1, 1), base * CFrame.new(0, 2.2, 0), Color3.new(1, 1, 1), quad); root.Transparency = 1; root.Anchored = true; root.CanCollide = false
local body = part("Part001", Vector3.new(2.2, 1.6, 4), base * CFrame.new(0, 2.2, 0), Color3.fromRGB(170, 110, 60), quad)
local head = part("Part002", Vector3.new(1.4, 1.4, 1.4), base * CFrame.new(0, 3.0, -2.5), Color3.fromRGB(190, 130, 80), quad)
local tail = part("Part003", Vector3.new(0.4, 0.4, 1.6), base * CFrame.new(0, 2.6, 2.7), Color3.fromRGB(120, 80, 40), quad)
quad.PrimaryPart = root
motor("Part001", root, body, base * CFrame.new(0, 2.2, 0))
motor("Part002", body, head, base * CFrame.new(0, 2.7, -1.9))
motor("Part003", body, tail, base * CFrame.new(0, 2.6, 1.9))
local n = 4
for _, c in { { -0.7, -1.4 }, { 0.7, -1.4 }, { -0.7, 1.4 }, { 0.7, 1.4 } } do
	local leg = part(("Part%03d"):format(n), Vector3.new(0.5, 1.6, 0.5), base * CFrame.new(c[1], 0.8, c[2]), Color3.fromRGB(120, 80, 40), quad)
	motor(("Part%03d"):format(n), body, leg, base * CFrame.new(c[1], 1.5, c[2])); n += 1
end
-- 3. A tomato with no joints at all: prepare gives it a root and one joint.
local tomato = Instance.new("Model"); tomato.Name = "Tomato"; tomato.Parent = zoo
local fruit = part("Fruit", Vector3.new(3, 3, 3), CFrame.new(12, 1.6, -18), Color3.fromRGB(220, 40, 30), tomato, Enum.PartType.Ball); fruit.Anchored = true
local leaf = part("Leaf", Vector3.new(1.4, 0.3, 1.4), CFrame.new(12, 3.2, -18), Color3.fromRGB(40, 160, 60), tomato); leaf.Anchored = true
for _, m in zoo:GetChildren() do print("APPLEMOTION prepare " .. m.Name .. ": " .. table.concat(Motion.prepare(m), "; ")) end
print("APPLEMOTION proof place ready")
