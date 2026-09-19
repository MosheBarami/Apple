import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STATE = readFileSync(join(ROOT, 'GameState.luau'), 'utf8');
const SERVER = readFileSync(join(ROOT, 'Game.server.luau'), 'utf8');
const PROFILE_PREFAB = readFileSync(join(ROOT, '..', '..', 'worker', 'src', 'prefabs.ts'), 'utf8');
const PROFILE_SOURCE = PROFILE_PREFAB.slice(
  PROFILE_PREFAB.indexOf('const PROFILE_SOURCE = `'),
  PROFILE_PREFAB.indexOf('const REMOTE_GUARD_SOURCE = `'),
);
const TMP = mkdtempSync(join(tmpdir(), 'lumen-gameplay-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));

function runLuau(name, body) {
  const file = join(TMP, `${name}.luau`);
  writeFileSync(file, body);
  try {
    return execFileSync('luau', [file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const stdout = error.stdout?.toString() ?? '';
    const stderr = error.stderr?.toString() ?? '';
    throw new Error(`${name} failed\n${stdout}${stderr}`);
  }
}

const stateModule = `
local LumenState = (function()
${STATE}
end)()
`;

const harness = `
--!nocheck
local NOW = 100
local realOs = os
local os = { clock = function() return NOW end }

local function vec(x, y, z)
    local mt
    mt = {
        __sub = function(a, b) return vec(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end,
        __index = function(v, k)
            if k == "Magnitude" then return math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z) end
            return nil
        end,
    }
    return setmetatable({ X = x, Y = y, Z = z }, mt)
end

local cfmt = { __mul = function(a, _) return a end }
CFrame = {
    new = function(v) return setmetatable({ Position = v }, cfmt) end,
    Angles = function() return setmetatable({}, cfmt) end,
}

local function signal()
    local handlers = {}
    return {
        Connect = function(_, fn) table.insert(handlers, fn); return { Disconnect = function() end } end,
        Fire = function(_, ...)
            for _, fn in handlers do task.spawn(fn, ...) end
        end,
    }
end

local queued = {}
task = {}
function task.spawn(fn, ...)
    local co = coroutine.create(fn)
    local ok, why = coroutine.resume(co, ...)
    if not ok then error(why) end
    if coroutine.status(co) ~= "dead" then table.insert(queued, co) end
    return co
end
function task.wait(dt)
    NOW += dt or 0
    return coroutine.yield("wait")
end
function task.stepAll()
    local current = queued
    queued = {}
    for _, co in current do
        local ok, why = coroutine.resume(co)
        if not ok then error(why) end
        if coroutine.status(co) ~= "dead" then table.insert(queued, co) end
    end
end
function task.advance(dt) NOW += dt end

local Players = { PlayerAdded = signal(), PlayerRemoving = signal() }
function Players:GetPlayers() return {} end
local Storage = {}
local RunService = { Heartbeat = signal() }
function RunService:IsStudio() return false end
local services = { Players = Players, ReplicatedStorage = Storage, RunService = RunService }
game = { GetService = function(_, name) return services[name] end }

local created = {}
Instance = {}
function Instance.new(className)
    local value = { ClassName = className }
    if className == "RemoteEvent" then
        value.deliveries = {}
        function value:FireClient(player, payload) table.insert(self.deliveries, { player = player, payload = payload }) end
    end
    table.insert(created, value)
    return value
end

${stateModule}

local function prompt() return { Triggered = signal() } end
local function target(name, position)
    local value = { Name = name, Position = position }
    function value:IsDescendantOf(candidate) return candidate == WORLD end
    return value
end

local shard = target("Shard01", vec(5, 4, 0)); shard.Collect = prompt(); shard._id = "shard_1"
function shard:GetAttribute(name) return name == "CollectibleId" and self._id or nil end
local door = target("LighthouseDoor", vec(8, 4, 0)); door.Finish = prompt()
function door:GetAttribute() return nil end
local cores = {}
local beaconSpecs = {
    { id = "orchard", spawn = vec(20, 6, 0) },
    { id = "tide", spawn = vec(100, 7, 0) },
    { id = "summit", spawn = vec(200, 8, 0) },
}
for _, spec in beaconSpecs do
    local core = target(spec.id .. "Core", spec.spawn); core.Restore = prompt(); cores[spec.id] = { Core = core }
end
WORLD = {
    spawn = vec(0, 5, 0),
    Targets = { GetChildren = function() return { shard, door } end },
    Beacons = cores,
    GetAttribute = function(_, name) return name == "AuthoredPartCount" and 123 or nil end,
}
local LumenWorld = { beacons = beaconSpecs, spawn = WORLD.spawn, build = function() return WORLD end }

local profileData = { lumen = nil }
local loadYields = false
local loadReturnsNil = false
local commitsSucceed = true
local loseLockOnCommit = false
local canSave = true
local commitCalls = 0
local releaseCalls = 0
local Profile = {}
function Profile.load(_player)
    if loadYields then coroutine.yield("profile-load") end
    canSave = not loadReturnsNil
    if loadReturnsNil then return nil end
    return profileData
end
function Profile.get(_player)
    if not canSave then return nil end
    return profileData
end
function Profile.commit(_player, nextData)
    commitCalls += 1
    if loseLockOnCommit then canSave = false; return false end
    if not commitsSucceed then return false end
    profileData = nextData
    return true
end
function Profile.release(_player) releaseCalls += 1 end

local ProfileToken = { IsA = function(_, class) return class == "ModuleScript" end }
local Parent = { LumenWorld = {}, LumenState = {} }
function Parent:FindFirstChild(name) if name == "Profile" then return ProfileToken end return nil end
local script = { Parent = Parent }
local require = function(token)
    if token == Parent.LumenWorld then return LumenWorld end
    if token == Parent.LumenState then return LumenState end
    if token == ProfileToken then return Profile end
    error("unknown require")
end

local function characterAt(position)
    local root = { Position = position }
    local humanoid = { Health = 100, WalkSpeed = 16, JumpPower = 50 }
    local character = { root = root, humanoid = humanoid, pivots = {} }
    function character:WaitForChild(name, _timeout) return name == "HumanoidRootPart" and root or name == "Humanoid" and humanoid or nil end
    function character:FindFirstChild(name) return name == "HumanoidRootPart" and root or nil end
    function character:FindFirstChildOfClass(name) return name == "Humanoid" and humanoid or nil end
    function character:PivotTo(cf) table.insert(self.pivots, cf.Position) root.Position = cf.Position end
    return character
end
local function playerAt(position)
    local player = { Parent = Players }
    player.CharacterAdded = signal()
    player.Character = characterAt(position or vec(0, 5, 0))
    return player
end

${SERVER}

local function remote(className, name)
    for _, value in created do if value.ClassName == className and value.Name == name then return value end end
    error("missing remote " .. name)
end
local Request = remote("RemoteFunction", "Request")
local Changed = remote("RemoteEvent", "Changed")
`;

test('the published Profile contract owns normal removal and exposes lock loss through get()', () => {
  assert.ok(PROFILE_SOURCE.length > 5000, 'Profile prefab source was not located');
  assert.match(PROFILE_SOURCE, /Players\.PlayerRemoving:Connect\(function\(player\)[\s\S]*?Profile\.release\(player\)/);
  assert.match(PROFILE_SOURCE, /function Profile\.commit\(player, data\)[\s\S]*?if ok and written == nil then[\s\S]*?entry\.canSave = false[\s\S]*?return false/);
  assert.match(PROFILE_SOURCE, /function Profile\.get\(player\)[\s\S]*?if entry == nil or not entry\.canSave then[\s\S]*?return nil/);
});

test('GameState rejects replay and never spends more shard value than was collected', () => {
  runLuau('state-replay', `
--!nocheck
${stateModule}
local s = LumenState.new()
for i = 1, 4 do assert(LumenState.collect(s, "shard_" .. i) == true) end
assert(LumenState.collect(s, "shard_1") == false)
assert(LumenState.light(s, "tide") == true)
assert(LumenState.light(s, "tide") == false)
local v = LumenState.view(s)
assert(v.collected == 4 and v.lit == 1 and v.available == 0)
assert(LumenState.light(s, "orchard") == false)
assert(LumenState.read(v) ~= nil)
assert(LumenState.read({ schema=1, shards={ shard_1=true, shard_2=true, shard_3=true }, beacons={ tide=true }, finished=false, checkpoint="tide" }) == nil)
assert(LumenState.read({ schema=1, shards={ shard_1=true, shard_2=true, shard_3=true, shard_4=true }, beacons={ tide=true }, finished=true, checkpoint="tide" }) == nil)
print("STATE_REPLAY_OK")
`);
});

test('published respawn waits for the loaded checkpoint instead of using the temporary harbour state', () => {
  runLuau('respawn-load', `${harness}
profileData = { lumen = { schema = 1, shards = { shard_1=true, shard_2=true, shard_3=true, shard_4=true }, beacons = { tide=true }, finished=false, checkpoint="tide" } }
loadYields = true
local p = playerAt(vec(0, 5, 0))
Players.PlayerAdded:Fire(p)
assert(#p.Character.pivots == 0, "character moved before the profile finished loading")
task.stepAll()
assert(#p.Character.pivots >= 1, "loaded current character was never placed at its saved checkpoint")
local last = p.Character.pivots[#p.Character.pivots]
assert(last.X == 100 and last.Y == 7, "expected tide checkpoint after load")
print("RESPAWN_LOAD_OK")
`);
});

test('distance is server-authoritative and failed save is invisible then safely replayable once', () => {
  runLuau('distance-save-replay', `${harness}
profileData = { lumen = LumenState.new() }
local p = playerAt(vec(100, 5, 0))
Players.PlayerAdded:Fire(p)
p.Character.root.Position = vec(100, 5, 0) -- join correctly respawns at harbour; move far AFTER that control
local before = Request.OnServerInvoke(p, "state")
shard.Collect.Triggered:Fire(p)
local far = Request.OnServerInvoke(p, "state")
assert(far.collected == before.collected, "far prompt changed authoritative state")
assert(commitCalls == 0, "far prompt reached durable commit")

p.Character.root.Position = vec(5, 4, 0)
task.advance(1)
commitsSucceed = false
shard.Collect.Triggered:Fire(p)
local failed = Request.OnServerInvoke(p, "state")
assert(failed.collected == 0, "failed commit became displayed progress")
assert(commitCalls == 1, "near accepted mutation did not attempt exactly one commit")

task.advance(1)
commitsSucceed = true
shard.Collect.Triggered:Fire(p)
local saved = Request.OnServerInvoke(p, "state")
assert(saved.collected == 1, "same interaction did not replay after failed save")
assert(commitCalls == 2)

task.advance(1)
shard.Collect.Triggered:Fire(p)
assert(Request.OnServerInvoke(p, "state").collected == 1, "successful replay collected twice")
assert(commitCalls == 2, "duplicate replay reached storage instead of being refused by GameState")
print("DISTANCE_SAVE_REPLAY_OK")
`);
});

test('losing the real Profile session on commit pauses progression immediately without displaying the candidate', () => {
  runLuau('profile-lock-loss', `${harness}
profileData = { lumen = LumenState.new() }
local p = playerAt(vec(5, 4, 0))
Players.PlayerAdded:Fire(p)
task.advance(1)
loseLockOnCommit = true
shard.Collect.Triggered:Fire(p)
local unavailable = Request.OnServerInvoke(p, "state")
assert(unavailable.collected == 0, "failed lock-losing commit became displayed progress")
assert(unavailable.ready == false and unavailable.save == "unavailable", "lost save authority was presented as retryable")
assert(commitCalls == 1)
print("PROFILE_LOCK_LOSS_OK")
`);
});

test('a player removed while Profile.load yields releases the late-acquired session', () => {
  runLuau('removed-during-load', `${harness}
profileData = { lumen = LumenState.new() }
loadYields = true
local p = playerAt(vec(0, 5, 0))
Players.PlayerAdded:Fire(p)
p.Parent = nil
Players.PlayerRemoving:Fire(p)
assert(releaseCalls == 0, "Game must not duplicate Profile's normal PlayerRemoving cleanup before load owns a session")
task.stepAll()
assert(releaseCalls == 1, "late Profile.load completion leaked its acquired session after player removal")
print("REMOVED_DURING_LOAD_OK")
`);
});

test('a player removed while a failed Profile.load yields clears the late unsaveable session', () => {
  runLuau('removed-during-failed-load', `${harness}
loadYields = true
loadReturnsNil = true
local p = playerAt(vec(0, 5, 0))
Players.PlayerAdded:Fire(p)
p.Parent = nil
Players.PlayerRemoving:Fire(p)
assert(releaseCalls == 0, "Game must wait for the late load result before cleaning it up")
task.stepAll()
assert(releaseCalls == 1, "late failed Profile.load left its unsaveable cache entry behind after removal")
print("REMOVED_DURING_FAILED_LOAD_OK")
`);
});

test('an invalid saved journey pauses progression and is never overwritten by an interaction', () => {
  runLuau('invalid-load', `${harness}
profileData = { lumen = { schema = 1, shards = { shard_1=true }, beacons = { tide=true }, finished=false, checkpoint="tide" } }
local p = playerAt(vec(5, 4, 0))
Players.PlayerAdded:Fire(p)
local loaded = Request.OnServerInvoke(p, "state")
assert(loaded.ready == false and loaded.save == "unavailable", "corrupt progress was admitted as writable")
task.advance(1)
shard.Collect.Triggered:Fire(p)
assert(commitCalls == 0, "interaction overwrote an invalid saved journey")
assert(profileData.lumen.beacons.tide == true and profileData.lumen.shards.shard_1 == true, "invalid source save was mutated in memory")
print("INVALID_LOAD_SAFE_OK")
`);
});
