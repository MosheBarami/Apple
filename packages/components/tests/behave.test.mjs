/**
 * AppleBehave: the runtime that gives a stripped library model its behaviour back from data.
 *
 * Three layers, each honest about what it proves:
 *   1. the file parses (luau-analyze reports no SyntaxError);
 *   2. the pure core (easing, hinge maths, the trigger state machine, record checking, path resolution) runs in the
 *      real luau CLI against hand-computed numbers;
 *   3. the glue (AppleBehave.start) runs in the luau CLI against a MOCK of the Roblox API written in this file. That
 *      proves the wiring logic (which trigger drives which verb, composition, anchoring, cooldowns) under the mock's
 *      semantics. It does NOT prove Roblox behaves the way the mock does: nothing here ran in Studio.
 * Every scene below is invented for this test; nothing in it names a subject the product is asked to build.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'behave', 'AppleBehave.luau');
const MODULE = readFileSync(FILE, 'utf8').replace(/^--!strict\n/, '');

function available() { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } }
const skip = available() ? false : 'luau is not on PATH';

function runLuau(body, label) {
  const file = join(mkdtempSync(join(tmpdir(), 'behave-')), `${label}.gen.luau`);
  writeFileSync(file, `${body}`);
  try { return execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { assert.fail(String(e.stdout) + String(e.stderr)); }
}

const HARNESS = String.raw`
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

// ------------------------------------------------------------------------------------------------ layer 1

test('AppleBehave parses (luau-analyze reports no SyntaxError)', { skip: available() ? false : 'luau is not on PATH' }, () => {
  let out = '';
  try { out = execFileSync('luau-analyze', [FILE], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
  const syntax = out.split('\n').filter((l) => l.includes('SyntaxError'));
  assert.deepEqual(syntax, [], syntax.join('\n'));
});

// ------------------------------------------------------------------------------------------------ layer 2

const PURE = String.raw`
spec("easing is 0 at 0 and 1 at 1 for every curve, and clamps outside", function()
  for _, style in { "Linear", "Sine", "Quad", "Back", "Bounce", "Elastic" } do
    near(AppleBehave.ease(style, 0), 0, style .. " at 0")
    near(AppleBehave.ease(style, 1), 1, style .. " at 1")
    near(AppleBehave.ease(style, -5), 0, style .. " below")
    near(AppleBehave.ease(style, 7), 1, style .. " above")
  end
  eq(AppleBehave.ease("Back", 0.7) > 1, true, "Back overshoots before it settles")
  near(AppleBehave.ease("Linear", 0.3), 0.3)
end)

spec("approach moves toward the target at one unit per seconds, never past it", function()
  near(AppleBehave.approach(0, 1, 0.1, 1), 0.1)
  near(AppleBehave.approach(0.95, 1, 0.1, 1), 1)
  near(AppleBehave.approach(1, 0, 0.25, 0.5), 0.5)
  near(AppleBehave.approach(0.2, 0, 1, 0.5), 0)
  near(AppleBehave.approach(0.3, 1, 0.01, 0), 1, "no time means now")
end)

spec("waves: sine starts at rest and swings both ways; hop never goes below rest", function()
  near(AppleBehave.wave("sine", 0, 2), 0)
  near(AppleBehave.wave("sine", 0.5, 2), 1)
  near(AppleBehave.wave("sine", 1.5, 2), -1)
  near(AppleBehave.wave("hop", 0, 2), 0)
  near(AppleBehave.wave("hop", 1, 2), 1)
  near(AppleBehave.wave("hop", 2, 2), 0, "lands once per period", 1e-9)
  for i = 0, 40 do eq(AppleBehave.wave("hop", i * 0.173, 1.3) >= 0, true, "hop " .. i) end
  near(AppleBehave.wave("sine", 1, 0), AppleBehave.wave("sine", 1, 1), "a zero period reads as one")
end)

-- A tree of plain tables is enough for resolve: it asks only for Name and GetChildren.
local function node(name, kids)
  local n = { Name = name }
  function n:GetChildren() return kids or {} end
  return n
end
spec("resolve walks names, picks the nth of duplicate names, and says nil for a missing one", function()
  local a, b, hinge = node("Panel"), node("Panel"), node("Hinge")
  local root = node("Root", { node("Base"), a, b, node("Frame", { hinge }) })
  eq(AppleBehave.resolve(root, {}), root, "an empty path is the root")
  eq(AppleBehave.resolve(root, { "Frame", "Hinge" }), hinge)
  eq(AppleBehave.resolve(root, { "Panel" }), a, "first of the duplicates by default")
  eq(AppleBehave.resolve(root, { { name = "Panel", nth = 2 } }), b)
  eq(AppleBehave.resolve(root, { { name = "Panel", nth = 3 } }), nil)
  eq(AppleBehave.resolve(root, { "Nope" }), nil)
  eq(AppleBehave.resolve(root, { "Base", "Deeper" }), nil)
  eq(AppleBehave.resolve(root, { 5 }), nil, "a non-name segment is nil, not an error")
end)

spec("transition: toggle flips, pulse and hold arm a timer, once never turns off", function()
  local on, arm = AppleBehave.transition("toggle", false, "activate"); eq(on, true); eq(arm, false)
  on = AppleBehave.transition("toggle", true, "activate"); eq(on, false)
  on = AppleBehave.transition("toggle", true, "enter"); eq(on, true, "toggle ignores near")
  on = AppleBehave.transition("toggle", true, "expire"); eq(on, true, "toggle has no timer")
  on, arm = AppleBehave.transition("pulse", false, "activate"); eq(on, true); eq(arm, true)
  on, arm = AppleBehave.transition("pulse", true, "activate"); eq(on, true); eq(arm, true, "a second activation extends it")
  on = AppleBehave.transition("pulse", true, "expire"); eq(on, false)
  on, arm = AppleBehave.transition("hold", false, "enter"); eq(on, true); eq(arm, false)
  on = AppleBehave.transition("hold", true, "leave"); eq(on, false)
  on, arm = AppleBehave.transition("hold", false, "activate"); eq(on, true); eq(arm, true, "touching refreshes the hold")
  on = AppleBehave.transition("hold", true, "expire"); eq(on, false)
  on = AppleBehave.transition("once", false, "activate"); eq(on, true)
  on = AppleBehave.transition("once", true, "leave"); eq(on, true)
  on = AppleBehave.transition("once", true, "expire"); eq(on, true)
end)

spec("defaults: spinning and bobbing start themselves, a launcher listens for touch, the rest wait for a click", function()
  eq(AppleBehave.defaultTrigger("spin"), "auto"); eq(AppleBehave.defaultTrigger("bob"), "auto")
  eq(AppleBehave.defaultTrigger("bounce"), "touch"); eq(AppleBehave.defaultTrigger("swing"), "click")
  eq(AppleBehave.defaultMode("click"), "toggle"); eq(AppleBehave.defaultMode("touch"), "pulse"); eq(AppleBehave.defaultMode("near"), "hold")
end)

spec("swingComponents: a quarter turn about Y sends +X to -Z (right-hand rule), about the pivot", function()
  local out = AppleBehave.swingComponents({ 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }, { 0, 0, 0 }, { 0, 1, 0 }, 90)
  nearAll(out, { 0, 0, -1, 0, 0, 1, 0, 1, 0, -1, 0, 0 }, "quarter turn")
  local about = AppleBehave.swingComponents({ 3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }, { 2, 0, 0 }, { 0, 1, 0 }, 90)
  nearAll({ about[1], about[2], about[3] }, { 2, 0, -1 }, "about a pivot that is not the origin")
end)

spec("swingComponents: zero, a full turn and a turn back leave the pose where it was; the axis can be any length", function()
  local c = { 1.5, 2, -3, 0, 0, 1, 0, 1, 0, -1, 0, 0 }
  nearAll(AppleBehave.swingComponents(c, { 4, 5, 6 }, { 1, 2, 3 }, 0), c, "zero")
  nearAll(AppleBehave.swingComponents(c, { 4, 5, 6 }, { 1, 2, 3 }, 360), c, "full turn", 1e-9)
  local there = AppleBehave.swingComponents(c, { 4, 5, 6 }, { 1, 2, 3 }, 77)
  nearAll(AppleBehave.swingComponents(there, { 4, 5, 6 }, { 1, 2, 3 }, -77), c, "back again", 1e-9)
  nearAll(AppleBehave.swingComponents(c, { 4, 5, 6 }, { 10, 20, 30 }, 77), there, "the axis length is irrelevant", 1e-9)
  nearAll(AppleBehave.swingComponents(c, { 4, 5, 6 }, { 0, 0, 0 }, 77), c, "a zero axis cannot turn anything")
  -- still a rotation: columns stay unit length and orthogonal
  local function col(i) return { there[3 + i], there[6 + i], there[9 + i] } end
  local function dot(a, b) return a[1] * b[1] + a[2] * b[2] + a[3] * b[3] end
  near(dot(col(1), col(1)), 1, "unit"); near(dot(col(1), col(2)), 0, "orthogonal"); near(dot(col(2), col(3)), 0, "orthogonal")
  eq(table.concat(c, ","), "1.5,2,-3,0,0,1,0,1,0,-1,0,0", "the input is not modified")
end)

spec("a hinged flap: a thin box sitting on a base opens upward with a NEGATIVE angle about the +X edge at its back", function()
  local box, size = { 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }, { 4, 0.4, 3 }
  local pivot = AppleBehave.boxPoint(box, size, { 0, -1, -1 })
  nearAll(pivot, { 0, 0.8, -1.5 }, "pivot on the bottom back edge")
  local open = AppleBehave.swingComponents(box, pivot, AppleBehave.vectorToWorld(box, { 1, 0, 0 }), -90)
  nearAll({ open[1], open[2], open[3] }, { 0, 2.3, -1.7 }, "the flap's centre goes up and back")
  local wrong = AppleBehave.swingComponents(box, pivot, { 1, 0, 0 }, 90)
  eq(wrong[2] < 0.8, true, "the opposite sign swings it down into the base")
end)

spec("boxPoint and vectorToWorld follow a turned box", function()
  local turned = { 10, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0 } -- local +X is world -Z, local +Z is world +X
  nearAll(AppleBehave.vectorToWorld(turned, { 1, 0, 0 }), { 0, 0, -1 })
  nearAll(AppleBehave.boxPoint(turned, { 2, 2, 8 }, { 0, 0, 1 }), { 14, 0, 0 }, "the +Z face of an 8-long box sits 4 studs along world +X")
end)

spec("compose: rotations in order about their own hinges, then translations; order of translations is irrelevant", function()
  local rest = { 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }
  local out = AppleBehave.compose(rest, { { pivot = { 0, 0, 0 }, axis = { 0, 1, 0 }, degrees = 90 } }, { { 0, 5, 0 }, { 1, 0, 0 } })
  nearAll({ out[1], out[2], out[3] }, { 1, 5, 0 })
  nearAll(AppleBehave.compose(rest, {}, {}), rest)
  local a = AppleBehave.compose(rest, { { pivot = { 1, 0, 0 }, axis = { 0, 0, 1 }, degrees = 90 }, { pivot = { 0, 1, 0 }, axis = { 1, 0, 0 }, degrees = 90 } }, {})
  local b = AppleBehave.compose(rest, { { pivot = { 0, 1, 0 }, axis = { 1, 0, 0 }, degrees = 90 }, { pivot = { 1, 0, 0 }, axis = { 0, 0, 1 }, degrees = 90 } }, {})
  local same = true
  for i = 1, 12 do if math.abs(a[i] - b[i]) > 1e-6 then same = false end end
  eq(same, false, "rotations about different hinges do not commute, so the order written is the order applied")
end)

local function trigger(on, extra) local t = { on = on }; if extra then for k, v in extra do t[k] = v end end; return t end
local function swing(extra) local r = { verb = "swing", target = { segs = { "Lid" } }, hinge = { pivot = { 0, -1, -1 }, axis = "x" }, angle = -100 }; if extra then for k, v in extra do r[k] = v end end; return r end

spec("check: a minimal swing gets its defaults", function()
  local rec, why = AppleBehave.check(swing())
  eq(why, nil); eq(rec ~= nil, true)
  eq(rec.verb, "swing"); eq(rec.id, "swing"); eq(rec.seconds, 0.6); eq(rec.ease, "Sine")
  eq(rec.trigger.on, "click"); eq(rec.mode, "toggle"); eq(rec.delay, 0); eq(#rec["with"], 0)
  eq(rec.hinge.axis, "x"); eq(rec.hinge.pivot[3], -1)
end)

spec("check: numbers are clamped, never trusted", function()
  local rec = AppleBehave.check(swing({ angle = 9999, seconds = 0, hold = 99999, delay = -4 }))
  eq(rec.angle, 360); eq(rec.seconds, 0.05); eq(rec.hold, 600); eq(rec.delay, 0)
  local spin = AppleBehave.check({ verb = "spin", speed = 1e9, hinge = { pivot = { 5, -5, 0 } } })
  eq(spin.speed, 1440); eq(spin.hinge.pivot[1], 1); eq(spin.hinge.pivot[2], -1); eq(spin.trigger.on, "auto")
end)

spec("check: what would break the runtime is refused with a reason", function()
  local bad = {
    { { verb = "dance" }, "unknown verb" },
    { "swing", "not a table" },
    { swing({ angle = 0 }), "angle" },
    { swing({ angle = 0 / 0 }), "angle" },
    { swing({ angle = math.huge }), "angle" },
    { swing({ hinge = { axis = "w" } }), "hinge.axis" },
    { swing({ hinge = { pivot = { 0, 0 } } }), "hinge.pivot" },
    { swing({ ease = "Wobbly" }), "ease" },
    { swing({ mode = "forever" }), "mode" },
    { swing({ trigger = { on = "hover" } }), "trigger" },
    { swing({ id = "has space" }), "id" },
    { swing({ target = { segs = { "" } } }), "bad name" },
    { swing({ target = "Lid" }), "not a path" },
    { swing({ ["with"] = "Latch" }), "with" },
    { { verb = "slide", offset = { 0, 0, 0 } }, "offset" },
    { { verb = "spin", speed = 0 }, "speed" },
    { { verb = "sound" }, "needs" },
    { { verb = "sound", soundId = "http://x" }, "soundId" },
    { { verb = "sound", soundId = "rbxassetid://12", volume = "loud" }, "numbers" },
    { { verb = "light", color = { 2, 0, 0 } }, nil },
  }
  for i, c in bad do
    local rec, why = AppleBehave.check(c[1])
    if c[2] == nil then
      eq(rec ~= nil, true, "case " .. i .. " is clamped, not refused")
    else
      eq(rec, nil, "case " .. i .. " was accepted")
      eq(string.find(tostring(why), c[2], 1, true) ~= nil, true, "case " .. i .. " reason " .. tostring(why))
    end
  end
end)

spec("check: a launcher always listens for touch; sounds and lights carry their parameters", function()
  local b = AppleBehave.check({ verb = "bounce", trigger = { on = "click" }, direction = { 0, 2, 0 } })
  eq(b.trigger.on, "touch"); eq(b.power, 80); eq(b.mode, "pulse"); eq(b.direction[2], 1, "a direction is clamped to a unit box")
  local s = AppleBehave.check({ verb = "sound", soundId = "rbxassetid://5", loop = true, volume = 9, trigger = { on = "near", reach = 20 } })
  eq(s.volume, 4); eq(s.loop, true); eq(s.mode, "hold"); eq(s.trigger.reach, 20)
  local l = AppleBehave.check({ verb = "light", glow = true })
  eq(l.glow, true); eq(l.brightness, 2); eq(l.color[1], 1)
  local f = AppleBehave.check({ verb = "fade" })
  eq(f.to, 1); eq(f.collide, true)
  local e = AppleBehave.check({ verb = "emit", count = 5000 })
  eq(e.count, 500); eq(e.sustain, false)
end)
`;

// ------------------------------------------------------------------------------------------------ layer 3

// A small stand-in for the parts of Roblox the glue touches. It is a MOCK: it proves the wiring under these semantics only.
const MOCK = String.raw`
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

const GLUE = String.raw`
local function lidScene(extra)
  local w = newWorld()
  local base = w.part("Base", 0, 0.5, 0, 4, 1, 3)
  local lid = w.part("Lid", 0, 1.2, 0, 4, 0.4, 3)
  local model = w.model("Thing", base, lid)
  local rec = { id = "open", verb = "swing", target = ref("Lid"), hinge = { pivot = { 0, -1, -1 }, axis = "x" }, angle = -90, seconds = 0.5, ease = "Linear" }
  if extra then for k, v in extra do rec[k] = v end end
  w.config(model, { rec })
  return w, model, lid, base
end

spec("swing on click: the lid turns about its hinge edge, rests again on the next click, and the part is anchored", function()
  local w, model, lid = lidScene()
  local before = rest(lid)
  lid.Anchored = false
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  eq(lid.Anchored, true, "a moving part is anchored")
  local cd = lid:FindFirstChildWhichIsA("ClickDetector")
  eq(cd ~= nil, true, "a ClickDetector was put on the lid")
  w.run(0.3)
  nearAll(rest(lid), before, "nothing moves before the click")
  cd.MouseClick:Fire({ Name = "someone" })
  w.run(0.25)
  local mid = rest(lid)
  eq(mid[2] > before[2] + 0.1, true, "half way up")
  w.run(0.5)
  local want = AppleBehave.swingComponents(before, AppleBehave.boxPoint(before, { 4, 0.4, 3 }, { 0, -1, -1 }), { 1, 0, 0 }, -90)
  nearAll(rest(lid), want, "open", 1e-6)
  eq(model:GetAttribute("AppleBehave_open"), true, "the state is published as an attribute")
  w.run(0.5)
  cd.MouseClick:Fire({ Name = "someone" })
  w.run(0.7)
  nearAll(rest(lid), before, "closed again", 1e-6)
  eq(model:GetAttribute("AppleBehave_open"), false)
end)

spec("swing: a second click inside the cooldown is ignored", function()
  local w, model, lid = lidScene()
  w.start()
  local cd = lid:FindFirstChildWhichIsA("ClickDetector")
  cd.MouseClick:Fire({}); cd.MouseClick:Fire({})
  w.run(1)
  eq(model:GetAttribute("AppleBehave_open"), true, "two quick clicks are one")
end)

spec("swing: a weld between the lid and the base is switched off, one between two moving parts is left alone", function()
  local w = newWorld()
  local base = w.part("Base", 0, 0.5, 0, 4, 1, 3)
  local lid = w.part("Lid", 0, 1.2, 0, 4, 0.4, 3)
  local latch = w.part("Latch", 0, 1.5, 1.4, 0.4, 0.4, 0.4)
  local model = w.model("Thing", base, lid, latch)
  local toBase = make("Weld", "Hinge"); toBase.Part0 = base; toBase.Part1 = lid; toBase.Parent = lid
  local together = make("WeldConstraint", "Hold"); together.Part0 = lid; together.Part1 = latch; together.Parent = lid
  w.config(model, { { id = "open", verb = "swing", target = ref("Lid"), ["with"] = { ref("Latch") }, hinge = { pivot = { 0, -1, -1 }, axis = "x" }, angle = -90, seconds = 0.5, ease = "Linear" } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  eq(toBase.Enabled, false, "the weld to a part that stays still would fight the move")
  eq(together.Enabled, true, "a weld between two parts that move together is fine")
  lid:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(1)
  local l = rest(latch)
  eq(math.abs(l[3] - 1.4) > 0.5 or math.abs(l[2] - 1.5) > 0.5, true, "the latch swung with the lid")
end)

spec("a prompt trigger: one ProximityPrompt carries the text, and two behaviours share the same trigger", function()
  local w = newWorld()
  local lid = w.part("Lid", 0, 1.2, 0, 4, 0.4, 3)
  local model = w.model("Thing", lid)
  w.config(model, {
    { id = "open", verb = "swing", target = ref("Lid"), hinge = { pivot = { 0, -1, -1 }, axis = "x" }, angle = -90, seconds = 0.5, ease = "Linear", trigger = { on = "prompt", text = "Open" } },
    { id = "creak", verb = "sound", soundId = "rbxassetid://123", target = ref("Lid"), trigger = { on = "prompt" } },
  })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local prompts = {}
  for _, c in lid._kids do if c.ClassName == "ProximityPrompt" then table.insert(prompts, c) end end
  eq(#prompts, 1, "one prompt for two behaviours")
  eq(prompts[1].ActionText, "Open")
  prompts[1].Triggered:Fire({})
  w.run(0.8)
  eq(model:GetAttribute("AppleBehave_open"), true)
  local sounds = {}
  for _, c in lid._kids do if c.ClassName == "Sound" then table.insert(sounds, c) end end
  eq(#sounds >= 1, true, "the sound fired from the same trigger")
  eq(sounds[1].SoundId, "rbxassetid://123")
end)

spec("a one-shot sound: a fresh Sound each time, played once, removed when it ends", function()
  local w = newWorld()
  local pad = w.part("Pad", 0, 0.5, 0)
  local model = w.model("Switch", pad)
  w.config(model, { { id = "chirp", verb = "sound", soundId = "rbxassetid://77", target = ref(), volume = 0.8, pitch = 1.5, variance = 0, range = 30, trigger = { on = "click" } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local cd = model:FindFirstChildWhichIsA("ClickDetector")
  eq(cd ~= nil, true, "a model-level click goes on the model")
  cd.MouseClick:Fire({})
  local s
  for _, c in pad._kids do if c.ClassName == "Sound" then s = c end end
  eq(s ~= nil, true, "the sound lives on the model's only part")
  eq(s.Volume, 0.8); near(s.PlaybackSpeed, 1.5); eq(s.RollOffMaxDistance, 30); eq(s.Looped, false); eq(s.plays, 1)
  s.Ended:Fire()
  eq(s.Parent, nil, "removed after it ends")
end)

spec("a looped sound toggles on and off with a fade, and an existing Sound is cloned, not borrowed", function()
  local w = newWorld()
  local body = w.part("Body", 0, 0.5, 0)
  local own = make("Sound", "Tune"); own.SoundId = "rbxassetid://9"; own.Parent = body
  local model = w.model("Player", body)
  w.config(model, { { id = "music", verb = "sound", sound = ref("Body", "Tune"), loop = true, volume = 1, fade = 0.5, target = ref("Body"), trigger = { on = "click" } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local cd = body:FindFirstChildWhichIsA("ClickDetector")
  cd.MouseClick:Fire({})
  w.run(1)
  local playing
  for _, c in body._kids do if c ~= own and c.ClassName == "Sound" then playing = c end end
  eq(playing ~= nil, true, "a clone plays")
  eq(own.IsPlaying, false, "the original is untouched")
  eq(playing.IsPlaying, true); eq(playing.Looped, true); near(playing.Volume, 1, "faded in", 1e-6)
  w.run(0.5)
  cd.MouseClick:Fire({})
  w.run(1)
  eq(playing.IsPlaying, false, "stopped after fading out")
end)

spec("a light behaviour turns the lights under the target on and off and glows; with none it makes one", function()
  local w = newWorld()
  local bulb = w.part("Bulb", 0, 3, 0, 1, 1, 1)
  local lamp = make("PointLight", "Lamp"); lamp.Brightness = 3; lamp.Parent = bulb
  local bare = w.part("Bare", 5, 3, 0, 1, 1, 1)
  local model = w.model("Fixture", bulb, bare)
  w.config(model, {
    { id = "lamp", verb = "light", target = ref("Bulb"), glow = true, seconds = 0.2, trigger = { on = "click" } },
    { id = "made", verb = "light", target = ref("Bare"), color = { 1, 0, 0 }, brightness = 5, range = 20, seconds = 0, trigger = { on = "click" } },
  })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  eq(lamp.Enabled, false, "lights start off")
  local made = bare:FindFirstChildWhichIsA("Light")
  eq(made ~= nil, true, "a light was made"); eq(made.Range, 20); eq(made.Color.R, 1); eq(made.Enabled, false)
  bulb:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  bare:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(0.5)
  eq(lamp.Enabled, true); near(lamp.Brightness, 3, "back at its own brightness", 1e-6); eq(bulb.Material, "Neon", "glow")
  eq(made.Enabled, true); near(made.Brightness, 5)
  w.run(0.5)
  bulb:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(0.5)
  eq(lamp.Enabled, false); eq(bulb.Material, "Plastic", "glow ends")
end)

spec("spin and bob start on their own, compose on the same part, and leave the pose stable", function()
  local w = newWorld()
  local coin = w.part("Coin", 0, 5, 0, 2, 0.3, 2)
  local model = w.model("Pickup", coin)
  w.config(model, {
    { id = "turn", verb = "spin", target = ref("Coin"), speed = 180, hinge = { axis = "y" } },
    { id = "float", verb = "bob", target = ref("Coin"), amount = 1, period = 2 },
  })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local top, bottom = -math.huge, math.huge
  local turned = false
  for _ = 1, 150 do
    w.step(1 / 30)
    local c = rest(coin)
    top = math.max(top, c[2]); bottom = math.min(bottom, c[2])
    if math.abs(c[4] - 1) > 0.05 then turned = true end
  end
  eq(turned, true, "it spins")
  eq(top > 5.5 and bottom < 4.5, true, "it bobs about its rest height (" .. top .. ", " .. bottom .. ")")
  eq(coin.Anchored, true)
end)

spec("auto swing goes back and forth, pausing at each end", function()
  local w = newWorld()
  local flag = w.part("Flag", 0, 5, 0, 1, 3, 0.2)
  local model = w.model("Banner", flag)
  w.config(model, { { id = "wave", verb = "swing", target = ref("Flag"), hinge = { pivot = { 0, 1, 0 }, axis = "z" }, angle = 30, seconds = 1, hold = 0.5, ease = "Linear", trigger = { on = "auto" } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local seen = {}
  for _ = 1, 150 do w.step(1 / 30); table.insert(seen, rest(flag)[1]) end
  local lo, hi = math.huge, -math.huge
  for _, x in seen do lo = math.min(lo, x); hi = math.max(hi, x) end
  eq(hi - lo > 0.5, true, "it swings out")
  eq(math.abs(seen[#seen] - seen[1]) < hi - lo, true, "and is not stuck at one end")
  local turnedBack = false
  local peak = false
  for i = 2, #seen do
    if seen[i] > seen[i - 1] + 1e-6 then peak = true end
    if peak and seen[i] < seen[i - 1] - 1e-6 then turnedBack = true end
  end
  eq(turnedBack, true, "it came back")
end)

spec("slide goes by an offset in the target's own frame and back", function()
  local w = newWorld()
  local panel = w.part("Panel", 10, 2, 0, 4, 4, 0.5)
  panel.CFrame = CFrame.new(10, 2, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0) -- turned: local +X is world -Z
  local model = w.model("Gate", panel)
  w.config(model, { { id = "open", verb = "slide", target = ref("Panel"), offset = { 3, 0, 0 }, seconds = 0.4, ease = "Linear", trigger = { on = "click" } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  panel:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(0.6)
  local c = rest(panel)
  near(c[1], 10, "x unchanged", 1e-6); near(c[3], -3, "moved along local +X = world -Z", 1e-6)
end)

spec("pulse: on at the touch, off after hold seconds; touching again extends it", function()
  local w = newWorld()
  local plate = w.part("Plate", 0, 0.1, 0, 4, 0.2, 4)
  local door = w.part("Door", 8, 3, 0, 1, 6, 6)
  local model = w.model("Yard", plate, door)
  w.config(model, { { id = "open", verb = "fade", target = ref("Door"), to = 1, seconds = 0.1, trigger = { on = "touch", at = ref("Plate") }, mode = "pulse", hold = 1 } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local p = w.player("Pat", 100, 0, 0)
  plate.Touched:Fire(p.root)
  w.run(0.3)
  near(door.Transparency, 1, "faded", 1e-6); eq(door.CanCollide, false, "and not solid")
  w.run(0.5)
  plate.Touched:Fire(p.root)
  w.run(0.8)
  near(door.Transparency, 1, "still faded: the second touch extended the hold", 1e-6)
  w.run(1.0)
  near(door.Transparency, 0, "back", 1e-6); eq(door.CanCollide, true, "solid again")
end)

spec("touch by something that is not a character does nothing", function()
  local w = newWorld()
  local plate = w.part("Plate", 0, 0.1, 0)
  local door = w.part("Door", 8, 3, 0)
  local model = w.model("Yard", plate, door)
  w.config(model, { { id = "open", verb = "fade", target = ref("Door"), seconds = 0.1, trigger = { on = "touch", at = ref("Plate") } } })
  w.start()
  plate.Touched:Fire(w.part("Crate", 0, 5, 0))
  w.run(0.5)
  near(door.Transparency, 0, "no humanoid, no effect")
end)

spec("near: on while a player is within reach, off when they leave", function()
  local w = newWorld()
  local lamp = w.part("Lamp", 0, 3, 0, 1, 1, 1)
  local model = w.model("Post", lamp)
  w.config(model, { { id = "glow", verb = "light", target = ref("Lamp"), seconds = 0, trigger = { on = "near", reach = 10 } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local lampLight = lamp:FindFirstChildWhichIsA("Light")
  local p = w.player("Far", 50, 3, 0)
  w.run(0.5)
  eq(lampLight.Enabled, false, "far away")
  p.root.CFrame = CFrame.new(4, 3, 0)
  w.run(0.5)
  eq(lampLight.Enabled, true, "near")
  p.root.CFrame = CFrame.new(40, 3, 0)
  w.run(0.5)
  eq(lampLight.Enabled, false, "gone")
end)

spec("bounce launches whoever touches it and respects its cooldown", function()
  local w = newWorld()
  local pad = w.part("Pad", 0, 0.5, 0, 6, 1, 6)
  local model = w.model("Spring", pad)
  w.config(model, { { id = "launch", verb = "bounce", target = ref("Pad"), power = 90, cooldown = 1 } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local p = w.player("Jo", 0, 3, 0)
  p.root.AssemblyLinearVelocity = Vector3.new(5, -20, 0)
  pad.Touched:Fire(p.root)
  near(p.root.AssemblyLinearVelocity.Y, 90, "straight up", 1e-6); near(p.root.AssemblyLinearVelocity.X, 5, "sideways speed is kept", 1e-6)
  eq(p.hum.state, "Jumping")
  p.root.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
  pad.Touched:Fire(p.root)
  near(p.root.AssemblyLinearVelocity.Y, 0, "inside the cooldown", 1e-6)
  w.run(1.2)
  pad.Touched:Fire(p.root)
  near(p.root.AssemblyLinearVelocity.Y, 90, "after it", 1e-6)
end)

spec("emit bursts the emitters under the target, or switches them on and off when sustained", function()
  local w = newWorld()
  local vent = w.part("Vent", 0, 1, 0)
  local em = make("ParticleEmitter", "Puff"); em.Parent = vent
  local model = w.model("Stack", vent)
  w.config(model, { { id = "puff", verb = "emit", target = ref("Vent"), count = 15, trigger = { on = "click" } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  vent:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  eq(em.emitted, 15)
  local w2 = newWorld()
  local vent2 = w2.part("Vent", 0, 1, 0)
  local em2 = make("ParticleEmitter", "Puff"); em2.Parent = vent2
  local model2 = w2.model("Stack", vent2)
  w2.config(model2, { { id = "steady", verb = "emit", target = ref("Vent"), sustain = true, trigger = { on = "click" } } })
  w2.start()
  eq(em2.Enabled, false, "sustained emitters start off")
  vent2:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  eq(em2.Enabled, true)
end)

spec("once: on at the first trigger and it stays", function()
  local w = newWorld()
  local door = w.part("Door", 0, 3, 0)
  local model = w.model("Vault", door)
  w.config(model, { { id = "open", verb = "fade", target = ref("Door"), seconds = 0.1, mode = "once", trigger = { on = "click", cooldown = 0 } } })
  w.start()
  local cd = door:FindFirstChildWhichIsA("ClickDetector")
  cd.MouseClick:Fire({}); w.run(0.3); cd.MouseClick:Fire({}); w.run(0.3)
  near(door.Transparency, 1, "still gone", 1e-6)
end)

spec("delay holds a behaviour back after its trigger", function()
  local w = newWorld()
  local door = w.part("Door", 0, 3, 0)
  local model = w.model("Vault", door)
  w.config(model, { { id = "open", verb = "fade", target = ref("Door"), seconds = 0.05, delay = 1, trigger = { on = "click" } } })
  w.start()
  door:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(0.5); near(door.Transparency, 0, "not yet")
  w.run(1.0); near(door.Transparency, 1, "after the delay", 1e-6)
end)

spec("a bad record is skipped with a warning and the others still run; a missing target warns, never throws", function()
  local w = newWorld()
  local door = w.part("Door", 0, 3, 0)
  local model = w.model("Vault", door)
  w.config(model, {
    { verb = "dance" },
    { id = "ghost", verb = "fade", target = ref("Nowhere"), trigger = { on = "click" } },
    { id = "ok", verb = "fade", target = ref("Door"), seconds = 0.05, trigger = { on = "click" } },
    { id = "empty", verb = "emit", target = ref("Door"), trigger = { on = "click" } },
    { id = "never", verb = "sound", soundId = "rbxassetid://1", target = ref("Door"), trigger = { on = "auto" } },
  })
  w.start()
  eq(#warnings, 4, table.concat(warnings, " | "))
  eq(string.find(warnings[1], "unknown verb", 1, true) ~= nil, true)
  eq(string.find(warnings[2], "target not found", 1, true) ~= nil, true)
  eq(string.find(table.concat(warnings, " "), "auto", 1, true) ~= nil, true, "a one-shot cannot start itself")
  door:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(0.3)
  near(door.Transparency, 1, "the good one ran", 1e-6)
end)

spec("duplicate-named parts are addressed by their nth: the second Panel moves, the first does not", function()
  local w = newWorld()
  local a, b = w.part("Panel", 0, 1, 0), w.part("Panel", 5, 1, 0)
  local model = w.model("Wall", a, b)
  w.config(model, { { id = "slide", verb = "slide", target = { segs = { { name = "Panel", nth = 2 } } }, offset = { 0, 3, 0 }, seconds = 0.1, ease = "Linear", trigger = { on = "click" } } })
  w.start()
  eq(#warnings, 0, table.concat(warnings, "; "))
  b:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
  w.run(0.4)
  near(rest(a)[2], 1, "the first is where it was", 1e-6); near(rest(b)[2], 4, "the second moved", 1e-6)
end)

spec("a model added while the game runs is wired when it arrives; an absolute path reaches outside the model", function()
  local w = newWorld()
  w.start()
  local door = w.part("Door", 0, 3, 0)
  local siren = make("Sound", "Siren"); siren.SoundId = "rbxassetid://5"
  local sfx = make("Folder", "Sfx"); siren.Parent = sfx; sfx.Parent = w.Workspace
  local model = w.model("Late", door)
  w.config(model, { { id = "alarm", verb = "sound", sound = { abs = true, segs = { "Workspace", "Sfx", "Siren" } }, target = ref("Door"), trigger = { on = "click" } } })
  w.flush()
  eq(#warnings, 0, table.concat(warnings, "; "))
  local cd = door:FindFirstChildWhichIsA("ClickDetector")
  eq(cd ~= nil, true, "wired on arrival")
  cd.MouseClick:Fire({})
  local n = 0
  for _, c in door._kids do if c.ClassName == "Sound" then n += 1 end end
  eq(n, 1, "a clone of the Sound outside the model played from the door")
end)

spec("a model's wiring runs once even if the module is seen again", function()
  local w, model, lid = lidScene()
  w.start()
  local cfg = model:FindFirstChild("AppleBehaviours")
  cfg.Parent = nil; cfg.Parent = model
  w.flush()
  local detectors = 0
  for _, c in lid._kids do if c.ClassName == "ClickDetector" then detectors += 1 end end
  eq(detectors, 1)
end)
`;

test('AppleBehave glue passes its luau specs against the mock Roblox API', { skip }, () => {
  const out = runLuau(`${HARNESS}\nlocal AppleBehave = (function()\n${MODULE}\nend)()\n${MOCK}\n${GLUE}\nreport("behave glue")\n`, 'glue');
  assert.match(out, /behave glue: \d+ passed$/m, out);
});

test('AppleBehave pure core passes its luau specs', { skip }, () => {
  const out = runLuau(`${HARNESS}\nlocal AppleBehave = (function()\n${MODULE}\nend)()\n${PURE}\nreport("behave pure")\n`, 'pure');
  assert.match(out, /behave pure: \d+ passed$/m, out);
});

