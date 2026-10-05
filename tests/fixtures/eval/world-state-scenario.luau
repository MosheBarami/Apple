--!nocheck
-- Scenario for tests/eval-world-state.test.mjs. Runs after mock-datamodel.luau and a `__script(MODE, BASELINE_JSON)`
-- wrapper around scripts/eval/luau/world-state.luau. Prints one `@@<tag> <json>` line per step.

local function say(tag, json)
	print("@@" .. tag .. " " .. json)
end
local function call(mode, baseline)
	return __script(mode, baseline or "")
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
local texture = Instance.new("Decal")
texture.Name = "Texture"
texture.Parent = baseplate
local spawnLocation = part("SpawnLocation", "SpawnLocation", workspace, Vector3.new(12, 1, 12), CFrame.new(0, 0.5, 0))
local terrain = Instance.new("Terrain")
terrain.Parent = workspace
local camera = Instance.new("Camera")
camera.Parent = workspace
camera.ViewportSize = Vector3.new(1280, 720, 0)
workspace.CurrentCamera = camera
workspace.Gravity = 196.2

local lighting = game:GetService("Lighting")
lighting.Brightness = 3
lighting.ClockTime = 14
lighting.Ambient = Color3.new(0.27, 0.27, 0.27)
lighting.FogEnd = 100000
lighting.GlobalShadows = true
Instance.new("Sky").Parent = lighting
Instance.new("ColorGradingEffect").Parent = lighting
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
