--!nonstrict
-- Lumen Isles server: identities, distance, collectibles, beacon costs and checkpoints are authoritative.
-- Local Studio play is explicitly session-only. Published play requires the vetted Profile module.
local Players = game:GetService("Players")
local Storage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local World = require(script.Parent.LumenWorld)
local State = require(script.Parent.LumenState)
local localPlay = RunService:IsStudio()
local world = World.build()
local channel = Instance.new("Folder"); channel.Name = "LumenJourney"; channel.Parent = Storage
local get = Instance.new("RemoteFunction"); get.Name = "Request"; get.Parent = channel
local changed = Instance.new("RemoteEvent"); changed.Name = "Changed"; changed.Parent = channel
local profiles = {}
local Profile
if not localPlay then
    local module = script.Parent:FindFirstChild("Profile")
    if module and module:IsA("ModuleScript") then Profile = require(module) end
end
local beaconById = {}
for _, spec in ipairs(World.beacons) do beaconById[spec.id] = spec end

local function view(player)
    local entry = profiles[player]
    if not entry then return { ready = false, save = "loading", message = "Opening your journey…" } end
    local out = State.view(entry.state)
    out.ready, out.save, out.message = entry.ready, entry.save, entry.message
    out.totalShards = State.SHARD_COUNT
    return out
end

local function publish(player, message, kind)
    if player.Parent ~= Players then return end
    changed:FireClient(player, { state = view(player), message = message, kind = kind or "info" })
end

local function checkpointPosition(value)
    local spec = beaconById[value.checkpoint]
    return spec and spec.spawn or World.spawn
end

local function spawnAtCheckpoint(player, character)
    local root = character:WaitForChild("HumanoidRootPart", 8)
    local humanoid = character:WaitForChild("Humanoid", 8)
    if not root or not humanoid or player.Character ~= character then return end
    local entry = profiles[player]
    -- `profiles[player]` exists BEFORE Profile.load yields, so existence is not readiness. Using the
    -- temporary State.new() here sends a returning player to harbour before their saved checkpoint
    -- has even arrived. CharacterAdded may fire while load is in flight; that callback simply exits,
    -- and joined() schedules the CURRENT character once a valid profile becomes ready.
    if not entry or not entry.ready or player.Character ~= character then return end
    character:PivotTo(CFrame.new(checkpointPosition(entry.state)) * CFrame.Angles(0, math.pi, 0))
    humanoid.WalkSpeed = 18
    humanoid.JumpPower = 45
end

local function joined(player)
    if profiles[player] then return end
    local entry = { state = State.new(), ready = false, busy = false, last = -math.huge,
        save = "loading", message = "Opening your journey…" }
    profiles[player] = entry
    player.CharacterAdded:Connect(function(character) spawnAtCheckpoint(player, character) end)
    if localPlay then
        entry.ready, entry.save = true, "session"
        entry.message = "Local play · progress lasts until Studio stops"
    elseif not Profile then
        entry.save, entry.message = "unavailable", "Saving is not connected. Your saved journey has not been replaced."
    else
        local ok, data = pcall(Profile.load, player)
        if player.Parent ~= Players or profiles[player] ~= entry then
            if ok then Profile.release(player) end
            return
        end
        if not ok or not data then
            entry.save, entry.message = "unavailable", "Your journey could not be loaded. Rejoin to retry; no progress was overwritten."
        else
            local previous = data.lumen == nil and State.new() or State.read(data.lumen)
            if not previous then
                entry.save, entry.message = "unavailable", "Saved journey needs recovery. Progression is paused to keep it safe."
            else
                entry.state, entry.ready, entry.save = previous, true, "saved"
                entry.message = "Journey loaded"
            end
        end
    end
    -- A character can already exist before durable loading finishes, and CharacterAdded may also
    -- have fired while the load was yielding. Only position it once this exact entry is ready; use
    -- the CURRENT character so a respawn that happened during load receives the saved checkpoint.
    if entry.ready and profiles[player] == entry and player.Parent == Players and player.Character then
        task.spawn(spawnAtCheckpoint, player, player.Character)
    end
    publish(player)
end

local function nearby(player, target)
    local character = player.Character
    local root = character and character:FindFirstChild("HumanoidRootPart")
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    if not root or not humanoid or humanoid.Health <= 0 or not target:IsDescendantOf(world) then return false end
    local distance = (root.Position - target.Position).Magnitude
    return distance == distance and distance <= 14
end

local function mutate(player, target, operation, id)
    local entry = profiles[player]
    if not entry or not entry.ready then publish(player, "Wait until your journey has loaded", "error"); return end
    if entry.busy or os.clock() - entry.last < 0.18 then return end
    if not nearby(player, target) then publish(player, "Move closer to interact", "error"); return end
    entry.last = os.clock()
    -- Operate on a defensive copy. Failed durable writes must never become a displayed reward.
    local candidate = State.read(entry.state)
    local accepted, message = operation(candidate, id)
    if not accepted then publish(player, message, "error"); return end
    entry.busy = true
    if not localPlay then
        local data = Profile.get(player)
        if not data then
            entry.ready, entry.save, entry.message = false, "unavailable", "The save session ended. Rejoin before continuing."
            entry.busy = false; publish(player, entry.message, "error"); return
        end
        local nextData = table.clone(data); nextData.lumen = candidate
        entry.save = "saving"; publish(player)
        local ok, committed = pcall(Profile.commit, player, nextData)
        if not ok or committed ~= true then
            -- Profile.commit returns false for both a temporary DataStore failure and for LOST SAVE
            -- AUTHORITY. The Profile contract makes that distinction observable through get(): a
            -- lost session disables get immediately, while a transient failure keeps the old live
            -- table available for a safe replay. Do not invite the user to retry a session that can
            -- no longer save anything.
            if Profile.get(player) == nil then
                entry.ready, entry.save, entry.message = false, "unavailable", "The save session ended. Rejoin before continuing."
            else
                entry.save, entry.message = "retry", "Not saved. Try the same interaction again; nothing was charged."
            end
            entry.busy = false
            publish(player, entry.message, "error"); return
        end
    end
    if profiles[player] ~= entry then return end
    entry.state, entry.busy = candidate, false
    entry.save = localPlay and "session" or "saved"
    entry.message = localPlay and "Local play · progress lasts until Studio stops" or "Journey saved"
    publish(player, message, candidate.finished and "complete" or "success")
end

for _, target in ipairs(world.Targets:GetChildren()) do
    local id = target:GetAttribute("CollectibleId")
    if id then
        target.Collect.Triggered:Connect(function(player) mutate(player, target, State.collect, id) end)
    elseif target.Name == "LighthouseDoor" then
        target.Finish.Triggered:Connect(function(player) mutate(player, target, State.finish) end)
    end
end
for id in pairs(beaconById) do
    local core = world.Beacons[id].Core
    core.Restore.Triggered:Connect(function(player) mutate(player, core, State.light, id) end)
end

get.OnServerInvoke = function(player, action)
    local entry = profiles[player]
    if action == "state" then return view(player) end
    if action ~= "return" then return { accepted = false, message = "Unknown journey action" } end
    if not entry or not entry.ready or entry.busy then return { accepted = false, message = "Your journey is not ready" } end
    if os.clock() - entry.last < 2 then return { accepted = false, message = "Wait a moment before returning" } end
    local character = player.Character
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    if not humanoid or humanoid.Health <= 0 then return { accepted = false, message = "Your character is returning…" } end
    entry.last = os.clock()
    character:PivotTo(CFrame.new(checkpointPosition(entry.state)))
    publish(player, "Returned to your last wind beacon", "info")
    return { accepted = true, state = view(player) }
end

Players.PlayerAdded:Connect(joined)
Players.PlayerRemoving:Connect(function(player) profiles[player] = nil end)
for _, player in ipairs(Players:GetPlayers()) do task.spawn(joined, player) end

-- The sea is not traversable; falling returns a player through the normal character lifecycle.
local elapsed = 0
RunService.Heartbeat:Connect(function(delta)
    elapsed += delta
    if elapsed < 0.3 then return end
    elapsed = 0
    for player in pairs(profiles) do
        local character = player.Character
        local root = character and character:FindFirstChild("HumanoidRootPart")
        local humanoid = character and character:FindFirstChildOfClass("Humanoid")
        if root and humanoid and root.Position.Y < -14 and humanoid.Health > 0 then humanoid.Health = 0 end
    end
end)

print("LUMEN_JOURNEY_READY", world:GetAttribute("AuthoredPartCount"), localPlay and "session-only" or "durable-profile-required")
