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
	elseif t == "Vector2" then return Vector2.new(v[1], v[2])
	elseif t == "NumberRange" then return NumberRange.new(v[1], v[2] or v[1])
	elseif t == "Rect" then return Rect.new(v[1], v[2], v[3], v[4])
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
	elseif ty == "Vector2" then return { t = "Vector2", v = { value.X, value.Y } }
	elseif ty == "NumberRange" then return { t = "NumberRange", v = { value.Min, value.Max } }
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

-- asset references — the plugin's half of the licence gate -------------------
--
-- An asset id reaches a place through `insert_asset`, which the worker issues only after checking
-- the id's type, price, moderation state and script-freedom. A typed property carrying an id walks
-- past all of that: MeshId, Decal.Texture, Sound.SoundId, Animation.AnimationId and the Sky faces
-- pull third-party content in with no licence classification and no provenance row. Nothing
-- executable rides in that way, so this is a licence-and-provenance hole rather than code
-- execution — but it is still an import, and imports are the thing the gate exists to see.
--
-- It is closed HERE rather than only in the worker because the plugin is what performs the
-- assignment. A check in the sender is a convention the next producer of ops forgets; a check in
-- the receiver is a property of the system. The plugin cannot verify anything itself — a plugin's
-- HttpService cannot reach apis.roblox.com and has nowhere safe to hold a key — so it does not
-- try. It refuses every reference it was not explicitly told about.
--
-- Attributes are deliberately NOT gated. `SetAttribute` has no Content type, so the most an
-- attribute can hold is the text of an id, and text does not load anything.
export type AssetPolicy = {
	--- Ids this session has already put through the gate. Nothing else may be referenced.
	allow: { [number]: boolean },
	--- Set ONLY while re-materialising a snapshot of this same place. Every id in a snapshot was
	--- already here, so a rollback that stripped MeshIds would destroy the user's own work.
	preexisting: boolean,
}

-- nil is CLOSED: a caller that has stated no policy may not reference an asset at all, so a call
-- site added later fails loudly instead of inheriting a permission nobody granted it.
local assetPolicy: AssetPolicy? = nil

--- Ops.execute owns this — it opens a policy for the duration of one op and closes it after.
--- Nothing inside that window yields, so a second op cannot observe another op's policy.
function Paths.setAssetPolicy(policy: AssetPolicy?)
	assetPolicy = policy
end

-- Properties whose value is a reference to external content rather than data. The check keys on
-- the property NAME and not on the codec tag because the engine resolves an asset id assigned as a
-- plain string exactly as it resolves one tagged `Content`: gating only `t = "Content"` would leave
-- `{ t = "string", v = "rbxassetid://…" }` as an open door.
local ASSET_PROPS: { [string]: boolean } = {
	-- MeshPart, SpecialMesh, FileMesh, Tool
	MeshId = true, MeshContent = true, TextureID = true, TextureId = true, TextureContent = true,
	-- Decal, Texture, ParticleEmitter, Beam, Trail
	Texture = true,
	-- ImageLabel, ImageButton, ImageHandleAdornment
	Image = true, HoverImage = true, PressedImage = true,
	-- Sound, Animation, VideoFrame
	SoundId = true, AnimationId = true, Video = true,
	-- Sky
	SkyboxBk = true, SkyboxDn = true, SkyboxFt = true, SkyboxLf = true, SkyboxRt = true,
	SkyboxUp = true, MoonTextureId = true, SunTextureId = true,
	-- SurfaceAppearance, MaterialVariant
	ColorMap = true, MetalnessMap = true, NormalMap = true, RoughnessMap = true,
	-- Shirt, Pants, ShirtGraphic
	ShirtTemplate = true, PantsTemplate = true, Graphic = true,
	-- HumanoidDescription names whole avatar assets by bare number, not by URI
	Face = true, Head = true, Torso = true, LeftArm = true, RightArm = true, LeftLeg = true,
	RightLeg = true, Shirt = true, Pants = true, GraphicTShirt = true,
	HatAccessory = true, HairAccessory = true, FaceAccessory = true, NeckAccessory = true,
	ShoulderAccessory = true, FrontAccessory = true, BackAccessory = true, WaistAccessory = true,
}

--- Ids named by a string that is unambiguously a Roblox asset reference, or nil when it names no
--- asset. An EMPTY list means "a reference whose id could not be read" and is refused exactly like
--- an unverified one — an unrecognised shape is never waved through.
local function assetUriIds(str: string): { number }?
	local scheme = string.lower(str)
	if string.match(scheme, "^rbxassetid://") then
		local id = tonumber(string.match(str, "^%a+://(%d+)"))
		return if id then { id } else {}
	end
	if string.match(scheme, "^rbxthumb://") or string.match(scheme, "^rbxhttp://") or string.match(scheme, "^rbxgameasset://") then
		-- rbxthumb carries width and height beside the id, so only an explicit `id=` is read.
		-- rbxgameasset names an asset by alias and never carries an id at all, so it always lands
		-- on the empty result: an alias cannot be checked against a list of verified ids.
		local id = tonumber(string.match(str, "id=(%d+)"))
		return if id then { id } else {}
	end
	return nil
end

--- Every asset id this assignment would import, or nil when it imports nothing.
local function assetIdsIn(name: string, pv: PropValue, value: any): { number }?
	local contentProp = ASSET_PROPS[name] == true or pv.t == "Content"

	if type(value) == "number" then
		-- Only a content property gives a bare number an asset meaning; anywhere else it is data.
		return if contentProp and value > 0 and value % 1 == 0 then { value } else nil
	end
	if type(value) ~= "string" then
		return if contentProp and value ~= nil then {} else nil
	end

	local str = string.match(value, "^%s*(.-)%s*$") :: string
	if str == "" then return nil end -- clearing a property imports nothing
	-- rbxasset:// is content shipped inside the engine itself: first-party, no licence question.
	if string.match(string.lower(str), "^rbxasset://") then return nil end

	local uri = assetUriIds(str)
	if uri then return uri end
	-- On an ordinary property a string is inert: no engine path turns TextLabel.Text into a fetch.
	if not contentProp then return nil end

	if string.match(string.lower(str), "^https?://") then
		local id = tonumber(string.match(str, "id=(%d+)"))
		return if id then { id } else {}
	end
	-- Legacy bare-id forms: "1234", and HumanoidDescription's comma-separated accessory lists.
	if string.match(str, "^[%d,%s]+$") then
		local out = {}
		for digits in string.gmatch(str, "%d+") do
			table.insert(out, tonumber(digits) :: number)
		end
		return out
	end
	return {}
end

--- Nil when every id named may be referenced; otherwise the refusal to raise. The message names
--- the gated tool on purpose — an agent that cannot read what to do instead just retries the same
--- assignment, and a refusal it cannot act on is indistinguishable from a bug.
local function refuseAssetRefs(name: string, ids: { number }): string?
	local policy = assetPolicy
	if policy and policy.preexisting then return nil end
	if #ids == 0 then
		return ("%s: refusing external content whose asset id cannot be read, so it cannot be checked against what this session verified. Insert assets with insert_asset."):format(name)
	end
	local blocked = {}
	for _, id in ids do
		if not (policy and policy.allow[id]) then table.insert(blocked, tostring(id)) end
	end
	if #blocked == 0 then return nil end
	return ("%s: asset %s is not verified in this session, so it will not be referenced. An asset id reaches a place only through insert_asset, which checks its type, licence and script-freedom first — find one with find_verified_asset, insert it, then set %s. With no verified id, build the geometry from Parts instead."):format(
		name,
		table.concat(blocked, ", "),
		name
	)
end

function Paths.setProp(inst: Instance, name: string, pv: PropValue): boolean
	local value = Paths.decode(pv)
	local ids = assetIdsIn(name, pv, value)
	if ids then
		local refusal = refuseAssetRefs(name, ids)
		if refusal then error(refusal) end
	end
	local target = inst :: any
	target[name] = value
	return true
end

return Paths
