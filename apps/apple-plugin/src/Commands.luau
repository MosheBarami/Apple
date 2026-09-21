--!nocheck
--
-- Apple Studio command engine.
--
-- This module deliberately has no dependency on the first-generation plugin.  It is a small,
-- receive-side boundary: the transport may deliver untrusted JSON-shaped tables, but the only
-- things that can reach the DataModel are operations, paths, classes, properties and values that
-- this file accepts explicitly.  Reads are the default.  A write needs BOTH the caller's
-- per-session consent (`allowEdits == true`) and Studio edit mode.
--
-- The module returns the shared wire shape used by packages/shared:
--   { id, ok, data?, error?, durationMs?, failure? }
--
-- Source is intentionally never loaded, required, evaluated, or placed in a temporary executable
-- ModuleScript.  ScriptEditorService is the only write path for source.

local Commands = {}

local MAX_PATH = 320
local MAX_NAME = 96
local MAX_QUERY = 256
local MAX_SOURCE = 240000
local MAX_DUMP_CHARS = 1000000
local MAX_SCRIPTS = 240
local MAX_TREE_DEPTH = 12
local MAX_TREE_NODES = 1200
local MAX_SNAPSHOT_NODES = 800
local MAX_SNAPSHOT_DEPTH = 12
local MAX_SNAPSHOT_SOURCE = 600000
local MAX_SNAPSHOT_CHILDREN = 400
local MAX_PROTECTED_NODES = 64
local MAX_LOG_ENTRIES = 240
local MAX_TEXT = 120000
local MAX_ITEMS = 120
local MAX_CHILDREN_PER_SPEC = 40
local MAX_CREATE_NODES = 400
local MAX_PROPS = 48
local MAX_ATTRIBUTES = 48
local MAX_AFFECTED_PARTS = 2000
local MAX_TRANSLATION = 1000000
local MAX_ROTATION_DEGREES = 36000
local MIN_SCALE = 0.001
local MAX_SCALE = 1000
-- Two attributes make the visibility state self-authenticating. A project may already use an
-- attribute with the old, obvious name; treating that value as ours would restore the wrong
-- transparency and destroy user data. We write only when both reserved fields are absent, and we
-- restore only when the marker and finite saved value agree.
local HIDDEN_TRANSPARENCY_ATTRIBUTE = "__AppleStudioHiddenTransparencyV1"
local HIDDEN_MARKER_ATTRIBUTE = "__AppleStudioHiddenMarkerV1"

local READ_SERVICES = {
	Workspace = true,
	ReplicatedStorage = true,
	ServerScriptService = true,
	ServerStorage = true,
	StarterGui = true,
	StarterPack = true,
	StarterPlayer = true,
	ReplicatedFirst = true,
	Lighting = true,
	SoundService = true,
	Teams = true,
	TextChatService = true,
	MaterialService = true,
}

-- A stable order matters for checkpoints: the same unchanged place should produce the same tree
-- instead of depending on hash-table iteration order.
local PLACE_SERVICES = {
	"Workspace",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"ReplicatedFirst",
	"Lighting",
	"SoundService",
	"Teams",
	"TextChatService",
	"MaterialService",
}

-- These are deliberately the same narrow set for writes.  A path cannot escape through an
-- arbitrary service name, and a write cannot target the DataModel itself.
local WRITE_SERVICES = READ_SERVICES

local SCRIPT_SERVICES = {
	"Workspace",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"ReplicatedFirst",
}

-- Classes that contain no code-loading or external-content capability by themselves.  Content
-- properties are not in PROPERTY_ALLOW, so even a harmless-looking class cannot be used as an
-- indirect asset loader.  Script classes are created only by edit_script/restore, never by the
-- general instance builder.
local CREATE_CLASSES = {
	Folder = true,
	Model = true,
	Part = true,
	WedgePart = true,
	CornerWedgePart = true,
	TrussPart = true,
	SpawnLocation = true,
	Seat = true,
	VehicleSeat = true,
	Attachment = true,
	WeldConstraint = true,
	RopeConstraint = true,
	RodConstraint = true,
	SpringConstraint = true,
	BallSocketConstraint = true,
	HingeConstraint = true,
	AlignPosition = true,
	AlignOrientation = true,
	ScreenGui = true,
	SurfaceGui = true,
	BillboardGui = true,
	Frame = true,
	TextLabel = true,
	TextButton = true,
	TextBox = true,
	ScrollingFrame = true,
	UICorner = true,
	UIStroke = true,
	UIListLayout = true,
	UIGridLayout = true,
	UIPageLayout = true,
	UIAspectRatioConstraint = true,
	UISizeConstraint = true,
	UITextSizeConstraint = true,
	UIPadding = true,
	UIScale = true,
	PointLight = true,
	SpotLight = true,
	SurfaceLight = true,
	Highlight = true,
	StringValue = true,
	BoolValue = true,
	IntValue = true,
	NumberValue = true,
	Vector3Value = true,
	Color3Value = true,
	-- Ordinary in-place networking primitives. These do not load code or external content; their
	-- behavior lives in the Script/LocalScript source Apple writes through edit_script. Refusing
	-- them made a normal server-authoritative shop impossible to build and also made an existing
	-- RemoteEvent poison whole-place checkpoints.
	RemoteEvent = true,
	RemoteFunction = true,
	UnreliableRemoteEvent = true,
	BindableEvent = true,
	BindableFunction = true,
	-- Scriptable presentation objects whose state is completely covered by PROPERTY_ALLOW below.
	Atmosphere = true,
	BloomEffect = true,
	BlurEffect = true,
	ColorCorrectionEffect = true,
	DepthOfFieldEffect = true,
	SunRaysEffect = true,
}

-- Snapshot restore may re-materialise source that was already in this place.  It still cannot
-- accept an arbitrary class supplied by the transport.
local RESTORE_CLASSES = {}
for className in CREATE_CLASSES do
	RESTORE_CLASSES[className] = true
end
RESTORE_CLASSES.Script = true
RESTORE_CLASSES.LocalScript = true
RESTORE_CLASSES.ModuleScript = true

local SCRIPT_CLASSES = {
	Script = true,
	LocalScript = true,
	ModuleScript = true,
}

local PRESERVE_CLASSES = {
	Terrain = true,
	Camera = true,
	-- Sky carries external Content ids. Apple deliberately does not write Content properties, so an
	-- existing Sky is safer as a protected identity than as a half-restored recreatable object.
	Sky = true,
}

-- Checkpoints also encounter four Roblox-created TextChatService configuration singletons in a
-- brand-new place. They are preserved only when they have their exact engine-owned parent/name;
-- an authored instance of the same class elsewhere is unsupported content and makes the snapshot
-- incomplete instead of disappearing behind the protected-coverage rule.
local SNAPSHOT_PRESERVE_CLASSES = {
	Terrain = true,
	Camera = true,
	ChatWindowConfiguration = true,
	ChatInputBarConfiguration = true,
	ChannelTabsConfiguration = true,
	BubbleChatConfiguration = true,
	Sky = true,
}

-- These objects are owned by Studio and must keep their identity, but the user-authored children
-- inside them are part of Apple's restorable subset.  A restore clears/rebuilds their supported
-- children in place; it never destroys or recreates the container itself.
local PROTECTED_CONTAINER_CLASSES = {
	StarterPlayerScripts = true,
	StarterCharacterScripts = true,
}

-- Property names are the public write surface.  In particular, Parent, Source, ClassName and
-- every Content/asset property are absent on purpose.  Keep this table explicit: accepting any
-- property that happens to exist on an Instance turns a typo into a new capability.
local PROPERTY_ALLOW = {
	Anchored = true,
	CanCollide = true,
	CanQuery = true,
	CanTouch = true,
	CastShadow = true,
	Massless = true,
	Locked = true,
	Transparency = true,
	Reflectance = true,
	Size = true,
	CFrame = true,
	Position = true,
	Orientation = true,
	Color = true,
	Material = true,
	Shape = true,
	TopSurface = true,
	BottomSurface = true,
	Elasticity = true,
	Friction = true,
	CustomPhysicalProperties = true,

	Brightness = true,
	Range = true,
	Angle = true,
	Shadows = true,
	Enabled = true,
	ClockTime = true,
	GeographicLatitude = true,
	Ambient = true,
	OutdoorAmbient = true,
	ExposureCompensation = true,
	Intensity = true,
	Threshold = true,
	FocusDistance = true,
	InFocusRadius = true,
	NearIntensity = true,
	FarIntensity = true,
	Contrast = true,
	Saturation = true,
	TintColor = true,
	Spread = true,
	Density = true,
	Offset = true,
	Haze = true,
	Glare = true,
	Decay = true,

	Visible = true,
	Active = true,
	Selectable = true,
	Interactable = true,
	BackgroundColor3 = true,
	BackgroundTransparency = true,
	BorderColor3 = true,
	BorderMode = true,
	BorderSizePixel = true,
	AnchorPoint = true,
	Rotation = true,
	LayoutOrder = true,
	ZIndex = true,
	Text = true,
	TextColor3 = true,
	TextSize = true,
	TextWrapped = true,
	TextScaled = true,
	TextXAlignment = true,
	TextYAlignment = true,
	Font = true,
	LineHeight = true,
	MaxVisibleGraphemes = true,
	RichText = true,
	ClearTextOnFocus = true,
	MultiLine = true,
	PlaceholderText = true,
	ScrollBarThickness = true,
	CanvasSize = true,
	CanvasPosition = true,
	AutomaticCanvasSize = true,
	FillDirection = true,
	HorizontalAlignment = true,
	VerticalAlignment = true,
	Padding = true,
	SortOrder = true,
	CellSize = true,
	CellPadding = true,
	AspectRatio = true,
	DominantAxis = true,
	CornerRadius = true,
	Thickness = true,
	Color3 = true,
	Face = true,
	DepthMode = true,
	OutlineColor = true,
	OutlineTransparency = true,
	FillColor = true,
	FillTransparency = true,

	Value = true,
}

-- Reading uses the same safe names plus no secret/internal fields.  This bounded list keeps a
-- tree useful without turning it into a dump of every engine property.
local READ_PROPERTIES = {
	Anchored = true,
	CanCollide = true,
	CanQuery = true,
	CanTouch = true,
	CastShadow = true,
	Massless = true,
	Locked = true,
	Transparency = true,
	Reflectance = true,
	Size = true,
	CFrame = true,
	Position = true,
	Orientation = true,
	Color = true,
	Material = true,
	Shape = true,
	TopSurface = true,
	BottomSurface = true,
	Brightness = true,
	Range = true,
	Angle = true,
	Shadows = true,
	Enabled = true,
	ClockTime = true,
	GeographicLatitude = true,
	Ambient = true,
	OutdoorAmbient = true,
	ExposureCompensation = true,
	Intensity = true,
	Threshold = true,
	FocusDistance = true,
	InFocusRadius = true,
	NearIntensity = true,
	FarIntensity = true,
	Contrast = true,
	Saturation = true,
	TintColor = true,
	Spread = true,
	Density = true,
	Offset = true,
	Haze = true,
	Glare = true,
	Decay = true,
	Visible = true,
	Active = true,
	Selectable = true,
	Interactable = true,
	BackgroundColor3 = true,
	BackgroundTransparency = true,
	BorderColor3 = true,
	BorderSizePixel = true,
	AnchorPoint = true,
	Rotation = true,
	LayoutOrder = true,
	ZIndex = true,
	Text = true,
	TextColor3 = true,
	TextSize = true,
	TextWrapped = true,
	TextScaled = true,
	TextXAlignment = true,
	TextYAlignment = true,
	Font = true,
	LineHeight = true,
	RichText = true,
	PlaceholderText = true,
	ScrollBarThickness = true,
	CanvasSize = true,
	CanvasPosition = true,
	AutomaticCanvasSize = true,
	FillDirection = true,
	HorizontalAlignment = true,
	VerticalAlignment = true,
	Padding = true,
	SortOrder = true,
	CellSize = true,
	CellPadding = true,
	AspectRatio = true,
	DominantAxis = true,
	CornerRadius = true,
	Thickness = true,
	Color3 = true,
	Face = true,
	DepthMode = true,
	OutlineColor = true,
	OutlineTransparency = true,
	FillColor = true,
	FillTransparency = true,
	Value = true,
}

local CONTENT_PROPERTY = {
	MeshId = true,
	MeshContent = true,
	TextureID = true,
	TextureId = true,
	TextureContent = true,
	Texture = true,
	Image = true,
	HoverImage = true,
	PressedImage = true,
	SoundId = true,
	AnimationId = true,
	Video = true,
	SkyboxBk = true,
	SkyboxDn = true,
	SkyboxFt = true,
	SkyboxLf = true,
	SkyboxRt = true,
	SkyboxUp = true,
	ColorMap = true,
	MetalnessMap = true,
	NormalMap = true,
	RoughnessMap = true,
	ShirtTemplate = true,
	PantsTemplate = true,
	Graphic = true,
}

local ENUM_ALLOW = {
	Material = true,
	PartType = true,
	SurfaceType = true,
	Font = true,
	FontWeight = true,
	FontStyle = true,
	NormalId = true,
	FillDirection = true,
	HorizontalAlignment = true,
	VerticalAlignment = true,
	SortOrder = true,
	AutomaticSize = true,
	ScrollingDirection = true,
	AspectType = true,
	DominantAxis = true,
	UICorner = true,
	HighlightDepthMode = true,
	HighlightAdornee = true,
	SurfaceGuiSizingMode = true,
	SurfaceGuiShape = true,
	BorderMode = true,
}

local function nowSeconds(): number
	local ok, value = pcall(os.clock)
	if ok and type(value) == "number" and value == value and value < math.huge and value > -math.huge then
		return value
	end
	return 0
end

local function finite(value: any): boolean
	return type(value) == "number" and value == value and value < math.huge and value > -math.huge
end

local function integer(value: any): boolean
	return finite(value) and value % 1 == 0
end

local function safeCount(value: any, defaultValue: number, minimum: number, maximum: number, label: string): (number?, string?)
	if value == nil then return defaultValue end
	if not integer(value) or value < minimum or value > maximum then
		return nil, ("%s must be an integer between %d and %d"):format(label, minimum, maximum)
	end
	return value
end

local function safeText(value: any, maxLength: number, label: string): (string?, string?)
	if type(value) ~= "string" then return nil, ("%s must be a string"):format(label) end
	if #value > maxLength then return nil, ("%s exceeds the %d character limit"):format(label, maxLength) end
	if string.find(value, "%z", 1, true) then return nil, ("%s contains a NUL byte"):format(label) end
	return value
end

local function safeName(value: any, label: string): (string?, string?)
	local name, err = safeText(value, MAX_NAME, label)
	if not name then return nil, err end
	if #name == 0 or name == "." or name == ".." then
		return nil, ("%s must be a non-empty instance name"):format(label)
	end
	if string.find(name, "\r", 1, true) or string.find(name, "\n", 1, true) or string.find(name, "\t", 1, true) then
		return nil, ("%s contains a control character"):format(label)
	end
	return name
end

local function classNameOf(inst: any): string
	local ok, value = pcall(function() return inst.ClassName end)
	if ok and type(value) == "string" then return value end
	return "Instance"
end

local function nameOf(inst: any): string
	local ok, value = pcall(function() return inst.Name end)
	if ok and type(value) == "string" then return value end
	return ""
end

local function childrenOf(inst: any): ({ any }?, string?)
	local ok, children = pcall(function() return inst:GetChildren() end)
	if not ok or type(children) ~= "table" then return nil, "Studio did not return the instance's children" end
	return children
end

local function isA(inst: any, className: string): boolean
	local ok, result = pcall(function() return inst:IsA(className) end)
	if ok and result == true then return true end
	return classNameOf(inst) == className
end

local function isScript(inst: any): boolean
	if isA(inst, "LuaSourceContainer") then return true end
	return SCRIPT_CLASSES[classNameOf(inst)] == true
end

local function safeType(value: any): string
	local ok, result = pcall(function() return typeof(value) end)
	if ok and type(result) == "string" then return result end
	if type(value) == "table" and type(value.__type) == "string" then return value.__type end
	return type(value)
end

local function escapePathSegment(value: string): string
	local escaped = string.gsub(value, "\\", "\\\\")
	escaped = string.gsub(escaped, '"', '\\"')
	escaped = string.gsub(escaped, "\r", "\\r")
	escaped = string.gsub(escaped, "\n", "\\n")
	escaped = string.gsub(escaped, "\t", "\\t")
	return escaped
end

local function identifier(value: string): boolean
	return string.match(value, "^[A-Za-z_][A-Za-z0-9_]*$") ~= nil
end

local function parsePath(path: any): ({ string }?, string?)
	if type(path) ~= "string" then return nil, "path must be a string" end
	if #path == 0 or #path > MAX_PATH then return nil, ("path must be 1-%d characters"):format(MAX_PATH) end
	if string.find(path, "%z", 1, true) then return nil, "path contains a NUL byte" end
	local parts = {}
	local n = #path
	local i = 1
	local function word(): (string?, string?)
		local start = i
		while i <= n do
			local ch = string.sub(path, i, i)
			if ch == "." or ch == "[" then break end
			if ch == "]" or ch == "\\" or string.byte(ch) < 32 then
				return nil, "path contains an unsafe character"
			end
			i += 1
		end
		if i == start then return nil, "path contains an empty segment" end
		return string.sub(path, start, i - 1)
	end
	local first, err = word()
	if not first then return nil, err end
	if first ~= "game" then return nil, 'path must start with "game"' end
	table.insert(parts, first)
	while i <= n do
		local ch = string.sub(path, i, i)
		if ch == "." then
			i += 1
			local segment, segmentErr = word()
			if not segment then return nil, segmentErr end
			table.insert(parts, segment :: string)
		elseif ch == "[" then
			i += 1
			local quote = string.sub(path, i, i)
			if quote ~= '"' and quote ~= "'" then return nil, "bracket path segments must be quoted" end
			i += 1
			local out = ""
			local closed = false
			while i <= n do
				local c = string.sub(path, i, i)
				if c == quote then
					i += 1
					if string.sub(path, i, i) ~= "]" then return nil, "bracket path segment must end with ]" end
					i += 1
					closed = true
					break
				elseif c == "\\" then
					i += 1
					if i > n then return nil, "path ends in an escape" end
					local escaped = string.sub(path, i, i)
					if escaped ~= "\\" and escaped ~= '"' and escaped ~= "'" and escaped ~= "n" and escaped ~= "r" and escaped ~= "t" then
						return nil, "path contains an unsupported escape"
					end
					local replacement = ({ ["n"] = "\n", ["r"] = "\r", ["t"] = "\t" })[escaped] or escaped
					out ..= replacement
					i += 1
				else
					if string.byte(c) < 32 then return nil, "path contains a control character" end
					out ..= c
					i += 1
				end
			end
			if not closed or #out == 0 then return nil, "unclosed or empty bracket path segment" end
			if #out > MAX_NAME then return nil, "path segment is too long" end
			table.insert(parts, out)
		else
			return nil, "path must use . or [\"name\"] between segments"
		end
	end
	return parts
end

local function pathFromParts(parts: { string }, lastIndex: number?): string
	local limit = lastIndex or #parts
	local out = "game"
	for index = 2, limit do
		local part = parts[index]
		if identifier(part) then
			out ..= "." .. part
		else
			out ..= '["' .. escapePathSegment(part) .. '"]'
		end
	end
	return out
end

local function fullPath(gameRef: any, inst: any): (string?, string?)
	if inst == gameRef then return "game" end
	local parts = {}
	local current = inst
	local seen = 0
	while current and current ~= gameRef do
		seen += 1
		if seen > 64 then return nil, "instance hierarchy is too deep" end
		local name = nameOf(current)
		local valid, err = safeName(name, "instance name")
		if not valid then return nil, err end
		table.insert(parts, 1, valid)
		local ok, parent = pcall(function() return current.Parent end)
		if not ok then return nil, "could not read the instance parent" end
		current = parent
	end
	if current ~= gameRef then return nil, "instance is outside this Studio place" end
	local out = "game"
	for _, part in parts do
		if identifier(part) then out ..= "." .. part else out ..= '["' .. escapePathSegment(part) .. '"]' end
	end
	return out
end

local function serviceFrom(gameRef: any, services: any, serviceName: string): any
	if services and services[serviceName] ~= nil then return services[serviceName] end
	if not gameRef then return nil end
	local ok, result = pcall(function() return gameRef:GetService(serviceName) end)
	if ok then return result end
	return nil
end

local function firstService(pathParts: { string }): string?
	if #pathParts < 2 then return nil end
	local name = pathParts[2]
	if name == "workspace" then name = "Workspace" end
	if READ_SERVICES[name] then return name end
	return nil
end

-- The fifth return is the remedy code for a scope refusal. Attached here because this is where a
-- customer reaches it: a path naming a service outside the allowlist. The `writableTarget` checks
-- downstream ask the same question again and mostly cannot fail after this one passed — except for
-- a path of exactly "game", which resolves to the DataModel and is refused there instead, so those
-- sites carry the code too rather than answering the same question with a silence.
-- Handed out only for a write, because that is the only case `choose_allowed_target` describes —
-- its sentence names the targets Apple may WRITE to, and answering a refused read with it would be
-- telling the truth about the wrong question.
local function resolvePath(gameRef: any, services: any, path: any, write: boolean?): (any?, string?, string?, string?, string?)
	local parts, parseErr = parsePath(path)
	if not parts then return nil, nil, parseErr, "invalid" end
	if #parts == 1 then return gameRef, "game" end
	local scopeRemedy = if write then "choose_allowed_target" else nil
	local serviceName = firstService(parts)
	if not serviceName then return nil, nil, "path names a service outside Apple's allowlist", "refused", scopeRemedy end
	if write and not WRITE_SERVICES[serviceName] then return nil, nil, "write target is outside Apple's place scope", "refused", scopeRemedy end
	local current = serviceFrom(gameRef, services, serviceName)
	if not current then return nil, nil, ("service %s is unavailable"):format(serviceName), "not_found" end
	local canonical = "game." .. serviceName
	for index = 3, #parts do
		local segment = parts[index]
		local valid, nameErr = safeName(segment, "path segment")
		if not valid then return nil, nil, nameErr, "invalid" end
		local children, childrenErr = childrenOf(current)
		if not children then return nil, nil, childrenErr, "internal" end
		local child = nil
		local matches = 0
		for _, candidate in children do
			if nameOf(candidate) == valid then
				matches += 1
				child = candidate
			end
		end
		if matches == 0 then
			return nil, nil, ("instance not found at %s"):format(path), "not_found"
		end
		if matches > 1 then
			return nil, nil, ("path is ambiguous at %s because %d siblings are named %s"):format(canonical, matches, valid), "conflict"
		end
		current = child :: any
		if identifier(valid) then canonical ..= "." .. valid else canonical ..= '["' .. escapePathSegment(valid) .. '"]' end
	end
	return current, canonical
end

local function writableTarget(gameRef: any, inst: any): boolean
	local path = fullPath(gameRef, inst)
	if not path then return false end
	local parts = parsePath(path)
	if not parts or #parts < 2 then return false end
	return WRITE_SERVICES[parts[2]] == true
end

local function classAllowedForParent(parent: any, className: string): boolean
	local parentClass = classNameOf(parent)
	-- Scripts are allowed only in the conventional code containers.  This does not execute them;
	-- it limits where an edit can place source-bearing objects.
	if SCRIPT_CLASSES[className] then
		return parentClass ~= "Terrain" and parentClass ~= "Camera"
	end
	return true
end

-- The second return is the remedy code, and only the first two branches carry one: those two are
-- the same "you aimed outside the place Apple may write to" that resolvePath answers, said about an
-- instance instead of a path. The other two are not — an engine-owned parent and a class that may
-- not live there are refusals about WHAT, and `choose_allowed_target` would send the user to pick a
-- different destination for a problem a different destination does not solve.
local function destinationRefusal(gameRef: any, parent: any, parentPath: string, className: string): (string?, string?)
	if parent == gameRef then return "the DataModel itself cannot be used as an instance parent", "choose_allowed_target" end
	if not writableTarget(gameRef, parent) then return "instance parent is outside Apple's place scope", "choose_allowed_target" end
	local parentClass = classNameOf(parent)
	if PRESERVE_CLASSES[parentClass] then
		return ("refusing to parent content into %s because %s is engine-owned"):format(parentPath, parentClass)
	end
	if not classAllowedForParent(parent, className) then return "class is not allowed in that parent" end
	return nil
end

local function arrayShape(value: any, count: number, label: string): (boolean, string?)
	if type(value) ~= "table" then return false, ("%s must be an array of %d numbers"):format(label, count) end
	for i = 1, count do
		if not finite(value[i]) then return false, ("%s[%d] must be finite"):format(label, i) end
	end
	for key in value do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then
			return false, ("%s must contain exactly %d numeric entries"):format(label, count)
		end
	end
	return true
end

local function enumValue(enumText: string): (any?, string?)
	local enumName, itemName = string.match(enumText, "^Enum%.([A-Za-z][A-Za-z0-9_]*)%.([A-Za-z][A-Za-z0-9_]*)$")
	if not enumName or not itemName or not ENUM_ALLOW[enumName] then return nil, "enum is outside Apple's allowlist" end
	local ok, enum = pcall(function() return Enum[enumName] end)
	if not ok or not enum then return nil, "the requested enum is unavailable in this Studio build" end
	local okItem, item = pcall(function() return enum[itemName] end)
	if not okItem or item == nil then return nil, "the requested enum item is unavailable in this Studio build" end
	return item
end

local function decodeValue(value: any, label: string, allowInstance: boolean?): (any?, string?)
	if type(value) ~= "table" or type(value.t) ~= "string" then return nil, ("%s must be a typed property value"):format(label) end
	local t = value.t
	if t == "nil" then
		return nil
	elseif t == "string" then
		return safeText(value.v, MAX_TEXT, label)
	elseif t == "number" then
		if not finite(value.v) then return nil, ("%s must be finite"):format(label) end
		return value.v
	elseif t == "bool" then
		if type(value.v) ~= "boolean" then return nil, ("%s must be boolean"):format(label) end
		return value.v
	elseif t == "Vector3" then
		local valid, err = arrayShape(value.v, 3, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return Vector3.new(value.v[1], value.v[2], value.v[3]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "Vector2" then
		local valid, err = arrayShape(value.v, 2, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return Vector2.new(value.v[1], value.v[2]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "NumberRange" then
		local valid, err = arrayShape(value.v, 2, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return NumberRange.new(value.v[1], value.v[2]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "Rect" then
		local valid, err = arrayShape(value.v, 4, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return Rect.new(value.v[1], value.v[2], value.v[3], value.v[4]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "CFrame" then
		local valid, err = arrayShape(value.v, 12, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return CFrame.new(table.unpack(value.v)) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "Color3" then
		local valid, err = arrayShape(value.v, 3, label)
		if not valid then return nil, err end
		for i = 1, 3 do if value.v[i] < 0 or value.v[i] > 1 then return nil, ("%s color channels must be 0..1"):format(label) end end
		local ok, result = pcall(function() return Color3.new(value.v[1], value.v[2], value.v[3]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "UDim2" then
		local valid, err = arrayShape(value.v, 4, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return UDim2.new(value.v[1], value.v[2], value.v[3], value.v[4]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "UDim" then
		local valid, err = arrayShape(value.v, 2, label)
		if not valid then return nil, err end
		local ok, result = pcall(function() return UDim.new(value.v[1], value.v[2]) end)
		if not ok then return nil, ("%s could not be constructed"):format(label) end
		return result
	elseif t == "BrickColor" then
		local text, err = safeText(value.v, 80, label)
		if not text then return nil, err end
		local ok, result = pcall(function() return BrickColor.new(text) end)
		if not ok then return nil, ("%s is not a valid BrickColor"):format(label) end
		return result
	elseif t == "EnumItem" then
		local text, err = safeText(value.v, 100, label)
		if not text then return nil, err end
		return enumValue(text)
	elseif t == "Instance" then
		if not allowInstance then return nil, ("%s may not reference an instance"):format(label) end
		local ref, _, resolveErr = resolvePath(nil, nil, value.v, false)
		if not ref then return nil, resolveErr or (label .. " reference was not found") end
		return ref
	elseif t == "Content" then
		return nil, ("%s is external content; Apple never loads or imports asset ids"):format(label)
	end
	return nil, ("%s has unsupported type %s"):format(label, tostring(t))
end

local function encodeValue(value: any, gameRef: any, label: string): (any?, string?)
	local kind = safeType(value)
	if kind == "nil" then return { t = "nil" } end
	if kind == "string" then return { t = "string", v = string.sub(value, 1, MAX_TEXT) } end
	if kind == "number" then
		if not finite(value) then return nil, label .. " is non-finite" end
		return { t = "number", v = value }
	end
	if kind == "boolean" then return { t = "bool", v = value } end
	if kind == "Vector3" then
		if not finite(value.X) or not finite(value.Y) or not finite(value.Z) then return nil, label .. " is non-finite" end
		return { t = "Vector3", v = { value.X, value.Y, value.Z } }
	elseif kind == "Vector2" then
		if not finite(value.X) or not finite(value.Y) then return nil, label .. " is non-finite" end
		return { t = "Vector2", v = { value.X, value.Y } }
	elseif kind == "NumberRange" then
		if not finite(value.Min) or not finite(value.Max) then return nil, label .. " is non-finite" end
		return { t = "NumberRange", v = { value.Min, value.Max } }
	elseif kind == "Rect" then
		local min = value.Min
		local max = value.Max
		if not min or not max or not finite(min.X) or not finite(min.Y) or not finite(max.X) or not finite(max.Y) then return nil, label .. " is non-finite" end
		return { t = "Rect", v = { min.X, min.Y, max.X, max.Y } }
	elseif kind == "CFrame" then
		local ok, components = pcall(function() return { value:GetComponents() } end)
		if not ok or #components ~= 12 then return nil, label .. " is not a 12-component CFrame" end
		for i = 1, 12 do if not finite(components[i]) then return nil, label .. " is non-finite" end end
		return { t = "CFrame", v = components }
	elseif kind == "Color3" then
		if not finite(value.R) or not finite(value.G) or not finite(value.B) then return nil, label .. " is non-finite" end
		return { t = "Color3", v = { value.R, value.G, value.B } }
	elseif kind == "UDim2" then
		local x, y = value.X, value.Y
		if not x or not y or not finite(x.Scale) or not finite(x.Offset) or not finite(y.Scale) or not finite(y.Offset) then return nil, label .. " is non-finite" end
		return { t = "UDim2", v = { x.Scale, x.Offset, y.Scale, y.Offset } }
	elseif kind == "UDim" then
		if not finite(value.Scale) or not finite(value.Offset) then return nil, label .. " is non-finite" end
		return { t = "UDim", v = { value.Scale, value.Offset } }
	elseif kind == "BrickColor" then
		return { t = "BrickColor", v = tostring(value) }
	elseif kind == "EnumItem" then
		return { t = "EnumItem", v = tostring(value) }
	elseif kind == "Instance" then
		local path, err = fullPath(gameRef, value)
		if not path then return nil, err end
		return { t = "Instance", v = path }
	end
	return nil, label .. " has an unsupported value type"
end

local function hashSource(source: string): string
	-- FNV-1a/32.  The multiply is split into 16-bit halves because Luau numbers are doubles and a
	-- direct product can lose the low bits that make conflict detection useful.
	local h = 0x811c9dc5
	for i = 1, #source do
		h = bit32.bxor(h, string.byte(source, i))
		local low = bit32.band(h, 0xffff)
		local high = bit32.rshift(h, 16)
		h = (((high * 16777619) % 65536) * 65536 + (low * 16777619) % 4294967296) % 4294967296
	end
	return string.format("%08x", h)
end

local function linesIn(source: string): number
	if #source == 0 then return 1 end
	local _, count = string.gsub(source, "\n", "\n")
	return count + 1
end

local function sourceDanger(source: string): string?
	-- This is a refusal list, not a claim that arbitrary Luau is statically safe.  Commands never
	-- execute source.  These common ingress/load paths are rejected before source can be written by
	-- the agent, while ordinary local project code remains editable after the user's consent.
	local lower = string.lower(source)
	local forbidden = {
		{ "loadstring", "dynamic source compilation" },
		{ "getfenv", "environment escape" },
		{ "setfenv", "environment escape" },
		{ "insertservice", "asset insertion" },
		{ "assetservice", "asset loading" },
		{ "loadasset", "asset loading" },
		{ "getobjects", "remote object loading" },
		{ "httpservice", "remote network access" },
		{ "requestasync", "remote network access" },
		{ "postasync", "remote network access" },
		{ "debug.", "debugger escape" },
	}
	for _, entry in forbidden do
		if string.find(lower, entry[1], 1, true) then
			return ("script uses %s, which Apple does not write through this command"):format(entry[2])
		end
	end
	-- Numeric and string module ids are the remote module forms.  A local project ModuleScript can
	-- still be referenced by a path in the user's own code, but the command will not accept an id or
	-- URL as the target of a module load.
	if string.match(lower, "require%s*%(%s*[%d\"']") then
		return "script attempts to load a remote module id"
	end
	return nil
end

local function editorSource(editor: any, inst: any): (string?, string?)
	if editor then
		local ok, source = pcall(function() return editor:GetEditorSource(inst) end)
		if ok and type(source) == "string" then return source end
	end
	-- Reading the Source property is a compatibility fallback for a test/mock or an older Studio
	-- build.  Writes never use this fallback.
	local ok, source = pcall(function() return inst.Source end)
	if ok and type(source) == "string" then return source end
	return nil, "ScriptEditorService did not provide script source"
end

local function scriptSourceWithin(editor: any, inst: any, label: string): (string?, string?)
	local source, err = editorSource(editor, inst)
	if not source then return nil, err end
	if #source > MAX_SOURCE then return nil, ("%s exceeds the %d character source limit"):format(label, MAX_SOURCE) end
	return source
end

local function propertyValue(inst: any, property: string): any?
	local ok, value = pcall(function() return inst[property] end)
	if ok then return value end
	return nil
end

local function captureProperties(gameRef: any, inst: any, tableAllow: any): ({ [string]: any }, { string })
	local out = {}
	local issues = {}
	-- `tableAllow` is a source-authored finite table, not untrusted input. Do not reuse MAX_PROPS here:
	-- that limit belongs to one incoming write. READ_PROPERTIES already contains more entries than
	-- MAX_PROPS, and stopping an unordered Luau table walk at 48 made checkpoint fidelity random — a
	-- Part could omit Transparency simply because post-effect keys happened to be visited first.
	for property in tableAllow do
		if not CONTENT_PROPERTY[property] then
			local ok, value = pcall(function() return inst[property] end)
			if ok and value ~= nil then
				local encoded, err = encodeValue(value, gameRef, property)
				if encoded then out[property] = encoded elseif err then table.insert(issues, err) end
			end
		end
	end
	return out, issues
end

local function captureAttributes(gameRef: any, inst: any): ({ [string]: any }, { string })
	local out = {}
	local issues = {}
	local ok, attrs = pcall(function() return inst:GetAttributes() end)
	if not ok or type(attrs) ~= "table" then return out, issues end
	local count = 0
	for name, value in attrs do
		count += 1
		if count > MAX_ATTRIBUTES then table.insert(issues, "attribute list exceeds the limit"); break end
		local valid, err = safeName(name, "attribute name")
		if not valid then table.insert(issues, err :: string) else
			local encoded, encodeErr = encodeValue(value, gameRef, "attribute " .. valid)
			if encoded and encoded.t ~= "Instance" then out[valid] = encoded elseif encodeErr then table.insert(issues, encodeErr) end
		end
	end
	return out, issues
end

local function childCount(inst: any): (number?, string?)
	local children, err = childrenOf(inst)
	if not children then return nil, err end
	return #children
end

local function validatePropertyName(property: any): (string?, string?)
	local name, err = safeText(property, 80, "property name")
	if not name then return nil, err end
	if not identifier(name) or not PROPERTY_ALLOW[name] then
		return nil, ("property %s is not in Apple's write allowlist"):format(name)
	end
	if CONTENT_PROPERTY[name] then return nil, ("property %s carries external content and is refused"):format(name) end
	return name
end

local function validateProps(props: any, label: string, allowInstance: boolean?): ({ [string]: any }?, { [string]: any }?, string?)
	if props == nil then return {} end
	if type(props) ~= "table" then return nil, nil, label .. " must be an object" end
	local decoded = {}
	local encoded = {}
	local count = 0
	for property, typed in props do
		count += 1
		if count > MAX_PROPS then return nil, nil, label .. " exceeds the property limit" end
		local valid, nameErr = validatePropertyName(property)
		if not valid then return nil, nil, nameErr end
		local value, valueErr = decodeValue(typed, label .. "." .. valid, allowInstance)
		if valueErr then return nil, nil, valueErr end
		decoded[valid] = value
		encoded[valid] = typed
	end
	return decoded, encoded
end

local function validateAttributes(attrs: any, label: string): ({ [string]: any }?, string?)
	if attrs == nil then return {} end
	if type(attrs) ~= "table" then return nil, label .. " must be an object" end
	local decoded = {}
	local count = 0
	for attribute, typed in attrs do
		count += 1
		if count > MAX_ATTRIBUTES then return nil, label .. " exceeds the attribute limit" end
		local name, nameErr = safeName(attribute, "attribute name")
		if not name then return nil, nameErr end
		local value, valueErr = decodeValue(typed, label .. "." .. name, false)
		if valueErr then return nil, valueErr end
		decoded[name] = value
	end
	return decoded
end

local function setProperties(inst: any, props: any, attrs: any, label: string): ({ string }?, string?)
	local decodedProps, _, propErr = validateProps(props, label .. ".props", false)
	if propErr then return nil, propErr end
	local decodedAttrs, attrErr = validateAttributes(attrs, label .. ".attributes")
	if attrErr then return nil, attrErr end
	local set = {}
	for property, value in decodedProps do
		local ok, err = pcall(function() inst[property] = value end)
		if not ok then return nil, ("could not set %s: %s"):format(property, tostring(err)) end
		table.insert(set, property)
	end
	for attribute, value in decodedAttrs do
		local ok, err = pcall(function() inst:SetAttribute(attribute, value) end)
		if not ok then return nil, ("could not set attribute %s: %s"):format(attribute, tostring(err)) end
		table.insert(set, "@" .. attribute)
	end
	return set
end

local function instanceApi(options: any): any
	if options and options.instance then return options.instance end
	local ok, result = pcall(function() return Instance end)
	if ok then return result end
	return nil
end

local function makeInstance(options: any, className: string): (any?, string?)
	local api = instanceApi(options)
	if not api or type(api.new) ~= "function" then return nil, "Instance.new is unavailable" end
	local ok, inst = pcall(function() return api.new(className) end)
	if not ok or not inst then return nil, ("Studio could not create %s"):format(className) end
	return inst
end

local function parentInstance(inst: any, parent: any): (boolean, string?)
	local ok, err = pcall(function() inst.Parent = parent end)
	if not ok then return false, tostring(err) end
	return true
end

local function destroyInstance(inst: any): boolean
	local ok = pcall(function() inst:Destroy() end)
	return ok
end

local function parentOf(inst: any): any?
	local ok, parent = pcall(function() return inst.Parent end)
	if ok then return parent end
	return nil
end

local function descendantsOf(inst: any): ({ any }?, string?)
	if type(inst.GetDescendants) == "function" then
		local ok, descendants = pcall(function() return inst:GetDescendants() end)
		if ok and type(descendants) == "table" then return descendants end
	end
	local out = {}
	local function walk(node: any, depth: number): string?
		if depth > MAX_TREE_DEPTH + 8 then return "instance hierarchy is too deep" end
		local children, err = childrenOf(node)
		if not children then return err end
		for _, child in children do
			table.insert(out, child)
			if #out > MAX_TREE_NODES * 4 then return "instance hierarchy exceeds the traversal limit" end
			local childErr = walk(child, depth + 1)
			if childErr then return childErr end
		end
		return nil
	end
	local err = walk(inst, 0)
	if err then return nil, err end
	return out
end

local function isDescendantOf(inst: any, ancestor: any): boolean
	if inst == ancestor then return true end
	if type(inst.IsDescendantOf) == "function" then
		local ok, result = pcall(function() return inst:IsDescendantOf(ancestor) end)
		if ok then return result == true end
	end
	local current = parentOf(inst)
	local depth = 0
	while current do
		if current == ancestor then return true end
		depth += 1
		if depth > MAX_TREE_DEPTH + 16 then return false end
		current = parentOf(current)
	end
	return false
end

local function pathList(op: any, field: string): ({ string }?, string?)
	local raw = op[field]
	if type(raw) ~= "table" then return nil, field .. " must be an array of paths" end
	local count = #raw
	if count == 0 then return nil, field .. " must contain at least one path" end
	if count > MAX_ITEMS then return nil, ("%s exceeds the %d path limit"):format(field, MAX_ITEMS) end
	for key in raw do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then
			return nil, field .. " must be a dense array"
		end
	end
	local out = {}
	for index = 1, count do
		local path, err = safeText(raw[index], MAX_PATH, ("%s[%d]"):format(field, index))
		if not path then return nil, err end
		table.insert(out, path)
	end
	return out
end

local function structuralRefusal(gameRef: any, inst: any, path: string, verb: string): string?
	if inst == gameRef then return ("refusing to %s the DataModel itself (%s)"):format(verb, path) end
	local className = classNameOf(inst)
	if PRESERVE_CLASSES[className] then
		return ("refusing to %s %s because %s is engine-owned"):format(verb, path, className)
	end
	if parentOf(inst) == gameRef then
		return ("refusing to %s %s because it is a service"):format(verb, path)
	end
	return nil
end

local function resolveTargets(self: any, paths: { string }, write: boolean, structuralVerb: string?): ({ any }?, string?, string?, string?)
	local targets = {}
	local seen = {}
	for _, requested in paths do
		local inst, canonical, err, pathKind, pathRemedy = resolvePath(self.game, self.options.services, requested, write)
		if not inst then return nil, err, pathKind or "not_found", pathRemedy end
		if seen[inst] then return nil, ("duplicate target: %s"):format(canonical :: string), "invalid" end
		if structuralVerb then
			local refused = structuralRefusal(self.game, inst, canonical :: string, structuralVerb)
			if refused then return nil, refused, "refused" end
		end
		seen[inst] = true
		table.insert(targets, { inst = inst, path = canonical })
	end
	return targets
end

local function rejectNestedTargets(targets: { any }, operation: string): string?
	for i = 1, #targets do
		for j = i + 1, #targets do
			if isDescendantOf(targets[i].inst, targets[j].inst) or isDescendantOf(targets[j].inst, targets[i].inst) then
				return ("%s refuses overlapping ancestor/descendant targets"):format(operation)
			end
		end
	end
	return nil
end

local function uniqueName(parent: any, base: string): (string?, string?)
	local ok, found = pcall(function() return parent:FindFirstChild(base) end)
	if not ok then return nil, "could not inspect sibling names" end
	if not found then return base end
	for suffix = 2, 999 do
		local candidate = ("%s (%d)"):format(base, suffix)
		local foundOk, collision = pcall(function() return parent:FindFirstChild(candidate) end)
		if not foundOk then return nil, "could not inspect sibling names" end
		if not collision then return candidate end
	end
	return nil, ("could not find a free sibling name for %s"):format(base)
end

local function reserveUniqueName(parent: any, base: string, reservations: any): (string?, string?)
	local reserved = reservations[parent]
	if not reserved then reserved = {}; reservations[parent] = reserved end
	for suffix = 1, 999 do
		local candidate = if suffix == 1 then base else ("%s (%d)"):format(base, suffix)
		local foundOk, collision = pcall(function() return parent:FindFirstChild(candidate) end)
		if not foundOk then return nil, "could not inspect sibling names" end
		if not collision and not reserved[candidate] then
			reserved[candidate] = true
			return candidate
		end
	end
	return nil, ("could not reserve a free sibling name for %s"):format(base)
end

local function partsUnder(inst: any): ({ any }?, string?)
	if isA(inst, "BasePart") then return { inst } end
	local descendants, err = descendantsOf(inst)
	if not descendants then return nil, err end
	local out = {}
	for _, descendant in descendants do
		if isA(descendant, "BasePart") then
			table.insert(out, descendant)
			if #out > MAX_AFFECTED_PARTS then return nil, "operation exceeds the affected-part limit" end
		end
	end
	return out
end

local function finiteTriple(raw: any, field: string, limit: number): ({ number }?, string?)
	local valid, err = arrayShape(raw, 3, field)
	if not valid then return nil, err end
	for index = 1, 3 do
		if math.abs(raw[index]) > limit then return nil, ("%s[%d] exceeds the allowed range"):format(field, index) end
	end
	return { raw[1], raw[2], raw[3] }
end

local function spatialBody(inst: any): (any?, { any }?, string?)
	if isA(inst, "BasePart") then
		local ok, position = pcall(function() return inst.Position end)
		if not ok then return nil, nil, "could not read the part position" end
		return position, { inst }
	end
	if not isA(inst, "Model") then return nil, nil, "only a BasePart or a Model containing parts is spatial" end
	local parts, partsErr = partsUnder(inst)
	if not parts then return nil, nil, partsErr end
	if #parts == 0 then return nil, nil, "model contains no BasePart" end
	if type(inst.GetBoundingBox) ~= "function" then return nil, nil, "Model.GetBoundingBox is unavailable" end
	local ok, cframe = pcall(function()
		local box = inst:GetBoundingBox()
		return box
	end)
	if not ok or cframe == nil then return nil, nil, "could not read the model bounds" end
	local positionOk, position = pcall(function() return cframe.Position end)
	if not positionOk then return nil, nil, "could not read the model centre" end
	return position, parts
end

local function boundsOf(inst: any): (any?, any?, string?)
	if isA(inst, "BasePart") then
		local ok, cframe, size = pcall(function() return inst.CFrame, inst.Size end)
		if not ok then return nil, nil, "could not read part bounds" end
		return cframe, size
	end
	if isA(inst, "Model") and type(inst.GetBoundingBox) == "function" then
		local ok, cframe, size = pcall(function()
			local cf, sz = inst:GetBoundingBox()
			return cf, sz
		end)
		if ok and cframe and size then return cframe, size end
		return nil, nil, "could not read model bounds"
	end
	return nil, nil, "target is not a spatial instance"
end

local function rounded(value: number): number
	if value >= 0 then return math.floor(value + 0.5) end
	return math.ceil(value - 0.5)
end

local function safeSetParent(inst: any, parent: any): (boolean, string?)
	local ok, err = pcall(function() inst.Parent = parent end)
	if not ok then return false, tostring(err) end
	return true
end

local function safeClone(inst: any): (any?, string?)
	if type(inst.Clone) ~= "function" then return nil, "Instance.Clone is unavailable" end
	local ok, copy = pcall(function() return inst:Clone() end)
	if not ok or copy == nil then return nil, "Studio refused to clone the instance: " .. tostring(copy) end
	return copy
end

local function readablePath(self: any, inst: any): (string?, string?)
	local path, err = fullPath(self.game, inst)
	if not path then return nil, err or "could not determine instance path" end
	return path
end

local function setPartVisible(part: any, visible: boolean): (boolean, string?)
	local okState, remembered, marker = pcall(function()
		return part:GetAttribute(HIDDEN_TRANSPARENCY_ATTRIBUTE), part:GetAttribute(HIDDEN_MARKER_ATTRIBUTE)
	end)
	if not okState then return false, "could not read Apple's visibility state" end

	if not visible then
		if marker == true then
			if not finite(remembered) or remembered < 0 or remembered > 1 then
				return false, "Apple's saved visibility state is corrupt; the part was not changed"
			end
		elseif marker ~= nil or remembered ~= nil then
			return false, "reserved Apple visibility attributes already exist on this part; refusing to overwrite them"
		else
			local okRead, current = pcall(function() return part.Transparency end)
			if not okRead or not finite(current) or current < 0 or current > 1 then
				return false, "could not read a valid current transparency"
			end
			local okSave, saveErr = pcall(function()
				part:SetAttribute(HIDDEN_TRANSPARENCY_ATTRIBUTE, current)
				part:SetAttribute(HIDDEN_MARKER_ATTRIBUTE, true)
			end)
			if not okSave then
				pcall(function()
					part:SetAttribute(HIDDEN_TRANSPARENCY_ATTRIBUTE, nil)
					part:SetAttribute(HIDDEN_MARKER_ATTRIBUTE, nil)
				end)
				return false, "could not save the current transparency: " .. tostring(saveErr)
			end
		end
		local okHide, hideErr = pcall(function() part.Transparency = 1 end)
		if not okHide then
			pcall(function()
				part:SetAttribute(HIDDEN_TRANSPARENCY_ATTRIBUTE, nil)
				part:SetAttribute(HIDDEN_MARKER_ATTRIBUTE, nil)
			end)
			return false, "could not hide the part: " .. tostring(hideErr)
		end
		return true
	end

	if remembered == nil and marker == nil then
		-- Showing a part Apple never hid is already a no-op. Do not force a translucent part opaque.
		return true
	end
	if marker ~= true or not finite(remembered) or remembered < 0 or remembered > 1 then
		return false, "reserved Apple visibility attributes do not form a valid saved state; the part was not changed"
	end
	local okShow, showErr = pcall(function()
		part.Transparency = remembered
		part:SetAttribute(HIDDEN_TRANSPARENCY_ATTRIBUTE, nil)
		part:SetAttribute(HIDDEN_MARKER_ATTRIBUTE, nil)
	end)
	if not okShow then return false, "could not restore the part transparency: " .. tostring(showErr) end
	return true
end

local function buildSpec(options: any, gameRef: any, spec: any, parentOverride: any, state: any, depth: number): (any?, string?)
	if type(spec) ~= "table" then return nil, "instance spec must be an object" end
	if depth > MAX_SNAPSHOT_DEPTH then return nil, "instance spec is too deeply nested" end
	local className, classErr = safeText(spec.className, 64, "className")
	if not className then return nil, classErr end
	if not CREATE_CLASSES[className] then return nil, ("class %s is not in Apple's create allowlist"):format(className) end
	local name, nameErr = safeName(spec.name or className, "instance name")
	if not name then return nil, nameErr end
	local parent = parentOverride
	if not parent then
		local resolved, _, resolveErr = resolvePath(gameRef, options.services, spec.parent, true)
		if not resolved then return nil, resolveErr end
		parent = resolved
	end
	-- Nested specs are built detached and then parented in one commit.  The top-level parent was
	-- already resolved/checked by validateCreateItems; requiring a detached child to have a path
	-- before it is attached would reject an otherwise safe atomic tree build.
	if not parentOverride then
		local parentPath = fullPath(gameRef, parent) or "the requested parent"
		local refused = destinationRefusal(gameRef, parent, parentPath, className)
		if refused then return nil, refused end
	elseif not classAllowedForParent(parent, className) then
		return nil, "class is not allowed in that parent"
	end
	local props, _, propErr = validateProps(spec.props, "instance props", false)
	if propErr then return nil, propErr end
	local attrs, attrErr = validateAttributes(spec.attributes, "instance attributes")
	if attrErr then return nil, attrErr end
	if #state.created >= MAX_CREATE_NODES then return nil, "instance tree exceeds the total create limit" end
	local inst, createErr = makeInstance(options, className)
	if not inst then return nil, createErr end
	state.created[#state.created + 1] = inst
	local okName, nameSetErr = pcall(function() inst.Name = name end)
	if not okName then return nil, "could not set instance name: " .. tostring(nameSetErr) end
	for property, value in props do
		local ok, err = pcall(function() inst[property] = value end)
		if not ok then return nil, ("could not set %s: %s"):format(property, tostring(err)) end
	end
	for attribute, value in attrs do
		local ok, err = pcall(function() inst:SetAttribute(attribute, value) end)
		if not ok then return nil, ("could not set attribute %s: %s"):format(attribute, tostring(err)) end
	end
	local children = spec.children
	if children ~= nil then
		if type(children) ~= "table" then return nil, "children must be an array" end
		local childCount = 0
		for _, childSpec in children do
			childCount += 1
			if childCount > MAX_CHILDREN_PER_SPEC then return nil, "children exceed the per-instance limit" end
			local child, childErr = buildSpec(options, gameRef, childSpec, inst, state, depth + 1)
			if not child then return nil, childErr end
		end
	end
	local parentOk, parentErr = parentInstance(inst, parent)
	if not parentOk then return nil, "could not parent instance: " .. tostring(parentErr) end
	return inst
end

local function validateCreateSpec(spec: any, depth: number, state: any, nested: boolean): (string?, string?)
	if type(spec) ~= "table" then return "instance spec must be an object", "invalid" end
	if depth > MAX_SNAPSHOT_DEPTH then return "instance spec is too deeply nested", "invalid" end
	state.nodes += 1
	if state.nodes > MAX_CREATE_NODES then
		return ("instance tree exceeds the %d-node create limit"):format(MAX_CREATE_NODES), "invalid"
	end
	if nested and spec.parent ~= nil then return "nested instance specs may not override their parent", "invalid" end

	local className, classErr = safeText(spec.className, 64, "className")
	if not className then return classErr, "invalid" end
	if not CREATE_CLASSES[className] then return ("class %s is not in Apple's create allowlist"):format(className), "refused" end
	local name, nameErr = safeName(spec.name or className, "instance name")
	if not name then return nameErr, "invalid" end
	local _, _, propErr = validateProps(spec.props, "instance props", false)
	if propErr then return propErr, "invalid" end
	local _, attrErr = validateAttributes(spec.attributes, "instance attributes")
	if attrErr then return attrErr, "invalid" end

	local children = spec.children
	if children == nil then return nil end
	if type(children) ~= "table" then return "children must be an array", "invalid" end
	local count = #children
	if count > MAX_CHILDREN_PER_SPEC then return "children exceed the per-instance limit", "invalid" end
	for key in children do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then
			return "children must be a dense array", "invalid"
		end
	end
	local names = {}
	for index = 1, count do
		local child = children[index]
		if type(child) ~= "table" then return ("children[%d] must be an object"):format(index), "invalid" end
		local childClass, childClassErr = safeText(child.className, 64, ("children[%d].className"):format(index))
		if not childClass then return childClassErr, "invalid" end
		local childName, childNameErr = safeName(child.name or childClass, ("children[%d].name"):format(index))
		if not childName then return childNameErr, "invalid" end
		if names[childName] then return ("two nested children are named %s"):format(childName), "conflict" end
		names[childName] = true
		local childErr, childKind = validateCreateSpec(child, depth + 1, state, true)
		if childErr then return childErr, childKind end
	end
	return nil
end

local function validateCreateItems(options: any, gameRef: any, items: any): (string?, string?, string?)
	if type(items) ~= "table" then return "items must be an array", "invalid" end
	local count = #items
	if count == 0 then return "items must contain at least one instance", "invalid" end
	if count > MAX_ITEMS then return "items exceed the create limit", "invalid" end
	for key in items do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then return "items must be a dense array", "invalid" end
	end

	local state = { nodes = 0 }
	local reserved = {}
	for index = 1, count do
		local spec = items[index]
		local specErr, specKind = validateCreateSpec(spec, 0, state, false)
		if specErr then return specErr, specKind end
		local parentPath = spec.parent
		local parent, canonicalParent, parentErr, parentKind, parentRemedy = resolvePath(gameRef, options.services, parentPath, true)
		if not parent then return parentErr, parentKind or "not_found", parentRemedy end
		local className = spec.className
		local refused, refusedRemedy = destinationRefusal(gameRef, parent, canonicalParent :: string, className)
		if refused then return refused, "refused", refusedRemedy end
		local name = spec.name or className
		local names = reserved[parent]
		if not names then names = {}; reserved[parent] = names end
		if names[name] then return ("two created instances would share the path %s.%s"):format(canonicalParent :: string, name), "conflict" end
		local children, childrenErr = childrenOf(parent)
		if not children then return childrenErr, "internal" end
		for _, existing in children do
			if nameOf(existing) == name then return ("%s already contains a child named %s"):format(canonicalParent :: string, name), "conflict" end
		end
		names[name] = true
	end
	return nil
end

local function scriptRoots(gameRef: any, services: any, requestedRoot: any): ({ any }?, { string }?, string?, string?)
	if requestedRoot ~= nil then
		local root, canonical, err, pathKind = resolvePath(gameRef, services, requestedRoot, false)
		if not root then return nil, nil, err, pathKind end
		return { root }, { canonical :: string }
	end
	local roots = {}
	local paths = {}
	for _, serviceName in SCRIPT_SERVICES do
		local service = serviceFrom(gameRef, services, serviceName)
		if service then
			table.insert(roots, service)
			table.insert(paths, "game." .. serviceName)
		end
	end
	return roots, paths
end

local function walkScripts(roots: { any }, maxScripts: number, visit: (any, string) -> (boolean?, string?)): (boolean, string?)
	local visited = 0
	local stopped = false
	local function walk(node: any, path: string, depth: number): string?
		if stopped then return nil end
		visited += 1
		if visited > MAX_TREE_NODES * 3 then stopped = true; return nil end
		if isScript(node) then
			local stop, err = visit(node, path)
			if err then return err end
			if stop then stopped = true; return nil end
		end
		if depth >= MAX_TREE_DEPTH then return nil end
		local children, childrenErr = childrenOf(node)
		if not children then return childrenErr end
		for _, child in children do
			local childPath, pathErr = fullPath(nil, child)
			-- The caller's visit path is rebuilt by fullPath in each handler; this value is only a
			-- recursion placeholder for mocks that do not attach Parent yet.
			local nextPath = childPath or path .. "." .. nameOf(child)
			local err = walk(child, nextPath, depth + 1)
			if err then return err end
			if stopped then break end
		end
		return nil
	end
	for index, root in roots do
		local rootPath = "game." .. (SCRIPT_SERVICES[index] or nameOf(root))
		local err = walk(root, rootPath, 0)
		if err then return false, err end
		if stopped then break end
	end
	return stopped, nil
end

local function validateSourceEdit(path: string, source: any): (string?, string?)
	local value, err = safeText(source, MAX_SOURCE, "source")
	if not value then return nil, err end
	local danger = sourceDanger(value)
	if danger then return nil, danger end
	return value
end

local function applyTextEdits(old: string, edits: any, path: string): (string?, string?)
	if type(edits) ~= "table" then return nil, "edits must be an array" end
	local result = old
	local count = 0
	for index, edit in edits do
		count += 1
		if count > 64 then return nil, "edits exceed the limit" end
		if type(edit) ~= "table" then return nil, ("edit %d must be an object"):format(index) end
		local find, findErr = safeText(edit.find, MAX_TEXT, ("edit %d find"):format(index))
		if not find then return nil, findErr end
		local replacement, replaceErr = safeText(edit.replace, MAX_TEXT, ("edit %d replace"):format(index))
		if not replacement then return nil, replaceErr end
		if #find == 0 then return nil, ("edit %d find must not be empty"):format(index) end
		local before = result
		if edit.all == true then
			local escaped = string.gsub(find, "([%%%^%$%(%)%.%[%]%*%+%-%?])", "%%%1")
			result = string.gsub(result, escaped, function() return replacement end)
		else
			local at = string.find(result, find, 1, true)
			if not at then return nil, ("edit %d text was not found in %s"):format(index, path) end
			result = string.sub(result, 1, at - 1) .. replacement .. string.sub(result, at + #find)
		end
		if result == before then return nil, ("edit %d changed nothing"):format(index) end
		if #result > MAX_SOURCE then return nil, ("edited source exceeds the %d character limit"):format(MAX_SOURCE) end
	end
	local danger = sourceDanger(result)
	if danger then return nil, danger end
	return result
end

local function sourceEditIsCreate(op: any): boolean
	return type(op.create) == "table"
end

local function beginRecording(history: any, enum: any, id: string, operation: string): (any?, string?)
	if not history or type(history.TryBeginRecording) ~= "function" then return nil, "ChangeHistoryService is unavailable" end
	local ok, recording = pcall(function()
		return history:TryBeginRecording("Apple " .. operation .. " " .. string.sub(id, 1, 48), "Apple " .. operation)
	end)
	if not ok then return nil, "could not open an undo recording: " .. tostring(recording) end
	if recording == nil then return nil, "could not open an undo recording because another Studio recording is active" end
	return recording
end

local function finishOperation(history: any, enum: any, recording: any, operation: string): (boolean, string?)
	local commit = "Commit"
	if enum and enum.FinishRecordingOperation then commit = enum.FinishRecordingOperation.Commit end
	local ok, result = pcall(function() return history:FinishRecording(recording, commit) end)
	if not ok or result == false then return false, "could not commit the undo recording: " .. tostring(result) end
	return true
end

local function cancelOperation(history: any, enum: any, recording: any): boolean
	local cancel = "Cancel"
	if enum and enum.FinishRecordingOperation then cancel = enum.FinishRecordingOperation.Cancel end
	local ok = pcall(function() history:FinishRecording(recording, cancel) end)
	return ok
end

local function protectedStructureHash(self: any, inst: any, depth: number, counter: any): (string?, number?, string?)
	if depth > MAX_SNAPSHOT_DEPTH + 8 then return nil, nil, "protected Studio hierarchy is too deeply nested" end
	counter.nodes += 1
	if counter.nodes > MAX_TREE_NODES * 4 then return nil, nil, "protected Studio hierarchy exceeds the traversal bound" end
	local children, childrenErr = childrenOf(inst)
	if not children then return nil, nil, childrenErr end
	local rows = {}
	local descendants = 0
	for _, child in children do
		local name, nameErr = safeName(nameOf(child), "protected child name")
		if not name then return nil, nil, nameErr end
		local sourceHash = ""
		if isScript(child) then
			local source, sourceErr = scriptSourceWithin(self.editor, child, "protected script source")
			if not source then return nil, nil, sourceErr end
			sourceHash = hashSource(source)
		end
		local nestedHash, nestedCount, nestedErr = protectedStructureHash(self, child, depth + 1, counter)
		if not nestedHash then return nil, nil, nestedErr end
		descendants += 1 + (nestedCount or 0)
		table.insert(rows, table.concat({ classNameOf(child), name, sourceHash, nestedHash }, "\0"))
	end
	table.sort(rows)
	return hashSource(table.concat(rows, "\n")), descendants
end

local function snapshotProtectedNode(self: any, inst: any, state: any): string?
	if #state.protected >= MAX_PROTECTED_NODES then
		state.complete = false
		state.truncated = true
		return "snapshot has too many protected engine-owned nodes"
	end
	local path, pathErr = fullPath(self.game, inst)
	if not path then return pathErr or "could not determine protected snapshot path" end
	local name, nameErr = safeName(nameOf(inst), "protected snapshot name")
	if not name then return nameErr end
	local children, childrenErr = childrenOf(inst)
	if not children then return childrenErr end
	local structureHash, descendantCount, structureErr = protectedStructureHash(self, inst, 0, { nodes = 0 })
	if not structureHash then return structureErr end
	table.insert(state.protected, {
		path = path,
		className = classNameOf(inst),
		name = name,
		childCount = #children,
		descendantCount = descendantCount,
		structureHash = structureHash,
	})
	return nil
end

local function engineOwnedSnapshotPreserve(self: any, inst: any): boolean
	local className = classNameOf(inst)
	if not SNAPSHOT_PRESERVE_CLASSES[className] then return false end
	local parent = parentOf(inst)
	if className == "Terrain" then
		return parent == serviceFrom(self.game, self.options.services, "Workspace")
	end
	if className == "Camera" then
		local workspaceService = serviceFrom(self.game, self.options.services, "Workspace")
		if parent ~= workspaceService then return false end
		local ok, currentCamera = pcall(function() return workspaceService.CurrentCamera end)
		return ok and currentCamera == inst
	end
	if className == "Sky" then
		return parent == serviceFrom(self.game, self.options.services, "Lighting")
	end
	local textChatService = serviceFrom(self.game, self.options.services, "TextChatService")
	if parent ~= textChatService then return false end
	local ok, config = pcall(function() return textChatService[className] end)
	return ok and config == inst
end

local function protectedContainerIdentity(inst: any): boolean
	local className = classNameOf(inst)
	if not PROTECTED_CONTAINER_CLASSES[className] or nameOf(inst) ~= className then return false end
	return classNameOf(parentOf(inst)) == "StarterPlayer"
end

-- WHY THE BOUNDED WALK STOPPED, NOT MERELY THAT IT DID.
--
-- `truncated` was one boolean for four different ceilings, and the worker turned it into one
-- sentence: "this project is too large for one checkpoint". Measured 2026-09-21, a place of
-- THIRTEEN objects with one deep folder chain produced exactly that sentence, quoting its own
-- "it reached 13 objects" in the same breath. Three of the four ceilings have nothing to do with
-- size and each has its own remedy -- flatten the deepest branch, split a script, move children
-- out of one parent -- so a shared sentence sends the owner to delete content that was never the
-- problem. The FIRST ceiling to fire is the one recorded: a walk that stops for depth then keeps
-- meeting the same depth is still a depth stop, and overwriting it would report the last symptom
-- instead of the cause.
local function truncate(state: any, cause: string)
	state.complete = false
	state.truncated = true
	if state.truncatedBy == nil then state.truncatedBy = cause end
end

local function snapshotNode(self: any, inst: any, depth: number, state: any): (any?, string?)
	if state.nodes >= MAX_SNAPSHOT_NODES then truncate(state, "objects"); return nil end
	if depth > MAX_SNAPSHOT_DEPTH then truncate(state, "depth"); return nil end
	local className = classNameOf(inst)
	-- Engine-owned identities are recorded separately so restore can prove the same protected object
	-- still exists without deleting/recreating it. An instance with one of these classes in any other
	-- location is authored/unknown content and makes the checkpoint incomplete.
	if SNAPSHOT_PRESERVE_CLASSES[className] and engineOwnedSnapshotPreserve(self, inst) then
			local parentClass = classNameOf(parentOf(inst))
			if RESTORE_CLASSES[parentClass] then
			-- Recreating the parent would necessarily delete this protected descendant. Keep the
			-- evidence, but do not advertise the resulting snapshot as safely restorable.
			state.complete = false
			state.skipped["nested protected " .. className] = (state.skipped["nested protected " .. className] or 0) + 1
		end
		local protectedErr = snapshotProtectedNode(self, inst, state)
		if protectedErr then return nil, protectedErr end
			return nil
		end
		local parent = parentOf(inst)
		local isService = parent == self.game and READ_SERVICES[className] == true
		local isProtectedContainer = protectedContainerIdentity(inst)
		if SNAPSHOT_PRESERVE_CLASSES[className] or (PROTECTED_CONTAINER_CLASSES[className] and not isProtectedContainer) then
			state.complete = false
			state.skipped[className] = (state.skipped[className] or 0) + 1
			return nil
		end
		if not RESTORE_CLASSES[className] and not isService and not isProtectedContainer then
		state.complete = false
		state.skipped[className] = (state.skipped[className] or 0) + 1
		return nil
	end
	local name, nameErr = safeName(nameOf(inst), "snapshot instance name")
	if not name then return nil, nameErr end
	if (isService or isProtectedContainer) and name ~= className then
		state.complete = false
		return nil, ("protected %s identity has unexpected name %s"):format(className, name)
	end
	state.nodes += 1
	if parent ~= self.game then state.instanceCount += 1 end
	local props, propIssues = captureProperties(self.game, inst, READ_PROPERTIES)
	if #propIssues > 0 then state.complete = false end
	local attrs, attrIssues = captureAttributes(self.game, inst)
	if #attrIssues > 0 then state.complete = false end
	local node: any = { className = className, name = name, props = props, attributes = attrs, children = {} }
	if isService or isProtectedContainer then node.protectedIdentity = true end
	if isScript(inst) then
		state.scriptCount += 1
		if not state.includeScripts then
			state.complete = false
			node.sourceOmitted = true
		else
			local source, sourceErr = scriptSourceWithin(self.editor, inst, "snapshot source")
			if not source then return nil, sourceErr end
			state.sourceChars += #source
			if state.sourceChars > MAX_SNAPSHOT_SOURCE then truncate(state, "script"); return nil end
			node.source = source
			node.sourceChars = #source
			node.baseHash = hashSource(source)
		end
	end
	local children, childrenErr = childrenOf(inst)
	if not children then return nil, childrenErr end
	local childCount = 0
	for _, child in children do
		childCount += 1
		if childCount > MAX_SNAPSHOT_CHILDREN then
			truncate(state, "children")
			break
		end
		local childNode, childErr = snapshotNode(self, child, depth + 1, state)
		if childErr then return nil, childErr end
		if childNode then table.insert(node.children, childNode) end
		if state.truncated then break end
	end
	return node
end

local function snapshotDataModel(self: any, state: any): (any?, string?)
	local node: any = {
		className = "DataModel",
		name = "game",
		protectedIdentity = true,
		props = {},
		attributes = {},
		children = {},
	}
	for _, serviceName in PLACE_SERVICES do
		local service = serviceFrom(self.game, self.options.services, serviceName)
		if not service then
			state.complete = false
			state.skipped["missing service " .. serviceName] = 1
		else
			local serviceNode, serviceErr = snapshotNode(self, service, 0, state)
			if serviceErr then return nil, serviceErr end
			if serviceNode then table.insert(node.children, serviceNode) end
			if state.truncated then break end
		end
	end
	return node
end

local function validateSnapshotNode(node: any, depth: number, parentClass: string?, rootClass: string?, stats: any): string?
	if type(node) ~= "table" then return "snapshot node must be an object" end
	local depthAllowance = if rootClass == "DataModel" then 1 else 0
	if depth > MAX_SNAPSHOT_DEPTH + depthAllowance then return "snapshot is too deeply nested" end
	local className, classErr = safeText(node.className, 64, "snapshot className")
	if not className then return classErr end
	local effectiveRoot = rootClass or className
	local serviceClass = READ_SERVICES[className] == true
	local protectedContainer = PROTECTED_CONTAINER_CLASSES[className] == true
	local dataModel = className == "DataModel"
	if depth == 0 then
		if not dataModel and not serviceClass and not protectedContainer and not RESTORE_CLASSES[className] then
			return "snapshot root class is outside Apple's restore allowlist"
		end
	elseif effectiveRoot == "DataModel" and depth == 1 then
		if not serviceClass then return "whole-place snapshot contains a non-service at the DataModel root" end
	elseif serviceClass then
		return "snapshot service appears below the place root"
	elseif protectedContainer then
		if parentClass ~= "StarterPlayer" then return "protected StarterPlayer container appears outside StarterPlayer" end
	elseif not RESTORE_CLASSES[className] then
		return "snapshot contains a class outside Apple's restore allowlist"
	end
	if dataModel and depth ~= 0 then return "DataModel may appear only as the snapshot root" end
	local protectedIdentity = dataModel or serviceClass or protectedContainer
	if protectedIdentity and node.protectedIdentity ~= true then return "snapshot is missing protected identity metadata" end
	if not protectedIdentity and node.protectedIdentity == true then return "snapshot marks a recreatable instance as protected" end
	local name, nameErr = safeName(node.name, "snapshot name")
	if not name then return nameErr end
	if dataModel and name ~= "game" then return "DataModel snapshot root must be named game" end
	if (serviceClass or protectedContainer) and name ~= className then return "protected snapshot identity has an unexpected name" end
	local _, _, propErr = validateProps(node.props, "snapshot props", false)
	if propErr then return propErr end
	local _, attrErr = validateAttributes(node.attributes, "snapshot attributes")
	if attrErr then return attrErr end
	if dataModel and (next(node.props) ~= nil or next(node.attributes) ~= nil) then return "DataModel snapshot root may not carry mutable properties or attributes" end
	if SCRIPT_CLASSES[className] then
		local source, sourceErr = safeText(node.source, MAX_SOURCE, "snapshot source")
		if not source then return sourceErr or "snapshot script source is missing" end
		local baseHash, hashErr = safeText(node.baseHash, 8, "snapshot baseHash")
		if not baseHash or string.match(baseHash, "^%x%x%x%x%x%x%x%x$") == nil then return hashErr or "snapshot baseHash must be eight hex characters" end
		if hashSource(source) ~= string.lower(baseHash) then return "snapshot script source hash does not match its source" end
		if not integer(node.sourceChars) or node.sourceChars ~= #source then return "snapshot script sourceChars does not match its source" end
		stats.scripts += 1
		stats.sourceChars += #source
		if stats.sourceChars > MAX_SNAPSHOT_SOURCE then return "snapshot source exceeds the bounded restore budget" end
	elseif node.source ~= nil or node.baseHash ~= nil or node.sourceChars ~= nil or node.sourceOmitted == true then
		return "snapshot source metadata is attached to a non-script"
	end
	if not dataModel then
		stats.nodes += 1
		if stats.nodes > MAX_SNAPSHOT_NODES then return "snapshot exceeds the bounded node budget" end
		if not serviceClass then stats.instances += 1 end
	end
	if type(node.children) ~= "table" then return "snapshot children must be an array" end
	local count = 0
	for key in node.children do
		if not integer(key) or key < 1 then return "snapshot children must use consecutive numeric indexes" end
		count += 1
	end
	if count > MAX_SNAPSHOT_CHILDREN then return "snapshot node has too many children" end
	for index = 1, count do if node.children[index] == nil then return "snapshot children must not contain holes" end end
	local seenServices = {}
	for index = 1, count do
		local child = node.children[index]
		if dataModel then
			local childClass = type(child) == "table" and child.className or nil
			if type(childClass) ~= "string" or not READ_SERVICES[childClass] then return "whole-place snapshot contains an unknown service" end
			if seenServices[childClass] then return "whole-place snapshot contains a duplicate service" end
			seenServices[childClass] = true
		end
		local childErr = validateSnapshotNode(child, depth + 1, className, effectiveRoot, stats)
		if childErr then return childErr end
	end
	if dataModel then
		for _, serviceName in PLACE_SERVICES do
			if not seenServices[serviceName] then return "whole-place snapshot is missing service " .. serviceName end
		end
	end
	return nil
end

local function sourceWrite(editor: any, inst: any, callback: (string) -> string): (boolean, string?)
	if not editor or type(editor.UpdateSourceAsync) ~= "function" then return false, "ScriptEditorService.UpdateSourceAsync is unavailable; source was not written" end
	local ok, result = pcall(function() return editor:UpdateSourceAsync(inst, callback) end)
	if not ok then return false, tostring(result) end
	return true
end

local function applySnapshotState(self: any, inst: any, node: any, state: any, expectEmptySource: boolean?): string?
	local props, _, propErr = validateProps(node.props, "snapshot props", false)
	if propErr then return propErr end
	local attrs, attrErr = validateAttributes(node.attributes, "snapshot attributes")
	if attrErr then return attrErr end
	for property, value in props do
		local ok, err = pcall(function() inst[property] = value end)
		if not ok then return ("could not restore %s: %s"):format(property, tostring(err)) end
	end
	local okCurrent, currentAttrs = pcall(function() return inst:GetAttributes() end)
	if not okCurrent or type(currentAttrs) ~= "table" then return "could not read current attributes before restore" end
	for attribute in currentAttrs do
		if attrs[attribute] == nil then
			local ok, err = pcall(function() inst:SetAttribute(attribute, nil) end)
			if not ok then return ("could not remove stale attribute %s: %s"):format(attribute, tostring(err)) end
		end
	end
	for attribute, value in attrs do
		local ok, err = pcall(function() inst:SetAttribute(attribute, value) end)
		if not ok then return ("could not restore attribute %s: %s"):format(attribute, tostring(err)) end
	end
	if SCRIPT_CLASSES[node.className] then
		local source = node.source
		local wrote, writeErr = sourceWrite(self.editor, inst, function(old: string): string
			if expectEmptySource == true and old ~= "" then return error("new restored script was not empty") end
			return source
		end)
		if not wrote then return "could not restore script source: " .. tostring(writeErr) end
		state.scriptsRestored += 1
	end
	return nil
end

local function restoreNode(self: any, parent: any, node: any, state: any): (any?, string?)
	if node.protectedIdentity == true then return nil, "protected snapshot identity cannot be recreated" end
	local inst, createErr = makeInstance(self.options, node.className)
	if not inst then return nil, createErr end
	table.insert(state.created, inst)
	state.instancesCreated += 1
	local okName, nameErr = pcall(function() inst.Name = node.name end)
	if not okName then return nil, "could not name restored instance: " .. tostring(nameErr) end
	local parentOk, parentErr = parentInstance(inst, parent)
	if not parentOk then return nil, "could not parent restored instance: " .. tostring(parentErr) end
	local stateErr = applySnapshotState(self, inst, node, state, true)
	if stateErr then return nil, stateErr end
	for _, childNode in node.children do
		local child, childErr = restoreNode(self, inst, childNode, state)
		if not child then return nil, childErr end
	end
	return inst
end

local function clearRestoreRoot(self: any, root: any): string?
	local children, err = childrenOf(root)
	if not children then return err end
	for _, child in children do
		local className = classNameOf(child)
		local preserve = engineOwnedSnapshotPreserve(self, child)
		local protectedContainer = protectedContainerIdentity(child)
		if not preserve and not protectedContainer then
			if not RESTORE_CLASSES[className] then return "restore would have to delete an unsupported instance class" end
			-- Destroy locks Parent and makes the instance impossible for ChangeHistory to restore.
			-- Studio's undoable deletion model reparents to nil; the recording retains the instance
			-- so Commit can be undone and Cancel can put the exact pre-restore object back.
			local ok = pcall(function() child.Parent = nil end)
			if not ok then return "could not clear the restore root" end
		end
	end
	return nil
end

local function preflightDeletable(node: any, depth: number): string?
	if depth > MAX_SNAPSHOT_DEPTH + 2 then return "current Studio hierarchy is too deeply nested to restore safely" end
	local children, err = childrenOf(node)
	if not children then return err end
	for _, child in children do
		local className = classNameOf(child)
		if SNAPSHOT_PRESERVE_CLASSES[className] or PROTECTED_CONTAINER_CLASSES[className] then
			return "restore would delete protected Studio content nested inside a recreatable instance"
		end
		if not RESTORE_CLASSES[className] then return "restore would delete an unsupported current instance class: " .. className end
		local childErr = preflightDeletable(child, depth + 1)
		if childErr then return childErr end
	end
	return nil
end

local function childWithIdentity(parent: any, className: string, name: string): (any?, string?)
	local children, err = childrenOf(parent)
	if not children then return nil, err end
	local found = nil
	local matches = 0
	for _, child in children do
		if classNameOf(child) == className and nameOf(child) == name then found = child; matches += 1 end
	end
	if matches == 0 then return nil, ("protected %s %s is missing"):format(className, name) end
	if matches > 1 then return nil, ("protected %s %s is ambiguous"):format(className, name) end
	return found
end

local function preflightExisting(self: any, current: any, node: any, protectedPaths: any): string?
	if classNameOf(current) ~= node.className or nameOf(current) ~= node.name then return "restore target identity no longer matches the snapshot" end
	local expectedProtected = {}
	for _, childNode in node.children do
		if childNode.protectedIdentity == true then expectedProtected[childNode.className .. "\0" .. childNode.name] = childNode end
	end
	local children, err = childrenOf(current)
	if not children then return err end
	for _, child in children do
		local className = classNameOf(child)
		if engineOwnedSnapshotPreserve(self, child) then
			local path = fullPath(self.game, child)
			if not path or not protectedPaths[path] then return "protected Studio content was added or moved since the checkpoint" end
		elseif protectedContainerIdentity(child) then
			local key = className .. "\0" .. nameOf(child)
			local childNode = expectedProtected[key]
			if not childNode then return "protected StarterPlayer content no longer matches the checkpoint" end
			local nestedErr = preflightExisting(self, child, childNode, protectedPaths)
			if nestedErr then return nestedErr end
		elseif RESTORE_CLASSES[className] then
			local nestedErr = preflightDeletable(child, 0)
			if nestedErr then return nestedErr end
		else
			return "restore encountered unsupported current content before mutation: " .. className
		end
	end
	for _, childNode in node.children do
		if childNode.protectedIdentity == true then
			local existing, existingErr = childWithIdentity(current, childNode.className, childNode.name)
			if not existing then return existingErr end
		end
	end
	return nil
end

local function restoreExisting(self: any, current: any, node: any, state: any): string?
	local stateErr = applySnapshotState(self, current, node, state, false)
	if stateErr then return stateErr end
	local clearErr = clearRestoreRoot(self, current)
	if clearErr then return clearErr end
	for _, childNode in node.children do
		if childNode.protectedIdentity == true then
			local existing, existingErr = childWithIdentity(current, childNode.className, childNode.name)
			if not existing then return existingErr end
			local nestedErr = restoreExisting(self, existing, childNode, state)
			if nestedErr then return nestedErr end
		else
			local child, childErr = restoreNode(self, current, childNode, state)
			if not child then return childErr end
		end
	end
	return nil
end

local function opPing(): any
	return { pong = true }
end

local function makeNode(self: any, inst: any, path: string, depth: number, state: any): any
	if state.count >= state.maxNodes then state.truncated = true; return nil end
	state.count += 1
	local node: any = {
		path = path,
		name = nameOf(inst),
		class = classNameOf(inst),
		childCount = 0,
	}
	local children = childrenOf(inst)
	if children then node.childCount = #children end
	local props = captureProperties(self.game, inst, READ_PROPERTIES)
	if next(props) then node.props = props end
	local attrs = captureAttributes(self.game, inst)
	if next(attrs) then node.attributes = attrs end
	if depth >= state.maxDepth then
		if node.childCount > 0 then node.moreChildren = node.childCount end
		return node
	end
	if children then
		node.children = {}
		for _, child in children do
			if state.count >= state.maxNodes then state.truncated = true; break end
			if not PRESERVE_CLASSES[classNameOf(child)] then
				local childPath = fullPath(self.game, child) or path .. "." .. nameOf(child)
				local childNode = makeNode(self, child, childPath, depth + 1, state)
				if childNode then table.insert(node.children, childNode) end
			end
		end
		if state.truncated then node.truncated = true end
	end
	return node
end

local function handleTree(self: any, op: any): (any?, string?, string?)
	local maxDepth, depthErr = safeCount(op.maxDepth, 6, 0, MAX_TREE_DEPTH, "maxDepth")
	if not maxDepth then return nil, "invalid", depthErr end
	local maxNodes, nodesErr = safeCount(op.maxNodes, 600, 1, MAX_TREE_NODES, "maxNodes")
	if not maxNodes then return nil, "invalid", nodesErr end
	local state = { count = 0, truncated = false, maxDepth = maxDepth, maxNodes = maxNodes }
	if op.root ~= nil then
		local root, canonical, err, pathKind = resolvePath(self.game, self.options.services, op.root, false)
		if not root then return nil, pathKind or "not_found", err end
		local node = makeNode(self, root, canonical :: string, 0, state)
		return { root = node, nodeCount = state.count, truncated = state.truncated }, nil
	end
	local synthetic: any = { path = "game", name = "game", class = "DataModel", children = {}, childCount = 0 }
	-- READ_SERVICES is a SET: the service NAME is the key and the value is always `true`. Every
	-- other reader indexes it (READ_SERVICES[name]); this was the one place that iterated it, and
	-- it iterated for values, so serviceName was the boolean `true` on all thirteen passes.
	-- GetService refused each one inside serviceFrom's pcall and the whole-place tree came back as
	-- a grammatical `game` with no children at all. Measured in Studio 2026-09-20, 52 warnings.
	for serviceName in READ_SERVICES do
		local service = serviceFrom(self.game, self.options.services, serviceName)
		if service and state.count < state.maxNodes then
			local node = makeNode(self, service, "game." .. serviceName, 1, state)
			if node then table.insert(synthetic.children, node) end
		end
	end
	synthetic.childCount = #synthetic.children
	return { root = synthetic, nodeCount = state.count, truncated = state.truncated }, nil
end

local function handleInstance(self: any, op: any): (any?, string?, string?)
	local inst, canonical, err, pathKind = resolvePath(self.game, self.options.services, op.path, false)
	if not inst then return nil, pathKind or "not_found", err end
	local count, countErr = childCount(inst)
	if count == nil then return nil, "internal", countErr end
	local props = captureProperties(self.game, inst, READ_PROPERTIES)
	local attrs = captureAttributes(self.game, inst)
	return { path = canonical, name = nameOf(inst), class = classNameOf(inst), childCount = count, props = props, attributes = attrs }, nil
end

local function handleListScripts(self: any, op: any): (any?, string?, string?)
	local roots, _, rootErr, rootKind = scriptRoots(self.game, self.options.services, op.root)
	if not roots then return nil, rootKind or "not_found", rootErr end
	local maxScripts, maxErr = safeCount(op.maxScripts, MAX_SCRIPTS, 1, MAX_SCRIPTS, "maxScripts")
	if not maxScripts then return nil, "invalid", maxErr end
	local scripts = {}
	local truncated = false
	local function visit(inst: any): (boolean?, string?)
		local source, sourceErr = scriptSourceWithin(self.editor, inst, "script source")
		if not source then return nil, sourceErr end
		local path = fullPath(self.game, inst)
		if not path then return nil, "could not determine script path" end
		table.insert(scripts, { path = path, class = classNameOf(inst), lines = linesIn(source), chars = #source })
		if #scripts >= maxScripts then truncated = true; return true end
		return false
	end
	local stopped, walkErr = walkScripts(roots, maxScripts, function(inst: any, _): (boolean?, string?) return visit(inst) end)
	if walkErr then return nil, "internal", walkErr end
	return { scripts = scripts, truncated = truncated or stopped }, nil
end

local function handleReadScript(self: any, op: any): (any?, string?, string?)
	local inst, canonical, err, pathKind = resolvePath(self.game, self.options.services, op.path, false)
	if not inst then return nil, pathKind or "not_found", err end
	if not isScript(inst) then return nil, "invalid", "target is not a script" end
	local source, sourceErr = scriptSourceWithin(self.editor, inst, "script source")
	if not source then return nil, "invalid", sourceErr end
	return { path = canonical, class = classNameOf(inst), source = source, baseHash = hashSource(source), lines = linesIn(source) }, nil
end

local function handleDumpScripts(self: any, op: any): (any?, string?, string?)
	local roots, _, rootErr, rootKind = scriptRoots(self.game, self.options.services, op.root)
	if not roots then return nil, rootKind or "not_found", rootErr end
	local maxScripts, maxErr = safeCount(op.maxScripts, 80, 1, MAX_SCRIPTS, "maxScripts")
	if not maxScripts then return nil, "invalid", maxErr end
	local maxChars, charsErr = safeCount(op.maxChars, 400000, 1, MAX_DUMP_CHARS, "maxChars")
	if not maxChars then return nil, "invalid", charsErr end
	local scripts = {}
	local chars = 0
	local truncated = false
	local function visit(inst: any): (boolean?, string?)
		local source, sourceErr = scriptSourceWithin(self.editor, inst, "script source")
		if not source then return nil, sourceErr end
		local path = fullPath(self.game, inst)
		if not path then return nil, "could not determine script path" end
		if chars + #source > maxChars then truncated = true; return true end
		chars += #source
		table.insert(scripts, { path = path, class = classNameOf(inst), source = source, baseHash = hashSource(source) })
		if #scripts >= maxScripts then truncated = true; return true end
		return false
	end
	local stopped, walkErr = walkScripts(roots, maxScripts, function(inst: any, _): (boolean?, string?) return visit(inst) end)
	if walkErr then return nil, "internal", walkErr end
	return { scripts = scripts, chars = chars, truncated = truncated or stopped }, nil
end

local function handleSearchScripts(self: any, op: any): (any?, string?, string?)
	local query, queryErr = safeText(op.query, MAX_QUERY, "query")
	if not query then return nil, "invalid", queryErr end
	if #query == 0 then return nil, "invalid", "query must not be empty" end
	local roots, _, rootErr, rootKind = scriptRoots(self.game, self.options.services, op.root)
	if not roots then return nil, rootKind or "not_found", rootErr end
	local maxResults, maxErr = safeCount(op.maxResults, 40, 1, 200, "maxResults")
	if not maxResults then return nil, "invalid", maxErr end
	local matches = {}
	local truncated = false
	local function visit(inst: any): (boolean?, string?)
		local source, sourceErr = scriptSourceWithin(self.editor, inst, "script source")
		if not source then return nil, sourceErr end
		local path = fullPath(self.game, inst)
		if not path then return nil, "could not determine script path" end
		local lineNumber = 1
		for line in string.gmatch(source .. "\n", "([^\n]*)\n") do
			if string.find(line, query, 1, true) then
				table.insert(matches, { path = path, line = lineNumber, text = string.sub(line, 1, 240) })
				if #matches >= maxResults then truncated = true; return true end
			end
			lineNumber += 1
		end
		return false
	end
	local stopped, walkErr = walkScripts(roots, maxResults, function(inst: any, _): (boolean?, string?) return visit(inst) end)
	if walkErr then return nil, "internal", walkErr end
	return { query = query, matches = matches, truncated = truncated or stopped }, nil
end

local function handleSelection(self: any): (any?, string?, string?)
	if not self.selection or type(self.selection.Get) ~= "function" then return nil, "refused", "Selection service is unavailable" end
	local ok, selection = pcall(function() return self.selection:Get() end)
	if not ok or type(selection) ~= "table" then return nil, "internal", "Studio did not return the selection" end
	local out = {}
	local omitted = 0
	for _, inst in selection do
		if #out >= MAX_ITEMS then omitted += 1 else
			local path = fullPath(self.game, inst)
			local canonical = path and parsePath(path)
			if path and canonical and #canonical >= 2 and READ_SERVICES[canonical[2]] then
				table.insert(out, { path = path, class = classNameOf(inst) })
			else omitted += 1 end
		end
	end
	return { selection = out, omitted = omitted }, nil
end

local function handleLogs(self: any, op: any): (any?, string?, string?)
	if not self.logs or type(self.logs.GetLogHistory) ~= "function" then return nil, "refused", "LogService is unavailable" end
	local maxEntries, maxErr = safeCount(op.maxEntries, 120, 1, MAX_LOG_ENTRIES, "maxEntries")
	if not maxEntries then return nil, "invalid", maxErr end
	if op.sinceClock ~= nil and (not finite(op.sinceClock) or op.sinceClock < 0) then return nil, "invalid", "sinceClock must be a finite non-negative number" end
	local ok, history = pcall(function() return self.logs:GetLogHistory() end)
	if not ok or type(history) ~= "table" then return nil, "internal", "Studio did not return log history" end
	local out = {}
	local start = math.max(1, #history - maxEntries + 1)
	for index = start, #history do
		local entry = history[index]
		if type(entry) == "table" then
			local clock = entry.timestamp or entry.clock or 0
			if finite(clock) and (op.sinceClock == nil or clock > op.sinceClock) then
				local message = tostring(entry.message or entry.text or "")
				table.insert(out, { message = string.sub(message, 1, 600), level = tostring(entry.messageType or entry.level or "output"), clock = clock })
				if #out >= maxEntries then break end
			end
		end
	end
	local nextClock = nil
	if #out > 0 then nextClock = out[#out].clock end
	return { entries = out, total = #history, nextClock = nextClock }, nil
end

local function handleSelect(self: any, op: any): (any?, string?, string?, string?)
	if not self.selection or type(self.selection.Set) ~= "function" then return nil, "refused", "Selection service is unavailable" end
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, false, nil)
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local instances = {}
	local selectedPaths = {}
	for _, target in targets do
		table.insert(instances, target.inst)
		table.insert(selectedPaths, target.path)
	end
	local ok, setErr = pcall(function() self.selection:Set(instances) end)
	if not ok then return nil, "internal", "Studio refused the selection: " .. tostring(setErr) end
	return { selected = #instances, paths = selectedPaths }, nil
end

local function handleCameraFocus(self: any, op: any): (any?, string?, string?)
	local inst, canonical, resolveErr, pathKind = resolvePath(self.game, self.options.services, op.path, false)
	if not inst then return nil, pathKind or "not_found", resolveErr end
	local cframe, size, boundsErr = boundsOf(inst)
	if not cframe then return nil, "invalid", boundsErr end
	local workspaceRef = serviceFrom(self.game, self.options.services, "Workspace")
	if not workspaceRef then return nil, "refused", "Workspace is unavailable" end
	local okCamera, camera = pcall(function() return workspaceRef.CurrentCamera end)
	if not okCamera or camera == nil then return nil, "refused", "Studio has no current camera" end
	if type(CFrame) ~= "table" or type(CFrame.lookAt) ~= "function" then return nil, "refused", "CFrame.lookAt is unavailable" end
	local okValues, target, radius = pcall(function()
		local centre = cframe.Position
		local magnitude = math.sqrt(size.X * size.X + size.Y * size.Y + size.Z * size.Z)
		return centre, math.max(magnitude, 1)
	end)
	if not okValues then return nil, "internal", "could not calculate camera framing" end
	local distance = math.max(radius * 1.6, 12)
	local okSet, setErr = pcall(function()
		local offset = Vector3.new(distance * 0.6, distance * 0.55, distance * 0.6)
		camera.CFrame = CFrame.lookAt(target + offset, target)
	end)
	if not okSet then return nil, "internal", "could not move the Studio camera: " .. tostring(setErr) end
	return { focused = canonical }, nil
end

local function handleViewportInfo(self: any): (any?, string?, string?)
	local workspaceRef = serviceFrom(self.game, self.options.services, "Workspace")
	if not workspaceRef then return nil, "refused", "Workspace is unavailable" end
	local info: any = { workspaceTopLevel = {} }
	local okCamera, camera = pcall(function() return workspaceRef.CurrentCamera end)
	if okCamera and camera then
		local okInfo, cameraInfo = pcall(function()
			local components = { camera.CFrame:GetComponents() }
			local viewport = camera.ViewportSize
			return {
				cframe = components,
				fov = camera.FieldOfView,
				viewportSize = if viewport then { viewport.X, viewport.Y } else nil,
			}
		end)
		if okInfo then info.camera = cameraInfo end
	end
	local children, childErr = childrenOf(workspaceRef)
	if not children then return nil, "internal", childErr end
	for _, child in children do
		if #info.workspaceTopLevel >= 60 then
			info.truncated = true
			break
		end
		if not PRESERVE_CLASSES[classNameOf(child)] then
			local cframe, size = boundsOf(child)
			if cframe and size then
				local path = fullPath(self.game, child)
				local okSpatial, entry = pcall(function()
					return {
						path = path,
						class = classNameOf(child),
						center = { rounded(cframe.Position.X), rounded(cframe.Position.Y), rounded(cframe.Position.Z) },
						size = { rounded(size.X), rounded(size.Y), rounded(size.Z) },
					}
				end)
				if okSpatial and path then table.insert(info.workspaceTopLevel, entry) end
			end
		end
	end
	return info, nil
end

local function handleCreate(self: any, op: any): (any?, string?, string?, string?)
	local validationErr, validationKind, validationRemedy = validateCreateItems(self.options, self.game, op.items)
	if validationErr then return nil, validationKind or "invalid", validationErr, validationRemedy end
	local state = { created = {} }
	local paths = {}
	for _, spec in op.items do
		local inst, err = buildSpec(self.options, self.game, spec, nil, state, 0)
		if not inst then
			for _, made in state.created do destroyInstance(made) end
			return nil, "internal", err
		end
		local path = fullPath(self.game, inst)
		if not path then
			for _, made in state.created do destroyInstance(made) end
			return nil, "internal", "could not determine created instance path"
		end
		table.insert(paths, path)
	end
	return { created = paths, count = #paths }, nil
end

--[[ INSERT A ROBLOX-HOSTED ASSET, AND NEVER ITS CODE.

	This was refused — "no remote asset loader is exposed through the command bridge" — and
	`scripts/verify-artifact.py` FAILED the build on `GetService("InsertService")` to enforce it.
	The refusal cost the product its headline feature: the asset library holds 81,648 items a user
	can insert without uploading anything, and with this op unsupported the worker withheld the
	tool, so the library delivered nothing at all.

	THE REFUSAL AIMED AT THE RIGHT DANGER AND HIT THE WRONG TARGET. What got the legacy plugin
	removed for "Misusing Roblox Systems" is `apps/plugin/src/Ops.luau:521`: it builds a
	ModuleScript out of an HTTP response body and `require`s it, so text arriving over the wire
	becomes running code. `InsertService:LoadAsset` is not that shape. It is a first-party Roblox
	service, it takes an asset id rather than a payload, and Roblox decides what comes back.

	THE REAL RISK IS DIFFERENT, AND THIS IS WHERE IT IS STOPPED. A model fetched by id can still
	CONTAIN scripts — that is how malicious free models spread. So the loaded tree is searched for
	any `LuaSourceContainer` BEFORE a single instance is parented into the place, and an asset
	carrying even one script is destroyed and refused by name. The build now REQUIRES this guard to
	be present in the shipped bytes, which is a stronger invariant than forbidding the loader was:
	"no loader" could always be satisfied by a plugin that inserts nothing, while "no insertion
	without the code refusal" cannot be satisfied by removing the guard.

	Every child is checked against `destinationRefusal` before ANY child is parented, so a
	multi-part asset cannot leave half of itself behind when the second part is refused.
]]
local function handleInsertAsset(self: any, op: any): (any?, string?, string?, string?)
	local assetId = op.assetId
	if type(assetId) ~= "number" or assetId ~= assetId or assetId % 1 ~= 0 or assetId <= 0 or assetId > 9007199254740991 then
		return nil, "invalid", "assetId must be a positive whole number"
	end

	local parent
	if op.parent ~= nil then
		local resolved, _, parentErr, parentKind, parentRemedy = resolvePath(self.game, self.options.services, op.parent, true)
		if not resolved then return nil, parentKind or "not_found", parentErr, parentRemedy end
		parent = resolved
	else
		local okWorkspace, workspaceService = pcall(function() return self.game:GetService("Workspace") end)
		if not okWorkspace or typeof(workspaceService) ~= "Instance" then return nil, "internal", "Workspace is unavailable" end
		parent = workspaceService
	end
	if not writableTarget(self.game, parent) then return nil, "refused", "insert parent is outside Apple's place scope", "choose_allowed_target" end

	local okLoad, loaded = pcall(function()
		return self.game:GetService("InsertService"):LoadAsset(assetId)
	end)
	if not okLoad or typeof(loaded) ~= "Instance" then
		-- WHY ONE REMEDY FOR EVERY WAY THIS CAN FAIL. LoadAsset refuses for several reasons and
		-- Roblox says which only in prose we do not own, so the code cannot be picked by reading
		-- the sentence. It is `take_asset_first` because ownership is the only cause the user can
		-- act on, and because it is the cause in practice: the ownership evidence note dated
		-- 2026-09-19 measured "User is not authorized" for a library id against an owned-asset
		-- control that succeeded, and asset-library.ts reports that every live row of the library
		-- needs taking. The over-promise is narrow and visible — a deleted or moderated asset sends
		-- the user to a Creator Store page that is not there — and that beats the alternative,
		-- which is the worker saying it does not know while the product has the answer written down.
		return nil, "refused", "Roblox would not load asset " .. tostring(assetId) .. ": " .. tostring(loaded), "take_asset_first"
	end

	local scripts = {}
	for _, descendant in loaded:GetDescendants() do
		if descendant:IsA("LuaSourceContainer") then table.insert(scripts, descendant.Name) end
	end
	if #scripts > 0 then
		destroyInstance(loaded)
		-- The one refusal in this file where the user's next move is a different asset rather than a
		-- setting, so it says so instead of leaving the model to guess that the asset was the problem.
		return nil, "refused", "asset " .. tostring(assetId) .. " carries " .. tostring(#scripts) .. " script(s) and was not inserted; Apple inserts geometry, not code", "choose_scriptless_asset"
	end

	local children = loaded:GetChildren()
	if #children == 0 then
		destroyInstance(loaded)
		return nil, "refused", "asset " .. tostring(assetId) .. " contained nothing to insert"
	end

	local parentPath = readablePath(self, parent) or "the insert parent"
	for _, child in children do
		local refusal, refusalRemedy = destinationRefusal(self.game, parent, parentPath, classNameOf(child))
		if refusal then
			destroyInstance(loaded)
			return nil, "refused", refusal, refusalRemedy
		end
	end

	local inserted = {}
	for _, child in children do
		child.Parent = parent
		table.insert(inserted, fullPath(self.game, child) or nameOf(child))
	end
	destroyInstance(loaded)
	return { assetId = assetId, inserted = inserted, count = #inserted, parent = parentPath }, nil
end

local function handleSetProps(self: any, op: any): (any?, string?, string?, string?)
	local inst, canonical, err, pathKind, pathRemedy = resolvePath(self.game, self.options.services, op.path, true)
	if not inst then return nil, pathKind or "not_found", err, pathRemedy end
	if not writableTarget(self.game, inst) then return nil, "refused", "target is outside Apple's place scope", "choose_allowed_target" end
	if op.props == nil and op.attributes == nil then return nil, "invalid", "set_props needs props or attributes" end
	local set, setErr = setProperties(inst, op.props, op.attributes, "set_props")
	if not set then return nil, "invalid", setErr end
	return { path = canonical, set = set }, nil
end

local function handleDelete(self: any, op: any): (any?, string?, string?, string?)
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, "delete")
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local overlap = rejectNestedTargets(targets, "delete_instances")
	if overlap then return nil, "invalid", overlap end
	local deleted = {}
	for _, target in targets do table.insert(deleted, target.path) end
	for _, target in targets do
		local ok, destroyErr = pcall(function() target.inst:Destroy() end)
		if not ok then return nil, "internal", ("could not delete %s: %s"):format(target.path, tostring(destroyErr)) end
	end
	return { deleted = deleted, count = #deleted }, nil
end

local function handleMove(self: any, op: any): (any?, string?, string?, string?)
	if type(op.moves) ~= "table" then return nil, "invalid", "moves must be an array" end
	local count = #op.moves
	if count == 0 then return nil, "invalid", "moves must contain at least one move" end
	if count > MAX_ITEMS then return nil, "invalid", ("moves exceeds the %d item limit"):format(MAX_ITEMS) end
	for key in op.moves do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then return nil, "invalid", "moves must be a dense array" end
	end

	local plans = {}
	local sources = {}
	local seen = {}
	local namesByParent = {}
	for index = 1, count do
		local move = op.moves[index]
		if type(move) ~= "table" then return nil, "invalid", ("moves[%d] must be an object"):format(index) end
		local source, canonical, sourceErr, sourceKind, sourceRemedy = resolvePath(self.game, self.options.services, move.path, true)
		if not source then return nil, sourceKind or "not_found", sourceErr, sourceRemedy end
		if seen[source] then return nil, "invalid", ("duplicate move target: %s"):format(canonical :: string) end
		local refused = structuralRefusal(self.game, source, canonical :: string, "move")
		if refused then return nil, "refused", refused end
		local parent, parentPath, parentErr, parentKind, parentRemedy = resolvePath(self.game, self.options.services, move.newParent, true)
		if not parent then return nil, parentKind or "not_found", parentErr, parentRemedy end
		if parent == source or isDescendantOf(parent, source) then
			return nil, "invalid", ("move_instances refuses to parent %s inside itself or one of its descendants"):format(canonical :: string)
		end
		local parentRefused, parentRefusedRemedy = destinationRefusal(self.game, parent, parentPath :: string, classNameOf(source))
		if parentRefused then return nil, "refused", parentRefused, parentRefusedRemedy end
		local name = nameOf(source)
		local byName = namesByParent[parent]
		if not byName then byName = {}; namesByParent[parent] = byName end
		if byName[name] then return nil, "conflict", ("two moved instances would share the path %s.%s"):format(parentPath :: string, name) end
		local okCollision, collision = pcall(function() return parent:FindFirstChild(name) end)
		if not okCollision then return nil, "internal", "could not inspect the target parent" end
		if collision and collision ~= source then return nil, "conflict", ("%s already contains a child named %s"):format(parentPath :: string, name) end
		byName[name] = true
		seen[source] = true
		table.insert(sources, { inst = source })
		table.insert(plans, { inst = source, parent = parent, before = canonical })
	end
	local overlap = rejectNestedTargets(sources, "move_instances")
	if overlap then return nil, "invalid", overlap end
	for _, plan in plans do
		local ok, parentErr = safeSetParent(plan.inst, plan.parent)
		if not ok then return nil, "internal", ("could not move %s: %s"):format(plan.before, tostring(parentErr)) end
	end
	local moved = {}
	for _, plan in plans do
		local path, pathErr = readablePath(self, plan.inst)
		if not path then return nil, "internal", pathErr end
		table.insert(moved, path)
	end
	return { moved = moved, count = #moved }, nil
end

local function handleTransform(self: any, op: any): (any?, string?, string?, string?)
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local moved = op.move ~= nil
	local rotated = op.rotate ~= nil
	local scaled = op.scale ~= nil
	if not moved and not rotated and not scaled then return nil, "invalid", "transform_instances needs move, rotate or scale" end

	local move = { 0, 0, 0 }
	if moved then
		local value, err = finiteTriple(op.move, "move", MAX_TRANSLATION)
		if not value then return nil, "invalid", err end
		move = value
	end
	local rotate = { 0, 0, 0 }
	if rotated then
		local value, err = finiteTriple(op.rotate, "rotate", MAX_ROTATION_DEGREES)
		if not value then return nil, "invalid", err end
		rotate = value
	end
	local scale = 1
	if scaled then
		if not finite(op.scale) or op.scale < MIN_SCALE or op.scale > MAX_SCALE then
			return nil, "invalid", ("scale must be finite and between %g and %g"):format(MIN_SCALE, MAX_SCALE)
		end
		scale = op.scale
	end

	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, nil)
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local overlap = rejectNestedTargets(targets, "transform_instances")
	if overlap then return nil, "invalid", overlap end
	if type(CFrame) ~= "table" or type(CFrame.Angles) ~= "function" then return nil, "refused", "CFrame.Angles is unavailable" end
	local okFrames, moveVector, rotation = pcall(function()
		return Vector3.new(move[1], move[2], move[3]), CFrame.Angles(math.rad(rotate[1]), math.rad(rotate[2]), math.rad(rotate[3]))
	end)
	if not okFrames then return nil, "internal", "could not construct the requested transform" end

	local changes = {}
	local seenParts = {}
	for _, target in targets do
		local origin, parts, spatialErr = spatialBody(target.inst)
		if not origin then return nil, "invalid", ("%s: %s"):format(target.path, spatialErr or "not spatial") end
		for _, part in parts do
			if not seenParts[part] then
				seenParts[part] = true
				if #changes >= MAX_AFFECTED_PARTS then return nil, "invalid", "transform exceeds the affected-part limit" end
				local okChange, change = pcall(function()
					local current = part.CFrame
					local offset = current.Position - origin
					local nextPosition = origin + rotation:VectorToWorldSpace(offset) * scale + moveVector
					local turned = rotation * current
					local nextCFrame = turned + (nextPosition - turned.Position)
					local nextSize = if scaled then part.Size * scale else nil
					return { part = part, cframe = nextCFrame, size = nextSize }
				end)
				if not okChange then return nil, "internal", "could not calculate the transform: " .. tostring(change) end
				table.insert(changes, change)
			end
		end
	end
	for _, change in changes do
		local ok, setErr = pcall(function()
			change.part.CFrame = change.cframe
			if change.size then change.part.Size = change.size end
		end)
		if not ok then return nil, "internal", "Studio refused part transform: " .. tostring(setErr) end
	end
	return { transformed = #targets, parts = #changes, moved = moved, rotated = rotated, scaled = scaled }, nil
end

local function handleClone(self: any, op: any): (any?, string?, string?, string?)
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, "clone")
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local overlap = rejectNestedTargets(targets, "clone_instances")
	if overlap then return nil, "invalid", overlap end
	local override = nil
	if op.parent ~= nil then
		local parent, _, parentErr, parentKind, parentRemedy = resolvePath(self.game, self.options.services, op.parent, true)
		if not parent then return nil, parentKind or "not_found", parentErr, parentRemedy end
		override = parent
	end

	local reservations = {}
	local plans = {}
	for _, target in targets do
		local archivableOk, archivable = pcall(function() return target.inst.Archivable end)
		if archivableOk and archivable == false then return nil, "refused", target.path .. " has Archivable disabled" end
		local parent = override or parentOf(target.inst)
		if not parent then return nil, "refused", target.path .. " has no parent for its clone" end
		if parent == target.inst or isDescendantOf(parent, target.inst) then return nil, "invalid", "clone parent may not be inside the source" end
		local parentPath = readablePath(self, parent) or "the clone parent"
		local parentRefused, parentRefusedRemedy = destinationRefusal(self.game, parent, parentPath, classNameOf(target.inst))
		if parentRefused then return nil, "refused", parentRefused, parentRefusedRemedy end
		local cloneName, nameErr = reserveUniqueName(parent, nameOf(target.inst), reservations)
		if not cloneName then return nil, "conflict", nameErr end
		table.insert(plans, { source = target.inst, parent = parent, name = cloneName })
	end

	local detached = {}
	for _, plan in plans do
		local copy, cloneErr = safeClone(plan.source)
		if not copy then
			for _, made in detached do destroyInstance(made) end
			return nil, "internal", cloneErr
		end
		copy.Name = plan.name
		table.insert(detached, copy)
	end
	local created = {}
	for index, copy in detached do
		local ok, parentErr = safeSetParent(copy, plans[index].parent)
		if not ok then return nil, "internal", "could not parent clone: " .. tostring(parentErr) end
		local path, pathErr = readablePath(self, copy)
		if not path then return nil, "internal", pathErr end
		table.insert(created, path)
	end
	return { created = created, count = #created }, nil
end

local function handleGroup(self: any, op: any): (any?, string?, string?, string?)
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, "group")
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local overlap = rejectNestedTargets(targets, "group_instances")
	if overlap then return nil, "invalid", overlap end
	local wanted, nameErr = safeName(op.name or "Model", "group_instances.name")
	if not wanted then return nil, "invalid", nameErr end
	local home = parentOf(targets[1].inst)
	if not home then return nil, "refused", targets[1].path .. " has no parent" end
	local homePath = readablePath(self, home) or "the group parent"
	local homeRefused, homeRefusedRemedy = destinationRefusal(self.game, home, homePath, "Model")
	if homeRefused then return nil, "refused", homeRefused, homeRefusedRemedy end
	local childNames = {}
	local fromElsewhere = 0
	for _, target in targets do
		local parent = parentOf(target.inst)
		if not parent then return nil, "refused", target.path .. " has no parent" end
		if parent ~= home then fromElsewhere += 1 end
		local name = nameOf(target.inst)
		if childNames[name] then return nil, "conflict", "group would contain two children with the same path name: " .. name end
		childNames[name] = true
	end
	local modelName, uniqueErr = uniqueName(home, wanted)
	if not modelName then return nil, "conflict", uniqueErr end
	local model, createErr = makeInstance(self.options, "Model")
	if not model then return nil, "internal", createErr end
	model.Name = modelName
	local parentOk, parentErr = safeSetParent(model, home)
	if not parentOk then destroyInstance(model); return nil, "internal", "could not parent group: " .. tostring(parentErr) end
	for _, target in targets do
		local ok, moveErr = safeSetParent(target.inst, model)
		if not ok then return nil, "internal", "could not move target into group: " .. tostring(moveErr) end
	end
	local path, pathErr = readablePath(self, model)
	if not path then return nil, "internal", pathErr end
	return { path = path, grouped = #targets, fromOtherParents = fromElsewhere }, nil
end

local function handleUngroup(self: any, op: any): (any?, string?, string?, string?)
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, "ungroup")
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local overlap = rejectNestedTargets(targets, "ungroup_instances")
	if overlap then return nil, "invalid", overlap end
	local plans = {}
	local plannedNames = {}
	for _, target in targets do
		if not isA(target.inst, "Model") and not isA(target.inst, "Folder") then return nil, "invalid", target.path .. " is not a Model or Folder" end
		local parent = parentOf(target.inst)
		if not parent then return nil, "refused", target.path .. " has no parent" end
		local parentPath = readablePath(self, parent) or "the ungroup parent"
		local children, childErr = childrenOf(target.inst)
		if not children then return nil, "internal", childErr end
		for _, child in children do
			local parentRefused, parentRefusedRemedy = destinationRefusal(self.game, parent, parentPath, classNameOf(child))
			if parentRefused then return nil, "refused", parentRefused, parentRefusedRemedy end
		end
		local names = plannedNames[parent]
		if not names then names = {}; plannedNames[parent] = names end
		for _, child in children do
			local name = nameOf(child)
			if names[name] then return nil, "conflict", "ungroup would create duplicate sibling path: " .. name end
			local okExisting, existing = pcall(function() return parent:FindFirstChild(name) end)
			if not okExisting then return nil, "internal", "could not inspect the ungroup destination" end
			if existing and existing ~= target.inst then return nil, "conflict", "ungroup destination already has a child named " .. name end
			names[name] = true
		end
		table.insert(plans, { target = target, parent = parent, children = children })
	end
	local released = {}
	local removed = {}
	for _, plan in plans do
		for _, child in plan.children do
			local ok, moveErr = safeSetParent(child, plan.parent)
			if not ok then return nil, "internal", "could not release grouped child: " .. tostring(moveErr) end
			local path, pathErr = readablePath(self, child)
			if not path then return nil, "internal", pathErr end
			table.insert(released, path)
		end
		table.insert(removed, plan.target.path)
		local ok, destroyErr = pcall(function() plan.target.inst:Destroy() end)
		if not ok then return nil, "internal", "could not remove empty group: " .. tostring(destroyErr) end
	end
	return { released = released, removed = removed }, nil
end

local function handleRename(self: any, op: any): (any?, string?, string?, string?)
	local inst, canonical, resolveErr, pathKind, pathRemedy = resolvePath(self.game, self.options.services, op.path, true)
	if not inst then return nil, pathKind or "not_found", resolveErr, pathRemedy end
	local refused = structuralRefusal(self.game, inst, canonical :: string, "rename")
	if refused then return nil, "refused", refused end
	local wanted, nameErr = safeName(op.name, "rename_instance.name")
	if not wanted then return nil, "invalid", nameErr end
	local parent = parentOf(inst)
	if parent then
		local okCollision, collision = pcall(function() return parent:FindFirstChild(wanted) end)
		if not okCollision then return nil, "internal", "could not inspect sibling names" end
		if collision and collision ~= inst then return nil, "conflict", "a sibling already uses that name" end
	end
	local before = nameOf(inst)
	local okRename, renameErr = pcall(function() inst.Name = wanted end)
	if not okRename then return nil, "internal", "Studio refused the rename: " .. tostring(renameErr) end
	local after, pathErr = readablePath(self, inst)
	if not after then
		pcall(function() inst.Name = before end)
		return nil, "internal", pathErr
	end
	local back = resolvePath(self.game, self.options.services, after, true)
	if back ~= inst then
		pcall(function() inst.Name = before end)
		return nil, "conflict", "the renamed path did not resolve back to the same instance"
	end
	return { path = after, was = before, name = wanted }, nil
end

local function handleSetLocked(self: any, op: any): (any?, string?, string?, string?)
	if type(op.locked) ~= "boolean" then return nil, "invalid", "locked must be true or false" end
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, nil)
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local parts = {}
	local seen = {}
	local skipped = {}
	for _, target in targets do
		local body, bodyErr = partsUnder(target.inst)
		if not body then return nil, "internal", bodyErr end
		if #body == 0 then table.insert(skipped, target.path) end
		for _, part in body do
			if not seen[part] then
				seen[part] = true
				if #parts >= MAX_AFFECTED_PARTS then return nil, "invalid", "set_locked exceeds the affected-part limit" end
				table.insert(parts, part)
			end
		end
	end
	for _, part in parts do
		local ok, setErr = pcall(function() part.Locked = op.locked end)
		if not ok then return nil, "internal", "could not change Locked: " .. tostring(setErr) end
	end
	return { locked = op.locked, parts = #parts, skipped = skipped }, nil
end

local function handleSetVisible(self: any, op: any): (any?, string?, string?, string?)
	if type(op.visible) ~= "boolean" then return nil, "invalid", "visible must be true or false" end
	local paths, pathsErr = pathList(op, "paths")
	if not paths then return nil, "invalid", pathsErr end
	local targets, targetErr, targetKind, targetRemedy = resolveTargets(self, paths, true, nil)
	if not targets then return nil, targetKind or "not_found", targetErr, targetRemedy end
	local parts = {}
	local guiObjects = {}
	local seen = {}
	local skipped = {}
	for _, target in targets do
		local body, bodyErr = partsUnder(target.inst)
		if not body then return nil, "internal", bodyErr end
		if #body > 0 then
			for _, part in body do
				if not seen[part] then
					seen[part] = true
					if #parts >= MAX_AFFECTED_PARTS then return nil, "invalid", "set_visible exceeds the affected-part limit" end
					table.insert(parts, part)
				end
			end
		elseif isA(target.inst, "GuiObject") then
			if not seen[target.inst] then seen[target.inst] = true; table.insert(guiObjects, target.inst) end
		else
			table.insert(skipped, target.path)
		end
	end
	for _, part in parts do
		local ok, visibleErr = setPartVisible(part, op.visible)
		if not ok then return nil, "internal", visibleErr end
	end
	for _, gui in guiObjects do
		local ok, visibleErr = pcall(function() gui.Visible = op.visible end)
		if not ok then return nil, "internal", "could not change GUI visibility: " .. tostring(visibleErr) end
	end
	return { visible = op.visible, parts = #parts, guiObjects = #guiObjects, skipped = skipped }, nil
end

local function handleEditScript(self: any, op: any): (any?, string?, string?, string?)
	local canonicalPath, parseErr = parsePath(op.path)
	if not canonicalPath then return nil, "invalid", parseErr end
	local hasSource = op.source ~= nil
	local hasEdits = op.edits ~= nil
	if hasSource == hasEdits then return nil, "invalid", "edit_script needs exactly one of source or edits" end
	if hasSource then
		local _, sourceErr = validateSourceEdit(op.path, op.source)
		if sourceErr then return nil, "invalid", sourceErr end
	end
	if hasEdits and type(op.edits) ~= "table" then return nil, "invalid", "edits must be an array" end
	local inst, canonical, resolveErr, pathKind, pathRemedy = resolvePath(self.game, self.options.services, op.path, true)
	local created = false
	local parent = nil
	if not inst then
		if not sourceEditIsCreate(op) then return nil, pathKind or "not_found", resolveErr, pathRemedy end
		local create = op.create
		local createClass, classErr = safeText(create.className, 64, "create.className")
		if not createClass then return nil, "invalid", classErr end
		if not SCRIPT_CLASSES[createClass] then return nil, "invalid", "edit_script.create class must be Script, LocalScript or ModuleScript" end
		local parentCanonical
		local parentKind
		local parentRemedy
		parent, parentCanonical, resolveErr, parentKind, parentRemedy = resolvePath(self.game, self.options.services, create.parent, true)
		if not parent then return nil, parentKind or "not_found", resolveErr, parentRemedy end
		local parentRefused, parentRefusedRemedy = destinationRefusal(self.game, parent, parentCanonical :: string, createClass)
		if parentRefused then return nil, "refused", parentRefused, parentRefusedRemedy end
		if op.baseHash ~= nil then return nil, "invalid", "baseHash is only valid for an existing script" end
		if #canonicalPath < 3 then return nil, "invalid", "a created script path must include a parent and script name" end
		local name = canonicalPath[#canonicalPath]
		local validName, nameErr = safeName(name, "script name")
		if not validName then return nil, "invalid", nameErr end
		if validName ~= name then return nil, "invalid", "script path name is not canonical" end
		local requestedParentPath = pathFromParts(canonicalPath, #canonicalPath - 1)
		local requestedParent, requestedParentCanonical, requestedParentErr, requestedParentKind, requestedParentRemedy = resolvePath(self.game, self.options.services, requestedParentPath, true)
		if not requestedParent then return nil, requestedParentKind or "not_found", requestedParentErr, requestedParentRemedy end
		if requestedParent ~= parent then
			return nil, "conflict", ("script path parent %s does not match create.parent %s"):format(requestedParentCanonical :: string, parentCanonical :: string)
		end
		local createdInst, createErr = makeInstance(self.options, createClass)
		if not createdInst then return nil, "internal", createErr end
		inst = createdInst
		created = true
		local okName, nameSetErr = pcall(function() inst.Name = validName end)
		if not okName then return nil, "internal", "could not name script: " .. tostring(nameSetErr) end
		local parentOk, parentErr = parentInstance(inst, parent)
		if not parentOk then return nil, "internal", "could not parent script: " .. tostring(parentErr) end
		canonical = fullPath(self.game, inst)
	else
		if not isScript(inst) then return nil, "invalid", "target is not a script" end
		if op.create ~= nil then return nil, "conflict", "script already exists; remove create and read it before editing" end
		if type(op.baseHash) ~= "string" or string.match(op.baseHash, "^%x%x%x%x%x%x%x%x$") == nil then return nil, "invalid", "baseHash is required for an existing script and must be eight hex characters" end
	end
	local finalSource = ""
	local wrote, writeErr = sourceWrite(self.editor, inst, function(old: string): string
		if not created then
			if hashSource(old) ~= op.baseHash then
				return error("script changed in Studio since it was read; nothing was written; read it again")
			end
		end
		local nextSource, nextErr
		if hasSource then nextSource = op.source else nextSource, nextErr = applyTextEdits(old, op.edits, op.path) end
		if not nextSource then return error(nextErr) end
		if #nextSource > MAX_SOURCE then return error("edited source exceeds the character limit") end
		finalSource = nextSource
		return nextSource
	end)
	if not wrote then
		if created then destroyInstance(inst) end
		return nil, string.find(tostring(writeErr), "changed in Studio", 1, true) and "conflict" or "internal", writeErr
	end
	return { path = canonical, mode = hasSource and "replace" or "edits", chars = #finalSource, lines = linesIn(finalSource), baseHash = hashSource(finalSource) }, nil
end

local function handleSnapshot(self: any, op: any): (any?, string?, string?)
	local root, canonical, err, pathKind = resolvePath(self.game, self.options.services, op.root, false)
	if not root then return nil, pathKind or "not_found", err end
	local checkpointId = nil
	if op.checkpointId ~= nil or root == self.game then
		local value, identityErr = safeText(op.checkpointId, 128, "snapshot checkpointId")
		if not value or #value == 0 or string.match(value, "^[A-Za-z0-9][A-Za-z0-9_%.:%-]*$") == nil then
			return nil, "invalid", identityErr or "snapshot checkpointId must be a non-empty stable identifier"
		end
		checkpointId = value
	end
	local includeScripts = op.includeScripts ~= false
	local state = {
		nodes = 0,
		instanceCount = 0,
		scriptCount = 0,
		sourceChars = 0,
		includeScripts = includeScripts,
		complete = true,
		truncated = false,
		skipped = {},
		protected = {},
	}
	local node, nodeErr
	if root == self.game then
		node, nodeErr = snapshotDataModel(self, state)
	else
		node, nodeErr = snapshotNode(self, root, 0, state)
	end
	if nodeErr then return nil, "invalid", nodeErr end
	if not node then return nil, "invalid", "snapshot exceeded its bounded size" end
	local restorable = state.complete and not state.truncated
	local exact = restorable and #state.protected == 0
	local scope = if root == self.game then "place" else "subtree"
	local coverage = if exact then "exact" elseif restorable then "supported-subset" else "incomplete"
	return {
		format = "apple-studio-snapshot-v1",
		checkpointId = checkpointId,
		scope = scope,
		root = canonical,
		node = node,
		nodeCount = state.nodes,
		instanceCount = state.instanceCount,
		scriptCount = state.scriptCount,
		sourceChars = state.sourceChars,
		sourceHashAlgorithm = "fnv1a32",
		includeScripts = includeScripts,
		-- `complete` means exact fidelity. Engine-owned protected identities (Camera, Terrain and the
		-- default TextChat configuration singletons) remain outside the bounded subset, so their
		-- presence keeps this false even when the supported subset is safely restorable.
		complete = exact,
		restorable = restorable,
		checkpointEligible = checkpointId ~= nil and restorable,
		wholePlaceComplete = root == self.game and exact,
		coverage = coverage,
		truncated = state.truncated,
		-- Absent when nothing stopped the walk. A plugin build older than 2026-09-21 never sends it,
		-- and the worker answers that absence with a sentence that claims neither cause.
		truncatedBy = state.truncatedBy,
		skipped = state.skipped,
		protected = state.protected,
	}, nil
end

local function restoreCheckpointIdentity(value: any, label: string): (string?, string?)
	local checkpointId, err = safeText(value, 128, label)
	if not checkpointId then return nil, err end
	if #checkpointId == 0 or string.match(checkpointId, "^[A-Za-z0-9][A-Za-z0-9_%.:%-]*$") == nil then
		return nil, label .. " must be a non-empty stable identifier"
	end
	return checkpointId
end

local function insideRoot(root: any, inst: any): boolean
	if inst == root then return true end
	local current = parentOf(inst)
	local depth = 0
	while current do
		depth += 1
		if depth > MAX_SNAPSHOT_DEPTH + 8 then return false end
		if current == root then return true end
		current = parentOf(current)
	end
	return false
end

local function validateProtectedManifest(self: any, root: any, manifest: any): (any?, string?, string?)
	if type(manifest) ~= "table" then return nil, "invalid", "snapshot protected manifest is missing" end
	local count = 0
	for key in manifest do
		if not integer(key) or key < 1 then return nil, "invalid", "snapshot protected manifest must be an array" end
		count += 1
	end
	if count > MAX_PROTECTED_NODES then return nil, "invalid", "snapshot protected manifest exceeds its bound" end
	for index = 1, count do if manifest[index] == nil then return nil, "invalid", "snapshot protected manifest contains a hole" end end
	local paths = {}
	for index = 1, count do
		local entry = manifest[index]
		if type(entry) ~= "table" then return nil, "invalid", "snapshot protected entry must be an object" end
		local path, pathErr = safeText(entry.path, MAX_PATH, "protected path")
		if not path then return nil, "invalid", pathErr end
		if paths[path] then return nil, "invalid", "snapshot protected manifest contains a duplicate path" end
		local className, classErr = safeText(entry.className, 64, "protected className")
			if not className or not SNAPSHOT_PRESERVE_CLASSES[className] then return nil, "invalid", classErr or "snapshot protected class is not engine-owned" end
		local name, nameErr = safeName(entry.name, "protected name")
		if not name then return nil, "invalid", nameErr end
			if not integer(entry.childCount) or entry.childCount < 0 or entry.childCount > MAX_TREE_NODES * 4 then
				return nil, "invalid", "snapshot protected childCount is outside the bound"
			end
			if not integer(entry.descendantCount) or entry.descendantCount < 0 or entry.descendantCount > MAX_TREE_NODES * 4 then
				return nil, "invalid", "snapshot protected descendantCount is outside the bound"
			end
			local structureHash, structureHashErr = safeText(entry.structureHash, 8, "protected structureHash")
			if not structureHash or string.match(structureHash, "^%x%x%x%x%x%x%x%x$") == nil then return nil, "invalid", structureHashErr or "protected structureHash must be eight hex characters" end
			local current, _, resolveErr, resolveKind = resolvePath(self.game, self.options.services, path, false)
			if not current then return nil, resolveKind or "conflict", resolveErr or "protected snapshot object is missing" end
			if not insideRoot(root, current) then return nil, "invalid", "snapshot protected object is outside the restore root" end
			if classNameOf(current) ~= className or nameOf(current) ~= name or not engineOwnedSnapshotPreserve(self, current) then return nil, "conflict", "protected Studio identity no longer matches the checkpoint" end
			local children, childrenErr = childrenOf(current)
			if not children then return nil, "conflict", childrenErr end
			if #children ~= entry.childCount then return nil, "conflict", "protected Studio content changed since the checkpoint" end
			local currentHash, currentDescendants, currentHashErr = protectedStructureHash(self, current, 0, { nodes = 0 })
			if not currentHash then return nil, "conflict", currentHashErr end
			if currentDescendants ~= entry.descendantCount or currentHash ~= string.lower(structureHash) then return nil, "conflict", "protected Studio content changed since the checkpoint" end
			paths[path] = true
		end
	return paths
end

local function prepareRestore(self: any, op: any): (any?, string?, string?, string?)
	local root, canonical, err, pathKind, pathRemedy = resolvePath(self.game, self.options.services, op.root, true)
	if not root then return nil, pathKind or "not_found", err, pathRemedy end
	if root ~= self.game and not writableTarget(self.game, root) then return nil, "refused", "restore root is outside Apple's place scope", "choose_allowed_target" end
	local checkpointId, identityErr = restoreCheckpointIdentity(op.checkpointId, "restore checkpointId")
	if not checkpointId then return nil, "invalid", identityErr end
	if type(op.snapshot) ~= "table" or op.snapshot.format ~= "apple-studio-snapshot-v1" then return nil, "invalid", "snapshot format is not recognised" end
	local snapshotId, snapshotIdentityErr = restoreCheckpointIdentity(op.snapshot.checkpointId, "snapshot checkpointId")
	if not snapshotId then return nil, "invalid", snapshotIdentityErr end
	if snapshotId ~= checkpointId then return nil, "conflict", "restore checkpointId does not match the snapshot identity" end
	if op.snapshot.root ~= canonical then return nil, "conflict", "snapshot root does not match the requested restore root" end
		if op.snapshot.truncated == true or op.snapshot.restorable ~= true or op.snapshot.checkpointEligible ~= true then
			return nil, "invalid", "snapshot is incomplete or unbound and cannot be restored safely"
		end
		if op.snapshot.coverage ~= "exact" and op.snapshot.coverage ~= "supported-subset" then return nil, "invalid", "snapshot coverage is not restorable" end
		local expectedScope = if root == self.game then "place" else "subtree"
		if op.snapshot.scope ~= expectedScope then return nil, "invalid", "snapshot scope does not match its restore root" end
		local protectedCount = if type(op.snapshot.protected) == "table" then #op.snapshot.protected else -1
		if op.snapshot.coverage == "exact" then
			if op.snapshot.complete ~= true or protectedCount ~= 0 then return nil, "invalid", "exact snapshot metadata is inconsistent with its protected coverage" end
		else
			if op.snapshot.complete == true or protectedCount <= 0 then return nil, "invalid", "supported-subset snapshot metadata is inconsistent with its protected coverage" end
		end
		local expectedWholePlaceComplete = root == self.game and op.snapshot.coverage == "exact"
		if op.snapshot.wholePlaceComplete ~= expectedWholePlaceComplete then return nil, "invalid", "snapshot wholePlaceComplete metadata is inconsistent" end
		if op.snapshot.sourceHashAlgorithm ~= "fnv1a32" then return nil, "invalid", "snapshot source hash algorithm is not recognised" end
	if type(op.snapshot.skipped) ~= "table" or next(op.snapshot.skipped) ~= nil then return nil, "invalid", "snapshot omitted unsupported authored content" end
	local rootNode = op.snapshot.node
	local stats = { nodes = 0, instances = 0, scripts = 0, sourceChars = 0 }
	local nodeErr = validateSnapshotNode(rootNode, 0, nil, nil, stats)
	if nodeErr then return nil, "invalid", nodeErr end
	for field, observed in { nodeCount = stats.nodes, instanceCount = stats.instances, scriptCount = stats.scripts, sourceChars = stats.sourceChars } do
		if not integer(op.snapshot[field]) or op.snapshot[field] ~= observed then return nil, "invalid", "snapshot " .. field .. " does not match its payload" end
	end
	local protectedPaths, protectedKind, protectedErr = validateProtectedManifest(self, root, op.snapshot.protected)
	if not protectedPaths then return nil, protectedKind, protectedErr end
	if root == self.game then
		if rootNode.className ~= "DataModel" or rootNode.name ~= "game" then return nil, "invalid", "whole-place restore requires a DataModel snapshot root" end
		for _, serviceNode in rootNode.children do
			local service = serviceFrom(self.game, self.options.services, serviceNode.className)
			if not service then return nil, "conflict", "restore service is unavailable: " .. serviceNode.className end
			local preflightErr = preflightExisting(self, service, serviceNode, protectedPaths)
			if preflightErr then return nil, "conflict", preflightErr end
		end
	else
		if rootNode.className ~= classNameOf(root) or rootNode.name ~= nameOf(root) then return nil, "conflict", "restore root no longer matches the snapshot" end
		local preflightErr = preflightExisting(self, root, rootNode, protectedPaths)
		if preflightErr then return nil, "conflict", preflightErr end
	end
	return {
		root = root,
		canonical = canonical,
		rootNode = rootNode,
		snapshot = op.snapshot,
		checkpointId = checkpointId,
	}
end

local function applyRestore(self: any, plan: any): (any?, string?, string?)
	local state = { created = {}, instancesCreated = 0, scriptsRestored = 0 }
	local root = plan.root
	local rootNode = plan.rootNode
	if root == self.game then
		for _, serviceNode in rootNode.children do
			local service = serviceFrom(self.game, self.options.services, serviceNode.className)
			if not service then return nil, "conflict", "restore service disappeared after preflight: " .. serviceNode.className end
			local restoreErr = restoreExisting(self, service, serviceNode, state)
			if restoreErr then return nil, "internal", restoreErr end
		end
	else
		local restoreErr = restoreExisting(self, root, rootNode, state)
		if restoreErr then return nil, "internal", restoreErr end
	end
	if state.scriptsRestored ~= plan.snapshot.scriptCount then return nil, "internal", "restore script count did not match the checkpoint" end
	return {
		root = plan.canonical,
		checkpointId = plan.checkpointId,
		restored = true,
		complete = plan.snapshot.complete == true,
		wholePlaceComplete = plan.snapshot.wholePlaceComplete == true,
		coverage = plan.snapshot.coverage,
		instancesCreated = state.instancesCreated,
		scriptsRestored = state.scriptsRestored,
		scriptsExpected = plan.snapshot.scriptCount,
		failedInstances = 0,
		failedScripts = 0,
		failedProperties = 0,
	}, nil
end

-- `remedy` IS WHAT THE PERSON CAN DO ABOUT IT, as a code from the vocabulary in
-- packages/shared (`REFUSAL_REMEDIES`), never as a sentence. It exists because on 2026-09-19 the
-- refusal "writes require explicit edit consent" reached the model with no remedy attached, and the
-- model filled the silence: it told the user to change a Studio setting that does not exist and
-- never mentioned the button two inches from the refusal. A refusal that names no remedy is an
-- invitation to invent one. Optional, because most failures are not refusals; omitted reads as
-- "unknown" on the worker side, never as "there is nothing to do".
local function failureResult(id: string, kind: string, message: string, started: number, remedy: string?): any
	return {
		id = id,
		ok = false,
		error = message,
		failure = kind,
		remedy = remedy,
		durationMs = math.max(0, math.floor((nowSeconds() - started) * 1000)),
	}
end

local function errorParts(err: any): (string, string)
	if type(err) == "table" and type(err.kind) == "string" and type(err.message) == "string" then return err.kind, err.message end
	return "internal", tostring(err)
end

local function loadGenerationAdapter(options: any, gameRef: any): (any?, string?)
	if options.generation ~= nil then
		if type(options.generation) ~= "table" or type(options.generation.generate) ~= "function" then
			return nil, "the injected GenerationService adapter is malformed"
		end
		return options.generation
	end
	local loaded, module = pcall(function()
		return require(script.Parent.GenerationService)
	end)
	if not loaded or type(module) ~= "table" or type(module.new) ~= "function" then
		return nil, "the GenerationService adapter is not bundled in this build"
	end
	local created, adapter = pcall(function()
		return module.new({ game = gameRef })
	end)
	if not created or type(adapter) ~= "table" or type(adapter.generate) ~= "function" then
		return nil, "the GenerationService adapter could not be initialised"
	end
	return adapter
end

--[[
	THE RENDERER IS LOADED THE SAME WAY THE GENERATION ADAPTER IS, AND FOR THE SAME REASON.

	`render_view` is the only operation that returns PIXELS, and the worker's whole visual gate —
	`render_view`, `compose_thumbnail`, `inspect_visually` and the automatic critique in SessionDO —
	stands on it. Studio gives a plugin no viewport readback at all (ThumbnailGenerator is not a
	valid service and CaptureService's callback never fires in edit mode, both measured against live
	Studio), so a software rasteriser is the only way those pixels exist.

	What matters here is that a build WITHOUT the module says so. If `Render.luau` is missing from
	the bundle, this returns a named reason, the capability report says `render_view` is
	unsupported, and the worker withholds all three tools and tells the user the rendered appearance
	was not verified. The alternative — a handler that fails at execution time — would let the agent
	spend a step discovering per-call what the pairing could have known once.
]]
local function loadRenderAdapter(options: any): (any?, string?)
	if options.render ~= nil then
		if type(options.render) ~= "table" or type(options.render.capture) ~= "function" then
			return nil, "the injected renderer is malformed"
		end
		return options.render
	end
	local loaded, module = pcall(function()
		return require(script.Parent.Render)
	end)
	if not loaded or type(module) ~= "table" or type(module.capture) ~= "function" then
		return nil, "the bounded software renderer is not bundled in this build"
	end
	return module
end

local function discardGenerated(adapter: any, model: any)
	if model == nil then return end
	if adapter and type(adapter.discard) == "function" then
		local ok, discarded = pcall(function() return adapter:discard(model) end)
		if ok and discarded ~= false then return end
	end
	destroyInstance(model)
end

local function generatedName(parent: any, id: string): (string?, string?)
	local children, err = childrenOf(parent)
	if not children then return nil, err end
	local used = {}
	for _, child in children do
		used[nameOf(child)] = true
	end
	local base = "Apple Generated Model " .. string.sub(hashSource(id), 1, 8)
	if not used[base] then return base end
	for suffix = 2, 100 do
		local candidate = base .. " (" .. tostring(suffix) .. ")"
		if not used[candidate] then return candidate end
	end
	return nil, "the generation destination already contains too many models with this operation name"
end

local function liveGenerationConsent(self: any, allowEdits: boolean, stillCurrent: any, editMode: () -> boolean): boolean
	if self.destroyed or allowEdits ~= true or not editMode() then return false end
	if stillCurrent == nil then return true end
	if type(stillCurrent) ~= "function" then return false end
	local ok, value = pcall(stillCurrent)
	return ok and value == true
end

local function generationFailure(id: string, started: number, result: any): any
	if type(result) ~= "table" then return failureResult(id, "internal", "GenerationService returned an invalid adapter result", started) end
	local allowed = {
		not_found = true,
		conflict = true,
		refused = true,
		invalid = true,
		timeout = true,
		transport = true,
		internal = true,
	}
	local kind = if type(result.failure) == "string" and allowed[result.failure] then result.failure else "internal"
	local message = if type(result.error) == "string" then result.error else "GenerationService did not return a usable result"
	return failureResult(id, kind, message, started)
end

local function runGeneration(
	self: any,
	id: string,
	op: any,
	allowEdits: boolean,
	stillCurrent: any,
	editMode: () -> boolean,
	started: number
): any
	local parent, parentCanonical, parentErr, parentKind, parentRemedy = resolvePath(self.game, self.options.services, op.parent, true)
	if not parent then return failureResult(id, parentKind or "not_found", parentErr or "generation destination was not found", started, parentRemedy) end
	local parentRefusal, parentRefusalRemedy = destinationRefusal(self.game, parent, parentCanonical :: string, "Model")
	if parentRefusal then return failureResult(id, "refused", parentRefusal, started, parentRefusalRemedy) end
	if self.generation == nil then
		return failureResult(
			id,
			"refused",
			"generate_model is unavailable because " .. tostring(self.generationError or "the GenerationService adapter is unavailable") .. "; no substitute was created",
			started
		)
	end
	if self.activeGeneration ~= nil then
		return failureResult(id, "conflict", "another Apple generation is already in progress", started)
	end
	if self.activeRecording ~= nil then
		return failureResult(id, "conflict", "another Apple write is already in progress", started)
	end

	local function current(): boolean
		return liveGenerationConsent(self, allowEdits, stillCurrent, editMode)
	end
	if not current() then
		return failureResult(id, "refused", "generation requires the same live Studio connection and edit consent until placement", started)
	end

	self.activeGeneration = id
	local called, generated = pcall(function()
		return self.generation:generate(op, current)
	end)
	self.activeGeneration = nil
	if not called then return failureResult(id, "internal", "GenerationService adapter failed: " .. tostring(generated), started) end
	if type(generated) ~= "table" or generated.ok ~= true then return generationFailure(id, started, generated) end

	local model = generated.model
	if safeType(model) ~= "Instance" or not isA(model, "Model") then
		discardGenerated(self.generation, model)
		return failureResult(id, "internal", "GenerationService adapter returned no detached Model", started)
	end
	local parentReadable, generatedParent = pcall(function() return model.Parent end)
	if not parentReadable or generatedParent ~= nil then
		discardGenerated(self.generation, model)
		return failureResult(id, "internal", "GenerationService adapter returned a Model whose detached state could not be verified", started)
	end
	if generated.sessionScoped ~= true then
		discardGenerated(self.generation, model)
		return failureResult(id, "invalid", "GenerationService adapter did not mark the result as session-scoped", started)
	end
	if type(generated.qc) ~= "table"
		or generated.qc.kind ~= "structural"
		or generated.qc.verdict ~= "pass"
		or generated.qc.detached ~= true
		or generated.qc.visualJudgementRequired ~= true
	then
		discardGenerated(self.generation, model)
		return failureResult(id, "invalid", "generated Model did not carry an honest passing detached structural QC verdict", started)
	end
	if not current() then
		discardGenerated(self.generation, model)
		return failureResult(id, "refused", "the Studio connection or edit consent ended before placement; generated result was destroyed", started)
	end

	local currentParentPath = fullPath(self.game, parent)
	if currentParentPath ~= parentCanonical or not writableTarget(self.game, parent) then
		discardGenerated(self.generation, model)
		return failureResult(id, "conflict", "the generation destination changed while GenerationService was running", started)
	end
	local refusalAfterGeneration, refusalAfterGenerationRemedy = destinationRefusal(self.game, parent, parentCanonical :: string, "Model")
	if refusalAfterGeneration then
		discardGenerated(self.generation, model)
		return failureResult(id, "refused", refusalAfterGeneration, started, refusalAfterGenerationRemedy)
	end
	local name, nameErr = generatedName(parent, id)
	if not name then
		discardGenerated(self.generation, model)
		return failureResult(id, "conflict", nameErr or "could not choose a generated Model name", started)
	end
	local named, setNameErr = pcall(function() model.Name = name end)
	if not named then
		discardGenerated(self.generation, model)
		return failureResult(id, "internal", "could not name generated Model: " .. tostring(setNameErr), started)
	end

	local recording, beginErr = beginRecording(self.history, self.enum, id, "generate_model")
	if not recording then
		discardGenerated(self.generation, model)
		return failureResult(id, "conflict", beginErr or "could not open an undo recording", started)
	end
	self.activeRecording = recording
	local placed, placementErr = parentInstance(model, parent)
	if not placed or not current() then
		local message = if not placed
			then "could not place generated Model: " .. tostring(placementErr)
			else "the Studio connection or edit consent ended during placement"
		local cancelOk = cancelOperation(self.history, self.enum, recording)
		self.activeRecording = nil
		discardGenerated(self.generation, model)
		if not cancelOk then message ..= " (undo recording cancellation also failed)" end
		return failureResult(id, if placed then "refused" else "internal", message, started)
	end
	local path, pathErr = fullPath(self.game, model)
	if not path then
		local cancelOk = cancelOperation(self.history, self.enum, recording)
		self.activeRecording = nil
		discardGenerated(self.generation, model)
		local message = "could not identify placed generated Model: " .. tostring(pathErr)
		if not cancelOk then message ..= " (undo recording cancellation also failed)" end
		return failureResult(id, "internal", message, started)
	end
	if not current() then
		local cancelOk = cancelOperation(self.history, self.enum, recording)
		self.activeRecording = nil
		discardGenerated(self.generation, model)
		local message = "the Studio connection or edit consent ended before generation commit"
		if not cancelOk then message ..= " (undo recording cancellation also failed)" end
		return failureResult(id, "refused", message, started)
	end
	local committed, commitErr = finishOperation(self.history, self.enum, recording, "generate_model")
	self.activeRecording = nil
	if not committed then
		local cancelOk = cancelOperation(self.history, self.enum, recording)
		discardGenerated(self.generation, model)
		local message = commitErr or "could not commit the generation undo recording"
		if not cancelOk then message ..= " (undo recording cancellation also failed)" end
		return failureResult(id, "internal", message, started)
	end

	local data: any = {
		path = path,
		sessionScoped = true,
		qc = generated.qc,
		predefinedSchema = generated.predefinedSchema,
		maxTriangles = generated.maxTriangles,
		elapsedSeconds = if finite(generated.elapsedSeconds) then math.max(0, generated.elapsedSeconds) else nil,
	}
	if type(generated.generationId) == "string" then data.generationId = string.sub(generated.generationId, 1, 160) end
	return { id = id, ok = true, data = data, durationMs = math.max(0, math.floor((nowSeconds() - started) * 1000)) }
end

--[[
	RENDERING IS A READ. It walks Workspace, projects boxes and returns base64 RGB; it opens no
	undo recording, touches no property and needs no edit consent, which is why it sits with the
	other reads rather than in MUTATING.

	The target is resolved by `resolvePath` — the same allowlisted resolver every other read uses —
	so a render cannot reach anywhere a `get_tree` could not. The renderer itself is handed the
	resolved Instance and the two services it needs; it has no reach of its own.
]]
local RENDER_VIEWS = { hero = true, front = true, side = true, top = true, eye = true, all = true }

local function renderCapture(self: any, op: any, view: string, width: number, height: number): (any?, string?, string?)
	if not self.render then
		return nil, "refused", self.renderError or "the bounded software renderer is unavailable"
	end
	if not RENDER_VIEWS[view] then
		return nil, "invalid", ("view must be one of hero, front, side, top, eye or all, not %s"):format(tostring(view))
	end
	local w, wErr = safeCount(width, 288, 48, 320, "width")
	if not w then return nil, "invalid", wErr end
	local h, hErr = safeCount(height, 180, 32, 240, "height")
	if not h then return nil, "invalid", hErr end

	local scene = serviceFrom(self.game, self.options.services, "Workspace")
	if not scene then return nil, "refused", "Workspace is unavailable" end
	local root: any = scene
	local subject = "game.Workspace"
	if op.target ~= nil then
		local resolved, canonical, err, pathKind = resolvePath(self.game, self.options.services, op.target, false)
		if not resolved then return nil, pathKind or "not_found", err end
		root = resolved
		subject = canonical :: string
	end

	local lighting = serviceFrom(self.game, self.options.services, "Lighting")
	local ok, result = pcall(function()
		return self.render.capture(root, subject, view, w :: number, h :: number, { scene = scene, lighting = lighting })
	end)
	if not ok then return nil, "internal", tostring(result) end
	if type(result) ~= "table" then return nil, "internal", "the renderer returned no result" end
	-- The renderer reports "nothing renderable found under ..." as data rather than raising. That
	-- is a real answer about the place, not a fault, and it is returned as a NAMED failure so the
	-- agent is told the frame is empty instead of being handed a picture of the sky.
	if type(result.error) == "string" then return nil, "not_found", result.error end
	return result, nil
end

local function handleRenderView(self: any, op: any): (any?, string?, string?)
	local view = if op.view == nil then "hero" else op.view
	if type(view) ~= "string" then return nil, "invalid", "view must be a string" end
	return renderCapture(self, op, view, op.width, op.height)
end

local function handleScreenshot(self: any, op: any): (any?, string?, string?)
	-- Kept for compatibility with senders older than the multi-view protocol: one hero frame at the
	-- default size. It is the same code path, not a second one.
	return renderCapture(self, op, "hero", nil, nil)
end

local HANDLERS = {
	ping = function(_, _) return opPing() end,
	render_view = handleRenderView,
	screenshot = handleScreenshot,
	get_tree = handleTree,
	get_instance = handleInstance,
	list_scripts = handleListScripts,
	read_script = handleReadScript,
	dump_scripts = handleDumpScripts,
	search_scripts = handleSearchScripts,
	get_selection = handleSelection,
	get_logs = handleLogs,
	viewport_info = handleViewportInfo,
	select = handleSelect,
	camera_focus = handleCameraFocus,
	create_instances = handleCreate,
	set_props = handleSetProps,
	delete_instances = handleDelete,
	move_instances = handleMove,
	transform_instances = handleTransform,
	clone_instances = handleClone,
	group_instances = handleGroup,
	ungroup_instances = handleUngroup,
	rename_instance = handleRename,
	set_locked = handleSetLocked,
	set_visible = handleSetVisible,
	edit_script = handleEditScript,
	snapshot = handleSnapshot,
	insert_asset = handleInsertAsset,
}

	-- Operations that this independent build cannot implement without widening the Studio capability
	-- surface remain explicit refusals. Restore is handled separately below because all of its
	-- validation and stale-content checks must finish before the ChangeHistory recording starts.
	local UNSUPPORTED = {
		run_code = "run_code is intentionally unavailable in this readable plugin: received text is never loaded, required or executed inside Studio",
	run_mode = "run_mode is not supported by this independent Apple plugin build; start and stop tests in Studio",
	inspect_model = "inspect_model is unavailable in this build because the verified model-quality gate is not present",
}

-- Generation is a mutating operation, but its slow provider call and detached structural QC must
-- complete before ChangeHistory begins.  The execute path below gives it the same consent and
-- serialisation gates as MUTATING while keeping the recording scoped to final placement only.
local DEFERRED_MUTATING = {
	generate_model = true,
}

local MUTATING = {
	create_instances = true,
	insert_asset = true,
	set_props = true,
	delete_instances = true,
	move_instances = true,
	transform_instances = true,
	clone_instances = true,
	group_instances = true,
	ungroup_instances = true,
	rename_instance = true,
	set_locked = true,
	set_visible = true,
	edit_script = true,
	restore = true,
}

-- These change Studio state but not the DataModel, so they need the user's per-connection consent
-- without manufacturing empty entries on the place's undo stack.
local CONSENT_ONLY = {
	select = true,
	camera_focus = true,
}

function Commands.new(options: any?): any
	local opts = options or {}
	local gameRef = opts.game
	if gameRef == nil then
		local ok, value = pcall(function() return game end)
		if ok then gameRef = value end
	end
	local self: any = {
		options = opts,
		game = gameRef,
		destroyed = false,
		activeRecording = nil,
		activeGeneration = nil,
	}
	self.generation, self.generationError = loadGenerationAdapter(opts, gameRef)
	self.render, self.renderError = loadRenderAdapter(opts)
	self.editor = opts.editor or serviceFrom(gameRef, opts.services, "ScriptEditorService")
	self.history = opts.history or serviceFrom(gameRef, opts.services, "ChangeHistoryService")
	self.runService = opts.runService or serviceFrom(gameRef, opts.services, "RunService")
	self.selection = opts.selection or serviceFrom(gameRef, opts.services, "Selection")
	self.logs = opts.logs or serviceFrom(gameRef, opts.services, "LogService")
	self.enum = opts.enum
	if self.enum == nil then
		local ok, value = pcall(function() return Enum end)
		if ok then self.enum = value end
	end

	local function editMode(): boolean
		if type(opts.isEdit) == "function" then
			local ok, value = pcall(opts.isEdit)
			return ok and value == true
		end
		if not self.runService or type(self.runService.IsEdit) ~= "function" then return false end
		local ok, value = pcall(function() return self.runService:IsEdit() end)
		return ok and value == true
	end

	local function runUndoWaypoint(id: string, op: any, started: number): any
		local waypoint, waypointErr = safeName(op.name, "undo_waypoint.name")
		if not waypoint then return failureResult(id, "invalid", waypointErr or "undo_waypoint.name is invalid", started) end
		if not self.history or type(self.history.SetWaypoint) ~= "function" then return failureResult(id, "refused", "ChangeHistoryService.SetWaypoint is unavailable", started) end
		local ok, err = pcall(function() self.history:SetWaypoint(waypoint) end)
		if not ok then return failureResult(id, "internal", tostring(err), started) end
		return { id = id, ok = true, data = { waypoint = waypoint }, durationMs = math.max(0, math.floor((nowSeconds() - started) * 1000)) }
	end

	function self:execute(rawId: any, op: any, allowEdits: boolean, stillCurrent: any?): any
		local started = nowSeconds()
		local id = if type(rawId) == "string" then rawId else tostring(rawId or "")
		if self.destroyed then return failureResult(id, "refused", "command engine is destroyed", started) end
		if type(op) ~= "table" or type(op.op) ~= "string" then return failureResult(id, "invalid", "operation must contain a string op", started) end
		local name = op.op
		if UNSUPPORTED[name] then return failureResult(id, "refused", UNSUPPORTED[name], started, "none") end
		local handler = HANDLERS[name]
		if name == "undo_waypoint" then
			if not editMode() then return failureResult(id, "refused", "writes require Studio edit mode", started, "leave_test_mode") end
			if allowEdits ~= true then return failureResult(id, "refused", "writes require explicit edit consent — this is Apple's own gate, not a Roblox Studio setting: press \"Enable edits…\" then \"Allow edits for this connection\" in the Apple panel in Studio", started, "edit_consent") end
			return runUndoWaypoint(id, op, started)
		end
			if not handler and name ~= "restore" and not DEFERRED_MUTATING[name] then return failureResult(id, "refused", "unknown Studio operation: " .. name, started) end
		-- EDIT MODE IS ASKED ABOUT FIRST, and the order is the whole point rather than a style
		-- preference. Both gates are shut while Studio runs a test, because entering one clears
		-- consent (init.server.luau's keepEditConsentOnlyInEditMode), so whichever gate is checked
		-- first is the sentence the user is handed. Consent-first handed them "press Enable edits…"
		-- — a button that refuses while a test runs, and whose refusal is only visible after they
		-- alt-tab to Studio and click it. Edit-mode-first hands them "stop the test", which works
		-- now; the consent instruction is then correct on the next attempt. The undo_waypoint branch
		-- a dozen lines above has always had this order; this is the same fence, said the same way.
		if MUTATING[name] or DEFERRED_MUTATING[name] or CONSENT_ONLY[name] then
			if not editMode() then return failureResult(id, "refused", "writes require Studio edit mode", started, "leave_test_mode") end
			if allowEdits ~= true then return failureResult(id, "refused", "writes require explicit edit consent — this is Apple's own gate, not a Roblox Studio setting: press \"Enable edits…\" then \"Allow edits for this connection\" in the Apple panel in Studio", started, "edit_consent") end
		end
		if MUTATING[name] or DEFERRED_MUTATING[name] then
			if self.activeRecording ~= nil then return failureResult(id, "conflict", "another Apple write is already in progress", started) end
			if self.activeGeneration ~= nil then return failureResult(id, "conflict", "another Apple generation is already in progress", started) end
		end
			if DEFERRED_MUTATING[name] then
				return runGeneration(self, id, op, allowEdits, stillCurrent, editMode, started)
			end

			local restorePlan = nil
			if name == "restore" then
				-- A restore is tied to a live paired-session consent fence. No recording and no mutation
				-- begins until identity, payload integrity, protected-content freshness and the current
				-- place have all passed prepareRestore.
				if type(stillCurrent) ~= "function" then return failureResult(id, "refused", "restore requires a live Studio consent fence", started) end
				local currentOk, current = pcall(stillCurrent)
				if not currentOk or current ~= true then return failureResult(id, "refused", "the Studio connection or edit consent ended before restore", started) end
				local plan, restoreKind, restoreMessage, restoreRemedy = prepareRestore(self, op)
				if not plan then return failureResult(id, restoreKind or "invalid", restoreMessage or "restore preflight failed", started, restoreRemedy) end
				restorePlan = plan
			end

		-- THE FOURTH VALUE IS THE ONE A HANDLER CAN NO LONGER SAY NOTHING WITH. Handlers used to
		-- return (data, kind, message) and this call bound exactly three, so a refusal raised
		-- INSIDE a handler reached the worker with remedy = nil no matter what the handler knew —
		-- the same shape of loss as Bridge.luau's field allowlist, one layer further in. Luau
		-- yields nil for a value a handler does not return, so every handler that still answers in
		-- three values is unchanged; the ones that know the answer can now give it.
		if not MUTATING[name] then
			local ok, data, kind, message, remedy = pcall(function()
				local result, resultKind, resultMessage, resultRemedy = handler(self, op)
				return result, resultKind, resultMessage, resultRemedy
			end)
			if not ok then
				local failureKind, failureMessage = errorParts(data)
				return failureResult(id, failureKind, failureMessage, started)
			end
			if data == nil then return failureResult(id, kind or "internal", message or "operation failed", started, remedy) end
			if kind then return failureResult(id, kind, message or "operation failed", started, remedy) end
			return { id = id, ok = true, data = data, durationMs = math.max(0, math.floor((nowSeconds() - started) * 1000)) }
		end

		local recording, beginErr = beginRecording(self.history, self.enum, id, name)
		if not recording then return failureResult(id, "conflict", beginErr or "could not open an undo recording", started) end
			self.activeRecording = recording
			local ok, data, kind, message, remedy = pcall(function()
				if name == "restore" then
					local result, resultKind, resultMessage = applyRestore(self, restorePlan)
					if result ~= nil then
						local currentOk, current = pcall(stillCurrent)
						if not currentOk or current ~= true then return nil, "refused", "the Studio connection or edit consent ended during restore" end
					end
					return result, resultKind, resultMessage
				end
				local result, resultKind, resultMessage, resultRemedy = handler(self, op)
			return result, resultKind, resultMessage, resultRemedy
		end)
		if not ok then
			local cancelOk = cancelOperation(self.history, self.enum, recording)
			self.activeRecording = nil
			local failureKind, failureMessage = errorParts(data)
			if not cancelOk then failureMessage ..= " (undo recording cancellation also failed)" end
			return failureResult(id, failureKind, failureMessage, started)
		end
		if data == nil or kind then
			local cancelOk = cancelOperation(self.history, self.enum, recording)
			self.activeRecording = nil
			local failureKind = kind or "internal"
			local failureMessage = message or "operation failed"
			if not cancelOk then failureMessage ..= " (undo recording cancellation also failed)" end
			return failureResult(id, failureKind, failureMessage, started, remedy)
		end
		local committed, commitErr = finishOperation(self.history, self.enum, recording, name)
		self.activeRecording = nil
		if not committed then
			cancelOperation(self.history, self.enum, recording)
			return failureResult(id, "internal", commitErr or "could not commit the undo recording", started)
		end
		return { id = id, ok = true, data = data, durationMs = math.max(0, math.floor((nowSeconds() - started) * 1000)) }
	end

	function self:destroy()
		if self.destroyed then return end
		self.destroyed = true
		if self.generation and type(self.generation.destroy) == "function" then
			pcall(function() self.generation:destroy() end)
		end
		if self.activeRecording ~= nil then
			cancelOperation(self.history, self.enum, self.activeRecording)
			self.activeRecording = nil
		end
	end

	return self
end

-- Capability reporting is derived from the same dispatch tables `execute` consults.  It is an
-- operation contract, not a plugin-version contract: an older/newer version string says nothing
-- about whether one command exists.  Keep this export at the bottom so the implementation tables
-- above remain the single source of truth.
local CAPABILITY_SCHEMA = "golem.studio-ops.v1"

local function capabilityReason(value: any, fallback: string): string
	local text = if type(value) == "string" and #value > 0 then value else fallback
	text = string.gsub(text, "[%c]+", " ")
	text = string.gsub(text, "%s+", " ")
	if #text > 220 then text = string.sub(text, 1, 219) .. "…" end
	return text
end

function Commands.capabilities(engine: any): any
	local byName: { [string]: any } = {}

	for name in HANDLERS do
		byName[name] = { op = name, status = "supported" }
	end
	-- These are executable branches in `execute`, but intentionally live outside HANDLERS because
	-- their recording/preflight semantics are different.
	byName.restore = { op = "restore", status = "supported" }
	byName.undo_waypoint = { op = "undo_waypoint", status = "supported" }

	for name in DEFERRED_MUTATING do
		byName[name] = { op = name, status = "supported" }
	end

	-- Report adapter availability here, not the adapter's momentary native-service probe.  This
	-- report is cached for one pairing; pinning a transient DynamicGeneration outage as unsupported
	-- would keep the tool hidden after Roblox recovered.  `Generation:generate` probes again on every
	-- call and remains the authority for temporary runtime availability.
	if engine == nil or engine.generation == nil then
		byName.generate_model = {
			op = "generate_model",
			status = "unsupported",
			reason = capabilityReason(engine and engine.generationError, "GenerationService is unavailable in this Studio session"),
		}
	end

	-- Same rule as generate_model: report whether the MODULE is bundled, which is fixed for the
	-- life of this build, not whether one render happened to succeed. A build with no renderer
	-- withholds the worker's whole visual gate, and says which operation caused it.
	if engine == nil or engine.render == nil then
		local reason = capabilityReason(engine and engine.renderError, "the bounded software renderer is not bundled in this build")
		byName.render_view = { op = "render_view", status = "unsupported", reason = reason }
		byName.screenshot = { op = "screenshot", status = "unsupported", reason = reason }
	end

	-- `execute` checks UNSUPPORTED before every other dispatch path, so an explicit refusal wins if
	-- a future edit accidentally names the same operation elsewhere.  The report mirrors execution.
	for name, reason in UNSUPPORTED do
		byName[name] = { op = name, status = "unsupported", reason = capabilityReason(reason, "operation is unavailable") }
	end

	local operations = {}
	for _, entry in byName do table.insert(operations, entry) end
	table.sort(operations, function(a, b) return a.op < b.op end)
	return { schema = CAPABILITY_SCHEMA, operations = operations }
end

return Commands
