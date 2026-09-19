--!strict
-- First-party Lumen Isles gameplay contract. No engine, networking or billing dependencies.
local State = {}
State.BEACON_COST = 4
State.BEACONS = { orchard = true, tide = true, summit = true }
State.SHARD_COUNT = 18

local function count(record)
    local total = 0
    for _, value in pairs(record) do if value == true then total += 1 end end
    return total
end

function State.new()
    return { schema = 1, shards = {}, beacons = {}, finished = false, checkpoint = "harbour" }
end

function State.read(raw)
    if type(raw) ~= "table" or raw.schema ~= 1 or type(raw.shards) ~= "table" or type(raw.beacons) ~= "table" then
        return nil
    end
    local value = State.new()
    for key, present in pairs(raw.shards) do
        if type(key) ~= "string" or not string.match(key, "^shard_%d+$") or present ~= true then return nil end
        local index = tonumber(string.match(key, "%d+$"))
        if not index or index < 1 or index > State.SHARD_COUNT or key ~= "shard_" .. index then return nil end
        value.shards[key] = true
    end
    for key, present in pairs(raw.beacons) do
        if not State.BEACONS[key] or present ~= true then return nil end
        value.beacons[key] = true
    end
    if count(value.beacons) * State.BEACON_COST > count(value.shards) then return nil end
    if type(raw.finished) ~= "boolean" or (raw.finished and count(value.beacons) ~= 3) then return nil end
    if raw.checkpoint ~= "harbour" and not value.beacons[raw.checkpoint] then return nil end
    value.finished, value.checkpoint = raw.finished, raw.checkpoint
    return value
end

function State.view(value)
    local shards, beacons = {}, {}
    for key in pairs(value.shards) do shards[key] = true end
    for key in pairs(value.beacons) do beacons[key] = true end
    return {
        schema = 1, shards = shards, beacons = beacons,
        collected = count(shards), lit = count(beacons),
        available = count(shards) - count(beacons) * State.BEACON_COST,
        finished = value.finished, checkpoint = value.checkpoint,
    }
end

function State.collect(value, id)
    if type(id) ~= "string" then return false, "Unknown light shard" end
    local index = tonumber(string.match(id, "^shard_(%d+)$"))
    if not index or index < 1 or index > State.SHARD_COUNT or id ~= "shard_" .. index then
        return false, "Unknown light shard"
    end
    if value.shards[id] then return false, "You already found this shard" end
    value.shards[id] = true
    return true, "Light shard found"
end

function State.light(value, id)
    if not State.BEACONS[id] then return false, "Unknown wind beacon" end
    if value.beacons[id] then return false, "This beacon is already alight" end
    if State.view(value).available < State.BEACON_COST then return false, "Find four light shards to restore this beacon" end
    value.beacons[id], value.checkpoint = true, id
    return true, "Wind beacon restored"
end

function State.finish(value)
    if value.finished then return false, "The lighthouse is already shining" end
    if count(value.beacons) ~= 3 then return false, "Restore all three wind beacons first" end
    value.finished = true
    return true, "You brought the light home"
end

return State
