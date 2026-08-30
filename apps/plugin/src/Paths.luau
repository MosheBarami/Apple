--!strict
-- Path resolution + typed property codec. Paths look like:
--   game.Workspace.Lobby.Door   or   game.Workspace["My Part"].Handle
local Paths = {}

local SERVICES_OK = {
	Workspace = true, ReplicatedStorage = true, ServerScriptService = true,
	ServerStorage = true, StarterGui = true, StarterPack = true, StarterPlayer = true,
	Lighting = true, SoundService = true, Teams = true, TextChatService = true,
	ReplicatedFirst = true, MaterialService = true,
}

function Paths.parse(path: string): { string }
	local segs = {}
	local i = 1
	local n = #path
	local cur = ""
	while i <= n do
		local ch = string.sub(path, i, i)
		if ch == "." then
			if #cur > 0 then table.insert(segs, cur) end
			cur = ""
			i += 1
		elseif ch == "[" then
			if #cur > 0 then table.insert(segs, cur) end
			cur = ""
			local quote = string.sub(path, i + 1, i + 1)
			if quote == '"' or quote == "'" then
				local closeAt = string.find(path, quote .. "]", i + 2, true)
				if not closeAt then error("unclosed bracket in path: " .. path) end
				table.insert(segs, string.sub(path, i + 2, closeAt - 1))
				i = closeAt + 2
			else
				error("expected quote after [ in path: " .. path)
			end
		else
			cur ..= ch
			i += 1
		end
	end
	if #cur > 0 then table.insert(segs, cur) end
	return segs
end

function Paths.resolve(path: string): Instance
	local segs = Paths.parse(path)
	if segs[1] ~= "game" then error('path must start with "game": ' .. path) end
	local node: Instance = game
	for idx = 2, #segs do
		local name = segs[idx]
		local nxt: Instance? = nil
		if idx == 2 then
			if name == "Workspace" or name == "workspace" then
				nxt = game:GetService("Workspace")
			elseif SERVICES_OK[name] then
				local ok, svc = pcall(function() return game:GetService(name) end)
				nxt = if ok then svc else nil
			end
		end
		if not nxt then nxt = node:FindFirstChild(name) end
		if not nxt then
			error(("not found: %s (missing %q at depth %d)"):format(path, name, idx - 1))
		end
		node = nxt
	end
	return node
end

local function needsBrackets(name: string): boolean
	return string.find(name, "^[%a_][%w_]*$") == nil
end

function Paths.fullPath(inst: Instance): string
	local parts = {}
	local node: Instance? = inst
	while node and node ~= game do
		table.insert(parts, 1, node.Name)
		node = node.Parent
	end
	local out = "game"
	for _, name in parts do
		if needsBrackets(name) then
			out ..= '["' .. string.gsub(name, '"', '\\"') .. '"]'
		else
			out ..= "." .. name
		end
	end
	return out
end

-- typed value codec (mirrors PropValue in @golem/shared) --------------------
export type PropValue = { t: string, v: any? }

function Paths.decode(pv: any): any
	local t, v = pv.t :: string, pv.v :: any
	if t == "string" then return tostring(v)
	elseif t == "number" then return tonumber(v)
	elseif t == "bool" then return v == true
	elseif t == "Vector3" then return Vector3.new(v[1], v[2], v[3])
	elseif t == "CFrame" then return CFrame.new(table.unpack(v))
	elseif t == "Color3" then return Color3.new(v[1], v[2], v[3])
	elseif t == "UDim2" then return UDim2.new(v[1], v[2], v[3], v[4])
	elseif t == "UDim" then return UDim.new(v[1], v[2])
	elseif t == "EnumItem" then
		local enumName, itemName = string.match(tostring(v), "^Enum%.([%w_]+)%.([%w_]+)$")
		if not enumName then error("bad EnumItem: " .. tostring(v)) end
		return (Enum :: any)[enumName][itemName]
	elseif t == "BrickColor" then return BrickColor.new(tostring(v) :: any)
	elseif t == "Content" then return tostring(v)
	elseif t == "Instance" then return Paths.resolve(tostring(v))
	elseif t == "nil" then return nil
	end
	error("unknown prop type: " .. tostring(t))
end

function Paths.encode(value: any, depth: number?): any
	local d = depth or 0
	local ty = typeof(value)
	if ty == "string" then return { t = "string", v = value }
	elseif ty == "number" then return { t = "number", v = value }
	elseif ty == "boolean" then return { t = "bool", v = value }
	elseif ty == "Vector3" then return { t = "Vector3", v = { value.X, value.Y, value.Z } }
	elseif ty == "CFrame" then return { t = "CFrame", v = { value:GetComponents() } }
	elseif ty == "Color3" then return { t = "Color3", v = { value.R, value.G, value.B } }
	elseif ty == "UDim2" then return { t = "UDim2", v = { value.X.Scale, value.X.Offset, value.Y.Scale, value.Y.Offset } }
	elseif ty == "UDim" then return { t = "UDim", v = { value.Scale, value.Offset } }
	elseif ty == "EnumItem" then return { t = "EnumItem", v = tostring(value) }
	elseif ty == "BrickColor" then return { t = "BrickColor", v = tostring(value) }
	elseif ty == "Instance" then return { t = "Instance", v = Paths.fullPath(value) }
	elseif ty == "nil" then return { t = "nil" }
	elseif ty == "table" and d < 4 then
		local out = {}
		local count = 0
		for k, v in value do
			count += 1
			if count > 40 then break end
			out[tostring(k)] = Paths.encode(v, d + 1)
		end
		return out
	end
	return { t = "string", v = tostring(value) }
end

function Paths.setProp(inst: Instance, name: string, pv: PropValue)
	(inst :: any)[name] = Paths.decode(pv)
end

return Paths
