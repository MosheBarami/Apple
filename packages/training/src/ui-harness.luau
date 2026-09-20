--!nolint
--[[
  A ROBLOX INSTANCE SHIM, SO GENERATED UI CAN BE RUN INSTEAD OF READ.

  WHY THIS EXISTS. packages/evals/tasks/ui-implementation.json scores UI with `contains` and
  `regex`: "does the answer mention AnchorPoint", "does it mention UDim2.fromScale". Both of these
  pass that suite —

      panel.AnchorPoint = Vector2.new(0.5, 0.5)   panel.AnchorPoint = Vector2.new(0, 0)
      panel.Position = UDim2.fromScale(0.5, 0.5)  panel.Position = UDim2.fromScale(0.5, 0.5)

  — and only the left one is centred. A regex cannot tell them apart because the difference is not
  in the vocabulary, it is in the arithmetic. The same blindness covers every check the owner asked
  for: a UIAspectRatioConstraint that is created and never parented, a bar positioned at the bottom
  edge with the default anchor so it renders entirely off-screen, a ScreenGui whose IgnoreGuiInset
  puts an interactive button under the topbar.

  So this file does not read the model's code. It RUNS it, under a stand-in for the Roblox instance
  API, and prints the tree that came out. score-ui.mjs then resolves that tree to rectangles at two
  real viewport sizes and checks the geometry. A model that writes unfamiliar but correct UI passes;
  one that writes the familiar words around wrong arithmetic does not.

  WHAT THIS IS NOT. It is not Roblox. It creates no frames, renders nothing, and knows only the
  subset of the API that building a 2D interface in code needs. Two consequences are stated here
  rather than left to be discovered:

    - A property this shim has no default for reads as `nil`. If the model's code then indexes it,
      the chunk errors, and that error is MY gap, not the model's mistake. Every runtime error is
      therefore reported verbatim by the scorer under `runtime_error`, with its message, so a
      failure of the harness cannot be counted as a failure of the model without somebody reading
      the sentence. That is the observation-failure rule this repository keeps.
    - A steady-state loop (`while true do task.wait() end`) never returns. After LOOP_BUDGET waits
      the shim raises the marker below, the top level catches it, and the tree is serialised
      anyway — the script reached its update loop, which is a finished build, not a fault.
]]

local LOOP_MARKER = "__APPLE_LOOP_GUARD__"
local LOOP_BUDGET = 64
local waits = 0
-- What the build asked the RENDERER for. Nothing in this process has any of it: absolute geometry
-- and screen insets are decided after a frame, and a viewport size is a property of a device. A
-- build that reads any of them is building a layout this harness cannot resolve, so the reads are
-- counted and named and the scorer skips the geometry rather than answering with an invention.
local absoluteReads = 0
local rendererReads = {}
local function rendererRead(what)
	absoluteReads += 1
	rendererReads[what] = (rendererReads[what] or 0) + 1
end

local nodes = {}
local nextId = 0

-- Every property this shim can answer without guessing, with the engine's own default. A read that
-- is not in here comes back nil and shows up as a runtime error the scorer prints; that is on
-- purpose, because inventing a value would make the geometry below describe the shim.
local DEFAULTS = {
	Visible = true,
	Active = false,
	Selectable = false,
	ClipsDescendants = false,
	BackgroundTransparency = 0,
	BorderSizePixel = 0,
	ZIndex = 1,
	LayoutOrder = 0,
	Rotation = 0,
	AutomaticSize = "Enum.AutomaticSize.None",
	Text = "",
	TextScaled = false,
	TextWrapped = false,
	TextTransparency = 0,
	ImageTransparency = 0,
	Image = "",
	Enabled = true,
	ResetOnSpawn = true,
	IgnoreGuiInset = false,
	DisplayOrder = 0,
	AutoButtonColor = true,
	CanvasSize = "UDim2:0,0,0,0",
	ScrollBarThickness = 12,
	Archivable = true,
	Transparency = 0,
	AspectRatio = 1,
	Padding = "UDim:0,0",
	CellPadding = "UDim2:0,0,0,0",
	CellSize = "UDim2:0,100,0,100",
	CornerRadius = "UDim:0,8",
	Thickness = 1,
}

local EVENTS = {
	Activated = true, MouseButton1Click = true, MouseButton1Down = true, MouseButton1Up = true,
	MouseButton2Click = true, MouseEnter = true, MouseLeave = true, MouseMoved = true,
	InputBegan = true, InputChanged = true, InputEnded = true, TouchTap = true,
	Changed = true, ChildAdded = true, ChildRemoved = true, AncestryChanged = true,
	Destroying = true, Completed = true, Heartbeat = true, RenderStepped = true, Stepped = true,
	PlayerAdded = true, CharacterAdded = true, Touched = true, Triggered = true,
	SelectionChanged = true, FocusLost = true, FocusGained = true, PropertyChangedSignal = true,
}

local function newSignal()
	local s = {}
	s.Connect = function(_, fn) return { Disconnect = function() end, Connected = true, fn = fn } end
	s.ConnectParallel = s.Connect
	s.Once = s.Connect
	s.Wait = function()
		waits += 1
		if waits > LOOP_BUDGET then error(LOOP_MARKER, 0) end
		return 0
	end
	return setmetatable(s, { __index = function() return function() end end })
end

-- ---------------------------------------------------------------- datatypes

local function udim(s, o) return setmetatable({ __k = "UDim", Scale = s or 0, Offset = o or 0 }, { __tostring = function() return "UDim" end }) end

local UDim2mt
local function udim2(xs, xo, ys, yo)
	return setmetatable({ __k = "UDim2", X = udim(xs, xo), Y = udim(ys, yo), Width = udim(xs, xo), Height = udim(ys, yo) }, UDim2mt)
end
UDim2mt = {
	__tostring = function() return "UDim2" end,
	__add = function(a, b) return udim2(a.X.Scale + b.X.Scale, a.X.Offset + b.X.Offset, a.Y.Scale + b.Y.Scale, a.Y.Offset + b.Y.Offset) end,
	__sub = function(a, b) return udim2(a.X.Scale - b.X.Scale, a.X.Offset - b.X.Offset, a.Y.Scale - b.Y.Scale, a.Y.Offset - b.Y.Offset) end,
}

local function vec2(x, y) return setmetatable({ __k = "Vector2", X = x or 0, Y = y or 0, Magnitude = math.sqrt((x or 0) ^ 2 + (y or 0) ^ 2) }, { __tostring = function() return "Vector2" end }) end
local function color3(r, g, b) return setmetatable({ __k = "Color3", R = r or 0, G = g or 0, B = b or 0 }, { __tostring = function() return "Color3" end }) end

local function opaque(name)
	return setmetatable({ __k = "opaque", __name = name }, {
		__index = function(_, k) if EVENTS[k] then return newSignal() end return function() end end,
		__tostring = function() return name end,
		__call = function() return nil end,
	})
end

UDim = { new = udim }
UDim2 = {
	new = udim2,
	fromScale = function(x, y) return udim2(x, 0, y, 0) end,
	fromOffset = function(x, y) return udim2(0, x, 0, y) end,
}
Vector2 = { new = vec2, zero = vec2(0, 0), one = vec2(1, 1) }

-- VECTOR3 ARITHMETIC, BECAUSE WITHOUT IT THE SHIM BLAMES THE MODEL FOR THE SHIM'S GAP.
--
-- Vector3 used to be a bare table with an EMPTY metatable, so `pos + Vector3.new(0, 0.5, 0)` —
-- which is how every Roblox map script in existence offsets a part from an anchor — threw
-- "attempt to perform arithmetic". Measured on the first generated tycoon map (2026-09-20): the
-- model's Luau was correct and idiomatic, and the run was recorded as `runtime_error`.
--
-- score-ui.mjs already names this exact hazard: "a throw can mean the model used an API this shim
-- does not implement — which is my gap, not the model's mistake, and must not be counted as one".
-- This is that gap, closed. Every operation below is the engine's own definition; `Magnitude` and
-- `Unit` are included because a map script uses them to space things evenly along a direction.
local vec3
vec3 = function(x, y, z)
	local self = { __k = "Vector3", X = x or 0, Y = y or 0, Z = z or 0 }
	return setmetatable(self, {
		__index = function(t, k)
			if k == "Magnitude" then return math.sqrt(t.X ^ 2 + t.Y ^ 2 + t.Z ^ 2) end
			if k == "Unit" then
				local m = math.sqrt(t.X ^ 2 + t.Y ^ 2 + t.Z ^ 2)
				if m == 0 then return vec3(0, 0, 0) end
				return vec3(t.X / m, t.Y / m, t.Z / m)
			end
			return nil
		end,
		__add = function(a, b) return vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end,
		__sub = function(a, b) return vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end,
		__unm = function(a) return vec3(-a.X, -a.Y, -a.Z) end,
		-- Roblox multiplies componentwise by another Vector3 and uniformly by a number, and the
		-- number can be on either side.
		__mul = function(a, b)
			if type(a) == "number" then return vec3(a * b.X, a * b.Y, a * b.Z) end
			if type(b) == "number" then return vec3(a.X * b, a.Y * b, a.Z * b) end
			return vec3(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
		end,
		__div = function(a, b)
			if type(b) == "number" then return vec3(a.X / b, a.Y / b, a.Z / b) end
			return vec3(a.X / b.X, a.Y / b.Y, a.Z / b.Z)
		end,
		__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end,
		__tostring = function(t) return string.format("%g, %g, %g", t.X, t.Y, t.Z) end,
	})
end
Vector3 = { new = vec3, zero = vec3(0, 0, 0), one = vec3(1, 1, 1), xAxis = vec3(1, 0, 0), yAxis = vec3(0, 1, 0), zAxis = vec3(0, 0, 1) }
Color3 = {
	new = color3,
	fromRGB = function(r, g, b) return color3((r or 0) / 255, (g or 0) / 255, (b or 0) / 255) end,
	fromHSV = function(h, s, v) return color3(h, s, v) end,
	fromHex = function() return color3(0, 0, 0) end,
}
Rect = { new = function() return opaque("Rect") end }
Font = setmetatable({ new = function() return opaque("Font") end, fromEnum = function() return opaque("Font") end, fromName = function() return opaque("Font") end }, { __index = function() return opaque("Font") end })
ColorSequence = { new = function() return opaque("ColorSequence") end }
ColorSequenceKeypoint = { new = function() return opaque("ColorSequenceKeypoint") end }
NumberSequence = { new = function() return opaque("NumberSequence") end }
NumberSequenceKeypoint = { new = function() return opaque("NumberSequenceKeypoint") end }
NumberRange = { new = function() return opaque("NumberRange") end }
TweenInfo = { new = function() return opaque("TweenInfo") end }
CFrame = setmetatable({ new = function() return opaque("CFrame") end }, { __index = function() return function() return opaque("CFrame") end end })
BrickColor = { new = function() return opaque("BrickColor") end }

-- Enum: any Enum.X.Y resolves, and remembers both halves so the scorer can read the choice back.
local enumItemCache = {}
local function enumItem(enumName, itemName)
	local key = enumName .. "." .. itemName
	if not enumItemCache[key] then
		enumItemCache[key] = setmetatable({ __k = "EnumItem", EnumType = enumName, Name = itemName, Value = 0 }, {
			__tostring = function() return "Enum." .. key end,
		})
	end
	return enumItemCache[key]
end
Enum = setmetatable({}, {
	__index = function(_, enumName)
		return setmetatable({}, {
			__index = function(_, itemName) return enumItem(enumName, itemName) end,
			__call = function() return {} end,
		})
	end,
})

-- ---------------------------------------------------------------- instances

local function nodeOf(proxy)
	if type(proxy) ~= "table" then return nil end
	local mt = getmetatable(proxy)
	return mt and mt.__node or nil
end

local newInstance

local function childNamed(d, name)
	for _, c in ipairs(d.children) do
		if (c.props.Name or c.class) == name then return c.proxy end
	end
	return nil
end

local function descendants(d, out)
	for _, c in ipairs(d.children) do
		out[#out + 1] = c.proxy
		descendants(c, out)
	end
	return out
end

local function setParent(d, parentProxy)
	local p = nodeOf(parentProxy)
	if d.parent then
		for i, c in ipairs(d.parent.children) do
			if c == d then table.remove(d.parent.children, i) break end
		end
	end
	d.parent = p
	if p then p.children[#p.children + 1] = d end
end

local METHODS = {
	FindFirstChild = function(d, name) return childNamed(d, name) end,
	FindFirstChildWhichIsA = function(d, cls)
		for _, c in ipairs(d.children) do if c.class == cls then return c.proxy end end
		return nil
	end,
	FindFirstChildOfClass = function(d, cls)
		for _, c in ipairs(d.children) do if c.class == cls then return c.proxy end end
		return nil
	end,
	FindFirstAncestorOfClass = function(d, cls)
		local p = d.parent
		while p do if p.class == cls then return p.proxy end p = p.parent end
		return nil
	end,
	WaitForChild = function(d, name)
		local c = childNamed(d, name)
		if c then return c end
		-- A WaitForChild for something that was never created would block forever in Roblox too.
		-- Making one on demand keeps the build going instead of turning the model's ordering choice
		-- into a harness hang; the created node is recorded like any other and the scorer can see it.
		return newInstance("Folder", d.proxy, name)
	end,
	GetChildren = function(d)
		local out = {}
		for i, c in ipairs(d.children) do out[i] = c.proxy end
		return out
	end,
	GetDescendants = function(d) return descendants(d, {}) end,
	IsA = function(d, cls)
		if d.class == cls then return true end
		local GUI = { Frame = true, TextLabel = true, TextButton = true, TextBox = true, ImageLabel = true, ImageButton = true, ScrollingFrame = true, ViewportFrame = true, CanvasGroup = true, VideoFrame = true }
		if cls == "GuiObject" or cls == "GuiBase2d" then return GUI[d.class] == true end
		if cls == "LayerCollector" then return d.class == "ScreenGui" or d.class == "SurfaceGui" or d.class == "BillboardGui" end
		if cls == "UIComponent" or cls == "UIBase" then return d.class:sub(1, 2) == "UI" end
		if cls == "Instance" then return true end
		return false
	end,
	Destroy = function(d) setParent(d, nil) d.destroyed = true end,
	Remove = function(d) setParent(d, nil) d.destroyed = true end,
	ClearAllChildren = function(d) for i = #d.children, 1, -1 do setParent(d.children[i], nil) end end,
	--[[ CLONE IS A DEEP COPY IN THE ENGINE, AND A SHALLOW ONE HERE BLAMED THE MODEL.

	     MEASURED, 2026-09-20, on a generated tycoon leaderboard. The model built one board Part
	     with a SurfaceGui named "LeaderboardSurface" inside it, then wrote the ordinary Roblox
	     idiom for a second board:

	         local boardPart2 = boardPart:Clone()
	         local dailyGui = boardPart2:FindFirstChild("LeaderboardSurface")
	         dailyGui.TitleBar.Title.Text = "TODAY'S TOP DROPPER EARNERS"

	     `Instance:Clone()` copies the instance AND all of its descendants — that is the whole
	     reason anybody calls it. This shim copied the properties and dropped every child, so
	     FindFirstChild returned nil, the next line threw "attempt to index nil with 'TitleBar'",
	     and correct Luau was recorded as the model's runtime error.

	     Attributes are copied too, for the same reason. Parent deliberately is NOT: a fresh clone
	     is unparented in the engine, and `props` never holds Parent anyway because __newindex
	     routes it to setParent. ]]
	Clone = function(d)
		local function cloneInto(src, parentProxy)
			local proxy = newInstance(src.class, parentProxy, src.props.Name)
			local cd = nodeOf(proxy)
			for k, v in pairs(src.props) do cd.props[k] = v end
			for k, v in pairs(src.attrs) do cd.attrs[k] = v end
			for _, child in ipairs(src.children) do cloneInto(child, proxy) end
			return proxy
		end
		return cloneInto(d, nil)
	end,
	SetAttribute = function(d, k, v) d.attrs[k] = v end,
	GetAttribute = function(d, k) return d.attrs[k] end,
	GetPropertyChangedSignal = function() return newSignal() end,
	GetAttributeChangedSignal = function() return newSignal() end,
	-- Deprecated tween methods still answer, so a model that reaches for them BUILDS and is then
	-- reported by the deprecation check rather than dying here for the wrong reason.
	TweenPosition = function() return true end,
	TweenSize = function() return true end,
	TweenSizeAndPosition = function() return true end,
	GetTextBoundsAsync = function() rendererRead("GetTextBoundsAsync") return vec2(0, 0) end,
	GetTextSize = function() rendererRead("GetTextSize") return vec2(0, 0) end,
	-- GuiService:GetGuiInset() returns the topbar/device inset in PIXELS, which is exactly the
	-- renderer-decided geometry this harness has none of. A real answer called it and died on
	-- "attempt to call missing method", which would have been recorded as the model's mistake.
	GetGuiInset = function() rendererRead("GetGuiInset") return vec2(0, 0), vec2(0, 0) end,
	GetFullName = function(d)
		local parts = { d.props.Name or d.class }
		local p = d.parent
		while p do table.insert(parts, 1, p.props.Name or p.class) p = p.parent end
		return table.concat(parts, ".")
	end,
	IsStudio = function() return false end,
	IsClient = function() return true end,
	IsServer = function() return false end,
	IsRunning = function() return true end,
	IsEdit = function() return false end,
	GetMouse = function() return opaque("Mouse") end,
	BindAction = function() end,
	UnbindAction = function() end,
	PreloadAsync = function() end,
	ApplyLayout = function() end,
	AddTag = function() end,
	HasTag = function() return false end,
	GetService = function(d, name) return childNamed(d, name) or newInstance(name, d.proxy, name) end,
}

--[[ A SERVICE'S OWN METHODS MUST NOT LIVE IN THE SHARED INSTANCE TABLE.

     `Create`, `Play` and `Cancel` were in METHODS above, where every instance answers them. So
     `panel["Play"]` — the ordinary way to reach a menu button named Play — returned the Play
     METHOD instead of the child, and `panel.Play.Activated` died with "attempt to index function".
     A button called Play is the commonest element in Roblox UI, and the failure was recorded
     against the model. Service methods are keyed on the service's class now, so nothing an
     ordinary Frame is asked for can be shadowed by a name that happens to be an English verb. ]]
local CLASS_METHODS = {
	TweenService = {
		Create = function() return opaque("Tween") end,
		GetValue = function() return 0 end,
	},
	--[[ MEASURED, 2026-09-20, on a generated tycoon HUD. Its second statement was

	         StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)

	     which is the correct and standard way to hide Roblox's own health bar before drawing your
	     own — the model even said so in a comment. The call landed on no method and the build died
	     with "attempt to call missing method" before a single Frame existed, so an entire HUD was
	     recorded as a model failure at line 8.

	     These four are safe to answer because NONE of them can touch the instance tree, which is
	     what this harness measures. SetCore/SetCoreGuiEnabled toggle engine chrome; the getters are
	     given the engine's default of enabled. They are listed by name rather than made into a
	     catch-all no-op, because a catch-all would swallow the next real gap silently — the failure
	     mode this whole file is careful about. ]]
	StarterGui = {
		SetCoreGuiEnabled = function() end,
		GetCoreGuiEnabled = function() return true end,
		SetCore = function() end,
		GetCore = function() return nil end,
	},
}

function newInstance(class, parentProxy, name)
	nextId += 1
	local d = { id = nextId, class = class, props = { Name = name or class }, children = {}, parent = nil, attrs = {} }
	local mt = {}
	mt.__node = d
	mt.__tostring = function() return d.props.Name or class end
	mt.__index = function(_, k)
		if k == "Parent" then return d.parent and d.parent.proxy or nil end
		if k == "ClassName" then return class end
		if k == "Name" then return d.props.Name or class end
		local byClass = CLASS_METHODS[class]
		if byClass and byClass[k] then return function(_, ...) return byClass[k](d, ...) end end
		if METHODS[k] then return function(_, ...) return METHODS[k](d, ...) end end
		if EVENTS[k] then return newSignal() end
		if d.props[k] ~= nil then return d.props[k] end
		local child = childNamed(d, k)
		if child then return child end
		local def = DEFAULTS[k]
		if type(def) == "string" and def:sub(1, 5) == "Enum." then
			local a, b = def:match("^Enum%.(%w+)%.(%w+)$")
			return enumItem(a, b)
		end
		if def == "UDim2:0,0,0,0" then return udim2(0, 0, 0, 0) end
		if def == "UDim:0,0" then return udim(0, 0) end
		if def == "UDim:0,8" then return udim(0, 8) end
		if def ~= nil then return def end
		if k == "Size" or k == "Position" then return udim2(0, 0, 0, 0) end
		if k == "AnchorPoint" then return vec2(0, 0) end
		--[[ READING AbsoluteSize MEANS THIS BUILD'S LAYOUT CANNOT BE MEASURED HERE, AND THAT MUST
		     BE SAID RATHER THAN ANSWERED WITH A NUMBER.

		     Absolute geometry is decided by the renderer AFTER a frame; nothing in this process has
		     it, and the scorer computes it afterwards in JavaScript. A script that sizes its grid
		     cells from `scroll.AbsoluteSize.X` is doing something legitimate that this harness
		     cannot reproduce. Returning a plausible number would make every rectangle downstream a
		     measurement of my invention, so the read is RECORDED and the scorer skips the geometry
		     checks for that build with the reason attached. Zero is returned only so the script
		     keeps running to completion and its structure can still be inspected. ]]
		if k == "AbsoluteSize" or k == "AbsolutePosition" then
			rendererRead(k)
			return vec2(0, 0)
		end
		-- A device's screen size is not a fact this process has either, and the scorer resolves the
		-- tree at three viewports of its own. Handing out 1920x1080 would let a build hardcode
		-- around a number I chose and score as responsive.
		if k == "ViewportSize" then
			rendererRead("ViewportSize")
			return vec2(0, 0)
		end
		if k == "BackgroundColor3" or k == "TextColor3" or k == "ImageColor3" or k == "Color" then return color3(1, 1, 1) end
		return nil
	end
	mt.__newindex = function(_, k, v)
		if k == "Parent" then setParent(d, v) return end
		d.props[k] = v
	end
	d.proxy = setmetatable({}, mt)
	nodes[#nodes + 1] = d
	if parentProxy ~= nil then setParent(d, parentProxy) end
	return d.proxy
end

Instance = {
	new = function(class, parent) return newInstance(class, parent) end,
	fromExisting = function(inst) return METHODS.Clone(nodeOf(inst)) end,
}

-- ---------------------------------------------------------------- the world

local dataModel = newInstance("DataModel", nil, "game")
game = dataModel
local Players = newInstance("Players", dataModel, "Players")
local localPlayer = newInstance("Player", Players, "LocalPlayer")
newInstance("PlayerGui", localPlayer, "PlayerGui")
newInstance("PlayerScripts", localPlayer, "PlayerScripts")
nodeOf(Players).props.LocalPlayer = localPlayer

--[[ THE LOCAL PLAYER'S IDENTITY, AND WHY THESE THREE ARE SAFE TO ANSWER.

     MEASURED, 2026-09-20, on a generated tycoon leaderboard. Its data table ended with the row
     `{ name = player.DisplayName, userId = player.UserId, value = 412600 }` — the standard way to
     put "you" in a leaderboard — and every row built a headshot URL with
     `"rbxthumb://type=AvatarHeadShot&id=" .. entry.userId`. `UserId` was nil, the concatenation
     threw, and a 240-line leaderboard counted as the model's runtime error.

     The DEFAULTS table above deliberately answers nil for an unknown property, because inventing a
     value would make the measured geometry describe the shim. These three are the exception and the
     reason is that NONE of them is a geometry input: an id and a name change no rectangle. The
     instance already carries a shim-chosen Name ("LocalPlayer"), so the precedent is set.

     BE AWARE WHEN READING A RENDER: a screen that prints "Player1" got that string from HERE, not
     from the model. The value is deliberately the obvious placeholder Roblox itself uses rather
     than something that could be mistaken for content the model wrote. ]]
nodeOf(localPlayer).props.UserId = 1
nodeOf(localPlayer).props.DisplayName = "Player1"
nodeOf(localPlayer).props.CharacterAppearanceId = 1
for _, svc in ipairs({ "ReplicatedStorage", "StarterGui", "StarterPlayer", "Lighting", "TweenService", "RunService", "UserInputService", "TextService", "GuiService", "ContextActionService", "SoundService", "ServerStorage", "CollectionService", "HttpService", "Debris", "MarketplaceService", "ContentProvider" }) do
	newInstance(svc, dataModel, svc)
end
local ws = newInstance("Workspace", dataModel, "Workspace")
workspace = ws
newInstance("Camera", ws, "CurrentCamera")
nodeOf(ws).props.CurrentCamera = childNamed(nodeOf(ws), "CurrentCamera")
local guiService = childNamed(nodeOf(dataModel), "GuiService")
nodeOf(guiService).props.TopbarInset = opaque("Rect")

local starterPlayerScripts = newInstance("StarterPlayerScripts", childNamed(nodeOf(dataModel), "StarterPlayer"), "StarterPlayerScripts")
script = newInstance("LocalScript", starterPlayerScripts, "UIScript")

task = {
	wait = function()
		waits += 1
		if waits > LOOP_BUDGET then error(LOOP_MARKER, 0) end
		return 0
	end,
	spawn = function(fn, ...) if type(fn) == "function" then fn(...) end end,
	defer = function() end,
	delay = function() end,
	cancel = function() end,
	synchronize = function() end,
	desynchronize = function() end,
}
-- Deprecated globals are PRESENT and working. Removing them would make a model that uses `wait()`
-- fail as "does not run", which reports the wrong defect; the deprecation check names it instead.
wait = task.wait
spawn = task.spawn
delay = function() end
tick = function() return 0 end
time = function() return 0 end
typeof = function(v)
	if type(v) == "table" then
		local k = rawget(v, "__k")
		if k then return k end
		if nodeOf(v) then return "Instance" end
	end
	return type(v)
end
-- `_G` and `shared` are Roblox's cross-script tables and ordinary Luau writes them. The standalone
-- interpreter hands out a FROZEN `_G`, so `_G.Something = ...` threw "attempt to modify a readonly
-- table" and a build that was fine was reported as a runtime error. Rebinding both to plain tables
-- in this thread's own globals makes them writable, which is what Roblox does.
_G = {}
shared = {}

local realPrint = print
print = function() end
warn = function() end
require = function() error("this harness runs ONE self-contained script: require() is not available", 0) end

-- ---------------------------------------------------------------- serialise

local buf = {}
local function put(s) buf[#buf + 1] = s end
local function q(s)
	s = tostring(s):gsub('[%c"\\]', function(c)
		if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n" elseif c == "\r" then return "\\r" elseif c == "\t" then return "\\t" end
		return string.format("\\u%04x", string.byte(c))
	end)
	return '"' .. s .. '"'
end
local function num(n)
	if n ~= n or n == math.huge or n == -math.huge then return "null" end
	return string.format("%.6g", n)
end

local function value(v)
	local t = type(v)
	if t == "number" then return '{"k":"num","v":' .. num(v) .. "}" end
	if t == "string" then return '{"k":"str","v":' .. q(v) .. "}" end
	if t == "boolean" then return '{"k":"bool","v":' .. tostring(v) .. "}" end
	if t == "table" then
		local k = rawget(v, "__k")
		if k == "UDim2" then return '{"k":"UDim2","xs":' .. num(v.X.Scale) .. ',"xo":' .. num(v.X.Offset) .. ',"ys":' .. num(v.Y.Scale) .. ',"yo":' .. num(v.Y.Offset) .. "}" end
		if k == "UDim" then return '{"k":"UDim","s":' .. num(v.Scale) .. ',"o":' .. num(v.Offset) .. "}" end
		if k == "Vector2" then return '{"k":"Vector2","x":' .. num(v.X) .. ',"y":' .. num(v.Y) .. "}" end
		-- Vector3 was already CONSTRUCTIBLE here (see the Vector3 table above) but fell through to
		-- {"k":"other","s":"Vector3"}, which threw away X/Y/Z. Nothing in the UI scorer reads a
		-- Vector3 — AnchorPoint is a Vector2 — so emitting it is additive for every existing caller,
		-- and it is what lets a MAP build (Part.Size, Part.Position) be measured rather than guessed.
		if k == "Vector3" then return '{"k":"Vector3","x":' .. num(v.X) .. ',"y":' .. num(v.Y) .. ',"z":' .. num(v.Z) .. "}" end
		if k == "Color3" then return '{"k":"Color3","r":' .. num(v.R) .. ',"g":' .. num(v.G) .. ',"b":' .. num(v.B) .. "}" end
		if k == "EnumItem" then return '{"k":"Enum","e":' .. q(v.EnumType) .. ',"n":' .. q(v.Name) .. "}" end
		local nd = nodeOf(v)
		if nd then return '{"k":"Ref","id":' .. nd.id .. "}" end
		return '{"k":"other","s":' .. q(k or "table") .. "}"
	end
	return '{"k":"other","s":' .. q(t) .. "}"
end

local function emit(status, detail)
	local kinds = {}
	for k, v in pairs(rendererReads) do kinds[#kinds + 1] = q(k) .. ":" .. v end
	put('{"status":' .. q(status) .. ',"detail":' .. q(detail or "") .. ',"absoluteReads":' .. absoluteReads
		.. ',"rendererReads":{' .. table.concat(kinds, ",") .. '},"nodes":[')
	local first = true
	for _, d in ipairs(nodes) do
		if not first then put(",") end
		first = false
		put('{"id":' .. d.id .. ',"class":' .. q(d.class) .. ',"parent":' .. (d.parent and d.parent.id or "null") .. ',"destroyed":' .. tostring(d.destroyed == true) .. ',"props":{')
		local pf = true
		for k, v in pairs(d.props) do
			if not pf then put(",") end
			pf = false
			put(q(k) .. ":" .. value(v))
		end
		put("}}")
	end
	put("]}")
	realPrint("__APPLE_UI_TREE__")
	realPrint(table.concat(buf))
end

return { emit = emit, LOOP_MARKER = LOOP_MARKER }
