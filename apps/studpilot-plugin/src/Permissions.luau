--!nocheck
-- StudPilot Studio 2.0 permission model: ALLOW BY DEFAULT, DENY A SHORT EXPLICIT LIST.
--
-- Owner decision, 2026-10-08: "i accept the reduced safety". Until 1.5.0 the plugin created only the
-- classes and wrote only the properties on a hand-written allowlist (about a thousand `X = true,` lines
-- in Commands.luau), refused every asset id that did not come from StudPilot's own library, and refused
-- a whole checkpoint (and so every write after it) when the place held a class it had never heard of.
-- A live test on a place with a ~200-script third-party package could read everything and write nothing.
--
-- The rule now, applied by Commands.luau through this module:
--   * any class Roblox's API dump (ApiDump.luau, generated) marks creatable may be created;
--   * any property the dump marks scriptable and writable at plugin security may be set, with any value
--     of its type, on any instance under the place services Commands.luau writes to;
--   * a content property takes any rbxassetid://<digits>, rbxasset://<path> or rbxthumb://<query>
--     (or "" to clear it), so Creator Store and Toolbox assets are usable;
--   * except what DENY below names, each with the reason it stays closed.
-- Kept from 1.x (not decided here): writes only in edit mode and only on a live connection, one
-- ChangeHistoryService recording per op, the typed {t,v} wire format, and script source only through
-- edit_script (ScriptEditorService), never as a property write.

local Permissions = {}

-- Properties no write may set on any class. The reason is returned to the model verbatim.
local DENY_PROPERTY = {
	Source = "script source is written with edit_script (a reviewed edit against a base hash), never as a property",
	LinkedSource = "script source is written with edit_script, never by linking external source",
	Parent = "structure changes go through create/move/delete so each is path-checked and recorded",
	ClassName = "a class cannot be changed after creation",
	Capabilities = "script capability sandboxing is a security setting the agent may not change",
	Sandboxed = "script capability sandboxing is a security setting the agent may not change",
}

-- Classes the agent may neither create nor write to: engine UI, plugin surfaces and security services.
local DENY_CLASS = {
	CoreGui = "Roblox's own UI belongs to the engine",
	CorePackages = "Roblox's own packages belong to the engine",
	RobloxPluginGuiService = "plugin windows belong to Studio",
	PluginGuiService = "plugin windows belong to Studio",
	PluginDebugService = "plugin debugging belongs to Studio",
	HttpService = "network access is a security setting the place owner turns on themselves",
	ScriptContext = "script execution settings are a security boundary",
	NetworkServer = "networking is a security boundary",
	NetworkClient = "networking is a security boundary",
	DataStoreService = "persistent player data is owned by the game's own scripts",
	MarketplaceService = "purchases are owned by the game's own scripts",
}

-- Class-specific security settings, listed even where the class is already denied or out of the
-- write scope, so the reason survives a future widening of either.
local DENY_CLASS_PROPERTY = {
	HttpService = { HttpEnabled = "HTTP requests from game servers are a security setting the place owner turns on themselves" },
	ServerScriptService = { LoadStringEnabled = "loadstring turns text into running code; the place owner turns it on themselves" },
}

-- Script classes are created by edit_script, which writes their source in the same step; the general
-- builder (create_instances) refuses them so a script never exists without reviewed source.
local SCRIPT_CREATE = {
	Script = "create scripts with edit_script (it writes the source in the same step)",
	LocalScript = "create scripts with edit_script (it writes the source in the same step)",
	ModuleScript = "create scripts with edit_script (it writes the source in the same step)",
}

Permissions.DENY_PROPERTY = DENY_PROPERTY
Permissions.DENY_CLASS = DENY_CLASS
Permissions.DENY_CLASS_PROPERTY = DENY_CLASS_PROPERTY
Permissions.SCRIPT_CREATE = SCRIPT_CREATE

local function hasTag(info: any, tag: string): boolean
	return type(info) == "table" and type(info.t) == "string" and string.find("," .. info.t .. ",", "," .. tag .. ",", 1, true) ~= nil
end

-- A content value a write may carry: "" clears it; otherwise one of the three Roblox schemes. The
-- scheme is compared as a word, so the shipped source carries no asset-URL literal.
function Permissions.contentAllowed(text: any): boolean
	if type(text) ~= "string" or #text > 1024 then return false end
	if text == "" then return true end
	local scheme, rest = string.match(text, "^(%l+)://(.+)$")
	if scheme == "rbxassetid" then return string.match(rest, "^%d+$") ~= nil and #rest <= 20 end
	if scheme == "rbxasset" then return string.match(rest, "^[%w_%-%./]+$") ~= nil and string.find(rest, "..", 1, true) == nil end
	if scheme == "rbxthumb" then return string.match(rest, "^[%w_%-%.=&%%]+$") ~= nil end
	return false
end

function Permissions.isContentType(valueType: any): boolean
	return valueType == "ContentId" or valueType == "Content"
end

function Permissions.build(dump: any): any
	local classes = if type(dump) == "table" and type(dump.classes) == "table" then dump.classes else {}
	local P = { version = if type(dump) == "table" then dump.version else nil, denyProperty = DENY_PROPERTY, denyClass = DENY_CLASS }
	local captureCache = {}
	local refProperties = nil
	local contentProperties = nil
	local enumNames = nil

	function P.known(className: string): boolean
		return type(className) == "string" and classes[className] ~= nil
	end

	function P.isA(className: string, ancestor: string): boolean
		local name = className
		local guard = 0
		while type(name) == "string" and guard < 64 do
			if name == ancestor then return true end
			local info = classes[name]
			name = info and info.s
			guard += 1
		end
		return false
	end

	-- Creatable by Instance.new, scripts included (restore recreates them). Returns the refusal reason.
	function P.instantiable(className: any): (boolean, string?)
		if type(className) ~= "string" then return false, "className must be a string" end
		if DENY_CLASS[className] then return false, ("class %s is on StudPilot's deny list: %s"):format(className, DENY_CLASS[className]) end
		local info = classes[className]
		if info == nil then return false, ("%s is not a Roblox class this plugin build knows (API dump %s); check the spelling"):format(className, tostring(P.version)) end
		if hasTag(info, "Service") then return false, ("%s is a service; use game:GetService, it cannot be created"):format(className) end
		if hasTag(info, "NotCreatable") then return false, ("Roblox marks %s NotCreatable; Instance.new cannot make it"):format(className) end
		return true
	end

	-- What create_instances may build: instantiable, minus script classes (edit_script makes those).
	function P.creatable(className: any): (boolean, string?)
		local ok, reason = P.instantiable(className)
		if not ok then return false, reason end
		if SCRIPT_CREATE[className] then return false, ("class %s: %s"):format(className, SCRIPT_CREATE[className]) end
		return true
	end

	-- The value type of a writable property, or nil and why not. An unknown class (newer than this
	-- dump) is allowed with an unknown type ("?"): Studio itself refuses a bad write, inside the recording.
	function P.property(className: any, property: any): (string?, string?)
		if type(property) ~= "string" then return nil, "property name must be a string" end
		if DENY_PROPERTY[property] then return nil, ("property %s is on StudPilot's deny list: %s"):format(property, DENY_PROPERTY[property]) end
		if type(className) ~= "string" then return "?" end
		if DENY_CLASS[className] then return nil, ("class %s is on StudPilot's deny list: %s"):format(className, DENY_CLASS[className]) end
		local name = className
		local guard = 0
		local sawClass = false
		while type(name) == "string" and guard < 64 do
			local denied = DENY_CLASS_PROPERTY[name]
			if denied and denied[property] then return nil, ("%s.%s is on StudPilot's deny list: %s"):format(className, property, denied[property]) end
			local info = classes[name]
			if info == nil then break end
			sawClass = true
			local t = info.p and info.p[property]
			if t ~= nil then return (string.gsub(t, "!$", "")) end
			local why = info.x and info.x[property]
			if why ~= nil then
				if why == "ReadOnly" then return nil, ("%s.%s is read-only"):format(className, property) end
				return nil, ("%s.%s cannot be written by a plugin (Roblox marks it %s)"):format(className, property, why)
			end
			name = info.s
			guard += 1
		end
		if not sawClass then return "?" end
		return nil, ("%s has no writable property %s"):format(className, property)
	end

	-- The properties a snapshot captures for a class (own and inherited), as a set, or nil for a class
	-- the dump does not describe. Cached: a checkpoint asks once per class.
	function P.captureList(className: any): { [string]: boolean }?
		if type(className) ~= "string" then return nil end
		local cached = captureCache[className]
		if cached ~= nil then return cached or nil end
		if classes[className] == nil then captureCache[className] = false; return nil end
		local out = {}
		local name = className
		local guard = 0
		local denied = {}
		while type(name) == "string" and guard < 64 do
			local info = classes[name]
			if info == nil then break end
			for property in DENY_CLASS_PROPERTY[name] or {} do denied[property] = true end
			for property, t in info.p or {} do
				if string.sub(t, -1) ~= "!" and not DENY_PROPERTY[property] and not denied[property] then out[property] = true end
			end
			name = info.s
			guard += 1
		end
		captureCache[className] = out
		return out
	end

	-- A property that holds an instance reference on some class.
	function P.isRefProperty(property: any): boolean
		if type(property) ~= "string" then return false end
		if refProperties == nil then
			refProperties = {}
			for _, info in classes do
				for name, t in info.p or {} do
					if t == "Instance" or t == "Instance!" then refProperties[name] = true end
				end
			end
		end
		return refProperties[property] == true
	end

	-- A property whose value is content (an asset reference) on some class.
	function P.isContentProperty(property: any): boolean
		if type(property) ~= "string" then return false end
		if contentProperties == nil then
			contentProperties = {}
			for _, info in classes do
				for name, t in info.p or {} do
					local bare = string.gsub(t, "!$", "")
					if bare == "Content" or bare == "ContentId" then contentProperties[name] = true end
				end
			end
		end
		return contentProperties[property] == true
	end

	function P.enumKnown(name: any): boolean
		if type(name) ~= "string" then return false end
		if enumNames == nil then
			enumNames = {}
			for item in string.gmatch(if type(dump) == "table" and type(dump.enums) == "string" then dump.enums else "", "[^,]+") do enumNames[item] = true end
		end
		return enumNames[name] == true
	end

	P.contentAllowed = Permissions.contentAllowed
	P.isContentType = Permissions.isContentType
	return P
end

return Permissions
