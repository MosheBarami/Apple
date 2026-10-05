--!nocheck
-- Scenario for tests/eval-world-state.test.mjs. Runs after mock-datamodel.luau, a `local PROPERTY_NAMES = {...}` (the
-- plugin's write allowlist, read from Commands.luau by the test) and a `__script(MODE, BASELINE_JSON, PROPERTY_NAMES)`
-- wrapper around scripts/eval/luau/world-state.luau. Prints one `@@<tag> <json>` line per step.

local function say(tag, json)
	print("@@" .. tag .. " " .. json)
end
local function call(mode, baseline)
	return __script(mode, baseline or "", PROPERTY_NAMES)
end

local function part(name, class, parent, size, cframe)
	local p = Instance.new(class or "Part")
	p.Name = name
	p.Size = size
	p.CFrame = cframe
	p.Anchored = true
	p.Parent = parent
	return p
end

-- ---------------------------------------------------------------- a pristine Baseplate place
local baseplate = part("Baseplate", "Part", workspace, Vector3.new(512, 20, 512), CFrame.new(0, -10, 0))
baseplate.Color = Color3.new(0.39, 0.37, 0.38)
baseplate.Friction = math.huge -- a limit value: JSON cannot hold it, so the script must record it another way
baseplate:SetAttribute("Surface", "stone")
local texture = Instance.new("Decal")
texture.Name = "Texture"
texture.Parent = baseplate
local spawnLocation = part("SpawnLocation", "SpawnLocation", workspace, Vector3.new(12, 1, 12), CFrame.new(0, 0.5, 0))
spawnLocation.CustomPhysicalProperties = PhysicalProperties.new(1, 0.5, 0.25, 1, 1)
local terrain = Instance.new("Terrain")
terrain.Parent = workspace
local camera = Instance.new("Camera")
camera.Parent = workspace
camera.ViewportSize = Vector3.new(1280, 720, 0)
workspace.CurrentCamera = camera
workspace.Gravity = 196.2
workspace:SetAttribute("Tier", "bronze")

local lighting = game:GetService("Lighting")
lighting.Brightness = 3
lighting.ClockTime = 14
lighting.Ambient = Color3.new(0.27, 0.27, 0.27)
lighting.FogEnd = 100000
lighting.GlobalShadows = true
lighting:SetAttribute("RBX_OriginalTechnologyOnFileLoad", "Voxel") -- the engine's own: nobody can set or clear it
local sky = Instance.new("Sky")
sky.Parent = lighting
local colorGrading = Instance.new("ColorGradingEffect")
colorGrading.Parent = lighting
game:GetService("SoundService").AmbientReverb = Enum.ReverbType.NoReverb
local chat = game:GetService("TextChatService")
local chatWindow = Instance.new("Folder")
chatWindow.Name = "ChatWindowConfiguration"
chatWindow.Parent = chat
local starterPlayer = game:GetService("StarterPlayer")
local sps = Instance.new("Folder")
sps.Name = "StarterPlayerScripts"
sps.Parent = starterPlayer
local scs = Instance.new("Folder")
scs.Name = "StarterCharacterScripts"
scs.Parent = starterPlayer
-- Kept things of other value types, so every kind the script records is recorded, restored and compared.
local hud = Instance.new("Frame")
hud.Name = "HudFrame"
hud.Size = UDim2.new(0.5, 0, 0, 50)
hud.AnchorPoint = Vector2.new(0.5, 0.5)
hud.Visible = true
hud.Parent = game:GetService("StarterGui")
local emitter = Instance.new("ParticleEmitter")
emitter.Name = "Sparks"
emitter.Lifetime = NumberRange.new(1, 2)
emitter.Parent = game:GetService("ReplicatedStorage")

local baselineJson = call("capture")
say("capture", baselineJson)
say("verify-pristine", call("verify", baselineJson))
say("measure-pristine", call("measure", baselineJson))

-- ---------------------------------------------------------------- a run builds things everywhere
local model = Instance.new("Model")
model.Name = "ShopStall"
model.Parent = workspace
part("Counter", "Part", model, Vector3.new(10, 4, 6), CFrame.new(40, 2, -30))
part("Roof", "Part", model, Vector3.new(12, 1, 8), CFrame.new(40, 9, -30))
-- a part turned 90 degrees about Y: its X and Z extents swap
part("Turned", "Part", model, Vector3.new(20, 2, 4), CFrame.rotY(60, 1, 10, 90))
part("Loose", "Part", workspace, Vector3.new(2, 2, 2), CFrame.new(-25, 6, 5))
local touch = Instance.new("TouchTransmitter")
touch.Parent = workspace:FindFirstChild("Loose")

local gui = Instance.new("ScreenGui")
gui.Name = "ShopGui"
gui.Parent = game:GetService("StarterGui")
local frame = Instance.new("Frame")
frame.Parent = gui
local title = Instance.new("TextLabel")
title.Text = "Pet Shop"
title.Parent = frame
local buy = Instance.new("TextButton")
buy.Text = "Buy"
buy.Parent = frame
local emptyGui = Instance.new("ScreenGui")
emptyGui.Name = "EmptyGui"
emptyGui.Parent = game:GetService("StarterGui")

local serverScript = Instance.new("Script")
serverScript.Parent = game:GetService("ServerScriptService")
local remote = Instance.new("RemoteEvent")
remote.Parent = game:GetService("ReplicatedStorage")
local clientScript = Instance.new("LocalScript")
clientScript.Parent = sps
Instance.new("Atmosphere").Parent = lighting
Instance.new("BloomEffect").Parent = lighting
local sound = Instance.new("Sound")
sound.Parent = game:GetService("SoundService")
lighting.ClockTime = 21
lighting.Brightness = 0.5
lighting.Ambient = Color3.new(0, 0, 0.3)
game:GetService("SoundService").AmbientReverb = Enum.ReverbType.Cave
workspace.Gravity = 50
baseplate.Size = Vector3.new(100, 20, 100)
baseplate.Color = Color3.new(1, 0, 0)
terrain.cells = 42
local extraCamera = Instance.new("Camera")
extraCamera.Name = "ThumbnailCamera"
extraCamera.Parent = workspace

say("measure-dirty", call("measure", baselineJson))
say("verify-dirty", call("verify", baselineJson))
say("reset-dirty", call("reset", baselineJson))
say("verify-after-reset", call("verify", baselineJson))
say("measure-after-reset", call("measure", baselineJson))
say("camera-kept", tostring(workspace.CurrentCamera == camera and workspace:FindFirstChild("Camera") == camera))
say("touch-ignored", tostring(workspace:FindFirstChild("ThumbnailCamera") ~= nil))

-- ---------------------------------------------------------------- a run edits what the place KEEPS, and adds nothing
spawnLocation.Enabled = false
spawnLocation.CustomPhysicalProperties = PhysicalProperties.new(9, 0.1, 0.1, 2, 2)
baseplate.Locked = true
baseplate.Material = Enum.Material.Grass
baseplate.Friction = 0.3
baseplate.CustomPhysicalProperties = PhysicalProperties.new(2, 0.3, 0.5, 1, 1)
baseplate:SetAttribute("Surface", "sand")
baseplate:SetAttribute("Biome", "desert")
workspace:SetAttribute("Tier", "gold")
workspace:SetAttribute("Round", 3)
colorGrading.Contrast = 0.9
lighting.Ambient = Color3.new(0.27, 0.27, 0.9) -- only the blue channel differs
spawnLocation.CFrame = CFrame.rotY(0, 0.5, 0, 45) -- turned in place: the position is the same
sky:SetAttribute("Mood", "night")
lighting:SetAttribute("RBX_OriginalTechnologyOnFileLoad", nil)
hud.Size = UDim2.new(0.5, 0, 0, 80) -- only the Y offset differs: every component of a UDim2 is compared
hud.AnchorPoint = Vector2.new(0.5, 0) -- only Y differs
emitter.Lifetime = NumberRange.new(1, 9) -- only the maximum differs
local before = { enabled = spawnLocation.Enabled, contrast = colorGrading.Contrast, locked = baseplate.Locked }
say("verify-kept-edits", call("verify", baselineJson))
say("reset-kept-edits", call("reset", baselineJson))
say("verify-after-kept-edits-reset", call("verify", baselineJson))
say("kept-state-after", (tostring(spawnLocation.Enabled) .. " " .. tostring(colorGrading.Contrast) .. " " .. tostring(baseplate.Locked) .. " "
	.. tostring(baseplate.Material.Name) .. " " .. tostring(baseplate.Friction) .. " " .. tostring(baseplate.CustomPhysicalProperties) .. " "
	.. tostring(baseplate:GetAttribute("Surface")) .. " " .. tostring(baseplate:GetAttribute("Biome")) .. " " .. tostring(workspace:GetAttribute("Tier")) .. " "
	.. tostring(workspace:GetAttribute("Round")) .. " " .. tostring(sky:GetAttribute("Mood")) .. " " .. tostring(hud.Size.X.Scale) .. " " .. tostring(hud.AnchorPoint.Y) .. " "
	.. tostring(emitter.Lifetime.Max) .. " " .. tostring(spawnLocation.CustomPhysicalProperties.Density) .. " " .. tostring(hud.Size.Y.Offset) .. " " .. tostring(lighting.Ambient.B) .. " " .. tostring(spawnLocation.CFrame.RightVector.Z)))
say("kept-before", tostring(before.enabled) .. " " .. tostring(before.contrast) .. " " .. tostring(before.locked))

-- ---------------------------------------------------------------- a recorded property that cannot be read any more is a difference, not "unchanged"
hud.Size = nil
say("verify-unreadable", call("verify", baselineJson))
say("reset-unreadable", call("reset", baselineJson))
say("verify-after-unreadable", call("verify", baselineJson))

-- ---------------------------------------------------------------- what a run built out of terrain alone
terrain.cells = 5000
terrain.MaxExtents = { Min = { X = -32, Y = 0, Z = -32 }, Max = { X = 31, Y = 7, Z = 31 } } -- voxels of 4 studs
say("measure-terrain-only", call("measure", baselineJson))
-- terrain AND parts: the box is the union
part("Cabin", "Part", workspace, Vector3.new(10, 10, 10), CFrame.new(300, 5, 0))
say("measure-terrain-and-parts", call("measure", baselineJson))
-- an extents box the engine cannot have measured (a limit): the terrain is still known to be edited, with no box
terrain.MaxExtents = { Min = { X = -100000, Y = -100000, Z = -100000 }, Max = { X = 100000, Y = 100000, Z = 100000 } }
workspace:FindFirstChild("Cabin"):Destroy()
say("measure-terrain-unusable-extents", call("measure", baselineJson))
-- terrain that was there before and is untouched is not an edit (a baseline with terrain)
local withTerrain = call("capture")
say("measure-terrain-unchanged", call("measure", withTerrain))
say("reset-terrain", call("reset", baselineJson))
say("verify-after-terrain", call("verify", baselineJson))

-- ---------------------------------------------------------------- framing: what counts toward the box a camera frames
part("Ground", "Part", workspace, Vector3.new(2048, 1, 2048), CFrame.new(0, -0.5, 0))
local trigger = part("Trigger", "Part", workspace, Vector3.new(80, 40, 80), CFrame.new(-500, 20, 0))
trigger.Transparency = 1
part("Statue", "Part", workspace, Vector3.new(6, 12, 6), CFrame.new(30, 6, 30))
say("measure-framing", call("measure", baselineJson))
workspace:FindFirstChild("Statue"):Destroy()
say("measure-framing-only-huge", call("measure", baselineJson))
workspace:FindFirstChild("Ground"):Destroy()
say("measure-framing-only-hidden", call("measure", baselineJson))
say("reset-framing", call("reset", baselineJson))

-- ---------------------------------------------------------------- which spawn the player appears at
local newSpawn = part("HubSpawn", "SpawnLocation", workspace, Vector3.new(10, 1, 10), CFrame.new(100, 0.5, 40))
say("measure-spawn-added", call("measure", baselineJson))
newSpawn.Enabled = false
say("measure-spawn-added-disabled", call("measure", baselineJson))
spawnLocation.Enabled = false
say("measure-spawn-none-enabled", call("measure", baselineJson))
say("reset-spawn", call("reset", baselineJson))
say("verify-after-spawn", call("verify", baselineJson))

-- ---------------------------------------------------------------- a UI that is switched off, shown for the capture and put back
local modal = Instance.new("ScreenGui")
modal.Name = "ModalGui"
modal.Enabled = false
modal.Parent = game:GetService("StarterGui")
local modalFrame = Instance.new("Frame")
modalFrame.Parent = modal
local hudGui = Instance.new("ScreenGui")
hudGui.Name = "HudGui"
hudGui.Parent = game:GetService("StarterGui")
Instance.new("Frame").Parent = hudGui
local hollow = Instance.new("ScreenGui")
hollow.Name = "HollowGui"
hollow.Enabled = false
hollow.Parent = game:GetService("StarterGui")
say("measure-ui-disabled", call("measure", baselineJson))
say("ui-enable", call("ui-enable", baselineJson))
say("ui-after-enable", tostring(modal.Enabled) .. " " .. tostring(hudGui.Enabled) .. " " .. tostring(hollow.Enabled) .. " " .. tostring(modal:GetAttribute("EvalWasDisabled")))
say("ui-restore", call("ui-restore"))
say("ui-after-restore", tostring(modal.Enabled) .. " " .. tostring(hudGui.Enabled) .. " " .. tostring(hollow.Enabled) .. " " .. tostring(modal:GetAttribute("EvalWasDisabled")))
say("reset-ui", call("reset", baselineJson))
say("verify-after-ui", call("verify", baselineJson))

-- ---------------------------------------------------------------- a run deletes the ground, the spawn and the original lighting effects
baseplate:Destroy()
spawnLocation:Destroy()
for _, c in ipairs(lighting:GetChildren()) do
	c:Destroy()
end
part("Baseplate", "Part", workspace, Vector3.new(8, 1, 8), CFrame.new(1, 1, 1))
part("Baseplate", "Part", workspace, Vector3.new(9, 1, 9), CFrame.new(2, 2, 2))
say("verify-damaged", call("verify", baselineJson))
say("reset-damaged", call("reset", baselineJson))
say("verify-after-damage-reset", call("verify", baselineJson))

-- ---------------------------------------------------------------- the reset is idempotent: a second one removes nothing
say("reset-again", call("reset", baselineJson))
