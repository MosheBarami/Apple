/**
 * TOOL EXPANSION PHASE A (D-VISION-1), EXECUTED: the Query, Physics, Terrain, Rig and Ui op families
 * and the play-check button press (F-050), run as the REAL family modules inside the REAL command
 * engine against the shared Studio mock.
 *
 * The prelude omits engine surface it cannot model, so the few calls these families make that it
 * lacks are modelled HERE, narrowly, as the Engine API reference describes them: a flat ground for
 * Workspace:Raycast, an AABB GetPartBoundsInBox, a PhysicsService that keeps a group table, a
 * Players:CreateHumanoidModelFromDescription that returns a rig, a CoreGui, and a VirtualInput that
 * clicks whatever GuiButton is under the screen point it is given. What is asserted is what each
 * tool promises: what changes, what is refused, what never reaches the place, and what the report
 * says — not which functions were called.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE, opFamilySources } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');
const PLAY_CHECK = readFileSync(join(HERE, '..', 'src', 'PlayCheck.luau'), 'utf8');

const ENGINE = String.raw`
-- Engine surface the Phase A families use and the shared prelude omits.
local v2mt = {}
v2mt.__index = v2mt
v2mt.__add = function(a, b) return setmetatable({ __type = "Vector2", X = a.X + b.X, Y = a.Y + b.Y }, v2mt) end
v2mt.__div = function(a, n) return setmetatable({ __type = "Vector2", X = a.X / n, Y = a.Y / n }, v2mt) end
local function v2(x, y) return setmetatable({ __type = "Vector2", X = x or 0, Y = y or 0 }, v2mt) end
Vector2 = { new = v2 }
Enum.RaycastFilterType = { Exclude = "Enum.RaycastFilterType.Exclude" }
Enum.HumanoidRigType = { R15 = "Enum.HumanoidRigType.R15", R6 = "Enum.HumanoidRigType.R6" }
Enum.HumanoidDisplayDistanceType = { None = "Enum.HumanoidDisplayDistanceType.None" }
Enum.UserInputType = { MouseButton1 = "Enum.UserInputType.MouseButton1" }
RaycastParams = { new = function() return {} end }
OverlapParams = { new = function() return {} end }
local baseIsA = methods.IsA
function methods:IsA(wanted)
    if wanted == "GuiButton" then return self.ClassName == "TextButton" or self.ClassName == "ImageButton" end
    return baseIsA(self, wanted)
end
-- The prelude's Clone carries a Part's Position through CFrame; a GUI object's UDim2 Position is kept here.
local baseClone = methods.Clone
function methods:Clone()
    local copy = baseClone(self)
    local position = rawget(self, "__position")
    if copy and type(position) == "table" and position.__type == "UDim2" then copy.Position = position end
    return copy
end
function methods:HasTag(tag) local tags = rawget(self, "__tags"); return tags ~= nil and tags[tag] == true end
function methods:FindFirstChildOfClass(className) for _, c in ipairs(self.__children) do if c.ClassName == className then return c end end end
function methods:FindFirstAncestorOfClass(className) local p = self.Parent; while p do if p.ClassName == className then return p end; p = p.Parent end end

-- A flat ground 100 x 100 studs, top at Y = 0. Rock where X >= rockFromX, when that is set.
local ground = { half = 50, rockFromX = nil }
local groundPart = Instance.new("Part"); groundPart.Name = "Ground"; groundPart.Size = v3(100, 1, 100); groundPart.Position = v3(0, -0.5, 0); groundPart.Parent = workspace
local function excluded(inst, list)
    for _, e in ipairs(list or {}) do if inst == e or inst:IsDescendantOf(e) then return true end end
    return false
end
workspace.Raycast = function(self, origin, direction, params)
    if direction.Y >= 0 or excluded(groundPart, params and params.FilterDescendantsInstances) then return nil end
    if math.abs(origin.X) > ground.half or math.abs(origin.Z) > ground.half then return nil end
    if origin.Y < 0 or origin.Y + direction.Y > 0 then return nil end
    local material = if ground.rockFromX and origin.X >= ground.rockFromX then Enum.Material.Rock else Enum.Material.Grass
    return { Position = v3(origin.X, 0, origin.Z), Normal = v3(0, 1, 0), Material = material, Distance = origin.Y, Instance = groundPart }
end
workspace.GetPartBoundsInBox = function(self, cframe, size, params)
    local out, c = {}, cframe.Position
    for _, part in ipairs(workspace:GetDescendants()) do
        if part:IsA("BasePart") and not excluded(part, params and params.FilterDescendantsInstances) then
            local p, s = part.Position, part.Size
            if math.abs(p.X - c.X) < (s.X + size.X) / 2 and math.abs(p.Y - c.Y) < (s.Y + size.Y) / 2 and math.abs(p.Z - c.Z) < (s.Z + size.Z) / 2 then table.insert(out, part) end
        end
    end
    return out
end

-- PhysicsService as documented: registered groups, pairwise collidability, a group limit.
local physics = { groups = { "Default" }, pairs = {}, max = 32 }
function physics:IsCollisionGroupRegistered(n) for _, g in ipairs(self.groups) do if g == n then return true end end; return false end
function physics:GetRegisteredCollisionGroups() local out = {}; for i, g in ipairs(self.groups) do out[i] = { name = g, id = i - 1 } end; return out end
function physics:GetMaxCollisionGroups() return self.max end
function physics:RegisterCollisionGroup(n) table.insert(self.groups, n) end
function physics:CollisionGroupSetCollidable(a, b, v) self.pairs[a .. "|" .. b] = v; self.pairs[b .. "|" .. a] = v end
function physics:CollisionGroupsAreCollidable(a, b) local v = self.pairs[a .. "|" .. b]; if v == nil then return true end; return v end

-- Terrain calls the prelude does not record.
terrain.voxels = nil  -- function(nx, ny, nz) -> materials, occupancy
function terrain:FillCylinder(cframe, height, radius, material) table.insert(self.calls, { action = "fill_cylinder", height = height, radius = radius, material = material }) end
function terrain:FillWedge(cframe, size, material) table.insert(self.calls, { action = "fill_wedge", size = size, material = material }) end
function terrain:SetMaterialColor(material, colour) table.insert(self.calls, { action = "material_color", material = material, colour = colour }) end
function terrain:ReadVoxels(region, res)
    local nx, ny, nz = (region.Max.X - region.Min.X) / res, (region.Max.Y - region.Min.Y) / res, (region.Max.Z - region.Min.Z) / res
    return self.voxels(nx, ny, nz)
end
local function voxelGrid(nx, ny, nz, fill)
    local m, o = {}, {}
    for x = 1, nx do m[x], o[x] = {}, {}; for y = 1, ny do m[x][y], o[x][y] = {}, {}; for z = 1, nz do
        local occ, mat = fill(x, y, z); o[x][y][z] = occ; m[x][y][z] = mat
    end end end
    return m, o
end

-- Players:CreateHumanoidModelFromDescription, returning an R15-shaped rig.
local players = { made = {}, withScript = false }
function players:CreateHumanoidModelFromDescription(description, rigType)
    local seen = {}
    for k, v in pairs(description) do if type(k) == "string" and string.sub(k, 1, 2) ~= "__" then seen[k] = v end end
    table.insert(self.made, { description = seen, rigType = rigType })
    local rig = Instance.new("Model"); rig.Name = "Player"
    local humanoid = Instance.new("Humanoid"); humanoid.Name = "Humanoid"; humanoid.Parent = rig
    local rootPart = Instance.new("Part"); rootPart.Name = "HumanoidRootPart"; rootPart.Size = v3(2, 2, 1); rootPart.Parent = rig
    local head = Instance.new("MeshPart"); head.Name = "Head"; head.Size = v3(1, 1, 1); head.Parent = rig
    local joint = Instance.new("Motor6D"); joint.Name = "Neck"; joint.Parent = head
    if self.withScript then local s = Instance.new("Script"); s.Name = "Animate"; s.Parent = rig end
    rig.PivotTo = function(model, cframe) for _, p in ipairs(model:GetDescendants()) do if p:IsA("BasePart") then p.Position = cframe.Position end end end
    return rig
end

-- CoreGui: Studio's own UI layer, which is never saved with the place.
local coreGui = Instance.new("CoreGui"); coreGui.Name = "CoreGui"

-- Lays out a GUI tree the way the engine would for offset/scale sizes (no anchor points).
local function layOut(node, px, py, pw, ph)
    for _, child in ipairs(node:GetChildren()) do
        local s, p = rawget(child, "Size"), child.Position
        if type(s) == "table" and s.__type == "UDim2" then
            local w, h = s.X.Scale * pw + s.X.Offset, s.Y.Scale * ph + s.Y.Offset
            local x, y = px, py
            if type(p) == "table" and p.__type == "UDim2" then x += p.X.Scale * pw + p.X.Offset; y += p.Y.Scale * ph + p.Y.Offset end
            child.AbsolutePosition = v2(x, y); child.AbsoluteSize = v2(w, h)
            layOut(child, x, y, w, h)
        else
            layOut(child, px, py, pw, ph)
        end
    end
end
local layoutSeen = { scripts = 0, calls = 0 }
local function waitForLayout(host)
    layoutSeen.calls += 1
    layoutSeen.inCoreGui = host.Parent == coreGui
    for _, node in ipairs(host:GetDescendants()) do if node:IsA("LuaSourceContainer") then layoutSeen.scripts += 1 end end
    layOut(host, 0, 0, 1920, 1080)
end
`;

const SPEC = String.raw`
local function newCommands(extra)
    local opts = extra or {}
    opts.game = game
    opts.opFamilies = OP_FAMILIES_UNDER_TEST
    if opts.playCheck == nil then opts.playCheck = PlayCheck end
    if opts.playCheck == false then opts.playCheck = nil end
    return Commands.new(opts)
end
local function byOp(report, wanted) for _, item in report.operations do if item.op == wanted then return item end end end
local function part(name, parent, pos, size) local p = Instance.new("Part"); p.Name = name; p.Position = pos; p.Size = size or v3(2, 2, 2); p.Parent = parent; return p end
local function folder(name, parent) local f = Instance.new("Folder"); f.Name = name; f.Parent = parent or workspace; return f end
local function ui(className, name, parent, size, pos) local g = Instance.new(className); g.Name = name; g.Size = size; g.Position = pos or UDim2.new(0, 0, 0, 0); g.Parent = parent; return g end
local function kinds(list) local out = {}; for _, i in ipairs(list) do out[i.kind .. "@" .. i.path] = true end; return out end
local c = newCommands()

spec("every Phase A operation installs and is reported supported", function()
    eq(#c.opFamilyErrors, 0, "family errors: " .. table.concat(c.opFamilyErrors, " | "))
    local report = Commands.capabilities(c)
    for _, name in ipairs({ "query_instances", "set_props_bulk", "spatial_query", "scatter", "collision_groups", "collision_groups_list", "terrain_shape", "terrain_read", "create_rig", "ui_layout_check", "play_check_ui" }) do
        local entry = byOp(report, name)
        eq(entry ~= nil and entry.status, "supported", name)
    end
end)

-- query_instances ----------------------------------------------------------------------------
local lamps = folder("Lamps")
for i = 1, 3 do local l = part("Lamp" .. i, lamps, v3(i * 4, 1, 20)); l.Transparency = i / 10; l:SetAttribute("Kind", "street"); l.__tags = { Light = true } end
local post = part("Post", lamps, v3(0, 1, 24)); post:SetAttribute("Kind", "fence"); post.Transparency = 0.5

spec("query_instances finds by glob, tag, attribute and property, and says when it stopped early", function()
    local r = c:execute("q1", { op = "query_instances", root = "game.Workspace.Lamps", name = "lamp*" }, false)
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 3); eq(r.data.truncated, nil)
    eq(c:execute("q2", { op = "query_instances", tag = "Light" }, false).data.count, 3)
    eq(c:execute("q3", { op = "query_instances", root = "game.Workspace.Lamps", attribute = { name = "Kind", equals = "fence" } }, false).data.matches[1].path, "game.Workspace.Lamps.Post")
    eq(c:execute("q4", { op = "query_instances", root = "game.Workspace.Lamps", property = { name = "Transparency", op = "lt", value = 0.25 } }, false).data.count, 2)
    local limited = c:execute("q5", { op = "query_instances", root = "game.Workspace.Lamps", className = "Part", limit = 2 }, false)
    eq(limited.data.count, 2); eq(limited.data.truncated, "limit", "a partial answer must say it is partial")
end)

spec("query_instances refuses an empty query, an unreadable property and a service outside scope", function()
    eq(c:execute("q6", { op = "query_instances", root = "game.Workspace" }, false).ok, false)
    local src = c:execute("q7", { op = "query_instances", property = { name = "Source", op = "contains", value = "x" } }, false)
    eq(src.ok, false); has(src.error, "read allowlist")
    eq(c:execute("q8", { op = "query_instances", root = "game.CoreGui", name = "x" }, false).ok, false)
end)

-- set_props_bulk ------------------------------------------------------------------------------
spec("set_props_bulk changes every matched target as ONE undo step", function()
    local before = #history.log
    local r = c:execute("b1", { op = "set_props_bulk", query = { root = "game.Workspace.Lamps", name = "lamp*" },
        props = { Anchored = { t = "bool", v = true } }, adjust = { { property = "Size", op = "mul", value = 2 } }, attributes = { Kind = { t = "nil" } } }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 3)
    for i = 1, 3 do
        local l = lamps:FindFirstChild("Lamp" .. i)
        eq(l.Anchored, true); eq(l.Size.X, 4); eq(l:GetAttribute("Kind"), nil)
    end
    eq(post.Size.X, 2, "a non-matching sibling is untouched")
    eq(#history.log, before + 2); has(history.log[before + 1], "begin:Apple set_props_bulk"); eq(history.log[before + 2], "Commit")
end)

spec("set_props_bulk takes the write gates and refuses properties outside the allowlist", function()
    local denied = c:execute("b2", { op = "set_props_bulk", targets = { "game.Workspace.Lamps.Post" }, props = { Anchored = { t = "bool", v = true } } }, false)
    eq(denied.ok, false); eq(denied.remedy, "edit_consent")
    local content = c:execute("b3", { op = "set_props_bulk", targets = { "game.Workspace.Lamps.Post" }, adjust = { { property = "MeshId", op = "add", value = 1 } } }, true)
    eq(content.ok, false); has(content.error, "write allowlist")
end)

spec("set_props_bulk cancels the whole recording when any target fails", function()
    local before = #history.log
    local r = c:execute("b4", { op = "set_props_bulk", targets = { "game.Workspace.Lamps.Post", "game.Workspace.Lamps" }, adjust = { { property = "Size", op = "add", value = 1 } } }, true)
    eq(r.ok, false); eq(history.log[#history.log], "Cancel", "a half-applied bulk change must be undone")
    eq(#history.log, before + 2)
end)

-- spatial_query -------------------------------------------------------------------------------
local crate = part("Crate", workspace, v3(0, 3, 0))
local wall = part("Wall", workspace, v3(1, 3, 0), v3(1, 4, 1))
local resting = part("Resting", workspace, v3(10, 1, 0))

spec("spatial_query finds the ground and measures the drop", function()
    local r = c:execute("s1", { op = "spatial_query", action = "find_ground", position = { 5, 50, 5 } }, false)
    eq(r.ok, true, tostring(r.error)); eq(r.data.result.hit, true); eq(r.data.result.position[2], 0); eq(r.data.result.dropFromPosition, 50)
    eq(r.data.result.material, "Enum.Material.Grass")
    local off = c:execute("s2", { op = "spatial_query", action = "find_ground", position = { 500, 50, 5 } }, false)
    eq(off.data.result.hit, false, "no ground past the edge, and none is invented")
end)

spec("check_placement names what a part floats above and what it is inside", function()
    local r = c:execute("s3", { op = "spatial_query", action = "check_placement", path = "game.Workspace.Crate" }, false)
    eq(r.ok, true, tostring(r.error)); eq(r.data.floating, true); eq(r.data.gapBelow, 2)
    eq(r.data.overlapCount, 1); eq(r.data.overlapping[1], "game.Workspace.Wall")
    local ok = c:execute("s4", { op = "spatial_query", action = "check_placement", path = "game.Workspace.Resting" }, false)
    eq(ok.data.floating, false, "a part resting on the ground does not float"); eq(ok.data.overlapCount, 0, "touching the ground is not overlapping it")
end)

spec("spatial_query overlap and raycast answer, and bad input is refused", function()
    eq(c:execute("s5", { op = "spatial_query", action = "overlap", center = { 0, 3, 0 }, size = { 2, 1, 1 } }, false).data.count, 2)
    local ray = c:execute("s6", { op = "spatial_query", action = "raycast", origin = { 3, 10, 3 }, direction = { 0, -20, 0 } }, false)
    eq(ray.data.result.hit, true); eq(ray.data.result.distance, 10)
    eq(c:execute("s7", { op = "spatial_query", action = "raycast", origin = { 0, 0, 0 }, direction = { 0, -9000, 0 } }, false).ok, false)
    eq(c:execute("s8", { op = "spatial_query", action = "teleport" }, false).ok, false)
end)

crate:Destroy(); wall:Destroy(); resting:Destroy()

-- scatter -------------------------------------------------------------------------------------
local rock = part("Rock", services.ReplicatedStorage, v3(0, 50, 0))
local function placed(parent) local out = {}; for _, ch in ipairs(parent:GetChildren()) do table.insert(out, ch) end; return out end

spec("scatter places seeded, spaced copies ON the ground, as one undo step", function()
    local field = folder("Field")
    local before = #history.log
    local r = c:execute("sc1", { op = "scatter", template = "game.ReplicatedStorage.Rock", count = 20, seed = 7, minSpacing = 3, parent = "game.Workspace.Field",
        region = { min = { -10, -10, -10 }, max = { 10, 20, 10 } } }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.placed, 20)
    local copies = placed(field)
    eq(#copies, 20)
    local names = {}
    for i, a in ipairs(copies) do
        eq(a.Position.Y, 1, "a 2-stud rock rests on the ground at Y = 0")
        eq(math.abs(a.Position.X) <= 10 and math.abs(a.Position.Z) <= 10, true, "inside the region")
        eq(names[a.Name], nil, "names are unique"); names[a.Name] = true
        for j = i + 1, #copies do
            local b = copies[j]
            eq(((a.Position.X - b.Position.X) ^ 2 + (a.Position.Z - b.Position.Z) ^ 2) >= 9, true, "copies keep minSpacing")
        end
    end
    eq(#history.log, before + 2); eq(history.log[before + 2], "Commit")
    local again = folder("Field2")
    c:execute("sc2", { op = "scatter", template = "game.ReplicatedStorage.Rock", count = 20, seed = 7, minSpacing = 3, parent = "game.Workspace.Field2",
        region = { min = { -10, -10, -10 }, max = { 10, 20, 10 } } }, true)
    local second = placed(again)
    for i = 1, 20 do eq(second[i].Position.X, copies[i].Position.X, "the same seed gives the same layout") end
    field:Destroy(); again:Destroy()
end)

spec("scatter reports a shortfall instead of pretending, and honours onMaterial", function()
    local edge = folder("Edge")
    local r = c:execute("sc3", { op = "scatter", template = "game.ReplicatedStorage.Rock", count = 10, seed = 3, parent = "game.Workspace.Edge",
        region = { min = { 30, -10, -10 }, max = { 90, 20, 10 } } }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.misses.noGround > 0, true); eq(r.data.placed, #placed(edge))
    if r.data.placed < 10 then has(r.data.shortfall, "no ground") end
    edge:Destroy()
    ground.rockFromX = 0
    local rocky = folder("Rocky")
    local m = c:execute("sc4", { op = "scatter", template = "game.ReplicatedStorage.Rock", count = 6, seed = 11, parent = "game.Workspace.Rocky", onMaterial = { "Enum.Material.Rock" },
        region = { min = { -40, -10, -40 }, max = { 40, 20, 40 } } }, true)
    eq(m.ok, true, tostring(m.error))
    for _, copy in ipairs(placed(rocky)) do eq(copy.Position.X >= 0, true, "only on Rock") end
    ground.rockFromX = nil; rocky:Destroy()
end)

spec("scatter refuses a template that contains a script, and places nothing", function()
    local model = Instance.new("Model"); model.Name = "Trap"; model.Parent = services.ReplicatedStorage
    part("Body", model, v3(0, 0, 0))
    local s = Instance.new("Script"); s.Name = "Spread"; s.Parent = model
    local target = folder("Trapped")
    local r = c:execute("sc5", { op = "scatter", template = "game.ReplicatedStorage.Trap", count = 3, parent = "game.Workspace.Trapped",
        region = { min = { -5, -5, -5 }, max = { 5, 5, 5 } } }, true)
    eq(r.ok, false); eq(r.failure, "refused"); eq(#placed(target), 0)
    model:Destroy(); target:Destroy()
end)

-- collision groups ----------------------------------------------------------------------------
services.PhysicsService = physics

spec("collision groups register, stop colliding, and are assigned to every part under a model", function()
    eq(c:execute("cg0", { op = "collision_groups", action = "register", group = "Players" }, false).remedy, "edit_consent")
    local reg = c:execute("cg1", { op = "collision_groups", action = "register", group = "Players" }, true)
    eq(reg.ok, true, tostring(reg.error)); eq(physics:IsCollisionGroupRegistered("Players"), true)
    eq(c:execute("cg2", { op = "collision_groups", action = "set_collidable", group = "Players", other = "Players", collidable = false }, true).ok, true)
    local npc = Instance.new("Model"); npc.Name = "Npc"; npc.Parent = workspace
    local a, b = part("A", npc, v3(0, 1, 30)), part("B", npc, v3(0, 3, 30))
    local assign = c:execute("cg3", { op = "collision_groups", action = "assign", group = "Players", paths = { "game.Workspace.Npc" } }, true)
    eq(assign.ok, true, tostring(assign.error)); eq(assign.data.parts, 2); eq(a.CollisionGroup, "Players"); eq(b.CollisionGroup, "Players")
    local list = c:execute("cg4", { op = "collision_groups_list" }, false)
    eq(list.data.groups[2], "Players"); eq(list.data.notColliding[1][1], "Players")
    npc:Destroy()
end)

spec("collision groups refuse an unregistered group and the group limit", function()
    local missing = c:execute("cg5", { op = "collision_groups", action = "assign", group = "Ghosts", paths = { "game.Workspace.Lamps" } }, true)
    eq(missing.ok, false); has(missing.error, "not registered")
    physics.max = 2
    local full = c:execute("cg6", { op = "collision_groups", action = "register", group = "Third" }, true)
    eq(full.ok, false); has(full.error, "limit"); eq(physics:IsCollisionGroupRegistered("Third"), false)
    physics.max = 32
end)

-- terrain -------------------------------------------------------------------------------------
spec("terrain_shape fills a cylinder in one recording and refuses one over the voxel budget", function()
    local before, calls = #history.log, #terrain.calls
    local r = c:execute("t1", { op = "terrain_shape", action = "fill_cylinder", center = { 0, 10, 0 }, height = 20, radius = 8, material = "Enum.Material.Rock" }, true)
    eq(r.ok, true, tostring(r.error)); eq(terrain.calls[calls + 1].action, "fill_cylinder"); eq(terrain.calls[calls + 1].material, Enum.Material.Rock)
    eq(history.log[before + 2], "Commit")
    local huge = c:execute("t2", { op = "terrain_shape", action = "fill_cylinder", center = { 0, 0, 0 }, height = 1024, radius = 512, material = "Enum.Material.Rock" }, true)
    eq(huge.ok, false); eq(#terrain.calls, calls + 1, "a refused edit touches no voxel")
end)

spec("smoothing blurs an edge and leaves a uniform region exactly as it was", function()
    terrain.voxels = function(nx, ny, nz) return voxelGrid(nx, ny, nz, function(_, y) if y == 1 then return 1, Enum.Material.Grass end; return 0, Enum.Material.Air end) end
    local edge = c:execute("t3", { op = "terrain_shape", action = "smooth", min = { 0, 0, 0 }, max = { 16, 16, 16 } }, true)
    eq(edge.ok, true, tostring(edge.error)); eq(edge.data.changed > 0, true)
    local written = terrain.calls[#terrain.calls]
    for x = 1, 4 do for y = 1, 4 do for z = 1, 4 do local v = written.occupancy[x][y][z]; eq(v >= 0 and v <= 1, true, "occupancy stays 0..1") end end end
    terrain.voxels = function(nx, ny, nz) return voxelGrid(nx, ny, nz, function() return 1, Enum.Material.Rock end) end
    eq(c:execute("t4", { op = "terrain_shape", action = "smooth", min = { 0, 0, 0 }, max = { 16, 16, 16 } }, true).data.changed, 0)
end)

spec("heightmap is deterministic by seed, solid below its surface, and flat at amplitude 0", function()
    local op = { op = "terrain_shape", action = "heightmap", min = { 0, 0, 0 }, max = { 64, 32, 64 }, seed = 5, amplitude = 0.8, scale = 32 }
    local a = c:execute("t5", op, true); local first = terrain.calls[#terrain.calls]
    local b = c:execute("t6", op, true); local second = terrain.calls[#terrain.calls]
    eq(a.ok, true, tostring(a.error)); eq(a.data.surfaceMinY, b.data.surfaceMinY)
    for x = 1, 16 do for z = 1, 16 do
        eq(first.occupancy[x][1][z], second.occupancy[x][1][z], "same seed, same terrain")
        for y = 2, 8 do eq(first.occupancy[x][y][z] <= first.occupancy[x][y - 1][z], true, "no floating voxel above air") end
    end end
    local flat = c:execute("t7", { op = "terrain_shape", action = "heightmap", min = { 0, 0, 0 }, max = { 16, 16, 16 }, amplitude = 0 }, true)
    eq(flat.data.surfaceMinY, 8); eq(flat.data.surfaceMaxY, 8)
end)

spec("terrain appearance sets water and material colours, and terrain_read summarises a region", function()
    local r = c:execute("t8", { op = "terrain_shape", action = "appearance", water = { color = { 0, 0.3, 0.6 }, transparency = 0.4 }, materialColors = { Grass = { 0.2, 0.6, 0.2 } } }, true)
    eq(r.ok, true, tostring(r.error)); eq(terrain.WaterTransparency, 0.4); eq(terrain.calls[#terrain.calls].action, "material_color")
    eq(c:execute("t9", { op = "terrain_shape", action = "appearance", materialColors = { Plasma = { 1, 0, 0 } } }, true).ok, false)
    terrain.voxels = function(nx, ny, nz) return voxelGrid(nx, ny, nz, function(_, y) if y == 1 then return 1, Enum.Material.Grass end; return 0, Enum.Material.Air end) end
    local read = c:execute("t10", { op = "terrain_read", min = { 0, 0, 0 }, max = { 16, 16, 16 } }, false)
    eq(read.ok, true, tostring(read.error)); eq(read.data.voxels, 64); eq(read.data.solidVoxels, 16); eq(read.data.materials[1].material, "Enum.Material.Grass")
end)

-- create_rig ----------------------------------------------------------------------------------
spec("create_rig refuses cleanly when this Studio has no Players service", function()
    local r = c:execute("r0", { op = "create_rig", name = "Guide" }, true)
    eq(r.ok, false); eq(r.failure, "refused"); eq(workspace:FindFirstChild("Guide"), nil)
end)

services.Players = players

spec("create_rig builds a placed, anchored NPC from colours and scales only", function()
    local before = #history.log
    local r = c:execute("r1", { op = "create_rig", name = "Guide", position = { 5, 3, 5 }, npc = true, displayName = "Shopkeeper",
        bodyColors = { head = { 1, 0.8, 0.6 } }, scale = { height = 1 } }, true)
    eq(r.ok, true, tostring(r.error))
    local rig = workspace:FindFirstChild("Guide")
    eq(rig ~= nil, true); eq(rig:FindFirstChild("HumanoidRootPart").Anchored, true); eq(rig:FindFirstChild("Humanoid").DisplayName, "Shopkeeper"); eq(rig:FindFirstChild("Head").Position.X, 5)
    local made = players.made[#players.made]
    eq(made.rigType, Enum.HumanoidRigType.R15); eq(made.description.HeadColor.R, 1); eq(made.description.HeightScale, 1)
    for key in pairs(made.description) do
        eq(string.find(key, "Id$") == nil and string.find(key, "Accessor") == nil and string.find(key, "Animation") == nil, true, "no asset id reaches the description: " .. key)
    end
    eq(history.log[before + 2], "Commit")
end)

spec("create_rig refuses out-of-range scales, a taken name, and a generated rig carrying a script", function()
    local calls = #players.made
    eq(c:execute("r2", { op = "create_rig", name = "Tall", scale = { height = 3 } }, true).ok, false); eq(#players.made, calls, "nothing is built for bad input")
    eq(c:execute("r3", { op = "create_rig", name = "Guide" }, true).failure, "conflict")
    players.withScript = true
    local r = c:execute("r4", { op = "create_rig", name = "Scripted" }, true)
    players.withScript = false
    eq(r.ok, false); eq(r.failure, "refused"); eq(workspace:FindFirstChild("Scripted"), nil)
end)

-- ui_layout_check -----------------------------------------------------------------------------
local shop = Instance.new("ScreenGui"); shop.Name = "ShopGui"; shop.Enabled = true; shop.IgnoreGuiInset = false; shop.Parent = services.StarterGui
local panel = ui("Frame", "Panel", shop, UDim2.new(0.5, 0, 0.5, 0), UDim2.new(0.25, 0, 0.25, 0)); panel.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1); panel.BackgroundTransparency = 0
local buy = ui("TextButton", "Buy", panel, UDim2.new(0, 30, 0, 30), UDim2.new(0, 10, 0, 10)); buy.Text = "Buy"; buy.TextColor3 = Color3.new(0.15, 0.15, 0.15); buy.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1); buy.BackgroundTransparency = 0; buy.TextFits = true
local title = ui("TextLabel", "Title", panel, UDim2.new(1, 0, 0, 40), UDim2.new(0, 0, 0, 60)); title.Text = "Welcome to the shop"; title.TextFits = false; title.TextColor3 = Color3.new(1, 1, 1); title.BackgroundTransparency = 1
local shopScript = Instance.new("LocalScript"); shopScript.Name = "ShopClient"; shopScript.Parent = panel
local close = ui("TextButton", "Close", shop, UDim2.new(0, 200, 0, 50), UDim2.new(1, -100, 0, 0)); close.Text = "X"; close.TextColor3 = Color3.new(1, 1, 1); close.BackgroundTransparency = 1; close.TextFits = true
ui("Frame", "Lost", shop, UDim2.new(0, 100, 0, 100), UDim2.new(0, -500, 0, 0))

spec("ui_layout_check measures each device and names each defect where it happens", function()
    services.CoreGui = coreGui
    local before, scripts = #history.log, layoutSeen.scripts
    local r = newCommands({ waitForLayout = waitForLayout }):execute("u1", { op = "ui_layout_check", screen = "game.StarterGui.ShopGui", devices = { "phone_landscape", "desktop" } }, false)
    eq(r.ok, true, tostring(r.error)); eq(r.data.verdict, "issues")
    local phone, desk = kinds(r.data.devices[1].issues), kinds(r.data.devices[2].issues)
    eq(phone["small_touch_target@game.StarterGui.ShopGui.Panel.Buy"], true, "30 px is too small for a finger")
    eq(desk["small_touch_target@game.StarterGui.ShopGui.Panel.Buy"], nil, "a mouse is not a finger")
    eq(phone["low_contrast@game.StarterGui.ShopGui.Panel.Buy"], true)
    eq(phone["text_overflow@game.StarterGui.ShopGui.Panel.Title"], true)
    eq(phone["low_contrast@game.StarterGui.ShopGui.Panel.Title"], nil, "white on the dark panel reads fine")
    eq(desk["clipped@game.StarterGui.ShopGui.Close"], true); eq(desk["offscreen@game.StarterGui.ShopGui.Lost"], true)
    eq(layoutSeen.inCoreGui, true, "laid out in CoreGui, never in the place")
    eq(layoutSeen.scripts, scripts, "no script from the screen runs in the check")
    eq(#coreGui:GetChildren(), 0, "the check leaves nothing behind")
    eq(shopScript.Parent, panel, "the screen itself is untouched"); eq(#history.log, before, "a read makes no undo entry")
end)

spec("ui_layout_check passes a clean screen and flags a button under the top bar", function()
    local clean = Instance.new("ScreenGui"); clean.Name = "HudGui"; clean.IgnoreGuiInset = true; clean.Parent = services.StarterGui
    local play = ui("TextButton", "Play", clean, UDim2.new(0, 120, 0, 60), UDim2.new(0.5, -60, 0.5, -30)); play.Text = "Play"; play.TextFits = true
    play.TextColor3 = Color3.new(1, 1, 1); play.BackgroundColor3 = Color3.new(0, 0, 0); play.BackgroundTransparency = 0
    local cmd = newCommands({ waitForLayout = waitForLayout })
    eq(cmd:execute("u2", { op = "ui_layout_check", screen = "game.StarterGui.HudGui", devices = { "phone_portrait", "tablet" } }, false).data.verdict, "pass")
    play.Position = UDim2.new(0, 10, 0, 5)
    local top = cmd:execute("u3", { op = "ui_layout_check", screen = "game.StarterGui.HudGui", devices = { "phone_portrait" } }, false)
    eq(kinds(top.data.devices[1].issues)["under_top_bar@game.StarterGui.HudGui.Play"], true)
    clean:Destroy()
end)

spec("ui_layout_check cleans up when layout fails, and refuses bad input", function()
    local failing = newCommands({ waitForLayout = function() error("layout exploded") end })
    local r = failing:execute("u4", { op = "ui_layout_check", screen = "game.StarterGui.ShopGui" }, false)
    eq(r.ok, false); eq(#coreGui:GetChildren(), 0, "a failed check must not leave its clone in CoreGui")
    eq(c:execute("u5", { op = "ui_layout_check", screen = "game.StarterGui.ShopGui.Panel" }, false).ok, false)
    eq(c:execute("u6", { op = "ui_layout_check", screen = "game.StarterGui.ShopGui", devices = { "fridge" } }, false).ok, false)
    services.CoreGui = nil
    local none = c:execute("u7", { op = "ui_layout_check", screen = "game.StarterGui.ShopGui" }, false)
    eq(none.ok, false); eq(none.failure, "refused")
end)

-- play_check presses (F-050) ------------------------------------------------------------------
local store = Instance.new("ScreenGui"); store.Name = "StoreGui"; store.Enabled = true; store.IgnoreGuiInset = false; store.Parent = services.StarterGui
local buyButton = ui("TextButton", "Buy", store, UDim2.new(0, 100, 0, 40), UDim2.new(0, 10, 0, 10)); buyButton.Text = "Buy"
local hiddenButton = ui("TextButton", "Secret", store, UDim2.new(0, 100, 0, 40), UDim2.new(0, 10, 0, 100)); hiddenButton.Visible = false
local banner = ui("Frame", "Banner", store, UDim2.new(0, 10, 0, 10))

local INSET = 58
local function pressSession(options)
    local sent = {}
    return simulatePlaySession({
        onServer = function(world)
            local uis = {}
            function uis:CreateVirtualInput()
                if options.noVirtualInput then error("The current thread cannot call 'CreateVirtualInput' (lacking capability)") end
                local virtual = {}
                function virtual:SendMouseButton(pos, _kind, down)
                    table.insert(sent, { x = pos.X, y = pos.Y, down = down })
                    if down then return end
                    for _, node in ipairs(world.playerGui:GetDescendants()) do
                        local a, s = rawget(node, "AbsolutePosition"), rawget(node, "AbsoluteSize")
                        if node:IsA("GuiButton") and node.Visible and a and s then
                            local gx, gy = pos.X, pos.Y - INSET
                            if gx >= a.X and gx <= a.X + s.X and gy >= a.Y and gy <= a.Y + s.Y then node.Activated:Fire() end
                        end
                    end
                end
                function virtual:Destroy() end
                return virtual
            end
            local guiService = {}
            function guiService:GetGuiInset() return v2(0, INSET), v2(0, 0) end
            local base = world.clientGame.GetService
            world.clientGame.GetService = function(dm, name)
                if name == "UserInputService" then return uis end
                if name == "GuiService" then return guiService end
                return base(dm, name)
            end
        end,
        onClient = function(world)
            local stats = Instance.new("Folder"); stats.Name = "leaderstats"; stats.Parent = world.player
            local coins = Instance.new("IntValue"); coins.Name = "Coins"; coins.Value = 0; coins.Parent = stats
            for _, gui in ipairs(world.playerGui:GetChildren()) do layOut(gui, 0, 0, 1280, 720) end
            for _, node in ipairs(world.playerGui:GetDescendants()) do
                if node:IsA("GuiButton") then
                    node.Activated = world.signal()
                    if node.Name == "Buy" then node.Activated:Connect(function() coins.Value += 1 end) end
                end
            end
        end,
    }), sent
end

spec("play_check presses a real on-screen button and reports what pressing it did", function()
    runService.edit = true; runService.running = false
    local session, sent = pressSession({})
    studioTest.onSession = session
    local r = c:execute("p1", { op = "play_check_ui", seconds = 3, press = { "game.StarterGui.StoreGui.Buy", "game.StarterGui.StoreGui.Secret" } }, true)
    eq(r.ok, true, tostring(r.error))
    local buyPress, secretPress = r.data.presses[1], r.data.presses[2]
    eq(buyPress.found, true); eq(buyPress.pressed, true); eq(buyPress.activated, true); eq(buyPress.activations, 1)
    eq(r.data.leaderstatsAfterPresses[1].name, "Coins"); eq(r.data.leaderstatsAfterPresses[1].value, 1, "the Buy handler really ran")
    eq(sent[1].y, 10 + 20 + INSET, "the click lands at the button's centre, below the top bar")
    eq(secretPress.found, true); eq(secretPress.visible, false); eq(secretPress.pressed, false, "a hidden button is not pressed for the player")
    eq(r.data.harnessRemoved, true)
end)

spec("without VirtualInput a press is reported as NOT pressed, never as pressed", function()
    local session = pressSession({ noVirtualInput = true })
    studioTest.onSession = session
    local r = c:execute("p2", { op = "play_check_ui", seconds = 3, press = { "game.StarterGui.StoreGui.Buy" } }, true)
    eq(r.ok, true, tostring(r.error))
    local entry = r.data.presses[1]
    eq(entry.found, true); eq(entry.pressed, false); eq(entry.activated, false); has(entry.error, "VirtualInput")
    eq(r.data.leaderstatsAfterPresses[1].value, 0)
end)

spec("press targets must be buttons inside a StarterGui ScreenGui, at most five, behind consent", function()
    studioTest.onSession = pressSession({})
    local sessions = studioTest.sessions
    eq(c:execute("p3", { op = "play_check_ui", press = { "game.StarterGui.StoreGui.Buy" } }, false).remedy, "edit_consent")
    eq(c:execute("p4", { op = "play_check_ui", press = { "game.StarterGui.StoreGui.Banner" } }, true).ok, false)
    eq(c:execute("p5", { op = "play_check_ui", press = { "game.Workspace.Lamps.Post" } }, true).ok, false)
    local six = {}; for i = 1, 6 do six[i] = "game.StarterGui.StoreGui.Buy" end
    eq(c:execute("p6", { op = "play_check_ui", press = six }, true).ok, false)
    eq(c:execute("p7", { op = "play_check_ui" }, true).ok, false, "play_check_ui without a press is refused")
    eq(studioTest.sessions, sessions, "no Test session starts for a refused press")
end)

spec("a Studio that cannot play-check reports play_check_ui unsupported too", function()
    local old = newCommands({ playCheck = false })
    eq(byOp(Commands.capabilities(old), "play_check_ui").status, "unsupported")
end)

report()
`;

const available = (() => { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } })();

function familiesChunk(overrides = {}) {
  const sources = { ...opFamilySources(), ...overrides };
  const bodies = Object.values(sources).map((src) => `(function()\n${src}\nend)()`);
  return `local OP_FAMILIES_UNDER_TEST = {\n${bodies.join(',\n')}\n}\n`;
}

function runSuite({ commands = COMMANDS, playCheck = PLAY_CHECK, families = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-phase-a-'));
  const file = join(dir, 'phase-a.gen.luau');
  writeFileSync(file, `${PRELUDE}\n${ENGINE}\n${familiesChunk(families)}local PlayCheck = (function()\n${playCheck}\nend)()\nlocal Commands = (function()\n${commands}\nend)()\n${SPEC}`);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

const skip = available ? false : 'luau is not on PATH';

test('Phase A op families pass the executable Studio-mock suite', { skip }, () => {
  const result = runSuite();
  assert.match(result.output, /^commands: 28 passed$/m, 'suite did not report a clean run:\n' + result.output);
  assert.equal(result.status, 0, result.output);
});

const BREAKS = [
  { why: 'scatter refuses a template with a script', family: 'Query.luau',
    anchor: 'if api.isScript(node) then return nil, "refused", "the template contains a script',
    with: 'if false then return nil, "refused", "the template contains a script' },
  { why: 'scatter keeps minSpacing', family: 'Query.luau', anchor: '\t\t\t\tif crowded then\n', with: '\t\t\t\tif false then\n' },
  { why: 'adjust is held to the write allowlist', family: 'Query.luau',
    anchor: 'if not api.propertyAllow[name] or api.contentProperty[name] then return nil, ("property %s is not in Apple\'s write allowlist")',
    with: 'if false then return nil, ("property %s is not in Apple\'s write allowlist")' },
  { why: 'collision group writes take the write gates', family: 'Physics.luau',
    anchor: 'mutating = { collision_groups = true },', with: 'mutating = {},' },
  { why: 'the layout check removes its clone on the failure path', family: 'Ui.luau',
    anchor: '\t\tif host ~= nil then pcall(function() host:Destroy() end) end\n', with: '\n' },
  { why: 'the layout check strips scripts from its clone', family: 'Ui.luau',
    anchor: 'if api.isScript(node) then pcall(function() node.Parent = nil end) end', with: '' },
  { why: 'create_rig refuses a rig that carries a script', family: 'Rig.luau',
    anchor: '\t\t\tif api.isScript(node) then\n', with: '\t\t\tif false then\n' },
  { why: 'a press clicks below the top bar', playCheck: true,
    anchor: 'if okInset and inset then centre += inset end', with: '' },
  { why: 'press targets must be GuiButtons', commands: true,
    anchor: 'if not isA(inst, "GuiButton") then return nil, "invalid", "play_check.press targets must be a TextButton',
    with: 'if false then return nil, "invalid", "play_check.press targets must be a TextButton' },
];

test('each Phase A safety mechanism is load-bearing (red-first falsification)', { skip }, () => {
  const families = opFamilySources();
  for (const b of BREAKS) {
    const source = b.family ? families[b.family] : b.playCheck ? PLAY_CHECK : COMMANDS;
    assert.equal(source.split(b.anchor).length - 1, 1, `falsification anchor for "${b.why}" must occur exactly once`);
    const broken = source.replace(b.anchor, b.with);
    const result = runSuite(b.family ? { families: { [b.family]: broken } } : b.playCheck ? { playCheck: broken } : { commands: broken });
    assert.notEqual(result.status, 0, `breaking "${b.why}" left the suite green:\n${result.output}`);
  }
});
