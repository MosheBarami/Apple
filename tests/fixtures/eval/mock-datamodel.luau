--!nocheck
-- A small stand-in for the Roblox DataModel, just enough for scripts/eval/luau/world-state.luau to run
-- under the plain `luau` interpreter. It models instances (a tree with Name, ClassName, Parent, children,
-- properties), a class hierarchy for IsA, the services the script touches, Vector3, Color3, CFrame, Enum,
-- and HttpService's JSON. It is a test double: what it proves is the script's LOGIC (what it keeps, what it
-- destroys, what it measures), never how real Studio behaves.

local state = setmetatable({}, { __mode = "k" })

local PARENT_CLASS = {
	Part = "BasePart", SpawnLocation = "Part", MeshPart = "BasePart", BasePart = "PVInstance", Model = "PVInstance",
	PVInstance = "Instance", Folder = "Instance", Decal = "Instance", Sky = "Instance", Atmosphere = "Instance",
	BloomEffect = "Instance", ColorGradingEffect = "Instance", Sound = "Instance", Camera = "Instance",
	Terrain = "Instance", TouchTransmitter = "Instance", RemoteEvent = "Instance",
	ScreenGui = "LayerCollector", LayerCollector = "Instance",
	Frame = "GuiObject", TextLabel = "GuiObject", TextButton = "GuiObject", ImageLabel = "GuiObject", GuiObject = "Instance",
	Script = "LuaSourceContainer", LocalScript = "LuaSourceContainer", ModuleScript = "LuaSourceContainer",
	LuaSourceContainer = "Instance",
}

local function classIsA(class, target)
	while class do
		if class == target then
			return true
		end
		class = PARENT_CLASS[class]
	end
	return false
end

local function Vector3_new(x, y, z)
	return { X = x, Y = y, Z = z }
end
local Vector3 = { new = Vector3_new }

local Color3 = { new = function(r, g, b) return { R = r, G = g, B = b } end }

local function CFrame_new(x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22)
	if r00 == nil then
		r00, r01, r02, r10, r11, r12, r20, r21, r22 = 1, 0, 0, 0, 1, 0, 0, 0, 1
	end
	local comps = { x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 }
	local cf = {
		Position = Vector3_new(x, y, z),
		RightVector = Vector3_new(r00, r10, r20),
		UpVector = Vector3_new(r01, r11, r21),
		LookVector = Vector3_new(-r02, -r12, -r22),
		GetComponents = function()
			return table.unpack(comps)
		end,
	}
	return cf
end
local CFrame = { new = CFrame_new }

-- A rotation of `deg` degrees about Y, for the scenarios.
function CFrame.rotY(x, y, z, deg)
	local c, s = math.cos(math.rad(deg)), math.sin(math.rad(deg))
	return CFrame_new(x, y, z, c, 0, s, 0, 1, 0, -s, 0, c)
end

local Enum = setmetatable({}, {
	__index = function(_, enumName)
		return setmetatable({}, { __index = function(_, item) return { Name = item, EnumType = enumName } end })
	end,
})

local DEFAULTS = {
	BasePart = function()
		return {
			Size = Vector3_new(4, 1, 2), CFrame = CFrame_new(0, 0, 0), Anchored = false, CanCollide = true,
			Transparency = 0, Reflectance = 0, Material = Enum.Material.Plastic, Color = Color3.new(0.63, 0.63, 0.63),
		}
	end,
	ScreenGui = function() return { Enabled = true } end,
	TextLabel = function() return { Text = "Label" } end,
	TextButton = function() return { Text = "Button" } end,
}

local methods = {}
local function descendantsOf(inst, out)
	for _, child in ipairs(state[inst].children) do
		table.insert(out, child)
		descendantsOf(child, out)
	end
	return out
end

local Instance = {}
local instMt = {}

local function detach(inst)
	local st = state[inst]
	if st.parent then
		local siblings = state[st.parent].children
		for i, c in ipairs(siblings) do
			if c == inst then
				table.remove(siblings, i)
				break
			end
		end
		st.parent = nil
	end
end

function methods.GetChildren(self)
	return table.clone(state[self].children)
end
function methods.GetDescendants(self)
	return descendantsOf(self, {})
end
function methods.IsA(self, target)
	return classIsA(state[self].class, target)
end
function methods.FindFirstChild(self, name)
	for _, c in ipairs(state[self].children) do
		if state[c].name == name then
			return c
		end
	end
	return nil
end
function methods.FindFirstChildOfClass(self, class)
	for _, c in ipairs(state[self].children) do
		if state[c].class == class then
			return c
		end
	end
	return nil
end
function methods.Destroy(self)
	detach(self)
	state[self].destroyed = true
end
function methods.CountCells(self)
	return state[self].props.cells or 0
end
function methods.Clear(self)
	state[self].props.cells = 0
end

instMt.__index = function(self, key)
	local st = state[self]
	if methods[key] then
		return methods[key]
	end
	if key == "Name" then
		return st.name
	elseif key == "ClassName" then
		return st.class
	elseif key == "Parent" then
		return st.parent
	elseif key == "Position" and st.props.CFrame then
		return st.props.CFrame.Position
	end
	local v = st.props[key]
	if v ~= nil then
		return v
	end
	for _, c in ipairs(st.children) do
		if state[c].name == key then
			return c
		end
	end
	return nil
end
instMt.__newindex = function(self, key, value)
	local st = state[self]
	if key == "Parent" then
		detach(self)
		if value then
			st.parent = value
			table.insert(state[value].children, self)
		end
	elseif key == "Name" then
		st.name = value
	else
		st.props[key] = value
	end
end

function Instance.new(class, parent)
	local inst = setmetatable({}, instMt)
	local props = {}
	local c = class
	while c do
		if DEFAULTS[c] then
			for k, v in pairs(DEFAULTS[c]()) do
				if props[k] == nil then
					props[k] = v
				end
			end
		end
		c = PARENT_CLASS[c]
	end
	state[inst] = { name = class, class = class, parent = nil, children = {}, props = props }
	if parent then
		inst.Parent = parent
	end
	return inst
end

-- ------------------------------------------------------------------ JSON
local function encode(v)
	local t = type(v)
	if t == "nil" then
		return "null"
	elseif t == "boolean" then
		return v and "true" or "false"
	elseif t == "number" then
		return string.format("%.10g", v)
	elseif t == "string" then
		return '"' .. v:gsub('[%c"\\]', function(ch)
			if ch == '"' then return '\\"' elseif ch == "\\" then return "\\\\" end
			return string.format("\\u%04x", string.byte(ch))
		end) .. '"'
	elseif t == "table" then
		local n = 0
		for _ in pairs(v) do
			n += 1
		end
		if n == 0 or #v == n then
			local parts = {}
			for i = 1, #v do
				parts[i] = encode(v[i])
			end
			return "[" .. table.concat(parts, ",") .. "]"
		end
		local keys = {}
		for k in pairs(v) do
			table.insert(keys, k)
		end
		table.sort(keys)
		local parts = {}
		for _, k in ipairs(keys) do
			table.insert(parts, encode(tostring(k)) .. ":" .. encode(v[k]))
		end
		return "{" .. table.concat(parts, ",") .. "}"
	end
	error("cannot encode " .. t)
end

local function decode(s)
	local i = 1
	local function ws()
		i = string.find(s, "[^ \t\r\n]", i) or #s + 1
	end
	local value
	local function str()
		local out = {}
		i += 1
		while true do
			local ch = string.sub(s, i, i)
			if ch == '"' then
				i += 1
				return table.concat(out)
			elseif ch == "\\" then
				local nxt = string.sub(s, i + 1, i + 1)
				if nxt == "u" then
					table.insert(out, utf8.char(tonumber(string.sub(s, i + 2, i + 5), 16)))
					i += 6
				else
					local map = { n = "\n", t = "\t", r = "\r", b = "\b", f = "\f" }
					table.insert(out, map[nxt] or nxt)
					i += 2
				end
			else
				table.insert(out, ch)
				i += 1
			end
		end
	end
	function value()
		ws()
		local ch = string.sub(s, i, i)
		if ch == "{" then
			local obj = {}
			i += 1
			ws()
			if string.sub(s, i, i) == "}" then
				i += 1
				return obj
			end
			while true do
				ws()
				local k = str()
				ws()
				i += 1 -- the colon
				obj[k] = value()
				ws()
				local sep = string.sub(s, i, i)
				i += 1
				if sep == "}" then
					return obj
				end
			end
		elseif ch == "[" then
			local arr = {}
			i += 1
			ws()
			if string.sub(s, i, i) == "]" then
				i += 1
				return arr
			end
			while true do
				table.insert(arr, value())
				ws()
				local sep = string.sub(s, i, i)
				i += 1
				if sep == "]" then
					return arr
				end
			end
		elseif ch == '"' then
			return str()
		elseif string.sub(s, i, i + 3) == "true" then
			i += 4
			return true
		elseif string.sub(s, i, i + 4) == "false" then
			i += 5
			return false
		elseif string.sub(s, i, i + 3) == "null" then
			i += 4
			return nil
		end
		local num = string.match(s, "^-?[%d%.eE+-]+", i)
		i += #num
		return tonumber(num)
	end
	return value()
end

local HttpService = { JSONEncode = function(_, v) return encode(v) end, JSONDecode = function(_, s) return decode(s) end }

-- ------------------------------------------------------------------ the DataModel
local SERVICE_NAMES = {
	"Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack",
	"StarterPlayer", "ReplicatedFirst", "Lighting", "SoundService", "Teams", "TextChatService", "MaterialService",
}
local services = {}
for _, name in ipairs(SERVICE_NAMES) do
	services[name] = Instance.new(name)
end
PARENT_CLASS.Workspace = "Instance"

local game = {}
function game:GetService(name)
	if name == "HttpService" then
		return HttpService
	end
	local s = services[name]
	if not s then
		error("not a service: " .. name)
	end
	return s
end
local workspace = services.Workspace
