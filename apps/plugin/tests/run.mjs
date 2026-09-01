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

-- CFrame. Position and the three basis vectors are real, because Render.viewpoints
-- composes them and a spec has to be able to check where a camera ended up. Rotation
-- maths beyond lookAt is NOT modelled: CFrame.Angles returns identity, so any spec
-- that needs a real rotation would visibly get the wrong answer rather than a
-- plausible one.
local __cframe
local function __sub(a, b) return __vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
local function __norm(v)
	local m = math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z)
	if m == 0 then return __vec3(0, 0, 0) end
	return __vec3(v.X / m, v.Y / m, v.Z / m)
end
local function __cross(a, b)
	return __vec3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X)
end
__cframe = function(px, py, pz, look, up, right)
	local p = __vec3(px, py, pz)
	local self = {
		__type = "CFrame",
		Position = p, p = p,
		X = p.X, Y = p.Y, Z = p.Z,
		LookVector = look or __vec3(0, 0, -1),
		UpVector = up or __vec3(0, 1, 0),
		RightVector = right or __vec3(1, 0, 0),
	}
	-- Correct for an unrotated frame, and LOUD otherwise. Render.bounds walks a
	-- part's eight corners through this, and quietly returning the unrotated answer
	-- for a rotated part would make a bounds spec agree with a wrong implementation.
	function self:PointToWorldSpace(v)
		local r, u, l = self.RightVector, self.UpVector, self.LookVector
		local identity = r.X == 1 and r.Y == 0 and r.Z == 0
			and u.X == 0 and u.Y == 1 and u.Z == 0
			and l.X == 0 and l.Y == 0 and l.Z == -1
		if not identity then
			error("PointToWorldSpace: this harness models translation only. A spec that "
				.. "needs a rotated part belongs in Studio.", 2)
		end
		return __vec3(self.Position.X + v.X, self.Position.Y + v.Y, self.Position.Z + v.Z)
	end
	return self
end
CFrame = {
	new = function(a, b, c, ...)
		if type(a) == "table" and a.__type == "Vector3" then
			return __cframe(a.X, a.Y, a.Z)
		end
		return __cframe(a or 0, b or 0, c or 0)
	end,
	-- Real lookAt, because a viewpoint whose camera faces the wrong way is exactly
	-- the defect a viewpoints spec exists to catch.
	lookAt = function(from, target, upHint)
		local look = __norm(__sub(target, from))
		local up = upHint or __vec3(0, 1, 0)
		local right = __norm(__cross(look, up))
		local trueUp = __cross(right, look)
		return __cframe(from.X, from.Y, from.Z, look, trueUp, right)
	end,
	Angles = function() return __cframe(0, 0, 0) end,
	fromEulerAnglesXYZ = function() return __cframe(0, 0, 0) end,
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
					local item = setmetatable(
						{ Name = itemName, EnumType = enumName, Value = 0 },
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

	proxy = setmetatable(self, {
		__index = function(_, k)
			if methods[k] then
				-- Methods are called with a colon, so swallow the self argument.
				return function(...) return methods[k](...) end
			end
			if fields[k] ~= nil then return fields[k] end
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
			props[k] = v
		end,
		__tostring = function() return fields.Name end,
	})
	return proxy
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

local __runservice = {}
function __runservice:IsStudio() return true end
function __runservice:IsRunning() return false end
function __runservice:IsServer() return true end
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
