/**
 * The Roblox-shaped mock every executable Apple Studio Luau test loads before the module under test.
 *
 * EXTRACTED, NOT COPIED. It lives here because a second test needed it — the worker capability
 * contract has to run the REAL `Commands.capabilities` to get the REAL report — and two copies of a
 * mock drift silently: the copy that is not maintained keeps passing while describing a Studio that
 * no longer exists. `tests/commands.test.mjs` is where it came from and is still its main caller.
 *
 * Deliberately NOT a reimplementation of Roblox. It provides no source loader at all — `require` is
 * a hard error — so if the command engine ever evaluates generated source, every suite built on
 * this turns red. Where it cannot model engine behaviour it omits the method rather than faking it.
 */
import { readdirSync, readFileSync } from 'node:fs';

export const PRELUDE = String.raw`--!nocheck
local function typeofMock(v)
    if type(v) == "table" and rawget(v, "__type") then return v.__type end
    if type(v) == "table" and rawget(v, "__class") then return "Instance" end
    return type(v)
end
typeof = typeofMock
local v3mt = {}
v3mt.__index = v3mt
v3mt.__add = function(a,b) return setmetatable({__type="Vector3",X=a.X+b.X,Y=a.Y+b.Y,Z=a.Z+b.Z},v3mt) end
v3mt.__sub = function(a,b) return setmetatable({__type="Vector3",X=a.X-b.X,Y=a.Y-b.Y,Z=a.Z-b.Z},v3mt) end
v3mt.__mul = function(a,b)
    if type(a)=="number" then return setmetatable({__type="Vector3",X=a*b.X,Y=a*b.Y,Z=a*b.Z},v3mt) end
    return setmetatable({__type="Vector3",X=a.X*b,Y=a.Y*b,Z=a.Z*b},v3mt)
end
local function v3(x, y, z) return setmetatable({ __type = "Vector3", X = x or 0, Y = y or 0, Z = z or 0 }, v3mt) end
Vector3 = { new = v3, zero = v3(0,0,0) }
Vector2 = { new = function(x, y) return { __type = "Vector2", X = x or 0, Y = y or 0 } end }
NumberRange = { new = function(a, b) return { __type = "NumberRange", Min = a, Max = b or a } end }
NumberSequenceKeypoint = { new = function(t, v, e) return { Time = t, Value = v, Envelope = e or 0 } end }
NumberSequence = { new = function(keypoints) return { __type = "NumberSequence", Keypoints = keypoints } end }
ColorSequenceKeypoint = { new = function(t, v) return { Time = t, Value = v } end }
ColorSequence = { new = function(keypoints) return { __type = "ColorSequence", Keypoints = keypoints } end }
Rect = { new = function(a, b, c, d) return { __type = "Rect", Min = v3(a, b, 0), Max = v3(c, d, 0) } end }
Color3 = { new = function(r, g, b) return { __type = "Color3", R = r or 0, G = g or 0, B = b or 0 } end }
UDim = { new = function(s, o) return { __type = "UDim", Scale = s or 0, Offset = o or 0 } end }
UDim2 = { new = function(xs, xo, ys, yo) return { __type = "UDim2", X = UDim.new(xs, xo), Y = UDim.new(ys, yo) } end }
BrickColor = { new = function(v) return { __type = "BrickColor", Name = tostring(v) } end }
CFrame = {}
local cfmt = {}
cfmt.__index = cfmt
local function cf(x,y,z)
    local value = setmetatable({__type="CFrame",Position=v3(x or 0,y or 0,z or 0)}, cfmt)
    value._c = {value.Position.X,value.Position.Y,value.Position.Z,1,0,0,0,1,0,0,0,1}
    return value
end
function CFrame.new(...)
    local a={...}
    if type(a[1]) == "table" and a[1].__type == "Vector3" then return cf(a[1].X,a[1].Y,a[1].Z) end
    return cf(a[1] or 0,a[2] or 0,a[3] or 0)
end
function CFrame.Angles(...) return cf(0,0,0) end
function CFrame.lookAt(origin, target) return cf(origin.X,origin.Y,origin.Z) end
function cfmt:GetComponents() return table.unpack(self._c) end
function cfmt:VectorToWorldSpace(value) return value end
cfmt.__mul = function(a,b) return cf(a.Position.X+b.Position.X,a.Position.Y+b.Position.Y,a.Position.Z+b.Position.Z) end
cfmt.__add = function(a,b) return cf(a.Position.X+b.X,a.Position.Y+b.Y,a.Position.Z+b.Z) end
Region3 = {}
local regionMt = {}; regionMt.__index = regionMt
function Region3.new(lo, hi) return setmetatable({ __type="Region3", Min=lo, Max=hi }, regionMt) end
function regionMt:ExpandToGrid(_) return self end
Enum = { FinishRecordingOperation = { Commit = "Commit", Cancel = "Cancel" }, Material = {
    SmoothPlastic = "Enum.Material.SmoothPlastic", Grass = "Enum.Material.Grass", Rock = "Enum.Material.Rock",
    Air = "Enum.Material.Air", Water = "Enum.Material.Water",
}, Font = { SourceSans = "Enum.Font.SourceSans" }, ReverbType = { Cave = "Enum.ReverbType.Cave", NoReverb = "Enum.ReverbType.NoReverb" } }

local methods = {}
local mt = {
    __index = function(self, key)
        if key == "Parent" then return rawget(self, "__parent") end
        if key == "CFrame" then return rawget(self, "__cframe") end
        if key == "Position" then return rawget(self, "__position") end
        return methods[key] or rawget(self, key)
    end,
    __newindex = function(self, key, value)
        if key == "Parent" then
            local old = rawget(self, "__parent")
            if old and old.__children then for i, child in ipairs(old.__children) do if child == self then table.remove(old.__children, i); break end end end
            rawset(self, "__parent", value)
            if value and value.__children then table.insert(value.__children, self) end
        elseif key == "CFrame" then rawset(self,"__cframe",value); rawset(self,"__position",value.Position)
        elseif key == "Position" then rawset(self,"__position",value); rawset(self,"__cframe",cf(value.X,value.Y,value.Z))
        else rawset(self, key, value) end
    end,
}
function methods:IsA(wanted)
    if wanted == "Instance" or wanted == self.ClassName then return true end
    if wanted == "LuaSourceContainer" then return self.ClassName == "Script" or self.ClassName == "LocalScript" or self.ClassName == "ModuleScript" end
    if wanted == "BasePart" then return self.ClassName == "Part" or self.ClassName == "MeshPart" or self.ClassName == "WedgePart" or self.ClassName == "CornerWedgePart" or self.ClassName == "SpawnLocation" end
    if wanted == "ValueBase" then return self.ClassName == "IntValue" or self.ClassName == "NumberValue" or self.ClassName == "StringValue" or self.ClassName == "BoolValue" end
    if wanted == "GuiObject" then return self.ClassName == "Frame" or self.ClassName == "TextLabel" or self.ClassName == "TextButton" or self.ClassName == "TextBox" or self.ClassName == "ImageLabel" or self.ClassName == "ImageButton" or self.ClassName == "ScrollingFrame" end
    return false
end
function methods:GetChildren() local out={}; for i,child in ipairs(self.__children) do out[i]=child end; return out end
function methods:GetDescendants()
    local out={}
    local function visit(node) for _,child in ipairs(node:GetChildren()) do table.insert(out,child); visit(child) end end
    visit(self); return out
end
function methods:IsDescendantOf(ancestor)
    local current=self.Parent
    while current do if current==ancestor then return true end; current=current.Parent end
    return false
end
function methods:FindFirstChild(name) for _, child in ipairs(self.__children) do if child.Name == name then return child end end end
function methods:GetFullName()
    local names, current = {}, self
    while current and current.ClassName ~= "DataModel" do table.insert(names, 1, current.Name); current = current.Parent end
    return table.concat(names, ".")
end
-- Yields only inside a simulated play session (see StudioTestService below); anywhere else a
-- missing child is simply missing, because nothing else would ever add it.
local activePlayTask = nil
function methods:WaitForChild(name, timeout)
    local found = self:FindFirstChild(name)
    local waited = 0
    while not found and activePlayTask and waited < (timeout or 5) do
        activePlayTask.wait(0.1); waited += 0.1
        found = self:FindFirstChild(name)
    end
    return found
end
function methods:Destroy() self.Parent = nil; self.__destroyed = true end
function methods:SetAttribute(name, value) self.__attributes[name] = value end
function methods:GetAttribute(name) return self.__attributes[name] end
function methods:GetAttributes() local out = {}; for k, v in pairs(self.__attributes) do out[k] = v end; return out end
function methods:Clone()
    if self.Archivable == false then return nil end
    local copy = Instance.new(self.ClassName)
    for k,v in pairs(self) do
        if k~="__parent" and k~="__cframe" and k~="__position" and k~="__children" and k~="__attributes" and k~="__class" then rawset(copy,k,v) end
    end
    if self.CFrame then copy.CFrame=self.CFrame end
    for k,v in pairs(self.__attributes) do copy.__attributes[k]=v end
    for _,child in ipairs(self.__children) do local childCopy=child:Clone(); if childCopy then childCopy.Parent=copy end end
    return copy
end
function methods:GetBoundingBox()
    local parts={}
    if self:IsA("BasePart") then parts={self} else for _,d in ipairs(self:GetDescendants()) do if d:IsA("BasePart") then table.insert(parts,d) end end end
    if #parts==0 then error("no parts") end
    local minX,minY,minZ=math.huge,math.huge,math.huge
    local maxX,maxY,maxZ=-math.huge,-math.huge,-math.huge
    for _,part in ipairs(parts) do
        minX=math.min(minX,part.Position.X-part.Size.X/2); minY=math.min(minY,part.Position.Y-part.Size.Y/2); minZ=math.min(minZ,part.Position.Z-part.Size.Z/2)
        maxX=math.max(maxX,part.Position.X+part.Size.X/2); maxY=math.max(maxY,part.Position.Y+part.Size.Y/2); maxZ=math.max(maxZ,part.Position.Z+part.Size.Z/2)
    end
    local center=v3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2)
    return cf(center.X,center.Y,center.Z),v3(maxX-minX,maxY-minY,maxZ-minZ)
end
Instance = {}
function Instance.new(className)
    local value=setmetatable({ __class = true, ClassName = className, Name = className, Source = "", Archivable=true, __children = {}, __attributes = {} }, mt)
    if value:IsA("BasePart") then value.CFrame=cf(0,0,0); value.Size=v3(1,1,1); value.Transparency=0; value.Locked=false end
    if value:IsA("GuiObject") then value.Visible=true end
    return value
end
local root = setmetatable({ __class = true, ClassName = "DataModel", Name = "game", __children = {} }, mt)
local services = {}
local function addService(name) local item = Instance.new(name); item.Name = name; item.Parent = root; services[name] = item end
for _, name in ipairs({"Workspace","ReplicatedStorage","ServerScriptService","ServerStorage","StarterGui","StarterPack","StarterPlayer","ReplicatedFirst","Lighting","SoundService","Teams","TextChatService","MaterialService"}) do addService(name) end
function root:GetService(name) if services[name] then return services[name] end; error("missing service " .. name) end
game = root
workspace = services.Workspace
local camera=Instance.new("Camera"); camera.Name="Camera"; camera.CFrame=cf(0,10,20); camera.FieldOfView=70; camera.ViewportSize=v3(1280,720,0); camera.Parent=workspace; workspace.CurrentCamera=camera
local terrain=Instance.new("Terrain"); terrain.Name="Terrain"; terrain.Parent=workspace
terrain.calls = {}
function terrain:FillBlock(cframe, size, material) table.insert(self.calls, { action="fill_block", cframe=cframe, size=size, material=material }) end
function terrain:Clear() table.insert(self.calls, { action="clear" }) end
function terrain:FillBall(center, radius, material) table.insert(self.calls, { action="fill_ball", center=center, radius=radius, material=material }) end
function terrain:FillRegion(region, resolution, material) table.insert(self.calls, { action="fill_region", region=region, resolution=resolution, material=material }) end
function terrain:ReplaceMaterial(region, resolution, source, target) table.insert(self.calls, { action="replace_material", region=region, resolution=resolution, source=source, target=target }) end
function terrain:WriteVoxels(region, resolution, materials, occupancy) table.insert(self.calls, { action="write_voxels", region=region, resolution=resolution, materials=materials, occupancy=occupancy }) end
local starterPlayerScripts=Instance.new("StarterPlayerScripts"); starterPlayerScripts.Name="StarterPlayerScripts"; starterPlayerScripts.Parent=services.StarterPlayer
local starterCharacterScripts=Instance.new("StarterCharacterScripts"); starterCharacterScripts.Name="StarterCharacterScripts"; starterCharacterScripts.Parent=services.StarterPlayer
for _, className in ipairs({"ChatWindowConfiguration","ChatInputBarConfiguration","ChannelTabsConfiguration","BubbleChatConfiguration"}) do
    local config=Instance.new(className); config.Name=className; config.Parent=services.TextChatService; services.TextChatService[className]=config
end

local editor = {}
function editor:GetEditorSource(scriptObject) return scriptObject.Source end
function editor:UpdateSourceAsync(scriptObject, callback) scriptObject.Source = callback(scriptObject.Source) end
local history = { log = {}, recording = nil, nextId = 0, refuse = false, finishError = false }
function history:TryBeginRecording(name, displayName) if self.refuse or self.recording then return nil end; self.nextId += 1; self.recording = "r" .. self.nextId; table.insert(self.log, "begin:" .. name); return self.recording end
function history:FinishRecording(id, operation)
    if id ~= self.recording then error("wrong recording") end
    if self.finishError and tostring(operation) == "Commit" then self.finishError = false; error("commit failed") end
    table.insert(self.log, tostring(operation)); self.recording = nil
end
function history:SetWaypoint(name) table.insert(self.log, "waypoint:" .. name) end
local runService = { edit = true, running = false, runMode = false }
function runService:IsEdit() return self.edit end
function runService:IsRunning() return self.running end
function runService:IsRunMode() return self.runMode end
-- As documented (Engine API, RunService:IsRunMode): a simulation started with Run() does NOT set
-- IsRunMode — only Studio's own Run button does. The mock used to set it, which is how 43 tests passed
-- over a plugin that could not stop its own playtest (2026-09-22, run fad0ab1b).
-- And IsEdit() STAYS TRUE under Run(): measured 2026-09-22 (run 604bfd32), Apple's writes were
-- admitted as edit mode while its own simulation ran. Only IsRunning() tells the two apart.
function runService:Run() self.running=true end
function runService:PressRunButton() self.running=true; self.runMode=true end
function runService:Pause() self.running=false end
function runService:Stop() self.running=false; self.runMode=false; self.edit=true end
local selection = { values = {} }
function selection:Get() return self.values end
function selection:Set(v) self.values = v end
local logs = { values = {} }
function logs:GetLogHistory() return self.values end
services.ScriptEditorService = editor
services.ChangeHistoryService = history
services.RunService = runService
services.Selection = selection
services.LogService = logs

-- STUDIOTESTSERVICE, AS DOCUMENTED (Engine API reference, StudioTestService, read 2026-09-23):
-- ExecutePlayModeAsync(args) starts a solo Test session on a COPY of the place, yields until it
-- ends, and returns the value the server passed to EndTest — or nil if the test ended by other
-- means. It errors if a test session is already running. GetTestArgs returns args to the server;
-- from a client LocalScript it "may fail", so the client half here refuses it. EndTest must be
-- called from the server DataModel.
--
-- The session is SIMULATED, not reimplemented: a cooperative scheduler with a virtual clock, one
-- player whose character spawns, StarterGui copied into PlayerGui on spawn, a RemoteEvent that
-- carries calls between the two halves, and Touched fired when a character is pivoted into a
-- part. The only Scripts it runs are the copied ones whose Source is non-empty — in these suites
-- that is exactly the harness the plugin inserted, run the way Studio would run it. A test models
-- the customer's own game with the config callbacks (onServer, onClient) instead of source text.
local studioTest = { EditModeActive = true, running = false, sessions = 0, lastArgs = nil, onSession = nil }
function studioTest:ExecutePlayModeAsync(args)
    if self.running then error("StudioTestService: a test session is already running") end
    self.running = true; self.EditModeActive = false; self.sessions += 1; self.lastArgs = args
    local ok, result = pcall(function() if self.onSession then return self.onSession(args) end; return nil end)
    self.running = false; self.EditModeActive = true
    if not ok then error(result, 0) end
    return result
end
services.StudioTestService = studioTest

local function simulatePlaySession(config)
    config = config or {}
    return function(args)
        local world = { now = 0, threads = {}, result = nil, ended = false, serverLog = {}, clientLog = {}, config = config }
        local function schedule(co, at, packed) table.insert(world.threads, { co = co, at = at, args = packed }) end
        local taskLib = {}
        function taskLib.wait(t) coroutine.yield(t or 0); return t or 0 end
        function taskLib.delay(t, fn, ...) schedule(coroutine.create(fn), world.now + (t or 0), table.pack(...)) end
        function taskLib.spawn(fn, ...) schedule(coroutine.create(fn), world.now, table.pack(...)) end
        taskLib.defer = taskLib.spawn
        local function signal()
            local s = { handlers = {} }
            function s:Connect(fn) local c = { fn = fn, on = true }; function c:Disconnect() self.on = false end; table.insert(self.handlers, c); return c end
            function s:Fire(...) for _, c in ipairs(self.handlers) do if c.on then taskLib.spawn(c.fn, ...) end end end
            return s
        end
        world.signal = signal
        local base = tonumber(args and args.since) or 0
        local osLib = setmetatable({ clock = function() return world.now end, time = function() return base + math.floor(world.now) end }, { __index = os })
        local function copyOf(name) local copy = game:GetService(name):Clone(); copy.Name = name; return copy end
        local shared = { Workspace = copyOf("Workspace"), ReplicatedFirst = copyOf("ReplicatedFirst"), ReplicatedStorage = copyOf("ReplicatedStorage"),
            ServerScriptService = copyOf("ServerScriptService"), StarterGui = copyOf("StarterGui") }
        world.workspace = shared.Workspace
        for _, node in ipairs(shared.Workspace:GetDescendants()) do if node:IsA("BasePart") then node.Touched = signal() end end
        local function logService(list) return { GetLogHistory = function() local out = {}; for i, e in ipairs(list) do out[i] = e end; return out end } end
        local serverContext, clientContext = { Error = signal() }, { Error = signal() }
        world.serverContext, world.clientContext = serverContext, clientContext
        function world.serverError(message, source) table.insert(world.serverLog, { message = message, messageType = "Enum.MessageType.MessageError", timestamp = osLib.time() }); serverContext.Error:Fire(message, "", source) end
        function world.clientError(message, source) table.insert(world.clientLog, { message = message, messageType = "Enum.MessageType.MessageError", timestamp = osLib.time() }); clientContext.Error:Fire(message, "", source) end
        function world.clientWarning(message) table.insert(world.clientLog, { message = message, messageType = "Enum.MessageType.MessageWarning", timestamp = osLib.time() }) end
        local joined = {}
        local players = { LocalPlayer = nil, PlayerAdded = signal() }
        function players:GetPlayers() local out = {}; for i, p in ipairs(joined) do out[i] = p end; return out end
        local player = Instance.new("Player"); player.Name = "Player1"
        local playerGui = Instance.new("PlayerGui"); playerGui.Name = "PlayerGui"; playerGui.Parent = player
        world.player, world.playerGui = player, playerGui
        players.LocalPlayer = player
        local function newInstance(className)
            local inst = Instance.new(className)
            if className == "RemoteEvent" then
                inst.OnServerEvent = signal(); inst.OnClientEvent = signal()
                inst.FireClient = function(self, _target, ...) self.OnClientEvent:Fire(...) end
                inst.FireServer = function(self, ...) self.OnServerEvent:Fire(player, ...) end
            end
            return inst
        end
        local function dataModel(side)
            local dm = { ClassName = "DataModel", Name = "game" }
            local sessionTest = {}
            function sessionTest:GetTestArgs() if side == "client" then error("GetTestArgs failed from a client LocalScript") end; return args end
            function sessionTest:EndTest(value)
                if side ~= "server" then error("EndTest must be called from the server DataModel") end
                if not world.ended then world.ended = true; world.result = value end
            end
            local map = { Players = players, StudioTestService = sessionTest, Workspace = shared.Workspace, ReplicatedStorage = shared.ReplicatedStorage,
                ReplicatedFirst = shared.ReplicatedFirst, ServerScriptService = shared.ServerScriptService, StarterGui = shared.StarterGui,
                LogService = logService(if side == "server" then world.serverLog else world.clientLog),
                ScriptContext = if side == "server" then serverContext else clientContext }
            function dm:GetService(name) if map[name] == nil then error("missing play service " .. name) end; return map[name] end
            function dm:FindFirstChild(name) return map[name] end
            return dm
        end
        local serverGame, clientGame = dataModel("server"), dataModel("client")
        world.serverGame, world.clientGame = serverGame, clientGame
        local function runScript(scriptCopy, dm)
            local fn, compileErr = loadstring(scriptCopy.Source, "=" .. scriptCopy.Name)
            if not fn then error("harness did not compile: " .. tostring(compileErr)) end
            setfenv(fn, setmetatable({ game = dm, workspace = shared.Workspace, script = scriptCopy, task = taskLib, os = osLib, Instance = { new = newInstance },
                print = function() end, warn = function() end }, { __index = getfenv(1) }))
            schedule(coroutine.create(fn), world.now, table.pack())
        end
        if config.onServer then config.onServer(world) end
        for _, node in ipairs(shared.ServerScriptService:GetDescendants()) do if node.ClassName == "Script" and node.Source ~= "" then runScript(node, serverGame) end end
        for _, node in ipairs(shared.ReplicatedFirst:GetDescendants()) do if node.ClassName == "LocalScript" and node.Source ~= "" then runScript(node, clientGame) end end
        if not config.noPlayer then
            taskLib.delay(0.5, function()
                table.insert(joined, player); players.PlayerAdded:Fire(player)
                if config.noCharacter then return end
                taskLib.wait(0.5)
                local character = Instance.new("Model"); character.Name = player.Name
                local root = Instance.new("Part"); root.Name = "HumanoidRootPart"; root.Size = v3(2, 2, 1); root.Parent = character
                character.PivotTo = function(self, cframe)
                    root.CFrame = cframe
                    for _, part in ipairs(shared.Workspace:GetDescendants()) do
                        if part ~= root and part.Touched and part.Parent ~= nil then
                            local d = part.Position - cframe.Position
                            if math.abs(d.X) <= part.Size.X / 2 + 1 and math.abs(d.Y) <= part.Size.Y / 2 + 1 and math.abs(d.Z) <= part.Size.Z / 2 + 1 then part.Touched:Fire(root) end
                        end
                    end
                end
                character.Parent = shared.Workspace
                player.Character = character
                for _, gui in ipairs(shared.StarterGui:GetChildren()) do local copy = gui:Clone(); if copy then copy.Parent = playerGui end end
                if config.onClient then config.onClient(world) end
            end)
        end
        -- The scheduler. A stopped-by-hand session ends at stopAt without anyone calling EndTest.
        local limit = config.stopAt or 120
        activePlayTask = taskLib
        while not world.ended and #world.threads > 0 do
            table.sort(world.threads, function(a, b) return a.at < b.at end)
            local item = table.remove(world.threads, 1)
            if item.at > limit then break end
            world.now = math.max(world.now, item.at)
            local ok, yielded = coroutine.resume(item.co, table.unpack(item.args, 1, item.args.n))
            if not ok then activePlayTask = nil; error("play session script failed: " .. tostring(yielded), 0) end
            if coroutine.status(item.co) == "suspended" then schedule(item.co, world.now + (tonumber(yielded) or 0), table.pack()) end
        end
        activePlayTask = nil
        world.harnessInEditDuringSession = 0
        for _, container in ipairs({ services.ServerScriptService, services.ReplicatedFirst }) do
            for _, node in ipairs(container:GetDescendants()) do if node:GetAttribute("__ApplePlayCheckHarnessV1") ~= nil then world.harnessInEditDuringSession += 1 end end
        end
        studioTest.lastWorld = world
        return world.result
    end
end
require = function() error("generated source must never be loaded by Commands") end

local passed, failed, failures = 0, 0, {}
local function spec(name, fn) local ok, err = pcall(fn); if ok then passed += 1 else failed += 1; table.insert(failures, name .. ": " .. tostring(err)) end end
local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local function has(text, needle) if not string.find(tostring(text), needle, 1, true) then error("expected " .. tostring(text) .. " to contain " .. needle, 2) end end
local function report() print(("commands: %d passed%s"):format(passed, if failed > 0 then ", " .. failed .. " FAILED" else "")); for _, e in ipairs(failures) do print(e) end; if failed > 0 then error("command specs failed") end end
`;

/**
 * The op families under src/ops/, as Luau that evaluates to the list `src/ops/init.luau` returns in
 * Studio: `local OP_FAMILIES_UNDER_TEST = { <each family module> }`. Each module is embedded
 * byte-for-byte and evaluated in place — nothing is loaded through `require`, which the prelude
 * keeps a hard error. A suite passes the list as `Commands.new({ opFamilies = ... })`.
 */
export const OP_FAMILY_FILES = readdirSync(new URL('../src/ops/', import.meta.url))
  .filter((name) => name.endsWith('.luau') && name !== 'init.luau').sort();
export function opFamilySources() {
  return Object.fromEntries(OP_FAMILY_FILES.map((name) => [name, readFileSync(new URL(`../src/ops/${name}`, import.meta.url), 'utf8')]));
}
export function opFamiliesChunk() {
  const bodies = Object.values(opFamilySources()).map((src) => `(function()\n${src}\nend)()`);
  return `local OP_FAMILIES_UNDER_TEST = {\n${bodies.join(',\n')}\n}\n`;
}
