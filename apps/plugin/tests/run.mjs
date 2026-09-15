#!/usr/bin/env node
// Run the Studio plugin's Luau specs.
//
// WHY THIS FILE EXISTS. `apps/plugin` carried no `package.json`, so `pnpm -r test`
// — the canonical verification command, and the one CI runs — skipped it entirely.
// Ops.luau (the single entry point for every mutation the agent performs, and the
// owner of the asset-policy window) and Render.luau were covered by nothing.
//
// The mechanism is deliberately identical to apps/benchmark/crystal-canyon/tests/run.mjs:
// the standalone Luau CLI is sandboxed and exposes no `io`, so it cannot read the
// modules under test. Node reads them and hands `luau` one complete chunk:
//
//     prelude (stubs `game`, `Instance`, the datatypes, and shadows `require`)
//       .. each module's source, VERBATIM, wrapped in `local M = (function() … end)()`
//       .. the spec
//
// The module source is never edited. `local require` in the prelude shadows the global
// for everything after it in the same chunk, so a module's own
// `require(script.Parent.Paths)` resolves against the stub with no change to the file.
// What runs is what ships.
//
// Skips with a clear message when `luau` is absent, so a contributor without the
// toolchain is told rather than shown a green run that tested nothing.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync, execFileSync as run } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

function haveLuau() {
  try {
    execFileSync('luau', ['--help'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function luauMissing() { return !haveLuau(); }

// The stubbed Roblox surface.
//
// DELIBERATELY MINIMAL, AND HONEST ABOUT IT. These stubs exist so the plugin's
// modules can be LOADED and CALLED outside Studio. They are not a reimplementation
// of Roblox. Where a stub cannot model real engine behaviour it omits the method
// entirely, so a spec that depends on it fails loudly rather than passing against a
// convenient fake. In particular: nothing here renders, nothing yields, and
// ChangeHistoryService records what it was asked to do rather than providing undo.
const PRELUDE = `
--!nocheck

-- ---------------------------------------------------------------- datatypes --
-- Value types the modules construct while decoding a property. Each keeps its
-- components readable so a spec can assert on what a decode produced, and carries
-- a __type tag so the stub tree can tell them apart.
local __vec3
local __vec3MT
__vec3MT = {
	__index = function(v, k)
		-- Magnitude is a property in Roblox, not a method, and Render.viewpoints
		-- reads it to size the framing distance.
		if k == "Magnitude" then
			return math.sqrt(rawget(v, "X") ^ 2 + rawget(v, "Y") ^ 2 + rawget(v, "Z") ^ 2)
		end
		if k == "Dot" then
			return function(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end
		end
		if k == "Cross" then
			return function(a, b)
				return __vec3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X)
			end
		end
		if k == "Unit" then
			local m = v.Magnitude
			if m == 0 then return __vec3(0, 0, 0) end
			return __vec3(v.X / m, v.Y / m, v.Z / m)
		end
		return nil
	end,
	__add = function(a, b) return __vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end,
	__sub = function(a, b) return __vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end,
	__unm = function(a) return __vec3(-a.X, -a.Y, -a.Z) end,
	__mul = function(a, b)
		if type(b) == "number" then return __vec3(a.X * b, a.Y * b, a.Z * b) end
		if type(a) == "number" then return __vec3(b.X * a, b.Y * a, b.Z * a) end
		return __vec3(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
	end,
	__div = function(a, b)
		if type(b) == "number" then return __vec3(a.X / b, a.Y / b, a.Z / b) end
		return __vec3(a.X / b.X, a.Y / b.Y, a.Z / b.Z)
	end,
	__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end,
	__tostring = function(v) return ("%g, %g, %g"):format(v.X, v.Y, v.Z) end,
}
__vec3 = function(x, y, z)
	return setmetatable({ __type = "Vector3", X = x or 0, Y = y or 0, Z = z or 0 }, __vec3MT)
end
Vector3 = { new = __vec3, zero = __vec3(0, 0, 0) }
Vector2 = { new = function(x, y) return { __type = "Vector2", X = x or 0, Y = y or 0 } end }
NumberRange = { new = function(a, b) return { __type = "NumberRange", Min = a, Max = b or a } end }
Rect = { new = function(a, b, c, d) return { __type = "Rect", Min = __vec3(a, b, 0), Max = __vec3(c, d, 0) } end }
Color3 = {
	new = function(r, g, b) return { __type = "Color3", R = r or 0, G = g or 0, B = b or 0 } end,
	fromRGB = function(r, g, b) return { __type = "Color3", R = (r or 0) / 255, G = (g or 0) / 255, B = (b or 0) / 255 } end,
}
UDim = { new = function(s, o) return { __type = "UDim", Scale = s or 0, Offset = o or 0 } end }
UDim2 = { new = function(xs, xo, ys, yo) return { __type = "UDim2", X = UDim.new(xs, xo), Y = UDim.new(ys, yo) } end }
BrickColor = { new = function(v) return { __type = "BrickColor", Name = tostring(v) } end }

--[[ CFrame, with a REAL rotation basis.

	 This was translation-only, and PointToWorldSpace raised on anything rotated — an
	 honest limit at the time, and the thing that made Render.renderView untestable:
	 the rasteriser transforms every corner of every part into camera space, so without
	 rotation there is nothing to test it against.

	 Stored the way Roblox stores it: a position and three column vectors. The columns
	 are RightVector, UpVector and BACK, where back = -LookVector — that sign is the
	 one thing worth getting right, because a camera that looks down +Z renders the
	 world behind it and every assertion still passes. ]]
local __cframe
local __cframeMT
local function __sub(a, b) return __vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
local function __dot(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end
local function __norm(v)
	local m = math.sqrt(__dot(v, v))
	if m == 0 then return __vec3(0, 0, 0) end
	return __vec3(v.X / m, v.Y / m, v.Z / m)
end
local function __cross(a, b)
	return __vec3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X)
end

__cframe = function(px, py, pz, right, up, back)
	local p = __vec3(px, py, pz)
	right = right or __vec3(1, 0, 0)
	up = up or __vec3(0, 1, 0)
	back = back or __vec3(0, 0, 1)
	local self = {
		__type = "CFrame",
		Position = p, p = p,
		X = p.X, Y = p.Y, Z = p.Z,
		RightVector = right,
		UpVector = up,
		LookVector = __vec3(-back.X, -back.Y, -back.Z),
	}
	--- world = position + R * v, R's columns being right/up/back.
	function self:PointToWorldSpace(v)
		return __vec3(
			p.X + right.X * v.X + up.X * v.Y + back.X * v.Z,
			p.Y + right.Y * v.X + up.Y * v.Y + back.Y * v.Z,
			p.Z + right.Z * v.X + up.Z * v.Y + back.Z * v.Z
		)
	end
	--- Same, without the translation.
	function self:VectorToWorldSpace(v)
		return __vec3(
			right.X * v.X + up.X * v.Y + back.X * v.Z,
			right.Y * v.X + up.Y * v.Y + back.Y * v.Z,
			right.Z * v.X + up.Z * v.Y + back.Z * v.Z
		)
	end
	--- The inverse: R is orthonormal, so its transpose is its inverse and this is
	--- three dot products rather than a matrix solve.
	function self:PointToObjectSpace(w)
		local d = __sub(w, p)
		return __vec3(__dot(d, right), __dot(d, up), __dot(d, back))
	end
	function self:VectorToObjectSpace(v)
		return __vec3(__dot(v, right), __dot(v, up), __dot(v, back))
	end
	--- Y-X-Z extraction, matching the engine's convention. Render uses it only to
	--- decide whether a part is axis-aligned, so the branch cut at +-pi/2 is not
	--- exercised; it is implemented rather than stubbed so it cannot quietly be wrong.
	function self:ToEulerAnglesYXZ()
		local m21 = up.Z
		local x = math.asin(math.clamp(-m21, -1, 1))
		local y, z
		if math.abs(m21) < 0.9999 then
			y = math.atan2(right.Z, back.Z)
			z = math.atan2(up.X, up.Y)
		else
			y = math.atan2(-back.X, right.X)
			z = 0
		end
		return x, y, z
	end
	--- x, y, z then the rotation matrix in ROW-major order, which is the order
	--- CFrame.new's twelve-argument form reads back. Paths.encode round-trips a CFrame
	--- through exactly this pair, so getting the order wrong silently rotates every
	--- restored part.
	function self:GetComponents()
		return p.X, p.Y, p.Z,
			right.X, up.X, back.X,
			right.Y, up.Y, back.Y,
			right.Z, up.Z, back.Z
	end
	return setmetatable(self, __cframeMT)
end

--[[ CFrame ARITHMETIC. Added for the companion's transform ops, which are three lines
	 of algebra and were untestable without it — \`rot * part.CFrame\` and
	 \`cf + offset\` are how the engine spells "rotate this, then put it there", and a
	 stub CFrame that supports neither forces the code under test to be written in some
	 other shape than the one that ships.

	 \`*\` is the only one with a choice to make: a Vector3 on the right is a POINT being
	 transformed into world space, a CFrame on the right is a frame being composed. The
	 sign convention is the same one \`__cframe\` documents — the stored third column is
	 BACK, which is -LookVector — so composing reads the right operand's back column out
	 rather than its look vector. Getting that backwards mirrors every rotation through
	 the origin and leaves every assertion still passing on axis-aligned input, which is
	 exactly the mistake worth spelling out. ]]
__cframeMT = {
	__add = function(cf, v)
		local p = cf.Position
		local back = __vec3(-cf.LookVector.X, -cf.LookVector.Y, -cf.LookVector.Z)
		return __cframe(p.X + v.X, p.Y + v.Y, p.Z + v.Z, cf.RightVector, cf.UpVector, back)
	end,
	__sub = function(cf, v)
		local p = cf.Position
		local back = __vec3(-cf.LookVector.X, -cf.LookVector.Y, -cf.LookVector.Z)
		return __cframe(p.X - v.X, p.Y - v.Y, p.Z - v.Z, cf.RightVector, cf.UpVector, back)
	end,
	__mul = function(a, b)
		if rawget(b, "__type") == "Vector3" then
			return a:PointToWorldSpace(b)
		end
		local p = a:PointToWorldSpace(b.Position)
		local bBack = __vec3(-b.LookVector.X, -b.LookVector.Y, -b.LookVector.Z)
		return __cframe(
			p.X, p.Y, p.Z,
			a:VectorToWorldSpace(b.RightVector),
			a:VectorToWorldSpace(b.UpVector),
			a:VectorToWorldSpace(bBack)
		)
	end,
}

CFrame = {
	new = function(a, b, c, ...)
		if type(a) == "table" and a.__type == "Vector3" then
			return __cframe(a.X, a.Y, a.Z)
		end
		local r = { ... }
		if #r >= 9 then
			-- The twelve-argument form: position then a row-major rotation matrix.
			return __cframe(a, b, c,
				__vec3(r[1], r[4], r[7]),
				__vec3(r[2], r[5], r[8]),
				__vec3(r[3], r[6], r[9]))
		end
		return __cframe(a or 0, b or 0, c or 0)
	end,
	lookAt = function(from, target, upHint)
		local look = __norm(__sub(target, from))
		local up = upHint or __vec3(0, 1, 0)
		local right = __norm(__cross(look, up))
		local trueUp = __cross(right, look)
		-- back = -look, which is the column the engine actually stores.
		return __cframe(from.X, from.Y, from.Z, right, trueUp, __vec3(-look.X, -look.Y, -look.Z))
	end,
	--- Y-X-Z composition, the order Roblox's CFrame.Angles uses.
	Angles = function(rx, ry, rz)
		local cx, sx = math.cos(rx or 0), math.sin(rx or 0)
		local cy, sy = math.cos(ry or 0), math.sin(ry or 0)
		local cz, sz = math.cos(rz or 0), math.sin(rz or 0)
		local right = __vec3(cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz)
		local up = __vec3(-cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz)
		local back = __vec3(sy * cx, -sx, cy * cx)
		return __cframe(0, 0, 0, right, up, back)
	end,
	fromEulerAnglesXYZ = function(rx, ry, rz) return CFrame.Angles(rx, ry, rz) end,
}

-- Enum. Any Enum.Foo.Bar resolves to a distinct, comparable token that remembers its
-- own name, which is all the modules do with them (assign, compare, tostring).
local __enumCache = {}
Enum = setmetatable({}, {
	__index = function(_, enumName)
		local items = __enumCache[enumName]
		if not items then
			items = setmetatable({}, {
				__index = function(t, itemName)
					-- __type is what the typeof() shim reads. Without it an EnumItem
					-- answered "table", so Paths.encode took its generic-map branch and
					-- every Material and Shape in a snapshot came back undecodable.
					local item = setmetatable(
						{ __type = "EnumItem", Name = itemName, EnumType = enumName, Value = 0 },
						{ __tostring = function(s) return ("Enum.%s.%s"):format(enumName, s.Name) end }
					)
					rawset(t, itemName, item)
					return item
				end,
			})
			__enumCache[enumName] = items
		end
		return items
	end,
})

-- ----------------------------------------------------------------- instances --
-- An instance records what was done to it. Properties assigned through
-- Paths.setProp land in the same table a spec reads back, so a spec asserts on the
-- EFFECT of a call rather than on its return value.
local __InstanceMT = {}
-- Forward declaration: __newInstance's __newindex closes over this, and the property
-- model that defines it is declared below (beside Instance.new, where it reads best).
local __hasProp
local function __newInstance(className, name)
	local children = {}
	local attributes = {}
	local props = {}
	local self = {}
	local proxy
	local fields = {
		ClassName = className,
		Name = name or className,
		Parent = nil,
		__children = children,
		__attributes = attributes,
		__props = props,
		__destroyed = false,
	}
	--[[ Engine defaults for the properties the rasteriser reads unconditionally.
		 Without these a freshly-made Part has Color = nil and Render.renderView dies on
		 base.R — which is exactly what real Roblox does NOT do, so a stub without
		 them makes the rasteriser look broken when it is not. Values are Roblox's own
		 defaults: medium stone grey, Plastic, fully opaque. ]]
	if className == "Part" or className == "MeshPart" or className == "WedgePart" then
		props.Color = Color3.fromRGB(163, 162, 165)
		props.Material = Enum.Material.Plastic
		props.Transparency = 0
		props.Reflectance = 0
		props.Size = __vec3(4, 1, 2)
		props.CFrame = CFrame.new(0, 0, 0)
		props.Anchored = false
		if className == "Part" then props.Shape = Enum.PartType.Block end
	end

	local methods = {}
	function methods.IsA(_, want)
		if fields.ClassName == want then return true end
		-- The handful of class relationships the plugin's own code branches on.
		local kin = {
			Script = { LuaSourceContainer = true, BaseScript = true },
			LocalScript = { LuaSourceContainer = true, BaseScript = true },
			ModuleScript = { LuaSourceContainer = true },
			Part = { BasePart = true, PVInstance = true },
			MeshPart = { BasePart = true, PVInstance = true, TriangleMeshPart = true },
			WedgePart = { BasePart = true, PVInstance = true },
			Model = { PVInstance = true },
			Folder = {},
		}
		local k = kin[fields.ClassName]
		return (k and k[want]) == true
	end
	function methods.GetChildren()
		local out = {}
		for i, c in children do out[i] = c end
		return out
	end
	function methods.GetDescendants()
		local out = {}
		local function walk(node)
			for _, c in node.__children do
				table.insert(out, c)
				walk(c)
			end
		end
		walk(fields)
		return out
	end
	function methods.FindFirstChild(_, want)
		for _, c in children do
			if c.Name == want then return c end
		end
		return nil
	end
	function methods.FindFirstChildOfClass(_, want)
		for _, c in children do
			if c.ClassName == want then return c end
		end
		return nil
	end
	function methods.SetAttribute(_, k, v) attributes[k] = v end
	function methods.GetAttribute(_, k) return attributes[k] end
	function methods.GetAttributes() return attributes end
	function methods.Destroy()
		fields.__destroyed = true
		if fields.Parent then
			local siblings = fields.Parent.__children
			for i, c in siblings do
				if c == proxy then table.remove(siblings, i) break end
			end
		end
		fields.Parent = nil
	end
	function methods.Clone()
		local c = __newInstance(fields.ClassName, fields.Name)
		for k, v in props do c[k] = v end
		return c
	end
	function methods.GetFullName() return fields.Name end
	--- Model:GetBoundingBox, computed from the BasePart descendants the way the engine
	--- does. Generation.boundsOf pcalls it and silently reports zero bounds without it,
	--- so every scale and bounds check in inspect() measured nothing.
	function methods.GetBoundingBox()
		local lo, hi
		local function consider(node)
			for _, c in node.__children do
				local ok = pcall(function() return c.ClassName end)
				if ok and (c.ClassName == "Part" or c.ClassName == "MeshPart" or c.ClassName == "WedgePart") then
					local pos = c.CFrame and c.CFrame.Position or __vec3(0, 0, 0)
					local sz = c.Size or __vec3(0, 0, 0)
					local a = __vec3(pos.X - sz.X / 2, pos.Y - sz.Y / 2, pos.Z - sz.Z / 2)
					local b = __vec3(pos.X + sz.X / 2, pos.Y + sz.Y / 2, pos.Z + sz.Z / 2)
					if lo then
						lo = __vec3(math.min(lo.X, a.X), math.min(lo.Y, a.Y), math.min(lo.Z, a.Z))
						hi = __vec3(math.max(hi.X, b.X), math.max(hi.Y, b.Y), math.max(hi.Z, b.Z))
					else
						lo, hi = a, b
					end
				end
				consider(c)
			end
		end
		consider(fields)
		if not lo then return CFrame.new(0, 0, 0), __vec3(0, 0, 0) end
		local centre = __vec3((lo.X + hi.X) / 2, (lo.Y + hi.Y) / 2, (lo.Z + hi.Z) / 2)
		return CFrame.new(centre.X, centre.Y, centre.Z), __vec3(hi.X - lo.X, hi.Y - lo.Y, hi.Z - lo.Z)
	end

	proxy = setmetatable(self, {
		__index = function(_, k)
			if methods[k] then
				-- Methods are called with a colon, so swallow the self argument.
				return function(...) return methods[k](...) end
			end
			if fields[k] ~= nil then return fields[k] end
			-- Position is DERIVED from CFrame in the engine, not stored beside it.
			-- Serializer.tree reads inst.Position.X, so a stub that only stores CFrame
			-- makes the reader look broken.
			if k == "Position" and props.CFrame then return props.CFrame.Position end
			return props[k]
		end,
		__newindex = function(_, k, v)
			if k == "Parent" then
				if fields.Parent then
					local siblings = fields.Parent.__children
					for i, c in siblings do
						if c == proxy then table.remove(siblings, i) break end
					end
				end
				fields.Parent = v
				if v then table.insert(v.__children, proxy) end
				return
			end
			if k == "Name" then fields.Name = v return end
			-- Setting Position moves the CFrame, keeping the two consistent the way the
			-- engine does; setting CFrame is what the plugin actually does.
			if k == "Position" then
				props.CFrame = CFrame.new(v.X, v.Y, v.Z)
				return
			end
			if not __hasProp(fields.ClassName, k) then
				error((k .. " is not a valid member of " .. fields.ClassName), 2)
			end
			props[k] = v
		end,
		__tostring = function() return fields.Name end,
	})
	return proxy
end

--[[ WHICH PROPERTIES EACH CLASS ACTUALLY HAS.

	 Added 2026-09-01 after a review found the sharpest kind of stub infidelity: the
	 proxy accepted ANY property name, so \`Instance.new("Part").MeshId = "..."\`
	 succeeded here and raises in Studio (a Part has no MeshId). That made the single
	 most load-bearing positive assertion about the asset gate — "the verified id was
	 actually assigned" — pass on a write real Roblox rejects, and it would have
	 inverted in the engine.

	 This is not the full property model and is not trying to be. It is the set the
	 specs assign, plus the shared BasePart/GuiObject surfaces, so that a spec naming a
	 property the class does not have fails LOUDLY instead of quietly proving nothing.
	 Anything missing is a one-line addition beside its class. ]]
local __COMMON = { Name = true, Parent = true, Archivable = true }
local __BASEPART = {
	Size = true, CFrame = true, Position = true, Orientation = true, Anchored = true,
	Transparency = true, Reflectance = true, Color = true, BrickColor = true,
	Material = true, CanCollide = true, CanTouch = true, CastShadow = true, Massless = true,
	-- Locked is what Studio's own Lock/Unlock writes, and what the companion's
	-- set_locked op writes. Without it here, every assertion about locking would have
	-- been made against a property the engine does not accept on a Part.
	Locked = true,
}
local __GUI = {
	Size = true, Position = true, AnchorPoint = true, BackgroundColor3 = true,
	BackgroundTransparency = true, BorderSizePixel = true, Visible = true, ZIndex = true,
	LayoutOrder = true, Rotation = true,
}
-- Part has Shape on top of the shared BasePart surface; WedgePart does not. Kept
-- apart because Serializer.propList reads Shape for Part specifically, and a shared
-- table would have handed it to every BasePart.
local __PART = { Shape = true }
for k in __BASEPART do __PART[k] = true end

local __PROPS = {
	Part = __PART,
	WedgePart = __BASEPART,
	MeshPart = { MeshId = true, TextureID = true, DoubleSided = true },
	SpecialMesh = { MeshId = true, TextureId = true, Scale = true, MeshType = true },
	Decal = { Texture = true, Transparency = true, Face = true },
	Texture = { Texture = true, Transparency = true, StudsPerTileU = true },
	ParticleEmitter = { Texture = true, Rate = true, Lifetime = true },
	Sound = { SoundId = true, Volume = true, Looped = true, PlaybackSpeed = true },
	SurfaceAppearance = { ColorMap = true, NormalMap = true, MetalnessMap = true, RoughnessMap = true },
	ImageLabel = { Image = true, HoverImage = true, PressedImage = true, ImageColor3 = true, ImageTransparency = true },
	ImageButton = { Image = true, HoverImage = true, PressedImage = true, AutoButtonColor = true },
	TextLabel = { Text = true, TextColor3 = true, TextSize = true, Font = true, TextScaled = true, TextWrapped = true },
	TextButton = { Text = true, TextColor3 = true, TextSize = true, Font = true, AutoButtonColor = true },
	Frame = {},
	ScreenGui = { ResetOnSpawn = true, IgnoreGuiInset = true, DisplayOrder = true, Enabled = true },
	UICorner = { CornerRadius = true },
	UIStroke = { Thickness = true, Color = true, Transparency = true },
	UIPadding = { PaddingTop = true, PaddingBottom = true, PaddingLeft = true, PaddingRight = true },
	UIListLayout = { Padding = true, FillDirection = true, SortOrder = true },
	Model = { PrimaryPart = true, WorldPivot = true },
	Folder = {},
	Camera = { CFrame = true, CameraType = true, FieldOfView = true, Focus = true },
	Script = { Source = true, Enabled = true, RunContext = true },
	LocalScript = { Source = true, Enabled = true },
	ModuleScript = { Source = true },
	StringValue = { Value = true },
	IntValue = { Value = true },
	NumberValue = { Value = true },
	BoolValue = { Value = true },
	ObjectValue = { Value = true },
	Attachment = { CFrame = true, Position = true, Visible = true },
	PointLight = { Brightness = true, Range = true, Color = true },
	Humanoid = { WalkSpeed = true, JumpPower = true, Health = true, MaxHealth = true },
	Configuration = {},
	RemoteEvent = {},
	RemoteFunction = {},
	-- Names avatar assets by bare number, which is the tier-2 gate's most important case.
	HumanoidDescription = {
		Face = true, Head = true, Torso = true, LeftArm = true, RightArm = true,
		LeftLeg = true, RightLeg = true, Shirt = true, Pants = true, GraphicTShirt = true,
		HatAccessory = true, HairAccessory = true, FaceAccessory = true, NeckAccessory = true,
		ShoulderAccessory = true, FrontAccessory = true, BackAccessory = true, WaistAccessory = true,
	},
}

__hasProp = function(className, key)
	if __COMMON[key] then return true end
	local own = __PROPS[className]
	if own and own[key] then return true end
	-- Every Gui* class shares the GuiObject surface.
	if (__PROPS[className] ~= nil) and (string.find(className, "Label") or string.find(className, "Button")
		or string.find(className, "Frame") or string.find(className, "Gui")) then
		return __GUI[key] == true
	end
	return false
end

-- Class names the engine refuses. Instance.new must raise on a bad className,
-- because Ops.create_instances relies on that raise to roll the whole op back.
local __KNOWN_CLASSES = {
	Part = true, MeshPart = true, WedgePart = true, Model = true, Folder = true,
	Script = true, LocalScript = true, ModuleScript = true, Decal = true, Sound = true,
	SpecialMesh = true, Attachment = true, Humanoid = true, StringValue = true,
	IntValue = true, NumberValue = true, BoolValue = true, ObjectValue = true,
	Configuration = true, RemoteEvent = true, RemoteFunction = true, ScreenGui = true,
	Frame = true, TextLabel = true, TextButton = true, ImageLabel = true, ImageButton = true,
	UICorner = true, UIListLayout = true, UIPadding = true, UIStroke = true, Camera = true,
	Texture = true, ParticleEmitter = true, PointLight = true, SurfaceAppearance = true,
	HumanoidDescription = true, WedgePart = true,
}
Instance = {
	new = function(className, parent)
		if not __KNOWN_CLASSES[className] then
			error(("Unable to create an Instance of type \\"%s\\""):format(tostring(className)), 2)
		end
		local inst = __newInstance(className)
		if parent then inst.Parent = parent end
		return inst
	end,
}

-- ------------------------------------------------------------------ services --
-- Every service is an instance, created on demand, so a path like
-- game.ServerStorage.Foo resolves through the same tree code the plugin uses.
local __services = {}

-- ChangeHistoryService is the one service whose BEHAVIOUR a spec asserts on, because
-- Ops.execute refuses a mutating op when a recording cannot be opened. The stub
-- records the calls and lets a spec force the nil that the real service returns when
-- a recording is already open.
local __history = {
	__recordings = {},
	__log = {},
	__refuseNext = false,
	__seq = 0,
}
function __history:TryBeginRecording(name)
	table.insert(self.__log, "begin:" .. tostring(name))
	if self.__refuseNext then
		self.__refuseNext = false
		return nil
	end
	self.__seq += 1
	local id = "rec" .. tostring(self.__seq)
	self.__recordings[id] = name
	return id
end
function __history:FinishRecording(id, op)
	table.insert(self.__log, "finish:" .. tostring(id) .. ":" .. tostring(op and op.Name))
	self.__recordings[id] = nil
end
function __history:SetWaypoint(name) table.insert(self.__log, "waypoint:" .. tostring(name)) end
__services.ChangeHistoryService = __history

local __selection = { __set = {} }
function __selection:Set(items) self.__set = items end
function __selection:Get() return self.__set end
__services.Selection = __selection

--[[ RunService, WITH A SIMULATION STATE, because the test controls are a state machine.

	 \`IsRunning\` used to be a constant \`false\`, which meant every test-control assertion
	 would have been made against a simulation that is always stopped — the one state in
	 which "pause", "resume" and "restart" all collapse to the same answer. The stub now
	 records the calls and moves between the three states Studio actually has:

	   edit     running = false, runMode = false
	   running  running = true,  runMode = true
	   paused   running = false, runMode = true     <- the state the two disagree about

	 Nothing here simulates anything. Run/Pause/Stop only move those two flags and append
	 to \`__calls\`, which is what a spec asserts on. ]]
local __runservice = { __running = false, __runMode = false, __calls = {} }
function __runservice:IsStudio() return true end
function __runservice:IsServer() return true end
function __runservice:IsRunning() return self.__running end
function __runservice:IsRunMode() return self.__runMode end
function __runservice:IsEdit() return not self.__runMode end
function __runservice:Run()
	table.insert(self.__calls, "Run")
	self.__running = true
	self.__runMode = true
end
function __runservice:Pause()
	table.insert(self.__calls, "Pause")
	self.__running = false
end
function __runservice:Stop()
	table.insert(self.__calls, "Stop")
	self.__running = false
	self.__runMode = false
end
__services.RunService = __runservice

local __logservice = { __history = {} }
function __logservice:GetLogHistory() return self.__history end
__services.LogService = __logservice

local __scripteditor = {}
function __scripteditor:GetEditorSource(inst) return inst.Source or "" end
function __scripteditor:UpdateSourceAsync(inst, fn) inst.Source = fn(inst.Source or "") end
__services.ScriptEditorService = __scripteditor

game = nil
local __game
__game = setmetatable({ Name = "game", __children = {} }, {
	__index = function(t, k)
		if k == "GetObjects" then
			return function(_, uri)
				if __getObjectsError then error(__getObjectsError, 0) end
				local out = {}
				for i, o in (__getObjectsResult or {}) do out[i] = o end
				return out
			end
		end
		if k == "GetService" then
			return function(_, name)
				local existing = __services[name]
				if existing then return existing end
				local svc = __newInstance("Folder", name)
				svc.Parent = __game
				__services[name] = svc
				return svc
			end
		end
		if k == "FindFirstChild" then
			return function(_, want)
				for _, c in rawget(t, "__children") do
					if c.Name == want then return c end
				end
				return nil
			end
		end
		if k == "GetDescendants" then
			return function()
				local out = {}
				local function walk(node)
					for _, c in node.__children do
						table.insert(out, c)
						walk(c)
					end
				end
				walk(t)
				return out
			end
		end
		if k == "IsA" then return function() return false end end
		if k == "Parent" then return nil end
		return nil
	end,
})
game = __game

-- \`workspace\` is a global alias in Roblox and some modules use it directly.
workspace = __game:GetService("Workspace")

--[[ typeof(), and why nothing worked without it.

	 Paths.encode branches entirely on typeof(value). The standalone Luau runtime has
	 no Roblox datatypes, so it answers "table" for every stub above — which sent every
	 Vector3, CFrame, Color3 and EnumItem down the generic-table branch, encoded them as
	 anonymous maps, and made restore fail to decode them. Twenty properties per
	 five-part snapshot, all silently.

	 This is exactly the class of stub infidelity that makes a passing test meaningless:
	 the codec was being exercised, thoroughly, on the wrong branch. ]]
local __rawtypeof = typeof
function typeof(v)
	if type(v) == "table" then
		local tag = rawget(v, "__type")
		if tag then return tag end
		if rawget(v, "__children") ~= nil or rawget(v, "ClassName") ~= nil then return "Instance" end
		-- The instance proxy keeps its fields behind a metatable, so ask it.
		local ok, cn = pcall(function() return v.ClassName end)
		if ok and type(cn) == "string" then return "Instance" end
	end
	return __rawtypeof(v)
end

--[[ DateTime, with a clock a spec can move.

	 Generation's rate limiter is a sliding window over wall-clock seconds. A test that
	 waited sixty real seconds to watch it slide would not be run, so the clock is
	 settable: __clockOffset shifts what now() reports without sleeping. ]]
__clockOffset = 0
DateTime = {
	now = function()
		return { UnixTimestampMillis = (os.time() + __clockOffset) * 1000 }
	end,
}

--[[ game:GetObjects, the marketplace loader.

	 The one primitive insert_asset exists to gate. It is stubbed as a switch rather
	 than a fake marketplace: a spec sets __getObjectsResult to a list, or
	 __getObjectsError to make it raise, and asserts what Generation.insertAsset does
	 with each. Nothing here pretends to fetch anything. ]]
__getObjectsResult = nil
__getObjectsError = nil

-- ----------------------------------------------------------------- task/time --
-- No scheduler exists here, and pretending otherwise would let a spec "prove" a
-- yielding path that never yielded. task.wait returns immediately and task.spawn
-- runs the callback INLINE, which is visible in a stack trace rather than silent.
task = {
	wait = function() return 0 end,
	spawn = function(fn, ...) fn(...) return {} end,
	defer = function(fn, ...) fn(...) return {} end,
	delay = function(_, fn, ...) fn(...) return {} end,
	cancel = function() end,
}
function wait() return 0 end

-- ----------------------------------------------------------- module registry --
-- Modules register here as they load, dependency-first, so a later module's own
-- \`require(script.Parent.Paths)\` finds the real Paths this same chunk evaluated.
local __plugin = {}
script = setmetatable({ Name = "GolemPlugin" }, {
	__index = function(t, k)
		if k == "Parent" then return setmetatable({}, { __index = function(_, mod) return __plugin[mod] end }) end
		return __plugin[k]
	end,
})
local function require(target)
	if type(target) == "table" and target.__module ~= nil then return target.__module end
	error("require: no such module: " .. tostring(target), 2)
end
`;

/** Wrap a module's source so its trailing `return X` becomes a local binding. */
const wrap = (name, src) => `local ${name} = (function()\n${src}\nend)()\n`;

/** The modules a spec declares with `--!modules Name=File,…`, in load order. */
export function declaredModules(specSrc) {
  const decl = /^--!modules\s+(.+)$/m.exec(specSrc);
  if (!decl) return null;
  return decl[1].split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({
    name,
    path: join(SRC, `${name}.luau`),
  }));
}

/** Assemble one runnable Luau chunk from a spec and its modules.
 *  `mutate` (source, moduleName) => source lets a mutation check inject a bug into the
 *  source TEXT on its way into the chunk, so the file on disk is never modified. */
export function buildChunk(specSrc, mods, mutate = (src) => src) {
  return [
    PRELUDE,
    ...mods.flatMap((m) => [
      wrap(m.name, mutate(readFileSync(m.path, 'utf8'), m.name)),
      `__plugin.${m.name} = { Name = "${m.name}", __module = ${m.name} }`,
    ]),
    `local H = (function()\n${readFileSync(join(HERE, 'harness.luau'), 'utf8')}\nend)()`,
    specSrc.replace(/^--!modules.*$/m, '').replace(/local H = require\([^)]*\)\s*/g, ''),
  ].join('\n');
}

function main() {
  if (!haveLuau()) {
    console.log('plugin luau specs: SKIPPED — `luau` is not on PATH.');
    console.log('  These are the only tests that exercise the Studio plugin\'s own Luau.');
    console.log('  Install the Luau CLI (https://github.com/luau-lang/luau/releases) to run');
    console.log('  them locally; CI does.');
    return 0;
  }
  const specs = readdirSync(HERE).filter((f) => f.endsWith('.spec.luau')).sort();
  if (specs.length === 0) {
    console.error('plugin luau specs: no *.spec.luau found');
    return 1;
  }

  const dir = mkdtempSync(join(tmpdir(), 'plugin-luau-'));
  let failures = 0;

  for (const spec of specs) {
    const specSrc = readFileSync(join(HERE, spec), 'utf8');
    const mods = declaredModules(specSrc);
    if (!mods) {
      console.error(`${spec}: missing a "--!modules" line declaring what to load`);
      failures += 1;
      continue;
    }
    const body = buildChunk(specSrc, mods);
    const out = join(dir, `${basename(spec, '.luau')}.gen.luau`);
    writeFileSync(out, body);
    try {
      process.stdout.write(run('luau', [out], { encoding: 'utf8', stdio: 'pipe' }));
    } catch (err) {
      failures += 1;
      process.stdout.write(err.stdout ?? '');
      process.stderr.write(err.stderr ?? '');
    }
  }

  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
