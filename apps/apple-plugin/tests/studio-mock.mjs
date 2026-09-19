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
function CFrame.new(...) local a={...}; return cf(a[1] or 0,a[2] or 0,a[3] or 0) end
function CFrame.Angles(...) return cf(0,0,0) end
function CFrame.lookAt(origin, target) return cf(origin.X,origin.Y,origin.Z) end
function cfmt:GetComponents() return table.unpack(self._c) end
function cfmt:VectorToWorldSpace(value) return value end
cfmt.__mul = function(a,b) return cf(a.Position.X+b.Position.X,a.Position.Y+b.Position.Y,a.Position.Z+b.Position.Z) end
cfmt.__add = function(a,b) return cf(a.Position.X+b.X,a.Position.Y+b.Y,a.Position.Z+b.Z) end
Enum = { FinishRecordingOperation = { Commit = "Commit", Cancel = "Cancel" }, Material = { SmoothPlastic = "Enum.Material.SmoothPlastic" }, Font = { SourceSans = "Enum.Font.SourceSans" } }

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
    if wanted == "GuiObject" then return self.ClassName == "Frame" or self.ClassName == "TextLabel" or self.ClassName == "TextButton" or self.ClassName == "TextBox" or self.ClassName == "ScrollingFrame" end
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
local runService = { edit = true }
function runService:IsEdit() return self.edit end
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
require = function() error("generated source must never be loaded by Commands") end

local passed, failed, failures = 0, 0, {}
local function spec(name, fn) local ok, err = pcall(fn); if ok then passed += 1 else failed += 1; table.insert(failures, name .. ": " .. tostring(err)) end end
local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local function has(text, needle) if not string.find(tostring(text), needle, 1, true) then error("expected " .. tostring(text) .. " to contain " .. needle, 2) end end
local function report() print(("commands: %d passed%s"):format(passed, if failed > 0 then ", " .. failed .. " FAILED" else "")); for _, e in ipairs(failures) do print(e) end; if failed > 0 then error("command specs failed") end end
`;
