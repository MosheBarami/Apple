/**
 * Plugin 2.0, EXECUTED: grep / glob / list (ops/Search.luau), serialize / deserialize (ops/Serialize.luau),
 * run_tests's edit-time refusals (ops/Tests.luau), the widened typed-value decoder, and the UTF-8
 * sanitizer every payload passes through (Bridge.luau). The real modules in the real command engine,
 * against the shared Studio mock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE, opFamiliesChunk } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');
const BRIDGE = readFileSync(join(HERE, '..', 'src', 'Bridge.luau'), 'utf8');
const PLAY_CHECK = readFileSync(join(HERE, '..', 'src', 'PlayCheck.luau'), 'utf8');

// Engine datatypes the decoder builds and the shared prelude omits.
const ENGINE = String.raw`
PhysicalProperties = { new = function(d, f, e, fw, ew) return { __type = "PhysicalProperties", Density = d, Friction = f, Elasticity = e, FrictionWeight = fw or 1, ElasticityWeight = ew or 1 } end }
Enum.NormalId = { Top = "Top", Bottom = "Bottom", Left = "Left", Right = "Right", Back = "Back", Front = "Front" }
Enum.Axis = { X = "X", Y = "Y", Z = "Z" }
Faces = { new = function(...) local f = { __type = "Faces" }; for _, n in { ... } do f[n] = true end; return f end }
Axes = { new = function(...) local a = { __type = "Axes" }; for _, n in { ... } do a[n] = true end; return a end }
`;

const SPEC = String.raw`
local c = Commands.new({ game = game, opFamilies = OP_FAMILIES_UNDER_TEST, permissions = PERMISSIONS_UNDER_TEST, playCheck = PlayCheck })
local function run(id, op, allow) return c:execute(id, op, allow == true) end
local function byOp(report, wanted) for _, item in report.operations do if item.op == wanted then return item end end end

local mods = Instance.new("Folder"); mods.Name = "Modules"; mods.Parent = services.ReplicatedStorage
local coins = Instance.new("ModuleScript"); coins.Name = "Coins"; coins.Source = "local Coins = {}\n-- award coins\nfunction Coins.award(player, n)\n\treturn n * 2\nend\nreturn Coins"; coins.Parent = mods
local spec1 = Instance.new("ModuleScript"); spec1.Name = "Coins.spec"; spec1.Source = "return function() end"; spec1.Parent = mods
local server = Instance.new("Script"); server.Name = "Main"; server.Source = "local Coins = require(game.ReplicatedStorage.Modules.Coins)\nprint(Coins.award(nil, 3))"; server.Parent = services.ServerScriptService
local door = Instance.new("Model"); door.Name = "FrontDoor"; door.Parent = workspace
local doorPart = Instance.new("Part"); doorPart.Name = "Panel"; doorPart.Parent = door
local backDoor = Instance.new("Part"); backDoor.Name = "DoorBack"; backDoor.Parent = workspace

spec("the 2.0 families install and report their operations", function()
    eq(#c.opFamilyErrors, 0, "family errors: " .. table.concat(c.opFamilyErrors, " | "))
    local report = Commands.capabilities(c)
    for _, name in { "grep", "glob", "list", "serialize", "deserialize", "run_tests" } do
        local entry = byOp(report, name)
        eq(entry ~= nil and entry.status, "supported", name)
    end
end)

spec("grep finds text with context, is case-insensitive by default, and honours include/exclude globs", function()
    local r = run("g1", { op = "grep", query = "COINS.AWARD", context = 1 })
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 2, "both scripts mention it")
    local inModule = nil
    for _, m in r.data.matches do if m.path == "game.ReplicatedStorage.Modules.Coins" then inModule = m end end
    eq(inModule ~= nil, true); eq(inModule.line, 3); eq(inModule.before[1], "-- award coins"); eq(inModule.after[1], "\treturn n * 2")
    local cased = run("g2", { op = "grep", query = "COINS.AWARD", caseSensitive = true })
    eq(cased.data.count, 0)
    local only = run("g3", { op = "grep", query = "Coins", include = "ServerScriptService/**" })
    eq(only.ok, true, tostring(only.error)); for _, m in only.data.matches do has(m.path, "ServerScriptService") end
    local excluded = run("g4", { op = "grep", query = "Coins", exclude = { "ReplicatedStorage/**", "ServerScriptService/Main" } })
    eq(excluded.data.count, 0)
    local pattern = run("g5", { op = "grep", query = "return%s+n%s*%*", pattern = true })
    eq(pattern.data.count, 1); eq(pattern.data.matches[1].line, 4)
    local bad = run("g6", { op = "grep", query = "[unclosed", pattern = true })
    eq(bad.ok, false); has(bad.error, "Lua pattern")
end)

spec("glob matches slash paths with * and **, filters by class, and returns canonical paths", function()
    local r = run("gl1", { op = "glob", pattern = "Workspace/**/*Door*" })
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 2)
    local parts = run("gl2", { op = "glob", pattern = "Workspace/**", className = "BasePart" })
    local names = {}
    for _, m in parts.data.matches do names[m.path] = m.class end
    eq(names["game.Workspace.FrontDoor.Panel"], "Part"); eq(names["game.Workspace.DoorBack"], "Part"); eq(names["game.Workspace.FrontDoor"], nil)
    local specs = run("gl3", { op = "glob", pattern = "ReplicatedStorage/**/*.spec" })
    eq(specs.data.count, 1); eq(specs.data.matches[1].path, 'game.ReplicatedStorage.Modules["Coins.spec"]')
end)

spec("list returns children with class and counts", function()
    local r = run("l1", { op = "list", path = "game.ReplicatedStorage.Modules" })
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 2)
    eq(r.data.children[1].class, "ModuleScript"); eq(r.data.children[1].children, 0)
end)

spec("serialize captures writable properties, source and internal references; deserialize recreates them as one undo step", function()
    local rig = Instance.new("Model"); rig.Name = "Rig"; rig.Parent = workspace
    local a = Instance.new("Part"); a.Name = "A"; a.Size = v3(4, 1, 2); a.Anchored = true; a.Parent = rig
    local b = Instance.new("Part"); b.Name = "B"; b.Parent = rig
    local weld = Instance.new("WeldConstraint"); weld.Name = "Join"; weld.Part0 = a; weld.Part1 = b; weld.Parent = rig
    local code = Instance.new("Script"); code.Name = "Spin"; code.Source = "print('spin')"; code.Parent = rig
    rig:SetAttribute("Speed", 4)
    local s = run("s1", { op = "serialize", path = "game.Workspace.Rig" })
    eq(s.ok, true, tostring(s.error))
    local root = s.data.root
    eq(root.class, "Model"); eq(root.attributes.Speed.v, 4); eq(#root.children, 4)
    local joinNode, partA, spin = nil, nil, nil
    for _, child in root.children do
        if child.name == "Join" then joinNode = child elseif child.name == "A" then partA = child elseif child.name == "Spin" then spin = child end
    end
    eq(partA.props.Size.v[1], 4); eq(partA.props.Anchored.v, true)
    eq(joinNode.props.Part0.rel, "A", "an internal reference is also given relative to the root")
    eq(spin.source, "print('spin')")

    local target = Instance.new("Folder"); target.Name = "Copies"; target.Parent = workspace
    local before = #history.log
    local d = run("d1", { op = "deserialize", parent = "game.Workspace.Copies", node = root }, true)
    eq(d.ok, true, tostring(d.error)); eq(d.data.instances, 5); eq(d.data.scripts, 1)
    eq(#history.log, before + 2, "one recording"); eq(history.log[before + 2], "Commit")
    local copy = target:FindFirstChild("Rig")
    eq(copy.A.Size.X, 4); eq(copy:GetAttribute("Speed"), 4); eq(copy.Spin.Source, "print('spin')")
    eq(copy.Join.Part0, copy.A, "the copy's weld joins the copy's parts, not the original's"); eq(copy.Join.Part1, copy.B)

    local refused = run("d2", { op = "deserialize", parent = "game.Workspace.Copies", node = { class = "HttpService", name = "Nope" } }, true)
    eq(refused.ok, false); has(refused.error, "deny list")
    local sourceRefused = run("d3", { op = "deserialize", parent = "game.Workspace.Copies", node = { class = "Script", name = "Evil", source = "loadstring('x')()" } }, true)
    eq(sourceRefused.ok, false); has(sourceRefused.error, "dynamic source compilation")
    eq(target:FindFirstChild("Nope"), nil); eq(target:FindFirstChild("Evil"), nil)
    local gated = run("d4", { op = "deserialize", parent = "game.Workspace.Copies", node = root }, false)
    eq(gated.ok, false); eq(gated.remedy, "reconnect_studio")
    rig:Destroy(); target:Destroy()
end)

spec("run_tests refuses, before any session, when TestEZ is not in the place, and needs the consent gate", function()
    local gated = run("t0", { op = "run_tests" }, false)
    eq(gated.ok, false); eq(gated.remedy, "reconnect_studio")
    local r = run("t1", { op = "run_tests" }, true)
    eq(r.ok, false); has(r.error, "TestEZ is not in this place")
end)

spec("run_tests runs the specs in a Test session through a temporary runner, reports counts and failures, and removes the runner", function()
    local testez = Instance.new("ModuleScript"); testez.Name = "TestEZ"; testez.Parent = services.ReplicatedStorage
    local seen = nil
    services.StudioTestService.onSession = function(args)
        seen = args
        local runner = services.ServerScriptService:FindFirstChild("StudPilotRunTests")
        eq(runner ~= nil, true, "the runner is in the place while the session runs")
        has(runner.Source, "TestBootstrap:run")
        return { nonce = args.nonce, harness = 1, tests = 1, stage = "done", success = 3, failure = 1, skipped = 0,
            failures = { { name = "Coins awards double", errors = { "expected 6, got 5" } } }, errors = { "expected 6, got 5" } }
    end
    local r = run("t2", { op = "run_tests", timeoutSeconds = 20 }, true)
    services.StudioTestService.onSession = nil
    eq(r.ok, true, tostring(r.error))
    eq(r.data.passed, 3); eq(r.data.failed, 1); eq(r.data.specs, 1); eq(r.data.failures[1].name, "Coins awards double")
    eq(r.data.runnerRemoved, true); eq(services.ServerScriptService:FindFirstChild("StudPilotRunTests"), nil)
    eq(seen.testez, "ReplicatedStorage/TestEZ"); eq(seen.deadline, 20); eq(seen.studpilotPlayCheck, 1, "the plugin watchdog covers this session too")
    local timedOut = nil
    services.StudioTestService.onSession = function(args) return { nonce = args.nonce, harness = 1, tests = 1, stage = "deadline", success = 1, failure = 0, skipped = 0 } end
    timedOut = run("t3", { op = "run_tests" }, true)
    services.StudioTestService.onSession = nil
    eq(timedOut.ok, true, tostring(timedOut.error)); eq(timedOut.data.timedOut, true, "partial results on timeout"); eq(timedOut.data.passed, 1)
    testez:Destroy()
end)

spec("the decoder takes every settable value type: PhysicalProperties, Faces, Axes, enum by name or number, bare-position CFrame", function()
    local made = run("v1", { op = "create_instances", items = {
        { className = "Part", name = "Typed", parent = "game.Workspace", props = {
            CustomPhysicalProperties = { t = "PhysicalProperties", v = { 0.7, 0.3, 0.5 } },
            CFrame = { t = "CFrame", v = { 1, 2, 3 } },
            Material = { t = "EnumItem", v = "Rock" },
        } },
        { className = "Handles", name = "H", parent = "game.Workspace", props = { Faces = { t = "Faces", v = { "Top", "Front" } } } },
        { className = "ArcHandles", name = "AH", parent = "game.Workspace", props = { Axes = { t = "Axes", v = { "X", "Z" } } } },
    } }, true)
    eq(made.ok, true, tostring(made.error))
    local part = workspace:FindFirstChild("Typed")
    eq(part.CustomPhysicalProperties.Density, 0.7); eq(part.CFrame.Position.Y, 2); eq(part.Material, "Enum.Material.Rock")
    eq(workspace:FindFirstChild("H").Faces.Front, true); eq(workspace:FindFirstChild("AH").Axes.Z, true)
    local badFace = run("v2", { op = "set_props", path = "game.Workspace.H", props = { Faces = { t = "Faces", v = { "Sideways" } } } }, true)
    eq(badFace.ok, false); has(badFace.error, "face name")
    part:Destroy(); workspace:FindFirstChild("H"):Destroy(); workspace:FindFirstChild("AH"):Destroy()
end)

spec("a snapshot leaves out values equal to a fresh instance's, and the round trip still restores them", function()
    local root = Instance.new("Folder"); root.Name = "Defaults"; root.Parent = workspace
    local p = Instance.new("Part"); p.Name = "P"; p.Transparency = 0.5; p.Parent = root
    local snap = run("sd", { op = "snapshot", root = "game.Workspace.Defaults", includeScripts = true, checkpointId = "cp-defaults" }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true)
    local node = snap.data.node.children[1]
    eq(node.props.Transparency.v, 0.5); eq(node.props.Locked, nil, "Locked=false is Instance.new's own value")
    p.Transparency = 1
    local restored = c:execute("sr", { op = "restore", root = "game.Workspace.Defaults", checkpointId = "cp-defaults", snapshot = snap.data }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error)); eq(root:FindFirstChild("P").Transparency, 0.5)
    root:Destroy()
end)

report()
`;

const BRIDGE_SPEC = String.raw`
local clean = cleanText("ok \255 bytes \u{263A}")
eq(utf8.len(clean) ~= nil, true, "result is UTF-8")
has(clean, "ok "); has(clean, "\u{FFFD}"); has(clean, "\u{263A}")
eq(cleanText("plain"), "plain")
local deep = sanitize({ a = { "\200x" }, ["k\255"] = 1 }, 0)
eq(utf8.len(deep.a[1]) ~= nil, true)
for key in deep do eq(utf8.len(key) ~= nil, true) end
print("bridge-sanitize: ok")
`;

const available = (() => { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } })();
const skip = available ? false : 'luau is not on PATH';

test('plugin 2.0 ops pass the executable Studio-mock suite', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'studpilot-ops-v2-'));
  const file = join(dir, 'ops-v2.gen.luau');
  writeFileSync(file, `${PRELUDE}\n${ENGINE}\n${opFamiliesChunk()}local PlayCheck = (function()\n${PLAY_CHECK}\nend)()\nlocal Commands = (function()\n${COMMANDS}\nend)()\n${SPEC}`);
  let output;
  try { output = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (error) { output = String(error.stdout ?? '') + String(error.stderr ?? ''); }
  assert.match(output, /^commands: 9 passed$/m, 'suite did not report a clean run:\n' + output);
});

test('the UTF-8 sanitizer replaces invalid bytes and keeps valid text, keys included', { skip }, () => {
  const start = BRIDGE.indexOf('local function cleanText(');
  const end = BRIDGE.indexOf('-- The fourth value says why a request never got an answer');
  assert.ok(start > 0 && end > start, 'the sanitizer was not found in Bridge.luau');
  assert.match(BRIDGE, /HttpService:JSONEncode\(sanitize\(body, 0\)\)/, 'post() must sanitize what it sends');
  const dir = mkdtempSync(join(tmpdir(), 'studpilot-utf8-'));
  const file = join(dir, 'utf8.gen.luau');
  const helpers = 'local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end\nlocal function has(t, n) if not string.find(t, n, 1, true) then error("missing " .. n, 2) end end\n';
  writeFileSync(file, `${helpers}${BRIDGE.slice(start, end)}\n${BRIDGE_SPEC}`);
  const output = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
  assert.match(output, /bridge-sanitize: ok/);
});
