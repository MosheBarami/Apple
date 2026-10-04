/**
 * Shared by the AppleBehave specs: a luau spec harness and a MOCK of the parts of the Roblox API the runtime glue touches.
 * It is a mock. What it proves is the wiring under these semantics; nothing that runs against it ran in Studio.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FILE = join(HERE, '..', 'behave', 'AppleBehave.luau');
export const MODULE = readFileSync(FILE, 'utf8').replace(/^--!strict\n/, '');

export function luauAvailable() { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } }

/** Runs Luau source in the luau CLI and returns its stdout; throws with the output when it fails. */
export function runLuau(body, label) {
  const file = join(mkdtempSync(join(tmpdir(), 'behave-')), `${label}.gen.luau`);
  writeFileSync(file, body);
  try { return execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { throw new Error(String(e.stdout) + String(e.stderr)); }
}

export const HARNESS = String.raw`
local passed, failures = 0, {}
local function spec(name, fn) local ok, err = pcall(fn); if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(err)) end end
local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local function near(a, b, why, eps) if math.abs(a - b) > (eps or 1e-6) then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local function nearAll(a, b, why, eps) for i = 1, #b do near(a[i], b[i], (why or "list") .. "[" .. i .. "]", eps) end end
local IDENT = { 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }
local function report(name)
  print(("%s: %d passed%s"):format(name, passed, if #failures > 0 then ", " .. #failures .. " FAILED" else ""))
  for _, f in failures do print(f) end
  if #failures > 0 then error(name .. " specs failed") end
end
`;

export const MOCK = String.raw`
local warnings = {}
warn = function(...) local t = {}; for _, v in { ... } do table.insert(t, tostring(v)) end; table.insert(warnings, table.concat(t, " ")) end
Enum = { Material = { Neon = "Neon", Plastic = "Plastic", Metal = "Metal" }, HumanoidStateType = { Jumping = "Jumping" } }
Vector3 = { new = function(x, y, z) return { X = x, Y = y, Z = z } end }
Color3 = { new = function(r, g, b) return { R = r, G = g, B = b } end }
local function mkcf(c)
  return { _c = c, GetComponents = function(self) return table.unpack(self._c) end, Position = { X = c[1], Y = c[2], Z = c[3] } }
end
CFrame = { new = function(...)
  local a = { ... }
  if #a == 12 then return mkcf(a) end
  return mkcf({ a[1] or 0, a[2] or 0, a[3] or 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 })
end }

local CLASSES = {
  Part = { "Part", "BasePart", "PVInstance" }, MeshPart = { "MeshPart", "BasePart", "PVInstance" },
  Model = { "Model", "PVInstance" }, Folder = { "Folder" },
  ClickDetector = { "ClickDetector" }, ProximityPrompt = { "ProximityPrompt" },
  PointLight = { "PointLight", "Light" }, SpotLight = { "SpotLight", "Light" },
  Sound = { "Sound" }, ParticleEmitter = { "ParticleEmitter" }, Decal = { "Decal" },
  Weld = { "Weld", "JointInstance" }, Motor6D = { "Motor6D", "JointInstance" }, WeldConstraint = { "WeldConstraint" },
  ModuleScript = { "ModuleScript" }, Humanoid = { "Humanoid" }, Workspace = { "Workspace", "Model" },
}
local SIGNALS = { Touched = true, MouseClick = true, Triggered = true, Ended = true, DescendantAdded = true, Heartbeat = true }
local Obj = {}
local function newSignal()
  local sig = { fns = {} }
  function sig:Connect(fn) table.insert(self.fns, fn); return { Disconnect = function() end } end
  function sig:Once(fn) local done = false; table.insert(self.fns, function(...) if done then return end; done = true; fn(...) end) end
  function sig:Fire(...) for _, f in table.clone(self.fns) do f(...) end end
  return sig
end
local function make(class, name)
  local o = { ClassName = class, Name = name or class, _kids = {}, _attr = {}, _isa = {} }
  for _, c in CLASSES[class] or { class } do o._isa[c] = true end
  o._isa.Instance = true
  if o._isa.BasePart then
    o.CFrame = CFrame.new(0, 0, 0); o.Size = Vector3.new(4, 1, 2); o.Anchored = false; o.Transparency = 0
    o.CanCollide = true; o.Material = "Plastic"; o.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
  end
  if class == "Sound" then o.Volume = 0.5; o.PlaybackSpeed = 1; o.Looped = false; o.SoundId = ""; o.plays = 0 end
  if o._isa.Light then o.Enabled = true; o.Brightness = 1; o.Range = 8 end
  if class == "ParticleEmitter" then o.Enabled = true; o.emitted = 0 end
  if o._isa.JointInstance or class == "WeldConstraint" then o.Enabled = true end
  return setmetatable(o, Obj)
end
local function ancestors(o) local out, at = {}, rawget(o, "_parent"); while at do table.insert(out, at); at = rawget(at, "_parent") end; return out end
Obj.__index = function(t, k)
  local m = Obj[k]; if m then return m end
  if k == "Parent" then return rawget(t, "_parent") end
  if SIGNALS[k] then local sig = newSignal(); rawset(t, k, sig); return sig end
  if k == "Position" and rawget(t, "CFrame") then return rawget(t, "CFrame").Position end
  if k == "IsPlaying" or k == "Playing" then return rawget(t, "_playing") == true end
  return nil
end
Obj.__newindex = function(t, k, v)
  if k == "Parent" then
    local old = rawget(t, "_parent")
    if old then for i, c in old._kids do if c == t then table.remove(old._kids, i); break end end end
    rawset(t, "_parent", v)
    if v then
      table.insert(v._kids, t)
      for _, a in { v, table.unpack(ancestors(v)) } do local sig = rawget(a, "DescendantAdded"); if sig then sig:Fire(t) end end
    end
  elseif k == "Playing" then
    rawset(t, "_playing", v == true)
    if v == true then rawset(t, "plays", (rawget(t, "plays") or 0) + 1) end
  else rawset(t, k, v) end
end
function Obj:GetChildren() return table.clone(self._kids) end
function Obj:GetDescendants() local out = {}; local function walk(o) for _, c in o._kids do table.insert(out, c); walk(c) end end; walk(self); return out end
function Obj:IsA(c) return self._isa[c] == true end
function Obj:FindFirstChild(n) for _, c in self._kids do if c.Name == n then return c end end; return nil end
function Obj:FindFirstChildWhichIsA(c) for _, k in self._kids do if k:IsA(c) then return k end end; return nil end
function Obj:FindFirstChildOfClass(c) for _, k in self._kids do if k.ClassName == c then return k end end; return nil end
function Obj:GetFullName() local n, at = self.Name, self.Parent; while at do n = at.Name .. "." .. n; at = at.Parent end; return n end
function Obj:SetAttribute(k, v) self._attr[k] = v end
function Obj:GetAttribute(k) return self._attr[k] end
function Obj:Destroy() self.Parent = nil end
function Obj:Play() rawset(self, "_playing", true); rawset(self, "plays", (rawget(self, "plays") or 0) + 1) end
function Obj:Stop() rawset(self, "_playing", false) end
function Obj:Emit(n) rawset(self, "emitted", (rawget(self, "emitted") or 0) + n) end
function Obj:ChangeState(s) rawset(self, "state", s) end
function Obj:Clone()
  local c = make(self.ClassName, self.Name)
  for k, v in self do if k ~= "_kids" and k ~= "_parent" and k ~= "_attr" and k ~= "_isa" and not SIGNALS[k] then rawset(c, k, v) end end
  for _, kid in self._kids do kid:Clone().Parent = c end
  return c
end
function Obj:GetBoundingBox()
  local lo, hi
  for _, d in self:GetDescendants() do
    if d:IsA("BasePart") then
      local p, s = d.Position, d.Size
      local a = { p.X - s.X / 2, p.Y - s.Y / 2, p.Z - s.Z / 2 }; local b = { p.X + s.X / 2, p.Y + s.Y / 2, p.Z + s.Z / 2 }
      lo = lo and { math.min(lo[1], a[1]), math.min(lo[2], a[2]), math.min(lo[3], a[3]) } or a
      hi = hi and { math.max(hi[1], b[1]), math.max(hi[2], b[2]), math.max(hi[3], b[3]) } or b
    end
  end
  return CFrame.new((lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, (lo[3] + hi[3]) / 2), Vector3.new(hi[1] - lo[1], hi[2] - lo[2], hi[3] - lo[3])
end

function newWorld()
  local w = { now = 0, delayed = {}, deferred = {}, players = {} }
  warnings = {}
  w.Workspace = make("Workspace", "Workspace")
  workspace = w.Workspace
  local Heartbeat = newSignal()
  local services = {
    RunService = { Heartbeat = Heartbeat },
    Players = { GetPlayers = function() return w.players end, GetPlayerFromCharacter = function(_, ch) for _, p in w.players do if p.Character == ch then return p end end; return nil end },
  }
  game = { GetService = function(_, n) return services[n] end, GetChildren = function() return { w.Workspace } end }
  task = {
    delay = function(s, fn, ...) table.insert(w.delayed, { at = w.now + s, fn = fn, args = { ... } }) end,
    defer = function(fn, ...) table.insert(w.deferred, { fn = fn, args = { ... } }) end,
  }
  Instance = { new = function(class) return make(class) end }
  require = function(m) return m._value end
  function w.flush() while #w.deferred > 0 do local d = table.remove(w.deferred, 1); d.fn(table.unpack(d.args)) end end
  function w.step(dt)
    w.now += dt
    table.sort(w.delayed, function(a, b) return a.at < b.at end)
    while #w.delayed > 0 and w.delayed[1].at <= w.now do local d = table.remove(w.delayed, 1); d.fn(table.unpack(d.args)) end
    Heartbeat:Fire(dt)
    w.flush()
  end
  function w.run(seconds) local n = math.max(1, math.floor(seconds * 30 + 0.5)); for _ = 1, n do w.step(1 / 30) end end
  function w.part(name, x, y, z, sx, sy, sz, anchored)
    local p = make("Part", name)
    p.CFrame = CFrame.new(x or 0, y or 0, z or 0); p.Size = Vector3.new(sx or 4, sy or 1, sz or 2); p.Anchored = anchored ~= false
    return p
  end
  function w.model(name, ...) local m = make("Model", name); for _, k in { ... } do k.Parent = m end; m.Parent = w.Workspace; return m end
  function w.config(model, behaviours) local m = make("ModuleScript", "AppleBehaviours"); m._value = { v = 1, behaviours = behaviours }; m.Parent = model; return m end
  function w.player(name, x, y, z)
    local ch = make("Model", name)
    local root = make("Part", "HumanoidRootPart"); root.CFrame = CFrame.new(x or 0, y or 0, z or 0); root.Parent = ch
    local hum = make("Humanoid", "Humanoid"); hum.Parent = ch
    ch.Parent = w.Workspace
    local p = { Name = name, Character = ch, root = root, hum = hum }
    table.insert(w.players, p)
    return p
  end
  function w.start() AppleBehave.clock = function() return w.now end; AppleBehave.start(); w.flush() end
  return w
end
local function rest(p) return { p.CFrame:GetComponents() } end
local function ref(...) return { segs = { ... } } end
`;
